-- ============================================================
-- Gliimu: DEAD OBJECT CLEANUP
--
-- Drops three objects that nothing uses. Each was verified
-- before this script was written:
--
--   admin_codes   1 row. No SQL script in sql/ creates it, no
--                 app code reads it, and no function in the
--                 public schema mentions it. Admin sign-in is
--                 gated on admin_users.role instead (admin.sql).
--
--   leaderboard   5 rows. A stale snapshot. The profile
--                 leaderboard the members see is computed from
--                 profiles.total_gp, not from this table.
--
--   public_stats  1 row. No SQL script creates it and nothing
--                 reads it. The landing page builds its own
--                 counts from public_hub_posts.
--
-- WHAT THIS DELIBERATELY LEAVES ALONE
--   posts.is_live, posts.live_ended_at, posts.tagged_users and
--   site_settings.earnings_image_url are also dead, but they
--   were kept on purpose. The self-check at the bottom reports
--   them so the decision stays visible.
--
-- SAFETY
--   No CASCADE anywhere. If anything turns out to depend on one
--   of these objects the drop fails, the failure is caught, the
--   object is kept, and the self-check says KEPT instead of
--   pretending it worked. That is the point: a cascade could
--   quietly take an RLS policy on some other table with it.
--
-- Safe to run more than once. Running it again reports
-- "already gone" for all three.
--
-- HOW TO RUN
--   1. Supabase -> SQL Editor -> New query.
--   2. Paste this whole file. Do not edit it.
--   3. Press Run once.
--   4. Read the Results grid. Every row should say GONE, and
--      rows 04 to 06 should confirm nothing else was touched.
-- ============================================================

-- A session-scoped log so the self-check can report what the
-- block below actually did, rather than what it hoped to do.
drop table if exists pg_temp.cleanup_log;
create temp table cleanup_log (object text not null, outcome text not null);

do $$
declare
  v_names text[] := array['admin_codes', 'leaderboard', 'public_stats'];
  v_name  text;
  v_kind  char;
begin
  foreach v_name in array v_names loop

    select c.relkind into v_kind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = v_name;

    if v_kind is null then
      insert into pg_temp.cleanup_log (object, outcome)
      values (v_name, 'already gone');
      continue;
    end if;

    begin
      -- relkind decides the statement: a view cannot be dropped
      -- with DROP TABLE and vice versa.
      if v_kind = 'v' then
        execute format('drop view public.%I', v_name);
      elsif v_kind = 'm' then
        execute format('drop materialized view public.%I', v_name);
      else
        execute format('drop table public.%I', v_name);
      end if;

      insert into pg_temp.cleanup_log (object, outcome)
      values (v_name, 'dropped');

    exception when others then
      insert into pg_temp.cleanup_log (object, outcome)
      values (v_name, 'KEPT — ' || sqlerrm);
    end;

  end loop;
end
$$;

-- PostgREST caches the schema, so it would keep offering the
-- dropped objects over REST until it is told otherwise.
notify pgrst, 'reload schema';

-- ============================================================
-- SELF CHECK
-- ============================================================
select case l.object
         when 'admin_codes'  then '01. admin_codes'
         when 'leaderboard'  then '02. leaderboard'
         else                     '03. public_stats'
       end                                                          as check_item,
       l.outcome
         || case when to_regclass('public.' || l.object) is null
                 then ' — confirmed GONE'
                 else ' — STILL IN THE DATABASE'
            end                                                     as result
  from pg_temp.cleanup_log l

union all
select '04. nothing depended on them',
       case when (select count(*) from pg_temp.cleanup_log where outcome like 'KEPT%') = 0
            then 'OK'
            else (select string_agg(object || ': ' || outcome, ' | ')
                    from pg_temp.cleanup_log where outcome like 'KEPT%')
       end

union all
select '05. the tables the app actually uses',
       (select count(*)::text || ' of 8 present'
          from (values ('profiles'), ('posts'), ('deals'), ('faqs'),
                       ('reports'), ('site_settings'), ('partners'),
                       ('contact_info')) as v(t)
         where to_regclass('public.' || v.t) is not null)

union all
select '06. the functions all.sql defines',
       (select count(*)::text || ' of 6 present'
          from (values ('transfer_to_user'), ('purchase_subscription'),
                       ('send_support'), ('bump_post_views'),
                       ('top_uploader'), ('admin_has_role')) as v(f)
         where exists (select 1
                         from pg_proc p
                         join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public'
                          and p.proname = v.f))

union all
select '07. dead columns kept on purpose',
       (select count(*)::text || ' of 4 still present (posts.is_live, posts.live_ended_at, posts.tagged_users, site_settings.earnings_image_url)'
          from information_schema.columns c
         where c.table_schema = 'public'
           and ((c.table_name = 'posts'
                 and c.column_name in ('is_live', 'live_ended_at', 'tagged_users'))
             or (c.table_name = 'site_settings'
                 and c.column_name = 'earnings_image_url')))

order by 1;
