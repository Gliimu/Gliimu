-- sql/live_support_tap.sql — one tap, one row, everyone sees the proof
--
-- Before this file the studio fired two RPCs in parallel: react_live_session
-- (the like -> heart -> bolt ladder + GP) and support_live_session (G10 to the
-- host, 70/30). The floating card everyone sees is built from the reaction
-- row, so the G10 proof never travelled with it — only the tapper saw a local
-- G10 pill, and a tap could advance the ladder while the payment failed (or
-- the other way round).
--
-- This installs support_tap_live_session: the same ladder maths and the same
-- G10 / 70% split, done in ONE transaction, writing ONE reaction row that now
-- carries support_amount. Realtime delivers that row to every member of the
-- room — the tapper included — so all screens show the same card: supporter
-- avatar + name, the stage icon, any GP earned, and the exact G amount sent.
--
-- The two old functions are left in place untouched; the studio simply stops
-- calling them. Nothing else in the app calls them.
--
-- Idempotent: safe to run more than once.
--
-- HOW TO RUN
--   1. Supabase dashboard → SQL editor → New query.
--   2. Paste everything from "alter table public.live_reactions" down to
--      "grant execute ... to authenticated;". Press Run.
--      Expect "Success. No rows returned".
--   3. Paste only the SELF CHECK block, from "with t as (" to "order by 1;".
--      Press Run. Every item must read OK.

-- ======================================================================
-- 1. The proof rides on the reaction row
-- ======================================================================
alter table public.live_reactions
  add column if not exists support_amount numeric;

-- ======================================================================
-- 2. support_tap_live_session — ladder + G10, atomically
-- ======================================================================
create or replace function public.support_tap_live_session(
  p_request uuid,
  p_accept_partial boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user      uuid := auth.uid();
  v_host      uuid;
  v_status    text;
  v_mode      text;
  v_invited   jsonb;
  v_taps      integer;
  v_last_at   timestamptz;
  v_stage     integer;
  v_emoji     text;
  v_reach     boolean;
  v_cycle     integer;
  v_today     integer;
  v_award     integer;
  v_cost_cap  integer := 20;
  v_name      text;
  v_avatar    text;
  v_balance   numeric;
  v_spent     numeric;
  v_credited  numeric;
  v_cost      numeric := 10;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select user_id, status, sharing_mode, invited_user_ids
    into v_host, v_status, v_mode, v_invited
  from public.live_requests
  where id = p_request;

  if v_host is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'SESSION_NOT_ACTIVE');
  end if;

  if v_host = v_user then
    raise exception 'CANNOT_SUPPORT_SELF';
  end if;

  if coalesce(v_mode, '') <> 'general'
     and not (v_mode = 'users' and coalesce(v_invited, '[]'::jsonb) @> jsonb_build_array(v_user::text)) then
    return jsonb_build_object('ok', false, 'error', 'NOT_IN_SESSION');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || p_request::text, 0));

  select count(*), max(created_at) into v_taps, v_last_at
  from public.live_reactions
  where room_id = p_request and user_id = v_user;

  if v_last_at is not null and v_last_at > now() - interval '300 milliseconds' then
    return jsonb_build_object('ok', false, 'error', 'TOO_FAST');
  end if;

  -- Funds are checked before anything is written: a refused tap never
  -- advances the ladder and never draws a card.
  select coalesce(wallet_balance, 0) into v_balance
  from public.profiles
  where id = v_user;

  if v_balance >= v_cost then
    v_spent := v_cost;
  elsif p_accept_partial and v_balance > 0 then
    v_spent := v_balance;
  else
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  v_stage := (v_taps / 5) % 3;
  v_emoji := case v_stage when 0 then 'like' when 1 then 'heart' else 'bolt' end;
  v_reach := (v_taps % 15 = 10);
  v_cycle := (v_taps / 15) + 1;

  if v_reach then
    select coalesce(sum(gp_awarded), 0) into v_today
    from public.live_reactions
    where user_id = v_user
      and created_at >= date_trunc('day', now());

    v_award := greatest(0, least(v_cycle, v_cost_cap - v_today));
  else
    v_award := 0;
  end if;

  select coalesce(full_name, ''), avatar_url into v_name, v_avatar
  from public.profiles
  where id = v_user;

  insert into public.live_reactions
    (room_id, user_id, user_name, avatar_url, emoji, cycle, gp_awarded, support_amount)
  values
    (p_request, v_user, v_name, v_avatar, v_emoji,
     case when v_reach then v_cycle else 0 end, v_award, v_spent);

  if v_award > 0 then
    update public.profiles
    set total_gp = coalesce(total_gp, 0) + v_award
    where id = v_user;

    insert into public.transactions (user_id, amount, points, type, status, description)
    values (v_user, 0, v_award, 'reward', 'success', 'Earned GP reacting in a live session');
  end if;

  v_credited := round(v_spent * 0.70);

  update public.profiles
  set wallet_balance = coalesce(wallet_balance, 0) - v_spent
  where id = v_user;

  update public.profiles
  set wallet_balance = coalesce(wallet_balance, 0) + v_credited
  where id = v_host;

  insert into public.transactions (user_id, receiver_id, amount, type, status, description)
  values (v_user, v_host, -v_spent, 'live_support', 'success', 'Supported a live session');

  insert into public.transactions (user_id, receiver_id, amount, type, status, description)
  values (v_host, v_user, v_credited, 'live_support', 'success', 'Received support in a live session');

  return jsonb_build_object(
    'ok', true,
    'emoji', v_emoji,
    'tap_in_stage', (v_taps % 5) + 1,
    'reached_bolt', v_reach,
    'cycle', case when v_reach then v_cycle else 0 end,
    'gp_awarded', v_award,
    'gp_left_today', greatest(0, v_cost_cap - coalesce(v_today, 0) - v_award),
    'cost', v_spent,
    'host_credited', v_credited,
    'platform_kept', v_spent - v_credited,
    'partial', v_spent < v_cost
  );
end;
$function$;

revoke execute on function public.support_tap_live_session(uuid, boolean) from public, anon;
grant execute on function public.support_tap_live_session(uuid, boolean) to authenticated;

-- ======================================================================
-- SELF CHECK — paste from "with t as (" to "order by 1;" and run alone.
-- Every item must read OK.
-- ======================================================================
with t as (
  select 1 as n, 'support_amount column on live_reactions' as item,
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'live_reactions'
        and column_name = 'support_amount'
    ) then 'OK' else 'FAIL' end as status
  union all
  select 2, 'support_tap_live_session(uuid, boolean) installed',
    case when exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'support_tap_live_session'
        and pg_get_function_identity_arguments(p.oid) = 'p_request uuid, p_accept_partial boolean'
    ) then 'OK' else 'FAIL' end
  union all
  select 3, 'function is security definer with pinned search_path',
    case when exists (
      select 1 from pg_proc
      where proname = 'support_tap_live_session' and prosecdef
        and proconfig @> array['search_path=public']
    ) then 'OK' else 'FAIL' end
  union all
  select 4, 'execute granted to authenticated only',
    case when has_function_privilege('authenticated', 'public.support_tap_live_session(uuid, boolean)', 'execute')
          and not has_function_privilege('anon', 'public.support_tap_live_session(uuid, boolean)', 'execute')
    then 'OK' else 'FAIL' end
  union all
  select 5, 'live_reactions in supabase_realtime publication',
    case when exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_reactions'
    ) then 'OK' else 'FAIL' end
  union all
  select 6, 'room-member read policy intact',
    case when exists (
      select 1 from pg_policy
      where polrelid = 'public.live_reactions'::regclass and polname = 'live_reactions_read'
    ) then 'OK' else 'FAIL' end
  union all
  select 7, 'old react/support functions untouched',
    case when (select count(*) from pg_proc
               where proname in ('react_live_session', 'support_live_session')) = 2
    then 'OK' else 'FAIL' end
)
select n, item, status from t order by 1;