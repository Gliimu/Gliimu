// ============================================
// GLIIMU DASHBOARD - COMPLETE VERSION
// With Premium/Standard purchase system
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';
import { 
    getWalletBalance, 
    getUserAccess, 
    purchasePremium, 
    purchaseStandard, 
    purchasePlatform,
    getTransactionHistory,
    getPurchaseHistory,
    isPremium,
    PRICING
} from '../modules/wallet.js';

// ============================================
// GLOBAL STATE
// ============================================
let currentUser = null;
let currentUserProfile = null;
let currentRole = 'student';
let currentTab = 'dashboard';
let allMaterials = [];
let userStats = null;
let savedItems = [];
let recentlyViewed = [];
let currentWalletBalance = 0;

// ============================================
// CHECK AUTHENTICATION
// ============================================
async function checkAuth() {
    console.log('Checking authentication...');
    
    // Check localStorage first
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
        await loadUserFromSupabase(session.user.id);
        return true;
    }
    
    console.log('No user found, redirecting to signin');
    showToast('Please login to access your dashboard', 'info');
    
    setTimeout(() => {
        window.location.href = '/signin.html';
    }, 1500);
    
    return false;
}

// ============================================
// LOAD USER FROM SUPABASE
// ============================================
async function loadUserFromSupabase(userId) {
    try {
        // Get user profile
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (profileError) throw profileError;
        
        // Get user stats for current month
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        
        const { data: stats, error: statsError } = await supabase
            .from('user_stats')
            .select('*')
            .eq('user_id', userId)
            .eq('month', currentMonth)
            .eq('year', currentYear)
            .maybeSingle();
        
        if (statsError && statsError.code !== 'PGRST116') {
            console.error('Stats fetch error:', statsError);
        }
        
        userStats = stats || { books_read: 0, bundles_downloaded: 0 };
        
        // Get saved items
        const { data: saved, error: savedError } = await supabase
            .from('user_saved_items')
            .select('*')
            .eq('user_id', userId)
            .order('saved_at', { ascending: false });
        
        if (!savedError) savedItems = saved || [];
        
        // Get recently viewed
        const { data: recent, error: recentError } = await supabase
            .from('user_recently_viewed')
            .select('*')
            .eq('user_id', userId)
            .order('viewed_at', { ascending: false })
            .limit(10);
        
        if (!recentError) recentlyViewed = recent || [];
        
        currentUserProfile = profile;
        currentWalletBalance = profile.wallet_balance || 14500;
        currentUser = {
            id: userId,
            name: profile.name || profile.full_name || 'User',
            email: profile.email,
            role: profile.role || 'student',
            plan: profile.plan || 'basic',
            subscriptionTier: profile.subscription_tier || 'premium',
            walletBalance: profile.wallet_balance || 14500,
            avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=fbb040&color=fff`
        };
        currentRole = currentUser.role;
        
        localStorage.setItem('glimu_user', JSON.stringify(currentUser));
        
        console.log('User loaded from Supabase:', currentUser);
        
    } catch (error) {
        console.error('Error loading user from Supabase:', error);
    }
}

// ============================================
// FETCH LIBRARY MATERIALS
// ============================================
async function fetchLibraryMaterials() {
    try {
        let response = await fetch('../../backend/data/library.json');
        if (!response.ok) response = await fetch('../backend/data/library.json');
        if (!response.ok) response = await fetch('/backend/data/library.json');
        if (!response.ok) response = await fetch('https://raw.githubusercontent.com/Gliimu/Gliimu/main/backend/data/library.json');
        
        if (!response.ok) throw new Error('Failed to load library');
        
        const data = await response.json();
        allMaterials = data.materials || [];
        console.log('Loaded materials:', allMaterials.length);
        
    } catch (error) {
        console.error('Error loading library:', error);
    }
}

// ============================================
// ROLE-BASED TAB CONFIGURATION
// ============================================
const roleTabs = {
    student: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'library', name: 'My Library', icon: 'fas fa-book' },
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
            <div class="loading-spinner">Loading...</div>
        </div>
    `).join('');
}

// ============================================
// LOAD TAB DATA
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
    
    const savedCount = savedItems.length;
    const walletBalance = currentUser?.walletBalance || 14500;
    const isPremiumUser = currentUser?.subscriptionTier === 'premium';
    
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
                    <div class="stat-value">${userStats?.books_read || 0}</div>
                    <div class="stat-sub">This month</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-box"></i></div>
                <div class="stat-info">
                    <h3>Bundles Downloaded</h3>
                    <div class="stat-value">${userStats?.bundles_downloaded || 0}</div>
                    <div class="stat-sub">This month</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-bookmark"></i></div>
                <div class="stat-info">
                    <h3>Saved Items</h3>
                    <div class="stat-value">${savedCount}</div>
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
        
        ${!isPremiumUser && walletBalance === 0 ? `
            <div class="warning-banner" style="background: #ef4444; color: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                ⚠️ Your wallet is empty. Add funds to continue accessing platforms.
            </div>
        ` : ''}
        
        <div class="action-cards">
            <div class="action-card" id="goToLibraryBtn">
                <i class="fas fa-book-open"></i>
                <h4>Go to Library</h4>
                <p>Browse books and bundles</p>
            </div>
            <div class="action-card" id="viewSavedBtn">
                <i class="fas fa-bookmark"></i>
                <h4>My Shelf</h4>
                <p>${savedCount} saved items</p>
            </div>
            <div class="action-card" id="goToWalletBtn">
                <i class="fas fa-wallet"></i>
                <h4>Wallet</h4>
                <p>Manage funds & subscriptions</p>
            </div>
        </div>
        
        ${recentlyViewed.length > 0 ? `
            <div class="data-table">
                <h3>Recently Viewed</h3>
                <div class="recent-grid">
                    ${recentlyViewed.slice(0, 4).map(item => `
                        <div class="recent-item" data-item-id="${item.item_id}">
                            <div class="recent-item-cover" style="background-image: url('${item.item_data?.image || ''}');"></div>
                            <div class="recent-item-title">${item.item_data?.title || 'Unknown'}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
    
    // Event listeners
    document.getElementById('goToLibraryBtn')?.addEventListener('click', () => {
        window.location.href = '/library.html';
    });
    
    document.getElementById('viewSavedBtn')?.addEventListener('click', () => {
        switchTab('library');
    });
    
    document.getElementById('goToWalletBtn')?.addEventListener('click', () => {
        switchTab('wallet');
    });
    
    document.getElementById('quickAddFunds')?.addEventListener('click', () => {
        switchTab('wallet');
    });
    
    document.querySelectorAll('.recent-item').forEach(item => {
        item.addEventListener('click', () => {
            const itemId = item.getAttribute('data-item-id');
            window.location.href = `/library.html?id=${itemId}`;
        });
    });
}

// ============================================
// LIBRARY TAB
// ============================================
async function renderLibraryTab() {
    const container = document.getElementById('library-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner">Loading your library...</div>';
    
    try {
        if (allMaterials.length === 0) {
            await fetchLibraryMaterials();
        }
        
        const savedItemIds = savedItems.map(s => s.item_id);
        const savedMaterials = allMaterials.filter(m => savedItemIds.includes(m.id));
        
        const recentItemIds = recentlyViewed.map(r => r.item_id);
        const recentMaterials = allMaterials.filter(m => recentItemIds.includes(m.id)).slice(0, 6);
        
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
                window.location.href = `/library.html?id=${id}`;
            });
        });
        
        document.getElementById('browseLibraryBtn')?.addEventListener('click', () => {
            window.location.href = '/library.html';
        });
        
        document.getElementById('goToLibraryEmptyBtn')?.addEventListener('click', () => {
            window.location.href = '/library.html';
        });
        
    } catch (error) {
        console.error('Error rendering library tab:', error);
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
// WALLET TAB - COMPLETE WITH PURCHASE SYSTEM
// ============================================
async function renderWallet() {
    const container = document.getElementById('wallet-section');
    if (!container) return;
    
    const balance = await getWalletBalance();
    const isPremiumUser = await isPremium();
    const transactions = await getTransactionHistory();
    const userAccess = await getUserAccess();
    
    const needsTopUp = balance < PRICING.premium;
    const topUpAmount = PRICING.premium - balance;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Wallet</h2>
                <p>Your balance: <strong>₦${balance.toLocaleString()}</strong></p>
            </div>
            <button class="btn-primary" id="addFundsBtn">Add Funds</button>
        </div>
        
        ${!isPremiumUser && balance < PRICING.standard ? `
            <div class="warning-banner" style="background: #ef4444; color: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                ⚠️ Your wallet is low. Add funds to continue accessing platforms.
            </div>
        ` : ''}
        
        <div class="purchase-section">
            <h3>Purchase Access</h3>
            
            <div class="purchase-card premium">
                <div class="purchase-icon">👑</div>
                <div class="purchase-info">
                    <h4>Premium (All Platforms)</h4>
                    <p>Library + Hub + Community</p>
                    <div class="price">₦${PRICING.premium.toLocaleString()}</div>
                    ${balance >= PRICING.premium ? 
                        `<button class="btn-success" id="buyPremiumBtn">Purchase Now</button>` :
                        `<button class="btn-warning" id="premiumTopUpBtn">Add ₦${topUpAmount.toLocaleString()} to Get Premium</button>`
                    }
                </div>
            </div>
            
            <div class="purchase-card standard">
                <div class="purchase-icon">📦</div>
                <div class="purchase-info">
                    <h4>Standard (Hub + Community)</h4>
                    <p>⚠️ You will forfeit remaining credit. No monthly bonuses.</p>
                    <div class="price">₦${PRICING.standard.toLocaleString()}</div>
                    <button class="btn-outline" id="buyStandardBtn">Choose Standard</button>
                </div>
            </div>
            
            <div class="purchase-card individual">
                <h4>Individual Platforms</h4>
                <div class="platform-options">
                    <div class="platform-option">
                        <span>📚 Library</span>
                        <span>₦${PRICING.library.toLocaleString()}</span>
                        <button class="btn-small" id="buyLibraryBtn">Buy</button>
                    </div>
                    <div class="platform-option">
                        <span>💬 Community</span>
                        <span>₦${PRICING.community.toLocaleString()}</span>
                        <button class="btn-small" id="buyCommunityBtn">Buy</button>
                    </div>
                    <div class="platform-option">
                        <span>📰 Hub</span>
                        <span>₦${PRICING.hub.toLocaleString()}</span>
                        <button class="btn-small" id="buyHubBtn">Buy</button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="current-access">
            <h3>Your Current Access</h3>
            <div class="access-badges">
                <div class="access-badge ${userAccess?.access_library ? 'active' : 'inactive'}">
                    ${userAccess?.access_library ? '✅' : '🔒'} Library
                </div>
                <div class="access-badge ${userAccess?.access_hub ? 'active' : 'inactive'}">
                    ${userAccess?.access_hub ? '✅' : '🔒'} Hub
                </div>
                <div class="access-badge ${userAccess?.access_community ? 'active' : 'inactive'}">
                    ${userAccess?.access_community ? '✅' : '🔒'} Community
                </div>
            </div>
        </div>
        
        <div class="transactions-section">
            <h3>Transaction History</h3>
            <div class="transactions-list">
                ${transactions.length === 0 ? '<p>No transactions yet</p>' : 
                    transactions.map(t => `
                        <div class="transaction-item">
                            <div class="transaction-desc">${t.description}</div>
                            <div class="transaction-amount ${t.amount > 0 ? 'positive' : 'negative'}">
                                ${t.amount > 0 ? '+' : ''}₦${Math.abs(t.amount).toLocaleString()}
                            </div>
                            <div class="transaction-date">${new Date(t.created_at).toLocaleDateString()}</div>
                        </div>
                    `).join('')
                }
            </div>
        </div>
    `;
    
    // Event listeners
    document.getElementById('addFundsBtn')?.addEventListener('click', () => {
        openModal('addFundsModal');
    });
    
    document.getElementById('buyPremiumBtn')?.addEventListener('click', async () => {
        const result = await purchasePremium();
        if (result === true) {
            setTimeout(() => renderWallet(), 1000);
            setTimeout(() => renderDashboard(), 1000);
        } else if (result?.needsTopUp) {
            openModal('addFundsModal');
        }
    });
    
    document.getElementById('premiumTopUpBtn')?.addEventListener('click', () => {
        openModal('addFundsModal');
    });
    
    document.getElementById('buyStandardBtn')?.addEventListener('click', async () => {
        const confirmed = confirm(
            '⚠️ WARNING ⚠️\n\n' +
            'If you choose Standard (Hub + Community):\n' +
            '• You will pay ₦13,000 from your free credit\n' +
            '• You will forfeit any remaining credit\n' +
            '• You will receive NO monthly bonuses\n' +
            '• Future purchases will be at FULL PRICE\n\n' +
            'Premium students receive RANDOM BONUSES every month!\n\n' +
            'Are you sure you want to continue?'
        );
        
        if (confirmed) {
            await purchaseStandard();
            setTimeout(() => renderWallet(), 1000);
            setTimeout(() => renderDashboard(), 1000);
        }
    });
    
    document.getElementById('buyLibraryBtn')?.addEventListener('click', async () => {
        await purchasePlatform('library');
        setTimeout(() => renderWallet(), 500);
        setTimeout(() => renderDashboard(), 500);
    });
    
    document.getElementById('buyCommunityBtn')?.addEventListener('click', async () => {
        await purchasePlatform('community');
        setTimeout(() => renderWallet(), 500);
        setTimeout(() => renderDashboard(), 500);
    });
    
    document.getElementById('buyHubBtn')?.addEventListener('click', async () => {
        await purchasePlatform('hub');
        setTimeout(() => renderWallet(), 500);
        setTimeout(() => renderDashboard(), 500);
    });
}

// ============================================
// SETTINGS RENDER
// ============================================
async function renderSettings() {
    const container = document.getElementById('settings-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Settings</h2>
                <p>Manage your account preferences</p>
            </div>
        </div>
        <div class="data-table" style="padding: 1.5rem;">
            <form id="settingsForm">
                <div class="form-group">
                    <label>Full Name</label>
                    <input type="text" id="fullNameInput" value="${currentUser?.name || ''}">
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="emailInput" value="${currentUser?.email || ''}" disabled>
                    <small>Email cannot be changed</small>
                </div>
                <div class="form-group">
                    <label>Role</label>
                    <input type="text" value="${currentRole.toUpperCase()}" disabled>
                </div>
                <button type="submit" class="btn-primary">Save Changes</button>
            </form>
        </div>
    `;
    
    document.getElementById('settingsForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = document.getElementById('fullNameInput').value;
        
        if (newName !== currentUser.name) {
            const { error } = await supabase
                .from('users')
                .update({ name: newName, full_name: newName, updated_at: new Date() })
                .eq('id', currentUser.id);
            
            if (error) {
                showToast('Failed to update name', 'error');
            } else {
                currentUser.name = newName;
                localStorage.setItem('glimu_user', JSON.stringify(currentUser));
                document.getElementById('userName').textContent = newName;
                showToast('Settings saved successfully!', 'success');
            }
        }
    });
}

// ============================================
// OTHER ROLE RENDERS
// ============================================
function renderStudents() {
    const container = document.getElementById('students-section');
    if (!container) return;
    container.innerHTML = `
        <div class="section-header"><h2>My Students</h2></div>
        <div class="data-table"><p style="padding: 2rem;">Student management coming soon</p></div>
    `;
}

function renderUsers() {
    const container = document.getElementById('users-section');
    if (!container) return;
    container.innerHTML = `
        <div class="section-header"><h2>User Management</h2></div>
        <div class="data-table"><p style="padding: 2rem;">User management coming soon</p></div>
    `;
}

function renderFinance() {
    const container = document.getElementById('finance-section');
    if (!container) return;
    container.innerHTML = `
        <div class="section-header"><h2>Finance</h2></div>
        <div class="data-table"><p style="padding: 2rem;">Finance dashboard coming soon</p></div>
    `;
}

function renderProjects() {
    const container = document.getElementById('projects-section');
    if (!container) return;
    container.innerHTML = `
        <div class="section-header"><h2>My Projects</h2></div>
        <div class="data-table"><p style="padding: 2rem;">No active projects</p></div>
    `;
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

// ============================================
// INITIALIZE DASHBOARD
// ============================================
async function initDashboard() {
    console.log('Initializing dashboard...');
    
    const isAuth = await checkAuth();
    if (!isAuth) return;
    
    await fetchLibraryMaterials();
    initTheme();
    updateUI();
    createContentSections();
    buildSidebar();
    await renderDashboard();
    
    console.log('Dashboard initialized successfully');
}

// ============================================
// START DASHBOARD
// ============================================
initDashboard();

// Make functions global
window.openModal = openModal;
window.closeModal = closeModal;
