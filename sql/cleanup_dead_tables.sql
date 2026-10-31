-- ============================================================
-- CLEANUP: Remove dead tables and their associated functions
-- Tables: events, contest_entries, cohorts, cohort_requests, news, sponsor_posts
-- ============================================================

begin;

-- 1. Drop functions that reference dead tables
drop function if exists public.cohort_request(uuid);
drop function if exists public.contest_join(uuid);
drop function if exists public.contest_score(uuid, uuid, integer);
drop function if exists public.event_create(uuid, text, text, text, timestamp with time zone, timestamp with time zone, integer, boolean);
drop function if exists public.event_end(uuid);
drop function if exists public.event_leaderboard(uuid);
drop function if exists public.event_leave(uuid, uuid);
drop function if exists public.event_notify_participants(uuid, text);
drop function if exists public.event_post_create(uuid, text, text, text);
drop function if exists public.event_team_create(uuid, text, text);
drop function if exists public.event_track_view(uuid, uuid);
drop function if exists public.operations_cohort_requests();
drop function if exists public.operations_cohorts();
drop function if exists public.operations_contests();
drop function if exists public.operations_delete_cohort(uuid);
drop function if exists public.operations_delete_contest(uuid);
drop function if exists public.operations_review_cohort_request(uuid, text);
drop function if exists public.operations_save_cohort(uuid, text, text, timestamp with time zone, timestamp with time zone, integer);
drop function if exists public.operations_save_contest(uuid, text, text, timestamp with time zone, timestamp with time zone, integer, integer, integer);
drop function if exists public.community_board();
drop function if exists public.updates_boards();

-- 2. Drop RLS policies on dead tables
drop policy if exists "Enable read for authenticated users" on public.events;
drop policy if exists "Enable read for authenticated users" on public.contest_entries;
drop policy if exists "Enable read for authenticated users" on public.cohorts;
drop policy if exists "Enable read for authenticated users" on public.cohort_requests;
drop policy if exists "Enable read for authenticated users" on public.news;
drop policy if exists "Enable read for authenticated users" on public.sponsor_posts;

-- 3. Drop the dead tables
drop table if exists public.contest_entries cascade;
drop table if exists public.events cascade;
drop table if exists public.cohort_requests cascade;
drop table if exists public.cohorts cascade;
drop table if exists public.news cascade;
drop table if exists public.sponsor_posts cascade;

commit;

-- ============================================================
-- SELF-CHECK: Verify cleanup
-- ============================================================
select
  1 as "#",
  'Dead tables removed' as item,
  case when not exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
    and table_name in ('events', 'contest_entries', 'cohorts', 'cohort_requests', 'news', 'sponsor_posts')
  ) then 'OK' else 'FAIL' end as result
union all
select
  2,
  'Dead functions removed',
  case when not exists (
    select 1 from information_schema.routines
    where routine_schema = 'public'
    and routine_name in (
      'cohort_request', 'contest_join', 'contest_score',
      'event_create', 'event_end', 'event_leaderboard', 'event_leave',
      'event_notify_participants', 'event_post_create', 'event_team_create', 'event_track_view',
      'operations_cohort_requests', 'operations_cohorts', 'operations_contests',
      'operations_delete_cohort', 'operations_delete_contest',
      'operations_review_cohort_request', 'operations_save_cohort', 'operations_save_contest',
      'community_board', 'updates_boards'
    )
  ) then 'OK' else 'FAIL' end
;
