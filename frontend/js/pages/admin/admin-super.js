// ============================================
// SUPER ADMIN DASHBOARD
// Complete admin dashboard logic
// ============================================

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';
import {
    loadPayments,
    loadAllUsers,
    loadInquiries,
    loadAllSubmissions,
    loadApplications,
    loadContracts,
    loadJobs,
    loadRecords,
    loadPartnerships,
    loadHubContent,
    loadAdminLogs,
    searchUsers,
    escapeHtml,
    renderRecentPayments,
    renderLeaderboardItems,
    getAdminLeaderboard
} from './admin-shared.js';

// ============================================
// OVERVIEW - Complete dashboard
// ============================================
export async function renderOverview(container) {
    if (!container) return;
    
    // Load all data in parallel
    const [payments, users, inquiries, submissions, applications, contracts, jobs, partnerships, hubContent] = await Promise.all([
        loadPayments(),
        loadAllUsers(),
        loadInquiries(),
        loadAllSubmissions(),
        loadApplications(),
        loadContracts(),
        loadJobs(),
        loadPartnerships(),
        loadHubContent()
    ]);
    
    // Calculate stats
    const pendingPayments = payments.filter(p => p.status === 'pending');
    const approvedPayments = payments.filter(p => p.status === 'approved');
    const totalRevenue = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
    
    const pendingInquiries = inquiries.filter(i => i.status === 'pending');
    const pendingSubmissions = submissions.filter(s => s.status === 'pending');
    const pendingApplications = applications.filter(a => a.status === 'pending');
    const pendingContracts = contracts.filter(c => c.status === 'pending');
    const pendingJobs = jobs.filter(j => j.status === 'pending');
    
    const totalPending = pendingApplications.length + pendingContracts.length + pendingJobs.length;
    const newPosts = hubContent.filter(c => {
        const daysAgo = (Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24);
        return daysAgo <= 7 && c.is_active !== false;
    });
    
    // Get top performers for leaderboard
    const leaderboardData = await getAdminLeaderboard();
    const activePartnerships = partnerships?.filter(p => p.status === 'active') || [];
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-tachometer-alt"></i> Overview</h2>
            <p>Real-time dashboard metrics and insights</p>
        </div>
        
        <!-- Stats Grid -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(251, 176, 64, 0.15); color: var(--brand-gold);">
                    <i class="fas fa-users"></i>
                </div>
                <div class="stat-info">
                    <h3>Total Users</h3>
                    <div class="stat-value">${users.length}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">
                    <i class="fas fa-clock"></i>
                </div>
                <div class="stat-info">
                    <h3>Pending Applications</h3>
                    <div class="stat-value">${pendingApplications.length}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">
                    <i class="fas fa-wallet"></i>
                </div>
                <div class="stat-info">
                    <h3>Pending Payments</h3>
                    <div class="stat-value">${pendingPayments.length}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">
                    <i class="fas fa-question-circle"></i>
                </div>
                <div class="stat-info">
                    <h3>Pending Inquiries</h3>
                    <div class="stat-value">${pendingInquiries.length}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;">
                    <i class="fas fa-briefcase"></i>
                </div>
                <div class="stat-info">
                    <h3>Pending Submissions</h3>
                    <div class="stat-value">${pendingSubmissions.length}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;">
                    <i class="fas fa-file-contract"></i>
                </div>
                <div class="stat-info">
                    <h3>Pending Requests</h3>
                    <div class="stat-value">${totalPending}</div>
                </div>
            </div>
        </div>
        
        <!-- Second Row: Revenue & Activity -->
        <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));">
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">
                    <i class="fas fa-check-circle"></i>
                </div>
                <div class="stat-info">
                    <h3>Approved Payments</h3>
                    <div class="stat-value">${approvedPayments.length}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(251, 176, 64, 0.15); color: var(--brand-gold);">
                    <i class="fas fa-chart-line"></i>
                </div>
                <div class="stat-info">
                    <h3>Total Revenue</h3>
                    <div class="stat-value">₦${totalRevenue.toLocaleString()}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">
                    <i class="fas fa-handshake"></i>
                </div>
                <div class="stat-info">
                    <h3>Active Partnerships</h3>
                    <div class="stat-value">${activePartnerships.length}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;">
                    <i class="fas fa-newspaper"></i>
                </div>
                <div class="stat-info">
                    <h3>New Hub Posts (7d)</h3>
                    <div class="stat-value">${newPosts.length}</div>
                </div>
            </div>
        </div>
        
        <!-- Recent Activity Section -->
        <div class="recent-activity-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
            <!-- Recent Payments -->
            <div class="card">
                <h3><i class="fas fa-wallet" style="color: var(--brand-gold);"></i> Recent Payments</h3>
                <div class="recent-payments">${renderRecentPayments(payments.slice(0, 5))}</div>
            </div>
            
            <!-- Leaderboard -->
            <div class="card">
                <h3><i class="fas fa-trophy" style="color: var(--brand-gold);"></i> Top Performers</h3>
                <div class="leaderboard-list">
                    ${renderLeaderboardItems(leaderboardData)}
                </div>
            </div>
        </div>
        
        <!-- Recent Applications -->
        <div class="card" style="margin-top: 20px;">
            <h3><i class="fas fa-user-plus" style="color: var(--brand-gold);"></i> Recent Applications</h3>
            <div class="recent-applications">
                ${applications.slice(0, 5).map(app => `
                    <div class="application-item">
                        <div class="app-info">
                            <span class="app-name">${escapeHtml(app.full_name)}</span>
                            <span class="app-role">→ ${app.role}</span>
                            <span class="app-date">${new Date(app.submitted_at).toLocaleDateString()}</span>
                        </div>
                        <span class="app-status ${app.status}">${app.status}</span>
                    </div>
                `).join('') || '<div class="empty-state">No applications yet</div>'}
            </div>
        </div>
    `;
}

// ============================================
// UPDATE WEBSITE
// ============================================
export async function renderUpdate(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-pen"></i> Update Website</h2>
            <p>Manage all website content</p>
        </div>
        <div class="empty-state"><i class="fas fa-book"></i><p>Content management coming soon</p></div>
    `;
}

// ============================================
// INQUIRIES (CRM Role)
// ============================================
export async function renderInquiries(container) {
    if (!container) return;
    const inquiries = await loadInquiries();
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-question-circle"></i> Inquiries</h2>
            <p>Manage user inquiries and questions</p>
        </div>
        <div class="inquiries-stats">
            <div class="stat-chip"><span class="stat-value">${inquiries.filter(i => i.status === 'pending').length}</span> Pending</div>
            <div class="stat-chip"><span class="stat-value">${inquiries.filter(i => i.status === 'replied').length}</span> Replied</div>
            <div class="stat-chip"><span class="stat-value">${inquiries.filter(i => i.status === 'closed').length}</span> Closed</div>
            <div class="stat-chip"><span class="stat-value">${inquiries.length}</span> Total</div>
        </div>
        <div class="inquiries-list">
            ${inquiries.length === 0 ? '<div class="empty-state">No inquiries</div>' :
                inquiries.map(i => `
                    <div class="inquiry-item ${i.status}">
                        <div class="inquiry-header">
                            <span class="inquiry-subject"><strong>${escapeHtml(i.subject)}</strong></span>
                            <span class="inquiry-date">${new Date(i.created_at).toLocaleString()}</span>
                        </div>
                        <div class="inquiry-body">
                            <p>${escapeHtml(i.message)}</p>
                            ${i.file_url ? `<a href="${i.file_url}" target="_blank" class="inquiry-file"><i class="fas fa-paperclip"></i> ${i.file_name || 'Attachment'}</a>` : ''}
                        </div>
                        <div class="inquiry-meta">
                            <span class="inquiry-user">From: ${i.user_name || 'User'}</span>
                            <span class="inquiry-status ${i.status}">${i.status.toUpperCase()}</span>
                        </div>
                        ${i.admin_response ? `
                            <div class="inquiry-response">
                                <strong>Admin Response:</strong> ${escapeHtml(i.admin_response)}
                                <span class="response-date">${new Date(i.replied_at).toLocaleString()}</span>
                            </div>
                        ` : ''}
                        ${i.status === 'pending' ? `
                            <div class="inquiry-actions">
                                <button class="btn-primary reply-inquiry" data-id="${i.id}"><i class="fas fa-reply"></i> Reply</button>
                            </div>
                        ` : i.status === 'replied' ? `
                            <div class="inquiry-actions">
                                <button class="btn-outline reply-inquiry" data-id="${i.id}"><i class="fas fa-reply"></i> Reply Again</button>
                                <button class="btn-outline close-inquiry" data-id="${i.id}"><i class="fas fa-check"></i> Close</button>
                            </div>
                        ` : ''}
                    </div>
                `).join('')
            }
        </div>
    `;
    
    document.querySelectorAll('.reply-inquiry').forEach(btn => {
        btn.addEventListener('click', () => openReplyModal('inquiry', btn.dataset.id));
    });
    
    document.querySelectorAll('.close-inquiry').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Close this inquiry?')) {
                await closeInquiry(btn.dataset.id);
                renderInquiries(container);
            }
        });
    });
}

// ============================================
// SUBMISSIONS (Info tab - Manager Role)
// ============================================
export async function renderSubmissions(container) {
    if (!container) return;
    
    const [applications, contracts, jobs, submissions] = await Promise.all([
        loadApplications(),
        loadContracts(),
        loadJobs(),
        loadAllSubmissions()
    ]);
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-briefcase"></i> Info Center</h2>
            <p>Manage applications, contracts, jobs and work submissions</p>
        </div>
        
        <div class="info-tabs">
            <button class="info-tab-btn active" data-info-tab="applications">Applications (${applications.filter(a => a.status === 'pending').length})</button>
            <button class="info-tab-btn" data-info-tab="contracts">Contracts (${contracts.filter(c => c.status === 'pending').length})</button>
            <button class="info-tab-btn" data-info-tab="jobs">Jobs (${jobs.filter(j => j.status === 'pending').length})</button>
            <button class="info-tab-btn" data-info-tab="submissions">Submissions (${submissions.filter(s => s.status === 'pending').length})</button>
        </div>
        
        <div id="info-content">
            ${renderApplicationsList(applications)}
        </div>
    `;
    
    document.querySelectorAll('.info-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.info-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.infoTab;
            const content = document.getElementById('info-content');
            const data = { applications, contracts, jobs, submissions };
            content.innerHTML = renderInfoTab(tab, data);
        });
    });
}

// ============================================
// RENDER FUNCTIONS FOR INFO TABS
// ============================================
function renderApplicationsList(applications) {
    if (!applications || applications.length === 0) {
        return '<div class="empty-state"><i class="fas fa-inbox"></i><p>No applications</p></div>';
    }
    
    return applications.map(app => `
        <div class="info-item ${app.status}">
            <div class="info-header">
                <span class="info-subject"><strong>${escapeHtml(app.full_name)}</strong> - ${app.role}</span>
                <span class="info-date">${new Date(app.submitted_at).toLocaleString()}</span>
            </div>
            <div class="info-body">
                <p>Email: ${app.email}</p>
                <p>Username: ${app.username}</p>
            </div>
            <div class="info-meta">
                <span class="info-status ${app.status}">${app.status.toUpperCase()}</span>
            </div>
            ${app.status === 'pending' ? `
                <div class="info-actions">
                    <button class="btn-success approve-application" data-id="${app.id}" data-user="${app.user_id}" data-role="${app.role}">
                        <i class="fas fa-check"></i> Approve
                    </button>
                    <button class="btn-danger reject-application" data-id="${app.id}" data-user="${app.user_id}">
                        <i class="fas fa-times"></i> Reject
                    </button>
                </div>
            ` : app.status === 'approved' ? `
                <span class="approved-label"><i class="fas fa-check-circle"></i> Approved</span>
            ` : `
                <span class="rejected-label"><i class="fas fa-ban"></i> Rejected</span>
            `}
        </div>
    `).join('');
}

function renderContractsList(contracts) {
    if (!contracts || contracts.length === 0) {
        return '<div class="empty-state"><i class="fas fa-inbox"></i><p>No contracts</p></div>';
    }
    
    return contracts.map(contract => `
        <div class="info-item ${contract.status}">
            <div class="info-header">
                <span class="info-subject"><strong>${escapeHtml(contract.subject)}</strong></span>
                <span class="info-date">${new Date(contract.created_at).toLocaleString()}</span>
            </div>
            <div class="info-body">
                <p>${escapeHtml(contract.message)}</p>
                ${contract.contract_type ? `<p>Type: ${contract.contract_type}</p>` : ''}
                ${contract.file_url ? `<a href="${contract.file_url}" target="_blank"><i class="fas fa-paperclip"></i> ${contract.file_name || 'Attachment'}</a>` : ''}
            </div>
            <div class="info-meta">
                <span class="info-status ${contract.status}">${contract.status.toUpperCase()}</span>
            </div>
            ${contract.status === 'pending' ? `
                <div class="info-actions">
                    <button class="btn-primary reply-contract" data-id="${contract.id}"><i class="fas fa-reply"></i> Reply</button>
                </div>
            ` : contract.admin_response ? `
                <div class="admin-response-mini">
                    <strong>Response:</strong> ${escapeHtml(contract.admin_response)}
                </div>
            ` : ''}
        </div>
    `).join('');
}

function renderJobsList(jobs) {
    if (!jobs || jobs.length === 0) {
        return '<div class="empty-state"><i class="fas fa-inbox"></i><p>No job requests</p></div>';
    }
    
    return jobs.map(job => `
        <div class="info-item ${job.status}">
            <div class="info-header">
                <span class="info-subject"><strong>${escapeHtml(job.subject)}</strong></span>
                <span class="info-date">${new Date(job.created_at).toLocaleString()}</span>
            </div>
            <div class="info-body">
                <p>${escapeHtml(job.message)}</p>
                ${job.job_title ? `<p>Job Title: ${job.job_title}</p>` : ''}
                ${job.job_type ? `<p>Type: ${job.job_type}</p>` : ''}
                ${job.file_url ? `<a href="${job.file_url}" target="_blank"><i class="fas fa-paperclip"></i> ${job.file_name || 'Attachment'}</a>` : ''}
            </div>
            <div class="info-meta">
                <span class="info-status ${job.status}">${job.status.toUpperCase()}</span>
            </div>
            ${job.status === 'pending' ? `
                <div class="info-actions">
                    <button class="btn-primary reply-job" data-id="${job.id}"><i class="fas fa-reply"></i> Reply</button>
                </div>
            ` : job.admin_response ? `
                <div class="admin-response-mini">
                    <strong>Response:</strong> ${escapeHtml(job.admin_response)}
                </div>
            ` : ''}
        </div>
    `).join('');
}

function renderSubmissionsList(submissions) {
    if (!submissions || submissions.length === 0) {
        return '<div class="empty-state"><i class="fas fa-inbox"></i><p>No work submissions</p></div>';
    }
    
    return submissions.map(sub => `
        <div class="info-item ${sub.status}">
            <div class="info-header">
                <span class="info-subject"><strong>${escapeHtml(sub.subject)}</strong></span>
                <span class="info-date">${new Date(sub.created_at).toLocaleString()}</span>
            </div>
            <div class="info-body">
                <p>${escapeHtml(sub.message)}</p>
                ${sub.gliimu_link ? `<p>🔗 <a href="${sub.gliimu_link}" target="_blank">${sub.gliimu_link}</a></p>` : ''}
                ${sub.file_url ? `<a href="${sub.file_url}" target="_blank"><i class="fas fa-paperclip"></i> ${sub.file_name || 'Attachment'}</a>` : ''}
            </div>
            <div class="info-meta">
                <span class="info-status ${sub.status}">${sub.status.toUpperCase()}</span>
                ${sub.destination ? `<span class="info-destination">→ ${sub.destination}</span>` : ''}
            </div>
            ${sub.status === 'pending' ? `
                <div class="info-actions">
                    <button class="btn-success approve-submission" data-id="${sub.id}"><i class="fas fa-check"></i> Approve</button>
                    <button class="btn-danger reject-submission" data-id="${sub.id}"><i class="fas fa-times"></i> Reject</button>
                </div>
            ` : sub.status === 'approved' ? `
                <span class="approved-label"><i class="fas fa-check-circle"></i> Approved</span>
            ` : ''}
        </div>
    `).join('');
}

function renderInfoTab(tab, data) {
    const map = {
        applications: data.applications,
        contracts: data.contracts,
        jobs: data.jobs,
        submissions: data.submissions
    };
    const items = map[tab] || [];
    const renderers = {
        applications: renderApplicationsList,
        contracts: renderContractsList,
        jobs: renderJobsList,
        submissions: renderSubmissionsList
    };
    return renderers[tab] ? renderers[tab](items) : '<div class="empty-state">No items</div>';
}

// ============================================
// ADMIN MANAGEMENT (Super Admin only)
// ============================================
export async function renderAdminManagement(container) {
    if (!container) return;
    
    const users = await loadAllUsers();
    const adminUsers = users.filter(u => 
        ['super_admin', 'crm', 'manager', 'member', 'secretary'].includes(u.role)
    );
    const logs = await loadAdminLogs();
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-user-shield"></i> Admin Management</h2>
            <p>Manage admin roles and view activity</p>
        </div>
        
        <div class="admin-search-section">
            <div class="search-box">
                <input type="text" id="adminSearchInput" placeholder="Search users by name or email..." class="search-input">
                <button id="adminSearchBtn" class="btn-primary"><i class="fas fa-search"></i> Search</button>
            </div>
            <div id="adminSearchResults"></div>
        </div>
        
        <div class="admin-list-section">
            <h3>Current Admins (${adminUsers.length})</h3>
            <div class="admin-list">
                ${adminUsers.map(user => `
                    <div class="admin-card">
                        <div class="admin-avatar">
                            <img src="${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=fbb040&color=fff`}" alt="">
                        </div>
                        <div class="admin-info">
                            <h4>${escapeHtml(user.name || 'Unknown')}</h4>
                            <p>${user.email || 'No email'}</p>
                            <span class="admin-role-badge ${user.role}">${user.role.toUpperCase()}</span>
                        </div>
                        <div class="admin-actions">
                            <button class="btn-outline view-admin-activity" data-id="${user.id}"><i class="fas fa-history"></i></button>
                            <button class="btn-outline view-admin-portfolio" data-id="${user.id}"><i class="fas fa-user-circle"></i></button>
                            ${user.role !== 'super_admin' ? `
                                <button class="btn-danger remove-admin" data-id="${user.id}"><i class="fas fa-user-minus"></i> Remove</button>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="admin-activity-section">
            <h3>Recent Admin Activity</h3>
            <div class="admin-activity-list">
                ${logs.slice(0, 20).map(log => `
                    <div class="activity-item">
                        <span class="activity-action">${log.action_type}</span>
                        <span class="activity-target">${log.target_type || 'N/A'}</span>
                        <span class="activity-admin">${log.admin_name || 'Unknown'}</span>
                        <span class="activity-time">${new Date(log.created_at).toLocaleString()}</span>
                    </div>
                `).join('') || '<div class="empty-state">No admin activity logged yet</div>'}
            </div>
        </div>
    `;
    
    document.getElementById('adminSearchBtn')?.addEventListener('click', async () => {
        const query = document.getElementById('adminSearchInput').value.trim();
        if (!query) return;
        
        const results = await searchUsers(query);
        const resultsContainer = document.getElementById('adminSearchResults');
        
        if (results.length === 0) {
            resultsContainer.innerHTML = '<div class="empty-state">No users found</div>';
            return;
        }
        
        resultsContainer.innerHTML = results.map(user => `
            <div class="search-result-item">
                <span>${escapeHtml(user.name)} (${user.email})</span>
                <span class="user-role-badge">${user.role || 'user'}</span>
                <div class="search-result-actions">
                    <select class="admin-role-select" data-user-id="${user.id}">
                        <option value="">Make Admin</option>
                        <option value="secretary">Secretary</option>
                        <option value="crm">CRM</option>
                        <option value="manager">Manager</option>
                        <option value="member">Member</option>
                    </select>
                </div>
            </div>
        `).join('');
        
        document.querySelectorAll('.admin-role-select').forEach(select => {
            select.addEventListener('change', async () => {
                const userId = select.dataset.userId;
                const role = select.value;
                if (!role) return;
                if (confirm(`Make this user a ${role}?`)) {
                    await makeAdmin(userId, role);
                    renderAdminManagement(container);
                }
            });
        });
    });
    
    document.querySelectorAll('.view-admin-activity').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = btn.dataset.id;
            showAdminActivity(userId);
        });
    });
    
    document.querySelectorAll('.view-admin-portfolio').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = btn.dataset.id;
            window.open(`/u/${userId}`, '_blank');
        });
    });
    
    document.querySelectorAll('.remove-admin').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.dataset.id;
            if (confirm('Remove this user from admin role?')) {
                await removeAdmin(userId);
                renderAdminManagement(container);
            }
        });
    });
}

// ============================================
// PAYMENTS (Secretary Role)
// ============================================
export async function renderPayments(container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-cash-register"></i> Payments</h2>
            <p>Manage user payments</p>
        </div>
        <div class="empty-state"><i class="fas fa-wallet"></i><p>Payment management coming soon</p></div>
    `;
}

// ============================================
// USERS
// ============================================
export async function renderUsers(container) {
    if (!container) return;
    
    const users = await loadAllUsers();
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-users"></i> Users</h2>
            <button id="exportUsersBtn" class="btn-outline"><i class="fas fa-download"></i> Export CSV</button>
        </div>
        <div class="users-list">
            <div class="table-responsive">
                <table class="users-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Wallet Balance</th>
                            <th>GP Points</th>
                            <th>Joined</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(u => `
                            <tr>
                                <td><strong>${escapeHtml(u.name || 'Unknown')}</strong></td>
                                <td>${escapeHtml(u.email || 'No email')}</td>
                                <td><span class="role-badge ${u.role || 'user'}">${u.role || 'user'}</span></td>
                                <td>₦${(u.wallet_balance || 0).toLocaleString()}</td>
                                <td>${(u.gp_points || 0).toLocaleString()}</td>
                                <td>${u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    document.getElementById('exportUsersBtn')?.addEventListener('click', () => {
        let csv = "Name,Email,Role,Wallet Balance,GP Points,Joined\n";
        users.forEach(u => {
            csv += `"${u.name || ''}","${u.email || ''}","${u.role || 'user'}","${u.wallet_balance || 0}","${u.gp_points || 0}","${u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}"\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Users exported successfully!', 'success');
    });
}

// ============================================
// RECORDS
// ============================================
export async function renderRecords(container) {
    if (!container) return;
    
    const records = await loadRecords();
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-folder-open"></i> Records</h2>
            <button id="addRecordBtn" class="btn-primary"><i class="fas fa-plus"></i> Add Record</button>
        </div>
        <div class="records-stats">
            <div class="stat-chip"><span class="stat-value">${records.filter(r => r.type === 'minutes').length}</span> Minutes</div>
            <div class="stat-chip"><span class="stat-value">${records.filter(r => r.type === 'agreement').length}</span> Agreements</div>
            <div class="stat-chip"><span class="stat-value">${records.filter(r => r.type === 'curriculum').length}</span> Curriculums</div>
            <div class="stat-chip"><span class="stat-value">${records.length}</span> Total</div>
        </div>
        <div class="records-grid">
            ${records.length === 0 ? '<div class="empty-state">No records yet</div>' :
                records.map(record => `
                    <div class="record-card">
                        <div class="record-header">
                            <span class="record-type">${record.type}</span>
                            <span class="record-date">${new Date(record.created_at).toLocaleDateString()}</span>
                        </div>
                        <h4>${escapeHtml(record.title)}</h4>
                        ${record.content ? `<p>${escapeHtml(record.content.substring(0, 150))}${record.content.length > 150 ? '...' : ''}</p>` : ''}
                        ${record.file_url ? `<a href="${record.file_url}" target="_blank" class="record-file"><i class="fas fa-paperclip"></i> ${record.file_name || 'Attachment'}</a>` : ''}
                        <div class="record-actions">
                            <button class="btn-outline edit-record" data-id="${record.id}"><i class="fas fa-edit"></i></button>
                            <button class="btn-danger delete-record" data-id="${record.id}"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                `).join('')
            }
        </div>
    `;
}

// ============================================
// SALES
// ============================================
export async function renderSales(container) {
    if (!container) return;
    
    const payments = await loadPayments();
    const approvedPayments = payments.filter(p => p.status === 'approved');
    const totalRevenue = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-chart-simple"></i> Sales</h2>
            <p>Track all sales and revenue</p>
        </div>
        <div class="sales-stats">
            <div class="finance-card"><h4>Total Revenue</h4><div class="amount">₦${totalRevenue.toLocaleString()}</div></div>
            <div class="finance-card"><h4>Total Transactions</h4><div class="amount">${approvedPayments.length}</div></div>
        </div>
        <div class="sales-list">
            ${approvedPayments.slice(0, 20).map(p => `
                <div class="sales-item">
                    <span>${p.user_name || p.user_email}</span>
                    <span>₦${p.amount.toLocaleString()}</span>
                    <span>${new Date(p.approved_at || p.submitted_at).toLocaleDateString()}</span>
                </div>
            `).join('') || '<div class="empty-state">No sales yet</div>'}
        </div>
    `;
}

// ============================================
// EVENTS
// ============================================
export async function renderEvents(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-calendar"></i> Events</h2>
            <button id="addEventBtn" class="btn-primary"><i class="fas fa-plus"></i> Create Event</button>
        </div>
        <div class="empty-state"><i class="fas fa-calendar-plus"></i><p>Event management coming soon</p></div>
    `;
}

// ============================================
// PARTNERSHIPS
// ============================================
export async function renderPartnerships(container) {
    if (!container) return;
    
    const partnerships = await loadPartnerships();
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-handshake"></i> Partnerships</h2>
            <button id="addPartnershipBtn" class="btn-primary"><i class="fas fa-plus"></i> New Partnership</button>
        </div>
        <div class="partnerships-list">
            ${partnerships.length === 0 ? '<div class="empty-state"><i class="fas fa-handshake"></i><p>No partnerships yet</p></div>' :
                partnerships.map(p => `
                    <div class="partnership-card">
                        <h4>${escapeHtml(p.name)}</h4>
                        <p>${escapeHtml(p.description || '')}</p>
                        <span class="partnership-status ${p.status || 'active'}">${p.status || 'active'}</span>
                        ${p.website ? `<a href="${p.website}" target="_blank" class="partnership-link"><i class="fas fa-external-link-alt"></i> Visit</a>` : ''}
                    </div>
                `).join('')
            }
        </div>
    `;
}

// ============================================
// HELPER FUNCTIONS FOR ACTIONS
// ============================================

// ============================================
// APPROVE APPLICATION
// ============================================
export async function approveApplication(applicationId, userId, role) {
    try {
        // Update application status
        const { error: appError } = await supabase
            .from('applications')
            .update({ 
                status: 'approved', 
                approved_at: new Date().toISOString(),
                reviewed_by: (await supabase.auth.getUser()).data.user?.id
            })
            .eq('id', applicationId);
        
        if (appError) throw appError;
        
        // Update user role
        const { error: userError } = await supabase
            .from('user_profiles')
            .update({ 
                role: role,
                application_status: 'approved'
            })
            .eq('id', userId);
        
        if (userError) throw userError;
        
        // Create alert for user
        await createUserAlert({
            user_id: userId,
            icon: '🎓',
            message: `Congratulations! Your application to become a ${role} has been approved!`,
            type: 'success'
        });
        
        showToast(`✅ Application approved! User is now a ${role}`, 'success');
        return true;
    } catch (error) {
        console.error('Error approving application:', error);
        showToast('Error approving application: ' + error.message, 'error');
        return false;
    }
}

// ============================================
// REJECT APPLICATION
// ============================================
export async function rejectApplication(applicationId, userId) {
    try {
        const { error: appError } = await supabase
            .from('applications')
            .update({ 
                status: 'rejected', 
                rejected_at: new Date().toISOString(),
                reviewed_by: (await supabase.auth.getUser()).data.user?.id
            })
            .eq('id', applicationId);
        
        if (appError) throw appError;
        
        const { error: userError } = await supabase
            .from('user_profiles')
            .update({ application_status: 'rejected' })
            .eq('id', userId);
        
        if (userError) throw userError;
        
        await createUserAlert({
            user_id: userId,
            icon: '📋',
            message: 'Your application was reviewed. Please check your dashboard for details.',
            type: 'info'
        });
        
        showToast('❌ Application rejected', 'info');
        return true;
    } catch (error) {
        console.error('Error rejecting application:', error);
        showToast('Error rejecting application: ' + error.message, 'error');
        return false;
    }
}

// ============================================
// APPROVE SUBMISSION
// ============================================
export async function approveSubmission(submissionId) {
    try {
        // Show destination selection modal
        const destination = await showDestinationModal();
        if (!destination) return false;
        
        const { error } = await supabase
            .from('submissions')
            .update({ 
                status: 'approved', 
                approved_at: new Date().toISOString(),
                destination: destination,
                approved_by: (await supabase.auth.getUser()).data.user?.id
            })
            .eq('id', submissionId);
        
        if (error) throw error;
        
        showToast(`✅ Submission approved and sent to ${destination}!`, 'success');
        return true;
    } catch (error) {
        console.error('Error approving submission:', error);
        showToast('Error approving submission: ' + error.message, 'error');
        return false;
    }
}

// ============================================
// REJECT SUBMISSION
// ============================================
export async function rejectSubmission(submissionId) {
    try {
        const { error } = await supabase
            .from('submissions')
            .update({ 
                status: 'rejected',
                approved_by: (await supabase.auth.getUser()).data.user?.id
            })
            .eq('id', submissionId);
        
        if (error) throw error;
        
        showToast('❌ Submission rejected', 'info');
        return true;
    } catch (error) {
        console.error('Error rejecting submission:', error);
        showToast('Error rejecting submission: ' + error.message, 'error');
        return false;
    }
}

// ============================================
// CREATE USER ALERT
// ============================================
async function createUserAlert(alertData) {
    try {
        const { error } = await supabase
            .from('user_alerts')
            .insert([{
                user_id: alertData.user_id,
                icon: alertData.icon || '📌',
                message: alertData.message,
                type: alertData.type || 'info',
                read: false,
                created_at: new Date().toISOString()
            }]);
        
        if (error) console.error('Error creating alert:', error);
    } catch (error) {
        console.error('Error creating alert:', error);
    }
}

// ============================================
// SHOW DESTINATION MODAL
// ============================================
function showDestinationModal() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h2>Choose Destination</h2>
                    <button class="modal-close" id="closeDestModal">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 16px;">Where should this submission be displayed?</p>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button class="dest-btn btn-primary" data-dest="merchandise">🛍️ Merchandise</button>
                        <button class="dest-btn btn-primary" data-dest="hub">🏪 Hub</button>
                        <button class="dest-btn btn-primary" data-dest="library">📚 Library</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('closeDestModal')?.addEventListener('click', () => {
            modal.remove();
            resolve(null);
        });
        
        modal.querySelectorAll('.dest-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const dest = btn.dataset.dest;
                modal.remove();
                resolve(dest);
            });
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(null);
            }
        });
    });
}

// ============================================
// OPEN REPLY MODAL
// ============================================
export function openReplyModal(type, id) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2>Reply to ${type}</h2>
                <button class="modal-close" id="closeReplyModal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="replyForm">
                    <div class="form-group">
                        <label>Your Response</label>
                        <textarea id="replyContent" rows="5" required placeholder="Type your response..."></textarea>
                    </div>
                    <button type="submit" class="btn-primary"><i class="fas fa-paper-plane"></i> Send Reply</button>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('closeReplyModal')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    
    document.getElementById('replyForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const response = document.getElementById('replyContent').value.trim();
        if (!response) {
            showToast('Please enter a response', 'error');
            return;
        }
        await sendReply(type, id, response);
        modal.remove();
    });
}

// ============================================
// SEND REPLY
// ============================================
async function sendReply(type, id, response) {
    try {
        const currentUser = (await supabase.auth.getUser()).data.user;
        let table = '';
        let updateData = {};
        
        switch(type) {
            case 'inquiry':
                table = 'inquiries';
                updateData = {
                    admin_response: response,
                    replied_by: currentUser?.id,
                    replied_at: new Date().toISOString(),
                    status: 'replied'
                };
                break;
            case 'contract':
                table = 'contracts';
                updateData = {
                    admin_response: response,
                    reviewed_by: currentUser?.id,
                    reviewed_at: new Date().toISOString(),
                    status: 'reviewed'
                };
                break;
            case 'job':
                table = 'jobs';
                updateData = {
                    admin_response: response,
                    reviewed_by: currentUser?.id,
                    reviewed_at: new Date().toISOString(),
                    status: 'reviewed'
                };
                break;
            default:
                showToast('Unknown type', 'error');
                return;
        }
        
        const { error } = await supabase
            .from(table)
            .update(updateData)
            .eq('id', id);
        
        if (error) throw error;
        
        showToast('✅ Reply sent successfully!', 'success');
        
        // Refresh the current tab
        const container = document.querySelector('.admin-tab.active');
        if (container) {
            const tabId = container.id.replace('-section', '');
            if (tabId === 'inquiries') {
                await renderInquiries(container);
            } else if (tabId === 'submissions') {
                await renderSubmissions(container);
            }
        }
    } catch (error) {
        console.error('Error sending reply:', error);
        showToast('Error: ' + error.message, 'error');
    }
}

// ============================================
// CLOSE INQUIRY
// ============================================
async function closeInquiry(inquiryId) {
    try {
        const { error } = await supabase
            .from('inquiries')
            .update({ status: 'closed' })
            .eq('id', inquiryId);
        
        if (error) throw error;
        showToast('Inquiry closed', 'success');
    } catch (error) {
        console.error('Error closing inquiry:', error);
        showToast('Error: ' + error.message, 'error');
    }
}

// ============================================
// MAKE ADMIN / REMOVE ADMIN
// ============================================
async function makeAdmin(userId, role) {
    try {
        const { error } = await supabase
            .from('user_profiles')
            .update({ role: role })
            .eq('id', userId);
        
        if (error) throw error;
        
        await logAdminActivity('make_admin', 'user_profiles', userId, { role });
        showToast(`✅ User promoted to ${role}`, 'success');
        return true;
    } catch (error) {
        console.error('Error making admin:', error);
        showToast('Error: ' + error.message, 'error');
        return false;
    }
}

async function removeAdmin(userId) {
    try {
        const { error } = await supabase
            .from('user_profiles')
            .update({ role: 'user' })
            .eq('id', userId);
        
        if (error) throw error;
        
        await logAdminActivity('remove_admin', 'user_profiles', userId, {});
        showToast('✅ Admin role removed', 'success');
        return true;
    } catch (error) {
        console.error('Error removing admin:', error);
        showToast('Error: ' + error.message, 'error');
        return false;
    }
}

async function logAdminActivity(actionType, targetType, targetId, details) {
    try {
        const user = await supabase.auth.getUser();
        await supabase
            .from('admin_activity_log')
            .insert([{
                admin_id: user.data.user?.id,
                action_type: actionType,
                target_type: targetType,
                target_id: targetId,
                details: details || {}
            }]);
    } catch (error) {
        console.error('Error logging admin activity:', error);
    }
}

// ============================================
// SHOW ADMIN ACTIVITY
// ============================================
function showAdminActivity(userId) {
    // Simple alert for now - can be expanded to a modal
    showToast('Viewing admin activity - Coming soon!', 'info');
}

// ============================================
// EVENT LISTENERS FOR DYNAMIC BUTTONS
// ============================================
// These are set up in render functions above

// Export all functions for use in admin-role.js
export default {
    renderOverview,
    renderUpdate,
    renderInquiries,
    renderEvents,
    renderPayments,
    renderSales,
    renderRecords,
    renderSubmissions,
    renderUsers,
    renderPartnerships,
    renderAdminManagement,
    approveApplication,
    rejectApplication,
    approveSubmission,
    rejectSubmission,
    openReplyModal
};
