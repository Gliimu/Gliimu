-- state.sql — READ ONLY. Nothing here writes or drops anything.
--
-- Run the whole file in one paste. It returns FIVE result grids.
--
-- Grid 0 matters most: it decides whether to_regclass() can be trusted on
-- this database, which is a big deal because several scripts in sql/ guard
-- their drops with `if to_regclass('public.x') is not null then ...`. If
-- to_regclass lies, those guards silently skip, and a self-check row that
-- asserts `to_regclass(...) is null` reads "true" while the table survives.
--
-- Grid 2 is the precondition list for sql/support.sql section 7, which
-- selects m.is_admin, m.receiver_id, m.sender_id, m.content,
-- m.attachment_url, m.attachment_type and m.created_at from public.messages.
-- Any of those missing aborts the entire script with 42703.

-- ------------------------------------------------------------
-- 0. CATALOG BEHAVIOUR — is to_regclass usable here?
--   rc_profiles = NULL while isn_profiles = 1  → to_regclass is BLIND here.
--     Tell me before running any drop script; no to_regclass guard or
--     self-check row can be trusted.
--   rc_profiles = 'profiles' (or a qualified name) → catalog is normal, and
--     the earlier "relation support_messages does not exist" simply meant
--     the table is genuinely absent, i.e. support.sql has not applied.
-- ------------------------------------------------------------
select current_setting('server_version') as server_version,
       current_setting('server_version_num')::bigint as version_num,
       to_regclass('public.profiles') as rc_profiles,
       to_regclass('public.deals') as rc_deals,
       to_regclass('public.support_messages') as rc_support_messages,
       (select count(*) from information_schema.tables
         where table_schema = 'public' and table_name = 'profiles') as isn_profiles,
       (select count(*) from information_schema.tables
         where table_schema = 'public' and table_name = 'deals') as isn_deals;

-- ------------------------------------------------------------
-- 1. PROBE — which scripts have already applied?
--   state = true means the object EXISTS right now. Every row is boolean,
--   so the UNION cannot type-clash.
-- ------------------------------------------------------------
select 1 as "#", 'public.deals table exists (gigs_drop NOT applied)' as check_name,
       exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name = 'deals') as state

union all select 2, 'public.support_messages exists (support.sql applied)',
       exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name = 'support_messages')

union all select 3, 'messages.feedback column exists (support.sql applied)',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'messages'
                  and column_name = 'feedback')

union all select 4, 'support_inbox() exists (support.sql applied)',
       exists (select 1 from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'support_inbox')

union all select 5, 'deals_queue_seq exists as a sequence',
       exists (select 1 from information_schema.sequences
                where sequence_schema = 'public' and sequence_name = 'deals_queue_seq')

union all select 6, 'deal_logos storage bucket still present',
       exists (select 1 from storage.buckets where id = 'deal_logos')

union all select 7, 'site_assets storage bucket present (must be true)',
       exists (select 1 from storage.buckets where id = 'site_assets')

union all select 8, 'messages.is_admin column exists (support.sql now self-heals this)',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'messages'
                  and column_name = 'is_admin')

union all select 9, 'enforce_deal_tier() function still present',
       exists (select 1 from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'enforce_deal_tier')

order by "#";

-- ------------------------------------------------------------
-- 2. public.messages COLUMN INVENTORY — compare against the header list.
-- ------------------------------------------------------------
select c.column_name as column_name,
       c.data_type as data_type,
       case when c.is_nullable = 'NO' then 'not null' else 'nullable' end as nulability,
       coalesce(c.column_default, '') as default_value
  from information_schema.columns c
 where c.table_schema = 'public' and c.table_name = 'messages'
 order by c.ordinal_position;

-- ------------------------------------------------------------
-- 3. TABLE INVENTORY — every public table, RLS state, policy count.
-- ------------------------------------------------------------
select t.table_name as table_name,
       case when t.row_security = 'YES' then 'rls on' else 'RLS OFF' end as rls,
       coalesce(p.policies, 0) as policy_count
  from information_schema.tables t
  left join (
         select tablename, count(*) as policies
           from pg_policies
          where schemaname = 'public'
          group by tablename
       ) p on p.tablename = t.table_name
 where t.table_schema = 'public'
 order by t.table_name;

-- ------------------------------------------------------------
-- 4. FUNCTION INVENTORY — every public function and who may run it.
-- ------------------------------------------------------------
select p.proname as function_name,
       case p.prosecdef when true then 'definer' else 'invoker' end as security,
       case when pg_get_function_arguments(p.oid) = '' then '()'
            else pg_get_function_arguments(p.oid) end as arguments
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
 order by p.proname;

-- ------------------------------------------------------------
-- 5. HOW MUCH THERE IS TO MIGRATE — how many admin-origin DMs support.sql
--    section 7 will copy into support_messages. This one deliberately
--    references messages.is_admin, so if that column is missing it errors
--    with 42703. That error is itself the answer (grid 1 row 8 false), not a
--    problem — read it as "is_admin not applied yet", not as a broken file.
-- ------------------------------------------------------------
select count(*) filter (where m.is_admin) as admin_origin_messages,
       count(*) as messages_total
  from public.messages m;
