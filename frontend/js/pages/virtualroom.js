// ============================================
// VIRTUAL CLASSROOM - COMPLETE
// Go Live + Professional Zoom Feel
// With Tipping, Star Rating, Streak System
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
    viewerCount: 0,
    tipsTotal: 0,
    gpTipsTotal: 0,
    starsCount: 0,
    avgRating: 0,
    totalRatings: 0,
    handRaised: false,
    isMuted: false,
    isCameraOff: false,
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
    DOM.localPlaceholder = document.getElementById('localPlaceholder');
    DOM.videoGrid = document.getElementById('videoGrid');
    DOM.loadingOverlay = document.getElementById('loadingOverlay');
    DOM.loadingText = document.getElementById('loadingText');
    DOM.loadingSubText = document.getElementById('loadingSubText');
    DOM.roomTitle = document.getElementById('roomTitle');
    DOM.classTimer = document.getElementById('classTimer');
    DOM.viewerCount = document.getElementById('viewerCount');
    DOM.tipCount = document.getElementById('tipCount');
    DOM.chatMessages = document.getElementById('chatMessages');
    DOM.chatInput = document.getElementById('chatInput');
    DOM.sendChatBtn = document.getElementById('sendChatBtn');
    DOM.chatSidebar = document.getElementById('chatSidebar');
    DOM.participantsList = document.getElementById('participantsList');
    DOM.whiteboardOverlay = document.getElementById('whiteboardOverlay');
    DOM.wbCanvas = document.getElementById('whiteboardCanvas');
    DOM.tipModal = document.getElementById('tipModal');
    DOM.starModal = document.getElementById('starModal');
    DOM.sessionEndedOverlay = document.getElementById('sessionEndedOverlay');
    DOM.finalStars = document.getElementById('finalStars');
    DOM.finalViewers = document.getElementById('finalViewers');
    DOM.finalTips = document.getElementById('finalTips');
    DOM.userBalance = document.getElementById('userBalance');
    DOM.userGP = document.getElementById('userGP');
    DOM.viewerControls = document.getElementById('viewerControls');
    DOM.hostControls = document.getElementById('hostControls');
    DOM.userRoleLabel = document.getElementById('userRoleLabel');
    DOM.localMicControl = document.getElementById('localMicControl');
    DOM.localCamControl = document.getElementById('localCamControl');
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎥 Virtual Classroom initializing...');
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
        const mode = params.get('mode'); // 'host' or 'join'

        if (mode === 'host') {
            await createNewSession();
        } else if (sessionCode) {
            await joinSession(sessionCode);
        } else {
            // Show session selection
            showSessionSelection();
            return;
        }

        // Setup UI
        setupUI();
        setupEventListeners();
        setupRealtimeSubscriptions();

        // Start timer
        startTimer();

        console.log('✅ Virtual Classroom ready');
        showLoading(false);

    } catch (error) {
        console.error('❌ Initialization error:', error);
        showToast('Failed to initialize classroom', 'error');
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

        // Check if host can create session (streak check)
        const canHost = await checkHostEligibility();
        if (!canHost) {
            showToast('You are on cooldown. Please wait 48 hours.', 'error');
            setTimeout(() => window.location.href = '/dashboard', 2000);
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

        // Update UI for host
        DOM.hostControls.style.display = 'flex';
        DOM.viewerControls.style.display = 'none';
        DOM.userRoleLabel.textContent = 'Host';

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
        showSharePrompt();

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
            setTimeout(() => window.location.href = '/dashboard', 2000);
            return;
        }

        if (session.status === 'ended') {
            showToast('This session has ended', 'error');
            setTimeout(() => window.location.href = '/dashboard', 2000);
            return;
        }

        state.sessionId = session.id;
        state.sessionCode = session.session_code;
        state.isHost = false;
        state.isLive = session.status === 'live';
        DOM.roomTitle.textContent = session.title || 'Live Session';

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
        DOM.userRoleLabel.textContent = 'Viewer';

        // Show local video (viewer can share too)
        DOM.localVideoCard.style.display = 'block';
        await startLocalStream();

        // Initialize PeerJS
        await initPeerJS(false);

        // Load host stream
        await loadHostStream(session.host_id);

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
            });
            call.on('close', () => {
                DOM.hostVideo.parentElement.classList.remove('has-video');
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
    });
}

function handlePeerConnection(conn) {
    console.log('📡 Peer connected:', conn.peer);
}

// ============================================
// STREAM MANAGEMENT
// ============================================

async function startLocalStream() {
    try {
        state.localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            audio: true
        });

        DOM.localVideo.srcObject = state.localStream;
        await DOM.localVideo.play();
        DOM.localVideoCard.style.display = 'block';
        DOM.localVideoCard.classList.add('has-video');

        // Update mic/cam status
        updateLocalControls();

        console.log('🎥 Local stream started');

    } catch (err) {
        console.error('❌ Camera error:', err);
        showToast('Could not access camera/microphone', 'warning');
        DOM.localVideoCard.classList.remove('has-video');
        DOM.localPlaceholder.style.display = 'flex';
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
}

function toggleCamera() {
    if (!state.localStream) return;
    const videoTrack = state.localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    state.isCameraOff = !videoTrack.enabled;
    videoTrack.enabled = !videoTrack.enabled;

    DOM.localVideoCard.classList.toggle('camera-off', state.isCameraOff);
    updateLocalControls();
    showToast(state.isCameraOff ? 'Camera off' : 'Camera on', 'info');
}

function updateLocalControls() {
    const micIcon = DOM.localMicControl?.querySelector('i');
    const camIcon = DOM.localCamControl?.querySelector('i');

    if (micIcon) {
        micIcon.className = state.isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
        DOM.localMicControl.classList.toggle('off', state.isMuted);
    }

    if (camIcon) {
        camIcon.className = state.isCameraOff ? 'fas fa-video-slash' : 'fas fa-video';
        DOM.localCamControl.classList.toggle('off', state.isCameraOff);
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
// CHAT
// ============================================

async function sendChatMessage() {
    const text = DOM.chatInput.value.trim();
    if (!text) return;

    const message = {
        session_id: state.sessionId,
        user_id: state.currentUser.id,
        user_name: state.userProfile.name || 'User',
        message: text,
        created_at: new Date().toISOString()
    };

    try {
        const { error } = await supabase
            .from('session_chat')
            .insert(message);

        if (error) throw error;
        DOM.chatInput.value = '';
    } catch (error) {
        console.error('❌ Send message error:', error);
        // Display locally as fallback
        displayChatMessage(message, true);
    }
}

function displayChatMessage(message, isLocal = false) {
    const isSelf = message.user_id === state.currentUser.id;

    const div = document.createElement('div');
    div.className = `chat-message ${isSelf ? 'self' : 'other'}`;

    if (!isSelf) {
        const sender = document.createElement('div');
        sender.className = 'chat-sender';
        sender.textContent = message.user_name || 'User';
        div.appendChild(sender);
    }

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    const text = document.createElement('div');
    text.textContent = message.message;
    bubble.appendChild(text);

    const time = document.createElement('div');
    time.className = 'chat-time';
    const date = new Date(message.created_at || Date.now());
    time.textContent = date.toLocaleTimeString();
    bubble.appendChild(time);

    div.appendChild(bubble);
    DOM.chatMessages.appendChild(div);
    DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
}

function sendSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.innerHTML = `<i class="fas fa-info-circle"></i> ${text}`;
    DOM.chatMessages.appendChild(div);
    DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
}

// ============================================
// REAL-TIME SUBSCRIPTIONS
// ============================================

function setupRealtimeSubscriptions() {
    if (!state.sessionId) return;

    // Session chat
    const chatChannel = supabase
        .channel(`session_chat_${state.sessionId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'session_chat',
            filter: `session_id=eq.${state.sessionId}`
        }, (payload) => {
            displayChatMessage(payload.new);
        })
        .subscribe();

    // Participants
    const participantsChannel = supabase
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
    const sessionChannel = supabase
        .channel(`session_${state.sessionId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'virtual_sessions',
            filter: `id=eq.${state.sessionId}`
        }, (payload) => {
            handleSessionUpdate(payload.new);
        })
        .subscribe();

    state.chatSubscription = chatChannel;
    state.participantsSubscription = participantsChannel;
    state.sessionSubscription = sessionChannel;
}

// ============================================
// PARTICIPANTS
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
        data.forEach(p => state.participants.set(p.user_id, p));

        DOM.participantsList.innerHTML = data.map(p => `
            <div class="participant-item">
                <div class="participant-avatar">
                    ${p.users?.name?.[0] || 'U'}
                </div>
                <div class="participant-details">
                    <div class="participant-name">${p.users?.name || 'User'} ${p.role === 'host' ? '👑' : ''}</div>
                    <div class="participant-role">${p.role === 'host' ? 'Host' : 'Viewer'}</div>
                </div>
                <div class="participant-status">
                    ${p.hand_raised ? '<i class="fas fa-hand-paper status-icon hand-raised"></i>' : ''}
                </div>
            </div>
        `).join('') || '<p style="text-align:center;color:var(--text-muted);padding:20px;">No participants</p>';

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
    DOM.hostTips.textContent = `₦${state.tipsTotal}`;
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

        // If no streak record, user is eligible
        if (!streak) {
            // Create streak record
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

        // Check if banned
        if (streak.ban_until && new Date(streak.ban_until) > new Date()) {
            const hoursLeft = Math.ceil((new Date(streak.ban_until) - new Date()) / (1000 * 60 * 60));
            showToast(`You're on cooldown. ${hoursLeft} hours remaining.`, 'error');
            return false;
        }

        return true;

    } catch (error) {
        console.error('❌ Check eligibility error:', error);
        return true; // Allow on error
    }
}

async function updateHostStreak(sessionId) {
    try {
        // Get session stats
        const { data: session } = await supabase
            .from('virtual_sessions')
            .select('stars_count, total_ratings, avg_rating, tips_total')
            .eq('id', sessionId)
            .single();

        if (!session) return;

        const avgRating = session.avg_rating || 0;
        const passed = avgRating >= 3.5; // Pass threshold

        // Get current streak
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
            // Ban for 48 hours if streak < 5
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
    });

    canvas.addEventListener('mouseup', () => { state.wbPainting = false; });
    canvas.addEventListener('mouseleave', () => { state.wbPainting = false; });

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

    canvas.addEventListener('touchend', () => { state.wbPainting = false; });

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
        return;
    }

    document.querySelectorAll('.wb-tool').forEach(btn => btn.classList.remove('active'));
    if (tool !== 'clear') {
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
        showToast('Hand raised! 👋', 'success');
        sendSystemMessage(`${state.userProfile.name || 'A viewer'} raised their hand`);
    } else {
        showToast('Hand lowered', 'info');
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
        DOM.userRoleLabel.textContent = 'Host';
        document.getElementById('liveBadge').querySelector('span').textContent = 'LIVE';
    } else {
        DOM.hostControls.style.display = 'none';
        DOM.viewerControls.style.display = 'flex';
        DOM.userRoleLabel.textContent = 'Viewer';
        DOM.localVideoCard.style.display = 'block';
    }

    // Setup star rating
    setupStarRating();

    // Init whiteboard
    initWhiteboard();
}

function setupEventListeners() {
    // Navigation
    document.getElementById('backBtn')?.addEventListener('click', leaveRoom);
    document.getElementById('leaveBtn')?.addEventListener('click', leaveRoom);

    // Media controls
    document.getElementById('micBtn')?.addEventListener('click', toggleMicrophone);
    document.getElementById('camBtn')?.addEventListener('click', toggleCamera);
    DOM.localMicControl?.addEventListener('click', toggleMicrophone);
    DOM.localCamControl?.addEventListener('click', toggleCamera);

    // Host controls
    document.getElementById('screenBtn')?.addEventListener('click', () => {
        showToast('Screen sharing coming soon!', 'info');
    });
    document.getElementById('endSessionBtn')?.addEventListener('click', endSession);
    document.getElementById('whiteboardBtn')?.addEventListener('click', toggleWhiteboard);

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

    // Chat
    DOM.sendChatBtn?.addEventListener('click', sendChatMessage);
    DOM.chatInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });

    // Sidebar
    document.getElementById('viewersBtn')?.addEventListener('click', toggleSidebar);
    document.getElementById('closeChatBtn')?.addEventListener('click', toggleSidebar);

    // Chat tabs
    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabName = tab.dataset.tab;
            DOM.chatMessages.style.display = tabName === 'chat' ? 'flex' : 'none';
            DOM.participantsList.style.display = tabName === 'participants' ? 'flex' : 'none';
            if (tabName === 'participants') loadParticipants();
        });
    });

    // Tip modal
    document.getElementById('closeTipModal')?.addEventListener('click', () => {
        DOM.tipModal.classList.remove('active');
    });
    document.querySelectorAll('.tip-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = parseInt(btn.dataset.amount);
            const currency = btn.classList.contains('wallet') ? 'wallet' : 'gp';
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
        window.location.href = '/dashboard';
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (DOM.tipModal.classList.contains('active')) DOM.tipModal.classList.remove('active');
            if (DOM.starModal.classList.contains('active')) DOM.starModal.classList.remove('active');
            if (DOM.whiteboardOverlay.classList.contains('active')) toggleWhiteboard();
            if (DOM.chatSidebar.classList.contains('open')) toggleSidebar();
        }
        if (e.key === 'm' && e.ctrlKey) {
            e.preventDefault();
            toggleMicrophone();
        }
        if (e.key === 'v' && e.ctrlKey) {
            e.preventDefault();
            toggleCamera();
        }
    });

    // Click outside modals to close
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

function toggleSidebar() {
    DOM.chatSidebar.classList.toggle('open');
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

function showLoginScreen() {
    document.querySelector('.classroom-container').innerHTML = `
        <div class="access-denied" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;padding:40px;">
            <i class="fas fa-sign-in-alt" style="font-size:64px;color:var(--danger);margin-bottom:20px;"></i>
            <h2>Sign In Required</h2>
            <p style="color:var(--text-secondary);margin-bottom:24px;">Please sign in to access the virtual classroom.</p>
            <button onclick="window.location.href='/signin.html'" class="primary-btn">Sign In</button>
        </div>
    `;
}

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

function showSharePrompt() {
    if (state.isHost && state.sessionCode) {
        setTimeout(() => {
            if (confirm(`Session created! Share code: ${state.sessionCode}\n\nCopy to clipboard?`)) {
                navigator.clipboard.writeText(state.sessionCode).then(() => {
                    showToast('Session code copied!', 'success');
                }).catch(() => {});
            }
        }, 1500);
    }
}

function useFallbackMode() {
    showLoading(false);
    sendSystemMessage('⚠️ Connected in chat-only mode. Video may be limited.');
    DOM.hostPlaceholder.style.display = 'flex';
    DOM.hostPlaceholder.querySelector('span').textContent = 'Host connection limited';
}

function cleanup() {
    if (state.localStream) {
        state.localStream.getTracks().forEach(t => t.stop());
    }
    if (state.peer) {
        state.peer.destroy();
    }
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
    }
    if (state.chatSubscription) {
        state.chatSubscription.unsubscribe();
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

    window.location.href = '/dashboard';
}

// ============================================
// EXPOSE GLOBALS
// ============================================

window.toggleSidebar = toggleSidebar;
window.toggleWhiteboard = toggleWhiteboard;
window.setWbTool = setWbTool;
window.setWbColor = setWbColor;
window.leaveRoom = leaveRoom;
window.joinWithCode = window.joinWithCode;

console.log('🎥 Virtual Classroom loaded successfully');
