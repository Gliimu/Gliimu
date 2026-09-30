import { supabase } from '/shared/js/config.js';
import { API_BASE_URL } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Ping',
  template: `
    <div class="ping-layout" id="ping-container">
      <div class="ping-sidebar">
        <div class="ping-search">
          <input type="text" id="ping-search-input" class="input" placeholder="Search users...">
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

    window.pingInstance = {
      openChat: (userId) => this.openChat(userId),
      sendMessage: () => this.sendMessage()
    };

    this.checkPendingPing();
    this.fetchUsers();
    this.setupRealtime();
  },

  // Check if user clicked "Ask Me" from the Hub
  async checkPendingPing() {
    const targetId = sessionStorage.getItem('ping_target_user');
    if (targetId) {
      sessionStorage.removeItem('ping_target_user');
      // Wait for users to load, then open chat
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

    // Add search listener
    document.getElementById('ping-search-input').addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const filtered = this.allUsers.filter(u => u.full_name?.toLowerCase().includes(query));
      this.renderChatList(filtered);
    });
  },

  renderChatList(users) {
    const list = document.getElementById('ping-chat-list');

    // Always keep Gliim-PA at the top
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

      // Fetch existing messages
      const { data: msgs } = await supabase.from('messages')
        .select('*')
        .or(`and(sender_id.eq.${store.user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${store.user.id})`)
        .order('created_at', { ascending: true });

      this.chatHistory = msgs || [];
    }

    this.renderChatList(this.allUsers); // Update active state
    this.renderChatWindow();
  },

  renderChatWindow() {
    const main = document.getElementById('ping-main');
    if (!this.activeChat) return;

    const avatarClass = this.activeChat.total_gp >= 1000 ? 'ping-avatar glow-avatar' : 'ping-avatar';
    const avatarHtml = this.activeChat.is_ai
      ? `<div class="ping-avatar ai-avatar">AI</div>`
      : (this.activeChat.avatar ? `<img src="${this.activeChat.avatar}" class="${avatarClass}" style="object-fit:cover;">` : `<div class="${avatarClass}">${this.activeChat.name?.charAt(0).toUpperCase() || 'G'}</div>`);

    let messagesHtml = '';
    if (this.chatHistory.length === 0 && !this.activeChat.is_ai) {
      messagesHtml = `<div style="text-align: center; color: var(--text-muted); margin-top: 40px;">No messages yet. Say hello!</div>`;
    } else {
      messagesHtml = this.chatHistory.map(m => {
        const isMe = m.sender_id === store.user.id;
        const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `
          <div class="ping-message ${isMe ? 'sent' : 'received'}">
            <p>${m.content}</p>
            <span class="ping-msg-time">${time}</span>
          </div>
        `;
      }).join('');
    }

    // AI Welcome Message
    if (this.activeChat.is_ai && this.chatHistory.length === 0) {
      messagesHtml = `
        <div class="ping-message received">
          <p>Hello! I am Gliim-PA. How can I assist your research today?</p>
          <span class="ping-msg-time">Just now</span>
        </div>
      `;
    }

    main.innerHTML = `
      <div class="ping-chat-header">
        ${avatarHtml}
        <div>
          <h3>${this.activeChat.name}</h3>
          <span>${this.activeChat.is_ai ? 'Online · AI Assistant' : 'Direct Message'}</span>
        </div>
      </div>

      <div class="ping-messages" id="ping-messages">
        ${messagesHtml}
      </div>

      <div class="ping-input-area">
        <input type="text" id="ping-input" class="input" placeholder="Message ${this.activeChat.name}..." onkeypress="if(event.key==='Enter') pingInstance.sendMessage()">
        <button class="btn-primary" onclick="pingInstance.sendMessage()">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
    `;

    // Scroll to bottom
    const msgContainer = document.getElementById('ping-messages');
    msgContainer.scrollTop = msgContainer.scrollHeight;
  },

  async sendMessage() {
    const input = document.getElementById('ping-input');
    const text = input.value.trim();
    if (!text || !this.activeChat) return;

    input.value = '';

    if (this.activeChat.is_ai) {
      // 1. Add user message to UI immediately
      const msgContainer = document.getElementById('ping-messages');
      msgContainer.innerHTML += `
        <div class="ping-message sent">
          <p>${text}</p>
          <span class="ping-msg-time">Just now</span>
        </div>
      `;
      msgContainer.scrollTop = msgContainer.scrollHeight;

      // 2. Save user message to DB
      await supabase.from('messages').insert({
        sender_id: store.user.id,
        receiver_id: null,
        content: text,
        is_ai: false
      });

      // 3. Call AI Backend
      this.chatHistory.push({ role: 'user', content: text });

      // Show typing indicator
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
          // Save AI reply to DB
          await supabase.from('messages').insert({
            sender_id: store.user.id,
            receiver_id: null,
            content: data.reply,
            is_ai: true
          });

          // Add to UI
          msgContainer.innerHTML += `
            <div class="ping-message received">
              <p>${data.reply}</p>
              <span class="ping-msg-time">Just now</span>
            </div>
          `;
          this.chatHistory.push({ role: 'assistant', content: data.reply });
        }
      } catch (err) {
        document.getElementById('ai-typing')?.remove();
        alert("Error connecting to AI.");
      }
      msgContainer.scrollTop = msgContainer.scrollHeight;

    } else {
      // Standard User-to-User Message
      const { data } = await supabase.from('messages').insert({
        sender_id: store.user.id,
        receiver_id: this.activeChat.id,
        content: text
      }).select('*').single();

      if (data) {
        this.chatHistory.push(data);
        const msgContainer = document.getElementById('ping-messages');
        const time = new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        msgContainer.innerHTML += `
          <div class="ping-message sent">
            <p>${data.content}</p>
            <span class="ping-msg-time">${time}</span>
          </div>
        `;
        msgContainer.scrollTop = msgContainer.scrollHeight;
      }
    }
  },

  setupRealtime() {
    supabase.channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new;

        // If it's a standard message and I am the receiver, and the chat is open
        if (!m.is_ai && m.receiver_id === store.user.id && this.activeChat?.id === m.sender_id) {
          this.chatHistory.push(m);
          const msgContainer = document.getElementById('ping-messages');
          if (msgContainer) {
            const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            msgContainer.innerHTML += `
              <div class="ping-message received">
                <p>${m.content}</p>
                <span class="ping-msg-time">${time}</span>
              </div>
            `;
            msgContainer.scrollTop = msgContainer.scrollHeight;
          }
        }
      })
      .subscribe();
  }
};
