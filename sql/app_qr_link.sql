-- sql/app_qr_link.sql — put the desktop QR code back, pointing at the website
-- Run once on Supabase. Idempotent: running it twice leaves the same value.
--
-- Why: sql/app_download_placeholders.sql blanked app_mobile_qr_url along with
-- the five installer columns, because all six held the same "https://gliimu.com"
-- stand-in. With every QR source column blank the landing page hides the QR
-- block entirely — so a visitor at a laptop has nothing to scan with their phone.
--
-- The QR column is a LINK column, not a FILE column, so a real Gliimu URL is the
-- correct value here (it is exactly what was wrong for the five file columns).
-- It points at the download section itself, which is where a phone visitor wants
-- to land.
--
-- Order-independent: safe to run before or after app_download_placeholders.sql,
-- because that script only clears values equal to 'https://gliimu.com' and this
-- one writes 'https://www.gliimu.com/#download-section'.

update public.site_settings
set app_mobile_qr_url = 'https://www.gliimu.com/#download-section'
where id = 1;

-- ============================================================
-- SELF CHECK — run alone, reads nothing, changes nothing.
-- Every row must say PASS.
-- ============================================================
select 'Desktop QR link' as setting,
       coalesce(app_mobile_qr_url, '(blank)') as value,
       case when app_mobile_qr_url = 'https://www.gliimu.com/#download-section'
            then 'PASS' else 'CHECK' end as result
  from public.site_settings where id = 1
union all
-- The five installer links must STAY blank until a real build exists.
select 'Windows link', coalesce(app_windows_url, '(blank)'),
       case when app_windows_url is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
select 'macOS link', coalesce(app_mac_url, '(blank)'),
       case when app_mac_url is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
select 'Linux link', coalesce(app_linux_url, '(blank)'),
       case when app_linux_url is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
select 'Android link', coalesce(app_android_url, '(blank)'),
       case when app_android_url is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
select 'iOS link', coalesce(app_ios_url, '(blank)'),
       case when app_ios_url is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
-- No build means no version number to print.
select 'Version badge', coalesce(app_version, '(blank)'),
       case when app_version is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
select 'Release notes', coalesce(app_version_notes, '(blank)'),
       case when app_version_notes is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
-- The only value that must SURVIVE: a real background image on R2.
select 'Download background', coalesce(app_download_bg_url, '(blank)'),
       case when app_download_bg_url is not null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1;
