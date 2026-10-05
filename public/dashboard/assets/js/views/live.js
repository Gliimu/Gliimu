import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // The openrelay entries are a free best-effort relay that has been
  // unreliable; if cross-network calls keep failing, swap in fresh TURN
  // credentials here (e.g. from metered.ca).
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

const SESSION_GP = 10;
const MIN_GP_FOR_LIVE = 100;
const MAX_SESSIONS = 3;
const MAX_SESSION_VIEWS = 3;

const ICONS = {
  search: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  plus: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
  mic: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>',
  cam: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>',
  flip: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>',
  screen: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
  aspect: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>',
  end: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>'
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const timeAgo = (iso) => {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 'just now';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const isMissingTable = (err) => !!(err && (err.code === '42P01' || err.code === 'PGRST205'));

const liveView = {
  requests: [],
  searchQuery: '',
  boardUnavailable: false,

  activeSession: null,
  sessionRole: null,
  sessionModalOpen: false,
  sessionConnected: false,
  sessionSettled: false,

  localStream: null,
  displayStream: null,
  preShareTrack: null,
  isScreenSharing: false,
  sessionPc: null,
  iceQueue: [],
  creatingOffer: false,
  answeringOffer: false,
  offerReceived: false,
  answerReceived: false,
  iceRestarted: false,
  readyWatchdog: null,
  offerWatchdog: null,

  rtcChannel: null,
  boardChannel: null,
  statusById: {},
  sessionTimerInterval: null,
  refreshTimer: null,

  template: `
    <div class="view-container live-layout" id="live-container">
      <div id="live-board-content"></div>
    </div>
    <div class="modal-overlay" id="live-request-modal" style="display: none;">
      <div class="modal-content">
        <button class="modal-close" onclick="liveInstance.closeRequestModal()">×</button>
        <h2 style="margin-bottom: 8px;">Post a Live Request</h2>
        <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">Describe what you need explained. Someone who knows it will accept and teach you live.</p>
        <div class="form-group">
          <label>Topic / Request</label>
          <input type="text" id="live-req-title" class="input" maxlength="60" placeholder="e.g. Explain UIUX fundamentals to me">
        </div>
        <div class="form-group">
          <label>Details (optional)</label>
          <textarea id="live-req-desc" class="input" rows="3" maxlength="200" placeholder="What exactly do you want help with?"></textarea>
        </div>
        <button class="btn-primary" style="width: 100%;" id="live-req-submit-btn" onclick="liveInstance.submitRequest()">Post Request</button>
      </div>
    </div>
  `,

  async init() {
    window.liveInstance = {
      endLive: () => this.endLive(),
      isLiveActive: () => this.sessionModalOpen,
      openRequestModal: () => this.openRequestModal(),
      closeRequestModal: () => this.closeRequestModal(),
      submitRequest: () => this.submitRequest(),
      claimRequest: (id) => this.claimRequest(id),
      deleteRequest: (id) => this.deleteRequest(id),
      openSession: (id) => this.openSession(id),
      closeSession: (id) => this.closeSession(id),
      releaseFromBoard: (id) => this.releaseFromBoard(id),
      endSession: () => this.endSession(),
      toggleMute: (type) => this.toggleMute(type),
      flipCamera: () => this.flipCamera(),
      toggleScreenShare: () => this.toggleScreenShare()
    };

    this.requests = [];
    this.searchQuery = '';
    this.boardUnavailable = false;
    this.statusById = {};

    if (this.onPresenceChanged) window.removeEventListener('presence-changed', this.onPresenceChanged);
    this.onPresenceChanged = () => this.renderBoard();
    window.addEventListener('presence-changed', this.onPresenceChanged);

    this.setupTopbar();
    this.setupBoardRealtime();
    await this.loadBoard();
  },

  /* ============================================
     TOPBAR
     ============================================ */
  setupTopbar() {
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    const topbarRight = document.getElementById('topbar-right-actions');

    if (topbarDynamic) {
      topbarDynamic.innerHTML = `
        <div class="live-topbar-search">
          ${ICONS.search}
          <input type="text" id="live-search" placeholder="Search topics (e.g. b-rolls)..." autocomplete="off">
        </div>
      `;
      const input = document.getElementById('live-search');
      input.value = this.searchQuery;
      input.addEventListener('input', () => {
        this.searchQuery = input.value;
        this.renderBoard();
      });
    }

    if (topbarRight) {
      topbarRight.innerHTML = `
        <button class="live-post-btn" id="live-post-btn" title="New live session">
          ${ICONS.plus}<span class="live-post-label">Live session</span>
        </button>
      `;
      document.getElementById('live-post-btn')?.addEventListener('click', () => this.openRequestModal());
    }
  },

  /* ============================================
     REQUEST BOARD
     ============================================ */
  async loadBoard() {
    const { data, error } = await supabase
      .from('live_requests')
      .select('*, profiles:profiles!user_id(full_name, avatar_url)')
      .in('status', ['open', 'active'])
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingTable(error)) {
        this.boardUnavailable = true;
        this.requests = [];
        this.statusById = {};
        this.renderBoard();
        return;
      }
      console.error('Failed to load live requests', error);
      return;
    }

    this.boardUnavailable = false;
    this.requests = data || [];
    this.requests.forEach(r => { this.statusById[r.id] = r.status; });
    this.renderBoard();
  },

  renderBoard() {
    const boardEl = document.getElementById('live-board-content');
    if (!boardEl) return;

    if (this.boardUnavailable) {
      boardEl.innerHTML = '<div class="card"><p class="live-board-empty">Live Learning is not available yet. Please check back soon.</p></div>';
      return;
    }

    const q = this.searchQuery.trim().toLowerCase();
    const matches = (r) => !q || (r.title || '').toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q);

    const presence = window.GliimuPresence;
    const isOnline = (id) => !presence || presence.isOnline(id);

    const busyUserIds = new Set(
      this.requests.filter(r => r.status === 'active').flatMap(r => [r.user_id, r.partner_id].filter(Boolean))
    );

    const rank = (r) => (r.status === 'active' ? 0 : 1);
    const mine = this.requests
      .filter(r => (r.user_id === store.user.id || r.partner_id === store.user.id) && (r.status === 'open' || r.status === 'active') && matches(r))
      .sort((a, b) => rank(a) - rank(b) || new Date(b.created_at) - new Date(a.created_at));
    // Other people's sessions only show while they are online
    const open = this.requests.filter(r => r.user_id !== store.user.id && r.status === 'open' && matches(r) && isOnline(r.user_id));

    let html = '';
    if (mine.length) {
      html += `
        <div class="live-board-section">
          <h3 class="live-board-title">My Sessions</h3>
          ${mine.map(r => this.renderRequestCard(r, r.status === 'active' ? 'mine-active' : 'mine')).join('')}
        </div>
      `;
    }

    if (open.length) {
      html += `<div class="live-board-section"><h3 class="live-board-title">Open Requests</h3>${open.map(r => this.renderRequestCard(r, 'teach', busyUserIds.has(r.user_id))).join('')}</div>`;
    }

    if (!html && q) {
      html = `<p class="live-board-empty">No requests match "${esc(this.searchQuery.trim())}".</p>`;
    }

    boardEl.innerHTML = html;
  },

  renderRequestCard(r, mode, locked = false) {
    const name = r.profiles?.full_name || 'A Gliimait';
    const avatar = r.profiles?.avatar_url
      ? `<img src="${esc(r.profiles.avatar_url)}" class="live-req-avatar" alt="">`
      : `<div class="live-req-avatar">${esc(name.charAt(0).toUpperCase())}</div>`;
    const desc = r.description ? `<p class="live-req-desc">${esc(r.description)}</p>` : '';

    let action = '';
    let metaExtra = '';
    let cardClass = 'live-request-card';

    if (mode === 'mine') {
      action = `<button class="btn-secondary btn-sm" onclick="liveInstance.deleteRequest('${r.id}')">Cancel</button>`;
    } else if (mode === 'mine-active') {
      cardClass += ' mine-active';
      const isPoster = r.user_id === store.user.id;
      if (isPoster) {
        metaExtra = ` · ${r.poster_views || 0}/${MAX_SESSION_VIEWS} views`;
        if ((r.poster_views || 0) >= MAX_SESSION_VIEWS) {
          action = `<button class="btn-primary btn-sm" onclick="liveInstance.closeSession('${r.id}')">Close</button>`;
        } else {
          action = `<button class="btn-primary btn-sm" onclick="liveInstance.openSession('${r.id}')">Join</button>
                    <button class="btn-secondary btn-sm" onclick="liveInstance.closeSession('${r.id}')">End</button>`;
        }
      } else {
        action = `<button class="btn-primary btn-sm" onclick="liveInstance.openSession('${r.id}')">Join</button>
                  <button class="btn-secondary btn-sm" onclick="liveInstance.releaseFromBoard('${r.id}')">Leave</button>`;
      }
    } else {
      action = locked
        ? `<button class="btn-secondary btn-sm" disabled title="This Gliimait is in a live session right now">In Session</button>`
        : `<button class="btn-primary btn-sm" onclick="liveInstance.claimRequest('${r.id}')">Teach This</button>`;
      if (locked) cardClass += ' locked';
    }

    return `
      <div class="${cardClass}">
        ${avatar}
        <div class="live-req-info">
          <p class="live-req-title">${esc(r.title)}</p>
          ${desc}
          <p class="live-req-meta">${esc(name)} · ${timeAgo(r.created_at)}${mode === 'mine-active' ? ' · live now' : ''}${metaExtra}${locked && mode === 'teach' ? ' · in a live session' : ''}</p>
        </div>
        <div class="live-req-action">${action}</div>
      </div>
    `;
  },

  setupBoardRealtime() {
    if (this.boardChannel) {
      supabase.removeChannel(this.boardChannel);
      this.boardChannel = null;
    }
    const channel = supabase.channel('live-board-' + Date.now());
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_requests' }, (payload) => this.handleBoardEvent(payload))
      .subscribe();
    this.boardChannel = channel;
  },

  handleBoardEvent(payload) {
    if (payload.eventType === 'DELETE') {
      const id = payload.old?.id;
      if (id) delete this.statusById[id];
      this.scheduleBoardRefresh();
      return;
    }

    const row = payload.new;
    if (!row) return;

    const prev = this.statusById[row.id];
    this.statusById[row.id] = row.status;

    if (payload.eventType === 'UPDATE' && row.status === 'active' && row.user_id === store.user.id && (!prev || prev === 'open')) {
      this.announceClaim(row);
    }
    this.scheduleBoardRefresh();
  },

  scheduleBoardRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.loadBoard(), 700);
  },

  async announceClaim(row) {
    this.loadBoard();
    if (window.location.hash !== '#/live' || this.sessionModalOpen) return;

    let name = 'A Gliimait';
    const { data } = await supabase.from('profiles').select('full_name').eq('id', row.partner_id).maybeSingle();
    if (data?.full_name) name = data.full_name;
    alert(`${name} has decided to join your live session.`);
  },

  /* ============================================
     POSTING / CLAIMING / CANCELLING
     ============================================ */
  openRequestModal() {
    const myGp = store.profile?.total_gp || 0;
    if (myGp < MIN_GP_FOR_LIVE) return alert(`You need at least ${MIN_GP_FOR_LIVE} GP to start live sessions. You have ${myGp} GP.`);
    if (this.countMySessions() >= MAX_SESSIONS) return alert(`You can be in up to ${MAX_SESSIONS} live sessions at a time.`);

    const modal = document.getElementById('live-request-modal');
    if (modal) {
      modal.style.display = 'flex';
      document.getElementById('live-req-title')?.focus();
    }
  },

  countMySessions() {
    return this.requests.filter(r =>
      (r.user_id === store.user.id || r.partner_id === store.user.id) &&
      (r.status === 'open' || r.status === 'active')
    ).length;
  },

  closeRequestModal() {
    const modal = document.getElementById('live-request-modal');
    if (modal) modal.style.display = 'none';
  },

  async submitRequest() {
    const titleEl = document.getElementById('live-req-title');
    const descEl = document.getElementById('live-req-desc');
    const title = titleEl?.value.trim();
    const description = descEl?.value.trim() || null;
    if (!title) return alert('Please enter what you need help with.');

    const btn = document.getElementById('live-req-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Posting...'; }

    const { error } = await supabase.from('live_requests').insert({
      user_id: store.user.id,
      title: title.slice(0, 60),
      description: description ? description.slice(0, 200) : null,
      status: 'open'
    });

    if (btn) { btn.disabled = false; btn.textContent = 'Post Request'; }

    if (error) {
      if (isMissingTable(error)) return alert("Live Learning isn't available yet. Please try again later.");
      return alert('Could not post your request: ' + error.message);
    }

    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    this.closeRequestModal();
    this.loadBoard();
  },

  async claimRequest(id) {
    const row = this.requests.find(r => r.id === id);
    if (!row || row.status !== 'open' || row.user_id === store.user.id) return;
    const myGp = store.profile?.total_gp || 0;
    if (myGp < MIN_GP_FOR_LIVE) return alert(`You need at least ${MIN_GP_FOR_LIVE} GP to start live sessions. You have ${myGp} GP.`);
    if (this.countMySessions() >= MAX_SESSIONS) return alert(`You can be in up to ${MAX_SESSIONS} live sessions at a time.`);

    const learnerName = row.profiles?.full_name || 'this Gliimait';
    if (!await appConfirm(`Teach "${row.title}" to ${learnerName}?\nYou'll earn +${SESSION_GP} GP when you leave the session.`, { okText: 'Accept' })) return;

    const { data: claimed, error } = await supabase
      .from('live_requests')
      .update({ status: 'active', partner_id: store.user.id, activated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'open')
      .select('*, profiles:profiles!user_id(full_name, avatar_url)')
      .maybeSingle();

    if (error || !claimed) {
      if (error && isMissingTable(error)) return alert("Live Learning isn't available yet.");
      alert('This request was just taken by someone else.');
      this.loadBoard();
      return;
    }

    await supabase.from('messages').insert({
      sender_id: store.user.id,
      receiver_id: claimed.user_id,
      content: `${store.profile?.full_name || 'A Gliimait'} has decided to join your live session.`,
      is_ai: false
    });

    this.loadBoard();
    this.startSession(claimed);
  },

  async deleteRequest(id) {
    if (!await appConfirm('Cancel this request?', { okText: 'Cancel request', danger: true })) return;
    const { error } = await supabase.from('live_requests').delete().eq('id', id).eq('user_id', store.user.id);
    if (error && isMissingTable(error)) return alert("Live Learning isn't available yet.");
    this.loadBoard();
  },

  /* Poster ends an active session from the board: the request closes
     and they earn their GP. */
  async closeSession(id) {
    const row = this.requests.find(r => r.id === id);
    if (!row || row.user_id !== store.user.id || row.status !== 'active') return;

    const inStudio = this.sessionModalOpen && this.activeSession?.id === id;
    if (!inStudio) {
      const ok = await appConfirm(`End "${row.title}"?\nThe request closes and you earn +${SESSION_GP} GP.`, { okText: 'End session', danger: true });
      if (!ok) return;
    }

    await this.completeAsPoster(row);
    if (this.sessionModalOpen) this.cleanupSession();
    else this.loadBoard();
  },

  /* Teacher steps back from an active session they claimed but never
     entered: it returns to the board, no GP yet. */
  async releaseFromBoard(id) {
    const row = this.requests.find(r => r.id === id);
    if (!row || row.partner_id !== store.user.id || row.status !== 'active') return;
    if (!await appConfirm('Leave this session? It goes back to the board for another Gliimait.', { okText: 'Leave session', danger: true })) return;

    const { data: released } = await supabase
      .from('live_requests')
      .update({ status: 'open', partner_id: null, activated_at: null })
      .eq('id', id)
      .eq('status', 'active')
      .eq('partner_id', store.user.id)
      .select('id')
      .maybeSingle();

    if (!released) alert('This session is no longer active.');
    this.loadBoard();
  },

  /* ============================================
     SESSION LIFECYCLE
     ============================================ */
  async openSession(id) {
    if (this.sessionModalOpen) return;

    let row = this.requests.find(r => r.id === id);
    if (!row) {
      const { data } = await supabase
        .from('live_requests')
        .select('*, profiles:profiles!user_id(full_name, avatar_url)')
        .eq('id', id)
        .maybeSingle();
      row = data;
    }
    if (!row || row.status !== 'active') return this.loadBoard();
    const isPoster = row.user_id === store.user.id;
    if (!isPoster && row.partner_id !== store.user.id) return;

    if (isPoster) {
      if ((row.poster_views || 0) >= MAX_SESSION_VIEWS) {
        const close = await appConfirm(
          'You have already opened this session 3 times. You can only close it now — it will end and you will earn your GP.',
          { okText: 'Close session', danger: true }
        );
        if (close) await this.completeAsPoster(row);
        this.loadBoard();
        return;
      }
      // Count this open against the 3-view cap
      const { data: bumped, error } = await supabase.rpc('bump_live_views', { p_request: row.id });
      if (error) console.warn('Live view count unavailable (run sql/all.sql):', error.message);
      row.poster_views = typeof bumped === 'number' ? bumped : (row.poster_views || 0) + 1;
    }

    this.startSession(row);
  },

  async startSession(row) {
    if (this.sessionModalOpen || !row || row.status !== 'active') return;

    const isPoster = row.user_id === store.user.id;
    if (!isPoster && row.partner_id !== store.user.id) return;

    this.sessionRole = isPoster ? 'poster' : 'teacher';
    this.activeSession = row;
    this.sessionModalOpen = true;
    this.sessionConnected = false;
    this.sessionSettled = false;
    this.iceQueue = [];
    this.offerReceived = false;
    this.creatingOffer = false;
    this.answeringOffer = false;
    this.answerReceived = false;
    this.iceRestarted = false;
    this.clearWatchdogs();

    let partnerName = 'your partner';
    if (isPoster) {
      const { data } = await supabase.from('profiles').select('full_name').eq('id', row.partner_id).maybeSingle();
      partnerName = data?.full_name || 'your teacher';
    } else {
      partnerName = row.profiles?.full_name || 'the learner';
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay live-studio-overlay';
    overlay.id = 'live-session-overlay';
    overlay.innerHTML = `
      <div class="live-studio-container">
        <div class="live-video-main">
          <video id="live-remote-feed" autoplay playsinline></video>
          <video id="live-local-feed" autoplay playsinline muted></video>
          <div id="live-session-status" class="live-session-status"></div>
          <div class="live-video-overlay">
            <div class="live-overlay-top">
              <span class="live-indicator"><span class="live-pulse"></span>LIVE</span>
              <span class="live-timer" id="live-session-timer">00:00</span>
            </div>
            <h2>${esc(row.title)}</h2>
          </div>
          <div class="live-host-toolbar">
            <button class="live-ctrl-btn mic-on" id="live-mute-mic-btn" title="Toggle microphone">${ICONS.mic}</button>
            <button class="live-ctrl-btn cam-on" id="live-mute-cam-btn" title="Toggle camera">${ICONS.cam}</button>
            <button class="live-ctrl-btn" id="live-flip-btn" title="Flip camera">${ICONS.flip}</button>
            <button class="live-ctrl-btn" id="live-share-btn" title="Share screen">${ICONS.screen}</button>
            <button class="live-ctrl-btn" id="live-aspect-btn" title="Adjust display (fit / fill)">${ICONS.aspect}</button>
            <button class="live-ctrl-btn danger" id="live-end-btn" title="End session">${ICONS.end}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('live-mute-mic-btn')?.addEventListener('click', () => this.toggleMute('mic'));
    document.getElementById('live-mute-cam-btn')?.addEventListener('click', () => this.toggleMute('cam'));
    document.getElementById('live-flip-btn')?.addEventListener('click', () => this.flipCamera());
    document.getElementById('live-share-btn')?.addEventListener('click', () => this.toggleScreenShare());
    document.getElementById('live-aspect-btn')?.addEventListener('click', () => this.toggleAspectRatio());
    document.getElementById('live-end-btn')?.addEventListener('click', () => this.endSession());

    this.showSessionStatus(isPoster ? `Connecting to ${partnerName}…` : `Waiting for ${partnerName} to join…`);

    const ok = await this.startMedia();
    if (!ok) {
      // Only the requester's failure closes the request; a teacher without
      // camera access just steps out and leaves the session open.
      if (this.sessionRole === 'poster') {
        await supabase.from('live_requests').update({ status: 'cancelled' }).eq('id', row.id).eq('status', 'active');
        alert('Camera and microphone access are required for live sessions. Your request was closed.');
      } else {
        alert('Camera and microphone access are required. Grant access and rejoin — the session is still open.');
      }
      this.cleanupSession();
      return;
    }

    this.setupRtcChannel(row);
  },

  async startMedia() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      this.localStream = stream;
      const localEl = document.getElementById('live-local-feed');
      if (localEl) {
        localEl.srcObject = stream;
        localEl.play?.().catch(() => {});
      }
      return true;
    } catch (e) {
      console.error('Media access failed', e);
      return false;
    }
  },

  /* ============================================
     WEBRTC SIGNALING
     ============================================ */
  otherUserId() {
    const s = this.activeSession;
    if (!s) return null;
    return this.sessionRole === 'poster' ? s.partner_id : s.user_id;
  },

  setupRtcChannel(row) {
    if (this.rtcChannel) {
      supabase.removeChannel(this.rtcChannel);
      this.rtcChannel = null;
    }
    this.iceQueue = [];

    const channel = supabase.channel('live-rtc-' + row.id);
    channel
      .on('broadcast', { event: 'signal' }, ({ payload }) => this.handleSignal(payload))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_requests', filter: 'id=eq.' + row.id }, (payload) => this.handleSessionRowUpdate(payload.new))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.sendSignal({ type: this.sessionRole === 'teacher' ? 'teacher_ready' : 'learner_ready' });
          this.startReadyWatchdog();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.showSessionStatus('Lost contact with the server. Check your internet, then leave and rejoin.');
        }
      });

    this.rtcChannel = channel;
  },

  sendSignal(data) {
    if (!this.rtcChannel) return;
    this.rtcChannel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { ...data, sender: store.user.id, target: this.otherUserId() }
    });
  },

  /* Re-announce readiness until an offer shows up — a lost broadcast
     signal must not leave both sides waiting forever. */
  startReadyWatchdog() {
    clearInterval(this.readyWatchdog);
    let tries = 0;
    this.readyWatchdog = setInterval(() => {
      if (!this.sessionModalOpen || this.offerReceived || this.sessionPc) {
        clearInterval(this.readyWatchdog);
        return;
      }
      tries += 1;
      if (tries > 6) { clearInterval(this.readyWatchdog); return; }
      this.sendSignal({ type: 'learner_ready' });
    }, 4000);
  },

  /* Re-send the offer until an answer arrives. */
  startOfferWatchdog() {
    clearInterval(this.offerWatchdog);
    let tries = 0;
    this.offerWatchdog = setInterval(() => {
      if (!this.sessionModalOpen || this.answerReceived || !this.sessionPc || !this.sessionPc.localDescription) {
        clearInterval(this.offerWatchdog);
        return;
      }
      tries += 1;
      if (tries > 4) {
        clearInterval(this.offerWatchdog);
        this.showSessionStatus('The connection is not completing. Check that both devices are online, then end the session and try again.');
        return;
      }
      this.sendSignal({ type: 'offer', sdp: this.sessionPc.localDescription });
    }, 5000);
  },

  clearWatchdogs() {
    clearInterval(this.readyWatchdog);
    clearInterval(this.offerWatchdog);
    this.readyWatchdog = null;
    this.offerWatchdog = null;
  },

  async handleSignal(payload) {
    if (!payload || payload.sender === store.user.id) return;
    if (payload.target && payload.target !== store.user.id) return;

    if (payload.type === 'learner_ready' && this.sessionRole === 'teacher') {
      await this.createTeacherOffer();
    } else if (payload.type === 'teacher_ready' && this.sessionRole === 'poster') {
      // Re-announce so a teacher that subscribed after us still gets an offer trigger
      if (!this.offerReceived && !this.sessionPc) this.sendSignal({ type: 'learner_ready' });
    } else if (payload.type === 'offer' && this.sessionRole === 'poster') {
      await this.handleOffer(payload.sdp);
    } else if (payload.type === 'answer' && this.sessionRole === 'teacher') {
      await this.handleAnswer(payload.sdp);
    } else if (payload.type === 'ice') {
      await this.handleRemoteIce(payload.candidate);
    }
  },

  buildPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate) this.sendSignal({ type: 'ice', candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      const remoteEl = document.getElementById('live-remote-feed');
      if (remoteEl && e.streams && e.streams[0]) {
        remoteEl.srcObject = e.streams[0];
        remoteEl.play?.().then(() => this.removeUnmuteHint()).catch(() => {
          // Autoplay with sound was blocked — start muted and offer a tap
          remoteEl.muted = true;
          remoteEl.play?.().catch(() => {});
          this.showUnmuteHint();
        });
      }
    };
    pc.onconnectionstatechange = () => this.handlePcState(pc.connectionState);

    this.sessionPc = pc;
    return pc;
  },

  async createTeacherOffer(force = false) {
    if (this.creatingOffer || !this.sessionModalOpen || !this.localStream) return;
    if (!force && this.sessionPc && this.sessionPc.localDescription) return;

    this.creatingOffer = true;
    try {
      this.closePeerConnection();
      const pc = this.buildPeerConnection();
      this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendSignal({ type: 'offer', sdp: pc.localDescription });
      this.startOfferWatchdog();
    } catch (e) {
      console.error('Failed to create offer', e);
    } finally {
      this.creatingOffer = false;
    }
  },

  async handleOffer(sdp) {
    if (this.answeringOffer || !this.sessionModalOpen) return;
    this.answeringOffer = true;
    this.offerReceived = true;
    clearInterval(this.readyWatchdog);

    try {
      this.closePeerConnection();
      const pc = this.buildPeerConnection();
      if (this.localStream) this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream));
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.flushIceQueue();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.sendSignal({ type: 'answer', sdp: pc.localDescription });
    } catch (e) {
      console.error('Failed to handle offer', e);
    } finally {
      this.answeringOffer = false;
    }
  },

  async handleAnswer(sdp) {
    if (!this.sessionPc) return;
    this.answerReceived = true;
    clearInterval(this.offerWatchdog);
    try {
      await this.sessionPc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.flushIceQueue();
    } catch (e) {
      console.error('Failed to handle answer', e);
      // The answer belongs to a renegotiated peer connection — start over
      // so the next answer can be applied.
      await this.createTeacherOffer(true);
    }
  },

  async handleRemoteIce(candidate) {
    if (!candidate) return;
    if (this.sessionPc && this.sessionPc.remoteDescription) {
      try { await this.sessionPc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { /* late candidate */ }
    } else {
      this.iceQueue.push(candidate);
    }
  },

  async flushIceQueue() {
    if (!this.sessionPc) return;
    const queued = this.iceQueue.splice(0);
    for (const c of queued) {
      try { await this.sessionPc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { /* late candidate */ }
    }
  },

  handlePcState(state) {
    if (state === 'connected') {
      if (!this.sessionConnected) {
        this.sessionConnected = true;
        this.startSessionTimer();
      }
      this.hideSessionStatus();
    } else if (state === 'failed') {
      this.showSessionStatus('Connection failed. Trying to recover…');
      this.tryIceRestart();
    } else if (state === 'disconnected' && this.sessionConnected) {
      this.showSessionStatus('Reconnecting…');
    }
  },

  async tryIceRestart() {
    if (!this.sessionPc || this.iceRestarted || !this.sessionModalOpen) return;
    this.iceRestarted = true;
    try {
      if (this.sessionRole === 'teacher') {
        const offer = await this.sessionPc.createOffer({ iceRestart: true });
        await this.sessionPc.setLocalDescription(offer);
        this.sendSignal({ type: 'offer', sdp: this.sessionPc.localDescription });
        this.startOfferWatchdog();
      } else {
        this.sessionPc.restartIce?.();
      }
    } catch (e) {
      console.error('ICE restart failed', e);
      this.showSessionStatus('Connection failed. You may be on a restrictive network — end the session and retry, ideally from the same Wi-Fi.');
    }
  },

  closePeerConnection() {
    if (this.sessionPc) {
      try {
        this.sessionPc.onicecandidate = null;
        this.sessionPc.ontrack = null;
        this.sessionPc.onconnectionstatechange = null;
        this.sessionPc.close();
      } catch (e) { /* already closed */ }
      this.sessionPc = null;
    }
  },

  /* ============================================
     IN-SESSION CONTROLS
     ============================================ */
  showSessionStatus(text) {
    const el = document.getElementById('live-session-status');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
  },

  hideSessionStatus() {
    const el = document.getElementById('live-session-status');
    if (el) el.style.display = 'none';
  },

  showUnmuteHint() {
    if (document.getElementById('live-unmute-hint')) return;
    const btn = document.createElement('button');
    btn.id = 'live-unmute-hint';
    btn.className = 'live-unmute-hint';
    btn.textContent = 'Tap for sound';
    btn.onclick = () => {
      const el = document.getElementById('live-remote-feed');
      if (el) { el.muted = false; el.play?.().catch(() => {}); }
      this.removeUnmuteHint();
    };
    document.querySelector('.live-video-main')?.appendChild(btn);
  },

  removeUnmuteHint() {
    document.getElementById('live-unmute-hint')?.remove();
  },

  startSessionTimer() {
    if (this.sessionTimerInterval) return;
    const start = Date.now();
    const tick = () => {
      const el = document.getElementById('live-session-timer');
      if (!el) return;
      const secs = Math.floor((Date.now() - start) / 1000);
      el.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    };
    tick();
    this.sessionTimerInterval = setInterval(tick, 1000);
  },

  toggleMute(type) {
    if (!this.localStream) return;
    const tracks = type === 'mic' ? this.localStream.getAudioTracks() : this.localStream.getVideoTracks();
    if (!tracks.length) return;

    const enabled = !tracks[0].enabled;
    tracks.forEach(t => { t.enabled = enabled; });

    const btn = document.getElementById(type === 'mic' ? 'live-mute-mic-btn' : 'live-mute-cam-btn');
    if (btn) {
      btn.classList.toggle(type === 'mic' ? 'mic-on' : 'cam-on', enabled);
      btn.classList.toggle(type === 'mic' ? 'mic-off' : 'cam-off', !enabled);
    }
  },

  async flipCamera() {
    if (!this.localStream || this.isScreenSharing) return;
    const current = this.localStream.getVideoTracks()[0];
    if (!current) return;

    const nextFacing = current.getSettings?.().facingMode === 'environment' ? 'user' : 'environment';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: nextFacing }, audio: false });
      const newTrack = newStream.getVideoTracks()[0];
      if (this.sessionPc) {
        const sender = this.sessionPc.getSenders().find(sn => sn.track && sn.track.kind === 'video');
        if (sender) await sender.replaceTrack(newTrack);
      }
      current.stop();
      this.localStream.removeTrack(current);
      this.localStream.addTrack(newTrack);
      const localEl = document.getElementById('live-local-feed');
      if (localEl) localEl.srcObject = this.localStream;
    } catch (e) {
      console.error('Failed to flip camera', e);
    }
  },

  async toggleScreenShare() {
    if (!this.sessionPc || !this.localStream) return;

    const sender = this.sessionPc.getSenders().find(sn => sn.track && sn.track.kind === 'video');

    if (this.isScreenSharing) {
      if (sender && this.preShareTrack) await sender.replaceTrack(this.preShareTrack);
      this.displayStream?.getTracks().forEach(t => t.stop());
      this.displayStream = null;
      this.preShareTrack = null;
      this.isScreenSharing = false;
      const localEl = document.getElementById('live-local-feed');
      if (localEl) {
        localEl.srcObject = this.localStream;
        localEl.classList.remove('sharing');
      }
      document.getElementById('live-share-btn')?.classList.remove('sharing');
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' } });
      const screenTrack = display.getVideoTracks()[0];
      this.preShareTrack = this.localStream.getVideoTracks()[0] || null;
      if (sender) await sender.replaceTrack(screenTrack);
      this.displayStream = display;
      this.isScreenSharing = true;
      screenTrack.onended = () => { if (this.isScreenSharing) this.toggleScreenShare(); };

      const localEl = document.getElementById('live-local-feed');
      if (localEl) {
        localEl.srcObject = new MediaStream([screenTrack]);
        localEl.classList.add('sharing');
      }
      document.getElementById('live-share-btn')?.classList.add('sharing');
    } catch (e) {
      // user cancelled the picker
    }
  },

  toggleAspectRatio() {
    const remoteEl = document.getElementById('live-remote-feed');
    if (!remoteEl) return;
    const contained = remoteEl.classList.toggle('fit-contain');
    document.getElementById('live-aspect-btn')?.classList.toggle('sharing', contained);
  },

  /* ============================================
     SETTLEMENT & TEARDOWN
     ============================================ */
  async endSession() {
    const s = this.activeSession;
    if (!s) return;

    if (this.sessionRole === 'poster') {
      let msg = `End this session or leave it open?\n\nEnd: the request closes and you earn +${SESSION_GP} GP.`;
      if (this.sessionConnected) msg += '\nYour teacher also keeps their GP.';
      msg += '\n\nLeave it open: other Gliimaits can still accept it — you earn nothing yet.';
      const end = await appConfirm(msg, { okText: 'End session', cancelText: 'Leave it open' });
      if (end) this.endLive();
      else this.releaseSession(false);
      return;
    }

    const leave = await appConfirm(
      this.sessionConnected
        ? `Leave this session?\nYou'll earn +${SESSION_GP} GP and the request goes back to the board.`
        : 'Leave this session? It goes back to the board for another Gliimait.',
      { okText: 'Leave session', danger: true }
    );
    if (leave) this.releaseSession(true);
  },

  endLive() {
    if (!this.sessionModalOpen) return;
    if (this.sessionSettled) {
      this.cleanupSession();
      return;
    }
    if (this.sessionRole === 'poster') {
      this.settleSession();
    } else {
      this.releaseSession(true);
    }
  },

  /* Step out without ending it for everyone: the request returns to
     the board. `award` pays the teacher their GP — but only when a
     real connection happened, so claim-and-quit earns nothing. */
  async releaseSession(award) {
    const s = this.activeSession;
    if (!s) return;
    const wasConnected = this.sessionConnected;
    this.sessionSettled = true;

    const { data: released } = await supabase
      .from('live_requests')
      .update({ status: 'open', partner_id: null, activated_at: null })
      .eq('id', s.id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();

    if (released && award && wasConnected) {
      await supabase.rpc('add_gp', { target_user_id: store.user.id, points_to_add: SESSION_GP });
      await this.recordOwnSessionTx(s);
    }

    this.cleanupSession();
  },

  /* Poster closes the request: they always earn their GP; the teacher
     only earns when a real connection happened. */
  async completeAsPoster(row) {
    if (this.activeSession?.id === row.id) this.sessionSettled = true;

    const key = 'gliimu_live_tx_' + row.id;
    let firstTime = true;
    try {
      if (localStorage.getItem(key)) firstTime = false;
      else localStorage.setItem(key, '1');
    } catch (e) { /* storage unavailable */ }

    const connected = this.activeSession?.id === row.id ? !!this.sessionConnected : false;
    const { data: flipped } = await supabase
      .from('live_requests')
      .update({ status: 'completed', completed_by: store.user.id, completed_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();

    if (flipped) {
      await supabase.rpc('add_gp', { target_user_id: row.user_id, points_to_add: SESSION_GP });
      if (connected && row.partner_id) await supabase.rpc('add_gp', { target_user_id: row.partner_id, points_to_add: SESSION_GP });
    }

    if (firstTime) {
      await supabase.from('transactions').insert({
        user_id: store.user.id,
        amount: 0,
        points: SESSION_GP,
        type: 'live_session',
        status: 'success',
        description: `Live session: ${row.title} (+${SESSION_GP} GP earned)`
      });
    }
  },

  async settleSession() {
    if (this.sessionSettled || !this.activeSession) return;
    this.sessionSettled = true;

    const s = this.activeSession;
    await this.completeAsPoster(s);
    this.finishSessionUI(s);
  },

  async finalizeAfterCompletion() {
    if (this.sessionSettled || !this.activeSession) return;
    this.sessionSettled = true;

    const s = this.activeSession;
    await this.recordOwnSessionTx(s);
    this.finishSessionUI(s);
  },

  async recordOwnSessionTx(s) {
    const key = 'gliimu_live_tx_' + s.id;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch (e) { /* storage unavailable */ }

    const isPoster = s.user_id === store.user.id;
    await supabase.from('transactions').insert({
      user_id: store.user.id,
      amount: 0,
      points: SESSION_GP,
      type: 'live_session',
      status: 'success',
      description: isPoster ? `Live session: ${s.title} (+${SESSION_GP} GP earned)` : `Live session taught: ${s.title} (+${SESSION_GP} GP earned)`
    });
  },

  finishSessionUI(s) {
    const lines = ['Session complete! 🎉', `+${SESSION_GP} GP earned.`];
    this.cleanupSession();
    alert(lines.join('\n'));
  },

  handleSessionRowUpdate(row) {
    if (!row || !this.activeSession || row.id !== this.activeSession.id) return;
    this.activeSession = { ...this.activeSession, ...row, profiles: this.activeSession.profiles };
    if (this.sessionSettled) return;

    if (row.status === 'completed') {
      this.finalizeAfterCompletion();
    } else if (row.status === 'cancelled') {
      this.sessionSettled = true;
      this.cleanupSession();
      alert('This session was cancelled.');
    } else if (row.status === 'open') {
      // Our partner stepped out — the request is back on the board
      this.sessionSettled = true;
      const who = this.sessionRole === 'poster' ? 'Your teacher left the session.' : 'The learner left the session.';
      this.cleanupSession();
      alert(`${who} It is open again.`);
    }
  },

  cleanupSession() {
    if (this.sessionTimerInterval) {
      clearInterval(this.sessionTimerInterval);
      this.sessionTimerInterval = null;
    }
    this.clearWatchdogs();
    this.removeUnmuteHint();
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    if (this.displayStream) {
      this.displayStream.getTracks().forEach(t => t.stop());
      this.displayStream = null;
    }
    this.preShareTrack = null;
    this.isScreenSharing = false;
    this.closePeerConnection();
    if (this.rtcChannel) {
      supabase.removeChannel(this.rtcChannel);
      this.rtcChannel = null;
    }
    document.getElementById('live-session-overlay')?.remove();

    this.sessionModalOpen = false;
    this.sessionConnected = false;
    this.sessionSettled = false;
    this.activeSession = null;
    this.sessionRole = null;
    this.iceQueue = [];
    this.offerReceived = false;
    this.answerReceived = false;
    this.iceRestarted = false;
    this.creatingOffer = false;
    this.answeringOffer = false;

    this.loadBoard();
  }
};

export default liveView;
