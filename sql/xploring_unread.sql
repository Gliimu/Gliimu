-- Xploring ring: the creators-you-follow row needs to know which gliims this
-- member has already opened, so that an unread count can sit on their avatar.
-- Openings are already recorded, one row per member per gliim, in post_views by
-- the bump_post_views RPC. That table was write-only for the database owner:
-- RLS is on and anon/authenticated had no table privileges at all, so no member
-- could ever read their own history.
--
-- This script gives a member read access to their own rows and nothing more.
-- It is idempotent: safe to run twice, and safe to run on a fresh install.

-- 1. The table must exist before anything else. It is created by state.sql on a
--    fresh install; this guard only matters if that script has not run yet.
create table if not exists public.post_views (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.feed_gliims(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- 2. Reading is the only new right. Writes stay inside the security-definer RPC.
grant select on table public.post_views to authenticated;
revoke all on table public.post_views from anon;

-- 3. RLS on, then one policy: a member sees their own view rows only.
alter table public.post_views enable row level security;

drop policy if exists "post views readable by viewer" on public.post_views;
create policy "post views readable by viewer"
  on public.post_views
  for select
  to authenticated
  using ( user_id = (select auth.uid()) );

-- ---------------------------------------------------------------------------
-- SELF CHECK — run the whole file, then run this one query unchanged.
-- Every row must read ok. Anything else means the step above did not land.
-- ---------------------------------------------------------------------------
select
  case when t.relrowsecurity then 'ok' else 'FAIL rls off' end as row_level_security,
  case when exists (
    select 1 from information_schema.table_privileges g
    where g.table_schema = 'public' and g.table_name = 'post_views'
      and g.grantee = 'authenticated' and g.privilege_type = 'SELECT'
  ) then 'ok' else 'FAIL no select grant' end as member_can_select,
  case when not exists (
    select 1 from information_schema.table_privileges a
    where a.table_schema = 'public' and a.table_name = 'post_views'
      and a.grantee in ('anon', 'PUBLIC')
  ) then 'ok' else 'FAIL anon has rights' end as anon_locked,
  coalesce(p.policyname, 'FAIL no policy') as own_rows_policy,
  coalesce(p.qual, '-') as policy_predicate
from pg_class t
join pg_namespace n on n.oid = t.relnamespace
left join pg_policies p
  on p.tablename = 'post_views' and p.schemaname = 'public' and p.cmd = 'SELECT'
where n.nspname = 'public' and t.relname = 'post_views';
