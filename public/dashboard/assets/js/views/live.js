import { supabase, API_BASE_URL } from '/shared/js/config.js';
import { store } from '../store.js?v=2';
import * as heartbeat from '../heartbeat.js?v=3';

const GP_PER_MINUTE = 1;
const MIN_CONNECTED_GP = 1;
const MIN_GP_FOR_LIVE = 100;
const MAX_SESSIONS = 3;

const ICONS = {
  search: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  plus: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
  mic: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>',
  cam: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>',
  flip: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>',
  screen: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
  end: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>',
  chat: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
  lock: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
  unlock: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>'
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

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

  callObject: null,
  participants: {},
  chatMessages: [],
  chatOpen: false,
  invitedUserIds: [],
  invitedUserNames: {},

  boardChannel: null,
  sessionChannel: null,
  statusById: {},
  sessionTimerInterval: null,
  chatPollInterval: null,
  refreshTimer: null,
  liveSecs: 0,
  creditedGp: 0,
  sessionGpByRequest: {},
  sessionGpPaidByRequest: {},

  template: `
    <div class="live-layout" id="live-container">
      <div id="live-board-content"></div>
    </div>
    <div class="modal-overlay" id="live-request-modal" style="display: none;">
      <div class="modal-content">
        <button class="modal-close" onclick="liveInstance.closeRequestModal()">×</button>
        <h2 style="margin-bottom: 8px;">Start a Live Session</h2>
        <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">Host a multi-participant live session. Choose who can join.</p>
        <div class="form-group">
          <label>Topic</label>
          <input type="text" id="live-req-title" class="input" maxlength="60" placeholder="e.g. Let's discuss UI/UX fundamentals">
        </div>
        <div class="form-group">
          <label>Details (optional)</label>
          <textarea id="live-req-desc" class="input" rows="3" maxlength="200" placeholder="What do you want to cover?"></textarea>
        </div>
        <div class="form-group">
          <label>Who can join?</label>
          <select id="live-req-sharing" class="input" onchange="liveInstance.onSharingModeChange()">
            <option value="general">Everyone (visible on live board)</option>
            <option value="users">Specific people (invite by name)</option>
            <option value="triad">My triad members</option>
          </select>
        </div>
        <div id="live-req-invite-container" class="form-group" style="display: none;">
          <label>Invite users</label>
          <input type="text" id="live-req-invite-search" class="input" placeholder="Search users..." oninput="liveInstance.searchInviteUsers()">
          <div id="live-req-invite-results" style="max-height: 150px; overflow-y: auto; margin-top: 8px;"></div>
          <div id="live-req-invite-selected" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px;"></div>
        </div>
        <button class="btn-primary" style="width: 100%;" id="live-req-submit-btn" onclick="liveInstance.submitRequest()">Start Session</button>
      </div>
    </div>
  `,

  async init(opts = {}) {
    this.embedded = !!opts.embedded;
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
      toggleScreenShare: () => this.toggleScreenShare(),
      toggleChat: () => this.toggleChat(),
      sendChatMessage: () => this.sendChatMessage(),
      toggleRoomLock: () => this.toggleRoomLock(),
      onSharingModeChange: () => this.onSharingModeChange(),
      searchInviteUsers: () => this.searchInviteUsers(),
      selectInviteUser: (id, name) => this.selectInviteUser(id, name),
      removeInviteUser: (id) => this.removeInviteUser(id)
    };

    this.requests = [];
    this.searchQuery = '';
    this.boardUnavailable = false;
    this.statusById = {};
    this.invitedUserIds = [];
    this.invitedUserNames = {};

    if (this.onPresenceChanged) window.removeEventListener('presence-changed', this.onPresenceChanged);
    this.onPresenceChanged = () => this.renderBoard();
    window.addEventListener('presence-changed', this.onPresenceChanged);

    if (!this.embedded) this.setupTopbar();
    this.setupBoardRealtime();
    await this.loadBoard();
  },

  setupTopbar() {
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    const topbarRight = document.getElementById('topbar-right-actions');

    if (topbarDynamic) {
      topbarDynamic.innerHTML = `
        <div class="live-topbar-search">
          ${ICONS.search}
          <input type="text" id="live-search" placeholder="Search topics..." autocomplete="off">
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
      this.renderBoard();
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
      boardEl.innerHTML = '<div class="card"><p class="live-board-empty">Live is not available yet.</p></div>';
      return;
    }

    const q = this.searchQuery.trim().toLowerCase();
    const matches = (r) => !q || (r.title || '').toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q);
    const presence = window.GliimuPresence;
    const isOnline = (id) => !presence || presence.isOnline(id);
    const parseIds = (v) => { if (!v) return []; if (Array.isArray(v)) return v; try { return JSON.parse(v); } catch { return []; } };

    const mine = this.requests
      .filter(r => r.user_id === store.user.id && (r.status === 'open' || r.status === 'active') && matches(r))
      .sort((a, b) => (a.status === 'active' ? -1 : 1) - (b.status === 'active' ? -1 : 1) || new Date(b.created_at) - new Date(a.created_at));

    const open = this.requests.filter(r =>
      r.user_id !== store.user.id && r.status === 'open' && matches(r) && isOnline(r.user_id) &&
      (r.sharing_mode === 'general' ||
       parseIds(r.invited_user_ids).includes(store.user.id))
    );

    let html = '';
    if (mine.length) {
      html += `<div class="live-board-section"><h3 class="live-board-title">My Sessions</h3>${mine.map(r => this.renderRequestCard(r, r.status === 'active' ? 'mine-active' : 'mine')).join('')}</div>`;
    }
    if (open.length) {
      html += `<div class="live-board-section"><h3 class="live-board-title">Open Sessions</h3>${open.map(r => this.renderRequestCard(r, 'join')).join('')}</div>`;
    }

    if (!html && q) {
      html = `<p class="live-board-empty">No sessions match "${esc(this.searchQuery.trim())}".</p>`;
    }
    if (!html && !q) {
      html = `
        <div class="live-board-empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="live-empty-icon"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
          <p class="live-board-empty">No live sessions right now.</p>
          <button class="btn-primary" onclick="liveInstance.openRequestModal()">Start a Live Session</button>
        </div>
      `;
    }

    boardEl.innerHTML = html;
  },

  renderRequestCard(r, mode) {
    const name = r.profiles?.full_name || 'A Gliimait';
    const avatar = r.profiles?.avatar_url
      ? `<img src="${esc(r.profiles.avatar_url)}" class="live-req-avatar" alt="">`
      : `<div class="live-req-avatar"></div>`;
    const desc = r.description ? `<p class="live-req-desc">${esc(r.description)}</p>` : '';
    const count = r.participant_count || 0;
    const max = r.max_participants || 10;
    const sharingBadge = r.sharing_mode === 'triad' ? '<span class="live-sharing-badge triad">Triad</span>' :
                        r.sharing_mode === 'users' ? '<span class="live-sharing-badge users">Invited</span>' : '';
    const lockBadge = r.is_locked ? `<span class="live-lock-badge">${ICONS.lock}</span>` : '';

    let action = '';
    let cardClass = 'live-request-card';

    if (mode === 'mine') {
      action = `<button class="btn-secondary btn-sm" onclick="liveInstance.deleteRequest('${r.id}')">Cancel</button>`;
    } else if (mode === 'mine-active') {
      cardClass += ' mine-active';
      action = `
        <button class="btn-secondary btn-sm" onclick="liveInstance.toggleRoomLock('${r.id}')" title="${r.is_locked ? 'Unlock' : 'Lock'} room">${r.is_locked ? ICONS.unlock : ICONS.lock}</button>
        <button class="btn-primary btn-sm" onclick="liveInstance.openSession('${r.id}')">Join</button>
        <button class="btn-secondary btn-sm" onclick="liveInstance.closeSession('${r.id}')">End</button>
      `;
    } else {
      if (count >= max) {
        action = `<button class="btn-secondary btn-sm" disabled>Full</button>`;
      } else if (r.is_locked) {
        action = `<button class="btn-secondary btn-sm" disabled>${ICONS.lock} Locked</button>`;
      } else {
        action = `<button class="btn-primary btn-sm" onclick="liveInstance.claimRequest('${r.id}')">Join</button>`;
      }
    }

    return `
      <div class="${cardClass}" data-request-id="${r.id}">
        <div class="live-req-header">
          ${avatar}
          <div class="live-req-info">
            <div class="live-req-name">${esc(name)}</div>
            <div class="live-req-time">${timeAgo(r.created_at)}</div>
          </div>
          ${sharingBadge}
          ${lockBadge}
        </div>
        <h4 class="live-req-title">${esc(r.title)}</h4>
        ${desc}
        <div class="live-req-meta">
          <span>${count}/${max} participants</span>
        </div>
        <div class="live-req-actions">${action}</div>
      </div>
    `;
  },

  setupBoardRealtime() {
    if (this.boardChannel) supabase.removeChannel(this.boardChannel);
    this.boardChannel = supabase.channel('live-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_requests' }, () => this.loadBoard())
      .subscribe();
  },

  openRequestModal() {
    const myGp = store.profile?.total_gp || 0;
    if (myGp < MIN_GP_FOR_LIVE) return alert(`You need at least ${MIN_GP_FOR_LIVE} GP to host a live session.`);
    if (this.countMySessions() >= MAX_SESSIONS) return alert(`You can host up to ${MAX_SESSIONS} sessions at a time.`);
    document.getElementById('live-request-modal').style.display = 'flex';
  },

  countMySessions() {
    return this.requests.filter(r => r.user_id === store.user.id && (r.status === 'open' || r.status === 'active')).length;
  },

  closeRequestModal() {
    document.getElementById('live-request-modal').style.display = 'none';
    document.getElementById('live-req-title').value = '';
    document.getElementById('live-req-desc').value = '';
    document.getElementById('live-req-sharing').value = 'general';
    this.invitedUserIds = [];
    this.invitedUserNames = {};
    this.onSharingModeChange();
  },

  onSharingModeChange() {
    const mode = document.getElementById('live-req-sharing')?.value;
    const container = document.getElementById('live-req-invite-container');
    if (container) container.style.display = mode === 'users' ? 'block' : 'none';
  },

  async searchInviteUsers() {
    const query = document.getElementById('live-req-invite-search')?.value?.trim();
    const resultsEl = document.getElementById('live-req-invite-results');
    if (!query || query.length < 2) { if (resultsEl) resultsEl.innerHTML = ''; return; }

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .ilike('full_name', `%${query}%`)
      .neq('id', store.user.id)
      .limit(10);

    if (resultsEl) {
      resultsEl.innerHTML = (data || [])
        .filter(u => !this.invitedUserIds.includes(u.id))
        .map(u => `<div class="live-invite-user" onclick="liveInstance.selectInviteUser('${u.id}', '${esc(u.full_name)}')">${esc(u.full_name)}</div>`)
        .join('');
    }
  },

  selectInviteUser(id, name) {
    if (this.invitedUserIds.includes(id)) return;
    this.invitedUserIds.push(id);
    this.invitedUserNames[id] = name;
    this.renderInviteSelected();
    document.getElementById('live-req-invite-search').value = '';
    document.getElementById('live-req-invite-results').innerHTML = '';
  },

  removeInviteUser(id) {
    this.invitedUserIds = this.invitedUserIds.filter(uid => uid !== id);
    delete this.invitedUserNames[id];
    this.renderInviteSelected();
  },

  renderInviteSelected() {
    const el = document.getElementById('live-req-invite-selected');
    if (!el) return;
    el.innerHTML = this.invitedUserIds.map(id =>
      `<span class="live-invite-chip">${esc(this.invitedUserNames[id])} <button onclick="liveInstance.removeInviteUser('${id}')">×</button></span>`
    ).join('');
  },

  async submitRequest() {
    const title = document.getElementById('live-req-title')?.value?.trim();
    const description = document.getElementById('live-req-desc')?.value?.trim();
    const sharingMode = document.getElementById('live-req-sharing')?.value || 'general';

    if (!title) return alert('Please enter a topic.');

    const btn = document.getElementById('live-req-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Starting...'; }

    const { data: request, error } = await supabase
      .from('live_requests')
      .insert({
        user_id: store.user.id,
        title: title.slice(0, 60),
        description: description ? description.slice(0, 200) : null,
        status: 'open',
        sharing_mode: sharingMode,
        invited_user_ids: sharingMode === 'users' && this.invitedUserIds.length ? JSON.stringify(this.invitedUserIds) : null,
        max_participants: 10,
        participant_count: 1
      })
      .select()
      .single();

    if (btn) { btn.disabled = false; btn.textContent = 'Start Session'; }

    if (error) {
      console.error('Failed to create request', error);
      return alert('Could not start session. Please try again.');
    }

    this.closeRequestModal();
    await this.createDailyRoom(request.id);
  },

  async createDailyRoom(requestId) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/daily/create-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ requestId })
      });

      const result = await response.json();
      if (!result.room_url) throw new Error(result.error || 'Failed to create room');

      await supabase
        .from('live_requests')
        .update({ room_id: result.room_id, room_url: result.room_url, status: 'active' })
        .eq('id', requestId);

      this.loadBoard();
      this.openSession(requestId);
    } catch (error) {
      console.error('Failed to create daily room', error);
      alert('Could not create video room. Please try again.');
      await supabase.from('live_requests').delete().eq('id', requestId);
      this.loadBoard();
    }
  },

  async deleteRequest(id) {
    const request = this.requests.find(r => r.id === id);
    if (!request || request.user_id !== store.user.id) return;
    if (!await appConfirm('Cancel this session?', { okText: 'Cancel', danger: true })) return;

    if (request.room_id) await this.deleteDailyRoom(request.room_id);
    await supabase.from('live_requests').delete().eq('id', id);
    this.loadBoard();
  },

  async deleteDailyRoom(roomId) {
    try {
      const request = this.requests.find(r => r.room_id === roomId);
      if (!request) return;
      
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${API_BASE_URL}/api/daily/delete-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ requestId: request.id })
      });
    } catch (error) {
      console.error('Failed to delete daily room', error);
    }
  },

  async claimRequest(id) {
    const request = this.requests.find(r => r.id === id);
    if (!request || request.status !== 'open') return;

    const count = request.participant_count || 0;
    const max = request.max_participants || 10;
    if (count >= max) return alert('This session is full.');
    if (request.is_locked) return alert('This session is locked.');

    const myGp = store.profile?.total_gp || 0;
    if (myGp < MIN_GP_FOR_LIVE) return alert(`You need at least ${MIN_GP_FOR_LIVE} GP to join live sessions.`);

    const { error } = await supabase
      .from('live_requests')
      .update({ participant_count: count + 1 })
      .eq('id', id)
      .eq('status', 'open');

    if (error) {
      console.error('Failed to join request', error);
      return alert('Could not join session.');
    }

    await supabase.from('notifications').insert({
      user_id: request.user_id,
      actor_id: store.user.id,
      kind: 'live',
      title: `${store.profile.full_name} joined your live session`
    });

    this.loadBoard();
    this.openSession(id);
  },

  async openSession(id) {
    const request = this.requests.find(r => r.id === id);
    if (!request) return;

    if (!request.room_url) {
      if (request.user_id === store.user.id) {
        await this.createDailyRoom(id);
      }
      return;
    }

    this.activeSession = request;
    this.sessionRole = request.user_id === store.user.id ? 'host' : 'participant';
    this.sessionModalOpen = true;
    this.sessionSettled = false;
    this.participants = {};
    this.chatMessages = [];
    this.chatOpen = false;
    this.liveSecs = 0;
    this.creditedGp = 0;

    this.renderSessionUI();
    await this.joinDailyCall(request.room_url);
    this.loadChatMessages(id);
    this.startChatPolling(id);
    this.setupSessionRealtime(id);

    heartbeat.setCurrentPost(null);
    heartbeat.start();
  },

  async joinDailyCall(roomUrl) {
    if (this.callObject) {
      await this.callObject.destroy();
      this.callObject = null;
    }

    this.showSessionStatus('Joining session...');

    try {
      if (typeof requestDevicePermission === 'function') {
        await requestDevicePermission('camera_microphone');
      }
    } catch (e) { /* permission modal may not exist */ }

    this.callObject = window.DailyIframe.createCallObject({
      url: roomUrl,
      userName: store.profile?.full_name || store.user?.full_name || 'Gliimait'
    });

    this.callObject
      .on('joined-meeting', () => {
        this.sessionConnected = true;
        this.hideSessionStatus();
        this.updateParticipantGrid();
      })
      .on('participant-joined', (e) => {
        this.participants[e.participant.session_id] = e.participant;
        this.updateParticipantGrid();
      })
      .on('participant-updated', (e) => {
        if (e.participant) {
          this.participants[e.participant.session_id] = e.participant;
          this.updateParticipantGrid();
        }
      })
      .on('participant-left', (e) => {
        delete this.participants[e.participant.session_id];
        this.updateParticipantGrid();
      })
      .on('track-started', (e) => {
        if (e.track && e.participant) {
          const p = this.participants[e.participant.session_id];
          if (p) {
            if (!p.tracks) p.tracks = {};
            p.tracks[e.track.kind] = e.track;
            this.updateParticipantGrid();
          }
        }
      })
      .on('track-stopped', (e) => {
        if (e.track && e.participant) {
          const p = this.participants[e.participant.session_id];
          if (p && p.tracks) {
            delete p.tracks[e.track.kind];
            this.updateParticipantGrid();
          }
        }
      })
      .on('left-meeting', () => {
        this.cleanupSession();
      })
      .on('error', (e) => {
        console.error('Daily.co error', e);
        this.showSessionStatus('Connection error. Please try again.');
      });

    try {
      await this.callObject.join();
      await this.callObject.startCamera();
    } catch (error) {
      console.error('Failed to join daily call', error);
      this.showSessionStatus('Could not connect. Check camera/mic permissions.');
    }
  },

  renderSessionUI() {
    const overlay = document.createElement('div');
    overlay.id = 'live-session-overlay';
    overlay.className = 'live-session-overlay';

    const request = this.activeSession;
    const isHost = this.sessionRole === 'host';
    const count = request.participant_count || 0;
    const max = request.max_participants || 10;

    overlay.innerHTML = `
      <div class="live-studio-container">
        <div class="live-video-main">
          <div id="live-participant-grid" class="live-participant-grid grid-1"></div>
          <div class="live-session-info">
            <h3>${esc(request.title)}</h3>
            <div class="live-session-meta">
              <span id="live-session-timer">00:00</span>
              <span id="live-session-gp">+0 GP</span>
              <span>${count}/${max} participants</span>
            </div>
          </div>
          <div id="live-session-status" class="live-session-status" style="display: none;"></div>
        </div>
        <div class="live-controls">
          <button class="live-ctrl-btn mic-on" id="live-mute-mic-btn" title="Mute microphone">${ICONS.mic}</button>
          <button class="live-ctrl-btn cam-on" id="live-mute-cam-btn" title="Turn off camera">${ICONS.cam}</button>
          ${isMobileDevice ? `<button class="live-ctrl-btn" id="live-flip-btn" title="Flip camera">${ICONS.flip}</button>` : ''}
          ${!isMobileDevice ? `<button class="live-ctrl-btn" id="live-share-btn" title="Share screen">${ICONS.screen}</button>` : ''}
          <button class="live-ctrl-btn" id="live-chat-btn" title="Toggle chat">${ICONS.chat}</button>
          <button class="live-ctrl-btn danger" id="live-end-btn" title="End session">${ICONS.end}</button>
        </div>
        <div id="live-chat-panel" class="live-chat-panel" style="display: none;">
          <div class="live-chat-header">
            <h4>Session Chat</h4>
            <button onclick="liveInstance.toggleChat()">×</button>
          </div>
          <div id="live-chat-messages" class="live-chat-messages"></div>
          <div class="live-chat-input">
            <input type="text" id="live-chat-input-field" placeholder="Type a message..." maxlength="500" onkeypress="if(event.key==='Enter')liveInstance.sendChatMessage()">
            <button onclick="liveInstance.sendChatMessage()">Send</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('live-mute-mic-btn')?.addEventListener('click', () => this.toggleMute('mic'));
    document.getElementById('live-mute-cam-btn')?.addEventListener('click', () => this.toggleMute('cam'));
    document.getElementById('live-flip-btn')?.addEventListener('click', () => this.flipCamera());
    document.getElementById('live-share-btn')?.addEventListener('click', () => this.toggleScreenShare());
    document.getElementById('live-chat-btn')?.addEventListener('click', () => this.toggleChat());
    document.getElementById('live-end-btn')?.addEventListener('click', () => this.endSession());

    if (!navigator.mediaDevices?.getDisplayMedia) {
      const shareBtn = document.getElementById('live-share-btn');
      if (shareBtn) { shareBtn.disabled = true; shareBtn.classList.add('unsupported'); }
    }

    this.startSessionTimer();
  },

  updateParticipantGrid() {
    const gridEl = document.getElementById('live-participant-grid');
    if (!gridEl) return;

    const parts = Object.values(this.participants);
    const count = parts.length;

    let gridClass = 'grid-1';
    if (count === 2) gridClass = 'grid-2';
    else if (count <= 4) gridClass = 'grid-4';
    else if (count <= 6) gridClass = 'grid-6';
    else gridClass = 'grid-9';

    gridEl.className = `live-participant-grid ${gridClass}`;

    gridEl.innerHTML = parts.map(p => {
      const isLocal = p.local;
      const name = p.user_name || 'Participant';
      const hasVideo = p.tracks?.video;
      const hasAudio = p.tracks?.audio;
      return `
        <div class="live-participant-tile ${isLocal ? 'local' : ''}" data-participant-id="${p.session_id}">
          <video id="video-${p.session_id}" autoplay playsinline ${isLocal ? 'muted' : ''}></video>
          <div class="live-participant-info">
            <span class="live-participant-name">${esc(name)}${isLocal ? ' (You)' : ''}</span>
            ${!hasAudio ? '<span class="live-mute-indicator">Muted</span>' : ''}
          </div>
        </div>
      `;
    }).join('');

    parts.forEach(p => {
      const videoEl = document.getElementById(`video-${p.session_id}`);
      if (videoEl && p.tracks?.video?.track) {
        videoEl.srcObject = new MediaStream([p.tracks.video.track]);
        videoEl.play?.().catch(() => {});
      }
    });
  },

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

  async loadChatMessages(requestId) {
    const { data } = await supabase
      .from('live_chat_messages')
      .select('*, profiles:profiles!user_id(full_name)')
      .eq('room_id', requestId)
      .order('created_at', { ascending: true })
      .limit(50);

    this.chatMessages = data || [];
    this.renderChatMessages();
  },

  startChatPolling(requestId) {
    if (this.chatPollInterval) clearInterval(this.chatPollInterval);
    this.chatPollInterval = setInterval(() => this.loadChatMessages(requestId), 3000);
  },

  renderChatMessages() {
    const container = document.getElementById('live-chat-messages');
    if (!container) return;

    container.innerHTML = this.chatMessages.map(msg => {
      const isOwn = msg.user_id === store.user.id;
      const name = msg.profiles?.full_name || 'Unknown';
      const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="live-chat-message ${isOwn ? 'own' : ''}">
          <div class="live-chat-message-header">
            <strong>${esc(name)}</strong>
            <span class="live-chat-message-time">${time}</span>
          </div>
          <div class="live-chat-message-content">${esc(msg.content)}</div>
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
  },

  toggleChat() {
    const panel = document.getElementById('live-chat-panel');
    if (!panel) return;
    this.chatOpen = !this.chatOpen;
    panel.style.display = this.chatOpen ? 'flex' : 'none';
  },

  async sendChatMessage() {
    const input = document.getElementById('live-chat-input-field');
    if (!input) return;
    const content = input.value.trim();
    if (!content || !this.activeSession) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/live/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ roomId: this.activeSession.id, content: content.slice(0, 1000) })
      });

      const result = await response.json();
      if (result.ok) {
        input.value = '';
      } else {
        console.error('Failed to send chat message', result.error);
      }
    } catch (error) {
      console.error('Failed to send chat message', error);
    }
  },

  async toggleRoomLock() {
    const request = this.activeSession;
    if (!request || request.user_id !== store.user.id) return;

    const newLockState = !request.is_locked;
    await supabase
      .from('live_requests')
      .update({ is_locked: newLockState })
      .eq('id', request.id);

    request.is_locked = newLockState;
    this.renderBoard();
    this.renderSessionUI();
  },

  toggleMute(type) {
    if (!this.callObject) return;

    if (type === 'mic') {
      const current = this.callObject.localAudio();
      this.callObject.setLocalAudio(!current);
      const btn = document.getElementById('live-mute-mic-btn');
      if (btn) {
        btn.classList.toggle('mic-on', !current);
        btn.classList.toggle('mic-off', current);
      }
    } else if (type === 'cam') {
      const current = this.callObject.localVideo();
      this.callObject.setLocalVideo(!current);
      const btn = document.getElementById('live-mute-cam-btn');
      if (btn) {
        btn.classList.toggle('cam-on', !current);
        btn.classList.toggle('cam-off', current);
      }
    }
  },

  async flipCamera() {
    if (!this.callObject) return;
    try {
      const devices = await this.callObject.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');
      if (cameras.length < 2) return;

      const current = this.callObject.getInputDevices();
      const currentIdx = cameras.findIndex(c => c.deviceId === current.cameraId);
      const nextIdx = (currentIdx + 1) % cameras.length;

      await this.callObject.setInputDevicesAsync({ videoDeviceId: cameras[nextIdx].deviceId });
    } catch (error) {
      console.error('Failed to flip camera', error);
    }
  },

  async toggleScreenShare() {
    if (!this.callObject) return;

    if (this.callObject.localScreenAudio() || this.callObject.localScreenVideo()) {
      await this.callObject.stopScreenShare();
      document.getElementById('live-share-btn')?.classList.remove('sharing');
    } else {
      try {
        await this.callObject.startScreenShare();
        document.getElementById('live-share-btn')?.classList.add('sharing');
      } catch (error) {
        console.error('Failed to start screen share', error);
      }
    }
  },

  startSessionTimer() {
    if (this.sessionTimerInterval) return;
    const requestId = this.activeSession?.id;
    const tick = () => {
      if (this.sessionConnected) {
        this.liveSecs = (this.liveSecs || 0) + 1;
        const earned = Math.floor(this.liveSecs / 60) * GP_PER_MINUTE;
        if (earned > this.creditedGp) {
          if (requestId) this.sessionGpByRequest[requestId] = (this.sessionGpByRequest[requestId] || 0) + (earned - this.creditedGp);
          this.creditedGp = earned;
        }
      }
      const secs = this.liveSecs || 0;
      const el = document.getElementById('live-session-timer');
      if (el) el.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
      const gpEl = document.getElementById('live-session-gp');
      if (gpEl) gpEl.textContent = `+${(requestId && this.sessionGpByRequest[requestId]) || 0} GP`;
    };
    tick();
    this.sessionTimerInterval = setInterval(tick, 1000);
  },

  gpDueFor(requestId, connected) {
    const total = this.sessionGpByRequest[requestId] || 0;
    const paid = this.sessionGpPaidByRequest[requestId] || 0;
    let due = Math.max(0, total - paid);
    if (due === 0 && connected && paid === 0 && total === 0) due = MIN_CONNECTED_GP;
    return due;
  },

  claimDueGp(requestId, connected) {
    const due = this.gpDueFor(requestId, connected);
    if (due > 0) this.sessionGpPaidByRequest[requestId] = (this.sessionGpPaidByRequest[requestId] || 0) + due;
    return due;
  },

  async endSession() {
    const s = this.activeSession;
    if (!s) return;

    if (this.sessionRole === 'host') {
      const gpSoFar = this.gpDueFor(s.id, this.sessionConnected);
      const msg = this.sessionConnected
        ? `End this session for everyone?\n\nYou'll keep +${gpSoFar} GP earned so far.`
        : 'End this session for everyone?';
      const end = await appConfirm(msg, { okText: 'End session', danger: true });
      if (end) this.settleSession();
      return;
    }

    const gpSoFar = this.gpDueFor(s.id, this.sessionConnected);
    const leave = await appConfirm(
      this.sessionConnected
        ? `Leave this session?\nYou keep +${gpSoFar} GP earned so far.`
        : 'Leave this session?',
      { okText: 'Leave', danger: true }
    );
    if (leave) this.releaseSession(true);
  },

  endLive() {
    if (!this.sessionModalOpen) return;
    if (this.sessionSettled) { this.cleanupSession(); return; }
    if (this.sessionRole === 'host') this.settleSession();
    else this.releaseSession(true);
  },

  async releaseSession(award) {
    const s = this.activeSession;
    if (!s) return;
    const wasConnected = this.sessionConnected;
    this.sessionSettled = true;

    const count = s.participant_count || 1;
    await supabase
      .from('live_requests')
      .update({ participant_count: Math.max(0, count - 1) })
      .eq('id', s.id);

    if (award && wasConnected) {
      const gp = this.claimDueGp(s.id, true);
      if (gp > 0) {
        await supabase.rpc('add_gp', { target_user_id: store.user.id, points_to_add: gp });
        await this.recordOwnSessionTx(s, gp);
      }
    }

    if (this.callObject) await this.callObject.leave();
    this.cleanupSession();
  },

  async settleSession() {
    if (this.sessionSettled || !this.activeSession) return;
    this.sessionSettled = true;

    const s = this.activeSession;
    const gp = this.claimDueGp(s.id, this.sessionConnected);

    await supabase
      .from('live_requests')
      .update({ status: 'completed', completed_by: store.user.id, completed_at: new Date().toISOString() })
      .eq('id', s.id);

    if (s.room_id) await this.deleteDailyRoom(s.room_id);

    if (gp > 0) {
      await supabase.rpc('add_gp', { target_user_id: s.user_id, points_to_add: gp });
      await this.recordOwnSessionTx(s, gp);
    }

    if (this.callObject) await this.callObject.leave();
    this.finishSessionUI(gp);
  },

  async recordOwnSessionTx(s, gp) {
    if (!(gp > 0)) return;
    const key = 'gliimu_live_tx_' + s.id;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch (e) { /* storage unavailable */ }

    const isHost = s.user_id === store.user.id;
    await supabase.from('transactions').insert({
      user_id: store.user.id,
      amount: 0,
      points: gp,
      type: 'live_session',
      status: 'success',
      description: isHost ? `Live session hosted: ${s.title} (+${gp} GP)` : `Live session joined: ${s.title} (+${gp} GP)`
    });
  },

  finishSessionUI(gp) {
    const lines = ['Session complete!'];
    if (gp > 0) lines.push(`+${gp} GP earned.`);
    else lines.push('No GP this time.');
    this.cleanupSession();
    alert(lines.join('\n'));
  },

  setupSessionRealtime(id) {
    if (this.sessionChannel) supabase.removeChannel(this.sessionChannel);
    this.sessionChannel = supabase.channel('live-session-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_requests', filter: 'id=eq.' + id }, (payload) => this.handleSessionRowUpdate(payload.new))
      .subscribe();
  },

  async handleSessionRowUpdate(row) {
    if (!row || !this.activeSession || row.id !== this.activeSession.id) return;
    this.activeSession = { ...this.activeSession, ...row, profiles: this.activeSession.profiles };
    if (this.sessionSettled) return;

    if (row.status === 'completed') {
      this.sessionSettled = true;
      const gp = this.claimDueGp(row.id, this.sessionConnected);
      if (gp > 0) await this.recordOwnSessionTx(row, gp);
      if (this.callObject) await this.callObject.leave();
      this.finishSessionUI(gp);
    } else if (row.status === 'cancelled') {
      this.sessionSettled = true;
      if (this.callObject) await this.callObject.leave();
      this.cleanupSession();
      alert('This session was cancelled.');
    }
  },

  cleanupSession() {
    heartbeat.stop();
    heartbeat.setCurrentPost(null);
    if (this.sessionTimerInterval) { clearInterval(this.sessionTimerInterval); this.sessionTimerInterval = null; }
    if (this.chatPollInterval) { clearInterval(this.chatPollInterval); this.chatPollInterval = null; }
    if (this.callObject) { this.callObject.destroy(); this.callObject = null; }
    if (this.sessionChannel) { supabase.removeChannel(this.sessionChannel); this.sessionChannel = null; }
    this.participants = {};
    this.chatMessages = [];
    this.chatOpen = false;
    document.getElementById('live-session-overlay')?.remove();

    this.sessionModalOpen = false;
    this.sessionConnected = false;
    this.sessionSettled = false;
    this.activeSession = null;
    this.sessionRole = null;
    this.liveSecs = 0;
    this.creditedGp = 0;

    this.loadBoard();
  }
};

export default liveView;
