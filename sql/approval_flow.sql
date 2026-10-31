-- sql/approval_flow.sql — Pen-badge bypass + remove pod badge
-- Run this script once on Supabase.
--
-- What this does:
--   1. Converts any existing 'pod' badges to 'tick'.
--   2. Narrows the check constraint to (NULL, 'tick', 'pen') only.
--   3. Rewrites set_feed_gliim_status (BEFORE INSERT):
--        - draft stays draft
--        - admin/CRM or pen-badge user → 'approved'
--        - everyone else → 'pending'
--   4. Rewrites guard_feed_gliim_status (BEFORE UPDATE):
--        - admin/CRM can change anything
--        - non-admins can save as draft freely
--        - non-admin pen-badge can publish draft → 'approved'
--        - non-admin without pen-badge: draft → 'pending'
--        - non-admins can never self-approve (pending → approved blocked)
--        - review fields (reviewed_by, reviewed_at, review_note) protected
--   5. Updates admin_grant_verification to reject 'pod'.
--   6. Self-check grid at the bottom.

-- ============================================================
-- 1. MIGRATE EXISTING POD BADGES → TICK
-- ============================================================
update public.profiles
set verification_badge = 'tick'
where verification_badge = 'pod';

-- ============================================================
-- 2. NARROW THE CHECK CONSTRAINT (drop old, add new)
-- ============================================================
alter table public.profiles
  drop constraint if exists profiles_verification_badge_check;

alter table public.profiles
  add constraint profiles_verification_badge_check
  check (verification_badge is null or verification_badge in ('tick', 'pen'));

-- ============================================================
-- 3. REWRITE INSERT TRIGGER — pen bypass + pending default
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

  if public.is_admin() or public.admin_has_role(auth.uid(), 'crm') then
    new.status      := 'approved';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  if (select verification_badge from public.profiles where id = new.user_id) = 'pen' then
    new.status      := 'approved';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  new.status      := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.review_note := null;
  return new;
end;
$$;

-- ============================================================
-- 4. REWRITE UPDATE GUARD — protect review fields + status flow
-- ============================================================
create or replace function public.guard_feed_gliim_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() or public.admin_has_role(auth.uid(), 'crm') then
    return new;
  end if;

  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.review_note := old.review_note;

  if new.status = old.status then
    return new;
  end if;

  if new.status = 'draft' then
    return new;
  end if;

  if old.status = 'draft' and new.status = 'approved' then
    if (select verification_badge from public.profiles where id = auth.uid()) = 'pen' then
      return new;
    else
      new.status := 'pending';
      return new;
    end if;
  end if;

  new.status := old.status;
  return new;
end;
$$;

-- ============================================================
-- 5. UPDATE admin_grant_verification — reject 'pod'
-- ============================================================
drop function if exists public.admin_grant_verification(uuid, text);
create or replace function public.admin_grant_verification(p_user_id uuid, p_badge text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Unauthorized';
  end if;

  if p_badge not in ('tick', 'pen') then
    raise exception 'Invalid badge type. Allowed: tick, pen';
  end if;

  update public.profiles
  set verification_badge = p_badge
  where id = p_user_id;
end;
$$;

revoke execute on function public.admin_grant_verification(uuid, text) from public, anon;
grant execute on function public.admin_grant_verification(uuid, text) to authenticated;

-- ============================================================
-- 6. FIX RLS POLICIES (the hiding was broken — see self-check #10)
-- ============================================================
-- 6a. Drop "Public can read gliims": qual=true for anon+authenticated,
--     so every permissive OR made drafts/pending visible to everyone.
drop policy if exists "Public can read gliims" on public.feed_gliims;

-- 6b. Drop the old feed_gliims_read that showed pending to all authenticated.
drop policy if exists "feed_gliims_read" on public.feed_gliims;

-- Owners see their own rows in every status (draft, pending, rejected).
-- All authenticated users see approved posts from anyone.
create policy "feed_gliims_read"
  on public.feed_gliims
  for select
  to authenticated
  using (user_id = auth.uid() OR status = 'approved');

-- 6c. Tighten updates to owner-only ("Users can update gliims" was qual=true).
drop policy if exists "Users can update gliims" on public.feed_gliims;

create policy "Users can update gliims"
  on public.feed_gliims
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- SELF CHECK
-- ============================================================
select 1 as "#", 'pod badges migrated to tick (zero pod remain)' as item,
       (select count(*) = 0 from public.profiles where verification_badge = 'pod') as ok
union all
select 2, 'check constraint allows only tick/pen/null',
       not exists (
         select 1 from public.profiles
         where verification_badge is not null
           and verification_badge not in ('tick', 'pen')
       )
union all
select 3, 'set_feed_gliim_status checks pen badge',
       (select prosrc from pg_proc
         where oid = to_regprocedure('public.set_feed_gliim_status()'))
       ilike '%verification_badge%pen%'
union all
select 4, 'set_feed_gliim_status defaults to pending',
       (select prosrc from pg_proc
         where oid = to_regprocedure('public.set_feed_gliim_status()'))
       ilike '%pending%'
union all
select 5, 'guard_feed_gliim_status protects review fields',
       (select prosrc from pg_proc
         where oid = to_regprocedure('public.guard_feed_gliim_status()'))
       ilike '%reviewed_by := old.reviewed_by%'
union all
select 6, 'guard_feed_gliim_status blocks self-approve',
       (select prosrc from pg_proc
         where oid = to_regprocedure('public.guard_feed_gliim_status()'))
       ilike '%pending%'
       and (select prosrc from pg_proc
             where oid = to_regprocedure('public.guard_feed_gliim_status()'))
           ilike '%old.status%'
union all
select 7, 'admin_grant_verification rejects pod',
       (select prosrc from pg_proc
         where oid = to_regprocedure('public.admin_grant_verification(uuid,text)'))
       not ilike '%pod%'
union all
select 8, 'admin_grant_verification accepts tick and pen',
       (select prosrc from pg_proc
         where oid = to_regprocedure('public.admin_grant_verification(uuid,text)'))
       ilike '%tick%, %pen%'
union all
select 9, 'constraint name is profiles_verification_badge_check',
       exists (select 1 from pg_constraint
                where conname = 'profiles_verification_badge_check')
union all
select 10, 'overly-permissive "Public can read gliims" policy is gone',
       not exists (select 1 from pg_policies
                    where tablename = 'feed_gliims'
                      and policyname = 'Public can read gliims')
union all
select 11, 'feed_gliims_read is owner-only',
       exists (select 1 from pg_policies
                where tablename = 'feed_gliims'
                  and policyname = 'feed_gliims_read'
                  and qual ilike '%user_id = auth.uid()%')
union all
select 12, 'updates are owner-only with check',
       exists (select 1 from pg_policies
                where tablename = 'feed_gliims'
                  and policyname = 'Users can update gliims'
                  and qual ilike '%user_id = auth.uid()%'
                  and with_check ilike '%user_id = auth.uid()%')
union all
select 13, 'hide-unapproved policies still in place',
       exists (select 1 from pg_policies
                where tablename = 'feed_gliims'
                  and policyname = 'hide unapproved gliims')
       and exists (select 1 from pg_policies
                    where tablename = 'feed_gliims'
                      and policyname = 'hide unapproved gliims (anon)')
order by "#";
