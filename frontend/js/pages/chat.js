// ============================================
// 💬 COMMUNITY CHAT - GLIIMU
// Complete Updated Version - Fixed Theme, Online Users, Context Menu
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// GET USER WITH ROLE
// ============================================

async function getCurrentUserWithRole() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) return null;
        
        const { data: profile } = await supabase
            .from('users')
            .select('role, name, avatar_url')
            .eq('id', user.id)
            .single();
        
        return {
            ...user,
            role: profile?.role || 'student',
            name: profile?.name || user.user_metadata?.name || 'User',
            avatar: profile?.avatar_url || null
        };
    } catch (e) {
        console.error('Error getting user with role:', e);
        return null;
    }
}

// ============================================
// STATE
// ============================================

let currentUser = null;
let currentUserRole = null;
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
let replyToMessage = null;
let hasReplyColumn = true;
let shownMentionToasts = new Set();
let presenceInitialized = false;
let onlineInterval = null;
let channelsExpanded = false;

// Audio recording
let audioContext = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;
let mediaStream = null;
let scriptProcessor = null;

// Voice preview
let voicePreviewAudio = null;
let isVoicePreviewPlaying = false;

// ============================================
// CHANNEL CONFIGURATION - 5 CHANNELS
// ============================================

const CHANNEL_CONFIG = {
    general: {
        name: 'general',
        icon: 'fa-hashtag',
        label: '💬 general',
        description: 'General discussion for everyone. Share ideas, ask questions, and connect with the community.',
        access: ['all'],
        rules: ['Be respectful to all members', 'No spam or self-promotion', 'Stay on topic', 'No inappropriate content']
    },
    students: {
        name: 'students',
        icon: 'fa-graduation-cap',
        label: '🎓 students',
        description: 'Student-focused discussions, course help, peer support, and study groups.',
        access: ['student', 'instructor', 'admin', 'board'],
        rules: ['Be supportive', 'No academic dishonesty', 'Help fellow students', 'Stay on topic']
    },
    instructors: {
        name: 'instructors',
        icon: 'fa-chalkboard-teacher',
        label: '👨‍🏫 instructors',
        description: 'Instructor collaboration, curriculum planning, teaching resources, and faculty discussions.',
        access: ['instructor', 'admin', 'board'],
        rules: ['Professional conduct', 'Share resources', 'Collaborate effectively']
    },
    admin: {
        name: 'admin',
        icon: 'fa-users-cog',
        label: '⚙️ admin',
        description: 'Administrative communications, platform management, policy discussions, and staff coordination.',
        access: ['admin', 'board'],
        rules: ['Confidential information', 'Professional conduct', 'Follow platform policies']
    },
    boardroom: {
        name: 'boardroom',
        icon: 'fa-handshake',
        label: '🤝 boardroom',
        description: 'Strategic discussions, board matters, confidential decisions, and institutional planning.',
        access: ['board'],
        rules: ['Strictly confidential', 'Board members only', 'Professional conduct', 'No external sharing']
    }
};

// ============================================
// UNREAD COUNTS
// ============================================

let unreadCounts = {
    general: 0,
    students: 0,
    instructors: 0,
    admin: 0,
    boardroom: 0
};

// ============================================
// THEME MANAGEMENT - FIXED
// ============================================

function initTheme() {
    const dashboardTheme = localStorage.getItem('dashboard_theme');
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let theme = 'light';
    
    // Check dashboard_theme first (highest priority)
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
    // Default is 'light'
    
    // Apply theme to body
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        isDarkMode = true;
    } else {
        document.body.classList.remove('dark-mode');
        isDarkMode = false;
    }
    
    // Sync localStorage
    localStorage.setItem('theme', theme);
    localStorage.setItem('dashboard_theme', theme);
    
    console.log('🎨 Theme initialized:', theme, 'mode');
}

// ============================================
// STICKY NAVIGATION
// ============================================

function toggleNav() {
    const dropdown = document.getElementById('navDropdown');
    const toggle = document.getElementById('navToggle');
    if (dropdown) dropdown.classList.toggle('open');
    if (toggle) toggle.classList.toggle('active');
}

// Close nav when clicking outside
document.addEventListener('click', function(e) {
    const nav = document.getElementById('stickyNav');
    if (nav && !nav.contains(e.target)) {
        const dropdown = document.getElementById('navDropdown');
        const toggle = document.getElementById('navToggle');
        if (dropdown) dropdown.classList.remove('open');
        if (toggle) toggle.classList.remove('active');
    }
});

function reportIssue() {
    showToast('📝 Report an issue? Our team will investigate.', 'info');
}

// ============================================
// COLLAPSIBLE CHANNELS
// ============================================

function toggleChannels() {
    channelsExpanded = !channelsExpanded;
    const list = document.getElementById('channelsList');
    const icon = document.querySelector('.collapse-icon');
    if (list) {
        list.classList.toggle('open', channelsExpanded);
    }
    if (icon) {
        icon.classList.toggle('open', channelsExpanded);
    }
}

// ============================================
// GET AVAILABLE CHANNELS
// ============================================

function getAvailableChannels() {
    let accessRole = currentUserRole || 'student';
    if (['crm', 'secretary', 'manager'].includes(accessRole)) {
        accessRole = 'admin';
    }
    
    const available = [];
    for (const [key, config] of Object.entries(CHANNEL_CONFIG)) {
        if (config.access.includes('all') || config.access.includes(accessRole)) {
            available.push(key);
        }
    }
    
    console.log('📢 Available channels for role:', currentUserRole, '->', available);
    return available;
}

// ============================================
// LOAD/SAVE MENTION TOASTS
// ============================================

function loadMentionToasts() {
    try {
        const saved = localStorage.getItem('chat_mention_toasts');
        if (saved) {
            const data = JSON.parse(saved);
            shownMentionToasts = new Set(data);
        }
    } catch (e) {
        shownMentionToasts = new Set();
    }
}

function saveMentionToast(messageId) {
    shownMentionToasts.add(messageId);
    try {
        localStorage.setItem('chat_mention_toasts', JSON.stringify([...shownMentionToasts]));
    } catch (e) {}
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
// RENDER CHANNELS
// ============================================

function renderChannels() {
    const container = document.getElementById('channelsList');
    if (!container) {
        console.error('❌ channelsList element not found');
        return;
    }
    
    const available = getAvailableChannels();
    console.log('📢 Rendering channels:', available);
    
    if (available.length === 0) {
        container.innerHTML = `<div class="empty-state-text">No channels available</div>`;
        return;
    }
    
    if (!available.includes(currentChannel)) {
        currentChannel = available[0];
    }
    
    let html = '';
    for (const key of available) {
        const config = CHANNEL_CONFIG[key];
        const isActive = key === currentChannel;
        html += `
            <div class="channel-item ${isActive ? 'active' : ''}" data-channel="${key}">
                <span class="channel-name">${config.label}</span>
            </div>
        `;
    }
    
    container.innerHTML = html;
    
    // Auto-expand on first load
    if (!channelsExpanded && available.length > 0) {
        channelsExpanded = true;
        container.classList.add('open');
        const icon = document.querySelector('.collapse-icon');
        if (icon) icon.classList.add('open');
    }
    
    // Update header
    const config = CHANNEL_CONFIG[currentChannel];
    const nameEl = document.getElementById('channelName');
    if (nameEl) nameEl.textContent = config ? config.label.replace(/[^a-zA-Z0-9 ]/g, '').trim() : currentChannel;
    
    const iconEl = document.getElementById('channelIcon');
    if (iconEl) {
        iconEl.className = `fas ${config ? config.icon : 'fa-hashtag'}`;
    }
    
    // Add click listeners
    container.querySelectorAll('.channel-item').forEach(el => {
        el.addEventListener('click', () => {
            const channel = el.dataset.channel;
            if (channel && channel !== currentChannel) {
                switchChannel(channel);
            }
        });
    });
}

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('💬 Chat initializing...');
    
    initTheme();
    fixMobileViewport();
    loadMentionToasts();
    
    const navToggle = document.getElementById('navToggle');
    if (navToggle) {
        navToggle.addEventListener('click', toggleNav);
    }
    
    const channelsToggle = document.getElementById('channelsToggle');
    if (channelsToggle) {
        channelsToggle.addEventListener('click', toggleChannels);
    }
    
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
        currentUser = await getCurrentUserWithRole();
        currentUserRole = currentUser?.role || 'student';
        console.log('👤 User loaded:', currentUser?.email, 'Role:', currentUserRole);
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
    
    renderChannels();
    await loadMessages();
    setupRealtimeSubscription();
    await setupPresenceTracking();
    setupEventListeners();
    markChannelRead(currentChannel);
    initEmojiGrid();
    
    setInterval(() => {
        refreshOnlineUsers();
    }, 15000);
    
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
    
    const name = currentUser.name || currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'User';
    
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
// ONLINE USERS - DATABASE TABLE APPROACH
// ============================================

async function setupPresenceTracking() {
    if (!currentUser) return;
    if (presenceInitialized) return;
    
    console.log('🟢 Setting up online users tracking...');
    
    await markUserOnline();
    
    onlineInterval = setInterval(async () => {
        await markUserOnline();
    }, 30000);
    
    await refreshOnlineUsers();
    
    presenceInitialized = true;
    
    window.addEventListener('beforeunload', async () => {
        if (onlineInterval) {
            clearInterval(onlineInterval);
        }
        await markUserOffline();
    });
}

async function markUserOnline() {
    if (!currentUser) return;
    
    try {
        const name = currentUser.name || currentUser.user_metadata?.name || 'User';
        const role = currentUser.role || currentUserRole || 'student';
        const avatar = currentUser.avatar || currentUser.user_metadata?.avatar_url || null;
        
        const { error } = await supabase
            .from('online_users')
            .upsert({
                user_id: currentUser.id,
                user_name: name,
                user_role: role,
                avatar_url: avatar,
                last_seen: new Date().toISOString()
            }, { onConflict: 'user_id' });
        
        if (error) {
            console.warn('Error marking user online:', error);
        }
    } catch (error) {
        console.warn('Error marking user online:', error);
    }
}

async function markUserOffline() {
    if (!currentUser) return;
    
    try {
        const { error } = await supabase
            .from('online_users')
            .delete()
            .eq('user_id', currentUser.id);
        
        if (error) {
            console.warn('Error marking user offline:', error);
        }
    } catch (error) {
        console.warn('Error marking user offline:', error);
    }
}

async function refreshOnlineUsers() {
    try {
        const cutoffTime = new Date();
        cutoffTime.setSeconds(cutoffTime.getSeconds() - 60);
        
        const { data: users, error } = await supabase
            .from('online_users')
            .select('user_id, user_name, user_role, avatar_url, last_seen')
            .gte('last_seen', cutoffTime.toISOString())
            .order('user_name', { ascending: true });
        
        if (error) {
            console.error('Error loading online users:', error);
            return;
        }
        
        console.log('👥 Online users from database:', users?.length || 0);
        updateOnlineUsersList(users || []);
    } catch (error) {
        console.error('Error loading online users:', error);
    }
}

function updateOnlineUsersList(users) {
    // Update modal online users
    const modalContainer = document.getElementById('modalOnlineUsersList');
    if (modalContainer) {
        const otherUsers = users.filter(user => user.user_id !== currentUser?.id);
        const sortedUsers = otherUsers.sort((a, b) => (a.user_name || '').localeCompare(b.user_name || ''));
        
        const currentUserData = users.find(user => user.user_id === currentUser?.id);
        
        let allSorted = [];
        if (currentUserData) {
            allSorted.push(currentUserData);
        }
        allSorted = allSorted.concat(sortedUsers);
        
        if (allSorted.length === 0) {
            modalContainer.innerHTML = `<div class="empty-state-text">No users online</div>`;
        } else {
            modalContainer.innerHTML = allSorted.map(user => {
                const isCurrentUser = user.user_id === currentUser?.id;
                const avatarUrl = user.avatar_url || userAvatars[user.user_id] || null;
                const initials = getInitials(user.user_name);
                const displayName = isCurrentUser ? 'You' : escapeHtml(user.user_name || 'User');
                const role = isCurrentUser ? '' : (user.user_role || 'Member');
                
                return `
                    <div class="user-item ${isCurrentUser ? 'current-user-item' : ''}" data-user-id="${user.user_id}" data-user-name="${escapeHtml(user.user_name)}">
                        <div class="user-avatar">
                            ${avatarUrl ? 
                                `<img src="${avatarUrl}" alt="${escapeHtml(user.user_name)}">` :
                                `<span>${initials}</span>`
                            }
                        </div>
                        <div class="user-info">
                            <div class="user-name">${displayName}</div>
                            ${!isCurrentUser ? `<div class="user-role">${escapeHtml(role)}</div>` : ''}
                        </div>
                        <span class="online-dot"></span>
                    </div>
                `;
            }).join('');
            
            // Add click listeners to user items for portfolio navigation
            modalContainer.querySelectorAll('.user-item').forEach(item => {
                const userId = item.dataset.userId;
                const userName = item.dataset.userName;
                if (userId && userId !== currentUser?.id) {
                    item.addEventListener('click', () => {
                        goToUserPortfolio(userName);
                    });
                }
            });
        }
    }
    
    // Update sidebar online users
    const sidebarContainer = document.getElementById('onlineUsersList');
    if (sidebarContainer) {
        const otherUsers = users.filter(user => user.user_id !== currentUser?.id);
        const sortedUsers = otherUsers.sort((a, b) => (a.user_name || '').localeCompare(b.user_name || ''));
        
        const currentUserData = users.find(user => user.user_id === currentUser?.id);
        
        let allSorted = [];
        if (currentUserData) {
            allSorted.push(currentUserData);
        }
        allSorted = allSorted.concat(sortedUsers);
        
        if (allSorted.length === 0) {
            sidebarContainer.innerHTML = `<div class="empty-state-text">No users online</div>`;
        } else {
            sidebarContainer.innerHTML = allSorted.map(user => {
                const isCurrentUser = user.user_id === currentUser?.id;
                const avatarUrl = user.avatar_url || userAvatars[user.user_id] || null;
                const initials = getInitials(user.user_name);
                const displayName = isCurrentUser ? 'You' : escapeHtml(user.user_name || 'User');
                const role = isCurrentUser ? '' : (user.user_role || 'Member');
                
                return `
                    <div class="user-item ${isCurrentUser ? 'current-user-item' : ''}" data-user-id="${user.user_id}" data-user-name="${escapeHtml(user.user_name)}">
                        <div class="user-avatar">
                            ${avatarUrl ? 
                                `<img src="${avatarUrl}" alt="${escapeHtml(user.user_name)}">` :
                                `<span>${initials}</span>`
                            }
                        </div>
                        <div class="user-info">
                            <div class="user-name">${displayName}</div>
                            ${!isCurrentUser ? `<div class="user-role">${escapeHtml(role)}</div>` : ''}
                        </div>
                        <span class="online-dot"></span>
                    </div>
                `;
            }).join('');
            
            // Add click listeners to user items for portfolio navigation
            sidebarContainer.querySelectorAll('.user-item').forEach(item => {
                const userId = item.dataset.userId;
                const userName = item.dataset.userName;
                if (userId && userId !== currentUser?.id) {
                    item.addEventListener('click', () => {
                        goToUserPortfolio(userName);
                    });
                }
            });
        }
    }
    
    const count = document.getElementById('onlineCount');
    if (count) count.textContent = users.length;
}

// ============================================
// NAVIGATE TO USER PORTFOLIO
// ============================================

function goToUserPortfolio(userName) {
    if (!userName) return;
    const username = userName.toLowerCase().replace(/\s+/g, '-');
    window.location.href = `/u/${username}`;
}

// ============================================
// MESSAGES
// ============================================

async function loadMessages() {
    const container = document.getElementById('messagesContainer');
    if (!container) {
        console.error('❌ messagesContainer element not found');
        return;
    }
    
    try {
        let selectQuery = '*';
        if (!hasReplyColumn) {
            selectQuery = 'id, channel, sender_id, sender_name, message, type, file_url, file_name, created_at';
        }
        
        console.log('📨 Loading messages for channel:', currentChannel);
        
        const { data: messages, error } = await supabase
            .from('chat_messages')
            .select(selectQuery)
            .eq('channel', currentChannel)
            .order('created_at', { ascending: true })
            .limit(100);
        
        if (error) {
            console.error('❌ Error loading messages:', error);
            showToast('❌ Failed to load messages', 'error');
            return;
        }
        
        console.log('📨 Loaded', messages?.length || 0, 'messages');
        
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
        console.error('❌ Exception loading messages:', error);
        showToast('❌ Error loading messages', 'error');
    }
}

async function insertWelcomeMessage() {
    const config = CHANNEL_CONFIG[currentChannel];
    if (!config) return;
    
    const welcome = {
        channel: currentChannel,
        sender_id: null,
        sender_name: 'System',
        message: `👋 Welcome to ${config.label}! ${config.description}`,
        type: 'text',
        created_at: new Date().toISOString()
    };
    
    try {
        const { error } = await supabase.from('chat_messages').insert([welcome]);
        if (error) {
            console.warn('Could not insert welcome message:', error);
        }
    } catch (error) {
        console.warn('Could not insert welcome message:', error);
    }
}

function renderMessages() {
    const container = document.getElementById('messagesContainer');
    if (!container) {
        console.error('❌ messagesContainer element not found');
        return;
    }
    
    if (allMessages.length === 0) {
        const config = CHANNEL_CONFIG[currentChannel];
        container.innerHTML = `
            <div class="welcome-message">
                <i class="fas fa-comments"></i>
                <h3>👋 Welcome to ${config ? config.label : '#' + currentChannel}</h3>
                <p>${config ? config.description : 'Start the conversation!'}</p>
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
        
        const mentionKey = `mention_${msg.id}`;
        const mentionName = currentUser.name || currentUser.user_metadata?.name || currentUser.email?.split('@')[0];
        const hasMention = msg.message && msg.message.includes(`@${mentionName}`);
        if (hasMention && !isSelf && !shownMentionToasts.has(mentionKey)) {
            saveMentionToast(mentionKey);
            showToast(`📢 ${senderName} mentioned you`, 'info');
        }
        
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
        
        // IMAGE
        if (msg.type === 'image' && msg.file_url) {
            contentHtml = `
                ${replyHtml}
                <div class="message-bubble image-bubble" onclick="openMediaViewer('${msg.file_url}', 'image')">
                    <img src="${msg.file_url}" alt="Image" class="message-image" loading="lazy">
                </div>
            `;
        } 
        // VIDEO
        else if (msg.type === 'video' && msg.file_url) {
            contentHtml = `
                ${replyHtml}
                <div class="message-bubble video-bubble" onclick="openMediaViewer('${msg.file_url}', 'video')">
                    <video src="${msg.file_url}" class="message-video" muted playsinline webkit-playsinline preload="metadata" loading="lazy"></video>
                    <div class="video-play-overlay"><i class="fas fa-play-circle"></i></div>
                </div>
            `;
        } 
        // FILE
        else if (msg.type === 'file' && msg.file_url) {
            contentHtml = `
                ${replyHtml}
                <div class="message-bubble file-bubble">
                    <a href="${msg.file_url}" target="_blank" class="message-file">
                        <i class="fas fa-file-download"></i>
                        <span>📄 ${escapeHtml(msg.file_name || 'Download')}</span>
                    </a>
                </div>
            `;
        } 
        // VOICE
        else if (msg.type === 'voice' && msg.file_url) {
            const baseUrl = msg.file_url.split('?')[0];
            const isWav = baseUrl.toLowerCase().endsWith('.wav');
            const voiceUrl = baseUrl + '?t=' + Date.now();
            
            contentHtml = `
                ${replyHtml}
                <div class="message-bubble voice-bubble">
                    <div class="voice-message">
                        <button class="voice-play-btn" onclick="playVoiceMessage(this, '${voiceUrl}', ${isWav})">
                            <i class="fas fa-play"></i>
                        </button>
                        <div class="voice-wave">
                            <span></span><span></span><span></span><span></span><span></span>
                        </div>
                        <audio style="display:none;" preload="none" playsinline webkit-playsinline></audio>
                    </div>
                </div>
            `;
        } 
        // TEXT
        else {
            let messageText = escapeHtml(msg.message);
            if (hasMention) {
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

async function playVoiceMessage(btn, audioUrl, isWav) {
    const container = btn.parentElement;
    const icon = btn.querySelector('i');
    let audioEl = container.querySelector('audio');
    
    document.querySelectorAll('.voice-play-btn i').forEach(el => {
        if (el !== icon) {
            el.className = 'fas fa-play';
            const parent = el.closest('.voice-message');
            if (parent) {
                const otherAudio = parent.querySelector('audio');
                if (otherAudio) {
                    otherAudio.pause();
                    otherAudio.currentTime = 0;
                }
            }
        }
    });
    
    if (audioEl && !audioEl.paused) {
        audioEl.pause();
        icon.className = 'fas fa-play';
        return;
    }
    
    await loadAndPlayVoice(btn, audioUrl, isWav);
}

async function loadAndPlayVoice(btn, audioUrl, isWav) {
    const icon = btn.querySelector('i');
    const container = btn.parentElement;
    let audioEl = container.querySelector('audio');
    
    if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.style.display = 'none';
        audioEl.playsInline = true;
        audioEl.setAttribute('playsinline', '');
        audioEl.setAttribute('webkit-playsinline', '');
        audioEl.preload = 'auto';
        container.appendChild(audioEl);
    }
    
    icon.className = 'fas fa-spinner fa-spin';
    btn.disabled = true;
    
    try {
        const baseUrl = audioUrl.split('?')[0];
        const freshUrl = baseUrl + '?t=' + Date.now();
        
        if (isWav) {
            audioEl.src = freshUrl;
            audioEl.load();
            
            await new Promise((resolve) => {
                const timeout = setTimeout(resolve, 5000);
                const onReady = () => {
                    clearTimeout(timeout);
                    audioEl.removeEventListener('canplaythrough', onReady);
                    audioEl.removeEventListener('loadeddata', onReady);
                    resolve();
                };
                audioEl.addEventListener('canplaythrough', onReady);
                audioEl.addEventListener('loadeddata', onReady);
                if (audioEl.readyState >= 3) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            
            await audioEl.play();
            icon.className = 'fas fa-pause';
            btn.disabled = false;
            audioEl.onended = () => {
                icon.className = 'fas fa-play';
            };
            return;
        }
        
        // WebM fallback
        try {
            audioEl.src = freshUrl;
            audioEl.load();
            
            await new Promise((resolve) => {
                const timeout = setTimeout(resolve, 5000);
                const onReady = () => {
                    clearTimeout(timeout);
                    audioEl.removeEventListener('canplaythrough', onReady);
                    audioEl.removeEventListener('loadeddata', onReady);
                    resolve();
                };
                audioEl.addEventListener('canplaythrough', onReady);
                audioEl.addEventListener('loadeddata', onReady);
                if (audioEl.readyState >= 3) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            
            await audioEl.play();
            icon.className = 'fas fa-pause';
            btn.disabled = false;
            audioEl.onended = () => {
                icon.className = 'fas fa-play';
            };
            return;
        } catch (directErr) {
            console.log('Direct URL failed, trying blob:', directErr);
        }
        
        const response = await fetch(freshUrl, {
            cache: 'no-cache',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const blob = await response.blob();
        if (blob.size === 0) {
            throw new Error('Empty audio file');
        }
        
        const blobUrl = URL.createObjectURL(blob);
        audioEl.src = blobUrl;
        audioEl.load();
        
        await new Promise((resolve) => {
            const timeout = setTimeout(resolve, 8000);
            const onReady = () => {
                clearTimeout(timeout);
                audioEl.removeEventListener('canplaythrough', onReady);
                audioEl.removeEventListener('loadeddata', onReady);
                resolve();
            };
            audioEl.addEventListener('canplaythrough', onReady);
            audioEl.addEventListener('loadeddata', onReady);
            if (audioEl.readyState >= 3) {
                clearTimeout(timeout);
                resolve();
            }
        });
        
        await audioEl.play();
        icon.className = 'fas fa-pause';
        btn.disabled = false;
        audioEl.onended = () => {
            icon.className = 'fas fa-play';
            URL.revokeObjectURL(blobUrl);
        };
        
    } catch (err) {
        console.error('Load error:', err);
        icon.className = 'fas fa-play';
        btn.disabled = false;
        
        try {
            const freshUrl = audioUrl.split('?')[0] + '?t=' + Date.now();
            audioEl.src = freshUrl;
            audioEl.load();
            await audioEl.play();
            icon.className = 'fas fa-pause';
            btn.disabled = false;
            audioEl.onended = () => {
                icon.className = 'fas fa-play';
            };
        } catch (finalErr) {
            console.error('Final fallback failed:', finalErr);
            showToast('❌ Could not play voice message', 'error');
        }
    }
}

// ============================================
// VOICE RECORDING - WAV FOR ALL DEVICES
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
        
        mediaStream = stream;
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        const wavChunks = [];
        
        processor.onaudioprocess = (event) => {
            if (!isRecording) return;
            const inputData = event.inputBuffer.getChannelData(0);
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            wavChunks.push(pcmData);
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
        scriptProcessor = processor;
        
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
        
        window._wavChunks = wavChunks;
        
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
    if (!isRecording) return;
    
    isRecording = false;
    if (recordingTimer) clearInterval(recordingTimer);
    
    const btn = document.getElementById('voiceRecordBtn');
    if (btn) {
        btn.classList.remove('recording');
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
    }
    
    const wavChunks = window._wavChunks || [];
    window._wavChunks = [];
    
    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    
    if (wavChunks.length > 0) {
        const totalLength = wavChunks.reduce((acc, chunk) => acc + chunk.length, 0);
        if (totalLength > 0) {
            const combinedPCM = new Int16Array(totalLength);
            let offset = 0;
            for (const chunk of wavChunks) {
                combinedPCM.set(chunk, offset);
                offset += chunk.length;
            }
            
            const wavBlob = createWavBlob(combinedPCM, 44100);
            if (wavBlob.size > 1000) {
                pendingVoiceBlob = wavBlob;
                pendingVoiceUrl = URL.createObjectURL(wavBlob);
                showVoicePreview();
                setupVoicePreviewPlayback();
                console.log('🎤 WAV recorded:', wavBlob.size, 'bytes');
                showToast('✅ Voice recorded! Tap play to preview', 'success');
            } else {
                showToast('❌ Recording too short', 'error');
            }
        } else {
            showToast('❌ Recording failed', 'error');
        }
    } else {
        showToast('❌ No audio captured', 'error');
    }
}

function toggleVoiceRecording() {
    if (isRecording) {
        stopVoiceRecording();
    } else {
        startVoiceRecording();
    }
}

function createWavBlob(pcmData, sampleRate) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = pcmData.length * 2;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;
    
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    const pcmView = new Int16Array(buffer, headerSize, pcmData.length);
    pcmView.set(pcmData);
    
    return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
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
// AVATAR EVENTS
// ============================================

function attachAvatarEvents() {
    document.querySelectorAll('.message-avatar').forEach(avatar => {
        const userId = avatar.dataset.userId;
        const userName = avatar.dataset.userName;
        
        if (!userId || userId === currentUser?.id) return;
        
        avatar.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e, userId, userName);
        });
        
        avatar.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e, userId, userName);
        });
    });
}

// ============================================
// MESSAGE EVENTS
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
// CONTEXT MENU - Updated
// ============================================

let contextTargetUserId = null;
let contextTargetUserName = null;
let contextTargetMessageId = null;
let contextTargetAvatarUrl = null;
let reactSubmenuOpen = false;

function showContextMenu(event, userId, userName) {
    const menu = document.getElementById('contextMenu');
    if (!menu) return;
    
    contextTargetUserId = userId;
    contextTargetUserName = userName;
    
    const avatar = event.currentTarget || event.target;
    const avatarImg = avatar.querySelector('img');
    contextTargetAvatarUrl = avatarImg ? avatarImg.src : null;
    
    const messageGroup = avatar.closest('.message-group');
    if (messageGroup) {
        contextTargetMessageId = messageGroup.dataset.messageId;
    }
    
    if (!contextTargetMessageId) {
        const msg = allMessages.filter(m => m.sender_id === userId).pop();
        contextTargetMessageId = msg ? msg.id : null;
    }
    
    const x = event.clientX || event.touches?.[0]?.clientX || 0;
    const y = event.clientY || event.touches?.[0]?.clientY || 0;
    
    // Show all items, hide react submenu by default
    document.querySelectorAll('.context-item').forEach(item => {
        item.style.display = 'flex';
    });
    document.querySelectorAll('.context-divider').forEach(item => {
        item.style.display = 'block';
    });
    
    const reactSubmenu = document.getElementById('reactSubmenu');
    if (reactSubmenu) {
        reactSubmenu.style.display = 'none';
    }
    reactSubmenuOpen = false;
    
    menu.style.display = 'block';
    menu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 280)}px`;
}

function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) menu.style.display = 'none';
    contextTargetUserId = null;
    contextTargetUserName = null;
    contextTargetMessageId = null;
    contextTargetAvatarUrl = null;
    reactSubmenuOpen = false;
}

// ============================================
// CONTEXT MENU ACTIONS
// ============================================

function viewPortfolio() {
    if (!contextTargetUserId || !contextTargetUserName) {
        showToast('User not found', 'error');
        hideContextMenu();
        return;
    }
    
    goToUserPortfolio(contextTargetUserName);
    hideContextMenu();
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

function toggleReactSubmenu() {
    const submenu = document.getElementById('reactSubmenu');
    if (!submenu) return;
    
    reactSubmenuOpen = !reactSubmenuOpen;
    submenu.style.display = reactSubmenuOpen ? 'flex' : 'none';
}

function reactToMessage(reaction) {
    if (!contextTargetMessageId) {
        showToast('No message to react to', 'error');
        hideContextMenu();
        return;
    }
    
    const reactions = JSON.parse(localStorage.getItem('message_reactions_' + contextTargetMessageId) || '{}');
    const userId = currentUser.id;
    
    if (reactions[userId] === reaction) {
        delete reactions[userId];
        showToast('Reaction removed', 'info');
    } else {
        reactions[userId] = reaction;
        showToast(`Reacted with ${reaction}`, 'success');
    }
    
    localStorage.setItem('message_reactions_' + contextTargetMessageId, JSON.stringify(reactions));
    
    const element = document.querySelector(`.message-group[data-message-id="${contextTargetMessageId}"]`);
    if (element) {
        element.classList.add('reacted-flash');
        setTimeout(() => element.classList.remove('reacted-flash'), 1000);
        
        let reactionBadge = element.querySelector('.reaction-badge');
        if (reactions[userId]) {
            if (!reactionBadge) {
                reactionBadge = document.createElement('div');
                reactionBadge.className = 'reaction-badge';
                element.querySelector('.message-content').appendChild(reactionBadge);
            }
            reactionBadge.textContent = reactions[userId];
            reactionBadge.style.display = 'inline-block';
        } else if (reactionBadge) {
            const otherReactions = Object.values(reactions);
            if (otherReactions.length > 0) {
                reactionBadge.textContent = otherReactions[otherReactions.length - 1];
            } else {
                reactionBadge.style.display = 'none';
            }
        }
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
            const path = `chat_uploads/${currentUser.id}/voice_${Date.now()}.wav`;
            
            const { error: uploadError } = await supabase.storage
                .from('chat-files')
                .upload(path, pendingVoiceBlob, {
                    contentType: 'audio/wav',
                    cacheControl: 'no-cache, no-store, must-revalidate'
                });
            
            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage
                    .from('chat-files')
                    .getPublicUrl(path);
                
                fileUrl = publicUrl + '?t=' + Date.now();
                messageType = 'voice';
                messageText = '';
                console.log('📤 Voice uploaded as WAV:', path);
            } else {
                showToast('❌ Voice upload failed: ' + uploadError.message, 'error');
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
            sender_name: currentUser.name || currentUser.user_metadata?.name || 'User',
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
                }
            }
        })
        .subscribe();
}

// ============================================
// CHANNELS
// ============================================

function switchChannel(channel) {
    console.log('📢 Switching to channel:', channel);
    currentChannel = channel;
    
    document.querySelectorAll('.channel-item').forEach(el => {
        el.classList.toggle('active', el.dataset.channel === channel);
    });
    
    const config = CHANNEL_CONFIG[channel];
    
    const nameEl = document.getElementById('channelName');
    if (nameEl) {
        nameEl.textContent = config ? config.label.replace(/[^a-zA-Z0-9 ]/g, '').trim() : channel;
    }
    
    const iconEl = document.getElementById('channelIcon');
    if (iconEl) {
        iconEl.className = `fas ${config ? config.icon : 'fa-hashtag'}`;
    }
    
    allMessages = [];
    replyToMessage = null;
    const input = document.getElementById('messageInput');
    if (input) input.placeholder = 'Type a message...';
    markChannelRead(channel);
    loadMessages();
    updateModalInfo(channel);
}

function markChannelRead(channel) {
    if (unreadCounts[channel] !== undefined) {
        unreadCounts[channel] = 0;
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
        refreshOnlineUsers();
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
    const config = CHANNEL_CONFIG[channel];
    
    const nameEl = document.getElementById('modalChannelName');
    const descEl = document.getElementById('modalChannelDescription');
    const memberCount = document.getElementById('modalMemberCount');
    const messageCount = document.getElementById('modalMessageCount');
    
    if (nameEl) nameEl.textContent = config ? config.label : `#${channel}`;
    if (descEl) descEl.textContent = config ? config.description : `Welcome to #${channel}!`;
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
// EVENT LISTENERS - Updated
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
    
    // Context menu items - Updated
    const contextViewPortfolio = document.getElementById('contextViewPortfolio');
    const contextReply = document.getElementById('contextReply');
    const contextCopy = document.getElementById('contextCopy');
    const contextReact = document.getElementById('contextReact');
    const contextReport = document.getElementById('contextReport');
    
    const reactStar = document.getElementById('reactStar');
    const reactHeart = document.getElementById('reactHeart');
    const reactAngry = document.getElementById('reactAngry');
    const reactHaha = document.getElementById('reactHaha');
    
    if (contextViewPortfolio) contextViewPortfolio.addEventListener('click', viewPortfolio);
    if (contextReply) contextReply.addEventListener('click', replyToUser);
    if (contextCopy) contextCopy.addEventListener('click', copyUserMessage);
    if (contextReact) contextReact.addEventListener('click', toggleReactSubmenu);
    if (contextReport) contextReport.addEventListener('click', reportUser);
    
    if (reactStar) reactStar.addEventListener('click', () => reactToMessage('⭐'));
    if (reactHeart) reactHeart.addEventListener('click', () => reactToMessage('❤️'));
    if (reactAngry) reactAngry.addEventListener('click', () => reactToMessage('😡'));
    if (reactHaha) reactHaha.addEventListener('click', () => reactToMessage('😂'));
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.context-menu')) {
            hideContextMenu();
            const submenu = document.getElementById('reactSubmenu');
            if (submenu) submenu.style.display = 'none';
            reactSubmenuOpen = false;
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
window.cancelFilePreview = cancelFilePreview;
window.cancelVoicePreview = cancelVoicePreview;
window.openChannelModal = openChannelModal;
window.closeChannelModal = closeChannelModal;
window.openMediaViewer = openMediaViewer;
window.closeMediaViewer = closeMediaViewer;
window.scrollToMessage = scrollToMessage;
window.refreshOnlineUsers = refreshOnlineUsers;
window.showToast = showToast;
window.toggleNav = toggleNav;
window.reportIssue = reportIssue;
window.toggleChannels = toggleChannels;
window.goToUserPortfolio = goToUserPortfolio;

console.log('✅ Chat.js loaded');
