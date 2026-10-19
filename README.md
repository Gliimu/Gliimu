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
│   │   │   │   ├── billing.js   # Billing client
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
├── sql/                      # Database schema + migrations
│   ├── setup_all.sql        # Master script (fresh install)
│   ├── rename_tables.sql    # feed_* table rename migration
│   ├── billing.sql          # Billing tables + RPCs
│   ├── referrals.sql        # Referral system
│   ├── support.sql          # Support desk schema
│   ├── reader.sql           # Reading progress + completion
│   ├── community.sql        # Arena (contests/cohorts)
│   ├── operations.sql       # Landing/settings RPCs
│   ├── admin.sql            # Admin users + roles
│   ├── registrar.sql        # Finance RPCs
│   └── ...                  # Other feature scripts
│
└── src-tauri/               # Tauri desktop app (optional)
```

## Database Schema

**Core Tables (43 total)**

**Feed System** (publishing library)
- `feed_submissions` — book/audiolite submissions (CRM review)
- `feed_items` — approved publications (books, audiolites)
- `feed_gliims` — user posts/bundles (auto-approved)
- `feed_gliim_contents` — gliim block content (RLS-locked)
- `feed_contents` — publication block content (RLS-locked)
- `feed_interactions` — likes, comments, shares, saves

**Billing System**
- `billing_prices` — subscription plans
- `billing_cycles` — user billing periods
- `billing_events` — payment/unlock events
- `payment_attempts` — bank transfer verification
- `transactions` — GP/wallet ledger

**Support System**
- `support_messages` — support threads
- `support_reads` — read tracking
- `admin_chat` — staff room

**Community** (periodic)
- `contests` — leaderboard contests
- `contest_entries` — contest participants
- `cohorts` — training cohorts (periodic)
- `cohort_requests` — join requests

**User System**
- `profiles` (Supabase Auth) — user profiles
- `admin_users` — admin roles (super/crm/registrar/captain/ops)
- `admin_adjustments` — GP/wallet/tier changes
- `referrals` — referral codes + vesting
- `reading_progress` — book/audiolite progress

**Content**
- `live_requests` — live session requests
- `reports` — content/user reports
- `faqs`, `legal_documents`, `partners` — landing content
- `site_settings` — admin-configurable settings

**Row-Level Security (RLS)**
All tables have RLS enabled. Policies enforce:
- Users can only read/edit their own data
- CRM can review submissions
- Admins have elevated access
- Premium content gated by billing status

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
2. Copy the contents of `sql/setup_all.sql`
3. Paste into the editor (UTF-8 encoding)
4. Click "Run"
5. Verify with the self-check grid at the bottom

**This creates:**
- 43 tables with RLS policies
- 80+ RPC functions
- 5 triggers
- Seed data (FAQs, legal docs, billing prices)

**Make yourself an admin:**

```sql
-- After running setup_all.sql, insert your admin user
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
- Publishing library: books, audiolites, and bundles
- CRM approval workflow for publications
- Auto-approved gliims (social posts)
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

## SQL Script Organization

**Master script:**
- `setup_all.sql` — complete schema for fresh installs (2,926 lines)

**Feature scripts (run after setup_all.sql):**
- `billing.sql` — billing tables + RPCs
- `referrals.sql` — referral system
- `support.sql` — support desk
- `reader.sql` — reading progress
- `community.sql` — arena (contests/cohorts)
- `operations.sql` — landing/settings RPCs
- `admin.sql` — admin users + roles
- `registrar.sql` — finance RPCs
- `landing_trending.sql` — trending content (extends landing_highlights RPC)
- `faq_display_order.sql` — drag-to-reorder FAQs

**Migration scripts:**
- `rename_tables.sql` — library_* → feed_* rename (already applied)

**One-shot scripts:**
- `hub_clear.sql` — empty hub data
- `cleanup.sql` — drop orphaned objects
- `gigs_drop.sql` — remove gigs feature

**All scripts are idempotent** (safe to re-run) and include self-check grids.

## Troubleshooting

**"relation does not exist" error:**
- Run `sql/setup_all.sql` (or the relevant feature script)
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

- [ ] Supabase: run `setup_all.sql`
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
