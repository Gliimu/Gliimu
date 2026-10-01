import { supabase } from '/shared/js/config.js';
import { API_BASE_URL } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Ping',
  template: `
    <div class="ping-layout" id="ping-container">
      <div class="ping-sidebar" id="ping-sidebar">
        <div class="ping-sidebar-tabs">
          <button class="ping-tab active" id="tab-chats" onclick="pingInstance.switchTab('chats')">Chats</button>
          <button class="ping-tab" id="tab-live" onclick="pingInstance.switchTab('live')">Live</button>
        </div>
        <div class="ping-chat-list" id="ping-chat-list">
          <p style="color: var(--text-muted); text-align: center; padding: 20px;">Loading chats...</p>
        </div>
      </div>

      <div class="ping-main" id="ping-main">
        <div class="ping-empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-bottom: 16px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          <h3>Select a chat to start pinging</h3>
          <p>Your direct messages, Gliim-PA, and Live sessions live here.</p>
        </div>
      </div>
    </div>
  `,

  init() {
    this.allUsers = [];
    this.contacts = [];
    this.activeChat = null;
    this.chatHistory = [];
    this.localStream = null;
    this.displayStream = null;
    this.isScreenSharing = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.currentRecordingUrl = null;
    this.previewAudio = null;
    this.currentAudio = null;
    this.currentAudioId = null;
    this.recordTimer = null;
    this.recordSeconds = 0;
    this.activeTab = 'chats';
    this.liveChatChannel = null;
    this.liveSessionActive = false;
    this.presenceChannel = null;
    this.webrtcChannel = null;
    this.peerConnections = {};
    this.viewerPeerConnection = null;
    this.webrtcIceQueue = [];
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

    window.pingInstance = {
      openChat: (type, id) => this.openChat(type, id),
      sendMessage: () => this.sendMessage(),
      searchUsers: (query) => this.searchUsers(query),
      addContact: (userId) => this.addContact(userId),
      closeChat: () => this.closeChat(),
      openLiveSetup: () => this.openLiveSetup(),
      toggleMute: (type) => this.toggleMute(type),
      endLive: () => this.endLive(),
      isLiveActive: () => this.liveSessionActive,
      showChatMenu: (e, userId) => this.showChatMenu(e, userId),
      removeContact: (userId) => this.removeContact(userId),
      triggerFileUpload: () => this.triggerFileUpload(),
      handleFileUpload: (event) => this.handleFileUpload(event),
      startRecording: () => this.startRecording(),
      stopRecording: () => this.stopRecording(),
      cancelRecording: () => this.cancelRecording(),
      sendAudioNote: () => this.sendAudioNote(),
      togglePreviewAudio: () => this.togglePreviewAudio(),
      toggleAudio: (msgId, url) => this.toggleAudio(msgId, url),
      showMessageMenu: (e, msgId) => this.showMessageMenu(e, msgId),
      editMessage: (msgId) => this.editMessage(msgId),
      deleteMessage: (msgId) => this.deleteMessage(msgId),
      saveEdit: (msgId) => this.saveEdit(msgId),
      cancelEdit: () => this.renderChatWindow(),
      openInviteModal: () => this.openInviteModal(),
      closeInviteModal: () => this.closeInviteModal(),
      sendLiveInvites: () => this.sendLiveInvites(),
      switchTab: (tab) => this.switchTab(tab),
      toggleScreenShare: () => this.toggleScreenShare(),
      flipCamera: () => this.flipCamera(),
      joinLive: (hostId) => this.joinLive(hostId),
      supportLiveHost: (hostId) => this.supportLiveHost(hostId),
      openLiveChat: (hostId) => this.openLiveChat(hostId),
      sendLiveMessage: (roomId) => this.sendLiveMessage(roomId),
      closeLiveChat: () => this.closeLiveChat(),
      toggleAspectRatio: () => this.toggleAspectRatio(),
      toggleViewerMute: () => this.toggleViewerMute(),
      resumeLiveSession: () => this.resumeLiveSession(),
      submitLiveSetup: () => this.submitLiveSetup()
    };

    this.setupTopbar();
    this.checkPendingPing();
    this.fetchUsers();
    this.fetchContacts();
    this.setupRealtime();
    this.setupGlobalLiveTracker();
    this.checkActiveLiveSession();
  },

  checkActiveLiveSession() {
    const activeSession = localStorage.getItem('active_live_session');
    if (activeSession) {
      const session = JSON.parse(activeSession);
      // Check if session is less than 1 hour old
      if (session.expiry && Date.now() < session.expiry) {
        const main = document.getElementById('ping-main');
        if (main) {
          main.innerHTML = `
            <div class="ping-empty-state">
              <h3>You have an active Live Session</h3>
              <p> "${session.title}" is still running.</p>
              <button class="btn-primary" style="margin-top: 24px;" onclick="pingInstance.resumeLiveSession()">Resume Session</button>
            </div>
          `;
        }
      } else {
        // Expired, remove it
        localStorage.removeItem('active_live_session');
      }
    }
  },

  resumeLiveSession() {
    const activeSession = localStorage.getItem('active_live_session');
    if (!activeSession) return;
    const session = JSON.parse(activeSession);

    this.liveSessionActive = true;
    this.liveSessionTitle = session.title;
    this.liveEntryFee = session.entryFee;
    this.liveMaxParticipants = session.maxP;
    this.peerConnections = {};

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
          ${isMobile ? `<button class="live-ctrl-btn" onclick="pingInstance.flipCamera()" title="Flip Camera"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg></button>` : ''}
          <button class="live-ctrl-btn" id="screen-share-btn" onclick="pingInstance.toggleScreenShare()" title="Share Screen"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg></button>
          <button class="live-ctrl-btn" onclick="pingInstance.openInviteModal()" title="Invite Chats"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></button>
          <button class="live-ctrl-btn" onclick="pingInstance.openLiveChat('${store.user.id}')" title="Live Chat"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></button>
          <button class="live-ctrl-btn danger" onclick="pingInstance.endLive()" title="End Live"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
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
  },

  switchTab(tab) {
    this.activeTab = tab;
    document.getElementById('tab-chats')?.classList.remove('active');
    document.getElementById('tab-live')?.classList.remove('active');
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    this.renderChatList();
  },

  setupGlobalLiveTracker() {
    this.globalLiveChannel = supabase.channel('global-live-status')
      .on('presence', { event: 'sync' }, () => {
        const state = this.globalLiveChannel.presenceState();
        this.activeLives = Object.values(state).flat();
        if (this.activeTab === 'live') this.renderChatList();
      })
      .subscribe();
  },

  setupTopbar() {
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    const topbarRight = document.getElementById('topbar-right-actions');

    if (topbarDynamic) {
      topbarDynamic.innerHTML = `
        <div class="ping-top-search-wrapper">
          <input type="text" id="ping-top-search" class="input" placeholder="Search users to add..." oninput="pingInstance.searchUsers(this.value)">
          <div class="ping-search-dropdown" id="ping-search-dropdown"></div>
        </div>
      `;
    }

    if (topbarRight) {
      topbarRight.innerHTML = `
        <button class="ping-go-live-icon" onclick="pingInstance.openLiveSetup()" title="Go Live">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
        </button>
      `;
    }
  },

  searchUsers(query) {
    const dropdown = document.getElementById('ping-search-dropdown');
    if (!query || query.length < 2) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      return;
    }

    const q = query.toLowerCase();
    const filtered = this.allUsers.filter(u => u.full_name?.toLowerCase().includes(q) && !this.contacts.find(c => c.id === u.id));

    if (filtered.length === 0) {
      dropdown.style.display = 'block';
      dropdown.innerHTML = '<div class="ping-search-item">No users found.</div>';
      return;
    }

    dropdown.style.display = 'block';
    dropdown.innerHTML = filtered.map(u => {
      const avatar = u.avatar_url
        ? `<img src="${u.avatar_url}" class="ping-search-avatar" style="object-fit:cover;">`
        : `<div class="ping-search-avatar">${u.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
      return `
        <div class="ping-search-item" onclick="pingInstance.addContact('${u.id}')">
          ${avatar}
          <span>${u.full_name}</span>
        </div>
      `;
    }).join('');
  },

  async addContact(userId) {
    await supabase.from('hidden_chats').delete().eq('user_id', store.user.id).eq('contact_id', userId);
    const { error } = await supabase.from('contacts').insert({ user_id: store.user.id, contact_id: userId });
    if (error && !error.message.includes('duplicate')) return alert("Error adding contact.");

    document.getElementById('ping-top-search').value = '';
    document.getElementById('ping-search-dropdown').style.display = 'none';
    document.getElementById('ping-search-dropdown').innerHTML = '';

    await this.fetchContacts();
    this.openChat('dm', userId);
  },

  async fetchUsers() {
    const { data } = await supabase.from('profiles').select('id, full_name, avatar_url, total_gp').neq('id', store.user.id);
    this.allUsers = data || [];
  },

  async fetchContacts() {
    const [{ data: explicitContacts }, { data: hiddenChats }] = await Promise.all([
      supabase.from('contacts').select('contact_id').eq('user_id', store.user.id),
      supabase.from('hidden_chats').select('contact_id, hidden_at').eq('user_id', store.user.id)
    ]);

    const hiddenMap = {};
    hiddenChats.forEach(h => hiddenMap[h.contact_id] = new Date(h.hidden_at).getTime());

    let userIds = explicitContacts.map(c => c.contact_id).filter(id => !hiddenMap[id]);

    const { data: receivedMsgs } = await supabase.from('messages').select('sender_id, created_at').eq('receiver_id', store.user.id);
    receivedMsgs.forEach(m => {
      const msgTime = new Date(m.created_at).getTime();
      if (!hiddenMap[m.sender_id] || msgTime > hiddenMap[m.sender_id]) {
        if (!userIds.includes(m.sender_id)) userIds.push(m.sender_id);
      }
    });

    const { data: sentMsgs } = await supabase.from('messages').select('receiver_id, created_at').eq('sender_id', store.user.id).not('receiver_id', 'is', null);
    sentMsgs.forEach(m => {
      const msgTime = new Date(m.created_at).getTime();
      if (!hiddenMap[m.receiver_id] || msgTime > hiddenMap[m.receiver_id]) {
        if (!userIds.includes(m.receiver_id)) userIds.push(m.receiver_id);
      }
    });

    const uniqueIds = [...new Set(userIds)].filter(id => id !== store.user.id);

    if (uniqueIds.length === 0) {
      this.contacts = [];
      this.renderChatList();
      return;
    }

    const { data: contactProfiles } = await supabase.from('profiles').select('id, full_name, avatar_url, total_gp').in('id', uniqueIds);

    const allMsgs = [...receivedMsgs, ...sentMsgs.map(m => ({ sender_id: store.user.id, created_at: m.created_at, receiver_id: m.receiver_id }))];
    const lastMsgMap = {};
    allMsgs.forEach(m => {
      const otherId = m.sender_id === store.user.id ? m.receiver_id : m.sender_id;
      if (otherId) {
        const time = new Date(m.created_at).getTime();
        if (!lastMsgMap[otherId] || time > lastMsgMap[otherId]) {
          lastMsgMap[otherId] = time;
        }
      }
    });

    this.contacts = (contactProfiles || []).sort((a, b) => {
      const timeA = lastMsgMap[a.id] || 0;
      const timeB = lastMsgMap[b.id] || 0;
      return timeB - timeA;
    });

    this.renderChatList();
  },

  renderChatList() {
    const list = document.getElementById('ping-chat-list');
    if (!list) return;

    if (this.activeTab === 'live') {
      if (this.activeLives.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">No active live sessions.</p>';
        return;
      }
      list.innerHTML = this.activeLives.map(live => {
        const avatar = live.host_avatar
          ? `<img src="${live.host_avatar}" class="ping-avatar" style="object-fit:cover;">`
          : `<div class="ping-avatar">${live.host_name?.charAt(0).toUpperCase() || 'G'}</div>`;
        return `
          <div class="ping-chat-item" onclick="pingInstance.joinLive('${live.host_id}')">
            ${avatar}
            <div class="ping-chat-info">
              <span class="ping-chat-name">${live.title || 'Live Session'}</span>
              <span class="ping-chat-preview" style="color: var(--text-secondary); font-weight: 600;">${live.host_name} · ₦${live.entry_fee || 0}</span>
            </div>
          </div>
        `;
      }).join('');
      return;
    }

    const aiItem = `
      <div class="ping-chat-item ${this.activeChat?.id === 'ai' ? 'active' : ''}" onclick="pingInstance.openChat('ai', 'ai')">
        <img src="/icons/gliimpa.png" class="ping-avatar" style="object-fit:cover; background:var(--gradient-primary);">
        <div class="ping-chat-info"><span class="ping-chat-name">Gliim-PA</span><span class="ping-chat-preview">Elite AI Assistant</span></div>
      </div>
    `;

    const usersHtml = this.contacts.map(u => {
      const avatarClass = u.total_gp >= 1000 ? 'ping-avatar glow-avatar' : 'ping-avatar';
      const avatar = u.avatar_url ? `<img src="${u.avatar_url}" class="${avatarClass}" style="object-fit:cover;" onclick="event.stopPropagation(); pingInstance.showChatMenu(event, '${u.id}')">` : `<div class="${avatarClass}" onclick="event.stopPropagation(); pingInstance.showChatMenu(event, '${u.id}')">${u.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
      return `
        <div class="ping-chat-item ${this.activeChat?.id === u.id ? 'active' : ''}" onclick="pingInstance.openChat('dm', '${u.id}')">
          ${avatar}
          <div class="ping-chat-info">
            <span class="ping-chat-name">${u.full_name}</span>
            <span class="ping-chat-preview">${u.total_gp || 0} GP</span>
          </div>
        </div>
      `;
    }).join('');

    list.innerHTML = aiItem + usersHtml;
  },

  async openChat(type, id) {
    this.activeLiveRoom = null;
    if (type === 'ai') {
      this.activeChat = { type: 'ai', id: 'ai', name: 'Gliim-PA', avatar: '/icons/gliimpa.png', is_ai: true };
      this.chatHistory = [];
      const { data: aiMsgs } = await supabase.from('messages').select('*').eq('sender_id', store.user.id).eq('is_ai', true).order('created_at', { ascending: true });
      if (aiMsgs) this.chatHistory = aiMsgs.map(m => ({ role: m.is_ai ? 'assistant' : 'user', content: m.content, created_at: m.created_at }));
    } else if (type === 'dm') {
      const user = this.contacts.find(u => u.id === id);
      if (!user) return;
      this.activeChat = { type: 'dm', id: user.id, name: user.full_name, avatar: user.avatar_url, total_gp: user.total_gp, is_ai: false };
      const { data: msgs } = await supabase.from('messages').select('*').or(`and(sender_id.eq.${store.user.id},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${store.user.id})`).order('created_at', { ascending: true });
      this.chatHistory = msgs || [];
    }

    this.renderChatList();
    this.renderChatWindow();
    document.getElementById('ping-container').classList.add('chat-open');
  },

  closeChat() {
    document.getElementById('ping-container').classList.remove('chat-open');
  },

  renderChatWindow() {
    const main = document.getElementById('ping-main');
    if (!main || !this.activeChat) return;

    const avatarClass = this.activeChat.total_gp >= 1000 ? 'ping-avatar glow-avatar' : 'ping-avatar';
    let avatarHtml = '';
    if (this.activeChat.is_ai) {
      avatarHtml = `<img src="${this.activeChat.avatar}" class="ping-avatar" style="object-fit:cover; background:var(--gradient-primary);">`;
    } else {
      avatarHtml = this.activeChat.avatar ? `<img src="${this.activeChat.avatar}" class="${avatarClass}" style="object-fit:cover;">` : `<div class="${avatarClass}">${this.activeChat.name?.charAt(0).toUpperCase() || 'G'}</div>`;
    }

    let messagesHtml = '';
    if (this.chatHistory.length === 0 && !this.activeChat.is_ai) {
      messagesHtml = `<div style="text-align: center; color: var(--text-muted); margin-top: 40px;">No messages yet. Say hello!</div>`;
    } else {
      messagesHtml = this.chatHistory.map(m => {
        if (this.activeChat.is_ai) {
          const isMe = m.role === 'user';
          return `<div class="ping-message ${isMe ? 'sent' : 'received'}"><p>${m.content}</p></div>`;
        }

        const isMe = m.sender_id === store.user.id;
        const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isEditable = isMe && (Date.now() - new Date(m.created_at).getTime() < 180000);

        let attachmentHtml = '';
        if (m.attachment_url) {
          if (m.attachment_type === 'image') attachmentHtml = `<img src="${m.attachment_url}" class="ping-attachment img">`;
          else if (m.attachment_type === 'audio_note') {
            attachmentHtml = `
              <div class="voice-note-bubble" id="vn-${m.id}">
                <button class="vn-play-btn" onclick="pingInstance.toggleAudio('${m.id}', '${m.attachment_url}')">
                  <svg class="vn-icon-play" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                  <svg class="vn-icon-pause" style="display:none;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                </button>
                <div class="vn-progress-bar"><div class="vn-progress-fill" id="vn-fill-${m.id}"></div></div>
                <span class="vn-duration" id="vn-dur-${m.id}">0:00</span>
              </div>
            `;
          }
          else if (m.attachment_type === 'video') attachmentHtml = `<video controls src="${m.attachment_url}" class="ping-attachment video"></video>`;
          else attachmentHtml = `<a href="${m.attachment_url}" target="_blank" class="ping-attachment file">📎 Download File</a>`;
        }

        let contentHtml = '';
        if (m.content) {
          if (m.content.includes('Join my live session:')) {
            const hostId = m.sender_id;
            contentHtml = `<button class="btn-primary btn-sm" style="margin-top:4px;" onclick="pingInstance.joinLive('${hostId}')">Join Live Session</button>`;
          } else {
            const formattedText = m.content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="word-break: break-all; color: inherit; text-decoration: underline;">$1</a>');
            contentHtml = `<p>${formattedText}</p>`;
          }
        }

        const editIndicator = m.is_edited ? `<span class="ping-edited">edited</span>` : '';
        const menuBtn = isEditable ? `<button class="ping-msg-menu-btn" onclick="event.stopPropagation(); pingInstance.showMessageMenu(event, '${m.id}')">⋯</button>` : '';

        return `
          <div class="ping-message ${isMe ? 'sent' : 'received'}" id="msg-${m.id}">
            ${attachmentHtml}
            ${contentHtml}
            <div class="ping-msg-footer">
              ${editIndicator}
              <span class="ping-msg-time">${time}</span>
              ${menuBtn}
            </div>
          </div>
        `;
      }).join('');
    }

    if (this.activeChat.is_ai && this.chatHistory.length === 0) {
      messagesHtml = `<div class="ping-message received"><p>Hello! I am Gliim-PA. How can I assist your research today?</p></div>`;
    }

    main.innerHTML = `
      <div class="ping-chat-header">
        <button class="ping-back-btn" onclick="pingInstance.closeChat()"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg></button>
        ${avatarHtml}
        <div><h3>${this.activeChat.name}</h3><span>${this.activeChat.is_ai ? 'Online · AI Assistant' : 'Direct Message'}</span></div>
      </div>

      <div class="ping-messages" id="ping-messages">${messagesHtml}</div>

      <div class="ping-input-area" id="ping-input-area">
        <button class="ping-input-icon" onclick="pingInstance.triggerFileUpload()" title="Upload File">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
        </button>
        <input type="file" id="ping-file-input" style="display:none" onchange="pingInstance.handleFileUpload(event)">

        <button class="ping-input-icon ping-mic-btn" id="ping-mic-btn" onclick="pingInstance.startRecording()" title="Record Voice Note">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg>
        </button>

        <input type="text" id="ping-input" class="input" placeholder="Message ${this.activeChat.name}..." onkeypress="if(event.key==='Enter') pingInstance.sendMessage()">
        <button class="btn-primary" onclick="pingInstance.sendMessage()"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>
      </div>
    `;

    const msgContainer = document.getElementById('ping-messages');
    msgContainer.scrollTop = msgContainer.scrollHeight;
  },

  async sendMessage() {
    const input = document.getElementById('ping-input');
    const text = input.value.trim();
    if (!text || !this.activeChat) return;

    input.value = '';

    const msgData = { sender_id: store.user.id, content: text, is_ai: false };
    if (this.activeChat.is_ai) msgData.receiver_id = null;
    else msgData.receiver_id = this.activeChat.id;

    const { data, error } = await supabase.from('messages').insert(msgData).select('*').single();
    if (error) return alert("Failed to send: " + error.message);

    this.chatHistory.push(data);
    this.renderChatWindow();

    if (this.activeChat.is_ai) this.callAI(text);
  },

  async callAI(text) {
    const msgContainer = document.getElementById('ping-messages');
    msgContainer.innerHTML += `<div class="ping-message received" id="ai-typing"><p>Thinking...</p></div>`;
    msgContainer.scrollTop = msgContainer.scrollHeight;

    const history = this.chatHistory.filter(m => !m.attachment_url).map(m => ({
      role: m.is_ai ? 'assistant' : 'user',
      content: m.content
    }));

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      });
      const data = await res.json();
      document.getElementById('ai-typing')?.remove();

      if (data.reply) {
        const { data: aiMsg } = await supabase.from('messages').insert({
          sender_id: store.user.id, receiver_id: null, content: data.reply, is_ai: true
        }).select('*').single();
        this.chatHistory.push(aiMsg);
        this.renderChatWindow();
      }
    } catch (err) {
      document.getElementById('ai-typing')?.remove();
      alert("AI connection error.");
    }
  },

  triggerFileUpload() { document.getElementById('ping-file-input').click(); },

  async handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const fileName = `${store.user.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('chat_attachments').upload(fileName, file);
    if (error) return alert("Upload failed.");

    const { data } = supabase.storage.from('chat_attachments').getPublicUrl(fileName);
    const url = data.publicUrl;
    let type = 'file';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('video/')) type = 'video';
    else if (file.type === 'application/pdf') type = 'pdf';

    const msgData = { sender_id: store.user.id, attachment_url: url, attachment_type: type, content: '', is_ai: false };

    if (this.activeLiveRoom) {
      msgData.room = this.activeLiveRoom;
      const { data: newMsg } = await supabase.from('messages').insert(msgData).select('*').single();
      if (newMsg) {
        newMsg.profiles = { full_name: store.profile.full_name, avatar_url: store.profile.avatar_url };
        this.renderLiveChatMessages([newMsg], true);
      }
    } else {
      if (!this.activeChat.is_ai) msgData.receiver_id = this.activeChat.id;
      else msgData.receiver_id = null;
      const { data: newMsg } = await supabase.from('messages').insert(msgData).select('*').single();
      if (newMsg) { this.chatHistory.push(newMsg); this.renderChatWindow(); }
    }
    event.target.value = '';
  },

  async startRecording() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.localStream);
      this.audioChunks = [];
      this.mediaRecorder.ondataavailable = (e) => this.audioChunks.push(e.data);
      this.mediaRecorder.onstop = () => this.processRecording();
      this.mediaRecorder.start();
      this.isRecording = true;
      this.recordSeconds = 0;

      const inputArea = document.getElementById('ping-input-area') || document.getElementById('live-chat-input-area');
      if (!inputArea) return;

      inputArea.innerHTML = `
        <div class="ping-voice-recording">
          <div class="voice-rec-dot"></div>
          <span class="voice-rec-timer" id="rec-timer">0:00</span>
          <button class="btn-secondary btn-sm" onclick="pingInstance.cancelRecording()">Cancel</button>
          <button class="btn-primary btn-sm" onclick="pingInstance.stopRecording()">Stop</button>
        </div>
      `;
      this.recordTimer = setInterval(() => {
        this.recordSeconds++;
        document.getElementById('rec-timer').innerText = `${Math.floor(this.recordSeconds / 60)}:${(this.recordSeconds % 60).toString().padStart(2, '0')}`;
      }, 1000);
    } catch (err) { alert("Microphone access denied."); }
  },

  processRecording() {
    const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
    this.currentRecordingUrl = URL.createObjectURL(blob);
    const inputArea = document.getElementById('ping-input-area') || document.getElementById('live-chat-input-area');
    if (!inputArea) return;

    inputArea.innerHTML = `
      <div class="ping-voice-preview">
        <button class="vn-play-btn" id="preview-play-btn" onclick="pingInstance.togglePreviewAudio()">
          <svg class="vn-icon-play" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          <svg class="vn-icon-pause" style="display:none;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        </button>
        <div class="vn-progress-bar"><div class="vn-progress-fill" id="preview-fill"></div></div>
        <span class="vn-duration" id="preview-dur">0:00</span>
        <button class="btn-primary" onclick="pingInstance.sendAudioNote()">Send</button>
        <button class="btn-secondary" onclick="pingInstance.cancelRecording()">Discard</button>
      </div>
    `;
    this.previewAudio = new Audio(this.currentRecordingUrl);
    this.previewAudio.addEventListener('timeupdate', () => {
      const progress = (this.previewAudio.currentTime / this.previewAudio.duration) * 100;
      document.getElementById('preview-fill').style.width = `${progress}%`;
      document.getElementById('preview-dur').innerText = `${Math.floor(this.previewAudio.currentTime / 60)}:${Math.floor(this.previewAudio.currentTime % 60).toString().padStart(2, '0')}`;
    });
    this.previewAudio.addEventListener('ended', () => {
      document.getElementById('preview-play-btn').querySelector('.vn-icon-play').style.display = 'block';
      document.getElementById('preview-play-btn').querySelector('.vn-icon-pause').style.display = 'none';
      document.getElementById('preview-fill').style.width = `0%`;
    });
  },

  togglePreviewAudio() {
    const btn = document.getElementById('preview-play-btn');
    if (this.previewAudio.paused) {
      this.previewAudio.play();
      btn.querySelector('.vn-icon-play').style.display = 'none';
      btn.querySelector('.vn-icon-pause').style.display = 'block';
    } else {
      this.previewAudio.pause();
      btn.querySelector('.vn-icon-play').style.display = 'block';
      btn.querySelector('.vn-icon-pause').style.display = 'none';
    }
  },

  async sendAudioNote() {
    if (!this.currentRecordingUrl) return;
    const blob = await fetch(this.currentRecordingUrl).then(r => r.blob());
    const fileName = `${store.user.id}/${Date.now()}_audio.webm`;
    const { error } = await supabase.storage.from('chat_attachments').upload(fileName, blob);
    if (error) return alert("Failed to upload audio.");
    const { data } = supabase.storage.from('chat_attachments').getPublicUrl(fileName);

    const msgData = { sender_id: store.user.id, attachment_url: data.publicUrl, attachment_type: 'audio_note', content: '', is_ai: false };

    if (this.activeLiveRoom) {
      msgData.room = this.activeLiveRoom;
      const { data: newMsg } = await supabase.from('messages').insert(msgData).select('*').single();
      if (newMsg) {
        newMsg.profiles = { full_name: store.profile.full_name, avatar_url: store.profile.avatar_url };
        this.renderLiveChatMessages([newMsg], true);
      }
    } else {
      if (!this.activeChat.is_ai) msgData.receiver_id = this.activeChat.id;
      const { data: newMsg } = await supabase.from('messages').insert(msgData).select('*').single();
      if (newMsg) { this.chatHistory.push(newMsg); this.renderChatWindow(); }
    }
    this.cancelRecording();
  },

  cancelRecording() {
    clearInterval(this.recordTimer);
    if (this.previewAudio) { this.previewAudio.pause(); this.previewAudio = null; }
    this.isRecording = false;
    this.currentRecordingUrl = null;
    if (this.localStream) this.localStream.getTracks().forEach(t => t.stop());

    if (this.activeLiveRoom) this.renderLiveChatInput();
    else this.renderChatWindow();
  },

  stopRecording() {
    clearInterval(this.recordTimer);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    if (this.localStream) this.localStream.getTracks().forEach(t => t.stop());
    this.isRecording = false;
  },

  toggleAudio(msgId, url) {
    if (this.currentAudio) {
      this.currentAudio.pause();
      const oldBtn = document.querySelector(`#vn-${this.currentAudioId} .vn-play-btn`);
      if (oldBtn) { oldBtn.querySelector('.vn-icon-play').style.display = 'block'; oldBtn.querySelector('.vn-icon-pause').style.display = 'none'; }
      if (this.currentAudioId === msgId) { this.currentAudio = null; this.currentAudioId = null; return; }
    }
    this.currentAudio = new Audio(url);
    this.currentAudioId = msgId;
    this.currentAudio.play();
    const btn = document.querySelector(`#vn-${msgId} .vn-play-btn`);
    btn.querySelector('.vn-icon-play').style.display = 'none';
    btn.querySelector('.vn-icon-pause').style.display = 'block';
    this.currentAudio.addEventListener('timeupdate', () => {
      document.getElementById(`vn-fill-${msgId}`).style.width = `${(this.currentAudio.currentTime / this.currentAudio.duration) * 100}%`;
      document.getElementById(`vn-dur-${msgId}`).innerText = `${Math.floor(this.currentAudio.currentTime / 60)}:${Math.floor(this.currentAudio.currentTime % 60).toString().padStart(2, '0')}`;
    });
    this.currentAudio.addEventListener('ended', () => {
      btn.querySelector('.vn-icon-play').style.display = 'block';
      btn.querySelector('.vn-icon-pause').style.display = 'none';
      document.getElementById(`vn-fill-${msgId}`).style.width = `0%`;
      this.currentAudio = null; this.currentAudioId = null;
    });
  },

  showMessageMenu(e, msgId) {
    e.stopPropagation();
    document.querySelectorAll('.ctx-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.style.left = `${e.clientX}px`; menu.style.top = `${e.clientY}px`;
    menu.innerHTML = `<div class="ctx-item" onclick="pingInstance.editMessage('${msgId}')">Edit</div><div class="ctx-item danger" onclick="pingInstance.deleteMessage('${msgId}')">Delete</div>`;
    document.body.appendChild(menu);
    setTimeout(() => { document.addEventListener('click', () => menu.remove(), { once: true }); }, 0);
  },

  editMessage(msgId) {
    const msg = this.chatHistory.find(m => m.id === msgId);
    if (!msg) return;
    document.getElementById(`msg-${msgId}`).innerHTML = `
      <textarea class="input ping-edit-textarea" id="edit-${msgId}">${msg.content}</textarea>
      <div class="ping-edit-actions"><button class="btn-secondary btn-sm" onclick="pingInstance.cancelEdit()">Cancel</button><button class="btn-primary btn-sm" onclick="pingInstance.saveEdit('${msgId}')">Save</button></div>
    `;
  },

  async saveEdit(msgId) {
    const newText = document.getElementById(`edit-${msgId}`).value.trim();
    if (!newText) return;
    await supabase.from('messages').update({ content: newText, is_edited: true }).eq('id', msgId);
    const msg = this.chatHistory.find(m => m.id === msgId);
    if (msg) { msg.content = newText; msg.is_edited = true; }
    this.renderChatWindow();
  },

  async deleteMessage(msgId) {
    if (!confirm("Delete this message?")) return;
    await supabase.from('messages').delete().eq('id', msgId);
    this.chatHistory = this.chatHistory.filter(m => m.id !== msgId);
    this.renderChatWindow();
  },

  showChatMenu(e, userId) {
    e.stopPropagation();
    document.querySelectorAll('.ctx-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.style.left = `${e.clientX}px`; menu.style.top = `${e.clientY}px`;
    menu.innerHTML = `<div class="ctx-item" onclick="sessionStorage.setItem('view_profile_id', '${userId}'); window.location.hash='#/profile'; messages.closeUserMenu()">View Profile</div>`;
    document.body.appendChild(menu);
    setTimeout(() => { document.addEventListener('click', () => menu.remove(), { once: true }); }, 0);
  },

  async removeContact(userId) {
    if (!confirm("Remove this chat? The user will not be notified.")) return;
    await supabase.from('hidden_chats').insert({ user_id: store.user.id, contact_id: userId });
    await supabase.from('contacts').delete().eq('user_id', store.user.id).eq('contact_id', userId);
    this.contacts = this.contacts.filter(c => c.id !== userId);
    if (this.activeChat?.id === userId) {
      this.activeChat = null; this.closeChat();
      document.getElementById('ping-main').innerHTML = `<div class="ping-empty-state"><h3>Select a chat</h3></div>`;
    }
    this.renderChatList();
  },

  setupRealtime() {
    // FIX: Remove existing channel to prevent "already subscribed" crash
    if (this.messageChannel) supabase.removeChannel(this.messageChannel);

    this.messageChannel = supabase.channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new;
        if (m.sender_id === store.user.id) return;

        if (m.is_ai && m.sender_id === store.user.id && this.activeChat?.is_ai) {
          this.chatHistory.push(m); this.renderChatWindow();
        } else if (!m.is_ai && !m.room && m.receiver_id === store.user.id && this.activeChat?.id === m.sender_id) {
          this.chatHistory.push(m); this.renderChatWindow();
          this.fetchContacts();
        } else if (!m.is_ai && !m.room && m.receiver_id === store.user.id) {
          this.fetchContacts();
        }
      }).subscribe();
  },

  checkPendingPing() {
    const targetId = sessionStorage.getItem('ping_target_user');
    if (targetId) {
      sessionStorage.removeItem('ping_target_user');
      setTimeout(async () => {
        const exists = this.contacts.find(c => c.id === targetId);
        if (!exists) await this.addContact(targetId);
        this.openChat('dm', targetId);
      }, 1000);
    }
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

        <button class="btn-primary" style="width: 100%; margin-top: 16px;" onclick="pingInstance.submitLiveSetup()">Start Live</button>
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
      expiry: Date.now() + 3600000 // 1 hour expiry
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
          ${isMobile ? `<button class="live-ctrl-btn" onclick="pingInstance.flipCamera()" title="Flip Camera"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg></button>` : ''}
          <button class="live-ctrl-btn" id="screen-share-btn" onclick="pingInstance.toggleScreenShare()" title="Share Screen"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg></button>
          <button class="live-ctrl-btn" onclick="pingInstance.openInviteModal()" title="Invite Chats"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></button>
          <button class="live-ctrl-btn" onclick="pingInstance.openLiveChat('${store.user.id}')" title="Live Chat"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></button>
          <button class="live-ctrl-btn danger" onclick="pingInstance.endLive()" title="End Live"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
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
    this.liveEndTime = Date.now() + 3600000; // 1 hour

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

  // VIEWER UI
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
      // Insert transaction for the VIEWER (deduction)
      await supabase.from('transactions').insert({
        user_id: store.user.id,
        amount: -entryFee,
        type: 'live_entry',
        status: 'success',
        description: 'Live Session Entry Fee'
      });

      // FIX: Insert transaction for the HOST (income)
      await supabase.from('transactions').insert({
        user_id: hostId,
        amount: entryFee,
        type: 'live_entry',
        status: 'success',
        description: 'Live Session Entry Fee'
      });
    }

    this.liveSessionActive = true;
    this.webrtcIceQueue = [];

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
          <button class="live-ctrl-btn" id="viewer-mute-btn" onclick="pingInstance.toggleViewerMute()" title="Mute/Unmute Host"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg></button>
          <button class="live-ctrl-btn" id="aspect-ratio-btn" onclick="pingInstance.toggleAspectRatio()" title="Best Experience"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg></button>
          <button class="live-ctrl-btn support-btn" id="viewer-support-btn" onclick="pingInstance.supportLiveHost('${hostId}')" title="Support (₦100)"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></button>
          <button class="live-ctrl-btn" onclick="pingInstance.openLiveChat('${hostId}')" title="Live Chat"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></button>
          <button class="live-ctrl-btn danger" onclick="pingInstance.endLive()" title="Leave Live"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
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
    if (video.style.objectFit === 'contain') {
      video.style.objectFit = 'cover';
    } else {
      video.style.objectFit = 'contain';
    }
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

    // Deduct ₦100 immediately
    const { data: profile } = await supabase.from('profiles').select('wallet_balance').eq('id', store.user.id).single();
    if (profile.wallet_balance < 100) return alert("Insufficient funds.");

    const newBalance = profile.wallet_balance - 100;
    await supabase.from('profiles').update({ wallet_balance: newBalance }).eq('id', store.user.id);

    // Determine icon and host cut
    let iconType = '100';
    if (this.supportTapCount >= 10) iconType = 'thunder';
    else if (this.supportTapCount >= 5) iconType = 'clap';

    const hostCut = Math.floor(100 * 0.7); // 70% to host
    const titleEl = document.querySelector('.live-video-overlay h2');
    const sessionTitle = titleEl ? titleEl.innerText : 'Live Session';

    // 1. Handle Viewer's Transaction (Aggregate)
    if (this.viewerSupportTxId) {
        // Transaction exists, fetch current amount and update
        const { data: tx } = await supabase.from('transactions').select('amount').eq('id', this.viewerSupportTxId).single();
        if (tx) {
            await supabase.from('transactions').update({ amount: tx.amount - 100 }).eq('id', this.viewerSupportTxId);
        }
    } else {
        // First tap of the session: Insert new transaction
        const { data: newTx } = await supabase.from('transactions').insert({
            user_id: store.user.id,
            amount: -100,
            type: 'live_support',
            status: 'success',
            description: `Live Support sent: ${sessionTitle}`
        }).select('*').single();

        if (newTx) this.viewerSupportTxId = newTx.id;
    }

    // 2. Broadcast to Host (Host will handle their own transaction aggregation)
    this.presenceChannel.send({
      type: 'broadcast',
      event: 'support',
      payload: {
        viewerId: store.user.id,
        avatarUrl: store.profile.avatar_url,
        iconType: iconType,
        amount: hostCut,
        title: sessionTitle
      }
    });
  },

  // ============================================
  // WEBRTC SIGNALING
  // ============================================
  setupWebRTCAsHost(roomId) {
    if (this.webrtcChannel) supabase.removeChannel(this.webrtcChannel);
    this.webrtcChannel = supabase.channel(`webrtc-${roomId}`)
      .on('broadcast', { event: 'signal' }, async ({ payload }) => {
        if (payload.target !== store.user.id) return;

        if (payload.type === 'viewer_join') {
          this.createPeerConnection(payload.sender);
        } else if (payload.type === 'answer') {
          const pc = this.peerConnections[payload.sender];
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            // Now that remote description is set, we are ready for ICE candidates
          }
        } else if (payload.type === 'ice') {
          const pc = this.peerConnections[payload.sender];
          if (pc && pc.remoteDescription) {
            // Safe to add candidate
            try {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch (e) { console.warn("Host ICE Error:", e); }
          }
        }
      }).subscribe();
  },

  async createPeerConnection(viewerId) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    this.peerConnections[viewerId] = pc;

    if (this.localStream) this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));
    if (this.displayStream && this.isScreenSharing) this.displayStream.getTracks().forEach(track => pc.addTrack(track, this.displayStream));

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
    this.viewerPeerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
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
            // Transaction exists, fetch current amount and update
            const { data: tx } = await supabase.from('transactions').select('amount').eq('id', this.hostSupportTxId).single();
            if (tx) {
                await supabase.from('transactions').update({ amount: tx.amount + payload.amount }).eq('id', this.hostSupportTxId);
            }
        } else {
            // First tip received this session: Insert new transaction
            const { data: newTx } = await supabase.from('transactions').insert({
                user_id: store.user.id,
                amount: payload.amount,
                type: 'live_support',
                status: 'success',
                description: `Live Support received: ${payload.title}`
            }).select('*').single();

            if (newTx) this.hostSupportTxId = newTx.id;
        }
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

    // Local SVG placeholder so we never rely on external sites
    const placeholderAvatar = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23F1F5F9"/%3E%3C/svg%3E';

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

  // LIVE CHAT MODAL
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
          <button class="modal-close" onclick="pingInstance.closeLiveChat()">×</button>
        </div>
        <div class="live-chat-panel-messages" id="live-chat-messages"></div>
        <div class="live-chat-panel-input" id="live-chat-input-area">
          <button class="ping-input-icon" onclick="pingInstance.triggerFileUpload()" title="Upload File"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg></button>
          <input type="file" id="ping-file-input" style="display:none" onchange="pingInstance.handleFileUpload(event)">
          <button class="ping-input-icon ping-mic-btn" id="ping-mic-btn" onclick="pingInstance.startRecording()" title="Record Voice Note"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg></button>
          <input type="text" id="live-chat-input" class="input" placeholder="Message participants..." onkeypress="if(event.key==='Enter') pingInstance.sendLiveMessage('${roomId}')">
          <button class="btn-primary live-chat-send-btn" onclick="pingInstance.sendLiveMessage('${roomId}')"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>
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
      <button class="ping-input-icon" onclick="pingInstance.triggerFileUpload()" title="Upload File"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg></button>
      <input type="file" id="ping-file-input" style="display:none" onchange="pingInstance.handleFileUpload(event)">
      <button class="ping-input-icon ping-mic-btn" id="ping-mic-btn" onclick="pingInstance.startRecording()" title="Record Voice Note"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg></button>
      <input type="text" id="live-chat-input" class="input" placeholder="Message participants..." onkeypress="if(event.key==='Enter') pingInstance.sendLiveMessage('${this.activeLiveRoom}')">
      <button class="btn-primary live-chat-send-btn" onclick="pingInstance.sendLiveMessage('${this.activeLiveRoom}')"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>
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

      let attachmentHtml = '';
      if (m.attachment_url) {
        if (m.attachment_type === 'image') attachmentHtml = `<img src="${m.attachment_url}" class="ping-attachment img">`;
        else if (m.attachment_type === 'audio_note') {
          attachmentHtml = `
            <div class="voice-note-bubble" id="vn-${m.id}">
              <button class="vn-play-btn" onclick="pingInstance.toggleAudio('${m.id}', '${m.attachment_url}')">
                <svg class="vn-icon-play" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                <svg class="vn-icon-pause" style="display:none;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
              </button>
              <div class="vn-progress-bar"><div class="vn-progress-fill" id="vn-fill-${m.id}"></div></div>
              <span class="vn-duration" id="vn-dur-${m.id}">0:00</span>
            </div>
          `;
        }
        else if (m.attachment_type === 'video') attachmentHtml = `<video controls src="${m.attachment_url}" class="ping-attachment video"></video>`;
        else attachmentHtml = `<a href="${m.attachment_url}" target="_blank" class="ping-attachment file">📎 Download File</a>`;
      }

      let contentHtml = m.content ? `<p>${m.content}</p>` : '';

      return `<div class="ping-message ${isMe ? 'sent' : 'received'}">${sender}${attachmentHtml}${contentHtml}<span class="ping-msg-time">${time}</span></div>`;
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

  openInviteModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay live-invite-modal';
    modal.id = 'live-invite-modal';
    modal.style.background = 'rgba(0,0,0,0.8)';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 400px; background: var(--surface);">
        <button class="modal-close" onclick="pingInstance.closeInviteModal()">×</button>
        <h3 style="margin-bottom: 16px;">Invite to Live</h3>
        <div style="max-height: 300px; overflow-y: auto; margin-bottom: 16px;">
          ${this.contacts.map(c => `<div class="ping-chat-item"><input type="checkbox" class="live-invite-cb" data-uid="${c.id}" style="margin-right: 12px;"><span>${c.full_name}</span></div>`).join('')}
        </div>
        <button class="btn-primary" style="width: 100%;" onclick="pingInstance.sendLiveInvites()">Send Invites</button>
      </div>
    `;
    document.body.appendChild(modal);
  },

  closeInviteModal() {
    document.getElementById('live-invite-modal')?.remove();
  },

  async sendLiveInvites() {
    const link = 'Join my live session: ' + window.location.origin + '/dashboard/index.html#/ping';
    const checkboxes = document.querySelectorAll('.live-invite-cb:checked');
    for (let cb of checkboxes) {
      await supabase.from('messages').insert({ sender_id: store.user.id, receiver_id: cb.dataset.uid, content: link, is_ai: false });
    }
    this.closeInviteModal();
    alert("Live invites sent!");
  },

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

    // On mobile, true screen share is not supported in browsers. We use the flip camera feature instead.
    if (isMobile) {
      alert("True screen sharing is not supported on mobile browsers. Use the 'Flip Camera' button to switch to your back camera.");
      return;
    }

    const videoEl = document.getElementById('live-video-feed');
    const btn = document.getElementById('screen-share-btn');

    if (!this.isScreenSharing) {
      try {
        this.displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

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

  async endLive() {
    if (this.liveTimerInterval) clearInterval(this.liveTimerInterval);

    if (this.liveSessionActive && this.liveHostId === store.user.id) {
      this.presenceChannel.send({ type: 'broadcast', event: 'session_ended', payload: {} });
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

    if (!localStorage.getItem('active_live_session')) {
      const main = document.getElementById('ping-main');
      if (main) {
        main.innerHTML = `
          <div class="ping-empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-bottom: 16px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <h3>Select a chat to start pinging</h3>
            <p>Your direct messages, Gliim-PA, and Live sessions live here.</p>
          </div>
        `;
      }
    }
  }
};
