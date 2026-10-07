-- ============================================================
-- Gliimu: Registrar — finance admin role
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once.
--
-- WHAT THIS INSTALLS
--   1. admin_adjustments — an append-only audit log of every manual
--      money or plan change an admin makes, with who made it and why.
--   2. Read RPCs (registrar only; 'super' passes every check):
--        registrar_overview()          headline numbers + attention list
--        registrar_ledger(...)         the wallet ledger, paged + filtered
--        registrar_members(p_q, ...)   member search with money columns
--        registrar_member(p_user)      one member's full finance picture
--        registrar_cycles(...)         bills with their event breakdown
--        registrar_revenue()           library + creator + usage revenue
--        registrar_payment_attempts()  recent funding intents
--        registrar_audit(p_limit)      the adjustment log
--   3. Write RPCs, all audited:
--        registrar_adjust_wallet(p_user, p_amount, p_reason)
--        registrar_extend_subscription(p_user, p_days, p_reason)
--        registrar_set_cycle_status(p_cycle, p_status, p_reference, p_reason)
--        registrar_set_price(p_event_type, p_amount, p_reason)
--
-- WHY EVERYTHING IS AN RPC
--   transactions, purchases and library_items were created before this
--   repo existed: their real columns and CHECK constraints live only in
--   the deployed database. billing_cycles and billing_events are locked
--   down on purpose (no policies, all revoked). So the registrar reads
--   through SECURITY DEFINER functions that select only columns this repo
--   has proven, and anything unexpected comes back as
--   {ok:false, code:'SCHEMA_MISMATCH', detail:...} instead of breaking.
--   The SELF CHECK prints the real column lists — paste them back if a
--   screen ever says the shape does not match.
--
-- RUN ORDER: after sql/all.sql, sql/billing.sql and sql/admin.sql.
--            (sql/library_content.sql too, if you want library revenue.)
-- ============================================================

select pg_advisory_xact_lock(hashtext('gliimu-registrar'));


-- ============================================================
-- 1. admin_adjustments — the audit trail
-- ============================================================

create table if not exists public.admin_adjustments (
  id         bigint generated always as identity primary key,
  kind       text not null,
  user_id    uuid references public.profiles(id) on delete set null,
  amount     integer,
  reason     text not null,
  reference  text,
  applied_by uuid not null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.admin_adjustments is
  'Append-only log of manual admin money/plan changes. Written only by the registrar_* RPCs; read back through registrar_audit().';

comment on column public.admin_adjustments.kind is
  'wallet | subscription | cycle | price';

comment on column public.admin_adjustments.amount is
  'Naira delta for kind=wallet, days for kind=subscription, cycle total for kind=cycle, new price for kind=price';

do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'admin_adjustments_kind_check' and conrelid = 'public.admin_adjustments'::regclass
  ) then
    alter table public.admin_adjustments
      add constraint admin_adjustments_kind_check
      check (kind in ('wallet', 'subscription', 'cycle', 'price'));
  end if;
end $$;

create index if not exists admin_adjustments_created_idx
  on public.admin_adjustments (created_at desc);

create index if not exists admin_adjustments_user_idx
  on public.admin_adjustments (user_id, created_at desc);

alter table public.admin_adjustments enable row level security;

-- Readable only through registrar_audit(), which checks the role itself.
revoke all on public.admin_adjustments from public, anon, authenticated;
grant select, insert on public.admin_adjustments to service_role;


-- ============================================================
-- 2. registrar_overview — the finance dashboard in one call
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
  v_tiers     jsonb;
  v_ledger    jsonb;
  v_ledger30  jsonb;
  v_types     jsonb;
  v_cycles    jsonb;
  v_library   jsonb;
  v_creators  jsonb;
  v_subscriptions jsonb;
  v_attention jsonb;
  v_attempts  jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;

  select jsonb_build_object(
           'total', count(*),
           'with_wallet', count(*) filter (where coalesce(wallet_balance, 0) > 0),
           'wallet_total', coalesce(sum(coalesce(wallet_balance, 0)), 0),
           'gp_total', coalesce(sum(coalesce(total_gp, 0)), 0)
         )
    into v_members
    from public.profiles;

  select coalesce(jsonb_object_agg(s.tier, s.cnt), '{}'::jsonb)
    into v_tiers
    from (select coalesce(p.tier, 'trial') as tier, count(*) as cnt
            from public.profiles p group by 1) s;

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
    return jsonb_build_object('ok', false, 'code', 'SCHEMA_MISMATCH',
                              'where', 'transactions', 'detail', SQLERRM);
  end;

  select jsonb_build_object(
           'open', count(*) filter (where c.status = 'open'),
           'processing', count(*) filter (where c.status = 'processing'),
           'paid', count(*) filter (where c.status = 'paid'),
           'defaulted', count(*) filter (where c.status = 'defaulted'),
           'billed_value', coalesce(sum(c.total_amount) filter (where c.status in ('open', 'processing')), 0),
           'defaulted_value', coalesce(sum(c.total_amount) filter (where c.status = 'defaulted'), 0),
           'collected', coalesce(sum(c.total_amount) filter (where c.status = 'paid'), 0),
           'due_soon', count(*) filter (where c.status = 'processing'
                                         and c.due_at is not null
                                         and c.due_at < now() + interval '3 days')
         )
    into v_cycles
    from public.billing_cycles c;

  select coalesce(jsonb_agg(jsonb_build_object(
           'cycle_id', s.id, 'user_id', s.user_id, 'name', s.name,
           'total', s.total_amount, 'status', s.status, 'due_at', s.due_at)
           order by s.due_at nulls last), '[]'::jsonb)
    into v_attention
    from (select c.id, c.user_id,
                 coalesce(p.full_name, p.username, 'Member') as name,
                 c.total_amount, c.status, c.due_at
            from public.billing_cycles c
            left join public.profiles p on p.id = c.user_id
           where c.status = 'defaulted'
              or (c.status = 'processing' and c.due_at is not null and c.due_at < now() + interval '3 days')
           order by c.due_at nulls last
           limit 25) s;

  -- Library sales: purchases.item_id may be uuid or text in the live DB, so
  -- the join compares text on both sides.
  begin
    select jsonb_build_object('sales', count(*), 'total', coalesce(sum(coalesce(li.price, 0)), 0))
      into v_library
      from public.purchases pu
      join public.library_items li on li.id::text = pu.item_id::text;
  exception when others then
    v_library := jsonb_build_object('sales', null, 'total', null, 'detail', SQLERRM);
  end;

  select jsonb_build_object('payouts', count(*), 'total', coalesce(sum(be.amount), 0))
    into v_creators
    from public.billing_events be
   where be.creator_id is not null;

  select jsonb_build_object('event_types', count(distinct be.event_type),
                            'events', count(*),
                            'total', coalesce(sum(be.amount), 0),
                            'last_30_days', coalesce(sum(be.amount) filter (where be.created_at >= now() - interval '30 days'), 0))
    into v_subscriptions
    from public.billing_events be;

  begin
    select jsonb_build_object('total', count(*),
                              'last_7_days', count(*) filter (where pa.created_at >= now() - interval '7 days'))
      into v_attempts
      from public.payment_attempts pa;
  exception when others then
    v_attempts := jsonb_build_object('total', null, 'last_7_days', null, 'detail', SQLERRM);
  end;

  return jsonb_build_object(
    'ok', true,
    'members', v_members,
    'tiers', v_tiers,
    'ledger', v_ledger,
    'ledger_30_days', v_ledger30,
    'by_type', v_types,
    'cycles', v_cycles,
    'attention', v_attention,
    'library', v_library,
    'creator_payouts', v_creators,
    'usage', v_subscriptions,
    'payment_attempts', v_attempts
  );
end
$$;


-- ============================================================
-- 3. registrar_ledger — the wallet ledger, filtered and paged
-- ============================================================

create or replace function public.registrar_ledger(
  p_type   text    default null,
  p_status text    default null,
  p_user   uuid    default null,
  p_limit  integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_rows  jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;

  begin
    select count(*)
      into v_total
      from public.transactions t
     where (p_type is null or t.type = p_type)
       and (p_status is null or t.status = p_status)
       and (p_user is null or t.user_id = p_user);

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id, 'user_id', s.user_id, 'name', s.name, 'username', s.username,
             'amount', s.amount, 'points', s.points, 'type', s.type, 'status', s.status,
             'reference', s.reference, 'description', s.description, 'created_at', s.created_at)
             order by s.created_at desc), '[]'::jsonb)
      into v_rows
      from (select t.id::text as id, t.user_id,
                   coalesce(p.full_name, p.username, 'Member') as name,
                   p.username,
                   t.amount, coalesce(t.points, 0) as points, t.type, t.status,
                   t.reference, t.description, t.created_at
              from public.transactions t
              left join public.profiles p on p.id = t.user_id
             where (p_type is null or t.type = p_type)
               and (p_status is null or t.status = p_status)
               and (p_user is null or t.user_id = p_user)
             order by t.created_at desc
             limit v_limit offset v_offset) s;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'SCHEMA_MISMATCH',
                              'where', 'transactions', 'detail', SQLERRM);
  end;

  return jsonb_build_object('ok', true, 'total', v_total,
                            'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
end
$$;


-- ============================================================
-- 4. registrar_members — searchable member list with money columns
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
           'wallet_balance', s.wallet_balance, 'total_gp', s.total_gp, 'tier', s.tier,
           'trial_ends_at', s.trial_ends_at, 'subscription_expires_at', s.subscription_expires_at,
           'subscription_plan', s.subscription_plan)
           order by s.wallet_balance desc, s.full_name nulls last), '[]'::jsonb)
    into v_rows
    from (select p.id, p.username, p.full_name, p.avatar_url,
                 coalesce(p.wallet_balance, 0) as wallet_balance,
                 coalesce(p.total_gp, 0) as total_gp,
                 coalesce(p.tier, 'trial') as tier,
                 p.trial_ends_at, p.subscription_expires_at, p.subscription_plan
            from public.profiles p
           where v_q is null
              or p.username ilike '%' || v_q || '%'
              or p.full_name ilike '%' || v_q || '%'
           limit v_limit) s;

  return jsonb_build_object('ok', true, 'members', v_rows);
end
$$;


-- ============================================================
-- 5. registrar_member — one member's whole finance picture
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
  v_cycles  jsonb;
  v_events  jsonb;
  v_buys    jsonb;
  v_sells   jsonb;
  v_deals   jsonb;
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
           'tier', coalesce(p.tier, 'trial'), 'trial_ends_at', p.trial_ends_at,
           'subscription_expires_at', p.subscription_expires_at, 'subscription_plan', p.subscription_plan,
           'effective_tier', public.effective_tier(p.id),
           'is_admin', coalesce(p.is_admin, false))
    into v_profile
    from public.profiles p
   where p.id = p_user;

  if v_profile is null then
    return jsonb_build_object('ok', false, 'code', 'NO_USER');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'status', c.status, 'total_amount', c.total_amount,
           'start_date', c.start_date, 'end_date', c.end_date, 'due_at', c.due_at,
           'payment_reference', c.payment_reference)
           order by c.created_at desc), '[]'::jsonb)
    into v_cycles
    from public.billing_cycles c
   where c.user_id = p_user;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', be.id, 'event_type', be.event_type, 'amount', be.amount, 'tier', be.tier,
           'item_id', be.item_id, 'created_at', be.created_at)
           order by be.created_at desc), '[]'::jsonb)
    into v_events
    from (select * from public.billing_events b
           where b.user_id = p_user order by b.created_at desc limit 100) be;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'item_id', s.item_id, 'title', s.title, 'type', s.type, 'price', s.price)
             order by s.title nulls last), '[]'::jsonb)
      into v_buys
      from (select pu.item_id::text as item_id, li.title, li.type, coalesce(li.price, 0) as price
              from public.purchases pu
              left join public.library_items li on li.id::text = pu.item_id::text
             where pu.user_id = p_user) s;

    select coalesce(jsonb_agg(jsonb_build_object(
             'item_id', s.id, 'title', s.title, 'type', s.type, 'price', s.price, 'sales', s.sales)
             order by s.sales desc nulls last), '[]'::jsonb)
      into v_sells
      from (select li.id::text as id, li.title, li.type, coalesce(li.price, 0) as price,
                   (select count(*) from public.purchases pu
                     where pu.item_id::text = li.id::text) as sales
              from public.library_items li
             where li.owner_id = p_user) s;
  exception when others then
    v_buys := jsonb_build_object('detail', SQLERRM);
    v_sells := jsonb_build_object('detail', SQLERRM);
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'deal_type', d.deal_type, 'company_name', d.company_name,
           'budget', d.budget, 'status', d.status, 'created_at', d.created_at)
           order by d.created_at desc), '[]'::jsonb)
    into v_deals
    from (select * from public.deals d where d.user_id = p_user order by d.created_at desc limit 25) d;

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
    'cycles', v_cycles,
    'events', v_events,
    'purchases', v_buys,
    'library_items', v_sells,
    'deals', v_deals,
    'adjustments', v_edits
  );
end
$$;


-- ============================================================
-- 6. registrar_cycles — bills with what made them up
-- ============================================================

create or replace function public.registrar_cycles(
  p_status text    default null,
  p_limit  integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_limit  integer := least(greatest(coalesce(p_limit, 100), 1), 300);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total  bigint;
  v_rows   jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;

  select count(*) into v_total
    from public.billing_cycles c
   where p_status is null or c.status = p_status;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'user_id', s.user_id, 'name', s.name, 'username', s.username,
           'status', s.status, 'total_amount', s.total_amount,
           'start_date', s.start_date, 'end_date', s.end_date, 'due_at', s.due_at,
           'payment_reference', s.payment_reference, 'breakdown', s.breakdown)
           order by s.sort_due), '[]'::jsonb)
    into v_rows
    from (select c.id, c.user_id,
                 coalesce(p.full_name, p.username, 'Member') as name,
                 p.username,
                 c.status, c.total_amount, c.start_date, c.end_date, c.due_at, c.payment_reference,
                 coalesce((select jsonb_agg(jsonb_build_object(
                             'event_type', be.event_type, 'amount', be.amount) order by be.amount desc)
                             from (select b.event_type, sum(b.amount) as amount
                                     from public.billing_events b
                                    where b.billing_cycle_id = c.id
                                    group by b.event_type) be), '[]'::jsonb) as breakdown,
                 coalesce(c.due_at, c.start_date) as sort_due
            from public.billing_cycles c
            left join public.profiles p on p.id = c.user_id
           where p_status is null or c.status = p_status
           order by sort_due desc
           limit v_limit offset v_offset) s;

  return jsonb_build_object('ok', true, 'total', v_total,
                            'limit', v_limit, 'offset', v_offset, 'cycles', v_rows);
end
$$;


-- ============================================================
-- 7. registrar_revenue — where the money comes from
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

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'item_id', s.id, 'title', s.title, 'type', s.type, 'price', s.price,
             'owner', s.owner, 'owner_id', s.owner_id, 'sales', s.sales, 'revenue', s.revenue)
             order by s.revenue desc), '[]'::jsonb)
      into v_items
      from (select li.id::text as id, li.title, li.type, coalesce(li.price, 0) as price,
                   li.owner_id,
                   coalesce(op.full_name, op.username, li.author, '—') as owner,
                   (select count(*) from public.purchases pu where pu.item_id::text = li.id::text) as sales,
                   (select count(*) from public.purchases pu where pu.item_id::text = li.id::text)
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
                                  where pu.item_id::text = li.id::text)), 0) as sales,
                   coalesce(sum((select count(*) from public.purchases pu
                                  where pu.item_id::text = li.id::text) * coalesce(li.price, 0)), 0) as revenue
              from public.library_items li
              left join public.profiles op on op.id = li.owner_id
             group by li.owner_id) s;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'SCHEMA_MISMATCH',
                              'where', 'purchases/library_items', 'detail', SQLERRM);
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
           'event_type', s.event_type, 'events', s.events, 'total', s.total,
           'last_30_days', s.last_30)
           order by s.total desc), '[]'::jsonb)
    into v_usage
    from (select be.event_type, count(*) as events, coalesce(sum(be.amount), 0) as total,
                 coalesce(sum(be.amount) filter (where be.created_at >= now() - interval '30 days'), 0) as last_30
            from public.billing_events be
           group by be.event_type) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'creator_id', s.creator_id, 'creator', s.creator, 'events', s.events, 'total', s.total)
           order by s.total desc), '[]'::jsonb)
    into v_creators
    from (select be.creator_id,
                 coalesce(max(cp.full_name), max(cp.username), '—') as creator,
                 count(*) as events, coalesce(sum(be.amount), 0) as total
            from public.billing_events be
            left join public.profiles cp on cp.id = be.creator_id
           where be.creator_id is not null
           group by be.creator_id
           order by total desc
           limit v_limit) s;

  return jsonb_build_object('ok', true, 'items', v_items, 'owners', v_owners,
                            'usage', v_usage, 'creators', v_creators);
end
$$;


-- ============================================================
-- 8. registrar_payment_attempts — funding intents to reconcile
-- ============================================================

create or replace function public.registrar_payment_attempts(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 300);
  v_rows  jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id, 'user_id', s.user_id, 'name', s.name, 'username', s.username,
             'method', s.method, 'created_at', s.created_at)
             order by s.created_at desc), '[]'::jsonb)
      into v_rows
      from (select pa.id::text as id, pa.user_id,
                   coalesce(p.full_name, p.username, 'Member') as name, p.username,
                   pa.method, pa.created_at
              from public.payment_attempts pa
              left join public.profiles p on p.id = pa.user_id
             order by pa.created_at desc
             limit v_limit) s;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'SCHEMA_MISMATCH',
                              'where', 'payment_attempts', 'detail', SQLERRM);
  end;

  return jsonb_build_object('ok', true, 'attempts', v_rows);
end
$$;


-- ============================================================
-- 9. registrar_audit — the adjustment log
-- ============================================================

create or replace function public.registrar_audit(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 300);
  v_rows  jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'kind', s.kind, 'amount', s.amount, 'reason', s.reason,
           'reference', s.reference, 'created_at', s.created_at,
           'user_id', s.user_id, 'member', s.member, 'admin', s.admin)
           order by s.created_at desc), '[]'::jsonb)
    into v_rows
    from (select a.id, a.kind, a.amount, a.reason, a.reference, a.created_at,
                 a.user_id,
                 coalesce(mu.full_name, mu.username, '—') as member,
                 coalesce(ad.full_name, ad.username, '—') as admin
            from public.admin_adjustments a
            left join public.profiles mu on mu.id = a.user_id
            left join public.profiles ad on ad.id = a.applied_by
           order by a.created_at desc
           limit v_limit) s;

  return jsonb_build_object('ok', true, 'adjustments', v_rows);
end
$$;


-- ============================================================
-- 10. registrar_adjust_wallet — manual credit / debit / refund
--     Always writes the ledger row and the audit row together.
-- ============================================================

create or replace function public.registrar_adjust_wallet(p_user uuid, p_amount integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_before integer;
  v_after  integer;
  v_txn    text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;
  if p_amount is null or p_amount = 0 then
    return jsonb_build_object('ok', false, 'code', 'BAD_AMOUNT');
  end if;
  if abs(p_amount) > 100000000 then
    return jsonb_build_object('ok', false, 'code', 'AMOUNT_TOO_LARGE');
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;

  perform pg_advisory_xact_lock(hashtext('wallet_adjust:' || p_user::text));

  select coalesce(p.wallet_balance, 0) into v_before
    from public.profiles p where p.id = p_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_USER');
  end if;

  v_after := v_before + p_amount;
  if v_after < 0 then
    return jsonb_build_object('ok', false, 'code', 'WOULD_GO_NEGATIVE', 'balance', v_before);
  end if;

  update public.profiles set wallet_balance = v_after where id = p_user;

  -- The ledger's type CHECK predates this repo and may not know
  -- 'adjustment', so fall back to a value it certainly allows.
  begin
    insert into public.transactions (user_id, amount, points, type, status, reference, description)
    values (p_user, p_amount, 0, 'adjustment', 'success', null,
            'Admin adjustment: ' || left(p_reason, 140))
    returning id::text into v_txn;
  exception when check_violation then
    insert into public.transactions (user_id, amount, points, type, status, reference, description)
    values (p_user, p_amount, 0, 'topup', 'success', null,
            'Admin adjustment: ' || left(p_reason, 140))
    returning id::text into v_txn;
  end;

  insert into public.admin_adjustments (kind, user_id, amount, reason, applied_by)
  values ('wallet', p_user, p_amount, p_reason, uid);

  return jsonb_build_object('ok', true, 'previous', v_before, 'balance', v_after,
                            'transaction_id', v_txn);
end
$$;


-- ============================================================
-- 11. registrar_extend_subscription — grant or cut paid time
--     Positive days extend from the later of now() and the current
--     expiry; negative days cut from the current expiry. The stored
--     tier is kept honest the same way billing_settle_cycle does it.
-- ============================================================

create or replace function public.registrar_extend_subscription(p_user uuid, p_days integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_tier   text;
  v_exp    timestamptz;
  v_base   timestamptz;
  v_new    timestamptz;
  v_newtier text;
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

  select p.tier, p.subscription_expires_at into v_tier, v_exp
    from public.profiles p where p.id = p_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_USER');
  end if;

  v_tier := coalesce(v_tier, 'trial');
  v_base := case when p_days > 0 then greatest(coalesce(v_exp, now()), now())
                 else coalesce(v_exp, now()) end;
  v_new  := v_base + make_interval(days => p_days);

  v_newtier := v_tier;
  if v_new > now() and v_tier in ('trial', 'wallet') then
    v_newtier := 'payngo';
  elsif v_new <= now() and v_tier in ('payngo', 'pro') then
    v_newtier := 'wallet';
  end if;

  update public.profiles
     set subscription_expires_at = v_new,
         tier = v_newtier
   where id = p_user;

  insert into public.admin_adjustments (kind, user_id, amount, reason, reference, applied_by)
  values ('subscription', p_user, p_days, p_reason, v_tier || ' -> ' || v_newtier, uid);

  return jsonb_build_object('ok', true, 'previous_expiry', v_exp,
                            'subscription_expires_at', v_new,
                            'previous_tier', v_tier, 'tier', v_newtier);
end
$$;


-- ============================================================
-- 12. registrar_set_cycle_status — reconcile a bill by hand
--     'paid' delegates to billing_settle_cycle so the member's tier
--     and next cycle are handled exactly as an automated payment would.
-- ============================================================

create or replace function public.registrar_set_cycle_status(
  p_cycle     bigint,
  p_status    text,
  p_reference text    default null,
  p_reason    text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_row  public.billing_cycles%rowtype;
  v_settled jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;
  if p_status not in ('paid', 'void', 'defaulted') then
    return jsonb_build_object('ok', false, 'code', 'BAD_STATUS');
  end if;
  if coalesce(btrim(coalesce(p_reason, '')), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;

  perform pg_advisory_xact_lock(hashtext('registrar_cycle:' || p_cycle::text));

  select * into v_row from public.billing_cycles where id = p_cycle for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if p_status = 'paid' then
    v_settled := public.billing_settle_cycle(p_cycle, p_reference);
    if coalesce((v_settled ->> 'ok')::boolean, false) is false then
      return v_settled;
    end if;
  elsif v_row.status = 'paid' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_PAID',
                              'hint', 'Refund the wallet instead of voiding a settled bill.');
  else
    update public.billing_cycles
       set status = p_status,
           payment_reference = coalesce(p_reference, payment_reference)
     where id = p_cycle;
  end if;

  insert into public.admin_adjustments (kind, user_id, amount, reason, reference, applied_by)
  values ('cycle', v_row.user_id, v_row.total_amount,
          p_reason || ' (bill #' || p_cycle || ' -> ' || p_status || ')',
          p_reference, uid);

  return jsonb_build_object('ok', true, 'cycle', p_cycle, 'status', p_status);
end
$$;


-- ============================================================
-- 13. registrar_set_price — the price list
--     Only existing keys can change; a new charge needs a code change
--     too, so inventing one here would silently do nothing.
-- ============================================================

create or replace function public.registrar_set_price(p_event_type text, p_amount integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  v_old integer;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;
  if coalesce(btrim(coalesce(p_event_type, '')), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'BAD_EVENT_TYPE');
  end if;
  if p_amount is null or p_amount < 0 then
    return jsonb_build_object('ok', false, 'code', 'BAD_AMOUNT');
  end if;
  if p_amount > 100000000 then
    return jsonb_build_object('ok', false, 'code', 'AMOUNT_TOO_LARGE');
  end if;
  if coalesce(btrim(coalesce(p_reason, '')), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;

  select bp.amount into v_old from public.billing_prices bp
   where bp.event_type = p_event_type for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  update public.billing_prices
     set amount = p_amount, updated_at = now()
   where event_type = p_event_type;

  insert into public.admin_adjustments (kind, amount, reason, reference, applied_by)
  values ('price', p_amount, p_reason, p_event_type || ': ' || coalesce(v_old::text, '?') || ' -> ' || p_amount::text, uid);

  return jsonb_build_object('ok', true, 'event_type', p_event_type,
                            'previous', v_old, 'amount', p_amount);
end
$$;


-- ============================================================
-- 14. Grants — the role check lives inside every function
-- ============================================================

revoke execute on function public.registrar_overview() from public, anon;
revoke execute on function public.registrar_ledger(text, text, uuid, integer, integer) from public, anon;
revoke execute on function public.registrar_members(text, integer) from public, anon;
revoke execute on function public.registrar_member(uuid) from public, anon;
revoke execute on function public.registrar_cycles(text, integer, integer) from public, anon;
revoke execute on function public.registrar_revenue(integer) from public, anon;
revoke execute on function public.registrar_payment_attempts(integer) from public, anon;
revoke execute on function public.registrar_audit(integer) from public, anon;
revoke execute on function public.registrar_adjust_wallet(uuid, integer, text) from public, anon;
revoke execute on function public.registrar_extend_subscription(uuid, integer, text) from public, anon;
revoke execute on function public.registrar_set_cycle_status(bigint, text, text, text) from public, anon;
revoke execute on function public.registrar_set_price(text, integer, text) from public, anon;

grant execute on function public.registrar_overview() to authenticated, service_role;
grant execute on function public.registrar_ledger(text, text, uuid, integer, integer) to authenticated, service_role;
grant execute on function public.registrar_members(text, integer) to authenticated, service_role;
grant execute on function public.registrar_member(uuid) to authenticated, service_role;
grant execute on function public.registrar_cycles(text, integer, integer) to authenticated, service_role;
grant execute on function public.registrar_revenue(integer) to authenticated, service_role;
grant execute on function public.registrar_payment_attempts(integer) to authenticated, service_role;
grant execute on function public.registrar_audit(integer) to authenticated, service_role;
grant execute on function public.registrar_adjust_wallet(uuid, integer, text) to authenticated, service_role;
grant execute on function public.registrar_extend_subscription(uuid, integer, text) to authenticated, service_role;
grant execute on function public.registrar_set_cycle_status(bigint, text, text, text) to authenticated, service_role;
grant execute on function public.registrar_set_price(text, integer, text) to authenticated, service_role;


-- ============================================================
-- 15. SELF CHECK — read these notices after running
-- ============================================================

do $$
declare
  v_pending integer;
  v_float   bigint;
begin
  raise notice '==== REGISTRAR SELF CHECK ====';
  raise notice 'admin_adjustments table:   %', case when to_regclass('public.admin_adjustments') is not null then 'OK' else 'MISSING' end;
  raise notice 'RLS enabled:               %', case when (select relrowsecurity from pg_class where oid = to_regclass('public.admin_adjustments')) is true then 'OK' else 'MISSING' end;
  raise notice 'registrar_overview():      %', coalesce(to_regprocedure('public.registrar_overview()')::text, 'MISSING');
  raise notice 'registrar_ledger():        %', coalesce(to_regprocedure('public.registrar_ledger(text,text,uuid,integer,integer)')::text, 'MISSING');
  raise notice 'registrar_members():       %', coalesce(to_regprocedure('public.registrar_members(text,integer)')::text, 'MISSING');
  raise notice 'registrar_member():        %', coalesce(to_regprocedure('public.registrar_member(uuid)')::text, 'MISSING');
  raise notice 'registrar_cycles():        %', coalesce(to_regprocedure('public.registrar_cycles(text,integer,integer)')::text, 'MISSING');
  raise notice 'registrar_revenue():       %', coalesce(to_regprocedure('public.registrar_revenue(integer)')::text, 'MISSING');
  raise notice 'registrar_payment_attempts(): %', coalesce(to_regprocedure('public.registrar_payment_attempts(integer)')::text, 'MISSING');
  raise notice 'registrar_audit():         %', coalesce(to_regprocedure('public.registrar_audit(integer)')::text, 'MISSING');
  raise notice 'registrar_adjust_wallet(): %', coalesce(to_regprocedure('public.registrar_adjust_wallet(uuid,integer,text)')::text, 'MISSING');
  raise notice 'registrar_extend_subscription(): %', coalesce(to_regprocedure('public.registrar_extend_subscription(uuid,integer,text)')::text, 'MISSING');
  raise notice 'registrar_set_cycle_status(): %', coalesce(to_regprocedure('public.registrar_set_cycle_status(bigint,text,text,text)')::text, 'MISSING');
  raise notice 'registrar_set_price():     %', coalesce(to_regprocedure('public.registrar_set_price(text,integer,text)')::text, 'MISSING');

  if to_regclass('public.admin_users') is not null then
    raise notice 'registrar admins:          %', (select count(*) from public.admin_users where role in ('registrar', 'super'));
  else
    raise warning 'public.admin_users is missing — run sql/admin.sql first.';
  end if;

  raise notice 'admin_adjustments rows:    %', (select count(*) from public.admin_adjustments);

  if to_regclass('public.billing_cycles') is not null then
    raise notice 'billing cycles:            %', (select count(*) from public.billing_cycles);
    select count(*) into v_pending from public.billing_cycles where status in ('open', 'processing');
    raise notice 'unpaid bills:              %', v_pending;
  else
    raise warning 'public.billing_cycles is missing — run sql/billing.sql first.';
  end if;

  if to_regclass('public.billing_events') is not null then
    raise notice 'billing_events types:      %', coalesce((select string_agg(distinct event_type, ', ' order by event_type) from public.billing_events), 'none yet');
  else
    raise warning 'public.billing_events is missing — run sql/billing.sql first.';
  end if;

  if to_regclass('public.billing_prices') is not null then
    raise notice 'price list keys:           %', coalesce((select string_agg(event_type, ', ' order by event_type) from public.billing_prices), 'none');
  else
    raise warning 'public.billing_prices is missing — run sql/billing.sql first.';
  end if;

  select coalesce(sum(coalesce(wallet_balance, 0)), 0) into v_float from public.profiles;
  raise notice 'wallet float (all members): %', v_float;

  -- Paste these three lines back if a registrar screen ever reports
  -- SCHEMA_MISMATCH: they show the real shape of the legacy tables.
  raise notice 'transactions columns:      %', (select string_agg(column_name || ' ' || data_type ||
                                                                case when is_nullable = 'NO' then ' NOT NULL' else '' end,
                                                                ', ' order by ordinal_position)
                                                from information_schema.columns
                                               where table_schema = 'public' and table_name = 'transactions');
  raise notice 'transactions type CHECK:   %', coalesce((select string_agg(pg_get_constraintdef(c.oid), ' | ')
                                                from pg_constraint c
                                               where c.conrelid = to_regclass('public.transactions')
                                                 and c.contype = 'c'), 'none found');
  raise notice 'purchases columns:         %', (select string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position)
                                                from information_schema.columns
                                               where table_schema = 'public' and table_name = 'purchases');
  raise notice '=============================';
end $$;

notify pgrst, 'reload schema';
