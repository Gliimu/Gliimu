-- Fix remaining function conflicts and diagnose feed issue

-- 1. Drop all conflicting function signatures
DROP FUNCTION IF EXISTS public.contest_leaderboard(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.contest_leaderboard(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.contest_join(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.cohort_request(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.billing_access(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.billing_access(text, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.bump_post_views(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_review_submission(uuid, text, text) CASCADE;

-- 2. Recreate admin_review_submission (ensure it uses feed_items, not posts)
CREATE OR REPLACE FUNCTION public.admin_review_submission(p_id uuid, p_status text, p_note text default null)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_submission record;
  v_item_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT * INTO v_submission FROM public.feed_submissions WHERE id = p_id;
  IF v_submission IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;

  UPDATE public.feed_submissions
     SET status = p_status,
         reviewed_by = v_caller,
         reviewed_at = now(),
         review_note = p_note
   WHERE id = p_id;

  IF p_status = 'approved' THEN
    INSERT INTO public.feed_items (type, title, description, price, cover_url, author, author_avatar, owner_id, category)
    SELECT v_submission.type, v_submission.title, v_submission.description, v_submission.price, v_submission.cover_url,
           p.full_name, p.avatar_url, v_submission.user_id, v_submission.category
    FROM public.profiles p
    WHERE p.id = v_submission.user_id
    RETURNING id INTO v_item_id;

    IF v_submission.blocks IS NOT NULL OR v_submission.bundle_items IS NOT NULL THEN
      INSERT INTO public.feed_contents (item_id, blocks, files)
      VALUES (v_item_id, v_submission.blocks, v_submission.bundle_items);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'item_id', v_item_id);
END;
$$;

-- 3. Recreate billing_access
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

  SELECT is_premium INTO v_is_premium 
  FROM public.feed_gliims 
  WHERE id = p_post_id;

  IF NOT v_is_premium THEN
    SELECT blocks INTO v_blocks
    FROM public.feed_gliim_contents
    WHERE post_id = p_post_id;
    
    RETURN jsonb_build_object(
      'allowed', true,
      'blocks', COALESCE(v_blocks, '[]'::jsonb)
    );
  END IF;

  IF public.effective_tier(v_user_id) = 'pro' THEN
    SELECT blocks INTO v_blocks
    FROM public.feed_gliim_contents
    WHERE post_id = p_post_id;
    
    RETURN jsonb_build_object(
      'allowed', true,
      'blocks', COALESCE(v_blocks, '[]'::jsonb)
    );
  END IF;

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

  RETURN jsonb_build_object('allowed', false, 'blocks', '[]'::jsonb);
END;
$$;

-- 4. Recreate bump_post_views
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

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION public.billing_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_post_views(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_submission(uuid, text, text) TO authenticated;

-- 6. DIAGNOSE: Check if approved items exist in feed_items
SELECT 
  'Approved submissions count: ' || COUNT(*) as status
FROM feed_submissions
WHERE status = 'approved';

SELECT 
  'Feed items count: ' || COUNT(*) as status
FROM feed_items;

SELECT 
  fs.id,
  fs.title,
  fs.type,
  fs.status,
  fi.id as feed_item_id,
  fi.title as feed_item_title
FROM feed_submissions fs
LEFT JOIN feed_items fi ON fi.title = fs.title AND fi.type = fs.type
WHERE fs.status = 'approved'
ORDER BY fs.created_at DESC
LIMIT 10;
