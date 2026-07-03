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
    getUserPayments
} from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

export class UserPage {
    constructor() {
        this.currentUser = null;
        this.currentProfile = null;
        this.dashboardContent = document.getElementById('dashboardContent');
        this.loadingDiv = document.getElementById('loading');
        this.currentTab = 'dashboard';
        
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

    // ✅ NEW: Update role stylesheet
    updateRoleStylesheet(role) {
        const roleStylesheet = document.getElementById('roleStylesheet');
        if (roleStylesheet) {
            const roleMap = {
                'student': 'student',
                'instructor': 'instructor',
                'admin': 'instructor',
                'partner': 'partner',
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

    getNavItems() {
        const role = this.currentProfile?.role || 'student';
        const items = [
            { tab: 'dashboard', icon: 'fa-tachometer-alt', label: 'Dashboard' },
            { tab: 'alerts', icon: 'fa-bell', label: 'Alerts' },
            { tab: 'library', icon: 'fa-book', label: 'Library' },
            { tab: 'marketplace', icon: 'fa-store', label: 'Marketplace' },
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
                        <button class="action-btn" data-action="wallet">
                            <i class="fas fa-plus-circle"></i>
                            Fund Wallet
                        </button>
                        <button class="action-btn" data-action="role">
                            <i class="fas fa-user-graduate"></i>
                            Apply for Role
                        </button>
                        <button class="action-btn" data-action="mvp">
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
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                if (action === 'wallet') this.showFundWalletModal();
                else if (action === 'role') this.showApplyRoleModal();
                else if (action === 'mvp') this.showMvpModal();
            });
        });

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
        this.dashboardContent.innerHTML = `
            <div class="dashboard-header">
                <h1>My Library</h1>
                <p>Your saved and created content</p>
            </div>
            <div class="card">
                <div class="empty-state">
                    <i class="fas fa-book"></i>
                    <h3>Your Library is Empty</h3>
                    <p>Start saving content from the marketplace or create your own!</p>
                </div>
            </div>
        `;
    }

    async loadMarketplace() {
        this.dashboardContent.innerHTML = `
            <div class="dashboard-header">
                <h1>Marketplace</h1>
                <p>Discover and share resources</p>
            </div>
            <div class="card">
                <div class="empty-state">
                    <i class="fas fa-store"></i>
                    <h3>Marketplace Coming Soon</h3>
                    <p>We're building a marketplace for creators like you!</p>
                </div>
            </div>
        `;
    }

    async loadAlerts() {
        this.dashboardContent.innerHTML = `
            <div class="dashboard-header">
                <h1>Alerts & Notifications</h1>
                <p>Stay updated with your activities</p>
            </div>
            <div class="card">
                <div class="empty-state">
                    <i class="fas fa-bell"></i>
                    <h3>No New Alerts</h3>
                    <p>You're all caught up!</p>
                </div>
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

            <div class="settings-grid">
                <div class="settings-card">
                    <h3>Personal Information</h3>
                    <form id="profileForm">
                        <div class="form-group">
                            <label for="fullName">Full Name</label>
                            <input type="text" id="fullName" value="${profile?.name || ''}" required>
                        </div>
                        <div class="form-group">
                            <label for="email">Email</label>
                            <input type="email" id="email" value="${this.currentUser?.email || ''}" disabled>
                            <small>Email cannot be changed</small>
                        </div>
                        <div class="form-group">
                            <label for="username">Username</label>
                            <input type="text" id="username" value="${profile?.username || ''}" disabled>
                            <small>Username cannot be changed</small>
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

                <div class="settings-card">
                    <h3>Account Actions</h3>
                    <button class="btn-danger" id="signOutBtn" style="width:100%;">
                        <i class="fas fa-sign-out-alt"></i> Sign Out
                    </button>
                </div>
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

    async showBankDetails() {
        const fundingOptions = document.querySelector('.funding-options');
        const bankDetails = document.querySelector('.bank-details');
        
        if (fundingOptions && bankDetails) {
            fundingOptions.style.display = 'none';
            bankDetails.style.display = 'block';
            
            // Generate reference code
            this.referenceCode = `GLM-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            document.getElementById('referenceCode').textContent = this.referenceCode;
            
            // Show bank info
            document.getElementById('bankInfoCard').innerHTML = `
                <p><strong>Bank:</strong> <span style="color: var(--brand-gold);">GTBank</span></p>
                <p><strong>Account Name:</strong> <span style="color: var(--brand-gold);">Gliimu Institute Ltd</span></p>
                <p><strong>Account Number:</strong> <span style="color: var(--brand-gold); font-size: 1.1rem; font-weight: 700;">0123456789</span></p>
                <p><strong>Amount:</strong> <span style="color: var(--brand-gold); font-weight: 700;">₦${this.selectedAmount.toLocaleString()}</span></p>
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

    showApplyRoleModal() {
        const roles = ['student', 'instructor', 'partner'];
        const roleLabels = {
            'student': 'Student (Learn & Build)',
            'instructor': 'Instructor (Teach & Mentor)',
            'partner': 'Partner (Collaborate & Grow)'
        };

        // Create modal dynamically
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

    showMvpModal() {
        const modal = document.getElementById('mvpModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
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

    showFundWalletModal() {
        const modal = document.getElementById('fundWalletModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            this.resetWalletModal();
        }
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new UserPage();
});
