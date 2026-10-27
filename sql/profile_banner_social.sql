-- ============================================================
-- PROFILE BANNER + SOCIAL LINK
-- Adds profiles.banner_url and profiles.social_link so members
-- can upload a profile banner picture and list one social link.
-- Idempotent: safe to run multiple times.
-- ============================================================

alter table public.profiles
  add column if not exists banner_url text;

alter table public.profiles
  add column if not exists social_link text;

-- profiles has a column-level UPDATE lockdown; new columns must be
-- granted explicitly or the settings page saves will silently fail.
grant update (banner_url, social_link) on public.profiles to authenticated;

-- ============================================================
-- SELF CHECK — run each statement, compare with expected
-- ============================================================
-- 1) Columns exist:
--    select column_name, data_type
--    from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles'
--      and column_name in ('banner_url', 'social_link')
--    order by column_name;
--    EXPECTED: 2 rows  (banner_url | text)  (social_link | text)
--
-- 2) Members may update the new columns:
--    select column_name
--    from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'profiles'
--      and grantee = 'authenticated' and privilege_type = 'UPDATE'
--      and column_name in ('banner_url', 'social_link')
--    order by column_name;
--    EXPECTED: 2 rows  (banner_url)  (social_link)
--
-- 3) Own-row update policy still in place:
--    select policy_name, cmd
--    from pg_policies
--    where schemaname = 'public' and tablename = 'profiles' and cmd = 'UPDATE';
--    EXPECTED: at least 1 row (the existing own-row update policy)
