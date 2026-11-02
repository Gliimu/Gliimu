import { supabase, API_BASE_URL } from '/shared/js/config.js';
import { store } from '../store.js?v=2';
import * as heartbeat from '../heartbeat.js?v=3';
import { uploadAttachment } from '../media.js?v=2';

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
  lock: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
  share: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>',
  copy: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
  flip: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>',
  userX: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="18" y1="8" x2="23" y2="13"></line><line x1="23" y1="8" x2="18" y2="13"></line></svg>',
  flag: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>'
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
  focusedSessionId: null,
  
  // UI state
  chatOpen: false,
  chatMessages: [],
  chatPollInterval: null,
  chatErrorCount: 0,

  // Session controls
  isRecording: false,
  screenSharing: false,
  screenSharePermissionGranted: new Set(),
  
  // Billing
  sessionTimerInterval: null,
  sessionStartTime: null,
  liveSecs: 0,
  billingSummary: null,
  
  // Realtime
  sessionChannel: null,

  template: `
    <div id="live-container">
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
      sendChatMessage: () => this.sendChatMessage(),
      handleChatFile: (ev) => this.handleChatFile(ev),
      clearAttachmentPreview: () => this.clearAttachmentPreview(),
      muteParticipantAudio: (sessionId) => this.muteParticipantAudio(sessionId),
      muteParticipantVideo: (sessionId) => this.muteParticipantVideo(sessionId),
      reportLiveSession: () => this.reportLiveSession(),
      grantScreenShare: (userId) => this.grantScreenShare(userId),
      revokeScreenShare: (userId) => this.revokeScreenShare(userId),
      toggleScreenShare: () => this.toggleScreenShare(),
      sharePrivateLink: () => this.sharePrivateLink(),
      isLiveActive: () => !!this.activeSession,
      endLive: () => this.forceEndLive()
    };

    await this.loadPublicSessions();

    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const joinId = params.get('join');
    if (joinId) {
      await this.joinSession(joinId);
    }
  },

  destroy() {
    document.body.classList.remove('live-studio-active');
    document.querySelectorAll('.live-ctx-overlay').forEach(o => o.remove());
    if (this.callObject) {
      this.callObject.destroy();
      this.callObject = null;
    }
    if (this.sessionChannel) {
      supabase.removeChannel(this.sessionChannel);
      this.sessionChannel = null;
    }
    this.stopChatPolling();
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
        body: JSON.stringify({ requestId: request.id, isPrivate })
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
      
      // Fetch owner meeting token so host can control participants
      this.hostMeetingToken = null;
      if (result.room_id) {
        try {
          const tokenRes = await fetch(`${API_BASE_URL}/api/daily/meeting-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ roomId: result.room_id })
          });
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            this.hostMeetingToken = tokenData.token;
          } else {
            console.warn('Failed to get host meeting token:', await tokenRes.text());
          }
        } catch (tokenError) {
          console.warn('Error fetching host token:', tokenError);
        }
      }

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
      this.sessionRole = (request.user_id === store.user.id) ? 'host' : 'participant';

      // Host needs owner token to control participants
      if (this.sessionRole === 'host' && request.room_id) {
        try {
          const tokenRes = await fetch(`${API_BASE_URL}/api/daily/meeting-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ roomId: request.room_id })
          });
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            this.hostMeetingToken = tokenData.token;
          } else {
            console.warn('Failed to get host meeting token:', await tokenRes.text());
          }
        } catch (tokenError) {
          console.warn('Error fetching host token:', tokenError);
        }
      }

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
    this.focusedSessionId = null;
    this.isRecording = false;
    this.screenSharePermissionGranted.clear();

    document.body.classList.add('live-studio-active');
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
    const isPrivate = s.is_private;
    const mobile = window.innerWidth <= 768;

    sessionView.innerHTML = `
      <div class="live-studio-container">
        <div class="live-session-header">
          <h3>${esc(s.title)} ${isPrivate ? '<span class="live-private-badge">' + ICONS.lock + ' Private</span>' : ''}</h3>
          <div class="live-session-meta">
            <span id="live-session-timer">60:00</span>
            <span id="live-session-billing">Loading...</span>
          </div>
        </div>

        <div class="live-video-area">
          <div class="live-stage">
            <video id="live-stage-video" autoplay playsinline muted></video>
            <div class="live-stage-empty" id="live-stage-empty">Waiting for video&hellip;</div>
            <div class="live-stage-info" id="live-stage-info"></div>
          </div>
          <div class="live-participant-rail" id="live-participant-rail"></div>
        </div>

        <div class="live-controls-bar">
          <button class="live-ctrl-btn" id="live-camera-btn" title="Toggle camera">${ICONS.video}</button>
          <button class="live-ctrl-btn" id="live-mic-btn" title="Toggle mic">${ICONS.mic}</button>
          ${mobile
            ? `<button class="live-ctrl-btn" id="live-flip-btn" title="Switch camera">${ICONS.flip}</button>`
            : `<button class="live-ctrl-btn" id="live-screen-btn" title="Share screen">${ICONS.screen}</button>`}
          <button class="live-ctrl-btn" id="live-chat-btn" title="Toggle chat">${ICONS.chat}</button>
          ${isHost && isPrivate ? `<button class="live-ctrl-btn" id="live-share-btn" title="Copy invite link">${ICONS.share}</button>` : ''}
          <button class="live-ctrl-btn danger" id="live-leave-btn" title="${isHost ? 'End session' : 'Leave'}">${ICONS.close}</button>
        </div>

        <div id="live-chat-panel" class="live-chat-panel" style="display:none;">
          <div class="live-chat-header">
            <h4>Chat</h4>
            <button onclick="liveInstance.toggleChat()">${ICONS.close}</button>
          </div>
          <div id="live-chat-messages" class="live-chat-messages"></div>
          <div class="live-chat-input">
            <input type="file" id="live-chat-file" style="display:none" accept="image/*,.pdf,.epub,.doc,.docx" onchange="liveInstance.handleChatFile(event)">
            <button class="live-chat-attach-btn" onclick="document.getElementById('live-chat-file').click()" title="Attach file">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
            </button>
            <input type="text" id="live-chat-input" placeholder="Type a message..." maxlength="500" onkeypress="if(event.key==='Enter')liveInstance.sendChatMessage()">
            <button onclick="liveInstance.sendChatMessage()">Send</button>
          </div>
        </div>
      </div>
    `;

    // Attach event listeners
    document.getElementById('live-camera-btn')?.addEventListener('click', () => this.toggleCamera());
    document.getElementById('live-mic-btn')?.addEventListener('click', () => this.toggleMic());
    document.getElementById('live-screen-btn')?.addEventListener('click', () => this.toggleScreenShare());
    document.getElementById('live-flip-btn')?.addEventListener('click', () => this.flipCamera());
    document.getElementById('live-chat-btn')?.addEventListener('click', () => this.toggleChat());
    document.getElementById('live-share-btn')?.addEventListener('click', () => this.sharePrivateLink());
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
      .on('active-speaker-change', (e) => {
        if (e.participant) this.setActiveSpeaker(e.participant.session_id);
        else this.setActiveSpeaker(null);
      })
      .on('left-meeting', () => {
        this.cleanupSession();
      })
      .on('error', (e) => {
        console.error('Daily.co error:', e);
      });

    try {
      await this.callObject.startCamera();
      const joinOptions = this.hostMeetingToken ? { token: this.hostMeetingToken } : {};
      await this.callObject.join(joinOptions);
    } catch (error) {
      console.error('Failed to join call:', error);
      alert('Could not connect. Check camera/mic permissions.');
    }
  },

  addParticipantTile(p) {
    const rail = document.getElementById('live-participant-rail');
    if (!rail) return;

    const sessionId = p.session_id;
    if (this.participantTiles.has(sessionId)) return;

    this.participantsMap.set(sessionId, p);

    const hostId = this.activeSession?.user_id;
    const isHost = !!(p.user_data?.user_id && hostId && p.user_data.user_id === hostId);
    const name = p.user_name || (p.local ? 'You' : 'Participant');

    const tile = document.createElement('div');
    tile.className = `live-participant-tile${p.local ? ' local' : ''}${isHost ? ' host' : ''}`;
    tile.dataset.sessionId = sessionId;
    if (p.user_data?.user_id) tile.dataset.userId = p.user_data.user_id;
    tile.title = name;
    tile.addEventListener('click', () => this.setFocus(sessionId));

    const video = document.createElement('video');
    video.id = `video-${sessionId}`;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;

    // Separate audio element: video is always muted so its audio track never
    // plays through it, and remote audio is routed here instead.
    const audio = document.createElement('audio');
    audio.id = `audio-${sessionId}`;
    audio.autoplay = true;
    if (p.local) audio.muted = true;

    const info = document.createElement('div');
    info.className = 'live-participant-info';
    info.innerHTML = `<span>${esc(name)}${p.local ? ' (You)' : ''}</span>`;

    tile.appendChild(video);
    tile.appendChild(audio);
    tile.appendChild(info);

    if (isHost) {
      const badge = document.createElement('div');
      badge.className = 'live-host-badge';
      badge.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg><span>Host</span>';
      tile.appendChild(badge);
    }

    // Right-click (desktop) / long-press (mobile) context menu on remote tiles
    if (!p.local) {
      tile.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.showTileContextMenu(sessionId, ev.clientX, ev.clientY);
      });

      let lpTimer = null;
      tile.addEventListener('touchstart', (ev) => {
        const t = ev.touches[0];
        lpTimer = setTimeout(() => {
          lpTimer = null;
          this.showTileContextMenu(sessionId, t.clientX, t.clientY);
        }, 500);
      }, { passive: true });
      tile.addEventListener('touchend', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
      tile.addEventListener('touchmove', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }, { passive: true });
    }

    rail.appendChild(tile);

    this.participantTiles.set(sessionId, {
      tile, video, audio, info,
      local: !!p.local, isHost, name,
      videoTrack: null, audioTrack: null
    });

    // Default the stage to the host; otherwise focus the first tile we get.
    if (!this.focusedSessionId || isHost) {
      this.setFocus(sessionId);
    }
  },

  removeParticipantTile(sessionId) {
    const entry = this.participantTiles.get(sessionId);
    if (!entry) return;

    entry.tile.remove();
    this.participantTiles.delete(sessionId);
    this.participantsMap.delete(sessionId);

    if (this.focusedSessionId === sessionId) {
      this.focusedSessionId = null;
      this.pickNextFocus();
    }
  },

  pickNextFocus() {
    if (this.participantTiles.size === 0) {
      this.updateStage();
      return;
    }
    // Prefer the host, then the local user, then anyone.
    let next = null;
    for (const [id, e] of this.participantTiles) {
      if (e.isHost) { next = id; break; }
      if (e.local && !next) next = id;
    }
    if (!next) next = this.participantTiles.keys().next().value;
    this.setFocus(next);
  },

  setFocus(sessionId) {
    if (!this.participantTiles.has(sessionId)) return;
    this.focusedSessionId = sessionId;
    for (const [id, e] of this.participantTiles) {
      e.tile.classList.toggle('focused', id === sessionId);
    }
    this.updateStage();
  },

  updateStage() {
    const stageVideo = document.getElementById('live-stage-video');
    const stageInfo = document.getElementById('live-stage-info');
    const stageEmpty = document.getElementById('live-stage-empty');
    if (!stageVideo) return;

    const entry = this.focusedSessionId ? this.participantTiles.get(this.focusedSessionId) : null;
    if (entry && entry.videoTrack) {
      stageVideo.srcObject = new MediaStream([entry.videoTrack]);
      stageVideo.play?.().catch(() => {});
      if (stageEmpty) stageEmpty.style.display = 'none';
      stageVideo.classList.toggle('speaking', entry.tile.classList.contains('speaking'));
    } else {
      stageVideo.srcObject = null;
      if (stageEmpty) stageEmpty.style.display = 'flex';
    }
    if (stageInfo) {
      stageInfo.textContent = entry ? entry.name : '';
      stageInfo.style.display = entry ? 'flex' : 'none';
    }
  },

  setActiveSpeaker(sessionId) {
    for (const [id, e] of this.participantTiles) {
      e.tile.classList.toggle('speaking', id === sessionId);
    }
    const stageVideo = document.getElementById('live-stage-video');
    if (stageVideo) {
      stageVideo.classList.toggle('speaking', sessionId === this.focusedSessionId);
    }
  },

  attachTrack(sessionId, track) {
    const entry = this.participantTiles.get(sessionId);
    if (!entry) return;

    if (track.kind === 'video') {
      entry.videoTrack = track;
      try {
        entry.video.srcObject = new MediaStream([track]);
        entry.video.play?.().catch(() => {});
      } catch (err) {
        console.error('Attach video failed:', err);
      }
      if (sessionId === this.focusedSessionId) this.updateStage();
    } else if (track.kind === 'audio') {
      // Skip our own audio to avoid echo/feedback.
      if (entry.local) return;
      entry.audioTrack = track;
      try {
        entry.audio.srcObject = new MediaStream([track]);
        entry.audio.muted = false;
        const pr = entry.audio.play?.();
        if (pr && pr.catch) pr.catch((err) => console.warn('Audio autoplay blocked:', err));
      } catch (err) {
        console.error('Attach audio failed:', err);
      }
    }
  },

  detachTrack(sessionId, kind) {
    const entry = this.participantTiles.get(sessionId);
    if (!entry) return;

    if (kind === 'video') {
      entry.videoTrack = null;
      entry.video.srcObject = null;
      if (sessionId === this.focusedSessionId) this.updateStage();
    } else if (kind === 'audio') {
      entry.audioTrack = null;
      entry.audio.srcObject = null;
    }
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
      btn.classList.toggle('active', current);
    }
  },

  toggleMic() {
    if (!this.callObject) return;
    const current = this.callObject.localAudio();
    this.callObject.setLocalAudio(!current);
    const btn = document.getElementById('live-mic-btn');
    if (btn) {
      btn.innerHTML = !current ? ICONS.mic : ICONS.micOff;
      btn.classList.toggle('active', current);
    }
  },

  toggleChat() {
    this.chatOpen = !this.chatOpen;
    const panel = document.getElementById('live-chat-panel');
    if (panel) panel.style.display = this.chatOpen ? 'flex' : 'none';
  },

  muteParticipantAudio(sessionId) {
    if (this.sessionRole !== 'host' || !this.callObject) return;
    try {
      this.callObject.updateParticipant(sessionId, { setAudio: false });
    } catch (error) {
      console.error('Mute audio failed:', error);
    }
  },

  muteParticipantVideo(sessionId) {
    if (this.sessionRole !== 'host' || !this.callObject) return;
    try {
      this.callObject.updateParticipant(sessionId, { setVideo: false });
    } catch (error) {
      console.error('Mute video failed:', error);
    }
  },

  showTileContextMenu(sessionId, x, y) {
    const entry = this.participantTiles.get(sessionId);
    if (!entry) return;
    const isHost = this.sessionRole === 'host';
    const name = entry.name || 'this participant';

    document.querySelectorAll('.live-ctx-overlay').forEach(o => o.remove());

    const overlay = document.createElement('div');
    overlay.className = 'live-ctx-overlay';
    overlay.addEventListener('click', () => overlay.remove());

    const menu = document.createElement('div');
    menu.className = 'live-ctx-menu';
    menu.addEventListener('click', (ev) => ev.stopPropagation());

    const items = [];
    if (isHost && !entry.local) {
      items.push({
        icon: ICONS.micOff,
        label: 'Mute audio',
        action: () => { this.muteParticipantAudio(sessionId); overlay.remove(); }
      });
      items.push({
        icon: ICONS.videoOff,
        label: 'Disable video',
        action: () => { this.muteParticipantVideo(sessionId); overlay.remove(); }
      });
    }
    items.push({
      icon: ICONS.flag,
      label: 'Report',
      action: () => { overlay.remove(); this.reportLiveSession(); }
    });

    for (const item of items) {
      const btn = document.createElement('button');
      btn.className = 'live-ctx-item' + (item.danger ? ' danger' : '');
      btn.innerHTML = `${item.icon} <span>${item.label}</span>`;
      btn.addEventListener('click', item.action);
      menu.appendChild(btn);
    }

    overlay.appendChild(menu);
    document.body.appendChild(overlay);

    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = Math.min(x, vw - rect.width - 12);
    let top = Math.min(y, vh - rect.height - 12);
    left = Math.max(12, left);
    top = Math.max(12, top);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  },

  reportLiveSession() {
    if (!this.activeSession) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content" style="max-width: 440px;">
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        <h2 style="margin-bottom: 8px;">Report Session</h2>
        <p class="text-muted" style="margin-bottom: 16px;">State your reason for reporting this live session. It will be reviewed by the team.</p>
        <textarea id="live-report-reason" class="input" rows="4" placeholder="Reason for reporting..." style="width:100%;box-sizing:border-box;"></textarea>
        <button class="btn-primary" id="live-report-submit" style="width:100%;margin-top:16px;">Submit Report</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('live-report-submit').addEventListener('click', async () => {
      const reason = document.getElementById('live-report-reason').value.trim();
      if (reason.length < 5) return appAlert('Please state a reason (at least 5 characters).');

      const btn = document.getElementById('live-report-submit');
      btn.disabled = true;
      btn.innerText = 'Submitting...';

      const { error } = await supabase.from('reports').insert({
        reporter_id: store.user.id,
        target_type: 'live_session',
        target_id: this.activeSession.id,
        reason
      });

      if (error) {
        btn.disabled = false;
        btn.innerText = 'Submit Report';
        return appAlert('Report failed: ' + error.message);
      }

      overlay.remove();
      appAlert('Thank you. Your report has been submitted for review.');
    });
  },

  async grantScreenShare(userId) {
    // TODO: Implement screen share permission
    alert('Grant screen share feature coming soon.');
  },

  async revokeScreenShare(userId) {
    // TODO: Implement revoke screen share
    alert('Revoke screen share feature coming soon.');
  },

  async toggleScreenShare() {
    if (!this.callObject) return;
    
    // Track screen share state locally since call object API doesn't expose localScreen()
    if (this.screenSharing) {
      this.callObject.stopScreenShare();
      this.screenSharing = false;
      const btn = document.getElementById('live-screen-btn');
      if (btn) btn.classList.remove('active');
    } else {
      try {
        await this.callObject.startScreenShare();
        this.screenSharing = true;
        const btn = document.getElementById('live-screen-btn');
        if (btn) btn.classList.add('active');
      } catch (error) {
        console.error('Screen share error:', error);
      }
    }
  },

  flipCamera() {
    if (!this.callObject) return;
    try {
      const result = this.callObject.cycleCamera();
      if (result && result.catch) result.catch((err) => console.warn('Camera swap failed:', err));
    } catch (error) {
      console.warn('Camera swap failed:', error);
    }
  },

  sharePrivateLink() {
    if (!this.activeSession) return;

    const joinUrl = `${window.location.origin}${window.location.pathname}#/live?join=${this.activeSession.id}`;
    const sessionTitle = this.activeSession.title || 'Live Session';

    navigator.clipboard.writeText(joinUrl).catch(() => {});

    this._openShareChatPicker(sessionTitle, joinUrl);
  },

  async _openShareChatPicker(sessionTitle, joinUrl) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content" style="max-width: 420px; max-height: 80vh; display: flex; flex-direction: column;">
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        <h2 style="margin-bottom: 4px;">Share to Chat</h2>
        <p class="text-muted" style="margin-bottom: 12px; font-size: 13px;">Link copied. Select chats to send the invite.</p>
        <div id="share-chat-list" style="flex: 1; overflow-y: auto; min-height: 0;">
          <p class="text-muted" style="text-align: center; padding: 20px;">Loading chats...</p>
        </div>
        <button class="btn-primary" id="share-done-btn" style="width: 100%; margin-top: 12px; flex-shrink: 0;" disabled>Send to selected</button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });

    const listEl = overlay.querySelector('#share-chat-list');
    const doneBtn = overlay.querySelector('#share-done-btn');

    try {
      const contacts = await this._fetchChatContacts();
      if (contacts.length === 0) {
        listEl.innerHTML = '<p class="text-muted" style="text-align: center; padding: 20px;">No chats yet. Start a conversation in Ping first.</p>';
        return;
      }

      listEl.innerHTML = contacts.map(c => `
        <label class="share-chat-item" data-contact-id="${c.id}">
          <input type="checkbox" value="${c.id}">
          <img src="${esc(c.avatar_url || '/icons/icon.png')}" alt="" class="share-chat-avatar" onerror="this.src='/icons/icon.png'">
          <span class="share-chat-name">${esc(c.full_name)}</span>
        </label>
      `).join('');

      const updateBtn = () => {
        const checked = listEl.querySelectorAll('input:checked');
        doneBtn.disabled = checked.length === 0;
        doneBtn.textContent = checked.length > 0 ? `Send to ${checked.length} chat${checked.length > 1 ? 's' : ''}` : 'Send to selected';
      };

      listEl.addEventListener('change', updateBtn);
      updateBtn();

      doneBtn.addEventListener('click', async () => {
        const selectedIds = [...listEl.querySelectorAll('input:checked')].map(cb => cb.value);
        if (selectedIds.length === 0) return;

        doneBtn.disabled = true;
        doneBtn.textContent = 'Sending...';

        for (const contactId of selectedIds) {
          await supabase.from('messages').insert({
            sender_id: store.user.id,
            receiver_id: contactId,
            content: sessionTitle,
            attachment_url: joinUrl,
            attachment_type: 'live_invite',
            is_ai: false
          });
        }

        overlay.remove();
        appAlert(`Invite sent to ${selectedIds.length} chat${selectedIds.length > 1 ? 's' : ''}.`);
      });

    } catch (err) {
      console.error('Failed to load chats:', err);
      listEl.innerHTML = '<p class="text-muted" style="text-align: center; padding: 20px;">Could not load chats.</p>';
    }
  },

  async _fetchChatContacts() {
    const { data: received } = await supabase
      .from('messages')
      .select('sender_id, receiver_id')
      .or(`sender_id.eq.${store.user.id},receiver_id.eq.${store.user.id}`)
      .is('room', null)
      .is('is_ai', false)
      .is('is_admin', false);

    if (!received || received.length === 0) return [];

    const contactIds = new Set();
    for (const m of received) {
      const other = m.sender_id === store.user.id ? m.receiver_id : m.sender_id;
      if (other && other !== store.user.id) contactIds.add(other);
    }

    if (contactIds.size === 0) return [];

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', [...contactIds]);

    return profiles || [];
  },

  // ============================================
  // Chat
  // ============================================

  async sendChatMessage() {
    const input = document.getElementById('live-chat-input');
    if (!input) return;
    const content = input.value.trim();
    if ((!content && !this._pendingAttachment) || !this.activeSession) return;

    const attachment = this._pendingAttachment;
    this._pendingAttachment = null;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const body = { roomId: this.activeSession.id };
      if (content) body.content = content.slice(0, 1000);
      if (attachment) {
        body.attachment_url = attachment.url;
        body.attachment_type = attachment.type;
      }

      const response = await fetch(`${API_BASE_URL}/api/live/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(body)
      });

      const result = await response.json();
      if (result.ok) {
        input.value = '';
        this.clearAttachmentPreview();
        await this.loadChatMessages(this.activeSession.id);
      }
    } catch (error) {
      console.error('Send chat error:', error);
    }
  },

  async handleChatFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    try {
      const uploaded = await uploadAttachment(file);
      this._pendingAttachment = uploaded;
      this.showAttachmentPreview(uploaded, file.name);
    } catch (err) {
      console.error('File upload failed:', err);
      appAlert('Upload failed. Please try again.');
    }
  },

  showAttachmentPreview(attachment, fileName) {
    this.clearAttachmentPreview();
    const inputRow = document.querySelector('.live-chat-input');
    if (!inputRow) return;

    const preview = document.createElement('div');
    preview.className = 'live-chat-attachment-preview';
    preview.id = 'live-attach-preview';

    const isImage = attachment.type === 'image';
    if (isImage) {
      preview.innerHTML = `
        <img src="${esc(attachment.url)}" alt="">
        <span>${esc(fileName)}</span>
        <button class="live-attach-remove" onclick="liveInstance.clearAttachmentPreview()">&times;</button>
      `;
    } else {
      const ext = fileName.split('.').pop().toUpperCase();
      preview.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <span>${esc(fileName)} (${ext})</span>
        <button class="live-attach-remove" onclick="liveInstance.clearAttachmentPreview()">&times;</button>
      `;
    }

    inputRow.parentNode.insertBefore(preview, inputRow);
  },

  clearAttachmentPreview() {
    this._pendingAttachment = null;
    const el = document.getElementById('live-attach-preview');
    if (el) el.remove();
  },

  async loadChatMessages(requestId) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`${API_BASE_URL}/api/live/chat/${requestId}?limit=50`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (!response.ok) {
        this.chatErrorCount++;
        if (this.chatErrorCount >= 3) {
          console.warn('Chat polling stopped after 3 consecutive errors');
          this.stopChatPolling();
        }
        return;
      }

      this.chatErrorCount = 0;
      const result = await response.json();
      this.chatMessages = result.messages || [];
      this.renderChatMessages();
    } catch (error) {
      console.error('Load chat error:', error);
      this.chatErrorCount++;
      if (this.chatErrorCount >= 3) {
        console.warn('Chat polling stopped after 3 consecutive errors');
        this.stopChatPolling();
      }
    }
  },

  startChatPolling(requestId) {
    if (this.chatPollInterval) clearInterval(this.chatPollInterval);
    this.chatErrorCount = 0;
    this.chatPollInterval = setInterval(() => this.loadChatMessages(requestId), 3000);
  },

  stopChatPolling() {
    if (this.chatPollInterval) {
      clearInterval(this.chatPollInterval);
      this.chatPollInterval = null;
    }
  },

  renderChatMessages() {
    const container = document.getElementById('live-chat-messages');
    if (!container) return;

    container.innerHTML = this.chatMessages.map(msg => {
      const isOwn = msg.user_id === store.user.id;
      const name = msg.profiles?.full_name || 'Participant';
      const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      let attachmentHtml = '';
      if (msg.attachment_url) {
        if (msg.attachment_type === 'image') {
          attachmentHtml = `<div class="live-chat-attachment"><img src="${esc(msg.attachment_url)}" alt="Shared image" loading="lazy"></div>`;
        } else {
          const label = msg.content || 'Download file';
          attachmentHtml = `<div class="live-chat-attachment"><a href="${esc(msg.attachment_url)}" target="_blank" class="live-chat-file-link"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>${esc(label)}</a></div>`;
        }
      }

      const contentHtml = msg.content ? `<div class="live-chat-message-content">${esc(msg.content)}</div>` : '';

      return `
        <div class="live-chat-message ${isOwn ? 'own' : ''}">
          <div class="live-chat-message-header">
            <strong>${esc(name)}</strong>
            <span class="live-chat-message-time">${time}</span>
          </div>
          ${contentHtml}
          ${attachmentHtml}
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
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
      const label = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      const timerEl = document.getElementById('live-session-timer');
      if (timerEl) timerEl.textContent = label;

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
        const next = payload.new;
        if (!next) return;

        // Host ended (or cancelled) the session: everyone leaves.
        if (next.status === 'completed' || next.status === 'cancelled') {
          if (!this.activeSession) return; // already torn down locally
          const wasHost = this.sessionRole === 'host';
          this.cleanupSession();
          if (!wasHost) {
            appConfirm('The host ended this session.', { okText: 'OK' });
          }
          return;
        }

        console.log('Session updated:', next);
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
    if (!this.activeSession) {
      console.warn('No active session to end');
      this.cleanupSession();
      return;
    }

    const confirm = await appConfirm('End this session for everyone?', { okText: 'End', danger: true });
    if (!confirm) return;

    const sessionId = this.activeSession.id;
    const roomId = this.activeSession.room_id;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      await fetch(`${API_BASE_URL}/api/live/billing-finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ requestId: sessionId })
      });

      await supabase
        .from('live_requests')
        .update({
          status: 'completed',
          completed_by: store.user.id,
          completed_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (roomId) {
        await fetch(`${API_BASE_URL}/api/daily/delete-room`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ requestId: sessionId })
        }).catch(err => console.warn('Delete room failed (non-critical):', err));
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
    document.body.classList.remove('live-studio-active');
    document.querySelectorAll('.live-ctx-overlay').forEach(o => o.remove());
    heartbeat.stop();
    heartbeat.setCurrentPost(null);

    if (this.sessionTimerInterval) {
      clearInterval(this.sessionTimerInterval);
      this.sessionTimerInterval = null;
    }
    this.stopChatPolling();
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
    this.hostMeetingToken = null;
    this.screenSharing = false;
    this.focusedSessionId = null;

    const sessionView = document.getElementById('live-session-view');
    if (sessionView) sessionView.style.display = 'none';
    const landing = document.getElementById('live-landing');
    if (landing) landing.style.display = 'block';

    // Only refresh the landing list if we're actually on the Live page.
    if (landing) this.loadPublicSessions();
  }
};

export default liveView;
