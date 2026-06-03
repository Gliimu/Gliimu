// virtualroom.js - Live Classroom with WebRTC

// ============================================
// CONFIGURATION
// ============================================

const PEERJS_HOST = '0.peerjs.com';
const PEERJS_PORT = 443;
const PEERJS_PATH = '/';

let peer = null;
let localStream = null;
let currentCall = null;
let isTeacher = false;
let currentUser = null;
let roomId = null;
let participants = new Map();

// DOM Elements
let localVideo = null;
let videoGrid = null;
let waitingState = null;

// ============================================
// INITIALIZATION
// ============================================

async function initVirtualRoom() {
  console.log('Virtual Room initializing...');
  
  currentUser = JSON.parse(localStorage.getItem('gliimu_user') || 'null');
  
  if (!currentUser) {
    // Demo user
    currentUser = {
      id: 'demo_' + Date.now(),
      username: 'demo_user',
      name: 'Demo User',
      role: 'Student',
      avatar: 'https://ui-avatars.com/api/?name=Demo+User&background=random'
    };
  }
  
  // Check if user is teacher (based on role or URL param)
  const urlParams = new URLSearchParams(window.location.search);
  isTeacher = currentUser.role === 'Instructor' || urlParams.get('role') === 'teacher';
  roomId = urlParams.get('room') || 'default_room';
  
  // Update UI based on role
  updateUIForRole();
  
  // Get DOM elements
  localVideo = document.getElementById('localVideo');
  videoGrid = document.getElementById('videoGrid');
  waitingState = document.getElementById('waitingState');
  
  // Initialize PeerJS
  await initPeer();
  
  // Setup event listeners
  setupEventListeners();
  
  // Start timer
  startTimer();
}

function updateUIForRole() {
  const roleElements = document.querySelectorAll('[data-role]');
  roleElements.forEach(el => {
    const requiredRole = el.dataset.role;
    if (requiredRole === 'teacher' && !isTeacher) {
      el.style.display = 'none';
    }
    if (requiredRole === 'student' && isTeacher) {
      el.style.display = 'none';
    }
  });
  
  document.getElementById('roomTitle').textContent = roomId.replace(/_/g, ' ').toUpperCase();
}

// ============================================
// PEERJS INITIALIZATION
// ============================================

async function initPeer() {
  return new Promise((resolve, reject) => {
    const peerId = `${currentUser.role}_${currentUser.id}_${Date.now()}`;
    
    peer = new Peer(peerId, {
      host: PEERJS_HOST,
      port: PEERJS_PORT,
      path: PEERJS_PATH,
      secure: true
    });
    
    peer.on('open', (id) => {
      console.log('PeerJS connected:', id);
      
      if (isTeacher) {
        startBroadcast();
      } else {
        joinRoom();
      }
      
      resolve(id);
    });
    
    peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      showToast('Connection error. Using demo mode.', 'error');
      useMockMode();
      resolve(null);
    });
    
    peer.on('call', (call) => {
      console.log('Incoming call from:', call.peer);
      
      if (localStream) {
        call.answer(localStream);
        call.on('stream', (stream) => {
          addRemoteVideo(call.peer, stream);
        });
      }
      
      currentCall = call;
    });
  });
}

async function startBroadcast() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    localVideo.play();
    
    waitingState.style.display = 'none';
    showToast('You are now broadcasting', 'success');
    
  } catch (err) {
    console.error('Camera error:', err);
    showToast('Could not access camera/microphone', 'error');
    useMockMode();
  }
}

async function joinRoom() {
  try {
    waitingState.style.display = 'flex';
    
    // In real implementation, you would get teacher's peer ID from server
    // For demo, we'll use mock mode
    useMockMode();
    
  } catch (err) {
    console.error('Join error:', err);
    useMockMode();
  }
}

function useMockMode() {
  console.log('Using mock mode');
  waitingState.style.display = 'none';
  
  // Add mock teacher video
  addMockTeacher();
  
  // Add mock participants
  addMockParticipants();
}

function addMockTeacher() {
  const teacherCard = document.createElement('div');
  teacherCard.className = 'video-card featured';
  teacherCard.innerHTML = `
    <div class="video-placeholder">
      <i class="fas fa-chalkboard-teacher"></i>
    </div>
    <div class="video-label teacher">
      <i class="fas fa-star"></i> Teacher - Demo Instructor
    </div>
  `;
  videoGrid.appendChild(teacherCard);
}

function addMockParticipants() {
  const participantsList = document.getElementById('participantsList');
  if (participantsList) {
    participantsList.innerHTML = `
      <div class="participant-item">
        <img src="https://ui-avatars.com/api/?name=John+Student&background=random" class="participant-avatar">
        <div class="participant-info">
          <div class="participant-name">John Student</div>
          <div class="participant-role">Student</div>
        </div>
      </div>
      <div class="participant-item">
        <img src="https://ui-avatars.com/api/?name=Jane+Student&background=random" class="participant-avatar">
        <div class="participant-info">
          <div class="participant-name">Jane Student</div>
          <div class="participant-role">Student</div>
        </div>
      </div>
      <div class="participant-item">
        <img src="https://ui-avatars.com/api/?name=Mike+Student&background=random" class="participant-avatar">
        <div class="participant-info">
          <div class="participant-name">Mike Student</div>
          <div class="participant-role">Student</div>
          <div class="participant-hand"><i class="fas fa-hand-paper"></i></div>
        </div>
      </div>
    `;
  }
}

function addRemoteVideo(peerId, stream) {
  const videoCard = document.createElement('div');
  videoCard.className = 'video-card';
  videoCard.id = `video_${peerId}`;
  
  const video = document.createElement('video');
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;
  
  videoCard.appendChild(video);
  videoCard.innerHTML += `
    <div class="video-label">
      <i class="fas fa-user"></i> Student
    </div>
  `;
  
  videoGrid.appendChild(videoCard);
}

// ============================================
// MEDIA CONTROLS
// ============================================

function toggleMic() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const btn = document.getElementById('toggleMic');
      btn.classList.toggle('off', !audioTrack.enabled);
      btn.innerHTML = audioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
      showToast(audioTrack.enabled ? 'Microphone on' : 'Microphone off', 'info');
    }
  }
}

function toggleCamera() {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const btn = document.getElementById('toggleCam');
      btn.classList.toggle('off', !videoTrack.enabled);
      btn.innerHTML = videoTrack.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
      showToast(videoTrack.enabled ? 'Camera on' : 'Camera off', 'info');
    }
  }
}

async function toggleScreenShare() {
  try {
    if (!localStream) return;
    
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const videoTrack = screenStream.getVideoTracks()[0];
    const sender = currentCall?.peerConnection?.getSenders().find(s => s.track?.kind === 'video');
    
    if (sender) {
      sender.replaceTrack(videoTrack);
      showToast('Screen sharing started', 'success');
      
      videoTrack.onended = () => {
        sender.replaceTrack(localStream.getVideoTracks()[0]);
        showToast('Screen sharing stopped', 'info');
      };
    }
  } catch (err) {
    console.error('Screen share error:', err);
    showToast('Screen share cancelled', 'error');
  }
}

function toggleHandRaise() {
  const btn = document.getElementById('raiseHand');
  btn.classList.toggle('active');
  
  if (btn.classList.contains('active')) {
    btn.innerHTML = '<i class="fas fa-hand-paper"></i>';
    showToast('Hand raised! Teacher has been notified.', 'success');
  } else {
    btn.innerHTML = '<i class="fas fa-hand-paper"></i>';
    showToast('Hand lowered', 'info');
  }
}

// ============================================
// WHITEBOARD
// ============================================

let whiteboardActive = false;
let wbCanvas = null;
let wbCtx = null;
let painting = false;
let wbTool = 'pen';
let wbColor = '#000000';

function toggleWhiteboard() {
  const overlay = document.getElementById('whiteboardOverlay');
  whiteboardActive = !whiteboardActive;
  overlay.classList.toggle('active', whiteboardActive);
  
  if (whiteboardActive) {
    initWhiteboard();
  }
}

function initWhiteboard() {
  wbCanvas = document.getElementById('wbCanvas');
  wbCtx = wbCanvas.getContext('2d');
  
  // Set canvas size
  wbCanvas.width = window.innerWidth;
  wbCanvas.height = window.innerHeight - 70; // Subtract toolbar height
  
  // Set initial styles
  wbCtx.strokeStyle = wbColor;
  wbCtx.lineWidth = 3;
  wbCtx.lineCap = 'round';
  
  // Event listeners
  wbCanvas.addEventListener('mousedown', startDrawing);
  wbCanvas.addEventListener('mouseup', stopDrawing);
  wbCanvas.addEventListener('mousemove', draw);
  wbCanvas.addEventListener('touchstart', startDrawingTouch);
  wbCanvas.addEventListener('touchend', stopDrawing);
  wbCanvas.addEventListener('touchmove', drawTouch);
  
  window.addEventListener('resize', resizeWhiteboard);
}

function startDrawing(e) {
  painting = true;
  const rect = wbCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (wbCanvas.width / rect.width);
  const y = (e.clientY - rect.top) * (wbCanvas.height / rect.height);
  wbCtx.beginPath();
  wbCtx.moveTo(x, y);
}

function draw(e) {
  if (!painting) return;
  const rect = wbCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (wbCanvas.width / rect.width);
  const y = (e.clientY - rect.top) * (wbCanvas.height / rect.height);
  wbCtx.lineTo(x, y);
  wbCtx.stroke();
  wbCtx.beginPath();
  wbCtx.moveTo(x, y);
}

function startDrawingTouch(e) {
  e.preventDefault();
  painting = true;
  const rect = wbCanvas.getBoundingClientRect();
  const touch = e.touches[0];
  const x = (touch.clientX - rect.left) * (wbCanvas.width / rect.width);
  const y = (touch.clientY - rect.top) * (wbCanvas.height / rect.height);
  wbCtx.beginPath();
  wbCtx.moveTo(x, y);
}

function drawTouch(e) {
  e.preventDefault();
  if (!painting) return;
  const rect = wbCanvas.getBoundingClientRect();
  const touch = e.touches[0];
  const x = (touch.clientX - rect.left) * (wbCanvas.width / rect.width);
  const y = (touch.clientY - rect.top) * (wbCanvas.height / rect.height);
  wbCtx.lineTo(x, y);
  wbCtx.stroke();
  wbCtx.beginPath();
  wbCtx.moveTo(x, y);
}

function stopDrawing() {
  painting = false;
}

function resizeWhiteboard() {
  const oldCanvas = wbCanvas;
  const imageData = wbCtx.getImageData(0, 0, wbCanvas.width, wbCanvas.height);
  wbCanvas.width = window.innerWidth;
  wbCanvas.height = window.innerHeight - 70;
  wbCtx.putImageData(imageData, 0, 0);
}

function setWbTool(tool) {
  wbTool = tool;
  document.querySelectorAll('.wb-tool').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  
  if (tool === 'eraser') {
    wbCtx.strokeStyle = '#ffffff';
    wbCtx.lineWidth = 20;
  } else {
    wbCtx.strokeStyle = wbColor;
    wbCtx.lineWidth = 3;
  }
}

function setWbColor(color) {
  wbColor = color;
  if (wbTool !== 'eraser') {
    wbCtx.strokeStyle = color;
  }
}

function clearWhiteboard() {
  wbCtx.clearRect(0, 0, wbCanvas.width, wbCanvas.height);
  showToast('Whiteboard cleared', 'info');
}

// ============================================
// CHAT FUNCTIONALITY
// ============================================

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  
  const messagesContainer = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'chat-message self';
  messageDiv.innerHTML = `
    <div class="chat-bubble">
      <div class="chat-sender">You</div>
      <div>${escapeHtml(text)}</div>
      <div class="chat-time">Just now</div>
    </div>
  `;
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  input.value = '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// TIMER
// ============================================

let timerSeconds = 0;
let timerInterval = null;

function startTimer() {
  timerInterval = setInterval(() => {
    timerSeconds++;
    const minutes = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
    const seconds = (timerSeconds % 60).toString().padStart(2, '0');
    const timerElement = document.getElementById('roomTimer');
    if (timerElement) timerElement.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
}

// ============================================
// LEAVE / END CLASS
// ============================================

function leaveRoom() {
  if (confirm('Are you sure you want to leave the virtual room?')) {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (peer) {
      peer.destroy();
    }
    stopTimer();
    window.location.href = 'dashboard.html';
  }
}

function endClass() {
  if (confirm('End class for all participants?')) {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (peer) {
      peer.destroy();
    }
    stopTimer();
    showToast('Class ended', 'success');
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 2000);
  }
}

// ============================================
// UI HELPERS
// ============================================

function toggleSidebar() {
  const sidebar = document.getElementById('roomSidebar');
  sidebar.classList.toggle('open');
}

function switchTab(tabId) {
  document.querySelectorAll('.sidebar-tab').forEach(tab => tab.classList.remove('active'));
  event.target.classList.add('active');
  
  document.getElementById('chatPanel').style.display = tabId === 'chat' ? 'flex' : 'none';
  document.getElementById('participantsPanel').style.display = tabId === 'participants' ? 'flex' : 'none';
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${message}`;
  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-card);
    color: var(--text-main);
    padding: 10px 20px;
    border-radius: 30px;
    z-index: 1000;
    animation: fadeInUp 0.3s ease;
    box-shadow: var(--shadow-soft);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  // Chat
  const sendBtn = document.getElementById('chatSendBtn');
  const chatInput = document.getElementById('chatInput');
  if (sendBtn) sendBtn.addEventListener('click', sendChatMessage);
  if (chatInput) chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
  
  // Controls
  const toggleMicBtn = document.getElementById('toggleMic');
  const toggleCamBtn = document.getElementById('toggleCam');
  const shareScreenBtn = document.getElementById('shareScreen');
  const raiseHandBtn = document.getElementById('raiseHand');
  const whiteboardBtn = document.getElementById('whiteboardBtn');
  const leaveBtn = document.getElementById('leaveBtn');
  const endClassBtn = document.getElementById('endClassBtn');
  
  if (toggleMicBtn) toggleMicBtn.addEventListener('click', toggleMic);
  if (toggleCamBtn) toggleCamBtn.addEventListener('click', toggleCamera);
  if (shareScreenBtn) shareScreenBtn.addEventListener('click', toggleScreenShare);
  if (raiseHandBtn) raiseHandBtn.addEventListener('click', toggleHandRaise);
  if (whiteboardBtn) whiteboardBtn.addEventListener('click', toggleWhiteboard);
  if (leaveBtn) leaveBtn.addEventListener('click', leaveRoom);
  if (endClassBtn) endClassBtn.addEventListener('click', endClass);
}

// ============================================
// EXPOSE GLOBALLY
// ============================================

window.initVirtualRoom = initVirtualRoom;
window.toggleMic = toggleMic;
window.toggleCamera = toggleCamera;
window.toggleScreenShare = toggleScreenShare;
window.toggleHandRaise = toggleHandRaise;
window.toggleWhiteboard = toggleWhiteboard;
window.setWbTool = setWbTool;
window.setWbColor = setWbColor;
window.clearWhiteboard = clearWhiteboard;
window.leaveRoom = leaveRoom;
window.endClass = endClass;
window.toggleSidebar = toggleSidebar;
window.switchTab = switchTab;
window.sendChatMessage = sendChatMessage;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initVirtualRoom);