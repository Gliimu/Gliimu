-- ============================================================
-- Gliimu: Admin delete feed item RPC with password confirmation
-- Run this in Supabase SQL Editor after sql/all.sql.
-- Safe to run more than once (idempotent).
--
-- WHAT THIS ADDS:
--   - admin_delete_feed_item(p_item_id, p_password): SECURITY DEFINER
--     RPC that verifies the caller is CRM/admin, checks their
--     password, then deletes the feed item (post, library item,
--     or pending submission) and all related data.
--
-- SECURITY:
--   - Only users with public.is_admin() = true or CRM role can call it
--   - Password must match the calling user's auth.password
--   - Cascades to related tables automatically
--   - Handles: posts (bundles/gliims), library_items (approved books/
--     audiolites), and library_submissions (pending books/audiolites)
--
-- HOW TO RUN:
--   1. Copy ALL of this file
--   2. SQL Editor -> "+ New query"
--   3. Paste, Ctrl+A, click "Run" — once
--   4. Check SELF CHECK at bottom
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

  -- Determine what type of item this is
  select exists (select 1 from public.posts where id = p_item_id) into v_is_post;
  select exists (select 1 from public.library_items where id = p_item_id) into v_is_library_item;

  -- Also check library_submissions for pending books/audiolites
  if not v_is_post and not v_is_library_item then
    -- Check if it's a pending submission
    if exists (select 1 from public.library_submissions where id = p_item_id) then
      -- Password gate: verify caller's password via auth.users
      if not exists (
        select 1 from auth.users u
        where u.id = v_caller
          and u.encrypted_password = crypt(p_password, u.encrypted_password)
      ) then
        raise exception 'INVALID_PASSWORD';
      end if;

      -- Delete submission and related data
      delete from public.library_submissions where id = p_item_id;
      return jsonb_build_object('deleted', true, 'item_id', p_item_id, 'type', 'submission');
    end if;
  end if;

  if not v_is_post and not v_is_library_item then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  -- Password gate: verify caller's password via auth.users
  if not exists (
    select 1 from auth.users u
    where u.id = v_caller
      and u.encrypted_password = crypt(p_password, u.encrypted_password)
  ) then
    raise exception 'INVALID_PASSWORD';
  end if;

  -- Delete based on item type
  if v_is_post then
    -- Delete post and related data
    delete from public.hub_interactions where post_id = p_item_id;
    delete from public.billing_events where event_type = 'premium_unlock' and item_id = p_item_id::text;
    delete from public.reports where target_type = 'post' and target_id = p_item_id;
    delete from public.posts where id = p_item_id;
    return jsonb_build_object('deleted', true, 'item_id', p_item_id, 'type', 'post');
  else
    -- Delete library item and related data
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
do $$
begin
  raise notice '=== ADMIN DELETE FEED ITEM SELF CHECK ===';
  raise notice 'admin_delete_feed_item fn:  %', coalesce(to_regprocedure('public.admin_delete_feed_item(uuid,text)')::text, 'MISSING');
  raise notice 'pgcrypto extension:       %', coalesce((select extname from pg_extension where extname = 'pgcrypto'), 'MISSING');
  raise notice '';
  raise notice 'Function should be callable by authenticated admins only.';
end $$;
