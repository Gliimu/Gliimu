import { supabase } from '/shared/js/config.js';
import { API_BASE_URL } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Ping',
  template: `
    <div class="ping-layout" id="ping-container">
      <div class="ping-sidebar" id="ping-sidebar">
        <div class="ping-sidebar-header">
          <h3>Chats</h3>
          <button class="btn-primary btn-sm" id="go-live-btn" onclick="pingInstance.openLiveSetup()">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
            Go Live
          </button>
        </div>
        <div class="ping-search">
          <input type="text" id="ping-search-input" class="input" placeholder="Search users..." oninput="pingInstance.searchUsers(this.value)">
        </div>
        <div class="ping-chat-list" id="ping-chat-list">
          <p style="color: var(--text-muted); text-align: center; padding: 20px;">Loading chats...</p>
        </div>
      </div>

      <div class="ping-main" id="ping-main">
        <div class="ping-empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-bottom: 16px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          <h3>Select a chat to start pinging</h3>
          <p>Your direct messages and Gliim-PA live here.</p>
        </div>
      </div>
    </div>
  `,

  init() {
    this.allUsers = [];
    this.activeChat = null;
    this.chatHistory = [];
    this.localStream = null;

    window.pingInstance = {
      openChat: (userId) => this.openChat(userId),
      sendMessage: () => this.sendMessage(),
      searchUsers: (query) => this.searchUsers(query),
      closeChat: () => this.closeChat(),
      openLiveSetup: () => this.openLiveSetup(),
      toggleMute: (type) => this.toggleMute(type),
      copyLiveLink: () => this.copyLiveLink(),
      endLive: () => this.endLive()
    };

    this.setupTopbar();
    this.checkPendingPing();
    this.fetchUsers().then(() => {
      // Default to Gliim-PA on all devices
      this.openChat('ai');
    });
    this.setupRealtime();
  },

  setupTopbar() {
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    if (topbarDynamic) {
      topbarDynamic.innerHTML = `
        <div class="hub-topbar-search" style="max-width: 100%;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="ping-top-search" placeholder="Search users to ping..." oninput="pingInstance.searchUsers(this.value)">
        </div>
      `;
    }
  },

  searchUsers(query) {
    const q = query.toLowerCase();
    // Sync both search inputs
    const topSearch = document.getElementById('ping-top-search');
    const sideSearch = document.getElementById('ping-search-input');
    if (topSearch && topSearch.value !== query) topSearch.value = query;
    if (sideSearch && sideSearch.value !== query) sideSearch.value = query;

    const filtered = this.allUsers.filter(u => u.full_name?.toLowerCase().includes(q));
    this.renderChatList(filtered);
  },

  async checkPendingPing() {
    const targetId = sessionStorage.getItem('ping_target_user');
    if (targetId) {
      sessionStorage.removeItem('ping_target_user');
      setTimeout(() => this.openChat(targetId), 500);
    }
  },

  async fetchUsers() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, total_gp')
      .neq('id', store.user.id)
      .order('full_name', { ascending: true });

    if (error) { console.error(error); return; }
    this.allUsers = data || [];
    this.renderChatList(this.allUsers);
  },

  renderChatList(users) {
    const list = document.getElementById('ping-chat-list');
    if (!list) return;

    const paHtml = `
      <div class="ping-chat-item ${this.activeChat?.id === 'ai' ? 'active' : ''}" onclick="pingInstance.openChat('ai')">
        <div class="ping-avatar ai-avatar">AI</div>
        <div class="ping-chat-info">
          <span class="ping-chat-name">Gliim-PA</span>
          <span class="ping-chat-preview">Your elite AI assistant</span>
        </div>
      </div>
    `;

    const usersHtml = users.map(u => {
      const avatarClass = u.total_gp >= 1000 ? 'ping-avatar glow-avatar' : 'ping-avatar';
      const avatar = u.avatar_url ? `<img src="${u.avatar_url}" class="${avatarClass}" style="object-fit:cover;">` : `<div class="${avatarClass}">${u.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
      return `
        <div class="ping-chat-item ${this.activeChat?.id === u.id ? 'active' : ''}" onclick="pingInstance.openChat('${u.id}')">
          ${avatar}
          <div class="ping-chat-info">
            <span class="ping-chat-name">${u.full_name || 'Gliimait'}</span>
            <span class="ping-chat-preview">Click to start chatting</span>
          </div>
        </div>
      `;
    }).join('');

    list.innerHTML = paHtml + usersHtml;
  },

  async openChat(userId) {
    if (userId === 'ai') {
      this.activeChat = { id: 'ai', name: 'Gliim-PA', avatar: 'AI', is_ai: true };
      this.chatHistory = [];

      const { data: aiMsgs } = await supabase.from('messages')
        .select('*')
        .eq('sender_id', store.user.id)
        .eq('is_ai', true)
        .order('created_at', { ascending: true });

      if (aiMsgs && aiMsgs.length > 0) {
        this.chatHistory = aiMsgs.map(m => ({
          role: m.is_ai ? 'assistant' : 'user',
          content: m.content
        }));
      }
    } else {
      const user = this.allUsers.find(u => u.id === userId);
      if (!user) return;
      this.activeChat = {
        id: user.id,
        name: user.full_name,
        avatar: user.avatar_url,
        total_gp: user.total_gp,
        is_ai: false
      };

      const { data: msgs } = await supabase.from('messages')
        .select('*')
        .or(`and(sender_id.eq.${store.user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${store.user.id})`)
        .order('created_at', { ascending: true });

      this.chatHistory = msgs || [];
    }

    this.renderChatList(this.allUsers);
    this.renderChatWindow();

    // On mobile, slide in the main view
    document.getElementById('ping-container').classList.add('chat-open');
  },

  closeChat() {
    document.getElementById('ping-container').classList.remove('chat-open');
  },

  renderChatWindow() {
    const main = document.getElementById('ping-main');
    if (!main || !this.activeChat) return;

    const avatarClass = this.activeChat.total_gp >= 1000 ? 'ping-avatar glow-avatar' : 'ping-avatar';
    const avatarHtml = this.activeChat.is_ai
      ? `<div class="ping-avatar ai-avatar">AI</div>`
      : (this.activeChat.avatar ? `<img src="${this.activeChat.avatar}" class="${avatarClass}" style="object-fit:cover;">` : `<div class="${avatarClass}">${this.activeChat.name?.charAt(0).toUpperCase() || 'G'}</div>`);

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
        return `<div class="ping-message ${isMe ? 'sent' : 'received'}"><p>${m.content}</p><span class="ping-msg-time">${time}</span></div>`;
      }).join('');
    }

    if (this.activeChat.is_ai && this.chatHistory.length === 0) {
      messagesHtml = `<div class="ping-message received"><p>Hello! I am Gliim-PA. How can I assist your research today?</p></div>`;
    }

    main.innerHTML = `
      <div class="ping-chat-header">
        <button class="ping-back-btn" onclick="pingInstance.closeChat()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        </button>
        ${avatarHtml}
        <div>
          <h3>${this.activeChat.name}</h3>
          <span>${this.activeChat.is_ai ? 'Online · AI Assistant' : 'Direct Message'}</span>
        </div>
      </div>

      <div class="ping-messages" id="ping-messages">${messagesHtml}</div>

      <div class="ping-input-area">
        <input type="text" id="ping-input" class="input" placeholder="Message ${this.activeChat.name}..." onkeypress="if(event.key==='Enter') pingInstance.sendMessage()">
        <button class="btn-primary" onclick="pingInstance.sendMessage()">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
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
    const msgContainer = document.getElementById('ping-messages');

    if (this.activeChat.is_ai) {
      msgContainer.innerHTML += `<div class="ping-message sent"><p>${text}</p></div>`;
      msgContainer.scrollTop = msgContainer.scrollHeight;

      await supabase.from('messages').insert({ sender_id: store.user.id, receiver_id: null, content: text, is_ai: false });
      this.chatHistory.push({ role: 'user', content: text });

      msgContainer.innerHTML += `<div class="ping-message received" id="ai-typing"><p>Thinking...</p></div>`;
      msgContainer.scrollTop = msgContainer.scrollHeight;

      try {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: this.chatHistory })
        });
        const data = await response.json();
        document.getElementById('ai-typing')?.remove();

        if (data.reply) {
          await supabase.from('messages').insert({ sender_id: store.user.id, receiver_id: null, content: data.reply, is_ai: true });
          msgContainer.innerHTML += `<div class="ping-message received"><p>${data.reply}</p></div>`;
          this.chatHistory.push({ role: 'assistant', content: data.reply });
        }
      } catch (err) {
        document.getElementById('ai-typing')?.remove();
        alert("Error connecting to AI.");
      }
      msgContainer.scrollTop = msgContainer.scrollHeight;
    } else {
      const tempId = 'temp-' + Date.now();
      msgContainer.innerHTML += `<div class="ping-message sent" id="${tempId}"><p>${text}</p><span class="ping-msg-time">Just now</span></div>`;
      msgContainer.scrollTop = msgContainer.scrollHeight;

      const { data, error } = await supabase.from('messages').insert({
        sender_id: store.user.id, receiver_id: this.activeChat.id, content: text
      }).select('*').single();

      if (error) {
        document.getElementById(tempId)?.remove();
        alert("Failed to send message: " + error.message);
      } else {
        this.chatHistory.push(data);
        const realEl = document.getElementById(tempId);
        if (realEl) {
          const time = new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          realEl.querySelector('.ping-msg-time').innerText = time;
        }
      }
    }
  },

  setupRealtime() {
    supabase.channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new;
        if (!m.is_ai && m.receiver_id === store.user.id && this.activeChat?.id === m.sender_id) {
          this.chatHistory.push(m);
          const msgContainer = document.getElementById('ping-messages');
          if (msgContainer) {
            const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            msgContainer.innerHTML += `<div class="ping-message received"><p>${m.content}</p><span class="ping-msg-time">${time}</span></div>`;
            msgContainer.scrollTop = msgContainer.scrollHeight;
          }
        }
      }).subscribe();
  },

  // ============================================
  // MINIMAL LIVE STUDIO
  // ============================================
  openLiveSetup() {
    if (store.profile.total_gp < 1000) {
      return alert("Only eligible gliimaits (1000+ GP) can go live.");
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay live-studio-overlay';
    modal.innerHTML = `
      <div class="live-studio-container">
        <div class="live-video-wrapper">
          <video id="live-video-feed" autoplay muted playsinline></video>
          <div class="live-video-overlay">
            <span class="live-indicator"><span class="live-pulse"></span> LIVE</span>
            <h2>Gliimu Live Session</h2>
          </div>
        </div>
        <div class="live-host-toolbar">
          <button class="live-ctrl-btn" id="mute-mic-btn" title="Mute/Unmute Mic">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg>
          </button>
          <button class="live-ctrl-btn" id="mute-cam-btn" title="Mute/Unmute Cam">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
          </button>
          <button class="live-ctrl-btn" onclick="pingInstance.copyLiveLink()" title="Copy Invite Link">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
          </button>
          <button class="live-ctrl-btn danger" onclick="pingInstance.endLive()" title="End Live">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    this.startMedia();
    document.getElementById('mute-mic-btn').addEventListener('click', () => this.toggleMute('audio'));
    document.getElementById('mute-cam-btn').addEventListener('click', () => this.toggleMute('video'));
  },

  async startMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      document.getElementById('live-video-feed').srcObject = this.localStream;
    } catch (err) {
      alert("Camera/Mic access denied.");
    }
  },

  toggleMute(type) {
    if (!this.localStream) return;
    if (type === 'audio') {
      const track = this.localStream.getAudioTracks()[0];
      if (track) track.enabled = !track.enabled;
    } else if (type === 'video') {
      const track = this.localStream.getVideoTracks()[0];
      if (track) track.enabled = !track.enabled;
    }
  },

  copyLiveLink() {
    const link = window.location.origin + '/dashboard/index.html#/ping';
    navigator.clipboard.writeText(link).then(() => {
      alert("Invite link copied! Paste it in a ping message to invite others.");
    });
  },

  endLive() {
    if (!confirm("End live session?")) return;
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    document.querySelector('.live-studio-overlay')?.remove();
  }
};
