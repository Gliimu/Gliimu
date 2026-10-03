Split the 1,632-line `messages.js` (Ping view) into a Chat view and a new Live view, each with its own sidebar tab.

## Sidebar & routing
- **`public/dashboard/index.html`** — **Main** section: Hub, Library, **Live** (new tab, video-camera icon, takes Ping's old slot), Profile. **Account** section: **Ping** (moved here, first item), Requests, Wallet, Settings. Add `<link>` for the new `live.css`.
- **`router.js`** — add `'/live'` route; re-point the live-session navigation guard from `window.pingInstance` to the new `window.liveInstance` (`isLiveActive`/`endLive`). Route `/ping` stays registered for chat (hub "Ask Me" deep-links and the unread badge on `data-route="ping"` depend on it).

## New shared module — `assets/js/media.js`
Both views need identical file-upload / voice-note / audio-playback code. Extract to one module (fixes today's fragile `activeLiveRoom` branching — each view will know its own context):
- `toggleAudio(msgId, url)` — voice-note bubble playback (module-scoped state)
- `attachmentHtml(m, instanceName)` — shared attachment bubble markup (image/video/audio/file), currently duplicated in both renderers
- `uploadAttachment(file)` / `uploadAudioNote(blob)` — chat_attachments storage uploads
- `createRecorder({ instanceName, inputAreaId, restore, send })` — the record → preview → send flow, parameterized per view. Uses its own mic stream (also fixes a latent bug: today `startRecording` clobbers the live host's `localStream`)

## New Live view — `assets/js/views/live.js` (~850 lines)
All live code moves here, adapted:
- Standalone page template (`#live-container`/`#live-main`): "Resume Session" card area + "Live Now" session list (from the global presence tracker) + empty state. Topbar gets the **Go Live** button (was on Ping's topbar).
- `init()` sets `window.liveInstance`; all `pingInstance.*` references in generated markup become `liveInstance.*`.
- Host studio, viewer join (entry fees, wallet RPC, transactions), WebRTC host/viewer plumbing, presence/support tipping, 1-hour timer, live-chat modal, invite modal — moved as-is.
- Invite flow adjustments: `openInviteModal` fetches its own contacts (it can no longer read the chat view's state); invite link text changes `#/ping` → `#/live`; new `checkPendingLiveJoin()` auto-joins a session stashed in `sessionStorage.live_join_host`.
- Live-chat modal's duplicated DOM ids renamed (`ping-file-input`→`live-file-input`, `ping-mic-btn`→`live-mic-btn`).
- `endLive` restores the Live page's list/empty state instead of Ping's.

## Slimmed Chat view — `messages.js` (1632 → ~640 lines)
- Template drops the Chats/Live tab switcher; contacts list + Gliim-PA only; topbar keeps just the user search.
- Chat-only code stays: contacts/hidden_chats logic, DM + Gliim-PA AI chat, edit/delete menus, realtime DM listener, `checkPendingPing`.
- The "Join Live Session" button inside invite DMs now stashes the host id and navigates to `#/live` (auto-join there).
- **Bug fix included**: `renderChatList` references `unreadMap` from out of scope (line 386 — throws whenever contacts exist); it will be stored on `this.unreadMap` by `fetchContacts`.

## CSS
- New `assets/css/views/live.css`: all `.live-*`/`#live-*` studio, viewer, live-chat, invite-modal, floating-support, and go-live-icon rules (including the mobile media-query blocks) moved out of `messages.css`, plus small `.live-layout` page styles. `messages.css` keeps chat + shared ctx-menu styles.

## Preserved behavior
Unread badge on Ping, hub → Ping deep-link, recovery/resume via `localStorage.active_live_session` (now surfaced on the Live page), and the router's "leave live session?" confirmation.

## Verification
1. `node --check --input-type=module` on every touched JS file.
2. Serve `public/` locally and drive the real UI with browser automation: sign up a throwaway account (note: this creates test rows in the live Supabase project), confirm the sidebar sections, both pages load without console errors, chat search appears on Ping, Go Live button appears on Live (shows the 1000-GP eligibility alert for a fresh account), and route switching works.
3. A real two-party WebRTC live session can't be tested solo — I'll flag that for a manual smoke test between two accounts.

No commits unless you ask.