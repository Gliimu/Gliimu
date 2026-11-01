-- ============================================================
-- Fix referral_summary 404
-- Root cause: referral_vest_due references public.billing_events
-- which was dropped by gliits_billing.sql.
-- Fix: switch the payment check to gliits_usage (the new proof
-- that a referee has actually consumed paid usage).
-- Idempotent. Run once in Supabase SQL editor.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.referral_vest_due(p_referrer uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT rf.id, rf.referrer_id, rf.signup_reward_gp
      FROM public.referrals rf
     WHERE rf.status = 'pending'
       AND rf.created_at <= now() - INTERVAL '1 day'
       AND (p_referrer IS NULL OR rf.referrer_id = p_referrer)
       AND EXISTS (
             SELECT 1 FROM public.gliits_usage u
              WHERE u.user_id = rf.referee_id
           )
  LOOP
    UPDATE public.referrals
       SET status = 'vested', vested_at = now()
     WHERE id = r.id AND status = 'pending';
    IF FOUND THEN
      UPDATE public.profiles
         SET total_gp = COALESCE(total_gp, 0) + r.signup_reward_gp
       WHERE id = r.referrer_id;
      INSERT INTO public.transactions (user_id, amount, type, status, points, description)
      VALUES (r.referrer_id, 0, 'reward', 'success', r.signup_reward_gp, 'Referral reward');
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.referral_vest_due(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.referral_vest_due(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- SELF CHECK — paste into a new empty Supabase SQL query, Run.
-- ============================================================

SELECT 1 AS "#", 'referral_vest_due no longer references billing_events' AS item,
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_proc p
               JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'referral_vest_due'
                AND prosrc LIKE '%billing_events%'
            ) THEN 'OK' ELSE 'STILL REFERENCES billing_events' END AS result
UNION ALL
SELECT 2, 'referral_summary callable by authenticated',
       CASE WHEN has_function_privilege(
              (SELECT p.oid FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'referral_summary'
                 AND p.pronargs = 0 LIMIT 1),
              'authenticated'::regrole, 'EXECUTE')
            THEN 'OK' ELSE 'CHECK GRANT' END
UNION ALL
SELECT 3, 'gliits_usage table exists',
       CASE WHEN EXISTS (
              SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='gliits_usage')
            THEN 'OK' ELSE 'MISSING — run gliits_billing.sql first' END;
