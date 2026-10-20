-- ============================================================
-- UNIFY FEED — one storage system for Books, Audiolites & Bundles
-- ============================================================
-- Books and audiolites move from feed_items into feed_gliims, so
-- every published work (book, audiolite, bundle, plain gliim) is
-- stored and served the same way.
--
-- WHAT IT DOES (in order):
--   1. Adds price / category / cover_color columns to feed_gliims and
--      relaxes the legacy content column left over from the old posts
--      table (nothing reads it any more).
--   2. Moves every book and audiolite into feed_gliims keeping the
--      SAME ids — purchases, saved items, reading progress and
--      reports keep pointing at the right work.
--   3. Converts their stored files into blocks:
--        book      -> document blocks
--        audiolite -> audio blocks (one per chapter, in order)
--   4. Copies book likes from library_interactions (only if that
--      table exists on this database).
--   5. Remaps reports: 'library' / 'library_item' -> 'post'.
--   6. Adds gliim_kind() — reads an item's blocks and decides what
--      it is: has video = bundle, has audio = audiolite,
--      has document = book, otherwise bundle.
--   7. Repoints every RPC to feed_gliims (landing highlights, read
--      next, completion GP, purchases, unlock checks, registrar
--      counts, submission approval).
--   8. Drops the unused user_delete_feed_item and the old
--      reading_progress foreign key (ids now live in feed_gliims).
--
-- SAFE TO RE-RUN — every step skips work it has already done.
-- feed_items and feed_contents are NOT dropped or emptied; they
-- stay untouched as a safety net this release.
--
-- NOTES:
--   - An item's author is now its publisher's profile name.
--   - Admin counts: 'feed_items' = publications (kind book or
--     audiolite); 'feed_gliims' = posts (kind bundle).
--   - Run the WHOLE file in one go. Studio runs the editor content
--     as one transaction — any error rolls everything back.
-- ============================================================


-- ------------------------------------------------------------
-- 1. feed_gliims gains the columns books/audiolites were carrying
-- ------------------------------------------------------------
alter table public.feed_gliims add column if not exists price integer;
alter table public.feed_gliims add column if not exists category text;
alter table public.feed_gliims add column if not exists cover_color text;
alter table public.feed_gliims add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_feed_gliims_category on public.feed_gliims(category);

-- The live table still carries the old posts-era `content text NOT NULL`
-- column. Nothing reads it any more (bodies live in feed_gliim_contents),
-- so relax it — otherwise the migration insert below is rejected. Fresh
-- installs never had the column, hence the guard.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name   = 'feed_gliims'
               and column_name  = 'content') then
    execute 'alter table public.feed_gliims alter column content drop not null';
  end if;
end $$;


-- ------------------------------------------------------------
-- 2. Move the works — same ids, so nothing else needs rewiring
-- ------------------------------------------------------------
insert into public.feed_gliims
  (id, user_id, title, category, description, cover_url, cover_color,
   price, is_premium, status, views, created_at, updated_at)
select
  fi.id, fi.owner_id, fi.title, fi.category, fi.description, fi.cover_url,
  fi.cover_color,
  fi.price, false,
  coalesce(fi.status, 'approved'),
  0, fi.created_at, fi.created_at
from public.feed_items fi
where fi.type in ('book','audiolite')
  and fi.owner_id is not null
  and not exists (select 1 from public.feed_gliims g where g.id = fi.id);


-- ------------------------------------------------------------
-- 3. Convert stored files into blocks
--    book files [{url,title}]      -> document blocks
--    audiolite files [{title,url}] -> audio blocks (chapters)
-- ------------------------------------------------------------
insert into public.feed_gliim_contents (post_id, blocks)
select
  fi.id,
  coalesce(fc.blocks, '[]'::jsonb)
  || case fi.type
       when 'audiolite' then (
         select coalesce(jsonb_agg(
                  jsonb_build_object('type', 'audio', 'content', f->>'url',
                                     'caption', coalesce(f->>'title', fi.title))
                  order by ord), '[]'::jsonb)
         from jsonb_array_elements(coalesce(fc.files, '[]'::jsonb)) with ordinality as t(f, ord)
         where f->>'url' is not null
       )
       else (
         select coalesce(jsonb_agg(
                  jsonb_build_object('type', 'document', 'content', f->>'url',
                                     'caption', coalesce(f->>'title', fi.title))
                  order by ord), '[]'::jsonb)
         from jsonb_array_elements(coalesce(fc.files, '[]'::jsonb)) with ordinality as t(f, ord)
         where f->>'url' is not null
       )
     end
from public.feed_items fi
join public.feed_contents fc on fc.item_id = fi.id
where fi.type in ('book','audiolite')
  and coalesce(jsonb_array_length(coalesce(fc.files, '[]'::jsonb)), 0) > 0
  and not exists (select 1 from public.feed_gliim_contents gc where gc.post_id = fi.id);


-- ------------------------------------------------------------
-- 4. Copy book likes (only if library_interactions exists here)
-- ------------------------------------------------------------
do $$
declare
  v_table_exists boolean;
  v_item_col     text;
begin
  select count(*) > 0 into v_table_exists
  from information_schema.tables
  where table_schema = 'public' and table_name = 'library_interactions';
  if not v_table_exists then return; end if;

  select c.column_name into v_item_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'library_interactions'
    and c.column_name in ('item_id','feed_item_id','post_id')
  order by c.column_name
  limit 1;
  if v_item_col is null then return; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'library_interactions'
      and column_name = 'user_id'
  ) then return; end if;

  execute format($f$
    insert into public.feed_interactions (post_id, user_id, interaction_type, created_at)
    select li.%I, li.user_id, 'like', min(li.created_at)
    from public.library_interactions li
    where exists (select 1 from public.feed_gliims g where g.id = li.%I)
      and not exists (
        select 1 from public.feed_interactions fi
        where fi.post_id = li.%I
          and fi.user_id = li.user_id
          and fi.interaction_type = 'like'
      )
    group by li.%I, li.user_id
  $f$, v_item_col, v_item_col, v_item_col);
end $$;


-- ------------------------------------------------------------
-- 5. Reports on books/audiolites become reports on gliims
-- ------------------------------------------------------------
update public.reports
   set target_type = 'post'
 where target_type in ('library','library_item')
   and exists (select 1 from public.feed_gliims g where g.id = reports.target_id);


-- ------------------------------------------------------------
-- 6. gliim_kind() — what an item is, read from its blocks
--    video -> bundle | audio -> audiolite | document -> book
-- ------------------------------------------------------------
create or replace function public.gliim_kind(p_blocks jsonb)
returns text
language sql
stable
as $$
  select case
    when p_blocks is null then 'bundle'
    when exists (
      select 1 from jsonb_array_elements(p_blocks) b where b->>'type' = 'video'
    ) then 'bundle'
    when exists (
      select 1 from jsonb_array_elements(p_blocks) b where b->>'type' = 'audio'
    ) then 'audiolite'
    when exists (
      select 1 from jsonb_array_elements(p_blocks) b where b->>'type' = 'document'
    ) then 'book'
    else 'bundle'
  end;
$$;


-- ------------------------------------------------------------
-- 7a. landing_highlights() — XpLoRe section, now from feed_gliims.
--     SECURITY DEFINER so logged-out visitors get names/avatars
--     even if profiles RLS would hide them from anon.
-- ------------------------------------------------------------
drop function if exists public.landing_highlights() cascade;
create or replace function public.landing_highlights()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_top_book      jsonb;
  v_top_audio     jsonb;
  v_top_gliimaits jsonb;
begin
  -- 1. Top book: approved book with most unique readers (all-time)
  select jsonb_build_object(
    'id', g.id,
    'title', g.title,
    'cover_url', g.cover_url,
    'author', p.full_name,
    'readers', coalesce(rp.cnt, 0)
  ) into v_top_book
  from public.feed_gliims g
  join public.feed_gliim_contents gc on gc.post_id = g.id
  left join (
    select item_id, count(distinct user_id)::bigint as cnt
    from public.reading_progress
    group by item_id
  ) rp on rp.item_id = g.id
  left join public.profiles p on p.id = g.user_id
  where g.status = 'approved'
    and public.gliim_kind(gc.blocks) = 'book'
  order by coalesce(rp.cnt, 0) desc, g.created_at desc
  limit 1;

  -- 2. Top audiolite: approved audiolite with most unique listeners
  select jsonb_build_object(
    'id', g.id,
    'title', g.title,
    'cover_url', g.cover_url,
    'author', p.full_name,
    'readers', coalesce(rp.cnt, 0)
  ) into v_top_audio
  from public.feed_gliims g
  join public.feed_gliim_contents gc on gc.post_id = g.id
  left join (
    select item_id, count(distinct user_id)::bigint as cnt
    from public.reading_progress
    group by item_id
  ) rp on rp.item_id = g.id
  left join public.profiles p on p.id = g.user_id
  where g.status = 'approved'
    and public.gliim_kind(gc.blocks) = 'audiolite'
  order by coalesce(rp.cnt, 0) desc, g.created_at desc
  limit 1;

  -- 3. Top 3 gliimaits by GP (for the Events card)
  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_top_gliimaits
  from (
    select jsonb_build_object(
      'user_id', p.id,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url,
      'total_gp', p.total_gp
    ) as r
    from public.profiles p
    where p.total_gp is not null and p.total_gp > 0
    order by p.total_gp desc
    limit 3
  ) r;

  return jsonb_build_object(
    'top_book', v_top_book,
    'top_audiolite', v_top_audio,
    'top_gliimaits', v_top_gliimaits
  );
end $$;

grant execute on function public.landing_highlights() to anon;
grant execute on function public.landing_highlights() to authenticated;
grant execute on function public.landing_highlights() to service_role;


-- ------------------------------------------------------------
-- 7b. related_publications(p_item, p_limit) — the reader's
--     "Read next" shelf. Param name p_item matches the client.
-- ------------------------------------------------------------
drop function if exists public.related_publications(uuid, integer) cascade;
create or replace function public.related_publications(p_item uuid, p_limit integer default 5)
returns table(id uuid, title text, cover_url text, type text, author text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_category text;
begin
  select category into v_category
  from public.feed_gliims where id = p_item;

  return query
  select g.id, g.title, g.cover_url,
         public.gliim_kind(gc.blocks), p.full_name
  from public.feed_gliims g
  join public.feed_gliim_contents gc on gc.post_id = g.id
  left join public.profiles p on p.id = g.user_id
  where g.id <> p_item
    and g.status = 'approved'
    and g.category is not distinct from v_category
    and public.gliim_kind(gc.blocks) in ('book','audiolite')
  order by g.created_at desc
  limit p_limit;
end;
$$;

grant execute on function public.related_publications(uuid, integer) to authenticated, service_role;


-- ------------------------------------------------------------
-- 7c. complete_reading(p_item) — param renamed to p_item to match
--     the client; body unchanged (progress + 10 GP).
-- ------------------------------------------------------------
drop function if exists public.complete_reading(uuid) cascade;
create or replace function public.complete_reading(p_item uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_already boolean;
begin
  select completed into v_already
  from public.reading_progress
  where user_id = v_user and item_id = p_item;

  if v_already is null then
    insert into public.reading_progress (user_id, item_id, progress, completed, completed_at)
    values (v_user, p_item, 100, true, now());
  elsif not v_already then
    update public.reading_progress
       set progress = 100, completed = true, completed_at = now()
     where user_id = v_user and item_id = p_item;
  else
    return jsonb_build_object('ok', true, 'already_completed', true);
  end if;

  update public.profiles
     set total_gp = coalesce(total_gp, 0) + 10
   where id = v_user;

  return jsonb_build_object('ok', true, 'gp_awarded', 10);
end;
$$;


-- ------------------------------------------------------------
-- 7d. purchase_library_item(p_item) — same wallet flow as
--     billing.sql, price now read from feed_gliims.
-- ------------------------------------------------------------
create or replace function public.purchase_library_item(p_item uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_price integer;
  v_title text;
  v_wallet integer;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select g.price, g.title into v_price, v_title
    from public.feed_gliims g where g.id = p_item;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  perform pg_advisory_xact_lock(hashtext('lib_purchase:' || uid::text || ':' || p_item::text));

  if exists (select 1 from public.purchases pu
              where pu.user_id = uid and pu.item_id = p_item) then
    return jsonb_build_object('ok', true, 'already_owned', true);
  end if;

  v_price := greatest(coalesce(v_price, 0), 0);

  update public.profiles
     set wallet_balance = coalesce(wallet_balance, 0) - v_price
   where id = uid and coalesce(wallet_balance, 0) >= v_price;
  if not found then
    select coalesce(wallet_balance, 0) into v_wallet from public.profiles where id = uid;
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_FUNDS',
                              'price', v_price, 'balance', v_wallet);
  end if;

  insert into public.purchases (user_id, item_id) values (uid, p_item);

  insert into public.transactions (user_id, amount, points, type, status, description)
  values (uid, -v_price, 0, 'purchase', 'success',
          'Library Unlock: ' || left(coalesce(v_title, 'item'), 60));

  return jsonb_build_object('ok', true, 'charged', v_price);
end $$;

revoke execute on function public.purchase_library_item(uuid) from public, anon;
grant execute on function public.purchase_library_item(uuid) to authenticated, service_role;


-- ------------------------------------------------------------
-- 7e. library_item_unlocked(p_item) — owner check now reads
--     feed_gliims (id unchanged, so past unlocks still count).
--     Param name matches the live function (create or replace
--     cannot rename parameters).
-- ------------------------------------------------------------
create or replace function public.library_item_unlocked(p_item uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return false; end if;

  if exists (select 1 from public.feed_gliims where id = p_item and user_id = v_user) then
    return true;
  end if;

  if public.effective_tier(v_user) = 'pro' then return true; end if;

  return exists (
    select 1 from public.billing_events
    where user_id = v_user
      and event_type = 'library_unlock'
      and item_id = p_item::text
  );
end;
$$;


-- ------------------------------------------------------------
-- 7f. registrar_overview() — same JSON keys; 'feed_items' now
--     counts publications (kind book/audiolite), 'feed_gliims'
--     counts approved posts (kind bundle).
-- ------------------------------------------------------------
drop function if exists public.registrar_overview() cascade;
create or replace function public.registrar_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_has_role(auth.uid(), 'registrar') then
    raise exception 'PERMISSION_DENIED';
  end if;

  return jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'total_gp', (select coalesce(sum(total_gp), 0) from public.profiles),
    'total_wallet', (select coalesce(sum(wallet_balance), 0) from public.profiles),
    'feed_items', (
      select count(*) from public.feed_gliims g
      join public.feed_gliim_contents gc on gc.post_id = g.id
      where public.gliim_kind(gc.blocks) in ('book','audiolite')
    ),
    'feed_gliims', (
      select count(*) from public.feed_gliims g
      join public.feed_gliim_contents gc on gc.post_id = g.id
      where g.status = 'approved'
        and public.gliim_kind(gc.blocks) = 'bundle'
    ),
    'pending_submissions', (select count(*) from public.feed_submissions where status = 'pending')
  );
end;
$$;

revoke execute on function public.registrar_overview() from public, anon;
grant execute on function public.registrar_overview() to authenticated, service_role;


-- ------------------------------------------------------------
-- 7g. registrar_member(p_user) — same keys, kind-based counts.
--     Param name matches the admin app's rpc call.
-- ------------------------------------------------------------
drop function if exists public.registrar_member(uuid) cascade;
create or replace function public.registrar_member(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_has_role(auth.uid(), 'registrar') then
    raise exception 'PERMISSION_DENIED';
  end if;

  return (
    select jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'wallet_balance', coalesce(p.wallet_balance, 0),
      'total_gp', coalesce(p.total_gp, 0),
      'tier', p.tier,
      'feed_items', (
        select count(*) from public.feed_gliims g
        join public.feed_gliim_contents gc on gc.post_id = g.id
        where g.user_id = p.id
          and public.gliim_kind(gc.blocks) in ('book','audiolite')
      ),
      'feed_gliims', (
        select count(*) from public.feed_gliims g
        join public.feed_gliim_contents gc on gc.post_id = g.id
        where g.user_id = p.id
          and g.status = 'approved'
          and public.gliim_kind(gc.blocks) = 'bundle'
      ),
      'joined_at', p.created_at
    )
    from public.profiles p where p.id = p_user
  );
end;
$$;

revoke execute on function public.registrar_member(uuid) from public, anon;
grant execute on function public.registrar_member(uuid) to authenticated, service_role;


-- ------------------------------------------------------------
-- 7h. admin_review_submission — approved submissions now create
--     a gliim (+ blocks) instead of a feed_item. Param names match
--     the live scripts (p_submission / p_action / p_note).
-- ------------------------------------------------------------
drop function if exists public.admin_review_submission(uuid, text, text) cascade;
create or replace function public.admin_review_submission(p_submission uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_submission record;
  v_item_id uuid;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_submission from public.feed_submissions where id = p_submission;
  if v_submission is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  update public.feed_submissions
     set status = p_action,
         reviewed_by = v_caller,
         reviewed_at = now(),
         review_note = p_note
   where id = p_submission;

  if p_action = 'approved' then
    insert into public.feed_gliims (user_id, title, description, cover_url, category, status)
    values (v_submission.user_id, v_submission.title, v_submission.description,
            v_submission.cover_url, v_submission.category, 'approved')
    returning id into v_item_id;

    insert into public.feed_gliim_contents (post_id, blocks)
    values (v_item_id, coalesce(v_submission.blocks, '[]'::jsonb));
  end if;

  return jsonb_build_object('ok', true, 'item_id', v_item_id);
end;
$$;

revoke execute on function public.admin_review_submission(uuid, text, text) from public, anon;
grant execute on function public.admin_review_submission(uuid, text, text) to authenticated, service_role;


-- ------------------------------------------------------------
-- 8. Retire what nothing uses any more
-- ------------------------------------------------------------
-- user_delete_feed_item has no callers (deletes go through the
-- server endpoint, which cleans both tables).
drop function if exists public.user_delete_feed_item(uuid) cascade;

-- reading_progress.item_id used to foreign-key into feed_items;
-- from now on item ids live in feed_gliims.
alter table public.reading_progress
  drop constraint if exists reading_progress_item_id_fkey;


-- ------------------------------------------------------------
-- 9. Refresh the API schema cache
-- ------------------------------------------------------------
notify pgrst, 'reload schema';


-- ============================================================
-- SELF CHECK — every row should say true / OK
-- ============================================================
select '01. gliim_kind() exists' as check_item,
       (to_regprocedure('public.gliim_kind(jsonb)') is not null)::text as result
union all
select '02. feed_gliims has price column',
       (exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'feed_gliims'
                  and column_name = 'price'))::text
union all
select '03. feed_gliims has category column',
       (exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'feed_gliims'
                  and column_name = 'category'))::text
union all
select '04. feed_gliims has cover_color column',
       (exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'feed_gliims'
                  and column_name = 'cover_color'))::text
union all
select '05. landing_highlights() rebuilt',
       (to_regprocedure('public.landing_highlights()') is not null)::text
union all
select '06. related_publications(uuid,integer) rebuilt',
       (to_regprocedure('public.related_publications(uuid,integer)') is not null)::text
union all
select '07. complete_reading(uuid) rebuilt',
       (to_regprocedure('public.complete_reading(uuid)') is not null)::text
union all
select '08. purchase_library_item(uuid) rebuilt',
       (to_regprocedure('public.purchase_library_item(uuid)') is not null)::text
union all
select '09. library_item_unlocked(uuid) rebuilt',
       (to_regprocedure('public.library_item_unlocked(uuid)') is not null)::text
union all
select '10. registrar_overview() rebuilt',
       (to_regprocedure('public.registrar_overview()') is not null)::text
union all
select '11. registrar_member(uuid) rebuilt',
       (to_regprocedure('public.registrar_member(uuid)') is not null)::text
union all
select '12. user_delete_feed_item removed',
       (to_regprocedure('public.user_delete_feed_item(uuid)') is null)::text
union all
select '13. reading_progress FK removed',
       (not exists (select 1 from pg_constraint
                    where conrelid = 'public.reading_progress'::regclass
                      and contype = 'f'
                      and conname = 'reading_progress_item_id_fkey'))::text
union all
select '14. works migrated into feed_gliims',
       (select count(*)::text from public.feed_gliims g
        where exists (select 1 from public.feed_items fi
                      where fi.id = g.id and fi.type in ('book','audiolite')))
union all
select '15. works left behind (expect 0)',
       (select count(*)::text from public.feed_items fi
        where fi.type in ('book','audiolite')
          and fi.owner_id is not null
          and not exists (select 1 from public.feed_gliims g where g.id = fi.id))
union all
select '16. reports left on old types (expect 0)',
       (select count(*)::text from public.reports
        where target_type in ('library','library_item')
          and exists (select 1 from public.feed_gliims g where g.id = target_id))
union all
select '17. document blocks created',
       (select count(*)::text from public.feed_gliim_contents gc
        where exists (select 1 from jsonb_array_elements(gc.blocks) b
                      where b->>'type' = 'document'))
union all
select '18. audio blocks created',
       (select count(*)::text from public.feed_gliim_contents gc
        where exists (select 1 from jsonb_array_elements(gc.blocks) b
                      where b->>'type' = 'audio'))
order by 1;

-- Sample of what migrated (title [kind]) — eyeball this list
select '19. SAMPLE migrated works' as check_item,
       coalesce(string_agg(g.title || ' [' || public.gliim_kind(gc.blocks) || ']', ' | '
                           order by g.created_at desc), 'none') as result
from public.feed_gliims g
left join public.feed_gliim_contents gc on gc.post_id = g.id
where exists (select 1 from public.feed_items fi
              where fi.id = g.id and fi.type in ('book','audiolite'));
