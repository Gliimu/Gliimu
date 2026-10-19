-- Update terms and privacy documents
-- This updates the legal_documents table with the current terms reflecting:
-- - Rental/per-consumption model (no permanent ownership)
-- - Dual currency: Wallet Balance (real money) + GP (earned, for eligibility)
-- - Content moderation + Recycle bin
-- - Recovery phrase (ProtonMail-style)
-- - Cohorts and contests
-- - Platform safety statement

-- Update Terms of Service
UPDATE public.legal_documents
SET content = '<p style="margin-bottom: 12px;"><strong>Last Updated:</strong> October 2026</p>
<p style="margin-bottom: 16px;">Welcome to Gliimu — a platform for sharing Ideas that Inspire. By creating an account, you agree to the following terms:</p>

<p style="margin-bottom: 6px;"><strong>1. Eligibility &amp; Platform Purpose</strong></p>
<p style="margin-bottom: 16px;">You must be at least 16 years old to use Gliimu. By registering, you attest to this age requirement. Gliimu is a publishing library where creators share books, audiolites, and other digital content. We also host periodic cohorts, contests, and live sessions. Our mission is to share ideas that inspire — through published works, live conversations, and structured learning experiences. Users access content on a per-consumption basis (rental model) rather than permanent ownership.</p>

<p style="margin-bottom: 6px;"><strong>2. Code of Conduct &amp; Content Standards</strong></p>
<p style="margin-bottom: 16px;">You agree to maintain professional, respectful, and ethical conduct. Gliimu reserves the right to suspend or terminate your account immediately, without prior notice or refund, if you engage in: plagiarism, intellectual property theft, harassment, hate speech, scamming, uploading illegal or harmful content, or any behavior that violates platform policies. Gliimu reserves the right to define disruptive behavior at its sole discretion.</p>

<p style="margin-bottom: 6px;"><strong>3. Cohorts, Contests &amp; Structured Programs</strong></p>
<p style="margin-bottom: 16px;">Gliimu periodically hosts cohorts, contests, and other structured programs. By participating, you agree to follow the specific rules, guidelines, and code of conduct for each program. Program rules are provided at the time of enrollment and take precedence over general platform policies for the duration of the program. Violations may result in removal from the program, forfeiture of any program-related benefits, and/or account suspension. Program schedules, formats, and availability are subject to change without prior notice.</p>

<p style="margin-bottom: 6px;"><strong>4. Wallet Balance, GP &amp; Consumption Model</strong></p>
<p style="margin-bottom: 16px;">Gliimu operates on a dual-currency system:</p>
<ul style="margin-bottom: 16px;">
<li><strong>Wallet Balance (Real Money)</strong>: Your wallet balance is denominated in Naira (₦) and represents real money. You can top up your wallet via bank transfer or receive funds from other users. Content consumption charges are deducted from your wallet balance. Wallet balance is withdrawable to bank accounts or transferable to other users on the platform.</li>
<li><strong>GP (Gliimu Points)</strong>: GP is earned through platform activities (posting, engagement, completing tasks). GP cannot be purchased or topped up. GP is used to unlock feature eligibility (e.g., posting privileges, premium features) and serves as a credibility metric for creators. GP is non-withdrawable and has no monetary value outside the platform.</li>
<li><strong>Subscription Tiers</strong>: You subscribe to a plan (Starter, Pro, or Elite) which grants platform access and may include monthly wallet credits or GP bonuses.</li>
<li><strong>Per-Consumption Charges</strong>: When you open content (a book, audiolite, or bundle), a charge is deducted from your wallet balance for a consumption session (approximately 3 hours of access). If you close the content and return later, a new session charge applies.</li>
<li><strong>No Permanent Ownership</strong>: You are renting access to content, not buying it. Content may be removed by the creator or platform at any time.</li>
<li><strong>Refunds</strong>: All payments are final and non-refundable. Wallet balance spent on consumption sessions is not refundable, even if content is later removed. Gliimu retains discretion to issue refunds in exceptional cases of verifiable platform failure.</li>
</ul>

<p style="margin-bottom: 6px;"><strong>5. Creator Revenue &amp; Withdrawals</strong></p>
<p style="margin-bottom: 16px;">Creators earn both wallet balance (real money) and GP when users consume their content:</p>
<ul style="margin-bottom: 16px;">
<li><strong>Wallet Balance Earnings</strong>: A portion of consumption charges goes to the creator''s wallet balance. This is real money that can be withdrawn to bank accounts or transferred to other users on the platform. Withdrawal requests are processed within 24 hours. You are responsible for any third-party payment gateway fees or tax liabilities.</li>
<li><strong>GP Earnings</strong>: Creators also earn GP based on engagement, quality, and platform activity. GP enhances credibility and unlocks additional features but cannot be withdrawn or converted to cash.</li>
<li><strong>Revenue Share</strong>: Earnings are subject to the platform''s revenue share policy, which may change with notice.</li>
</ul>

<p style="margin-bottom: 6px;"><strong>6. Intellectual Property &amp; Content Rights</strong></p>
<p style="margin-bottom: 16px;">You retain all rights to content you upload. By uploading to Gliimu, you grant the platform a non-exclusive, worldwide license to distribute, display, and make available your content to users. You represent and warrant that you own or have the necessary rights to all content you upload.</p>
<p style="margin-bottom: 16px;">For reported or infringing content, Gliimu reserves the right to remove content immediately and terminate accounts. Intellectual property disputes are governed by applicable law.</p>

<p style="margin-bottom: 6px;"><strong>7. Content Moderation, Deletion &amp; Recycle Bin</strong></p>
<ul style="margin-bottom: 16px;">
<li><strong>Platform Moderation</strong>: Gliimu may remove content that violates policies, receives valid reports, or is deemed harmful. Removed content is purged from the platform and storage.</li>
<li><strong>Creator Deletion</strong>: When you delete your own content, it is immediately hidden from public discovery and other users. Active consumption sessions are allowed to finish gracefully. Deleted content moves to a Recycle bin accessible to platform administrators.</li>
<li><strong>Recycle Bin Purpose</strong>: The Recycle bin exists for investigation purposes, particularly in cases where content may have been deleted to conceal misconduct. Content in the Recycle bin will not be restored without the author''s awareness and explicit approval. Administrators may finalize deletion (permanently purge from storage) after investigation.</li>
<li><strong>No Guarantees</strong>: Once content is finalized for deletion from the Recycle bin, it cannot be recovered. Creators should back up their work before deleting.</li>
</ul>

<p style="margin-bottom: 6px;"><strong>8. Account Security &amp; Recovery Phrase</strong></p>
<p style="margin-bottom: 16px;">Upon account creation, you are issued a unique 16-word recovery phrase. This phrase can be used to reset your password if you forget it. You are solely responsible for safeguarding this phrase and your password. If you lose both your password and your 16-word recovery phrase, your account, digital assets, and wallet funds may become permanently inaccessible. Gliimu does not guarantee recovery of your account or restoration of lost funds upon misplacement. Store your recovery phrase securely — it is your primary backup.</p>

<p style="margin-bottom: 6px;"><strong>9. Platform Safety &amp; Limitation of Liability</strong></p>
<p style="margin-bottom: 16px;">Gliimu takes reasonable measures to maintain a safe platform and protect users from misinformation, fraudulent activities, and harmful content. However, we cannot guarantee complete protection against all risks. Users are responsible for exercising due diligence in their interactions and transactions.</p>
<p style="margin-bottom: 16px;">Gliimu operates on third-party infrastructure (including Supabase, Render, Cloudflare, and Paystack). Gliimu is not liable for service interruptions, data loss, security breaches, or technical failures from external providers. The platform is provided "AS IS" without warranties. Under no circumstances shall Gliimu be liable for indirect, incidental, or consequential damages, including loss of profits, content, or revenue, resulting from your use of or inability to use the platform.</p>

<p style="margin-bottom: 6px;"><strong>10. Changes to Terms</strong></p>
<p style="margin-bottom: 16px;">Gliimu reserves the right to modify these terms at any time. Material changes will be communicated via platform notice. Continued use of the platform after changes constitutes acceptance of the new terms.</p>',
    updated_at = now()
WHERE type = 'terms';

-- SELF CHECK
SELECT 
  'terms updated' as check_name,
  CASE WHEN updated_at > now() - interval '1 minute' THEN 'PASS' ELSE 'FAIL' END as status,
  updated_at as last_updated
FROM public.legal_documents
WHERE type = 'terms';
