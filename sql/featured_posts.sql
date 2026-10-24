-- ============================================================
-- FEATURED POSTS
-- ============================================================
-- User-submitted carousel ads with duration-based pricing.
--
-- WHAT IT DOES:
--   1. featured_posts — carousel ads submitted by users
--   2. RLS policies + grants
--   3. Self-check SELECT grid at the end
--
-- SAFE TO RE-RUN — every step uses IF NOT EXISTS or guards.
-- ============================================================


-- ------------------------------------------------------------
-- 1. featured_posts — user-submitted carousel ads
-- ------------------------------------------------------------
create table if not exists public.featured_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  image_url text not null,
  link_url text,
  link_label text,
  price_paid integer not null,
  duration_days integer not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_featured_posts_status_dates on public.featured_posts(status, starts_at, ends_at);
create index if not exists idx_featured_posts_user_id on public.featured_posts(user_id);
create index if not exists idx_featured_posts_created_at on public.featured_posts(created_at desc);


-- ------------------------------------------------------------
-- 2. RLS policies
-- ------------------------------------------------------------
alter table public.featured_posts enable row level security;

-- Anyone authenticated can read approved featured posts within date range
drop policy if exists "Anyone can read approved featured_posts" on public.featured_posts;
create policy "Anyone can read approved featured_posts"
  on public.featured_posts
  for select
  to authenticated
  using (
    status = 'approved'
    and starts_at <= now()
    and ends_at >= now()
  );

-- Admins can read all featured posts (for moderation)
drop policy if exists "Admins can read all featured_posts" on public.featured_posts;
create policy "Admins can read all featured_posts"
  on public.featured_posts
  for select
  to authenticated
  using (public.is_admin());

-- Users can insert their own featured posts
drop policy if exists "Users can insert own featured_posts" on public.featured_posts;
create policy "Users can insert own featured_posts"
  on public.featured_posts
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Users can read their own featured posts (all statuses)
drop policy if exists "Users can read own featured_posts" on public.featured_posts;
create policy "Users can read own featured_posts"
  on public.featured_posts
  for select
  to authenticated
  using (user_id = auth.uid());

-- Admins (ops/super) can update any featured post (approve/reject)
drop policy if exists "Admins can update featured_posts" on public.featured_posts;
create policy "Admins can update featured_posts"
  on public.featured_posts
  for update
  to authenticated
  using (public.is_admin());

-- Admins can delete featured posts
drop policy if exists "Admins can delete featured_posts" on public.featured_posts;
create policy "Admins can delete featured_posts"
  on public.featured_posts
  for delete
  to authenticated
  using (public.is_admin());


-- ------------------------------------------------------------
-- 3. Grants
-- ------------------------------------------------------------
grant select, insert, update, delete on public.featured_posts to authenticated;


-- ------------------------------------------------------------
-- 4. deduct_wallet RPC — debit the caller's wallet + log it
-- ------------------------------------------------------------
create or replace function public.deduct_wallet(
  p_amount integer,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
  current_balance integer;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select wallet_balance into current_balance
    from public.profiles
   where id = caller_id
     for update;

  if current_balance is null or current_balance < p_amount then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  update public.profiles
     set wallet_balance = wallet_balance - p_amount
   where id = caller_id;

  insert into public.transactions (user_id, amount, type, reference, points)
  values (caller_id, -p_amount, 'purchase', coalesce(p_description, 'Featured content'), 0);
end $$;

grant execute on function public.deduct_wallet(integer, text) to authenticated;


-- ------------------------------------------------------------
-- 5. Feature pricing — seeded in billing_prices so the
--    registrar can change them from the Price List admin page.
-- ------------------------------------------------------------
insert into public.billing_prices (event_type, amount) values
  ('feature_1day',   5000),
  ('feature_1week', 30000),
  ('feature_1month',110000)
on conflict (event_type) do nothing;


-- ------------------------------------------------------------
-- 6. featured_slot_check — returns how many active approved
--    featured posts are running right now, and whether a slot
--    is available (max 3 concurrent).
-- ------------------------------------------------------------
create or replace function public.featured_slot_check()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active integer;
  v_max integer := 3;
  v_prices jsonb;
begin
  select count(*) into v_active
    from public.featured_posts
   where status = 'approved'
     and starts_at <= now()
     and ends_at >= now();

  select jsonb_object_agg(event_type, amount) into v_prices
    from public.billing_prices
   where event_type in ('feature_1day', 'feature_1week', 'feature_1month');

  return jsonb_build_object(
    'active', v_active,
    'max_slots', v_max,
    'available', v_active < v_max,
    'prices', coalesce(v_prices, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.featured_slot_check() to authenticated;


-- ============================================================
-- SELF CHECK
-- ============================================================
-- Run this section to verify everything is set up correctly.
-- Expected: table exists, all policies exist, indexes exist.
-- ============================================================

select 'featured_posts table' as check_name,
  case when to_regclass('public.featured_posts') is not null then 'OK' else 'MISSING' end as status;

select 'featured_posts RLS enabled' as check_name,
  case when count(*) = 1 then 'OK' else 'WRONG' end as status
from pg_tables
where schemaname = 'public'
  and tablename = 'featured_posts'
  and rowsecurity = true;

select 'featured_posts read approved policy' as check_name,
  case when count(*) = 1 then 'OK' else 'WRONG' end as status
from pg_policies
where schemaname = 'public'
  and tablename = 'featured_posts'
  and policyname = 'Anyone can read approved featured_posts';

select 'featured_posts insert own policy' as check_name,
  case when count(*) = 1 then 'OK' else 'WRONG' end as status
from pg_policies
where schemaname = 'public'
  and tablename = 'featured_posts'
  and policyname = 'Users can insert own featured_posts';

select 'featured_posts read own policy' as check_name,
  case when count(*) = 1 then 'OK' else 'WRONG' end as status
from pg_policies
where schemaname = 'public'
  and tablename = 'featured_posts'
  and policyname = 'Users can read own featured_posts';

select 'featured_posts admin update policy' as check_name,
  case when count(*) = 1 then 'OK' else 'WRONG' end as status
from pg_policies
where schemaname = 'public'
  and tablename = 'featured_posts'
  and policyname = 'Admins can update featured_posts';

select 'featured_posts admin delete policy' as check_name,
  case when count(*) = 1 then 'OK' else 'WRONG' end as status
from pg_policies
where schemaname = 'public'
  and tablename = 'featured_posts'
  and policyname = 'Admins can delete featured_posts';

select 'featured_posts status_dates index' as check_name,
  case when count(*) = 1 then 'OK' else 'MISSING' end as status
from pg_indexes
where schemaname = 'public'
  and tablename = 'featured_posts'
  and indexname = 'idx_featured_posts_status_dates';

select 'featured_posts user_id index' as check_name,
  case when count(*) = 1 then 'OK' else 'MISSING' end as status
from pg_indexes
where schemaname = 'public'
  and tablename = 'featured_posts'
  and indexname = 'idx_featured_posts_user_id';

select 'featured_posts count' as check_name,
  count(*)::text as total_featured
from public.featured_posts;

select 'deduct_wallet function' as check_name,
  case when count(*) = 1 then 'OK' else 'MISSING' end as status
from pg_proc
where proname = 'deduct_wallet'
  and pronamespace = (select oid from pg_namespace where nspname = 'public');

select 'featured_slot_check function' as check_name,
  case when count(*) = 1 then 'OK' else 'MISSING' end as status
from pg_proc
where proname = 'featured_slot_check'
  and pronamespace = (select oid from pg_namespace where nspname = 'public');

select 'feature pricing rows' as check_name,
  count(*)::text as price_count
from public.billing_prices
where event_type in ('feature_1day', 'feature_1week', 'feature_1month');
