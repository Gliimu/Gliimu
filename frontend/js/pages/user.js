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
        this.usernameValid = true;
        
        // Wallet state
        this.selectedAmount = 0;
        this.referenceCode = '';
        
        this.init();
    }

    async init() {
        try {
            const session = await getCurrentSession();
            if (!session) {
                window.location.href = '/signin.html';
                return;
            }

            await this.loadUserData();
            await this.loadBankDetails();
            this.setupEventListeners();
            this.setupWalletSubscription();
            this.setupNavigation();
            
            this.loadTab('dashboard');
            
        } catch (error) {
            console.error('Init error:', error);
            this.showError('Failed to initialize dashboard');
        }
    }

    // ============================================
    // LOAD USER DATA
    // ============================================
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
            this.updateRoleStylesheet(profile.role || 'student');
            this.updateUserUI(user, profile);
            
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
            this.bankDetails = {
                bankName: 'MoniePoint Micro Finance Bank',
                accountName: 'Gliimu LTD',
                accountNumber: '6315085115'
            };
        }
    }

    async loadLeaderboard() {
        try {
            this.leaderboardData = await getIndividualLeaderboard(5);
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            this.leaderboardData = [];
        }
    }

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

    async getReferralsCount(userId) {
        try {
            const count = await getReferralCount(userId);
            return count;
        } catch (error) {
            console.error('Error getting referrals:', error);
            return 0;
        }
    }

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

    // ============================================
    // NAVIGATION
    // ============================================
    setupNavigation() {
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

        document.querySelectorAll('.mobile-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const tab = item.dataset.tab;
                this.loadTab(tab);
                this.closeSidebar();
            });
        });

        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeSidebar());
        }
    }

    getNavItems() {
        const role = this.currentProfile?.role || 'student';
        const items = [
            { tab: 'dashboard', icon: 'fa-tachometer-alt', label: 'Overview' },
            { tab: 'messages', icon: 'fa-envelope', label: 'Messages' },
            { tab: 'portfolio', icon: 'fa-user-circle', label: 'Portfolio' },
            { tab: 'wallet', icon: 'fa-wallet', label: 'Wallet' },
        ];

        if (role === 'instructor' || role === 'admin') {
            items.push({ tab: 'manage', icon: 'fa-users-cog', label: 'Manage' });
        }

        if (role === 'admin') {
            items.push({ tab: 'admin', icon: 'fa-crown', label: 'Admin' });
        }

        items.push({ tab: 'settings', icon: 'fa-cog', label: 'Settings' });

        return items.map(item => `
            <button class="nav-item" data-tab="${item.tab}">
                <i class="fas ${item.icon}"></i>
                <span>${item.label}</span>
            </button>
        `).join('');
    }

    async loadTab(tab) {
        this.currentTab = tab;
        
        document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.tab === tab) {
                el.classList.add('active');
            }
        });

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
            case 'portfolio':
                await this.loadPortfolio();
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
    // DASHBOARD / OVERVIEW TAB
    // ============================================
    async loadDashboard() {
        const content = this.dashboardContent;
        if (!content) return;

        const profile = this.currentProfile;
        const user = this.currentUser;
        
        const submissionsCount = await this.getSubmissionsCount(user.id);
        const referralsCount = await this.getReferralsCount(user.id);
        
        const progressData = await getStudentProgress(user.id);
        const progress = progressData?.progress || 0;
        const badge = progressData?.currentBadge || { name: 'Starter', icon: '🌱', color: '#10b981' };
        const currentGP = progressData?.currentGP || 0;
        const totalStars = progressData?.totalStars || 0;

        content.innerHTML = `
            <div class="dashboard-header">
                <div>
                    <h1>Overview</h1>
                    <p>Welcome back, ${profile?.name || 'User'}!</p>
                </div>
                <div class="header-badge">
                    <span class="badge-icon">${badge.icon}</span>
                    <span class="badge-name" style="color: ${badge.color}">${badge.name}</span>
                </div>
            </div>

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

            <div class="dashboard-grid">
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

                <div class="card recent-activity-card">
                    <h3>Recent Activity</h3>
                    <div id="recentActivity">
                        <p class="text-muted">Loading activities...</p>
                    </div>
                </div>
            </div>

            ${profile?.application_status === 'pending' ? `
                <div class="alert alert-warning">
                    <i class="fas fa-clock"></i>
                    Your application for <strong>${profile.applied_role}</strong> is pending review.
                </div>
            ` : ''}
        `;

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
// RECENT ACTIVITY - With Error Handling
// ============================================
async loadRecentActivity() {
    const container = document.getElementById('recentActivity');
    if (!container) return;

    try {
        let activitiesResult = { data: [], error: null };
        
        // Try to fetch user activity, but don't fail if table doesn't exist
        try {
            activitiesResult = await supabase
                .from('user_activity')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('created_at', { ascending: false })
                .limit(10);
        } catch (e) {
            // Table doesn't exist, just use empty data
            console.warn('user_activity table not found, using empty data');
        }

        const transactions = await getUserTransactions();
        const paymentRequests = await this.getPaymentRequests(this.currentUser.id);

        let allActivities = [];

        // Add user activities if available
        if (activitiesResult.data && activitiesResult.data.length > 0) {
            allActivities = allActivities.concat(activitiesResult.data.map(a => ({
                ...a,
                type: 'activity',
                display_type: a.activity_type,
                date: a.created_at,
                icon: this.getActivityIcon(a.activity_type),
                iconClass: this.getActivityIconClass(a.activity_type),
                description: this.getActivityDescription(a.activity_type, a.gp_earned),
                gpEarned: a.gp_earned
            })));
        }

        // Add transactions
        if (transactions && transactions.length > 0) {
            allActivities = allActivities.concat(transactions.slice(0, 5).map(tx => ({
                ...tx,
                type: 'transaction',
                display_type: tx.type,
                date: tx.created_at,
                icon: tx.type === 'credit' ? 'fa-arrow-down' : 'fa-arrow-up',
                iconClass: tx.type === 'credit' ? 'credit' : 'debit',
                description: tx.description || `${tx.type === 'credit' ? 'Received' : 'Spent'} funds`,
                amount: tx.amount
            })));
        }

        // Add payment requests
        if (paymentRequests && paymentRequests.length > 0) {
            allActivities = allActivities.concat(paymentRequests.slice(0, 3).map(p => ({
                ...p,
                type: 'payment_request',
                display_type: p.status,
                date: p.submitted_at,
                icon: p.status === 'approved' ? 'fa-check-circle' : 
                      p.status === 'rejected' ? 'fa-times-circle' : 'fa-clock',
                iconClass: p.status === 'approved' ? 'credit' : 
                            p.status === 'rejected' ? 'debit' : 'pending',
                description: `Wallet funding request ${p.status === 'pending' ? 'submitted' : p.status}`,
                amount: p.amount
            })));
        }

        // Sort by date (newest first)
        allActivities.sort((a, b) => new Date(b.date) - new Date(a.date));
        const recent = allActivities.slice(0, 8);

        if (recent.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No recent activity yet</p>
                    <small>Start engaging with the community!</small>
                </div>
            `;
            return;
        }

        container.innerHTML = recent.map(item => {
            let amountDisplay = '';
            let statusDisplay = '';
            let gpDisplay = '';

            if (item.type === 'activity') {
                if (item.gpEarned) {
                    gpDisplay = `<span class="activity-gp">+${item.gpEarned} GP</span>`;
                }
            } else if (item.type === 'transaction') {
                const prefix = item.display_type === 'credit' ? '+' : '';
                amountDisplay = `${prefix}₦${(item.amount || 0).toLocaleString()}`;
            } else if (item.type === 'payment_request') {
                amountDisplay = `₦${(item.amount || 0).toLocaleString()}`;
                const statusMap = {
                    'pending': '⏳ Pending',
                    'approved': '✅ Approved',
                    'rejected': '❌ Rejected'
                };
                statusDisplay = `<span class="activity-status ${item.display_type}">${statusMap[item.display_type] || item.display_type}</span>";
            }

            return `
                <div class="activity-item">
                    <div class="activity-icon ${item.iconClass}">
                        <i class="fas ${item.icon}"></i>
                    </div>
                    <div class="activity-details">
                        <p class="activity-description">${item.description}</p>
                        <span class="activity-date">${this.getTimeAgo(item.date)}</span>
                        ${statusDisplay}
                        ${gpDisplay}
                    </div>
                    ${amountDisplay ? `<div class="activity-amount ${item.iconClass}">${amountDisplay}</div>` : ''}
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading activity:', error);
        container.innerHTML = '<p class="text-muted">Failed to load activity</p>';
    }
}

    // ============================================
    // ACTIVITY HELPERS
    // ============================================
    getActivityIcon(type) {
        const icons = {
            'heart_received': 'fa-heart',
            'comment': 'fa-comment',
            'share': 'fa-share-alt',
            'read': 'fa-book-open',
            'submission_graded': 'fa-check-circle',
            'streak_bonus': 'fa-fire',
            'referral': 'fa-user-plus',
            'default': 'fa-bolt'
        };
        return icons[type] || icons.default;
    }

    getActivityIconClass(type) {
        const classes = {
            'heart_received': 'heart',
            'comment': 'comment',
            'share': 'share',
            'read': 'read',
            'submission_graded': 'graded',
            'streak_bonus': 'streak',
            'referral': 'referral',
            'default': 'default'
        };
        return classes[type] || classes.default;
    }

    getActivityDescription(type, gpEarned) {
        const descriptions = {
            'heart_received': 'Someone ❤️ your post!',
            'comment': 'You commented on a post',
            'share': 'You shared content',
            'read': 'You read a book/article',
            'submission_graded': 'Your submission was graded',
            'streak_bonus': `🔥 Streak bonus! +${gpEarned || 0} GP`,
            'referral': 'Someone joined using your referral link',
            'default': 'You earned GP'
        };
        return descriptions[type] || descriptions.default;
    }

    // ============================================
// GET TIME AGO - FIXED for UTC time
// ============================================
getTimeAgo(date) {
    if (!date) return 'Just now';
    
    // Ensure date is a Date object
    let past;
    if (typeof date === 'string') {
        // Parse the UTC string properly
        past = new Date(date);
    } else if (date instanceof Date) {
        past = date;
    } else {
        return 'Just now';
    }
    
    // Check if date is valid
    if (isNaN(past.getTime())) {
        return 'Just now';
    }
    
    const now = new Date();
    
    // Calculate difference in seconds (UTC-safe)
    const diff = Math.floor((now.getTime() - past.getTime()) / 1000);
    
    // If diff is negative (future date), show 'Just now'
    if (diff < 0) return 'Just now';
    
    // If diff is less than 5 seconds
    if (diff < 5) return 'Just now';
    
    const minutes = Math.floor(diff / 60);
    const hours = Math.floor(diff / 3600);
    const days = Math.floor(diff / 86400);
    const weeks = Math.floor(diff / 604800);
    const months = Math.floor(diff / 2592000);
    const years = Math.floor(diff / 31536000);

    if (diff < 60) return `${diff}s ago`;
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
    // WALLET TAB
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

    // ============================================
    // TRANSACTION HISTORY - Financial Only
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

                if (item.type === 'transaction') {
                    const prefix = item.display_type === 'credit' ? '+' : '';
                    amountDisplay = `${prefix}₦${(item.amount || 0).toLocaleString()}`;
                    const cls = item.display_type === 'credit' ? 'credit' : 'debit';
                    return `
                        <div class="transaction-item">
                            <div class="tx-info">
                                <span class="tx-description">${description}</span>
                                <span class="tx-date">${this.getTimeAgo(new Date(item.date))}</span>
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
                                <span class="tx-date">${this.getTimeAgo(item.date)}</span>
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
    // MESSAGES TAB
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
                        <span class="message-date">${this.getTimeAgo(new Date(msg.created_at))}</span>
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
    // PORTFOLIO TAB
    // ============================================
    async loadPortfolio() {
        const user = this.currentUser;
        const profile = this.currentProfile;
        const username = profile?.username || user?.email?.split('@')[0] || 'user';
        const portfolioUrl = `${window.location.origin}/u/${username}`;

        this.dashboardContent.innerHTML = `
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

    // ============================================
    // SETTINGS TAB
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

        document.getElementById('username')?.addEventListener('input', (e) => {
            this.validateUsername(e.target.value);
        });

        document.querySelectorAll('.theme-card').forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.getAttribute('data-theme');
                this.applyTheme(theme);
            });
        });

        document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
            await this.updateProfile();
        });

        document.getElementById('signOutBtn')?.addEventListener('click', async () => {
            if (confirm('Are you sure you want to sign out?')) {
                await signOutUser();
                window.location.href = '/signin.html';
            }
        });
    }

    // ============================================
    // SETTINGS HELPERS
    // ============================================
    async validateUsername(username) {
        const feedback = document.getElementById('usernameFeedback');
        if (!feedback || !username) return;

        const { data, error } = await supabase
            .from('user_profiles')
            .select('username')
            .eq('username', username)
            .neq('id', this.currentUser.id)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Username validation error:', error);
            return;
        }

        const usernameInput = document.getElementById('username');
        if (data) {
            feedback.className = 'feedback error';
            feedback.textContent = `❌ Username "${username}" is taken. Try: ${username}${Math.floor(Math.random() * 100)}`;
            usernameInput.style.borderColor = '#ef4444';
            this.usernameValid = false;
        } else if (username.length < 3) {
            feedback.className = 'feedback error';
            feedback.textContent = '❌ Username must be at least 3 characters';
            usernameInput.style.borderColor = '#ef4444';
            this.usernameValid = false;
        } else if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            feedback.className = 'feedback error';
            feedback.textContent = '❌ Only letters, numbers, underscores, and hyphens allowed';
            usernameInput.style.borderColor = '#ef4444';
            this.usernameValid = false;
        } else {
            feedback.className = 'feedback success';
            feedback.textContent = `✅ "${username}" is available! Your portfolio: ${window.location.origin}/u/${username}`;
            usernameInput.style.borderColor = '#10b981';
            this.usernameValid = true;
        }
    }

    async uploadAvatar(file) {
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${this.currentUser.id}_${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            const avatarUrl = urlData.publicUrl;

            const { error: updateError } = await supabase
                .from('user_profiles')
                .update({ avatar_url: avatarUrl })
                .eq('id', this.currentUser.id);

            if (updateError) throw updateError;

            document.getElementById('profileAvatarPreview').src = avatarUrl;
            document.getElementById('userAvatarImg').src = avatarUrl;
            
            showToast('Profile picture updated!', 'success');
            await this.loadUserData();

        } catch (error) {
            console.error('Avatar upload error:', error);
            showToast('Failed to upload avatar', 'error');
        }
    }

    async removeAvatar() {
        try {
            const { error } = await supabase
                .from('user_profiles')
                .update({ avatar_url: null })
                .eq('id', this.currentUser.id);

            if (error) throw error;

            const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(this.currentProfile?.name || 'User')}&background=fbb040&color=fff&size=200`;
            document.getElementById('profileAvatarPreview').src = defaultAvatar;
            document.getElementById('userAvatarImg').src = defaultAvatar;
            
            showToast('Profile picture removed', 'success');
            await this.loadUserData();

        } catch (error) {
            console.error('Avatar removal error:', error);
            showToast('Failed to remove avatar', 'error');
        }
    }

    applyTheme(theme) {
        if (theme === 'system') {
            const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (systemPrefersDark) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
            localStorage.setItem('theme', 'system');
        } else if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('theme', 'light');
        }

        document.querySelectorAll('.theme-card').forEach(b => b.classList.remove('active'));
        document.querySelector(`.theme-card[data-theme="${theme}"]`)?.classList.add('active');
        showToast(`${theme.charAt(0).toUpperCase() + theme.slice(1)} mode activated`, 'success');
    }

    async updateProfile() {
        try {
            const fullName = document.getElementById('fullName')?.value.trim();
            const bio = document.getElementById('bio')?.value.trim();
            
            if (!this.usernameValid) {
                showToast('Please choose a valid username', 'error');
                return;
            }
            
            const username = document.getElementById('username')?.value.trim();
            
            if (!fullName) {
                showToast('Full name is required', 'error');
                return;
            }

            const updateData = {
                name: fullName,
                bio: bio || '',
                updated_at: new Date().toISOString()
            };
            
            if (username && username !== this.currentProfile?.username) {
                updateData.username = username;
            }

            const result = await updateUserProfile(updateData);

            if (!result) {
                throw new Error('Failed to update profile');
            }

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
    // ROLE APPLICATION
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
    // CONVERT STARS MODAL
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
                await this.loadUserData();
                await this.loadTab('dashboard');
            }
        });
    }

    // ============================================
    // WALLET FUNDING
    // ============================================
    showFundWalletModal() {
        const modal = document.getElementById('fundWalletModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            this.resetWalletModal();
        }
    }

    async showBankDetails() {
        const fundingOptions = document.querySelector('.funding-options');
        const bankDetails = document.querySelector('.bank-details');
        
        if (fundingOptions && bankDetails) {
            fundingOptions.style.display = 'none';
            bankDetails.style.display = 'block';
            
            const username = this.currentProfile?.username || 'user';
            const randomNum = Math.floor(Math.random() * 9000) + 1000;
            this.referenceCode = `GLM-${username}-${randomNum}`;
            
            document.getElementById('referenceCode').textContent = this.referenceCode;
            
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
            
            const selectedBank = bankAccounts[Math.floor(Math.random() * bankAccounts.length)];
            
            document.getElementById('bankInfoCard').innerHTML = `
                <p><strong>Bank:</strong> <span style="color: var(--brand-gold);">${selectedBank.bankName}</span></p>
                <p><strong>Account Name:</strong> <span style="color: var(--brand-gold);">${selectedBank.accountName}</span></p>
                <p><strong>Account Number:</strong> <span style="color: var(--brand-gold); font-size: 1.2rem; font-weight: 700;">${selectedBank.accountNumber}</span></p>
                <p><strong>Amount:</strong> <span style="color: var(--brand-gold); font-weight: 700;">₦${this.selectedAmount.toLocaleString()}</span></p>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
                    <i class="fas fa-info-circle"></i> Use <strong style="color: var(--brand-gold);">${this.referenceCode}</strong> as transaction narration
                </p>
            `;
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

    async confirmPayment() {
        try {
            const btn = document.getElementById('confirmPaymentBtn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                showToast('Please login first', 'error');
                return;
            }

            const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .select('name, email, username')
                .eq('id', user.id)
                .single();

            if (profileError) {
                console.error('Error fetching profile:', profileError);
            }

            const bankInfo = document.getElementById('bankInfoCard');
            let bankName = 'Opay';
            if (bankInfo) {
                const bankMatch = bankInfo.innerHTML.match(/Bank:<\/strong> <span[^>]*>([^<]*)<\/span>/);
                if (bankMatch && bankMatch[1]) {
                    bankName = bankMatch[1].trim();
                }
            }

            const username = profile?.username || 'user';
            const randomNum = Math.floor(Math.random() * 9000) + 1000;
            const referenceCode = `GLM-${username}-${randomNum}`;
            const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

            const { data, error } = await supabase
                .from('payment_requests')
                .insert([{
                    id: paymentId,
                    user_id: user.id,
                    user_name: profile?.name || 'User',
                    user_email: profile?.email || user.email,
                    amount: this.selectedAmount,
                    bank: bankName,
                    reference_code: referenceCode,
                    status: 'pending',
                    submitted_at: new Date().toISOString()
                }])
                .select();

            if (error) {
                console.error('❌ Error creating payment request:', error);
                showToast('Failed to submit payment: ' + error.message, 'error');
                return;
            }

            showToast(`💰 Payment request submitted! Use code: ${referenceCode} as narration`, 'success');
            
            this.resetWalletModal();
            document.getElementById('fundWalletModal').classList.remove('active');
            document.body.style.overflow = '';
            
            await this.loadWallet();
            
        } catch (error) {
            console.error('❌ Payment error:', error);
            showToast('Failed to submit payment: ' + error.message, 'error');
        } finally {
            const btn = document.getElementById('confirmPaymentBtn');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '✅ I Have Made Payment';
            }
        }
    }

    // ============================================
    // MANAGE & ADMIN TABS
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
    // UTILITY METHODS
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

    setupEventListeners() {
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal');
                if (modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        });

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        });

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

        document.getElementById('mvpForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.submitMvp();
        });
    }

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

            showToast('MVP proposal submitted successfully!', 'success');
            
            const modal = document.getElementById('mvpModal');
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
            
            document.getElementById('mvpForm')?.reset();
            
        } catch (error) {
            console.error('MVP submission error:', error);
            showToast('Failed to submit MVP proposal', 'error');
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new UserPage();
});
