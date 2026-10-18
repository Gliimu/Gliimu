-- ============================================================
-- Gliimu: Fix admin delete to handle pending submissions
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- WHAT THIS FIXES:
--   - Updates admin_delete_feed_item() to check library_submissions
--     table for pending books/audiolites (not just library_items)
--   - Ensures pgcrypto extension is enabled for password verification
--
-- ERROR IT FIXES:
--   - "ITEM_NOT_FOUND" when trying to delete pending books/audiolites
--   - "function crypt(text, character varying) does not exist" for bundles
--
-- HOW TO RUN:
--   1. Copy ALL of this file
--   2. SQL Editor -> "+ New query"
--   3. Paste, Ctrl+A, click "Run"
-- ============================================================

-- Enable pgcrypto for password verification
create extension if not exists pgcrypto;

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
  v_is_post boolean;
  v_is_library_item boolean;
begin
  -- Gate: only admins/CRM can delete feed items
  select (public.is_admin() or public.admin_has_role(v_caller, 'crm')) into v_can_delete;
  if not v_can_delete then
    raise exception 'PERMISSION_DENIED';
  end if;

  -- Password gate: verify caller's password via auth.users
  if not exists (
    select 1 from auth.users u
    where u.id = v_caller
      and u.encrypted_password = crypt(p_password, u.encrypted_password)
  ) then
    raise exception 'INVALID_PASSWORD';
  end if;

  -- Determine what type of item this is
  select exists (select 1 from public.posts where id = p_item_id) into v_is_post;
  select exists (select 1 from public.library_items where id = p_item_id) into v_is_library_item;

  -- Check if it's a pending submission (books/audiolites awaiting approval)
  if not v_is_post and not v_is_library_item then
    if exists (select 1 from public.library_submissions where id = p_item_id) then
      delete from public.library_submissions where id = p_item_id;
      return jsonb_build_object('deleted', true, 'item_id', p_item_id, 'type', 'submission');
    end if;
  end if;

  if not v_is_post and not v_is_library_item then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  -- Delete based on item type
  if v_is_post then
    -- Delete post (bundle/gliim) and related data
    delete from public.hub_interactions where post_id = p_item_id;
    delete from public.billing_events where event_type = 'premium_unlock' and item_id = p_item_id::text;
    delete from public.reports where target_type = 'post' and target_id = p_item_id;
    delete from public.posts where id = p_item_id;
    return jsonb_build_object('deleted', true, 'item_id', p_item_id, 'type', 'post');
  else
    -- Delete library item (approved book/audiolite) and related data
    delete from public.saved_items where item_id = p_item_id;
    delete from public.purchases where item_id = p_item_id;
    delete from public.billing_events where event_type = 'premium_unlock' and item_id = p_item_id::text;
    delete from public.reports where target_type = 'library_item' and target_id = p_item_id;
    delete from public.library_items where id = p_item_id;
    return jsonb_build_object('deleted', true, 'item_id', p_item_id, 'type', 'library_item');
  end if;

exception
  when others then
    return jsonb_build_object('deleted', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.admin_delete_feed_item(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- SELF CHECK
-- ------------------------------------------------------------

select
  (select case when exists (select 1 from pg_extension where extname = 'pgcrypto')
               then 'OK' else 'MISSING' end) as pgcrypto_extension,
  (select case when exists (select 1 from pg_trigger where tgname='trg_set_post_status')
               then 'OK' else 'MISSING' end) as post_status_trigger,
  (select count(*) from public.posts where status='approved') as approved_posts,
  (select count(*) from public.library_submissions where status='pending') as pending_submissions;
