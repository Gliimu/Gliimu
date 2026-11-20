-- ============================================================
-- plan_lineup.sql — the two-plan lineup, the host fee, and the end
-- of creator credits that nobody paid for.
--
-- Idempotent. Run the whole file once, top to bottom. Re-running it
-- is safe.
--
-- What this changes
--   1. gliits_config gains live_host_fee_gliits, and both config
--      writers accept the new key, so Operations can change the fee
--      from the admin Config tab.
--   2. start_live_session charges the host that fee once per session,
--      before the room is allowed to go active.
--   3. The Live hosting plan gate is deleted. Anyone can host.
--   4. Every member is metered at the config rate. The old rule
--      exempted anybody holding a not-yet-expired Monthly or Yearly
--      row, and the creator credit was minted even on those exempt
--      minutes.
--   5. gliits_set_plan answers to payngo only.
--   6. Members still inside a paid period keep it until it expires;
--      a nightly sweep then moves them to the default plan.
--
-- What this does NOT touch
--   * effective_tier() stays. admin_member_lookup still reads it, and
--     dropping the trigger does not make the helper dead.
--   * plan_monthly_price_gliits and plan_yearly_price_gliits columns
--     stay so this file can be rolled back. Dropping them is a
--     separate, destructive step that has not been approved.
--   * No historical rows are rewritten. The 181.50 tokens already
--     minted with no charge behind them stay in the ledger; this file
--     stops the leak rather than reversing it.
--
-- Live state this was written against (read 2026-11-19)
--   gliits_config has no live_host_fee_gliits column.
--   Trigger enforce_live_subscription is attached to live_requests.
--   12 profiles, 12 gliits_plans rows: 10 payngo, 2 monthly.
--   The 2 monthly rows expire 2026-11-27 and 2026-11-28, so this file
--   converts nobody on the day it runs; the cron does it after.
--   transactions.amount is integer, so the fee column is integer too
--   and the ledger never rounds away from the wallet.
-- ============================================================


-- ============================================================
-- 1. The host fee knob.
-- ============================================================
alter table public.gliits_config
  add column if not exists live_host_fee_gliits integer not null default 1;


-- ============================================================
-- 2. start_live_session — the host pays to go on air.
--
--    Body is the live one (md5 9be20c3f…, 1026 chars) with the fee
--    block added between the SESSION_NOT_OPEN check and the status
--    update. The already_live return above it is what makes the
--    charge once-per-session rather than once-per-click.
-- ============================================================
create or replace function public.start_live_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rec record;
  v_status text;
  v_fee numeric;
  v_bal numeric;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select id, user_id, status, room_id, room_url
    into v_rec
    from public.live_requests
   where id = p_session_id;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if v_rec.user_id is distinct from v_uid then
    raise exception 'NOT_SESSION_OWNER';
  end if;

  if v_rec.status = 'active' then
    return jsonb_build_object('session_id', v_rec.id, 'already_live', true,
                              'room_id', v_rec.room_id, 'room_url', v_rec.room_url,
                              'host_fee', 0);
  end if;
  if v_rec.status <> 'open' then
    raise exception 'SESSION_NOT_OPEN';
  end if;

  -- Two tabs on "Go on air" at the same instant would both read
  -- status = open and both pay. The lock makes the second one arrive
  -- after the first has already flipped the row to active.
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select lr.status into v_status
    from public.live_requests lr where lr.id = p_session_id;
  if v_status = 'active' then
    return jsonb_build_object('session_id', p_session_id, 'already_live', true,
                              'host_fee', 0);
  end if;
  if v_status <> 'open' then
    raise exception 'SESSION_NOT_OPEN';
  end if;

  select coalesce(c.live_host_fee_gliits, 0) into v_fee
    from public.gliits_config c where c.id = 1;

  select coalesce(p.wallet_balance, 0) into v_bal
    from public.profiles p where p.id = v_uid;

  if v_fee > 0 then
    if v_bal < v_fee then
      raise exception 'INSUFFICIENT_BALANCE';
    end if;

    v_bal := v_bal - v_fee;

    update public.profiles
       set wallet_balance = v_bal
     where id = v_uid;

    insert into public.transactions (user_id, amount, type, status, description)
    values (v_uid, -round(v_fee), 'live_host_fee', 'success', 'Hosted a live session');
  end if;

  update public.live_requests
     set status       = 'active',
         started_at   = now(),
         activated_at = now()
   where id = v_rec.id;

  return jsonb_build_object('session_id', v_rec.id, 'already_live', false,
                            'room_id', v_rec.room_id, 'room_url', v_rec.room_url,
                            'host_fee', v_fee, 'balance', v_bal);
end;
$$;


-- ============================================================
-- 3. The hosting gate goes away: anyone can host.
--
--    The trigger only ever blocked members with no plan row or an
--    expired one, because gliits_set_plan minted a row for everybody.
--    All 12 members hold a row, so it has blocked nobody in
--    production — but its copy blamed Monthly, which no longer
--    exists. The rule is now "anyone can host, everybody pays the
--    config rate", so the gate has nothing left to decide.
-- ============================================================
drop trigger if exists enforce_live_subscription on public.live_requests;
drop function if exists public.enforce_live_subscription();


-- ============================================================
-- 4. The meter itself — two lines change.
--
--    a) The metering rule is inverted onto the expiry, not the plan
--       name: a minute is billable unless the member is inside a paid
--       period that has not run out yet. Writing it as a whitelist of
--       'payngo' would have silently un-metered every plan added
--       later. `expires_at is null` is checked first so a null
--       expiry never falls through a three-valued predicate.
--    b) The creator credit now sits behind the charge. It used to run
--       whenever creator_rate > 0, so an exempt minute — or any minute
--       at all for a member the meter was not billing — printed 1.50
--       tokens into the author's wallet out of nothing. In production
--       that minted 181.50 tokens, 28.5% of every creator credit ever
--       paid.
-- ============================================================
drop function if exists public.gliits_heartbeat(uuid);
drop function if exists public.gliits_heartbeat(uuid, uuid);

create or replace function public.gliits_heartbeat(
  p_post_id uuid default null,
  p_session_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_rate numeric; v_creator_rate numeric; v_cap numeric;
  v_plan_type text; v_plan_expires timestamptz; v_metered boolean;
  v_balance numeric; v_owner uuid; v_target text := 'none';
  v_earned numeric; v_charge numeric := 0; v_credit numeric := 0;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select c.per_minute_rate_gliits, c.creator_rate_per_minute, c.creator_cap_per_post_session::numeric
    into v_rate, v_creator_rate, v_cap from public.gliits_config c where c.id = 1;
  if v_rate is null then raise exception 'NO_CONFIG'; end if;
  if p_session_id is not null then
    select lr.user_id into v_owner from public.live_requests lr
     where lr.id = p_session_id and lr.status = 'active' and lr.user_id is not null;
    if found then v_target := 'session'; end if;
  end if;
  if v_target = 'none' and p_post_id is not null then
    select f.user_id into v_owner from public.feed_gliims f
     where f.id = p_post_id and f.deleted_at is null;
    if found then v_target := 'post'; end if;
  end if;
  if v_target = 'none' then
    return jsonb_build_object('balance', (select coalesce(wallet_balance,0) from public.profiles where id = v_user),
      'charged', 0, 'creator_credited', 0, 'target', 'none');
  end if;
  select p.plan_type, p.expires_at into v_plan_type, v_plan_expires from public.gliits_plans p where p.user_id = v_user;
  v_metered := v_plan_expires is null or v_plan_expires <= now();
  select coalesce(pr.wallet_balance, 0) into v_balance from public.profiles pr where pr.id = v_user;
  if v_owner <> v_user then
    if v_metered then
      if v_balance < v_rate then raise exception 'INSUFFICIENT_BALANCE'; end if;
      v_charge := v_rate;
    end if;
    -- No payment, no credit. This is the line that was missing.
    if v_charge > 0 and v_creator_rate > 0 then
      if v_target = 'session' then
        select coalesce(sum(u.creator_credited), 0) into v_earned from public.gliits_usage u
         where u.user_id = v_user and u.session_id = p_session_id and u.minute_at >= now() - interval '24 hours';
      else
        select coalesce(sum(u.creator_credited), 0) into v_earned from public.gliits_usage u
         where u.user_id = v_user and u.post_id = p_post_id and u.minute_at >= now() - interval '24 hours';
      end if;
      if v_earned < v_cap then
        v_credit := least(v_creator_rate, v_cap - v_earned);
        update public.profiles set wallet_balance = wallet_balance + v_credit where id = v_owner;
      end if;
    end if;
    if v_charge > 0 then
      update public.profiles set wallet_balance = wallet_balance - v_charge where id = v_user;
    end if;
    if v_charge > 0 or v_credit > 0 then
      insert into public.gliits_usage (user_id, post_id, session_id, gliits_charged, creator_credited)
      values (v_user, case when v_target='post' then p_post_id end, case when v_target='session' then p_session_id end, v_charge, v_credit);
    end if;
  end if;
  return jsonb_build_object('balance', v_balance - v_charge, 'charged', v_charge,
    'creator_credited', v_credit, 'target', v_target, 'metered', v_metered);
end;
$$;

revoke execute on function public.gliits_heartbeat(uuid, uuid) from public, anon;
grant execute on function public.gliits_heartbeat(uuid, uuid) to authenticated, service_role;


-- ============================================================
-- 5. The door check answers with the same metering rule, so a member
--    never gets in and is then refused a minute.
-- ============================================================
create or replace function public.gliits_live_entry_check(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid(); v_host uuid; v_status text; v_rate numeric; v_balance numeric;
  v_plan_type text; v_plan_expires timestamptz; v_metered boolean; v_allowed boolean;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select lr.user_id, lr.status into v_host, v_status from public.live_requests lr where lr.id = p_session_id;
  if not found then return jsonb_build_object('allowed', false, 'reason', 'SESSION_NOT_FOUND'); end if;
  if v_status <> 'active' then
    return jsonb_build_object('allowed', false, 'reason', coalesce(upper(v_status),'UNKNOWN'), 'is_host', (v_host = v_user));
  end if;
  if v_host = v_user then return jsonb_build_object('allowed', true, 'reason', 'host', 'is_host', true); end if;
  select c.per_minute_rate_gliits into v_rate from public.gliits_config c where c.id = 1;
  select coalesce(pr.wallet_balance, 0) into v_balance from public.profiles pr where pr.id = v_user;
  select p.plan_type, p.expires_at into v_plan_type, v_plan_expires from public.gliits_plans p where p.user_id = v_user;
  v_metered := v_plan_expires is null or v_plan_expires <= now();
  v_allowed := (not v_metered) or (v_balance >= coalesce(v_rate, 0));
  return jsonb_build_object('allowed', v_allowed, 'reason', case when v_allowed then 'ok' else 'INSUFFICIENT_BALANCE' end,
    'is_host', false, 'metered', v_metered, 'rate', v_rate, 'balance', v_balance);
end;
$$;

revoke execute on function public.gliits_live_entry_check(uuid) from public, anon;
grant execute on function public.gliits_live_entry_check(uuid) to authenticated, service_role;


-- ============================================================
-- 6. gliits_set_plan — payngo is the only thing a member can choose.
--
--    The monthly and yearly branches took plan_monthly_price_gliits
--    and plan_yearly_price_gliits out of the wallet and bought an
--    unmetered period. Neither price nor period is sold any more, so
--    both branches are gone rather than left to error later.
--
--    PLAN_PERIOD_ACTIVE is here so a member who is still inside paid
--    time cannot click their way out of it and throw the rest away.
-- ============================================================
create or replace function public.gliits_set_plan(p_plan_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if coalesce(p_plan_type, '') <> 'payngo' then
    raise exception 'INVALID_PLAN_TYPE';
  end if;

  select g.expires_at into v_expires
    from public.gliits_plans g
   where g.user_id = v_uid;

  if v_expires is not null and v_expires > now() then
    raise exception 'PLAN_PERIOD_ACTIVE';
  end if;

  select coalesce(p.wallet_balance, 0) into v_balance
    from public.profiles p
   where p.id = v_uid;

  insert into public.gliits_plans (user_id, plan_type, started_at, expires_at, auto_renew)
  values (v_uid, 'payngo', now(), null, false)
  on conflict (user_id) do update
    set plan_type  = excluded.plan_type,
        started_at = excluded.started_at,
        expires_at = null,
        auto_renew = false;

  return jsonb_build_object('plan_type', 'payngo', 'expires_at', null, 'balance', v_balance);
end;
$$;

revoke execute on function public.gliits_set_plan(text) from public, anon;
grant execute on function public.gliits_set_plan(text) to authenticated;


-- ============================================================
-- 7. Grandfathering: run out the paid period, then the default plan.
--
--    Deliberately narrow. A row is only touched when its paid time
--    has already ended — nothing here shortens a period anybody bought.
-- ============================================================
create or replace function public.gliits_expire_legacy_plans()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.gliits_plans
     set plan_type  = 'payngo',
         expires_at = null,
         auto_renew = false
   where plan_type in ('monthly', 'yearly')
     and expires_at is not null
     and expires_at <= now();

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.gliits_expire_legacy_plans() from public, anon, authenticated;
grant execute on function public.gliits_expire_legacy_plans() to service_role;

create extension if not exists pg_cron;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'expire-legacy-plans';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'expire-legacy-plans',
  '17 3 * * *',
  $cron$ select public.gliits_expire_legacy_plans(); $cron$
);

-- Run it once now, so a period that ended between two nightly runs is
-- closed the moment this script is applied.
select public.gliits_expire_legacy_plans();


-- ============================================================
-- 8. Both config writers have to know the new key.
--
--    They hard-code their own allowlists, so an un-listed key is
--    refused no matter what the table holds. registrar_set_config is
--    the one the admin Config tab saves through; gliits_set_config is
--    the older writer, still granted to authenticated, so it answers
--    to the same list.
--
--    Bodies are the live ones (md5 76eb2c83… / 63d8ba99…) with
--    'live_host_fee_gliits' added and nothing else changed.
-- ============================================================
create or replace function public.registrar_set_config(
  p_key text,
  p_value numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  v_old numeric;
  v_guard jsonb;
  v_allowlist text[] := array[
    'exchange_rate_naira_to_gliits', 'per_minute_rate_gliits',
    'plan_monthly_price_gliits', 'plan_yearly_price_gliits',
    'signup_credit_gliits', 'min_topup_gliits',
    'creator_rate_per_minute', 'creator_cap_per_post_session',
    'idle_timeout_minutes', 'gp_to_gliits_ratio', 'gp_to_gliits_threshold',
    'min_withdrawal_gliits', 'max_withdrawal_gliits', 'withdrawal_hold_hours',
    'live_host_fee_gliits'
  ];
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;
  if coalesce(btrim(coalesce(p_reason, '')), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;
  if not (p_key = any(v_allowlist)) then
    return jsonb_build_object('ok', false, 'code', 'BAD_EVENT_TYPE');
  end if;

  v_guard := public.gliits_config_guard(p_key, p_value);
  if coalesce((v_guard ->> 'ok')::boolean, false) is not true then
    return v_guard || jsonb_build_object('key', p_key, 'attempted', p_value);
  end if;

  execute format('select %I from public.gliits_config where id = 1', p_key) into v_old;

  execute format(
    'update public.gliits_config set %I = $1, updated_at = now() where id = 1',
    p_key
  ) using p_value;

  insert into public.admin_adjustments (kind, amount, reason, reference, applied_by)
  values ('price', p_value::integer, p_reason,
          p_key || ': ' || coalesce(v_old::text, '?') || ' -> ' || p_value::text, uid);

  return jsonb_build_object('ok', true, 'key', p_key, 'previous', v_old, 'amount', p_value,
                            'warnings', v_guard -> 'warnings',
                            'preview', v_guard -> 'preview');
end;
$$;

revoke execute on function public.registrar_set_config(text, numeric, text)
  from public, anon;
grant execute on function public.registrar_set_config(text, numeric, text)
  to authenticated, service_role;


create or replace function public.gliits_set_config(p_key text, p_value numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_registrar boolean;
  v_guard jsonb;
begin
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
      and role in ('super', 'registrar')
  ) into v_is_registrar;

  if not v_is_registrar then
    raise exception 'REGISTRAR_ONLY';
  end if;

  if p_key not in (
    'exchange_rate_naira_to_gliits', 'per_minute_rate_gliits',
    'plan_monthly_price_gliits', 'plan_yearly_price_gliits',
    'signup_credit_gliits', 'min_topup_gliits',
    'creator_rate_per_minute', 'creator_cap_per_post_session',
    'idle_timeout_minutes', 'gp_to_gliits_ratio', 'gp_to_gliits_threshold',
    'min_withdrawal_gliits', 'max_withdrawal_gliits', 'withdrawal_hold_hours',
    'live_host_fee_gliits'
  ) then
    raise exception 'INVALID_CONFIG_KEY';
  end if;

  v_guard := public.gliits_config_guard(p_key, p_value);
  if coalesce((v_guard ->> 'ok')::boolean, false) is not true then
    raise exception 'PRICING_GUARD %', coalesce(v_guard ->> 'code', 'BLOCKED');
  end if;

  execute format(
    'update public.gliits_config set %I = $1, updated_at = now() where id = 1',
    p_key
  ) using p_value;

  return public.gliits_get_config();
end;
$$;

revoke execute on function public.gliits_set_config(text, numeric) from public, anon;
grant execute on function public.gliits_set_config(text, numeric) to authenticated, service_role;


-- ============================================================
-- SELF CHECK — one paste, one grid. Every result column must read
-- PASS. A FAIL line names what to look at.
-- ============================================================
select * from (
  select 1 as ord, 'host fee column exists' as check_name,
    'integer, not null, default 1' as expected,
    (select data_type || ', ' || case when is_nullable = 'NO' then 'not null' else 'null' end
            || ', default ' || coalesce(column_default, 'none')
       from information_schema.columns
      where table_schema = 'public' and table_name = 'gliits_config'
        and column_name = 'live_host_fee_gliits') as actual,
    case when (select count(*) from information_schema.columns
                where table_schema = 'public' and table_name = 'gliits_config'
                  and column_name = 'live_host_fee_gliits'
                  and data_type = 'integer' and is_nullable = 'NO') = 1
         then 'PASS' else 'FAIL' end as result

  union all
  select 2, 'host fee current value', '1',
    (select live_host_fee_gliits::text from public.gliits_config where id = 1),
    case when (select live_host_fee_gliits from public.gliits_config where id = 1) = 1
         then 'PASS' else 'FAIL' end

  union all
  select 3, 'hosting gate trigger gone', '0 rows attached',
    (select count(*)::text || ' row(s) on live_requests'
       from pg_trigger t join pg_class cl on cl.oid = t.tgrelid
      where cl.relname = 'live_requests' and t.tgname = 'enforce_live_subscription'
        and not t.tgisinternal),
    case when not exists (select 1 from pg_trigger t
                           join pg_class cl on cl.oid = t.tgrelid
                          where cl.relname = 'live_requests'
                            and t.tgname = 'enforce_live_subscription'
                            and not t.tgisinternal)
         then 'PASS' else 'FAIL' end

  union all
  select 4, 'gate function dropped, helper kept', 'enforce_live_subscription absent; effective_tier present',
    (select coalesce(string_agg(proname, ' + ' order by proname), 'neither')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and proname in ('enforce_live_subscription', 'effective_tier')),
    case when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public' and proname = 'enforce_live_subscription')
          and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and proname = 'effective_tier')
         then 'PASS' else 'FAIL' end

  union all
  select 5, 'meter reads the expiry, not the plan name', '2 of 2 functions',
    (select count(*)::text || ' of 2'
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and proname in ('gliits_heartbeat', 'gliits_live_entry_check')
        and prosrc like '%v_metered := v_plan_expires is null or v_plan_expires <= now()%'),
    case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and proname in ('gliits_heartbeat', 'gliits_live_entry_check')
                  and prosrc like '%v_metered := v_plan_expires is null or v_plan_expires <= now()%') = 2
         then 'PASS' else 'FAIL' end

  union all
  select 6, 'no old whitelist left in the meter', 'no match',
    (select count(*)::text || ' match(es)'
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and proname in ('gliits_heartbeat', 'gliits_live_entry_check')
        and prosrc like '%v_plan_type = ''payngo%'),
    case when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public'
                             and proname in ('gliits_heartbeat', 'gliits_live_entry_check')
                             and prosrc like '%v_plan_type = ''payngo%')
         then 'PASS' else 'FAIL' end

  union all
  select 7, 'credit follows the charge', 'v_charge > 0 and v_creator_rate > 0',
    (select case when prosrc like '%if v_charge > 0 and v_creator_rate > 0 then%'
                 then 'present' else 'absent' end
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname = 'gliits_heartbeat'),
    case when (select prosrc like '%if v_charge > 0 and v_creator_rate > 0 then%'
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and proname = 'gliits_heartbeat')
         then 'PASS' else 'FAIL' end

  union all
  select 8, 'set_plan sells payngo only', 'no monthly/yearly branch',
    (select coalesce(string_agg(case when prosrc like '%monthly%' then 'still sells ' || proname else proname || ': clean' end, ' | ')
                       , 'function missing')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname = 'gliits_set_plan'),
    case when (select prosrc not like '%monthly%' and prosrc not like '%yearly%'
                and prosrc like '%INVALID_PLAN_TYPE%' and prosrc like '%PLAN_PERIOD_ACTIVE%'
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and proname = 'gliits_set_plan')
         then 'PASS' else 'FAIL' end

  union all
  select 9, 'both config writers take the fee key', '2 of 2',
    (select count(*)::text || ' of 2'
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and proname in ('registrar_set_config', 'gliits_set_config')
        and prosrc like '%live_host_fee_gliits%'),
    case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and proname in ('registrar_set_config', 'gliits_set_config')
                  and prosrc like '%live_host_fee_gliits%') = 2
         then 'PASS' else 'FAIL' end

  union all
  select 10, 'expiry sweep scheduled in pg_cron', 'expire-legacy-plans | 17 3 * * *',
    (select coalesce(string_agg(jobname || ' | ' || schedule, ', '), 'no job')
       from cron.job where jobname = 'expire-legacy-plans'),
    case when (select count(*) from cron.job
                where jobname = 'expire-legacy-plans' and schedule = '17 3 * * *') = 1
         then 'PASS' else 'FAIL' end

  union all
  select 11, 'no plan row sits outside the lineup', 'payngo only, or paid time still running',
    (select count(*)::text || ' unexpected row(s)'
       from public.gliits_plans
      where plan_type not in ('payngo', 'monthly', 'yearly')
         or (plan_type in ('monthly', 'yearly') and expires_at is not null and expires_at <= now())),
    case when not exists (select 1 from public.gliits_plans
                           where plan_type not in ('payngo', 'monthly', 'yearly')
                              or (plan_type in ('monthly', 'yearly')
                                  and expires_at is not null and expires_at <= now()))
         then 'PASS' else 'FAIL' end

  union all
  select 12, 'grandfathered members', 'every legacy row still inside paid time',
    (select coalesce(string_agg(plan_type || ' until ' || expires_at::date::text, ', '), 'none left')
       from public.gliits_plans
      where plan_type in ('monthly', 'yearly')),
    case when not exists (select 1 from public.gliits_plans
                           where plan_type in ('monthly', 'yearly')
                             and (expires_at is null or expires_at <= now()))
         then 'PASS' else 'FAIL' end
) grid
order by ord;
