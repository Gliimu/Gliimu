-- ============================================================
-- Gliimu: Support channel — one shared admin thread per member
--
-- Why a new table: the live `messages` read policy only lets a row's two
-- participants see it, so admin A can never read admin B's message to the
-- same member. Support is a GROUP (every staff member + exactly one member),
-- which needs its own authorization. It also keeps Support out of Ping by
-- construction: no Ping query, read-receipt RPC or the provenance trigger
-- ever sees these rows.
--
-- Run AFTER sql/admin.sql (admin_users + admin_role helpers),
-- sql/messages_admin.sql and sql/gliim_approval.sql.
-- Safe to rerun: one transaction, explicit definitions, guarded inserts.
--
-- This script is the authoritative definition of admin_review_submission and
-- admin_review_post — run it LAST in the review-function family.
-- ============================================================

begin;

-- ============================================================
-- 1. Staff gate for Support.
--    Deliberately narrower than "any admin": crm + operations + super only,
--    so captain/registrar staff cannot read member conversations.
--    SECURITY DEFINER because admin_users is revoked from authenticated;
--    this is the same trick the CRM post-review policies already use.
-- ============================================================

create or replace function public.support_can_view(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select a.role in ('crm', 'operations', 'super')
      from public.admin_users a
     where a.user_id = p_user
  ), false);
$$;

revoke execute on function public.support_can_view(uuid) from public, anon;
grant execute on function public.support_can_view(uuid) to authenticated, service_role;

-- ============================================================
-- 2. The thread rows. Immutable: no UPDATE/DELETE policy exists, so nobody
--    can edit or retract a support message once sent.
-- ============================================================

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_user uuid not null,
  sender_id uuid not null,
  content text not null default '',
  attachment_url text,
  attachment_type text,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_thread_time_idx
  on public.support_messages (thread_user, created_at);
create index if not exists support_messages_sender_idx
  on public.support_messages (sender_id);

alter table public.support_messages enable row level security;

revoke all on public.support_messages from anon;
grant select, insert on public.support_messages to authenticated;
grant all on public.support_messages to service_role;

drop policy if exists "Members read own support thread" on public.support_messages;
create policy "Members read own support thread" on public.support_messages
  for select to authenticated
  using ( thread_user = (select auth.uid()) );

drop policy if exists "Staff read every support thread" on public.support_messages;
create policy "Staff read every support thread" on public.support_messages
  for select to authenticated
  using ( public.support_can_view(auth.uid()) );

drop policy if exists "Member posts in own thread" on public.support_messages;
create policy "Member posts in own thread" on public.support_messages
  for insert to authenticated
  with check ( sender_id = (select auth.uid()) and thread_user = (select auth.uid()) );

drop policy if exists "Staff post as themselves" on public.support_messages;
create policy "Staff post as themselves" on public.support_messages
  for insert to authenticated
  with check ( sender_id = (select auth.uid()) and public.support_can_view(auth.uid()) );

-- ============================================================
-- 3. Read cursor per viewer. In a group there is no single read_at column
--    that makes sense, so each reader keeps their own watermark and unread
--    is derived. Server-side, so it agrees across devices.
-- ============================================================

create table if not exists public.support_reads (
  thread_user uuid not null,
  reader_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (thread_user, reader_id)
);

alter table public.support_reads enable row level security;

revoke all on public.support_reads from anon;
grant select, insert, update on public.support_reads to authenticated;
grant all on public.support_reads to service_role;

drop policy if exists "Readers see own cursor" on public.support_reads;
create policy "Readers see own cursor" on public.support_reads
  for select to authenticated
  using ( reader_id = (select auth.uid()) );

drop policy if exists "Readers create own cursor" on public.support_reads;
create policy "Readers create own cursor" on public.support_reads
  for insert to authenticated
  with check ( reader_id = (select auth.uid()) );

drop policy if exists "Readers update own cursor" on public.support_reads;
create policy "Readers update own cursor" on public.support_reads
  for update to authenticated
  using ( reader_id = (select auth.uid()) )
  with check ( reader_id = (select auth.uid()) );

-- ============================================================
-- 4. RPCs. All SECURITY INVOKER except support_inbox(), so RLS is the
--    authorization layer and a non-staff caller simply gets zero rows.
--    Both UPDATEs carry a WHERE clause: pg-safeupdate rejects bare ones.
-- ============================================================

create or replace function public.support_thread_unread(p_thread_user uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer
    from public.support_messages m
   where m.thread_user = p_thread_user
     and m.sender_id <> auth.uid()
     and m.created_at > coalesce(
           (select r.last_read_at from public.support_reads r
             where r.thread_user = p_thread_user and r.reader_id = auth.uid()),
           '-infinity'::timestamptz);
$$;

revoke execute on function public.support_thread_unread(uuid) from public, anon;
grant execute on function public.support_thread_unread(uuid) to authenticated, service_role;

create or replace function public.support_mark_read(p_thread_user uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.support_reads
     set last_read_at = now()
   where thread_user = p_thread_user
     and reader_id = auth.uid()
     and last_read_at < now();

  insert into public.support_reads (thread_user, reader_id, last_read_at)
  values (p_thread_user, auth.uid(), now())
  on conflict (thread_user, reader_id) do nothing;
end
$$;

revoke execute on function public.support_mark_read(uuid) from public, anon;
grant execute on function public.support_mark_read(uuid) to authenticated, service_role;

-- Admin console list: one row per member who has ever opened a thread.
-- Returns no username anywhere — full name and avatar only.
create or replace function public.support_inbox()
returns table (
  thread_user uuid,
  member_name text,
  member_avatar text,
  last_content text,
  last_is_staff boolean,
  last_created_at timestamptz,
  unread integer,
  message_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select m.thread_user,
         coalesce(p.full_name, 'Gliimait'),
         p.avatar_url,
         last_msg.content,
         last_msg.is_staff,
         last_msg.created_at,
         unread.n::integer,
         cnt.n::integer
    from (select distinct thread_user from public.support_messages) m
    left join public.profiles p on p.id = m.thread_user
    cross join lateral (
      select s.content,
             coalesce(s.sender_id <> s.thread_user, false) as is_staff,
             s.created_at
        from public.support_messages s
       where s.thread_user = m.thread_user
       order by s.created_at desc
       limit 1
    ) last_msg
    cross join lateral (
      select count(*) n
        from public.support_messages s
       where s.thread_user = m.thread_user
    ) cnt
    cross join lateral (
      select count(*) n
        from public.support_messages s
       where s.thread_user = m.thread_user
         and s.sender_id <> auth.uid()
         and s.created_at > coalesce(
               (select r.last_read_at from public.support_reads r
                 where r.thread_user = m.thread_user and r.reader_id = auth.uid()),
               '-infinity'::timestamptz)
    ) unread
   where public.support_can_view(auth.uid());
$$;

revoke execute on function public.support_inbox() from public, anon;
grant execute on function public.support_inbox() to authenticated, service_role;

-- ============================================================
-- 5. Like / dislike on assistant replies. The reply rows are owned by the
--    member (sender = member, receiver null, is_ai true), so their existing
--    own-row UPDATE policy already permits this write — only the column and
--    its allowed values are new here.
-- ============================================================

alter table public.messages add column if not exists feedback text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.messages'::regclass
       and conname = 'messages_feedback_check'
  ) then
    alter table public.messages
      add constraint messages_feedback_check check (feedback in ('like', 'dislike'));
  end if;
end
$$;

-- ============================================================
-- 6. Realtime: support threads ride the existing publication. Guarded,
--    because adding a table twice errors and would abort the transaction.
-- ============================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and tablename = 'support_messages'
     ) then
    begin
      alter publication supabase_realtime add table public.support_messages;
    exception when duplicate_object or insufficient_privilege then
      -- Already published, or the role cannot alter it: the self-check below
      -- reports the actual state, so this must not abort the whole script.
      null;
    end;
  end if;
end
$$;

-- ============================================================
-- 7. Move existing admin-origin Ping messages into Support, once, by id.
--    The source rows stay in messages (Ping hides them in the client), so a
--    rerun is a no-op and nothing is destroyed. Only rows whose member still
--    has a profile are copied — an orphan thread has nobody to read it.
-- ============================================================

insert into public.support_messages (id, thread_user, sender_id, content, attachment_url, attachment_type, created_at)
select m.id, m.receiver_id, m.sender_id, coalesce(m.content, ''), m.attachment_url, m.attachment_type, m.created_at
  from public.messages m
 where m.is_admin = true
   and m.receiver_id is not null
   and exists (select 1 from public.profiles p where p.id = m.receiver_id)
   and not exists (select 1 from public.support_messages s where s.id = m.id)
on conflict (id) do nothing;

-- ============================================================
-- 8. Review notices now land in Support instead of Ping.
--    Authoritative copies of both RPCs — keep in sync with sql/admin.sql,
--    sql/library_kinds.sql and sql/gliim_approval.sql.
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

    insert into public.support_messages (thread_user, sender_id, content)
    values (v_sub.user_id, uid,
            'Your library submission "' || v_sub.title || '" was not approved. Reason: ' || p_note);

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  -- Every multi-part shape (a bundle's files, an audiolite's ordered chapters)
  -- rides in bundle_items as [{title,url}]; a single-file book rides in
  -- file_url. They all land in library_contents.files the same way the
  -- backfill in sql/library_content.sql does it.
  v_files := case
    when jsonb_typeof(coalesce(v_sub.bundle_items, '[]'::jsonb)) = 'array'
     and jsonb_array_length(coalesce(v_sub.bundle_items, '[]'::jsonb)) > 0
      then v_sub.bundle_items
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

  insert into public.support_messages (thread_user, sender_id, content)
  values (v_sub.user_id, uid,
          'Your library submission "' || v_sub.title || '" was approved and is now live on the shelf.');

  return jsonb_build_object('ok', true, 'status', 'approved', 'item_id', v_item);
end
$$;

revoke execute on function public.admin_review_submission(uuid, text, text) from public, anon;
grant execute on function public.admin_review_submission(uuid, text, text) to authenticated, service_role;

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

    insert into public.support_messages (thread_user, sender_id, content)
    values (v_post.user_id, uid,
            'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was not approved. Reason: ' || p_note);

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  update public.posts
     set status = 'approved', reviewed_by = uid, reviewed_at = now(), review_note = p_note
   where id = p_post;

  insert into public.support_messages (thread_user, sender_id, content)
  values (v_post.user_id, uid,
          'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was approved and is now live in the Hub.');

  return jsonb_build_object('ok', true, 'status', 'approved');
end
$$;

revoke execute on function public.admin_review_post(uuid, text, text) from public, anon;
grant execute on function public.admin_review_post(uuid, text, text) to authenticated, service_role;

-- The provenance trigger still guards messages.is_admin, but admin notices no
-- longer use that column, so the sender-revalidation branch must not fire on
-- rows this script migrated. Left as-is: it only ever constrained NEW rows.

notify pgrst, 'reload schema';

-- ============================================================
-- 9. Self-check SELECT grid: every ok cell should be true.
-- ============================================================

with support_fns (name, oid) as (
  values
    ('support_can_view',    to_regprocedure('public.support_can_view(uuid)')),
    ('support_thread_unread', to_regprocedure('public.support_thread_unread(uuid)')),
    ('support_mark_read',   to_regprocedure('public.support_mark_read(uuid)')),
    ('support_inbox',       to_regprocedure('public.support_inbox()'))
), checks as (
  select 1 as "#", 'support_messages exists with the four core columns' as check_name,
         exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'support_messages' and c.relkind = 'r')
         and (select count(*) = 7 from information_schema.columns
               where table_schema = 'public' and table_name = 'support_messages'
                 and column_name in ('id','thread_user','sender_id','content','attachment_url','attachment_type','created_at')) as ok
  union all
  select 2, 'support_messages has RLS enabled and no update/delete policy',
         (select relrowsecurity from pg_class where oid = 'public.support_messages'::regclass)
         and not exists (select 1 from pg_policy where polrelid = 'public.support_messages'::regclass
                          and polcmd in ('w', 'd', '*'))
  union all
  select 3, 'four support policies present (2 read, 2 send)',
         (select count(*) = 4 from pg_policy where polrelid = 'public.support_messages'::regclass)
  union all
  select 4, 'staff read policy uses support_can_view (cross-admin visibility)',
         exists (select 1 from pg_policy where polrelid = 'public.support_messages'::regclass
                  and polcmd = 'r' and pg_get_expr(polqual, polrelid) ilike '%support_can_view%')
  union all
  select 5, 'support_reads keyed per reader with RLS and 3 own-row policies',
         exists (select 1 from pg_class where oid = 'public.support_reads'::regclass and relrowsecurity)
         and (select count(*) = 3 from pg_policy where polrelid = 'public.support_reads'::regclass)
         and exists (select 1 from pg_constraint where conrelid = 'public.support_reads'::regclass
                      and contype = 'p' and conkey @> array[(select attnum from pg_attribute
                                                              where attrelid = 'public.support_reads'::regclass and attname = 'thread_user'),
                                                             (select attnum from pg_attribute
                                                              where attrelid = 'public.support_reads'::regclass and attname = 'reader_id')])
  union all
  select 6, 'support_can_view is SECURITY DEFINER and crm/operations/super only',
         exists (select 1 from pg_proc where oid = to_regprocedure('public.support_can_view(uuid)')
                  and prosecdef and proconfig @> array['search_path=public'])
         and (select prosrc from pg_proc where oid = to_regprocedure('public.support_can_view(uuid)'))
             ilike '%crm%, %operations%, %super%'
  union all
  select 7, 'anon can neither read support tables nor run support functions',
         not has_table_privilege('anon', 'public.support_messages', 'SELECT')
         and not has_table_privilege('anon', 'public.support_reads', 'SELECT')
         and (select bool_and(not has_function_privilege('anon', oid, 'EXECUTE')) from support_fns)
  union all
  select 8, 'authenticated can select+insert messages, select+insert+update reads',
         has_table_privilege('authenticated', 'public.support_messages', 'SELECT')
         and has_table_privilege('authenticated', 'public.support_messages', 'INSERT')
         and has_table_privilege('authenticated', 'public.support_reads', 'SELECT')
         and has_table_privilege('authenticated', 'public.support_reads', 'INSERT')
         and has_table_privilege('authenticated', 'public.support_reads', 'UPDATE')
  union all
  select 9, 'authenticated can execute all four support functions',
         (select bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')) from support_fns)
  union all
  select 10, 'service_role can execute all four support functions',
         (select bool_and(has_function_privilege('service_role', oid, 'EXECUTE')) from support_fns)
  union all
  select 11, 'support_messages in supabase_realtime publication',
         exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'support_messages')
  union all
  select 12, 'messages.feedback column + like/dislike check constraint',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'messages' and column_name = 'feedback')
         and exists (select 1 from pg_constraint
                      where conrelid = 'public.messages'::regclass and conname = 'messages_feedback_check'
                        and pg_get_constraintdef(oid) ilike '%like%dislike%')
  union all
  select 13, 'both review RPCs post to support_messages (2 notices each)',
         (select count(*) = 2 from regexp_matches(
            (select prosrc from pg_proc where oid = to_regprocedure('public.admin_review_submission(uuid,text,text)')),
            'insert\s+into\s+public\.support_messages\s*\(thread_user,\s*sender_id,\s*content\)\s*values\s*\([^;]+\);', 'gi'))
         and (select count(*) = 2 from regexp_matches(
            (select prosrc from pg_proc where oid = to_regprocedure('public.admin_review_post(uuid,text,text)')),
            'insert\s+into\s+public\.support_messages\s*\(thread_user,\s*sender_id,\s*content\)\s*values\s*\([^;]+\);', 'gi'))
  union all
  select 14, 'no review RPC still writes an is_admin notice into messages',
         not exists (select 1 from pg_proc
                      where oid in (to_regprocedure('public.admin_review_submission(uuid,text,text)'),
                                    to_regprocedure('public.admin_review_post(uuid,text,text)'))
                        and prosrc ilike '%is_admin%')
  union all
  select 15, 'every migratable admin notice is now in a support thread',
         not exists (
           select 1 from public.messages m
            where m.is_admin = true and m.receiver_id is not null
              and exists (select 1 from public.profiles p where p.id = m.receiver_id)
              and not exists (select 1 from public.support_messages s where s.id = m.id))
  union all
  select 16, 'no support thread row points at a member with no profile',
         not exists (select 1 from public.support_messages s
                      where not exists (select 1 from public.profiles p where p.id = s.thread_user))
)
select "#", check_name, ok from checks order by "#";

commit;
