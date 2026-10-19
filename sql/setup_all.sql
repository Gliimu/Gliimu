-- ============================================================
-- Gliimu Platform — Master Setup Script (Fresh Install)
-- ============================================================
-- ONE idempotent script that creates the entire database schema
-- for a brand-new Supabase project.  Safe to run multiple times.
--
-- Covers: extensions, column additions to pre-existing tables,
-- all feed_* tables, billing tables, support/messaging, community,
-- contact, live requests, admin, functions,
-- triggers, RLS policies, seed data, realtime publications,
-- and a comprehensive self-check grid.
--
-- Feed naming convention (used throughout):
--   library_submissions  → feed_submissions
--   library_items        → feed_items
--   posts                → feed_gliims
--   post_contents        → feed_gliim_contents
--   library_contents     → feed_contents
--   hub_interactions     → feed_interactions
-- ============================================================

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================
create extension if not exists pgcrypto;

-- ============================================================
-- 2. COLUMN ADDITIONS TO PRE-EXISTING TABLES
--    (profiles, messages, site_settings — created by Supabase)
-- ============================================================

-- 2a. profiles columns
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists portfolio_image_url text;
alter table public.profiles add column if not exists subscription_plan text;
alter table public.profiles add column if not exists subscription_started_at timestamptz;
alter table public.profiles add column if not exists subscription_expires_at timestamptz;
alter table public.profiles add column if not exists tier text not null default 'trial';
alter table public.profiles add column if not exists trial_ends_at timestamptz;
alter table public.profiles add column if not exists referral_code text;

-- profiles tier check constraint
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_tier_valid'
  ) then
    alter table public.profiles
      add constraint profiles_tier_valid
      check (tier in ('trial','wallet','payngo','pro'));
  end if;
end $$;

-- profiles referral_code unique index
create unique index if not exists idx_profiles_referral_code
  on public.profiles (referral_code) where referral_code is not null;

-- 2b. messages columns
alter table public.messages add column if not exists is_admin boolean not null default false;
alter table public.messages add column if not exists feedback boolean;
alter table public.messages add column if not exists read_at timestamptz;

-- 2c. site_settings columns
alter table public.site_settings add column if not exists hero_video_url text;
alter table public.site_settings add column if not exists hero_fallback_image_url text;
alter table public.site_settings add column if not exists squad_bg_url text;
alter table public.site_settings add column if not exists hero_title text;
alter table public.site_settings add column if not exists hero_highlight text;
alter table public.site_settings add column if not exists hero_desc text;
alter table public.site_settings add column if not exists app_version text;
alter table public.site_settings add column if not exists app_version_notes text;
alter table public.site_settings add column if not exists app_download_bg_url text;
alter table public.site_settings add column if not exists app_windows_url text;
alter table public.site_settings add column if not exists app_mac_url text;
alter table public.site_settings add column if not exists app_linux_url text;
alter table public.site_settings add column if not exists app_android_url text;
alter table public.site_settings add column if not exists app_ios_url text;
alter table public.site_settings add column if not exists app_mobile_qr_url text;

-- 2d. transactions columns (externally-created table)
do $$ begin
  if to_regclass('public.transactions') is not null then
    alter table public.transactions add column if not exists points integer not null default 0;
    alter table public.transactions add column if not exists reference text;
  end if;
exception when others then raise notice 'transactions column check skipped: %', sqlerrm; end $$;


-- ============================================================
-- 3. CORE TABLES
-- ============================================================

-- 3a. faqs
create table if not exists public.faqs (
  id bigserial primary key,
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 3b. legal_documents
create table if not exists public.legal_documents (
  id bigserial primary key,
  slug text not null unique,
  title text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

-- 3c. partners
create table if not exists public.partners (
  id bigserial primary key,
  name text not null,
  logo_url text,
  website_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 3d. reports
create table if not exists public.reports (
  id bigserial primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','user','library_item')),
  target_id uuid not null,
  reason text not null,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);

-- 3e. payment_attempts
create table if not exists public.payment_attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text not null unique,
  gateway text not null,
  amount integer not null,
  status text not null default 'pending' check (status in ('pending','success','failed')),
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- 3f. admin_users
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super','crm','registrar','captain','operations')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id)
);

-- 3g. admin_adjustments
create table if not exists public.admin_adjustments (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('gp','wallet','tier')),
  delta integer,
  new_tier text,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

-- 3h. contact_info
create table if not exists public.contact_info (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  email text,
  whatsapp text,
  telegram text,
  discord text,
  preferred text,
  updated_at timestamptz not null default now(),
  unique(user_id)
);


-- ============================================================
-- 4. FEED TABLES
-- ============================================================

-- 4a. feed_submissions (was library_submissions)
create table if not exists public.feed_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('book','audiolite')),
  title text not null,
  description text,
  price integer,
  cover_url text,
  file_url text,
  blocks jsonb,
  bundle_items jsonb,
  category text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_feed_submissions_user on public.feed_submissions(user_id);
create index if not exists idx_feed_submissions_status on public.feed_submissions(status);
create index if not exists idx_feed_submissions_category on public.feed_submissions(category);

-- 4b. feed_items (was library_items)
create table if not exists public.feed_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('book','audiolite')),
  title text not null,
  description text,
  price integer,
  cover_url text,
  cover_color text,
  sales integer,
  author text,
  author_avatar text,
  owner_id uuid references auth.users(id) on delete set null,
  category text,
  created_at timestamptz not null default now()
);
create index if not exists idx_feed_items_type on public.feed_items(type);
create index if not exists idx_feed_items_owner on public.feed_items(owner_id);
create index if not exists idx_feed_items_category on public.feed_items(category);

-- 4c. feed_gliims (was posts)
create table if not exists public.feed_gliims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  description text,
  cover_url text,
  media_url text,
  media_type text,
  tags text[],
  is_premium boolean not null default false,
  status text not null default 'approved' check (status in ('approved','pending','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  views integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_feed_gliims_user on public.feed_gliims(user_id);
create index if not exists idx_feed_gliims_status on public.feed_gliims(status);
create index if not exists idx_feed_gliims_created on public.feed_gliims(created_at desc);

-- 4d. feed_gliim_contents (was post_contents)
create table if not exists public.feed_gliim_contents (
  post_id uuid primary key references public.feed_gliims(id) on delete cascade,
  blocks jsonb
);

-- 4e. feed_contents (was library_contents)
create table if not exists public.feed_contents (
  item_id uuid primary key references public.feed_items(id) on delete cascade,
  blocks jsonb,
  files jsonb
);

-- 4f. feed_interactions (was hub_interactions)
create table if not exists public.feed_interactions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.feed_gliims(id) on delete cascade,
  interaction_type text not null check (interaction_type in ('like','comment','share','save','support')),
  comment_text text,
  amount integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_feed_interactions_post on public.feed_interactions(post_id);
create index if not exists idx_feed_interactions_user on public.feed_interactions(user_id);
create index if not exists idx_feed_interactions_type on public.feed_interactions(interaction_type);


-- ============================================================
-- 5. BILLING TABLES
-- ============================================================

-- 5a. billing_prices
create table if not exists public.billing_prices (
  id bigserial primary key,
  product text not null,
  cycle text not null,
  amount_ngn integer not null,
  active boolean not null default true,
  unique(product, cycle)
);

-- 5b. billing_cycles
create table if not exists public.billing_cycles (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null,
  cycle text not null,
  amount_ngn integer not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'due' check (status in ('due','processing','settled','void')),
  payment_ref text,
  created_at timestamptz not null default now()
);
create index if not exists idx_billing_cycles_user_status on public.billing_cycles(user_id, status);

-- 5c. billing_events
create table if not exists public.billing_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  item_id text,
  amount_ngn integer,
  gp_amount integer,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_billing_events_user on public.billing_events(user_id);

-- ============================================================
-- 6. SUPPORT / MESSAGING TABLES
-- ============================================================

-- 6a. support_messages
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_user uuid not null,
  sender_id uuid references auth.users(id) on delete set null,
  kind text not null default 'message' check (kind in ('message','system','escalation','handover')),
  content text,
  attachment_url text,
  attachment_type text,
  context jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_support_messages_thread on public.support_messages(thread_user, created_at);

-- 6b. support_reads
create table if not exists public.support_reads (
  thread_user uuid not null,
  reader_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_user, reader_id)
);

-- 6c. admin_chat
create table if not exists public.admin_chat (
  id bigserial primary key,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 7. COMMUNITY / ARENA TABLES
-- ============================================================

-- 7a. contests
create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  metric text not null default 'gp' check (metric in ('gp','reading','engagement','referrals')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  prize_pool integer,
  status text not null default 'draft' check (status in ('draft','active','ended')),
  created_at timestamptz not null default now()
);

-- 7b. contest_entries
create table if not exists public.contest_entries (
  id bigserial primary key,
  contest_id uuid not null references public.contests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score numeric not null default 0,
  joined_at timestamptz not null default now(),
  unique(contest_id, user_id)
);

-- 7c. cohorts
create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  captain_id uuid references auth.users(id) on delete set null,
  max_size integer not null default 10,
  status text not null default 'open' check (status in ('open','closed','archived')),
  created_at timestamptz not null default now()
);

-- 7d. cohort_requests
create table if not exists public.cohort_requests (
  id bigserial primary key,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique(cohort_id, user_id)
);

-- ============================================================
-- 9. LIVE REQUESTS TABLE
-- ============================================================

create table if not exists public.live_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  status text not null default 'waiting' check (status in ('waiting','live','ended','cancelled')),
  viewer_count integer not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_live_requests_status on public.live_requests(status);
create index if not exists idx_live_requests_user on public.live_requests(user_id);

-- ============================================================
-- 11. READING PROGRESS TABLE
-- ============================================================

create table if not exists public.reading_progress (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.feed_items(id) on delete cascade,
  progress numeric not null default 0,
  completed boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id, item_id)
);
create index if not exists idx_reading_progress_user on public.reading_progress(user_id);

-- ============================================================
-- 12. REFERRALS TABLE
-- ============================================================

create table if not exists public.referrals (
  id bigserial primary key,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  vested_at timestamptz,
  created_at timestamptz not null default now(),
  unique(referred_id)
);
create index if not exists idx_referrals_referrer on public.referrals(referrer_id);


-- ============================================================
-- 13. FUNCTIONS — ADMIN / AUTH
-- ============================================================

-- 13a. is_admin() — checks admin_users table
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  );
end;
$$;

-- 13b. admin_role()
create or replace function public.admin_role()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return (select role from public.admin_users where user_id = auth.uid());
end;
$$;

-- 13c. admin_has_role(p_user_id, p_role)
create or replace function public.admin_has_role(p_user uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.admin_users where user_id = p_user;
  if v_role is null then return false; end if;
  if v_role = 'super' then return true; end if;
  return v_role = p_role;
end;
$$;

-- 13d. current_admin_role()
create or replace function public.current_admin_role()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return (select role from public.admin_users where user_id = auth.uid());
end;
$$;

-- 13e. guard_is_admin trigger
create or replace function public.guard_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin and not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_is_admin on public.profiles;
create trigger trg_guard_is_admin
  before update of is_admin on public.profiles
  for each row execute function public.guard_is_admin();

-- ============================================================
-- 14. FUNCTIONS — FEED / CONTENT
-- ============================================================

-- 14a. mark_dm_read()
drop function if exists public.mark_dm_read(uuid);
create or replace function public.mark_dm_read(p_other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages
     set read_at = now()
   where room_id = (
     select id from public.messages
     where sender_id = auth.uid() and recipient_id = p_other
     limit 1
   )
     and recipient_id = auth.uid()
     and read_at is null;
end;
$$;

-- 14b. bump_live_views()
drop function if exists public.bump_live_views(uuid);
create or replace function public.bump_live_views(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.live_requests
     set viewer_count = viewer_count + 1
   where id = p_request;
end;
$$;

-- 14c. bump_post_views() — uses feed_gliims
drop function if exists public.bump_post_views(uuid);
create or replace function public.bump_post_views(p_post uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.feed_gliims
     set views = views + 1
   where id = p_post;
end;
$$;

-- 14d. top_uploader() — uses feed_gliims, feed_submissions
create or replace function public.top_uploader()
returns table(user_id uuid, post_count bigint, submission_count bigint, total bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with posts_agg as (
    select g.user_id, count(*) as post_count
    from public.feed_gliims g
    where g.status = 'approved'
    group by g.user_id
  ),
  subs_agg as (
    select s.user_id, count(*) as submission_count
    from public.feed_submissions s
    where s.status = 'approved'
    group by s.user_id
  )
  select coalesce(p.user_id, s.user_id) as user_id,
         coalesce(p.post_count, 0) as post_count,
         coalesce(s.submission_count, 0) as submission_count,
         coalesce(p.post_count, 0) + coalesce(s.submission_count, 0) as total
  from posts_agg p
  full outer join subs_agg s on s.user_id = p.user_id
  order by total desc
  limit 10;
end;
$$;

-- 14e. set_feed_gliim_status() — auto-publish bundles
create or replace function public.set_feed_gliim_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Bundles (gliims) auto-publish without approval.
  -- Books and audiolites go through feed_submissions review flow.
  new.status := 'approved';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.review_note := null;
  return new;
end;
$$;


-- ============================================================
-- 15. FUNCTIONS — BILLING
-- ============================================================

-- 15a. effective_tier(p_user_id)
drop function if exists public.effective_tier(uuid);
create or replace function public.effective_tier(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_trial_ends timestamptz;
begin
  select tier, trial_ends_at into v_tier, v_trial_ends
  from public.profiles where id = p_user;

  if v_tier = 'trial' and v_trial_ends is not null and v_trial_ends < now() then
    return 'wallet';
  end if;
  return v_tier;
end;
$$;

-- 15b. billing_access(p_kind, p_action, p_table, p_item_id)
create or replace function public.billing_access(
  p_kind text, p_action text, p_table text, p_item_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_tier text;
begin
  if v_user is null then return false; end if;
  v_tier := public.effective_tier(v_user);

  -- Free tier: read-only on public content
  if p_action = 'read' and v_tier in ('trial','wallet') then
    return true;
  end if;

  -- Premium gliim content unlock check
  if p_table = 'feed_gliim_contents' and p_item_id is not null then
    if v_tier = 'pro' then return true; end if;
    -- Check if user purchased this specific gliim
    return exists (
      select 1 from public.billing_events
      where user_id = v_user
        and event_type = 'premium_unlock'
        and item_id = p_item_id::text
    );
  end if;

  -- Feed item (book/audiolite) unlock check
  if p_table = 'feed_contents' and p_item_id is not null then
    if v_tier = 'pro' then return true; end if;
    return exists (
      select 1 from public.billing_events
      where user_id = v_user
        and event_type = 'library_unlock'
        and item_id = p_item_id::text
    );
  end if;

  -- Pro tier: full access
  if v_tier = 'pro' then return true; end if;

  return false;
end;
$$;

-- 15c. billing_summary()
create or replace function public.billing_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  return (
    select jsonb_build_object(
      'tier', public.effective_tier(v_user),
      'wallet_balance', coalesce(p.wallet_balance, 0),
      'total_gp', coalesce(p.total_gp, 0),
      'subscription_plan', p.subscription_plan,
      'subscription_expires_at', p.subscription_expires_at
    )
    from public.profiles p where p.id = v_user
  );
end;
$$;

-- 15d. purchase_library_item(p_item_id) — uses feed_items
drop function if exists public.purchase_library_item(uuid);
create or replace function public.purchase_library_item(p_item uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_price integer;
  v_balance integer;
begin
  select price into v_price from public.feed_items where id = p_item;
  if v_price is null then
    return jsonb_build_object('ok', false, 'error', 'ITEM_NOT_FOUND');
  end if;

  select wallet_balance into v_balance from public.profiles where id = v_user;
  if coalesce(v_balance, 0) < v_price then
    return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_FUNDS');
  end if;

  update public.profiles
     set wallet_balance = wallet_balance - v_price
   where id = v_user;

  insert into public.billing_events (user_id, event_type, item_id, gp_amount)
  values (v_user, 'library_unlock', p_item::text, v_price);

  return jsonb_build_object('ok', true, 'item_id', p_item);
end;
$$;

-- 15e. activate_plan(p_plan)
create or replace function public.activate_plan(p_plan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if p_plan not in ('pro','payngo') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PLAN');
  end if;

  update public.profiles
     set tier = p_plan,
         subscription_plan = p_plan,
         subscription_started_at = now()
   where id = v_user;

  return jsonb_build_object('ok', true, 'plan', p_plan);
end;
$$;

-- 15f. credit_wallet_topup(p_user, p_amount, p_reference, p_provider)
drop function if exists public.credit_wallet_topup(integer);
drop function if exists public.credit_wallet_topup(uuid, integer, text, text);
create or replace function public.credit_wallet_topup(
  p_user uuid, p_amount integer, p_reference text, p_provider text default 'paystack'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount < 100 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_reference is null or length(trim(p_reference)) = 0 then
    raise exception 'INVALID_REFERENCE';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'INVALID_USER';
  end if;

  perform pg_advisory_xact_lock(hashtext('topup:' || p_reference)::bigint);

  if exists (
    select 1 from public.transactions
    where reference = p_reference
      and type = 'topup'
      and status = 'success'
  ) then
    return jsonb_build_object('credited', false, 'reason', 'duplicate');
  end if;

  insert into public.transactions (user_id, amount, points, type, status, reference, description)
  values (p_user, p_amount, 0, 'topup', 'success', p_reference,
          'Wallet Top-up via ' || coalesce(p_provider, 'paystack'));

  update public.profiles
  set wallet_balance = coalesce(wallet_balance, 0) + p_amount
  where id = p_user
  returning wallet_balance into v_balance;

  return jsonb_build_object('credited', true, 'amount', p_amount, 'balance', v_balance);
end;
$$;

-- 15g. billing_close_due_cycles()
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

  for r in
    select p.id from public.profiles p
     where p.tier = 'payngo' and p.subscription_expires_at <= now()
     for update skip locked
  loop
    select c.* into v_cycle from public.billing_cycles c
     where c.user_id = r.id and c.status = 'open' limit 1;

    if not found then
      if exists (select 1 from public.billing_cycles c
                  where c.user_id = r.id and c.status in ('processing', 'defaulted')
                    and c.total_amount > 0) then
        update public.profiles set tier = 'wallet' where id = r.id and tier = 'payngo';
        continue;
      end if;

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
end;
$$;

-- 15h. billing_mark_processing(p_cycle, p_reference, p_url)
drop function if exists public.billing_mark_processing();
drop function if exists public.billing_mark_processing(bigint, text, text);
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
end;
$$;

-- 15i. billing_enforce_deadlines()
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

  update public.profiles set tier = 'wallet'
   where tier in ('payngo', 'pro')
     and subscription_expires_at <= now()
     and not exists (
       select 1 from public.billing_cycles c
        where c.user_id = profiles.id and c.status = 'processing' and c.total_amount > 0
     );

  return jsonb_build_object('defaulted', v_defaulted);
end;
$$;

-- 15j. billing_settle_cycle(p_cycle, p_reference)
drop function if exists public.billing_settle_cycle(bigint, text);
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
          'Use n'' Pay usage bill #' || p_cycle);

  return jsonb_build_object('ok', true, 'user_id', v_cycle.user_id,
                            'total', v_cycle.total_amount,
                            'subscription_expires_at', v_expiry);
end;
$$;


-- ============================================================
-- 16. FUNCTIONS — SUPPORT / MESSAGING
-- ============================================================

-- 16a. send_support(p_body, p_context)
create or replace function public.send_support(p_body text, p_context jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_thread uuid;
  v_post_count integer;
  v_interaction_count integer;
begin
  -- Create or reuse thread (thread_user = user_id for simplicity)
  v_thread := v_user;

  insert into public.support_messages (thread_user, sender_id, kind, content, context)
  values (v_thread, v_user, 'message', p_body, p_context);

  -- Include user stats in context
  select count(*) into v_post_count from public.feed_gliims where user_id = v_user;
  select count(*) into v_interaction_count from public.feed_interactions where user_id = v_user;

  return jsonb_build_object(
    'ok', true,
    'thread_id', v_thread,
    'user_stats', jsonb_build_object('posts', v_post_count, 'interactions', v_interaction_count)
  );
end;
$$;

-- 16b. support_handover(p_thread, p_target)
create or replace function public.support_handover(p_thread uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.support_messages (thread_user, sender_id, kind, content)
  values (p_thread, auth.uid(), 'handover', jsonb_build_object('to', p_target)::text);
end;
$$;

-- 16c. support_can_view(p_user)
create or replace function public.support_can_view(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  -- Thread owner can always view
  if v_user = p_user then return true; end if;
  -- All admin roles can view support threads
  return public.admin_has_role(v_user, 'crm')
      or public.admin_has_role(v_user, 'super')
      or public.admin_has_role(v_user, 'registrar')
      or public.admin_has_role(v_user, 'captain')
      or public.admin_has_role(v_user, 'operations');
end;
$$;

-- 16d. support_thread_unread(p_thread_user)
create or replace function public.support_thread_unread(p_thread_user uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer
    from public.support_messages m
   where m.thread_user = p_thread_user
     and m.sender_id <> auth.uid()
     and m.created_at > coalesce(
           (select r.last_read_at from public.support_reads r
             where r.thread_user = p_thread_user and r.reader_id = auth.uid()),
           '-infinity'::timestamptz);
$$;

-- 16e. support_mark_read(p_thread_user)
create or replace function public.support_mark_read(p_thread_user uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.support_reads
     set last_read_at = now()
   where thread_user = p_thread_user
     and reader_id = auth.uid()
     and last_read_at < now();

  insert into public.support_reads (thread_user, reader_id, last_read_at)
  values (p_thread_user, auth.uid(), now())
  on conflict (thread_user, reader_id) do nothing;
end;
$$;

-- 16f. support_inbox()
create or replace function public.support_inbox()
returns table(
  thread_user uuid,
  member_name text,
  member_avatar text,
  last_content text,
  last_is_staff boolean,
  last_created_at timestamptz,
  unread integer,
  message_count integer,
  escalations integer
)
language sql
stable security definer
set search_path = public
as $$
  select m.thread_user,
         coalesce(p.full_name, 'Gliimait'),
         p.avatar_url,
         last_msg.content,
         last_msg.is_staff,
         last_msg.created_at,
         unread.n::integer,
         cnt.n::integer,
         esc.n::integer
    from (select distinct thread_user from public.support_messages) m
    left join public.profiles p on p.id = m.thread_user
    cross join lateral (
      select s.content,
             coalesce(s.sender_id <> s.thread_user, false) as is_staff,
             s.created_at
        from public.support_messages s
       where s.thread_user = m.thread_user
       order by s.created_at desc
       limit 1
    ) last_msg
    cross join lateral (
      select count(*) n
        from public.support_messages s
       where s.thread_user = m.thread_user
    ) cnt
    cross join lateral (
      select count(*) n
        from public.support_messages s
       where s.thread_user = m.thread_user
         and s.kind = 'message'
         and s.sender_id <> auth.uid()
         and s.created_at > coalesce(
               (select r.last_read_at from public.support_reads r
                 where r.thread_user = m.thread_user and r.reader_id = auth.uid()),
               '-infinity'::timestamptz)
    ) unread
    cross join lateral (
      select count(*) n
        from public.support_messages s
       where s.thread_user = m.thread_user
         and s.kind = 'escalation'
         and s.created_at > coalesce(
               (select r.last_read_at from public.support_reads r
                 where r.thread_user = m.thread_user and r.reader_id = auth.uid()),
               '-infinity'::timestamptz)
    ) esc
   where public.support_can_view(auth.uid());
$$;

-- 16g. support_last_staff_at(p_thread_user)
create or replace function public.support_last_staff_at(p_thread_user uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
begin
  return (
    select max(created_at) from public.support_messages
    where thread_user = p_thread_user
      and sender_id in (select user_id from public.admin_users)
  );
end;
$$;

-- 16h. gliimpa_paused(p_thread_user)
create or replace function public.gliimpa_paused(p_thread_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_staff timestamptz;
begin
  select public.support_last_staff_at(p_thread_user) into v_last_staff;
  -- Bot is paused if staff responded within last 5 minutes
  return v_last_staff is not null and v_last_staff > now() - interval '5 minutes';
end;
$$;

-- 16i. gliimpa_escalate(p_thread_user)
create or replace function public.gliimpa_escalate(p_thread_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.support_messages (thread_user, sender_id, kind, content)
  values (p_thread_user, auth.uid(), 'escalation', 'Escalated to human agent');
end;
$$;


-- ============================================================
-- 17. FUNCTIONS — COMMUNITY / ARENA
-- ============================================================

-- 17a. contest_score(p_contest_id)
create or replace function public.contest_score(p_contest_id uuid)
returns table(user_id uuid, score numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metric text;
begin
  select metric into v_metric from public.contests where id = p_contest_id;

  if v_metric = 'gp' then
    return query
    select p.id, coalesce(p.total_gp, 0)::numeric
    from public.profiles p
    where exists (select 1 from public.contest_entries ce where ce.contest_id = p_contest_id and ce.user_id = p.id);
  elsif v_metric = 'reading' then
    return query
    select rp.user_id, count(*)::numeric
    from public.reading_progress rp
    where rp.completed
      and exists (select 1 from public.contest_entries ce where ce.contest_id = p_contest_id and ce.user_id = rp.user_id)
    group by rp.user_id;
  elsif v_metric = 'engagement' then
    return query
    select fi.user_id, count(*)::numeric
    from public.feed_interactions fi
    where exists (select 1 from public.contest_entries ce where ce.contest_id = p_contest_id and ce.user_id = fi.user_id)
    group by fi.user_id;
  elsif v_metric = 'referrals' then
    return query
    select r.referrer_id, count(*)::numeric
    from public.referrals r
    where r.vested_at is not null
      and exists (select 1 from public.contest_entries ce where ce.contest_id = p_contest_id and ce.user_id = r.referrer_id)
    group by r.referrer_id;
  end if;
end;
$$;

-- 17b. contest_leaderboard(p_contest_id, p_limit)
create or replace function public.contest_leaderboard(p_contest_id uuid, p_limit integer default 50)
returns table(rank bigint, user_id uuid, score numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select row_number() over (order by s.score desc), s.user_id, s.score
  from public.contest_score(p_contest_id) s
  order by s.score desc
  limit p_limit;
end;
$$;

-- 17c. community_board()
create or replace function public.community_board()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'contests', (select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'status', c.status, 'metric', c.metric))
                 from public.contests c where c.status = 'active'),
    'events', '[]'::jsonb,
    'news', '[]'::jsonb
  );
end;
$$;

-- 17d. contest_join(p_contest_id)
create or replace function public.contest_join(p_contest_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.contest_entries (contest_id, user_id)
  values (p_contest_id, auth.uid())
  on conflict (contest_id, user_id) do nothing;
end;
$$;

-- 17e. cohort_request(p_cohort_id)
create or replace function public.cohort_request(p_cohort_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cohort_requests (cohort_id, user_id)
  values (p_cohort_id, auth.uid())
  on conflict (cohort_id, user_id) do nothing;
end;
$$;

-- ============================================================
-- 18. FUNCTIONS — ADMIN RPCs
-- ============================================================

-- 18a. admin_review_submission(p_id, p_status, p_note)
create or replace function public.admin_review_submission(p_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_submission record;
  v_item_id uuid;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_submission from public.feed_submissions where id = p_id;
  if v_submission is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  update public.feed_submissions
     set status = p_status,
         reviewed_by = v_caller,
         reviewed_at = now(),
         review_note = p_note
   where id = p_id;

  if p_status = 'approved' then
    insert into public.feed_items (type, title, description, price, cover_url, author, author_avatar, owner_id, category)
    select v_submission.type, v_submission.title, v_submission.description, v_submission.price, v_submission.cover_url,
           p.full_name, p.avatar_url, v_submission.user_id, v_submission.category
    from public.profiles p
    where p.id = v_submission.user_id
    returning id into v_item_id;

    if v_submission.blocks is not null or v_submission.bundle_items is not null then
      insert into public.feed_contents (item_id, blocks, files)
      values (v_item_id, v_submission.blocks, v_submission.bundle_items);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'item_id', v_item_id);
end;
$$;

-- 18b. admin_resolve_report(p_report_id, p_status)
create or replace function public.admin_resolve_report(p_report_id bigint, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.reports
     set status = p_status,
         resolved_at = now(),
         resolved_by = auth.uid()
   where id = p_report_id;
end;
$$;

-- 18c. admin_grant_role(p_user_id, p_role)
create or replace function public.admin_grant_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.admin_has_role(auth.uid(), 'super')) then
    raise exception 'PERMISSION_DENIED';
  end if;

  insert into public.admin_users (user_id, role, granted_by)
  values (p_user_id, p_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role;
end;
$$;

-- 18d. admin_revoke_role(p_user_id)
create or replace function public.admin_revoke_role(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.admin_has_role(auth.uid(), 'super')) then
    raise exception 'PERMISSION_DENIED';
  end if;

  delete from public.admin_users where user_id = p_user_id;
end;
$$;

-- 18e. admin_list_admins()
create or replace function public.admin_list_admins()
returns table(user_id uuid, role text, granted_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  return query
  select au.user_id, au.role, au.granted_at
  from public.admin_users au
  order by au.granted_at desc;
end;
$$;

-- 18f. admin_list_pending_posts()
create or replace function public.admin_list_pending_posts()
returns table(id uuid, title text, user_id uuid, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  return query
  select g.id, g.title, g.user_id, g.status, g.created_at
  from public.feed_gliims g
  where g.status = 'pending'
  order by g.created_at desc;
end;
$$;

-- 18g. admin_review_post(p_id, p_status, p_note)
create or replace function public.admin_review_post(p_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.feed_gliims
     set status = p_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = p_note
   where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
-- 19. FUNCTIONS — REGISTRAR
-- ============================================================

-- 19a. registrar_overview()
create or replace function public.registrar_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_has_role(auth.uid(), 'registrar') then
    raise exception 'PERMISSION_DENIED';
  end if;

  return jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'total_gp', (select coalesce(sum(total_gp), 0) from public.profiles),
    'total_wallet', (select coalesce(sum(wallet_balance), 0) from public.profiles),
    'feed_items', (select count(*) from public.feed_items),
    'feed_gliims', (select count(*) from public.feed_gliims where status = 'approved'),
    'pending_submissions', (select count(*) from public.feed_submissions where status = 'pending')
  );
end;
$$;

-- 19b. registrar_member(p_user_id)
create or replace function public.registrar_member(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_has_role(auth.uid(), 'registrar') then
    raise exception 'PERMISSION_DENIED';
  end if;

  return (
    select jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'wallet_balance', coalesce(p.wallet_balance, 0),
      'total_gp', coalesce(p.total_gp, 0),
      'tier', p.tier,
      'feed_items', (select count(*) from public.feed_items where owner_id = p.id),
      'feed_gliims', (select count(*) from public.feed_gliims where user_id = p.id and status = 'approved'),
      'joined_at', p.created_at
    )
    from public.profiles p where p.id = p_user_id
  );
end;
$$;

-- 19c. registrar_revenue(p_days)
create or replace function public.registrar_revenue(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_has_role(auth.uid(), 'registrar') then
    raise exception 'PERMISSION_DENIED';
  end if;

  return jsonb_build_object(
    'period_days', p_days,
    'billing_events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'event_type', event_type,
        'count', cnt,
        'total_ngn', coalesce(total_ngn, 0),
        'total_gp', coalesce(total_gp, 0)
      )), '[]'::jsonb)
      from (
        select event_type, count(*) as cnt,
               sum(amount_ngn) as total_ngn,
               sum(gp_amount) as total_gp
        from public.billing_events
        where created_at > now() - (p_days || ' days')::interval
        group by event_type
      ) sub
    )
  );
end;
$$;

-- 19d. registrar_adjustment helpers
create or replace function public.registrar_adjust_gp(p_user_id uuid, p_delta integer, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_has_role(auth.uid(), 'registrar') then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.profiles
     set total_gp = coalesce(total_gp, 0) + p_delta
   where id = p_user_id;

  insert into public.admin_adjustments (user_id, kind, delta, note, created_by)
  values (p_user_id, 'gp', p_delta, p_note, auth.uid());
end;
$$;

-- 19e. registrar_adjust_wallet
create or replace function public.registrar_adjust_wallet(p_user_id uuid, p_delta integer, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_has_role(auth.uid(), 'registrar') then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.profiles
     set wallet_balance = coalesce(wallet_balance, 0) + p_delta
   where id = p_user_id;

  insert into public.admin_adjustments (user_id, kind, delta, note, created_by)
  values (p_user_id, 'wallet', p_delta, p_note, auth.uid());
end;
$$;

-- 19f. registrar_adjust_tier
create or replace function public.registrar_adjust_tier(p_user_id uuid, p_new_tier text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_has_role(auth.uid(), 'registrar') then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.profiles
     set tier = p_new_tier
   where id = p_user_id;

  insert into public.admin_adjustments (user_id, kind, new_tier, note, created_by)
  values (p_user_id, 'tier', null, p_note, auth.uid());
end;
$$;

-- ============================================================
-- 20. FUNCTIONS — OPERATIONS
-- ============================================================

-- 20a. is_safe_url(p_url)
create or replace function public.is_safe_url(p_url text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_url is null or p_url = '' then return true; end if;
  return p_url ~ '^https?://';
end;
$$;

-- 20b. operations_get_settings()
create or replace function public.operations_get_settings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_has_role(auth.uid(), 'operations') then
    raise exception 'PERMISSION_DENIED';
  end if;

  return (
    select jsonb_build_object(
      'hero_video_url', hero_video_url,
      'hero_fallback_image_url', hero_fallback_image_url,
      'squad_bg_url', squad_bg_url,
      'hero_title', hero_title,
      'hero_highlight', hero_highlight,
      'hero_desc', hero_desc,
      'app_version', app_version,
      'app_version_notes', app_version_notes,
      'app_download_bg_url', app_download_bg_url,
      'app_windows_url', app_windows_url,
      'app_mac_url', app_mac_url,
      'app_linux_url', app_linux_url,
      'app_android_url', app_android_url,
      'app_ios_url', app_ios_url,
      'app_mobile_qr_url', app_mobile_qr_url
    )
    from public.site_settings limit 1
  );
end;
$$;

-- 20c. operations_update_setting
create or replace function public.operations_update_setting(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_has_role(auth.uid(), 'operations') then
    raise exception 'PERMISSION_DENIED';
  end if;

  if not public.is_safe_url(p_value) then
    raise exception 'UNSAFE_URL';
  end if;

  execute format('update public.site_settings set %I = %L', p_key, p_value);
end;
$$;

-- 20d. operations_landing_data()
create or replace function public.operations_landing_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return (
    select jsonb_build_object(
      'settings', public.operations_get_settings(),
      'partners', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'logo_url', logo_url, 'website_url', website_url)),'[]'::jsonb)
                   from public.partners order by sort_order),
      'faqs', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'question', question, 'answer', answer)),'[]'::jsonb)
               from public.faqs order by sort_order)
    )
  );
end;
$$;

-- 20e. operations_partner_upsert
create or replace function public.operations_partner_upsert(p_id bigint default null, p_name text, p_logo_url text, p_website_url text, p_sort integer default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_has_role(auth.uid(), 'operations') then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_id is null then
    insert into public.partners (name, logo_url, website_url, sort_order)
    values (p_name, p_logo_url, p_website_url, p_sort);
  else
    update public.partners
       set name = p_name, logo_url = p_logo_url, website_url = p_website_url, sort_order = p_sort
     where id = p_id;
  end if;
end;
$$;

-- 20f. operations_partner_delete
create or replace function public.operations_partner_delete(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_has_role(auth.uid(), 'operations') then
    raise exception 'PERMISSION_DENIED';
  end if;

  delete from public.partners where id = p_id;
end;
$$;

-- 20g. operations_faq_upsert
create or replace function public.operations_faq_upsert(p_id bigint default null, p_question text, p_answer text, p_sort integer default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_has_role(auth.uid(), 'operations') then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_id is null then
    insert into public.faqs (question, answer, sort_order)
    values (p_question, p_answer, p_sort);
  else
    update public.faqs
       set question = p_question, answer = p_answer, sort_order = p_sort
     where id = p_id;
  end if;
end;
$$;

-- 20h. operations_faq_delete
create or replace function public.operations_faq_delete(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_has_role(auth.uid(), 'operations') then
    raise exception 'PERMISSION_DENIED';
  end if;

  delete from public.faqs where id = p_id;
end;
$$;

-- ============================================================
-- 21. FUNCTIONS — WALLET / GP
-- ============================================================

-- 21a. increment_wallet(p_user_id, p_amount)
do $$ begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'increment_wallet'
  ) then
    execute $fn$
      create function public.increment_wallet(user_id uuid, amount integer)
      returns void
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        update public.profiles
           set wallet_balance = coalesce(wallet_balance, 0) + increment_wallet.amount
         where id = increment_wallet.user_id;
      end;
      $body$;
    $fn$;
  end if;
end $$;

-- 21b. add_gp(p_target_user_id, p_points_to_add)
do $$ begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'add_gp'
  ) then
    execute $fn$
      create function public.add_gp(target_user_id uuid, points_to_add integer)
      returns void
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        update public.profiles
           set total_gp = coalesce(total_gp, 0) + add_gp.points_to_add
         where id = add_gp.target_user_id;
      end;
      $body$;
    $fn$;
  end if;
end $$;

-- Revoke public/execute, grant to authenticated/service_role
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('increment_wallet', 'add_gp')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- ============================================================
-- 22. FUNCTIONS — REFERRALS
-- ============================================================

-- 22a. make_referral_code()
create or replace function public.make_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
  v_i integer;
begin
  for v_i in 1..8 loop
    v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
  end loop;
  return v_code;
end;
$$;

-- 22b. profiles_assign_referral_code() trigger
create or replace function public.profiles_assign_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referral_code is null then
    new.referral_code := public.make_referral_code();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_assign_referral_code on public.profiles;
create trigger trg_profiles_assign_referral_code
  before insert on public.profiles
  for each row execute function public.profiles_assign_referral_code();

-- 22c. apply_referral(p_code)
create or replace function public.apply_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_referrer uuid;
begin
  select id into v_referrer from public.profiles where referral_code = p_code;
  if v_referrer is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_CODE');
  end if;
  if v_referrer = v_user then
    return jsonb_build_object('ok', false, 'error', 'SELF_REFERRAL');
  end if;

  insert into public.referrals (referrer_id, referred_id, code)
  values (v_referrer, v_user, p_code)
  on conflict (referred_id) do nothing;

  return jsonb_build_object('ok', true, 'referrer_id', v_referrer);
end;
$$;

-- 22d. referral_vest_due()
create or replace function public.referral_vest_due()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with vested as (
    update public.referrals
       set vested_at = now()
     where vested_at is null
       and created_at < now() - interval '30 days'
    returning id
  )
  select count(*) into v_count from vested;
  return v_count;
end;
$$;

-- 22e. referral_summary()
create or replace function public.referral_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  return (
    select jsonb_build_object(
      'code', p.referral_code,
      'total_referred', (select count(*) from public.referrals where referrer_id = v_user),
      'vested', (select count(*) from public.referrals where referrer_id = v_user and vested_at is not null),
      'pending', (select count(*) from public.referrals where referrer_id = v_user and vested_at is null)
    )
    from public.profiles p where p.id = v_user
  );
end;
$$;

-- ============================================================
-- 23. FUNCTIONS — READING
-- ============================================================

-- 23a. complete_reading(p_item_id)
create or replace function public.complete_reading(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_already boolean;
begin
  select completed into v_already
  from public.reading_progress
  where user_id = v_user and item_id = p_item_id;

  if v_already is null then
    insert into public.reading_progress (user_id, item_id, progress, completed, completed_at)
    values (v_user, p_item_id, 100, true, now());
  elsif not v_already then
    update public.reading_progress
       set progress = 100, completed = true, completed_at = now()
     where user_id = v_user and item_id = p_item_id;
  else
    return jsonb_build_object('ok', true, 'already_completed', true);
  end if;

  -- Award GP for completing reading
  update public.profiles
     set total_gp = coalesce(total_gp, 0) + 10
   where id = v_user;

  return jsonb_build_object('ok', true, 'gp_awarded', 10);
end;
$$;

-- 23b. related_publications(p_item_id, p_limit)
create or replace function public.related_publications(p_item_id uuid, p_limit integer default 5)
returns table(id uuid, title text, cover_url text, type text, author text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
begin
  select category into v_category
  from public.feed_items where id = p_item_id;

  return query
  select fi.id, fi.title, fi.cover_url, fi.type, fi.author
  from public.feed_items fi
  where fi.id <> p_item_id
    and fi.category = v_category
  order by fi.created_at desc
  limit p_limit;
end;
$$;

-- ============================================================
-- 24. FUNCTIONS — ADMIN DELETE FEED ITEM
-- ============================================================

create or replace function public.admin_delete_feed_item(
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_can_delete boolean;
  v_is_gliim boolean;
  v_is_feed_item boolean;
  v_owner_id uuid;
  v_title text;
  v_type text;
begin
  select (public.is_admin() or public.admin_has_role(v_caller, 'crm')) into v_can_delete;
  if not v_can_delete then
    raise exception 'PERMISSION_DENIED';
  end if;

  select exists (select 1 from public.feed_gliims where id = p_item_id) into v_is_gliim;
  select exists (select 1 from public.feed_items where id = p_item_id) into v_is_feed_item;

  if not v_is_gliim and not v_is_feed_item then
    if exists (select 1 from public.feed_submissions where id = p_item_id) then
      delete from public.feed_submissions where id = p_item_id;
      return jsonb_build_object('deleted', true, 'item_id', p_item_id, 'type', 'submission');
    end if;
  end if;

  if not v_is_gliim and not v_is_feed_item then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  if v_is_gliim then
    delete from public.feed_interactions where post_id = p_item_id;
    delete from public.billing_events where event_type = 'premium_unlock' and item_id = p_item_id::text;
    delete from public.reports where target_type = 'post' and target_id = p_item_id;
    delete from public.feed_gliims where id = p_item_id;
    return jsonb_build_object('deleted', true, 'item_id', p_item_id, 'type', 'gliim');
  else
    select fi.owner_id, fi.title, fi.type into v_owner_id, v_title, v_type
      from public.feed_items fi where fi.id = p_item_id;
    delete from public.saved_items where item_id = p_item_id;
    delete from public.purchases where item_id = p_item_id;
    delete from public.billing_events where event_type = 'premium_unlock' and item_id = p_item_id::text;
    delete from public.reports where target_type = 'library_item' and target_id = p_item_id;
    delete from public.feed_items where id = p_item_id;
    if v_owner_id is not null then
      delete from public.feed_submissions
        where user_id = v_owner_id and title = v_title and type = v_type and status = 'approved';
    end if;
    return jsonb_build_object('deleted', true, 'item_id', p_item_id, 'type', 'feed_item');
  end if;

exception
  when others then
    return jsonb_build_object('deleted', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.admin_delete_feed_item(uuid) to authenticated;

-- 26b. user_delete_feed_item — owner-initiated delete for books / audiolites
-- Password is verified client-side via signInWithPassword (same pattern as
-- gliim delete). This RPC only checks ownership and cleans up related rows.
create or replace function public.user_delete_feed_item(
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_owner  uuid;
  v_title  text;
  v_type   text;
begin
  select fi.owner_id, fi.title, fi.type into v_owner, v_title, v_type
  from public.feed_items fi
  where fi.id = p_item_id;

  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  if v_owner is distinct from v_caller then
    raise exception 'NOT_OWNER';
  end if;

  delete from public.saved_items where item_id = p_item_id;
  delete from public.purchases where item_id = p_item_id;
  delete from public.billing_events where event_type in ('premium_unlock','library_unlock') and item_id = p_item_id::text;
  delete from public.reports where target_type = 'library_item' and target_id = p_item_id;
  delete from public.feed_items where id = p_item_id;
  delete from public.feed_submissions
    where user_id = v_owner and title = v_title and type = v_type and status = 'approved';

  return jsonb_build_object('deleted', true, 'item_id', p_item_id);

exception
  when others then
    return jsonb_build_object('deleted', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.user_delete_feed_item(uuid) to authenticated;

-- ============================================================
-- 27. FUNCTIONS — CONTACT
-- ============================================================

-- 27a. crm_contact(p_user_id)
create or replace function public.crm_contact(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  return (
    select coalesce(
      jsonb_build_object(
        'full_name', full_name, 'phone', phone, 'email', email,
        'whatsapp', whatsapp, 'telegram', telegram, 'discord', discord,
        'preferred', preferred
      ),
      'null'::jsonb
    )
    from public.contact_info where user_id = p_user_id
  );
end;
$$;

-- 27b. crm_set_contact(p_full_name, p_phone, p_email, p_whatsapp, p_telegram, p_discord, p_preferred)
create or replace function public.crm_set_contact(
  p_full_name text default null,
  p_phone text default null,
  p_email text default null,
  p_whatsapp text default null,
  p_telegram text default null,
  p_discord text default null,
  p_preferred text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  insert into public.contact_info (user_id, full_name, phone, email, whatsapp, telegram, discord, preferred, updated_at)
  values (v_user, p_full_name, p_phone, p_email, p_whatsapp, p_telegram, p_discord, p_preferred, now())
  on conflict (user_id) do update
     set full_name = excluded.full_name,
         phone = excluded.phone,
         email = excluded.email,
         whatsapp = excluded.whatsapp,
         telegram = excluded.telegram,
         discord = excluded.discord,
         preferred = excluded.preferred,
         updated_at = now();
end;
$$;

-- ============================================================
-- 28. FUNCTIONS — CONTENT LOCK CHECKS
-- ============================================================

-- 28a. post_content_unlocked(p_post_id) — uses feed_gliims
create or replace function public.post_content_unlocked(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_is_premium boolean;
begin
  if v_user is null then return false; end if;

  select is_premium into v_is_premium from public.feed_gliims where id = p_post_id;
  if not v_is_premium then return true; end if;

  -- Pro tier unlocks everything
  if public.effective_tier(v_user) = 'pro' then return true; end if;

  -- Check if user purchased this specific gliim
  return exists (
    select 1 from public.billing_events
    where user_id = v_user
      and event_type = 'premium_unlock'
      and item_id = p_post_id::text
  );
end;
$$;

-- 28b. library_item_unlocked(p_item_id) — uses feed_items
create or replace function public.library_item_unlocked(p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return false; end if;

  -- Owner always has access
  if exists (select 1 from public.feed_items where id = p_item_id and owner_id = v_user) then
    return true;
  end if;

  -- Pro tier unlocks everything
  if public.effective_tier(v_user) = 'pro' then return true; end if;

  -- Check if user purchased this item
  return exists (
    select 1 from public.billing_events
    where user_id = v_user
      and event_type = 'library_unlock'
      and item_id = p_item_id::text
  );
end;
$$;

-- ============================================================
-- 29. FUNCTIONS — PROFILES PROTECT SENSITIVE
-- ============================================================

create or replace function public.profiles_protect_sensitive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Prevent non-admins from changing tier
  if new.tier is distinct from old.tier then
    if not public.is_admin() then
      raise exception 'PERMISSION_DENIED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_protect_sensitive on public.profiles;
create trigger trg_profiles_protect_sensitive
  before update on public.profiles
  for each row execute function public.profiles_protect_sensitive();

-- ============================================================
-- 30. FUNCTIONS — ENFORCE LIVE SUBSCRIPTION
-- ============================================================

create or replace function public.enforce_live_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
begin
  v_tier := public.effective_tier(auth.uid());
  if v_tier not in ('pro', 'payngo') then
    raise exception 'SUBSCRIPTION_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_live_subscription on public.live_requests;
create trigger trg_enforce_live_subscription
  before insert on public.live_requests
  for each row execute function public.enforce_live_subscription();

-- ============================================================
-- 30b. LANDING HIGHLIGHTS — top book, audiolite, gliimaits
-- ============================================================

create or replace function public.landing_highlights()
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_top_book    jsonb;
  v_top_audio   jsonb;
  v_top_gliimaits jsonb;
begin
  -- 1. Top book: approved book with most unique readers (all-time)
  select jsonb_build_object(
    'id', fi.id,
    'title', fi.title,
    'cover_url', fi.cover_url,
    'author', fi.author,
    'readers', coalesce(rp.cnt, 0)
  ) into v_top_book
  from public.feed_items fi
  left join (
    select item_id, count(distinct user_id)::bigint as cnt
    from public.reading_progress
    group by item_id
  ) rp on rp.item_id = fi.id
  where fi.type = 'book'
  order by coalesce(rp.cnt, 0) desc, fi.created_at desc
  limit 1;

  -- 2. Top audiolite: approved audiolite with most unique listeners (all-time)
  select jsonb_build_object(
    'id', fi.id,
    'title', fi.title,
    'cover_url', fi.cover_url,
    'author', fi.author,
    'readers', coalesce(rp.cnt, 0)
  ) into v_top_audio
  from public.feed_items fi
  left join (
    select item_id, count(distinct user_id)::bigint as cnt
    from public.reading_progress
    group by item_id
  ) rp on rp.item_id = fi.id
  where fi.type = 'audiolite'
  order by coalesce(rp.cnt, 0) desc, fi.created_at desc
  limit 1;

  -- 3. Top 3 gliimaits by GP (for Events card profile pictures)
  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_top_gliimaits
  from (
    select jsonb_build_object(
      'user_id', p.id,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url,
      'total_gp', p.total_gp
    ) as r
    from public.profiles p
    where p.total_gp is not null and p.total_gp > 0
    order by p.total_gp desc
    limit 3
  ) r;

  return jsonb_build_object(
    'top_book', v_top_book,
    'top_audiolite', v_top_audio,
    'top_gliimaits', v_top_gliimaits
  );
end $$;

grant execute on function public.landing_highlights() to anon;
grant execute on function public.landing_highlights() to authenticated;
grant execute on function public.landing_highlights() to service_role;

-- ============================================================
-- 31. RLS — ENABLE ON ALL TABLES
-- ============================================================

alter table public.faqs enable row level security;
alter table public.legal_documents enable row level security;
alter table public.partners enable row level security;
alter table public.reports enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_adjustments enable row level security;
alter table public.contact_info enable row level security;
alter table public.feed_submissions enable row level security;
alter table public.feed_items enable row level security;
alter table public.feed_gliims enable row level security;
alter table public.feed_gliim_contents enable row level security;
alter table public.feed_contents enable row level security;
alter table public.feed_interactions enable row level security;
alter table public.billing_prices enable row level security;
alter table public.billing_cycles enable row level security;
alter table public.billing_events enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_reads enable row level security;
alter table public.admin_chat enable row level security;
alter table public.contests enable row level security;
alter table public.contest_entries enable row level security;
alter table public.cohorts enable row level security;
alter table public.cohort_requests enable row level security;

-- landing_highlights() is SECURITY INVOKER, so anon needs table-level SELECT
-- before RLS policies are even checked. Without these grants the landing page
-- gets a 401 from the REST API.
grant select on public.contests        to anon, authenticated;
grant select on public.contest_entries to anon, authenticated;
grant select on public.cohorts         to anon, authenticated;
grant select on public.cohort_requests to anon, authenticated;
grant select on public.profiles        to anon;
-- landing_highlights() trending queries need these too
grant select on public.reading_progress to anon, authenticated;
grant select on public.feed_gliims     to anon, authenticated;

alter table public.live_requests enable row level security;
alter table public.reading_progress enable row level security;
alter table public.referrals enable row level security;

-- ============================================================
-- 32. RLS POLICIES — FAQS, LEGAL, PARTNERS (public read)
-- ============================================================

drop policy if exists faqs_read on public.faqs;
create policy faqs_read on public.faqs for select to authenticated using (true);

drop policy if exists legal_documents_read on public.legal_documents;
create policy legal_documents_read on public.legal_documents for select to authenticated using (true);

drop policy if exists partners_read on public.partners;
create policy partners_read on public.partners for select to authenticated using (true);

-- ============================================================
-- 33. RLS POLICIES — REPORTS
-- ============================================================

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists reports_read_own on public.reports;
create policy reports_read_own on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists reports_admin_all on public.reports;
create policy reports_admin_all on public.reports for all to authenticated
  using (public.is_admin());

-- ============================================================
-- 34. RLS POLICIES — PAYMENT ATTEMPTS
-- ============================================================

drop policy if exists payment_attempts_own on public.payment_attempts;
create policy payment_attempts_own on public.payment_attempts for all to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 35. RLS POLICIES — ADMIN USERS
-- ============================================================

drop policy if exists admin_users_read on public.admin_users;
create policy admin_users_read on public.admin_users for select to authenticated
  using (public.is_admin());

-- ============================================================
-- 36. RLS POLICIES — ADMIN ADJUSTMENTS
-- ============================================================

drop policy if exists admin_adjustments_admin on public.admin_adjustments;
create policy admin_adjustments_admin on public.admin_adjustments for all to authenticated
  using (public.is_admin());

-- ============================================================
-- 37. RLS POLICIES — CONTACT INFO
-- ============================================================

drop policy if exists contact_info_read_own on public.contact_info;
create policy contact_info_read_own on public.contact_info for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists contact_info_write_own on public.contact_info;
create policy contact_info_write_own on public.contact_info for all to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 38. RLS POLICIES — FEED SUBMISSIONS
-- ============================================================

drop policy if exists feed_submissions_read_own on public.feed_submissions;
create policy feed_submissions_read_own on public.feed_submissions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists feed_submissions_insert on public.feed_submissions;
create policy feed_submissions_insert on public.feed_submissions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists feed_submissions_update_own on public.feed_submissions;
create policy feed_submissions_update_own on public.feed_submissions for update to authenticated
  using (user_id = auth.uid());

drop policy if exists feed_submissions_admin on public.feed_submissions;
create policy feed_submissions_admin on public.feed_submissions for all to authenticated
  using (public.is_admin());

-- ============================================================
-- 39. RLS POLICIES — FEED ITEMS (public read)
-- ============================================================

drop policy if exists feed_items_read on public.feed_items;
create policy feed_items_read on public.feed_items for select to authenticated
  using (true);

drop policy if exists feed_items_admin on public.feed_items;
create policy feed_items_admin on public.feed_items for all to authenticated
  using (public.is_admin());

-- ============================================================
-- 40. RLS POLICIES — FEED GLIIMS
-- ============================================================

drop policy if exists feed_gliims_read on public.feed_gliims;
create policy feed_gliims_read on public.feed_gliims for select to authenticated
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());

drop policy if exists feed_gliims_insert on public.feed_gliims;
create policy feed_gliims_insert on public.feed_gliims for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists feed_gliims_update_own on public.feed_gliims;
create policy feed_gliims_update_own on public.feed_gliims for update to authenticated
  using (user_id = auth.uid());

drop policy if exists feed_gliims_admin on public.feed_gliims;
create policy feed_gliims_admin on public.feed_gliims for all to authenticated
  using (public.is_admin());

-- ============================================================
-- 41. RLS POLICIES — FEED GLIIM CONTENTS
-- ============================================================

drop policy if exists feed_gliim_contents_read on public.feed_gliim_contents;
create policy feed_gliim_contents_read on public.feed_gliim_contents for select to authenticated
  using (public.post_content_unlocked(post_id));

drop policy if exists feed_gliim_contents_write_own on public.feed_gliim_contents;
create policy feed_gliim_contents_write_own on public.feed_gliim_contents for all to authenticated
  using (exists (select 1 from public.feed_gliims g where g.id = post_id and g.user_id = auth.uid()));

drop policy if exists feed_gliim_contents_admin on public.feed_gliim_contents;
create policy feed_gliim_contents_admin on public.feed_gliim_contents for all to authenticated
  using (public.is_admin());

-- ============================================================
-- 42. RLS POLICIES — FEED CONTENTS (library content)
-- ============================================================

drop policy if exists feed_contents_read on public.feed_contents;
create policy feed_contents_read on public.feed_contents for select to authenticated
  using (public.library_item_unlocked(item_id));

drop policy if exists feed_contents_write_own on public.feed_contents;
create policy feed_contents_write_own on public.feed_contents for all to authenticated
  using (exists (select 1 from public.feed_items fi where fi.id = item_id and fi.owner_id = auth.uid()));

drop policy if exists feed_contents_admin on public.feed_contents;
create policy feed_contents_admin on public.feed_contents for all to authenticated
  using (public.is_admin());

-- ============================================================
-- 43. RLS POLICIES — FEED INTERACTIONS
-- ============================================================

drop policy if exists feed_interactions_read on public.feed_interactions;
create policy feed_interactions_read on public.feed_interactions for select to authenticated
  using (true);

drop policy if exists feed_interactions_insert on public.feed_interactions;
create policy feed_interactions_insert on public.feed_interactions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists feed_interactions_delete_own on public.feed_interactions;
create policy feed_interactions_delete_own on public.feed_interactions for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 44. RLS POLICIES — BILLING
-- ============================================================

drop policy if exists billing_prices_read on public.billing_prices;
create policy billing_prices_read on public.billing_prices for select to authenticated
  using (active = true);

drop policy if exists billing_cycles_own on public.billing_cycles;
create policy billing_cycles_own on public.billing_cycles for all to authenticated
  using (user_id = auth.uid());

drop policy if exists billing_events_own on public.billing_events;
create policy billing_events_own on public.billing_events for select to authenticated
  using (user_id = auth.uid());

drop policy if exists billing_events_admin on public.billing_events;
create policy billing_events_admin on public.billing_events for all to authenticated
  using (public.is_admin());

-- ============================================================
-- 45. RLS POLICIES — SUPPORT MESSAGES
-- ============================================================

drop policy if exists support_messages_read on public.support_messages;
create policy support_messages_read on public.support_messages for select to authenticated
  using (public.support_can_view(thread_user));

drop policy if exists support_messages_insert on public.support_messages;
create policy support_messages_insert on public.support_messages for insert to authenticated
  with check (sender_id = auth.uid() or public.is_admin());

drop policy if exists support_messages_admin on public.support_messages;
create policy support_messages_admin on public.support_messages for all to authenticated
  using (public.is_admin());

drop policy if exists support_messages_thread_owner on public.support_messages;
create policy support_messages_thread_owner on public.support_messages for all to authenticated
  using (thread_user = auth.uid());

-- ============================================================
-- 46. RLS POLICIES — SUPPORT READS
-- ============================================================

drop policy if exists support_reads_own on public.support_reads;
create policy support_reads_own on public.support_reads for all to authenticated
  using (reader_id = auth.uid());

drop policy if exists support_reads_admin on public.support_reads;
create policy support_reads_admin on public.support_reads for all to authenticated
  using (public.is_admin());

drop policy if exists support_reads_staff on public.support_reads;
create policy support_reads_staff on public.support_reads for select to authenticated
  using (public.admin_has_role(auth.uid(), 'crm'));

-- ============================================================
-- 47. RLS POLICIES — ADMIN CHAT
-- ============================================================

drop policy if exists admin_chat_read on public.admin_chat;
create policy admin_chat_read on public.admin_chat for select to authenticated
  using (public.is_admin());

drop policy if exists admin_chat_insert on public.admin_chat;
create policy admin_chat_insert on public.admin_chat for insert to authenticated
  with check (public.is_admin());

drop policy if exists admin_chat_admin on public.admin_chat;
create policy admin_chat_admin on public.admin_chat for all to authenticated
  using (public.is_admin());

-- ============================================================
-- 48. RLS POLICIES — COMMUNITY TABLES
-- ============================================================

-- contests: public read
drop policy if exists contests_read on public.contests;
create policy contests_read on public.contests for select to anon, authenticated
  using (true);

drop policy if exists contests_admin on public.contests;
create policy contests_admin on public.contests for all to authenticated
  using (public.is_admin());

-- contest_entries: public read, own insert
drop policy if exists contest_entries_read on public.contest_entries;
create policy contest_entries_read on public.contest_entries for select to anon, authenticated
  using (true);

drop policy if exists contest_entries_insert on public.contest_entries;
create policy contest_entries_insert on public.contest_entries for insert to authenticated
  with check (user_id = auth.uid());

-- cohorts: public read
drop policy if exists cohorts_read on public.cohorts;
create policy cohorts_read on public.cohorts for select to anon, authenticated
  using (true);

drop policy if exists cohorts_admin on public.cohorts;
create policy cohorts_admin on public.cohorts for all to authenticated
  using (public.is_admin());

-- cohort_requests: own read/insert, admin all
drop policy if exists cohort_requests_own on public.cohort_requests;
create policy cohort_requests_own on public.cohort_requests for all to authenticated
  using (user_id = auth.uid());

drop policy if exists cohort_requests_admin on public.cohort_requests;
create policy cohort_requests_admin on public.cohort_requests for all to authenticated
  using (public.is_admin());

-- ============================================================
-- 51. RLS POLICIES — LIVE REQUESTS
-- ============================================================

drop policy if exists live_requests_read on public.live_requests;
create policy live_requests_read on public.live_requests for select to authenticated
  using (true);

drop policy if exists live_requests_insert on public.live_requests;
create policy live_requests_insert on public.live_requests for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists live_requests_update_own on public.live_requests;
create policy live_requests_update_own on public.live_requests for update to authenticated
  using (user_id = auth.uid());

drop policy if exists live_requests_delete_own on public.live_requests;
create policy live_requests_delete_own on public.live_requests for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists live_requests_admin on public.live_requests;
create policy live_requests_admin on public.live_requests for all to authenticated
  using (public.is_admin());

-- ============================================================
-- 52. RLS POLICIES — READING PROGRESS
-- ============================================================

drop policy if exists reading_progress_own on public.reading_progress;
create policy reading_progress_own on public.reading_progress for all to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 53. RLS POLICIES — REFERRALS
-- ============================================================

drop policy if exists referrals_read on public.referrals;
create policy referrals_read on public.referrals for select to authenticated
  using (referrer_id = auth.uid() or referred_id = auth.uid());

drop policy if exists referrals_insert on public.referrals;
create policy referrals_insert on public.referrals for insert to authenticated
  with check (referred_id = auth.uid());

drop policy if exists referrals_admin on public.referrals;
create policy referrals_admin on public.referrals for all to authenticated
  using (public.is_admin());

-- ============================================================
-- 54. SEED DATA — FAQS
-- ============================================================

insert into public.faqs (question, answer, sort_order)
values
  ('What is Gliimu?', 'Gliimu is a creative platform where writers, artists, and media builders publish, share, and monetize their work — from bundles and books to audiolites and live sessions.', 1),
  ('How do I earn Gliimu Points (GP)?', 'You earn GP by publishing content, getting engagement, completing readings, winning contests, and receiving referrals from other members.', 2),
  ('What are the subscription tiers?', 'Gliimu offers four tiers: Trial (free, limited access), Wallet (pay-as-you-go with GP balance), Pay n Go (monthly plan), and Pro (full unlimited access).', 3),
  ('How do I submit a book or audiolite?', 'Use the upload modal on the Hub page. Select Book or Audiolite, fill in the details, and submit for CRM review. Once approved, it appears in the Library feed.', 4),
  ('Can I transfer wallet balance to another user?', 'Yes. Go to your Wallet page, click the share/transfer button, enter the recipient and amount, then confirm with your password.', 5),
  ('How do billing cycles work?', 'Billing cycles are automatic for subscribed users. If a payment is not received by the deadline, the cycle is voided and access may be restricted until payment is settled.', 6),
  ('How do referrals work?', 'Share your unique referral code. When someone signs up with your code and stays active for 30 days, the referral vests and you earn bonus GP.', 7)
on conflict do nothing;

-- ============================================================
-- 55. SEED DATA — LEGAL DOCUMENTS
-- ============================================================

insert into public.legal_documents (slug, title, body)
values
  ('terms', 'Terms of Service', 'These Terms of Service govern your use of the Gliimu platform. By creating an account or accessing any part of the service, you agree to be bound by these terms.\n\n1. Account Registration: You must provide accurate information when creating your account.\n2. Content: You retain ownership of content you publish. By posting, you grant Gliimu a non-exclusive license to display and distribute your content on the platform.\n3. Prohibited Conduct: You may not upload illegal content, harass other users, or attempt to gain unauthorized access to any part of the service.\n4. Payments: All payments are processed in Nigerian Naira (NGN). Wallet top-ups are non-refundable.\n5. Termination: Gliimu reserves the right to suspend or terminate accounts that violate these terms.\n6. Changes: We may update these terms from time to time. Continued use of the service constitutes acceptance of updated terms.'),
  ('privacy', 'Privacy Policy', 'This Privacy Policy describes how Gliimu collects, uses, and protects your personal information.\n\n1. Data Collection: We collect information you provide during registration, including your name, email, and payment details.\n2. Usage Data: We automatically collect usage data including content interactions, device information, and IP addresses.\n3. Data Sharing: We do not sell your personal data. We may share data with payment processors and service providers as necessary.\n4. Data Retention: We retain your data for as long as your account is active or as needed to provide services.\n5. Security: We implement industry-standard security measures to protect your data.\n6. Your Rights: You may request access to, correction of, or deletion of your personal data by contacting support.\n7. Contact: For privacy inquiries, contact support through the Support tab in the app.')
on conflict (slug) do nothing;

-- ============================================================
-- 56. SEED DATA — BILLING PRICES
-- ============================================================

insert into public.billing_prices (product, cycle, amount_ngn)
values
  ('pro', 'monthly', 5000),
  ('pro', 'yearly', 50000),
  ('payngo', 'monthly', 2000),
  ('payngo', 'yearly', 20000),
  ('wallet', 'topup_500', 500),
  ('wallet', 'topup_1000', 1000),
  ('wallet', 'topup_2000', 2000),
  ('wallet', 'topup_5000', 5000),
  ('wallet', 'topup_10000', 10000)
on conflict (product, cycle) do nothing;

-- ============================================================
-- 57. SEED DATA — SITE SETTINGS (ensure row exists)
-- ============================================================

insert into public.site_settings (id)
select 1
where not exists (select 1 from public.site_settings where id = 1)
on conflict do nothing;

-- ============================================================
-- 58. STORAGE BUCKET
-- ============================================================

insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

-- ============================================================
-- 59. REALTIME PUBLICATIONS
-- ============================================================

-- Publish support_messages for realtime support chat
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;
exception when others then raise notice 'support_messages realtime publication skipped: %', sqlerrm; end $$;

-- Publish admin_chat for realtime admin room
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'admin_chat'
  ) then
    alter publication supabase_realtime add table public.admin_chat;
  end if;
exception when others then raise notice 'admin_chat realtime publication skipped: %', sqlerrm; end $$;

-- Publish live_requests for realtime live page
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_requests'
  ) then
    alter publication supabase_realtime add table public.live_requests;
  end if;
exception when others then raise notice 'live_requests realtime publication skipped: %', sqlerrm; end $$;

-- ============================================================
-- 60. TRIGGERS — FEED GLIIM AUTO-PUBLISH
-- ============================================================

drop trigger if exists trg_set_feed_gliim_status on public.feed_gliims;
create trigger trg_set_feed_gliim_status
  before insert on public.feed_gliims
  for each row execute function public.set_feed_gliim_status();

-- ============================================================
-- 61. BOOTSTRAP — FIRST SUPER ADMIN
-- ============================================================

-- This is a no-op on subsequent runs. The first admin must be
-- inserted manually with a real auth.users UUID:
--   insert into public.admin_users (user_id, role)
--   values ('<your-auth-uuid>', 'super');

-- ============================================================
-- 62. NOTIFY POSTGREST
-- ============================================================

notify pgrst, 'reload schema';

-- ============================================================
-- 63. COMPREHENSIVE SELF-CHECK
-- ============================================================

do $$
declare
  v_ok text := 'OK';
  v_missing text := 'MISSING';
  v_result text;
  v_tables text[] := array[
    'faqs','legal_documents','partners','reports','payment_attempts',
    'admin_users','admin_adjustments','contact_info',
    'feed_submissions','feed_items','feed_gliims',
    'feed_gliim_contents','feed_contents','feed_interactions',
    'billing_prices','billing_cycles','billing_events',
    'support_messages','support_reads','admin_chat',
    'contests','contest_entries','cohorts','cohort_requests',
    'live_requests','reading_progress','referrals'
  ];
  v_funcs text[] := array[
    'is_admin()','admin_role()','admin_has_role(uuid,text)','current_admin_role()',
    'guard_is_admin()',
    'mark_dm_read(uuid)','bump_live_views(uuid)','bump_post_views(uuid)',
    'top_uploader()','set_feed_gliim_status()',
    'effective_tier(uuid)','billing_access(text,text,text,uuid)',
    'billing_summary()','purchase_library_item(uuid)','activate_plan(text)',
    'credit_wallet_topup(integer)',
    'billing_close_due_cycles()','billing_mark_processing()',
    'billing_enforce_deadlines()','billing_settle_cycle(bigint,text)',
    'send_support(text,jsonb)','transfer_to_user(uuid,uuid)',
    'support_can_view(uuid)','support_thread_unread(uuid)',
    'support_mark_read(uuid)','support_inbox()',
    'support_last_staff_at(uuid)','gliimpa_paused(uuid)','gliimpa_escalate(uuid)',
    'contest_score(uuid)','contest_leaderboard(uuid,integer)',
    'community_board()','contest_join(uuid)','cohort_request(uuid)',
    'admin_review_submission(uuid,text,text)','admin_resolve_report(bigint,text)',
    'admin_grant_role(uuid,text)','admin_revoke_role(uuid)',
    'admin_list_admins()','admin_list_pending_posts()',
    'admin_review_post(uuid,text,text)',
    'registrar_overview()','registrar_member(uuid)','registrar_revenue(integer)',
    'registrar_adjust_gp(uuid,integer,text)',
    'registrar_adjust_wallet(uuid,integer,text)',
    'registrar_adjust_tier(uuid,text,text)',
    'is_safe_url(text)','operations_get_settings()',
    'operations_update_setting(text,text)','operations_landing_data()',
    'operations_partner_upsert(bigint,text,text,text,integer)',
    'operations_partner_delete(bigint)',
    'operations_faq_upsert(bigint,text,text,integer)',
    'operations_faq_delete(bigint)',
    'increment_wallet(uuid,integer)','add_gp(uuid,integer)',
    'make_referral_code()','profiles_assign_referral_code()',
    'apply_referral(text)','referral_vest_due()','referral_summary()',
    'complete_reading(uuid)','related_publications(uuid,integer)',
    'admin_delete_feed_item(uuid)',
    'crm_contact(uuid)','crm_set_contact(text,text,text,text,text,text,text)',
    'post_content_unlocked(uuid)','library_item_unlocked(uuid)',
    'profiles_protect_sensitive()','enforce_live_subscription()'
  ];
  v_t text;
  v_f text;
  v_missing_tables integer := 0;
  v_missing_funcs integer := 0;
begin
  raise notice '';
  raise notice '========================================';
  raise notice '  GLIIMU SETUP_ALL SELF-CHECK';
  raise notice '========================================';
  raise notice '';

  -- Check tables
  raise notice '--- TABLES ---';
  foreach v_t in array v_tables loop
    select case when to_regclass('public.' || v_t) is not null then v_ok else v_missing end into v_result;
    if v_result = v_missing then
      v_missing_tables := v_missing_tables + 1;
    end if;
    raise notice '  % : %', rpad(v_t, 30), v_result;
  end loop;
  raise notice '';

  -- Check functions
  raise notice '--- FUNCTIONS ---';
  foreach v_f in array v_funcs loop
    select case
      when exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname || '(' = left(v_f, position('(' in v_f))
      ) then v_ok
      else v_missing
    end into v_result;
    if v_result = v_missing then
      v_missing_funcs := v_missing_funcs + 1;
    end if;
    raise notice '  % : %', rpad(v_f, 50), v_result;
  end loop;
  raise notice '';

  -- Check seed data
  raise notice '--- SEED DATA ---';
  raise notice '  FAQs:             %', (select count(*) || ' rows' from public.faqs);
  raise notice '  Legal documents:  %', (select count(*) || ' rows' from public.legal_documents);
  raise notice '  Billing prices:   %', (select count(*) || ' rows' from public.billing_prices);
  raise notice '';

  -- Check triggers
  raise notice '--- TRIGGERS ---';
  raise notice '  trg_set_feed_gliim_status:    %', case when exists (select 1 from pg_trigger where tgname='trg_set_feed_gliim_status') then v_ok else v_missing end;
  raise notice '  trg_guard_is_admin:           %', case when exists (select 1 from pg_trigger where tgname='trg_guard_is_admin') then v_ok else v_missing end;
  raise notice '  trg_profiles_assign_referral: %', case when exists (select 1 from pg_trigger where tgname='trg_profiles_assign_referral_code') then v_ok else v_missing end;
  raise notice '  trg_profiles_protect_sensitive:%', case when exists (select 1 from pg_trigger where tgname='trg_profiles_protect_sensitive') then v_ok else v_missing end;
  raise notice '  trg_enforce_live_subscription: %', case when exists (select 1 from pg_trigger where tgname='trg_enforce_live_subscription') then v_ok else v_missing end;
  raise notice '';

  -- Summary
  raise notice '--- SUMMARY ---';
  raise notice '  Tables missing:   %', v_missing_tables;
  raise notice '  Functions missing:%', v_missing_funcs;
  if v_missing_tables = 0 and v_missing_funcs = 0 then
    raise notice '  STATUS: ALL CHECKS PASSED';
  else
    raise notice '  STATUS: SOME CHECKS FAILED — review above';
  end if;
  raise notice '========================================';
end $$;
