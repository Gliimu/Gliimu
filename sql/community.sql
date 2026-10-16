-- ============================================================
-- Gliimu: Community — contests, cohorts, events, news, leaderboard
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once (idempotent).
--
-- RUN ORDER: after sql/admin.sql (needs admin_has_role), sql/billing.sql
-- and sql/reader.sql (needs transactions + reading_progress), and after
-- the hub tables exist (posts, hub_interactions — legacy live tables).
--
-- WHAT THIS INSTALLS
--   Six tables, all locked down so NOBODY reads or writes them directly:
--   every read and write goes through a SECURITY DEFINER RPC. RLS is on
--   and the table grants are revoked from anon/authenticated, so PostgREST
--   can never expose a raw row. (operations.sql does the same for
--   site_settings.)
--
--     contests          — operations-authored. metric drives scoring:
--                         gp | reading | engagement | referrals.
--     contest_entries   — a member OPTS IN by joining. The leaderboard only
--                         ever ranks members who joined.
--     cohorts           — seat-capped groups ("first 9").
--     cohort_requests   — self-serve request; operations approves/rejects.
--     events            — display-only: date/time + venue (Online | Hall | Custom).
--     news              — operations-authored announcements.
--
--   Member RPCs (authenticated):
--     community_board()                       one call -> the whole page
--     contest_join(p_contest)                 opt into a contest
--     contest_leaderboard(p_contest, p_limit) top N of ONE contest
--     cohort_request(p_cohort)                ask for a seat
--     contest_score(p_contest, p_user)        the metric math (also used
--                                             internally by the board)
--
--   Operations RPCs (admin_has_role 'operations'; 'super' passes):
--     operations_contests / _save_contest / _delete_contest
--     operations_cohorts  / _save_cohort  / _delete_cohort
--     operations_cohort_requests / operations_review_cohort_request
--     operations_events   / _save_event   / _delete_event
--     operations_news     / _save_news    / _delete_news
--
-- HOW SCORING WORKS (auto-tracked, no manual points)
--   A contest has a window: starts_at .. coalesce(ends_at, now()). A
--   member's score is what they earned IN THAT WINDOW:
--     gp         = SUM of positive transactions.points (credits) in window
--     reading    = COUNT of reading_progress rows completed_at in window
--     engagement = COUNT of hub_interactions + COUNT of posts created in window
--     referrals  = 0  (referral tracking lands in Phase 3)
--   The leaderboard ranks the contest's ENTRIES by that score, top 7.
--
-- PRIVACY
--   The leaderboard is the ONE member-facing surface that shows other
--   members' full name + avatar + bio, and only for members who opted in
--   by joining. It NEVER selects profiles.username (locked in
--   sql/username_privacy_b.sql). These functions are SECURITY DEFINER so
--   they can read the grant-locked profile columns; they deliberately
--   leave username out of every jsonb_build_object.
-- ============================================================

select pg_advisory_xact_lock(hashtext('gliimu-community'));


-- ============================================================
-- 1. Tables
-- ============================================================

do $$ begin
  if to_regprocedure('public.admin_has_role(uuid,text)') is null then
    raise exception 'admin_has_role(uuid,text) is MISSING — run sql/admin.sql first.';
  end if;
  if to_regclass('public.reading_progress') is null then
    raise exception 'reading_progress is MISSING — run sql/reader.sql first.';
  end if;
end $$;

create table if not exists public.contests (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  metric      text not null default 'gp',
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  prize_text  text,
  is_featured boolean not null default false,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint contests_metric_check
    check (metric in ('gp','reading','engagement','referrals'))
);

create table if not exists public.contest_entries (
  contest_id uuid not null references public.contests(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (contest_id, user_id)
);

create table if not exists public.cohorts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  seats       integer not null default 9,
  starts_at   timestamptz,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.cohort_requests (
  id           uuid primary key default gen_random_uuid(),
  cohort_id    uuid not null references public.cohorts(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  constraint cohort_requests_status_check
    check (status in ('pending','approved','rejected')),
  unique (cohort_id, user_id)
);

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  starts_at   timestamptz not null default now(),
  venue_type  text not null default 'Online',
  venue_text  text,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint events_venue_check
    check (venue_type in ('Online','Hall','Custom'))
);

create table if not exists public.news (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text,
  is_published boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists contest_entries_user_idx  on public.contest_entries (user_id);
create index if not exists cohort_requests_cohort_idx on public.cohort_requests (cohort_id, status);


-- ============================================================
-- 2. Lockdown — RLS on, no direct table access for anon/authenticated.
--    The SECURITY DEFINER RPCs below (owned by a BYPASSRLS role) do all
--    the reading and writing.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array['contests','contest_entries','cohorts','cohort_requests','events','news']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;


-- ============================================================
-- 3. contest_score — the metric math for one member in one contest
-- ============================================================

create or replace function public.contest_score(p_contest uuid, p_user uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_metric text;
  v_from   timestamptz;
  v_to     timestamptz;
  v_score  integer := 0;
begin
  if p_contest is null or p_user is null then
    return 0;
  end if;

  select c.metric, c.starts_at, coalesce(c.ends_at, now())
    into v_metric, v_from, v_to
    from public.contests c
   where c.id = p_contest;

  if not found then
    return 0;
  end if;

  if v_metric = 'gp' then
    select coalesce(sum(t.points), 0)::integer into v_score
      from public.transactions t
     where t.user_id = p_user
       and t.points > 0
       and t.created_at >= v_from
       and t.created_at <= v_to;

  elsif v_metric = 'reading' then
    select count(*)::integer into v_score
      from public.reading_progress r
     where r.user_id = p_user
       and r.completed_at is not null
       and r.completed_at >= v_from
       and r.completed_at <= v_to;

  elsif v_metric = 'engagement' then
    select (
             (select count(*) from public.hub_interactions h
               where h.user_id = p_user
                 and h.created_at >= v_from and h.created_at <= v_to)
           + (select count(*) from public.posts p
               where p.user_id = p_user
                 and p.created_at >= v_from and p.created_at <= v_to)
           )::integer
      into v_score;

  else
    -- 'referrals' (and anything unknown): no tracking until Phase 3.
    v_score := 0;
  end if;

  return coalesce(v_score, 0);
end $$;


-- ============================================================
-- 4. contest_leaderboard — top N entries of ONE contest, by score
-- ============================================================

create or replace function public.contest_leaderboard(p_contest uuid, p_limit integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 7), 50));
begin
  if p_contest is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.rank)
      from (
        select row_number() over (order by s.score desc, e.joined_at asc) as rank,
               e.user_id,
               pr.full_name,
               pr.avatar_url,
               pr.bio,
               s.score
          from public.contest_entries e
          join lateral (select public.contest_score(p_contest, e.user_id) as score) s on true
          left join public.profiles pr on pr.id = e.user_id
         where e.contest_id = p_contest
         order by s.score desc, e.joined_at asc
         limit v_limit
      ) x
  ), '[]'::jsonb);
end $$;


-- ============================================================
-- 5. community_board — the single call the member Community page makes
-- ============================================================

create or replace function public.community_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid         uuid := auth.uid();
  v_contests  jsonb;
  v_cohorts   jsonb;
  v_events    jsonb;
  v_news      jsonb;
  v_lb_id     uuid;
  v_lb_title  text;
  v_lb_metric text;
  v_lb_rows   jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id',          c.id,
           'title',       c.title,
           'description', c.description,
           'metric',      c.metric,
           'starts_at',   c.starts_at,
           'ends_at',     c.ends_at,
           'prize_text',  c.prize_text,
           'is_featured', c.is_featured,
           'status',      case when c.starts_at > now() then 'upcoming'
                               when c.ends_at is not null and c.ends_at < now() then 'ended'
                               else 'live' end,
           'joined',      exists (select 1 from public.contest_entries e
                                   where e.contest_id = c.id and e.user_id = uid),
           'entries',     (select count(*) from public.contest_entries e2
                            where e2.contest_id = c.id),
           'score',       case when exists (select 1 from public.contest_entries e3
                                            where e3.contest_id = c.id and e3.user_id = uid)
                               then public.contest_score(c.id, uid) else 0 end
           order by c.is_featured desc, c.created_at desc),
         '[]'::jsonb)
    into v_contests
    from public.contests c
   where c.is_archived = false;

  -- Featured leaderboard: the featured contest, else the newest live one.
  select c.id, c.title, c.metric
    into v_lb_id, v_lb_title, v_lb_metric
    from public.contests c
   where c.is_archived = false
   order by c.is_featured desc, c.created_at desc
   limit 1;

  v_lb_rows := public.contest_leaderboard(v_lb_id, 7);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id',          co.id,
           'title',       co.title,
           'description', co.description,
           'seats',       co.seats,
           'starts_at',   co.starts_at,
           'seats_taken', (select count(*) from public.cohort_requests rq
                            where rq.cohort_id = co.id and rq.status = 'approved'),
           'pending',     (select count(*) from public.cohort_requests rq2
                            where rq2.cohort_id = co.id and rq2.status = 'pending'),
           'my_status',   (select rq3.status from public.cohort_requests rq3
                            where rq3.cohort_id = co.id and rq3.user_id = uid limit 1)
           order by co.created_at desc),
         '[]'::jsonb)
    into v_cohorts
    from public.cohorts co
   where co.is_archived = false;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id',          ev.id,
           'title',       ev.title,
           'description', ev.description,
           'starts_at',   ev.starts_at,
           'venue_type',  ev.venue_type,
           'venue_text',  ev.venue_text
           order by ev.starts_at asc),
         '[]'::jsonb)
    into v_events
    from public.events ev
   where ev.is_archived = false
     and ev.starts_at >= now();

  select coalesce(jsonb_agg(jsonb_build_object(
           'id',         n.id,
           'title',      n.title,
           'body',       n.body,
           'created_at', n.created_at
           order by n.created_at desc),
         '[]'::jsonb)
    into v_news
    from public.news n
   where n.is_published = true;

  return jsonb_build_object(
    'ok',          true,
    'contests',    coalesce(v_contests, '[]'::jsonb),
    'leaderboard', jsonb_build_object(
                     'contest_id',    v_lb_id,
                     'contest_title', v_lb_title,
                     'metric',        v_lb_metric,
                     'rows',          coalesce(v_lb_rows, '[]'::jsonb)),
    'cohorts',     coalesce(v_cohorts, '[]'::jsonb),
    'events',      coalesce(v_events, '[]'::jsonb),
    'news',        coalesce(v_news, '[]'::jsonb));
end $$;


-- ============================================================
-- 6. contest_join — a member opts in (this is what puts them on the board)
-- ============================================================

create or replace function public.contest_join(p_contest uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  v_exists boolean;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if p_contest is null then
    return jsonb_build_object('ok', false, 'code', 'BAD_CONTEST');
  end if;

  select exists (select 1 from public.contests c
                  where c.id = p_contest and c.is_archived = false)
    into v_exists;
  if not v_exists then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  insert into public.contest_entries (contest_id, user_id)
  values (p_contest, uid)
  on conflict (contest_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'contest_id', p_contest);
end $$;


-- ============================================================
-- 7. cohort_request — self-serve ask for a seat; operations approves
-- ============================================================

create or replace function public.cohort_request(p_cohort uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_seats   integer;
  v_taken   integer;
  v_current text;
  v_id      uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if p_cohort is null then
    return jsonb_build_object('ok', false, 'code', 'BAD_COHORT');
  end if;

  perform pg_advisory_xact_lock(hashtext('cohort:' || p_cohort::text));

  select co.seats into v_seats
    from public.cohorts co
   where co.id = p_cohort and co.is_archived = false;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select cr.status into v_current
    from public.cohort_requests cr
   where cr.cohort_id = p_cohort and cr.user_id = uid;

  if v_current = 'approved' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_IN');
  end if;
  if v_current = 'pending' then
    return jsonb_build_object('ok', true, 'status', 'pending', 'code', 'ALREADY_REQUESTED');
  end if;

  select count(*) into v_taken
    from public.cohort_requests cr2
   where cr2.cohort_id = p_cohort and cr2.status = 'approved';
  if v_taken >= coalesce(v_seats, 0) then
    return jsonb_build_object('ok', false, 'code', 'FULL');
  end if;

  if v_current = 'rejected' then
    update public.cohort_requests
       set status = 'pending', requested_at = now(), decided_at = null
     where cohort_id = p_cohort and user_id = uid
    returning id into v_id;
  else
    insert into public.cohort_requests (cohort_id, user_id, status)
    values (p_cohort, uid, 'pending')
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'status', 'pending', 'id', v_id);
end $$;


-- ============================================================
-- 8. OPERATIONS — contests
-- ============================================================

create or replace function public.operations_contests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); v_rows jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'title', c.title, 'description', c.description, 'metric', c.metric,
           'starts_at', c.starts_at, 'ends_at', c.ends_at, 'prize_text', c.prize_text,
           'is_featured', c.is_featured, 'is_archived', c.is_archived, 'created_at', c.created_at,
           'entries', (select count(*) from public.contest_entries e where e.contest_id = c.id)
           order by c.is_featured desc, c.created_at desc), '[]'::jsonb)
    into v_rows from public.contests c;

  return jsonb_build_object('ok', true, 'contests', v_rows);
end $$;

create or replace function public.operations_save_contest(
  p_id          uuid default null,
  p_title       text default null,
  p_description text default null,
  p_metric      text default null,
  p_starts_at   timestamptz default null,
  p_ends_at     timestamptz default null,
  p_prize_text  text default null,
  p_is_featured boolean default null,
  p_is_archived boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_id   uuid := p_id;
  v_metric text := nullif(btrim(coalesce(p_metric, '')), '');
  v_title  text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if v_metric is not null and v_metric not in ('gp','reading','engagement','referrals') then
    return jsonb_build_object('ok', false, 'code', 'BAD_METRIC',
      'hint', 'Metric must be gp, reading, engagement or referrals.');
  end if;

  if v_id is null then
    if v_title is null then
      return jsonb_build_object('ok', false, 'code', 'BAD_TITLE', 'hint', 'A contest needs a title.');
    end if;
    insert into public.contests (title, description, metric, starts_at, ends_at, prize_text, is_featured, is_archived)
    values (v_title, btrim(coalesce(p_description, '')), coalesce(v_metric, 'gp'),
            coalesce(p_starts_at, now()), p_ends_at, nullif(btrim(coalesce(p_prize_text, '')), ''),
            coalesce(p_is_featured, false), coalesce(p_is_archived, false))
    returning id into v_id;
  else
    if not exists (select 1 from public.contests c where c.id = v_id) then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
    update public.contests
       set title       = coalesce(v_title, title),
           description = case when p_description is null then description else btrim(p_description) end,
           metric      = coalesce(v_metric, metric),
           starts_at   = coalesce(p_starts_at, starts_at),
           ends_at     = case when p_ends_at is null then ends_at else p_ends_at end,
           prize_text  = case when p_prize_text is null then prize_text else nullif(btrim(p_prize_text), '') end,
           is_featured = coalesce(p_is_featured, is_featured),
           is_archived = coalesce(p_is_archived, is_archived)
     where id = v_id;
  end if;

  -- Only one featured contest: clear the flag on the others.
  if coalesce(p_is_featured, false) then
    update public.contests set is_featured = false
     where id <> v_id and is_featured = true;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.operations_delete_contest(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if p_id is null or not exists (select 1 from public.contests c where c.id = p_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  delete from public.contests where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;


-- ============================================================
-- 9. OPERATIONS — cohorts + requests
-- ============================================================

create or replace function public.operations_cohorts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); v_rows jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', co.id, 'title', co.title, 'description', co.description, 'seats', co.seats,
           'starts_at', co.starts_at, 'is_archived', co.is_archived, 'created_at', co.created_at,
           'seats_taken', (select count(*) from public.cohort_requests rq
                            where rq.cohort_id = co.id and rq.status = 'approved'),
           'pending', (select count(*) from public.cohort_requests rq2
                        where rq2.cohort_id = co.id and rq2.status = 'pending')
           order by co.created_at desc), '[]'::jsonb)
    into v_rows from public.cohorts co;

  return jsonb_build_object('ok', true, 'cohorts', v_rows);
end $$;

create or replace function public.operations_save_cohort(
  p_id          uuid default null,
  p_title       text default null,
  p_description text default null,
  p_seats       integer default null,
  p_starts_at   timestamptz default null,
  p_is_archived boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_id  uuid := p_id;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if p_seats is not null and (p_seats < 1 or p_seats > 100000) then
    return jsonb_build_object('ok', false, 'code', 'BAD_SEATS', 'hint', 'Seats must be at least 1.');
  end if;

  if v_id is null then
    if v_title is null then
      return jsonb_build_object('ok', false, 'code', 'BAD_TITLE', 'hint', 'A cohort needs a title.');
    end if;
    insert into public.cohorts (title, description, seats, starts_at, is_archived)
    values (v_title, btrim(coalesce(p_description, '')), coalesce(p_seats, 9),
            p_starts_at, coalesce(p_is_archived, false))
    returning id into v_id;
  else
    if not exists (select 1 from public.cohorts c where c.id = v_id) then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
    update public.cohorts
       set title       = coalesce(v_title, title),
           description = case when p_description is null then description else btrim(p_description) end,
           seats       = coalesce(p_seats, seats),
           starts_at   = case when p_starts_at is null then starts_at else p_starts_at end,
           is_archived = coalesce(p_is_archived, is_archived)
     where id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.operations_delete_cohort(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if p_id is null or not exists (select 1 from public.cohorts c where c.id = p_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  delete from public.cohorts where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

create or replace function public.operations_cohort_requests(p_cohort uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); v_rows jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', cr.id, 'cohort_id', cr.cohort_id, 'user_id', cr.user_id,
           'status', cr.status, 'requested_at', cr.requested_at, 'decided_at', cr.decided_at,
           'full_name', pr.full_name, 'avatar_url', pr.avatar_url
           order by (cr.status = 'pending') desc, cr.requested_at asc), '[]'::jsonb)
    into v_rows
    from public.cohort_requests cr
    left join public.profiles pr on pr.id = cr.user_id
   where p_cohort is null or cr.cohort_id = p_cohort;

  return jsonb_build_object('ok', true, 'requests', v_rows);
end $$;

create or replace function public.operations_review_cohort_request(p_request uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_cohort  uuid;
  v_seats   integer;
  v_taken   integer;
  v_status  text;
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if p_request is null or btrim(coalesce(p_decision, '')) not in ('approved','rejected') then
    return jsonb_build_object('ok', false, 'code', 'BAD_DECISION',
      'hint', 'Decision must be approved or rejected.');
  end if;

  select cr.cohort_id, cr.status into v_cohort, v_status
    from public.cohort_requests cr where cr.id = p_request for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if p_decision = 'approved' then
    perform pg_advisory_xact_lock(hashtext('cohort:' || v_cohort::text));
    select co.seats into v_seats from public.cohorts co where co.id = v_cohort;
    select count(*) into v_taken from public.cohort_requests rq
     where rq.cohort_id = v_cohort and rq.status = 'approved';
    if v_taken >= coalesce(v_seats, 0) then
      return jsonb_build_object('ok', false, 'code', 'FULL',
        'hint', 'Every seat in this cohort is taken.');
    end if;
  end if;

  update public.cohort_requests
     set status = p_decision, decided_at = now()
   where id = p_request;

  return jsonb_build_object('ok', true, 'id', p_request, 'status', p_decision);
end $$;


-- ============================================================
-- 10. OPERATIONS — events
-- ============================================================

create or replace function public.operations_events()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); v_rows jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ev.id, 'title', ev.title, 'description', ev.description, 'starts_at', ev.starts_at,
           'venue_type', ev.venue_type, 'venue_text', ev.venue_text,
           'is_archived', ev.is_archived, 'created_at', ev.created_at
           order by ev.starts_at asc), '[]'::jsonb)
    into v_rows from public.events ev;

  return jsonb_build_object('ok', true, 'events', v_rows);
end $$;

create or replace function public.operations_save_event(
  p_id          uuid default null,
  p_title       text default null,
  p_description text default null,
  p_starts_at   timestamptz default null,
  p_venue_type  text default null,
  p_venue_text  text default null,
  p_is_archived boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_id  uuid := p_id;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_venue text := nullif(btrim(coalesce(p_venue_type, '')), '');
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if v_venue is not null and v_venue not in ('Online','Hall','Custom') then
    return jsonb_build_object('ok', false, 'code', 'BAD_VENUE',
      'hint', 'Venue must be Online, Hall or Custom.');
  end if;

  if v_id is null then
    if v_title is null then
      return jsonb_build_object('ok', false, 'code', 'BAD_TITLE', 'hint', 'An event needs a title.');
    end if;
    if p_starts_at is null then
      return jsonb_build_object('ok', false, 'code', 'BAD_DATE', 'hint', 'An event needs a date and time.');
    end if;
    insert into public.events (title, description, starts_at, venue_type, venue_text, is_archived)
    values (v_title, btrim(coalesce(p_description, '')), p_starts_at, coalesce(v_venue, 'Online'),
            nullif(btrim(coalesce(p_venue_text, '')), ''), coalesce(p_is_archived, false))
    returning id into v_id;
  else
    if not exists (select 1 from public.events e where e.id = v_id) then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
    update public.events
       set title       = coalesce(v_title, title),
           description = case when p_description is null then description else btrim(p_description) end,
           starts_at   = coalesce(p_starts_at, starts_at),
           venue_type  = coalesce(v_venue, venue_type),
           venue_text  = case when p_venue_text is null then venue_text else nullif(btrim(p_venue_text), '') end,
           is_archived = coalesce(p_is_archived, is_archived)
     where id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.operations_delete_event(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if p_id is null or not exists (select 1 from public.events e where e.id = p_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  delete from public.events where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;


-- ============================================================
-- 11. OPERATIONS — news
-- ============================================================

create or replace function public.operations_news()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); v_rows jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'title', n.title, 'body', n.body,
           'is_published', n.is_published, 'created_at', n.created_at
           order by n.created_at desc), '[]'::jsonb)
    into v_rows from public.news n;

  return jsonb_build_object('ok', true, 'news', v_rows);
end $$;

create or replace function public.operations_save_news(
  p_id           uuid default null,
  p_title        text default null,
  p_body         text default null,
  p_is_published boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_id  uuid := p_id;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;

  if v_id is null then
    if v_title is null then
      return jsonb_build_object('ok', false, 'code', 'BAD_TITLE', 'hint', 'A news item needs a title.');
    end if;
    insert into public.news (title, body, is_published)
    values (v_title, btrim(coalesce(p_body, '')), coalesce(p_is_published, true))
    returning id into v_id;
  else
    if not exists (select 1 from public.news n where n.id = v_id) then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
    update public.news
       set title        = coalesce(v_title, title),
           body         = case when p_body is null then body else btrim(p_body) end,
           is_published = coalesce(p_is_published, is_published)
     where id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.operations_delete_news(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if p_id is null or not exists (select 1 from public.news n where n.id = p_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  delete from public.news where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;


-- ============================================================
-- 12. Privileges — member RPCs to authenticated; operations RPCs to
--     authenticated too (they self-check admin_has_role), never to anon.
-- ============================================================

revoke all on function public.contest_score(uuid, uuid)                        from public, anon;
revoke all on function public.contest_leaderboard(uuid, integer)              from public, anon;
revoke all on function public.community_board()                               from public, anon;
revoke all on function public.contest_join(uuid)                              from public, anon;
revoke all on function public.cohort_request(uuid)                            from public, anon;
revoke all on function public.operations_contests()                           from public, anon;
revoke all on function public.operations_save_contest(uuid, text, text, text, timestamptz, timestamptz, text, boolean, boolean) from public, anon;
revoke all on function public.operations_delete_contest(uuid)                 from public, anon;
revoke all on function public.operations_cohorts()                            from public, anon;
revoke all on function public.operations_save_cohort(uuid, text, text, integer, timestamptz, boolean) from public, anon;
revoke all on function public.operations_delete_cohort(uuid)                  from public, anon;
revoke all on function public.operations_cohort_requests(uuid)                from public, anon;
revoke all on function public.operations_review_cohort_request(uuid, text)    from public, anon;
revoke all on function public.operations_events()                             from public, anon;
revoke all on function public.operations_save_event(uuid, text, text, timestamptz, text, text, boolean) from public, anon;
revoke all on function public.operations_delete_event(uuid)                   from public, anon;
revoke all on function public.operations_news()                               from public, anon;
revoke all on function public.operations_save_news(uuid, text, text, boolean) from public, anon;
revoke all on function public.operations_delete_news(uuid)                    from public, anon;

grant execute on function public.contest_score(uuid, uuid)                        to authenticated, service_role;
grant execute on function public.contest_leaderboard(uuid, integer)              to authenticated, service_role;
grant execute on function public.community_board()                               to authenticated, service_role;
grant execute on function public.contest_join(uuid)                              to authenticated, service_role;
grant execute on function public.cohort_request(uuid)                            to authenticated, service_role;
grant execute on function public.operations_contests()                           to authenticated, service_role;
grant execute on function public.operations_save_contest(uuid, text, text, text, timestamptz, timestamptz, text, boolean, boolean) to authenticated, service_role;
grant execute on function public.operations_delete_contest(uuid)                 to authenticated, service_role;
grant execute on function public.operations_cohorts()                            to authenticated, service_role;
grant execute on function public.operations_save_cohort(uuid, text, text, integer, timestamptz, boolean) to authenticated, service_role;
grant execute on function public.operations_delete_cohort(uuid)                  to authenticated, service_role;
grant execute on function public.operations_cohort_requests(uuid)                to authenticated, service_role;
grant execute on function public.operations_review_cohort_request(uuid, text)    to authenticated, service_role;
grant execute on function public.operations_events()                             to authenticated, service_role;
grant execute on function public.operations_save_event(uuid, text, text, timestamptz, text, text, boolean) to authenticated, service_role;
grant execute on function public.operations_delete_event(uuid)                   to authenticated, service_role;
grant execute on function public.operations_news()                               to authenticated, service_role;
grant execute on function public.operations_save_news(uuid, text, text, boolean) to authenticated, service_role;
grant execute on function public.operations_delete_news(uuid)                    to authenticated, service_role;

notify pgrst, 'reload schema';


-- ============================================================
-- SELF CHECK — returns a grid. Every row should read OK.
-- ============================================================

select 1 as "#", 'six community tables exist' as item,
       case when (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='public'
                     and c.relname in ('contests','contest_entries','cohorts','cohort_requests','events','news')) = 6
            then 'OK' else 'MISSING' end as result
union all select 2, 'RLS enabled on all six',
       case when (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='public'
                     and c.relname in ('contests','contest_entries','cohorts','cohort_requests','events','news')
                     and c.relrowsecurity) = 6
            then 'OK' else 'MISSING' end
union all select 3, 'authenticated cannot read/write any table directly',
       case when (select count(*) from information_schema.role_table_grants
                   where table_schema='public' and grantee='authenticated'
                     and table_name in ('contests','contest_entries','cohorts','cohort_requests','events','news')) = 0
            then 'OK' else 'GRANT FOUND' end
union all select 4, 'anon cannot execute community_board',
       case when has_function_privilege('anon','public.community_board()','execute')
            then 'GRANTED (bad)' else 'OK' end
union all select 5, 'authenticated CAN execute community_board',
       case when has_function_privilege('authenticated','public.community_board()','execute')
            then 'OK' else 'MISSING' end
union all select 6, 'member RPCs installed (expect 5)',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public'
           and p.proname in ('contest_score','contest_leaderboard','community_board','contest_join','cohort_request'))
union all select 7, 'operations RPCs installed (expect 14)',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public'
           and p.proname in ('operations_contests','operations_save_contest','operations_delete_contest',
                             'operations_cohorts','operations_save_cohort','operations_delete_cohort',
                             'operations_cohort_requests','operations_review_cohort_request',
                             'operations_events','operations_save_event','operations_delete_event',
                             'operations_news','operations_save_news','operations_delete_news'))
union all select 8, 'all 19 community functions are SECURITY DEFINER',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.prosecdef
                     and p.proname in ('contest_score','contest_leaderboard','community_board','contest_join','cohort_request',
                             'operations_contests','operations_save_contest','operations_delete_contest',
                             'operations_cohorts','operations_save_cohort','operations_delete_cohort',
                             'operations_cohort_requests','operations_review_cohort_request',
                             'operations_events','operations_save_event','operations_delete_event',
                             'operations_news','operations_save_news','operations_delete_news')) = 19
            then 'OK' else 'NOT ALL DEFINER' end
union all select 9, 'anon cannot execute any operations RPC',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname like 'operations\_%'
                     and p.proname in ('operations_contests','operations_save_contest','operations_delete_contest',
                             'operations_cohorts','operations_save_cohort','operations_delete_cohort',
                             'operations_cohort_requests','operations_review_cohort_request',
                             'operations_events','operations_save_event','operations_delete_event',
                             'operations_news','operations_save_news','operations_delete_news')
                     and has_function_privilege('anon', p.oid, 'execute')) = 0
            then 'OK' else 'GRANT FOUND' end
union all select 10, 'contest_score of a null contest is 0',
       case when public.contest_score(null, null) = 0 then 'OK' else 'BROKEN' end
union all select 11, 'contests_metric_check rejects a bad metric',
       case when (select count(*) from pg_constraint
                   where conname='contests_metric_check') = 1 then 'OK' else 'MISSING' end
union all select 12, 'events_venue_check present',
       case when (select count(*) from pg_constraint
                   where conname='events_venue_check') = 1 then 'OK' else 'MISSING' end
union all select 13, 'rows so far (contests/cohorts/events/news)',
       (select (select count(*) from public.contests)::text || '/' ||
               (select count(*) from public.cohorts)::text || '/' ||
               (select count(*) from public.events)::text || '/' ||
               (select count(*) from public.news)::text)
order by "#";
