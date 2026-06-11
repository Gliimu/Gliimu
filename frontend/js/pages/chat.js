// ============================================
// COMMUNITY CHAT - GLIIMU
// Real-time messaging with Supabase Realtime
// ============================================

import { supabase, getCurrentUser } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// GLOBAL STATE
// ============================================

let currentUser = null;
let currentChannel = 'general';
let allMessages = [];
let onlineUsers = [];
let typingUsers = new Set();
let messageSubscription = null;
let userSubscription = null;

// Audio recording
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;

// File handling
let pendingFile = null;

// Typing timeout
let typingTimeout = null;

// Free tier timer (will be set later)
let freeTimerInterval = null;
let freeTimeRemaining = 0;

// Unread counts
let unreadCounts = {
    general: 0,
    announcements: 0,
    help: 0,
    random: 0,
    projects: 0
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Community Chat initializing...');
    
    // Show loading state
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.innerHTML = `
            <div class="welcome-message">
                <i class="fas fa-spinner fa-spin"></i>
                <h3>Connecting to chat...</h3>
                <p>Please wait while we connect you to the community</p>
            </div>
        `;
    }
    
    // Get current user
    try {
        currentUser = await getCurrentUser();
        console.log('Current user:', currentUser?.email || 'Not logged in');
    } catch (err) {
        console.error('Error getting user:', err);
        currentUser = null;
    }
    
    if (!currentUser) {
        // Show login prompt
        const chatMain = document.querySelector('.chat-main');
        if (chatMain) {
            chatMain.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 40px;">
                    <i class="fas fa-comments" style="font-size: 64px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                    <h2>Join the Conversation</h2>
                    <p style="color: var(--text-secondary); text-align: center; margin: 16px 0;">Sign in to chat with fellow creatives, share your work, and get feedback.</p>
                    <button onclick="window.location.href='/signin.html'" style="padding: 12px 32px; background: linear-gradient(135deg, #2c2f78, #1a1c4a); color: white; border: none; border-radius: 40px; cursor: pointer;">Sign In to Chat</button>
                </div>
            `;
        }
        
        // Update UI for guest
        const userNameEl = document.getElementById('currentUserName');
        const userStatusEl = document.getElementById('userStatusText');
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        
        if (userNameEl) userNameEl.textContent = 'Guest User';
        if (userStatusEl) userStatusEl.textContent = 'Not signed in';
        if (messageInput) messageInput.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        return;
    }
    
    // Update UI with user info
    const userNameEl = document.getElementById('currentUserName');
    const userStatusEl = document.getElementById('userStatusText');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (userNameEl) userNameEl.textContent = currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'User';
    if (userStatusEl) userStatusEl.textContent = 'Online';
    if (messageInput) messageInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    if (logoutBtn) logoutBtn.style.display = 'block';
    
    // Setup logout
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            await supabase.auth.signOut();
            window.location.reload();
        };
    }
    
    // Load messages for current channel
    await loadMessages();
    
    // Setup real-time subscription
    setupRealtimeSubscription();
    
    // Load online users
    await loadOnlineUsers();
    
    // Setup event listeners
    setupEventListeners();
    
    // Mark channel as read
    markChannelRead(currentChannel);
});

// ============================================
// LOAD MESSAGES FROM SUPABASE
// ============================================

async function loadMessages() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    try {
        const { data: messages, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('channel', currentChannel)
            .order('created_at', { ascending: true })
            .limit(100);
        
        if (error) {
            console.error('Error loading messages:', error);
            showMockMessages();
            return;
        }
        
        if (messages && messages.length > 0) {
            allMessages = messages;
            renderMessages();
        } else {
            showMockMessages();
        }
        
        scrollToBottom();
        
    } catch (error) {
        console.error('Exception loading messages:', error);
        showMockMessages();
    }
}

function showMockMessages() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    const mockMessages = [
        {
            id: '1',
            sender_id: null,
            sender_name: 'System',
            message: 'Welcome to the Gliimu Community Chat! Feel free to introduce yourself.',
            type: 'text',
            created_at: new Date().toISOString(),
            channel: currentChannel
        },
        {
            id: '2',
            sender_id: null,
            sender_name: 'System',
            message: 'Share your projects, ask questions, and connect with fellow creatives!',
            type: 'text',
            created_at: new Date(Date.now() - 60000).toISOString(),
            channel: currentChannel
        }
    ];
    
    allMessages = mockMessages;
    renderMessages();
}

// ============================================
// RENDER MESSAGES
// ============================================

function renderMessages() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    if (allMessages.length === 0) {
        container.innerHTML = `
            <div class="welcome-message">
                <i class="fas fa-comments"></i>
                <h3>Welcome to #${currentChannel}</h3>
                <p>Start the conversation!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = allMessages.map(msg => createMessageHTML(msg)).join('');
    scrollToBottom();
}

function createMessageHTML(message) {
    const isSelf = message.sender_id === currentUser?.id;
    const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const senderName = message.sender_name || (message.sender_id === 'system' ? 'System' : 'User');
    
    let contentHtml = '';
    
    if (message.type === 'text') {
        contentHtml = `<div class="message-bubble">${escapeHtml(message.message)}</div>`;
    } else if (message.type === 'image') {
        contentHtml = `
            <div class="message-bubble">
                <img src="${message.file_url}" alt="Image" class="message-image" onclick="window.open('${message.file_url}', '_blank')">
            </div>
        `;
    } else if (message.type === 'file') {
        contentHtml = `
            <div class="message-bubble">
                <a href="${message.file_url}" target="_blank" class="message-file">
                    <i class="fas fa-file-download"></i>
                    <span>${escapeHtml(message.file_name || 'Download File')}</span>
                </a>
            </div>
        `;
    } else if (message.type === 'voice') {
        contentHtml = `
            <div class="message-bubble">
                <div class="voice-message">
                    <button class="voice-play-btn" onclick="window.toggleVoicePlay && window.toggleVoicePlay(this, '${message.file_url}')">
                        <i class="fas fa-play"></i>
                    </button>
                    <div class="voice-wave">
                        <span></span><span></span><span></span><span></span><span></span>
                    </div>
                    <audio style="display: none;" src="${message.file_url}"></audio>
                </div>
            </div>
        `;
    }
    
    return `
        <div class="message-group ${isSelf ? 'self' : 'other'}">
            ${!isSelf ? `<div class="message-sender">${escapeHtml(senderName)}</div>` : ''}
            ${contentHtml}
            <div class="message-time">${time}</div>
        </div>
    `;
}

// ============================================
// SEND MESSAGE
// ============================================

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text && !pendingFile && !window.pendingVoiceBlob) return;
    
    if (!currentUser) {
        showToast('Please login to send messages', 'error');
        return;
    }
    
    let fileUrl = null;
    let fileName = null;
    let messageType = 'text';
    let messageText = text;
    
    // Handle file upload
    if (pendingFile) {
        const file = pendingFile;
        const fileExt = file.name.split('.').pop();
        const filePath = `chat_uploads/${currentUser.id}/${Date.now()}.${fileExt}`;
        
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
        
        pendingFile = null;
        hideFilePreview();
    }
    
    // Handle voice message
    if (window.pendingVoiceBlob) {
        const filePath = `chat_uploads/${currentUser.id}/voice_${Date.now()}.webm`;
        
        const { error: uploadError } = await supabase.storage
            .from('chat-files')
            .upload(filePath, window.pendingVoiceBlob);
        
        if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
                .from('chat-files')
                .getPublicUrl(filePath);
            
            fileUrl = publicUrl;
            messageType = 'voice';
            messageText = '';
        }
        
        window.pendingVoiceBlob = null;
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
    
    try {
        const { error } = await supabase
            .from('chat_messages')
            .insert(message);
        
        if (error) {
            console.error('Error saving message:', error);
            allMessages.push(message);
            renderMessages();
        }
        
    } catch (error) {
        console.error('Exception saving message:', error);
        allMessages.push(message);
        renderMessages();
    }
    
    input.value = '';
    scrollToBottom();
}

// ============================================
// REAL-TIME SUBSCRIPTION
// ============================================

function setupRealtimeSubscription() {
    if (messageSubscription) {
        messageSubscription.unsubscribe();
    }
    
    messageSubscription = supabase
        .channel('chat_messages')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'chat_messages' },
            (payload) => {
                const newMessage = payload.new;
                if (newMessage.channel === currentChannel) {
                    allMessages.push(newMessage);
                    renderMessages();
                    markChannelRead(currentChannel);
                } else {
                    if (unreadCounts[newMessage.channel] !== undefined) {
                        unreadCounts[newMessage.channel]++;
                        updateChannelBadge(newMessage.channel, unreadCounts[newMessage.channel]);
                    }
                }
            }
        )
        .subscribe();
}

// ============================================
// LOAD ONLINE USERS
// ============================================

async function loadOnlineUsers() {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, name, role')
            .limit(30);
        
        if (!error && users) {
            const container = document.getElementById('onlineUsersList');
            if (container) {
                container.innerHTML = users.map(user => `
                    <div class="user-item">
                        <div class="user-avatar">
                            <i class="fas fa-user-circle"></i>
                        </div>
                        <div class="user-info">
                            <div class="user-name">${escapeHtml(user.name || 'User')}</div>
                            <div class="user-role">${user.role || 'Member'}</div>
                        </div>
                    </div>
                `).join('');
            }
            const onlineCount = document.getElementById('onlineCount');
            if (onlineCount) onlineCount.textContent = users.length;
        }
    } catch (error) {
        console.error('Error loading users:', error);
        // Show mock users
        const container = document.getElementById('onlineUsersList');
        if (container) {
            container.innerHTML = `
                <div class="user-item">
                    <div class="user-avatar"><i class="fas fa-user-circle"></i></div>
                    <div class="user-info"><div class="user-name">Demo User</div><div class="user-role">Student</div></div>
                </div>
            `;
        }
    }
}

// ============================================
// CHANNEL MANAGEMENT
// ============================================

window.switchChannel = async (channel) => {
    document.querySelectorAll('.channel-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-channel') === channel) {
            item.classList.add('active');
        }
    });
    
    currentChannel = channel;
    const channelNameEl = document.getElementById('channelName');
    if (channelNameEl) channelNameEl.textContent = channel;
    
    const channelIcons = {
        general: 'fa-hashtag',
        announcements: 'fa-bullhorn',
        help: 'fa-question-circle',
        random: 'fa-random',
        projects: 'fa-code'
    };
    const channelIcon = document.getElementById('channelIcon');
    if (channelIcon) channelIcon.className = `fas ${channelIcons[channel] || 'fa-hashtag'}`;
    
    markChannelRead(channel);
    await loadMessages();
};

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
// FILE HANDLING
// ============================================

function attachFile() {
    document.getElementById('fileInput').click();
}

function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
        showToast('File too large (max 10MB)', 'error');
        return;
    }
    
    pendingFile = file;
    showFilePreview(file.name);
}

function showFilePreview(fileName) {
    const preview = document.getElementById('filePreview');
    const fileNameSpan = document.getElementById('previewFileName');
    if (preview && fileNameSpan) {
        fileNameSpan.textContent = fileName;
        preview.style.display = 'flex';
    }
}

function hideFilePreview() {
    const preview = document.getElementById('filePreview');
    if (preview) preview.style.display = 'none';
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
}

window.cancelFilePreview = () => {
    pendingFile = null;
    hideFilePreview();
};

// ============================================
// VOICE RECORDING
// ============================================

async function startVoiceRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            window.pendingVoiceBlob = audioBlob;
            showVoicePreview();
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();
        
        const voiceBtn = document.getElementById('voiceRecordBtn');
        if (voiceBtn) {
            voiceBtn.classList.add('recording');
            voiceBtn.innerHTML = '<i class="fas fa-stop"></i>';
        }
        
        // Start timer display
        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            const durationSpan = document.getElementById('voiceDuration');
            if (durationSpan) durationSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
        
        showToast('Recording... Click stop to send', 'info');
    } catch (err) {
        console.error('Microphone error:', err);
        showToast('Could not access microphone', 'error');
    }
}

function stopVoiceRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        if (recordingTimer) clearInterval(recordingTimer);
        
        const voiceBtn = document.getElementById('voiceRecordBtn');
        if (voiceBtn) {
            voiceBtn.classList.remove('recording');
            voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        }
    }
}

function toggleVoiceRecording() {
    if (isRecording) {
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
    window.pendingVoiceBlob = null;
}

window.cancelVoicePreview = () => {
    window.pendingVoiceBlob = null;
    hideVoicePreview();
};

// ============================================
// UI HELPERS
// ============================================

function toggleEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    if (picker) picker.classList.toggle('active');
}

function addEmoji(emoji) {
    const input = document.getElementById('messageInput');
    if (input) {
        input.value += emoji;
        input.focus();
    }
    const picker = document.getElementById('emojiPicker');
    if (picker) picker.classList.remove('active');
}

function toggleSidebar() {
    const sidebar = document.getElementById('chatSidebar');
    if (sidebar) sidebar.classList.toggle('open');
}

function toggleInfoPanel() {
    const panel = document.getElementById('infoPanel');
    if (panel) panel.classList.toggle('open');
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

window.toggleVoicePlay = function(btn, audioUrl) {
    const audio = btn.parentElement.querySelector('audio');
    const icon = btn.querySelector('i');
    
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
};

function onTyping() {
    if (typingTimeout) clearTimeout(typingTimeout);
    
    const typingContainer = document.getElementById('typingIndicator');
    if (typingContainer) {
        typingContainer.innerHTML = `
            <div class="typing-indicator">
                <span>You are typing...</span>
                <div class="typing-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
    }
    
    typingTimeout = setTimeout(() => {
        const typingContainer = document.getElementById('typingIndicator');
        if (typingContainer) typingContainer.innerHTML = '';
    }, 1000);
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    const attachBtn = document.getElementById('attachFileBtn');
    const fileInput = document.getElementById('fileInput');
    const voiceBtn = document.getElementById('voiceRecordBtn');
    const emojiBtn = document.getElementById('emojiBtn');
    const scrollBtn = document.getElementById('scrollToBottomBtn');
    const messagesContainer = document.getElementById('messagesContainer');
    const callBtn = document.getElementById('callBtn');
    
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
        messageInput.addEventListener('input', onTyping);
    }
    if (attachBtn) attachBtn.addEventListener('click', () => fileInput?.click());
    if (fileInput) fileInput.addEventListener('change', () => handleFileSelect(fileInput));
    if (voiceBtn) voiceBtn.addEventListener('click', toggleVoiceRecording);
    if (emojiBtn) emojiBtn.addEventListener('click', toggleEmojiPicker);
    if (scrollBtn) scrollBtn.addEventListener('click', scrollToBottom);
    if (messagesContainer) messagesContainer.addEventListener('scroll', checkScroll);
    if (callBtn) callBtn.addEventListener('click', () => showToast('Voice channels coming soon!', 'info'));
    
    // Close emoji picker on outside click
    document.addEventListener('click', (e) => {
        const picker = document.getElementById('emojiPicker');
        const emojiBtnEl = document.getElementById('emojiBtn');
        if (picker && !picker.contains(e.target) && !emojiBtnEl?.contains(e.target)) {
            picker.classList.remove('active');
        }
    });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make functions global for onclick handlers
window.sendMessage = sendMessage;
window.toggleSidebar = toggleSidebar;
window.toggleInfoPanel = toggleInfoPanel;
window.scrollToBottom = scrollToBottom;
window.switchChannel = window.switchChannel;
window.toggleEmojiPicker = toggleEmojiPicker;
window.addEmoji = addEmoji;
window.toggleVoiceRecording = toggleVoiceRecording;
window.cancelFilePreview = window.cancelFilePreview;
window.cancelVoicePreview = window.cancelVoicePreview;
window.toggleVoicePlay = window.toggleVoicePlay;

console.log('Chat.js loaded successfully');
