import { supabase, API_BASE_URL } from '/shared/js/config.js';
import { store } from '../store.js?v=2';
import * as heartbeat from '../heartbeat.js?v=3';

const MIN_GP_TO_HOST = 1500;
const MAX_SESSION_DURATION = 60 * 60 * 1000; // 1 hour in ms
const GP_PER_MINUTE = 1;

const ICONS = {
  video: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>',
  videoOff: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>',
  mic: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>',
  micOff: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>',
  users: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
  chat: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
  hand: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 11V6a2 2 0 0 0-4 0v1M14 7V4a2 2 0 0 0-4 0v6M10 10V3a2 2 0 0 0-4 0v11M18 11a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-2c-2.5 0-4.5-1-6.2-2.8L3 15.2a2 2 0 0 1 2.8-2.8L6 13V6"></path></svg>',
  screen: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
  record: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"></circle></svg>',
  close: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
  plus: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
  lock: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>'
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const liveView = {
  // State
  activeSession: null,
  sessionRole: null, // 'host' | 'participant'
  publicSessions: [],
  joiningSession: false, // Guard against rapid join attempts
  
  // Daily.co
  callObject: null,
  participantTiles: new Map(),
  participantsMap: new Map(),
  
  // UI state
  chatOpen: false,
  chatMessages: [],
  chatPollInterval: null,
  participantsPanelOpen: false,
  
  // Session controls
  isRecording: false,
  screenSharePermissionGranted: new Set(),
  
  // Billing
  sessionTimerInterval: null,
  sessionStartTime: null,
  liveSecs: 0,
  billingSummary: null,
  
  // Realtime
  sessionChannel: null,

  template: `
    <div class="live-layout" id="live-container">
      <div id="live-landing"></div>
      <div id="live-session-view" style="display:none;"></div>
    </div>
  `,

  async init() {
    window.liveInstance = {
      loadPublicSessions: () => this.loadPublicSessions(),
      openHostModal: () => this.openHostModal(),
      closeHostModal: () => this.closeHostModal(),
      createSession: () => this.createSession(),
      joinSession: (id) => this.joinSession(id),
      joinPrivateSession: () => this.joinPrivateSession(),
      leaveSession: () => this.leaveSession(),
      endSession: () => this.endSession(),
      toggleCamera: () => this.toggleCamera(),
      toggleMic: () => this.toggleMic(),
      toggleChat: () => this.toggleChat(),
      toggleParticipantsPanel: () => this.toggleParticipantsPanel(),
      toggleHandRaise: () => this.toggleHandRaise(),
      sendChatMessage: () => this.sendChatMessage(),
      muteParticipant: (userId) => this.muteParticipant(userId),
      grantScreenShare: (userId) => this.grantScreenShare(userId),
      revokeScreenShare: (userId) => this.revokeScreenShare(userId),
      toggleRecording: () => this.toggleRecording(),
      isLiveActive: () => !!this.activeSession,
      endLive: () => this.forceEndLive()
    };

    await this.loadPublicSessions();
  },

  destroy() {
    if (this.callObject) {
      this.callObject.destroy();
      this.callObject = null;
    }
    if (this.sessionChannel) {
      supabase.removeChannel(this.sessionChannel);
      this.sessionChannel = null;
    }
    if (this.chatPollInterval) {
      clearInterval(this.chatPollInterval);
      this.chatPollInterval = null;
    }
    if (this.sessionTimerInterval) {
      clearInterval(this.sessionTimerInterval);
      this.sessionTimerInterval = null;
    }
    this.participantTiles.clear();
    this.participantsMap.clear();
    heartbeat.stop();
    heartbeat.setCurrentPost(null);
  },

  // ============================================
  // LANDING PAGE - Public Sessions List
  // ============================================
  
  async loadPublicSessions() {
    const landing = document.getElementById('live-landing');
    if (!landing) return;

    landing.innerHTML = '<div class="live-loading">Loading sessions...</div>';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        landing.innerHTML = '<div class="live-empty">Please sign in to view live sessions.</div>';
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/live/public-sessions`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to load sessions');
      }

      const result = await response.json();
      this.publicSessions = result.sessions || [];
      this.renderLanding();
    } catch (error) {
      console.error('Load sessions error:', error);
      landing.innerHTML = `<div class="live-error">Failed to load sessions: ${error.message}</div>`;
    }
  },

  renderLanding() {
    const landing = document.getElementById('live-landing');
    if (!landing) return;

    const canHost = (store.profile?.total_gp || 0) >= MIN_GP_TO_HOST && store.profile?.verification_badge;

    let html = `
      <div class="live-header">
        <h2>Live Sessions</h2>
        ${canHost ? `<button class="btn-primary" onclick="liveInstance.openHostModal()">${ICONS.plus} Host Session</button>` : ''}
      </div>
    `;

    if (this.publicSessions.length === 0) {
      html += '<div class="live-empty">No active sessions. Be the first to host!</div>';
    } else {
      html += '<div class="live-sessions-grid">';
      for (const session of this.publicSessions) {
        html += `
          <div class="live-session-card">
            <div class="live-session-card-header">
              <h3>${esc(session.title)}</h3>
              ${session.is_private ? ICONS.lock : ''}
            </div>
            ${session.description ? `<p class="live-session-card-desc">${esc(session.description)}</p>` : ''}
            <div class="live-session-card-meta">
              <span class="live-session-card-host">Host: ${esc(session.host_name || 'Unknown')}</span>
              <span class="live-session-card-participants">${ICONS.users} ${session.participant_count || 0}</span>
            </div>
            <button class="btn-primary live-session-card-join" onclick="liveInstance.joinSession('${session.id}')">
              Join Session
            </button>
          </div>
        `;
      }
      html += '</div>';
    }

    landing.innerHTML = html;
  },

  openHostModal() {
    const modal = document.createElement('div');
    modal.id = 'live-host-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close" onclick="liveInstance.closeHostModal()">${ICONS.close}</button>
        <h3>Host a Live Session</h3>
        <div class="form-group">
          <label>Session Title</label>
          <input type="text" id="live-host-title" class="input" maxlength="60" placeholder="e.g. UI Design Workshop" required>
        </div>
        <div class="form-group">
          <label>Description (optional)</label>
          <textarea id="live-host-desc" class="input" rows="3" maxlength="200" placeholder="What will you cover?"></textarea>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="live-host-private">
            <span>Private session (hidden from public list, auto-records)</span>
          </label>
        </div>
        <button class="btn-primary" style="width:100%;" onclick="liveInstance.createSession()">Create Session</button>
      </div>
    `;
    document.body.appendChild(modal);
  },

  closeHostModal() {
    document.getElementById('live-host-modal')?.remove();
  },

  async createSession() {
    if (this.joiningSession) return; // Prevent rapid clicks
    this.joiningSession = true;
    
    const title = document.getElementById('live-host-title')?.value?.trim();
    const description = document.getElementById('live-host-desc')?.value?.trim();
    const isPrivate = document.getElementById('live-host-private')?.checked || false;

    if (!title) {
      this.joiningSession = false;
      return alert('Please enter a session title.');
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data: request, error } = await supabase
        .from('live_requests')
        .insert({
          user_id: store.user.id,
          title: title.slice(0, 60),
          description: description ? description.slice(0, 200) : null,
          status: 'active',
          sharing_mode: 'general',
          is_private: isPrivate,
          participant_count: 1,
          started_at: new Date().toISOString(),
          hand_raises: {},
          screen_share_permissions: {}
        })
        .select()
        .single();

      if (error) throw error;

      // Create Daily.co room
      const response = await fetch(`${API_BASE_URL}/api/daily/create-room`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ requestId: request.id })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create room');

      await supabase
        .from('live_requests')
        .update({
          room_id: result.room_id,
          room_url: result.room_url
        })
        .eq('id', request.id);

      this.closeHostModal();
      
      // Enter as host
      this.activeSession = {
        ...request,
        room_url: result.room_url,
        room_id: result.room_id
      };
      this.sessionRole = 'host';
      this.enterSession();

    } catch (error) {
      console.error('Create session error:', error);
      alert('Failed to create session: ' + error.message);
    } finally {
      this.joiningSession = false;
    }
  },

  async joinSession(sessionId) {
    if (this.joiningSession) return; // Prevent rapid clicks
    this.joiningSession = true;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data: request, error } = await supabase
        .from('live_requests')
        .select('*')
        .eq('id', sessionId)
        .eq('status', 'active')
        .single();

      if (error || !request) {
        alert('Session not found or no longer active.');
        return;
      }

      // Increment participant count
      await supabase.rpc('increment_participant_count', { p_request_id: request.id });

      // Track for billing
      await fetch(`${API_BASE_URL}/api/live/join-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ requestId: request.id })
      });

      this.activeSession = request;
      this.sessionRole = 'participant';
      this.enterSession();

    } catch (error) {
      console.error('Join session error:', error);
      alert('Failed to join session.');
    } finally {
      this.joiningSession = false;
    }
  },

  async joinPrivateSession() {
    const code = prompt('Enter private session link or code:');
    if (!code) return;
    // TODO: Implement private session join via link/code
    alert('Private session join not yet implemented.');
  },

  // ============================================
  // SESSION UI
  // ============================================

  enterSession() {
    if (!this.activeSession) return;

    document.getElementById('live-landing').style.display = 'none';
    const sessionView = document.getElementById('live-session-view');
    sessionView.style.display = 'block';

    this.sessionStartTime = Date.now();
    this.liveSecs = 0;
    this.chatMessages = [];
    this.chatOpen = false;
    this.participantsPanelOpen = false;
    this.isRecording = false;
    this.screenSharePermissionGranted.clear();

    this.renderSessionUI();
    this.joinDailyCall(this.activeSession.room_url);
    this.startChatPolling(this.activeSession.id);
    this.setupSessionRealtime(this.activeSession.id);
    this.startSessionTimer();

    heartbeat.setCurrentPost(null);
    heartbeat.start();
  },

  renderSessionUI() {
    const sessionView = document.getElementById('live-session-view');
    if (!sessionView) return;

    const isHost = this.sessionRole === 'host';
    const s = this.activeSession;

    sessionView.innerHTML = `
      <div class="live-studio-container">
        <div class="live-video-area">
          <div id="live-participant-grid" class="live-participant-grid"></div>
          <div class="live-session-header">
            <h3>${esc(s.title)}</h3>
            <div class="live-session-meta">
              <span id="live-session-timer">60:00</span>
              <span id="live-session-billing">Loading...</span>
              ${isHost && this.isRecording ? `<span class="live-recording-indicator">${ICONS.record} Recording</span>` : ''}
            </div>
          </div>
        </div>

        <div class="live-controls-bar">
          <button class="live-ctrl-btn" id="live-camera-btn" title="Toggle camera">${ICONS.video}</button>
          <button class="live-ctrl-btn" id="live-mic-btn" title="Toggle mic">${ICONS.mic}</button>
          ${!isHost ? `<button class="live-ctrl-btn" id="live-hand-btn" title="Raise hand">${ICONS.hand}</button>` : ''}
          <button class="live-ctrl-btn" id="live-chat-btn" title="Toggle chat">${ICONS.chat}</button>
          ${isHost ? `<button class="live-ctrl-btn" id="live-participants-btn" title="Participants">${ICONS.users}</button>` : ''}
          ${isHost ? `<button class="live-ctrl-btn" id="live-record-btn" title="Toggle recording">${ICONS.record}</button>` : ''}
          <button class="live-ctrl-btn danger" id="live-leave-btn" title="${isHost ? 'End session' : 'Leave'}">${ICONS.close}</button>
        </div>

        <div id="live-chat-panel" class="live-chat-panel" style="display:none;">
          <div class="live-chat-header">
            <h4>Chat</h4>
            <button onclick="liveInstance.toggleChat()">${ICONS.close}</button>
          </div>
          <div id="live-chat-messages" class="live-chat-messages"></div>
          <div class="live-chat-input">
            <input type="text" id="live-chat-input" placeholder="Type a message..." maxlength="500" onkeypress="if(event.key==='Enter')liveInstance.sendChatMessage()">
            <button onclick="liveInstance.sendChatMessage()">Send</button>
          </div>
        </div>

        ${isHost ? `
          <div id="live-participants-panel" class="live-participants-panel" style="display:none;">
            <div class="live-participants-header">
              <h4>Participants</h4>
              <button onclick="liveInstance.toggleParticipantsPanel()">${ICONS.close}</button>
            </div>
            <div id="live-participants-list" class="live-participants-list"></div>
          </div>
        ` : ''}
      </div>
    `;

    // Attach event listeners
    document.getElementById('live-camera-btn')?.addEventListener('click', () => this.toggleCamera());
    document.getElementById('live-mic-btn')?.addEventListener('click', () => this.toggleMic());
    document.getElementById('live-hand-btn')?.addEventListener('click', () => this.toggleHandRaise());
    document.getElementById('live-chat-btn')?.addEventListener('click', () => this.toggleChat());
    document.getElementById('live-participants-btn')?.addEventListener('click', () => this.toggleParticipantsPanel());
    document.getElementById('live-record-btn')?.addEventListener('click', () => this.toggleRecording());
    document.getElementById('live-leave-btn')?.addEventListener('click', () => isHost ? this.endSession() : this.leaveSession());
  },

  // ============================================
  // Daily.co Integration
  // ============================================

  async joinDailyCall(roomUrl) {
    if (this.callObject) {
      await this.callObject.destroy();
      this.callObject = null;
    }

    this.callObject = window.DailyIframe.createCallObject({
      url: roomUrl,
      userName: store.profile?.full_name || 'User',
      userData: { user_id: store.user.id }
    });

    this.callObject
      .on('joined-meeting', () => {
        const local = this.callObject.participants().local;
        if (local) {
          this.addParticipantTile(local);
          // Explicitly attach local video track if available
          if (local.tracks?.video?.persistentTrack) {
            this.attachTrack(local.session_id, local.tracks.video.persistentTrack);
          }
        }
      })
      .on('participant-joined', (e) => {
        if (e.participant) this.addParticipantTile(e.participant);
      })
      .on('participant-left', (e) => {
        if (e.participant) this.removeParticipantTile(e.participant.session_id);
      })
      .on('track-started', (e) => {
        if (e.track && e.participant) this.attachTrack(e.participant.session_id, e.track);
      })
      .on('track-stopped', (e) => {
        if (e.track && e.participant) this.detachTrack(e.participant.session_id, e.track.kind);
      })
      .on('left-meeting', () => {
        this.cleanupSession();
      })
      .on('error', (e) => {
        console.error('Daily.co error:', e);
      });

    try {
      await this.callObject.startCamera();
      await this.callObject.join();
    } catch (error) {
      console.error('Failed to join call:', error);
      alert('Could not connect. Check camera/mic permissions.');
    }
  },

  addParticipantTile(p) {
    const grid = document.getElementById('live-participant-grid');
    if (!grid) return;

    const sessionId = p.session_id;
    if (this.participantTiles.has(sessionId)) return;

    this.participantsMap.set(sessionId, p);

    const tile = document.createElement('div');
    tile.className = `live-participant-tile${p.local ? ' local' : ''}`;
    tile.dataset.sessionId = sessionId;
    if (p.user_data?.user_id) tile.dataset.userId = p.user_data.user_id;

    const video = document.createElement('video');
    video.id = `video-${sessionId}`;
    video.autoplay = true;
    video.playsInline = true;
    if (p.local) video.muted = true;

    const info = document.createElement('div');
    info.className = 'live-participant-info';
    info.innerHTML = `<span>${esc(p.user_name || 'Participant')}${p.local ? ' (You)' : ''}</span>`;

    tile.appendChild(video);
    tile.appendChild(info);
    grid.appendChild(tile);

    this.participantTiles.set(sessionId, { tile, video, info });
    this.updateGridLayout();
  },

  removeParticipantTile(sessionId) {
    const entry = this.participantTiles.get(sessionId);
    if (entry) {
      entry.tile.remove();
      this.participantTiles.delete(sessionId);
      this.participantsMap.delete(sessionId);
      this.updateGridLayout();
    }
  },

  attachTrack(sessionId, track) {
    const entry = this.participantTiles.get(sessionId);
    if (!entry) return;

    if (track.kind === 'video') {
      try {
        entry.video.srcObject = new MediaStream([track]);
        entry.video.play?.().catch(() => {});
      } catch (err) {
        console.error('Attach video failed:', err);
      }
    }
  },

  detachTrack(sessionId, kind) {
    const entry = this.participantTiles.get(sessionId);
    if (!entry) return;

    if (kind === 'video') {
      entry.video.srcObject = null;
    }
  },

  updateGridLayout() {
    const grid = document.getElementById('live-participant-grid');
    if (!grid) return;

    const count = this.participantTiles.size;
    grid.className = 'live-participant-grid';
    if (count === 1) grid.classList.add('grid-1');
    else if (count === 2) grid.classList.add('grid-2');
    else if (count <= 4) grid.classList.add('grid-4');
    else if (count <= 6) grid.classList.add('grid-6');
    else grid.classList.add('grid-9');
  },

  // ============================================
  // Controls
  // ============================================

  toggleCamera() {
    if (!this.callObject) return;
    const current = this.callObject.localVideo();
    this.callObject.setLocalVideo(!current);
    const btn = document.getElementById('live-camera-btn');
    if (btn) {
      btn.innerHTML = !current ? ICONS.video : ICONS.videoOff;
      btn.classList.toggle('active', !current);
    }
  },

  toggleMic() {
    if (!this.callObject) return;
    const current = this.callObject.localAudio();
    this.callObject.setLocalAudio(!current);
    const btn = document.getElementById('live-mic-btn');
    if (btn) {
      btn.innerHTML = !current ? ICONS.mic : ICONS.micOff;
      btn.classList.toggle('active', !current);
    }
  },

  toggleChat() {
    this.chatOpen = !this.chatOpen;
    const panel = document.getElementById('live-chat-panel');
    if (panel) panel.style.display = this.chatOpen ? 'flex' : 'none';
  },

  toggleParticipantsPanel() {
    this.participantsPanelOpen = !this.participantsPanelOpen;
    const panel = document.getElementById('live-participants-panel');
    if (panel) panel.style.display = this.participantsPanelOpen ? 'block' : 'none';
    if (this.participantsPanelOpen) this.renderParticipantsList();
  },

  async toggleHandRaise() {
    // TODO: Implement hand raise
    alert('Hand raise feature coming soon.');
  },

  async muteParticipant(userId) {
    // TODO: Implement host mute participant
    alert('Mute participant feature coming soon.');
  },

  async grantScreenShare(userId) {
    // TODO: Implement screen share permission
    alert('Grant screen share feature coming soon.');
  },

  async revokeScreenShare(userId) {
    // TODO: Implement revoke screen share
    alert('Revoke screen share feature coming soon.');
  },

  async toggleRecording() {
    // TODO: Implement recording
    alert('Recording feature coming soon.');
  },

  // ============================================
  // Chat
  // ============================================

  async sendChatMessage() {
    const input = document.getElementById('live-chat-input');
    if (!input) return;
    const content = input.value.trim();
    if (!content || !this.activeSession) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/live/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ roomId: this.activeSession.id, content: content.slice(0, 1000) })
      });

      const result = await response.json();
      if (result.ok) {
        input.value = '';
        await this.loadChatMessages(this.activeSession.id);
      }
    } catch (error) {
      console.error('Send chat error:', error);
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
      console.error('Load chat error:', error);
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

  renderParticipantsList() {
    const list = document.getElementById('live-participants-list');
    if (!list) return;

    // TODO: Fetch actual participant list from server
    list.innerHTML = '<div class="live-loading">Loading participants...</div>';
  },

  // ============================================
  // Session Timer & Billing
  // ============================================

  startSessionTimer() {
    if (this.sessionTimerInterval) return;

    const tick = () => {
      if (!this.sessionStartTime) return;

      const elapsed = Date.now() - this.sessionStartTime;
      const remaining = MAX_SESSION_DURATION - elapsed;

      if (remaining <= 0) {
        alert('Session duration limit reached (1 hour). Session ending now.');
        if (this.sessionRole === 'host') {
          this.endSession();
        } else {
          this.leaveSession();
        }
        return;
      }

      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      const timerEl = document.getElementById('live-session-timer');
      if (timerEl) timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      this.liveSecs = Math.floor(elapsed / 1000);
      this.updateBillingDisplay();
    };

    tick();
    this.sessionTimerInterval = setInterval(tick, 1000);
  },

  async updateBillingDisplay() {
    // TODO: Fetch billing summary from server
    const billingEl = document.getElementById('live-session-billing');
    if (billingEl) {
      billingEl.textContent = this.sessionRole === 'host' ? 'Earning: G0.00' : 'Cost: G0.00';
    }
  },

  // ============================================
  // Realtime
  // ============================================

  setupSessionRealtime(id) {
    if (this.sessionChannel) supabase.removeChannel(this.sessionChannel);
    
    this.sessionChannel = supabase.channel('live-session-' + id)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_requests',
        filter: 'id=eq.' + id
      }, (payload) => {
        // Handle session updates
        console.log('Session updated:', payload.new);
      })
      .subscribe();
  },

  // ============================================
  // Leave / End Session
  // ============================================

  async leaveSession() {
    const confirm = await appConfirm('Leave this session?', { okText: 'Leave', danger: true });
    if (!confirm) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      await fetch(`${API_BASE_URL}/api/live/leave-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ requestId: this.activeSession.id })
      });

      await supabase.rpc('decrement_participant_count', { p_request_id: this.activeSession.id });

      if (this.callObject) await this.callObject.leave();
      this.cleanupSession();
    } catch (error) {
      console.error('Leave session error:', error);
    }
  },

  async endSession() {
    const confirm = await appConfirm('End this session for everyone?', { okText: 'End', danger: true });
    if (!confirm) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      await fetch(`${API_BASE_URL}/api/live/billing-finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ requestId: this.activeSession.id })
      });

      await supabase
        .from('live_requests')
        .update({
          status: 'completed',
          completed_by: store.user.id,
          completed_at: new Date().toISOString()
        })
        .eq('id', this.activeSession.id);

      if (this.activeSession.room_id) {
        await fetch(`${API_BASE_URL}/api/daily/delete-room`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ requestId: this.activeSession.id })
        });
      }

      if (this.callObject) await this.callObject.leave();
      this.cleanupSession();
    } catch (error) {
      console.error('End session error:', error);
    }
  },

  async forceEndLive() {
    if (!this.activeSession) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (this.sessionRole === 'host') {
        await fetch(`${API_BASE_URL}/api/live/billing-finalize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ requestId: this.activeSession.id })
        });

        await supabase
          .from('live_requests')
          .update({
            status: 'completed',
            completed_by: store.user.id,
            completed_at: new Date().toISOString()
          })
          .eq('id', this.activeSession.id);

        if (this.activeSession.room_id) {
          await fetch(`${API_BASE_URL}/api/daily/delete-room`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ requestId: this.activeSession.id })
          });
        }
      } else {
        await fetch(`${API_BASE_URL}/api/live/leave-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ requestId: this.activeSession.id })
        });

        await supabase.rpc('decrement_participant_count', { p_request_id: this.activeSession.id });
      }

      if (this.callObject) await this.callObject.leave();
      this.cleanupSession();
    } catch (error) {
      console.error('Force end live error:', error);
      this.cleanupSession();
    }
  },

  cleanupSession() {
    heartbeat.stop();
    heartbeat.setCurrentPost(null);

    if (this.sessionTimerInterval) {
      clearInterval(this.sessionTimerInterval);
      this.sessionTimerInterval = null;
    }
    if (this.chatPollInterval) {
      clearInterval(this.chatPollInterval);
      this.chatPollInterval = null;
    }
    if (this.callObject) {
      this.callObject.destroy();
      this.callObject = null;
    }
    if (this.sessionChannel) {
      supabase.removeChannel(this.sessionChannel);
      this.sessionChannel = null;
    }

    this.participantTiles.clear();
    this.participantsMap.clear();
    this.chatMessages = [];
    this.activeSession = null;
    this.sessionRole = null;

    document.getElementById('live-session-view').style.display = 'none';
    document.getElementById('live-landing').style.display = 'block';
    
    this.loadPublicSessions();
  }
};

export default liveView;
