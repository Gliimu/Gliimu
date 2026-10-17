-- Add category column to deals table for gig categorization.
-- Idempotent: safe to run multiple times.

begin;

-- 1. Add the category column if it does not exist.
alter table public.deals
  add column if not exists category text;

-- 2. Backfill existing rows that have no category as 'Others'.
update public.deals
  set category = 'Others'
  where category is null;

-- 3. Self-check grid.
select 'col_category' as check, case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'deals' and column_name = 'category'
) then 'OK' else 'MISSING' end as status
union all
select 'backfill', case when count(*) = 0 then 'OK' else count(*)::text || ' still null' end
  from public.deals where category is null
union all
select 'total_deals', count(*)::text from public.deals;

commit;
