-- sql/verification_badges.sql — Remove GP→Gliits conversion + add verification badges
-- Run this script once

-- ============================================================
-- 1. REMOVE GP→GLIITS AUTO-CONVERSION
-- ============================================================
drop trigger if exists trg_gliits_auto_gp_conversion on public.profiles;
drop function if exists public.gliits_auto_gp_conversion();

-- ============================================================
-- 2. ADD VERIFICATION BADGE COLUMN
-- ============================================================
alter table public.profiles
add column if not exists verification_badge text;

-- Add check constraint to allow only valid badge types
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_verification_badge_check'
  ) then
    alter table public.profiles
    add constraint profiles_verification_badge_check
    check (verification_badge is null or verification_badge in ('tick', 'pen', 'pod'));
  end if;
end $$;

-- ============================================================
-- 3. ADMIN RPC: GRANT VERIFICATION BADGE
-- ============================================================
drop function if exists public.admin_grant_verification(uuid, text);
create or replace function public.admin_grant_verification(p_user_id uuid, p_badge text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only admins can grant badges
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Unauthorized';
  end if;

  -- Validate badge type
  if p_badge not in ('tick', 'pen', 'pod') then
    raise exception 'Invalid badge type';
  end if;

  update public.profiles
  set verification_badge = p_badge
  where id = p_user_id;
end;
$$;

revoke execute on function public.admin_grant_verification(uuid, text) from public, anon;
grant execute on function public.admin_grant_verification(uuid, text) to authenticated;

-- ============================================================
-- 4. ADMIN RPC: REVOKE VERIFICATION BADGE
-- ============================================================
drop function if exists public.admin_revoke_verification(uuid);
create or replace function public.admin_revoke_verification(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only admins can revoke badges
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Unauthorized';
  end if;

  update public.profiles
  set verification_badge = null
  where id = p_user_id;
end;
$$;

revoke execute on function public.admin_revoke_verification(uuid) from public, anon;
grant execute on function public.admin_revoke_verification(uuid) to authenticated;

-- ============================================================
-- SELF CHECK
-- ============================================================
do $$
declare
  v_trigger_exists boolean;
  v_column_exists boolean;
  v_rpc_exists boolean;
begin
  raise notice '=== VERIFICATION BADGES SELF CHECK ===';

  -- Check trigger is gone
  select exists (
    select 1 from pg_trigger where tgname = 'trg_gliits_auto_gp_conversion'
  ) into v_trigger_exists;

  if v_trigger_exists then
    raise exception 'GP→Gliits trigger still exists';
  end if;
  raise notice '✓ GP→Gliits auto-conversion removed';

  -- Check column exists
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'verification_badge'
  ) into v_column_exists;

  if not v_column_exists then
    raise exception 'verification_badge column missing';
  end if;
  raise notice '✓ verification_badge column exists';

  -- Check RPCs exist
  select exists (
    select 1 from pg_proc where proname = 'admin_grant_verification'
  ) into v_rpc_exists;

  if not v_rpc_exists then
    raise exception 'admin_grant_verification RPC missing';
  end if;
  raise notice '✓ admin_grant_verification RPC exists';

  select exists (
    select 1 from pg_proc where proname = 'admin_revoke_verification'
  ) into v_rpc_exists;

  if not v_rpc_exists then
    raise exception 'admin_revoke_verification RPC missing';
  end if;
  raise notice '✓ admin_revoke_verification RPC exists';

  raise notice '=== ALL CHECKS PASSED ===';
  raise notice 'Badge types: tick, pen, pod';
  raise notice 'GP no longer converts to Gliits';
end $$;
