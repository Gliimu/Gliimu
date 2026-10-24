-- Follow system: users can follow other users to see their content in Xplore feed
-- Idempotent script, safe to re-run

-- ============================================================
-- 1. followed_users table
-- ============================================================
create table if not exists public.followed_users (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint no_self_follow check (follower_id != followed_id)
);

-- Index for fast "who follows me" and "who do I follow" queries
create index if not exists idx_followed_users_follower on public.followed_users(follower_id);
create index if not exists idx_followed_users_followed on public.followed_users(followed_id);

-- ============================================================
-- 2. RLS policies
-- ============================================================
alter table public.followed_users enable row level security;

-- Authenticated users can read all follows (for feed personalization)
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'followed_users_read_all' and tablename = 'followed_users') then
    create policy "followed_users_read_all" on public.followed_users
    for select to authenticated
    using (true);
  end if;
end $$;

-- Users can insert their own follows
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'followed_users_insert_own' and tablename = 'followed_users') then
    create policy "followed_users_insert_own" on public.followed_users
    for insert to authenticated
    with check ((select auth.uid()) = follower_id);
  end if;
end $$;

-- Users can delete their own follows
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'followed_users_delete_own' and tablename = 'followed_users') then
    create policy "followed_users_delete_own" on public.followed_users
    for delete to authenticated
    using ((select auth.uid()) = follower_id);
  end if;
end $$;

-- ============================================================
-- 3. RPCs
-- ============================================================

-- Follow a user
create or replace function public.follow_user(p_followed_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_follower uuid := auth.uid();
begin
  if v_follower is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;
  
  if v_follower = p_followed_id then
    return jsonb_build_object('ok', false, 'error', 'CANNOT_FOLLOW_SELF');
  end if;
  
  -- Check if target user exists
  if not exists (select 1 from public.profiles where id = p_followed_id) then
    return jsonb_build_object('ok', false, 'error', 'USER_NOT_FOUND');
  end if;
  
  -- Insert (ignore if already following)
  insert into public.followed_users (follower_id, followed_id)
  values (v_follower, p_followed_id)
  on conflict (follower_id, followed_id) do nothing;
  
  return jsonb_build_object('ok', true, 'following', true);
end;
$$;

-- Unfollow a user
create or replace function public.unfollow_user(p_followed_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_follower uuid := auth.uid();
begin
  if v_follower is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;
  
  delete from public.followed_users
  where follower_id = v_follower and followed_id = p_followed_id;
  
  return jsonb_build_object('ok', true, 'following', false);
end;
$$;

-- Check if current user is following a user
create or replace function public.is_following(p_followed_id uuid)
returns boolean
language sql
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.followed_users
    where follower_id = auth.uid() and followed_id = p_followed_id
  );
$$;

-- Get list of users that a user follows (for feed personalization)
create or replace function public.get_followed_users(p_user_id uuid default null)
returns table (followed_id uuid, followed_at timestamptz)
language sql
security invoker
set search_path = public
as $$
  select fu.followed_id, fu.created_at
  from public.followed_users fu
  where fu.follower_id = coalesce(p_user_id, auth.uid())
  order by fu.created_at desc;
$$;

-- Get follower count for a user
create or replace function public.get_follower_count(p_user_id uuid)
returns bigint
language sql
security invoker
set search_path = public
as $$
  select count(*) from public.followed_users where followed_id = p_user_id;
$$;

-- Get following count for a user
create or replace function public.get_following_count(p_user_id uuid)
returns bigint
language sql
security invoker
set search_path = public
as $$
  select count(*) from public.followed_users where follower_id = p_user_id;
$$;

-- ============================================================
-- 4. Grants
-- ============================================================
revoke execute on function public.follow_user(uuid) from public, anon;
grant execute on function public.follow_user(uuid) to authenticated;

revoke execute on function public.unfollow_user(uuid) from public, anon;
grant execute on function public.unfollow_user(uuid) to authenticated;

revoke execute on function public.is_following(uuid) from public, anon;
grant execute on function public.is_following(uuid) to authenticated;

revoke execute on function public.get_followed_users(uuid) from public, anon;
grant execute on function public.get_followed_users(uuid) to authenticated;

revoke execute on function public.get_follower_count(uuid) from public, anon;
grant execute on function public.get_follower_count(uuid) to authenticated, service_role;

revoke execute on function public.get_following_count(uuid) from public, anon;
grant execute on function public.get_following_count(uuid) to authenticated, service_role;

-- ============================================================
-- 5. SELF CHECK
-- ============================================================
select 'followed_users table exists' as check_name, exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'followed_users') as result
union all
select 'RLS enabled', relrowsecurity from pg_class where relname = 'followed_users'
union all
select '3 policies', count(*) = 3 from pg_policies where tablename = 'followed_users'
union all
select 'follow_user RPC', exists (select 1 from pg_proc where proname = 'follow_user')
union all
select 'unfollow_user RPC', exists (select 1 from pg_proc where proname = 'unfollow_user')
union all
select 'is_following RPC', exists (select 1 from pg_proc where proname = 'is_following')
union all
select 'get_followed_users RPC', exists (select 1 from pg_proc where proname = 'get_followed_users')
union all
select 'authenticated can execute follow_user', has_function_privilege('authenticated', 'public.follow_user(uuid)', 'EXECUTE')
union all
select 'authenticated can execute unfollow_user', has_function_privilege('authenticated', 'public.unfollow_user(uuid)', 'EXECUTE')
union all
select 'authenticated can execute is_following', has_function_privilege('authenticated', 'public.is_following(uuid)', 'EXECUTE');
