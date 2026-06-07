// ============================================
// GLIIMU DASHBOARD - FIXED AUTHENTICATION
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// Global state
let currentUser = null;
let currentUserProfile = null;
let currentRole = 'student';
let currentTab = 'dashboard';
let allMaterials = [];

// ============================================
// CHECK AUTHENTICATION - FIXED
// ============================================

async function checkAuth() {
    console.log('Checking authentication...');
    
    // First check localStorage
    const localUser = localStorage.getItem('glimu_user');
    if (localUser) {
        currentUser = JSON.parse(localUser);
        currentRole = currentUser.role || 'student';
        console.log('User found in localStorage:', currentUser);
        return true;
    }
    
    // Check Supabase session
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
        console.error('Session error:', error);
        return false;
    }
    
    if (session) {
        console.log('Supabase session found');
        
        // Get user profile from database
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single();
        
        if (profileError) {
            console.error('Profile fetch error:', profileError);
        }
        
        currentUser = {
            id: session.user.id,
            email: session.user.email,
            name: profile?.name || session.user.user_metadata?.name || 'User',
            role: profile?.role || 'student',
            plan: profile?.plan || 'basic',
            walletBalance: profile?.wallet_balance || 25000,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.name || 'User')}&background=fbb040&color=fff`
        };
        
        localStorage.setItem('glimu_user', JSON.stringify(currentUser));
        currentRole = currentUser.role;
        
        console.log('User loaded from Supabase:', currentUser);
        return true;
    }
    
    console.log('No user found, redirecting to home');
    showToast('Please login to access your dashboard', 'info');
    
    setTimeout(() => {
        window.location.href = '/index.html';
    }, 1500);
    
    return false;
}

// ============================================
// LOAD USER PROFILE FROM APPLICATION
// ============================================

async function loadUserProfile() {
    // If we have a user but no profile in users table, try to get from applications
    if (currentUser && !currentUser.walletBalance) {
        try {
            // Try to find the user in applications table by email or username
            const { data, error } = await supabase
                .from('applications')
                .select('*')
                .eq('username', currentUser.name.toLowerCase().replace(/\s/g, '.'))
                .single();
            
            if (!error && data) {
                console.log('Found application data:', data);
                
                // Create user profile from application
                const { error: insertError } = await supabase
                    .from('users')
                    .insert([{
                        id: currentUser.id,
                        name: data.full_name,
                        email: currentUser.email,
                        role: data.role,
                        plan: 'basic',
                        wallet_balance: 25000
                    }]);
                
                if (insertError) {
                    console.error('Error creating user profile:', insertError);
                } else {
                    currentUser.role = data.role;
                    currentUser.name = data.full_name;
                    localStorage.setItem('glimu_user', JSON.stringify(currentUser));
                }
            }
        } catch (error) {
            console.error('Error loading application data:', error);
        }
    }
}

// ============================================
// ROLE-BASED TAB CONFIGURATION
// ============================================

const roleTabs = {
    student: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'library', name: 'Library', icon: 'fas fa-book' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    instructor: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'students', name: 'My Students', icon: 'fas fa-users' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    admin: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'users', name: 'Users', icon: 'fas fa-users-cog' },
        { id: 'finance', name: 'Finance', icon: 'fas fa-chart-line' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    partner: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'projects', name: 'Projects', icon: 'fas fa-project-diagram' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    other: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ]
};

// ============================================
// THEME HANDLING
// ============================================

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    }
}

// ============================================
// UPDATE UI WITH USER DATA
// ============================================

function updateUI() {
    if (!currentUser) return;
    
    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');
    const avatarImg = document.getElementById('userAvatarImg');
    
    if (userNameEl) userNameEl.textContent = currentUser.name || 'User';
    if (userRoleEl) userRoleEl.textContent = currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
    if (avatarImg) {
        avatarImg.src = currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name || 'User')}&background=fbb040&color=fff`;
    }
}

// ============================================
// SIDEBAR NAVIGATION
// ============================================

function buildSidebar() {
    const tabs = roleTabs[currentRole] || roleTabs.other;
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
    
    document.querySelectorAll('.dashboard-section').forEach(section => {
        section.classList.remove('active');
    });
    
    const activeSection = document.getElementById(`${tabId}-section`);
    if (activeSection) {
        activeSection.classList.add('active');
    }
    
    loadTabData(tabId);
}

// ============================================
// CREATE CONTENT SECTIONS
// ============================================

function createContentSections() {
    const dashboardContent = document.getElementById('dashboardContent');
    if (!dashboardContent) return;
    
    const tabs = roleTabs[currentRole] || roleTabs.other;
    
    dashboardContent.innerHTML = tabs.map(tab => `
        <div id="${tab.id}-section" class="dashboard-section ${tab.id === 'dashboard' ? 'active' : ''}">
            <!-- Content will be loaded dynamically -->
        </div>
    `).join('');
}

// ============================================
// DASHBOARD RENDER (Simple for now)
// ============================================

async function renderDashboard() {
    const container = document.getElementById('dashboard-section');
    if (!container) return;
    
    const usage = JSON.parse(localStorage.getItem('glimu_usage_guest') || '{"booksRead":0,"bundlesDownloaded":0}');
    const savedItems = JSON.parse(localStorage.getItem('savedLibraryItems') || '[]');
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Dashboard</h2>
                <p>Welcome back, ${currentUser?.name || 'Creator'}!</p>
            </div>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-book"></i></div>
                <div class="stat-info">
                    <h3>Books Read</h3>
                    <div class="stat-value">${usage.booksRead || 0}</div>
                    <div class="stat-sub">This month</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-box"></i></div>
                <div class="stat-info">
                    <h3>Bundles Downloaded</h3>
                    <div class="stat-value">${usage.bundlesDownloaded || 0}</div>
                    <div class="stat-sub">This month</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-bookmark"></i></div>
                <div class="stat-info">
                    <h3>Saved Items</h3>
                    <div class="stat-value">${savedItems.length}</div>
                    <div class="stat-sub">In your shelf</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-wallet"></i></div>
                <div class="stat-info">
                    <h3>Wallet Balance</h3>
                    <div class="stat-value">₦${currentUser?.walletBalance?.toLocaleString() || '25,000'}</div>
                    <button class="add-funds-small" id="quickAddFunds">Add Funds</button>
                </div>
            </div>
        </div>
        
        <div class="action-cards">
            <div class="action-card" id="goToLibraryBtn">
                <i class="fas fa-book-open"></i>
                <h4>Go to Library</h4>
                <p>Browse books and bundles</p>
            </div>
            <div class="action-card" id="viewSavedBtn">
                <i class="fas fa-bookmark"></i>
                <h4>My Shelf</h4>
                <p>${savedItems.length} saved items</p>
            </div>
            <div class="action-card" id="upgradePlanCard">
                <i class="fas fa-crown"></i>
                <h4>Upgrade Plan</h4>
                <p>Get more access</p>
            </div>
        </div>
    `;
    
    document.getElementById('goToLibraryBtn')?.addEventListener('click', () => {
        window.location.href = '/library.html';
    });
    
    document.getElementById('viewSavedBtn')?.addEventListener('click', () => {
        switchTab('library');
    });
    
    document.getElementById('upgradePlanCard')?.addEventListener('click', () => {
        openModal('upgradeModal');
    });
    
    document.getElementById('quickAddFunds')?.addEventListener('click', () => {
        switchTab('wallet');
    });
}

// ============================================
// PLACEHOLDER RENDER FUNCTIONS
// ============================================

function renderLibraryTab() {
    const container = document.getElementById('library-section');
    if (!container) return;
    container.innerHTML = `
        <div class="section-header">
            <div><h2>My Library</h2><p>Coming soon - Your saved books and bundles</p></div>
            <button class="btn-primary" onclick="window.location.href='/library.html'">Browse Library</button>
        </div>
        <div class="empty-state">
            <i class="fas fa-book"></i>
            <h3>Library coming soon</h3>
            <p>Your saved items will appear here</p>
        </div>
    `;
}

function renderWallet() {
    const container = document.getElementById('wallet-section');
    if (!container) return;
    container.innerHTML = `
        <div class="section-header">
            <div><h2>Wallet</h2><p>Manage your funds and subscription</p></div>
        </div>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-wallet"></i></div>
                <div class="stat-info">
                    <h3>Current Balance</h3>
                    <div class="stat-value">₦${currentUser?.walletBalance?.toLocaleString() || '25,000'}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-crown"></i></div>
                <div class="stat-info">
                    <h3>Current Plan</h3>
                    <div class="stat-value">${currentUser?.plan?.toUpperCase() || 'BASIC'}</div>
                    <button class="upgrade-plan-btn" id="upgradePlanBtn">Upgrade</button>
                </div>
            </div>
        </div>
        <div class="data-table">
            <h3>Transaction History</h3>
            <div style="padding: 1rem; text-align: center;">No transactions yet</div>
        </div>
    `;
    
    document.getElementById('upgradePlanBtn')?.addEventListener('click', () => openModal('upgradeModal'));
}

function renderSettings() {
    const container = document.getElementById('settings-section');
    if (!container) return;
    container.innerHTML = `
        <div class="section-header">
            <div><h2>Settings</h2><p>Manage your account preferences</p></div>
        </div>
        <div class="data-table" style="padding: 1.5rem;">
            <p>Settings coming soon...</p>
        </div>
    `;
}

function renderStudents() { document.getElementById('students-section').innerHTML = '<div class="section-header"><h2>My Students</h2></div><div class="data-table"><p>Coming soon</p></div>'; }
function renderUsers() { document.getElementById('users-section').innerHTML = '<div class="section-header"><h2>User Management</h2></div><div class="data-table"><p>Coming soon</p></div>'; }
function renderFinance() { document.getElementById('finance-section').innerHTML = '<div class="section-header"><h2>Finance</h2></div><div class="data-table"><p>Coming soon</p></div>'; }
function renderProjects() { document.getElementById('projects-section').innerHTML = '<div class="section-header"><h2>Projects</h2></div><div class="data-table"><p>Coming soon</p></div>'; }

function loadTabData(tabId) {
    switch(tabId) {
        case 'dashboard': renderDashboard(); break;
        case 'library': renderLibraryTab(); break;
        case 'wallet': renderWallet(); break;
        case 'settings': renderSettings(); break;
        case 'students': renderStudents(); break;
        case 'users': renderUsers(); break;
        case 'finance': renderFinance(); break;
        case 'projects': renderProjects(); break;
        default: renderDashboard();
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal() {
    document.querySelectorAll('.modal.active').forEach(modal => {
        modal.classList.remove('active');
    });
    document.body.style.overflow = '';
}

// ============================================
// INITIALIZE DASHBOARD
// ============================================

async function initDashboard() {
    console.log('Initializing dashboard...');
    
    // Check authentication first
    const isAuth = await checkAuth();
    if (!isAuth) return;
    
    // Load user profile
    await loadUserProfile();
    
    // Update UI with user data
    updateUI();
    
    // Initialize theme
    initTheme();
    
    // Create content sections
    createContentSections();
    
    // Build sidebar
    buildSidebar();
    
    // Load initial dashboard
    await renderDashboard();
    
    console.log('Dashboard initialized successfully');
}

// Start the dashboard
initDashboard();

// Make functions global
window.openModal = openModal;
window.closeModal = closeModal;
