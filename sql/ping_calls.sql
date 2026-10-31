-- ============================================================
-- PING CALLS: WebRTC voice/video calls between users
-- G0.5/min billing (configurable), 1-on-1 only
-- ============================================================

-- Drop existing objects (idempotent)
drop table if exists public.ping_calls cascade;
drop function if exists public.gliits_call_heartbeat(uuid) cascade;

-- ============================================================
-- 1. CREATE PING_CALLS TABLE
-- ============================================================

create table if not exists public.ping_calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  call_type text not null default 'voice' check (call_type in ('voice', 'video')),
  status text not null default 'ringing'
    check (status in ('ringing', 'accepted', 'active', 'ended', 'missed', 'rejected', 'failed')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_secs integer default 0,
  gliits_charged numeric(10,2) default 0,
  created_at timestamptz default now(),
  constraint ping_calls_no_self check (caller_id != receiver_id)
);

-- Indexes for performance
create index if not exists idx_ping_calls_caller on public.ping_calls(caller_id, created_at desc);
create index if not exists idx_ping_calls_receiver on public.ping_calls(receiver_id, created_at desc);
create index if not exists idx_ping_calls_active on public.ping_calls(status) where status in ('ringing', 'accepted', 'active');

-- Enable RLS
alter table public.ping_calls enable row level security;

-- RLS Policies
-- Both parties can see their own calls
drop policy if exists "ping_calls_select_own" on public.ping_calls;
create policy "ping_calls_select_own"
  on public.ping_calls for select
  to authenticated
  using (caller_id = auth.uid() or receiver_id = auth.uid());

-- Any authenticated user can initiate a call
drop policy if exists "ping_calls_insert_own" on public.ping_calls;
create policy "ping_calls_insert_own"
  on public.ping_calls for insert
  to authenticated
  with check (caller_id = auth.uid());

-- Receiver can update status to accepted/rejected/missed
-- Both parties can update to ended
-- Service role can update for billing finalization
drop policy if exists "ping_calls_update_own" on public.ping_calls;
create policy "ping_calls_update_own"
  on public.ping_calls for update
  to authenticated
  using (caller_id = auth.uid() or receiver_id = auth.uid())
  with check (caller_id = auth.uid() or receiver_id = auth.uid());

-- Grant permissions
grant select, insert, update on public.ping_calls to authenticated;
grant select, insert, update on public.ping_calls to service_role;
revoke all on public.ping_calls from anon;

-- ============================================================
-- 2. ADD CALL RATE TO GLIITS_CONFIG
-- ============================================================

alter table public.gliits_config
  add column if not exists call_rate_gliits numeric(10,2) not null default 0.50;

-- Update default config if row exists
update public.gliits_config
  set call_rate_gliits = 0.50
  where id = 1 and call_rate_gliits is null;

-- ============================================================
-- 3. CREATE CALL HEARTBEAT RPC
-- ============================================================

create or replace function public.gliits_call_heartbeat(p_call_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_call record;
  v_balance numeric;
  v_rate numeric;
  v_plan_type text;
  v_plan_expires timestamptz;
  v_minutes_elapsed integer;
  v_charge_this_minute numeric;
begin
  -- Verify call exists, is active, and caller is auth user
  select * into v_call from public.ping_calls
  where id = p_call_id and status = 'active' and started_at is not null;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'CALL_NOT_ACTIVE');
  end if;

  if v_call.caller_id != auth.uid() then
    return jsonb_build_object('ok', false, 'code', 'NOT_CALLER');
  end if;

  -- Get user's plan
  select plan_type, expires_at into v_plan_type, v_plan_expires
  from public.gliits_plans where user_id = auth.uid();

  if v_plan_type is null or (v_plan_expires is not null and v_plan_expires < now()) then
    raise exception 'NO_ACTIVE_PLAN';
  end if;

  -- Get call rate
  select call_rate_gliits into v_rate from public.gliits_config where id = 1;

  -- Calculate minutes elapsed since call started
  v_minutes_elapsed := extract(epoch from (now() - v_call.started_at))::integer / 60;

  -- Only charge if a full minute has passed since last charge
  -- (caller's gliits_charged tracks total charged so far)
  v_charge_this_minute := case
    when v_minutes_elapsed > (v_call.gliits_charged / nullif(v_rate, 0)) then v_rate
    else 0
  end;

  -- payngo: deduct and check balance
  if v_plan_type = 'payngo' and v_charge_this_minute > 0 then
    select wallet_balance into v_balance from public.profiles where id = auth.uid();
    if v_balance < v_charge_this_minute then
      return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'balance', v_balance);
    end if;
    update public.profiles set wallet_balance = wallet_balance - v_charge_this_minute where id = auth.uid();
  end if;

  -- Log usage (no creator credit for peer-to-peer calls)
  if v_charge_this_minute > 0 then
    insert into public.gliits_usage (user_id, gliits_charged, creator_credited)
    values (auth.uid(), v_charge_this_minute, 0);
  end if;

  -- Update call totals
  update public.ping_calls
  set gliits_charged = gliits_charged + coalesce(v_charge_this_minute, 0),
      duration_secs = extract(epoch from (now() - started_at))::integer
  where id = p_call_id;

  -- Get updated balance
  select wallet_balance into v_balance from public.profiles where id = auth.uid();

  return jsonb_build_object(
    'ok', true,
    'balance', coalesce(v_balance, 0),
    'charged', coalesce(v_charge_this_minute, 0),
    'duration_secs', extract(epoch from (now() - v_call.started_at))::integer
  );
end;
$$;

-- Grant execute to authenticated
grant execute on function public.gliits_call_heartbeat(uuid) to authenticated;

-- ============================================================
-- 4. ADD 'call' TO NOTIFICATION KINDS
-- ============================================================

-- Drop existing constraint if it exists
alter table public.notifications drop constraint if exists notifications_kind_check;

-- Recreate with 'call' included
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('tag', 'mention', 'review', 'live', 'call', 'system'));

-- ============================================================
-- SELF CHECK GRID (run after applying this script)
-- ============================================================

-- Verify table exists
select 'ping_calls table' as check_name,
       case when to_regclass('public.ping_calls') is not null then 'OK' else 'MISSING' end as status;

-- Verify columns
select 'ping_calls.caller_id' as check_name,
       case when column_name is not null then 'OK' else 'MISSING' end as status
from information_schema.columns
where table_schema = 'public' and table_name = 'ping_calls' and column_name = 'caller_id';

select 'ping_calls.receiver_id' as check_name,
       case when column_name is not null then 'OK' else 'MISSING' end as status
from information_schema.columns
where table_schema = 'public' and table_name = 'ping_calls' and column_name = 'receiver_id';

select 'ping_calls.call_type' as check_name,
       case when column_name is not null then 'OK' else 'MISSING' end as status
from information_schema.columns
where table_schema = 'public' and table_name = 'ping_calls' and column_name = 'call_type';

select 'ping_calls.status' as check_name,
       case when column_name is not null then 'OK' else 'MISSING' end as status
from information_schema.columns
where table_schema = 'public' and table_name = 'ping_calls' and column_name = 'status';

-- Verify RLS enabled
select 'ping_calls RLS enabled' as check_name,
       case when relrowsecurity then 'OK' else 'DISABLED' end as status
from pg_class
where oid = 'public.ping_calls'::regclass;

-- Verify policies
select 'ping_calls policy: select_own' as check_name,
       case when count(*) = 1 then 'OK' else 'MISSING' end as status
from pg_policies
where schemaname = 'public' and tablename = 'ping_calls' and policyname = 'ping_calls_select_own';

select 'ping_calls policy: insert_own' as check_name,
       case when count(*) = 1 then 'OK' else 'MISSING' end as status
from pg_policies
where schemaname = 'public' and tablename = 'ping_calls' and policyname = 'ping_calls_insert_own';

select 'ping_calls policy: update_own' as check_name,
       case when count(*) = 1 then 'OK' else 'MISSING' end as status
from pg_policies
where schemaname = 'public' and tablename = 'ping_calls' and policyname = 'ping_calls_update_own';

-- Verify gliits_config has call_rate_gliits
select 'gliits_config.call_rate_gliits' as check_name,
       case when column_name is not null then 'OK' else 'MISSING' end as status
from information_schema.columns
where table_schema = 'public' and table_name = 'gliits_config' and column_name = 'call_rate_gliits';

-- Verify function exists
select 'gliits_call_heartbeat function' as check_name,
       case when count(*) = 1 then 'OK' else 'MISSING' end as status
from pg_proc
where proname = 'gliits_call_heartbeat' and pronamespace = (select oid from pg_namespace where nspname = 'public');

-- Verify notification constraint includes 'call'
select 'notifications kind includes call' as check_name,
       case when pg_get_constraintdef(oid) like '%call%' then 'OK' else 'MISSING' end as status
from pg_constraint
where conrelid = 'public.notifications'::regclass and conname = 'notifications_kind_check';

-- Summary
select '========================================' as summary;
select 'PING CALLS SCHEMA: Apply complete' as message;
select 'Run the SELF CHECK queries above to verify' as instruction;
select '========================================' as summary2;
