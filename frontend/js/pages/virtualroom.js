// ============================================
// 🎥 VIRTUAL ROOM - DAILY.CO COMPLETE
// Branded, Professional, Free Tier
// ============================================

import { supabase, getCurrentUser, getUserProfile } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// DAILY.CO CONFIG
// ============================================

const DAILY_CONFIG = {
    apiKey: 'f228794009453b48e6d462ec87184d988091839da36487abd378b1df094a6ffd',
    domain: 'gliimu.daily.co',
};

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
    starRating: 0,
    hasRated: false,
    dailyCallFrame: null,
    dailyInitialized: false,
    isConnecting: false,
};

// ============================================
// DOM REFS
// ============================================

const DOM = {};

function cacheDOM() {
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
    DOM.loadingOverlay = document.getElementById('loadingOverlay');
    DOM.loadingText = document.getElementById('loadingText');
    DOM.loadingSubText = document.getElementById('loadingSubText');
    DOM.liveStatus = document.getElementById('liveStatus');
    DOM.liveDot = document.getElementById('liveDot');
    DOM.videoOverlay = document.getElementById('videoOverlay');
    DOM.waitingText = document.getElementById('waitingText');
    DOM.waitingSubText = document.getElementById('waitingSubText');
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

        // Check saved session
        const savedSession = sessionStorage.getItem('glimu_session');
        if (savedSession && !sessionCode && !mode) {
            try {
                const sessionData = JSON.parse(savedSession);
                if (sessionData.sessionId) {
                    console.log('🔄 Found saved session, recovering...');
                    await recoverSession(sessionData);
                    return;
                }
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

        console.log('✅ Virtual Room ready');
        showLoading(false);

    } catch (error) {
        console.error('❌ Init error:', error);
        showToast('Failed to initialize: ' + error.message, 'error');
        showLoading(false);
    }
});

// ============================================
// SESSION MANAGEMENT
// ============================================

async function createNewSession() {
    try {
        showLoading(true);
        DOM.loadingText.textContent = 'Creating session...';

        sessionStorage.removeItem('glimu_session');

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

        DOM.roomTitle.textContent = session.title;
        DOM.shareLinkInput.value = `${window.location.origin}/virtualroom.html?code=${state.sessionCode}`;
        DOM.hostControls.style.display = 'flex';
        DOM.viewerControls.style.display = 'none';
        DOM.waitingText.textContent = 'Starting your session...';
        DOM.waitingSubText.textContent = 'Video will start shortly';

        await supabase
            .from('session_participants')
            .insert({
                session_id: state.sessionId,
                user_id: state.currentUser.id,
                role: 'host',
                is_active: true,
                last_seen: new Date().toISOString()
            });

        // Initialize Daily.co video
        await initDailyVideo(true);

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
    }
}

async function joinSession(sessionCode) {
    try {
        showLoading(true);
        DOM.loadingText.textContent = 'Joining session...';

        sessionStorage.removeItem('glimu_session');

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

        DOM.roomTitle.textContent = session.title || 'Live Session';
        DOM.shareLinkInput.value = `${window.location.origin}/virtualroom.html?code=${state.sessionCode}`;
        DOM.hostControls.style.display = 'none';
        DOM.viewerControls.style.display = 'flex';
        DOM.waitingText.textContent = 'Waiting for host...';
        DOM.waitingSubText.textContent = 'The session will begin shortly';

        await supabase
            .from('session_participants')
            .upsert({
                session_id: state.sessionId,
                user_id: state.currentUser.id,
                role: 'viewer',
                is_active: true,
                last_seen: new Date().toISOString()
            }, { onConflict: 'session_id,user_id' });

        // Initialize Daily.co video
        await initDailyVideo(false);

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
    }
}

// ============================================
// DAILY.CO VIDEO INTEGRATION
// ============================================

async function initDailyVideo(isHost) {
    if (state.dailyInitialized) {
        console.log('📹 Daily already initialized');
        return;
    }

    try {
        state.isConnecting = true;
        console.log('📹 Initializing Daily.co video...');

        // Load Daily.co script
        if (!document.querySelector('#daily-js')) {
            const script = document.createElement('script');
            script.id = 'daily-js';
            script.src = 'https://unpkg.com/@daily-co/daily-js@0.48.0/daily-js.min.js';
            document.head.appendChild(script);
            
            await new Promise((resolve) => {
                script.onload = resolve;
                script.onerror = () => {
                    console.error('Failed to load Daily.co script');
                    resolve();
                };
                setTimeout(resolve, 10000);
            });
        }

        // Check if Daily is available
        if (typeof Daily === 'undefined') {
            console.error('Daily.co script not loaded');
            showToast('Video service loading, please wait...', 'warning');
            // Retry after delay
            setTimeout(() => initDailyVideo(isHost), 2000);
            return;
        }

        const roomName = `glimu-${state.sessionCode}`;
        console.log('📹 Creating Daily.co room:', roomName);

        // Create the call frame
        state.dailyCallFrame = Daily.createCallFrame({
            iframeContainer: DOM.dailyFrameContainer,
            dailyConfig: {
                apiKey: DAILY_CONFIG.apiKey,
                roomName: roomName,
                maxParticipants: 12,
                videoCodec: 'VP8',
                // Custom branding
                branding: {
                    logoUrl: '/icons/logo.png',
                    logoClickUrl: 'https://glimu.com',
                    hideLogo: false,
                    colors: {
                        accent: '#fbb040',
                        accentText: '#1a1a2e',
                        background: '#0a0a14',
                        backgroundAccent: '#1a1a2e'
                    }
                },
                // UI controls
                showParticipantsBar: true,
                showLocalVideo: true,
                showLeaveButton: false, // We handle leave ourselves
                showFullscreenButton: true,
                showRecordingButton: false,
                showScreenshareButton: true,
                showChat: true,
                showSettingsButton: true,
                // Start settings
                startAudioOff: false,
                startVideoOff: false,
                startWithDeviceAudio: true,
                startWithDeviceVideo: true,
                // Language
                lang: 'en',
                // URL room config
                url: `https://${DAILY_CONFIG.domain}/${roomName}`
            }
        });

        // Event handlers
        state.dailyCallFrame.on('loading', () => {
            console.log('📹 Daily loading...');
            DOM.waitingText.textContent = 'Connecting to video...';
            DOM.waitingSubText.textContent = 'Please wait';
        });

        state.dailyCallFrame.on('loaded', () => {
            console.log('📹 Daily loaded');
        });

        state.dailyCallFrame.on('joined-meeting', () => {
            console.log('📹 Joined Daily meeting!');
            state.dailyInitialized = true;
            state.isConnecting = false;
            DOM.videoOverlay.classList.add('hidden');
            DOM.connectionStatus.textContent = '🟢 Connected';
            DOM.connectionStatus.style.color = '#10b981';
            DOM.hostStatusText.textContent = isHost ? 'You are the host' : 'Connected';
            
            // Notify chat
            sendToChatIframe({
                type: 'system_message',
                message: '📹 Video connected'
            });
            
            showToast('📹 Video connected!', 'success');
        });

        state.dailyCallFrame.on('participant-joined', (e) => {
            console.log('👤 Participant joined:', e.participant);
            const name = e.participant.user_name || 'Someone';
            if (state.isHost) {
                showToast(`👤 ${name} joined the session`, 'info');
            }
            loadParticipants();
        });

        state.dailyCallFrame.on('participant-left', (e) => {
            console.log('👤 Participant left:', e.participant);
            const name = e.participant.user_name || 'Someone';
            if (state.isHost) {
                showToast(`👤 ${name} left the session`, 'info');
            }
            loadParticipants();
        });

        state.dailyCallFrame.on('error', (e) => {
            console.error('❌ Daily error:', e);
            showToast('Video error: ' + (e.errorMsg || 'Unknown error'), 'error');
            state.isConnecting = false;
        });

        state.dailyCallFrame.on('left-meeting', () => {
            console.log('📹 Left Daily meeting');
            state.dailyInitialized = false;
        });

        // Join the meeting
        console.log('📹 Joining Daily meeting...');
        await state.dailyCallFrame.join();

        console.log('✅ Daily.co initialized successfully');

    } catch (error) {
        console.error('❌ Daily.co error:', error);
        showToast('Failed to start video: ' + error.message, 'error');
        state.isConnecting = false;
        DOM.waitingText.textContent = 'Video unavailable';
        DOM.waitingSubText.textContent = 'Using chat only mode';
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
            .update({ 
                is_active: true,
                last_seen: new Date().toISOString()
            })
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

        // Reconnect to Daily
        await initDailyVideo(state.isHost);

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

    } catch (error) {
        console.error('❌ Load participants error:', error);
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

    document.getElementById('raiseHandBtn')?.classList.toggle('active', state.handRaised);
    showToast(state.handRaised ? 'Hand raised! 🙋' : 'Hand lowered', 'info');

    if (state.handRaised) {
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
// SESSION END
// ============================================

async function endSession() {
    if (!state.isHost) {
        showToast('Only hosts can end sessions', 'warning');
        return;
    }

    if (!confirm('End this session?')) return;

    try {
        // Leave Daily meeting
        if (state.dailyCallFrame) {
            try {
                state.dailyCallFrame.leave();
            } catch (e) {
                console.warn('Error leaving Daily:', e);
            }
        }

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
    } else {
        DOM.hostControls.style.display = 'none';
        DOM.viewerControls.style.display = 'flex';
    }
}

function setupEventListeners() {
    document.getElementById('backBtn')?.addEventListener('click', leaveRoom);
    document.getElementById('leaveBtn')?.addEventListener('click', leaveRoom);
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
    if (state.dailyCallFrame) {
        try {
            state.dailyCallFrame.leave();
            state.dailyCallFrame.destroy();
        } catch (e) {}
        state.dailyCallFrame = null;
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
window.toggleChatSidebar = toggleChatSidebar;
window.handleJoinWithCode = window.handleJoinWithCode;

console.log('🎥 Virtual Room loaded with Daily.co');
