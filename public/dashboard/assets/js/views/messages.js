import { supabase } from '/shared/js/config.js';
import { API_BASE_URL } from '/shared/js/config.js';
import { store, tierClass } from '../store.js';
import { toggleAudio, attachmentHtml, uploadAttachment, createRecorder } from '../media.js';
import { computeUnread, markChatRead } from '../readState.js';

export default {
  title: 'Ping',
  template: `
    <div class="ping-layout" id="ping-container">
      <div class="ping-sidebar" id="ping-sidebar">
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
    this.contacts = [];
    this.activeChat = null;
    this.chatHistory = [];
    this.unreadMap = {};
    this.messageChannel = null;

    this.recorder = createRecorder({
      instanceName: 'pingInstance',
      inputAreaId: 'ping-input-area',
      restore: () => this.renderChatWindow(),
      send: async (url) => {
        const msgData = { sender_id: store.user.id, attachment_url: url, attachment_type: 'audio_note', content: '', is_ai: false };
        if (!this.activeChat.is_ai) msgData.receiver_id = this.activeChat.id;
        const { data: newMsg } = await supabase.from('messages').insert(msgData).select('*').single();
        if (newMsg) { this.chatHistory.push(newMsg); this.renderChatWindow(); }
      }
    });

    window.pingInstance = {
      openChat: (type, id) => this.openChat(type, id),
      openHubMention: (postId, commentId) => this.openHubMention(postId, commentId),
      sendMessage: () => this.sendMessage(),
      searchUsers: (query) => this.searchUsers(query),
      addContact: (userId) => this.addContact(userId),
      closeChat: () => this.closeChat(),
      showChatMenu: (e, userId) => this.showChatMenu(e, userId),
      removeContact: (userId) => this.removeContact(userId),
      triggerFileUpload: () => this.triggerFileUpload(),
      handleFileUpload: (event) => this.handleFileUpload(event),
      startRecording: () => this.recorder.start(),
      stopRecording: () => this.recorder.stop(),
      cancelRecording: () => this.recorder.cancel(),
      sendAudioNote: () => this.recorder.sendNote(),
      togglePreviewAudio: () => this.recorder.togglePreview(),
      toggleAudio: (msgId, url) => toggleAudio(msgId, url),
      showMessageMenu: (e, msgId) => this.showMessageMenu(e, msgId),
      editMessage: (msgId) => this.editMessage(msgId),
      deleteMessage: (msgId) => this.deleteMessage(msgId),
      saveEdit: (msgId) => this.saveEdit(msgId),
      cancelEdit: () => this.renderChatWindow()
    };

    this.setupTopbar();
    this.checkPendingPing();
    this.fetchUsers();
    this.fetchContacts();
    this.setupRealtime();
  },

  setupTopbar() {
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    const topbarRight = document.getElementById('topbar-right-actions');

    if (topbarDynamic) {
      topbarDynamic.innerHTML = `
        <div class="ping-top-search-wrapper">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="ping-top-search" class="ping-top-search-input" placeholder="Search users to add..." oninput="pingInstance.searchUsers(this.value)">
          <div class="ping-search-dropdown" id="ping-search-dropdown"></div>
        </div>
      `;
    }

    // Gliim-PA shortcut: top-right on desktop, bottom-bar right on mobile
    if (topbarRight) {
      topbarRight.innerHTML = `
        <button class="gliim-pa-btn" title="Chat with Gliim-PA" onclick="pingInstance.openChat('ai', 'ai')">
          <img src="/icons/gliimpa.png" alt="Gliim-PA">
          <span class="gliim-pa-label">Gliim-PA</span>
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

    // Fetch unread counts per sender (computed locally; receivers can't write read_at)
    const { data: receivedMsgs } = await supabase.from('messages').select('sender_id, created_at, read_at, room, is_ai').eq('receiver_id', store.user.id);

    const { unreadMap } = computeUnread(store.user.id, receivedMsgs);
    this.unreadMap = unreadMap;

    receivedMsgs.forEach(m => {
      const msgTime = new Date(m.created_at).getTime();
      if (!hiddenMap[m.sender_id] || msgTime > hiddenMap[m.sender_id]) {
        if (!userIds.includes(m.sender_id)) userIds.push(m.sender_id);
      }
    });

    const { data: sentMsgs } = await supabase.from('messages').select('receiver_id, created_at, room').eq('sender_id', store.user.id).not('receiver_id', 'is', null);
    sentMsgs.forEach(m => {
      if (m.room) return;
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

    const usersHtml = this.contacts.map(u => {
      const avatarClass = tierClass(u.total_gp, 'ping-avatar');
      const avatar = u.avatar_url ? `<img src="${u.avatar_url}" class="${avatarClass}" style="object-fit:cover;" onclick="event.stopPropagation(); pingInstance.showChatMenu(event, '${u.id}')">` : `<div class="${avatarClass}" onclick="event.stopPropagation(); pingInstance.showChatMenu(event, '${u.id}')">${u.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;

      // Unread Badge
      const unreadCount = this.unreadMap[u.id] || 0;
      const unreadBadge = unreadCount > 0 ? `<span class="chat-unread-badge">${unreadCount > 9 ? '9+' : unreadCount}</span>` : '';

      return `
        <div class="ping-chat-item ${this.activeChat?.id === u.id ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''}" onclick="pingInstance.openChat('dm', '${u.id}')">
          ${avatar}
          <div class="ping-chat-info">
            <span class="ping-chat-name">${u.full_name}</span>
            <span class="ping-chat-preview">${u.total_gp >= 10000 ? 'Maxed out' : (u.total_gp || 0) + ' GP'}</span>
          </div>
          ${unreadBadge}
        </div>
      `;
    }).join('');


    list.innerHTML = usersHtml;
  },

  async openChat(type, id) {
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

      // Mark as read locally (RLS blocks receiver-side read_at updates)
      const clearedCount = this.unreadMap[id] || 0;
      markChatRead(store.user.id, id);
      delete this.unreadMap[id];
      // Server-side receipt clears the unread dot on the user's other devices too
      supabase.rpc('mark_dm_read', { p_other: id }).then(({ error }) => {
        if (error) console.warn('Server read receipt unavailable (run sql/all.sql):', error.message);
      });

      if (window.NotificationManager && clearedCount > 0) {
        window.NotificationManager.counts.ping = Math.max(0, (window.NotificationManager.counts.ping || 0) - clearedCount);
        window.NotificationManager.updateBadge('ping', window.NotificationManager.counts.ping);
      }
    }

    this.renderChatList();
    this.renderChatWindow();
    document.getElementById('ping-container').classList.add('chat-open');
  },

  closeChat() {
    document.getElementById('ping-container').classList.remove('chat-open');
  },

  openHubMention(postId, commentId) {
    sessionStorage.setItem('openReadViewId', postId);
    if (commentId) sessionStorage.setItem('openCommentId', commentId);
    window.location.hash = '#/hub';
  },

  renderChatWindow() {
    const main = document.getElementById('ping-main');
    if (!main || !this.activeChat) return;

    const avatarClass = tierClass(this.activeChat.total_gp, 'ping-avatar');
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

        const attachments = attachmentHtml(m, 'pingInstance');

        let contentHtml = '';
        if (m.content) {
          if (m.content.includes('[[hub:')) {
            // Hub mention ping: readable text + deep link to the post/comment
            const readable = m.content.replace(/\s*\[\[hub:[^\]]+\]\]/g, '').trim()
              .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="word-break: break-all; color: inherit; text-decoration: underline;">$1</a>');
            const parts = m.content.match(/\[\[hub:([0-9a-fA-F-]+)(?::([0-9a-fA-F-]+))?\]\]/);
            const hubPost = parts ? parts[1] : '';
            const hubComment = parts && parts[2] ? parts[2] : '';
            contentHtml = `<p>${readable}</p><button class="btn-primary btn-sm" style="margin-top:4px;" onclick="pingInstance.openHubMention('${hubPost}', '${hubComment}')">Check it out</button>`;
          } else if (m.content.startsWith('🎥 Session accepted:')) {
            const formattedText = m.content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="word-break: break-all; color: inherit; text-decoration: underline;">$1</a>');
            contentHtml = `<p>${formattedText}</p><button class="btn-primary btn-sm" style="margin-top:4px;" onclick="window.location.hash='#/live'">Open Live Page</button>`;
          } else {
            const formattedText = m.content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="word-break: break-all; color: inherit; text-decoration: underline;">$1</a>');
            contentHtml = `<p>${formattedText}</p>`;
          }
        }

        const editIndicator = m.is_edited ? `<span class="ping-edited">edited</span>` : '';
        const menuBtn = isEditable ? `<button class="ping-msg-menu-btn" onclick="event.stopPropagation(); pingInstance.showMessageMenu(event, '${m.id}')">⋯</button>` : '';

        return `
          <div class="ping-message ${isMe ? 'sent' : 'received'}" id="msg-${m.id}">
            ${attachments}
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

    let uploaded;
    try { uploaded = await uploadAttachment(file); } catch (err) { return alert("Upload failed."); }

    const msgData = { sender_id: store.user.id, attachment_url: uploaded.url, attachment_type: uploaded.type, content: '', is_ai: false };
    if (!this.activeChat.is_ai) msgData.receiver_id = this.activeChat.id;
    else msgData.receiver_id = null;

    const { data: newMsg } = await supabase.from('messages').insert(msgData).select('*').single();
    if (newMsg) { this.chatHistory.push(newMsg); this.renderChatWindow(); }
    event.target.value = '';
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
    if (!await appConfirm("Delete this message?", { okText: 'Delete', danger: true })) return;
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
    menu.innerHTML = `
      <div class="ctx-item" onclick="document.querySelectorAll('.ctx-menu').forEach(m => m.remove()); sessionStorage.setItem('view_profile_id', '${userId}'); window.location.hash='#/profile';">View Profile</div>
      <div class="ctx-item danger" onclick="pingInstance.removeContact('${userId}')">Remove Chat</div>
    `;
    document.body.appendChild(menu);
    setTimeout(() => { document.addEventListener('click', () => menu.remove(), { once: true }); }, 0);
  },

  async removeContact(userId) {
    if (!await appConfirm("Remove this chat? The user will not be notified.", { okText: 'Remove', danger: true })) return;
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
    if (this.messageChannel) supabase.removeChannel(this.messageChannel);

    // Unique channel name: reusing a cached, already-subscribed channel throws
    this.messageChannel = supabase.channel(`ping-messages-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new;
        if (m.sender_id === store.user.id) return;
        if (m.is_ai && m.sender_id === store.user.id && this.activeChat?.is_ai) {
          this.chatHistory.push(m); this.renderChatWindow();
        } else if (!m.is_ai && !m.room && m.receiver_id === store.user.id && this.activeChat?.id === m.sender_id) {
          markChatRead(store.user.id, m.sender_id);
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
  }
};
