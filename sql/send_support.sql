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

  -- Log the transaction for supporter
  insert into public.gp_ledger (user_id, amount, type, status, description)
  values (v_supporter_id, -v_support_cost, 'support', 'success', 'Supported a creator');

  -- Log the transaction for author
  insert into public.gp_ledger (user_id, amount, type, status, description)
  values (v_author_id, v_credited, 'reward', 'success', 'Received support from a viewer');

  return v_credited;
end;
$$;

revoke execute on function public.send_support(uuid) from public, anon;
grant execute on function public.send_support(uuid) to authenticated;

-- ============================================================
-- SELF CHECK
-- ============================================================
do $$
begin
  raise notice '=== SEND SUPPORT SELF CHECK ===';

  if not exists (select 1 from pg_proc where proname = 'send_support') then
    raise exception 'send_support function missing';
  end if;
  raise notice '✓ send_support function exists';

  raise notice '=== ALL CHECKS PASSED ===';
  raise notice 'Support cost: G500';
end $$;
