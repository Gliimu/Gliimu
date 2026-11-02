BEGIN;

ALTER TABLE public.live_requests
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Keep JSONB: existing live_requests policies depend on this column's type.
ALTER TABLE public.live_requests
  ALTER COLUMN invited_user_ids SET DEFAULT '[]'::jsonb;

-- Earlier clients stored a JSON string containing an array instead of an array.
UPDATE public.live_requests
SET invited_user_ids = (invited_user_ids #>> '{}')::jsonb
WHERE jsonb_typeof(invited_user_ids) = 'string';

ALTER TABLE public.live_requests
  DROP CONSTRAINT IF EXISTS live_requests_status_check;

UPDATE public.live_requests
SET status = CASE status
  WHEN 'waiting' THEN 'open'
  WHEN 'live' THEN 'active'
  WHEN 'ended' THEN 'completed'
END
WHERE status IN ('waiting', 'live', 'ended');

ALTER TABLE public.live_requests
  ALTER COLUMN status SET DEFAULT 'open',
  ADD CONSTRAINT live_requests_status_check
    CHECK (status IN ('open', 'active', 'completed', 'cancelled'));

CREATE TABLE IF NOT EXISTS public.live_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.live_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 1000),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.live_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS live_chat_read ON public.live_chat_messages;
DROP POLICY IF EXISTS live_chat_insert ON public.live_chat_messages;

CREATE POLICY live_chat_read ON public.live_chat_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.live_requests r
      WHERE r.id = live_chat_messages.room_id
        AND (
          r.user_id = (SELECT auth.uid())
          OR r.sharing_mode = 'general'
          OR (r.sharing_mode = 'users'
            AND r.invited_user_ids @> jsonb_build_array((SELECT auth.uid())::text))
        )
    )
  );

CREATE POLICY live_chat_insert ON public.live_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.live_requests r
      WHERE r.id = live_chat_messages.room_id
        AND r.status = 'active'
        AND (
          r.user_id = (SELECT auth.uid())
          OR r.sharing_mode = 'general'
          OR (r.sharing_mode = 'users'
            AND r.invited_user_ids @> jsonb_build_array((SELECT auth.uid())::text))
        )
    )
  );

GRANT SELECT, INSERT ON public.live_chat_messages TO authenticated;
-- The Express server reads/writes chat via the service_role key, so it needs
-- table privileges too (RLS is bypassed for service_role, but GRANTs are not).
GRANT ALL PRIVILEGES ON public.live_chat_messages TO service_role;

CREATE INDEX IF NOT EXISTS idx_live_chat_messages_room_id
  ON public.live_chat_messages(room_id);

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
    AND COALESCE(participant_count, 0) < max_participants
    AND (user_id = auth.uid() OR sharing_mode = 'general'
      OR (sharing_mode = 'users' AND invited_user_ids @> jsonb_build_array(auth.uid()::text)))
  RETURNING participant_count INTO v_new_count;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session is full, locked, closed, or not accessible';
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
    AND (user_id = auth.uid() OR sharing_mode = 'general'
      OR (sharing_mode = 'users' AND invited_user_ids @> jsonb_build_array(auth.uid()::text)))
  RETURNING participant_count INTO v_new_count;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or not accessible';
  END IF;

  RETURN v_new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_participant_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_participant_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_participant_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_participant_count(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT check_name, CASE WHEN passed THEN 'OK' ELSE 'CHECK REQUIRED' END AS status
FROM (
  SELECT 'Completion columns exist' AS check_name,
    (SELECT count(*) = 2 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'live_requests'
       AND column_name IN ('completed_by', 'completed_at')) AS passed
  UNION ALL
  SELECT 'Invite column remains JSONB', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_requests'
      AND column_name = 'invited_user_ids' AND data_type = 'jsonb'
  )
  UNION ALL
  SELECT 'Invite values are arrays or null', NOT EXISTS (
    SELECT 1 FROM public.live_requests
    WHERE invited_user_ids IS NOT NULL
      AND jsonb_typeof(invited_user_ids) NOT IN ('array', 'null')
  )
  UNION ALL
  SELECT 'Existing live_requests_select policy retained', EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'live_requests' AND policyname = 'live_requests_select'
  )
  UNION ALL
  SELECT 'Status constraint and default aligned', EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.live_requests'::regclass
      AND conname = 'live_requests_status_check'
      AND pg_get_constraintdef(oid) LIKE '%completed%'
      AND pg_get_constraintdef(oid) LIKE '%cancelled%'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_requests'
      AND column_name = 'status' AND column_default = '''open''::text'
  )
  UNION ALL
  SELECT 'Live table row-level security enabled',
    (SELECT count(*) = 2 FROM pg_class
     WHERE oid IN ('public.live_requests'::regclass, 'public.live_chat_messages'::regclass)
       AND relrowsecurity)
  UNION ALL
  SELECT 'Chat policies installed',
    (SELECT count(*) = 2 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'live_chat_messages'
       AND policyname IN ('live_chat_read', 'live_chat_insert'))
  UNION ALL
  SELECT 'Chat grants installed',
    has_table_privilege('authenticated', 'public.live_chat_messages', 'SELECT')
    AND has_table_privilege('authenticated', 'public.live_chat_messages', 'INSERT')
    AND has_table_privilege('service_role', 'public.live_chat_messages', 'SELECT')
    AND has_table_privilege('service_role', 'public.live_chat_messages', 'INSERT')
  UNION ALL
  SELECT 'Participant RPCs installed without bypassing RLS',
    (SELECT count(*) = 2 FROM pg_proc
     WHERE oid IN (to_regprocedure('public.increment_participant_count(uuid)'),
                   to_regprocedure('public.decrement_participant_count(uuid)'))
       AND NOT prosecdef)
  UNION ALL
  SELECT 'Participant RPC grants installed',
    has_function_privilege('authenticated', 'public.increment_participant_count(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.decrement_participant_count(uuid)', 'EXECUTE')
) checks;

-- END OF LIVE PAGE REPAIR
