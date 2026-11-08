-- ============================================================================
-- admin_all_gliims.sql
-- Keep trashed gliims out of CRM -> All Gliims.
--
-- IMPACT REVIEW (done before writing this script)
--   * Live state 2026-11-08: feed_gliims holds 4 approved + 3 draft rows,
--     0 trashed. So this changes nothing visible today; it closes a hole that
--     opens the first time an author deletes something.
--   * admin_list_pending_posts is SECURITY DEFINER, so it does NOT inherit the
--     feed_gliims_read policy ("deleted_at is null and status = 'approved'").
--     Without the filter below, a gliim sitting in the 30-day trash window
--     would still be listed in All Gliims and badged "Live", even though no
--     member can see it. Operations -> Site Content -> Deleted already owns
--     that queue (operations_deleted_gliims), so CRM must not double-list it.
--   * Only reader of this RPC: admin/assets/js/views/submissions.js, which
--     calls it with p_status => 'all'. No other client, server route or
--     function calls it.
--   * Signature is unchanged (p_status text default 'pending'), so this is a
--     replace, not a second overload. CREATE OR REPLACE preserves the existing
--     EXECUTE grants; nothing is dropped.
--   * Non-destructive: no table, column, row or function is removed.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

BEGIN;

create or replace function public.admin_list_pending_posts(p_status text default 'pending')
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not (public.admin_has_role(uid, 'crm') or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'NOT_CRM');
  end if;
  return jsonb_build_object('ok', true, 'posts', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'title', p.title, 'description', p.description,
             'category', p.category, 'cover_url', p.cover_url,
             'status', p.status, 'review_note', p.review_note,
             'created_at', p.created_at, 'reviewed_at', p.reviewed_at,
             'user_id', p.user_id,
             'author_name', coalesce(pr.full_name, pr.username, 'Unknown member'),
             'author_avatar', pr.avatar_url,
             'blocks', coalesce(pc.blocks, '[]'::jsonb))
             order by p.created_at desc)
      from public.feed_gliims p
      left join public.profiles pr on pr.id = p.user_id
      left join public.feed_gliim_contents pc on pc.post_id = p.id
     where p.status is distinct from 'draft'
       and p.deleted_at is null
       and (p_status = 'all' or p.status = coalesce(nullif(btrim(p_status), ''), 'pending'))
  ), '[]'::jsonb));
end $function$;

COMMIT;

-- ============================================================================
-- SELF CHECK — paste this block second. Every row must read ok.
-- No edits needed.
-- ============================================================================
with checks as (
  select 1 as "#", 'function exists' as test,
         (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'admin_list_pending_posts') as ok
  union all
  select 2, 'exactly one overload (no duplicate signature)',
         (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'admin_list_pending_posts')
  union all
  select 3, 'body filters trashed rows',
         (select pg_get_functiondef(p.oid) ilike '%deleted_at is null%'
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'admin_list_pending_posts')
  union all
  select 4, 'body still excludes drafts',
         (select pg_get_functiondef(p.oid) ilike '%is distinct from ''draft''%'
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'admin_list_pending_posts')
  union all
  select 5, 'no premium key left in the body',
         (select pg_get_functiondef(p.oid) not ilike '%is_premium%'
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'admin_list_pending_posts')
  union all
  select 6, 'still SECURITY DEFINER with search_path public',
         (select p.prosecdef and p.proconfig::text ilike '%search_path=public%'
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'admin_list_pending_posts')
  union all
  select 7, 'authenticated can still execute it',
         has_function_privilege('authenticated', 'public.admin_list_pending_posts(text)', 'EXECUTE')
  union all
  select 8, 'operations still owns the trash queue',
         (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'admin_list_deleted_gliims')
)
select "#", test, case when ok then 'ok' else 'FAIL' end as result from checks order by "#";

-- Row 8 note: All Gliims and Operations -> Deleted must stay disjoint. This
-- confirms the operations-side trash reader still exists, so excluding trashed
-- rows here does not orphan them.
--
-- The RPC itself returns {"ok":false,"code":"NOT_AUTHENTICATED"} when called
-- from the SQL editor, because auth.uid() is null under the service role. That
-- is the designed guard, not a failure — sign in to the admin app to see rows.