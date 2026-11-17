-- Private per-member Team-up list. Idempotent and safe to re-run.

create table if not exists public.team_up_members (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (owner_id, member_id),
  constraint team_up_no_self check (owner_id <> member_id)
);

create index if not exists idx_team_up_members_member
  on public.team_up_members(member_id);

alter table public.team_up_members enable row level security;
revoke all on public.team_up_members from anon;
grant select, insert, delete on public.team_up_members to authenticated;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'team_up_members'
      and policyname = 'team_up_select_own'
  ) then
    create policy "team_up_select_own" on public.team_up_members
      for select to authenticated
      using ((select auth.uid()) = owner_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'team_up_members'
      and policyname = 'team_up_insert_own'
  ) then
    create policy "team_up_insert_own" on public.team_up_members
      for insert to authenticated
      with check ((select auth.uid()) = owner_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'team_up_members'
      and policyname = 'team_up_delete_own'
  ) then
    create policy "team_up_delete_own" on public.team_up_members
      for delete to authenticated
      using ((select auth.uid()) = owner_id);
  end if;
end $$;

create or replace function public.team_up_list()
returns table (
  member_id uuid,
  full_name text,
  avatar_url text,
  added_at timestamptz,
  last_received_at timestamptz,
  latest_gliim_at timestamptz,
  activity_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  with members as (
    select
      tm.member_id,
      p.full_name,
      p.avatar_url,
      tm.added_at,
      incoming.last_received_at,
      gliims.latest_gliim_at
    from public.team_up_members tm
    join public.profiles p on p.id = tm.member_id
    left join lateral (
      select max(m.created_at) as last_received_at
      from public.messages m
      where m.receiver_id = auth.uid()
        and m.sender_id = tm.member_id
        and (m.room is null or m.room = '')
        and m.is_ai is not true
        and m.is_admin is not true
    ) incoming on true
    left join lateral (
      select max(g.created_at) as latest_gliim_at
      from public.feed_gliims g
      where g.user_id = tm.member_id
        and g.status = 'approved'
        and g.deleted_at is null
    ) gliims on true
    where tm.owner_id = auth.uid()
  )
  select
    member_id,
    full_name,
    avatar_url,
    added_at,
    last_received_at,
    latest_gliim_at,
    coalesce(greatest(last_received_at, latest_gliim_at), added_at) as activity_at
  from members
  order by activity_at desc, full_name asc nulls last, member_id;
$$;

create or replace function public.team_up_add(p_member_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;
  if v_owner = p_member_id then
    return jsonb_build_object('ok', false, 'error', 'CANNOT_ADD_SELF');
  end if;
  if not exists (select 1 from public.profiles where id = p_member_id) then
    return jsonb_build_object('ok', false, 'error', 'USER_NOT_FOUND');
  end if;

  insert into public.team_up_members (owner_id, member_id)
  values (v_owner, p_member_id)
  on conflict (owner_id, member_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.team_up_remove(p_member_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  delete from public.team_up_members
  where owner_id = v_owner and member_id = p_member_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.team_up_list() from public, anon;
grant execute on function public.team_up_list() to authenticated;
revoke execute on function public.team_up_add(uuid) from public, anon;
grant execute on function public.team_up_add(uuid) to authenticated;
revoke execute on function public.team_up_remove(uuid) from public, anon;
grant execute on function public.team_up_remove(uuid) to authenticated;

select 'team_up_members table exists' as check_name,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'team_up_members'
  ) as result
union all
select 'RLS enabled', relrowsecurity from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'team_up_members'
union all
select '3 owner-only policies', count(*) = 3 from pg_policies
  where schemaname = 'public' and tablename = 'team_up_members'
union all
select 'No self membership constraint', exists (
  select 1 from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relname = 'team_up_members'
    and c.conname = 'team_up_no_self' and c.contype = 'c'
)
union all
select 'team_up_list RPC', to_regprocedure('public.team_up_list()') is not null
union all
select 'team_up_add RPC', to_regprocedure('public.team_up_add(uuid)') is not null
union all
select 'team_up_remove RPC', to_regprocedure('public.team_up_remove(uuid)') is not null
union all
select 'authenticated can list', has_function_privilege('authenticated', 'public.team_up_list()', 'EXECUTE')
union all
select 'authenticated can add', has_function_privilege('authenticated', 'public.team_up_add(uuid)', 'EXECUTE')
union all
select 'authenticated can remove', has_function_privilege('authenticated', 'public.team_up_remove(uuid)', 'EXECUTE')
union all
select 'anon cannot read table', not has_table_privilege('anon', 'public.team_up_members', 'SELECT')
union all
select 'anon cannot execute list', not has_function_privilege('anon', 'public.team_up_list()', 'EXECUTE')
union all
select 'all RPCs use security invoker', count(*) = 3
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('team_up_list', 'team_up_add', 'team_up_remove')
    and p.prosecdef is false;
