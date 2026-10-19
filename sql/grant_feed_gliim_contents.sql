-- Grant access to feed_gliim_contents table for authenticated users
-- This table was created but not exposed via the Supabase REST API

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_gliim_contents TO authenticated;

-- Also ensure the table is in a schema that's exposed (should be public by default)
-- Verify the grant worked
SELECT 
  tablename,
  has_table_privilege('authenticated', tablename, 'SELECT') as can_select,
  has_table_privilege('authenticated', tablename, 'INSERT') as can_insert,
  has_table_privilege('authenticated', tablename, 'UPDATE') as can_update,
  has_table_privilege('authenticated', tablename, 'DELETE') as can_delete
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'feed_gliim_contents';

-- Also check for any remaining references to old 'posts' table in functions
SELECT 
  proname as function_name,
  prosrc::text LIKE '%public.posts%' as references_old_posts
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND prosrc::text LIKE '%public.posts%'
LIMIT 10;
