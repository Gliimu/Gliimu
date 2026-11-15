-- ============================================================
-- REMOVE THE MANUAL (OPay / Moniepoint) TOP-UP PATH
-- ============================================================
-- Funding now goes through Paystack only: /api/gliits/topup-init opens the
-- checkout, the webhook (or /api/paystack/verify) credits the wallet, and the
-- registrar never confirms a transfer by hand again. Three RPCs were written
-- for that old one-click verification. They exist only in the live database —
-- no SQL script in this repo defines them, and no client or server file calls
-- them — so this script is the removal, not a re-definition.
--
-- Verified before writing this script:
--   * registrar_pending_topups / registrar_verify_topup / registrar_reject_topup
--     have zero references in sql/, server/, public/ and admin/.
--   * public.gliits_topups held 0 rows, so no member is left with a top-up
--     that can never be verified.
--   * The table itself STAYS: the server writes each fulfilled Paystack
--     top-up into it, and registrar_overview + registrar_member read their
--     top-up totals from it.
--
-- Two things ride along because the removal exposes them:
--   * Members used to be able to INSERT their own top-up row and UPDATE it
--     afterwards. With manual verification gone nothing needs that, and it is
--     a hole in the revenue numbers the registrar reads, so member write
--     access and its two policies are closed here.
--   * The server writes the fulfilled Paystack top-up with the service role
--     (public.credit_wallet_topup, called from server/src/index.js), but
--     service_role had no grant
--     on this table at all, so that insert has been failing silently into a
--     console.warn. It is granted here.
--
-- Idempotent: re-run it as many times as you like.

-- 1. The three manual-verification RPCs
drop function if exists public.registrar_pending_topups(integer);
drop function if exists public.registrar_verify_topup(uuid, integer, text);
drop function if exists public.registrar_reject_topup(uuid, text);

-- 2. Nobody writes their own top-up record any more
drop policy if exists gliits_topups_insert_own on public.gliits_topups;
drop policy if exists gliits_topups_update_own on public.gliits_topups;

revoke insert, update on public.gliits_topups from authenticated;
revoke all on public.gliits_topups from anon;

-- 3. Paystack fulfilment is allowed to write
grant select, insert on public.gliits_topups to service_role;

-- ============================================================
-- SELF CHECK GRID — read every row, all must say OK
-- ============================================================

with t as (
  select count(*) filter (where proname in
    ('registrar_pending_topups', 'registrar_verify_topup', 'registrar_reject_topup')) as dead_fns
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
pol as (
  select count(*) filter (where polname = 'gliits_topups_select_own')  as own_read,
         count(*) filter (where polname = 'gliits_topups_select_admin') as registrar_read,
         count(*) filter (where polname in ('gliits_topups_insert_own', 'gliits_topups_update_own')) as member_write
  from pg_policy
  where polrelid = 'public.gliits_topups'::regclass
)
select '1 the three manual-verification RPCs are gone' as check,
       case when t.dead_fns = 0 then 'OK' else 'FAIL - ' || t.dead_fns || ' still exist' end as status,
       t.dead_fns::text as detail
from t
union all
select '2 no live function still calls them',
       case when count(*) = 0 then 'OK' else 'FAIL - ' || string_agg(proname, ', ') end,
       count(*)::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosrc ~ 'registrar_(pending_topups|verify_topup|reject_topup)'
union all
select '3 the table survived (registrar totals read it)',
       case when to_regclass('public.gliits_topups') is not null then 'OK' else 'FAIL - gone' end,
       (select count(*)::text from public.gliits_topups) || ' rows'
union all
select '4 members can no longer write their own top-ups',
       case when has_table_privilege('authenticated', 'public.gliits_topups', 'insert') = false
              and has_table_privilege('authenticated', 'public.gliits_topups', 'update') = false
            then 'OK' else 'FAIL - authenticated can still insert or update' end,
       'insert=' || has_table_privilege('authenticated', 'public.gliits_topups', 'insert')
         || ' update=' || has_table_privilege('authenticated', 'public.gliits_topups', 'update')
union all
select '5 the member write policies are dropped',
       case when pol.member_write = 0 then 'OK' else 'FAIL - ' || pol.member_write || ' left' end,
       pol.member_write::text
from pol
union all
select '6 members still read their own top-up history',
       case when pol.own_read = 1 then 'OK' else 'FAIL - Billing history will break' end,
       pol.own_read::text
from pol
union all
select '7 registrar and ops still read top-up totals',
       case when pol.registrar_read = 1 then 'OK' else 'FAIL - admin finance will break' end,
       pol.registrar_read::text
from pol
union all
select '8 the server can finally log a fulfilled top-up',
       case when has_table_privilege('service_role', 'public.gliits_topups', 'insert')
              and has_table_privilege('service_role', 'public.gliits_topups', 'select')
            then 'OK' else 'FAIL - Paystack fulfilment insert still fails' end,
       'insert=' || has_table_privilege('service_role', 'public.gliits_topups', 'insert')
union all
select '9 RLS is still on the table',
       case when (select relrowsecurity from pg_class where oid = 'public.gliits_topups'::regclass)
            then 'OK' else 'FAIL - RLS was switched off' end,
       ''
union all
select '10 withdrawal RPCs were not touched',
       case when (select count(*) from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public'
                    and p.proname in ('save_payout_details', 'request_withdrawal',
                                      'cancel_withdrawal', 'registrar_begin_payout',
                                      'settle_withdrawal')) = 5
            then 'OK' else 'FAIL - a payout RPC is missing' end,
       (select count(*) from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('save_payout_details', 'request_withdrawal',
                             'cancel_withdrawal', 'registrar_begin_payout',
                             'settle_withdrawal'))::text || ' of 5'

order by 1;
