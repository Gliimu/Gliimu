-- ============================================================
-- Remove Live Session Billing
-- Drops per-minute billing functions, participant tracking,
-- and related config columns.
-- ============================================================
BEGIN;

-- 1. Drop billing RPC functions
DROP FUNCTION IF EXISTS public.live_billing_tick(UUID);
DROP FUNCTION IF EXISTS public.live_session_finalize(UUID);
DROP FUNCTION IF EXISTS public.live_session_join(UUID);
DROP FUNCTION IF EXISTS public.live_session_leave(UUID);
DROP FUNCTION IF EXISTS public.live_billing_summary(UUID);

-- 2. Drop participant tracking table
DROP TABLE IF EXISTS public.live_session_participants CASCADE;

-- 3. Remove billing config columns from gliits_config
ALTER TABLE public.gliits_config
  DROP COLUMN IF EXISTS live_rate_gliits,
  DROP COLUMN IF EXISTS live_host_share;

COMMIT;

-- SELF CHECK
-- Run each query below — every row must return zero or "does not exist":
--
-- SELECT count(*) FROM pg_proc WHERE proname = 'live_billing_tick';
-- SELECT count(*) FROM pg_proc WHERE proname = 'live_session_finalize';
-- SELECT count(*) FROM pg_proc WHERE proname = 'live_session_join';
-- SELECT count(*) FROM pg_proc WHERE proname = 'live_session_leave';
-- SELECT count(*) FROM pg_proc WHERE proname = 'live_billing_summary';
-- SELECT count(*) FROM information_schema.tables WHERE table_name = 'live_session_participants';
-- SELECT count(*) FROM information_schema.columns WHERE table_name = 'gliits_config' AND column_name IN ('live_rate_gliits', 'live_host_share');
