// ============================================
// USER MESSAGES - Simplified
// ============================================

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';
import { getTimeAgo, escapeHtml, generateId } from './user-utils.js';

// ============================================
// LOAD MESSAGES
// ============================================
export async function loadMessages(container, dashboard) {
    if (!container) {
        container = dashboard.container;
    }
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
                <button class="filter-chip" data-filter="pending">Pending (${messages.filter(function(m) { return m._display_status === 'pending'; }).length})</button>
                <button class="filter-chip" data-filter="replied">Replied (${messages.filter(function(m) { return ['replied', 'reviewed', 'approved'].includes(m._display_status); }).length})</button>
                <button class="filter-chip" data-filter="closed">Closed (${messages.filter(function(m) { return ['closed', 'rejected'].includes(m._display_status); }).length})</button>
            </div>
            
            <div id="messageThreads">
                ${renderMessageThreads(messages)}
            </div>
        </div>
    `;

    document.getElementById('newMessageBtn')?.addEventListener('click', function() {
        showNewMessageModal(dashboard);
    });

    document.querySelectorAll('.filter-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
            document.querySelectorAll('.filter-chip').forEach(function(c) {
                c.classList.remove('active');
            });
            chip.classList.add('active');
            var filter = chip.dataset.filter;
            var filtered = messages;
            if (filter === 'pending') {
                filtered = messages.filter(function(m) { return m._display_status === 'pending'; });
            } else if (filter === 'replied') {
                filtered = messages.filter(function(m) { return ['replied', 'reviewed', 'approved'].includes(m._display_status); });
            } else if (filter === 'closed') {
                filtered = messages.filter(function(m) { return ['closed', 'rejected'].includes(m._display_status); });
            }
            document.getElementById('messageThreads').innerHTML = renderMessageThreads(filtered);
        });
    });

    subscribeToMessages(dashboard);
}

// ============================================
// GET ALL USER MESSAGES
// ============================================
export async function getAllUserMessages(userId) {
    var allMessages = [];

    try {
        var { data: applications } = await supabase
            .from('applications')
            .select('*')
            .eq('user_id', userId)
            .order('submitted_at', { ascending: false });

        if (applications) {
            applications.forEach(function(a) {
                allMessages.push({
                    ...a,
                    _table: 'applications',
                    _category: 'apply',
                    _display_status: a.status || 'pending',
                    _date: a.submitted_at,
                    _subject: 'Application: ' + a.role,
                    _message: 'Applied to become a ' + a.role,
                    _icon: '🎓'
                });
            });
        }

        var { data: inquiries } = await supabase
            .from('inquiries')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (inquiries) {
            inquiries.forEach(function(i) {
                allMessages.push({
                    ...i,
                    _table: 'inquiries',
                    _category: 'inquire',
                    _display_status: i.status || 'pending',
                    _date: i.created_at,
                    _subject: i.subject || 'Inquiry',
                    _message: i.message || '',
                    _icon: '❓'
                });
            });
        }

        var { data: contracts } = await supabase
            .from('contracts')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (contracts) {
            contracts.forEach(function(c) {
                allMessages.push({
                    ...c,
                    _table: 'contracts',
                    _category: 'contract',
                    _display_status: c.status || 'pending',
                    _date: c.created_at,
                    _subject: c.subject || 'Contract Offer',
                    _message: c.message || '',
                    _icon: '📄'
                });
            });
        }

        var { data: submissions } = await supabase
            .from('submissions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (submissions) {
            submissions.forEach(function(s) {
                allMessages.push({
                    ...s,
                    _table: 'submissions',
                    _category: 'submit_work',
                    _display_status: s.status || 'pending',
                    _date: s.created_at,
                    _subject: s.subject || 'Work Submission',
                    _message: s.message || '',
                    _icon: '💼'
                });
            });
        }

        var { data: jobs } = await supabase
            .from('jobs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (jobs) {
            jobs.forEach(function(j) {
                allMessages.push({
                    ...j,
                    _table: 'jobs',
                    _category: 'hire',
                    _display_status: j.status || 'pending',
                    _date: j.created_at,
                    _subject: j.subject || 'Job Request',
                    _message: j.message || '',
                    _icon: '👔'
                });
            });
        }

        allMessages.sort(function(a, b) {
            return new Date(b._date) - new Date(a._date);
        });

        return allMessages;

    } catch (error) {
        console.error('Error loading messages:', error);
        return [];
    }
}

// ============================================
// RENDER MESSAGE THREADS
// ============================================
export function renderMessageThreads(messages) {
    if (!messages || messages.length === 0) {
        return '<div class="empty-state"><i class="fas fa-inbox" style="font-size: 48px; color: var(--text-secondary);"></i><h3>No Messages</h3><p>Start a conversation by clicking "New Message"</p></div>';
    }

    var html = '';
    messages.forEach(function(msg, index) {
        var statusColor = '#64748b';
        var statusLabel = msg._display_status || 'Pending';
        
        var fileHtml = msg.file_url ? '<a href="' + msg.file_url + '" target="_blank" class="message-attachment"><i class="fas fa-paperclip"></i> ' + (msg.file_name || 'Attachment') + '</a>' : '';
        var responseHtml = msg.admin_response ? '<div class="admin-response"><div class="response-header"><i class="fas fa-reply"></i><strong>Admin Response</strong><span class="response-date">' + getTimeAgo(msg.replied_at || msg.updated_at) + '</span></div><div class="response-body">' + escapeHtml(msg.admin_response) + '</div></div>' : '';
        var destinationHtml = msg.destination ? '<span class="destination-badge">→ ' + msg.destination + '</span>' : '';
        var gliimuLinkHtml = msg.gliimu_link ? '<a href="' + msg.gliimu_link + '" target="_blank" class="gliimu-link"><i class="fas fa-external-link-alt"></i> View Submission</a>' : '';

        var statusColors = {
            'pending': '#f59e0b',
            'approved': '#10b981',
            'rejected': '#ef4444',
            'replied': '#3b82f6',
            'reviewed': '#8b5cf6',
            'closed': '#64748b',
            'accepted': '#10b981',
            'graded': '#8b5cf6'
        };
        statusColor = statusColors[msg._display_status] || '#64748b';

        var statusLabels = {
            'pending': 'Pending',
            'approved': '✅ Approved',
            'rejected': '❌ Rejected',
            'replied': '💬 Replied',
            'reviewed': '📋 Reviewed',
            'closed': '🔒 Closed',
            'accepted': '✅ Accepted',
            'graded': '📊 Graded'
        };
        statusLabel = statusLabels[msg._display_status] || msg._display_status;

        var categoryLabels = {
            'apply': '📝 Application',
            'inquire': '❓ Inquiry',
            'contract': '📄 Contract',
            'submit_work': '💼 Work Submission',
            'hire': '👔 Job Request'
        };
        var categoryLabel = categoryLabels[msg._category] || msg._category;

        html += `
            <div class="message-accordion ${msg._display_status}" id="msg-${index}">
                <div class="accordion-header" onclick="document.getElementById('msg-body-${index}').classList.toggle('open')">
                    <div class="accordion-left">
                        <span class="msg-icon">${msg._icon || '📌'}</span>
                        <div class="msg-info">
                            <div class="msg-subject">${escapeHtml(msg._subject)}</div>
                            <div class="msg-meta">
                                <span class="msg-category">${categoryLabel}</span>
                                <span class="msg-date">${getTimeAgo(msg._date)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="accordion-right">
                        <span class="status-badge" style="background: ${statusColor}; color: white; padding: 3px 12px; border-radius: 12px; font-size: 0.7rem; font-weight: 600;">${statusLabel}</span>
                        <i class="fas fa-chevron-down accordion-arrow"></i>
                    </div>
                </div>
                <div class="accordion-body" id="msg-body-${index}">
                    <div class="message-content">
                        <p>${escapeHtml(msg._message)}</p>
                        ${fileHtml}
                        ${gliimuLinkHtml}
                        ${destinationHtml}
                    </div>
                    ${responseHtml}
                    <div class="message-actions">
                        ${msg._display_status === 'pending' ? '<span class="pending-label"><i class="fas fa-clock"></i> Waiting for admin response...</span>' : ''}
                    </div>
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
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h2><i class="fas fa-paper-plane"></i> New Message</h2>
                <button class="modal-close" id="closeNewMessageModal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="newMessageForm" novalidate>
                    <div class="form-group">
                        <label>Category *</label>
                        <select id="messageCategory" name="category">
                            <option value="">Select a category...</option>
                            <option value="apply">📝 Apply</option>
                            <option value="inquire">❓ Inquire</option>
                            <option value="contract">📄 Contract</option>
                            <option value="submit_work">💼 Submit Work</option>
                            <option value="hire">👔 Hire</option>
                        </select>
                    </div>
                    <div class="form-group" id="roleSelectGroup" style="display:none;">
                        <label>Apply for Role</label>
                        <select id="applyRole" name="applyRole">
                            <option value="student">Student</option>
                            <option value="instructor">Instructor</option>
                            <option value="ambassador">Ambassador</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Subject *</label>
                        <input type="text" id="messageSubject" name="subject" placeholder="Enter message subject">
                    </div>
                    <div class="form-group">
                        <label>Message *</label>
                        <textarea id="messageBody" name="message" rows="5" placeholder="Type your message..."></textarea>
                    </div>
                    <div class="form-group" id="workLinkGroup" style="display:none;">
                        <label>Gliimu Link</label>
                        <input type="url" id="workLink" name="workLink" placeholder="https://gliimu.com/...">
                    </div>
                    <button type="button" id="sendMessageBtn" class="btn-primary" style="width:100%;">
                        <i class="fas fa-paper-plane"></i> Send Message
                    </button>
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
        var category = this.value;
        var roleGroup = document.getElementById('roleSelectGroup');
        var workGroup = document.getElementById('workLinkGroup');
        roleGroup.style.display = category === 'apply' ? 'block' : 'none';
        workGroup.style.display = category === 'submit_work' ? 'block' : 'none';
    });

    document.getElementById('sendMessageBtn')?.addEventListener('click', async function() {
        var form = document.getElementById('newMessageForm');
        var formData = new FormData(form);
        
        var category = formData.get('category') || '';
        var subject = formData.get('subject') || '';
        var message = formData.get('message') || '';
        var applyRole = formData.get('applyRole') || 'student';
        var workLink = formData.get('workLink') || '';

        if (!category || !subject || !message) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        var btn = this;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        window._tempMessageData = { category, subject, message, applyRole, workLink };
        var success = await submitNewMessage(dashboard);
        
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';

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
// SUBMIT NEW MESSAGE
// ============================================
export async function submitNewMessage(dashboard) {
    var data = window._tempMessageData;
    if (!data) {
        showToast('No message data', 'error');
        return false;
    }

    var { category, subject, message, applyRole, workLink } = data;

    try {
        var userId = dashboard.currentUser.id;
        var profile = dashboard.currentProfile;
        var tableName = '';
        var insertData = {};

        switch(category) {
            case 'apply':
                tableName = 'applications';
                insertData = {
                    id: generateId(),
                    user_id: userId,
                    full_name: profile?.name || 'User',
                    email: dashboard.currentUser.email,
                    username: profile?.username || 'user',
                    role: applyRole || 'student',
                    status: 'pending',
                    submitted_at: new Date().toISOString()
                };
                await supabase
                    .from('user_profiles')
                    .update({ application_status: 'pending', applied_role: applyRole || 'student' })
                    .eq('id', userId);
                break;
            case 'inquire':
                tableName = 'inquiries';
                insertData = {
                    id: generateId(),
                    user_id: userId,
                    subject: subject,
                    message: message,
                    status: 'pending',
                    created_at: new Date().toISOString()
                };
                break;
            case 'contract':
                tableName = 'contracts';
                insertData = {
                    id: generateId(),
                    user_id: userId,
                    subject: subject,
                    message: message,
                    status: 'pending',
                    created_at: new Date().toISOString()
                };
                break;
            case 'submit_work':
                tableName = 'submissions';
                insertData = {
                    id: generateId(),
                    user_id: userId,
                    subject: subject,
                    message: message,
                    gliimu_link: workLink || null,
                    status: 'pending',
                    created_at: new Date().toISOString()
                };
                break;
            case 'hire':
                tableName = 'jobs';
                insertData = {
                    id: generateId(),
                    user_id: userId,
                    subject: subject,
                    message: message,
                    status: 'pending',
                    created_at: new Date().toISOString()
                };
                break;
            default:
                showToast('Invalid category', 'error');
                return false;
        }

        var { error } = await supabase.from(tableName).insert([insertData]);
        if (error) throw error;

        showToast('✅ Message sent successfully!', 'success');
        return true;

    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Failed to send: ' + error.message, 'error');
        return false;
    }
}

// ============================================
// SUBSCRIBE TO MESSAGES
// ============================================
export function subscribeToMessages(dashboard) {
    var userId = dashboard.currentUser.id;
    var tables = ['applications', 'inquiries', 'contracts', 'submissions', 'jobs'];
    
    tables.forEach(function(table) {
        supabase
            .channel(table + '_changes_' + userId)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: table,
                filter: 'user_id=eq.' + userId
            }, function() {
                loadMessages(dashboard.container, dashboard);
            })
            .subscribe();
    });
}
