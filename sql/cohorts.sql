-- sql/cohorts.sql — Operations-run cohorts with an XpLoRe join strip
-- Run once on Supabase. Additive and idempotent — safe to run twice.
--
-- What this does:
--   1. Creates public.cohorts (one active at a time, enforced by a partial
--      unique index) and public.cohort_interest (who tapped the strip).
--   2. Members never read the tables directly — everything goes through
--      SECURITY DEFINER RPCs, so the requirements PDF URL never reaches a
--      member who was not accepted.
--   3. get_active_cohort() powers the strip ("2/9 Full Stack Media
--      Architecture"); cohort_show_interest() records a member's tap.
--   4. operations_* RPCs let the Operations role start, watch and end a
--      cohort, and approve or decline each interested member. Approving
--      writes the congratulations notification, attaching the requirements
--      PDF through the new notifications.link_url column.
--   5. Self-check grid at the bottom.

-- ============================================================
-- 1. TABLES
-- ============================================================
create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  required_count integer not null check (required_count between 1 and 999),
  requirements_url text,
  due_date date,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

-- One cohort may be open at a time: every row matching the index predicate
-- holds the same status value, so uniqueness on it caps the table at one.
create unique index if not exists cohorts_one_active_idx
  on public.cohorts (status) where status = 'active';

create table if not exists public.cohort_interest (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'interested' check (status in ('interested', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  primary key (cohort_id, user_id)
);

create index if not exists cohort_interest_cohort_idx
  on public.cohort_interest (cohort_id, created_at);

alter table public.cohorts enable row level security;
alter table public.cohort_interest enable row level security;

-- No member policies on purpose: reads and writes both flow through the RPCs
-- below, so the tables stay invisible to the Data API.
revoke all on public.cohorts from anon, authenticated;
revoke all on public.cohort_interest from anon, authenticated;
grant all on public.cohorts to service_role;
grant all on public.cohort_interest to service_role;

-- ============================================================
-- 2. MEMBER RPCs — strip read + tap
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
        'required_count', c.required_count,
        'interested_count', (select count(*) from public.cohort_interest ci where ci.cohort_id = c.id),
        'my_status', (select ci.status from public.cohort_interest ci
                       where ci.cohort_id = c.id and ci.user_id = auth.uid())
      )
      from public.cohorts c
      where c.status = 'active'
      limit 1
    )
  );
$$;

create or replace function public.cohort_show_interest(p_cohort uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not exists (
    select 1 from public.cohorts where id = p_cohort and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'code', 'COHORT_CLOSED');
  end if;

  insert into public.cohort_interest (cohort_id, user_id)
  values (p_cohort, v_uid)
  on conflict (cohort_id, user_id) do nothing;

  select count(*) into v_count from public.cohort_interest where cohort_id = p_cohort;

  return jsonb_build_object('ok', true, 'interested_count', v_count, 'my_status', 'interested');
end
$$;

-- ============================================================
-- 3. OPERATIONS RPCs — start, watch, decide, end
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

create or replace function public.operations_start_cohort(
  p_title text,
  p_required_count integer,
  p_requirements_url text default null,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
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

  insert into public.cohorts (title, required_count, requirements_url, due_date, created_by)
  values (btrim(p_title), p_required_count, nullif(btrim(coalesce(p_requirements_url, '')), ''), p_due_date, uid)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end
$$;

create or replace function public.operations_end_cohort(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not (public.admin_has_role(uid, 'operations') or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;

  update public.cohorts
     set status = 'ended', ended_at = now()
   where id = p_id and status = 'active';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_ACTIVE');
  end if;

  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.operations_decide_cohort_member(
  p_cohort uuid,
  p_user uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_cohort public.cohorts%rowtype;
  v_body text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not (public.admin_has_role(uid, 'operations') or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPERATIONS');
  end if;
  if p_decision not in ('approve', 'decline') then
    return jsonb_build_object('ok', false, 'code', 'BAD_ACTION');
  end if;

  select * into v_cohort from public.cohorts where id = p_cohort;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  update public.cohort_interest
     set status = case p_decision when 'approve' then 'approved' else 'declined' end,
         decided_at = now(),
         decided_by = uid
   where cohort_id = p_cohort and user_id = p_user;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_INTERESTED');
  end if;

  if p_decision = 'approve' then
    v_body := 'You have been accepted to participate in the 2026 co-hort.';
    if v_cohort.requirements_url is not null or v_cohort.due_date is not null then
      v_body := v_body || ' Read the requirements below to finalize the process'
        || case when v_cohort.due_date is not null
                then ' before ' || to_char(v_cohort.due_date, 'DD Month YYYY')
                else '' end
        || '.';
    end if;

    insert into public.notifications (user_id, actor_id, kind, title, body, link_url)
    values (p_user, uid, 'system', 'Congratulations!', v_body, v_cohort.requirements_url);
  end if;

  return jsonb_build_object('ok', true, 'status', case p_decision when 'approve' then 'approved' else 'declined' end);
end
$$;

revoke all on function public.get_active_cohort() from public, anon;
grant execute on function public.get_active_cohort() to authenticated, service_role;

revoke all on function public.cohort_show_interest(uuid) from public, anon;
grant execute on function public.cohort_show_interest(uuid) to authenticated, service_role;

revoke all on function public.operations_cohort_state() from public, anon;
grant execute on function public.operations_cohort_state() to authenticated, service_role;

revoke all on function public.operations_start_cohort(text, integer, text, date) from public, anon;
grant execute on function public.operations_start_cohort(text, integer, text, date) to authenticated, service_role;

revoke all on function public.operations_end_cohort(uuid) from public, anon;
grant execute on function public.operations_end_cohort(uuid) to authenticated, service_role;

revoke all on function public.operations_decide_cohort_member(uuid, uuid, text) from public, anon;
grant execute on function public.operations_decide_cohort_member(uuid, uuid, text) to authenticated, service_role;

-- ============================================================
-- 4. NOTIFICATIONS — generic document link for the requirements PDF
-- ============================================================
alter table public.notifications add column if not exists link_url text;

-- ============================================================
-- SELF CHECK
-- ============================================================
select 1 as "#", 'cohorts table exists with RLS enabled' as item,
       exists (select 1 from pg_tables
                where schemaname = 'public' and tablename = 'cohorts' and rowsecurity = true) as ok
union all
select 2, 'cohort_interest table exists with RLS enabled',
       exists (select 1 from pg_tables
                where schemaname = 'public' and tablename = 'cohort_interest' and rowsecurity = true)
union all
select 3, 'one-active-at-a-time partial unique index exists',
       exists (select 1 from pg_indexes
                where schemaname = 'public' and tablename = 'cohorts'
                  and indexname = 'cohorts_one_active_idx')
union all
select 4, 'no RLS policies leak the tables to members',
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename in ('cohorts', 'cohort_interest')) = 0
union all
select 5, 'anon has no privileges on either table',
       not has_table_privilege('anon', 'public.cohorts', 'SELECT')
       and not has_table_privilege('anon', 'public.cohort_interest', 'SELECT')
union all
select 6, 'get_active_cohort() exists and authenticated may call it',
       exists (select 1 from pg_proc
                where oid = to_regprocedure('public.get_active_cohort()'))
       and has_function_privilege('authenticated', 'public.get_active_cohort()', 'EXECUTE')
union all
select 7, 'cohort_show_interest() dedupes on (cohort_id, user_id)',
       (select prosrc from pg_proc
         where oid = to_regprocedure('public.cohort_show_interest(uuid)'))
       ilike '%on conflict (cohort_id, user_id) do nothing%'
union all
select 8, 'operations RPCs check the operations role',
       (select prosrc from pg_proc
         where oid = to_regprocedure('public.operations_start_cohort(text,integer,text,date)'))
       ilike '%admin_has_role(uid, ''operations'')%'
       and (select prosrc from pg_proc
             where oid = to_regprocedure('public.operations_cohort_state()'))
       ilike '%admin_has_role(uid, ''operations'')%'
union all
select 9, 'decide RPC writes the congratulations notification',
       (select prosrc from pg_proc
         where oid = to_regprocedure('public.operations_decide_cohort_member(uuid,uuid,text)'))
       ilike '%insert into public.notifications%'
union all
select 10, 'notifications.link_url column exists',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'notifications'
                  and column_name = 'link_url')
order by "#";
