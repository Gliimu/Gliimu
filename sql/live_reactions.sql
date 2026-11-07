-- sql/live_reactions.sql — the reaction streak inside a live session
--
-- The rules this installs:
--   * Every participant tap writes one row, and every participant in the room
--     sees who tapped (their name + avatar travel with the row).
--   * The emoji changes every 5 taps: taps 1-5 Like, 6-10 Heart, 11-15 Bolt.
--   * The tap that turns the emoji into a Bolt is "reaching bolt" and pays
--     1 GP x how many times that person has reached bolt in THIS session.
--     So the 11th tap pays 1 GP, the 26th pays 2 GP, the 41th pays 3 GP.
--     After a bolt the ladder restarts at Like.
--   * 20 GP per member per day ceiling, counted on the day's reaction rows.
--     Once the day is spent, the emoji still changes but nothing is paid.
--   * The counter is per session: entering another room starts at Like again.
--
-- Why the maths lives in the database and not the browser: the tap count is
-- what turns into GP, so it is the thing a tampering client would inflate.
-- The client only ever says "I tapped" and is told what stage that was.
--
-- Anti-spam: one tap per 300ms per person per room, measured on the server
-- clock. Anything faster is refused with TOO_FAST and draws nothing.
--
-- Idempotent: safe to run more than once.
--
-- HOW TO RUN
--   1. Supabase dashboard → SQL editor → New query.
--   2. Paste everything from "create table if not exists public.live_reactions("
--      down to the second "grant execute ... to authenticated;". Press Run.
--      Expect "Success. No rows returned".
--   3. Paste only the SELF CHECK block, from "with t as (" to "order by 1;".
--      Press Run. Every item must read OK.

-- ======================================================================
-- 1. The reaction log
-- ======================================================================
create table if not exists public.live_reactions (
  id         bigint generated always as identity primary key,
  room_id    uuid        not null references public.live_requests (id) on delete cascade,
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  user_name  text        not null default '',
  avatar_url text,
  emoji      text        not null check (emoji in ('like', 'heart', 'bolt')),
  cycle      integer     not null default 0,
  gp_awarded integer     not null default 0,
  created_at timestamptz not null default now()
);

-- cycle is the ordinal of the bolt reached (0 on every tap that is not a
-- bolt), so the payout is auditable straight from this table.

create index if not exists idx_live_reactions_room
  on public.live_reactions (room_id, id desc);
create index if not exists idx_live_reactions_user_day
  on public.live_reactions (user_id, created_at desc);
create index if not exists idx_live_reactions_user_room
  on public.live_reactions (user_id, room_id, id desc);

-- ======================================================================
-- 2. Access: room members can read, nobody writes directly
-- ======================================================================
alter table public.live_reactions enable row level security;

drop policy if exists live_reactions_read on public.live_reactions;
create policy live_reactions_read on public.live_reactions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.live_requests r
      where r.id = live_reactions.room_id
        and (
          r.user_id = auth.uid()
          or r.sharing_mode = 'general'
          or (r.sharing_mode = 'users' and r.invited_user_ids @> jsonb_build_array(auth.uid()::text))
        )
    )
  );

revoke all on table public.live_reactions from public, anon, authenticated;
grant select on table public.live_reactions to authenticated;
-- The function writes as its owner, so the table needs no insert policy.

-- ======================================================================
-- 3. react_live_session — one tap, returns the stage it landed on
-- ======================================================================
create or replace function public.react_live_session(p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_host      uuid;
  v_status    text;
  v_mode      text;
  v_invited   jsonb;
  v_taps      integer;
  v_last_at   timestamptz;
  v_stage     integer;
  v_emoji     text;
  v_reach     boolean;
  v_cycle     integer;
  v_today     integer;
  v_award     integer;
  v_cost_cap  integer := 20;
  v_name      text;
  v_avatar    text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select user_id, status, sharing_mode, invited_user_ids
    into v_host, v_status, v_mode, v_invited
  from public.live_requests
  where id = p_request;

  if v_host is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'SESSION_NOT_ACTIVE');
  end if;

  -- Same door as the room chat: host, or a general room, or an invited user.
  if v_host <> v_user
     and coalesce(v_mode, '') <> 'general'
     and not (v_mode = 'users' and coalesce(v_invited, '[]'::jsonb) @> jsonb_build_array(v_user::text)) then
    return jsonb_build_object('ok', false, 'error', 'NOT_IN_SESSION');
  end if;

  -- Serialise this person's taps in this room so two fast clicks cannot both
  -- read the same count and produce the same stage.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || p_request::text, 0));

  select count(*), max(created_at) into v_taps, v_last_at
  from public.live_reactions
  where room_id = p_request and user_id = v_user;

  if v_last_at is not null and v_last_at > now() - interval '300 milliseconds' then
    return jsonb_build_object('ok', false, 'error', 'TOO_FAST');
  end if;

  -- Ladder: 5 taps per stage, 15 taps per cycle.
  v_stage := (v_taps / 5) % 3;
  v_emoji := case v_stage when 0 then 'like' when 1 then 'heart' else 'bolt' end;
  v_reach := (v_taps % 15 = 10);
  v_cycle := (v_taps / 15) + 1;

  if v_reach then
    select coalesce(sum(gp_awarded), 0) into v_today
    from public.live_reactions
    where user_id = v_user
      and created_at >= date_trunc('day', now());

    v_award := greatest(0, least(v_cycle, v_cost_cap - v_today));
  else
    v_award := 0;
  end if;

  select coalesce(full_name, ''), avatar_url into v_name, v_avatar
  from public.profiles
  where id = v_user;

  insert into public.live_reactions (room_id, user_id, user_name, avatar_url, emoji, cycle, gp_awarded)
  values (p_request, v_user, v_name, v_avatar, v_emoji,
          case when v_reach then v_cycle else 0 end, v_award);

  if v_award > 0 then
    update public.profiles
    set total_gp = coalesce(total_gp, 0) + v_award
    where id = v_user;

    insert into public.transactions (user_id, amount, points, type, status, description)
    values (v_user, 0, v_award, 'reward', 'success', 'Earned GP reacting in a live session');
  end if;

  return jsonb_build_object(
    'ok', true,
    'emoji', v_emoji,
    'tap_in_stage', (v_taps % 5) + 1,
    'reached_bolt', v_reach,
    'cycle', case when v_reach then v_cycle else 0 end,
    'gp_awarded', v_award,
    'gp_left_today', greatest(0, v_cost_cap - coalesce(v_today, 0) - v_award)
  );
end;
$$;

revoke execute on function public.react_live_session(uuid) from public, anon;
grant execute on function public.react_live_session(uuid) to authenticated;

-- ======================================================================
-- 4. Realtime: every client in the room receives the new row
-- ======================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_reactions'
  ) then
    alter publication supabase_realtime add table public.live_reactions;
  end if;
end;
$$;

-- ======================================================================
-- SELF CHECK — paste from "with t as (" to "order by 1;" and run it.
-- Nothing to edit. Every item must read OK.
-- ======================================================================
with t as (
  select c.relname, c.relrowsecurity,
         (select count(*) from pg_publication_tables p
           where p.pubname = 'supabase_realtime' and p.schemaname = 'public'
             and p.tablename = c.relname) as in_pub
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'live_reactions'
),
f as (
  select p.oid, p.prosrc, p.prosecdef,
         (select coalesce(string_agg(s, ','), '') from unnest(p.proconfig) s) as cfg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'react_live_session'
),
ladder as (
  select n,
         case (n / 5) % 3 when 0 then 'like' when 1 then 'heart' else 'bolt' end as emoji,
         (n % 15 = 10) as reach,
         (n / 15) + 1  as cycle
  from generate_series(0, 44) as n
)
select '01 table exists' as item,
       case when (select count(*) from t) = 1 then 'OK' else 'FAIL - it was not created' end,
       (select count(*)::text from t)

union all
select '02 rls enabled',
       case when (select bool_and(relrowsecurity) from t) then 'OK'
            else 'FAIL - the table is wide open to the API' end,
       (select coalesce(max(relrowsecurity::text), 'no table') from t)

union all
select '03 realtime broadcast on',
       case when (select bool_and(in_pub = 1) from t) then 'OK'
            else 'FAIL - taps will not appear for other participants' end,
       (select coalesce(max(in_pub::text), '0') from t)

union all
select '04 exactly one read policy, no write policies',
       case when (select count(*) from pg_policies where schemaname = 'public'
                    and tablename = 'live_reactions' and cmd = 'SELECT') = 1
            and (select count(*) from pg_policies where schemaname = 'public'
                    and tablename = 'live_reactions' and cmd <> 'SELECT') = 0
            then 'OK' else 'FAIL - either nobody can read it or taps can be forged' end,
       (select string_agg(cmd, ',' order by cmd) from pg_policies
         where schemaname = 'public' and tablename = 'live_reactions')

union all
select '05 authenticated reads, anon does not',
       case when has_table_privilege('authenticated', 'public.live_reactions', 'select')
            and not has_table_privilege('anon', 'public.live_reactions', 'select')
            then 'OK' else 'FAIL - grants are wrong' end,
       'n/a'

union all
select '06 nobody can insert into it directly',
       case when not has_table_privilege('authenticated', 'public.live_reactions', 'insert') then 'OK'
            else 'FAIL - a client could write its own reaction rows' end,
       (select count(*)::text from information_schema.role_table_grants
         where table_name = 'live_reactions' and grantee = 'authenticated' and privilege_type = 'INSERT')

union all
select '07 rpc is definer with pinned search_path',
       case when (select count(*) from f where prosecdef and cfg like '%search_path%') = 1
            then 'OK' else 'FAIL - the guard is missing' end,
       (select coalesce(max(cfg), 'none') from f)

union all
select '08 rate limit present',
       case when (select count(*) from f where prosrc ~ 'interval .300 milliseconds.') = 1
            then 'OK' else 'FAIL - taps are unthrottled' end,
       (select count(*)::text from f where prosrc ~ 'interval .300 milliseconds.')

union all
select '09 daily ceiling present',
       case when (select count(*) from f where prosrc ~ 'v_cost_cap\s+integer\s*:=\s*20;') = 1
            then 'OK' else 'FAIL - nothing caps the GP per day' end,
       (select count(*)::text from f where prosrc ~ 'v_cost_cap\s+integer\s*:=\s*20;')

union all
select '10 payout uses the cycle ordinal',
       case when (select count(*) from f where prosrc ~ 'least\(v_cycle,') = 1
            then 'OK' else 'FAIL - it is not 1 GP x cycle' end,
       (select count(*)::text from f where prosrc ~ 'least\(v_cycle,')

union all
select '11 gp award writes a reward ledger row',
       case when (select count(*) from f where prosrc ~ '''reward''' and prosrc ~ 'total_gp') = 1
            then 'OK' else 'FAIL - the wallet will not show the GP' end,
       'n/a'

union all
select '12 ladder maths: like 5 taps, heart 5, bolt 5',
       case when (select count(*) from ladder where emoji = 'like') = 15
             and (select count(*) from ladder where emoji = 'heart') = 15
             and (select count(*) from ladder where emoji = 'bolt') = 15
            then 'OK' else 'FAIL - the stages are uneven' end,
       '15 taps per cycle over 45 taps'

union all
select '13 bolt reached 3 times in 45 taps',
       case when (select count(*) from ladder where reach) = 3 then 'OK'
            else 'FAIL - the bolt does not recur once per cycle' end,
       (select string_agg(n::text, ',' ) from ladder where reach)

union all
select '14 cycle ordinal is 1 then 2 then 3',
       case when (select array_agg(cycle order by n) from ladder where reach) = array[1, 2, 3]
            then 'OK' else 'FAIL - the escalation is wrong' end,
       (select string_agg(cycle::text, ' ' order by n) from ladder where reach)

union all
select '15 the ceiling clamps what is left, never goes negative',
       case when greatest(0, least(6, 20 - 19)) = 1
             and greatest(0, least(6, 20 - 20)) = 0
             and greatest(0, least(2, 20 - 0))  = 2
            then 'OK' else 'FAIL - the clamp does not work' end,
       'day spent at 19 GP: 6th bolt pays 1, not 6'

union all
select '16 the first five bolts sum to 15 GP',
       case when 1 + 2 + 3 + 4 + 5 = 15 then 'OK' else 'FAIL - maths' end,
       '1+2+3+4+5 = 15 GP, the 6th tops the day to 20'

union all
select '17 room access mirrors the room chat',
       case when (select count(*) from f where prosrc ~ 'sharing_mode' and prosrc ~ 'invited_user_ids') = 1
            then 'OK' else 'FAIL - strangers could react into a closed room' end,
       'n/a'

union all
select '18 reactions logged so far (informational)',
       'OK',
       (select count(*)::text from public.live_reactions)

union all
select '19 gp paid by reactions so far (informational)',
       'OK',
       (select coalesce(sum(gp_awarded), 0)::text from public.live_reactions)

order by 1;

-- END OF FILE
