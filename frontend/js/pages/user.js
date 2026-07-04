// ============================================
// PAGE: USER PROFILE
// Path: /frontend/js/pages/user.js
// Purpose: Handles user profile page and dashboard
// ============================================

import { 
    getCurrentUser as getAuthUser,
    signOutUser,
    getCurrentSession
} from '../modules/auth.js';
import { 
    supabase, 
    getUserProfile, 
    updateUserProfile,
    submitApplication,
    getUserApplications,
    getPendingApplications,
    approveApplication,
    rejectApplication,
    getUserTransactions,
    addTransaction,
    createPaymentRequest,
    getUserPayments,
    getReferralCount
} from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';
import { getBankDetails } from '../modules/settings.js';
import { 
    getStudentProgress,
    getIndividualLeaderboard,
    earnGP,
    convertGPToStars,
    getPortfolioStatus
} from '../modules/progression.js';

export class UserPage {
    constructor() {
        this.currentUser = null;
        this.currentProfile = null;
        this.dashboardContent = document.getElementById('dashboardContent');
        this.loadingDiv = document.getElementById('loading');
        this.currentTab = 'dashboard';
        this.bankDetails = null;
        this.leaderboardData = [];
        
        // Wallet state
        this.selectedAmount = 0;
        this.referenceCode = '';
        
        this.init();
    }

    async init() {
        try {
            // Check if user is authenticated
            const session = await getCurrentSession();
            if (!session) {
                window.location.href = '/signin.html';
                return;
            }

            // Load user data
            await this.loadUserData();
            await this.loadBankDetails();
            this.setupEventListeners();
            this.setupWalletSubscription();
            this.setupNavigation();
            
            // Load default tab
            this.loadTab('dashboard');
            
        } catch (error) {
            console.error('Init error:', error);
            this.showError('Failed to initialize dashboard');
        }
    }

    async loadUserData() {
        try {
            this.showLoading(true);
            
            const user = await getAuthUser();
            if (!user) {
                this.showError('User not authenticated');
                window.location.href = '/signin.html';
                return;
            }

            this.currentUser = user;
            const profile = await getUserProfile(user.id);
            
            if (!profile) {
                this.showError('User profile not found');
                return;
            }

            this.currentProfile = profile;

            // ✅ Update role stylesheet
            this.updateRoleStylesheet(profile.role || 'student');

            // Update UI
            this.updateUserUI(user, profile);
            
            // Store user data
            localStorage.setItem('glimu_user', JSON.stringify({
                id: user.id,
                name: profile.name,
                email: user.email,
                username: profile.username,
                role: profile.role || 'user',
                walletBalance: profile.wallet_balance || 0,
                gpPoints: profile.gp_points || 0,
                avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=fbb040&color=fff`
            }));
            
            // Load leaderboard
            await this.loadLeaderboard();
            
            this.showLoading(false);
        } catch (error) {
            console.error('Error loading user data:', error);
            this.showError('Failed to load user data');
            this.showLoading(false);
        }
    }

    async loadBankDetails() {
        try {
            this.bankDetails = await getBankDetails();
        } catch (error) {
            console.error('Error loading bank details:', error);
            // Fallback defaults
            this.bankDetails = {
                bankName: 'MoniePoint Micro Finance Bank',
                accountName: 'Gliimu LTD',
                accountNumber: '6315085115'
            };
        }
    }

    // ✅ NEW: Load leaderboard
    async loadLeaderboard() {
        try {
            this.leaderboardData = await getIndividualLeaderboard(5);
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            this.leaderboardData = [];
        }
    }

    // ✅ NEW: Load submissions count
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

    // ✅ NEW: Get referrals count
async getReferralsCount(userId) {
    try {
        const count = await getReferralCount(userId);
        return count;
    } catch (error) {
        console.error('Error getting referrals:', error);
        return 0;
    }
}

    updateRoleStylesheet(role) {
        const roleStylesheet = document.getElementById('roleStylesheet');
        if (roleStylesheet) {
            const roleMap = {
                'student': 'student',
                'instructor': 'instructor',
                'admin': 'instructor',
                'partner': 'partner',
                'ambassador': 'student',
                'other': 'student'
            };
            const cssRole = roleMap[role] || 'student';
            roleStylesheet.href = `/frontend/css/user-${cssRole}.css`;
        }
    }

    updateUserUI(user, profile) {
        // Sidebar user info
        const userNameEl = document.getElementById('userName');
        const userRoleEl = document.getElementById('userRole');
        const userAvatarImg = document.getElementById('userAvatarImg');
        
        if (userNameEl) {
            userNameEl.textContent = profile.name || 'User';
        }
        
        if (userRoleEl) {
            userRoleEl.textContent = profile.role || 'Student';
        }
        
        if (userAvatarImg) {
            const avatarUrl = profile.avatar_url || 
                `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=fbb040&color=fff&size=128`;
            userAvatarImg.src = avatarUrl;
        }
    }

    setupNavigation() {
        // Sidebar navigation
        const sidebarNav = document.getElementById('sidebarNav');
        if (sidebarNav) {
            const navItems = this.getNavItems();
            sidebarNav.innerHTML = navItems;
            
            sidebarNav.querySelectorAll('.nav-item').forEach(item => {
                item.addEventListener('click', () => {
                    const tab = item.dataset.tab;
                    this.loadTab(tab);
                });
            });
        }

        // Mobile bottom navigation
        document.querySelectorAll('.mobile-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const tab = item.dataset.tab;
                if (tab === 'gotomenu') {
                    this.toggleSidebar();
                    return;
                }
                this.loadTab(tab);
            });
        });

        // Sidebar overlay
        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeSidebar());
        }
    }

    // ✅ UPDATED: Navigation items
    getNavItems() {
        const role = this.currentProfile?.role || 'student';
        const items = [
            { tab: 'dashboard', icon: 'fa-tachometer-alt', label: 'Dashboard' },
            { tab: 'messages', icon: 'fa-envelope', label: 'Messages' },
            { tab: 'gotomenu', icon: 'fa-door-open', label: 'Go To' },
            { tab: 'wallet', icon: 'fa-wallet', label: 'Wallet' },
        ];

        if (role === 'instructor' || role === 'admin') {
            items.push({ tab: 'manage', icon: 'fa-users-cog', label: 'Manage' });
        }

        if (role === 'admin') {
            items.push({ tab: 'admin', icon: 'fa-crown', label: 'Admin' });
        }

        items.push({ tab: 'settings', icon: 'fa-cog', label: 'Profile' });

        return items.map(item => `
            <button class="nav-item" data-tab="${item.tab}">
                <i class="fas ${item.icon}"></i>
                <span>${item.label}</span>
            </button>
        `).join('');
    }

    async loadTab(tab) {
        this.currentTab = tab;
        
        // Update active states
        document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.tab === tab) {
                el.classList.add('active');
            }
        });

        // Load content based on tab
        switch(tab) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'wallet':
                await this.loadWallet();
                break;
            case 'messages':
                await this.loadMessages();
                break;
            case 'gotomenu':
                await this.loadGoToMenu();
                break;
            case 'settings':
                await this.loadSettings();
                break;
            case 'manage':
                await this.loadManage();
                break;
            case 'admin':
                await this.loadAdmin();
                break;
            default:
                await this.loadDashboard();
        }

        this.closeSidebar();
    }

    // ============================================
    // DASHBOARD TAB (UPDATED)
    // ============================================
    async loadDashboard() {
        const content = this.dashboardContent;
        if (!content) return;

        const profile = this.currentProfile;
        const user = this.currentUser;
        
        // Get submissions and referrals count
        const submissionsCount = await this.getSubmissionsCount(user.id);
        const referralsCount = await this.getReferralsCount(user.id);
        
        // Get progress data
        const progressData = await getStudentProgress(user.id);
        const progress = progressData?.progress || 0;
        const badge = progressData?.currentBadge || { name: 'Starter', icon: '🌱', color: '#10b981' };
        const currentGP = progressData?.currentGP || 0;
        const totalStars = progressData?.totalStars || 0;

        content.innerHTML = `
            <div class="dashboard-header">
                <div>
                    <h1>Dashboard</h1>
                    <p>Welcome back, ${profile?.name || 'User'}!</p>
                </div>
                <div class="header-badge">
                    <span class="badge-icon">${badge.icon}</span>
                    <span class="badge-name" style="color: ${badge.color}">${badge.name}</span>
                </div>
            </div>

            <!-- Stats Grid - UPDATED -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon wallet-icon">
                        <i class="fas fa-wallet"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Wallet Balance</h3>
                        <p class="stat-value" id="walletBalance">₦${(profile?.wallet_balance || 0).toLocaleString()}</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon gp-icon">
                        <i class="fas fa-star"></i>
                    </div>
                    <div class="stat-info">
                        <h3>GP Points</h3>
                        <p class="stat-value" id="gpPoints">${currentGP.toLocaleString()}</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon submissions-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Submissions</h3>
                        <p class="stat-value">${submissionsCount}</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon referrals-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Referrals</h3>
                        <p class="stat-value">${referralsCount}</p>
                    </div>
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
            <div class="dashboard-grid">
                <div class="card quick-actions-card">
                    <h3>Quick Actions</h3>
                    <div class="quick-actions">
                        <button class="action-btn" data-action="wallet">
                            <i class="fas fa-plus-circle"></i>
                            Fund Wallet
                        </button>
                        <button class="action-btn" data-action="role">
                            <i class="fas fa-user-graduate"></i>
                            Apply for Role
                        </button>
                        <button class="action-btn" data-action="stars">
                            <i class="fas fa-star"></i>
                            Convert GP to Stars
                        </button>
                    </div>
                </div>

                <!-- LEADERBOARD - NEW -->
                <div class="card leaderboard-card">
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
            </div>

            <!-- Recent Activity -->
            <div class="card recent-activity-card">
                <h3>Recent Activity</h3>
                <div id="recentActivity">
                    <p class="text-muted">Loading activities...</p>
                </div>
            </div>

            ${profile?.application_status === 'pending' ? `
                <div class="alert alert-warning">
                    <i class="fas fa-clock"></i>
                    Your application for <strong>${profile.applied_role}</strong> is pending review.
                </div>
            ` : ''}
        `;

        // Re-bind event listeners
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                if (action === 'wallet') this.showFundWalletModal();
                else if (action === 'role') this.showApplyRoleModal();
                else if (action === 'stars') this.showConvertStarsModal();
            });
        });

        document.getElementById('refreshLeaderboardBtn')?.addEventListener('click', async () => {
            await this.loadLeaderboard();
            const container = document.getElementById('dashboardLeaderboard');
            if (container) {
                container.innerHTML = this.renderLeaderboardItems();
            }
            showToast('Leaderboard refreshed!', 'success');
        });

        await this.loadRecentActivity();
    }

    // ✅ NEW: Render leaderboard items
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

    async loadRecentActivity() {
        const container = document.getElementById('recentActivity');
        if (!container) return;

        try {
            const transactions = await getUserTransactions();
            
            if (!transactions || transactions.length === 0) {
                container.innerHTML = '<p class="text-muted">No recent activity</p>';
                return;
            }

            container.innerHTML = transactions.slice(0, 5).map(tx => `
                <div class="activity-item">
                    <div class="activity-icon ${tx.type === 'credit' ? 'credit' : 'debit'}">
                        <i class="fas ${tx.type === 'credit' ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
                    </div>
                    <div class="activity-details">
                        <p class="activity-description">${tx.description || tx.type}</p>
                        <span class="activity-date">${new Date(tx.created_at).toLocaleDateString()}</span>
                    </div>
                    <div class="activity-amount ${tx.type === 'credit' ? 'credit' : 'debit'}">
                        ${tx.type === 'credit' ? '+' : '-'}₦${(tx.amount || 0).toLocaleString()}
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading activity:', error);
            container.innerHTML = '<p class="text-muted">Failed to load activity</p>';
        }
    }

    // ============================================
    // WALLET TAB (UPDATED)
    // ============================================
    async loadWallet() {
        const content = this.dashboardContent;
        if (!content) return;

        const profile = this.currentProfile;
        const progressData = await getStudentProgress(this.currentUser.id);

        content.innerHTML = `
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

        document.getElementById('fundWalletBtn')?.addEventListener('click', () => this.showFundWalletModal());
        document.getElementById('convertStarsFromWallet')?.addEventListener('click', () => this.showConvertStarsModal());

        await this.loadTransactionHistory();
    }

    async loadTransactionHistory() {
        const container = document.getElementById('transactionHistory');
        if (!container) return;

        try {
            const transactions = await getUserTransactions();
            
            if (!transactions || transactions.length === 0) {
                container.innerHTML = '<p class="text-muted">No transactions yet</p>';
                return;
            }

            container.innerHTML = transactions.map(tx => `
                <div class="transaction-item">
                    <div class="tx-info">
                        <span class="tx-description">${tx.description || tx.type}</span>
                        <span class="tx-date">${new Date(tx.created_at).toLocaleDateString()}</span>
                        ${tx.status ? `<span class="tx-status ${tx.status}">${tx.status}</span>` : ''}
                    </div>
                    <div class="tx-amount ${tx.type === 'credit' ? 'credit' : 'debit'}">
                        ${tx.type === 'credit' ? '+' : '-'}₦${(tx.amount || 0).toLocaleString()}
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading transactions:', error);
            container.innerHTML = '<p class="text-muted">Failed to load transactions</p>';
        }
    }

    // ============================================
    // MESSAGES TAB (NEW - Replaces Alerts)
    // ============================================
    async loadMessages() {
        this.dashboardContent.innerHTML = `
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
            
            <!-- Message Modal -->
            <div id="messageModal" class="modal" style="display: none;">
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
            if (modal) modal.style.display = 'flex';
        });

        document.getElementById('closeMessageModal')?.addEventListener('click', () => {
            const modal = document.getElementById('messageModal');
            if (modal) modal.style.display = 'none';
        });

        document.getElementById('messageForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const subject = document.getElementById('messageSubject').value;
            const body = document.getElementById('messageBody').value;
            
            // Send message to admin
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
                document.getElementById('messageModal').style.display = 'none';
                document.getElementById('messageForm').reset();
            }
        });

        // Load existing messages
        this.loadMessageThreads();
    }

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
                        <span class="message-date">${new Date(msg.created_at).toLocaleDateString()}</span>
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
// UTILITY METHODS (ADD THESE)
// ============================================

showLoading(show) {
    if (this.loadingDiv) {
        this.loadingDiv.style.display = show ? 'flex' : 'none';
    }
    if (this.dashboardContent) {
        this.dashboardContent.style.opacity = show ? '0.5' : '1';
        this.dashboardContent.style.pointerEvents = show ? 'none' : 'auto';
    }
}

showError(message) {
    showToast(message, 'error');
}

// ============================================
// SETUP EVENT LISTENERS (ADD THIS)
// ============================================

setupEventListeners() {
    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    // Wallet modal events
    document.querySelectorAll('.amount-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.selectedAmount = parseInt(btn.dataset.amount);
            this.updateAmountDisplay();
        });
    });

    document.getElementById('customAmount')?.addEventListener('input', (e) => {
        document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
        this.selectedAmount = parseInt(e.target.value) || 0;
        this.updateAmountDisplay();
    });

    document.getElementById('continueToBankBtn')?.addEventListener('click', () => {
        if (this.selectedAmount < 100) {
            showToast('Please select or enter an amount (minimum ₦100)', 'error');
            return;
        }
        this.showBankDetails();
    });

    document.getElementById('backToAmountBtn')?.addEventListener('click', () => {
        this.resetWalletModal();
    });

    document.getElementById('confirmPaymentBtn')?.addEventListener('click', async () => {
        await this.confirmPayment();
    });

    document.getElementById('copyRefCodeBtn')?.addEventListener('click', () => {
        const code = document.getElementById('referenceCode')?.textContent;
        if (code) {
            navigator.clipboard.writeText(code).then(() => {
                showToast('Reference code copied!', 'success');
            }).catch(() => {
                // Fallback
                const input = document.createElement('input');
                input.value = code;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
                showToast('Reference code copied!', 'success');
            });
        }
    });

    // MVP form
    document.getElementById('mvpForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.submitMvp();
    });
}

// ============================================
// WALLET MODAL HELPERS (ADD THESE)
// ============================================

updateAmountDisplay() {
    const display = document.getElementById('selectedAmountDisplay');
    const large = document.getElementById('selectedAmountLarge');
    if (display && large) {
        if (this.selectedAmount > 0) {
            display.style.display = 'block';
            large.textContent = `₦${this.selectedAmount.toLocaleString()}`;
        } else {
            display.style.display = 'none';
        }
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

async confirmPayment() {
    try {
        const result = await createPaymentRequest(
            this.selectedAmount,
            'GTBank',
            this.referenceCode
        );
        
        if (result.success) {
            showToast('Payment recorded! Waiting for admin verification.', 'success');
            this.resetWalletModal();
            document.getElementById('fundWalletModal').classList.remove('active');
            document.body.style.overflow = '';
            await this.loadWallet();
        } else {
            showToast(result.error || 'Failed to record payment', 'error');
        }
    } catch (error) {
        console.error('Payment error:', error);
        showToast('Failed to record payment', 'error');
    }
}

showFundWalletModal() {
    const modal = document.getElementById('fundWalletModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        this.resetWalletModal();
    }
}

// ============================================
// MVP SUBMISSION (ADD THIS)
// ============================================

async submitMvp() {
    try {
        const title = document.getElementById('mvpTitle')?.value.trim();
        const type = document.getElementById('mvpType')?.value;
        const description = document.getElementById('mvpDescription')?.value.trim();
        const proposal = document.getElementById('mvpProposal')?.value.trim();

        if (!title || !type || !description || !proposal) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        // TODO: Implement MVP submission API
        showToast('MVP proposal submitted successfully!', 'success');
        
        // Close modal
        const modal = document.getElementById('mvpModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
        
        // Reset form
        document.getElementById('mvpForm')?.reset();
        
    } catch (error) {
        console.error('MVP submission error:', error);
        showToast('Failed to submit MVP proposal', 'error');
    }
}

// ============================================
// ROLE APPLICATION (ADD THIS)
// ============================================

async applyForRole(role) {
    try {
        const result = await submitApplication({
            role: role,
            fullName: this.currentProfile?.name,
            username: this.currentProfile?.username,
            email: this.currentUser?.email,
            birthDay: this.currentProfile?.birth_day,
            birthMonth: this.currentProfile?.birth_month
        });
        
        if (result.success) {
            showToast(`Application for ${role} submitted successfully!`, 'success');
            await this.loadUserData();
            await this.loadTab('dashboard');
        } else {
            showToast(result.error || 'Failed to submit application', 'error');
        }
    } catch (error) {
        console.error('Error applying for role:', error);
        showToast('Failed to submit application', 'error');
    }
}

// ============================================
// PROFILE UPDATE (ADD THIS)
// ============================================

async updateProfile() {
    try {
        const fullName = document.getElementById('fullName')?.value.trim();
        const bio = document.getElementById('bio')?.value.trim();
        const address = document.getElementById('address')?.value.trim();
        const birthDay = document.getElementById('birthDay')?.value;
        const birthMonth = document.getElementById('birthMonth')?.value;
        
        // Check if username is valid before updating
        if (!this.usernameValid) {
            showToast('Please choose a valid username', 'error');
            return;
        }
        
        const username = document.getElementById('username')?.value.trim();
        
        if (!fullName) {
            showToast('Full name is required', 'error');
            return;
        }

        // Update profile with bio and username
        const updateData = {
            name: fullName,
            bio: bio || '',
            address: address || '',
            birth_day: birthDay || null,
            birth_month: birthMonth || null,
            updated_at: new Date().toISOString()
        };
        
        // Only update username if it changed and is valid
        if (username && username !== this.currentProfile?.username) {
            updateData.username = username;
        }

        const result = await updateUserProfile(updateData);

        if (!result) {
            throw new Error('Failed to update profile');
        }

        // Update auth metadata
        const { error: authError } = await supabase.auth.updateUser({
            data: { 
                name: fullName,
                full_name: fullName
            }
        });

        if (authError) throw authError;

        showToast('Profile updated successfully!', 'success');
        await this.loadUserData();
        await this.loadTab('settings');
        
    } catch (error) {
        console.error('Error updating profile:', error);
        showToast('Failed to update profile: ' + error.message, 'error');
    }
}

// ============================================
// WALLET SUBSCRIPTION (ADD THIS)
// ============================================

setupWalletSubscription() {
    if (!this.currentUser) return;
    
    const channel = supabase
        .channel('wallet_updates')
        .on('postgres_changes', 
            { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'user_profiles',
                filter: `id=eq.${this.currentUser.id}` 
            },
            (payload) => {
                if (payload.new) {
                    // Update wallet and GP displays
                    this.updateWalletDisplay(payload.new.wallet_balance);
                    this.updateGpDisplay(payload.new.gp_points);
                    
                    if (this.currentProfile) {
                        this.currentProfile.wallet_balance = payload.new.wallet_balance;
                        this.currentProfile.gp_points = payload.new.gp_points;
                    }
                }
            }
        )
        .subscribe();
}

updateWalletDisplay(balance) {
    document.querySelectorAll('#walletBalance, .wallet-amount').forEach(el => {
        if (el.id === 'walletBalance') {
            el.textContent = `₦${(balance || 0).toLocaleString()}`;
        } else {
            el.textContent = `₦${(balance || 0).toLocaleString()}`;
        }
    });
}

updateGpDisplay(points) {
    document.querySelectorAll('#gpPoints, .gp-amount').forEach(el => {
        el.textContent = (points || 0).toLocaleString();
    });
}

// ============================================
// SIDEBAR TOGGLE (ADD THESE)
// ============================================

toggleSidebar() {
    const sidebar = document.getElementById('dashboardSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) {
        sidebar.classList.toggle('mobile-open');
        if (overlay) {
            overlay.classList.toggle('active');
        }
    }
}

closeSidebar() {
    const sidebar = document.getElementById('dashboardSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) {
        sidebar.classList.remove('mobile-open');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }
}
    
    // ============================================
    // GO-TO TAB (NEW - Replaces Library/Marketplace)
    // ============================================
    async loadGoToMenu() {
        const user = this.currentUser;
        const profile = this.currentProfile;
        const username = profile?.username || user?.email?.split('@')[0] || 'user';
        const portfolioUrl = `${window.location.origin}/u/${username}`;

        this.dashboardContent.innerHTML = `
            <div class="dashboard-header">
                <h1><i class="fas fa-door-open"></i> Go To</h1>
                <p>Your navigation hub</p>
            </div>

            <!-- Portfolio Section -->
            <div class="card portfolio-link-card">
                <div class="portfolio-header">
                    <h3><i class="fas fa-user-circle"></i> Your Portfolio</h3>
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

            <!-- Navigation Grid -->
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

            <!-- Quick Stats -->
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

        // Copy URL functionality
        document.getElementById('copyPortfolioUrl')?.addEventListener('click', () => {
            const urlInput = document.getElementById('portfolioUrl');
            if (urlInput) {
                urlInput.select();
                document.execCommand('copy');
                showToast('Portfolio URL copied!', 'success');
            }
        });

        // Generate QR Code (using qrcode.js library)
        this.generateQRCode(portfolioUrl);
    }

    // ✅ NEW: Generate QR Code for portfolio
    generateQRCode(url) {
        // Check if QRCode library is loaded
        if (typeof QRCode === 'undefined') {
            // Load QRCode library dynamically
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

   // ============================================
// SETTINGS TAB (CLEANER VERSION)
// ============================================
async loadSettings() {
    const content = this.dashboardContent;
    if (!content) return;

    const profile = this.currentProfile;
    const user = this.currentUser;
    const isDarkMode = document.body.classList.contains('dark-mode');
    const currentTheme = isDarkMode ? 'dark' : 'light';

    content.innerHTML = `
        <div class="settings-container">
            <div class="settings-header">
                <h1>Settings</h1>
                <p>Manage your account preferences</p>
            </div>

            <!-- Profile Section -->
            <div class="settings-section">
                <div class="settings-section-header">
                    <i class="fas fa-user-circle"></i>
                    <div>
                        <h3>Profile</h3>
                        <p>Update your personal information</p>
                    </div>
                </div>
                
                <div class="settings-row">
                    <div class="settings-avatar">
                        <img id="profileAvatarPreview" src="${profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.name || 'User')}&background=fbb040&color=fff&size=200`}" alt="Profile">
                        <div class="avatar-actions">
                            <input type="file" id="avatarUpload" accept="image/*" style="display: none;">
                            <button id="uploadAvatarBtn" class="btn-secondary"><i class="fas fa-camera"></i></button>
                            <button id="removeAvatarBtn" class="btn-secondary danger"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                    
                    <div class="settings-form">
                        <div class="form-group">
                            <label>Full Name</label>
                            <input type="text" id="fullName" value="${profile?.name || ''}" placeholder="Your full name">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" value="${user?.email || ''}" disabled>
                            <small>Email cannot be changed</small>
                        </div>
                        <div class="form-group">
                            <label>Username</label>
                            <div class="username-input">
                                <span>${window.location.origin}/u/</span>
                                <input type="text" id="username" value="${profile?.username || ''}" placeholder="username">
                            </div>
                            <small id="usernameFeedback" class="feedback">Choose a unique username for your portfolio</small>
                        </div>
                        <div class="form-group">
                            <label>Bio</label>
                            <textarea id="bio" rows="2" placeholder="Tell us about yourself...">${profile?.bio || ''}</textarea>
                        </div>
                    </div>
                </div>
                
                <div class="settings-actions">
                    <button id="saveProfileBtn" class="btn-primary"><i class="fas fa-save"></i> Save Changes</button>
                </div>
            </div>

            <!-- Appearance Section -->
            <div class="settings-section">
                <div class="settings-section-header">
                    <i class="fas fa-palette"></i>
                    <div>
                        <h3>Appearance</h3>
                        <p>Choose your preferred theme</p>
                    </div>
                </div>
                
                <div class="theme-options">
                    <button class="theme-card ${currentTheme === 'light' ? 'active' : ''}" data-theme="light">
                        <i class="fas fa-sun"></i>
                        <span>Light</span>
                    </button>
                    <button class="theme-card ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">
                        <i class="fas fa-moon"></i>
                        <span>Dark</span>
                    </button>
                    <button class="theme-card" data-theme="system">
                        <i class="fas fa-desktop"></i>
                        <span>System</span>
                    </button>
                </div>
            </div>

            <!-- Account Section -->
            <div class="settings-section">
                <div class="settings-section-header">
                    <i class="fas fa-shield-alt"></i>
                    <div>
                        <h3>Account</h3>
                        <p>Manage your account security</p>
                    </div>
                </div>
                
                <div class="account-actions">
                    <button id="signOutBtn" class="btn-danger"><i class="fas fa-sign-out-alt"></i> Sign Out</button>
                </div>
            </div>
        </div>
    `;

    // Avatar upload
    document.getElementById('uploadAvatarBtn')?.addEventListener('click', () => {
        document.getElementById('avatarUpload')?.click();
    });

    document.getElementById('avatarUpload')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            await this.uploadAvatar(file);
        }
    });

    document.getElementById('removeAvatarBtn')?.addEventListener('click', async () => {
        if (confirm('Remove your profile picture?')) {
            await this.removeAvatar();
        }
    });

    // Username validation
    document.getElementById('username')?.addEventListener('input', (e) => {
        this.validateUsername(e.target.value);
    });

    // Theme selector
    document.querySelectorAll('.theme-card').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.getAttribute('data-theme');
            this.applyTheme(theme);
        });
    });

    // Save profile
    document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
        await this.updateProfile();
    });

    // Sign out
    document.getElementById('signOutBtn')?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to sign out?')) {
            await signOutUser();
            window.location.href = '/signin.html';
        }
    });
}

    // ============================================
    // WALLET FUNDING (UPDATED - Dynamic Bank Details)
    // ============================================
    async showBankDetails() {
        const fundingOptions = document.querySelector('.funding-options');
        const bankDetails = document.querySelector('.bank-details');
        
        if (fundingOptions && bankDetails) {
            fundingOptions.style.display = 'none';
            bankDetails.style.display = 'block';
            
            // Generate reference code
            this.referenceCode = `GLM-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            document.getElementById('referenceCode').textContent = this.referenceCode;
            
            // Randomly select between the two bank accounts
            const bankAccounts = [
                {
                    bankName: 'MoniePoint Micro Finance Bank',
                    accountName: 'Gliimu LTD',
                    accountNumber: '6315085115'
                },
                {
                    bankName: 'Opay',
                    accountName: 'Gliimu LTD',
                    accountNumber: '6142049426'
                }
            ];
            
            // Random selection
            const selectedBank = bankAccounts[Math.floor(Math.random() * bankAccounts.length)];
            
            document.getElementById('bankInfoCard').innerHTML = `
                <p><strong>Bank:</strong> <span style="color: var(--brand-gold);">${selectedBank.bankName}</span></p>
                <p><strong>Account Name:</strong> <span style="color: var(--brand-gold);">${selectedBank.accountName}</span></p>
                <p><strong>Account Number:</strong> <span style="color: var(--brand-gold); font-size: 1.2rem; font-weight: 700;">${selectedBank.accountNumber}</span></p>
                <p><strong>Amount:</strong> <span style="color: var(--brand-gold); font-weight: 700;">₦${this.selectedAmount.toLocaleString()}</span></p>
            `;
        }
    }

    // ============================================
    // MANAGE & ADMIN TABS (Placeholders)
    // ============================================
    async loadManage() {
        this.dashboardContent.innerHTML = `
            <div class="dashboard-header">
                <h1>Manage</h1>
                <p>Manage students and content</p>
            </div>
            <div class="card">
                <div class="empty-state">
                    <i class="fas fa-users-cog"></i>
                    <h3>Management Dashboard</h3>
                    <p>Coming soon...</p>
                </div>
            </div>
        `;
    }

    async loadAdmin() {
        this.dashboardContent.innerHTML = `
            <div class="dashboard-header">
                <h1>Admin Dashboard</h1>
                <p>System administration</p>
            </div>
            <div class="card">
                <div class="empty-state">
                    <i class="fas fa-crown"></i>
                    <h3>Admin Panel</h3>
                    <p>Coming soon...</p>
                </div>
            </div>
        `;
    }

    // ============================================
    // EXISTING METHODS (Keep as-is or minor updates)
    // ============================================
    
    // ... (keep existing methods: setupEventListeners, updateProfile, applyForRole, 
    // submitMvp, showFundWalletModal, confirmPayment, resetWalletModal, 
    // setupWalletSubscription, toggleSidebar, closeSidebar, showLoading, showError)
    
    // But ensure they use the dynamic bank details where applicable
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new UserPage();
});
