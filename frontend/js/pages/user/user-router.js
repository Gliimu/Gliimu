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
import { setupNavigation, updateNavActive, closeSidebar, setupStickyNavFunctions, setupStickyNav } from './user-navigation.js';
import { modalManager } from './user-modals.js';

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
        
        window._userRouter = this;
        
        this.init();
    }

    // ============================================
    // INITIALIZE
    // ============================================
    async init() {
        try {
            var session = await getCurrentSession();
            if (!session) {
                window.location.href = '/signin.html';
                return;
            }

            initTheme();
            await this.loadUserData();
            await this.initAlerts();
            this.initSettings();
            
            setupNavigation(this);
            setupStickyNavFunctions(this);
            setupStickyNav();
            
            // Setup alert modal
            this.setupAlertModal();
            
            this.loadTab('dashboard');
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
            
            var user = await getAuthUser();
            if (!user) {
                this.showError('User not authenticated');
                window.location.href = '/signin.html';
                return;
            }

            this.currentUser = user;
            var profile = await getUserProfile(user.id);
            
            if (!profile) {
                this.showError('User profile not found');
                return;
            }

            this.currentProfile = profile;
            this.updateUserUI(user, profile);
            
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
                avatar: profile.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(profile.name || 'User') + '&background=fbb040&color=fff'
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
            
            subscribeToAlerts(function(data) {
                this.updateAlertIcon(data);
            }.bind(this));

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
        var userNameEl = document.getElementById('userName');
        var userRoleEl = document.getElementById('userRole');
        var userAvatarImg = document.getElementById('userAvatarImg');
        
        if (userNameEl) {
            userNameEl.textContent = profile.name || 'User';
        }
        
        if (userRoleEl) {
            userRoleEl.textContent = profile.role || 'User';
        }
        
        if (userAvatarImg) {
            var avatarUrl = profile.avatar_url || 
                'https://ui-avatars.com/api/?name=' + encodeURIComponent(profile.name || 'User') + '&background=fbb040&color=fff&size=128';
            userAvatarImg.src = avatarUrl;
        }
    }

    // ============================================
    // UPDATE ALERT ICON
    // ============================================
    updateAlertIcon(data) {
        var unreadCount = data?.unreadCount || 0;
        var alerts = data?.alerts || [];
        
        this.updateAlertBadge(unreadCount);
        
        var modalBody = document.getElementById('alertModalBody');
        if (modalBody) {
            modalBody.innerHTML = this.renderAlertItems(alerts);
        }
    }

    updateAlertBadge(count) {
        var badge = document.getElementById('alertBadge');
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
                        ${alert.link ? '<a href="' + alert.link + '" class="alert-link" target="_blank">Learn more →</a>' : ''}
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
        var alertBtn = document.getElementById('alertIconBtn');
        var alertModal = document.getElementById('alertModal');
        var closeBtn = document.getElementById('closeAlertModal');
        var markReadBtn = document.getElementById('alertModalMarkRead');

        if (alertBtn) {
            alertBtn.onclick = function(e) {
                e.stopPropagation();
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
            var alerts = await this.alertManager.getAlerts();
            var unreadCount = await this.alertManager.getUnreadCount();
            this.updateAlertIcon({ alerts: alerts, unreadCount: unreadCount });
        }
    }

    async markAllAlertsRead() {
        if (this.alertManager) {
            await this.alertManager.markAllAsRead();
            var unreadCount = await this.alertManager.getUnreadCount();
            var alerts = this.alertManager.alerts || [];
            this.updateAlertIcon({ unreadCount: unreadCount, alerts: alerts });
            showToast('All notifications marked as read', 'success');
        }
    }

   // ============================================
// LOAD TAB - UPDATED with submissions lock
// ============================================
async loadTab(tab) {
    this.currentTab = tab;
    updateNavActive(tab);

    // Check if submissions tab is locked for non-students
    if (tab === 'submissions') {
        var role = this.currentProfile?.role || 'user';
        if (role !== 'student' && role !== 'instructor') {
            this.showSubmissionsLockModal();
            return;
        }
    }

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

    closeSidebar();
}

// ============================================
// SHOW SUBMISSIONS LOCK MODAL
// ============================================
showSubmissionsLockModal() {
    var modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 450px; text-align: center;">
            <div class="modal-header">
                <h2><i class="fas fa-lock" style="color: var(--brand-gold);"></i> Access Restricted</h2>
                <button class="modal-close" id="closeLockModal">&times;</button>
            </div>
            <div class="modal-body">
                <div style="font-size: 3rem; margin-bottom: 1rem;">
                    <i class="fas fa-tasks" style="color: var(--brand-gold);"></i>
                </div>
                <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem;">Submissions are for Students Only</h3>
                <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 1.5rem;">
                    To access the Submissions tab and start answering questions, you need to apply to become a student first.
                    This is where you'll earn GP points and progress through the learning path!
                </p>
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button id="applyNowLockBtn" class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px;">
                        <i class="fas fa-paper-plane"></i> Apply Now
                    </button>
                    <button id="closeLockBtn" class="btn-outline">Close</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    document.getElementById('closeLockModal')?.addEventListener('click', function() {
        modal.remove();
        document.body.style.overflow = '';
    });

    document.getElementById('closeLockBtn')?.addEventListener('click', function() {
        modal.remove();
        document.body.style.overflow = '';
    });

    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
            document.body.style.overflow = '';
        }
    });

    document.getElementById('applyNowLockBtn')?.addEventListener('click', function() {
        modal.remove();
        document.body.style.overflow = '';
        this.loadTab('messages');
        showToast('Go to Messages to apply for a role', 'info');
    }.bind(this));
}

    // ============================================
    // LOAD ROLE-SPECIFIC DASHBOARD
    // ============================================
    async loadDashboard() {
        var role = this.currentProfile?.role || 'user';
        
        try {
            var module;
            
            if (role === 'student') {
                var { default: StudentDashboard } = await import('./user-student.js');
                module = new StudentDashboard(this.currentUser, this.currentProfile);
            } else if (role === 'instructor') {
                var { default: InstructorDashboard } = await import('./user-instructor.js');
                module = new InstructorDashboard(this.currentUser, this.currentProfile);
            } else if (role === 'user' || role === 'partner' || role === 'ambassador') {
                var { default: GeneralDashboard } = await import('./user-general.js');
                module = new GeneralDashboard(this.currentUser, this.currentProfile);
            } else if (role === 'admin' || role === 'super_admin' || role === 'crm' || role === 'manager' || role === 'secretary' || role === 'member') {
                window.location.href = '/admin';
                return;
            } else {
                var { default: GeneralDashboard } = await import('./user-general.js');
                module = new GeneralDashboard(this.currentUser, this.currentProfile);
            }
            
            this.activeModule = module;
            
            if (this.alertManager) {
                module.setAlertManager(this.alertManager);
            }
            
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
    // LOAD SUBMISSIONS
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
        modalManager.showAccessModal(function() {
            this.loadTab('messages');
            showToast('Go to Messages to apply for a role', 'info');
        }.bind(this));
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
}

// ============================================
// INITIALIZE WHEN DOM IS READY
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    new UserRouter();
});
