-- ============================================================
-- Gliimu: landing page highlights
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once.
--
-- WHAT THIS INSTALLS
--   public.landing_highlights() — the single RPC behind the XpLoRe block
--   on gliimu.com. It answers with three things:
--     top_book       most-viewed approved gliim that has a document block
--     top_log        most-viewed approved gliim made of media blocks only
--     top_gliimaits  the three members with the highest total_gp
--
-- WHY "LOG" AND NOT "AUDIOLITE"
--   The separate audio and video blocks were merged into one Media block, so
--   the block type is now 'media' and the card is the one with the play badge.
--   The old branch looked for b->>'type' = 'audio', which no row has ever
--   matched since the merge, so the card was permanently empty. A log is
--   media-only from top to bottom — the same rule gliimKindOf() applies in
--   public/dashboard/assets/js/views/gliims.js — so a bundle that merely
--   carries a recording stays a bundle and never pretends to be a log.
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
--
-- ORDER OF DEPLOYMENT
--   Safe to run before or after the gliimu.com deploy: the card reads
--   data.top_log, and a missing key only means the card shows its
--   play-icon placeholder, which is exactly what it does today.
-- ============================================================

create or replace function public.landing_highlights()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_top_book      jsonb;
  v_top_log       jsonb;
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

  -- 2. Top log: approved content made only of media blocks, most views
  select jsonb_build_object(
    'id', g.id,
    'title', g.title,
    'cover_url', g.cover_url,
    'author', p.full_name,
    'views', coalesce(g.views, 0)
  ) into v_top_log
  from public.feed_gliims g
  left join public.profiles p on p.id = g.user_id
  inner join public.feed_gliim_contents c on c.post_id = g.id
  where g.status = 'approved'
    and g.deleted_at is null
    and g.cover_url is not null
    and jsonb_typeof(c.blocks) = 'array'
    and jsonb_array_length(c.blocks) > 0
    and not exists (
      select 1 from jsonb_array_elements(c.blocks) b
      where coalesce(b->>'type', '') not in ('media', 'audio', 'video')
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
    'top_log', v_top_log,
    'top_gliimaits', v_top_gliimaits
  );
end;
$$;

-- Signed out visitors call it, so both web roles need EXECUTE.
grant execute on function public.landing_highlights() to anon;
grant execute on function public.landing_highlights() to authenticated;

-- ============================================================
-- SELF CHECK — five answers, the first four should read OK
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

-- 4. the payload carries the log key and no longer carries the audiolite one
select case when jsonb_exists(landing_highlights(), 'top_log')
            and not jsonb_exists(landing_highlights(), 'top_audiolite')
  then 'OK' else 'MISSING — this script did not replace the function' end
  as payload_renamed;

-- 5. what the Logs card points at right now
select coalesce(landing_highlights() -> 'top_log' ->> 'title',
                '(no approved log with a cover yet — the card shows its play-icon placeholder)')
  as top_log_title;
