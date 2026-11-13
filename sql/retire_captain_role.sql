-- ============================================================
-- RETIRE THE 'captain' ADMIN ROLE (DECISION REQUIRED — run once)
-- ============================================================
-- 'captain' was the role that gated the triads screen. Triads went out with
-- the Events feature, so the admin app no longer has a captain page at all —
-- but the database still hands the role out, and one real person still holds
-- it. That person signs in to an empty admin app.
--
-- WHAT THIS SCRIPT CHANGES (three live objects, verified 2026-11-12):
--   REWRITTEN CONSTRAINT  public.admin_users_role_check
--                         was: role in (super, crm, registrar, captain, operations)
--                         now: role in (super, crm, registrar, operations)
--   REWRITTEN FUNCTIONS   public.admin_grant_role(uuid, text, text) — no longer
--                         accepts 'captain' as a role;
--                         public.support_can_view(uuid) — no longer counts
--                         'captain' as staff.
--   NOTHING ELSE          No RLS policy, view or column default mentions the
--                         role. sql/admin.sql and sql/setup_core.sql already
--                         define only the four surviving roles, so this script
--                         is what makes the live database agree with them.
--
-- THE ONE ROW THAT HAS TO BE DECIDED BY YOU
--   user_id   60caafaf-bd97-4b12-9576-645627b5c3eb  (finiks@gliimu.app)
--   role      captain
--   note      (none)
--   added_by  cc4c8d1f-8661-43ca-963f-668ba3452c94  (adam@gliimu.app, the super)
--   since     2026-10-17
--   profiles.is_admin for that account is FALSE, so removing the admin_users
--   row removes admin sign-in completely — nothing else keeps them in.
--
--   Section 2 is the decision, and it is deliberately left commented out.
--   Pick ONE option, uncomment it, then run the whole file. Section 3 refuses
--   to migrate while any captain row is still present, so if you run this file
--   as it ships it stops here and changes nothing at all.
--
-- TWO THINGS TO KNOW BEFORE YOU PICK
--   1. Support-desk visibility rides on this too. support_can_view() treats
--      every surviving admin role as staff, so a captain can already open the
--      Support desk. REASSIGN keeps that; DELETE takes the desk away as well
--      as the empty admin app.
--   2. Only Adam holds 'super', and only a super can call admin_grant_role().
--      If you delete the row, granting any kind of admin access back to that
--      person later means signing Adam in and re-granting by hand.
--
-- IDEMPOTENT: running it twice is safe. The archive SELECT in section 1 is
-- read-only — copy its output before you run the rest if you want the record.
-- ============================================================
-- HOW TO RUN
--   1. Open the Supabase SQL editor, paste this whole file.
--   2. Scroll to section 2 and either uncomment the reassign UPDATE (change
--      'operations' to the role you want) or uncomment the DELETE.
--   3. Run it. The last grid is the self check — every result must read OK.
--   4. If the run aborts with 'CAPTAIN ROW STILL PRESENT', you skipped step 2.
--      Nothing was changed; go back and choose an option.
-- ============================================================


-- ============================================================
-- 1. ARCHIVE — read-only. Copy the result grid out first.
-- ============================================================

select a.user_id, a.role, a.note, a.added_by, a.created_at,
       u.email as account_email
  from public.admin_users a
  left join auth.users u on u.id = a.user_id
 order by a.role, a.created_at;


-- ============================================================
-- 2. THE DECISION — uncomment exactly one of these three options
-- ============================================================

-- OPTION A — move the person to a role that has a real screen.
--   'crm'         library submissions, reports, FAQs, legal text, contact
--                 details
--   'operations'  landing page media, app release, Arena, Cohorts, Deleted
--   'registrar'   finance, ledger, members, revenue, pricing
--
-- update public.admin_users
--    set role = 'operations',
--        note = 'Retired captain role reassigned 2026-11-12 — sql/retire_captain_role.sql'
--  where role = 'captain';

-- OPTION B — that person is no longer staff. Drops admin sign-in entirely
--   (their profiles.is_admin is already false).
--
-- delete from public.admin_users where role = 'captain';

-- OPTION C — do nothing yet. Leave every option commented: section 3 aborts
--   the run, the constraint and functions stay as they are, and you can decide
--   later without anything half-migrated.


-- ============================================================
-- 3. GUARD — refuse to migrate while a captain row is still there
-- ============================================================
-- Without this the section 4 constraint would fail with a bare 23514 check
-- violation, which says nothing about the row you still have to decide on.

do $$
declare
  v_left integer;
begin
  select count(*) into v_left from public.admin_users where role = 'captain';
  if v_left > 0 then
    raise exception
      'CAPTAIN ROW STILL PRESENT: % admin_users row(s) still hold the retired captain role. Go to section 2 and uncomment either the reassign UPDATE or the DELETE, then run the file again. Nothing has been changed.',
      v_left;
  end if;
end
$$;


-- ============================================================
-- 4. THE ROLE CHECK CONSTRAINT
-- ============================================================

alter table public.admin_users drop constraint if exists admin_users_role_check;

alter table public.admin_users
  add constraint admin_users_role_check
  check (role in ('super', 'crm', 'registrar', 'operations'));


-- ============================================================
-- 5. THE TWO FUNCTIONS THAT NAMED THE ROLE
-- ============================================================
-- Same signatures, so PostgREST callers are unaffected — only the role lists
-- change. Both keep SECURITY DEFINER with a pinned search_path, and the grants
-- are re-applied because a recreated function would otherwise fall back to the
-- default PUBLIC execute grant.

create or replace function public.admin_grant_role(
  p_user uuid,
  p_role text,
  p_note text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not public.admin_has_role(uid, 'super') then
    return jsonb_build_object('ok', false, 'code', 'NOT_SUPER');
  end if;

  if p_role not in ('super', 'crm', 'registrar', 'operations') then
    return jsonb_build_object('ok', false, 'code', 'BAD_ROLE');
  end if;

  if not exists (select 1 from public.profiles where id = p_user) then
    return jsonb_build_object('ok', false, 'code', 'NO_USER');
  end if;

  insert into public.admin_users (user_id, role, note, added_by)
  values (p_user, p_role, p_note, uid)
  on conflict (user_id) do update
     set role = excluded.role, note = excluded.note;

  -- Supers keep the legacy dashboard admin UI working, which reads
  -- profiles.is_admin directly rather than calling is_admin().
  if p_role = 'super' then
    update public.profiles set is_admin = true where id = p_user;
  end if;

  return jsonb_build_object('ok', true, 'role', p_role);
end
$$;

create or replace function public.support_can_view(p_user uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path = public
as $$
  select coalesce((
    select a.role in ('crm', 'operations', 'super', 'registrar')
      from public.admin_users a
     where a.user_id = p_user
  ), false);
$$;

revoke execute on function public.admin_grant_role(uuid, text, text) from public, anon;
revoke execute on function public.support_can_view(uuid)              from public, anon;
grant  execute on function public.admin_grant_role(uuid, text, text) to authenticated, service_role;
grant  execute on function public.support_can_view(uuid)              to authenticated, service_role;


-- ============================================================
-- 6. REFRESH THE API CACHE
-- ============================================================

notify pgrst, 'reload schema';


-- ============================================================
-- SELF CHECK — every row must read OK
-- ============================================================

select 1 as "#", 'no admin_users row still holds captain' as item,
       case when (select count(*) from public.admin_users where role = 'captain') = 0
            then 'OK' else 'CHECK: still assigned' end as result
union all select 2, 'role constraint allows exactly the four surviving roles',
       case when pg_get_constraintdef(
                   (select c.oid from pg_constraint c
                     where c.conrelid = 'public.admin_users'::regclass
                       and c.conname = 'admin_users_role_check'))
                = 'CHECK ((role = ANY (ARRAY[''super''::text, ''crm''::text, ''registrar''::text, ''operations''::text])))'
            then 'OK' else coalesce('CHECK: ' || pg_get_constraintdef(
                   (select c.oid from pg_constraint c
                     where c.conrelid = 'public.admin_users'::regclass
                       and c.conname = 'admin_users_role_check')), 'CHECK: constraint missing') end
union all select 3, 'role constraint is validated',
       case when (select convalidated from pg_constraint
                   where conrelid = 'public.admin_users'::regclass
                     and conname = 'admin_users_role_check')
            then 'OK' else 'CHECK: not validated' end
union all select 4, 'captain is now rejected by the constraint',
       case when not exists (
              select 1 from pg_constraint c
              where c.conrelid = 'public.admin_users'::regclass
                and pg_get_constraintdef(c.oid) like '%captain%')
            then 'OK' else 'CHECK: still allowed' end
union all select 5, 'admin_grant_role checks the four roles',
       case when (select prosrc from pg_proc
                   where oid = 'public.admin_grant_role(uuid,text,text)'::regprocedure)
                  ilike '%''super'', ''crm'', ''registrar'', ''operations''%'
            then 'OK' else 'CHECK: role list wrong' end
union all select 6, 'support_can_view checks the four roles',
       case when (select prosrc from pg_proc
                   where oid = 'public.support_can_view(uuid)'::regprocedure)
                  ilike '%''crm'', ''operations'', ''super'', ''registrar''%'
            then 'OK' else 'CHECK: role list wrong' end
union all select 7, 'no public function names ''captain'' as a role any more',
       case when (select count(*) from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public'
                    and p.prosrc ilike '%''captain''%') = 0
            then 'OK' else 'CHECK: still referenced' end
union all select 8, 'both functions still SECURITY DEFINER with a pinned search_path',
       case when (select bool_and(p.prosecdef and p.proconfig @> array['search_path=public'])
                   from pg_proc p
                  where p.oid in ('public.admin_grant_role(uuid,text,text)'::regprocedure,
                                  'public.support_can_view(uuid)'::regprocedure))
            then 'OK' else 'CHECK: attributes lost' end
union all select 9, 'signed-in staff can run both, anon can run neither',
       case when has_function_privilege('authenticated', 'public.admin_grant_role(uuid,text,text)', 'execute')
                and has_function_privilege('authenticated', 'public.support_can_view(uuid)', 'execute')
                and has_function_privilege('service_role', 'public.admin_grant_role(uuid,text,text)', 'execute')
                and not has_function_privilege('anon', 'public.admin_grant_role(uuid,text,text)', 'execute')
                and not has_function_privilege('anon', 'public.support_can_view(uuid)', 'execute')
            then 'OK' else 'CHECK: grants changed' end
union all select 10, 'the super admin row is still there',
       case when (select count(*) from public.admin_users where role = 'super') = 1
            then 'OK' else 'CHECK: ' ||
                 (select count(*)::text from public.admin_users where role = 'super') || ' supers' end
union all select 11, 'every remaining admin row is a real role',
       case when (select count(*) from public.admin_users
                   where role not in ('super', 'crm', 'registrar', 'operations')) = 0
            then 'OK' else 'CHECK: unknown role present' end
order by "#";
