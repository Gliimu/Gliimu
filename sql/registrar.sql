-- ============================================================
-- Gliimu: Registrar RPCs — member management for Operations admin
--
-- These RPCs power the Operations > Members screen. They provide:
--   * Search/list members with wallet, GP, and plan info
--   * Detailed member view with usage, topups, purchases, adjustments
--   * Manual wallet adjustments (credit/debit)
--   * Manual plan day adjustments (grant/remove days)
--
-- All operations are logged to registrar_adjustments for audit.
-- Requires: sql/gliits_billing.sql (for wallet/subscription tables)
--
-- Run AFTER sql/admin.sql (admin_has_role helper).
-- Safe to rerun: all definitions are idempotent.
-- ============================================================

begin;

-- ============================================================
-- 1. Member search — Operations admin lists members with key metrics.
--    Returns first p_limit members matching the search query.
-- ============================================================

create or replace function public.registrar_members(
  p_q text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_members jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;

  select jsonb_agg(jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'username', p.username,
    'wallet_balance', coalesce(w.balance, 0),
    'total_gp', coalesce(p.total_gp, 0),
    'plan_type', s.plan_type,
    'plan_expires_at', s.expires_at
  ))
  into v_members
  from public.profiles p
  left join public.gliits_wallets w on w.user_id = p.id
  left join public.gliits_subscriptions s on s.user_id = p.id
  where (
    p_q is null
    or p.full_name ilike '%' || p_q || '%'
    or p.username ilike '%' || p_q || '%'
  )
  order by p.created_at desc
  limit p_limit;

  return jsonb_build_object('ok', true, 'members', coalesce(v_members, '[]'::jsonb));
end
$$;

revoke execute on function public.registrar_members(text, integer) from public, anon;
grant execute on function public.registrar_members(text, integer) to authenticated, service_role;

-- ============================================================
-- 2. Single member detail — full profile with usage, topups, purchases.
--    Returns everything the drawer needs to display.
-- ============================================================

drop function if exists public.registrar_member(uuid);

create or replace function public.registrar_member(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_profile jsonb;
  v_plan jsonb;
  v_usage jsonb;
  v_topups jsonb;
  v_purchases jsonb;
  v_feed_items jsonb;
  v_adjustments jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;

  -- Profile with verification_badge
  select jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'username', p.username,
    'wallet_balance', coalesce(w.balance, 0),
    'total_gp', coalesce(p.total_gp, 0),
    'is_admin', coalesce(p.is_admin, false),
    'verification_badge', p.verification_badge
  )
  into v_profile
  from public.profiles p
  left join public.gliits_wallets w on w.user_id = p.id
  where p.id = p_user;

  if v_profile is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- Plan details
  select jsonb_build_object(
    'plan_type', s.plan_type,
    'started_at', s.started_at,
    'expires_at', s.expires_at,
    'auto_renew', coalesce(s.auto_renew, false)
  )
  into v_plan
  from public.gliits_subscriptions s
  where s.user_id = p_user;

  -- Usage (last 50 minutes)
  select jsonb_agg(jsonb_build_object(
    'minute_at', u.minute_at,
    'gliits_charged', u.gliits_charged,
    'creator_credited', u.creator_credited
  ))
  into v_usage
  from (
    select minute_at, gliits_charged, creator_credited
    from public.gliits_usage
    where user_id = p_user
    order by minute_at desc
    limit 50
  ) u;

  -- Topups (last 15)
  select jsonb_agg(jsonb_build_object(
    'created_at', t.created_at,
    'payment_status', t.payment_status,
    'amount_gliits', t.amount_gliits,
    'amount_naira', t.amount_naira,
    'payment_reference', t.payment_reference
  ))
  into v_topups
  from (
    select created_at, payment_status, amount_gliits, amount_naira, payment_reference
    from public.gliits_topups
    where user_id = p_user
    order by created_at desc
    limit 15
  ) t;

  -- Purchases (library items bought)
  begin
    select jsonb_agg(jsonb_build_object(
      'item_id', li.id,
      'title', li.title,
      'price', lc.price
    ))
    into v_purchases
    from public.library_purchases lp
    join public.library_items li on li.id = lp.item_id
    left join public.library_contents lc on lc.item_id = li.id
    where lp.user_id = p_user;
  exception when undefined_table or undefined_column then
    v_purchases := null;
  end;

  -- Feed items (gliims/posts sold)
  begin
    select jsonb_agg(jsonb_build_object(
      'title', f.title,
      'price', f.price,
      'sales', coalesce(f.sales_count, 0)
    ))
    into v_feed_items
    from public.feed_gliims f
    where f.user_id = p_user;
  exception when undefined_table or undefined_column then
    v_feed_items := null;
  end;

  -- Admin adjustments
  select jsonb_agg(jsonb_build_object(
    'created_at', a.created_at,
    'kind', a.kind,
    'amount', a.amount,
    'reason', a.reason
  ))
  into v_adjustments
  from (
    select created_at, kind, amount, reason
    from public.registrar_adjustments
    where user_id = p_user
    order by created_at desc
    limit 50
  ) a;

  return jsonb_build_object(
    'ok', true,
    'profile', v_profile,
    'plan', coalesce(v_plan, '{}'::jsonb),
    'usage', coalesce(v_usage, '[]'::jsonb),
    'topups', coalesce(v_topups, '[]'::jsonb),
    'purchases', v_purchases,
    'feed_items', v_feed_items,
    'adjustments', coalesce(v_adjustments, '[]'::jsonb)
  );
end
$$;

revoke execute on function public.registrar_member(uuid) from public, anon;
grant execute on function public.registrar_member(uuid) to authenticated, service_role;

-- ============================================================
-- 3. Ledger entries — transaction history for a member.
-- ============================================================

create or replace function public.registrar_ledger(
  p_type text default null,
  p_status text default null,
  p_user uuid default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_rows jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;

  select jsonb_agg(jsonb_build_object(
    'id', l.id,
    'created_at', l.created_at,
    'user_id', l.user_id,
    'type', l.type,
    'description', l.description,
    'amount', l.amount,
    'balance_after', l.balance_after
  ))
  into v_rows
  from (
    select id, created_at, user_id, type, description, amount, balance_after
    from public.gliits_ledger
    where (p_user is null or user_id = p_user)
      and (p_type is null or type = p_type)
      and (p_status is null or status = p_status)
    order by created_at desc
    limit p_limit
    offset p_offset
  ) l;

  return jsonb_build_object('ok', true, 'rows', coalesce(v_rows, '[]'::jsonb));
end
$$;

revoke execute on function public.registrar_ledger(text, text, uuid, integer, integer) from public, anon;
grant execute on function public.registrar_ledger(text, text, uuid, integer, integer) to authenticated, service_role;

-- ============================================================
-- 4. Adjustment log — audit trail for manual changes.
-- ============================================================

create table if not exists public.registrar_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  admin_id uuid not null,
  kind text not null,
  amount numeric not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists registrar_adjustments_user_idx
  on public.registrar_adjustments (user_id, created_at desc);

alter table public.registrar_adjustments enable row level security;

revoke all on public.registrar_adjustments from anon;
grant select on public.registrar_adjustments to authenticated;
grant all on public.registrar_adjustments to service_role;

drop policy if exists "Staff read adjustments" on public.registrar_adjustments;
create policy "Staff read adjustments" on public.registrar_adjustments
  for select to authenticated
  using ( public.admin_has_role(auth.uid(), 'operations') );

-- ============================================================
-- 5. Adjust wallet — credit or debit a member's wallet.
--    Logs to registrar_adjustments and gliits_ledger.
-- ============================================================

create or replace function public.registrar_adjust_wallet(
  p_user uuid,
  p_amount numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_balance numeric;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;

  if p_amount = 0 then
    return jsonb_build_object('ok', false, 'code', 'ZERO_AMOUNT');
  end if;

  if length(coalesce(p_reason, '')) < 5 then
    return jsonb_build_object('ok', false, 'code', 'REASON_TOO_SHORT');
  end if;

  -- Update wallet balance
  update public.gliits_wallets
  set balance = balance + p_amount
  where user_id = p_user
  returning balance into v_balance;

  if v_balance is null then
    return jsonb_build_object('ok', false, 'code', 'NO_WALLET');
  end if;

  -- Log the adjustment
  insert into public.registrar_adjustments (user_id, admin_id, kind, amount, reason)
  values (p_user, uid, 'wallet', p_amount, p_reason);

  -- Log to ledger
  insert into public.gliits_ledger (user_id, type, description, amount, balance_after)
  values (
    p_user,
    case when p_amount > 0 then 'credit' else 'debit' end,
    'Admin adjustment: ' || left(p_reason, 200),
    p_amount,
    v_balance
  );

  return jsonb_build_object('ok', true, 'balance', v_balance);
end
$$;

revoke execute on function public.registrar_adjust_wallet(uuid, numeric, text) from public, anon;
grant execute on function public.registrar_adjust_wallet(uuid, numeric, text) to authenticated, service_role;

-- ============================================================
-- 6. Extend subscription — grant or remove plan days.
--    Logs to registrar_adjustments.
-- ============================================================

create or replace function public.registrar_extend_subscription(
  p_user uuid,
  p_days integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_expires timestamptz;
  v_tier text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;

  if p_days = 0 then
    return jsonb_build_object('ok', false, 'code', 'ZERO_DAYS');
  end if;

  if abs(p_days) > 3650 then
    return jsonb_build_object('ok', false, 'code', 'TOO_MANY_DAYS');
  end if;

  if length(coalesce(p_reason, '')) < 5 then
    return jsonb_build_object('ok', false, 'code', 'REASON_TOO_SHORT');
  end if;

  -- Update subscription expiry
  update public.gliits_subscriptions
  set expires_at = coalesce(expires_at, now()) + (p_days || ' days')::interval
  where user_id = p_user
  returning expires_at, plan_type into v_expires, v_tier;

  if v_expires is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SUBSCRIPTION');
  end if;

  -- Log the adjustment
  insert into public.registrar_adjustments (user_id, admin_id, kind, amount, reason)
  values (p_user, uid, 'subscription', p_days, p_reason);

  return jsonb_build_object(
    'ok', true,
    'tier', v_tier,
    'subscription_expires_at', v_expires
  );
end
$$;

revoke execute on function public.registrar_extend_subscription(uuid, integer, text) from public, anon;
grant execute on function public.registrar_extend_subscription(uuid, integer, text) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- 7. Self-check grid
-- ============================================================

with checks as (
  select 1 as "#", 'registrar_members exists and returns jsonb' as check_name,
         exists (select 1 from pg_proc where oid = to_regprocedure('public.registrar_members(text,integer)')
                  and prorettype = 'jsonb'::regtype) as ok
  union all
  select 2, 'registrar_member exists and returns jsonb',
         exists (select 1 from pg_proc where oid = to_regprocedure('public.registrar_member(uuid)')
                  and prorettype = 'jsonb'::regtype)
  union all
  select 3, 'registrar_ledger exists and returns jsonb',
         exists (select 1 from pg_proc where oid = to_regprocedure('public.registrar_ledger(text,text,uuid,integer,integer)')
                  and prorettype = 'jsonb'::regtype)
  union all
  select 4, 'registrar_adjust_wallet exists and returns jsonb',
         exists (select 1 from pg_proc where oid = to_regprocedure('public.registrar_adjust_wallet(uuid,numeric,text)')
                  and prorettype = 'jsonb'::regtype)
  union all
  select 5, 'registrar_extend_subscription exists and returns jsonb',
         exists (select 1 from pg_proc where oid = to_regprocedure('public.registrar_extend_subscription(uuid,integer,text)')
                  and prorettype = 'jsonb'::regtype)
  union all
  select 6, 'registrar_adjustments table exists with RLS',
         exists (select 1 from pg_class where oid = 'public.registrar_adjustments'::regclass and relrowsecurity)
  union all
  select 7, 'all five RPCs are SECURITY DEFINER',
         (select count(*) = 5 from pg_proc
           where oid in (to_regprocedure('public.registrar_members(text,integer)'),
                        to_regprocedure('public.registrar_member(uuid)'),
                        to_regprocedure('public.registrar_ledger(text,text,uuid,integer,integer)'),
                        to_regprocedure('public.registrar_adjust_wallet(uuid,numeric,text)'),
                        to_regprocedure('public.registrar_extend_subscription(uuid,integer,text)'))
             and prosecdef)
  union all
  select 8, 'anon cannot execute any registrar RPC',
         (select count(*) = 0 from pg_proc
           where oid in (to_regprocedure('public.registrar_members(text,integer)'),
                        to_regprocedure('public.registrar_member(uuid)'),
                        to_regprocedure('public.registrar_ledger(text,text,uuid,integer,integer)'),
                        to_regprocedure('public.registrar_adjust_wallet(uuid,numeric,text)'),
                        to_regprocedure('public.registrar_extend_subscription(uuid,integer,text)'))
             and has_function_privilege('anon', oid, 'EXECUTE'))
)
select "#", check_name, ok from checks order by "#";

commit;
