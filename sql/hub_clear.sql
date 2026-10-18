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
-- Delete all posts (cascades to post_contents via FK)
-- ------------------------------------------------------------
delete from public.posts where id is not null;

-- ------------------------------------------------------------
-- Clear hub interactions (comments, reactions, supports)
-- ------------------------------------------------------------
delete from public.hub_interactions where id is not null;

-- ------------------------------------------------------------
-- Clear billing events for premium unlocks on deleted posts
-- (FK cascade should handle this, but belt-and-suspenders)
-- ------------------------------------------------------------
delete from public.billing_events
where event_type = 'premium_unlock'
  and target_id in (select id from public.posts);

-- ------------------------------------------------------------
-- Clear reports targeting deleted posts
-- ------------------------------------------------------------
delete from public.reports
where target_type = 'post'
  and target_id in (select id from public.posts);

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
