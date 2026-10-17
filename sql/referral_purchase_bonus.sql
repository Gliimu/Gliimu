-- Run this whole script as postgres. It includes the base referrals setup.
-- Existing profiles, transactions and billing tables are required.
-- Both the 100 GP signup reward and 20 GP purchase bonus are platform-funded.
begin;

do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.transactions') is null then
    raise exception 'Missing core profiles or transactions table. Run this in the existing Gliimu project.';
  end if;
  if to_regclass('public.billing_events') is null then
    raise exception 'Missing billing setup. Run sql/billing.sql first.';
  end if;
end;
$$;

alter table public.profiles add column if not exists referral_code text;

create or replace function public.make_referral_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
  i integer;
begin
  for i in 1..8 loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
  end loop;
  return v_code;
end;
$$;

revoke execute on function public.make_referral_code() from public, anon, authenticated;

update public.profiles
set referral_code = public.make_referral_code()
where referral_code is null;

create unique index if not exists profiles_referral_code_uniq
  on public.profiles (referral_code) where referral_code is not null;

create or replace function public.profiles_assign_referral_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  loop
    new.referral_code := public.make_referral_code();
    exit when not exists (
      select 1 from public.profiles where referral_code = new.referral_code
    );
  end loop;
  return new;
end;
$$;

revoke execute on function public.profiles_assign_referral_code() from public, anon, authenticated;

drop trigger if exists profiles_assign_referral_code on public.profiles;
create trigger profiles_assign_referral_code
  before insert on public.profiles
  for each row execute function public.profiles_assign_referral_code();

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referee_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  status text not null default 'pending' check (status in ('pending', 'vested', 'invalid')),
  signup_reward_gp integer not null default 100,
  created_at timestamptz not null default now(),
  vested_at timestamptz
);

create unique index if not exists referrals_referee_once on public.referrals (referee_id);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, status);

alter table public.referrals enable row level security;
revoke all on public.referrals from public, anon, authenticated;

create or replace function public.apply_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_norm text;
  v_ref uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  v_norm := upper(btrim(coalesce(p_code, '')));
  if v_norm = '' then
    return jsonb_build_object('ok', false, 'code', 'NO_CODE');
  end if;

  perform pg_advisory_xact_lock(hashtext('referral:' || v_uid::text));

  if exists (select 1 from public.referrals where referee_id = v_uid) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select p.id into v_ref from public.profiles as p where p.referral_code = v_norm;
  if v_ref is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CODE');
  end if;
  if v_ref = v_uid then
    return jsonb_build_object('ok', false, 'code', 'SELF_REFERRAL');
  end if;

  insert into public.referrals (referrer_id, referee_id, code)
  values (v_ref, v_uid, v_norm);

  return jsonb_build_object('ok', true, 'attached', true);
end;
$$;

revoke execute on function public.apply_referral(text) from public, anon, authenticated;
grant execute on function public.apply_referral(text) to authenticated, service_role;

create or replace function public.referral_vest_due(p_referrer uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select rf.id, rf.referrer_id, rf.signup_reward_gp
    from public.referrals as rf
    where rf.status = 'pending'
      and rf.created_at <= now() - interval '1 day'
      and (p_referrer is null or rf.referrer_id = p_referrer)
      and exists (
        select 1 from public.billing_events as e
        where e.user_id = rf.referee_id and e.amount > 0
      )
    order by rf.referrer_id, rf.id
  loop
    update public.referrals
    set (status, vested_at) = ('vested', now())
    where id = r.id and status = 'pending';

    if found then
      update public.profiles
      set total_gp = coalesce(total_gp, 0) + r.signup_reward_gp
      where id = r.referrer_id;

      insert into public.transactions (user_id, amount, type, status, points, description)
      values (r.referrer_id, 0, 'reward', 'success', r.signup_reward_gp, 'Referral reward');

      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.referral_vest_due(uuid) from public, anon, authenticated;
grant execute on function public.referral_vest_due(uuid) to service_role;

alter table public.referrals add column if not exists purchase_bonus_gp integer;
alter table public.referrals add column if not exists purchase_bonus_at timestamptz;

create or replace function public.referral_purchase_bonus_due(p_referrer uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_bonus constant integer := 20;
  v_count integer := 0;
begin
  for r in
    select rf.id, rf.referrer_id
    from public.referrals as rf
    where rf.purchase_bonus_at is null
      and rf.status in ('pending', 'vested')
      and (p_referrer is null or rf.referrer_id = p_referrer)
      and exists (
        select 1
        from public.billing_events as e
        where e.user_id = rf.referee_id
          and e.amount > 0
          and e.created_at >= rf.created_at
      )
    order by rf.referrer_id, rf.id
  loop
    -- The conditional update prevents overlapping sweeps from paying twice.
    update public.referrals
    set (purchase_bonus_gp, purchase_bonus_at) = (v_bonus, now())
    where id = r.id
      and purchase_bonus_at is null
      and status in ('pending', 'vested');

    if found then
      update public.profiles
      set total_gp = coalesce(total_gp, 0) + v_bonus
      where id = r.referrer_id;

      insert into public.transactions (user_id, amount, type, status, points, description)
      values (r.referrer_id, 0, 'reward', 'success', v_bonus, 'Referral purchase bonus');

      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.referral_purchase_bonus_due(uuid) from public, anon, authenticated;
grant execute on function public.referral_purchase_bonus_due(uuid) to service_role;

create or replace function public.referral_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_summary jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('code', 'NOT_AUTHENTICATED');
  end if;

  perform public.referral_vest_due(v_uid);
  perform public.referral_purchase_bonus_due(v_uid);

  select p.referral_code into v_code
  from public.profiles as p
  where p.id = v_uid;

  select jsonb_build_object(
    'code', v_code,
    'link', '/?ref=' || coalesce(v_code, ''),
    'pending', count(*) filter (where rf.status = 'pending'),
    'vested', count(*) filter (where rf.status = 'vested'),
    'gp_earned', coalesce(sum(rf.signup_reward_gp) filter (where rf.status = 'vested'), 0)
      + coalesce(sum(rf.purchase_bonus_gp) filter (where rf.purchase_bonus_at is not null), 0),
    'purchase_count', count(*) filter (where rf.purchase_bonus_at is not null),
    'purchase_gp', coalesce(sum(rf.purchase_bonus_gp) filter (where rf.purchase_bonus_at is not null), 0)
  ) into v_summary
  from public.referrals as rf
  where rf.referrer_id = v_uid;

  return v_summary;
end;
$$;

revoke execute on function public.referral_summary() from public, anon, authenticated;
grant execute on function public.referral_summary() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

select 1 as "#", 'purchase_bonus_gp column' as item,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referrals'
      and column_name = 'purchase_bonus_gp' and data_type = 'integer'
  ) then 'OK' else 'MISSING' end as result
union all
select 2, 'purchase_bonus_at column',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referrals'
      and column_name = 'purchase_bonus_at' and data_type = 'timestamp with time zone'
  ) then 'OK' else 'MISSING' end
union all
select 3, 'purchase bonus function exists',
  case when to_regprocedure('public.referral_purchase_bonus_due(uuid)') is not null
    then 'OK' else 'MISSING' end
union all
select 4, 'purchase bonus blocked for anon and authenticated',
  case when not has_function_privilege('anon', 'public.referral_purchase_bonus_due(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.referral_purchase_bonus_due(uuid)', 'EXECUTE')
    then 'OK' else 'FAIL' end
union all
select 5, 'service_role can run purchase bonus',
  case when has_function_privilege('service_role', 'public.referral_purchase_bonus_due(uuid)', 'EXECUTE')
    then 'OK' else 'FAIL' end
union all
select 6, 'summary available to members but not anon',
  case when has_function_privilege('authenticated', 'public.referral_summary()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.referral_summary()', 'EXECUTE')
    then 'OK' else 'FAIL' end
union all
select 7, 'summary includes both reward sweeps',
  case when position('public.referral_vest_due(v_uid)' in pg_get_functiondef('public.referral_summary()'::regprocedure)) > 0
    and position('public.referral_purchase_bonus_due(v_uid)' in pg_get_functiondef('public.referral_summary()'::regprocedure)) > 0
    then 'OK' else 'FAIL' end
union all
select 8, 'all profiles have referral codes',
  case when not exists (select 1 from public.profiles where referral_code is null)
    then 'OK' else 'FAIL' end
union all
select 9, 'unique referral code and referee indexes',
  case when to_regclass('public.profiles_referral_code_uniq') is not null
    and to_regclass('public.referrals_referee_once') is not null
    then 'OK' else 'MISSING' end
union all
select 10, 'new profiles receive referral codes',
  case when exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_assign_referral_code'
      and not tgisinternal and tgenabled in ('O', 'A')
  ) then 'OK' else 'MISSING' end
union all
select 11, 'referral attachment available to members but not anon',
  case when has_function_privilege('authenticated', 'public.apply_referral(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.apply_referral(text)', 'EXECUTE')
    then 'OK' else 'FAIL' end
union all
select 12, 'signup reward sweep restricted to service_role',
  case when has_function_privilege('service_role', 'public.referral_vest_due(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.referral_vest_due(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.referral_vest_due(uuid)', 'EXECUTE')
    then 'OK' else 'FAIL' end
union all
select 13, 'referrals row-level security enabled',
  case when (select relrowsecurity from pg_class where oid = 'public.referrals'::regclass)
    then 'OK' else 'FAIL' end
union all
select 14, 'referrals have no direct member or anonymous access',
  case when not has_table_privilege('anon', 'public.referrals', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
    and not has_table_privilege('authenticated', 'public.referrals', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
    then 'OK' else 'FAIL' end
union all
select 15, 'purchase bonuses already awarded (count)',
  (select count(*)::text from public.referrals where purchase_bonus_at is not null)
union all
select 16, 'eligible unpaid purchase bonuses (count)',
  (select count(*)::text
   from public.referrals as rf
   where rf.purchase_bonus_at is null
     and rf.status in ('pending', 'vested')
     and exists (
       select 1 from public.billing_events as e
       where e.user_id = rf.referee_id
         and e.amount > 0
         and e.created_at >= rf.created_at
     ))
order by "#";
-- END OF REFERRAL PURCHASE BONUS SCRIPT
