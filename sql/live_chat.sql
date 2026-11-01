-- Live chat messages table
CREATE TABLE IF NOT EXISTS public.live_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.live_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast room lookups
CREATE INDEX IF NOT EXISTS idx_live_chat_messages_room_id ON public.live_chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_live_chat_messages_created_at ON public.live_chat_messages(room_id, created_at);

-- Enable RLS
ALTER TABLE public.live_chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can read messages from their rooms" ON public.live_chat_messages;
DROP POLICY IF EXISTS "Users can insert messages to their rooms" ON public.live_chat_messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON public.live_chat_messages;

-- Policy: Users can read messages from rooms they're participating in
CREATE POLICY "Users can read messages from their rooms"
ON public.live_chat_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.live_session_participants lsp
    WHERE lsp.request_id = live_chat_messages.room_id
    AND lsp.user_id = auth.uid()
    AND lsp.left_at IS NULL
  )
  OR
  EXISTS (
    SELECT 1 FROM public.live_requests lr
    WHERE lr.id = live_chat_messages.room_id
    AND lr.user_id = auth.uid()
  )
);

-- Policy: Users can insert messages to rooms they're participating in
CREATE POLICY "Users can insert messages to their rooms"
ON public.live_chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND
  (
    EXISTS (
      SELECT 1 FROM public.live_session_participants lsp
      WHERE lsp.request_id = live_chat_messages.room_id
      AND lsp.user_id = auth.uid()
      AND lsp.left_at IS NULL
    )
    OR
    EXISTS (
      SELECT 1 FROM public.live_requests lr
      WHERE lr.id = live_chat_messages.room_id
      AND lr.user_id = auth.uid()
    )
  )
);

-- Policy: Users can delete their own messages
CREATE POLICY "Users can delete own messages"
ON public.live_chat_messages
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Grant permissions
GRANT SELECT ON public.live_chat_messages TO authenticated;
GRANT INSERT ON public.live_chat_messages TO authenticated;
GRANT DELETE ON public.live_chat_messages TO authenticated;
