-- ============================================================================
-- cleanup_dead_billing.sql
--
-- Two things, both caused by tables that were dropped in earlier migrations:
--
--   A) REPAIR  owns_post(uuid) — a live RLS helper.
--   B) REMOVE  nine pre-Gliits billing functions that can no longer run.
--
-- Nothing in section B holds data. Tables were already dropped by
-- gliits_billing.sql and the 2026-10-31 dead-table sweep; these are the
-- leftover function bodies that still reference them.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and run it
-- once. It is idempotent — run it again and the self-check grid at the bottom
-- returns the same answer. The final SELECT is the only output; every row
-- should read ok. Rows marked info need a decision from you, not a fix.
--
-- BEFORE YOU RUN IT (optional, but this is the only way back): these nine
-- bodies exist nowhere in this repo, so a drop is final. Run this first and
-- keep the output if you want a copy:
--
--   select pg_get_functiondef(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('activate_plan','billing_access','claim_daily_gp',
--                        'billing_close_due_cycles','billing_enforce_deadlines',
--                        'billing_mark_processing','billing_settle_cycle',
--                        'admin_delete_feed_item','admin_delete_post');
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) owns_post(uuid) is referenced by two row-level-security policies:
--
--    feed_gliim_contents  INSERT  with_check owns_post(post_id)
--    feed_gliim_contents  UPDATE  using     owns_post(post_id)
--
-- Its body still reads public.posts, which the feed unification renamed away,
-- so any call raises `relation "public.posts" does not exist` (42P01). Writes
-- to feed_gliim_contents only survive today because a second, permissive
-- policy on the same table short-circuits the OR before Postgres evaluates
-- this one — i.e. the owner check silently does nothing.
--
-- Rebuilt against feed_gliims, which is what post_id points at now. Same name
-- and same single uuid argument, so the policies keep working untouched.
-- SECURITY INVOKER is deliberate: the function is evaluated inside a policy,
-- and reading feed_gliims as the invoker cannot recurse, because no policy on
-- feed_gliims reads feed_gliim_contents.
-- ---------------------------------------------------------------------------
create or replace function public.owns_post(p_post uuid)
returns boolean
language sql stable
security invoker
set search_path to 'public'
as $$
  select exists (
    select 1 from public.feed_gliims g
    where g.id = p_post
      and g.user_id = auth.uid()
  );
$$;

revoke all on function public.owns_post(uuid) from public;
grant execute on function public.owns_post(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- B) Nine functions from the GP/plan billing era. Each one reads or writes a
-- table that no longer exists (billing_events, billing_cycles, billing_prices,
-- gp_ledger), so every call fails. Verified before dropping:
--
--   * no trigger uses any of them
--   * no RLS policy mentions any of them
--   * no other database function calls them on a non-comment line
--   * the member client, the admin client and the server never name them
--     (grep across public/, admin/, server/ returns zero hits)
--
-- They are only reachable as PostgREST RPC endpoints, where they answer an
-- error. Listing each signature explicitly keeps this from touching any
-- same-named overload that is not on the list.
-- ---------------------------------------------------------------------------
drop function if exists public.activate_plan(text);
drop function if exists public.billing_access(text, text, text, uuid, integer, text);
drop function if exists public.claim_daily_gp();
drop function if exists public.billing_close_due_cycles();
drop function if exists public.billing_enforce_deadlines();
drop function if exists public.billing_mark_processing(bigint, text, text);
drop function if exists public.billing_settle_cycle(bigint, text);
drop function if exists public.admin_delete_feed_item(uuid);
drop function if exists public.admin_delete_post(uuid, text);

-- ---------------------------------------------------------------------------
-- SELF CHECK — one SELECT, no editing, no placeholders.
-- ---------------------------------------------------------------------------
with dead(fn) as (
  values ('activate_plan'),('billing_access'),('claim_daily_gp'),
         ('billing_close_due_cycles'),('billing_enforce_deadlines'),
         ('billing_mark_processing'),('billing_settle_cycle'),
         ('admin_delete_feed_item'),('admin_delete_post')
),
still_there as (
  select count(*)::int as n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in (select fn from dead)
),
kept(fn) as (
  values ('add_gp'),('deduct_wallet'),('send_support'),('bump_post_views'),
         ('featured_slot_check'),('xplore_spotlight'),('earned_gp_pattern'),
         ('gliits_heartbeat'),('gliits_get_balance'),('publish_live_gliim'),
         ('request_account_deletion'),('registrar_members')
),
missing_kept as (
  select count(*)::int as n
    from (select fn from kept
          except
          select p.proname from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public') gone
),
broken_body(fn, ref) as (
  values ('registrar_member','library_items'),('registrar_revenue','library_items'),
         ('top_uploader','feed_submissions')
),
broken_still as (
  select b.fn,
         (select count(*) from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = b.fn) as installed,
         (select count(*) from pg_tables t
           where t.schemaname = 'public' and t.tablename = b.ref) as table_exists
    from broken_body b
),
orphan_era as (
  select count(*)::int as n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'event\_%' escape '\'
          or p.proname in ('contest_score','debate_board','debate_can_start_topic',
                           'operations_save_cohort','operations_cohort_requests',
                           'operations_save_contest'))
),
contents_policies as (
  select count(*)::int as n,
         count(*) filter (where pol.with_check ~ 'owns_post'
                            or pol.qual ~ 'owns_post')::int as owner_checked
    from pg_policies pol
   where pol.schemaname = 'public' and pol.tablename = 'feed_gliim_contents'
)
select 1 as no, 'owns_post rebuilt on feed_gliims' as "check",
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'owns_post'
                    and p.prosrc ~ 'feed_gliims' and p.prosrc !~ 'posts') = 1
            then 'ok' else 'FAIL' end as status,
       'reads feed_gliims, no longer references posts' as detail
union all
select 2, 'owns_post callable without error',
       case when public.owns_post(coalesce((select g.id from public.feed_gliims g limit 1),
                                           gen_random_uuid())) is false
            then 'ok' else 'FAIL' end,
       'returns false as the postgres role (auth.uid() is null here); the point is that no 42P01 is raised'
union all
select 3, 'contents policies still bound to owns_post',
       case when c.owner_checked = 2 then 'ok' else 'FAIL' end,
       c.n::text || ' policies on feed_gliim_contents, ' || c.owner_checked::text || ' call owns_post'
from contents_policies c
union all
select 4, 'nine dead billing functions removed',
       case when s.n = 0 then 'ok' else 'FAIL' end,
       s.n::text || ' of 9 still installed'
from still_there s
union all
select 5, 'nothing outside the list was dropped',
       case when m.n = 0 then 'ok' else 'FAIL' end,
       m.n::text || ' live RPC the app calls is now missing'
from missing_kept m
union all
select 6, 'billing-era names fully cleared',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public'
                    and (p.proname like 'billing\_%' escape '\'
                         or p.proname in ('activate_plan','claim_daily_gp','gp_reset',
                                          'billing_plan_for', 'billing_plan_price'))) = 0
            then 'ok' else 'info' end,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and (p.proname like 'billing\_%' escape '\'
                or p.proname in ('activate_plan','claim_daily_gp')))::text
         || ' billing-era functions still exposed as RPC endpoints'
union all
select 7, 'dropped tables stay dropped',
       case when (select count(*) from pg_tables t where t.schemaname = 'public'
                  and t.tablename in ('billing_events','billing_cycles','billing_prices','gp_ledger')) = 0
            then 'ok' else 'info' end,
       'this script removes functions only; it creates no tables and deletes no rows'
union all
select 8, 'registrar_member still broken',
       case when b.installed = 1 and b.table_exists = 0 then 'info' else 'ok' end,
       'admin Members drawer detail: body still joins library_items/library_purchases/library_contents, which no longer exist'
from broken_still b where b.fn = 'registrar_member'
union all
select 9, 'registrar_revenue still broken',
       case when b.installed = 1 and b.table_exists = 0 then 'info' else 'ok' end,
       'admin Revenue: the library-sales branch reads the dropped library_items, guarded by an exception handler'
from broken_still b where b.fn = 'registrar_revenue'
union all
select 10, 'top_uploader still broken',
       case when b.installed = 1 and b.table_exists = 0 then 'info' else 'ok' end,
       'reads the dropped feed_submissions; no client code calls it, so it can be dropped once you confirm'
from broken_still b where b.fn = 'top_uploader'
union all
select 11, 'Events / Contest / Debate functions still installed',
       'info',
       o.n::text || ' of them query tables that no longer exist. Not dropped here: some are still named by admin client code, so each one needs a check before it goes'
from orphan_era o
union all
select 12, 'duplicate permissive policies on feed_gliim_contents',
       case when c.n > 4 then 'info' else 'ok' end,
       c.n::text || ' policies: an owner-checked pair plus a true-allowing pair, so the owner check is decorative. Tightening it is your call, not a side effect of this script'
from contents_policies c
order by 1;
