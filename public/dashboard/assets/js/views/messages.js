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
          <button class="ping-tab" id="tab-groups" onclick="pingInstance.switchTab('groups')">Groups</button>
        </div>
        <div class="ping-chat-list" id="ping-chat-list">
          <p style="color: var(--text-muted); text-align: center; padding: 20px;">Loading chats...</p>
        </div>
      </div>

      <div class="ping-main" id="ping-main">
        <div class="ping-empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-bottom: 16px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          <h3>Select a chat to start pinging</h3>
          <p>Your direct messages, groups, and Gliim-PA live here.</p>
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
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.currentRecordingUrl = null;
    this.currentAudio = null;
    this.currentAudioId = null;
    this.recordTimer = null;
    this.recordSeconds = 0;
    this.activeTab = 'chats';

    window.pingInstance = {
      openChat: (type, id) => this.openChat(type, id),
      sendMessage: () => this.sendMessage(),
      searchUsers: (query) => this.searchUsers(query),
      addContact: (userId) => this.addContact(userId),
      closeChat: () => this.closeChat(),
      openLiveSetup: () => this.openLiveSetup(),
      toggleMute: (type) => this.toggleMute(type),
      endLive: () => this.endLive(),
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
      sendLiveInvites: () => this.sendLiveInvites(),
      switchTab: (tab) => this.switchTab(tab)
    };

    this.setupTopbar();
    this.checkPendingPing();
    this.fetchUsers();
    this.fetchContacts();
    this.setupRealtime();
  },

  switchTab(tab) {
    this.activeTab = tab;
    document.getElementById('tab-chats')?.classList.remove('active');
    document.getElementById('tab-groups')?.classList.remove('active');
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    this.renderChatList();
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
    const { data: explicitContacts } = await supabase.from('contacts').select('contact_id').eq('user_id', store.user.id);
    let userIds = explicitContacts.map(c => c.contact_id);

    const { data: receivedMsgs } = await supabase.from('messages').select('sender_id').eq('receiver_id', store.user.id);
    userIds = userIds.concat(receivedMsgs.map(m => m.sender_id));

    const { data: sentMsgs } = await supabase.from('messages').select('receiver_id').eq('sender_id', store.user.id).not('receiver_id', 'is', null);
    userIds = userIds.concat(sentMsgs.map(m => m.receiver_id));

    const uniqueIds = [...new Set(userIds)].filter(id => id !== store.user.id);

    if (uniqueIds.length === 0) {
      this.contacts = [];
      this.renderChatList();
      return;
    }

    const { data: contactProfiles } = await supabase.from('profiles').select('id, full_name, avatar_url, total_gp').in('id', uniqueIds);

    // Sort by most recent message
    const { data: recentMsgs } = await supabase.from('messages')
      .select('sender_id, receiver_id, created_at')
      .or(`sender_id.eq.${store.user.id},receiver_id.eq.${store.user.id}`)
      .order('created_at', { ascending: false });

    const lastMsgMap = {};
    if (recentMsgs) {
      recentMsgs.forEach(m => {
        const otherId = m.sender_id === store.user.id ? m.receiver_id : m.sender_id;
        if (otherId && !lastMsgMap[otherId]) {
          lastMsgMap[otherId] = new Date(m.created_at).getTime();
        }
      });
    }

    this.contacts = (contactProfiles || []).sort((a, b) => {
      const timeA = lastMsgMap[a.id] || 0;
      const timeB = lastMsgMap[b.id] || 0;
      return timeB - timeA; // Descending (most recent first)
    });

    this.renderChatList();
  },

  renderChatList() {
    const list = document.getElementById('ping-chat-list');
    if (!list) return;

    let staticItems = '';
    if (this.activeTab === 'chats') {
      staticItems = `
        <div class="ping-chat-item ${this.activeChat?.id === 'ai' ? 'active' : ''}" onclick="pingInstance.openChat('ai', 'ai')">
          <img src="/icons/gliimpa.png" class="ping-avatar" style="object-fit:cover; background:var(--gradient-primary);">
          <div class="ping-chat-info"><span class="ping-chat-name">Gliim-PA</span><span class="ping-chat-preview">Your elite AI assistant</span></div>
        </div>
      `;
    } else if (this.activeTab === 'groups') {
      staticItems = `
        <div class="ping-chat-item ${this.activeChat?.id === 'media' ? 'active' : ''}" onclick="pingInstance.openChat('room', 'media')">
          <div class="ping-avatar room-avatar">M</div>
          <div class="ping-chat-info"><span class="ping-chat-name">Media</span><span class="ping-chat-preview">General Media Group</span></div>
        </div>
        <div class="ping-chat-item ${this.activeChat?.id === 'tech' ? 'active' : ''}" onclick="pingInstance.openChat('room', 'tech')">
          <div class="ping-avatar room-avatar">T</div>
          <div class="ping-chat-info"><span class="ping-chat-name">Tech</span><span class="ping-chat-preview">General Tech Group</span></div>
        </div>
        <div class="ping-chat-item ${this.activeChat?.id === 'design' ? 'active' : ''}" onclick="pingInstance.openChat('room', 'design')">
          <div class="ping-avatar room-avatar">D</div>
          <div class="ping-chat-info"><span class="ping-chat-name">Design</span><span class="ping-chat-preview">General Design Group</span></div>
        </div>
      `;
    }

    const usersHtml = this.activeTab === 'chats' ? this.contacts.map(u => {
      const avatarClass = u.total_gp >= 1000 ? 'ping-avatar glow-avatar' : 'ping-avatar';
      const avatar = u.avatar_url ? `<img src="${u.avatar_url}" class="${avatarClass}" style="object-fit:cover;" onclick="event.stopPropagation(); pingInstance.showChatMenu(event, '${u.id}')">` : `<div class="${avatarClass}" onclick="event.stopPropagation(); pingInstance.showChatMenu(event, '${u.id}')">${u.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
      return `
        <div class="ping-chat-item ${this.activeChat?.id === u.id ? 'active' : ''}" onclick="pingInstance.openChat('dm', '${u.id}')">
          ${avatar}
          <div class="ping-chat-info"><span class="ping-chat-name">${u.full_name}</span><span class="ping-chat-preview">Direct Message</span></div>
        </div>
      `;
    }).join('') : '';

    list.innerHTML = staticItems + usersHtml;
  },

  async openChat(type, id) {
    if (type === 'ai') {
      this.activeChat = { type: 'ai', id: 'ai', name: 'Gliim-PA', avatar: '/icons/gliimpa.png', is_ai: true };
      this.chatHistory = [];
      const { data: aiMsgs } = await supabase.from('messages').select('*').eq('sender_id', store.user.id).eq('is_ai', true).order('created_at', { ascending: true });
      if (aiMsgs) this.chatHistory = aiMsgs.map(m => ({ role: m.is_ai ? 'assistant' : 'user', content: m.content, created_at: m.created_at }));
    } else if (type === 'room') {
      this.activeChat = { type: 'room', id: id, name: id.charAt(0).toUpperCase() + id.slice(1), avatar: id.charAt(0).toUpperCase(), is_ai: false, is_room: true };
      const { data: roomMsgs } = await supabase.from('messages').select('*, profiles:sender_id(full_name, avatar_url)').eq('room', id).order('created_at', { ascending: true });
      this.chatHistory = roomMsgs || [];
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
    } else if (this.activeChat.is_room) {
      avatarHtml = `<div class="ping-avatar room-avatar">${this.activeChat.avatar}</div>`;
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

        const senderName = this.activeChat.is_room && !isMe ? `<span class="ping-msg-sender">${m.profiles?.full_name || 'User'}</span>` : '';
        const editIndicator = m.is_edited ? `<span class="ping-edited">edited</span>` : '';
        const menuBtn = isEditable ? `<button class="ping-msg-menu-btn" onclick="event.stopPropagation(); pingInstance.showMessageMenu(event, '${m.id}')">⋯</button>` : '';

        return `
          <div class="ping-message ${isMe ? 'sent' : 'received'}" id="msg-${m.id}">
            ${senderName}
            ${attachmentHtml}
            ${m.content ? `<p>${m.content}</p>` : ''}
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
        <div><h3>${this.activeChat.name}</h3><span>${this.activeChat.is_ai ? 'Online · AI Assistant' : this.activeChat.is_room ? 'General Group' : 'Direct Message'}</span></div>
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
    else if (this.activeChat.is_room) msgData.room = this.activeChat.id;
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
    if (this.activeChat.is_room) msgData.room = this.activeChat.id;
    else if (!this.activeChat.is_ai) msgData.receiver_id = this.activeChat.id;
    else msgData.receiver_id = null;

    const { data: newMsg } = await supabase.from('messages').insert(msgData).select('*').single();
    if (newMsg) { this.chatHistory.push(newMsg); this.renderChatWindow(); }
    event.target.value = '';
  },

  // ============================================
  // CUSTOM VOICE NOTES UI
  // ============================================
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

      const inputArea = document.getElementById('ping-input-area');
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
        const m = Math.floor(this.recordSeconds / 60);
        const s = this.recordSeconds % 60;
        const timerEl = document.getElementById('rec-timer');
        if (timerEl) timerEl.innerText = `${m}:${s.toString().padStart(2, '0')}`;
      }, 1000);

    } catch (err) { alert("Microphone access denied."); }
  },

  processRecording() {
    const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
    this.currentRecordingUrl = URL.createObjectURL(blob);

    const inputArea = document.getElementById('ping-input-area');
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
      const fill = document.getElementById('preview-fill');
      const dur = document.getElementById('preview-dur');
      if (fill) fill.style.width = `${progress}%`;
      if (dur) {
        const m = Math.floor(this.previewAudio.currentTime / 60);
        const s = Math.floor(this.previewAudio.currentTime % 60);
        dur.innerText = `${m}:${s.toString().padStart(2, '0')}`;
      }
    });
    this.previewAudio.addEventListener('ended', () => {
      const btn = document.getElementById('preview-play-btn');
      if (btn) {
        btn.querySelector('.vn-icon-play').style.display = 'block';
        btn.querySelector('.vn-icon-pause').style.display = 'none';
      }
      const fill = document.getElementById('preview-fill');
      if (fill) fill.style.width = `0%`;
    });
  },

  togglePreviewAudio() {
    if (!this.previewAudio) return;
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
    const url = data.publicUrl;

    const msgData = { sender_id: store.user.id, attachment_url: url, attachment_type: 'audio_note', content: '', is_ai: false };
    if (this.activeChat.is_room) msgData.room = this.activeChat.id;
    else if (!this.activeChat.is_ai) msgData.receiver_id = this.activeChat.id;
    else msgData.receiver_id = null;

    const { data: newMsg } = await supabase.from('messages').insert(msgData).select('*').single();
    if (newMsg) { this.chatHistory.push(newMsg); this.renderChatWindow(); }

    this.cancelRecording();
  },

  cancelRecording() {
    if (this.recordTimer) clearInterval(this.recordTimer);
    if (this.previewAudio) { this.previewAudio.pause(); this.previewAudio = null; }
    this.isRecording = false;
    this.currentRecordingUrl = null;
    this.audioChunks = [];
    if (this.localStream) this.localStream.getTracks().forEach(t => t.stop());
    this.renderChatWindow();
  },

  stopRecording() {
    if (this.recordTimer) clearInterval(this.recordTimer);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    if (this.localStream) this.localStream.getTracks().forEach(t => t.stop());
    this.isRecording = false;
  },

  toggleAudio(msgId, url) {
    if (this.currentAudio) {
      this.currentAudio.pause();
      const oldBtn = document.querySelector(`#vn-${this.currentAudioId} .vn-play-btn`);
      if (oldBtn) {
        oldBtn.querySelector('.vn-icon-play').style.display = 'block';
        oldBtn.querySelector('.vn-icon-pause').style.display = 'none';
      }
      if (this.currentAudioId === msgId) {
        this.currentAudio = null;
        this.currentAudioId = null;
        return;
      }
    }

    this.currentAudio = new Audio(url);
    this.currentAudioId = msgId;
    this.currentAudio.play();

    const btn = document.querySelector(`#vn-${msgId} .vn-play-btn`);
    if (btn) {
      btn.querySelector('.vn-icon-play').style.display = 'none';
      btn.querySelector('.vn-icon-pause').style.display = 'block';
    }

    this.currentAudio.addEventListener('timeupdate', () => {
      const progress = (this.currentAudio.currentTime / this.currentAudio.duration) * 100;
      const fill = document.getElementById(`vn-fill-${msgId}`);
      const dur = document.getElementById(`vn-dur-${msgId}`);
      if (fill) fill.style.width = `${progress}%`;
      if (dur) {
        const m = Math.floor(this.currentAudio.currentTime / 60);
        const s = Math.floor(this.currentAudio.currentTime % 60);
        dur.innerText = `${m}:${s.toString().padStart(2, '0')}`;
      }
    });

    this.currentAudio.addEventListener('ended', () => {
      if (btn) {
        btn.querySelector('.vn-icon-play').style.display = 'block';
        btn.querySelector('.vn-icon-pause').style.display = 'none';
      }
      const fill = document.getElementById(`vn-fill-${msgId}`);
      if (fill) fill.style.width = `0%`;
      const dur = document.getElementById(`vn-dur-${msgId}`);
      if (dur) dur.innerText = `0:00`;
      this.currentAudio = null;
      this.currentAudioId = null;
    });
  },

  // ============================================
  // EDIT / DELETE MESSAGES
  // ============================================
  showMessageMenu(e, msgId) {
    e.stopPropagation();
    document.querySelectorAll('.ctx-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.innerHTML = `
      <div class="ctx-item" onclick="pingInstance.editMessage('${msgId}')">Edit</div>
      <div class="ctx-item danger" onclick="pingInstance.deleteMessage('${msgId}')">Delete</div>
    `;
    document.body.appendChild(menu);
    setTimeout(() => { document.addEventListener('click', () => menu.remove(), { once: true }); }, 0);
  },

  editMessage(msgId) {
    const msg = this.chatHistory.find(m => m.id === msgId);
    if (!msg) return;
    const msgEl = document.getElementById(`msg-${msgId}`);
    if (!msgEl) return;

    msgEl.innerHTML = `
      <textarea class="input ping-edit-textarea" id="edit-${msgId}">${msg.content}</textarea>
      <div class="ping-edit-actions">
        <button class="btn-secondary btn-sm" onclick="pingInstance.cancelEdit()">Cancel</button>
        <button class="btn-primary btn-sm" onclick="pingInstance.saveEdit('${msgId}')">Save</button>
      </div>
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

  // ============================================
  // CHAT LIST MENU & REALTIME
  // ============================================
  showChatMenu(e, userId) {
    e.stopPropagation();
    document.querySelectorAll('.ctx-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.innerHTML = `
      <div class="ctx-item" onclick="window.location.hash='#/profile';">View Profile</div>
      <div class="ctx-item" onclick="alert('User reported.');">Report</div>
      <div class="ctx-item danger" onclick="pingInstance.removeContact('${userId}')">Remove Chat</div>
    `;
    document.body.appendChild(menu);
    setTimeout(() => { document.addEventListener('click', () => menu.remove(), { once: true }); }, 0);
  },

  async removeContact(userId) {
    if (!confirm("Remove this chat? The user will not be notified.")) return;
    await supabase.from('contacts').delete().eq('user_id', store.user.id).eq('contact_id', userId);
    this.contacts = this.contacts.filter(c => c.id !== userId);
    if (this.activeChat?.id === userId) {
      this.activeChat = null;
      this.closeChat();
      document.getElementById('ping-main').innerHTML = `<div class="ping-empty-state"><h3>Select a chat to start pinging</h3></div>`;
    }
    this.renderChatList();
  },

  setupRealtime() {
    supabase.channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new;

        // Ignore our own messages to prevent duplication
        if (m.sender_id === store.user.id) return;

        if (m.is_ai && m.sender_id === store.user.id && this.activeChat?.is_ai) {
          this.chatHistory.push(m);
          this.renderChatWindow();
        } else if (!m.is_ai && !m.room && m.receiver_id === store.user.id && this.activeChat?.id === m.sender_id) {
          this.chatHistory.push(m);
          this.renderChatWindow();
        } else if (m.room && this.activeChat?.id === m.room) {
          supabase.from('profiles').select('full_name, avatar_url').eq('id', m.sender_id).single().then(({ data }) => {
            m.profiles = data;
            this.chatHistory.push(m);
            this.renderChatWindow();
          });
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
  // MINIMAL LIVE STUDIO
  // ============================================
  openLiveSetup() {
    if (store.profile.total_gp < 1000) return alert("Only eligible gliimaits (1000+ GP) can go live.");
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
          <button class="live-ctrl-btn" id="mute-mic-btn" title="Mute/Unmute Mic"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg></button>
          <button class="live-ctrl-btn" id="mute-cam-btn" title="Mute/Unmute Cam"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></button>
          <button class="live-ctrl-btn" onclick="pingInstance.openInviteModal()" title="Invite Chats"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></button>
          <button class="live-ctrl-btn danger" onclick="pingInstance.endLive()" title="End Live"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this.startMedia();
    document.getElementById('mute-mic-btn').addEventListener('click', () => this.toggleMute('audio'));
    document.getElementById('mute-cam-btn').addEventListener('click', () => this.toggleMute('video'));
  },

  openInviteModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.background = 'rgba(0,0,0,0.8)';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 400px;">
        <button class="modal-close" onclick="this.parentElement.remove()">×</button>
        <h3 style="margin-bottom: 16px;">Invite to Live</h3>
        <div style="max-height: 300px; overflow-y: auto; margin-bottom: 16px;">
          ${this.contacts.map(c => `
            <div class="ping-chat-item" style="cursor: pointer;">
              <input type="checkbox" class="live-invite-cb" data-uid="${c.id}" style="margin-right: 12px;">
              <span>${c.full_name}</span>
            </div>
          `).join('')}
        </div>
        <button class="btn-primary" style="width: 100%;" onclick="pingInstance.sendLiveInvites()">Send Invites</button>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async sendLiveInvites() {
    const link = window.location.origin + '/dashboard/index.html#/ping';
    const checkboxes = document.querySelectorAll('.live-invite-cb:checked');
    for (let cb of checkboxes) {
      const uid = cb.dataset.uid;
      await supabase.from('messages').insert({
        sender_id: store.user.id, receiver_id: uid, content: `Join my live session: ${link}`, is_ai: false
      });
    }
    document.querySelector('.modal-overlay:last-child')?.remove();
    alert("Live invites sent!");
  },

  async startMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      document.getElementById('live-video-feed').srcObject = this.localStream;
    } catch (err) { alert("Camera/Mic access denied."); }
  },

  toggleMute(type) {
    if (!this.localStream) return;
    if (type === 'audio') { const t = this.localStream.getAudioTracks()[0]; if (t) t.enabled = !t.enabled; }
    else if (type === 'video') { const t = this.localStream.getVideoTracks()[0]; if (t) t.enabled = !t.enabled; }
  },

  endLive() {
    if (!confirm("End live session?")) return;
    if (this.localStream) this.localStream.getTracks().forEach(track => track.stop());
    document.querySelector('.live-studio-overlay')?.remove();
  }
};
