-- ============================================================
-- CREDIT A PAYSTACK TOP-UP EXACTLY ONCE
-- ============================================================
-- ₦100 paid was landing as G200. Two things reach for the wallet after one
-- payment: /api/paystack/verify, which the browser calls when Paystack sends
-- the user back, and the charge.success webhook. Paystack fires both, seconds
-- apart, on every successful charge. Both were calling one helper in
-- server/src/index.js, and that helper did the arithmetic in JavaScript —
-- read profiles.wallet_balance, add, write the total back. Nothing on either
-- path asked whether the other had already been there, so the second arrival
-- added the same money a second time.
--
-- public.credit_wallet_topup already gets this right, and is already locked to
-- the service role: it takes a transaction-scoped advisory lock on the
-- reference, refuses a reference that already produced a successful top-up row,
-- and does the addition in SQL. The server never called it. The helper was
-- written beside it, and this function only exists in the live database — no
-- file in sql/ defined it — so it is recorded here as the repo's copy.
--
-- One thing is added: the gliits_topups fulfilment row. credit_wallet_topup
-- only wrote transactions, while registrar_overview and registrar_member read
-- their top-up totals from gliits_topups, and the server's own insert into that
-- table had no grant and was dying inside a console.warn. The table has been
-- empty since it was created.
--
-- Also closed here — public.gliits_topup_wallet. SECURITY DEFINER, granted to
-- authenticated, credits auth.uid()'s wallet by whatever amount it is handed,
-- and its only check is the minimum. No payment, no signature, no reference.
-- Any signed-in member could call
--   supabase.rpc('gliits_topup_wallet', { p_amount_gliits: 5000000 })
-- and then withdraw it to their own bank account now that payouts exist. It is
-- the pre-Paystack funding path left switched on; nothing in public/, admin/,
-- server/ or any other sql/ file calls it. It is dropped for real, and the
-- definition is removed from sql/gliits_billing.sql so a fresh install cannot
-- bring it back.
--
-- It found a second, wider hole than the one it was written for.
-- public.increment_wallet(user_id uuid, amount integer) is SECURITY DEFINER,
-- owned by postgres, and holds an explicit EXECUTE grant to authenticated. It
-- adds any amount to any wallet, with no minimum, no reference, no payment and
-- no ledger row at all:
--   supabase.rpc('increment_wallet', { user_id: me, amount: 999999999 })
-- It exists only in the live database too — no file in sql/ defines it — and
-- neither the repo nor any other database function references it. It is dropped
-- here beside gliits_topup_wallet for the same reason.
--
-- Idempotent: re-run it as many times as you like.

-- 1. One fulfilment row per Paystack reference, ever. The advisory lock in the
--    function is the guard; this index is the net under it, and it also stops a
--    hand-run insert from inventing a second credit for a paid reference.
create unique index if not exists gliits_topups_reference_key
  on public.gliits_topups (payment_reference)
  where payment_reference is not null;

-- 2. The only function that may move money in from a gateway.
create or replace function public.credit_wallet_topup(
  p_user uuid,
  p_amount integer,
  p_reference text,
  p_provider text default 'paystack'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount < 100 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_reference is null or length(trim(p_reference)) = 0 then
    raise exception 'INVALID_REFERENCE';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'INVALID_USER';
  end if;

  -- Both callers queue on the reference instead of racing on the balance.
  -- Held to the end of the transaction, so the loser of the race sees the
  -- winner's committed row the moment it is let through.
  perform pg_advisory_xact_lock(hashtext('topup:' || p_reference)::bigint);

  if exists (
    select 1 from public.transactions
    where reference = p_reference
      and type = 'topup'
      and status = 'success'
  ) then
    return jsonb_build_object('credited', false, 'reason', 'duplicate');
  end if;

  insert into public.transactions (user_id, amount, points, type, status, reference, description)
  values (p_user, p_amount, 0, 'topup', 'success', p_reference,
          'Wallet Top-up via ' || coalesce(p_provider, 'paystack'));

  insert into public.gliits_topups (user_id, amount_gliits, payment_reference, payment_status)
  values (p_user, p_amount, p_reference, 'success');

  -- Incremented by the database, never by a number the app read earlier. This
  -- is the exact line the JavaScript version got wrong.
  update public.profiles
  set wallet_balance = coalesce(wallet_balance, 0) + p_amount
  where id = p_user
  returning wallet_balance into v_balance;

  return jsonb_build_object('credited', true, 'amount', p_amount, 'balance', v_balance);
end;
$$;

-- 3. Server-only. It takes any user id and any amount, so the publishable key
--    must never be able to reach it.
revoke all on function public.credit_wallet_topup(uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.credit_wallet_topup(uuid, integer, text, text)
  to service_role;

-- 4. The function above writes the fulfilment row as the service role, and that
--    role has never had a grant on this table — which is why gliits_topups has
--    stayed empty through every real payment. remove_manual_topups.sql grants
--    this too; repeating it here keeps the script self-sufficient.
grant select, insert on public.gliits_topups to service_role;

-- 5. Shut the free-money paths, then remove them.
revoke all on function public.gliits_topup_wallet(integer, text)
  from public, anon, authenticated;
drop function if exists public.gliits_topup_wallet(integer, text);

revoke all on function public.increment_wallet(uuid, integer)
  from public, anon, authenticated;
drop function if exists public.increment_wallet(uuid, integer);

-- ============================================================
-- SELF CHECK GRID — every row must say OK apart from any WARN,
-- which is something to decide about, not a broken install.
-- ============================================================

with fn as (
  select max(p.oid) as oid,
         bool_and(p.prosecdef) as definer,
         max(pg_get_function_arguments(p.oid)) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'credit_wallet_topup'
    and array_length(p.proargtypes, 1) = 4
),
dead as (
  select count(*) as still_there
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('gliits_topup_wallet', 'increment_wallet')
),
idx as (
  select count(*) as unique_partial
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'gliits_topups'
    and i.indisunique and i.indpred is not null
),
trg as (
  select count(*) as fires_on_insert
  from information_schema.triggers
  where event_object_schema = 'public' and event_object_table = 'transactions'
    and action_statement ilike '%update_wallet_on_success%'
    and event_manipulation = 'INSERT'
),
pol as (
  select count(*) filter (where polname = 'gliits_topups_select_own')  as own_read,
         count(*) filter (where polname = 'gliits_topups_select_admin') as registrar_read
  from pg_policy
  where polrelid = 'public.gliits_topups'::regclass
)
select '1 credit_wallet_topup exists, definer, 4 args' as check,
       case when fn.oid is not null and fn.prosecdef then 'OK' else 'FAIL - ' || coalesce(fn.args, 'missing') end as status,
       coalesce(fn.args, '-') as detail
from fn
union all
select '2 only the server can call it',
       case when has_function_privilege('service_role', fn.oid, 'execute')
            and has_function_privilege('anon', fn.oid, 'execute') = false
            and has_function_privilege('authenticated', fn.oid, 'execute') = false
            then 'OK' else 'FAIL - a member role can mint its own credit' end,
       'anon=' || has_function_privilege('anon', fn.oid, 'execute')
         || ' authenticated=' || has_function_privilege('authenticated', fn.oid, 'execute')
from fn
union all
select '3 the no-payment wallet faucets are gone',
       case when dead.still_there = 0 then 'OK' else 'FAIL - still callable by members' end,
       dead.still_there::text
from dead
union all
select '4 the reference is claimed uniquely',
       case when idx.unique_partial = 1 then 'OK' else 'FAIL - ' || idx.unique_partial || ' matching indexes' end,
       idx.unique_partial::text
from idx
union all
select '5 a ledger insert cannot double-credit via the trigger',
       case when trg.fires_on_insert = 0 then 'OK' else 'FAIL - on_tx_success now fires on INSERT' end,
       trg.fires_on_insert::text
from trg
union all
select '6 the server can write the fulfilment log',
       case when has_table_privilege('service_role', 'public.gliits_topups', 'insert')
              and has_table_privilege('service_role', 'public.gliits_topups', 'select')
            then 'OK' else 'FAIL - registrar top-up totals stay empty' end,
       (select count(*)::text || ' rows' from public.gliits_topups)
union all
select '7 members still read their own top-up history',
       case when pol.own_read = 1 then 'OK' else 'FAIL - Billing history will break' end,
       pol.own_read::text
from pol
union all
select '8 registrar still reads top-up totals',
       case when pol.registrar_read = 1 then 'OK' else 'FAIL - admin finance will break' end,
       pol.registrar_read::text
from pol
union all
select '9 RLS is still on both money tables',
       case when (select relrowsecurity from pg_class where oid = 'public.gliits_topups'::regclass)
              and (select relrowsecurity from pg_class where oid = 'public.transactions'::regclass)
            then 'OK' else 'FAIL - RLS was switched off' end,
       ''
union all
select '10 the payout RPCs were not touched',
       case when (select count(*) from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public'
                    and p.proname in ('save_payout_details', 'request_withdrawal',
                                      'cancel_withdrawal', 'registrar_begin_payout',
                                      'registrar_mark_withdrawal_paid',
                                      'registrar_reject_withdrawal',
                                      'registrar_withdrawals', 'settle_withdrawal')) = 8
            then 'OK' else 'FAIL - a payout RPC is missing' end,
       (select count(*) from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('save_payout_details', 'request_withdrawal',
                             'cancel_withdrawal', 'registrar_begin_payout',
                             'registrar_mark_withdrawal_paid',
                             'registrar_reject_withdrawal',
                             'registrar_withdrawals', 'settle_withdrawal'))::text || ' of 8'
union all
select '11 nothing else member-callable credits a wallet blind',
       case when count(*) = 0 then 'OK' else 'WARN - ' || string_agg(proname, ', ' order by proname) end,
       count(*)::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('authenticated', p.oid, 'execute')
    -- Only a real blind credit: balance assigned from itself plus something.
    and p.prosrc ~* 'wallet_balance\s*=\s*(coalesce\(\s*wallet_balance\s*,\s*0\s*\)|wallet_balance)\s*\+'
    and p.proname not in ('transfer_to_user', 'purchase_library_item', 'send_support',
                          'support_live_session', 'gliits_adjust_balance',
                          'cancel_withdrawal', 'registrar_reject_withdrawal',
                          'request_withdrawal', 'settle_withdrawal',
                          'update_wallet_on_success',
                          -- Paired: the reader is charged v_charge in the same call.
                          'gliits_heartbeat')
order by 1;
