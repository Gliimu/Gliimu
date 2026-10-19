-- Fix all stale references to old table names in database functions
-- posts → feed_gliims
-- post_contents → feed_gliim_contents

-- Step 1: Identify all functions that reference old table names
SELECT 
  n.nspname as schema,
  p.proname as function_name,
  'DROP FUNCTION IF EXISTS ' || n.nspname || '.' || p.proname || '(' || 
  pg_get_function_identity_arguments(p.oid) || ');' as drop_command
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND (
  p.prosrc LIKE '%public.posts%' 
  OR p.prosrc LIKE '%public.post_contents%'
  OR p.prosrc LIKE '% from posts %'
  OR p.prosrc LIKE '% into posts %'
  OR p.prosrc LIKE '% update posts %'
)
ORDER BY p.proname;

-- Step 2: Drop functions that reference old tables (run the drop commands from above)
-- Then recreate them with correct table names if they're still needed

-- Common functions that need recreation:

-- billing_access function (from premium_lock.sql)
CREATE OR REPLACE FUNCTION public.billing_access(p_post_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  -- Check if user has access (owner, admin, or paid)
  SELECT jsonb_build_object(
    'allowed', true,
    'blocks', fc.blocks
  ) INTO v_result
  FROM feed_gliim_contents fc
  WHERE fc.post_id = p_post_id
  AND (
    EXISTS (SELECT 1 FROM feed_gliims fg WHERE fg.id = p_post_id AND fg.owner_id = v_user_id)
    OR EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = v_user_id)
    OR EXISTS (SELECT 1 FROM billing_events be WHERE be.user_id = v_user_id AND be.item_id = p_post_id::text AND be.event_type = 'premium_unlock')
  );
  
  RETURN COALESCE(v_result, jsonb_build_object('allowed', false, 'blocks', '[]'::jsonb));
END;
$$;

-- Step 3: Verify feed_gliim_contents is accessible
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_gliim_contents TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Step 4: Check RLS policies on feed_gliim_contents
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'feed_gliim_contents';

-- Step 5: If no policies exist, create them
DROP POLICY IF EXISTS feed_gliim_contents_read ON public.feed_gliim_contents;
CREATE POLICY feed_gliim_contents_read ON public.feed_gliim_contents 
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS feed_gliim_contents_write ON public.feed_gliim_contents;
CREATE POLICY feed_gliim_contents_write ON public.feed_gliim_contents 
  FOR ALL TO authenticated
  WITH CHECK (true);
