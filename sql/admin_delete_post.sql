-- ============================================================
-- Gliimu: Admin delete post RPC with password confirmation
-- Run this in Supabase SQL Editor after sql/all.sql.
-- Safe to run more than once (idempotent).
--
-- WHAT THIS ADDS:
--   - admin_delete_post(p_post_id, p_password): SECURITY DEFINER
--     RPC that verifies the caller is CRM/admin, checks their
--     password, then deletes the post and all related data.
--
-- SECURITY:
--   - Only users with public.is_admin() = true can call it
--   - Password must match the calling user's auth.password
--   - Cascades to post_contents, hub_interactions, billing_events
--
-- HOW TO RUN:
--   1. Copy ALL of this file
--   2. SQL Editor -> "+ New query"
--   3. Paste, Ctrl+A, click "Run" — once
--   4. Check SELF CHECK at bottom
-- ============================================================

create or replace function public.admin_delete_post(
  p_post_id uuid,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean;
begin
  -- Gate: only admins/CRM can delete posts
  select public.is_admin() into v_is_admin;
  if not v_is_admin then
    raise exception 'PERMISSION_DENIED';
  end if;

  -- Verify the post exists
  if not exists (select 1 from public.posts where id = p_post_id) then
    raise exception 'POST_NOT_FOUND';
  end if;

  -- Password gate: verify caller's password via auth.users
  -- This requires service_role access to auth schema
  if not exists (
    select 1 from auth.users u
    where u.id = v_caller
      and u.encrypted_password = crypt(p_password, u.encrypted_password)
  ) then
    raise exception 'INVALID_PASSWORD';
  end if;

  -- Delete cascades automatically via FK:
  -- - post_contents (FK on delete cascade)
  -- - hub_interactions (no FK but we delete manually below)
  -- - billing_events for premium_unlocks
  -- - reports targeting this post
  delete from public.hub_interactions where post_id = p_post_id;
  delete from public.billing_events where event_type = 'premium_unlock' and item_id = p_post_id::text;
  delete from public.reports where target_type = 'post' and target_id = p_post_id;
  delete from public.posts where id = p_post_id;

  return jsonb_build_object('deleted', true, 'post_id', p_post_id);
exception
  when others then
    return jsonb_build_object('deleted', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.admin_delete_post(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- SELF CHECK
-- ------------------------------------------------------------
do $$
begin
  raise notice '=== ADMIN DELETE POST SELF CHECK ===';
  raise notice 'admin_delete_post fn:  %', coalesce(to_regprocedure('public.admin_delete_post(uuid,text)')::text, 'MISSING');
  raise notice '';
  raise notice 'Function should be callable by authenticated admins only.';
end $$;
