-- ============================================================
-- gliits_earnings.sql — Earnings report RPC for the Billing page
-- Public.gliits_earnings() returns the signed-in member's:
--   - creator per-minute earnings (total, last 30 days, minutes read)
--   - top earning posts (top 10 by Gliits earned)
--   - GP earned (from transactions)
--   - creator support received (G)
-- Idempotent: safe to run again.
-- ============================================================

create or replace function public.gliits_earnings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_total_gliits numeric;
  v_total_minutes bigint;
  v_earned_30d numeric;
  v_top_posts jsonb;
  v_total_gp numeric;
  v_support_received numeric;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Creator per-minute earnings: usage minutes on my posts
  select coalesce(sum(u.creator_credited), 0), count(*)
    into v_total_gliits, v_total_minutes
  from public.gliits_usage u
  join public.feed_gliims f on f.id = u.post_id
  where f.user_id = v_user;

  select coalesce(sum(u.creator_credited), 0)
    into v_earned_30d
  from public.gliits_usage u
  join public.feed_gliims f on f.id = u.post_id
  where f.user_id = v_user
    and u.minute_at >= now() - interval '30 days';

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'post_id', t.post_id,
               'title', t.title,
               'minutes', t.minutes,
               'earned', t.earned
             ) order by t.earned desc
           ),
           '[]'::jsonb
         )
    into v_top_posts
  from (
    select u.post_id,
           max(coalesce(nullif(f.title, ''), left(nullif(f.description, ''), 80))) as title,
           count(*) as minutes,
           coalesce(sum(u.creator_credited), 0) as earned
    from public.gliits_usage u
    join public.feed_gliims f on f.id = u.post_id
    where f.user_id = v_user
    group by u.post_id
    order by earned desc
    limit 10
  ) t;

  -- GP earned (all reward-bearing transactions)
  select coalesce(sum(points), 0)
    into v_total_gp
  from public.transactions
  where user_id = v_user
    and points > 0;

  -- Creator support received (support + live support, incoming rows)
  select coalesce(sum(amount), 0)
    into v_support_received
  from public.transactions
  where user_id = v_user
    and type in ('support', 'live_support')
    and amount > 0;

  return jsonb_build_object(
    'total_gliits', v_total_gliits,
    'total_minutes', v_total_minutes,
    'earned_30d', v_earned_30d,
    'top_posts', v_top_posts,
    'total_gp', v_total_gp,
    'support_received', v_support_received
  );
end;
$$;

revoke all on function public.gliits_earnings() from public;
revoke all on function public.gliits_earnings() from anon;
grant execute on function public.gliits_earnings() to authenticated;

-- ============================================================
-- SELF CHECK — run each SELECT after the script
-- ============================================================

-- 1) Function exists, SECURITY DEFINER, owned by postgres
--    expect: 1 row, security_definer = true
select p.proname, p.prosecdef as security_definer, pg_get_userbyid(p.proowner) as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'gliits_earnings';

-- 2) Execute grants
--    expect: authenticated = EXECUTE (postgres row is the owner)
select grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public' and routine_name = 'gliits_earnings'
order by grantee;

-- 3) Creator earnings preview (0 rows while no usage minutes exist yet)
select f.user_id,
       count(*) as minutes,
       coalesce(sum(u.creator_credited), 0) as earned
from gliits_usage u
join feed_gliims f on f.id = u.post_id
group by f.user_id
order by earned desc
limit 5;

-- 4) Support received preview
select user_id, coalesce(sum(amount), 0) as support_received
from transactions
where type in ('support', 'live_support') and amount > 0
group by user_id
order by support_received desc
limit 5;

-- 5) Live call as a member (picks the first profile automatically — nothing to edit)
--    expect: one jsonb row (total_gliits, total_minutes, earned_30d, top_posts, total_gp, support_received)
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id::text from public.profiles order by created_at limit 1), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by created_at limit 1), true);
select public.gliits_earnings();
rollback;
