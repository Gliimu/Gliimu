// ============================================
// GLIIMU DASHBOARD - COMPLETE STUDENT VERSION
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
    getStudentPortfolio,
    submitAnswer,
    reportQuestion,
    requestDebateMatch
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
let questionRenderer = null;

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
        
        if (profileError) throw profileError;
        
        loadMockPayments();
        
        currentUserProfile = profile;
        currentWalletBalance = profile.wallet_balance || 14500;
        currentUser = {
            id: userId,
            name: profile.name || profile.full_name || 'User',
            email: profile.email,
            role: profile.role || 'student',
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
// MOCK PAYMENT DATA
// ============================================
function loadMockPayments() {
    pendingPayments = [
        { id: 1, amount: 5000, date: '2025-06-01', reference: 'GLM-1234-5678', status: 'pending' },
        { id: 2, amount: 10000, date: '2025-05-28', reference: 'GLM-8765-4321', status: 'pending' }
    ];
    
    approvedPayments = [
        { id: 3, amount: 25000, date: '2025-05-15', reference: 'GLM-1111-2222', status: 'approved' },
        { id: 4, amount: 15000, date: '2025-05-01', reference: 'GLM-3333-4444', status: 'approved' }
    ];
    
    cancelledPayments = [
        { id: 5, amount: 3000, date: '2025-04-20', reference: 'GLM-5555-6666', status: 'cancelled' }
    ];
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
        
        if (currentTab === 'wallet') {
            renderWallet();
        }
        if (currentTab === 'dashboard') {
            const balanceElement = document.querySelector('.wallet-balance-large');
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
function loadTabData(tabId) {
    switch(tabId) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'question':
            renderQuestionBar();
            break;
        case 'gotomenu':
            renderGoToMenu();
            break;
        case 'wallet':
            renderWallet();
            break;
        case 'settings':
            renderSettings();
            break;
        case 'grade':
            renderGradeSubmissions();
            break;
        default:
            renderDashboard();
    }
}

// ============================================
// DASHBOARD RENDER - Progress Bar, MVP, Leaderboard
// ============================================
async function renderDashboard() {
    const container = document.getElementById('dashboard-section');
    if (!container) return;
    
    const scoreData = await getStudentScore(currentUser.id);
    const currentBadge = getCurrentBadge(scoreData?.current_score || 0);
    const nextBadge = getNextBadge(scoreData?.current_score || 0);
    const progressToNext = getProgressToNextBadge(scoreData?.current_score || 0);
    const leaderboardData = await getLeaderboard(10);
    const isAmbassador = (scoreData?.current_score || 0) >= 100;
    
    container.innerHTML = `
        <!-- Progress Bar Section -->
        <div class="progress-section">
            ${renderProgressBar(scoreData?.current_score || 0, currentBadge, nextBadge, progressToNext)}
        </div>
        
        <!-- MVP Section (Only for Ambassadors) -->
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
        
        <!-- Leaderboard Section -->
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
        
        <!-- MVP Proposal Modal -->
        <div id="mvpModal" class="modal">
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
        </div>
    `;
    
    // MVP Modal handlers
    const openMvpBtn = document.getElementById('openMvpFormBtn');
    if (openMvpBtn) {
        openMvpBtn.addEventListener('click', () => {
            document.getElementById('mvpModal').classList.add('active');
        });
    }
    
    const closeMvpModal = document.getElementById('closeMvpModal');
    if (closeMvpModal) {
        closeMvpModal.onclick = () => {
            document.getElementById('mvpModal').classList.remove('active');
        };
    }
    
    const mvpForm = document.getElementById('mvpForm');
    if (mvpForm) {
        mvpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('mvpTitle').value;
            const type = document.getElementById('mvpType').value;
            const description = document.getElementById('mvpDescription').value;
            const proposal = document.getElementById('mvpProposal').value;
            
            const result = await submitMVPProposal(currentUser.id, title, description, type, proposal);
            
            if (result) {
                document.getElementById('mvpModal').classList.remove('active');
                mvpForm.reset();
                showToast('MVP Proposal submitted! The school will review and reach out.', 'success');
            }
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
    `;
}

// ============================================
// WALLET TAB
// ============================================
async function renderWallet() {
    const container = document.getElementById('wallet-section');
    if (!container) return;
    
    const balance = await getWalletBalance();
    const transactions = await getTransactionHistory();
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Wallet</h2>
                <p>Manage your funds and subscription plans</p>
            </div>
        </div>
        
        <!-- Balance Section -->
        <div class="wallet-balance-card">
            <div class="wallet-balance-icon">
                <i class="fas fa-wallet"></i>
            </div>
            <div class="wallet-balance-info">
                <span class="wallet-label">Available Balance</span>
                <span class="wallet-balance-large">₦${balance.toLocaleString()}</span>
            </div>
            <button id="addFundsBtn" class="btn-primary">Add Funds</button>
        </div>
        
        <!-- Transactions List -->
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
        
        <!-- Pending Payments -->
        <div class="payments-section">
            <h3>Pending Payments</h3>
            <div class="payments-list">
                ${pendingPayments.length === 0 ? '<p class="empty-payments">No pending payments</p>' : 
                    pendingPayments.map(p => `
                        <div class="payment-item pending">
                            <div class="payment-info">
                                <div class="payment-amount">₦${p.amount.toLocaleString()}</div>
                                <div class="payment-date">${new Date(p.date).toLocaleDateString()}</div>
                                <div class="payment-ref">Ref: ${p.reference}</div>
                            </div>
                            <div class="payment-status-badge pending">Pending</div>
                        </div>
                    `).join('')
                }
            </div>
        </div>
        
        <!-- Approved Payments -->
        <div class="payments-section">
            <h3>Approved Payments</h3>
            <div class="payments-list">
                ${approvedPayments.length === 0 ? '<p class="empty-payments">No approved payments</p>' : 
                    approvedPayments.map(p => `
                        <div class="payment-item approved">
                            <div class="payment-info">
                                <div class="payment-amount">₦${p.amount.toLocaleString()}</div>
                                <div class="payment-date">${new Date(p.date).toLocaleDateString()}</div>
                                <div class="payment-ref">Ref: ${p.reference}</div>
                            </div>
                            <div class="payment-status-badge approved">Approved</div>
                        </div>
                    `).join('')
                }
            </div>
        </div>
        
        <!-- Cancelled Payments -->
        <div class="payments-section">
            <h3>Cancelled Payments</h3>
            <div class="payments-list">
                ${cancelledPayments.length === 0 ? '<p class="empty-payments">No cancelled payments</p>' : 
                    cancelledPayments.map(p => `
                        <div class="payment-item cancelled">
                            <div class="payment-info">
                                <div class="payment-amount">₦${p.amount.toLocaleString()}</div>
                                <div class="payment-date">${new Date(p.date).toLocaleDateString()}</div>
                                <div class="payment-ref">Ref: ${p.reference}</div>
                            </div>
                            <div class="payment-status-badge cancelled">Cancelled</div>
                        </div>
                    `).join('')
                }
            </div>
        </div>
        
        <!-- Plan Cards -->
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
    
    document.getElementById('addFundsBtn')?.addEventListener('click', () => {
        openModal('addFundsModal');
    });
    
    document.querySelectorAll('.plan-select').forEach(btn => {
        btn.addEventListener('click', async () => {
            const plan = btn.getAttribute('data-plan');
            if (plan === 'premium') {
                const result = await purchasePremium();
                if (result === true) {
                    setTimeout(() => renderWallet(), 1000);
                } else if (result?.needsTopUp) {
                    openModal('addFundsModal');
                }
            } else if (plan === 'standard') {
                if (confirm('⚠️ WARNING: Standard plan gives Hub + Community access. You will forfeit remaining credit. Continue?')) {
                    await purchaseStandard();
                    setTimeout(() => renderWallet(), 1000);
                }
            } else {
                showToast('Basic plan selection coming soon. Please contact support.', 'info');
            }
        });
    });
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
    
    // Theme selector
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
    
    // Copy portfolio URL
    document.getElementById('copyPortfolioUrlBtn')?.addEventListener('click', () => {
        const urlInput = document.getElementById('portfolioUrl');
        urlInput.select();
        document.execCommand('copy');
        showToast('Portfolio URL copied!', 'success');
    });
    
    // View public portfolio
    document.getElementById('viewPublicPortfolioBtn')?.addEventListener('click', () => {
        window.open(portfolioUrl, '_blank');
    });
    
    // Save settings
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
    
    // Sign Out button
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
async function renderGradeSubmissions() {
    const container = document.getElementById('grade-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Grade Submissions</h2>
                <p>Review and grade student work</p>
            </div>
        </div>
        <div class="empty-state">
            <i class="fas fa-check-circle"></i>
            <h3>No pending submissions</h3>
            <p>All caught up!</p>
        </div>
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
    
    initTheme();
    updateUI();
    createContentSections();
    buildSidebar();
    await renderDashboard();
    
    setupRealtimeWallet();
    
    console.log('Dashboard initialized successfully');
}

// ============================================
// START DASHBOARD
// ============================================
initDashboard();

// Make functions global
window.openModal = openModal;
window.closeModal = closeModal;
window.switchTab = switchTab;
window.toggleTheme = toggleTheme;
window.renderQuestionBar = renderQuestionBar;
