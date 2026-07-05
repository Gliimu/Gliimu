// ============================================
// GLIIMU USER DASHBOARD - GENERAL/PARTNER
// Path: /frontend/js/pages/user-general.js
// Purpose: Handles general user dashboard features
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';
import { getUserTransactions, getReferralCount } from '../modules/supabase.js';
import { 
    getStudentProgress,
    getIndividualLeaderboard,
    convertGPToStars
} from '../modules/progression.js';
import { getBankDetails } from '../modules/settings.js';

export class GeneralDashboard {
    constructor(user, profile) {
        this.currentUser = user;
        this.currentProfile = profile;
        this.alertManager = null;
        this.selectedAmount = 0;
        this.referenceCode = '';
        this.leaderboardData = [];
        this.bankDetails = null;
        
        // DOM references
        this.container = null;
        this.currentTab = 'dashboard';
    }

    // ============================================
    // SET ALERT MANAGER
    // ============================================
    setAlertManager(alertManager) {
        this.alertManager = alertManager;
    }

    // ============================================
    // RENDER DASHBOARD
    // ============================================
    async render(container) {
        this.container = container;
        await this.loadDashboard();
    }

    // ============================================
    // LOAD DASHBOARD (Overview Tab)
    // ============================================
    async loadDashboard() {
        if (!this.container) return;

        const profile = this.currentProfile;
        const user = this.currentUser;
        
        // Get counts
        const submissionsCount = await this.getSubmissionsCount(user.id);
        const referralsCount = await this.getReferralsCount(user.id);
        
        // Get progress data
        const progressData = await getStudentProgress(user.id);
        const progress = progressData?.progress || 0;
        const badge = progressData?.currentBadge || { name: 'Starter', icon: '🌱', color: '#10b981' };
        const currentGP = progressData?.currentGP || 0;
        const totalStars = progressData?.totalStars || 0;

        // Load leaderboard
        await this.loadLeaderboard();

        // Get alerts
        const alerts = this.alertManager?.alerts || [];
        const unreadCount = this.alertManager?.unreadCount || 0;

        this.container.innerHTML = `
            <div class="dashboard-header">
                <div>
                    <h1>Overview</h1>
                    <p>Welcome back, ${profile?.name || 'User'}!</p>
                </div>
                <div class="header-badge" id="headerBadge">
                    <!-- Alert icon rendered here -->
                </div>
            </div>

            <!-- Stats Grid -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon wallet-icon">
                        <i class="fas fa-wallet"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Wallet Balance</h3>
                        <p class="stat-value" id="walletBalance">₦${(profile?.wallet_balance || 0).toLocaleString()}</p>
                    </div>
                    <button class="stat-action-btn" data-action="wallet" title="Add Funds">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                <div class="stat-card">
                    <div class="stat-icon gp-icon">
                        <i class="fas fa-star"></i>
                    </div>
                    <div class="stat-info">
                        <h3>GP Points</h3>
                        <p class="stat-value" id="gpPoints">${currentGP.toLocaleString()}</p>
                    </div>
                    <button class="stat-action-btn" data-action="stars" title="Convert to Stars">
                        <i class="fas fa-exchange-alt"></i>
                    </button>
                </div>
                <div class="stat-card">
                    <div class="stat-icon submissions-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Submissions</h3>
                        <p class="stat-value">${submissionsCount}</p>
                    </div>
                    <button class="stat-action-btn" data-action="submissions" title="View Submissions">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
                <div class="stat-card">
                    <div class="stat-icon referrals-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Referrals</h3>
                        <p class="stat-value">${referralsCount}</p>
                    </div>
                    <button class="stat-action-btn" data-action="referrals" title="Share Referral">
                        <i class="fas fa-share-alt"></i>
                    </button>
                </div>
            </div>

            <!-- Progress Bar -->
            <div class="progress-section">
                <div class="progress-header">
                    <span>Progress to ${progressData?.nextBadge?.name || 'Ambassador'}</span>
                    <span>${Math.round(progress)}%</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${progress}%; background: ${badge.color};"></div>
                </div>
                <div class="progress-stats">
                    <span>⭐ ${totalStars} Stars</span>
                    <span>🎯 ${Math.round(progress)}% Complete</span>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="quick-actions" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px;">
                <button class="action-btn" data-action="role" style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); cursor: pointer; transition: all 0.3s; font-family: inherit; font-size: 0.9rem; font-weight: 500;">
                    <i class="fas fa-user-graduate" style="color: var(--brand-gold);"></i>
                    <span>Apply for Role</span>
                </button>
                <button class="action-btn" data-action="wallet" style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); cursor: pointer; transition: all 0.3s; font-family: inherit; font-size: 0.9rem; font-weight: 500;">
                    <i class="fas fa-plus-circle" style="color: var(--brand-gold);"></i>
                    <span>Fund Wallet</span>
                </button>
                <button class="action-btn" data-action="stars" style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); cursor: pointer; transition: all 0.3s; font-family: inherit; font-size: 0.9rem; font-weight: 500;">
                    <i class="fas fa-star" style="color: var(--brand-gold);"></i>
                    <span>Convert GP to Stars</span>
                </button>
            </div>

            <!-- Leaderboard - Full Width -->
            <div class="card leaderboard-card-full">
                <div class="leaderboard-header">
                    <h3><i class="fas fa-trophy" style="color: #fbb040;"></i> Top Performers</h3>
                    <button id="refreshLeaderboardBtn" class="btn-icon" style="background: none; border: none; cursor: pointer; color: var(--text-secondary);">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
                <div class="leaderboard-list" id="dashboardLeaderboard">
                    ${this.renderLeaderboardItems()}
                </div>
            </div>

            ${profile?.application_status === 'pending' ? `
                <div class="alert alert-warning">
                    <i class="fas fa-clock"></i>
                    Your application for <strong>${profile.applied_role}</strong> is pending review.
                </div>
            ` : ''}
        `;

        // Render alert icon in header
        this.renderAlertIcon(unreadCount, alerts);

        // Bind events
        this.bindEvents();
    }

    // ============================================
    // RENDER ALERT ICON
    // ============================================
    renderAlertIcon(unreadCount, alerts) {
        const headerBadge = document.getElementById('headerBadge');
        if (!headerBadge) return;

        const hasUnread = unreadCount > 0;

        headerBadge.innerHTML = `
            <div class="alert-icon-container" id="alertIconContainer">
                <button class="alert-icon-btn" id="alertIconBtn" aria-label="Alerts">
                    <i class="fas fa-bell"></i>
                    ${hasUnread ? `<span class="alert-dot">${unreadCount > 9 ? '9+' : unreadCount}</span>` : ''}
                </button>
                
                <div class="alert-dropdown" id="alertDropdown">
                    <div class="alert-dropdown-header">
                        <span>Notifications</span>
                        ${hasUnread ? `<button class="alert-mark-read" id="alertMarkRead">Mark all read</button>` : ''}
                    </div>
                    <div class="alert-dropdown-body" id="alertDropdownBody">
                        ${this.renderAlertItems(alerts)}
                    </div>
                </div>
            </div>
        `;

        // Bind dropdown events
        this.bindAlertEvents();
    }

    // ============================================
    // RENDER ALERT ITEMS
    // ============================================
    renderAlertItems(alerts) {
        if (!alerts || alerts.length === 0) {
            return `
                <div class="alert-empty">
                    <i class="fas fa-inbox"></i>
                    <p>No notifications yet</p>
                </div>
            `;
        }

        return alerts.slice(0, 10).map(alert => `
            <div class="alert-item ${alert.read ? 'read' : 'unread'}">
                <div class="alert-icon">${alert.icon || '📌'}</div>
                <div class="alert-content">
                    <p class="alert-message">${alert.message}</p>
                    <span class="alert-time">${this.getTimeAgo(alert.created_at)}</span>
                    ${alert.link ? `<a href="${alert.link}" class="alert-link" target="_blank">Learn more →</a>` : ''}
                </div>
                ${!alert.read ? `<span class="alert-unread-dot"></span>` : ''}
            </div>
        `).join('');
    }

    // ============================================
    // BIND ALERT EVENTS
    // ============================================
    bindAlertEvents() {
        const iconBtn = document.getElementById('alertIconBtn');
        const dropdown = document.getElementById('alertDropdown');
        const markReadBtn = document.getElementById('alertMarkRead');

        if (iconBtn) {
            iconBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleAlertDropdown();
            });
        }

        if (markReadBtn) {
            markReadBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.markAllAlertsRead();
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const container = document.getElementById('alertIconContainer');
            if (container && !container.contains(e.target)) {
                this.closeAlertDropdown();
            }
        });
    }

    // ============================================
    // ALERT DROPDOWN CONTROLS
    // ============================================
    toggleAlertDropdown() {
        const dropdown = document.getElementById('alertDropdown');
        if (dropdown) {
            dropdown.classList.toggle('open');
        }
    }

    closeAlertDropdown() {
        const dropdown = document.getElementById('alertDropdown');
        if (dropdown) {
            dropdown.classList.remove('open');
        }
    }

    async markAllAlertsRead() {
        if (this.alertManager) {
            await this.alertManager.markAllAsRead();
            const unreadCount = await this.alertManager.getUnreadCount();
            const alerts = this.alertManager.alerts || [];
            this.renderAlertIcon(unreadCount, alerts);
            showToast('All notifications marked as read', 'success');
        }
    }

    // ============================================
    // UPDATE ALERT ICON (Called by router)
    // ============================================
    updateAlertIcon(data) {
        const unreadCount = data?.unreadCount || 0;
        const alerts = data?.alerts || [];
        this.renderAlertIcon(unreadCount, alerts);
    }

    // ============================================
    // BIND EVENTS
    // ============================================
    bindEvents() {
        // Stat action buttons
        document.querySelectorAll('.stat-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'wallet') this.showFundWalletModal();
                else if (action === 'stars') this.showConvertStarsModal();
                else if (action === 'submissions') showToast('Submissions view coming soon!', 'info');
                else if (action === 'referrals') {
                    const url = `${window.location.origin}/ref/${this.currentProfile?.referral_code || this.currentUser.id}`;
                    navigator.clipboard.writeText(url).then(() => {
                        showToast('Referral link copied! Share it with friends.', 'success');
                    }).catch(() => {
                        showToast(`Share this link: ${url}`, 'info');
                    });
                }
            });
        });

        // Quick action buttons
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                if (action === 'role') this.showApplyRoleModal();
                else if (action === 'wallet') this.showFundWalletModal();
                else if (action === 'stars') this.showConvertStarsModal();
            });
        });

        // Refresh leaderboard
        document.getElementById('refreshLeaderboardBtn')?.addEventListener('click', async () => {
            await this.loadLeaderboard();
            const container = document.getElementById('dashboardLeaderboard');
            if (container) {
                container.innerHTML = this.renderLeaderboardItems();
            }
            showToast('Leaderboard refreshed!', 'success');
        });
    }

    // ============================================
    // LOAD LEADERBOARD
    // ============================================
    async loadLeaderboard() {
        try {
            this.leaderboardData = await getIndividualLeaderboard(5);
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            this.leaderboardData = [];
        }
    }

    // ============================================
    // RENDER LEADERBOARD ITEMS
    // ============================================
    renderLeaderboardItems() {
        if (!this.leaderboardData || this.leaderboardData.length === 0) {
            return '<div class="empty-state"><p>No leaders yet. Be the first!</p></div>';
        }
        
        return this.leaderboardData.map((user, index) => {
            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
            const medals = ['🥇', '🥈', '🥉'];
            const rankDisplay = index < 3 ? medals[index] : `#${index + 1}`;
            
            return `
                <div class="leaderboard-item ${rankClass}">
                    <div class="leaderboard-rank">${rankDisplay}</div>
                    <div class="leaderboard-avatar">
                        <img src="${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=fbb040&color=fff`}" alt="">
                    </div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${user.name || 'Anonymous'}</div>
                        <div class="leaderboard-badge">${user.badge?.icon || '🌱'} ${user.badge?.name || 'Starter'}</div>
                    </div>
                    <div class="leaderboard-score">${Math.round(user.progress || 0)}%</div>
                    <div class="leaderboard-gp">${(user.gp_points || 0).toLocaleString()} GP</div>
                </div>
            `;
        }).join('');
    }

    // ============================================
    // GET SUBMISSIONS COUNT
    // ============================================
    async getSubmissionsCount(userId) {
        try {
            const { count, error } = await supabase
                .from('student_answers')
                .select('id', { count: 'exact' })
                .eq('student_id', userId)
                .eq('status', 'graded');
            
            if (error) throw error;
            return count || 0;
        } catch (error) {
            console.error('Error getting submissions:', error);
            return 0;
        }
    }

    // ============================================
    // GET REFERRALS COUNT
    // ============================================
    async getReferralsCount(userId) {
        try {
            const count = await getReferralCount(userId);
            return count;
        } catch (error) {
            console.error('Error getting referrals:', error);
            return 0;
        }
    }

    // ============================================
    // GET PAYMENT REQUESTS
    // ============================================
    async getPaymentRequests(userId) {
        try {
            const { data, error } = await supabase
                .from('payment_requests')
                .select('*')
                .eq('user_id', userId)
                .order('submitted_at', { ascending: false });
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting payment requests:', error);
            return [];
        }
    }

    // ============================================
    // GET TIME AGO
    // ============================================
    getTimeAgo(date) {
        if (!date) return 'Just now';
        
        let past;
        if (typeof date === 'string') {
            past = new Date(date);
        } else if (date instanceof Date) {
            past = date;
        } else {
            return 'Just now';
        }
        
        if (isNaN(past.getTime())) {
            return 'Just now';
        }
        
        const now = new Date();
        const diff = Math.floor((now.getTime() - past.getTime()) / 1000);
        
        if (diff < 0) return 'Just now';
        if (diff < 5) return 'Just now';
        if (diff < 60) return `${diff}s ago`;
        
        const minutes = Math.floor(diff / 60);
        const hours = Math.floor(diff / 3600);
        const days = Math.floor(diff / 86400);
        const weeks = Math.floor(diff / 604800);
        const months = Math.floor(diff / 2592000);
        const years = Math.floor(diff / 31536000);

        if (minutes < 2) return '1m ago';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 2) return '1h ago';
        if (hours < 24) return `${hours}h ago`;
        if (days < 2) return '1d ago';
        if (days < 7) return `${days}d ago`;
        if (weeks < 2) return '1w ago';
        if (weeks < 4) return `${weeks}w ago`;
        if (months < 2) return '1mo ago';
        if (months < 12) return `${months}mo ago`;
        if (years < 2) return '1y ago';
        return `${years}y ago`;
    }

    // ============================================
    // SHOW APPLY ROLE MODAL
    // ============================================
    showApplyRoleModal() {
        const roles = ['student', 'instructor', 'ambassador'];
        const roleLabels = {
            'student': 'Student (Learn & Build)',
            'instructor': 'Instructor (Teach & Mentor)',
            'ambassador': 'Ambassador (Represent & Lead)'
        };

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Apply for a Role</h2>
                    <button class="modal-close" id="closeRoleModal">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 1rem; color: var(--text-secondary);">
                        Select the role you want to apply for. Your application will be reviewed by an admin.
                    </p>
                    <div class="role-options">
                        ${roles.map(r => `
                            <button class="apply-role-btn" data-role="${r}">
                                Apply as ${roleLabels[r] || r}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#closeRoleModal')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        modal.querySelectorAll('.apply-role-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const role = btn.dataset.role;
                modal.remove();
                await this.applyForRole(role);
            });
        });
    }

    // ============================================
    // APPLY FOR ROLE
    // ============================================
    async applyForRole(role) {
        try {
            const result = await this.submitApplication({
                role: role,
                fullName: this.currentProfile?.name,
                username: this.currentProfile?.username,
                email: this.currentUser?.email,
                birthDay: this.currentProfile?.birth_day,
                birthMonth: this.currentProfile?.birth_month
            });
            
            if (result.success) {
                showToast(`Application for ${role} submitted successfully!`, 'success');
                // Refresh dashboard
                await this.loadDashboard();
            } else {
                showToast(result.error || 'Failed to submit application', 'error');
            }
        } catch (error) {
            console.error('Error applying for role:', error);
            showToast('Failed to submit application', 'error');
        }
    }

    // ============================================
    // SUBMIT APPLICATION
    // ============================================
    async submitApplication(data) {
        try {
            const { error } = await supabase
                .from('applications')
                .insert([{
                    user_id: this.currentUser.id,
                    full_name: data.fullName,
                    username: data.username,
                    email: data.email,
                    role: data.role,
                    birth_day: data.birthDay,
                    birth_month: data.birthMonth,
                    status: 'pending',
                    submitted_at: new Date().toISOString()
                }]);

            if (error) throw error;

            // Update user profile status
            await supabase
                .from('user_profiles')
                .update({
                    application_status: 'pending',
                    applied_role: data.role
                })
                .eq('id', this.currentUser.id);

            return { success: true };
        } catch (error) {
            console.error('Error submitting application:', error);
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // SHOW CONVERT STARS MODAL
    // ============================================
    showConvertStarsModal() {
        const profile = this.currentProfile;
        const currentGP = profile?.gp_points || 0;
        const starsEarned = Math.floor(currentGP / 1000);
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>⭐ Convert GP to Stars</h2>
                    <button class="modal-close" id="closeConvertModal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="convert-info">
                        <div class="convert-stat">
                            <span class="convert-label">Current GP</span>
                            <span class="convert-value">${currentGP.toLocaleString()}</span>
                        </div>
                        <div class="convert-stat">
                            <span class="convert-label">Stars You Can Earn</span>
                            <span class="convert-value">${starsEarned} ⭐</span>
                        </div>
                        <p class="convert-hint">
                            ${starsEarned > 0 ? 'Ready to convert? Each star gives you a surprise gift!' : 'Earn 1,000 GP to get your first star!'}
                        </p>
                    </div>
                    
                    ${starsEarned > 0 ? `
                        <button id="confirmConvertStars" class="btn-primary" style="width: 100%;">
                            <i class="fas fa-star"></i> Convert ${starsEarned} Star${starsEarned > 1 ? 's' : ''}
                        </button>
                    ` : `
                        <button class="btn-outline" disabled style="width: 100%; opacity: 0.5;">
                            Need 1,000 GP to convert
                        </button>
                    `}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#closeConvertModal')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        modal.querySelector('#confirmConvertStars')?.addEventListener('click', async () => {
            const result = await convertGPToStars(this.currentUser.id);
            if (result) {
                modal.remove();
                await this.loadDashboard();
            }
        });
    }

    // ============================================
    // SHOW FUND WALLET MODAL
    // ============================================
    showFundWalletModal() {
        const modal = document.getElementById('fundWalletModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            this.resetWalletModal();
        }
    }

    resetWalletModal() {
        const fundingOptions = document.querySelector('.funding-options');
        const bankDetails = document.querySelector('.bank-details');
        if (fundingOptions && bankDetails) {
            fundingOptions.style.display = 'block';
            bankDetails.style.display = 'none';
        }
        document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('customAmount').value = '';
        document.getElementById('selectedAmountDisplay').style.display = 'none';
        this.selectedAmount = 0;
    }

    // ============================================
    // WALLET TAB (Fully Implemented)
    // ============================================
    async loadWallet(container) {
        if (!container) {
            container = this.container;
        }
        if (!container) return;

        const profile = this.currentProfile;
        const progressData = await getStudentProgress(this.currentUser.id);

        container.innerHTML = `
            <div class="dashboard-header">
                <h1>Wallet</h1>
                <p>Manage your funds and transactions</p>
            </div>

            <div class="wallet-summary">
                <div class="wallet-balance-card">
                    <h3>Available Balance</h3>
                    <p class="wallet-amount-large">₦${(profile?.wallet_balance || 0).toLocaleString()}</p>
                    <button class="btn-primary" id="fundWalletBtn">
                        <i class="fas fa-plus"></i> Add Funds
                    </button>
                </div>
                <div class="wallet-gp-card">
                    <h3>GP Points</h3>
                    <p class="gp-amount-large">${progressData?.currentGP?.toLocaleString() || 0}</p>
                    <span class="gp-label">Earn more by completing tasks!</span>
                    <button class="btn-outline convert-stars-btn" id="convertStarsFromWallet">
                        <i class="fas fa-star"></i> Convert to Stars
                    </button>
                </div>
            </div>

            <div class="card">
                <h3>Transaction History</h3>
                <div id="transactionHistory">
                    <p class="text-muted">Loading transactions...</p>
                </div>
            </div>
        `;

        document.getElementById('fundWalletBtn')?.addEventListener('click', () => {
            // Close this tab and show fund modal
            this.showFundWalletModal();
        });

        document.getElementById('convertStarsFromWallet')?.addEventListener('click', () => {
            this.showConvertStarsModal();
        });

        await this.loadTransactionHistory();
    }

    // ============================================
    // LOAD TRANSACTION HISTORY
    // ============================================
    async loadTransactionHistory() {
        const container = document.getElementById('transactionHistory');
        if (!container) return;

        try {
            const [transactions, paymentRequests] = await Promise.all([
                getUserTransactions(),
                this.getPaymentRequests(this.currentUser.id)
            ]);

            let allTransactions = [];

            if (transactions && transactions.length > 0) {
                allTransactions = allTransactions.concat(transactions.map(tx => ({
                    ...tx,
                    type: 'transaction',
                    display_type: tx.type || 'unknown',
                    date: tx.created_at,
                    description: tx.description || `${tx.type === 'credit' ? 'Credited' : 'Debited'}`
                })));
            }

            if (paymentRequests && paymentRequests.length > 0) {
                allTransactions = allTransactions.concat(paymentRequests.map(p => ({
                    ...p,
                    type: 'payment_request',
                    display_type: p.status,
                    date: p.submitted_at,
                    amount: p.amount,
                    description: 'Wallet funding request'
                })));
            }

            allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

            if (allTransactions.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-receipt" style="font-size: 32px; color: var(--text-muted);"></i>
                        <p>No transactions yet</p>
                        <small>Your financial activity will appear here</small>
                    </div>
                `;
                return;
            }

            container.innerHTML = allTransactions.map(item => {
                let amountDisplay = '';
                let statusDisplay = '';
                let description = item.description || 'Transaction';
                let dateDisplay = '';

                const d = new Date(item.date);
                dateDisplay = d.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                });

                if (item.type === 'transaction') {
                    const prefix = item.display_type === 'credit' ? '+' : '';
                    amountDisplay = `${prefix}₦${(item.amount || 0).toLocaleString()}`;
                    const cls = item.display_type === 'credit' ? 'credit' : 'debit';
                    return `
                        <div class="transaction-item">
                            <div class="tx-info">
                                <span class="tx-description">${description}</span>
                                <span class="tx-date">${dateDisplay}</span>
                            </div>
                            <div class="tx-amount ${cls}">${amountDisplay}</div>
                        </div>
                    `;
                } else if (item.type === 'payment_request') {
                    amountDisplay = `₦${(item.amount || 0).toLocaleString()}`;
                    const statusMap = {
                        'pending': '⏳ Pending',
                        'approved': '✅ Approved',
                        'rejected': '❌ Rejected'
                    };
                    statusDisplay = `<span class="tx-status ${item.display_type}">${statusMap[item.display_type] || item.display_type}</span>`;
                    const icon = item.display_type === 'approved' ? 'fa-check-circle' : 
                                 item.display_type === 'rejected' ? 'fa-times-circle' : 'fa-clock';
                    
                    return `
                        <div class="transaction-item">
                            <div class="tx-info">
                                <span class="tx-description">
                                    <i class="fas ${icon}" style="margin-right: 6px;"></i>
                                    ${description}
                                </span>
                                <span class="tx-date">${dateDisplay}</span>
                                ${statusDisplay}
                            </div>
                            <div class="tx-amount ${item.display_type}">${amountDisplay}</div>
                        </div>
                    `;
                }
                return '';
            }).join('');

        } catch (error) {
            console.error('Error loading transactions:', error);
            container.innerHTML = '<p class="text-muted">Failed to load transactions</p>';
        }
    }

    // ============================================
    // MESSAGES TAB (Fully Implemented)
    // ============================================
    async loadMessages(container) {
        if (!container) {
            container = this.container;
        }
        if (!container) return;

        container.innerHTML = `
            <div class="dashboard-header">
                <h1><i class="fas fa-envelope"></i> Messages</h1>
                <p>Communicate with administrators</p>
            </div>
            
            <div class="card messages-container">
                <div class="messages-header">
                    <h3>Admin Communication</h3>
                    <button id="newMessageBtn" class="btn-primary"><i class="fas fa-plus"></i> New Message</button>
                </div>
                
                <div id="messageThreads">
                    <div class="empty-state">
                        <i class="fas fa-inbox" style="font-size: 48px; color: var(--text-secondary);"></i>
                        <h3>No Messages</h3>
                        <p>Start a conversation with an administrator</p>
                    </div>
                </div>
            </div>
            
            <div id="messageModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>New Message</h2>
                        <button class="modal-close" id="closeMessageModal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="messageForm">
                            <div class="form-group">
                                <label>Subject</label>
                                <input type="text" id="messageSubject" required placeholder="Enter message subject">
                            </div>
                            <div class="form-group">
                                <label>Message</label>
                                <textarea id="messageBody" rows="5" required placeholder="Type your message..."></textarea>
                            </div>
                            <button type="submit" class="btn-primary">Send Message</button>
                        </form>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('newMessageBtn')?.addEventListener('click', () => {
            const modal = document.getElementById('messageModal');
            if (modal) modal.classList.add('active');
        });

        document.getElementById('closeMessageModal')?.addEventListener('click', () => {
            const modal = document.getElementById('messageModal');
            if (modal) modal.classList.remove('active');
        });

        document.getElementById('messageForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const subject = document.getElementById('messageSubject').value;
            const body = document.getElementById('messageBody').value;
            
            const { error } = await supabase
                .from('messages')
                .insert([{
                    user_id: this.currentUser.id,
                    subject: subject,
                    body: body,
                    status: 'unread',
                    created_at: new Date().toISOString()
                }]);
            
            if (error) {
                showToast('Failed to send message', 'error');
            } else {
                showToast('Message sent successfully!', 'success');
                document.getElementById('messageModal').classList.remove('active');
                document.getElementById('messageForm').reset();
                await this.loadMessageThreads();
            }
        });

        await this.loadMessageThreads();
    }

    // ============================================
    // LOAD MESSAGE THREADS
    // ============================================
    async loadMessageThreads() {
        const container = document.getElementById('messageThreads');
        if (!container) return;

        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!data || data.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-inbox" style="font-size: 48px; color: var(--text-secondary);"></i>
                        <h3>No Messages</h3>
                        <p>Start a conversation with an administrator</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = data.map(msg => `
                <div class="message-thread ${msg.status === 'unread' ? 'unread' : ''}">
                    <div class="message-header">
                        <span class="message-subject">${msg.subject}</span>
                        <span class="message-date">${this.getTimeAgo(msg.created_at)}</span>
                    </div>
                    <div class="message-body-preview">${msg.body.substring(0, 100)}${msg.body.length > 100 ? '...' : ''}</div>
                    <div class="message-status ${msg.status}">${msg.status === 'unread' ? '🔴 Unread' : '✅ Read'}</div>
                    ${msg.admin_response ? `
                        <div class="admin-response">
                            <strong>Admin Response:</strong> ${msg.admin_response}
                        </div>
                    ` : ''}
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading messages:', error);
            container.innerHTML = '<p class="text-muted">Failed to load messages</p>';
        }
    }

    // ============================================
    // PORTFOLIO TAB (Fully Implemented)
    // ============================================
    async loadPortfolio(container) {
        if (!container) {
            container = this.container;
        }
        if (!container) return;

        const user = this.currentUser;
        const profile = this.currentProfile;
        const username = profile?.username || user?.email?.split('@')[0] || 'user';
        const portfolioUrl = `${window.location.origin}/u/${username}`;

        container.innerHTML = `
            <div class="dashboard-header">
                <h1><i class="fas fa-user-circle"></i> Portfolio</h1>
                <p>Your creative showcase</p>
            </div>

            <div class="card portfolio-link-card">
                <div class="portfolio-header">
                    <h3><i class="fas fa-link"></i> Your Portfolio Link</h3>
                    <div class="portfolio-url-container">
                        <input type="text" id="portfolioUrl" value="${portfolioUrl}" readonly>
                        <button id="copyPortfolioUrl" class="btn-icon" title="Copy URL">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </div>
                <div class="portfolio-qr-container" id="portfolioQrContainer">
                    <div id="portfolioQrCode" style="display: flex; justify-content: center; padding: 10px;">
                        <canvas id="qrCanvas"></canvas>
                    </div>
                    <p class="qr-hint">Scan to view my portfolio</p>
                </div>
            </div>

            <div class="go-to-grid">
                <a href="/library.html" class="go-to-item">
                    <div class="go-to-icon"><i class="fas fa-book"></i></div>
                    <div class="go-to-label">Library</div>
                    <div class="go-to-desc">Browse books & content</div>
                </a>
                <a href="/hub.html" class="go-to-item">
                    <div class="go-to-icon"><i class="fas fa-store"></i></div>
                    <div class="go-to-label">Hub</div>
                    <div class="go-to-desc">Community marketplace</div>
                </a>
                <a href="/chat.html" class="go-to-item">
                    <div class="go-to-icon"><i class="fas fa-comments"></i></div>
                    <div class="go-to-label">Chat Room</div>
                    <div class="go-to-desc">Connect with peers</div>
                </a>
                <a href="/virtualroom.html" class="go-to-item">
                    <div class="go-to-icon"><i class="fas fa-video"></i></div>
                    <div class="go-to-label">Virtual Room</div>
                    <div class="go-to-desc">Live sessions</div>
                </a>
                <a href="/courses.html" class="go-to-item">
                    <div class="go-to-icon"><i class="fas fa-graduation-cap"></i></div>
                    <div class="go-to-label">Courses</div>
                    <div class="go-to-desc">Your learning path</div>
                </a>
                <a href="/merchandise.html" class="go-to-item">
                    <div class="go-to-icon"><i class="fas fa-tshirt"></i></div>
                    <div class="go-to-label">Merchandise</div>
                    <div class="go-to-desc">Shop Gliimu gear</div>
                </a>
            </div>

            <div class="card quick-stats-card">
                <h3>Your Stats</h3>
                <div class="quick-stats-grid">
                    <div class="quick-stat">
                        <span class="stat-number">${profile?.gp_points?.toLocaleString() || 0}</span>
                        <span class="stat-label">GP Points</span>
                    </div>
                    <div class="quick-stat">
                        <span class="stat-number">${profile?.total_stars || 0} ⭐</span>
                        <span class="stat-label">Stars</span>
                    </div>
                    <div class="quick-stat">
                        <span class="stat-number">${profile?.role || 'Student'}</span>
                        <span class="stat-label">Role</span>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('copyPortfolioUrl')?.addEventListener('click', () => {
            const urlInput = document.getElementById('portfolioUrl');
            if (urlInput) {
                urlInput.select();
                document.execCommand('copy');
                showToast('Portfolio URL copied!', 'success');
            }
        });

        this.generateQRCode(portfolioUrl);
    }

    // ============================================
    // GENERATE QR CODE
    // ============================================
    generateQRCode(url) {
        if (typeof QRCode === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
            script.onload = () => {
                this.generateQRCode(url);
            };
            document.head.appendChild(script);
            return;
        }

        const canvas = document.getElementById('qrCanvas');
        if (canvas) {
            try {
                new QRCode(canvas, {
                    text: url,
                    width: 150,
                    height: 150,
                    colorDark: '#1a1c4a',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
            } catch (error) {
                console.error('Error generating QR code:', error);
            }
        }
    }
}

export default GeneralDashboard;
