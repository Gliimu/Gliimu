-- ============================================================
-- Gliits Billing System — Complete Replacement
-- Replaces: billing_cycles, billing_events, billing_prices, billing_summary
-- New model: G3/minute usage, virtual currency (Gliits), 3 plans
-- ============================================================

-- ============================================================
-- 1. DROP OLD BILLING SYSTEM
-- ============================================================

-- Drop old tables (if they exist)
drop table if exists public.billing_events cascade;
drop table if exists public.billing_cycles cascade;
drop table if exists public.billing_prices cascade;

-- Drop old RPCs (if they exist)
drop function if exists public.billing_summary() cascade;
drop function if exists public.billing_activate_plan(text) cascade;
drop function if exists public.billing_pay_bill(integer) cascade;
drop function if exists public.billing_topup_wallet(integer, text) cascade;

-- ============================================================
-- 2. CREATE GLIITS CONFIG TABLE
-- ============================================================

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

-- Seed default config (single row)
insert into public.gliits_config (id)
values (1)
on conflict (id) do nothing;

-- RLS: everyone can read, only registrar can update
alter table public.gliits_config enable row level security;

create policy "gliits_config_select_all"
  on public.gliits_config for select
  to authenticated
  using (true);

create policy "gliits_config_update_registrar"
  on public.gliits_config for update
  to authenticated
  using (public.admin_has_role(auth.uid(), 'registrar'))
  with check (public.admin_has_role(auth.uid(), 'registrar'));

grant select on public.gliits_config to authenticated;
grant select on public.gliits_config to anon;

-- ============================================================
-- 3. CREATE GLIITS PLANS TABLE
-- ============================================================

create table if not exists public.gliits_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_type text not null check (plan_type in ('payngo', 'monthly', 'yearly')),
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  auto_renew boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id)
);

create index if not exists idx_gliits_plans_user_id on public.gliits_plans(user_id);
create index if not exists idx_gliits_plans_expires_at on public.gliits_plans(expires_at);

alter table public.gliits_plans enable row level security;

create policy "gliits_plans_select_own"
  on public.gliits_plans for select
  to authenticated
  using (user_id = auth.uid());

create policy "gliits_plans_insert_own"
  on public.gliits_plans for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "gliits_plans_update_own"
  on public.gliits_plans for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "gliits_plans_select_admin"
  on public.gliits_plans for select
  to authenticated
  using (
    public.admin_has_role(auth.uid(), 'registrar')
    or public.admin_has_role(auth.uid(), 'ops')
  );

grant select on public.gliits_plans to authenticated;
grant select on public.gliits_plans to anon;

-- ============================================================
-- 4. CREATE GLIITS USAGE TABLE
-- ============================================================

create table if not exists public.gliits_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.feed_gliims(id) on delete set null,
  minute_at timestamptz not null default now(),
  gliits_charged numeric(10,2) not null default 3.00,
  creator_credited numeric(10,2) not null default 0.00,
  created_at timestamptz not null default now()
);

create index if not exists idx_gliits_usage_user_id on public.gliits_usage(user_id);
create index if not exists idx_gliits_usage_post_id on public.gliits_usage(post_id);
create index if not exists idx_gliits_usage_minute_at on public.gliits_usage(minute_at);

alter table public.gliits_usage enable row level security;

create policy "gliits_usage_select_own"
  on public.gliits_usage for select
  to authenticated
  using (user_id = auth.uid());

create policy "gliits_usage_insert_system"
  on public.gliits_usage for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "gliits_usage_select_admin"
  on public.gliits_usage for select
  to authenticated
  using (
    public.admin_has_role(auth.uid(), 'registrar')
    or public.admin_has_role(auth.uid(), 'ops')
  );

grant select on public.gliits_usage to authenticated;
grant select on public.gliits_usage to anon;

-- ============================================================
-- 5. CREATE GLIITS TOPUPS TABLE
-- ============================================================

create table if not exists public.gliits_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_gliits integer not null,
  amount_naira numeric(10,2),
  payment_reference text,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'success', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_gliits_topups_user_id on public.gliits_topups(user_id);
create index if not exists idx_gliits_topups_reference on public.gliits_topups(payment_reference);

alter table public.gliits_topups enable row level security;

create policy "gliits_topups_select_own"
  on public.gliits_topups for select
  to authenticated
  using (user_id = auth.uid());

create policy "gliits_topups_insert_own"
  on public.gliits_topups for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "gliits_topups_update_own"
  on public.gliits_topups for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "gliits_topups_select_admin"
  on public.gliits_topups for select
  to authenticated
  using (
    public.admin_has_role(auth.uid(), 'registrar')
    or public.admin_has_role(auth.uid(), 'ops')
  );

grant select on public.gliits_topups to authenticated;
grant select on public.gliits_topups to anon;

-- ============================================================
-- 6. RESET ALL USER BALANCES TO G100
-- ============================================================

update public.profiles
set wallet_balance = 100;

-- Also create payngo plans for users who don't have one
insert into public.gliits_plans (user_id, plan_type, started_at)
select id, 'payngo', now()
from public.profiles
where id not in (select user_id from public.gliits_plans)
on conflict (user_id) do nothing;

-- ============================================================
-- 7. CREATE RPCs
-- ============================================================

-- Get current balance + plan info
create or replace function public.gliits_get_balance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_plan jsonb;
begin
  select wallet_balance into v_balance
  from public.profiles
  where id = auth.uid();

  select jsonb_build_object(
    'plan_type', plan_type,
    'started_at', started_at,
    'expires_at', expires_at,
    'auto_renew', auto_renew
  ) into v_plan
  from public.gliits_plans
  where user_id = auth.uid();

  return jsonb_build_object(
    'balance', coalesce(v_balance, 0),
    'plan', v_plan
  );
end;
$$;

grant execute on function public.gliits_get_balance() to authenticated;


-- Heartbeat: log a minute of usage, deduct G3 if payngo
create or replace function public.gliits_heartbeat(p_post_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_plan_type text;
  v_plan_expires timestamptz;
  v_per_minute numeric;
  v_creator_rate numeric;
  v_creator_cap integer;
  v_session_creator_earned numeric;
  v_charge numeric;
  v_creator_credit numeric;
  v_post_author uuid;
begin
  -- Get config
  select per_minute_rate_gliits, creator_rate_per_minute, creator_cap_per_post_session
  into v_per_minute, v_creator_rate, v_creator_cap
  from public.gliits_config
  where id = 1;

  -- Get user's plan
  select plan_type, expires_at into v_plan_type, v_plan_expires
  from public.gliits_plans
  where user_id = auth.uid();

  -- If no plan or expired, reject
  if v_plan_type is null or (v_plan_expires is not null and v_plan_expires < now()) then
    raise exception 'NO_ACTIVE_PLAN';
  end if;

  -- Get current balance
  select wallet_balance into v_balance
  from public.profiles
  where id = auth.uid();

  -- Credit creator if post_id provided (all plan types)
  v_creator_credit := 0;
  if p_post_id is not null then
    select user_id into v_post_author
    from public.feed_gliims
    where id = p_post_id;

    if v_post_author is not null and v_post_author != auth.uid() then
      select coalesce(sum(creator_credited), 0) into v_session_creator_earned
      from public.gliits_usage
      where user_id = auth.uid()
        and post_id = p_post_id
        and minute_at >= now() - interval '24 hours';

      if v_session_creator_earned < v_creator_cap then
        v_creator_credit := least(v_creator_rate, v_creator_cap - v_session_creator_earned);

        update public.profiles
        set wallet_balance = wallet_balance + v_creator_credit
        where id = v_post_author;
      end if;
    end if;
  end if;

  -- If payngo, check balance and deduct
  if v_plan_type = 'payngo' then
    if v_balance < v_per_minute then
      raise exception 'INSUFFICIENT_BALANCE';
    end if;

    v_charge := v_per_minute;

    update public.profiles
    set wallet_balance = wallet_balance - v_charge
    where id = auth.uid();

    insert into public.gliits_usage (user_id, post_id, gliits_charged, creator_credited)
    values (auth.uid(), p_post_id, v_charge, v_creator_credit);

    return jsonb_build_object(
      'balance', v_balance - v_charge,
      'charged', v_charge,
      'creator_credited', v_creator_credit
    );
  else
    -- Monthly/yearly: no charge to reader, but creator still gets credited
    insert into public.gliits_usage (user_id, post_id, gliits_charged, creator_credited)
    values (auth.uid(), p_post_id, 0, v_creator_credit);

    return jsonb_build_object(
      'balance', v_balance,
      'charged', 0,
      'creator_credited', v_creator_credit
    );
  end if;
end;
$$;

grant execute on function public.gliits_heartbeat(uuid) to authenticated;


-- Top up wallet
create or replace function public.gliits_topup_wallet(p_amount_gliits integer, p_reference text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min_topup integer;
  v_balance numeric;
begin
  select min_topup_gliits into v_min_topup
  from public.gliits_config
  where id = 1;

  if p_amount_gliits < v_min_topup then
    raise exception 'MIN_TOPUP_REQUIRED';
  end if;

  update public.profiles
  set wallet_balance = wallet_balance + p_amount_gliits
  where id = auth.uid()
  returning wallet_balance into v_balance;

  insert into public.gliits_topups (user_id, amount_gliits, payment_reference, payment_status)
  values (auth.uid(), p_amount_gliits, p_reference, 'success');

  return jsonb_build_object(
    'balance', v_balance,
    'credited', p_amount_gliits
  );
end;
$$;

grant execute on function public.gliits_topup_wallet(integer, text) to authenticated;


-- Set/upgrade plan
create or replace function public.gliits_set_plan(p_plan_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_monthly_price integer;
  v_yearly_price integer;
  v_balance numeric;
  v_expires timestamptz;
begin
  if p_plan_type not in ('payngo', 'monthly', 'yearly') then
    raise exception 'INVALID_PLAN_TYPE';
  end if;

  select plan_monthly_price_gliits, plan_yearly_price_gliits
  into v_monthly_price, v_yearly_price
  from public.gliits_config
  where id = 1;

  select wallet_balance into v_balance
  from public.profiles
  where id = auth.uid();

  -- Deduct plan price if upgrading
  if p_plan_type = 'monthly' then
    if v_balance < v_monthly_price then
      raise exception 'INSUFFICIENT_BALANCE';
    end if;
    update public.profiles
    set wallet_balance = wallet_balance - v_monthly_price
    where id = auth.uid();
    v_expires := now() + interval '1 month';
  elsif p_plan_type = 'yearly' then
    if v_balance < v_yearly_price then
      raise exception 'INSUFFICIENT_BALANCE';
    end if;
    update public.profiles
    set wallet_balance = wallet_balance - v_yearly_price
    where id = auth.uid();
    v_expires := now() + interval '1 year';
  else
    v_expires := null;
  end if;

  -- Upsert plan
  insert into public.gliits_plans (user_id, plan_type, started_at, expires_at)
  values (auth.uid(), p_plan_type, now(), v_expires)
  on conflict (user_id) do update
  set plan_type = excluded.plan_type,
      started_at = excluded.started_at,
      expires_at = excluded.expires_at;

  return jsonb_build_object(
    'plan_type', p_plan_type,
    'expires_at', v_expires,
    'balance', v_balance - case when p_plan_type = 'monthly' then v_monthly_price when p_plan_type = 'yearly' then v_yearly_price else 0 end
  );
end;
$$;

grant execute on function public.gliits_set_plan(text) to authenticated;


-- Get config (public read)
create or replace function public.gliits_get_config()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return (select to_jsonb(gc) from public.gliits_config gc where gc.id = 1);
end;
$$;

grant execute on function public.gliits_get_config() to authenticated;


-- Update config (registrar only)
create or replace function public.gliits_set_config(p_key text, p_value numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_registrar boolean;
begin
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
      and role in ('super', 'registrar')
  ) into v_is_registrar;

  if not v_is_registrar then
    raise exception 'REGISTRAR_ONLY';
  end if;

  -- Allowlist: only these columns can be updated
  if p_key not in (
    'exchange_rate_naira_to_gliits', 'per_minute_rate_gliits',
    'plan_monthly_price_gliits', 'plan_yearly_price_gliits',
    'signup_credit_gliits', 'min_topup_gliits',
    'creator_rate_per_minute', 'creator_cap_per_post_session',
    'idle_timeout_minutes', 'gp_to_gliits_ratio', 'gp_to_gliits_threshold'
  ) then
    raise exception 'INVALID_CONFIG_KEY';
  end if;

  execute format(
    'update public.gliits_config set %I = $1, updated_at = now() where id = 1',
    p_key
  ) using p_value;

  return public.gliits_get_config();
end;
$$;

grant execute on function public.gliits_set_config(text, numeric) to authenticated;


-- Manual balance adjustment (registrar only)
create or replace function public.gliits_adjust_balance(p_user_id uuid, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_registrar boolean;
  v_new_balance numeric;
begin
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
      and role in ('super', 'registrar')
  ) into v_is_registrar;

  if not v_is_registrar then
    raise exception 'REGISTRAR_ONLY';
  end if;

  update public.profiles
  set wallet_balance = wallet_balance + p_amount
  where id = p_user_id
  returning wallet_balance into v_new_balance;

  return jsonb_build_object(
    'user_id', p_user_id,
    'adjustment', p_amount,
    'new_balance', v_new_balance
  );
end;
$$;

grant execute on function public.gliits_adjust_balance(uuid, integer) to authenticated;


-- GP to Gliits conversion (100 GP = G10)
create or replace function public.gliits_gp_to_gliits()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gp integer;
  v_threshold integer;
  v_ratio integer;
  v_conversions integer;
  v_gliits_credit integer;
  v_new_balance numeric;
begin
  select total_gp into v_gp
  from public.profiles
  where id = auth.uid();

  select gp_to_gliits_threshold, gp_to_gliits_ratio
  into v_threshold, v_ratio
  from public.gliits_config
  where id = 1;

  v_conversions := floor(v_gp / v_threshold);

  if v_conversions = 0 then
    return jsonb_build_object(
      'gp', v_gp,
      'conversions', 0,
      'gliits_credited', 0,
      'message', 'Not enough GP for conversion'
    );
  end if;

  v_gliits_credit := v_conversions * v_ratio;

  update public.profiles
  set wallet_balance = wallet_balance + v_gliits_credit,
      total_gp = total_gp - (v_conversions * v_threshold)
  where id = auth.uid()
  returning wallet_balance into v_new_balance;

  return jsonb_build_object(
    'gp_remaining', v_gp - (v_conversions * v_threshold),
    'conversions', v_conversions,
    'gliits_credited', v_gliits_credit,
    'new_balance', v_new_balance
  );
end;
$$;

grant execute on function public.gliits_gp_to_gliits() to authenticated;


-- ============================================================
-- 7b. AUTO GP→GLIITS CONVERSION TRIGGER
-- When total_gp crosses the threshold, auto-convert and credit wallet
-- ============================================================

create or replace function public.gliits_auto_gp_conversion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold integer;
  v_ratio integer;
  v_conversions integer;
  v_gliits_credit integer;
begin
  -- Only fire if total_gp increased
  if new.total_gp <= old.total_gp then
    return new;
  end if;

  select gp_to_gliits_threshold, gp_to_gliits_ratio
  into v_threshold, v_ratio
  from public.gliits_config
  where id = 1;

  -- Check if we crossed a new threshold
  v_conversions := floor(new.total_gp / v_threshold) - floor(old.total_gp / v_threshold);

  if v_conversions > 0 then
    v_gliits_credit := v_conversions * v_ratio;

    update public.profiles
    set wallet_balance = wallet_balance + v_gliits_credit,
        total_gp = total_gp - (v_conversions * v_threshold)
    where id = new.id;

    -- Log the conversion as a transaction
    insert into public.transactions (user_id, amount, points, type, status, description)
    values (new.id, 0, v_gliits_credit, 'reward', 'success',
      'GP→Gliits conversion: ' || v_conversions || '×' || v_threshold || 'GP = G' || v_gliits_credit);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_gliits_auto_gp_conversion on public.profiles;
create trigger trg_gliits_auto_gp_conversion
  after update of total_gp on public.profiles
  for each row
  execute function public.gliits_auto_gp_conversion();


-- ============================================================
-- 7c. NEW USER ONBOARDING FUNCTION
-- Call this after a new profile is created to set G100 + payngo plan
-- ============================================================

create or replace function public.gliits_onboard_new_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signup_credit integer;
  v_is_registrar boolean;
begin
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
      and role in ('super', 'registrar')
  ) into v_is_registrar;

  if not v_is_registrar then
    raise exception 'REGISTRAR_ONLY';
  end if;

  select signup_credit_gliits into v_signup_credit
  from public.gliits_config
  where id = 1;

  update public.profiles
  set wallet_balance = v_signup_credit
  where id = p_user_id;

  insert into public.gliits_plans (user_id, plan_type, started_at)
  values (p_user_id, 'payngo', now())
  on conflict (user_id) do nothing;
end;
$$;

grant execute on function public.gliits_onboard_new_user(uuid) to authenticated;


-- ============================================================
-- 8. SELF-CHECK
-- ============================================================

do $$
declare
  v_config_count integer;
  v_tables_exist boolean;
  v_planless integer;
begin
  -- Check config table has one row
  select count(*) into v_config_count from public.gliits_config;
  if v_config_count != 1 then
    raise exception 'gliits_config should have exactly 1 row, found %', v_config_count;
  end if;

  -- Check tables exist
  select exists (
    select 1 from information_schema.tables
    where table_name = 'gliits_plans'
  ) into v_tables_exist;
  if not v_tables_exist then
    raise exception 'gliits_plans table not created';
  end if;

  select exists (
    select 1 from information_schema.tables
    where table_name = 'gliits_usage'
  ) into v_tables_exist;
  if not v_tables_exist then
    raise exception 'gliits_usage table not created';
  end if;

  select exists (
    select 1 from information_schema.tables
    where table_name = 'gliits_topups'
  ) into v_tables_exist;
  if not v_tables_exist then
    raise exception 'gliits_topups table not created';
  end if;

  -- Check old tables are gone
  select exists (
    select 1 from information_schema.tables
    where table_name = 'billing_prices'
  ) into v_tables_exist;
  if v_tables_exist then
    raise exception 'billing_prices table still exists — should be dropped';
  end if;

  -- Check trigger exists
  select exists (
    select 1 from information_schema.triggers
    where trigger_name = 'trg_gliits_auto_gp_conversion'
  ) into v_tables_exist;
  if not v_tables_exist then
    raise exception 'trg_gliits_auto_gp_conversion trigger not created';
  end if;

  -- Check all users have plans
  select count(*) into v_planless
  from public.profiles p
  where not exists (select 1 from public.gliits_plans gp where gp.user_id = p.id);
  if v_planless > 0 then
    raise exception '% users still have no gliits_plan', v_planless;
  end if;

  raise notice '✅ Gliits billing system installed successfully';
  raise notice '   - Config: 1 row seeded';
  raise notice '   - Tables: gliits_config, gliits_plans, gliits_usage, gliits_topups';
  raise notice '   - Old billing tables: dropped';
  raise notice '   - All user balances: reset to G100';
  raise notice '   - All users: payngo plan created';
  raise notice '   - Trigger: auto GP→Gliits conversion on total_gp update';
  raise notice '   - RPCs: gliits_get_balance, gliits_heartbeat, gliits_topup_wallet,';
  raise notice '            gliits_set_plan, gliits_get_config, gliits_set_config,';
  raise notice '            gliits_adjust_balance, gliits_gp_to_gliits, gliits_onboard_new_user';
end $$;
