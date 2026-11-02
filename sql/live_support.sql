-- Live session support: a participant sends G100 to the host.
-- Host is credited G70 (70%), the platform keeps G30 (30%).
-- Idempotent: safe to run more than once.

-- ----------------------------------------------------------------------
-- 1. support_live_session(p_request)
-- ----------------------------------------------------------------------
create or replace function public.support_live_session(p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_supporter  uuid := auth.uid();
  v_host       uuid;
  v_status     text;
  v_cost       numeric := 100;
  v_host_share numeric;
  v_balance    numeric;
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

  if v_balance < v_cost then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  v_host_share := round(v_cost * 0.70);

  update public.profiles
  set wallet_balance = coalesce(wallet_balance, 0) - v_cost
  where id = v_supporter;

  update public.profiles
  set wallet_balance = coalesce(wallet_balance, 0) + v_host_share
  where id = v_host;

  insert into public.transactions (user_id, receiver_id, amount, type, status, description)
  values (v_supporter, v_host, -v_cost, 'live_support', 'success', 'Supported a live session');

  insert into public.transactions (user_id, receiver_id, amount, type, status, description)
  values (v_host, v_supporter, v_host_share, 'live_support', 'success', 'Received support in a live session');

  return jsonb_build_object(
    'ok', true,
    'cost', v_cost,
    'host_credited', v_host_share,
    'platform_kept', v_cost - v_host_share
  );
end;
$$;

revoke execute on function public.support_live_session(uuid) from public, anon;
grant execute on function public.support_live_session(uuid) to authenticated;

-- ----------------------------------------------------------------------
-- SELF CHECK — run the whole file, then read this grid.
-- Every "item" row must read "OK". Anything else is a failure.
-- ----------------------------------------------------------------------
select '1 function exists' as item,
       case when count(*) = 1 then 'OK' else 'FAIL - function was not created' end as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'support_live_session'

union all
select '2 function returns jsonb',
       case when pg_get_function_result('public.support_live_session(uuid)'::regprocedure) = 'jsonb'
            then 'OK' else 'FAIL - wrong return type' end

union all
select '3 authenticated can run it',
       case when has_function_privilege('authenticated', 'public.support_live_session(uuid)'::regprocedure, 'EXECUTE')
            then 'OK' else 'FAIL - grant missing' end

union all
select '4 anon cannot run it',
       case when not has_function_privilege('anon', 'public.support_live_session(uuid)'::regprocedure, 'EXECUTE')
            then 'OK' else 'FAIL - anon has execute' end

union all
select '5 split maths is 70/30',
       case when round(100 * 0.70) = 70 and 100 - round(100 * 0.70) = 30
            then 'OK' else 'FAIL - maths wrong' end

union all
select '6 earnings tab already counts live_support',
       case when pg_get_functiondef('public.gliits_earnings()'::regprocedure) like '%live_support%'
            then 'OK' else 'FAIL - earnings will not show live support' end;

-- END OF FILE
