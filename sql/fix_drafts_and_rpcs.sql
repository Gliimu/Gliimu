-- ============================================================
-- FIX DRAFTS + RPCs — run the WHOLE file in Supabase SQL Editor
-- Fixes:
--   1. Books/audiolites saved as draft were never stored (status column was missing)
--   2. rpc/community_board 404 (function missing from live DB)
--   3. rpc/billing_access + rpc/bump_post_views 404 (stale signatures)
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

-- Gliims: drafts visible only to their owner (the live policy predates drafts,
-- which is why saved drafts were appearing for the public)
drop policy if exists feed_gliims_read on public.feed_gliims;
create policy feed_gliims_read on public.feed_gliims for select to authenticated
  using (status is distinct from 'draft' or user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- 3. bump_post_views(p_post uuid) — the client's exact signature
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
-- 4. billing_access(p_event_type, p_item_id, p_request_id, p_creator, p_price_override)
-- p_price_override powers per-PDF pricing: the creator's price replaces the
-- fixed billing_prices row for premium_unlock purchases.
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
-- 5. Arena functions — community_board, contest_join, cohort_request
-- ------------------------------------------------------------
drop function if exists public.community_board() cascade;
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

drop function if exists public.contest_join(uuid) cascade;
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

drop function if exists public.cohort_request(uuid) cascade;
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

-- ------------------------------------------------------------
-- 6. Refresh the API schema cache (fixes stale-RPC 404s immediately)
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
select 'draft gliims saved in DB',
  (select count(*)::text from public.feed_gliims where status = 'draft')
union all
select 'draft books/audiolites saved in DB',
  (select count(*)::text from public.feed_items where status = 'draft');

-- Column inventory: shows exactly which columns feed_items really has
-- (useful if a "column does not exist" error ever appears again)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'feed_items'
order by ordinal_position;
