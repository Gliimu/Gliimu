// Chat Module - Handles Socket.io chat functionality

let socket = null;
let currentRoomId = null;

// Initialize Socket.io connection
export function initChat() {
  try {
    socket = io('http://127.0.0.1:3000');
    
    socket.on('connect', () => {
      console.log('Chat connected');
    });
    
    socket.on('disconnect', () => {
      console.log('Chat disconnected');
    });
    
    return socket;
  } catch (error) {
    console.error('Chat init error:', error);
    return null;
  }
}

// Join a chat room
export function joinRoom(roomId) {
  if (!socket) return;
  currentRoomId = roomId;
  socket.emit('joinRoom', roomId);
}

// Send a message
export function sendMessage(roomId, text, senderName) {
  if (!socket || !text.trim()) return;
  
  const user = JSON.parse(localStorage.getItem('gliimu_user') || '{}');
  
  socket.emit('sendMessage', {
    roomId,
    text: text.trim(),
    sender: user.username || 'anonymous',
    senderName: senderName || user.name || 'User'
  });
}

// Listen for new messages
export function onNewMessage(callback) {
  if (!socket) return;
  socket.on('newMessage', callback);
}

// Listen for user joined
export function onUserJoined(callback) {
  if (!socket) return;
  socket.on('userJoined', callback);
}

// Listen for user left
export function onUserLeft(callback) {
  if (!socket) return;
  socket.on('userLeft', callback);
}

// Listen for online users list
export function onOnlineUsers(callback) {
  if (!socket) return;
  socket.on('onlineUsers', callback);
}

// Disconnect socket
export function disconnectChat() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Render chat message in UI
export function appendChatMessage(containerId, message, isSelf = false) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${isSelf ? 'self' : 'other'}`;
  msgDiv.innerHTML = `
    <div class="msg-bubble">
      ${!isSelf ? `<div class="msg-sender">${message.senderName}</div>` : ''}
      <div class="msg-text">${escapeHtml(message.text)}</div>
      <div class="msg-time">${new Date().toLocaleTimeString()}</div>
    </div>
  `;
  
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

// Helper to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}