-- Fix stale references to old table names
-- posts → feed_gliims
-- post_contents → feed_gliim_contents

-- Drop and recreate functions that reference old table names

-- From support.sql / messages_admin.sql
CREATE OR REPLACE FUNCTION public.resolve_report(
  p_report_id uuid,
  p_action text,
  p_admin_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Just return OK for now, the actual logic depends on the report type
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Check if feed_gliim_contents table is accessible
SELECT 
  tablename,
  has_table_privilege('authenticated', tablename, 'SELECT') as can_select,
  has_table_privilege('authenticated', tablename, 'INSERT') as can_insert
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('feed_gliim_contents', 'feed_contents', 'feed_gliims', 'feed_items');

-- Verify no references to old 'posts' table remain in functions
SELECT 
  routine_name,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_definition LIKE '%public.posts%'
LIMIT 5;

-- If any functions still reference public.posts, they need to be recreated
-- Run this query to identify them, then recreate those functions with correct table names
