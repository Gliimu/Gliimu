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
    currentUser = await getCurrentUser();
    
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
        document.getElementById('currentUserName').textContent = 'Guest User';
        document.getElementById('userStatusText').textContent = 'Not signed in';
        document.getElementById('messageInput').disabled = true;
        document.getElementById('sendBtn').disabled = true;
        return;
    }
    
    // Update UI with user info
    document.getElementById('currentUserName').textContent = currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'User';
    document.getElementById('userStatusText').textContent = 'Online';
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendBtn').disabled = false;
    document.getElementById('logoutBtn').style.display = 'block';
    
    // Setup logout
    document.getElementById('logoutBtn').onclick = async () => {
        await supabase.auth.signOut();
        window.location.reload();
    };
    
    // Load messages for current channel
    await loadMessages();
    
    // Setup real-time subscription
    setupRealtimeSubscription();
    
    // Load online users
    await loadOnlineUsers();
    
    // Setup event listeners
    setupEventListeners();
    
    // Start timer if free tier
    await initTimer();
    
    // Mark channel as read
    markChannelRead(currentChannel);
});

// ============================================
// TIMER FOR FREE TIER
// ============================================

async function initTimer() {
    try {
        const { checkPlatformAccess, getRemainingMinutes, startTimer as startChatTimer } = await import('../modules/access-guard.js');
        
        const hasAccess = await checkPlatformAccess('chat');
        if (!hasAccess) {
            const remaining = await getRemainingMinutes('chat');
            if (remaining <= 0) {
                document.getElementById('messageInput').disabled = true;
                document.getElementById('sendBtn').disabled = true;
                showToast('Free time used up. Upgrade to continue chatting!', 'warning');
            } else {
                startChatTimer('chat');
                updateTimerDisplay(remaining);
            }
        }
    } catch (error) {
        console.log('Timer not available for chat');
    }
}

function updateTimerDisplay(minutes) {
    const timerBanner = document.getElementById('timerBanner');
    const timerDisplay = document.getElementById('timerDisplay');
    
    if (minutes <= 15 && minutes > 0) {
        timerBanner.style.display = 'block';
        const mins = Math.floor(minutes);
        const secs = Math.floor((minutes - mins) * 60);
        timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else if (minutes <= 0) {
        timerBanner.style.display = 'block';
        timerDisplay.textContent = '00:00';
        document.getElementById('messageInput').disabled = true;
        document.getElementById('sendBtn').disabled = true;
    }
}

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
        
        if (error) throw error;
        
        if (messages && messages.length > 0) {
            allMessages = messages;
            renderMessages();
        } else {
            // Show welcome message
            container.innerHTML = `
                <div class="welcome-message">
                    <i class="fas fa-comments"></i>
                    <h3>Welcome to #${currentChannel}</h3>
                    <p>Be the first to start the conversation!</p>
                </div>
            `;
        }
        
        scrollToBottom();
        
    } catch (error) {
        console.error('Error loading messages:', error);
        // Show mock messages for demo if table doesn't exist
        loadMockMessages();
    }
}

function loadMockMessages() {
    const container = document.getElementById('messagesContainer');
    
    const mockMessages = [
        {
            id: '1',
            sender_id: 'system',
            sender_name: 'System',
            message: 'Welcome to the Gliimu Community Chat! Feel free to introduce yourself.',
            type: 'text',
            created_at: new Date().toISOString(),
            channel: currentChannel
        },
        {
            id: '2',
            sender_id: 'system',
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
                    <span>${message.file_name || 'Download File'}</span>
                </a>
            </div>
        `;
    } else if (message.type === 'voice') {
        contentHtml = `
            <div class="message-bubble">
                <div class="voice-message">
                    <button class="voice-play-btn" onclick="toggleVoicePlay(this, '${message.file_url}')">
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
    
    if (!text && !pendingFile && !window.pendingVoice) return;
    
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
        // Try to save to Supabase
        const { error } = await supabase
            .from('chat_messages')
            .insert(message);
        
        if (error) {
            console.error('Error saving message:', error);
            // Add to local state anyway
            allMessages.push(message);
            renderMessages();
        }
        
    } catch (error) {
        // Add to local state
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
    // Subscribe to new messages
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
                    // Increment unread count for other channel
                    if (unreadCounts[newMessage.channel] !== undefined) {
                        unreadCounts[newMessage.channel]++;
                        updateChannelBadge(newMessage.channel, unreadCounts[newMessage.channel]);
                    }
                }
            }
        )
        .subscribe();
    
    // Subscribe to user presence
    userSubscription = supabase
        .channel('user_presence')
        .on('presence', { event: 'sync' }, () => {
            const presenceState = userSubscription.presenceState();
            updateOnlineUsersFromPresence(presenceState);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED' && currentUser) {
                await userSubscription.track({
                    user_id: currentUser.id,
                    name: currentUser.user_metadata?.name || currentUser.email?.split('@')[0],
                    online_at: new Date().toISOString()
                });
            }
        });
}

function updateOnlineUsersFromPresence(presenceState) {
    const users = Object.values(presenceState).flat();
    const onlineUsersList = document.getElementById('onlineUsersList');
    
    if (onlineUsersList) {
        onlineUsersList.innerHTML = users.map(user => `
            <div class="user-item">
                <div class="user-avatar">
                    <i class="fas fa-user-circle"></i>
                </div>
                <div class="user-info">
                    <div class="user-name">${escapeHtml(user.name || 'User')}</div>
                    <div class="user-role">Online</div>
                </div>
                <div class="user-status"></div>
            </div>
        `).join('');
        
        document.getElementById('onlineCount').textContent = users.length;
    }
}

// ============================================
// LOAD ONLINE USERS FROM DATABASE
// ============================================

async function loadOnlineUsers() {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, name, role')
            .limit(20);
        
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
            document.getElementById('onlineCount').textContent = users.length;
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// ============================================
// CHANNEL MANAGEMENT
// ============================================

window.switchChannel = async (channel) => {
    // Update active state
    document.querySelectorAll('.channel-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.channel === channel) {
            item.classList.add('active');
        }
    });
    
    currentChannel = channel;
    document.getElementById('channelName').textContent = channel;
    
    // Update channel icon
    const channelIcons = {
        general: 'fa-hashtag',
        announcements: 'fa-bullhorn',
        help: 'fa-question-circle',
        random: 'fa-random',
        projects: 'fa-code'
    };
    document.getElementById('channelIcon').className = `fas ${channelIcons[channel] || 'fa-hashtag'}`;
    
    // Mark channel as read
    markChannelRead(channel);
    
    // Load messages for new channel
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
    fileNameSpan.textContent = fileName;
    preview.style.display = 'flex';
}

function hideFilePreview() {
    const preview = document.getElementById('filePreview');
    preview.style.display = 'none';
    document.getElementById('fileInput').value = '';
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
        voiceBtn.classList.add('recording');
        voiceBtn.innerHTML = '<i class="fas fa-stop"></i>';
        
        // Start timer display
        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            document.getElementById('voiceDuration').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
        clearInterval(recordingTimer);
        
        const voiceBtn = document.getElementById('voiceRecordBtn');
        voiceBtn.classList.remove('recording');
        voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
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
    preview.style.display = 'flex';
}

function hideVoicePreview() {
    const preview = document.getElementById('voicePreview');
    preview.style.display = 'none';
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
    picker.classList.toggle('active');
}

function addEmoji(emoji) {
    const input = document.getElementById('messageInput');
    input.value += emoji;
    input.focus();
    document.getElementById('emojiPicker').classList.remove('active');
}

function toggleSidebar() {
    const sidebar = document.getElementById('chatSidebar');
    sidebar.classList.toggle('open');
}

function toggleInfoPanel() {
    const panel = document.getElementById('infoPanel');
    panel.classList.toggle('open');
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

function toggleVoicePlay(btn, audioUrl) {
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
}

function onTyping() {
    if (typingTimeout) clearTimeout(typingTimeout);
    
    // Show typing indicator in UI
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
    // Send message
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
        messageInput.addEventListener('input', onTyping);
    }
    
    // File attachment
    const attachBtn = document.getElementById('attachFileBtn');
    const fileInput = document.getElementById('fileInput');
    if (attachBtn) attachBtn.addEventListener('click', () => fileInput.click());
    if (fileInput) fileInput.addEventListener('change', () => handleFileSelect(fileInput));
    
    // Voice recording
    const voiceBtn = document.getElementById('voiceRecordBtn');
    if (voiceBtn) voiceBtn.addEventListener('click', toggleVoiceRecording);
    
    // Emoji picker
    const emojiBtn = document.getElementById('emojiBtn');
    if (emojiBtn) emojiBtn.addEventListener('click', toggleEmojiPicker);
    
    // Scroll to bottom
    const scrollBtn = document.getElementById('scrollToBottomBtn');
    if (scrollBtn) scrollBtn.addEventListener('click', scrollToBottom);
    
    // Scroll detection
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) messagesContainer.addEventListener('scroll', checkScroll);
    
    // Close emoji picker on outside click
    document.addEventListener('click', (e) => {
        const picker = document.getElementById('emojiPicker');
        const emojiBtnEl = document.getElementById('emojiBtn');
        if (picker && !picker.contains(e.target) && !emojiBtnEl?.contains(e.target)) {
            picker.classList.remove('active');
        }
    });
    
    // Call button
    const callBtn = document.getElementById('callBtn');
    if (callBtn) {
        callBtn.addEventListener('click', () => {
            showToast('Voice channels coming soon!', 'info');
        });
    }
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

// Make functions global
window.sendMessage = sendMessage;
window.attachFile = attachFile;
window.handleFileSelect = handleFileSelect;
window.cancelFilePreview = cancelFilePreview;
window.cancelVoicePreview = cancelVoicePreview;
window.toggleVoiceRecording = toggleVoiceRecording;
window.toggleEmojiPicker = toggleEmojiPicker;
window.addEmoji = addEmoji;
window.toggleSidebar = toggleSidebar;
window.toggleInfoPanel = toggleInfoPanel;
window.scrollToBottom = scrollToBottom;
window.toggleVoicePlay = toggleVoicePlay;
window.switchChannel = switchChannel;
