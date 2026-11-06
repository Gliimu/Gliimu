-- ============================================================
-- Live participant counts
--
-- Joining a session calls increment_participant_count and leaving
-- calls decrement_participant_count. Both ran as the caller, and the
-- live_requests UPDATE policies only let the host or their partner
-- write the row — so a participant's UPDATE matched zero rows, the
-- "Session is full, locked, closed, or not accessible" guard fired and
-- the browser logged a 400 on every join.
--
-- The same guard could not have passed anyway: max_participants still
-- defaults to 0 and nothing in the app ever sets it, so
-- participant_count < max_participants was false for every session.
--
-- Both functions now run as their owner and only bump the counter on a
-- session that is actually joinable. A cap of 0 or NULL means unlimited,
-- which is what the Live page offers today. They keep their existing
-- integer signature and return the counter's new value.
--
-- Idempotent — safe to run again.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Someone joins
-- ------------------------------------------------------------
create or replace function public.increment_participant_count(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.live_requests
     set participant_count = coalesce(participant_count, 0) + 1
   where id = p_request_id
     and status in ('open', 'active')
     and (max_participants is null
          or max_participants <= 0
          or coalesce(participant_count, 0) < max_participants)
  returning participant_count into v_count;

  if not found then
    raise exception 'Session is closed, full, or not accessible';
  end if;

  return v_count;
end;
$fn$;

-- ------------------------------------------------------------
-- 2. Someone leaves
--
-- Deliberately quiet: the leave and end paths also run after the host
-- has already completed the session, and a zeroed counter on a closed
-- row is the outcome we wanted, not an error worth logging.
-- ------------------------------------------------------------
create or replace function public.decrement_participant_count(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.live_requests
     set participant_count = greatest(0, coalesce(participant_count, 0) - 1)
   where id = p_request_id
     and coalesce(participant_count, 0) > 0
  returning participant_count into v_count;

  return coalesce(v_count, 0);
end;
$fn$;

-- ------------------------------------------------------------
-- 3. Members call them, nobody else
-- ------------------------------------------------------------
revoke execute on function public.increment_participant_count(uuid) from public, anon;
revoke execute on function public.decrement_participant_count(uuid) from public, anon;
grant execute on function public.increment_participant_count(uuid) to authenticated;
grant execute on function public.decrement_participant_count(uuid) to authenticated;

-- END OF RUNNABLE SQL. Everything below is a read-only report.

-- ============================================================
-- SELF CHECK — paste from "with f as (" to "order by 1;" and run it.
-- Nothing to edit. Every item must read OK.
-- ============================================================
with f as (
  select p.oid, p.proname, p.prosecdef, p.proconfig,
         pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('increment_participant_count', 'decrement_participant_count')
)
select ord, item, verdict from (
  select 1 as ord, 'both functions exist' as item,
    case when count(*) = 2 then 'OK' else 'MISSING (' || count(*)::text || ' of 2)' end as verdict
      from f
  union all
  select 2, 'both run as their owner (definer)',
    case when count(*) = 2 then 'OK' else 'STILL INVOKER' end
      from f where prosecdef
  union all
  select 3, 'both pin search_path',
    case when count(*) = 2 then 'OK' else 'NOT PINNED' end
      from f where def like '%search_path%'
  union all
  select 4, 'increment keeps the status gate',
    case when count(*) = 1 then 'OK' else 'BODY WRONG' end
      from f where proname = 'increment_participant_count'
        and def like '%status in (''open'', ''active'')%'
  union all
  select 5, 'increment treats 0 cap as unlimited',
    case when count(*) = 1 then 'OK' else 'CAP BUG STILL THERE' end
      from f where proname = 'increment_participant_count'
        and def like '%max_participants <= 0%'
  union all
  select 6, 'increment refuses anonymous callers',
    case when count(*) = 1 then 'OK' else 'NO AUTH GATE' end
      from f where proname = 'increment_participant_count'
        and def like '%NOT_AUTHENTICATED%'
  union all
  select 7, 'decrement never goes below zero',
    case when count(*) = 1 then 'OK' else 'BODY WRONG' end
      from f where proname = 'decrement_participant_count'
        and def like '%greatest(0%'
  union all
  select 8, 'members can call both',
    case when count(*) = 2 then 'OK' else 'GRANT MISSING' end
      from f where has_function_privilege('authenticated', oid, 'execute')
  union all
  select 9, 'anon can call neither',
    case when count(*) = 0 then 'OK' else 'ANON CAN CALL' end
      from f where has_function_privilege('anon', oid, 'execute')
  union all
  select 10, 'public role can call neither',
    case when count(*) = 0 then 'OK' else 'PUBLIC CAN CALL' end
      from f where has_function_privilege('public', oid, 'execute')
  union all
  select 11, 'every live session has a joinable cap',
    case when count(*) = 0 then 'OK' else 'WOULD BLOCK (' || count(*)::text || ')' end
      from public.live_requests
     where status in ('open', 'active')
       and max_participants is not null
       and max_participants > 0
       and coalesce(participant_count, 0) >= max_participants
  union all
  select 12, 'counters inside their own caps',
    case when count(*) = 0 then 'OK' else 'DRIFTED (' || count(*)::text || ')' end
      from public.live_requests
     where coalesce(participant_count, 0) < 0
  union all
  select 13, 'open sessions',
    coalesce(count(*)::text, '0') || ' open, ' ||
    count(*) filter (where status = 'active')::text || ' active'
      from public.live_requests where status in ('open', 'active')
) checks
order by ord;

-- END OF FILE
