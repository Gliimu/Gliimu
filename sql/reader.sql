-- ============================================================
-- Gliimu: Reader — progress, completion rewards, related titles
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once (idempotent).
--
-- RUN ORDER: after sql/setup_all.sql (needs feed_items, feed_submissions,
-- and library_item_unlocked function) and after sql/gliits_billing.sql
-- (needs effective_tier, is_admin). Standalone otherwise.
--
-- WHAT THIS INSTALLS
--   1. feed_items.category + feed_submissions.category — a subject tag
--      (Media|Tech|Business|Personal|Education) so the reader can show
--      "more in a similar category" at the end. Nullable: an item with no
--      category falls back to matching by type.
--   2. reading_progress — one row per (member, item): reading percent,
--      completed_at, and gp_awarded_at. RLS: a member only ever sees and
--      writes their OWN rows.
--   3. complete_reading(p_item) — SECURITY DEFINER. Marks the item complete
--      and awards completion GP EXACTLY ONCE (advisory-locked, so a double
--      tap or two devices can never pay twice). Only publications and
--      audiolites earn completion GP (a bundle has no single "end").
--   4. related_publications(p_item, p_limit) — SECURITY DEFINER read that
--      returns other titles in the same category (or type) for the
--      "you finished — read this next" shelf. Returns display fields only.
--
-- COMPLETION GP: removed. Engagement GP (commenting / sharing) is awarded
-- by the client via add_gp, not here.
--
-- WHY complete_reading IS SECURITY DEFINER: it must read the item's type /
-- unlock state and write profiles.total_gp + a transactions ledger row
-- without being blinded by those tables' RLS. It still keys every write on
-- auth.uid(), so a caller can only ever complete-and-earn for THEMSELVES.
-- ============================================================

select pg_advisory_xact_lock(hashtext('gliimu-reader'));


-- ============================================================
-- 1. category on publications
-- ============================================================

do $$ begin
  if to_regclass('public.feed_items') is null then
    raise exception 'feed_items is MISSING — run setup_all.sql first.';
  end if;
end $$;

-- feed_items and feed_submissions already have category column in CREATE TABLE
create index if not exists idx_feed_items_category on public.feed_items (category);


-- ============================================================
-- 2. reading_progress
-- ============================================================

create table if not exists public.reading_progress (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  item_id       uuid not null references public.feed_items(id) on delete cascade,
  percent       integer not null default 0,
  completed_at  timestamptz,
  gp_awarded_at timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (user_id, item_id)
);

comment on column public.reading_progress.percent is '0-100 reading/listening progress for this member on this item.';
comment on column public.reading_progress.gp_awarded_at is 'Set once when completion GP was credited; guards against paying twice.';

alter table public.reading_progress enable row level security;

revoke all on public.reading_progress from anon;
grant select, insert, update on public.reading_progress to authenticated;
grant all on public.reading_progress to service_role;

-- A member reads and updates only their own progress rows. The client upserts
-- `percent` as the reader scrolls; completion/GP go through complete_reading().
drop policy if exists "own reading progress read" on public.reading_progress;
create policy "own reading progress read" on public.reading_progress
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own reading progress insert" on public.reading_progress;
create policy "own reading progress insert" on public.reading_progress
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "own reading progress update" on public.reading_progress;
create policy "own reading progress update" on public.reading_progress
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ============================================================
-- 3. complete_reading — mark done, award GP once
-- ============================================================

drop function if exists public.complete_reading(uuid);
create or replace function public.complete_reading(p_item uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  v_type       text;
  v_title      text;
  v_unlocked   boolean;
  v_already    boolean;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if p_item is null then
    return jsonb_build_object('ok', false, 'code', 'BAD_ITEM');
  end if;

  -- Lock this (member,item) pair so two devices / a double tap cannot both
  -- award GP.
  perform pg_advisory_xact_lock(hashtext('reading:' || uid::text || ':' || p_item::text));

  select li.type, li.title into v_type, v_title
    from public.feed_items li
   where li.id = p_item;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- You must actually be able to read it to earn for finishing it.
  v_unlocked := public.library_item_unlocked(p_item);
  if not v_unlocked then
    return jsonb_build_object('ok', false, 'code', 'NOT_UNLOCKED');
  end if;

  -- Ensure a progress row exists.
  insert into public.reading_progress (user_id, item_id, percent, updated_at)
  values (uid, p_item, 100, now())
  on conflict (user_id, item_id)
  do update set percent = 100, updated_at = now();

  select (completed_at is not null) into v_already
    from public.reading_progress
   where user_id = uid and item_id = p_item;

  -- Bundles have no single end: record completion but no GP.
  if v_type not in ('book', 'audiolite') then
    update public.reading_progress
       set completed_at = coalesce(completed_at, now()), updated_at = now()
     where user_id = uid and item_id = p_item and completed_at is null;
    return jsonb_build_object('ok', true, 'status', 'completed', 'gp_awarded', 0, 'reason', 'NO_GP_FOR_TYPE');
  end if;

  if v_already then
    return jsonb_build_object('ok', true, 'status', 'already_completed', 'gp_awarded', 0);
  end if;

  -- First completion: stamp it, no GP.
  update public.reading_progress
     set completed_at  = now(),
         gp_awarded_at = now(),
         percent       = 100,
         updated_at    = now()
   where user_id = uid and item_id = p_item;

  return jsonb_build_object('ok', true, 'status', 'completed', 'gp_awarded', 0);
end $$;

revoke all on function public.complete_reading(uuid) from public, anon;
grant execute on function public.complete_reading(uuid) to authenticated, service_role;


-- ============================================================
-- 4. related_publications — "read this next"
--    SECURITY DEFINER so the shelf is not blinded by feed_items RLS.
--    Returns display fields only (never owner_id). Matches by category
--    first; if this item has no category, matches by type instead.
-- ============================================================

drop function if exists public.related_publications(uuid, integer);
create or replace function public.related_publications(p_item uuid, p_limit integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_category text;
  v_type     text;
  v_limit    integer := greatest(1, least(coalesce(p_limit, 6), 24));
begin
  if p_item is null then
    return '[]'::jsonb;
  end if;

  select category, type into v_category, v_type
    from public.feed_items
   where id = p_item;

  if not found then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',        li.id,
             'title',     li.title,
             'type',      li.type,
             'category',  li.category,
             'price',     coalesce(li.price, 0),
             'cover_url', li.cover_url,
             'author',    li.author,
             'author_avatar', li.author_avatar)
             order by li.sales desc nulls last, li.created_at desc)
      from public.feed_items li
     where li.id <> p_item
       and li.type in ('book', 'audiolite')
       and (
             (v_category is not null and li.category = v_category)
          or (v_category is null and li.type = v_type)
       )
     limit v_limit
  ), '[]'::jsonb);
end $$;

revoke all on function public.related_publications(uuid, integer) from public, anon;
grant execute on function public.related_publications(uuid, integer) to authenticated, service_role;


notify pgrst, 'reload schema';


-- ============================================================
-- SELF CHECK — returns a grid. Every row should read OK.
-- ============================================================

select 1 as "#", 'feed_items.category exists' as item,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='feed_items' and column_name='category')
            then 'OK' else 'MISSING' end as result
union all select 2, 'feed_submissions.category exists',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='feed_submissions' and column_name='category')
            then 'OK' else 'MISSING' end
union all select 3, 'reading_progress table exists',
       case when to_regclass('public.reading_progress') is not null then 'OK' else 'MISSING' end
union all select 4, 'reading_progress RLS enabled',
       case when (select coalesce(relrowsecurity,false) from pg_class where oid='public.reading_progress'::regclass)
            then 'OK' else 'DISABLED' end
union all select 5, 'reading_progress policies (expect 3)',
       (select count(*)::text from pg_policies
         where schemaname='public' and tablename='reading_progress')
union all select 6, 'complete_reading() exists',
       case when to_regprocedure('public.complete_reading(uuid)') is not null then 'OK' else 'MISSING' end
union all select 7, 'complete_reading is SECURITY DEFINER',
       case when (select p.prosecdef from pg_proc p
                   where p.oid = to_regprocedure('public.complete_reading(uuid)'))
            then 'OK' else 'NOT DEFINER' end
union all select 8, 'anon cannot execute complete_reading',
       case when has_function_privilege('anon','public.complete_reading(uuid)','execute')
            then 'GRANTED (bad)' else 'OK' end
union all select 9, 'related_publications() exists',
       case when to_regprocedure('public.related_publications(uuid,integer)') is not null then 'OK' else 'MISSING' end
union all select 10, 'related_publications is SECURITY DEFINER',
       case when (select p.prosecdef from pg_proc p
                   where p.oid = to_regprocedure('public.related_publications(uuid,integer)'))
            then 'OK' else 'NOT DEFINER' end
union all select 11, 'books/audiolites with a category',
       (select count(*)::text from public.feed_items
         where type in ('book','audiolite') and category is not null)
order by "#";
