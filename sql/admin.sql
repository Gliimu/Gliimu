-- ============================================================
-- Gliimu: Admin app — roles, CRM permissions, review RPCs
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once.
--
-- WHAT THIS INSTALLS
--   1. admin_users — who is an admin and which role they hold:
--        super       everything, including managing other admins
--        crm         library submissions, reports, FAQs, legal text
--                    (the contact_info table is CRM's too, but its screen
--                     is not built yet)
--        registrar   finance, ledger, members, bills, revenue and pricing
--                    — see sql/registrar.sql
--        captain     triads and apprentice progress — see sql/captain.sql
--        operations  landing page media, the partner wall and the app
--                    release — see sql/operations.sql
--   2. Helpers: admin_role(), admin_has_role(), current_admin_role().
--      'super' implies every other role, so a super admin passes any
--      role check without being listed twice.
--   3. is_admin() widened: the legacy profiles.is_admin flag still works,
--      and a 'super' row in admin_users now satisfies it too. Existing
--      is_admin()-gated policies (partners, site settings, deals) keep
--      working unchanged — but a CRM admin does NOT gain them, which is
--      the point: CRM gets only the CRM policies below.
--   4. CRM read/write policies on reports, faqs, legal_documents and
--      library_submissions.
--   5. Review RPCs: admin_review_submission (approve/reject) and
--      admin_resolve_report. Approving a submission creates the shelf
--      item AND its locked body in one transaction, stamps owner_id,
--      and pings the submitter.
--   6. admin_grant_role / admin_revoke_role / admin_list_admins — super
--      only. admin_users is unreadable through PostgREST, so the admin
--      app learns its own role from current_admin_role() and the admin
--      directory from admin_list_admins().
--
-- RUN ORDER: after sql/all.sql, sql/billing.sql,
-- sql/library_submissions.sql and sql/library_content.sql. Running it out
-- of order does not fail — the tables it cannot find are reported as
-- warnings and their policies are skipped, so re-run it afterwards.
--
-- BOOTSTRAP: the first super admin is copied automatically from
-- profiles.is_admin = true (see section 3). If nobody has that flag yet,
-- run the commented insert at the end of section 3 by hand.
-- ============================================================

select pg_advisory_xact_lock(hashtext('gliimu-admin'));


-- ============================================================
-- 1. admin_users
-- ============================================================

create table if not exists public.admin_users (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  role       text not null default 'crm',
  note       text,
  added_by   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.admin_users is
  'Admin identity for the separate admin app. Managed only through admin_grant_role / admin_revoke_role (super admins).';

-- Roles are validated in one place so a typo can never create a role no
-- policy recognises.
do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'admin_users_role_check' and conrelid = 'public.admin_users'::regclass
  ) then
    alter table public.admin_users
      add constraint admin_users_role_check
      check (role in ('super', 'crm', 'registrar', 'captain', 'operations'));
  end if;
end $$;

alter table public.admin_users enable row level security;

-- No role may read or write this table directly through PostgREST. Every
-- legitimate path (the helpers and the grant/revoke RPCs) is SECURITY
-- DEFINER and bypasses RLS, so a locked table costs nothing and means a
-- compromised anon key cannot list or promote admins.
revoke all on public.admin_users from public, anon, authenticated;
grant select, insert, update, delete on public.admin_users to service_role;


-- ============================================================
-- 2. Role helpers
-- ============================================================

create or replace function public.admin_role(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.role from public.admin_users a where a.user_id = p_user;
$$;

-- 'super' satisfies every role check.
create or replace function public.admin_has_role(p_user uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users a
     where a.user_id = p_user
       and (a.role = 'super' or a.role = p_role)
  );
$$;

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.admin_role(auth.uid());
$$;

revoke execute on function public.admin_role(uuid) from public, anon;
revoke execute on function public.admin_has_role(uuid, text) from public, anon;
revoke execute on function public.current_admin_role() from public, anon;

grant execute on function public.admin_role(uuid) to authenticated, service_role;
grant execute on function public.admin_has_role(uuid, text) to authenticated, service_role;
grant execute on function public.current_admin_role() to authenticated, service_role;

-- The legacy flag stays authoritative for anyone who already has it, and a
-- super admin now satisfies it as well.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
      or public.admin_has_role(auth.uid(), 'super');
$$;

grant execute on function public.is_admin() to anon, authenticated;


-- ============================================================
-- 3. Bootstrap the first super admin
--    Guarded: only fires while admin_users is empty, so re-running never
--    overwrites a role someone set on purpose.
-- ============================================================

do $$ begin
  if not exists (select 1 from public.admin_users) then
    insert into public.admin_users (user_id, role, note)
    select p.id, 'super', 'Bootstrapped from profiles.is_admin'
      from public.profiles p
     where p.is_admin
     order by p.id
     limit 1;

    if found then
      raise notice 'bootstrapped the first super admin from profiles.is_admin';
    else
      raise warning 'no super admin created — nobody has profiles.is_admin = true. Run the insert at the end of section 3 by hand.';
    end if;
  end if;
end $$;

-- If the warning above fired, promote yourself with (once, by hand):
--   insert into public.admin_users (user_id, role, note)
--   select id, 'super', 'first admin' from public.profiles where username = 'yourusername'
--   on conflict (user_id) do update set role = 'super';


-- ============================================================
-- 4. CRM permissions
--    Reports: CRM reads every report and closes it through
--    admin_resolve_report (no direct update policy — the status values
--    stay controlled).
--    Each table is guarded so a missing one warns instead of aborting
--    the whole script — run the script that creates it, then re-run this.
-- ============================================================

do $$ begin
  if to_regclass('public.reports') is not null then
    execute 'drop policy if exists "CRM read reports" on public.reports';
    execute $p$
      create policy "CRM read reports" on public.reports
        for select to authenticated
        using (public.admin_has_role(auth.uid(), 'crm'))
    $p$;
  else
    raise warning 'public.reports is missing — the CRM report policy was skipped.';
  end if;

  -- FAQs and legal text are CRM-owned content (Operations owns the rest of
  -- the landing page but explicitly not these two).
  if to_regclass('public.faqs') is not null then
    execute 'drop policy if exists "CRM manage faqs" on public.faqs';
    execute $p$
      create policy "CRM manage faqs" on public.faqs
        for all to authenticated
        using (public.admin_has_role(auth.uid(), 'crm'))
        with check (public.admin_has_role(auth.uid(), 'crm'))
    $p$;
    execute 'grant select, insert, update, delete on public.faqs to authenticated';
  else
    raise warning 'public.faqs is missing — the CRM FAQ policy was skipped.';
  end if;

  if to_regclass('public.legal_documents') is not null then
    execute 'drop policy if exists "CRM manage legal documents" on public.legal_documents';
    execute $p$
      create policy "CRM manage legal documents" on public.legal_documents
        for all to authenticated
        using (public.admin_has_role(auth.uid(), 'crm'))
        with check (public.admin_has_role(auth.uid(), 'crm'))
    $p$;
    execute 'grant select, insert, update, delete on public.legal_documents to authenticated';
  else
    raise warning 'public.legal_documents is missing — the CRM legal policy was skipped.';
  end if;

  if to_regclass('public.library_submissions') is not null then
    execute 'drop policy if exists "Library submissions review" on public.library_submissions';
    execute $p$
      create policy "Library submissions review" on public.library_submissions
        for select to authenticated
        using (public.admin_has_role(auth.uid(), 'crm'))
    $p$;
  else
    raise warning 'public.library_submissions is missing — run sql/library_submissions.sql, then re-run this script.';
  end if;
end $$;

-- Contact details live in their own contact_info table (address, phone,
-- email and the four social links — public/assets/js/main.js reads them),
-- not in site_settings. A CRM screen for it needs no column-splitting
-- trick; it simply has not been built yet. site_settings itself is
-- Operations-only and is locked down by sql/operations.sql.


-- ============================================================
-- 5. Audit columns on library_submissions
-- ============================================================

do $$ begin
  if to_regclass('public.library_submissions') is null then
    raise warning 'public.library_submissions is missing — the review audit columns were skipped.';
    return;
  end if;

  alter table public.library_submissions
    add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

  alter table public.library_submissions
    add column if not exists reviewed_at timestamptz;

  alter table public.library_submissions
    add column if not exists review_note text;
end $$;


-- ============================================================
-- 6. Submission review
--    Approving writes three things that must not drift apart: the shelf
--    item, its locked body, and the submission's audit trail. One
--    transaction, one RPC.
-- ============================================================

create or replace function public.admin_review_submission(p_submission uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_sub     public.library_submissions%rowtype;
  v_item    uuid;
  v_files   jsonb;
  v_body    text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not public.admin_has_role(uid, 'crm') then
    return jsonb_build_object('ok', false, 'code', 'NOT_CRM');
  end if;

  if p_action not in ('approve', 'reject') then
    return jsonb_build_object('ok', false, 'code', 'BAD_ACTION');
  end if;

  select * into v_sub from public.library_submissions where id = p_submission;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if v_sub.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_REVIEWED', 'status', v_sub.status);
  end if;

  if p_action = 'reject' then
    if coalesce(btrim(p_note), '') = '' then
      return jsonb_build_object('ok', false, 'code', 'NOTE_REQUIRED');
    end if;

    update public.library_submissions
       set status = 'rejected', reviewed_by = uid, reviewed_at = now(), review_note = p_note
     where id = p_submission;

    insert into public.messages (sender_id, receiver_id, content, is_ai)
    values (uid, v_sub.user_id,
            'Your library submission "' || v_sub.title || '" was not approved. Reason: ' || p_note,
            false);

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  -- The bundle/audiolite/publication shapes all land in library_contents.files
  -- the same way the backfill in sql/library_content.sql does it.
  v_files := case
    when v_sub.type = 'bundle'
      then coalesce(v_sub.bundle_items, '[]'::jsonb)
    when coalesce(v_sub.file_url, '') <> ''
      then jsonb_build_array(jsonb_build_object('title', v_sub.title, 'url', v_sub.file_url))
    else '[]'::jsonb
  end;

  -- library_items predates these scripts, so its exact columns are not in
  -- the repo. An unexpected schema must fail loudly and leave the
  -- submission pending rather than half-publish it — the exception block
  -- rolls back to this point only.
  begin
    insert into public.library_items (title, type, description, price, cover_url, author, author_avatar, owner_id)
    select v_sub.title,
           v_sub.type,
           v_sub.description,
           v_sub.price,
           v_sub.cover_url,
           coalesce(p.full_name, p.username, 'Gliimu'),
           p.avatar_url,
           v_sub.user_id
      from public.profiles p
     where p.id = v_sub.user_id
    returning id into v_item;
  exception when others then
    v_body := SQLERRM;
    return jsonb_build_object('ok', false, 'code', 'SCHEMA_MISMATCH', 'detail', v_body);
  end;

  if v_item is null then
    return jsonb_build_object('ok', false, 'code', 'NO_AUTHOR_PROFILE');
  end if;

  insert into public.library_contents (item_id, blocks, files)
  values (v_item, coalesce(v_sub.blocks, '[]'::jsonb), v_files);

  update public.library_submissions
     set status = 'approved', reviewed_by = uid, reviewed_at = now(), review_note = p_note
   where id = p_submission;

  insert into public.messages (sender_id, receiver_id, content, is_ai)
  values (uid, v_sub.user_id,
          'Your library submission "' || v_sub.title || '" was approved and is now live on the shelf.',
          false);

  return jsonb_build_object('ok', true, 'status', 'approved', 'item_id', v_item);
end
$$;

revoke execute on function public.admin_review_submission(uuid, text, text) from public, anon;
grant execute on function public.admin_review_submission(uuid, text, text) to authenticated, service_role;


-- ============================================================
-- 7. Report resolution
-- ============================================================

create or replace function public.admin_resolve_report(p_report uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not public.admin_has_role(uid, 'crm') then
    return jsonb_build_object('ok', false, 'code', 'NOT_CRM');
  end if;

  if p_status not in ('resolved', 'dismissed') then
    return jsonb_build_object('ok', false, 'code', 'BAD_STATUS');
  end if;

  update public.reports set status = p_status where id = p_report and status = 'open';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  return jsonb_build_object('ok', true, 'status', p_status);
end
$$;

revoke execute on function public.admin_resolve_report(uuid, text) from public, anon;
grant execute on function public.admin_resolve_report(uuid, text) to authenticated, service_role;


-- ============================================================
-- 8. Grant / revoke — super only
-- ============================================================

create or replace function public.admin_grant_role(p_user uuid, p_role text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not public.admin_has_role(uid, 'super') then
    return jsonb_build_object('ok', false, 'code', 'NOT_SUPER');
  end if;

  if p_role not in ('super', 'crm', 'registrar', 'captain', 'operations') then
    return jsonb_build_object('ok', false, 'code', 'BAD_ROLE');
  end if;

  if not exists (select 1 from public.profiles where id = p_user) then
    return jsonb_build_object('ok', false, 'code', 'NO_USER');
  end if;

  insert into public.admin_users (user_id, role, note, added_by)
  values (p_user, p_role, p_note, uid)
  on conflict (user_id) do update
     set role = excluded.role, note = excluded.note;

  -- Supers keep the legacy dashboard admin UI working, which reads
  -- profiles.is_admin directly rather than calling is_admin().
  if p_role = 'super' then
    update public.profiles set is_admin = true where id = p_user;
  end if;

  return jsonb_build_object('ok', true, 'role', p_role);
end
$$;

create or replace function public.admin_revoke_role(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_role   text;
  v_supers integer;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not public.admin_has_role(uid, 'super') then
    return jsonb_build_object('ok', false, 'code', 'NOT_SUPER');
  end if;

  select a.role into v_role from public.admin_users a where a.user_id = p_user;
  if v_role is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if v_role = 'super' then
    select count(*) into v_supers from public.admin_users where role = 'super';
    if v_supers <= 1 then
      return jsonb_build_object('ok', false, 'code', 'LAST_SUPER');
    end if;
  end if;

  delete from public.admin_users where user_id = p_user;

  -- Only a super was ever mirrored into profiles.is_admin, so only a super
  -- revoke clears it; a CRM losing their role keeps whatever the legacy
  -- flag already said.
  if v_role = 'super' then
    update public.profiles set is_admin = false where id = p_user;
  end if;

  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.admin_grant_role(uuid, text, text) from public, anon;
revoke execute on function public.admin_revoke_role(uuid) from public, anon;
grant execute on function public.admin_grant_role(uuid, text, text) to authenticated, service_role;
grant execute on function public.admin_revoke_role(uuid) to authenticated, service_role;

-- admin_users is unreadable through PostgREST on purpose, so the admin app
-- gets its directory through this instead. Super only.
create or replace function public.admin_list_admins()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED')
    when not public.admin_has_role(auth.uid(), 'super') then jsonb_build_object('ok', false, 'code', 'NOT_SUPER')
    else jsonb_build_object('ok', true, 'admins', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', a.user_id,
               'role', a.role,
               'note', a.note,
               'username', p.username,
               'full_name', p.full_name,
               'avatar_url', p.avatar_url,
               'created_at', a.created_at)
               order by a.created_at)
        from public.admin_users a
        left join public.profiles p on p.id = a.user_id
    ), '[]'::jsonb))
  end;
$$;

revoke execute on function public.admin_list_admins() from public, anon;
grant execute on function public.admin_list_admins() to authenticated, service_role;


-- ============================================================
-- 9. SELF CHECK — read these notices after running
-- ============================================================

do $$
declare
  v_pending integer;
  v_open    integer;
begin
  raise notice '==== ADMIN SELF CHECK ====';
  raise notice 'admin_users table:        %', case when to_regclass('public.admin_users') is not null then 'OK' else 'MISSING' end;
  raise notice 'RLS enabled:              %', case when (select relrowsecurity from pg_class where oid = to_regclass('public.admin_users')) is true then 'OK' else 'MISSING' end;
  raise notice 'admin_role():             %', coalesce(to_regprocedure('public.admin_role(uuid)')::text, 'MISSING');
  raise notice 'admin_has_role():         %', coalesce(to_regprocedure('public.admin_has_role(uuid,text)')::text, 'MISSING');
  raise notice 'admin_review_submission():%', coalesce(to_regprocedure('public.admin_review_submission(uuid,text,text)')::text, 'MISSING');
  raise notice 'admin_resolve_report():   %', coalesce(to_regprocedure('public.admin_resolve_report(uuid,text)')::text, 'MISSING');
  raise notice 'admin_grant_role():       %', coalesce(to_regprocedure('public.admin_grant_role(uuid,text,text)')::text, 'MISSING');
  raise notice 'admin_revoke_role():      %', coalesce(to_regprocedure('public.admin_revoke_role(uuid)')::text, 'MISSING');
  raise notice 'admin_list_admins():      %', coalesce(to_regprocedure('public.admin_list_admins()')::text, 'MISSING');
  raise notice 'is_admin() knows super:   %', case when pg_get_functiondef('public.is_admin()'::regprocedure) like '%admin_has_role%' then 'OK' else 'MISSING — re-run' end;
  raise notice 'admins total:             %', (select count(*) from public.admin_users);
  raise notice 'super admins (need >= 1): %', (select count(*) from public.admin_users where role = 'super');
  raise notice 'admin roles:              %', coalesce((select string_agg(role || ':' || coalesce(p.username, '?'), ', ')
                                                            from public.admin_users a
                                                            left join public.profiles p on p.id = a.user_id), 'none');
  raise notice 'CRM policies (expect 4):  %', (select count(*) from pg_policies
                                                 where schemaname = 'public'
                                                   and policyname in ('CRM read reports', 'Library submissions review',
                                                                      'CRM manage faqs', 'CRM manage legal documents'));
  raise notice 'submissions audit cols:   %', case when exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'library_submissions' and column_name = 'reviewed_by'
    ) then 'OK' else 'MISSING' end;
  if to_regclass('public.library_submissions') is not null then
    select count(*) into v_pending from public.library_submissions where status = 'pending';
    raise notice 'pending submissions:      %', v_pending;
  else
    raise notice 'pending submissions:      skipped — run sql/library_submissions.sql';
  end if;

  if to_regclass('public.reports') is not null then
    select count(*) into v_open from public.reports where status = 'open';
    raise notice 'open reports:             %', v_open;
  else
    raise notice 'open reports:             skipped — table missing';
  end if;
  -- Paste this line back if approving a submission ever returns
  -- SCHEMA_MISMATCH: it shows the real shape of library_items.
  raise notice 'library_items columns:    %', (select string_agg(column_name || ' ' || data_type ||
                                                              case when is_nullable = 'NO' then ' NOT NULL' else '' end,
                                                              ', ' order by ordinal_position)
                                                from information_schema.columns
                                               where table_schema = 'public' and table_name = 'library_items');
  raise notice 'site_settings columns:    %', (select string_agg(column_name, ', ' order by ordinal_position)
                                                from information_schema.columns
                                               where table_schema = 'public' and table_name = 'site_settings');
  raise notice '==========================';
end $$;

notify pgrst, 'reload schema';
