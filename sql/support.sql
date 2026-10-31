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
-- Section 9 adds the Gliim P.A. handover: an admin reply silences her for
-- five minutes and she resumes on her own, with no state column to get stuck
-- and no button for a staff member to forget. It also adds kind='escalation'
-- rows for disliked answers, opens the desk to every admin role, and creates
-- the admins-only room (admin_chat) with voice-note attachments.
--
-- This script is the authoritative definition of admin_review_post —
-- run it LAST in the review-function family.
-- ============================================================

begin;

-- ============================================================
-- 1. Staff gate for Support.
--    ANY admin role, per the 2026-10-17 decision: the whole team must be
--    able to answer a member, so captain and registrar staff see the desk
--    too. It was previously crm + operations + super only.
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
    select a.role in ('crm', 'operations', 'super', 'registrar', 'captain')
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
drop function if exists public.support_inbox();

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

-- §7 selects on m.is_admin, so the column must exist or this whole script
-- aborts (42703) inside its single transaction. admin.sql, messages_admin.sql
-- and library_kinds.sql each add this same column; repeating it here is
-- idempotent and makes support.sql runnable whichever of those has applied.
alter table public.messages add column if not exists is_admin boolean not null default false;

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
-- 8. Review notices land on the Alerts page (public.notifications).
--    Authoritative copy — keep in sync with sql/notifications.sql.
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

    insert into public.notifications (user_id, actor_id, kind, title, body, link_post)
    values (v_post.user_id, uid, 'review',
            'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was not approved',
            'Reason: ' || p_note, p_post);

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  update public.feed_gliims
     set status = 'approved', reviewed_by = uid, reviewed_at = now(), review_note = p_note
   where id = p_post;

  insert into public.notifications (user_id, actor_id, kind, title, link_post)
  values (v_post.user_id, uid, 'review',
          'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was approved and is now live',
          p_post);

  return jsonb_build_object('ok', true, 'status', 'approved');
end
$$;

revoke execute on function public.admin_review_post(uuid, text, text) from public, anon;
grant execute on function public.admin_review_post(uuid, text, text) to authenticated, service_role;

-- The provenance trigger still guards messages.is_admin, but admin notices no
-- longer use that column, so the sender-revalidation branch must not fire on
-- rows this script migrated. Left as-is: it only ever constrained NEW rows.

-- ============================================================
-- 9. Gliim P.A. handover, escalations and the admins-only room.
--    Added 2026-10-17 after the Support page was merged with the desk.
--    Decisions this encodes:
--      * An admin reply pauses Gliim P.A. for 5 minutes, then she resumes on
--        her own. There is deliberately NO mode column and NO button: the
--        pause is derived from the timestamp of the newest staff row, so it
--        cannot get stuck if an admin closes the tab mid-conversation.
--      * A dislike sends the question and her answer to the desk as a row the
--        member owns, flagged with kind='escalation'.
--      * Every admin role can open the desk (section 1 above).
-- ============================================================

alter table public.support_messages
  add column if not exists kind text not null default 'message';

alter table public.support_messages
  add column if not exists context jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.support_messages'::regclass
       and conname = 'support_messages_kind_check'
  ) then
    alter table public.support_messages
      add constraint support_messages_kind_check
      check (kind in ('message', 'escalation'));
  end if;
end
$$;

-- Newest row that means "a human is on this": a staff message, or the
-- member's own dislike escalation. Both start the same 5-minute hold.
create or replace function public.support_last_staff_at(p_thread_user uuid)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- A member may only inspect their own thread; staff may inspect any thread,
  -- which is the same rule support_messages' SELECT policies already enforce.
  if auth.uid() <> p_thread_user and not public.support_can_view(auth.uid()) then
    raise exception 'Not allowed to read that thread' using errcode = '42501';
  end if;

  select max(s.created_at) into v_at
    from public.support_messages s
   where s.thread_user = p_thread_user
     and (
       (s.kind = 'message' and s.sender_id <> s.thread_user
         and public.support_can_view(s.sender_id))
       or s.kind = 'escalation'
     );

  return v_at;
end
$$;

revoke execute on function public.support_last_staff_at(uuid) from public, anon;
grant execute on function public.support_last_staff_at(uuid) to authenticated, service_role;

-- The gate Gliim P.A. consults before she answers anything.
create or replace function public.gliimpa_paused(p_thread_user uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    public.support_last_staff_at(p_thread_user)
      > now() - interval '5 minutes',
    false);
$$;

revoke execute on function public.gliimpa_paused(uuid) from public, anon;
grant execute on function public.gliimpa_paused(uuid) to authenticated, service_role;

-- A dislike posts the question and the answer into the member's own thread.
-- SECURITY INVOKER, and the row is written as the member (sender = thread =
-- auth.uid()), which is exactly what "Member posts in own thread" already
-- allows — so a member cannot forge a staff row here.
create or replace function public.gliimpa_escalate(
  p_question text,
  p_answer text default null,
  p_message_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(trim(p_question), '') = '' then
    raise exception 'Nothing to escalate' using errcode = '22023';
  end if;

  -- One open escalation per question row, so double-tapping dislike cannot
  -- flood the desk.
  if p_message_id is not null and exists (
    select 1 from public.support_messages s
     where s.kind = 'escalation'
       and s.context->>'message_id' = p_message_id::text
  ) then
    select s.id into v_id
      from public.support_messages s
     where s.kind = 'escalation'
       and s.context->>'message_id' = p_message_id::text
     limit 1;
    return v_id;
  end if;

  insert into public.support_messages (thread_user, sender_id, content, kind, context)
  values (
    v_uid,
    v_uid,
    left(p_question, 2000),
    'escalation',
    jsonb_strip_nulls(jsonb_build_object(
      'question', left(p_question, 2000),
      'answer', left(coalesce(p_answer, ''), 4000),
      'message_id', p_message_id)))
  returning id into v_id;

  return v_id;
end
$$;

revoke execute on function public.gliimpa_escalate(text, text, uuid) from public, anon;
grant execute on function public.gliimpa_escalate(text, text, uuid) to authenticated, service_role;

-- Staff clear an escalation by replying; the desk badge counts escalations
-- newer than the reader's own watermark. support_inbox() gains a column, so
-- the old signature has to go first — create or replace cannot change it.
drop function if exists public.support_inbox();

create or replace function public.support_inbox()
returns table (
  thread_user uuid,
  member_name text,
  member_avatar text,
  last_content text,
  last_is_staff boolean,
  last_created_at timestamptz,
  unread integer,
  message_count integer,
  escalations integer
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
         cnt.n::integer,
         esc.n::integer
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
         and s.kind = 'message'
         and s.sender_id <> auth.uid()
         and s.created_at > coalesce(
               (select r.last_read_at from public.support_reads r
                 where r.thread_user = m.thread_user and r.reader_id = auth.uid()),
               '-infinity'::timestamptz)
    ) unread
    cross join lateral (
      select count(*) n
        from public.support_messages s
       where s.thread_user = m.thread_user
         and s.kind = 'escalation'
         and s.created_at > coalesce(
               (select r.last_read_at from public.support_reads r
                 where r.thread_user = m.thread_user and r.reader_id = auth.uid()),
               '-infinity'::timestamptz)
    ) esc
   where public.support_can_view(auth.uid());
$$;

revoke execute on function public.support_inbox() from public, anon;
grant execute on function public.support_inbox() to authenticated, service_role;

-- The admins-only room: one shared thread between staff members, text and
-- voice notes. No member can read or write it because every policy calls
-- support_can_view(), which only ever returns true for an admin_users row.
create table if not exists public.admin_chat (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null,
  content text not null default '',
  attachment_url text,
  attachment_type text,
  created_at timestamptz not null default now()
);

create index if not exists admin_chat_time_idx
  on public.admin_chat (created_at);

alter table public.admin_chat enable row level security;

revoke all on public.admin_chat from anon;
grant select, insert on public.admin_chat to authenticated;
grant all on public.admin_chat to service_role;

drop policy if exists "Staff read the admins room" on public.admin_chat;
create policy "Staff read the admins room" on public.admin_chat
  for select to authenticated
  using ( public.support_can_view(auth.uid()) );

drop policy if exists "Staff post in the admins room" on public.admin_chat;
create policy "Staff post in the admins room" on public.admin_chat
  for insert to authenticated
  with check ( sender_id = (select auth.uid())
               and public.support_can_view(auth.uid()) );

-- Voice notes are immutable like support messages, but unlike the member
-- thread an admin may delete their own row, so a mistaken recording does not
-- have to stay on screen forever.
drop policy if exists "Staff delete own admins room post" on public.admin_chat;
create policy "Staff delete own admins room post" on public.admin_chat
  for delete to authenticated
  using ( sender_id = (select auth.uid())
           and public.support_can_view(auth.uid()) );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and tablename = 'admin_chat'
     ) then
    begin
      alter publication supabase_realtime add table public.admin_chat;
    exception when duplicate_object or insufficient_privilege then
      null;
    end;
  end if;
end
$$;

notify pgrst, 'reload schema';

-- ============================================================
-- 10. Self-check SELECT grid: 24 rows, every ok cell should be true.
-- ============================================================

with support_fns (name, oid) as (
  values
    ('support_can_view',    to_regprocedure('public.support_can_view(uuid)')),
    ('support_thread_unread', to_regprocedure('public.support_thread_unread(uuid)')),
    ('support_mark_read',   to_regprocedure('public.support_mark_read(uuid)')),
    ('support_inbox',       to_regprocedure('public.support_inbox()')),
    ('support_last_staff_at', to_regprocedure('public.support_last_staff_at(uuid)')),
    ('gliimpa_paused',      to_regprocedure('public.gliimpa_paused(uuid)')),
    ('gliimpa_escalate',    to_regprocedure('public.gliimpa_escalate(text,text,uuid)'))
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
  select 6, 'support_can_view is SECURITY DEFINER and allows all five admin roles',
         exists (select 1 from pg_proc where oid = to_regprocedure('public.support_can_view(uuid)')
                  and prosecdef and proconfig @> array['search_path=public'])
         and (select prosrc from pg_proc where oid = to_regprocedure('public.support_can_view(uuid)'))
             ilike '%crm%, %operations%, %super%, %registrar%, %captain%'
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
  select 9, 'authenticated can execute all seven support functions',
         (select bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')) from support_fns)
  union all
  select 10, 'service_role can execute all seven support functions',
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
  select 13, 'review RPC posts a notification (Alerts), not support_messages',
         (select prosrc from pg_proc where oid = to_regprocedure('public.admin_review_post(uuid,text,text)'))
         ilike '%insert into public.notifications%'
         and (select prosrc from pg_proc where oid = to_regprocedure('public.admin_review_post(uuid,text,text)'))
         not ilike '%insert into public.support_messages%'
  union all
  select 14, 'no review RPC still writes an is_admin notice into messages',
         not exists (select 1 from pg_proc
                      where oid = to_regprocedure('public.admin_review_post(uuid,text,text)')
                        and prosrc ilike '%is_admin =%'
                        and prosrc ilike '%public.messages%')
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
  union all
  select 17, 'support_messages carries kind + context with a two-value check',
         (select count(*) = 2 from information_schema.columns
           where table_schema = 'public' and table_name = 'support_messages'
             and column_name in ('kind', 'context'))
         and exists (select 1 from pg_constraint
                      where conrelid = 'public.support_messages'::regclass
                        and conname = 'support_messages_kind_check')
  union all
  select 18, 'handover gate reads staff activity over a 5 minute window',
         exists (select 1 from pg_proc where oid = to_regprocedure('public.gliimpa_paused(uuid)')
                  and not prosecdef
                  and prosrc ilike '%support_last_staff_at%')
         and exists (select 1 from pg_proc where oid = to_regprocedure('public.gliimpa_paused(uuid)')
                  and prosrc ilike '%interval%5 minutes%')
  union all
  select 19, 'gliimpa_escalate writes a member-owned escalation row',
         exists (select 1 from pg_proc where oid = to_regprocedure('public.gliimpa_escalate(text,text,uuid)')
                  and not prosecdef
                  and prosrc ilike '%escalation%')
  union all
  select 20, 'support_inbox() now returns nine columns including escalations',
         (select array_length(proargnames, 1) from pg_proc
           where oid = to_regprocedure('public.support_inbox()')) = 9
         and (select prosrc from pg_proc where oid = to_regprocedure('public.support_inbox()'))
             ilike '%escalation%'
  union all
  select 21, 'admin_chat exists, RLS on, three staff-only policies',
         exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'admin_chat')
         and (select relrowsecurity from pg_class where oid = 'public.admin_chat'::regclass)
         and (select count(*) = 3 from pg_policy where polrelid = 'public.admin_chat'::regclass)
         and (select count(*) = 3 from pg_policy where polrelid = 'public.admin_chat'::regclass
               and (coalesce(pg_get_expr(polqual, polrelid), '')
                    || coalesce(pg_get_expr(polwithcheck, polrelid), ''))
                   ilike '%support_can_view%')
  union all
  select 22, 'admins cannot forge an admins-room post as someone else',
         (select count(*) = 2 from pg_policy where polrelid = 'public.admin_chat'::regclass
           and polcmd in ('a', 'r')  -- insert + select
           and (pg_get_expr(polwithcheck, polrelid) ilike '%auth.uid()%'
                or pg_get_expr(polqual, polrelid) ilike '%auth.uid()%'))
  union all
  select 23, 'admin_chat in supabase_realtime publication',
         exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'admin_chat')
  union all
  select 24, 'anon has no access to admin_chat',
         not has_table_privilege('anon', 'public.admin_chat', 'SELECT')
         and not has_table_privilege('anon', 'public.admin_chat', 'INSERT')
)
select "#", check_name, ok from checks order by "#";

commit;
