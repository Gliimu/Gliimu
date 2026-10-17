-- ============================================================
-- Gliimu: Referral PURCHASE bonus  (task #214)
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once (idempotent).
--
-- RUN ORDER: run this AFTER sql/billing.sql AND sql/referrals.sql.
--   - It adds two columns to public.referrals and rewrites
--     public.referral_summary(), both of which live in referrals.sql.
--   - It reads public.billing_events (created by billing.sql) as the
--     purchase signal.
--
-- WHAT THIS INSTALLS
--   A flat, PLATFORM-FUNDED 20 GP bonus paid to a referrer the first
--   time a member they referred makes a real-money content purchase.
--   "Platform-funded" = the GP is created (profiles.total_gp += 20);
--   it is deducted from NOBODY. The author keeps their full 70% naira
--   share; the buyer pays the normal price. This mirrors how the 100 GP
--   signup reward (referral_vest_due) and the 50 GP reading reward
--   (complete_reading) already work.
--
--   DESIGN (agreed 2026-10-17):
--     * amount      : 20 GP (v_bonus below — edit one line to re-tune).
--     * frequency   : ONCE per referred member (referrals.referee_id is
--                     already UNIQUE, and purchase_bonus_at is the guard).
--     * trigger     : the referee has >= 1 billing_events row with
--                     amount > 0 (a real purchase, Pro free-unlocks
--                     excluded) dated ON/AFTER the referral attachment,
--                     so a member cannot buy first, attach a code later,
--                     and farm the bonus instantly.
--     * delivery    : lazily, whenever the referrer opens their Refer &
--                     earn card (referral_summary sweeps it), exactly like
--                     referral_vest_due. Also granted to service_role so a
--                     cron can sweep everyone with a NULL argument.
--
--   Because gp_earned in referral_summary() now folds in this bonus, the
--   existing Refer & earn card shows the combined total with NO client
--   change and NO ?v= bump.
--
-- SECURITY
--   auth.uid() only; all GP writes happen inside SECURITY DEFINER
--   functions owned by postgres, so they pass the profiles_protect_sensitive
--   guard (same pattern as referral_vest_due / complete_reading).
-- ============================================================


-- ------------------------------------------------------------
-- 0. Hard dependency guard — fail loudly, not confusingly.
--    check_function_bodies is ON, so the CREATE FUNCTIONs below would
--    otherwise abort with an opaque "relation does not exist" if these
--    scripts were run out of order. The whole script runs in one editor
--    transaction, so raising here commits nothing (safe to re-run).
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.referrals') is null then
    raise exception 'public.referrals is missing - run sql/referrals.sql first, then re-run this script.';
  end if;
  if to_regclass('public.billing_events') is null then
    raise exception 'public.billing_events is missing - run sql/billing.sql first, then re-run this script.';
  end if;
end $$;


-- ------------------------------------------------------------
-- 1. Two columns on the attribution ledger.
--    purchase_bonus_gp = the GP actually awarded (kept for audit even
--    though it is a flat 20 today); purchase_bonus_at = the once-guard.
-- ------------------------------------------------------------
alter table public.referrals add column if not exists purchase_bonus_gp integer;
alter table public.referrals add column if not exists purchase_bonus_at timestamptz;


-- ------------------------------------------------------------
-- 2. referral_purchase_bonus_due — award the flat bonus when it is due.
--    p_referrer = null sweeps everyone (cron); a uuid sweeps just that
--    referrer (called lazily from referral_summary()).
-- ------------------------------------------------------------
create or replace function public.referral_purchase_bonus_due(p_referrer uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_bonus integer := 20;   -- platform-funded GP; edit this one line to re-tune
  v_count integer := 0;
begin
  for r in
    select rf.id, rf.referrer_id
      from public.referrals rf
     where rf.purchase_bonus_at is null
       and (p_referrer is null or rf.referrer_id = p_referrer)
       and exists (select 1 from public.billing_events e
                    where e.user_id = rf.referee_id
                      and e.amount > 0
                      and e.created_at >= rf.created_at)
  loop
    update public.referrals
       set purchase_bonus_gp = v_bonus,
           purchase_bonus_at = now()
     where id = r.id and purchase_bonus_at is null;
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
end $$;

revoke execute on function public.referral_purchase_bonus_due(uuid) from public, anon, authenticated;
-- service_role only (a daily cron). referral_summary() triggers the sweep for
-- the caller through the SECURITY DEFINER chain, so members never call it.
grant execute on function public.referral_purchase_bonus_due(uuid) to service_role;


-- ------------------------------------------------------------
-- 3. referral_summary — same card payload as referrals.sql, plus:
--      (a) sweep the purchase bonus for the caller, and
--      (b) fold the awarded purchase bonus into gp_earned so the card
--          shows signup rewards + purchase bonuses with no client change.
--    Two extra keys (purchase_count, purchase_gp) are returned for any
--    future UI that wants to break the total down; existing callers ignore
--    unknown keys.
-- ------------------------------------------------------------
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
  v_purchase_count integer;
  v_purchase_gp integer;
begin
  if uid is null then
    return jsonb_build_object('code', 'NOT_AUTHENTICATED');
  end if;

  -- Vest anything already due for this referrer so no cron is strictly
  -- required for either reward to show up.
  perform public.referral_vest_due(uid);
  perform public.referral_purchase_bonus_due(uid);

  select p.referral_code into v_code from public.profiles p where p.id = uid;

  select count(*) filter (where status = 'pending'),
         count(*) filter (where status = 'vested'),
         coalesce(sum(signup_reward_gp) filter (where status = 'vested'), 0),
         count(*) filter (where purchase_bonus_at is not null),
         coalesce(sum(purchase_bonus_gp) filter (where purchase_bonus_at is not null), 0)
    into v_pending, v_vested, v_gp, v_purchase_count, v_purchase_gp
    from public.referrals
   where referrer_id = uid;

  return jsonb_build_object(
    'code', v_code,
    'link', '/?ref=' || coalesce(v_code, ''),
    'pending', coalesce(v_pending, 0),
    'vested', coalesce(v_vested, 0),
    'gp_earned', coalesce(v_gp, 0) + coalesce(v_purchase_gp, 0),
    'purchase_count', coalesce(v_purchase_count, 0),
    'purchase_gp', coalesce(v_purchase_gp, 0)
  );
end $$;

revoke execute on function public.referral_summary() from public, anon;
grant execute on function public.referral_summary() to authenticated, service_role;


notify pgrst, 'reload schema';


-- ============================================================
-- SELF-CHECK — run the whole script, then read the grid below.
-- Every "result" column should read OK / the noted value.
-- ============================================================
select 1 as "#", 'referrals.purchase_bonus_gp column exists' as item,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='referrals'
                            and column_name='purchase_bonus_gp')
            then 'OK' else 'MISSING' end as result
union all
select 2, 'referrals.purchase_bonus_at column exists',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='referrals'
                            and column_name='purchase_bonus_at')
            then 'OK' else 'MISSING' end
union all
select 3, 'referral_purchase_bonus_due(uuid) exists',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname='referral_purchase_bonus_due')
            then 'OK' else 'MISSING' end
union all
select 4, 'bonus fn NOT executable by authenticated (want 0)',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='referral_purchase_bonus_due'
           and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
union all
select 5, 'bonus fn executable by service_role (want OK)',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname='referral_purchase_bonus_due'
                            and has_function_privilege('service_role', p.oid, 'EXECUTE'))
            then 'OK' else 'MISSING' end
union all
select 6, 'bonus fn body gates on billing_events amount>0 + created_at (want OK)',
       case when position('e.created_at >= rf.created_at' in
                pg_get_functiondef((select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                       where n.nspname='public' and p.proname='referral_purchase_bonus_due' limit 1))) > 0
            then 'OK' else 'CHECK' end
union all
select 7, 'referral_summary() now sweeps the purchase bonus (want OK)',
       case when position('referral_purchase_bonus_due' in
                pg_get_functiondef((select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                       where n.nspname='public' and p.proname='referral_summary' limit 1))) > 0
            then 'OK' else 'CHECK' end
union all
select 8, 'referrals already awarded the purchase bonus (informational)',
       (select count(*)::text from public.referrals where purchase_bonus_at is not null)
union all
select 9, 'eligible-but-unpaid referrals right now (informational; a sweep pays these)',
       (select count(*)::text from public.referrals rf
         where rf.purchase_bonus_at is null
           and exists (select 1 from public.billing_events e
                        where e.user_id = rf.referee_id
                          and e.amount > 0
                          and e.created_at >= rf.created_at))
order by "#";
