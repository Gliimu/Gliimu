-- ============================================================
-- ONBOARDING TOUR — copy refresh (tokens era) + the Alerts step
-- 2026-11-19. The tour still described the Gliits world: Live said
-- "they join you with Gliits", Billing said "G100 welcome bonus",
-- nothing said what reading costs, and Alerts had no step at all.
-- Reading and Live are now metered from the Config rate and member
-- copy calls the currency tokens, so four bodies are rewritten,
-- Publish gains the earning line, and one page is added.
--
-- Ops-edit safe: every UPDATE only fires while the stored body is
-- STILL the old shipped default. If Operations has reworded a step
-- in the admin Onboarding tour tab, that row is left alone and
-- check 6/13 says so instead of silently overwriting it.
-- Idempotent: a second run finds no matching old text and changes
-- nothing.
--
-- Run order: any time. Nothing is tied to a client deploy — app.js
-- reads route/title/body/position, so the new words show on the
-- next tour.
-- ============================================================

-- ------------------------------------------------------------
-- 1. REWORD — four stale bodies, one new line each.
-- ------------------------------------------------------------

update public.onboarding_steps
set body = 'Your home feed. Everything published on Gliimu lands here — read gliims, subscribe to creators and save what you love. On Pay n'' Go, reading costs tokens by the minute.',
    updated_at = now()
where route = '/xplore'
  and body = 'Your home feed. Everything published on Gliimu lands here — browse gliims, subscribe to creators and save what you love.';

update public.onboarding_steps
set body = 'Your writing studio. Gliims you publish here appear in XpLoRe for everyone to read, and you earn tokens every minute someone spends on them.',
    updated_at = now()
where route = '/publish'
  and body = 'Your writing studio. Gliims you publish here appear in XpLoRe for everyone to read.';

update public.onboarding_steps
set body = 'Go on air. Host a session and invite your audience in. Viewers pay by the minute to watch, and you earn for every minute you are live — hosting costs you nothing.',
    updated_at = now()
where route = '/live'
  and body = 'Go on air. Host a session, invite your audience in, and they join you with Gliits.';

update public.onboarding_steps
set body = 'Your token balance. Tokens pay for reading, live sessions and supporting creators. Top up, switch plan or send tokens to another member here, and your balance opens with a 100-token welcome bonus from us.',
    updated_at = now()
where route = '/wallet'
  and body = 'Your Gliits wallet — the currency that pays for live sessions and supports creators. Your wallet starts with a G100 welcome bonus from us.';

-- ------------------------------------------------------------
-- 2. ADD — Alerts, the page the tour never described.
--    Position 8, so the seven steps already in place keep the
--    order Operations may have tuned. on conflict do nothing: a
--    re-run never clobbers an edited Alerts step.
-- ------------------------------------------------------------

insert into public.onboarding_steps (route, title, body, position) values
  ('/alerts', 'Alerts',
   'Your notices. Wallet credits, reading receipts, mentions and messages from the Gliimu team all land here.',
   8)
on conflict (route) do nothing;

-- ------------------------------------------------------------
-- 3. SELF-CHECK — zero edits needed.
--    All pass  -> the grid prints, every line PASS.
--    Any fail  -> the batch aborts and the error names every
--                 failing check with its actual value.
-- ------------------------------------------------------------

create temp table if not exists pg_temp.tour_check (
  n integer, label text, actual text, expected text
);
truncate pg_temp.tour_check;

do $$
declare
  v_rows      text := (select count(*)::text from public.onboarding_steps);
  v_enabled   text := (select count(*)::text from public.onboarding_steps where is_enabled);
  v_holes     text := (select count(*)::text from generate_series(1, 8) p
                        where not exists (select 1 from public.onboarding_steps s
                                          where s."position" = p));
  v_dups      text := (select count(*)::text from (select "position" from public.onboarding_steps
                          group by "position" having count(*) > 1) d);
  v_offgrid   text := (select count(*)::text from public.onboarding_steps
                        where route not in ('/xplore', '/publish', '/live', '/ping',
                                            '/profile', '/wallet', '/settings', '/alerts'));
  v_stale     text := (select count(*)::text from public.onboarding_steps
                        where is_enabled
                          and (body like '%Gliits%' or body like '%G100%'
                               or body like '%GP%' or body like '%follow creators%'));
  v_xplore    text := (select count(*)::text from public.onboarding_steps
                        where route = '/xplore' and body like '%read gliims%');
  v_publish   text := (select count(*)::text from public.onboarding_steps
                        where route = '/publish' and body like '%earn tokens%');
  v_live      text := (select count(*)::text from public.onboarding_steps
                        where route = '/live' and body like '%Viewers pay by the minute%');
  v_wallet    text := (select count(*)::text from public.onboarding_steps
                        where route = '/wallet' and body like '%token balance%');
  v_alerts    text := (select count(*)::text from public.onboarding_steps
                        where route = '/alerts' and body like '%notices%');
  v_short     text := (select count(*)::text from public.onboarding_steps
                        where char_length(trim(body)) < 20);
  v_untouched text := (select count(*)::text from public.onboarding_steps
                        where body in ('Your home feed. Everything published on Gliimu lands here — browse gliims, subscribe to creators and save what you love.',
                                       'Your writing studio. Gliims you publish here appear in XpLoRe for everyone to read.',
                                       'Go on air. Host a session, invite your audience in, and they join you with Gliits.',
                                       'Your Gliits wallet — the currency that pays for live sessions and supports creators. Your wallet starts with a G100 welcome bonus from us.'));
begin
  insert into pg_temp.tour_check values
    ( 1, 'steps in the table',            v_rows,      '8'),
    ( 2, 'enabled steps',                 v_enabled,   '8'),
    ( 3, 'missing positions 1-8',         v_holes,     '0'),
    ( 4, 'duplicated positions',          v_dups,      '0'),
    ( 5, 'off-grid routes',               v_offgrid,   '0'),
    ( 6, 'stale words left (Gliits/G100/GP)', v_stale, '0'),
    ( 7, 'xplore says read gliims',       v_xplore,    '1'),
    ( 8, 'publish says earn tokens',      v_publish,   '1'),
    ( 9, 'live says viewers pay',         v_live,      '1'),
    (10, 'billing says token balance',    v_wallet,    '1'),
    (11, 'alerts step exists',            v_alerts,    '1'),
    (12, 'bodies under 20 characters',    v_short,     '0'),
    (13, 'rows this script skipped',      v_untouched, '0');

  if v_rows <> '8' or v_enabled <> '8' or v_holes <> '0' or v_dups <> '0'
     or v_offgrid <> '0' or v_stale <> '0' or v_xplore <> '1' or v_publish <> '1'
     or v_live <> '1' or v_wallet <> '1' or v_alerts <> '1' or v_short <> '0'
     or v_untouched <> '0' then
    raise exception 'TOUR COPY SELF-CHECK FAILED: %',
      (select string_agg(label || ' = ' || actual || ' (want ' || expected || ')', '; ')
         from pg_temp.tour_check
        where actual <> expected);
  end if;
end $$;

select n as no,
       label,
       actual,
       expected,
       case when actual = expected then 'PASS' else 'FAIL' end as status
  from pg_temp.tour_check
  order by n;

-- ------------------------------------------------------------
-- SHOW THE RESULT — what members will read, in walk order.
-- ------------------------------------------------------------

select s."position" as pos, s.route, s.title, s.body
  from public.onboarding_steps s
  where s.is_enabled
  order by s."position";
