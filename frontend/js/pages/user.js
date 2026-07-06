// ============================================
// PAGE: USER ROUTER
// Path: /frontend/js/pages/user.js
// Purpose: Entry point - determines where user should go
// Handles: Authentication, Routing, Role-based loading
// ============================================

import { 
    getCurrentUser as getAuthUser,
    signOutUser,
    getCurrentSession
} from '../modules/auth.js';
import { 
    supabase, 
    getUserProfile
} from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';
import { initTheme, onThemeChange, applyTheme } from './user-theme.js';
import { initializeAlerts, addInitialAlerts, subscribeToAlerts } from './user-alerts.js';
import { initSettings } from './user-settings.js';

export class UserPage {
    constructor() {
        this.currentUser = null;
        this.currentProfile = null;
        this.dashboardContent = document.getElementById('dashboardContent');
        this.loadingDiv = document.getElementById('loading');
        this.currentTab = 'dashboard';
        this.roleModules = {};
        this.alertManager = null;
        this.settingsManager = null;
        this.isInitialized = false;
        
        window._userPage = this;
        
        this.init();
    }

    async init() {
        try {
            const session = await getCurrentSession();
            if (!session) {
                window.location.href = '/signin.html';
                return;
            }

            initTheme();
            await this.loadUserData();
            await this.initAlerts();
            this.initSettings();
            this.setupNavigation();
            this.setupStickyNavFunctions();
            this.loadTab('dashboard');

            this.isInitialized = true;

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
                avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=fbb040&color=fff`
            }));
            
            this.showLoading(false);
        } catch (error) {
            console.error('Error loading user data:', error);
            this.showError('Failed to load user data');
            this.showLoading(false);
        }
    }

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

    updateAlertIcon(data) {
        if (this.activeModule && typeof this.activeModule.updateAlertIcon === 'function') {
            this.activeModule.updateAlertIcon(data);
        }
    }

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

    setupStickyNavFunctions() {
        window.goToDashboard = () => {
            window.location.href = '/user';
        };

        window.goToHub = () => {
            window.location.href = '/hub';
        };

        window.goToLearningPath = () => {
            const role = this.currentProfile?.role || 'user';
            if (role === 'student' || role === 'instructor') {
                window.location.href = '/course';
            } else {
                this.showAccessModal();
            }
        };

        window.goToVirtualRoom = () => {
            const role = this.currentProfile?.role || 'user';
            if (role === 'student' || role === 'instructor') {
                window.location.href = '/virtualroom';
            } else {
                this.showAccessModal();
            }
        };

        window.goToChat = () => {
            window.location.href = '/chat';
        };

        window.goToMerchandise = () => {
            window.location.href = '/merchandise';
        };

        window.goToUser = () => {
            window.location.href = '/user';
        };

        window.goBack = () => {
            if (document.referrer && document.referrer.includes('/user')) {
                window.history.back();
            } else {
                window.location.href = '/user';
            }
        };

        window.goToContact = () => {
            window.location.href = '/contact';
        };

        window.reportIssue = () => {
            showToast('📝 Report an issue? Our team will investigate.', 'info');
        };

        window.switchTab = (tab) => {
            this.loadTab(tab);
        };
    }

    showAccessModal() {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px; text-align: center;">
                <div class="modal-header">
                    <h2><i class="fas fa-lock" style="color: var(--brand-gold);"></i> Access Restricted</h2>
                    <button class="modal-close" id="closeAccessModal">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">
                        <i class="fas fa-graduation-cap" style="color: var(--brand-gold);"></i>
                    </div>
                    <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem;">Only Students and Instructors Can Access</h3>
                    <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 1.5rem;">
                        Virtual Rooms and Courses are exclusive to students and instructors. 
                        Apply to become a student to unlock these features and start learning from industry experts!
                    </p>
                    <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                        <button id="applyNowBtn" class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px;">
                            <i class="fas fa-paper-plane"></i> Apply Now
                        </button>
                        <button id="closeAccessBtn" class="btn-outline">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('closeAccessModal')?.addEventListener('click', () => modal.remove());
        document.getElementById('closeAccessBtn')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        document.getElementById('applyNowBtn')?.addEventListener('click', () => {
            modal.remove();
            this.loadTab('messages');
            showToast('Go to Messages to apply for a role', 'info');
        });
    }

    getNavItems() {
        const role = this.currentProfile?.role || 'partner';
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

    async loadDashboard() {
        const role = this.currentProfile?.role || 'partner';
        
        try {
            let module;
            
            if (role === 'student' || role === 'user' || role === 'partner' || role === 'ambassador') {
                const { default: GeneralDashboard } = await import('./user-general.js');
                module = new GeneralDashboard(this.currentUser, this.currentProfile);
            } else if (role === 'instructor') {
                const { default: InstructorDashboard } = await import('./user-instructor.js');
                module = new InstructorDashboard(this.currentUser, this.currentProfile);
            } else if (role === 'admin' || role === 'super_admin' || role === 'crm' || role === 'manager' || role === 'secretary' || role === 'member') {
                window.location.href = '/admin';
                return;
            } else {
                const { default: GeneralDashboard } = await import('./user-general.js');
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

    async loadPortfolio() {
        if (this.activeModule && typeof this.activeModule.loadPortfolio === 'function') {
            await this.activeModule.loadPortfolio(this.dashboardContent);
        } else {
            this.dashboardContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-circle"></i>
                    <h3>Portfolio</h3>
                    <p>Portfolio features coming soon...</p>
                </div>
            `;
        }
    }

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

    async loadAdmin() {
        this.dashboardContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-crown"></i>
                <h3>Admin Panel</h3>
                <p>Admin features coming soon...</p>
            </div>
        `;
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

document.addEventListener('DOMContentLoaded', () => {
    new UserPage();
});
