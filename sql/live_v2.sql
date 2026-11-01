-- ============================================================
-- Live v2 — join codes, hand raises, no participant cap
-- Idempotent. Run once in Supabase SQL editor.
-- ============================================================

BEGIN;

-- 1. Add join_code (6-char alphanumeric, unique per active session)
ALTER TABLE public.live_requests
  ADD COLUMN IF NOT EXISTS join_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_requests_join_code_active
  ON public.live_requests (join_code)
  WHERE join_code IS NOT NULL AND status IN ('open', 'active');

-- 2. Add hand_raises JSONB: {"<userId>": <epoch_ms>, ...}
ALTER TABLE public.live_requests
  ADD COLUMN IF NOT EXISTS hand_raises JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. Drop the participant cap columns (no longer enforced)
ALTER TABLE public.live_requests
  ALTER COLUMN max_participants DROP NOT NULL,
  ALTER COLUMN max_participants SET DEFAULT 0;

-- 4. Replace increment/decrement RPCs with a simple join/leave
--    that no longer checks capacity.
CREATE OR REPLACE FUNCTION public.increment_participant_count(p_request_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.live_requests
  SET participant_count = COALESCE(participant_count, 0) + 1
  WHERE id = p_request_id
    AND status IN ('open', 'active')
    AND NOT COALESCE(is_locked, FALSE)
    AND (user_id = auth.uid()
         OR sharing_mode = 'general'
         OR (sharing_mode = 'users'
             AND invited_user_ids @> jsonb_build_array(auth.uid()::text)))
  RETURNING participant_count INTO v_new_count;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session is locked, closed, or not accessible';
  END IF;

  RETURN v_new_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_participant_count(p_request_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.live_requests
  SET participant_count = GREATEST(0, participant_count - 1)
  WHERE id = p_request_id
    AND (user_id = auth.uid()
         OR sharing_mode = 'general'
         OR (sharing_mode = 'users'
             AND invited_user_ids @> jsonb_build_array(auth.uid()::text)))
  RETURNING participant_count INTO v_new_count;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or not accessible';
  END IF;

  RETURN v_new_count;
END;
$$;

-- 5. Resolve a join code to an active/open session.
--    Returns NULL if code unknown or session no longer joinable.
CREATE OR REPLACE FUNCTION public.live_resolve_join_code(p_code TEXT)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  title TEXT,
  description TEXT,
  status TEXT,
  sharing_mode TEXT,
  room_url TEXT,
  room_id TEXT,
  is_locked BOOLEAN,
  participant_count INTEGER,
  host_name TEXT,
  host_avatar TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT r.id, r.user_id, r.title, r.description, r.status, r.sharing_mode,
         r.room_url, r.room_id, r.is_locked, r.participant_count,
         p.full_name AS host_name, p.avatar_url AS host_avatar
    FROM public.live_requests r
    LEFT JOIN public.profiles p ON p.id = r.user_id
   WHERE r.join_code = UPPER(TRIM(p_code))
     AND r.status IN ('open', 'active')
     AND r.room_url IS NOT NULL
   LIMIT 1;
END;
$$;

-- 6. Hand-raise toggle. Pass p_raised = true to raise, false to clear own.
--    Hosts may clear any user by passing p_target_user_id.
CREATE OR REPLACE FUNCTION public.live_toggle_hand_raise(
  p_request_id UUID,
  p_raised BOOLEAN,
  p_target_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_owner UUID;
  v_current JSONB;
  v_target UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_owner FROM public.live_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  v_target := COALESCE(p_target_user_id, v_caller);

  -- Only the subject themselves or the host may modify the raise state.
  IF v_target <> v_caller AND v_caller <> v_owner THEN
    RAISE EXCEPTION 'Only the user or the host may change this raise state';
  END IF;

  UPDATE public.live_requests
     SET hand_raises = CASE
         WHEN p_raised THEN hand_raises || jsonb_build_object(v_target::text, (EXTRACT(EPOCH FROM now()) * 1000)::bigint)
         ELSE hand_raises - v_target::text
       END
   WHERE id = p_request_id
  RETURNING hand_raises INTO v_current;

  RETURN v_current;
END;
$$;

-- 7. Grants
REVOKE ALL ON FUNCTION public.increment_participant_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_participant_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_resolve_join_code(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_toggle_hand_raise(UUID, BOOLEAN, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.increment_participant_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_participant_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.live_resolve_join_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.live_toggle_hand_raise(UUID, BOOLEAN, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- SELF CHECK — paste into a new empty Supabase SQL query, Run.
-- ============================================================

SELECT 1 AS "#", 'join_code column exists' AS item,
       CASE WHEN EXISTS (
              SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='live_requests'
                 AND column_name='join_code')
            THEN 'OK' ELSE 'MISSING' END AS result
UNION ALL
SELECT 2, 'hand_raises column exists',
       CASE WHEN EXISTS (
              SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='live_requests'
                 AND column_name='hand_raises')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 3, 'unique partial index on join_code',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_indexes
               WHERE schemaname='public' AND tablename='live_requests'
                 AND indexname='idx_live_requests_join_code_active')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 4, 'live_resolve_join_code RPC exists',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_proc p
               JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname='public' AND p.proname='live_resolve_join_code')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 5, 'live_toggle_hand_raise RPC exists',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_proc p
               JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname='public' AND p.proname='live_toggle_hand_raise')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 6, 'authenticated can execute resolve_join_code',
       CASE WHEN has_function_privilege(
              (SELECT p.oid FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname='public' AND p.proname='live_resolve_join_code'
               LIMIT 1),
              'authenticated'::regrole, 'EXECUTE')
            THEN 'OK' ELSE 'CHECK GRANT' END
UNION ALL
SELECT 7, 'authenticated can execute toggle_hand_raise',
       CASE WHEN has_function_privilege(
              (SELECT p.oid FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname='public' AND p.proname='live_toggle_hand_raise'
               LIMIT 1),
              'authenticated'::regrole, 'EXECUTE')
            THEN 'OK' ELSE 'CHECK GRANT' END;
