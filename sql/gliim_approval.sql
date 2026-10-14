-- ============================================================
-- Gliimu: CRM approval flow for gliims (hub posts)
-- Run this in the Supabase SQL Editor AFTER sql/admin.sql and
-- sql/premium_lock.sql. Safe to run more than once.
--
-- WHAT THIS INSTALLS
--   1. posts.status ('pending' | 'approved' | 'rejected') plus the
--      review audit columns (reviewed_by, reviewed_at, review_note).
--      Every EXISTING post is backfilled to 'approved' so nothing that
--      is already live disappears.
--   2. A BEFORE INSERT trigger that forces status = 'pending' for
--      ordinary members and 'approved' for admins (is_admin()). Admins
--      therefore post live instantly; everyone else waits for review.
--   3. A BEFORE UPDATE trigger that stops a member from promoting their
--      own pending gliim to 'approved'. Only an admin or a CRM reviewer
--      may change the status / review columns.
--   4. RESTRICTIVE RLS policies that hide any non-approved gliim from
--      every member (including its own author) and from anon, while
--      admins and CRM reviewers still see it. Restrictive policies are
--      AND-ed with whatever permissive read policy posts already has, so
--      this cannot widen access — it only narrows it to approved rows.
--      Guarded: only added when RLS is already enabled on posts (it is,
--      in the live project). If RLS were ever disabled the script warns
--      instead of locking everyone out.
--   5. A permissive "CRM read posts" policy so the admin app can always
--      list gliims for review regardless of the member-facing policy.
--   6. admin_list_pending_posts(p_status) — SECURITY DEFINER feed for the
--      admin app: returns gliims with author name/avatar and their body
--      blocks in one call, bypassing RLS so a reviewer sees exactly what
--      will go live (including premium bodies).
--   7. admin_review_post(p_post, p_action, p_note) — approve/reject.
--      Approving flips status to 'approved' and pings the author;
--      rejecting requires a note, flips status to 'rejected' and pings
--      the author with the reason.
--
-- APPROVAL MODEL (agreed): a pending gliim is invisible to EVERYONE —
-- the feed, the landing page and the author's own portfolio — until a
-- CRM reviewer or admin approves it. Admins skip the queue.
--
-- MONEY/LEDGER: unchanged. Premium economics still live in
-- sql/billing.sql + sql/premium_lock.sql.
-- ============================================================

select pg_advisory_xact_lock(hashtext('gliimu-gliim-approval'));


-- ============================================================
-- 1. Columns
-- ============================================================

alter table public.posts
  add column if not exists status text not null default 'approved';

alter table public.posts
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.posts
  add column if not exists reviewed_at timestamptz;

alter table public.posts
  add column if not exists review_note text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'posts_status_check' and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

-- Anything already in the table predates moderation and stays live.
update public.posts set status = 'approved' where status is null;


-- ============================================================
-- 2 + 3. Status triggers
-- ============================================================

create or replace function public.set_post_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    new.status := 'approved';
  else
    new.status := 'pending';
  end if;
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.review_note := null;
  return new;
end $$;

create or replace function public.guard_post_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Staff (super admin or CRM) may move a gliim through the queue.
  if public.is_admin() or public.admin_has_role(auth.uid(), 'crm') then
    return new;
  end if;
  -- A member editing their own gliim cannot touch the moderation fields.
  new.status      := old.status;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.review_note := old.review_note;
  return new;
end $$;

drop trigger if exists trg_set_post_status on public.posts;
create trigger trg_set_post_status
  before insert on public.posts
  for each row execute function public.set_post_status();

drop trigger if exists trg_guard_post_status on public.posts;
create trigger trg_guard_post_status
  before update on public.posts
  for each row execute function public.guard_post_status();


-- ============================================================
-- 4 + 5. RLS — hide unapproved gliims, let CRM read everything
-- ============================================================

do $$ begin
  if (select coalesce(relrowsecurity, false) from pg_class where oid = 'public.posts'::regclass) then
    execute 'drop policy if exists "hide unapproved gliims" on public.posts';
    execute $p$
      create policy "hide unapproved gliims" on public.posts
        as restrictive
        for select to authenticated
        using (status = 'approved' or public.is_admin() or public.admin_has_role(auth.uid(), 'crm'))
    $p$;

    execute 'drop policy if exists "hide unapproved gliims (anon)" on public.posts';
    execute $p$
      create policy "hide unapproved gliims (anon)" on public.posts
        as restrictive
        for select to anon
        using (status = 'approved')
    $p$;
  else
    raise warning 'public.posts has RLS disabled — pending gliims are hidden client-side only. Enable RLS on posts to enforce moderation in the database.';
  end if;
end $$;

-- Guarantees the admin app can list gliims for review even if the
-- member-facing read policy is owner-only. OR-ed with the existing
-- permissive policy, then narrowed by the restrictive policy above.
drop policy if exists "CRM read posts" on public.posts;
create policy "CRM read posts" on public.posts
  for select to authenticated
  using (public.admin_has_role(auth.uid(), 'crm'));


-- ============================================================
-- 6. Review queue feed for the admin app
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
      from public.posts p
      left join public.profiles pr      on pr.id = p.user_id
      left join public.post_contents pc on pc.post_id = p.id
     where p.status = coalesce(nullif(btrim(p_status), ''), 'pending')
  ), '[]'::jsonb));
end $$;

revoke execute on function public.admin_list_pending_posts(text) from public, anon;
grant execute on function public.admin_list_pending_posts(text) to authenticated, service_role;


-- ============================================================
-- 7. Approve / reject
-- ============================================================

create or replace function public.admin_review_post(p_post uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_post public.posts%rowtype;
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

  select * into v_post from public.posts where id = p_post;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if p_action = 'reject' then
    if coalesce(btrim(p_note), '') = '' then
      return jsonb_build_object('ok', false, 'code', 'NOTE_REQUIRED');
    end if;

    update public.posts
       set status = 'rejected', reviewed_by = uid, reviewed_at = now(), review_note = p_note
     where id = p_post;

    insert into public.messages (sender_id, receiver_id, content, is_ai)
    values (uid, v_post.user_id,
            'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was not approved. Reason: ' || p_note,
            false);

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  update public.posts
     set status = 'approved', reviewed_by = uid, reviewed_at = now(), review_note = p_note
   where id = p_post;

  insert into public.messages (sender_id, receiver_id, content, is_ai)
  values (uid, v_post.user_id,
          'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was approved and is now live in the Hub.',
          false);

  return jsonb_build_object('ok', true, 'status', 'approved');
end $$;

revoke execute on function public.admin_review_post(uuid, text, text) from public, anon;
grant execute on function public.admin_review_post(uuid, text, text) to authenticated, service_role;


notify pgrst, 'reload schema';


-- ============================================================
-- SELF CHECK — read this grid after running. Every row should say OK
-- (or show a sensible count). No raise notice here on purpose.
-- ============================================================

select
  (select case when exists (select 1 from information_schema.columns
                             where table_schema='public' and table_name='posts' and column_name='status')
               then 'OK' else 'MISSING' end)                          as status_column,
  (select case when exists (select 1 from pg_constraint
                             where conname='posts_status_check' and conrelid='public.posts'::regclass)
               then 'OK' else 'MISSING' end)                          as status_check,
  (select case when exists (select 1 from information_schema.columns
                             where table_schema='public' and table_name='posts' and column_name='reviewed_by')
               then 'OK' else 'MISSING' end)                          as audit_columns,
  (select case when exists (select 1 from pg_trigger where tgname='trg_set_post_status')
               then 'OK' else 'MISSING' end)                          as insert_trigger,
  (select case when exists (select 1 from pg_trigger where tgname='trg_guard_post_status')
               then 'OK' else 'MISSING' end)                          as update_trigger,
  (select case when (select coalesce(relrowsecurity,false) from pg_class where oid='public.posts'::regclass)
               then 'OK' else 'DISABLED — client-side only' end)      as posts_rls,
  (select count(*) from pg_policies
    where schemaname='public' and tablename='posts'
      and policyname in ('hide unapproved gliims','hide unapproved gliims (anon)','CRM read posts'))
                                                                      as moderation_policies,
  (select coalesce(to_regprocedure('public.admin_list_pending_posts(text)')::text,'MISSING'))
                                                                      as list_rpc,
  (select coalesce(to_regprocedure('public.admin_review_post(uuid,text,text)')::text,'MISSING'))
                                                                      as review_rpc,
  (select count(*) from public.posts where status='pending')          as pending_gliims,
  (select count(*) from public.posts where status='approved')         as approved_gliims,
  (select count(*) from public.posts)                                 as total_posts;
