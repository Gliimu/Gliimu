-- ============================================================
-- STOP GP AND TOKENS BEING MINTED FROM THE BROWSER (run once)
-- ============================================================
-- Two live objects let a signed-in member create their own value, and neither
-- one is guarded:
--
--   1. public.add_gp(uuid, integer) — SECURITY DEFINER, owned by postgres, and
--      its body is two statements with NO permission check at all:
--        UPDATE profiles SET total_gp = total_gp + points_to_add WHERE id = target_user_id;
--        INSERT INTO transactions (...) ...;
--      Any member could call it with any target uuid and any number, so one
--      HTTP request minted unlimited GP for anyone. GP is what the contest,
--      cohort and referral boards rank on, so the boards were only as honest as
--      the last person who bothered to exploit this.
--      Verified live: grants = authenticated + service_role (no anon), the
--      search_path was NOT pinned, and it had two kinds of caller — the five
--      RPC lines in views/gliims.js, and public.bump_post_views(), which the
--      reader calls and which pays the post author 10 GP on a first view.
--      Section 4 moves that sixth caller onto the new payer; dropping add_gp
--      without it would break the view counter too.
--
--   2. public.gliits_gp_to_gliits() — converts floor(total_gp / 100) * 10 into
--      wallet tokens and is executable by every member, but no screen calls it.
--      It is a money path with no product decision behind it, and combined with
--      (1) it was an unlimited money loop: mint GP, convert to tokens.
--      (This one already had a pinned search_path and no anon grant.)
--
-- WHAT THIS SCRIPT DOES
--   NEW TABLE     public.gp_awards — one row per paid award. It is both the
--                 audit trail and the anti-replay key: unique
--                 (recipient, actor, action, post_id).
--   NEW FUNCTION  public.gp_pay(uuid, uuid, text, uuid, integer) — writes the
--                 award, the GP and the ledger row. NOT callable by members.
--   NEW FUNCTION  public.earn_gp(uuid) — the only member-facing door. It takes
--                 the id of an interaction row the caller just created, proves
--                 that row is theirs and fresh, looks the post author up in the
--                 database, and pays server-fixed amounts. A member can no
--                 longer name a recipient or an amount.
--   DELETED       public.add_gp(uuid, integer).
--   REWRITTEN     public.bump_post_views(uuid) — the reader's view counter paid
--                 the author 10 GP through add_gp, so it is moved onto gp_pay
--                 with action 'read'. Same rule as before: only a viewer's
--                 first ever view of that post pays, authors never pay for
--                 their own view, and the post_views uniqueness is untouched.
--   LOCKED DOWN   public.gliits_gp_to_gliits() loses member execute, so GP can
--                 not become tokens until you decide that feature should exist.
--
-- THE AMOUNTS (unchanged from what the app pays today — moved, not altered)
--   read     -> +10 to the post author, once per viewer
--   like     -> +3 to the post author
--   comment  -> +5 to the commenter, +4 to the post author
--   share    -> +5 to the sharer,   +5 to the post author
--   anything else (read_end, ask_me, ...) pays nothing.
--   Each is paid once per (recipient, actor, action, post), forever.
--
-- IDEMPOTENT: running it twice is safe. gp_awards is created only if missing,
-- both functions are replaced, and the grants are re-applied every run.
-- ============================================================
-- HOW TO RUN
--   1. Supabase SQL editor → paste this whole file → Run.
--   2. Every row of the SELF CHECK grid at the bottom must read OK.
--   3. Deploy the member app afterwards (views/gliims.js now calls earn_gp).
--      Until it deploys, GP from likes, comments and shares simply stops —
--      the old RPC is gone and fails closed rather than paying anything.
-- ============================================================


-- ============================================================
-- 1. THE AWARD LEDGER
-- ============================================================

create table if not exists public.gp_awards (
  id          bigint generated always as identity primary key,
  recipient   uuid        not null,
  actor       uuid        not null,
  action      text        not null,
  post_id     uuid        not null,
  points      integer     not null,
  awarded_at  timestamptz not null default now()
);

-- The anti-replay key. Added only when absent so re-runs do not fail.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.gp_awards'::regclass
       and conname  = 'gp_awards_recipient_actor_action_post_key'
  ) then
    alter table public.gp_awards
      add constraint gp_awards_recipient_actor_action_post_key
      unique (recipient, actor, action, post_id);
  end if;
end
$$;

-- Members never read or write this table. The definer functions below do, and
-- postgres holds BYPASSRLS, so RLS with no policies is exactly what we want.
alter table public.gp_awards enable row level security;

revoke all on public.gp_awards from public, anon, authenticated;
grant  select, insert on public.gp_awards to service_role;


-- ============================================================
-- 2. THE INTERNAL PAYER — members cannot call this
-- ============================================================

create or replace function public.gp_pay(
  p_to     uuid,
  p_actor  uuid,
  p_action text,
  p_post   uuid,
  p_points integer
)
 returns integer
 language plpgsql
 security definer
 set search_path = public
as $$
declare
  v_paid integer;
begin
  if p_to is null or p_points is null or p_points <= 0 then
    return 0;
  end if;

  insert into public.gp_awards (recipient, actor, action, post_id, points)
  values (p_to, p_actor, p_action, p_post, p_points)
  on conflict (recipient, actor, action, post_id) do nothing
  returning points into v_paid;

  if v_paid is null then
    return 0;                       -- already paid for this action, ever
  end if;

  update public.profiles
     set total_gp = coalesce(total_gp, 0) + v_paid
   where id = p_to;

  insert into public.transactions (user_id, amount, type, status, description, points)
  values (p_to, 0, 'reward', 'success', 'Earned GP from a ' || p_action, v_paid);

  return v_paid;
end
$$;


-- ============================================================
-- 3. THE MEMBER DOOR — proof-based, amounts fixed in the database
-- ============================================================

create or replace function public.earn_gp(p_interaction uuid)
 returns integer
 language plpgsql
 security definer
 set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_action text;
  v_post   uuid;
  v_author uuid;
  v_total  integer := 0;
begin
  if v_caller is null then
    raise exception 'earn_gp needs a signed-in member' using errcode = '42501';
  end if;

  -- The row is the proof: it has to exist, belong to the caller, name a post,
  -- and be fresh, so an old row cannot be replayed for a second award.
  select i.interaction_type, i.post_id, g.user_id
    into v_action, v_post, v_author
    from public.feed_interactions i
    join public.feed_gliims g on g.id = i.post_id
   where i.id = p_interaction
     and i.user_id = v_caller
     and i.created_at > now() - interval '10 minutes';

  if v_action is null then
    raise exception 'earn_gp: no fresh interaction to reward';
  end if;

  if v_action = 'like' then
    if v_author is distinct from v_caller then
      v_total := v_total + public.gp_pay(v_author, v_caller, v_action, v_post, 3);
    end if;

  elsif v_action = 'comment' then
    v_total := v_total + public.gp_pay(v_caller, v_caller, v_action, v_post, 5);
    if v_author is distinct from v_caller then
      v_total := v_total + public.gp_pay(v_author, v_caller, v_action, v_post, 4);
    end if;

  elsif v_action = 'share' then
    v_total := v_total + public.gp_pay(v_caller, v_caller, v_action, v_post, 5);
    if v_author is distinct from v_caller then
      v_total := v_total + public.gp_pay(v_author, v_caller, v_action, v_post, 5);
    end if;
  end if;

  return v_total;
end
$$;


-- ============================================================
-- 4. GRANTS, THE VIEW COUNTER, THEN REMOVE THE OPEN DOOR
-- ============================================================
-- gp_pay stays owner-only: it is called from earn_gp, which runs as postgres.
-- Revoke first so nothing is ever briefly member-executable.

revoke execute on function public.gp_pay(uuid, uuid, text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.gp_pay(uuid, uuid, text, uuid, integer)
  to service_role;

revoke execute on function public.earn_gp(uuid) from public, anon;
grant execute on function public.earn_gp(uuid) to authenticated, service_role;

-- This counter runs as postgres, so it may call the owner-only payer directly.
-- It is rewritten BEFORE the drop below, otherwise the reader's view count
-- breaks the moment add_gp disappears. Everything else about it is unchanged:
-- the post_views uniqueness insert, the views increment, the self-view skip.
create or replace function public.bump_post_views(p_post uuid)
 returns void
 language plpgsql
 security definer
 set search_path = public
as $$
declare
  v_viewer   uuid := auth.uid();
  v_author   uuid;
  v_inserted boolean;
begin
  if v_viewer is null then
    return;                              -- not authenticated
  end if;

  select user_id into v_author from public.feed_gliims where id = p_post;
  if v_author is null then
    return;                              -- post doesn't exist
  end if;

  if v_viewer = v_author then
    return;                              -- no GP for viewing your own gliim
  end if;

  begin
    insert into public.post_views (user_id, post_id, created_at)
    values (v_viewer, p_post, now());
    v_inserted := true;
  exception when unique_violation then
    v_inserted := false;                 -- already viewed
  end;

  if v_inserted then
    update public.feed_gliims
       set views = coalesce(views, 0) + 1
     where id = p_post;

    perform public.gp_pay(v_author, v_viewer, 'read', p_post, 10);
  end if;
end
$$;

revoke execute on function public.bump_post_views(uuid) from public, anon;
grant execute on function public.bump_post_views(uuid) to authenticated, service_role;

drop function if exists public.add_gp(uuid, integer);

-- GP cannot become wallet tokens through an RPC no screen calls.
revoke execute on function public.gliits_gp_to_gliits() from public, anon, authenticated;
grant  execute on function public.gliits_gp_to_gliits() to service_role;


-- ============================================================
-- 5. REFRESH THE API CACHE
-- ============================================================

notify pgrst, 'reload schema';


-- ============================================================
-- SELF CHECK — every row must read OK
-- ============================================================

select 1 as "#", 'add_gp(uuid,integer) is gone' as item,
       case when to_regprocedure('public.add_gp(uuid,integer)') is null
            then 'OK' else 'CHECK: still present' end as result
union all select 2, 'earn_gp(uuid) exists, exactly once',
       case when (select count(*) from pg_proc
                   where oid = 'public.earn_gp(uuid)'::regprocedure) = 1
            then 'OK' else 'CHECK: missing or overloaded' end
union all select 3, 'members can run earn_gp, anon cannot',
       case when has_function_privilege('authenticated', 'public.earn_gp(uuid)', 'execute')
                and not has_function_privilege('anon', 'public.earn_gp(uuid)', 'execute')
            then 'OK' else 'CHECK: grants wrong' end
union all select 4, 'members cannot run gp_pay at all',
       case when not has_function_privilege('authenticated', 'public.gp_pay(uuid,uuid,text,uuid,integer)', 'execute')
                and not has_function_privilege('anon', 'public.gp_pay(uuid,uuid,text,uuid,integer)', 'execute')
            then 'OK' else 'CHECK: still callable by a member' end
union all select 5, 'earn_gp and gp_pay are DEFINER with a pinned search_path',
       case when (select bool_and(p.prosecdef and p.proconfig @> array['search_path=public'])
                   from pg_proc p
                  where p.oid in ('public.earn_gp(uuid)'::regprocedure,
                                  'public.gp_pay(uuid,uuid,text,uuid,integer)'::regprocedure))
            then 'OK' else 'CHECK: attributes lost' end
union all select 6, 'the amounts live in the database, not the client',
       case when (select prosrc from pg_proc where oid = 'public.earn_gp(uuid)'::regprocedure)
                  like '%gp_pay(v_author, v_caller, v_action, v_post, 3)%'
                and (select prosrc from pg_proc where oid = 'public.earn_gp(uuid)'::regprocedure)
                  like '%gp_pay(v_caller, v_caller, v_action, v_post, 5)%'
                and (select prosrc from pg_proc where oid = 'public.earn_gp(uuid)'::regprocedure)
                  like '%gp_pay(v_author, v_caller, v_action, v_post, 4)%'
            then 'OK' else 'CHECK: award lines changed' end
union all select 7, 'earn_gp proves the caller owns the interaction row',
       case when (select prosrc from pg_proc where oid = 'public.earn_gp(uuid)'::regprocedure)
                  like '%i.user_id = v_caller%'
            then 'OK' else 'CHECK: ownership test missing' end
union all select 8, 'gp_awards exists, RLS on, one anti-replay key',
       case when to_regclass('public.gp_awards') is not null
                and (select relrowsecurity from pg_class where oid = 'public.gp_awards'::regclass)
                and (select count(*) from pg_constraint
                      where conrelid = 'public.gp_awards'::regclass and contype = 'u') = 1
            then 'OK' else 'CHECK: table or key wrong' end
union all select 9, 'no policy lets a member read or write gp_awards',
       case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'gp_awards') = 0
            then 'OK' else 'CHECK: a policy exists' end
union all select 10, 'gp_awards is not readable through the API',
       case when has_table_privilege('authenticated', 'public.gp_awards', 'select') = false
                and has_table_privilege('anon', 'public.gp_awards', 'select') = false
            then 'OK' else 'CHECK: table exposed' end
union all select 11, 'gliits_gp_to_gliits is closed to members',
       case when not has_function_privilege('authenticated', 'public.gliits_gp_to_gliits()', 'execute')
                and not has_function_privilege('anon', 'public.gliits_gp_to_gliits()', 'execute')
            then 'OK' else 'CHECK: still member-executable' end
union all select 12, 'no database function calls the dropped add_gp',
       case when (select count(*) from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public'
                     and p.prosrc ~ '(perform|select|call)[[:space:]]+(public\.)?add_gp[[:space:]]*\(') = 0
            then 'OK' else 'CHECK: a caller remains' end
union all select 13, 'bump_post_views still exists and is member-executable',
       case when to_regprocedure('public.bump_post_views(uuid)') is not null
                and has_function_privilege('authenticated', 'public.bump_post_views(uuid)', 'execute')
                and not has_function_privilege('anon', 'public.bump_post_views(uuid)', 'execute')
            then 'OK' else 'CHECK: view counter lost its door' end
union all select 14, 'the read award is paid through gp_pay, 10 GP to the author',
       case when (select prosrc from pg_proc
                   where oid = 'public.bump_post_views(uuid)'::regprocedure)
                  like '%gp_pay(v_author, v_viewer, ''read'', p_post, 10)%'
            then 'OK' else 'CHECK: read award line changed' end
union all select 15, 'bump_post_views is DEFINER, pinned, and still dedupes views',
       case when (select prosecdef and proconfig @> array['search_path=public'] from pg_proc
                   where oid = 'public.bump_post_views(uuid)'::regprocedure)
                and (select prosrc from pg_proc
                      where oid = 'public.bump_post_views(uuid)'::regprocedure)
                  like '%into public.post_views%'
            then 'OK' else 'CHECK: attributes or view dedupe lost' end
union all select 16, 'no member GP went negative',
       case when (select count(*) from public.profiles where coalesce(total_gp, 0) < 0) = 0
            then 'OK' else 'CHECK: negative GP present' end
union all select 17, 'the reward ledger still accepts the wallet page shape',
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'transactions'
                     and column_name in ('user_id', 'amount', 'type', 'status', 'description', 'points')) = 6
            then 'OK' else 'CHECK: transactions columns moved' end
order by "#";
