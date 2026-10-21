-- ============================================================
-- FIX BILLING_ACCESS — consolidate duplicate functions
-- This drops ALL versions and creates ONE consolidated function
-- with all parameters. Safe to re-run: idempotent.
-- ============================================================

-- Add unique constraint on request_id (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_events_request_id_key'
  ) then
    alter table public.billing_events add constraint billing_events_request_id_key unique (request_id);
  end if;
end $$;

-- Drop all existing versions
drop function if exists public.billing_access(text, text, text, uuid) cascade;
drop function if exists public.billing_access(text, text, text, uuid, integer) cascade;
drop function if exists public.billing_access(text, text, text, uuid, text) cascade;
drop function if exists public.billing_access(text, text, text, uuid, integer, text) cascade;
drop function if exists public.billing_access(text, text, text, uuid, text, integer) cascade;

-- Create consolidated version with all parameters
create or replace function public.billing_access(
  p_event_type text,
  p_item_id text default null,
  p_request_id text default null,
  p_creator uuid default null,
  p_price_override integer default null,
  p_recipient text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
      'live', 'profile_print', 'premium_unlock', 'comment') then
    return jsonb_build_object('allowed', false, 'code', 'UNKNOWN_EVENT');
  end if;

  -- Serialize all billing decisions per user (cycle creation, dedupe, debits).
  perform pg_advisory_xact_lock(hashtext('billing_user:' || uid::text));

  -- Idempotency: replaying the same request_id returns the cached outcome.
  if p_request_id is not null
     and exists (select 1 from public.billing_events e
                  where e.request_id = p_request_id and e.user_id = uid) then
    return jsonb_build_object('allowed', true, 'dedupe', true);
  end if;

  select p.tier, p.trial_ends_at, p.subscription_expires_at,
         coalesce(p.wallet_balance, 0)
    into v_tier, v_trial, v_sub, v_wallet
    from public.profiles p where p.id = uid;

  -- Resolve gliims: premium status, real creator, AV vs text/image.
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
    if v_post.user_id = uid then
      return jsonb_build_object('allowed', true, 'kind', 'free', 'price', 0, 'owner', true);
    end if;
    v_creator := v_post.user_id;
  end if;

  -- Price override (for per-PDF pricing)
  if p_price_override is not null then
    v_price := p_price_override;
  else
    select amount into v_price from public.billing_prices where event_type = v_kind;
    if v_price is null then
      return jsonb_build_object('allowed', true, 'kind', v_kind, 'price', 0, 'unpriced', true);
    end if;
  end if;

  v_eff := case
    when v_tier = 'pro'    and v_sub > now()   then 'pro'
    when v_tier = 'elite'  and v_sub > now()   then 'elite'
    when v_tier = 'trial'  and v_trial > now() then 'trial'
    else 'wallet'
  end;

  -- Free for creators on their own content
  if v_creator = uid then
    return jsonb_build_object('allowed', true, 'kind', v_kind, 'price', 0, 'owner', true);
  end if;

  -- Pro/Elite: everything free
  if v_eff in ('pro', 'elite') then
    insert into public.billing_events (user_id, event_type, item_id, request_id, amount, tier)
    values (uid, v_kind, p_item_id, p_request_id, 0, v_eff)
    on conflict (request_id) do nothing;
    return jsonb_build_object('allowed', true, 'kind', v_kind, 'price', 0, 'tier', v_eff);
  end if;

  -- Trial: first 3 items free per cycle
  if v_eff = 'trial' then
    select count(*) into v_cycle
      from public.billing_events
     where user_id = uid and event_type = v_kind
       and created_at > v_trial;
    if v_cycle < 3 then
      insert into public.billing_events (user_id, event_type, item_id, request_id, amount, tier)
      values (uid, v_kind, p_item_id, p_request_id, 0, 'trial')
      on conflict (request_id) do nothing;
      return jsonb_build_object('allowed', true, 'kind', v_kind, 'price', 0, 'tier', 'trial', 'remaining', 3 - v_cycle - 1);
    end if;
    v_eff := 'wallet';
  end if;

  -- Wallet payment
  if v_wallet >= v_price then
    insert into public.billing_events (user_id, event_type, item_id, request_id, amount, tier, creator_id)
    values (uid, v_kind, p_item_id, p_request_id, v_price, 'wallet', v_creator)
    on conflict (request_id) do nothing;

    update public.profiles set wallet_balance = wallet_balance - v_price where id = uid;

    if v_creator is not null and v_creator != uid then
      v_share := case
        when v_kind = 'gliim_av'       then 15
        when v_kind = 'gliim_image'    then 5
        when v_kind = 'premium_unlock' then 70
        when v_kind = 'comment'        then 0
        else 50
      end;
      if v_share > 0 then
        insert into public.billing_events (user_id, event_type, item_id, request_id, amount, tier, creator_id)
        values (v_creator, v_kind || '_earning', p_item_id, 'earn:' || p_request_id, v_share, 'wallet', uid)
        on conflict (request_id) do nothing;
        update public.profiles set wallet_balance = wallet_balance + v_share where id = v_creator;
      end if;
    end if;

    return jsonb_build_object('allowed', true, 'kind', v_kind, 'price', v_price, 'creator', v_creator, 'balance', v_wallet - v_price);
  end if;

  return jsonb_build_object('allowed', false, 'code', 'INSUFFICIENT_WALLET', 'price', v_price, 'balance', v_wallet);
end $$;

-- Grants
revoke execute on function public.billing_access(text, text, text, uuid, integer, text) from public, anon;
grant execute on function public.billing_access(text, text, text, uuid, integer, text) to authenticated, service_role;

-- SELF CHECK
select 'billing_access consolidated' as test,
  (select case when to_regprocedure('public.billing_access(text,text,text,uuid,integer,text)') is not null then 'OK' else 'MISSING' end) as status;
