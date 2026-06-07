// ============================================
// GLIIMU DASHBOARD - MODULAR VERSION
// Works with your existing wallet.js, toast.js
// ============================================

// Import modules
import { fetchWallet, displayWalletBalance, displayTransactions, requestTopUp } from '../modules/wallet.js';
import { showToast } from '../modules/toast.js';

// Global state
let currentUser = null;
let currentRole = 'student';
let currentTab = 'dashboard';
let allMaterials = [];

// Role-based tab configurations
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

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// ============================================
// USER DATA
// ============================================

function loadUserData() {
    const savedUser = localStorage.getItem('glimu_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        currentRole = currentUser.role?.toLowerCase() || 'student';
    } else {
        currentUser = {
            id: 'demo_001',
            name: 'Alex Creator',
            email: 'alex@example.com',
            role: 'student',
            plan: 'basic',
            avatar: 'https://ui-avatars.com/api/?name=Alex+Creator&background=fbb040&color=fff'
        };
        currentRole = 'student';
        localStorage.setItem('glimu_user', JSON.stringify(currentUser));
    }
    
    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');
    const avatarImg = document.querySelector('.user-avatar img');
    
    if (userNameEl) userNameEl.textContent = currentUser.name;
    if (userRoleEl) userRoleEl.textContent = currentUser.role || 'Student';
    if (avatarImg) {
        avatarImg.src = currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=fbb040&color=fff`;
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
// TAB DATA LOADING
// ============================================

function loadTabData(tabId) {
    switch(tabId) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'library':
            renderLibraryTab();
            break;
        case 'wallet':
            renderWallet();
            break;
        case 'settings':
            renderSettings();
            break;
        case 'students':
            renderStudents();
            break;
        case 'users':
            renderUsers();
            break;
        case 'finance':
            renderFinance();
            break;
        case 'projects':
            renderProjects();
            break;
        default:
            renderDashboard();
    }
}

// ============================================
// DASHBOARD RENDER
// ============================================

async function renderDashboard() {
    const container = document.getElementById('dashboard-section');
    if (!container) return;
    
    const usage = JSON.parse(localStorage.getItem('glimu_usage_guest') || '{"booksRead":0,"bundlesDownloaded":0}');
    const savedItems = JSON.parse(localStorage.getItem('savedLibraryItems') || '[]');
    
    // Fetch wallet balance from wallet module
    const wallet = await fetchWallet();
    const walletBalance = wallet ? wallet.balance : 25000;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Dashboard</h2>
                <p>Welcome back, ${currentUser.name}!</p>
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
                    <div class="stat-value">₦${walletBalance.toLocaleString()}</div>
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
        
        <div class="data-table">
            <h3>Quick Links</h3>
            <table style="width: 100%;">
                <tbody>
                    <tr><td style="padding: 12px;">📚 <a href="/library.html" style="color: var(--text-primary); text-decoration: none;">Browse Library</a></td></tr>
                    <tr><td style="padding: 12px;">⭐ <a href="#" id="myShelfLink" style="color: var(--text-primary); text-decoration: none;">My Saved Items (${savedItems.length})</a></td></tr>
                    <tr><td style="padding: 12px;">💰 <a href="#" id="walletLink" style="color: var(--text-primary); text-decoration: none;">Wallet & Subscription</a></td></tr>
                </tbody>
            </table>
        </div>
    `;
    
    // Event listeners
    document.getElementById('goToLibraryBtn')?.addEventListener('click', () => {
        window.location.href = '/library.html';
    });
    
    document.getElementById('viewSavedBtn')?.addEventListener('click', () => {
        switchTab('library');
    });
    
    document.getElementById('upgradePlanCard')?.addEventListener('click', () => {
        openModal('upgradeModal');
    });
    
    document.getElementById('myShelfLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab('library');
    });
    
    document.getElementById('walletLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab('wallet');
    });
    
    document.getElementById('quickAddFunds')?.addEventListener('click', () => {
        openModal('addFundsModal');
    });
}

// ============================================
// LIBRARY TAB
// ============================================

async function renderLibraryTab() {
    const container = document.getElementById('library-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Loading your library...</div>';
    
    try {
        let response = await fetch('../../backend/data/library.json');
        if (!response.ok) response = await fetch('../backend/data/library.json');
        if (!response.ok) response = await fetch('/backend/data/library.json');
        if (!response.ok) response = await fetch('https://raw.githubusercontent.com/Gliimu/Gliimu/main/backend/data/library.json');
        
        if (!response.ok) throw new Error('Failed to load');
        
        const data = await response.json();
        allMaterials = data.materials || [];
        
        const savedItems = JSON.parse(localStorage.getItem('savedLibraryItems') || '[]');
        const recentlyViewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
        
        const savedMaterials = allMaterials.filter(m => savedItems.includes(m.id));
        const recentMaterials = allMaterials.filter(m => recentlyViewed.includes(m.id)).slice(0, 6);
        
        container.innerHTML = `
            <div class="section-header">
                <div>
                    <h2>My Library</h2>
                    <p>Your saved books and recently viewed items</p>
                </div>
                <button class="btn-primary" id="browseLibraryBtn">Browse All Books</button>
            </div>
            
            ${savedMaterials.length > 0 ? `
                <h3 style="margin: 1rem 0 0.5rem;">📚 Saved Items (${savedMaterials.length})</h3>
                <div class="library-grid">
                    ${savedMaterials.map(item => `
                        <div class="library-item" data-id="${item.id}">
                            <div class="library-item-cover" style="background-image: url('${item.image}'); background-size: cover;"></div>
                            <div class="library-item-info">
                                <div class="library-item-title">${escapeHtml(item.title)}</div>
                                <div class="library-item-type">${item.type === 'book' ? '📖 Book' : '📦 Bundle'}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="empty-state">
                    <i class="fas fa-bookmark"></i>
                    <h3>Your shelf is empty</h3>
                    <p>Save books and bundles to see them here</p>
                    <button class="btn-primary" id="goToLibraryEmptyBtn">Explore Library</button>
                </div>
            `}
            
            ${recentMaterials.length > 0 ? `
                <h3 style="margin: 2rem 0 0.5rem;">🕐 Recently Viewed</h3>
                <div class="library-grid">
                    ${recentMaterials.map(item => `
                        <div class="library-item" data-id="${item.id}">
                            <div class="library-item-cover" style="background-image: url('${item.image}'); background-size: cover;"></div>
                            <div class="library-item-info">
                                <div class="library-item-title">${escapeHtml(item.title)}</div>
                                <div class="library-item-type">${item.type === 'book' ? '📖 Book' : '📦 Bundle'}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;
        
        document.querySelectorAll('.library-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.getAttribute('data-id');
                const material = allMaterials.find(m => m.id === id);
                if (material) openViewModal(material);
            });
        });
        
        document.getElementById('browseLibraryBtn')?.addEventListener('click', () => {
            window.location.href = '/library.html';
        });
        
        document.getElementById('goToLibraryEmptyBtn')?.addEventListener('click', () => {
            window.location.href = '/library.html';
        });
        
    } catch (error) {
        console.error('Error loading library:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Unable to load library</h3>
                <button class="btn-primary" onclick="location.reload()">Retry</button>
            </div>
        `;
    }
}

// ============================================
// WALLET RENDER (Using wallet module)
// ============================================

async function renderWallet() {
    const container = document.getElementById('wallet-section');
    if (!container) return;
    
    const wallet = await fetchWallet();
    const walletBalance = wallet ? wallet.balance : 25000;
    const userPlan = currentUser.plan || 'basic';
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Wallet</h2>
                <p>Manage your funds and subscription</p>
            </div>
            <button class="btn-primary" id="addFundsBtn">Add Funds</button>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-wallet"></i></div>
                <div class="stat-info">
                    <h3>Current Balance</h3>
                    <div class="stat-value" id="walletBalanceDisplay">₦${walletBalance.toLocaleString()}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-crown"></i></div>
                <div class="stat-info">
                    <h3>Current Plan</h3>
                    <div class="stat-value">${userPlan.toUpperCase()}</div>
                    <button class="upgrade-plan-btn" id="upgradePlanWalletBtn">Upgrade</button>
                </div>
            </div>
        </div>
        
        <div class="data-table">
            <h3>Transaction History</h3>
            <div id="transactionList"></div>
        </div>
    `;
    
    // Display transactions using wallet module
    await displayTransactions('transactionList');
    
    document.getElementById('addFundsBtn')?.addEventListener('click', () => openModal('addFundsModal'));
    document.getElementById('upgradePlanWalletBtn')?.addEventListener('click', () => openModal('upgradeModal'));
}

// ============================================
// SETTINGS RENDER
// ============================================

function renderSettings() {
    const container = document.getElementById('settings-section');
    if (!container) return;
    
    const isDark = document.body.classList.contains('dark-mode');
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Settings</h2>
                <p>Manage your account preferences</p>
            </div>
        </div>
        <div class="data-table" style="padding: 1.5rem;">
            <form id="settingsForm">
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem;">Full Name</label>
                    <input type="text" id="fullNameInput" value="${currentUser.name}" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary);">
                </div>
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem;">Email</label>
                    <input type="email" id="emailInput" value="${currentUser.email}" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary);">
                </div>
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem;">Theme Preference</label>
                    <select id="themeSelect" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary);">
                        <option value="dark" ${isDark ? 'selected' : ''}>Dark</option>
                        <option value="light" ${!isDark ? 'selected' : ''}>Light</option>
                    </select>
                </div>
                <button type="submit" class="btn-primary">Save Changes</button>
            </form>
        </div>
    `;
    
    document.getElementById('themeSelect')?.addEventListener('change', () => {
        const newTheme = document.getElementById('themeSelect').value;
        if (newTheme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        localStorage.setItem('theme', newTheme);
    });
    
    document.getElementById('settingsForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const newName = document.getElementById('fullNameInput').value;
        const newEmail = document.getElementById('emailInput').value;
        currentUser.name = newName;
        currentUser.email = newEmail;
        localStorage.setItem('glimu_user', JSON.stringify(currentUser));
        document.getElementById('userName').textContent = newName;
        showToast('Settings saved successfully!', 'success');
    });
}

// ============================================
// OTHER ROLE RENDERS
// ============================================

function renderStudents() {
    const container = document.getElementById('students-section');
    if (!container) return;
    container.innerHTML = `
        <div class="section-header"><div><h2>My Students</h2><p>Track your student progress</p></div></div>
        <div class="data-table">
            <table style="width: 100%;">
                <thead><tr><th>Name</th><th>Course</th><th>Progress</th></tr></thead>
                <tbody>
                    <tr><td>Alice Johnson</td><td>Video Production</td><td>75%</td></tr>
                    <tr><td>Bob Williams</td><td>UI/UX Design</td><td>45%</td></tr>
                </tbody>
            </table>
        </div>
    `;
}

function renderUsers() {
    const container = document.getElementById('users-section');
    if (!container) return;
    container.innerHTML = `<div class="section-header"><div><h2>User Management</h2><p>Manage platform users</p></div></div><div class="data-table"><p style="padding: 2rem; text-align: center;">User management interface coming soon</p></div>`;
}

function renderFinance() {
    const container = document.getElementById('finance-section');
    if (!container) return;
    container.innerHTML = `<div class="section-header"><div><h2>Finance</h2><p>Platform revenue and analytics</p></div></div><div class="data-table"><p style="padding: 2rem; text-align: center;">Finance dashboard coming soon</p></div>`;
}

function renderProjects() {
    const container = document.getElementById('projects-section');
    if (!container) return;
    container.innerHTML = `<div class="section-header"><div><h2>My Projects</h2><p>Manage your projects</p></div></div><div class="data-table"><p style="padding: 2rem; text-align: center;">No active projects</p></div>`;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

function openViewModal(item) {
    const modal = document.getElementById('viewBookModal');
    if (!modal) return;
    
    document.getElementById('viewBookTitle').textContent = item.title;
    document.getElementById('viewBookImage').src = item.image;
    document.getElementById('viewBookDescription').textContent = item.description || 'No description available.';
    
    document.getElementById('readBookBtn').onclick = () => {
        window.location.href = `/library.html?id=${item.id}`;
    };
    
    modal.classList.add('active');
}

// ============================================
// MODAL SETUP
// ============================================

function setupModals() {
    const closeButtons = ['closeUpgradeModal', 'closeAddFundsModal', 'closeViewBookModal', 'closeViewBookFooterBtn'];
    closeButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.onclick = closeModal;
    });
    
    ['upgradeModal', 'addFundsModal', 'viewBookModal'].forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.onclick = (e) => {
                if (e.target === modal) closeModal();
            };
        }
    });
    
    document.querySelectorAll('.select-plan-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const planCard = btn.closest('.plan-card');
            const plan = planCard.getAttribute('data-plan');
            showToast(`Upgrading to ${plan.toUpperCase()} plan. Payment will be processed.`, 'info');
            closeModal();
        });
    });
    
    document.querySelectorAll('.amount-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const customInput = document.getElementById('customAmount');
            if (customInput) customInput.value = '';
        });
    });
    
    document.getElementById('confirmPayment')?.addEventListener('click', async () => {
        const activeBtn = document.querySelector('.amount-btn.active');
        const customAmount = document.getElementById('customAmount')?.value;
        let amount = 0;
        
        if (activeBtn) {
            amount = parseInt(activeBtn.getAttribute('data-amount'));
        } else if (customAmount) {
            amount = parseInt(customAmount);
        }
        
        if (amount > 0 && amount >= 100) {
            // Use the wallet module's requestTopUp function
            const success = await requestTopUp(amount, null);
            if (success) {
                closeModal();
                setTimeout(() => renderWallet(), 500);
            }
        } else {
            showToast('Please select or enter a valid amount (minimum ₦100)', 'error');
        }
    });
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
// MOBILE SIDEBAR
// ============================================

function setupMobileSidebar() {
    const toggleBtn = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('dashboardSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (toggleBtn && sidebar && overlay) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            overlay.classList.toggle('active');
        });
        
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
        });
    }
}

// ============================================
// INITIALIZE DASHBOARD
// ============================================

async function initDashboard() {
    console.log('Initializing dashboard...');
    
    loadUserData();
    initTheme();
    createContentSections();
    buildSidebar();
    setupModals();
    setupMobileSidebar();
    
    const themeToggleBtn = document.getElementById('themeToggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }
    
    await renderDashboard();
    
    console.log('Dashboard initialized');
}

// Start the dashboard
document.addEventListener('DOMContentLoaded', initDashboard);

// Export for global access
window.openModal = openModal;
window.closeModal = closeModal;
