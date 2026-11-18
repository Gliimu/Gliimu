-- ============================================================
-- ONBOARDING TOUR — FIX THE ADMIN WRITE POLICIES
--
-- Symptom: admin app → Operations → Onboarding tour → "Save all
-- steps" fails for EVERY admin with
--   "Could not save: permission denied for table admin_users".
--
-- Cause: the INSERT/UPDATE/DELETE policies check membership with
--   exists (select 1 from public.admin_users where user_id = auth.uid() ...)
-- but admin_users is RLS-locked with no member policies and no member
-- grants, so the check inside the policy can never read the row.
-- Postgres evaluates policy expressions with the invoking role's
-- privileges, so the write dies at the grant layer before RLS is
-- even consulted (proven live 2026-11-18 by simulating an admin).
--
-- Fix: gate the three write policies on the existing SECURITY
-- DEFINER helper admin_has_role(auth.uid(), 'ops') — it returns
-- true for 'super' OR 'ops' and reads admin_users with the
-- function owner's rights, immune to RLS. The SELECT policy
-- (using (true)) is untouched and already works.
--
-- Run order: any time. Idempotent: policies are dropped and
-- recreated with the same names. No data is touched.
-- sql/onboarding_steps.sql (fresh installs) was aligned to the
-- same form so the bug cannot be reintroduced.
-- ============================================================

-- ------------------------------------------------------------
-- 1. RECREATE THE THREE WRITE POLICIES ON THE WORKING CHECK
-- ------------------------------------------------------------

drop policy if exists "Admins can insert onboarding_steps" on public.onboarding_steps;
create policy "Admins can insert onboarding_steps"
  on public.onboarding_steps
  for insert
  to authenticated
  with check (admin_has_role(auth.uid(), 'ops'));

drop policy if exists "Admins can update onboarding_steps" on public.onboarding_steps;
create policy "Admins can update onboarding_steps"
  on public.onboarding_steps
  for update
  to authenticated
  using (admin_has_role(auth.uid(), 'ops'))
  with check (admin_has_role(auth.uid(), 'ops'));

drop policy if exists "Admins can delete onboarding_steps" on public.onboarding_steps;
create policy "Admins can delete onboarding_steps"
  on public.onboarding_steps
  for delete
  to authenticated
  using (admin_has_role(auth.uid(), 'ops'));

-- ------------------------------------------------------------
-- 2. SELF-CHECK — zero edits needed; every line should say OK.
-- ------------------------------------------------------------

do $$
declare
  v_bad_policy integer;
  v_new_policies integer;
  v_write_grants integer;
  v_anon_grants integer;
  v_admin uuid;
  v_updated integer;
begin
  -- no write policy may still reference admin_users directly
  select count(*) into v_bad_policy
    from pg_policies
    where schemaname = 'public'
      and tablename = 'onboarding_steps'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
      and (qual ilike '%admin_users%' or with_check ilike '%admin_users%');

  -- all three write policies must gate on admin_has_role
  select count(*) into v_new_policies
    from pg_policies
    where schemaname = 'public'
      and tablename = 'onboarding_steps'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
      and (qual ilike '%admin_has_role%' or with_check ilike '%admin_has_role%');

  -- today's grants must still be in place (the editor writes directly)
  select count(*) into v_write_grants
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'onboarding_steps'
      and grantee = 'authenticated'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE');

  select count(*) into v_anon_grants
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'onboarding_steps'
      and grantee = 'anon'
      and privilege_type = 'SELECT';

  raise notice 'SELF-CHECK 1/3 admin_users in write policies .. % (expect 0)', v_bad_policy;
  raise notice 'SELF-CHECK 2/3 admin_has_role write policies .. % (expect 3)', v_new_policies;
  raise notice 'SELF-CHECK 3/3 member + anon grants ........... % + % (expect 4 + 1)', v_write_grants, v_anon_grants;

  if v_bad_policy <> 0 or v_new_policies <> 3 or v_write_grants <> 4 or v_anon_grants <> 1 then
    raise exception 'ONBOARDING POLICY SELF-CHECK FAILED — read the notices above';
  end if;

  -- live proof: a real admin must be able to update a step
  select user_id into v_admin
    from public.admin_users
    where role in ('super', 'ops')
    limit 1;

  if v_admin is null then
    raise notice 'PROOF skipped — no super/ops admin row exists yet';
  else
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text,
      true
    );
    execute 'set local role authenticated';
    update public.onboarding_steps set title = title where route = '/xplore';
    get diagnostics v_updated = row_count;
    execute 'reset role';
    raise notice 'PROOF rows a real admin can update ........ % (expect 1)', v_updated;
    if v_updated <> 1 then
      raise exception 'PROOF FAILED — an admin still cannot update a tour step';
    end if;
  end if;
end $$;
