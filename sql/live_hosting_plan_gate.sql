-- ============================================================
--  SUPERSEDED by sql/plan_lineup.sql (2026-11-19) — do not re-run this
--  as a live feature. Anyone may host: enforce_live_subscription no longer
--  blocks a member, and the host instead pays a one-token session fee
--  (gliits_config.live_host_fee_gliits). The effective_tier() reader below
--  is kept only so the admin panel can still show a retired plan name to
--  the members grandfathered onto it.
-- ============================================================
-- ============================================================
--  Who may host a live session is decided by the table the money
--  actually moves in — sql/live_hosting_plan_gate.sql
--
--  THE QUESTION THIS ANSWERS
--  "Press Host Session" is blocked by a database trigger, not by the
--  browser:
--
--      enforce_live_subscription  BEFORE INSERT OR UPDATE ON live_requests
--        v_tier := coalesce(public.effective_tier(new.user_id), 'wallet');
--        if v_tier = 'wallet' then raise exception 'LIVE_REQUIRES_SUBSCRIPTION';
--
--  So the whole feature comes down to one function, effective_tier(uuid),
--  and it was reading profiles.tier / profiles.subscription_expires_at /
--  profiles.trial_ends_at — three LEGACY columns that nothing in the app
--  writes any more.
--
--  HOW THE RIGHT TABLE WAS FIGURED OUT (read from the live database)
--  Every function that touches a member's billing state was listed by
--  grepping the live pg_proc bodies. The result:
--
--    reads/writes public.gliits_plans   (the plans table)
--      gliits_heartbeat(uuid,uuid)        -- the meter itself
--      gliits_live_entry_check(uuid)      -- "may this member join this room"
--      gliits_get_balance()               -- what Billing shows
--      gliits_set_plan(text)              -- what the plan buttons call
--      gliits_onboard_new_user(uuid)      -- gives every signup payngo
--      gliits_onboard_new_profile_after()
--      registrar_members / registrar_member / registrar_overview
--      registrar_extend_subscription(uuid,integer,text)  -- the admin's renew
--
--    reads profiles.tier / subscription_expires_at
--      effective_tier(uuid)               -- ONLY the Live host gate
--      admin_member_lookup(uuid[])        -- an admin display column
--
--  And nothing maintains those profiles columns:
--    * profiles_protect_sensitive() raises PROTECTED_COLUMN if a member's
--      own session tries to write tier, trial_ends_at, subscription_expires_at
--      or subscription_plan — so no client can update them.
--    * purchase_subscription(text) is the only function that ever wrote them,
--      and it sells starter/pro/elite, products that no longer exist. No file
--      in public/, admin/ or server/ calls it.
--    * gliits_set_plan and registrar_extend_subscription write gliits_plans
--      and never touch profiles.
--  So the columns drifted, and the gate inherited the drift. What the live rows
--  actually said before this script:
--
--    Adam Kshel        gliits_plans=payngo   profiles.tier=payngo  expiry 2026-11-08 (past) -> BLOCKED
--    Finiks Kshel      gliits_plans=payngo   profiles.tier=payngo  expiry 2026-11-19 (past) -> BLOCKED (admin, bypasses)
--    Esther Uchenna    gliits_plans=payngo   profiles.tier=wallet                            -> BLOCKED
--    Iyo              gliits_plans=payngo   profiles.tier=wallet                            -> BLOCKED
--    John Wesley       gliits_plans=payngo   profiles.tier=wallet                            -> BLOCKED
--    moses adah ogbu   gliits_plans=monthly  profiles.tier=pro + subscription_plan=elite     -> allowed, for the wrong reason
--
--  Four real members were told they needed a subscription while holding the
--  plan the meter bills them from, and the raw Postgres token
--  LIVE_REQUIRES_SUBSCRIPTION was what they saw on screen.
--
--  WHAT THIS SCRIPT DOES
--  effective_tier() is rebuilt against public.gliits_plans — the same table
--  gliits_set_plan writes, gliits_heartbeat and gliits_live_entry_check bill
--  from, and registrar_extend_subscription renews — so the gate and the meter
--  can never disagree about what plan a member holds. The mapping:
--
--    payngo                     -> 'payngo'   hosting allowed
--    monthly / yearly, live     -> that name   hosting allowed
--    monthly / yearly, expired  -> 'wallet'    renew first, like the meter says
--    no plan row at all         -> NULL, which the trigger coalesces to
--                                 'wallet' — a signup whose onboarding trigger
--                                 never ran cannot host.
--
--  Note the deliberate difference from the meter's own flag. gliits_live_entry
--  _check calls a pay n' Go member "metered" (they pay per minute), but metered
--  is NOT the same as having no billing arrangement: the old profiles columns
--  blurred exactly that line, which is why four payngo members read as 'wallet'.
--
--  THE JUDGEMENT CALL, STATED PLAINLY
--  Every current member holds payngo, so after this script the host gate stops
--  blocking anyone who signed normally. That is the honest consequence of there
--  being no subscription-only feature to gate: pay n' Go is the default state,
--  not a paid arrangement. If hosting is meant to be a paid-plan benefit, the
--  one-word change is to make payngo resolve to 'wallet' here — say so and this
--  script is re-run with it.
--
--  NOT CHANGED: enforce_live_subscription() itself, the trigger, the meter, the
--  entry check, or any wallet. admin_member_lookup() still returns the legacy
--  profiles.tier for the admin Members screen, which is the same drift showing
--  up in an operator face — left alone deliberately, it is a display decision.
--
--  IDEMPOTENT — safe to run twice. Run it once, then paste the SELF CHECK at
--  the bottom; every row must read PASS.
-- ============================================================


-- ------------------------------------------------------------
-- 1. effective_tier() reads the plan the member actually holds.
-- ------------------------------------------------------------

create or replace function public.effective_tier(p_user uuid)
 returns text
 language sql
 stable
 security definer
 set search_path to 'public'
as $fn$
  select case
    -- Pay n' Go is a live billing state: the member pays the per-minute rate
    -- straight from the wallet, so nothing is expired and nothing to renew.
    when gp.plan_type = 'payngo' then 'payngo'
    -- A paid plan that has not run out is a paid plan.
    when gp.plan_type in ('monthly', 'yearly')
         and gp.expires_at is not null
         and gp.expires_at > now() then gp.plan_type
    -- A paid plan that lapsed leaves the member with no arrangement.
    else 'wallet'
  end
  from public.gliits_plans gp
  where gp.user_id = p_user;
$fn$;

-- It is called from a trigger that fires for the session owner AND for the
-- partner branch, i.e. it reads a plan row that is not the caller's own.
-- gliits_plans is protected by own-row RLS, so the definer attribute is not an
-- optimisation here — without it the read would silently return no rows and
-- everyone would resolve to 'wallet'. Re-assert it, and keep EXECUTE where the
-- old version had it (authenticated only, never anon).
revoke execute on function public.effective_tier(uuid) from public, anon;
grant execute on function public.effective_tier(uuid) to authenticated;

comment on function public.effective_tier(uuid) is
  'Billing state used to gate live hosting. Reads public.gliits_plans, the same '
  'table gliits_heartbeat and gliits_live_entry_check bill from. payngo / '
  'monthly / yearly when real, wallet when the plan lapsed, NULL with no plan row.';


-- ------------------------------------------------------------
-- SELF CHECK — paste everything below this line. Every row must read PASS.
-- ------------------------------------------------------------

with t as (
  select 'tier reads the plans table' as check_name,
         (select case when pg_get_functiondef(p.oid) like '%gliits_plans%'
                      then 'yes' else 'no' end
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'effective_tier') as actual,
         'yes' as expected
  union all
  select 'tier no longer reads profiles',
         (select case when pg_get_functiondef(p.oid) like '%public.profiles%'
                      then 'yes' else 'no' end
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'effective_tier'),
         'no'
  union all
  select 'tier has one signature',
         (select count(*)::text from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'effective_tier'),
         '1'
  union all
  select 'tier is definer-scoped',
         (select coalesce(nullif(p.proconfig::text, ''), '') from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'effective_tier'),
         '{search_path=public}'
  union all
  select 'tier reaches members but not anon',
         (select case
                   when has_function_privilege('authenticated', 'public.effective_tier(uuid)', 'execute')
                    and not has_function_privilege('anon', 'public.effective_tier(uuid)', 'execute')
                   then 'yes' else 'no' end),
         'yes'
  union all
  -- The gate itself must still exist and still refuse the 'wallet' tier. This
  -- script fixes what 'wallet' means; it does not remove the check.
  select 'host trigger still enabled',
         (select tg.tgenabled::text from pg_trigger tg
           join pg_class c on c.oid = tg.tgrelid
          where c.relname = 'live_requests' and tg.tgname = 'enforce_live_subscription'
            and not tg.tgisinternal),
         'O'
  union all
  select 'host trigger still names wallet',
         (select case when pg_get_functiondef(p.oid) like '%LIVE_REQUIRES_SUBSCRIPTION%'
                       and pg_get_functiondef(p.oid) like '%= ''wallet''%'
                      then 'yes' else 'no' end
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'enforce_live_subscription'),
         'yes'
  union all
  -- The point of the whole script: no member is blocked because of a column
  -- nobody maintains. Members with a plan row must all resolve to a real tier.
  select 'members blocked while holding a plan',
         (select count(*)::text
            from public.profiles pr
            join public.gliits_plans gp on gp.user_id = pr.id
           where public.effective_tier(pr.id) = 'wallet'
             and (gp.plan_type = 'payngo'
                  or (gp.plan_type in ('monthly','yearly') and gp.expires_at > now()))),
         '0'
  union all
  select 'every member has a plan row',
         (select (count(*) filter (where gp.user_id is null))::text
            from public.profiles pr
            left join public.gliits_plans gp on gp.user_id = pr.id),
         '0'
  union all
  -- The invariant that matters, stated against the plans table itself: the gate
  -- says 'wallet' if and only if the member holds a paid plan that has run out
  -- (or no plan row at all, which the next-but-one row covers). Pay n' Go is
  -- metered — the member pays per minute — but it is still a live billing
  -- state, so it must NOT resolve to 'wallet'. Conflating "charged per minute"
  -- with "unsubscribed" is exactly the mistake the old profiles columns made.
  select 'tier wallet only for a lapsed plan',
         (select count(*)::text
            from public.gliits_plans gp
           where (public.effective_tier(gp.user_id) = 'wallet')
              <> not (gp.plan_type = 'payngo'
                      or (gp.plan_type in ('monthly','yearly')
                          and gp.expires_at is not null
                          and gp.expires_at > now()))),
         '0'
  union all
  select 'pay n Go members are not blocked',
         (select count(*)::text
            from public.gliits_plans gp
           where gp.plan_type = 'payngo'
             and public.effective_tier(gp.user_id) <> 'payngo'),
         '0'
  union all
  select 'no plan row still blocks hosting',
         (select coalesce(public.effective_tier(gen_random_uuid()), 'wallet')),
         'wallet'
  union all
  -- Nothing else on the money path may have moved.
  select 'meter functions still read plans',
         (select count(*)::text from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('gliits_heartbeat', 'gliits_live_entry_check')
            and p.prosrc like '%gliits_plans%'),
         '2'
  union all
  select 'wallet is still fractional',
         (select c.numeric_scale::text from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = 'profiles'
             and c.column_name = 'wallet_balance'),
         '2'
)
select case when t.actual = t.expected then 'PASS' else 'FAIL' end as result,
       t.check_name,
       t.actual,
       t.expected
from t
order by result desc, t.check_name;

-- What each member can now do, read straight from the plans table:
select coalesce(nullif(pr.full_name, ''), pr.id::text) as member,
       gp.plan_type                                   as plan,
       case when gp.expires_at is null then 'never (pays per minute)'
            when gp.expires_at < now() then 'EXPIRED ' || gp.expires_at::text
            else gp.expires_at::text end              as "renews / expires",
       public.effective_tier(pr.id)                    as hosting_gate,
       case when public.effective_tier(pr.id) = 'wallet'
            then 'cannot host until they renew' else 'can host' end as outcome
from public.profiles pr
left join public.gliits_plans gp on gp.user_id = pr.id
order by hosting_gate, member;
