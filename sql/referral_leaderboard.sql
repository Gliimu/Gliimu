-- referral_leaderboard.sql — time-filtered referral leaderboard
-- Adds referral_leaderboard(p_period) that returns top 50 referrers
-- filtered by: 'all' (default), 'month', 'week', 'today'
--
-- Run AFTER sql/referrals.sql and sql/updates_boards.sql

create or replace function public.referral_leaderboard(p_period text default 'all')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
  v_result jsonb;
begin
  -- Determine the cutoff based on period
  case lower(coalesce(p_period, 'all'))
    when 'today' then
      v_since := date_trunc('day', now());
    when 'week' then
      v_since := date_trunc('week', now());
    when 'month' then
      v_since := date_trunc('month', now());
    else
      v_since := null;  -- all time
  end case;

  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_result
    from (
      select jsonb_build_object(
               'rank',       f.n,
               'user_id',    f.referrer_id,
               'full_name',  f.full_name,
               'avatar_url', f.avatar_url,
               'score',      f.joined
             ) as r
        from (
              select row_number() over (order by count(*) desc, rf.referrer_id) as n,
                     rf.referrer_id,
                     p.full_name,
                     p.avatar_url,
                     count(*)::bigint as joined
                from public.referrals rf
                join public.profiles p on p.id = rf.referrer_id
               where rf.status = 'vested'
                 and (v_since is null or rf.vested_at >= v_since)
               group by rf.referrer_id, p.full_name, p.avatar_url
               order by count(*) desc, rf.referrer_id
               limit 50
            ) f
    ) rs;

  return v_result;
end $$;

revoke execute on function public.referral_leaderboard(text) from public, anon;
grant execute on function public.referral_leaderboard(text) to authenticated, service_role;

notify pgrst, 'reload schema';

-- SELF CHECK
select 1 as "#", 'referral_leaderboard() exists' as check_name,
       exists (select 1 from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'referral_leaderboard') as ok
union all
select 2, 'it is SECURITY DEFINER',
       exists (select 1 from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'referral_leaderboard'
                 and p.prosecdef)
union all
select 3, 'anon may not execute it',
       not has_function_privilege('anon', 'public.referral_leaderboard(text)', 'EXECUTE')
union all
select 4, 'authenticated may execute it',
       has_function_privilege('authenticated', 'public.referral_leaderboard(text)', 'EXECUTE')
order by "#";

-- Test all periods
select 'all' as period, public.referral_leaderboard('all') as board
union all
select 'month', public.referral_leaderboard('month')
union all
select 'week', public.referral_leaderboard('week')
union all
select 'today', public.referral_leaderboard('today');
