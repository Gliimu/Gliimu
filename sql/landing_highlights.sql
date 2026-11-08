-- ============================================================
-- Gliimu: landing page highlights
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once.
--
-- WHAT THIS INSTALLS
--   public.landing_highlights() — the single RPC behind the "Latest on
--   Gliimu" block on gliimu.com. It answers with three things:
--     top_book       most-viewed approved gliim that has a document block
--     top_audiolite  most-viewed approved gliim that has an audio block
--     top_gliimaits  the three members with the highest total_gp
--
-- WHY IT IS A FUNCTION AND NOT A QUERY
--   gliimu.com is anonymous, so the caller has no Postgres role of its
--   own to lean on. The function runs as its owner and reads only the
--   three columns it needs, so the landing page never gets a broader
--   window into the library than these cards show.
--
-- TRASHED GLIIMS
--   Every content branch carries "and g.deleted_at is null". A gliim in
--   the Trash is invisible to members, so it must not surface on the
--   public landing page either, and it can come back within the 30 days
--   — see sql/content_trash.sql.
--
-- This file used to live only in the database. It was captured from the
-- live definition, so a fresh install now builds the same function.
-- ============================================================

create or replace function public.landing_highlights()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_top_book      jsonb;
  v_top_audio     jsonb;
  v_top_gliimaits jsonb;
begin
  -- 1. Top book: approved content with document blocks and most views
  select jsonb_build_object(
    'id', g.id,
    'title', g.title,
    'cover_url', g.cover_url,
    'author', p.full_name,
    'views', coalesce(g.views, 0)
  ) into v_top_book
  from public.feed_gliims g
  left join public.profiles p on p.id = g.user_id
  inner join public.feed_gliim_contents c on c.post_id = g.id
  where g.status = 'approved'
    and g.deleted_at is null
    and g.cover_url is not null
    and exists (
      select 1 from jsonb_array_elements(c.blocks) b where b->>'type' = 'document'
    )
  order by coalesce(g.views, 0) desc, g.created_at desc
  limit 1;

  -- 2. Top audiolite: approved content with audio blocks and most views
  select jsonb_build_object(
    'id', g.id,
    'title', g.title,
    'cover_url', g.cover_url,
    'author', p.full_name,
    'views', coalesce(g.views, 0)
  ) into v_top_audio
  from public.feed_gliims g
  left join public.profiles p on p.id = g.user_id
  inner join public.feed_gliim_contents c on c.post_id = g.id
  where g.status = 'approved'
    and g.deleted_at is null
    and g.cover_url is not null
    and exists (
      select 1 from jsonb_array_elements(c.blocks) b where b->>'type' = 'audio'
    )
  order by coalesce(g.views, 0) desc, g.created_at desc
  limit 1;

  -- 3. Top 3 gliimaits by GP
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
end;
$$;

-- Signed out visitors call it, so both web roles need EXECUTE.
grant execute on function public.landing_highlights() to anon;
grant execute on function public.landing_highlights() to authenticated;

-- ============================================================
-- SELF CHECK — three rows, all should read OK
-- ============================================================
-- 1. the function exists and is still security definer
select case when count(*) = 1 and bool_and(p.prosecdef)
  then 'OK' else 'MISSING' end as landing_highlights_fn
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'landing_highlights';

-- 2. anonymous callers may run it
select case when has_function_privilege('anon', 'public.landing_highlights()', 'execute')
  then 'OK' else 'MISSING — the landing page will show an empty highlights block' end
  as anon_can_call;

-- 3. the trashed-gliim guard is really in the body
select case when p.prosrc like '%deleted_at is null%'
  then 'OK' else 'MISSING — trashed gliims can still appear on gliimu.com' end
  as trash_is_excluded
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'landing_highlights';
