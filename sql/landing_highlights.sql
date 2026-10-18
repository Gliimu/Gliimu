-- landing_highlights()
-- Returns jsonb with daily_top (7 users), latest_post, top_author.
-- Used by the landing page "Latest on Gliimu" section.

create or replace function public.landing_highlights()
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_daily_top jsonb;
  v_latest_post jsonb;
  v_top_author jsonb;
begin
  -- 1. Top 7 users by GP earned today
  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_daily_top
  from (
    select jsonb_build_object(
      'user_id', sub.user_id,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url,
      'gp_earned', sub.earned
    ) as r
    from (
      select user_id, sum(points)::bigint as earned
      from public.transactions
      where points > 0
        and created_at >= date_trunc('day', now())
      group by user_id
      order by earned desc
      limit 7
    ) sub
    join public.profiles p on p.id = sub.user_id
  ) r;

  -- 2. Latest feed item
  select jsonb_build_object(
    'title', fi.title,
    'type', fi.type,
    'cover_url', fi.cover_url,
    'cover_color', fi.cover_color,
    'author', fi.author,
    'author_avatar', fi.author_avatar,
    'created_at', fi.created_at
  ) into v_latest_post
  from public.feed_items fi
  order by fi.created_at desc
  limit 1;

  -- 3. Author of the most-interacted feed item all-time
  select jsonb_build_object(
    'user_id', best.owner_id,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'total_gp', p.total_gp,
    'item_title', best.title,
    'interaction_count', best.cnt
  ) into v_top_author
  from (
    select fi.owner_id, fi.title, count(*)::bigint as cnt
    from public.feed_interactions fi2
    join public.feed_items fi on fi.id = fi2.item_id
    where fi.owner_id is not null
    group by fi.owner_id, fi.title
    order by cnt desc
    limit 1
  ) best
  join public.profiles p on p.id = best.owner_id;

  return jsonb_build_object(
    'daily_top', v_daily_top,
    'latest_post', v_latest_post,
    'top_author', v_top_author
  );
end $$;

grant execute on function public.landing_highlights() to anon;
grant execute on function public.landing_highlights() to authenticated;
grant execute on function public.landing_highlights() to service_role;
