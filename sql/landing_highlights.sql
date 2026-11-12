-- ============================================================
-- Gliimu: landing page highlights
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once.
--
-- WHAT THIS INSTALLS
--   public.landing_highlights() — the single RPC behind the XpLoRe block
--   and the cohort strip on gliimu.com. It answers with three things:
--     top_log        the gliim that renders as a play-badge square in XpLoRe
--     top_book       the gliim that renders as a 3:4 cover in XpLoRe
--     top_bundle     the gliim that renders as a wide card in XpLoRe
--     top_cohort     the open cohort, plus the faces of the members who got in
--
-- WHY THE THREE CARDS ARE THE THREE KINDS
--   The landing cards are the feed cards. Each one is picked by exactly the
--   rule gliimKindOf() applies in public/dashboard/assets/js/views/gliims.js,
--   so whatever the landing page shows really does look like that shape inside
--   XpLoRe. The rules are mutually exclusive by construction, so one gliim can
--   never appear on two cards:
--     log     every block is a recording
--     book    at least one document block that is NOT a PDF, and no media
--     bundle  has blocks, and is neither of the two above
--   The PDF test is copied too (type 'pdf', or a 'document' whose is_pdf flag
--   is true or whose content path ends in .pdf). Before this script the book
--   branch only asked "has a document block", so a bundle holding a PDF was
--   being advertised as a publication.
--
-- WHY THE OLD top_book RULE WAS TIGHTENED
--   A library of nothing but PDFs therefore returns no publication card, and
--   the card stays blank. That is the intended answer: a blank card is honest,
--   a mislabelled one is not.
--
-- WHY THE THIRD CARD USED TO BE AN EVENT AND NOW A BUNDLE
--   Events were removed from the product on 2026-10-22. The cohort moved out
--   of the cards altogether and became the sticky strip under the hero, so the
--   third slot is free for the third real content kind.
--
-- WHY THE COHORT IS A STRIP AND NOT A CARD
--   One cohort is active at a time (the partial unique index in
--   sql/cohorts.sql allows exactly one 'active' row), so it does not need a
--   slot in a three-card grid. It sits under the hero, pinned to the top of
--   the window as the visitor scrolls, and carries the faces of the people
--   already inside — which is the only part of a cohort that persuades anyone.
--
-- WHOSE FACES APPEAR
--   Only members the Operations admin has ACCEPTED, i.e. rows in
--   public.cohort_interest with status = 'approved'. Showing everyone who
--   raised a hand was considered and rejected: raising a hand is a member's
--   private intent, and publishing it to anonymous visitors would tell the
--   world what that person wanted. An accepted member is a student of the
--   cohort, and a cohort without students is an advertisement, so the strip
--   counts and shows accepted members only.
--   The faces are avatar URLs and nothing else — no name, no user id. Names
--   stay off this payload; self-check row 6 fails loudly if one rides along.
--   Six faces at most, because past that the overlapping row becomes a blob
--   and the count pill already tells the true number.
--
-- WHAT IS NEVER IN THIS PAYLOAD
--   requirements_url. sql/cohorts.sql revokes every privilege on
--   public.cohorts from anon and authenticated and hands the PDF out only
--   through get_active_cohort(), so the landing page must not learn what a
--   cohort asks of a member. This function runs as its owner, which means it
--   CAN read that column — which is exactly why it is left out.
--   top_gliimaits was also removed on this pass. Nothing in the repo ever
--   read it (only main.js calls this RPC), and it published three members'
--   full names and GP totals to anonymous visitors for no reason.
--
-- strip_visible
--   The Operations hide-switch for the strip (sql/cohorts_strip.sql) is
--   honoured here as well as in get_active_cohort(): when an admin hides the
--   strip, it disappears from gliimu.com too, not just from the member app.
--
-- TRASHED GLIIMS
--   Every content branch carries "and g.deleted_at is null". A gliim in
--   the Trash is invisible to members, so it must not surface on the
--   public landing page either, and it can come back within the 30 days
--   — see sql/content_trash.sql.
--
-- ORDER OF DEPLOYMENT
--   Safe in either order. If this script runs before the gliimu.com deploy,
--   the new top_bundle key simply goes unread and the extra cohort keys are
--   ignored. If the deploy lands first, the missing keys read as empty and
--   those cards and the strip stay blank until this script is run.
-- ============================================================

create or replace function public.landing_highlights()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_top_book   jsonb;
  v_top_log    jsonb;
  v_top_bundle jsonb;
  v_top_cohort jsonb;
begin
  -- 1. Log — every block is a recording. Square card, play badge.
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

  -- 2. Book — a non-PDF document block and no recordings. 3:4 cover card.
  --    Every PDF test is coalesced: a block with no is_pdf key must read as
  --    "not a PDF", not as unknown, or NOT(...) collapses to NULL and the
  --    whole book branch silently matches nothing.
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
    and jsonb_typeof(c.blocks) = 'array'
    and jsonb_array_length(c.blocks) > 0
    and exists (
      select 1 from jsonb_array_elements(c.blocks) b
      where b->>'type' = 'document'
        and not (
          coalesce(b->>'type', '') = 'pdf'
          or coalesce(b->>'is_pdf', '') = 'true'
          or coalesce(b->>'content', '') ~* '\.pdf($|[?#])'
        )
    )
    and not exists (
      select 1 from jsonb_array_elements(c.blocks) b
      where coalesce(b->>'type', '') in ('media', 'audio', 'video')
    )
  order by coalesce(g.views, 0) desc, g.created_at desc
  limit 1;

  -- 3. Bundle — has blocks, and is neither of the two above. Wide card with
  --    cover, title, author row, views and comments, exactly like the feed.
  select jsonb_build_object(
    'id', g.id,
    'title', g.title,
    'description', g.description,
    'cover_url', g.cover_url,
    'author', p.full_name,
    'author_avatar', p.avatar_url,
    'created_at', g.created_at,
    'views', coalesce(g.views, 0),
    'comments', (
      select count(*) from public.feed_interactions i
      where i.post_id = g.id and i.interaction_type = 'comment'
    )
  ) into v_top_bundle
  from public.feed_gliims g
  left join public.profiles p on p.id = g.user_id
  inner join public.feed_gliim_contents c on c.post_id = g.id
  where g.status = 'approved'
    and g.deleted_at is null
    and g.cover_url is not null
    and jsonb_typeof(c.blocks) = 'array'
    and jsonb_array_length(c.blocks) > 0
    -- not a log: at least one block is not a recording
    and exists (
      select 1 from jsonb_array_elements(c.blocks) b
      where coalesce(b->>'type', '') not in ('media', 'audio', 'video')
    )
    -- not a book
    and not (
      exists (
        select 1 from jsonb_array_elements(c.blocks) b
        where b->>'type' = 'document'
          and not (
            coalesce(b->>'type', '') = 'pdf'
            or coalesce(b->>'is_pdf', '') = 'true'
            or coalesce(b->>'content', '') ~* '\.pdf($|[?#])'
          )
      )
      and not exists (
        select 1 from jsonb_array_elements(c.blocks) b
        where coalesce(b->>'type', '') in ('media', 'audio', 'video')
      )
    )
  order by coalesce(g.views, 0) desc, g.created_at desc
  limit 1;

  -- 4. The open cohort for the sticky strip. accepted_count is the number
  --    that shows in the pill; members are the accepted faces, oldest
  --    acceptance first, capped at six, and blank where a member has no
  --    avatar rather than being filled in with anything invented.
  select jsonb_build_object(
    'id', c.id,
    'title', c.title,
    'strip_label', c.strip_label,
    'required_count', c.required_count,
    'accepted_count', (
      select count(*) from public.cohort_interest ci
      where ci.cohort_id = c.id and ci.status = 'approved'
    ),
    'due_date', c.due_date,
    'members', (
      select coalesce(
               jsonb_agg(
                 jsonb_build_object('avatar_url', p.avatar_url)
                 order by x.decided_at nulls last, x.created_at
               ),
               '[]'::jsonb)
      from (
        select ci.user_id, ci.decided_at, ci.created_at
        from public.cohort_interest ci
        where ci.cohort_id = c.id and ci.status = 'approved'
        order by ci.decided_at nulls last, ci.created_at
        limit 6
      ) x
      join public.profiles p on p.id = x.user_id
      where p.avatar_url is not null
    )
  ) into v_top_cohort
  from public.cohorts c
  where c.status = 'active'
    and coalesce(c.strip_visible, true)
  limit 1;

  return jsonb_build_object(
    'top_log', v_top_log,
    'top_book', v_top_book,
    'top_bundle', v_top_bundle,
    'top_cohort', v_top_cohort
  );
end;
$$;

-- Signed out visitors call it, so both web roles need EXECUTE.
grant execute on function public.landing_highlights() to anon;
grant execute on function public.landing_highlights() to authenticated;

-- ============================================================
-- SELF CHECK — eight answers, the first seven should read OK
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

-- 4. the payload carries the three kinds plus the cohort, and none of the
--    dead keys that used to be in it
select case when jsonb_exists(landing_highlights(), 'top_log')
            and jsonb_exists(landing_highlights(), 'top_book')
            and jsonb_exists(landing_highlights(), 'top_bundle')
            and jsonb_exists(landing_highlights(), 'top_cohort')
            and not jsonb_exists(landing_highlights(), 'top_audiolite')
            and not jsonb_exists(landing_highlights(), 'top_event')
            and not jsonb_exists(landing_highlights(), 'top_gliimaits')
  then 'OK' else 'MISSING — this script did not replace the function' end
  as payload_keys;

-- 5. the cohort PDF link did not ride along in the payload
select case when jsonb_exists(landing_highlights() -> 'top_cohort', 'requirements_url')
  then 'LEAKED — the requirements link is public, re-run the script'
  else 'OK' end
  as cohort_stays_private;

-- 6. no accepted member is named in the payload, only their face
select case when (landing_highlights() -> 'top_cohort' -> 'members') @? '$[*].full_name'
            or (landing_highlights() -> 'top_cohort' -> 'members') @? '$[*].user_id'
            or (landing_highlights() -> 'top_cohort' -> 'members') @? '$[*].name'
  then 'LEAKED — a member identity is in the strip payload, re-run the script'
  else 'OK' end
  as members_stay_anonymous;

-- 7. the strip counts accepted members, not everyone who raised a hand
select case when p.prosrc ilike '%ci.status = ''approved''%'
  then 'OK' else 'MISSING — the strip may be counting people who were never accepted' end
  as approved_only
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'landing_highlights';

-- 8. what the three cards and the strip point at right now
select coalesce(landing_highlights() -> 'top_log'    ->> 'title', '(blank)') as log_card,
       coalesce(landing_highlights() -> 'top_book'   ->> 'title', '(blank)') as publication_card,
       coalesce(landing_highlights() -> 'top_bundle' ->> 'title', '(blank)') as bundle_card,
       coalesce(landing_highlights() -> 'top_cohort' ->> 'title',
                '(no cohort is shown — the strip is hidden)')                as cohort_strip,
       coalesce((landing_highlights() -> 'top_cohort' -> 'accepted_count') #>> '{}', '0')
        || ' / ' ||
       coalesce((landing_highlights() -> 'top_cohort' -> 'required_count') #>> '{}', '0')
        || ' seats, ' ||
       coalesce(jsonb_array_length(landing_highlights() -> 'top_cohort' -> 'members'), 0)
        || ' faces' as strip_counts;
