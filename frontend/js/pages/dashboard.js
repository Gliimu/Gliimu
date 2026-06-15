// ============================================
// GLIIMU DASHBOARD - COMPLETE VERSION
// Free access to all platforms
// Tabs: Dashboard, Questions, Go To, Wallet, Settings
// Admin redirected to separate dashboard
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// Import wallet functions with fallbacks
let getWalletBalance = async () => 14500;
let purchaseBook = async () => false;
let purchaseBundle = async () => false;
let getTransactionHistory = async () => [];
let getUserAccess = async () => ({});
let subscribeToWalletUpdates = () => null;

try {
    const wallet = await import('../modules/wallet.js');
    getWalletBalance = wallet.getWalletBalance || getWalletBalance;
    purchaseBook = wallet.purchaseBook || purchaseBook;
    purchaseBundle = wallet.purchaseBundle || purchaseBundle;
    getTransactionHistory = wallet.getTransactionHistory || getTransactionHistory;
    getUserAccess = wallet.getUserAccess || getUserAccess;
    subscribeToWalletUpdates = wallet.subscribeToWalletUpdates || subscribeToWalletUpdates;
    console.log('Wallet module loaded successfully');
} catch (e) {
    console.error('Failed to load wallet module:', e);
}

import {
    getStudentScore,
    getCurrentBadge,
    getNextBadge,
    getProgressToNextBadge,
    getNextQuestion,
    getLeaderboard,
    sharePortfolio,
    submitMVPProposal,
    getStudentPortfolio
} from '../modules/progression.js';

import { QuestionRenderer, renderProgressBar } from '../modules/questions.js';

// ============================================
// GLOBAL STATE
// ============================================
let currentUser = null;
let currentUserProfile = null;
let currentRole = 'student';
let currentTab = 'dashboard';
let currentWalletBalance = 0;
let walletSubscription = null;
let pendingPayments = [];
let approvedPayments = [];
let cancelledPayments = [];
let allPayments = [];
let allLibraryItems = [];
let questionRenderer = null;
let currentPaymentFilter = 'all';

// Cache for performance
let paymentsCache = null;
let lastPaymentsFetch = 0;
let cachedBalance = null;
let cachedTransactions = null;
let lastWalletUpdate = 0;
const CACHE_DURATION = 30000;
const PAYMENTS_CACHE_DURATION = 60000;

// ============================================
// ROLE-BASED TAB CONFIGURATION (Admin excluded)
// ============================================
const roleTabs = {
    student: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'question', name: 'Questions', icon: 'fas fa-question-circle' },
        { id: 'gotomenu', name: 'Go To', icon: 'fas fa-door-open' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    instructor: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'grade', name: 'Grade Submissions', icon: 'fas fa-clipboard-list' },
        { id: 'gotomenu', name: 'Go To', icon: 'fas fa-door-open' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    partner: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'projects', name: 'Projects', icon: 'fas fa-project-diagram' },
        { id: 'gotomenu', name: 'Go To', icon: 'fas fa-door-open' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ]
    // admin role is NOT included here. They are redirected to /admin
};

// ============================================
// CHECK AUTHENTICATION & REDIRECT ADMIN
// ============================================
async function checkAuth() {
    console.log('Checking authentication...');
    
    // Prevent redirect loops
    if (sessionStorage.getItem('redirecting')) {
        console.log('Redirect already in progress, stopping');
        return false;
    }
    
    const localUser = localStorage.getItem('glimu_user');
    if (localUser) {
        currentUser = JSON.parse(localUser);
        currentRole = currentUser.role || 'student';
        console.log('User found in localStorage:', currentUser);
        
        // --- NEW: Redirect Admin Users ---
        if (currentRole === 'admin') {
            console.log('Admin user detected. Redirecting to /admin');
            sessionStorage.setItem('redirecting', 'true');
            window.location.href = '/admin';
            return false;
        }
        // ---------------------------------
        return true;
    }
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
        console.error('Session error:', error);
        return false;
    }
    
    if (session) {
        await loadUserFromSupabase(session.user.id);
        
        // --- NEW: Redirect Admin Users (after loading from Supabase) ---
        if (currentRole === 'admin') {
            console.log('Admin user detected. Redirecting to /admin');
            sessionStorage.setItem('redirecting', 'true');
            window.location.href = '/admin';
            return false;
        }
        // ------------------------------------------------------------
        return true;
    }
    
    console.log('No user found, redirecting to signin');
    sessionStorage.setItem('redirecting', 'true');
    showToast('Please login to access your dashboard', 'info');
    
    setTimeout(() => {
        sessionStorage.removeItem('redirecting');
        window.location.href = '/signin.html';
    }, 1500);
    
    return false;
}

// ============================================
// LOAD USER FROM SUPABASE
// ============================================
async function loadUserFromSupabase(userId) {
    try {
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (profileError) {
            console.error('Profile error:', profileError);
            const { data: authUser } = await supabase.auth.getUser();
            if (authUser?.user) {
                const defaultProfile = {
                    id: userId,
                    name: authUser.user.email?.split('@')[0] || 'User',
                    email: authUser.user.email,
                    role: 'student',
                    wallet_balance: 14500
                };
                const { error: insertError } = await supabase
                    .from('users')
                    .insert([defaultProfile]);
                
                if (!insertError) {
                    currentUser = defaultProfile;
                    currentRole = 'student';
                    currentWalletBalance = 14500;
                    localStorage.setItem('glimu_user', JSON.stringify(currentUser));
                    return;
                }
            }
            throw profileError;
        }
        
        await loadPaymentsFromStorage();
        await fetchLibraryItems();
        
        currentUserProfile = profile;
        currentWalletBalance = profile.wallet_balance || 14500;
        currentUser = {
            id: userId,
            name: profile.name || profile.full_name || 'User',
            email: profile.email,
            role: profile.role || 'student',
            walletBalance: profile.wallet_balance || 14500,
            avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=fbb040&color=fff`
        };
        currentRole = currentUser.role;
        
        localStorage.setItem('glimu_user', JSON.stringify(currentUser));
        
        console.log('User loaded from Supabase:', currentUser);
        
    } catch (error) {
        console.error('Error loading user from Supabase:', error);
        currentUser = {
            id: userId,
            name: 'Test User',
            email: 'test@example.com',
            role: 'student',
            walletBalance: 14500,
            avatar: 'https://ui-avatars.com/api/?name=Test+User&background=fbb040&color=fff'
        };
        currentRole = 'student';
        localStorage.setItem('glimu_user', JSON.stringify(currentUser));
    }
}

// ============================================
// FETCH LIBRARY ITEMS (for potential future use)
// ============================================
async function fetchLibraryItems() {
    try {
        let response = await fetch('../../backend/data/library.json');
        if (!response.ok) response = await fetch('../backend/data/library.json');
        if (!response.ok) response = await fetch('/backend/data/library.json');
        if (!response.ok) response = await fetch('https://raw.githubusercontent.com/Gliimu/Gliimu/main/backend/data/library.json');
        
        if (!response.ok) throw new Error('Failed to load library');
        
        const data = await response.json();
        allLibraryItems = data.materials || [];
        console.log('Loaded library items:', allLibraryItems.length);
        
    } catch (error) {
        console.error('Error loading library items:', error);
        allLibraryItems = [];
    }
}

// ============================================
// PAYMENT STORAGE FUNCTIONS
// ============================================
async function loadPaymentsFromStorage(forceRefresh = false) {
    if (!currentUser?.id) {
        allPayments = [];
        pendingPayments = [];
        approvedPayments = [];
        cancelledPayments = [];
        return;
    }
    
    const now = Date.now();
    if (!forceRefresh && paymentsCache && (now - lastPaymentsFetch) < PAYMENTS_CACHE_DURATION) {
        allPayments = paymentsCache;
        pendingPayments = allPayments.filter(p => p.status === 'pending');
        approvedPayments = allPayments.filter(p => p.status === 'approved');
        cancelledPayments = allPayments.filter(p => p.status === 'rejected');
        return;
    }
    
    try {
        const { data, error } = await supabase
            .from('payment_requests')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('submitted_at', { ascending: false });
        
        if (!error && data) {
            paymentsCache = data;
            lastPaymentsFetch = now;
            allPayments = data;
            pendingPayments = allPayments.filter(p => p.status === 'pending');
            approvedPayments = allPayments.filter(p => p.status === 'approved');
            cancelledPayments = allPayments.filter(p => p.status === 'rejected');
            return;
        }
    } catch (e) {
        console.log('Supabase not available, using localStorage');
    }
    
    const storedPayments = localStorage.getItem(`glimu_payments_${currentUser.id}`);
    if (storedPayments) {
        paymentsCache = JSON.parse(storedPayments);
        lastPaymentsFetch = now;
        allPayments = paymentsCache;
    } else {
        allPayments = [];
    }
    
    pendingPayments = allPayments.filter(p => p.status === 'pending');
    approvedPayments = allPayments.filter(p => p.status === 'approved');
    cancelledPayments = allPayments.filter(p => p.status === 'rejected');
}

async function savePaymentToStorage(payment) {
    allPayments.unshift(payment);
    paymentsCache = allPayments;
    lastPaymentsFetch = Date.now();
    
    pendingPayments = allPayments.filter(p => p.status === 'pending');
    approvedPayments = allPayments.filter(p => p.status === 'approved');
    cancelledPayments = allPayments.filter(p => p.status === 'rejected');
    
    try {
        supabase
            .from('payment_requests')
            .insert([payment])
            .then(({ error }) => {
                if (error) console.error('Error saving to Supabase:', error);
            });
    } catch (e) {
        console.log('Supabase not available, saving to localStorage');
    }
    
    localStorage.setItem(`glimu_payments_${currentUser.id}`, JSON.stringify(allPayments));
}

// ============================================
// REAL-TIME WALLET UPDATES
// ============================================
function setupRealtimeWallet() {
    if (!currentUser?.id) return;
    
    if (walletSubscription) {
        walletSubscription.unsubscribe();
    }
    
    walletSubscription = subscribeToWalletUpdates(currentUser.id, (newBalance) => {
        console.log('Wallet balance updated:', newBalance);
        currentUser.walletBalance = newBalance;
        currentWalletBalance = newBalance;
        cachedBalance = newBalance;
        lastWalletUpdate = Date.now();
        
        if (currentTab === 'wallet') {
            renderWallet();
        }
        if (currentTab === 'dashboard') {
            const balanceElement = document.querySelector('.quick-balance');
            if (balanceElement) {
                balanceElement.textContent = `₦${newBalance.toLocaleString()}`;
            }
        }
        
        showToast(`Wallet updated: ₦${newBalance.toLocaleString()}`, 'info');
    });
}

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
    showToast(`Switched to ${isDark ? 'dark' : 'light'} mode`, 'info');
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
    const tabs = roleTabs[currentRole] || roleTabs.student; // Fallback to student tabs
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
    
    // Create all possible sections (some may not be used for certain roles)
    dashboardContent.innerHTML = `
        <div id="dashboard-section" class="dashboard-section active">
            <div class="loading-spinner">Loading dashboard...</div>
        </div>
        <div id="question-section" class="dashboard-section">
            <div class="loading-spinner">Loading questions...</div>
        </div>
        <div id="gotomenu-section" class="dashboard-section">
            <div class="loading-spinner">Loading menu...</div>
        </div>
        <div id="wallet-section" class="dashboard-section">
            <div class="loading-spinner">Loading wallet...</div>
        </div>
        <div id="settings-section" class="dashboard-section">
            <div class="loading-spinner">Loading settings...</div>
        </div>
        <div id="grade-section" class="dashboard-section">
            <div class="loading-spinner">Loading grade submissions...</div>
        </div>
        <div id="projects-section" class="dashboard-section">
            <div class="loading-spinner">Loading projects...</div>
        </div>
    `;
}

// ============================================
// LOAD TAB DATA
// ============================================
async function loadTabData(tabId) {
    console.log('Loading tab:', tabId);
    switch(tabId) {
        case 'dashboard':
            await renderDashboard();
            break;
        case 'question':
            await renderQuestionBar();
            break;
        case 'gotomenu':
            renderGoToMenu();
            break;
        case 'wallet':
            await renderWallet();
            break;
        case 'settings':
            await renderSettings();
            break;
        case 'grade':
            renderGradeSubmissions();
            break;
        case 'projects':
            renderProjects();
            break;
        default:
            await renderDashboard();
    }
}

// ============================================
// DASHBOARD RENDER
// ============================================
async function renderDashboard() {
    const container = document.getElementById('dashboard-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading dashboard...</div>';
    
    try {
        console.log('Starting dashboard render...');
        
        const scoreData = await getStudentScore(currentUser.id);
        console.log('Score data:', scoreData);
        
        const currentBadge = getCurrentBadge(scoreData?.current_score || 0);
        const nextBadge = getNextBadge(scoreData?.current_score || 0);
        const progressToNext = getProgressToNextBadge(scoreData?.current_score || 0);
        const leaderboardData = await getLeaderboard(10);
        const isAmbassador = (scoreData?.current_score || 0) >= 100;
        const walletBalance = currentUser?.walletBalance || 14500;
        
        container.innerHTML = `
            <div class="progress-section">
                ${renderProgressBar(scoreData?.current_score || 0, currentBadge, nextBadge, progressToNext)}
            </div>
            
            <div class="quick-stats">
                <div class="quick-stat-card">
                    <i class="fas fa-wallet"></i>
                    <div>
                        <span class="quick-stat-label">Wallet Balance</span>
                        <span class="quick-stat-value quick-balance">₦${walletBalance.toLocaleString()}</span>
                    </div>
                    <button class="quick-add-funds" id="quickAddFundsBtn">+ Add</button>
                </div>
            </div>
            
            ${isAmbassador ? `
                <div class="mvp-section">
                    <div class="mvp-header">
                        <i class="fas fa-rocket"></i>
                        <h3>MVP Ambassador Zone</h3>
                    </div>
                    <p>You've reached 100%! Submit your real-world project proposal.</p>
                    <button id="openMvpFormBtn" class="btn-primary">Submit MVP Proposal</button>
                </div>
            ` : `
                <div class="mvp-locked-section">
                    <div class="mvp-locked-header">
                        <i class="fas fa-lock"></i>
                        <h3>Unlock Ambassador Zone</h3>
                    </div>
                    <p>Reach 100% score to submit real-world project proposals.</p>
                    <div class="progress-to-unlock">
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" style="width: ${scoreData?.current_score || 0}%; background: var(--accent)"></div>
                        </div>
                        <span>${Math.round(scoreData?.current_score || 0)}% to Ambassador</span>
                    </div>
                </div>
            `}
            
            <div class="leaderboard-section">
                <div class="leaderboard-header">
                    <i class="fas fa-trophy"></i>
                    <h3>Top Performers</h3>
                    <button id="refreshLeaderboardBtn" class="btn-icon"><i class="fas fa-sync-alt"></i></button>
                </div>
                <div class="leaderboard-list">
                    ${renderLeaderboardList(leaderboardData)}
                </div>
            </div>
        `;
        
        const addFundsBtn = document.getElementById('quickAddFundsBtn');
        if (addFundsBtn) {
            addFundsBtn.addEventListener('click', () => {
                switchTab('wallet');
            });
        }
        
        const openMvpBtn = document.getElementById('openMvpFormBtn');
        if (openMvpBtn) {
            openMvpBtn.addEventListener('click', () => {
                openMvpModal();
            });
        }
        
        const refreshBtn = document.getElementById('refreshLeaderboardBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                const newLeaderboard = await getLeaderboard(10);
                const leaderboardList = document.querySelector('.leaderboard-list');
                if (leaderboardList) {
                    leaderboardList.innerHTML = renderLeaderboardList(newLeaderboard);
                }
                showToast('Leaderboard refreshed!', 'success');
            });
        }
        
        console.log('Dashboard rendered successfully');
        
    } catch (error) {
        console.error('Error rendering dashboard:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Dashboard</h3>
                <p style="font-size: 12px; color: var(--text-secondary); margin: 8px 0;">${error.message || 'Unknown error'}</p>
                <button class="btn-primary" onclick="location.reload()">Refresh Page</button>
            </div>
        `;
    }
}

function renderLeaderboardList(leaderboardData) {
    if (!leaderboardData || leaderboardData.length === 0) {
        return '<div class="empty-state"><i class="fas fa-trophy"></i><p>No leaders yet. Be the first!</p></div>';
    }
    
    return leaderboardData.map((entry, index) => `
        <div class="leaderboard-item ${index < 3 ? 'top-' + (index + 1) : ''}">
            <div class="leaderboard-rank">#${index + 1}</div>
            <div class="leaderboard-avatar">
                <img src="${entry.users?.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(entry.users?.name || 'User') + '&background=fbb040&color=fff'}" alt="">
            </div>
            <div class="leaderboard-info">
                <div class="leaderboard-name">${entry.users?.name || 'Anonymous'}</div>
                <div class="leaderboard-badge">${entry.current_badge || 'Starter'}</div>
            </div>
            <div class="leaderboard-score">${Math.round(entry.current_score)}%</div>
        </div>
    `).join('');
}

function openMvpModal() {
    let modal = document.getElementById('mvpModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'mvpModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Submit MVP Proposal</h2>
                    <button class="modal-close" id="closeMvpModal">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="mvpForm">
                        <div class="form-group">
                            <label>Project Title</label>
                            <input type="text" id="mvpTitle" required placeholder="e.g., The Documentary Project">
                        </div>
                        <div class="form-group">
                            <label>Project Type</label>
                            <select id="mvpType" required>
                                <option value="">Select type</option>
                                <option value="book">Book</option>
                                <option value="documentary">Documentary</option>
                                <option value="movie">Movie</option>
                                <option value="business">Business</option>
                                <option value="movement">Movement</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Project Description</label>
                            <textarea id="mvpDescription" rows="4" required placeholder="Describe your project in detail..."></textarea>
                        </div>
                        <div class="form-group">
                            <label>Proposal / Execution Plan</label>
                            <textarea id="mvpProposal" rows="6" required placeholder="How do you plan to execute this project? What resources do you need?"></textarea>
                        </div>
                        <button type="submit" class="btn-primary">Submit MVP Proposal</button>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('closeMvpModal').onclick = () => {
            modal.classList.remove('active');
        };
        
        document.getElementById('mvpForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('mvpTitle').value;
            const type = document.getElementById('mvpType').value;
            const description = document.getElementById('mvpDescription').value;
            const proposal = document.getElementById('mvpProposal').value;
            
            const result = await submitMVPProposal(currentUser.id, title, description, type, proposal);
            
            if (result) {
                modal.classList.remove('active');
                showToast('MVP Proposal submitted! The school will review and reach out.', 'success');
            }
        });
    }
    
    modal.classList.add('active');
}

// ============================================
// WALLET TAB
// ============================================
async function renderWallet() {
    const container = document.getElementById('wallet-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading wallet...</div>';
    
    try {
        await loadPaymentsFromStorage(true);
        
        const balance = await getWalletBalance();
        const transactions = await getTransactionHistory();
        
        container.innerHTML = `
            <div class="section-header">
                <div>
                    <h2>Wallet</h2>
                    <p>Manage your funds</p>
                </div>
            </div>
            
            <div class="wallet-balance-card">
                <div class="wallet-balance-icon"><i class="fas fa-wallet"></i></div>
                <div class="wallet-balance-info">
                    <span class="wallet-label">Available Balance</span>
                    <span class="wallet-balance-large">₦${balance.toLocaleString()}</span>
                </div>
                <button id="addFundsBtn" class="btn-primary">Add Funds</button>
            </div>
            
            <div class="transactions-section">
                <h3>Recent Transactions</h3>
                <div class="transactions-list">
                    ${transactions.length === 0 ? '<p class="empty-transactions">No transactions yet</p>' : 
                        transactions.slice(0, 10).map(t => `
                            <div class="transaction-item">
                                <div class="transaction-icon ${t.type === 'credit' ? 'credit' : 'debit'}">
                                    <i class="fas ${t.type === 'credit' ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
                                </div>
                                <div class="transaction-info">
                                    <div class="transaction-desc">${escapeHtml(t.description)}</div>
                                    <div class="transaction-date">${new Date(t.created_at).toLocaleDateString()}</div>
                                </div>
                                <div class="transaction-amount ${t.amount > 0 ? 'positive' : 'negative'}">
                                    ${t.amount > 0 ? '+' : ''}₦${Math.abs(t.amount).toLocaleString()}
                                </div>
                            </div>
                        `).join('')
                    }
                </div>
            </div>
            
            <div class="payments-section">
                <h3>Payment Requests</h3>
                <div class="payments-list">
                    ${allPayments.length === 0 ? '<p class="empty-payments">No payment requests</p>' : 
                        allPayments.slice(0, 5).map(p => `
                            <div class="payment-item ${p.status}">
                                <div class="payment-info">
                                    <div class="payment-amount">₦${p.amount.toLocaleString()}</div>
                                    <div class="payment-date">${new Date(p.submitted_at).toLocaleDateString()}</div>
                                    <div class="payment-ref">Ref: ${p.reference_code}</div>
                                </div>
                                <div class="payment-status-badge ${p.status}">${p.status}</div>
                            </div>
                        `).join('')
                    }
                </div>
            </div>
        `;
        
        document.getElementById('addFundsBtn')?.addEventListener('click', () => {
            openFundWalletModal();
        });
        
    } catch (error) {
        console.error('Error rendering wallet:', error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error Loading Wallet</h3><button class="btn-primary" onclick="location.reload()">Try Again</button></div>`;
    }
}

// ============================================
// FUND WALLET MODAL
// ============================================
function openFundWalletModal(suggestedAmount = null) {
    let modal = document.getElementById('fundWalletModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'fundWalletModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content wallet-modal">
                <div class="modal-header">
                    <h2>Add Funds to Wallet</h2>
                    <button class="modal-close" id="closeFundWalletModal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="funding-options">
                        <h3>Select Amount</h3>
                        <div class="selected-amount-display" id="selectedAmountDisplay" style="display: none;">
                            <p>You are about to add:</p>
                            <div class="selected-amount-large" id="selectedAmountLarge">₦0</div>
                        </div>
                        <div class="amount-buttons">
                            <button class="amount-btn" data-amount="1000">₦1,000</button>
                            <button class="amount-btn" data-amount="2500">₦2,500</button>
                            <button class="amount-btn" data-amount="5000">₦5,000</button>
                            <button class="amount-btn" data-amount="10000">₦10,000</button>
                            <button class="amount-btn" data-amount="25000">₦25,000</button>
                            <button class="amount-btn" data-amount="50000">₦50,000</button>
                        </div>
                        <div class="custom-amount">
                            <input type="number" id="customAmount" placeholder="Or enter custom amount (₦)">
                        </div>
                        <button id="continueToBankBtn" class="btn-primary" style="margin-top: 1rem; width: 100%;">Continue to Payment</button>
                    </div>
                    
                    <div class="bank-details" style="display: none;">
                        <h3>Bank Transfer Details</h3>
                        <div class="bank-info-card" id="bankInfoCard"></div>
                        <div class="reference-code-box">
                            <p>Your Reference Code:</p>
                            <div class="reference-code" id="referenceCode"></div>
                            <button id="copyRefCodeBtn" class="btn-outline">Copy Code</button>
                        </div>
                        <div class="payment-instructions">
                            <p><i class="fas fa-info-circle"></i> Instructions:</p>
                            <ol>
                                <li>Send the exact amount to <strong>the account above</strong></li>
                                <li>Use the <strong>Reference Code</strong> as your transaction narration</li>
                                <li>After sending, click "I Have Made Payment" below</li>
                                <li>Your wallet will be credited after admin verification, <strong>within 24 hours</strong></li>
                            </ol>
                        </div>
                        <button id="confirmPaymentBtn" class="btn-success">✅ I Have Made Payment</button>
                        <button id="backToAmountBtn" class="btn-outline">← Back</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('closeFundWalletModal').onclick = () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        };
    }
    
    let selectedAmount = suggestedAmount || 0;
    let referenceCode = '';
    let selectedBank = null;
    
    const banks = [
        { name: 'MoniePoint Microfinance Bank', accountNumber: '6315085115', accountName: 'Gliimu LTD', code: 'moniepoint' },
        { name: 'Opay', accountNumber: '6142049426', accountName: 'Gliimu LTD', code: 'opay' }
    ];
    
    const randomBank = banks[Math.floor(Math.random() * banks.length)];
    selectedBank = randomBank;
    
    const fundingOptions = modal.querySelector('.funding-options');
    const bankDetails = modal.querySelector('.bank-details');
    const selectedAmountDisplay = modal.querySelector('#selectedAmountDisplay');
    const selectedAmountLarge = modal.querySelector('#selectedAmountLarge');
    
    fundingOptions.style.display = 'block';
    bankDetails.style.display = 'none';
    selectedAmountDisplay.style.display = 'none';
    
    if (suggestedAmount) {
        const customInput = modal.querySelector('#customAmount');
        if (customInput) customInput.value = suggestedAmount;
        selectedAmount = suggestedAmount;
    }
    
    modal.querySelectorAll('.amount-btn').forEach(btn => {
        btn.onclick = () => {
            modal.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedAmount = parseInt(btn.getAttribute('data-amount'));
            const customInput = modal.querySelector('#customAmount');
            if (customInput) customInput.value = '';
            selectedAmountDisplay.style.display = 'block';
            selectedAmountLarge.textContent = `₦${selectedAmount.toLocaleString()}`;
        };
    });
    
    const customInput = modal.querySelector('#customAmount');
    if (customInput) {
        customInput.oninput = () => {
            modal.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
            selectedAmount = parseInt(customInput.value) || 0;
            if (selectedAmount > 0) {
                selectedAmountDisplay.style.display = 'block';
                selectedAmountLarge.textContent = `₦${selectedAmount.toLocaleString()}`;
            } else {
                selectedAmountDisplay.style.display = 'none';
            }
        };
    }
    
    const proceedToBank = () => {
        if (!selectedAmount || selectedAmount < 100) {
            showToast('Please select or enter a valid amount (minimum ₦100)', 'error');
