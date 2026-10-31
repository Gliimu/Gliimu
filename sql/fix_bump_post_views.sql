-- Fix bump_post_views: unique view tracking + GP award
-- Awards 10 GP to post author on each viewer's first unique view
-- Authors cannot earn GP from viewing their own posts

create or replace function public.bump_post_views(p_post uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid;
  v_author uuid;
  v_inserted boolean;
begin
  v_viewer := auth.uid();
  if v_viewer is null then
    return; -- not authenticated
  end if;

  -- Get post author
  select user_id into v_author from public.feed_gliims where id = p_post;
  if v_author is null then
    return; -- post doesn't exist
  end if;

  -- Authors don't earn GP from viewing their own posts
  if v_viewer = v_author then
    return;
  end if;

  -- Try to insert a view record (unique per user+post)
  begin
    insert into public.post_views (user_id, post_id, created_at)
    values (v_viewer, p_post, now());
    v_inserted := true;
  exception when unique_violation then
    v_inserted := false; -- already viewed
  end;

  -- Only increment views and award GP on first unique view
  if v_inserted then
    update public.feed_gliims
    set views = coalesce(views, 0) + 1
    where id = p_post;

    -- Award 10 GP to post author
    perform public.add_gp(v_author, 10);
  end if;
end;
$$;

-- Grant execute to authenticated users only
revoke all on function public.bump_post_views from public;
revoke all on function public.bump_post_views from anon;
grant execute on function public.bump_post_views to authenticated;

-- SELF CHECK
select 'bump_post_views fixed' as check_name,
       (select count(*) = 1 from pg_proc where proname = 'bump_post_views' and prosrc ilike '%post_views%') as passed;
