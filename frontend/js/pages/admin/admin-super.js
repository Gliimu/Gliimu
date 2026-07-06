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
// OVERVIEW - Updated with all metrics
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
                    <h3>New Partnerships</h3>
                    <div class="stat-value">${partnerships.filter(p => p.status === 'active').length}</div>
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
// UPDATE WEBSITE (Placeholder)
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
// INQUIRIES (Placeholder)
// ============================================
export async function renderInquiries(container) {
    if (!container) return;
    const inquiries = await loadInquiries();
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-question-circle"></i> Inquiries</h2>
            <p>Manage user inquiries</p>
        </div>
        <div class="inquiries-stats">
            <div class="stat-chip"><span class="stat-value">${inquiries.filter(i => i.status === 'pending').length}</span> Pending</div>
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
                    </div>
                `).join('')
            }
        </div>
    `;
}

// ============================================
// SUBMISSIONS (Info tab) - Placeholder
// ============================================
export async function renderSubmissions(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-briefcase"></i> Info Center</h2>
            <p>Manage applications, contracts, jobs and submissions</p>
        </div>
        <div class="empty-state"><i class="fas fa-inbox"></i><p>Submissions management coming soon</p></div>
    `;
}

// ============================================
// ADMIN MANAGEMENT (Placeholder)
// ============================================
export async function renderAdminManagement(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-user-shield"></i> Admin Management</h2>
            <p>Manage admin roles and view activity</p>
        </div>
        <div class="empty-state"><i class="fas fa-users-cog"></i><p>Admin management coming soon</p></div>
    `;
}

// ============================================
// OTHER TABS (Placeholders)
// ============================================
export async function renderPayments(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-cash-register"></i> Payments</h2></div>
        <div class="empty-state">Payment management coming soon</div>
    `;
}

export async function renderUsers(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-users"></i> Users</h2></div>
        <div class="empty-state">User management coming soon</div>
    `;
}

export async function renderRecords(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-folder-open"></i> Records</h2></div>
        <div class="empty-state">Records management coming soon</div>
    `;
}

export async function renderSales(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-chart-simple"></i> Sales</h2></div>
        <div class="empty-state">Sales tracking coming soon</div>
    `;
}

export async function renderEvents(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-calendar"></i> Events</h2></div>
        <div class="empty-state">Event management coming soon</div>
    `;
}

export async function renderPartnerships(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-handshake"></i> Partnerships</h2></div>
        <div class="empty-state">Partnership management coming soon</div>
    `;
}
