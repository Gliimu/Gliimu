import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';
import { toggleAudio, attachmentHtml, uploadAttachment, createRecorder } from '../media.js';

export default {
  title: 'Live',
  template: `
    <div class="live-layout" id="live-container">
      <div class="live-page-main" id="live-main">
        <div class="live-page-header">
          <h2>Live Now</h2>
          <p>Broadcasts from elite Gliimaits across the ecosystem.</p>
        </div>
        <div id="live-resume-slot"></div>
        <div class="live-session-list" id="live-session-list">
          <p class="live-list-hint">Loading live sessions...</p>
        </div>
      </div>
    </div>
  `,

  init() {
    this.allUsers = [];
    this.localStream = null;
    this.displayStream = null;
    this.isScreenSharing = false;
    this.liveChatChannel = null;
    this.liveSessionActive = false;
    this.presenceChannel = null;
    this.webrtcChannel = null;
    this.peerConnections = {};
    this.viewerPeerConnection = null;
    this.webrtcIceQueue = [];
    this.hostIceQueues = {};
    this.liveHostId = null;
    this.activeLives = [];
    this.globalLiveChannel = null;
    this.supportTapCount = 0;
    this.supportTapTimer = null;
    this.activeLiveRoom = null;
    this.liveTimerInterval = null;
    this.liveEndTime = null;
    this.viewerSupportTxId = null;
    this.hostSupportTxId = null;
    this.liveSessionTitle = null;
    this.liveEntryFee = null;
    this.liveMaxParticipants = null;

    this.recorder = createRecorder({
      instanceName: 'liveInstance',
      inputAreaId: 'live-chat-input-area',
      restore: () => this.renderLiveChatInput(),
      send: async (url) => {
        const msgData = { sender_id: store.user.id, attachment_url: url, attachment_type: 'audio_note', content: '', is_ai: false, room: this.activeLiveRoom };
        const { data: newMsg } = await supabase.from('messages').insert(msgData).select('*').single();
        if (newMsg) {
          newMsg.profiles = { full_name: store.profile.full_name, avatar_url: store.profile.avatar_url };
          this.renderLiveChatMessages([newMsg], true);
        }
      }
    });

    window.liveInstance = {
      openLiveSetup: () => this.openLiveSetup(),
      submitLiveSetup: () => this.submitLiveSetup(),
      endLive: () => this.endLive(),
      isLiveActive: () => this.liveSessionActive,
      resumeLiveSession: () => this.resumeLiveSession(),
      toggleMute: (type) => this.toggleMute(type),
      flipCamera: () => this.flipCamera(),
      toggleScreenShare: () => this.toggleScreenShare(),
      openInviteModal: () => this.openInviteModal(),
      closeInviteModal: () => this.closeInviteModal(),
      sendLiveInvites: () => this.sendLiveInvites(),
      joinLive: (hostId) => this.joinLive(hostId),
      toggleViewerMute: () => this.toggleViewerMute(),
      toggleAspectRatio: () => this.toggleAspectRatio(),
      supportLiveHost: (hostId) => this.supportLiveHost(hostId),
      openLiveChat: (hostId) => this.openLiveChat(hostId),
      closeLiveChat: () => this.closeLiveChat(),
      sendLiveMessage: (roomId) => this.sendLiveMessage(roomId),
      triggerFileUpload: () => this.triggerFileUpload(),
      handleFileUpload: (event) => this.handleFileUpload(event),
      startRecording: () => this.recorder.start(),
      stopRecording: () => this.recorder.stop(),
      cancelRecording: () => this.recorder.cancel(),
      sendAudioNote: () => this.recorder.sendNote(),
      togglePreviewAudio: () => this.recorder.togglePreview(),
      toggleAudio: (msgId, url) => toggleAudio(msgId, url)
    };

    this.setupTopbar();
    this.fetchUsers();
    this.setupGlobalLiveTracker();
    this.checkActiveLiveSession();
    this.checkPendingLiveJoin();
  },

  // Auto-join a session after navigating from a chat invite DM
  checkPendingLiveJoin() {
    const hostId = sessionStorage.getItem('live_join_host');
    if (hostId) {
      sessionStorage.removeItem('live_join_host');
      setTimeout(() => this.joinLive(hostId), 1500);
    }
  },

  checkActiveLiveSession() {
    const activeSession = localStorage.getItem('active_live_session');
    if (activeSession) {
      const session = JSON.parse(activeSession);
      if (session.expiry && Date.now() < session.expiry) {
        const slot = document.getElementById('live-resume-slot');
        if (slot) {
          slot.innerHTML = `
            <div class="ping-empty-state live-resume-card">
              <h3>You have an active Live Session</h3>
              <p> "${session.title}" is still running.</p>
              <button class="btn-primary" style="margin-top: 24px;" onclick="liveInstance.resumeLiveSession()">Resume Session</button>
            </div>
          `;
        }
      } else {
        localStorage.removeItem('active_live_session');
      }
    }
  },

  async resumeLiveSession() {
    const activeSession = localStorage.getItem('active_live_session');
    if (!activeSession) return;
    const session = JSON.parse(activeSession);

    this.liveSessionActive = true;
    this.liveSessionTitle = session.title;
    this.liveEntryFee = session.entryFee;
    this.liveMaxParticipants = session.maxP;
    this.peerConnections = {};
    this.hostSupportTxId = null;

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay live-studio-overlay';
    modal.innerHTML = `
      <div class="live-studio-container">
        <div class="live-video-main">
          <video id="live-video-feed" autoplay muted playsinline></video>
          <div class="live-video-overlay">
            <div class="live-overlay-top">
              <span class="live-indicator"><span class="live-pulse"></span> LIVE</span>
              <span id="live-timer" class="live-timer">1:00:00</span>
            </div>
            <h2>${this.liveSessionTitle}</h2>
          </div>
          <div class="live-participants-strip" id="live-participants-strip"></div>
          <div id="floating-icons-container" style="position: absolute; bottom: 100px; left: 0; right: 0; pointer-events: none; z-index: 15; overflow: hidden; height: 100%;"></div>
        </div>

        <div class="live-host-toolbar">
          <button class="live-ctrl-btn mic-on" id="mute-mic-btn" title="Mute/Unmute Mic"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg></button>
          <button class="live-ctrl-btn cam-on" id="mute-cam-btn" title="Mute/Unmute Cam"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></button>
          ${isMobile ? `<button class="live-ctrl-btn" onclick="liveInstance.flipCamera()" title="Flip Camera"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg></button>` : ''}
          <button class="live-ctrl-btn" id="screen-share-btn" onclick="liveInstance.toggleScreenShare()" title="Share Screen"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg></button>
          <button class="live-ctrl-btn" onclick="liveInstance.openInviteModal()" title="Invite Chats"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></button>
          <button class="live-ctrl-btn" onclick="liveInstance.openLiveChat('${store.user.id}')" title="Live Chat"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></button>
          <button class="live-ctrl-btn danger" onclick="liveInstance.endLive()" title="End Live"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this.startMedia();
    document.getElementById('mute-mic-btn').addEventListener('click', () => this.toggleMute('audio'));
    document.getElementById('mute-cam-btn').addEventListener('click', () => this.toggleMute('video'));

    this.setupLivePresence(`live_${store.user.id}`);
    this.setupWebRTCAsHost(`live_${store.user.id}`);
    this.startLiveTimer();

    // Re-announce the session so it shows up in everyone's Live list again
    if (this.globalLiveChannel) {
      await this.globalLiveChannel.track({
        host_id: store.user.id,
        host_name: store.profile.full_name,
        host_avatar: store.profile.avatar_url,
        title: this.liveSessionTitle,
        entry_fee: this.liveEntryFee,
        max_participants: this.liveMaxParticipants
      });
    }
  },

  setupTopbar() {
    const topbarRight = document.getElementById('topbar-right-actions');
    if (topbarRight) {
      topbarRight.innerHTML = `
        <button class="ping-go-live-icon" onclick="liveInstance.openLiveSetup()" title="Go Live">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
        </button>
      `;
    }
  },

  async fetchUsers() {
    const { data } = await supabase.from('profiles').select('id, full_name, avatar_url, total_gp').neq('id', store.user.id);
    this.allUsers = data || [];
  },

  setupGlobalLiveTracker() {
    // FIX: Clean up existing channel to prevent "already subscribed" crash
    if (this.globalLiveChannel) supabase.removeChannel(this.globalLiveChannel);

    this.globalLiveChannel = supabase.channel('global-live-status')
      .on('presence', { event: 'sync' }, () => {
        const state = this.globalLiveChannel.presenceState();
        this.activeLives = Object.values(state).flat();
        this.renderLiveList();
    })
    .subscribe();
  },

  renderLiveList() {
    const list = document.getElementById('live-session-list');
    if (!list) return;

    // Don't list your own broadcast — resume it from the card instead
    const visibleLives = this.activeLives.filter(live => live.host_id !== store.user.id);

    if (visibleLives.length === 0) {
      list.innerHTML = '<p class="live-list-hint">No active live sessions right now. Check back soon.</p>';
      return;
    }

    list.innerHTML = visibleLives.map(live => {
      const avatar = live.host_avatar
        ? `<img src="${live.host_avatar}" class="ping-avatar" style="object-fit:cover;">`
        : `<div class="ping-avatar">${live.host_name?.charAt(0).toUpperCase() || 'G'}</div>`;
      return `
        <div class="ping-chat-item live-session-item" onclick="liveInstance.joinLive('${live.host_id}')">
          ${avatar}
          <div class="ping-chat-info">
            <span class="ping-chat-name">${live.title || 'Live Session'}</span>
            <span class="ping-chat-preview" style="color: var(--text-secondary); font-weight: 600;">${live.host_name} · ₦${live.entry_fee || 0}</span>
          </div>
          <span class="live-list-indicator"><span class="live-pulse"></span> LIVE</span>
        </div>
      `;
    }).join('');
  },

  // ============================================
  // NATIVE WEBRTC LIVE STUDIO (HOST)
  // ============================================
  openLiveSetup() {
    if (store.profile.total_gp < 1000) return alert("Only eligible gliimaits (1000+ GP) can go live.");
    const modal = document.createElement('div');
    this.hostSupportTxId = null;
    modal.className = 'modal-overlay live-setup-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px; background: var(--surface);">
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        <h2 style="margin-bottom: 24px;">Go Live</h2>
        <div class="form-group">
          <label>Title (Max 50 chars)</label>
          <input type="text" id="live-title-input" class="input" maxlength="50" placeholder="An elite headline...">
        </div>
        <div class="form-group">
          <label>Entry Fee</label>
          <select id="live-fee-input" class="input">
            <option value="0">Free</option>
            <option value="500">₦500</option>
            <option value="1500">₦1500</option>
            <option value="2500">₦2500</option>
          </select>
        </div>
        <div class="form-group">
          <label>Admin Code (Optional, for >3 participants)</label>
          <input type="text" id="live-code-input" class="input" placeholder="Enter code...">
        </div>
        <button class="btn-primary" style="width: 100%; margin-top: 16px;" onclick="liveInstance.submitLiveSetup()">Start Live</button>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async submitLiveSetup() {
    const title = document.getElementById('live-title-input').value.trim();
    const fee = parseInt(document.getElementById('live-fee-input').value);
    const adminCode = document.getElementById('live-code-input').value.trim();

    if (!title) return alert("Title is required.");

    let maxParticipants = 3;
    if (adminCode) {
      const { data } = await supabase.from('admin_codes').select('code').eq('code', adminCode).maybeSingle();
      if (!data) return alert("The code you entered is not correct, remove code if you don't have any.");
      maxParticipants = 100;
    }

    document.querySelector('.live-setup-modal')?.remove();

    this.liveSessionActive = true;
    this.liveSessionTitle = title;
    this.liveEntryFee = fee;
    this.liveMaxParticipants = maxParticipants;
    this.peerConnections = {};

    localStorage.setItem('active_live_session', JSON.stringify({
      title: this.liveSessionTitle,
      entryFee: this.liveEntryFee,
      maxP: this.liveMaxParticipants,
      expiry: Date.now() + 3600000
    }));

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay live-studio-overlay';
    modal.innerHTML = `
      <div class="live-studio-container">
        <div class="live-video-main">
          <video id="live-video-feed" autoplay muted playsinline></video>
          <div class="live-video-overlay">
            <div class="live-overlay-top">
              <span id="live-timer" class="live-timer">1:00:00</span>
            </div>
            <h2>${this.liveSessionTitle}</h2>
          </div>
          <div class="live-participants-strip" id="live-participants-strip"></div>
          <div id="floating-icons-container" style="position: absolute; bottom: 100px; left: 0; right: 0; pointer-events: none; z-index: 15; overflow: hidden; height: 100%;"></div>
        </div>

        <div class="live-host-toolbar">
          <button class="live-ctrl-btn mic-on" id="mute-mic-btn" title="Mute/Unmute Mic"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg></button>
          <button class="live-ctrl-btn cam-on" id="mute-cam-btn" title="Mute/Unmute Cam"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></button>
          ${isMobile ? `<button class="live-ctrl-btn" onclick="liveInstance.flipCamera()" title="Flip Camera"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg></button>` : ''}
          <button class="live-ctrl-btn" id="screen-share-btn" onclick="liveInstance.toggleScreenShare()" title="Share Screen"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg></button>
          <button class="live-ctrl-btn" onclick="liveInstance.openInviteModal()" title="Invite Chats"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></button>
          <button class="live-ctrl-btn" onclick="liveInstance.openLiveChat('${store.user.id}')" title="Live Chat"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></button>
          <button class="live-ctrl-btn danger" onclick="liveInstance.endLive()" title="End Live"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this.startMedia();
    document.getElementById('mute-mic-btn').addEventListener('click', () => this.toggleMute('audio'));
    document.getElementById('mute-cam-btn').addEventListener('click', () => this.toggleMute('video'));

    this.setupLivePresence(`live_${store.user.id}`);
    this.setupWebRTCAsHost(`live_${store.user.id}`);

    await this.globalLiveChannel.track({
      host_id: store.user.id,
      host_name: store.profile.full_name,
      host_avatar: store.profile.avatar_url,
      title: this.liveSessionTitle,
      entry_fee: this.liveEntryFee,
      max_participants: this.liveMaxParticipants
    });

    this.startLiveTimer();
  },

  startLiveTimer() {
    if (this.liveTimerInterval) clearInterval(this.liveTimerInterval);
    this.liveEndTime = Date.now() + 3600000;
    this.liveTimerInterval = setInterval(() => {
      const remaining = this.liveEndTime - Date.now();
      if (remaining <= 0) {
        clearInterval(this.liveTimerInterval);
        alert("Your 1-hour live session has ended.");
        this.endLive();
        return;
      }
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      const timerEl = document.getElementById('live-timer');
      if (timerEl) {
        timerEl.innerText = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
    }, 1000);
  },

  // ============================================
  // VIEWER JOIN
  // ============================================
  async joinLive(hostId) {
    const liveInfo = this.activeLives.find(l => l.host_id === hostId);
    if (!liveInfo) return alert("This session is no longer available.");

    const hostName = liveInfo?.host_name || 'Host';
    const title = liveInfo?.title || `${hostName}'s Session`;
    const entryFee = liveInfo?.entry_fee || 0;
    const maxP = liveInfo?.max_participants || 3;
    this.liveHostId = hostId;

    const { data: profile } = await supabase.from('profiles').select('wallet_balance, subscription_expires_at').eq('id', store.user.id).single();
    const isActiveSub = profile.subscription_expires_at && new Date(profile.subscription_expires_at) > new Date();

    if (!isActiveSub) {
      if (profile.wallet_balance < entryFee) {
        return alert(`Insufficient funds. Entry fee is ₦${entryFee}.`);
      }
      await supabase.from('profiles').update({ wallet_balance: profile.wallet_balance - entryFee }).eq('id', store.user.id);
      const hostCut = Math.floor(entryFee * 0.9);
      await supabase.rpc('increment_wallet', { user_id: hostId, amount: hostCut });

      await supabase.from('transactions').insert({
        user_id: store.user.id, amount: -entryFee, type: 'live_entry', status: 'success', description: 'Live Session Entry Fee'
      });
      await supabase.from('transactions').insert({
        user_id: hostId, amount: entryFee, type: 'live_entry', status: 'success', description: 'Live Session Entry Fee'
      });
    }

    this.liveSessionActive = true;
    this.webrtcIceQueue = [];
    this.viewerSupportTxId = null;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay live-studio-overlay';
    modal.innerHTML = `
      <div class="live-studio-container">
        <div class="live-video-main">
          <video id="live-viewer-feed" autoplay playsinline></video>
          <div class="viewer-placeholder" id="viewer-placeholder">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px; opacity: 0.5;"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
            <h3>Connecting to ${hostName}...</h3>
          </div>
          <div class="live-video-overlay">
            <span class="live-indicator"><span class="live-pulse"></span> LIVE</span>
            <h2>${title}</h2>
          </div>
          <div class="live-participants-strip" id="live-participants-strip"></div>
          <div id="floating-icons-container" style="position: absolute; bottom: 100px; left: 0; right: 0; pointer-events: none; z-index: 15; overflow: hidden; height: 100%;"></div>
        </div>

        <div class="live-host-toolbar">
          <button class="live-ctrl-btn" id="viewer-mute-btn" onclick="liveInstance.toggleViewerMute()" title="Mute/Unmute Host"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg></button>
          <button class="live-ctrl-btn" id="aspect-ratio-btn" onclick="liveInstance.toggleAspectRatio()" title="Best Experience"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg></button>
          <button class="live-ctrl-btn support-btn" id="viewer-support-btn" onclick="liveInstance.supportLiveHost('${hostId}')" title="Support (₦100)"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></button>
          <button class="live-ctrl-btn" onclick="liveInstance.openLiveChat('${hostId}')" title="Live Chat"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></button>
          <button class="live-ctrl-btn danger" onclick="liveInstance.endLive()" title="Leave Live"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    this.setupLivePresence(`live_${hostId}`, maxP);
    this.setupWebRTCAsViewer(`live_${hostId}`);
  },

  toggleViewerMute() {
    const videoEl = document.getElementById('live-viewer-feed');
    const btn = document.getElementById('viewer-mute-btn');
    if (!videoEl || !btn) return;
    videoEl.muted = !videoEl.muted;
    btn.style.background = videoEl.muted ? 'var(--error)' : 'var(--bg-tertiary)';
  },

  toggleAspectRatio() {
    const video = document.getElementById('live-viewer-feed');
    if (!video) return;
    if (video.style.objectFit === 'contain') video.style.objectFit = 'cover';
    else video.style.objectFit = 'contain';
  },

  // ============================================
  // SUPPORT LOGIC (TIPPING)
  // ============================================
  async supportLiveHost(hostId) {
    const btn = document.getElementById('viewer-support-btn');
    if (!btn) return;

    btn.classList.add('glow-support');
    setTimeout(() => btn.classList.remove('glow-support'), 1000);

    this.supportTapCount++;
    clearTimeout(this.supportTapTimer);
    this.supportTapTimer = setTimeout(() => { this.supportTapCount = 0; }, 1500);

    const { data: profile } = await supabase.from('profiles').select('wallet_balance').eq('id', store.user.id).single();
    if (profile.wallet_balance < 100) return alert("Insufficient funds.");

    const newBalance = profile.wallet_balance - 100;
    await supabase.from('profiles').update({ wallet_balance: newBalance }).eq('id', store.user.id);

    let iconType = '100';
    if (this.supportTapCount >= 10) iconType = 'thunder';
    else if (this.supportTapCount >= 5) iconType = 'clap';

    const hostCut = Math.floor(100 * 0.7);
    const titleEl = document.querySelector('.live-video-overlay h2');
    const sessionTitle = titleEl ? titleEl.innerText : 'Live Session';

    // 1. Viewer Transaction (Aggregate)
    if (this.viewerSupportTxId) {
        const { data: tx } = await supabase.from('transactions').select('amount').eq('id', this.viewerSupportTxId).single();
        if (tx) {
            await supabase.from('transactions').update({ amount: tx.amount - 100 }).eq('id', this.viewerSupportTxId);
        }
    } else {
        const { data: newTx } = await supabase.from('transactions').insert({
            user_id: store.user.id, amount: -100, type: 'live_support', status: 'success', description: `Live Support sent: ${sessionTitle}`
        }).select('*').single();
        if (newTx) this.viewerSupportTxId = newTx.id;
    }

    // 2. Broadcast to Host
    this.presenceChannel.send({
      type: 'broadcast', event: 'support',
      payload: { viewerId: store.user.id, avatarUrl: store.profile.avatar_url, iconType, amount: hostCut, title: sessionTitle }
    });
  },

  // ============================================
  // WEBRTC SIGNALING
  // ============================================
  setupWebRTCAsHost(roomId) {
    if (this.webrtcChannel) supabase.removeChannel(this.webrtcChannel);

    // FIX: Add an ICE queue for each viewer to prevent dropping candidates
    this.hostIceQueues = {};

    this.webrtcChannel = supabase.channel(`webrtc-${roomId}`)
      .on('broadcast', { event: 'signal' }, async ({ payload }) => {
        if (payload.target !== store.user.id) return;

        if (payload.type === 'viewer_join') {
          this.createPeerConnection(payload.sender);
        } else if (payload.type === 'answer') {
          const pc = this.peerConnections[payload.sender];
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));

            // Now that remote description is set, process any queued ICE candidates
            if (this.hostIceQueues[payload.sender]) {
              for (const candidate of this.hostIceQueues[payload.sender]) {
                try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.warn("Host Queued ICE Error:", e); }
              }
              this.hostIceQueues[payload.sender] = [];
            }
          }
        } else if (payload.type === 'ice') {
          const pc = this.peerConnections[payload.sender];
          if (pc && pc.remoteDescription) {
            try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch (e) { console.warn("Host ICE Error:", e); }
          } else {
            // Queue the candidate if remote description isn't set yet
            if (!this.hostIceQueues[payload.sender]) this.hostIceQueues[payload.sender] = [];
            this.hostIceQueues[payload.sender].push(payload.candidate);
          }
        }
      }).subscribe();
  },

  async createPeerConnection(viewerId) {
    // FIX: Added TURN servers to bypass mobile carrier NATs
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
      ]
    });
    this.peerConnections[viewerId] = pc;

    const activeStream = this.isScreenSharing && this.displayStream ? this.displayStream : this.localStream;
    if (activeStream) activeStream.getTracks().forEach(track => pc.addTrack(track, activeStream));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.webrtcChannel.send({ type: 'broadcast', event: 'signal', payload: { type: 'ice', target: viewerId, sender: store.user.id, candidate: event.candidate } });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.webrtcChannel.send({ type: 'broadcast', event: 'signal', payload: { type: 'offer', target: viewerId, sender: store.user.id, sdp: offer } });
  },

  setupWebRTCAsViewer(roomId) {
    if (this.webrtcChannel) supabase.removeChannel(this.webrtcChannel);
    this.webrtcChannel = supabase.channel(`webrtc-${roomId}`)
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        if (payload.target !== store.user.id) return;
        if (payload.type === 'offer') this.handleViewerOffer(payload.sdp, payload.sender);
        else if (payload.type === 'ice') {
          if (this.viewerPeerConnection && this.viewerPeerConnection.remoteDescription) {
            this.viewerPeerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } else { this.webrtcIceQueue.push(payload.candidate); }
        }
      }).subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.webrtcChannel.send({ type: 'broadcast', event: 'signal', payload: { type: 'viewer_join', target: this.liveHostId, sender: store.user.id } });
        }
      });
  },

  async handleViewerOffer(offer, hostId) {
    // FIX: Added TURN servers
    this.viewerPeerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
      ]
    });

    this.viewerPeerConnection.ontrack = (event) => {
      const videoEl = document.getElementById('live-viewer-feed');
      const placeholder = document.getElementById('viewer-placeholder');
      if (videoEl) { videoEl.srcObject = event.streams[0]; if (placeholder) placeholder.style.display = 'none'; }
    };

    this.viewerPeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.webrtcChannel.send({ type: 'broadcast', event: 'signal', payload: { type: 'ice', target: hostId, sender: store.user.id, candidate: event.candidate } });
      }
    };

    await this.viewerPeerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    while (this.webrtcIceQueue.length > 0) {
      this.viewerPeerConnection.addIceCandidate(new RTCIceCandidate(this.webrtcIceQueue.shift()));
    }

    const answer = await this.viewerPeerConnection.createAnswer();
    await this.viewerPeerConnection.setLocalDescription(answer);
    this.webrtcChannel.send({ type: 'broadcast', event: 'signal', payload: { type: 'answer', target: hostId, sender: store.user.id, sdp: answer } });
  },

  async setupLivePresence(roomId, maxP = 3) {
    if (this.presenceChannel) supabase.removeChannel(this.presenceChannel);
    this.presenceChannel = supabase.channel(`live-presence-${roomId}`)
      .on('presence', { event: 'sync' }, async () => {
        const state = this.presenceChannel.presenceState();
        const users = Object.values(state).flat();
        if (!this.liveSessionActive && users.length > maxP) {
          alert("This session has reached maximum capacity.");
          this.endLive();
          return;
        }
        this.renderLiveParticipants(users);
      })
      .on('broadcast', { event: 'support' }, async ({ payload }) => {
        this.renderFloatingSupportIcon(payload.avatarUrl, payload.iconType);

        // Add 70% to host balance immediately
        const { data: hostProfile } = await supabase.from('profiles').select('wallet_balance').eq('id', store.user.id).single();
        if (hostProfile) {
            await supabase.from('profiles').update({ wallet_balance: hostProfile.wallet_balance + payload.amount }).eq('id', store.user.id);
        }

        // Handle Host's Income Transaction (Aggregate)
        if (this.hostSupportTxId) {
            const { data: tx } = await supabase.from('transactions').select('amount').eq('id', this.hostSupportTxId).single();
            if (tx) {
                await supabase.from('transactions').update({ amount: tx.amount + payload.amount }).eq('id', this.hostSupportTxId);
            }
        } else {
            const { data: newTx } = await supabase.from('transactions').insert({
                user_id: store.user.id, amount: payload.amount, type: 'live_support', status: 'success', description: `Live Support received: ${payload.title}`
            }).select('*').single();
            if (newTx) this.hostSupportTxId = newTx.id;
        }
      })
      .on('broadcast', { event: 'session_ended' }, () => {
        this.handleSessionEnded();
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.presenceChannel.track({ user_id: store.user.id, full_name: store.profile.full_name, avatar_url: store.profile.avatar_url, total_gp: store.profile.total_gp });
        }
      });
  },

  renderLiveParticipants(users) {
    const strip = document.getElementById('live-participants-strip');
    if (!strip) return;

    const shownUsers = users.slice(0, 5);
    const extraCount = users.length > 5 ? users.length - 5 : 0;

    strip.innerHTML = shownUsers.map(u => {
      const avatar = u.avatar_url
        ? `<img src="${u.avatar_url}" class="live-participant-avatar" style="object-fit:cover;">`
        : `<div class="live-participant-avatar">${u.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
      return `
        <div class="live-participant-card">
          ${avatar}
          <span class="live-participant-name">${u.full_name}</span>
          <span class="live-participant-gp">${u.total_gp || 0} GP</span>
        </div>
      `;
    }).join('');

    if (extraCount > 0) {
      strip.innerHTML += `<div class="live-participant-card"><div class="live-participant-avatar" style="background:var(--bg-tertiary); color:white;">+${extraCount}</div></div>`;
    }
  },

  renderFloatingSupportIcon(avatarUrl, iconType) {
    const container = document.getElementById('floating-icons-container');
    if (!container) return;
    const iconEl = document.createElement('div');
    iconEl.className = 'floating-support-icon';
    let iconHtml = '';
    if (iconType === 'thunder') iconHtml = '⚡';
    else if (iconType === 'clap') iconHtml = '👏';
    else iconHtml = '💯';
    iconEl.innerHTML = `<img src="${avatarUrl}" class="fs-avatar"><span class="fs-icon">${iconHtml}</span>`;
    iconEl.style.left = `${Math.random() * 80 + 10}%`;
    container.appendChild(iconEl);
    setTimeout(() => iconEl.remove(), 3000);
  },

  // ============================================
  // LIVE CHAT MODAL
  // ============================================
  async openLiveChat(hostId) {
    if (document.getElementById('live-chat-modal')) return;
    const roomId = `live_${hostId}`;
    this.activeLiveRoom = roomId;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay live-chat-modal';
    modal.id = 'live-chat-modal';
    modal.innerHTML = `
      <div class="live-chat-panel">
        <div class="live-chat-panel-header">
          <h3>Live Chat</h3>
          <button class="modal-close" onclick="liveInstance.closeLiveChat()">×</button>
        </div>
        <div class="live-chat-panel-messages" id="live-chat-messages"></div>
        <div class="live-chat-panel-input" id="live-chat-input-area">
          <button class="ping-input-icon" onclick="liveInstance.triggerFileUpload()" title="Upload File"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg></button>
          <input type="file" id="live-file-input" style="display:none" onchange="liveInstance.handleFileUpload(event)">
          <button class="ping-input-icon ping-mic-btn" id="live-mic-btn" onclick="liveInstance.startRecording()" title="Record Voice Note"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg></button>
          <input type="text" id="live-chat-input" class="input" placeholder="Message participants..." onkeypress="if(event.key==='Enter') liveInstance.sendLiveMessage('${roomId}')">
          <button class="btn-primary live-chat-send-btn" onclick="liveInstance.sendLiveMessage('${roomId}')"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const { data: msgs } = await supabase.from('messages').select('*').eq('room', roomId).order('created_at', { ascending: true });

    const mappedMsgs = (msgs || []).map(m => {
      const user = this.allUsers.find(u => u.id === m.sender_id) || { full_name: store.profile.full_name, avatar_url: store.profile.avatar_url };
      m.profiles = user;
      return m;
    });

    this.renderLiveChatMessages(mappedMsgs);

    this.liveChatChannel = supabase.channel(`live-chat-${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room=eq.${roomId}` }, async payload => {
        const user = this.allUsers.find(u => u.id === payload.new.sender_id) || { full_name: store.profile.full_name, avatar_url: store.profile.avatar_url };
        payload.new.profiles = user;
        this.renderLiveChatMessages([payload.new], true);
      }).subscribe();
  },

  renderLiveChatInput() {
    const area = document.getElementById('live-chat-input-area');
    if (!area || !this.activeLiveRoom) return;
    area.innerHTML = `
      <button class="ping-input-icon" onclick="liveInstance.triggerFileUpload()" title="Upload File"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg></button>
      <input type="file" id="live-file-input" style="display:none" onchange="liveInstance.handleFileUpload(event)">
      <button class="ping-input-icon ping-mic-btn" id="live-mic-btn" onclick="liveInstance.startRecording()" title="Record Voice Note"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg></button>
      <input type="text" id="live-chat-input" class="input" placeholder="Message participants..." onkeypress="if(event.key==='Enter') liveInstance.sendLiveMessage('${this.activeLiveRoom}')">
      <button class="btn-primary live-chat-send-btn" onclick="liveInstance.sendLiveMessage('${this.activeLiveRoom}')"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>
    `;
  },

  renderLiveChatMessages(msgs, append = false) {
    const container = document.getElementById('live-chat-messages');
    if (!container) return;
    if (!append) container.innerHTML = '';
    const html = msgs.map(m => {
      const isMe = m.sender_id === store.user.id;
      const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const sender = isMe ? '' : `<span class="ping-msg-sender">${m.profiles?.full_name || 'User'}</span>`;
      const attachments = attachmentHtml(m, 'liveInstance');
      const contentHtml = m.content ? `<p>${m.content}</p>` : '';

      return `<div class="ping-message ${isMe ? 'sent' : 'received'}">${sender}${attachments}${contentHtml}<span class="ping-msg-time">${time}</span></div>`;
    }).join('');
    if (append) container.innerHTML += html; else container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  },

  async sendLiveMessage(roomId) {
    const input = document.getElementById('live-chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const { data } = await supabase.from('messages').insert({ sender_id: store.user.id, room: roomId, content: text, is_ai: false }).select('*').single();
    if (data) {
      data.profiles = { full_name: store.profile.full_name, avatar_url: store.profile.avatar_url };
      this.renderLiveChatMessages([data], true);
    }
  },

  closeLiveChat() {
    document.getElementById('live-chat-modal')?.remove();
    if (this.liveChatChannel) { supabase.removeChannel(this.liveChatChannel); this.liveChatChannel = null; }
    this.activeLiveRoom = null;
  },

  // ============================================
  // INVITES
  // ============================================
  async openInviteModal() {
    // Fetch fresh contacts (explicit contacts, excluding hidden chats)
    const [{ data: explicitContacts }, { data: hiddenChats }] = await Promise.all([
      supabase.from('contacts').select('contact_id').eq('user_id', store.user.id),
      supabase.from('hidden_chats').select('contact_id').eq('user_id', store.user.id)
    ]);

    const hiddenIds = new Set((hiddenChats || []).map(h => h.contact_id));
    const ids = (explicitContacts || []).map(c => c.contact_id).filter(id => !hiddenIds.has(id) && id !== store.user.id);

    let contacts = [];
    if (ids.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      contacts = profiles || [];
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay live-invite-modal';
    modal.id = 'live-invite-modal';
    modal.style.background = 'rgba(0,0,0,0.8)';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 400px; background: var(--surface);">
        <button class="modal-close" onclick="liveInstance.closeInviteModal()">×</button>
        <h3 style="margin-bottom: 16px;">Invite to Live</h3>
        <div style="max-height: 300px; overflow-y: auto; margin-bottom: 16px;">
          ${contacts.length > 0
            ? contacts.map(c => `<div class="ping-chat-item"><input type="checkbox" class="live-invite-cb" data-uid="${c.id}" style="margin-right: 12px;"><span>${c.full_name}</span></div>`).join('')
            : '<p style="color: var(--text-muted); padding: 16px 0;">No contacts to invite yet.</p>'}
        </div>
        <button class="btn-primary" style="width: 100%;" onclick="liveInstance.sendLiveInvites()">Send Invites</button>
      </div>
    `;
    document.body.appendChild(modal);
  },

  closeInviteModal() {
    document.getElementById('live-invite-modal')?.remove();
  },

  async sendLiveInvites() {
    const link = 'Join my live session: ' + window.location.origin + '/dashboard/index.html#/live';
    const checkboxes = document.querySelectorAll('.live-invite-cb:checked');
    for (let cb of checkboxes) {
      await supabase.from('messages').insert({ sender_id: store.user.id, receiver_id: cb.dataset.uid, content: link, is_ai: false });
    }
    this.closeInviteModal();
    alert("Live invites sent!");
  },

  // ============================================
  // MEDIA CONTROLS (HOST)
  // ============================================
  async startMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      document.getElementById('live-video-feed').srcObject = this.localStream;
    } catch (err) { alert("Camera/Mic access denied."); }
  },

  async flipCamera() {
    if (!this.localStream) return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    const currentFacingMode = videoTrack.getSettings().facingMode;
    const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

    videoTrack.stop();

    const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: newFacingMode }, audio: false });
    const newVideoTrack = newStream.getVideoTracks()[0];

    this.localStream.removeTrack(videoTrack);
    this.localStream.addTrack(newVideoTrack);

    document.getElementById('live-video-feed').srcObject = this.localStream;

    Object.keys(this.peerConnections).forEach(viewerId => {
      const pc = this.peerConnections[viewerId];
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(newVideoTrack);
    });
  },

  async toggleScreenShare() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      alert("True screen sharing is not supported on mobile browsers. Use the 'Flip Camera' button to switch to your back camera.");
      return;
    }

    const videoEl = document.getElementById('live-video-feed');
    const btn = document.getElementById('screen-share-btn');

    if (!this.isScreenSharing) {
      try {
        // FIX: Get screen stream, then combine with local mic audio so viewers can still hear you
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

        this.displayStream = new MediaStream();
        this.displayStream.addTrack(screenStream.getVideoTracks()[0]);
        if (this.localStream.getAudioTracks().length > 0) {
          this.displayStream.addTrack(this.localStream.getAudioTracks()[0]);
        }

        videoEl.srcObject = this.displayStream;
        this.isScreenSharing = true;
        btn.style.background = 'var(--brand-primary)';

        Object.keys(this.peerConnections).forEach(viewerId => {
          const pc = this.peerConnections[viewerId];
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) sender.replaceTrack(this.displayStream.getVideoTracks()[0]);
        });

        this.displayStream.getVideoTracks()[0].onended = () => this.toggleScreenShare();

      } catch (err) {
        console.error("Screen share failed:", err);
        alert("Screen sharing was cancelled or failed.");
      }
    } else {
      if (this.displayStream) this.displayStream.getTracks().forEach(t => t.stop());
      videoEl.srcObject = this.localStream;
      this.isScreenSharing = false;
      btn.style.background = 'var(--bg-tertiary)';

      Object.keys(this.peerConnections).forEach(viewerId => {
        const pc = this.peerConnections[viewerId];
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(this.localStream.getVideoTracks()[0]);
      });
    }
  },

  toggleMute(type) {
    if (!this.localStream) return;
    if (type === 'audio') {
      const t = this.localStream.getAudioTracks()[0];
      if (t) {
        t.enabled = !t.enabled;
        const btn = document.getElementById('mute-mic-btn');
        btn.classList.toggle('mic-on', t.enabled);
        btn.classList.toggle('mic-off', !t.enabled);
      }
    } else if (type === 'video') {
      const t = this.localStream.getVideoTracks()[0];
      if (t) {
        t.enabled = !t.enabled;
        const btn = document.getElementById('mute-cam-btn');
        btn.classList.toggle('cam-on', t.enabled);
        btn.classList.toggle('cam-off', !t.enabled);
      }
    }
  },

  handleSessionEnded() {
    const videoEl = document.getElementById('live-viewer-feed');
    const placeholder = document.getElementById('viewer-placeholder');
    if (videoEl) videoEl.srcObject = null;
    if (placeholder) {
      placeholder.style.display = 'flex';
      placeholder.innerHTML = `<h3>This live screen has ended</h3>`;
    }
    setTimeout(() => this.endLive(), 3000);
  },

  // ============================================
  // LIVE ATTACHMENTS (shared media helpers)
  // ============================================
  triggerFileUpload() { document.getElementById('live-file-input').click(); },

  async handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    let uploaded;
    try { uploaded = await uploadAttachment(file); } catch (err) { return alert("Upload failed."); }

    const msgData = { sender_id: store.user.id, attachment_url: uploaded.url, attachment_type: uploaded.type, content: '', is_ai: false, room: this.activeLiveRoom };
    const { data: newMsg } = await supabase.from('messages').insert(msgData).select('*').single();
    if (newMsg) {
      newMsg.profiles = { full_name: store.profile.full_name, avatar_url: store.profile.avatar_url };
      this.renderLiveChatMessages([newMsg], true);
    }
    event.target.value = '';
  },

  async endLive() {
    if (this.liveTimerInterval) clearInterval(this.liveTimerInterval);

    // FIX: Check if user is the host. Host doesn't have liveHostId set.
    if (this.liveSessionActive && !this.liveHostId) {
      if (this.presenceChannel) {
        this.presenceChannel.send({ type: 'broadcast', event: 'session_ended', payload: {} });
      }
      localStorage.removeItem('active_live_session');
    }

    if (this.localStream) this.localStream.getTracks().forEach(track => track.stop());
    if (this.displayStream) this.displayStream.getTracks().forEach(track => track.stop());
    this.closeLiveChat();
    if (this.presenceChannel) { supabase.removeChannel(this.presenceChannel); this.presenceChannel = null; }
    if (this.webrtcChannel) { supabase.removeChannel(this.webrtcChannel); this.webrtcChannel = null; }
    if (this.peerConnections) { Object.values(this.peerConnections).forEach(pc => pc.close()); this.peerConnections = {}; }
    if (this.viewerPeerConnection) { this.viewerPeerConnection.close(); this.viewerPeerConnection = null; }
    if (this.globalLiveChannel) await this.globalLiveChannel.untrack();

    document.querySelector('.live-studio-overlay')?.remove();
    this.liveSessionActive = false;
    this.liveHostId = null;

    // Restore the Live page state (elements may be gone if we're mid-navigation)
    if (!localStorage.getItem('active_live_session')) {
      const resumeSlot = document.getElementById('live-resume-slot');
      if (resumeSlot) resumeSlot.innerHTML = '';
      this.renderLiveList();
    }
  }
};
