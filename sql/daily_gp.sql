-- sql/daily_gp.sql — Daily GP reward system
-- Users get 10 GP every 24 hours they're active
-- If they miss 2 days in a row, they lose 7 GP
-- Run this script once to set up the system

-- ============================================================
-- 1. ADD last_activity_date COLUMN IF NOT EXISTS
-- ============================================================
alter table public.profiles
add column if not exists last_activity_date date;

alter table public.profiles
add column if not exists consecutive_missed_days integer not null default 0;

comment on column public.profiles.last_activity_date is 'Date of user last activity (for daily GP tracking)';
comment on column public.profiles.consecutive_missed_days is 'Number of consecutive days the user has been inactive';

-- ============================================================
-- 2. DAILY GP CLAIM FUNCTION
-- ============================================================
-- Call this when a user logs in or performs any action
-- Returns: jsonb with status and GP change
create or replace function public.claim_daily_gp()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_today date;
  v_last_date date;
  v_days_since integer;
  v_gp_change integer;
  v_status text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_today := current_date;

  -- Get current state
  select last_activity_date, consecutive_missed_days
  into v_last_date, v_days_since
  from public.profiles
  where id = v_user_id;

  -- First time user or never tracked
  if v_last_date is null then
    update public.profiles
    set last_activity_date = v_today,
        consecutive_missed_days = 0,
        total_gp = coalesce(total_gp, 0) + 10
    where id = v_user_id;

    -- Log the transaction
    insert into public.gp_ledger (user_id, amount, type, status, description)
    values (v_user_id, 10, 'reward', 'success', 'Daily GP reward');

    return jsonb_build_object('status', 'first_claim', 'gp_change', 10, 'new_balance', (select total_gp from public.profiles where id = v_user_id));
  end if;

  v_days_since := v_today - v_last_date;

  -- Already claimed today
  if v_days_since = 0 then
    return jsonb_build_object('status', 'already_claimed', 'gp_change', 0, 'new_balance', (select total_gp from public.profiles where id = v_user_id));
  end if;

  -- Missed 2 or more days
  if v_days_since >= 2 then
    v_gp_change := -7;
    v_status := 'penalty';

    update public.profiles
    set last_activity_date = v_today,
        consecutive_missed_days = v_days_since,
        total_gp = greatest(0, coalesce(total_gp, 0) - 7)
    where id = v_user_id;

    -- Log the penalty
    insert into public.gp_ledger (user_id, amount, type, status, description)
    values (v_user_id, -7, 'penalty', 'success', 'Inactive for ' || v_days_since || ' days');

    return jsonb_build_object('status', v_status, 'gp_change', v_gp_change, 'days_missed', v_days_since, 'new_balance', (select total_gp from public.profiles where id = v_user_id));
  end if;

  -- Active yesterday or today (normal daily reward)
  v_gp_change := 10;
  v_status := 'reward';

  update public.profiles
  set last_activity_date = v_today,
      consecutive_missed_days = 0,
      total_gp = coalesce(total_gp, 0) + 10
  where id = v_user_id;

  -- Log the reward
  insert into public.gp_ledger (user_id, amount, type, status, description)
  values (v_user_id, 10, 'reward', 'success', 'Daily GP reward');

  return jsonb_build_object('status', v_status, 'gp_change', v_gp_change, 'new_balance', (select total_gp from public.profiles where id = v_user_id));
end;
$$;

revoke execute on function public.claim_daily_gp() from public, anon;
grant execute on function public.claim_daily_gp() to authenticated;

-- ============================================================
-- 3. CHECK DAILY GP STATUS (without claiming)
-- ============================================================
create or replace function public.check_daily_gp_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_today date;
  v_last_date date;
  v_days_since integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_today := current_date;

  select last_activity_date
  into v_last_date
  from public.profiles
  where id = v_user_id;

  if v_last_date is null then
    return jsonb_build_object('can_claim', true, 'status', 'first_time');
  end if;

  v_days_since := v_today - v_last_date;

  if v_days_since = 0 then
    return jsonb_build_object('can_claim', false, 'status', 'already_claimed');
  elsif v_days_since >= 2 then
    return jsonb_build_object('can_claim', true, 'status', 'penalty', 'days_missed', v_days_since, 'penalty_amount', 7);
  else
    return jsonb_build_object('can_claim', true, 'status', 'reward', 'reward_amount', 10);
  end if;
end;
$$;

revoke execute on function public.check_daily_gp_status() from public, anon;
grant execute on function public.check_daily_gp_status() to authenticated;

-- ============================================================
-- SELF CHECK
-- ============================================================
do $$
begin
  raise notice '=== DAILY GP SYSTEM SELF CHECK ===';

  -- Check columns exist
  if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'last_activity_date') then
    raise exception 'last_activity_date column missing';
  end if;
  raise notice '✓ last_activity_date column exists';

  if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'consecutive_missed_days') then
    raise exception 'consecutive_missed_days column missing';
  end if;
  raise notice '✓ consecutive_missed_days column exists';

  -- Check functions exist
  if not exists (select 1 from pg_proc where proname = 'claim_daily_gp') then
    raise exception 'claim_daily_gp function missing';
  end if;
  raise notice '✓ claim_daily_gp function exists';

  if not exists (select 1 from pg_proc where proname = 'check_daily_gp_status') then
    raise exception 'check_daily_gp_status function missing';
  end if;
  raise notice '✓ check_daily_gp_status function exists';

  raise notice '=== ALL CHECKS PASSED ===';
end $$;
