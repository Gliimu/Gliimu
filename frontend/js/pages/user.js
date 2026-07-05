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

            // Load default tab
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
            // Initialize alert manager
            this.alertManager = await initializeAlerts(this.currentUser.id);
            
            // Add initial alerts if needed
            await addInitialAlerts(this.currentUser.id);
            
            // Subscribe to alert updates
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
            userRoleEl.textContent = profile.role || 'Student';
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
        // This will be handled by the general dashboard
        // We'll pass this to the active module
        if (this.activeModule && typeof this.activeModule.updateAlertIcon === 'function') {
            this.activeModule.updateAlertIcon(data);
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
                this.loadTab(tab);
                this.closeSidebar();
            });
        });

        // Sidebar overlay
        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeSidebar());
        }
    }

    // ============================================
    // GET NAVIGATION ITEMS
    // ============================================
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

    // ============================================
    // LOAD TAB
    // ============================================
    async loadTab(tab) {
        this.currentTab = tab;
        
        // Update active states
        document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(el => {
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
    // LOAD ROLE-SPECIFIC DASHBOARD
    // ============================================
    async loadDashboard() {
        const role = this.currentProfile?.role || 'partner';
        
        try {
            let module;
            
            switch(role) {
                case 'student':
                    const { default: StudentDashboard } = await import('./user-student.js');
                    module = new StudentDashboard(this.currentUser, this.currentProfile);
                    break;
                case 'instructor':
                    const { default: InstructorDashboard } = await import('./user-instructor.js');
                    module = new InstructorDashboard(this.currentUser, this.currentProfile);
                    break;
                case 'admin':
                    // Use existing admin dashboard or import
                    const { default: AdminDashboard } = await import('./user-admin.js');
                    module = new AdminDashboard(this.currentUser, this.currentProfile);
                    break;
                default:
                    // Partner/General user
                    const { default: GeneralDashboard } = await import('./user-general.js');
                    module = new GeneralDashboard(this.currentUser, this.currentProfile);
            }
            
            // Store reference to active module
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
    // OTHER TABS (Delegated to modules)
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
        this.dashboardContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users-cog"></i>
                <h3>Management Dashboard</h3>
                <p>Management features coming soon...</p>
            </div>
        `;
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

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new UserPage();
});
