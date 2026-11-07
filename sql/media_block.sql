-- Media block merge: audio + video -> one "media" block type, plus covers.
--
-- The composer now shows one Media tile; the file's own extension decides
-- whether the reader renders a <video> or an <audio> player. This script
-- renames the stored block types to match, and backfills a cover for gliims
-- published before a cover was compulsory.
--
-- Safe to run more than once. The dashboard already understands both the old
-- and the new names, so it keeps working before this runs and after it.
--
-- Nothing is deleted. Only the "type" key inside a block changes, and
-- cover_url is filled where it was blank.

begin;

-- 1. Relabel audio/video block elements as "media", in place, keeping every
--    other key (content, caption, metadata) and the original block order.
update feed_gliim_contents c
set blocks = (
      select jsonb_agg(
               case when elem ->> 'type' in ('audio', 'video')
                    then jsonb_set(elem, '{type}', '"media"', false)
                    else elem
               end
               order by ord
             )
      from jsonb_array_elements(c.blocks) with ordinality as t(elem, ord)
    )
where jsonb_typeof(c.blocks) = 'array'
  and exists (
        select 1
        from jsonb_array_elements(c.blocks) as b
        where b ->> 'type' in ('audio', 'video')
      );

-- 2. Cover backfill: a gliim with no cover takes the first image block in its
--    body, or the cover a document block already carries. Anything with
--    neither is left blank on purpose — no invented artwork.
update feed_gliims g
set cover_url = src.cover
from (
      select c.post_id,
             coalesce(
               (select b ->> 'content'
                from jsonb_array_elements(c.blocks) as b
                where b ->> 'type' = 'image'
                  and coalesce(b ->> 'content', '') like 'http%'
                limit 1),
               (select b ->> 'cover_url'
                from jsonb_array_elements(c.blocks) as b
                where b ->> 'type' = 'document'
                  and coalesce(b ->> 'cover_url', '') like 'http%'
                limit 1)
             ) as cover
      from feed_gliim_contents c
      where jsonb_typeof(c.blocks) = 'array'
    ) src
where src.post_id = g.id
  and coalesce(g.cover_url, '') = ''
  and coalesce(src.cover, '') like 'http%';

-- 3. The kind classifier lives in the client now (gliimKindOf in feed-gliims.js).
--    The database copy has no dependents, so drop it rather than let it drift.
drop function if exists public.gliim_kind(jsonb);

commit;


-- =============================================================================
-- SELF CHECK
-- Paste everything from "select 'a' ..." down and run it on its own.
-- Every row must show "pass". One "FAIL" means stop and report the grid.
-- =============================================================================
select 'a' as check_id,
       'No audio or video block types left' as what,
       (select count(*)
        from feed_gliim_contents c
        cross join lateral jsonb_array_elements(c.blocks) as b
        where jsonb_typeof(c.blocks) = 'array'
          and b ->> 'type' in ('audio', 'video'))::text as value,
       case when (select count(*)
                  from feed_gliim_contents c
                  cross join lateral jsonb_array_elements(c.blocks) as b
                  where jsonb_typeof(c.blocks) = 'array'
                    and b ->> 'type' in ('audio', 'video')) = 0
            then 'pass' else 'FAIL' end as result

union all
select 'b',
       'No body was wiped (every blocks is still an array)',
       (select count(*)::text
        from feed_gliim_contents
        where blocks is null or jsonb_typeof(blocks) <> 'array'),
       case when (select count(*)
                  from feed_gliim_contents
                  where blocks is null or jsonb_typeof(blocks) <> 'array') = 0
            then 'pass' else 'FAIL' end

union all
select 'c',
       'Every media block points at a real file',
       (select count(*)::text
        from feed_gliim_contents c
        cross join lateral jsonb_array_elements(c.blocks) as b
        where b ->> 'type' = 'media'
          and coalesce(b ->> 'content', '') not like 'http%'),
       case when (select count(*)
                  from feed_gliim_contents c
                  cross join lateral jsonb_array_elements(c.blocks) as b
                  where b ->> 'type' = 'media'
                    and coalesce(b ->> 'content', '') not like 'http%') = 0
            then 'pass' else 'FAIL' end

union all
select 'd',
       'No cover points at a video file',
       (select count(*)::text
        from feed_gliims
        where coalesce(cover_url, '') ~* '\.(mp4|m4v|mov|webm|avi|mkv|3gp)([?#]|$)'),
       case when (select count(*)
                  from feed_gliims
                  where coalesce(cover_url, '') ~* '\.(mp4|m4v|mov|webm|avi|mkv|3gp)([?#]|$)') = 0
            then 'pass' else 'FAIL' end

union all
select 'e',
       'Old database kind classifier is gone',
       (select count(*)::text
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'gliim_kind'),
       case when (select count(*)
                  from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'gliim_kind') = 0
            then 'pass' else 'FAIL' end

union all
select 'f',
       'Recordings now stored as media blocks',
       (select count(*)::text
        from feed_gliim_contents c
        cross join lateral jsonb_array_elements(c.blocks) as b
        where b ->> 'type' = 'media'),
       'informational'

union all
select 'g',
       'Gliims still without a cover (they render blank)',
       (select count(*)::text
        from feed_gliims g
        join feed_gliim_contents c on c.post_id = g.id
        where coalesce(g.cover_url, '') = ''),
       'informational'

order by 1;
