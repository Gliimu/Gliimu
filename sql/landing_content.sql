-- ============================================================
-- Gliimu: Landing page content + app release config
-- Run this in the Supabase SQL Editor. Safe to run more than once.
--
--   1. New site_settings columns for the "Take Gliimu Everywhere" panel.
--   2. Replaces the FAQ list with the current 7 questions.
--   3. Replaces the Terms document.
-- ============================================================

-- 1. App release config, editable from Dashboard > Settings.
alter table public.site_settings add column if not exists app_version text;
alter table public.site_settings add column if not exists app_version_notes text;
alter table public.site_settings add column if not exists app_download_bg_url text;
alter table public.site_settings add column if not exists app_windows_url text;
alter table public.site_settings add column if not exists app_mac_url text;
alter table public.site_settings add column if not exists app_linux_url text;
alter table public.site_settings add column if not exists app_android_url text;
alter table public.site_settings add column if not exists app_ios_url text;

-- The link the desktop QR code encodes. Point it at a page that detects the
-- phone's platform, or straight at the APK. Falls back to the Android / iOS
-- link when left empty.
alter table public.site_settings add column if not exists app_mobile_qr_url text;

-- 2. FAQ — this replaces the whole list.
do $$
begin
  delete from public.faqs;

  insert into public.faqs (question, answer) values    ($q1$How much is the tuition?$q1$,
     $a1$Tuition is subscription-based, ranging from 70k to 780k depending on your preferred plan. For more details, please visit the "Billing" section in your dashboard.$a1$),

    ($q2$Why is the tuition priced at this level?$q2$,
     $a2$To use an analogy, a bottle of water costs less from a street vendor than it does in a first-class cabin. The price of our program is not meant to deter you, but rather to reflect a shift in mindset. If you are truly committed, you have what it takes to invest in premium, transformative value.$a2$),

    ($q3$How can I pay for my tuition?$q3$,
     $a3$You can pay your tuition through real projects with real clients. Additionally, we offer sponsored programs from time to time that can help you clear your balance faster than you might expect.$a3$),

    ($q4$Can I earn money through Gliimu?$q4$,
     $a4$Yes. You can earn through Gliimu, and withdrawal requests are processed within 24 hours. Please note, however, that you must have fully cleared your outstanding tuition before withdrawing your earnings.$a4$),

    ($q5$What exactly is a Full Stack Media Architect?$q5$,
     $a5$A Full Stack Media Architect is a creator who has mastered content creation, brand design, and programming. You don't just edit videos or write code; you build entire media empires from scratch.$a5$),

    ($q6$Do I need any prior experience?$q6$,
     $a6$No. We train elite minds from the ground up. Our Triad system ensures you learn at your own pace without holding others back.$a6$),

    ($q7$How long does it take to graduate?$q7$,
     $a7$The program is untimed. You graduate once you demonstrate competence through practical work, which can take as little as two months or up to a year.$a7$);
exception when others then
  raise notice 'FAQ list not replaced (schema mismatch?): %', sqlerrm;
end $$;

-- 3. Terms & Policy.
do $$
declare
  doc text := $doc$
<p style="margin-bottom: 12px;"><strong>Last Updated:</strong> October 2024</p>
<p style="margin-bottom: 16px;">Welcome to Gliimu. By creating an account, you explicitly agree to the following binding terms:</p>

<p style="margin-bottom: 6px;"><strong>1. Eligibility &amp; The Elite Standard</strong></p>
<p style="margin-bottom: 16px;">You must be at least 16 years old to use Gliimu. By registering, you legally attest to this age requirement. Gliimu trains "Full Stack Media Architects"&mdash;individuals transitioning from traditional employment to self-sustaining independence. We provide elite skill acquisition and networking infrastructure. We explicitly do not guarantee employment, specific financial outcomes, or client acquisition. Your success is entirely dependent on your own effort, application of skills, and market conditions.</p>

<p style="margin-bottom: 6px;"><strong>2. Code of Conduct &amp; Termination</strong></p>
<p style="margin-bottom: 16px;">You agree to maintain professional, respectful, and ethical conduct at all times. Gliimu reserves the unilateral right to suspend or permanently terminate your account, access to Triads, and platform features immediately, without prior notice or refund, if you engage in: plagiarism, intellectual property theft, harassment, hate speech, scamming, or any behavior that fundamentally contradicts the elite, self-sustaining culture of the platform. Gliimu reserves the right to define disruptive behavior at its sole discretion.</p>

<p style="margin-bottom: 6px;"><strong>3. Tuition, Fees &amp; Refund Policy</strong></p>
<p style="margin-bottom: 16px;">Tuition is priced at a premium tier ranging from &#8358;70,000 to &#8358;780,000 based on your selected subscription plan to reflect the absolute value of the program. All payments are final and strictly non-refundable once access to the curriculum and platform features is granted. Gliimu retains the sole and absolute discretion to issue a refund in exceptional, documented cases of verifiable platform failure, but is under no legal obligation to do so.</p>

<p style="margin-bottom: 6px;"><strong>4. Earnings, Revenue Share, &amp; Withdrawals</strong></p>
<p style="margin-bottom: 16px;">You may generate revenue by completing real client gigs and receiving digital appreciation (donations/tips) during live sessions. Gliimu automatically deducts a 10% platform fee from all gross earnings before they are credited to your internal wallet. Earnings generated prior to graduation are held in your internal Gliimu wallet. You are strictly prohibited from withdrawing these internal funds to external bank accounts until your entire tuition balance is paid in full. Once tuition is cleared, standard withdrawal requests are processed within 24 hours. You are responsible for any third-party payment gateway fees or tax liabilities applicable to your earnings.</p>

<p style="margin-bottom: 6px;"><strong>5. Intellectual Property &amp; Ownership</strong></p>
<p style="margin-bottom: 16px;">You retain all rights to your personal name, likeness, and pre-existing portfolio. For internal apprenticeship curriculum projects created solely for skill demonstration, Gliimu retains a perpetual, royalty-free license to use, reproduce, and display said content for educational and promotional purposes. However, for "real client gigs" facilitated or completed through the platform, the intellectual property rights are strictly governed by the agreement between you and the paying client, provided Gliimu's 10% platform fee is honored. Gliimu will never use your personal identity for external marketing without your explicit, written consent.</p>

<p style="margin-bottom: 6px;"><strong>6. Account Security &amp; Authentication</strong></p>
<p style="margin-bottom: 16px;">Gliimu utilizes a privacy-first, cryptographic authentication system. We do not collect or store email addresses or traditional Personally Identifiable Information (PII) for password recovery. Upon account creation, you are issued a unique 16-word recovery phrase. You are solely and exclusively responsible for safeguarding this phrase and your password. If you lose both your password and your 16-word recovery phrase, your account, digital assets, and internal wallet funds become permanently inaccessible. Gliimu has no administrative override, backend access, or capability to recover your account, reset your password, or restore lost funds under any circumstances.</p>

<p style="margin-bottom: 6px;"><strong>7. Limitation of Liability &amp; Third-Party Services</strong></p>
<p style="margin-bottom: 16px;">The Gliimu platform operates on third-party infrastructure (including but not limited to Supabase, Render, Cloudflare, and Paystack). Gliimu is not liable for any service interruptions, data loss, security breaches, or technical failures originating from these external providers. Furthermore, Gliimu is provided on an "AS IS" basis without warranties of any kind. Under no circumstances shall Gliimu, its directors, or affiliates be liable for indirect, incidental, or consequential damages, including loss of profits or client revenue, resulting from your use of or inability to use the platform.</p>
$doc$;
begin
  begin
    update public.legal_documents set content = doc where type = 'terms';
    if not found then
      insert into public.legal_documents (type, content) values ('terms', doc);
    end if;
  exception when others then
    raise notice 'terms document not replaced (schema mismatch?): %', sqlerrm;
  end;

  begin
    update public.legal_documents set content = doc where type = 'privacy';
    if not found then
      insert into public.legal_documents (type, content) values ('privacy', doc);
    end if;
  exception when others then
    raise notice 'privacy document not replaced (schema mismatch?): %', sqlerrm;
  end;
end $$;

notify pgrst, 'reload schema';
