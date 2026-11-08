-- ============================================================
-- Remove Premium Content
-- Gliimu has no locked content any more: every gliim is ordinary,
-- there is no GP gate and no badge. This script drops the last two
-- database objects that still model a premium gliim.
--
-- Impact review (checked against the live project before writing):
--   * feed_gliims.is_premium  -> referenced by 2 functions only
--       admin_list_pending_posts(text)  (reads it into the admin JSON)
--       post_content_unlocked(uuid)     (uses it for its gate logic)
--   * NO RLS policy, view, index, generated column, trigger or storage
--     rule references the column. The content-body read policy
--     (feed_gliim_contents_select) has qual = true, so no gliim body was
--     ever withheld by premium; unlocking was enforced in the browser only.
--   * post_content_unlocked is called by nothing -> safe to drop outright.
--   * admin_list_pending_posts IS called (admin/assets/js/views/
--     submissions.js:54), so it is rebuilt FIRST without the column
--     reference, and only then is the column dropped. Order matters.
--   * The admin app never displayed the is_premium key it received, so
--     removing it from the JSON changes nothing on screen.
--
-- ARCHIVE FIRST (read-only, run this before the script and keep the result):
--   SELECT id, title, status, user_id, created_at
--     FROM public.feed_gliims
--    WHERE is_premium
--    ORDER BY created_at;
--   Today that returns 2 rows: "Meran" and "Life" (both approved).
--   Both keep publishing as normal gliims after this script; nothing is
--   deleted, only the flag that made them marked premium.
-- ============================================================
BEGIN;

-- 1. Rebuild the admin submissions RPC without the premium key.
--    Body is identical to the live version apart from the dropped
--    'is_premium' field, so no behaviour changes for staff.
create or replace function public.admin_list_pending_posts(p_status text default 'pending')
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
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
       and (p_status = 'all' or p.status = coalesce(nullif(btrim(p_status), ''), 'pending'))
  ), '[]'::jsonb));
end $function$;

-- 2. Drop the orphan unlock gate (no policy, function or RPC calls it).
drop function if exists public.post_content_unlocked(uuid);

-- 3. Drop the flag itself.
alter table public.feed_gliims drop column if exists is_premium;

COMMIT;

-- ============================================================
-- SELF CHECK - paste each query alone, compare with EXPECTED.
-- Every row must match; do not edit the queries.
--
--   1  select count(*) from information_schema.columns
--        where table_schema='public' and table_name='feed_gliims'
--          and column_name='is_premium';
--      EXPECTED 0
--
--   2  select count(*) from pg_proc p
--        join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname='public' and p.proname='post_content_unlocked';
--      EXPECTED 0
--
--   3  select count(*) from pg_proc p
--        join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname='public' and p.proname='admin_list_pending_posts';
--      EXPECTED 1
--
--   4  select p.prosrc like '%is_premium%' as still_mentions_premium
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname='public' and p.proname='admin_list_pending_posts';
--      EXPECTED false
--
--   5  select count(*) from pg_policies
--       where schemaname='public'
--         and (coalesce(qual,'') || coalesce(with_check,'')) ilike '%is_premium%';
--      EXPECTED 0
--
--   6  select public.admin_list_pending_posts('all') ->> 'ok' as rpc_works;
--      EXPECTED true     (run while signed in as CRM/admin staff;
--                         NOT_AUTHENTICATED here only means no session)
-- ============================================================
