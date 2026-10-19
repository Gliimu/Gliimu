-- Diagnostic: Check what exists in the database

-- 1. Check if feed_gliim_contents table exists
SELECT 
  CASE 
    WHEN to_regclass('public.feed_gliim_contents') IS NULL THEN 'DOES NOT EXIST'
    ELSE 'EXISTS'
  END as feed_gliim_contents_status;

-- 2. Check if feed_gliims table exists
SELECT 
  CASE 
    WHEN to_regclass('public.feed_gliims') IS NULL THEN 'DOES NOT EXIST'
    ELSE 'EXISTS'
  END as feed_gliims_status;

-- 3. Check if old posts table still exists
SELECT 
  CASE 
    WHEN to_regclass('public.posts') IS NULL THEN 'DOES NOT EXIST (good)'
    ELSE 'STILL EXISTS (bad)'
  END as posts_status;

-- 4. Check if old post_contents table still exists
SELECT 
  CASE 
    WHEN to_regclass('public.post_contents') IS NULL THEN 'DOES NOT EXIST (good)'
    ELSE 'STILL EXISTS (bad)'
  END as post_contents_status;

-- 5. List all triggers on feed_gliim_contents
SELECT 
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'feed_gliim_contents';

-- 6. List all functions that might reference old tables
SELECT DISTINCT
  p.proname as function_name,
  CASE 
    WHEN p.prosrc LIKE '%public.posts%' THEN 'references public.posts'
    WHEN p.prosrc LIKE '%public.post_contents%' THEN 'references public.post_contents'
    WHEN p.prosrc LIKE '% from posts %' THEN 'references posts'
    ELSE 'other'
  END as issue
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND (
  p.prosrc LIKE '%public.posts%' 
  OR p.prosrc LIKE '%public.post_contents%'
  OR p.prosrc LIKE '% from posts %'
  OR p.prosrc LIKE '% into posts %'
  OR p.prosrc LIKE '% update posts %'
);

-- 7. If feed_gliim_contents doesn't exist, create it
CREATE TABLE IF NOT EXISTS public.feed_gliim_contents (
  post_id uuid primary key references public.feed_gliims(id) on delete cascade,
  blocks jsonb not null default '[]'::jsonb
);

-- 8. Enable RLS and grant permissions
ALTER TABLE public.feed_gliim_contents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_gliim_contents TO authenticated;

-- 9. Create basic RLS policies
DROP POLICY IF EXISTS feed_gliim_contents_select ON public.feed_gliim_contents;
CREATE POLICY feed_gliim_contents_select ON public.feed_gliim_contents
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS feed_gliim_contents_insert ON public.feed_gliim_contents;
CREATE POLICY feed_gliim_contents_insert ON public.feed_gliim_contents
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS feed_gliim_contents_update ON public.feed_gliim_contents;
CREATE POLICY feed_gliim_contents_update ON public.feed_gliim_contents
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS feed_gliim_contents_delete ON public.feed_gliim_contents;
CREATE POLICY feed_gliim_contents_delete ON public.feed_gliim_contents
  FOR DELETE TO authenticated
  USING (true);

-- 10. Verify the table is now accessible
SELECT 
  tablename,
  has_table_privilege('authenticated', tablename, 'SELECT') as can_select,
  has_table_privilege('authenticated', tablename, 'INSERT') as can_insert
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'feed_gliim_contents';
