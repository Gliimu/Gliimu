-- ============================================================
-- Gliimu: standalone admin-message provenance + bounded DM reads
-- Run AFTER sql/admin.sql (admin helpers), sql/library_content.sql,
-- sql/library_submissions.sql and sql/gliim_approval.sql and their
-- prerequisites. Run this script as a unit; no other SQL reruns are needed
-- for this repair. Safe to rerun: one transaction, explicit definitions.
-- No RLS/table-grant/admin-role changes and no historical flag backfill.
-- ============================================================

begin;

-- Default false is deliberate: a staff member's personal messages are not
-- admin-origin messages. Only explicit admin sends/review notices opt in.
alter table public.messages add column if not exists is_admin boolean not null default false;

-- ============================================================
-- 1. Provenance guard (does not grant access or auto-brand any row)
-- ============================================================

create or replace function public.guard_message_admin_flag()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'Message admin flag is immutable' using errcode = '42501';
    end if;

    -- Ordinary message updates remain subject only to existing access rules.
    if old.is_admin is not true then
      return new;
    end if;

    if new.sender_id is distinct from old.sender_id
       or new.receiver_id is distinct from old.receiver_id then
      raise exception 'Admin message participants are immutable' using errcode = '42501';
    end if;

    -- A receiver must be able to mark an incoming admin notice read through
    -- the read RPCs, even if the original sender has since lost their role.
    -- Existing RLS/RPC checks control access to these read_at-only updates.
    if (to_jsonb(new) - 'read_at') is not distinct from (to_jsonb(old) - 'read_at') then
      return new;
    end if;
  elsif new.is_admin is not true then
    return new;
  end if;

  -- Applies to flagged inserts and all non-read_at edits of flagged rows.
  -- No null-auth/service-role bypass, including SECURITY DEFINER callers.
  -- On UPDATE the immutable sender above is necessarily the original sender.
  if uid is null or new.sender_id is distinct from uid then
    raise exception 'Admin messages require the authenticated sender' using errcode = '42501';
  end if;

  if new.room is not null or new.is_ai is true then
    raise exception 'Admin messages must be non-AI direct messages' using errcode = '42501';
  end if;

  if not (public.admin_role(uid) is not null or coalesce(public.is_admin(), false)) then
    raise exception 'Admin messages require an authorized admin' using errcode = '42501';
  end if;

  return new;
end
$$;

revoke execute on function public.guard_message_admin_flag() from public, anon;
grant execute on function public.guard_message_admin_flag() to authenticated, service_role;

drop trigger if exists trg_guard_message_admin_flag on public.messages;
create trigger trg_guard_message_admin_flag
  before insert or update on public.messages
  for each row execute function public.guard_message_admin_flag();

-- ============================================================
-- 2. Exact review definitions: keep in sync with admin.sql /
--    library_kinds.sql and gliim_approval.sql respectively.
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

    insert into public.messages (sender_id, receiver_id, content, is_ai, is_admin)
    values (uid, v_sub.user_id,
            'Your library submission "' || v_sub.title || '" was not approved. Reason: ' || p_note,
            false, true);

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

  insert into public.messages (sender_id, receiver_id, content, is_ai, is_admin)
  values (uid, v_sub.user_id,
          'Your library submission "' || v_sub.title || '" was approved and is now live on the shelf.',
          false, true);

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

    insert into public.messages (sender_id, receiver_id, content, is_ai, is_admin)
    values (uid, v_post.user_id,
            'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was not approved. Reason: ' || p_note,
            false, true);

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  update public.posts
     set status = 'approved', reviewed_by = uid, reviewed_at = now(), review_note = p_note
   where id = p_post;

  insert into public.messages (sender_id, receiver_id, content, is_ai, is_admin)
  values (uid, v_post.user_id,
          'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was approved and is now live in the Hub.',
          false, true);

  return jsonb_build_object('ok', true, 'status', 'approved');
end $$;

revoke execute on function public.admin_review_post(uuid, text, text) from public, anon;
grant execute on function public.admin_review_post(uuid, text, text) to authenticated, service_role;

-- ============================================================
-- 3. Bounded read receipts (old mark_dm_read(uuid) stays unchanged)
-- ============================================================

create or replace function public.mark_dm_read_through(p_other uuid, p_through timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_through is null then
    raise exception 'Read cutoff required' using errcode = '22004';
  end if;

  update public.messages
     set read_at = now()
   where receiver_id = auth.uid()
     and sender_id = p_other
     and room is null
     and is_ai is not true
     and (sender_id <> receiver_id or is_admin)
     and read_at is null
     and created_at <= p_through;
end
$$;

revoke execute on function public.mark_dm_read_through(uuid, timestamptz) from public, anon;
grant execute on function public.mark_dm_read_through(uuid, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- 4. Self-check SELECT grid: every ok cell should be true.
--    Review checks match BOTH explicit false/true notice inserts.
-- ============================================================

with functions_to_check (name, oid) as (
  values
    ('guard_message_admin_flag', to_regprocedure('public.guard_message_admin_flag()')),
    ('mark_dm_read_through', to_regprocedure('public.mark_dm_read_through(uuid,timestamptz)')),
    ('admin_review_submission', to_regprocedure('public.admin_review_submission(uuid,text,text)')),
    ('admin_review_post', to_regprocedure('public.admin_review_post(uuid,text,text)'))
), checks as (
  select 1 as "#", 'is_admin boolean NOT NULL DEFAULT false' as check_name,
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'messages' and column_name = 'is_admin'
                    and data_type = 'boolean' and is_nullable = 'NO' and column_default like '%false%') as ok
  union all
  select 2, 'provenance trigger enabled BEFORE INSERT/UPDATE',
         exists (select 1 from pg_trigger
                  where tgrelid = 'public.messages'::regclass and tgname = 'trg_guard_message_admin_flag'
                    and not tgisinternal and tgenabled in ('O', 'A') and tgtype = 23
                    and tgfoid = to_regprocedure('public.guard_message_admin_flag()'))
  union all
  select 3, 'provenance function SECURITY INVOKER, search_path public',
         exists (select 1 from pg_proc
                  where oid = to_regprocedure('public.guard_message_admin_flag()')
                    and not prosecdef and prorettype = 'trigger'::regtype
                    and proconfig @> array['search_path=public'])
  union all
  select 4, 'bounded read function returns void, SECURITY DEFINER, search_path public',
         exists (select 1 from pg_proc
                  where oid = to_regprocedure('public.mark_dm_read_through(uuid,timestamptz)')
                    and prosecdef and prorettype = 'void'::regtype
                    and proconfig @> array['search_path=public'])
  union all
  select 5, 'all four functions exist',
         (select count(oid) = 4 from functions_to_check)
  union all
  select 6, 'PUBLIC cannot execute repair functions',
         not exists (select 1 from functions_to_check f
                     join pg_proc p on p.oid = f.oid
                     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     where a.grantee = 0 and a.privilege_type = 'EXECUTE')
  union all
  select 7, 'anon cannot execute repair functions',
         (select bool_and(not has_function_privilege('anon', oid, 'EXECUTE')) from functions_to_check)
  union all
  select 8, 'authenticated can execute repair functions',
         (select bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')) from functions_to_check)
  union all
  select 9, 'service_role can execute repair functions',
         (select bool_and(has_function_privilege('service_role', oid, 'EXECUTE')) from functions_to_check)
  union all
  select case when f.name = 'admin_review_submission' then 10 else 11 end,
         f.name || ' tags both approve/reject notices is_admin=true',
         (select count(*) = 2 from regexp_matches(p.prosrc,
           'insert\s+into\s+public\.messages\s*\(sender_id,\s*receiver_id,\s*content,\s*is_ai,\s*is_admin\)\s*values\s*\(uid,\s*[^;]+,\s*false,\s*true\s*\);', 'gi'))
    from functions_to_check f
    left join pg_proc p on p.oid = f.oid
   where f.name in ('admin_review_submission', 'admin_review_post')
)
select "#", check_name, ok from checks order by "#";

commit;
