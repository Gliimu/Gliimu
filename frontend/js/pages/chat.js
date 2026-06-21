// ============================================
// 💬 COMMUNITY CHAT - GLIIMU
// Fixed: Reply toast, Reply threading, Avatar click context menu
// ============================================

import { supabase, getCurrentUser } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// STATE
// ============================================

let currentUser = null;
let currentChannel = 'general';
let allMessages = [];
let messageSubscription = null;
let pendingFile = null;
let pendingVoiceBlob = null;
let pendingVoiceUrl = null;
let typingTimeout = null;
let lastMessageId = null;
let currentContextMessageId = null;
let userAvatars = {};
let onlineUserIds = new Set();
let isDarkMode = false;
let presenceChannel = null;
let mentionedInMessages = new Set();
let replyToMessage = null;
let hasReplyColumn = true;
let shownMentionToasts = new Set(); // Track shown mention toasts

// Audio recording
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;

// Voice preview
let voicePreviewAudio = null;
let isVoicePreviewPlaying = false;

// Unread counts
let unreadCounts = {
    general: 0,
    announcements: 0,
    help: 0,
    random: 0,
    projects: 0
};

// ============================================
// THEME MANAGEMENT
// ============================================

function initTheme() {
    const dashboardTheme = localStorage.getItem('dashboard_theme');
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let theme = 'light';
    
    if (dashboardTheme === 'dark') {
        theme = 'dark';
    } else if (dashboardTheme === 'light') {
        theme = 'light';
    } else if (savedTheme === 'dark') {
        theme = 'dark';
    } else if (savedTheme === 'light') {
        theme = 'light';
    } else if (systemPrefersDark) {
        theme = 'dark';
    }
    
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        isDarkMode = true;
    } else {
        document.body.classList.remove('dark-mode');
        isDarkMode = false;
    }
    
    localStorage.setItem('theme', theme);
    localStorage.setItem('dashboard_theme', theme);
    
    console.log('🎨 Theme initialized:', theme, 'mode');
}

// ============================================
// CHECK REPLY COLUMN
// ============================================

async function checkReplyColumn() {
    try {
        const { error } = await supabase
            .from('chat_messages')
            .insert({
                channel: 'test',
                sender_id: 'test',
                sender_name: 'test',
                message: 'test',
                type: 'text',
                reply_to: 'test'
            })
            .select();
        
        if (error && error.message && error.message.includes('column "reply_to" does not exist')) {
            hasReplyColumn = false;
            console.log('📌 reply_to column does not exist - using fallback mode');
        } else {
            hasReplyColumn = true;
            console.log('📌 reply_to column exists');
        }
    } catch (error) {
        console.warn('Could not check reply column:', error);
        hasReplyColumn = false;
    }
}

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('💬 Chat initializing...');
    
    initTheme();
    fixMobileViewport();
    
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.innerHTML = `
            <div class="welcome-message">
                <i class="fas fa-spinner fa-spin"></i>
                <h3>🔄 Connecting...</h3>
                <p>Please wait while we connect you</p>
            </div>
        `;
    }
    
    try {
        currentUser = await getCurrentUser();
    } catch (err) {
        console.error('Error getting user:', err);
        currentUser = null;
    }
    
    if (!currentUser) {
        showLoginScreen();
        return;
    }
    
    updateUserUI();
    await loadUserAvatars();
    await checkReplyColumn();
    await loadMessages();
    setupRealtimeSubscription();
    setupPresenceTracking();
    await loadOnlineUsers();
    setupEventListeners();
    markChannelRead(currentChannel);
    initEmojiGrid();
    
    console.log('✅ Chat ready');
});

// ============================================
// MOBILE FIX
// ============================================

function fixMobileViewport() {
    const setVH = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', () => setTimeout(setVH, 300));
}

// ============================================
// USER
// ============================================

function showLoginScreen() {
    const chatMain = document.querySelector('.chat-main');
    if (chatMain) {
        chatMain.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;">
                <i class="fas fa-comments" style="font-size:64px;color:var(--text-secondary);margin-bottom:20px;"></i>
                <h2>👋 Join the Conversation</h2>
                <p style="color:var(--text-secondary);margin:16px 0;">Sign in to chat with fellow creatives</p>
                <button onclick="window.location.href='/signin.html'" style="padding:12px 32px;background:linear-gradient(135deg,#2c2f78,#1a1c4a);color:white;border:none;border-radius:40px;cursor:pointer;font-size:16px;">🚀 Sign In</button>
            </div>
        `;
    }
    
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    if (input) input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
}

function updateUserUI() {
    const nameEl = document.getElementById('currentUserName');
    const statusEl = document.getElementById('userStatusText');
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    const name = currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'User';
    
    if (nameEl) nameEl.textContent = `👤 ${name}`;
    if (statusEl) statusEl.textContent = '🟢 Online';
    if (input) input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    if (logoutBtn) {
        logoutBtn.style.display = 'block';
        logoutBtn.onclick = async () => {
            await supabase.auth.signOut();
            window.location.reload();
        };
    }
}

// ============================================
// USER AVATARS
// ============================================

async function loadUserAvatars() {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, name, avatar_url');
        
        if (!error && users) {
            users.forEach(user => {
                userAvatars[user.id] = user.avatar_url || null;
            });
        }
    } catch (error) {
        console.error('Error loading avatars:', error);
    }
}

function getUserAvatar(userId) {
    return userAvatars[userId] || null;
}

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// ============================================
// PRESENCE TRACKING
// ============================================

function setupPresenceTracking() {
    if (!currentUser) return;
    
    presenceChannel = supabase.channel('online_users', {
        config: {
            presence: {
                key: currentUser.id
            }
        }
    });
    
    presenceChannel.on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const onlineUsers = [];
        
        for (const [key, value] of Object.entries(state)) {
            if (value && value.length > 0) {
                onlineUsers.push(value[0]);
            }
        }
        
        onlineUserIds = new Set(onlineUsers.map(u => u.user_id));
        updateOnlineUsersList(onlineUsers);
    });
    
    presenceChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            const userData = {
                user_id: currentUser.id,
                name: currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'User',
                role: currentUser.user_metadata?.role || 'student',
                avatar_url: currentUser.user_metadata?.avatar_url || null
            };
            await presenceChannel.track(userData);
            console.log('✅ Presence tracked:', userData.name);
        }
    });
    
    window.addEventListener('beforeunload', () => {
        if (presenceChannel) {
            presenceChannel.untrack();
            presenceChannel.unsubscribe();
        }
    });
}

function updateOnlineUsersList(users) {
    const modalContainer = document.getElementById('modalOnlineUsersList');
    if (!modalContainer) return;
    
    if (!users || users.length === 0) {
        modalContainer.innerHTML = `<div class="empty-state-text">No users online</div>`;
        return;
    }
    
    const sortedUsers = users.sort((a, b) => {
        if (a.user_id === currentUser.id) return -1;
        if (b.user_id === currentUser.id) return 1;
        return 0;
    });
    
    modalContainer.innerHTML = sortedUsers.map(user => {
        const isCurrentUser = user.user_id === currentUser.id;
        const avatarUrl = user.avatar_url || userAvatars[user.user_id] || null;
        const initials = getInitials(user.name);
        const displayName = isCurrentUser ? 'You' : escapeHtml(user.name || 'User');
        const role = isCurrentUser ? '' : (user.role || 'Member');
        
        return `
            <div class="user-item ${isCurrentUser ? 'current-user-item' : ''}">
                <div class="user-avatar">
                    ${avatarUrl ? 
                        `<img src="${avatarUrl}" alt="${escapeHtml(user.name)}">` :
                        `<span>${initials}</span>`
                    }
                </div>
                <div class="user-info">
                    <div class="user-name">${displayName}</div>
                    ${!isCurrentUser ? `<div class="user-role">${escapeHtml(role)}</div>` : ''}
                </div>
                <span class="online-dot"></span>
                ${isCurrentUser ? '<span class="you-badge">You</span>' : ''}
            </div>
        `;
    }).join('');
    
    const count = document.getElementById('modalMemberCount');
    if (count) count.textContent = users.length;
}

// ============================================
// MESSAGES
// ============================================

async function loadMessages() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    try {
        let selectQuery = '*';
        if (!hasReplyColumn) {
            selectQuery = 'id, channel, sender_id, sender_name, message, type, file_url, file_name, created_at';
        }
        
        const { data: messages, error } = await supabase
            .from('chat_messages')
            .select(selectQuery)
            .eq('channel', currentChannel)
            .order('created_at', { ascending: true })
            .limit(100);
        
        if (error) throw error;
        
        if (messages && messages.length > 0) {
            allMessages = messages;
            lastMessageId = messages[messages.length - 1].id;
            renderMessages();
        } else {
            await insertWelcomeMessage();
            renderMessages();
        }
        
        scrollToBottom();
    } catch (error) {
        console.error('Error loading messages:', error);
        showToast('❌ Failed to load messages', 'error');
    }
}

async function insertWelcomeMessage() {
    const welcome = {
        channel: currentChannel,
        sender_id: null,
        sender_name: 'System',
        message: getWelcomeMessage(currentChannel),
        type: 'text',
        created_at: new Date().toISOString()
    };
    await supabase.from('chat_messages').insert([welcome]);
}

function getWelcomeMessage(channel) {
    const msgs = {
        general: '👋 Welcome to #general! Introduce yourself and start chatting.',
        announcements: '📢 Welcome to #announcements! Check here for updates.',
        help: '❓ Welcome to #help! Ask questions and get help.',
        random: '🎲 Welcome to #random! Casual conversation and fun.',
        projects: '💻 Welcome to #projects! Share your work and collaborate.'
    };
    return msgs[channel] || `👋 Welcome to #${channel}!`;
}

function renderMessages() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    if (allMessages.length === 0) {
        container.innerHTML = `
            <div class="welcome-message">
                <i class="fas fa-comments"></i>
                <h3>👋 Welcome to #${currentChannel}</h3>
                <p>${getWelcomeMessage(currentChannel)}</p>
            </div>
        `;
        return;
    }
    
    const shouldScroll = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    
    let html = '';
    let lastSender = null;
    
    allMessages.forEach((msg, index) => {
        const isSelf = msg.sender_id === currentUser?.id;
        const isSystem = msg.sender_id === null;
        const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const senderName = msg.sender_name || 'User';
        const showSender = !isSystem && (lastSender !== msg.sender_id || index === 0);
        
        if (isSystem) {
            html += `<div class="message-system">${escapeHtml(msg.message)}</div>`;
            return;
        }
        
        let contentHtml = '';
        const avatarUrl = getUserAvatar(msg.sender_id);
        const initials = getInitials(senderName);
        
        // Check for mentions - only show toast once per message
        const mentionKey = msg.id;
        const hasMention = msg.message && msg.message.includes(`@${currentUser.user_metadata?.name || currentUser.email?.split('@')[0]}`);
        if (hasMention && !isSelf && !shownMentionToasts.has(mentionKey)) {
            shownMentionToasts.add(mentionKey);
            showToast(`📢 ${senderName} mentioned you`, 'info');
        }
        
        // Reply threading - get the SPECIFIC replied message
        let replyHtml = '';
        if (hasReplyColumn && msg.reply_to) {
            const repliedMsg = allMessages.find(m => m.id === msg.reply_to);
            if (repliedMsg) {
                const repliedName = repliedMsg.sender_name || 'User';
                const repliedText = repliedMsg.message || 'Image/Voice/File';
                replyHtml = `
                    <div class="reply-preview" onclick="scrollToMessage('${repliedMsg.id}')">
                        <i class="fas fa-reply"></i>
                        <span class="reply-sender">${escapeHtml(repliedName)}</span>
                        <span class="reply-text">${escapeHtml(repliedText.substring(0, 60))}${repliedText.length > 60 ? '...' : ''}</span>
                    </div>
                `;
            }
        }
        
        if (msg.type === 'image' && msg.file_url) {
            contentHtml = `
                ${replyHtml}
                <div class="message-bubble image-bubble" onclick="openMediaViewer('${msg.file_url}', 'image')">
                    <img src="${msg.file_url}" alt="Image" class="message-image" loading="lazy">
                </div>
            `;
        } else if (msg.type === 'video' && msg.file_url) {
            contentHtml = `
                ${replyHtml}
                <div class="message-bubble video-bubble" onclick="openMediaViewer('${msg.file_url}', 'video')">
                    <video src="${msg.file_url}" class="message-video" muted playsinline preload="metadata" loading="lazy"></video>
                    <div class="video-play-overlay"><i class="fas fa-play"></i></div>
                </div>
            `;
        } else if (msg.type === 'file' && msg.file_url) {
            contentHtml = `
                ${replyHtml}
                <div class="message-bubble file-bubble">
                    <a href="${msg.file_url}" target="_blank" class="message-file">
                        <i class="fas fa-file-download"></i>
                        <span>📄 ${escapeHtml(msg.file_name || 'Download')}</span>
                    </a>
                </div>
            `;
        } else if (msg.type === 'voice' && msg.file_url) {
            contentHtml = `
                ${replyHtml}
                <div class="message-bubble voice-bubble">
                    <div class="voice-message">
                        <button class="voice-play-btn" onclick="playVoiceMessage(this, '${msg.file_url}')">
                            <i class="fas fa-play"></i>
                        </button>
                        <div class="voice-wave">
                            <span></span><span></span><span></span><span></span><span></span>
                        </div>
                        <audio style="display:none;"></audio>
                    </div>
                </div>
            `;
        } else {
            let messageText = escapeHtml(msg.message);
            if (hasMention) {
                const mentionName = currentUser.user_metadata?.name || currentUser.email?.split('@')[0];
                const regex = new RegExp(`@${mentionName}`, 'gi');
                messageText = messageText.replace(regex, `<span class="mention-highlight">@${mentionName}</span>`);
            }
            contentHtml = `
                ${replyHtml}
                <div class="message-bubble ${hasMention && !isSelf ? 'mention-bubble' : ''}">${messageText}</div>
            `;
        }
        
        if (isSelf) {
            html += `
                <div class="message-group self" data-message-id="${msg.id}">
                    <div class="message-content">
                        ${contentHtml}
                        <div class="message-time">${time}</div>
                    </div>
                </div>
            `;
        } else {
            const avatarHtml = avatarUrl ? 
                `<img src="${avatarUrl}" alt="${escapeHtml(senderName)}" class="message-avatar" data-user-id="${msg.sender_id}" data-user-name="${escapeHtml(senderName)}" loading="lazy">` :
                `<div class="message-avatar" data-user-id="${msg.sender_id}" data-user-name="${escapeHtml(senderName)}" style="background:linear-gradient(135deg, var(--brand-purple), var(--brand-gold));">
                    ${initials}
                </div>`;
            
            html += `
                <div class="message-group other" data-message-id="${msg.id}">
                    ${avatarHtml}
                    <div class="message-content">
                        ${showSender ? `<div class="message-sender">${escapeHtml(senderName)}</div>` : ''}
                        ${contentHtml}
                        <div class="message-time">${time}</div>
                    </div>
                </div>
            `;
        }
        
        lastSender = msg.sender_id;
    });
    
    container.innerHTML = html;
    attachAvatarEvents();
    attachMessageEvents();
    
    if (shouldScroll) scrollToBottom();
}

// ============================================
// SCROLL TO MESSAGE
// ============================================

function scrollToMessage(messageId) {
    const element = document.querySelector(`.message-group[data-message-id="${messageId}"]`);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlight-flash');
        setTimeout(() => {
            element.classList.remove('highlight-flash');
        }, 2000);
    }
}

// ============================================
// VOICE PLAYBACK
// ============================================

async function playVoiceMessage(btn, audioUrl) {
    const container = btn.parentElement;
    const icon = btn.querySelector('i');
    const audioEl = container.querySelector('audio');
    
    document.querySelectorAll('.voice-play-btn i').forEach(el => {
        if (el !== icon) {
            el.className = 'fas fa-play';
            const parent = el.closest('.voice-message');
            if (parent) {
                const otherAudio = parent.querySelector('audio');
                if (otherAudio) otherAudio.pause();
            }
        }
    });
    
    if (audioEl && !audioEl.paused) {
        audioEl.pause();
        icon.className = 'fas fa-play';
        return;
    }
    
    if (audioEl && audioEl.src) {
        audioEl.play().then(() => {
            icon.className = 'fas fa-pause';
            audioEl.onended = () => {
                icon.className = 'fas fa-play';
            };
        }).catch((err) => {
            console.error('Play error:', err);
            icon.className = 'fas fa-play';
            // Don't reload on AbortError (caused by pause)
            if (err.name !== 'AbortError') {
                loadVoiceAudio(btn, audioUrl);
            }
        });
        return;
    }
    
    loadVoiceAudio(btn, audioUrl);
}

async function loadVoiceAudio(btn, audioUrl) {
    const icon = btn.querySelector('i');
    const container = btn.parentElement;
    let audioEl = container.querySelector('audio');
    
    if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.style.display = 'none';
        container.appendChild(audioEl);
    }
    
    icon.className = 'fas fa-spinner fa-spin';
    btn.disabled = true;
    
    try {
        const urlWithCache = audioUrl + (audioUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
        
        const response = await fetch(urlWithCache);
        if (!response.ok) throw new Error('Network response was not ok');
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        audioEl.src = blobUrl;
        audioEl.load();
        
        audioEl.oncanplay = () => {
            audioEl.play().then(() => {
                icon.className = 'fas fa-pause';
                btn.disabled = false;
                audioEl.onended = () => {
                    icon.className = 'fas fa-play';
                    URL.revokeObjectURL(blobUrl);
                };
            }).catch((err) => {
                console.error('Play error:', err);
                icon.className = 'fas fa-play';
                btn.disabled = false;
                if (err.name !== 'AbortError') {
                    showToast('❌ Could not play voice message', 'error');
                }
            });
        };
        
        audioEl.onerror = () => {
            console.error('Audio load error');
            icon.className = 'fas fa-play';
            btn.disabled = false;
            showToast('❌ Could not load voice message', 'error');
        };
        
    } catch (err) {
        console.error('Fetch error:', err);
        icon.className = 'fas fa-play';
        btn.disabled = false;
        showToast('❌ Could not load voice message', 'error');
    }
}

// ============================================
// AVATAR EVENTS - Click to show context menu (no long press)
// ============================================

function attachAvatarEvents() {
    document.querySelectorAll('.message-avatar').forEach(avatar => {
        const userId = avatar.dataset.userId;
        const userName = avatar.dataset.userName;
        
        if (!userId || userId === currentUser?.id) return;
        
        // Single click/tap shows context menu
        avatar.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e, userId, userName);
        });
        
        // Right click also shows context menu
        avatar.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e, userId, userName);
        });
    });
}

// ============================================
// MESSAGE EVENTS (Double click to reply)
// ============================================

function attachMessageEvents() {
    document.querySelectorAll('.message-group .message-content').forEach(content => {
        const messageGroup = content.closest('.message-group');
        if (!messageGroup) return;
        const messageId = messageGroup.dataset.messageId;
        if (!messageId) return;
        
        content.addEventListener('dblclick', (e) => {
            if (e.target.closest('.message-avatar') || e.target.closest('.voice-play-btn')) return;
            const msg = allMessages.find(m => m.id === messageId);
            if (msg) {
                replyToMessage = msg;
                const input = document.getElementById('messageInput');
                if (input) {
                    input.placeholder = `Replying to ${msg.sender_name || 'User'}...`;
                    input.focus();
                    showToast(`💬 Replying to ${msg.sender_name || 'User'}`, 'info');
                }
            }
        });
    });
}

// ============================================
// CONTEXT MENU
// ============================================

let contextTargetUserId = null;
let contextTargetUserName = null;
let contextTargetMessageId = null;

function showContextMenu(event, userId, userName) {
    const menu = document.getElementById('contextMenu');
    if (!menu) return;
    
    contextTargetUserId = userId;
    contextTargetUserName = userName;
    
    // Find the specific message that was clicked - use the avatar's parent message
    const avatar = event.currentTarget || event.target;
    const messageGroup = avatar.closest('.message-group');
    if (messageGroup) {
        contextTargetMessageId = messageGroup.dataset.messageId;
    }
    
    // If no message found, use the last message from this user
    if (!contextTargetMessageId) {
        const msg = allMessages.filter(m => m.sender_id === userId).pop();
        contextTargetMessageId = msg ? msg.id : null;
    }
    
    const x = event.clientX || event.touches?.[0]?.clientX || 0;
    const y = event.clientY || event.touches?.[0]?.clientY || 0;
    
    menu.style.display = 'block';
    menu.style.left = `${Math.min(x, window.innerWidth - 180)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 150)}px`;
}

function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) menu.style.display = 'none';
    contextTargetUserId = null;
    contextTargetUserName = null;
    contextTargetMessageId = null;
}

function replyToUser() {
    if (!contextTargetUserName) return;
    const msg = allMessages.find(m => m.id === contextTargetMessageId);
    if (msg) {
        replyToMessage = msg;
        const input = document.getElementById('messageInput');
        if (input) {
            input.placeholder = `Replying to ${contextTargetUserName}...`;
            input.focus();
            showToast(`💬 Replying to ${contextTargetUserName}`, 'info');
        }
    }
    hideContextMenu();
}

function copyUserMessage() {
    if (!contextTargetMessageId) return;
    const msg = allMessages.find(m => m.id === contextTargetMessageId);
    if (msg) {
        navigator.clipboard.writeText(msg.message || '');
        showToast('📋 Message copied!', 'success');
    }
    hideContextMenu();
}

function reportUser() {
    if (!contextTargetUserName) return;
    showToast(`🚩 Reported @${contextTargetUserName} to moderators`, 'info');
    hideContextMenu();
}

// ============================================
// MEDIA VIEWER MODAL
// ============================================

function openMediaViewer(url, type) {
    const overlay = document.getElementById('mediaModalOverlay');
    const body = document.getElementById('mediaModalBody');
    
    if (!overlay || !body) return;
    
    if (type === 'image') {
        body.innerHTML = `<img src="${url}" alt="Media" class="media-modal-image">`;
    } else if (type === 'video') {
        body.innerHTML = `
            <video src="${url}" class="media-modal-video" controls autoplay playsinline webkit-playsinline>
                Your browser does not support video playback.
            </video>
        `;
    }
    
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeMediaViewer() {
    const overlay = document.getElementById('mediaModalOverlay');
    const body = document.getElementById('mediaModalBody');
    
    if (overlay) overlay.classList.remove('active');
    if (body) {
        const video = body.querySelector('video');
        if (video) video.pause();
        body.innerHTML = '';
    }
    document.body.style.overflow = '';
}

// ============================================
// SEND MESSAGE
// ============================================

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text && !pendingFile && !pendingVoiceBlob) return;
    if (!currentUser) {
        showToast('🔒 Please login', 'error');
        return;
    }
    
    let fileUrl = null;
    let fileName = null;
    let messageType = 'text';
    let messageText = text;
    let replyTo = replyToMessage ? replyToMessage.id : null;
    
    if (!hasReplyColumn) {
        replyTo = null;
    }
    
    const sendBtn = document.getElementById('sendBtn');
    const originalHtml = sendBtn?.innerHTML;
    if (sendBtn) {
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sendBtn.disabled = true;
    }
    
    try {
        if (pendingFile) {
            const file = pendingFile;
            const ext = file.name.split('.').pop();
            const path = `chat_uploads/${currentUser.id}/${Date.now()}.${ext}`;
            
            const { error: uploadError } = await supabase.storage
                .from('chat-files')
                .upload(path, file, {
                    cacheControl: 'no-cache, no-store, must-revalidate'
                });
            
            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage
                    .from('chat-files')
                    .getPublicUrl(path);
                
                fileUrl = publicUrl + '?t=' + Date.now();
                fileName = file.name;
                if (file.type.startsWith('video/')) {
                    messageType = 'video';
                } else if (file.type.startsWith('image/')) {
                    messageType = 'image';
                } else {
                    messageType = 'file';
                }
                messageText = '';
            } else {
                showToast('❌ File upload failed', 'error');
                pendingFile = null;
                hideFilePreview();
                return;
            }
            pendingFile = null;
            hideFilePreview();
        }
        
        if (pendingVoiceBlob) {
            const path = `chat_uploads/${currentUser.id}/voice_${Date.now()}.webm`;
            
            const { error: uploadError } = await supabase.storage
                .from('chat-files')
                .upload(path, pendingVoiceBlob, {
                    contentType: 'audio/webm',
                    cacheControl: 'no-cache, no-store, must-revalidate'
                });
            
            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage
                    .from('chat-files')
                    .getPublicUrl(path);
                
                fileUrl = publicUrl + '?t=' + Date.now();
                messageType = 'voice';
                messageText = '';
            } else {
                showToast('❌ Voice upload failed', 'error');
                pendingVoiceBlob = null;
                hideVoicePreview();
                return;
            }
            pendingVoiceBlob = null;
            hideVoicePreview();
        }
        
        const message = {
            channel: currentChannel,
            sender_id: currentUser.id,
            sender_name: currentUser.user_metadata?.name || currentUser.email?.split('@')[0],
            message: messageText,
            type: messageType,
            file_url: fileUrl,
            file_name: fileName,
            created_at: new Date().toISOString()
        };
        
        if (hasReplyColumn && replyTo) {
            message.reply_to = replyTo;
        }
        
        const tempId = 'temp_' + Date.now();
        const tempMsg = { ...message, id: tempId };
        if (replyTo) tempMsg.reply_to = replyTo;
        allMessages.push(tempMsg);
        renderMessages();
        
        const { data, error } = await supabase
            .from('chat_messages')
            .insert([message])
            .select();
        
        if (error) {
            allMessages = allMessages.filter(m => m.id !== tempId);
            renderMessages();
            showToast(`❌ ${error.message}`, 'error');
            return;
        }
        
        if (data && data[0]) {
            const index = allMessages.findIndex(m => m.id === tempId);
            if (index !== -1) allMessages[index] = data[0];
            renderMessages();
        }
        
        input.value = '';
        input.placeholder = 'Type a message...';
        replyToMessage = null;
        scrollToBottom();
        
    } catch (error) {
        console.error('Send error:', error);
        showToast('❌ Failed to send', 'error');
    } finally {
        if (sendBtn) {
            sendBtn.innerHTML = originalHtml;
            sendBtn.disabled = false;
        }
    }
}

// ============================================
// REAL-TIME
// ============================================

function setupRealtimeSubscription() {
    if (messageSubscription) {
        messageSubscription.unsubscribe();
    }
    
    messageSubscription = supabase
        .channel('chat_realtime')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages'
        }, (payload) => {
            const msg = payload.new;
            
            if (lastMessageId === msg.id) return;
            if (allMessages.some(m => m.id === msg.id)) return;
            
            if (msg.channel === currentChannel) {
                lastMessageId = msg.id;
                allMessages.push(msg);
                renderMessages();
                markChannelRead(currentChannel);
                scrollToBottom();
            } else {
                if (unreadCounts[msg.channel] !== undefined) {
                    unreadCounts[msg.channel]++;
                    updateChannelBadge(msg.channel, unreadCounts[msg.channel]);
                }
            }
        })
        .subscribe();
}

// ============================================
// CHANNELS
// ============================================

function switchChannel(channel) {
    currentChannel = channel;
    
    document.querySelectorAll('.channel-item').forEach(el => {
        el.classList.toggle('active', el.dataset.channel === channel);
    });
    
    const nameEl = document.getElementById('channelName');
    if (nameEl) nameEl.textContent = channel;
    
    const iconEl = document.getElementById('channelIcon');
    if (iconEl) {
        const icons = {
            general: 'fa-hashtag',
            announcements: 'fa-bullhorn',
            help: 'fa-question-circle',
            random: 'fa-random',
            projects: 'fa-code'
        };
        iconEl.className = `fas ${icons[channel] || 'fa-hashtag'}`;
    }
    
    allMessages = [];
    replyToMessage = null;
    shownMentionToasts = new Set(); // Reset mention toasts on channel switch
    const input = document.getElementById('messageInput');
    if (input) input.placeholder = 'Type a message...';
    markChannelRead(channel);
    loadMessages();
    updateModalInfo(channel);
}

function markChannelRead(channel) {
    if (unreadCounts[channel] !== undefined) {
        unreadCounts[channel] = 0;
        updateChannelBadge(channel, 0);
    }
}

function updateChannelBadge(channel, count) {
    const badge = document.getElementById(`badge-${channel}`);
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
}

// ============================================
// ONLINE USERS
// ============================================

async function loadOnlineUsers() {
    if (presenceChannel) {
        const state = presenceChannel.presenceState();
        const onlineUsers = [];
        for (const [key, value] of Object.entries(state)) {
            if (value && value.length > 0) {
                onlineUsers.push(value[0]);
            }
        }
        updateOnlineUsersList(onlineUsers);
    }
}

// ============================================
// FILE HANDLING
// ============================================

function attachFile() {
    document.getElementById('fileInput').click();
}

function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
        showToast('❌ File too large (max 10MB)', 'error');
        return;
    }
    pendingFile = file;
    showFilePreview(file.name);
}

function showFilePreview(fileName) {
    const preview = document.getElementById('filePreview');
    const nameSpan = document.getElementById('previewFileName');
    if (preview && nameSpan) {
        nameSpan.textContent = fileName;
        preview.style.display = 'flex';
    }
}

function hideFilePreview() {
    const preview = document.getElementById('filePreview');
    if (preview) preview.style.display = 'none';
    const input = document.getElementById('fileInput');
    if (input) input.value = '';
}

function cancelFilePreview() {
    pendingFile = null;
    hideFilePreview();
}

// ============================================
// VOICE RECORDING
// ============================================

async function startVoiceRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100,
                channelCount: 1
            } 
        });
        
        const mimeTypes = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
        let mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
        
        mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };
        
        mediaRecorder.onstop = () => {
            const mime = mediaRecorder.mimeType || 'audio/webm';
            const blob = new Blob(audioChunks, { type: mime });
            
            if (blob.size > 1000) {
                pendingVoiceBlob = blob;
                pendingVoiceUrl = URL.createObjectURL(blob);
                showVoicePreview();
                setupVoicePreviewPlayback();
            } else {
                showToast('❌ Recording too short', 'error');
            }
            stream.getTracks().forEach(t => t.stop());
        };
        
        mediaRecorder.start(1000);
        isRecording = true;
        recordingStartTime = Date.now();
        
        const btn = document.getElementById('voiceRecordBtn');
        if (btn) {
            btn.classList.add('recording');
            btn.innerHTML = '<i class="fas fa-stop"></i>';
        }
        
        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            const dur = document.getElementById('voiceDuration');
            if (dur) dur.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
        
        if (navigator.vibrate) navigator.vibrate(50);
        showToast('🎤 Recording... Tap stop to preview', 'info');
    } catch (err) {
        console.error('Microphone error:', err);
        let errorMsg = '❌ Could not access microphone';
        if (err.name === 'NotAllowedError') {
            errorMsg = '❌ Please allow microphone access in your browser settings';
        } else if (err.name === 'NotFoundError') {
            errorMsg = '❌ No microphone found on this device';
        }
        showToast(errorMsg, 'error');
    }
}

function stopVoiceRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        if (recordingTimer) clearInterval(recordingTimer);
        
        const btn = document.getElementById('voiceRecordBtn');
        if (btn) {
            btn.classList.remove('recording');
            btn.innerHTML = '<i class="fas fa-microphone"></i>';
        }
    }
}

function toggleVoiceRecording() {
    if (isRecording) stopVoiceRecording();
    else startVoiceRecording();
}

function showVoicePreview() {
    const preview = document.getElementById('voicePreview');
    if (preview) preview.style.display = 'flex';
}

function hideVoicePreview() {
    const preview = document.getElementById('voicePreview');
    if (preview) preview.style.display = 'none';
    if (pendingVoiceUrl) {
        URL.revokeObjectURL(pendingVoiceUrl);
        pendingVoiceUrl = null;
    }
    if (voicePreviewAudio) {
        voicePreviewAudio.pause();
        voicePreviewAudio = null;
    }
    pendingVoiceBlob = null;
    isVoicePreviewPlaying = false;
}

function cancelVoicePreview() {
    if (voicePreviewAudio) {
        voicePreviewAudio.pause();
        voicePreviewAudio = null;
    }
    isVoicePreviewPlaying = false;
    pendingVoiceBlob = null;
    if (pendingVoiceUrl) {
        URL.revokeObjectURL(pendingVoiceUrl);
        pendingVoiceUrl = null;
    }
    hideVoicePreview();
}

function setupVoicePreviewPlayback() {
    const playBtn = document.getElementById('voicePreviewPlay');
    const wave = document.getElementById('voiceWavePreview');
    
    if (!playBtn || !pendingVoiceUrl) return;
    
    playBtn.replaceWith(playBtn.cloneNode(true));
    const newPlayBtn = document.getElementById('voicePreviewPlay');
    
    newPlayBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (isVoicePreviewPlaying) {
            if (voicePreviewAudio) {
                voicePreviewAudio.pause();
            }
            isVoicePreviewPlaying = false;
            this.innerHTML = '<i class="fas fa-play"></i>';
            if (wave) wave.classList.remove('playing');
            return;
        }
        
        if (!voicePreviewAudio) {
            voicePreviewAudio = new Audio(pendingVoiceUrl);
            voicePreviewAudio.preload = 'metadata';
            voicePreviewAudio.playsInline = true;
            voicePreviewAudio.setAttribute('playsinline', '');
            voicePreviewAudio.setAttribute('webkit-playsinline', '');
            
            voicePreviewAudio.onended = () => {
                isVoicePreviewPlaying = false;
                this.innerHTML = '<i class="fas fa-play"></i>';
                if (wave) wave.classList.remove('playing');
            };
            
            voicePreviewAudio.onerror = (e) => {
                console.error('Audio error:', e);
                const newUrl = pendingVoiceUrl + '?t=' + Date.now();
                this.src = newUrl;
                this.load();
                showToast('🔄 Reloading preview...', 'info');
                setTimeout(() => {
                    this.play().then(() => {
                        isVoicePreviewPlaying = true;
                        this.innerHTML = '<i class="fas fa-pause"></i>';
                        if (wave) wave.classList.add('playing');
                    }).catch(() => {
                        showToast('❌ Could not play preview', 'error');
                    });
                }, 500);
            };
        }
        
        voicePreviewAudio.play().then(() => {
            isVoicePreviewPlaying = true;
            this.innerHTML = '<i class="fas fa-pause"></i>';
            if (wave) wave.classList.add('playing');
        }).catch((err) => {
            console.error('Play error:', err);
            if (err.name === 'NotAllowedError') {
                showToast('👆 Tap play after interacting with the page', 'warning');
            } else {
                const newUrl = pendingVoiceUrl + '?t=' + Date.now();
                voicePreviewAudio.src = newUrl;
                voicePreviewAudio.load();
                setTimeout(() => {
                    voicePreviewAudio.play().then(() => {
                        isVoicePreviewPlaying = true;
                        this.innerHTML = '<i class="fas fa-pause"></i>';
                        if (wave) wave.classList.add('playing');
                    }).catch(() => {
                        showToast('❌ Could not play preview', 'error');
                    });
                }, 300);
            }
        });
    });
}

// ============================================
// EMOJI
// ============================================

function initEmojiGrid() {
    const grid = document.getElementById('emojiGrid');
    if (!grid) return;
    
    const emojis = [
        '😀', '😂', '❤️', '👍', '🔥', '🎉', '😎', '🤔',
        '💯', '🚀', '🎨', '💻', '🎬', '📸', '👋', '🙌',
        '💡', '🎯', '⚡', '✨', '💪', '🤝', '🌟', '🌈',
        '🎊', '🎁', '🏆', '⭐', '💎', '🎵', '📚', '🎓'
    ];
    
    grid.innerHTML = emojis.map(emoji => `
        <div class="emoji-item" onclick="addEmoji('${emoji}')">${emoji}</div>
    `).join('');
}

function toggleEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    if (picker) picker.classList.toggle('active');
}

function addEmoji(emoji) {
    const input = document.getElementById('messageInput');
    if (input) {
        input.value += emoji;
        input.focus();
        input.dispatchEvent(new Event('input'));
    }
    const picker = document.getElementById('emojiPicker');
    if (picker) picker.classList.remove('active');
}

// ============================================
// MODAL
// ============================================

function openChannelModal() {
    const modal = document.getElementById('channelModalOverlay');
    if (modal) {
        modal.classList.add('active');
        updateModalInfo(currentChannel);
        document.body.style.overflow = 'hidden';
        loadOnlineUsers();
    }
}

function closeChannelModal() {
    const modal = document.getElementById('channelModalOverlay');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function updateModalInfo(channel) {
    const nameEl = document.getElementById('modalChannelName');
    const descEl = document.getElementById('modalChannelDescription');
    const memberCount = document.getElementById('modalMemberCount');
    const messageCount = document.getElementById('modalMessageCount');
    
    const channelNames = {
        general: '#general',
        announcements: '#announcements',
        help: '#help',
        random: '#random',
        projects: '#projects'
    };
    
    const channelDescs = {
        general: 'General discussion for everyone. Share ideas, ask questions, and connect with the community.',
        announcements: 'Important updates and news from the Gliimu team. Stay informed!',
        help: 'Ask questions about courses, projects, or technical issues. Get help from the community.',
        random: 'Casual conversation, memes, and off-topic discussions. Have fun!',
        projects: 'Share your work, get feedback, and collaborate with other creators.'
    };
    
    if (nameEl) nameEl.textContent = channelNames[channel] || `#${channel}`;
    if (descEl) descEl.textContent = channelDescs[channel] || '';
    if (messageCount) messageCount.textContent = allMessages.length || 0;
}

// ============================================
// UI HELPERS
// ============================================

function toggleSidebar() {
    const sidebar = document.getElementById('chatSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('visible');
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (container) container.scrollTop = container.scrollHeight;
}

function checkScroll() {
    const container = document.getElementById('messagesContainer');
    const btn = document.getElementById('scrollToBottomBtn');
    if (!container || !btn) return;
    
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    btn.classList.toggle('visible', !nearBottom && container.scrollHeight > container.clientHeight);
}

function onTyping() {
    if (typingTimeout) clearTimeout(typingTimeout);
    
    const container = document.getElementById('typingIndicator');
    if (container) {
        container.innerHTML = `
            <div class="typing-indicator">
                <span>✍️ You are typing...</span>
                <div class="typing-dots"><span></span><span></span><span></span></div>
            </div>
        `;
    }
    
    typingTimeout = setTimeout(() => {
        const container = document.getElementById('typingIndicator');
        if (container) container.innerHTML = '';
    }, 1000);
}

// ============================================
// UTILITY
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    const sendBtn = document.getElementById('sendBtn');
    const input = document.getElementById('messageInput');
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
    
    const attachBtn = document.getElementById('attachFileBtn');
    const fileInput = document.getElementById('fileInput');
    if (attachBtn) attachBtn.addEventListener('click', () => fileInput?.click());
    if (fileInput) fileInput.addEventListener('change', () => handleFileSelect(fileInput));
    
    const voiceBtn = document.getElementById('voiceRecordBtn');
    if (voiceBtn) voiceBtn.addEventListener('click', toggleVoiceRecording);
    
    const emojiBtn = document.getElementById('emojiBtn');
    const emojiClose = document.getElementById('emojiCloseBtn');
    if (emojiBtn) emojiBtn.addEventListener('click', toggleEmojiPicker);
    if (emojiClose) emojiClose.addEventListener('click', toggleEmojiPicker);
    document.addEventListener('click', (e) => {
        const picker = document.getElementById('emojiPicker');
        if (picker && !picker.contains(e.target) && !e.target.closest('#emojiBtn')) {
            picker.classList.remove('active');
        }
    });
    
    const menuToggle = document.getElementById('menuToggleBtn');
    const closeSidebar = document.getElementById('closeSidebarBtn');
    const overlay = document.getElementById('sidebarOverlay');
    if (menuToggle) menuToggle.addEventListener('click', toggleSidebar);
    if (closeSidebar) closeSidebar.addEventListener('click', toggleSidebar);
    if (overlay) overlay.addEventListener('click', toggleSidebar);
    
    const modalClose = document.getElementById('channelModalClose');
    const modalBtn = document.getElementById('modalCloseBtn');
    const modalOverlay = document.getElementById('channelModalOverlay');
    if (modalClose) modalClose.addEventListener('click', closeChannelModal);
    if (modalBtn) modalBtn.addEventListener('click', closeChannelModal);
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeChannelModal();
        });
    }
    
    const infoToggle = document.getElementById('infoToggleBtn');
    if (infoToggle) {
        infoToggle.addEventListener('click', openChannelModal);
    }
    
    const mediaClose = document.getElementById('mediaModalClose');
    const mediaOverlay = document.getElementById('mediaModalOverlay');
    if (mediaClose) mediaClose.addEventListener('click', closeMediaViewer);
    if (mediaOverlay) {
        mediaOverlay.addEventListener('click', (e) => {
            if (e.target === mediaOverlay) closeMediaViewer();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mediaOverlay.classList.contains('active')) {
                closeMediaViewer();
            }
        });
    }
    
    const scrollBtn = document.getElementById('scrollToBottomBtn');
    const messages = document.getElementById('messagesContainer');
    if (scrollBtn) scrollBtn.addEventListener('click', scrollToBottom);
    if (messages) messages.addEventListener('scroll', checkScroll);
    
    const cancelFile = document.getElementById('cancelFileBtn');
    const cancelVoice = document.getElementById('cancelVoiceBtn');
    if (cancelFile) cancelFile.addEventListener('click', cancelFilePreview);
    if (cancelVoice) cancelVoice.addEventListener('click', cancelVoicePreview);
    
    document.querySelectorAll('.channel-item').forEach(el => {
        el.addEventListener('click', () => {
            const channel = el.dataset.channel;
            if (channel) switchChannel(channel);
        });
    });
    
    const contextReply = document.getElementById('contextReply');
    const contextCopy = document.getElementById('contextCopy');
    const contextReport = document.getElementById('contextReport');
    if (contextReply) contextReply.addEventListener('click', replyToUser);
    if (contextCopy) contextCopy.addEventListener('click', copyUserMessage);
    if (contextReport) contextReport.addEventListener('click', reportUser);
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.context-menu')) {
            hideContextMenu();
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && replyToMessage) {
            replyToMessage = null;
            const input = document.getElementById('messageInput');
            if (input) input.placeholder = 'Type a message...';
            showToast('Reply cancelled', 'info');
        }
    });
}

// ============================================
// EXPOSE TO WINDOW
// ============================================

window.sendMessage = sendMessage;
window.switchChannel = switchChannel;
window.toggleSidebar = toggleSidebar;
window.toggleEmojiPicker = toggleEmojiPicker;
window.toggleVoiceRecording = toggleVoiceRecording;
window.playVoiceMessage = playVoiceMessage;
window.addEmoji = addEmoji;
window.scrollToBottom = scrollToBottom;
window.loadOnlineUsers = loadOnlineUsers;
window.cancelFilePreview = cancelFilePreview;
window.cancelVoicePreview = cancelVoicePreview;
window.openChannelModal = openChannelModal;
window.closeChannelModal = closeChannelModal;
window.openMediaViewer = openMediaViewer;
window.closeMediaViewer = closeMediaViewer;
window.scrollToMessage = scrollToMessage;
window.showToast = showToast;

console.log('✅ Chat.js loaded');
