-- ============================================================
-- Gliimu: Auto-publish bundles (gliims) without admin approval
-- Run this in Supabase SQL Editor after sql/gliim_approval.sql.
-- Safe to run more than once (idempotent).
--
-- WHAT THIS CHANGES:
--   - Modifies the set_post_status() trigger to auto-approve ALL
--     posts (bundles/gliims) instead of forcing them to 'pending'.
--   - Books and audiolites still go through library_submissions
--     and require admin approval as before.
--
-- WHY:
--   - Bundles are gliims (mixed media posts) and should appear
--     instantly in the feed without waiting for review.
--   - Only books and audiolites need the approval workflow.
--
-- HOW TO RUN:
--   1. Copy ALL of this file
--   2. SQL Editor -> "+ New query"
--   3. Paste, Ctrl+A, click "Run" — once
--   4. Check SELF CHECK at bottom
-- ============================================================

create or replace function public.set_post_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Bundles (gliims) auto-publish without approval. Only books and audiolites
  -- go through the library_submissions review flow.
  new.status := 'approved';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.review_note := null;
  return new;
end $$;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- SELF CHECK
-- ------------------------------------------------------------

select
  (select case when exists (select 1 from pg_trigger where tgname='trg_set_post_status')
               then 'OK' else 'MISSING' end) as insert_trigger,
  (select count(*) from public.posts where status='approved') as approved_posts,
  (select count(*) from public.posts where status='pending') as pending_posts;
