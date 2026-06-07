// ============================================
// GLIIMU DASHBOARD - STUDENT COMPLETE VERSION
// With Assignments, Portfolio, Progress, Submissions
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
let assignments = [];
let portfolioItems = [];
let submissions = [];
let courseProgress = {
    videoProduction: 0,
    uiuxDesign: 0,
    webDevelopment: 0,
    motionGraphics: 0,
    brandStrategy: 0
};

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
        
        const { data: saved, error: savedError } = await supabase
            .from('user_saved_items')
            .select('*')
            .eq('user_id', userId)
            .order('saved_at', { ascending: false });
        
        if (!savedError) savedItems = saved || [];
        
        const { data: recent, error: recentError } = await supabase
            .from('user_recently_viewed')
            .select('*')
            .eq('user_id', userId)
            .order('viewed_at', { ascending: false })
            .limit(10);
        
        if (!recentError) recentlyViewed = recent || [];
        
        // Load mock assignments
        loadMockAssignments();
        loadMockPortfolio();
        loadMockSubmissions();
        
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
        { id: 1, title: 'Nike Commercial', type: 'video', thumbnail: '/photos/portfolio1.jpg', date: '2025-05-01', views: 245, likes: 34 },
        { id: 2, title: 'Food App UI Design', type: 'design', thumbnail: '/photos/portfolio2.jpg', date: '2025-05-10', views: 189, likes: 27 },
        { id: 3, title: 'E-commerce Website', type: 'code', thumbnail: '/photos/portfolio3.jpg', date: '2025-05-15', views: 312, likes: 45 },
        { id: 4, title: 'Title Sequence Animation', type: 'motion', thumbnail: '/photos/portfolio4.jpg', date: '2025-05-20', views: 178, likes: 23 }
    ];
}

function loadMockSubmissions() {
    submissions = [
        { id: 1, title: 'Video Production Assignment', submittedAt: '2025-06-01', status: 'graded', grade: 88, feedback: 'Great work on the pacing!' },
        { id: 2, title: 'UI Design Project', submittedAt: '2025-05-25', status: 'graded', grade: 92, feedback: 'Excellent use of color theory' },
        { id: 3, title: 'JavaScript Challenge', submittedAt: '2025-05-20', status: 'pending', grade: null, feedback: null }
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
// ROLE-BASED TAB CONFIGURATION - STUDENT FOCUSED
// ============================================
const roleTabs = {
    student: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'assignments', name: 'Assignments', icon: 'fas fa-tasks' },
        { id: 'submissions', name: 'Submissions', icon: 'fas fa-upload' },
        { id: 'portfolio', name: 'Portfolio', icon: 'fas fa-briefcase' },
        { id: 'progress', name: 'Progress', icon: 'fas fa-chart-line' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    instructor: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'students', name: 'My Students', icon: 'fas fa-users' },
        { id: 'submissions', name: 'Grade Submissions', icon: 'fas fa-clipboard-list' },
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
        case 'assignments':
            renderAssignments();
            break;
        case 'submissions':
            renderSubmissions();
            break;
        case 'portfolio':
            renderPortfolio();
            break;
        case 'progress':
            renderProgress();
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
// DASHBOARD RENDER - UPDATED (No stat-sub)
// ============================================
async function renderDashboard() {
    const container = document.getElementById('dashboard-section');
    if (!container) return;
    
    const savedCount = savedItems.length;
    const walletBalance = currentUser?.walletBalance || 14500;
    const isPremiumUser = currentUser?.subscriptionTier === 'premium';
    const pendingAssignments = assignments.filter(a => a.status === 'pending').length;
    const completedCourses = Object.values(courseProgress).filter(p => p >= 100).length;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Dashboard</h2>
                <p>Welcome back, ${currentUser?.name || 'Creator'}!</p>
            </div>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-tasks"></i></div>
                <div class="stat-info">
                    <h3>Pending Assignments</h3>
                    <div class="stat-value">${pendingAssignments}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                <div class="stat-info">
                    <h3>Completed Courses</h3>
                    <div class="stat-value">${completedCourses}/5</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-bookmark"></i></div>
                <div class="stat-info">
                    <h3>Saved Items</h3>
                    <div class="stat-value">${savedCount}</div>
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
        
        <div class="quick-links">
            <h3>Quick Access</h3>
            <div class="quick-links-grid">
                <div class="quick-link-card" onclick="window.location.href='/library.html'">
                    <i class="fas fa-book"></i>
                    <span>Library</span>
                </div>
                <div class="quick-link-card" onclick="window.location.href='/hub.html'">
                    <i class="fas fa-newspaper"></i>
                    <span>Hub</span>
                </div>
                <div class="quick-link-card" onclick="window.location.href='/chat.html'">
                    <i class="fas fa-comments"></i>
                    <span>Community</span>
                </div>
                <div class="quick-link-card" onclick="window.location.href='/virtualroom.html'">
                    <i class="fas fa-video"></i>
                    <span>Virtual Classroom</span>
                </div>
            </div>
        </div>
        
        <div class="action-cards">
            <div class="action-card" id="goToAssignmentsBtn">
                <i class="fas fa-tasks"></i>
                <h4>View Assignments</h4>
                <p>${pendingAssignments} pending tasks</p>
            </div>
            <div class="action-card" id="goToPortfolioBtn">
                <i class="fas fa-briefcase"></i>
                <h4>My Portfolio</h4>
                <p>${portfolioItems.length} projects</p>
            </div>
            <div class="action-card" id="goToProgressBtn">
                <i class="fas fa-chart-line"></i>
                <h4>Track Progress</h4>
                <p>${Math.round((completedCourses / 5) * 100)}% complete</p>
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
    
    document.getElementById('goToAssignmentsBtn')?.addEventListener('click', () => switchTab('assignments'));
    document.getElementById('goToPortfolioBtn')?.addEventListener('click', () => switchTab('portfolio'));
    document.getElementById('goToProgressBtn')?.addEventListener('click', () => switchTab('progress'));
    document.getElementById('quickAddFunds')?.addEventListener('click', () => switchTab('wallet'));
    
    document.querySelectorAll('.recent-item').forEach(item => {
        item.addEventListener('click', () => {
            const itemId = item.getAttribute('data-item-id');
            window.location.href = `/library.html?id=${itemId}`;
        });
    });
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
            <button class="btn-primary" id="newSubmissionBtn">+ New Submission</button>
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
    
    document.getElementById('newSubmissionBtn')?.addEventListener('click', () => {
        showToast('New submission form coming soon!', 'info');
    });
}

// ============================================
// PORTFOLIO TAB
// ============================================
async function renderPortfolio() {
    const container = document.getElementById('portfolio-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>My Portfolio</h2>
                <p>Showcase your best work</p>
            </div>
            <button class="btn-primary" id="addPortfolioBtn">+ Add Project</button>
        </div>
        
        <div class="portfolio-grid">
            ${portfolioItems.map(item => `
                <div class="portfolio-card">
                    <div class="portfolio-thumbnail" style="background-image: url('${item.thumbnail}'); background-size: cover;">
                        <div class="portfolio-overlay">
                            <button class="view-project" data-id="${item.id}">View Project</button>
                        </div>
                    </div>
                    <div class="portfolio-info">
                        <h4>${item.title}</h4>
                        <div class="portfolio-stats">
                            <span><i class="fas fa-eye"></i> ${item.views}</span>
                            <span><i class="fas fa-heart"></i> ${item.likes}</span>
                            <span class="portfolio-type">${item.type}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    document.getElementById('addPortfolioBtn')?.addEventListener('click', () => {
        showToast('Add portfolio feature coming soon!', 'info');
    });
}

// ============================================
// PROGRESS TAB - GAMIFIED
// ============================================
async function renderProgress() {
    const container = document.getElementById('progress-section');
    if (!container) return;
    
    const totalProgress = Object.values(courseProgress).reduce((a, b) => a + b, 0) / 5;
    const completedModules = Object.values(courseProgress).filter(p => p >= 100).length;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Course Progress</h2>
                <p>Track your journey to becoming a Media Architect</p>
            </div>
        </div>
        
        <div class="overall-progress">
            <div class="progress-circle">
                <svg viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border-color)" stroke-width="8"/>
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#fbb040" stroke-width="8" 
                            stroke-dasharray="${2 * Math.PI * 45}" 
                            stroke-dashoffset="${2 * Math.PI * 45 * (1 - totalProgress / 100)}"
                            transform="rotate(-90 50 50)"/>
                </svg>
                <div class="progress-percent">${Math.round(totalProgress)}%</div>
            </div>
            <div class="progress-stats">
                <div class="stat">📚 Courses Completed: <strong>${completedModules}/5</strong></div>
                <div class="stat">⭐ Overall Progress: <strong>${Math.round(totalProgress)}%</strong></div>
                <div class="stat">🏆 Next Milestone: <strong>${completedModules + 1}/5 courses</strong></div>
            </div>
        </div>
        
        <div class="courses-progress">
            <h3>Course Breakdown</h3>
            ${Object.entries(courseProgress).map(([course, progress]) => `
                <div class="course-progress-item">
                    <div class="course-name">
                        ${course === 'videoProduction' ? '🎬 Video Production' : 
                          course === 'uiuxDesign' ? '🎨 UI/UX Design' : 
                          course === 'webDevelopment' ? '💻 Web Development' : 
                          course === 'motionGraphics' ? '✨ Motion Graphics' : '📈 Brand Strategy'}
                    </div>
                    <div class="course-progress-bar">
                        <div class="progress-fill" style="width: ${progress}%; background: ${progress >= 100 ? '#10b981' : progress >= 70 ? '#fbb040' : '#ef4444'}"></div>
                    </div>
                    <div class="course-percent">${progress}%</div>
                    ${progress >= 100 ? '<span class="completed-badge">✅ Completed</span>' : ''}
                </div>
            `).join('')}
        </div>
        
        <div class="achievements-section">
            <h3>Achievements</h3>
            <div class="achievements-grid">
                <div class="achievement-card ${totalProgress >= 20 ? 'unlocked' : 'locked'}">
                    <i class="fas fa-rocket"></i>
                    <span>Getting Started</span>
                    <small>Complete 20% of course</small>
                </div>
                <div class="achievement-card ${totalProgress >= 50 ? 'unlocked' : 'locked'}">
                    <i class="fas fa-fire"></i>
                    <span>On Fire</span>
                    <small>Complete 50% of course</small>
                </div>
                <div class="achievement-card ${completedModules >= 3 ? 'unlocked' : 'locked'}">
                    <i class="fas fa-trophy"></i>
                    <span>Almost There</span>
                    <small>Complete 3 courses</small>
                </div>
                <div class="achievement-card ${totalProgress >= 100 ? 'unlocked' : 'locked'}">
                    <i class="fas fa-crown"></i>
                    <span>Media Architect</span>
                    <small>Complete all courses</small>
                </div>
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
    
    // Event listeners
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
// SETTINGS RENDER - With Profile Picture Upload
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
                        <button class="btn-outline" id="removeAvatarBtn" style="display: none;">Remove</button>
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
                    <div class="form-group">
                        <label>Member Since</label>
                        <input type="text" value="${new Date().toLocaleDateString()}" disabled>
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
                <div class="form-group">
                    <label>Push Notifications</label>
                    <label class="toggle-switch">
                        <input type="checkbox" id="pushNotifications" checked>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        </div>
        
        <div class="settings-actions">
            <button type="submit" class="btn-primary" id="saveSettingsBtn">Save Changes</button>
            <button class="btn-danger" id="deleteAccountBtn">Delete Account</button>
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
                document.getElementById('removeAvatarBtn').style.display = 'inline-block';
                
                // Update in database
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
    
    // Delete account
    document.getElementById('deleteAccountBtn')?.addEventListener('click', () => {
        if (confirm('⚠️ Are you sure? This action cannot be undone. All your data will be permanently deleted.')) {
            showToast('Account deletion requires admin approval', 'info');
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
window.toggleTheme = toggleTheme;
