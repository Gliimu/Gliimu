// ============================================
// PAGE: USER PROFILE
// Path: /frontend/js/pages/user.js
// Purpose: Handles user profile page and dashboard
// ============================================

// ✅ FIXED: Import individual functions instead of 'auth' object
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
    getUserPayments
} from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

export class UserPage {
    constructor() {
        this.currentUser = null;
        this.currentProfile = null;
        this.userInfoDiv = document.getElementById('userInfo');
        this.profileForm = document.getElementById('profileForm');
        this.loadingDiv = document.getElementById('loading');
        this.walletDisplay = document.getElementById('walletBalance');
        this.gpDisplay = document.getElementById('gpPoints');
        this.dashboardContent = document.getElementById('dashboardContent');
        
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
            
            // Get current user from auth
            const user = await getAuthUser();
            
            if (!user) {
                this.showError('User not authenticated');
                window.location.href = '/signin.html';
                return;
            }

            this.currentUser = user;

            // Get user profile from CLEAN table
            const profile = await getUserProfile(user.id);
            
            if (!profile) {
                this.showError('User profile not found');
                return;
            }

            this.currentProfile = profile;

            // Update UI with user data
            this.updateUserUI(user, profile);
            this.updateWalletDisplay(profile.wallet_balance);
            this.updateGpDisplay(profile.gp_points);
            
            // Store user in localStorage for persistence
            localStorage.setItem('glimu_user', JSON.stringify({
                id: user.id,
                name: profile.name,
                email: user.email,
                username: profile.username,
                role: profile.role || 'user',
                walletBalance: profile.wallet_balance || 25000,
                gpPoints: profile.gp_points || 0,
                avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=fbb040&color=fff`
            }));
            
            this.showLoading(false);
        } catch (error) {
            console.error('Error loading user data:', error);
            this.showError('Failed to load user data');
            this.showLoading(false);
        }
    }

    updateUserUI(user, profile) {
        // Update sidebar user info
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

        // Update role stylesheet
        const roleStylesheet = document.getElementById('roleStylesheet');
        if (roleStylesheet) {
            const role = profile.role || 'student';
            roleStylesheet.href = `/frontend/css/user-${role}.css`;
        }
    }

    updateWalletDisplay(balance) {
        const walletDisplay = document.getElementById('walletBalance');
        if (walletDisplay) {
            walletDisplay.textContent = `₦${(balance || 0).toLocaleString()}`;
        }
        // Also update any other wallet displays
        document.querySelectorAll('.wallet-amount').forEach(el => {
            el.textContent = `₦${(balance || 0).toLocaleString()}`;
        });
    }

    updateGpDisplay(points) {
        const gpDisplay = document.getElementById('gpPoints');
        if (gpDisplay) {
            gpDisplay.textContent = (points || 0).toLocaleString();
        }
        document.querySelectorAll('.gp-amount').forEach(el => {
            el.textContent = (points || 0).toLocaleString();
        });
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
                    // Toggle sidebar on mobile
                    this.toggleSidebar();
                    return;
                }
                this.loadTab(tab);
            });
        });

        // Sidebar toggle for mobile
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        }

        // Sidebar overlay
        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeSidebar());
        }
    }

    getNavItems() {
        const role = this.currentProfile?.role || 'student';
        const items = [
            { tab: 'dashboard', icon: 'fa-tachometer-alt', label: 'Dashboard' },
            { tab: 'alerts', icon: 'fa-bell', label: 'Alerts' },
            { tab: 'library', icon: 'fa-book', label: 'Library' },
            { tab: 'marketplace', icon: 'fa-store', label: 'Marketplace' },
            { tab: 'wallet', icon: 'fa-wallet', label: 'Wallet' },
        ];

        // Role-specific items
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
            case 'library':
                await this.loadLibrary();
                break;
            case 'marketplace':
                await this.loadMarketplace();
                break;
            case 'alerts':
                await this.loadAlerts();
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

        // Close sidebar on mobile after navigation
        this.closeSidebar();
    }

    async loadDashboard() {
        const content = this.dashboardContent;
        if (!content) return;

        const profile = this.currentProfile;
        const user = this.currentUser;

        content.innerHTML = `
            <div class="dashboard-header">
                <h1>Dashboard</h1>
                <p>Welcome back, ${profile?.name || 'User'}!</p>
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
                </div>
                <div class="stat-card">
                    <div class="stat-icon gp-icon">
                        <i class="fas fa-star"></i>
                    </div>
                    <div class="stat-info">
                        <h3>GP Points</h3>
                        <p class="stat-value" id="gpPoints">${(profile?.gp_points || 0).toLocaleString()}</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon role-icon">
                        <i class="fas fa-user-tag"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Role</h3>
                        <p class="stat-value">${profile?.role || 'Student'}</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon status-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Status</h3>
                        <p class="stat-value">${profile?.application_status === 'pending' ? '⏳ Pending' : 
                            profile?.application_status === 'approved' ? '✅ Approved' : 
                            profile?.application_status === 'rejected' ? '❌ Rejected' : 
                            'Active'}</p>
                    </div>
                </div>
            </div>

            <div class="dashboard-grid">
                <div class="card">
                    <h3>Quick Actions</h3>
                    <div class="quick-actions">
                        <button class="action-btn" onclick="window.loadTab('wallet')">
                            <i class="fas fa-plus-circle"></i>
                            Fund Wallet
                        </button>
                        <button class="action-btn" id="applyRoleBtn">
                            <i class="fas fa-user-graduate"></i>
                            Apply for Role
                        </button>
                        <button class="action-btn" id="mvpProposalBtn">
                            <i class="fas fa-rocket"></i>
                            Submit MVP
                        </button>
                    </div>
                </div>

                <div class="card">
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

        // Re-bind event listeners
        document.getElementById('applyRoleBtn')?.addEventListener('click', () => this.showApplyRoleModal());
        document.getElementById('mvpProposalBtn')?.addEventListener('click', () => this.showMvpModal());
        
        // Load recent activity
        await this.loadRecentActivity();
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

    async loadWallet() {
        const content = this.dashboardContent;
        if (!content) return;

        const profile = this.currentProfile;

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
                    <p class="gp-amount-large">${(profile?.gp_points || 0).toLocaleString()}</p>
                    <span class="gp-label">Earn more by completing tasks!</span>
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

    async loadLibrary() {
        const content = this.dashboardContent;
        if (!content) return;

        content.innerHTML = `
            <div class="dashboard-header">
                <h1>My Library</h1>
                <p>Your saved and created content</p>
            </div>
            <div class="card">
                <p class="text-muted">Coming soon...</p>
            </div>
        `;
    }

    async loadMarketplace() {
        const content = this.dashboardContent;
        if (!content) return;

        content.innerHTML = `
            <div class="dashboard-header">
                <h1>Marketplace</h1>
                <p>Discover and share resources</p>
            </div>
            <div class="card">
                <p class="text-muted">Coming soon...</p>
            </div>
        `;
    }

    async loadAlerts() {
        const content = this.dashboardContent;
        if (!content) return;

        content.innerHTML = `
            <div class="dashboard-header">
                <h1>Alerts & Notifications</h1>
                <p>Stay updated with your activities</p>
            </div>
            <div class="card">
                <p class="text-muted">No new alerts</p>
            </div>
        `;
    }

    async loadSettings() {
        const content = this.dashboardContent;
        if (!content) return;

        const profile = this.currentProfile;

        content.innerHTML = `
            <div class="dashboard-header">
                <h1>Profile Settings</h1>
                <p>Manage your account information</p>
            </div>

            <div class="card">
                <form id="profileForm">
                    <div class="form-group">
                        <label for="fullName">Full Name</label>
                        <input type="text" id="fullName" value="${profile?.name || ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="email">Email</label>
                        <input type="email" id="email" value="${this.currentUser?.email || ''}" disabled>
                        <small class="text-muted">Email cannot be changed</small>
                    </div>
                    <div class="form-group">
                        <label for="username">Username</label>
                        <input type="text" id="username" value="${profile?.username || ''}" disabled>
                        <small class="text-muted">Username cannot be changed</small>
                    </div>
                    <div class="form-group">
                        <label for="address">Address</label>
                        <input type="text" id="address" value="${profile?.address || ''}">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="birthDay">Birth Day</label>
                            <select id="birthDay">
                                <option value="">Select Day</option>
                                ${Array.from({length: 31}, (_, i) => i + 1).map(d => 
                                    `<option value="${d}" ${profile?.birth_day == d ? 'selected' : ''}>${d}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="birthMonth">Birth Month</label>
                            <select id="birthMonth">
                                <option value="">Select Month</option>
                                ${['January', 'February', 'March', 'April', 'May', 'June', 
                                  'July', 'August', 'September', 'October', 'November', 'December']
                                    .map((m, i) => `<option value="${i + 1}" ${profile?.birth_month == i + 1 ? 'selected' : ''}>${m}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <button type="submit" class="btn-primary">Update Profile</button>
                </form>
            </div>

            <div class="card">
                <h3>Account Actions</h3>
                <button class="btn-danger" id="signOutBtn">
                    <i class="fas fa-sign-out-alt"></i> Sign Out
                </button>
            </div>
        `;

        document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.updateProfile();
        });

        document.getElementById('signOutBtn')?.addEventListener('click', async () => {
            if (confirm('Are you sure you want to sign out?')) {
                await signOutUser();
                window.location.href = '/signin.html';
            }
        });
    }

    async loadManage() {
        const content = this.dashboardContent;
        if (!content) return;

        content.innerHTML = `
            <div class="dashboard-header">
                <h1>Manage</h1>
                <p>Manage students and content</p>
            </div>
            <div class="card">
                <p class="text-muted">Coming soon...</p>
            </div>
        `;
    }

    async loadAdmin() {
        const content = this.dashboardContent;
        if (!content) return;

        content.innerHTML = `
            <div class="dashboard-header">
                <h1>Admin Dashboard</h1>
                <p>System administration</p>
            </div>
            <div class="card">
                <p class="text-muted">Coming soon...</p>
            </div>
        `;
    }

    setupEventListeners() {
        // Profile form submission
        document.addEventListener('submit', async (e) => {
            if (e.target.id === 'profileForm') {
                e.preventDefault();
                await this.updateProfile();
            }
        });

        // Apply for role buttons
        document.addEventListener('click', async (e) => {
            if (e.target.classList.contains('apply-role-btn')) {
                const role = e.target.dataset.role;
                await this.applyForRole(role);
            }
        });

        // Window resize for sidebar
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                this.closeSidebar();
            }
        });
    }

    async updateProfile() {
        try {
            const fullName = document.getElementById('fullName')?.value.trim();
            const address = document.getElementById('address')?.value.trim();
            const birthDay = document.getElementById('birthDay')?.value;
            const birthMonth = document.getElementById('birthMonth')?.value;
            
            if (!fullName) {
                showToast('Full name is required', 'error');
                return;
            }

            const result = await updateUserProfile({
                name: fullName,
                address: address || '',
                birth_day: birthDay || null,
                birth_month: birthMonth || null,
                updated_at: new Date().toISOString()
            });

            if (!result) {
                throw new Error('Failed to update profile');
            }

            // Update auth user metadata
            const { error: authError } = await supabase.auth.updateUser({
                data: { 
                    name: fullName,
                    full_name: fullName
                }
            });

            if (authError) throw authError;

            showToast('Profile updated successfully!', 'success');
            
            // Reload user data
            await this.loadUserData();
            
        } catch (error) {
            console.error('Error updating profile:', error);
            showToast('Failed to update profile: ' + error.message, 'error');
        }
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
            } else {
                showToast(result.error || 'Failed to submit application', 'error');
            }
        } catch (error) {
            console.error('Error applying for role:', error);
            showToast('Failed to submit application', 'error');
        }
    }

    showApplyRoleModal() {
        // Simple role selection modal
        const roles = ['student', 'instructor', 'other'];
        const roleOptions = roles.map(r => 
            `<button class="apply-role-btn" data-role="${r}">Apply as ${r.charAt(0).toUpperCase() + r.slice(1)}</button>`
        ).join('');

        // Create a simple modal
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Apply for a Role</h2>
                    <button class="modal-close" id="closeRoleModal">&times;</button>
                </div>
                <div class="modal-body">
                    <p>Select the role you want to apply for:</p>
                    <div class="role-options">
                        ${roleOptions}
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

    showMvpModal() {
        const modal = document.getElementById('mvpModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
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

    resetWalletModal() {
        document.querySelector('.funding-options').style.display = 'block';
        document.querySelector('.bank-details').style.display = 'none';
        document.getElementById('selectedAmountDisplay').style.display = 'none';
        document.getElementById('customAmount').value = '';
        document.querySelectorAll('.amount-btn').forEach(btn => btn.classList.remove('selected'));
        this.selectedAmount = 0;
    }

    setupWalletSubscription() {
        // Use real-time subscription for wallet updates
        const channel = supabase
            .channel('wallet_updates')
            .on('postgres_changes', 
                { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'user_profiles',
                    filter: `id=eq.${this.currentUser?.id}` 
                },
                (payload) => {
                    if (payload.new) {
                        this.updateWalletDisplay(payload.new.wallet_balance);
                        this.updateGpDisplay(payload.new.gp_points);
                        // Update current profile
                        if (this.currentProfile) {
                            this.currentProfile.wallet_balance = payload.new.wallet_balance;
                            this.currentProfile.gp_points = payload.new.gp_points;
                        }
                    }
                }
            )
            .subscribe();
    }

    toggleSidebar() {
        const sidebar = document.getElementById('dashboardSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) {
            sidebar.classList.toggle('active');
            if (overlay) {
                overlay.classList.toggle('active');
            }
        }
    }

    closeSidebar() {
        const sidebar = document.getElementById('dashboardSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) {
            sidebar.classList.remove('active');
            if (overlay) {
                overlay.classList.remove('active');
            }
        }
    }

    showLoading(show) {
        const loadingDiv = document.getElementById('loading');
        if (loadingDiv) {
            loadingDiv.style.display = show ? 'flex' : 'none';
        }
        // Also show/hide main content
        const content = document.getElementById('dashboardContent');
        if (content) {
            content.style.opacity = show ? '0.5' : '1';
            content.style.pointerEvents = show ? 'none' : 'auto';
        }
    }

    showError(message) {
        showToast(message, 'error');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Make loadTab available globally for onclick handlers
    const page = new UserPage();
    window.loadTab = (tab) => page.loadTab(tab);
});
