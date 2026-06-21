// ============================================
// 💬 COMMUNITY CHAT - GLIIMU
// Fixed: Audio, File Uploads, Mobile Input
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
let typingTimeout = null;
let lastMessageId = null;

// Audio recording
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;

// Unread counts
let unreadCounts = {
    general: 0,
    announcements: 0,
    help: 0,
    random: 0,
    projects: 0
};

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('💬 Chat initializing...');
    
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
    await loadMessages();
    setupRealtimeSubscription();
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
// MESSAGES
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
        
        // Handle different message types
        if (msg.type === 'image' && msg.file_url) {
            contentHtml = `
                <div class="message-bubble" style="padding:4px;background:transparent;border:none;">
                    <img src="${msg.file_url}" alt="Image" class="message-image" loading="lazy" onclick="window.open('${msg.file_url}','_blank')">
                </div>
            `;
        } else if (msg.type === 'file' && msg.file_url) {
            contentHtml = `
                <div class="message-bubble file-bubble">
                    <a href="${msg.file_url}" target="_blank" class="message-file">
                        <i class="fas fa-file-download"></i>
                        <span>📄 ${escapeHtml(msg.file_name || 'Download')}</span>
                    </a>
                </div>
            `;
        } else if (msg.type === 'voice' && msg.file_url) {
            contentHtml = `
                <div class="message-bubble voice-bubble">
                    <div class="voice-message">
                        <button class="voice-play-btn" onclick="toggleVoicePlay(this, '${msg.file_url}')">
                            <i class="fas fa-play"></i>
                        </button>
                        <div class="voice-wave">
                            <span></span><span></span><span></span><span></span><span></span>
                        </div>
                        <audio style="display:none;" src="${msg.file_url}"></audio>
                    </div>
                </div>
            `;
        } else {
            contentHtml = `<div class="message-bubble">${escapeHtml(msg.message)}</div>`;
        }
        
        html += `
            <div class="message-group ${isSelf ? 'self' : 'other'}">
                ${!isSelf && showSender ? `<div class="message-sender">${escapeHtml(senderName)}</div>` : ''}
                ${contentHtml}
                <div class="message-time">${time}</div>
            </div>
        `;
        
        lastSender = msg.sender_id;
    });
    
    container.innerHTML = html;
    if (shouldScroll) scrollToBottom();
}

// ============================================
// SEND MESSAGE - FIXED FILE & VOICE
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
    
    const sendBtn = document.getElementById('sendBtn');
    const originalHtml = sendBtn?.innerHTML;
    if (sendBtn) {
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sendBtn.disabled = true;
    }
    
    try {
        // Handle file upload
        if (pendingFile) {
            const file = pendingFile;
            const ext = file.name.split('.').pop();
            const path = `chat_uploads/${currentUser.id}/${Date.now()}.${ext}`;
            
            const { error: uploadError } = await supabase.storage
                .from('chat-files')
                .upload(path, file);
            
            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage
                    .from('chat-files')
                    .getPublicUrl(path);
                
                fileUrl = publicUrl;
                fileName = file.name;
                messageType = file.type.startsWith('image/') ? 'image' : 'file';
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
        
        // Handle voice message
        if (pendingVoiceBlob) {
            const path = `chat_uploads/${currentUser.id}/voice_${Date.now()}.webm`;
            
            const { error: uploadError } = await supabase.storage
                .from('chat-files')
                .upload(path, pendingVoiceBlob);
            
            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage
                    .from('chat-files')
                    .getPublicUrl(path);
                
                fileUrl = publicUrl;
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
        
        // Optimistic update
        const tempId = 'temp_' + Date.now();
        const tempMsg = { ...message, id: tempId };
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
                        <div class="user-avatar"><i class="fas fa-user-circle"></i></div>
                        <div class="user-info">
                            <div class="user-name">${escapeHtml(user.name || 'User')}</div>
                            <div class="user-role">${user.role || 'Member'}</div>
                        </div>
                    </div>
                `).join('');
            }
            
            // Update info panel online users
            const infoContainer = document.getElementById('infoOnlineUsersList');
            if (infoContainer) {
                infoContainer.innerHTML = users.map(user => `
                    <div class="user-item">
                        <div class="user-avatar"><i class="fas fa-user-circle"></i></div>
                        <div class="user-info">
                            <div class="user-name">${escapeHtml(user.name || 'User')}</div>
                            <div class="user-role">${user.role || 'Member'}</div>
                        </div>
                    </div>
                `).join('');
            }
            
            const count = document.getElementById('onlineCount');
            if (count) count.textContent = users.length;
            
            const infoCount = document.getElementById('infoOnlineCount');
            if (infoCount) infoCount.textContent = users.length;
        }
    } catch (error) {
        console.error('Error loading users:', error);
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
// VOICE RECORDING - FIXED
// ============================================

async function startVoiceRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            if (blob.size > 0) {
                pendingVoiceBlob = blob;
                showVoicePreview();
            } else {
                showToast('❌ Recording failed', 'error');
            }
            stream.getTracks().forEach(t => t.stop());
        };
        
        mediaRecorder.start();
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
        
        showToast('🎤 Recording... Click stop to send', 'info');
    } catch (err) {
        console.error('Microphone error:', err);
        showToast('❌ Could not access microphone', 'error');
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
    pendingVoiceBlob = null;
}

function cancelVoicePreview() {
    pendingVoiceBlob = null;
    hideVoicePreview();
}

function toggleVoicePlay(btn, audioUrl) {
    const container = btn.parentElement;
    let audio = container.querySelector('audio');
    
    if (!audio) {
        audio = document.createElement('audio');
        audio.src = audioUrl;
        container.appendChild(audio);
    }
    
    const icon = btn.querySelector('i');
    
    if (audio.paused) {
        audio.play();
        icon.className = 'fas fa-pause';
        audio.onended = () => {
            icon.className = 'fas fa-play';
        };
        audio.onerror = () => {
            showToast('❌ Could not play voice message', 'error');
            icon.className = 'fas fa-play';
        };
    } else {
        audio.pause();
        icon.className = 'fas fa-play';
    }
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
    if (memberCount) memberCount.textContent = document.querySelectorAll('.user-item').length || 0;
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

function toggleInfoPanel() {
    const panel = document.getElementById('infoPanel');
    const overlay = document.getElementById('infoOverlay');
    if (panel) panel.classList.toggle('open');
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
    // Send
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
        input.addEventListener('input', onTyping);
    }
    
    // File
    const attachBtn = document.getElementById('attachFileBtn');
    const fileInput = document.getElementById('fileInput');
    if (attachBtn) attachBtn.addEventListener('click', () => fileInput?.click());
    if (fileInput) fileInput.addEventListener('change', () => handleFileSelect(fileInput));
    
    // Voice
    const voiceBtn = document.getElementById('voiceRecordBtn');
    if (voiceBtn) voiceBtn.addEventListener('click', toggleVoiceRecording);
    
    // Emoji
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
    
    // Sidebar
    const menuToggle = document.getElementById('menuToggleBtn');
    const closeSidebar = document.getElementById('closeSidebarBtn');
    const overlay = document.getElementById('sidebarOverlay');
    if (menuToggle) menuToggle.addEventListener('click', toggleSidebar);
    if (closeSidebar) closeSidebar.addEventListener('click', toggleSidebar);
    if (overlay) overlay.addEventListener('click', toggleSidebar);
    
    // Info panel
    const infoToggle = document.getElementById('infoToggleBtn');
    const closeInfo = document.getElementById('closeInfoPanelBtn');
    const infoOverlay = document.getElementById('infoOverlay');
    if (infoToggle) infoToggle.addEventListener('click', toggleInfoPanel);
    if (closeInfo) closeInfo.addEventListener('click', toggleInfoPanel);
    if (infoOverlay) infoOverlay.addEventListener('click', toggleInfoPanel);
    
    // Modal
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
    
    // Info button opens modal
    if (infoToggle) {
        infoToggle.addEventListener('click', () => {
            // Close info panel if open on mobile
            const panel = document.getElementById('infoPanel');
            if (panel && panel.classList.contains('open')) {
                toggleInfoPanel();
            }
            openChannelModal();
        });
    }
    
    // Scroll
    const scrollBtn = document.getElementById('scrollToBottomBtn');
    const messages = document.getElementById('messagesContainer');
    if (scrollBtn) scrollBtn.addEventListener('click', scrollToBottom);
    if (messages) messages.addEventListener('scroll', checkScroll);
    
    // Cancel buttons
    const cancelFile = document.getElementById('cancelFileBtn');
    const cancelVoice = document.getElementById('cancelVoiceBtn');
    if (cancelFile) cancelFile.addEventListener('click', cancelFilePreview);
    if (cancelVoice) cancelVoice.addEventListener('click', cancelVoicePreview);
    
    // Channel clicks
    document.querySelectorAll('.channel-item').forEach(el => {
        el.addEventListener('click', () => {
            const channel = el.dataset.channel;
            if (channel) switchChannel(channel);
        });
    });
}

// ============================================
// EXPOSE TO WINDOW
// ============================================

window.sendMessage = sendMessage;
window.switchChannel = switchChannel;
window.toggleSidebar = toggleSidebar;
window.toggleInfoPanel = toggleInfoPanel;
window.toggleEmojiPicker = toggleEmojiPicker;
window.toggleVoiceRecording = toggleVoiceRecording;
window.toggleVoicePlay = toggleVoicePlay;
window.addEmoji = addEmoji;
window.scrollToBottom = scrollToBottom;
window.loadOnlineUsers = loadOnlineUsers;
window.cancelFilePreview = cancelFilePreview;
window.cancelVoicePreview = cancelVoicePreview;
window.openChannelModal = openChannelModal;
window.closeChannelModal = closeChannelModal;
window.showToast = showToast;

console.log('✅ Chat.js loaded');
