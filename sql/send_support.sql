-- sql/send_support.sql — Support a creator with G500
-- Deducts G500 from supporter's wallet, credits creator
-- Run this script once

-- ============================================================
-- SEND SUPPORT FUNCTION
-- ============================================================
drop function if exists public.send_support(uuid);
create or replace function public.send_support(p_post uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supporter_id uuid;
  v_author_id uuid;
  v_support_cost numeric := 500;
  v_balance numeric;
  v_credited numeric;
begin
  v_supporter_id := auth.uid();
  if v_supporter_id is null then
    raise exception 'Authentication required';
  end if;

  -- Get post author
  select user_id into v_author_id
  from public.feed_gliims
  where id = p_post;

  if v_author_id is null then
    raise exception 'Post not found';
  end if;

  -- Cannot support yourself
  if v_author_id = v_supporter_id then
    raise exception 'CANNOT_SUPPORT_SELF';
  end if;

  -- Check if already supported
  if exists (
    select 1 from public.feed_interactions
    where post_id = p_post
      and user_id = v_supporter_id
      and interaction_type = 'support'
  ) then
    raise exception 'ALREADY_SUPPORTED';
  end if;

  -- Get supporter's balance
  select wallet_balance into v_balance
  from public.profiles
  where id = v_supporter_id;

  if coalesce(v_balance, 0) < v_support_cost then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  -- Deduct from supporter
  update public.profiles
  set wallet_balance = coalesce(wallet_balance, 0) - v_support_cost
  where id = v_supporter_id;

  -- Credit to author (G500)
  v_credited := v_support_cost;
  update public.profiles
  set wallet_balance = coalesce(wallet_balance, 0) + v_credited,
      total_gp = coalesce(total_gp, 0) + 5
  where id = v_author_id;

  -- Record the interaction
  insert into public.feed_interactions (post_id, user_id, interaction_type, amount)
  values (p_post, v_supporter_id, 'support', v_support_cost);

  -- Ledger rows. gp_ledger no longer exists; public.transactions is the
  -- money ledger (same shape support_live_session writes).
  insert into public.transactions (user_id, receiver_id, amount, type, status, description)
  values (v_supporter_id, v_author_id, -v_support_cost, 'support', 'success', 'Supported a creator');

  insert into public.transactions (user_id, receiver_id, amount, type, status, description)
  values (v_author_id, v_supporter_id, v_credited, 'support', 'success', 'Received support from a viewer');

  return v_credited;
end;
$$;

revoke execute on function public.send_support(uuid) from public, anon;
grant execute on function public.send_support(uuid) to authenticated;

-- ============================================================
-- SELF CHECK — run as-is, read the grid. Every result must be ok.
-- ============================================================
with f as (
  select p.oid, p.prosrc, p.prorettype::regtype::text as ret, p.prosecdef,
         pg_get_function_identity_arguments(p.oid) as args,
         (select coalesce(string_agg(s, ','), '') from unnest(p.proconfig) s) as cfg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'send_support'
    and pg_get_function_identity_arguments(p.oid) = 'p_post uuid'
),
overloads as (
  select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'send_support'
)
select '01 send_support(uuid) exists' as check,
       case when (select count(*) from f) = 1 then 'ok' else 'FAIL' end as result,
       (select count(*)::text from f) as detail
union all select '02 both overloads present', case when (select n from overloads) = 2 then 'ok' else 'FAIL' end, (select n::text from overloads)
union all select '03 returns numeric', case when (select max(ret) from f) = 'numeric' then 'ok' else 'FAIL' end, (select max(ret) from f)
union all select '04 no gp_ledger reference', case when (select max(prosrc) from f) not like '%gp_ledger%' then 'ok' else 'FAIL' end, 'n/a'
union all select '05 exactly two ledger inserts', case when (select (length(max(prosrc)) - length(replace(max(prosrc), 'insert into public.transactions', ''))) / length('insert into public.transactions') from f) = 2 then 'ok' else 'FAIL' end,
       (select ((length(max(prosrc)) - length(replace(max(prosrc), 'insert into public.transactions', ''))) / length('insert into public.transactions'))::text from f)
union all select '06 receiver_id populated', case when (select max(prosrc) from f) like '%user_id, receiver_id, amount, type, status, description%' then 'ok' else 'FAIL' end, 'n/a'
union all select '07 cost still G500', case when (select max(prosrc) from f) like '%v_support_cost numeric := 500%' then 'ok' else 'FAIL' end, 'n/a'
union all select '08 author still +5 GP', case when (select max(prosrc) from f) like '%total_gp = coalesce(total_gp, 0) + 5%' then 'ok' else 'FAIL' end, 'n/a'
union all select '09 support dedupe kept', case when (select max(prosrc) from f) like '%ALREADY_SUPPORTED%' then 'ok' else 'FAIL' end, 'n/a'
union all select '10 security definer', case when (select bool_and(prosecdef) from f) then 'ok' else 'FAIL' end, 'n/a'
union all select '11 search_path pinned', case when (select max(cfg) from f) like '%search_path=public%' then 'ok' else 'FAIL' end, (select max(cfg) from f)
union all select '12 authenticated can execute', case when has_function_privilege('authenticated', (select max(oid) from f), 'execute') then 'ok' else 'FAIL' end, 'n/a'
union all select '13 anon cannot execute', case when not has_function_privilege('anon', (select max(oid) from f), 'execute') then 'ok' else 'FAIL' end, 'n/a'
union all select '14 gp_ledger table absent', case when (select count(*) from information_schema.tables where table_schema='public' and table_name='gp_ledger') = 0 then 'ok (ledger is transactions)' else 'FAIL' end,
       (select count(*)::text from information_schema.tables where table_schema='public' and table_name='gp_ledger')
union all select '15 support_live_session untouched', case when (select max(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='support_live_session') like '%insert into public.transactions%' then 'ok' else 'FAIL' end, 'n/a'
order by 1;

