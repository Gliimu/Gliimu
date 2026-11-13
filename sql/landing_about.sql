-- sql/landing_about.sql — the landing page gets a company summary, not a shelf
-- Run once on Supabase. Idempotent: running it twice leaves the same shape and
-- the same seeded copy.
--
-- Why: the XpLoRe band on gliimu.com is being replaced by a plain summary of
-- what the company is, sitting under the hero film. The heading and paragraph
-- are Operations-owned text, so they are two new site_settings columns and two
-- new parameters on operations_set_landing — the same pattern the hero texts
-- already use.
--
-- The seed only writes when a column is still NULL, so anything Operations has
-- already typed is never overwritten by re-running this file.
--
-- Both functions are recreated whole. Postgres cannot add a parameter to an
-- existing function, so CREATE OR REPLACE with the old signature would leave
-- the new parameters off. operations_settings() is recreated too because it
-- lists its landing keys by hand — without this the admin fields would render
-- empty even after the columns exist.

-- ============================================================
-- 1. THE TWO COLUMNS
-- ============================================================
-- about_body no longer reaches the landing page: since 2026-11-13 the summary
-- band is a heading, three cards and the live gliims. The column and the
-- Operations field stay so nothing already typed is lost.
alter table public.site_settings add column if not exists about_title text;
alter table public.site_settings add column if not exists about_body text;

-- ============================================================
-- 2. SEED THE DEFAULT COPY
-- ============================================================
update public.site_settings
   set about_title = 'In few words'
 where id = 1 and about_title is null;

-- The heading was 'What Gliimu is' until 2026-11-13. This only re-points the
-- original wording, so a heading Operations has since typed over is left alone.
update public.site_settings
   set about_title = 'In few words'
 where id = 1 and about_title = 'What Gliimu is';

update public.site_settings
   set about_body = 'Gliimu is a library of work people publish themselves. Watch, read and listen to what others put out in the open, then share your own write-ups, recordings and file bundles in a few clicks. When members back a gliim, the creator keeps most of it.'
 where id = 1 and about_body is null;

-- ============================================================
-- 3. operations_settings() — now reports the two new keys
-- ============================================================
create or replace function public.operations_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path TO 'public'
as $function$
declare
  uid       uuid := auth.uid();
  v_has_row boolean;
  v_landing jsonb := jsonb_build_object(
    'hero_video_url', null::text, 'hero_fallback_image_url', null::text, 'squad_bg_url', null::text,
    'hero_title', null::text, 'hero_highlight', null::text, 'hero_desc', null::text,
    'about_title', null::text, 'about_body', null::text);
  v_release jsonb := jsonb_build_object(
    'app_version', null::text, 'app_version_notes', null::text, 'app_download_bg_url', null::text,
    'app_windows_url', null::text, 'app_mac_url', null::text, 'app_linux_url', null::text,
    'app_android_url', null::text, 'app_ios_url', null::text, 'app_mobile_qr_url', null::text);
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if to_regclass('public.site_settings') is null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_TABLE',
      'hint', 'The site_settings table is missing. It holds the landing page media and the app release.');
  end if;

  select exists (select 1 from public.site_settings) into v_has_row;

  if v_has_row then
    select jsonb_build_object(
             'hero_video_url', s.hero_video_url,
             'hero_fallback_image_url', s.hero_fallback_image_url,
             'squad_bg_url', s.squad_bg_url,
             'hero_title', s.hero_title,
             'hero_highlight', s.hero_highlight,
             'hero_desc', s.hero_desc,
             'about_title', s.about_title,
             'about_body', s.about_body),
           jsonb_build_object(
             'app_version', s.app_version,
             'app_version_notes', s.app_version_notes,
             'app_download_bg_url', s.app_download_bg_url,
             'app_windows_url', s.app_windows_url,
             'app_mac_url', s.app_mac_url,
             'app_linux_url', s.app_linux_url,
             'app_android_url', s.app_android_url,
             'app_ios_url', s.app_ios_url,
             'app_mobile_qr_url', s.app_mobile_qr_url)
      into v_landing, v_release
      from (select * from public.site_settings limit 1) s;
  end if;

  return jsonb_build_object(
    'ok', true,
    'has_row', v_has_row,
    'landing', v_landing,
    'release', v_release);
end
$function$;

-- ============================================================
-- 4. operations_set_landing() — two more text parameters
-- ============================================================
-- CREATE OR REPLACE only replaces an EXACT signature match, so the six-argument
-- version that is live today would otherwise stay behind as an overload and
-- every named-argument call from the admin app would come back ambiguous.
drop function if exists public.operations_set_landing(text, text, text, text, text, text);
drop function if exists public.operations_set_landing(text, text, text, text, text, text, text, text);

create or replace function public.operations_set_landing(
  p_hero_video_url       text default null,
  p_hero_fallback_image_url text default null,
  p_squad_bg_url         text default null,
  p_hero_title           text default null,
  p_hero_highlight       text default null,
  p_hero_desc            text default null,
  p_about_title          text default null,
  p_about_body           text default null
)
returns jsonb
language plpgsql
security definer
set search_path TO 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_bad text;
  v_id bigint;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if to_regclass('public.site_settings') is null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_TABLE',
      'hint', 'The site_settings table is missing.');
  end if;

  select f.field into v_bad
    from (values
      ('Hero video',          p_hero_video_url),
      ('Hero fallback image', p_hero_fallback_image_url),
      ('Squad background',    p_squad_bg_url)
    ) as f(field, url)
   where f.url is not null and not public.is_safe_url(f.url)
   limit 1;

  if v_bad is not null then
    return jsonb_build_object('ok', false, 'code', 'BAD_URL', 'field', v_bad,
      'hint', v_bad || ' must start with https://, http:// or a single /.');
  end if;

  select f.field into v_bad
    from (values
      ('Headline lead-in',   p_hero_title,     120),
      ('Highlighted phrase', p_hero_highlight, 120),
      ('Hero description',   p_hero_desc,      400),
      ('Summary heading',    p_about_title,    120),
      ('Summary paragraph',  p_about_body,     600)
    ) as f(field, body, cap)
   where f.body is not null and char_length(btrim(f.body)) > f.cap
   limit 1;

  if v_bad is not null then
    return jsonb_build_object('ok', false, 'code', 'TEXT_TOO_LONG', 'field', v_bad,
      'hint', v_bad || ' is over the character limit. Shorten it and save again.');
  end if;

  -- Supabase preloads pg-safeupdate, which refuses any UPDATE without a WHERE
  -- clause, so the single settings row is looked up by id first.
  select s.id into v_id from public.site_settings s order by s.id limit 1;

  if v_id is null then
    begin
      insert into public.site_settings default values returning id into v_id;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'NO_SETTINGS_ROW',
        'hint', 'site_settings has no row and a blank one could not be created. Insert one by hand, then save again.');
    end;
  end if;

  update public.site_settings
     set hero_video_url = case when p_hero_video_url is null
                               then hero_video_url
                               else nullif(btrim(p_hero_video_url), '') end,
         hero_fallback_image_url = case when p_hero_fallback_image_url is null
                               then hero_fallback_image_url
                               else nullif(btrim(p_hero_fallback_image_url), '') end,
         squad_bg_url = case when p_squad_bg_url is null
                               then squad_bg_url
                               else nullif(btrim(p_squad_bg_url), '') end,
         hero_title = case when p_hero_title is null
                               then hero_title
                               else nullif(btrim(p_hero_title), '') end,
         hero_highlight = case when p_hero_highlight is null
                               then hero_highlight
                               else nullif(btrim(p_hero_highlight), '') end,
         hero_desc = case when p_hero_desc is null
                               then hero_desc
                               else nullif(btrim(p_hero_desc), '') end,
         about_title = case when p_about_title is null
                               then about_title
                               else nullif(btrim(p_about_title), '') end,
         about_body = case when p_about_body is null
                               then about_body
                               else nullif(btrim(p_about_body), '') end
   where id = v_id;

  return public.operations_settings();
end
$function$;

-- ============================================================
-- SELF CHECK — run alone, reads nothing, changes nothing.
-- Every row must say PASS.
-- ============================================================
select '1. about_title column exists' as setting,
       case when exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'site_settings'
            and column_name = 'about_title')
       then 'PASS' else 'CHECK' end as result
union all
select '2. about_body column exists',
       case when exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'site_settings'
            and column_name = 'about_body')
       then 'PASS' else 'CHECK' end
union all
select '3. Heading reads "In few words"',
       case when (select about_title from public.site_settings where id = 1) = 'In few words'
       then 'PASS' else 'CHECK' end
union all
select '4. Summary paragraph seeded',
       case when coalesce((select nullif(btrim(about_body), '') from public.site_settings where id = 1), '') <> ''
       then 'PASS' else 'CHECK' end
union all
select '5. Heading within 120 characters',
       case when coalesce(char_length((select about_title from public.site_settings where id = 1)), 0) <= 120
       then 'PASS' else 'CHECK' end
union all
select '6. Paragraph within 600 characters',
       case when coalesce(char_length((select about_body from public.site_settings where id = 1)), 0) <= 600
       then 'PASS' else 'CHECK' end
union all
-- Postgres would otherwise hold two overloads and the REST call would be ambiguous.
select '7. Only one operations_set_landing overload',
       case when (select count(*) from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'operations_set_landing') = 1
       then 'PASS' else 'CHECK' end
union all
select '8. Saver takes both new parameters',
       case when (select count(*)
                    from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace,
                         unnest(p.proargnames) as t(argname)
                   where n.nspname = 'public'
                     and p.proname = 'operations_set_landing'
                     and t.argname in ('p_about_title', 'p_about_body')) = 2
       then 'PASS' else 'CHECK' end
union all
-- The reader lists its landing keys by hand, so the new columns only reach the
-- admin screen if its body mentions them.
select '9. Reader reports both new keys',
       case when (select (position('about_title' in p.prosrc) > 0
                      and position('about_body'  in p.prosrc) > 0)
                    from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'operations_settings')
       then 'PASS' else 'CHECK' end
union all
select '10. Saver still refuses non-operations roles',
       case when (select prosecdef from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'operations_set_landing')
       then 'PASS' else 'CHECK' end;
