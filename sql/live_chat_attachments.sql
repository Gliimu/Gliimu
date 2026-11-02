-- Add file attachment support to live chat messages
-- Allows sharing PDF, EPUB, DOCX, images, etc. in live session chat

-- Add attachment columns
ALTER TABLE public.live_chat_messages
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT;

-- Make content nullable (file-only messages have empty content)
ALTER TABLE public.live_chat_messages
  ALTER COLUMN content DROP NOT NULL;

-- Drop old check constraint if it exists, recreate to allow empty content when attachment present
ALTER TABLE public.live_chat_messages
  DROP CONSTRAINT IF EXISTS live_chat_messages_content_check;

ALTER TABLE public.live_chat_messages
  ADD CONSTRAINT live_chat_messages_content_check
  CHECK (
    (content IS NOT NULL AND char_length(content) > 0 AND char_length(content) <= 1000)
    OR attachment_url IS NOT NULL
  );

-- SELF CHECK
DO $$
DECLARE
  checks_passed INTEGER := 0;
  total_checks INTEGER := 3;
BEGIN
  -- Check 1: attachment_url column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_chat_messages' AND column_name = 'attachment_url'
  ) THEN
    checks_passed := checks_passed + 1;
  END IF;

  -- Check 2: attachment_type column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_chat_messages' AND column_name = 'attachment_type'
  ) THEN
    checks_passed := checks_passed + 1;
  END IF;

  -- Check 3: content is nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_chat_messages' AND column_name = 'content' AND is_nullable = 'YES'
  ) THEN
    checks_passed := checks_passed + 1;
  END IF;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'LIVE CHAT ATTACHMENTS MIGRATION CHECK';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Checks passed: % / %', checks_passed, total_checks;

  IF checks_passed = total_checks THEN
    RAISE NOTICE 'ALL CHECKS PASSED';
  ELSE
    RAISE WARNING 'SOME CHECKS FAILED — review migration';
  END IF;
END $$;
