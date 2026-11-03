-- ============================================================
-- Live session chat
--
-- On a live gliim the session chat IS the comments section, so
-- these policies are the whole gate: they decide who can read the
-- room and who can talk in it. Access comes from the session's own
-- sharing settings, not from a participants table (that table no
-- longer exists), so a viewer who only ever opened the card can
-- still post while the session is active.
--
-- This file mirrors the production database exactly. Running it on
-- a fresh project reproduces the live state; running it again on a
-- live project is a no-op.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Message store
-- ------------------------------------------------------------
create table if not exists public.live_chat_messages (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.live_requests(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  content         text,
  created_at      timestamptz default now(),
  attachment_url  text,
  attachment_type text
);

-- A message carries text or a file, never neither.
alter table public.live_chat_messages drop constraint if exists live_chat_messages_content_check;
alter table public.live_chat_messages
  add constraint live_chat_messages_content_check
  check (
    (content is not null and char_length(content) > 0 and char_length(content) <= 1000)
    or attachment_url is not null
  );

create index if not exists idx_live_chat_messages_room_id    on public.live_chat_messages(room_id);
create index if not exists idx_live_chat_messages_created_at on public.live_chat_messages(created_at);
create index if not exists idx_live_chat_room                on public.live_chat_messages(room_id, created_at);

-- ------------------------------------------------------------
-- 2. RLS — one read, one insert, one delete policy
-- ------------------------------------------------------------
alter table public.live_chat_messages enable row level security;

-- Pre-rename copies and the dead participants-based policies.
drop policy if exists "Users can read messages from their rooms"  on public.live_chat_messages;
drop policy if exists "Users can insert messages to their rooms"  on public.live_chat_messages;
drop policy if exists "Users can delete own messages"             on public.live_chat_messages;
drop policy if exists live_chat_select   on public.live_chat_messages;
drop policy if exists live_chat_read_all on public.live_chat_messages;
drop policy if exists live_chat_write    on public.live_chat_messages;

-- The host always sees their room; sharing_mode decides everybody else.
--   'general' -> open to all signed-in members (this is what publishes a card)
--   'users'   -> only the members the host picked
drop policy if exists live_chat_read on public.live_chat_messages;
create policy live_chat_read
  on public.live_chat_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.live_requests r
      where r.id = live_chat_messages.room_id
        and (
          r.user_id = (select auth.uid())
          or r.sharing_mode = 'general'
          or (r.sharing_mode = 'users'
              and r.invited_user_ids @> jsonb_build_array(((select auth.uid()))::text))
        )
    )
  );

-- Talking additionally needs the session to be running.
drop policy if exists live_chat_insert on public.live_chat_messages;
create policy live_chat_insert
  on public.live_chat_messages for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.live_requests r
      where r.id = live_chat_messages.room_id
        and r.status = 'active'
        and (
          r.user_id = (select auth.uid())
          or r.sharing_mode = 'general'
          or (r.sharing_mode = 'users'
              and r.invited_user_ids @> jsonb_build_array(((select auth.uid()))::text))
        )
    )
  );

drop policy if exists live_chat_delete on public.live_chat_messages;
create policy live_chat_delete
  on public.live_chat_messages for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ------------------------------------------------------------
-- 3. Table privileges (Data API exposure)
-- ------------------------------------------------------------
grant select, insert, delete on public.live_chat_messages to authenticated;
revoke update on public.live_chat_messages from authenticated;

-- ============================================================
-- SELF CHECK — run this whole block once, every "result" row
-- must read "ok".
-- ============================================================
select item, result from (
  select 1 as ord, 'chat table exists' as item,
    case when exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'live_chat_messages'
    ) then 'ok' else 'MISSING' end as result
  union all
  select 2, 'message columns complete',
    case when count(*) = 7 then 'ok' else 'MISSING ' || count(*)::text end
      from information_schema.columns
     where table_schema = 'public' and table_name = 'live_chat_messages'
  union all
  select 3, 'room cascades with session',
    case when exists (
      select 1 from pg_constraint
       where conrelid = 'public.live_chat_messages'::regclass
         and contype = 'f' and confrelid = 'public.live_requests'::regclass
         and confdeltype = 'c'
    ) then 'ok' else 'WRONG' end
  union all
  select 4, 'text or file required',
    case when exists (
      select 1 from pg_constraint
       where conname = 'live_chat_messages_content_check'
         and pg_get_constraintdef(oid) like '%attachment_url%'
    ) then 'ok' else 'MISSING' end
  union all
  select 5, 'room + time indexes',
    case when count(*) = 3 then 'ok' else 'MISSING ' || count(*)::text end
      from pg_indexes
     where tablename = 'live_chat_messages'
       and indexname in ('idx_live_chat_messages_room_id',
                         'idx_live_chat_messages_created_at',
                         'idx_live_chat_room')
  union all
  select 6, 'rls on',
    case when exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'live_chat_messages' and c.relrowsecurity
    ) then 'ok' else 'OFF' end
  union all
  select 7, 'exactly three policies',
    case when count(*) = 3 then 'ok' else 'STALE POLICIES (' || count(*)::text || ')' end
      from pg_policy p join pg_class c on c.oid = p.polrelid
     where c.relname = 'live_chat_messages'
  union all
  select 8, 'read follows session sharing',
    case when exists (
      select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
       where c.relname = 'live_chat_messages' and p.polname = 'live_chat_read'
         and pg_get_expr(p.polqual, p.polrelid) like '%sharing_mode%'
    ) then 'ok' else 'WRONG' end
  union all
  select 9, 'insert needs live session',
    case when exists (
      select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
       where c.relname = 'live_chat_messages' and p.polname = 'live_chat_insert'
         and pg_get_expr(p.polwithcheck, p.polrelid) like '%active%'
    ) then 'ok' else 'WRONG' end
  union all
  select 10, 'delete is own messages only',
    case when exists (
      select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
       where c.relname = 'live_chat_messages' and p.polname = 'live_chat_delete'
         and pg_get_expr(p.polqual, p.polrelid) like '%auth.uid%'
    ) then 'ok' else 'WRONG' end
  union all
  select 11, 'no policy reads dead table',
    case when not exists (
      select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
       where c.relname = 'live_chat_messages'
         and pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid)
             like '%live_session_participants%'
    ) then 'ok' else 'DEAD REFERENCE' end
  union all
  select 12, 'policies target signed-in members',
    case when not exists (
      select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
       where c.relname = 'live_chat_messages' and p.polroles::regrole[]::text <> '{authenticated}'
    ) then 'ok' else 'ANON INCLUDED' end
  union all
  select 13, 'read/write granted, update locked',
    case when has_table_privilege('authenticated', 'public.live_chat_messages', 'select')
          and has_table_privilege('authenticated', 'public.live_chat_messages', 'insert')
          and has_table_privilege('authenticated', 'public.live_chat_messages', 'delete')
          and not has_table_privilege('authenticated', 'public.live_chat_messages', 'update')
         then 'ok' else 'GRANTS WRONG' end
  union all
  select 14, 'anon cannot read chat',
    case when not has_table_privilege('anon', 'public.live_chat_messages', 'select')
         then 'ok' else 'ANON SEES CHAT' end
) checks
order by ord;

-- END OF FILE
