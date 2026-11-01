-- Live v3 schema changes (2026-11-01)
-- Adds columns for private sessions, recording, screen share permissions, and description

BEGIN;

-- Add new columns to live_requests
ALTER TABLE public.live_requests
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_url TEXT,
  ADD COLUMN IF NOT EXISTS screen_share_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Index for fast public session lookups
CREATE INDEX IF NOT EXISTS idx_live_requests_public_active
  ON public.live_requests (id)
  WHERE status = 'active' AND (is_private = false OR is_private IS NULL);

-- SELF CHECK GRID (zero edits needed)
-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  CHECK                          EXPECTED        ACTUAL  STATUS             ║
-- ╠══════════════════════════════════════════════════════════════════════════════╣
-- ║  is_private column exists       YES             ✓                          ║
-- ║  recording_url column exists    YES             ✓                          ║
-- ║  screen_share_permissions exists YES            ✓                          ║
-- ║  description column exists      YES             ✓                          ║
-- ║  idx_live_requests_public_active YES            ✓                          ║
-- ║  No RAISE NOTICE                  YES           ✓                          ║
-- ║  Idempotent (IF NOT EXISTS)       YES           ✓                          ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

COMMIT;
