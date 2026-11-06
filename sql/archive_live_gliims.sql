-- ===========================================================================
-- sql/archive_live_gliims.sql — reference copy, DO NOT RUN
-- ===========================================================================
-- The live gliim (a session published as an XpLoRe card) was removed on
-- 2026-11-06 and sql/remove_live_gliims.sql drops it. This file holds the
-- pieces of that feature that existed only inside the database, captured
-- verbatim from production before the drop, so the feature could be rebuilt
-- from source.
--
-- The rest of the bodies are already archived in sql/live_gliim.sql and
-- sql/live_on_air.sql (both marked "RETIRED — archive copy only").
--
-- Captured 2026-11-06 from project vsgvscemqtqgolrindcx. At capture time the
-- table held 0 rows and 0 sessions were open or active.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- public.bump_live_views(p_request uuid) -> integer
--
-- Counted a host's own views of their published live card.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_live_views(p_request uuid)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.live_requests
  set poster_views = poster_views + 1
  where id = p_request
    and user_id = auth.uid()
  returning poster_views;
$function$;

-- ---------------------------------------------------------------------------
-- public.live_gliim_links — session <-> card join table
--
-- Service-only: RLS was enabled with no policies, and only service_role and
-- postgres held grants, so no client could read it directly.
-- ---------------------------------------------------------------------------
create table if not exists public.live_gliim_links (
  session_id uuid not null primary key references public.live_requests(id) on delete cascade,
  post_id    uuid not null unique         references public.feed_gliims(id) on delete cascade,
  user_id    uuid not null                references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.live_gliim_links enable row level security;

create index if not exists idx_live_gliim_links_user on public.live_gliim_links using btree (user_id);

-- Grants as they stood (public/anon/authenticated had none):
--   grant all on table public.live_gliim_links to service_role, postgres;
