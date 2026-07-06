// ============================================
// USER MESSAGE - Message Logic
// ============================================

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';
import { getTimeAgo, escapeHtml, generateId } from './user-utils.js';

// ============================================
// LOAD MESSAGES
// ============================================
export async function loadMessages(container, dashboard) {
    if (!container) container = dashboard.container;
    if (!container) return;

    var messages = await getAllUserMessages(dashboard.currentUser.id);

    container.innerHTML = `
        <div class="dashboard-header">
            <h1><i class="fas fa-envelope"></i> Messages</h1>
            <p>Communicate with administrators</p>
        </div>
        <div class="card messages-container">
            <div class="messages-header">
                <h3>Your Messages</h3>
                <button id="newMessageBtn" class="btn-primary"><i class="fas fa-plus"></i> New Message</button>
            </div>
            <div class="message-filters">
                <button class="filter-chip active" data-filter="all">All (${messages.length})</button>
                <button class="filter-chip" data-filter="pending">Pending (${messages.filter(m => m._display_status === 'pending').length})</button>
                <button class="filter-chip" data-filter="replied">Replied (${messages.filter(m => ['replied','reviewed','approved'].includes(m._display_status)).length})</button>
                <button class="filter-chip" data-filter="closed">Closed (${messages.filter(m => ['closed','rejected'].includes(m._display_status)).length})</button>
            </div>
            <div id="messageThreads">${renderMessageThreads(messages)}</div>
        </div>
    `;

    document.getElementById('newMessageBtn')?.addEventListener('click', function() {
        showNewMessageModal(dashboard);
    });

    document.querySelectorAll('.filter-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            var filter = chip.dataset.filter;
            var filtered = messages;
            if (filter === 'pending') filtered = messages.filter(m => m._display_status === 'pending');
            else if (filter === 'replied') filtered = messages.filter(m => ['replied','reviewed','approved'].includes(m._display_status));
            else if (filter === 'closed') filtered = messages.filter(m => ['closed','rejected'].includes(m._display_status));
            document.getElementById('messageThreads').innerHTML = renderMessageThreads(filtered);
        });
    });
}

// ============================================
// GET ALL USER MESSAGES
// ============================================
export async function getAllUserMessages(userId) {
    var allMessages = [];
    var tables = ['applications', 'inquiries', 'contracts', 'submissions', 'jobs'];
    var categories = ['apply', 'inquire', 'contract', 'submit_work', 'hire'];
    var icons = ['🎓', '❓', '📄', '💼', '👔'];
    var dateFields = ['submitted_at', 'created_at', 'created_at', 'created_at', 'created_at'];

    for (var i = 0; i < tables.length; i++) {
        try {
            var { data } = await supabase
                .from(tables[i])
                .select('*')
                .eq('user_id', userId)
                .order(dateFields[i], { ascending: false });

            if (data) {
                data.forEach(function(item) {
                    allMessages.push({
                        ...item,
                        _table: tables[i],
                        _category: categories[i],
                        _display_status: item.status || 'pending',
                        _date: item[dateFields[i]],
                        _subject: item.subject || item.role || 'Message',
                        _message: item.message || '',
                        _icon: icons[i]
                    });
                });
            }
        } catch (e) {
            console.warn('Error loading', tables[i], e);
        }
    }

    allMessages.sort(function(a, b) {
        return new Date(b._date) - new Date(a._date);
    });

    return allMessages;
}

// ============================================
// RENDER MESSAGE THREADS
// ============================================
export function renderMessageThreads(messages) {
    if (!messages || messages.length === 0) {
        return '<div class="empty-state"><i class="fas fa-inbox" style="font-size:48px;color:var(--text-secondary);"></i><h3>No Messages</h3><p>Start a conversation by clicking "New Message"</p></div>';
    }

    var html = '';
    var statusColors = { pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444', replied: '#3b82f6', reviewed: '#8b5cf6', closed: '#64748b' };
    var statusLabels = { pending: 'Pending', approved: '✅ Approved', rejected: '❌ Rejected', replied: '💬 Replied', reviewed: '📋 Reviewed', closed: '🔒 Closed' };

    messages.forEach(function(msg, index) {
        var color = statusColors[msg._display_status] || '#64748b';
        var label = statusLabels[msg._display_status] || msg._display_status;
        var responseHtml = msg.admin_response ? '<div class="admin-response"><strong>Admin:</strong> ' + escapeHtml(msg.admin_response) + '</div>' : '';

        html += `
            <div class="message-accordion" id="msg-${index}">
                <div class="accordion-header" onclick="document.getElementById('msg-body-${index}').classList.toggle('open')">
                    <div class="accordion-left">
                        <span class="msg-icon">${msg._icon}</span>
                        <div class="msg-info">
                            <div class="msg-subject">${escapeHtml(msg._subject)}</div>
                            <div class="msg-meta"><span class="msg-category">${msg._category}</span><span class="msg-date">${getTimeAgo(msg._date)}</span></div>
                        </div>
                    </div>
                    <div class="accordion-right">
                        <span class="status-badge" style="background:${color};color:white;padding:3px 12px;border-radius:12px;font-size:0.7rem;font-weight:600;">${label}</span>
                        <i class="fas fa-chevron-down accordion-arrow"></i>
                    </div>
                </div>
                <div class="accordion-body" id="msg-body-${index}">
                    <div class="message-content"><p>${escapeHtml(msg._message)}</p></div>
                    ${responseHtml}
                </div>
            </div>
        `;
    });

    return html;
}

// ============================================
// SHOW NEW MESSAGE MODAL
// ============================================
export function showNewMessageModal(dashboard) {
    var modal = document.getElementById('newMessageModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        return;
    }

    modal = document.createElement('div');
    modal.id = 'newMessageModal';
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:600px;">
            <div class="modal-header">
                <h2><i class="fas fa-paper-plane"></i> New Message</h2>
                <button class="modal-close" id="closeNewMessageModal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="newMessageForm">
                    <div class="form-group">
                        <label>Category *</label>
                        <select id="messageCategory" name="category">
                            <option value="">Select...</option>
                            <option value="apply">📝 Apply</option>
                            <option value="inquire">❓ Inquire</option>
                            <option value="contract">📄 Contract</option>
                            <option value="submit_work">💼 Submit Work</option>
                            <option value="hire">👔 Hire</option>
                        </select>
                    </div>
                    <div class="form-group" id="roleSelectGroup" style="display:none;">
                        <label>Role</label>
                        <select id="applyRole" name="applyRole">
                            <option value="student">Student</option>
                            <option value="instructor">Instructor</option>
                            <option value="ambassador">Ambassador</option>
                        </select>
                    </div>
                    <div class="form-group"><label>Subject *</label><input type="text" id="messageSubject" name="subject"></div>
                    <div class="form-group"><label>Message *</label><textarea id="messageBody" name="message" rows="5"></textarea></div>
                    <div class="form-group" id="workLinkGroup" style="display:none;"><label>Link</label><input type="url" id="workLink" name="workLink"></div>
                    <button type="button" id="sendMessageBtn" class="btn-primary" style="width:100%;"><i class="fas fa-paper-plane"></i> Send</button>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    document.getElementById('closeNewMessageModal')?.addEventListener('click', function() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    });

    document.getElementById('messageCategory')?.addEventListener('change', function() {
        var val = this.value;
        document.getElementById('roleSelectGroup').style.display = val === 'apply' ? 'block' : 'none';
        document.getElementById('workLinkGroup').style.display = val === 'submit_work' ? 'block' : 'none';
    });

    document.getElementById('sendMessageBtn')?.addEventListener('click', async function() {
        var form = document.getElementById('newMessageForm');
        var fd = new FormData(form);
        var category = fd.get('category') || '';
        var subject = fd.get('subject') || '';
        var message = fd.get('message') || '';

        if (!category || !subject || !message) {
            showToast('Please fill all required fields', 'error');
            return;
        }

        var btn = this;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        window._tempMessageData = {
            category: category,
            subject: subject,
            message: message,
            applyRole: fd.get('applyRole') || 'student',
            workLink: fd.get('workLink') || ''
        };

        var success = await submitNewMessage(dashboard);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send';

        if (success) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            form.reset();
            window._tempMessageData = null;
            await loadMessages(dashboard.container, dashboard);
        }
    });
}

// ============================================
// SUBMIT NEW MESSAGE - FIXED (no birth_day/month)
// ============================================
export async function submitNewMessage(dashboard) {
    var data = window._tempMessageData;
    if (!data) {
        showToast('No message data', 'error');
        return false;
    }

    var { category, subject, message, applyRole, workLink } = data;
    var userId = dashboard.currentUser.id;
    var profile = dashboard.currentProfile;

    var tableMap = {
        'apply': 'applications',
        'inquire': 'inquiries',
        'contract': 'contracts',
        'submit_work': 'submissions',
        'hire': 'jobs'
    };

    var tableName = tableMap[category];
    if (!tableName) {
        showToast('Invalid category', 'error');
        return false;
    }

    var insertData = {
        id: generateId(),
        user_id: userId,
        status: 'pending'
    };

    if (category === 'apply') {
        insertData.full_name = profile?.name || 'User';
        insertData.email = dashboard.currentUser.email;
        insertData.username = profile?.username || 'user';
        insertData.role = applyRole || 'student';
        insertData.submitted_at = new Date().toISOString();
        
        await supabase.from('user_profiles').update({ 
            application_status: 'pending', 
            applied_role: applyRole || 'student' 
        }).eq('id', userId);
    } else {
        insertData.subject = subject;
        insertData.message = message;
        if (category === 'submit_work') insertData.gliimu_link = workLink || null;
        insertData.created_at = new Date().toISOString();
    }

    console.log('📤 Inserting into', tableName, insertData);

    var { error } = await supabase.from(tableName).insert([insertData]);
    if (error) {
        console.error('Insert error:', error);
        showToast('Failed: ' + error.message, 'error');
        return false;
    }

    showToast('✅ Message sent!', 'success');
    return true;
}

// ============================================
// TEST FUNCTION - For debugging
// ============================================
export async function testSendMessage(dashboard) {
    console.log('🔍 Test: Attempting to send message...');
    console.log('🔍 Dashboard:', dashboard);
    console.log('🔍 Current user:', dashboard.currentUser);
    
    var testData = {
        category: 'inquire',
        subject: 'Test Message',
        message: 'This is a test message from the debug function.',
        applyRole: 'student',
        workLink: ''
    };
    
    window._tempMessageData = testData;
    var result = await submitNewMessage(dashboard);
    console.log('🔍 Result:', result);
    return result;
}
