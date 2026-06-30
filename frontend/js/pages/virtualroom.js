// ============================================
// 🎥 VIRTUAL ROOM - Complete
// WhatsApp + Discord + Zoom + Skype Fusion
// With Chat IFrame Integration
// ============================================

import { supabase, getCurrentUser, getUserProfile, updateWalletBalance } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// STATE
// ============================================

const state = {
    currentUser: null,
    userProfile: null,
    sessionId: null,
    sessionCode: null,
    isHost: false,
    isLive: false,
    sessionEnded: false,
    localStream: null,
    peer: null,
    peerId: null,
    hostPeerId: null,
    participants: new Map(),
    viewerStreams: new Map(),
    chatSubscription: null,
    sessionSubscription: null,
    participantsSubscription: null,
    classStartTime: Date.now(),
    timerInterval: null,
    starRating: 0,
    hasRated: false,
    hasTipped: false,
    whiteboardActive: false,
    wbCtx: null,
    wbPainting: false,
    wbColor: '#fbb040',
    wbTool: 'pen',
    wbHistory: [],
    wbHistoryIndex: -1,
    viewerCount: 0,
    tipsTotal: 0,
    gpTipsTotal: 0,
    starsCount: 0,
    avgRating: 0,
    totalRatings: 0,
    handRaised: false,
    isMuted: false,
    isCameraOff: false,
    unreadCount: 0,
    chatIframeReady: false,
    activeViewerId: null,
    screenStream: null,
    isScreenSharing: false,
};

// ============================================
// DOM REFS
// ============================================

const DOM = {};

function cacheDOM() {
    DOM.hostVideo = document.getElementById('hostVideo');
    DOM.hostPlaceholder = document.getElementById('hostPlaceholder');
    DOM.hostName = document.getElementById('hostName');
    DOM.hostStars = document.getElementById('hostStars');
    DOM.hostTips = document.getElementById('hostTips');
    DOM.localVideo = document.getElementById('localVideo');
    DOM.localVideoCard = document.getElementById('localVideoCard');
    DOM.pipVideo = document.getElementById('pipVideo');
    DOM.pipPlaceholder = document.getElementById('pipPlaceholder');
    DOM.videoGrid = document.getElementById('videoGrid');
    DOM.viewerThumbnails = document.getElementById('viewerThumbnails');
    DOM.loadingOverlay = document.getElementById('loadingOverlay');
    DOM.loadingText = document.getElementById('loadingText');
    DOM.loadingSubText = document.getElementById('loadingSubText');
    DOM.roomTitle = document.getElementById('roomTitle');
    DOM.classTimer = document.getElementById('classTimer');
    DOM.viewerCount = document.getElementById('viewerCount');
    DOM.participantCount = document.getElementById('participantCount');
    DOM.tipCount = document.getElementById('tipCount');
    DOM.chatSidebar = document.getElementById('chatSidebar');
    DOM.chatOverlay = document.getElementById('chatOverlay');
    DOM.chatIframe = document.getElementById('chatIframe');
    DOM.chatCount = document.getElementById('chatCount');
    DOM.unreadBadge = document.getElementById('unreadBadge');
    DOM.whiteboardOverlay = document.getElementById('whiteboardOverlay');
    DOM.wbCanvas = document.getElementById('whiteboardCanvas');
    DOM.tipModal = document.getElementById('tipModal');
    DOM.starModal = document.getElementById('starModal');
    DOM.participantsModal = document.getElementById('participantsModal');
    DOM.shareModal = document.getElementById('shareModal');
    DOM.sessionEndedOverlay = document.getElementById('sessionEndedOverlay');
    DOM.finalStars = document.getElementById('finalStars');
    DOM.finalViewers = document.getElementById('finalViewers');
    DOM.finalTips = document.getElementById('finalTips');
    DOM.userBalance = document.getElementById('userBalance');
    DOM.userGP = document.getElementById('userGP');
    DOM.viewerControls = document.getElementById('viewerControls');
    DOM.hostControls = document.getElementById('hostControls');
    DOM.shareCodeDisplay = document.getElementById('shareCodeDisplay');
    DOM.participantsModalList = document.getElementById('participantsModalList');
    DOM.pipMicControl = document.getElementById('pipMicControl');
    DOM.pipCamControl = document.getElementById('pipCamControl');
    DOM.videoQuality = document.getElementById('videoQuality');
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎥 Virtual Room initializing...');
    cacheDOM();

    try {
        // Get current user
        state.currentUser = await getCurrentUser();
        if (!state.currentUser) {
            showLoginScreen();
            return;
        }

        state.userProfile = await getUserProfile();
        if (!state.userProfile) {
            showToast('Could not load profile', 'error');
            return;
        }

        // Update balance display
        updateBalanceDisplay();

        // Get session from URL
        const params = new URLSearchParams(window.location.search);
        const sessionCode = params.get('code');
        const mode = params.get('mode');

        if (mode === 'host') {
            await createNewSession();
        } else if (sessionCode) {
            await joinSession(sessionCode);
        } else {
            showSessionSelection();
            return;
        }

        // Setup UI
        setupUI();
        setupEventListeners();
        setupRealtimeSubscriptions();
        setupChatIframe();

        // Start timer
        startTimer();

        console.log('✅ Virtual Room ready');
        showLoading(false);

    } catch (error) {
        console.error('❌ Initialization error:', error);
        showToast('Failed to initialize room', 'error');
        showLoading(false);
        useFallbackMode();
    }
});

// ============================================
// SESSION MANAGEMENT
// ============================================

async function createNewSession() {
    try {
        showLoading(true);
        DOM.loadingText.textContent = 'Creating your session...';

        // Check if host can create session
        const canHost = await checkHostEligibility();
        if (!canHost) {
            showToast('You are on cooldown. Please wait 48 hours.', 'error');
            setTimeout(() => window.location.href = '/user', 2000);
            return;
        }

        // Call Supabase function to create session
        const { data, error } = await supabase.rpc('create_session', {
            p_host_id: state.currentUser.id,
            p_title: `${state.userProfile.name || 'User'}'s Session`,
            p_description: 'Live learning session'
        });

        if (error) throw error;

        state.sessionId = data;
        state.isHost = true;
        state.isLive = true;

        // Get session details
        const { data: session, error: sessionError } = await supabase
            .from('virtual_sessions')
            .select('*')
            .eq('id', state.sessionId)
            .single();

        if (sessionError) throw sessionError;

        state.sessionCode = session.session_code;
        DOM.roomTitle.textContent = session.title || 'Live Session';
        DOM.shareCodeDisplay.textContent = state.sessionCode;

        // Update UI for host
        DOM.hostControls.style.display = 'flex';
        DOM.viewerControls.style.display = 'none';

        // Start local stream
        await startLocalStream();

        // Initialize PeerJS
        await initPeerJS(true);

        // Update session status to live
        await supabase
            .from('virtual_sessions')
            .update({ status: 'live', start_time: new Date().toISOString() })
            .eq('id', state.sessionId);

        // Show share info
        showToast(`Session created! Code: ${state.sessionCode}`, 'success');
        
        // Auto-open share modal for host
        setTimeout(() => {
            DOM.shareModal.classList.add('active');
        }, 1500);

        console.log('📡 Session created:', state.sessionCode);

    } catch (error) {
        console.error('❌ Create session error:', error);
        showToast('Failed to create session', 'error');
        useFallbackMode();
    }
}

async function joinSession(sessionCode) {
    try {
        showLoading(true);
        DOM.loadingText.textContent = 'Joining session...';

        // Get session by code
        const { data: session, error } = await supabase
            .from('virtual_sessions')
            .select('*')
            .eq('session_code', sessionCode.toUpperCase())
            .single();

        if (error || !session) {
            showToast('Session not found', 'error');
            setTimeout(() => window.location.href = '/user', 2000);
            return;
        }

        if (session.status === 'ended') {
            showToast('This session has ended', 'error');
            setTimeout(() => window.location.href = '/user', 2000);
            return;
        }

        state.sessionId = session.id;
        state.sessionCode = session.session_code;
        state.isHost = false;
        state.isLive = session.status === 'live';
        DOM.roomTitle.textContent = session.title || 'Live Session';
        DOM.shareCodeDisplay.textContent = state.sessionCode;

        // Add viewer to participants
        await supabase
            .from('session_participants')
            .upsert({
                session_id: state.sessionId,
                user_id: state.currentUser.id,
                role: 'viewer',
                is_active: true,
                joined_at: new Date().toISOString()
            });

        // Update viewer count
        await updateViewerCount();

        // Update UI for viewer
        DOM.hostControls.style.display = 'none';
        DOM.viewerControls.style.display = 'flex';

        // Show local video
        DOM.pipVideo.style.display = 'block';
        await startLocalStream();

        // Initialize PeerJS
        await initPeerJS(false);

        // Load host stream
        await loadHostStream(session.host_id);

        // Load participants
        await loadParticipants();

        console.log('📡 Joined session:', sessionCode);

    } catch (error) {
        console.error('❌ Join session error:', error);
        showToast('Failed to join session', 'error');
        useFallbackMode();
    }
}

// ============================================
// PEERJS (WebRTC)
// ============================================

async function initPeerJS(isHost) {
    return new Promise((resolve) => {
        try {
            const peerId = `glimu_${state.currentUser.id}_${Date.now()}`;

            state.peer = new Peer(peerId, {
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

            state.peer.on('open', async (id) => {
                state.peerId = id;
                console.log('🔗 PeerJS connected:', id);

                // Register peer ID
                await supabase
                    .from('session_participants')
                    .update({ peer_id: id })
                    .eq('session_id', state.sessionId)
                    .eq('user_id', state.currentUser.id);

                if (isHost) {
                    // Host waits for connections
                    state.peer.on('connection', handlePeerConnection);
                    state.peer.on('call', handleIncomingCall);
                } else {
                    // Viewer connects to host
                    await connectToHost();
                }

                resolve();
            });

            state.peer.on('error', (err) => {
                console.error('❌ PeerJS error:', err);
                showToast('Connection issue. Using chat-only mode.', 'warning');
                useFallbackMode();
                resolve();
            });

        } catch (err) {
            console.error('❌ PeerJS init error:', err);
            useFallbackMode();
            resolve();
        }
    });
}

async function connectToHost() {
    try {
        // Get host peer ID
        const { data: host } = await supabase
            .from('session_participants')
            .select('peer_id, user_id')
            .eq('session_id', state.sessionId)
            .eq('role', 'host')
            .single();

        if (host?.peer_id) {
            state.hostPeerId = host.peer_id;
            
            // Call host
            const call = state.peer.call(host.peer_id, state.localStream);
            call.on('stream', (remoteStream) => {
                DOM.hostVideo.srcObject = remoteStream;
                DOM.hostVideo.play().catch(() => {});
                DOM.hostVideo.parentElement.classList.add('has-video');
                DOM.hostPlaceholder.style.display = 'none';
            });
            call.on('close', () => {
                DOM.hostVideo.parentElement.classList.remove('has-video');
                DOM.hostPlaceholder.style.display = 'flex';
            });
        }
    } catch (error) {
        console.error('❌ Connect to host error:', error);
    }
}

function handleIncomingCall(call) {
    call.answer(state.localStream);
    call.on('stream', (remoteStream) => {
        DOM.hostVideo.srcObject = remoteStream;
        DOM.hostVideo.play().catch(() => {});
        DOM.hostVideo.parentElement.classList.add('has-video');
        DOM.hostPlaceholder.style.display = 'none';
    });
}

function handlePeerConnection(conn) {
    console.log('📡 Peer connected:', conn.peer);
    
    conn.on('data', (data) => {
        handlePeerData(data, conn.peer);
    });
}

function handlePeerData(data, peerId) {
    console.log('📨 Peer data:', data);
    
    switch (data.type) {
        case 'mute_audio':
            if (state.localStream) {
                const audioTrack = state.localStream.getAudioTracks()[0];
                if (audioTrack) {
                    audioTrack.enabled = !data.value;
                    state.isMuted = data.value;
                    updateLocalControls();
                }
            }
            break;
            
        case 'mute_video':
            if (state.localStream) {
                const videoTrack = state.localStream.getVideoTracks()[0];
                if (videoTrack) {
                    videoTrack.enabled = !data.value;
                    state.isCameraOff = data.value;
                    updateLocalControls();
                }
            }
            break;
            
        case 'whiteboard_update':
            // Handle whiteboard sync
            handleWhiteboardSync(data);
            break;
            
        case 'screen_share':
            // Handle screen share
            handleScreenShare(data, peerId);
            break;
    }
}

// ============================================
// STREAM MANAGEMENT
// ============================================

async function startLocalStream() {
    try {
        state.localStream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'user', 
                width: { ideal: 640 }, 
                height: { ideal: 480 } 
            },
            audio: true
        });

        DOM.localVideo.srcObject = state.localStream;
        await DOM.localVideo.play();
        DOM.pipVideo.style.display = 'block';
        DOM.pipVideo.classList.add('has-video');
        DOM.pipPlaceholder.style.display = 'none';

        // Update mic/cam status
        updateLocalControls();

        console.log('🎥 Local stream started');

    } catch (err) {
        console.error('❌ Camera error:', err);
        showToast('Could not access camera/microphone', 'warning');
        DOM.pipVideo.classList.remove('has-video');
        DOM.pipPlaceholder.style.display = 'flex';
    }
}

function toggleMicrophone() {
    if (!state.localStream) return;
    const audioTrack = state.localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    state.isMuted = !audioTrack.enabled;
    audioTrack.enabled = !audioTrack.enabled;

    updateLocalControls();
    showToast(state.isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
    
    // Notify host if viewer
    if (!state.isHost && state.peer) {
        const conn = state.peer.connect(state.hostPeerId);
        conn.on('open', () => {
            conn.send({
                type: 'audio_status',
                muted: state.isMuted,
                userId: state.currentUser.id
            });
        });
    }
}

function toggleCamera() {
    if (!state.localStream) return;
    const videoTrack = state.localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    state.isCameraOff = !videoTrack.enabled;
    videoTrack.enabled = !videoTrack.enabled;

    DOM.pipVideo.classList.toggle('camera-off', state.isCameraOff);
    updateLocalControls();
    showToast(state.isCameraOff ? 'Camera off' : 'Camera on', 'info');
    
    // Notify host if viewer
    if (!state.isHost && state.peer) {
        const conn = state.peer.connect(state.hostPeerId);
        conn.on('open', () => {
            conn.send({
                type: 'video_status',
                off: state.isCameraOff,
                userId: state.currentUser.id
            });
        });
    }
}

function updateLocalControls() {
    const micIcon = DOM.pipMicControl?.querySelector('i');
    const camIcon = DOM.pipCamControl?.querySelector('i');

    if (micIcon) {
        micIcon.className = state.isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
        DOM.pipMicControl.classList.toggle('off', state.isMuted);
    }

    if (camIcon) {
        camIcon.className = state.isCameraOff ? 'fas fa-video-slash' : 'fas fa-video';
        DOM.pipCamControl.classList.toggle('off', state.isCameraOff);
    }
}

// ============================================
// SCREEN SHARE
// ============================================

async function toggleScreenShare() {
    if (!state.isHost) {
        showToast('Only hosts can share screens', 'warning');
        return;
    }

    if (state.isScreenSharing) {
        // Stop screen share
        if (state.screenStream) {
            state.screenStream.getTracks().forEach(t => track.stop());
            state.screenStream = null;
        }
        state.isScreenSharing = false;
        document.getElementById('screenBtn').classList.remove('active');
        showToast('Screen share stopped', 'info');
        return;
    }

    try {
        state.screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' },
            audio: false
        });

        state.isScreenSharing = true;
        document.getElementById('screenBtn').classList.add('active');
        showToast('Screen sharing started', 'success');

        // Broadcast to all viewers
        state.participants.forEach((participant, userId) => {
            if (userId !== state.currentUser.id) {
                const conn = state.peer.connect(participant.peer_id);
                conn.on('open', () => {
                    conn.send({
                        type: 'screen_share',
                        stream: true
                    });
                });
            }
        });

        // Display screen on host video
        DOM.hostVideo.srcObject = state.screenStream;
        DOM.videoQuality.textContent = 'SCREEN';

        state.screenStream.getVideoTracks()[0].onended = () => {
            toggleScreenShare();
        };

    } catch (err) {
        console.error('Screen share error:', err);
        showToast('Screen share cancelled or failed', 'warning');
        state.isScreenSharing = false;
        document.getElementById('screenBtn').classList.remove('active');
    }
}

function handleScreenShare(data, peerId) {
    if (data.stream) {
        // Request screen stream from host
        const call = state.peer.call(peerId, null);
        call.on('stream', (stream) => {
            DOM.hostVideo.srcObject = stream;
            DOM.videoQuality.textContent = 'SCREEN';
        });
    }
}

// ============================================
// HOST STREAM LOADING (for viewers)
// ============================================

async function loadHostStream(hostId) {
    try {
        // Get host participant
        const { data: host } = await supabase
            .from('session_participants')
            .select('peer_id')
            .eq('session_id', state.sessionId)
            .eq('user_id', hostId)
            .single();

        if (host?.peer_id) {
            state.hostPeerId = host.peer_id;
            const call = state.peer.call(host.peer_id, state.localStream);
            call.on('stream', (stream) => {
                DOM.hostVideo.srcObject = stream;
                DOM.hostVideo.play().catch(() => {});
                DOM.hostVideo.parentElement.classList.add('has-video');
                DOM.hostPlaceholder.style.display = 'none';
            });
            call.on('close', () => {
                DOM.hostVideo.parentElement.classList.remove('has-video');
                DOM.hostPlaceholder.style.display = 'flex';
            });
        }
    } catch (error) {
        console.error('❌ Load host stream error:', error);
    }
}

// ============================================
// VIEWER THUMBNAILS
// ============================================

function renderViewerThumbnails() {
    if (!DOM.viewerThumbnails) return;

    const viewers = Array.from(state.participants.values())
        .filter(p => p.user_id !== state.currentUser.id && p.role !== 'host');

    if (viewers.length === 0) {
        DOM.viewerThumbnails.innerHTML = `
            <div class="empty-thumbnails">
                <i class="fas fa-users"></i>
                <span>No viewers yet</span>
            </div>
        `;
        return;
    }

    DOM.viewerThumbnails.innerHTML = viewers.map(viewer => {
        const isActive = state.activeViewerId === viewer.user_id;
        const isMuted = viewer.is_muted || false;
        const isVideoOff = viewer.is_video_off || false;
        const handRaised = viewer.hand_raised || false;

        return `
            <div class="viewer-thumbnail ${isActive ? 'active' : ''}" 
                 data-user-id="${viewer.user_id}"
                 onclick="switchViewer('${viewer.user_id}')">
                <video id="viewer_${viewer.user_id}" autoplay playsinline muted></video>
                <div class="thumb-placeholder" style="${isVideoOff ? 'display:flex' : 'display:none'}">
                    <i class="fas fa-user-circle"></i>
                </div>
                <div class="thumb-name">${viewer.name || 'Viewer'}</div>
                <div class="thumb-status">
                    ${handRaised ? '<i class="status-icon hand-raised fas fa-hand-paper"></i>' : ''}
                    ${isMuted ? '<i class="status-icon muted fas fa-microphone-slash"></i>' : ''}
                    ${isVideoOff ? '<i class="status-icon video-off fas fa-video-slash"></i>' : ''}
                </div>
                ${state.isHost ? `
                    <button class="mute-btn" onclick="event.stopPropagation(); toggleViewerMute('${viewer.user_id}')">
                        ${isMuted ? 'Unmute' : 'Mute'}
                    </button>
                ` : ''}
            </div>
        `;
    }).join('');

    // Attach viewer streams
    viewers.forEach(viewer => {
        const videoEl = document.getElementById(`viewer_${viewer.user_id}`);
        if (videoEl && state.viewerStreams.has(viewer.user_id)) {
            videoEl.srcObject = state.viewerStreams.get(viewer.user_id);
        }
    });
}

// ============================================
// VIEWER MANAGEMENT
// ============================================

async function loadParticipants() {
    try {
        const { data, error } = await supabase
            .from('session_participants')
            .select('*, users(name, email)')
            .eq('session_id', state.sessionId)
            .eq('is_active', true);

        if (error) throw error;

        state.participants.clear();
        data.forEach(p => {
            state.participants.set(p.user_id, {
                ...p,
                name: p.users?.name || 'User'
            });
        });

        // Update counts
        const viewerCount = data.filter(p => p.role !== 'host').length;
        state.viewerCount = viewerCount;
        DOM.viewerCount.textContent = viewerCount;
        DOM.participantCount.textContent = data.length;

        // Render thumbnails
        renderViewerThumbnails();

        // Update participants modal
        renderParticipantsModal();

    } catch (error) {
        console.error('❌ Load participants error:', error);
    }
}

async function updateViewerCount() {
    try {
        const { count, error } = await supabase
            .from('session_participants')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', state.sessionId)
            .eq('is_active', true)
            .neq('role', 'host');

        if (!error) {
            state.viewerCount = count || 0;
            DOM.viewerCount.textContent = state.viewerCount;
        }
    } catch (error) {
        console.error('❌ Update viewer count error:', error);
    }
}

function switchViewer(userId) {
    if (state.activeViewerId === userId) {
        state.activeViewerId = null;
        // Switch back to host
        if (state.isHost && state.screenStream && state.isScreenSharing) {
            DOM.hostVideo.srcObject = state.screenStream;
            DOM.videoQuality.textContent = 'SCREEN';
        } else {
            // Reload host stream
            loadHostStream(state.participants.get(userId)?.user_id);
        }
        renderViewerThumbnails();
        return;
    }

    state.activeViewerId = userId;
    const viewer = state.participants.get(userId);
    if (viewer && state.viewerStreams.has(userId)) {
        DOM.hostVideo.srcObject = state.viewerStreams.get(userId);
        DOM.videoQuality.textContent = 'VIEWER';
        renderViewerThumbnails();
    }
}

// ============================================
// HOST CONTROLS - MUTE
// ============================================

async function toggleViewerMute(userId) {
    if (!state.isHost) return;

    const viewer = state.participants.get(userId);
    if (!viewer) return;

    const isMuted = !viewer.is_muted;

    // Update in database
    await supabase
        .from('session_participants')
        .update({ is_muted: isMuted })
        .eq('session_id', state.sessionId)
        .eq('user_id', userId);

    // Send mute command via PeerJS
    if (viewer.peer_id) {
        const conn = state.peer.connect(viewer.peer_id);
        conn.on('open', () => {
            conn.send({
                type: 'mute_audio',
                value: isMuted
            });
        });
    }

    // Update local state
    viewer.is_muted = isMuted;
    state.participants.set(userId, viewer);

    showToast(`${isMuted ? 'Muted' : 'Unmuted'} ${viewer.name || 'Viewer'}`, 'info');
    renderViewerThumbnails();
}

async function toggleMuteAll() {
    if (!state.isHost) return;

    const viewers = Array.from(state.participants.values())
        .filter(p => p.role !== 'host');

    const allMuted = viewers.every(v => v.is_muted);
    const newMuteState = !allMuted;

    for (const viewer of viewers) {
        await toggleViewerMute(viewer.user_id);
    }

    document.getElementById('muteAllBtn').classList.toggle('active', newMuteState);
    showToast(newMuteState ? 'All viewers muted' : 'All viewers unmuted', 'info');
}

// ============================================
// RAISE HAND
// ============================================

async function toggleRaiseHand() {
    state.handRaised = !state.handRaised;

    await supabase
        .from('session_participants')
        .update({ hand_raised: state.handRaised })
        .eq('session_id', state.sessionId)
        .eq('user_id', state.currentUser.id);

    const btn = document.getElementById('raiseHandBtn');
    btn?.classList.toggle('active', state.handRaised);

    if (state.handRaised) {
        showToast('Hand raised! 🙋', 'success');
        
        // Notify host via chat iframe
        sendToChatIframe({
            type: 'system_message',
            message: `🙋 ${state.userProfile.name || 'A viewer'} raised their hand`
        });

        // Also notify via toast
        if (!state.isHost) {
            showToast('Host has been notified', 'info');
        }
    } else {
        showToast('Hand lowered', 'info');
    }
}

// ============================================
// TIPPING SYSTEM
// ============================================

async function sendTip(amount, currency) {
    if (!state.sessionId) {
        showToast('No active session', 'error');
        return;
    }

    // Get host ID
    const { data: session } = await supabase
        .from('virtual_sessions')
        .select('host_id')
        .eq('id', state.sessionId)
        .single();

    if (!session) {
        showToast('Session not found', 'error');
        return;
    }

    const hostId = session.host_id;
    const userBalance = state.userProfile.wallet_balance || 0;
    const userGP = state.userProfile.gp_points || 0;

    if (currency === 'wallet' && amount > userBalance) {
        showToast('Insufficient wallet balance', 'error');
        return;
    }

    if (currency === 'gp' && amount > userGP) {
        showToast('Insufficient GP points', 'error');
        return;
    }

    try {
        // Deduct from user
        const newBalance = currency === 'wallet' ? userBalance - amount : userBalance;
        const newGP = currency === 'gp' ? userGP - amount : userGP;

        await supabase
            .from('users')
            .update({
                wallet_balance: newBalance,
                gp_points: newGP
            })
            .eq('id', state.currentUser.id);

        // Record tip
        await supabase
            .from('session_tips')
            .insert({
                session_id: state.sessionId,
                from_user: state.currentUser.id,
                to_host: hostId,
                amount: currency === 'wallet' ? amount : 0,
                gp_amount: currency === 'gp' ? amount : 0,
                tip_type: currency === 'wallet' ? 'wallet' : 'gp'
            });

        // Update session tips total
        if (currency === 'wallet') {
            state.tipsTotal += amount;
            await supabase
                .from('virtual_sessions')
                .update({ tips_total: state.tipsTotal })
                .eq('id', state.sessionId);
        } else {
            state.gpTipsTotal += amount;
            await supabase
                .from('virtual_sessions')
                .update({ gp_tips_total: state.gpTipsTotal })
                .eq('id', state.sessionId);
        }

        // Update host wallet/GP
        if (currency === 'wallet') {
            const { data: host } = await supabase
                .from('users')
                .select('wallet_balance')
                .eq('id', hostId)
                .single();

            await supabase
                .from('users')
                .update({ wallet_balance: (host?.wallet_balance || 0) + amount })
                .eq('id', hostId);
        } else {
            const { data: host } = await supabase
                .from('users')
                .select('gp_points')
                .eq('id', hostId)
                .single();

            await supabase
                .from('users')
                .update({ gp_points: (host?.gp_points || 0) + amount })
                .eq('id', hostId);
        }

        state.userProfile.wallet_balance = newBalance;
        state.userProfile.gp_points = newGP;
        updateBalanceDisplay();

        showToast(`Tip sent! ${amount} ${currency === 'wallet' ? '₦' : 'GP'}`, 'success');
        DOM.tipModal.classList.remove('active');

        // Update host stats
        updateHostStats();

        // Notify host via chat iframe
        sendToChatIframe({
            type: 'system_message',
            message: `🎁 ${state.userProfile.name || 'A viewer'} sent a tip!`
        });

    } catch (error) {
        console.error('❌ Send tip error:', error);
        showToast('Failed to send tip', 'error');
    }
}

function updateBalanceDisplay() {
    const balance = state.userProfile?.wallet_balance || 0;
    const gp = state.userProfile?.gp_points || 0;
    DOM.userBalance.textContent = `₦${balance.toLocaleString()}`;
    DOM.userGP.textContent = gp.toLocaleString();
}

function updateHostStats() {
    // Update host stars and tips from session data
    supabase
        .from('virtual_sessions')
        .select('stars_count, tips_total, avg_rating, total_ratings')
        .eq('id', state.sessionId)
        .single()
        .then(({ data }) => {
            if (data) {
                DOM.hostStars.textContent = data.stars_count || 0;
                DOM.hostTips.textContent = `₦${data.tips_total || 0}`;
            }
        });
}

// ============================================
// STAR RATING SYSTEM
// ============================================

function setupStarRating() {
    const stars = DOM.starModal.querySelectorAll('.star');
    stars.forEach(star => {
        star.addEventListener('click', () => {
            const value = parseInt(star.dataset.value);
            state.starRating = value;
            stars.forEach(s => {
                s.classList.toggle('selected', parseInt(s.dataset.value) <= value);
            });
        });
    });
}

async function submitRating() {
    if (!state.starRating || state.starRating < 1 || state.starRating > 5) {
        showToast('Please select a rating', 'warning');
        return;
    }

    if (state.hasRated) {
        showToast('You have already rated this session', 'warning');
        return;
    }

    try {
        // Record rating
        await supabase
            .from('session_participants')
            .update({ star_rating: state.starRating })
            .eq('session_id', state.sessionId)
            .eq('user_id', state.currentUser.id);

        // Update session stats
        const { data: session } = await supabase
            .from('virtual_sessions')
            .select('stars_count, total_ratings, avg_rating')
            .eq('id', state.sessionId)
            .single();

        const newTotalRatings = (session?.total_ratings || 0) + 1;
        const newStarsCount = (session?.stars_count || 0) + state.starRating;
        const newAvgRating = newStarsCount / newTotalRatings;

        await supabase
            .from('virtual_sessions')
            .update({
                stars_count: newStarsCount,
                total_ratings: newTotalRatings,
                avg_rating: newAvgRating
            })
            .eq('id', state.sessionId);

        state.hasRated = true;
        DOM.starModal.classList.remove('active');

        showToast(`Rated ${state.starRating} stars! ⭐`, 'success');

        // Update host stats
        DOM.hostStars.textContent = newStarsCount;

        // Notify host via chat iframe
        sendToChatIframe({
            type: 'system_message',
            message: `⭐ ${state.userProfile.name || 'A viewer'} rated ${state.starRating} stars!`
        });

    } catch (error) {
        console.error('❌ Submit rating error:', error);
        showToast('Failed to submit rating', 'error');
    }
}

// ============================================
// HOST ELIGIBILITY (Streak System)
// ============================================

async function checkHostEligibility() {
    try {
        const { data: streak, error } = await supabase
            .from('host_streaks')
            .select('*')
            .eq('user_id', state.currentUser.id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (!streak) {
            await supabase
                .from('host_streaks')
                .insert({
                    user_id: state.currentUser.id,
                    current_streak: 0,
                    best_streak: 0,
                    last_session_date: new Date().toISOString().split('T')[0],
                    sessions_this_week: 0,
                    total_sessions: 0,
                    total_stars: 0,
                    total_tips: 0
                });
            return true;
        }

        if (streak.ban_until && new Date(streak.ban_until) > new Date()) {
            const hoursLeft = Math.ceil((new Date(streak.ban_until) - new Date()) / (1000 * 60 * 60));
            showToast(`You're on cooldown. ${hoursLeft} hours remaining.`, 'error');
            return false;
        }

        return true;

    } catch (error) {
        console.error('❌ Check eligibility error:', error);
        return true;
    }
}

async function updateHostStreak(sessionId) {
    try {
        const { data: session } = await supabase
            .from('virtual_sessions')
            .select('stars_count, total_ratings, avg_rating, tips_total')
            .eq('id', sessionId)
            .single();

        if (!session) return;

        const avgRating = session.avg_rating || 0;
        const passed = avgRating >= 3.5;

        const { data: streak } = await supabase
            .from('host_streaks')
            .select('*')
            .eq('user_id', state.currentUser.id)
            .single();

        let newStreak = streak?.current_streak || 0;
        let bestStreak = streak?.best_streak || 0;

        if (passed) {
            newStreak += 1;
            if (newStreak > bestStreak) bestStreak = newStreak;
        } else {
            newStreak = 0;
            if ((streak?.current_streak || 0) < 5) {
                const banUntil = new Date();
                banUntil.setHours(banUntil.getHours() + 48);
                await supabase
                    .from('host_streaks')
                    .update({ ban_until: banUntil.toISOString() })
                    .eq('user_id', state.currentUser.id);
            }
        }

        await supabase
            .from('host_streaks')
            .update({
                current_streak: newStreak,
                best_streak: bestStreak,
                last_session_date: new Date().toISOString().split('T')[0],
                sessions_this_week: (streak?.sessions_this_week || 0) + 1,
                total_sessions: (streak?.total_sessions || 0) + 1,
                total_stars: (streak?.total_stars || 0) + (session.stars_count || 0),
                total_tips: (streak?.total_tips || 0) + (session.tips_total || 0),
                updated_at: new Date().toISOString()
            })
            .eq('user_id', state.currentUser.id);

        console.log('📊 Streak updated:', { newStreak, bestStreak });

    } catch (error) {
        console.error('❌ Update streak error:', error);
    }
}

// ============================================
// SESSION END
// ============================================

async function endSession() {
    if (!state.isHost) {
        showToast('Only the host can end the session', 'warning');
        return;
    }

    if (!confirm('Are you sure you want to end this session?')) return;

    try {
        showLoading(true);
        DOM.loadingText.textContent = 'Ending session...';

        // Update session status
        await supabase
            .from('virtual_sessions')
            .update({
                status: 'ended',
                end_time: new Date().toISOString()
            })
            .eq('id', state.sessionId);

        // Update host streak
        await updateHostStreak(state.sessionId);

        // Show ended overlay
        const { data: session } = await supabase
            .from('virtual_sessions')
            .select('*')
            .eq('id', state.sessionId)
            .single();

        DOM.finalStars.textContent = `${session.avg_rating || 0} ⭐ (${session.total_ratings || 0} ratings)`;
        DOM.finalViewers.textContent = state.viewerCount;
        DOM.finalTips.textContent = `₦${session.tips_total || 0}`;
        DOM.sessionEndedOverlay.classList.add('active');

        state.sessionEnded = true;
        state.isLive = false;

        // Cleanup
        cleanup();

        showToast('Session ended successfully', 'success');

    } catch (error) {
        console.error('❌ End session error:', error);
        showToast('Failed to end session', 'error');
    }

    showLoading(false);
}

function handleSessionUpdate(session) {
    if (session.status === 'ended' && !state.sessionEnded) {
        state.sessionEnded = true;
        state.isLive = false;

        DOM.finalStars.textContent = `${session.avg_rating || 0} ⭐ (${session.total_ratings || 0} ratings)`;
        DOM.finalViewers.textContent = state.viewerCount;
        DOM.finalTips.textContent = `₦${session.tips_total || 0}`;
        DOM.sessionEndedOverlay.classList.add('active');

        showToast('Session has ended', 'info');
        cleanup();
    }
}

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

function setupRealtimeSubscriptions() {
    if (!state.sessionId) return;

    // Participants
    state.participantsSubscription = supabase
        .channel(`session_participants_${state.sessionId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'session_participants',
            filter: `session_id=eq.${state.sessionId}`
        }, () => {
            loadParticipants();
            updateViewerCount();
        })
        .subscribe();

    // Session updates
    state.sessionSubscription = supabase
        .channel(`session_${state.sessionId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'virtual_sessions',
            filter: `id=eq.${state.sessionId}`
        }, (payload) => {
            handleSessionUpdate(payload.new);
            updateHostStats();
        })
        .subscribe();
}

// ============================================
// CHAT IFRAME COMMUNICATION
// ============================================

function setupChatIframe() {
    const iframe = DOM.chatIframe;
    if (!iframe) return;

    // Listen for messages from the iframe
    window.addEventListener('message', (event) => {
        if (event.source !== iframe.contentWindow) return;

        const data = event.data;
        console.log('📨 Chat iframe message:', data);

        switch (data.type) {
            case 'chat_ready':
                console.log('💬 Chat iframe ready');
                state.chatIframeReady = true;
                // Send session info
                sendToChatIframe({
                    type: 'session_info',
                    sessionId: state.sessionId,
                    sessionCode: state.sessionCode,
                    isHost: state.isHost,
                    roomTitle: DOM.roomTitle.textContent
                });
                break;

            case 'message_sent':
                state.unreadCount++;
                updateUnreadBadge();
                break;

            case 'message_read':
                state.unreadCount = 0;
                updateUnreadBadge();
                break;

            case 'hand_raised':
                if (state.isHost) {
                    showToast(`🙋 ${data.sender} raised their hand!`, 'warning');
                    sendToChatIframe({
                        type: 'system_message',
                        message: `🙋 ${data.sender} raised their hand`
                    });
                }
                break;

            case 'tip_sent':
                showToast(`🎁 ${data.sender} sent a tip!`, 'success');
                updateHostStats();
                break;

            case 'star_rated':
                showToast(`⭐ ${data.sender} rated ${data.stars} stars!`, 'success');
                updateHostStats();
                break;

            case 'viewer_joined':
                showToast(`👤 ${data.sender} joined the session`, 'info');
                updateViewerCount();
                loadParticipants();
                break;

            case 'viewer_left':
                showToast(`👤 ${data.sender} left the session`, 'info');
                updateViewerCount();
                loadParticipants();
                break;
        }
    });

    // Send initial info when iframe loads
    iframe.addEventListener('load', () => {
        setTimeout(() => {
            sendToChatIframe({
                type: 'session_info',
                sessionId: state.sessionId,
                sessionCode: state.sessionCode,
                isHost: state.isHost,
                roomTitle: DOM.roomTitle.textContent
            });
        }, 1500);
    });
}

function sendToChatIframe(data) {
    const iframe = DOM.chatIframe;
    if (iframe && iframe.contentWindow && state.chatIframeReady) {
        try {
            iframe.contentWindow.postMessage(data, '*');
        } catch (e) {
            console.warn('Could not send to iframe:', e);
        }
    }
}

function updateUnreadBadge() {
    if (state.unreadCount > 0) {
        DOM.unreadBadge.style.display = 'block';
        DOM.unreadBadge.textContent = state.unreadCount;
        DOM.chatCount.textContent = state.unreadCount;
    } else {
        DOM.unreadBadge.style.display = 'none';
        DOM.chatCount.textContent = '0';
    }
}

// ============================================
// WHITEBOARD
// ============================================

function initWhiteboard() {
    if (!DOM.wbCanvas) return;

    const canvas = DOM.wbCanvas;
    const ctx = canvas.getContext('2d');

    const resizeCanvas = () => {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height - 56;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = state.wbColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Mouse events
    canvas.addEventListener('mousedown', (e) => {
        state.wbPainting = true;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);
        ctx.beginPath();
        ctx.moveTo(x, y);
        
        // Start recording stroke
        state.wbHistory = state.wbHistory.slice(0, state.wbHistoryIndex + 1);
        state.wbHistory.push({
            type: 'start',
            x, y,
            color: ctx.strokeStyle,
            lineWidth: ctx.lineWidth
        });
        state.wbHistoryIndex = state.wbHistory.length - 1;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!state.wbPainting) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
        
        // Record stroke point
        state.wbHistory.push({
            type: 'point',
            x, y
        });
        state.wbHistoryIndex = state.wbHistory.length - 1;
    });

    canvas.addEventListener('mouseup', () => { 
        state.wbPainting = false;
        // Broadcast whiteboard update
        broadcastWhiteboardUpdate();
    });
    canvas.addEventListener('mouseleave', () => { 
        state.wbPainting = false;
    });

    // Touch events
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        state.wbPainting = true;
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
        ctx.beginPath();
        ctx.moveTo(x, y);
    });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!state.wbPainting) return;
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    });

    canvas.addEventListener('touchend', () => { 
        state.wbPainting = false;
        broadcastWhiteboardUpdate();
    });

    state.wbCtx = ctx;
}

function setWbTool(tool) {
    state.wbTool = tool;
    const ctx = state.wbCtx;
    if (!ctx) return;

    if (tool === 'eraser') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 20;
    } else if (tool === 'pen') {
        ctx.strokeStyle = state.wbColor;
        ctx.lineWidth = 3;
    } else if (tool === 'clear') {
        ctx.clearRect(0, 0, DOM.wbCanvas.width, DOM.wbCanvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, DOM.wbCanvas.width, DOM.wbCanvas.height);
        state.wbHistory = [];
        state.wbHistoryIndex = -1;
        broadcastWhiteboardUpdate();
        return;
    } else if (tool === 'text') {
        const text = prompt('Enter text:');
        if (text) {
            ctx.font = '24px Space Grotesk';
            ctx.fillStyle = state.wbColor;
            ctx.fillText(text, 50, 50);
            broadcastWhiteboardUpdate();
        }
        return;
    }

    document.querySelectorAll('.wb-tool').forEach(btn => btn.classList.remove('active'));
    if (tool !== 'clear' && tool !== 'text') {
        const activeBtn = document.querySelector(`.wb-tool[data-tool="${tool}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    }
}

function setWbColor(color) {
    state.wbColor = color;
    if (state.wbCtx && state.wbTool !== 'eraser') {
        state.wbCtx.strokeStyle = color;
    }
}

function toggleWhiteboard() {
    state.whiteboardActive = !state.whiteboardActive;
    DOM.whiteboardOverlay.classList.toggle('active', state.whiteboardActive);
    if (state.whiteboardActive) {
        setTimeout(initWhiteboard, 100);
    }
}

function broadcastWhiteboardUpdate() {
    if (!state.isHost) return;
    
    // Get canvas data
    const canvas = DOM.wbCanvas;
    const dataUrl = canvas.toDataURL('image/png');
    
    // Broadcast to all viewers
    state.participants.forEach((participant, userId) => {
        if (userId !== state.currentUser.id) {
            const conn = state.peer.connect(participant.peer_id);
            conn.on('open', () => {
                conn.send({
                    type: 'whiteboard_update',
                    data: dataUrl
                });
            });
        }
    });
}

function handleWhiteboardSync(data) {
    if (data.data) {
        const img = new Image();
        img.onload = () => {
            const canvas = DOM.wbCanvas;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = data.data;
    }
}

// ============================================
// UI HELPERS
// ============================================

function setupUI() {
    // Show/hide controls
    if (state.isHost) {
        DOM.hostControls.style.display = 'flex';
        DOM.viewerControls.style.display = 'none';
    } else {
        DOM.hostControls.style.display = 'none';
        DOM.viewerControls.style.display = 'flex';
        DOM.pipVideo.style.display = 'block';
    }

    // Setup star rating
    setupStarRating();

    // Init whiteboard
    initWhiteboard();

    // Show chat iframe
    DOM.chatIframe.src = `/chat.html?embedded=1&channel=session_${state.sessionId || 'temp'}`;
}

function setupEventListeners() {
    // Navigation
    document.getElementById('backBtn')?.addEventListener('click', leaveRoom);
    document.getElementById('leaveBtn')?.addEventListener('click', leaveRoom);

    // Media controls
    document.getElementById('micBtn')?.addEventListener('click', toggleMicrophone);
    document.getElementById('camBtn')?.addEventListener('click', toggleCamera);
    DOM.pipMicControl?.addEventListener('click', toggleMicrophone);
    DOM.pipCamControl?.addEventListener('click', toggleCamera);

    // Host controls
    document.getElementById('screenBtn')?.addEventListener('click', toggleScreenShare);
    document.getElementById('endSessionBtn')?.addEventListener('click', endSession);
    document.getElementById('whiteboardBtn')?.addEventListener('click', toggleWhiteboard);
    document.getElementById('muteAllBtn')?.addEventListener('click', toggleMuteAll);

    // Viewer controls
    document.getElementById('raiseHandBtn')?.addEventListener('click', toggleRaiseHand);
    document.getElementById('tipBtn')?.addEventListener('click', () => {
        DOM.tipModal.classList.add('active');
    });
    document.getElementById('starBtn')?.addEventListener('click', () => {
        if (state.hasRated) {
            showToast('You already rated this session', 'warning');
            return;
        }
        DOM.starModal.classList.add('active');
    });

    // Share
    document.getElementById('shareBtn')?.addEventListener('click', () => {
        DOM.shareModal.classList.add('active');
    });
    document.getElementById('shareToChatBtn')?.addEventListener('click', shareToChat);
    document.getElementById('copyCodeBtn')?.addEventListener('click', copySessionCode);
    
    // Share buttons
    document.getElementById('shareWhatsApp')?.addEventListener('click', () => shareVia('whatsapp'));
    document.getElementById('shareTwitter')?.addEventListener('click', () => shareVia('twitter'));
    document.getElementById('shareFacebook')?.addEventListener('click', () => shareVia('facebook'));
    document.getElementById('shareEmail')?.addEventListener('click', () => shareVia('email'));
    document.getElementById('shareCopyLink')?.addEventListener('click', copyShareLink);

    // Chat toggle
    document.getElementById('chatToggleBtn')?.addEventListener('click', toggleChatSidebar);
    document.getElementById('closeChatBtn')?.addEventListener('click', toggleChatSidebar);
    DOM.chatOverlay?.addEventListener('click', toggleChatSidebar);

    // Participants
    document.getElementById('participantsBtn')?.addEventListener('click', () => {
        DOM.participantsModal.classList.add('active');
        loadParticipants();
    });
    document.getElementById('closeParticipantsModal')?.addEventListener('click', () => {
        DOM.participantsModal.classList.remove('active');
    });

    // Tip modal
    document.getElementById('closeTipModal')?.addEventListener('click', () => {
        DOM.tipModal.classList.remove('active');
    });
    document.querySelectorAll('.tip-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = parseInt(btn.dataset.amount);
            const currency = btn.dataset.currency || 'gp';
            sendTip(amount, currency);
        });
    });
    document.getElementById('sendCustomTip')?.addEventListener('click', () => {
        const amount = parseInt(document.getElementById('customTipAmount').value);
        const currency = document.getElementById('tipCurrency').value;
        if (!amount || amount < 1) {
            showToast('Enter a valid amount', 'warning');
            return;
        }
        sendTip(amount, currency);
    });

    // Star modal
    document.getElementById('closeStarModal')?.addEventListener('click', () => {
        DOM.starModal.classList.remove('active');
    });
    document.getElementById('submitStars')?.addEventListener('click', submitRating);

    // Share modal
    document.getElementById('closeShareModal')?.addEventListener('click', () => {
        DOM.shareModal.classList.remove('active');
    });

    // Whiteboard
    document.getElementById('closeWhiteboard')?.addEventListener('click', toggleWhiteboard);
    document.querySelectorAll('.wb-tool').forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.dataset.tool;
            if (tool) setWbTool(tool);
        });
    });
    document.querySelector('.wb-color')?.addEventListener('change', (e) => {
        setWbColor(e.target.value);
    });

    // Return to dashboard
    document.getElementById('returnBtn')?.addEventListener('click', () => {
        window.location.href = '/user';
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (DOM.tipModal.classList.contains('active')) DOM.tipModal.classList.remove('active');
            if (DOM.starModal.classList.contains('active')) DOM.starModal.classList.remove('active');
            if (DOM.shareModal.classList.contains('active')) DOM.shareModal.classList.remove('active');
            if (DOM.whiteboardOverlay.classList.contains('active')) toggleWhiteboard();
            if (DOM.chatSidebar.classList.contains('open')) toggleChatSidebar();
            if (DOM.participantsModal.classList.contains('active')) DOM.participantsModal.classList.remove('active');
        }
        if (e.key === 'm' && e.ctrlKey) {
            e.preventDefault();
            toggleMicrophone();
        }
        if (e.key === 'v' && e.ctrlKey) {
            e.preventDefault();
            toggleCamera();
        }
        if (e.key === 'c' && e.ctrlKey && e.shiftKey) {
            e.preventDefault();
            toggleChatSidebar();
        }
    });

    // Click outside modals to close
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

function toggleChatSidebar() {
    DOM.chatSidebar.classList.toggle('open');
    DOM.chatOverlay.classList.toggle('active');
    
    if (DOM.chatSidebar.classList.contains('open')) {
        state.unreadCount = 0;
        updateUnreadBadge();
        // Focus chat input in iframe
        sendToChatIframe({ type: 'focus_input' });
    }
}

function startTimer() {
    state.classStartTime = Date.now();
    state.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.classStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        DOM.classTimer.textContent = `${mins}:${secs}`;
    }, 1000);
}

function showLoading(show) {
    DOM.loadingOverlay.style.display = show ? 'flex' : 'none';
}

// ============================================
// SHARE FUNCTIONS
// ============================================

async function shareToChat() {
    if (!state.sessionCode) {
        showToast('No session code to share', 'warning');
        return;
    }

    const message = `🎥 Join my live session! Use code: **${state.sessionCode}**\n\nClick here: ${window.location.origin}/virtualroom.html?code=${state.sessionCode}`;

    sendToChatIframe({
        type: 'send_message',
        message: message
    });

    showToast('📤 Session code sent to chat!', 'success');
    DOM.shareModal.classList.remove('active');
}

async function copySessionCode() {
    if (!state.sessionCode) return;
    try {
        await navigator.clipboard.writeText(state.sessionCode);
        showToast('📋 Session code copied!', 'success');
    } catch (e) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = state.sessionCode;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('📋 Session code copied!', 'success');
    }
}

function shareVia(platform) {
    const url = `${window.location.origin}/virtualroom.html?code=${state.sessionCode}`;
    const text = `🎥 Join my live session on Gliimu! Use code: ${state.sessionCode}`;
    let shareUrl = '';

    switch (platform) {
        case 'whatsapp':
            shareUrl = `https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`;
            break;
        case 'twitter':
            shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
            break;
        case 'facebook':
            shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`;
            break;
        case 'email':
            shareUrl = `mailto:?subject=Join my live session!&body=${encodeURIComponent(text + '\n\n' + url)}`;
            break;
    }

    if (shareUrl) {
        window.open(shareUrl, '_blank', 'width=600,height=500');
    }
}

async function copyShareLink() {
    const url = `${window.location.origin}/virtualroom.html?code=${state.sessionCode}`;
    try {
        await navigator.clipboard.writeText(url);
        showToast('📋 Link copied!', 'success');
    } catch (e) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('📋 Link copied!', 'success');
    }
}

// ============================================
// PARTICIPANTS MODAL
// ============================================

function renderParticipantsModal() {
    if (!DOM.participantsModalList) return;

    const participants = Array.from(state.participants.values());
    
    if (participants.length === 0) {
        DOM.participantsModalList.innerHTML = `
            <div class="empty-state-text">No participants</div>
        `;
        return;
    }

    DOM.participantsModalList.innerHTML = participants.map(p => {
        const isHost = p.role === 'host';
        const isMuted = p.is_muted || false;
        const isVideoOff = p.is_video_off || false;
        const handRaised = p.hand_raised || false;
        const isCurrentUser = p.user_id === state.currentUser.id;

        return `
            <div class="participant-modal-item">
                <div class="avatar">${p.name?.[0] || 'U'}</div>
                <div class="info">
                    <div class="name">${p.name || 'User'} ${isCurrentUser ? '(You)' : ''}</div>
                    <div class="role">${isHost ? '👑 Host' : 'Viewer'}</div>
                </div>
                <div class="status">
                    ${handRaised ? '🙋' : ''}
                    ${isMuted ? '🔇' : ''}
                    ${isVideoOff ? '📹❌' : ''}
                    ${isHost ? '👑' : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// FALLBACK MODE
// ============================================

function useFallbackMode() {
    showLoading(false);
    sendToChatIframe({
        type: 'system_message',
        message: '⚠️ Connected in chat-only mode. Video may be limited.'
    });
    DOM.hostPlaceholder.style.display = 'flex';
    DOM.hostPlaceholder.querySelector('span').textContent = 'Host connection limited';
}

// ============================================
// SHOW LOGIN SCREEN
// ============================================

function showLoginScreen() {
    document.querySelector('.virtual-room').innerHTML = `
        <div class="access-denied" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;padding:40px;background:var(--bg-primary);">
            <i class="fas fa-sign-in-alt" style="font-size:64px;color:var(--danger);margin-bottom:20px;"></i>
            <h2 style="margin-bottom:8px;">Sign In Required</h2>
            <p style="color:var(--text-secondary);margin-bottom:24px;">Please sign in to access the virtual room.</p>
            <button onclick="window.location.href='/signin.html'" class="primary-btn">Sign In</button>
        </div>
    `;
}

// ============================================
// SHOW SESSION SELECTION
// ============================================

function showSessionSelection() {
    DOM.loadingText.textContent = 'Start or Join a Session';
    DOM.loadingSubText.textContent = 'Create your own session or join with a code';
    DOM.loadingOverlay.querySelector('.loading-spinner').style.display = 'none';

    const container = DOM.loadingOverlay;
    container.innerHTML += `
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px;width:100%;max-width:320px;">
            <button onclick="window.location.href='?mode=host'" class="primary-btn" style="width:100%;">
                <i class="fas fa-video"></i> Go Live
            </button>
            <div style="display:flex;gap:8px;width:100%;">
                <input type="text" id="sessionCodeInput" placeholder="Enter session code" 
                       style="flex:1;padding:10px 14px;border-radius:12px;border:2px solid var(--border-color);
                              background:var(--bg-input);color:var(--text-primary);font-family:inherit;">
                <button onclick="joinWithCode()" class="primary-btn" style="flex-shrink:0;">
                    <i class="fas fa-sign-in-alt"></i> Join
                </button>
            </div>
        </div>
    `;

    window.joinWithCode = () => {
        const code = document.getElementById('sessionCodeInput').value.trim();
        if (code) {
            window.location.href = `?code=${code}`;
        } else {
            showToast('Enter a session code', 'warning');
        }
    };
}

// ============================================
// CLEANUP
// ============================================

function cleanup() {
    if (state.localStream) {
        state.localStream.getTracks().forEach(t => t.stop());
    }
    if (state.screenStream) {
        state.screenStream.getTracks().forEach(t => t.stop());
    }
    if (state.peer) {
        state.peer.destroy();
    }
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
    }
    if (state.participantsSubscription) {
        state.participantsSubscription.unsubscribe();
    }
    if (state.sessionSubscription) {
        state.sessionSubscription.unsubscribe();
    }
}

function leaveRoom() {
    if (!confirm('Are you sure you want to leave?')) return;

    cleanup();

    // Mark participant as inactive
    if (state.sessionId) {
        supabase
            .from('session_participants')
            .update({ is_active: false, left_at: new Date().toISOString() })
            .eq('session_id', state.sessionId)
            .eq('user_id', state.currentUser.id)
            .then(() => {});
    }

    window.location.href = '/user';
}

// ============================================
// EXPOSE GLOBALS
// ============================================

window.toggleChatSidebar = toggleChatSidebar;
window.toggleWhiteboard = toggleWhiteboard;
window.setWbTool = setWbTool;
window.setWbColor = setWbColor;
window.leaveRoom = leaveRoom;
window.switchViewer = switchViewer;
window.toggleViewerMute = toggleViewerMute;
window.joinWithCode = window.joinWithCode;
window.shareToChat = shareToChat;
window.copySessionCode = copySessionCode;

console.log('🎥 Virtual Room loaded successfully');
