-- ============================================================
-- Gliimu: server-side lock for premium gliim content
-- Run this in the Supabase SQL Editor AFTER sql/billing.sql.
-- Safe to run more than once.
--
-- WHAT THIS INSTALLS
--   1. post_contents — the real gliim body (blocks jsonb) moves OUT of
--      posts into its own table, so the hub feed can never carry a
--      premium body to the browser.
--   2. RLS on post_contents: a premium body is only returned by the
--      database when the viewer is the owner, an admin, the creator is
--      wallet-tier (premium flag inactive per billing rules), or the
--      viewer has a recorded premium_unlock billing event for that post
--      (i.e. they actually paid / accrued the ₦100 through
--      billing_access()). Free posts stay readable by everyone.
--   3. billing_access() re-created to read blocks from post_contents.
--   4. posts.blocks is dropped — the column no longer exists for any
--      client to select, modified or not.
--
-- SECURITY MODEL
--   The client gate (ensureAccess) still runs first for honest clients:
--   it charges/records the unlock. This script closes the bypass: even
--   a modified client that skips the gate gets zero rows back from
--   post_contents until billing_access() has recorded a premium_unlock
--   event for that user+post. Title/description/cover stay public —
--   they are the feed teaser, not the paid content.
--
-- DEPLOY TOGETHER: the dashboard build that ships with this script
-- reads/writes post_contents. Old clients select posts.blocks and will
-- error once the column is dropped — deploy the dashboard in the same
-- window as running this script.
--
-- MONEY/LEDGER: unchanged. billing_events stays fully locked down
-- (no direct reads); the RLS check runs through a SECURITY DEFINER
-- helper so it cannot be spoofed.
-- ============================================================


-- ============================================================
-- 1. post_contents table
-- ============================================================

create table if not exists public.post_contents (
  post_id uuid primary key references public.posts(id) on delete cascade,
  blocks  jsonb not null default '[]'::jsonb
);

alter table public.post_contents enable row level security;

revoke all on public.post_contents from anon;
grant select, insert, update on public.post_contents to authenticated;
grant all on public.post_contents to service_role;

-- Effective tier at event time (added here too so this script is
-- self-contained). Lets premium unlocks recorded during a trial expire
-- with the trial. NULL = legacy row, grandfathered as a valid unlock.
alter table public.billing_events add column if not exists tier text;


-- ============================================================
-- 2. Backfill from posts.blocks (skips itself once the column is gone)
-- ============================================================

do $$ begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'posts' and column_name = 'blocks'
  ) then
    insert into public.post_contents (post_id, blocks)
    select p.id, coalesce(p.blocks::jsonb, '[]'::jsonb)
      from public.posts p
    on conflict (post_id) do nothing;
  end if;
end $$;


-- ============================================================
-- 3. Unlock check + RLS policies
-- ============================================================

create or replace function public.post_content_unlocked(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.posts p
     where p.id = p_post
       and (
            not p.is_premium
         or p.user_id = auth.uid()
         or public.is_admin()
         -- wallet-tier creators cannot sell premium posts (billing rule);
         -- their "premium" flag is inert, so the body stays readable.
         or public.effective_tier(p.user_id) = 'wallet'
         -- trial viewers have full access while the trial runs; unlocks
         -- recorded during the trial stop counting once it ends.
         or public.effective_tier(auth.uid()) = 'trial'
         or exists (
              select 1 from public.billing_events e
               where e.user_id = auth.uid()
                 and e.event_type = 'premium_unlock'
                 and e.item_id = p_post::text
                 and (e.tier is null or e.tier <> 'trial')
            )
       )
  );
$$;

revoke execute on function public.post_content_unlocked(uuid) from public, anon;
grant execute on function public.post_content_unlocked(uuid) to authenticated, service_role;

-- Keeps the RLS lookup cheap as the ledger grows.
create index if not exists billing_events_unlock_idx
  on public.billing_events (user_id, event_type, item_id)
  where event_type = 'premium_unlock';

drop policy if exists "post content read" on public.post_contents;
create policy "post content read" on public.post_contents
  for select to authenticated
  using (public.post_content_unlocked(post_id));

drop policy if exists "post content insert" on public.post_contents;
create policy "post content insert" on public.post_contents
  for insert to authenticated
  with check (exists (
    select 1 from public.posts p
     where p.id = post_id and p.user_id = auth.uid()));

drop policy if exists "post content update" on public.post_contents;
create policy "post content update" on public.post_contents
  for update to authenticated
  using (exists (
    select 1 from public.posts p
     where p.id = post_id and p.user_id = auth.uid()));

-- No DELETE policy on purpose: content rows go away with their post
-- (on delete cascade) or via service_role. Clients cannot delete bodies.


-- ============================================================
-- 4. billing_access() — same contract as billing.sql, but blocks now
--    come from post_contents (SECURITY DEFINER, so it reads past RLS).
-- ============================================================

create or replace function public.billing_access(
  p_event_type text,
  p_item_id    text default null,
  p_request_id text default null,
  p_creator    uuid default null
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
      'live', 'profile_print', 'premium_unlock') then
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

  -- Resolve hub posts: premium status, real creator, AV vs text/image.
  if p_event_type = 'gliim' then
    select po.id, po.user_id, po.is_premium, pc.blocks into v_post
      from public.posts po
      left join public.post_contents pc on pc.post_id = po.id
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
    -- Defensive server-side validation even when called directly.
    select po.id, po.user_id, po.is_premium into v_post
      from public.posts po where po.id::text = p_item_id;
    if not found or not v_post.is_premium
       or coalesce(public.effective_tier(v_post.user_id), 'wallet') = 'wallet' then
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

  -- Premium unlocks are persistent: once a viewer has paid (or accrued) for
  -- a post, every re-open is free, records nothing, and pays the creator
  -- nothing new. Unlock once, read forever. Unlocks recorded during a trial
  -- are NOT persistent — they die with the trial (NULL tier = legacy row).
  if v_kind = 'premium_unlock'
     and exists (select 1 from public.billing_events e
                  where e.user_id = uid and e.event_type = 'premium_unlock'
                    and e.item_id = p_item_id
                    and (e.tier is null or e.tier <> 'trial')) then
    return jsonb_build_object('allowed', true, 'kind', v_kind, 'price', 0, 'unlocked', true);
  end if;

  -- ---- PRO: everything included; the platform still pays creators. ----
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

  -- ---- TRIAL: full access, usage only recorded for the bill preview. ----
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

  -- ---- PAY N' GO: usage accrues to the open cycle. ----
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

    -- Creators are paid immediately; the subscriber pays at month end.
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

  -- ---- WALLET: pay-per-use from the balance. ----
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

  -- premium_unlock / profile_print: charge the wallet now (atomic).
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

revoke execute on function public.billing_access(text, text, text, uuid) from public, anon;
grant execute on function public.billing_access(text, text, text, uuid) to authenticated, service_role;


-- ============================================================
-- 5. Drop the old body column (only after the backfill above ran)
-- ============================================================

do $$ begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'posts' and column_name = 'blocks'
  ) then
    return;
  end if;
  if exists (
    select 1 from public.posts p
     where p.blocks is not null
       and not exists (select 1 from public.post_contents pc where pc.post_id = p.id)
  ) then
    raise exception 'BACKFILL INCOMPLETE — posts.blocks still has rows missing from post_contents; column NOT dropped';
  end if;
  alter table public.posts drop column blocks;
end $$;


-- ============================================================
-- 6. SELF CHECK — read these notices after running
-- ============================================================

do $$ begin
  raise notice '==== PREMIUM LOCK SELF CHECK ====';
  raise notice 'post_contents table:        %', case when to_regclass('public.post_contents') is not null then 'OK' else 'MISSING' end;
  raise notice 'post_content_unlocked():    %', coalesce(to_regprocedure('public.post_content_unlocked(uuid)')::text, 'MISSING');
  raise notice 'RLS enabled:                %', case when (select relrowsecurity from pg_class where oid = 'public.post_contents'::regclass) then 'OK' else 'MISSING' end;
  raise notice 'policies (expect 3):        %', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'post_contents');
  raise notice 'unlock index:               %', case when to_regclass('public.billing_events_unlock_idx') is not null then 'OK' else 'MISSING' end;
  raise notice 'billing_events.tier column: %', case when exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'billing_events' and column_name = 'tier'
    ) then 'OK' else 'MISSING' end;
  raise notice 'content rows backfilled:    %', (select count(*) from public.post_contents);
  raise notice 'posts total:                %', (select count(*) from public.posts);
  raise notice 'posts.blocks dropped:       %', case when exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'posts' and column_name = 'blocks'
    ) then 'STILL PRESENT — investigate' else 'OK' end;
  raise notice 'billing_access reads post_contents: %', case when
      pg_get_functiondef('public.billing_access(text,text,text,uuid)'::regprocedure) like '%post_contents%'
    then 'OK' else 'STALE — re-run this script' end;
  raise notice '=================================';
end $$;

notify pgrst, 'reload schema';
