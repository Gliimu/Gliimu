-- Fix signup 500: gliits_onboard_new_profile_trg ran as BEFORE INSERT on profiles and
-- inserted into gliits_plans, whose FK (gliits_plans_user_id_fkey) references profiles(id).
-- During the BEFORE phase the profiles row is not yet written, so the FK check failed
-- with SQLSTATE 23503 and the whole signup transaction aborted (GoTrue returned 500).
-- Split: the BEFORE trigger keeps only the wallet_balance fill; a new AFTER INSERT
-- trigger creates the Pay n' Go plan row once the profiles row exists.
-- Also: the live column default is wallet_balance 0 (not null), so the fill now fires
-- whenever the insert did not supply a positive balance — new signups get the
-- gliits_config.signup_credit_gliits welcome credit (currently 100) as intended.
-- Idempotent: safe to re-run. Self-check raises on any mismatch.

-- 1. BEFORE function: wallet fill only.
create or replace function public.gliits_onboard_new_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_credit integer;
begin
  -- Signup credit: only fill it in when the insert did not supply one.
  if to_regclass('public.gliits_config') is not null then
    select signup_credit_gliits into v_credit
    from public.gliits_config
    where id = 1;

    if v_credit is not null and coalesce(new.wallet_balance, 0) = 0 then
      new.wallet_balance := v_credit;
    end if;
  end if;

  return new;
end;
$function$;

-- 2. AFTER function: plan row, now that the profiles parent row exists.
create or replace function public.gliits_onboard_new_profile_after()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Pay n' Go plan so the heartbeat can bill minutes immediately.
  if to_regclass('public.gliits_plans') is not null then
    insert into public.gliits_plans (user_id, plan_type, started_at)
    values (new.id, 'payngo', now())
    on conflict (user_id) do nothing;
  end if;

  return null;
end;
$function$;

-- 3. Trigger wiring: keep the BEFORE trigger, add the AFTER trigger.
drop trigger if exists gliits_onboard_new_profile_after_trg on public.profiles;
create trigger gliits_onboard_new_profile_after_trg
  after insert on public.profiles
  for each row execute function public.gliits_onboard_new_profile_after();

do $$
declare
  v_before_fn text;
  v_after_fn text;
  v_before_type text;
  v_after_type text;
begin
  select pg_get_functiondef('public.gliits_onboard_new_profile()'::regprocedure)
    into v_before_fn;
  select pg_get_functiondef('public.gliits_onboard_new_profile_after()'::regprocedure)
    into v_after_fn;

  select pg_get_triggerdef(oid) into v_before_type
    from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'gliits_onboard_new_profile_trg';
  select pg_get_triggerdef(oid) into v_after_type
    from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'gliits_onboard_new_profile_after_trg';

  if v_before_fn is null or v_after_fn is null then
    raise exception 'SELF-CHECK FAIL: onboard functions missing';
  end if;
  if v_before_fn like '%gliits_plans%' then
    raise exception 'SELF-CHECK FAIL: BEFORE function still inserts into gliits_plans';
  end if;
  if v_before_type is null or v_before_type not like '%BEFORE INSERT%' then
    raise exception 'SELF-CHECK FAIL: gliits_onboard_new_profile_trg is not BEFORE INSERT: %', v_before_type;
  end if;
  if v_after_type is null
     or v_after_type not like '%gliits_onboard_new_profile_after()%'
     or v_after_type not like '%AFTER INSERT%' then
    raise exception 'SELF-CHECK FAIL: AFTER trigger wrong: %', v_after_type;
  end if;
  raise notice 'SELF-CHECK OK: BEFORE fills wallet only, AFTER inserts gliits_plans, both triggers wired.';
end;
$$;
