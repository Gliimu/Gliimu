-- ============================================================
-- Gliimu: Operations — landing page media, partners, app release
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once.
--
-- WHAT THIS INSTALLS
--   1. is_safe_url() — the same shape check the landing page already
--      applies in public/assets/js/main.js (safeUrl). A URL is accepted
--      when it is empty, starts with http:// or https:// (any case), or
--      starts with a single "/" (root-relative). "//evil.com" is
--      rejected, and so is anything over 2000 characters.
--   2. The three landing-media columns on site_settings, added if the
--      hand-made table does not already have them:
--        hero_video_url, hero_fallback_image_url, squad_bg_url
--   3. partners — the "Trusted By" wall (created here too, so this file
--      stands alone even if sql/all.sql was never run).
--   4. Operations RPCs ('super' passes every check):
--        operations_settings()                    landing + release values
--        operations_set_landing(...)              hero video / images
--        operations_set_release(...)              version, notes, links, QR
--        operations_partners()                    the wall, in order
--        operations_add_partner(p_name, p_logo_url)
--        operations_update_partner(p_id, p_name, p_logo_url)
--        operations_remove_partner(p_id)
--        operations_set_partner_order(p_id, p_order)
--
-- WHY EVERYTHING IS AN RPC
--   site_settings is one wide row. RLS cannot restrict by column, so it
--   cannot say "Operations owns the app_* columns and CRM owns the
--   contact columns". A SECURITY DEFINER function can, because each one
--   only ever writes the columns it names. So direct table writes are
--   taken away from authenticated and every change goes through here.
--   Every failure path returns {ok:false, code:...} instead of raising,
--   so one broken card never blanks a whole screen.
--
-- HOW THE SETTERS TREAT THEIR ARGUMENTS
--   Omit an argument (or pass null) and that column is left exactly as
--   it is. Pass an empty string and the column is cleared. This means a
--   screen that only edits the version number cannot accidentally blank
--   the download links.
--
-- PUBLIC READ IS KEPT
--   anon and authenticated keep SELECT on both tables plus the
--   "Public read ..." policies, because gliimu.com renders the hero,
--   the partner wall and the download panel without signing in.
--   Only the writes move behind the RPCs.
--
-- DO NOT RE-RUN sql/all.sql AFTER THIS
--   all.sql re-grants UPDATE on site_settings and INSERT/UPDATE/DELETE
--   on partners to authenticated, and recreates the two is_admin()
--   write policies. Re-running it silently undoes the lockdown below.
--   Re-run this file afterwards if that ever happens.
--
-- RUN ORDER: after sql/all.sql and sql/admin.sql. It needs
--            admin_has_role() from admin.sql.
-- ============================================================

select pg_advisory_xact_lock(hashtext('gliimu-operations'));


-- ============================================================
-- 1. is_safe_url — one definition of an acceptable link
-- ============================================================

create or replace function public.is_safe_url(p_url text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_url is null
      or btrim(p_url) = ''
      or (char_length(btrim(p_url)) <= 2000
          and (btrim(p_url) ~* '^https?://' or btrim(p_url) ~ '^/[^/]'));
$$;

comment on function public.is_safe_url(text) is
  'True for empty, http(s):// or single-slash root-relative URLs up to 2000 characters. Mirrors safeUrl() in public/assets/js/main.js.';

revoke execute on function public.is_safe_url(text) from public, anon, authenticated;


-- ============================================================
-- 2. site_settings — make sure the columns the landing page reads
--    actually exist. The table itself was created by hand, so this
--    only ever adds columns; it never reshapes the ones already there.
-- ============================================================

do $$ begin
  if to_regclass('public.site_settings') is null then
    raise warning 'public.site_settings is missing — the landing/release columns were skipped. The Operations RPCs will report MISSING_TABLE.';
    return;
  end if;

  alter table public.site_settings add column if not exists hero_video_url text;
  alter table public.site_settings add column if not exists hero_fallback_image_url text;
  alter table public.site_settings add column if not exists squad_bg_url text;

  alter table public.site_settings add column if not exists app_version text;
  alter table public.site_settings add column if not exists app_version_notes text;
  alter table public.site_settings add column if not exists app_download_bg_url text;
  alter table public.site_settings add column if not exists app_windows_url text;
  alter table public.site_settings add column if not exists app_mac_url text;
  alter table public.site_settings add column if not exists app_linux_url text;
  alter table public.site_settings add column if not exists app_android_url text;
  alter table public.site_settings add column if not exists app_ios_url text;
  alter table public.site_settings add column if not exists app_mobile_qr_url text;
end $$;


-- ============================================================
-- 3. partners — the "Trusted By" wall
-- ============================================================

create table if not exists public.partners (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  logo_url      text,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.partners add column if not exists name text;
alter table public.partners add column if not exists logo_url text;
alter table public.partners add column if not exists display_order integer not null default 0;
alter table public.partners add column if not exists created_at timestamptz not null default now();

create index if not exists partners_order_idx
  on public.partners (display_order, created_at);


-- ============================================================
-- 4. Lockdown — public may read, nobody may write directly
-- ============================================================

do $$ begin
  if to_regclass('public.site_settings') is not null then
    execute 'alter table public.site_settings enable row level security';
    execute 'revoke all on public.site_settings from public, anon, authenticated';
    execute 'grant select on public.site_settings to anon, authenticated';
    execute 'grant all on public.site_settings to service_role';
    execute 'drop policy if exists "Admins update site settings" on public.site_settings';

    -- The public read policy is recreated rather than assumed, so this
    -- file leaves the landing page working even if all.sql never ran.
    execute 'drop policy if exists "Public read site settings" on public.site_settings';
    execute $p$
      create policy "Public read site settings" on public.site_settings
        for select to anon, authenticated using (true)
    $p$;
  end if;

  if to_regclass('public.partners') is not null then
    execute 'alter table public.partners enable row level security';
    execute 'revoke all on public.partners from public, anon, authenticated';
    execute 'grant select on public.partners to anon, authenticated';
    execute 'grant all on public.partners to service_role';
    execute 'drop policy if exists "Admins manage partners" on public.partners';

    execute 'drop policy if exists "Public read partners" on public.partners';
    execute $p$
      create policy "Public read partners" on public.partners
        for select to anon, authenticated using (true)
    $p$;
  end if;
end $$;


-- ============================================================
-- 5. operations_settings — everything the Operations screen shows
-- ============================================================

create or replace function public.operations_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_has_row boolean;
  v_landing jsonb := jsonb_build_object(
    'hero_video_url', null::text, 'hero_fallback_image_url', null::text, 'squad_bg_url', null::text);
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
             'squad_bg_url', s.squad_bg_url),
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
$$;


-- ============================================================
-- 6. operations_set_landing — hero video, hero image, squad image
-- ============================================================

create or replace function public.operations_set_landing(
  p_hero_video_url          text default null,
  p_hero_fallback_image_url text default null,
  p_squad_bg_url            text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_bad text;
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

  if not exists (select 1 from public.site_settings) then
    begin
      insert into public.site_settings default values;
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
                               else nullif(btrim(p_squad_bg_url), '') end;

  return public.operations_settings();
end
$$;


-- ============================================================
-- 7. operations_set_release — the "Take Gliimu Everywhere" panel
-- ============================================================

create or replace function public.operations_set_release(
  p_app_version         text default null,
  p_app_version_notes   text default null,
  p_app_download_bg_url text default null,
  p_app_windows_url     text default null,
  p_app_mac_url         text default null,
  p_app_linux_url       text default null,
  p_app_android_url     text default null,
  p_app_ios_url         text default null,
  p_app_mobile_qr_url   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_bad text;
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
      ('iOS link',            p_app_ios_url),
      ('Desktop QR link',     p_app_mobile_qr_url)
    ) as f(field, url)
   where f.url is not null and not public.is_safe_url(f.url)
   limit 1;

  if v_bad is not null then
    return jsonb_build_object('ok', false, 'code', 'BAD_URL', 'field', v_bad,
      'hint', v_bad || ' must start with https://, http:// or a single /.');
  end if;

  if not exists (select 1 from public.site_settings) then
    begin
      insert into public.site_settings default values;
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
                            else nullif(btrim(p_app_ios_url), '') end,
         app_mobile_qr_url = case when p_app_mobile_qr_url is null
                            then app_mobile_qr_url
                            else nullif(btrim(p_app_mobile_qr_url), '') end;

  return public.operations_settings();
end
$$;


-- ============================================================
-- 8. operations_partners — the wall, in display order
-- ============================================================

create or replace function public.operations_partners()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_rows jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if to_regclass('public.partners') is null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_TABLE',
      'hint', 'The partners table is missing.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.name, 'logo_url', s.logo_url,
           'display_order', s.display_order, 'created_at', s.created_at)
           order by s.display_order asc, s.created_at asc), '[]'::jsonb)
    into v_rows
    from (select p.id, p.name, p.logo_url, p.display_order, p.created_at
            from public.partners p) s;

  return jsonb_build_object('ok', true, 'partners', v_rows);
end
$$;


-- ============================================================
-- 9. operations_add_partner — appended to the end of the wall
-- ============================================================

create or replace function public.operations_add_partner(p_name text, p_logo_url text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_logo text := nullif(btrim(coalesce(p_logo_url, '')), '');
  v_id   uuid;
  v_order integer;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if to_regclass('public.partners') is null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_TABLE',
      'hint', 'The partners table is missing.');
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'code', 'BAD_NAME',
      'hint', 'The partner name must be between 2 and 80 characters.');
  end if;
  if not public.is_safe_url(v_logo) then
    return jsonb_build_object('ok', false, 'code', 'BAD_URL', 'field', 'Logo',
      'hint', 'The logo must start with https://, http:// or a single /.');
  end if;

  -- Two admins adding at once would otherwise both read the same max.
  perform pg_advisory_xact_lock(hashtext('operations_partner'));

  select coalesce(max(p.display_order), 0) + 1 into v_order from public.partners p;

  insert into public.partners (name, logo_url, display_order)
  values (v_name, v_logo, v_order)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'name', v_name, 'display_order', v_order);
end
$$;


-- ============================================================
-- 10. operations_update_partner — rename and/or replace the logo
-- ============================================================

create or replace function public.operations_update_partner(
  p_id uuid, p_name text default null, p_logo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_row public.partners;
  v_name text;
  v_logo text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if to_regclass('public.partners') is null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_TABLE',
      'hint', 'The partners table is missing.');
  end if;
  if p_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  v_name := case when p_name is null then null else btrim(p_name) end;
  if v_name is not null and (char_length(v_name) < 2 or char_length(v_name) > 80) then
    return jsonb_build_object('ok', false, 'code', 'BAD_NAME',
      'hint', 'The partner name must be between 2 and 80 characters.');
  end if;

  if p_logo_url is not null and not public.is_safe_url(p_logo_url) then
    return jsonb_build_object('ok', false, 'code', 'BAD_URL', 'field', 'Logo',
      'hint', 'The logo must start with https://, http:// or a single /.');
  end if;
  v_logo := case when p_logo_url is null then null
                 else nullif(btrim(p_logo_url), '') end;

  select * into v_row from public.partners p where p.id = p_id for update;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  update public.partners
     set name = coalesce(v_name, name),
         logo_url = case when p_logo_url is null then logo_url else v_logo end
   where id = v_row.id;

  return jsonb_build_object('ok', true, 'id', v_row.id);
end
$$;


-- ============================================================
-- 11. operations_remove_partner
-- ============================================================

create or replace function public.operations_remove_partner(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_row public.partners;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if to_regclass('public.partners') is null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_TABLE',
      'hint', 'The partners table is missing.');
  end if;

  select * into v_row from public.partners p where p.id = p_id for update;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  delete from public.partners where id = v_row.id;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'name', v_row.name);
end
$$;


-- ============================================================
-- 12. operations_set_partner_order — reorder the wall
-- ============================================================

create or replace function public.operations_set_partner_order(p_id uuid, p_order integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_row public.partners;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'operations') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if to_regclass('public.partners') is null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_TABLE',
      'hint', 'The partners table is missing.');
  end if;
  if p_order is null or p_order < 0 or p_order > 999 then
    return jsonb_build_object('ok', false, 'code', 'BAD_ORDER',
      'hint', 'The position must be a whole number from 0 to 999.');
  end if;

  select * into v_row from public.partners p where p.id = p_id for update;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  update public.partners set display_order = p_order where id = v_row.id;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'display_order', p_order);
end
$$;


-- ============================================================
-- 13. Privileges
-- ============================================================

revoke execute on function public.operations_settings()                                            from public, anon;
revoke execute on function public.operations_set_landing(text, text, text)                          from public, anon;
revoke execute on function public.operations_set_release(text, text, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.operations_partners()                                             from public, anon;
revoke execute on function public.operations_add_partner(text, text)                                from public, anon;
revoke execute on function public.operations_update_partner(uuid, text, text)                       from public, anon;
revoke execute on function public.operations_remove_partner(uuid)                                   from public, anon;
revoke execute on function public.operations_set_partner_order(uuid, integer)                       from public, anon;

grant execute on function public.operations_settings()                                            to authenticated, service_role;
grant execute on function public.operations_set_landing(text, text, text)                          to authenticated, service_role;
grant execute on function public.operations_set_release(text, text, text, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.operations_partners()                                             to authenticated, service_role;
grant execute on function public.operations_add_partner(text, text)                                to authenticated, service_role;
grant execute on function public.operations_update_partner(uuid, text, text)                       to authenticated, service_role;
grant execute on function public.operations_remove_partner(uuid)                                   to authenticated, service_role;
grant execute on function public.operations_set_partner_order(uuid, integer)                       to authenticated, service_role;

notify pgrst, 'reload schema';


-- ============================================================
-- 14. SELF CHECK
--     Run the whole file, then look at the Results tab. Every row
--     must read OK. Nothing here writes anything.
-- ============================================================

select '01. site_settings exists' as check_item,
       case when to_regclass('public.site_settings') is null then 'MISSING' else 'OK' end as result
union all
select '02. partners exists',
       case when to_regclass('public.partners') is null then 'MISSING' else 'OK' end
union all
select '03. three landing columns present',
       case when to_regclass('public.site_settings') is null then 'TABLE MISSING'
            when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'site_settings'
                     and column_name in ('hero_video_url','hero_fallback_image_url','squad_bg_url')) = 3
            then 'OK' else 'MISSING' end
union all
select '04. nine release columns present',
       case when to_regclass('public.site_settings') is null then 'TABLE MISSING'
            when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'site_settings'
                     and column_name in ('app_version','app_version_notes','app_download_bg_url',
                                         'app_windows_url','app_mac_url','app_linux_url',
                                         'app_android_url','app_ios_url','app_mobile_qr_url')) = 9
            then 'OK' else 'MISSING' end
union all
select '05. is_safe_url installed',
       case when to_regprocedure('public.is_safe_url(text)') is null then 'MISSING' else 'OK' end
union all
select '06. is_safe_url rejects //evil.com and javascript:',
       case when public.is_safe_url('//evil.com') or public.is_safe_url('javascript:alert(1)')
            then 'BROKEN' else 'OK' end
union all
select '07. is_safe_url accepts https and root-relative',
       case when public.is_safe_url('https://cdn.gliimu.com/a.png')
                 and public.is_safe_url('/icons/icon.png')
                 and public.is_safe_url('')
            then 'OK' else 'BROKEN' end
union all
select '08. 8 of 8 operations functions installed',
       (select count(*)::text || ' of 8'
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('operations_settings','operations_set_landing','operations_set_release',
                             'operations_partners','operations_add_partner','operations_update_partner',
                             'operations_remove_partner','operations_set_partner_order'))
union all
select '09. all eight are SECURITY DEFINER',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.prosecdef
                     and p.proname in ('operations_settings','operations_set_landing','operations_set_release',
                                       'operations_partners','operations_add_partner','operations_update_partner',
                                       'operations_remove_partner','operations_set_partner_order')) = 8
            then 'OK' else 'MISSING' end
union all
select '10. anon cannot execute any of them',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public'
                     and p.proname in ('operations_settings','operations_set_landing','operations_set_release',
                                       'operations_partners','operations_add_partner','operations_update_partner',
                                       'operations_remove_partner','operations_set_partner_order')
                     and has_function_privilege('anon', p.oid, 'EXECUTE')) = 0
            then 'OK' else 'GRANT FOUND' end
union all
select '11. RLS on site_settings and partners',
       case when (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public'
                     and c.relname in ('site_settings','partners')
                     and c.relrowsecurity) = 2
            then 'OK' else 'MISSING' end
union all
select '12. public can still READ both tables',
       case when to_regclass('public.site_settings') is null or to_regclass('public.partners') is null
                 then 'TABLE MISSING'
            when has_table_privilege('anon', 'public.site_settings', 'SELECT')
                 and has_table_privilege('anon', 'public.partners', 'SELECT')
                 and has_table_privilege('authenticated', 'public.site_settings', 'SELECT')
                 and has_table_privilege('authenticated', 'public.partners', 'SELECT')
            then 'OK' else 'MISSING — the landing page will go blank' end
union all
select '13. authenticated cannot WRITE site_settings',
       case when to_regclass('public.site_settings') is null then 'TABLE MISSING'
            when has_table_privilege('authenticated', 'public.site_settings', 'INSERT')
              or has_table_privilege('authenticated', 'public.site_settings', 'UPDATE')
              or has_table_privilege('authenticated', 'public.site_settings', 'DELETE')
            then 'GRANT FOUND' else 'OK' end
union all
select '14. authenticated cannot WRITE partners',
       case when to_regclass('public.partners') is null then 'TABLE MISSING'
            when has_table_privilege('authenticated', 'public.partners', 'INSERT')
              or has_table_privilege('authenticated', 'public.partners', 'UPDATE')
              or has_table_privilege('authenticated', 'public.partners', 'DELETE')
            then 'GRANT FOUND' else 'OK' end
union all
select '15. no write policies left on either table',
       case when (select count(*) from pg_policies
                   where schemaname = 'public'
                     and tablename in ('site_settings','partners')
                     and cmd <> 'SELECT') = 0
            then 'OK' else 'POLICY FOUND — re-run sql/all.sql? See the header.' end
union all
select '16. exactly one public read policy each',
       case when (select count(*) from pg_policies
                   where schemaname = 'public'
                     and tablename in ('site_settings','partners')
                     and cmd = 'SELECT') = 2
            then 'OK' else 'CHECK BY HAND' end
union all
select '17. site_settings has a row to update',
       case when to_regclass('public.site_settings') is null then 'TABLE MISSING'
            when (select count(*) from public.site_settings) = 0 then 'EMPTY — a save will create one'
            else 'OK (' || (select count(*)::text from public.site_settings) || ' row)' end
union all
select '18. partners on the wall',
       case when to_regclass('public.partners') is null then 'TABLE MISSING'
            else (select count(*)::text || ' partner(s)' from public.partners) end
union all
select '19. admin_has_role() is present (from admin.sql)',
       case when to_regprocedure('public.admin_has_role(uuid,text)') is null
            then 'MISSING — run sql/admin.sql first' else 'OK' end
order by 1;
