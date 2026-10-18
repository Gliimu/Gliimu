-- ============================================================
-- Gliimu: Clear all Hub posts and related data
-- Run this in Supabase SQL Editor to empty the entire Hub.
-- Safe to run more than once (idempotent).
--
-- WHAT THIS DELETES:
--   - All rows from posts table (cascades to post_contents)
--   - All hub_interactions (comments, reactions, supports)
--   - All billing_events tied to premium unlocks of these posts
--   - All report entries targeting these posts
--
-- AFTER RUNNING:
--   The Hub feed will be completely empty. Users can start fresh.
--   Check SELF CHECK at bottom to verify deletion.
--
-- HOW TO RUN:
--   1. Open this file, Ctrl+A, Ctrl+C (copy ALL of it)
--   2. In Supabase: SQL Editor -> "+ New query"
--   3. Paste. Do NOT edit anything.
--   4. Ctrl+A once inside editor, click "Run" — once.
--   5. Check Messages pane: SELF CHECK must show zero posts.
-- ============================================================

-- ------------------------------------------------------------
-- Clear hub interactions (comments, reactions, supports)
-- Must run BEFORE deleting posts since FK has no cascade
-- ------------------------------------------------------------
delete from public.hub_interactions where id is not null;

-- ------------------------------------------------------------
-- Clear saved_posts referencing these posts
-- ------------------------------------------------------------
delete from public.saved_posts where id is not null;

-- ------------------------------------------------------------
-- Clear billing events for premium unlocks on ALL posts
-- (item_id is text, so we match before posts are gone)
-- ------------------------------------------------------------
delete from public.billing_events
where event_type = 'premium_unlock'
  and item_id in (select id::text from public.posts);

-- ------------------------------------------------------------
-- Clear reports targeting posts
-- Must run BEFORE deleting posts
-- ------------------------------------------------------------
delete from public.reports
where target_type = 'post';

-- ------------------------------------------------------------
-- Delete all posts (cascades to post_contents via FK)
-- ------------------------------------------------------------
delete from public.posts where id is not null;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- SELF CHECK — verify everything is cleared
-- ------------------------------------------------------------
do $$
begin
  raise notice '=== HUB CLEAR SELF CHECK ===';
  raise notice 'posts count:             %', (select count(*) from public.posts);
  raise notice 'post_contents count:     %', (select count(*) from public.post_contents);
  raise notice 'hub_interactions count:  %', (select count(*) from public.hub_interactions);
  raise notice 'billing_events (unlock): %', (select count(*) from public.billing_events where event_type = 'premium_unlock');
  raise notice 'reports (post targets):  %', (select count(*) from public.reports where target_type = 'post');
  raise notice '';
  raise notice 'All counts above should be 0.';
end $$;
