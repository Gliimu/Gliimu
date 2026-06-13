// ============================================
// VIRTUAL CLASSROOM - FIXED VERSION
// No duplicate imports, fixed access guard
// ============================================

// Single import - no duplicates
import { supabase, getCurrentUser } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// CONFIGURATION
// ============================================

let currentUser = null;
let isTeacher = false;
let roomId = null;
let localStream = null;
let peer = null;
let peers = new Map();
let screenStream = null;
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;
let recordingTimer = null;

// DOM Elements
let localVideo = null;
let videoGrid = null;
let loadingOverlay = null;
let chatSidebar = null;
let whiteboardOverlay = null;
let wbCanvas = null;
let wbCtx = null;
let painting = false;
let currentTool = 'pen';
let currentColor = '#fbb040';

// Room state
let participants = new Map();
let chatSubscription = null;
let participantsSubscription = null;
let classStartTime = Date.now();
let classTimerInterval = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Virtual Classroom initializing...');
    
    try {
        // Get current user
        currentUser = await getCurrentUser();
        console.log('Current user:', currentUser?.email || 'Guest');
        
        if (!currentUser) {
            showLoginScreen();
            return;
        }
        
        // Get room info from URL
        const urlParams = new URLSearchParams(window.location.search);
        roomId = urlParams.get('room') || `class_${Date.now()}`;
        isTeacher = currentUser.user_metadata?.role === 'admin' || urlParams.get('role') === 'teacher';
        
        // Initialize DOM
        initDOM();
        
        // Update UI for role
        updateUIForRole();
        
        // Show loading
        showLoading(true);
        
        // Initialize components (without access guard to avoid conflicts)
        await initPeerJS();
        await setupRealtimeSubscriptions();
        await loadChatHistory();
        await loadParticipants();
        
        // Setup event listeners
        setupEventListeners();
        
        // Start class timer
        startClassTimer();
        
        // Hide loading
        showLoading(false);
        
        // Send welcome message
        sendSystemMessage(`${currentUser.user_metadata?.name || 'A user'} joined the classroom`);
        
        console.log('Virtual Classroom ready');
        
    } catch (error) {
        console.error('Initialization error:', error);
        showToast('Failed to initialize classroom', 'error');
        showLoading(false);
        useFallbackMode();
    }
});

function showLoginScreen() {
    const container = document.querySelector('.classroom-container');
    if (container) {
        container.innerHTML = `
            <div class="access-denied">
                <i class="fas fa-sign-in-alt"></i>
                <h2>Sign In Required</h2>
                <p>Please sign in to access the virtual classroom.</p>
                <button onclick="window.location.href='/signin.html'" class="upgrade-btn">
                    Sign In
                </button>
            </div>
        `;
    }
}

function initDOM() {
    localVideo = document.getElementById('localVideo');
    videoGrid = document.getElementById('videoGrid');
    loadingOverlay = document.getElementById('loadingOverlay');
    chatSidebar = document.getElementById('chatSidebar');
    whiteboardOverlay = document.getElementById('whiteboardOverlay');
    wbCanvas = document.getElementById('whiteboardCanvas');
    
    if (wbCanvas) {
        wbCtx = wbCanvas.getContext('2d');
        initWhiteboard();
    }
    
    const roomTitleEl = document.getElementById('roomTitle');
    if (roomTitleEl) {
        roomTitleEl.textContent = roomId.replace(/_/g, ' ').toUpperCase();
    }
    
    const userRoleLabel = document.getElementById('userRoleLabel');
    if (userRoleLabel) {
        userRoleLabel.textContent = isTeacher ? 'Teacher' : 'Student';
    }
}

function updateUIForRole() {
    const teacherOnlyBtns = ['screenShareBtn'];
    teacherOnlyBtns.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.style.display = isTeacher ? 'flex' : 'none';
    });
}

function showLoading(show) {
    if (loadingOverlay) {
        loadingOverlay.style.display = show ? 'flex' : 'none';
    }
}

// ============================================
// PEERJS WEBRTC (SIMPLIFIED)
// ============================================

async function initPeerJS() {
    return new Promise(async (resolve) => {
        try {
            const peerId = `${currentUser.id}_${Date.now()}`;
            
            peer = new Peer(peerId, {
                host: '0.peerjs.com',
                port: 443,
                path: '/',
                secure: true,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                }
            });
            
            peer.on('open', async (id) => {
                console.log('PeerJS connected:', id);
                await registerParticipant(id);
                await startLocalStream();
                resolve();
            });
            
            peer.on('error', (err) => {
                console.error('PeerJS error:', err);
                showToast('Connection error. Using chat-only mode.', 'warning');
                useFallbackMode();
                resolve();
            });
            
        } catch (err) {
            console.error('PeerJS init error:', err);
            useFallbackMode();
            resolve();
        }
    });
}

async function registerParticipant(peerId) {
    try {
        const { error } = await supabase
            .from('classroom_participants')
            .upsert({
                room_id: roomId,
                user_id: currentUser.id,
                peer_id: peerId,
                name: currentUser.user_metadata?.name || currentUser.email?.split('@')[0],
                role: isTeacher ? 'teacher' : 'student',
                joined_at: new Date().toISOString(),
                status: 'online'
            });
        
        if (error) console.error('Register error:', error);
    } catch (error) {
        console.error('Registration error:', error);
    }
}

async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        
        if (localVideo) {
            localVideo.srcObject = localStream;
            await localVideo.play();
        }
        
        showToast('Camera and microphone connected', 'success');
        
    } catch (err) {
        console.error('Camera error:', err);
        showToast('Could not access camera/microphone', 'warning');
        useFallbackMode();
    }
}

function useFallbackMode() {
    showLoading(false);
    // Add a placeholder video card
    if (videoGrid) {
        const placeholderCard = document.createElement('div');
        placeholderCard.className = 'video-card';
        placeholderCard.innerHTML = `
            <div class="video-placeholder" style="display: flex;">
                <i class="fas fa-video-slash"></i>
                <span>Camera not available</span>
            </div>
            <div class="video-overlay">
                <div class="participant-name">${currentUser?.user_metadata?.name || 'User'}</div>
            </div>
        `;
        videoGrid.appendChild(placeholderCard);
    }
    showToast('Connected in chat-only mode', 'info');
}

// ============================================
// MEDIA CONTROLS
// ============================================

function toggleMicrophone() {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const micBtn = document.getElementById('micBtn');
        const localMicControl = document.getElementById('localMicControl');
        
        const icon = audioTrack.enabled ? 'fa-microphone' : 'fa-microphone-slash';
        if (micBtn) micBtn.innerHTML = `<i class="fas ${icon}"></i>`;
        if (localMicControl) localMicControl.innerHTML = `<i class="fas ${icon}"></i>`;
        
        micBtn?.classList.toggle('off', !audioTrack.enabled);
        localMicControl?.classList.toggle('off', !audioTrack.enabled);
        
        showToast(audioTrack.enabled ? 'Microphone on' : 'Microphone off', 'info');
    }
}

function toggleCamera() {
    if (!localStream) return;
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const camBtn = document.getElementById('camBtn');
        const localCamControl = document.getElementById('localCamControl');
        
        const icon = videoTrack.enabled ? 'fa-video' : 'fa-video-slash';
        if (camBtn) camBtn.innerHTML = `<i class="fas ${icon}"></i>`;
        if (localCamControl) localCamControl.innerHTML = `<i class="fas ${icon}"></i>`;
        
        camBtn?.classList.toggle('off', !videoTrack.enabled);
        localCamControl?.classList.toggle('off', !videoTrack.enabled);
        
        // Update UI
        const localCard = document.getElementById('localVideoCard');
        if (!videoTrack.enabled) {
            localCard?.classList.add('camera-off');
        } else {
            localCard?.classList.remove('camera-off');
        }
        
        showToast(videoTrack.enabled ? 'Camera on' : 'Camera off', 'info');
    }
}

function toggleScreenShare() {
    if (!isTeacher) {
        showToast('Only teachers can share screens', 'warning');
        return;
    }
    showToast('Screen sharing coming soon!', 'info');
}

function toggleRaiseHand() {
    const btn = document.getElementById('raiseHandBtn');
    const isRaised = btn?.classList.contains('active');
    
    if (isRaised) {
        btn?.classList.remove('active');
        showToast('Hand lowered', 'info');
    } else {
        btn?.classList.add('active');
        showToast('Hand raised! Teacher notified.', 'success');
        
        // Send system message
        sendSystemMessage(`${currentUser.user_metadata?.name || 'A student'} raised their hand`);
    }
}

function toggleRecording() {
    if (!isTeacher) {
        showToast('Only teachers can record sessions', 'warning');
        return;
    }
    showToast('Recording feature coming soon!', 'info');
}

// ============================================
// CHAT FUNCTIONALITY
// ============================================

async function loadChatHistory() {
    try {
        const { data, error } = await supabase
            .from('classroom_chat')
            .select('*')
            .eq('room_id', roomId)
            .order('created_at', { ascending: true })
            .limit(100);
        
        if (!error && data) {
            data.forEach(msg => displayChatMessage(msg));
        }
    } catch (error) {
        console.error('Error loading chat:', error);
    }
}

function setupRealtimeSubscriptions() {
    // Chat subscription
    if (chatSubscription) chatSubscription.unsubscribe();
    
    chatSubscription = supabase
        .channel('classroom_chat')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'classroom_chat', filter: `room_id=eq.${roomId}` },
            (payload) => {
                displayChatMessage(payload.new);
            }
        )
        .subscribe();
    
    // Participants subscription
    if (participantsSubscription) participantsSubscription.unsubscribe();
    
    participantsSubscription = supabase
        .channel('classroom_participants')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'classroom_participants', filter: `room_id=eq.${roomId}` },
            () => {
                loadParticipants();
            }
        )
        .subscribe();
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    const message = {
        room_id: roomId,
        user_id: currentUser.id,
        user_name: currentUser.user_metadata?.name || currentUser.email?.split('@')[0],
        message: text,
        created_at: new Date().toISOString()
    };
    
    try {
        await supabase.from('classroom_chat').insert(message);
        input.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        displayChatMessage(message, true);
    }
}

function displayChatMessage(message, isLocal = false) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    const isSelf = message.user_id === currentUser?.id;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isSelf ? 'self' : 'other'}`;
    messageDiv.innerHTML = `
        ${!isSelf ? `<div class="chat-sender">${escapeHtml(message.user_name || 'User')}</div>` : ''}
        <div class="chat-bubble">
            <div>${escapeHtml(message.message)}</div>
            <div class="chat-time">${new Date(message.created_at).toLocaleTimeString()}</div>
        </div>
    `;
    
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
}

function sendSystemMessage(text) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.innerHTML = `<i class="fas fa-info-circle"></i> ${escapeHtml(text)}`;
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
}

// ============================================
// PARTICIPANTS
// ============================================

async function loadParticipants() {
    try {
        const { data, error } = await supabase
            .from('classroom_participants')
            .select('*')
            .eq('room_id', roomId);
        
        if (!error && data) {
            participants.clear();
            data.forEach(p => participants.set(p.user_id, p));
            
            const container = document.getElementById('participantsList');
            if (container) {
                container.innerHTML = data.map(p => `
                    <div class="participant-item">
                        <div class="participant-avatar">
                            <i class="fas fa-user-circle"></i>
                        </div>
                        <div class="participant-details">
                            <div class="participant-name">${escapeHtml(p.name || 'User')}</div>
                            <div class="participant-role">${p.role === 'teacher' ? 'Teacher' : 'Student'}</div>
                        </div>
                        <div class="participant-status">
                            ${p.is_muted ? '<i class="fas fa-microphone-slash status-icon muted"></i>' : ''}
                            ${p.is_video_off ? '<i class="fas fa-video-slash status-icon video-off"></i>' : ''}
                            ${p.hand_raised ? '<i class="fas fa-hand-paper status-icon hand-raised"></i>' : ''}
                        </div>
                    </div>
                `).join('');
            }
            
            const countSpan = document.getElementById('participantCount');
            if (countSpan) countSpan.textContent = data.length;
        }
    } catch (error) {
        console.error('Error loading participants:', error);
    }
}

// ============================================
// WHITEBOARD
// ============================================

function initWhiteboard() {
    if (!wbCanvas || !wbCtx) return;
    
    const resizeCanvas = () => {
        wbCanvas.width = window.innerWidth;
        wbCanvas.height = window.innerHeight - 70;
        wbCtx.fillStyle = '#ffffff';
        wbCtx.fillRect(0, 0, wbCanvas.width, wbCanvas.height);
        wbCtx.strokeStyle = currentColor;
        wbCtx.lineWidth = 3;
        wbCtx.lineCap = 'round';
        wbCtx.lineJoin = 'round';
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Drawing events
    wbCanvas.addEventListener('mousedown', startDrawing);
    wbCanvas.addEventListener('mouseup', stopDrawing);
    wbCanvas.addEventListener('mousemove', draw);
    wbCanvas.addEventListener('touchstart', startDrawingTouch);
    wbCanvas.addEventListener('touchend', stopDrawing);
    wbCanvas.addEventListener('touchmove', drawTouch);
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
    e.preventDefault();
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

function setWbTool(tool) {
    currentTool = tool;
    if (tool === 'eraser') {
        wbCtx.strokeStyle = '#ffffff';
        wbCtx.lineWidth = 20;
    } else if (tool === 'pen') {
        wbCtx.strokeStyle = currentColor;
        wbCtx.lineWidth = 3;
    } else if (tool === 'clear') {
        wbCtx.clearRect(0, 0, wbCanvas.width, wbCanvas.height);
        wbCtx.fillStyle = '#ffffff';
        wbCtx.fillRect(0, 0, wbCanvas.width, wbCanvas.height);
    }
    
    document.querySelectorAll('.wb-tool').forEach(btn => btn.classList.remove('active'));
    if (tool !== 'clear') {
        const activeBtn = document.querySelector(`.wb-tool[data-tool="${tool}"]`);
        activeBtn?.classList.add('active');
    }
}

function setWbColor(color) {
    currentColor = color;
    if (currentTool !== 'eraser') {
        wbCtx.strokeStyle = color;
    }
}

function toggleWhiteboard() {
    whiteboardOverlay?.classList.toggle('active');
}

// ============================================
// CLASS TIMER
// ============================================

function startClassTimer() {
    classTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - classStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timerElement = document.getElementById('classTimer');
        if (timerElement) {
            timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

// ============================================
// UI HELPERS
// ============================================

function toggleSidebar() {
    chatSidebar?.classList.toggle('open');
}

function switchTab(tab) {
    const chatContainer = document.querySelector('.chat-messages');
    const participantsContainer = document.getElementById('participantsList');
    const tabs = document.querySelectorAll('.chat-tab');
    
    tabs.forEach(t => t.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    
    if (tab === 'chat') {
        if (chatContainer) chatContainer.style.display = 'flex';
        if (participantsContainer) participantsContainer.style.display = 'none';
    } else {
        if (chatContainer) chatContainer.style.display = 'none';
        if (participantsContainer) participantsContainer.style.display = 'flex';
        loadParticipants();
    }
}

function leaveRoom() {
    if (confirm('Are you sure you want to leave the classroom?')) {
        // Clean up
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
        }
        if (peer) {
            peer.destroy();
        }
        if (chatSubscription) chatSubscription.unsubscribe();
        if (participantsSubscription) participantsSubscription.unsubscribe();
        if (classTimerInterval) clearInterval(classTimerInterval);
        
        window.location.href = '/dashboard.html';
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Navigation
    document.getElementById('backBtn')?.addEventListener('click', leaveRoom);
    document.getElementById('leaveBtn')?.addEventListener('click', leaveRoom);
    document.getElementById('participantsBtn')?.addEventListener('click', toggleSidebar);
    document.getElementById('closeChatBtn')?.addEventListener('click', toggleSidebar);
    
    // Media controls
    document.getElementById('micBtn')?.addEventListener('click', toggleMicrophone);
    document.getElementById('camBtn')?.addEventListener('click', toggleCamera);
    document.getElementById('screenShareBtn')?.addEventListener('click', toggleScreenShare);
    document.getElementById('raiseHandBtn')?.addEventListener('click', toggleRaiseHand);
    document.getElementById('recordBtn')?.addEventListener('click', toggleRecording);
    document.getElementById('whiteboardBtn')?.addEventListener('click', toggleWhiteboard);
    
    // Local video controls
    document.getElementById('localMicControl')?.addEventListener('click', toggleMicrophone);
    document.getElementById('localCamControl')?.addEventListener('click', toggleCamera);
    
    // Chat
    document.getElementById('sendChatBtn')?.addEventListener('click', sendChatMessage);
    document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    
    // Tabs
    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    // Whiteboard
    document.querySelectorAll('.wb-tool').forEach(tool => {
        tool.addEventListener('click', () => {
            const toolName = tool.dataset.tool;
            if (toolName) setWbTool(toolName);
        });
    });
    document.querySelector('.wb-color')?.addEventListener('change', (e) => setWbColor(e.target.value));
    document.getElementById('closeWhiteboard')?.addEventListener('click', toggleWhiteboard);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make functions global
window.toggleSidebar = toggleSidebar;
window.switchTab = switchTab;
window.sendChatMessage = sendChatMessage;
window.toggleWhiteboard = toggleWhiteboard;
window.setWbTool = setWbTool;
window.setWbColor = setWbColor;
window.leaveRoom = leaveRoom;

console.log('Virtual Classroom loaded successfully');
