// chat.js - Community Chat with Socket.io

// ============================================
// CONFIGURATION
// ============================================

const SOCKET_URL = 'http://127.0.0.1:3000';
let socket = null;
let currentUser = null;
let currentChannel = 'general';
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let audioPreviewUrl = null;

// Mock data for offline mode
let mockMessages = [
  {
    id: 'msg_001',
    sender: 'system',
    senderName: 'System',
    text: 'Welcome to the Gliimu Community Chat!',
    type: 'text',
    timestamp: new Date().toISOString(),
    avatar: null
  }
];

let mockOnlineUsers = [
  { id: 'user_001', name: 'Admin User', username: 'admin', role: 'Admin', online: true },
  { id: 'user_002', name: 'John Student', username: 'john_student', role: 'Student', online: true },
  { id: 'user_003', name: 'Jane Instructor', username: 'jane_instructor', role: 'Instructor', online: false }
];

// ============================================
// INITIALIZATION
// ============================================

function initChat() {
  console.log('Chat initializing...');
  
  currentUser = JSON.parse(localStorage.getItem('gliimu_user') || 'null');
  
  if (!currentUser) {
    // Demo user for testing
    currentUser = {
      id: 'demo_user',
      username: 'demo_user',
      name: 'Demo User',
      role: 'Student',
      avatar: 'https://ui-avatars.com/api/?name=Demo+User&background=random'
    };
  }
  
  updateUserUI();
  setupEventListeners();
  initSocket();
  loadMessages();
  loadOnlineUsers();
}

function updateUserUI() {
  const userName = document.getElementById('currentUserName');
  const userAvatar = document.getElementById('currentUserAvatar');
  const userRole = document.getElementById('currentUserRole');
  
  if (userName) userName.textContent = currentUser.name;
  if (userRole) userRole.textContent = currentUser.role;
  if (userAvatar) userAvatar.src = currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=random`;
}

// ============================================
// SOCKET.IO CONNECTION
// ============================================

function initSocket() {
  try {
    socket = io(SOCKET_URL);
    
    socket.on('connect', () => {
      console.log('Socket connected');
      socket.emit('user_joined', {
        id: currentUser.id,
        username: currentUser.username,
        name: currentUser.name,
        role: currentUser.role,
        avatar: currentUser.avatar
      });
    });
    
    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      showToast('Disconnected from server', 'error');
    });
    
    socket.on('new_message', (message) => {
      appendMessage(message);
      scrollToBottom();
    });
    
    socket.on('users_online', (users) => {
      updateOnlineUsers(users);
    });
    
    socket.on('user_typing', (data) => {
      showTypingIndicator(data.name);
    });
    
    socket.on('message_sent', (message) => {
      console.log('Message confirmed:', message);
    });
    
  } catch (error) {
    console.log('Socket connection failed, using mock mode');
    useMockMode();
  }
}

function useMockMode() {
  console.log('Using mock mode (no backend)');
  // Mock sending function
  window.sendMessage = function() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text) return;
    
    const newMessage = {
      id: 'msg_' + Date.now(),
      sender: currentUser.username,
      senderName: currentUser.name,
      text: text,
      type: 'text',
      timestamp: new Date().toISOString(),
      avatar: currentUser.avatar
    };
    
    mockMessages.push(newMessage);
    appendMessage(newMessage);
    input.value = '';
    scrollToBottom();
  };
}

// ============================================
// MESSAGE HANDLING
// ============================================

function loadMessages() {
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  mockMessages.forEach(message => {
    appendMessage(message);
  });
  
  scrollToBottom();
}

function appendMessage(message) {
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  
  const isSelf = message.sender === currentUser.username;
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `message-group ${isSelf ? 'self' : 'other'}`;
  
  let contentHtml = '';
  
  if (message.type === 'text') {
    contentHtml = `<div class="message-bubble">${escapeHtml(message.text)}</div>`;
  } else if (message.type === 'file') {
    contentHtml = `
      <div class="message-bubble">
        <a href="${message.fileUrl}" target="_blank" class="message-file">
          <i class="fas fa-file-download"></i>
          <span>${message.fileName || 'Download File'}</span>
        </a>
      </div>
    `;
  } else if (message.type === 'image') {
    contentHtml = `
      <div class="message-bubble">
        <img src="${message.fileUrl}" alt="Image" class="message-image" onclick="window.open('${message.fileUrl}', '_blank')">
      </div>
    `;
  } else if (message.type === 'voice') {
    contentHtml = `
      <div class="message-bubble">
        <div class="voice-message">
          <button class="voice-play-btn" onclick="toggleVoicePlay(this, '${message.fileUrl}')">
            <i class="fas fa-play"></i>
          </button>
          <div class="voice-wave">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <audio style="display: none;" src="${message.fileUrl}"></audio>
        </div>
      </div>
    `;
  }
  
  messageDiv.innerHTML = `
    ${!isSelf ? `<div class="message-sender">${message.senderName}</div>` : ''}
    ${contentHtml}
    <div class="message-time">${time}</div>
  `;
  
  container.appendChild(messageDiv);
  container.scrollTop = container.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  
  if (!text) return;
  
  const message = {
    id: 'msg_' + Date.now(),
    sender: currentUser.username,
    senderName: currentUser.name,
    text: text,
    type: 'text',
    timestamp: new Date().toISOString(),
    avatar: currentUser.avatar
  };
  
  if (socket && socket.connected) {
    socket.emit('send_message', {
      channel: currentChannel,
      message: message
    });
  } else {
    mockMessages.push(message);
    appendMessage(message);
  }
  
  input.value = '';
  scrollToBottom();
}

// ============================================
// FILE & VOICE HANDLING
// ============================================

function attachFile() {
  document.getElementById('fileInput').click();
}

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  
  if (file.size > 5 * 1024 * 1024) {
    showToast('File too large (max 5MB)', 'error');
    return;
  }
  
  const preview = document.getElementById('inputPreview');
  const previewText = document.getElementById('previewText');
  
  previewText.textContent = file.name;
  preview.classList.add('active');
  
  window.selectedFile = file;
}

function cancelPreview() {
  const preview = document.getElementById('inputPreview');
  preview.classList.remove('active');
  window.selectedFile = null;
  document.getElementById('fileInput').value = '';
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      audioPreviewUrl = URL.createObjectURL(audioBlob);
      
      const preview = document.getElementById('inputPreview');
      const previewText = document.getElementById('previewText');
      previewText.innerHTML = '<i class="fas fa-microphone"></i> Voice recording ready';
      preview.classList.add('active');
      window.audioBlob = audioBlob;
      
      stream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
    isRecording = true;
    const voiceBtn = document.getElementById('voiceBtn');
    voiceBtn.classList.add('recording');
    voiceBtn.innerHTML = '<i class="fas fa-stop"></i>';
    
    showToast('Recording... Click stop to finish', 'info');
  } catch (err) {
    console.error('Microphone error:', err);
    showToast('Could not access microphone', 'error');
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    const voiceBtn = document.getElementById('voiceBtn');
    voiceBtn.classList.remove('recording');
    voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
  }
}

function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

// ============================================
// UI HELPERS
// ============================================

function toggleEmojiPicker() {
  const picker = document.getElementById('emojiPicker');
  picker.classList.toggle('active');
}

function addEmoji(emoji) {
  const input = document.getElementById('messageInput');
  input.value += emoji;
  input.focus();
  document.getElementById('emojiPicker').classList.remove('active');
}

function toggleSidebar() {
  const sidebar = document.getElementById('chatSidebar');
  sidebar.classList.toggle('open');
}

function scrollToBottom() {
  const container = document.getElementById('messagesContainer');
  container.scrollTop = container.scrollHeight;
}

function checkScroll() {
  const container = document.getElementById('messagesContainer');
  const btn = document.getElementById('scrollToBottom');
  if (!container || !btn) return;
  
  const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
  btn.classList.toggle('visible', !isNearBottom && container.scrollHeight > container.clientHeight);
}

function toggleVoicePlay(btn, audioUrl) {
  const audio = btn.parentElement.querySelector('audio');
  const icon = btn.querySelector('i');
  
  if (audio.paused) {
    audio.play();
    icon.className = 'fas fa-pause';
    audio.onended = () => {
      icon.className = 'fas fa-play';
    };
  } else {
    audio.pause();
    icon.className = 'fas fa-play';
  }
}

// ============================================
// USERS & TYPING
// ============================================

function updateOnlineUsers(users) {
  const container = document.getElementById('onlineUsersList');
  if (!container) return;
  
  const onlineCount = users.filter(u => u.online).length;
  const countSpan = document.querySelector('.online-count');
  if (countSpan) countSpan.textContent = onlineCount;
  
  container.innerHTML = users.map(user => `
    <div class="user-item" onclick="startPrivateChat('${user.id}')">
      <div style="position: relative;">
        <img src="${user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`}" class="user-avatar">
        <div class="user-status ${user.online ? 'online' : 'offline'}"></div>
      </div>
      <div class="user-info">
        <div class="user-name">${user.name}</div>
        <div class="user-role">${user.role}</div>
      </div>
    </div>
  `).join('');
}

function loadOnlineUsers() {
  updateOnlineUsers(mockOnlineUsers);
}

function startPrivateChat(userId) {
  showToast('Private chat coming soon!', 'info');
}

let typingTimeout;
function onTyping() {
  if (socket && socket.connected) {
    socket.emit('typing', { channel: currentChannel, user: currentUser.name });
  }
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    // Typing stopped
  }, 1000);
}

function showTypingIndicator(userName) {
  const container = document.getElementById('typingIndicator');
  if (!container) return;
  
  container.innerHTML = `
    <div class="typing-indicator">
      <span>${userName} is typing</span>
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  
  setTimeout(() => {
    if (container.innerHTML.includes(userName)) {
      container.innerHTML = '';
    }
  }, 2000);
}

// ============================================
// TOAST NOTIFICATION
// ============================================

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
    <span>${message}</span>
  `;
  
  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-card);
    color: var(--text-main);
    padding: 10px 20px;
    border-radius: 30px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.85rem;
    z-index: 1000;
    animation: fadeInUp 0.3s ease;
    border-left: 4px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    box-shadow: var(--shadow-soft);
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  const sendBtn = document.getElementById('sendBtn');
  const messageInput = document.getElementById('messageInput');
  const attachBtn = document.getElementById('attachBtn');
  const voiceBtn = document.getElementById('voiceBtn');
  const emojiBtn = document.getElementById('emojiBtn');
  const scrollBtn = document.getElementById('scrollToBottom');
  const messagesContainer = document.getElementById('messagesContainer');
  
  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (attachBtn) attachBtn.addEventListener('click', attachFile);
  if (voiceBtn) voiceBtn.addEventListener('click', toggleRecording);
  if (emojiBtn) emojiBtn.addEventListener('click', toggleEmojiPicker);
  if (scrollBtn) scrollBtn.addEventListener('click', scrollToBottom);
  
  if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
    messageInput.addEventListener('input', onTyping);
  }
  
  if (messagesContainer) {
    messagesContainer.addEventListener('scroll', checkScroll);
  }
  
  // Close emoji picker on outside click
  document.addEventListener('click', (e) => {
    const picker = document.getElementById('emojiPicker');
    const emojiBtnEl = document.getElementById('emojiBtn');
    if (picker && !picker.contains(e.target) && !emojiBtnEl?.contains(e.target)) {
      picker.classList.remove('active');
    }
  });
}

// ============================================
// EXPOSE GLOBALLY
// ============================================

window.sendMessage = sendMessage;
window.attachFile = attachFile;
window.handleFileSelect = handleFileSelect;
window.cancelPreview = cancelPreview;
window.toggleRecording = toggleRecording;
window.toggleEmojiPicker = toggleEmojiPicker;
window.addEmoji = addEmoji;
window.toggleSidebar = toggleSidebar;
window.scrollToBottom = scrollToBottom;
window.toggleVoicePlay = toggleVoicePlay;
window.startPrivateChat = startPrivateChat;
window.initChat = initChat;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initChat);