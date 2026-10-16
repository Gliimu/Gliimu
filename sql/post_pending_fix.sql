-- ============================================================
-- Gliimu: fix "new row violates row-level security policy
-- 'hide unapproved gliims'" when a member publishes a gliim.
-- Run in the Supabase SQL Editor any time AFTER sql/gliim_approval.sql
-- and the post_contents hardening. Safe to run more than once.
--
-- WHY IT BROKE
--   A member's new gliim is forced to status='pending' by a trigger, and
--   the RESTRICTIVE "hide unapproved gliims" SELECT policy hides pending
--   rows from everyone except admins/CRM -- including the author. Two
--   writes in the publish flow depended on the author being able to see
--   that row:
--     1. the client used .insert(...).select('id'), whose RETURNING re-read
--        the pending row and tripped the restrictive policy. Fixed in
--        hub.js by generating the id client-side and dropping .select().
--     2. the post_contents INSERT/UPDATE policies check ownership with
--        EXISTS (select 1 from posts ...), and that subquery runs under
--        posts RLS, so it could not see the pending parent either.
--   This script fixes (2): a SECURITY DEFINER owns_post() helper answers
--   "does this post belong to the caller?" without being blinded by posts
--   RLS, and the two post_contents policies now use it.
--
--   owns_post() is safe: it still keys on auth.uid(), so a caller can only
--   ever confirm ownership of their OWN posts; it returns no row data.
-- ============================================================

select pg_advisory_xact_lock(hashtext('gliimu-post-pending-fix'));

-- ------------------------------------------------------------
-- 1. Ownership helper (SECURITY DEFINER so posts RLS does not blind it)
-- ------------------------------------------------------------
create or replace function public.owns_post(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post
      and p.user_id = auth.uid()
  );
$$;

revoke all on function public.owns_post(uuid) from public, anon;
grant execute on function public.owns_post(uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- 2. post_contents write policies now use the helper
-- ------------------------------------------------------------
drop policy if exists "post content insert" on public.post_contents;
create policy "post content insert" on public.post_contents
  for insert to authenticated
  with check (public.owns_post(post_id));

drop policy if exists "post content update" on public.post_contents;
create policy "post content update" on public.post_contents
  for update to authenticated
  using (public.owns_post(post_id))
  with check (public.owns_post(post_id));

notify pgrst, 'reload schema';

-- ============================================================
-- SELF CHECK -- returns a grid. Every row should read OK.
-- ============================================================
select 1 as "#", 'owns_post() exists' as item,
       case when to_regprocedure('public.owns_post(uuid)') is null then 'MISSING' else 'OK' end as result
union all select 2, 'owns_post is SECURITY DEFINER',
       case when (select p.prosecdef from pg_proc p
                   where p.oid = to_regprocedure('public.owns_post(uuid)'))
            then 'OK' else 'NOT DEFINER' end
union all select 3, 'anon cannot execute owns_post',
       case when has_function_privilege('anon', 'public.owns_post(uuid)', 'execute')
            then 'GRANTED (bad)' else 'OK' end
union all select 4, 'authenticated can execute owns_post',
       case when has_function_privilege('authenticated', 'public.owns_post(uuid)', 'execute')
            then 'OK' else 'NO GRANT' end
union all select 5, 'post_contents insert policy uses owns_post',
       coalesce((select case when with_check like '%owns_post%' then 'OK'
                             else 'OLD: ' || coalesce(with_check, '-') end
                 from pg_policies
                where schemaname='public' and tablename='post_contents'
                  and policyname='post content insert'), 'MISSING')
union all select 6, 'post_contents update policy uses owns_post',
       coalesce((select case when qual like '%owns_post%' and with_check like '%owns_post%'
                             then 'OK' else 'CHECK MANUALLY' end
                 from pg_policies
                where schemaname='public' and tablename='post_contents'
                  and policyname='post content update'), 'MISSING')
union all select 7, 'hide unapproved gliims still restrictive SELECT',
       coalesce((select case when cmd='SELECT' and permissive='RESTRICTIVE' then 'OK'
                             else cmd || '/' || permissive end
                 from pg_policies
                where schemaname='public' and tablename='posts'
                  and policyname='hide unapproved gliims'), 'MISSING')
order by "#";
