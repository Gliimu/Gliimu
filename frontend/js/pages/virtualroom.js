// ============================================
// 🎥 VIRTUAL ROOM - WITH FIXED SESSION RECOVERY
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
    sessionSubscription: null,
    participantsSubscription: null,
    classStartTime: Date.now(),
    timerInterval: null,
    starRating: 0,
    hasRated: false,
    viewerCount: 0,
    handRaised: false,
    isMuted: false,
    isCameraOff: false,
    unreadCount: 0,
    chatIframeReady: false,
    isScreenSharing: false,
    connectionAttempts: 0,
    maxConnectionAttempts: 3,
    usingDailyFallback: false,
    hostStreamReceived: false,
    reconnectTimeout: null,
    peerIdSaved: false,
    isRecovering: false,
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
    DOM.viewerThumbnails = document.getElementById('viewerThumbnails');
    DOM.loadingOverlay = document.getElementById('loadingOverlay');
    DOM.loadingText = document.getElementById('loadingText');
    DOM.loadingSubText = document.getElementById('loadingSubText');
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
}

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎥 Virtual Room initializing...');
    cacheDOM();

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
        const forceNew = params.get('new') === 'true';

        // Check for saved session - ONLY if not forcing new and no session code in URL
        const savedSession = sessionStorage.getItem('glimu_session');
        
        if (savedSession && !forceNew && !sessionCode && !mode) {
            try {
                const sessionData = JSON.parse(savedSession);
                // Check if session is still valid (not too old - 1 hour max)
                const sessionAge = Date.now() - (sessionData.timestamp || 0);
                const maxAge = 60 * 60 * 1000; // 1 hour
                
                if (sessionData.sessionId && sessionAge < maxAge) {
                    console.log('🔄 Found saved session, attempting recovery...');
                    const recovered = await attemptSessionRecovery(sessionData);
                    if (recovered) {
                        return;
                    }
                }
                // If recovery failed or session is too old, clear it
                console.log('🗑️ Saved session expired or invalid, clearing...');
                clearSavedSession();
            } catch (e) {
                console.warn('Could not parse saved session:', e);
                clearSavedSession();
            }
        }

        // Clear any stale session data
        clearSavedSession();

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
// SESSION RECOVERY - IMPROVED
// ============================================

async function attemptSessionRecovery(savedData) {
    if (state.isRecovering) return false;
    state.isRecovering = true;

    try {
        console.log('🔍 Checking if session can be recovered...');
        
        // Check if session still exists in database
        const { data: session, error } = await supabase
            .from('virtual_sessions')
            .select('*')
            .eq('id', savedData.sessionId)
            .single();

        if (error || !session) {
            console.log('❌ Session not found in database');
            clearSavedSession();
            state.isRecovering = false;
            return false;
        }

        // Don't recover ended sessions
        if (session.status === 'ended') {
            console.log('❌ Session has ended');
            clearSavedSession();
            state.isRecovering = false;
            return false;
        }

        // Check if user is still a participant
        const { data: participant, error: pError } = await supabase
            .from('session_participants')
            .select('*')
            .eq('session_id', savedData.sessionId)
            .eq('user_id', state.currentUser.id)
            .single();

        if (pError || !participant) {
            console.log('❌ User is not a participant in this session');
            clearSavedSession();
            state.isRecovering = false;
            return false;
        }

        console.log('✅ Session valid, recovering...');
        
        // Restore session state
        state.sessionId = session.id;
        state.sessionCode = session.session_code;
        state.isHost = savedData.isHost || false;
        state.isLive = session.status === 'live';

        DOM.roomTitle.textContent = session.title || 'Live Session';
        DOM.shareLinkInput.value = `${window.location.origin}/virtualroom.html?code=${state.sessionCode}`;

        // Re-activate participant
        await supabase
            .from('session_participants')
            .update({ 
                is_active: true,
                last_seen: new Date().toISOString(),
                left_at: null
            })
            .eq('session_id', state.sessionId)
            .eq('user_id', state.currentUser.id);

        if (state.isHost) {
            DOM.hostControls.style.display = 'flex';
            DOM.viewerControls.style.display = 'none';
            // If host, ensure session is live
            await supabase
                .from('virtual_sessions')
                .update({ status: 'live' })
                .eq('id', state.sessionId);
        } else {
            DOM.hostControls.style.display = 'none';
            DOM.viewerControls.style.display = 'flex';
        }

        await startLocalStream();
        
        const peerConnected = await initPeerJS(state.isHost);
        if (!peerConnected) {
            await initDailyFallback(state.isHost);
        }

        await loadParticipants();
        showToast('🔄 Session recovered successfully!', 'success');
        saveSessionState();

        state.isRecovering = false;
        console.log('✅ Session recovered:', state.sessionCode);
        return true;

    } catch (error) {
        console.error('❌ Session recovery failed:', error);
        clearSavedSession();
        state.isRecovering = false;
        return false;
    }
}

function clearSavedSession() {
    try {
        sessionStorage.removeItem('glimu_session');
        console.log('🗑️ Saved session cleared');
    } catch (e) {}
}

// ============================================
// SESSION MANAGEMENT
// ============================================

async function createNewSession() {
    try {
        showLoading(true);
        DOM.loadingText.textContent = 'Creating session...';

        // Clear any old session data
        clearSavedSession();

        const sessionCode = generateSessionCode();
        
        const { data: session, error } = await supabase
            .from('virtual_sessions')
            .insert({
                host_id: state.currentUser.id,
                title: `${state.userProfile.name || 'User'}'s Session`,
                session_code: sessionCode,
                status: 'live',
                start_time: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        state.sessionId = session.id;
        state.sessionCode = session.session_code;
        state.isHost = true;
        state.isLive = true;
        state.sessionEnded = false;

        DOM.roomTitle.textContent = session.title;
        DOM.shareLinkInput.value = `${window.location.origin}/virtualroom.html?code=${state.sessionCode}`;
        DOM.hostControls.style.display = 'flex';
        DOM.viewerControls.style.display = 'none';
        DOM.hostName.textContent = state.userProfile.name || 'Host';
        DOM.hostStatusText.textContent = 'You are the host - waiting for viewers...';
        DOM.sessionEndedOverlay.classList.remove('active');

        // Add host as participant
        await supabase
            .from('session_participants')
            .insert({
                session_id: state.sessionId,
                user_id: state.currentUser.id,
                role: 'host',
                is_active: true,
                peer_id: null,
                last_seen: new Date().toISOString()
            });

        await startLocalStream();
        
        const peerConnected = await initPeerJS(true);
        if (!peerConnected) {
            console.log('⚠️ PeerJS failed, switching to Daily.co fallback...');
            await initDailyFallback(true);
        }

        saveSessionState();

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

        // Clear any old session data
        clearSavedSession();

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
        state.sessionEnded = false;

        DOM.roomTitle.textContent = session.title || 'Live Session';
        DOM.shareLinkInput.value = `${window.location.origin}/virtualroom.html?code=${state.sessionCode}`;
        DOM.hostControls.style.display = 'none';
        DOM.viewerControls.style.display = 'flex';
        DOM.hostStatusText.textContent = 'Connecting to host...';
        DOM.sessionEndedOverlay.classList.remove('active');

        // Add viewer
        await supabase
            .from('session_participants')
            .upsert({
                session_id: state.sessionId,
                user_id: state.currentUser.id,
                role: 'viewer',
                is_active: true,
                peer_id: null,
                last_seen: new Date().toISOString()
            }, { onConflict: 'session_id,user_id' });

        await startLocalStream();

        const peerConnected = await initPeerJS(false);
        if (!peerConnected) {
            console.log('⚠️ PeerJS failed, switching to Daily.co fallback...');
            await initDailyFallback(false);
        }

        await loadParticipants();
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
// PEERJS - (Keep the same as before)
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

            const timeout = setTimeout(() => {
                if (state.peer && !state.peer.open) {
                    console.warn('⏰ PeerJS connection timeout');
                    state.peer.destroy();
                    resolve(false);
                }
            }, 20000);

            state.peer.on('open', async (id) => {
                clearTimeout(timeout);
                state.peerId = id;
                console.log('✅ PeerJS connected:', id);

                await savePeerIdWithRetry(id);

                DOM.connectionStatus.textContent = '🟢 Connected';
                DOM.connectionStatus.style.color = '#10b981';

                if (isHost) {
                    console.log('📞 Host waiting for viewer calls...');
                    state.peer.on('call', handleIncomingCall);
                    
                    state.peer.on('connection', (conn) => {
                        console.log('📡 Data connection from:', conn.peer);
                        conn.on('data', (data) => {
                            try {
                                const msg = JSON.parse(data);
                                handleDataChannelMessage(msg, conn.peer);
                            } catch (e) {}
                        });
                    });

                    setTimeout(() => {
                        connectToViewers();
                    }, 3000);

                } else {
                    console.log('📞 Viewer connecting to host...');
                    setTimeout(() => {
                        connectToHost();
                    }, 2000);
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
                    }, 3000);
                    return;
                }
                
                state.peerjsFailed = true;
                resolve(false);
            });

        } catch (err) {
            console.error('❌ PeerJS init error:', err);
            state.peerjsFailed = true;
            resolve(false);
        }
    });
}

async function savePeerIdWithRetry(peerId, attempt = 0) {
    try {
        console.log(`💾 Saving peer_id: ${peerId} (attempt ${attempt + 1})`);
        
        const { error } = await supabase
            .from('session_participants')
            .update({ 
                peer_id: peerId,
                last_seen: new Date().toISOString()
            })
            .eq('session_id', state.sessionId)
            .eq('user_id', state.currentUser.id);

        if (error) {
            console.warn('⚠️ Save peer_id error:', error);
            if (attempt < 3) {
                setTimeout(() => {
                    savePeerIdWithRetry(peerId, attempt + 1);
                }, 1000);
                return;
            }
        } else {
            state.peerIdSaved = true;
            console.log('✅ Peer ID saved successfully');
        }
    } catch (e) {
        console.warn('⚠️ Save peer_id exception:', e);
        if (attempt < 3) {
            setTimeout(() => {
                savePeerIdWithRetry(peerId, attempt + 1);
            }, 1000);
        }
    }
}

function connectToViewers() {
    console.log('📢 Connecting to existing viewers...');
    
    state.participants.forEach((participant, userId) => {
        if (userId !== state.currentUser.id && participant.peer_id) {
            try {
                const conn = state.peer.connect(participant.peer_id);
                conn.on('open', () => {
                    conn.send(JSON.stringify({
                        type: 'host_ready',
                        peerId: state.peerId
                    }));
                });
            } catch (e) {
                console.warn('Could not connect to viewer:', participant.peer_id);
            }
        }
    });
}

async function connectToHost() {
    try {
        const { data: host, error } = await supabase
            .from('session_participants')
            .select('peer_id, user_id')
            .eq('session_id', state.sessionId)
            .eq('role', 'host')
            .maybeSingle();

        if (error) {
            console.warn('⚠️ Error getting host:', error);
            retryConnectToHost();
            return;
        }

        if (!host || !host.peer_id) {
            console.warn('⚠️ Host not found or no peer ID yet. Waiting...');
            retryConnectToHost();
            return;
        }

        state.hostPeerId = host.peer_id;
        console.log('📞 Calling host:', state.hostPeerId);

        try {
            const conn = state.peer.connect(state.hostPeerId);
            conn.on('open', () => {
                console.log('📡 Data connection to host established');
                conn.send(JSON.stringify({
                    type: 'viewer_ready',
                    peerId: state.peerId,
                    name: state.userProfile.name || 'Viewer'
                }));
            });
            conn.on('data', (data) => {
                try {
                    const msg = JSON.parse(data);
                    handleDataChannelMessage(msg, conn.peer);
                } catch (e) {}
            });
        } catch (e) {
            console.warn('Data connection failed, proceeding with call only:', e);
        }

        const call = state.peer.call(state.hostPeerId, state.localStream);
        
        call.on('stream', (remoteStream) => {
            console.log('📺 Host stream received!');
            DOM.hostVideo.srcObject = remoteStream;
            DOM.hostVideo.play().catch(() => {});
            DOM.hostVideo.parentElement.classList.add('has-video');
            DOM.hostPlaceholder.style.display = 'none';
            DOM.hostStatusText.textContent = 'Connected to host';
            DOM.connectionStatus.textContent = '🟢 Connected';
            DOM.connectionStatus.style.color = '#10b981';
            state.hostStreamReceived = true;
        });

        call.on('close', () => {
            console.log('📺 Host stream closed');
            DOM.hostVideo.parentElement.classList.remove('has-video');
            DOM.hostPlaceholder.style.display = 'flex';
            DOM.hostStatusText.textContent = 'Host disconnected';
            DOM.connectionStatus.textContent = '🔴 Disconnected';
            DOM.connectionStatus.style.color = '#ef4444';
            state.hostStreamReceived = false;
            retryConnectToHost();
        });

        call.on('error', (err) => {
            console.error('📞 Call error:', err);
            retryConnectToHost();
        });

    } catch (error) {
        console.error('❌ Connect to host error:', error);
        retryConnectToHost();
    }
}

function retryConnectToHost() {
    if (state.reconnectTimeout) {
        clearTimeout(state.reconnectTimeout);
    }
    if (!state.hostStreamReceived && !state.sessionEnded) {
        state.reconnectTimeout = setTimeout(() => {
            console.log('🔄 Retrying connection to host...');
            connectToHost();
        }, 3000);
    }
}

function handleIncomingCall(call) {
    console.log('📞 Incoming call from:', call.peer);
    
    call.answer(state.localStream);
    
    call.on('stream', (remoteStream) => {
        console.log('📺 Viewer stream received from:', call.peer);
        
        const viewerId = call.peer;
        state.viewerStreams.set(viewerId, remoteStream);
        
        renderViewerThumbnails();
        
        DOM.connectionStatus.textContent = `🟢 ${state.viewerStreams.size} viewer(s)`;
        DOM.connectionStatus.style.color = '#10b981';
        DOM.hostStatusText.textContent = `${state.viewerStreams.size} viewer(s) connected`;
    });

    call.on('close', () => {
        console.log('📺 Viewer stream closed:', call.peer);
        state.viewerStreams.delete(call.peer);
        renderViewerThumbnails();
    });
}

function handleDataChannelMessage(message, peerId) {
    console.log('📨 Data message:', message.type);
    
    switch (message.type) {
        case 'viewer_ready':
            if (state.isHost) {
                console.log('👤 Viewer ready:', message.name);
                showToast(`👤 ${message.name || 'Viewer'} joined`, 'info');
            }
            break;
            
        case 'host_ready':
            if (!state.isHost && !state.hostStreamReceived) {
                console.log('📞 Host ready, connecting...');
                connectToHost();
            }
            break;
            
        case 'hand_raised':
            if (state.isHost) {
                showToast(`🙋 ${message.name || 'A viewer'} raised their hand!`, 'warning');
                sendToChatIframe({
                    type: 'system_message',
                    message: `🙋 ${message.name || 'A viewer'} raised their hand`
                });
            }
            break;
    }
}

// ============================================
// DAILY.CO FALLBACK
// ============================================

async function initDailyFallback(isHost) {
    try {
        console.log('📹 Initializing Daily.co fallback...');
        state.usingDailyFallback = true;
        
        if (DOM.dailyContainer) {
            DOM.dailyContainer.style.display = 'block';
            if (DOM.videoGrid) DOM.videoGrid.style.display = 'none';
        }

        const roomName = `glimu-${state.sessionCode}`;
        const jitsiUrl = `https://meet.jit.si/${roomName}`;
        
        if (DOM.dailyFrameContainer) {
            DOM.dailyFrameContainer.innerHTML = `
                <iframe 
                    src="${jitsiUrl}"
                    style="width:100%;height:100%;border:0;"
                    allow="camera; microphone; fullscreen; display-capture"
                    allowfullscreen
                ></iframe>
            `;
        }

        DOM.hostStatusText.textContent = 'Using backup video service';
        showToast('📹 Using backup video service', 'info');
        if (DOM.connectionStatus) {
            DOM.connectionStatus.textContent = '🟢 Connected (Backup)';
            DOM.connectionStatus.style.color = '#f59e0b';
        }

        console.log('✅ Daily.co fallback initialized');

    } catch (error) {
        console.error('❌ Daily fallback error:', error);
        useFallbackMode();
    }
}

// ============================================
// STREAM MANAGEMENT (Keep existing)
// ============================================

async function startLocalStream() {
    try {
        state.localStream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'user', 
                width: { ideal: 640 }, 
                height: { ideal: 480 } 
            },
            audio: { 
                echoCancellation: true, 
                noiseSuppression: true,
                autoGainControl: true
            }
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
        if (err.name !== 'NotReadableError' && err.name !== 'NotFoundError') {
            showToast('Could not access camera: ' + err.message, 'warning');
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
    document.getElementById('micBtn')?.classList.toggle('off', state.isMuted);
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
        document.getElementById('screenBtn')?.classList.remove('active');
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
        document.getElementById('screenBtn')?.classList.add('active');
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
        document.getElementById('screenBtn')?.classList.remove('active');
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
        const hasStream = state.viewerStreams.has(viewer.peer_id);

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

    viewers.forEach(viewer => {
        const videoEl = document.getElementById(`viewer_${viewer.user_id}`);
        if (!videoEl) return;
        
        const stream = state.viewerStreams.get(viewer.peer_id);
        if (stream) {
            videoEl.srcObject = stream;
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

    document.getElementById('raiseHandBtn')?.classList.toggle('active', state.handRaised);
    showToast(state.handRaised ? 'Hand raised! 🙋' : 'Hand lowered', 'info');

    if (state.handRaised && state.hostPeerId) {
        try {
            const conn = state.peer.connect(state.hostPeerId);
            conn.on('open', () => {
                conn.send(JSON.stringify({
                    type: 'hand_raised',
                    name: state.userProfile.name || 'A viewer'
                }));
            });
        } catch (e) {
            console.warn('Could not send hand raise to host:', e);
        }
        
        sendToChatIframe({
            type: 'system_message',
            message: `🙋 ${state.userProfile.name || 'A viewer'} raised their hand`
        });
    }
}

// ============================================
// TIPPING - Heart ₦200, Star ₦500, Haha ₦1250
// ============================================

async function sendTip(amount, emoji) {
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
// SESSION END - CLEAR SAVED SESSION
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

        // CLEAR THE SAVED SESSION
        clearSavedSession();

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
                clearSavedSession();
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
                    roomTitle: DOM.roomTitle.textContent
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

function showLoading(show) {
    if (DOM.loadingOverlay) {
        DOM.loadingOverlay.style.display = show ? 'flex' : 'none';
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

function setupUI() {
    if (state.isHost) {
        DOM.hostControls.style.display = 'flex';
        DOM.viewerControls.style.display = 'none';
        DOM.hostStatusText.textContent = 'You are the host - waiting for viewers...';
    } else {
        DOM.hostControls.style.display = 'none';
        DOM.viewerControls.style.display = 'flex';
        DOM.hostStatusText.textContent = 'Connecting to host...';
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

    // Tip options: Heart ₦200, Star ₦500, Haha ₦1250
    document.querySelectorAll('.tip-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = parseInt(btn.dataset.amount);
            const emoji = btn.dataset.emoji || '❤️';
            sendTip(amount, emoji);
        });
    });

    document.getElementById('sendCustomTip')?.addEventListener('click', () => {
        const amount = parseInt(prompt('Enter amount (₦):'));
        if (amount > 0) {
            sendTip(amount, '💝');
        }
    });

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

    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });

    window.addEventListener('beforeunload', () => {
        if (state.sessionId && !state.sessionEnded) {
            saveSessionState();
        }
    });
}

function toggleChatSidebar() {
    DOM.chatSidebar?.classList.toggle('open');
}

function useFallbackMode() {
    showLoading(false);
    DOM.hostStatusText.textContent = 'Chat-only mode';
    if (DOM.connectionStatus) {
        DOM.connectionStatus.textContent = '🔴 Chat Only';
        DOM.connectionStatus.style.color = '#f59e0b';
    }
    showToast('⚠️ Connected in chat-only mode', 'warning');
}

function showLoginScreen() {
    const container = document.querySelector('.virtual-room');
    if (container) {
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;padding:40px;background:var(--bg-primary);">
                <i class="fas fa-sign-in-alt" style="font-size:64px;color:var(--danger);margin-bottom:20px;"></i>
                <h2>Sign In Required</h2>
                <p style="color:var(--text-secondary);margin-bottom:24px;">Please sign in to access the virtual room.</p>
                <button onclick="window.location.href='/signin.html'" class="primary-btn">Sign In</button>
            </div>
        `;
    }
}

function showSessionSelection() {
    DOM.loadingText.textContent = 'Start or Join a Session';
    DOM.loadingSubText.textContent = 'Create your own session or join with a code';
    const spinner = DOM.loadingOverlay?.querySelector('.loading-spinner');
    if (spinner) spinner.style.display = 'none';

    if (DOM.loadingOverlay) {
        DOM.loadingOverlay.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px;width:100%;max-width:320px;">
                <button onclick="window.location.href='?mode=host'" class="primary-btn" style="width:100%;">
                    <i class="fas fa-video"></i> Go Live
                </button>
                <div style="display:flex;gap:8px;width:100%;">
                    <input type="text" id="sessionCodeInput" placeholder="Enter session code" 
                           style="flex:1;padding:10px 14px;border-radius:12px;border:2px solid var(--border-color);
                                  background:var(--bg-input);color:var(--text-primary);font-family:inherit;">
                    <button onclick="handleJoinWithCode()" class="primary-btn" style="flex-shrink:0;">
                        <i class="fas fa-sign-in-alt"></i> Join
                    </button>
                </div>
            </div>
        `;
    }

    window.handleJoinWithCode = () => {
        const code = document.getElementById('sessionCodeInput')?.value.trim();
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
    if (state.reconnectTimeout) {
        clearTimeout(state.reconnectTimeout);
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

    // Clear saved session when leaving
    clearSavedSession();
    window.location.href = '/user';
}

// ============================================
// EXPOSE GLOBALS
// ============================================

window.leaveRoom = leaveRoom;
window.toggleChatSidebar = toggleChatSidebar;
window.handleJoinWithCode = window.handleJoinWithCode;

console.log('🎥 Virtual Room loaded with PeerJS + Daily fallback');
