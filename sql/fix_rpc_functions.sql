-- ============================================================
-- FIX RPC FUNCTIONS
-- Recreate billing_access and bump_post_views with correct signatures
-- ============================================================

-- 1. Fix bump_post_views
DROP FUNCTION IF EXISTS public.bump_post_views(uuid);
DROP FUNCTION IF EXISTS public.bump_post_views;

CREATE OR REPLACE FUNCTION public.bump_post_views(p_post uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.feed_gliims
     SET views = views + 1
   WHERE id = p_post;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_post_views(uuid) TO authenticated;

-- 2. Fix billing_access (simplified version without posts/post_contents references)
DROP FUNCTION IF EXISTS public.billing_access(text, text, text, uuid);
DROP FUNCTION IF EXISTS public.billing_access;

CREATE OR REPLACE FUNCTION public.billing_access(
  p_event_type text,
  p_item_id    text default null,
  p_request_id text default null,
  p_creator    uuid default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  if uid is null then
    return jsonb_build_object('allowed', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  
  if p_event_type is null or p_event_type not in
     ('publication', 'bundle', 'audiolite', 'gliim', 'gliim_av', 'gliim_image',
      'live', 'profile_print', 'premium_unlock') then
    return jsonb_build_object('allowed', false, 'code', 'UNKNOWN_EVENT');
  end if;

  perform pg_advisory_xact_lock(hashtext('billing_user:' || uid::text));

  if p_request_id is not null
     and exists (select 1 from public.billing_events e
                  where e.request_id = p_request_id and e.user_id = uid) then
    return jsonb_build_object('allowed', true, 'dedupe', true);
  end if;

  select p.tier, p.trial_ends_at, p.subscription_expires_at,
         coalesce(p.wallet_balance, 0)
    into v_tier, v_trial, v_sub, v_wallet
    from public.profiles p where p.id = uid;

  -- Resolve gliim posts
  if p_event_type = 'gliim' then
    select po.id, po.user_id, po.is_premium into v_post
      from public.feed_gliims po
     where po.id::text = p_item_id;
    if not found then
      return jsonb_build_object('allowed', true, 'kind', 'free', 'price', 0);
    end if;
    if v_post.user_id = uid then
      return jsonb_build_object('allowed', true, 'kind', 'free', 'price', 0, 'owner', true);
    end if;
    v_creator := v_post.user_id;
    if v_post.is_premium then
      v_kind := 'premium_unlock';
    else
      v_kind := 'gliim_image';
    end if;
  elsif p_event_type = 'premium_unlock' then
    select po.id, po.user_id, po.is_premium into v_post
      from public.feed_gliims po where po.id::text = p_item_id;
    if not found or not v_post.is_premium then
      return jsonb_build_object('allowed', true, 'kind', 'free', 'price', 0);
    end if;
    if v_post.user_id = uid then
      return jsonb_build_object('allowed', true, 'kind', 'free', 'price', 0, 'owner', true);
    end if;
    v_creator := v_post.user_id;
  end if;

  select amount into v_price from public.billing_prices where event_type = v_kind;
  if v_price is null then
    return jsonb_build_object('allowed', true, 'kind', v_kind, 'price', 0, 'unpriced', true);
  end if;

  v_eff := case
    when v_tier = 'pro'    and v_sub > now()   then 'pro'
    when v_tier = 'payngo' and v_sub > now()   then 'payngo'
    when v_tier = 'trial'  and v_trial > now() then 'trial'
    else 'wallet'
  end;

  if v_kind = 'premium_unlock'
     and exists (select 1 from public.billing_events e
                  where e.user_id = uid and e.event_type = 'premium_unlock'
                    and e.item_id = p_item_id
                    and (e.tier is null or e.tier <> 'trial')) then
    return jsonb_build_object('allowed', true, 'kind', v_kind, 'price', 0, 'unlocked', true);
  end if;

  if v_eff = 'pro' then
    insert into public.billing_events (user_id, event_type, amount, creator_id, item_id, request_id, tier)
    values (uid, v_kind, 0, v_creator, p_item_id, p_request_id, v_eff);

    if v_kind = 'premium_unlock' and v_creator is not null and v_creator <> uid then
      v_share := (v_price * 70) / 100;
      update public.profiles set wallet_balance = coalesce(wallet_balance, 0) + v_share
       where id = v_creator;
      insert into public.transactions (user_id, amount, points, type, status, description)
      values (v_creator, v_share, 0, 'support', 'success', 'Premium gliim share (Pro viewer)');
    end if;

    return jsonb_build_object('allowed', true, 'tier', 'pro', 'kind', v_kind,
                              'price', 0, 'included', true);
  end if;

  if v_eff = 'trial' then
    v_seen := exists (
      select 1 from public.billing_events e
       where e.user_id = uid and e.event_type = v_kind and e.item_id = p_item_id
         and e.billing_cycle_id is null
         and e.event_type in ('publication', 'bundle', 'audiolite', 'gliim_av', 'gliim_image')
    );
    if not v_seen then
      insert into public.billing_events (user_id, event_type, amount, creator_id, item_id, request_id, tier)
      values (uid, v_kind, v_price, v_creator, p_item_id, p_request_id, v_eff);
    end if;
    return jsonb_build_object('allowed', true, 'tier', 'trial', 'kind', v_kind,
                              'price', v_price, 'preview', true, 'recorded', not v_seen);
  end if;

  if v_eff = 'payngo' then
    select c.id into v_cycle
      from public.billing_cycles c
     where c.user_id = uid and c.status = 'open'
     limit 1;
    if v_cycle is null then
      insert into public.billing_cycles (user_id, start_date, end_date, status)
      values (uid, now(), v_sub, 'open')
      returning id into v_cycle;
    end if;

    v_seen := exists (
      select 1 from public.billing_events e
       where e.billing_cycle_id = v_cycle and e.event_type = v_kind and e.item_id = p_item_id
         and e.event_type in ('publication', 'bundle', 'audiolite', 'gliim_av', 'gliim_image')
    );
    if not v_seen then
      insert into public.billing_events
        (user_id, event_type, amount, creator_id, item_id, request_id, billing_cycle_id, tier)
      values (uid, v_kind, v_price, v_creator, p_item_id, p_request_id, v_cycle, v_eff);
    end if;

    if v_kind = 'premium_unlock' and v_creator is not null and v_creator <> uid then
      v_share := (v_price * 70) / 100;
      update public.profiles set wallet_balance = coalesce(wallet_balance, 0) + v_share
       where id = v_creator;
      insert into public.transactions (user_id, amount, points, type, status, description)
      values (v_creator, v_share, 0, 'support', 'success', 'Premium gliim share');
    end if;

    return jsonb_build_object('allowed', true, 'tier', 'payngo', 'kind', v_kind,
                              'price', v_price, 'accrued', not v_seen);
  end if;

  if v_kind = 'live' then
    return jsonb_build_object('allowed', false, 'code', 'TIER_BLOCKED',
                              'reason', 'live_requires_subscription', 'price', v_price);
  end if;

  if v_kind in ('publication', 'bundle', 'audiolite') then
    return jsonb_build_object('allowed', false, 'code', 'PURCHASE_REQUIRED',
                              'kind', v_kind, 'price', v_price);
  end if;

  if v_kind in ('gliim_av', 'gliim_image') then
    return jsonb_build_object('allowed', true, 'tier', 'wallet', 'kind', v_kind,
                              'price', 0, 'free', true);
  end if;

  update public.profiles
     set wallet_balance = coalesce(wallet_balance, 0) - v_price
   where id = uid and coalesce(wallet_balance, 0) >= v_price;
  if not found then
    return jsonb_build_object('allowed', false, 'code', 'INSUFFICIENT_FUNDS',
                              'price', v_price, 'balance', v_wallet);
  end if;

  insert into public.billing_events (user_id, event_type, amount, creator_id, item_id, request_id, tier)
  values (uid, v_kind, v_price, v_creator, p_item_id, p_request_id, v_eff);

  insert into public.transactions (user_id, amount, points, type, status, description)
  values (uid, -v_price, 0, 'purchase', 'success',
          case when v_kind = 'premium_unlock' then 'Premium gliim unlock'
               else 'Profile print' end);

  if v_kind = 'premium_unlock' and v_creator is not null and v_creator <> uid then
    v_share := (v_price * 70) / 100;
    update public.profiles set wallet_balance = coalesce(wallet_balance, 0) + v_share
     where id = v_creator;
    insert into public.transactions (user_id, amount, points, type, status, description)
    values (v_creator, v_share, 0, 'support', 'success', 'Premium gliim share');
  end if;

  return jsonb_build_object('allowed', true, 'tier', 'wallet', 'kind', v_kind,
                            'price', v_price, 'charged', v_price, 'balance', v_wallet - v_price);
end $$;

REVOKE EXECUTE ON FUNCTION public.billing_access(text, text, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_access(text, text, text, uuid) TO authenticated, service_role;

-- SELF CHECK
SELECT 'bump_post_views' as function_name, count(*) as exists 
FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_name = 'bump_post_views'
UNION ALL
SELECT 'billing_access', count(*)
FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_name = 'billing_access';
