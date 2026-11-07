-- sql/live_support_g10.sql — Live support costs G10, the reader stays G100
--
-- Two prices, deliberately:
--   * Inside a live session (this file, support_live_session): G10 per tap.
--   * On a gliim in the reader (send_support, unchanged): G100 with the
--     partial-send confirmation.
--
-- Why this file exists: sql/unify_support.sql priced both flows at G100. The
-- reader stays there; Live moves to G10. Running this file replaces only
-- support_live_session, and unify_support.sql must not be run again afterwards
-- or Live goes back to G100 while the studio still charges one tap.
--
-- The split is unchanged: the host receives 70%, the platform keeps 30%.
-- At G10 that is G7 to the host and G3 to Gliimu, with no rounding loss.
--
-- The client no longer asks for confirmation before calling this. The
-- p_accept_partial parameter stays so already-cached clients (which do ask)
-- keep working; the new studio never passes it.
--
-- Idempotent: safe to run more than once.
--
-- HOW TO RUN
--   1. Supabase dashboard → SQL editor → New query.
--   2. Paste from "create or replace function public.support_live_session("
--      down to "grant execute ... to authenticated;". Press Run.
--      Expect "Success. No rows returned".
--   3. Paste only the SELF CHECK block, from "with live as (" to "order by 1;".
--      Press Run. Every item must read OK.

-- ======================================================================
-- 1. support_live_session — one tap, G10, no confirmation
-- ======================================================================
create or replace function public.support_live_session(
  p_request uuid,
  p_accept_partial boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supporter uuid := auth.uid();
  v_host      uuid;
  v_status    text;
  v_balance   numeric;
  v_spent     numeric;
  v_credited  numeric;
  v_cost      numeric := 10;
begin
  if v_supporter is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select user_id, status into v_host, v_status
  from public.live_requests
  where id = p_request;

  if v_host is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_status <> 'active' then
    raise exception 'SESSION_NOT_ACTIVE';
  end if;

  if v_host = v_supporter then
    raise exception 'CANNOT_SUPPORT_SELF';
  end if;

  select coalesce(wallet_balance, 0) into v_balance
  from public.profiles
  where id = v_supporter;

  if v_balance >= v_cost then
    v_spent := v_cost;
  elsif p_accept_partial and v_balance > 0 then
    v_spent := v_balance;
  else
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  v_credited := round(v_spent * 0.70);

  update public.profiles
  set wallet_balance = coalesce(wallet_balance, 0) - v_spent
  where id = v_supporter;

  update public.profiles
  set wallet_balance = coalesce(wallet_balance, 0) + v_credited
  where id = v_host;

  insert into public.transactions (user_id, receiver_id, amount, type, status, description)
  values (v_supporter, v_host, -v_spent, 'live_support', 'success', 'Supported a live session');

  insert into public.transactions (user_id, receiver_id, amount, type, status, description)
  values (v_host, v_supporter, v_credited, 'live_support', 'success', 'Received support in a live session');

  return jsonb_build_object(
    'ok', true,
    'cost', v_spent,
    'host_credited', v_credited,
    'platform_kept', v_spent - v_credited,
    'partial', v_spent < v_cost
  );
end;
$$;

revoke execute on function public.support_live_session(uuid, boolean) from public, anon;
grant execute on function public.support_live_session(uuid, boolean) to authenticated;

-- ======================================================================
-- SELF CHECK — paste from "with live as (" to "order by 1;" and run it.
-- Nothing to edit. Every item must read OK.
-- ======================================================================
with live as (
  select p.oid, p.prosrc, p.prosecdef,
         (select coalesce(string_agg(s, ','), '') from unnest(p.proconfig) s) as cfg,
         pg_get_function_identity_arguments(p.oid) as args,
         (select count(*) from regexp_matches(p.prosrc, 'insert into public\.transactions', 'g')) as ledger_rows
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'support_live_session'
),
reader as (
  select p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'send_support'
    and pg_get_function_identity_arguments(p.oid) like '%p_post%'
)
select '01 live function rebuilt' as item,
       case when (select count(*) from live) = 1 then 'OK' else 'FAIL - it is missing' end,
       (select count(*)::text from live)

union all
select '02 live price is G10',
       case when (select count(*) from live where prosrc ~ 'v_cost\s+numeric\s*:=\s*10;') = 1
            then 'OK' else 'FAIL - not priced at G10' end,
       (select count(*)::text from live where prosrc ~ 'v_cost\s+numeric\s*:=\s*10;')

union all
select '03 reader price still G100',
       case when (select count(*) from reader where prosrc ~ 'v_cost\s+numeric\s*:=\s*100;') = 1
            then 'OK' else 'FAIL - the gliim support price moved, it should not have' end,
       (select count(*)::text from reader where prosrc ~ 'v_cost\s+numeric\s*:=\s*100;')

union all
select '04 host still gets 70%',
       case when (select count(*) from live where prosrc ~ 'round\(\s*v_spent\s*\*\s*0\.70\s*\)') = 1
            then 'OK' else 'FAIL - the split changed' end,
       (select count(*)::text from live where prosrc ~ 'round\(\s*v_spent\s*\*\s*0\.70\s*\)')

union all
select '05 stale live_gliim_links reference gone',
       case when (select count(*) from live where prosrc ~ 'live_gliim_links') = 0
            then 'OK' else 'FAIL - it would error, that table is dropped' end,
       (select count(*)::text from live where prosrc ~ 'live_gliim_links')

union all
select '06 ledger rows still written',
       case when (select count(*) from live where ledger_rows = 2) = 1
            then 'OK' else 'FAIL - wallet history will not show the debit or the credit' end,
       (select coalesce(max(ledger_rows), -1)::text from live)

union all
select '07 error codes the client listens for',
       case when (select count(*) from live
                  where prosrc ~ 'NOT_AUTHENTICATED'
                    and prosrc ~ 'INSUFFICIENT_FUNDS'
                    and prosrc ~ 'SESSION_NOT_ACTIVE'
                    and prosrc ~ 'CANNOT_SUPPORT_SELF') = 1
            then 'OK' else 'FAIL - the studio cannot explain a refused tap' end,
       'n/a'

union all
select '08 security definer with pinned search_path',
       case when (select count(*) from live where prosecdef and cfg like '%search_path%') = 1
            then 'OK' else 'FAIL - the guard is gone' end,
       (select coalesce(max(cfg), 'none') from live)

union all
select '09 authenticated can run it, anon cannot',
       case when (select bool_and(has_function_privilege('authenticated', oid, 'execute')) from live)
            and (select bool_and(not has_function_privilege('anon', oid, 'execute')) from live)
            then 'OK' else 'FAIL - grants are wrong' end,
       'n/a'

union all
select '10 split maths proves out at G10',
       case when round(10 * 0.70) = 7 and 10 - round(10 * 0.70) = 3 then 'OK'
            else 'FAIL - partial maths wrong' end,
       'G10 -> host G7, platform G3'

union all
select '11 nobody is overdrawn',
       case when not exists (select 1 from public.profiles where wallet_balance < 0) then 'OK'
            else 'FAIL - a wallet is already negative' end,
       (select count(*)::text from public.profiles where wallet_balance < 0)

union all
select '12 live supports so far (informational)',
       'OK - these were charged at G100, new ones cost G10',
       (select count(*)::text from public.transactions where type = 'live_support')

order by 1;

-- END OF FILE
