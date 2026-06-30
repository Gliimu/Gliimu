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
    participants: new Map(),
    viewerCount: 0,
    handRaised: false,
    chatIframeReady: false,
    unreadCount: 0,
    timerInterval: null,
    classStartTime: Date.now(),
    screenStream: null,
    isSharing: false,
    localStream: null,
    peer: null,
    peerId: null,
    hostPeerId: null,
    isMuted: false,
    participantsSubscription: null,
    sessionSubscription: null,
    peerConnected: false,
    hostFound: false,
    combinedStream: null,
};

// ============================================
// DOM REFS
// ============================================

const DOM = {};

function cacheDOM() {
    DOM.roomTitle = document.getElementById('roomTitle');
    DOM.classTimer = document.getElementById('classTimer');
    DOM.viewerCount = document.getElementById('viewerCount');
    DOM.liveStatus = document.getElementById('liveStatus');
    DOM.liveDot = document.getElementById('liveDot');
    DOM.chatSidebar = document.getElementById('chatSidebar');
    DOM.chatIframe = document.getElementById('chatIframe');
    DOM.shareModal = document.getElementById('shareModal');
    DOM.sessionEndedOverlay = document.getElementById('sessionEndedOverlay');
    DOM.shareLinkInput = document.getElementById('shareLinkInput');
    DOM.viewerControls = document.getElementById('viewerControls');
    DOM.hostControls = document.getElementById('hostControls');
    DOM.loadingOverlay = document.getElementById('loadingOverlay');
    DOM.loadingText = document.getElementById('loadingText');
    DOM.loadingSubText = document.getElementById('loadingSubText');
    DOM.screenVideo = document.getElementById('screenVideo');
    DOM.screenPlaceholder = document.getElementById('screenPlaceholder');
    DOM.placeholderTitle = document.getElementById('placeholderTitle');
    DOM.placeholderText = document.getElementById('placeholderText');
    DOM.hostIndicator = document.getElementById('hostIndicator');
    DOM.screenBtn = document.getElementById('screenBtn');
    DOM.micBtn = document.getElementById('micBtn');
}

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Virtual Room initializing...');
    cacheDOM();

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

        const savedSession = sessionStorage.getItem('glimu_session');
        if (savedSession && !sessionCode && !mode) {
            try {
                const sessionData = JSON.parse(savedSession);
                const age = Date.now() - (sessionData.timestamp || 0);
                if (sessionData.sessionId && age < 60000) {
                    console.log('Found saved session, recovering...');
                    await recoverSession(sessionData);
                    return;
                }
                sessionStorage.removeItem('glimu_session');
            } catch (e) {
                sessionStorage.removeItem('glimu_session');
            }
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

        console.log('Virtual Room ready');
        showLoading(false);

    } catch (error) {
        console.error('Init error:', error);
        showToast('Failed to initialize', 'error');
        showLoading(false);
    }
});

// ============================================
// SESSION MANAGEMENT
// ============================================

async function createNewSession() {
    try {
        showLoading(true);
        if (DOM.loadingText) DOM.loadingText.textContent = 'Starting session...';

        sessionStorage.removeItem('glimu_session');

        const sessionCode = generateSessionCode();
        state.sessionCode = sessionCode;
        state.isHost = true;

        const { data: session, error } = await supabase
            .from('virtual_sessions')
            .insert({
                host_id: state.currentUser.id,
                title: (state.userProfile.name || 'User') + '\'s Session',
                session_code: sessionCode,
                status: 'live',
                start_time: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('Database insert error:', error);
            showToast('Failed to create session', 'error');
            return;
        }

        state.sessionId = session.id;
        state.isLive = true;

        console.log('Session created in DB:', state.sessionId);

        await supabase
            .from('session_participants')
            .insert({
                session_id: state.sessionId,
                user_id: state.currentUser.id,
                role: 'host',
                is_active: true,
                last_seen: new Date().toISOString()
            });

        if (DOM.roomTitle) DOM.roomTitle.textContent = session.title;
        if (DOM.hostControls) DOM.hostControls.style.display = 'flex';
        if (DOM.viewerControls) DOM.viewerControls.style.display = 'none';
        if (DOM.placeholderTitle) DOM.placeholderTitle.textContent = 'Ready to share your screen';
        if (DOM.placeholderText) DOM.placeholderText.textContent = 'Click "Share Screen" to start';
        if (DOM.shareLinkInput) DOM.shareLinkInput.value = window.location.origin + '/virtualroom.html?code=' + state.sessionCode;

        await getAudioStream();
        await initPeerJS(true);

        saveSessionState();

        setTimeout(function() {
            sendToChatIframe({
                type: 'session_info',
                sessionId: state.sessionId,
                sessionCode: state.sessionCode,
                isHost: state.isHost,
                roomTitle: DOM.roomTitle ? DOM.roomTitle.textContent : 'Session'
            });
        }, 2000);

        showToast('Session started! Code: ' + state.sessionCode, 'success');

        setTimeout(function() {
            if (DOM.shareModal) DOM.shareModal.classList.add('active');
        }, 2000);

        console.log('Session started:', sessionCode);

    } catch (error) {
        console.error('Create session error:', error);
        showToast('Failed to start session', 'error');
    } finally {
        showLoading(false);
    }
}

async function joinSession(sessionCode) {
    try {
        showLoading(true);
        if (DOM.loadingText) DOM.loadingText.textContent = 'Joining session...';

        sessionStorage.removeItem('glimu_session');

        state.sessionCode = sessionCode;
        state.isHost = false;

        const { data: session, error } = await supabase
            .from('virtual_sessions')
            .select('*')
            .eq('session_code', sessionCode.toUpperCase())
            .single();

        if (error || !session) {
            showToast('Session not found', 'error');
            setTimeout(function() { window.location.href = '/user'; }, 2000);
            return;
        }

        if (session.status === 'ended') {
            showToast('Session has ended', 'error');
            setTimeout(function() { window.location.href = '/user'; }, 2000);
            return;
        }

        state.sessionId = session.id;
        state.isLive = session.status === 'live';

        console.log('Session found in DB:', state.sessionId);

        await supabase
            .from('session_participants')
            .upsert({
                session_id: state.sessionId,
                user_id: state.currentUser.id,
                role: 'viewer',
                is_active: true,
                last_seen: new Date().toISOString()
            }, { onConflict: 'session_id,user_id' });

        if (DOM.roomTitle) DOM.roomTitle.textContent = session.title || 'Live Session';
        if (DOM.hostControls) DOM.hostControls.style.display = 'none';
        if (DOM.viewerControls) DOM.viewerControls.style.display = 'flex';
        if (DOM.placeholderTitle) DOM.placeholderTitle.textContent = 'Waiting for host...';
        if (DOM.placeholderText) DOM.placeholderText.textContent = 'The host will start sharing their screen shortly';
        if (DOM.shareLinkInput) DOM.shareLinkInput.value = window.location.origin + '/virtualroom.html?code=' + state.sessionCode;

        await getAudioStream();
        await initPeerJS(false);

        saveSessionState();

        setTimeout(function() {
            sendToChatIframe({
                type: 'session_info',
                sessionId: state.sessionId,
                sessionCode: state.sessionCode,
                isHost: state.isHost,
                roomTitle: DOM.roomTitle ? DOM.roomTitle.textContent : 'Session'
            });
        }, 2000);

        showToast('Connected to session!', 'success');

        console.log('Joined session:', sessionCode);

    } catch (error) {
        console.error('Join session error:', error);
        showToast('Failed to join session', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================
// AUDIO STREAM
// ============================================

async function getAudioStream() {
    try {
        state.localStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false
        });
        console.log('Audio stream acquired');
    } catch (err) {
        console.warn('Could not get audio:', err);
    }
}

// ============================================
// PEERJS
// ============================================

function initPeerJS(isHost) {
    return new Promise(function(resolve) {
        try {
            if (!state.sessionId) {
                console.error('Cannot initialize PeerJS: sessionId is null');
                resolve(false);
                return;
            }

            const peerId = 'glimu_' + state.currentUser.id + '_' + Date.now();

            console.log('Connecting to PeerJS... sessionId:', state.sessionId);

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
                        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
                    ]
                }
            });

            var timeout = setTimeout(function() {
                if (state.peer && !state.peer.open) {
                    console.warn('PeerJS connection timeout');
                    state.peer.destroy();
                    resolve(false);
                }
            }, 20000);

            state.peer.on('open', async function(id) {
                clearTimeout(timeout);
                state.peerId = id;
                state.peerConnected = true;
                console.log('PeerJS connected:', id);

                try {
                    const { error } = await supabase
                        .from('session_participants')
                        .update({ peer_id: id })
                        .eq('session_id', state.sessionId)
                        .eq('user_id', state.currentUser.id);

                    if (error) {
                        console.warn('Could not update peer_id:', error);
                    } else {
                        console.log('Peer ID saved to database');
                    }
                } catch (e) {
                    console.warn('Error saving peer_id:', e);
                }

                if (isHost) {
                    state.peer.on('call', handleIncomingCall);
                    state.peer.on('connection', function(conn) {
                        conn.on('data', function(data) {
                            try { handleDataMessage(JSON.parse(data)); } catch(e) {}
                        });
                    });
                    console.log('Host waiting for connections...');
                } else {
                    setTimeout(function() {
                        connectToHost();
                    }, 3000);
                }

                resolve(true);
            });

            state.peer.on('error', function(err) {
                clearTimeout(timeout);
                console.error('PeerJS error:', err.message);
                if (err.message.includes('Lost connection') || err.message.includes('disconnected')) {
                    console.log('Attempting to reconnect...');
                    setTimeout(function() {
                        if (state.peer) {
                            state.peer.reconnect();
                        }
                    }, 3000);
                }
                resolve(false);
            });

            state.peer.on('disconnected', function() {
                console.warn('PeerJS disconnected, attempting to reconnect...');
                state.peer.reconnect();
            });

        } catch (err) {
            console.error('PeerJS init error:', err);
            resolve(false);
        }
    });
}

// ============================================
// CONNECT TO HOST (Viewer)
// ============================================

async function connectToHost() {
    if (!state.sessionId) {
        console.warn('Cannot connect: sessionId is null');
        setTimeout(connectToHost, 3000);
        return;
    }

    try {
        const { data: host, error } = await supabase
            .from('session_participants')
            .select('peer_id, user_id')
            .eq('session_id', state.sessionId)
            .eq('role', 'host')
            .maybeSingle();

        if (error) {
            console.warn('Error getting host:', error);
            setTimeout(connectToHost, 3000);
            return;
        }

        if (!host || !host.peer_id) {
            console.warn('Host not found or no peer ID. Retrying...');
            setTimeout(connectToHost, 3000);
            return;
        }

        state.hostPeerId = host.peer_id;
        state.hostFound = true;
        console.log('Found host peer_id:', state.hostPeerId);

        // Call host for audio + screen (combined stream)
        var call = state.peer.call(state.hostPeerId, state.localStream);
        
        call.on('stream', function(remoteStream) {
            console.log('Stream received from host!');
            
            // Check if the stream has video (screen share)
            var hasVideo = remoteStream.getVideoTracks().length > 0;
            
            if (hasVideo) {
                console.log('Screen stream received with audio!');
                DOM.screenVideo.srcObject = remoteStream;
                DOM.screenVideo.style.display = 'block';
                DOM.screenVideo.classList.add('active');
                DOM.screenPlaceholder.style.display = 'none';
                DOM.hostIndicator.classList.add('active');
                DOM.screenVideo.play().catch(function(e) { console.warn('Video play error:', e); });
                if (DOM.placeholderTitle) DOM.placeholderTitle.textContent = 'Host is sharing';
                if (DOM.placeholderText) DOM.placeholderText.textContent = 'You are viewing the host\'s screen';
            } else {
                console.log('Audio only stream received (host not sharing screen yet)');
                DOM.screenPlaceholder.style.display = 'none';
                if (DOM.placeholderTitle) DOM.placeholderTitle.textContent = 'Connected to host';
                if (DOM.placeholderText) DOM.placeholderText.textContent = 'Waiting for host to share screen...';
            }
        });

        call.on('close', function() {
            console.log('Host disconnected');
            state.hostFound = false;
            showToast('Host disconnected', 'warning');
            DOM.screenVideo.classList.remove('active');
            DOM.screenVideo.style.display = 'none';
            DOM.screenPlaceholder.style.display = 'flex';
            if (DOM.placeholderTitle) DOM.placeholderTitle.textContent = 'Host disconnected';
            if (DOM.placeholderText) DOM.placeholderText.textContent = 'Waiting for host to reconnect...';
            setTimeout(connectToHost, 5000);
        });

        // Data channel for messages
        try {
            var conn = state.peer.connect(state.hostPeerId);
            conn.on('open', function() {
                console.log('Data channel established');
                conn.send(JSON.stringify({
                    type: 'viewer_ready',
                    peerId: state.peerId
                }));
            });
            conn.on('data', function(data) {
                try { handleDataMessage(JSON.parse(data)); } catch(e) {}
            });
        } catch (e) {
            console.warn('Data connection failed:', e);
        }

    } catch (error) {
        console.error('Connect to host error:', error);
        setTimeout(connectToHost, 3000);
    }
}

// ============================================
// HANDLE INCOMING CALL (Host)
// ============================================

function handleIncomingCall(call) {
    console.log('Incoming call from:', call.peer);
    
    // Determine what stream to send
    var streamToSend = null;
    
    if (state.isSharing && state.screenStream) {
        // Combine screen + audio into one stream
        streamToSend = getCombinedStream();
        console.log('Sending screen + audio to viewer');
    } else if (state.localStream) {
        streamToSend = state.localStream;
        console.log('Sending audio only to viewer');
    } else {
        console.warn('No stream available to send');
        return;
    }
    
    call.answer(streamToSend);
    
    call.on('stream', function(remoteStream) {
        console.log('Viewer stream received');
    });

    call.on('close', function() {
        console.log('Viewer disconnected');
    });
}

// ============================================
// COMBINE SCREEN + AUDIO INTO ONE STREAM
// ============================================

function getCombinedStream() {
    if (state.combinedStream && state.combinedStream.active) {
        return state.combinedStream;
    }
    
    if (!state.screenStream || !state.localStream) {
        return state.screenStream || state.localStream;
    }
    
    try {
        var videoTrack = state.screenStream.getVideoTracks()[0];
        var audioTrack = state.localStream.getAudioTracks()[0];
        
        if (!videoTrack || !audioTrack) {
            return state.screenStream || state.localStream;
        }
        
        // Create a new combined stream
        state.combinedStream = new MediaStream();
        state.combinedStream.addTrack(videoTrack);
        state.combinedStream.addTrack(audioTrack);
        
        console.log('Combined stream created (video + audio)');
        return state.combinedStream;
    } catch (e) {
        console.warn('Could not combine streams:', e);
        return state.screenStream || state.localStream;
    }
}

// ============================================
// DATA MESSAGES
// ============================================

function handleDataMessage(data) {
    console.log('Data message:', data.type);
    
    switch (data.type) {
        case 'viewer_ready':
            if (state.isHost) {
                console.log('Viewer ready, peerId:', data.peerId);
                // Call viewer with combined stream
                if (state.isSharing && state.screenStream) {
                    var stream = getCombinedStream();
                    if (stream) {
                        try {
                            var call = state.peer.call(data.peerId, stream);
                            console.log('Screen + audio sent to viewer:', data.peerId);
                        } catch (e) {
                            console.warn('Could not send stream:', e);
                        }
                    }
                }
            }
            break;
            
        case 'hand_raised':
            if (state.isHost) {
                showToast('🙋 Viewer raised their hand!', 'warning');
                sendToChatIframe({
                    type: 'system_message',
                    message: '🙋 A viewer raised their hand'
                });
            }
            break;
    }
}

// ============================================
// SCREEN SHARE (Host Only)
// ============================================

async function toggleScreenShare() {
    if (!state.isHost) {
        showToast('Only hosts can share screens', 'warning');
        return;
    }

    if (state.isSharing) {
        if (state.screenStream) {
            state.screenStream.getTracks().forEach(function(t) { t.stop(); });
            state.screenStream = null;
        }
        state.combinedStream = null;
        state.isSharing = false;
        if (DOM.screenBtn) DOM.screenBtn.classList.remove('active');
        DOM.screenVideo.classList.remove('active');
        DOM.screenVideo.style.display = 'none';
        DOM.screenPlaceholder.style.display = 'flex';
        DOM.hostIndicator.classList.remove('active');
        if (DOM.placeholderTitle) DOM.placeholderTitle.textContent = 'Screen sharing stopped';
        if (DOM.placeholderText) DOM.placeholderText.textContent = 'Click "Share Screen" to start again';
        showToast('Screen share stopped', 'info');
        
        // Notify viewers that screen sharing stopped via data channel
        state.participants.forEach(function(participant, userId) {
            if (userId !== state.currentUser.id && participant.peer_id) {
                try {
                    var conn = state.peer.connect(participant.peer_id);
                    conn.on('open', function() {
                        conn.send(JSON.stringify({
                            type: 'screen_stopped'
                        }));
                    });
                } catch (e) {}
            }
        });
        return;
    }

    try {
        state.screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' },
            audio: false
        });

        state.isSharing = true;
        if (DOM.screenBtn) DOM.screenBtn.classList.add('active');

        // Show screen locally
        DOM.screenVideo.srcObject = state.screenStream;
        DOM.screenVideo.style.display = 'block';
        DOM.screenVideo.classList.add('active');
        DOM.screenPlaceholder.style.display = 'none';
        DOM.hostIndicator.classList.add('active');
        await DOM.screenVideo.play();

        // Create combined stream with audio
        var combinedStream = getCombinedStream();

        // Send combined stream to all viewers
        state.participants.forEach(function(participant, userId) {
            if (userId !== state.currentUser.id && participant.peer_id) {
                try {
                    var call = state.peer.call(participant.peer_id, combinedStream || state.screenStream);
                    console.log('Screen + audio sent to viewer:', participant.peer_id);
                } catch (e) {
                    console.warn('Could not send screen:', e);
                }
            }
        });

        showToast('Screen sharing started!', 'success');

        state.screenStream.getVideoTracks()[0].onended = function() {
            if (state.isSharing) {
                toggleScreenShare();
            }
        };

    } catch (err) {
        console.error('Screen share error:', err);
        if (err.name !== 'AbortError') {
            showToast('Screen share cancelled', 'warning');
        }
        state.isSharing = false;
        if (DOM.screenBtn) DOM.screenBtn.classList.remove('active');
    }
}

// ============================================
// RAISE HAND
// ============================================

async function toggleRaiseHand() {
    if (!state.sessionId) {
        showToast('No active session', 'warning');
        return;
    }

    state.handRaised = !state.handRaised;

    await supabase
        .from('session_participants')
        .update({ hand_raised: state.handRaised })
        .eq('session_id', state.sessionId)
        .eq('user_id', state.currentUser.id);

    var btn = document.getElementById('raiseHandBtn');
    if (btn) btn.classList.toggle('active', state.handRaised);
    showToast(state.handRaised ? 'Hand raised! 🙋' : 'Hand lowered', 'info');

    if (state.handRaised && state.hostPeerId) {
        try {
            var conn = state.peer.connect(state.hostPeerId);
            conn.on('open', function() {
                conn.send(JSON.stringify({
                    type: 'hand_raised',
                    name: state.userProfile.name || 'A viewer'
                }));
            });
        } catch (e) {
            console.warn('Could not send hand raise:', e);
        }
        
        sendToChatIframe({
            type: 'system_message',
            message: '🙋 ' + (state.userProfile.name || 'A viewer') + ' raised their hand'
        });
    }
}

// ============================================
// TIPPING
// ============================================

async function sendTip(amount, emoji) {
    if (!state.sessionId) {
        showToast('No active session', 'error');
        return;
    }

    try {
        var { data: session, error } = await supabase
            .from('virtual_sessions')
            .select('host_id')
            .eq('id', state.sessionId)
            .single();

        if (error || !session) {
            showToast('Session not found', 'error');
            return;
        }

        var userBalance = state.userProfile.wallet_balance || 0;

        if (amount > userBalance) {
            showToast('Insufficient wallet balance (₦' + userBalance + ')', 'error');
            return;
        }

        var newBalance = userBalance - amount;

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

        showToast(emoji + ' Tip sent! ₦' + amount, 'success');

        sendToChatIframe({
            type: 'system_message',
            message: emoji + ' ' + (state.userProfile.name || 'Someone') + ' sent ₦' + amount
        });

    } catch (error) {
        console.error('Tip error:', error);
        showToast('Failed to send tip', 'error');
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
        if (state.screenStream) {
            state.screenStream.getTracks().forEach(function(t) { t.stop(); });
            state.screenStream = null;
        }
        state.combinedStream = null;

        if (state.sessionId) {
            await supabase
                .from('virtual_sessions')
                .update({ status: 'ended', end_time: new Date().toISOString() })
                .eq('id', state.sessionId);
        }

        state.sessionEnded = true;
        state.isLive = false;
        if (DOM.sessionEndedOverlay) DOM.sessionEndedOverlay.classList.add('active');
        sessionStorage.removeItem('glimu_session');
        cleanup();
        showToast('Session ended', 'success');

    } catch (error) {
        console.error('End session error:', error);
        showToast('Failed to end session', 'error');
    }
}

// ============================================
// SESSION RECOVERY
// ============================================

async function recoverSession(savedData) {
    try {
        showLoading(true);
        if (DOM.loadingText) DOM.loadingText.textContent = 'Recovering session...';

        var { data: session, error } = await supabase
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

        if (DOM.roomTitle) DOM.roomTitle.textContent = session.title || 'Live Session';
        if (DOM.shareLinkInput) DOM.shareLinkInput.value = window.location.origin + '/virtualroom.html?code=' + state.sessionCode;

        await supabase
            .from('session_participants')
            .update({ 
                is_active: true,
                last_seen: new Date().toISOString()
            })
            .eq('session_id', state.sessionId)
            .eq('user_id', state.currentUser.id);

        if (state.isHost) {
            if (DOM.hostControls) DOM.hostControls.style.display = 'flex';
            if (DOM.viewerControls) DOM.viewerControls.style.display = 'none';
        } else {
            if (DOM.hostControls) DOM.hostControls.style.display = 'none';
            if (DOM.viewerControls) DOM.viewerControls.style.display = 'flex';
        }

        await getAudioStream();
        await initPeerJS(state.isHost);
        await loadParticipants();
        showToast('Session recovered!', 'success');
        saveSessionState();

        console.log('Session recovered:', state.sessionCode);

    } catch (error) {
        console.error('Session recovery failed:', error);
        sessionStorage.removeItem('glimu_session');
        await createNewSession();
    }
}

// ============================================
// PARTICIPANTS
// ============================================

async function loadParticipants() {
    try {
        if (!state.sessionId) return;
        
        var { data, error } = await supabase
            .from('session_participants')
            .select('*, users(name)')
            .eq('session_id', state.sessionId)
            .eq('is_active', true);

        if (error) throw error;

        state.participants.clear();
        data.forEach(function(p) {
            state.participants.set(p.user_id, {
                ...p,
                name: p.users ? p.users.name : 'User'
            });
        });

        var viewers = data.filter(function(p) { return p.role !== 'host'; });
        state.viewerCount = viewers.length;
        if (DOM.viewerCount) DOM.viewerCount.textContent = viewers.length;

        // If host and sharing, send combined stream to any new viewers
        if (state.isHost && state.isSharing && state.screenStream) {
            var combinedStream = getCombinedStream();
            viewers.forEach(function(viewer) {
                if (viewer.peer_id) {
                    try {
                        var call = state.peer.call(viewer.peer_id, combinedStream || state.screenStream);
                        console.log('Screen + audio sent to new viewer:', viewer.peer_id);
                    } catch (e) {
                        console.warn('Could not send screen to new viewer:', e);
                    }
                }
            });
        }

    } catch (error) {
        console.warn('Load participants error:', error);
    }
}

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

function setupRealtimeSubscriptions() {
    if (!state.sessionId) return;

    state.participantsSubscription = supabase
        .channel('session_participants_' + state.sessionId)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'session_participants',
            filter: 'session_id=eq.' + state.sessionId
        }, function() {
            loadParticipants();
        })
        .subscribe();

    state.sessionSubscription = supabase
        .channel('session_' + state.sessionId)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'virtual_sessions',
            filter: 'id=eq.' + state.sessionId
        }, function(payload) {
            if (payload.new.status === 'ended') {
                state.sessionEnded = true;
                if (DOM.sessionEndedOverlay) DOM.sessionEndedOverlay.classList.add('active');
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
    var iframe = DOM.chatIframe;
    if (!iframe) return;

    window.addEventListener('message', function(event) {
        if (event.source !== iframe.contentWindow) return;
        var data = event.data;
        console.log('Chat message:', data.type);

        switch (data.type) {
            case 'chat_ready':
                state.chatIframeReady = true;
                sendToChatIframe({
                    type: 'session_info',
                    sessionId: state.sessionId || 'pending',
                    sessionCode: state.sessionCode,
                    isHost: state.isHost,
                    roomTitle: DOM.roomTitle ? DOM.roomTitle.textContent : 'Session'
                });
                break;
            case 'message_sent':
                state.unreadCount++;
                break;
            case 'hand_raised':
                showToast('🙋 Viewer raised their hand!', 'warning');
                break;
            case 'tip_sent':
                showToast('🎁 Tip sent!', 'success');
                break;
            case 'star_rated':
                showToast('⭐ Star rated!', 'success');
                break;
        }
    });

    iframe.addEventListener('load', function() {
        setTimeout(function() {
            sendToChatIframe({
                type: 'session_info',
                sessionId: state.sessionId || 'pending',
                sessionCode: state.sessionCode,
                isHost: state.isHost,
                roomTitle: DOM.roomTitle ? DOM.roomTitle.textContent : 'Session'
            });
        }, 1500);
    });
}

function sendToChatIframe(data) {
    var iframe = DOM.chatIframe;
    if (iframe && iframe.contentWindow && state.chatIframeReady) {
        try {
            iframe.contentWindow.postMessage(data, '*');
        } catch (e) {
            console.warn('Could not send to iframe:', e);
        }
    }
}

// ============================================
// HELPERS
// ============================================

function generateSessionCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = 'GLM-';
    for (var i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function saveSessionState() {
    try {
        sessionStorage.setItem('glimu_session', JSON.stringify({
            sessionId: state.sessionId || 'pending',
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
    state.timerInterval = setInterval(function() {
        var elapsed = Math.floor((Date.now() - state.classStartTime) / 1000);
        var mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        var secs = String(elapsed % 60).padStart(2, '0');
        if (DOM.classTimer) DOM.classTimer.textContent
