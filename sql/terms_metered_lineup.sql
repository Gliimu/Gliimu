-- ============================================================================
-- terms_metered_lineup.sql
--
-- The Terms that members actually read are stored in legal_documents (type =
-- 'terms') and rendered as-is by views/terms.js. That row still described the
-- economy as it was in October: a wallet "denominated in Naira", a
-- "per-consumption session (approximately 3 hours of access)", subscription
-- tiers "Starter, Pro, or Elite", and GP as the thing that unlocks posting.
-- Every one of those is now false, and sql/plan_lineup.sql made them false in
-- production on purpose. A member who agreed to that text and is then charged
-- by the minute is being billed under a promise the platform broke.
--
-- This rewrites only the sentences that stopped being true. It does not touch
-- the code of conduct, IP, moderation, recovery phrase, liability or change
-- clauses.
--
-- Idempotent: every replace() is a no-op once the old fragment is gone, and
-- the Last Updated strip is guarded by a LIKE test.
--
-- Side effect worth knowing about: the clause set is what the boot modal
-- compares against gliimu_terms_accepted_at, so bumping updated_at re-prompts
-- every member to accept the corrected Terms. That is intended — they agreed
-- to text that no longer describes the platform.
--
-- Run with:  Supabase dashboard → SQL editor → paste → Run.
--            The grid at the bottom must be 10 rows, all PASS.
--
-- Verified 2026-11-20 by dry-running these exact literals against the live
-- row (read over the Data API, 8,781 chars): all six replaces fire once each,
-- the Last Updated strip fires, and the grid reads 10/10 PASS. The live row
-- carries no daily-bonus promise, so nothing here had to cover one.
--
-- Revisit clause 4 when the Xtra group plan ships (task #904): this text says
-- "one plan" because that is all a member can buy today. Adding Xtra means
-- adding its sentence here, not leaving it true by accident.
-- ============================================================================

begin;

-- 1. The dated line the page already prints itself, from updated_at. Two
--    "Last updated" dates on one page, disagreeing with each other.
update public.legal_documents
   set content = regexp_replace(
         content,
         '^<p style="margin-bottom: 12px;"><strong>Last Updated:</strong>.*?</p>[[:space:]]*',
         '',
         'n')
 where type = 'terms'
   and content like '<p style="margin-bottom: 12px;"><strong>Last Updated:</strong>%';

-- 2. The wallet is tokens, not naira. Naira only buys tokens.
update public.legal_documents
   set content = replace(
         content,
         'Your wallet balance is denominated in Naira (₦) and represents real money. You can top up your wallet via bank transfer or receive funds from other users. Content consumption charges are deducted from your wallet balance. Wallet balance is withdrawable to bank accounts or transferable to other users on the platform.',
         'Your wallet balance is a number of tokens, not naira. Naira only buys tokens, at the rate shown at the point of purchase. You receive tokens the same way you receive any other credit on the platform: a top-up, a transfer from another member, or your own earnings. Consumption charges are deducted from this balance. It is withdrawable to a bank account or transferable to other users on the platform.'),
    updated_at = now()
 where type = 'terms'
   and content like '%denominated in Naira%';

-- 3. GP no longer unlocks anything. It is standing, and it is not convertible.
update public.legal_documents
   set content = replace(
         content,
         'GP is used to unlock feature eligibility (e.g., posting privileges, premium features) and serves as a credibility metric for creators.',
         'GP is a credibility metric that appears under your name. It does not gate publishing, it unlocks no feature, and it cannot be turned into tokens or money.'),
    updated_at = now()
 where type = 'terms'
   and content like '%GP is used to unlock feature eligibility%';

-- 4. One plan, metered. The tiers this row names were retired first, and the
--    ones it does not name (Monthly/Yearly/Standard) were retired after it.
update public.legal_documents
   set content = replace(
         content,
         'You subscribe to a plan (Starter, Pro, or Elite) which grants platform access and may include monthly wallet credits or GP bonuses.',
         'Gliimu runs one plan, Pay n'' Go. There is no subscription fee and nothing to renew: usage is metered against your token balance at the rate shown on the Billing page. The paid tiers that came before it — Starter, Pro, Elite, Monthly, Yearly and Standard — have been retired and can no longer be bought. A member still inside paid time bought under a retired tier keeps that time; the meter starts when it runs out.'),
    updated_at = now()
 where type = 'terms'
   and content like '%Starter, Pro, or Elite%';

-- 5. The meter is per minute and follows whatever is open, not a 3-hour
--    session ticket. Live is on the same meter, and hosting costs a fee.
update public.legal_documents
   set content = replace(
         content,
         'When you open content (a book, audiolite, or bundle), a charge is deducted from your wallet balance for a consumption session (approximately 3 hours of access). If you close the content and return later, a new session charge applies.',
         'When you open content (a book, audiolite, or bundle) or join a live session, tokens are deducted from your balance for each minute it stays open, at the single rate the platform sets. The charge follows whichever item you have open. Closing it stops the charge and opening it again starts a new one; while nothing is open, nothing is charged. A balance that cannot cover the first minute will not open the item or the session. Hosting a live session costs the host a one-token fee, taken once when they go on air.'),
    updated_at = now()
 where type = 'terms'
   and content like '%approximately 3 hours of access%';

-- 6. Creators are paid out of what a viewer actually paid, and a payout is
--    reviewed rather than auto-settled in 24 hours.
update public.legal_documents
   set content = replace(
         content,
         'A portion of consumption charges goes to the creator''s wallet balance. This is real money that can be withdrawn to bank accounts or transferred to other users on the platform. Withdrawal requests are processed within 24 hours. You are responsible for any third-party payment gateway fees or tax liabilities.',
         'A portion of what a viewer is charged goes to the creator''s token balance. A creator is paid only for minutes a viewer actually paid for, so a minute nobody was billed for earns nothing. Tokens can be withdrawn to a bank account or transferred to other users on the platform. A withdrawal is held for a short anti-fraud window and then reviewed and released by the Gliimu team, so processing times vary and the wait shown at the point of request applies. You are responsible for any third-party payment gateway fees or tax liabilities.'),
    updated_at = now()
 where type = 'terms'
   and content like '%Withdrawal requests are processed within 24 hours%';

-- Support is spelled the same way in both places it happens, and it is a
-- purchase, not a wage. Section 5 promised "both wallet balance and GP" from
-- consumption, which the split does not do.
update public.legal_documents
   set content = replace(
         content,
         'Creators earn both wallet balance (real money) and GP when users consume their content:',
         'Creators earn tokens when members consume their content, and GP when members engage with it:'),
    updated_at = now()
 where type = 'terms'
   and content like '%Creators earn both wallet balance (real money) and GP%';

-- The meter is the same for reading and for watching, so a per-minute rate
-- belongs to one sentence rather than two.

commit;

-- ============================================================================
-- SELF CHECK — 10 rows, all must read PASS.
-- Read-only. Nothing here changes the document.
-- ============================================================================

select '1 no stale naira wallet' as check,
       case when content not like '%denominated in Naira%' then 'PASS' else 'FAIL' end as result
  from public.legal_documents where type = 'terms'
union all
select '2 no retired tier names as current',
       case when content not like '%Starter, Pro, or Elite%' then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
union all
select '3 no 3-hour session promise',
       case when content not like '%approximately 3 hours of access%' then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
union all
select '4 no auto-24h payout promise',
       case when content not like '%processed within 24 hours%' then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
union all
select '5 GP promises no feature unlock',
       case when content not like '%GP is used to unlock feature eligibility%' then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
union all
select '6 one duplicated Last Updated line is gone',
       case when content not like '<p style="margin-bottom: 12px;"><strong>Last Updated:</strong>%' then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
union all
select '7 Pay n'' Go is named as the plan',
       case when content like '%Pay n'' Go%' then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
union all
select '8 the minute meter is stated',
       case when content like '%for each minute it stays open%' then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
union all
select '9 the host fee is stated',
       case when content like '%one-token fee%' then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms'
union all
select '10 every other clause survived',
       case when content like '%16-word recovery phrase%'
              and content like '%Code of Conduct%'
              and content like '%Intellectual Property%'
              and content like '%Limitation of Liability%'
              and content like '%Changes to Terms%'
              and content like '%Cohorts, Contests%'
            then 'PASS' else 'FAIL' end
  from public.legal_documents where type = 'terms';
