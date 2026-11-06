-- ============================================================
-- Remove the live gliim
--
-- Live sessions are no longer published as XpLoRe cards. The reader, the
-- composer palette and the Live page have already stopped referencing any
-- of this, so what is left is the database half: the link table, the
-- functions that wrote the card, and the triggers that retired it when a
-- session ended.
--
-- Two of these objects are load-bearing right now, so they change first:
--
--   * support_live_session reads live_gliim_links to mirror the donation
--     onto the published card. With the table gone it would throw on every
--     support click, so it is redefined below without that lookup.
--   * trg_retire_live_gliim fires on every live_requests status change and
--     deletes the linked gliim. It would throw the moment the table goes.
--
-- The block cleanup below also strips the composer blocks that were
-- retired — live, slide and table — out of stored gliim bodies. Poll is
-- not retired: it is now a style of the text block and keeps its stored
-- shape, so poll blocks are left exactly as they are.
--
-- Everything in this file is idempotent and safe to run in one pass.
--
-- Archive: the definitions of everything dropped below are kept in the repo,
-- so nothing here is unrecoverable. The function and trigger bodies are in
-- sql/live_gliim.sql and sql/live_on_air.sql (both now marked archive-only),
-- and the table + bump_live_views(), which only ever existed in the database,
-- are copied verbatim into sql/archive_live_gliims.sql. Read-only reference —
-- never run that file.
--
-- If you also want the surviving rows before they go, run this read-only
-- query on its own first and keep the output:
--
--   select count(*) as links, count(distinct session_id) as sessions
--     from public.live_gliim_links;
--
-- Verified on production 2026-11-06: that table holds 0 rows and no session
-- is open or active, so there is nothing to lose.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The support button stops writing to a gliim card
--
-- Same money math as before: G100, 70% to the host, 30% kept, and a
-- partial send when the balance is under the cost and the caller opts in.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 2. Retired blocks out of stored bodies
--
-- Only rows that actually hold one are touched, and the remaining blocks
-- keep their original order.
-- ------------------------------------------------------------
update public.feed_gliim_contents c
   set blocks = (
     select coalesce(jsonb_agg(b.value order by b.ord), '[]'::jsonb)
       from jsonb_array_elements(c.blocks) with ordinality as b(value, ord)
      where coalesce(b.value ->> 'type', '') not in ('live', 'slide', 'table')
   )
 where jsonb_typeof(c.blocks) = 'array'
   and exists (
     select 1
       from jsonb_array_elements(c.blocks) as e
      where coalesce(e ->> 'type', '') in ('live', 'slide', 'table')
   );

-- ------------------------------------------------------------
-- 3. Drop the live-gliim machinery
--
-- Destructive, but every row it deletes was only a link between a session
-- and the card it was published as. If you want to see what goes first,
-- run this read-only query on its own before you run the file; on a
-- project where nothing was ever published as a live gliim both counts
-- read zero:
--
--   select count(*) as links, count(distinct session_id) as sessions
--     from public.live_gliim_links;
--
-- The trigger and the table are dropped inside a guard so a second run of
-- this file does not fail on an object that is already gone.
-- ------------------------------------------------------------
drop trigger if exists trg_retire_live_gliim on public.live_requests;
drop function if exists public.retire_live_gliim();

-- The link table and its trigger go BEFORE the functions: Postgres refuses
-- to drop a function that a trigger still depends on, and
-- trg_cancel_orphan_live_session is the dependent here.
do $$
begin
  if to_regclass('public.live_gliim_links') is not null then
    execute 'drop trigger if exists trg_cancel_orphan_live_session on public.live_gliim_links';
    execute 'drop table public.live_gliim_links';
  end if;
end;
$$;

drop function if exists public.cancel_orphan_live_session();
drop function if exists public.publish_live_gliim(uuid, text, text);
drop function if exists public.remove_live_gliim(uuid);
drop function if exists public.append_live_blocks(uuid, jsonb);
drop function if exists public.live_chat_counts(uuid[]);
drop function if exists public.bump_live_views(uuid);

-- END OF RUNNABLE SQL. Everything below is a read-only report.

-- ============================================================
-- SELF CHECK — paste from "with dead as (" to "order by ord;" and run it.
-- Nothing to edit. Every item must read OK. The two rows that can read
-- INFO are known leftovers, not failures.
-- ============================================================
with dead as (
  select proname from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('publish_live_gliim', 'remove_live_gliim', 'retire_live_gliim',
                     'append_live_blocks', 'live_chat_counts', 'bump_live_views',
                     'cancel_orphan_live_session')
)
select ord, item, verdict from (
  select 1 as ord, 'live_gliim_links is gone' as item,
    case when not exists (select 1 from pg_class where relname = 'live_gliim_links'
                           and relnamespace = 'public'::regnamespace and relkind = 'r')
         then 'OK' else 'STILL PRESENT' end as verdict
  union all
  select 2, 'all seven dead functions gone',
    case when count(*) = 0 then 'OK' else 'STILL THERE (' || string_agg(proname, ', ') || ')' end
      from dead
  union all
  select 3, 'no live-gliim trigger left',
    case when count(*) = 0 then 'OK' else 'STILL ATTACHED' end
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
     where t.tgname in ('trg_retire_live_gliim', 'trg_cancel_orphan_live_session')
       and not t.tgisinternal
  union all
  select 4, 'support still works on a live session',
    case when exists (select 1 from pg_proc where proname = 'support_live_session'
                       and pronamespace = 'public'::regnamespace)
         then 'OK' else 'FUNCTION MISSING' end
  union all
  select 5, 'support no longer reads the link table',
    case when pg_get_functiondef(p.oid) not like '%live_gliim_links%'
           and pg_get_functiondef(p.oid) not like '%feed_interactions%'
         then 'OK' else 'STILL WRITES A CARD' end
      from pg_proc p where p.proname = 'support_live_session'
  union all
  select 6, 'support still runs as its owner with a pinned path',
    case when p.prosecdef and p.proconfig @> array['search_path=public']
         then 'OK' else 'NOT PROTECTED' end
      from pg_proc p where p.proname = 'support_live_session'
  union all
  select 7, 'support still G100 at a 70 percent split',
    case when pg_get_functiondef(p.oid) like '%100%'
           and pg_get_functiondef(p.oid) like '%0.70%'
         then 'OK' else 'MATH CHANGED' end
      from pg_proc p where p.proname = 'support_live_session'
  union all
  select 8, 'members can support, anon cannot',
    case when has_function_privilege('authenticated', p.oid, 'execute')
           and not has_function_privilege('anon', p.oid, 'execute')
         then 'OK' else 'GRANTS WRONG' end
      from pg_proc p where p.proname = 'support_live_session'
  union all
  select 9, 'the live page still has its functions',
    case when count(*) = 4 then 'OK' else 'GONE (' || count(*)::text || ' of 4)' end
      from pg_proc
     where proname in ('start_live_session', 'end_stale_live_sessions',
                       'increment_participant_count', 'decrement_participant_count')
  union all
  select 10, 'chat and kicks tables intact',
    case when count(*) = 2 then 'OK' else 'MISSING' end
      from pg_class
     where relkind = 'r' and relnamespace = 'public'::regnamespace
       and relname in ('live_chat_messages', 'live_kicked_users')
  union all
  select 11, 'no retired block left in a stored body',
    case when count(*) = 0 then 'OK' else 'LEFT (' || count(*)::text || ')' end
      from public.feed_gliim_contents c
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(c.blocks) = 'array' then c.blocks else '[]'::jsonb end
      ) as e
     where coalesce(e ->> 'type', '') in ('live', 'slide', 'table')
  union all
  select 12, 'no gliim filed under the live category',
    case when count(*) = 0 then 'OK' else 'LEFT (' || count(*)::text || ')' end
      from public.feed_gliims where category = 'live'
  union all
  select 13, 'poll blocks still readable by the reader',
    case when exists (
             select 1 from public.feed_gliim_contents c
             cross join lateral jsonb_array_elements(
               case when jsonb_typeof(c.blocks) = 'array' then c.blocks else '[]'::jsonb end
             ) as e
            where e ->> 'type' = 'poll')
         then 'OK - poll blocks left alone'
         else 'INFO - no poll block stored yet' end
  union all
  select 14, 'blocks the reader renders nothing for',
    coalesce('INFO - ' || string_agg(distinct t, ', ') || ' block(s) still stored', 'OK - none')
      from (
        select e ->> 'type' as t
          from public.feed_gliim_contents c
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(c.blocks) = 'array' then c.blocks else '[]'::jsonb end
          ) as e
         where coalesce(e ->> 'type', '') in ('sponsor', 'event', 'pdf_legacy')
      ) stale
  union all
  select 15, 'hosting gate still attached to live_requests',
    case when exists (
             select 1 from pg_trigger t
             join pg_class c on c.oid = t.tgrelid
            where t.tgname = 'enforce_live_subscription' and not t.tgisinternal)
         then 'INFO - still raises LIVE_REQUIRES_SUBSCRIPTION'
         else 'OK - not gating' end
  union all
  select 16, 'sessions on the board',
    count(*) filter (where status = 'active')::text || ' active, ' ||
    count(*) filter (where status = 'open')::text || ' open'
      from public.live_requests where status in ('open', 'active')
) checks
order by ord;

-- END OF FILE
