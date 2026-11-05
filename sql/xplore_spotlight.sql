-- XpLoRe spotlight: opt-in "feature my profile" + ranked creator tiles.
-- Idempotent: run as many times as you like. Nothing here deletes data.
--
-- Ranking window is rolling, not lifetime, so a creator who stops posting
-- leaves the spotlight within a week instead of holding a tile forever.
-- Only descriptions listed in earned_gp_pattern() count as creator earnings:
-- new GP sources must be added there or they will silently not rank.

alter table public.profiles
  add column if not exists feature_my_profile boolean not null default false;

comment on column public.profiles.feature_my_profile is
  'Owner consent to appear on the XpLoRe spotlight; default off, changed only by the owner.';

create or replace function public.earned_gp_pattern()
returns text[]
language sql immutable
as $$
  select array[
    'Earned GP from Hub Engagement%',
    'Referral reward%',
    'Live session hosted%',
    'Live session taught%'
  ];
$$;

-- Lifetime spend rows share the reward type but are not earnings, so an
-- allowlist (never a "points > 0" sum) is what keeps them out.
create or replace function public.xplore_spotlight(
  p_days  integer default 7,
  p_limit integer default 3
)
returns table (
  user_id            uuid,
  full_name          text,
  avatar_url         text,
  bio                text,
  verification_badge text,
  gp_window          integer,
  followers          bigint
)
language sql stable
security invoker
set search_path to 'public'
as $$
  with earners as (
    select t.user_id, sum(t.points)::integer as gp_window
    from public.transactions t
    where t.user_id is not null
      and t.status = 'success'
      and t.points > 0
      and t.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
      and t.description like any (public.earned_gp_pattern())
    group by t.user_id
  )
  select pr.id,
         pr.full_name,
         pr.avatar_url,
         pr.bio,
         pr.verification_badge,
         e.gp_window,
         (select count(*) from public.followed_users f where f.followed_id = pr.id) as fans
  from public.profiles pr
  join earners e on e.user_id = pr.id
  where pr.feature_my_profile
    and pr.deletion_scheduled_at is null
    and coalesce(pr.avatar_url, '') <> ''
    and (auth.uid() is null or pr.id <> auth.uid())
  order by e.gp_window desc, fans desc, pr.id
  limit greatest(coalesce(p_limit, 3), 1);
$$;

grant execute on function public.earned_gp_pattern() to anon, authenticated;
grant execute on function public.xplore_spotlight(integer, integer) to anon, authenticated;

-- featured_slot_check was written against public.billing_prices, which the
-- Gliits rework dropped, so every call failed and #/feature could only render
-- its error state. Slot availability needs no price table: the Gliits amounts
-- live in the client (feature.js _prices), so this returns counts only.
create or replace function public.featured_slot_check()
returns jsonb
language plpgsql stable
security invoker
set search_path to 'public'
as $$
declare
  v_active integer;
  v_max integer := 3;
begin
  select count(*) into v_active
    from public.featured_posts
   where status = 'approved'
     and starts_at <= now()
     and ends_at >= now();

  return jsonb_build_object(
    'active', coalesce(v_active, 0),
    'max_slots', v_max,
    'available', coalesce(v_active, 0) < v_max
  );
end;
$$;

grant execute on function public.featured_slot_check() to anon, authenticated;

-- --------------------------------- self check -------------------------------
-- Read this grid once after running the script. Every check must say ok.
-- The last two rows are counts, not pass/fail: they tell you what the
-- spotlight will actually show today.
with col as (
  select c.column_default, c.is_nullable
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'profiles'
    and c.column_name = 'feature_my_profile'
),
fn as (
  select p.prosecdef, p.proconfig,
         (select count(*) from information_schema.routines r
           where r.routine_schema = 'public' and r.routine_name = 'xplore_spotlight') as routines
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'xplore_spotlight'
),
pollution as (
  select count(*) as bad
  from public.transactions t
  where t.description like any (public.earned_gp_pattern())
    and (t.description like 'GP→Gliits%' or t.description like 'Completed reading:%'
         or t.description like 'Daily GP reward%' or t.description like 'Live session joined%')
),
week_earners as (
  select t.user_id, sum(t.points)::integer as gp
  from public.transactions t
  where t.user_id is not null and t.status = 'success' and t.points > 0
    and t.created_at >= now() - interval '7 days'
    and t.description like any (public.earned_gp_pattern())
  group by t.user_id
),
eligible as (
  select count(*) as n
  from week_earners e
  join public.profiles pr on pr.id = e.user_id
  where pr.deletion_scheduled_at is null and coalesce(pr.avatar_url, '') <> ''
),
slotfn as (
  select count(*) as overloads,
         bool_and(not p.prosecdef) as invoker,
         bool_and(p.proconfig @> array['search_path=public']) as path_set
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'featured_slot_check'
),
slot_live as (
  select public.featured_slot_check() as j
)
select '01 column exists' as check_name,
       case when (select count(*) from col) = 1 then 'ok' else 'FAIL' end as result,
       'present on public.profiles' as value
union all select '02 default is false',
       case when (select column_default from col) like '%false%' then 'ok' else 'FAIL' end,
       coalesce((select column_default from col), 'missing')
union all select '03 not null',
       case when (select is_nullable from col) = 'NO' then 'ok' else 'FAIL' end,
       coalesce((select is_nullable from col), 'missing')
union all select '04 rpc exists',
       case when (select routines from fn limit 1) = 1 then 'ok' else 'FAIL' end,
       coalesce((select routines::text from fn limit 1), '0')
union all select '05 rpc is security invoker',
       case when (select prosecdef from fn limit 1) = false then 'ok' else 'FAIL' end,
       'no definer bypass'
union all select '06 rpc search_path set',
       case when (select proconfig from fn limit 1) @> array['search_path=public'] then 'ok' else 'FAIL' end,
       coalesce(array_to_string((select proconfig from fn limit 1), ','), 'unset')
union all select '07 earnings allowlist is clean',
       case when (select bad from pollution) = 0 then 'ok' else 'FAIL' end,
       (select bad::text from pollution) || ' spend rows matched'
union all select '08 opted in today', 'info',
       (select count(*)::text from public.profiles where feature_my_profile) || ' profiles'
union all select '09 spotlight returns today', 'info',
       (select count(*)::text from public.xplore_spotlight(7, 3)) || ' tiles'
union all select '10 creators who would qualify if they opted in', 'info',
       (select n::text from eligible) || ' of them earned GP this week'
union all select '11 slot check rebuilt on current schema',
       case when (select overloads from slotfn) = 1 then 'ok' else 'FAIL' end,
       (select overloads::text from slotfn) || ' overload(s), no billing_prices read'
union all select '12 slot check is security invoker',
       case when (select invoker from slotfn) and (select path_set from slotfn) then 'ok' else 'FAIL' end,
       'invoker + search_path public'
union all select '13 slot check answers today',
       case when (select j ? 'available' from slot_live) then 'ok' else 'FAIL' end,
       (select format('%s of %s taken, available=%s', j ->> 'active', j ->> 'max_slots', j ->> 'available') from slot_live);
