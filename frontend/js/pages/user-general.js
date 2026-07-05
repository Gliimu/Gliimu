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
    // LOAD DASHBOARD
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
            <div class="quick-actions-grid">
                <button class="quick-action-btn" data-action="role">
                    <i class="fas fa-user-graduate"></i>
                    <span>Apply for Role</span>
                </button>
                <button class="quick-action-btn" data-action="wallet">
                    <i class="fas fa-plus-circle"></i>
                    <span>Fund Wallet</span>
                </button>
                <button class="quick-action-btn" data-action="stars">
                    <i class="fas fa-star"></i>
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
        document.querySelectorAll('.quick-action-btn').forEach(btn => {
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
    // OTHER TABS (Placeholders)
    // ============================================
    async loadWallet(container) {
        // Will be implemented in full version
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-wallet"></i>
                <h3>Wallet</h3>
                <p>Full wallet features coming soon...</p>
            </div>
        `;
    }

    async loadMessages(container) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-envelope"></i>
                <h3>Messages</h3>
                <p>Message features coming soon...</p>
            </div>
        `;
    }

    async loadPortfolio(container) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-circle"></i>
                <h3>Portfolio</h3>
                <p>Portfolio features coming soon...</p>
            </div>
        `;
    }
}

export default GeneralDashboard;
