-- Drop all sponsor and event tables + related objects
-- Idempotent: safe to run multiple times

-- ============================================================================
-- SPONSOR TABLES
-- ============================================================================
DROP TABLE IF EXISTS sponsor_posts CASCADE;

-- ============================================================================
-- EVENT TABLES
-- ============================================================================
DROP TABLE IF EXISTS event_gp_earnings CASCADE;
DROP TABLE IF EXISTS event_post_likes CASCADE;
DROP TABLE IF EXISTS event_posts CASCADE;
DROP TABLE IF EXISTS event_team_members CASCADE;
DROP TABLE IF EXISTS event_teams CASCADE;
DROP TABLE IF EXISTS event_participants CASCADE;
DROP TABLE IF EXISTS event_prizes CASCADE;
DROP TABLE IF EXISTS event_pricing CASCADE;
DROP TABLE IF EXISTS event_categories CASCADE;
DROP TABLE IF EXISTS events CASCADE;

-- ============================================================================
-- DROP EVENT FUNCTIONS (if they exist)
-- ============================================================================
DROP FUNCTION IF EXISTS event_create(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT) CASCADE;
DROP FUNCTION IF EXISTS event_join(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS event_leave(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS event_post_create(UUID, UUID, TEXT, TEXT, TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS event_post_like(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS event_post_unlike(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS event_results(UUID) CASCADE;
DROP FUNCTION IF EXISTS event_start(UUID) CASCADE;
DROP FUNCTION IF EXISTS event_transition(UUID) CASCADE;

-- ============================================================================
-- REMOVE event_id COLUMN FROM feed_gliims (if it exists)
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'feed_gliims' AND column_name = 'event_id') THEN
    ALTER TABLE feed_gliims DROP COLUMN event_id;
  END IF;
END $$;

-- ============================================================================
-- SELF CHECK
-- ============================================================================
SELECT 'sponsor_posts' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'sponsor_posts') AS still_exists
UNION ALL SELECT 'events', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'events')
UNION ALL SELECT 'event_categories', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'event_categories')
UNION ALL SELECT 'event_participants', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'event_participants')
UNION ALL SELECT 'event_teams', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'event_teams')
UNION ALL SELECT 'event_team_members', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'event_team_members')
UNION ALL SELECT 'event_posts', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'event_posts')
UNION ALL SELECT 'event_post_likes', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'event_post_likes')
UNION ALL SELECT 'event_gp_earnings', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'event_gp_earnings')
UNION ALL SELECT 'event_prizes', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'event_prizes')
UNION ALL SELECT 'event_pricing', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'event_pricing');
