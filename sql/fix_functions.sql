-- Fix all function signature conflicts and missing functions

-- 1. Drop functions with conflicting signatures
DROP FUNCTION IF EXISTS public.contest_leaderboard(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.contest_leaderboard(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.contest_join(uuid) CASCADE;

-- 2. Recreate billing_access with correct table names (feed_gliims, not posts)
DROP FUNCTION IF EXISTS public.billing_access(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.billing_access(text, text, text, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.billing_access(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_premium boolean;
  v_blocks jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN 
    RETURN jsonb_build_object('allowed', false, 'blocks', '[]'::jsonb);
  END IF;

  -- Check if gliim is premium
  SELECT is_premium INTO v_is_premium 
  FROM public.feed_gliims 
  WHERE id = p_post_id;

  -- If not premium, allow access
  IF NOT v_is_premium THEN
    SELECT blocks INTO v_blocks
    FROM public.feed_gliim_contents
    WHERE post_id = p_post_id;
    
    RETURN jsonb_build_object(
      'allowed', true,
      'blocks', COALESCE(v_blocks, '[]'::jsonb)
    );
  END IF;

  -- Pro tier unlocks everything
  IF public.effective_tier(v_user_id) = 'pro' THEN
    SELECT blocks INTO v_blocks
    FROM public.feed_gliim_contents
    WHERE post_id = p_post_id;
    
    RETURN jsonb_build_object(
      'allowed', true,
      'blocks', COALESCE(v_blocks, '[]'::jsonb)
    );
  END IF;

  -- Check if user purchased this specific gliim
  IF EXISTS (
    SELECT 1 FROM public.billing_events
    WHERE user_id = v_user_id
      AND event_type = 'premium_unlock'
      AND item_id = p_post_id::text
  ) THEN
    SELECT blocks INTO v_blocks
    FROM public.feed_gliim_contents
    WHERE post_id = p_post_id;
    
    RETURN jsonb_build_object(
      'allowed', true,
      'blocks', COALESCE(v_blocks, '[]'::jsonb)
    );
  END IF;

  -- Not allowed
  RETURN jsonb_build_object('allowed', false, 'blocks', '[]'::jsonb);
END;
$$;

-- 3. Create bump_post_views function (increments view count)
DROP FUNCTION IF EXISTS public.bump_post_views(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.bump_post_views(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.feed_gliims
  SET views = COALESCE(views, 0) + 1
  WHERE id = p_post_id;
END;
$$;

-- 4. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.billing_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_post_views(uuid) TO authenticated;

-- 5. Verify feed_items structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'feed_items'
ORDER BY ordinal_position;
