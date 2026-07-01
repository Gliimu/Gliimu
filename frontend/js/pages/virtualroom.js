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
    slides: [],
    currentSlideIndex: 0,
    isMuted: false,
    peer: null,
    peerId: null,
    audioStream: null,
    hostPeerId: null,
    audioConnected: false,
    audioFallbackActive: false,
    participantsSubscription: null,
    sessionSubscription: null,
    slideSubscription: null,
    peerTimeout: null,
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
    DOM.shareModal = document.getElementById('shareModal');
    DOM.sessionEndedOverlay = document.getElementById('sessionEndedOverlay');
    DOM.shareLinkInput = document.getElementById('shareLinkInput');
    DOM.loadingOverlay = document.getElementById('loadingOverlay');
    DOM.loadingText = document.getElementById('loadingText');
    DOM.loadingSubText = document.getElementById('loadingSubText');
    DOM.hostControls = document.getElementById('hostControls');
    DOM.viewerControls = document.getElementById('viewerControls');
    DOM.hostName = document.getElementById('hostName');
    DOM.hostStatus = document.getElementById('hostStatus');
    DOM.hostStars = document.getElementById('hostStars');
    DOM.hostTips = document.getElementById('hostTips');
    DOM.currentSlide = document.getElementById('currentSlide');
    DOM.slidePlaceholder = document.getElementById('slidePlaceholder');
    DOM.slideCounter = document.getElementById('slideCounter');
    DOM.slideNav = document.getElementById('slideNav');
    DOM.uploadModal = document.getElementById('uploadModal');
    DOM.uploadArea = document.getElementById('uploadArea');
    DOM.uploadPreview = document.getElementById('uploadPreview');
    DOM.uploadSlidesBtn = document.getElementById('uploadSlidesBtn');
    DOM.slideFileInput = document.getElementById('slideFileInput');
    DOM.micBtn = document.getElementById('micBtn');
    DOM.uploadBtn = document.getElementById('uploadBtn');
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

        setupEventListeners();
        setupChatIframe();
        setupRealtimeSubscriptions();
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
                title: (state.userProfile.name || 'User') + '\'s Presentation',
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
        if (DOM.hostName) DOM.hostName.textContent = state.userProfile.name || 'Host';
        
        // 🔥 Hide upload button from viewers (only host sees it)
        if (DOM.uploadBtn) DOM.uploadBtn.style.display = 'flex';

        // Set share link
        if (DOM.shareLinkInput) {
            DOM.shareLinkInput.value = window.location.origin + '/virtualroom.html?code=' + state.sessionCode;
        }

        // Start audio
        await initAudio(true);

        // Load existing slides
        await loadSlides();

        // Listen for slide changes
        setupSlideSubscription();

        saveSessionState();

        setTimeout(function() {
            if (DOM.shareModal) DOM.shareModal.classList.add('active');
        }, 2000);

        showToast('Session started! Code: ' + state.sessionCode, 'success');

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

        if (DOM.roomTitle) DOM.roomTitle.textContent = session.title || 'Live Presentation';
        if (DOM.hostControls) DOM.hostControls.style.display = 'none';
        if (DOM.viewerControls) DOM.viewerControls.style.display = 'flex';
        
        // 🔥 Hide upload button from viewers
        if (DOM.uploadBtn) DOM.uploadBtn.style.display = 'none';

        // Set share link
        if (DOM.shareLinkInput) {
            DOM.shareLinkInput.value = window.location.origin + '/virtualroom.html?code=' + state.sessionCode;
        }

        // Get host name
        var { data: host } = await supabase
            .from('session_participants')
            .select('users(name)')
            .eq('session_id', state.sessionId)
            .eq('role', 'host')
            .single();

        if (host?.users) {
            if (DOM.hostName) DOM.hostName.textContent = host.users.name || 'Host';
        }

        // Start audio
        await initAudio(false);

        // Load slides
        await loadSlides();

        // Listen for slide changes
        setupSlideSubscription();

        saveSessionState();

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
// AUDIO (PeerJS with Fallback)
// ============================================

async function initAudio(isHost) {
    try {
        state.audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false
        });
        console.log('✅ Audio stream acquired');

        var peerId = 'glimu_' + state.currentUser.id + '_' + Date.now();

        state.peer = new Peer(peerId, {
            host: '0.peerjs.com',
            port: 443,
            path: '/',
            secure: true,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ]
            }
        });

        state.peerTimeout = setTimeout(function() {
            if (state.peer && !state.peer.open) {
                console.warn('PeerJS timeout, using fallback');
                useAudioFallback(isHost);
            }
        }, 15000);

        state.peer.on('open', async function(id) {
            clearTimeout(state.peerTimeout);
            state.peerId = id;
            console.log('✅ PeerJS connected:', id);

            await supabase
                .from('session_participants')
                .update({ peer_id: id })
                .eq('session_id', state.sessionId)
                .eq('user_id', state.currentUser.id);

            if (isHost) {
                state.peer.on('call', handleIncomingCall);
                console.log('Host waiting for audio connections...');
                if (DOM.hostStatus) DOM.hostStatus.textContent = '🎙️ Audio ready';
            } else {
                setTimeout(function() {
                    connectToHostAudio();
                }, 2000);
            }
        });

        state.peer.on('error', function(err) {
            clearTimeout(state.peerTimeout);
            console.error('PeerJS error:', err.message);
            if (!state.audioFallbackActive) {
                useAudioFallback(isHost);
            }
        });

        state.peer.on('disconnected', function() {
            console.warn('PeerJS disconnected');
            if (!state.audioFallbackActive) {
                state.peer.reconnect();
            }
        });

    } catch (err) {
        console.warn('Could not get audio:', err);
        useAudioFallback(false);
    }
}

function useAudioFallback(isHost) {
    if (state.audioFallbackActive) return;
    state.audioFallbackActive = true;
    
    console.log('Using audio fallback - chat only');
    showToast('Audio unavailable. Using chat only.', 'warning');
    
    if (DOM.hostStatus) {
        DOM.hostStatus.textContent = '🎙️ Audio unavailable';
        DOM.hostStatus.style.color = '#f59e0b';
    }
}

async function connectToHostAudio() {
    if (state.audioFallbackActive || state.audioConnected) return;
    
    try {
        var { data: host, error } = await supabase
            .from('session_participants')
            .select('peer_id')
            .eq('session_id', state.sessionId)
            .eq('role', 'host')
            .single();

        if (error || !host || !host.peer_id) {
            setTimeout(connectToHostAudio, 3000);
            return;
        }

        state.hostPeerId = host.peer_id;
        console.log('Calling host for audio...');

        var call = state.peer.call(state.hostPeerId, state.audioStream);
        call.on('stream', function(remoteStream) {
            console.log('✅ Host audio stream received!');
            state.audioConnected = true;
            if (DOM.hostStatus) {
                DOM.hostStatus.textContent = '🎙️ Audio connected';
                DOM.hostStatus.style.color = '#10b981';
            }
            showToast('🎙️ Audio connected!', 'success');
        });
        call.on('close', function() {
            console.log('Host audio disconnected');
            state.audioConnected = false;
            if (DOM.hostStatus) {
                DOM.hostStatus.textContent = '🎙️ Reconnecting...';
                DOM.hostStatus.style.color = '#f59e0b';
            }
            setTimeout(connectToHostAudio, 5000);
        });

    } catch (error) {
        console.error('Connect to host error:', error);
        setTimeout(connectToHostAudio, 3000);
    }
}

function handleIncomingCall(call) {
    console.log('Incoming audio call from:', call.peer);
    call.answer(state.audioStream);
    call.on('stream', function(remoteStream) {
        console.log('Viewer audio stream received');
    });
}

function toggleMicrophone() {
    if (!state.audioStream) return;
    var track = state.audioStream.getAudioTracks()[0];
    if (!track) return;
    state.isMuted = !track.enabled;
    track.enabled = !track.enabled;
    if (DOM.micBtn) DOM.micBtn.classList.toggle('off', state.isMuted);
    showToast(state.isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
}

// ============================================
// SLIDE MANAGEMENT
// ============================================

function setupSlideSubscription() {
    if (state.slideSubscription) {
        state.slideSubscription.unsubscribe();
        state.slideSubscription = null;
    }

    if (!state.sessionId) return;

    state.slideSubscription = supabase
        .channel('slides_' + state.sessionId)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'session_slides',
            filter: 'session_id=eq.' + state.sessionId
        }, function(payload) {
            console.log('New slide inserted:', payload.new);
            state.slides.push(payload.new);
            if (state.slides.length === 1) {
                showSlide(0);
            }
            updateUI();
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'session_slides',
            filter: 'session_id=eq.' + state.sessionId
        }, function(payload) {
            console.log('Slide updated:', payload.new);
            if (payload.new.is_current) {
                var index = state.slides.findIndex(function(s) { return s.id === payload.new.id; });
                if (index !== -1) {
                    state.currentSlideIndex = index;
                    showSlide(index);
                }
            }
        })
        .subscribe();
}

async function loadSlides() {
    try {
        if (!state.sessionId) return;
        
        var { data: slides, error } = await supabase
            .from('session_slides')
            .select('*')
            .eq('session_id', state.sessionId)
            .order('order', { ascending: true });

        if (error) {
            console.warn('Load slides error:', error);
            return;
        }

        state.slides = slides || [];
        console.log('Loaded ' + state.slides.length + ' slides');

        if (state.slides.length > 0) {
            var currentIndex = state.slides.findIndex(function(s) { return s.is_current; });
            state.currentSlideIndex = currentIndex !== -1 ? currentIndex : 0;
            showSlide(state.currentSlideIndex);
        } else {
            DOM.currentSlide.style.display = 'none';
            DOM.slidePlaceholder.style.display = 'flex';
            DOM.slideCounter.textContent = '0 / 0';
            DOM.slideNav.style.display = 'none';
        }
        updateUI();
    } catch (error) {
        console.error('Load slides error:', error);
    }
}

function showSlide(index) {
    if (!state.slides.length || index < 0 || index >= state.slides.length) {
        return;
    }

    var slide = state.slides[index];
    DOM.currentSlide.src = slide.image_url + '?t=' + Date.now();
    DOM.currentSlide.style.display = 'block';
    DOM.slidePlaceholder.style.display = 'none';
    DOM.slideNav.style.display = 'flex';
    DOM.slideCounter.textContent = (index + 1) + ' / ' + state.slides.length;

    if (state.isHost) {
        supabase
            .from('session_slides')
            .update({ is_current: false })
            .eq('session_id', state.sessionId)
            .then(function() {
                supabase
                    .from('session_slides')
                    .update({ is_current: true })
                    .eq('id', slide.id)
                    .then(function() {});
            });
    }
}

function nextSlide() {
    if (state.currentSlideIndex < state.slides.length - 1) {
        state.currentSlideIndex++;
        showSlide(state.currentSlideIndex);
    }
}

function prevSlide() {
    if (state.currentSlideIndex > 0) {
        state.currentSlideIndex--;
        showSlide(state.currentSlideIndex);
    }
}

function updateUI() {
    if (state.slides.length > 0) {
        DOM.slideNav.style.display = 'flex';
    } else {
        DOM.slideNav.style.display = 'none';
        if (!DOM.currentSlide.src) {
            DOM.currentSlide.style.display = 'none';
            DOM.slidePlaceholder.style.display = 'flex';
            DOM.slideCounter.textContent = '0 / 0';
        }
    }
}

// ============================================
// SLIDE UPLOAD
// ============================================

function openUploadModal() {
    if (!state.isHost) {
        showToast('Only hosts can upload slides', 'warning');
        return;
    }
    DOM.uploadModal.classList.add('active');
    DOM.uploadPreview.innerHTML = '';
    DOM.uploadSlidesBtn.style.display = 'none';
    DOM.slideFileInput.value = '';
}

function handleFileSelect(files) {
    var fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    var previewHtml = '';
    
    fileArray.forEach(function(file, index) {
        var reader = new FileReader();
        reader.onload = function(e) {
            previewHtml += '<div class="preview-item" data-index="' + index + '">' +
                '<img src="' + e.target.result + '">' +
                '<button class="remove-item" data-index="' + index + '">×</button>' +
                '</div>';
            DOM.uploadPreview.innerHTML = previewHtml;
            DOM.uploadSlidesBtn.style.display = 'block';
        };
        reader.readAsDataURL(file);
    });
}

async function uploadSlides() {
    var files = DOM.slideFileInput.files;
    if (!files || files.length === 0) {
        showToast('Select images to upload', 'warning');
        return;
    }

    showLoading(true);
    if (DOM.loadingText) DOM.loadingText.textContent = 'Uploading slides...';

    var uploaded = 0;
    var failed = 0;

    try {
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            var ext = file.name.split('.').pop() || 'png';
            var path = 'slides/' + state.sessionId + '/' + Date.now() + '_' + i + '.' + ext;

            var { error: uploadError } = await supabase.storage
                .from('presentation-files')
                .upload(path, file, {
                    cacheControl: 'public, max-age=31536000',
                    upsert: false
                });

            if (uploadError) {
                console.error('Upload error for ' + file.name + ':', uploadError);
                failed++;
                showToast('Failed to upload: ' + file.name, 'error');
                continue;
            }

            var { data: { publicUrl } } = supabase.storage
                .from('presentation-files')
                .getPublicUrl(path);

            var isFirst = i === 0 && state.slides.length === 0;

            var { error: insertError } = await supabase
                .from('session_slides')
                .insert({
                    session_id: state.sessionId,
                    image_url: publicUrl,
                    is_current: isFirst,
                    order: state.slides.length + i
                });

            if (insertError) {
                console.error('Insert error:', insertError);
                failed++;
                await supabase.storage
                    .from('presentation-files')
                    .remove([path]);
                continue;
            }

            uploaded++;
        }

        if (uploaded > 0) {
            showToast(uploaded + ' slide(s) uploaded successfully!', 'success');
            DOM.uploadModal.classList.remove('active');
            DOM.slideFileInput.value = '';
            DOM.uploadPreview.innerHTML = '';
            DOM.uploadSlidesBtn.style.display = 'none';
            await loadSlides();
        } else if (failed > 0 && uploaded === 0) {
            showToast('Failed to upload slides. Check permissions.', 'error');
        }

    } catch (error) {
        console.error('Upload slides error:', error);
        showToast('Failed to upload slides: ' + error.message, 'error');
    } finally {
        showLoading(false);
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

    var btn = document.getElementById('raiseHandBtn');
    if (btn) btn.classList.toggle('active', state.handRaised);
    showToast(state.handRaised ? 'Hand raised! 🙋' : 'Hand lowered', 'info');

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

        updateHostStats();

    } catch (error) {
        console.error('Tip error:', error);
        showToast('Failed to send tip', 'error');
    }
}

async function updateHostStats() {
    try {
        var { data: session } = await supabase
            .from('virtual_sessions')
            .select('tips_total')
            .eq('id', state.sessionId)
            .single();

        if (session && DOM.hostTips) {
            DOM.hostTips.textContent = '₦' + (session.tips_total || 0);
        }
    } catch (e) {}
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
        if (state.peer) {
            state.peer.destroy();
            state.peer = null;
        }

        if (state.audioStream) {
            state.audioStream.getTracks().forEach(function(t) { t.stop(); });
            state.audioStream = null;
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

        if (DOM.roomTitle) DOM.roomTitle.textContent = session.title || 'Live Presentation';

        await supabase
            .from('session_participants')
            .update({ is_active: true, last_seen: new Date().toISOString() })
            .eq('session_id', state.sessionId)
            .eq('user_id', state.currentUser.id);

        if (state.isHost) {
            if (DOM.hostControls) DOM.hostControls.style.display = 'flex';
            if (DOM.viewerControls) DOM.viewerControls.style.display = 'none';
        } else {
            if (DOM.hostControls) DOM.hostControls.style.display = 'none';
            if (DOM.viewerControls) DOM.viewerControls.style.display = 'flex';
        }

        await initAudio(state.isHost);
        await loadSlides();
        setupSlideSubscription();
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

        var host = data.find(function(p) { return p.role === 'host'; });
        if (host && DOM.hostName) DOM.hostName.textContent = host.name || 'Host';

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
// SHARE FUNCTIONS
// ============================================

async function shareToChat() {
    if (!state.sessionCode) {
        showToast('No session code to share', 'warning');
        return;
    }
    
    var message = '📊 Join my live presentation! Code: **' + state.sessionCode + '**\n' + window.location.origin + '/virtualroom.html?code=' + state.sessionCode;
    
    console.log('📤 Sending to chat:', message);
    
    sendToChatIframe({ 
        type: 'send_message', 
        message: message 
    });
    
    showToast('📤 Session code sent to chat!', 'success');
    
    if (DOM.shareModal) {
        DOM.shareModal.classList.remove('active');
    }
}

async function copyShareLink() {
    var link = DOM.shareLinkInput ? DOM.shareLinkInput.value : '';
    if (!link) {
        showToast('No link to copy', 'warning');
        return;
    }
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

function setupEventListeners() {
    // Navigation
    document.getElementById('backBtn').addEventListener('click', leaveRoom);
    document.getElementById('leaveBtn').addEventListener('click', leaveRoom);
    document.getElementById('endSessionBtn').addEventListener('click', endSession);

    // Slide controls
    document.getElementById('nextSlideBtn').addEventListener('click', nextSlide);
    document.getElementById('prevSlideBtn').addEventListener('click', prevSlide);
    document.getElementById('nextSlide').addEventListener('click', nextSlide);
    document.getElementById('prevSlide').addEventListener('click', prevSlide);

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && !e.target.closest('input')) {
            e.preventDefault();
            nextSlide();
        } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && !e.target.closest('input')) {
            e.preventDefault();
            prevSlide();
        }
    });

    // Upload
    document.getElementById('uploadBtn').addEventListener('click', openUploadModal);
    document.getElementById('closeUploadModal').addEventListener('click', function() {
        DOM.uploadModal.classList.remove('active');
    });
    
    if (DOM.uploadArea) {
        DOM.uploadArea.addEventListener('click', function() {
            DOM.slideFileInput.click();
        });
    }
    
    DOM.slideFileInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            handleFileSelect(this.files);
        }
    });
    
    DOM.uploadSlidesBtn.addEventListener('click', uploadSlides);

    // Tipping
    document.getElementById('tipHeart').addEventListener('click', function() { sendTip(200, '❤️'); });
    document.getElementById('tipStar').addEventListener('click', function() { sendTip(500, '⭐'); });
    document.getElementById('tipHaha').addEventListener('click', function() { sendTip(1250, '😂'); });
    document.getElementById('sendCustomTip').addEventListener('click', function() {
        var amount = parseInt(prompt('Enter amount (₦):'));
        if (amount > 0) {
            sendTip(amount, '💝');
        }
    });
    document.getElementById('closeTipModal').addEventListener('click', function() {
        if (DOM.tipModal) DOM.tipModal.classList.remove('active');
    });
    document.getElementById('tipBtn')?.addEventListener('click', function() {
        if (DOM.tipModal) DOM.tipModal.classList.add('active');
    });

    // Raise Hand
    document.getElementById('raiseHandBtn').addEventListener('click', toggleRaiseHand);

    // Chat
    document.getElementById('chatToggleBtn').addEventListener('click', toggleChatSidebar);
    document.getElementById('closeChatBtn').addEventListener('click', toggleChatSidebar);

    // Share
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

    // Microphone
    if (DOM.micBtn) {
        DOM.micBtn.addEventListener('click', toggleMicrophone);
    }

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(function(modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.classList.remove('active');
        });
    });

    // Tip options
    document.querySelectorAll('.tip-option').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var amount = parseInt(btn.dataset.amount);
            var emoji = btn.dataset.emoji || '❤️';
            sendTip(amount, emoji);
        });
    });

    window.addEventListener('beforeunload', function() {
        if (state.sessionId && !state.sessionEnded) {
            saveSessionState();
        }
    });
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
            '<i class="fas fa-desktop"></i> Start Presentation' +
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

function cleanup() {
    if (state.peer) {
        try {
            state.peer.destroy();
        } catch (e) {}
        state.peer = null;
    }
    if (state.audioStream) {
        state.audioStream.getTracks().forEach(function(t) { t.stop(); });
        state.audioStream = null;
    }
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
    }
    if (state.participantsSubscription) {
        state.participantsSubscription.unsubscribe();
        state.participantsSubscription = null;
    }
    if (state.sessionSubscription) {
        state.sessionSubscription.unsubscribe();
        state.sessionSubscription = null;
    }
    if (state.slideSubscription) {
        state.slideSubscription.unsubscribe();
        state.slideSubscription = null;
    }
    if (state.peerTimeout) {
        clearTimeout(state.peerTimeout);
        state.peerTimeout = null;
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

console.log('Virtual Room loaded - Presentation + Audio (100% Free)');
