-- ============================================================
-- Gliimu: Referral / affiliate program  (Phase 3)
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once (idempotent).
--
-- RUN ORDER: run this AFTER sql/billing.sql and sql/community.sql.
--   - It reads public.billing_events (the purchase signal) for vesting.
--   - After this, RE-RUN sql/community.sql so the Arena "referrals"
--     contest metric starts counting vested referrals (it was hardcoded
--     to 0 until this table existed).
--
-- WHAT THIS INSTALLS
--   1. profiles.referral_code  — a unique, auto-assigned 8-char code per
--      member (never client-chosen), backfilled for existing accounts and
--      stamped on every new profile by a BEFORE INSERT trigger.
--   2. public.referrals        — the attribution ledger. One row per referred
--      member (referee_id is UNIQUE: you can only be referred once). Locked
--      down completely: no direct client access, everything goes through the
--      SECURITY DEFINER RPCs below.
--   3. apply_referral(p_code)  — called ONCE by a brand-new member right
--      after signup to attach themselves to whoever referred them. Guards:
--      signed-in, not already referred, code exists, not a self-referral.
--   4. referral_vest_due(...)  — awards the 100 GP signup reward to the
--      referrer once the referee has BOTH (a) been referred for >= 1 day AND
--      (b) made a real purchase (any billing_events row with amount > 0).
--      Runs lazily whenever the referrer opens their Refer & earn card, and
--      is also grantable to service_role for the daily cron.
--   5. referral_summary()      — one call -> everything the Refer & earn card
--      needs (own code, link, pending/vested counts, GP earned).
--
-- SECURITY
--   auth.uid() only (no spoofable ids). All money/GP writes happen inside
--   SECURITY DEFINER functions owned by postgres, so they pass the
--   profiles_protect_sensitive guard (same pattern as complete_reading()).
--   referral_code is public-safe to share; it is NOT a username and reveals
--   nothing about the member.
--
-- NOT IN THIS SCRIPT (intentionally deferred):
--   The "per-title author referral bonus" (author-set flat GP deducted from
--   the author's 70% share) is NOT implemented here. At today's prices the
--   author's share of a premium unlock is (100 * 70 / 100) = 70 NAIRA, while
--   1 GP is worth 50 NAIRA (1000 GP = 50,000). So even a 2 GP bonus would
--   cost the author more than the entire share. The money mechanics need a
--   decision before this is wired into billing.sql — see the note to the user.
-- ============================================================


-- ============================================================
-- 1. profiles.referral_code
-- ============================================================

alter table public.profiles add column if not exists referral_code text;

-- Internal code generator: 8 chars from an unambiguous alphabet
-- (no I, O, 0, 1). random()-based, so no pgcrypto dependency.
create or replace function public.make_referral_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
  i integer;
begin
  for i in 1..8 loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::integer, 1);
  end loop;
  return v_code;
end $$;

revoke execute on function public.make_referral_code() from public, anon, authenticated;

-- Backfill existing accounts that have no code yet. Collision odds across a
-- 32^8 (~1.1e12) space are negligible; the unique index below is the backstop.
do $$ begin
  with gen as (
    select p.id, public.make_referral_code() as code
      from public.profiles p
     where p.referral_code is null
  )
  update public.profiles p
     set referral_code = gen.code
    from gen
   where p.id = gen.id and p.referral_code is null;
end $$;

drop index if exists public.profiles_referral_code_uniq;
create unique index profiles_referral_code_uniq
  on public.profiles (referral_code) where referral_code is not null;

-- Every new profile is stamped with a fresh unique code. The value is never
-- taken from the client — the trigger always generates it.
create or replace function public.profiles_assign_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  loop
    new.referral_code := public.make_referral_code();
    exit when not exists (
      select 1 from public.profiles where referral_code = new.referral_code
    );
  end loop;
  return new;
end $$;

drop trigger if exists profiles_assign_referral_code on public.profiles;
create trigger profiles_assign_referral_code
  before insert on public.profiles
  for each row execute function public.profiles_assign_referral_code();


-- ============================================================
-- 2. referrals — the attribution ledger
-- ============================================================

create table if not exists public.referrals (
  id               uuid primary key default gen_random_uuid(),
  referrer_id      uuid not null references public.profiles(id) on delete cascade,
  referee_id       uuid not null references public.profiles(id) on delete cascade,
  code             text not null,
  status           text not null default 'pending'
                   check (status in ('pending', 'vested', 'invalid')),
  signup_reward_gp integer not null default 100,
  created_at       timestamptz not null default now(),
  vested_at        timestamptz
);

-- A member can only be referred once, ever.
create unique index if not exists referrals_referee_once
  on public.referrals (referee_id);

create index if not exists referrals_referrer_idx
  on public.referrals (referrer_id, status);

alter table public.referrals enable row level security;
-- No policies on purpose: members never read this table directly. The Refer &
-- earn card reads it through referral_summary(); the SECURITY DEFINER RPCs and
-- service_role bypass RLS.
revoke all on public.referrals from anon, authenticated;


-- ============================================================
-- 3. apply_referral — attach a new member to their referrer
-- ============================================================

create or replace function public.apply_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_norm text;
  v_ref uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  v_norm := upper(btrim(coalesce(p_code, '')));
  if v_norm = '' then
    return jsonb_build_object('ok', false, 'code', 'NO_CODE');
  end if;

  -- Serialize per referee so a double call cannot create two rows.
  perform pg_advisory_xact_lock(hashtext('referral:' || uid::text));

  if exists (select 1 from public.referrals where referee_id = uid) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select p.id into v_ref from public.profiles p where p.referral_code = v_norm;
  if v_ref is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CODE');
  end if;
  if v_ref = uid then
    return jsonb_build_object('ok', false, 'code', 'SELF_REFERRAL');
  end if;

  insert into public.referrals (referrer_id, referee_id, code)
  values (v_ref, uid, v_norm);

  return jsonb_build_object('ok', true, 'attached', true);
end $$;

revoke execute on function public.apply_referral(text) from public, anon;
grant execute on function public.apply_referral(text) to authenticated, service_role;


-- ============================================================
-- 4. referral_vest_due — award the signup reward when it vests
--    Condition: referred >= 1 day ago AND referee made a real purchase
--    (any billing_events row with amount > 0).
--    p_referrer = null sweeps everyone (cron); a uuid sweeps just that
--    referrer (called lazily from referral_summary()).
-- ============================================================

create or replace function public.referral_vest_due(p_referrer uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select rf.id, rf.referrer_id, rf.signup_reward_gp
      from public.referrals rf
     where rf.status = 'pending'
       and rf.created_at <= now() - interval '1 day'
       and (p_referrer is null or rf.referrer_id = p_referrer)
       and exists (select 1 from public.billing_events e
                    where e.user_id = rf.referee_id and e.amount > 0)
  loop
    update public.referrals
       set status = 'vested', vested_at = now()
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
end $$;

revoke execute on function public.referral_vest_due(uuid) from public, anon, authenticated;
-- service_role only (the daily cron). referral_summary() still triggers vesting
-- for the caller through the SECURITY DEFINER chain, so members never need to
-- call this directly.
grant execute on function public.referral_vest_due(uuid) to service_role;


-- ============================================================
-- 5. referral_summary — the Refer & earn card, one call
-- ============================================================

create or replace function public.referral_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_code text;
  v_pending integer;
  v_vested integer;
  v_gp integer;
begin
  if uid is null then
    return jsonb_build_object('code', 'NOT_AUTHENTICATED');
  end if;

  -- Vest anything already due for this referrer so no cron is strictly
  -- required for the reward to show up.
  perform public.referral_vest_due(uid);

  select p.referral_code into v_code from public.profiles p where p.id = uid;

  select count(*) filter (where status = 'pending'),
         count(*) filter (where status = 'vested'),
         coalesce(sum(signup_reward_gp) filter (where status = 'vested'), 0)
    into v_pending, v_vested, v_gp
    from public.referrals
   where referrer_id = uid;

  return jsonb_build_object(
    'code', v_code,
    'link', '/?ref=' || coalesce(v_code, ''),
    'pending', coalesce(v_pending, 0),
    'vested', coalesce(v_vested, 0),
    'gp_earned', coalesce(v_gp, 0)
  );
end $$;

revoke execute on function public.referral_summary() from public, anon;
grant execute on function public.referral_summary() to authenticated, service_role;


-- ============================================================
-- SELF-CHECK — run this whole script, then the grid below.
-- Every "result" column should read OK / 0 as noted.
-- ============================================================

select 1 as "#", 'profiles.referral_code column exists' as item,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='profiles'
                            and column_name='referral_code')
            then 'OK' else 'MISSING' end as result
union all
select 2, 'unique index on referral_code',
       case when exists (select 1 from pg_indexes
                          where schemaname='public' and indexname='profiles_referral_code_uniq')
            then 'OK' else 'MISSING' end
union all
select 3, 'make_referral_code() exists',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname='make_referral_code')
            then 'OK' else 'MISSING' end
union all
select 4, 'BEFORE INSERT trigger on profiles',
       case when exists (select 1 from pg_trigger
                          where tgname='profiles_assign_referral_code' and not tgisinternal)
            then 'OK' else 'MISSING' end
union all
select 5, 'profiles missing a referral_code (want 0)',
       (select count(*)::text from public.profiles where referral_code is null)
union all
select 6, 'duplicate referral_codes (want 0)',
       (select count(*)::text from (select referral_code from public.profiles
                                     where referral_code is not null
                                     group by referral_code having count(*) > 1) d)
union all
select 7, 'referrals table exists',
       case when to_regclass('public.referrals') is not null then 'OK' else 'MISSING' end
union all
select 8, 'referrals.referee_id UNIQUE index',
       case when exists (select 1 from pg_indexes
                          where schemaname='public' and indexname='referrals_referee_once')
            then 'OK' else 'MISSING' end
union all
select 9, 'RLS enabled on referrals',
       case when (select relrowsecurity from pg_class
                   where oid='public.referrals'::regclass) then 'OK' else 'OFF' end
union all
select 10, 'anon/authenticated have NO direct grant on referrals (want 0)',
       (select count(*)::text from information_schema.role_table_grants
         where table_schema='public' and table_name='referrals'
           and grantee in ('anon','authenticated'))
union all
select 11, 'apply_referral(text) exists',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname='apply_referral')
            then 'OK' else 'MISSING' end
union all
select 12, 'referral_vest_due(uuid) exists',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname='referral_vest_due')
            then 'OK' else 'MISSING' end
union all
select 13, 'referral_summary() exists',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname='referral_summary')
            then 'OK' else 'MISSING' end
union all
select 14, 'referral_summary NOT executable by anon (want 0 rows)',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='referral_summary'
           and has_function_privilege('anon', p.oid, 'EXECUTE'))
order by "#";
