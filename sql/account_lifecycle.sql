-- ============================================================
-- sql/account_lifecycle.sql
-- Run in Supabase Studio → SQL Editor → New query → paste ALL → Run.
-- Idempotent: safe to run more than once.
--
-- Part 1  Stop auto-filling bio / skills / interests on new accounts.
--         The live table carries literal column DEFAULTs (handle_new_user
--         never sets them), so every fresh profile was born pre-filled.
--         Rows still holding the exact old defaults are cleared too.
-- Part 2  Account deletion with a 3-day grace period:
--           request_account_deletion()  member RPC — schedules the purge
--           cancel_account_deletion()   member RPC — clearing a pending
--                                       request; the client calls it after
--                                       every login, so signing back in
--                                       inside the window recovers the account
--           purge_deleted_accounts()    daily pg_cron job — hard delete
-- ============================================================


-- ============================================================
-- PART 1 — drop the placeholder defaults
-- ============================================================

alter table public.profiles alter column bio       drop default;
alter table public.profiles alter column skills    drop default;
alter table public.profiles alter column interests drop default;

-- One-time cleanup: accounts that never personalised these fields still
-- carry the old defaults verbatim. Only cleared when ALL THREE match.
update public.profiles
   set bio = null, skills = null, interests = null
 where bio        = 'Elite Gliimait in training.'
   and skills     = 'Media Tech, Business Strategy'
   and interests  = 'Filmmaking, Web Development';


-- ============================================================
-- PART 2 — deletion tracking columns
-- ============================================================

alter table public.profiles add column if not exists deletion_requested_at timestamptz;
alter table public.profiles add column if not exists deletion_scheduled_at  timestamptz;


-- ============================================================
-- PART 3 — member RPCs
-- ============================================================

create or replace function public.request_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_scheduled timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  update public.profiles
     set deletion_requested_at = now(),
         deletion_scheduled_at = now() + interval '3 days'
   where id = v_uid
  returning deletion_scheduled_at into v_scheduled;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND');
  end if;

  return jsonb_build_object('ok', true, 'scheduled_at', v_scheduled);
end;
$$;

-- Doubles as recovery: the client calls it after every successful login.
-- If a deletion was pending it is cleared and recovered = true.
create or replace function public.cancel_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_recovered boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  update public.profiles
     set deletion_requested_at = null,
         deletion_scheduled_at = null
   where id = v_uid
     and deletion_scheduled_at is not null
  returning true into v_recovered;

  return jsonb_build_object('ok', true, 'recovered', coalesce(v_recovered, false));
end;
$$;


-- ============================================================
-- PART 4 — the daily purge (pg_cron)
-- ============================================================

create or replace function public.purge_deleted_accounts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_purged int := 0;
  v_failed int := 0;
begin
  for r in
    select id from public.profiles
     where deletion_scheduled_at is not null
       and deletion_scheduled_at <= now()
  loop
    begin
      -- live_requests.requester_id and transactions.receiver_id are the
      -- only foreign keys without a cascade; clear those rows first.
      delete from public.live_requests where requester_id = r.id;
      delete from public.transactions  where receiver_id = r.id;

      -- The profile row cascades every member-owned child table and
      -- SET NULLs reviewer/owner columns (feed_items.owner_id etc.).
      delete from public.profiles where id = r.id;

      -- profiles.id -> auth.users(id) has no cascade, so the auth row can
      -- only go once the profile is gone. Its own cascades erase sessions,
      -- messages, hidden_chats, feed_submissions and poll_votes.
      delete from auth.users where id = r.id;

      v_purged := v_purged + 1;
    exception when others then
      -- One broken account must not block the rest of the queue.
      v_failed := v_failed + 1;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'purged', v_purged, 'failed', v_failed);
end;
$$;

revoke execute on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;

revoke execute on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

revoke execute on function public.purge_deleted_accounts() from public, anon, authenticated;
grant execute on function public.purge_deleted_accounts() to service_role;


-- Schedule the purge for 03:23 UTC daily. pg_cron lives in the postgres
-- database; if "create extension" fails, enable pg_cron under
-- Dashboard → Database → Extensions, then re-run this whole script.
create extension if not exists pg_cron;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'purge-deleted-accounts';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'purge-deleted-accounts',
  '23 3 * * *',
  $cron$ select public.purge_deleted_accounts(); $cron$
);


-- ============================================================
-- SELF CHECK — paste each block after the script; comments give the
-- expected result.
-- ============================================================

-- 1. Defaults gone, deletion columns present.
--    Expect: bio / skills / interests -> column_default NULL,
--            deletion_requested_at / deletion_scheduled_at rows exist.
select column_name, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'profiles'
   and column_name in ('bio', 'skills', 'interests',
                       'deletion_requested_at', 'deletion_scheduled_at')
 order by column_name;

-- 2. Three RPCs, all SECURITY DEFINER.
--    Expect: 3 rows, security_definer = true.
select p.proname, p.prosecdef as security_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('request_account_deletion',
                     'cancel_account_deletion',
                     'purge_deleted_accounts')
 order by p.proname;

-- 3. Cron job scheduled.
--    Expect: 1 row — purge-deleted-accounts | 23 3 * * *.
select jobname, schedule, command
  from cron.job
 where jobname = 'purge-deleted-accounts';

-- 4. Right now, nothing is scheduled for deletion.
--    Expect: 0 rows today; 1 row with a future date after a real request.
select id, deletion_requested_at, deletion_scheduled_at
  from public.profiles
 where deletion_scheduled_at is not null;
