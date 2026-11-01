-- ============================================================
-- REMOVE PING CALLS FEATURE
-- Drops all call-related tables, functions, and columns
-- ============================================================

-- 1. Drop ping_calls table (cascades to indexes, policies, grants)
drop table if exists public.ping_calls cascade;

-- 2. Drop heartbeat function
drop function if exists public.gliits_call_heartbeat(uuid) cascade;

-- 3. Remove call_rate_gliits column from gliits_config
alter table public.gliits_config drop column if exists call_rate_gliits;

-- 4. Update notifications constraint to remove 'call' kind
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('tag', 'mention', 'review', 'live', 'system'));

-- ============================================================
-- SELF CHECK GRID
-- ============================================================

select 'ping_calls table removed' as check_name,
       case when to_regclass('public.ping_calls') is null then 'OK' else 'STILL EXISTS' end as status;

select 'gliits_call_heartbeat function removed' as check_name,
       case when count(*) = 0 then 'OK' else 'STILL EXISTS' end as status
from pg_proc
where proname = 'gliits_call_heartbeat' and pronamespace = (select oid from pg_namespace where nspname = 'public');

select 'gliits_config.call_rate_gliits column removed' as check_name,
       case when count(*) = 0 then 'OK' else 'STILL EXISTS' end as status
from information_schema.columns
where table_schema = 'public' and table_name = 'gliits_config' and column_name = 'call_rate_gliits';

select 'notifications constraint updated' as check_name,
       case when pg_get_constraintdef(oid) not like '%call%' then 'OK' else 'STILL HAS CALL' end as status
from pg_constraint
where conrelid = 'public.notifications'::regclass and conname = 'notifications_kind_check';

select '========================================' as summary;
select 'PING CALLS REMOVAL: Complete' as message;
select '========================================' as summary2;
