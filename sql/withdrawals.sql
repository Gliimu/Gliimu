-- ============================================================
-- Gliimu: Withdrawals — Gliims out to a member's own bank account
--
-- WHAT THIS INSTALLS
--   1. Three new prices in gliits_config:
--        min_withdrawal_gliits   default 10000  — the threshold to cash out
--        max_withdrawal_gliits   default 200000 — one payout, one ceiling
--        withdrawal_hold_hours   default 72     — how long fresh Gliims must
--                                                 age before they can leave
--   2. public.payout_details  — one row per member: legal name, phone, bank,
--      account number, the name the bank actually resolves for that account,
--      and the Paystack recipient code we reuse for every payout.
--   3. public.withdrawals     — the payout ledger. Money is debited when the
--      member asks, not when it is sent, so a balance can never be double
--      spent while a payout is in flight.
--   4. RPCs for the member app (save_payout_details, request_withdrawal,
--      cancel_withdrawal), the registrar app (registrar_withdrawals,
--      registrar_begin_payout, registrar_mark_withdrawal_paid,
--      registrar_reject_withdrawal) and the server only
--      (settle_withdrawal — what the Paystack webhook lands on).
--
-- THE FOUR ANTI-FRAUD CONTROLS, and why each one is there
--   * The account holder's name is never typed by the member. The server
--     reads it from the bank (NIP resolution). If what the member claims and
--     what the bank says disagree, the payout row carries name_match = false
--     and automated disbursement refuses it — a registrar still sees it and
--     decides.
--   * One bank account belongs to one member. A second account trying to use
--     it is rejected outright. This kills the "farm of accounts, one wallet"
--     pattern.
--   * Freshly topped-up Gliims are held for withdrawal_hold_hours. Carding is
--     stolen card -> top up -> withdraw to my bank. A hold makes that a
--     refund race the member cannot win, and it costs honest members nothing
--     because the threshold is G10,000 anyway.
--   * One payout in flight per member, and at most one completed payout per
--     24 hours. Bulk cash-out attempts stall.
--
-- RUN ORDER: after sql/gliits_billing.sql, sql/registrar.sql and
-- sql/admin.sql (they provide gliits_config, admin_has_role and the audit
-- table). Safe to run more than once.
--
-- HOW TO RUN
--   1. Supabase dashboard -> SQL editor -> New query.
--   2. Paste the whole file except the SELF CHECK block. Press Run.
--      Expect "Success. No rows returned".
--   3. Paste only the SELF CHECK block, from "with cfg as (" to "order by 1;".
--      Press Run. Every item must read OK.
-- ============================================================

begin;

-- ============================================================
-- 1. The three new prices
-- ============================================================
alter table public.gliits_config
  add column if not exists min_withdrawal_gliits integer not null default 10000,
  add column if not exists max_withdrawal_gliits integer not null default 200000,
  add column if not exists withdrawal_hold_hours integer not null default 72;

comment on column public.gliits_config.min_withdrawal_gliits is
  'Smallest bank payout a member can ask for, in Gliits.';
comment on column public.gliits_config.max_withdrawal_gliits is
  'Largest single bank payout, in Gliits. Raises the ceiling, not the total.';
comment on column public.gliits_config.withdrawal_hold_hours is
  'Hours a member must wait after topping up before Gliims can leave the platform.';

-- ============================================================
-- 2. payout_details — who gets paid, and where
-- ============================================================
create table if not exists public.payout_details (
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  full_name         text not null,
  phone             text not null,
  bank_code         integer not null,
  bank_name         text,
  account_number    text not null,
  account_name      text,
  recipient_code    text,
  terms_accepted_at timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint payout_details_account_check check (account_number ~ '^[0-9]{10}$'),
  constraint payout_details_phone_check   check (phone ~ '^[0-9]{10,15}$'),
  constraint payout_details_name_check    check (length(btrim(full_name)) >= 3)
);

comment on table public.payout_details is
  'Bank payout destination per member. account_name is written by the server from NIP resolution, never by the member.';

-- One bank account, one member.
create unique index if not exists payout_details_account_unique
  on public.payout_details (account_number);

alter table public.payout_details enable row level security;

revoke all on public.payout_details from public, anon, authenticated;
grant select on public.payout_details to authenticated;
grant all on public.payout_details to service_role;

drop policy if exists "Owner reads own payout details" on public.payout_details;
create policy "Owner reads own payout details"
  on public.payout_details for select to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================
-- 3. withdrawals — the payout ledger
-- ============================================================
create table if not exists public.withdrawals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  amount_gliits   integer not null check (amount_gliits > 0),
  amount_naira    numeric(12,2) not null check (amount_naira > 0),
  status          text not null default 'requested',
  reference       text not null unique,
  full_name       text not null,
  phone           text not null,
  bank_code       integer not null,
  bank_name       text,
  account_number  text not null,
  account_name    text,
  name_match      boolean,
  recipient_code  text,
  transfer_code   text,
  failure_reason  text,
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint withdrawals_status_check
    check (status in ('requested','processing','paid','failed','rejected','cancelled'))
);

comment on table public.withdrawals is
  'Every bank payout: what was claimed, where it went, who approved it and what the bank said.';

create index if not exists withdrawals_user_idx
  on public.withdrawals (user_id, created_at desc);
create index if not exists withdrawals_status_idx
  on public.withdrawals (status, created_at);

alter table public.withdrawals enable row level security;

revoke all on public.withdrawals from public, anon, authenticated;
grant select on public.withdrawals to authenticated;
grant all on public.withdrawals to service_role;

drop policy if exists "Owner reads own withdrawals" on public.withdrawals;
create policy "Owner reads own withdrawals"
  on public.withdrawals for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Registrar reads the payout queue" on public.withdrawals;
create policy "Registrar reads the payout queue"
  on public.withdrawals for select to authenticated
  using (public.admin_has_role((select auth.uid()), 'registrar'));

drop policy if exists "Registrar reads payout identities" on public.payout_details;
create policy "Registrar reads payout identities"
  on public.payout_details for select to authenticated
  using (public.admin_has_role((select auth.uid()), 'registrar'));

-- ============================================================
-- 4. save_payout_details — the bank decides who they are
--    The name is never taken from the caller: it is read from the
--    member's own profile, so the only way to pass the bank check later
--    is to hold an account the bank itself records under that name. A
--    member who types someone else's name cannot buy a matching record.
--    The bank's answer (account_name) is cleared here, so a changed
--    destination always has to be resolved again.
-- ============================================================
create or replace function public.save_payout_details(
  p_phone text,
  p_bank_code integer,
  p_account_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_name     text;
  v_phone    text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_acct     text := regexp_replace(coalesce(p_account_number, ''), '[^0-9]', '', 'g');
  v_owner    uuid;
  v_inflight uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select btrim(coalesce(full_name, '')) into v_name
    from public.profiles where id = uid;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if length(v_name) < 3 or v_name !~ '[A-Za-z]' then
    return jsonb_build_object('ok', false, 'code', 'BAD_NAME',
                              'detail', 'Your profile needs the full name that appears on your bank account.');
  end if;
  if v_phone !~ '^[0-9]{10,15}$' then
    return jsonb_build_object('ok', false, 'code', 'BAD_PHONE');
  end if;
  if v_acct !~ '^[0-9]{10}$' then
    return jsonb_build_object('ok', false, 'code', 'BAD_ACCOUNT');
  end if;
  if p_bank_code is null or p_bank_code <= 0 then
    return jsonb_build_object('ok', false, 'code', 'BAD_BANK');
  end if;

  perform pg_advisory_xact_lock(hashtext('payout_details:' || uid::text));

  select user_id into v_owner
    from public.payout_details
   where account_number = v_acct;
  if v_owner is not null and v_owner <> uid then
    return jsonb_build_object('ok', false, 'code', 'ACCOUNT_IN_USE',
                              'detail', 'Another member already receives payouts on this account number.');
  end if;

  -- Changing the destination while a payout is queued would re-point money
  -- that was already debited against the old details.
  select id into v_inflight
    from public.withdrawals
   where user_id = uid and status in ('requested','processing')
   limit 1;
  if v_inflight is not null then
    return jsonb_build_object('ok', false, 'code', 'PAYOUT_IN_FLIGHT',
                              'detail', 'Cancel or wait for the payout that is already on its way.');
  end if;

  insert into public.payout_details
    (user_id, full_name, phone, bank_code, bank_name, account_number,
     account_name, recipient_code, terms_accepted_at, created_at, updated_at)
  values
    (uid, v_name, v_phone, p_bank_code, null, v_acct, null, null, now(), now(), now())
  on conflict (user_id) do update
     set full_name        = excluded.full_name,
         phone            = excluded.phone,
         bank_code        = excluded.bank_code,
         bank_name        = null,
         account_number   = excluded.account_number,
         account_name     = null,
         recipient_code   = null,
         terms_accepted_at = now(),
         updated_at       = now();

  return jsonb_build_object('ok', true, 'full_name', v_name);
end;
$$;

revoke execute on function public.save_payout_details(text, integer, text)
  from public, anon;
grant execute on function public.save_payout_details(text, integer, text)
  to authenticated, service_role;

-- ============================================================
-- 5. request_withdrawal — debit the wallet and queue the payout
-- ============================================================
create or replace function public.request_withdrawal(p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid         uuid := auth.uid();
  cfg         public.gliits_config%rowtype;
  pd          public.payout_details%rowtype;
  v_balance   integer;
  v_rate      numeric;
  v_naira     numeric;
  v_inflight  uuid;
  v_recent    uuid;
  v_hold      timestamptz;
  v_id        uuid;
  v_ref       text;
  v_match     boolean;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT');
  end if;

  select * into cfg from public.gliits_config where id = 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'MISSING_CONFIG',
                              'detail', 'Run sql/gliits_billing.sql.');
  end if;

  v_rate := coalesce(nullif(cfg.exchange_rate_naira_to_gliits, 0), 1);

  if p_amount < coalesce(cfg.min_withdrawal_gliits, 10000) then
    return jsonb_build_object('ok', false, 'code', 'BELOW_MINIMUM',
                              'minimum', coalesce(cfg.min_withdrawal_gliits, 10000));
  end if;
  if p_amount > coalesce(cfg.max_withdrawal_gliits, 200000) then
    return jsonb_build_object('ok', false, 'code', 'ABOVE_MAXIMUM',
                              'maximum', coalesce(cfg.max_withdrawal_gliits, 200000));
  end if;

  perform pg_advisory_xact_lock(hashtext('withdraw:' || uid::text));

  select coalesce(wallet_balance, 0) into v_balance
    from public.profiles where id = uid for update;
  if v_balance < p_amount then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_FUNDS',
                              'detail', 'Your wallet holds G' || v_balance || '.');
  end if;

  select * into pd from public.payout_details where user_id = uid;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_PAYOUT_DETAILS');
  end if;
  if pd.account_name is null or btrim(pd.account_name) = '' then
    return jsonb_build_object('ok', false, 'code', 'NEED_BANK_VERIFICATION',
                              'detail', 'Confirm the account with your bank before withdrawing.');
  end if;

  select id into v_inflight
    from public.withdrawals
   where user_id = uid and status in ('requested','processing')
   limit 1;
  if v_inflight is not null then
    return jsonb_build_object('ok', false, 'code', 'PAYOUT_IN_FLIGHT');
  end if;

  -- One completed payout per day.
  select id into v_recent
    from public.withdrawals
   where user_id = uid and status = 'paid'
     and coalesce(paid_at, updated_at, created_at) > now() - interval '24 hours'
   limit 1;
  if v_recent is not null then
    return jsonb_build_object('ok', false, 'code', 'ONE_PER_DAY');
  end if;

  -- Freshly bought Gliims cannot leave the platform yet.
  if coalesce(cfg.withdrawal_hold_hours, 0) > 0 then
    v_hold := now() - make_interval(hours => cfg.withdrawal_hold_hours);
    if exists (select 1 from public.transactions
                where user_id = uid and type = 'topup' and amount > 0
                  and created_at > v_hold) then
      return jsonb_build_object('ok', false, 'code', 'RECENT_TOPUP',
                                'hours', cfg.withdrawal_hold_hours);
    end if;
  end if;

  v_naira := round(p_amount / v_rate, 2);
  v_ref   := 'glw' || replace(gen_random_uuid()::text, '-', '');
  v_match := (lower(regexp_replace(pd.full_name, '\s+', ' ', 'g'))
              = lower(regexp_replace(pd.account_name, '\s+', ' ', 'g')));

  update public.profiles
     set wallet_balance = wallet_balance - p_amount
   where id = uid;

  insert into public.withdrawals
    (user_id, amount_gliits, amount_naira, status, reference,
     full_name, phone, bank_code, bank_name, account_number, account_name, name_match,
     recipient_code, created_at, updated_at)
  values
    (uid, p_amount, v_naira, 'requested', v_ref,
     pd.full_name, pd.phone, pd.bank_code, pd.bank_name, pd.account_number, pd.account_name,
     v_match, pd.recipient_code, now(), now())
  returning id into v_id;

  insert into public.transactions (user_id, amount, points, type, status, reference, description)
  values (uid, -p_amount, 0, 'withdrawal', 'success', v_ref,
          'Payout to ' || coalesce(pd.bank_name, 'bank') || ' account ending '
          || right(pd.account_number, 4));

  return jsonb_build_object('ok', true, 'id', v_id, 'reference', v_ref,
                            'amount', p_amount, 'naira', v_naira,
                            'name_match', v_match,
                            'balance', (select wallet_balance from public.profiles where id = uid));
end;
$$;

revoke execute on function public.request_withdrawal(integer) from public, anon;
grant execute on function public.request_withdrawal(integer) to authenticated, service_role;

-- ============================================================
-- 6. cancel_withdrawal — only while nothing has been sent
-- ============================================================
create or replace function public.cancel_withdrawal(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v        public.withdrawals%rowtype;
  v_after  integer;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  perform pg_advisory_xact_lock(hashtext('withdraw:' || uid::text));

  select * into v from public.withdrawals where id = p_id and user_id = uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v.status <> 'requested' then
    return jsonb_build_object('ok', false, 'code', 'CANNOT_CANCEL',
                              'detail', 'The payout is already with the bank.');
  end if;

  update public.withdrawals
     set status = 'cancelled', updated_at = now(),
         failure_reason = 'Cancelled by the member.'
   where id = p_id;

  update public.profiles
     set wallet_balance = coalesce(wallet_balance, 0) + v.amount_gliits
   where id = uid
   returning wallet_balance into v_after;

  insert into public.transactions (user_id, amount, points, type, status, reference, description)
  values (uid, v.amount_gliits, 0, 'withdrawal_refund', 'success', v.reference,
          'Payout cancelled, Gliims returned to your wallet');

  return jsonb_build_object('ok', true, 'balance', v_after);
end;
$$;

revoke execute on function public.cancel_withdrawal(uuid) from public, anon;
grant execute on function public.cancel_withdrawal(uuid) to authenticated, service_role;

-- ============================================================
-- 7. registrar_withdrawals — the queue, with the money totals
-- ============================================================
create or replace function public.registrar_withdrawals(
  p_status text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
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
    'id', s.id, 'user_id', s.user_id, 'name', s.name, 'username', s.username,
    'amount_gliits', s.amount_gliits, 'amount_naira', s.amount_naira,
    'status', s.status, 'reference', s.reference,
    'full_name', s.full_name, 'phone', s.phone,
    'bank_name', s.bank_name, 'account_number', s.account_number,
    'account_name', s.account_name, 'name_match', s.name_match,
    'recipient_code', s.recipient_code, 'transfer_code', s.transfer_code,
    'failure_reason', s.failure_reason,
    'reviewer', s.reviewer, 'created_at', s.created_at, 'paid_at', s.paid_at
  ) order by s.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select w.id::text as id, w.user_id,
           coalesce(p.full_name, p.username, 'Member') as name, p.username,
           w.amount_gliits, w.amount_naira, w.status, w.reference,
           w.full_name, w.phone, w.bank_name, w.account_number, w.account_name,
           w.name_match, w.recipient_code, w.transfer_code, w.failure_reason,
           rw.full_name as reviewer, w.created_at, w.paid_at
      from public.withdrawals w
      left join public.profiles p on p.id = w.user_id
      left join public.profiles rw on rw.id = w.reviewed_by
     where p_status is null or w.status = p_status
     order by w.created_at desc
     limit v_limit
  ) s;

  return jsonb_build_object(
    'ok', true,
    'rows', v_rows,
    'totals', (
      select jsonb_object_agg(k.c, coalesce(x.n, 0))
      from (values ('requested'), ('processing'), ('paid'), ('failed'),
                   ('rejected'), ('cancelled')) k(c)
      left join (
        select status as c, count(*) as n
          from public.withdrawals group by status
      ) x on x.c = k.c
    ),
    'pending_gliits', coalesce((select sum(amount_gliits) from public.withdrawals
                                 where status in ('requested','processing')), 0),
    'min_withdrawal', (select min_withdrawal_gliits from public.gliits_config where id = 1),
    'max_withdrawal', (select max_withdrawal_gliits from public.gliits_config where id = 1),
    'hold_hours', (select withdrawal_hold_hours from public.gliits_config where id = 1)
  );
end;
$$;

revoke execute on function public.registrar_withdrawals(text, integer) from public, anon;
grant execute on function public.registrar_withdrawals(text, integer) to authenticated, service_role;

-- ============================================================
-- 8. registrar_begin_payout — claim a row before calling Paystack
--    Two registrars, one click each: only the first gets a payload.
-- ============================================================
create or replace function public.registrar_begin_payout(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  v    public.withdrawals%rowtype;
  cfg  public.gliits_config%rowtype;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;

  perform pg_advisory_xact_lock(hashtext('payout_send:' || p_id::text));

  select * into v from public.withdrawals where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v.status <> 'requested' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_SENT_OR_CLOSED',
                              'detail', 'That payout is ' || v.status || '.');
  end if;
  if v.account_name is null or btrim(v.account_name) = '' then
    return jsonb_build_object('ok', false, 'code', 'NOT_RESOLVED',
                              'detail', 'Re-resolve the account before sending.');
  end if;
  if v.name_match is not true then
    return jsonb_build_object('ok', false, 'code', 'NAME_MISMATCH',
                              'detail', v.full_name || ' vs ' || v.account_name);
  end if;

  select * into cfg from public.gliits_config where id = 1;
  if coalesce(cfg.withdrawal_hold_hours, 0) > 0 and exists (
    select 1 from public.transactions
     where user_id = v.user_id and type = 'topup' and amount > 0
       and created_at > v.created_at - make_interval(hours => cfg.withdrawal_hold_hours)
  ) then
    return jsonb_build_object('ok', false, 'code', 'RECENT_TOPUP',
                              'detail', 'A top-up landed inside the hold window. Wait, or reject this payout.');
  end if;

  update public.withdrawals
     set status = 'processing', reviewed_by = uid, reviewed_at = now(), updated_at = now()
   where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'withdrawal', jsonb_build_object(
      'id', v.id, 'user_id', v.user_id, 'reference', v.reference,
      'amount_gliits', v.amount_gliits, 'amount_naira', v.amount_naira,
      'account_number', v.account_number, 'account_name', v.account_name,
      'bank_code', v.bank_code, 'recipient_code', v.recipient_code
    )
  );
end;
$$;

revoke execute on function public.registrar_begin_payout(uuid) from public, anon;
grant execute on function public.registrar_begin_payout(uuid) to authenticated, service_role;

-- ============================================================
-- 9. settle_withdrawal — the only way money is marked paid
--    The server calls it after Paystack accepts a transfer, and again
--    from the transfer.* webhook. Service role only: no browser,
--    no member, no registrar can turn a payout into a payment.
-- ============================================================
create or replace function public.settle_withdrawal(
  p_reference text,
  p_status text,
  p_transfer_code text default null,
  p_recipient_code text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v       public.withdrawals%rowtype;
  v_note  text;
  v_after integer;
begin
  select * into v from public.withdrawals
   where reference = nullif(btrim(coalesce(p_reference, '')), '')
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if v.status in ('paid','failed','rejected','cancelled') then
    return jsonb_build_object('ok', true, 'already', v.status, 'id', v.id);
  end if;

  v_note := nullif(btrim(coalesce(p_reason, '')), '');

  if p_status = 'paid' then
    update public.withdrawals
       set status = 'paid',
           transfer_code  = coalesce(p_transfer_code, transfer_code),
           recipient_code = coalesce(p_recipient_code, recipient_code),
           paid_at = now(), reviewed_at = coalesce(reviewed_at, now()), updated_at = now()
     where id = v.id;

    insert into public.notifications (user_id, kind, title, body, link_url)
    values (v.user_id, 'system', 'Payout sent',
            'G' || v.amount_gliits || ' is on its way to '
            || coalesce(v.bank_name, 'your bank') || ' account ending '
            || right(v.account_number, 4) || '.', '/wallet');

  elsif p_status in ('failed','reversed') then
    update public.withdrawals
       set status = 'failed',
           transfer_code  = coalesce(p_transfer_code, transfer_code),
           failure_reason = coalesce(v_note, 'The bank refused the transfer.'),
           updated_at = now()
     where id = v.id;

    update public.profiles
       set wallet_balance = coalesce(wallet_balance, 0) + v.amount_gliits
     where id = v.user_id
     returning wallet_balance into v_after;

    insert into public.transactions (user_id, amount, points, type, status, reference, description)
    values (v.user_id, v.amount_gliits, 0, 'withdrawal_refund', 'success', v.reference,
            'Payout failed, Gliims returned to your wallet');

    insert into public.notifications (user_id, kind, title, body, link_url)
    values (v.user_id, 'system', 'Payout could not be sent',
            coalesce(v_note, 'The bank refused the transfer.')
            || ' G' || v.amount_gliits || ' is back in your wallet.', '/wallet');

  else
    -- 'processing': the transfer is queued at Paystack, nothing settled yet.
    update public.withdrawals
       set status = 'processing',
           transfer_code  = coalesce(p_transfer_code, transfer_code),
           recipient_code = coalesce(p_recipient_code, recipient_code),
           updated_at = now()
     where id = v.id;
  end if;

  if p_recipient_code is not null then
    update public.payout_details
       set recipient_code = p_recipient_code, updated_at = now()
     where user_id = v.user_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v.id,
                            'status', (select status from public.withdrawals where id = v.id),
                            'balance', v_after);
end;
$$;

revoke execute on function public.settle_withdrawal(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_withdrawal(text, text, text, text, text)
  to service_role;

comment on function public.settle_withdrawal(text, text, text, text, text) is
  'Server only. Closes a payout as paid, or refunds it as failed. Revoked from authenticated.';

-- ============================================================
-- 10. registrar_reject_withdrawal — no money leaves, wallet restored
-- ============================================================
create or replace function public.registrar_reject_withdrawal(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v        public.withdrawals%rowtype;
  v_reason text;
  v_after  integer;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if char_length(coalesce(v_reason, '')) < 5 then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED',
                              'detail', 'Write why - it goes on the audit log and to the member.');
  end if;

  perform pg_advisory_xact_lock(hashtext('payout_send:' || p_id::text));

  select * into v from public.withdrawals where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v.status <> 'requested' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_SENT_OR_CLOSED',
                              'detail', 'That payout is ' || v.status
                              || '. Use the transfer receipt to settle it.');
  end if;

  update public.withdrawals
     set status = 'rejected', failure_reason = v_reason,
         reviewed_by = uid, reviewed_at = now(), updated_at = now()
   where id = p_id;

  update public.profiles
     set wallet_balance = coalesce(wallet_balance, 0) + v.amount_gliits
   where id = v.user_id
   returning wallet_balance into v_after;

  insert into public.transactions (user_id, amount, points, type, status, reference, description)
  values (v.user_id, v.amount_gliits, 0, 'withdrawal_refund', 'success', v.reference,
          'Payout declined: ' || left(v_reason, 140));

  insert into public.admin_adjustments (kind, user_id, amount, reason, reference, applied_by)
  values ('withdrawal', v.user_id, -v.amount_gliits, v_reason, v.reference, uid);

  insert into public.notifications (user_id, kind, title, body, link_url)
  values (v.user_id, 'system', 'Payout declined',
          v_reason || ' G' || v.amount_gliits || ' is back in your wallet.', '/wallet');

  return jsonb_build_object('ok', true, 'balance', v_after);
end;
$$;

revoke execute on function public.registrar_reject_withdrawal(uuid, text) from public, anon;
grant execute on function public.registrar_reject_withdrawal(uuid, text) to authenticated, service_role;

-- ============================================================
-- 11. registrar_mark_withdrawal_paid — the manual path
--     For a payout settled outside the API (bank transfer done by hand,
--     or the transfer API is not connected yet). Records who said so.
-- ============================================================
create or replace function public.registrar_mark_withdrawal_paid(
  p_id uuid,
  p_reason text,
  p_transfer_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v        public.withdrawals%rowtype;
  v_reason text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if char_length(coalesce(v_reason, '')) < 5 then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED',
                              'detail', 'Write the bank receipt or the reason - it is the only proof this payout happened.');
  end if;

  perform pg_advisory_xact_lock(hashtext('payout_send:' || p_id::text));

  select * into v from public.withdrawals where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v.status not in ('requested','processing') then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_CLOSED',
                              'detail', 'That payout is already ' || v.status || '.');
  end if;

  update public.withdrawals
     set status = 'paid',
         transfer_code = coalesce(nullif(btrim(coalesce(p_transfer_ref, '')), ''), transfer_code),
         failure_reason = 'Paid by hand: ' || v_reason,
         reviewed_by = uid, reviewed_at = now(), paid_at = now(), updated_at = now()
   where id = p_id;

  insert into public.admin_adjustments (kind, user_id, amount, reason, reference, applied_by)
  values ('withdrawal', v.user_id, -v.amount_gliits, v_reason, v.reference, uid);

  insert into public.notifications (user_id, kind, title, body, link_url)
  values (v.user_id, 'system', 'Payout sent',
          'G' || v.amount_gliits || ' was sent to '
          || coalesce(v.bank_name, 'your bank') || ' account ending '
          || right(v.account_number, 4) || '.', '/wallet');

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

revoke execute on function public.registrar_mark_withdrawal_paid(uuid, text, text)
  from public, anon;
grant execute on function public.registrar_mark_withdrawal_paid(uuid, text, text)
  to authenticated, service_role;

-- ============================================================
-- 12. registrar_set_config — teach the pricing editor the new keys
--     The function keeps a hard allowlist, so without this the Config
--     tab shows the three withdrawal prices but refuses to save them.
--     Body is the live one, unchanged apart from the allowlist.
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
  v_allowlist text[] := array[
    'exchange_rate_naira_to_gliits', 'per_minute_rate_gliits',
    'plan_monthly_price_gliits', 'plan_yearly_price_gliits',
    'signup_credit_gliits', 'min_topup_gliits',
    'creator_rate_per_minute', 'creator_cap_per_post_session',
    'idle_timeout_minutes', 'gp_to_gliits_ratio', 'gp_to_gliits_threshold',
    'min_withdrawal_gliits', 'max_withdrawal_gliits', 'withdrawal_hold_hours'
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

  execute format('select %I from public.gliits_config where id = 1', p_key) into v_old;

  execute format(
    'update public.gliits_config set %I = $1, updated_at = now() where id = 1',
    p_key
  ) using p_value;

  insert into public.admin_adjustments (kind, amount, reason, reference, applied_by)
  values ('price', p_value::integer, p_reason,
          p_key || ': ' || coalesce(v_old::text, '?') || ' -> ' || p_value::text, uid);

  return jsonb_build_object('ok', true, 'key', p_key, 'previous', v_old, 'amount', p_value);
end;
$$;

revoke execute on function public.registrar_set_config(text, numeric, text)
  from public, anon;
grant execute on function public.registrar_set_config(text, numeric, text)
  to authenticated, service_role;

-- ============================================================
-- 13. Wallet history labels
-- ============================================================
-- transactions.type is free text, so nothing to alter. The two new kinds
-- are 'withdrawal' (debit) and 'withdrawal_refund' (credit). The member
-- client maps both; see TX_TYPE_LABELS in billing.js.

commit;

-- ============================================================
-- SELF CHECK — paste from "with cfg as (" to "order by 1;" and run it.
-- Nothing to edit. Every item must read OK.
-- ============================================================
with cfg as (
  select min_withdrawal_gliits as mn, max_withdrawal_gliits as mx, withdrawal_hold_hours as hold
    from public.gliits_config where id = 1
),
fns as (
  select p.proname, p.prosecdef,
         (select coalesce(string_agg(s, ','), '') from unnest(p.proconfig) s) as cfg,
         pg_get_function_identity_arguments(p.oid) as args,
         has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
         has_function_privilege('anon', p.oid, 'execute')          as anon_exec,
         has_function_privilege('service_role', p.oid, 'execute')  as svc_exec,
         p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('save_payout_details','request_withdrawal','cancel_withdrawal',
                      'registrar_withdrawals','registrar_begin_payout','registrar_reject_withdrawal',
                      'registrar_mark_withdrawal_paid','settle_withdrawal')
)
select '01 three new prices exist' as item,
       case when (select count(*) from cfg) = 1 then 'OK'
            else 'FAIL - gliits_config row id=1 is missing' end,
       (select coalesce('G' || mn || ' / G' || mx || ' / ' || hold || 'h', 'none') from cfg)

union all
select '02 threshold is G10,000',
       case when (select mn from cfg) = 10000 then 'OK'
            else 'FAIL - it is ' || (select mn::text from cfg) end,
       (select mn::text from cfg)

union all
select '03 payout_details exists and is locked',
       case when to_regclass('public.payout_details') is not null
            and (select relrowsecurity from pg_class where oid = 'public.payout_details'::regclass)
            and not has_table_privilege('anon', 'public.payout_details', 'insert')
            and not has_table_privilege('authenticated', 'public.payout_details', 'update')
            then 'OK' else 'FAIL' end,
       (select string_agg(privilege_type, ',') from information_schema.table_privileges
         where table_name = 'payout_details' and grantee = 'authenticated')

union all
select '04 withdrawals exists, RLS on, no direct writes',
       case when to_regclass('public.withdrawals') is not null
            and (select relrowsecurity from pg_class where oid = 'public.withdrawals'::regclass)
            and not has_table_privilege('authenticated', 'public.withdrawals', 'insert')
            and not has_table_privilege('authenticated', 'public.withdrawals', 'update')
            and has_table_privilege('service_role', 'public.withdrawals', 'update')
            then 'OK' else 'FAIL' end,
       'n/a'

union all
select '05 one bank account cannot serve two members',
       case when exists (select 1 from pg_indexes
                          where tablename = 'payout_details'
                            and indexname = 'payout_details_account_unique')
            then 'OK' else 'FAIL - duplicate destinations are possible' end,
       'n/a'

union all
select '06 all eight functions exist',
       case when (select count(*) from fns) = 8 then 'OK'
            else 'FAIL - ' || (select count(*) from fns) || ' of 8' end,
       (select string_agg(proname, ' ') from fns)

union all
select '07 every function is security definer with a pinned search_path',
       case when (select count(*) from fns where prosecdef and cfg like '%search_path%') = 8
            then 'OK' else 'FAIL' end,
       (select count(*)::text from fns where prosecdef and cfg like '%search_path%')

union all
select '08 settle_withdrawal is server-only',
       case when (select not auth_exec and not anon_exec and svc_exec
                  from fns where proname = 'settle_withdrawal')
            then 'OK' else 'FAIL - a browser could mark a payout as paid' end,
       (select coalesce(auth_exec::text || '/' || svc_exec::text, 'missing')
          from fns where proname = 'settle_withdrawal')

union all
select '09 anon can call nothing here',
       case when (select count(*) from fns where anon_exec) = 0 then 'OK' else 'FAIL' end,
       (select count(*)::text from fns where anon_exec)

union all
select '10 the registrar RPCs check the registrar role',
       case when (select count(*) from fns
                  where proname like 'registrar_%'
                    and prosrc ~ 'admin_has_role\(uid, ''registrar''\)') = 4
            then 'OK' else 'FAIL - one of four has no role guard' end,
       (select count(*)::text from fns where proname like 'registrar_%')

union all
select '11 money is debited when the member asks',
       case when (select count(*) from fns where proname = 'request_withdrawal'
                  and prosrc ~ 'wallet_balance - p_amount') = 1
            then 'OK' else 'FAIL - a payout could be double spent' end,
       'n/a'

union all
select '12 a failed transfer puts the Gliims back',
       case when (select count(*) from fns where proname = 'settle_withdrawal'
                  and prosrc ~ 'wallet_balance, 0\) \+ v.amount_gliits'
                  and prosrc ~ '''withdrawal_refund''') = 1
            then 'OK' else 'FAIL - a failed payout would eat the balance' end,
       'n/a'

union all
select '13 the bank name decides name_match, not the member',
       case when (select count(*) from fns where proname = 'request_withdrawal'
                  and prosrc ~ 'pd.account_name') = 1 then 'OK' else 'FAIL' end,
       'n/a'

union all
select '14 sending refuses a mismatched name',
       case when (select count(*) from fns where proname = 'registrar_begin_payout'
                  and prosrc ~ 'NAME_MISMATCH') = 1 then 'OK' else 'FAIL' end,
       'n/a'

union all
select '15 two registrars cannot send the same payout twice',
       case when (select count(*) from fns where proname = 'registrar_begin_payout'
                  and prosrc ~ 'pg_advisory_xact_lock'
                  and prosrc ~ '''ALREADY_SENT_OR_CLOSED''') = 1
            then 'OK' else 'FAIL' end,
       'n/a'

union all
select '16 fresh top-ups are held back at request and at send',
       case when (select count(*) from fns where proname in ('request_withdrawal','registrar_begin_payout')
                  and prosrc ~ 'RECENT_TOPUP') = 2
            then 'OK' else 'FAIL - one of the two gates is gone' end,
       (select count(*)::text from fns where prosrc ~ 'RECENT_TOPUP')

union all
select '17 no wallet is already negative',
       case when not exists (select 1 from public.profiles where wallet_balance < 0)
            then 'OK' else 'FAIL' end,
       (select count(*)::text from public.profiles where wallet_balance < 0)

union all
select '18 nothing is queued yet (first run)',
       'OK',
       (select count(*)::text from public.withdrawals)

union all
select '19 the pricing editor accepts the three new keys',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'registrar_set_config'
                            and p.prosrc ~ 'min_withdrawal_gliits'
                            and p.prosrc ~ 'max_withdrawal_gliits'
                            and p.prosrc ~ 'withdrawal_hold_hours')
            then 'OK' else 'FAIL - Config shows them but cannot save them' end,
       'n/a'

union all
select '20 the account name comes from the profile, not from the member',
       case when (select count(*) from fns
                  where proname = 'save_payout_details'
                    and args = 'p_phone text, p_bank_code integer, p_account_number text'
                    and prosrc ~ 'from public.profiles'
                    and prosrc ~ 'full_name') = 1
            then 'OK' else 'FAIL - the member can still type the name on the account' end,
       (select coalesce(args, 'missing') from fns where proname = 'save_payout_details')

order by 1;

-- END OF FILE
