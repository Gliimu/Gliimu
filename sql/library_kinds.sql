-- ============================================================
-- Gliimu: Library kinds — Book + multi-chapter Audiolite approval
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once (idempotent).
--
-- WHY THIS EXISTS
--   The Library "+" now offers three kinds: Bundle (a gliim, unchanged),
--   Book (cover + metadata + ONE EPUB/DOCX) and Audiolite (cover +
--   metadata + MULTIPLE ordered audio chapters). Both new kinds are written
--   to library_submissions and approved by CRM into library_items +
--   library_contents.
--
--   No new columns are needed:
--     Book      -> library_submissions.file_url   (the single document)
--     Audiolite -> library_submissions.bundle_items  [{title,url}, ...] chapters
--   library_contents.files is already an ordered [{title,url}] array, so
--   chapters play back in submission order.
--
--   The ONE fix: admin_review_submission used to copy bundle_items into
--   library_contents.files ONLY when type = 'bundle', so an audiolite's
--   chapters were dropped on approval. This re-creates the function so ANY
--   non-empty bundle_items array (a bundle's files OR an audiolite's
--   chapters) flows through, falling back to the single file_url for a book.
--
-- RUN ORDER: after sql/admin.sql (this replaces a function defined there).
-- The body below is identical to sql/admin.sql — keep the two in sync.
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

  insert into public.messages (sender_id, receiver_id, content, is_ai)
  values (uid, v_sub.user_id,
          'Your library submission "' || v_sub.title || '" was approved and is now live on the shelf.',
          false);

  return jsonb_build_object('ok', true, 'status', 'approved', 'item_id', v_item);
end
$$;

revoke execute on function public.admin_review_submission(uuid, text, text) from public, anon;
grant execute on function public.admin_review_submission(uuid, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';


-- ============================================================
-- SELF CHECK — returns a grid. Every row should read OK.
-- ============================================================

select 1 as "#", 'admin_review_submission() exists' as item,
       case when to_regprocedure('public.admin_review_submission(uuid,text,text)') is not null
            then 'OK' else 'MISSING' end as result
union all select 2, 'still SECURITY DEFINER',
       case when (select p.prosecdef from pg_proc p
                   where p.oid = to_regprocedure('public.admin_review_submission(uuid,text,text)'))
            then 'OK' else 'NOT DEFINER' end
union all select 3, 'anon cannot execute it',
       case when has_function_privilege('anon','public.admin_review_submission(uuid,text,text)','execute')
            then 'GRANTED (bad)' else 'OK' end
union all select 4, 'body copies bundle_items for ANY type (audiolite fix)',
       case when position('jsonb_array_length(coalesce(v_sub.bundle_items'
                          in pg_get_functiondef(to_regprocedure('public.admin_review_submission(uuid,text,text)'))) > 0
            then 'OK' else 'OLD BODY — re-run' end
union all select 5, 'library_submissions.bundle_items column present',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='library_submissions' and column_name='bundle_items')
            then 'OK' else 'MISSING — run sql/library_content.sql' end
union all select 6, 'library_submissions.file_url column present',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='library_submissions' and column_name='file_url')
            then 'OK' else 'MISSING — run sql/library_submissions.sql' end
union all select 7, 'library_submissions.category column present',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='library_submissions' and column_name='category')
            then 'OK' else 'MISSING — run sql/reader.sql' end
union all select 8, 'pending submissions awaiting review',
       (select count(*)::text from public.library_submissions where status = 'pending')
order by "#";
