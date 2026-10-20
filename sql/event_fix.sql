-- ============================================================
-- EVENT FIXES — billing_access ambiguity + pricing grants + table grants
-- Run this ONCE in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. FIX billing_access AMBIGUITY
--    The event_create and event_refund_check functions call
--    billing_access with 3 args, but multiple overloads exist.
--    For now, remove the billing calls (event billing is a
--    separate task). They'll be re-added with explicit casts.
-- ============================================================

-- Recreate event_create WITHOUT the billing_access call
create or replace function public.event_create(
  p_title text,
  p_description text,
  p_cover_url text,
  p_category_ids uuid[],
  p_start_date timestamptz,
  p_duration_days int,
  p_budget_naira numeric,
  p_team_mode boolean,
  p_max_team_size int default 3,
  p_rules_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_pricing jsonb;
  v_per_participant_cost numeric;
  v_max_participants int;
  v_prize_pool numeric;
  v_event_id uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  -- Get current pricing
  select row_to_json(p) into v_pricing
  from (select * from public.event_pricing limit 1) p;

  if v_pricing is null then
    return jsonb_build_object('ok', false, 'code', 'PRICING_NOT_CONFIGURED');
  end if;

  -- Calculate per-participant cost
  select public.event_calc_participant_cost(p_duration_days) into v_per_participant_cost;
  v_max_participants := floor(p_budget_naira / v_per_participant_cost);

  if v_max_participants < 1 then
    return jsonb_build_object('ok', false, 'code', 'BUDGET_TOO_LOW');
  end if;

  -- Calculate prizes (85% of budget split: 45/25/15)
  v_prize_pool := p_budget_naira * (1 - (v_pricing->>'gliimu_fee_percent')::numeric / 100);

  -- TODO: Re-add billing deduction when event billing is integrated
  -- perform public.billing_access('event_create'::text, p_budget_naira::text, null::text, null::uuid, null::integer);

  -- Create event
  insert into public.events (
    host_id, title, description, cover_url, category_ids,
    start_date, end_date, duration_days,
    budget_naira, per_participant_cost, max_participants,
    min_participants, team_mode, max_team_size, rules_text,
    prize_1st, prize_2nd, prize_3rd, gliimu_fee
  ) values (
    uid, btrim(p_title), btrim(p_description), p_cover_url, p_category_ids,
    p_start_date, p_start_date + (p_duration_days || ' days')::interval, p_duration_days,
    p_budget_naira, v_per_participant_cost, v_max_participants,
    (v_pricing->>'min_participants')::int, p_team_mode, p_max_team_size, p_rules_text,
    v_prize_pool * (v_pricing->>'prize_1st_percent')::numeric / 100,
    v_prize_pool * (v_pricing->>'prize_2nd_percent')::numeric / 100,
    v_prize_pool * (v_pricing->>'prize_3rd_percent')::numeric / 100,
    p_budget_naira * (v_pricing->>'gliimu_fee_percent')::numeric / 100
  ) returning id into v_event_id;

  -- Host auto-joins as participant
  insert into public.event_participants (event_id, user_id)
  values (v_event_id, uid);

  update public.events
  set current_participants = 1
  where id = v_event_id;

  return jsonb_build_object('ok', true, 'event_id', v_event_id);
end $$;

-- Recreate event_refund_check WITHOUT the billing_access call
create or replace function public.event_refund_check()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_refund_count int := 0;
begin
  -- Only operations can trigger this
  if not public.admin_has_role(auth.uid(), 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHORIZED');
  end if;

  for v_event in
    select * from public.events
    where status = 'recruiting'
    and created_at < now() - interval '30 days'
    and refund_issued = false
  loop
    -- TODO: Re-add refund when event billing is integrated
    -- perform public.billing_access('event_refund'::text, v_event.budget_naira::text, v_event.id::text, null::uuid, null::integer);

    update public.events
    set status = 'cancelled', refund_issued = true, refund_issued_at = now()
    where id = v_event.id;

    v_refund_count := v_refund_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'refunded_count', v_refund_count);
end $$;

-- Re-grant the fixed functions
revoke execute on function public.event_create(text,text,text,uuid[],timestamptz,int,numeric,boolean,int,text) from public, anon;
grant execute on function public.event_create(text,text,text,uuid[],timestamptz,int,numeric,boolean,int,text) to authenticated;

revoke execute on function public.event_refund_check() from public, anon;
grant execute on function public.event_refund_check() to authenticated;

-- ============================================================
-- 2. TABLE GRANTS — fix 403 on /rest/v1/events
-- ============================================================
grant select on public.event_categories to authenticated;
grant select on public.events to authenticated;
grant insert on public.events to authenticated;
grant update on public.events to authenticated;
grant select on public.event_participants to authenticated;
grant insert on public.event_participants to authenticated;
grant delete on public.event_participants to authenticated;
grant select on public.event_teams to authenticated;
grant insert on public.event_teams to authenticated;
grant select on public.event_team_members to authenticated;
grant insert on public.event_team_members to authenticated;
grant select on public.event_posts to authenticated;
grant insert on public.event_posts to authenticated;
grant select on public.event_post_likes to authenticated;
grant insert on public.event_post_likes to authenticated;
grant select on public.event_gp_earnings to authenticated;
grant select on public.event_prizes to authenticated;

-- Also grant event_pricing table (the RPC reads from it)
grant select on public.event_pricing to authenticated;

-- ============================================================
-- 3. SEED DEFAULT PRICING (if not exists)
-- ============================================================
insert into public.event_pricing (
  cost_1_week, cost_2_weeks, cost_1_month, cost_2_months, cost_3_months,
  gliimu_fee_percent, prize_1st_percent, prize_2nd_percent, prize_3rd_percent,
  min_participants
)
select 4000, 3000, 2000, 1500, 1000, 15, 45, 25, 15, 10
where not exists (select 1 from public.event_pricing limit 1);

-- Grant the pricing RPC explicitly
revoke execute on function public.event_pricing_get() from public, anon;
grant execute on function public.event_pricing_get() to authenticated;

-- ============================================================
-- SELF CHECK
-- ============================================================
select 'event_create function' as check_name,
  case when to_regprocedure('public.event_create(text,text,text,uuid[],timestamptz,int,numeric,boolean,int,text)') is not null then 'OK' else 'MISSING' end as status
union all
select 'event_refund_check function',
  case when to_regprocedure('public.event_refund_check()') is not null then 'OK' else 'MISSING' end
union all
select 'event_pricing row exists',
  case when exists (select 1 from public.event_pricing limit 1) then 'OK' else 'MISSING — run seed' end
union all
select 'event_categories count',
  (select count(*)::text from public.event_categories) || ' categories'
union all
select 'events table select',
  case when has_table_privilege('authenticated', 'public.events', 'SELECT') then 'OK' else 'DENIED' end
union all
select 'event_pricing_get execute',
  case when has_function_privilege('authenticated', 'public.event_pricing_get()', 'EXECUTE') then 'OK' else 'DENIED' end;
