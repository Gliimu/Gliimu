-- Delete the broken audiolite item (Josh 'n John)
-- This item has no playable audio files after the sweep cleanup
DELETE FROM feed_items WHERE id = 'f5e12a6f-83ec-44f8-b7d2-aa58a01ecc8e';

-- Verify it's gone
SELECT COUNT(*) as remaining FROM feed_items WHERE id = 'f5e12a6f-83ec-44f8-b7d2-aa58a01ecc8e';
