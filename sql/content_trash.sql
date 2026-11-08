-- sql/content_trash.sql — deletion becomes a two-stage flow
--
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query,
-- paste the whole file, press RUN). Idempotent: running it twice is safe.
--
-- The rule this implements:
--   A member who deletes their Gliim does not destroy it — it goes to their
--   Trash, off the site, restorable for 30 days. Every deleted Gliim also
--   appears in the Operations admin's Deleted queue, where it can be restored
--   or finalised (destroyed) right away. Anything nobody acts on is destroyed
--   automatically once it has sat in the Trash for 30 days.
--
-- What this does:
--   1. Three columns on feed_gliims: deleted_at / deleted_by / deleted_reason.
--      No new table — a Gliim is deleted by carrying its own deletion date.
--   2. gliim_trash()   — author or Operations puts a Gliim in the Trash.
--      gliim_restore() — brings it back inside the 30 days.
--      gliim_list_trash() — the author's own Trash, with the countdown.
--      admin_list_deleted_gliims() — the Operations queue.
--      purge_expired_gliims() — destroys everything past 30 days.
--   3. Row Level Security: every read path hides trashed rows, so the Gliim
--      disappears from XpLoRe, search, profiles and the landing page the moment
--      it is trashed, with no client change. Members lose the ability to hard
--      delete through the API — both member DELETE policies are dropped, which
--      is what makes the 30-day window un-skippable.
--   4. Media: R2 files are left alone while a Gliim sits in the Trash, so a
--      restore puts the pictures back exactly as they were. Deleting a Gliim
--      for real (Operations → Finalise) removes its R2 objects through the
--      server. Anything the 30-day sweep destroys turns its files into
--      orphans, and the existing Storage cleanup (admin → Operations →
--      Deleted → "Clean up storage") reclaims them.
--   5. pg_cron: purge_expired_gliims() runs daily at 04:23 UTC.
--   6. SELF CHECK grid at the bottom — every "ok" must be true.
--
-- Nothing in this script deletes any content today. The earliest a Gliim can
-- be destroyed by the schedule is 30 days after someone trashes it.

-- ============================================================
-- 1. COLUMNS
-- ============================================================
alter table public.feed_gliims
  add column if not exists deleted_at      timestamptz,
  add column if not exists deleted_by      uuid references public.profiles(id) on delete set null,
  add column if not exists deleted_reason  text;

comment on column public.feed_gliims.deleted_at is
  'Set when the Gliim was moved to the Trash. Null means it is not deleted. Destroyed 30 days after this timestamp.';
comment on column public.feed_gliims.deleted_by is
  'Who moved it to the Trash — the author, or Operations staff acting on their behalf.';

-- Only trashed rows matter to the two queues, so the index is partial.
create index if not exists idx_feed_gliims_trash
  on public.feed_gliims (deleted_at desc)
 where deleted_at is not null;

-- ============================================================
-- 2. TRASH A GLIIM
-- ============================================================
create or replace function public.gliim_trash(p_post uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  v    public.feed_gliims%rowtype;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select * into v from public.feed_gliims where id = p_post;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- The author trashes their own work; Operations may trash anyone's.
  if not (v.user_id = uid
          or public.admin_has_role(uid, 'operations')
          or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ALLOWED');
  end if;

  if v.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_IN_TRASH');
  end if;

  update public.feed_gliims
     set deleted_at     = now(),
         deleted_by     = uid,
         deleted_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_post;

  return jsonb_build_object(
    'ok',       true,
    'purge_at', now() + interval '30 days',
    'days_left', 30
  );
end;
$$;

-- ============================================================
-- 3. RESTORE A GLIIM
-- ============================================================
create or replace function public.gliim_restore(p_post uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  v    public.feed_gliims%rowtype;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select * into v from public.feed_gliims where id = p_post;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if v.deleted_at is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_IN_TRASH');
  end if;

  if v.deleted_at < now() - interval '30 days' then
    -- The daily sweep is the only thing that clears this window, so this is a
    -- race with the cron job rather than a normal state.
    return jsonb_build_object('ok', false, 'code', 'TOO_LATE');
  end if;

  -- Staff deleted it, so staff puts it back. An author may always restore
  -- what they deleted themselves.
  if v.deleted_by is not null and v.deleted_by <> uid
     and not (public.admin_has_role(uid, 'operations') or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'STAFF_ONLY');
  end if;

  update public.feed_gliims
     set deleted_at = null, deleted_by = null, deleted_reason = null
   where id = p_post;

  return jsonb_build_object('ok', true, 'status', v.status);
end;
$$;

-- ============================================================
-- 4. THE AUTHOR'S TRASH
-- ============================================================
create or replace function public.gliim_list_trash()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  return jsonb_build_object(
    'ok', true,
    'items', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.deleted_at desc)
        from (
          select g.id,
                 g.title,
                 g.description,
                 g.cover_url,
                 g.media_url,
                 g.status,
                 g.created_at,
                 g.deleted_at,
                 g.deleted_by,
                 g.deleted_reason,
                 (g.deleted_by = uid) as deleted_by_me,
                 greatest(0, ceil(30 - extract(epoch from (now() - g.deleted_at)) / 86400)::int) as days_left
            from public.feed_gliims g
           where g.user_id = uid
             and g.deleted_at is not null
             and g.deleted_at >= now() - interval '30 days'
        ) t
    ), '[]'::jsonb)
  );
end;
$$;

-- ============================================================
-- 5. THE OPERATIONS QUEUE
-- ============================================================
create or replace function public.admin_list_deleted_gliims(p_limit int default 100, p_offset int default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  total bigint;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not (public.admin_has_role(uid, 'operations') or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPS');
  end if;

  select count(*) into total from public.feed_gliims where deleted_at is not null;

  return jsonb_build_object(
    'ok', true,
    'count', total,
    'items', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.deleted_at desc)
        from (
          select g.id,
                 g.title,
                 g.description,
                 g.cover_url,
                 g.status,
                 g.created_at,
                 g.deleted_at,
                 g.deleted_reason,
                 g.user_id,
                 a.full_name as author_name,
                 g.deleted_by,
                 d.full_name as deleted_by_name,
                 (g.deleted_by = g.user_id) as deleted_by_author,
                 greatest(0, ceil(30 - extract(epoch from (now() - g.deleted_at)) / 86400)::int) as days_left
            from public.feed_gliims g
            left join public.profiles a on a.id = g.user_id
            left join public.profiles d on d.id = g.deleted_by
           where g.deleted_at is not null
           order by g.deleted_at desc
           limit greatest(1, least(coalesce(p_limit, 100), 500))
          offset greatest(0, coalesce(p_offset, 0))
        ) t
    ), '[]'::jsonb)
  );
end;
$$;

-- ============================================================
-- 6. DESTROY EVERYTHING PAST 30 DAYS
-- ============================================================
-- Runs as the table owner, so the cascading foreign keys take the bodies,
-- interactions, hashtags, views and notifications with the Gliim. reports has
-- no foreign key — it points at posts by id from several tables — so it is
-- cleared by hand first.
--
-- R2 files are not touched here: Postgres cannot reach object storage. Those
-- files stop being referenced the moment the row goes, and the Storage cleanup
-- in the admin app reclaims them.
create or replace function public.purge_expired_gliims()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
    from public.feed_gliims
   where deleted_at is not null
     and deleted_at < now() - interval '30 days';

  if v_ids is null then
    return 0;
  end if;

  delete from public.reports
   where target_type = 'post'
     and target_id = any (v_ids);

  delete from public.feed_gliims
   where id = any (v_ids);

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

-- ============================================================
-- 7. WHO MAY CALL WHAT
-- ============================================================
revoke all on function public.gliim_trash(uuid, text)              from public, anon, authenticated;
revoke all on function public.gliim_restore(uuid)                   from public, anon, authenticated;
revoke all on function public.gliim_list_trash()                    from public, anon, authenticated;
revoke all on function public.admin_list_deleted_gliims(int, int)   from public, anon, authenticated;
revoke all on function public.purge_expired_gliims()                from public, anon, authenticated;

grant execute on function public.gliim_trash(uuid, text)            to authenticated;
grant execute on function public.gliim_restore(uuid)                 to authenticated;
grant execute on function public.gliim_list_trash()                  to authenticated;
grant execute on function public.admin_list_deleted_gliims(int, int) to authenticated;

-- The sweep is a privileged maintenance job. The cron scheduler calls it as
-- the database owner and the server can call it with the service key.
grant execute on function public.purge_expired_gliims() to service_role;

-- ============================================================
-- 8. ROW LEVEL SECURITY — a trashed Gliim is invisible
-- ============================================================
-- Members can no longer destroy their own rows over the API. Both member
-- DELETE policies are dropped on purpose: the only way out of the Trash is
-- restore, Operations finalising, or the 30-day sweep.
drop policy if exists "Users can delete own gliims" on public.feed_gliims;
drop policy if exists "feed_gliims_delete_own"      on public.feed_gliims;

drop policy if exists "feed_gliims_read" on public.feed_gliims;
create policy "feed_gliims_read" on public.feed_gliims
  for select to authenticated
  using (
    deleted_at is null
    and (user_id = auth.uid() or status = 'approved')
  );

drop policy if exists "hide unapproved gliims" on public.feed_gliims;
create policy "hide unapproved gliims" on public.feed_gliims
  for select to authenticated
  using (
    deleted_at is null
    and (
      status = 'approved'
      or is_admin()
      or admin_has_role(auth.uid(), 'crm')
    )
  );

drop policy if exists "hide unapproved gliims (anon)" on public.feed_gliims;
create policy "hide unapproved gliims (anon)" on public.feed_gliims
  for select to anon
  using (deleted_at is null and status = 'approved');

drop policy if exists "CRM read gliims" on public.feed_gliims;
create policy "CRM read gliims" on public.feed_gliims
  for select to authenticated
  using (deleted_at is null and admin_has_role(auth.uid(), 'crm'));

-- ============================================================
-- 9. DAILY SWEEP
-- ============================================================
create extension if not exists pg_cron;

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'purge-deleted-gliims';

select cron.schedule(
  'purge-deleted-gliims',
  '23 4 * * *',
  $$select public.purge_expired_gliims();$$
);

-- ============================================================
-- SELF CHECK — every row must read true
-- ============================================================
select 1 as "#", 'feed_gliims has deleted_at',
       exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='feed_gliims' and column_name='deleted_at') as ok
union all select 2, 'feed_gliims has deleted_by',
       exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='feed_gliims' and column_name='deleted_by')
union all select 3, 'feed_gliims has deleted_reason',
       exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='feed_gliims' and column_name='deleted_reason')
union all select 4, 'trash index exists',
       to_regclass('public.idx_feed_gliims_trash') is not null
union all select 5, 'the five functions exist',
       to_regprocedure('public.gliim_trash(uuid,text)') is not null
       and to_regprocedure('public.gliim_restore(uuid)') is not null
       and to_regprocedure('public.gliim_list_trash()') is not null
       and to_regprocedure('public.admin_list_deleted_gliims(int,int)') is not null
       and to_regprocedure('public.purge_expired_gliims()') is not null
union all select 6, 'members cannot hard delete any more',
       not exists (select 1 from pg_policies
                    where schemaname='public' and tablename='feed_gliims' and cmd='DELETE')
union all select 7, 'every read policy hides the Trash',
       not exists (select 1 from pg_policies
                    where schemaname='public' and tablename='feed_gliims' and cmd='SELECT'
                      and (qual is null or qual not ilike '%deleted_at is null%'))
union all select 8, 'purge is not callable by members',
       has_function_privilege('authenticated', 'public.purge_expired_gliims()', 'execute') = false
union all select 9, 'purge is callable by the service role',
       has_function_privilege('service_role', 'public.purge_expired_gliims()', 'execute')
union all select 10, 'the daily sweep is scheduled',
       exists (select 1 from cron.job where jobname = 'purge-deleted-gliims')
union all select 11, 'members can trash and restore',
       has_function_privilege('authenticated', 'public.gliim_trash(uuid,text)', 'execute')
       and has_function_privilege('authenticated', 'public.gliim_restore(uuid)', 'execute')
union all select 12, 'the Operations queue names the ops role',
       (select prosrc from pg_proc where oid = to_regprocedure('public.admin_list_deleted_gliims(int,int)'))
         ilike '%ops%'
union all select 13, 'trash is measured in 30-day windows',
       (select prosrc from pg_proc where oid = to_regprocedure('public.purge_expired_gliims()'))
         ilike '%30 days%'
order by "#";
