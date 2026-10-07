-- ============================================================
-- Gliimu: Library content lock + multi-part uploads
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once.
--
-- WHAT THIS INSTALLS
--   1. library_items.owner_id — a real uuid owner. library_items.author is a
--      display NAME, so it can never be an access check: anyone could set
--      their full_name to match a paid item and read it free. owner_id is
--      set by the (future) admin app when a submission is approved, and it
--      cannot be forged from the dashboard.
--   2. library_contents — paid bodies move out of library_items into an
--      RLS-locked table: publication blocks, bundle files, and the single
--      publication/audiolite file. Same shape as post_contents for premium
--      gliims: a modified client that skips the billing gate gets no rows.
--   3. library_submissions.blocks + .bundle_items — so the composer can
--      submit a full illustrated publication or a multi-file bundle.
--   4. Drops library_items.file_url / .bundle_items once the backfill is
--      provably complete. Until they are gone the lock is decorative.
--
-- RUN ORDER: after sql/billing.sql (needs effective_tier, is_admin,
-- purchases) and after sql/library_submissions.sql.
--
-- WHO CAN READ library_contents
--   free items (price <= 0) | the owner | admins | anyone on trial,
--   Use n' Pay or Pro (they pay the per-open mini-price through
--   billing_access) | anyone with a row in purchases (wallet-tier buy).
-- ============================================================


-- ============================================================
-- 1. library_items.owner_id
-- ============================================================

do $$ begin
  if to_regclass('public.library_items') is null then
    raise exception 'library_items is MISSING — this script needs the live library table.';
  end if;
  -- library_item_unlocked() is a SQL-language function, so Postgres resolves
  -- these at creation time; check first and say what to run instead of
  -- failing with "function public.effective_tier(uuid) does not exist".
  if to_regclass('public.purchases') is null
     or to_regprocedure('public.effective_tier(uuid)') is null
     or to_regprocedure('public.is_admin()') is null then
    raise exception 'billing prerequisites MISSING (purchases / effective_tier / is_admin) — run sql/billing.sql first, then re-run this script.';
  end if;
end $$;

alter table public.library_items
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;

create index if not exists library_items_owner_idx on public.library_items (owner_id);


-- ============================================================
-- 2. library_contents — the paid body, locked
-- ============================================================

create table if not exists public.library_contents (
  item_id    uuid primary key references public.library_items(id) on delete cascade,
  blocks     jsonb not null default '[]'::jsonb,
  files      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

comment on column public.library_contents.blocks is
  'Publication body: [{type: text|image|video|audio|file, content, style?}] — same block shape as the hub, plus file (a downloadable document).';
comment on column public.library_contents.files is
  'Downloadable parts: [{title, url}] — every bundle file, or the single publication/audiolite file.';

alter table public.library_contents enable row level security;

revoke all on public.library_contents from anon;
grant select, insert, update on public.library_contents to authenticated;
grant all on public.library_contents to service_role;


-- ============================================================
-- 3. Access helper + policies
--    Wrapped in SECURITY DEFINER so the check never depends on what the
--    caller can see in library_items, purchases or profiles.
-- ============================================================

create or replace function public.library_item_unlocked(p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.library_items li
     where li.id = p_item
       and ( coalesce(li.price, 0) <= 0
          or li.owner_id = auth.uid()
          or public.is_admin()
          or public.effective_tier(auth.uid()) in ('trial', 'payngo', 'pro')
          or exists (select 1 from public.purchases pu
                      where pu.user_id = auth.uid()
                        and pu.item_id = p_item) )
  );
$$;

revoke execute on function public.library_item_unlocked(uuid) from public, anon;
grant execute on function public.library_item_unlocked(uuid) to authenticated, service_role;

drop policy if exists "library content read" on public.library_contents;
create policy "library content read"
  on public.library_contents for select
  to authenticated
  using (public.library_item_unlocked(item_id));

-- Only the owner writes the body. Today no item has an owner_id yet, so the
-- dashboard cannot write here at all — the admin app seeds content, and it
-- runs as service_role, which bypasses RLS.
drop policy if exists "library content insert" on public.library_contents;
create policy "library content insert"
  on public.library_contents for insert
  to authenticated
  with check (exists (select 1 from public.library_items li
                       where li.id = item_id and li.owner_id = auth.uid()));

drop policy if exists "library content update" on public.library_contents;
create policy "library content update"
  on public.library_contents for update
  to authenticated
  using (exists (select 1 from public.library_items li
                  where li.id = item_id and li.owner_id = auth.uid()))
  with check (exists (select 1 from public.library_items li
                       where li.id = item_id and li.owner_id = auth.uid()));

-- No delete policy on purpose: rows go with the item (on delete cascade) or
-- through service_role.


-- ============================================================
-- 4. library_submissions — let a submission carry a full body
--    The composer writes one column per format:
--      publication -> blocks        [{type, content, style?}]
--      audiolite   -> file_url      the single audio file
--      bundle      -> bundle_items  [{title, url}]
--    On approval the admin app copies blocks into library_contents.blocks
--    and file_url / bundle_items into library_contents.files.
--    Guarded: if sql/library_submissions.sql has not been run yet this section
--    warns and moves on, so the rest of the script still applies. Re-run this
--    file afterwards — it is idempotent.
-- ============================================================

do $$ begin
  if to_regclass('public.library_submissions') is null then
    raise warning 'library_submissions is MISSING — run sql/library_submissions.sql, then re-run this script.';
    return;
  end if;

  alter table public.library_submissions
    add column if not exists blocks jsonb not null default '[]'::jsonb;

  alter table public.library_submissions
    add column if not exists bundle_items jsonb not null default '[]'::jsonb;

  execute 'comment on column public.library_submissions.blocks is ''Publication body blocks. The admin app copies this into library_contents on approval.''';
  execute 'comment on column public.library_submissions.bundle_items is ''Bundle parts [{title, url}]. Copied into library_contents.files on approval.''';
end $$;


-- ============================================================
-- 5. Backfill (idempotent — skips rows already carried over)
--    Bundles first: a bundle may also have a file_url, and its real contents
--    are the array, not that one file.
-- ============================================================

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'library_items'
                and column_name = 'bundle_items') then
    insert into public.library_contents (item_id, blocks, files)
    select li.id, '[]'::jsonb, li.bundle_items::jsonb
      from public.library_items li
     where jsonb_typeof(li.bundle_items::jsonb) = 'array'
       and jsonb_array_length(li.bundle_items::jsonb) > 0
       and not exists (select 1 from public.library_contents lc where lc.item_id = li.id);
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'library_items'
                and column_name = 'file_url') then
    insert into public.library_contents (item_id, blocks, files)
    select li.id, '[]'::jsonb,
           jsonb_build_array(jsonb_build_object('title', li.title, 'url', li.file_url))
      from public.library_items li
     where coalesce(li.file_url, '') <> ''
       and not exists (select 1 from public.library_contents lc where lc.item_id = li.id);
  end if;
end $$;


-- ============================================================
-- 6. Drop the unlocked copies — guarded, never silent
-- ============================================================

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'library_items'
                and column_name = 'bundle_items') then
    if exists (
      select 1 from public.library_items li
       where jsonb_typeof(li.bundle_items::jsonb) = 'array'
         and jsonb_array_length(li.bundle_items::jsonb) > 0
         and not exists (select 1 from public.library_contents lc
                          where lc.item_id = li.id and jsonb_array_length(lc.files) > 0)
    ) then
      raise exception 'BACKFILL INCOMPLETE — library_items.bundle_items still has rows missing from library_contents; column NOT dropped';
    end if;
    alter table public.library_items drop column bundle_items;
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'library_items'
                and column_name = 'file_url') then
    if exists (
      select 1 from public.library_items li
       where coalesce(li.file_url, '') <> ''
         and not exists (select 1 from public.library_contents lc
                          where lc.item_id = li.id and jsonb_array_length(lc.files) > 0)
    ) then
      raise exception 'BACKFILL INCOMPLETE — library_items.file_url still has rows missing from library_contents; column NOT dropped';
    end if;
    alter table public.library_items drop column file_url;
  end if;
end $$;


-- ============================================================
-- 7. SELF CHECK — read these notices after running
-- ============================================================

do $$ begin
  raise notice '==== LIBRARY CONTENT SELF CHECK ====';
  raise notice 'library_contents table:     %', case when to_regclass('public.library_contents') is not null then 'OK' else 'MISSING' end;
  raise notice 'library_item_unlocked():    %', coalesce(to_regprocedure('public.library_item_unlocked(uuid)')::text, 'MISSING');
  raise notice 'RLS enabled:                %', case when (select relrowsecurity from pg_class where oid = 'public.library_contents'::regclass) then 'OK' else 'MISSING' end;
  raise notice 'policies (expect 3):        %', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'library_contents');
  raise notice 'library_items.owner_id:     %', case when exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'library_items' and column_name = 'owner_id'
    ) then 'OK' else 'MISSING' end;
  raise notice 'submissions.blocks:         %', case when exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'library_submissions' and column_name = 'blocks'
    ) then 'OK'
    when to_regclass('public.library_submissions') is null
      then 'MISSING — run sql/library_submissions.sql, then re-run this script'
    else 'MISSING — re-run this script' end;
  raise notice 'submissions.bundle_items:   %', case when exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'library_submissions' and column_name = 'bundle_items'
    ) then 'OK'
    when to_regclass('public.library_submissions') is null
      then 'MISSING — run sql/library_submissions.sql, then re-run this script'
    else 'MISSING — re-run this script' end;
  raise notice 'content rows backfilled:    %', (select count(*) from public.library_contents);
  raise notice 'library items total:        %', (select count(*) from public.library_items);
  raise notice 'items with no owner yet:    %', (select count(*) from public.library_items where owner_id is null);
  raise notice 'file_url dropped:           %', case when exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'library_items' and column_name = 'file_url'
    ) then 'STILL PRESENT — investigate' else 'OK' end;
  raise notice 'bundle_items dropped:       %', case when exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'library_items' and column_name = 'bundle_items'
    ) then 'STILL PRESENT — investigate' else 'OK' end;
  raise notice '====================================';
end $$;

notify pgrst, 'reload schema';
