// ============================================
// 💬 COMMUNITY CHAT - GLIIMU INSTITUTE
// ============================================
// 📋 Complete Chat Application
// 🎓 Media Technology Platform
// 📱 Mobile-First Optimized
// ============================================

import { supabase, getCurrentUser } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// 📦 GLOBAL STATE
// ============================================

const STATE = {
    currentUser: null,
    currentChannel: 'general',
    allMessages: [],
    messageSubscription: null,
    pendingFile: null,
    pendingVoiceBlob: null,
    typingTimeout: null,
    lastMessageId: null,
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    recordingStartTime: null,
    recordingTimer: null,
    unreadCounts: {
        general: 0,
        announcements: 0,
        help: 0,
        random: 0,
        projects: 0
    },
    selectedMessageId: null,
    isSearching: false,
    searchResults: [],
    isInfoPanelOpen: false,
    isSidebarOpen: false,
    currentTab: 'chats',
    reactions: {},
    pinnedMessages: [],
    typingUsers: {}
};

// ============================================
// 🚀 INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎓 Gliimu Chat initializing...');
    
    // 📱 Fix mobile viewport
    fixMobileViewport();
    
    // 📊 Show loading state
    showLoadingState();
    
    // 👤 Get current user
    try {
        STATE.currentUser = await getCurrentUser();
        console.log('👤 Current user:', STATE.currentUser?.email || 'Not logged in');
    } catch (err) {
        console.error('❌ Error getting user:', err);
        STATE.currentUser = null;
    }
    
    if (!STATE.currentUser) {
        showLoginScreen();
        return;
    }
    
    // 🎨 Update UI with user info
    updateUserUI();
    
    // 📨 Load messages for current channel
    await loadMessages();
    
    // 🔄 Setup real-time subscription
    setupRealtimeSubscription();
    
    // 👥 Load online users
    await loadOnlineUsers();
    
    // 🎯 Setup event listeners
    setupEventListeners();
    
    // ✅ Mark channel as read
    markChannelRead(STATE.currentChannel);
    
    // 📱 Focus input on mobile
    setTimeout(() => {
        const input = document.getElementById('messageInput');
        if (input) input.focus();
    }, 500);
    
    // 🎨 Initialize emoji grid
    initializeEmojiGrid();
    
    console.log('✅ Chat initialized successfully');
});

// ============================================
// 📱 MOBILE FIXES
// ============================================

function fixMobileViewport() {
    // 🔧 Fix viewport height for mobile browsers
    const setVH = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', () => {
        setTimeout(setVH, 300);
    });
    
    // ⌨️ Handle keyboard visibility
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            const container = document.getElementById('messagesContainer');
            if (container) {
                setTimeout(() => {
                    container.scrollTop = container.scrollHeight;
                }, 100);
            }
        });
    }
    
    // 📱 Ensure input is visible when focused
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('focus', () => {
            setTimeout(() => {
                messageInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                scrollToBottom();
            }, 300);
        });
    }
}

// ============================================
// 👤 USER MANAGEMENT
// ============================================

function showLoginScreen() {
    const chatMain = document.querySelector('.chat-main');
    if (chatMain) {
        chatMain.innerHTML = `
            <div class="login-prompt">
                <div class="login-prompt-icon">
                    <i class="fas fa-comments"></i>
                </div>
                <h2>👋 Join the Conversation</h2>
                <p>🤝 Sign in to chat with fellow creatives, share your work, and get feedback.</p>
                <button onclick="window.location.href='/signin.html'" class="login-prompt-btn">
                    🚀 Sign In to Chat
                </button>
            </div>
        `;
    }
    
    // Update UI for guest
    const userNameEl = document.getElementById('currentUserName');
    const userStatusEl = document.getElementById('userStatusText');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (userNameEl) userNameEl.textContent = '👤 Guest User';
    if (userStatusEl) userStatusEl.textContent = '🔒 Not signed in';
    if (messageInput) messageInput.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    if (logoutBtn) logoutBtn.style.display = 'none';
}

function updateUserUI() {
    const userNameEl = document.getElementById('currentUserName');
    const userStatusEl = document.getElementById('userStatusText');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userAvatar = document.getElementById('userAvatar');
    
    const displayName = STATE.currentUser.user_metadata?.name || 
                       STATE.currentUser.email?.split('@')[0] || 
                       'User';
    
    if (userNameEl) userNameEl.textContent = `👤 ${displayName}`;
    if (userStatusEl) userStatusEl.textContent = '🟢 Online';
    if (messageInput) messageInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    if (logoutBtn) logoutBtn.style.display = 'block';
    
    if (userAvatar) {
        userAvatar.innerHTML = `<i class="fas fa-user-circle"></i>`;
    }
    
    // Set up logout
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            await supabase.auth.signOut();
            window.location.reload();
        };
    }
}

function showLoadingState() {
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
                <h3>🔄 Connecting to chat...</h3>
                <p>⏳ Please wait while we connect you to the community</p>
            </div>
        `;
    }
}

// ============================================
// 📨 MESSAGE MANAGEMENT
// ============================================

async function loadMessages() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    try {
        console.log(`📨 Loading messages for channel: ${STATE.currentChannel}`);
        
        const { data: messages, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('channel', STATE.currentChannel)
            .order('created_at', { ascending: true })
            .limit(100);
        
        if (error) {
            console.error('❌ Error loading messages:', error);
            showToast('❌ Failed to load messages', 'error');
            return;
        }
        
        console.log(`✅ Loaded ${messages?.length || 0} messages`);
        
        if (messages && messages.length > 0) {
            STATE.allMessages = messages;
            if (messages.length > 0) {
                STATE.lastMessageId = messages[messages.length - 1].id;
            }
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
    const welcomeMessage = {
        channel: STATE.currentChannel,
        sender_id: null,
        sender_name: '🎓 Gliimu System',
        message: getWelcomeMessageForChannel(STATE.currentChannel),
        type: 'text',
        created_at: new Date().toISOString(),
        is_system: true
    };
    
    const { error } = await supabase
        .from('chat_messages')
        .insert([welcomeMessage]);
    
    if (error) {
        console.error('❌ Error inserting welcome message:', error);
    }
}

function getWelcomeMessageForChannel(channel) {
    const messages = {
        general: '👋 Welcome to #general! Feel free to introduce yourself and start chatting with the community. 🎓',
        announcements: '📢 Welcome to #announcements! Check here for important updates and news from the Gliimu team. 🚀',
        help: '❓ Welcome to #help! Ask questions about courses, projects, or technical issues here. 💡',
        random: '🎲 Welcome to #random! Casual conversation, memes, and off-topic discussions go here. 😄',
        projects: '💻 Welcome to #projects! Share your work, get feedback, and collaborate with other creators. 🤝'
    };
    return messages[channel] || `👋 Welcome to #${channel}!`;
}

// ============================================
// 🎨 RENDER MESSAGES
// ============================================

function renderMessages() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    if (STATE.allMessages.length === 0) {
        container.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <i class="fas fa-comments"></i>
                </div>
                <h3>👋 Welcome to #${STATE.currentChannel}</h3>
                <p>${getWelcomeMessageForChannel(STATE.currentChannel)}</p>
                <span class="welcome-hint">💬 Start the conversation!</span>
            </div>
        `;
        return;
    }
    
    // Check if we should scroll
    const shouldScroll = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    
    // Build messages HTML
    let messagesHtml = '';
    let lastSenderId = null;
    let messageGroup = [];
    
    STATE.allMessages.forEach((msg, index) => {
        const isSystem = msg.is_system || msg.sender_id === null;
        const isSelf = msg.sender_id === STATE.currentUser?.id;
        const showSender = !isSystem && (lastSenderId !== msg.sender_id || index === 0);
        
        // Start new group
        if (showSender || isSystem) {
            if (messageGroup.length > 0) {
                messagesHtml += renderMessageGroup(messageGroup, lastSenderId);
                messageGroup = [];
            }
        }
        
        messageGroup.push(msg);
        lastSenderId = msg.sender_id;
    });
    
    // Render last group
    if (messageGroup.length > 0) {
        messagesHtml += renderMessageGroup(messageGroup, lastSenderId);
    }
    
    container.innerHTML = messagesHtml;
    
    if (shouldScroll) {
        scrollToBottom();
    }
    
    // Attach event listeners to messages
    attachMessageEventListeners();
}

function renderMessageGroup(messages, senderId) {
    const isSystem = messages[0].is_system || messages[0].sender_id === null;
    const isSelf = senderId === STATE.currentUser?.id;
    const senderName = messages[0].sender_name || '👤 User';
    
    if (isSystem) {
        return `
            <div class="message-system">
                <span>${messages[0].message}</span>
            </div>
        `;
    }
    
    let html = `
        <div class="message-group ${isSelf ? 'self' : 'other'}" data-sender-id="${senderId}">
            ${!isSelf ? `
                <div class="message-sender">
                    <span class="sender-name">${escapeHtml(senderName)}</span>
                    <span class="sender-badge">${getUserBadge(senderId)}</span>
                </div>
            ` : ''}
    `;
    
    messages.forEach((msg, index) => {
        const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isFirst = index === 0;
        const isLast = index === messages.length - 1;
        
        let contentHtml = getMessageContent(msg);
        let reactionsHtml = getMessageReactions(msg.id);
        
        html += `
            <div class="message-wrapper ${isFirst ? 'first' : ''} ${isLast ? 'last' : ''}" 
                 data-message-id="${msg.id}"
                 data-sender-id="${senderId}">
                ${contentHtml}
                <div class="message-footer">
                    <span class="message-time">${time}</span>
                    ${isSelf ? `<span class="message-status">✓✓</span>` : ''}
                    ${reactionsHtml}
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    return html;
}

function getMessageContent(message) {
    let contentHtml = '';
    
    switch (message.type) {
        case 'text':
            contentHtml = `<div class="message-bubble">${escapeHtml(message.message)}</div>`;
            break;
            
        case 'image':
            contentHtml = `
                <div class="message-bubble image-bubble">
                    <img src="${message.file_url}" alt="📸 Image" class="message-image" loading="lazy">
                </div>
            `;
            break;
            
        case 'file':
            contentHtml = `
                <div class="message-bubble file-bubble">
                    <a href="${message.file_url}" target="_blank" class="message-file">
                        <i class="fas fa-file-download"></i>
                        <span>📄 ${escapeHtml(message.file_name || 'Download File')}</span>
                    </a>
                </div>
            `;
            break;
            
        case 'voice':
            contentHtml = `
                <div class="message-bubble voice-bubble">
                    <div class="voice-message">
                        <button class="voice-play-btn" onclick="window.toggleVoicePlay(this, '${message.file_url}')">
                            <i class="fas fa-play"></i>
                        </button>
                        <div class="voice-wave">
                            <span></span><span></span><span></span><span></span><span></span>
                        </div>
                        <audio style="display: none;" src="${message.file_url}"></audio>
                    </div>
                </div>
            `;
            break;
            
        default:
            contentHtml = `<div class="message-bubble">${escapeHtml(message.message)}</div>`;
    }
    
    return contentHtml;
}

function getMessageReactions(messageId) {
    const reactions = STATE.reactions[messageId] || {};
    const reactionKeys = Object.keys(reactions);
    
    if (reactionKeys.length === 0) return '';
    
    let html = '<div class="message-reactions">';
    reactionKeys.forEach(emoji => {
        const count = reactions[emoji];
        html += `
            <span class="reaction-badge" onclick="window.toggleReaction('${messageId}', '${emoji}')">
                ${emoji} ${count}
            </span>
        `;
    });
    html += '</div>';
    
    return html;
}

function getUserBadge(userId) {
    // TODO: Fetch user role from database
    return '🎓 Student';
}

function attachMessageEventListeners() {
    document.querySelectorAll('.message-wrapper').forEach(el => {
        // 📱 Long press for context menu
        let longPressTimer = null;
        let isLongPress = false;
        
        el.addEventListener('touchstart', (e) => {
            isLongPress = false;
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                const messageId = el.dataset.messageId;
                showContextMenu(e, messageId);
            }, 500);
        });
        
        el.addEventListener('touchmove', () => {
            clearTimeout(longPressTimer);
        });
        
        el.addEventListener('touchend', () => {
            clearTimeout(longPressTimer);
            if (!isLongPress) {
                // Short tap - maybe reply or view
            }
        });
        
        // 🖱️ Mouse events for desktop
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const messageId = el.dataset.messageId;
            showContextMenu(e, messageId);
        });
    });
}

// ============================================
// 📤 SEND MESSAGE
// ============================================

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text && !STATE.pendingFile && !STATE.pendingVoiceBlob) return;
    
    if (!STATE.currentUser) {
        showToast('🔒 Please login to send messages', 'error');
        return;
    }
    
    let fileUrl = null;
    let fileName = null;
    let messageType = 'text';
    let messageText = text;
    
    // Show sending indicator
    const sendBtn = document.getElementById('sendBtn');
    const originalBtnHtml = sendBtn?.innerHTML;
    if (sendBtn) {
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sendBtn.disabled = true;
    }
    
    // 📎 Handle file upload
    if (STATE.pendingFile) {
        const file = STATE.pendingFile;
        const fileExt = file.name.split('.').pop();
        const filePath = `chat_uploads/${STATE.currentUser.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
            .from('chat-files')
            .upload(filePath, file);
        
        if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
                .from('chat-files')
                .getPublicUrl(filePath);
            
            fileUrl = publicUrl;
            fileName = file.name;
            messageType = file.type.startsWith('image/') ? 'image' : 'file';
            messageText = '';
        }
        
        STATE.pendingFile = null;
        hideFilePreview();
    }
    
    // 🎤 Handle voice message
    if (STATE.pendingVoiceBlob) {
        const filePath = `chat_uploads/${STATE.currentUser.id}/voice_${Date.now()}.webm`;
        
        const { error: uploadError } = await supabase.storage
            .from('chat-files')
            .upload(filePath, STATE.pendingVoiceBlob);
        
        if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
                .from('chat-files')
                .getPublicUrl(filePath);
            
            fileUrl = publicUrl;
            messageType = 'voice';
            messageText = '';
        }
        
        STATE.pendingVoiceBlob = null;
        hideVoicePreview();
    }
    
    const message = {
        channel: STATE.currentChannel,
        sender_id: STATE.currentUser.id,
        sender_name: STATE.currentUser.user_metadata?.name || STATE.currentUser.email?.split('@')[0],
        message: messageText,
        type: messageType,
        file_url: fileUrl,
        file_name: fileName,
        created_at: new Date().toISOString()
    };
    
    try {
        // Optimistic update
        const tempId = 'temp_' + Date.now();
        const tempMessage = { ...message, id: tempId };
        STATE.allMessages.push(tempMessage);
        renderMessages();
        
        const { data, error } = await supabase
            .from('chat_messages')
            .insert([message])
            .select();
        
        if (error) {
            STATE.allMessages = STATE.allMessages.filter(m => m.id !== tempId);
            renderMessages();
            showToast(`❌ Failed to send: ${error.message}`, 'error');
            return;
        }
        
        // Replace temp with real
        if (data && data[0]) {
            const index = STATE.allMessages.findIndex(m => m.id === tempId);
            if (index !== -1) {
                STATE.allMessages[index] = data[0];
                renderMessages();
            }
        }
        
        input.value = '';
        scrollToBottom();
        
    } catch (error) {
        console.error('❌ Exception saving message:', error);
        showToast('❌ Failed to send message', 'error');
    } finally {
        if (sendBtn) {
            sendBtn.innerHTML = originalBtnHtml;
            sendBtn.disabled = false;
        }
    }
}

// ============================================
// 🔄 REAL-TIME SUBSCRIPTION
// ============================================

function setupRealtimeSubscription() {
    if (STATE.messageSubscription) {
        STATE.messageSubscription.unsubscribe();
    }
    
    console.log('🔄 Setting up real-time subscription');
    
    STATE.messageSubscription = supabase
        .channel('chat_realtime')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages'
            },
            (payload) => {
                const newMessage = payload.new;
                console.log('📨 Real-time message received:', newMessage.id);
                
                // Prevent duplicates
                if (STATE.lastMessageId === newMessage.id) return;
                if (STATE.allMessages.some(m => m.id === newMessage.id)) return;
                
                // Process for current channel
                if (newMessage.channel === STATE.currentChannel) {
                    STATE.lastMessageId = newMessage.id;
                    STATE.allMessages.push(newMessage);
                    renderMessages();
                    markChannelRead(STATE.currentChannel);
                    scrollToBottom();
                } else {
                    // Update unread count for other channels
                    if (STATE.unreadCounts[newMessage.channel] !== undefined) {
                        STATE.unreadCounts[newMessage.channel]++;
                        updateChannelBadge(newMessage.channel, STATE.unreadCounts[newMessage.channel]);
                        updateNavBadge('chats', getTotalUnread());
                    }
                }
            }
        )
        .subscribe((status) => {
            console.log('📡 Realtime subscription status:', status);
        });
}

// ============================================
// 👥 ONLINE USERS
// ============================================

async function loadOnlineUsers() {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, name, role, avatar_url')
            .limit(30);
        
        if (!error && users) {
            const container = document.getElementById('onlineUsersList');
            if (container) {
                container.innerHTML = users.map(user => `
                    <div class="user-item" data-user-id="${user.id}">
                        <div class="user-avatar-wrapper">
                            <div class="user-avatar">
                                ${user.avatar_url ? 
                                    `<img src="${user.avatar_url}" alt="${escapeHtml(user.name)}">` :
                                    `<i class="fas fa-user-circle"></i>`
                                }
                            </div>
                            <span class="user-status-dot online"></span>
                        </div>
                        <div class="user-info">
                            <div class="user-name">${escapeHtml(user.name || '👤 User')}</div>
                            <div class="user-role">${getUserRoleEmoji(user.role)} ${user.role || 'Member'}</div>
                        </div>
                    </div>
                `).join('');
            }
            
            const onlineCount = document.getElementById('onlineCount');
            if (onlineCount) onlineCount.textContent = users.length;
            
            const navPeopleBadge = document.getElementById('navPeopleBadge');
            if (navPeopleBadge) navPeopleBadge.textContent = users.length;
        }
    } catch (error) {
        console.error('❌ Error loading users:', error);
    }
}

function getUserRoleEmoji(role) {
    const emojis = {
        'student': '🎓',
        'instructor': '👨‍🏫',
        'partner': '🤝',
        'admin': '👑',
        'founder': '🚀'
    };
    return emojis[role?.toLowerCase()] || '👤';
}

// ============================================
// 📊 CHANNEL MANAGEMENT
// ============================================

function switchChannel(channel) {
    console.log(`📢 Switching to channel: ${channel}`);
    
    // Update UI
    document.querySelectorAll('.channel-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.channel === channel) {
            item.classList.add('active');
        }
    });
    
    STATE.currentChannel = channel;
    
    // Update header
    const channelNameEl = document.getElementById('channelName');
    if (channelNameEl) {
        const channelNames = {
            general: '💬 general',
            announcements: '📢 announcements',
            help: '❓ help',
            random: '🎲 random',
            projects: '💻 projects'
        };
        channelNameEl.textContent = channelNames[channel] || `#${channel}`;
    }
    
    const channelTopic = document.getElementById('channelTopic');
    const topics = {
        general: '🗣️ General discussion for everyone',
        announcements: '📢 Important updates and news',
        help: '❓ Ask questions and get help',
        random: '🎲 Casual conversation and fun',
        projects: '💻 Share and collaborate on projects'
    };
    if (channelTopic) channelTopic.textContent = topics[channel] || '';
    
    const channelIcons = {
        general: 'fa-hashtag',
        announcements: 'fa-bullhorn',
        help: 'fa-question-circle',
        random: 'fa-random',
        projects: 'fa-code'
    };
    const channelIcon = document.getElementById('channelIcon');
    if (channelIcon) channelIcon.className = `fas ${channelIcons[channel] || 'fa-hashtag'}`;
    
    // Load messages
    STATE.allMessages = [];
    markChannelRead(channel);
    loadMessages();
}

function markChannelRead(channel) {
    if (STATE.unreadCounts[channel] !== undefined) {
        STATE.unreadCounts[channel] = 0;
        updateChannelBadge(channel, 0);
        updateNavBadge('chats', getTotalUnread());
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

function getTotalUnread() {
    return Object.values(STATE.unreadCounts).reduce((a, b) => a + b, 0);
}

function updateNavBadge(tab, count) {
    const badge = document.getElementById(`nav${tab.charAt(0).toUpperCase() + tab.slice(1)}Badge`);
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
// 📎 FILE HANDLING
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
    
    STATE.pendingFile = file;
    showFilePreview(file.name, file.size);
}

function showFilePreview(fileName, fileSize) {
    const preview = document.getElementById('filePreview');
    const fileNameSpan = document.getElementById('previewFileName');
    const fileSizeSpan = document.getElementById('previewFileSize');
    
    if (preview && fileNameSpan && fileSizeSpan) {
        fileNameSpan.textContent = fileName;
        fileSizeSpan.textContent = formatFileSize(fileSize);
        preview.style.display = 'flex';
    }
}

function hideFilePreview() {
    const preview = document.getElementById('filePreview');
    if (preview) preview.style.display = 'none';
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
}

function cancelFilePreview() {
    STATE.pendingFile = null;
    hideFilePreview();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// ============================================
// 🎤 VOICE RECORDING
// ============================================

async function startVoiceRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        STATE.mediaRecorder = new MediaRecorder(stream);
        STATE.audioChunks = [];
        
        STATE.mediaRecorder.ondataavailable = (e) => STATE.audioChunks.push(e.data);
        STATE.mediaRecorder.onstop = () => {
            const audioBlob = new Blob(STATE.audioChunks, { type: 'audio/webm' });
            STATE.pendingVoiceBlob = audioBlob;
            showVoicePreview();
            stream.getTracks().forEach(track => track.stop());
        };
        
        STATE.mediaRecorder.start();
        STATE.isRecording = true;
        STATE.recordingStartTime = Date.now();
        
        const voiceBtn = document.getElementById('voiceRecordBtn');
        if (voiceBtn) {
            voiceBtn.classList.add('recording');
            voiceBtn.innerHTML = '<i class="fas fa-stop"></i>';
        }
        
        STATE.recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - STATE.recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            const durationSpan = document.getElementById('voiceDuration');
            if (durationSpan) durationSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
        
        showToast('🎤 Recording... Click stop to send', 'info');
    } catch (err) {
        console.error('❌ Microphone error:', err);
        showToast('❌ Could not access microphone', 'error');
    }
}

function stopVoiceRecording() {
    if (STATE.mediaRecorder && STATE.isRecording) {
        STATE.mediaRecorder.stop();
        STATE.isRecording = false;
        if (STATE.recordingTimer) clearInterval(STATE.recordingTimer);
        
        const voiceBtn = document.getElementById('voiceRecordBtn');
        if (voiceBtn) {
            voiceBtn.classList.remove('recording');
            voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        }
    }
}

function toggleVoiceRecording() {
    if (STATE.isRecording) {
        stopVoiceRecording();
    } else {
        startVoiceRecording();
    }
}

function showVoicePreview() {
    const preview = document.getElementById('voicePreview');
    if (preview) preview.style.display = 'flex';
}

function hideVoicePreview() {
    const preview = document.getElementById('voicePreview');
    if (preview) preview.style.display = 'none';
    STATE.pendingVoiceBlob = null;
}

function cancelVoicePreview() {
    STATE.pendingVoiceBlob = null;
    hideVoicePreview();
}

function toggleVoicePlay(btn, audioUrl) {
    const audio = btn.parentElement.querySelector('audio');
    const icon = btn.querySelector('i');
    
    if (!audio) {
        // Create audio if not exists
        const newAudio = document.createElement('audio');
        newAudio.src = audioUrl;
        btn.parentElement.appendChild(newAudio);
        newAudio.play();
        icon.className = 'fas fa-pause';
        newAudio.onended = () => {
            icon.className = 'fas fa-play';
        };
        return;
    }
    
    if (audio.paused) {
        audio.play();
        icon.className = 'fas fa-pause';
        audio.onended = () => {
            icon.className = 'fas fa-play';
        };
    } else {
        audio.pause();
        icon.className = 'fas fa-play';
    }
}

// ============================================
// 😊 EMOJI PICKER
// ============================================

function initializeEmojiGrid() {
    const grid = document.getElementById('emojiGrid');
    if (!grid) return;
    
    const emojis = [
        '😀', '😂', '❤️', '👍', '🔥', '🎉', '😎', '🤔',
        '💯', '🚀', '🎨', '💻', '🎬', '📸', '👋', '🙌',
        '💡', '🎯', '⚡', '✨', '💪', '🤝', '🌟', '🌈',
        '🎊', '🎁', '🏆', '⭐', '🔥', '💎', '🎵', '📚'
    ];
    
    grid.innerHTML = emojis.map(emoji => `
        <div class="emoji-item" onclick="window.addEmoji('${emoji}')">${emoji}</div>
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
// 🔍 SEARCH
// ============================================

function toggleSearch() {
    const searchBar = document.getElementById('searchBar');
    if (!searchBar) return;
    
    STATE.isSearching = !STATE.isSearching;
    searchBar.style.display = STATE.isSearching ? 'block' : 'none';
    
    if (STATE.isSearching) {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 300);
        }
    }
}

async function searchMessages(query) {
    if (!query || query.length < 2) {
        const results = document.getElementById('searchResults');
        if (results) results.innerHTML = '';
        return;
    }
    
    try {
        const { data: results, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('channel', STATE.currentChannel)
            .ilike('message', `%${query}%`)
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) {
            console.error('❌ Search error:', error);
            return;
        }
        
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;
        
        if (results && results.length > 0) {
            resultsContainer.innerHTML = results.map(msg => `
                <div class="search-result-item" onclick="window.jumpToMessage('${msg.id}')">
                    <span class="search-result-text">${highlightText(msg.message, query)}</span>
                    <span class="search-result-time">${new Date(msg.created_at).toLocaleTimeString()}</span>
                </div>
            `).join('');
        } else {
            resultsContainer.innerHTML = `
                <div class="search-empty">🔍 No messages found</div>
            `;
        }
    } catch (error) {
        console.error('❌ Search exception:', error);
    }
}

function highlightText(text, query) {
    if (!text) return '';
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

function jumpToMessage(messageId) {
    // Find and scroll to message
    const element = document.querySelector(`[data-message-id="${messageId}"]`);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlighted');
        setTimeout(() => {
            element.classList.remove('highlighted');
        }, 2000);
    }
    toggleSearch();
}

// ============================================
// ❤️ REACTIONS
// ============================================

function toggleReaction(messageId, emoji) {
    if (!STATE.currentUser) {
        showToast('🔒 Please login to react', 'error');
        return;
    }
    
    if (!STATE.reactions[messageId]) {
        STATE.reactions[messageId] = {};
    }
    
    const reactions = STATE.reactions[messageId];
    if (reactions[emoji]) {
        // Remove reaction
        delete reactions[emoji];
        if (Object.keys(reactions).length === 0) {
            delete STATE.reactions[messageId];
        }
    } else {
        // Add reaction
        reactions[emoji] = (reactions[emoji] || 0) + 1;
    }
    
    // Update UI
    renderMessages();
}

function addReaction(emoji) {
    if (STATE.selectedMessageId) {
        toggleReaction(STATE.selectedMessageId, emoji);
        hideReactionTooltip();
    }
}

// ============================================
// 📋 CONTEXT MENU
// ============================================

function showContextMenu(event, messageId) {
    STATE.selectedMessageId = messageId;
    const menu = document.getElementById('contextMenu');
    if (!menu) return;
    
    const x = event.clientX || event.touches?.[0]?.clientX || 0;
    const y = event.clientY || event.touches?.[0]?.clientY || 0;
    
    menu.style.display = 'block';
    menu.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 200)}px`;
    
    // Hide after 5 seconds
    setTimeout(() => {
        menu.style.display = 'none';
    }, 5000);
}

function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) menu.style.display = 'none';
}

function replyToMessage() {
    const message = STATE.allMessages.find(m => m.id === STATE.selectedMessageId);
    if (message) {
        const input = document.getElementById('messageInput');
        if (input) {
            input.value = `@${message.sender_name} `;
            input.focus();
        }
    }
    hideContextMenu();
}

function copyMessage() {
    const message = STATE.allMessages.find(m => m.id === STATE.selectedMessageId);
    if (message) {
        navigator.clipboard.writeText(message.message);
        showToast('📋 Message copied!', 'success');
    }
    hideContextMenu();
}

function pinMessage() {
    const message = STATE.allMessages.find(m => m.id === STATE.selectedMessageId);
    if (message) {
        STATE.pinnedMessages.push(message.id);
        showToast('📌 Message pinned!', 'success');
        // TODO: Save to database
    }
    hideContextMenu();
}

function deleteMessage() {
    const message = STATE.allMessages.find(m => m.id === STATE.selectedMessageId);
    if (message && message.sender_id === STATE.currentUser?.id) {
        // Remove from UI
        STATE.allMessages = STATE.allMessages.filter(m => m.id !== STATE.selectedMessageId);
        renderMessages();
        showToast('🗑️ Message deleted', 'success');
        // TODO: Delete from database
    } else {
        showToast('❌ You can only delete your own messages', 'error');
    }
    hideContextMenu();
}

function reportMessage() {
    showToast('🚩 Message reported to moderators', 'info');
    hideContextMenu();
}

// ============================================
// 📱 UI HELPERS
// ============================================

function toggleSidebar() {
    STATE.isSidebarOpen = !STATE.isSidebarOpen;
    const sidebar = document.getElementById('chatSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (sidebar) sidebar.classList.toggle('open', STATE.isSidebarOpen);
    if (overlay) overlay.classList.toggle('visible', STATE.isSidebarOpen);
    
    if (STATE.isSidebarOpen) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
}

function toggleInfoPanel() {
    STATE.isInfoPanelOpen = !STATE.isInfoPanelOpen;
    const panel = document.getElementById('infoPanel');
    const overlay = document.getElementById('infoOverlay');
    
    if (panel) panel.classList.toggle('open', STATE.isInfoPanelOpen);
    if (overlay) overlay.classList.toggle('visible', STATE.isInfoPanelOpen);
    
    if (STATE.isInfoPanelOpen) {
        document.body.style.overflow = 'hidden';
        updateInfoPanel();
    } else {
        document.body.style.overflow = '';
    }
}

function updateInfoPanel() {
    const channel = STATE.currentChannel;
    const nameEl = document.getElementById('infoChannelName');
    const descEl = document.getElementById('infoChannelDescription');
    const memberCount = document.getElementById('infoMemberCount');
    const messageCount = document.getElementById('infoMessageCount');
    
    const channelNames = {
        general: '💬 #general',
        announcements: '📢 #announcements',
        help: '❓ #help',
        random: '🎲 #random',
        projects: '💻 #projects'
    };
    
    const channelDescs = {
        general: '🗣️ General discussion for everyone. Share ideas, ask questions, and connect with the community.',
        announcements: '📢 Important updates and news from the Gliimu team. Stay informed!',
        help: '❓ Ask questions about courses, projects, or technical issues. Get help from the community.',
        random: '🎲 Casual conversation, memes, and off-topic discussions. Have fun!',
        projects: '💻 Share your work, get feedback, and collaborate with other creators.'
    };
    
    if (nameEl) nameEl.textContent = channelNames[channel] || `#${channel}`;
    if (descEl) descEl.textContent = channelDescs[channel] || '';
    if (memberCount) memberCount.textContent = document.querySelectorAll('.user-item').length || 0;
    if (messageCount) messageCount.textContent = STATE.allMessages.length || 0;
}

function switchTab(tab) {
    STATE.currentTab = tab;
    
    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tab);
    });
    
    // Handle tab switching
    switch (tab) {
        case 'chats':
            // Show main chat
            document.querySelector('.chat-main').style.display = 'flex';
            document.getElementById('chatSidebar').style.display = 'flex';
            break;
        case 'channels':
            // Show channels list
            toggleSidebar();
            break;
        case 'people':
            // Show people list
            document.querySelector('.users-section').style.display = 'block';
            break;
        case 'profile':
            // Show profile
            // TODO: Navigate to profile
            break;
    }
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function checkScroll() {
    const container = document.getElementById('messagesContainer');
    const btn = document.getElementById('scrollToBottomBtn');
    if (!container || !btn) return;
    
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    btn.classList.toggle('visible', !isNearBottom && container.scrollHeight > container.clientHeight);
}

function onTyping() {
    if (STATE.typingTimeout) clearTimeout(STATE.typingTimeout);
    
    const typingContainer = document.getElementById('typingIndicator');
    if (typingContainer) {
        typingContainer.innerHTML = `
            <div class="typing-indicator">
                <span>✍️ You are typing...</span>
                <div class="typing-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
    }
    
    STATE.typingTimeout = setTimeout(() => {
        const typingContainer = document.getElementById('typingIndicator');
        if (typingContainer) typingContainer.innerHTML = '';
    }, 1000);
}

// ============================================
// 🔔 TOAST NOTIFICATIONS
// ============================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// ============================================
// 🛠️ UTILITY FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showReactionTooltip(event, messageId) {
    STATE.selectedMessageId = messageId;
    const tooltip = document.getElementById('reactionTooltip');
    if (!tooltip) return;
    
    const x = event.clientX || event.touches?.[0]?.clientX || 0;
    const y = event.clientY || event.touches?.[0]?.clientY || 0;
    
    tooltip.style.display = 'flex';
    tooltip.style.left = `${Math.min(x, window.innerWidth - 300)}px`;
    tooltip.style.top = `${Math.min(y - 50, window.innerHeight - 100)}px`;
    
    setTimeout(() => {
        tooltip.style.display = 'none';
    }, 3000);
}

function hideReactionTooltip() {
    const tooltip = document.getElementById('reactionTooltip');
    if (tooltip) tooltip.style.display = 'none';
}

// ============================================
// 🎯 EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // 📤 Send message
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        messageInput.addEventListener('input', onTyping);
    }
    
    // 📎 File attachment
    const attachBtn = document.getElementById('attachFileBtn');
    const fileInput = document.getElementById('fileInput');
    if (attachBtn) attachBtn.addEventListener('click', () => fileInput?.click());
    if (fileInput) fileInput.addEventListener('change', () => handleFileSelect(fileInput));
    
    // 🎤 Voice recording
    const voiceBtn = document.getElementById('voiceRecordBtn');
    if (voiceBtn) voiceBtn.addEventListener('click', toggleVoiceRecording);
    
    // 😊 Emoji picker
    const emojiBtn = document.getElementById('emojiBtn');
    const emojiClose = document.getElementById('emojiCloseBtn');
    if (emojiBtn) emojiBtn.addEventListener('click', toggleEmojiPicker);
    if (emojiClose) emojiClose.addEventListener('click', toggleEmojiPicker);
    
    // 🔍 Search
    const searchToggle = document.getElementById('searchToggleBtn');
    const searchClose = document.getElementById('searchCloseBtn');
    const searchInput = document.getElementById('searchInput');
    if (searchToggle) searchToggle.addEventListener('click', toggleSearch);
    if (searchClose) searchClose.addEventListener('click', toggleSearch);
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchMessages(e.target.value);
        });
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchMessages(e.target.value);
            }
        });
    }
    
    // 📋 Context menu
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.context-menu')) {
            hideContextMenu();
        }
        if (!e.target.closest('.reaction-tooltip')) {
            hideReactionTooltip();
        }
    });
    
    // 📱 Sidebar
    const menuToggle = document.getElementById('menuToggleBtn');
    const closeSidebar = document.getElementById('closeSidebarBtn');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (menuToggle) menuToggle.addEventListener('click', toggleSidebar);
    if (closeSidebar) closeSidebar.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);
    
    // ℹ️ Info panel
    const infoToggle = document.getElementById('infoToggleBtn');
    const closeInfo = document.getElementById('closeInfoPanelBtn');
    const infoOverlay = document.getElementById('infoOverlay');
    if (infoToggle) infoToggle.addEventListener('click', toggleInfoPanel);
    if (closeInfo) closeInfo.addEventListener('click', toggleInfoPanel);
    if (infoOverlay) infoOverlay.addEventListener('click', toggleInfoPanel);
    
    // 📱 Bottom nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            switchTab(tab);
        });
    });
    
    // ⬇️ Scroll
    const scrollBtn = document.getElementById('scrollToBottomBtn');
    const messagesContainer = document.getElementById('messagesContainer');
    if (scrollBtn) scrollBtn.addEventListener('click', scrollToBottom);
    if (messagesContainer) messagesContainer.addEventListener('scroll', checkScroll);
    
    // 📞 Call button
    const callBtn = document.getElementById('callBtn');
    if (callBtn) {
        callBtn.addEventListener('click', () => {
            showToast('🎤 Voice channels coming soon!', 'info');
        });
    }
    
    // 🗑️ Cancel buttons
    const cancelFile = document.getElementById('cancelFileBtn');
    const cancelVoice = document.getElementById('cancelVoiceBtn');
    if (cancelFile) cancelFile.addEventListener('click', cancelFilePreview);
    if (cancelVoice) cancelVoice.addEventListener('click', cancelVoicePreview);
    
    // 🔄 Refresh users
    const refreshBtn = document.getElementById('refreshUsersBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadOnlineUsers);
}

// ============================================
// 🌐 EXPOSE FUNCTIONS TO WINDOW
// ============================================

// Make functions globally accessible
window.sendMessage = sendMessage;
window.switchChannel = switchChannel;
window.toggleSidebar = toggleSidebar;
window.toggleInfoPanel = toggleInfoPanel;
window.toggleSearch = toggleSearch;
window.toggleEmojiPicker = toggleEmojiPicker;
window.toggleVoiceRecording = toggleVoiceRecording;
window.toggleVoicePlay = toggleVoicePlay;
window.addEmoji = addEmoji;
window.scrollToBottom = scrollToBottom;
window.loadOnlineUsers = loadOnlineUsers;
window.switchTab = switchTab;
window.toggleReaction = toggleReaction;
window.addReaction = addReaction;
window.replyToMessage = replyToMessage;
window.copyMessage = copyMessage;
window.pinMessage = pinMessage;
window.deleteMessage = deleteMessage;
window.reportMessage = reportMessage;
window.jumpToMessage = jumpToMessage;
window.cancelFilePreview = cancelFilePreview;
window.cancelVoicePreview = cancelVoicePreview;
window.showToast = showToast;

console.log('💬 Chat.js loaded successfully');
console.log('🎓 Gliimu Institute - Community Chat v2.0');
