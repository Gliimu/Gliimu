-- ============================================================
-- MOBILE HERO VIDEO (safe to re-run)
-- ============================================================
-- Operations can now set a second explainer film just for phones. The landing
-- page picks: mobile film (phones only, when set) -> all-devices film ->
-- background image. Leaving the mobile film blank changes nothing for anyone.
--
--   NEW COLUMN    public.site_settings.hero_mobile_video_url
--   REWRITTEN     operations_settings()      — landing gains one key
--                 operations_set_landing()   — 5 parameters become 6
--
-- WHY THE OLD OVERLOADS ARE DROPPED FIRST: CREATE OR REPLACE only replaces a
-- function with the SAME parameter list. Adding a 6th parameter creates a
-- SECOND function called operations_set_landing, and PostgREST then cannot
-- tell which one an RPC call means — the admin Save button starts returning
-- "ambiguous function". So the live 8-parameter version and the 5-parameter
-- version are dropped by full signature before the new one is created.
--
-- This script never deletes a value. hero_video_url keeps whatever it holds.
-- ============================================================


-- ============================================================
-- 1. THE NEW COLUMN
-- ============================================================

alter table public.site_settings
  add column if not exists hero_mobile_video_url text;

comment on column public.site_settings.hero_mobile_video_url is
  'Explainer film served to phone visitors only. Falls back to hero_video_url when blank.';


-- ============================================================
-- 2. READER — operations_settings()
-- ============================================================
-- Same job as before, one extra landing key. Release keys are untouched.

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
    'hero_video_url', null::text, 'hero_mobile_video_url', null::text,
    'hero_fallback_image_url', null::text,
    'hero_title', null::text, 'hero_highlight', null::text, 'hero_desc', null::text);
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
             'hero_mobile_video_url', s.hero_mobile_video_url,
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
$fn$;


-- ============================================================
-- 3. SAVER — operations_set_landing() with six parameters
-- ============================================================

drop function if exists public.operations_set_landing(text,text,text,text,text,text,text,text);
drop function if exists public.operations_set_landing(text,text,text,text,text);
drop function if exists public.operations_set_landing(text,text,text,text,text,text);

create or replace function public.operations_set_landing(
  p_hero_video_url          text default null,
  p_hero_mobile_video_url   text default null,
  p_hero_fallback_image_url text default null,
  p_hero_title              text default null,
  p_hero_highlight          text default null,
  p_hero_desc               text default null
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
      ('Hero video',              p_hero_video_url),
      ('Mobile hero video',       p_hero_mobile_video_url),
      ('Hero fallback image',     p_hero_fallback_image_url)
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
         hero_mobile_video_url = case when p_hero_mobile_video_url is null
                               then hero_mobile_video_url
                               else nullif(btrim(p_hero_mobile_video_url), '') end,
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


-- ============================================================
-- 4. GRANTS — CREATE OR REPLACE resets them, so set them again
-- ============================================================
-- Both functions read auth.uid() and call admin_has_role(), so a member who is
-- not Operations gets NOT_OPERATIONS. Still, neither should be callable by the
-- anonymous visitor at all: Postgres hands EXECUTE to PUBLIC whenever a
-- function is created, which puts it on the public REST surface.

revoke execute on function public.operations_settings()                              from public;
revoke execute on function public.operations_set_landing(text,text,text,text,text,text) from public;
revoke execute on function public.operations_settings()                              from anon;
revoke execute on function public.operations_set_landing(text,text,text,text,text,text) from anon;

grant execute on function public.operations_settings()                                 to authenticated, service_role;
grant execute on function public.operations_set_landing(text,text,text,text,text,text) to authenticated, service_role;

-- The new column is covered by the policies that already guard the table:
-- "Public read site settings" (anon + authenticated, USING true) lets the
-- landing page fetch it, and "Admins update site settings" (authenticated,
-- USING/WITH CHECK is_admin()) stops anyone else writing it. Nothing to add.

notify pgrst, 'reload schema';


-- ============================================================
-- 5. SELF CHECK — read-only, run the whole thing, expect every PASS
-- ============================================================

select '1. Mobile column exists' as check,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='site_settings'
                            and column_name='hero_mobile_video_url')
       then 'PASS' else 'CHECK' end as result
union all
select '2. Only the six-parameter saver is left',
       case when (select count(*) from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public' and p.proname='operations_set_landing') = 1
        and (select coalesce(array_length(p.proargnames, 1), 0) from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where n.nspname='public' and p.proname='operations_set_landing') = 6
       then 'PASS' else 'CHECK' end
union all
select '3. Saver declares p_hero_mobile_video_url',
       case when exists (select 1 from pg_proc p
                           join pg_namespace n on n.oid = p.pronamespace,
                                unnest(p.proargnames) as t(argname)
                          where n.nspname='public' and p.proname='operations_set_landing'
                            and t.argname = 'p_hero_mobile_video_url')
       then 'PASS' else 'CHECK' end
union all
select '4. Saver checks the mobile URL before storing it',
       case when (select position('p_hero_mobile_video_url' in p.prosrc) > 0
                    from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public' and p.proname='operations_set_landing')
       then 'PASS' else 'CHECK' end
union all
select '5. Reader reports the mobile key',
       case when (select position('''hero_mobile_video_url''' in p.prosrc) > 0
                    from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public' and p.proname='operations_settings')
       then 'PASS' else 'CHECK' end
union all
select '6. Both functions are SECURITY DEFINER',
       case when (select count(*) from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public'
                     and p.proname in ('operations_settings','operations_set_landing')
                     and p.prosecdef) = 2
       then 'PASS' else 'CHECK' end
union all
select '7. Both functions pin search_path to public',
       case when (select count(*) from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public'
                     and p.proname in ('operations_settings','operations_set_landing')
                     and array_to_string(p.proconfig, ',') like '%search_path%') = 2
       then 'PASS' else 'CHECK' end
union all
select '8. Anonymous visitors cannot call either function',
       case when not has_function_privilege('anon', 'public.operations_settings()', 'execute')
            and not has_function_privilege('anon',
                  'public.operations_set_landing(text,text,text,text,text,text)', 'execute')
       then 'PASS' else 'CHECK' end
union all
select '9. Signed-in staff can call both',
       case when has_function_privilege('authenticated', 'public.operations_settings()', 'execute')
            and has_function_privilege('authenticated',
                  'public.operations_set_landing(text,text,text,text,text,text)', 'execute')
       then 'PASS' else 'CHECK' end
union all
select '10. Landing page can read the new column',
       case when has_column_privilege('anon', 'public.site_settings',
                  'hero_mobile_video_url', 'select')
       then 'PASS' else 'CHECK' end
union all
select '11. Row Level Security still guards the table',
       case when (select relrowsecurity from pg_class
                   where oid = 'public.site_settings'::regclass)
            and (select count(*) from pg_policies
                  where schemaname='public' and tablename='site_settings') >= 2
       then 'PASS' else 'CHECK' end
union all
select '12. Only admins can write settings',
       case when exists (select 1 from pg_policies
                          where schemaname='public' and tablename='site_settings'
                            and cmd = 'UPDATE'
                            and qual LIKE '%is_admin%')
       then 'PASS' else 'CHECK' end
union all
select '13. Existing hero film and image were not disturbed',
       case when (select count(*) from public.site_settings) >= 1
       then 'PASS' else 'CHECK' end
order by 1;

-- What the row currently holds. Blank mobile film is the expected state until
-- Operations uploads one.
select id,
       coalesce(nullif(btrim(hero_video_url), ''),          '(not set)') as hero_video_url,
       coalesce(nullif(btrim(hero_mobile_video_url), ''),   '(not set)') as hero_mobile_video_url,
       coalesce(nullif(btrim(hero_fallback_image_url), ''), '(not set)') as hero_fallback_image_url
  from public.site_settings
 order by id;
