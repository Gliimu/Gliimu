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
          <div class="chat-item active" onclick="alert('Opening Gliim-PA')">
            <div class="chat-avatar ai-avatar">AI</div>
            <div class="chat-info">
              <div class="chat-top-row">
                <span class="chat-name">Gliim-PA</span>
                <span class="chat-time">10:30 AM</span>
              </div>
              <p class="chat-preview">Welcome to Gliimu! How can I assist your research today?</p>
            </div>
          </div>

          <div class="chat-item">
            <div class="chat-avatar" style="background: var(--gradient-gold);">T</div>
            <div class="chat-info">
              <div class="chat-top-row">
                <span class="chat-name">Triad 1 Group</span>
                <span class="chat-time">09:15 AM</span>
              </div>
              <p class="chat-preview">Captain: Don't forget the brainstorming session at 2pm.</p>
            </div>
          </div>

          <div class="chat-item">
            <div class="chat-avatar">G</div>
            <div class="chat-info">
              <div class="chat-top-row">
                <span class="chat-name">Gliimu Admin</span>
                <span class="chat-time">Yesterday</span>
              </div>
              <p class="chat-preview">Your authorship application was received.</p>
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

        <div class="chat-messages">
          <div class="message received">
            <p>Hello! I am your personal assistant. I can help you research topics, get platform statistics, and guide you through your apprenticeship.</p>
            <span class="msg-time">10:30 AM</span>
          </div>
        </div>

        <footer class="chat-input-area">
          <input type="text" class="input" placeholder="Message Gliim-PA..." style="flex: 1;">
          <button class="btn-primary">Send</button>
        </footer>
      </main>
    </div>
  `,
  init() {
    console.log('Messages View Loaded');
  }
};
