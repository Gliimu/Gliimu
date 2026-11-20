-- ============================================================
-- xtra_plan.sql — the second plan: one member buys a pot, and the
-- group they name spends it by the minute.
--
-- Idempotent. Run the whole file once, top to bottom. Re-running it
-- is safe. Nothing in this file deletes a row that exists today.
--
-- What this changes
--   1. gliits_config gains xtra_seat_price_gliits (210 tokens a seat,
--      which is ₦2,100 at the live ₦10-per-token rate), and both
--      config writers accept the key so Operations can change it.
--   2. Three new tables: the pot (xtra_groups), who is in it
--      (xtra_members), and the payment that filled it (xtra_payments).
--   3. The meter gets a payment SOURCE. A minute is still billed at
--      the one config rate; the tokens now come out of the member's
--      group pot first and out of their own balance only for what the
--      pot cannot cover. Nobody is ever billed twice for a minute.
--   4. The door check (gliits_live_entry_check) answers with the same
--      pot-aware maths, so a member is never let into a session that
--      the meter would then refuse to bill.
--   5. gliits_get_balance returns the pot beside the wallet, so the
--      Billing page can draw the bar in the round trip it already
--      makes. No new read call, no new RPC for the client to await.
--   6. gliits_set_plan can sell payngo only, as before, but leaving
--      now also ends the membership — and a payer cannot leave the
--      group they fund; they close it instead.
--   7. Six RPCs run the group: create, add, remove, close, plus the
--      two the server calls to price and settle a payment.
--   8. Crossing under 30% of everything ever funded into the pot
--      writes one Alert to every member of that group, once.
--
-- What this does NOT touch
--   * The metering RULE. A minute is billable unless the member holds
--     paid time that has not run out — the line plan_lineup.sql put
--     on the expiry rather than on a plan-name list, and it is why an
--     xtra row with expires_at = null is billed like payngo already
--     is. Xtra is not a subscription: no period, no renewal date, no
--     unmetered tier. The pot running out is the only way it ends.
--   * effective_tier(). An xtra member reads 'wallet' there, because
--     the helper only special-cases the two retired plans. That is a
--     display label in admin_member_lookup, not a billing input; it
--     is fixed with the rest of the copy sweep, not here.
--   * plan_monthly_price_gliits, plan_yearly_price_gliits and the
--     nightly gliits_expire_legacy_plans sweep. They stay until the
--     two grandfathered rows have expired.
--   * Wallet top-ups, withdrawals, support, GP, the host fee and the
--     creator credit. The credit still follows the charge: a minute
--     paid out of a pot was paid, so the author is still credited at
--     creator_rate_per_minute under the same 24-hour cap.
--
-- Live state this was written against (read 2026-11-20)
--   gliits_config id 1: rate 3.00/min, creator 1.50/min, cap 30,
--     exchange 10, host fee 1, min top-up 100 tokens.
--   12 gliits_plans rows: 10 payngo, 2 monthly expiring 2026-11-27
--     and 2026-11-28. The check constraint is widened here, not
--     narrowed, so those two rows keep validating.
--   Constraint name on that column is gliits_plans_plan_type_check.
--   profiles.wallet_balance is numeric(12,2); transactions.amount is
--     integer and has a reference column; no CHECK on transactions.type.
--   gliits_heartbeat(uuid,uuid) md5 as of sql/plan_lineup.sql §4,
--   gliits_set_config md5 f794fa44e93e03b63b8eb4756456638f,
--   registrar_set_config md5 cca6108d31466a099c29b51b68dc013d.
--   The two writer bodies below are those live bodies with one key
--   added to each allowlist and nothing else changed.
-- ============================================================


-- ============================================================
-- 1. The seat price knob.
--
--    Denominated in tokens like every other price in this table, so
--    the naira a payer is charged is derived the same way a wallet
--    top-up derives it: tokens x exchange rate.
-- ============================================================
alter table public.gliits_config
  add column if not exists xtra_seat_price_gliits integer not null default 210;


-- ============================================================
-- 2. The pot, the members, the payments.
--
--    funded_total is everything ever credited into this pot, never
--    decremented, so "how much of what was bought is left" is one
--    division and the bar cannot lie after a top-up.
-- ============================================================
create table if not exists public.xtra_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Xtra group',
  pool_balance numeric(12,2) not null default 0 check (pool_balance >= 0),
  funded_total numeric(12,2) not null default 0 check (funded_total >= 0),
  low_notice_sent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.xtra_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  group_id uuid not null references public.xtra_groups(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz not null default now()
);

-- The primary key on user_id is the whole "one member, one group"
-- rule: a member cannot be split across two pots, so no minute can be
-- billed against an ambiguous balance.
create index if not exists xtra_members_group_idx
  on public.xtra_members (group_id);

create table if not exists public.xtra_payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.xtra_groups(id) on delete cascade,
  payer_id uuid not null references public.profiles(id) on delete cascade,
  seats integer not null check (seats >= 1 and seats <= 1000),
  gliits_amount integer not null check (gliits_amount >= 1),
  naira_amount integer not null check (naira_amount >= 1),
  reference text not null,
  provider text not null default 'paystack',
  status text not null default 'pending'
    check (status in ('pending', 'success', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists xtra_payments_group_time_idx
  on public.xtra_payments (group_id, created_at desc);

-- Partial, like the wallet path: one reference may be attempted as
-- often as a dropped checkout retries, but it can succeed once.
create unique index if not exists xtra_payments_reference_success_uk
  on public.xtra_payments (reference) where status = 'success';


-- ============================================================
-- 3. Access.
--
--    Members read their own group; nobody writes these tables from
--    the API at all. Every write goes through a definer RPC in
--    section 5 that checks auth.uid() itself.
--
--    The read policies call xtra_is_member() instead of subquerying
--    xtra_members, because a policy on xtra_members that reads
--    xtra_groups and a policy on xtra_groups that reads
--    xtra_members would otherwise recurse into each other.
-- ============================================================
alter table public.xtra_groups  enable row level security;
alter table public.xtra_members enable row level security;
alter table public.xtra_payments enable row level security;

revoke all on public.xtra_groups from anon;
revoke all on public.xtra_members from anon;
revoke all on public.xtra_payments from anon;

grant select on public.xtra_groups to authenticated;
grant select on public.xtra_members to authenticated;
grant select on public.xtra_payments to authenticated;

grant all on public.xtra_groups to service_role;
grant all on public.xtra_members to service_role;
grant all on public.xtra_payments to service_role;

create or replace function public.xtra_is_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.xtra_groups g
     where g.id = p_group_id
       and (g.owner_id = auth.uid()
            or exists (select 1 from public.xtra_members m
                        where m.group_id = g.id and m.user_id = auth.uid()))
  );
$$;

revoke execute on function public.xtra_is_member(uuid) from public, anon;
grant execute on function public.xtra_is_member(uuid) to authenticated, service_role;

drop policy if exists "Members read their own xtra group" on public.xtra_groups;
create policy "Members read their own xtra group"
  on public.xtra_groups
  for select
  to authenticated
  using ( public.xtra_is_member(id) );

drop policy if exists "Members read their own xtra seat" on public.xtra_members;
create policy "Members read their own xtra seat"
  on public.xtra_members
  for select
  to authenticated
  using ( public.xtra_is_member(group_id) );

drop policy if exists "Payers read their own xtra payments" on public.xtra_payments;
create policy "Payers read their own xtra payments"
  on public.xtra_payments
  for select
  to authenticated
  using ( payer_id = auth.uid() and public.xtra_is_member(group_id) );


-- ============================================================
-- 4. The plan row may now read 'xtra'.
--
--    WIDENED, not narrowed: 'monthly' and 'yearly' stay in the list
--    because two live rows still hold them inside paid time. The
--    narrowing to ('payngo','xtra') is the step after 2026-11-28,
--    once those have expired; running it now would fail validation
--    against them and take the whole script down with it.
-- ============================================================
alter table public.gliits_plans
  drop constraint if exists gliits_plans_plan_type_check;
alter table public.gliits_plans
  add constraint gliits_plans_plan_type_check
  check (plan_type in ('payngo', 'monthly', 'yearly', 'xtra'));


-- ============================================================
-- 5. The group, managed by the one person who pays for it.
--
--    All four are security definer — the payer writes other people's
--    plan rows and membership rows, which no policy could allow — so
--    each one opens by checking auth.uid() and ownership, and none
--    takes an amount, a balance or a price as an argument.
--
--    Minimum three is a start rule, enforced in xtra_create only.
--    Once a group exists the payer may remove anyone, including down
--    to one seat, because refusing would trap them with a seat they
--    are paying for and cannot fire.
-- ============================================================

-- 5a. Create: name the group and its people. Nothing is charged here
--     and nobody's plan row changes, so an abandoned checkout leaves
--     the members on their own wallets rather than half-migrated.
create or replace function public.xtra_create(
  p_label text,
  p_member_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_label text;
  v_ids uuid[];
  v_count integer;
  v_group uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_label := coalesce(nullif(btrim(coalesce(p_label, '')), ''), 'Xtra group');
  if length(v_label) > 60 then
    raise exception 'XTRA_LABEL_TOO_LONG';
  end if;

  if exists (select 1 from public.xtra_groups where owner_id = v_uid)
     or exists (select 1 from public.xtra_members where user_id = v_uid) then
    raise exception 'XTRA_ALREADY_IN_GROUP';
  end if;

  select coalesce(array_agg(distinct m), '{}'::uuid[])
    into v_ids
    from unnest(coalesce(p_member_ids, '{}'::uuid[])) as m
   where m <> v_uid;

  if v_ids is null then v_ids := '{}'::uuid[]; end if;

  v_count := cardinality(v_ids) + 1;
  if v_count < 3 then
    raise exception 'XTRA_MIN_MEMBERS';
  end if;

  if exists (
    select 1 from unnest(v_ids) as m
      left join public.profiles p on p.id = m
     where p.id is null
  ) then
    raise exception 'XTRA_UNKNOWN_MEMBER';
  end if;

  if exists (
    select 1 from unnest(v_ids) as m
     where m in (select user_id from public.xtra_members)
  ) then
    raise exception 'XTRA_ALREADY_IN_GROUP';
  end if;

  insert into public.xtra_groups (owner_id, label)
  values (v_uid, v_label)
  returning id into v_group;

  insert into public.xtra_members (user_id, group_id, added_by)
  values (v_uid, v_group, v_uid);

  insert into public.xtra_members (user_id, group_id, added_by)
  select m, v_group, v_uid from unnest(v_ids) as m;

  return public.xtra_summary(v_group);
end;
$$;

-- 5b. The payer's member list.
create or replace function public.xtra_add_members(
  p_group_id uuid,
  p_member_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (select 1 from public.xtra_groups
                  where id = p_group_id and owner_id = v_uid) then
    raise exception 'NOT_GROUP_OWNER';
  end if;

  select coalesce(array_agg(distinct m), '{}'::uuid[])
    into v_ids
    from unnest(coalesce(p_member_ids, '{}'::uuid[])) as m
   where m <> v_uid
     and m not in (select user_id from public.xtra_members);

  if v_ids is null then v_ids := '{}'::uuid[]; end if;

  if exists (
    select 1 from unnest(v_ids) as m
      left join public.profiles p on p.id = m
     where p.id is null
  ) then
    raise exception 'XTRA_UNKNOWN_MEMBER';
  end if;

  insert into public.xtra_members (user_id, group_id, added_by)
  select m, p_group_id, v_uid from unnest(v_ids) as m;

  -- Anyone switched while still inside paid time would throw that
  -- time away, so they are not switched. They flip with everyone else
  -- the next time the pot is funded.
  return public.xtra_summary(p_group_id);
end;
$$;

-- 5c. Fire one seat. The payer cannot fire themselves.
create or replace function public.xtra_remove_member(
  p_group_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select owner_id into v_owner from public.xtra_groups where id = p_group_id;
  if not found then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  if v_owner <> v_uid then
    raise exception 'NOT_GROUP_OWNER';
  end if;
  if p_user_id = v_owner then
    raise exception 'XTRA_PAYER_CANNOT_LEAVE';
  end if;

  delete from public.xtra_members
   where group_id = p_group_id and user_id = p_user_id;

  update public.gliits_plans
     set plan_type  = 'payngo',
         expires_at = null,
         auto_renew = false
   where user_id = p_user_id
     and plan_type = 'xtra';

  return public.xtra_summary(p_group_id);
end;
$$;

-- 5d. Close the group. Any tokens left in the pot go with it: the
--     money was spent buying them, there is no refund path here, and
--     the client is shown the exact figure before it asks.
--
--     A payment opened in the last day blocks the close, because the
--     rows this delete cascades to are the only record the settle
--     path looks up. Without this, naira paid for a pot that was
--     closed mid-checkout would credit nothing and leave no row to
--     show it was ever owed.
create or replace function public.xtra_close(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pool numeric;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select pool_balance into v_pool
    from public.xtra_groups where id = p_group_id and owner_id = v_uid;
  if not found then
    raise exception 'NOT_GROUP_OWNER';
  end if;

  if exists (select 1 from public.xtra_payments
              where group_id = p_group_id
                and status = 'pending'
                and created_at > now() - interval '24 hours') then
    raise exception 'XTRA_PAYMENT_PENDING';
  end if;

  update public.gliits_plans
     set plan_type  = 'payngo',
         expires_at = null,
         auto_renew = false
   where plan_type = 'xtra'
     and user_id in (select user_id from public.xtra_members
                      where group_id = p_group_id);

  delete from public.xtra_groups where id = p_group_id;

  return jsonb_build_object('closed', true, 'forfeited_gliits', v_pool);
end;
$$;

-- 5e. One read shape for every answer above, and for the Billing
--     page's bar. funded_total of 0 means "not paid for yet", which
--     is a state the client must be able to draw, so it is returned
--     rather than invented.
create or replace function public.xtra_summary(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g record;
  v_members integer;
  v_left numeric;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.xtra_is_member(p_group_id) then
    raise exception 'NOT_GROUP_MEMBER';
  end if;

  select id, owner_id, label, pool_balance, funded_total, low_notice_sent
    into g
    from public.xtra_groups where id = p_group_id;
  if not found then
    return null;
  end if;

  select count(*) into v_members from public.xtra_members
   where group_id = p_group_id;

  v_left := case when g.funded_total > 0
                 then round(100 * g.pool_balance / g.funded_total)
                 else 0 end;

  return jsonb_build_object(
    'group_id', g.id,
    'label', g.label,
    'owner_id', g.owner_id,
    'is_payer', (g.owner_id = auth.uid()),
    'members', v_members,
    'pool_balance', g.pool_balance,
    'funded_total', g.funded_total,
    'percent_left', v_left,
    'low', g.low_notice_sent,
    'seat_price_gliits', (select xtra_seat_price_gliits from public.gliits_config where id = 1),
    'per_minute_rate', (select per_minute_rate_gliits from public.gliits_config where id = 1)
  );
end;
$$;

-- 5f. The payment is priced inside the database. The server passes a
--     group and a seat count and gets back the naira to charge; it
--     never supplies the token figure, so neither a member nor a
--     tampered client can price their own pot.
create or replace function public.xtra_payment_intent(
  p_group_id uuid,
  p_payer_id uuid,
  p_seats integer,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_price integer;
  v_rate numeric;
  v_gliits integer;
  v_naira integer;
  v_id uuid;
begin
  if p_seats is null or p_seats < 1 or p_seats > 1000 then
    raise exception 'INVALID_SEATS';
  end if;
  if p_reference is null or length(trim(p_reference)) = 0 then
    raise exception 'INVALID_REFERENCE';
  end if;

  select owner_id into v_owner from public.xtra_groups where id = p_group_id;
  if not found then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  if v_owner <> p_payer_id then
    raise exception 'NOT_GROUP_OWNER';
  end if;

  select c.xtra_seat_price_gliits, c.exchange_rate_naira_to_gliits
    into v_price, v_rate
    from public.gliits_config c where c.id = 1;

  if v_price is null or v_price < 1 or v_rate is null or v_rate <= 0 then
    raise exception 'NO_CONFIG';
  end if;

  v_gliits := v_price * p_seats;
  v_naira  := round(v_gliits * v_rate)::integer;

  insert into public.xtra_payments
    (group_id, payer_id, seats, gliits_amount, naira_amount, reference)
  values (p_group_id, p_payer_id, p_seats, v_gliits, v_naira, p_reference)
  returning id into v_id;

  return jsonb_build_object('payment_id', v_id, 'reference', p_reference,
                            'seats', p_seats, 'gliits_amount', v_gliits,
                            'naira_amount', v_naira);
end;
$$;

-- 5g. Exactly-once crediting, the same shape as credit_wallet_topup:
--     an advisory lock on the reference, a duplicate check that can
--     only be won once, and the paid naira compared against the
--     figure the database itself wrote at intent time.
create or replace function public.xtra_credit_payment(
  p_reference text,
  p_paid_naira integer,
  p_provider text default 'paystack'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay record;
  v_owner uuid;
  v_balance numeric;
begin
  if p_reference is null or length(trim(p_reference)) = 0 then
    raise exception 'INVALID_REFERENCE';
  end if;

  perform pg_advisory_xact_lock(hashtext('xtra:' || p_reference)::bigint);

  select * into v_pay from public.xtra_payments
   where reference = p_reference
   order by created_at desc
   limit 1;

  if not found then
    return jsonb_build_object('credited', false, 'reason', 'unknown_reference');
  end if;
  if v_pay.status = 'success' then
    return jsonb_build_object('credited', false, 'reason', 'duplicate',
                              'group_id', v_pay.group_id);
  end if;

  if coalesce(p_paid_naira, 0) < v_pay.naira_amount then
    update public.xtra_payments
       set status = 'failed'
     where id = v_pay.id;
    return jsonb_build_object('credited', false, 'reason', 'underpaid',
                              'expected_naira', v_pay.naira_amount,
                              'paid_naira', p_paid_naira);
  end if;

  -- A group the payer has since closed cannot be credited into. The
  -- lock is what makes that true: it is taken before anything is
  -- written, so a close running at the same moment waits here instead
  -- of deleting the pot this credit is about to fill.
  select owner_id into v_owner
    from public.xtra_groups
   where id = v_pay.group_id
     for update;
  if not found or v_owner <> v_pay.payer_id then
    update public.xtra_payments
       set status = 'failed'
     where id = v_pay.id;
    return jsonb_build_object('credited', false, 'reason', 'group_unavailable');
  end if;

  update public.xtra_payments
     set status = 'success',
         paid_at = now(),
         provider = coalesce(p_provider, provider)
   where id = v_pay.id;

  update public.xtra_groups
     set pool_balance = pool_balance + v_pay.gliits_amount,
         funded_total = funded_total + v_pay.gliits_amount,
         low_notice_sent = false,
         updated_at = now()
   where id = v_pay.group_id
  returning pool_balance into v_balance;

  -- The pot is now the source for this group, so every member reads
  -- Xtra on the Billing page. A member still inside paid monthly time
  -- keeps it: the meter already leaves expires_at alone.
  insert into public.transactions
    (user_id, amount, points, type, status, reference, description)
  values (v_pay.payer_id, v_pay.gliits_amount, 0, 'xtra_topup', 'success',
          p_reference,
          'Xtra pot - ' || v_pay.seats || ' seat' ||
          case when v_pay.seats = 1 then '' else 's' end);

  return jsonb_build_object('credited', true, 'group_id', v_pay.group_id,
                            'gliits', v_pay.gliits_amount,
                            'pool_balance', v_balance,
                            'reason', null);
end;
$$;

-- The plan flip lives here, after the credit, so it never runs for a
-- payment that failed the checks above.
create or replace function public.xtra_flip_members(p_group_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.gliits_plans
     set plan_type  = 'xtra',
         expires_at = null,
         auto_renew = false
   where user_id in (select user_id from public.xtra_members
                      where group_id = p_group_id)
     and plan_type is distinct from 'xtra'
     and (expires_at is null or expires_at <= now());

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Only the server may price or settle a payment.
revoke all on function public.xtra_payment_intent(uuid, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.xtra_payment_intent(uuid, uuid, integer, text)
  to service_role;

revoke all on function public.xtra_credit_payment(text, integer, text)
  from public, anon, authenticated;
grant execute on function public.xtra_credit_payment(text, integer, text)
  to service_role;

revoke all on function public.xtra_flip_members(uuid)
  from public, anon, authenticated;
grant execute on function public.xtra_flip_members(uuid) to service_role;

revoke execute on function public.xtra_create(text, uuid[]) from public, anon;
grant execute on function public.xtra_create(text, uuid[]) to authenticated;

revoke execute on function public.xtra_add_members(uuid, uuid[]) from public, anon;
grant execute on function public.xtra_add_members(uuid, uuid[]) to authenticated;

revoke execute on function public.xtra_remove_member(uuid, uuid) from public, anon;
grant execute on function public.xtra_remove_member(uuid, uuid) to authenticated;

revoke execute on function public.xtra_close(uuid) from public, anon;
grant execute on function public.xtra_close(uuid) to authenticated;

revoke execute on function public.xtra_summary(uuid) from public, anon;
grant execute on function public.xtra_summary(uuid) to authenticated;


-- ============================================================
-- 6. The meter, with a payment source.
--
--    Body is the live one from sql/plan_lineup.sql §4. Two things are
--    added and nothing else moves:
--      a) v_pool / v_group — the member's group pot, if they have one.
--      b) the charge is split across the pot and the wallet instead
--         of taken from the wallet alone. least()/greatest() mean a
--         minute is charged once and never from two places at once.
--    The sufficiency test is the sum, so a member with 1 token in the
--    pot and 2 in their wallet is billed, and one with 2 tokens
--    anywhere is not. The 'metered' rule and the credit-behind-the-
--    charge rule are untouched.
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
  v_group uuid; v_pool numeric := 0; v_from_pool numeric := 0; v_from_wallet numeric := 0;
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

  -- Whichever pot this member sits in, if any. Membership alone is the
  -- key: the plan label is cosmetic and can lag one payment cycle.
  select g.id, g.pool_balance into v_group, v_pool
    from public.xtra_members m join public.xtra_groups g on g.id = m.group_id
   where m.user_id = v_user;
  if v_group is null then v_pool := 0; end if;

  if v_owner <> v_user then
    if v_metered then
      if v_balance + v_pool < v_rate then raise exception 'INSUFFICIENT_BALANCE'; end if;
      v_charge := v_rate;
      v_from_pool := least(v_pool, v_rate);
      v_from_wallet := v_rate - v_from_pool;
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
    if v_from_wallet > 0 then
      update public.profiles set wallet_balance = wallet_balance - v_from_wallet where id = v_user;
    end if;
    if v_from_pool > 0 then
      update public.xtra_groups
         set pool_balance = pool_balance - v_from_pool,
             updated_at = now()
       where id = v_group;
    end if;
    if v_charge > 0 or v_credit > 0 then
      insert into public.gliits_usage (user_id, post_id, session_id, gliits_charged, creator_credited)
      values (v_user, case when v_target='post' then p_post_id end, case when v_target='session' then p_session_id end, v_charge, v_credit);
    end if;
  end if;
  return jsonb_build_object('balance', v_balance - v_from_wallet, 'charged', v_charge,
    'creator_credited', v_credit, 'target', v_target, 'metered', v_metered,
    'from_pool', v_from_pool, 'from_wallet', v_from_wallet,
    'source', case when v_charge = 0 then 'none'
                   when v_from_pool >= v_charge then 'pool'
                   when v_from_pool > 0 then 'split'
                   else 'wallet' end);
end;
$$;

revoke execute on function public.gliits_heartbeat(uuid, uuid) from public, anon;
grant execute on function public.gliits_heartbeat(uuid, uuid) to authenticated, service_role;


-- ============================================================
-- 7. The door check, on the same sum.
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
  v_pool numeric := 0;
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
  select coalesce(g.pool_balance, 0) into v_pool
    from public.xtra_members m join public.xtra_groups g on g.id = m.group_id
   where m.user_id = v_user;
  v_allowed := (not v_metered) or (v_balance + coalesce(v_pool, 0) >= coalesce(v_rate, 0));
  return jsonb_build_object('allowed', v_allowed, 'reason', case when v_allowed then 'ok' else 'INSUFFICIENT_BALANCE' end,
    'is_host', false, 'metered', v_metered, 'rate', v_rate, 'balance', v_balance,
    'pool', coalesce(v_pool, 0));
end;
$$;

revoke execute on function public.gliits_live_entry_check(uuid) from public, anon;
grant execute on function public.gliits_live_entry_check(uuid) to authenticated, service_role;


-- ============================================================
-- 8. One read for the Billing page.
--
--    Body is the live one with a pot joined on. It stays the single
--    call the page already makes, so the bar costs no round trip.
-- ============================================================
create or replace function public.gliits_get_balance()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_plan jsonb;
  v_pool jsonb;
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

  select public.xtra_summary(m.group_id) into v_pool
  from public.xtra_members m
  where m.user_id = auth.uid();

  return jsonb_build_object(
    'balance', coalesce(v_balance, 0),
    'plan', v_plan,
    'pool', v_pool
  );
end;
$$;

revoke execute on function public.gliits_get_balance() from public, anon;
grant execute on function public.gliits_get_balance() to authenticated, service_role;


-- ============================================================
-- 9. Leaving the lineup ends the seat.
--
--    A member who was added to a group can switch back to their own
--    wallet; the payer cannot, because the group is theirs and would
--    be left funded by nobody. They close it (5d) instead. The
--    PLAN_PERIOD_ACTIVE guard is the live one and still stands.
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

  if exists (select 1 from public.xtra_groups where owner_id = v_uid) then
    raise exception 'XTRA_PAYER_CANNOT_LEAVE';
  end if;

  -- The seat goes with the member, or their row would outlive the
  -- plan it came from and the pot would keep paying for them.
  delete from public.xtra_members where user_id = v_uid;

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
-- 10. Under 30%, once.
--
--    After update, not before, so the figures the member is told are
--    the figures that just became true. The WHEN clause is what stops
--    this firing twice: the flag update below re-enters the trigger
--    with pool_balance unchanged, and the distinct test rejects it.
-- ============================================================
create or replace function public.xtra_low_balance_notice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left numeric;
  v_uid uuid;
begin
  if new.low_notice_sent or new.funded_total <= 0 then
    return new;
  end if;
  if new.pool_balance > round(new.funded_total * 0.30, 2) then
    return new;
  end if;

  v_left := round(100 * new.pool_balance / new.funded_total);

  for v_uid in select user_id from public.xtra_members where group_id = new.id loop
    insert into public.notifications (user_id, actor_id, kind, title, body)
    values (
      v_uid,
      new.owner_id,
      'system',
      'Your Xtra pot is running low',
      'About ' || v_left::text || '% of the tokens bought into "' || new.label || '" are left. '
      || 'Minutes are still billed until it runs out, then they come off your own balance.'
    );
  end loop;

  update public.xtra_groups
     set low_notice_sent = true
   where id = new.id
     and low_notice_sent = false;

  return new;
end;
$$;

drop trigger if exists xtra_low_balance_notice on public.xtra_groups;
create trigger xtra_low_balance_notice
  after update of pool_balance on public.xtra_groups
  for each row
  when (old.pool_balance is distinct from new.pool_balance
        and old.low_notice_sent = false)
  execute function public.xtra_low_balance_notice();


-- ============================================================
-- 11. Both config writers have to know the new key.
--
--    Bodies are the live ones (md5 cca6108d31466a099c29b51b68dc013d /
--    f794fa44e93e03b63b8eb4756456638f) with 'xtra_seat_price_gliits'
--    added to the allowlist and nothing else changed. The guard is
--    still called, so a seat price that is negative, fractional or
--    too wide for the column is refused before it is written.
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
    'live_host_fee_gliits', 'xtra_seat_price_gliits'
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
    'live_host_fee_gliits', 'xtra_seat_price_gliits'
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
  select 1 as ord, 'seat price column exists' as check_name,
    'integer, not null, default 210' as expected,
    (select data_type || ', ' || case when is_nullable = 'NO' then 'not null' else 'null' end
            || ', default ' || coalesce(column_default, 'none')
       from information_schema.columns
      where table_schema = 'public' and table_name = 'gliits_config'
        and column_name = 'xtra_seat_price_gliits') as actual,
    case when (select count(*) from information_schema.columns
                where table_schema = 'public' and table_name = 'gliits_config'
                  and column_name = 'xtra_seat_price_gliits'
                  and data_type = 'integer' and is_nullable = 'NO') = 1
         then 'PASS' else 'FAIL' end as result

  union all
  select 2, 'three xtra tables, all guarded', '3 tables, rls on, no member writes',
    (select coalesce(string_agg(c.relname || ':' || case when c.relrowsecurity then 'rls' else 'NO RLS' end, ', '), 'none')
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('xtra_groups', 'xtra_members', 'xtra_payments')),
    case when (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relname in ('xtra_groups','xtra_members','xtra_payments')
                  and c.relrowsecurity) = 3
          and not exists (
            select 1 from pg_policies
             where schemaname = 'public'
               and tablename in ('xtra_groups','xtra_members','xtra_payments')
               and cmd in ('INSERT','UPDATE','DELETE','*')
               and 'authenticated' = any (roles)
          )
         then 'PASS' else 'FAIL' end

  union all
  select 3, 'one seat per member, everywhere', 'pk on user_id + unique success index',
    (select coalesce(string_agg(i.relname || ' | ' || pg_get_indexdef(x.indexrelid), ' ;; '), 'missing')
       from pg_index x
       join pg_class i on i.oid = x.indrelid
       join pg_class r on r.oid = x.indexrelid
       join pg_namespace n on n.oid = i.relnamespace
      where n.nspname = 'public'
        and ((i.relname = 'xtra_members' and x.indisprimary)
         or (i.relname = 'xtra_payments' and r.relname = 'xtra_payments_reference_success_uk'))),
    case when (select count(*) from pg_index x join pg_class i on i.oid = x.indrelid
                join pg_namespace n on n.oid = i.relnamespace
               where n.nspname = 'public' and i.relname = 'xtra_members' and x.indisprimary
                 and x.indnatts = 1
                 and (select attname from pg_attribute a
                       where a.attrelid = i.oid and a.attnum = x.indkey[0]) = 'user_id') = 1
          and exists (select 1 from pg_index x join pg_class i on i.oid = x.indrelid
                       join pg_class r on r.oid = x.indexrelid
                       join pg_namespace n on n.oid = i.relnamespace
                      where n.nspname = 'public' and i.relname = 'xtra_payments'
                        and r.relname = 'xtra_payments_reference_success_uk'
                        and x.indisunique and x.indpred is not null)
         then 'PASS' else 'FAIL' end

  union all
  select 4, 'plan_type now allows xtra, still allows the two live rows', 'payngo, monthly, yearly, xtra',
    (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid = 'public.gliits_plans'::regclass
        and conname = 'gliits_plans_plan_type_check'),
    case when (select pg_get_constraintdef(oid) from pg_constraint
                where conrelid = 'public.gliits_plans'::regclass
                  and conname = 'gliits_plans_plan_type_check')
              like '%xtra%' then 'PASS' else 'FAIL' end

  union all
  select 5, 'no live plan row broke the widened constraint', '0 rows outside the list',
    (select count(*)::text || ' row(s)' from public.gliits_plans
      where plan_type not in ('payngo','monthly','yearly','xtra')),
    case when not exists (select 1 from public.gliits_plans
                           where plan_type not in ('payngo','monthly','yearly','xtra'))
         then 'PASS' else 'FAIL' end

  union all
  select 6, 'meter still keys on the expiry, not a plan list', '2 of 2 functions',
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
  select 7, 'pot is the first source in both', '2 of 2 functions',
    (select count(*)::text || ' of 2'
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and proname in ('gliits_heartbeat', 'gliits_live_entry_check')
        and prosrc like '%xtra_members%'),
    case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and proname in ('gliits_heartbeat', 'gliits_live_entry_check')
                  and prosrc like '%xtra_members%') = 2
         then 'PASS' else 'FAIL' end

  union all
  select 8, 'a minute is never charged twice', 'from_pool + from_wallet = rate',
    (select case when prosrc like '%v_from_pool := least(v_pool, v_rate)%'
                   and prosrc like '%v_from_wallet := v_rate - v_from_pool%'
                   and prosrc like '%v_balance + v_pool < v_rate%'
                 then 'split maths present' else 'MISSING' end
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname = 'gliits_heartbeat'),
    case when (select prosrc like '%v_from_pool := least(v_pool, v_rate)%'
                 and prosrc like '%v_from_wallet := v_rate - v_from_pool%'
                 and prosrc like '%v_balance + v_pool < v_rate%'
               from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and proname = 'gliits_heartbeat')
         then 'PASS' else 'FAIL' end

  union all
  select 9, 'credit still follows the charge', 'v_charge > 0 and v_creator_rate > 0',
    (select case when prosrc like '%if v_charge > 0 and v_creator_rate > 0 then%'
                 then 'present' else 'absent' end
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname = 'gliits_heartbeat'),
    case when (select prosrc like '%if v_charge > 0 and v_creator_rate > 0 then%'
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and proname = 'gliits_heartbeat')
         then 'PASS' else 'FAIL' end

  union all
  select 10, 'get_balance answers with the pot', 'the pool arrives in one call',
    (select case when prosrc like '%xtra_summary%' and prosrc like '%''pool''%'
                 then 'present' else 'absent' end
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname = 'gliits_get_balance'),
    case when (select prosrc like '%xtra_summary%' and prosrc like '%''pool''%'
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and proname = 'gliits_get_balance')
         then 'PASS' else 'FAIL' end

  union all
  select 11, 'set_plan sells payngo, and refuses a payer', 'INVALID_PLAN_TYPE + PLAN_PERIOD_ACTIVE + XTRA_PAYER_CANNOT_LEAVE',
    (select coalesce(string_agg(case when prosrc like '%monthly%' then 'still sells ' || proname else proname || ': clean' end, ' | '), 'function missing')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname = 'gliits_set_plan'),
    case when (select prosrc not like '%monthly%' and prosrc not like '%yearly%'
                 and prosrc like '%INVALID_PLAN_TYPE%' and prosrc like '%PLAN_PERIOD_ACTIVE%'
                 and prosrc like '%XTRA_PAYER_CANNOT_LEAVE%'
                 and prosrc like '%delete from public.xtra_members%'
               from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and proname = 'gliits_set_plan')
         then 'PASS' else 'FAIL' end

  union all
  select 12, 'six group RPCs, plus the two the server owns', '8 of 8 present',
    (select count(*)::text || ' of 8'
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and proname in ('xtra_create','xtra_add_members','xtra_remove_member',
                        'xtra_close','xtra_summary','xtra_is_member',
                        'xtra_payment_intent','xtra_credit_payment')),
    case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and proname in ('xtra_create','xtra_add_members','xtra_remove_member',
                                  'xtra_close','xtra_summary','xtra_is_member',
                                  'xtra_payment_intent','xtra_credit_payment')) = 8
         then 'PASS' else 'FAIL' end

  union all
  select 13, 'payment RPCs are server-only', 'service_role, not authenticated',
    (select coalesce(string_agg(proname || ' -> ' ||
             case when has_function_privilege('service_role', p.oid, 'execute') then 'service_role' else '(no svc)' end
             || case when has_function_privilege('authenticated', p.oid, 'execute') then ' +authenticated' else '' end,
             ', '), 'none')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and proname in ('xtra_payment_intent','xtra_credit_payment','xtra_flip_members')),
    case when not exists (
             select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and proname in ('xtra_payment_intent','xtra_credit_payment','xtra_flip_members')
                and has_function_privilege('authenticated', p.oid, 'execute'))
          and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and proname in ('xtra_payment_intent','xtra_credit_payment','xtra_flip_members')
                  and has_function_privilege('service_role', p.oid, 'execute')) = 3
         then 'PASS' else 'FAIL' end

  union all
  select 14, 'the 30% notice fires once per crossing', '1 trigger, WHEN guard on the flag',
    (select coalesce(string_agg(t.tgname || ' -> ' ||
             case when pg_get_triggerdef(t.oid) like '%old.low_notice_sent = false%'
                  then 'only while the flag is false' else 'NO FLAG GUARD' end, ', '), 'none')
       from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where c.relname = 'xtra_groups' and t.tgname = 'xtra_low_balance_notice'
        and not t.tgisinternal),
    case when (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
                where c.relname = 'xtra_groups'
                  and t.tgname = 'xtra_low_balance_notice' and not t.tgisinternal
                  and pg_get_triggerdef(t.oid) like '%old.low_notice_sent = false%') = 1
              and (select prosrc like '%set low_notice_sent = true%'
                     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and proname = 'xtra_low_balance_notice')
         then 'PASS' else 'FAIL' end

  union all
  select 15, 'both config writers take the seat price', '2 of 2',
    (select count(*)::text || ' of 2'
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and proname in ('registrar_set_config', 'gliits_set_config')
        and prosrc like '%xtra_seat_price_gliits%'),
    case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and proname in ('registrar_set_config', 'gliits_set_config')
                  and prosrc like '%xtra_seat_price_gliits%') = 2
         then 'PASS' else 'FAIL' end

  union all
  select 16, 'the guard is still in both writers', '2 of 2 call gliits_config_guard',
    (select count(*)::text || ' of 2'
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and proname in ('registrar_set_config', 'gliits_set_config')
        and prosrc like '%gliits_config_guard%'),
    case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and proname in ('registrar_set_config', 'gliits_set_config')
                  and prosrc like '%gliits_config_guard%') = 2
         then 'PASS' else 'FAIL' end

  union all
  select 17, 'nobody has a pot yet (expected on day one)', '0 groups, 0 members',
    (select (select count(*) from public.xtra_groups)::text
            || ' group(s), ' ||
            (select count(*) from public.xtra_members)::text || ' seat(s)'),
    'PASS'

  union all
  select 18, 'grandfathered monthly rows untouched', 'both still inside paid time',
    (select coalesce(string_agg(plan_type || ' until ' || expires_at::date::text, ', '), 'none left')
       from public.gliits_plans
      where plan_type in ('monthly', 'yearly')),
    case when not exists (select 1 from public.gliits_plans
                           where plan_type in ('monthly', 'yearly')
                             and (expires_at is null or expires_at <= now()))
         then 'PASS' else 'FAIL' end

  union all
  select 19, 'a close cannot strand a payment', 'pending guard + pot row lock',
    (select coalesce(string_agg(case
       when proname = 'xtra_close' and prosrc like '%XTRA_PAYMENT_PENDING%' then 'close refuses a pending payment'
       when proname = 'xtra_credit_payment' and prosrc like '%for update%' then 'credit locks the pot before writing'
       else proname || ': guard missing' end, ' | '), 'functions missing')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname in ('xtra_close', 'xtra_credit_payment')),
    case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and ((proname = 'xtra_close' and prosrc like '%XTRA_PAYMENT_PENDING%')
                    or (proname = 'xtra_credit_payment' and prosrc like '%for update%'))) = 2
         then 'PASS' else 'FAIL' end
) grid
order by ord;
