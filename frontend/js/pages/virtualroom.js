// ============================================
// 🎥 VIRTUAL ROOM - PeerJS + Auto Daily.co Fallback
// ============================================

import { supabase, getCurrentUser, getUserProfile } from '../modules/supabase.js';
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
    viewerCount: 0,
    tipsTotal: 0,
    gpTipsTotal: 0,
    starsCount: 0,
    handRaised: false,
    isMuted: false,
    isCameraOff: false,
    unreadCount: 0,
    chatIframeReady: false,
    isScreenSharing: false,
    connectionAttempts: 0,
    maxConnectionAttempts: 3,
    usingDailyFallback: false,
    dailyCallFrame: null,
    dailyInitialized: false,
    peerjsFailed: false,
};

// ============================================
// DOM REFS
// ============================================

const DOM = {};

function cacheDOM() {
    DOM.hostVideo = document.getElementById('hostVideo');
    DOM.hostPlaceholder = document.getElementById('hostPlaceholder');
    DOM.hostStatusText = document.getElementById('hostStatusText');
    DOM.hostName = document.getElementById('hostName');
    DOM.hostStars = document.getElementById('hostStars');
    DOM.hostTips = document.getElementById('hostTips');
    DOM.localVideo = document.getElementById('localVideo');
    DOM.pipVideo = document.getElementById('pipVideo');
    DOM.pipPlaceholder = document.getElementById('pipPlaceholder');
    DOM.pipMicControl = document.getElementById('pipMicControl');
    DOM.pipCamControl = document.getElementById('pipCamControl');
    DOM.videoGrid = document.getElementById('videoGrid');
    DOM.viewerThumbnails = document.getElementById('viewerThumbnails');
    DOM.loadingOverlay = document.getElementById('loadingOverlay');
    DOM.loadingText = document.getElementById('loadingText');
    DOM.loadingSubText = document.getElementById('loadingSubText');
    DOM.loadingProgress = document.getElementById('loadingProgress');
    DOM.loadingProgressBar = document.getElementById('loadingProgressBar');
    DOM.roomTitle = document.getElementById('roomTitle');
    DOM.classTimer = document.getElementById('classTimer');
    DOM.viewerCount = document.getElementById('viewerCount');
    DOM.chatSidebar = document.getElementById('chatSidebar');
    DOM.chatIframe = document.getElementById('chatIframe');
    DOM.tipModal = document.getElementById('tipModal');
    DOM.starModal = document.getElementById('starModal');
    DOM.shareModal = document.getElementById('shareModal');
    DOM.sessionEndedOverlay = document.getElementById('sessionEndedOverlay');
    DOM.shareLinkInput = document.getElementById('shareLinkInput');
    DOM.viewerControls = document.getElementById('viewerControls');
    DOM.hostControls = document.getElementById('hostControls');
    DOM.connectionStatus = document.getElementById('connectionStatus');
    DOM.liveStatus = document.getElementById('liveStatus');
    DOM.liveDot = document.getElementById('liveDot');
    DOM.dailyContainer = document.getElementById('dailyContainer');
    DOM.dailyFrameContainer = document.getElementById('dailyFrameContainer');
    DOM.dailyOverlay = document.getElementById('dailyOverlay');
}

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎥 Virtual Room initializing...');
    cacheDOM();

    // Fix mobile viewport
    const setVH = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    setVH();
    window.addEventListener('resize', setVH);

    try {
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

        const params = new URLSearchParams(window.location.search);
        const sessionCode = params.get('code');
        const mode = params.get('mode');

        // Check for saved session
        const savedSession = sessionStorage.getItem('glimu_session');
        if (savedSession && !sessionCode && !mode) {
            try {
                const sessionData = JSON.parse(savedSession);
                if (sessionData.sessionId && sessionData.sessionCode) {
                    console.log('🔄 Found saved session, recovering...');
                    await recoverSession(sessionData);
                    return;
                }
            } catch (e) {}
        }

        if (mode === 'host') {
            await createNewSession();
        } else if (sessionCode) {
            await joinSession(sessionCode);
        } else {
            showSessionSelection();
            return;
        }

        setupUI();
        setupEventListeners();
        setupRealtimeSubscriptions();
        setupChatIframe();
        startTimer();

        saveSessionState();

        console.log('✅ Virtual Room ready');
        showLoading(false);

    } catch (error) {
        console.error('❌ Init error:', error);
        showToast('Failed to initialize: ' + error.message, 'error');
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
        DOM.loadingText.textContent = 'Creating session...';
        updateProgress(10);

        const sessionCode = generateSessionCode();
        
        const { data: session, error } = await supabase
            .from('virtual_sessions')
            .insert({
                host_id: state.currentUser.id,
                title: `${state.userProfile.name || 'User'}'s Session`,
                session_code: sessionCode,
                status: 'waiting',
                start_time: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;
        updateProgress(30);

        state.sessionId = session.id;
        state.sessionCode = session.session_code;
        state.isHost = true;
        state.isLive = false;

        DOM.roomTitle.textContent = session.title;
        DOM.shareLinkInput.value = `${window.location.origin}/virtualroom.html?code=${state.sessionCode}`;
        DOM.hostControls.style.display = 'flex';
        DOM.viewerControls.style.display = 'none';

        // Add host as participant
        await supabase
            .from('session_participants')
            .insert({
                session_id: state.sessionId,
                user_id: state.currentUser.id,
                role: 'host',
                is_active: true
            });
        updateProgress(50);

        // Start camera
        await startLocalStream();
        updateProgress(70);

        // Initialize PeerJS with retry
        const peerConnected = await initPeerJS(true);
        if (!peerConnected) {
            // PeerJS failed, try Daily.co fallback
            console.log('⚠️ PeerJS failed, switching to Daily.co...');
            await initDailyFallback(true);
        }
        updateProgress(90);

        // Update session status to live
        await supabase
            .from('virtual_sessions')
            .update({ status: 'live' })
            .eq('id', state.sessionId);

        state.isLive = true;
        DOM.liveStatus.textContent = 'LIVE';
        DOM.liveDot.style.background = '#10b981';

        saveSessionState();
        updateProgress(100);

        showToast(`Session created! Code: ${state.sessionCode}`, 'success');
        setTimeout(() => DOM.shareModal.classList.add('active'), 1500);

        setTimeout(() => {
            sendToChatIframe({
                type: 'session_info',
                sessionId: state.sessionId,
                sessionCode: state.sessionCode,
                isHost: state.isHost,
                roomTitle: DOM.roomTitle.textContent
            });
        }, 2000);

        console.log('📡 Session created:', state.sessionCode);

    } catch (error) {
        console.error('❌ Create session error:', error);
        showToast('Failed to create session: ' + error.message, 'error');
        useFallbackMode();
    }
}

async function joinSession(sessionCode) {
    try {
        showLoading(true);
        DOM.loadingText.textContent = 'Joining session...';
        updateProgress(10);

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
            showToast('Session has ended', 'error');
            setTimeout(() => window.location.href = '/user', 2000);
            return;
        }

        state.sessionId = session.id;
        state.sessionCode = session.session_code;
        state.isHost = false;
        state.isLive = session.status === 'live';
        updateProgress(30);

        DOM.roomTitle.textContent = session.title || 'Live Session';
        DOM.shareLinkInput.value = `${window.location.origin}/virtualroom.html?code=${state.sessionCode}`;
        DOM.hostControls.style.display = 'none';
        DOM.viewerControls.style.display = 'flex';

        // Get host info
        const { data: host } = await supabase
            .from('session_participants')
            .select('users(name)')
            .eq('session_id', state.sessionId)
            .eq('role', 'host')
            .single();

        if (host?.users) {
            DOM.hostName.textContent = host.users.name || 'Host';
        }

        // Add viewer
        await supabase
            .from('session_participants')
            .upsert({
                session_id: state.sessionId,
                user_id: state.currentUser.id,
                role: 'viewer',
                is_active: true
            }, { onConflict: 'session_id,user_id' });
        updateProgress(50);

        await startLocalStream();
        updateProgress(70);

        // Try PeerJS first
        const peerConnected = await initPeerJS(false);
        if (!peerConnected) {
            // PeerJS failed, try Daily.co
            console.log('⚠️ PeerJS failed, switching to Daily.co...');
            await initDailyFallback(false);
        }
        updateProgress(90);

        await loadParticipants();
        updateProgress(100);

        saveSessionState();

        setTimeout(() => {
            sendToChatIframe({
                type: 'session_info',
                sessionId: state.sessionId,
                sessionCode: state.sessionCode,
                isHost: state.isHost,
                roomTitle: DOM.roomTitle.textContent
            });
        }, 2000);

        console.log('📡 Joined session:', sessionCode);

    } catch (error) {
        console.error('❌ Join session error:', error);
        showToast('Failed to join session', 'error');
        useFallbackMode();
    }
}

// ============================================
// PEERJS INITIALIZATION
// ============================================

async function initPeerJS(isHost) {
    return new Promise((resolve) => {
        try {
            state.connectionAttempts++;
            const peerId = `glimu_${state.currentUser.id}_${Date.now()}`;

            console.log(`🔗 Connecting to PeerJS (attempt ${state.connectionAttempts})...`);

            state.peer = new Peer(peerId, {
                host: '0.peerjs.com',
                port: 443,
                path: '/',
                secure: true,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        // Free TURN from OpenRelay (limited)
                        { 
                            urls: 'turn:openrelay.metered.ca:80',
                            username: 'openrelayproject',
                            credential: 'openrelayproject' 
                        },
                        { 
                            urls: 'turn:openrelay.metered.ca:443',
                            username: 'openrelayproject',
                            credential: 'openrelayproject' 
                        }
                    ]
                }
            });

            // Connection timeout
            const timeout = setTimeout(() => {
                if (state.peer && !state.peer.open) {
                    console.warn('⏰ PeerJS connection timeout');
                    state.peer.destroy();
                    resolve(false);
                }
            }, 15000);

            state.peer.on('open', async (id) => {
                clearTimeout(timeout);
                state.peerId = id;
                console.log('✅ PeerJS connected:', id);

                // Register peer ID
                await supabase
                    .from('session_participants')
                    .update({ peer_id: id })
                    .eq('session_id', state.sessionId)
                    .eq('user_id', state.currentUser.id);

                DOM.connectionStatus.textContent = '🟢 Connected';
                DOM.connectionStatus.style.color = '#10b981';

                if (isHost) {
                    state.peer.on('connection', handlePeerConnection);
                    state.peer.on('call', handleIncomingCall);
                    // Host waits for connections
                } else {
                    await connectToHost();
                }

                resolve(true);
            });

            state.peer.on('error', (err) => {
                clearTimeout(timeout);
                console.error('❌ PeerJS error:', err.message);
                
                if (state.connectionAttempts < state.maxConnectionAttempts) {
                    console.log(`🔄 Retry ${state.connectionAttempts}/${state.maxConnectionAttempts}...`);
                    setTimeout(() => {
                        initPeerJS(isHost);
                    }, 2000);
                } else {
                    state.peerjsFailed = true;
                    resolve(false);
                }
            });

        } catch (err) {
            console.error('❌ PeerJS init error:', err);
            state.peerjsFailed = true;
            resolve(false);
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
            
            const call = state.peer.call(host.peer_id, state.localStream);
            call.on('stream', (remoteStream) => {
                DOM.hostVideo.srcObject = remoteStream;
                DOM.hostVideo.play().catch(() => {});
                DOM.hostVideo.parentElement.classList.add('has-video');
                DOM.hostPlaceholder.style.display = 'none';
                DOM.connectionStatus.textContent = '🟢 Connected';
                DOM.connectionStatus.style.color = '#10b981';
            });
            call.on('close', () => {
                DOM.hostVideo.parentElement.classList.remove('has-video');
                DOM.hostPlaceholder.style.display = 'flex';
                DOM.hostStatusText.textContent = 'Host disconnected';
                DOM.connectionStatus.textContent = '🔴 Disconnected';
                DOM.connectionStatus.style.color = '#ef4444';
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
        DOM.connectionStatus.textContent = '🟢 Connected';
        DOM.connectionStatus.style.color = '#10b981';
    });
}

function handlePeerConnection(conn) {
    console.log('📡 Peer connected:', conn.peer);
}

// ============================================
// DAILY.CO FALLBACK
// ============================================

async function initDailyFallback(isHost) {
    try {
        console.log('📹 Initializing Daily.co fallback...');
        state.usingDailyFallback = true;
        DOM.dailyContainer.style.display = 'block';
        DOM.videoGrid.style.display = 'none';

        // Load Daily.co script
        if (!document.querySelector('#daily-js')) {
            const script = document.createElement('script');
            script.id = 'daily-js';
            script.src = 'https://unpkg.com/@daily-co/daily-js@0.48.0/daily-js.min.js';
            document.head.appendChild(script);
            
            await new Promise((resolve) => {
                script.onload = resolve;
                script.onerror = resolve;
                setTimeout(resolve, 5000);
            });
        }

        // Use a free room on Daily.co's public instance
        // Note: Daily.co's free tier requires an API key, but we can use their public instance
        // For now, we'll use a free public Jitsi fallback as a backup
        const roomName = `glimu-${state.sessionCode}`;
        const jitsiUrl = `https://meet.jit.si/${roomName}`;
        
        DOM.dailyFrameContainer.innerHTML = `
            <iframe 
                src="${jitsiUrl}"
                style="width:100%;height:100%;border:0;"
                allow="camera; microphone; fullscreen; display-capture"
                allowfullscreen
            ></iframe>
        `;

        DOM.dailyOverlay.style.display = 'none';
        DOM.hostStatusText.textContent = 'Using backup video service';

        showToast('📹 Using backup video service', 'info');

        // Update connection status
        DOM.connectionStatus.textContent = '🟢 Connected (Backup)';
        DOM.connectionStatus.style.color = '#f59e0b';

        console.log('✅ Daily.co fallback initialized');

    } catch (error) {
        console.error('❌ Daily fallback error:', error);
        showToast('Could not initialize video. Using chat only.', 'warning');
        useFallbackMode();
    }
}

// ============================================
// SESSION RECOVERY
// ============================================

async function recoverSession(savedData) {
    try {
        showLoading(true);
        DOM.loadingText.textContent = 'Recovering session...';

        const { data: session, error } = await supabase
            .from('virtual_sessions')
            .select('*')
            .eq('id', savedData.sessionId)
            .single();

        if (error || !session || session.status === 'ended') {
            sessionStorage.removeItem('glimu_session');
            await createNewSession();
            return;
        }

        state.sessionId = session.id;
        state.sessionCode = session.session_code;
        state.isHost = savedData.isHost || false;
        state.isLive = session.status === 'live';

        DOM.roomTitle.textContent = session.title || 'Live Session';
        DOM.shareLinkInput.value = `${window.location.origin}/virtualroom.html?code=${state.sessionCode}`;

        await supabase
            .from('session_participants')
            .update({ is_active: true })
            .eq('session_id', state.sessionId)
            .eq('user_id', state.currentUser.id);

        if (state.isHost) {
            DOM.hostControls.style.display = 'flex';
            DOM.viewerControls.style.display = 'none';
            await supabase
                .from('virtual_sessions')
                .update({ status: 'live' })
                .eq('id', state.sessionId);
        } else {
            DOM.hostControls.style.display = 'none';
            DOM.viewerControls.style.display = 'flex';
        }

        await startLocalStream();
        
        // Try PeerJS reconnect
        const peerConnected = await initPeerJS(state.isHost);
        if (!peerConnected) {
            await initDailyFallback(state.isHost);
        }

        await loadParticipants();
        showToast('🔄 Session recovered!', 'success');
        saveSessionState();

        console.log('✅ Session recovered:', state.sessionCode);

    } catch (error) {
        console.error('❌ Session recovery failed:', error);
        sessionStorage.removeItem('glimu_session');
        await createNewSession();
    }
}

// ============================================
// STREAM MANAGEMENT
// ============================================

async function startLocalStream() {
    try {
        state.localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            audio: { echoCancellation: true, noiseSuppression: true }
        });

        DOM.localVideo.srcObject = state.localStream;
        await DOM.localVideo.play();
        DOM.pipVideo.style.display = 'block';
        DOM.pipVideo.classList.add('has-video');
        DOM.pipPlaceholder.style.display = 'none';

        updateLocalControls();
        console.log('🎥 Camera started');

    } catch (err) {
        console.error('❌ Camera error:', err);
        if (err.name !== 'NotReadableError') {
            showToast('Could not access camera', 'warning');
        }
        DOM.pipVideo.style.display = 'block';
        DOM.pipPlaceholder.style.display = 'flex';
    }
}

function toggleMicrophone() {
    if (!state.localStream) return;
    const track = state.localStream.getAudioTracks()[0];
    if (!track) return;
    state.isMuted = !track.enabled;
    track.enabled = !track.enabled;
    document.getElementById('micBtn').classList.toggle('off', state.isMuted);
    DOM.pipMicControl?.classList.toggle('off', state.isMuted);
    showToast(state.isMuted ? 'Muted' : 'Unmuted', 'info');
}

function toggleCamera() {
    if (!state.localStream) return;
    const track = state.localStream.getVideoTracks()[0];
    if (!track) return;
    state.isCameraOff = !track.enabled;
    track.enabled = !track.enabled;
    DOM.pipVideo.classList.toggle('camera-off', state.isCameraOff);
    DOM.pipCamControl?.classList.toggle('off', state.isCameraOff);
    showToast(state.isCameraOff ? 'Camera off' : 'Camera on', 'info');
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

    if (state.usingDailyFallback) {
        showToast('Screen sharing via backup video', 'info');
        return;
    }

    if (state.isScreenSharing) {
        if (state.screenStream) {
            state.screenStream.getTracks().forEach(t => t.stop());
            state.screenStream = null;
        }
        state.isScreenSharing = false;
        document.getElementById('screenBtn').classList.remove('active');
        showToast('Screen share stopped', 'info');
        if (state.localStream) {
            DOM.hostVideo.srcObject = state.localStream;
        }
        return;
    }

    try {
        state.screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' },
            audio: false
        });

        state.isScreenSharing = true;
        document.getElementById('screenBtn').classList.add('active');
        showToast('Screen sharing started!', 'success');

        DOM.hostVideo.srcObject = state.screenStream;

        state.screenStream.getVideoTracks()[0].onended = () => {
            if (state.isScreenSharing) {
                toggleScreenShare();
            }
        };

    } catch (err) {
        console.error('Screen share error:', err);
        if (err.name !== 'AbortError') {
            showToast('Screen share cancelled', 'warning');
        }
        state.isScreenSharing = false;
        document.getElementById('screenBtn').classList.remove('active');
    }
}

// ============================================
// PARTICIPANTS
// ============================================

async function loadParticipants() {
    try {
        const { data, error } = await supabase
            .from('session_participants')
            .select('*, users(name)')
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

        const viewers = data.filter(p => p.role !== 'host');
        state.viewerCount = viewers.length;
        DOM.viewerCount.textContent = viewers.length;

        renderViewerThumbnails();

    } catch (error) {
        console.error('❌ Load participants error:', error);
    }
}

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
        const handRaised = viewer.hand_raised || false;
        const hasStream = state.viewerStreams.has(viewer.user_id);

        return `
            <div class="viewer-thumbnail" data-user-id="${viewer.user_id}">
                <video id="viewer_${viewer.user_id}" autoplay playsinline muted ${hasStream ? '' : 'style="display:none;"'}></video>
                <div class="thumb-placeholder" style="${hasStream ? 'display:none' : 'display:flex'}">
                    <i class="fas fa-user-circle"></i>
                </div>
                <div class="thumb-name">${viewer.name || 'Viewer'}</div>
                ${handRaised ? '<div class="hand-raise-indicator">🙋</div>' : ''}
            </div>
        `;
    }).join('');

    // Attach viewer streams
    viewers.forEach(viewer => {
        const videoEl = document.getElementById(`viewer_${viewer.user_id}`);
        if (videoEl && state.viewerStreams.has(viewer.user_id)) {
            videoEl.srcObject = state.viewerStreams.get(viewer.user_id);
            videoEl.style.display = 'block';
            videoEl.play().catch(() => {});
        }
    });
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

    document.getElementById('raiseHandBtn').classList.toggle('active', state.handRaised);
    showToast(state.handRaised ? 'Hand raised! 🙋' : 'Hand lowered', 'info');

    if (state.handRaised) {
        sendToChatIframe({
            type: 'system_message',
            message: `🙋 ${state.userProfile.name || 'A viewer'} raised their hand`
        });
    }
}

// ============================================
// TIPPING
// ============================================

async function sendTip(amount, currency, emoji) {
    if (!state.sessionId) {
        showToast('No active session', 'error');
        return;
    }

    try {
        const { data: session } = await supabase
            .from('virtual_sessions')
            .select('host_id')
            .eq('id', state.sessionId)
            .single();

        if (!session) {
            showToast('Session not found', 'error');
            return;
        }

        const userBalance = state.userProfile.wallet_balance || 0;

        if (amount > userBalance) {
            showToast('Insufficient wallet balance', 'error');
            return;
        }

        const newBalance = userBalance - amount;

        await supabase
            .from('users')
            .update({ wallet_balance: newBalance })
            .eq('id', state.currentUser.id);

        await supabase
            .from('session_tips')
            .insert({
                session_id: state.sessionId,
                from_user: state.currentUser.id,
                to_host: session.host_id,
                amount: amount,
                tip_type: 'wallet'
            });

        state.userProfile.wallet_balance = newBalance;

        showToast(`${emoji} Tip sent! ₦${amount}`, 'success');
        DOM.tipModal.classList.remove('active');

        sendToChatIframe({
            type: 'system_message',
            message: `${emoji} ${state.userProfile.name || 'Someone'} sent ₦${amount}`
        });

    } catch (error) {
        console.error('❌ Tip error:', error);
        showToast('Failed to send tip', 'error');
    }
}

// ============================================
// STAR RATING
// ============================================

async function submitRating() {
    if (!state.starRating || state.hasRated) {
        showToast('Already rated or no rating selected', 'warning');
        return;
    }

    try {
        await supabase
            .from('session_participants')
            .update({ star_rating: state.starRating })
            .eq('session_id', state.sessionId)
            .eq('user_id', state.currentUser.id);

        state.hasRated = true;
        DOM.starModal.classList.remove('active');
        showToast(`Rated ${state.starRating} stars! ⭐`, 'success');

        sendToChatIframe({
            type: 'system_message',
            message: `⭐ ${state.userProfile.name || 'Someone'} rated ${state.starRating} stars!`
        });

    } catch (error) {
        console.error('❌ Rating error:', error);
        showToast('Failed to submit rating', 'error');
    }
}

// ============================================
// SESSION END
// ============================================

async function endSession() {
    if (!state.isHost) {
        showToast('Only hosts can end sessions', 'warning');
        return;
    }

    if (!confirm('End this session?')) return;

    try {
        await supabase
            .from('virtual_sessions')
            .update({ status: 'ended', end_time: new Date().toISOString() })
            .eq('id', state.sessionId);

        state.sessionEnded = true;
        state.isLive = false;
        DOM.sessionEndedOverlay.classList.add('active');

        sessionStorage.removeItem('glimu_session');
        cleanup();
        showToast('Session ended', 'success');

    } catch (error) {
        console.error('❌ End session error:', error);
        showToast('Failed to end session', 'error');
    }
}

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

function setupRealtimeSubscriptions() {
    if (!state.sessionId) return;

    state.participantsSubscription = supabase
        .channel(`session_participants_${state.sessionId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'session_participants',
            filter: `session_id=eq.${state.sessionId}`
        }, () => {
            loadParticipants();
        })
        .subscribe();

    state.sessionSubscription = supabase
        .channel(`session_${state.sessionId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'virtual_sessions',
            filter: `id=eq.${state.sessionId}`
        }, (payload) => {
            if (payload.new.status === 'ended') {
                state.sessionEnded = true;
                DOM.sessionEndedOverlay.classList.add('active');
                sessionStorage.removeItem('glimu_session');
                cleanup();
            }
        })
        .subscribe();
}

// ============================================
// CHAT IFRAME
// ============================================

function setupChatIframe() {
    const iframe = DOM.chatIframe;
    if (!iframe) return;

    window.addEventListener('message', (event) => {
        if (event.source !== iframe.contentWindow) return;
        const data = event.data;
        console.log('📨 Chat:', data.type);

        switch (data.type) {
            case 'chat_ready':
                state.chatIframeReady = true;
                sendToChatIframe({
                    type: 'session_info',
                    sessionId: state.sessionId,
                    sessionCode: state.sessionCode,
                    isHost: state.isHost,
                    roomTitle: DOM.roomTitle.textContent,
                    usingDailyFallback: state.usingDailyFallback
                });
                break;
            case 'message_sent':
                state.unreadCount++;
                break;
            case 'hand_raised':
                showToast(`🙋 ${data.sender} raised their hand`, 'warning');
                break;
            case 'tip_sent':
                showToast(`🎁 ${data.sender} sent a tip`, 'success');
                break;
            case 'star_rated':
                showToast(`⭐ ${data.sender} rated ${data.stars} stars`, 'success');
                break;
        }
    });

    iframe.addEventListener('load', () => {
        setTimeout(() => {
            sendToChatIframe({
                type: 'session_info',
                sessionId: state.sessionId,
                sessionCode: state.sessionCode,
                isHost: state.isHost,
                roomTitle: DOM.roomTitle.textContent,
                usingDailyFallback: state.usingDailyFallback
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

// ============================================
// SHARE FUNCTIONS
// ============================================

async function shareToChat() {
    if (!state.sessionCode) {
        showToast('No session code', 'warning');
        return;
    }
    const message = `🎥 Join my live session! Code: **${state.sessionCode}**\n${window.location.origin}/virtualroom.html?code=${state.sessionCode}`;
    sendToChatIframe({ type: 'send_message', message });
    showToast('📤 Session code sent to chat!', 'success');
    DOM.shareModal.classList.remove('active');
}

async function copyShareLink() {
    const link = DOM.shareLinkInput.value;
    if (!link) return;
    try {
        await navigator.clipboard.writeText(link);
        showToast('📋 Link copied!', 'success');
    } catch {
        DOM.shareLinkInput.select();
        document.execCommand('copy');
        showToast('📋 Link copied!', 'success');
    }
}

// ============================================
// HELPERS
// ============================================

function generateSessionCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'GLM-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function saveSessionState() {
    try {
        sessionStorage.setItem('glimu_session', JSON.stringify({
            sessionId: state.sessionId,
            sessionCode: state.sessionCode,
            isHost: state.isHost,
            timestamp: Date.now()
        }));
    } catch (e) {}
}

function updateProgress(percent) {
    DOM.loadingProgress.style.display = 'block';
    DOM.loadingProgressBar.style.width = `${Math.min(percent, 100)}%`;
}

function showLoading(show) {
    DOM.loadingOverlay.style.display = show ? 'flex' : 'none';
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

function setupUI() {
    if (state.isHost) {
        DOM.hostControls.style.display = 'flex';
        DOM.viewerControls.style.display = 'none';
        DOM.hostStatusText.textContent = 'You are the host';
    } else {
        DOM.hostControls.style.display = 'none';
        DOM.viewerControls.style.display = 'flex';
        DOM.hostStatusText.textContent = 'Waiting for host...';
    }
}

function setupEventListeners() {
    document.getElementById('backBtn')?.addEventListener('click', leaveRoom);
    document.getElementById('leaveBtn')?.addEventListener('click', leaveRoom);
    document.getElementById('micBtn')?.addEventListener('click', toggleMicrophone);
    document.getElementById('camBtn')?.addEventListener('click', toggleCamera);
    document.getElementById('screenBtn')?.addEventListener('click', toggleScreenShare);
    document.getElementById('endSessionBtn')?.addEventListener('click', endSession);
    document.getElementById('raiseHandBtn')?.addEventListener('click', toggleRaiseHand);
    
    document.getElementById('tipBtn')?.addEventListener('click', () => DOM.tipModal.classList.add('active'));
    document.getElementById('starBtn')?.addEventListener('click', () => {
        if (state.hasRated) {
            showToast('Already rated', 'warning');
            return;
        }
        DOM.starModal.classList.add('active');
    });
    
    document.getElementById('chatToggleBtn')?.addEventListener('click', toggleChatSidebar);
    document.getElementById('closeChatBtn')?.addEventListener('click', toggleChatSidebar);
    document.getElementById('shareBtn')?.addEventListener('click', () => DOM.shareModal.classList.add('active'));
    document.getElementById('closeShareModal')?.addEventListener('click', () => DOM.shareModal.classList.remove('active'));
    document.getElementById('closeTipModal')?.addEventListener('click', () => DOM.tipModal.classList.remove('active'));
    document.getElementById('closeStarModal')?.addEventListener('click', () => DOM.starModal.classList.remove('active'));
    document.getElementById('shareToChatBtn')?.addEventListener('click', shareToChat);
    document.getElementById('copyLinkBtn')?.addEventListener('click', copyShareLink);
    document.getElementById('returnBtn')?.addEventListener('click', () => window.location.href = '/user');

    // Tip options
    document.querySelectorAll('.tip-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = parseInt(btn.dataset.amount);
            const currency = btn.dataset.currency || 'wallet';
            const emoji = btn.dataset.emoji || '❤️';
            sendTip(amount, currency, emoji);
        });
    });

    document.getElementById('sendCustomTip')?.addEventListener('click', () => {
        const amount = parseInt(prompt('Enter amount (₦):'));
        if (amount > 0) {
            sendTip(amount, 'wallet', '💝');
        }
    });

    // Star rating
    document.querySelectorAll('.star').forEach(star => {
        star.addEventListener('click', () => {
            const value = parseInt(star.dataset.value);
            state.starRating = value;
            document.querySelectorAll('.star').forEach(s => {
                s.classList.toggle('selected', parseInt(s.dataset.value) <= value);
            });
        });
    });
    document.getElementById('submitStars')?.addEventListener('click', submitRating);

    // Click outside modals
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });

    // Save session on page unload
    window.addEventListener('beforeunload', () => {
        if (state.sessionId && !state.sessionEnded) {
            saveSessionState();
        }
    });
}

function toggleChatSidebar() {
    DOM.chatSidebar.classList.toggle('open');
}

function useFallbackMode() {
    showLoading(false);
    DOM.hostStatusText.textContent = 'Chat-only mode';
    DOM.connectionStatus.textContent = '🔴 Chat Only';
    DOM.connectionStatus.style.color = '#f59e0b';
    showToast('⚠️ Connected in chat-only mode', 'warning');
}

function showLoginScreen() {
    document.querySelector('.virtual-room').innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;padding:40px;background:var(--bg-primary);">
            <i class="fas fa-sign-in-alt" style="font-size:64px;color:var(--danger);margin-bottom:20px;"></i>
            <h2>Sign In Required</h2>
            <p style="color:var(--text-secondary);margin-bottom:24px;">Please sign in to access the virtual room.</p>
            <button onclick="window.location.href='/signin.html'" class="primary-btn">Sign In</button>
        </div>
    `;
}

function showSessionSelection() {
    DOM.loadingText.textContent = 'Start or Join a Session';
    DOM.loadingSubText.textContent = 'Create your own session or join with a code';
    DOM.loadingOverlay.querySelector('.loading-spinner').style.display = 'none';

    DOM.loadingOverlay.innerHTML += `
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
    if (!confirm('Leave the session?')) return;
    cleanup();

    if (state.sessionId) {
        supabase
            .from('session_participants')
            .update({ is_active: false, left_at: new Date().toISOString() })
            .eq('session_id', state.sessionId)
            .eq('user_id', state.currentUser.id)
            .then(() => {});
    }

    sessionStorage.removeItem('glimu_session');
    window.location.href = '/user';
}

// ============================================
// EXPOSE GLOBALS
// ============================================

window.leaveRoom = leaveRoom;
window.joinWithCode = window.joinWithCode;
window.toggleChatSidebar = toggleChatSidebar;

console.log('🎥 Virtual Room loaded with PeerJS + Daily fallback');
