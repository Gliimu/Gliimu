// ============================================
// GLIIMU DASHBOARD - COMPLETE STUDENT VERSION
// Wallet Balance: ₦14,500 (NOT ₦25,000)
// Tabs: Dashboard, Questions, Go To, Wallet, Settings
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
    isPremium,
    subscribeToWalletUpdates,
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
const CACHE_DURATION = 30000; // 30 seconds
const PAYMENTS_CACHE_DURATION = 60000; // 1 minute

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
                    wallet_balance: 14500  // ✅ CORRECT: ₦14,500
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
        currentWalletBalance = profile.wallet_balance || 14500;  // ✅ CORRECT: ₦14,500
        currentUser = {
            id: userId,
            name: profile.name || profile.full_name || 'User',
            email: profile.email,
            role: profile.role || 'student',
            subscriptionTier: profile.subscription_tier || 'premium',
            walletBalance: profile.wallet_balance || 14500,  // ✅ CORRECT: ₦14,500
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
            subscriptionTier: 'premium',
            walletBalance: 14500,  // ✅ CORRECT: ₦14,500
            avatar: 'https://ui-avatars.com/api/?name=Test+User&background=fbb040&color=fff'
        };
        currentRole = 'student';
        localStorage.setItem('glimu_user', JSON.stringify(currentUser));
    }
}

// ============================================
// OPTIMIZED PAYMENT STORAGE FUNCTIONS
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
        cancelledPayments = allPayments.filter(p => p.status === 'cancelled');
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
            cancelledPayments = allPayments.filter(p => p.status === 'cancelled');
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
    cancelledPayments = allPayments.filter(p => p.status === 'cancelled');
}

async function savePaymentToStorage(payment) {
    allPayments.unshift(payment);
    paymentsCache = allPayments;
    lastPaymentsFetch = Date.now();
    
    pendingPayments = allPayments.filter(p => p.status === 'pending');
    approvedPayments = allPayments.filter(p => p.status === 'approved');
    cancelledPayments = allPayments.filter(p => p.status === 'cancelled');
    
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
        const walletBalance = currentUser?.walletBalance || 14500;  // ✅ CORRECT: ₦14,500
        
        container.innerHTML = `
            <div class="progress-section">
                ${renderProgressBar(scoreData?.current_score || 0, currentBadge, nextBadge, progressToNext)}
            </div>
            
            ${isAmbassador ? `
                <div class="mvp-section">
                    <div class="mvp-header">
                        <i class="fas fa-rocket"></i>
                        <h3>MVP Ambassador Zone</h3>
                    </div>
                    <p>You've reached 100%! Submit your real-world project proposal to become a Gliimu Ambassador.</p>
                    <button id="openMvpFormBtn" class="btn-primary">Submit MVP Proposal</button>
                </div>
            ` : `
                <div class="mvp-locked-section">
                    <div class="mvp-locked-header">
                        <i class="fas fa-lock"></i>
                        <h3>Unlock Ambassador Zone</h3>
                    </div>
                    <p>Reach 100% score to submit real-world project proposals and become a Gliimu Ambassador.</p>
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
        
        document.getElementById('quickAddFundsBtn')?.addEventListener('click', () => {
            openFundWalletModal();
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
                <button class="btn-primary" onclick="renderQuestionBar()">Try Again</button>
            </div>
        `;
    }
}

// ============================================
// GO TO MENU TAB - WITH SUBSCRIPTION CARDS
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
                <div class="go-to-icon">
                    <i class="fas fa-book"></i>
                </div>
                <div class="go-to-info">
                    <h3>Library</h3>
                    <p>Access books, bundles, and learning materials</p>
                </div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/hub.html'">
                <div class="go-to-icon">
                    <i class="fas fa-newspaper"></i>
                </div>
                <div class="go-to-info">
                    <h3>Hub</h3>
                    <p>Events, insights, and latest updates</p>
                </div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/chat.html'">
                <div class="go-to-icon">
                    <i class="fas fa-comments"></i>
                </div>
                <div class="go-to-info">
                    <h3>Community</h3>
                    <p>Connect with fellow learners and instructors</p>
                </div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/virtualroom.html'">
                <div class="go-to-icon">
                    <i class="fas fa-video"></i>
                </div>
                <div class="go-to-info">
                    <h3>Virtual Classroom</h3>
                    <p>Live classes and interactive sessions</p>
                </div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
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
                        <li>✓ Access to 1 platform</li>
                        <li>✓ Choose Library, Hub, or Community</li>
                        <li>✓ Basic support</li>
                    </ul>
                    <button class="btn-outline plan-select" data-plan="basic">Select Plan</button>
                </div>
                
                <div class="plan-card standard">
                    <div class="plan-icon">📦</div>
                    <h4>Standard</h4>
                    <div class="plan-price">₦13,000<span>/month</span></div>
                    <ul class="plan-features">
                        <li>✓ Access to any 2 platforms</li>
                        <li>✓ Hub + Community (default)</li>
                        <li>✓ Priority support</li>
                    </ul>
                    <button class="btn-outline plan-select" data-plan="standard">Select Plan</button>
                </div>
                
                <div class="plan-card premium">
                    <div class="plan-badge">Most Popular</div>
                    <div class="plan-icon">👑</div>
                    <h4>Premium</h4>
                    <div class="plan-price">₦15,000<span>/month</span></div>
                    <ul class="plan-features">
                        <li>✓ Full access to all 3 platforms</li>
                        <li>✓ Library + Hub + Community</li>
                        <li>✓ 24/7 priority support</li>
                        <li>✓ Monthly bonus rewards</li>
                    </ul>
                    <button class="btn-primary plan-select" data-plan="premium">Select Plan</button>
                </div>
            </div>
        </div>
    `;
    
    document.querySelectorAll('.plan-select').forEach(btn => {
        btn.addEventListener('click', async () => {
            const plan = btn.getAttribute('data-plan');
            if (plan === 'premium') {
                const result = await purchasePremium();
                if (result === true) {
                    showToast('Premium activated!', 'success');
                } else if (result?.needsTopUp) {
                    openFundWalletModal(result.amount);
                }
            } else if (plan === 'standard') {
                if (confirm('⚠️ WARNING: Standard plan gives Hub + Community access. You will forfeit remaining credit. Continue?')) {
                    await purchaseStandard();
                    showToast('Standard plan activated!', 'success');
                }
            } else {
                showToast('Basic plan selection coming soon. Please contact support.', 'info');
            }
        });
    });
}

// ============================================
// WALLET TAB - WITH SCROLLABLE FILTERS
// ============================================
async function renderWallet() {
    const container = document.getElementById('wallet-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading wallet...</div>';
    
    try {
        await loadPaymentsFromStorage(true);
        
        const balance = await getWalletBalance();
        const transactions = await getTransactionHistory();
        
        // Get all unique transaction types for filter
        const uniqueStatuses = ['all', 'pending', 'approved', 'rejected'];
        
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
                    ${transactions?.length === 0 ? '<p class="empty-transactions">No transactions yet</p>' : 
                        (transactions || []).slice(0, 5).map(t => `
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
            
            <div class="payment-filters-wrapper">
                <div class="payment-filters">
                    <button class="filter-btn ${currentPaymentFilter === 'all' ? 'active' : ''}" data-filter="all">All (${allPayments.length})</button>
                    <button class="filter-btn ${currentPaymentFilter === 'pending' ? 'active' : ''}" data-filter="pending">Pending (${pendingPayments.length})</button>
                    <button class="filter-btn ${currentPaymentFilter === 'approved' ? 'active' : ''}" data-filter="approved">Approved (${approvedPayments.length})</button>
                    <button class="filter-btn ${currentPaymentFilter === 'rejected' ? 'active' : ''}" data-filter="rejected">Rejected (${cancelledPayments.length})</button>
                    <button class="filter-btn ${currentPaymentFilter === 'transactions' ? 'active' : ''}" data-filter="transactions">Transactions (${transactions?.length || 0})</button>
                </div>
            </div>
            
            <div class="payments-section">
                <h3>${currentPaymentFilter === 'transactions' ? 'Transaction History' : 'Payment Requests'}</h3>
                <div class="payments-list">
                    ${renderPaymentList()}
                </div>
            </div>
        `;
        
        function renderPaymentList() {
            if (currentPaymentFilter === 'transactions') {
                if (!transactions || transactions.length === 0) {
                    return '<p class="empty-payments">No transactions found</p>';
                }
                return transactions.map(t => `
                    <div class="transaction-item-full">
                        <div class="transaction-info">
                            <div class="transaction-desc">${escapeHtml(t.description)}</div>
                            <div class="transaction-date">${new Date(t.created_at).toLocaleString()}</div>
                        </div>
                        <div class="transaction-amount ${t.amount > 0 ? 'positive' : 'negative'}">
                            ${t.amount > 0 ? '+' : ''}₦${Math.abs(t.amount).toLocaleString()}
                        </div>
                    </div>
                `).join('');
            }
            
            let displayPayments = [];
            if (currentPaymentFilter === 'pending') displayPayments = pendingPayments;
            else if (currentPaymentFilter === 'approved') displayPayments = approvedPayments;
            else if (currentPaymentFilter === 'rejected') displayPayments = cancelledPayments;
            else displayPayments = allPayments;
            
            if (displayPayments.length === 0) {
                return `<p class="empty-payments">No ${currentPaymentFilter !== 'all' ? currentPaymentFilter : ''} payments found</p>`;
            }
            
            return displayPayments.map(p => `
                <div class="payment-item ${p.status}">
                    <div class="payment-info">
                        <div class="payment-amount">₦${p.amount.toLocaleString()}</div>
                        <div class="payment-date">${new Date(p.submitted_at || p.date).toLocaleDateString()}</div>
                        <div class="payment-ref">Ref: ${p.reference_code || p.reference}</div>
                        ${p.status === 'rejected' ? `<div class="payment-reason">Reason: ${p.admin_notes || 'Contact support for details'}</div>` : ''}
                    </div>
                    <div class="payment-status-badge ${p.status}">${p.status}</div>
                </div>
            `).join('');
        }
        
        document.getElementById('addFundsBtn')?.addEventListener('click', () => openFundWalletModal());
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentPaymentFilter = btn.getAttribute('data-filter');
                renderWallet();
            });
        });
        
    } catch (error) {
        console.error('Error rendering wallet:', error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error Loading Wallet</h3><button class="btn-primary" onclick="renderWallet()">Try Again</button></div>`;
    }
}

// ============================================
// FUND WALLET MODAL - WITH RANDOM BANK
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
                    </div>
                    
                    <div class="bank-details" style="display: none;">
                        <h3>Bank Transfer Details</h3>
                        <div class="bank-info-card" id="bankInfoCard">
                            <!-- Random bank will be inserted here -->
                        </div>
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
    
    // Randomly select a bank
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
    
    // Amount button handlers
    modal.querySelectorAll('.amount-btn').forEach(btn => {
        btn.onclick = () => {
            modal.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedAmount = parseInt(btn.getAttribute('data-amount'));
            const customInput = modal.querySelector('#customAmount');
            if (customInput) customInput.value = '';
            // Show selected amount
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
        
        // Generate short reference code
        const shortName = currentUser.name.substring(0, 8).replace(/\s/g, '');
        const randomNum = Math.floor(Math.random() * 9000) + 1000;
        referenceCode = `GLM-${shortName}-${randomNum}`;
        modal.querySelector('#referenceCode').textContent = referenceCode;
        
        // Show the randomly selected bank
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
            
            const paymentRequest = {
                id: `pay_${Date.now()}`,
                user_id: currentUser.id,
                user_name: currentUser.name,
                user_email: currentUser.email,
                amount: selectedAmount,
                reference_code: referenceCode,
                bank: selectedBank.name,
                status: 'pending',
                submitted_at: new Date().toISOString()
            };
            
            await savePaymentToStorage(paymentRequest);
            
            showToast(`Payment request submitted! Reference: ${referenceCode}`, 'success');
            modal.classList.remove('active');
            document.body.style.overflow = '';
            setTimeout(() => renderWallet(), 500);
        };
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
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
                        <input type="email" id="emailInput" value="${currentUser?.email || ''}" disabled>
                        <small>Email cannot be changed</small>
                    </div>
                    <div class="form-group">
                        <label>Role</label>
                        <input type="text" value="${currentRole.toUpperCase()}" disabled>
                    </div>
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
                <div class="form-group">
                    <label>Email Notifications</label>
                    <label class="toggle-switch">
                        <input type="checkbox" id="emailNotifications" checked>
                        <span class="toggle-slider"></span>
                    </label>
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
    
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.getAttribute('data-theme');
            if (theme === 'dark') {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
            localStorage.setItem('theme', theme);
            document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
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
    
    document.getElementById('copyPortfolioUrlBtn')?.addEventListener('click', () => {
        const urlInput = document.getElementById('portfolioUrl');
        urlInput.select();
        document.execCommand('copy');
        showToast('Portfolio URL copied!', 'success');
    });
    
    document.getElementById('viewPublicPortfolioBtn')?.addEventListener('click', () => {
        window.open(portfolioUrl, '_blank');
    });
    
    document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
        const newName = document.getElementById('fullNameInput').value;
        
        if (newName !== currentUser.name) {
            const { error } = await supabase
                .from('users')
                .update({ name: newName, full_name: newName })
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
    
    document.getElementById('signOutBtn')?.addEventListener('click', async () => {
        const confirmed = confirm('Are you sure you want to sign out?');
        if (confirmed) {
            await supabase.auth.signOut();
            localStorage.clear();
            window.location.href = '/signin.html';
        }
    });
}

// ============================================
// GRADE SUBMISSIONS TAB (Instructor)
// ============================================
function renderGradeSubmissions() {
    const container = document.getElementById('grade-section');
    if (!container) return;
    container.innerHTML = `<div class="section-header"><h2>Grade Submissions</h2></div><div class="empty-state"><i class="fas fa-check-circle"></i><h3>No pending submissions</h3></div>`;
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

// ============================================
// MOBILE BOTTOM NAVIGATION
// ============================================
function initMobileNavigation() {
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
    const isMobile = window.innerWidth <= 768;
    
    if (!isMobile) return;
    
    mobileNavItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            
            // Update mobile nav active state
            mobileNavItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Switch tab
            switchTab(tabId);
        });
    });
    
    // Sync active state with current tab
    function syncMobileActiveState() {
        mobileNavItems.forEach(item => {
            const tabId = item.getAttribute('data-tab');
            if (tabId === currentTab) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }
    
    // Call sync when tab changes
    const originalSwitchTab = window.switchTab;
    window.switchTab = function(tabId) {
        originalSwitchTab(tabId);
        syncMobileActiveState();
    };
    
    syncMobileActiveState();
}

// Call this in initDashboard() after building sidebar
await renderDashboard();
initMobileNavigation();

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
    
    console.log('Dashboard initialized successfully');
}

initDashboard();

window.switchTab = switchTab;
window.toggleTheme = toggleTheme;
window.renderQuestionBar = renderQuestionBar;
