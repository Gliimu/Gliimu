-- ============================================================
-- Gliimu: subscriptions + billing (trial / wallet / payngo / pro)
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once. Standalone — run it in any order
-- relative to the other sql/ scripts.
--
-- WHAT THIS INSTALLS
--   1. profiles.tier + profiles.trial_ends_at  (+ backfill + defaults)
--   2. A guard trigger so wallet / GP / plan columns can only be
--      changed through the SECURITY DEFINER RPCs, never directly
--      by the dashboard client.
--   3. posts.is_premium
--   4. billing_prices  — the server-side price list (edit prices HERE,
--      never in the apps; the dashboard only displays them).
--   5. billing_cycles  — one monthly (30 + 3 free days) bill per user.
--   6. billing_events  — the usage ledger. Locked down completely:
--      users never read it directly, only through billing_summary().
--   7. profiles.wallet_balance >= 0 check constraint.
--   8. RPCs (all SECURITY DEFINER, auth.uid() based — cannot be spoofed):
--        billing_access(...)          the ONE gate the dashboard calls
--                                     before opening any content
--        billing_summary()            plan-page data for the signed-in user
--        purchase_library_item(...)   wallet-tier persistent unlocks
--        activate_plan(...)           switch to payngo (free) or pro
--        billing_close_due_cycles()   cron: bills / trial conversion / downgrades
--        billing_mark_processing()    cron helper: attach the Paystack link
--        billing_enforce_deadlines()  cron: unpaid bills -> wallet tier
--        billing_settle_cycle()       payment confirmed (verify + webhook)
--   9. Tier gates on live_requests + deals (defense in depth behind the UI).
--
-- TIERS
--   trial  3 free days, full access. Usage is only PREVIEWED, never charged.
--   wallet Pay-as-you-go from wallet_balance. Library unlocks are persistent
--          one-by-one purchases; premium posts cost ₦100 per open; printing
--          a profile costs ₦100; NO live sessions; free gliims are free.
--   payngo Postpaid monthly. Usage accrues silently to the open cycle and is
--          billed at month end via Paystack (creator shares are paid
--          immediately). Limited Deals access. +3 free days on renewal.
--   pro    ₦99,900/year flat, everything included (premium-post creators
--          still earn their 70% share). Full Deals access. +30 free days.
--
-- PRICES (seeded below, change the numbers in billing_prices):
--   publication ₦100 | bundle ₦200 | audiolite ₦100 | gliim_av ₦20
--   gliim_image ₦10 | live ₦15 | profile_print ₦100 | premium_unlock ₦100
--   plan_pro ₦99,900 | limit_deals_payngo 3
--
-- MONEY UNITS: NAIRA integers, like the rest of the app. Paystack's kobo
-- conversion happens ONLY in the server.
--
-- NOTE: the dashboard deploy that goes with this script replaces the old
-- client-side wallet math (library purchase) with these RPCs. Run this
-- script together with that deploy.
-- ============================================================


-- ============================================================
-- 1. profiles.tier + profiles.trial_ends_at
-- ============================================================

alter table public.profiles add column if not exists tier text;
alter table public.profiles add column if not exists trial_ends_at timestamptz;

-- Backfill existing accounts (only rows still missing a tier):
--   active legacy subscription, elite/pro plan  -> pro
--   any other active legacy subscription        -> payngo
--   everyone else                               -> wallet
do $$ begin
  update public.profiles p
     set tier = case
           when p.subscription_expires_at > now()
                and lower(coalesce(p.subscription_plan, '')) in ('elite', 'pro') then 'pro'
           when p.subscription_expires_at > now() then 'payngo'
           else 'wallet'
         end
   where p.tier is null;
exception when undefined_column then
  -- Fresh database where subscription_plan/subscription_expires_at do not
  -- exist yet: everyone starts as wallet (new users get the trial default).
  update public.profiles set tier = 'wallet' where tier is null;
end $$;

-- From here on, new accounts start on the 3-day trial.
alter table public.profiles alter column tier set default 'trial';
alter table public.profiles alter column trial_ends_at set default (now() + interval '3 days');

do $$ begin
  update public.profiles set tier = 'trial' where tier is null;
  alter table public.profiles alter column tier set not null;
exception when others then
  raise warning 'tier not-null skipped: %', sqlerrm;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass and conname = 'profiles_tier_valid'
  ) then
    alter table public.profiles add constraint profiles_tier_valid
      check (tier in ('trial', 'wallet', 'payngo', 'pro'));
  end if;
end $$;

-- 1b. Guard trigger: the dashboard client (role authenticated/anon) may not
--     touch money or plan columns directly. SECURITY DEFINER RPCs run as
--     their owner (postgres), so they pass through untouched.
create or replace function public.profiles_protect_sensitive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'UPDATE' then
      if new.wallet_balance is distinct from old.wallet_balance
         or new.total_gp is distinct from old.total_gp
         or new.tier is distinct from old.tier
         or new.trial_ends_at is distinct from old.trial_ends_at
         or new.subscription_expires_at is distinct from old.subscription_expires_at
         or new.subscription_plan is distinct from old.subscription_plan then
        raise exception 'PROTECTED_COLUMN';
      end if;
    elsif tg_op = 'INSERT' then
      if coalesce(new.wallet_balance, 0) <> 0
         or coalesce(new.total_gp, 0) <> 0
         or (new.tier is not null and new.tier <> 'trial') then
        raise exception 'PROTECTED_COLUMN';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_sensitive on public.profiles;
create trigger profiles_protect_sensitive
  before insert or update on public.profiles
  for each row execute function public.profiles_protect_sensitive();


-- ============================================================
-- 2. posts.is_premium
-- ============================================================

alter table public.posts add column if not exists is_premium boolean not null default false;


-- ============================================================
-- 3. billing_prices — server-side price list
-- ============================================================

create table if not exists public.billing_prices (
  event_type text primary key,
  amount     integer not null check (amount >= 0),
  updated_at timestamptz not null default now()
);

alter table public.billing_prices enable row level security;

drop policy if exists "billing prices readable" on public.billing_prices;
create policy "billing prices readable" on public.billing_prices
  for select to authenticated using (true);

grant select on public.billing_prices to authenticated;
revoke insert, update, delete on public.billing_prices from anon, authenticated;

insert into public.billing_prices (event_type, amount) values
  ('publication',    100),
  ('bundle',         200),
  ('audiolite',      100),
  ('gliim_av',        20),
  ('gliim_image',     10),
  ('live',            15),
  ('profile_print',  100),
  ('premium_unlock', 100),
  ('plan_pro',     99900),
  ('limit_deals_payngo', 3)
on conflict (event_type) do nothing;


-- ============================================================
-- 4. billing_cycles + billing_events
-- ============================================================

create table if not exists public.billing_cycles (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  start_date        timestamptz not null default now(),
  end_date          timestamptz,
  total_amount      integer not null default 0,
  status            text not null default 'open'
                    check (status in ('open', 'processing', 'paid', 'defaulted',
                                      'closed_empty', 'void')),
  payment_reference text,
  payment_url       text,
  due_at            timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists billing_cycles_user_idx
  on public.billing_cycles (user_id, status);

create unique index if not exists billing_cycles_one_open
  on public.billing_cycles (user_id) where (status = 'open');

create table if not exists public.billing_events (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  event_type       text not null,
  amount           integer not null default 0,
  creator_id       uuid references public.profiles(id) on delete set null,
  item_id          text,
  request_id       text,
  billing_cycle_id bigint references public.billing_cycles(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists billing_events_user_idx
  on public.billing_events (user_id, created_at desc);

create index if not exists billing_events_cycle_idx
  on public.billing_events (billing_cycle_id);

-- Idempotency: a replayed request_id is recorded (and charged) at most once.
create unique index if not exists billing_events_request_once
  on public.billing_events (request_id) where (request_id is not null);

-- Library-style opens are recorded at most once per item per billing cycle
-- ("recorded once per item open"). Premium unlocks, live sessions and prints
-- stay per-open by design.
create unique index if not exists billing_events_cycle_item_once
  on public.billing_events (billing_cycle_id, event_type, item_id)
  where billing_cycle_id is not null and item_id is not null
    and event_type in ('publication', 'bundle', 'audiolite', 'gliim_av', 'gliim_image');

alter table public.billing_cycles enable row level security;
alter table public.billing_events enable row level security;
-- No policies on purpose: users never read these tables directly. The
-- dashboard reads them through billing_summary(); the server (service_role)
-- and the SECURITY DEFINER RPCs bypass RLS.

revoke all on public.billing_cycles from anon, authenticated;
revoke all on public.billing_events from anon, authenticated;


-- ============================================================
-- 5. profiles.wallet_balance >= 0
-- ============================================================

do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_wallet_balance_nonneg'
  ) then
    alter table public.profiles
      add constraint profiles_wallet_balance_nonneg
      check (wallet_balance >= 0) not valid;
  end if;
end $$;

do $$ begin
  alter table public.profiles validate constraint profiles_wallet_balance_nonneg;
exception
  when check_violation then
    raise warning 'Some profiles have a negative wallet_balance — the constraint is installed but NOT validated. Fix those rows, then run: alter table public.profiles validate constraint profiles_wallet_balance_nonneg;';
  when others then null;
end $$;


-- ============================================================
-- 6. effective_tier(user) — the plan a user is actually on right now
-- ============================================================

create or replace function public.effective_tier(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.tier = 'pro'    and p.subscription_expires_at > now() then 'pro'
    when p.tier = 'payngo' and p.subscription_expires_at > now() then 'payngo'
    when p.tier = 'trial'  and p.trial_ends_at > now()          then 'trial'
    else 'wallet'
  end
  from public.profiles p
  where p.id = p_user;
$$;

revoke execute on function public.effective_tier(uuid) from public, anon;
grant execute on function public.effective_tier(uuid) to authenticated, service_role;


-- ============================================================
-- 7. billing_access — the single content gate
--
--    The dashboard calls this right before opening anything.
--    Returns jsonb, always with "allowed". Denials carry a "code":
--      NOT_AUTHENTICATED | INSUFFICIENT_FUNDS | TIER_BLOCKED |
--      PURCHASE_REQUIRED | UNKNOWN_EVENT
--
--    Per tier:
--      trial  -> allowed, amount only RECORDED for the end-of-trial preview
--      payngo -> allowed, amount accrued to the open monthly cycle
--                (premium unlocks: the creator is paid 70% immediately)
--      pro    -> allowed, included in the flat fee (creator still paid 70%)
--      wallet -> free gliims opened free; premium unlocks + profile prints
--                charged instantly; library items -> PURCHASE_REQUIRED;
--                live sessions -> TIER_BLOCKED
--
--    Security: auth.uid() only (no spoofable ids), prices read from
--    billing_prices, posts.is_premium validated server-side, wallet debits
--    are atomic (balance guard in the UPDATE), request_id dedupe + a
--    per-user advisory lock.
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
    select po.id, po.user_id, po.is_premium, po.blocks into v_post
      from public.posts po where po.id::text = p_item_id;
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

  -- ---- PRO: everything included; the platform still pays creators. ----
  if v_eff = 'pro' then
    insert into public.billing_events (user_id, event_type, amount, creator_id, item_id, request_id)
    values (uid, v_kind, 0, v_creator, p_item_id, p_request_id);

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
      insert into public.billing_events (user_id, event_type, amount, creator_id, item_id, request_id)
      values (uid, v_kind, v_price, v_creator, p_item_id, p_request_id);
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
        (user_id, event_type, amount, creator_id, item_id, request_id, billing_cycle_id)
      values (uid, v_kind, v_price, v_creator, p_item_id, p_request_id, v_cycle);
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

  insert into public.billing_events (user_id, event_type, amount, creator_id, item_id, request_id)
  values (uid, v_kind, v_price, v_creator, p_item_id, p_request_id);

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
-- 8. billing_summary — everything the plan page needs (own data only)
-- ============================================================

create or replace function public.billing_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  p public.profiles%rowtype;
  v_eff text;
  v_cycle public.billing_cycles%rowtype;
  v_break jsonb := '[]'::jsonb;
  v_due jsonb := '[]'::jsonb;
  v_preview integer := 0;
  v_prices jsonb;
begin
  if uid is null then
    return jsonb_build_object('code', 'NOT_AUTHENTICATED');
  end if;

  select * into p from public.profiles where id = uid;
  if not found then
    return jsonb_build_object('code', 'NO_PROFILE');
  end if;

  v_eff := case
    when p.tier = 'pro'    and p.subscription_expires_at > now() then 'pro'
    when p.tier = 'payngo' and p.subscription_expires_at > now() then 'payngo'
    when p.tier = 'trial'  and p.trial_ends_at > now()          then 'trial'
    else 'wallet'
  end;

  select c.* into v_cycle
    from public.billing_cycles c
   where c.user_id = uid and c.status = 'open'
   order by c.id desc limit 1;

  select coalesce(jsonb_agg(x order by x->>'event'), '[]'::jsonb) into v_break
    from (
      select jsonb_build_object(
               'event', e.event_type,
               'count', count(*),
               'total', sum(e.amount)
             ) as x
        from public.billing_events e
       where e.billing_cycle_id = v_cycle.id
       group by e.event_type
    ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'total', c.total_amount,
           'due_at', c.due_at,
           'status', c.status,
           'payment_url', c.payment_url) order by c.id), '[]'::jsonb)
    into v_due
    from public.billing_cycles c
   where c.user_id = uid and c.status in ('processing', 'defaulted');

  if v_eff = 'trial' then
    select coalesce(sum(e.amount), 0) into v_preview
      from public.billing_events e
     where e.user_id = uid and e.billing_cycle_id is null and e.amount > 0
       and e.created_at >= p.trial_ends_at - interval '3 days'
       and e.created_at <= least(now(), p.trial_ends_at);
  end if;

  select jsonb_object_agg(event_type, amount) into v_prices from public.billing_prices;

  return jsonb_build_object(
    'tier', v_eff,
    'stored_tier', p.tier,
    'trial_ends_at', p.trial_ends_at,
    'subscription_expires_at', p.subscription_expires_at,
    'wallet_balance', coalesce(p.wallet_balance, 0),
    'trial_preview', v_preview,
    'open_cycle', case when v_cycle.id is null then null else jsonb_build_object(
      'id', v_cycle.id,
      'start', v_cycle.start_date,
      'end', v_cycle.end_date,
      'total', coalesce((select sum(e.amount) from public.billing_events e
                          where e.billing_cycle_id = v_cycle.id), 0),
      'breakdown', v_break
    ) end,
    'due_cycles', v_due,
    'prices', coalesce(v_prices, '{}'::jsonb)
  );
end $$;

revoke execute on function public.billing_summary() from public, anon;
grant execute on function public.billing_summary() to authenticated, service_role;


-- ============================================================
-- 9. purchase_library_item — wallet-tier persistent unlock
-- ============================================================

create or replace function public.purchase_library_item(p_item uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_price integer;
  v_title text;
  v_wallet integer;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select li.price, li.title into v_price, v_title
    from public.library_items li where li.id = p_item;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  perform pg_advisory_xact_lock(hashtext('lib_purchase:' || uid::text || ':' || p_item::text));

  if exists (select 1 from public.purchases pu
              where pu.user_id = uid and pu.item_id = p_item) then
    return jsonb_build_object('ok', true, 'already_owned', true);
  end if;

  v_price := greatest(coalesce(v_price, 0), 0);

  update public.profiles
     set wallet_balance = coalesce(wallet_balance, 0) - v_price
   where id = uid and coalesce(wallet_balance, 0) >= v_price;
  if not found then
    select coalesce(wallet_balance, 0) into v_wallet from public.profiles where id = uid;
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_FUNDS',
                              'price', v_price, 'balance', v_wallet);
  end if;

  insert into public.purchases (user_id, item_id) values (uid, p_item);

  insert into public.transactions (user_id, amount, points, type, status, description)
  values (uid, -v_price, 0, 'purchase', 'success',
          'Library Unlock: ' || left(coalesce(v_title, 'item'), 60));

  return jsonb_build_object('ok', true, 'charged', v_price);
end $$;

revoke execute on function public.purchase_library_item(uuid) from public, anon;
grant execute on function public.purchase_library_item(uuid) to authenticated, service_role;


-- ============================================================
-- 10. activate_plan — payngo (free switch) / pro (₦99,900 from wallet)
-- ============================================================

create or replace function public.activate_plan(p_plan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_price integer;
  v_expiry timestamptz;
  v_wallet integer;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if p_plan not in ('payngo', 'pro') then
    return jsonb_build_object('ok', false, 'code', 'UNKNOWN_PLAN');
  end if;

  perform pg_advisory_xact_lock(hashtext('plan:' || uid::text));

  if p_plan = 'payngo' then
    -- An unpaid bill must be settled first (no switching around it).
    if exists (
      select 1 from public.billing_cycles c
       where c.user_id = uid and c.status in ('processing', 'defaulted')
         and c.total_amount > 0
    ) then
      return jsonb_build_object('ok', false, 'code', 'OUTSTANDING_BILL');
    end if;

    update public.profiles
       set tier = 'payngo',
           subscription_expires_at =
             greatest(coalesce(subscription_expires_at, now()), now()) + interval '33 days'
     where id = uid
     returning subscription_expires_at into v_expiry;

    insert into public.billing_cycles (user_id, start_date, end_date, status)
    select uid, now(), v_expiry, 'open'
     where not exists (select 1 from public.billing_cycles c
                        where c.user_id = uid and c.status = 'open');

    return jsonb_build_object('ok', true, 'tier', 'payngo',
                              'subscription_expires_at', v_expiry);
  end if;

  -- PRO: ₦99,900 from the wallet — 365 days + 30 free days.
  select amount into v_price from public.billing_prices where event_type = 'plan_pro';
  v_price := coalesce(v_price, 99900);

  update public.profiles
     set wallet_balance = coalesce(wallet_balance, 0) - v_price,
         tier = 'pro',
         subscription_expires_at =
           greatest(coalesce(subscription_expires_at, now()), now()) + interval '395 days'
   where id = uid and coalesce(wallet_balance, 0) >= v_price;
  if not found then
    select coalesce(wallet_balance, 0) into v_wallet from public.profiles where id = uid;
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_FUNDS',
                              'price', v_price, 'balance', v_wallet);
  end if;

  insert into public.transactions (user_id, amount, points, type, status, description)
  values (uid, -v_price, 0, 'subscription', 'success',
          'Pro annual plan (365 + 30 free days)');

  -- Upgrading forgives any accrued Pay n' Go usage.
  update public.billing_cycles
     set status = 'void', end_date = now()
   where user_id = uid and status = 'open';

  return jsonb_build_object('ok', true, 'tier', 'pro', 'subscription_expires_at',
    (select subscription_expires_at from public.profiles where id = uid));
end $$;

revoke execute on function public.activate_plan(text) from public, anon;
grant execute on function public.activate_plan(text) to authenticated, service_role;


-- ============================================================
-- 11. Billing runner RPCs — service_role only (the server cron)
--     billing_close_due_cycles() runs daily at midnight:
--       - trials that ended      -> convert to payngo, new cycle
--       - payngo terms that ended -> close the cycle. ₦0 -> free renewal
--         (+33 days); > ₦0 -> status processing, 3-day grace to pay.
--       - expired pro            -> back to wallet
--     billing_enforce_deadlines() is the backstop that suspends unpaid bills.
-- ============================================================

create or replace function public.billing_close_due_cycles()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_cycle public.billing_cycles%rowtype;
  v_total integer;
  v_preview integer;
  v_expiry timestamptz;
  v_due jsonb := '[]'::jsonb;
  v_trials jsonb := '[]'::jsonb;
  v_pros jsonb := '[]'::jsonb;
  v_renewed jsonb := '[]'::jsonb;
begin
  -- 1) Trials that ended -> Pay n' Go (trial usage stays free).
  for r in
    select p.id, p.trial_ends_at from public.profiles p
     where p.tier = 'trial' and p.trial_ends_at <= now()
     for update skip locked
  loop
    update public.profiles
       set tier = 'payngo',
           subscription_expires_at = now() + interval '33 days'
     where id = r.id and tier = 'trial'
     returning subscription_expires_at into v_expiry;
    if not found then continue; end if;

    insert into public.billing_cycles (user_id, start_date, end_date, status)
    values (r.id, now(), v_expiry, 'open');

    select coalesce(sum(e.amount), 0) into v_preview
      from public.billing_events e
     where e.user_id = r.id and e.billing_cycle_id is null and e.amount > 0
       and e.created_at >= r.trial_ends_at - interval '3 days'
       and e.created_at <= r.trial_ends_at;

    v_trials := v_trials || jsonb_build_object('user_id', r.id, 'preview', v_preview);
  end loop;

  -- 2) Pay n' Go / legacy terms that ended.
  for r in
    select p.id from public.profiles p
     where p.tier = 'payngo' and p.subscription_expires_at <= now()
     for update skip locked
  loop
    select c.* into v_cycle from public.billing_cycles c
     where c.user_id = r.id and c.status = 'open' limit 1;

    if not found then
      -- Still-unpaid bill? Keep them suspended until it is settled.
      if exists (select 1 from public.billing_cycles c
                  where c.user_id = r.id and c.status in ('processing', 'defaulted')
                    and c.total_amount > 0) then
        update public.profiles set tier = 'wallet' where id = r.id and tier = 'payngo';
        continue;
      end if;

      -- Legacy subscriber with no cycle: free renewal, fresh cycle.
      update public.profiles
         set subscription_expires_at =
               greatest(coalesce(subscription_expires_at, now()), now()) + interval '33 days'
       where id = r.id and tier = 'payngo'
       returning subscription_expires_at into v_expiry;
      if not found then continue; end if;

      insert into public.billing_cycles (user_id, start_date, end_date, status)
      values (r.id, now(), v_expiry, 'open');
      v_renewed := v_renewed || jsonb_build_object('user_id', r.id, 'total', 0);
      continue;
    end if;

    select coalesce(sum(e.amount), 0) into v_total
      from public.billing_events e where e.billing_cycle_id = v_cycle.id;

    if v_total <= 0 then
      update public.billing_cycles
         set status = 'closed_empty', total_amount = 0, end_date = now()
       where id = v_cycle.id and status = 'open';
      if not found then continue; end if;

      update public.profiles
         set subscription_expires_at =
               greatest(coalesce(subscription_expires_at, now()), now()) + interval '33 days'
       where id = r.id and tier = 'payngo'
       returning subscription_expires_at into v_expiry;

      insert into public.billing_cycles (user_id, start_date, end_date, status)
      values (r.id, now(), v_expiry, 'open');
      v_renewed := v_renewed || jsonb_build_object('user_id', r.id, 'total', 0);
    else
      -- Bill is due: 3 days of grace while they pay.
      update public.billing_cycles
         set status = 'processing', total_amount = v_total,
             due_at = now() + interval '3 days', end_date = now()
       where id = v_cycle.id and status = 'open';
      if not found then continue; end if;

      update public.profiles
         set subscription_expires_at = now() + interval '3 days'
       where id = r.id and tier = 'payngo';

      v_due := v_due || jsonb_build_object('user_id', r.id, 'cycle_id', v_cycle.id, 'total', v_total);
    end if;
  end loop;

  -- 3) Expired Pro -> wallet (they can re-buy any time).
  for r in
    select p.id from public.profiles p
     where p.tier = 'pro' and p.subscription_expires_at <= now()
     for update skip locked
  loop
    update public.profiles set tier = 'wallet' where id = r.id and tier = 'pro';
    if found then
      v_pros := v_pros || jsonb_build_object('user_id', r.id);
    end if;
  end loop;

  -- 4) Processing cycles still missing a Paystack link (a crashed run).
  for r in
    select c.id, c.user_id, c.total_amount from public.billing_cycles c
     where c.status = 'processing' and c.payment_url is null and c.total_amount > 0
     for update skip locked
  loop
    v_due := v_due || jsonb_build_object('user_id', r.user_id, 'cycle_id', r.id, 'total', r.total_amount);
  end loop;

  return jsonb_build_object(
    'due', v_due,
    'converted_trials', v_trials,
    'downgraded_pro', v_pros,
    'renewed_free', v_renewed
  );
end $$;

create or replace function public.billing_mark_processing(p_cycle bigint, p_reference text, p_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.billing_cycles
     set payment_reference = coalesce(p_reference, payment_reference),
         payment_url = coalesce(p_url, payment_url)
   where id = p_cycle and status = 'processing';
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.billing_enforce_deadlines()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_defaulted jsonb := '[]'::jsonb;
begin
  for r in
    select c.id, c.user_id from public.billing_cycles c
     where c.status = 'processing' and c.due_at is not null and c.due_at < now()
     for update skip locked
  loop
    update public.billing_cycles set status = 'defaulted'
     where id = r.id and status = 'processing';
    if found then
      update public.profiles set tier = 'wallet'
       where id = r.user_id and tier = 'payngo';
      v_defaulted := v_defaulted || jsonb_build_object('user_id', r.user_id, 'cycle_id', r.id);
    end if;
  end loop;

  -- Backstop for missed cron runs (access is already computed from the
  -- dates at every gate; this just keeps the stored tier honest).
  update public.profiles set tier = 'wallet'
   where tier in ('payngo', 'pro')
     and subscription_expires_at <= now()
     and not exists (
       select 1 from public.billing_cycles c
        where c.user_id = profiles.id and c.status = 'processing' and c.total_amount > 0
     );

  return jsonb_build_object('defaulted', v_defaulted);
end $$;

create or replace function public.billing_settle_cycle(p_cycle bigint, p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.billing_cycles%rowtype;
  v_expiry timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('settle:' || p_cycle::text));

  select * into v_cycle from public.billing_cycles where id = p_cycle for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_cycle.status = 'paid' then
    return jsonb_build_object('ok', true, 'dedupe', true);
  end if;
  if v_cycle.status not in ('processing', 'defaulted', 'open') then
    return jsonb_build_object('ok', false, 'code', 'NOT_PAYABLE', 'status', v_cycle.status);
  end if;

  update public.billing_cycles
     set status = 'paid',
         payment_reference = coalesce(p_reference, payment_reference)
   where id = p_cycle;

  -- Restore + renew: 30 days + the 3 free days.
  update public.profiles
     set tier = 'payngo',
         subscription_expires_at =
           greatest(coalesce(subscription_expires_at, now()), now()) + interval '33 days'
   where id = v_cycle.user_id
   returning subscription_expires_at into v_expiry;

  insert into public.billing_cycles (user_id, start_date, end_date, status)
  select v_cycle.user_id, now(), v_expiry, 'open'
   where not exists (select 1 from public.billing_cycles c
                      where c.user_id = v_cycle.user_id and c.status = 'open');

  insert into public.transactions (user_id, amount, points, type, status, reference, description)
  values (v_cycle.user_id, -v_cycle.total_amount, 0, 'subscription', 'success', p_reference,
          'Pay n Go usage bill #' || p_cycle);

  return jsonb_build_object('ok', true, 'user_id', v_cycle.user_id,
                            'total', v_cycle.total_amount,
                            'subscription_expires_at', v_expiry);
end $$;

-- Runner RPCs are for the server (service_role) only.
revoke execute on function public.billing_close_due_cycles() from public, anon, authenticated;
revoke execute on function public.billing_mark_processing(bigint, text, text) from public, anon, authenticated;
revoke execute on function public.billing_enforce_deadlines() from public, anon, authenticated;
revoke execute on function public.billing_settle_cycle(bigint, text) from public, anon, authenticated;
grant execute on function public.billing_close_due_cycles() to service_role;
grant execute on function public.billing_mark_processing(bigint, text, text) to service_role;
grant execute on function public.billing_enforce_deadlines() to service_role;
grant execute on function public.billing_settle_cycle(bigint, text) to service_role;


-- ============================================================
-- 12. Tier gates on live_requests + deals (defense in depth)
-- ============================================================

-- Live sessions: only active trial / payngo / pro users may post or join.
create or replace function public.enforce_live_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
begin
  if public.is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    v_tier := coalesce(public.effective_tier(new.user_id), 'wallet');
    if v_tier = 'wallet' then
      raise exception 'LIVE_REQUIRES_SUBSCRIPTION';
    end if;
  end if;

  if new.partner_id is not null
     and (tg_op = 'INSERT' or old.partner_id is null) then
    v_tier := coalesce(public.effective_tier(new.partner_id), 'wallet');
    if v_tier = 'wallet' then
      raise exception 'LIVE_REQUIRES_SUBSCRIPTION';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists enforce_live_subscription on public.live_requests;
create trigger enforce_live_subscription
  before insert or update on public.live_requests
  for each row execute function public.enforce_live_subscription();

-- Deals: wallet / expired users cannot queue; trial + payngo are capped
-- (billing_prices.limit_deals_payngo, default 3 open deals); pro is unlimited.
create or replace function public.enforce_deal_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_cap integer;
  v_open integer;
begin
  if public.is_admin() then return new; end if;

  v_tier := coalesce(public.effective_tier(new.user_id), 'wallet');

  if v_tier = 'wallet' then
    raise exception 'DEALS_REQUIRE_SUBSCRIPTION';
  end if;

  if v_tier in ('trial', 'payngo') then
    select amount into v_cap from public.billing_prices where event_type = 'limit_deals_payngo';
    v_cap := coalesce(v_cap, 3);
    select count(*) into v_open
      from public.deals d
     where d.user_id = new.user_id and d.status in ('queued', 'in_progress');
    if v_open >= v_cap then
      raise exception 'DEAL_LIMIT_REACHED';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists enforce_deal_tier on public.deals;
create trigger enforce_deal_tier
  before insert on public.deals
  for each row execute function public.enforce_deal_tier();


-- ============================================================
-- SELF CHECK
-- ============================================================

do $$
declare
  missing text := '';
  n integer;
  f text;
  funcs text[] := array[
    'billing_access', 'billing_summary', 'purchase_library_item', 'activate_plan',
    'billing_close_due_cycles', 'billing_mark_processing',
    'billing_enforce_deadlines', 'billing_settle_cycle', 'effective_tier'
  ];
begin
  -- Columns
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'tier') then
    raise warning 'profiles.tier is MISSING.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'trial_ends_at') then
    raise warning 'profiles.trial_ends_at is MISSING.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'posts' and column_name = 'is_premium') then
    raise warning 'posts.is_premium is MISSING.';
  end if;

  -- Tier sanity
  select count(*) into n from public.profiles where tier is null;
  if n > 0 then raise warning '% profiles still have a NULL tier.', n; end if;
  select count(*) into n from public.profiles where tier = 'trial';
  raise notice 'Profiles on trial right now: %', n;

  -- Prices
  select count(*) into n from public.billing_prices;
  raise notice 'billing_prices rows: % (expected 10).', n;
  for f in
    select t.e from unnest(array['publication','bundle','audiolite','gliim_av','gliim_image',
                                 'live','profile_print','premium_unlock','plan_pro',
                                 'limit_deals_payngo']) as t(e)
  loop
    if not exists (select 1 from public.billing_prices where event_type = f) then
      missing := missing || f || ' ';
    end if;
  end loop;
  if missing <> '' then
    raise warning 'billing_prices is missing: % — re-run this script.', missing;
  else
    raise notice 'All expected prices are seeded.';
  end if;

  -- Tables
  if to_regclass('public.billing_cycles') is null then
    raise warning 'billing_cycles is MISSING.';
  end if;
  if to_regclass('public.billing_events') is null then
    raise warning 'billing_events is MISSING.';
  end if;

  -- Functions
  for f in select unnest(funcs)
  loop
    if not exists (
      select 1 from pg_proc p
       join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.proname = f
    ) then
      raise warning 'Function public.% is MISSING.', f;
    end if;
  end loop;

  -- Triggers
  if not exists (select 1 from pg_trigger where tgname = 'profiles_protect_sensitive') then
    raise warning 'profiles_protect_sensitive trigger is MISSING.';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'enforce_live_subscription') then
    raise warning 'enforce_live_subscription trigger is MISSING (live_requests table?).';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'enforce_deal_tier') then
    raise warning 'enforce_deal_tier trigger is MISSING (deals table?).';
  end if;

  -- Wallet constraint
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_wallet_balance_nonneg' and convalidated = false
  ) then
    raise warning 'profiles_wallet_balance_nonneg exists but is NOT VALIDATED (negative balances present).';
  else
    raise notice 'wallet_balance >= 0 constraint is in place.';
  end if;

  -- Library tables the purchase RPC depends on
  if to_regclass('public.library_items') is null then
    raise warning 'library_items table not found — purchase_library_item will not work.';
  end if;
  if to_regclass('public.purchases') is null then
    raise warning 'purchases table not found — purchase_library_item will not work.';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'library_items'
                and column_name = 'id' and data_type <> 'uuid') then
    raise warning 'library_items.id is not a uuid — purchase_library_item(uuid) needs its signature adjusted.';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'purchases'
                and column_name = 'item_id' and data_type <> 'uuid') then
    raise warning 'purchases.item_id is not a uuid — purchase_library_item(uuid) needs its signature adjusted.';
  end if;

  raise notice '--- BILLING SELF CHECK DONE (review any warnings above) ---';
end $$;

-- Make the functions visible to the API immediately.
notify pgrst, 'reload schema';
