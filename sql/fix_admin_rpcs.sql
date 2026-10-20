-- ============================================================
-- FIX ADMIN RPCs — update stale posts/post_contents references
-- The admin_list_pending_posts and admin_review_post RPCs were
-- still querying the old posts table instead of feed_gliims.
-- Safe to re-run: idempotent.
-- ============================================================

-- Drop old functions first (they reference the non-existent posts table)
drop function if exists public.admin_list_pending_posts(text);
drop function if exists public.admin_review_post(uuid, text, text);

-- Fix admin_list_pending_posts to query feed_gliims
create function public.admin_list_pending_posts(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not (public.admin_has_role(uid, 'crm') or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'NOT_CRM');
  end if;

  return jsonb_build_object('ok', true, 'posts', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',            p.id,
             'title',         p.title,
             'description',   p.description,
             'category',      p.category,
             'cover_url',     p.cover_url,
             'is_premium',    p.is_premium,
             'status',        p.status,
             'review_note',   p.review_note,
             'created_at',    p.created_at,
             'reviewed_at',   p.reviewed_at,
             'user_id',       p.user_id,
             'author_name',   coalesce(pr.full_name, pr.username, 'Unknown member'),
             'author_avatar', pr.avatar_url,
             'blocks',        coalesce(pc.blocks, '[]'::jsonb))
             order by p.created_at desc)
      from public.feed_gliims p
      left join public.profiles pr      on pr.id = p.user_id
      left join public.feed_gliim_contents pc on pc.post_id = p.id
     where (
       p.status is distinct from 'draft'
       and (p_status = 'all'
            or p.status = coalesce(nullif(btrim(p_status), ''), 'pending'))
     )
  ), '[]'::jsonb));
end $$;

-- Fix admin_review_post to update feed_gliims
create function public.admin_review_post(p_post uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_post public.feed_gliims%rowtype;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not (public.admin_has_role(uid, 'crm') or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'NOT_CRM');
  end if;

  if p_action not in ('approve', 'reject') then
    return jsonb_build_object('ok', false, 'code', 'BAD_ACTION');
  end if;

  select * into v_post from public.feed_gliims where id = p_post;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if p_action = 'reject' then
    if coalesce(btrim(p_note), '') = '' then
      return jsonb_build_object('ok', false, 'code', 'NOTE_REQUIRED');
    end if;

    update public.feed_gliims
       set status = 'rejected', reviewed_by = uid, reviewed_at = now(), review_note = p_note
     where id = p_post;

    insert into public.support_messages (thread_user, sender_id, content)
    values (v_post.user_id, uid,
            'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was not approved. Reason: ' || p_note);

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  update public.feed_gliims
     set status = 'approved', reviewed_by = uid, reviewed_at = now(), review_note = p_note
   where id = p_post;

  insert into public.support_messages (thread_user, sender_id, content)
  values (v_post.user_id, uid,
          'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was approved and is now live in the Hub.');

  return jsonb_build_object('ok', true, 'status', 'approved');
end $$;

-- Grants
revoke execute on function public.admin_list_pending_posts(text) from public, anon;
grant execute on function public.admin_list_pending_posts(text) to authenticated, service_role;

revoke execute on function public.admin_review_post(uuid, text, text) from public, anon;
grant execute on function public.admin_review_post(uuid, text, text) to authenticated, service_role;

-- SELF CHECK
select 'admin_list_pending_posts fixed' as check_name,
  (select coalesce(to_regprocedure('public.admin_list_pending_posts(text)')::text,'MISSING')) as status;

select 'admin_review_post fixed' as check_name,
  (select coalesce(to_regprocedure('public.admin_review_post(uuid,text,text)')::text,'MISSING')) as status;
