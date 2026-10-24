-- ============================================================
-- Gliimu: Registrar RPCs for Gliits Billing
-- Replaces: sql/registrar.sql (which targeted the old billing tables)
-- Run this in the Supabase SQL Editor after sql/gliits_billing.sql.
-- Safe to run more than once (every object uses CREATE OR REPLACE
-- or IF NOT EXISTS).
--
-- WHAT THIS INSTALLS
--   Read RPCs (registrar only; 'super' passes every check):
--     registrar_overview()          headline Gliits numbers
--     registrar_ledger(...)         the transactions ledger (unchanged)
--     registrar_members(p_q, ...)   member search with plan from gliits_plans
--     registrar_member(p_user)      one member's Gliits picture
--     registrar_revenue()           library + creator + usage revenue
--     registrar_payment_attempts()  recent funding intents
--     registrar_pending_topups()    gliits_topups awaiting verification
--     registrar_audit(p_limit)      the adjustment log (unchanged)
--   Write RPCs, all audited:
--     registrar_verify_topup(p_txn, p_amount, p_reason)
--     registrar_reject_topup(p_txn, p_reason)
--     registrar_adjust_wallet(p_user, p_amount, p_reason)  (unchanged)
--     registrar_extend_subscription(p_user, p_days, p_reason) — now edits gliits_plans
--     registrar_set_config(p_key, p_value, p_reason) — edits gliits_config + audit
--
-- DROPS (old billing RPCs that reference removed tables):
--     registrar_cycles, registrar_set_cycle_status, registrar_set_price
--
-- WHY EVERYTHING IS AN RPC
--   gliits_usage and gliits_topups are locked down (RLS only lets
--   members see their own rows). The registrar reaches them through
--   SECURITY DEFINER functions that check admin_has_role() themselves.
--   Every failure path returns {ok:false, code:...} instead of raising,
--   so one broken card never blanks a whole screen.
--
-- RUN ORDER: after sql/gliits_billing.sql (it creates the gliits_*
--   tables and drops the old billing_* tables).
-- ============================================================

select pg_advisory_xact_lock(hashtext('gliimu-registrar-gliits'));


-- ============================================================
-- 0. DROP OLD BILLING RPCs (tables are already gone)
-- ============================================================

drop function if exists public.registrar_cycles(text, integer, integer) cascade;
drop function if exists public.registrar_set_cycle_status(bigint, text, text, text) cascade;
drop function if exists public.registrar_set_price(text, integer, text) cascade;


-- ============================================================
-- 1. registrar_overview — the finance dashboard in one call
-- ============================================================

create or replace function public.registrar_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid         uuid := auth.uid();
  v_members   jsonb;
  v_plans     jsonb;
  v_usage     jsonb;
  v_topups    jsonb;
  v_config    jsonb;
  v_ledger    jsonb;
  v_ledger30  jsonb;
  v_types     jsonb;
  v_attempts  jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;

  if to_regclass('public.gliits_config') is null
     or to_regclass('public.gliits_plans') is null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_TABLE',
                              'where', 'gliits_config / gliits_plans — run sql/gliits_billing.sql first');
  end if;

  -- Member totals (wallet is now in Gliits, not Naira)
  select jsonb_build_object(
           'total', count(*),
           'with_wallet', count(*) filter (where coalesce(wallet_balance, 0) > 0),
           'wallet_total', coalesce(sum(coalesce(wallet_balance, 0)), 0),
           'gp_total', coalesce(sum(coalesce(total_gp, 0)), 0)
         )
    into v_members
    from public.profiles;

  -- Plan distribution from gliits_plans
  select coalesce(jsonb_object_agg(s.plan_type, s.cnt), '{}'::jsonb)
    into v_plans
    from (select gp.plan_type, count(*) as cnt
            from public.gliits_plans gp
           group by gp.plan_type) s;

  -- Usage totals from gliits_usage
  begin
    select jsonb_build_object(
             'total_minutes', count(*),
             'total_charged', coalesce(sum(u.gliits_charged), 0),
             'total_creator_credited', coalesce(sum(u.creator_credited), 0),
             'last_30_minutes', count(*) filter (where u.minute_at >= now() - interval '30 days'),
             'last_30_charged', coalesce(sum(u.gliits_charged) filter (where u.minute_at >= now() - interval '30 days'), 0)
           )
      into v_usage
      from public.gliits_usage u;
  exception when others then
    v_usage := jsonb_build_object('detail', SQLERRM);
  end;

  -- Topup totals from gliits_topups
  begin
    select jsonb_build_object(
             'total', count(*),
             'total_gliits', coalesce(sum(t.amount_gliits), 0),
             'total_naira', coalesce(sum(t.amount_naira), 0),
             'pending', count(*) filter (where t.payment_status = 'pending'),
             'pending_gliits', coalesce(sum(t.amount_gliits) filter (where t.payment_status = 'pending'), 0),
             'success', count(*) filter (where t.payment_status = 'success'),
             'last_7_days', count(*) filter (where t.created_at >= now() - interval '7 days')
           )
      into v_topups
      from public.gliits_topups t;
  exception when others then
    v_topups := jsonb_build_object('detail', SQLERRM);
  end;

  -- Current config
  select jsonb_build_object(
           'exchange_rate', c.exchange_rate_naira_to_gliits,
           'per_minute', c.per_minute_rate_gliits,
           'plan_monthly', c.plan_monthly_price_gliits,
           'plan_yearly', c.plan_yearly_price_gliits,
           'signup_credit', c.signup_credit_gliits,
           'min_topup', c.min_topup_gliits,
           'creator_rate', c.creator_rate_per_minute,
           'creator_cap', c.creator_cap_per_post_session,
           'idle_timeout', c.idle_timeout_minutes,
           'gp_ratio', c.gp_to_gliits_ratio,
           'gp_threshold', c.gp_to_gliits_threshold,
           'updated_at', c.updated_at
         )
    into v_config
    from public.gliits_config c where c.id = 1;

  -- Transaction ledger totals (still used for manual adjustments)
  begin
    select jsonb_build_object(
             'count', count(*),
             'credits', coalesce(sum(t.amount) filter (where t.amount > 0), 0),
             'debits', coalesce(sum(-t.amount) filter (where t.amount < 0), 0)
           )
      into v_ledger
      from public.transactions t;

    select jsonb_build_object(
             'count', count(*),
             'credits', coalesce(sum(t.amount) filter (where t.amount > 0), 0),
             'debits', coalesce(sum(-t.amount) filter (where t.amount < 0), 0)
           )
      into v_ledger30
      from public.transactions t
     where t.created_at >= now() - interval '30 days';

    select coalesce(jsonb_agg(jsonb_build_object(
             'type', s.type, 'count', s.cnt, 'total', s.total) order by s.total desc), '[]'::jsonb)
      into v_types
      from (select t.type, count(*) as cnt, coalesce(sum(t.amount), 0) as total
              from public.transactions t group by t.type) s;
  exception when others then
    v_ledger := jsonb_build_object('detail', SQLERRM);
  end;

  -- Payment attempts
  if to_regclass('public.payment_attempts') is null then
    v_attempts := jsonb_build_object('total', null, 'last_7_days', null);
  else
    begin
      select jsonb_build_object('total', count(*),
                                'last_7_days', count(*) filter (where pa.created_at >= now() - interval '7 days'))
        into v_attempts
        from public.payment_attempts pa;
    exception when others then
      v_attempts := jsonb_build_object('total', null, 'last_7_days', null, 'detail', SQLERRM);
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'members', v_members,
    'plans', v_plans,
    'usage', v_usage,
    'topups', v_topups,
    'config', v_config,
    'ledger', v_ledger,
    'ledger_30_days', v_ledger30,
    'by_type', v_types,
    'payment_attempts', v_attempts
  );
end
$$;


-- ============================================================
-- 2. registrar_ledger — unchanged (still reads transactions)
--    The amounts are now in Gliits, but the table shape is the same.
-- ============================================================

-- (No change needed — the existing function from registrar.sql still works.
--  It reads from transactions, which still exists.)


-- ============================================================
-- 3. registrar_members — now joins gliits_plans for the plan
-- ============================================================

create or replace function public.registrar_members(p_q text default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_q    text := nullif(btrim(coalesce(p_q, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_rows jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'username', s.username, 'full_name', s.full_name, 'avatar_url', s.avatar_url,
           'wallet_balance', s.wallet_balance, 'total_gp', s.total_gp,
           'plan_type', s.plan_type, 'plan_expires_at', s.plan_expires_at,
           'plan_auto_renew', s.plan_auto_renew)
           order by s.wallet_balance desc, s.full_name nulls last), '[]'::jsonb)
    into v_rows
    from (select p.id, p.username, p.full_name, p.avatar_url,
                 coalesce(p.wallet_balance, 0) as wallet_balance,
                 coalesce(p.total_gp, 0) as total_gp,
                 coalesce(gp.plan_type, 'payngo') as plan_type,
                 gp.expires_at as plan_expires_at,
                 coalesce(gp.auto_renew, true) as plan_auto_renew
            from public.profiles p
            left join public.gliits_plans gp on gp.user_id = p.id
           where v_q is null
              or p.username ilike '%' || v_q || '%'
              or p.full_name ilike '%' || v_q || '%'
           limit v_limit) s;

  return jsonb_build_object('ok', true, 'members', v_rows);
end
$$;


-- ============================================================
-- 4. registrar_member — one member's whole Gliits picture
-- ============================================================

create or replace function public.registrar_member(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_profile jsonb;
  v_plan    jsonb;
  v_usage   jsonb;
  v_topups  jsonb;
  v_buys    jsonb;
  v_sells   jsonb;
  v_edits   jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;

  select jsonb_build_object(
           'id', p.id, 'username', p.username, 'full_name', p.full_name, 'avatar_url', p.avatar_url,
           'wallet_balance', coalesce(p.wallet_balance, 0), 'total_gp', coalesce(p.total_gp, 0),
           'is_admin', coalesce(p.is_admin, false))
    into v_profile
    from public.profiles p
   where p.id = p_user;

  if v_profile is null then
    return jsonb_build_object('ok', false, 'code', 'NO_USER');
  end if;

  -- Current plan from gliits_plans
  select jsonb_build_object(
           'plan_type', gp.plan_type,
           'started_at', gp.started_at,
           'expires_at', gp.expires_at,
           'auto_renew', gp.auto_renew
         )
    into v_plan
    from public.gliits_plans gp
   where gp.user_id = p_user;

  -- Recent usage from gliits_usage
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'post_id', u.post_id, 'minute_at', u.minute_at,
           'gliits_charged', u.gliits_charged, 'creator_credited', u.creator_credited)
           order by u.minute_at desc), '[]'::jsonb)
    into v_usage
    from (select * from public.gliits_usage u
           where u.user_id = p_user
           order by u.minute_at desc limit 100) u;

  -- Topup history from gliits_topups
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'amount_gliits', t.amount_gliits, 'amount_naira', t.amount_naira,
           'payment_reference', t.payment_reference, 'payment_status', t.payment_status,
           'created_at', t.created_at)
           order by t.created_at desc), '[]'::jsonb)
    into v_topups
    from public.gliits_topups t
   where t.user_id = p_user;

  -- Library purchases and sales (still from purchases/library_items)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'item_id', s.item_id, 'title', s.title, 'type', s.type, 'price', s.price)
             order by s.title nulls last), '[]'::jsonb)
      into v_buys
      from (select pu.item_id::text as item_id, li.title, li.type, coalesce(li.price, 0) as price
              from public.purchases pu
              left join public.library_items li on li.id = pu.item_id
             where pu.user_id = p_user) s;

    select coalesce(jsonb_agg(jsonb_build_object(
             'item_id', s.id, 'title', s.title, 'type', s.type, 'price', s.price, 'sales', s.sales)
             order by s.sales desc nulls last), '[]'::jsonb)
      into v_sells
      from (select li.id::text as id, li.title, li.type, coalesce(li.price, 0) as price,
                   (select count(*) from public.purchases pu
                     where pu.item_id = li.id) as sales
              from public.library_items li
             where li.owner_id = p_user) s;
  exception when others then
    v_buys := jsonb_build_object('detail', SQLERRM);
    v_sells := jsonb_build_object('detail', SQLERRM);
  end;

  -- Admin adjustments
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'kind', a.kind, 'amount', a.amount, 'reason', a.reason,
           'applied_by', a.applied_by, 'created_at', a.created_at)
           order by a.created_at desc), '[]'::jsonb)
    into v_edits
    from (select * from public.admin_adjustments a
           where a.user_id = p_user order by a.created_at desc limit 25) a;

  return jsonb_build_object(
    'ok', true,
    'profile', v_profile,
    'plan', v_plan,
    'usage', v_usage,
    'topups', v_topups,
    'purchases', v_buys,
    'feed_items', v_sells,
    'adjustments', v_edits
  );
end
$$;


-- ============================================================
-- 5. registrar_revenue — library + creator + usage from Gliits
-- ============================================================

create or replace function public.registrar_revenue(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_limit  integer := least(greatest(coalesce(p_limit, 100), 1), 300);
  v_items  jsonb;
  v_owners jsonb;
  v_usage  jsonb;
  v_creators jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;

  -- Library sales (from purchases/library_items — unchanged)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'item_id', s.id, 'title', s.title, 'type', s.type, 'price', s.price,
             'owner', s.owner, 'owner_id', s.owner_id, 'sales', s.sales, 'revenue', s.revenue)
             order by s.revenue desc), '[]'::jsonb)
      into v_items
      from (select li.id::text as id, li.title, li.type, coalesce(li.price, 0) as price,
                   li.owner_id,
                   coalesce(op.full_name, op.username, li.author, '—') as owner,
                   (select count(*) from public.purchases pu where pu.item_id = li.id) as sales,
                   (select count(*) from public.purchases pu where pu.item_id = li.id)
                     * coalesce(li.price, 0) as revenue
              from public.library_items li
              left join public.profiles op on op.id = li.owner_id
             order by revenue desc, li.title nulls last
             limit v_limit) s;

    select coalesce(jsonb_agg(jsonb_build_object(
             'owner_id', s.owner_id, 'owner', s.owner, 'items', s.items,
             'sales', s.sales, 'revenue', s.revenue)
             order by s.revenue desc), '[]'::jsonb)
      into v_owners
      from (select li.owner_id,
                   coalesce(max(op.full_name), max(op.username), max(li.author), 'Unattributed') as owner,
                   count(distinct li.id) as items,
                   coalesce(sum((select count(*) from public.purchases pu
                                  where pu.item_id = li.id)), 0) as sales,
                   coalesce(sum((select count(*) from public.purchases pu
                                  where pu.item_id = li.id) * coalesce(li.price, 0)), 0) as revenue
              from public.library_items li
              left join public.profiles op on op.id = li.owner_id
             group by li.owner_id) s;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'SCHEMA_MISMATCH',
                              'where', 'purchases/library_items', 'detail', SQLERRM);
  end;

  -- Usage charges from gliits_usage (replaces billing_events)
  select coalesce(jsonb_agg(jsonb_build_object(
           'event_type', 'heartbeat',
           'events', s.total_minutes,
           'total', s.total_charged,
           'last_30_days', s.last_30_charged)
         ), '[]'::jsonb)
    into v_usage
    from (select count(*) as total_minutes,
                 coalesce(sum(u.gliits_charged), 0) as total_charged,
                 coalesce(sum(u.gliits_charged) filter (where u.minute_at >= now() - interval '30 days'), 0) as last_30_charged
            from public.gliits_usage u) s;

  -- Creator earnings from gliits_usage
  select coalesce(jsonb_agg(jsonb_build_object(
           'creator_id', s.creator_id, 'creator', s.creator,
           'events', s.events, 'total', s.total)
           order by s.total desc), '[]'::jsonb)
    into v_creators
    from (select fg.user_id as creator_id,
                 coalesce(max(p.full_name), max(p.username), '—') as creator,
                 count(*) as events,
                 coalesce(sum(u.creator_credited), 0) as total
            from public.gliits_usage u
            join public.feed_gliims fg on fg.id = u.post_id
            left join public.profiles p on p.id = fg.user_id
           where u.creator_credited > 0
           group by fg.user_id
           order by total desc
           limit v_limit) s;

  return jsonb_build_object('ok', true, 'items', v_items, 'owners', v_owners,
                            'usage', v_usage, 'creators', v_creators);
end
$$;


-- ============================================================
-- 6. registrar_payment_attempts — unchanged
-- ============================================================

-- (No change needed — the existing function from registrar.sql still works.)


-- ============================================================
-- 7. registrar_pending_topups — now reads gliits_topups
-- ============================================================

create or replace function public.registrar_pending_topups(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 300);
  v_total bigint;
  v_rows  jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;

  select count(*) into v_total
    from public.gliits_topups t
   where t.payment_status = 'pending';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'user_id', s.user_id, 'name', s.name, 'username', s.username,
           'amount', s.amount_gliits, 'amount_naira', s.amount_naira,
           'reference', s.payment_reference, 'created_at', s.created_at)
           order by s.created_at asc), '[]'::jsonb)
    into v_rows
    from (select t.id, t.user_id,
                 coalesce(p.full_name, p.username, 'Member') as name, p.username,
                 t.amount_gliits, t.amount_naira, t.payment_reference, t.created_at
            from public.gliits_topups t
            left join public.profiles p on p.id = t.user_id
           where t.payment_status = 'pending'
           order by t.created_at asc
           limit v_limit) s;

  return jsonb_build_object('ok', true, 'total', v_total, 'rows', v_rows);
end
$$;


-- ============================================================
-- 8. registrar_verify_topup — credits a gliits_topups row
-- ============================================================

create or replace function public.registrar_verify_topup(
  p_txn    uuid,
  p_amount integer default null,
  p_reason text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_user   uuid;
  v_status text;
  v_claim  integer;
  v_ref    text;
  v_amount integer;
  v_reason text;
  v_after  numeric;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;

  perform pg_advisory_xact_lock(hashtext('topup_verify:' || p_txn::text));

  select t.user_id, t.payment_status, t.amount_gliits, t.payment_reference
    into v_user, v_status, v_claim, v_ref
    from public.gliits_topups t
   where t.id = p_txn
     for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_status = 'success' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_VERIFIED');
  end if;

  v_amount := coalesce(p_amount, v_claim);
  if v_amount is null or v_amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'BAD_AMOUNT');
  end if;
  if v_amount > 100000000 then
    return jsonb_build_object('ok', false, 'code', 'AMOUNT_TOO_LARGE');
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    v_reason := 'Bank transfer verified against the statement.';
    if v_amount <> coalesce(v_claim, 0) then
      v_reason := v_reason || ' Member claimed ' || coalesce(v_claim, 0)::text
                  || ', credited ' || v_amount::text || '.';
    end if;
  end if;

  v_ref := coalesce(nullif(btrim(coalesce(v_ref, '')), ''), 'topup-' || p_txn::text);

  update public.gliits_topups
     set payment_status = 'success', amount_gliits = v_amount
   where id = p_txn;

  update public.profiles
     set wallet_balance = coalesce(wallet_balance, 0) + v_amount
   where id = v_user
   returning wallet_balance into v_after;

  -- Also log to transactions for the ledger
  insert into public.transactions (user_id, amount, points, type, status, reference, description)
  values (v_user, v_amount, 0, 'topup', 'success', v_ref,
          'Bank transfer verified: ' || left(v_reason, 140));

  insert into public.admin_adjustments (kind, user_id, amount, reason, reference, applied_by)
  values ('wallet', v_user, v_amount, v_reason, v_ref, uid);

  return jsonb_build_object('ok', true, 'amount', v_amount, 'balance', v_after,
                            'reference', v_ref, 'approved_by', uid);
end
$$;


-- ============================================================
-- 9. registrar_reject_topup — marks a gliits_topups row failed
-- ============================================================

create or replace function public.registrar_reject_topup(p_txn uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_user   uuid;
  v_status text;
  v_amount integer;
  v_ref    text;
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

  perform pg_advisory_xact_lock(hashtext('topup_verify:' || p_txn::text));

  select t.user_id, t.payment_status, t.amount_gliits, t.payment_reference
    into v_user, v_status, v_amount, v_ref
    from public.gliits_topups t
   where t.id = p_txn
     for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_status = 'success' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_VERIFIED',
                              'hint', 'That topup is already credited. Debit the wallet instead.');
  end if;

  update public.gliits_topups set payment_status = 'failed' where id = p_txn;

  insert into public.admin_adjustments (kind, user_id, amount, reason, reference, applied_by)
  values ('wallet', v_user, 0, 'Rejected top-up: ' || p_reason,
          coalesce(nullif(btrim(coalesce(v_ref, '')), ''), 'topup-' || p_txn::text), uid);

  return jsonb_build_object('ok', true, 'rejected', coalesce(v_amount, 0));
end
$$;


-- ============================================================
-- 10. registrar_extend_subscription — now edits gliits_plans
-- ============================================================

create or replace function public.registrar_extend_subscription(p_user uuid, p_days integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_plan    text;
  v_exp     timestamptz;
  v_base    timestamptz;
  v_new     timestamptz;
  v_newplan text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;
  if p_days is null or p_days = 0 then
    return jsonb_build_object('ok', false, 'code', 'BAD_DAYS');
  end if;
  if abs(p_days) > 3650 then
    return jsonb_build_object('ok', false, 'code', 'DAYS_TOO_LARGE');
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;

  perform pg_advisory_xact_lock(hashtext('sub_adjust:' || p_user::text));

  select gp.plan_type, gp.expires_at into v_plan, v_exp
    from public.gliits_plans gp
   where gp.user_id = p_user
     for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_USER');
  end if;

  v_plan := coalesce(v_plan, 'payngo');
  v_base := case when p_days > 0 then greatest(coalesce(v_exp, now()), now())
                 else coalesce(v_exp, now()) end;
  v_new  := v_base + make_interval(days => p_days);

  v_newplan := v_plan;
  if v_new <= now() and v_plan in ('monthly', 'yearly') then
    v_newplan := 'payngo';
    v_new := null;
  end if;

  update public.gliits_plans
     set plan_type = v_newplan,
         expires_at = v_new
   where user_id = p_user;

  insert into public.admin_adjustments (kind, user_id, amount, reason, reference, applied_by)
  values ('subscription', p_user, p_days, p_reason, v_plan || ' -> ' || v_newplan, uid);

  return jsonb_build_object('ok', true, 'previous_expiry', v_exp,
                            'subscription_expires_at', v_new,
                            'previous_tier', v_plan, 'tier', v_newplan);
end
$$;


-- ============================================================
-- 11. registrar_set_config — edit gliits_config + audit log
-- ============================================================

create or replace function public.registrar_set_config(p_key text, p_value numeric, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  v_old numeric;
  v_allowlist text[] := array[
    'exchange_rate_naira_to_gliits', 'per_minute_rate_gliits',
    'plan_monthly_price_gliits', 'plan_yearly_price_gliits',
    'signup_credit_gliits', 'min_topup_gliits',
    'creator_rate_per_minute', 'creator_cap_per_post_session',
    'idle_timeout_minutes', 'gp_to_gliits_ratio', 'gp_to_gliits_threshold'
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

  -- Read the old value BEFORE the update
  execute format('select %I from public.gliits_config where id = 1', p_key) into v_old;

  -- Do the update
  execute format(
    'update public.gliits_config set %I = $1, updated_at = now() where id = 1',
    p_key
  ) using p_value;

  insert into public.admin_adjustments (kind, amount, reason, reference, applied_by)
  values ('price', p_value::integer, p_reason, p_key || ': ' || coalesce(v_old::text, '?') || ' -> ' || p_value::text, uid);

  return jsonb_build_object('ok', true, 'key', p_key, 'previous', v_old, 'amount', p_value);
end
$$;


-- ============================================================
-- 12. registrar_adjust_wallet — unchanged (still works)
-- ============================================================

-- (No change needed — the existing function from registrar.sql still works.
--  It writes to transactions and profiles.wallet_balance, both of which
--  still exist. The amounts are now in Gliits.)


-- ============================================================
-- 13. registrar_audit — unchanged (still reads admin_adjustments)
-- ============================================================

-- (No change needed — the existing function from registrar.sql still works.)


-- ============================================================
-- 14. Grants
-- ============================================================

revoke execute on function public.registrar_overview() from public, anon;
revoke execute on function public.registrar_members(text, integer) from public, anon;
revoke execute on function public.registrar_member(uuid) from public, anon;
revoke execute on function public.registrar_revenue(integer) from public, anon;
revoke execute on function public.registrar_pending_topups(integer) from public, anon;
revoke execute on function public.registrar_verify_topup(uuid, integer, text) from public, anon;
revoke execute on function public.registrar_reject_topup(uuid, text) from public, anon;
revoke execute on function public.registrar_extend_subscription(uuid, integer, text) from public, anon;
revoke execute on function public.registrar_set_config(text, numeric, text) from public, anon;

grant execute on function public.registrar_overview() to authenticated, service_role;
grant execute on function public.registrar_members(text, integer) to authenticated, service_role;
grant execute on function public.registrar_member(uuid) to authenticated, service_role;
grant execute on function public.registrar_revenue(integer) to authenticated, service_role;
grant execute on function public.registrar_pending_topups(integer) to authenticated, service_role;
grant execute on function public.registrar_verify_topup(uuid, integer, text) to authenticated, service_role;
grant execute on function public.registrar_reject_topup(uuid, text) to authenticated, service_role;
grant execute on function public.registrar_extend_subscription(uuid, integer, text) to authenticated, service_role;
grant execute on function public.registrar_set_config(text, numeric, text) to authenticated, service_role;

-- Keep grants for unchanged functions
grant execute on function public.registrar_ledger(text, text, uuid, integer, integer) to authenticated, service_role;
grant execute on function public.registrar_payment_attempts(integer) to authenticated, service_role;
grant execute on function public.registrar_audit(integer) to authenticated, service_role;
grant execute on function public.registrar_adjust_wallet(uuid, integer, text) to authenticated, service_role;


-- ============================================================
-- 15. SELF CHECK
-- ============================================================

notify pgrst, 'reload schema';

select s.item, s.result
from (
  select 1 as n, 'gliits_config table' as item,
         case when to_regclass('public.gliits_config') is not null
              then 'OK' else 'MISSING — run sql/gliits_billing.sql first' end as result
  union all
  select 2, 'gliits_plans table',
         case when to_regclass('public.gliits_plans') is not null
              then 'OK' else 'MISSING' end
  union all
  select 3, 'gliits_usage table',
         case when to_regclass('public.gliits_usage') is not null
              then 'OK' else 'MISSING' end
  union all
  select 4, 'gliits_topups table',
         case when to_regclass('public.gliits_topups') is not null
              then 'OK' else 'MISSING' end
  union all
  select 5, 'old billing_cycles table dropped',
         case when to_regclass('public.billing_cycles') is null
              then 'OK' else 'STILL EXISTS — run sql/gliits_billing.sql to drop it' end
  union all
  select 6, 'registrar functions installed',
         (select count(*)::text || ' of 12'
            from pg_proc p
            join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.proname like 'registrar\_%')
  union all
  select 7, 'members with a Gliits plan',
         (select count(*)::text from public.gliits_plans)
  union all
  select 8, 'plan distribution',
         coalesce((select string_agg(plan_type || ':' || cnt, ', ' order by plan_type)
                     from (select plan_type, count(*) as cnt from public.gliits_plans group by plan_type) s),
                  'none')
  union all
  select 9, 'usage rows',
         (select count(*)::text from public.gliits_usage)
  union all
  select 10, 'total Gliits charged',
         (select coalesce(sum(gliits_charged), 0)::text from public.gliits_usage)
  union all
  select 11, 'total creator credited',
         (select coalesce(sum(creator_credited), 0)::text from public.gliits_usage)
  union all
  select 12, 'topups pending',
         (select count(*)::text || ' claimed, worth ' || coalesce(sum(amount_gliits), 0)::text || ' G'
            from public.gliits_topups where payment_status = 'pending')
  union all
  select 13, 'wallet float, all members (G)',
         (select coalesce(sum(coalesce(wallet_balance, 0)), 0)::text from public.profiles)
  union all
  select 14, 'current config',
         (select 'rate=' || per_minute_rate_gliits || '/min, monthly=' || plan_monthly_price_gliits
                  || ', yearly=' || plan_yearly_price_gliits || ', creator=' || creator_rate_per_minute || '/min'
            from public.gliits_config where id = 1)
  union all
  select 15, 'audit log rows',
         (select count(*)::text from public.admin_adjustments)
) s
order by s.n;
