-- ===========================================================================
-- ARCHIVE: the paid-featuring schema (featured_posts + its three RPCs)
-- ===========================================================================
-- This is a frozen snapshot of live objects, captured on 2026-11-06 from
-- project vsgvscemqtqgolrindcx immediately before sql/remove_featuring.sql
-- dropped them. Nothing here is meant to run; it exists so the definitions
-- are recoverable, because they lived only in the database.
--
-- To restore a fresh copy of the feature: run this file as-is, then
-- re-add the client code that was deleted on 2026-11-06.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. public.featured_posts
-- ---------------------------------------------------------------------------
-- Captured state: RLS enabled (not forced), 0 rows, no triggers, no comments.
-- Grants: authenticated SELECT/INSERT/UPDATE/DELETE, postgres as owner.

create table if not exists public.featured_posts (
  id            uuid        not null default gen_random_uuid(),
  user_id       uuid        not null,
  title         text        not null,
  description   text        not null,
  image_url     text        not null,
  link_url      text,
  link_label    text,
  price_paid    integer     not null,
  duration_days integer     not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        text        not null default 'pending',
  created_at    timestamptz not null default now(),
  constraint featured_posts_pkey primary key (id),
  constraint featured_posts_status_check
    check (status = any (array['pending', 'approved', 'rejected'])),
  constraint featured_posts_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade
);

alter table public.featured_posts enable row level security;

create index if not exists idx_featured_posts_user_id      on public.featured_posts (user_id);
create index if not exists idx_featured_posts_created_at   on public.featured_posts (created_at desc);
create index if not exists idx_featured_posts_status_dates on public.featured_posts (status, starts_at, ends_at);

grant select, insert, update, delete on table public.featured_posts to authenticated;

-- The six policies, exactly as they read live.
drop policy if exists "Anyone can read approved featured_posts" on public.featured_posts;
create policy "Anyone can read approved featured_posts" on public.featured_posts
  for select to authenticated
  using ( status = 'approved' and starts_at <= now() and ends_at >= now() );

drop policy if exists "Users can read own featured_posts" on public.featured_posts;
create policy "Users can read own featured_posts" on public.featured_posts
  for select to authenticated
  using ( user_id = auth.uid() );

drop policy if exists "Users can insert own featured_posts" on public.featured_posts;
create policy "Users can insert own featured_posts" on public.featured_posts
  for insert to authenticated
  with check ( user_id = auth.uid() );

drop policy if exists "Admins can read all featured_posts" on public.featured_posts;
create policy "Admins can read all featured_posts" on public.featured_posts
  for select to authenticated
  using ( is_admin() );

drop policy if exists "Admins can update featured_posts" on public.featured_posts;
create policy "Admins can update featured_posts" on public.featured_posts
  for update to authenticated
  using ( is_admin() );

drop policy if exists "Admins can delete featured_posts" on public.featured_posts;
create policy "Admins can delete featured_posts" on public.featured_posts
  for delete to authenticated
  using ( is_admin() );

-- ---------------------------------------------------------------------------
-- 2. profiles.feature_my_profile  (the organic opt-in flag)
-- ---------------------------------------------------------------------------
-- add column if not exists feature_my_profile boolean not null default false;
-- comment on column public.profiles.feature_my_profile is
--   'Opt-in to appear in the weekly XpLoRe creator slots.';

-- ---------------------------------------------------------------------------
-- 3. public.earned_gp_pattern()
-- ---------------------------------------------------------------------------
create or replace function public.earned_gp_pattern()
 returns text[]
 language sql
 immutable
AS $function$
  select array[
    'Earned GP from Hub Engagement%',
    'Referral reward%',
    'Live session hosted%',
    'Live session taught%'
  ];
$function$;

-- ---------------------------------------------------------------------------
-- 4. public.xplore_spotlight(p_days, p_limit)
-- ---------------------------------------------------------------------------
create or replace function public.xplore_spotlight(
  p_days  integer default 7,
  p_limit integer default 3
)
 returns table (
   user_id uuid, full_name text, avatar_url text, bio text,
   verification_badge text, gp_window integer, followers bigint
 )
 language sql
 stable
 set search_path to 'public'
AS $function$
  with earners as (
    select t.user_id, sum(t.points)::integer as gp_window
    from public.transactions t
    where t.user_id is not null
      and t.status = 'success'
      and t.points > 0
      and t.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
      and t.description like any (public.earned_gp_pattern())
    group by t.user_id
  )
  select pr.id,
         pr.full_name,
         pr.avatar_url,
         pr.bio,
         pr.verification_badge,
         e.gp_window,
         (select count(*) from public.followed_users f where f.followed_id = pr.id) as fans
  from public.profiles pr
  join earners e on e.user_id = pr.id
  where pr.feature_my_profile
    and pr.deletion_scheduled_at is null
    and coalesce(pr.avatar_url, '') <> ''
    and (auth.uid() is null or pr.id <> auth.uid())
  order by e.gp_window desc, fans desc, pr.id
  limit greatest(coalesce(p_limit, 3), 1);
$function$;

-- ---------------------------------------------------------------------------
-- 5. public.featured_slot_check()
-- ---------------------------------------------------------------------------
create or replace function public.featured_slot_check()
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
AS $function$
declare
  v_active integer;
  v_max integer := 3;
begin
  select count(*) into v_active
    from public.featured_posts
   where status = 'approved'
     and starts_at <= now()
     and ends_at >= now();

  return jsonb_build_object(
    'active', coalesce(v_active, 0),
    'max_slots', v_max,
    'available', coalesce(v_active, 0) < v_max
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. execute grants
-- ---------------------------------------------------------------------------
grant execute on function public.earned_gp_pattern() to anon, authenticated;
grant execute on function public.xplore_spotlight(integer, integer) to anon, authenticated;
grant execute on function public.featured_slot_check() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Ledger rows left behind by the feature (informational, not restored)
-- ---------------------------------------------------------------------------
-- 3 transactions rows of type 'purchase' / amount -30000 with description
-- 'Featured content: <title>', all dated 2026-11-06, all for user
-- cc4c8d1f-8661-43ca-963f-668ba3452c94. They stay in transactions; nothing
-- references featured_posts by id, so the table drop cannot orphan them.
