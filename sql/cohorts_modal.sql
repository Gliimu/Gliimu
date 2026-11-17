-- sql/cohorts_modal.sql — XpLoRe refresh-only cohort modal
-- Additive and idempotent. Safe to re-run.
--
-- Adds an Operations-owned description, returns accepted-member avatars through
-- the existing secured member RPC, and lets Operations describe both new and
-- existing cohorts. The retired inline strip no longer controls visibility.
--
-- PASTE STEPS: Supabase dashboard → SQL Editor → New query → paste whole file → Run.
-- Then check the SELF CHECK grid at the bottom: every row must read ok = true.

alter table public.cohorts
  add column if not exists description text;

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
        'description', c.description,
        'required_count', c.required_count,
        'interested_count', (select count(*) from public.cohort_interest ci where ci.cohort_id = c.id),
        'my_status', (select ci.status from public.cohort_interest ci
                       where ci.cohort_id = c.id and ci.user_id = auth.uid()),
        'accepted_members', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'user_id', accepted.user_id,
                   'full_name', accepted.full_name,
                   'avatar_url', accepted.avatar_url
                 ) order by accepted.joined_at), '[]'::jsonb)
          from (
            select ci.user_id, p.full_name, p.avatar_url,
                   coalesce(ci.decided_at, ci.created_at) as joined_at
            from public.cohort_interest ci
            join public.profiles p on p.id = ci.user_id
            where ci.cohort_id = c.id and ci.status = 'approved'
          ) accepted
        )
      )
      from public.cohorts c
      where c.status = 'active'
      limit 1
    )
  );
$$;

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
      'description', v_active.description,
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

-- The original four-argument RPC remains in place for existing callers.
create or replace function public.operations_start_cohort(
  p_title text,
  p_required_count integer,
  p_requirements_url text,
  p_due_date date,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_description text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not (public.admin_has_role(uid, 'operations') or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if exists (select 1 from public.cohorts where status = 'active') then
    return jsonb_build_object('ok', false, 'code', 'COHORT_EXISTS');
  end if;
  if coalesce(btrim(p_title), '') = '' or char_length(btrim(p_title)) > 120 then
    return jsonb_build_object('ok', false, 'code', 'BAD_TITLE');
  end if;
  if p_required_count is null or p_required_count < 1 or p_required_count > 999 then
    return jsonb_build_object('ok', false, 'code', 'BAD_COUNT');
  end if;

  v_description := nullif(btrim(coalesce(p_description, '')), '');
  if v_description is not null and char_length(v_description) > 500 then
    return jsonb_build_object('ok', false, 'code', 'BAD_DESCRIPTION');
  end if;

  insert into public.cohorts (title, description, required_count, requirements_url, due_date, created_by)
  values (btrim(p_title), v_description, p_required_count,
          nullif(btrim(coalesce(p_requirements_url, '')), ''), p_due_date, uid)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end
$$;

create or replace function public.operations_set_cohort_description(p_description text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_description text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not (public.admin_has_role(uid, 'operations') or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;

  v_description := nullif(btrim(coalesce(p_description, '')), '');
  if v_description is not null and char_length(v_description) > 500 then
    return jsonb_build_object('ok', false, 'code', 'BAD_DESCRIPTION');
  end if;

  update public.cohorts
     set description = v_description
   where status = 'active'
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'code', 'COHORT_CLOSED');
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end
$$;

revoke all on function public.get_active_cohort() from public, anon;
grant execute on function public.get_active_cohort() to authenticated, service_role;

revoke all on function public.operations_cohort_state() from public, anon;
grant execute on function public.operations_cohort_state() to authenticated, service_role;

revoke all on function public.operations_start_cohort(text, integer, text, date, text) from public, anon;
grant execute on function public.operations_start_cohort(text, integer, text, date, text) to authenticated, service_role;

revoke all on function public.operations_set_cohort_description(text) from public, anon;
grant execute on function public.operations_set_cohort_description(text) to authenticated, service_role;

-- SELF CHECK — every row must read ok = true
select 1 as "#", 'cohort description column exists' as item,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'cohorts'
                  and column_name = 'description') as ok
union all
select 2, 'member RPC returns description',
       (select prosrc from pg_proc where oid = 'public.get_active_cohort()'::regprocedure)
       ilike '%''description'', c.description%'
union all
select 3, 'member RPC returns approved avatars only',
       (select prosrc from pg_proc where oid = 'public.get_active_cohort()'::regprocedure)
       ilike '%ci.status = ''approved''%'
       and (select prosrc from pg_proc where oid = 'public.get_active_cohort()'::regprocedure)
       ilike '%''accepted_members''%'
union all
select 4, 'old strip visibility no longer hides the active cohort',
       (select prosrc from pg_proc where oid = 'public.get_active_cohort()'::regprocedure)
       not ilike '%coalesce(c.strip_visible, true)%'
union all
select 5, 'five-argument start RPC exists and authenticated may call it',
       exists (select 1 from pg_proc
                where oid = 'public.operations_start_cohort(text,integer,text,date,text)'::regprocedure)
       and has_function_privilege('authenticated', 'public.operations_start_cohort(text,integer,text,date,text)', 'EXECUTE')
union all
select 6, 'description editor checks Operations and is callable',
       (select prosrc from pg_proc
         where oid = 'public.operations_set_cohort_description(text)'::regprocedure)
       ilike '%admin_has_role(uid, ''operations'')%'
       and has_function_privilege('authenticated', 'public.operations_set_cohort_description(text)', 'EXECUTE')
union all
select 7, 'Operations state reports the description',
       (select prosrc from pg_proc where oid = 'public.operations_cohort_state()'::regprocedure)
       ilike '%''description'', v_active.description%'
order by "#";
