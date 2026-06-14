// ============================================
// GLIIMU DASHBOARD - UPDATED VERSION
// Changes: Removed Quick Stats, Learn → Assessment, Wallet with funding
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';
import { getWalletBalance, getTransactionHistory, addTransaction } from '../modules/wallet.js';
import { getStudentScore, getCurrentBadge, getNextBadge, getProgressToNextBadge, getLeaderboard, getStudentPortfolio } from '../modules/progression.js';
import { QuestionRenderer } from '../modules/questions.js';

// ============================================
// GLOBAL STATE
// ============================================
let currentUser = null;
let currentUserProfile = null;
let currentRole = 'student';
let currentTab = 'overview';
let currentWalletBalance = 0;
let walletSubscription = null;
let notifications = [];
let selectedAmount = 0;
let allPayments = [];
let allTransactions = [];

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
        window.location.href = '/signin';
    }, 1500);
    
    return false;
}

async function loadUserFromSupabase(userId) {
    try {
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (profileError) throw profileError;
        
        currentUserProfile = profile;
        currentWalletBalance = profile.wallet_balance || 14500;
        currentUser = {
            id: userId,
            name: profile.name || profile.full_name || 'User',
            email: profile.email,
            role: profile.role || 'student',
            walletBalance: profile.wallet_balance || 14500,
            address: profile.address || '',
            avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=fbb040&color=fff`,
            notification_email: profile.notification_email || '',
            notification_phone: profile.notification_phone || '',
            notify_payment: profile.notify_payment || false,
            notify_certificate: profile.notify_certificate || false,
            notify_promo: profile.notify_promo || false,
            notify_withdrawal: profile.notify_withdrawal || false
        };
        currentRole = currentUser.role;
        
        localStorage.setItem('glimu_user', JSON.stringify(currentUser));
        console.log('User loaded from Supabase:', currentUser);
        
        await loadNotifications();
        await loadPaymentsAndTransactions();
        
    } catch (error) {
        console.error('Error loading user from Supabase:', error);
    }
}

// ============================================
// LOAD PAYMENTS & TRANSACTIONS
// ============================================
async function loadPaymentsAndTransactions() {
    try {
        // Load payment requests (funding requests)
        const { data: payments, error: paymentsError } = await supabase
            .from('payment_requests')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('submitted_at', { ascending: false });
        
        if (!paymentsError && payments) {
            allPayments = payments;
        }
        
        // Load transactions
        const { data: transactions, error: transactionsError } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });
        
        if (!transactionsError && transactions) {
            allTransactions = transactions;
        }
        
    } catch (error) {
        console.error('Error loading payments/transactions:', error);
    }
}

// ============================================
// NOTIFICATIONS
// ============================================
async function loadNotifications() {
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (!error && data) {
            notifications = data;
        } else {
            notifications = [
                { id: 1, title: 'Welcome!', message: 'Welcome to Gliimu Dashboard', type: 'system', read: false, created_at: new Date().toISOString() }
            ];
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

async function markNotificationRead(notificationId) {
    try {
        await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
        await loadNotifications();
        renderOverview();
    } catch (error) {
        console.error('Error marking notification read:', error);
    }
}

async function markAllNotificationsRead() {
    try {
        await supabase.from('notifications').update({ read: true }).eq('user_id', currentUser.id);
        await loadNotifications();
        renderOverview();
        showToast('All notifications marked as read', 'success');
    } catch (error) {
        console.error('Error marking all read:', error);
    }
}

// ============================================
// ROLE-BASED TAB CONFIGURATION - UPDATED
// ============================================
const roleTabs = {
    student: [
        { id: 'overview', name: 'Overview', icon: 'fas fa-tachometer-alt' },
        { id: 'assessment', name: 'Assessment', icon: 'fas fa-question-circle' },
        { id: 'gotomenu', name: 'Go To', icon: 'fas fa-door-open' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Profile', icon: 'fas fa-cog' }
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
    const tabs = roleTabs[currentRole] || roleTabs.student;
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
    
    const tabs = roleTabs[currentRole] || roleTabs.student;
    
    dashboardContent.innerHTML = tabs.map(tab => `
        <div id="${tab.id}-section" class="dashboard-section ${tab.id === 'overview' ? 'active' : ''}">
            <div class="loading-spinner">Loading...</div>
        </div>
    `).join('');
}

// ============================================
// OVERVIEW TAB (No Quick Stats)
// ============================================
async function renderOverview() {
    const container = document.getElementById('overview-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading overview...</div>';
    
    try {
        const scoreData = await getStudentScore(currentUser.id);
        const currentBadge = getCurrentBadge(scoreData?.current_score || 0);
        const nextBadge = getNextBadge(scoreData?.current_score || 0);
        const progressToNext = getProgressToNextBadge(scoreData?.current_score || 0);
        const leaderboardData = await getLeaderboard(10);
        const unreadCount = notifications.filter(n => !n.read).length;
        
        container.innerHTML = `
            <div class="progress-section">
                ${renderProgressBar(scoreData?.current_score || 0, currentBadge, nextBadge, progressToNext)}
            </div>
            
            <div class="notification-section">
                <div class="notification-header">
                    <i class="fas fa-bell"></i>
                    <h3>Recent Notifications</h3>
                    ${unreadCount > 0 ? `<button class="mark-all-read" id="markAllReadBtn">Mark all as read</button>` : ''}
                </div>
                <div class="notification-list">
                    ${notifications.slice(0, 5).map(n => `
                        <div class="notification-item ${!n.read ? 'unread' : ''}" data-id="${n.id}">
                            <div class="notification-icon ${n.type}">
                                <i class="fas ${n.type === 'payment' ? 'fa-credit-card' : n.type === 'certificate' ? 'fa-certificate' : 'fa-bell'}"></i>
                            </div>
                            <div class="notification-content">
                                <div class="notification-title">${escapeHtml(n.title)}</div>
                                <div class="notification-message">${escapeHtml(n.message)}</div>
                                <div class="notification-time">${formatTimeAgo(n.created_at)}</div>
                            </div>
                            ${!n.read ? '<div class="notification-dot"></div>' : ''}
                        </div>
                    `).join('')}
                    ${notifications.length === 0 ? '<div class="empty-state"><p>No notifications yet</p></div>' : ''}
                </div>
            </div>
            
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
        
        document.getElementById('markAllReadBtn')?.addEventListener('click', () => markAllNotificationsRead());
        
        document.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', async () => {
                const id = item.getAttribute('data-id');
                if (id) await markNotificationRead(id);
            });
        });
        
        document.getElementById('refreshLeaderboardBtn')?.addEventListener('click', async () => {
            const newLeaderboard = await getLeaderboard(10);
            const leaderboardList = document.querySelector('.leaderboard-list');
            if (leaderboardList) {
                leaderboardList.innerHTML = renderLeaderboardList(newLeaderboard);
            }
            showToast('Leaderboard refreshed!', 'success');
        });
        
    } catch (error) {
        console.error('Error rendering overview:', error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error Loading Overview</h3><button class="btn-primary" onclick="location.reload()">Refresh</button></div>`;
    }
}

function renderProgressBar(score, currentBadge, nextBadge, progressToNext) {
    return `
        <div class="progress-header">
            <div class="current-badge">
                <div class="badge-icon" style="border-color: ${currentBadge.color}; color: ${currentBadge.color}">
                    <i class="fas ${currentBadge.icon}"></i>
                </div>
                <div class="badge-info">
                    <h4>${currentBadge.name}</h4>
                    <p>${currentBadge.description}</p>
                </div>
            </div>
            <div class="score-display">
                <span class="score-value">${Math.round(score)}%</span>
                <span class="score-label">Completion Score</span>
            </div>
        </div>
        <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${score}%"></div>
        </div>
        <div class="next-badge-info">
            <span>Next: ${nextBadge.name}</span>
            <span>${progressToNext}% to unlock</span>
        </div>
    `;
}

function renderLeaderboardList(leaderboardData) {
    if (!leaderboardData || leaderboardData.length === 0) {
        return '<div class="empty-state"><i class="fas fa-trophy"></i><p>No leaders yet. Be the first!</p></div>';
    }
    
    return leaderboardData.map((entry, index) => `
        <div class="leaderboard-item">
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
// ASSESSMENT TAB (formerly Learn)
// ============================================
async function renderAssessment() {
    const container = document.getElementById('assessment-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading assessment...</div>';
    
    try {
        const scoreData = await getStudentScore(currentUser.id);
        
        container.innerHTML = `
            <div class="section-header">
                <div>
                    <h2><i class="fas fa-question-circle"></i> Assessment</h2>
                    <p>Test your knowledge and earn XP points</p>
                </div>
            </div>
            
            <div class="assessment-stats">
                <div class="assessment-stat-card">
                    <div class="assessment-stat-value">${Math.round(scoreData?.current_score || 0)}%</div>
                    <div class="assessment-stat-label">Overall Score</div>
                </div>
                <div class="assessment-stat-card">
                    <div class="assessment-stat-value">${scoreData?.questions_answered || 0}</div>
                    <div class="assessment-stat-label">Questions Answered</div>
                </div>
                <div class="assessment-stat-card">
                    <div class="assessment-stat-value">${scoreData?.correct_answers || 0}</div>
                    <div class="assessment-stat-label">Correct Answers</div>
                </div>
            </div>
            
            <div class="questions-container" id="questionsContainer">
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>Assessment Questions</h3>
                    <p>Answer questions to improve your score and unlock achievements</p>
                    <button class="btn-primary" id="startAssessmentBtn">Start Assessment</button>
                </div>
            </div>
        `;
        
        document.getElementById('startAssessmentBtn')?.addEventListener('click', () => {
            loadNextQuestion();
        });
        
    } catch (error) {
        console.error('Error loading assessment:', error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Unable to load assessment</h3></div>`;
    }
}

async function loadNextQuestion() {
    const container = document.getElementById('questionsContainer');
    if (!container) return;
    
    try {
        // For now, show a sample question
        container.innerHTML = `
            <div class="question-card">
                <div class="question-header">
                    <span class="question-number">Question 1 of 10</span>
                    <span class="question-points">+50 XP</span>
                </div>
                <div class="question-text">What is the primary purpose of color grading in video production?</div>
                <div class="question-options">
                    <label class="question-option">
                        <input type="radio" name="question" value="a"> To make the video brighter
                    </label>
                    <label class="question-option">
                        <input type="radio" name="question" value="b"> To establish mood and visual consistency
                    </label>
                    <label class="question-option">
                        <input type="radio" name="question" value="c"> To reduce file size
                    </label>
                    <label class="question-option">
                        <input type="radio" name="question" value="d"> To add special effects
                    </label>
                </div>
                <div class="question-actions">
                    <button class="btn-primary" id="submitAnswerBtn">Submit Answer</button>
                    <button class="btn-outline" id="skipQuestionBtn">Skip</button>
                </div>
            </div>
        `;
        
        document.getElementById('submitAnswerBtn')?.addEventListener('click', () => {
            showToast('+50 XP earned! Great answer!', 'success');
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>Great Job!</h3>
                    <p>You've earned 50 XP points</p>
                    <button class="btn-primary" onclick="location.reload()">Continue</button>
                </div>
            `;
        });
        
        document.getElementById('skipQuestionBtn')?.addEventListener('click', () => {
            loadNextQuestion();
        });
        
    } catch (error) {
        console.error('Error loading question:', error);
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
            <div class="go-to-card" onclick="window.location.href='/library'">
                <div class="go-to-icon"><i class="fas fa-book"></i></div>
                <div class="go-to-info"><h3>Library</h3><p>Access books, bundles, and learning materials</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/virtualroom'">
                <div class="go-to-icon"><i class="fas fa-video"></i></div>
                <div class="go-to-info"><h3>Virtual Classroom</h3><p>Live classes and interactive sessions</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/hub'">
                <div class="go-to-icon"><i class="fas fa-newspaper"></i></div>
                <div class="go-to-info"><h3>Hub</h3><p>Events, insights, and latest updates</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/chat'">
                <div class="go-to-icon"><i class="fas fa-comments"></i></div>
                <div class="go-to-info"><h3>Community</h3><p>Connect with fellow learners and instructors</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/course'">
                <div class="go-to-icon"><i class="fas fa-graduation-cap"></i></div>
                <div class="go-to-info"><h3>Courses</h3><p>View your progress and certificates</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/portfolios'">
                <div class="go-to-icon"><i class="fas fa-users"></i></div>
                <div class="go-to-info"><h3>Portfolios</h3><p>Browse student portfolios and showcase your work</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/store'">
                <div class="go-to-icon"><i class="fas fa-shopping-bag"></i></div>
                <div class="go-to-info"><h3>Store</h3><p>Get uniforms, gadgets, and merchandise</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
        </div>
    `;
}

// ============================================
// WALLET TAB - With Funding and Transactions
// ============================================
async function renderWallet() {
    const container = document.getElementById('wallet-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading wallet...</div>';
    
    try {
        await loadPaymentsAndTransactions();
        const balance = currentWalletBalance;
        
        // Separate payment requests by status
        const pendingPayments = allPayments.filter(p => p.status === 'pending');
        const approvedPayments = allPayments.filter(p => p.status === 'approved');
        const rejectedPayments = allPayments.filter(p => p.status === 'rejected');
        
        container.innerHTML = `
            <div class="section-header">
                <div>
                    <h2>My Wallet</h2>
                    <p>Manage your funds, view transactions, and fund your wallet</p>
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
            
            <div class="funding-section">
                <h3>Fund Wallet</h3>
                <div class="funding-options">
                    <div class="amount-buttons">
                        <button class="amount-btn" data-amount="1000">₦1,000</button>
                        <button class="amount-btn" data-amount="2000">₦2,000</button>
                        <button class="amount-btn" data-amount="5000">₦5,000</button>
                        <button class="amount-btn" data-amount="10000">₦10,000</button>
                        <button class="amount-btn" data-amount="20000">₦20,000</button>
                        <button class="amount-btn" data-amount="50000">₦50,000</button>
                    </div>
                    <div class="custom-amount">
                        <input type="number" id="customAmount" placeholder="Or enter custom amount (₦)">
                    </div>
                    <div class="selected-amount-display" id="selectedAmountDisplay" style="display: none;">
                        <p>You are about to add:</p>
                        <div class="selected-amount-large" id="selectedAmountValue">₦0</div>
                    </div>
                    <button id="proceedToPaymentBtn" class="btn-success">Proceed to Payment</button>
                </div>
            </div>
            
            <div class="payments-section">
                <h3>Payment Requests</h3>
                <div class="payments-filter">
                    <button class="filter-btn active" data-filter="all">All</button>
                    <button class="filter-btn" data-filter="pending">Pending</button>
                    <button class="filter-btn" data-filter="approved">Approved</button>
                    <button class="filter-btn" data-filter="rejected">Rejected</button>
                </div>
                <div class="payments-list" id="paymentsList">
                    ${renderPaymentsList(allPayments)}
                </div>
            </div>
            
            <div class="transactions-section">
                <h3>Transaction History</h3>
                <div class="transactions-list">
                    ${allTransactions.length === 0 ? '<p class="empty-transactions">No transactions yet</p>' : 
                        allTransactions.map(t => `
                            <div class="transaction-item-full">
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
        `;
        
        // Setup funding modal
        setupFundingButtons();
        
        // Setup payment filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const filter = btn.getAttribute('data-filter');
                const filteredPayments = filterPayments(filter);
                const paymentsList = document.getElementById('paymentsList');
                if (paymentsList) {
                    paymentsList.innerHTML = renderPaymentsList(filteredPayments);
                }
            });
        });
        
        document.getElementById('addFundsBtn')?.addEventListener('click', () => {
            document.querySelector('.funding-section').scrollIntoView({ behavior: 'smooth' });
        });
        
    } catch (error) {
        console.error('Error rendering wallet:', error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error Loading Wallet</h3><button class="btn-primary" onclick="renderWallet()">Try Again</button></div>`;
    }
}

function filterPayments(filter) {
    if (filter === 'all') return allPayments;
    return allPayments.filter(p => p.status === filter);
}

function renderPaymentsList(payments) {
    if (payments.length === 0) {
        return '<div class="empty-payments">No payment requests found</div>';
    }
    
    return payments.map(p => `
        <div class="payment-item ${p.status}">
            <div class="payment-info">
                <div class="payment-amount">₦${p.amount.toLocaleString()}</div>
                <div class="payment-date">${new Date(p.submitted_at).toLocaleDateString()}</div>
                <div class="payment-ref">Ref: ${p.reference_code}</div>
            </div>
            <div class="payment-status-badge ${p.status}">${p.status}</div>
        </div>
    `).join('');
}

function setupFundingButtons() {
    let selectedAmount = 0;
    
    document.querySelectorAll('.amount-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedAmount = parseInt(btn.getAttribute('data-amount'));
            document.getElementById('selectedAmountValue').textContent = `₦${selectedAmount.toLocaleString()}`;
            document.getElementById('selectedAmountDisplay').style.display = 'block';
            document.getElementById('customAmount').value = '';
        });
    });
    
    document.getElementById('customAmount')?.addEventListener('input', (e) => {
        document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
        selectedAmount = parseInt(e.target.value) || 0;
        document.getElementById('selectedAmountValue').textContent = `₦${selectedAmount.toLocaleString()}`;
        document.getElementById('selectedAmountDisplay').style.display = selectedAmount > 0 ? 'block' : 'none';
    });
    
    document.getElementById('proceedToPaymentBtn')?.addEventListener('click', async () => {
        if (selectedAmount <= 0) {
            showToast('Please select an amount', 'error');
            return;
        }
        
        // Generate reference code
        const referenceCode = `GLI-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        
        // Create payment request
        const { data, error } = await supabase
            .from('payment_requests')
            .insert([{
                user_id: currentUser.id,
                amount: selectedAmount,
                reference_code: referenceCode,
                status: 'pending',
                submitted_at: new Date().toISOString()
            }])
            .select();
        
        if (error) {
            showToast('Failed to create payment request', 'error');
            console.error('Payment error:', error);
            return;
        }
        
        // Show payment instructions
        showPaymentInstructions(selectedAmount, referenceCode);
    });
}

function showPaymentInstructions(amount, referenceCode) {
    const modalHtml = `
        <div class="modal" id="paymentInstructionsModal" style="display: flex;">
            <div class="modal-content wallet-modal">
                <div class="modal-header">
                    <h2>Payment Instructions</h2>
                    <button class="modal-close" id="closePaymentModal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="bank-info-card">
                        <div class="bank-option">
                            <div class="bank-name">Bank Name</div>
                            <div class="bank-account">Moniepoint MFB</div>
                        </div>
                        <div class="bank-option">
                            <div class="bank-name">Account Name</div>
                            <div class="bank-account">Gliimu Institute</div>
                        </div>
                        <div class="bank-option">
                            <div class="bank-name">Account Number</div>
                            <div class="bank-account">7012345678</div>
                        </div>
                    </div>
                    
                    <div class="reference-code-box">
                        <p>Your unique payment reference:</p>
                        <div class="reference-code">${referenceCode}</div>
                        <button class="btn-outline" id="copyReferenceBtn">Copy Reference</button>
                    </div>
                    
                    <div class="payment-instructions">
                        <p><strong>Instructions:</strong></p>
                        <ol>
                            <li>Transfer ₦${amount.toLocaleString()} to the bank details above</li>
                            <li>Use the reference code <strong>${referenceCode}</strong> as narration</li>
                            <li>Your wallet will be credited after admin verification</li>
                            <li>This usually takes 5-15 minutes during business hours</li>
                        </ol>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" id="understoodBtn">I Understand</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    document.getElementById('closePaymentModal')?.addEventListener('click', () => {
        document.getElementById('paymentInstructionsModal')?.remove();
    });
    
    document.getElementById('understoodBtn')?.addEventListener('click', () => {
        document.getElementById('paymentInstructionsModal')?.remove();
        showToast('Payment request submitted! Awaiting admin approval.', 'success');
        setTimeout(() => renderWallet(), 2000);
    });
    
    document.getElementById('copyReferenceBtn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(referenceCode);
        showToast('Reference code copied!', 'success');
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
                <h2>Profile Settings</h2>
                <p>Manage your account preferences</p>
            </div>
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
                <h3>Notification Preferences</h3>
                <form id="notificationPrefsForm">
                    <div class="form-group">
                        <label>Email Address</label>
                        <input type="email" id="notificationEmail" value="${currentUser?.notification_email || ''}" placeholder="your@email.com">
                    </div>
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="tel" id="notificationPhone" value="${currentUser?.notification_phone || ''}" placeholder="08012345678">
                    </div>
                    <div class="checkbox-group">
                        <label><input type="checkbox" id="notifyPayment" ${currentUser?.notify_payment ? 'checked' : ''}> Payment confirmations</label>
                        <label><input type="checkbox" id="notifyCertificate" ${currentUser?.notify_certificate ? 'checked' : ''}> Certificate awards</label>
                        <label><input type="checkbox" id="notifyPromo" ${currentUser?.notify_promo ? 'checked' : ''}> Promotions & updates</label>
                        <label><input type="checkbox" id="notifyWithdrawal" ${currentUser?.notify_withdrawal ? 'checked' : ''}> Withdrawal status</label>
                    </div>
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
            <button id="logOutBtn" class="btn-danger">Log Out</button>
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
    
    // Portfolio
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
        const notificationEmail = document.getElementById('notificationEmail').value;
        const notificationPhone = document.getElementById('notificationPhone').value;
        const notifyPayment = document.getElementById('notifyPayment').checked;
        const notifyCertificate = document.getElementById('notifyCertificate').checked;
        const notifyPromo = document.getElementById('notifyPromo').checked;
        const notifyWithdrawal = document.getElementById('notifyWithdrawal').checked;
        
        const updates = {
            name: newName,
            address: newAddress,
            notification_email: notificationEmail,
            notification_phone: notificationPhone,
            notify_payment: notifyPayment,
            notify_certificate: notifyCertificate,
            notify_promo: notifyPromo,
            notify_withdrawal: notifyWithdrawal
        };
        
        const { error } = await supabase.from('users').update(updates).eq('id', currentUser.id);
        
        if (error) {
            showToast('Failed to update settings', 'error');
        } else {
            Object.assign(currentUser, updates);
            localStorage.setItem('glimu_user', JSON.stringify(currentUser));
            document.getElementById('userName').textContent = newName;
            showToast('Settings saved successfully!', 'success');
        }
    });
    
    // Password change
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
    
    // Log Out
    document.getElementById('logOutBtn')?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to log out?')) {
            await supabase.auth.signOut();
            localStorage.clear();
            window.location.href = '/signin';
        }
    });
}

// ============================================
// LOAD TAB DATA
// ============================================
async function loadTabData(tabId) {
    switch(tabId) {
        case 'overview':
            await renderOverview();
            break;
        case 'assessment':
            await renderAssessment();
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
        default:
            await renderOverview();
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
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
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            document.querySelectorAll('.mobile-nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
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
    await renderOverview();
    
    initMobileNavigation();
    
    console.log('Dashboard initialized successfully');
}

// Start the dashboard
initDashboard();

// Make functions global
window.switchTab = switchTab;
