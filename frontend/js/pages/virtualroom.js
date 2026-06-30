import { supabase, getCurrentUser, getUserProfile } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// WEBRTC CONFIG WITH ALTERNATIVE TURN SERVERS
// ============================================

function getRTCConfig() {
    return {
        iceServers: [
            // STUN servers (for NAT traversal)
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun.nextcloud.com:3478' },
            
            // TURN servers (when STUN fails)
            // 1. Jitsi TURN (often works)
            {
                urls: 'turn:turn.jitsi.net:3478',
                username: 'jitsi',
                credential: 'jitsi'
            },
            {
                urls: 'turn:turn.jitsi.net:443?transport=tcp',
                username: 'jitsi',
                credential: 'jitsi'
            },
            
            // 2. OpenRelay TURN (with multiple ports)
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            
            // 3. Numb TURN (community)
            {
                urls: 'turn:turn.numb.xyz:3478',
                username: 'webrtc',
                credential: 'webrtc'
            },
            {
                urls: 'turn:turn.numb.xyz:443?transport=tcp',
                username: 'webrtc',
                credential: 'webrtc'
            },
            
            // 4. AnyFirewall TURN
            {
                urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
                username: 'webrtc',
                credential: 'webrtc'
            },
            
            // 5. Metered TURN (reliable)
            {
                urls: 'turn:global.turn.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:global.turn.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
    };
}

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
    audioStream: null,
    isMuted: false,
    participantsSubscription: null,
    sessionSubscription: null,
    signalingSubscription: null,
    peerConnection: null,
    dataChannel: null,
    signalingReady: false,
    offerSent: false,
    answerReceived: false,
    hasReceivedOffer: false,
    isProcessing: false,
    pendingOffers: [],
    connectionAttempts: 0,
    maxConnectionAttempts: 3,
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

document.addEventListener('DOMContentLoaded', async function() {
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

        var params = new URLSearchParams(window.location.search);
        var sessionCode = params.get('code');
        var mode = params.get('mode');

        var savedSession = sessionStorage.getItem('glimu_session');
        if (savedSession && !sessionCode && !mode) {
            try {
                var sessionData = JSON.parse(savedSession);
                var age = Date.now() - (sessionData.timestamp || 0);
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

        var sessionCode = generateSessionCode();
        state.sessionCode = sessionCode;
        state.isHost = true;

        var { data: session, error } = await supabase
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
        await setupSignalingChannel();
        await setupWebRTC(true);

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

        var { data: session, error } = await supabase
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
        await setupSignalingChannel();
        await setupWebRTC(false);

        // Request offer from host after joining
        setTimeout(function() {
            requestOfferFromHost();
        }, 3000);

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
        state.audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false
        });
        console.log('Audio stream acquired');
    } catch (err) {
        console.warn('Could not get audio:', err);
    }
}

// ============================================
// SIGNALING CHANNEL
// ============================================

async function setupSignalingChannel() {
    if (!state.sessionId) return;

    if (state.signalingSubscription) {
        state.signalingSubscription.unsubscribe();
        state.signalingSubscription = null;
    }

    var channelName = 'signaling_' + state.sessionId;
    
    state.signalingSubscription = supabase
        .channel(channelName, {
            config: {
                broadcast: { ack: true }
            }
        })
        .on('broadcast', { event: 'signal' }, function(payload) {
            console.log('📨 Signal received:', payload.payload.type, 'from:', payload.payload.userId);
            handleSignalingMessage(payload.payload);
        })
        .subscribe(function(status) {
            console.log('📡 Signaling channel status:', status);
            if (status === 'SUBSCRIBED') {
                state.signalingReady = true;
                if (state.isHost && !state.offerSent) {
                    setTimeout(function() {
                        sendOffer();
                    }, 1000);
                }
            }
        });
}

function sendSignalingMessage(message) {
    if (!state.sessionId || !state.signalingSubscription) {
        console.warn('Cannot send signal: no subscription');
        return;
    }

    message.timestamp = Date.now();

    state.signalingSubscription.send({
        type: 'broadcast',
        event: 'signal',
        payload: message
    }).catch(function(err) {
        console.warn('Could not send signal:', err);
    });
}

// ============================================
// VIEWER REQUESTS OFFER FROM HOST
// ============================================

function requestOfferFromHost() {
    if (state.isHost) return;
    if (!state.signalingReady) {
        setTimeout(requestOfferFromHost, 2000);
        return;
    }

    console.log('📤 Viewer requesting offer from host...');
    sendSignalingMessage({
        type: 'request_offer',
        userId: state.currentUser.id,
        sessionId: state.sessionId
    });
}

// ============================================
// WEBRTC SETUP - WITH ALTERNATIVE TURN
// ============================================

async function setupWebRTC(isHost) {
    try {
        state.connectionAttempts++;
        console.log('🔗 Setting up WebRTC (attempt ' + state.connectionAttempts + ')...');
        
        state.peerConnection = new RTCPeerConnection(getRTCConfig());

        // Add audio track
        if (state.audioStream) {
            state.audioStream.getTracks().forEach(function(track) {
                state.peerConnection.addTrack(track, state.audioStream);
            });
        }

        if (isHost) {
            state.dataChannel = state.peerConnection.createDataChannel('signaling');
            state.dataChannel.onopen = function() {
                console.log('Data channel open');
            };
            state.dataChannel.onmessage = function(event) {
                try {
                    var data = JSON.parse(event.data);
                    handleDataChannelMessage(data);
                } catch (e) {}
            };
        } else {
            state.peerConnection.ondatachannel = function(event) {
                state.dataChannel = event.channel;
                state.dataChannel.onmessage = function(event) {
                    try {
                        var data = JSON.parse(event.data);
                        handleDataChannelMessage(data);
                    } catch (e) {}
                };
                state.dataChannel.onopen = function() {
                    console.log('Data channel open');
                    state.dataChannel.send(JSON.stringify({
                        type: 'viewer_ready',
                        userId: state.currentUser.id
                    }));
                };
            };
        }

        state.peerConnection.onicecandidate = function(event) {
            if (event.candidate) {
                sendSignalingMessage({
                    type: 'ice_candidate',
                    candidate: event.candidate,
                    userId: state.currentUser.id
                });
            }
        };

        state.peerConnection.ontrack = function(event) {
            console.log('📺 Remote stream received!');
            var stream = event.streams[0];
            
            if (stream) {
                var hasVideo = stream.getVideoTracks().length > 0;
                console.log('Has video:', hasVideo);
                
                if (hasVideo) {
                    console.log('✅ Video track detected!');
                    DOM.screenVideo.srcObject = stream;
                    DOM.screenVideo.style.display = 'block';
                    DOM.screenVideo.classList.add('active');
                    DOM.screenPlaceholder.style.display = 'none';
                    DOM.hostIndicator.classList.add('active');
                    DOM.screenVideo.play().catch(function(e) {
                        console.warn('Video play error:', e);
                    });
                    if (DOM.placeholderTitle) DOM.placeholderTitle.textContent = 'Host is sharing';
                    if (DOM.placeholderText) DOM.placeholderText.textContent = 'You are viewing the host\'s screen';
                } else {
                    console.log('Audio only stream');
                }
            }
        };

        state.peerConnection.onconnectionstatechange = function() {
            var stateStr = state.peerConnection.connectionState;
            console.log('Connection state:', stateStr);
            
            if (stateStr === 'connected' || stateStr === 'completed') {
                showToast('📹 Connected!', 'success');
                if (DOM.placeholderTitle) DOM.placeholderTitle.textContent = 'Connected!';
                if (DOM.placeholderText) DOM.placeholderText.textContent = 'Waiting for host to share screen...';
            } else if (stateStr === 'failed') {
                console.warn('Connection failed');
                if (state.connectionAttempts < state.maxConnectionAttempts) {
                    showToast('Connection failed, retrying...', 'warning');
                    setTimeout(function() {
                        if (state.isHost) {
                            state.offerSent = false;
                            sendOffer();
                        } else {
                            requestOfferFromHost();
                        }
                    }, 3000);
                } else {
                    showToast('Could not establish connection', 'error');
                }
            }
        };

        // ICE gathering state
        state.peerConnection.onicegatheringstatechange = function() {
            console.log('ICE gathering state:', state.peerConnection.iceGatheringState);
        };

        console.log('WebRTC setup complete with alternative TURN servers');

    } catch (error) {
        console.error('WebRTC setup error:', error);
        showToast('Could not establish connection', 'warning');
    }
}

// ============================================
// SEND OFFER (Host)
// ============================================

async function sendOffer() {
    if (!state.isHost || state.offerSent) return;
    if (!state.peerConnection) return;

    try {
        var offer = await state.peerConnection.createOffer();
        await state.peerConnection.setLocalDescription(offer);
        
        sendSignalingMessage({
            type: 'offer',
            sdp: offer,
            userId: state.currentUser.id,
            sessionId: state.sessionId
        });
        state.offerSent = true;
        console.log('✅ Offer sent');
    } catch (err) {
        console.error('Error creating offer:', err);
    }
}

// ============================================
// SIGNALING HANDLER
// ============================================

function handleSignalingMessage(message) {
    if (message.userId === state.currentUser.id) return;
    if (!state.peerConnection) return;

    console.log('Processing signal:', message.type);

    try {
        switch (message.type) {
            case 'request_offer':
                if (state.isHost) {
                    console.log('📤 Viewer requested offer, sending...');
                    state.offerSent = false;
                    setTimeout(function() {
                        sendOffer();
                    }, 500);
                }
                break;

            case 'offer':
                state.hasReceivedOffer = true;
                console.log('📨 Received offer, sending answer...');
                state.peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp))
                    .then(function() {
                        return state.peerConnection.createAnswer();
                    })
                    .then(function(answer) {
                        return state.peerConnection.setLocalDescription(answer);
                    })
                    .then(function() {
                        sendSignalingMessage({
                            type: 'answer',
                            sdp: state.peerConnection.localDescription,
                            userId: state.currentUser.id,
                            sessionId: state.sessionId
                        });
                        console.log('✅ Answer sent');
                    })
                    .catch(function(err) {
                        console.error('Answer error:', err);
                    });
                break;

            case 'answer':
                console.log('📨 Received answer');
                if (state.peerConnection.signalingState === 'have-local-offer' || 
                    state.peerConnection.signalingState === 'stable') {
                    state.peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp))
                        .then(function() {
                            state.answerReceived = true;
                            console.log('✅ Answer processed');
                        })
                        .catch(function(err) {
                            console.error('Set remote desc error:', err);
                        });
                } else {
                    console.log('Skipping answer - wrong state:', state.peerConnection.signalingState);
                    state.pendingOffers.push(message);
                }
                break;

            case 'ice_candidate':
                if (message.candidate) {
                    state.peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate))
                        .catch(function(err) {
                            console.warn('ICE candidate error:', err);
                        });
                }
                break;
        }
    } catch (error) {
        console.error('Signaling error:', error);
    }
}

// ============================================
// DATA CHANNEL
// ============================================

function handleDataChannelMessage(data) {
    console.log('Data message:', data.type);
    
    switch (data.type) {
        case 'viewer_ready':
            if (state.isHost) {
                console.log('👤 Viewer ready:', data.userId);
                if (state.isSharing && state.screenStream) {
                    sendScreenToViewer();
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
// SCREEN SHARE
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
        state.isSharing = false;
        if (DOM.screenBtn) DOM.screenBtn.classList.remove('active');
        DOM.screenVideo.classList.remove('active');
        DOM.screenVideo.style.display = 'none';
        DOM.screenPlaceholder.style.display = 'flex';
        DOM.hostIndicator.classList.remove('active');
        if (DOM.placeholderTitle) DOM.placeholderTitle.textContent = 'Screen sharing stopped';
        if (DOM.placeholderText) DOM.placeholderText.textContent = 'Click "Share Screen" to start again';
        showToast('Screen share stopped', 'info');
        return;
    }

    try {
        state.screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' },
            audio: false
        });

        state.isSharing = true;
        if (DOM.screenBtn) DOM.screenBtn.classList.add('active');

        DOM.screenVideo.srcObject = state.screenStream;
        DOM.screenVideo.style.display = 'block';
        DOM.screenVideo.classList.add('active');
        DOM.screenPlaceholder.style.display = 'none';
        DOM.hostIndicator.classList.add('active');
        await DOM.screenVideo.play();

        // Add screen track to peer connection
        var screenTrack = state.screenStream.getVideoTracks()[0];
        var sender = state.peerConnection.getSenders().find(function(s) {
            return s.track && s.track.kind === 'video';
        });
        
        if (sender) {
            sender.replaceTrack(screenTrack);
            console.log('Screen track replaced');
        } else {
            state.peerConnection.addTrack(screenTrack, state.screenStream);
            console.log('Screen track added');
        }

        // Broadcast to viewers
        broadcastScreenAvailable();

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

function broadcastScreenAvailable() {
    sendSignalingMessage({
        type: 'screen_available',
        userId: state.currentUser.id,
        sessionId: state.sessionId
    });
}

function sendScreenToViewer() {
    if (!state.isSharing || !state.screenStream || !state.peerConnection) return;
    
    try {
        var screenTrack = state.screenStream.getVideoTracks()[0];
        var sender = state.peerConnection.getSenders().find(function(s) {
            return s.track && s.track.kind === 'video';
        });
        
        if (sender) {
            sender.replaceTrack(screenTrack);
            console.log('Screen sent to viewer');
        } else {
            state.peerConnection.addTrack(screenTrack, state.screenStream);
            console.log('Screen added for viewer');
        }
    } catch (e) {
        console.warn('Could not send screen:', e);
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

    if (state.handRaised && state.dataChannel && state.dataChannel.readyState === 'open') {
        state.dataChannel.send(JSON.stringify({
            type: 'hand_raised'
        }));
    }
    
    if (state.handRaised) {
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

        if (state.peerConnection) {
            state.peerConnection.close();
            state.peerConnection = null;
        }

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
        await setupSignalingChannel();
        await setupWebRTC(state.isHost);
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
        if (DOM.classTimer) DOM.classTimer.textContent = mins + ':' + secs;
    }, 1000);
}

function setupUI() {
    if (state.isHost) {
        if (DOM.hostControls) DOM.hostControls.style.display = 'flex';
        if (DOM.viewerControls) DOM.viewerControls.style.display = 'none';
    } else {
        if (DOM.hostControls) DOM.hostControls.style.display = 'none';
        if (DOM.viewerControls) DOM.viewerControls.style.display = 'flex';
    }
}

function setupEventListeners() {
    document.getElementById('backBtn').addEventListener('click', leaveRoom);
    document.getElementById('leaveBtn').addEventListener('click', leaveRoom);
    document.getElementById('endSessionBtn').addEventListener('click', endSession);
    document.getElementById('raiseHandBtn').addEventListener('click', toggleRaiseHand);
    
    document.getElementById('tipHeart').addEventListener('click', function() { sendTip(200, '❤️'); });
    document.getElementById('tipStar').addEventListener('click', function() { sendTip(500, '⭐'); });
    document.getElementById('tipHaha').addEventListener('click', function() { sendTip(1250, '😂'); });
    
    document.getElementById('chatToggleBtn').addEventListener('click', toggleChatSidebar);
    document.getElementById('closeChatBtn').addEventListener('click', toggleChatSidebar);
    document.getElementById('shareBtn').addEventListener('click', function() {
        if (DOM.shareModal) DOM.shareModal.classList.add('active');
    });
    document.getElementById('closeShareModal').addEventListener('click', function() {
        if (DOM.shareModal) DOM.shareModal.classList.remove('active');
    });
    document.getElementById('shareToChatBtn').addEventListener('click', shareToChat);
    document.getElementById('copyLinkBtn').addEventListener('click', copyShareLink);
    document.getElementById('returnBtn').addEventListener('click', function() {
        window.location.href = '/user';
    });

    DOM.screenBtn.addEventListener('click', toggleScreenShare);
    DOM.micBtn.addEventListener('click', toggleMicrophone);

    document.querySelectorAll('.modal-overlay').forEach(function(modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.classList.remove('active');
        });
    });

    window.addEventListener('beforeunload', function() {
        if (state.sessionId && !state.sessionEnded) {
            saveSessionState();
        }
    });
}

function toggleMicrophone() {
    if (!state.audioStream) return;
    var track = state.audioStream.getAudioTracks()[0];
    if (!track) return;
    state.isMuted = !track.enabled;
    track.enabled = !track.enabled;
    DOM.micBtn.classList.toggle('active', !state.isMuted);
    showToast(state.isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
}

function toggleChatSidebar() {
    if (DOM.chatSidebar) DOM.chatSidebar.classList.toggle('open');
}

function showLoginScreen() {
    var container = document.querySelector('.virtual-room');
    if (container) {
        container.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;padding:40px;background:var(--bg-primary);">' +
            '<i class="fas fa-sign-in-alt" style="font-size:64px;color:var(--danger);margin-bottom:20px;"></i>' +
            '<h2>Sign In Required</h2>' +
            '<p style="color:var(--text-secondary);margin-bottom:24px;">Please sign in to access the virtual room.</p>' +
            '<button onclick="window.location.href=\'/signin.html\'" class="primary-btn">Sign In</button>' +
            '</div>';
    }
}

function showSessionSelection() {
    if (DOM.loadingText) DOM.loadingText.textContent = 'Start or Join a Session';
    if (DOM.loadingSubText) DOM.loadingSubText.textContent = 'Create your own session or join with a code';
    
    var spinner = DOM.loadingOverlay.querySelector('.loading-spinner');
    if (spinner) spinner.style.display = 'none';

    if (DOM.loadingOverlay) {
        DOM.loadingOverlay.innerHTML += '<div style="display:flex;flex-direction:column;gap:12px;margin-top:12px;width:100%;max-width:320px;">' +
            '<button onclick="window.location.href=\'?mode=host\'" class="primary-btn" style="width:100%;">' +
            '<i class="fas fa-desktop"></i> Go Live (Share Screen)' +
            '</button>' +
            '<div style="display:flex;gap:8px;width:100%;">' +
            '<input type="text" id="sessionCodeInput" placeholder="Enter session code" style="flex:1;padding:10px 14px;border-radius:12px;border:2px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-family:inherit;">' +
            '<button onclick="handleJoinWithCode()" class="primary-btn" style="flex-shrink:0;">' +
            '<i class="fas fa-sign-in-alt"></i> Join' +
            '</button>' +
            '</div></div>';
    }

    window.handleJoinWithCode = function() {
        var code = document.getElementById('sessionCodeInput').value.trim();
        if (code) {
            window.location.href = '?code=' + code;
        } else {
            showToast('Enter a session code', 'warning');
        }
    };
}

async function shareToChat() {
    if (!state.sessionCode) {
        showToast('No session code', 'warning');
        return;
    }
    var message = '🎥 Join my live session! Code: **' + state.sessionCode + '**\n' + window.location.origin + '/virtualroom.html?code=' + state.sessionCode;
    sendToChatIframe({ type: 'send_message', message: message });
    showToast('📤 Session code sent to chat!', 'success');
    if (DOM.shareModal) DOM.shareModal.classList.remove('active');
}

async function copyShareLink() {
    var link = DOM.shareLinkInput ? DOM.shareLinkInput.value : '';
    if (!link) return;
    try {
        await navigator.clipboard.writeText(link);
        showToast('📋 Link copied!', 'success');
    } catch {
        if (DOM.shareLinkInput) {
            DOM.shareLinkInput.select();
            document.execCommand('copy');
            showToast('📋 Link copied!', 'success');
        }
    }
}

function cleanup() {
    if (state.screenStream) {
        state.screenStream.getTracks().forEach(function(t) { t.stop(); });
        state.screenStream = null;
    }
    if (state.audioStream) {
        state.audioStream.getTracks().forEach(function(t) { t.stop(); });
        state.audioStream = null;
    }
    if (state.peerConnection) {
        state.peerConnection.close();
        state.peerConnection = null;
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
    if (state.signalingSubscription) {
        state.signalingSubscription.unsubscribe();
        state.signalingSubscription = null;
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
            .then(function() {});
    }

    sessionStorage.removeItem('glimu_session');
    window.location.href = '/user';
}

window.leaveRoom = leaveRoom;
window.toggleChatSidebar = toggleChatSidebar;
window.handleJoinWithCode = window.handleJoinWithCode;

console.log('Virtual Room loaded - WebRTC with Alternative TURN Servers');
