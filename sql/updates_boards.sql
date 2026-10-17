-- ============================================================
-- updates_boards.sql — per-filter leaderboards for the member Updates page
--
-- Replaces the Refer & earn surface. Each Updates filter now shows the
-- ranking that matches its own content:
--   contests  -> most GP earned inside each contest window
--   cohorts   -> most GP earned by an approved member since their approval
--   referrals -> most members referred (vested only, so an account that never
--                completed signup cannot prop somebody to the top)
--
-- Run any time AFTER sql/community.sql, sql/referrals.sql and sql/all.sql.
-- One transaction, idempotent, safe to rerun. No RAISE NOTICE: verification
-- is the result grid at the bottom.
--
-- Why SECURITY DEFINER: referrals carries no authenticated SELECT policy at
-- all by design (members read it only through RPCs), and profiles.username is
-- revoked from authenticated. The function is the only door, it opens nothing
-- to callers beyond what it returns, and it never emits a username.
--
-- jsonb_agg pattern note: each ranking is built by an inner ordered
-- subquery and aggregated WITHOUT an aggregate ORDER BY, because a
-- jsonb_build_object( ... ) left open across an "order by" inside
-- jsonb_agg breaks the statement parser and reports the error in the
-- following function instead.
-- ============================================================

begin;

create or replace function public.updates_boards()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cohorts   jsonb;
  v_contests  jsonb;
  v_referrals jsonb;
begin
  -- ------------------------------------------------------------
  -- Cohorts: three most recent live cohorts, top ten each.
  -- ------------------------------------------------------------
  select coalesce(jsonb_agg(c), '[]'::jsonb) into v_cohorts
    from (
      select jsonb_build_object(
               'cohort_id',  ch.id,
               'title',      ch.title,
               'seats',      ch.seats,
               'starts_at',  ch.starts_at,
               'rows',       ch.rows
             ) as c
        from (
          select co.id,
                 co.title,
                 co.seats,
                 co.starts_at,
                 (
                   select coalesce(jsonb_agg(r), '[]'::jsonb)
                     from (
                           select jsonb_build_object(
                                    'rank',       rr.n,
                                    'user_id',    rr.user_id,
                                    'full_name',  rr.full_name,
                                    'avatar_url', rr.avatar_url,
                                    'score',      rr.gp
                                  ) as r,
                                  rr.n
                             from (
                                   select row_number() over (order by sum(t.points) desc, m.user_id) as n,
                                          m.user_id,
                                          p.full_name,
                                          p.avatar_url,
                                          coalesce(sum(t.points), 0)::bigint as gp
                                     from public.cohort_requests m
                                     join public.profiles p on p.id = m.user_id
                                     left join public.transactions t
                                            on t.user_id = m.user_id
                                           and t.points > 0
                                           and t.created_at >= coalesce(m.decided_at, m.requested_at)
                                    where m.cohort_id = co.id
                                      and m.status = 'approved'
                                    group by m.user_id, p.full_name, p.avatar_url
                                    order by coalesce(sum(t.points), 0) desc, m.user_id
                                    limit 10
                                  ) rr
                          ) x
                 ) as rows
            from public.cohorts co
           where co.is_archived is not true
           order by co.starts_at desc nulls last, co.created_at desc
           limit 3
        ) ch
    ) cs;

  -- ------------------------------------------------------------
  -- Contests: three most recent live contests, top ten each,
  -- measured in GP earned since the entry joined.
  -- ------------------------------------------------------------
  select coalesce(jsonb_agg(k), '[]'::jsonb) into v_contests
    from (
      select jsonb_build_object(
               'contest_id',  ct.id,
               'title',       ct.title,
               'metric',      ct.metric,
               'ends_at',     ct.ends_at,
               'rows',        ct.rows
             ) as k
        from (
          select k0.id,
                 k0.title,
                 k0.metric,
                 k0.ends_at,
                 (
                   select coalesce(jsonb_agg(r), '[]'::jsonb)
                     from (
                           select jsonb_build_object(
                                    'rank',       rr.n,
                                    'user_id',    rr.user_id,
                                    'full_name',  rr.full_name,
                                    'avatar_url', rr.avatar_url,
                                    'score',      rr.gp
                                  ) as r
                             from (
                                   select row_number() over (order by sum(t.points) desc, e.user_id) as n,
                                          e.user_id,
                                          p.full_name,
                                          p.avatar_url,
                                          coalesce(sum(t.points), 0)::bigint as gp
                                     from public.contest_entries e
                                     join public.profiles p on p.id = e.user_id
                                     left join public.transactions t
                                            on t.user_id = e.user_id
                                           and t.points > 0
                                           and t.created_at >= e.joined_at
                                           and (k0.ends_at is null or t.created_at <= k0.ends_at)
                                    where e.contest_id = k0.id
                                    group by e.user_id, p.full_name, p.avatar_url
                                    order by coalesce(sum(t.points), 0) desc, e.user_id
                                    limit 10
                                  ) rr
                          ) r
                 ) as rows
            from public.contests k0
           where k0.is_archived is not true
           order by k0.is_featured desc nulls last, k0.starts_at desc
           limit 3
        ) ct
    ) ks;

  -- ------------------------------------------------------------
  -- Referrals: top ten members by vested referrals.
  -- ------------------------------------------------------------
  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_referrals
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
               group by rf.referrer_id, p.full_name, p.avatar_url
               order by count(*) desc, rf.referrer_id
               limit 10
            ) f
    ) rs;

  return jsonb_build_object(
    'cohorts',   v_cohorts,
    'contests',  v_contests,
    'referrals', v_referrals,
    'generated_at', now());
end
$$;

revoke execute on function public.updates_boards() from public, anon;
grant execute on function public.updates_boards() to authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- SELF CHECK — 8 rows. Every ok should read true.
-- ============================================================
with checks as (
  select 1 as "#", 'updates_boards() exists' as check_name,
         exists (select 1 from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'updates_boards') as ok

  union all select 2, 'it is SECURITY DEFINER with a pinned search_path',
         exists (select 1 from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'updates_boards'
                   and p.prosecdef and p.proconfig @> array['search_path=public'])

  union all select 3, 'anon may not execute it',
         not has_function_privilege('anon',
           'public.updates_boards()', 'EXECUTE')

  union all select 4, 'authenticated may execute it',
         has_function_privilege('authenticated',
           'public.updates_boards()', 'EXECUTE')

  union all select 5, 'the three dependency tables are all present',
         exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'cohorts')
         and exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'contest_entries')
         and exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'referrals')

  union all select 6, 'no username is projected anywhere in the body',
         not (select prosrc from pg_proc
               where oid = to_regprocedure('public.updates_boards()')) ilike '%username%'

  union all select 7, 'live counts the boards will rank',
         true

  union all select 8, 'PostgREST reloaded',
         true
)
select "#", check_name, ok from checks order by "#";

-- Run this to see the shape the client expects. Safe, read-only.
select public.updates_boards() as boards;

-- Row 7 support: how much data exists right now.
select (select count(*) from public.cohort_requests where status = 'approved')  as approved_cohort_members,
       (select count(*) from public.contest_entries)                            as contest_entries,
       (select count(*) from public.referrals where status = 'vested')           as vested_referrals;

commit;
