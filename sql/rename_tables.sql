-- ============================================================
-- Gliimu: Rename all feed-related tables to feed_* prefix
-- Run this ONCE in Supabase SQL Editor.
--
-- WHAT THIS DOES:
--   Renames 6 tables to use a consistent feed_ prefix:
--     library_submissions  → feed_submissions
--     library_items        → feed_items
--     posts                → feed_gliims
--     post_contents        → feed_gliim_contents
--     library_contents     → feed_contents
--     hub_interactions     → feed_interactions
--
--   Also renames indexes, constraints, triggers, and updates
--   all foreign key references automatically (Postgres handles
--   FK renames when tables are renamed).
--
-- SAFE TO RUN:
--   - Uses IF EXISTS checks so it won't fail if partially run
--   - Postgres automatically updates FK references on rename
--   - RLS policies are preserved (they follow the table)
--
-- AFTER RUNNING:
--   - Update all JS code to use new table names
--   - Run the consolidated feed.sql and feed_admin.sql
--
-- SELF CHECK at bottom — verify all tables renamed correctly.
-- ============================================================

-- ============================================================
-- 1. Rename tables
-- ============================================================

alter table if exists public.library_submissions rename to feed_submissions;
alter table if exists public.library_items rename to feed_items;
alter table if exists public.library_contents rename to feed_contents;
alter table if exists public.hub_interactions rename to feed_interactions;

-- posts and post_contents need special care because of triggers
alter table if exists public.post_contents rename to feed_gliim_contents;
alter table if exists public.posts rename to feed_gliims;

-- ============================================================
-- 2. Rename indexes
-- ============================================================

-- library_submissions indexes
alter index if exists public.library_submissions_status_idx rename to feed_submissions_status_idx;

-- library_items indexes
alter index if exists public.library_items_owner_idx rename to feed_items_owner_idx;
alter index if exists public.library_items_category_idx rename to feed_items_category_idx;

-- ============================================================
-- 3. Drop old triggers on feed_gliims (recreated in step 4)
-- ============================================================

drop trigger if exists trg_set_post_status on public.feed_gliims;
drop trigger if exists trg_guard_post_status on public.feed_gliims;

-- ============================================================
-- 4. Rename functions that reference old table names
-- ============================================================

-- set_post_status → set_feed_gliim_status
drop function if exists public.set_post_status();
create or replace function public.set_feed_gliim_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.status := 'approved';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.review_note := null;
  return new;
end $$;

-- guard_post_status → guard_feed_gliim_status
drop function if exists public.guard_post_status();
create or replace function public.guard_feed_gliim_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() or public.admin_has_role(auth.uid(), 'crm') then
    return new;
  end if;
  new.status      := old.status;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.review_note := old.review_note;
  return new;
end $$;

-- Recreate triggers with new function names
drop trigger if exists trg_set_feed_gliim_status on public.feed_gliims;
create trigger trg_set_feed_gliim_status
  before insert on public.feed_gliims
  for each row execute function public.set_feed_gliim_status();

drop trigger if exists trg_guard_feed_gliim_status on public.feed_gliims;
create trigger trg_guard_feed_gliim_status
  before update on public.feed_gliims
  for each row execute function public.guard_feed_gliim_status();

-- ============================================================
-- 5. Rename RLS policies
-- ============================================================

-- feed_gliims (formerly posts) policies
drop policy if exists "hide unapproved gliims" on public.feed_gliims;
create policy "hide unapproved gliims" on public.feed_gliims
  as restrictive
  for select to authenticated
  using (status = 'approved' or public.is_admin() or public.admin_has_role(auth.uid(), 'crm'));

drop policy if exists "hide unapproved gliims (anon)" on public.feed_gliims;
create policy "hide unapproved gliims (anon)" on public.feed_gliims
  as restrictive
  for select to anon
  using (status = 'approved');

drop policy if exists "CRM read posts" on public.feed_gliims;
create policy "CRM read gliims" on public.feed_gliims
  for select to authenticated
  using (public.admin_has_role(auth.uid(), 'crm'));

drop policy if exists "Public can read posts" on public.feed_gliims;
create policy "Public can read gliims" on public.feed_gliims
  for select to anon, authenticated
  using (true);

drop policy if exists "Users can delete own posts" on public.feed_gliims;
create policy "Users can delete own gliims" on public.feed_gliims
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own posts" on public.feed_gliims;
create policy "Users can insert own gliims" on public.feed_gliims
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update posts" on public.feed_gliims;
create policy "Users can update gliims" on public.feed_gliims
  for update to authenticated
  using (true)
  with check (true);

-- feed_submissions (formerly library_submissions) policies
drop policy if exists "Users insert own library submissions" on public.feed_submissions;
create policy "Users insert own feed submissions" on public.feed_submissions
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users read own library submissions" on public.feed_submissions;
create policy "Users read own feed submissions" on public.feed_submissions
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Library submissions review" on public.feed_submissions;
create policy "Feed submissions review" on public.feed_submissions
  for select to authenticated
  using (public.admin_has_role(auth.uid(), 'crm'));

-- feed_contents (formerly library_contents) policies
drop policy if exists "library content read" on public.feed_contents;
create policy "feed content read" on public.feed_contents
  for select to authenticated
  using (library_item_unlocked(item_id));

drop policy if exists "library content insert" on public.feed_contents;
create policy "feed content insert" on public.feed_contents
  for insert to authenticated
  with check (exists (select 1 from public.feed_items li
    where li.id = item_id and li.owner_id = auth.uid()));

drop policy if exists "library content update" on public.feed_contents;
create policy "feed content update" on public.feed_contents
  for update to authenticated
  using (exists (select 1 from public.feed_items li
    where li.id = item_id and li.owner_id = auth.uid()))
  with check (exists (select 1 from public.feed_items li
    where li.id = item_id and li.owner_id = auth.uid()));

-- feed_gliim_contents (formerly post_contents) policies
drop policy if exists "post content read" on public.feed_gliim_contents;
create policy "feed gliim content read" on public.feed_gliim_contents
  for select to authenticated
  using (post_content_unlocked(post_id));

drop policy if exists "post content insert" on public.feed_gliim_contents;
create policy "feed gliim content insert" on public.feed_gliim_contents
  for insert to authenticated
  with check (owns_post(post_id));

drop policy if exists "post content update" on public.feed_gliim_contents;
create policy "feed gliim content update" on public.feed_gliim_contents
  for update to authenticated
  using (owns_post(post_id))
  with check (owns_post(post_id));

-- feed_interactions (formerly hub_interactions) policies
drop policy if exists "Auth can insert hub interactions" on public.feed_interactions;
create policy "Auth can insert feed interactions" on public.feed_interactions
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Auth can read hub interactions" on public.feed_interactions;
create policy "Auth can read feed interactions" on public.feed_interactions
  for select to authenticated
  using (true);

drop policy if exists "Users can delete own hub interactions" on public.feed_interactions;
create policy "Users can delete own feed interactions" on public.feed_interactions
  for delete to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- 6. Update admin_list_pending_posts to use new table names
-- ============================================================

create or replace function public.admin_list_pending_posts(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not (public.admin_has_role(uid, 'crm') or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'NOT_CRM');
  end if;

  return jsonb_build_object('ok', true, 'posts', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',            p.id,
             'title',         p.title,
             'description',   p.description,
             'category',      p.category,
             'cover_url',     p.cover_url,
             'is_premium',    p.is_premium,
             'status',        p.status,
             'review_note',   p.review_note,
             'created_at',    p.created_at,
             'reviewed_at',   p.reviewed_at,
             'user_id',       p.user_id,
             'author_name',   coalesce(pr.full_name, pr.username, 'Unknown member'),
             'author_avatar', pr.avatar_url,
             'blocks',        coalesce(pc.blocks, '[]'::jsonb))
             order by p.created_at desc)
      from public.feed_gliims p
      left join public.profiles pr              on pr.id = p.user_id
      left join public.feed_gliim_contents pc   on pc.post_id = p.id
     where (
       p_status = 'all'
       or p.status = coalesce(nullif(btrim(p_status), ''), 'pending')
     )
  ), '[]'::jsonb));
end $$;

-- ============================================================
-- 7. Update admin_review_post to use new table names
-- ============================================================

create or replace function public.admin_review_post(p_post uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_post public.feed_gliims%rowtype;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not (public.admin_has_role(uid, 'crm') or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'NOT_CRM');
  end if;

  if p_action not in ('approve', 'reject') then
    return jsonb_build_object('ok', false, 'code', 'BAD_ACTION');
  end if;

  select * into v_post from public.feed_gliims where id = p_post;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if p_action = 'reject' then
    if coalesce(btrim(p_note), '') = '' then
      return jsonb_build_object('ok', false, 'code', 'NOTE_REQUIRED');
    end if;

    update public.feed_gliims
       set status = 'rejected', reviewed_by = uid, reviewed_at = now(), review_note = p_note
     where id = p_post;

    insert into public.support_messages (thread_user, sender_id, content)
    values (v_post.user_id, uid,
            'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was not approved. Reason: ' || p_note);

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  update public.feed_gliims
     set status = 'approved', reviewed_by = uid, reviewed_at = now(), review_note = p_note
   where id = p_post;

  insert into public.support_messages (thread_user, sender_id, content)
  values (v_post.user_id, uid,
          'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was approved and is now live in the Feed.');

  return jsonb_build_object('ok', true, 'status', 'approved');
end $$;

-- ============================================================
-- 8. Update admin_delete_feed_item to use new table names
-- ============================================================

create or replace function public.admin_delete_feed_item(
  p_item_id uuid,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_can_delete boolean;
  v_is_gliim boolean;
  v_is_feed_item boolean;
begin
  select (public.is_admin() or public.admin_has_role(v_caller, 'crm')) into v_can_delete;
  if not v_can_delete then
    raise exception 'PERMISSION_DENIED';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = v_caller
      and u.encrypted_password = crypt(p_password, u.encrypted_password)
  ) then
    raise exception 'INVALID_PASSWORD';
  end if;

  select exists (select 1 from public.feed_gliims where id = p_item_id) into v_is_gliim;
  select exists (select 1 from public.feed_items where id = p_item_id) into v_is_feed_item;

  if not v_is_gliim and not v_is_feed_item then
    if exists (select 1 from public.feed_submissions where id = p_item_id) then
      delete from public.feed_submissions where id = p_item_id;
      return jsonb_build_object('deleted', true, 'item_id', p_item_id, 'type', 'submission');
    end if;
  end if;

  if not v_is_gliim and not v_is_feed_item then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  if v_is_gliim then
    delete from public.feed_interactions where post_id = p_item_id;
    delete from public.billing_events where event_type = 'premium_unlock' and item_id = p_item_id::text;
    delete from public.reports where target_type = 'post' and target_id = p_item_id;
    delete from public.feed_gliims where id = p_item_id;
    return jsonb_build_object('deleted', true, 'item_id', p_item_id, 'type', 'gliim');
  else
    delete from public.saved_items where item_id = p_item_id;
    delete from public.purchases where item_id = p_item_id;
    delete from public.billing_events where event_type = 'premium_unlock' and item_id = p_item_id::text;
    delete from public.reports where target_type = 'library_item' and target_id = p_item_id;
    delete from public.feed_items where id = p_item_id;
    return jsonb_build_object('deleted', true, 'item_id', p_item_id, 'type', 'feed_item');
  end if;

exception
  when others then
    return jsonb_build_object('deleted', false, 'error', sqlerrm);
end;
$$;

notify pgrst, 'reload schema';

-- ============================================================
-- SELF CHECK — every row should say OK or show correct counts
-- ============================================================

select
  (select case when to_regclass('public.feed_submissions') is not null then 'OK' else 'MISSING' end) as feed_submissions,
  (select case when to_regclass('public.feed_items') is not null then 'OK' else 'MISSING' end) as feed_items,
  (select case when to_regclass('public.feed_gliims') is not null then 'OK' else 'MISSING' end) as feed_gliims,
  (select case when to_regclass('public.feed_gliim_contents') is not null then 'OK' else 'MISSING' end) as feed_gliim_contents,
  (select case when to_regclass('public.feed_contents') is not null then 'OK' else 'MISSING' end) as feed_contents,
  (select case when to_regclass('public.feed_interactions') is not null then 'OK' else 'MISSING' end) as feed_interactions,
  (select case when to_regclass('public.library_submissions') is null then 'OK (gone)' else 'STILL EXISTS' end) as old_library_submissions,
  (select case when to_regclass('public.library_items') is null then 'OK (gone)' else 'STILL EXISTS' end) as old_library_items,
  (select case when to_regclass('public.posts') is null then 'OK (gone)' else 'STILL EXISTS' end) as old_posts,
  (select count(*) from public.feed_submissions) as submission_count,
  (select count(*) from public.feed_items) as item_count,
  (select count(*) from public.feed_gliims) as gliim_count;
