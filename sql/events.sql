-- ============================================================
-- EVENTS FEATURE — budget-based contests with per-view pricing
-- 
-- Tables:
--   event_categories: admin-managed global categories
--   events: contest details, budget, view tracking
--   event_participants: users who joined an event
--   event_teams: optional team grouping
--   event_team_members: users in each team
--   event_gp_earnings: GP earned from views/likes
--   event_prizes: prize distribution records
-- 
-- Lifecycle:
--   live → ended (when budget exhausted)
-- 
-- Pricing model:
--   Host sets budget, pays ₦100 per view on tagged posts
--   Prize split: 30% (1st) + 20% (2nd) + 10% (3rd) + 40% (Gliimu)
--   Top 10 participants earn 5 GP per post when event ends
-- 
-- Leaderboard:
--   Ranked by views + likes on event-tagged posts
--   Shows only top 10 participants
-- ============================================================

-- Drop existing functions (idempotent)
drop function if exists public.event_create CASCADE;
drop function if exists public.event_join CASCADE;
drop function if exists public.event_leave CASCADE;
drop function if exists public.event_team_create CASCADE;
drop function if exists public.event_team_join CASCADE;
drop function if exists public.event_post_create CASCADE;
drop function if exists public.event_post_like CASCADE;
drop function if exists public.event_leaderboard CASCADE;
drop function if exists public.event_end CASCADE;
drop function if exists public.event_refund_check CASCADE;
drop function if exists public.event_categories_list CASCADE;
drop function if exists public.event_category_manage CASCADE;
drop function if exists public.event_pricing_get CASCADE;
drop function if exists public.event_pricing_set CASCADE;
drop function if exists public.event_notify_participants CASCADE;
drop function if exists public.event_calc_participant_cost CASCADE;
drop function if exists public.event_track_view CASCADE;

-- ============================================================
-- EVENT CATEGORIES (admin-managed)
-- ============================================================
create table if not exists public.event_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  icon_url text,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.event_categories enable row level security;

-- Everyone can read active categories
drop policy if exists "event categories read" on public.event_categories;
create policy "event categories read" on public.event_categories
  for select to authenticated
  using (is_active = true);

-- Only operations admin can manage categories
drop policy if exists "event categories manage" on public.event_categories;
create policy "event categories manage" on public.event_categories
  for all to authenticated
  using (public.admin_has_role(auth.uid(), 'operations'))
  with check (public.admin_has_role(auth.uid(), 'operations'));

-- ============================================================
-- EVENTS
-- ============================================================
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  cover_url text,
  
  -- Categories (max 2)
  category_ids uuid[] not null default '{}',
  
  -- Budget & view tracking
  budget_naira numeric(12,2) not null check (budget_naira >= 1000),
  cost_per_view numeric(12,2) not null default 100,
  total_views int not null default 0,
  
  -- Team mode
  team_mode boolean not null default false,
  max_team_size int check (max_team_size is null or max_team_size <= 3),
  
  -- Rules
  rules_text text,
  
  -- Lifecycle
  status text not null default 'live' check (status in ('live', 'ended', 'cancelled')),
  ended_at timestamptz,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration: drop old columns that no longer apply
alter table public.events drop column if exists duration_days;
alter table public.events drop column if exists per_participant_cost;
alter table public.events drop column if exists max_participants;
alter table public.events drop column if exists min_participants;
alter table public.events drop column if exists current_participants;
alter table public.events drop column if exists prize_1st;
alter table public.events drop column if exists prize_2nd;
alter table public.events drop column if exists prize_3rd;
alter table public.events drop column if exists gliimu_fee;
alter table public.events drop column if exists start_date;
alter table public.events drop column if exists end_date;
alter table public.events drop column if exists started_at;
alter table public.events drop column if exists refund_issued;
alter table public.events drop column if exists refund_issued_at;

-- Migration: add new columns
alter table public.events add column if not exists cost_per_view numeric(12,2) not null default 100;
alter table public.events add column if not exists total_views int not null default 0;

-- Migration: update status constraint (drop old, add new)
alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check check (status in ('live', 'ended', 'cancelled'));

-- Migration: update default status
alter table public.events alter column status set default 'live';

-- Migration: set any existing 'recruiting' or 'active' events to 'live'
update public.events set status = 'live' where status in ('recruiting', 'active');

create index if not exists idx_events_status on public.events(status);
create index if not exists idx_events_host on public.events(host_id);

alter table public.events enable row level security;

-- Everyone can read live/ended events
drop policy if exists "events read" on public.events;
create policy "events read" on public.events
  for select to authenticated
  using (status in ('live', 'ended'));

-- Host can update their own event (only while live)
drop policy if exists "events update host" on public.events;
create policy "events update host" on public.events
  for update to authenticated
  using (host_id = auth.uid() and status = 'live')
  with check (host_id = auth.uid() and status = 'live');

-- Host can delete their own event (only while live)
drop policy if exists "events delete host" on public.events;
create policy "events delete host" on public.events
  for delete to authenticated
  using (host_id = auth.uid() and status = 'live');

-- ============================================================
-- EVENT PARTICIPANTS
-- ============================================================
create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid,
  total_gp_earned int not null default 0,
  joined_at timestamptz not null default now(),
  unique(event_id, user_id)
);

create index if not exists idx_event_participants_event on public.event_participants(event_id);
create index if not exists idx_event_participants_user on public.event_participants(user_id);

alter table public.event_participants enable row level security;

-- Participants can read their own event participations
drop policy if exists "event participants read own" on public.event_participants;
create policy "event participants read own" on public.event_participants
  for select to authenticated
  using (user_id = auth.uid());

-- Everyone can read participants for visible events
drop policy if exists "event participants read event" on public.event_participants;
create policy "event participants read event" on public.event_participants
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_id
    and e.status in ('live', 'ended')
  ));

-- Users can join events themselves (any live event, no limit)
drop policy if exists "event participants insert" on public.event_participants;
create policy "event participants insert" on public.event_participants
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = event_id
      and e.status = 'live'
    )
  );

-- Users can leave events they joined (only while live)
drop policy if exists "event participants delete" on public.event_participants;
create policy "event participants delete" on public.event_participants
  for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = event_id
      and e.status = 'live'
    )
  );

-- ============================================================
-- EVENT TEAMS (optional)
-- ============================================================
create table if not exists public.event_teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  captain_id uuid not null references public.profiles(id) on delete cascade,
  total_gp_earned int not null default 0,
  created_at timestamptz not null default now(),
  unique(event_id, name)
);

create index if not exists idx_event_teams_event on public.event_teams(event_id);

alter table public.event_teams enable row level security;

drop policy if exists "event teams read" on public.event_teams;
create policy "event teams read" on public.event_teams
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_id
    and e.status in ('live', 'ended')
  ));

drop policy if exists "event teams insert" on public.event_teams;
create policy "event teams insert" on public.event_teams
  for insert to authenticated
  with check (
    captain_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = event_id
      and e.team_mode = true
      and e.status = 'live'
    )
  );

-- ============================================================
-- EVENT TEAM MEMBERS
-- ============================================================
create table if not exists public.event_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.event_teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique(team_id, user_id)
);

create index if not exists idx_event_team_members_team on public.event_team_members(team_id);
create index if not exists idx_event_team_members_user on public.event_team_members(user_id);

alter table public.event_team_members enable row level security;

drop policy if exists "event team members read" on public.event_team_members;
create policy "event team members read" on public.event_team_members
  for select to authenticated
  using (exists (
    select 1 from public.event_teams t
    join public.events e on e.id = t.event_id
    where t.id = team_id
    and e.status in ('live', 'ended')
  ));

drop policy if exists "event team members insert" on public.event_team_members;
create policy "event team members insert" on public.event_team_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.event_teams t
      join public.events e on e.id = t.event_id
      where t.id = team_id
      and e.team_mode = true
      and e.status = 'live'
      and (
        t.captain_id = auth.uid()
        or not exists (
          select 1 from public.event_team_members tm
          where tm.team_id = team_id
          and tm.user_id = auth.uid()
        )
      )
    )
  );

-- ============================================================
-- EVENT POSTS (submissions within events)
-- ============================================================
create table if not exists public.event_posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.event_teams(id) on delete set null,
  content_blocks jsonb not null default '[]',
  total_likes int not null default 0,
  total_views int not null default 0,
  gp_earned int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_posts_event on public.event_posts(event_id);
create index if not exists idx_event_posts_author on public.event_posts(author_id);
create index if not exists idx_event_posts_team on public.event_posts(team_id);

alter table public.event_posts enable row level security;

drop policy if exists "event posts read" on public.event_posts;
create policy "event posts read" on public.event_posts
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_id
    and e.status in ('live', 'ended')
  ));

drop policy if exists "event posts insert" on public.event_posts;
create policy "event posts insert" on public.event_posts
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = event_id
      and e.status = 'live'
      and exists (
        select 1 from public.event_participants ep
        where ep.event_id = e.id
        and ep.user_id = auth.uid()
      )
    )
  );

drop policy if exists "event posts update" on public.event_posts;
create policy "event posts update" on public.event_posts
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- ============================================================
-- EVENT POST LIKES
-- ============================================================
create table if not exists public.event_post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.event_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id, user_id)
);

create index if not exists idx_event_post_likes_post on public.event_post_likes(post_id);

alter table public.event_post_likes enable row level security;

drop policy if exists "event post likes read" on public.event_post_likes;
create policy "event post likes read" on public.event_post_likes
  for select to authenticated
  using (true);

drop policy if exists "event post likes insert" on public.event_post_likes;
create policy "event post likes insert" on public.event_post_likes
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "event post likes delete" on public.event_post_likes;
create policy "event post likes delete" on public.event_post_likes
  for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- EVENT GP EARNINGS (tracks GP earned from likes/views)
-- ============================================================
create table if not exists public.event_gp_earnings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.event_teams(id) on delete set null,
  gp_amount int not null,
  source text not null check (source in ('like', 'view', 'completion')),
  post_id uuid references public.event_posts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_gp_earnings_event on public.event_gp_earnings(event_id);
create index if not exists idx_event_gp_earnings_user on public.event_gp_earnings(user_id);

alter table public.event_gp_earnings enable row level security;

drop policy if exists "event gp earnings read" on public.event_gp_earnings;
create policy "event gp earnings read" on public.event_gp_earnings
  for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from public.events e
    where e.id = event_id
    and e.status in ('live', 'ended')
  ));

-- ============================================================
-- EVENT PRIZES (distribution records)
-- ============================================================
create table if not exists public.event_prizes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  winner_id uuid references public.profiles(id) on delete set null,
  team_id uuid references public.event_teams(id) on delete set null,
  rank int not null check (rank in (1, 2, 3)),
  amount_naira numeric(12,2) not null,
  distributed_at timestamptz not null default now()
);

create index if not exists idx_event_prizes_event on public.event_prizes(event_id);
create index if not exists idx_event_prizes_winner on public.event_prizes(winner_id);

alter table public.event_prizes enable row level security;

drop policy if exists "event prizes read" on public.event_prizes;
create policy "event prizes read" on public.event_prizes
  for select to authenticated
  using (
    winner_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = event_id
      and e.host_id = auth.uid()
    )
  );

-- ============================================================
-- EVENT PRICING CONFIG (manually adjustable by registrar)
-- ============================================================
create table if not exists public.event_pricing (
  id int primary key check (id = 1),
  cost_per_view numeric(12,2) not null default 100,
  min_budget numeric(12,2) not null default 1000,
  gliimu_fee_percent numeric(5,2) not null default 40,
  prize_1st_percent numeric(5,2) not null default 30,
  prize_2nd_percent numeric(5,2) not null default 20,
  prize_3rd_percent numeric(5,2) not null default 10,
  completion_gp int not null default 5,
  updated_at timestamptz not null default now()
);

insert into public.event_pricing (id) values (1) on conflict (id) do nothing;

-- Migration: drop old duration-based columns
alter table public.event_pricing drop column if exists cost_1_week;
alter table public.event_pricing drop column if exists cost_2_weeks;
alter table public.event_pricing drop column if exists cost_1_month;
alter table public.event_pricing drop column if exists cost_2_months;
alter table public.event_pricing drop column if exists cost_3_months;
alter table public.event_pricing drop column if exists min_participants;

-- Migration: add new columns
alter table public.event_pricing add column if not exists cost_per_view numeric(12,2) not null default 100;
alter table public.event_pricing add column if not exists gliimu_fee_percent numeric(5,2) not null default 40;
alter table public.event_pricing add column if not exists prize_1st_percent numeric(5,2) not null default 30;
alter table public.event_pricing add column if not exists prize_2nd_percent numeric(5,2) not null default 20;
alter table public.event_pricing add column if not exists prize_3rd_percent numeric(5,2) not null default 10;
alter table public.event_pricing add column if not exists completion_gp int not null default 5;

-- Migration: update min_budget default
alter table public.event_pricing alter column min_budget set default 1000;

alter table public.event_pricing enable row level security;

drop policy if exists "event pricing read" on public.event_pricing;
create policy "event pricing read" on public.event_pricing
  for select to authenticated
  using (true);

drop policy if exists "event pricing update" on public.event_pricing;
create policy "event pricing update" on public.event_pricing
  for update to authenticated
  using (public.admin_has_role(auth.uid(), 'registrar'))
  with check (public.admin_has_role(auth.uid(), 'registrar'));

-- ============================================================
-- RPCs
-- ============================================================

-- Get pricing formula
create or replace function public.event_pricing_get()
returns jsonb
language sql
stable
security invoker
as $$
  select to_jsonb(p) from public.event_pricing p where p.id = 1;
$$;

-- Update pricing (registrar only, enforced by RLS)
create or replace function public.event_pricing_set(
  p_cost_per_view numeric,
  p_min_budget numeric,
  p_gliimu_fee_percent numeric,
  p_prize_1st_percent numeric,
  p_prize_2nd_percent numeric,
  p_prize_3rd_percent numeric,
  p_completion_gp int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;

  update public.event_pricing
  set cost_per_view = p_cost_per_view,
      min_budget = p_min_budget,
      gliimu_fee_percent = p_gliimu_fee_percent,
      prize_1st_percent = p_prize_1st_percent,
      prize_2nd_percent = p_prize_2nd_percent,
      prize_3rd_percent = p_prize_3rd_percent,
      completion_gp = p_completion_gp,
      updated_at = now()
  where id = 1;

  return jsonb_build_object('ok', true);
end $$;

-- List categories
create or replace function public.event_categories_list()
returns jsonb
language sql
stable
security invoker
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'description', description,
    'icon_url', icon_url,
    'display_order', display_order
  ) order by display_order, name), '[]'::jsonb)
  from public.event_categories
  where is_active = true;
$$;

-- Manage categories (operations only)
create or replace function public.event_category_manage(
  p_action text,
  p_id uuid default null,
  p_name text default null,
  p_description text default null,
  p_icon_url text default null,
  p_display_order int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;

  if p_action = 'create' then
    if coalesce(btrim(p_name), '') = '' then
      return jsonb_build_object('ok', false, 'code', 'NAME_REQUIRED');
    end if;

    insert into public.event_categories (name, description, icon_url, display_order)
    values (btrim(p_name), p_description, p_icon_url, coalesce(p_display_order, 0))
    returning id into p_id;

    return jsonb_build_object('ok', true, 'id', p_id);

  elsif p_action = 'update' then
    if p_id is null then
      return jsonb_build_object('ok', false, 'code', 'ID_REQUIRED');
    end if;

    update public.event_categories
    set name = coalesce(btrim(p_name), name),
        description = coalesce(p_description, description),
        icon_url = coalesce(p_icon_url, icon_url),
        display_order = coalesce(p_display_order, display_order),
        updated_at = now()
    where id = p_id;

    return jsonb_build_object('ok', true);

  elsif p_action = 'delete' then
    if p_id is null then
      return jsonb_build_object('ok', false, 'code', 'ID_REQUIRED');
    end if;

    delete from public.event_categories where id = p_id;
    return jsonb_build_object('ok', true);

  else
    return jsonb_build_object('ok', false, 'code', 'BAD_ACTION');
  end if;
end $$;

-- Create event (budget-based, goes live immediately)
create or replace function public.event_create(
  p_title text,
  p_description text,
  p_cover_url text,
  p_category_ids uuid[],
  p_budget_naira numeric,
  p_cost_per_view numeric,
  p_team_mode boolean,
  p_max_team_size int,
  p_rules_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_event_id uuid;
  v_pricing jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if coalesce(btrim(p_title), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'TITLE_REQUIRED');
  end if;

  if coalesce(btrim(p_description), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'DESCRIPTION_REQUIRED');
  end if;

  if p_category_ids is null or array_length(p_category_ids, 1) = 0 or array_length(p_category_ids, 1) > 2 then
    return jsonb_build_object('ok', false, 'code', 'CATEGORIES_INVALID');
  end if;

  select * into v_pricing from public.event_pricing where id = 1;
  
  if p_budget_naira < (v_pricing->>'min_budget')::numeric then
    return jsonb_build_object('ok', false, 'code', 'BUDGET_TOO_LOW');
  end if;

  if p_team_mode and (p_max_team_size is null or p_max_team_size < 1 or p_max_team_size > 3) then
    return jsonb_build_object('ok', false, 'code', 'TEAM_SIZE_INVALID');
  end if;

  -- Use provided cost_per_view or default from pricing
  if p_cost_per_view is null or p_cost_per_view <= 0 then
    p_cost_per_view := (v_pricing->>'cost_per_view')::numeric;
  end if;

  -- TODO: Re-add billing deduction when event billing is integrated
  -- perform public.billing_access('event_create'::text, p_budget_naira::text, null::text, null::uuid, null::integer);

  insert into public.events (
    host_id, title, description, cover_url, category_ids,
    budget_naira, cost_per_view, team_mode, max_team_size, rules_text,
    status
  ) values (
    uid, btrim(p_title), btrim(p_description), p_cover_url, p_category_ids,
    p_budget_naira, p_cost_per_view, p_team_mode, p_max_team_size, p_rules_text,
    'live'
  ) returning id into v_event_id;

  -- Host auto-joins as participant
  insert into public.event_participants (event_id, user_id)
  values (v_event_id, uid);

  return jsonb_build_object('ok', true, 'event_id', v_event_id);
end $$;

-- Join event (unlimited participants, event must be live)
create or replace function public.event_join(p_event_id uuid, p_team_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_event public.events%rowtype;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if v_event.status != 'live' then
    return jsonb_build_object('ok', false, 'code', 'NOT_LIVE');
  end if;

  if exists (select 1 from public.event_participants where event_id = p_event_id and user_id = uid) then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_JOINED');
  end if;

  -- Team validation
  if v_event.team_mode then
    if p_team_id is null then
      return jsonb_build_object('ok', false, 'code', 'TEAM_REQUIRED');
    end if;

    if not exists (select 1 from public.event_teams where id = p_team_id and event_id = p_event_id) then
      return jsonb_build_object('ok', false, 'code', 'TEAM_NOT_FOUND');
    end if;

    if exists (select 1 from public.event_team_members where team_id = p_team_id and user_id = uid) then
      return jsonb_build_object('ok', false, 'code', 'ALREADY_IN_TEAM');
    end if;

    if (select count(*) from public.event_team_members where team_id = p_team_id) >= v_event.max_team_size then
      return jsonb_build_object('ok', false, 'code', 'TEAM_FULL');
    end if;

    insert into public.event_team_members (team_id, user_id)
    values (p_team_id, uid);
  end if;

  insert into public.event_participants (event_id, user_id, team_id)
  values (p_event_id, uid, p_team_id);

  return jsonb_build_object('ok', true);
end $$;

-- Leave event (only while live)
create or replace function public.event_leave(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_team_id uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if v_event.status != 'live' then
    return jsonb_build_object('ok', false, 'code', 'CANNOT_LEAVE');
  end if;

  select team_id into v_team_id from public.event_participants
  where event_id = p_event_id and user_id = uid;

  delete from public.event_participants
  where event_id = p_event_id and user_id = uid;

  if v_team_id is not null then
    delete from public.event_team_members
    where team_id = v_team_id and user_id = uid;
  end if;

  return jsonb_build_object('ok', true);
end $$;

-- Create team
create or replace function public.event_team_create(p_event_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_team_id uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if not v_event.team_mode then
    return jsonb_build_object('ok', false, 'code', 'TEAMS_DISABLED');
  end if;

  if v_event.status != 'live' then
    return jsonb_build_object('ok', false, 'code', 'NOT_LIVE');
  end if;

  if coalesce(btrim(p_name), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'NAME_REQUIRED');
  end if;

  insert into public.event_teams (event_id, name, captain_id)
  values (p_event_id, btrim(p_name), uid)
  returning id into v_team_id;

  insert into public.event_team_members (team_id, user_id)
  values (v_team_id, uid);

  return jsonb_build_object('ok', true, 'team_id', v_team_id);
end $$;

-- Create post in event (deprecated: use feed_gliims.event_id instead)
create or replace function public.event_post_create(
  p_event_id uuid,
  p_content_blocks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_post_id uuid;
  v_team_id uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if v_event.status != 'live' then
    return jsonb_build_object('ok', false, 'code', 'EVENT_NOT_LIVE');
  end if;

  if not exists (
    select 1 from public.event_participants
    where event_id = p_event_id and user_id = uid
  ) then
    return jsonb_build_object('ok', false, 'code', 'NOT_PARTICIPANT');
  end if;

  select team_id into v_team_id from public.event_participants
  where event_id = p_event_id and user_id = uid;

  insert into public.event_posts (event_id, author_id, team_id, content_blocks)
  values (p_event_id, uid, v_team_id, p_content_blocks)
  returning id into v_post_id;

  return jsonb_build_object('ok', true, 'post_id', v_post_id);
end $$;

-- Like post (deprecated: use feed_gliims likes instead)
create or replace function public.event_post_like(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_post public.event_posts%rowtype;
  v_gp_amount int;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select * into v_post from public.event_posts where id = p_post_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if v_post.author_id = uid then
    return jsonb_build_object('ok', false, 'code', 'CANNOT_LIKE_OWN');
  end if;

  -- Toggle like
  if exists (select 1 from public.event_post_likes where post_id = p_post_id and user_id = uid) then
    delete from public.event_post_likes where post_id = p_post_id and user_id = uid;
    update public.event_posts set total_likes = total_likes - 1 where id = p_post_id;
  else
    insert into public.event_post_likes (post_id, user_id) values (p_post_id, uid);
    update public.event_posts set total_likes = total_likes + 1 where id = p_post_id;

    -- Award GP to author (1 GP per like)
    v_gp_amount := 1;
    insert into public.event_gp_earnings (event_id, user_id, team_id, gp_amount, source, post_id)
    values (v_post.event_id, v_post.author_id, v_post.team_id, v_gp_amount, 'like', p_post_id);

    update public.event_participants
    set total_gp_earned = total_gp_earned + v_gp_amount
    where event_id = v_post.event_id and user_id = v_post.author_id;

    if v_post.team_id is not null then
      update public.event_teams
      set total_gp_earned = total_gp_earned + v_gp_amount
      where id = v_post.team_id;
    end if;
  end if;

  return jsonb_build_object('ok', true);
end $$;

-- Notify all participants when event starts (via support page)
create or replace function public.event_notify_participants(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_participant record;
  v_message text;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    return;
  end if;

  v_message := 'The event "' || v_event.title || '" is now LIVE! All spots are filled and the countdown has started. You can now start posting your submissions. Good luck!';

  -- Send notification to each participant via support_messages
  for v_participant in
    select user_id from public.event_participants where event_id = p_event_id
  loop
    insert into public.support_messages (thread_user, sender_id, content, kind)
    values (v_participant.user_id, v_event.host_id, v_message, 'message');
  end loop;
end $$;

-- Get leaderboard (top 10, ranked by views + likes on event-tagged feed_gliims)
create or replace function public.event_leaderboard(p_event_id uuid)
returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_event public.events%rowtype;
  v_leaderboard jsonb;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if v_event.team_mode then
    select jsonb_agg(jsonb_build_object(
      'team_id', team_id,
      'team_name', team_name,
      'total_gp', total_gp,
      'members', members
    ) order by total_gp desc)
    into v_leaderboard
    from (
      select
        t.id as team_id,
        t.name as team_name,
        coalesce(sum(fg.views), 0) + coalesce(sum(fg.likes), 0) as total_gp,
        (
          select jsonb_agg(jsonb_build_object(
            'user_id', tm.user_id,
            'full_name', p.full_name,
            'avatar_url', p.avatar_url
          ))
          from public.event_team_members tm
          join public.profiles p on p.id = tm.user_id
          where tm.team_id = t.id
        ) as members
      from public.event_teams t
      join public.event_team_members tm2 on tm2.team_id = t.id
      join public.feed_gliims fg on fg.author_id = tm2.user_id and fg.event_id = p_event_id
      where t.event_id = p_event_id
      group by t.id, t.name
      order by total_gp desc
      limit 10
    ) sub;
  else
    select jsonb_agg(jsonb_build_object(
      'user_id', user_id,
      'full_name', full_name,
      'avatar_url', avatar_url,
      'total_gp', total_gp
    ) order by total_gp desc)
    into v_leaderboard
    from (
      select
        p.id as user_id,
        p.full_name,
        p.avatar_url,
        coalesce(sum(fg.views), 0) + coalesce(sum(fg.likes), 0) as total_gp
      from public.event_participants ep
      join public.profiles p on p.id = ep.user_id
      left join public.feed_gliims fg on fg.author_id = ep.user_id and fg.event_id = p_event_id
      where ep.event_id = p_event_id
      group by p.id, p.full_name, p.avatar_url
      order by total_gp desc
      limit 10
    ) sub;
  end if;

  return jsonb_build_object('ok', true, 'leaderboard', coalesce(v_leaderboard, '[]'::jsonb));
end $$;

-- End event: distribute prizes to top 3, award GP per post to top 10
create or replace function public.event_end(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_pricing jsonb;
  v_total_spent numeric;
  v_prize_pool numeric;
  v_total_prize_pct numeric;
  v_winners jsonb;
  v_completion_gp int;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if v_event.host_id != uid and not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHORIZED');
  end if;

  if v_event.status != 'live' then
    return jsonb_build_object('ok', false, 'code', 'NOT_LIVE');
  end if;

  select * into v_pricing from public.event_pricing where id = 1;

  v_total_spent := v_event.total_views * v_event.cost_per_view;
  v_total_prize_pct := (v_pricing->>'prize_1st_percent')::numeric + (v_pricing->>'prize_2nd_percent')::numeric + (v_pricing->>'prize_3rd_percent')::numeric;
  v_prize_pool := v_total_spent * v_total_prize_pct / 100;

  -- Get top 3 winners
  if v_event.team_mode then
    select jsonb_agg(jsonb_build_object('team_id', team_id, 'total_gp', total_gp))
    into v_winners
    from (
      select t.id as team_id,
        coalesce(sum(fg.views), 0) + coalesce(sum(fg.likes), 0) as total_gp
      from public.event_teams t
      join public.event_team_members tm on tm.team_id = t.id
      left join public.feed_gliims fg on fg.author_id = tm.user_id and fg.event_id = p_event_id
      where t.event_id = p_event_id
      group by t.id
      order by total_gp desc
      limit 3
    ) sub;
  else
    select jsonb_agg(jsonb_build_object('user_id', user_id, 'total_gp', total_gp))
    into v_winners
    from (
      select ep.user_id,
        coalesce(sum(fg.views), 0) + coalesce(sum(fg.likes), 0) as total_gp
      from public.event_participants ep
      left join public.feed_gliims fg on fg.author_id = ep.user_id and fg.event_id = p_event_id
      where ep.event_id = p_event_id
      group by ep.user_id
      order by total_gp desc
      limit 3
    ) sub;
  end if;

  -- Distribute prizes to top 3
  if v_winners is not null and jsonb_array_length(v_winners) > 0 then
    for i in 0..jsonb_array_length(v_winners) - 1 loop
      declare
        v_winner jsonb := v_winners->i;
        v_amount numeric;
        v_rank int := i + 1;
        v_percent numeric;
      begin
        v_percent := case v_rank
          when 1 then (v_pricing->>'prize_1st_percent')::numeric
          when 2 then (v_pricing->>'prize_2nd_percent')::numeric
          when 3 then (v_pricing->>'prize_3rd_percent')::numeric
          else 0
        end;

        v_amount := v_prize_pool * v_percent / v_total_prize_pct;

        if v_amount > 0 then
          if v_event.team_mode then
            insert into public.event_prizes (event_id, team_id, rank, amount_naira)
            values (p_event_id, (v_winner->>'team_id')::uuid, v_rank, v_amount);
          else
            insert into public.event_prizes (event_id, winner_id, rank, amount_naira)
            values (p_event_id, (v_winner->>'user_id')::uuid, v_rank, v_amount);
          end if;
        end if;
      end;
    end loop;
  end if;

  -- Award GP per post to top 10 participants
  select completion_gp into v_completion_gp from public.event_pricing where id = 1;

  if v_event.team_mode then
    with top_teams as (
      select t.id as team_id,
        coalesce(sum(fg.views), 0) + coalesce(sum(fg.likes), 0) as total_gp
      from public.event_teams t
      join public.event_team_members tm on tm.team_id = t.id
      left join public.feed_gliims fg on fg.author_id = tm.user_id and fg.event_id = p_event_id
      where t.event_id = p_event_id
      group by t.id
      order by total_gp desc
      limit 10
    )
    update public.event_participants ep
    set total_gp_earned = total_gp_earned + (
      select count(*) * v_completion_gp
      from public.feed_gliims fg
      where fg.event_id = p_event_id and fg.author_id = ep.user_id
    )
    where ep.event_id = p_event_id
    and ep.team_id in (select team_id from top_teams);

    insert into public.event_gp_earnings (event_id, user_id, team_id, gp_amount, source)
    select p_event_id, ep.user_id, ep.team_id,
      (select count(*) * v_completion_gp from public.feed_gliims fg where fg.event_id = p_event_id and fg.author_id = ep.user_id),
      'completion'
    from public.event_participants ep
    where ep.event_id = p_event_id
    and ep.team_id in (select team_id from top_teams);
  else
    with top_users as (
      select ep.user_id,
        coalesce(sum(fg.views), 0) + coalesce(sum(fg.likes), 0) as total_gp
      from public.event_participants ep
      left join public.feed_gliims fg on fg.author_id = ep.user_id and fg.event_id = p_event_id
      where ep.event_id = p_event_id
      group by ep.user_id
      order by total_gp desc
      limit 10
    )
    update public.event_participants ep
    set total_gp_earned = total_gp_earned + (
      select count(*) * v_completion_gp
      from public.feed_gliims fg
      where fg.event_id = p_event_id and fg.author_id = ep.user_id
    )
    where ep.event_id = p_event_id
    and ep.user_id in (select user_id from top_users);

    insert into public.event_gp_earnings (event_id, user_id, gp_amount, source)
    select p_event_id, ep.user_id,
      (select count(*) * v_completion_gp from public.feed_gliims fg where fg.event_id = p_event_id and fg.author_id = ep.user_id),
      'completion'
    from public.event_participants ep
    where ep.event_id = p_event_id
    and ep.user_id in (select user_id from top_users);
  end if;

  -- Update profiles.total_gp
  update public.profiles p
  set total_gp = total_gp + sub.total_earned
  from (
    select user_id, sum(gp_amount) as total_earned
    from public.event_gp_earnings
    where event_id = p_event_id and source = 'completion'
    group by user_id
  ) sub
  where p.id = sub.user_id;

  -- Mark event as ended
  update public.events
  set status = 'ended', ended_at = now()
  where id = p_event_id;

  return jsonb_build_object('ok', true, 'winners', coalesce(v_winners, '[]'::jsonb));
end $$;

-- Track view on event-tagged post: increment event total_views, end if budget exhausted
create or replace function public.event_track_view(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post record;
  v_event public.events%rowtype;
  v_remaining numeric;
begin
  -- Get the post and its event
  select fg.event_id into v_post from public.feed_gliims fg where fg.id = p_post_id;
  
  if v_post.event_id is null then
    return jsonb_build_object('ok', true, 'event_tracked', false);
  end if;

  select * into v_event from public.events where id = v_post.event_id;
  if not found or v_event.status != 'live' then
    return jsonb_build_object('ok', true, 'event_tracked', false);
  end if;

  -- Increment total views
  update public.events
  set total_views = total_views + 1
  where id = v_event.id;

  -- Check if budget is exhausted
  v_remaining := v_event.budget_naira - ((v_event.total_views + 1) * v_event.cost_per_view);

  if v_remaining <= 0 then
    -- Auto-end the event
    perform public.event_end(v_event.id);
    return jsonb_build_object('ok', true, 'event_tracked', true, 'event_ended', true);
  end if;

  return jsonb_build_object('ok', true, 'event_tracked', true, 'event_ended', false, 'remaining_budget', v_remaining);
end $$;

-- Grants
revoke execute on function public.event_pricing_get() from public, anon;
grant execute on function public.event_pricing_get() to authenticated;

revoke execute on function public.event_pricing_set(numeric,numeric,numeric,numeric,numeric,numeric,int) from public, anon;
grant execute on function public.event_pricing_set(numeric,numeric,numeric,numeric,numeric,numeric,int) to authenticated;

revoke execute on function public.event_categories_list() from public, anon;
grant execute on function public.event_categories_list() to authenticated;

revoke execute on function public.event_category_manage(text,uuid,text,text,text,int) from public, anon;
grant execute on function public.event_category_manage(text,uuid,text,text,text,int) to authenticated;

revoke execute on function public.event_create(text,text,text,uuid[],numeric,numeric,boolean,int,text) from public, anon;
grant execute on function public.event_create(text,text,text,uuid[],numeric,numeric,boolean,int,text) to authenticated;

revoke execute on function public.event_join(uuid,uuid) from public, anon;
grant execute on function public.event_join(uuid,uuid) to authenticated;

revoke execute on function public.event_leave(uuid) from public, anon;
grant execute on function public.event_leave(uuid) to authenticated;

revoke execute on function public.event_team_create(uuid,text) from public, anon;
grant execute on function public.event_team_create(uuid,text) to authenticated;

revoke execute on function public.event_post_create(uuid,jsonb) from public, anon;
grant execute on function public.event_post_create(uuid,jsonb) to authenticated;

revoke execute on function public.event_post_like(uuid) from public, anon;
grant execute on function public.event_post_like(uuid) to authenticated;

revoke execute on function public.event_leaderboard(uuid) from public, anon;
grant execute on function public.event_leaderboard(uuid) to authenticated;

revoke execute on function public.event_end(uuid) from public, anon;
grant execute on function public.event_end(uuid) to authenticated;

revoke execute on function public.event_track_view(uuid) from public, anon;
grant execute on function public.event_track_view(uuid) to authenticated;

-- Table grants (fix 403 on REST API)
grant select on public.event_categories to authenticated;
grant select on public.events to authenticated;
grant insert on public.events to authenticated;
grant update on public.events to authenticated;
grant select on public.event_participants to authenticated;
grant insert on public.event_participants to authenticated;
grant delete on public.event_participants to authenticated;
grant select on public.event_teams to authenticated;
grant insert on public.event_teams to authenticated;
grant select on public.event_team_members to authenticated;
grant insert on public.event_team_members to authenticated;
grant select on public.event_posts to authenticated;
grant insert on public.event_posts to authenticated;
grant select on public.event_post_likes to authenticated;
grant insert on public.event_post_likes to authenticated;
grant select on public.event_gp_earnings to authenticated;
grant select on public.event_prizes to authenticated;
grant select on public.event_pricing to authenticated;

-- Seed default pricing if empty
insert into public.event_pricing (
  cost_per_view, min_budget,
  gliimu_fee_percent, prize_1st_percent, prize_2nd_percent, prize_3rd_percent,
  completion_gp
)
select 100, 1000, 40, 30, 20, 10, 5
where not exists (select 1 from public.event_pricing limit 1);

-- ============================================================
-- EVENT TAGS ON GLIIMS (2026-10-21)
-- A gliim can be tagged to an event the author participates in
-- (or hosts) with # in the composer. Tagged gliims show up in
-- the event's Posts tab.
-- ============================================================

alter table public.feed_gliims add column if not exists event_id uuid references public.events(id) on delete set null;

create index if not exists feed_gliims_event_idx
  on public.feed_gliims (event_id)
  where event_id is not null;

-- ============================================================
-- SELF CHECK
-- ============================================================
select 'event_categories table' as check_name,
  (select case when to_regclass('public.event_categories') is not null then 'OK' else 'MISSING' end) as status
union all
select 'events table',
  (select case when to_regclass('public.events') is not null then 'OK' else 'MISSING' end)
union all
select 'event_participants table',
  (select case when to_regclass('public.event_participants') is not null then 'OK' else 'MISSING' end)
union all
select 'event_teams table',
  (select case when to_regclass('public.event_teams') is not null then 'OK' else 'MISSING' end)
union all
select 'event_team_members table',
  (select case when to_regclass('public.event_team_members') is not null then 'OK' else 'MISSING' end)
union all
select 'event_gp_earnings table',
  (select case when to_regclass('public.event_gp_earnings') is not null then 'OK' else 'MISSING' end)
union all
select 'event_prizes table',
  (select case when to_regclass('public.event_prizes') is not null then 'OK' else 'MISSING' end)
union all
select 'event_pricing table',
  (select case when to_regclass('public.event_pricing') is not null then 'OK' else 'MISSING' end)
union all
select 'event_pricing_get function',
  (select case when to_regprocedure('public.event_pricing_get()') is not null then 'OK' else 'MISSING' end)
union all
select 'event_categories_list function',
  (select case when to_regprocedure('public.event_categories_list()') is not null then 'OK' else 'MISSING' end)
union all
select 'event_create function (new sig)',
  (select case when to_regprocedure('public.event_create(text,text,text,uuid[],numeric,numeric,boolean,int,text)') is not null then 'OK' else 'MISSING' end)
union all
select 'event_join function',
  (select case when to_regprocedure('public.event_join(uuid,uuid)') is not null then 'OK' else 'MISSING' end)
union all
select 'event_leaderboard function',
  (select case when to_regprocedure('public.event_leaderboard(uuid)') is not null then 'OK' else 'MISSING' end)
union all
select 'event_end function',
  (select case when to_regprocedure('public.event_end(uuid)') is not null then 'OK' else 'MISSING' end)
union all
select 'event_track_view function',
  (select case when to_regprocedure('public.event_track_view(uuid)') is not null then 'OK' else 'MISSING' end)
union all
select 'events.cost_per_view column',
  (select case when exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='events' and column_name='cost_per_view')
  then 'OK' else 'MISSING' end)
union all
select 'events.total_views column',
  (select case when exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='events' and column_name='total_views')
  then 'OK' else 'MISSING' end)
union all
select 'events.status default is live',
  (select case when (select column_default from information_schema.columns
    where table_schema='public' and table_name='events' and column_name='status') like '%live%'
  then 'OK' else 'CHECK' end)
union all
select 'feed_gliims.event_id column',
  (select case when exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='feed_gliims' and column_name='event_id')
  then 'OK' else 'MISSING' end);
