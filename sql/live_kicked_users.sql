-- Live kicked users: prevents kicked participants from rejoining
-- Run in Supabase SQL Editor

-- 1. Create the kicked users table
create table if not exists live_kicked_users (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_requests(id) on delete cascade,
  user_id uuid not null,
  kicked_at timestamptz not null default now(),
  unique (session_id, user_id)
);

-- 2. Enable RLS
alter table live_kicked_users enable row level security;

-- 3. Anyone authenticated can check if they are kicked (needed for join flow)
create policy "authenticated can select live_kicked_users"
  on live_kicked_users for select
  to authenticated
  using (true);

-- 4. Only the service role can insert (server-side via /api/live/kick)
-- No client-side insert policy needed — server uses service role key

-- 5. Index for fast lookup on join
create index if not exists idx_live_kicked_session_user
  on live_kicked_users (session_id, user_id);

-- SELF CHECK
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  TABLE:    live_kicked_users                                 ║
-- ║  COLUMNS:  id, session_id, user_id, kicked_at               ║
-- ║  INDEX:    idx_live_kicked_session_user                      ║
-- ║  RLS:      enabled                                           ║
-- ║  POLICIES: 1 (select for authenticated)                      ║
-- ╚══════════════════════════════════════════════════════════════╝
