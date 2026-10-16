-- ============================================================
-- Gliimu: hide usernames from other users — PART B (profiles table)
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once. Run AFTER sql/username_privacy.sql
-- (Part A) — but Part B is self-contained and does not depend on it.
--
-- WHY
--   Any signed-in member could read EVERY other member's
--   profiles.username straight from PostgREST, because the profiles
--   SELECT policy is permissive. A username is a handle that can be
--   used to target or impersonate, so it must stay private between
--   the account and Gliimu. This closes that at the database.
--
-- WHAT IT DOES
--   1. Guards: aborts (rolling the whole script back) if the profiles
--      table is missing, or if the signup helper is_username_taken is
--      NOT SECURITY DEFINER — because that function reads
--      profiles.username as anon during registration, and a plain
--      (invoker) version would break the moment we hide the column.
--   2. Adds four SECURITY DEFINER lookup functions so the member app
--      and the admin app keep working WITHOUT direct column access:
--        library_adam_profile()      — the curated 'adam' shelf author
--        admin_can_view_members()    — internal admin gate
--        admin_member_lookup(uuid[]) — admin: profiles incl. username
--        admin_member_search(text)   — admin: ilike search incl. username
--   3. Locks the column: revokes table-level SELECT from public/anon/
--      authenticated, then re-grants EVERY column EXCEPT username to
--      authenticated (members + admin app). service_role keeps full
--      access for the Node server and superuser tooling.
--      NOTE: you cannot subtract one column from a table-level grant,
--      so the whole grant is replaced with an explicit column list.
--      The list is generated from information_schema, so no column is
--      missed and future columns just need a re-run.
--
-- AFTER RUNNING
--   Deploy the matching client changes (already edited in the repo):
--     public/dashboard/assets/js/store.js      (own username from JWT)
--     public/dashboard/assets/js/views/settings.js  (no select('*'))
--     public/dashboard/assets/js/views/portfolio.js (no select('*'))
--     public/dashboard/assets/js/views/library.js   (adam via RPC)
--     admin/assets/js/store.js, submissions.js, reports.js, admins.js
--   The admin app runs as `authenticated` and passes admin_can_view_members().
-- ============================================================

select pg_advisory_xact_lock(hashtext('gliimu-username-privacy-b'));

-- ------------------------------------------------------------
-- 0. GUARDS — fail loud before anything changes.
-- ------------------------------------------------------------
do $$ begin
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is MISSING — nothing to lock.';
  end if;

  -- Signup availability check runs as anon and reads profiles.username.
  -- If it is not SECURITY DEFINER, hiding the column breaks registration,
  -- so abort and leave the database untouched.
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'is_username_taken'
       and p.prosecdef = false
  ) then
    raise exception 'public.is_username_taken is NOT SECURITY DEFINER — convert it first (it reads profiles.username during signup), or registration will break.';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. Member-facing lookup for the curated 'adam' shelf author.
--    No user input, so it is not a username-enumeration oracle; it
--    returns only public-ish fields (id, full_name, avatar_url).
-- ------------------------------------------------------------
create or replace function public.library_adam_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'id', p.id,
           'full_name', p.full_name,
           'avatar_url', p.avatar_url)
    from public.profiles p
   where p.username = 'adam'
   limit 1;
$$;

revoke execute on function public.library_adam_profile() from public, anon;
grant execute on function public.library_adam_profile() to authenticated, service_role;

-- ------------------------------------------------------------
-- 2. Admin gate: caller is a legacy profiles.is_admin/super, OR holds
--    ANY row in admin_users (crm, registrar, captain, operations).
-- ------------------------------------------------------------
create or replace function public.admin_can_view_members()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (select 1 from public.admin_users a where a.user_id = auth.uid());
$$;

revoke execute on function public.admin_can_view_members() from public, anon;
grant execute on function public.admin_can_view_members() to authenticated, service_role;

-- ------------------------------------------------------------
-- 3. Admin batch lookup by id — returns the profile fields the CRM,
--    submissions and reports screens render, INCLUDING username.
--    Non-admins get zero rows (the gate is a WHERE, not a raise).
-- ------------------------------------------------------------
create or replace function public.admin_member_lookup(p_ids uuid[])
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  total_gp integer,
  tier text,
  is_admin boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id::uuid,
         p.username::text,
         p.full_name::text,
         p.avatar_url::text,
         p.total_gp::integer,
         p.tier::text,
         p.is_admin::boolean
    from public.profiles p
   where p.id = any (p_ids)
     and public.admin_can_view_members();
$$;

revoke execute on function public.admin_member_lookup(uuid[]) from public, anon;
grant execute on function public.admin_member_lookup(uuid[]) to authenticated, service_role;

-- ------------------------------------------------------------
-- 4. Admin member search by username/full_name (adds-a-admin screen).
-- ------------------------------------------------------------
create or replace function public.admin_member_search(p_term text, p_limit integer default 8)
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id::uuid,
         p.username::text,
         p.full_name::text,
         p.avatar_url::text
    from public.profiles p
   where public.admin_can_view_members()
     and (p.username ilike '%' || p_term || '%'
          or p.full_name ilike '%' || p_term || '%')
   limit p_limit;
$$;

revoke execute on function public.admin_member_search(text, integer) from public, anon;
grant execute on function public.admin_member_search(text, integer) to authenticated, service_role;

-- ------------------------------------------------------------
-- 5. Lock the username column.
--    Replace the table-level SELECT grant with an explicit column list
--    that omits username. Generated from information_schema so every
--    current column (except username) stays readable by authenticated.
-- ------------------------------------------------------------
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'profiles'
     and column_name <> 'username';

  if coalesce(cols, '') = '' then
    raise exception 'profiles column list came back empty — aborting, nothing changed.';
  end if;

  -- Drop every broad grant first (a table-level grant implies all columns
  -- and cannot have a single column subtracted from it).
  revoke select on public.profiles from public;
  revoke select on public.profiles from anon;
  revoke select on public.profiles from authenticated;

  -- Members + admin app keep every column EXCEPT username.
  execute format('grant select (%s) on public.profiles to authenticated', cols);

  -- Server / superuser tooling keep full access, including username.
  grant select on public.profiles to service_role;
end $$;

notify pgrst, 'reload schema';

-- ============================================================
-- SELF CHECK — read the grid after running. Every row should be true.
-- ============================================================
select '01. profiles exists'                                   as item,
       (to_regclass('public.profiles') is not null)::text      as result
union all
select '02. anon CANNOT select username',
       (not has_column_privilege('anon', 'public.profiles', 'username', 'SELECT'))::text
union all
select '03. authenticated CANNOT select username',
       (not has_column_privilege('authenticated', 'public.profiles', 'username', 'SELECT'))::text
union all
select '04. service_role CAN select username',
       has_column_privilege('service_role', 'public.profiles', 'username', 'SELECT')::text
union all
select '05. authenticated CAN select full_name',
       has_column_privilege('authenticated', 'public.profiles', 'full_name', 'SELECT')::text
union all
select '06. authenticated CAN select id',
       has_column_privilege('authenticated', 'public.profiles', 'id', 'SELECT')::text
union all
select '07. authenticated CAN select recovery_phrase',
       has_column_privilege('authenticated', 'public.profiles', 'recovery_phrase', 'SELECT')::text
union all
select '08. library_adam_profile() exists',
       (to_regprocedure('public.library_adam_profile()') is not null)::text
union all
select '09. admin_can_view_members() exists',
       (to_regprocedure('public.admin_can_view_members()') is not null)::text
union all
select '10. admin_member_lookup(uuid[]) exists',
       (to_regprocedure('public.admin_member_lookup(uuid[])') is not null)::text
union all
select '11. admin_member_search(text,integer) exists',
       (to_regprocedure('public.admin_member_search(text,integer)') is not null)::text
union all
select '12. is_username_taken definer (or absent)',
       (not exists (
          select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'is_username_taken' and p.prosecdef = false
       ))::text
order by "item";
