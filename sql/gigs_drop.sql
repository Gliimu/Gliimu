-- ============================================================
-- gigs_drop.sql — DESTRUCTIVE. Removes the Gigs feature
-- (table public.deals, historically Queue / Deals / Requests /
-- Partnership) from the LIVE database, including all gig DATA.
--
-- The user has explicitly approved dropping the gig data.
--
-- House rules honoured:
--   * ONE idempotent script, everything in a single transaction,
--     safe to rerun. Every drop uses IF EXISTS and every
--     table-dependent statement is guarded so a rerun after the
--     table is gone does not abort the whole transaction.
--   * pg-safeupdate is installed, so every DELETE carries a WHERE.
--   * The realtime publication removal is guarded in a DO block
--     that first checks pg_publication_tables and swallows
--     undefined_table / duplicate_object.
--   * No RAISE NOTICE anywhere — verification is a result grid.
--
-- Run AFTER deploying the stripped app code, then re-run
-- sql/registrar.sql (its member-detail RPC no longer reads deals).
--
-- Order of operations:
--   1. This script (it no longer touches storage rows directly).
--   2. Dashboard -> Storage -> deal_logos -> Delete bucket.
--   3. sql/registrar.sql.
--   4. This script again — self-check #6 then reads true.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Realtime: take deals out of the publication BEFORE dropping the
--    table, so the publication never points at a relation that is
--    mid-drop. Guarded twice: existence check + exception handler.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'deals'
  ) then
    execute 'alter publication supabase_realtime drop table public.deals';
  end if;
exception
  when undefined_table  then null;   -- table already gone
  when undefined_object then null;   -- publication has no such member
  when duplicate_object then null;   -- nothing to remove
end $$;

-- ------------------------------------------------------------
-- 2. Tier-gate trigger + function (billing.sql's enforce_deal_tier).
--    The trigger needs the table, so its drop is guarded; the
--    function drop is standalone and always safe.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.deals') is not null then
    drop trigger if exists enforce_deal_tier on public.deals;
  end if;
exception
  when undefined_table then null;
end $$;

drop function if exists public.enforce_deal_tier();

-- ------------------------------------------------------------
-- 3. Storage: deal logos. Only the two RLS policies are removed
--    here. Supabase blocks DELETE from storage.objects and
--    storage.buckets with a storage.protect_delete() trigger
--    (42501) so files cannot be orphaned; the bucket itself must
--    go through the Storage API, i.e. Dashboard -> Storage ->
--    deal_logos -> Delete bucket. That is step 2 of the run
--    instructions below, and it is reversible-safe: an empty
--    leftover bucket costs nothing, an unknown-table policy does
--    not break anything.
-- ------------------------------------------------------------
drop policy if exists "Public read deal logos"  on storage.objects;
drop policy if exists "Users upload deal logos" on storage.objects;

-- ------------------------------------------------------------
-- 4. Billing price row for the payngo deal cap. pg-safeupdate
--    requires the WHERE clause. 0 rows on a rerun is fine.
-- ------------------------------------------------------------
delete from public.billing_prices where event_type = 'limit_deals_payngo';

-- ------------------------------------------------------------
-- 5. The deals table. Everything below is guarded by the table's
--    existence so a rerun is a clean no-op. Drop order per house
--    rules: grants -> policies -> indexes -> table. The sequence
--    is standalone (the column used nextval(), not an identity),
--    so it is dropped separately and unguarded.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.deals') is not null then
    revoke all on public.deals from anon, authenticated, service_role;

    drop policy if exists "Authenticated read deals"  on public.deals;
    drop policy if exists "Public read active deals"  on public.deals;
    drop policy if exists "Users insert own deals"    on public.deals;
    drop policy if exists "Owners update own deals"   on public.deals;
    drop policy if exists "Owners delete own deals"   on public.deals;
    drop policy if exists "Admins update any deal"    on public.deals;
    drop policy if exists "Admins delete any deal"    on public.deals;

    drop index if exists public.deals_status_idx;
    drop index if exists public.deals_user_idx;

    drop table if exists public.deals;
  end if;
exception
  when undefined_table then null;
end $$;

drop sequence if exists public.deals_queue_seq;

-- ------------------------------------------------------------
-- 6. Tell PostgREST the schema changed.
-- ------------------------------------------------------------
notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 7. SELF CHECK — one row per assertion. Every ok should read true
--    on this run EXCEPT #5 (function bodies): a leftover public
--    function from an un-rerun script still quoting public.deals
--    makes that false until you re-run sql/registrar.sql. #6 is
--    false until you delete the bucket in the Dashboard. #9 proves
--    the good site_assets bucket survived the strip.
-- ------------------------------------------------------------
with checks as (
  select 1 as "#", 'deals table dropped'::text as check_name,
         to_regclass('public.deals') is null as ok

  union all select 2, 'deals_queue_seq sequence dropped',
         to_regclass('public.deals_queue_seq') is null

  union all select 3, 'enforce_deal_tier() function dropped',
         not exists (
           select 1 from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'enforce_deal_tier')

  union all select 4, 'no RLS policies reference deals',
         not exists (
           select 1 from pg_policies
            where tablename = 'deals'
               or policyname ilike '%deal%'
               or coalesce(qual, '')       ilike '%deal%'
               or coalesce(with_check, '') ilike '%deal%')

  union all select 5, 'no public function body still references public.deals',
         not exists (
           select 1 from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and lower(coalesce(p.prosrc, '')) like '%public.deals%')

  union all select 6, 'deal_logos bucket deleted (false = do Dashboard > Storage)',
         not exists (select 1 from storage.buckets where id = 'deal_logos')

  union all select 7, 'limit_deals_payngo price row deleted',
         case when to_regclass('public.billing_prices') is null then true
              else not exists (
                     select 1 from public.billing_prices
                      where event_type = 'limit_deals_payngo') end

  union all select 8, 'deals removed from supabase_realtime publication',
         not exists (
           select 1 from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = 'deals')

  union all select 9, 'site_assets bucket STILL present (untouched)',
         exists (select 1 from storage.buckets where id = 'site_assets')
)
select "#", check_name, ok from checks order by "#";

commit;
