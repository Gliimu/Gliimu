-- ============================================================
-- FIX ALL STALE public.posts REFERENCES
-- The posts table was renamed to feed_gliims. These functions
-- still reference the old name and will fail at runtime.
-- Safe to re-run: idempotent (drops then recreates).
-- Run this ONCE in Supabase SQL Editor.
-- ============================================================

-- 1. Admin RPCs (also in fix_admin_rpcs.sql, included here for completeness)
drop function if exists public.admin_list_pending_posts(text);
drop function if exists public.admin_review_post(uuid, text, text);

create function public.admin_list_pending_posts(p_status text default 'pending')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not (public.admin_has_role(uid, 'crm') or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'NOT_CRM');
  end if;
  return jsonb_build_object('ok', true, 'posts', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'title', p.title, 'description', p.description,
             'category', p.category, 'cover_url', p.cover_url, 'is_premium', p.is_premium,
             'status', p.status, 'review_note', p.review_note,
             'created_at', p.created_at, 'reviewed_at', p.reviewed_at,
             'user_id', p.user_id,
             'author_name', coalesce(pr.full_name, pr.username, 'Unknown member'),
             'author_avatar', pr.avatar_url,
             'blocks', coalesce(pc.blocks, '[]'::jsonb))
             order by p.created_at desc)
      from public.feed_gliims p
      left join public.profiles pr on pr.id = p.user_id
      left join public.feed_gliim_contents pc on pc.post_id = p.id
     where p.status is distinct from 'draft'
       and (p_status = 'all' or p.status = coalesce(nullif(btrim(p_status), ''), 'pending'))
  ), '[]'::jsonb));
end $$;

create function public.admin_review_post(p_post uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_post public.feed_gliims%rowtype;
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not (public.admin_has_role(uid, 'crm') or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'NOT_CRM');
  end if;
  if p_action not in ('approve', 'reject') then return jsonb_build_object('ok', false, 'code', 'BAD_ACTION'); end if;
  select * into v_post from public.feed_gliims where id = p_post;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p_action = 'reject' then
    if coalesce(btrim(p_note), '') = '' then return jsonb_build_object('ok', false, 'code', 'NOTE_REQUIRED'); end if;
    update public.feed_gliims set status = 'rejected', reviewed_by = uid, reviewed_at = now(), review_note = p_note where id = p_post;
    insert into public.support_messages (thread_user, sender_id, content)
    values (v_post.user_id, uid, 'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was not approved. Reason: ' || p_note);
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;
  update public.feed_gliims set status = 'approved', reviewed_by = uid, reviewed_at = now(), review_note = p_note where id = p_post;
  insert into public.support_messages (thread_user, sender_id, content)
  values (v_post.user_id, uid, 'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was approved and is now live in the Hub.');
  return jsonb_build_object('ok', true, 'status', 'approved');
end $$;

revoke execute on function public.admin_list_pending_posts(text) from public, anon;
grant execute on function public.admin_list_pending_posts(text) to authenticated, service_role;
revoke execute on function public.admin_review_post(uuid, text, text) from public, anon;
grant execute on function public.admin_review_post(uuid, text, text) to authenticated, service_role;

-- 2. post_content_unlocked — checks if a gliim's content should be unlocked
drop function if exists public.post_content_unlocked(uuid) cascade;

create function public.post_content_unlocked(p_post uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return false; end if;
  -- Owner always has access
  if exists (select 1 from public.feed_gliims where id = p_post and user_id = uid) then return true; end if;
  -- Free gliims are always unlocked
  if exists (select 1 from public.feed_gliims where id = p_post and not is_premium) then return true; end if;
  -- Premium gliims: check if user has an active subscription or tier
  if exists (
    select 1 from public.feed_gliims fg
    join public.profiles pr on pr.id = fg.user_id
    where fg.id = p_post
      and fg.is_premium
      and coalesce(public.effective_tier(fg.user_id), 'wallet') <> 'wallet'
  ) then return true; end if;
  return false;
end $$;

revoke execute on function public.post_content_unlocked(uuid) from public, anon;
grant execute on function public.post_content_unlocked(uuid) to authenticated, service_role;

-- 3. billing_access — resolves access for billing events
drop function if exists public.billing_access(text, text, text, uuid, text);

create function public.billing_access(
  p_event_type text,
  p_item_id text default null,
  p_request_id text default null,
  p_creator uuid default null,
  p_recipient text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_tier text;
  v_trial timestamptz;
  v_sub timestamptz;
  v_wallet integer;
  v_eff text;
  v_kind text := p_event_type;
  v_price integer;
  v_post record;
  v_creator uuid := p_creator;
  v_cycle bigint;
  v_share integer;
  v_seen boolean;
begin
  if uid is null then return jsonb_build_object('allowed', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if p_event_type is null or p_event_type not in
     ('publication', 'bundle', 'audiolite', 'gliim', 'gliim_av', 'gliim_image',
      'live', 'profile_print', 'premium_unlock') then
    return jsonb_build_object('allowed', false, 'code', 'UNKNOWN_EVENT');
  end if;

  select p.tier, p.trial_ends_at, p.subscription_expires_at,
         coalesce(p.wallet_balance, 0)
    into v_tier, v_trial, v_sub, v_wallet
    from public.profiles p where p.id = uid;

  if p_event_type = 'gliim' then
    select po.id, po.user_id, po.is_premium, pc.blocks into v_post
      from public.feed_gliims po
      left join public.feed_gliim_contents pc on pc.post_id = po.id
     where po.id::text = p_item_id;
    if not found then
      return jsonb_build_object('allowed', true, 'kind', 'free', 'price', 0);
    end if;
    if v_post.user_id = uid then
      return jsonb_build_object('allowed', true, 'kind', 'free', 'price', 0, 'owner', true);
    end if;
    v_creator := v_post.user_id;
    if v_post.is_premium
       and coalesce(public.effective_tier(v_post.user_id), 'wallet') <> 'wallet' then
      v_kind := 'premium_unlock';
    elsif exists (
      select 1 from jsonb_array_elements(coalesce(v_post.blocks::jsonb, '[]'::jsonb)) b
       where b->>'type' in ('video', 'audio')
    ) then
      v_kind := 'gliim_av';
    else
      v_kind := 'gliim_image';
    end if;
  elsif p_event_type = 'premium_unlock' then
    select po.id, po.user_id, po.is_premium into v_post
      from public.feed_gliims po where po.id::text = p_item_id;
    if not found or not v_post.is_premium
       or coalesce(public.effective_tier(v_post.user_id), 'wallet') = 'wallet' then
      return jsonb_build_object('allowed', true, 'kind', 'free', 'price', 0);
    end if;
    v_creator := v_post.user_id;
  end if;

  select price into v_price from public.billing_prices where event_type = v_kind;
  if v_price is null then
    return jsonb_build_object('allowed', true, 'kind', v_kind, 'price', 0);
  end if;

  if v_wallet >= v_price then
    return jsonb_build_object('allowed', true, 'kind', v_kind, 'price', v_price, 'creator', v_creator);
  end if;

  return jsonb_build_object('allowed', false, 'code', 'INSUFFICIENT_WALLET', 'price', v_price, 'balance', v_wallet);
end $$;

revoke execute on function public.billing_access(text, text, text, uuid, text) from public, anon;
grant execute on function public.billing_access(text, text, text, uuid, text) to authenticated, service_role;

-- Grants for admin RPCs
revoke execute on function public.admin_list_pending_posts(text) from public, anon;
grant execute on function public.admin_list_pending_posts(text) to authenticated, service_role;
revoke execute on function public.admin_review_post(uuid, text, text) from public, anon;
grant execute on function public.admin_review_post(uuid, text, text) to authenticated, service_role;

-- SELF CHECK
select 'admin_list_pending_posts' as fn, coalesce(to_regprocedure('public.admin_list_pending_posts(text)')::text, 'MISSING') as status
union all
select 'admin_review_post', coalesce(to_regprocedure('public.admin_review_post(uuid,text,text)')::text, 'MISSING')
union all
select 'post_content_unlocked', coalesce(to_regprocedure('public.post_content_unlocked(uuid)')::text, 'MISSING')
union all
select 'billing_access', coalesce(to_regprocedure('public.billing_access(text,text,text,uuid,text)')::text, 'MISSING');
