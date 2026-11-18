-- ============================================================
-- FIX: onboarding_steps has no GRANTs — member fetch 403s
-- ------------------------------------------------------------
-- Symptom: browser console shows
--   rest/v1/onboarding_steps?select=route,title,body,position&...  403
-- and the guided tour silently never starts (maybeStartTour exits
-- when the steps fetch fails).
--
-- Cause: sql/onboarding_steps.sql created the table with RLS and
-- policies but no GRANT statements. A policy decides WHICH rows a
-- role may see; a GRANT decides whether the role may touch the
-- table at all. Without `grant select ... to authenticated`,
-- PostgREST rejects every request with 403 before RLS is even
-- consulted.
--
-- Fix: grant exactly what the policies already assume —
--   authenticated: SELECT (members) + INSERT/UPDATE/DELETE (ops
--                  admins edit steps from the admin tab; the
--                  admin-only policies gate every write)
--   anon:          SELECT (harmless — there is no anon policy, so
--                  anon always sees zero rows; this just turns the
--                  403 into a clean empty result)
--
-- Idempotent: GRANT is a no-op when the privilege already exists.
-- Run order: any time.
-- ============================================================

-- ------------------------------------------------------------
-- 1. GRANTS
-- ------------------------------------------------------------

grant select, insert, update, delete
  on public.onboarding_steps
  to authenticated;

grant select
  on public.onboarding_steps
  to anon;

-- ------------------------------------------------------------
-- 2. SELF-CHECK — zero edits needed; every line should say OK.
-- ------------------------------------------------------------

do $$
declare
  v_auth_sel integer;
  v_auth_write integer;
  v_anon_sel integer;
  v_rows integer;
  v_rls boolean;
  v_select_policy integer;
begin
  select count(*) into v_auth_sel
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'onboarding_steps'
      and grantee = 'authenticated' and privilege_type = 'SELECT';
  select count(*) into v_auth_write
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'onboarding_steps'
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  select count(*) into v_anon_sel
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'onboarding_steps'
      and grantee = 'anon' and privilege_type = 'SELECT';
  select count(*) into v_rows from public.onboarding_steps where is_enabled;
  select relrowsecurity into v_rls
    from pg_class where oid = 'public.onboarding_steps'::regclass;
  select count(*) into v_select_policy
    from pg_policies
    where schemaname = 'public' and tablename = 'onboarding_steps'
      and cmd = 'SELECT';

  raise notice 'SELF-CHECK 1/5 authenticated SELECT ....... % (expect 1)', v_auth_sel;
  raise notice 'SELF-CHECK 2/5 authenticated INSERT/UPD/DEL % (expect 3)', v_auth_write;
  raise notice 'SELF-CHECK 3/5 anon SELECT ................ % (expect 1)', v_anon_sel;
  raise notice 'SELF-CHECK 4/5 enabled steps .............. % (expect 7)', v_rows;
  raise notice 'SELF-CHECK 5/5 RLS on + select policy ..... % + % (expect t + 1)', v_rls, v_select_policy;

  if v_auth_sel <> 1 or v_auth_write <> 3 or v_anon_sel <> 1
     or v_rows <> 7 or not v_rls or v_select_policy <> 1 then
    raise exception 'GRANT SELF-CHECK FAILED — read the notices above';
  end if;
end $$;
