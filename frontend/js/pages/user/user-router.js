// ============================================
// USER ROUTER - Entry Point
// Path: /frontend/js/pages/user/user-router.js
// Purpose: Checks authentication, role, and loads appropriate dashboard
// ============================================

import { 
    getCurrentUser as getAuthUser,
    signOutUser,
    getCurrentSession
} from '../../modules/auth.js';
import { 
    supabase, 
    getUserProfile
} from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';
import { initTheme } from './user-theme.js';
import { initializeAlerts, addInitialAlerts, subscribeToAlerts } from './user-alert.js';
import { initSettings } from './user-settings.js';
import { initStickyNav, setupStickyNavFunctions } from './user-dashboard.js';

// ============================================
// USER ROUTER CLASS
// ============================================
export class UserRouter {
    constructor() {
        this.currentUser = null;
        this.currentProfile = null;
        this.dashboardContent = document.getElementById('dashboardContent');
        this.loadingDiv = document.getElementById('loading');
        this.currentTab = 'dashboard';
        this.alertManager = null;
        this.settingsManager = null;
        this.activeModule = null;
        this.isInitialized = false;
        
        // Store reference for global access
        window._userRouter = this;
        
        // Initialize
        this.init();
    }

    // ============================================
    // INITIALIZE
    // ============================================
    async init() {
        try {
            // Check authentication
            const session = await getCurrentSession();
            if (!session) {
                window.location.href = '/signin.html';
                return;
            }

            // Initialize theme
            initTheme();

            // Load user data
            await this.loadUserData();

            // Initialize alerts
            await this.initAlerts();

            // Initialize settings
            this.initSettings();

            // Setup navigation
            this.setupNavigation();

            // Setup sticky nav functions
            setupStickyNavFunctions(this);

            // Load default tab
            this.loadTab('dashboard');

            // Setup alert modal
            this.setupAlertModal();

            this.isInitialized = true;

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
            this.updateUserUI(user, profile);
            
            // Store globally
            window.currentUser = user;
            window.currentProfile = profile;
            
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
            
            this.showLoading(false);
        } catch (error) {
            console.error('Error loading user data:', error);
            this.showError('Failed to load user data');
            this.showLoading(false);
        }
    }

    // ============================================
    // INITIALIZE ALERTS
    // ============================================
    async initAlerts() {
        try {
            this.alertManager = await initializeAlerts(this.currentUser.id);
            await addInitialAlerts(this.currentUser.id);
            
            subscribeToAlerts((data) => {
                this.updateAlertIcon(data);
            });

            console.log('✅ Alerts initialized');
        } catch (error) {
            console.error('Error initializing alerts:', error);
        }
    }

    // ============================================
    // INITIALIZE SETTINGS
    // ============================================
    initSettings() {
        try {
            this.settingsManager = initSettings(
                this.currentUser.id,
                this.currentUser,
                this.currentProfile
            );
            console.log('✅ Settings initialized');
        } catch (error) {
            console.error('Error initializing settings:', error);
        }
    }

    // ============================================
    // UPDATE USER UI
    // ============================================
    updateUserUI(user, profile) {
        const userNameEl = document.getElementById('userName');
        const userRoleEl = document.getElementById('userRole');
        const userAvatarImg = document.getElementById('userAvatarImg');
        
        if (userNameEl) {
            userNameEl.textContent = profile.name || 'User';
        }
        
        if (userRoleEl) {
            userRoleEl.textContent = profile.role || 'User';
        }
        
        if (userAvatarImg) {
            const avatarUrl = profile.avatar_url || 
                `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=fbb040&color=fff&size=128`;
            userAvatarImg.src = avatarUrl;
        }
    }

    // ============================================
    // UPDATE ALERT ICON
    // ============================================
    updateAlertIcon(data) {
        const unreadCount = data?.unreadCount || 0;
        const alerts = data?.alerts || [];
        
        // Update badge
        this.updateAlertBadge(unreadCount);
        
        // Update modal body if open
        const modalBody = document.getElementById('alertModalBody');
        if (modalBody) {
            modalBody.innerHTML = this.renderAlertItems(alerts);
        }
    }

    updateAlertBadge(count) {
        const badge = document.getElementById('alertBadge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 9 ? '9+' : count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    }

    renderAlertItems(alerts) {
        if (!alerts || alerts.length === 0) {
            return `
                <div class="alert-empty">
                    <i class="fas fa-inbox"></i>
                    <p>No notifications yet</p>
                </div>
            `;
        }

        return alerts.slice(0, 20).map(function(alert) {
            return `
                <div class="alert-item ${alert.read ? 'read' : 'unread'}" data-id="${alert.id}">
                    <div class="alert-icon">${alert.icon || '📌'}</div>
                    <div class="alert-content">
                        <p class="alert-message">${alert.message}</p>
                        <span class="alert-time">${this.getTimeAgo(alert.created_at)}</span>
                        ${alert.link ? `<a href="${alert.link}" class="alert-link" target="_blank">Learn more →</a>` : ''}
                    </div>
                    ${!alert.read ? '<span class="alert-unread-dot"></span>' : ''}
                </div>
            `;
        }.bind(this)).join('');
    }

    getTimeAgo(date) {
        if (!date) return 'Just now';
        
        var past;
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
        
        var now = new Date();
        var diff = Math.floor((now.getTime() - past.getTime()) / 1000);
        
        if (diff < 0) return 'Just now';
        if (diff < 5) return 'Just now';
        if (diff < 60) return diff + 's ago';
        
        var minutes = Math.floor(diff / 60);
        var hours = Math.floor(diff / 3600);
        var days = Math.floor(diff / 86400);
        var weeks = Math.floor(diff / 604800);
        var months = Math.floor(diff / 2592000);
        var years = Math.floor(diff / 31536000);

        if (minutes < 2) return '1m ago';
        if (minutes < 60) return minutes + 'm ago';
        if (hours < 2) return '1h ago';
        if (hours < 24) return hours + 'h ago';
        if (days < 2) return '1d ago';
        if (days < 7) return days + 'd ago';
        if (weeks < 2) return '1w ago';
        if (weeks < 4) return weeks + 'w ago';
        if (months < 2) return '1mo ago';
        if (months < 12) return months + 'mo ago';
        if (years < 2) return '1y ago';
        return years + 'y ago';
    }

    // ============================================
    // SETUP ALERT MODAL
    // ============================================
    setupAlertModal() {
        const alertBtn = document.getElementById('alertIconBtn');
        const alertModal = document.getElementById('alertModal');
        const closeBtn = document.getElementById('closeAlertModal');
        const markReadBtn = document.getElementById('alertModalMarkRead');

        if (alertBtn) {
            alertBtn.onclick = function(e) {
                e.stopPropagation();
                // Refresh alerts
                this.refreshAlerts();
                if (alertModal) {
                    alertModal.classList.add('active');
                    document.body.style.overflow = 'hidden';
                }
            }.bind(this);
        }

        if (closeBtn) {
            closeBtn.onclick = function() {
                if (alertModal) {
                    alertModal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            };
        }

        if (alertModal) {
            alertModal.addEventListener('click', function(e) {
                if (e.target === this) {
                    this.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        }

        if (markReadBtn) {
            markReadBtn.onclick = async function() {
                await this.markAllAlertsRead();
                this.refreshAlerts();
            }.bind(this);
        }
    }

    async refreshAlerts() {
        if (this.alertManager) {
            const alerts = await this.alertManager.getAlerts();
            const unreadCount = await this.alertManager.getUnreadCount();
            this.updateAlertIcon({ alerts, unreadCount });
        }
    }

    async markAllAlertsRead() {
        if (this.alertManager) {
            await this.alertManager.markAllAsRead();
            const unreadCount = await this.alertManager.getUnreadCount();
            const alerts = this.alertManager.alerts || [];
            this.updateAlertIcon({ unreadCount, alerts });
            showToast('All notifications marked as read', 'success');
        }
    }

    // ============================================
    // NAVIGATION SETUP
    // ============================================
    setupNavigation() {
        const sidebarNav = document.getElementById('sidebarNav');
        if (sidebarNav) {
            const navItems = this.getNavItems();
            sidebarNav.innerHTML = navItems;
            
            sidebarNav.querySelectorAll('.nav-item').forEach(function(item) {
                item.addEventListener('click', function() {
                    const tab = this.dataset.tab;
                    this.loadTab(tab);
                }.bind(this));
            }.bind(this));
        }

        // Mobile bottom navigation
        document.querySelectorAll('.mobile-nav-item').forEach(function(item) {
            item.addEventListener('click', function() {
                const tab = this.dataset.tab;
                this.loadTab(tab);
                this.closeSidebar();
            }.bind(this));
        }.bind(this));

        // Sidebar overlay
        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) {
            overlay.addEventListener('click', function() {
                this.closeSidebar();
            }.bind(this));
        }
    }

    // ============================================
    // GET NAVIGATION ITEMS
    // ============================================
    getNavItems() {
        const role = this.currentProfile?.role || 'user';
        var items = [
            { tab: 'dashboard', icon: 'fa-tachometer-alt', label: 'Overview' },
            { tab: 'messages', icon: 'fa-envelope', label: 'Messages' },
            { tab: 'submissions', icon: 'fa-tasks', label: 'Submissions' },
            { tab: 'wallet', icon: 'fa-wallet', label: 'Wallet' },
        ];

        if (role === 'instructor' || role === 'admin') {
            items.push({ tab: 'manage', icon: 'fa-users-cog', label: 'Manage' });
        }

        items.push({ tab: 'settings', icon: 'fa-cog', label: 'Settings' });

        return items.map(function(item) {
            return '<button class="nav-item" data-tab="' + item.tab + '"><i class="fas ' + item.icon + '"></i><span>' + item.label + '</span></button>';
        }).join('');
    }

    // ============================================
    // LOAD TAB
    // ============================================
    async loadTab(tab) {
        this.currentTab = tab;
        
        // Update active states
        document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(function(el) {
            el.classList.remove('active');
            if (el.dataset.tab === tab) {
                el.classList.add('active');
            }
        });

        // Load module based on tab
        switch(tab) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'messages':
                await this.loadMessages();
                break;
            case 'submissions':
                await this.loadSubmissions();
                break;
            case 'wallet':
                await this.loadWallet();
                break;
            case 'settings':
                await this.loadSettings();
                break;
            case 'manage':
                await this.loadManage();
                break;
            default:
                await this.loadDashboard();
        }

        this.closeSidebar();
    }

    // ============================================
    // LOAD ROLE-SPECIFIC DASHBOARD
    // ============================================
    async loadDashboard() {
        const role = this.currentProfile?.role || 'user';
        
        try {
            var module;
            
            // Import the appropriate dashboard based on role
            if (role === 'student') {
                const { default: StudentDashboard } = await import('./user-student.js');
                module = new StudentDashboard(this.currentUser, this.currentProfile);
            } else if (role === 'instructor') {
                const { default: InstructorDashboard } = await import('./user-instructor.js');
                module = new InstructorDashboard(this.currentUser, this.currentProfile);
            } else if (role === 'user' || role === 'partner' || role === 'ambassador') {
                const { default: GeneralDashboard } = await import('./user-general.js');
                module = new GeneralDashboard(this.currentUser, this.currentProfile);
            } else if (role === 'admin' || role === 'super_admin' || role === 'crm' || role === 'manager' || role === 'secretary' || role === 'member') {
                window.location.href = '/admin';
                return;
            } else {
                const { default: GeneralDashboard } = await import('./user-general.js');
                module = new GeneralDashboard(this.currentUser, this.currentProfile);
            }
            
            this.activeModule = module;
            
            // Pass alert manager to module
            if (this.alertManager) {
                module.setAlertManager(this.alertManager);
            }
            
            // Render the dashboard
            await module.render(this.dashboardContent);
            
        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.dashboardContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Error Loading Dashboard</h3>
                    <p>${error.message || 'Unknown error'}</p>
                    <button class="btn-primary" onclick="location.reload()">Refresh</button>
                </div>
            `;
        }
    }

    // ============================================
    // LOAD MESSAGES
    // ============================================
    async loadMessages() {
        if (this.activeModule && typeof this.activeModule.loadMessages === 'function') {
            await this.activeModule.loadMessages(this.dashboardContent);
        } else {
            this.dashboardContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-envelope"></i>
                    <h3>Messages</h3>
                    <p>Message features coming soon...</p>
                </div>
            `;
        }
    }

    // ============================================
    // LOAD SUBMISSIONS (Questions for Students)
    // ============================================
    async loadSubmissions() {
        if (this.activeModule && typeof this.activeModule.loadSubmissions === 'function') {
            await this.activeModule.loadSubmissions(this.dashboardContent);
        } else {
            this.dashboardContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-tasks"></i>
                    <h3>Submissions</h3>
                    <p>Answer questions to earn GP and increase your progress!</p>
                </div>
            `;
        }
    }

    // ============================================
    // LOAD WALLET
    // ============================================
    async loadWallet() {
        if (this.activeModule && typeof this.activeModule.loadWallet === 'function') {
            await this.activeModule.loadWallet(this.dashboardContent);
        } else {
            this.dashboardContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-wallet"></i>
                    <h3>Wallet</h3>
                    <p>Wallet features coming soon...</p>
                </div>
            `;
        }
    }

    // ============================================
    // LOAD SETTINGS
    // ============================================
    async loadSettings() {
        if (this.settingsManager) {
            this.settingsManager.render(this.dashboardContent);
        } else {
            this.dashboardContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-cog"></i>
                    <h3>Settings</h3>
                    <p>Settings features coming soon...</p>
                </div>
            `;
        }
    }

    // ============================================
    // LOAD MANAGE (Instructors only)
    // ============================================
    async loadManage() {
        if (this.activeModule && typeof this.activeModule.loadManage === 'function') {
            await this.activeModule.loadManage(this.dashboardContent);
        } else {
            this.dashboardContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users-cog"></i>
                    <h3>Management Dashboard</h3>
                    <p>Management features coming soon...</p>
                </div>
            `;
        }
    }

    // ============================================
    // SHOW ACCESS MODAL
    // ============================================
    showAccessModal() {
        var modal = document.getElementById('accessModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Apply Now button
            document.getElementById('applyNowBtn').onclick = function() {
                modal.classList.remove('active');
                document.body.style.overflow = '';
                this.loadTab('messages');
                showToast('Go to Messages to apply for a role', 'info');
            }.bind(this);
            
            document.getElementById('closeAccessBtn').onclick = function() {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            };
            
            document.getElementById('closeAccessModal').onclick = function() {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            };
        }
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
}

// ============================================
// INITIALIZE WHEN DOM IS READY
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    new UserRouter();
});
