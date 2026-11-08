-- sql/instant_publish.sql — publish goes live immediately, no approval queue
--
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query,
-- paste the whole file, press RUN). It is idempotent: running it twice is safe.
--
-- What this does:
--   1. set_feed_gliim_status (BEFORE INSERT): a draft stays a draft, every other
--        insert becomes 'approved'. Nothing is ever parked in 'pending' again.
--   2. guard_feed_gliim_status (BEFORE UPDATE): a member can publish their own
--        draft instantly and can pull it back to draft. Staff can still change
--        anything, so the admin takedown / restore tool keeps working. A staff
--        'rejected' decision stays rejected until staff lift it.
--   3. Delivers any tags that were waiting in the mention queue, then retires
--        the queue (trigger + function + table). Tags now notify on publish.
--   4. Releases the backlog: every 'pending' gliim goes live. The guard trigger
--        is disabled around that UPDATE because pending → approved is not a
--        transition a member is allowed to make, and re-enabled afterwards.
--   5. Rewords the admin_review_post notices for take down / put back online.
--   6. SELF CHECK grid at the bottom — every "ok" must be true.

-- ============================================================
-- 1. INSERT TRIGGER — everything except a draft is live
-- ============================================================
create or replace function public.set_feed_gliim_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'draft' then
    return new;
  end if;

  new.status      := 'approved';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.review_note := null;
  return new;
end;
$$;

-- ============================================================
-- 2. UPDATE GUARD — members publish freely, staff decisions stick
-- ============================================================
create or replace function public.guard_feed_gliim_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Staff moderate with admin_review_post(); their writes pass untouched.
  if public.is_admin() or public.admin_has_role(auth.uid(), 'crm') then
    return new;
  end if;

  -- Review fields belong to staff.
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.review_note := old.review_note;

  if new.status = old.status then
    return new;
  end if;

  -- Pulling a live gliim back into draft is always allowed.
  if new.status = 'draft' then
    return new;
  end if;

  -- Publishing a draft is instant — this is the whole point of the change.
  if new.status = 'approved' and old.status = 'draft' then
    return new;
  end if;

  -- Everything else, including un-rejecting your own post, is staff-only.
  new.status := old.status;
  return new;
end;
$$;

-- ============================================================
-- 3. RETIRE THE MENTION QUEUE
-- ============================================================
-- 3a. Archive query — what is still waiting for an approval that will never
--     arrive. Expect zero rows.
select * from public.feed_gliim_mentions;

-- 3b. Deliver those tags now, straight into the member's Alerts page.
insert into public.notifications (user_id, actor_id, kind, title, link_post, link_comment)
select m.user_id, m.mentioned_by, m.kind,
       format('%s tagged you in the hub page: "%s"',
              (select full_name from public.profiles where id = m.mentioned_by),
              coalesce(g.title, 'a gliim')),
       m.post_id, m.comment_id
  from public.feed_gliim_mentions m
  join public.feed_gliims g on g.id = m.post_id
on conflict do nothing;

-- 3c. The approval fan-out no longer has anything to fan out on.
drop trigger if exists trg_fan_out_gliim_mentions on public.feed_gliims;
drop function if exists public.fan_out_gliim_mentions();
drop table if exists public.feed_gliim_mentions;

-- ============================================================
-- 4. RELEASE THE BACKLOG
-- ============================================================
-- What is about to go live. Expect one row or none.
select id, title, user_id, created_at
  from public.feed_gliims
 where status = 'pending'
 order by created_at;

-- pending → approved is not a transition the guard permits, and this runs
-- without a signed-in admin, so the trigger comes off for one UPDATE.
alter table public.feed_gliims disable trigger trg_guard_feed_gliim_status;

update public.feed_gliims
   set status = 'approved',
       reviewed_by = null,
       reviewed_at = null,
       review_note = null
 where status = 'pending';

alter table public.feed_gliims enable trigger trg_guard_feed_gliim_status;

-- Counts per status after the release.
select status, count(*)
  from public.feed_gliims
 group by status
 order by status;

-- ============================================================
-- 5. ADMIN NOTICE COPY — approve/reject are now restore/take down
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
            'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" was taken down',
            'Reason: ' || p_note, p_post);

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  update public.feed_gliims
     set status = 'approved', reviewed_by = uid, reviewed_at = now(), review_note = p_note
   where id = p_post;

  insert into public.notifications (user_id, actor_id, kind, title, link_post)
  values (v_post.user_id, uid, 'review',
          'Your gliim "' || coalesce(v_post.title, 'Untitled') || '" is back online',
          p_post);

  return jsonb_build_object('ok', true, 'status', 'approved');
end;
$$;

-- ============================================================
-- SELF CHECK — every row must read true
-- ============================================================
select 1 as "#", 'insert trigger never parks a post in review',
       (select prosrc from pg_proc where oid = to_regprocedure('public.set_feed_gliim_status()'))
         not ilike '%pending%' as ok
union all
select 2, 'insert trigger publishes as approved',
       (select prosrc from pg_proc where oid = to_regprocedure('public.set_feed_gliim_status()'))
         ilike '%approved%'
union all
select 3, 'dead live-publish GUC branch is gone',
       (select prosrc from pg_proc where oid = to_regprocedure('public.set_feed_gliim_status()'))
         not ilike '%live_publish%'
union all
select 4, 'guard publishes a draft instantly',
       (select prosrc from pg_proc where oid = to_regprocedure('public.guard_feed_gliim_status()'))
         ilike '%new.status = %approved%'
       and (select prosrc from pg_proc where oid = to_regprocedure('public.guard_feed_gliim_status()'))
         ilike '%old.status = %draft%'
union all
select 5, 'guard no longer says pending anywhere',
       (select prosrc from pg_proc where oid = to_regprocedure('public.guard_feed_gliim_status()'))
         not ilike '%pending%'
union all
select 6, 'guard still protects the review fields',
       (select prosrc from pg_proc where oid = to_regprocedure('public.guard_feed_gliim_status()'))
         ilike '%reviewed_by := old.reviewed_by%'
union all
select 7, 'approval fan-out trigger is gone',
       not exists (select 1 from pg_trigger
                    where tgname = 'trg_fan_out_gliim_mentions'
                      and tgrelid = 'public.feed_gliims'::regclass
                      and not tgisinternal)
union all
select 8, 'fan_out_gliim_mentions() is gone',
       to_regprocedure('public.fan_out_gliim_mentions()') is null
union all
select 9, 'feed_gliim_mentions table is gone',
       to_regclass('public.feed_gliim_mentions') is null
union all
select 10, 'no gliim is left pending',
       not exists (select 1 from public.feed_gliims where status = 'pending')
union all
select 11, 'guard trigger is switched back on',
       exists (select 1 from pg_trigger
                where tgname = 'trg_guard_feed_gliim_status'
                  and tgrelid = 'public.feed_gliims'::regclass
                  and not tgisinternal
                  and tgenabled = 'O')
union all
select 12, 'insert trigger is still switched on',
       exists (select 1 from pg_trigger
                where tgname = 'trg_set_feed_gliim_status'
                  and tgrelid = 'public.feed_gliims'::regclass
                  and not tgisinternal
                  and tgenenabled = 'O')
union all
select 13, 'takedown notice says taken down',
       (select prosrc from pg_proc where oid = to_regprocedure('public.admin_review_post(uuid,text,text)'))
         ilike '%taken down%'
union all
select 14, 'restore notice says back online',
       (select prosrc from pg_proc where oid = to_regprocedure('public.admin_review_post(uuid,text,text)'))
         ilike '%back online%'
order by "#";
