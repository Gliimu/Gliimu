-- Rebuild landing_highlights() for the new XpLoRe section:
-- returns the top book, top audiolite (by all-time unique readers)
-- and top 3 gliimaits (by total_gp) for the Events card.

create or replace function public.landing_highlights()
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_top_book    jsonb;
  v_top_audio   jsonb;
  v_top_gliimaits jsonb;
begin
  -- 1. Top book: approved book with most unique readers (all-time)
  select jsonb_build_object(
    'id', fi.id,
    'title', fi.title,
    'cover_url', fi.cover_url,
    'author', fi.author,
    'readers', coalesce(rp.cnt, 0)
  ) into v_top_book
  from public.feed_items fi
  left join (
    select item_id, count(distinct user_id)::bigint as cnt
    from public.reading_progress
    group by item_id
  ) rp on rp.item_id = fi.id
  where fi.type = 'book'
  order by coalesce(rp.cnt, 0) desc, fi.created_at desc
  limit 1;

  -- 2. Top audiolite: approved audiolite with most unique listeners (all-time)
  select jsonb_build_object(
    'id', fi.id,
    'title', fi.title,
    'cover_url', fi.cover_url,
    'author', fi.author,
    'readers', coalesce(rp.cnt, 0)
  ) into v_top_audio
  from public.feed_items fi
  left join (
    select item_id, count(distinct user_id)::bigint as cnt
    from public.reading_progress
    group by item_id
  ) rp on rp.item_id = fi.id
  where fi.type = 'audiolite'
  order by coalesce(rp.cnt, 0) desc, fi.created_at desc
  limit 1;

  -- 3. Top 3 gliimaits by GP (for Events card profile pictures)
  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_top_gliimaits
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

  return jsonb_build_object(
    'top_book', v_top_book,
    'top_audiolite', v_top_audio,
    'top_gliimaits', v_top_gliimaits
  );
end $$;

grant execute on function public.landing_highlights() to anon;
grant execute on function public.landing_highlights() to authenticated;
grant execute on function public.landing_highlights() to service_role;

-- SELF CHECK
select '01. landing_highlights() returns top_book' as check_item,
       case when public.landing_highlights() ? 'top_book' then 'OK' else 'MISSING' end as result
union all
select '02. landing_highlights() returns top_audiolite',
       case when public.landing_highlights() ? 'top_audiolite' then 'OK' else 'MISSING' end
union all
select '03. landing_highlights() returns top_gliimaits',
       case when public.landing_highlights() ? 'top_gliimaits' then 'OK' else 'MISSING' end
union all
select '04. top_gliimaits is an array',
       case when jsonb_typeof(public.landing_highlights() -> 'top_gliimaits') = 'array' then 'OK' else 'MISSING' end
order by 1;
