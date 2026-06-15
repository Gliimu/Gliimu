// ============================================
// ADMIN DASHBOARD - COMPLETE ROLE-BASED SYSTEM
// Roles: Founder, CRM, Secretary, Manager
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// Global state
let currentUser = null;
let currentRole = null;
let currentTab = 'dashboard';
let currentPaymentFilter = 'pending';
let allPayments = [];
let allStudents = [];
let allProducts = [];
let allExpenses = [];
let allDisbursements = [];
let allSubmissions = [];
let allEvents = [];
let allContacts = [];
let allPartnerships = [];
let allOffers = [];
let refreshInterval = null;

// ============================================
// ROLE-BASED TAB CONFIGURATION
// ============================================

const roleTabs = {
    founder: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'payments', name: 'Payments', icon: 'fas fa-wallet' },
        { id: 'users', name: 'Users', icon: 'fas fa-users' },
        { id: 'inventory', name: 'Inventory', icon: 'fas fa-boxes' },
        { id: 'finance', name: 'Finance', icon: 'fas fa-chart-line' },
        { id: 'posts', name: 'Update Website', icon: 'fas fa-pen' },
        { id: 'submissions', name: 'User Submissions', icon: 'fas fa-briefcase' },
        { id: 'events', name: 'Hosted Events', icon: 'fas fa-calendar' },
        { id: 'contacts', name: 'Contacts', icon: 'fas fa-address-book' },
        { id: 'partnerships', name: 'Partnerships', icon: 'fas fa-handshake' },
        { id: 'peering', name: 'Instructor to Students', icon: 'fas fa-chalkboard-user' },
        { id: 'offers', name: 'Student Work Offers', icon: 'fas fa-briefcase' },
        { id: 'sales', name: 'Store Sales', icon: 'fas fa-chart-simple' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    crm: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'posts', name: 'Update Website', icon: 'fas fa-pen' },
        { id: 'submissions', name: 'User Submissions', icon: 'fas fa-briefcase' },
        { id: 'events', name: 'Hosted Events', icon: 'fas fa-calendar' },
        { id: 'contacts', name: 'Contacts', icon: 'fas fa-address-book' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    secretary: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'payments', name: 'Payments', icon: 'fas fa-cash-register' },
        { id: 'sales', name: 'Store Sales', icon: 'fas fa-chart-simple' },
        { id: 'inventory', name: 'Inventory', icon: 'fas fa-boxes' },
        { id: 'finance', name: 'Finance', icon: 'fas fa-chart-line' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    manager: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'partnerships', name: 'Partnership Agreements', icon: 'fas fa-handshake' },
        { id: 'peering', name: 'Instructor to Students', icon: 'fas fa-chalkboard-user' },
        { id: 'offers', name: 'Student Work Offers', icon: 'fas fa-briefcase' },
        { id: 'users', name: 'Users', icon: 'fas fa-users' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ]
};

// ============================================
// THEME MANAGEMENT
// ============================================

function initTheme() {
    // Check for saved theme or system preference
    const savedTheme = localStorage.getItem('admin_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        document.body.classList.add('dark-mode');
    } else if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
    } else if (systemPrefersDark) {
        document.body.classList.add('dark-mode');
    }
}

function toggleTheme() {
    if (document.body.classList.contains('dark-mode')) {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('admin_theme', 'light');
        showToast('Light mode activated', 'info');
    } else {
        document.body.classList.add('dark-mode');
        localStorage.setItem('admin_theme', 'dark');
        showToast('Dark mode activated', 'info');
    }
}

// ============================================
// AUTHENTICATION CHECK WITH ROLE
// ============================================
async function checkAuth() {
    console.log('Checking admin authentication...');
    
    const devMode = localStorage.getItem('dev_admin_mode') === 'true';
    if (devMode) {
        console.log('Dev admin mode enabled');
        currentUser = { id: 'dev_admin', email: 'admin@test.com', role: 'founder' };
        currentRole = 'founder';
        document.getElementById('adminName').textContent = 'Founder (Dev Mode)';
        document.getElementById('adminRole').textContent = 'Founder';
        document.getElementById('dashboardTitle').textContent = 'Founder Dashboard';
        return true;
    }
    
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
        console.error('Auth error:', error);
        showToast('Please login as admin', 'error');
        setTimeout(() => window.location.href = '/signin.html', 1500);
        return false;
    }
    
    // Get user profile with role
    const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, name')
        .eq('id', user.id)
        .single();
    
    if (profileError) {
        console.error('Profile error:', profileError);
    }
    
    const userRole = profile?.role || 'secretary';
    currentRole = userRole;
    currentUser = user;
    
    // Update UI
    const roleNames = {
        founder: 'Founder',
        crm: 'CRM',
        secretary: 'Secretary',
        manager: 'Operations Manager'
    };
    
    const roleTitles = {
        founder: 'Founder Dashboard',
        crm: 'CRM Dashboard',
        secretary: 'Secretary Dashboard',
        manager: 'Manager Dashboard'
    };
    
    document.getElementById('adminName').textContent = profile?.name || 'Admin';
    document.getElementById('adminRole').textContent = roleNames[userRole] || userRole;
    document.getElementById('dashboardTitle').textContent = roleTitles[userRole] || 'Admin Dashboard';
    
    return true;
}

// ============================================
// BUILD SIDEBAR BASED ON ROLE
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
// CREATE CONTENT SECTIONS FOR ALL TABS
// ============================================
function createContentSections() {
    const dashboardContent = document.getElementById('dashboardContent');
    if (!dashboardContent) return;
    
    dashboardContent.innerHTML = `
        <div id="dashboard-section" class="admin-tab active"><div class="loading">Loading dashboard...</div></div>
        <div id="payments-section" class="admin-tab"><div class="loading">Loading payments...</div></div>
        <div id="users-section" class="admin-tab"><div class="loading">Loading users...</div></div>
        <div id="inventory-section" class="admin-tab"><div class="loading">Loading inventory...</div></div>
        <div id="finance-section" class="admin-tab"><div class="loading">Loading finance...</div></div>
        <div id="posts-section" class="admin-tab"><div class="loading">Loading posts...</div></div>
        <div id="submissions-section" class="admin-tab"><div class="loading">Loading submissions...</div></div>
        <div id="events-section" class="admin-tab"><div class="loading">Loading events...</div></div>
        <div id="contacts-section" class="admin-tab"><div class="loading">Loading contacts...</div></div>
        <div id="partnerships-section" class="admin-tab"><div class="loading">Loading partnerships...</div></div>
        <div id="peering-section" class="admin-tab"><div class="loading">Loading peering...</div></div>
        <div id="offers-section" class="admin-tab"><div class="loading">Loading offers...</div></div>
        <div id="sales-section" class="admin-tab"><div class="loading">Loading sales...</div></div>
        <div id="settings-section" class="admin-tab"><div class="loading">Loading settings...</div></div>
    `;
}

// ============================================
// TAB SWITCHING
// ============================================
function switchTab(tabId) {
    currentTab = tabId;
    
    document.querySelectorAll('.nav-item').forEach(item => {
        const itemTab = item.getAttribute('data-tab');
        if (itemTab === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    document.querySelectorAll('.admin-tab').forEach(tab => {
        if (tab.id === `${tabId}-section`) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    loadTabData(tabId);
}

async function loadTabData(tabId) {
    switch(tabId) {
        case 'dashboard': await renderDashboard(); break;
        case 'payments': await renderPayments(); break;
        case 'users': await renderUsers(); break;
        case 'inventory': await renderInventory(); break;
        case 'finance': await renderFinance(); break;
        case 'posts': await renderPostsManager(); break;
        case 'submissions': await renderSubmissions(); break;
        case 'events': await renderEvents(); break;
        case 'contacts': await renderContacts(); break;
        case 'partnerships': await renderPartnerships(); break;
        case 'peering': await renderPeering(); break;
        case 'offers': await renderOffers(); break;
        case 'sales': await renderSales(); break;
        case 'settings': await renderSettings(); break;
        default: await renderDashboard();
    }
}

// ============================================
// DASHBOARD RENDER
// ============================================
async function renderDashboard() {
    const container = document.getElementById('dashboard-section');
    if (!container) return;
    
    const payments = await loadPayments();
    const students = await loadStudents();
    const pendingPayments = payments.filter(p => p.status === 'pending');
    const approvedPayments = payments.filter(p => p.status === 'approved');
    const totalRevenue = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
    
    container.innerHTML = `
        <div class="dashboard-overview">
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-users"></i></div><div class="stat-info"><h3>Total Students</h3><div class="stat-value">${students.length}</div></div></div>
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-clock"></i></div><div class="stat-info"><h3>Pending Payments</h3><div class="stat-value">${pendingPayments.length}</div></div></div>
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-check-circle"></i></div><div class="stat-info"><h3>Approved Payments</h3><div class="stat-value">${approvedPayments.length}</div></div></div>
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-chart-line"></i></div><div class="stat-info"><h3>Total Revenue</h3><div class="stat-value">₦${totalRevenue.toLocaleString()}</div></div></div>
            </div>
            <div class="recent-section"><h3>Recent Payments</h3><div class="recent-payments">${renderRecentPayments(payments.slice(0, 5))}</div></div>
        </div>
    `;
}

// ============================================
// SETTINGS TAB WITH THEME
// ============================================
async function renderSettings() {
    const container = document.getElementById('settings-section');
    if (!container) return;
    
    const isDarkMode = document.body.classList.contains('dark-mode');
    const currentTheme = isDarkMode ? 'dark' : 'light';
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-cog"></i> Settings</h2>
            <p>Manage your dashboard preferences</p>
        </div>
        
        <div class="settings-grid">
            <div class="settings-card">
                <h3><i class="fas fa-palette"></i> Appearance</h3>
                <div class="form-group">
                    <label>Theme Preference</label>
                    <div class="theme-selector">
                        <button class="theme-option ${currentTheme === 'light' ? 'active' : ''}" data-theme="light">
                            <i class="fas fa-sun"></i> Light Mode
                        </button>
                        <button class="theme-option ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">
                            <i class="fas fa-moon"></i> Dark Mode
                        </button>
                        <button class="theme-option" data-theme="system">
                            <i class="fas fa-desktop"></i> System Default
                        </button>
                    </div>
                    <small class="form-hint">Choose your preferred theme for the admin dashboard.</small>
                </div>
            </div>
            
            <div class="settings-card">
                <h3><i class="fas fa-bell"></i> Notifications</h3>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="emailNotifications" ${localStorage.getItem('admin_email_notifications') !== 'false' ? 'checked' : ''}>
                        Email notifications for new payments
                    </label>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="paymentAlerts" ${localStorage.getItem('admin_payment_alerts') !== 'false' ? 'checked' : ''}>
                        Sound alerts for new payments
                    </label>
                </div>
            </div>
            
            <div class="settings-card">
                <h3><i class="fas fa-user-shield"></i> Account</h3>
                <div class="form-group">
                    <label>Role</label>
                    <input type="text" value="${currentRole.toUpperCase()}" disabled>
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" value="${currentUser?.email || ''}" disabled>
                </div>
            </div>
            
            <div class="settings-card">
                <h3><i class="fas fa-database"></i> Data Management</h3>
                <div class="form-group">
                    <button id="exportDataBtn" class="btn-outline"><i class="fas fa-download"></i> Export All Data (CSV)</button>
                </div>
                <div class="form-group">
                    <button id="clearCacheBtn" class="btn-outline"><i class="fas fa-broom"></i> Clear Dashboard Cache</button>
                </div>
            </div>
        </div>
        
        <div class="settings-actions">
            <button id="saveSettingsBtn" class="btn-primary"><i class="fas fa-save"></i> Save Preferences</button>
        </div>
    `;
    
    // Theme selector event listeners
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.getAttribute('data-theme');
            
            if (theme === 'system') {
                const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (systemPrefersDark) {
                    document.body.classList.add('dark-mode');
                } else {
                    document.body.classList.remove('dark-mode');
                }
                localStorage.setItem('admin_theme', 'system');
            } else if (theme === 'dark') {
                document.body.classList.add('dark-mode');
                localStorage.setItem('admin_theme', 'dark');
            } else {
                document.body.classList.remove('dark-mode');
                localStorage.setItem('admin_theme', 'light');
            }
            
            // Update active state
            document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            showToast(`${theme.charAt(0).toUpperCase() + theme.slice(1)} mode activated`, 'success');
        });
    });
    
    // Save settings
    document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
        const emailNotifications = document.getElementById('emailNotifications')?.checked;
        const paymentAlerts = document.getElementById('paymentAlerts')?.checked;
        
        localStorage.setItem('admin_email_notifications', emailNotifications);
        localStorage.setItem('admin_payment_alerts', paymentAlerts);
        
        showToast('Settings saved successfully!', 'success');
    });
    
    // Export data
    document.getElementById('exportDataBtn')?.addEventListener('click', async () => {
        await exportAllData();
    });
    
    // Clear cache
    document.getElementById('clearCacheBtn')?.addEventListener('click', () => {
        localStorage.removeItem('admin_payments_cache');
        localStorage.removeItem('admin_students_cache');
        showToast('Cache cleared! Refreshing data...', 'success');
        setTimeout(() => refreshAllData(), 1000);
    });
}

async function exportAllData() {
    try {
        const payments = await loadPayments();
        const students = await loadStudents();
        
        let csvContent = "Data Type,ID,Name,Amount,Status,Date\n";
        payments.forEach(p => {
            csvContent += `Payment,${p.id},${p.user_name},${p.amount},${p.status},${new Date(p.submitted_at).toLocaleDateString()}\n`;
        });
        students.forEach(s => {
            csvContent += `Student,${s.id},${s.name},${s.wallet_balance},Active,${new Date(s.created_at).toLocaleDateString()}\n`;
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `admin_export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('Data exported successfully!', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Error exporting data', 'error');
    }
}

// ============================================
// PAYMENTS RENDER
// ============================================
async function renderPayments() {
    const container = document.getElementById('payments-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading payments...</div>';
    
    const payments = await loadPayments();
    allPayments = payments;
    
    const pendingCount = payments.filter(p => p.status === 'pending').length;
    const badgeEl = document.getElementById('pendingPaymentsBadge');
    if (badgeEl) badgeEl.textContent = pendingCount;
    
    const filtered = payments.filter(p => p.status === currentPaymentFilter);
    
    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No ${currentPaymentFilter} payments found</p></div>`;
        return;
    }
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-wallet"></i> Payment Management</h2>
            <div class="payment-filters">
                <button class="filter-btn ${currentPaymentFilter === 'pending' ? 'active' : ''}" data-filter="pending">Pending (${payments.filter(p => p.status === 'pending').length})</button>
                <button class="filter-btn ${currentPaymentFilter === 'approved' ? 'active' : ''}" data-filter="approved">Approved</button>
                <button class="filter-btn ${currentPaymentFilter === 'rejected' ? 'active' : ''}" data-filter="rejected">Rejected</button>
            </div>
        </div>
        <div class="payments-list">
            ${filtered.map(p => `
                <div class="payment-item ${p.status}">
                    <div class="payment-info">
                        <div class="payment-amount">₦${p.amount.toLocaleString()}</div>
                        <div class="payment-date">${new Date(p.submitted_at).toLocaleString()}</div>
                        <div class="payment-ref">Ref: ${p.reference_code}</div>
                        <div class="payment-user">${p.user_name || p.user_email}</div>
                        ${p.bank ? `<div class="payment-bank">Bank: ${p.bank}</div>` : ''}
                    </div>
                    <div class="payment-status ${p.status}">${p.status.toUpperCase()}</div>
                    <div class="payment-actions">
                        ${p.status === 'pending' ? `
                            <button class="btn-approve" data-id="${p.id}" data-amount="${p.amount}" data-user="${p.user_name || p.user_email}"><i class="fas fa-check"></i> Approve</button>
                            <button class="btn-reject" data-id="${p.id}" data-amount="${p.amount}" data-user="${p.user_name || p.user_email}"><i class="fas fa-times"></i> Reject</button>
                        ` : p.status === 'approved' ? `<span class="approved-label"><i class="fas fa-check-circle"></i> Approved</span>` : `<span class="rejected-label"><i class="fas fa-ban"></i> Rejected</span>`}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPaymentFilter = btn.getAttribute('data-filter');
            renderPayments();
        });
    });
    
    // Approve/Reject buttons
    document.querySelectorAll('.btn-approve').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const amount = parseInt(btn.getAttribute('data-amount'));
            const userName = btn.getAttribute('data-user');
            if (confirm(`Approve payment of ₦${amount.toLocaleString()} from ${userName}?`)) {
                await approvePayment(id, amount, userName);
            }
        });
    });
    
    document.querySelectorAll('.btn-reject').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const amount = parseInt(btn.getAttribute('data-amount'));
            const userName = btn.getAttribute('data-user');
            if (confirm(`Reject payment of ₦${amount.toLocaleString()} from ${userName}?`)) {
                await rejectPayment(id, amount, userName);
            }
        });
    });
}

// ============================================
// USERS RENDER
// ============================================
async function renderUsers() {
    const container = document.getElementById('users-section');
    if (!container) return;
    
    const students = await loadStudents();
    
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-users"></i> User Management</h2><button id="exportUsersBtn" class="btn-outline"><i class="fas fa-download"></i> Export CSV</button></div>
        <div class="users-list"><div class="table-responsive"><table class="users-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Wallet Balance</th><th>Joined</th></tr></thead><tbody>
            ${students.map(s => `<tr><td><strong>${escapeHtml(s.name)}</strong></td><td>${s.email}</td><td>${s.role || 'Student'}</td><td>₦${(s.wallet_balance || 0).toLocaleString()}</td><td>${new Date(s.created_at).toLocaleDateString()}</td></tr>`).join('')}
        </tbody></table></div></div>
    `;
    
    document.getElementById('exportUsersBtn')?.addEventListener('click', () => {
        let csv = "Name,Email,Role,Wallet Balance,Joined\n";
        students.forEach(s => {
            csv += `"${s.name || ''}","${s.email}","${s.role || 'Student'}","${s.wallet_balance || 0}","${new Date(s.created_at).toLocaleDateString()}"\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Users exported successfully!', 'success');
    });
}

// ============================================
// INVENTORY RENDER
// ============================================
async function renderInventory() {
    const container = document.getElementById('inventory-section');
    if (!container) return;
    
    const { data: products } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-boxes"></i> Inventory Management</h2><button id="addProductBtn" class="btn-primary"><i class="fas fa-plus"></i> Add Product</button></div>
        <div class="inventory-stats"><div class="inv-stat"><span>Total Products</span><strong>${products?.length || 0}</strong></div><div class="inv-stat"><span>Low Stock Alerts</span><strong>${products?.filter(p => p.stock_quantity < 10).length || 0}</strong></div></div>
        <div class="inventory-grid">${products?.map(p => `<div class="inventory-card ${p.stock_quantity < 10 ? 'low-stock' : ''}"><div class="inventory-card-header"><h4>${escapeHtml(p.name)}</h4><span>${p.category}</span></div><div class="inventory-stock">Stock: ${p.stock_quantity || 0} units</div><div class="inventory-price">₦${(p.price || 0).toLocaleString()}</div><div class="inventory-actions"><button class="btn-outline edit-product" data-id="${p.id}">Edit</button><button class="btn-danger delete-product" data-id="${p.id}">Delete</button></div></div>`).join('') || '<div class="empty-state">No products found</div>'}</div>
    `;
    
    document.getElementById('addProductBtn')?.addEventListener('click', () => openProductModal());
    document.querySelectorAll('.edit-product').forEach(btn => btn.addEventListener('click', () => openProductModal(btn.dataset.id)));
}

// ============================================
// FINANCE RENDER
// ============================================
async function renderFinance() {
    const container = document.getElementById('finance-section');
    if (!container) return;
    
    const payments = await loadPayments();
    const approvedPayments = payments.filter(p => p.status === 'approved');
    const totalRevenue = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
    
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-chart-line"></i> Financial Management</h2></div>
        <div class="finance-stats"><div class="finance-card"><h4>Total Revenue</h4><div class="amount">₦${totalRevenue.toLocaleString()}</div></div><div class="finance-card"><h4>Total Transactions</h4><div class="amount">${payments.length}</div></div></div>
        <div class="revenue-breakdown"><h3>Recent Transactions</h3><div class="breakdown-list">${approvedPayments.slice(0, 10).map(p => `<div class="breakdown-item"><span>${p.user_name || p.user_email}</span><strong>₦${p.amount.toLocaleString()}</strong></div>`).join('') || '<div class="empty-state">No transactions yet</div>'}</div></div>
    `;
}

// ============================================
// OTHER RENDER FUNCTIONS (Placeholders)
// ============================================
async function renderPostsManager() {
    const container = document.getElementById('posts-section');
    if (!container) return;
    container.innerHTML = `<div class="tab-header"><h2><i class="fas fa-pen"></i> Website Content Manager</h2><button id="addPostBtn" class="btn-primary">New Post</button></div><div class="empty-state">Posts manager - Coming soon</div>`;
}

async function renderSubmissions() {
    const container = document.getElementById('submissions-section');
    if (!container) return;
    container.innerHTML = `<div class="tab-header"><h2><i class="fas fa-briefcase"></i> User Submissions</h2></div><div class="empty-state">Submissions manager - Coming soon</div>`;
}

async function renderEvents() {
    const container = document.getElementById('events-section');
    if (!container) return;
    container.innerHTML = `<div class="tab-header"><h2><i class="fas fa-calendar"></i> Hosted Events</h2><button id="addEventBtn" class="btn-primary">Create Event</button></div><div class="empty-state">Events manager - Coming soon</div>`;
}

async function renderContacts() {
    const container = document.getElementById('contacts-section');
    if (!container) return;
    container.innerHTML = `<div class="tab-header"><h2><i class="fas fa-address-book"></i> Contacts</h2><button id="addContactBtn" class="btn-primary">Add Contact</button></div><div class="empty-state">Contacts manager - Coming soon</div>`;
}

async function renderPartnerships() {
    const container = document.getElementById('partnerships-section');
    if (!container) return;
    container.innerHTML = `<div class="tab-header"><h2><i class="fas fa-handshake"></i> Partnership Agreements</h2><button id="addPartnershipBtn" class="btn-primary">New Partnership</button></div><div class="empty-state">Partnerships manager - Coming soon</div>`;
}

async function renderPeering() {
    const container = document.getElementById('peering-section');
    if (!container) return;
    container.innerHTML = `<div class="tab-header"><h2><i class="fas fa-chalkboard-user"></i> Instructor to Student Matching</h2></div><div class="empty-state">Peering system - Coming soon</div>`;
}

async function renderOffers() {
    const container = document.getElementById('offers-section');
    if (!container) return;
    container.innerHTML = `<div class="tab-header"><h2><i class="fas fa-briefcase"></i> Student Work Offers</h2><button id="addOfferBtn" class="btn-primary">Create Offer</button></div><div class="empty-state">Work offers - Coming soon</div>`;
}

async function renderSales() {
    const container = document.getElementById('sales-section');
    if (!container) return;
    container.innerHTML = `<div class="tab-header"><h2><i class="fas fa-chart-simple"></i> Store Sales</h2></div><div class="empty-state">Sales data - Coming soon</div>`;
}

// ============================================
// APPROVE/REJECT PAYMENT FUNCTIONS
// ============================================
async function approvePayment(paymentId, amount, userName) {
    try {
        const { data: payment } = await supabase.from('payment_requests').select('*').eq('id', paymentId).single();
        
        await supabase.from('payment_requests').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', paymentId);
        
        const { data: user } = await supabase.from('users').select('wallet_balance').eq('id', payment.user_id).single();
        const newBalance = (user?.wallet_balance || 0) + payment.amount;
        await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', payment.user_id);
        
        showToast(`✅ Payment of ₦${amount.toLocaleString()} from ${userName} approved!`, 'success');
        await renderPayments();
        await renderDashboard();
    } catch (error) {
        console.error('Error approving payment:', error);
        showToast('Error approving payment', 'error');
    }
}

async function rejectPayment(paymentId, amount, userName) {
    try {
        await supabase.from('payment_requests').update({ status: 'rejected', admin_notes: 'Payment rejected by admin' }).eq('id', paymentId);
        showToast(`❌ Payment of ₦${amount.toLocaleString()} from ${userName} rejected`, 'info');
        await renderPayments();
        await renderDashboard();
    } catch (error) {
        console.error('Error rejecting payment:', error);
        showToast('Error rejecting payment', 'error');
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function renderRecentPayments(payments) {
    if (!payments.length) return '<div class="empty-state">No payments yet</div>';
    return payments.map(p => `
        <div class="payment-item ${p.status}">
            <div class="payment-info"><div class="payment-amount">₦${p.amount.toLocaleString()}</div><div class="payment-date">${new Date(p.submitted_at).toLocaleDateString()}</div><div class="payment-ref">${p.user_name || p.user_email}</div></div>
            <div class="payment-status ${p.status}">${p.status}</div>
        </div>
    `).join('');
}

async function loadPayments() {
    try {
        const { data, error } = await supabase.from('payment_requests').select('*').order('submitted_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading payments:', error);
        return [];
    }
}

async function loadStudents() {
    try {
        const { data, error } = await supabase.from('users').select('*').eq('role', 'student').order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        return [];
    }
}

async function refreshAllData() {
    await renderPayments();
    await renderDashboard();
}

function openProductModal(productId = null) {
    showToast('Product management coming soon', 'info');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// INITIALIZE ADMIN DASHBOARD
// ============================================
async function initAdminDashboard() {
    console.log('Initializing admin dashboard...');
    
    // Initialize theme first
    initTheme();
    
    const isAuth = await checkAuth();
    if (!isAuth) return;
    
    createContentSections();
    buildSidebar();
    await renderDashboard();
    
    // Setup auto-refresh every 30 seconds
    setInterval(async () => {
        if (currentTab === 'payments') await renderPayments();
        else if (currentTab === 'dashboard') await renderDashboard();
    }, 30000);
    
    console.log(`Admin dashboard initialized for role: ${currentRole}`);
}

// Start the dashboard
initAdminDashboard();
