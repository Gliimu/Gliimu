-- Extend landing_highlights() to include trending content:
-- the most-read book, audiolite (by all-time unique readers) and
-- the most-viewed gliim/bundle (by all-time views).
-- The XpLoRe section on the landing page displays these alongside
-- the existing contest, cohort, and top-3 cards.

create or replace function public.landing_highlights()
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_contest       jsonb;
  v_cohort        jsonb;
  v_top3          jsonb;
  v_trending_book jsonb;
  v_trending_audio jsonb;
  v_trending_bundle jsonb;
begin
  -- 1. Most recently started active contest
  select jsonb_build_object(
    'id', c.id,
    'title', c.title,
    'description', c.description,
    'metric', c.metric,
    'starts_at', c.starts_at,
    'ends_at', c.ends_at,
    'prize_text', c.prize_text,
    'entries_count', coalesce(e.cnt, 0)
  ) into v_contest
  from public.contests c
  left join (
    select contest_id, count(*)::bigint as cnt
    from public.contest_entries
    group by contest_id
  ) e on e.contest_id = c.id
  where c.is_archived = false
    and c.starts_at <= now()
    and (c.ends_at is null or c.ends_at > now())
  order by c.starts_at desc
  limit 1;

  -- 2. Latest created cohort (not archived)
  select jsonb_build_object(
    'id', co.id,
    'title', co.title,
    'description', co.description,
    'seats', co.seats,
    'seats_taken', coalesce(cr.cnt, 0),
    'starts_at', co.starts_at
  ) into v_cohort
  from public.cohorts co
  left join (
    select cohort_id, count(*)::bigint as cnt
    from public.cohort_requests
    where status = 'approved'
    group by cohort_id
  ) cr on cr.cohort_id = co.id
  where co.is_archived = false
  order by co.created_at desc
  limit 1;

  -- 3. Top 3 all-time users by GP
  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_top3
  from (
    select jsonb_build_object(
      'user_id', p.id,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url,
      'total_gp', p.total_gp
    ) as r
    from public.profiles p
    where p.total_gp is not null and p.total_gp > 0
    order by p.total_gp desc
    limit 3
  ) r;

  -- 4. Trending book: approved book with most unique readers
  select jsonb_build_object(
    'id', fi.id,
    'title', fi.title,
    'cover_url', fi.cover_url,
    'author', fi.author,
    'readers', coalesce(rp.cnt, 0)
  ) into v_trending_book
  from public.feed_items fi
  left join (
    select item_id, count(distinct user_id)::bigint as cnt
    from public.reading_progress
    group by item_id
  ) rp on rp.item_id = fi.id
  where fi.type = 'book'
  order by coalesce(rp.cnt, 0) desc, fi.created_at desc
  limit 1;

  -- 5. Trending audiolite: approved audiolite with most unique listeners
  select jsonb_build_object(
    'id', fi.id,
    'title', fi.title,
    'cover_url', fi.cover_url,
    'author', fi.author,
    'readers', coalesce(rp.cnt, 0)
  ) into v_trending_audio
  from public.feed_items fi
  left join (
    select item_id, count(distinct user_id)::bigint as cnt
    from public.reading_progress
    group by item_id
  ) rp on rp.item_id = fi.id
  where fi.type = 'audiolite'
  order by coalesce(rp.cnt, 0) desc, fi.created_at desc
  limit 1;

  -- 6. Trending gliim: approved post with most views
  select jsonb_build_object(
    'id', g.id,
    'title', g.title,
    'cover_url', g.cover_url,
    'views', g.views
  ) into v_trending_bundle
  from public.feed_gliims g
  where g.status = 'approved'
  order by g.views desc
  limit 1;

  return jsonb_build_object(
    'contest', v_contest,
    'cohort', v_cohort,
    'top3', v_top3,
    'trending_book', v_trending_book,
    'trending_audiolite', v_trending_audio,
    'trending_bundle', v_trending_bundle
  );
end $$;

grant execute on function public.landing_highlights() to anon;
grant execute on function public.landing_highlights() to authenticated;
grant execute on function public.landing_highlights() to service_role;

-- reading_progress and feed_gliims must be readable by anon for the new
-- trending queries to work through the SECURITY INVOKER function.
grant select on public.reading_progress to anon, authenticated;
grant select on public.feed_gliims to anon, authenticated;

-- SELF CHECK
select '01. landing_highlights() returns trending_book' as check_item,
       case when public.landing_highlights() ? 'trending_book' then 'OK' else 'MISSING' end as result
union all
select '02. landing_highlights() returns trending_audiolite',
       case when public.landing_highlights() ? 'trending_audiolite' then 'OK' else 'MISSING' end
union all
select '03. landing_highlights() returns trending_bundle',
       case when public.landing_highlights() ? 'trending_bundle' then 'OK' else 'MISSING' end
union all
select '04. landing_highlights() still returns contest',
       case when public.landing_highlights() ? 'contest' then 'OK' else 'MISSING' end
union all
select '05. landing_highlights() still returns cohort',
       case when public.landing_highlights() ? 'cohort' then 'OK' else 'MISSING' end
union all
select '06. landing_highlights() still returns top3',
       case when public.landing_highlights() ? 'top3' then 'OK' else 'MISSING' end
order by 1;
