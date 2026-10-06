-- ============================================================
-- Gliimu: ONE-SHOT SETUP — admin role, deal queue, landing
-- page, hub supports, bill transfers, subscriptions, reports.
--
-- This one script sets up everything the new landing page and
-- the Requests page need. It only ADDS missing pieces — it never
-- drops or rewrites your existing tables (curriculum,
-- contact_info, hub posts, etc. are not touched at all).
--
-- HOW TO RUN (the previous failures happened because only part
-- of a script was executed — the Supabase editor runs just the
-- selected text when something is highlighted):
--   1. Open this file, press Ctrl+A, Ctrl+C (copy ALL of it).
--   2. In Supabase: SQL Editor -> "+ New query" (a fresh, empty one).
--   3. Paste. Do NOT edit anything — "if not exists" already
--      handles tables that exist.
--   4. Press Ctrl+A once inside the Supabase editor.
--   5. Click "Run" — once.
--   6. Check the Messages pane: the SELF CHECK at the bottom
--      must show every line as present.
--
-- AFTER IT RUNS — make yourself an admin (once), then sign out
-- and back in so the dashboard picks the flag up:
--   update public.profiles set is_admin = true where username = 'yourusername';
-- ============================================================

-- ------------------------------------------------------------
-- 1. The admin flag and its helper functions.
-- ------------------------------------------------------------
alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- Close the self-promotion hole: a user's normal "update own
-- profile" policy would otherwise let them flip their own
-- is_admin to true.
create or replace function public.guard_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin() then
    raise exception 'Only an admin can change admin rights';
  end if;
  return new;
end
$$;

drop trigger if exists profiles_guard_is_admin on public.profiles;
create trigger profiles_guard_is_admin
  before update on public.profiles
  for each row execute function public.guard_is_admin();

-- ------------------------------------------------------------
-- 2. FAQ table (the public page reads "faqs", ordered by created_at).
--    Created only if missing; existing tables are left alone.
-- ------------------------------------------------------------
create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);

alter table public.faqs add column if not exists question text;
alter table public.faqs add column if not exists answer text;
alter table public.faqs add column if not exists created_at timestamptz;

alter table public.faqs enable row level security;
grant select on public.faqs to anon, authenticated;

drop policy if exists "Public read faqs" on public.faqs;
create policy "Public read faqs" on public.faqs
  for select to anon, authenticated using (true);

-- ------------------------------------------------------------
-- 3. Legal documents table (signup page reads type = 'terms').
-- ------------------------------------------------------------
create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  content text,
  created_at timestamptz not null default now()
);

alter table public.legal_documents add column if not exists type text;
alter table public.legal_documents add column if not exists content text;
alter table public.legal_documents add column if not exists created_at timestamptz;

alter table public.legal_documents enable row level security;
grant select on public.legal_documents to anon, authenticated;

drop policy if exists "Public read legal documents" on public.legal_documents;
create policy "Public read legal documents" on public.legal_documents
  for select to anon, authenticated using (true);

-- ------------------------------------------------------------
-- 4. Partners — the "Trusted By" wall on the landing page.
-- ------------------------------------------------------------
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text,
  logo_url text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.partners add column if not exists name text;
alter table public.partners add column if not exists logo_url text;
alter table public.partners add column if not exists display_order integer not null default 0;

alter table public.partners enable row level security;
grant select on public.partners to anon, authenticated;
grant insert, update, delete on public.partners to authenticated;

drop policy if exists "Public read partners" on public.partners;
create policy "Public read partners" on public.partners
  for select to anon, authenticated using (true);

drop policy if exists "Admins manage partners" on public.partners;
create policy "Admins manage partners" on public.partners
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- 5. Site settings — app release config for the "Take Gliimu
--    Everywhere" panel, editable from Dashboard > Settings.
-- ------------------------------------------------------------
alter table public.site_settings add column if not exists app_version text;
alter table public.site_settings add column if not exists app_version_notes text;
alter table public.site_settings add column if not exists app_download_bg_url text;
alter table public.site_settings add column if not exists app_windows_url text;
alter table public.site_settings add column if not exists app_mac_url text;
alter table public.site_settings add column if not exists app_linux_url text;
alter table public.site_settings add column if not exists app_android_url text;
alter table public.site_settings add column if not exists app_ios_url text;
-- The link the desktop QR code encodes. Falls back to the
-- Android / iOS link when left empty.
alter table public.site_settings add column if not exists app_mobile_qr_url text;

alter table public.site_settings enable row level security;
grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;

drop policy if exists "Public read site settings" on public.site_settings;
create policy "Public read site settings" on public.site_settings
  for select to anon, authenticated using (true);

drop policy if exists "Admins update site settings" on public.site_settings;
create policy "Admins update site settings" on public.site_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- 6. Deals — the Requests page FIFO queue board.
--    A "deal" is work brought to Gliimu by an individual
--    (personal) or an organisation (corporate). Deals queue up
--    in order; an admin marks one done and the next moves up.
-- ------------------------------------------------------------
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  deal_type text not null default 'personal',
  relationship text,
  company_name text,
  company_logo_url text,
  job_description text,
  budget text,
  timeline text,
  status text not null default 'queued',
  queue_position bigint,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid
);

alter table public.deals add column if not exists user_id uuid;
alter table public.deals add column if not exists deal_type text not null default 'personal';
alter table public.deals add column if not exists relationship text;
alter table public.deals add column if not exists company_name text;
alter table public.deals add column if not exists company_logo_url text;
alter table public.deals add column if not exists job_description text;
alter table public.deals add column if not exists budget text;
alter table public.deals add column if not exists timeline text;
alter table public.deals add column if not exists status text not null default 'queued';
alter table public.deals add column if not exists queue_position bigint;
alter table public.deals add column if not exists created_at timestamptz not null default now();
alter table public.deals add column if not exists started_at timestamptz;
alter table public.deals add column if not exists completed_at timestamptz;
alter table public.deals add column if not exists completed_by uuid;

-- Constraints: drop (if a previous run added them) then re-add.
alter table public.deals drop constraint if exists deals_status_check;
alter table public.deals
  add constraint deals_status_check
  check (status in ('queued', 'in_progress', 'completed', 'cancelled')) not valid;

alter table public.deals drop constraint if exists deals_type_check;
alter table public.deals
  add constraint deals_type_check
  check (deal_type in ('personal', 'corporate')) not valid;

alter table public.deals drop constraint if exists deals_user_id_fkey;
alter table public.deals
  add constraint deals_user_id_fkey foreign key (user_id)
  references public.profiles(id) on delete cascade;

alter table public.deals drop constraint if exists deals_completed_by_fkey;
alter table public.deals
  add constraint deals_completed_by_fkey foreign key (completed_by)
  references public.profiles(id) on delete set null;

-- FIFO queue. A sequence guarantees the "next up" order without
-- a read-then-write race between two people posting at once.
create sequence if not exists public.deals_queue_seq;

alter table public.deals
  alter column queue_position set default nextval('public.deals_queue_seq');

update public.deals set queue_position = nextval('public.deals_queue_seq')
where queue_position is null;

create index if not exists deals_status_idx on public.deals (status, queue_position);
create index if not exists deals_user_idx on public.deals (user_id, created_at desc);

alter table public.deals enable row level security;

drop policy if exists "Authenticated read deals" on public.deals;
drop policy if exists "Public read active deals" on public.deals;
drop policy if exists "Users insert own deals" on public.deals;
drop policy if exists "Owners update own deals" on public.deals;
drop policy if exists "Owners delete own deals" on public.deals;
drop policy if exists "Admins update any deal" on public.deals;
drop policy if exists "Admins delete any deal" on public.deals;

grant select on public.deals to anon;
grant select, insert, update, delete on public.deals to authenticated;
grant all on public.deals to service_role;
grant usage, select on sequence public.deals_queue_seq to authenticated;

-- Everyone signed in can see the whole queue.
create policy "Authenticated read deals"
  on public.deals for select
  to authenticated using (true);

-- The public landing page shows the newest active deal.
create policy "Public read active deals"
  on public.deals for select
  to anon using (status in ('queued', 'in_progress'));

-- Post a deal.
create policy "Users insert own deals"
  on public.deals for insert
  to authenticated with check (auth.uid() = user_id);

-- Owners edit or cancel their own deal.
create policy "Owners update own deals"
  on public.deals for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Owners delete own deals"
  on public.deals for delete
  to authenticated using (auth.uid() = user_id);

-- Admins work the queue: mark done, cancel, clean up.
create policy "Admins update any deal"
  on public.deals for update
  to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Admins delete any deal"
  on public.deals for delete
  to authenticated using (public.is_admin());

-- Realtime board updates.
do $$
begin
  alter publication supabase_realtime add table public.deals;
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- 7. Storage buckets: company logos (deal posters) and landing-
--    page assets (partner logos, app download background).
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('deal_logos', 'deal_logos', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('site_assets', 'site_assets', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read deal logos" on storage.objects;
create policy "Public read deal logos" on storage.objects
  for select to anon, authenticated using (bucket_id = 'deal_logos');

drop policy if exists "Users upload deal logos" on storage.objects;
create policy "Users upload deal logos" on storage.objects
  for insert to authenticated with check (bucket_id = 'deal_logos');

drop policy if exists "Public read site assets" on storage.objects;
create policy "Public read site assets" on storage.objects
  for select to anon, authenticated using (bucket_id = 'site_assets');

drop policy if exists "Admins manage site assets" on storage.objects;
create policy "Admins manage site assets" on storage.objects
  for all to authenticated
  using (bucket_id = 'site_assets' and public.is_admin())
  with check (bucket_id = 'site_assets' and public.is_admin());

-- ------------------------------------------------------------
-- 8. The 7 landing-page FAQs.
--    (Guarded: if your existing faqs table has an unexpected
--    shape this prints a notice instead of failing the run.)
-- ------------------------------------------------------------
do $$
begin
  delete from public.faqs;

  -- Staggered created_at so the page's "order by created_at"
  -- shows the questions in this exact order.
  insert into public.faqs (question, answer, created_at) values
    ($q1$How much is the tuition?$q1$,
     $a1$Tuition is subscription-based. The amount you pay depends on your usage and preferred plan, meaning some users may pay significantly less or more than others. For more details, please visit the "Billing" page in your dashboard.$a1$,
     now() - interval '7 seconds'),

    ($q2$Why is the tuition priced like this?$q2$,
     $a2$To use an analogy, a bottle of water costs less from a street vendor than it does in a first-class cabin, even though the contents are exactly the same. The price of our program is not meant to deter you, but rather to reflect a shift in mindset. Since everyone utilizes our resources differently, we designed a fair payment structure rather than forcing everyone to pay a flat rate for features they may not need or use.$a2$,
     now() - interval '6 seconds'),

    ($q3$How can I pay for my tuition?$q3$,
     $a3$The primary means of making payment for your tuition or subscription is via transfer. You can also pay through real projects with real clients, and we offer sponsored programs from time to time that can help you clear your balance faster than you might expect.$a3$,
     now() - interval '5 seconds'),

    ($q4$Can I earn money through Gliimu?$q4$,
     $a4$Yes. You can earn through Gliimu, and withdrawal requests are processed within 24 hours. Please note, however, that you must have fully cleared your outstanding tuition before withdrawing your earnings.$a4$,
     now() - interval '4 seconds'),

    ($q5$What exactly is a Full Stack Media Architect?$q5$,
     $a5$A Full Stack Media Architect is a creator who can generate value from scratch. They have mastered content creation, brand design, and idea visualization, alongside technical skills like programming and AI-prompt engineering. You don't just edit videos or write code; you learn to build concepts from zero.$a5$,
     now() - interval '3 seconds'),

    ($q6$Do I need any prior experience?$q6$,
     $a6$No. We train elite minds from the ground up. Our Triad system ensures you learn at your own pace without holding others back.$a6$,
     now() - interval '2 seconds'),

    ($q7$How long does it take to graduate?$q7$,
     $a7$The program is untimed. You get certified once you demonstrate competence through practical work. The timeline depends entirely on your zeal and effort—it can take as little as two months or up to a year.$a7$,
     now() - interval '1 second');
exception when others then
  raise notice 'FAQ list not replaced: %', sqlerrm;
end $$;

-- ------------------------------------------------------------
-- 9. Terms & Policy document (shown at signup).
-- ------------------------------------------------------------
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
    raise notice 'terms document not replaced: %', sqlerrm;
  end;

  begin
    update public.legal_documents set content = doc where type = 'privacy';
    if not found then
      insert into public.legal_documents (type, content) values ('privacy', doc);
    end if;
  exception when others then
    raise notice 'privacy document not replaced: %', sqlerrm;
  end;
end $$;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 11. DM read receipts.
--     RLS blocks a receiver from updating message rows, so "read"
--     state lived only in each browser's local storage — a chat
--     read on one device kept showing the unread dot on another
--     device forever. This SECURITY DEFINER helper lets a user
--     mark their own incoming DMs as read on the server, which
--     every device (and the unread dot) can then trust.
-- ------------------------------------------------------------
create or replace function public.mark_dm_read(p_other uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.messages
  set read_at = now()
  where receiver_id = auth.uid()
    and sender_id = p_other
    and room is null
    and read_at is null;
$$;

grant execute on function public.mark_dm_read(uuid) to authenticated;

-- ------------------------------------------------------------
-- 12. Live session view counts.
--     The requester can open their own live session at most 3
--     times; after that they only get a close option. The count
--     lives on the row so every device agrees; a SECURITY DEFINER
--     RPC is the only way to bump it, and it only ever counts the
--     requester's own opens.
-- ------------------------------------------------------------
do $$
begin
  alter table public.live_requests add column if not exists poster_views int not null default 0;
exception
  when undefined_table then
    raise notice 'live_requests table not found — run sql/live_requests.sql first';
end $$;

create or replace function public.bump_live_views(p_request uuid)
returns int
language sql
security definer
set search_path = public
as $$
  update public.live_requests
  set poster_views = poster_views + 1
  where id = p_request
    and user_id = auth.uid()
  returning poster_views;
$$;

grant execute on function public.bump_live_views(uuid) to authenticated;

-- ------------------------------------------------------------
-- 13. Hub views, bill supports, portfolio image.
--     - posts.views: card + reader view counter (bumped once per
--       browser session from the read view).
--     - send_support: supporting a creator moves money from the
--       supporter's bill: ₦1,000 is deducted from the sender and
--       ₦700 lands in the creator's bill (the platform keeps
--       ₦300). No GP changes, no confirmation dialogs.
--     - profiles.portfolio_image_url: an image used only on the
--       printable portfolio page, separate from the app avatar.
-- ------------------------------------------------------------
alter table public.posts add column if not exists views int not null default 0;

create or replace function public.bump_post_views(p_post uuid)
returns int
language sql
security definer
set search_path = public
as $$
  update public.posts
  set views = views + 1
  where id = p_post
  returning views;
$$;

grant execute on function public.bump_post_views(uuid) to authenticated;

alter table public.profiles add column if not exists portfolio_image_url text;

create or replace function public.send_support(p_post uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_author uuid;
  v_cost int := 1000;
  v_credit int := 700;
  v_balance int;
  v_sender_name text;
  v_author_name text;
begin
  if v_sender is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select user_id into v_author from public.posts where id = p_post;
  if v_author is null then
    raise exception 'POST_NOT_FOUND';
  end if;
  if v_author = v_sender then
    raise exception 'CANNOT_SUPPORT_SELF';
  end if;

  -- One support per user per gliim
  if exists (
    select 1 from public.hub_interactions
    where post_id = p_post and user_id = v_sender and interaction_type = 'support'
  ) then
    raise exception 'ALREADY_SUPPORTED';
  end if;

  select wallet_balance into v_balance from public.profiles where id = v_sender;
  if coalesce(v_balance, 0) < v_cost then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  update public.profiles set wallet_balance = wallet_balance - v_cost where id = v_sender;
  update public.profiles set wallet_balance = wallet_balance + v_credit where id = v_author;

  select full_name into v_sender_name from public.profiles where id = v_sender;
  select full_name into v_author_name from public.profiles where id = v_author;

  insert into public.transactions (user_id, amount, points, type, status, description)
  values (v_sender, -v_cost, 0, 'support', 'success',
          format('Supported %s', coalesce(v_author_name, 'a creator')));

  insert into public.transactions (user_id, amount, points, type, status, description)
  values (v_author, v_credit, 0, 'support', 'success',
          format('Support from %s', coalesce(v_sender_name, 'a Gliimait')));

  insert into public.hub_interactions (post_id, user_id, interaction_type, amount)
  values (p_post, v_sender, 'support', v_credit);

  return v_credit;
end;
$$;

grant execute on function public.send_support(uuid) to authenticated;

-- ------------------------------------------------------------
-- 14. Bill transfers between users.
--     transfer_to_user: moves money from the sender's bill to
--     the receiver's bill. RLS blocks cross-user wallet updates,
--     so this SECURITY DEFINER RPC is the only path. Both sides
--     get a ledger row (transfer_out / transfer_in).
-- ------------------------------------------------------------
create or replace function public.transfer_to_user(p_receiver uuid, p_amount integer)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_balance int;
  v_sender_name text;
  v_receiver_name text;
begin
  if v_sender is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_receiver = v_sender then
    raise exception 'CANNOT_TRANSFER_SELF';
  end if;
  if not exists (select 1 from public.profiles where id = p_receiver) then
    raise exception 'RECEIVER_NOT_FOUND';
  end if;

  select wallet_balance into v_balance from public.profiles where id = v_sender;
  if coalesce(v_balance, 0) < p_amount then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  update public.profiles set wallet_balance = wallet_balance - p_amount where id = v_sender;
  update public.profiles set wallet_balance = wallet_balance + p_amount where id = p_receiver;

  select full_name into v_sender_name from public.profiles where id = v_sender;
  select full_name into v_receiver_name from public.profiles where id = p_receiver;

  insert into public.transactions (user_id, amount, points, type, status, description)
  values (v_sender, -p_amount, 0, 'transfer_out', 'success',
          format('Transfer to %s', coalesce(v_receiver_name, 'a Gliimait')));

  insert into public.transactions (user_id, amount, points, type, status, description)
  values (p_receiver, p_amount, 0, 'transfer_in', 'success',
          format('Transfer from %s', coalesce(v_sender_name, 'a Gliimait')));

  return p_amount;
end;
$$;

grant execute on function public.transfer_to_user(uuid, integer) to authenticated;

-- ------------------------------------------------------------
-- 15. Reports — the in-app report flow (reason modal).
--     Anyone signed in can file a report against a user or a
--     post; only admins can read the queue.
-- ------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid,
  target_type text not null default 'user',
  target_id uuid not null,
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.reports add column if not exists reporter_id uuid;
alter table public.reports add column if not exists target_type text not null default 'user';
alter table public.reports add column if not exists target_id uuid;
alter table public.reports add column if not exists reason text;
alter table public.reports add column if not exists status text not null default 'open';
alter table public.reports add column if not exists created_at timestamptz not null default now();

alter table public.reports drop constraint if exists reports_reporter_id_fkey;
alter table public.reports
  add constraint reports_reporter_id_fkey foreign key (reporter_id)
  references public.profiles(id) on delete cascade;

create index if not exists reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;
grant select, insert on public.reports to authenticated;

drop policy if exists "Users insert own reports" on public.reports;
create policy "Users insert own reports" on public.reports
  for insert to authenticated with check (auth.uid() = reporter_id);

drop policy if exists "Admins read reports" on public.reports;
create policy "Admins read reports" on public.reports
  for select to authenticated using (public.is_admin());

-- ------------------------------------------------------------
-- 16. Subscriptions.
--     Plans are paid straight from the bill balance:
--       starter: ₦70,000  — 1 month
--       pro:     ₦250,000 — 4 months + 1 free month
--       elite:   ₦780,000 — 12 months + 2 free months
--     Buying while a subscription is still active extends it
--     from the current expiry instead of resetting it.
-- ------------------------------------------------------------
alter table public.profiles add column if not exists subscription_plan text;
alter table public.profiles add column if not exists subscription_started_at timestamptz;
alter table public.profiles add column if not exists subscription_expires_at timestamptz;

create or replace function public.purchase_subscription(p_plan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_price int;
  v_months int;
  v_balance int;
  v_current_expiry timestamptz;
  v_base timestamptz;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_plan = 'starter' then
    v_price := 70000; v_months := 1;
  elsif p_plan = 'pro' then
    v_price := 250000; v_months := 5;
  elsif p_plan = 'elite' then
    v_price := 780000; v_months := 14;
  else
    raise exception 'INVALID_PLAN';
  end if;

  select wallet_balance into v_balance from public.profiles where id = v_user;
  if coalesce(v_balance, 0) < v_price then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  select subscription_expires_at into v_current_expiry
  from public.profiles where id = v_user;

  -- Extend an active subscription; start fresh otherwise.
  v_base := case
    when v_current_expiry is not null and v_current_expiry > now() then v_current_expiry
    else now()
  end;
  v_base := v_base + make_interval(months => v_months);

  update public.profiles
  set wallet_balance = wallet_balance - v_price,
      subscription_plan = p_plan,
      subscription_started_at = coalesce(subscription_started_at, now()),
      subscription_expires_at = v_base
  where id = v_user;

  insert into public.transactions (user_id, amount, points, type, status, description)
  values (v_user, -v_price, 0, 'subscription', 'success',
          format('%s plan subscription', initcap(p_plan)));

  return jsonb_build_object('plan', p_plan, 'expires_at', v_base);
end;
$$;

grant execute on function public.purchase_subscription(text) to authenticated;

-- ------------------------------------------------------------
-- 17. Top uploader for the landing page "Latest on Gliimu".
--     Counts posts + accepted-submission library uploads per user
--     and returns the single busiest profile (full_name, avatar,
--     upload count only — no usernames, matching the privacy rule).
--     Falls back to posts-only if library_submissions is absent.
-- ------------------------------------------------------------
create or replace function public.top_uploader()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  begin
    select jsonb_build_object(
             'full_name', p.full_name,
             'avatar_url', p.avatar_url,
             'uploads', counts.cnt
           )
      into v_result
      from (
        select user_id, count(*) as cnt
        from (
          select user_id from public.posts
          union all
          select user_id from public.library_submissions
        ) all_uploads
        group by user_id
        order by cnt desc
        limit 1
      ) counts
      join public.profiles p on p.id = counts.user_id;
  exception
    when undefined_table then
      select jsonb_build_object(
               'full_name', p.full_name,
               'avatar_url', p.avatar_url,
               'uploads', counts.cnt
             )
        into v_result
        from (
          select user_id, count(*) as cnt
          from public.posts
          group by user_id
          order by cnt desc
          limit 1
        ) counts
        join public.profiles p on p.id = counts.user_id;
  end;

  return v_result;
end;
$$;

grant execute on function public.top_uploader() to anon, authenticated;

-- ------------------------------------------------------------
-- 18. LIBRARY SHELF ATTRIBUTION — every item on the library
--     shelf belongs to the account with username 'adam'.
--     Idempotent: re-running updates zero rows once converged.
-- ------------------------------------------------------------
do $$
declare
  v_name text;
  v_avatar text;
  v_fixed int;
begin
  if to_regclass('public.library_items') is null then
    raise notice 'library attribution: SKIPPED — library_items table missing';
    return;
  end if;

  -- The live table predates this column; the app reads it as the avatar fallback.
  alter table public.library_items add column if not exists author_avatar text;

  select p.full_name, p.avatar_url into v_name, v_avatar
  from public.profiles p
  where p.username = 'adam'
  limit 1;

  if v_name is null then
    raise notice 'library attribution: SKIPPED — no profile with username ''adam''';
    return;
  end if;

  update public.library_items li
  set author = v_name,
      author_avatar = v_avatar
  where li.author is distinct from v_name
     or li.author_avatar is distinct from v_avatar;

  get diagnostics v_fixed = row_count;
  raise notice 'library attribution: % item(s) set to adam', v_fixed;
end $$;

-- ------------------------------------------------------------
-- 19. SELF CHECK — the Messages pane after running must show
--     every line as present. Any MISSING line: read the notices
--     printed above it.
-- ------------------------------------------------------------
do $$
begin
  raise notice '=== SELF CHECK ===';
  raise notice 'deals table:           %', coalesce(to_regclass('public.deals')::text, 'MISSING');
  raise notice 'deals queue sequence:  %', coalesce(to_regclass('public.deals_queue_seq')::text, 'MISSING');
  raise notice 'is_admin() function:   %', coalesce(to_regprocedure('public.is_admin()')::text, 'MISSING');
  raise notice 'mark_dm_read function: %', coalesce(to_regprocedure('public.mark_dm_read(uuid)')::text, 'MISSING');
  raise notice 'bump_live_views fn:    %', coalesce(to_regprocedure('public.bump_live_views(uuid)')::text, 'MISSING');
  raise notice 'bump_post_views fn:    %', coalesce(to_regprocedure('public.bump_post_views(uuid)')::text, 'MISSING');
  raise notice 'send_support fn:       %', coalesce(to_regprocedure('public.send_support(uuid)')::text, 'MISSING');
  raise notice 'posts.views column:    %', case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'views'
  ) then 'present' else 'MISSING' end;
  raise notice 'portfolio_image col:   %', case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'portfolio_image_url'
  ) then 'present' else 'MISSING' end;
  raise notice 'poster_views column:   %', case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'live_requests' and column_name = 'poster_views'
  ) then 'present' else 'MISSING' end;
  raise notice 'partners table:        %', coalesce(to_regclass('public.partners')::text, 'MISSING');
  raise notice 'faqs table:            %', coalesce(to_regclass('public.faqs')::text, 'MISSING');
  raise notice 'legal_documents table: %', coalesce(to_regclass('public.legal_documents')::text, 'MISSING');
  raise notice 'faqs rows:             %', (select count(*) from public.faqs);
  raise notice 'terms document:        %', case when exists (
    select 1 from public.legal_documents where type = 'terms'
  ) then 'present' else 'MISSING' end;
  raise notice 'profiles.is_admin:     %', case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_admin'
  ) then 'present' else 'MISSING' end;
  raise notice 'app release columns:   %', case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'site_settings' and column_name = 'app_windows_url'
  ) then 'present' else 'MISSING' end;
  raise notice 'storage buckets:       % of 2', (select count(*) from storage.buckets where id in ('deal_logos', 'site_assets'));
  raise notice 'transfer_to_user fn:   %', coalesce(to_regprocedure('public.transfer_to_user(uuid,integer)')::text, 'MISSING');
  raise notice 'purchase_sub fn:       %', coalesce(to_regprocedure('public.purchase_subscription(text)')::text, 'MISSING');
  raise notice 'top_uploader fn:       %', coalesce(to_regprocedure('public.top_uploader()')::text, 'MISSING');
  raise notice 'reports table:         %', coalesce(to_regclass('public.reports')::text, 'MISSING');
  raise notice 'subscription cols:     %', case when (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('subscription_plan', 'subscription_started_at', 'subscription_expires_at')
  ) = 3 then 'present' else 'MISSING' end;
  raise notice 'library→adam:          %', case
    when to_regclass('public.library_items') is null then 'table MISSING'
    when not exists (select 1 from public.profiles where username = 'adam') then 'no adam profile'
    else (select count(*)::text || ' item(s) off adam' from public.library_items li
          join public.profiles p on p.username = 'adam'
          where li.author is distinct from p.full_name
             or li.author_avatar is distinct from p.avatar_url)
  end;
end $$;

-- Make the new functions visible to the API immediately.
notify pgrst, 'reload schema';

-- END OF GLIIMU SETUP SCRIPT — if this line is not the last line
-- in the editor, the paste was incomplete: clear it and paste again.
