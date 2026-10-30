-- ============================================================
-- DROP DEAD LIBRARY TABLES
-- Removes feed_items, feed_submissions, feed_contents, reading_progress
-- and all related functions/policies. These tables are unused infrastructure.
-- ============================================================

-- 1. Drop reading_progress (FK to feed_items)
drop table if exists public.reading_progress cascade;

-- 2. Drop feed_contents (FK to feed_items)
drop table if exists public.feed_contents cascade;

-- 3. Drop feed_items
drop table if exists public.feed_items cascade;

-- 4. Drop feed_submissions
drop table if exists public.feed_submissions cascade;

-- 5. Drop admin_review_submission function (targets library_submissions)
drop function if exists public.admin_review_submission(uuid, text, text) cascade;

-- 6. Drop library_item_unlocked function (targets library_items)
drop function if exists public.library_item_unlocked(uuid) cascade;

-- 7. Drop complete_reading function (targets feed_items)
drop function if exists public.complete_reading(uuid) cascade;

-- 8. Drop related_publications function (targets feed_items)
drop function if exists public.related_publications(uuid, integer) cascade;

-- 9. Remove 'library_item' from reports target_type check constraint
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post', 'comment', 'user'));

-- CASCADE above only drops FK constraints from saved_items/purchases,
-- not the tables themselves (they're still used for feed_gliims).

notify pgrst, 'reload schema';

-- ============================================================
-- SELF CHECK
-- ============================================================
select 1 as "#", 'reading_progress dropped' as item,
       case when to_regclass('public.reading_progress') is null then 'OK' else 'STILL EXISTS' end as result
union all select 2, 'feed_contents dropped',
       case when to_regclass('public.feed_contents') is null then 'OK' else 'STILL EXISTS' end
union all select 3, 'feed_items dropped',
       case when to_regclass('public.feed_items') is null then 'OK' else 'STILL EXISTS' end
union all select 4, 'feed_submissions dropped',
       case when to_regclass('public.feed_submissions') is null then 'OK' else 'STILL EXISTS' end
union all select 5, 'admin_review_submission dropped',
       case when to_regprocedure('public.admin_review_submission(uuid,text,text)') is null then 'OK' else 'STILL EXISTS' end
union all select 6, 'library_item_unlocked dropped',
       case when to_regprocedure('public.library_item_unlocked(uuid)') is null then 'OK' else 'STILL EXISTS' end
union all select 7, 'complete_reading dropped',
       case when to_regprocedure('public.complete_reading(uuid)') is null then 'OK' else 'STILL EXISTS' end
union all select 8, 'related_publications dropped',
       case when to_regprocedure('public.related_publications(uuid,integer)') is null then 'OK' else 'STILL EXISTS' end
union all select 9, 'reports constraint updated',
       case when exists (select 1 from pg_constraint where conname = 'reports_target_type_check')
            then 'OK' else 'MISSING' end
order by "#";
