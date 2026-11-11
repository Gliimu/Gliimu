-- sql/app_download_placeholders.sql — clear the placeholder app download links
-- Run once on Supabase. Idempotent: safe to run twice, and it can never wipe
-- a real installer URL that Operations uploads later.
--
-- Why: every app_*_url column still holds "https://gliimu.com" — a stand-in
-- left over from when the download section was built. The landing page treats
-- any valid URL as a live installer, so all five download buttons and the QR
-- code hand visitors the website itself instead of a file. Gliimu has never
-- been packaged, so the links go back to blank; the landing page then falls
-- through to its "the app is on the way" message.
--
-- nullif(col, '<placeholder>') clears a column only while it still holds the
-- placeholder, which is what makes re-running this script harmless.

update public.site_settings
set
  app_windows_url   = nullif(app_windows_url,   'https://gliimu.com'),
  app_mac_url       = nullif(app_mac_url,       'https://gliimu.com'),
  app_linux_url     = nullif(app_linux_url,     'https://gliimu.com'),
  app_android_url   = nullif(app_android_url,   'https://gliimu.com'),
  app_ios_url       = nullif(app_ios_url,       'https://gliimu.com'),
  app_mobile_qr_url = nullif(app_mobile_qr_url, 'https://gliimu.com'),
  app_version       = nullif(app_version,       '1.2.1'),
  app_version_notes = nullif(app_version_notes, 'Users now have better experiences and security')
where id = 1;

-- ============================================================
-- SELF CHECK — run alone, reads nothing, changes nothing.
-- Every row must say PASS.
-- ============================================================
select 'Windows link' as setting,
       case when app_windows_url is null then '(blank)' else app_windows_url end as value,
       case when app_windows_url is null then 'PASS' else 'CHECK' end as result
  from public.site_settings where id = 1
union all
select 'macOS link',
       case when app_mac_url is null then '(blank)' else app_mac_url end,
       case when app_mac_url is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
select 'Linux link',
       case when app_linux_url is null then '(blank)' else app_linux_url end,
       case when app_linux_url is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
select 'Android link',
       case when app_android_url is null then '(blank)' else app_android_url end,
       case when app_android_url is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
select 'iOS link',
       case when app_ios_url is null then '(blank)' else app_ios_url end,
       case when app_ios_url is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
select 'Desktop QR link',
       case when app_mobile_qr_url is null then '(blank)' else app_mobile_qr_url end,
       case when app_mobile_qr_url is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
select 'Version badge',
       case when app_version is null then '(blank)' else app_version end,
       case when app_version is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
select 'Release notes',
       case when app_version_notes is null then '(blank)' else app_version_notes end,
       case when app_version_notes is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
-- The only value that must SURVIVE: a real background image on R2.
select 'Download background',
       coalesce(app_download_bg_url, '(blank)'),
       case when app_download_bg_url is not null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1;
