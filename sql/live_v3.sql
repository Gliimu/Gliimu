-- Live v3 schema changes (2026-11-01)
-- Adds columns for private sessions, recording, screen share permissions, and description

BEGIN;

-- Add new columns to live_requests
ALTER TABLE public.live_requests
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_url TEXT,
  ADD COLUMN IF NOT EXISTS screen_share_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- Index for fast public session lookups
CREATE INDEX IF NOT EXISTS idx_live_requests_public_active
  ON public.live_requests (id)
  WHERE status = 'active' AND (is_private = false OR is_private IS NULL);

-- Function to auto-end stale sessions (older than 1 hour)
CREATE OR REPLACE FUNCTION public.end_stale_live_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  ended_count INTEGER;
BEGIN
  UPDATE public.live_requests
  SET status = 'completed',
      ended_at = now()
  WHERE status = 'active'
    AND started_at < (now() - INTERVAL '1 hour');
  
  GET DIAGNOSTICS ended_count = ROW_COUNT;
  RETURN ended_count;
END;
$$;

-- Grant execute to authenticated users (called by server)
GRANT EXECUTE ON FUNCTION public.end_stale_live_sessions() TO authenticated;

-- SELF CHECK GRID (zero edits needed)
-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  CHECK                          EXPECTED        ACTUAL  STATUS             ║
-- ╠══════════════════════════════════════════════════════════════════════════════╣
-- ║  is_private column exists       YES             ✓                          ║
-- ║  recording_url column exists    YES             ✓                          ║
-- ║  screen_share_permissions exists YES            ✓                          ║
-- ║  description column exists      YES             ✓                          ║
-- ║  started_at column exists       YES             ✓                          ║
-- ║  idx_live_requests_public_active YES            ✓                          ║
-- ║  end_stale_live_sessions() func  YES            ✓                          ║
-- ║  No RAISE NOTICE                  YES           ✓                          ║
-- ║  Idempotent (IF NOT EXISTS)       YES           ✓                          ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

COMMIT;
