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
    
    // Save to localStorage as backup
    localStorage.setItem(`glimu_payments_${currentUser.id}`, JSON.stringify(allPayments));
    
    // Save to Supabase payment_requests table
    try {
        // Get current user's profile for name and email
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('name, email')
            .eq('id', currentUser.id)
            .single();
        
        if (profileError) {
            console.error('Error fetching user profile:', profileError);
        }
        
        const paymentRequest = {
            id: payment.id,
            user_id: currentUser.id,
            user_name: profile?.name || currentUser.name || 'User',
            user_email: profile?.email || currentUser.email || '',
            amount: payment.amount,
            reference_code: payment.reference_code,
            bank: payment.bank,
            status: payment.status,
            submitted_at: payment.submitted_at || new Date().toISOString()
        };
        
        // Check if payment already exists in Supabase
        const { data: existing, error: checkError } = await supabase
            .from('payment_requests')
            .select('id')
            .eq('reference_code', payment.reference_code)
            .single();
        
        if (checkError && checkError.code !== 'PGRST116') {
            console.error('Error checking existing payment:', checkError);
        }
        
        if (!existing) {
            const { error: insertError } = await supabase
                .from('payment_requests')
                .insert([paymentRequest]);
            
            if (insertError) {
                console.error('Error saving to Supabase:', insertError);
                showToast('Payment request saved locally only. Admin will be notified.', 'warning');
            } else {
                console.log('Payment saved to Supabase successfully:', paymentRequest);
                showToast('Payment request submitted successfully!', 'success');
            }
        } else {
            console.log('Payment already exists in Supabase');
        }
        
    } catch (e) {
        console.error('Supabase error:', e);
        showToast('Payment request saved locally. Please contact support if not processed.', 'warning');
    }
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
            return;
        }
        
        const shortName = currentUser.name.substring(0, 8).replace(/\s/g, '');
        const randomNum = Math.floor(Math.random() * 9000) + 1000;
        referenceCode = `GLM-${shortName}-${randomNum}`;
        modal.querySelector('#referenceCode').textContent = referenceCode;
        
        const bankInfoCard = modal.querySelector('#bankInfoCard');
        bankInfoCard.innerHTML = `
            <div class="bank-option">
                <div class="bank-name">🏦 ${selectedBank.name}</div>
                <div class="bank-account">Account Number: <strong>${selectedBank.accountNumber}</strong></div>
                <div class="bank-name">Account Name: <strong>${selectedBank.accountName}</strong></div>
            </div>
        `;
        
        fundingOptions.style.display = 'none';
        bankDetails.style.display = 'block';
    };
    
    let continueBtn = modal.querySelector('#continueToBankBtn');
    if (!continueBtn) {
        continueBtn = document.createElement('button');
        continueBtn.id = 'continueToBankBtn';
        continueBtn.className = 'btn-primary';
        continueBtn.textContent = 'Continue to Payment';
        continueBtn.style.marginTop = '1rem';
        continueBtn.style.width = '100%';
        fundingOptions.appendChild(continueBtn);
    }
    continueBtn.onclick = proceedToBank;
    
    if (suggestedAmount) {
        proceedToBank();
    }
    
    const backBtn = modal.querySelector('#backToAmountBtn');
    if (backBtn) backBtn.onclick = () => {
        fundingOptions.style.display = 'block';
        bankDetails.style.display = 'none';
    };
    
    const copyBtn = modal.querySelector('#copyRefCodeBtn');
    if (copyBtn) {
        copyBtn.onclick = () => {
            const code = modal.querySelector('#referenceCode').textContent;
            navigator.clipboard.writeText(code);
            showToast('Reference code copied!', 'success');
        };
    }
    
    const confirmBtn = modal.querySelector('#confirmPaymentBtn');
if (confirmBtn) {
    confirmBtn.onclick = async () => {
        if (!selectedAmount) {
            showToast('Invalid amount', 'error');
            return;
        }
        
        const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const paymentRequest = {
            id: paymentId,
            user_id: currentUser.id,
            user_name: currentUser.name,
            user_email: currentUser.email,
            amount: selectedAmount,
            reference_code: referenceCode,
            bank: selectedBank.name,
            status: 'pending',
            submitted_at: new Date().toISOString()
        };
        
        // Save to localStorage first
        await savePaymentToStorage(paymentRequest);
        
        // Also try to save directly to Supabase (savePaymentToStorage already does this)
        // But let's ensure it's saved by trying again directly
        try {
            const { error: directInsertError } = await supabase
                .from('payment_requests')
                .insert([paymentRequest]);
            
            if (directInsertError) {
                console.error('Direct insert error:', directInsertError);
            } else {
                console.log('Payment inserted directly to Supabase');
            }
        } catch (e) {
            console.error('Direct insert failed:', e);
        }
        
        showToast(`Payment request submitted! Reference: ${referenceCode}`, 'success');
        modal.classList.remove('active');
        document.body.style.overflow = '';
        
        // Refresh wallet to show pending request
        setTimeout(() => renderWallet(), 500);
    };
}

// ============================================
// GO TO MENU TAB
// ============================================
function renderGoToMenu() {
    const container = document.getElementById('gotomenu-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2><i class="fas fa-door-open"></i> Go To</h2>
                <p>Quick access to all platform sections</p>
            </div>
        </div>
        
        <div class="go-to-grid">
            <div class="go-to-card" onclick="window.location.href='/library.html'">
                <div class="go-to-icon"><i class="fas fa-book"></i></div>
                <div class="go-to-info"><h3>Library</h3><p>Access books, bundles, and learning materials</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/virtualroom.html'">
                <div class="go-to-icon"><i class="fas fa-video"></i></div>
                <div class="go-to-info"><h3>Virtual Classroom</h3><p>Live classes and interactive sessions</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/hub.html'">
                <div class="go-to-icon"><i class="fas fa-newspaper"></i></div>
                <div class="go-to-info"><h3>Hub</h3><p>Events, insights, and latest updates</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/chat.html'">
                <div class="go-to-icon"><i class="fas fa-comments"></i></div>
                <div class="go-to-info"><h3>Community</h3><p>Connect with fellow learners and instructors</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
        </div>
    `;
}

// ============================================
// QUESTIONS TAB
// ============================================
async function renderQuestionBar() {
    const container = document.getElementById('question-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading next question...</div>';
    
    try {
        const nextQuestion = await getNextQuestion(currentUser.id);
        
        if (!nextQuestion) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>All Questions Complete!</h3>
                    <p>You've answered all available questions. Check back later for more.</p>
                    <button class="btn-primary" onclick="switchTab('dashboard')">Return to Dashboard</button>
                </div>
            `;
            return;
        }
        
        questionRenderer = new QuestionRenderer(
            'question-section',
            currentUser.id,
            async (result) => {
                const scoreData = await getStudentScore(currentUser.id);
                const currentBadge = getCurrentBadge(scoreData?.current_score || 0);
                const nextBadge = getNextBadge(scoreData?.current_score || 0);
                const progressToNext = getProgressToNextBadge(scoreData?.current_score || 0);
                
                const progressSection = document.querySelector('.progress-section');
                if (progressSection) {
                    progressSection.innerHTML = renderProgressBar(scoreData?.current_score || 0, currentBadge, nextBadge, progressToNext);
                }
                
                setTimeout(() => renderQuestionBar(), 2000);
            }
        );
        
        await questionRenderer.renderQuestion(nextQuestion);
        
    } catch (error) {
        console.error('Error loading question:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Unable to load question</h3>
                <button class="btn-primary" onclick="location.reload()">Try Again</button>
            </div>
        `;
    }
}

// ============================================
// SETTINGS TAB
// ============================================
async function renderSettings() {
    const container = document.getElementById('settings-section');
    if (!container) return;
    
    const isDark = document.body.classList.contains('dark-mode');
    const portfolioUrl = `${window.location.origin}/u/${currentUser.name.toLowerCase().replace(/\s+/g, '-')}`;
    const portfolioItems = await getStudentPortfolio(currentUser.id, false);
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Settings</h2>
                <p>Manage your account preferences</p>
            </div>
        </div>
        
        <div class="settings-grid">
            <div class="settings-card">
                <h3>Profile Picture</h3>
                <div class="profile-picture-section">
                    <div class="current-avatar">
                        <img src="${currentUser?.avatar}" alt="Profile" id="profilePreview">
                    </div>
                    <div class="avatar-upload">
                        <input type="file" id="avatarUpload" accept="image/*" style="display: none;">
                        <button class="btn-outline" id="uploadAvatarBtn">Upload Photo</button>
                    </div>
                </div>
            </div>
            
            <div class="settings-card">
                <h3>Account Information</h3>
                <form id="settingsForm">
                    <div class="form-group">
                        <label>Full Name</label>
                        <input type="text" id="fullNameInput" value="${currentUser?.name || ''}">
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" value="${currentUser?.email || ''}" disabled>
                        <small>Email cannot be changed</small>
                    </div>
                    <div class="form-group">
                        <label>Home/Work Address</label>
                        <input type="text" id="addressInput" value="${currentUser?.address || ''}" placeholder="Enter your address">
                    </div>
                </form>
            </div>
            
            <div class="settings-card">
                <h3>Change Password</h3>
                <form id="passwordForm">
                    <div class="form-group">
                        <label>Current Password</label>
                        <input type="password" id="currentPassword" placeholder="Enter current password">
                    </div>
                    <div class="form-group">
                        <label>New Password</label>
                        <input type="password" id="newPassword" placeholder="At least 8 characters">
                    </div>
                    <div class="form-group">
                        <label>Confirm New Password</label>
                        <input type="password" id="confirmPassword" placeholder="Re-enter new password">
                    </div>
                    <button type="submit" class="btn-primary">Update Password</button>
                </form>
            </div>
            
            <div class="settings-card">
                <h3>Preferences</h3>
                <div class="form-group">
                    <label>Theme</label>
                    <div class="theme-selector">
                        <button class="theme-option ${!isDark ? 'active' : ''}" data-theme="light">☀️ Light</button>
                        <button class="theme-option ${isDark ? 'active' : ''}" data-theme="dark">🌙 Dark</button>
                    </div>
                </div>
            </div>
            
            <div class="settings-card">
                <h3>Portfolio</h3>
                <div class="portfolio-settings">
                    <p>Your public portfolio shows your best work to the world.</p>
                    <div class="portfolio-stats">
                        <span><i class="fas fa-briefcase"></i> ${portfolioItems.length} items</span>
                        <span><i class="fas fa-eye"></i> Total views: ${portfolioItems.reduce((sum, i) => sum + (i.view_count || 0), 0)}</span>
                    </div>
                    <div class="portfolio-url-display">
                        <input type="text" id="portfolioUrl" readonly value="${portfolioUrl}">
                        <button id="copyPortfolioUrlBtn" class="btn-outline">Copy URL</button>
                    </div>
                    <button id="viewPublicPortfolioBtn" class="btn-primary">View Public Portfolio</button>
                </div>
            </div>
        </div>
        
        <div class="settings-actions">
            <button type="submit" class="btn-primary" id="saveSettingsBtn">Save Changes</button>
            <button id="signOutBtn" class="btn-danger">Sign Out</button>
        </div>
    `;
    
    // Theme selector
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.getAttribute('data-theme');
            if (theme === 'dark') document.body.classList.add('dark-mode');
            else document.body.classList.remove('dark-mode');
            localStorage.setItem('theme', theme);
            document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    // Avatar upload
    document.getElementById('uploadAvatarBtn')?.addEventListener('click', () => {
        document.getElementById('avatarUpload').click();
    });
    
    document.getElementById('avatarUpload')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const avatarUrl = event.target.result;
                document.getElementById('profilePreview').src = avatarUrl;
                
                const { error } = await supabase
                    .from('users')
                    .update({ avatar_url: avatarUrl })
                    .eq('id', currentUser.id);
                
                if (!error) {
                    currentUser.avatar = avatarUrl;
                    localStorage.setItem('glimu_user', JSON.stringify(currentUser));
                    showToast('Profile picture updated!', 'success');
                }
            };
            reader.readAsDataURL(file);
        }
    });
    
    // Portfolio URL
    document.getElementById('copyPortfolioUrlBtn')?.addEventListener('click', () => {
        const urlInput = document.getElementById('portfolioUrl');
        urlInput.select();
        document.execCommand('copy');
        showToast('Portfolio URL copied!', 'success');
    });
    
    document.getElementById('viewPublicPortfolioBtn')?.addEventListener('click', () => {
        window.open(portfolioUrl, '_blank');
    });
    
    // Save settings
    document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
        const newName = document.getElementById('fullNameInput').value;
        const newAddress = document.getElementById('addressInput').value;
        
        const updates = {};
        if (newName !== currentUser.name) updates.name = newName;
        if (newAddress !== (currentUser.address || '')) updates.address = newAddress;
        
        if (Object.keys(updates).length > 0) {
            const { error } = await supabase
                .from('users')
                .update({ ...updates, full_name: newName, updated_at: new Date() })
                .eq('id', currentUser.id);
            
            if (error) {
                showToast('Failed to update settings', 'error');
            } else {
                currentUser.name = newName;
                currentUser.address = newAddress;
                localStorage.setItem('glimu_user', JSON.stringify(currentUser));
                document.getElementById('userName').textContent = newName;
                showToast('Settings saved successfully!', 'success');
            }
        } else {
            showToast('No changes to save', 'info');
        }
    });
    
    // Change password
    document.getElementById('passwordForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (!currentPassword || !newPassword || !confirmPassword) {
            showToast('Please fill in all password fields', 'error');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showToast('New passwords do not match', 'error');
            return;
        }
        
        if (newPassword.length < 8) {
            showToast('Password must be at least 8 characters', 'error');
            return;
        }
        
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });
        
        if (error) {
            showToast(error.message || 'Failed to update password', 'error');
        } else {
            showToast('Password updated successfully!', 'success');
            document.getElementById('passwordForm').reset();
        }
    });
    
    // Sign Out
    document.getElementById('signOutBtn')?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to sign out?')) {
            await supabase.auth.signOut();
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '/signin.html';
        }
    });
}

// ============================================
// ROLE-SPECIFIC RENDER FUNCTIONS
// ============================================
function renderGradeSubmissions() {
    const container = document.getElementById('grade-section');
    if (!container) return;
    container.innerHTML = `
        <div class="section-header">
            <h2>Grade Submissions</h2>
            <p>Review and grade student submissions</p>
        </div>
        <div class="empty-state">
            <i class="fas fa-clipboard-list"></i>
            <h3>No pending submissions</h3>
            <p>Check back later for student submissions to grade.</p>
        </div>
    `;
}

function renderProjects() {
    const container = document.getElementById('projects-section');
    if (!container) return;
    container.innerHTML = `
        <div class="section-header">
            <h2>Projects</h2>
            <p>Manage your partner projects</p>
        </div>
        <div class="empty-state">
            <i class="fas fa-project-diagram"></i>
            <h3>Partner Projects</h3>
            <p>Your active projects and collaborations will appear here.</p>
        </div>
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// MOBILE BOTTOM NAVIGATION
// ============================================
function initMobileNavigation() {
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
    if (mobileNavItems.length === 0) return;
    
    mobileNavItems.forEach(item => {
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        
        newItem.addEventListener('click', () => {
            const tabId = newItem.getAttribute('data-tab');
            document.querySelectorAll('.mobile-nav-item').forEach(nav => nav.classList.remove('active'));
            newItem.classList.add('active');
            switchTab(tabId);
        });
    });
    
    function syncMobileActiveState() {
        document.querySelectorAll('.mobile-nav-item').forEach(item => {
            const tabId = item.getAttribute('data-tab');
            if (tabId === currentTab) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }
    
    const originalSwitchTab = window.switchTab;
    window.switchTab = function(tabId) {
        originalSwitchTab(tabId);
        syncMobileActiveState();
    };
    
    syncMobileActiveState();
}

// ============================================
// INITIALIZE DASHBOARD
// ============================================
async function initDashboard() {
    console.log('Initializing dashboard...');
    
    const isAuth = await checkAuth();
    if (!isAuth) return;
    
    initTheme();
    updateUI();
    createContentSections();
    buildSidebar();
    await renderDashboard();
    
    setupRealtimeWallet();
    initMobileNavigation();
    
    console.log('Dashboard initialized successfully');
}

// Start the dashboard
initDashboard();

// Expose functions globally
window.switchTab = switchTab;
window.toggleTheme = toggleTheme;
window.renderQuestionBar = renderQuestionBar;
