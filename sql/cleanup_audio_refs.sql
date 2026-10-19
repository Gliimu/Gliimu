-- Clean up references to deleted audio files
-- The orphan sweep wrongly deleted 2 wav files (THE WIND, FLOWING TIDE)
-- This removes their references from feed_contents.files JSON

-- First, let's see what references exist
SELECT 
  item_id,
  jsonb_pretty(files) as current_files
FROM feed_contents 
WHERE files::text LIKE '%.wav%'
LIMIT 10;

-- Remove wav file references from the files JSON array
-- This filters out any file objects where the url ends with .wav
-- If all files are removed, set to empty array instead of NULL
UPDATE feed_contents
SET files = COALESCE(
  (
    SELECT jsonb_agg(file_obj)
    FROM jsonb_array_elements(files) AS file_obj
    WHERE NOT (file_obj->>'url' LIKE '%.wav')
  ),
  '[]'::jsonb
)
WHERE files::text LIKE '%.wav%';

-- Verify the cleanup
SELECT 
  item_id,
  CASE 
    WHEN files IS NULL THEN 'No files'
    WHEN jsonb_array_length(files) = 0 THEN 'Empty array'
    ELSE jsonb_pretty(files)
  END as files_after_cleanup
FROM feed_contents 
WHERE item_id IN (
  SELECT item_id FROM feed_contents 
  WHERE files IS NOT NULL 
  AND jsonb_typeof(files) = 'array'
)
LIMIT 10;

-- Check if any wav references remain
SELECT COUNT(*) as remaining_wav_refs
FROM feed_contents
WHERE files::text LIKE '%.wav%';
