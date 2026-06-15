// ============================================
// GLIIMU DASHBOARD - COMPLETE STUDENT VERSION
// Updated: Platform selection for Basic/Standard plans
// Hub is always free
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';
import { 
    getWalletBalance, 
    getUserAccess, 
    purchasePremium, 
    purchaseStandard, 
    purchaseBasic,
    getTransactionHistory,
    isPremium,
    subscribeToWalletUpdates,
    getAvailablePlatforms,
    getPlanDetails,
    PLATFORM_INFO,
    PRICING
} from '../modules/wallet.js';

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
import { showPlatformSelector } from '../modules/access-guard.js';

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
// CHECK AUTHENTICATION
// ============================================
async function checkAuth() {
    console.log('Checking authentication...');
    
    const localUser = localStorage.getItem('glimu_user');
    if (localUser) {
        currentUser = JSON.parse(localUser);
        currentRole = currentUser.role || 'student';
        console.log('User found in localStorage:', currentUser);
        return true;
    }
    
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
                    subscription_plan: 'free',
                    selected_platforms: [],
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
        
        currentUserProfile = profile;
        currentWalletBalance = profile.wallet_balance || 14500;
        currentUser = {
            id: userId,
            name: profile.name || profile.full_name || 'User',
            email: profile.email,
            role: profile.role || 'student',
            subscriptionPlan: profile.subscription_plan || 'free',
            selectedPlatforms: profile.selected_platforms || [],
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
            subscriptionPlan: 'free',
            selectedPlatforms: [],
            walletBalance: 14500,
            avatar: 'https://ui-avatars.com/api/?name=Test+User&background=fbb040&color=fff'
        };
        currentRole = 'student';
        localStorage.setItem('glimu_user', JSON.stringify(currentUser));
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
// ROLE-BASED TAB CONFIGURATION - 5 TABS
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
async function loadTabData(tabId) {
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
        const scoreData = await getStudentScore(currentUser.id);
        const currentBadge = getCurrentBadge(scoreData?.current_score || 0);
        const nextBadge = getNextBadge(scoreData?.current_score || 0);
        const progressToNext = getProgressToNextBadge(scoreData?.current_score || 0);
        const leaderboardData = await getLeaderboard(10);
        const isAmbassador = (scoreData?.current_score || 0) >= 100;
        const walletBalance = currentUser?.walletBalance || 14500;
        const subscriptionPlan = currentUser?.subscriptionPlan || 'free';
        const selectedPlatforms = currentUser?.selectedPlatforms || [];
        
        // Format selected platforms for display
        const platformNames = selectedPlatforms.map(p => {
            switch(p) {
                case 'library': return 'Library';
                case 'virtualroom': return 'Virtual Classroom';
                case 'chat': return 'Community Chat';
                default: return p;
            }
        }).join(', ');
        
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
                <div class="quick-stat-card">
                    <i class="fas fa-crown"></i>
                    <div>
                        <span class="quick-stat-label">Current Plan</span>
                        <span class="quick-stat-value">${subscriptionPlan === 'premium' ? '👑 Premium' : subscriptionPlan === 'standard' ? '📦 Standard' : subscriptionPlan === 'basic' ? '🌱 Basic' : '🎁 Free'}</span>
                    </div>
                    ${subscriptionPlan !== 'premium' ? `<button class="upgrade-plan-small" id="upgradePlanBtn">Upgrade</button>` : ''}
                </div>
            </div>
            
            ${subscriptionPlan === 'standard' || subscriptionPlan === 'basic' ? `
                <div class="platform-access-card">
                    <div class="platform-access-header">
                        <i class="fas fa-check-circle"></i>
                        <span>Your Selected Platforms</span>
                        <button class="change-platforms-btn" id="changePlatformsBtn">Change</button>
                    </div>
                    <div class="platform-access-list">
                        ${selectedPlatforms.map(p => `
                            <div class="platform-access-item">
                                <span class="platform-icon">${p === 'library' ? '📚' : p === 'virtualroom' ? '🎥' : '💬'}</span>
                                <span class="platform-name">${p === 'library' ? 'Digital Library' : p === 'virtualroom' ? 'Virtual Classroom' : 'Community Chat'}</span>
                                <span class="platform-badge">Unlimited ✓</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="hub-free-note">
                        <i class="fas fa-info-circle"></i> Hub is always free for everyone.
                    </div>
                </div>
            ` : subscriptionPlan === 'premium' ? `
                <div class="platform-access-card premium">
                    <div class="platform-access-header">
                        <i class="fas fa-crown"></i>
                        <span>Premium Access - All Platforms</span>
                    </div>
                    <div class="platform-access-list">
                        <div class="platform-access-item"><span class="platform-icon">📚</span><span class="platform-name">Digital Library</span><span class="platform-badge">Unlimited ✓</span></div>
                        <div class="platform-access-item"><span class="platform-icon">🎥</span><span class="platform-name">Virtual Classroom</span><span class="platform-badge">Unlimited ✓</span></div>
                        <div class="platform-access-item"><span class="platform-icon">💬</span><span class="platform-name">Community Chat</span><span class="platform-badge">Unlimited ✓</span></div>
                        <div class="platform-access-item"><span class="platform-icon">📰</span><span class="platform-name">Hub</span><span class="platform-badge">Always Free</span></div>
                    </div>
                </div>
            ` : `
                <div class="platform-access-card free">
                    <div class="platform-access-header">
                        <i class="fas fa-hourglass-half"></i>
                        <span>Free Access (15 min/day per platform)</span>
                    </div>
                    <div class="platform-access-list">
                        <div class="platform-access-item"><span class="platform-icon">📚</span><span class="platform-name">Digital Library</span><span class="platform-badge">15 min/day</span></div>
                        <div class="platform-access-item"><span class="platform-icon">🎥</span><span class="platform-name">Virtual Classroom</span><span class="platform-badge">15 min/day</span></div>
                        <div class="platform-access-item"><span class="platform-icon">💬</span><span class="platform-name">Community Chat</span><span class="platform-badge">15 min/day</span></div>
                        <div class="platform-access-item"><span class="platform-icon">📰</span><span class="platform-name">Hub</span><span class="platform-badge">Always Free</span></div>
                    </div>
                    <button class="upgrade-plan-btn-full" id="upgradeFromFreeBtn">Upgrade for Unlimited Access</button>
                </div>
            `}
            
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
        
        // Event listeners
        document.getElementById('quickAddFundsBtn')?.addEventListener('click', () => {
            switchTab('wallet');
        });
        
        document.getElementById('upgradePlanBtn')?.addEventListener('click', () => {
            switchTab('wallet');
        });
        
        document.getElementById('upgradeFromFreeBtn')?.addEventListener('click', () => {
            switchTab('wallet');
        });
        
        document.getElementById('changePlatformsBtn')?.addEventListener('click', () => {
            showPlatformSelectorForCurrentUser();
        });
        
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
        
    } catch (error) {
        console.error('Error rendering dashboard:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Dashboard</h3>
                <button class="btn-primary" onclick="location.reload()">Refresh</button>
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
                <div class="leaderboard-badge">${entry.current_badge}</div>
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
// PLATFORM SELECTOR FOR BASIC/STANDARD USERS
// ============================================
async function showPlatformSelectorForCurrentUser() {
    const subscriptionPlan = currentUser?.subscriptionPlan || 'free';
    const currentSelections = currentUser?.selectedPlatforms || [];
    const maxSelections = subscriptionPlan === 'standard' ? 2 : 1;
    
    const platforms = [
        { id: 'library', name: 'Digital Library', icon: '📚', description: 'Access books, bundles, learning materials' },
        { id: 'virtualroom', name: 'Virtual Classroom', icon: '🎥', description: 'Live classes, whiteboard, screen sharing' },
        { id: 'chat', name: 'Community Chat', icon: '💬', description: 'Connect with fellow learners' }
    ];
    
    let selected = [...currentSelections];
    
    const modalContent = `
        <div class="modal-content platform-selector-modal">
            <div class="modal-header">
                <h2>${subscriptionPlan === 'standard' ? '📦 Choose 2 Platforms' : '🌱 Choose 1 Platform'}</h2>
                <button class="modal-close" id="closePlatformModal">&times;</button>
            </div>
            <div class="modal-body">
                <p>Select which platforms you want unlimited access to:</p>
                <div class="platform-list">
                    ${platforms.map(p => `
                        <div class="platform-option ${selected.includes(p.id) ? 'selected' : ''}" data-platform="${p.id}">
                            <div class="platform-icon">${p.icon}</div>
                            <div class="platform-info">
                                <div class="platform-name">${p.name}</div>
                                <div class="platform-desc">${p.description}</div>
                            </div>
                            <div class="platform-check">
                                ${selected.includes(p.id) ? '✓' : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="selection-info">
                    <span id="selectionCount">${selected.length}</span> / ${maxSelections} selected
                </div>
                <div class="hub-note">
                    <i class="fas fa-info-circle"></i> Hub is always free for everyone.
                </div>
            </div>
            <div class="modal-footer">
                <button id="savePlatformsBtn" class="btn-primary" ${selected.length !== maxSelections ? 'disabled' : ''}>Save Changes</button>
                <button id="cancelPlatformBtn" class="btn-outline">Cancel</button>
            </div>
        </div>
    `;
    
    let modal = document.getElementById('platformSelectorModal');
    if (modal) modal.remove();
    
    modal = document.createElement('div');
    modal.id = 'platformSelectorModal';
    modal.className = 'modal';
    modal.innerHTML = modalContent;
    document.body.appendChild(modal);
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Platform selection handler
    document.querySelectorAll('.platform-option').forEach(option => {
        option.addEventListener('click', () => {
            const platformId = option.getAttribute('data-platform');
            const index = selected.indexOf(platformId);
            
            if (index === -1 && selected.length < maxSelections) {
                selected.push(platformId);
                option.classList.add('selected');
                option.querySelector('.platform-check').textContent = '✓';
            } else if (index !== -1) {
                selected.splice(index, 1);
                option.classList.remove('selected');
                option.querySelector('.platform-check').textContent = '';
            }
            
            document.getElementById('selectionCount').textContent = selected.length;
            const saveBtn = document.getElementById('savePlatformsBtn');
            if (saveBtn) {
                saveBtn.disabled = selected.length !== maxSelections;
            }
        });
    });
    
    document.getElementById('closePlatformModal')?.addEventListener('click', () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    });
    
    document.getElementById('cancelPlatformBtn')?.addEventListener('click', () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    });
    
    document.getElementById('savePlatformsBtn')?.addEventListener('click', async () => {
        if (selected.length === maxSelections) {
            // Update user's selected platforms in database
            const { error } = await supabase
                .from('users')
                .update({ selected_platforms: selected })
                .eq('id', currentUser.id);
            
            if (error) {
                showToast('Failed to update platform selection', 'error');
            } else {
                currentUser.selectedPlatforms = selected;
                localStorage.setItem('glimu_user', JSON.stringify(currentUser));
                showToast('Platform selection updated!', 'success');
                await renderDashboard();
            }
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    };
}

// ============================================
// WALLET TAB - UPDATED WITH NEW PLANS
// ============================================
async function renderWallet() {
    const container = document.getElementById('wallet-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading wallet...</div>';
    
    try {
        await loadPaymentsFromStorage(true);
        
        const balance = await getWalletBalance();
        const transactions = await getTransactionHistory();
        const planDetails = getPlanDetails();
        
        // Get user's current plan
        const userPlan = currentUser?.subscriptionPlan || 'free';
        const selectedPlatforms = currentUser?.selectedPlatforms || [];
        
        container.innerHTML = `
            <div class="section-header">
                <div>
                    <h2>Wallet & Subscriptions</h2>
                    <p>Manage your funds and subscription plans</p>
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
            
            <div class="current-plan-section">
                <h3>Your Current Plan</h3>
                <div class="current-plan-card">
                    <div class="plan-icon-large">${userPlan === 'premium' ? '👑' : userPlan === 'standard' ? '📦' : userPlan === 'basic' ? '🌱' : '🎁'}</div>
                    <div class="plan-info-large">
                        <div class="plan-name">${userPlan === 'premium' ? 'Premium' : userPlan === 'standard' ? 'Standard' : userPlan === 'basic' ? 'Basic' : 'Free'}</div>
                        <div class="plan-description">
                            ${userPlan === 'premium' ? 'Unlimited access to all platforms' : 
                              userPlan === 'standard' ? `Unlimited access to: ${selectedPlatforms.map(p => p === 'library' ? 'Library' : p === 'virtualroom' ? 'Virtual Classroom' : 'Community Chat').join(', ')}` :
                              userPlan === 'basic' ? `Unlimited access to: ${selectedPlatforms.map(p => p === 'library' ? 'Library' : p === 'virtualroom' ? 'Virtual Classroom' : 'Community Chat').join(', ')}` :
                              '15 minutes per day on each platform'}
                        </div>
                    </div>
                    ${userPlan !== 'premium' ? `<button class="upgrade-plan-main" id="upgradePlanMainBtn">Upgrade Plan</button>` : ''}
                </div>
            </div>
            
            <div class="plans-section">
                <h3>Subscription Plans</h3>
                <div class="plans-grid">
                    <div class="plan-card basic">
                        <div class="plan-icon">🌱</div>
                        <h4>Basic</h4>
                        <div class="plan-price">₦7,500<span>/month</span></div>
                        <ul class="plan-features">
                            <li>✓ Access to <strong>1 platform</strong> of your choice</li>
                            <li>✓ Unlimited Hub access</li>
                            <li>✓ Basic support</li>
                        </ul>
                        <button class="plan-select-btn" data-plan="basic">Select Plan</button>
                    </div>
                    
                    <div class="plan-card standard">
                        <div class="plan-icon">📦</div>
                        <h4>Standard</h4>
                        <div class="plan-price">₦13,000<span>/month</span></div>
                        <ul class="plan-features">
                            <li>✓ Access to <strong>2 platforms</strong> of your choice</li>
                            <li>✓ Unlimited Hub access</li>
                            <li>✓ Priority support</li>
                        </ul>
                        <button class="plan-select-btn" data-plan="standard">Select Plan</button>
                    </div>
                    
                    <div class="plan-card premium">
                        <div class="plan-badge">Most Popular</div>
                        <div class="plan-icon">👑</div>
                        <h4>Premium</h4>
                        <div class="plan-price">₦15,000<span>/month</span></div>
                        <ul class="plan-features">
                            <li>✓ Full access to <strong>all 3 platforms</strong></li>
                            <li>✓ Unlimited Hub access</li>
                            <li>✓ 24/7 priority support</li>
                            <li>✓ Monthly bonus rewards</li>
                        </ul>
                        <button class="plan-select-btn btn-primary" data-plan="premium">Select Plan</button>
                    </div>
                </div>
                <div class="plan-note">
                    <i class="fas fa-info-circle"></i> Hub is always free for everyone.
                </div>
            </div>
            
            <div class="transactions-section">
                <h3>Recent Transactions</h3>
                <div class="transactions-list">
                    ${transactions.length === 0 ? '<p class="empty-transactions">No transactions yet</p>' : 
                        transactions.slice(0, 5).map(t => `
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
                        allPayments.slice(0, 3).map(p => `
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
        
        // Add Funds button
        document.getElementById('addFundsBtn')?.addEventListener('click', () => {
            openFundWalletModal();
        });
        
        // Upgrade plan button
        document.getElementById('upgradePlanMainBtn')?.addEventListener('click', () => {
            document.querySelector('.plans-section').scrollIntoView({ behavior: 'smooth' });
        });
        
        // Plan selection
        document.querySelectorAll('.plan-select-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const plan = btn.getAttribute('data-plan');
                
                if (plan === 'premium') {
                    const result = await purchasePremium();
                    if (result === true) {
                        showToast('Premium activated!', 'success');
                        setTimeout(() => renderDashboard(), 1000);
                    } else if (result?.needsTopUp) {
                        openFundWalletModal(result.amount);
                    }
                } else if (plan === 'standard') {
                    // Show platform selector
                    showPlatformSelectorForPurchase('standard', async (selectedPlatforms) => {
                        const result = await purchaseStandard(selectedPlatforms);
                        if (result === true) {
                            showToast('Standard plan activated!', 'success');
                            setTimeout(() => {
                                renderDashboard();
                                renderWallet();
                            }, 1000);
                        } else if (result?.needsTopUp) {
                            openFundWalletModal(result.amount);
                        }
                    });
                } else if (plan === 'basic') {
                    // Show platform selector
                    showPlatformSelectorForPurchase('basic', async (selectedPlatform) => {
                        const result = await purchaseBasic(selectedPlatform[0]);
                        if (result === true) {
                            showToast('Basic plan activated!', 'success');
                            setTimeout(() => {
                                renderDashboard();
                                renderWallet();
                            }, 1000);
                        } else if (result?.needsTopUp) {
                            openFundWalletModal(result.amount);
                        }
                    });
                }
            });
        });
        
    } catch (error) {
        console.error('Error rendering wallet:', error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error Loading Wallet</h3><button class="btn-primary" onclick="renderWallet()">Try Again</button></div>`;
    }
}

// ============================================
// PLATFORM SELECTOR FOR PURCHASE FLOW
// ============================================
function showPlatformSelectorForPurchase(planType, onComplete) {
    const maxSelections = planType === 'standard' ? 2 : 1;
    let selected = [];
    
    const platforms = [
        { id: 'library', name: 'Digital Library', icon: '📚', description: 'Access books, bundles, learning materials' },
        { id: 'virtualroom', name: 'Virtual Classroom', icon: '🎥', description: 'Live classes, whiteboard, screen sharing' },
        { id: 'chat', name: 'Community Chat', icon: '💬', description: 'Connect with fellow learners' }
    ];
    
    const modalContent = `
        <div class="modal-content platform-selector-modal">
            <div class="modal-header">
                <h2>${planType === 'standard' ? '📦 Choose 2 Platforms' : '🌱 Choose 1 Platform'}</h2>
                <button class="modal-close" id="closePlatformModal">&times;</button>
            </div>
            <div class="modal-body">
                <p>Select which platforms you want unlimited access to:</p>
                <div class="platform-list">
                    ${platforms.map(p => `
                        <div class="platform-option" data-platform="${p.id}">
                            <div class="platform-icon">${p.icon}</div>
                            <div class="platform-info">
                                <div class="platform-name">${p.name}</div>
                                <div class="platform-desc">${p.description}</div>
                            </div>
                            <div class="platform-check"></div>
                        </div>
                    `).join('')}
                </div>
                <div class="selection-info">
                    <span id="selectionCount">0</span> / ${maxSelections} selected
                </div>
                <div class="hub-note">
                    <i class="fas fa-info-circle"></i> Hub is always free for everyone.
                </div>
            </div>
            <div class="modal-footer">
                <button id="confirmPlatformBtn" class="btn-primary" disabled>Continue to Payment</button>
                <button id="cancelPlatformBtn" class="btn-outline">Cancel</button>
            </div>
        </div>
    `;
    
    let modal = document.getElementById('platformPurchaseModal');
    if (modal) modal.remove();
    
    modal = document.createElement('div');
    modal.id = 'platformPurchaseModal';
    modal.className = 'modal';
    modal.innerHTML = modalContent;
    document.body.appendChild(modal);
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    document.querySelectorAll('.platform-option').forEach(option => {
        option.addEventListener('click', () => {
            const platformId = option.getAttribute('data-platform');
            const index = selected.indexOf(platformId);
            
            if (index === -1 && selected.length < maxSelections) {
                selected.push(platformId);
                option.classList.add('selected');
                option.querySelector('.platform-check').textContent = '✓';
            } else if (index !== -1) {
                selected.splice(index, 1);
                option.classList.remove('selected');
                option.querySelector('.platform-check').textContent = '';
            }
            
            document.getElementById('selectionCount').textContent = selected.length;
            const confirmBtn = document.getElementById('confirmPlatformBtn');
            if (confirmBtn) {
                confirmBtn.disabled = selected.length !== maxSelections;
            }
        });
    });
    
    document.getElementById('closePlatformModal')?.addEventListener('click', () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    });
    
    document.getElementById('cancelPlatformBtn')?.addEventListener('click', () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    });
    
    document.getElementById('confirmPlatformBtn')?.addEventListener('click', () => {
        if (selected.length === maxSelections) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            onComplete(selected);
        }
    });
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    };
}

// ============================================
// FUND WALLET MODAL
// ============================================
function openFundWalletModal(suggestedAmount = null) {
    // ... (keep existing fund wallet modal code)
    // This function remains the same as before
    console.log('Open fund wallet modal', suggestedAmount);
    showToast('Add funds feature coming soon', 'info');
}

// ============================================
// OTHER FUNCTIONS (Go To Menu, Settings, etc.)
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

async function renderQuestionBar() {
    const container = document.getElementById('question-section');
    if (!container) return;
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading next question...</div>';
    
    try {
        const nextQuestion = await getNextQuestion(currentUser.id);
        
        if (!nextQuestion) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i><h3>All Questions Complete!</h3><button class="btn-primary" onclick="switchTab('dashboard')">Return to Dashboard</button></div>`;
            return;
        }
        
        questionRenderer = new QuestionRenderer('question-section', currentUser.id, async (result) => {
            const scoreData = await getStudentScore(currentUser.id);
            const currentBadge = getCurrentBadge(scoreData?.current_score || 0);
            const nextBadge = getNextBadge(scoreData?.current_score || 0);
            const progressToNext = getProgressToNextBadge(scoreData?.current_score || 0);
            
            const progressSection = document.querySelector('.progress-section');
            if (progressSection) {
                progressSection.innerHTML = renderProgressBar(scoreData?.current_score || 0, currentBadge, nextBadge, progressToNext);
            }
            setTimeout(() => renderQuestionBar(), 2000);
        });
        
        await questionRenderer.renderQuestion(nextQuestion);
        
    } catch (error) {
        console.error('Error loading question:', error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Unable to load question</h3><button class="btn-primary" onclick="renderQuestionBar()">Try Again</button></div>`;
    }
}

async function renderSettings() {
    const container = document.getElementById('settings-section');
    if (!container) return;
    
    const isDark = document.body.classList.contains('dark-mode');
    const portfolioUrl = `${window.location.origin}/u/${currentUser.name.toLowerCase().replace(/\s+/g, '-')}`;
    const portfolioItems = await getStudentPortfolio(currentUser.id, false);
    
    container.innerHTML = `
        <div class="section-header">
            <div><h2>Settings</h2><p>Manage your account preferences</p></div>
        </div>
        
        <div class="settings-grid">
            <div class="settings-card">
                <h3>Profile Picture</h3>
                <div class="profile-picture-section">
                    <div class="current-avatar"><img src="${currentUser?.avatar}" alt="Profile" id="profilePreview"></div>
                    <div class="avatar-upload">
                        <input type="file" id="avatarUpload" accept="image/*" style="display: none;">
                        <button class="btn-outline" id="uploadAvatarBtn">Upload Photo</button>
                    </div>
                </div>
            </div>
            
            <div class="settings-card">
                <h3>Account Information</h3>
                <form id="settingsForm">
                    <div class="form-group"><label>Full Name</label><input type="text" id="fullNameInput" value="${currentUser?.name || ''}"></div>
                    <div class="form-group"><label>Email</label><input type="email" value="${currentUser?.email || ''}" disabled><small>Email cannot be changed</small></div>
                    <div class="form-group"><label>Home/Work Address</label><input type="text" id="addressInput" value="${currentUser?.address || ''}" placeholder="Enter your address"></div>
                </form>
            </div>
            
            <div class="settings-card">
                <h3>Change Password</h3>
                <form id="passwordForm">
                    <div class="form-group"><label>Current Password</label><input type="password" id="currentPassword" placeholder="Enter current password"></div>
                    <div class="form-group"><label>New Password</label><input type="password" id="newPassword" placeholder="At least 8 characters"></div>
                    <div class="form-group"><label>Confirm New Password</label><input type="password" id="confirmPassword" placeholder="Re-enter new password"></div>
                    <button type="submit" class="btn-primary">Update Password</button>
                </form>
            </div>
            
            <div class="settings-card">
                <h3>Preferences</h3>
                <div class="form-group"><label>Theme</label><div class="theme-selector"><button class="theme-option ${!isDark ? 'active' : ''}" data-theme="light">☀️ Light</button><button class="theme-option ${isDark ? 'active' : ''}" data-theme="dark">🌙 Dark</button></div></div>
            </div>
            
            <div class="settings-card">
                <h3>Portfolio</h3>
                <div class="portfolio-settings">
                    <p>Your public portfolio shows your best work to the world.</p>
                    <div class="portfolio-stats"><span><i class="fas fa-briefcase"></i> ${portfolioItems.length} items</span><span><i class="fas fa-eye"></i> Total views: ${portfolioItems.reduce((sum, i) => sum + (i.view_count || 0), 0)}</span></div>
                    <div class="portfolio-url-display"><input type="text" id="portfolioUrl" readonly value="${portfolioUrl}"><button id="copyPortfolioUrlBtn" class="btn-outline">Copy URL</button></div>
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
                const { error } = await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', currentUser.id);
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
            const { error } = await supabase.from('users').update({ ...updates, full_name: newName }).eq('id', currentUser.id);
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
        
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        
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
            window.location.href = '/signin.html';
        }
    });
}

function renderGradeSubmissions() {
    const container = document.getElementById('grade-section');
    if (!container) return;
    container.innerHTML = `<div class="section-header"><h2>Grade Submissions</h2></div><div class="empty-state"><i class="fas fa-check-circle"></i><h3>No pending submissions</h3></div>`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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

initDashboard();

window.switchTab = switchTab;
window.toggleTheme = toggleTheme;
window.renderQuestionBar = renderQuestionBar;
