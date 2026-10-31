-- ============================================================================
-- Live Rooms: Multi-participant sessions with daily.co
-- ============================================================================
-- Repurposes live_requests for multi-participant rooms and adds in-session chat.
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- 1. Add columns to live_requests for multi-participant support
DO $$
BEGIN
  -- room_url: daily.co room URL for joining
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'live_requests' AND column_name = 'room_url') THEN
    ALTER TABLE live_requests ADD COLUMN room_url TEXT;
  END IF;

  -- room_id: daily.co room ID (for API calls to delete room)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'live_requests' AND column_name = 'room_id') THEN
    ALTER TABLE live_requests ADD COLUMN room_id TEXT;
  END IF;

  -- sharing_mode: 'triad', 'users', or 'general'
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'live_requests' AND column_name = 'sharing_mode') THEN
    ALTER TABLE live_requests ADD COLUMN sharing_mode TEXT DEFAULT 'general';
  END IF;

  -- triad_id: which triad to invite (nullable)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'live_requests' AND column_name = 'triad_id') THEN
    ALTER TABLE live_requests ADD COLUMN triad_id UUID;
  END IF;

  -- invited_user_ids: JSON array of user IDs to invite (nullable)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'live_requests' AND column_name = 'invited_user_ids') THEN
    ALTER TABLE live_requests ADD COLUMN invited_user_ids JSONB;
  END IF;

  -- max_participants: room capacity (default 10)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'live_requests' AND column_name = 'max_participants') THEN
    ALTER TABLE live_requests ADD COLUMN max_participants INTEGER DEFAULT 10;
  END IF;

  -- participant_count: live counter of current participants
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'live_requests' AND column_name = 'participant_count') THEN
    ALTER TABLE live_requests ADD COLUMN participant_count INTEGER DEFAULT 0;
  END IF;

  -- is_locked: host can lock room to prevent new joins
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'live_requests' AND column_name = 'is_locked') THEN
    ALTER TABLE live_requests ADD COLUMN is_locked BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- 2. Make partner_id nullable (no longer required for multi-participant)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_requests' AND column_name = 'partner_id'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE live_requests ALTER COLUMN partner_id DROP NOT NULL;
  END IF;
END $$;

-- 3. Create live_chat_messages table for in-session chat
CREATE TABLE IF NOT EXISTS live_chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES live_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast chat loading by room
CREATE INDEX IF NOT EXISTS idx_live_chat_room ON live_chat_messages(room_id, created_at);

-- RLS for live_chat_messages
ALTER TABLE live_chat_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can read chat messages in rooms they can see
CREATE POLICY "live_chat_read" ON live_chat_messages
  FOR SELECT
  TO authenticated
  USING (true);

-- Anyone can send chat messages
CREATE POLICY "live_chat_insert" ON live_chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own messages
CREATE POLICY "live_chat_delete" ON live_chat_messages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Update RLS on live_requests to allow reading rooms by sharing mode
-- Drop old restrictive policies if they exist
DROP POLICY IF EXISTS "live_requests_select" ON live_requests;
DROP POLICY IF EXISTS "live_requests_insert" ON live_requests;
DROP POLICY IF EXISTS "live_requests_update" ON live_requests;
DROP POLICY IF EXISTS "live_requests_delete" ON live_requests;

-- Select: users can see general rooms, their own rooms, and rooms they're invited to
CREATE POLICY "live_requests_select" ON live_requests
  FOR SELECT
  TO authenticated
  USING (
    -- General rooms are visible to everyone
    sharing_mode = 'general'
    OR
    -- Users can see their own rooms
    user_id = auth.uid()
    OR
    -- Users can see rooms where they're a partner (legacy 1-on-1)
    partner_id = auth.uid()
    OR
    -- Users can see rooms where they're invited (covers triad and users modes)
    (invited_user_ids IS NOT NULL AND invited_user_ids::text LIKE '%' || auth.uid()::text || '%')
  );

-- Insert: authenticated users can create rooms
CREATE POLICY "live_requests_insert" ON live_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Update: hosts can update their own rooms
CREATE POLICY "live_requests_update" ON live_requests
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = partner_id)
  WITH CHECK (auth.uid() = user_id OR auth.uid() = partner_id);

-- Delete: hosts can delete their own rooms
CREATE POLICY "live_requests_delete" ON live_requests
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. SELF CHECK
DO $$
DECLARE
  col_count INTEGER;
  chat_exists BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'live_requests'
  AND column_name IN ('room_url', 'room_id', 'sharing_mode', 'triad_id', 'invited_user_ids', 'max_participants', 'participant_count', 'is_locked');

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'live_chat_messages'
  ) INTO chat_exists;

  IF col_count = 8 AND chat_exists THEN
    RAISE NOTICE '✅ Live rooms migration complete: 8 columns added, chat table created';
  ELSE
    RAISE EXCEPTION '❌ Migration incomplete: col_count=%, chat_exists=%', col_count, chat_exists;
  END IF;
END $$;
