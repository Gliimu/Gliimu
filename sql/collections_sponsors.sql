-- ============================================================
-- COLLECTIONS + SPONSOR POSTS
-- ============================================================
-- Two new features: hashtag-based collections and sponsor carousel.
--
-- WHAT IT DOES:
--   1. post_hashtags — index table for fast collection lookups
--      (auto-populated via trigger when feed_gliims.description changes)
--   2. sponsor_posts — carousel ads with duration-based pricing
--   3. RLS policies + grants for both tables
--   4. Self-check SELECT grid at the end
--
-- SAFE TO RE-RUN — every step uses IF NOT EXISTS or guards.
-- ============================================================


-- ------------------------------------------------------------
-- 1. post_hashtags — index of hashtags used in posts
-- ------------------------------------------------------------
create table if not exists public.post_hashtags (
  post_id uuid not null references public.feed_gliims(id) on delete cascade,
  hashtag text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, hashtag)
);

create index if not exists idx_post_hashtags_hashtag on public.post_hashtags(hashtag);
create index if not exists idx_post_hashtags_post_id on public.post_hashtags(post_id);


-- ------------------------------------------------------------
-- 2. Function to parse and index hashtags from description
-- ------------------------------------------------------------
create or replace function public.index_post_hashtags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tags text[];
  tag text;
begin
  -- Delete existing hashtags for this post
  delete from public.post_hashtags where post_id = NEW.id;
  
  -- Extract hashtags from description (case-insensitive, lowercase storage)
  if NEW.description is not null and NEW.description ~ '#' then
    tags = array(select lower(match[1]) from regexp_matches(NEW.description, '#([a-z0-9_]+)', 'gi') as match);
    
    -- Insert unique hashtags (max 3 per post)
    if array_length(tags, 1) > 0 then
      for i in 1..least(array_length(tags, 1), 3) loop
        tag = tags[i];
        -- Avoid duplicates
        if not exists (select 1 from public.post_hashtags where post_id = NEW.id and hashtag = tag) then
          insert into public.post_hashtags (post_id, hashtag) values (NEW.id, tag);
        end if;
      end loop;
    end if;
  end if;
  
  return NEW;
end $$;


-- ------------------------------------------------------------
-- 3. Trigger to auto-index hashtags on insert/update
-- ------------------------------------------------------------
drop trigger if exists trg_index_post_hashtags on public.feed_gliims;
create trigger trg_index_post_hashtags
  after insert or update of description on public.feed_gliims
  for each row
  execute function public.index_post_hashtags();


-- ------------------------------------------------------------
-- 4. Backfill hashtags for existing posts
-- ------------------------------------------------------------
do $$
declare
  post record;
  tags text[];
  tag text;
begin
  for post in select id, description from public.feed_gliims where description is not null and description ~ '#'
  loop
    tags = array(select lower(match[1]) from regexp_matches(post.description, '#([a-z0-9_]+)', 'gi') as match);
    if array_length(tags, 1) > 0 then
      for i in 1..least(array_length(tags, 1), 3) loop
        tag = tags[i];
        insert into public.post_hashtags (post_id, hashtag)
        values (post.id, tag)
        on conflict (post_id, hashtag) do nothing;
      end loop;
    end if;
  end loop;
end $$;


-- ------------------------------------------------------------
-- 5. sponsor_posts — carousel ads from sponsors
-- ------------------------------------------------------------
create table if not exists public.sponsor_posts (
  id uuid primary key default gen_random_uuid(),
  sponsor_name text not null,
  title text not null,
  description text,
  image_url text not null,
  link_url text,
  position int not null default 0,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sponsor_posts_active on public.sponsor_posts(active);
create index if not exists idx_sponsor_posts_position on public.sponsor_posts(position);


-- ------------------------------------------------------------
-- 6. Function to update updated_at timestamp
-- ------------------------------------------------------------
create or replace function public.update_sponsor_posts_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end $$;

drop trigger if exists trg_sponsor_posts_updated_at on public.sponsor_posts;
create trigger trg_sponsor_posts_updated_at
  before update on public.sponsor_posts
  for each row
  execute function public.update_sponsor_posts_updated_at();


-- ------------------------------------------------------------
-- 7. RLS policies
-- ------------------------------------------------------------
alter table public.post_hashtags enable row level security;
alter table public.sponsor_posts enable row level security;

-- post_hashtags: everyone can read (public index)
drop policy if exists "Anyone can read post_hashtags" on public.post_hashtags;
create policy "Anyone can read post_hashtags"
  on public.post_hashtags
  for select
  to authenticated
  using (true);

-- sponsor_posts: everyone can read active sponsors within date range
drop policy if exists "Anyone can read active sponsor_posts" on public.sponsor_posts;
create policy "Anyone can read active sponsor_posts"
  on public.sponsor_posts
  for select
  to authenticated
  using (
    active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

-- sponsor_posts: only admins can insert/update/delete
drop policy if exists "Admins can insert sponsor_posts" on public.sponsor_posts;
create policy "Admins can insert sponsor_posts"
  on public.sponsor_posts
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.admin_users
      where user_id = auth.uid()
        and role in ('super', 'ops')
    )
  );

drop policy if exists "Admins can update sponsor_posts" on public.sponsor_posts;
create policy "Admins can update sponsor_posts"
  on public.sponsor_posts
  for update
  to authenticated
  using (
    exists (
      select 1 from public.admin_users
      where user_id = auth.uid()
        and role in ('super', 'ops')
    )
  );

drop policy if exists "Admins can delete sponsor_posts" on public.sponsor_posts;
create policy "Admins can delete sponsor_posts"
  on public.sponsor_posts
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.admin_users
      where user_id = auth.uid()
        and role in ('super', 'ops')
    )
  );


-- ------------------------------------------------------------
-- 8. Grants
-- ------------------------------------------------------------
grant select on public.post_hashtags to authenticated;
grant select, insert, update, delete on public.sponsor_posts to authenticated;


-- ============================================================
-- SELF CHECK
-- ============================================================
-- Run this section to verify everything is set up correctly.
-- Expected: all tables exist, all policies exist, sample data works.
-- ============================================================

select 'post_hashtags table' as check_name,
  case when to_regclass('public.post_hashtags') is not null then 'OK' else 'MISSING' end as status;

select 'sponsor_posts table' as check_name,
  case when to_regclass('public.sponsor_posts') is not null then 'OK' else 'MISSING' end as status;

select 'post_hashtags RLS' as check_name,
  case when count(*) = 1 then 'OK' else 'WRONG' end as status
from pg_policies
where schemaname = 'public'
  and tablename = 'post_hashtags'
  and policyname = 'Anyone can read post_hashtags';

select 'sponsor_posts read policy' as check_name,
  case when count(*) = 1 then 'OK' else 'WRONG' end as status
from pg_policies
where schemaname = 'public'
  and tablename = 'sponsor_posts'
  and policyname = 'Anyone can read active sponsor_posts';

select 'sponsor_posts insert policy' as check_name,
  case when count(*) = 1 then 'OK' else 'WRONG' end as status
from pg_policies
where schemaname = 'public'
  and tablename = 'sponsor_posts'
  and policyname = 'Admins can insert sponsor_posts';

select 'index_post_hashtags function' as check_name,
  case when count(*) = 1 then 'OK' else 'MISSING' end as status
from pg_proc
where proname = 'index_post_hashtags';

select 'trg_index_post_hashtags trigger' as check_name,
  case when count(*) = 1 then 'OK' else 'MISSING' end as status
from pg_trigger
where tgname = 'trg_index_post_hashtags';

select 'post_hashtags count' as check_name,
  count(*)::text as total_hashtags
from public.post_hashtags;

select 'sponsor_posts count' as check_name,
  count(*)::text as total_sponsors
from public.sponsor_posts;
