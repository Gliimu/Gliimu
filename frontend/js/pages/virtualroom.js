// ============================================
// 🎥 VIRTUAL ROOM - SIMPLIFIED + SCREEN SHARE
// Network Resilient with Screen Sharing
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
    screenStream: null,
    isScreenSharing: false,
    participants: [],
    viewerCount: 0,
    handRaised: false,
    isMuted: false,
    isCameraOff: false,
    chatIframeReady: false,
    unreadCount: 0,
    starRating: 0,
    hasRated: false,
    sessionSubscription: null,
    timerInterval: null,
    classStartTime: Date.now(),
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
    DOM.shareCodeDisplay = document.getElementById('shareCodeDisplay');
    DOM.shareLinkInput = document.getElementById('shareLinkInput');
    DOM.viewerControls = document.getElementById('viewerControls');
    DOM.hostControls = document.getElementById('hostControls');
}

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎥 Virtual Room initializing...');
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
        DOM.shareCodeDisplay.textContent = state.sessionCode;
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

        // Start camera
        await startLocalStream();

        showToast(`Session created! Code: ${state.sessionCode}`, 'success');
        setTimeout(() => DOM.shareModal.classList.add('active'), 1500);

        // Update chat iframe
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
        showToast('Failed to create session', 'error');
        useFallbackMode();
    }
}

async function joinSession(sessionCode) {
    try {
        showLoading(true);
        DOM.loadingText.textContent = 'Joining session...';

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
        DOM.shareCodeDisplay.textContent = state.sessionCode;
        DOM.shareLinkInput.value = `${window.location.origin}/virtualroom.html?code=${state.sessionCode}`;

        // Add viewer
        await supabase
            .from('session_participants')
            .upsert({
                session_id: state.sessionId,
                user_id: state.currentUser.id,
                role: 'viewer',
                is_active: true
            }, { onConflict: 'session_id,user_id' });

        DOM.hostControls.style.display = 'none';
        DOM.viewerControls.style.display = 'flex';

        await startLocalStream();
        await loadParticipants();

        // Update chat iframe
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

// ============================================
// CAMERA / MIC
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

        console.log('🎥 Camera started');

    } catch (err) {
        console.error('❌ Camera error:', err);
        // Don't show error if it's just "Device in use" - user might be using camera elsewhere
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
    showToast(state.isMuted ? 'Muted' : 'Unmuted', 'info');
}

function toggleCamera() {
    if (!state.localStream) return;
    const track = state.localStream.getVideoTracks()[0];
    if (!track) return;
    state.isCameraOff = !track.enabled;
    track.enabled = !track.enabled;
    DOM.pipVideo.classList.toggle('camera-off', state.isCameraOff);
    showToast(state.isCameraOff ? 'Camera off' : 'Camera on', 'info');
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
            state.screenStream.getTracks().forEach(t => t.stop());
            state.screenStream = null;
        }
        state.isScreenSharing = false;
        document.getElementById('screenBtn').classList.remove('active');
        showToast('Screen share stopped', 'info');
        
        // Switch back to camera
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

        // Show screen on host video
        DOM.hostVideo.srcObject = state.screenStream;
        DOM.hostStatusText.textContent = 'Screen sharing';

        // When user stops sharing via browser UI
        state.screenStream.getVideoTracks()[0].onended = () => {
            if (state.isScreenSharing) {
                toggleScreenShare();
            }
        };

    } catch (err) {
        console.error('Screen share error:', err);
        if (err.name !== 'AbortError') {
            showToast('Screen share cancelled or failed', 'warning');
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

        state.participants = data || [];
        const viewers = data.filter(p => p.role !== 'host');
        state.viewerCount = viewers.length;
        DOM.viewerCount.textContent = viewers.length;

        // Update host name
        const host = data.find(p => p.role === 'host');
        if (host) {
            DOM.hostName.textContent = host.users?.name || 'Host';
        }

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
// TIP / STAR
// ============================================

async function sendTip(amount, currency) {
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
        const userGP = state.userProfile.gp_points || 0;

        if (currency === 'wallet' && amount > userBalance) {
            showToast('Insufficient wallet balance', 'error');
            return;
        }
        if (currency === 'gp' && amount > userGP) {
            showToast('Insufficient GP points', 'error');
            return;
        }

        const newBalance = currency === 'wallet' ? userBalance - amount : userBalance;
        const newGP = currency === 'gp' ? userGP - amount : userGP;

        await supabase
            .from('users')
            .update({ wallet_balance: newBalance, gp_points: newGP })
            .eq('id', state.currentUser.id);

        await supabase
            .from('session_tips')
            .insert({
                session_id: state.sessionId,
                from_user: state.currentUser.id,
                to_host: session.host_id,
                amount: currency === 'wallet' ? amount : 0,
                gp_amount: currency === 'gp' ? amount : 0
            });

        state.userProfile.wallet_balance = newBalance;
        state.userProfile.gp_points = newGP;

        showToast(`Tip sent! ${amount} ${currency === 'wallet' ? '₦' : 'GP'}`, 'success');
        DOM.tipModal.classList.remove('active');

        sendToChatIframe({
            type: 'system_message',
            message: `🎁 ${state.userProfile.name || 'Someone'} sent a tip!`
        });

    } catch (error) {
        console.error('❌ Tip error:', error);
        showToast('Failed to send tip', 'error');
    }
}

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

    state.sessionSubscription = supabase
        .channel(`session_${state.sessionId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'session_participants',
            filter: `session_id=eq.${state.sessionId}`
        }, () => {
            loadParticipants();
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'virtual_sessions',
            filter: `id=eq.${state.sessionId}`
        }, (payload) => {
            if (payload.new.status === 'ended') {
                state.sessionEnded = true;
                DOM.sessionEndedOverlay.classList.add('active');
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

async function copySessionCode() {
    if (!state.sessionCode) return;
    try {
        await navigator.clipboard.writeText(state.sessionCode);
        showToast('📋 Code copied!', 'success');
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = state.sessionCode;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('📋 Code copied!', 'success');
    }
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
// UI HELPERS
// ============================================

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
    document.getElementById('copyCodeBtn')?.addEventListener('click', copySessionCode);
    document.getElementById('copyLinkBtn')?.addEventListener('click', copyShareLink);
    document.getElementById('returnBtn')?.addEventListener('click', () => window.location.href = '/user');
    document.getElementById('sendCustomTip')?.addEventListener('click', () => {
        const amount = parseInt(prompt('Enter amount:'));
        if (amount > 0) {
            const currency = confirm('Wallet (OK) or GP (Cancel)') ? 'wallet' : 'gp';
            sendTip(amount, currency);
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
}

function toggleChatSidebar() {
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

function useFallbackMode() {
    showLoading(false);
    DOM.hostStatusText.textContent = 'Chat-only mode';
    showToast('⚠️ Connected in chat-only mode', 'warning');
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
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
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

    window.location.href = '/user';
}

// ============================================
// EXPOSE
// ============================================

window.leaveRoom = leaveRoom;
window.joinWithCode = window.joinWithCode;
window.toggleChatSidebar = toggleChatSidebar;

console.log('🎥 Virtual Room loaded');
