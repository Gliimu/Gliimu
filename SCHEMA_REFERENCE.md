# Gliimu Platform — Schema Reference

> **Generated:** 2026-10-26  
> **Source files:** `setup_all.sql`, `gliits_billing.sql`, `library_content.sql`, `reader.sql`, `referrals.sql`, `community.sql`, `collections_sponsors.sql`, `admin.sql`, `follow_users.sql`, `polls.sql`, `support.sql`

---

## Table of Contents

1. [Naming Conventions](#naming-conventions)
2. [Pre-existing Tables (Column Additions)](#pre-existing-tables)
3. [Core Tables](#core-tables)
4. [Feed Tables](#feed-tables)
5. [Billing Tables (Legacy + Gliits)](#billing-tables)
6. [Support / Messaging Tables](#support--messaging-tables)
7. [Community / Arena Tables](#community--arena-tables)
8. [Collections & Sponsors Tables](#collections--sponsors-tables)
9. [Follow Users Table](#follow-users-table)
10. [Polls Table](#polls-table)
11. [Other Tables](#other-tables)
12. [Functions — Admin / Auth](#functions--admin--auth)
13. [Functions — Feed / Content](#functions--feed--content)
14. [Functions — Billing (Legacy)](#functions--billing-legacy)
15. [Functions — Gliits Billing](#functions--gliits-billing)
16. [Functions — Library / Reader](#functions--library--reader)
17. [Functions — Referrals](#functions--referrals)
18. [Functions — Community / Arena](#functions--community--arena)
19. [Functions — Support / Messaging](#functions--support--messaging)
20. [Functions — Polls](#functions--polls)
21. [Functions — Follow Users](#functions--follow-users)
22. [Functions — Collections & Sponsors](#functions--collections--sponsors)
23. [Table Dependency Graph](#table-dependency-graph)

---

## Naming Conventions

The feed naming convention maps legacy names to current names:

| Legacy Name | Current Name |
|---|---|
| `library_submissions` | `feed_submissions` |
| `library_items` | `feed_items` |
| `posts` | `feed_gliims` |
| `post_contents` | `feed_gliim_contents` |
| `library_contents` | `feed_contents` |
| `hub_interactions` | `feed_interactions` |

---

## Pre-existing Tables

These tables are created by Supabase; Gliimu adds columns to them.

### `public.profiles` (Supabase-managed)

**Purpose:** Core user profile table. Gliimu adds subscription, tier, wallet, and referral columns.

**Added columns:**
| Column | Type | Notes |
|---|---|---|
| `is_admin` | boolean | Legacy admin flag, default false |
| `portfolio_image_url` | text | |
| `subscription_plan` | text | |
| `subscription_started_at` | timestamptz | |
| `subscription_expires_at` | timestamptz | |
| `tier` | text | CHECK: `trial`, `wallet`, `payngo`, `pro`. Default `trial` |
| `trial_ends_at` | timestamptz | |
| `referral_code` | text | Unique 8-char auto-assigned code |

**RLS:** Protected by Supabase; `profiles_tier_valid` constraint enforces tier values.

---

### `public.messages` (Supabase-managed)

**Purpose:** Direct messaging between users. Gliimu adds admin and read-tracking columns.

**Added columns:**
| Column | Type | Notes |
|---|---|---|
| `is_admin` | boolean | Whether message is from admin, default false |
| `feedback` | text | CHECK: `like`, `dislike` (on AI replies) |
| `read_at` | timestamptz | |

---

### `public.site_settings` (Supabase-managed)

**Purpose:** Landing page and app configuration. Gliimu adds hero, app download, and version fields.

**Added columns:** `hero_video_url`, `hero_fallback_image_url`, `squad_bg_url`, `hero_title`, `hero_highlight`, `hero_desc`, `app_version`, `app_version_notes`, `app_download_bg_url`, `app_windows_url`, `app_mac_url`, `app_linux_url`, `app_android_url`, `app_ios_url`, `app_mobile_qr_url`

---

### `public.transactions` (Externally-created)

**Purpose:** Financial ledger for all wallet movements (topups, purchases, rewards, subscriptions).

**Added columns:** `points` (integer, default 0), `reference` (text)

---

## Core Tables

### `public.faqs`

**Purpose:** Frequently asked questions displayed on the landing page. CRM-managed.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `question` | text | NOT NULL |
| `answer` | text | NOT NULL |
| `sort_order` | integer | Default 0 |
| `created_at` | timestamptz | Default now() |

**RLS:** CRM manage policy via `admin_has_role(auth.uid(), 'crm')`.

---

### `public.legal_documents`

**Purpose:** Legal pages (Terms, Privacy, etc.) managed by CRM admins.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `slug` | text | NOT NULL, UNIQUE |
| `title` | text | NOT NULL |
| `body` | text | NOT NULL |
| `updated_at` | timestamptz | Default now() |

**RLS:** CRM manage policy.

---

### `public.partners`

**Purpose:** Partner/sponsor logos displayed on the landing page wall.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `name` | text | NOT NULL |
| `logo_url` | text | |
| `website_url` | text | |
| `sort_order` | integer | Default 0 |
| `created_at` | timestamptz | Default now() |

---

### `public.reports`

**Purpose:** User-generated content reports (posts, comments, users, library items). CRM resolves.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `reporter_id` | uuid | FK -> `auth.users(id)` ON DELETE CASCADE |
| `target_type` | text | CHECK: `post`, `comment`, `user`, `library_item` |
| `target_id` | uuid | NOT NULL |
| `reason` | text | NOT NULL |
| `status` | text | CHECK: `open`, `resolved`, `dismissed`. Default `open` |
| `created_at` | timestamptz | Default now() |
| `resolved_at` | timestamptz | |
| `resolved_by` | uuid | |

**RLS:** "CRM read reports" policy — `admin_has_role(auth.uid(), 'crm')`.

---

### `public.payment_attempts`

**Purpose:** Tracks payment gateway attempts (Paystack, etc.) for idempotency.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `user_id` | uuid | FK -> `auth.users(id)` ON DELETE CASCADE |
| `reference` | text | NOT NULL, UNIQUE |
| `gateway` | text | NOT NULL |
| `amount` | integer | NOT NULL |
| `status` | text | CHECK: `pending`, `success`, `failed`. Default `pending` |
| `metadata` | jsonb | |
| `created_at` | timestamptz | Default now() |

---

### `public.admin_users`

**Purpose:** Admin identity table for the separate admin app. Stores role assignments. Managed only through `admin_grant_role` / `admin_revoke_role`.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK | FK -> `profiles(id)` (admin.sql) or `auth.users(id)` (setup_all) ON DELETE CASCADE |
| `role` | text | CHECK: `super`, `crm`, `registrar`, `captain`, `operations` |
| `note` | text | (admin.sql version) |
| `added_by` | uuid | FK -> `profiles(id)` (admin.sql version) |
| `granted_at` | timestamptz | (setup_all version) |
| `granted_by` | uuid | (setup_all version) |
| `created_at` | timestamptz | (admin.sql version) |

**RLS:** Enabled. All access revoked from `anon`/`authenticated`. Only `service_role` has direct access. All reads through SECURITY DEFINER helpers.

---

### `public.admin_adjustments`

**Purpose:** Audit log for admin-made changes to user GP, wallet, or tier.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `user_id` | uuid | FK -> `auth.users(id)` ON DELETE CASCADE |
| `kind` | text | CHECK: `gp`, `wallet`, `tier` |
| `delta` | integer | |
| `new_tier` | text | |
| `note` | text | |
| `created_at` | timestamptz | Default now() |
| `created_by` | uuid | FK -> `auth.users(id)` NOT NULL |

---

### `public.contact_info`

**Purpose:** Per-user contact details (phone, email, social links). One row per user.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `user_id` | uuid | FK -> `auth.users(id)` ON DELETE CASCADE, UNIQUE |
| `full_name` | text | |
| `phone` | text | |
| `email` | text | |
| `whatsapp` | text | |
| `telegram` | text | |
| `discord` | text | |
| `preferred` | text | |
| `updated_at` | timestamptz | Default now() |

---

## Feed Tables

### `public.feed_submissions`

**Purpose:** User submissions for books and audiolites to the library. CRM admins approve/reject.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | FK -> `auth.users(id)` ON DELETE CASCADE |
| `type` | text | CHECK: `book`, `audiolite` |
| `title` | text | NOT NULL |
| `description` | text | |
| `price` | integer | |
| `cover_url` | text | |
| `file_url` | text | |
| `blocks` | jsonb | Publication body blocks |
| `bundle_items` | jsonb | Bundle parts `[{title, url}]` |
| `category` | text | |
| `status` | text | CHECK: `pending`, `approved`, `rejected`. Default `pending` |
| `reviewed_by` | uuid | |
| `reviewed_at` | timestamptz | |
| `review_note` | text | |
| `created_at` | timestamptz | Default now() |

**Indexes:** `user_id`, `status`, `category`

---

### `public.feed_items`

**Purpose:** Approved library items (books and audiolites) displayed on the shelf.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `type` | text | CHECK: `book`, `audiolite` |
| `title` | text | NOT NULL |
| `description` | text | |
| `price` | integer | |
| `cover_url` | text | |
| `cover_color` | text | |
| `sales` | integer | |
| `author` | text | Display name (not an access check) |
| `author_avatar` | text | |
| `owner_id` | uuid | FK -> `auth.users(id)` ON DELETE SET NULL |
| `category` | text | Subject tag (Media, Tech, Business, etc.) |
| `status` | text | Default `approved` |
| `created_at` | timestamptz | Default now() |

**Indexes:** `type`, `owner_id`, `category`

---

### `public.feed_gliims`

**Purpose:** User-created posts ("gliims") in the hub feed. Supports premium content, media, and drafts.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | FK -> `auth.users(id)` ON DELETE CASCADE |
| `title` | text | |
| `description` | text | |
| `cover_url` | text | |
| `media_url` | text | |
| `media_type` | text | |
| `tags` | text[] | |
| `is_premium` | boolean | Default false |
| `price` | integer | |
| `category` | text | |
| `cover_color` | text | |
| `status` | text | CHECK: `approved`, `pending`, `rejected`, `draft`. Default `approved` |
| `reviewed_by` | uuid | |
| `reviewed_at` | timestamptz | |
| `review_note` | text | |
| `views` | integer | Default 0 |
| `created_at` | timestamptz | Default now() |
| `updated_at` | timestamptz | Default now() |

**Indexes:** `user_id`, `status`, `created_at DESC`, `category`

---

### `public.feed_gliim_contents`

**Purpose:** Block-based content body for gliims (posts). One row per gliim, stores the rich editor blocks as JSONB.

| Column | Type | Notes |
|---|---|---|
| `post_id` | uuid PK | FK -> `feed_gliims(id)` ON DELETE CASCADE |
| `blocks` | jsonb | Default `'[]'` |

**RLS:** Enabled. Authenticated users get SELECT/INSERT/UPDATE/DELETE. Revoked from `anon`.

---

### `public.feed_contents`

**Purpose:** Block-based content body for library items (feed_items). Stores publication blocks and downloadable files.

| Column | Type | Notes |
|---|---|---|
| `item_id` | uuid PK | FK -> `feed_items(id)` ON DELETE CASCADE |
| `blocks` | jsonb | |
| `files` | jsonb | |

---

### `public.feed_interactions`

**Purpose:** User interactions on gliims: likes, comments, shares, saves, and support tips.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `user_id` | uuid | FK -> `auth.users(id)` ON DELETE CASCADE |
| `post_id` | uuid | FK -> `feed_gliims(id)` ON DELETE CASCADE |
| `interaction_type` | text | CHECK: `like`, `comment`, `share`, `save`, `support` |
| `comment_text` | text | |
| `amount` | integer | For support tips |
| `created_at` | timestamptz | Default now() |

**Indexes:** `post_id`, `user_id`, `interaction_type`

---

## Billing Tables

### Legacy Billing (from `setup_all.sql`, replaced by `gliits_billing.sql`)

#### `public.billing_prices` (LEGACY — dropped by gliits_billing.sql)

**Purpose:** Price list for billing events by product and cycle.

#### `public.billing_cycles` (LEGACY — replaced)

**Purpose:** Subscription billing cycles tracking accrual and payment status.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `user_id` | uuid | FK -> `auth.users(id)` ON DELETE CASCADE |
| `product` | text | |
| `cycle` | text | |
| `amount_ngn` | integer | |
| `starts_at` | timestamptz | |
| `ends_at` | timestamptz | |
| `status` | text | CHECK: `due`, `processing`, `settled`, `void`. Default `due` |
| `payment_ref` | text | |
| `created_at` | timestamptz | Default now() |

#### `public.billing_events` (LEGACY — replaced)

**Purpose:** Individual billing event log entries.

---

### Gliits Billing System (from `gliits_billing.sql`)

#### `public.gliits_config`

**Purpose:** Singleton configuration table for the Gliits virtual currency system. Exchange rates, plan prices, creator rates, and GP conversion ratios.

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | Always 1 |
| `exchange_rate_naira_to_gliits` | numeric(10,4) | Default 1.0000 |
| `per_minute_rate_gliits` | numeric(10,2) | Default 3.00 (G3/minute) |
| `plan_monthly_price_gliits` | integer | Default 3600 |
| `plan_yearly_price_gliits` | integer | Default 32400 |
| `signup_credit_gliits` | integer | Default 100 (G100) |
| `min_topup_gliits` | integer | Default 100 |
| `creator_rate_per_minute` | numeric(10,2) | Default 1.50 |
| `creator_cap_per_post_session` | integer | Default 30 |
| `idle_timeout_minutes` | integer | Default 3 |
| `gp_to_gliits_ratio` | integer | Default 10 |
| `gp_to_gliits_threshold` | integer | Default 100 |
| `updated_at` | timestamptz | Default now() |

**RLS:** All authenticated can SELECT. UPDATE restricted to `registrar` role via `admin_has_role`.

---

#### `public.gliits_plans`

**Purpose:** One row per user tracking their active subscription plan (payngo, monthly, yearly).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | FK -> `profiles(id)` ON DELETE CASCADE, UNIQUE |
| `plan_type` | text | CHECK: `payngo`, `monthly`, `yearly` |
| `started_at` | timestamptz | Default now() |
| `expires_at` | timestamptz | |
| `auto_renew` | boolean | Default true |
| `created_at` | timestamptz | Default now() |

**RLS:** Users SELECT/INSERT/UPDATE own rows. Admins (`registrar`/`ops`) can SELECT all.

**Indexes:** `user_id`, `expires_at`

---

#### `public.gliits_usage`

**Purpose:** Per-minute usage log. Records Gliits charged to reader and credited to creator for each minute of reading.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | FK -> `profiles(id)` ON DELETE CASCADE |
| `post_id` | uuid | FK -> `feed_gliims(id)` ON DELETE SET NULL |
| `minute_at` | timestamptz | Default now() |
| `gliits_charged` | numeric(10,2) | Default 3.00 |
| `creator_credited` | numeric(10,2) | Default 0.00 |
| `created_at` | timestamptz | Default now() |

**RLS:** Users SELECT own rows. INSERT for authenticated. Admins (`registrar`/`ops`) SELECT all.

**Indexes:** `user_id`, `post_id`, `minute_at`

---

#### `public.gliits_topups`

**Purpose:** Records wallet top-up transactions (naira -> Gliits conversion).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | FK -> `profiles(id)` ON DELETE CASCADE |
| `amount_gliits` | integer | NOT NULL |
| `amount_naira` | numeric(10,2) | |
| `payment_reference` | text | |
| `payment_status` | text | CHECK: `pending`, `success`, `failed`. Default `pending` |
| `created_at` | timestamptz | Default now() |

**RLS:** Same pattern as `gliits_usage` — own-row access for users, admin override for `registrar`/`ops`.

**Indexes:** `user_id`, `payment_reference`

---

### `public.library_contents` (from `library_content.sql`)

**Purpose:** Locked content body for paid library items. Publication blocks and downloadable files live here, separated from `feed_items` so RLS can gate access.

| Column | Type | Notes |
|---|---|---|
| `item_id` | uuid PK | FK -> `library_items(id)` ON DELETE CASCADE |
| `blocks` | jsonb | Publication body blocks. Default `'[]'` |
| `files` | jsonb | Downloadable parts `[{title, url}]`. Default `'[]'` |
| `created_at` | timestamptz | Default now() |

**RLS:** Enabled. SELECT gated by `library_item_unlocked(item_id)`. INSERT/UPDATE only by item owner. No DELETE policy (cascade or service_role).

---

## Support / Messaging Tables

### `public.support_messages`

**Purpose:** Support channel — one shared admin thread per member. Immutable messages (no UPDATE/DELETE policy). Includes kind field for escalation tracking.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `thread_user` | uuid | NOT NULL (the member this thread belongs to) |
| `sender_id` | uuid | NOT NULL (FK -> `auth.users(id)`) |
| `kind` | text | Default `message`. CHECK: `message`, `escalation` (support.sql adds `system`, `handover` in setup_all) |
| `content` | text | |
| `attachment_url` | text | |
| `attachment_type` | text | |
| `context` | jsonb | |
| `created_at` | timestamptz | Default now() |

**RLS:**
- Members read own thread: `thread_user = auth.uid()`
- Staff read all threads: `support_can_view(auth.uid())`
- Member posts in own thread: `sender_id = auth.uid() AND thread_user = auth.uid()`
- Staff post as themselves: `sender_id = auth.uid() AND support_can_view(auth.uid())`

**Realtime:** Published to `supabase_realtime`.

**Indexes:** `(thread_user, created_at)`, `sender_id`

---

### `public.support_reads`

**Purpose:** Per-viewer read cursor for support threads. Tracks last-read timestamp so unread counts can be derived.

| Column | Type | Notes |
|---|---|---|
| `thread_user` | uuid | PK part 1 |
| `reader_id` | uuid | PK part 2 |
| `last_read_at` | timestamptz | Default now() |

**RLS:** Users can only SELECT/INSERT/UPDATE their own cursor rows (`reader_id = auth.uid()`).

---

### `public.admin_chat`

**Purpose:** Admins-only chat room. Staff can send text and voice notes. No member access.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid/bigserial PK | |
| `sender_id` | uuid | FK -> `auth.users(id)` |
| `body`/`content` | text | |
| `attachment_url` | text | (support.sql version) |
| `attachment_type` | text | (support.sql version) |
| `created_at` | timestamptz | Default now() |

**RLS:** All policies gated by `support_can_view(auth.uid())`. Staff can SELECT, INSERT, and DELETE own rows.

**Realtime:** Published to `supabase_realtime`.

---

## Community / Arena Tables

### `public.contests`

**Purpose:** Operations-authored contests with metric-driven scoring (GP, reading, engagement, referrals).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `title` | text | NOT NULL |
| `description` | text | |
| `metric` | text | CHECK: `gp`, `reading`, `engagement`, `referrals`. Default `gp` |
| `starts_at` | timestamptz | |
| `ends_at` | timestamptz | |
| `prize_pool`/`prize_text` | integer/text | |
| `is_featured` | boolean | Default false |
| `is_archived` | boolean | Default false |
| `status` | text | (setup_all: CHECK `draft`, `active`, `ended`. Default `draft`) |
| `created_at` | timestamptz | Default now() |

**RLS:** Enabled. All access revoked from `anon`/`authenticated`. Only `service_role` has direct access. All reads/writes through SECURITY DEFINER RPCs.

---

### `public.contest_entries`

**Purpose:** Members opt into contests by joining. The leaderboard only ranks members who joined.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | (setup_all version) |
| `contest_id` | uuid | FK -> `contests(id)` ON DELETE CASCADE, PK part (community.sql) |
| `user_id` | uuid | FK -> `profiles(id)` / `auth.users(id)` ON DELETE CASCADE, PK part |
| `score` | numeric | Default 0 (setup_all version) |
| `joined_at` | timestamptz | Default now() |

**Unique:** `(contest_id, user_id)`

---

### `public.cohorts`

**Purpose:** Seat-capped community groups ("first 9"). Members request to join; operations approves.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `title` | text | NOT NULL |
| `description` | text | |
| `seats` | integer | Default 9-10 |
| `starts_at` | timestamptz | |
| `is_archived` | boolean | Default false |
| `created_at` | timestamptz | Default now() |

**RLS:** Same lockdown as contests — all through SECURITY DEFINER RPCs.

---

### `public.cohort_requests`

**Purpose:** Member requests for cohort seats. Operations approves/rejects.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial/uuid PK | |
| `cohort_id` | uuid | FK -> `cohorts(id)` ON DELETE CASCADE |
| `user_id` | uuid | FK -> `profiles(id)` / `auth.users(id)` ON DELETE CASCADE |
| `status` | text | CHECK: `pending`, `approved`, `rejected`. Default `pending` |
| `requested_at`/`created_at` | timestamptz | Default now() |
| `decided_at` | timestamptz | |

**Unique:** `(cohort_id, user_id)`

---

### `public.events`

**Purpose:** Community events displayed on the community page. Operations-authored.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `title` | text | NOT NULL |
| `description` | text | |
| `starts_at` | timestamptz | Default now() |
| `venue_type` | text | CHECK: `Online`, `Hall`, `Custom`. Default `Online` |
| `venue_text` | text | |
| `is_archived` | boolean | Default false |
| `created_at` | timestamptz | Default now() |

**RLS:** Full lockdown, operations-only through RPCs.

---

### `public.news`

**Purpose:** Operations-authored announcements displayed on the community page.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `title` | text | NOT NULL |
| `body` | text | |
| `is_published` | boolean | Default true |
| `created_at` | timestamptz | Default now() |

**RLS:** Full lockdown, operations-only through RPCs.

---

## Collections & Sponsors Tables

### `public.post_hashtags`

**Purpose:** Index table for fast hashtag/collection lookups. Auto-populated via trigger when `feed_gliims.description` changes. Max 3 hashtags per post.

| Column | Type | Notes |
|---|---|---|
| `post_id` | uuid | FK -> `feed_gliims(id)` ON DELETE CASCADE, PK part |
| `hashtag` | text | NOT NULL, PK part |
| `created_at` | timestamptz | Default now() |

**RLS:** Authenticated users can SELECT all.

**Indexes:** `hashtag`, `post_id`

---

### `public.sponsor_posts`

**Purpose:** Sponsor carousel ads with duration-based scheduling. Admin-managed (super/ops roles).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `sponsor_name` | text | NOT NULL |
| `title` | text | NOT NULL |
| `description` | text | |
| `image_url` | text | NOT NULL |
| `link_url` | text | |
| `position` | int | Default 0 |
| `active` | boolean | Default true |
| `starts_at` | timestamptz | |
| `ends_at` | timestamptz | |
| `created_at` | timestamptz | Default now() |
| `updated_at` | timestamptz | Default now() |

**RLS:**
- SELECT: authenticated users see active sponsors within date range
- INSERT/UPDATE/DELETE: only admins with `super` or `ops` role

---

## Follow Users Table

### `public.followed_users`

**Purpose:** User-to-user follow graph. Used for feed personalization in Xplore.

| Column | Type | Notes |
|---|---|---|
| `follower_id` | uuid | FK -> `profiles(id)` ON DELETE CASCADE, PK part |
| `followed_id` | uuid | FK -> `profiles(id)` ON DELETE CASCADE, PK part |
| `created_at` | timestamptz | Default now() |

**Constraints:** `no_self_follow` CHECK: `follower_id != followed_id`

**RLS:**
- SELECT: all authenticated users (for feed personalization)
- INSERT: users can only insert their own follows (`auth.uid() = follower_id`)
- DELETE: users can only delete their own follows

**Indexes:** `follower_id`, `followed_id`

---

## Polls Table

### `public.poll_votes`

**Purpose:** One vote per user per gliim (poll). Polls are blocks inside `feed_gliim_contents.blocks` with `type: "poll"`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `post_id` | uuid | FK -> `feed_gliims(id)` ON DELETE CASCADE |
| `user_id` | uuid | FK -> `auth.users(id)` ON DELETE CASCADE |
| `option_index` | integer | NOT NULL, CHECK >= 0 |
| `created_at` | timestamptz | Default now() |
| `updated_at` | timestamptz | Default now() |

**Unique:** `(post_id, user_id)` — one vote per user per poll.

**RLS:**
- SELECT: users see only their own votes
- INSERT: users insert only their own votes
- UPDATE: users update only their own votes (for changing their pick)

---

## Other Tables

### `public.live_requests`

**Purpose:** Live streaming requests. Tracks status and viewer count.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | FK -> `auth.users(id)` ON DELETE CASCADE |
| `title` | text | |
| `status` | text | CHECK: `waiting`, `live`, `ended`, `cancelled`. Default `waiting` |
| `viewer_count` | integer | Default 0 |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz | |
| `created_at` | timestamptz | Default now() |

---

### `public.reading_progress`

**Purpose:** Per-member per-item reading/listening progress. Tracks percent complete and completion timestamps.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | (setup_all version) |
| `user_id` | uuid | FK -> `profiles(id)` ON DELETE CASCADE, PK part (reader.sql) |
| `item_id` | uuid | FK -> `feed_items(id)` ON DELETE CASCADE (reader.sql), PK part |
| `progress`/`percent` | numeric/integer | Default 0 |
| `completed` | boolean | (setup_all version) Default false |
| `completed_at` | timestamptz | |
| `gp_awarded_at` | timestamptz | (reader.sql version) Guards against double GP |
| `started_at` | timestamptz | (setup_all version) |
| `updated_at` | timestamptz | (reader.sql version) |

**Unique:** `(user_id, item_id)`

**RLS:** Users can only SELECT/INSERT/UPDATE their own rows (`user_id = auth.uid()`).

---

### `public.referrals`

**Purpose:** Referral attribution ledger. One row per referred member. Tracks signup rewards (100 GP default).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `referrer_id` | uuid | FK -> `profiles(id)` ON DELETE CASCADE |
| `referee_id` | uuid | FK -> `profiles(id)` ON DELETE CASCADE, UNIQUE |
| `code` | text | NOT NULL |
| `status` | text | CHECK: `pending`, `vested`, `invalid`. Default `pending` |
| `signup_reward_gp` | integer | Default 100 |
| `created_at` | timestamptz | Default now() |
| `vested_at` | timestamptz | |

**RLS:** Enabled but NO policies. All access revoked from `anon`/`authenticated`. Everything goes through SECURITY DEFINER RPCs.

**Indexes:** `referee_id` (unique), `referrer_id + status`

---

### `public.post_views`

**Purpose:** Tracks unique user views per post for view counting.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | FK -> `profiles(id)` ON DELETE DELETE CASCADE, PK part |
| `post_id` | uuid | FK -> `feed_gliims(id)` ON DELETE CASCADE, PK part |
| `created_at` | timestamptz | Default now() |

**RLS:** Enabled. All access revoked from `anon`/`authenticated`.

---

## Table Dependency Graph

```
auth.users(id)
  |
  +-- profiles(id)  [Supabase-managed, extended by Gliimu]
  |     |
  |     +-- admin_users(user_id)                  -- admin identity
  |     +-- followed_users(follower_id, followed_id)  -- social graph
  |     +-- referrals(referrer_id, referee_id)     -- affiliate ledger
  |     +-- gliits_plans(user_id)                  -- subscription plans
  |     +-- gliits_usage(user_id)                  -- per-minute usage
  |     +-- gliits_topups(user_id)                 -- wallet topups
  |     +-- reading_progress(user_id, item_id)     -- reading tracking
  |     +-- contact_info(user_id)                  -- contact details
  |     +-- admin_adjustments(user_id, created_by) -- audit log
  |     +-- payment_attempts(user_id)              -- payment tracking
  |
  +-- feed_gliims(id)  [posts/gliims]
  |     |
  |     +-- feed_gliim_contents(post_id)           -- block content
  |     +-- feed_interactions(post_id, user_id)     -- likes/comments/etc
  |     +-- poll_votes(post_id, user_id)            -- poll voting
  |     +-- post_hashtags(post_id, hashtag)         -- hashtag index
  |     +-- post_views(user_id, post_id)            -- view tracking
  |     +-- gliits_usage(post_id)                   -- usage per post
  |
  +-- feed_items(id)  [library items]
  |     |
  |     +-- feed_contents(item_id)                  -- block content
  |     +-- library_contents(item_id)               -- locked paid content
  |     +-- reading_progress(item_id)               -- reading tracking
  |
  +-- feed_submissions(id)  [library submissions]
  |
  +-- contests(id)
  |     +-- contest_entries(contest_id, user_id)
  |
  +-- cohorts(id)
  |     +-- cohort_requests(cohort_id, user_id)
  |
  +-- support_messages(thread_user)  -- one thread per member
  |     +-- support_reads(thread_user, reader_id)
  |
  +-- admin_chat  -- staff-only room
  |
  +-- events(id)
  +-- news(id)
  +-- sponsor_posts(id)
  +-- live_requests(id, user_id)
  +-- reports(id, reporter_id)
  +-- faqs(id)
  +-- legal_documents(id)
  +-- partners(id)
  +-- billing_prices / billing_cycles / billing_events  [legacy]
  +-- gliits_config  [singleton]
  +-- transactions  [externally created, extended]
```

---

## Security Model Summary

| Pattern | Used By |
|---|---|
| **SECURITY DEFINER** | Most RPCs. Bypasses RLS to access revoked tables. Always keys writes on `auth.uid()`. |
| **SECURITY INVOKER** | Follow functions, support read cursors, `gliimpa_paused`, `gliimpa_escalate`. RLS is the authorization layer. |
| **Full lockdown (no policies, revoked grants)** | `admin_users`, `referrals`, community tables (`contests`, `contest_entries`, `cohorts`, `cohort_requests`, `events`, `news`), `post_views`. All access through SECURITY DEFINER RPCs only. |
| **Own-row RLS** | `reading_progress`, `gliits_plans`, `gliits_usage`, `gliits_topups`, `poll_votes`, `followed_users`, `support_reads` |
| **Admin role gating** | `admin_has_role(uuid, text)` used in policies and RPCs. `super` implies all roles. |
| **Advisory locks** | Used for idempotency: billing, referrals, reading completion, cohort requests, topups |
