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
                    │   - Daily.co rooms      │
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
- Vanilla JavaScript (ES modules, no framework, no bundler)
- CSS3 with custom properties
- Supabase JS client (auth, database, realtime)
- Daily.co embed for Live sessions

**Backend**
- Node.js + Express
- Supabase (PostgreSQL, Auth, Realtime)
- Cloudflare R2 (object storage for media)
- Paystack (payment processing)
- Daily.co (live video rooms, meeting tokens)

**Infrastructure**
- Cloudflare Workers with static assets — three projects: `gliimu` (`www.gliimu.com` + apex, from `public/`), `gliimu-dashboard` (`dashboard.gliimu.com`, from `public/`), `gliimu-admin` (`admin.gliimu.com`, from `admin/`)
- Render (Node server)
- Cloudflare (DNS, CDN, R2, Workers)
- Supabase Cloud (database, auth, realtime)

## URLs

| Host | Serves |
|------|--------|
| `www.gliimu.com` | Landing page + auth (`index.html`, `auth.html`) |
| `dashboard.gliimu.com/{xplore,search,live,publish,wallet,settings,terms,...}` | Member SPA with clean paths — a catch-all rewrite serves `dashboard/index.html` and the client router maps the path to a view |
| `admin.gliimu.com` | Admin panel (separate Cloudflare Worker, `gliimu-admin`) |
| `cdn.gliimu.com` | Cloudflare R2 media |
| `api` (Render) | Node server endpoints |

On the dashboard host the address bar shows `/xplore`, `/post?id=…`, `/profile?u=…` — no `#` fragments. On every other host the app falls back to classic hash URLs (`#/xplore`), so the same build works everywhere. Member-facing URLs never expose account UUIDs; profile and post slugs are a planned follow-up (see `TERMS-DRAFT.md` §9 for the public identity rules).

## Directory Structure

```
gliimu/
├── admin/                    # Admin panel (separate Cloudflare Worker deploy)
│   ├── assets/js/views/      # Admin view modules (crm, submissions, operations,
│   │                         #   finance, ledger, revenue, support, admins, ...)
│   ├── assets/js/            # app.js, router.js, store.js, ui.js helpers
│   └── index.html
│
├── public/                   # Landing + member dashboard (www + dashboard hosts)
│   ├── dashboard/
│   │   ├── assets/js/
│   │   │   ├── views/       # One module per page — the file name IS the page:
│   │   │   │   ├── xplore.js     # XpLoRe browse page (For You / Publications /
│   │   │   │   │                 #   Collections / Xploring tabs + cohort strip)
│   │   │   │   ├── gliims.js     # SHARED engine: gliim cards + composer, imported
│   │   │   │   │                 #   by xplore, profile, reader, publish, search, collection
│   │   │   │   ├── reader.js     # The /post reading page (engagement rail, comments)
│   │   │   │   ├── billing.js    # Billing page (wallet, plans, earnings) — route /wallet
│   │   │   │   ├── profile.js    # Profile + portfolio
│   │   │   │   ├── search.js     # Search page
│   │   │   │   ├── collection.js # Collection page (#/collection?name=…)
│   │   │   │   ├── publish.js    # Publish page (full-page composer)
│   │   │   │   ├── live.js       # Live page (session list, host modal, studio)
│   │   │   │   ├── ping.js       # Ping (DMs) + Support thread
│   │   │   │   ├── support.js    # Support thread view used inside Ping
│   │   │   │   ├── alerts.js     # Alerts page (notifications)
│   │   │   │   ├── settings.js   # Settings
│   │   │   │   └── terms.js      # Terms and Policy page
│   │   │   ├── app.js           # App shell: auth boot, badges, follow rail
│   │   │   ├── router.js        # Routes, clean-URL shim, back stack
│   │   │   ├── store.js         # Global state
│   │   │   ├── heartbeat.js     # Consumption billing ticks (G3/min while open)
│   │   │   ├── secure-reader.js # Secure full-screen reading overlay, lightbox,
│   │   │   │                    #   inline document renderer (renderFileInto)
│   │   │   ├── audiolite-minimizer.js  # Persistent player strip (keeps playing
│   │   │   │                    #   across pages, billing follows the open post)
│   │   │   ├── pull-to-refresh.js
│   │   │   ├── account-menu.js  # Avatar menu
│   │   │   ├── collections.js   # Hashtag collection helpers
│   │   │   ├── media.js         # Media rendering
│   │   │   ├── upload.js        # R2 presigned uploads
│   │   │   ├── notify.js        # Toasts, sounds, desktop notifications
│   │   │   ├── readState.js     # Unread tracking
│   │   │   └── gliim-pa-kb.js   # Assistant knowledge-base fallback
│   │   ├── assets/css/views/    # Mirrors the view names (xplore.css, gliims.css,
│   │   │                        #   reader.css, billing.css, ...)
│   │   └── index.html
│   ├── shared/js/config.js   # Supabase client init (URL + anon key)
│   ├── index.html            # Landing page
│   ├── auth.html             # Sign up / sign in
│   └── TERMS.md              # Terms of Service (mirrors legal_documents in the DB)
│
├── server/                   # Node.js backend (Render)
│   └── src/index.js          # Paystack webhook, R2 presigns, Daily.co rooms +
│                             #   meeting tokens, billing cron, content delete
│
├── sql/                      # Database schema — the source of truth for Postgres
│   ├── setup_core.sql        # All tables, base RLS + grants (fresh install)
│   ├── state.sql             # Read-only: what is installed right now
│   └── ...                   # See "SQL Scripts" below
│
├── wrangler.gliimu.jsonc           # Cloudflare Worker: www + apex (assets ./public)
├── wrangler.gliimu-dashboard.jsonc # Cloudflare Worker: dashboard (clean paths, html_handling none)
├── wrangler.gliimu-admin.jsonc     # Cloudflare Worker: admin (assets ./admin)
├── _redirects-dashboard            # dashboard clean-path rewrites (copied to public/_redirects at build)
└── public/_headers, admin/_headers # long-lived asset cache rules (HTML stays no-cache)
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

**Cohorts**
- `cohorts` — structured programs with the XpLoRe strip toggle (`strip_visible`, `strip_label`) and member acceptance

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
  `captain` went out with the triads screen; `sql/retire_captain_role.sql`
  removes the value from the check constraint and from the role-granting RPC.

**Landing + settings**
- `contact_info`, `faqs`, `legal_documents`, `site_settings`

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
- Daily.co account (for Live)

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

# Daily.co (live sessions)
DAILY_API_KEY=your-daily-api-key

# Server
PORT=3000
```

### 4. Cloudflare R2 Setup

**Create the R2 bucket:**

1. Cloudflare Dashboard → R2 → Create bucket
2. Name: `gliimu-media` (or update `R2_BUCKET_NAME`)
3. Enable public access via custom domain (optional)

**Configure CORS:**

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

The frontend is three **Cloudflare Workers with static assets** (no bundler;
each Worker serves a folder of static files). Deploy each with Wrangler:

**Member app — `gliimu` Worker (`www.gliimu.com` + apex):**

```bash
npx wrangler deploy --config wrangler.gliimu.jsonc
```

Serves `public/` (landing + auth + the app under `/dashboard/`). No `_redirects`
here — the landing page must win at `/`. `public/_headers` sets long-lived cache
for `/dashboard/assets/*`, `/shared/*` and `/icons/*` (HTML stays no-cache so
version-busted links always refresh).

**Member SPA — `gliimu-dashboard` Worker (`dashboard.gliimu.com`):**

```bash
# build step copies the clean-path rewrites into the assets folder
cp _redirects-dashboard public/_redirects
npx wrangler deploy --config wrangler.gliimu-dashboard.jsonc
```

`_redirects-dashboard` maps `/` → `/xplore` and each clean path (`/xplore`,
`/search`, `/publish`, …) to `dashboard/index.html` (200 proxy). The config sets
`html_handling: "none"` so the clean paths survive — the default auto-trailing-slash
would collapse them to `/dashboard/` and 404. When connecting via Git, put the
`cp` in the **Build command** and the `wrangler deploy` in the **Deploy command**.

**Admin panel — `gliimu-admin` Worker (`admin.gliimu.com`):**

```bash
npx wrangler deploy --config wrangler.gliimu-admin.jsonc
```

Serves `admin/` with clean, path-routed screens (`admin.gliimu.com/support`), so
`not_found_handling` is `"single-page-application"` and no `_redirects` file is
needed. `admin/_headers` caches `/assets/*`. Update the API base URL in
`admin/assets/js/config.js` (`API_BASE_URL`) to point to your Render server.

### 8. Custom Domains

Attach each host as a Custom Domain on its Worker (Cloudflare creates the
proxied DNS record automatically on a same-account zone):

- `www.gliimu.com` → `gliimu` Worker (landing + auth)
- `gliimu.com` (apex) → `gliimu` Worker, then a zone **Redirect Rule**
  (`http.host eq "gliimu.com"` → dynamic `concat("https://www.gliimu.com", http.request.uri.path)`,
  301, preserve query) makes `www` canonical
- `dashboard.gliimu.com` → `gliimu-dashboard` Worker (member SPA)
- `admin.gliimu.com` → `gliimu-admin` Worker
- `cdn.gliimu.com` → R2 bucket custom domain

## Key Features

### Member Dashboard

**XpLoRe** (`/xplore`) — the browse page
- One grid of gliims (books, audiolites, bundles, text/image posts) rendered by the shared card engine in `gliims.js`
- Filter tabs: For You, Publications, Collections, Xploring (followed creators only, with unread badges)
- Cohort strip under the tabs (admin-controlled text and visibility)
- Publishing is instant — there is no approval queue; staff can take a gliim down

**Reader** (`/post?id=…`)
- Secure reading page: selection/print deterrence, watermark, illustration lightbox
- Consumption billing: G3 per minute while the post is open (the `heartbeat` module)
- Comment and share earn GP (+5 each)
- Related posts grid matching XpLoRe card parity
- Minimised audio/video keeps playing across pages (`audiolite-minimizer.js`); billing follows the newly opened post

**Publish** (`/publish`)
- Full-page document composer: text, image, media, document and PDF blocks, drag-and-drop ordering
- Book / Audiolite / Bundle kinds, drafts, hashtags (max 3 → collections), instant publish

**Live** (`/live`)
- Session list + host modal; rooms are Daily.co, hosted on the server
- Studio: stage + participant rail, chat with attachments, hand raises, host mute/kick, support tap (G10, 70/30 split), share to chats
- No per-minute live billing

**Ping** (`/ping`)
- Member DMs with realtime updates, sounds and desktop notifications
- The Support thread (member ↔ staff) lives here with CRM handover; `support.js` renders the thread inside Ping

**Billing** (`/wallet` — file `billing.js`)
- Wallet balance (naira) + Gliits (G) side by side
- Three plans (Starter / Pro / Elite), Paystack card top-ups, bank-transfer top-ups verified in one click
- User-to-user transfers (password-gated), Earnings tab, referral rewards
- Withdrawals are processed manually by staff

**Alerts, Search, Profile, Settings, Terms**
- Alerts: notifications with click-through and mark-read
- Search: Enter-to-search, history, autocomplete of titles and names
- Profile: banner, portfolio grid, saved gliims, drafts filter, verification badge
- Settings: theme, sounds, banner/social links, feature-my-profile opt-in, Danger Zone

### Admin Panel (`admin.gliimu.com`)

**CRM** (`/crm`) — members, reports, content review
**Submissions** (`/submissions`) — every gliim, search + grid, Take down (trash)
**Operations** (`/operations`) — site content: landing hero/FAQs, contact info, app releases, Community/Arena, Cohorts (+ the XpLoRe strip card), Deleted queue
**Finance** (`/finance`, `/ledger`, `/revenue`) — Gliits ledger, revenue analytics, adjustments
**Support** (`/support`) — all-role support desk + staff room
**Admins** (`/admins`) — role management (super/crm/registrar/operations)

## Billing System

**Two currencies:**
- **Wallet balance (₦)** — real money. Top up via Paystack or bank transfer, spend on consumption, withdraw (manual processing) or transfer to other members.
- **Gliits (G)** — platform currency. G3 per minute while a post is open in the reader. Cannot be purchased with cash; comes from plans and activity.

**Plans:** Starter / Pro / Elite — monthly, include wallet credits and platform access.

**Everyday flows:**
- Opening content bills G3/min for the consumption session; closing stops the meter
- Supporting a creator: G100 in the reader, G10 in Live — 70% to the creator, 30% platform, repeatable
- Daily activity: +10 GP for showing up, −7 GP for a missed day
- Comments and shares earn +5 GP each

**Payment Methods:**
- Paystack (cards, instant)
- Bank transfer (one-click verification by staff against `payment_attempts`)

## Content Reader

**Kinds:** books (EPUB/DOCX/PDF rendered client-side), audiolites (audio, sequential chapters), bundles (mixed blocks)

**Features:**
- G3/min consumption billing scoped to the open post
- Selection/save/print deterrence + watermark
- Illustration lightbox, PDF tiles, poll blocks
- Persistent minimised player (desktop floating card, mobile thumbnail) with equalizer, 3x-height video and drag-to-move
- Comment strip + engagement rail; trash (30-day purge) instead of hard delete

## Referral System

**Flow:**
1. Member shares their referral link
2. New user signs up with `?ref=CODE`
3. Referral vests after 7 days
4. Bonus lands on the first real-money purchase

**Surfaces:** Refer & earn card + time-filtered leaderboard on Billing; referral metrics in the Arena/Updates filters.

## Realtime

**Supabase Realtime subscriptions:**
- `messages` — DM updates
- `support_messages` — support thread updates
- `feed_interactions` — live comments/likes
- `live_requests` — live session status

**Client-side:**
- `notify.js` handles toasts, sounds and desktop notifications
- `readState.js` tracks unread counts; badges sit on the avatar and Xploring ring

## Security

**Row-Level Security (RLS):**
- All tables have RLS enabled
- Users can only access their own data
- Admin roles have elevated access via helper functions
- Consumption-gated content served through RLS-locked body tables

**Admin Roles:**
- `super` — full access
- `crm` — member management + content review
- `registrar` — finance + billing
- `operations` — site content + cohorts + trash queue

**Authentication:**
- Supabase Auth (email/password) + 16-word recovery phrase
- JWT tokens (short-lived)
- Service role key for server (bypasses RLS)

**Payment Security:**
- Paystack webhook signature verification
- Idempotent wallet credits (per reference)
- Password gate on user-to-user transfers
- Member-facing URLs never expose account UUIDs

## Version Chain (cache busting)

There is no bundler: the browser caches each ES module by its URL, so every
module is imported with a `?v=N` query param that must be bumped when the file
changes.

```
index.html → app.js?v=N → router.js?v=N → views/xplore.js?v=N → gliims.js?v=N
```

**Rules when editing JS/CSS:**
1. Bump the `?v=` of the file you changed — **in every importer**, versions are per-file, not one chain
2. If a *shared* module gains or changes an export (usual suspects: `gliims.js`, `store.js`), every importer must move to the same fresh number at once, or a tab holding the old URL keeps throwing "does not provide an export named X"
3. Two modules must never load two copies of the same dependency: `pull-to-refresh.js` imports `router.js` with the **same** version app.js uses
4. `design-system.css` is shared by landing + auth + dashboard + 404 — bump all four references together
5. Every import carries a version — an unversioned import caches forever under the Cloudflare asset cache headers
6. Current numbers live in `index.html`, `router.js` and each importer — read them from code, never from this README (numbers go stale; this file intentionally does not track them)
7. After editing: syntax-check with `node --input-type=module --check < file.js`, then deploy the Cloudflare Worker (`npx wrangler deploy --config wrangler.<name>.jsonc`)

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
| Feature | `account_lifecycle.sql`, `admin.sql`, `admin_all_gliims.sql`, `support.sql`, `unify_support.sql`, `registrar.sql`, `gliits_billing.sql`, `daily_gp.sql`, `referrals.sql`, `community.sql`, `collections_sponsors.sql`, `notifications.sql`, `content_trash.sql`, `instant_publish.sql`, `verification_badges.sql`, `xploring_unread.sql`, `follow_users.sql`, `contact.sql`, `profile_banner_social.sql`, `audiolite_timestamps.sql`, `media_block.sql`, `polls.sql`, `cohorts.sql`, `cohorts_strip.sql` | the live features |
| Live (sessions) | `live_rooms.sql`, `live_v2.sql`, `live_v3.sql`, `live_on_air.sql`, `live_participants.sql`, `live_chat.sql`, `live_chat_attachments.sql`, `live_kicked_users.sql`, `live_reactions.sql`, `live_support_g10.sql` | stacked over time; the newest wins where they overlap |
| Fixes | `fix_bump_post_views.sql`, `fix_referral_summary.sql`, `fix_live_page.sql` | |
| Removals | `remove_featuring.sql`, `remove_live_gliims.sql`, `remove_live_billing.sql`, `remove_ping_calls.sql`, `remove_premium.sql`, `remove_scroll_position.sql`, `remove_landing_deadbones.sql`, `retire_captain_role.sql`, `cleanup_dead_tables.sql`, `cleanup_dead_billing.sql`, `drop_dead_library.sql` | destructive — run the archive query in the header first |
| Archive | `archive_*.sql` | retired definitions, kept for reference. Never run |
| Retired | `ping_calls.sql`, `live_gliim.sql`, `live_billing.sql`, `approval_flow.sql`, `landing_highlights.sql`, `landing_about.sql`, `app_qr_link.sql` | superseded by the removal scripts above |
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

**Stale UI after a deploy:**
- A `?v=` bump was missed — compare the numbers in the browser console's network tab against `index.html` / `router.js` / the importer (see [Version Chain](#version-chain-cache-busting))

## Deployment Checklist

- [ ] Supabase: run `setup_core.sql`, then the feature scripts
- [ ] Supabase: make yourself admin (`admin_users` insert)
- [ ] Cloudflare: create R2 bucket + API token
- [ ] Paystack: get secret key + set webhook URL
- [ ] Daily.co: API key on Render
- [ ] Server: set all env vars on Render
- [ ] Server: deploy to Render
- [ ] Frontend: update `config.js` with Supabase URL + anon key
- [ ] Frontend: deploy the `gliimu` + `gliimu-dashboard` Cloudflare Workers (wrangler configs handle routing + cache)
- [ ] Admin: update API base URL in `admin/assets/js/config.js`, deploy `admin/` as the `gliimu-admin` Cloudflare Worker
- [ ] DNS: point the domains in Cloudflare
- [ ] Test: signup, login, publish, read (billing ticks), live session, support

## License

ISC

## Support

For issues or questions, open a GitHub issue or contact the Gliimu team.
