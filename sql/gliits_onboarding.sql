-- ============================================================
-- sql/gliits_onboarding.sql
-- Run in Supabase Studio → SQL Editor → New query → paste ALL → Run.
-- Idempotent: safe to run more than once.
--
-- WHY THIS EXISTS
--   gliits_billing.sql backfilled a 'payngo' plan only for members who
--   existed when it ran. Everyone who signed up AFTER that has NO row in
--   gliits_plans, so gliits_heartbeat() raises NO_ACTIVE_PLAN, the client
--   stops the heartbeat silently — minutes are never logged and the G100
--   signup balance never drops.
--
-- WHAT THIS DOES
--   Part 1  Signup trigger: every new profile automatically gets
--           (a) a 'payngo' plan row and (b) the signup credit from
--           gliits_config when the insert does not supply a balance.
--   Part 2  One-time backfill: give every existing planless member a
--           'payngo' plan (balances are NOT touched).
--   Part 3  Self-check SELECT grid — run the whole script, then look at
--           the results of the last statements at the bottom.
-- ============================================================


-- ============================================================
-- PART 1 — signup trigger on profiles
-- ============================================================

create or replace function public.gliits_onboard_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit integer;
begin
  -- Signup credit: only fill it in when the insert did not supply one.
  -- (The live profiles table already defaults wallet_balance to 100.)
  if to_regclass('public.gliits_config') is not null then
    select signup_credit_gliits into v_credit
    from public.gliits_config
    where id = 1;

    if v_credit is not null and new.wallet_balance is null then
      new.wallet_balance := v_credit;
    end if;
  end if;

  -- Pay n' Go plan so the heartbeat can bill minutes immediately.
  if to_regclass('public.gliits_plans') is not null then
    insert into public.gliits_plans (user_id, plan_type, started_at)
    values (new.id, 'payngo', now())
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists gliits_onboard_new_profile_trg on public.profiles;
create trigger gliits_onboard_new_profile_trg
  before insert on public.profiles
  for each row
  execute function public.gliits_onboard_new_profile();


-- ============================================================
-- PART 2 — one-time backfill for existing planless members
-- ============================================================

insert into public.gliits_plans (user_id, plan_type, started_at)
select p.id, 'payngo', now()
from public.profiles p
where not exists (select 1 from public.gliits_plans gp where gp.user_id = p.id)
on conflict (user_id) do nothing;


-- ============================================================
-- PART 3 — SELF-CHECK (no changes, read-only)
-- Expected results are written next to each query.
-- ============================================================

-- Check 1 — planless members.  Expected: 0 rows returned.
select p.id, p.created_at
from public.profiles p
where not exists (select 1 from public.gliits_plans gp where gp.user_id = p.id);

-- Check 2 — plans by type.  Expected: 'payngo' count equals the number of
-- profiles (see Check 3); monthly/yearly rows show whatever members bought.
select plan_type, count(*) as members
from public.gliits_plans
group by plan_type
order by plan_type;

-- Check 3 — total profiles, to compare against Check 2.
select count(*) as total_profiles from public.profiles;

-- Check 4 — the signup trigger exists and is enabled.
-- Expected: one row, tgenabled = 'O'.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.profiles'::regclass
  and tgname = 'gliits_onboard_new_profile_trg';

-- Check 5 — billing config actually in force.
-- Expected: signup_credit_gliits = 100, per_minute_rate_gliits = 3.00.
select signup_credit_gliits, per_minute_rate_gliits, creator_rate_per_minute
from public.gliits_config
where id = 1;

-- Check 6 — usage is flowing after the fix.  Sign in, browse for a minute
-- or two, then run this.  Expected: one row per minute of activity, and
-- gliits_charged = 3.00 on payngo accounts.
select count(*) as usage_rows, max(minute_at) as latest_minute
from public.gliits_usage;
