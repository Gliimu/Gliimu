-- ============================================================
-- FEED ITEMS DRAFTS — run in Supabase SQL Editor
-- Adds status column + owner draft visibility + owner update policy
-- ============================================================

-- 1. Status column (books/audiolites: 'approved' live, 'draft' private)
alter table public.feed_items add column if not exists status text default 'approved';

-- Backfill: existing rows have NULL until now; make them live
update public.feed_items set status = 'approved' where status is null;

-- 2. Hide drafts from everyone except their owner
drop policy if exists feed_items_read on public.feed_items;
create policy feed_items_read on public.feed_items for select to authenticated
  using (status is distinct from 'draft' or owner_id = auth.uid());

-- 3. Owners can update their own items (needed to publish a draft)
drop policy if exists feed_items_update_own on public.feed_items;
create policy feed_items_update_own on public.feed_items for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ============================================================
-- SELF CHECK — every row should say OK
-- ============================================================
select 'status column' as check_item,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'feed_items' and column_name = 'status'
  ) then 'OK' else 'MISSING' end as result
union all
select 'select policy hides drafts',
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'feed_items'
      and policyname = 'feed_items_read'
  ) then 'OK' else 'MISSING' end
union all
select 'update policy for owners',
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'feed_items'
      and policyname = 'feed_items_update_own'
  ) then 'OK' else 'MISSING' end;
