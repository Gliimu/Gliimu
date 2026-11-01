import { supabase, API_BASE_URL } from '/shared/js/config.js';
import { store } from '../store.js?v=2';
import * as heartbeat from '../heartbeat.js?v=3';

const GP_PER_MINUTE = 1;
const MIN_GP_FOR_LIVE = 100;
const MAX_HOST_SESSIONS = 3;

const ICONS = {
  mic: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>',
  micOff: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>',
  cam: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>',
  camOff: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>',
  screen: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
  hand: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v1M14 7V4a2 2 0 0 0-4 0v6M10 10V3a2 2 0 0 0-4 0v11M18 11a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-2c-2.5 0-4.5-1-6.2-2.8L3 15.2a2 2 0 0 1 2.8-2.8L6 13V6"></path></svg>',
  chat: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
  end: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>',
  copy: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
  link: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
  check: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  close: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const liveView = {
  // Session state
  activeSession: null,
  sessionRole: null, // 'host' | 'participant'
  sessionModalOpen: false,
  sessionConnected: false,
  sessionSettled: false,

  // Daily.co
  callObject: null,
  participants: {},

  // Chat
  chatMessages: [],
  chatOpen: false,
  chatPollInterval: null,

  // Realtime
  sessionChannel: null,

  // Timer / GP / Billing
  sessionTimerInterval: null,
  billingInterval: null,
  liveSecs: 0,
  creditedGp: 0,
  sessionGpByRequest: {},
  sessionGpPaidByRequest: {},
  billingSummary: null,

  // Hand raises (host view): { userId: { name, raisedAt } }
  raisedHands: {},

  // Share modal
  shareModalOpen: false,

  template: `
    <div class="live-layout" id="live-container">
      <div id="live-landing">
        <div class="live-landing-card">
          <h2>Live Sessions</h2>
          <p>Join a session with a code, or host your own.</p>
          <div class="live-landing-actions">
            <button class="btn-primary live-landing-btn" onclick="liveInstance.openJoinModal()">
              ${ICONS.link}
              <span>Join session</span>
            </button>
            <button class="btn-secondary live-landing-btn" id="live-host-btn" onclick="liveInstance.openHostModal()">
              ${ICONS.cam}
              <span>Host session</span>
            </button>
          </div>
          <p class="live-landing-hint" id="live-landing-hint"></p>
        </div>
      </div>

      <div class="modal-overlay" id="live-join-modal" style="display:none;">
        <div class="modal-content live-code-modal">
          <button class="modal-close" onclick="liveInstance.closeJoinModal()">${ICONS.close}</button>
          <h3>Enter join code</h3>
          <p class="live-code-hint">Ask the host for the 6-character code.</p>
          <input type="text" id="live-join-code-input" class="input live-code-input" maxlength="6" placeholder="ABC123" autocomplete="off" spellcheck="false">
          <button class="btn-primary" style="width:100%;" onclick="liveInstance.joinByCode()">Join</button>
          <p class="live-code-error" id="live-join-error"></p>
        </div>
      </div>

      <div class="modal-overlay" id="live-host-modal" style="display:none;">
        <div class="modal-content">
          <button class="modal-close" onclick="liveInstance.closeHostModal()">${ICONS.close}</button>
          <h3>Start a Live Session</h3>
          <div class="form-group">
            <label>Topic</label>
            <input type="text" id="live-host-title" class="input" maxlength="60" placeholder="e.g. UI walkthrough">
          </div>
          <div class="form-group">
            <label>Details (optional)</label>
            <textarea id="live-host-desc" class="input" rows="3" maxlength="200" placeholder="What will you cover?"></textarea>
          </div>
          <button class="btn-primary" style="width:100%;" onclick="liveInstance.createSession()">Start session</button>
        </div>
      </div>

      <div class="modal-overlay" id="live-share-modal" style="display:none;">
        <div class="modal-content live-share-modal">
          <button class="modal-close" onclick="liveInstance.closeShareModal()">${ICONS.close}</button>
          <h3>Share this session</h3>
          <div class="live-share-row">
            <span class="live-share-label">Join code</span>
            <code class="live-share-code" id="live-share-code">------</code>
            <button class="btn-secondary btn-sm" onclick="liveInstance.copyShareCode()">${ICONS.copy} Copy</button>
          </div>
          <div class="live-share-row">
            <span class="live-share-label">Join link</span>
            <input type="text" class="input live-share-link" id="live-share-link" readonly>
            <button class="btn-secondary btn-sm" onclick="liveInstance.copyShareLink()">${ICONS.copy} Copy</button>
          </div>
          <button class="btn-primary" style="width:100%;margin-top:12px;" onclick="liveInstance.closeShareModal(); liveInstance.enterSession();">I'm ready, start</button>
        </div>
      </div>
    </div>
  `,

  async init(opts = {}) {
    this.embedded = !!opts.embedded;
    window.liveInstance = {
      openJoinModal: () => this.openJoinModal(),
      closeJoinModal: () => this.closeJoinModal(),
      joinByCode: () => this.joinByCode(),
      openHostModal: () => this.openHostModal(),
      closeHostModal: () => this.closeHostModal(),
      createSession: () => this.createSession(),
      closeShareModal: () => this.closeShareModal(),
      copyShareCode: () => this.copyShareCode(),
      copyShareLink: () => this.copyShareLink(),
      enterSession: () => this.enterSession(),
      toggleMute: (type) => this.toggleMute(type),
      toggleScreenShare: () => this.toggleScreenShare(),
      toggleHandRaise: () => this.toggleHandRaise(),
      dismissHand: (userId) => this.dismissHand(userId),
      toggleChat: () => this.toggleChat(),
      sendChatMessage: () => this.sendChatMessage(),
      endSession: () => this.endSession(),
      leaveSession: () => this.leaveSession()
    };

    await this.checkHostEligibility();
    this.renderLanding();
    this.handleRouteCode();
  },

  destroy() {
    if (this.sessionChannel) { supabase.removeChannel(this.sessionChannel); this.sessionChannel = null; }
    if (this.chatPollInterval) { clearInterval(this.chatPollInterval); this.chatPollInterval = null; }
    if (this.sessionTimerInterval) { clearInterval(this.sessionTimerInterval); this.sessionTimerInterval = null; }
    if (this.callObject) { this.callObject.destroy(); this.callObject = null; }
    document.getElementById('live-session-overlay')?.remove();
    heartbeat.stop();
    heartbeat.setCurrentPost(null);
  },

  async checkHostEligibility() {
    const btn = document.getElementById('live-host-btn');
    const hint = document.getElementById('live-landing-hint');
    const gp = store.profile?.total_gp || 0;
    const badge = store.profile?.verification_badge;

    if (!badge) {
      if (btn) { btn.disabled = true; btn.title = 'Only verified users can host.'; }
      if (hint) hint.textContent = 'Hosting requires a verification badge. Request one in Support.';
    } else if (gp < MIN_GP_FOR_LIVE) {
      if (btn) { btn.disabled = true; btn.title = `Need ${MIN_GP_FOR_LIVE} GP to host.`; }
      if (hint) hint.textContent = `Hosting requires at least ${MIN_GP_FOR_LIVE} GP.`;
    } else {
      if (hint) hint.textContent = '';
    }
  },

  renderLanding() {
    const landing = document.getElementById('live-landing');
    if (landing) landing.style.display = 'flex';
    document.getElementById('live-session-overlay')?.remove();
    this.sessionModalOpen = false;
    this.checkHostEligibility();
  },

  handleRouteCode() {
    const hash = window.location.hash || '';
    const match = hash.match(/[?&]code=([A-Za-z0-9]{6})/);
    if (match) {
      const code = match[1].toUpperCase();
      // Clear the code from the URL so refresh doesn't re-join
      window.location.hash = hash.replace(/[?&]code=[A-Za-z0-9]{6}/, '').replace(/\?$/, '');
      this.resolveAndJoin(code);
    }
  },

  openJoinModal() {
    document.getElementById('live-join-modal').style.display = 'flex';
    const input = document.getElementById('live-join-code-input');
    if (input) { input.value = ''; input.focus(); }
    const err = document.getElementById('live-join-error');
    if (err) err.textContent = '';
  },

  closeJoinModal() {
    document.getElementById('live-join-modal').style.display = 'none';
  },

  openHostModal() {
    const badge = store.profile?.verification_badge;
    const gp = store.profile?.total_gp || 0;
    if (!badge) return alert('Only verified users can host live sessions.');
    if (gp < MIN_GP_FOR_LIVE) return alert(`You need at least ${MIN_GP_FOR_LIVE} GP to host.`);

    const myCount = (this._myActiveHostCount || 0);
    if (myCount >= MAX_HOST_SESSIONS) return alert(`You can host up to ${MAX_HOST_SESSIONS} sessions at a time.`);

    document.getElementById('live-host-modal').style.display = 'flex';
    const t = document.getElementById('live-host-title');
    if (t) { t.value = ''; t.focus(); }
  },

  closeHostModal() {
    document.getElementById('live-host-modal').style.display = 'none';
  },

  async joinByCode() {
    const input = document.getElementById('live-join-code-input');
    const err = document.getElementById('live-join-error');
    if (!input) return;
    const code = input.value.trim().toUpperCase();
    if (code.length !== 6) {
      if (err) err.textContent = 'Code must be 6 characters.';
      return;
    }
    this.closeJoinModal();
    await this.resolveAndJoin(code);
  },

  async resolveAndJoin(code) {
    const err = document.getElementById('live-join-error');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return alert('Please sign in first.');

      const response = await fetch(`${API_BASE_URL}/api/live/resolve-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ code })
      });
      const result = await response.json();
      if (!response.ok || !result.session) {
        if (err) err.textContent = result.error || 'Could not find a session for that code.';
        else alert(result.error || 'Could not find a session for that code.');
        return;
      }

      const s = result.session;
      if (s.is_locked) return alert('This session is locked.');

      // Increment participant count (no cap)
      const { error: incErr } = await supabase.rpc('increment_participant_count', { p_request_id: s.id });
      if (incErr) {
        console.error('Join increment failed:', incErr);
        return alert('Could not join session.');
      }

      // Track participant for billing
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        await fetch(`${API_BASE_URL}/api/live/join-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authSession.access_token}` },
          body: JSON.stringify({ requestId: s.id })
        });
      } catch (e) { console.error('Join tracking error:', e); }

      // Notify host
      await supabase.from('notifications').insert({
        user_id: s.user_id,
        actor_id: store.user.id,
        kind: 'live',
        title: `${store.profile.full_name} joined your live session`
      }).catch(() => {});

      // Enter as participant
      this.activeSession = {
        id: s.id,
        user_id: s.user_id,
        title: s.title,
        description: s.description,
        status: s.status,
        sharing_mode: s.sharing_mode,
        room_url: s.room_url,
        room_id: s.room_id,
        is_locked: s.is_locked,
        participant_count: (s.participant_count || 0) + 1,
        hand_raises: {},
        host_name: s.host_name,
        host_avatar: s.host_avatar,
        join_code: code
      };
      this.sessionRole = 'participant';
      this.enterSession();
    } catch (e) {
      console.error('resolveAndJoin error:', e);
      alert('Could not join session.');
    }
  },

  async createSession() {
    const title = document.getElementById('live-host-title')?.value?.trim();
    const description = document.getElementById('live-host-desc')?.value?.trim();
    if (!title) return alert('Please enter a topic.');

    this.closeHostModal();

    // Insert live_requests row (status open, no room yet)
    const { data: request, error } = await supabase
      .from('live_requests')
      .insert({
        user_id: store.user.id,
        title: title.slice(0, 60),
        description: description ? description.slice(0, 200) : null,
        status: 'open',
        sharing_mode: 'general',
        invited_user_ids: [],
        participant_count: 1,
        hand_raises: {}
      })
      .select()
      .single();

    if (error) {
      console.error('Create session error:', error);
      return alert('Could not create session.');
    }

    // Ask server to create Daily room + generate join code
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/daily/create-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ requestId: request.id })
      });
      const result = await response.json();
      if (!response.ok || !result.room_url) {
        throw new Error(result.error || 'Failed to create room');
      }

      // Update local row with room info + code
      await supabase
        .from('live_requests')
        .update({ room_id: result.room_id, room_url: result.room_url, join_code: result.join_code, status: 'active' })
        .eq('id', request.id);

      // Track host as participant for billing
      try {
        await fetch(`${API_BASE_URL}/api/live/join-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ requestId: request.id })
        });
      } catch (e) { console.error('Host join tracking error:', e); }

      this.activeSession = {
        id: request.id,
        user_id: store.user.id,
        title: request.title,
        description: request.description,
        status: 'active',
        sharing_mode: 'general',
        room_url: result.room_url,
        room_id: result.room_id,
        join_code: result.join_code,
        is_locked: false,
        participant_count: 1,
        hand_raises: {}
      };
      this.sessionRole = 'host';
      this.openShareModal();
    } catch (e) {
      console.error('Create room error:', e);
      alert('Could not create video room. Please try again.');
      await supabase.from('live_requests').delete().eq('id', request.id);
    }
  },

  openShareModal() {
    const code = this.activeSession?.join_code;
    if (!code) return;
    const link = `${window.location.origin}${window.location.pathname}#/live?code=${code}`;
    document.getElementById('live-share-code').textContent = code;
    document.getElementById('live-share-link').value = link;
    document.getElementById('live-share-modal').style.display = 'flex';
    this.shareModalOpen = true;
  },

  closeShareModal() {
    document.getElementById('live-share-modal').style.display = 'none';
    this.shareModalOpen = false;
  },

  async copyShareCode() {
    const code = this.activeSession?.join_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      const btn = document.querySelector('.live-share-row .btn-secondary');
      if (btn) {
        const original = btn.innerHTML;
        btn.innerHTML = `${ICONS.check} Copied`;
        setTimeout(() => { btn.innerHTML = original; }, 1500);
      }
    } catch (e) { /* clipboard unavailable */ }
  },

  async copyShareLink() {
    const input = document.getElementById('live-share-link');
    if (!input) return;
    try {
      await navigator.clipboard.writeText(input.value);
      const btn = input.nextElementSibling;
      if (btn) {
        const original = btn.innerHTML;
        btn.innerHTML = `${ICONS.check} Copied`;
        setTimeout(() => { btn.innerHTML = original; }, 1500);
      }
    } catch (e) { /* clipboard unavailable */ }
  },

  enterSession() {
    if (!this.activeSession) return;
    const landing = document.getElementById('live-landing');
    if (landing) landing.style.display = 'none';
    this.sessionModalOpen = true;
    this.sessionSettled = false;
    this.sessionConnected = false;
    this.participants = {};
    this.chatMessages = [];
    this.chatOpen = false;
    this.raisedHands = {};
    this.liveSecs = 0;
    this.creditedGp = 0;
    this.billingSummary = null;
    this.lastBillingTick = null;

    this.renderSessionUI();
    this.joinDailyCall(this.activeSession.room_url);
    this.startChatPolling(this.activeSession.id);
    this.setupSessionRealtime(this.activeSession.id);
    this.startSessionTimer();

    heartbeat.setCurrentPost(null);
    heartbeat.start();
  },

  renderSessionUI() {
    document.getElementById('live-session-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'live-session-overlay';
    overlay.className = 'live-session-overlay';

    const s = this.activeSession;
    const isHost = this.sessionRole === 'host';
    const hostName = s.host_name || (isHost ? (store.profile?.full_name || 'You') : 'Host');

    overlay.innerHTML = `
      <div class="live-studio-container">
        <div class="live-video-main">
          <div id="live-participant-grid" class="live-participant-grid"></div>
          <div class="live-session-info">
            <h3>${esc(s.title)}</h3>
            <div class="live-session-meta">
              <span class="live-host-name">${esc(hostName)}</span>
              <span id="live-session-timer">00:00</span>
              <span id="live-session-gp">+0 GP</span>
            </div>
          </div>
          <div id="live-session-status" class="live-session-status" style="display:none;"></div>
        </div>
        <div class="live-controls">
          <button class="live-ctrl-btn mic-on" id="live-mute-mic-btn" title="Mute microphone">${ICONS.mic}</button>
          <button class="live-ctrl-btn cam-on" id="live-mute-cam-btn" title="Turn off camera">${ICONS.cam}</button>
          <button class="live-ctrl-btn" id="live-share-btn" title="Share screen">${ICONS.screen}</button>
          <button class="live-ctrl-btn" id="live-hand-btn" title="Raise hand">${ICONS.hand}</button>
          <button class="live-ctrl-btn" id="live-chat-btn" title="Toggle chat">${ICONS.chat}</button>
          ${isHost
            ? `<button class="live-ctrl-btn" id="live-show-code-btn" title="Show join code">${ICONS.link}</button>`
            : ''}
          <button class="live-ctrl-btn danger" id="live-end-btn" title="${isHost ? 'End session' : 'Leave session'}">${ICONS.end}</button>
        </div>
        <div id="live-hands-panel" class="live-hands-panel" style="display:none;"></div>
        <div id="live-chat-panel" class="live-chat-panel" style="display:none;">
          <div class="live-chat-header">
            <h4>Session Chat</h4>
            <button onclick="liveInstance.toggleChat()">${ICONS.close}</button>
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
    document.getElementById('live-share-btn')?.addEventListener('click', () => this.toggleScreenShare());
    document.getElementById('live-hand-btn')?.addEventListener('click', () => this.toggleHandRaise());
    document.getElementById('live-chat-btn')?.addEventListener('click', () => this.toggleChat());
    document.getElementById('live-show-code-btn')?.addEventListener('click', () => this.openShareModal());
    document.getElementById('live-end-btn')?.addEventListener('click', () => isHost ? this.endSession() : this.leaveSession());

    if (!navigator.mediaDevices?.getDisplayMedia) {
      const shareBtn = document.getElementById('live-share-btn');
      if (shareBtn) { shareBtn.disabled = true; shareBtn.classList.add('unsupported'); }
    }
  },

  async joinDailyCall(roomUrl) {
    if (this.callObject) {
      await this.callObject.destroy();
      this.callObject = null;
    }

    this.showSessionStatus('Joining session...');

    try {
      if (typeof requestDevicePermission === 'function') {
        await requestDevicePermission('camera microphone');
      }
    } catch (e) { /* permission modal may not exist */ }

    this.callObject = window.DailyIframe.createCallObject({
      url: roomUrl,
      userName: store.profile?.full_name || store.user?.full_name || 'Gliimait'
    });

    this.callObject
      .on('joined-meeting', async () => {
        this.sessionConnected = true;
        this.hideSessionStatus();
        const localParticipant = this.callObject.participants().local;
        console.log('[Live] joined-meeting, local participant:', localParticipant);
        if (localParticipant) {
          if (!localParticipant.user_name) {
            localParticipant.user_name = store.profile?.full_name || store.user?.full_name || 'You';
          }
          this.participants[localParticipant.session_id] = localParticipant;
          this.participants.local = localParticipant;
          console.log('[Live] Added local participant to map:', localParticipant.session_id);
        }
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
          let p = this.participants[e.participant.session_id];
          if (!p && e.participant.local) {
            p = this.participants.local;
          }
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
      await this.callObject.startCamera();
      await this.callObject.join();
    } catch (error) {
      console.error('Failed to join daily call', error);
      this.showSessionStatus('Could not connect. Check camera/mic permissions.');
    }
  },

  updateParticipantGrid() {
    const gridEl = document.getElementById('live-participant-grid');
    if (!gridEl) return;

    const parts = Object.values(this.participants);
    const screenSharer = parts.find(p => p.tracks?.screenVideo);

    let html = '';
    if ( screenSharer) {
      html += `<div class="live-screen-share" data-participant-id="${screenSharer.session_id}">
        <video id="screen-${screenSharer.session_id}" autoplay playsinline></video>
        <div class="live-screen-label">${esc(screenSharer.user_name || 'Participant')} is sharing</div>
      </div>`;
    }

    const tiles = parts.filter(p => p !== screenSharer);
    html += `<div class="live-tiles-row">${tiles.map(p => {
      const isLocal = p.local;
      const name = p.user_name || 'Participant';
      const hasVideo = p.tracks?.video;
      const hasRaised = this.isHandRaised(p.user_id);
      return `
        <div class="live-participant-tile ${isLocal ? 'local' : ''} ${hasRaised ? 'raised' : ''}" data-participant-id="${p.session_id}">
          <video id="video-${p.session_id}" autoplay playsinline ${isLocal ? 'muted' : ''}></video>
          <div class="live-participant-info">
            <span class="live-participant-name">${esc(name)}${isLocal ? ' (You)' : ''}</span>
            ${hasRaised ? `<span class="live-raise-indicator" title="Hand raised">${ICONS.hand}</span>` : ''}
            ${p.tracks && !p.tracks.audio ? '<span class="live-mute-indicator">Muted</span>' : ''}
          </div>
        </div>
      `;
    }).join('')}</div>`;

    gridEl.innerHTML = html;

    // Attach screen share track
    if (screenSharer) {
      const screenEl = document.getElementById(`screen-${screenSharer.session_id}`);
      if (screenEl && screenSharer.tracks?.screenVideo?.track) {
        screenEl.srcObject = new MediaStream([screenSharer.tracks.screenVideo.track]);
        screenEl.play?.().catch(() => {});
      }
    }

    // Attach video tracks
    parts.forEach(p => {
      const videoEl = document.getElementById(`video-${p.session_id}`);
      console.log('[Live] Attaching video track for participant:', p.session_id, 'local:', p.local, 'hasVideo:', !!p.tracks?.video?.track, 'videoEl:', !!videoEl);
      if (videoEl && p.tracks?.video?.track) {
        try {
          const stream = new MediaStream([p.tracks.video.track]);
          videoEl.srcObject = stream;
          videoEl.play?.().catch(e => console.warn('[Live] Video play failed:', e));
          console.log('[Live] Video track attached successfully');
        } catch (err) {
          console.error('[Live] Failed to attach video track:', err);
        }
      }
    });

    this.renderHandsPanel();
  },

  isHandRaised(userId) {
    return !!(this.raisedHands && userId && this.raisedHands[userId]);
  },

  renderHandsPanel() {
    const panel = document.getElementById('live-hands-panel');
    if (!panel) return;
    const isHost = this.sessionRole === 'host';
    const raised = Object.entries(this.raisedHands || {});
    if (!raised.length) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }
    panel.style.display = 'block';
    panel.innerHTML = `
      <div class="live-hands-header">
        <span>${raised.length} hand${raised.length === 1 ? '' : 's'} raised</span>
      </div>
      <div class="live-hands-list">
        ${raised.map(([uid, info]) => `
          <div class="live-hand-row">
            <span>${esc(info.name || 'Participant')}</span>
            ${isHost ? `<button class="btn-secondary btn-sm" onclick="liveInstance.dismissHand('${uid}')">Dismiss</button>` : ''}
          </div>
        `).join('')}
      </div>
    `;
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

  toggleMute(type) {
    if (!this.callObject) return;
    if (type === 'mic') {
      const current = this.callObject.localAudio();
      this.callObject.setLocalAudio(!current);
      const btn = document.getElementById('live-mute-mic-btn');
      if (btn) {
        btn.classList.toggle('mic-on', !current);
        btn.classList.toggle('mic-off', current);
        btn.innerHTML = !current ? ICONS.mic : ICONS.micOff;
        btn.title = !current ? 'Mute microphone' : 'Unmute microphone';
      }
    } else if (type === 'cam') {
      const current = this.callObject.localVideo();
      this.callObject.setLocalVideo(!current);
      const btn = document.getElementById('live-mute-cam-btn');
      if (btn) {
        btn.classList.toggle('cam-on', !current);
        btn.classList.toggle('cam-off', current);
        btn.innerHTML = !current ? ICONS.cam : ICONS.camOff;
        btn.title = !current ? 'Turn off camera' : 'Turn on camera';
      }
    }
  },

  async toggleScreenShare() {
    if (!this.callObject) return;
    if (this.callObject.localScreenVideo()) {
      try {
        await this.callObject.stopScreenShare();
        document.getElementById('live-share-btn')?.classList.remove('sharing');
      } catch (e) { console.error('Stop screen share failed:', e); }
    } else {
      try {
        await this.callObject.startScreenShare();
        document.getElementById('live-share-btn')?.classList.add('sharing');
      } catch (e) { console.error('Start screen share failed:', e); }
    }
  },

  async toggleHandRaise() {
    const s = this.activeSession;
    if (!s) return;
    const currentlyRaised = this.isHandRaised(store.user.id);
    const newRaised = !currentlyRaised;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/live/hand-raise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ requestId: s.id, raised: newRaised })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Failed to toggle hand raise.');
      }
      const result = await response.json();
      this.raisedHands = this.normalizeHandRaises(result.hand_raises || {});
      const btn = document.getElementById('live-hand-btn');
      if (btn) {
        btn.classList.toggle('raised', newRaised);
        btn.title = newRaised ? 'Lower hand' : 'Raise hand';
      }
      this.updateParticipantGrid();
    } catch (e) {
      console.error('toggleHandRaise error:', e);
      alert(e.message || 'Could not change hand raise state.');
    }
  },

  async dismissHand(userId) {
    const s = this.activeSession;
    if (!s || this.sessionRole !== 'host') return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/live/hand-raise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ requestId: s.id, raised: false, targetUserId: userId })
      });
      if (!response.ok) throw new Error('Failed to dismiss hand.');
      const result = await response.json();
      this.raisedHands = this.normalizeHandRaises(result.hand_raises || {});
      this.updateParticipantGrid();
    } catch (e) {
      console.error('dismissHand error:', e);
      alert(e.message || 'Could not dismiss hand.');
    }
  },

  normalizeHandRaises(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [uid, ts] of Object.entries(raw)) {
      const participant = this.participants[uid] || Object.values(this.participants).find(p => p.user_id === uid);
      out[uid] = {
        raisedAt: ts,
        name: participant?.user_name || 'Participant'
      };
    }
    return out;
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
        await this.loadChatMessages(this.activeSession.id);
      } else {
        console.error('Failed to send chat message', result.error);
      }
    } catch (error) {
      console.error('Failed to send chat message', error);
    }
  },

  async loadChatMessages(requestId) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch(`${API_BASE_URL}/api/live/chat/${requestId}?limit=50`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!response.ok) return;
      const result = await response.json();
      this.chatMessages = result.messages || [];
      this.renderChatMessages();
    } catch (error) {
      console.error('Chat load error:', error);
    }
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
      const name = msg.profiles?.full_name || 'Participant';
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

  startSessionTimer() {
    if (this.sessionTimerInterval) return;
    const requestId = this.activeSession?.id;
    const isHost = this.sessionRole === 'host';
    let billingMinute = 0;

    const tick = () => {
      if (this.sessionConnected) {
        this.liveSecs = (this.liveSecs || 0) + 1;
        billingMinute++;

        // GP only accrues when there are participants present (not host alone)
        const participantCount = Object.keys(this.participants).length;
        const hasOthers = isHost ? participantCount > 1 : participantCount > 0;

        if (hasOthers) {
          const earned = Math.floor(this.liveSecs / 60) * GP_PER_MINUTE;
          if (earned > this.creditedGp) {
            if (requestId) this.sessionGpByRequest[requestId] = (this.sessionGpByRequest[requestId] || 0) + (earned - this.creditedGp);
            this.creditedGp = earned;
          }
        }

        // Every 60 seconds, trigger billing tick (host only) and refresh summary
        if (billingMinute >= 60) {
          billingMinute = 0;
          this.fetchBillingSummary();
          if (isHost && requestId) {
            this.triggerBillingTick(requestId);
          }
        }
      }
      const secs = this.liveSecs || 0;
      const el = document.getElementById('live-session-timer');
      if (el) el.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
      this.updateBillingDisplay();
    };
    tick();
    this.sessionTimerInterval = setInterval(tick, 1000);

    // Fetch initial billing summary
    this.fetchBillingSummary();
  },

  async triggerBillingTick(requestId) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${API_BASE_URL}/api/live/billing-tick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ requestId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.host_credit > 0) {
          this.lastBillingTick = data;
        }
      }
    } catch (e) { console.error('Billing tick error:', e); }
  },

  async fetchBillingSummary() {
    const requestId = this.activeSession?.id;
    if (!requestId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${API_BASE_URL}/api/live/billing-summary/${requestId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (res.ok) {
        this.billingSummary = await res.json();
      }
    } catch (e) { console.error('Billing summary error:', e); }
  },

  updateBillingDisplay() {
    const gpEl = document.getElementById('live-session-gp');
    if (!gpEl) return;
    const isHost = this.sessionRole === 'host';
    const requestId = this.activeSession?.id;
    const gp = (requestId && this.sessionGpByRequest[requestId]) || 0;

    if (isHost) {
      const hostEarned = this.billingSummary?.host_total_earned || 0;
      const rate = this.billingSummary?.rate || 1;
      const participants = this.billingSummary?.active_participants || 0;
      gpEl.textContent = `+G${Number(hostEarned).toFixed(1)} | ${participants} gliim${participants !== 1 ? 's' : ''} @ G${rate}/min`;
    } else {
      const myGp = this.billingSummary?.my_gp_earned || gp;
      const rate = this.billingSummary?.rate || 1;
      gpEl.textContent = `+${myGp} GP | -G${rate}/min`;
    }
  },

  setupSessionRealtime(id) {
    if (this.sessionChannel) supabase.removeChannel(this.sessionChannel);
    this.sessionChannel = supabase.channel('live-session-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_requests', filter: 'id=eq.' + id }, (payload) => this.handleSessionRowUpdate(payload.new))
      .subscribe();
  },

  async handleSessionRowUpdate(row) {
    if (!row || !this.activeSession || row.id !== this.activeSession.id) return;
    this.activeSession = { ...this.activeSession, ...row };

    // Update raised hands from realtime payload
    if (row.hand_raises !== undefined) {
      this.raisedHands = this.normalizeHandRaises(row.hand_raises);
      this.updateParticipantGrid();
    }

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

  gpDueFor(requestId, connected) {
    const total = this.sessionGpByRequest[requestId] || 0;
    const paid = this.sessionGpPaidByRequest[requestId] || 0;
    return Math.max(0, total - paid);
  },

  claimDueGp(requestId, connected) {
    const due = this.gpDueFor(requestId, connected);
    if (due > 0) this.sessionGpPaidByRequest[requestId] = (this.sessionGpPaidByRequest[requestId] || 0) + due;
    return due;
  },

  async recordOwnSessionTx(s, gp) {
    if (!(gp > 0)) return;
    const isHost = s.user_id === store.user.id;
    if (isHost) return; // Host earns Gliits via billing tick, not GP

    const key = 'gliimu_live_tx_' + s.id;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch (e) { /* storage unavailable */ }

    await supabase.from('transactions').insert({
      user_id: store.user.id,
      amount: 0,
      points: gp,
      type: 'live_session',
      status: 'success',
      description: `Live session attended: ${s.title} (+${gp} GP)`
    });
  },

  finishSessionUI(gp) {
    const isHost = this.sessionRole === 'host';
    const lines = ['Session complete!'];
    if (isHost) {
      const hostEarned = this.billingSummary?.host_total_earned || 0;
      if (hostEarned > 0) lines.push(`G${Number(hostEarned).toFixed(1)} earned.`);
      else lines.push('No earnings this session.');
    } else {
      if (gp > 0) lines.push(`+${gp} GP earned.`);
      else lines.push('No GP this time.');
    }
    this.cleanupSession();
    alert(lines.join('\n'));
  },

  async endSession() {
    const s = this.activeSession;
    if (!s || this.sessionRole !== 'host') return;
    const hostEarned = this.billingSummary?.host_total_earned || 0;
    const msg = this.sessionConnected
      ? `End this session for everyone?\n\nYou earned G${Number(hostEarned).toFixed(1)} so far.`
      : 'End this session for everyone?';
    const end = await appConfirm(msg, { okText: 'End session', danger: true });
    if (!end) return;

    // Finalize billing
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${API_BASE_URL}/api/live/billing-finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ requestId: s.id })
      });
    } catch (e) { console.error('Billing finalize error:', e); }

    await supabase
      .from('live_requests')
      .update({ status: 'completed', completed_by: store.user.id, completed_at: new Date().toISOString() })
      .eq('id', s.id);

    if (s.room_id) await this.deleteDailyRoom(s.room_id);

    if (this.callObject) await this.callObject.leave();
    this.finishSessionUI(0);
  },

  async leaveSession() {
    const s = this.activeSession;
    if (!s) return;
    const gpSoFar = this.gpDueFor(s.id, this.sessionConnected);
    const leave = await appConfirm(
      this.sessionConnected
        ? `Leave this session?\nYou keep +${gpSoFar} GP earned so far.`
        : 'Leave this session?',
      { okText: 'Leave', danger: true }
    );
    if (!leave) return;

    // Track leave for billing
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${API_BASE_URL}/api/live/leave-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ requestId: s.id })
      });
    } catch (e) { console.error('Leave tracking error:', e); }

    await supabase.rpc('decrement_participant_count', { p_request_id: s.id });

    const gp = this.claimDueGp(s.id, this.sessionConnected);
    if (gp > 0) {
      await supabase.rpc('add_gp', { target_user_id: store.user.id, points_to_add: gp });
      await this.recordOwnSessionTx(s, gp);
    }

    if (this.callObject) await this.callObject.leave();
    this.cleanupSession();
  },

  async deleteDailyRoom(roomId) {
    try {
      const request = this.activeSession;
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

  cleanupSession() {
    heartbeat.stop();
    heartbeat.setCurrentPost(null);
    if (this.sessionTimerInterval) { clearInterval(this.sessionTimerInterval); this.sessionTimerInterval = null; }
    if (this.billingInterval) { clearInterval(this.billingInterval); this.billingInterval = null; }
    if (this.chatPollInterval) { clearInterval(this.chatPollInterval); this.chatPollInterval = null; }
    if (this.callObject) { this.callObject.destroy(); this.callObject = null; }
    if (this.sessionChannel) { supabase.removeChannel(this.sessionChannel); this.sessionChannel = null; }
    this.participants = {};
    this.chatMessages = [];
    this.chatOpen = false;
    this.raisedHands = {};
    this.billingSummary = null;
    this.lastBillingTick = null;
    document.getElementById('live-session-overlay')?.remove();

    this.sessionModalOpen = false;
    this.sessionConnected = false;
    this.sessionSettled = false;
    this.activeSession = null;
    this.sessionRole = null;
    this.liveSecs = 0;
    this.creditedGp = 0;

    this.renderLanding();
  }
};

export default liveView;
