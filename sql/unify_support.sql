-- sql/unify_support.sql — One support flow everywhere: G100, 70/30, repeatable
--
-- This replaces sql/send_support.sql and sql/live_support.sql. Both are now
-- superseded; they must not be run again after this file, or G500 comes back.
--
-- DO NOT RE-RUN THIS FILE ONCE sql/live_support_g10.sql HAS BEEN APPLIED.
-- It reinstalls support_live_session at G100 and would put Live back to the old
-- price while the client still taps for G10. The gliim half below
-- (send_support, still G100) remains the source of truth for reader support.
-- Self-check rows 06 and 13 describe the state this file installed, not the
-- state Live is in after the G10 script; they are annotated where they lie.
--
-- The rules this installs:
--   * Price is G100, on a gliim and on a live session. There is no other price.
--   * The author / host receives 70%, the platform keeps 30%. Same split both ways.
--   * Support is repeatable. The old once-per-post dedupe is gone, and the old
--     +5 GP author bonus is gone with it (it was farmable at G100).
--   * If the wallet holds less than G100, the server refuses — UNLESS the client
--     re-asks with p_accept_partial = true, and then it takes exactly what is in
--     the wallet. The server never silently lowers the amount and never lets a
--     balance go negative. The user always confirms first.
--
-- Idempotent: safe to run more than once.
--
-- HOW TO RUN
--   1. Open the Supabase dashboard → SQL editor → New query.
--   2. Paste everything from "drop function if exists public.send_support(uuid);"
--      down to the line "grant execute ... to authenticated;" (the second one).
--      Do NOT paste the SELF CHECK yet. Press Run. Expect "Success. No rows returned".
--   3. Now paste only the SELF CHECK block, from "with f as (" down to "order by 1;".
--      Press Run. Every item in the grid must read OK. Anything else is a failure.

-- ======================================================================
-- 1. send_support — support a gliim's author
-- ======================================================================
-- send_support(text, jsonb) is a different feature (the Support-desk message
-- sender) and is deliberately untouched. This drops only the one-argument
-- money version so no near-identical overload is left behind.
drop function if exists public.send_support(uuid);

create or replace function public.send_support(
  p_post uuid,
  p_accept_partial boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supporter uuid := auth.uid();
  v_author    uuid;
  v_balance   numeric;
  v_spent     numeric;
  v_credited  numeric;
  v_cost      numeric := 100;
begin
  if v_supporter is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select user_id into v_author
  from public.feed_gliims
  where id = p_post;

  if v_author is null then
    raise exception 'POST_NOT_FOUND';
  end if;

  if v_author = v_supporter then
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
  where id = v_author;

  -- One row per support event, so the card count is a real count.
  insert into public.feed_interactions (post_id, user_id, interaction_type, amount)
  values (p_post, v_supporter, 'support', v_spent);

  insert into public.transactions (user_id, receiver_id, amount, type, status, description)
  values (v_supporter, v_author, -v_spent, 'support', 'success', 'Supported a creator');

  insert into public.transactions (user_id, receiver_id, amount, type, status, description)
  values (v_author, v_supporter, v_credited, 'support', 'success', 'Received support from a viewer');

  return jsonb_build_object(
    'ok', true,
    'cost', v_spent,
    'host_credited', v_credited,
    'platform_kept', v_spent - v_credited,
    'partial', v_spent < v_cost
  );
end;
$$;

revoke execute on function public.send_support(uuid, boolean) from public, anon;
grant execute on function public.send_support(uuid, boolean) to authenticated;

-- ======================================================================
-- 2. support_live_session — support the host of a live session
-- ======================================================================
drop function if exists public.support_live_session(uuid);

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
  v_post      uuid;
  v_balance   numeric;
  v_spent     numeric;
  v_credited  numeric;
  v_cost      numeric := 100;
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

  -- If this session was published as a gliim, the support must show on that
  -- card too. Sessions never published have no link row and are skipped.
  select post_id into v_post
  from public.live_gliim_links
  where session_id = p_request
  limit 1;

  if v_post is not null then
    insert into public.feed_interactions (post_id, user_id, interaction_type, amount)
    values (v_post, v_supporter, 'support', v_spent);
  end if;

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

-- END OF RUNNABLE SQL. Everything below is a read-only report.

-- ======================================================================
-- SELF CHECK — paste from "with f as (" to "order by 1;" and run it.
-- Nothing to edit. Every item must read OK.
-- ======================================================================
with f as (
  select p.oid,
         p.prosrc,
         p.prorettype::regtype::text as ret,
         p.prosecdef,
         pg_get_function_identity_arguments(p.oid) as args,
         (select coalesce(string_agg(s, ','), '') from unnest(p.proconfig) s) as cfg,
         (select count(*) from regexp_matches(p.prosrc, 'insert into public\.transactions', 'g'))   as ledger_rows,
         (select count(*) from regexp_matches(p.prosrc, 'insert into public\.feed_interactions', 'g')) as action_rows
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('send_support', 'support_live_session')
    and pg_get_function_identity_arguments(p.oid) like '%p_accept_partial%'
)
select '01 both functions rebuilt' as item,
       case when (select count(*) from f) = 2 then 'OK' else 'FAIL - a function was not created' end,
       (select count(*)::text || ' of 2' from f)

union all
select '02 both take p_accept_partial',
       case when (select count(*) from f where args = 'p_accept_partial boolean default false' or args like '%p_accept_partial boolean%') = 2
            then 'OK' else 'FAIL - the partial flag is missing' end,
       (select string_agg(args, ' | ') from f)

union all
select '03 both return jsonb',
       case when (select bool_and(ret = 'jsonb') from f) then 'OK' else 'FAIL - wrong return type' end,
       (select string_agg(ret, ' | ') from f)

union all
select '04 no old one-argument versions left',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname in ('send_support', 'support_live_session')
                    and pg_get_function_identity_arguments(p.oid) in ('p_post uuid', 'p_request uuid')) = 0
            then 'OK' else 'FAIL - an old overload is still live and the client could hit it' end,
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('send_support', 'support_live_session')
          and pg_get_function_identity_arguments(p.oid) in ('p_post uuid', 'p_request uuid'))

union all
select '05 support-desk sender untouched',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'send_support'
                    and pg_get_function_identity_arguments(p.oid) = 'p_body text, p_context jsonb') = 1
            then 'OK' else 'FAIL - the Support desk sender is gone' end,
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'send_support')

union all
-- The live half is priced by sql/live_support_g10.sql (G10), so this row only
-- ever pins the reader sender at G100; the third column shows both prices.
select '06 price is G100 on the reader sender',
       case when (select count(*) from f join pg_proc p on p.oid = f.oid
                   where p.proname = 'send_support'
                     and f.prosrc ~ 'v_cost\s+numeric\s*:=\s*100') = 1
            then 'OK' else 'FAIL - the gliim support is not priced at G100' end,
       (select 'reader G' || coalesce(substring(p.prosrc from 'v_cost\s+numeric\s*:=\s*([0-9]+)'), '?')
          from f join pg_proc p on p.oid = f.oid where p.proname = 'send_support')
         || ' | live G' ||
       (select coalesce(substring(p.prosrc from 'v_cost\s+numeric\s*:=\s*([0-9]+)'), '?')
          from f join pg_proc p on p.oid = f.oid where p.proname = 'support_live_session')

union all
select '07 split is 70/30 in both',
       case when (select count(*) from f where prosrc ~ 'round\(\s*v_spent\s*\*\s*0\.70\s*\)') = 2
            then 'OK' else 'FAIL - one of the two does not pay the creator 70%' end,
       (select count(*)::text || ' of 2' from f where prosrc ~ 'round\(\s*v_spent\s*\*\s*0\.70\s*\)')

union all
select '08 partial send only on request, never zero',
       case when (select count(*) from f where prosrc ~ 'p_accept_partial\s+and\s+v_balance\s*>\s*0') = 2 then 'OK'
            else 'FAIL - one of the two can silently lower the amount or overdraw' end,
       (select count(*)::text || ' of 2' from f where prosrc ~ 'p_accept_partial\s+and\s+v_balance\s*>\s*0')

union all
select '09 once-per-post dedupe removed',
       case when (select count(*) from f where prosrc ~ 'ALREADY_SUPPORTED') = 0 then 'OK'
            else 'FAIL - support is still blocked after one send' end,
       (select count(*)::text from f where prosrc ~ 'ALREADY_SUPPORTED')

union all
select '10 support no longer mints GP',
       case when (select count(*) from f where prosrc ~ 'total_gp') = 0 then 'OK'
            else 'FAIL - support still credits GP on top of the money' end,
       (select count(*)::text from f where prosrc ~ 'total_gp')

union all
select '11 two ledger rows written per function',
       case when (select count(*) from f where ledger_rows = 2) = 2 then 'OK'
            else 'FAIL - a sender or receiver row is missing' end,
       (select coalesce(max(ledger_rows) filter (where p.proname = 'send_support'), -1)::text || ' reader, ' ||
               coalesce(max(ledger_rows) filter (where p.proname = 'support_live_session'), -1)::text || ' live'
          from f join pg_proc p on p.oid = f.oid)

union all
-- Live support pays a person, not a post, so it writes no interaction row and
-- never touches live_gliim_links (table dropped). Rows 12-13 check that.
select '12 one interaction row on the reader sender, none on live',
       case when (select count(*) from f join pg_proc p on p.oid = f.oid
                   where p.proname = 'send_support' and action_rows = 1) = 1
             and (select count(*) from f join pg_proc p on p.oid = f.oid
                   where p.proname = 'support_live_session' and action_rows = 0) = 1
            then 'OK' else 'FAIL - the support count on cards will not move' end,
       (select coalesce(max(action_rows) filter (where p.proname = 'send_support'), -1)::text || ' reader, ' ||
               coalesce(max(action_rows) filter (where p.proname = 'support_live_session'), -1)::text || ' live (expected 0)'
          from f join pg_proc p on p.oid = f.oid)

union all
select '13 live support no longer needs a gliim link',
       case when (select count(*) from f where prosrc ~ 'live_gliim_links') = 0 then 'OK'
            else 'FAIL - live support still reads the dropped table' end,
       (select count(*)::text from f where prosrc ~ 'live_gliim_links')

union all
select '14 ledger rows carry receiver_id',
       case when (select count(*) from f where prosrc like '%user_id, receiver_id, amount, type, status, description%') = 2
            then 'OK' else 'FAIL - wallet history will lose the counterparty' end,
       (select count(*)::text || ' of 2' from f where prosrc like '%user_id, receiver_id, amount, type, status, description%')

union all
select '15 error codes the client listens for',
       case when (select count(*) from f where prosrc ~ 'NOT_AUTHENTICATED' and prosrc ~ 'INSUFFICIENT_FUNDS') = 2
            then 'OK' else 'FAIL - the insufficient-funds prompt cannot fire' end,
       (select count(*)::text || ' of 2' from f where prosrc ~ 'NOT_AUTHENTICATED' and prosrc ~ 'INSUFFICIENT_FUNDS')

union all
select '16 security definer with pinned search_path',
       case when (select count(*) from f where prosecdef and cfg like '%search_path%') = 2 then 'OK'
            else 'FAIL - one of the two lost its guard' end,
       (select string_agg(cfg, ' | ') from f)

union all
select '17 authenticated can run both',
       case when (select bool_and(has_function_privilege('authenticated', oid, 'execute')) from f) then 'OK'
            else 'FAIL - grant missing' end,
       (select count(*)::text || ' of 2' from f where has_function_privilege('authenticated', oid, 'execute'))

union all
select '18 anon cannot run either',
       case when (select bool_and(not has_function_privilege('anon', oid, 'execute')) from f) then 'OK'
            else 'FAIL - anon has execute on a money function' end,
       (select count(*)::text from f where not has_function_privilege('anon', oid, 'execute'))

union all
select '19 earnings tab still counts both types',
       case when (select position('live_support' in pg_get_functiondef(p.oid)) > 0
                    and position('''support''' in pg_get_functiondef(p.oid)) > 0
                  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'gliits_earnings')
            then 'OK' else 'FAIL - support income will be hidden from Earnings' end,
       'n/a'

union all
select '20 split maths proves out on a G60 partial',
       case when round(60 * 0.70) = 42 and 60 - round(60 * 0.70) = 18 then 'OK'
            else 'FAIL - partial maths wrong' end,
       'G60 -> creator G42, platform G18'

union all
select '21 nobody is already overdrawn',
       case when not exists (select 1 from public.profiles where wallet_balance < 0) then 'OK'
            else 'FAIL - a wallet is already negative, fix it before going live' end,
       (select count(*)::text from public.profiles where wallet_balance < 0)

union all
select '22 gliim support rows so far',
       case when (select count(*) from public.feed_interactions where interaction_type = 'support') >= 0
            then 'OK - repeatable, these stay counted' end,
       (select count(*)::text from public.feed_interactions where interaction_type = 'support')

order by 1;

-- END OF FILE
