-- ===========================================================================
-- sql/archive_gliim_kind.sql — reference copy, DO NOT RUN
-- ===========================================================================
-- The kind classifier (book / audiolite / bundle) was rebuilt in the client as
-- gliimKindOf() in assets/js/views/feed-gliims.js. The database copy had no
-- dependents left, so sql/media_block.sql drops it instead of letting it drift
-- out of step with the new "media" block type.
--
-- Captured verbatim from production project vsgvscemqtqgolrindcx on 2026-11-07
-- with pg_get_functiondef(), immediately before the drop, so it can be
-- reinstated exactly as it stood.
--
-- Note what this version does NOT know: after media_block.sql there are no
-- 'audio' or 'video' block types any more — both are 'media'. Restoring this
-- function unchanged would classify every recording as 'bundle'.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.gliim_kind(p_blocks jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select case
    when p_blocks is null then 'bundle'
    when exists (select 1 from jsonb_array_elements(p_blocks) b where b->>'type' = 'video') then 'bundle'
    when exists (select 1 from jsonb_array_elements(p_blocks) b where b->>'type' = 'audio') then 'audiolite'
    when exists (select 1 from jsonb_array_elements(p_blocks) b where b->>'type' = 'document') then 'book'
    else 'bundle'
  end;
$function$;

-- End of archive.
