-- ============================================================================
-- Terms, section 7: stop promising a member-facing Recycle Bin
-- ----------------------------------------------------------------------------
-- The profile Trash filter and the member Restore button were deleted, so a
-- creator's Delete is now final for them. The live Terms row still read
-- "Deleted content moves to a Recycle bin accessible to platform
-- administrators", which is the opposite of what the app now does.
--
-- What changes:  six text fragments inside the terms row of legal_documents.
-- What does not: no DDL, no other row, no RLS, no RPC. The 30-day purge cron
--                and Operations -> Deleted keep working exactly as before.
--
-- Run this once in the Supabase SQL editor. It is idempotent: the WHERE clause
-- only matches while the word "recycle" is still in the document, so a second
-- run updates zero rows and leaves updated_at alone.
--
-- CONSEQUENCE TO EXPECT: updated_at is what the boot Terms modal in app.js
-- compares against gliimu_terms_accepted_at in each member's browser. Bumping
-- it means every member sees "We've updated our Terms and Policy" once and has
-- to press Agree. That is the intended behaviour for a material change, and it
-- is why this script sets updated_at rather than leaving it.
--
-- To preview instead of apply: run the script, read the SELF CHECK grid, then
-- change the final "commit;" to "rollback;" before you run it for real.
-- ============================================================================

begin;

update public.legal_documents
   set content = replace(
        content,
        '<strong>7. Content Moderation, Deletion &amp; Recycle Bin</strong>',
        '<strong>7. Content Moderation &amp; Deletion</strong>'
   ),
   content = replace(
        content,
        'Deleted content moves to a Recycle bin accessible to platform administrators.',
        'Deletion is final for you — Gliimu gives you no restore option in the app, and the content is permanently purged from storage 30 days after you delete it.'
   ),
   content = replace(
        content,
        '<strong>Recycle Bin Purpose</strong>: The Recycle bin exists for investigation purposes',
        '<strong>What Happens in Those 30 Days</strong>: Your deleted content stays in internal storage that only the Gliimu team can access, for investigation purposes'
   ),
   content = replace(
        content,
        'Content in the Recycle bin will not be restored without the ',
        'It is never put back into public view without the '
   ),
   content = replace(
        content,
        'Administrators may finalize deletion (permanently purge from storage) after investigation.',
        'The team may also finalize deletion and purge it sooner after an investigation.'
   ),
   content = replace(
        content,
        'Once content is finalized for deletion from the Recycle bin, it cannot be recovered.',
        'Once you delete content, you cannot recover it.'
   ),
   updated_at = now()
 where type = 'terms'
   and content ~* 'recycle';


-- ============================================================================
-- SELF CHECK — every row must read PASS
-- ============================================================================
select '1 no recycle wording left' as check,
       case when not (content ~* 'recycle') then 'PASS' else 'FAIL' end as result
  from public.legal_documents where type = 'terms'
union all
select '2 new section 7 heading',
       case when content like '%<strong>7. Content Moderation &amp; Deletion</strong>%' then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
union all
select '3 deletion is final for the member',
       case when content like '%Deletion is final for you%'
             and content like '%no restore option in the app%' then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
union all
select '4 the 30-day purge is still stated',
       case when content like '%permanently purged from storage 30 days after you delete it%' then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
union all
select '5 staff investigation window explained',
       case when content like '%<strong>What Happens in Those 30 Days</strong>%'
             and content like '%only the Gliimu team can access%' then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
union all
select '6 author consent before anything reappears',
       case when content like '%never put back into public view without the author%awareness and explicit approval%' then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
union all
select '7 no-guarantees line rewritten',
       case when content like '%Once you delete content, you cannot recover it.%' then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
union all
select '8 document still whole (8400-9200 chars)',
       case when length(content) between 8400 and 9200 then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
union all
select '9 privacy row untouched',
       case when count(*) = 1 then 'PASS' else 'FAIL' end
  from public.legal_documents
 where type = 'privacy'
   and content like '%16-word recovery phrase%'
   and not (content ~* 'recycle')
union all
select '10 terms updated_at is now recent',
       case when updated_at > now() - interval '10 minutes' then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
order by 1;

commit;

-- Proof of the finished section 7, for your own read-through:
select substr(content, position('<strong>7.' in content), 1500) as section_7
  from public.legal_documents where type = 'terms';
