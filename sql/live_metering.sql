-- ============================================================
--  EXTENDED by sql/plan_lineup.sql (2026-11-19): viewer per-minute billing
--  and the 1.50 creator rate below still stand, but the host is no longer
--  free — going on air now costs gliits_config.live_host_fee_gliits tokens,
--  taken once per session. Run plan_lineup.sql after this one.
-- ============================================================
-- ============================================================
--  Live sessions bill like gliims, and a creator is paid exactly
--  1.50 tokens a minute — sql/live_metering.sql
--
--  WHY THIS EXISTS
--  Two decisions from the owner, one script:
--
--    1. "bill live sessions and gliims at the same price of tokens per
--       minute, set/adjustable in the config tab by the admin"
--       Live was unmetered since 2026-11-06 (sql/live_billing.sql became
--       dead code, and the studio stopped sending a heartbeat on
--       2026-11-18). This puts Live back on the meter, using the ONE
--       existing config key — gliits_config.per_minute_rate_gliits — so a
--       gliim and a live session can never drift apart in price and the
--       admin's Config tab keeps being the only place the price lives.
--
--    2. "the rate is 1.5 token per minute earned from gliims and live
--       sessions"
--       gliits_config.creator_rate_per_minute already reads 1.50, but it
--       could never be paid: profiles.wallet_balance was an INTEGER column,
--       so every 1.50 credit round-tripped through Postgres became 2 and
--       creators were overpaid by a third on every minute. Widening the
--       column to numeric(12,2) is what makes the number the admin typed
--       the number a creator receives. It also makes sub-token pricing
--       (0.5/min) usable for the first time.
--
--  WHAT CHANGES IN THE HEARTBEAT
--    * It can now be told about a live session: p_session_id, alongside
--      p_post_id. The old one-argument signature is dropped first, so
--      PostgREST can never resolve the call ambiguously.
--    * One heartbeat bills one minute of ONE thing. A session that is on
--      air wins over a post because the host is broadcasting now.
--    * Nothing open = nothing charged. This rule used to exist only in the
--      browser, which is how 1,422 of the 1,947 tokens ever charged (73%)
--      were billed for empty screens.
--    * A target that no longer exists (session ended, post taken down) is
--      not billable either, so a stale tab stops charging.
--    * The host is not charged for running their own session, and nobody is
--      credited for their own content — unchanged, restated.
--    * An EXPIRED monthly/yearly plan now falls back to metered use instead
--      of raising NO_ACTIVE_PLAN. A member with a full wallet who simply let
--      a renewal lapse used to be locked out of the whole platform until
--      they re-subscribed; now they pay per minute like anyone else.
--    * Only minutes that moved money are recorded, so the earnings report
--      counts real activity instead of heartbeat noise.
--
--  JOINING A SESSION REQUIRES A WALLET
--  gliits_live_entry_check() is the one place that answers "may this member
--  be in this room". It refuses a member whose wallet cannot pay for the
--  first minute, exempts the host, and exempts a live paid plan. The server
--  calls it before anyone reaches the studio, so a refreshed tab, a join
--  link and a hand-written API call all meet the same answer.
--
--  IDEMPOTENT — safe to run twice. Run it once, then paste the SELF CHECK
--  at the bottom; every row must read PASS.
-- ============================================================


-- ------------------------------------------------------------
-- 1. A wallet that can hold the fraction a creator earned.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'wallet_balance'
      and data_type <> 'numeric'
  ) then
    alter table public.profiles
      alter column wallet_balance type numeric(12, 2)
      using wallet_balance::numeric(12, 2);
  end if;
end $$;

-- 1b. Nine other functions read that column into an INTEGER variable. Left
--     alone, Postgres silently rounds every fraction they touch: a top-up
--     receipt, a withdrawal affordability check, a transfer, a support
--     refund. Widening the column without widening them would move the
--     rounding from the creator's credit into the member's money, so both
--     halves have to land in the same run.
--
--     Each definition is rewritten in place — read back, one type swapped,
--     re-created — so nobody has to paste a body and no grant is reset.
--     "\y" is the Postgres word boundary; "\b" is not, and would match
--     nothing at all, which is how a rewrite like this goes unnoticed.
--     So a rewrite that finds neither its integer line nor an already-widened
--     one stops the run instead of quietly changing nothing.
do $$
declare
  v_src text;
  v_new text;
  r record;
begin
  for r in
    select * from (values
      ('credit_wallet_topup',         '(v_balance)\s+integer',       '\1 numeric(12, 2)', '(v_balance)\s+numeric'),
      ('request_withdrawal',          '(v_balance)\s+integer',       '\1 numeric(12, 2)', '(v_balance)\s+numeric'),
      ('cancel_withdrawal',           '(v_after)\s+integer',         '\1 numeric(12, 2)', '(v_after)\s+numeric'),
      ('settle_withdrawal',           '(v_after)\s+integer',         '\1 numeric(12, 2)', '(v_after)\s+numeric'),
      ('registrar_reject_withdrawal', '(v_after)\s+integer',         '\1 numeric(12, 2)', '(v_after)\s+numeric'),
      ('purchase_library_item',       '(v_wallet)\s+integer',        '\1 numeric(12, 2)', '(v_wallet)\s+numeric'),
      ('purchase_subscription',       '(v_balance)\s+int\y',         '\1 numeric(12, 2)', '(v_balance)\s+numeric'),
      ('transfer_to_user',            '(v_balance)\s+int\y',         '\1 numeric(12, 2)', '(v_balance)\s+numeric'),
      ('deduct_wallet',               '(current_balance)\s+integer', '\1 numeric(12, 2)', '(current_balance)\s+numeric')
    ) as t(fn, pat, rep, widpat)
  loop
    select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = r.fn;

    if v_src is null then
      raise exception 'LIVE METERING: public.% is missing from this database — check the script against the live schema before running it.', r.fn;
    end if;

    if v_src ~ r.widpat and v_src !~ r.pat then
      continue;
    end if;

    v_new := regexp_replace(v_src, r.pat, r.rep, 'g');

    if v_new = v_src then
      raise exception 'LIVE METERING: public.% does not declare "%" — this script cannot widen it. Check the function by hand.', r.fn, r.pat;
    end if;

    execute v_new;
  end loop;
end $$;


-- ------------------------------------------------------------
-- 2. Usage rows must be able to point at a session, or the 24h
--    cap and the earnings report have nothing to group by.
-- ------------------------------------------------------------
alter table public.gliits_usage
  add column if not exists session_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gliits_usage'::regclass
      and conname = 'gliits_usage_session_id_fkey'
  ) then
    alter table public.gliits_usage
      add constraint gliits_usage_session_id_fkey
      foreign key (session_id)
      references public.live_requests(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_gliits_usage_session
  on public.gliits_usage (user_id, session_id, minute_at)
  where session_id is not null;


-- ------------------------------------------------------------
-- 3. The meter itself.
-- ------------------------------------------------------------
drop function if exists public.gliits_heartbeat(uuid);
drop function if exists public.gliits_heartbeat(uuid, uuid);

create or replace function public.gliits_heartbeat(
  p_post_id uuid default null,
  p_session_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_rate numeric;
  v_creator_rate numeric;
  v_cap numeric;
  v_plan_type text;
  v_plan_expires timestamptz;
  v_metered boolean;
  v_balance numeric;
  v_owner uuid;
  v_target text := 'none';
  v_earned numeric;
  v_charge numeric := 0;
  v_credit numeric := 0;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select c.per_minute_rate_gliits,
         c.creator_rate_per_minute,
         c.creator_cap_per_post_session::numeric
    into v_rate, v_creator_rate, v_cap
  from public.gliits_config c
  where c.id = 1;

  if v_rate is null then
    raise exception 'NO_CONFIG';
  end if;

  -- What is actually being consumed this minute. Live first: the host is
  -- broadcasting now, so the room outranks a page that is merely open.
  -- A room with no host row is not billable either — there is nobody to pay.
  if p_session_id is not null then
    select lr.user_id into v_owner
    from public.live_requests lr
    where lr.id = p_session_id
      and lr.status = 'active'
      and lr.user_id is not null;

    if found then
      v_target := 'session';
    end if;
  end if;

  if v_target = 'none' and p_post_id is not null then
    select f.user_id into v_owner
    from public.feed_gliims f
    where f.id = p_post_id
      and f.deleted_at is null;

    if found then
      v_target := 'post';
    end if;
  end if;

  -- Nothing on the meter. Not an error, not a charge, not a usage row —
  -- just an idle minute, which is what the browser has always assumed.
  if v_target = 'none' then
    return jsonb_build_object(
      'balance', (select coalesce(wallet_balance, 0) from public.profiles where id = v_user),
      'charged', 0,
      'creator_credited', 0,
      'target', 'none'
    );
  end if;

  select p.plan_type, p.expires_at
    into v_plan_type, v_plan_expires
  from public.gliits_plans p
  where p.user_id = v_user;

  -- Metered = Pay n' Go, no plan row at all, or a paid plan that lapsed.
  v_metered := v_plan_type is null
            or v_plan_type = 'payngo'
            or (v_plan_expires is not null and v_plan_expires < now());

  select coalesce(pr.wallet_balance, 0) into v_balance
  from public.profiles pr
  where pr.id = v_user;

  -- Running your own session or reading your own gliim is not a purchase.
  if v_owner <> v_user then
    if v_metered then
      if v_balance < v_rate then
        raise exception 'INSUFFICIENT_BALANCE';
      end if;
      v_charge := v_rate;
    end if;

    if v_creator_rate > 0 then
      if v_target = 'session' then
        select coalesce(sum(u.creator_credited), 0) into v_earned
        from public.gliits_usage u
        where u.user_id = v_user
          and u.session_id = p_session_id
          and u.minute_at >= now() - interval '24 hours';
      else
        select coalesce(sum(u.creator_credited), 0) into v_earned
        from public.gliits_usage u
        where u.user_id = v_user
          and u.post_id = p_post_id
          and u.minute_at >= now() - interval '24 hours';
      end if;

      if v_earned < v_cap then
        v_credit := least(v_creator_rate, v_cap - v_earned);

        update public.profiles
        set wallet_balance = wallet_balance + v_credit
        where id = v_owner;
      end if;
    end if;

    if v_charge > 0 then
      update public.profiles
      set wallet_balance = wallet_balance - v_charge
      where id = v_user;
    end if;

    if v_charge > 0 or v_credit > 0 then
      insert into public.gliits_usage (user_id, post_id, session_id, gliits_charged, creator_credited)
      values (v_user,
              case when v_target = 'post' then p_post_id end,
              case when v_target = 'session' then p_session_id end,
              v_charge,
              v_credit);
    end if;
  end if;

  return jsonb_build_object(
    'balance', v_balance - v_charge,
    'charged', v_charge,
    'creator_credited', v_credit,
    'target', v_target,
    'metered', v_metered
  );
end;
$$;

-- Money moves in here, so it is not a public endpoint: no anon, no PUBLIC.
revoke execute on function public.gliits_heartbeat(uuid, uuid) from public, anon;
grant execute on function public.gliits_heartbeat(uuid, uuid) to authenticated, service_role;


-- ------------------------------------------------------------
-- 4. May this member be in this room?
-- ------------------------------------------------------------
create or replace function public.gliits_live_entry_check(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_host uuid;
  v_status text;
  v_rate numeric;
  v_balance numeric;
  v_plan_type text;
  v_plan_expires timestamptz;
  v_metered boolean;
  v_allowed boolean;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select lr.user_id, lr.status into v_host, v_status
  from public.live_requests lr
  where lr.id = p_session_id;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'SESSION_NOT_FOUND');
  end if;

  if v_status <> 'active' then
    return jsonb_build_object(
      'allowed', false,
      'reason', coalesce(upper(v_status), 'UNKNOWN'),
      'is_host', (v_host = v_user)
    );
  end if;

  if v_host = v_user then
    return jsonb_build_object('allowed', true, 'reason', 'host', 'is_host', true);
  end if;

  select c.per_minute_rate_gliits into v_rate
  from public.gliits_config c
  where c.id = 1;

  select coalesce(pr.wallet_balance, 0) into v_balance
  from public.profiles pr
  where pr.id = v_user;

  select p.plan_type, p.expires_at into v_plan_type, v_plan_expires
  from public.gliits_plans p
  where p.user_id = v_user;

  v_metered := v_plan_type is null
            or v_plan_type = 'payngo'
            or (v_plan_expires is not null and v_plan_expires < now());

  v_allowed := (not v_metered) or (v_balance >= coalesce(v_rate, 0));

  return jsonb_build_object(
    'allowed', v_allowed,
    'reason', case when v_allowed then 'ok' else 'INSUFFICIENT_BALANCE' end,
    'is_host', false,
    'metered', v_metered,
    'rate', v_rate,
    'balance', v_balance
  );
end;
$$;

revoke execute on function public.gliits_live_entry_check(uuid) from public, anon;
grant execute on function public.gliits_live_entry_check(uuid) to authenticated, service_role;


-- ------------------------------------------------------------
-- 5. Earnings must show a host what their sessions paid, not only
--    what their gliims paid. Same payload keys as before, plus a
--    "kind" on each top row so a screen can label it.
-- ------------------------------------------------------------
create or replace function public.gliits_earnings()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid;
  v_total_gliits numeric;
  v_total_minutes bigint;
  v_earned_30d numeric;
  v_top_posts jsonb;
  v_total_gp numeric;
  v_support_received numeric;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select coalesce(sum(u.creator_credited), 0), count(*)
    into v_total_gliits, v_total_minutes
  from public.gliits_usage u
  left join public.feed_gliims f on f.id = u.post_id
  left join public.live_requests lr on lr.id = u.session_id
  where f.user_id = v_user or lr.user_id = v_user;

  select coalesce(sum(u.creator_credited), 0)
    into v_earned_30d
  from public.gliits_usage u
  left join public.feed_gliims f on f.id = u.post_id
  left join public.live_requests lr on lr.id = u.session_id
  where (f.user_id = v_user or lr.user_id = v_user)
    and u.minute_at >= now() - interval '30 days';

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'post_id', t.gliim_id,
               'kind', t.kind,
               'title', t.title,
               'minutes', t.minutes,
               'earned', t.earned
             ) order by t.earned desc
           ),
           '[]'::jsonb
         )
    into v_top_posts
  from (
    select coalesce(u.post_id, u.session_id) as gliim_id,
           max(coalesce(nullif(f.title, ''), nullif(lr.title, ''),
                        left(nullif(f.description, ''), 80),
                        left(nullif(lr.description, ''), 80))) as title,
           max(case when u.session_id is not null then 'session' else 'gliim' end) as kind,
           count(*) as minutes,
           coalesce(sum(u.creator_credited), 0) as earned
    from public.gliits_usage u
    left join public.feed_gliims f on f.id = u.post_id
    left join public.live_requests lr on lr.id = u.session_id
    where f.user_id = v_user or lr.user_id = v_user
    group by 1
    order by earned desc
    limit 10
  ) t;

  select coalesce(sum(points), 0)
    into v_total_gp
  from public.transactions
  where user_id = v_user
    and points > 0;

  select coalesce(sum(amount), 0)
    into v_support_received
  from public.transactions
  where user_id = v_user
    and type in ('support', 'live_support')
    and amount > 0;

  return jsonb_build_object(
    'total_gliits', v_total_gliits,
    'total_minutes', v_total_minutes,
    'earned_30d', v_earned_30d,
    'top_posts', v_top_posts,
    'total_gp', v_total_gp,
    'support_received', v_support_received
  );
end;
$$;

revoke execute on function public.gliits_earnings() from public, anon;
grant execute on function public.gliits_earnings() to authenticated;


-- ============================================================
-- SELF CHECK — paste from the first "with" to the last line and run it.
-- Nothing to edit. Every row must read PASS.
-- ============================================================
with t(check_name, actual, expected) as (
  select 'wallet holds fractions',
         (select c.data_type from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = 'profiles'
             and c.column_name = 'wallet_balance'),
         'numeric'
  union all
  select 'wallet scale is 2 places',
         (select c.numeric_scale::text from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = 'profiles'
             and c.column_name = 'wallet_balance'),
         '2'
  union all
  -- Widening the column rewrites this constraint's text from
  -- "wallet_balance >= 0" to "wallet_balance >= (0)::numeric", so a
  -- substring test written for the integer form reports FAIL against a
  -- wallet that is still perfectly protected. Match both renderings.
  select 'wallet still cannot go negative',
         (select count(*)::text from pg_constraint
           where conrelid = 'public.profiles'::regclass
             and contype = 'c'
             and pg_get_constraintdef(oid) ~ 'wallet_balance\s*>=\s*\(?\s*0'),
         '1'
  union all
  select 'no money function still rounds the wallet',
         (select count(*)::text from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('credit_wallet_topup','request_withdrawal','cancel_withdrawal',
                              'settle_withdrawal','registrar_reject_withdrawal',
                              'purchase_library_item','purchase_subscription',
                              'transfer_to_user','deduct_wallet')
            and p.prosrc ~ '(v_balance|v_after|v_wallet|current_balance)\s+int'),
         '0'
  union all
  select 'usage points at a session',
         (select c.data_type from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = 'gliits_usage'
             and c.column_name = 'session_id'),
         'uuid'
  union all
  select 'session usage cleans up on delete',
         (select k.confdeltype::text from pg_constraint k
           where k.conrelid = 'public.gliits_usage'::regclass
             and k.conname = 'gliits_usage_session_id_fkey'),
         'n'
  union all
  select 'cap lookup is indexed',
         (select count(*)::text from pg_indexes i
           where i.schemaname = 'public' and i.tablename = 'gliits_usage'
             and i.indexname = 'idx_gliits_usage_session'),
         '1'
  union all
  select 'heartbeat has one signature',
         (select count(*)::text from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'gliits_heartbeat'),
         '1'
  union all
  select 'heartbeat takes post and session',
         (select pg_get_function_identity_arguments(p.oid) from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'gliits_heartbeat'),
         'p_post_id uuid, p_session_id uuid'
  union all
  select 'heartbeat is definer-scoped',
         (select coalesce(nullif(p.proconfig::text, ''), '') from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'gliits_heartbeat'),
         '{search_path=public}'
  union all
  select 'heartbeat reaches members but not anon',
         (select case
                   when has_function_privilege('authenticated', 'public.gliits_heartbeat(uuid, uuid)', 'execute')
                    and not has_function_privilege('anon', 'public.gliits_heartbeat(uuid, uuid)', 'execute')
                   then 'yes' else 'no' end),
         'yes'
  union all
  select 'meter only charges an on-air session',
         (select case when pg_get_functiondef(p.oid) like '%lr.status = ''active''%'
                      then 'yes' else 'no' end
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'gliits_heartbeat'),
         'yes'
  union all
  select 'meter still charges an open gliim',
         (select case when pg_get_functiondef(p.oid) like '%v_target := ''post''%'
                      then 'yes' else 'no' end
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'gliits_heartbeat'),
         'yes'
  union all
  select 'entry check exists',
         (select count(*)::text from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'gliits_live_entry_check'
            and pg_get_function_identity_arguments(p.oid) = 'p_session_id uuid'),
         '1'
  union all
  select 'entry check reaches members but not anon',
         (select case
                   when has_function_privilege('authenticated', 'public.gliits_live_entry_check(uuid)', 'execute')
                    and not has_function_privilege('anon', 'public.gliits_live_entry_check(uuid)', 'execute')
                   then 'yes' else 'no' end),
         'yes'
  union all
  select 'earnings joins sessions',
         (select case when pg_get_functiondef(p.oid) like '%lr.user_id = v_user%'
                      then 'yes' else 'no' end
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'gliits_earnings'),
         'yes'
)
select case when t.actual = t.expected then 'PASS' else 'FAIL' end as result,
       t.check_name,
       t.actual,
       t.expected
from t
order by result desc, t.check_name;

-- What the meter costs and pays right now, in one line:
select
  per_minute_rate_gliits      as "tokens per minute, gliims and live",
  creator_rate_per_minute     as "tokens per minute, earned",
  creator_cap_per_post_session as "earned cap per member per gliim or session, 24h",
  idle_timeout_minutes        as "idle minutes before the meter pauses",
  case when creator_rate_per_minute < per_minute_rate_gliits
       then 'PASS' else 'CHECK — a creator earns more per minute than a member pays'
  end as "creator earns less than the charge"
from public.gliits_config
where id = 1;
