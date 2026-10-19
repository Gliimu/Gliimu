-- Fix setup_all.sql errors and feed display issues

-- 1. Drop functions that need to be recreated with different signatures
DROP FUNCTION IF EXISTS public.contest_leaderboard(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.contest_leaderboard(uuid) CASCADE;

-- 2. Now you can re-run setup_all.sql or just run the remaining parts

-- 3. Check why approved items don't show in feed
-- First, verify the feed_items table structure
SELECT 
  id,
  type,
  status,
  owner_id,
  created_at
FROM feed_items
WHERE status = 'approved'
ORDER BY created_at DESC
LIMIT 10;

-- 4. Check if feed_contents exists for these items
SELECT 
  fi.id,
  fi.type,
  fi.status,
  fc.item_id,
  CASE WHEN fc.blocks IS NULL THEN 'No blocks' ELSE 'Has blocks' END as content_status
FROM feed_items fi
LEFT JOIN feed_contents fc ON fc.item_id = fi.id
WHERE fi.status = 'approved'
ORDER BY fi.created_at DESC
LIMIT 10;

-- 5. Check the feed query that the client uses
-- The client fetches from feed_items with status='approved'
-- Let's verify RLS allows reading
SELECT 
  has_table_privilege('authenticated', 'feed_items', 'SELECT') as can_select_feed_items,
  has_table_privilege('authenticated', 'feed_contents', 'SELECT') as can_select_feed_contents;

-- 6. If items exist but don't show, check RLS policies
SELECT 
  tablename,
  policyname,
  cmd,
  roles,
  qual::text as using_clause
FROM pg_policies
WHERE tablename IN ('feed_items', 'feed_contents')
ORDER BY tablename, policyname;
