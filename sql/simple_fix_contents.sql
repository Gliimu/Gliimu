-- Simple fix: ensure feed_gliim_contents exists and is accessible

-- 1. Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.feed_gliim_contents (
  post_id uuid primary key references public.feed_gliims(id) on delete cascade,
  blocks jsonb not null default '[]'::jsonb
);

-- 2. Enable RLS
ALTER TABLE public.feed_gliim_contents ENABLE ROW LEVEL SECURITY;

-- 3. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_gliim_contents TO authenticated;

-- 4. Create permissive RLS policies
DROP POLICY IF EXISTS "feed_gliim_contents_select" ON public.feed_gliim_contents;
CREATE POLICY "feed_gliim_contents_select" ON public.feed_gliim_contents
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "feed_gliim_contents_insert" ON public.feed_gliim_contents;
CREATE POLICY "feed_gliim_contents_insert" ON public.feed_gliim_contents
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "feed_gliim_contents_update" ON public.feed_gliim_contents;
CREATE POLICY "feed_gliim_contents_update" ON public.feed_gliim_contents
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "feed_gliim_contents_delete" ON public.feed_gliim_contents;
CREATE POLICY "feed_gliim_contents_delete" ON public.feed_gliim_contents
  FOR DELETE TO authenticated
  USING (true);

-- 5. Verify
SELECT 'feed_gliim_contents created and configured' as status;
