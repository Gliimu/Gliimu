-- ============================================================
-- LIVE CHAT ATTACHMENT NAME (safe to re-run)
-- ============================================================
-- Live chat already stores two attachment columns, added by
-- sql/live_chat_attachments.sql: attachment_url and attachment_type.
-- That is enough to show a photo, but not enough to hand a file back.
--
-- The original filename is never kept. It only survives inside the R2 key as
-- a damaged copy — chat_attachments/<user>/<ms>_<rand>_<name>, where every
-- character that is not a letter, digit, dot, underscore or hyphen has been
-- replaced with an underscore and everything before the last 60 characters
-- has been thrown away. So "My Essay (final).docx" downloads as
-- "My_Essay__final_.docx", and a long name loses its beginning.
--
-- Because of that, the chat bubble has been labelling documents with
-- msg.content — whatever the sender typed as their message — and falling back
-- to the words "Download file" when they typed nothing. The file's own name
-- was never available to show.
--
--   NEW COLUMN   public.live_chat_messages.attachment_name   text, nullable
--
-- Nothing else changes. No function, policy, grant, constraint or index is
-- touched, no existing column is modified, and no rows are rewritten.
--
-- WHY THERE IS NO BACKFILL: every attachment in the room is already damaged
-- at the source, and there is nothing to repair anyway — checked before
-- writing this script, public.live_chat_messages holds 16 rows and all 16 have
-- attachment_url NULL. The column starts empty and fills from the first new
-- upload.
--
-- WHY THERE ARE NO GRANTS HERE: Postgres applies the existing table-level
-- SELECT/INSERT/UPDATE/DELETE grants to a newly added column automatically.
-- Only dropping or recreating an object resets privileges. Checks 5 and 6
-- prove the new column really is readable and writable anyway.
-- ============================================================


-- ============================================================
-- 1. THE COLUMN
-- ============================================================

alter table public.live_chat_messages
  add column if not exists attachment_name text;

comment on column public.live_chat_messages.attachment_name is
  'Original filename of the shared attachment, as the sender named it. Shown on the bubble and used for the Download name. Nullable: text-only messages and the rows stored before this column have none.';

notify pgrst, 'reload schema';


-- ============================================================
-- 2. SELF CHECK — read-only, run the whole thing, expect every PASS
-- ============================================================

select '1. attachment_name exists on live_chat_messages' as check,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='live_chat_messages'
                            and column_name='attachment_name')
       then 'PASS' else 'CHECK' end as result
union all
select '2. Column is text and nullable',
       case when (select data_type from information_schema.columns
                   where table_schema='public' and table_name='live_chat_messages'
                     and column_name='attachment_name') = 'text'
            and (select is_nullable from information_schema.columns
                   where table_schema='public' and table_name='live_chat_messages'
                     and column_name='attachment_name') = 'YES'
       then 'PASS' else 'CHECK' end
union all
select '3. attachment_url and attachment_type survived',
       case when (select count(*) from information_schema.columns
                   where table_schema='public' and table_name='live_chat_messages'
                     and column_name in ('attachment_url','attachment_name','attachment_type')) = 3
       then 'PASS' else 'CHECK' end
union all
select '4. No row was rewritten — 16 text messages intact',
       case when (select count(*) from public.live_chat_messages) = 16
       then 'PASS' else 'CHECK' end
union all
select '5. The API client role can still read chat',
       case when has_column_privilege('authenticated', 'public.live_chat_messages', 'attachment_name', 'select')
       then 'PASS' else 'CHECK' end
union all
select '6. The server role can write the new column',
       case when has_column_privilege('service_role', 'public.live_chat_messages', 'attachment_name', 'insert')
            and has_column_privilege('service_role', 'public.live_chat_messages', 'attachment_name', 'update')
       then 'PASS' else 'CHECK' end
union all
select '7. Row Level Security still guards the table',
       case when (select relrowsecurity from pg_class
                   where oid = 'public.live_chat_messages'::regclass)
       then 'PASS' else 'CHECK' end
union all
select '8. All three live chat policies are still in place',
       case when (select count(*) from pg_policies
                   where schemaname='public' and tablename='live_chat_messages'
                     and policyname in ('live_chat_read','live_chat_insert','live_chat_delete')) = 3
       then 'PASS' else 'CHECK' end
union all
select '9. Messages still need text or an attachment',
       case when exists (select 1 from pg_constraint
                          where conrelid = 'public.live_chat_messages'::regclass
                            and conname = 'live_chat_messages_content_check')
       then 'PASS' else 'CHECK' end
union all
select '10. Room and user cascades still intact',
       case when (select count(*) from pg_constraint
                   where conrelid = 'public.live_chat_messages'::regclass
                     and contype = 'f') = 2
       then 'PASS' else 'CHECK' end
order by 1;

-- What the server will now be able to store per attachment. Expected: 3 rows,
-- every one of them readable, and no name filled in yet because nothing has
-- been shared in a room since this script ran.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema='public' and table_name='live_chat_messages'
   and column_name like 'attachment%'
 order by column_name;
