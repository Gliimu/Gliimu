-- ============================================================
-- FIX DRAFTS + RPCs v2 — run the WHOLE file in Supabase SQL Editor
-- Fixes:
--   1. Drafts going public: two database triggers were fighting the
--      draft feature. The INSERT trigger forced every new gliim to
--      'approved' (overwriting status:'draft'), and the UPDATE trigger
--      forced every member edit back to the old status, so a draft
--      could never be published by its creator.
--   2. XpLoRe 400 "column c.status does not exist": community_board
--      was rebuilt to match the page and to work with the live
--      contests/cohorts tables whatever their shape.
--   3. Books/audiolites saved as draft were never stored (status column
--      was missing) + draft-hiding RLS for both tables.
--   4. rpc/billing_access + rpc/bump_post_views signatures.
--   5. "violates check constraint posts_status_check" when saving a
--      draft: the table kept the old posts check constraint, which
--      does not list 'draft' — replaced with one that does.
-- Safe to re-run: every statement is idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1. feed_items.status — the drafts column for books/audiolites
-- ------------------------------------------------------------
alter table public.feed_items add column if not exists status text default 'approved';

-- Everything that existed before drafts is live content
update public.feed_items set status = 'approved' where status is null;

-- ------------------------------------------------------------
-- 2. RLS: drafts visible only to their owner; owners can publish
-- ------------------------------------------------------------
drop policy if exists feed_items_read on public.feed_items;
create policy feed_items_read on public.feed_items for select to authenticated
  using (status is distinct from 'draft' or owner_id = auth.uid());

drop policy if exists feed_items_update_own on public.feed_items;
create policy feed_items_update_own on public.feed_items for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Gliims: drafts visible only to their owner
drop policy if exists feed_gliims_read on public.feed_gliims;
create policy feed_gliims_read on public.feed_gliims for select to authenticated
  using (status is distinct from 'draft' or user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- 3. Triggers — the real reason drafts went public
-- ------------------------------------------------------------
-- INSERT: members publish instantly; only an explicit draft stays a draft.
create or replace function public.set_feed_gliim_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'draft' then
    return new;
  end if;
  new.status      := 'approved';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.review_note := null;
  return new;
end;
$$;

-- UPDATE: creators move their own posts between draft and approved
-- (the update RLS policy already limits members to their own rows).
-- Admins keep full control.
create or replace function public.guard_feed_gliim_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() or public.admin_has_role(auth.uid(), 'crm') then
    return new;
  end if;
  if new.status not in ('draft','approved') then
    new.status := old.status;
  end if;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.review_note := old.review_note;
  return new;
end;
$$;

drop trigger if exists trg_set_feed_gliim_status on public.feed_gliims;
create trigger trg_set_feed_gliim_status
  before insert on public.feed_gliims
  for each row execute function public.set_feed_gliim_status();

drop trigger if exists trg_guard_feed_gliim_status on public.feed_gliims;
create trigger trg_guard_feed_gliim_status
  before update on public.feed_gliims
  for each row execute function public.guard_feed_gliim_status();

-- ------------------------------------------------------------
-- 3b. feed_gliims status CHECK must allow 'draft'
-- The table still carries the old check constraint from its days
-- as "posts" (approved/pending/rejected only), so inserting a
-- draft fails with posts_status_check violation.
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.feed_gliims'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%status%'
       and pg_get_constraintdef(oid) ilike '%approved%'
  loop
    execute format('alter table public.feed_gliims drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.feed_gliims
  add constraint feed_gliims_status_check
  check (status in ('approved','pending','rejected','draft'));

-- ------------------------------------------------------------
-- 4. bump_post_views(p_post uuid) — the client's exact signature
-- ------------------------------------------------------------
drop function if exists public.bump_post_views(uuid);
drop function if exists public.bump_post_views();

create or replace function public.bump_post_views(p_post uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.feed_gliims
     set views = coalesce(views, 0) + 1
   where id = p_post;
end;
$$;

grant execute on function public.bump_post_views(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. billing_access(p_event_type, p_item_id, p_request_id, p_creator, p_price_override)
-- p_price_override powers per-PDF pricing: the creator's price replaces the
-- fixed billing_prices row for premium_unlock purchases. A per-PDF purchase
-- uses the composite item id "<post-uuid>::pdf::<n>" and is deduped forever.
-- ------------------------------------------------------------
drop function if exists public.billing_access(text, text, text, uuid, integer);
drop function if exists public.billing_access(text, text, text, uuid);
drop function if exists public.billing_access(text, text);
drop function if exists public.billing_access(text);

create or replace function public.billing_access(
  p_event_type     text,
  p_item_id        text default null,
  p_request_id     text default null,
  p_creator        uuid default null,
  p_price_override integer default null
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
    if position('::pdf::' in p_item_id) > 0 then
      -- Per-PDF purchase: item id is "<post-uuid>::pdf::<n>". Each PDF carries
      -- its own price, so the post-level is_premium flag does not apply here.
      select po.id, po.user_id into v_post
        from public.feed_gliims po
       where po.id::text = split_part(p_item_id, '::pdf::', 1);
      if not found then
        return jsonb_build_object('allowed', true, 'kind', 'free', 'price', 0);
      end if;
      if v_post.user_id = uid then
        return jsonb_build_object('allowed', true, 'kind', 'free', 'price', 0, 'owner', true);
      end if;
      v_creator := v_post.user_id;
    else
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
  end if;

  select amount into v_price from public.billing_prices where event_type = v_kind;
  if p_price_override is not null then
    v_price := p_price_override;
  elsif v_price is null then
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

revoke execute on function public.billing_access(text, text, text, uuid, integer) from public, anon;
grant execute on function public.billing_access(text, text, text, uuid, integer) to authenticated, service_role;

-- ------------------------------------------------------------
-- 6. XpLoRe — community_board, contest_join, cohort_request
-- The live contests/cohorts tables predate the repo scripts and have an
-- older shape, so first make sure the tables and columns the board reads
-- all exist (existing columns and rows are never touched).
-- ------------------------------------------------------------
create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  metric text not null default 'gp',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'active',
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.contest_entries (
  id bigserial primary key,
  contest_id uuid not null references public.contests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique(contest_id, user_id)
);

create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  seats integer not null default 10,
  starts_at timestamptz not null default now(),
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.cohort_requests (
  id bigserial primary key,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(cohort_id, user_id)
);

-- Older live tables may be missing individual columns the board reads.
alter table public.contests        add column if not exists title       text;
alter table public.contests        add column if not exists description text;
alter table public.contests        add column if not exists metric      text default 'gp';
alter table public.contests        add column if not exists starts_at   timestamptz default now();
alter table public.contests        add column if not exists ends_at     timestamptz;
alter table public.contests        add column if not exists status      text default 'active';
alter table public.contests        add column if not exists is_archived boolean default false;
alter table public.contests        add column if not exists created_at  timestamptz default now();
alter table public.contest_entries add column if not exists user_id     uuid;
alter table public.cohorts         add column if not exists title       text;
alter table public.cohorts         add column if not exists description text;
alter table public.cohorts         add column if not exists seats       integer default 10;
alter table public.cohorts         add column if not exists starts_at   timestamptz default now();
alter table public.cohorts         add column if not exists is_archived boolean default false;
alter table public.cohorts         add column if not exists created_at  timestamptz default now();
alter table public.cohort_requests add column if not exists user_id     uuid;
alter table public.cohort_requests add column if not exists status      text default 'pending';

update public.contests set status = 'active' where status is null;

-- The join RPCs rely on these unique indexes for their ON CONFLICT clause.
create unique index if not exists ux_contest_entries_contest_user
  on public.contest_entries (contest_id, user_id);
create unique index if not exists ux_cohort_requests_cohort_user
  on public.cohort_requests (cohort_id, user_id);

drop function if exists public.community_board() cascade;
create or replace function public.community_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  return jsonb_build_object(
    'ok', true,
    'contests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',          c.id,
               'title',       c.title,
               'description', c.description,
               'metric',      c.metric,
               'starts_at',   c.starts_at,
               'ends_at',     c.ends_at,
               'status',      c.status,
               'joined',      exists (select 1 from public.contest_entries e
                                       where e.contest_id = c.id and e.user_id = uid),
               'entries',     (select count(*) from public.contest_entries e2
                                where e2.contest_id = c.id))
             order by c.created_at desc)
      from public.contests c
     where coalesce(c.is_archived, false) = false), '[]'::jsonb),
    'leaderboard', jsonb_build_object(
                     'contest_id', null::uuid,
                     'title',      null::text,
                     'metric',     null::text,
                     'rows',       '[]'::jsonb),
    'cohorts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',          co.id,
               'title',       co.title,
               'description', co.description,
               'seats',       co.seats,
               'starts_at',   co.starts_at,
               'seats_taken', (select count(*) from public.cohort_requests rq
                                where rq.cohort_id = co.id and rq.status = 'approved'),
               'pending',     (select count(*) from public.cohort_requests rq2
                                where rq2.cohort_id = co.id and rq2.status = 'pending'),
               'my_status',   (select rq3.status from public.cohort_requests rq3
                                where rq3.cohort_id = co.id and rq3.user_id = uid limit 1))
             order by co.created_at desc)
      from public.cohorts co
     where coalesce(co.is_archived, false) = false), '[]'::jsonb),
    'events', '[]'::jsonb,
    'news', '[]'::jsonb
  );
end;
$$;

-- Param names match the page's exact calls: p_contest / p_cohort
drop function if exists public.contest_join(uuid) cascade;
create or replace function public.contest_join(p_contest uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.contest_entries (contest_id, user_id)
  values (p_contest, auth.uid())
  on conflict (contest_id, user_id) do nothing;
end;
$$;

drop function if exists public.cohort_request(uuid) cascade;
create or replace function public.cohort_request(p_cohort uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cohort_requests (cohort_id, user_id)
  values (p_cohort, auth.uid())
  on conflict (cohort_id, user_id) do nothing;
end;
$$;

revoke execute on function public.community_board() from public, anon;
grant execute on function public.community_board() to authenticated, service_role;
revoke execute on function public.contest_join(uuid) from public, anon;
grant execute on function public.contest_join(uuid) to authenticated, service_role;
revoke execute on function public.cohort_request(uuid) from public, anon;
grant execute on function public.cohort_request(uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- 7. Refresh the API schema cache (fixes stale-RPC 404s immediately)
-- ------------------------------------------------------------
notify pgrst, 'reload schema';

-- ============================================================
-- SELF CHECK — every row must show OK, plus two draft counts
-- ============================================================
select 'feed_items.status column' as check_item,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'feed_items' and column_name = 'status'
  ) then 'OK' else 'MISSING' end as result
union all
select 'policy feed_items_read',
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'feed_items' and policyname = 'feed_items_read'
  ) then 'OK' else 'MISSING' end
union all
select 'policy feed_items_update_own',
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'feed_items' and policyname = 'feed_items_update_own'
  ) then 'OK' else 'MISSING' end
union all
select 'policy feed_gliims_read (draft-hiding)',
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'feed_gliims' and policyname = 'feed_gliims_read'
  ) then 'OK' else 'MISSING' end
union all
select 'trigger fn set_feed_gliim_status (draft-aware)',
  case when to_regprocedure('public.set_feed_gliim_status()') is not null then 'OK' else 'MISSING' end
union all
select 'trigger fn guard_feed_gliim_status (draft lifecycle)',
  case when to_regprocedure('public.guard_feed_gliim_status()') is not null then 'OK' else 'MISSING' end
union all
select 'feed_gliims status check allows draft',
  case when exists (
    select 1 from pg_constraint
    where conrelid = 'public.feed_gliims'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%draft%'
  ) then 'OK' else 'MISSING' end
union all
select 'rpc bump_post_views(uuid)',
  case when to_regprocedure('public.bump_post_views(uuid)') is not null then 'OK' else 'MISSING' end
union all
select 'rpc billing_access(text,text,text,uuid,integer)',
  case when to_regprocedure('public.billing_access(text,text,text,uuid,integer)') is not null then 'OK' else 'MISSING' end
union all
select 'rpc community_board()',
  case when to_regprocedure('public.community_board()') is not null then 'OK' else 'MISSING' end
union all
select 'rpc contest_join(uuid)',
  case when to_regprocedure('public.contest_join(uuid)') is not null then 'OK' else 'MISSING' end
union all
select 'rpc cohort_request(uuid)',
  case when to_regprocedure('public.cohort_request(uuid)') is not null then 'OK' else 'MISSING' end
union all
select 'unique entry indexes (contest + cohort)',
  case when (select count(*) from pg_indexes
              where schemaname = 'public'
                and indexname in ('ux_contest_entries_contest_user','ux_cohort_requests_cohort_user')) = 2
  then 'OK' else 'MISSING' end
union all
select 'draft gliims saved in DB',
  (select count(*)::text from public.feed_gliims where status = 'draft')
union all
select 'draft books/audiolites saved in DB',
  (select count(*)::text from public.feed_items where status = 'draft');

-- LIVE SHAPE INVENTORY — the real columns of the XpLoRe tables.
-- If anything still misbehaves, send me this grid.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('contests','contest_entries','cohorts','cohort_requests')
order by table_name, ordinal_position;
