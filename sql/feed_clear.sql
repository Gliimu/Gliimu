-- ============================================================
-- Gliimu: Clear ALL feed content (Hub posts + Library items)
-- Run this in Supabase SQL Editor to empty the entire feed.
-- Safe to run more than once (idempotent).
--
-- WHAT THIS DELETES:
--   - All posts (gliims) and post_contents
--   - All library_items and library_contents
--   - All library_submissions (pending queue)
--   - All hub_interactions (comments, reactions, supports)
--   - All billing_events tied to these items
--   - All reports targeting these items
--   - All saved_posts and saved_items
--   - All purchases
--
-- AFTER RUNNING:
--   The entire feed (Hub + Library) will be completely empty.
--   Check SELF CHECK at bottom to verify deletion.
--
-- HOW TO RUN:
--   1. Copy ALL of this file
--   2. SQL Editor -> "+ New query"
--   3. Paste, Ctrl+A, click "Run" — once
--   4. Check Messages pane: SELF CHECK must show zero counts
-- ============================================================

-- ------------------------------------------------------------
-- Clear interactions first (no FK cascade)
-- ------------------------------------------------------------
delete from public.hub_interactions where id is not null;

-- ------------------------------------------------------------
-- Clear saved items
-- ------------------------------------------------------------
delete from public.saved_posts where id is not null;
delete from public.saved_items where id is not null;

-- ------------------------------------------------------------
-- Clear purchases
-- ------------------------------------------------------------
delete from public.purchases where id is not null;

-- ------------------------------------------------------------
-- Clear billing events for premium unlocks
-- (item_id is text, match before items are gone)
-- ------------------------------------------------------------
delete from public.billing_events
where event_type = 'premium_unlock'
  and (
    item_id in (select id::text from public.posts)
    or item_id in (select id::text from public.library_items)
  );

-- ------------------------------------------------------------
-- Clear reports targeting posts or library items
-- ------------------------------------------------------------
delete from public.reports
where (target_type = 'post' and target_id in (select id from public.posts))
   or (target_type = 'library_item' and target_id in (select id from public.library_items));

-- ------------------------------------------------------------
-- Clear library contents (FK cascade should handle this)
-- ------------------------------------------------------------
delete from public.library_contents where item_id is not null;

-- ------------------------------------------------------------
-- Clear library submissions (pending queue)
-- ------------------------------------------------------------
delete from public.library_submissions where id is not null;

-- ------------------------------------------------------------
-- Clear library items
-- ------------------------------------------------------------
delete from public.library_items where id is not null;

-- ------------------------------------------------------------
-- Clear post contents (FK cascade should handle this)
-- ------------------------------------------------------------
delete from public.post_contents where post_id is not null;

-- ------------------------------------------------------------
-- Clear posts (gliims)
-- ------------------------------------------------------------
delete from public.posts where id is not null;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- SELF CHECK — verify everything is cleared
-- All counts below should be 0
-- ------------------------------------------------------------
select
  'posts' as table_name, count(*) as row_count from public.posts
union all
select 'post_contents', count(*) from public.post_contents
union all
select 'library_items', count(*) from public.library_items
union all
select 'library_contents', count(*) from public.library_contents
union all
select 'library_submissions', count(*) from public.library_submissions
union all
select 'hub_interactions', count(*) from public.hub_interactions
union all
select 'saved_posts', count(*) from public.saved_posts
union all
select 'saved_items', count(*) from public.saved_items
union all
select 'purchases', count(*) from public.purchases
union all
select 'billing_events_unlock', count(*) from public.billing_events where event_type = 'premium_unlock'
union all
select 'reports', count(*) from public.reports
order by table_name;
