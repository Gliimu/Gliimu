-- ============================================================
--  The admin Members screen stops quoting a column nobody
--  maintains — sql/admin_member_plan.sql
--
--  WHY THIS EXISTS
--  sql/live_hosting_plan_gate.sql rebuilt effective_tier() against
--  public.gliits_plans, which unblocked the Live host gate. It deliberately
--  left one reader of the legacy columns alone, and named it in its own
--  header: admin_member_lookup(), the lookup the admin app uses for staff
--  names, report targets and the Members drawer. It still returned
--  profiles.tier.
--
--  That column is written by nothing the app can reach:
--    * profiles_protect_sensitive() raises PROTECTED_COLUMN when a member's
--      own session tries to write tier, trial_ends_at,
--      subscription_expires_at or subscription_plan.
--    * purchase_subscription(text) was the only function that ever wrote it,
--      and it sells starter/pro/elite — products that no longer exist. No
--      file in public/, admin/ or server/ calls it.
--    * gliits_set_plan() and registrar_extend_subscription() write
--      gliits_plans and never touch profiles.
--  So an operator reading that column sees 2019 vocabulary — 'pro', 'elite' —
--  next to a member the meter is actually billing as payngo. A decision made
--  from that row is a decision made against a number that is not true.
--
--  This is the last reader. Verified against the live database, the only
--  public function whose body mentions both "profiles" and a bare "tier" is
--  admin_member_lookup. After this script there is none.
--
--  WHAT CHANGES
--    * The returned column is renamed tier -> plan and carries
--      public.effective_tier(p.id): 'payngo', 'monthly', 'yearly', 'wallet'
--      when a paid plan has run out, or NULL when the member has no plan row
--      at all. The same function, the same values, the same table the money
--      moves through — the gate and the drawer can no longer disagree.
--    * NULL is kept as NULL on purpose. Coalescing it to 'wallet' would make
--      a member whose signup onboarding never ran look like someone who
--      simply has no money, and those two need different fixes. The admin
--      screen shows "No plan record" for it.
--    * Nothing else about the function moves: same name, same single
--      uuid[] argument, same SECURITY DEFINER + search_path, same
--      admin_can_view_members() guard, same seven columns in the same order.
--      support.js, submissions.js, reports.js and admin-room.js read only
--      username / full_name / avatar_url from it and are unaffected.
--
--  SECOND THING THIS SCRIPT DOES — the two DDLs, put in the repo
--  enforce_live_subscription() (and the trigger on live_requests that runs
--  it) and admin_member_lookup() existed ONLY inside the production
--  database. Nothing in sql/ created them, so a fresh project replayed every
--  script in sql/ and came out without a host gate and without the admin
--  member lookup. Both bodies are recorded below, copied from
--  pg_get_functiondef() on the live project, so the repo is now the whole
--  shape of the database. Running them against the live project is a no-op:
--  the trigger is created only when it is missing.
--
--  NOT CHANGED: the gate itself still refuses exactly the 'wallet' tier and
--  nothing else; effective_tier(), the meter, the entry check and every
--  wallet are untouched. profiles.tier is still sitting there with its old
--  values — reading it is what stops here, not the column.
--
--  Run in this order on a fresh project: admin.sql,
--  sql/live_metering.sql, sql/live_hosting_plan_gate.sql, then this one.
--  (enforce_live_subscription() calls is_admin(), which sql/admin.sql
--  creates, and effective_tier(), which the gate script creates.)
--
--  IDEMPOTENT — safe to run twice. Run it once, then paste the SELF CHECK at
--  the bottom; every row must read PASS.
-- ============================================================


-- ------------------------------------------------------------
-- 1. The Live host gate, recorded so a fresh install gets it.
--    Identical to what is live. Replacing it changes nothing.
-- ------------------------------------------------------------

create or replace function public.enforce_live_subscription()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_tier text;
begin
  if public.is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    v_tier := coalesce(public.effective_tier(new.user_id), 'wallet');
    if v_tier = 'wallet' then
      raise exception 'LIVE_REQUIRES_SUBSCRIPTION';
    end if;
  end if;

  if new.partner_id is not null
     and (tg_op = 'INSERT' or old.partner_id is null) then
    v_tier := coalesce(public.effective_tier(new.partner_id), 'wallet');
    if v_tier = 'wallet' then
      raise exception 'LIVE_REQUIRES_SUBSCRIPTION';
    end if;
  end if;

  return new;
end $function$;

revoke execute on function public.enforce_live_subscription() from public, anon;

-- Only minted when absent, so an already-gated production project is left
-- exactly as it is.
do $do$
begin
  if not exists (
    select 1
      from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'live_requests'
       and tg.tgname = 'enforce_live_subscription'
       and not tg.tgisinternal
  ) then
    create trigger enforce_live_subscription
      before insert or update on public.live_requests
      for each row execute function public.enforce_live_subscription();
  end if;
end $do$;


-- ------------------------------------------------------------
-- 2. The admin member lookup: plan, not the legacy tier.
-- ------------------------------------------------------------

-- Postgres refuses to change a function's return type in place, so the old
-- signature has to go first. Verified on the live project that nothing else
-- depends on it: no trigger uses it and no other public function calls it.
-- The drop also clears its GRANTs, which is why they are re-asserted below.
drop function if exists public.admin_member_lookup(uuid[]);

create or replace function public.admin_member_lookup(p_ids uuid[])
 returns table (
   id          uuid,
   username    text,
   full_name   text,
   avatar_url  text,
   total_gp    integer,
   plan        text,
   is_admin    boolean
 )
 language sql
 stable
 security definer
 set search_path to 'public'
as $fn$
  select p.id::uuid,
         p.username::text,
         p.full_name::text,
         p.avatar_url::text,
         p.total_gp::integer,
         -- NULL stays NULL: no plan row is a broken onboarding, not an empty
         -- wallet, and the operator needs to see which one it is.
         public.effective_tier(p.id)::text,
         p.is_admin::boolean
    from public.profiles p
   where p.id = any (p_ids)
     and public.admin_can_view_members();
$fn$;

revoke execute on function public.admin_member_lookup(uuid[]) from public, anon;
grant execute on function public.admin_member_lookup(uuid[]) to authenticated, service_role;

comment on function public.admin_member_lookup(uuid[]) is
  'Staff-facing identity lookup for the admin app. Returns the plan from '
  'public.gliits_plans through effective_tier(), never the legacy '
  'profiles.tier column.';


-- ------------------------------------------------------------
-- SELF CHECK — paste everything below this line. Every row must read PASS.
-- ------------------------------------------------------------

with f as (
  select p.oid, p.proname, p.prosrc, p.proconfig, p.proargnames, p.prosecdef,
         l.lanname as lang
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
   where n.nspname = 'public'
     and p.proname in ('admin_member_lookup', 'enforce_live_subscription')
)
select check_name, actual, expected,
       case when actual = expected then 'PASS' else 'FAIL' end as result
  from (
    select 1 as ord, 'lookup returns a plan column' as check_name,
           (select case when 'plan' = any (proargnames) then 'yes' else 'no' end
              from f where proname = 'admin_member_lookup') as actual,
           'yes' as expected
    union all
    select 2, 'lookup no longer names a tier column',
           (select case when 'tier' = any (proargnames) then 'yes' else 'no' end
              from f where proname = 'admin_member_lookup'),
           'no'
    union all
    select 3, 'lookup reads the plans table via effective_tier',
           (select case when prosrc like '%effective_tier%' then 'yes' else 'no' end
              from f where proname = 'admin_member_lookup'),
           'yes'
    union all
    select 4, 'no public function reads profiles.tier',
           (select count(*)::text from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.prosrc ~ '(^|[^_a-z0-9])tier([^_a-z0-9]|$)'
               and p.prosrc ~ 'profiles'),
           '0'
    union all
    select 5, 'lookup has one signature',
           (select count(*)::text from f where proname = 'admin_member_lookup'),
           '1'
    union all
    select 6, 'lookup is definer-scoped',
           (select coalesce(nullif(proconfig::text, ''), '')
              from f where proname = 'admin_member_lookup'),
           '{search_path=public}'
    union all
    select 7, 'lookup still guards on admin_can_view_members',
           (select case when prosrc like '%admin_can_view_members%' then 'yes' else 'no' end
              from f where proname = 'admin_member_lookup'),
           'yes'
    union all
    select 8, 'lookup reaches staff but not anon',
           (select case
                     when has_function_privilege('authenticated', 'public.admin_member_lookup(uuid[])', 'execute')
                      and not has_function_privilege('anon', 'public.admin_member_lookup(uuid[])', 'execute')
                     then 'yes' else 'no' end),
           'yes'
    union all
    -- The two DDLs are only worth recording if they still do their jobs.
    select 9, 'host gate function is recorded',
           (select case when lang = 'plpgsql' and prosecdef and prosrc like '%LIVE_REQUIRES_SUBSCRIPTION%'
                        then 'yes' else 'no' end
              from f where proname = 'enforce_live_subscription'),
           'yes'
    union all
    select 10, 'host trigger attached and enabled',
           (select coalesce(tg.tgenabled::text, 'missing')
              from pg_trigger tg
              join pg_class c on c.oid = tg.tgrelid
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'live_requests'
               and tg.tgname = 'enforce_live_subscription' and not tg.tgisinternal),
           'O'
    union all
    select 11, 'host trigger runs the recorded function',
           (select case when t.tgfoid = (select oid from f where proname = 'enforce_live_subscription')
                        then 'yes' else 'no' end
              from pg_trigger t
              join pg_class c on c.oid = t.tgrelid
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'live_requests'
               and t.tgname = 'enforce_live_subscription' and not t.tgisinternal),
           'yes'
    union all
    -- The point of the whole script: what the operator now sees per member.
    select 12, 'members shown wallet while holding a live plan',
           (select count(*)::text
              from public.profiles pr
              join public.gliits_plans gp on gp.user_id = pr.id
             where public.effective_tier(pr.id) = 'wallet'
               and (gp.plan_type = 'payngo'
                    or (gp.plan_type in ('monthly', 'yearly') and gp.expires_at > now()))),
           '0'
    union all
    select 13, 'plan values shown are all understood ones',
           (select count(*)::text
              from (select distinct coalesce(public.effective_tier(pr.id), 'NULL') as v
                      from public.profiles pr) s
             where v not in ('payngo', 'monthly', 'yearly', 'wallet', 'NULL')),
           '0'
    union all
    select 14, 'no member has a missing plan row',
           (select count(*)::text
              from public.profiles pr
              left join public.gliits_plans gp on gp.user_id = pr.id
             where gp.user_id is null),
           '0'
  ) checks
 order by ord;
