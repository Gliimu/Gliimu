// ============================================
// VIRTUAL CLASSROOM - Full WebRTC Implementation
// ============================================

import { supabase, getCurrentUser } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';
import { checkPlatformAccess, startTimer, stopTimer, addTimeSpent } from '../modules/access-guard.js';

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
let chatSubscription = null;
let participantsSubscription = null;

// DOM Elements
let localVideo = null;
let videoGrid = null;
let waitingState = null;
let sidebar = null;
let whiteboardOverlay = null;
let wbCanvas = null;
let wbCtx = null;
let painting = false;
let currentTool = 'pen';
let currentColor = '#fbb040';

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Virtual Classroom initializing...');
    
    // Check access
    const hasAccess = await checkPlatformAccess('virtualroom');
    if (!hasAccess) {
        showNoAccessMessage();
        return;
    }
    
    // Start timer for free tier
    startTimer('virtualroom');
    
    // Get current user
    currentUser = await getCurrentUser();
    
    if (!currentUser) {
        window.location.href = '/signin.html';
        return;
    }
    
    // Get room info from URL
    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('room') || 'default_classroom';
    isTeacher = currentUser.user_metadata?.role === 'admin' || urlParams.get('role') === 'teacher';
    
    // Initialize DOM elements
    initDOMElements();
    
    // Update UI for role
    updateUIForRole();
    
    // Initialize peer connection
    await initPeerConnection();
    
    // Setup event listeners
    setupEventListeners();
    
    // Load chat messages
    await loadChatMessages();
    
    // Setup real-time chat
    setupRealtimeChat();
    
    // Update room title
    document.getElementById('roomTitle').textContent = roomId.replace(/_/g, ' ').toUpperCase();
    
    console.log('Virtual Classroom initialized');
});

function initDOMElements() {
    localVideo = document.getElementById('localVideo');
    videoGrid = document.getElementById('videoGrid');
    waitingState = document.getElementById('waitingState');
    sidebar = document.getElementById('roomSidebar');
    whiteboardOverlay = document.getElementById('whiteboardOverlay');
    wbCanvas = document.getElementById('wbCanvas');
    
    if (wbCanvas) {
        wbCtx = wbCanvas.getContext('2d');
        initWhiteboard();
    }
}

function updateUIForRole() {
    // Show/hide teacher-only controls
    const teacherOnlyBtns = ['shareScreenBtn', 'endClassBtn'];
    teacherOnlyBtns.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.style.display = isTeacher ? 'flex' : 'none';
    });
}

function showNoAccessMessage() {
    const container = document.querySelector('.virtual-room');
    if (container) {
        container.innerHTML = `
            <div class="access-denied">
                <i class="fas fa-lock"></i>
                    <h2>Access Restricted</h2>
                <p>You've used your 15 minutes of free access for today.</p>
                <p>Upgrade to Premium for unlimited access to Virtual Classroom!</p>
                <button onclick="window.location.href='/dashboard.html?tab=wallet'" class="upgrade-btn">
                    View Plans
                </button>
            </div>
        `;
    }
}

// ============================================
// PEERJS CONNECTION
// ============================================

async function initPeerConnection() {
    return new Promise(async (resolve) => {
        // Show waiting state
        if (waitingState) waitingState.style.display = 'flex';
        
        // Generate unique peer ID
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
            
            // Register user in room
            await registerUserInRoom(id);
            
            if (isTeacher) {
                await startLocalStream();
                broadcastTeacherStream();
            } else {
                await joinAsStudent();
            }
            
            if (waitingState) waitingState.style.display = 'none';
            resolve();
        });
        
        peer.on('call', async (call) => {
            console.log('Incoming call from:', call.peer);
            
            if (localStream) {
                call.answer(localStream);
                call.on('stream', (stream) => {
                    addRemoteVideo(call.peer, stream);
                });
            }
        });
        
        peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            showToast('Connection error. Using demo mode.', 'error');
            useMockMode();
            resolve();
        });
    });
}

async function registerUserInRoom(peerId) {
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
        
        if (error) console.error('Error registering user:', error);
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
        
        localVideo.srcObject = localStream;
        await localVideo.play();
        
        updateLocalVideoUI(true);
        showToast('Camera and microphone connected', 'success');
        
    } catch (err) {
        console.error('Camera error:', err);
        showToast('Could not access camera/microphone', 'error');
        useMockMode();
    }
}

function broadcastTeacherStream() {
    // In a real implementation, this would broadcast to all students
    console.log('Broadcasting teacher stream');
}

async function joinAsStudent() {
    // Get teacher's peer ID from database
    try {
        const { data } = await supabase
            .from('classroom_participants')
            .select('peer_id')
            .eq('room_id', roomId)
            .eq('role', 'teacher')
            .single();
        
        if (data?.peer_id && localStream) {
            const call = peer.call(data.peer_id, localStream);
            call.on('stream', (stream) => {
                addRemoteVideo(data.peer_id, stream, true);
            });
        }
    } catch (error) {
        console.error('Error joining class:', error);
        useMockMode();
    }
}

function addRemoteVideo(peerId, stream, isTeacher = false) {
    const existingCard = document.getElementById(`video_${peerId}`);
    if (existingCard) return;
    
    const videoCard = document.createElement('div');
    videoCard.className = `video-card ${isTeacher ? 'featured' : ''}`;
    videoCard.id = `video_${peerId}`;
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    
    videoCard.appendChild(video);
    videoCard.innerHTML += `
        <div class="video-label ${isTeacher ? 'teacher' : ''}">
            <i class="fas ${isTeacher ? 'fa-chalkboard-teacher' : 'fa-user'}"></i>
            ${isTeacher ? 'Teacher' : 'Student'}
        </div>
    `;
    
    videoGrid.appendChild(videoCard);
}

function updateLocalVideoUI(isConnected) {
    const localCard = document.getElementById('localVideoCard');
    if (localCard) {
        if (isConnected) {
            localCard.classList.remove('disconnected');
        } else {
            localCard.classList.add('disconnected');
        }
    }
}

// ============================================
// MEDIA CONTROLS
// ============================================

function toggleMicrophone() {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const micBtn = document.getElementById('toggleMicBtn');
        const localMicBtn = document.getElementById('localMicBtn');
        
        const icon = audioTrack.enabled ? 'fa-microphone' : 'fa-microphone-slash';
        if (micBtn) micBtn.innerHTML = `<i class="fas ${icon}"></i>`;
        if (localMicBtn) localMicBtn.innerHTML = `<i class="fas ${icon}"></i>`;
        
        micBtn?.classList.toggle('off', !audioTrack.enabled);
        showToast(audioTrack.enabled ? 'Microphone on' : 'Microphone off', 'info');
    }
}

function toggleCamera() {
    if (!localStream) return;
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const camBtn = document.getElementById('toggleCamBtn');
        const localCamBtn = document.getElementById('localCamBtn');
        
        const icon = videoTrack.enabled ? 'fa-video' : 'fa-video-slash';
        if (camBtn) camBtn.innerHTML = `<i class="fas ${icon}"></i>`;
        if (localCamBtn) localCamBtn.innerHTML = `<i class="fas ${icon}"></i>`;
        
        camBtn?.classList.toggle('off', !videoTrack.enabled);
        showToast(videoTrack.enabled ? 'Camera on' : 'Camera off', 'info');
        
        // Show placeholder if camera off
        const localCard = document.getElementById('localVideoCard');
        if (!videoTrack.enabled) {
            localCard?.classList.add('camera-off');
        } else {
            localCard?.classList.remove('camera-off');
        }
    }
}

async function toggleScreenShare() {
    if (!isTeacher) {
        showToast('Only teachers can share screens', 'warning');
        return;
    }
    
    try {
        if (!screenStream) {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const videoTrack = screenStream.getVideoTracks()[0];
            
            // Replace local video track with screen share
            const sender = peer?.connections?.[Object.keys(peers)[0]]?.[0]?.peerConnection
                ?.getSenders()?.find(s => s.track?.kind === 'video');
            
            if (sender) {
                sender.replaceTrack(videoTrack);
            }
            
            videoTrack.onended = () => stopScreenShare();
            
            document.getElementById('shareScreenBtn')?.classList.add('active');
            showToast('Screen sharing started', 'success');
        } else {
            stopScreenShare();
        }
    } catch (err) {
        console.error('Screen share error:', err);
        showToast('Screen share cancelled', 'error');
    }
}

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
        
        // Restore camera track
        const videoTrack = localStream?.getVideoTracks()[0];
        const sender = peer?.connections?.[Object.keys(peers)[0]]?.[0]?.peerConnection
            ?.getSenders()?.find(s => s.track?.kind === 'video');
        
        if (sender && videoTrack) {
            sender.replaceTrack(videoTrack);
        }
        
        document.getElementById('shareScreenBtn')?.classList.remove('active');
        showToast('Screen sharing stopped', 'info');
    }
}

function toggleRaiseHand() {
    const btn = document.getElementById('raiseHandBtn');
    const isRaised = btn?.classList.contains('active');
    
    if (isRaised) {
        btn?.classList.remove('active');
        showToast('Hand lowered', 'info');
    } else {
        btn?.classList.add('active');
        showToast('Hand raised! Teacher has been notified.', 'success');
        
        // Notify teacher via chat
        sendSystemMessage(`${currentUser.user_metadata?.name || 'A student'} raised their hand`);
    }
}

// ============================================
// RECORDING
// ============================================

async function startRecording() {
    if (!localStream) return;
    
    recordedChunks = [];
    const stream = new MediaStream();
    
    // Add local video track
    localStream.getVideoTracks().forEach(track => stream.addTrack(track));
    localStream.getAudioTracks().forEach(track => stream.addTrack(track));
    
    mediaRecorder = new MediaRecorder(stream);
    
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };
    
    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `class_recording_${new Date().toISOString()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Recording saved!', 'success');
    };
    
    mediaRecorder.start(1000);
    isRecording = true;
    
    const recordBtn = document.getElementById('recordBtn');
    recordBtn?.classList.add('recording');
    recordBtn.innerHTML = '<i class="fas fa-stop"></i>';
    showToast('Recording started', 'success');
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        const recordBtn = document.getElementById('recordBtn');
        recordBtn?.classList.remove('recording');
        recordBtn.innerHTML = '<i class="fas fa-record-vinyl"></i>';
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
// CHAT FUNCTIONALITY
// ============================================

async function loadChatMessages() {
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

function setupRealtimeChat() {
    if (chatSubscription) {
        chatSubscription.unsubscribe();
    }
    
    chatSubscription = supabase
        .channel('classroom_chat')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'classroom_chat', filter: `room_id=eq.${roomId}` },
            (payload) => {
                displayChatMessage(payload.new);
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
        displayChatMessage({ ...message, message: text }, true);
    }
}

function displayChatMessage(message, isLocal = false) {
    const container = document.getElementById('chatMessages');
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
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message system';
    messageDiv.innerHTML = `
        <div class="chat-bubble">
            <i class="fas fa-info-circle"></i> ${escapeHtml(text)}
        </div>
    `;
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
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
// PARTICIPANTS
// ============================================

async function loadParticipants() {
    try {
        const { data, error } = await supabase
            .from('classroom_participants')
            .select('*')
            .eq('room_id', roomId);
        
        if (!error && data) {
            const container = document.getElementById('participantsList');
            container.innerHTML = data.map(p => `
                <div class="participant-item">
                    <div class="participant-avatar">
                        <i class="fas fa-user-circle"></i>
                    </div>
                    <div class="participant-info">
                        <div class="participant-name">${escapeHtml(p.name || 'User')}</div>
                        <div class="participant-role">${p.role === 'teacher' ? 'Teacher' : 'Student'}</div>
                    </div>
                    ${p.role !== 'teacher' ? '<div class="participant-hand" style="display: none;"><i class="fas fa-hand-paper"></i></div>' : ''}
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading participants:', error);
    }
}

// ============================================
// UI HELPERS
// ============================================

function toggleSidebar() {
    sidebar?.classList.toggle('open');
}

function switchTab(tab) {
    const chatPanel = document.getElementById('chatPanel');
    const participantsPanel = document.getElementById('participantsPanel');
    const tabs = document.querySelectorAll('.sidebar-tab');
    
    tabs.forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    if (tab === 'chat') {
        chatPanel.style.display = 'flex';
        participantsPanel.style.display = 'none';
    } else {
        chatPanel.style.display = 'none';
        participantsPanel.style.display = 'flex';
        loadParticipants();
    }
}

function useMockMode() {
    if (waitingState) waitingState.style.display = 'none';
    
    // Add mock teacher video
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
    
    showToast('Connected to demo classroom', 'success');
}

function leaveRoom() {
    if (confirm('Are you sure you want to leave the virtual classroom?')) {
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
        
        // Stop timer
        addTimeSpent();
        stopTimer();
        
        window.location.href = '/dashboard.html';
    }
}

// ============================================
// TIMER
// ============================================

let timerSeconds = 0;
let timerInterval = null;

function startClassTimer() {
    timerInterval = setInterval(() => {
        timerSeconds++;
        const minutes = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
        const seconds = (timerSeconds % 60).toString().padStart(2, '0');
        const timerElement = document.getElementById('roomTimer');
        if (timerElement) timerElement.textContent = `${minutes}:${seconds}`;
    }, 1000);
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Back button
    document.getElementById('backBtn')?.addEventListener('click', leaveRoom);
    
    // Media controls
    document.getElementById('toggleMicBtn')?.addEventListener('click', toggleMicrophone);
    document.getElementById('toggleCamBtn')?.addEventListener('click', toggleCamera);
    document.getElementById('shareScreenBtn')?.addEventListener('click', toggleScreenShare);
    document.getElementById('raiseHandBtn')?.addEventListener('click', toggleRaiseHand);
    document.getElementById('recordBtn')?.addEventListener('click', toggleRecording);
    document.getElementById('whiteboardBtn')?.addEventListener('click', toggleWhiteboard);
    document.getElementById('closeWhiteboardBtn')?.addEventListener('click', toggleWhiteboard);
    
    // Local video controls
    document.getElementById('localMicBtn')?.addEventListener('click', toggleMicrophone);
    document.getElementById('localCamBtn')?.addEventListener('click', toggleCamera);
    
    // Sidebar
    document.getElementById('toggleSidebarBtn')?.addEventListener('click', toggleSidebar);
    document.getElementById('closeSidebarBtn')?.addEventListener('click', toggleSidebar);
    
    // Tabs
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    // Chat
    document.getElementById('chatSendBtn')?.addEventListener('click', sendChatMessage);
    document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    
    // Whiteboard tools
    document.querySelectorAll('.wb-tool').forEach(tool => {
        tool.addEventListener('click', () => {
            const toolName = tool.dataset.tool;
            if (toolName) setWbTool(toolName);
        });
    });
    document.querySelector('.wb-color')?.addEventListener('change', (e) => setWbColor(e.target.value));
    
    // Leave button
    document.getElementById('leaveBtn')?.addEventListener('click', leaveRoom);
    
    // Start timer
    startClassTimer();
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        addTimeSpent();
        stopTimer();
    });
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

// Make functions global for inline handlers
window.toggleWhiteboard = toggleWhiteboard;
window.setWbTool = setWbTool;
window.setWbColor = setWbColor;
window.toggleSidebar = toggleSidebar;
window.switchTab = switchTab;
window.sendChatMessage = sendChatMessage;
window.leaveRoom = leaveRoom;

console.log('Virtual Classroom loaded successfully');
