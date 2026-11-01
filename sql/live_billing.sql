-- ============================================================
-- Live Session Billing
-- Participants pay G{rate}/min; host keeps 70%; platform 30%.
-- Participants earn GP for attending (only while others present).
-- Rate adjustable by registrar via gliits_config.
-- ============================================================
BEGIN;

-- 1. Add live billing columns to gliits_config
ALTER TABLE public.gliits_config
  ADD COLUMN IF NOT EXISTS live_rate_gliits numeric(10,2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS live_host_share numeric(3,2) NOT NULL DEFAULT 0.70;

-- 2. Participant tracking table
CREATE TABLE IF NOT EXISTS public.live_session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.live_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  gp_earned INTEGER NOT NULL DEFAULT 0,
  UNIQUE(request_id, user_id, joined_at)
);

CREATE INDEX IF NOT EXISTS idx_live_session_participants_request
  ON public.live_session_participants(request_id) WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_live_session_participants_user
  ON public.live_session_participants(user_id) WHERE left_at IS NULL;

ALTER TABLE public.live_session_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS live_participants_select ON public.live_session_participants;
CREATE POLICY live_participants_select ON public.live_session_participants
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.live_requests r
      WHERE r.id = live_session_participants.request_id
      AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS live_participants_insert ON public.live_session_participants;
CREATE POLICY live_participants_insert ON public.live_session_participants
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS live_participants_update_own ON public.live_session_participants;
CREATE POLICY live_participants_update_own ON public.live_session_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS live_participants_host_update ON public.live_session_participants;
CREATE POLICY live_participants_host_update ON public.live_session_participants
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.live_requests r
      WHERE r.id = live_session_participants.request_id
      AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_requests r
      WHERE r.id = live_session_participants.request_id
      AND r.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.live_session_participants TO authenticated;

-- 3. Billing tick RPC — called every minute by server
-- Deducts from each participant, credits host 70%, records transactions.
CREATE OR REPLACE FUNCTION public.live_billing_tick(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host_id UUID;
  v_rate NUMERIC;
  v_host_share NUMERIC;
  v_participant_count INTEGER;
  v_total_collected NUMERIC;
  v_host_credit NUMERIC;
  v_status TEXT;
  v_participant RECORD;
  v_balance NUMERIC;
  v_gp_per_min INTEGER := 1;
BEGIN
  -- Get session info
  SELECT user_id, status INTO v_host_id, v_status
  FROM public.live_requests
  WHERE id = p_request_id;

  IF v_host_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Session not found');
  END IF;

  IF v_status NOT IN ('open', 'active') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Session not active');
  END IF;

  -- Get config
  SELECT live_rate_gliits, live_host_share
  INTO v_rate, v_host_share
  FROM public.gliits_config
  WHERE id = 1;

  -- Count active participants (excluding host)
  SELECT COUNT(*) INTO v_participant_count
  FROM public.live_session_participants
  WHERE request_id = p_request_id
    AND left_at IS NULL
    AND user_id != v_host_id;

  -- No participants = no billing
  IF v_participant_count = 0 THEN
    -- Still award GP to host if they're alone (but no billing)
    RETURN jsonb_build_object('ok', true, 'participants', 0, 'collected', 0, 'host_credit', 0);
  END IF;

  v_total_collected := 0;

  -- Process each participant
  FOR v_participant IN
    SELECT user_id FROM public.live_session_participants
    WHERE request_id = p_request_id
      AND left_at IS NULL
      AND user_id != v_host_id
  LOOP
    -- Check balance
    SELECT wallet_balance INTO v_balance
    FROM public.profiles
    WHERE id = v_participant.user_id;

    IF v_balance IS NULL OR v_balance < v_rate THEN
      -- Skip this participant (insufficient balance) — don't deduct
      CONTINUE;
    END IF;

    -- Deduct from participant
    UPDATE public.profiles
    SET wallet_balance = wallet_balance - v_rate
    WHERE id = v_participant.user_id;

    -- Record debit transaction
    INSERT INTO public.transactions (user_id, amount, points, type, status, description, reference)
    VALUES (
      v_participant.user_id,
      -v_rate,
      v_gp_per_min,
      'live_session',
      'success',
      'Live session attendance fee',
      'live_tick_' || p_request_id || '_' || v_participant.user_id || '_' || now()::text
    );

    -- Award GP to participant
    UPDATE public.profiles
    SET total_gp = COALESCE(total_gp, 0) + v_gp_per_min
    WHERE id = v_participant.user_id;

    -- Track GP earned in participants table
    UPDATE public.live_session_participants
    SET gp_earned = gp_earned + v_gp_per_min
    WHERE request_id = p_request_id
      AND user_id = v_participant.user_id
      AND left_at IS NULL;

    v_total_collected := v_total_collected + v_rate;
  END LOOP;

  -- Credit host (70% of total collected)
  v_host_credit := v_total_collected * v_host_share;

  IF v_host_credit > 0 THEN
    UPDATE public.profiles
    SET wallet_balance = COALESCE(wallet_balance, 0) + v_host_credit
    WHERE id = v_host_id;

    INSERT INTO public.transactions (user_id, amount, points, type, status, description, reference)
    VALUES (
      v_host_id,
      v_host_credit,
      0,
      'live_session',
      'success',
      'Live session host earnings (70%)',
      'live_host_' || p_request_id || '_' || now()::text
    );
  END IF;

  -- Also award GP to host for hosting
  UPDATE public.profiles
  SET total_gp = COALESCE(total_gp, 0) + v_gp_per_min
  WHERE id = v_host_id;

  RETURN jsonb_build_object(
    'ok', true,
    'participants', v_participant_count,
    'collected', v_total_collected,
    'host_credit', v_host_credit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_billing_tick(UUID) TO authenticated;

-- 4. Finalize session — called when session ends
-- Awards final GP to all participants + host based on time present.
CREATE OR REPLACE FUNCTION public.live_session_finalize(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host_id UUID;
  v_participant RECORD;
  v_total_gp INTEGER;
  v_duration_mins INTEGER;
BEGIN
  SELECT user_id INTO v_host_id
  FROM public.live_requests
  WHERE id = p_request_id;

  IF v_host_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Session not found');
  END IF;

  -- Mark all remaining participants as left
  UPDATE public.live_session_participants
  SET left_at = now()
  WHERE request_id = p_request_id AND left_at IS NULL;

  -- Return summary
  SELECT COALESCE(SUM(gp_earned), 0) INTO v_total_gp
  FROM public.live_session_participants
  WHERE request_id = p_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'total_gp_awarded', v_total_gp
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_session_finalize(UUID) TO authenticated;

-- 5. Join session tracker — called when participant joins
CREATE OR REPLACE FUNCTION public.live_session_join(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_existing UUID;
BEGIN
  -- Check if already tracked (re-join without leaving)
  SELECT id INTO v_existing
  FROM public.live_session_participants
  WHERE request_id = p_request_id
    AND user_id = auth.uid()
    AND left_at IS NULL
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_joined', true);
  END IF;

  INSERT INTO public.live_session_participants (request_id, user_id)
  VALUES (p_request_id, auth.uid());

  RETURN jsonb_build_object('ok', true, 'already_joined', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_session_join(UUID) TO authenticated;

-- 6. Leave session tracker
CREATE OR REPLACE FUNCTION public.live_session_leave(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.live_session_participants
  SET left_at = now()
  WHERE request_id = p_request_id
    AND user_id = auth.uid()
    AND left_at IS NULL;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_session_leave(UUID) TO authenticated;

-- 7. Get session billing summary (for UI display)
CREATE OR REPLACE FUNCTION public.live_billing_summary(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_host_id UUID;
  v_rate NUMERIC;
  v_host_share NUMERIC;
  v_active_count INTEGER;
  v_my_gp INTEGER;
  v_my_debit NUMERIC;
  v_host_earned NUMERIC;
BEGIN
  SELECT user_id INTO v_host_id FROM public.live_requests WHERE id = p_request_id;

  SELECT live_rate_gliits, live_host_share INTO v_rate, v_host_share
  FROM public.gliits_config WHERE id = 1;

  SELECT COUNT(*) INTO v_active_count
  FROM public.live_session_participants
  WHERE request_id = p_request_id AND left_at IS NULL AND user_id != v_host_id;

  -- My stats
  SELECT COALESCE(gp_earned, 0) INTO v_my_gp
  FROM public.live_session_participants
  WHERE request_id = p_request_id AND user_id = auth.uid() AND left_at IS NULL;

  -- Host total earned so far
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_host_earned
  FROM public.transactions
  WHERE user_id = v_host_id
    AND type = 'live_session'
    AND reference LIKE 'live_host_' || p_request_id || '%';

  RETURN jsonb_build_object(
    'host_id', v_host_id,
    'rate', v_rate,
    'host_share', v_host_share,
    'active_participants', v_active_count,
    'my_gp_earned', v_my_gp,
    'host_total_earned', v_host_earned,
    'is_host', (auth.uid() = v_host_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_billing_summary(UUID) TO authenticated;

COMMIT;
