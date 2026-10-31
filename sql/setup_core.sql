-- ============================================================
-- Gliimu Platform — Minimal Core Setup (Fresh Install)
-- ============================================================
-- This script creates the essential database schema for a fresh
-- Supabase project. It includes only table definitions and indexes.
-- Functions are in separate SQL files (gliits_billing.sql, etc.).
--
-- RUN ORDER: This is the FIRST script to run on a fresh database.
-- Then run individual feature SQL files as needed.
--
-- WHAT THIS CREATES:
--   - Extensions (pgcrypto)
--   - Column additions to Supabase-managed tables
--   - Core tables (faqs, legal_documents, partners, reports, etc.)
--   - Feed tables (feed_gliims, feed_items, feed_submissions, etc.)
--   - Gliits billing tables (config, plans, usage, topups)
--   - Support tables (support_messages, support_reads)
--   - Community tables (contests, cohorts, events, news)
--   - Collections & sponsors (post_hashtags, sponsor_posts)
--   - Social features (followed_users, poll_votes)
--   - Tracking tables (reading_progress, post_views, referrals)
--
-- AFTER RUNNING THIS:
--   Run these SQL files in order:
--   1. gliits_billing.sql (billing functions)
--   2. library_content.sql (library access control)
--   3. reader.sql (reading progress functions)
--   4. admin.sql (admin role management)
--   5. referrals.sql (referral system)
--   6. community.sql (community board functions)
--   7. collections_sponsors.sql (hashtag indexing)
--   8. support.sql (support desk functions)
--   9. follow_users.sql (follow/unfollow functions)
--   10. polls.sql (poll voting functions)
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
  reporter_id uuid references auth.users(id) on delete cascade,
  target_type text check (target_type in ('post','comment','user')),
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
  user_id uuid references auth.users(id) on delete cascade,
  reference text not null unique,
  gateway text not null,
  amount integer not null,
  status text not null default 'pending' check (status in ('pending','success','failed')),
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- 3f. admin_users
create table if not exists public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null check (role in ('super','crm','registrar','captain','operations')),
  note text,
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

-- 3g. admin_adjustments
create table if not exists public.admin_adjustments (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  kind text check (kind in ('gp','wallet','tier')),
  delta integer,
  new_tier text,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) not null
);

-- 3h. contact_info
create table if not exists public.contact_info (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade unique,
  full_name text,
  phone text,
  email text,
  whatsapp text,
  telegram text,
  discord text,
  preferred text,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 4. FEED TABLES
-- ============================================================

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
  price integer,
  category text,
  cover_color text,
  status text not null default 'approved' check (status in ('approved','pending','rejected','draft')),
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
create index if not exists idx_feed_gliims_category on public.feed_gliims(category);

-- 4d. feed_gliim_contents (was post_contents)
create table if not exists public.feed_gliim_contents (
  post_id uuid primary key references public.feed_gliims(id) on delete cascade,
  blocks jsonb not null default '[]'::jsonb
);
alter table public.feed_gliim_contents enable row level security;
revoke all on public.feed_gliim_contents from anon;
grant select, insert, update, delete on public.feed_gliim_contents to authenticated;

-- 4f. feed_interactions (was hub_interactions)
create table if not exists public.feed_interactions (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  post_id uuid references public.feed_gliims(id) on delete cascade,
  interaction_type text check (interaction_type in ('like','comment','share','save','support')),
  comment_text text,
  amount integer,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_feed_interactions_post on public.feed_interactions(post_id);
create index if not exists idx_feed_interactions_user on public.feed_interactions(user_id);
create index if not exists idx_feed_interactions_type on public.feed_interactions(interaction_type);

-- ============================================================
-- 5. GLIITS BILLING TABLES
-- ============================================================

-- 5a. gliits_config (singleton)
create table if not exists public.gliits_config (
  id integer primary key default 1,
  exchange_rate_naira_to_gliits numeric(10,4) not null default 1.0000,
  per_minute_rate_gliits numeric(10,2) not null default 3.00,
  plan_monthly_price_gliits integer not null default 3600,
  plan_yearly_price_gliits integer not null default 32400,
  signup_credit_gliits integer not null default 100,
  min_topup_gliits integer not null default 100,
  creator_rate_per_minute numeric(10,2) not null default 1.50,
  creator_cap_per_post_session integer not null default 30,
  idle_timeout_minutes integer not null default 3,
  gp_to_gliits_ratio integer not null default 10,
  gp_to_gliits_threshold integer not null default 100,
  updated_at timestamptz not null default now()
);

-- Insert default config if not exists
insert into public.gliits_config (id) values (1) on conflict do nothing;

alter table public.gliits_config enable row level security;
grant select on public.gliits_config to authenticated;
revoke all on public.gliits_config from anon;

-- 5b. gliits_plans
create table if not exists public.gliits_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade unique,
  plan_type text not null check (plan_type in ('payngo','monthly','yearly')),
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  auto_renew boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_gliits_plans_user on public.gliits_plans(user_id);
create index if not exists idx_gliits_plans_expires on public.gliits_plans(expires_at);

alter table public.gliits_plans enable row level security;
revoke all on public.gliits_plans from anon;
grant select, insert, update on public.gliits_plans to authenticated;

-- 5c. gliits_usage
create table if not exists public.gliits_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.feed_gliims(id) on delete set null,
  minute_at timestamptz not null default now(),
  gliits_charged numeric(10,2) not null default 3.00,
  creator_credited numeric(10,2) not null default 0.00,
  created_at timestamptz not null default now()
);
create index if not exists idx_gliits_usage_user on public.gliits_usage(user_id);
create index if not exists idx_gliits_usage_post on public.gliits_usage(post_id);
create index if not exists idx_gliits_usage_minute on public.gliits_usage(minute_at);

alter table public.gliits_usage enable row level security;
revoke all on public.gliits_usage from anon;
grant select, insert on public.gliits_usage to authenticated;

-- 5d. gliits_topups
create table if not exists public.gliits_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_gliits integer not null,
  amount_naira numeric(10,2),
  payment_reference text,
  payment_status text not null default 'pending' check (payment_status in ('pending','success','failed')),
  created_at timestamptz not null default now()
);
create index if not exists idx_gliits_topups_user on public.gliits_topups(user_id);
create index if not exists idx_gliits_topups_ref on public.gliits_topups(payment_reference);

alter table public.gliits_topups enable row level security;
revoke all on public.gliits_topups from anon;
grant select, insert, update on public.gliits_topups to authenticated;

-- ============================================================
-- 6. SUPPORT / MESSAGING TABLES
-- ============================================================

-- 6a. support_messages
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_user uuid not null,
  sender_id uuid not null references auth.users(id),
  kind text not null default 'message' check (kind in ('message','system','escalation','handover')),
  content text,
  attachment_url text,
  attachment_type text,
  context jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_support_messages_thread on public.support_messages(thread_user, created_at);
create index if not exists idx_support_messages_sender on public.support_messages(sender_id);

alter table public.support_messages enable row level security;
revoke all on public.support_messages from anon;
grant select, insert on public.support_messages to authenticated;

-- 6b. support_reads
create table if not exists public.support_reads (
  thread_user uuid not null,
  reader_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (thread_user, reader_id)
);

alter table public.support_reads enable row level security;
revoke all on public.support_reads from anon;
grant select, insert, update on public.support_reads to authenticated;

-- 6c. admin_chat
create table if not exists public.admin_chat (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id),
  content text,
  attachment_url text,
  attachment_type text,
  created_at timestamptz not null default now()
);

alter table public.admin_chat enable row level security;
revoke all on public.admin_chat from anon;
grant select, insert, delete on public.admin_chat to authenticated;

-- ============================================================
-- 7. COMMUNITY / ARENA TABLES
-- ============================================================

-- 7a. contests
create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  metric text not null default 'gp' check (metric in ('gp','reading','engagement','referrals')),
  starts_at timestamptz,
  ends_at timestamptz,
  prize_text text,
  is_featured boolean not null default false,
  is_archived boolean not null default false,
  status text not null default 'draft' check (status in ('draft','active','ended')),
  created_at timestamptz not null default now()
);

alter table public.contests enable row level security;
revoke all on public.contests from anon, authenticated;

-- 7b. contest_entries
create table if not exists public.contest_entries (
  contest_id uuid not null references public.contests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (contest_id, user_id)
);

alter table public.contest_entries enable row level security;
revoke all on public.contest_entries from anon, authenticated;

-- 7c. cohorts
create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  seats integer not null default 9,
  starts_at timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.cohorts enable row level security;
revoke all on public.cohorts from anon, authenticated;

-- 7d. cohort_requests
create table if not exists public.cohort_requests (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (cohort_id, user_id)
);

alter table public.cohort_requests enable row level security;
revoke all on public.cohort_requests from anon, authenticated;

-- 7e. events
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null default now(),
  venue_type text not null default 'Online' check (venue_type in ('Online','Hall','Custom')),
  venue_text text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;

-- 7f. news
create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.news enable row level security;
revoke all on public.news from anon, authenticated;

-- ============================================================
-- 8. COLLECTIONS & SPONSORS TABLES
-- ============================================================

-- 8a. post_hashtags
create table if not exists public.post_hashtags (
  post_id uuid not null references public.feed_gliims(id) on delete cascade,
  hashtag text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, hashtag)
);
create index if not exists idx_post_hashtags_tag on public.post_hashtags(hashtag);

alter table public.post_hashtags enable row level security;
revoke all on public.post_hashtags from anon;
grant select on public.post_hashtags to authenticated;

-- 8b. sponsor_posts
create table if not exists public.sponsor_posts (
  id uuid primary key default gen_random_uuid(),
  sponsor_name text not null,
  title text not null,
  description text,
  image_url text not null,
  link_url text,
  position integer not null default 0,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sponsor_posts enable row level security;
revoke all on public.sponsor_posts from anon;
grant select on public.sponsor_posts to authenticated;

-- ============================================================
-- 9. FOLLOW USERS TABLE
-- ============================================================

create table if not exists public.followed_users (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint no_self_follow check (follower_id != followed_id)
);
create index if not exists idx_followed_users_follower on public.followed_users(follower_id);
create index if not exists idx_followed_users_followed on public.followed_users(followed_id);

alter table public.followed_users enable row level security;
revoke all on public.followed_users from anon;
grant select, insert, delete on public.followed_users to authenticated;

-- ============================================================
-- 10. POLLS TABLE
-- ============================================================

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_gliims(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index integer not null check (option_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, user_id)
);

alter table public.poll_votes enable row level security;
revoke all on public.poll_votes from anon;
grant select, insert, update on public.poll_votes to authenticated;

-- ============================================================
-- 11. OTHER ESSENTIAL TABLES
-- ============================================================

-- 11a. live_requests
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

-- 11c. referrals
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referee_id uuid not null references public.profiles(id) on delete cascade unique,
  code text not null,
  status text not null default 'pending' check (status in ('pending','vested','invalid')),
  signup_reward_gp integer not null default 100,
  created_at timestamptz not null default now(),
  vested_at timestamptz
);
create index if not exists idx_referrals_referrer on public.referrals(referrer_id, status);

alter table public.referrals enable row level security;
revoke all on public.referrals from anon, authenticated;

-- 11d. post_views
create table if not exists public.post_views (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.feed_gliims(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.post_views enable row level security;
revoke all on public.post_views from anon, authenticated;

-- ============================================================
-- SELF CHECK — verify core tables exist
-- ============================================================

select 1 as "#", 'feed_gliims table exists' as item,
       case when to_regclass('public.feed_gliims') is not null then 'OK' else 'MISSING' end as result
union all select 2, 'feed_items table exists',
       case when to_regclass('public.feed_items') is not null then 'OK' else 'MISSING' end
union all select 3, 'gliits_config table exists',
       case when to_regclass('public.gliits_config') is not null then 'OK' else 'MISSING' end
union all select 4, 'gliits_plans table exists',
       case when to_regclass('public.gliits_plans') is not null then 'OK' else 'MISSING' end
union all select 5, 'support_messages table exists',
       case when to_regclass('public.support_messages') is not null then 'OK' else 'MISSING' end
union all select 6, 'contests table exists',
       case when to_regclass('public.contests') is not null then 'OK' else 'MISSING' end
union all select 7, 'followed_users table exists',
       case when to_regclass('public.followed_users') is not null then 'OK' else 'MISSING' end
union all select 8, 'reading_progress table exists',
       case when to_regclass('public.reading_progress') is not null then 'OK' else 'MISSING' end
order by "#";
