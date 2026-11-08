# Gliimu Platform

**Home of ideas that inspire.** Gliimu is a publishing library focused on books and audiolites, with periodic contests, cohorts, and talks. Think Wattpad meets TEDx — a platform for sharing knowledge and ideas that inspire.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Landing Page  │     │  Member Dashboard │     │   Admin Panel   │
│  (public/index) │     │  (dashboard/)     │     │    (admin/)     │
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │                       │                        │
         └───────────────────────┼────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │   Node.js Server        │
                    │   (server/src/index.js) │
                    │   - Paystack webhooks   │
                    │   - R2 presigned URLs   │
                    │   - Billing cron        │
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │   Supabase Backend      │
                    │   - PostgreSQL + RLS    │
                    │   - Auth (JWT)          │
                    │   - Storage             │
                    │   - Realtime            │
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │   Cloudflare R2         │
                    │   - Media storage       │
                    │   - Presigned uploads   │
                    │   - CDN delivery        │
                    └─────────────────────────┘
```

## Tech Stack

**Frontend**
- Vanilla JavaScript (ES modules, no framework)
- CSS3 with custom properties
- Supabase JS client (auth, database, realtime, storage)
- WebRTC for live sessions

**Backend**
- Node.js + Express
- Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions)
- Cloudflare R2 (object storage for media)
- Paystack (payment processing)

**Infrastructure**
- Render (server hosting)
- Cloudflare (CDN, DNS, R2)
- Supabase Cloud (database, auth, realtime)

## Directory Structure

```
gliimu/
├── admin/                    # Admin panel (separate deploy)
│   ├── assets/
│   │   └── js/
│   │       ├── views/       # Admin view modules
│   │       │   ├── submissions.js  # CRM content review
│   │       │   ├── crm.js         # Member management
│   │       │   ├── support.js     # Support desk
│   │       │   ├── operations.js  # Landing/settings
│   │       │   ├── finance.js     # Registrar overview
│   │       │   ├── ledger.js      # Transaction ledger
│   │       │   ├── revenue.js     # Revenue analytics
│   │       │   └── ...
│   │       ├── app.js       # Admin app shell
│   │       ├── router.js    # Admin routing
│   │       └── store.js     # Admin state
│   └── index.html
│
├── public/                   # Static assets (server root)
│   ├── dashboard/           # Member dashboard SPA
│   │   ├── assets/
│   │   │   ├── js/
│   │   │   │   ├── views/  # Member view modules
│   │   │   │   │   ├── feed.js       # Feed (gliims + publications)
│   │   │   │   │   ├── ping.js       # Messages + support
│   │   │   │   │   ├── live.js       # Live sessions
│   │   │   │   │   ├── wallet.js     # Billing + wallet
│   │   │   │   │   ├── updates.js    # XpLoRe (trending/contests/cohorts)
│   │   │   │   │   ├── support.js    # Support desk
│   │   │   │   │   ├── profile.js    # User profile/portfolio
│   │   │   │   │   ├── settings.js   # App settings
│   │   │   │   │   └── ...
│   │   │   │   ├── app.js       # Dashboard app shell
│   │   │   │   ├── router.js    # Client-side routing
│   │   │   │   ├── store.js     # Global state
│   │   │   │   ├── reader.js    # Content reader (books/audiolites)
│   │   │   │   ├── upload.js    # R2 presigned uploads
│   │   │   │   ├── media.js     # Media rendering
│   │   │   │   ├── notify.js    # Notifications
│   │   │   │   └── ...
│   │   │   └── css/
│   │   └── index.html
│   ├── shared/              # Shared assets
│   │   └── js/
│   │       └── config.js    # Supabase client init
│   ├── index.html           # Landing page
│   ├── auth.html            # Auth modal
│   └── ...
│
├── server/                   # Node.js backend
│   └── src/
│       └── index.js         # Express server
│                            # - Paystack webhook handler
│                            # - R2 presigned URL generation
│                            # - Billing verification
│                            # - Wallet operations
│
├── sql/                      # Database schema — the source of truth for Postgres
│   ├── setup_core.sql       # All tables, base RLS + grants (fresh install)
│   ├── state.sql            # Read-only: what is installed right now
│   ├── support.sql          # Support desk + the review RPCs
│   ├── gliits_billing.sql   # Gliits ledger + pricing
│   ├── content_trash.sql    # Two-stage deletion and the 30-day purge
│   ├── referrals.sql        # Referral codes, ledger, vesting
│   ├── community.sql        # Arena (contests)
│   ├── admin.sql            # Admin users + roles
│   ├── registrar.sql        # Finance RPCs
│   └── ...                  # See "SQL Scripts" below
│
└── src-tauri/               # Tauri desktop app (optional)
```

## Database Schema

**37 tables** in the `public` schema, 137 functions, 10 triggers, 98 RLS
policies across 34 tables. Figures are as of 2026-11-07; `sql/state.sql`
re-reads them whenever you need current numbers.

**Content** (the publishing library)
- `feed_gliims` — every gliim: text, image, media and document posts, drafts included, plus `deleted_at`/`deleted_by`/`deleted_reason` for the Trash
- `feed_gliim_contents` — block bodies, RLS-locked so only the author can read them before publish
- `feed_interactions` — likes, comments, shares, saves
- `post_views` — one row per reader per gliim, so views are unique, not raw hits
- `post_hashtags` — collection membership written by the hashtag trigger
- `saved_items`, `purchases`, `poll_votes`

**Ping + Support**
- `messages` — member DMs
- `hidden_chats` — a member's own "hide this chat" list
- `admin_chat` — the staff room
- `support_messages`, `support_reads` — the one support thread per member
- `reports` — content and user reports
- `notifications` — one-way alerts behind the Alerts page and the avatar badge

**Money**
- `gliits_config`, `gliits_plans`, `gliits_topups`, `gliits_usage` — the Gliits ledger
- `payment_attempts` — bank-transfer top-ups awaiting one-click verification
- `transactions` — the GP/wallet ledger
- `referrals` — codes, ledger and vesting
- `admin_adjustments`, `registrar_adjustments` — who changed what, and why

**Live sessions**
- `live_requests`, `live_chat_messages`, `live_kicked_users`, `live_reactions`

**People**
- `profiles` — mirrors Supabase Auth users; carries `is_admin`, `total_gp` and the verification badge
- `followed_users` — who follows whom, which feeds the Xploring ring
- `admin_users` — staff roles: `super`, `crm`, `registrar`, `operations`.
  The table's check constraint still accepts the retired `captain` value, so
  a stale row can pass the database while no screen in the admin app uses it.

**Community**
- `contests` — the leaderboard contests on the Updates page

**Landing + settings**
- `contact_info`, `faqs`, `legal_documents`, `partners`, `site_settings`

**Row-Level Security (RLS)**
All tables have RLS enabled. Policies enforce:
- Users can only read/edit their own data
- Staff reach content through role-checked RPCs, not broad table grants
- A gliim in the Trash is invisible to every member-facing policy
  (`deleted_at is null`) until it is restored or purged

## Setup Instructions

### Prerequisites

- Node.js 18+
- Supabase project (free tier works)
- Cloudflare account (for R2 storage)
- Paystack account (for payments)

### 1. Clone and Install

```bash
git clone https://github.com/Gliimu/Gliimu.git
cd gliimu
npm install
```

### 2. Supabase Setup

**Create the database schema:**

1. Go to your Supabase project → SQL Editor
2. Copy the contents of `sql/setup_core.sql`
3. Paste into the editor (UTF-8 encoding)
4. Click "Run"
5. Verify with the self-check grid at the bottom
6. Then run the **Feature** scripts listed in [SQL Scripts](#sql-scripts) — one per paste. `setup_core.sql` alone is not a working product; it only creates the tables.

**`setup_core.sql` creates:**
- 31 tables, each with RLS enabled and `anon`/`authenticated` grants set
- Seed data (FAQs, legal docs)

The RPC functions, triggers and policies live in the per-feature scripts, not here. The live database currently has 37 tables, 137 functions, 10 triggers and 98 policies — see [Database Schema](#database-schema).

**Make yourself an admin:**

```sql
-- After running setup_core.sql, insert your admin user
insert into public.admin_users (user_id, role)
values ('YOUR-USER-UUID', 'super');
```

Get your user UUID from Supabase Auth → Users.

### 3. Environment Variables

Create `.env` in the `server/` directory:

```env
# Supabase
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Paystack (payments)
PAYSTACK_SECRET_KEY=your-paystack-secret-key

# Cloudflare R2 (media storage)
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=gliimu-media

# Server
PORT=3000
```

### 4. Cloudflare R2 Setup

**Create the R2 bucket:**

1. Cloudflare Dashboard → R2 → Create bucket
2. Name: `gliimu-media` (or update `R2_BUCKET_NAME`)
3. Enable public access via custom domain (optional)

**Configure CORS:**

```bash
# Use the provided CORS config
cat r2-cors.json
```

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://gliimu.com", "https://admin.gliimu.com"],
      "AllowedMethods": ["GET", "PUT", "POST"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

**Create API token:**

1. R2 → Manage R2 API tokens → Create
2. Permissions: Object Read & Write
3. Copy Access Key ID + Secret Access Key to `.env`

### 5. Paystack Setup

1. Paystack Dashboard → Settings → API Keys
2. Copy Secret Key to `.env`
3. Webhook URL: `https://YOUR-SERVER.onrender.com/api/paystack/webhook`
4. Subscribe to `charge.success` event

### 6. Deploy Server

**Option A: Render (recommended)**

1. Push to GitHub
2. Render → New → Web Service
3. Connect your repo
4. Build command: `npm install`
5. Start command: `node server/src/index.js`
6. Add all env vars from `.env`
7. Deploy

**Option B: Local development**

```bash
cd server
npm install
node src/index.js
```

Server runs on `http://localhost:3000`.

### 7. Deploy Frontend

**Member Dashboard:**

The dashboard is served as static files from `public/`. Deploy to:
- Vercel (drag-and-drop `public/` folder)
- Netlify (same)
- GitHub Pages
- Any static host

Set the Supabase URL and anon key in `public/shared/js/config.js`.

**Admin Panel:**

The admin panel is a separate deploy from `admin/`. Deploy to:
- Vercel (drag-and-drop `admin/` folder)
- Netlify
- Subdomain: `admin.gliimu.com`

Update the API base URL in `admin/assets/js/app.js` to point to your Render server.

### 8. Custom Domains

**Main site:**
- `gliimu.com` → points to your frontend host
- `api.gliimu.com` → points to Render server

**Admin:**
- `admin.gliimu.com` → points to admin frontend host

**CDN:**
- `cdn.gliimu.com` → points to R2 bucket (custom domain)

## Key Features

### Member Dashboard

**Feed** (`#/feed`)
- Publishing library: books, logs, and bundles
- Publishing is instant — there is no approval queue; staff can take a gliim down
- @mention support with deep links
- Premium content gating (Pro tier or per-item purchase)

**Ping** (`#/ping`)
- Direct messages between users
- Support desk (member ↔ staff)
- Real-time notifications
- Unread badges

**Live** (`#/live`)
- 1-on-1 WebRTC video sessions
- Screen sharing
- 100 GP gate to start
- 25 GP reward for host
- Session limits (3 active, 3 views max)

**Wallet** (`#/wallet`)
- GP balance + wallet (naira)
- Subscription plans (Trial/Wallet/Pay-n-Go/Pro)
- Bank transfer top-ups (admin verified)
- Paystack card payments
- User-to-user transfers

**XpLoRe** (`#/updates`)
- Trending content: most-read book, audiolite, and most-viewed bundle
- Active contests and cohorts
- Top Gliimaits leaderboard
- Four pillars: Talks (TEDx-style), Publications (Wattpad-style), Contests (GoodNovel-style), Cohorts (Andela-style)

**Support** (`#/support`)
- Member ↔ staff support threads
- Gliim-PA (AI assistant) integration
- Handover to CRM

**Profile** (`#/profile`)
- Portfolio with QR code
- Projects tab (gliims)
- Print-friendly A4 layout

### Admin Panel

**CRM** (`/crm`)
- Member management
- Support desk inbox
- Content review (submissions)

**Submissions** (`/submissions`)
- Review book/audiolite submissions
- Approve/reject with notes
- Preview content

**Finance** (`/finance`, `/ledger`, `/revenue`)
- Transaction ledger
- Bank transfer verification
- Revenue analytics
- GP/wallet adjustments

**Operations** (`/operations`)
- Landing page settings (hero, partners, FAQs)
- App release config (version, download links)
- Contact info management

**Support** (`/support`)
- All-role support desk
- Staff room (admins chat)

**Admins** (`/admins`)
- Role management (super/crm/registrar/captain/ops)
- Grant/revoke admin access

## Billing System

**Tiers:**
- **Trial** — 7-day free trial, 100 GP signup bonus
- **Wallet** — pay-as-you-go with naira wallet
- **Pay-n-Go** — monthly billing cycle
- **Pro** — unlimited access (₦5,000/month)

**GP (Gliimu Points):**
- Soft currency (no cashout)
- 1 GP ≈ ₦50 notional
- Earn: signup (100), reading (50), referrals (20)
- Spend: live sessions (100), premium content (varies)

**Payment Methods:**
- Bank transfer (manual verification by registrar)
- Paystack (cards, instant)

**Billing Cycle:**
- Daily cron checks for due/overdue cycles
- Paystack webhook settles payments
- Auto-void after 3 days overdue

## Content Reader

**Primary formats (publishing library):**
- Books: EPUB, DOCX (rendered client-side)
- Audiolites: MP3/M4A (sequential playback)

**Bundle format:**
- Bundles: mixed (books + audiolites + PDFs)

**Features:**
- Reading progress tracking
- Completion GP reward (50 GP)
- Deterrence (right-click disabled, save blocked)
- Illustration lightbox
- Sequential audiolite chapters

## Referral System

**Flow:**
1. User shares referral code
2. New user signs up with `?ref=CODE`
3. Code captured and stored
4. Referral vests after 7 days
5. Both get 20 GP bonus on first purchase

**Platform-funded:**
- 20 GP flat bonus (not deducted from author)
- Triggered on first real-money purchase (₦100+)
- Lazy evaluation via `referral_summary()` RPC

## Realtime

**Supabase Realtime subscriptions:**
- `messages` — DM updates
- `support_messages` — support thread updates
- `feed_interactions` — live comments/likes
- `live_requests` — live session status

**Client-side:**
- `notify.js` handles desktop notifications
- `readState.js` tracks unread counts
- Badge updates in sidebar

## Security

**Row-Level Security (RLS):**
- All tables have RLS enabled
- Users can only access their own data
- Admin roles have elevated access via helper functions
- Premium content gated by billing status

**Admin Roles:**
- `super` — full access
- `crm` — member management + content review
- `registrar` — finance + billing
- `captain` — cohort management
- `operations` — landing/settings

**Authentication:**
- Supabase Auth (email/password)
- JWT tokens (short-lived)
- Service role key for server (bypasses RLS)

**Payment Security:**
- Paystack webhook signature verification
- Idempotent wallet credits (per reference)
- Password gate on user-to-user transfers

## Version Chain

The dashboard uses ES modules with `?v=` query params for cache busting:

```
index.html → app.js?v=33 → router.js?v=30 → feed.js?v=35 → reader.js?v=30
```

**When editing JS/CSS:**
1. Bump the `?v=` on the changed file
2. Bump the parent import (e.g., if you changed `feed.js`, bump its `?v=` in `router.js`)
3. Continue up the chain to `index.html`
4. Hard-refresh browser (Ctrl+Shift+R)

Current chain: **v=33** (index.html) → **v=33** (app.js) → **v=30** (router.js) → **v=35** (feed.js) → **v=30** (reader.js)

Admin chain: **v=11**

## SQL Scripts

Every schema change lives in `sql/`. The database is only ever modified by
pasting one of these into Dashboard → SQL Editor, so this folder — not the
dashboard's saved snippets — is the source of truth for Postgres.

Each file is self-contained and idempotent: a header that says what it
installs and why, the DDL, and a self-check grid at the bottom whose rows
should all read OK. Run the file, then run its self-check in the same paste.

| Kind | Files | Notes |
|------|-------|-------|
| Fresh install | `setup_core.sql` | every table, base RLS and grants |
| Feature | `account_lifecycle.sql`, `admin.sql`, `support.sql`, `unify_support.sql`, `registrar.sql`, `gliits_billing.sql`, `daily_gp.sql`, `referrals.sql`, `community.sql`, `collections_sponsors.sql`, `notifications.sql`, `content_trash.sql`, `instant_publish.sql`, `verification_badges.sql`, `xploring_unread.sql`, `follow_users.sql`, `landing_highlights.sql`, `contact.sql`, `profile_banner_social.sql`, `audiolite_timestamps.sql`, `media_block.sql`, `polls.sql` | the live features |
| Live (sessions) | `live_rooms.sql`, `live_v2.sql`, `live_v3.sql`, `live_on_air.sql`, `live_participants.sql`, `live_chat.sql`, `live_chat_attachments.sql`, `live_kicked_users.sql`, `live_reactions.sql`, `live_support_g10.sql` | stacked over time; the newest wins where they overlap |
| Fixes | `fix_bump_post_views.sql`, `fix_referral_summary.sql`, `fix_live_page.sql` | |
| Removals | `remove_featuring.sql`, `remove_live_gliims.sql`, `remove_live_billing.sql`, `remove_ping_calls.sql`, `remove_scroll_position.sql`, `cleanup_dead_tables.sql`, `cleanup_dead_billing.sql`, `drop_dead_library.sql` | destructive — run the archive query in the header first |
| Archive | `archive_*.sql` | retired definitions, kept for reference. Never run |
| Retired | `ping_calls.sql`, `live_gliim.sql`, `live_billing.sql`, `approval_flow.sql` | superseded by the removal scripts above |
| Diagnostic | `state.sql` | read-only: answers "what is installed right now" |

Run `state.sql` before any script that drops something.

**All scripts are idempotent** (safe to re-run) and include self-check grids.

## Troubleshooting

**"relation does not exist" error:**
- Run `sql/setup_core.sql`, then the feature script that owns the missing object
- Scripts are idempotent, safe to re-run

**403 on table access:**
- Check RLS policies
- Ensure user is authenticated
- Verify admin role if needed

**Paystack webhook not firing:**
- Check webhook URL is public (not localhost)
- Verify `PAYSTACK_SECRET_KEY` is set
- Check Render logs for errors

**R2 upload fails:**
- Verify CORS allows your domain
- Check R2 API token permissions
- Ensure bucket exists

**Realtime not updating:**
- Check Supabase Realtime is enabled
- Verify subscription channel name
- Check browser console for errors

## Deployment Checklist

- [ ] Supabase: run `setup_core.sql`, then the feature scripts
- [ ] Supabase: make yourself admin (`admin_users` insert)
- [ ] Cloudflare: create R2 bucket + API token
- [ ] Paystack: get secret key + set webhook URL
- [ ] Server: set all env vars on Render
- [ ] Server: deploy to Render
- [ ] Frontend: update `config.js` with Supabase URL + anon key
- [ ] Frontend: deploy `public/` to static host
- [ ] Admin: update API base URL
- [ ] Admin: deploy `admin/` to static host
- [ ] DNS: point domains to hosts
- [ ] Test: signup, login, create post, upload media, make payment

## License

ISC

## Support

For issues or questions, open a GitHub issue or contact the Gliimu team.
