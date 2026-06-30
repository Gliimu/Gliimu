// ============================================
// 🎥 VIRTUAL ROOM - SCREEN SHARE ONLY
// 100% FREE - No Jitsi, No Video, No Moderator
// Uses PeerJS for screen sharing + Supabase for everything else
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
    participants: new Map(),
    viewerCount: 0,
    handRaised: false,
    chatIframeReady: false,
    unreadCount: 0,
    timerInterval: null,
    classStartTime: Date.now(),
    starRating: 0,
    hasRated: false,
    // Screen share state
    screenStream: null,
    isSharing: false,
    localStream: null, // For audio
    peer: null,
    peerId: null,
    hostPeerId: null,
    isMuted: false,
    // DB
    participantsSubscription: null,
    sessionSubscription: null,
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
    DOM.viewerWaiting = document.getElementById('viewerWaiting');
    DOM.screenBtn = document.getElementById('screenBtn');
    DOM.micBtn = document.getElementById('micBtn');
}

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎥 Virtual Room initializing (Screen Share Only)...');
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

        const savedSession = sessionStorage.getItem('glimu_session');
        if (savedSession && !sessionCode && !mode) {
            try {
                const sessionData = JSON.parse(savedSession);
                const age = Date.now() - (sessionData.timestamp || 0);
                if (sessionData.sessionId && age < 60000) {
                    console.log('🔄 Found recent saved session, recovering...');
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

        console.log('✅ Virtual Room ready (Screen Share Mode)');
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
        if (DOM.loadingText) DOM.loadingText.textContent = 'Starting session...';

        sessionStorage.removeItem('glimu_session');

        const sessionCode = generateSessionCode();
        state.sessionCode = sessionCode;
        state.isHost = true;

        // Update UI
        if (DOM.roomTitle) DOM.roomTitle.textContent = `${state.userProfile.name || 'User'}'s Session`;
        if (DOM.hostControls) DOM.hostControls.style.display = 'flex';
        if (DOM.viewerControls) DOM.viewerControls.style.display = 'none';
        if (DOM.placeholderTitle) DOM.placeholderTitle.textContent = 'Ready to share your screen';
        if (DOM.placeholderText) DOM.placeholderText.textContent = 'Click "Share Screen" to start';

        // Get audio stream for microphone
        await getAudioStream();

        // Initialize PeerJS
        await initPeerJS(true);

        // Save to database
        try {
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

            if (!error && session) {
                state.sessionId = session.id;
                state.isLive = true;
                if (DOM.roomTitle) DOM.roomTitle.textContent = session.title;
                if (DOM.shareLinkInput) DOM.shareLinkInput.value = `${window.location.origin}/virtualroom.html?code=${state.sessionCode}`;
                saveSessionState();
                console.log('✅ Session saved to database:', session.id);
            }
        } catch (dbError) {
            console.warn('⚠️ Database save failed:', dbError);
            showToast('Session started (chat features may be limited)', 'warning');
        }

        if (DOM.shareLinkInput) DOM.shareLinkInput.value = `${window.location.origin}/virtualroom.html?code=${state.sessionCode}`;

        setTimeout(() => {
            sendToChatIframe({
                type: 'session_info',
                sessionId: state.sessionId || 'pending',
                sessionCode: state.sessionCode,
                isHost: state.isHost,
                roomTitle: DOM.roomTitle ? DOM.roomTitle.textContent : 'Session'
            });
        }, 2000);

        showToast(`Session started! Code: ${state.sessionCode}`, 'success');

        setTimeout(() => {
            if (DOM.shareModal) DOM.shareModal.classList.add('active');
        }, 2000);

        console.log('📡 Session started:', sessionCode);

    } catch (error) {
        console.error('❌ Create session error:', error);
        showToast('Failed to start session. Please try again.', 'error');
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

        // Update UI
        if (DOM.roomTitle) DOM.roomTitle.textContent = 'Loading Session...';
        if (DOM.hostControls) DOM.hostControls.style.display = 'none';
        if (DOM.viewerControls) DOM.viewerControls.style.display = 'flex
