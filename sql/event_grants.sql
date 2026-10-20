-- ============================================================
-- EVENT TABLE GRANTS — fix 403 errors
-- Run this in Supabase SQL Editor
-- ============================================================

-- Event categories: everyone can read
grant select on public.event_categories to authenticated;

-- Events: everyone can read recruiting/active events, authenticated users can insert
grant select on public.events to authenticated;
grant insert on public.events to authenticated;
grant update on public.events to authenticated;

-- Event participants: users can read and join
grant select on public.event_participants to authenticated;
grant insert on public.event_participants to authenticated;
grant delete on public.event_participants to authenticated;

-- Event teams: users can read and create/join teams
grant select on public.event_teams to authenticated;
grant insert on public.event_teams to authenticated;

-- Event team members: users can read and join teams
grant select on public.event_team_members to authenticated;
grant insert on public.event_team_members to authenticated;

-- Event posts: users can read and create posts
grant select on public.event_posts to authenticated;
grant insert on public.event_posts to authenticated;

-- Event post likes: users can read and like posts
grant select on public.event_post_likes to authenticated;
grant insert on public.event_post_likes to authenticated;

-- Event GP earnings: read-only for users to see their earnings
grant select on public.event_gp_earnings to authenticated;

-- Event prizes: read-only
grant select on public.event_prizes to authenticated;

-- ============================================================
-- SELF CHECK — verify grants were applied
-- ============================================================
SELECT 
  schemaname,
  tablename,
  has_table_privilege('authenticated', schemaname||'.'||tablename, 'SELECT') as can_select,
  has_table_privilege('authenticated', schemaname||'.'||tablename, 'INSERT') as can_insert,
  has_table_privilege('authenticated', schemaname||'.'||tablename, 'UPDATE') as can_update,
  has_table_privilege('authenticated', schemaname||'.'||tablename, 'DELETE') as can_delete
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'event%'
ORDER BY tablename;
