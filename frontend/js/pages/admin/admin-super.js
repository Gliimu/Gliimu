// ============================================
// SUPER ADMIN DASHBOARD
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
    loadAdminLogs,
    searchUsers,
    escapeHtml,
    renderRecentPayments
} from './admin-shared.js';

// ============================================
// OVERVIEW
// ============================================
export async function renderOverview(container) {
    if (!container) return;
    
    const [payments, users, inquiries, submissions] = await Promise.all([
        loadPayments(),
        loadAllUsers(),
        loadInquiries(),
        loadAllSubmissions()
    ]);
    
    const pendingPayments = payments.filter(p => p.status === 'pending');
    const approvedPayments = payments.filter(p => p.status === 'approved');
    const totalRevenue = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
    const pendingInquiries = inquiries.filter(i => i.status === 'pending');
    const pendingSubmissions = submissions.filter(s => s.status === 'pending');
    
    container.innerHTML = `
        <div class="dashboard-overview">
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-users"></i></div>
                    <div class="stat-info"><h3>Total Users</h3><div class="stat-value">${users.length}</div></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-clock"></i></div>
                    <div class="stat-info"><h3>Pending Payments</h3><div class="stat-value">${pendingPayments.length}</div></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-question-circle"></i></div>
                    <div class="stat-info"><h3>Pending Inquiries</h3><div class="stat-value">${pendingInquiries.length}</div></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-briefcase"></i></div>
                    <div class="stat-info"><h3>Pending Submissions</h3><div class="stat-value">${pendingSubmissions.length}</div></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                    <div class="stat-info"><h3>Approved Payments</h3><div class="stat-value">${approvedPayments.length}</div></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
                    <div class="stat-info"><h3>Total Revenue</h3><div class="stat-value">₦${totalRevenue.toLocaleString()}</div></div>
                </div>
            </div>
            <div class="recent-section">
                <h3>Recent Payments</h3>
                <div class="recent-payments">${renderRecentPayments(payments.slice(0, 5))}</div>
            </div>
        </div>
    `;
}

// ============================================
// UPDATE WEBSITE
// ============================================
export async function renderUpdate(container) {
    if (!container) return;
    
    // This would contain the library/FAQ/Index management
    // (Can be shared with CRM too)
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-pen"></i> Update Website</h2>
            <p>Manage all website content</p>
        </div>
        <div class="empty-state"><i class="fas fa-book"></i><p>Content management coming soon</p></div>
    `;
}

// ============================================
// INQUIRIES
// ============================================
export async function renderInquiries(container) {
    const inquiries = await loadInquiries();
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-question-circle"></i> Inquiries</h2>
            <p>Manage user inquiries</p>
        </div>
        <div class="inquiries-stats">
            <div class="stat-chip"><span class="stat-value">${inquiries.filter(i => i.status === 'pending').length}</span> Pending</div>
            <div class="stat-chip"><span class="stat-value">${inquiries.filter(i => i.status === 'replied').length}</span> Replied</div>
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
                        <div class="inquiry-body"><p>${escapeHtml(i.message)}</p></div>
                        <div class="inquiry-meta">
                            <span class="inquiry-status ${i.status}">${i.status.toUpperCase()}</span>
                        </div>
                        ${i.status === 'pending' ? `
                            <div class="inquiry-actions">
                                <button class="btn-primary reply-inquiry" data-id="${i.id}"><i class="fas fa-reply"></i> Reply</button>
                            </div>
                        ` : ''}
                    </div>
                `).join('')
            }
        </div>
    `;
}

// ============================================
// SUBMISSIONS (Info tab)
// ============================================
export async function renderSubmissions(container) {
    const [applications, contracts, jobs, submissions] = await Promise.all([
        loadApplications(),
        loadContracts(),
        loadJobs(),
        loadAllSubmissions()
    ]);
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-briefcase"></i> Info Center</h2>
            <p>Manage applications, contracts, jobs and submissions</p>
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

function renderApplicationsList(apps) {
    if (!apps.length) return '<div class="empty-state">No applications</div>';
    return apps.map(app => `
        <div class="info-item ${app.status}">
            <div class="info-header">
                <span class="info-subject"><strong>${escapeHtml(app.full_name)}</strong> - ${app.role}</span>
                <span class="info-date">${new Date(app.submitted_at).toLocaleString()}</span>
            </div>
            <div class="info-meta"><span class="info-status ${app.status}">${app.status.toUpperCase()}</span></div>
            ${app.status === 'pending' ? `
                <div class="info-actions">
                    <button class="btn-success approve-application" data-id="${app.id}"><i class="fas fa-check"></i> Approve</button>
                    <button class="btn-danger reject-application" data-id="${app.id}"><i class="fas fa-times"></i> Reject</button>
                </div>
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
    if (!items.length) return '<div class="empty-state">No items</div>';
    return items.map(item => `
        <div class="info-item ${item.status || 'pending'}">
            <div class="info-header">
                <span class="info-subject"><strong>${escapeHtml(item.subject || item.full_name || 'Untitled')}</strong></span>
                <span class="info-date">${new Date(item.created_at || item.submitted_at).toLocaleString()}</span>
            </div>
            <div class="info-meta"><span class="info-status ${item.status || 'pending'}">${(item.status || 'pending').toUpperCase()}</span></div>
        </div>
    `).join('');
}

// ============================================
// ADMIN MANAGEMENT
// ============================================
export async function renderAdminManagement(container) {
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
                <input type="text" id="adminSearchInput" placeholder="Search users..." class="search-input">
                <button id="adminSearchBtn" class="btn-primary"><i class="fas fa-search"></i> Search</button>
            </div>
            <div id="adminSearchResults"></div>
        </div>
        <div class="admin-list-section">
            <h3>Current Admins (${adminUsers.length})</h3>
            <div class="admin-list">
                ${adminUsers.map(u => `
                    <div class="admin-card">
                        <div class="admin-info">
                            <h4>${escapeHtml(u.name || 'Unknown')}</h4>
                            <p>${u.email || 'No email'}</p>
                            <span class="admin-role-badge ${u.role}">${u.role.toUpperCase()}</span>
                        </div>
                        ${u.role !== 'super_admin' ? `
                            <button class="btn-danger remove-admin" data-id="${u.id}"><i class="fas fa-user-minus"></i> Remove</button>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="admin-activity-section">
            <h3>Recent Activity</h3>
            <div class="admin-activity-list">
                ${logs.slice(0, 20).map(log => `
                    <div class="activity-item">
                        <span class="activity-action">${log.action_type}</span>
                        <span class="activity-admin">${log.admin_name || 'Unknown'}</span>
                        <span class="activity-time">${new Date(log.created_at).toLocaleString()}</span>
                    </div>
                `).join('') || '<div class="empty-state">No activity logged</div>'}
            </div>
        </div>
    `;
    
    document.getElementById('adminSearchBtn')?.addEventListener('click', async () => {
        const query = document.getElementById('adminSearchInput').value.trim();
        if (!query) return;
        const results = await searchUsers(query);
        const resultsContainer = document.getElementById('adminSearchResults');
        if (!results.length) {
            resultsContainer.innerHTML = '<div class="empty-state">No users found</div>';
            return;
        }
        resultsContainer.innerHTML = results.map(u => `
            <div class="search-result-item">
                <span>${escapeHtml(u.name)} (${u.email})</span>
                <select class="admin-role-select" data-user-id="${u.id}">
                    <option value="">Make Admin</option>
                    <option value="secretary">Secretary</option>
                    <option value="crm">CRM</option>
                    <option value="manager">Manager</option>
                    <option value="member">Member</option>
                </select>
            </div>
        `).join('');
        document.querySelectorAll('.admin-role-select').forEach(select => {
            select.addEventListener('change', async () => {
                const role = select.value;
                if (!role) return;
                if (confirm(`Make this user a ${role}?`)) {
                    await makeAdmin(select.dataset.userId, role);
                    renderAdminManagement(container);
                }
            });
        });
    });
    
    document.querySelectorAll('.remove-admin').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Remove this admin?')) {
                await removeAdmin(btn.dataset.id);
                renderAdminManagement(container);
            }
        });
    });
}

async function makeAdmin(userId, role) {
    const { error } = await supabase
        .from('user_profiles')
        .update({ role })
        .eq('id', userId);
    if (error) {
        showToast('Error: ' + error.message, 'error');
    } else {
        showToast(`✅ User promoted to ${role}`, 'success');
    }
}

async function removeAdmin(userId) {
    const { error } = await supabase
        .from('user_profiles')
        .update({ role: 'user' })
        .eq('id', userId);
    if (error) {
        showToast('Error: ' + error.message, 'error');
    } else {
        showToast('✅ Admin role removed', 'success');
    }
}

// ============================================
// OTHER TABS (Placeholders)
// ============================================
export async function renderPayments(container) {
    container.innerHTML = `<div class="tab-header"><h2>Payments</h2></div><div class="empty-state">Payment management</div>`;
}

export async function renderUsers(container) {
    container.innerHTML = `<div class="tab-header"><h2>Users</h2></div><div class="empty-state">User management</div>`;
}

export async function renderRecords(container) {
    container.innerHTML = `<div class="tab-header"><h2>Records</h2></div><div class="empty-state">Records management</div>`;
}

export async function renderSales(container) {
    container.innerHTML = `<div class="tab-header"><h2>Sales</h2></div><div class="empty-state">Sales tracking</div>`;
}

export async function renderEvents(container) {
    container.innerHTML = `<div class="tab-header"><h2>Events</h2></div><div class="empty-state">Event management</div>`;
}

export async function renderPartnerships(container) {
    container.innerHTML = `<div class="tab-header"><h2>Partnerships</h2></div><div class="empty-state">Partnership management</div>`;
}
