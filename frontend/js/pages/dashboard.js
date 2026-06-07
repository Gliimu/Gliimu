// ============================================
// GLIIMU DASHBOARD - COMPLETE STUDENT VERSION
// With Question Bar, Assignments, Portfolio, Debates, MVP
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
    getPendingSubmissions,
    getStudentPortfolio,
    getLeaderboard,
    sharePortfolio,
    submitMVPProposal,
    submitDebateArgument
} from '../modules/progression.js';

import { QuestionRenderer, renderProgressBar, renderLeaderboard, renderPortfolioItem } from '../modules/questions.js';

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
let walletSubscription = null;
let currentQuestion = null;
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
        
        // Load mock data for demo
        loadMockAssignments();
        loadMockPortfolio();
        loadMockSubmissions();
        loadMockDebates();
        
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
// MOCK DATA FOR DEMO
// ============================================
let assignments = [];
let portfolioItems = [];
let submissions = [];
let debates = [];

function loadMockAssignments() {
    assignments = [
        { id: 1, title: 'Video Production: 30-Second Commercial', dueDate: '2025-06-20', status: 'pending', points: 100, type: 'video' },
        { id: 2, title: 'UI/UX Design: Mobile App Wireframe', dueDate: '2025-06-15', status: 'submitted', points: 100, type: 'design', grade: 85 },
        { id: 3, title: 'JavaScript: Interactive Form Validation', dueDate: '2025-06-10', status: 'graded', points: 100, type: 'code', grade: 92 },
        { id: 4, title: 'Motion Graphics: Logo Animation', dueDate: '2025-06-25', status: 'pending', points: 100, type: 'motion' },
        { id: 5, title: 'Brand Strategy: Brand Identity Package', dueDate: '2025-06-30', status: 'draft', points: 100, type: 'brand' }
    ];
}

function loadMockPortfolio() {
    portfolioItems = [
        { id: 1, title: 'Nike Commercial', type: 'video', thumbnail: '/photos/portfolio1.jpg', date: '2025-05-01', views: 245, likes: 34, is_public: true },
        { id: 2, title: 'Food App UI Design', type: 'design', thumbnail: '/photos/portfolio2.jpg', date: '2025-05-10', views: 189, likes: 27, is_public: true },
        { id: 3, title: 'E-commerce Website', type: 'code', thumbnail: '/photos/portfolio3.jpg', date: '2025-05-15', views: 312, likes: 45, is_public: false },
        { id: 4, title: 'Title Sequence Animation', type: 'motion', thumbnail: '/photos/portfolio4.jpg', date: '2025-05-20', views: 178, likes: 23, is_public: true }
    ];
}

function loadMockSubmissions() {
    submissions = [
        { id: 1, title: 'Video Production Assignment', submittedAt: '2025-06-01', status: 'graded', grade: 88, feedback: 'Great work on the pacing!' },
        { id: 2, title: 'UI Design Project', submittedAt: '2025-05-25', status: 'graded', grade: 92, feedback: 'Excellent use of color theory' },
        { id: 3, title: 'JavaScript Challenge', submittedAt: '2025-05-20', status: 'pending', grade: null, feedback: null }
    ];
}

function loadMockDebates() {
    debates = [
        { id: 1, motion: 'AI will replace most creative jobs by 2030', opponent: 'Jane Smith', status: 'pending', myStance: 'YES' },
        { id: 2, motion: 'Traditional education is obsolete', opponent: 'Mike Johnson', status: 'active', myStance: 'NO', submitted: false }
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
            const balanceElement = document.querySelector('.stat-card .stat-value');
            if (balanceElement && balanceElement.closest('.stat-card')?.querySelector('h3')?.textContent === 'Wallet Balance') {
                balanceElement.textContent = `₦${newBalance.toLocaleString()}`;
            }
        }
        
        showToast(`Wallet updated: ₦${newBalance.toLocaleString()}`, 'info');
    });
}

// ============================================
// ROLE-BASED TAB CONFIGURATION - STUDENT FOCUSED
// ============================================
const roleTabs = {
    student: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'question', name: 'Question Bar', icon: 'fas fa-question-circle' },
        { id: 'assignments', name: 'Assignments', icon: 'fas fa-tasks' },
        { id: 'submissions', name: 'Submissions', icon: 'fas fa-upload' },
        { id: 'portfolio', name: 'Portfolio', icon: 'fas fa-briefcase' },
        { id: 'debates', name: 'Debates', icon: 'fas fa-gavel' },
        { id: 'mvp', name: 'MVP Zone', icon: 'fas fa-rocket' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'leaderboard', name: 'Leaderboard', icon: 'fas fa-trophy' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    instructor: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'grade', name: 'Grade Submissions', icon: 'fas fa-clipboard-list' },
        { id: 'debates', name: 'Manage Debates', icon: 'fas fa-gavel' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    admin: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'users', name: 'Users', icon: 'fas fa-users-cog' },
        { id: 'finance', name: 'Finance', icon: 'fas fa-chart-line' },
        { id: 'questions', name: 'Question Pool', icon: 'fas fa-database' },
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
        case 'assignments':
            renderAssignments();
            break;
        case 'submissions':
            renderSubmissions();
            break;
        case 'portfolio':
            renderPortfolio();
            break;
        case 'debates':
            renderDebates();
            break;
        case 'mvp':
            renderMVPZone();
            break;
        case 'wallet':
            renderWallet();
            break;
        case 'leaderboard':
            renderLeaderboardTab();
            break;
        case 'grade':
            renderGradeSubmissions();
            break;
        case 'settings':
            renderSettings();
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
    
    const scoreData = await getStudentScore(currentUser.id);
    const currentBadge = getCurrentBadge(scoreData?.current_score || 0);
    const nextBadge = getNextBadge(scoreData?.current_score || 0);
    const progressToNext = getProgressToNextBadge(scoreData?.current_score || 0);
    const pendingCount = assignments.filter(a => a.status === 'pending').length;
    const portfolioCount = portfolioItems.length;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Dashboard</h2>
                <p>Welcome back, ${currentUser?.name || 'Creator'}!</p>
            </div>
        </div>
        
        <div class="progress-section">
            ${renderProgressBar(scoreData?.current_score || 0, currentBadge, nextBadge, progressToNext)}
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-tasks"></i></div>
                <div class="stat-info">
                    <h3>Pending Assignments</h3>
                    <div class="stat-value">${pendingCount}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-briefcase"></i></div>
                <div class="stat-info">
                    <h3>Portfolio Items</h3>
                    <div class="stat-value">${portfolioCount}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-gavel"></i></div>
                <div class="stat-info">
                    <h3>Active Debates</h3>
                    <div class="stat-value">${debates.filter(d => d.status === 'active').length}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-wallet"></i></div>
                <div class="stat-info">
                    <h3>Wallet Balance</h3>
                    <div class="stat-value">₦${(currentUser?.walletBalance || 14500).toLocaleString()}</div>
                    <button class="add-funds-small" id="quickAddFunds">Add Funds</button>
                </div>
            </div>
        </div>
        
        <div class="quick-links">
            <h3>Quick Access</h3>
            <div class="quick-links-grid">
                <div class="quick-link-card" onclick="document.querySelector('[data-tab=\'question\']').click()">
                    <i class="fas fa-question-circle"></i>
                    <span>Answer Questions</span>
                </div>
                <div class="quick-link-card" onclick="document.querySelector('[data-tab=\'assignments\']').click()">
                    <i class="fas fa-tasks"></i>
                    <span>Assignments</span>
                </div>
                <div class="quick-link-card" onclick="window.location.href='/library.html'">
                    <i class="fas fa-book"></i>
                    <span>Library</span>
                </div>
                <div class="quick-link-card" onclick="window.location.href='/chat.html'">
                    <i class="fas fa-comments"></i>
                    <span>Community</span>
                </div>
            </div>
        </div>
        
        <div class="action-cards">
            <div class="action-card" id="continueLearningBtn">
                <i class="fas fa-play-circle"></i>
                <h4>Continue Learning</h4>
                <p>Answer your next question</p>
            </div>
            <div class="action-card" id="viewPortfolioBtn">
                <i class="fas fa-briefcase"></i>
                <h4>View Portfolio</h4>
                <p>${portfolioCount} projects</p>
            </div>
            <div class="action-card" id="sharePortfolioBtn">
                <i class="fas fa-share-alt"></i>
                <h4>Share Portfolio</h4>
                <p>Showcase your work</p>
            </div>
        </div>
    `;
    
    document.getElementById('continueLearningBtn')?.addEventListener('click', () => switchTab('question'));
    document.getElementById('viewPortfolioBtn')?.addEventListener('click', () => switchTab('portfolio'));
    document.getElementById('sharePortfolioBtn')?.addEventListener('click', () => sharePortfolio(currentUser.id));
    document.getElementById('quickAddFunds')?.addEventListener('click', () => switchTab('wallet'));
}

// ============================================
// QUESTION BAR TAB
// ============================================
async function renderQuestionBar() {
    const container = document.getElementById('question-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner">Loading next question...</div>';
    
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
        
        // Initialize question renderer
        questionRenderer = new QuestionRenderer(
            'question-section',
            currentUser.id,
            async (result) => {
                // Refresh score after answer
                const scoreData = await getStudentScore(currentUser.id);
                const currentBadge = getCurrentBadge(scoreData?.current_score || 0);
                const nextBadge = getNextBadge(scoreData?.current_score || 0);
                const progressToNext = getProgressToNextBadge(scoreData?.current_score || 0);
                
                // Update progress bar in dashboard
                const progressSection = document.querySelector('.progress-section');
                if (progressSection) {
                    progressSection.innerHTML = renderProgressBar(scoreData?.current_score || 0, currentBadge, nextBadge, progressToNext);
                }
                
                // Load next question after 2 seconds
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
// ASSIGNMENTS TAB
// ============================================
async function renderAssignments() {
    const container = document.getElementById('assignments-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Assignments</h2>
                <p>Complete your tasks on time</p>
            </div>
        </div>
        
        <div class="assignments-list">
            ${assignments.map(assignment => `
                <div class="assignment-card ${assignment.status}">
                    <div class="assignment-icon">
                        <i class="fas ${assignment.type === 'video' ? 'fa-video' : assignment.type === 'design' ? 'fa-palette' : assignment.type === 'code' ? 'fa-code' : assignment.type === 'motion' ? 'fa-film' : 'fa-chart-line'}"></i>
                    </div>
                    <div class="assignment-info">
                        <h4>${assignment.title}</h4>
                        <div class="assignment-meta">
                            <span>Due: ${new Date(assignment.dueDate).toLocaleDateString()}</span>
                            <span>Points: ${assignment.points}</span>
                        </div>
                    </div>
                    <div class="assignment-status">
                        <span class="status-badge ${assignment.status}">${assignment.status}</span>
                        ${assignment.grade ? `<span class="grade">Grade: ${assignment.grade}%</span>` : ''}
                    </div>
                    <div class="assignment-actions">
                        ${assignment.status === 'pending' ? 
                            `<button class="btn-small submit-assignment" data-id="${assignment.id}">Submit</button>` : 
                            assignment.status === 'submitted' ? 
                            `<button class="btn-small disabled" disabled>Awaiting Grade</button>` :
                            `<button class="btn-small view-feedback" data-id="${assignment.id}">View Feedback</button>`
                        }
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    document.querySelectorAll('.submit-assignment').forEach(btn => {
        btn.addEventListener('click', () => {
            showToast('Assignment submission feature coming soon!', 'info');
        });
    });
}

// ============================================
// SUBMISSIONS TAB
// ============================================
async function renderSubmissions() {
    const container = document.getElementById('submissions-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>My Submissions</h2>
                <p>Track your submitted work and feedback</p>
            </div>
        </div>
        
        <div class="submissions-list">
            ${submissions.map(sub => `
                <div class="submission-card">
                    <div class="submission-info">
                        <h4>${sub.title}</h4>
                        <div class="submission-meta">
                            <span>Submitted: ${new Date(sub.submittedAt).toLocaleDateString()}</span>
                        </div>
                        ${sub.feedback ? `<div class="submission-feedback">📝 Feedback: ${sub.feedback}</div>` : ''}
                    </div>
                    <div class="submission-status">
                        <span class="status-badge ${sub.status}">${sub.status}</span>
                        ${sub.grade ? `<span class="grade">Grade: ${sub.grade}%</span>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ============================================
// PORTFOLIO TAB
// ============================================
async function renderPortfolio() {
    const container = document.getElementById('portfolio-section');
    if (!container) return;
    
    const portfolioData = await getStudentPortfolio(currentUser.id, false);
    const items = portfolioData.length > 0 ? portfolioData : portfolioItems;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>My Portfolio</h2>
                <p>Showcase your best work</p>
            </div>
            <button class="btn-primary" id="sharePortfolioBtn">
                <i class="fas fa-share-alt"></i> Share Portfolio
            </button>
        </div>
        
        <div class="portfolio-grid">
            ${items.map(item => renderPortfolioItem(item, true)).join('')}
        </div>
        
        <div class="portfolio-url-section">
            <h3>Your Public Portfolio URL</h3>
            <div class="url-display">
                <input type="text" id="portfolioUrl" readonly value="${window.location.origin}/u/${currentUser.name.toLowerCase().replace(/\s+/g, '-')}">
                <button id="copyUrlBtn" class="btn-outline">Copy URL</button>
            </div>
        </div>
    `;
    
    document.getElementById('sharePortfolioBtn')?.addEventListener('click', () => sharePortfolio(currentUser.id));
    document.getElementById('copyUrlBtn')?.addEventListener('click', () => {
        const urlInput = document.getElementById('portfolioUrl');
        urlInput.select();
        document.execCommand('copy');
        showToast('Portfolio URL copied!', 'success');
    });
}

// ============================================
// DEBATES TAB
// ============================================
async function renderDebates() {
    const container = document.getElementById('debates-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Debates</h2>
                <p>Engage in scholarly discussions</p>
            </div>
        </div>
        
        <div class="debates-list">
            ${debates.map(debate => `
                <div class="debate-card status-${debate.status}">
                    <div class="debate-header">
                        <div class="debate-motion">🎯 ${debate.motion}</div>
                        <div class="debate-status">${debate.status.toUpperCase()}</div>
                    </div>
                    <div class="debate-details">
                        <div class="debate-stance">Your Stance: ${debate.myStance}</div>
                        <div class="debate-opponent">Opponent: ${debate.opponent || 'Waiting for pairing...'}</div>
                    </div>
                    <div class="debate-actions">
                        ${debate.status === 'active' && !debate.submitted ? 
                            `<button class="btn-primary submit-argument" data-id="${debate.id}">Submit Argument</button>` : 
                            debate.status === 'active' && debate.submitted ? 
                            `<button class="btn-outline disabled" disabled>Argument Submitted</button>` :
                            debate.status === 'pending' ?
                            `<button class="btn-outline disabled" disabled>Awaiting Opponent</button>` :
                            `<button class="btn-outline view-results" data-id="${debate.id}">View Results</button>`
                        }
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    document.querySelectorAll('.submit-argument').forEach(btn => {
        btn.addEventListener('click', async () => {
            const debateId = btn.getAttribute('data-id');
            const argument = prompt('Enter your argument with supporting research:');
            if (argument) {
                await submitDebateArgument(debateId, currentUser.id, argument, null);
                renderDebates();
            }
        });
    });
}

// ============================================
// MVP ZONE TAB
// ============================================
async function renderMVPZone() {
    const container = document.getElementById('mvp-section');
    if (!container) return;
    
    const scoreData = await getStudentScore(currentUser.id);
    const isAmbassador = (scoreData?.current_score || 0) >= 100;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>MVP Zone</h2>
                <p>Real-world project proposal and incubation</p>
            </div>
        </div>
        
        ${isAmbassador ? `
            <div class="mvp-eligible">
                <div class="mvp-badge">
                    <i class="fas fa-crown"></i>
                    <h3>You've unlocked the Ambassador Zone!</h3>
                    <p>Submit your real-world project proposal to become a Gliimu Ambassador.</p>
                </div>
                
                <div class="mvp-form">
                    <h3>Submit MVP Proposal</h3>
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
        ` : `
            <div class="mvp-locked">
                <div class="mvp-locked-badge">
                    <i class="fas fa-lock"></i>
                    <h3>Ambassador Zone Locked</h3>
                    <p>Reach 100% score to unlock the MVP Zone and submit real-world project proposals.</p>
                    <div class="progress-to-unlock">
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" style="width: ${scoreData?.current_score || 0}%; background: var(--accent)"></div>
                        </div>
                        <span>${Math.round(scoreData?.current_score || 0)}% to Ambassador</span>
                    </div>
                </div>
            </div>
        `}
    `;
    
    if (isAmbassador) {
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
                    mvpForm.reset();
                    showToast('MVP Proposal submitted! The school will review and reach out.', 'success');
                }
            });
        }
    }
}

// ============================================
// LEADERBOARD TAB
// ============================================
async function renderLeaderboardTab() {
    const container = document.getElementById('leaderboard-section');
    if (!container) return;
    
    const leaderboardData = await getLeaderboard(20);
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Leaderboard</h2>
                <p>Top performers in the community</p>
            </div>
        </div>
        
        ${renderLeaderboard(leaderboardData)}
    `;
}

// ============================================
// GRADE SUBMISSIONS TAB (Instructor)
// ============================================
async function renderGradeSubmissions() {
    const container = document.getElementById('grade-section');
    if (!container) return;
    
    const pendingSubmissions = await getPendingSubmissions(currentUser.id);
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Grade Submissions</h2>
                <p>Review and grade student work</p>
            </div>
        </div>
        
        <div class="submissions-list">
            ${pendingSubmissions.length === 0 ? `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>No pending submissions</h3>
                    <p>All caught up!</p>
                </div>
            ` : pendingSubmissions.map(sub => `
                <div class="submission-card pending">
                    <div class="submission-info">
                        <h4>${sub.questions?.text || 'Unknown Question'}</h4>
                        <div class="submission-meta">
                            <span>Student: ${sub.users?.name || 'Unknown'}</span>
                            <span>Submitted: ${new Date(sub.submitted_at).toLocaleString()}</span>
                        </div>
                        <div class="submission-answer">
                            <strong>Answer:</strong>
                            <p>${sub.answer}</p>
                            ${sub.file_url ? `<a href="${sub.file_url}" target="_blank" class="file-link">View Attachment <i class="fas fa-external-link-alt"></i></a>` : ''}
                        </div>
                        <div class="grading-form">
                            <div class="form-group">
                                <label>Grade (%)</label>
                                <input type="number" id="grade_${sub.id}" min="0" max="100" step="1">
                            </div>
                            <div class="form-group">
                                <label>Feedback</label>
                                <textarea id="feedback_${sub.id}" rows="3" placeholder="Provide feedback to the student..."></textarea>
                            </div>
                            <button class="btn-primary submit-grade" data-id="${sub.id}">Submit Grade</button>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    document.querySelectorAll('.submit-grade').forEach(btn => {
        btn.addEventListener('click', async () => {
            const submissionId = btn.getAttribute('data-id');
            const grade = document.getElementById(`grade_${submissionId}`).value;
            const feedback = document.getElementById(`feedback_${submissionId}`).value;
            
            if (!grade) {
                showToast('Please enter a grade', 'error');
                return;
            }
            
            const isCorrect = parseInt(grade) >= 70;
            
            const result = await gradeSubmission(submissionId, parseInt(grade), feedback, isCorrect);
            
            if (result) {
                renderGradeSubmissions();
            }
        });
    });
}

// ============================================
// WALLET TAB
// ============================================
async function renderWallet() {
    const container = document.getElementById('wallet-section');
    if (!container) return;
    
    const balance = await getWalletBalance();
    const isPremiumUser = await isPremium();
    const transactions = await getTransactionHistory();
    const userAccess = await getUserAccess();
    
    const topUpAmount = PRICING.premium - balance;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Wallet</h2>
                <p>Your balance: <strong>₦${balance.toLocaleString()}</strong></p>
            </div>
            <button class="btn-primary" id="addFundsBtn">Add Funds</button>
        </div>
        
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
                    <p>⚠️ Forfeits remaining credit. No monthly bonuses.</p>
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
                            <div class="transaction-desc">${escapeHtml(t.description)}</div>
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
    
    // Event listeners for wallet
    document.getElementById('addFundsBtn')?.addEventListener('click', () => openModal('addFundsModal'));
    document.getElementById('buyPremiumBtn')?.addEventListener('click', async () => {
        const result = await purchasePremium();
        if (result === true) {
            setTimeout(() => renderWallet(), 1000);
            setTimeout(() => renderDashboard(), 1000);
        } else if (result?.needsTopUp) {
            openModal('addFundsModal');
        }
    });
    document.getElementById('premiumTopUpBtn')?.addEventListener('click', () => openModal('addFundsModal'));
    document.getElementById('buyStandardBtn')?.addEventListener('click', async () => {
        if (confirm('⚠️ WARNING: You will forfeit remaining credit. No monthly bonuses. Continue?')) {
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
    
    const isDark = document.body.classList.contains('dark-mode');
    
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
        </div>
        
        <div class="settings-actions">
            <button type="submit" class="btn-primary" id="saveSettingsBtn">Save Changes</button>
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
