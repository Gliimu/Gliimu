-- ===========================================================================
-- sql/remove_featuring.sql — switch featuring off for good
-- ===========================================================================
-- Gliimu no longer features anyone's content, paid or organic. This removes
-- the last database half of that feature:
--
--   featured_posts            the paid carousel table (0 rows live today)
--   featured_slot_check()     "is a paid slot free?" used by the old #/feature page
--   xplore_spotlight()        the organic creator tiles under the XpLoRe search box
--   earned_gp_pattern()       only xplore_spotlight() read this list
--   profiles.feature_my_profile  the per-creator opt-in switch
--
-- The client code for all of it is already deleted, and no live function,
-- policy or view reads any of these objects except xplore_spotlight() reading
-- feature_my_profile, which this script drops first.
--
-- BEFORE RUNNING: the definitions of everything below existed only in the
-- database. They are archived verbatim in sql/archive_featured_posts.sql, so
-- the feature can be rebuilt. Rows are the other half of the archive, and the
-- first query under RUN ME does exactly that.
--
-- ---------------------------------------------------------------------------
-- RUN ME — step 1 (optional, 2 seconds): snapshot any surviving rows.
--   select * from public.featured_posts order by created_at desc;
--   Expected today: 0 rows. Anything you see here is your only copy.
--
-- RUN ME — step 2: paste everything between the BEGIN/COMMIT markers into the
--   Supabase SQL editor (Dashboard → SQL editor → New query → Paste → Run),
--   then run step 3.
--
-- RUN ME — step 3 (no editing): the SELF CHECK grid at the bottom of this
--   file. Every row in the result must say PASS. If any row says FAIL, stop
--   and send me the grid.
-- ---------------------------------------------------------------------------

begin;

-- The three RPCs go first so the table has no database dependants left.
drop function if exists public.featured_slot_check();
drop function if exists public.xplore_spotlight(integer, integer);
drop function if exists public.earned_gp_pattern();

-- Safe to repeat: nothing else references featured_posts by id, so the
-- historical 'Featured content: ...' rows in transactions stay untouched and
-- still read as the money record they are.
drop table if exists public.featured_posts;

-- The organic opt-in. 2 profiles had it on; the flag has no reader left.
alter table if exists public.profiles
  drop column if exists feature_my_profile;

commit;

-- ===========================================================================
-- SELF CHECK — paste as-is. 8 rows, every one must read PASS.
-- ===========================================================================
select 'featured_posts table gone' as check,
       'absent' as expected,
       case when to_regclass('public.featured_posts') is null
            then 'absent' else 'still there' end as actual,
       case when to_regclass('public.featured_posts') is null
            then 'PASS' else 'FAIL' end as result

union all
select 'featured_slot_check() gone', 'absent',
       case when count(*) = 0 then 'absent' else 'still there' end,
       case when count(*) = 0 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'featured_slot_check'

union all
select 'xplore_spotlight() gone', 'absent',
       case when count(*) = 0 then 'absent' else 'still there' end,
       case when count(*) = 0 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'xplore_spotlight'

union all
select 'earned_gp_pattern() gone', 'absent',
       case when count(*) = 0 then 'absent' else 'still there' end,
       case when count(*) = 0 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'earned_gp_pattern'

union all
select 'feature_my_profile column gone', 'absent',
       case when count(*) = 0 then 'absent' else 'still there' end,
       case when count(*) = 0 then 'PASS' else 'FAIL' end
  from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles'
   and column_name = 'feature_my_profile'

union all
-- Proves the drop took one column off profiles, not the table itself.
select 'profiles still has 26 columns', '26',
       (select count(*)::text
          from pg_attribute
         where attrelid = 'public.profiles'::regclass
           and attnum > 0 and not attisdropped),
       case when (select count(*) from pg_attribute
                   where attrelid = 'public.profiles'::regclass
                     and attnum > 0 and not attisdropped) = 26
            then 'PASS' else 'FAIL' end

union all
-- The support money paths must survive; they are a different feature.
select 'support functions alive', '2 of 2',
       (select count(distinct p.proname)::text || ' of 2'
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('send_support', 'support_live_session')),
       case when (select count(distinct p.proname)
                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public'
                     and p.proname in ('send_support', 'support_live_session')) = 2
            then 'PASS' else 'FAIL' end

union all
-- The paid-era ledger stays readable in the wallet history.
select 'featured ledger rows kept', '3 or more',
       (select count(*)::text from public.transactions
         where description like 'Featured content:%'),
       case when (select count(*) from public.transactions
                   where description like 'Featured content:%') >= 3
            then 'PASS' else 'FAIL' end

order by 1;
