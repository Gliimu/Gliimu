// ============================================
// USER MESSAGES - Message Logic
// ============================================

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';
import { 
    getTimeAgo, 
    escapeHtml, 
    getStatusColor, 
    getStatusLabel, 
    getCategoryLabel,
    generateId
} from './user-utils.js';

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
            <p>Communicate with administrators based on your needs</p>
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
        // Applications
        var { data: applications } = await supabase
            .from('applications')
            .select('*')
            .eq('user_id', userId)
            .order('submitted_at', { ascending: false });

        if (applications) {
            allMessages = allMessages.concat(applications.map(function(a) {
                return {
                    ...a,
                    _table: 'applications',
                    _category: 'apply',
                    _display_status: a.status || 'pending',
                    _date: a.submitted_at,
                    _subject: 'Application: ' + a.role,
                    _message: 'Applied to become a ' + a.role,
                    _icon: '🎓'
                };
            }));
        }

        // Inquiries
        var { data: inquiries } = await supabase
            .from('inquiries')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (inquiries) {
            allMessages = allMessages.concat(inquiries.map(function(i) {
                return {
                    ...i,
                    _table: 'inquiries',
                    _category: 'inquire',
                    _display_status: i.status || 'pending',
                    _date: i.created_at,
                    _subject: i.subject || 'Inquiry',
                    _message: i.message || '',
                    _icon: '❓'
                };
            }));
        }

        // Contracts
        var { data: contracts } = await supabase
            .from('contracts')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (contracts) {
            allMessages = allMessages.concat(contracts.map(function(c) {
                return {
                    ...c,
                    _table: 'contracts',
                    _category: 'contract',
                    _display_status: c.status || 'pending',
                    _date: c.created_at,
                    _subject: c.subject || 'Contract Offer',
                    _message: c.message || '',
                    _icon: '📄'
                };
            }));
        }

        // Submissions
        var { data: submissions } = await supabase
            .from('submissions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (submissions) {
            allMessages = allMessages.concat(submissions.map(function(s) {
                return {
                    ...s,
                    _table: 'submissions',
                    _category: 'submit_work',
                    _display_status: s.status || 'pending',
                    _date: s.created_at,
                    _subject: s.subject || 'Work Submission',
                    _message: s.message || '',
                    _icon: '💼'
                };
            }));
        }

        // Jobs
        var { data: jobs } = await supabase
            .from('jobs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (jobs) {
            allMessages = allMessages.concat(jobs.map(function(j) {
                return {
                    ...j,
                    _table: 'jobs',
                    _category: 'hire',
                    _display_status: j.status || 'pending',
                    _date: j.created_at,
                    _subject: j.subject || 'Job Request',
                    _message: j.message || '',
                    _icon: '👔'
                };
            }));
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
        return `
            <div class="empty-state">
                <i class="fas fa-inbox" style="font-size: 48px; color: var(--text-secondary);"></i>
                <h3>No Messages</h3>
                <p>Start a conversation by clicking "New Message"</p>
            </div>
        `;
    }

    return messages.map(function(msg, index) {
        var statusColor = getStatusColor(msg._display_status);
        var statusLabel = getStatusLabel(msg._display_status);
        var fileHtml = msg.file_url ? `
            <a href="${msg.file_url}" target="_blank" class="message-attachment">
                <i class="fas fa-paperclip"></i> ${msg.file_name || 'Attachment'}
            </a>
        ` : '';

        var responseHtml = msg.admin_response ? `
            <div class="admin-response">
                <div class="response-header">
                    <i class="fas fa-reply"></i>
                    <strong>Admin Response</strong>
                    <span class="response-date">${getTimeAgo(msg.replied_at || msg.updated_at)}</span>
                </div>
                <div class="response-body">${escapeHtml(msg.admin_response)}</div>
            </div>
        ` : '';

        var destinationHtml = msg.destination ? `
            <span class="destination-badge">→ ${msg.destination}</span>
        ` : '';

        var gliimuLinkHtml = msg.gliimu_link ? `
            <a href="${msg.gliimu_link}" target="_blank" class="gliimu-link">
                <i class="fas fa-external-link-alt"></i> View Submission
            </a>
        ` : '';

        return `
            <div class="message-accordion ${msg._display_status}" id="msg-${index}">
                <div class="accordion-header" onclick="document.getElementById('msg-body-${index}').classList.toggle('open')">
                    <div class="accordion-left">
                        <span class="msg-icon">${msg._icon}</span>
                        <div class="msg-info">
                            <div class="msg-subject">${escapeHtml(msg._subject)}</div>
                            <div class="msg-meta">
                                <span class="msg-category">${getCategoryLabel(msg._category)}</span>
                                <span class="msg-date">${getTimeAgo(msg._date)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="accordion-right">
                        <span class="status-badge" style="background: ${statusColor}; color: white; padding: 3px 12px; border-radius: 12px; font-size: 0.7rem; font-weight: 600;">
                            ${statusLabel}
                        </span>
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
                        ${msg._display_status === 'pending' ? `
                            <span class="pending-label"><i class="fas fa-clock"></i> Waiting for admin response...</span>
                        ` : ''}
                        ${msg._category === 'submit_work' && msg._display_status === 'approved' ? `
                            <span class="approved-label"><i class="fas fa-check-circle"></i> Work Approved!</span>
                        ` : ''}
                        ${msg._category === 'apply' && msg._display_status === 'approved' ? `
                            <span class="approved-label"><i class="fas fa-check-circle"></i> Application Approved! Your role has been updated.</span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// SHOW NEW MESSAGE MODAL
// ============================================
export function showNewMessageModal(dashboard) {
    var modal = document.getElementById('newMessageModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        var form = document.getElementById('newMessageForm');
        if (form) form.reset();
        var preview = document.getElementById('messageFilePreview');
        if (preview) preview.style.display = 'none';
        var roleGroup = document.getElementById('roleSelectGroup');
        if (roleGroup) roleGroup.style.display = 'none';
        var workGroup = document.getElementById('workLinkGroup');
        if (workGroup) workGroup.style.display = 'none';
        window._messageFileData = null;
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
                            <option value="apply">📝 Apply (Become a Student/Instructor/Ambassador)</option>
                            <option value="inquire">❓ Inquire (Ask a question)</option>
                            <option value="contract">📄 Offer Contract (Propose a contract)</option>
                            <option value="submit_work">💼 Submit Work (Share your project)</option>
                            <option value="hire">👔 Employ/Hire (Request employment)</option>
                        </select>
                        <small id="categoryHint">Select a category to route your message to the right admin</small>
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
                        <textarea id="messageBody" name="message" rows="5" placeholder="Type your message in detail..."></textarea>
                    </div>

                    <div class="form-group">
                        <label>Attachments (PDF or Images)</label>
                        <div class="upload-field" id="uploadField">
                            <span class="upload-icon">📎</span>
                            <span class="upload-text">Click to upload file</span>
                            <small>Supports PDF, JPG, PNG (Max 10MB)</small>
                            <input type="file" id="messageFileInput" accept=".pdf,image/*" style="display:none;">
                        </div>
                        <div class="file-preview" id="messageFilePreview" style="display:none;">
                            <i class="fas fa-file"></i>
                            <span class="file-name" id="messageFileName">No file selected</span>
                            <button type="button" class="btn-remove-file" id="removeMessageFileBtn">✕ Remove</button>
                        </div>
                    </div>

                    <div class="form-group" id="workLinkGroup" style="display:none;">
                        <label>Gliimu Link (for work submissions)</label>
                        <input type="url" id="workLink" name="workLink" placeholder="https://gliimu.com/submit/your-work">
                        <small>If you have a published work on Gliimu, paste the link here</small>
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
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    document.getElementById('messageCategory')?.addEventListener('change', function(e) {
        var category = this.value;
        var hint = document.getElementById('categoryHint');
        var roleGroup = document.getElementById('roleSelectGroup');
        var workLinkGroup = document.getElementById('workLinkGroup');

        roleGroup.style.display = 'none';
        workLinkGroup.style.display = 'none';

        if (category === 'apply') {
            roleGroup.style.display = 'block';
            hint.textContent = 'Your application will be sent to the Manager for review.';
        } else if (category === 'submit_work') {
            workLinkGroup.style.display = 'block';
            hint.textContent = 'Your work submission will be sent to CRM for review.';
        } else {
            var hints = {
                'inquire': 'Your inquiry will be sent to CRM for response.',
                'contract': 'Your contract offer will be sent to the Manager.',
                'hire': 'Your job request will be sent to the Manager.'
            };
            hint.textContent = hints[category] || 'Select a category to route your message to the right admin';
        }
    });

    document.getElementById('uploadField')?.addEventListener('click', function() {
        document.getElementById('messageFileInput').click();
    });

    document.getElementById('messageFileInput')?.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        
        if (file.size > 10 * 1024 * 1024) {
            showToast('File too large. Maximum 10MB.', 'error');
            this.value = '';
            return;
        }

        var validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            showToast('Only PDF and Image files are allowed.', 'error');
            this.value = '';
            return;
        }

        window._messageFileData = file;
        var preview = document.getElementById('messageFilePreview');
        var fileName = document.getElementById('messageFileName');
        
        if (fileName) {
            fileName.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
        }
        if (preview) {
            preview.style.display = 'flex';
        }
        showToast('📎 ' + file.name + ' selected', 'success');
    });

    document.getElementById('removeMessageFileBtn')?.addEventListener('click', function() {
        window._messageFileData = null;
        document.getElementById('messageFileInput').value = '';
        var preview = document.getElementById('messageFilePreview');
        if (preview) {
            preview.style.display = 'none';
        }
        document.getElementById('messageFileName').textContent = 'No file selected';
    });

    document.getElementById('sendMessageBtn')?.addEventListener('click', async function() {
        var form = document.getElementById('newMessageForm');
        if (!form) {
            showToast('Form not found', 'error');
            return;
        }

        var formData = new FormData(form);
        
        var category = formData.get('category') || '';
        var subject = formData.get('subject') || '';
        var message = formData.get('message') || '';
        var applyRole = formData.get('applyRole') || 'student';
        var workLink = formData.get('workLink') || '';

        if (!category) {
            showToast('Please select a category', 'error');
            return;
        }

        if (!subject || subject.length === 0) {
            showToast('Please enter a subject', 'error');
            document.getElementById('messageSubject').focus();
            return;
        }

        if (!message || message.length === 0) {
            showToast('Please enter a message', 'error');
            document.getElementById('messageBody').focus();
            return;
        }

        var btn = document.getElementById('sendMessageBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        window._tempMessageData = {
            category: category,
            subject: subject,
            message: message,
            applyRole: applyRole,
            workLink: workLink
        };

        var success = await submitNewMessage(dashboard);
        
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';

        if (success) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            form.reset();
            document.getElementById('messageFilePreview').style.display = 'none';
            document.getElementById('roleSelectGroup').style.display = 'none';
            document.getElementById('workLinkGroup').style.display = 'none';
            window._messageFileData = null;
            document.getElementById('messageFileInput').value = '';
            window._tempMessageData = null;
        }
    });
}

// ============================================
// SUBMIT NEW MESSAGE
// ============================================
export async function submitNewMessage(dashboard) {
    var data = window._tempMessageData;
    if (!data) {
        showToast('No message data found', 'error');
        return false;
    }

    var { category, subject, message, applyRole, workLink } = data;
    var file = window._messageFileData;

    try {
        var userId = dashboard.currentUser.id;
        var profile = dashboard.currentProfile;

        var fileUrl = null;
        var fileName = null;

        if (file) {
            var uploaded = await uploadMessageFile(file);
            if (uploaded) {
                fileUrl = uploaded.url;
                fileName = uploaded.name;
            }
        }

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
                    .update({
                        application_status: 'pending',
                        applied_role: applyRole || 'student'
                    })
                    .eq('id', userId);
                break;

            case 'inquire':
                tableName = 'inquiries';
                insertData = {
                    id: generateId(),
                    user_id: userId,
                    subject: subject,
                    message: message,
                    file_url: fileUrl,
                    file_name: fileName,
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
                    file_url: fileUrl,
                    file_name: fileName,
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
                    file_url: fileUrl,
                    file_name: fileName,
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
                    file_url: fileUrl,
                    file_name: fileName,
                    status: 'pending',
                    created_at: new Date().toISOString()
                };
                break;

            default:
                showToast('Invalid category selected', 'error');
                return false;
        }

        var { error } = await supabase
            .from(tableName)
            .insert([insertData]);

        if (error) {
            console.error('Error sending message:', error);
            showToast('Failed to send message: ' + error.message, 'error');
            return false;
        }

        showToast('✅ Message sent successfully!', 'success');
        await loadMessages(dashboard.container, dashboard);

        window._messageFileData = null;
        window._tempMessageData = null;

        return true;

    } catch (error) {
        console.error('Error submitting message:', error);
        showToast('Failed to send message: ' + error.message, 'error');
        return false;
    }
}

// ============================================
// UPLOAD MESSAGE FILE
// ============================================
export async function uploadMessageFile(file) {
    if (!file) return null;

    var fileExt = file.name.split('.').pop();
    var timestamp = Date.now();
    var randomStr = Math.random().toString(36).substring(2, 8);
    var fileName = timestamp + '_' + randomStr + '.' + fileExt;
    var path = 'message_attachments/' + fileName;

    try {
        var { data, error } = await supabase.storage
            .from('hub_content')
            .upload(path, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type || 'application/octet-stream'
            });

        if (error) {
            console.error('Upload error:', error);
            showToast('File upload failed: ' + error.message, 'error');
            return null;
        }

        var { data: urlData } = supabase.storage
            .from('hub_content')
            .getPublicUrl(path);

        return {
            url: urlData.publicUrl,
            name: file.name
        };

    } catch (error) {
        console.error('Upload error:', error);
        showToast('File upload failed', 'error');
        return null;
    }
}

// ============================================
// SUBSCRIBE TO MESSAGES
// ============================================
export function subscribeToMessages(dashboard) {
    if (dashboard._messageSubscription) {
        dashboard._messageSubscription.unsubscribe();
    }

    var userId = dashboard.currentUser.id;
    var tables = ['applications', 'inquiries', 'contracts', 'submissions', 'jobs'];
    
    tables.forEach(function(table) {
        var channel = supabase
            .channel(table + '_changes_' + userId)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: table,
                    filter: 'user_id=eq.' + userId
                },
                function() {
                    loadMessages(dashboard.container, dashboard);
                }
            )
            .subscribe();
    });
}
