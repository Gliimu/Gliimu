import { supabase } from '/shared/js/config.js';
import { store, tierClass } from '../store.js';
import { toggleAudio, attachmentHtml, uploadAttachment, createRecorder, previewText } from '../media.js';
import { computeUnread, isIncomingDm, markChatRead } from '../readState.js?v=29';

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default {
  title: 'Ping',
  template: `
    <div class="ping-shell">
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
            <p>Your direct messages live here.</p>
          </div>
        </div>
      </div>
    </div>
  `,

  init() {
    this.destroy();
    this.disposed = false;
    this.allUsers = [];
    this.contacts = [];
    this.activeChat = null;
    this.chatReady = false;
    this.chatHistory = [];
    this.unreadMap = {};
    this.previewMap = {};

    this.recorder = createRecorder({
      instanceName: 'pingInstance',
      inputAreaId: 'ping-input-area',
      restore: () => this.renderChatWindow(),
      send: async (url) => {
        const contactId = this.sendingAudioContactId;
        if (!contactId) return;
        const { data, error } = await supabase.from('messages').insert({
          sender_id: store.user.id,
          receiver_id: contactId,
          attachment_url: url,
          attachment_type: 'audio_note',
          content: '',
          is_ai: false
        }).select('*').single();
        if (error) return alert("Failed to send voice note: " + error.message);
        this.appendSentMessage(data, contactId);
      }
    });

    window.pingInstance = {
      openChat: (type, id) => this.openChat(type, id),
      getActiveChat: () => this.activeChat?.id || null,
      openHubMention: (postId, commentId) => this.openHubMention(postId, commentId),
      sendMessage: () => this.sendMessage(),
      searchUsers: (query) => this.searchUsers(query),
      addContact: (userId) => this.addContact(userId),
      closeChat: () => this.closeChat(),
      showChatMenu: (e, userId) => this.showChatMenu(e, userId),
      removeContact: (userId) => this.removeContact(userId),
      triggerFileUpload: () => this.triggerFileUpload(),
      handleFileUpload: (event) => this.handleFileUpload(event),
      startRecording: () => {
        if (this.sendingAudioContactId) return;
        this.recordingContactId = this.activeChat?.id;
        return this.recorder.start();
      },
      stopRecording: () => this.recorder.stop(),
      cancelRecording: () => this.recorder.cancel(),
      sendAudioNote: async () => {
        if (this.sendingAudioContactId) return;
        this.sendingAudioContactId = this.recordingContactId;
        try { await this.recorder.sendNote(); }
        finally { this.sendingAudioContactId = null; }
      },
      togglePreviewAudio: () => this.recorder.togglePreview(),
      toggleAudio: (msgId, url) => toggleAudio(msgId, url),
      showMessageMenu: (e, msgId) => this.showMessageMenu(e, msgId),
      editMessage: (msgId) => this.editMessage(msgId),
      deleteMessage: (msgId) => this.deleteMessage(msgId),
      saveEdit: (msgId) => this.saveEdit(msgId),
      cancelEdit: () => this.renderChatWindow(),
      onSearch: (query) => this.onSearch(query)
    };

    this.setupTopbar();
    this.fetchUsers();
    this.setupRealtime();
    this.fetchContacts().then(() => { if (!this.disposed) this.checkPendingPing(); });
    this.onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && this.isChatVisible()) this.openChat('dm', this.activeChat.id);
    };
    this.onReadStorage = (event) => {
      if (event.key === `gliimu_read_map_${store.user.id}`) this.fetchContacts();
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('storage', this.onReadStorage);
  },

  destroy() {
    this.disposed = true;
    this.contactsRequest = (this.contactsRequest || 0) + 1;
    this.chatRequest = (this.chatRequest || 0) + 1;
    if (this.messageChannel) supabase.removeChannel(this.messageChannel);
    this.messageChannel = null;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('storage', this.onReadStorage);
    this.activeChat = null;
    this.chatReady = false;
    this.recorder?.cancel();
    document.querySelectorAll('.ctx-menu').forEach(menu => menu.remove());
  },

  setupTopbar() {
    const topbarRight = document.getElementById('topbar-right-actions');
    // Clear right actions — tabs handle mode switching now
    if (topbarRight) topbarRight.innerHTML = '';
  },

  onSearch(query) {
    this.searchUsers(query);
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
        ? `<img src="${escapeHtml(u.avatar_url)}" class="ping-search-avatar" style="object-fit:cover;">`
        : `<div class="ping-search-avatar"></div>`;
      return `
        <div class="ping-search-item" onclick="pingInstance.addContact('${u.id}')">
          ${avatar}
          <span>${escapeHtml(u.full_name)}</span>
        </div>
      `;
    }).join('');
  },

  async addContact(userId) {
    await supabase.from('hidden_chats').delete().eq('user_id', store.user.id).eq('contact_id', userId);
    if (this.disposed) return;

    document.getElementById('ping-search-dropdown').style.display = 'none';
    document.getElementById('ping-search-dropdown').innerHTML = '';

    await this.fetchContacts();

    if (!this.contacts.find(c => c.id === userId)) {
      const { data: profile } = await supabase.from('profiles')
        .select('id, full_name, avatar_url, total_gp')
        .eq('id', userId)
        .single();
      if (profile) {
        this.contacts.push(profile);
        this.renderChatList();
      }
    }

    this.openChat('dm', userId);
  },

  async fetchUsers() {
    const { data } = await supabase.from('profiles').select('id, full_name, avatar_url, total_gp').neq('id', store.user.id);
    this.allUsers = data || [];
  },

  async fetchContacts() {
    const request = this.contactsRequest = (this.contactsRequest || 0) + 1;
    const results = await Promise.all([
      supabase.from('hidden_chats').select('contact_id, hidden_at').eq('user_id', store.user.id),
      supabase.from('messages').select('sender_id, receiver_id, created_at, read_at, room, is_ai, is_admin, content, attachment_url, attachment_type').eq('receiver_id', store.user.id),
      supabase.from('messages').select('sender_id, receiver_id, created_at, room, is_ai, is_admin, content, attachment_url, attachment_type').eq('sender_id', store.user.id).not('receiver_id', 'is', null)
    ]);
    if (this.disposed || request !== this.contactsRequest) return;
    const failure = results.find(result => result.error);
    if (failure) {
      console.warn('Could not load chats:', failure.error.message);
      const list = document.getElementById('ping-chat-list');
      if (list && !this.contacts.length) list.textContent = 'Could not load chats. Please reopen Ping to retry.';
      return;
    }
    const [hiddenChats, received, sent] = results.map(result => result.data || []);
    const receivedMsgs = received.filter(m => isIncomingDm(store.user.id, m));
    const sentMsgs = sent.filter(m => !m.room && !m.is_ai && !m.is_admin);
    const hiddenMap = Object.fromEntries(hiddenChats.map(h => [h.contact_id, new Date(h.hidden_at).getTime()]));
    const userIds = new Set();
    const lastMsgMap = {};
    const previewMap = {};

    [...receivedMsgs, ...sentMsgs].forEach(m => {
      const otherId = m.sender_id === store.user.id ? m.receiver_id : m.sender_id;
      const time = new Date(m.created_at).getTime();
      if (!hiddenMap[otherId] || time > hiddenMap[otherId]) userIds.add(otherId);
      if (time > (lastMsgMap[otherId] || 0)) {
        const text = previewText(m);
        if (text) previewMap[otherId] = { text, mine: m.sender_id === store.user.id };
      }
      lastMsgMap[otherId] = Math.max(lastMsgMap[otherId] || 0, time);
    });
    userIds.delete(store.user.id);

    let profiles = [];
    if (userIds.size) {
      const { data, error } = await supabase.from('profiles').select('id, full_name, avatar_url, total_gp').in('id', [...userIds]);
      if (this.disposed || request !== this.contactsRequest) return;
      if (error) {
        console.warn('Could not load chat profiles:', error.message);
        return;
      }
      profiles = data || [];
    }
    this.unreadMap = computeUnread(store.user.id, receivedMsgs).unreadMap;
    this.previewMap = previewMap;
    this.contacts = profiles.sort((a, b) => (lastMsgMap[b.id] || 0) - (lastMsgMap[a.id] || 0));
    if (this.activeChat) {
      const header = document.querySelector('#ping-main .ping-chat-header');
      if (header) header.innerHTML = this.chatHeaderHtml();
      const input = document.getElementById('ping-input');
      if (input) input.placeholder = `Message ${this.activeChat.name || 'Gliimait'}...`;
    }
    this.renderChatList();
  },

  renderChatList() {
    const list = document.getElementById('ping-chat-list');
    if (!list) return;

    const usersHtml = this.contacts.map(u => {
      const avatarClass = tierClass(u.total_gp, 'ping-avatar');
      const avatar = u.avatar_url
        ? `<img src="${escapeHtml(u.avatar_url)}" class="${avatarClass}" style="object-fit:cover;" onclick="event.stopPropagation(); pingInstance.showChatMenu(event, '${u.id}')">`
        : `<div class="${avatarClass}" onclick="event.stopPropagation(); pingInstance.showChatMenu(event, '${u.id}')"></div>`;

      const unreadCount = this.unreadMap[u.id] || 0;
      const unreadBadge = unreadCount > 0 ? `<span class="chat-unread-badge">${unreadCount > 9 ? '9+' : unreadCount}</span>` : '';
      const preview = this.previewMap[u.id];
      const snippet = preview ? (preview.mine ? `You: ${preview.text}` : preview.text) : 'No messages yet';

      return `
        <div class="ping-chat-item ${this.activeChat?.id === u.id ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''}" onclick="pingInstance.openChat('dm', '${u.id}')">
          ${avatar}
          <div class="ping-chat-info">
            <span class="ping-chat-name">${escapeHtml(u.full_name || 'Gliimait')}</span>
            <span class="ping-chat-preview">${escapeHtml(snippet)}</span>
          </div>
          ${unreadBadge}
        </div>
      `;
    }).join('');


    list.innerHTML = usersHtml;
  },

  async openChat(type, id) {
    if (type !== 'dm') return;
    const user = this.contacts.find(u => u.id === id);
    if (!user) return;
    const request = this.chatRequest = (this.chatRequest || 0) + 1;
    const draft = this.activeChat?.id === id ? document.getElementById('ping-input')?.value || '' : '';
    this.activeChat = null;
    this.recorder?.cancel();
    this.activeChat = { type: 'dm', id: user.id, name: user.full_name, avatar: user.avatar_url, total_gp: user.total_gp };
    this.chatReady = false;
    this.chatEvents = [];
    document.getElementById('ping-main').innerHTML = `<div class="ping-chat-header">${this.chatHeaderHtml()}</div><p id="ping-load-status">Loading messages...</p>`;
    document.getElementById('ping-container').classList.add('chat-open');
    const { data, error } = await supabase.from('messages').select('*')
      .or(`and(sender_id.eq.${store.user.id},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${store.user.id})`)
      .order('created_at', { ascending: true });
    if (this.disposed || request !== this.chatRequest) return;
    if (error) {
      document.getElementById('ping-load-status').textContent = 'Could not load messages. Go back and select the chat to retry.';
      return;
    }
    const messages = new Map((data || []).filter(m => !m.room && !m.is_ai && !m.is_admin).map(m => [m.id, m]));
    this.chatEvents.forEach(m => messages.set(m.id, m));
    this.chatHistory = [...messages.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    this.chatReady = true;
    this.renderChatWindow();
    document.getElementById('ping-input').value = draft;
    this.readActiveChat();
    this.renderChatList();
  },

  isChatVisible() {
    return !this.disposed && this.chatReady && this.mode === 'chats' && this.activeChat
      && document.visibilityState === 'visible'
      && document.getElementById('ping-container')?.classList.contains('chat-open');
  },

  readActiveChat() {
    if (!this.isChatVisible()) return;
    const id = this.activeChat.id;
    const incoming = this.chatHistory.filter(m => isIncomingDm(store.user.id, m));
    if (!incoming.length) return;
    const through = incoming.reduce((latest, m) => m.created_at > latest ? m.created_at : latest, incoming[0].created_at);
    markChatRead(store.user.id, id, new Date(through).getTime());
    delete this.unreadMap[id];
    supabase.rpc('mark_dm_read_through', { p_other: id, p_through: through }).then(({ error }) => {
      if (error) console.warn('Could not sync read receipt:', error.message);
    });
  },

  closeChat() {
    this.chatRequest = (this.chatRequest || 0) + 1;
    this.activeChat = null;
    this.chatReady = false;
    this.recorder?.cancel();
    document.getElementById('ping-container')?.classList.remove('chat-open');
    const main = document.getElementById('ping-main');
    if (main) main.innerHTML = '<div class="ping-empty-state"><h3>Select a chat</h3></div>';
    this.renderChatList();
  },

  openHubMention(postId, commentId) {
    sessionStorage.setItem('openReadViewId', postId);
    if (commentId) sessionStorage.setItem('openCommentId', commentId);
    window.location.hash = '#/library';
  },

  chatHeaderHtml() {
    const avatarClass = tierClass(this.activeChat.total_gp, 'ping-avatar');
    const avatarHtml = this.activeChat.avatar
      ? `<img src="${escapeHtml(this.activeChat.avatar)}" class="${avatarClass}" style="object-fit:cover;">`
      : `<div class="${avatarClass}"></div>`;
    return `
      <button class="ping-back-btn" onclick="pingInstance.closeChat()"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg></button>
      ${avatarHtml}
      <div><h3>${escapeHtml(this.activeChat.name || 'Gliimait')}</h3><span>Direct Message</span></div>`;
  },

  renderChatWindow() {
    const main = document.getElementById('ping-main');
    if (!main || !this.activeChat) return;
    const input = document.getElementById('ping-input');
    const draft = input?.value || '';
    const focused = document.activeElement === input;
    const selection = input ? [input.selectionStart, input.selectionEnd] : null;

    let messagesHtml = '';
    if (this.chatHistory.length === 0) {
      messagesHtml = `<div style="text-align: center; color: var(--text-muted); margin-top: 40px;">No messages yet. Say hello!</div>`;
    } else {
      messagesHtml = this.chatHistory.map(m => {
        const isMe = m.sender_id === store.user.id && !isIncomingDm(store.user.id, m);
        const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isEditable = isMe && (Date.now() - new Date(m.created_at).getTime() < 180000);

        const attachments = attachmentHtml(m, 'pingInstance');

        let contentHtml = '';
        if (m.content) {
          if (m.content.includes('[[hub:')) {
            // Hub mention ping: readable text + deep link to the post/comment
            const readable = escapeHtml(m.content.replace(/\s*\[\[hub:[^\]]+\]\]/g, '').trim())
              .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="word-break: break-all; color: inherit; text-decoration: underline;">$1</a>');
            const parts = m.content.match(/\[\[hub:([0-9a-fA-F-]+)(?::([0-9a-fA-F-]+))?\]\]/);
            const hubPost = parts ? parts[1] : '';
            const hubComment = parts && parts[2] ? parts[2] : '';
            contentHtml = `<p>${readable}</p><button class="btn-primary btn-sm" style="margin-top:4px;" onclick="pingInstance.openHubMention('${hubPost}', '${hubComment}')">Check it out</button>`;
          } else if (m.content.startsWith('🎥 Session accepted:')) {
            const formattedText = escapeHtml(m.content).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="word-break: break-all; color: inherit; text-decoration: underline;">$1</a>');
            contentHtml = `<p>${formattedText}</p><button class="btn-primary btn-sm" style="margin-top:4px;" onclick="window.location.hash='#/live'">Open Live</button>`;
          } else {
            const formattedText = escapeHtml(m.content).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="word-break: break-all; color: inherit; text-decoration: underline;">$1</a>');
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

    main.innerHTML = `
      <div class="ping-chat-header">${this.chatHeaderHtml()}</div>

      <div class="ping-messages" id="ping-messages">${messagesHtml}</div>

      <div class="ping-input-area" id="ping-input-area">
        <button class="ping-input-icon" onclick="pingInstance.triggerFileUpload()" title="Upload File">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
        </button>
        <input type="file" id="ping-file-input" style="display:none" onchange="pingInstance.handleFileUpload(event)">

        <button class="ping-input-icon ping-mic-btn" id="ping-mic-btn" onclick="pingInstance.startRecording()" title="Record Voice Note">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg>
        </button>

        <input type="text" id="ping-input" class="input" placeholder="Message ${escapeHtml(this.activeChat.name || 'Gliimait')}..." onkeypress="if(event.key==='Enter') pingInstance.sendMessage()">
        <button class="btn-primary" onclick="pingInstance.sendMessage()"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>
      </div>
    `;

    const restoredInput = document.getElementById('ping-input');
    restoredInput.value = draft;
    if (focused) {
      restoredInput.focus();
      restoredInput.setSelectionRange(...selection);
    }
    const msgContainer = document.getElementById('ping-messages');
    msgContainer.scrollTop = msgContainer.scrollHeight;
  },

  async sendMessage() {
    const input = document.getElementById('ping-input');
    const text = input?.value.trim();
    if (!text || !this.activeChat) return;
    const contactId = this.activeChat.id;
    input.value = '';

    const { data, error } = await supabase.from('messages').insert({
      sender_id: store.user.id,
      receiver_id: contactId,
      content: text,
      is_ai: false
    }).select('*').single();
    if (error) {
      const currentInput = document.getElementById('ping-input');
      if (this.activeChat?.id === contactId && currentInput && !currentInput.value) currentInput.value = text;
      return alert("Failed to send: " + error.message);
    }
    this.appendSentMessage(data, contactId);
  },

  appendSentMessage(message, contactId) {
    if (this.disposed) return;
    if (this.activeChat?.id === contactId && this.chatReady && !this.chatHistory.some(m => m.id === message.id)) {
      this.chatHistory.push(message);
      this.renderChatWindow();
    }
    this.fetchContacts();
  },

  triggerFileUpload() { document.getElementById('ping-file-input').click(); },

  async handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file || !this.activeChat) return;
    const contactId = this.activeChat.id;

    let uploaded;
    try { uploaded = await uploadAttachment(file); } catch (err) { return alert("Upload failed."); }

    const { data, error } = await supabase.from('messages').insert({
      sender_id: store.user.id,
      receiver_id: contactId,
      attachment_url: uploaded.url,
      attachment_type: uploaded.type,
      content: '',
      is_ai: false
    }).select('*').single();
    if (error) return alert("Failed to send file: " + error.message);
    this.appendSentMessage(data, contactId);
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
    if (!msg || msg.sender_id !== store.user.id) return;
    document.getElementById(`msg-${msgId}`).innerHTML = `
      <textarea class="input ping-edit-textarea" id="edit-${msgId}">${escapeHtml(msg.content)}</textarea>
      <div class="ping-edit-actions"><button class="btn-secondary btn-sm" onclick="pingInstance.cancelEdit()">Cancel</button><button class="btn-primary btn-sm" onclick="pingInstance.saveEdit('${msgId}')">Save</button></div>
    `;
  },

  async saveEdit(msgId) {
    const newText = document.getElementById(`edit-${msgId}`).value.trim();
    if (!newText) return;
    const { error } = await supabase.from('messages').update({ content: newText, is_edited: true }).eq('id', msgId);
    if (error) return alert("Could not edit message: " + error.message);
    const msg = this.chatHistory.find(m => m.id === msgId);
    if (msg) { msg.content = newText; msg.is_edited = true; }
    this.renderChatWindow();
  },

  async deleteMessage(msgId) {
    if (!await appConfirm("Delete this message?", { okText: 'Delete', danger: true })) return;
    const { error } = await supabase.from('messages').delete().eq('id', msgId);
    if (error) return alert("Could not delete message: " + error.message);
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
    const through = new Date().toISOString();
    const { error: clearError } = await supabase.from('hidden_chats').delete().eq('user_id', store.user.id).eq('contact_id', userId);
    if (clearError) return alert("Could not remove chat: " + clearError.message);
    const { error } = await supabase.from('hidden_chats').insert({ user_id: store.user.id, contact_id: userId, hidden_at: through });
    if (error) return alert("Could not remove chat: " + error.message);
    markChatRead(store.user.id, userId, new Date(through).getTime());
    const { error: readError } = await supabase.rpc('mark_dm_read_through', { p_other: userId, p_through: through });
    if (readError) console.warn('Could not sync removed chat receipt:', readError.message);
    if (this.disposed) return;
    this.contacts = this.contacts.filter(c => c.id !== userId);
    delete this.unreadMap[userId];
    delete this.previewMap[userId];
    if (this.activeChat?.id === userId) this.closeChat();
    this.renderChatList();
  },

  setupRealtime() {
    if (this.messageChannel) supabase.removeChannel(this.messageChannel);
    const receive = payload => {
      if (this.disposed) return;
      const m = payload.new;
      if (m && !m.room && !m.is_ai && !m.is_admin) {
        const incoming = isIncomingDm(store.user.id, m);
        const otherId = incoming ? m.sender_id : m.receiver_id;
        if (otherId && this.activeChat?.id === otherId) {
          if (!this.chatReady) {
            this.chatEvents.push(m);
          } else {
            const index = this.chatHistory.findIndex(message => message.id === m.id);
            const changed = index === -1 || ['content', 'attachment_url', 'attachment_type', 'is_edited'].some(key => this.chatHistory[index][key] !== m[key]);
            if (index === -1) this.chatHistory.push(m);
            else this.chatHistory[index] = m;
            this.chatHistory.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            if (changed) this.renderChatWindow();
            if (incoming && payload.eventType === 'INSERT') this.readActiveChat();
          }
        }
      }
      if (payload.eventType === 'DELETE' && payload.old?.id) {
        this.chatHistory = this.chatHistory.filter(message => message.id !== payload.old.id);
        if (this.chatReady) this.renderChatWindow();
      }
      this.fetchContacts();
    };
    this.messageChannel = supabase.channel(`ping-messages-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${store.user.id}` }, receive)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `sender_id=eq.${store.user.id}` }, payload => {
        if (payload.new?.receiver_id !== store.user.id) receive(payload);
      }).subscribe(status => {
        if (status === 'SUBSCRIBED' && !this.disposed) this.fetchContacts();
      });
  },

  async checkPendingPing() {
    const targetId = sessionStorage.getItem('ping_target_user');
    if (!targetId || this.disposed) return;
    sessionStorage.removeItem('ping_target_user');
    const exists = this.contacts.find(c => c.id === targetId);
    if (!exists) await this.addContact(targetId);
    else this.openChat('dm', targetId);
  }
};
