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
    prepMode: false,
    canvasActive: false,
    participants: new Map(),
    viewerCount: 0,
    handRaised: false,
    chatIframeReady: false,
    unreadCount: 0,
    notifications: [],
    timerInterval: null,
    classStartTime: Date.now(),
    slides: [],
    currentSlideIndex: 0,
    isMuted: false,
    audioStream: null,
    audioActive: false,
    remoteAudioElement: null,
    peerConnections: new Map(),
    participantsSubscription: null,
    sessionSubscription: null,
    slideSubscription: null,
    signalingSubscription: null,
    canvasSubscription: null,
    canvasCtx: null,
    canvasDrawing: false,
    canvasColor: '#fbb040',
    canvasTool: 'pen',
    canvasLastX: 0,
    canvasLastY: 0,
    keepAliveInterval: null,
    audioContext: null,
    viewerAudioMuted: false,
    isCanvasViewer: false,
};

// ============================================
// WEBRTC CONFIG
// ============================================

const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.nextcloud.com:3478' },
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
            urls: 'turn:turn.jitsi.net:3478',
            username: 'jitsi',
            credential: 'jitsi'
        }
    ],
    iceCandidatePoolSize: 5
};

// ============================================
// DOM REFS
// ============================================

const DOM = {};

function cacheDOM() {
    DOM.roomTitle = document.getElementById('roomTitle');
    DOM.classTimer = document.getElementById('classTimer');
    DOM.viewerCount = document.getElementById('viewerCount');
    DOM.audioStatus = document.getElementById('audioStatus');
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
    DOM.prepModeBtn = document.getElementById('prepModeBtn');
    DOM.canvasContainer = document.getElementById('canvasContainer');
    DOM.canvas = document.getElementById('teachingCanvas');
    DOM.canvasColorPicker = document.getElementById('canvasColorPicker');
    DOM.canvasPenBtn = document.getElementById('canvasPenBtn');
    DOM.canvasEraserBtn = document.getElementById('canvasEraserBtn');
    DOM.canvasClearBtn = document.getElementById('canvasClearBtn');
    DOM.canvasToggleBtn = document.getElementById('canvasToggleBtn');
    DOM.canvasToolbarOverlay = document.getElementById('canvasToolbarOverlay');
    DOM.viewerAudioMuteBtn = document.getElementById('viewerAudioMuteBtn');
    DOM.prepOverlay = document.getElementById('prepOverlay');
    DOM.notifBtn = document.getElementById('notifBtn');
    DOM.notifBadge = document.getElementById('notifBadge');
    DOM.notifPanel = document.getElementById('notifPanel');
    DOM.notifList = document.getElementById('notifList');
    DOM.notifClose = document.getElementById('notifClose');
    DOM.canvasWatermark = document.getElementById('canvasWatermark');
}

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Virtual Classroom initializing...');
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
            state.isHost = true;
        }

        if (state.isHost) {
            await createNewSession(sessionCode);
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

        console.log('Virtual Classroom ready');
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

async function createNewSession(customCode) {
    try {
        showLoading(true);
        if (DOM.loadingText) DOM.loadingText.textContent = 'Starting classroom...';

        sessionStorage.removeItem('glimu_session');

        var sessionCode = customCode || generateSessionCode();
        state.sessionCode = sessionCode;
        state.isHost = true;

        var { data: session, error } = await supabase
            .from('virtual_sessions')
            .insert({
                host_id: state.currentUser.id,
                title: (state.userProfile.name || 'User') + '\'s Classroom',
                session_code: sessionCode,
                status: 'live',
                start_time: new Date().toISOString(),
                prep_mode: false
            })
            .select()
            .single();

        if (error) {
            console.error('Database insert error:', error);
            showToast('Failed to create classroom', 'error');
            return;
        }

        state.sessionId = session.id;
        state.isLive = true;

        console.log('Classroom created in DB:', state.sessionId);

        await supabase
            .from('session_participants')
            .insert({
                session_id: state.sessionId,
                user_id: state.currentUser.id,
                role: 'host',
                is_active: true,
                last_seen: new Date().toISOString()
            });

        // Update UI
        if (DOM.roomTitle) DOM.roomTitle.textContent = session.title;
        if (DOM.hostControls) DOM.hostControls.style.display = 'flex';
        if (DOM.viewerControls) DOM.viewerControls.style.display = 'none';
        if (DOM.uploadBtn) DOM.uploadBtn.style.display = 'flex';
        if (DOM.prepModeBtn) DOM.prepModeBtn.style.display = 'flex';
        if (DOM.canvasToggleBtn) DOM.canvasToggleBtn.style.display = 'flex';
        if (DOM.shareLinkInput) {
            DOM.shareLinkInput.value = window.location.origin + '/virtualroom.html?code=' + state.sessionCode;
        }

        // Setup
        createAudioElement();
        await setupSignalingChannel();
        await initAudio(true);
        await loadSlides();
        setupSlideSubscription();
        setupCanvas();
        setupCanvasSubscription();
        startKeepAlive();

        saveSessionState();

        setTimeout(function() {
            if (DOM.shareModal) DOM.shareModal.classList.add('active');
        }, 2000);

        showToast('Classroom ready! Code: ' + state.sessionCode, 'success');

        console.log('Classroom started:', sessionCode);

    } catch (error) {
        console.error('Create session error:', error);
        showToast('Failed to start classroom', 'error');
    } finally {
        showLoading(false);
    }
}

async function joinSession(sessionCode) {
    try {
        showLoading(true);
        if (DOM.loadingText) DOM.loadingText.textContent = 'Joining classroom...';

        sessionStorage.removeItem('glimu_session');

        state.sessionCode = sessionCode;
        state.isHost = false;

        var { data: session, error } = await supabase
            .from('virtual_sessions')
            .select('*')
            .eq('session_code', sessionCode.toUpperCase())
            .maybeSingle();

        if (error || !session) {
            showToast('Classroom not found', 'error');
            setTimeout(function() { window.location.href = '/user'; }, 2000);
            return;
        }

        if (session.status === 'ended') {
            showToast('Classroom has ended', 'error');
            setTimeout(function() { window.location.href = '/user'; }, 2000);
            return;
        }

        state.sessionId = session.id;
        state.isLive = session.status === 'live';
        state.prepMode = session.prep_mode || false;

        console.log('Classroom found in DB:', state.sessionId);

        await supabase
            .from('session_participants')
            .upsert({
                session_id: state.sessionId,
                user_id: state.currentUser.id,
                role: 'viewer',
                is_active: true,
                last_seen: new Date().toISOString()
            }, { onConflict: 'session_id,user_id' });

        // Update UI
        if (DOM.roomTitle) DOM.roomTitle.textContent = session.title || 'Live Classroom';
        if (DOM.hostControls) DOM.hostControls.style.display = 'none';
        if (DOM.viewerControls) DOM.viewerControls.style.display = 'flex';
        if (DOM.uploadBtn) DOM.uploadBtn.style.display = 'none';
        if (DOM.prepModeBtn) DOM.prepModeBtn.style.display = 'none';
        if (DOM.canvasToggleBtn) DOM.canvasToggleBtn.style.display = 'none';
        if (DOM.viewerAudioMuteBtn) DOM.viewerAudioMuteBtn.style.display = 'flex';
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

        // Setup
        createAudioElement();
        await setupSignalingChannel();
        await initAudio(false);
        await loadSlides();
        setupSlideSubscription();
        setupCanvasSubscription();

        // Viewer canvas should follow host
        state.isCanvasViewer = true;

        if (state.prepMode) {
            showPrepOverlay();
        }

        saveSessionState();
        showToast('Connected to classroom!', 'success');

        console.log('Joined classroom:', sessionCode);

    } catch (error) {
        console.error('Join session error:', error);
        showToast('Failed to join classroom', 'error');
        setTimeout(function() { window.location.href = '/user'; }, 2000);
    } finally {
        showLoading(false);
    }
}

// ============================================
// NOTIFICATION SYSTEM
// ============================================

function addNotification(icon, text, type) {
    var notification = {
        id: Date.now(),
        icon: icon,
        text: text,
        type: type,
        time: new Date().toLocaleTimeString()
    };

    state.notifications.unshift(notification);
    if (state.notifications.length > 20) {
        state.notifications.pop();
    }

    updateNotificationUI();
}

function updateNotificationUI() {
    var count = state.notifications.length;
    if (DOM.notifBadge) {
        if (count > 0) {
            DOM.notifBadge.style.display = 'block';
            DOM.notifBadge.textContent = count > 9 ? '9+' : count;
        } else {
            DOM.notifBadge.style.display = 'none';
        }
    }

    if (DOM.notifList) {
        if (state.notifications.length === 0) {
            DOM.notifList.innerHTML = '<div class="notif-empty">No notifications yet</div>';
            return;
        }

        DOM.notifList.innerHTML = state.notifications.map(function(n) {
            return '<div class="notif-item">' +
                '<span class="notif-icon">' + n.icon + '</span>' +
                '<span class="notif-text">' + n.text + '</span>' +
                '<span class="notif-time">' + n.time + '</span>' +
                '</div>';
        }).join('');
    }
}

function toggleNotifications() {
    if (DOM.notifPanel) {
        DOM.notifPanel.classList.toggle('active');
    }
}

// ============================================
// PREP MODE
// ============================================

async function togglePrepMode() {
    if (!state.isHost) return;

    state.prepMode = !state.prepMode;
    await supabase
        .from('virtual_sessions')
        .update({ prep_mode: state.prepMode })
        .eq('id', state.sessionId);

    if (DOM.prepModeBtn) {
        DOM.prepModeBtn.classList.toggle('active', state.prepMode);
    }

    if (state.prepMode) {
        showToast('🔒 Prep Mode ON - Viewers blocked', 'info');
        addNotification('🔒', 'Prep mode activated', 'system');
    } else {
        showToast('🔓 Prep Mode OFF - Viewers can see', 'info');
        addNotification('🔓', 'Prep mode deactivated', 'system');
        await loadSlides();
    }

    // Broadcast prep mode change to viewers
    if (state.isHost) {
        sendSignalingMessage({
            type: 'prep_mode_change',
            prepMode: state.prepMode,
            senderId: state.currentUser.id
        });
    }
}

function showPrepOverlay() {
    if (DOM.prepOverlay) {
        DOM.prepOverlay.classList.add('active');
        DOM.prepOverlay.style.display = 'flex';
    }
    DOM.currentSlide.style.display = 'none';
    DOM.slideNav.style.display = 'none';
}

function hidePrepOverlay() {
    if (DOM.prepOverlay) {
        DOM.prepOverlay.classList.remove('active');
        DOM.prepOverlay.style.display = 'none';
    }
    if (state.slides.length > 0 && !state.prepMode) {
        DOM.currentSlide.style.display = 'block';
        DOM.slideNav.style.display = 'flex';
    }
}

// ============================================
// CANVAS / WHITEBOARD
// ============================================

function setupCanvas() {
    if (!DOM.canvas) return;

    var canvas = DOM.canvas;
    var ctx = canvas.getContext('2d');

    function resizeCanvas() {
        var rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = state.canvasColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    state.canvasCtx = ctx;

    // Only enable drawing for host
    if (state.isHost) {
        enableCanvasDrawing();
    }

    console.log('✅ Canvas initialized');
}

function enableCanvasDrawing() {
    var canvas = DOM.canvas;
    var ctx = state.canvasCtx;
    if (!canvas || !ctx) return;

    // Mouse events
    canvas.addEventListener('mousedown', function(e) {
        state.canvasDrawing = true;
        var rect = canvas.getBoundingClientRect();
        state.canvasLastX = (e.clientX - rect.left) * (canvas.width / rect.width);
        state.canvasLastY = (e.clientY - rect.top) * (canvas.height / rect.height);
        ctx.beginPath();
        ctx.moveTo(state.canvasLastX, state.canvasLastY);
    });

    canvas.addEventListener('mousemove', function(e) {
        if (!state.canvasDrawing) return;
        var rect = canvas.getBoundingClientRect();
        var x = (e.clientX - rect.left) * (canvas.width / rect.width);
        var y = (e.clientY - rect.top) * (canvas.height / rect.height);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
        
        if (state.isHost) {
            broadcastCanvasStroke({ x: x, y: y, tool: state.canvasTool, color: state.canvasColor });
        }
    });

    canvas.addEventListener('mouseup', function() {
        state.canvasDrawing = false;
        if (state.isHost) {
            broadcastCanvasStroke({ type: 'end' });
        }
    });

    canvas.addEventListener('mouseleave', function() {
        state.canvasDrawing = false;
    });

    // Touch events
    canvas.addEventListener('touchstart', function(e) {
        e.preventDefault();
        state.canvasDrawing = true;
        var rect = canvas.getBoundingClientRect();
        var touch = e.touches[0];
        state.canvasLastX = (touch.clientX - rect.left) * (canvas.width / rect.width);
        state.canvasLastY = (touch.clientY - rect.top) * (canvas.height / rect.height);
        ctx.beginPath();
        ctx.moveTo(state.canvasLastX, state.canvasLastY);
    });

    canvas.addEventListener('touchmove', function(e) {
        e.preventDefault();
        if (!state.canvasDrawing) return;
        var rect = canvas.getBoundingClientRect();
        var touch = e.touches[0];
        var x = (touch.clientX - rect.left) * (canvas.width / rect.width);
        var y = (touch.clientY - rect.top) * (canvas.height / rect.height);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
        
        if (state.isHost) {
            broadcastCanvasStroke({ x: x, y: y, tool: state.canvasTool, color: state.canvasColor });
        }
    });

    canvas.addEventListener('touchend', function(e) {
        e.preventDefault();
        state.canvasDrawing = false;
        if (state.isHost) {
            broadcastCanvasStroke({ type: 'end' });
        }
    });
}

function setupCanvasSubscription() {
    if (state.canvasSubscription) {
        state.canvasSubscription.unsubscribe();
        state.canvasSubscription = null;
    }

    if (!state.sessionId) return;

    state.canvasSubscription = supabase
        .channel('canvas_' + state.sessionId)
        .on('broadcast', { event: 'stroke' }, function(payload) {
            if (payload.payload.senderId === state.currentUser.id) return;
            drawCanvasStroke(payload.payload);
        })
        .on('broadcast', { event: 'canvas_toggle' }, function(payload) {
            if (payload.payload.senderId === state.currentUser.id) return;
            // Viewers: show/hide canvas when host toggles
            if (payload.payload.active) {
                showCanvasForViewer();
            } else {
                hideCanvasForViewer();
            }
        })
        .on('broadcast', { event: 'canvas_clear' }, function(payload) {
            if (payload.payload.senderId === state.currentUser.id) return;
            clearCanvasLocal();
        })
        .subscribe();
}

function broadcastCanvasStroke(data) {
    if (!state.sessionId || !state.isHost) return;
    
    data.senderId = state.currentUser.id;
    data.timestamp = Date.now();

    supabase.channel('canvas_' + state.sessionId).send({
        type: 'broadcast',
        event: 'stroke',
        payload: data
    }).catch(function(err) {
        console.warn('Could not broadcast stroke:', err);
    });
}

function drawCanvasStroke(data) {
    if (!state.canvasCtx) return;
    var ctx = state.canvasCtx;
    var canvas = DOM.canvas;

    if (data.type === 'end') {
        return;
    }

    if (data.tool === 'eraser') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 20;
    } else {
        ctx.strokeStyle = data.color || '#fbb040';
        ctx.lineWidth = 3;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(data.x, data.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(data.x, data.y);
}

function clearCanvasLocal() {
    if (!state.canvasCtx || !DOM.canvas) return;
    var canvas = DOM.canvas;
    state.canvasCtx.fillStyle = '#ffffff';
    state.canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
}

function clearCanvas() {
    if (!state.isHost) return;
    clearCanvasLocal();
    if (state.isHost) {
        supabase.channel('canvas_' + state.sessionId).send({
            type: 'broadcast',
            event: 'canvas_clear',
            payload: { senderId: state.currentUser.id }
        });
    }
}

function toggleCanvas() {
    if (!state.isHost) return;

    state.canvasActive = !state.canvasActive;

    if (state.canvasActive) {
        showCanvas();
        showToast('📝 Whiteboard opened', 'info');
        addNotification('📝', 'Whiteboard opened', 'system');
    } else {
        hideCanvas();
        showToast('📝 Whiteboard closed', 'info');
        addNotification('📝', 'Whiteboard closed', 'system');
    }

    // Broadcast to viewers
    supabase.channel('canvas_' + state.sessionId).send({
        type: 'broadcast',
        event: 'canvas_toggle',
        payload: { 
            active: state.canvasActive,
            senderId: state.currentUser.id 
        }
    });

    if (DOM.canvasToggleBtn) {
        DOM.canvasToggleBtn.classList.toggle('active', state.canvasActive);
    }
    if (DOM.canvasToolbarOverlay) {
        DOM.canvasToolbarOverlay.classList.toggle('active', state.canvasActive);
    }
}

function showCanvas() {
    if (DOM.canvasContainer) {
        DOM.canvasContainer.classList.add('active');
        DOM.canvasContainer.style.display = 'block';
    }
    // Resize canvas
    setTimeout(function() {
        if (DOM.canvas) {
            var rect = DOM.canvas.parentElement.getBoundingClientRect();
            DOM.canvas.width = rect.width;
            DOM.canvas.height = rect.height;
            if (state.canvasCtx) {
                state.canvasCtx.fillStyle = '#ffffff';
                state.canvasCtx.fillRect(0, 0, DOM.canvas.width, DOM.canvas.height);
            }
        }
    }, 100);
}

function hideCanvas() {
    if (DOM.canvasContainer) {
        DOM.canvasContainer.classList.remove('active');
        DOM.canvasContainer.style.display = 'none';
    }
    if (DOM.canvasToolbarOverlay) {
        DOM.canvasToolbarOverlay.classList.remove('active');
    }
}

function showCanvasForViewer() {
    state.isCanvasViewer = true;
    if (DOM.canvasContainer) {
        DOM.canvasContainer.classList.add('active');
        DOM.canvasContainer.style.display = 'block';
        DOM.canvasWatermark.style.display = 'block';
    }
    // Resize canvas
    setTimeout(function() {
        if (DOM.canvas) {
            var rect = DOM.canvas.parentElement.getBoundingClientRect();
            DOM.canvas.width = rect.width;
            DOM.canvas.height = rect.height;
            if (state.canvasCtx) {
                state.canvasCtx.fillStyle = '#ffffff';
                state.canvasCtx.fillRect(0, 0, DOM.canvas.width, DOM.canvas.height);
            }
        }
    }, 100);
}

function hideCanvasForViewer() {
    state.isCanvasViewer = false;
    if (DOM.canvasContainer) {
        DOM.canvasContainer.classList.remove('active');
        DOM.canvasContainer.style.display = 'none';
    }
}

function setCanvasTool(tool) {
    state.canvasTool = tool;
    if (DOM.canvasPenBtn) DOM.canvasPenBtn.classList.toggle('active', tool === 'pen');
    if (DOM.canvasEraserBtn) DOM.canvasEraserBtn.classList.toggle('active', tool === 'eraser');
}

function setCanvasColor(color) {
    state.canvasColor = color;
    if (state.canvasCtx && state.canvasTool !== 'eraser') {
        state.canvasCtx.strokeStyle = color;
    }
}

// ============================================
// AUDIO FUNCTIONS
// ============================================

function createAudioElement() {
    if (state.remoteAudioElement) {
        state.remoteAudioElement.remove();
        state.remoteAudioElement = null;
    }

    var audio = document.createElement('audio');
    audio.id = 'remoteAudio';
    audio.autoplay = true;
    audio.style.display = 'none';
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    document.body.appendChild(audio);
    
    state.remoteAudioElement = audio;
    console.log('🔊 Audio element created');
}

function toggleViewerAudio() {
    state.viewerAudioMuted = !state.viewerAudioMuted;
    if (state.remoteAudioElement) {
        state.remoteAudioElement.muted = state.viewerAudioMuted;
    }
    if (DOM.viewerAudioMuteBtn) {
        DOM.viewerAudioMuteBtn.classList.toggle('active', state.viewerAudioMuted);
        DOM.viewerAudioMuteBtn.innerHTML = state.viewerAudioMuted ? 
            '<i class="fas fa-volume-mute"></i><span class="btn-label">Unmute</span>' : 
            '<i class="fas fa-volume-up"></i><span class="btn-label">Mute</span>';
    }
    if (DOM.audioStatus) {
        DOM.audioStatus.textContent = state.viewerAudioMuted ? '🔇' : '🎙️';
    }
    showToast(state.viewerAudioMuted ? '🔇 Audio muted' : '🔊 Audio unmuted', 'info');
}

function startKeepAlive() {
    if (state.keepAliveInterval) {
        clearInterval(state.keepAliveInterval);
    }

    try {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.warn('AudioContext not available');
    }

    state.keepAliveInterval = setInterval(function() {
        if (state.audioContext && state.audioContext.state === 'suspended') {
            state.audioContext.resume().catch(function() {});
        }
        if (peerConnection && peerConnection.connectionState === 'connected') {
            try {
                var dc = peerConnection.createDataChannel('keepalive');
                dc.onopen = function() {
                    dc.send('ping');
                    setTimeout(function() { dc.close(); }, 100);
                };
            } catch (e) {}
        }
    }, 30000);

    console.log('🔊 Keep-alive started');
}

// ============================================
// SIGNALING CHANNEL (WebRTC)
// ============================================

// ... [Signaling and WebRTC functions remain the same as before]
// [Continued in next message due to length]

var peerConnection = null;

async function setupSignalingChannel() {
    if (!state.sessionId) return;

    if (state.signalingSubscription) {
        state.signalingSubscription.unsubscribe();
        state.signalingSubscription = null;
    }

    var channelName = 'webrtc_' + state.sessionId;
    
    state.signalingSubscription = supabase
        .channel(channelName, {
            config: {
                broadcast: { ack: true }
            }
        })
        .on('broadcast', { event: 'signal' }, function(payload) {
            console.log('📨 Signal received:', payload.payload.type);
            handleSignalingMessage(payload.payload);
        })
        .subscribe(function(status) {
            console.log('📡 Signaling channel status:', status);
        });
}

function sendSignalingMessage(message) {
    if (!state.sessionId || !state.signalingSubscription) {
        console.warn('Cannot send signal: no subscription');
        return;
    }

    message.timestamp = Date.now();
    message.senderId = state.currentUser.id;

    state.signalingSubscription.send({
        type: 'broadcast',
        event: 'signal',
        payload: message
    }).catch(function(err) {
        console.warn('Could not send signal:', err);
    });
}

function handleSignalingMessage(message) {
    if (message.senderId === state.currentUser.id) return;
    if (!state.audioStream) return;

    console.log('Processing signal:', message.type, 'from:', message.senderId);

    try {
        switch (message.type) {
            case 'offer':
                handleOffer(message);
                break;
            case 'answer':
                handleAnswer(message);
                break;
            case 'ice_candidate':
                handleIceCandidate(message);
                break;
            case 'viewer_ready':
                if (state.isHost) {
                    console.log('👤 Viewer ready, sending offer...');
                    createOffer(message.senderId);
                }
                break;
            case 'prep_mode_change':
                state.prepMode = message.prepMode;
                if (state.prepMode && !state.isHost) {
                    showPrepOverlay();
                } else if (!state.isHost) {
                    hidePrepOverlay();
                    loadSlides();
                }
                break;
        }
    } catch (error) {
        console.error('Signal handling error:', error);
    }
}

// ============================================
// WEBRTC AUDIO
// ============================================

async function initAudio(isHost) {
    try {
        state.audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false
        });
        console.log('✅ Audio stream acquired');

        if (DOM.audioStatus) {
            DOM.audioStatus.textContent = '🎙️';
        }

        if (isHost) {
            console.log('Host waiting for viewers...');
        } else {
            setTimeout(function() {
                console.log('Viewer sending ready signal...');
                sendSignalingMessage({
                    type: 'viewer_ready',
                    senderId: state.currentUser.id
                });
            }, 2000);
        }

    } catch (err) {
        console.warn('Could not get audio:', err);
        if (DOM.audioStatus) {
            DOM.audioStatus.textContent = '🔇';
        }
        showToast('Audio unavailable. Using chat only.', 'warning');
    }
}

async function createOffer(targetUserId) {
    if (!state.audioStream || !state.isHost) return;

    try {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }

        peerConnection = new RTCPeerConnection(RTC_CONFIG);

        state.audioStream.getTracks().forEach(function(track) {
            peerConnection.addTrack(track, state.audioStream);
        });

        peerConnection.onicecandidate = function(event) {
            if (event.candidate) {
                sendSignalingMessage({
                    type: 'ice_candidate',
                    candidate: event.candidate,
                    senderId: state.currentUser.id,
                    targetUserId: targetUserId
                });
            }
        };

        peerConnection.onconnectionstatechange = function() {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                showToast('🎙️ Audio connected!', 'success');
                if (DOM.audioStatus) {
                    DOM.audioStatus.textContent = '🎙️';
                }
            }
        };

        var offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        sendSignalingMessage({
            type: 'offer',
            sdp: offer,
            senderId: state.currentUser.id,
            targetUserId: targetUserId
        });

        console.log('✅ Offer sent to:', targetUserId);

    } catch (error) {
        console.error('Create offer error:', error);
    }
}

async function handleOffer(message) {
    if (!state.audioStream) return;

    try {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }

        peerConnection = new RTCPeerConnection(RTC_CONFIG);

        state.audioStream.getTracks().forEach(function(track) {
            peerConnection.addTrack(track, state.audioStream);
        });

        peerConnection.onicecandidate = function(event) {
            if (event.candidate) {
                sendSignalingMessage({
                    type: 'ice_candidate',
                    candidate: event.candidate,
                    senderId: state.currentUser.id,
                    targetUserId: message.senderId
                });
            }
        };

        peerConnection.ontrack = function(event) {
            console.log('🎵 Remote audio stream received!');
            
            if (state.remoteAudioElement) {
                state.remoteAudioElement.srcObject = event.streams[0];
                state.remoteAudioElement.play().then(function() {
                    console.log('🔊 Audio playback started');
                    state.audioActive = true;
                    if (DOM.audioStatus) {
                        DOM.audioStatus.textContent = '🎙️';
                    }
                    showToast('🎙️ Audio connected!', 'success');
                }).catch(function(err) {
                    console.warn('Audio play error:', err);
                    document.addEventListener('click', function playOnClick() {
                        if (state.remoteAudioElement) {
                            state.remoteAudioElement.play().catch(function() {});
                        }
                        document.removeEventListener('click', playOnClick);
                    }, { once: true });
                });
            } else {
                createAudioElement();
                if (state.remoteAudioElement) {
                    state.remoteAudioElement.srcObject = event.streams[0];
                    state.remoteAudioElement.play().catch(function() {});
                }
            }
        };

        peerConnection.onconnectionstatechange = function() {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                showToast('🎙️ Audio connected!', 'success');
                if (DOM.audioStatus) {
                    DOM.audioStatus.textContent = '🎙️';
                }
            }
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));

        var answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        sendSignalingMessage({
            type: 'answer',
            sdp: answer,
            senderId: state.currentUser.id,
            targetUserId: message.senderId
        });

        console.log('✅ Answer sent');

    } catch (error) {
        console.error('Handle offer error:', error);
    }
}

async function handleAnswer(message) {
    if (!peerConnection) return;

    try {
        if (peerConnection.signalingState === 'have-local-offer' || 
            peerConnection.signalingState === 'stable') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
            console.log('✅ Answer processed');
        } else {
            console.log('Skipping answer - wrong state:', peerConnection.signalingState);
        }
    } catch (error) {
        console.error('Handle answer error:', error);
    }
}

async function handleIceCandidate(message) {
    if (!peerConnection) return;

    try {
        if (message.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
    } catch (error) {
        console.warn('ICE candidate error:', error);
    }
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
        .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: 'session_slides',
            filter: 'session_id=eq.' + state.sessionId
        }, function() {
            console.log('Slide deleted, reloading...');
            loadSlides();
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

    if (state.prepMode && !state.isHost) {
        showPrepOverlay();
        return;
    }

    hidePrepOverlay();

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
// DELETE SLIDE
// ============================================

async function deleteSlide(slideId) {
    if (!state.isHost) {
        showToast('Only hosts can delete slides', 'warning');
        return;
    }

    if (!confirm('Delete this slide?')) return;

    try {
        var { error } = await supabase
            .from('session_slides')
            .delete()
            .eq('id', slideId);

        if (error) throw error;

        showToast('Slide deleted', 'success');
        await loadSlides();

    } catch (error) {
        console.error('Delete slide error:', error);
        showToast('Failed to delete slide', 'error');
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
                console.error('Upload error:', uploadError);
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
        } else {
            showToast('Failed to upload slides. Check permissions.', 'error');
        }

    } catch (error) {
        console.error('Upload slides error:', error);
        showToast('Failed to upload slides', 'error');
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
        addNotification('🙋', (state.userProfile.name || 'A viewer') + ' raised their hand', 'action');
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

        addNotification(emoji, (state.userProfile.name || 'Someone') + ' sent ₦' + amount, 'tip');

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
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }

        if (state.audioStream) {
            state.audioStream.getTracks().forEach(function(t) { t.stop(); });
            state.audioStream = null;
        }

        if (state.remoteAudioElement) {
            state.remoteAudioElement.pause();
            state.remoteAudioElement.srcObject = null;
            state.remoteAudioElement = null;
        }

        if (state.keepAliveInterval) {
            clearInterval(state.keepAliveInterval);
            state.keepAliveInterval = null;
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
        state.prepMode = session.prep_mode || false;

        if (DOM.roomTitle) DOM.roomTitle.textContent = session.title || 'Live Classroom';

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

        createAudioElement();
        await setupSignalingChannel();
        await initAudio(state.isHost);
        await loadSlides();
        setupSlideSubscription();
        setupCanvas();
        setupCanvasSubscription();
        startKeepAlive();
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
            if (payload.new.prep_mode !== undefined) {
                state.prepMode = payload.new.prep_mode;
                if (state.prepMode && !state.isHost) {
                    showPrepOverlay();
                } else {
                    hidePrepOverlay();
                }
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
                addNotification('🙋', 'Viewer raised their hand', 'action');
                break;
            case 'tip_sent':
                showToast('🎁 Tip sent!', 'success');
                addNotification('🎁', 'Tip received', 'tip');
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
    
    var message = '📚 Join my live classroom! Code: **' + state.sessionCode + '**\n' + window.location.origin + '/virtualroom.html?code=' + state.sessionCode;
    
    sendToChatIframe({ 
        type: 'send_message', 
        message: message 
    });
    
    showToast('📤 Session code sent to chat!', 'success');
    addNotification('📤', 'Session code shared', 'system');
    
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
    document.getElementById('backBtn').addEventListener('click', leaveRoom);
    document.getElementById('leaveBtn').addEventListener('click', leaveRoom);
    document.getElementById('endSessionBtn').addEventListener('click', endSession);

    document.getElementById('nextSlideBtn').addEventListener('click', nextSlide);
    document.getElementById('prevSlideBtn').addEventListener('click', prevSlide);
    document.getElementById('nextSlide').addEventListener('click', nextSlide);
    document.getElementById('prevSlide').addEventListener('click', prevSlide);

    document.addEventListener('keydown', function(e) {
        if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && !e.target.closest('input')) {
            e.preventDefault();
            nextSlide();
        } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && !e.target.closest('input')) {
            e.preventDefault();
            prevSlide();
        }
    });

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

    // Prep Mode
    if (DOM.prepModeBtn) {
        DOM.prepModeBtn.addEventListener('click', togglePrepMode);
    }

    // Canvas
    if (DOM.canvasToggleBtn) {
        DOM.canvasToggleBtn.addEventListener('click', toggleCanvas);
    }
    if (DOM.canvasPenBtn) {
        DOM.canvasPenBtn.addEventListener('click', function() { setCanvasTool('pen'); });
    }
    if (DOM.canvasEraserBtn) {
        DOM.canvasEraserBtn.addEventListener('click', function() { setCanvasTool('eraser'); });
    }
    if (DOM.canvasClearBtn) {
        DOM.canvasClearBtn.addEventListener('click', clearCanvas);
    }
    if (DOM.canvasColorPicker) {
        DOM.canvasColorPicker.addEventListener('change', function(e) {
            setCanvasColor(e.target.value);
        });
    }
    if (document.getElementById('canvasCloseBtn')) {
        document.getElementById('canvasCloseBtn').addEventListener('click', function() {
            if (state.isHost) {
                toggleCanvas();
            }
        });
    }

    // Viewer audio mute
    if (DOM.viewerAudioMuteBtn) {
        DOM.viewerAudioMuteBtn.addEventListener('click', toggleViewerAudio);
    }

    // Notifications
    if (DOM.notifBtn) {
        DOM.notifBtn.addEventListener('click', toggleNotifications);
    }
    if (DOM.notifClose) {
        DOM.notifClose.addEventListener('click', function() {
            if (DOM.notifPanel) DOM.notifPanel.classList.remove('active');
        });
    }
    document.addEventListener('click', function(e) {
        if (DOM.notifPanel && DOM.notifBtn && 
            !DOM.notifPanel.contains(e.target) && 
            !DOM.notifBtn.contains(e.target)) {
            DOM.notifPanel.classList.remove('active');
        }
    });

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

    document.getElementById('raiseHandBtn').addEventListener('click', toggleRaiseHand);

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

    if (DOM.micBtn) {
        DOM.micBtn.addEventListener('click', toggleMicrophone);
    }

    document.querySelectorAll('.modal-overlay').forEach(function(modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.classList.remove('active');
        });
    });

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
            '<i class="fas fa-desktop"></i> Start Classroom' +
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
    if (peerConnection) {
        try {
            peerConnection.close();
        } catch (e) {}
        peerConnection = null;
    }
    if (state.audioStream) {
        state.audioStream.getTracks().forEach(function(t) { t.stop(); });
        state.audioStream = null;
    }
    if (state.remoteAudioElement) {
        state.remoteAudioElement.pause();
        state.remoteAudioElement.srcObject = null;
        state.remoteAudioElement = null;
    }
    if (state.keepAliveInterval) {
        clearInterval(state.keepAliveInterval);
        state.keepAliveInterval = null;
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
    if (state.signalingSubscription) {
        state.signalingSubscription.unsubscribe();
        state.signalingSubscription = null;
    }
    if (state.canvasSubscription) {
        state.canvasSubscription.unsubscribe();
        state.canvasSubscription = null;
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

console.log('Virtual Classroom loaded - Complete');
