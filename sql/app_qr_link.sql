-- sql/app_qr_link.sql — clear the footer QR link that pointed at the download band
-- Run once on Supabase. Idempotent: running it twice leaves the same value.
--
-- Why: the landing footer used to encode 'https://www.gliimu.com/#download-section'
-- in its desktop QR plate. That section is gone — the footer no longer carries a
-- download control, because there is no installer to hand over — so the anchor
-- would leave a phone staring at a fragment that scrolls to nothing.
--
-- The plate still shows, and main.js now encodes 'https://www.gliimu.com/' when
-- this column is blank. So blank is the correct value: the column says "no
-- override", and Operations can put a real target in it (a store page, a signup
-- link) from Operations > App release whenever one exists.
--
-- Guard: the update only matches the dead placeholder string, so a target that
-- Operations sets by hand is never wiped by running this script.

update public.site_settings
set app_mobile_qr_url = null
where id = 1
  and app_mobile_qr_url = 'https://www.gliimu.com/#download-section';

-- ============================================================
-- SELF CHECK — run alone, reads nothing, changes nothing.
-- Every row must say PASS.
-- ============================================================
select 'Footer QR link' as setting,
       coalesce(app_mobile_qr_url, '(blank)') as value,
       case when app_mobile_qr_url is null
              or app_mobile_qr_url <> 'https://www.gliimu.com/#download-section'
            then 'PASS' else 'CHECK' end as result
  from public.site_settings where id = 1
union all
-- The footer still paints with this, so it must survive.
select 'Footer background', coalesce(app_download_bg_url, '(blank)'),
       case when app_download_bg_url is not null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
-- Nothing is installable yet, so every platform link stays blank.
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
select 'Version badge', coalesce(app_version, '(blank)'),
       case when app_version is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1
union all
select 'Release notes', coalesce(app_version_notes, '(blank)'),
       case when app_version_notes is null then 'PASS' else 'CHECK' end
  from public.site_settings where id = 1;
