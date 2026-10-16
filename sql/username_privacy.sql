-- ============================================================
-- Gliimu: hide usernames from other users — PART A (public view)
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once. Standalone — run in any order.
--
-- WHY
--   public.public_hub_posts is read by the PUBLIC landing page as
--   anon (signed-out). The view returns a `username` column, so
--   anyone could query it straight from the API even though the
--   landing only ever renders full_name. This closes that hole at
--   the database, not just in the client.
--
-- WHAT IT DOES
--   Replaces the blanket table-level SELECT grant on the view with
--   COLUMN-level grants that omit `username`:
--     anon / authenticated -> every column EXCEPT username
--     service_role         -> full access (server / admin)
--   The view definition is untouched, so the landing page keeps
--   working (it selects content, media_url, media_type, created_at,
--   full_name, avatar_url — all still granted).
--
-- NOTE ON PART B (profiles.username)
--   Locking the username column on the profiles TABLE is a separate
--   change: the admin app reads it in 8 views under the same
--   `authenticated` role members use, so revoking it there must be
--   paired with an is_admin()-gated lookup function and admin-client
--   edits first. That is delivered separately, not in this script.
-- ============================================================

do $$ begin
  if to_regclass('public.public_hub_posts') is null then
    raise exception 'public.public_hub_posts is MISSING — nothing to lock.';
  end if;
end $$;

-- Drop the all-columns grant, then re-grant only the safe columns.
-- (A table-level SELECT implies every column, so it must go first.)
revoke select on public.public_hub_posts from anon;
revoke select on public.public_hub_posts from authenticated;

grant select (content, media_url, media_type, created_at, full_name, avatar_url)
  on public.public_hub_posts to anon;
grant select (content, media_url, media_type, created_at, full_name, avatar_url)
  on public.public_hub_posts to authenticated;

-- Server / admin keep full access.
grant select on public.public_hub_posts to service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- SELF CHECK — read the grid after running. Every row should be OK.
-- ============================================================
select '1. view exists'                              as item,
       (to_regclass('public.public_hub_posts') is not null)::text as result
union all
select '2. anon CANNOT select username',
       (not has_column_privilege('anon', 'public.public_hub_posts', 'username', 'SELECT'))::text
union all
select '3. anon CAN select full_name',
       has_column_privilege('anon', 'public.public_hub_posts', 'full_name', 'SELECT')::text
union all
select '4. anon CAN select content',
       has_column_privilege('anon', 'public.public_hub_posts', 'content', 'SELECT')::text
union all
select '5. anon CAN select avatar_url',
       has_column_privilege('anon', 'public.public_hub_posts', 'avatar_url', 'SELECT')::text
union all
select '6. authenticated CANNOT select username',
       (not has_column_privilege('authenticated', 'public.public_hub_posts', 'username', 'SELECT'))::text
union all
select '7. authenticated CAN select full_name',
       has_column_privilege('authenticated', 'public.public_hub_posts', 'full_name', 'SELECT')::text
union all
select '8. service_role CAN select username',
       has_column_privilege('service_role', 'public.public_hub_posts', 'username', 'SELECT')::text
order by "item";
