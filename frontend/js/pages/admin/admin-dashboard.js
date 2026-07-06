// ============================================
// ADMIN DASHBOARD - ROUTER
// Entry point - loads role-specific modules
// ============================================

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';
import { initTheme } from './admin-shared.js';

// ============================================
// GLOBAL STATE
// ============================================
let currentUser = null;
let currentRole = null;
let currentTab = 'overview';

// ============================================
// ROLE-BASED TAB CONFIGURATION
// ============================================
const roleTabs = {
    super_admin: [
        { id: 'overview', name: 'Overview', icon: 'fas fa-tachometer-alt' },
        { id: 'update', name: 'Update', icon: 'fas fa-pen' },
        { id: 'inquiries', name: 'Inquiries', icon: 'fas fa-question-circle' },
        { id: 'events', name: 'Event', icon: 'fas fa-calendar' },
        { id: 'payments', name: 'Payments', icon: 'fas fa-cash-register' },
        { id: 'sales', name: 'Sales', icon: 'fas fa-chart-simple' },
        { id: 'records', name: 'Records', icon: 'fas fa-folder-open' },
        { id: 'submissions', name: 'Info', icon: 'fas fa-briefcase' },
        { id: 'users', name: 'Users', icon: 'fas fa-users' },
        { id: 'partnerships', name: 'Partnerships', icon: 'fas fa-handshake' },
        { id: 'admin_management', name: 'Admin', icon: 'fas fa-user-shield' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    crm: [
        { id: 'overview', name: 'Overview', icon: 'fas fa-tachometer-alt' },
        { id: 'update', name: 'Update', icon: 'fas fa-pen' },
        { id: 'inquiries', name: 'Inquiries', icon: 'fas fa-question-circle' },
        { id: 'events', name: 'Event', icon: 'fas fa-calendar' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    manager: [
        { id: 'overview', name: 'Overview', icon: 'fas fa-tachometer-alt' },
        { id: 'submissions', name: 'Info', icon: 'fas fa-briefcase' },
        { id: 'users', name: 'Users', icon: 'fas fa-users' },
        { id: 'partnerships', name: 'Partnerships', icon: 'fas fa-handshake' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    secretary: [
        { id: 'overview', name: 'Overview', icon: 'fas fa-tachometer-alt' },
        { id: 'payments', name: 'Payments', icon: 'fas fa-cash-register' },
        { id: 'sales', name: 'Sales', icon: 'fas fa-chart-simple' },
        { id: 'records', name: 'Records', icon: 'fas fa-folder-open' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    member: [
        { id: 'overview', name: 'Overview', icon: 'fas fa-tachometer-alt' },
        { id: 'records', name: 'Records', icon: 'fas fa-folder-open' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ]
};

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    console.log('Checking admin authentication...');
    
    const devMode = localStorage.getItem('dev_admin_mode') === 'true';
    if (devMode) {
        console.log('Dev admin mode enabled');
        currentUser = { id: 'dev_admin', email: 'admin@test.com', role: 'super_admin' };
        currentRole = 'super_admin';
        document.getElementById('adminName').textContent = 'Super Admin (Dev Mode)';
        document.getElementById('adminRole').textContent = 'Super Admin';
        document.getElementById('dashboardTitle').textContent = 'Super Admin Dashboard';
        return true;
    }
    
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
        console.error('Auth error:', error);
        showToast('Please login first', 'error');
        setTimeout(() => window.location.href = '/signin.html', 1500);
        return false;
    }
    
    const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role, name, avatar_url')
        .eq('id', user.id)
        .single();
    
    if (profileError) {
        console.error('Profile error:', profileError);
        showToast('Error loading profile', 'error');
        setTimeout(() => window.location.href = '/user.html', 1500);
        return false;
    }
    
    const adminRoles = ['super_admin', 'crm', 'manager', 'member', 'secretary'];
    
    if (!profile || !adminRoles.includes(profile.role)) {
        console.warn('🚨 Unauthorized admin access:', user.email);
        showToast('You do not have admin access', 'error');
        setTimeout(() => window.location.href = '/user.html', 1500);
        return false;
    }
    
    currentRole = profile.role;
    currentUser = { ...user, profile };
    
    const roleNames = {
        super_admin: 'Super Admin',
        crm: 'CRM',
        secretary: 'Secretary',
        manager: 'Operations Manager',
        member: 'Board Member'
    };
    
    document.getElementById('adminName').textContent = profile?.name || 'Admin';
    document.getElementById('adminRole').textContent = roleNames[currentRole] || currentRole;
    document.getElementById('dashboardTitle').textContent = `${roleNames[currentRole] || currentRole} Dashboard`;
    
    return true;
}

// ============================================
// BUILD SIDEBAR
// ============================================
function buildSidebar() {
    const tabs = roleTabs[currentRole] || roleTabs.secretary;
    const sidebarNav = document.getElementById('sidebarNav');
    if (!sidebarNav) return;
    
    sidebarNav.innerHTML = tabs.map(tab => `
        <div class="nav-item ${currentTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
            <i class="${tab.icon}"></i>
            <span>${tab.name}</span>
        </div>
    `).join('');
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
}

// ============================================
// CREATE CONTENT SECTIONS
// ============================================
function createContentSections() {
    const dashboardContent = document.getElementById('dashboardContent');
    if (!dashboardContent) return;
    
    dashboardContent.innerHTML = `
        <div id="overview-section" class="admin-tab active"><div class="loading">Loading overview...</div></div>
        <div id="update-section" class="admin-tab"><div class="loading">Loading update manager...</div></div>
        <div id="inquiries-section" class="admin-tab"><div class="loading">Loading inquiries...</div></div>
        <div id="events-section" class="admin-tab"><div class="loading">Loading events...</div></div>
        <div id="payments-section" class="admin-tab"><div class="loading">Loading payments...</div></div>
        <div id="sales-section" class="admin-tab"><div class="loading">Loading sales...</div></div>
        <div id="records-section" class="admin-tab"><div class="loading">Loading records...</div></div>
        <div id="submissions-section" class="admin-tab"><div class="loading">Loading submissions...</div></div>
        <div id="users-section" class="admin-tab"><div class="loading">Loading users...</div></div>
        <div id="partnerships-section" class="admin-tab"><div class="loading">Loading partnerships...</div></div>
        <div id="admin_management-section" class="admin-tab"><div class="loading">Loading admin management...</div></div>
        <div id="settings-section" class="admin-tab"><div class="loading">Loading settings...</div></div>
    `;
}

// ============================================
// TAB SWITCHING
// ============================================
async function switchTab(tabId) {
    currentTab = tabId;
    
    document.querySelectorAll('.nav-item').forEach(item => {
        const itemTab = item.getAttribute('data-tab');
        item.classList.toggle('active', itemTab === tabId);
    });
    
    document.querySelectorAll('.admin-tab').forEach(tab => {
        const tabSection = tab.id.replace('-section', '');
        tab.classList.toggle('active', tabSection === tabId);
    });
    
    await loadTabData(tabId);
}

async function loadTabData(tabId) {
    const container = document.getElementById(`${tabId}-section`);
    if (!container) return;
    
    try {
        // Dynamically import the role-specific module
        const moduleMap = {
            'overview': () => import(`./admin-${currentRole}.js`).then(m => m.renderOverview),
            'update': () => import(`./admin-${currentRole}.js`).then(m => m.renderUpdate || (() => {})),
            'inquiries': () => import(`./admin-${currentRole}.js`).then(m => m.renderInquiries || (() => {})),
            'events': () => import(`./admin-${currentRole}.js`).then(m => m.renderEvents || (() => {})),
            'payments': () => import(`./admin-${currentRole}.js`).then(m => m.renderPayments || (() => {})),
            'sales': () => import(`./admin-${currentRole}.js`).then(m => m.renderSales || (() => {})),
            'records': () => import(`./admin-${currentRole}.js`).then(m => m.renderRecords || (() => {})),
            'submissions': () => import(`./admin-${currentRole}.js`).then(m => m.renderSubmissions || (() => {})),
            'users': () => import(`./admin-${currentRole}.js`).then(m => m.renderUsers || (() => {})),
            'partnerships': () => import(`./admin-${currentRole}.js`).then(m => m.renderPartnerships || (() => {})),
            'admin_management': () => import(`./admin-${currentRole}.js`).then(m => m.renderAdminManagement || (() => {})),
            'settings': () => import(`./admin-settings.js`).then(m => m.renderSettings)
        };
        
        const renderFn = await moduleMap[tabId]?.();
        if (renderFn) {
            await renderFn(container);
        } else {
            container.innerHTML = `<div class="empty-state">Tab content not available for this role</div>`;
        }
    } catch (error) {
        console.error('Error loading tab:', error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error loading content</p></div>`;
    }
}

// ============================================
// INITIALIZE
// ============================================
async function initAdminDashboard() {
    console.log('Initializing admin dashboard...');
    
    initTheme();
    
    const isAuth = await checkAuth();
    if (!isAuth) return;
    
    createContentSections();
    buildSidebar();
    await loadTabData('overview');
    
    setInterval(async () => {
        if (currentTab === 'payments') await loadTabData('payments');
        else if (currentTab === 'overview') await loadTabData('overview');
    }, 30000);
    
    console.log(`✅ Admin dashboard initialized for role: ${currentRole}`);
}

// ============================================
// START
// ============================================
document.addEventListener('DOMContentLoaded', initAdminDashboard);
