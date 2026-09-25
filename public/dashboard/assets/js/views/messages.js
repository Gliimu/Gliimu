import { API_BASE_URL } from '/shared/js/config.js';

export default {
  title: 'Messages',
  template: `
    <div class="messages-layout">
      <!-- Chat List -->
      <aside class="chat-sidebar">
        <div class="chat-search">
          <input type="text" class="input" placeholder="Search chats...">
        </div>
        <div class="chat-list">
          <div class="chat-item active" id="chat-pa">
            <div class="chat-avatar ai-avatar">AI</div>
            <div class="chat-info">
              <div class="chat-top-row">
                <span class="chat-name">Gliim-PA</span>
                <span class="chat-time">Now</span>
              </div>
              <p class="chat-preview">Your elite personal assistant</p>
            </div>
          </div>
        </div>
      </aside>

      <!-- Chat Window -->
      <main class="chat-window">
        <header class="chat-header">
          <div class="chat-header-info">
            <div class="chat-header-avatar ai-avatar">AI</div>
            <div>
              <h3>Gliim-PA</h3>
              <span class="chat-status">Online · Personal Assistant</span>
            </div>
          </div>
        </header>

        <div class="chat-messages" id="chat-messages">
          <div class="message received">
            <p>Hello! I am Gliim-PA. How can I assist your research today?</p>
            <span class="msg-time">Just now</span>
          </div>
        </div>

        <footer class="chat-input-area">
          <input type="text" id="chat-input" class="input" placeholder="Message Gliim-PA..." style="flex: 1;">
          <button id="send-msg-btn" class="btn-primary">Send</button>
        </footer>
      </main>
    </div>
  `,
  init() {
    this.chatHistory = [];

    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-msg-btn');

    const sendMessage = async () => {
      const text = input.value.trim();
      if (!text) return;

      // 1. Add user message to UI
      const messagesContainer = document.getElementById('chat-messages');
      messagesContainer.innerHTML += `
        <div class="message sent">
          <p>${text}</p>
          <span class="msg-time">Just now</span>
        </div>
      `;

      // Scroll to bottom
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      input.value = '';
      sendBtn.innerText = 'Thinking...';
      sendBtn.disabled = true;

      // 2. Add to history for AI context
      this.chatHistory.push({ role: 'user', content: text });

      try {
        // 3. Call Node.js Backend
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: this.chatHistory })
        });

        const data = await response.json();

        if (data.reply) {
          // Add AI response to UI
          messagesContainer.innerHTML += `
            <div class="message received">
              <p>${data.reply}</p>
              <span class="msg-time">Just now</span>
            </div>
          `;
          // Add to history
          this.chatHistory.push({ role: 'assistant', content: data.reply });
        } else {
          throw new Error(data.error);
        }
      } catch (error) {
        messagesContainer.innerHTML += `
          <div class="message received" style="background: var(--error-light); color: var(--error-text);">
            <p>Connection error. Is the server awake?</p>
          </div>
        `;
      }

      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      sendBtn.innerText = 'Send';
      sendBtn.disabled = false;
    };

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }
};
