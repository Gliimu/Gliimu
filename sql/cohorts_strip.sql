-- sql/cohorts_strip.sql — Operations controls for the XpLoRe cohort strip
-- Idempotent. Safe to re-run. Non-destructive (adds two columns, redefines RPCs).
--
-- What it does:
--   1. cohorts.strip_visible boolean NOT NULL DEFAULT true  — admin Show/Hide switch
--   2. cohorts.strip_label  text                             — optional custom strip text
--   3. get_active_cohort() hides the strip when strip_visible = false and returns
--      strip_label so members see the custom text (blank = the cohort title).
--   4. operations_cohort_state() reports the two fields back to the admin app.
--   5. operations_set_cohort_strip(p_visible, p_label) — one-click save, operations role.
--
-- PASTE STEPS: Supabase dashboard → SQL Editor → New query → paste whole file → Run.
-- Then check the SELF CHECK grid at the bottom: every row must read ok = true (8 rows).

-- ============================================================
-- 1. COLUMNS
-- ============================================================
alter table public.cohorts
  add column if not exists strip_visible boolean not null default true,
  add column if not exists strip_label text;

-- ============================================================
-- 2. MEMBER RPC — strip read (hidden strip = no cohort returned)
-- ============================================================
create or replace function public.get_active_cohort()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'cohort', (
      select jsonb_build_object(
        'id', c.id,
        'title', c.title,
        'strip_visible', c.strip_visible,
        'strip_label', c.strip_label,
        'required_count', c.required_count,
        'interested_count', (select count(*) from public.cohort_interest ci where ci.cohort_id = c.id),
        'my_status', (select ci.status from public.cohort_interest ci
                       where ci.cohort_id = c.id and ci.user_id = auth.uid())
      )
      from public.cohorts c
      where c.status = 'active'
        and coalesce(c.strip_visible, true)
      limit 1
    )
  );
$$;

-- ============================================================
-- 3. OPERATIONS RPC — state now reports the strip fields
-- ============================================================
create or replace function public.operations_cohort_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_active public.cohorts%rowtype;
  v_found boolean;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not (public.admin_has_role(uid, 'operations') or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;

  select * into v_active from public.cohorts where status = 'active' limit 1;
  v_found := found;

  return jsonb_build_object(
    'ok', true,
    'active', case when v_found then jsonb_build_object(
      'id', v_active.id,
      'title', v_active.title,
      'required_count', v_active.required_count,
      'requirements_url', v_active.requirements_url,
      'due_date', v_active.due_date,
      'created_at', v_active.created_at,
      'strip_visible', coalesce(v_active.strip_visible, true),
      'strip_label', v_active.strip_label,
      'interested_count', (select count(*) from public.cohort_interest ci where ci.cohort_id = v_active.id),
      'approved_count', (select count(*) from public.cohort_interest ci
                          where ci.cohort_id = v_active.id and ci.status = 'approved'),
      'members', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'user_id', ci.user_id,
                 'full_name', p.full_name,
                 'avatar_url', p.avatar_url,
                 'status', ci.status,
                 'joined_at', ci.created_at
               ) order by ci.created_at), '[]'::jsonb)
        from public.cohort_interest ci
        join public.profiles p on p.id = ci.user_id
        where ci.cohort_id = v_active.id
      )
    ) else null end,
    'past', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id,
               'title', c.title,
               'required_count', c.required_count,
               'interested_count', (select count(*) from public.cohort_interest ci where ci.cohort_id = c.id),
               'approved_count', (select count(*) from public.cohort_interest ci
                                   where ci.cohort_id = c.id and ci.status = 'approved'),
               'ended_at', c.ended_at
             ) order by c.ended_at desc), '[]'::jsonb)
      from (
        select * from public.cohorts where status = 'ended' order by ended_at desc limit 10
      ) c
    )
  );
end
$$;

-- ============================================================
-- 4. OPERATIONS RPC — one-click strip save
--    p_label blank or null clears the override (strip shows the cohort title).
-- ============================================================
create or replace function public.operations_set_cohort_strip(
  p_visible boolean,
  p_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_label text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not (public.admin_has_role(uid, 'operations') or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if p_visible is null then
    return jsonb_build_object('ok', false, 'code', 'BAD_VISIBLE');
  end if;
  if not exists (select 1 from public.cohorts where status = 'active') then
    return jsonb_build_object('ok', false, 'code', 'COHORT_CLOSED');
  end if;

  v_label := nullif(btrim(coalesce(p_label, '')), '');
  if v_label is not null and char_length(v_label) > 120 then
    return jsonb_build_object('ok', false, 'code', 'BAD_LABEL');
  end if;

  update public.cohorts
     set strip_visible = p_visible,
         strip_label = v_label
   where status = 'active'
   returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end
$$;

revoke all on function public.get_active_cohort() from public, anon;
grant execute on function public.get_active_cohort() to authenticated, service_role;

revoke all on function public.operations_cohort_state() from public, anon;
grant execute on function public.operations_cohort_state() to authenticated, service_role;

revoke all on function public.operations_set_cohort_strip(boolean, text) from public, anon;
grant execute on function public.operations_set_cohort_strip(boolean, text) to authenticated, service_role;

-- ============================================================
-- SELF CHECK — every row must read ok = true
-- ============================================================
select 1 as "#", 'strip_visible column exists (defaults true)' as item,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'cohorts'
                  and column_name = 'strip_visible'
                  and column_default like '%true%'
                  and is_nullable = 'NO') as ok
union all
select 2, 'strip_label column exists',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'cohorts'
                  and column_name = 'strip_label')
union all
select 3, 'get_active_cohort() hides hidden strips',
       (select prosrc from pg_proc
         where oid = to_regprocedure('public.get_active_cohort()'))
       ilike '%coalesce(c.strip_visible, true)%'
union all
select 4, 'get_active_cohort() returns the custom strip label',
       (select prosrc from pg_proc
         where oid = to_regprocedure('public.get_active_cohort()'))
       ilike '%strip_label%'
union all
select 5, 'operations_set_cohort_strip() exists and authenticated may call it',
       exists (select 1 from pg_proc
                where oid = to_regprocedure('public.operations_set_cohort_strip(boolean,text)'))
       and has_function_privilege('authenticated', 'public.operations_set_cohort_strip(boolean,text)', 'EXECUTE')
union all
select 6, 'operations_set_cohort_strip() checks the operations role',
       (select prosrc from pg_proc
         where oid = to_regprocedure('public.operations_set_cohort_strip(boolean,text)'))
       ilike '%admin_has_role(uid, ''operations'')%'
union all
select 7, 'operations_set_cohort_strip() needs an active cohort',
       (select prosrc from pg_proc
         where oid = to_regprocedure('public.operations_set_cohort_strip(boolean,text)'))
       ilike '%COHORT_CLOSED%'
union all
select 8, 'operations_cohort_state() reports strip_visible + strip_label',
       (select prosrc from pg_proc
         where oid = to_regprocedure('public.operations_cohort_state()'))
       ilike '%strip_visible%'
       and (select prosrc from pg_proc
             where oid = to_regprocedure('public.operations_cohort_state()'))
       ilike '%strip_label%'
order by "#";
