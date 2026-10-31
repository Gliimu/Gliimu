-- live_rooms.sql
-- Daily.co integration for multi-participant live sessions
-- Applied: 2026-10-31

-- Add daily.co room columns to live_requests
ALTER TABLE live_requests
  ADD COLUMN IF NOT EXISTS room_url TEXT,
  ADD COLUMN IF NOT EXISTS room_id TEXT,
  ADD COLUMN IF NOT EXISTS sharing_mode TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS triad_id UUID,
  ADD COLUMN IF NOT EXISTS invited_user_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_participants INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS participant_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;

-- Create in-session chat messages table
CREATE TABLE IF NOT EXISTS live_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES live_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 1000),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE live_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies for live_chat_messages
DO $$
BEGIN
  -- Users can read messages in their sessions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'live_chat_read' AND tablename = 'live_chat_messages') THEN
    CREATE POLICY "live_chat_read" ON live_chat_messages
      FOR SELECT TO authenticated
      USING (
        room_id IN (
          SELECT id FROM live_requests
          WHERE user_id = auth.uid() OR partner_id = auth.uid()
          OR auth.uid() = ANY(invited_user_ids)
        )
      );
  END IF;

  -- Users can insert messages in their sessions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'live_chat_insert' AND tablename = 'live_chat_messages') THEN
    CREATE POLICY "live_chat_insert" ON live_chat_messages
      FOR INSERT TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND room_id IN (
          SELECT id FROM live_requests
          WHERE user_id = auth.uid() OR partner_id = auth.uid()
          OR auth.uid() = ANY(invited_user_ids)
        )
      );
  END IF;
END $$;

-- Index for faster chat lookups
CREATE INDEX IF NOT EXISTS idx_live_chat_messages_room_id ON live_chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_live_chat_messages_created_at ON live_chat_messages(created_at);

-- SELF CHECK
DO $$
DECLARE
  checks_passed INTEGER := 0;
  checks_total INTEGER := 3;
BEGIN
  -- Check 1: live_requests has room_url column
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'live_requests' AND column_name = 'room_url') THEN
    checks_passed := checks_passed + 1;
  END IF;

  -- Check 2: live_requests has sharing_mode column
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'live_requests' AND column_name = 'sharing_mode') THEN
    checks_passed := checks_passed + 1;
  END IF;

  -- Check 3: live_chat_messages table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'live_chat_messages') THEN
    checks_passed := checks_passed + 1;
  END IF;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'LIVE ROOMS MIGRATION SELF-CHECK';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Checks passed: % / %', checks_passed, checks_total;
  
  IF checks_passed = checks_total THEN
    RAISE NOTICE 'STATUS: ALL CHECKS PASSED';
  ELSE
    RAISE NOTICE 'STATUS: SOME CHECKS FAILED';
  END IF;
  
  RAISE NOTICE '========================================';
END $$;
