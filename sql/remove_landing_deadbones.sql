-- ============================================================
-- REMOVE LANDING-PAGE DEADBONES (DESTRUCTIVE — run once)
-- ============================================================
-- gliimu.com no longer shows a partner wall, a company-summary heading, a
-- squad background, a download QR code or an earnings image. Terms come from
-- legal_documents, not from site_settings. This script deletes what those
-- features left behind in the database:
--
--   DROPPED TABLE       public.partners
--   DROPPED FUNCTIONS   operations_partners(), operations_add_partner(),
--                       operations_update_partner(), operations_remove_partner(),
--                       operations_set_partner_order(), landing_highlights(),
--                       top_uploader()
--   DROPPED COLUMNS     site_settings.about_title, about_body, squad_bg_url,
--                       earnings_image_url, app_mobile_qr_url,
--                       terms_content, terms_updated_at
--   REWRITTEN           operations_settings(), operations_set_landing(),
--                       operations_set_release() — same job, fewer keys.
--
-- RUN ORDER MATTERS. The three Operations RPCs name the dead columns inside
-- their bodies, so they are rebuilt FIRST; if you drop the columns before the
-- functions, the admin Operations screen breaks the moment anyone presses Save.
--
-- Precondition: the deployed admin app must already be the version that sends
-- 5 landing fields and 8 release fields. If it is not, the new RPCs get called
-- with parameters they no longer declare and PostgREST rejects the call.
--
-- Everything here is idempotent — running it twice is safe. Section 1 prints
-- what is about to disappear, so copy that output somewhere before you run
-- sections 2 onward if you ever want the partner list back.
-- ============================================================


-- ============================================================
-- 1. ARCHIVE — read-only. Copy the two result grids out first.
-- ============================================================

select id, name, logo_url, display_order, created_at
  from public.partners
 order by display_order, created_at;

select about_title, about_body, squad_bg_url, earnings_image_url,
       app_mobile_qr_url, terms_content, terms_updated_at
  from public.site_settings
 order by id;


-- ============================================================
-- 2. REBUILD THE OPERATIONS RPCs WITHOUT THE DEAD KEYS
-- ============================================================

-- The old overloads take the dead parameters. Drop them so PostgREST cannot
-- pick one by accident, then create the surviving shape.
drop function if exists public.operations_set_landing(text,text,text,text,text,text,text,text);
drop function if exists public.operations_set_release(text,text,text,text,text,text,text,text,text);

create or replace function public.operations_settings()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $fn$
declare
  uid       uuid := auth.uid();
  v_has_row boolean;
  v_landing jsonb := jsonb_build_object(
    'hero_video_url', null::text, 'hero_fallback_image_url', null::text,
    'hero_title', null::text, 'hero_highlight', null::text, 'hero_desc', null::text);
  v_release jsonb := jsonb_build_object(
    'app_version', null::text, 'app_version_notes', null::text, 'app_download_bg_url', null::text,
    'app_windows_url', null::text, 'app_mac_url', null::text, 'app_linux_url', null::text,
    'app_android_url', null::text, 'app_ios_url', null::text);
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
             'hero_title', s.hero_title,
             'hero_highlight', s.hero_highlight,
             'hero_desc', s.hero_desc),
           jsonb_build_object(
             'app_version', s.app_version,
             'app_version_notes', s.app_version_notes,
             'app_download_bg_url', s.app_download_bg_url,
             'app_windows_url', s.app_windows_url,
             'app_mac_url', s.app_mac_url,
             'app_linux_url', s.app_linux_url,
             'app_android_url', s.app_android_url,
             'app_ios_url', s.app_ios_url)
      into v_landing, v_release
      from (select * from public.site_settings limit 1) s;
  end if;

  return jsonb_build_object(
    'ok', true,
    'has_row', v_has_row,
    'landing', v_landing,
    'release', v_release);
end
$fn$;


create or replace function public.operations_set_landing(
  p_hero_video_url         text default null,
  p_hero_fallback_image_url text default null,
  p_hero_title             text default null,
  p_hero_highlight         text default null,
  p_hero_desc              text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
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
      ('Hero fallback image', p_hero_fallback_image_url)
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
      ('Hero description',   p_hero_desc,      400)
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
         hero_title = case when p_hero_title is null
                               then hero_title
                               else nullif(btrim(p_hero_title), '') end,
         hero_highlight = case when p_hero_highlight is null
                               then hero_highlight
                               else nullif(btrim(p_hero_highlight), '') end,
         hero_desc = case when p_hero_desc is null
                               then hero_desc
                               else nullif(btrim(p_hero_desc), '') end
   where id = v_id;

  return public.operations_settings();
end
$fn$;


create or replace function public.operations_set_release(
  p_app_version        text default null,
  p_app_version_notes  text default null,
  p_app_download_bg_url text default null,
  p_app_windows_url    text default null,
  p_app_mac_url        text default null,
  p_app_linux_url      text default null,
  p_app_android_url    text default null,
  p_app_ios_url        text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
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

  if p_app_version is not null and char_length(btrim(p_app_version)) > 40 then
    return jsonb_build_object('ok', false, 'code', 'VERSION_TOO_LONG',
      'hint', 'Keep the version under 40 characters, e.g. 1.4.0');
  end if;
  if p_app_version_notes is not null and char_length(btrim(p_app_version_notes)) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'NOTES_TOO_LONG',
      'hint', 'Keep the release notes under 2000 characters.');
  end if;

  select f.field into v_bad
    from (values
      ('Download background', p_app_download_bg_url),
      ('Windows link',        p_app_windows_url),
      ('Mac link',            p_app_mac_url),
      ('Linux link',          p_app_linux_url),
      ('Android link',        p_app_android_url),
      ('iOS link',            p_app_ios_url)
    ) as f(field, url)
   where f.url is not null and not public.is_safe_url(f.url)
   limit 1;

  if v_bad is not null then
    return jsonb_build_object('ok', false, 'code', 'BAD_URL', 'field', v_bad,
      'hint', v_bad || ' must start with https://, http:// or a single /.');
  end if;

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
     set app_version = case when p_app_version is null
                            then app_version
                            else nullif(btrim(p_app_version), '') end,
         app_version_notes = case when p_app_version_notes is null
                            then app_version_notes
                            else nullif(btrim(p_app_version_notes), '') end,
         app_download_bg_url = case when p_app_download_bg_url is null
                            then app_download_bg_url
                            else nullif(btrim(p_app_download_bg_url), '') end,
         app_windows_url = case when p_app_windows_url is null
                            then app_windows_url
                            else nullif(btrim(p_app_windows_url), '') end,
         app_mac_url = case when p_app_mac_url is null
                            then app_mac_url
                            else nullif(btrim(p_app_mac_url), '') end,
         app_linux_url = case when p_app_linux_url is null
                            then app_linux_url
                            else nullif(btrim(p_app_linux_url), '') end,
         app_android_url = case when p_app_android_url is null
                            then app_android_url
                            else nullif(btrim(p_app_android_url), '') end,
         app_ios_url = case when p_app_ios_url is null
                            then app_ios_url
                            else nullif(btrim(p_app_ios_url), '') end
   where id = v_id;

  return public.operations_settings();
end
$fn$;

-- The three Operations RPCs are for signed-in staff only. landing_highlights()
-- used to be the one public landing RPC; it is gone below, so nothing here
-- needs anon access.
revoke execute on function public.operations_settings()                          from public;
revoke execute on function public.operations_set_landing(text,text,text,text,text) from public;
revoke execute on function public.operations_set_release(text,text,text,text,text,text,text,text) from public;
grant  execute on function public.operations_settings()                          to authenticated, service_role;
grant  execute on function public.operations_set_landing(text,text,text,text,text) to authenticated, service_role;
grant  execute on function public.operations_set_release(text,text,text,text,text,text,text,text) to authenticated, service_role;


-- ============================================================
-- 3. PARTNER WALL — functions first, then the table
-- ============================================================
-- The table's two RLS policies ride along with the drop.

drop function if exists public.operations_partners();
drop function if exists public.operations_add_partner(text,text);
drop function if exists public.operations_update_partner(uuid,text,text);
drop function if exists public.operations_remove_partner(uuid);
drop function if exists public.operations_set_partner_order(uuid,integer);

drop table if exists public.partners;


-- ============================================================
-- 4. FUNCTIONS WITH NO CALLER LEFT
-- ============================================================
-- The three gliim proof cards on gliimu.com were deleted with Batch F, so the
-- RPC that fed them has no caller left in the repo.
--
-- top_uploader() fed the same cards' "Top Gliimait" tile. It is worse than
-- dead: its body reads public.feed_submissions, which sql/drop_dead_library.sql
-- already dropped, so every call fails — and it is SECURITY DEFINER with the
-- default PUBLIC execute grant, meaning anon can call it and get a 500 back.

drop function if exists public.landing_highlights();
drop function if exists public.top_uploader();


-- ============================================================
-- 5. DEAD site_settings COLUMNS
-- ============================================================

alter table public.site_settings drop column if exists about_title;
alter table public.site_settings drop column if exists about_body;
alter table public.site_settings drop column if exists squad_bg_url;
alter table public.site_settings drop column if exists earnings_image_url;
alter table public.site_settings drop column if exists app_mobile_qr_url;
alter table public.site_settings drop column if exists terms_content;
alter table public.site_settings drop column if exists terms_updated_at;


-- ============================================================
-- 6. REFRESH THE API CACHE
-- ============================================================

notify pgrst, 'reload schema';


-- ============================================================
-- SELF CHECK — every row must read OK
-- ============================================================

select 1 as "#", 'partners table dropped' as item,
       case when to_regclass('public.partners') is null
            then 'OK' else 'STILL EXISTS' end as result
union all select 2, '5 partner RPCs dropped',
       case when (select count(*) from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname like '%partner%') = 0
            then 'OK' else 'STILL EXISTS' end
union all select 3, 'landing_highlights() dropped',
       case when to_regprocedure('public.landing_highlights()') is null
            then 'OK' else 'STILL EXISTS' end
union all select 4, '7 dead columns dropped',
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'site_settings'
                     and column_name in ('about_title','about_body','squad_bg_url',
                                         'earnings_image_url','app_mobile_qr_url',
                                         'terms_content','terms_updated_at')) = 0
            then 'OK' else 'STILL EXISTS' end
union all select 5, 'old 8-arg set_landing overload gone',
       case when to_regprocedure('public.operations_set_landing(text,text,text,text,text,text,text,text)') is null
            then 'OK' else 'STILL EXISTS' end
union all select 6, 'old 9-arg set_release overload gone',
       case when to_regprocedure('public.operations_set_release(text,text,text,text,text,text,text,text,text)') is null
            then 'OK' else 'STILL EXISTS' end
union all select 7, 'set_landing takes 5 params',
       case when (select count(*) from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'operations_set_landing') = 1
                 and array_length((select proargnames from pg_proc
                                   where oid = 'public.operations_set_landing(text,text,text,text,text)'::regprocedure), 1) = 5
            then 'OK' else 'CHECK' end
union all select 8, 'set_release takes 8 params',
       case when (select count(*) from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'operations_set_release') = 1
                 and array_length((select proargnames from pg_proc
                                   where oid = 'public.operations_set_release(text,text,text,text,text,text,text,text)'::regprocedure), 1) = 8
            then 'OK' else 'CHECK' end
union all select 9, 'no RPC body names a dead column',
       case when not exists (
              select 1 from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.prosrc ~ 'about_title|about_body|squad_bg_url|earnings_image_url|app_mobile_qr_url|terms_content|terms_updated_at')
            then 'OK' else 'STILL REFERENCED' end
union all select 10, 'surviving landing columns intact',
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'site_settings'
                     and column_name in ('hero_video_url','hero_fallback_image_url',
                                         'hero_title','hero_highlight','hero_desc')) = 5
            then 'OK' else 'MISSING' end
union all select 11, 'surviving release columns intact',
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'site_settings'
                     and column_name in ('app_version','app_version_notes','app_download_bg_url',
                                         'app_windows_url','app_mac_url','app_linux_url',
                                         'app_android_url','app_ios_url')) = 8
            then 'OK' else 'MISSING' end
union all select 12, 'settings columns still there',
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'site_settings') = 14
            then 'OK' else 'CHECK: ' || (
              select count(*)::text from information_schema.columns
               where table_schema = 'public' and table_name = 'site_settings') end
union all select 13, 'anon cannot run operations_settings()',
       case when has_function_privilege('anon', 'public.operations_settings()', 'execute')
            then 'CHECK: anon has execute' else 'OK' end
union all select 14, 'a signed-in staff role can run operations_settings()',
       case when has_function_privilege('authenticated', 'public.operations_settings()', 'execute')
            then 'OK' else 'MISSING' end
union all select 15, 'top_uploader() dropped',
       case when to_regprocedure('public.top_uploader()') is null
            then 'OK' else 'STILL EXISTS' end
order by "#";
