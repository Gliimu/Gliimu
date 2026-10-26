-- Referral purchase bonus has been removed.
-- This script now only cleans up the old purchase bonus objects if they exist.
-- The base referral setup (100 GP signup reward) is in setup_all.sql.

begin;

-- Drop the purchase bonus function if it exists
drop function if exists public.referral_purchase_bonus_due(uuid) cascade;

-- Drop the purchase bonus columns if they exist
alter table public.referrals drop column if exists purchase_bonus_gp;
alter table public.referrals drop column if exists purchase_bonus_at;

notify pgrst, 'reload schema';
commit;

select 1 as "#", 'purchase bonus function removed' as item,
  case when to_regprocedure('public.referral_purchase_bonus_due(uuid)') is null
    then 'OK' else 'STILL EXISTS' end as result
union all
select 2, 'purchase_bonus_gp column removed',
  case when not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referrals'
      and column_name = 'purchase_bonus_gp'
  ) then 'OK' else 'STILL EXISTS' end
union all
select 3, 'purchase_bonus_at column removed',
  case when not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referrals'
      and column_name = 'purchase_bonus_at'
  ) then 'OK' else 'STILL EXISTS' end
order by "#";
