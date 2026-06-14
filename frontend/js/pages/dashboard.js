// ============================================
// GLIIMU DASHBOARD - COMPLETE WITH WALLET FUNDING
// Features: Overview, Questions, Go To, Wallet (with funding), Settings
// ============================================

import { supabase, getCurrentUser, createPaymentRequest, getUserPayments, getTransactionHistory } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';
import { 
    getWalletBalance, 
    getTransactionHistory as getWalletTransactions,
    subscribeToWalletUpdates
} from '../modules/wallet.js';

import {
    getStudentScore,
    getCurrentBadge,
    getNextBadge,
    getProgressToNextBadge,
    getNextQuestion,
    getLeaderboard,
    getStudentPortfolio
} from '../modules/progression.js';

import { QuestionRenderer, renderProgressBar } from '../modules/questions.js';

// ============================================
// GLOBAL STATE
// ============================================
let currentUser = null;
let currentUserProfile = null;
let currentRole = 'student';
let currentTab = 'overview';
let currentWalletBalance = 0;
let walletSubscription = null;
let questionRenderer = null;
let paymentsSubscription = null;

// Bank details for funding
const BANK_ACCOUNTS = [
    {
        bank: "Moniepoint",
        accountName: "Gliimu Institute",
        accountNumber: "8022093704",
        description: "Send to Moniepoint for instant crediting"
    },
    {
        bank: "Opay",
        accountName: "Gliimu Institute",
        accountNumber: "8116156938",
        description: "Send to Opay for instant crediting"
    }
];

// ============================================
// ROLE-BASED TAB CONFIGURATION
// ============================================
const roleTabs = {
    student: [
        { id: 'overview', name: 'Overview', icon: 'fas fa-tachometer-alt' },
        { id: 'question', name: 'Questions', icon: 'fas fa-question-circle' },
        { id: 'gotomenu', name: 'Go To', icon: 'fas fa-door-open' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    instructor: [
        { id: 'overview', name: 'Overview', icon: 'fas fa-tachometer-alt' },
        { id: 'question-pull', name: 'Question Pull', icon: 'fas fa-database' },
        { id: 'gotomenu', name: 'Go To', icon: 'fas fa-door-open' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    partner: [
        { id: 'overview', name: 'Overview', icon: 'fas fa-tachometer-alt' },
        { id: 'submit-project', name: 'Submit Project', icon: 'fas fa-file-alt' },
        { id: 'gotomenu', name: 'Go To', icon: 'fas fa-door-open' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    admin: [
        { id: 'overview', name: 'Overview', icon: 'fas fa-tachometer-alt' },
        { id: 'users', name: 'Users', icon: 'fas fa-users-cog' },
        { id: 'finance', name: 'Finance', icon: 'fas fa-chart-line' },
        { id: 'store', name: 'Store', icon: 'fas fa-store' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ]
};

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    console.log('Checking authentication...');
    
    const localUser = localStorage.getItem('glimu_user');
    if (localUser) {
        currentUser = JSON.parse(localUser);
        currentRole = currentUser.role || 'student';
        currentWalletBalance = currentUser.walletBalance || 0;
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
        
        if (profileError) {
            console.error('Profile error:', profileError);
            throw profileError;
        }
        
        currentUserProfile = profile;
        currentWalletBalance = profile.wallet_balance || 0;
        currentRole = profile.role || 'student';
        
        currentUser = {
            id: userId,
            name: profile.name || profile.full_name || 'User',
            email: profile.email,
            role: currentRole,
            walletBalance: profile.wallet_balance || 0,
            address: profile.address || '',
            phone: profile.phone || '',
            avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=fbb040&color=fff`
        };
        
        localStorage.setItem('glimu_user', JSON.stringify(currentUser));
        console.log('User loaded from Supabase:', currentUser);
        
    } catch (error) {
        console.error('Error loading user from Supabase:', error);
    }
}

// ============================================
// THEME HANDLING
// ============================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
    } else {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    }
}

// ============================================
// UPDATE UI
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
// LOAD TAB DATA
// ============================================
async function loadTabData(tabId) {
    switch(tabId) {
        case 'overview':
            await renderOverview();
            break;
        case 'question':
            await renderQuestionBar();
            break;
        case 'question-pull':
            await renderQuestionPull();
            break;
        case 'submit-project':
            await renderSubmitProject();
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
// OVERVIEW TAB
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
        const walletBalance = currentUser?.walletBalance || 0;
        
        container.innerHTML = `
            <div class="section-header">
                <h2>Welcome back, ${currentUser.name || 'Student'}!</h2>
                <p>Track your progress and stay updated</p>
            </div>
            
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
        
        document.getElementById('quickAddFundsBtn')?.addEventListener('click', () => switchTab('wallet'));
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
                    <button class="btn-primary" onclick="switchTab('overview')">Return to Overview</button>
                </div>
            `;
            return;
        }
        
        questionRenderer = new QuestionRenderer(
            'question-section',
            currentUser.id,
            async () => {
                await renderOverview();
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
// QUESTION PULL TAB (Instructor)
// ============================================
async function renderQuestionPull() {
    const container = document.getElementById('question-pull-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <h2><i class="fas fa-database"></i> Question Pull</h2>
            <p>Create and manage questions for students</p>
        </div>
        <div class="question-pull-actions">
            <button class="btn-primary" id="createQuestionBtn"><i class="fas fa-plus"></i> Create New Question</button>
        </div>
        <div class="questions-list" id="instructorQuestionsList">
            <div class="empty-state"><i class="fas fa-question-circle"></i><p>No questions yet. Create your first question!</p></div>
        </div>
    `;
    
    document.getElementById('createQuestionBtn')?.addEventListener('click', () => {
        showToast('Question creation coming soon!', 'info');
    });
}

// ============================================
// SUBMIT PROJECT TAB (Partner)
// ============================================
async function renderSubmitProject() {
    const container = document.getElementById('submit-project-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <h2><i class="fas fa-file-alt"></i> Submit Project</h2>
            <p>Submit your project proposals for review</p>
        </div>
        <div class="project-submission-form">
            <form id="projectSubmissionForm">
                <div class="form-group">
                    <label>Project Title</label>
                    <input type="text" id="projectTitle" required placeholder="e.g., Brand Identity Design">
                </div>
                <div class="form-group">
                    <label>Project Category</label>
                    <select id="projectCategory" required>
                        <option value="">Select category</option>
                        <option value="Video Production">Video Production</option>
                        <option value="Design">Design</option>
                        <option value="Web Development">Web Development</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Project Description</label>
                    <textarea id="projectDescription" rows="5" required placeholder="Describe your project in detail..."></textarea>
                </div>
                <div class="form-group">
                    <label>Budget Range</label>
                    <input type="text" id="projectBudget" placeholder="e.g., ₦50,000 - ₦100,000">
                </div>
                <button type="submit" class="btn-primary">Submit Project</button>
            </form>
        </div>
    `;
    
    document.getElementById('projectSubmissionForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showToast('Project submitted! We will review and contact you.', 'success');
        e.target.reset();
    });
}

// ============================================
// GO TO MENU TAB
// ============================================
function renderGoToMenu() {
    const container = document.getElementById('gotomenu-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <h2><i class="fas fa-door-open"></i> Go To</h2>
            <p>Quick access to all platform sections</p>
        </div>
        
        <div class="go-to-grid">
            <div class="go-to-card" onclick="window.location.href='/course'">
                <div class="go-to-icon"><i class="fas fa-graduation-cap"></i></div>
                <div class="go-to-info">
                    <h3>Courses</h3>
                    <p>View your course progress and earn certificates</p>
                </div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/portfolios'">
                <div class="go-to-icon"><i class="fas fa-briefcase"></i></div>
                <div class="go-to-info">
                    <h3>Portfolios</h3>
                    <p>Search and view student portfolios</p>
                </div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/store'">
                <div class="go-to-icon"><i class="fas fa-store"></i></div>
                <div class="go-to-info">
                    <h3>Store</h3>
                    <p>Get uniforms, gadgets, and merchandise</p>
                </div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/library'">
                <div class="go-to-icon"><i class="fas fa-book"></i></div>
                <div class="go-to-info"><h3>Library</h3><p>Access books, bundles, and learning materials</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/virtualroom'">
                <div class="go-to-icon"><i class="fas fa-video"></i></div>
                <div class="go-to-info"><h3>Virtual Classroom</h3><p>Join live classes and interactive sessions</p></div>
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
        </div>
    `;
}

// ============================================
// WALLET TAB WITH FUNDING FUNCTIONALITY
// ============================================
async function renderWallet() {
    const container = document.getElementById('wallet-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading wallet...</div>';
    
    try {
        const balance = currentWalletBalance;
        const transactions = await getTransactionHistory();
        const payments = await getUserPayments();
        
        container.innerHTML = `
            <div class="section-header">
                <h2><i class="fas fa-wallet"></i> My Wallet</h2>
                <p>Manage your funds and transactions</p>
            </div>
            
            <div class="wallet-balance-card">
                <div class="wallet-balance-icon"><i class="fas fa-wallet"></i></div>
                <div class="wallet-balance-info">
                    <span class="wallet-label">Available Balance</span>
                    <span class="wallet-balance-large" id="walletBalanceDisplay">₦${balance.toLocaleString()}</span>
                </div>
                <button id="addFundsBtn" class="btn-primary">Add Funds</button>
                <button id="withdrawFundsBtn" class="btn-outline">Withdraw</button>
            </div>
            
            <div class="payment-requests-section">
                <h3>Your Payment Requests</h3>
                <div class="payments-list" id="paymentsList">
                    ${payments.length === 0 ? '<p class="empty-payments">No payment requests yet</p>' : 
                        payments.map(p => `
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
            
            <div class="transactions-section">
                <h3>Transaction History</h3>
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
        `;
        
        document.getElementById('addFundsBtn')?.addEventListener('click', openFundWalletModal);
        document.getElementById('withdrawFundsBtn')?.addEventListener('click', openWithdrawModal);
        
    } catch (error) {
        console.error('Error rendering wallet:', error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error Loading Wallet</h3><button class="btn-primary" onclick="renderWallet()">Try Again</button></div>`;
    }
}

// ============================================
// FUND WALLET MODAL
// ============================================
let selectedAmount = null;
let currentStep = 'amount';
let paymentData = null;

function openFundWalletModal() {
    currentStep = 'amount';
    selectedAmount = null;
    paymentData = null;
    showAmountSelection();
}

function showAmountSelection() {
    const modalContent = `
        <div class="modal-content wallet-modal">
            <div class="modal-header">
                <h2>Fund Your Wallet</h2>
                <button class="modal-close" id="closeFundModal">&times;</button>
            </div>
            <div class="modal-body">
                <div class="funding-options">
                    <h3>Select Amount</h3>
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
                </div>
            </div>
            <div class="modal-footer">
                <button id="continueToBankBtn" class="btn-primary" disabled>Continue</button>
                <button id="cancelFundBtn" class="btn-outline">Cancel</button>
            </div>
        </div>
    `;
    
    showModal(modalContent, () => {
        const amountBtns = document.querySelectorAll('.amount-btn');
        const customInput = document.getElementById('customAmount');
        const continueBtn = document.getElementById('continueToBankBtn');
        
        function updateSelectedAmount() {
            const customValue = customInput?.value;
            if (customValue && parseInt(customValue) > 0) {
                selectedAmount = parseInt(customValue);
                amountBtns.forEach(btn => btn.classList.remove('active'));
            }
            continueBtn.disabled = !selectedAmount || selectedAmount <= 0;
        }
        
        amountBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                amountBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedAmount = parseInt(btn.dataset.amount);
                if (customInput) customInput.value = '';
                continueBtn.disabled = false;
            });
        });
        
        if (customInput) {
            customInput.addEventListener('input', () => {
                amountBtns.forEach(btn => btn.classList.remove('active'));
                selectedAmount = parseInt(customInput.value) || null;
                continueBtn.disabled = !selectedAmount || selectedAmount <= 0;
            });
        }
        
        continueBtn?.addEventListener('click', () => {
            if (selectedAmount && selectedAmount > 0) {
                showBankDetails();
            }
        });
    });
}

function showBankDetails() {
    const modalContent = `
        <div class="modal-content wallet-modal">
            <div class="modal-header">
                <h2>Complete Your Payment</h2>
                <button class="modal-close" id="closeFundModal">&times;</button>
            </div>
            <div class="modal-body">
                <div class="selected-amount-display">
                    <p>You are about to fund</p>
                    <div class="selected-amount-large">₦${selectedAmount.toLocaleString()}</div>
                </div>
                
                <div class="bank-details">
                    <h3>Send to any of these accounts:</h3>
                    ${BANK_ACCOUNTS.map(bank => `
                        <div class="bank-info-card">
                            <div class="bank-name">${bank.bank}</div>
                            <div class="bank-account">${bank.accountNumber}</div>
                            <div class="bank-account-name">${bank.accountName}</div>
                            <div class="bank-note">${bank.description}</div>
                        </div>
                    `).join('')}
                </div>
                
                <div class="payment-instructions">
                    <p><strong>After payment:</strong></p>
                    <ol>
                        <li>Enter your payment reference below</li>
                        <li>Click "I Have Paid" to submit for approval</li>
                        <li>Admin will verify and credit your wallet</li>
                    </ol>
                </div>
                
                <div class="form-group">
                    <label>Payment Reference / Transaction ID</label>
                    <input type="text" id="paymentReference" placeholder="Enter the reference number from your bank transfer" required>
                </div>
            </div>
            <div class="modal-footer">
                <button id="submitPaymentBtn" class="btn-primary">I Have Paid</button>
                <button id="backToAmountBtn" class="btn-outline">Back</button>
                <button id="cancelFundBtn" class="btn-outline">Cancel</button>
            </div>
        </div>
    `;
    
    showModal(modalContent, () => {
        const submitBtn = document.getElementById('submitPaymentBtn');
        const backBtn = document.getElementById('backToAmountBtn');
        
        submitBtn?.addEventListener('click', async () => {
            const referenceCode = document.getElementById('paymentReference')?.value.trim();
            
            if (!referenceCode) {
                showToast('Please enter your payment reference', 'error');
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';
            
            const result = await createPaymentRequest(selectedAmount, 'bank_transfer', referenceCode);
            
            if (result.success) {
                showToast('Payment request submitted! Awaiting admin approval.', 'success');
                closeModal();
                await renderWallet();
            } else {
                showToast(result.error || 'Failed to submit payment request', 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'I Have Paid';
            }
        });
        
        backBtn?.addEventListener('click', showAmountSelection);
    });
}

function openWithdrawModal() {
    const modalContent = `
        <div class="modal-content wallet-modal">
            <div class="modal-header">
                <h2>Withdraw Funds</h2>
                <button class="modal-close" id="closeWithdrawModal">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Amount to Withdraw</label>
                    <input type="number" id="withdrawAmount" placeholder="Enter amount" min="1000">
                    <small>Minimum withdrawal: ₦1,000</small>
                </div>
                <div class="form-group">
                    <label>Bank Name</label>
                    <select id="withdrawBank">
                        <option value="">Select bank</option>
                        <option value="Moniepoint">Moniepoint</option>
                        <option value="Opay">Opay</option>
                        <option value="GTBank">GTBank</option>
                        <option value="UBA">UBA</option>
                        <option value="First Bank">First Bank</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Account Number</label>
                    <input type="text" id="withdrawAccount" placeholder="Enter account number">
                </div>
                <div class="form-group">
                    <label>Account Name</label>
                    <input type="text" id="withdrawAccountName" placeholder="Enter account name">
                </div>
            </div>
            <div class="modal-footer">
                <button id="submitWithdrawBtn" class="btn-primary">Request Withdrawal</button>
                <button id="cancelWithdrawBtn" class="btn-outline">Cancel</button>
            </div>
        </div>
    `;
    
    showModal(modalContent, () => {
        document.getElementById('submitWithdrawBtn')?.addEventListener('click', async () => {
            const amount = parseInt(document.getElementById('withdrawAmount')?.value);
            const bank = document.getElementById('withdrawBank')?.value;
            const accountNumber = document.getElementById('withdrawAccount')?.value;
            const accountName = document.getElementById('withdrawAccountName')?.value;
            
            if (!amount || amount < 1000) {
                showToast('Please enter a valid amount (minimum ₦1,000)', 'error');
                return;
            }
            
            if (amount > currentWalletBalance) {
                showToast('Insufficient wallet balance', 'error');
                return;
            }
            
            if (!bank || !accountNumber || !accountName) {
                showToast('Please fill in all bank details', 'error');
                return;
            }
            
            showToast('Withdrawal request submitted for admin approval', 'success');
            closeModal();
        });
    });
}

// ============================================
// MODAL HELPERS
// ============================================
let currentModal = null;

function showModal(content, setupCallback) {
    closeModal();
    
    currentModal = document.createElement('div');
    currentModal.className = 'modal active';
    currentModal.innerHTML = content;
    document.body.appendChild(currentModal);
    document.body.style.overflow = 'hidden';
    
    const closeBtn = currentModal.querySelector('#closeFundModal, #closeWithdrawModal');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    const cancelBtns = currentModal.querySelectorAll('#cancelFundBtn, #cancelWithdrawBtn');
    cancelBtns.forEach(btn => {
        btn.addEventListener('click', closeModal);
    });
    
    currentModal.addEventListener('click', (e) => {
        if (e.target === currentModal) closeModal();
    });
    
    if (setupCallback) setupCallback();
}

function closeModal() {
    if (currentModal) {
        currentModal.remove();
        currentModal = null;
    }
    document.body.style.overflow = '';
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
            <h2><i class="fas fa-cog"></i> Settings</h2>
            <p>Manage your account preferences</p>
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
                    <div class="form-group"><label>Phone Number</label><input type="tel" id="phoneInput" value="${currentUser?.phone || ''}" placeholder="Enter your phone number"></div>
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
        const newPhone = document.getElementById('phoneInput').value;
        
        const updates = {};
        if (newName !== currentUser.name) updates.name = newName;
        if (newAddress !== (currentUser.address || '')) updates.address = newAddress;
        if (newPhone !== (currentUser.phone || '')) updates.phone = newPhone;
        
        if (Object.keys(updates).length > 0) {
            const { error } = await supabase.from('users').update(updates).eq('id', currentUser.id);
            if (error) {
                showToast('Failed to update settings', 'error');
            } else {
                Object.assign(currentUser, updates);
                localStorage.setItem('glimu_user', JSON.stringify(currentUser));
                document.getElementById('userName').textContent = newName;
                showToast('Settings saved successfully!', 'success');
            }
        } else {
            showToast('No changes to save', 'info');
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
// REAL-TIME WALLET & PAYMENT UPDATES
// ============================================
function setupRealtimeUpdates() {
    if (!currentUser?.id) return;
    
    // Subscribe to wallet changes
    if (walletSubscription) walletSubscription.unsubscribe();
    
    walletSubscription = supabase
        .channel(`wallet_${currentUser.id}`)
        .on('postgres_changes', 
            { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${currentUser.id}` },
            (payload) => {
                const newBalance = payload.new.wallet_balance;
                if (newBalance !== currentWalletBalance) {
                    currentWalletBalance = newBalance;
                    currentUser.walletBalance = newBalance;
                    localStorage.setItem('glimu_user', JSON.stringify(currentUser));
                    
                    // Update UI
                    const balanceDisplay = document.getElementById('walletBalanceDisplay');
                    if (balanceDisplay) balanceDisplay.textContent = `₦${newBalance.toLocaleString()}`;
                    
                    const quickBalance = document.querySelector('.quick-balance');
                    if (quickBalance) quickBalance.textContent = `₦${newBalance.toLocaleString()}`;
                    
                    showToast(`Wallet updated: ₦${newBalance.toLocaleString()}`, 'success');
                    
                    if (currentTab === 'wallet') renderWallet();
                }
            }
        )
        .subscribe();
    
    // Subscribe to payment status changes
    if (paymentsSubscription) paymentsSubscription.unsubscribe();
    
    paymentsSubscription = supabase
        .channel(`payments_${currentUser.id}`)
        .on('postgres_changes', 
            { event: 'UPDATE', schema: 'public', table: 'payments', filter: `user_id=eq.${currentUser.id}` },
            (payload) => {
                const payment = payload.new;
                if (payment.status === 'approved') {
                    showToast(`Payment of ₦${payment.amount.toLocaleString()} has been approved!`, 'success');
                    if (currentTab === 'wallet') renderWallet();
                } else if (payment.status === 'rejected') {
                    showToast(`Payment of ₦${payment.amount.toLocaleString()} was rejected. Please contact support.`, 'error');
                    if (currentTab === 'wallet') renderWallet();
                }
            }
        )
        .subscribe();
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// MOBILE NAVIGATION
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
    await renderOverview();
    
    setupRealtimeUpdates();
    initMobileNavigation();
    
    console.log('Dashboard initialized successfully');
}

// Start the dashboard
initDashboard();

// Make functions global
window.switchTab = switchTab;
window.renderQuestionBar = renderQuestionBar;
