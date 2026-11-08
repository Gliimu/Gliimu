-- sql/notifications.sql — every one-way notification lands on the Alerts page
-- Run this script once on Supabase.
--
-- What this does:
--   1. Creates public.notifications — one row per notification, with an
--      optional deep link (post/comment) and a read marker. Members see only
--      their own rows; a sender may only create rows where they are the actor.
--   2. Rewrites admin_review_post (same signature): approve/reject now writes
--      a notification instead of a Support-thread message.
--   3. Adds notifications to the supabase_realtime publication so the sidebar
--      badge can live-update.
--   4. Self-check grid at the bottom.
--
-- This script used to also create public.feed_gliim_mentions — a queue for
-- tags made on posts still awaiting review — plus the trigger that fanned
-- that queue out on approval. Gliims publish instantly now, so the queue and
-- its fan-out were removed; sql/instant_publish.sql drops them and
-- sql/archive_gliim_mentions.sql keeps their old definitions.

-- ============================================================
-- 1. NOTIFICATIONS TABLE
-- ============================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'system'
    check (kind in ('tag', 'mention', 'review', 'live', 'system')),
  title text not null,
  body text,
  link_post uuid references public.feed_gliims(id) on delete cascade,
  link_comment uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_time_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

revoke all on public.notifications from anon;
grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;

drop policy if exists "Members read own notifications" on public.notifications;
create policy "Members read own notifications"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Members insert notifications they author" on public.notifications;
create policy "Members insert notifications they author"
  on public.notifications
  for insert
  to authenticated
  with check (actor_id = auth.uid());

drop policy if exists "Members update own notifications" on public.notifications;
create policy "Members update own notifications"
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Members delete own notifications" on public.notifications;
create policy "Members delete own notifications"
  on public.notifications
  for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 2. REWRITE admin_review_post — notices become notifications
-- ============================================================
create or replace function public.admin_review_post(p_post uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
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

    insert into public.notifications (user_id, actor_id, kind, title, body, link_post)
    values (v_post.user_id, uid, 'review',
            'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was not approved',
            'Reason: ' || p_note, p_post);

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  update public.feed_gliims
     set status = 'approved', reviewed_by = uid, reviewed_at = now(), review_note = p_note
   where id = p_post;

  insert into public.notifications (user_id, actor_id, kind, title, link_post)
  values (v_post.user_id, uid, 'review',
          'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was approved and is now live',
          p_post);

  return jsonb_build_object('ok', true, 'status', 'approved');
end
$$;

revoke execute on function public.admin_review_post(uuid, text, text) from public, anon;
grant execute on function public.admin_review_post(uuid, text, text) to authenticated, service_role;

-- ============================================================
-- 3. REALTIME — the sidebar badge can live-update
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

-- ============================================================
-- SELF CHECK
-- ============================================================
select 1 as "#", 'notifications table exists with RLS enabled' as item,
       exists (select 1 from pg_tables
                where schemaname = 'public' and tablename = 'notifications' and rowsecurity = true) as ok
union all
select 2, 'four RLS policies on notifications',
       (select count(*) = 4 from pg_policies
         where schemaname = 'public' and tablename = 'notifications')
union all
select 3, 'insert policy requires the sender to be the actor',
       exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = 'notifications'
                  and policyname = 'Members insert notifications they author'
                  and with_check ilike '%actor_id = auth.uid()%')
union all
select 4, 'anon has no privileges on notifications',
       not has_table_privilege('anon', 'public.notifications', 'SELECT')
       and not has_table_privilege('anon', 'public.notifications', 'INSERT')
union all
select 5, 'authenticated can select, insert and update',
       has_table_privilege('authenticated', 'public.notifications', 'SELECT')
       and has_table_privilege('authenticated', 'public.notifications', 'INSERT')
       and has_table_privilege('authenticated', 'public.notifications', 'UPDATE')
union all
select 6, 'kind check constraint exists',
       exists (select 1 from pg_constraint
                where conrelid = 'public.notifications'::regclass
                  and conname = 'notifications_kind_check')
union all
select 7, 'deleting a post also removes its notifications',
       exists (select 1 from pg_constraint
                where conrelid = 'public.notifications'::regclass
                  and conname like '%link_post%'
                  and pg_get_constraintdef(oid) ilike '%on delete cascade%')
union all
select 8, 'review RPC writes notifications, not support_messages',
       (select prosrc from pg_proc
         where oid = to_regprocedure('public.admin_review_post(uuid,text,text)'))
       ilike '%insert into public.notifications%'
       and (select prosrc from pg_proc
             where oid = to_regprocedure('public.admin_review_post(uuid,text,text)'))
       not ilike '%insert into public.support_messages%'
union all
select 9, 'notifications is in the realtime publication',
       exists (select 1 from pg_publication_tables
                where pubname = 'supabase_realtime' and tablename = 'notifications')
order by "#";
