-- ============================================================
-- Audiolite timestamp comments
--
-- Adds a metadata jsonb column to feed_interactions so a comment
-- can carry the audio playback position (in seconds) it was made at.
-- Only audiolite comments use this; all other interaction types
-- leave it NULL.
--
-- Safe to rerun: idempotent column add.
-- ============================================================

begin;

-- 1. Add the column (no-op if it already exists)
alter table public.feed_interactions
  add column if not exists metadata jsonb;

-- 2. Self-check
select
  1 as "#",
  'metadata column exists' as item,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'feed_interactions'
      and column_name = 'metadata'
  ) then 'OK' else 'MISSING' end as result;

commit;
