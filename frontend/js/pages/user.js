// ============================================
// GLIIMU USER DASHBOARD - MAIN ENTRY POINT
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';
import { 
    getWalletBalance, 
    purchaseBook, 
    purchaseBundle, 
    getTransactionHistory,
    getUserAccess,
    subscribeToWalletUpdates
} from '../modules/wallet.js';

import {
    getStudentScore,
    getCurrentBadge,
    getNextBadge,
    getProgressToNextBadge,
    getLeaderboard,
    sharePortfolio,
    submitMVPProposal,
    getStudentPortfolio
} from '../modules/progression.js';

import { renderProgressBar, renderLeaderboard } from '../modules/questions.js';

// ============================================
// IMPORT ROLE-SPECIFIC MODULES
// ============================================
let studentModule = null;
let instructorModule = null;
let partnerModule = null;
let courseListenerSetup = false;

// Dynamically load role modules
async function loadRoleModules() {
    try {
        const student = await import('./user-student.js');
        studentModule = student.default || student;
    } catch (e) { console.log('Student module not loaded'); }

    try {
        const instructor = await import('./user-instructor.js');
        instructorModule = instructor.default || instructor;
    } catch (e) { console.log('Instructor module not loaded'); }

    try {
        const partner = await import('./user-partner.js');
        partnerModule = partner.default || partner;
    } catch (e) { console.log('Partner module not loaded'); }
}

// ============================================
// GLOBAL STATE
// ============================================
let currentUser = null;
let currentUserProfile = null;
let currentRole = 'student';
let currentTab = 'dashboard';
let currentWalletBalance = 0;
let walletSubscription = null;
let allPayments = [];
let pendingPayments = [];
let approvedPayments = [];
let cancelledPayments = [];
let allLibraryItems = [];
let paymentsCache = null;
let lastPaymentsFetch = 0;
const CACHE_DURATION = 30000;
const PAYMENTS_CACHE_DURATION = 60000;

// ============================================
// ROLE-BASED TAB CONFIGURATION
// ============================================
const roleTabs = {
    student: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'journey', name: 'Journey', icon: 'fas fa-road' },
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
};

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    console.log('Checking authentication...');
    
    if (sessionStorage.getItem('redirecting')) {
        console.log('Redirect already in progress, stopping');
        return false;
    }
    
    const localUser = localStorage.getItem('glimu_user');
    if (localUser) {
        currentUser = JSON.parse(localUser);
        currentRole = currentUser.role || 'student';
        console.log('User found in localStorage:', currentUser);
        
        if (currentRole === 'admin') {
            console.log('Admin user detected. Redirecting to /admin');
            sessionStorage.setItem('redirecting', 'true');
            window.location.href = '/admin';
            return false;
        }
        return true;
    }
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
        console.error('Session error:', error);
        return false;
    }
    
    if (session) {
        await loadUserFromSupabase(session.user.id);
        
        if (currentRole === 'admin') {
            console.log('Admin user detected. Redirecting to /admin');
            sessionStorage.setItem('redirecting', 'true');
            window.location.href = '/admin';
            return false;
        }
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
        
        // Load role-specific stylesheet
        loadRoleStylesheet(currentRole);
        
        console.log('User loaded from Supabase:', currentUser);
        
    } catch (error) {
        console.error('Error loading user from Supabase:', error);
    }
}

function loadRoleStylesheet(role) {
    const existing = document.getElementById('roleStylesheet');
    if (existing) {
        existing.href = `/frontend/css/user-${role}.css`;
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
    
    // Show/hide journey tab based on role
    const journeyTab = document.getElementById('mobileJourneyTab');
    if (journeyTab) {
        if (currentRole === 'student') {
            journeyTab.style.display = 'flex';
        } else {
            journeyTab.style.display = 'none';
        }
    }
}

// ============================================
// THEME
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
    
    const sections = `
        <div id="dashboard-section" class="dashboard-section active">
            <div class="loading-spinner">Loading dashboard...</div>
        </div>
        <div id="journey-section" class="dashboard-section">
            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading your learning journey...</div>
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
    
    dashboardContent.innerHTML = sections;
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
        case 'journey':
            renderJourney();
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
            if (currentRole === 'instructor') {
                renderGradeSubmissions();
            } else {
                showToast('Grade submissions are only for instructors', 'info');
            }
            break;
        case 'projects':
            if (currentRole === 'partner') {
                renderProjects();
            } else {
                showToast('Projects are only for partners', 'info');
            }
            break;
        default:
            await renderDashboard();
    }
}

// ============================================
// JOURNEY TAB - RENDER LEARNING PATH
// ============================================
// ============================================
// JOURNEY TAB - RENDER LEARNING PATH
// ============================================
function renderJourney() {
    const container = document.getElementById('journey-section');
    if (!container) return;
    
    // Check if user is student
    if (currentRole !== 'student') {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-road"></i>
                <h3>Journey Not Available</h3>
                <p>The learning journey is only available for students.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="journey-container">
            <div class="journey-loader" id="journeyLoader">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading your learning journey...</p>
            </div>
            <!-- Use object instead of iframe -->
            <object 
                data="/user-course" 
                class="journey-object" 
                id="journeyObject"
                type="text/html"
                width="100%"
                height="100%"
            >
                <div class="journey-fallback">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Unable to load the learning journey.</p>
                    <a href="/user-course" target="_blank" class="btn-primary">Open Journey in New Tab</a>
                </div>
            </object>
        </div>
    `;
    
    // Setup message listener for course events
    if (!courseListenerSetup) {
        setupCourseMessageListener();
        courseListenerSetup = true;
    }
    
    // Hide loader when object loads
    const object = document.getElementById('journeyObject');
    const loader = document.getElementById('journeyLoader');
    
    if (object) {
        // Try to detect load
        object.addEventListener('load', () => {
            if (loader) loader.style.display = 'none';
        });
        
        // Fallback: hide loader after 5 seconds
        setTimeout(() => {
            if (loader) loader.style.display = 'none';
        }, 5000);
    }
}

// ============================================
// GP MILESTONE CHECKS
// ============================================
async function checkGPMilestones(totalGP) {
    const milestones = [
        { gp: 100, title: 'Scholar', icon: '🎓' },
        { gp: 250, title: 'Reader', icon: '📚' },
        { gp: 500, title: 'Builder', icon: '🏆' },
        { gp: 1000, title: 'Master', icon: '👑' },
        { gp: 1500, title: 'Ambassador', icon: '⭐' }
    ];
    
    for (const milestone of milestones) {
        if (totalGP >= milestone.gp) {
            // Check if already unlocked
            const key = `milestone_${milestone.gp}_${currentUser.id}`;
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, 'true');
                showToast(`🏆 Achievement Unlocked: ${milestone.icon} ${milestone.title}!`, 'success');
                
                // Trigger confetti
                triggerConfetti();
            }
        }
    }
}

// ============================================
// CONFETTI TRIGGER
// ============================================
function triggerConfetti() {
    const colors = ['#fbb040', '#2c2f78', '#10b981', '#ef4444', '#3b82f6'];
    const container = document.body;
    
    // Check if confetti styles exist
    if (!document.getElementById('confettiStyles')) {
        const style = document.createElement('style');
        style.id = 'confettiStyles';
        style.textContent = `
            @keyframes confettiFall {
                0% { transform: translateY(0) rotate(0deg); opacity: 1; }
                100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    for (let i = 0; i < 80; i++) {
        const confetti = document.createElement('div');
        confetti.style.cssText = `
            position: fixed;
            top: -20px;
            left: ${Math.random() * 100}%;
            width: ${Math.random() * 10 + 5}px;
            height: ${Math.random() * 10 + 5}px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
            z-index: 9999;
            pointer-events: none;
            animation: confettiFall ${Math.random() * 3 + 2}s linear forwards;
            animation-delay: ${Math.random() * 0.5}s;
        `;
        container.appendChild(confetti);
        
        setTimeout(() => confetti.remove(), 5000);
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
        // Use role-specific render if available
        if (currentRole === 'student' && studentModule && studentModule.renderDashboard) {
            await studentModule.renderDashboard(container);
            return;
        } else if (currentRole === 'instructor' && instructorModule && instructorModule.renderInstructorDashboard) {
            await instructorModule.renderInstructorDashboard(container);
            return;
        } else if (currentRole === 'partner' && partnerModule && partnerModule.renderPartnerDashboard) {
            await partnerModule.renderPartnerDashboard(container);
            return;
        }
        
        // Fallback to generic dashboard
        console.log('Using generic dashboard render');
        let scoreData = { current_score: 0 };
        try {
            scoreData = await getStudentScore(currentUser.id);
            console.log('📊 Score data:', scoreData);
        } catch (e) {
            console.warn('⚠️ Could not get student score:', e);
            scoreData = { current_score: 0 };
        }
        const currentBadge = getCurrentBadge(scoreData?.current_score || 0);
        const nextBadge = getNextBadge(scoreData?.current_score || 0);
        const progressToNext = getProgressToNextBadge(scoreData?.current_score || 0);
        const leaderboardData = await getLeaderboard(10);
        const isAmbassador = (scoreData?.current_score || 0) >= 100;
        const walletBalance = currentUser?.walletBalance || 14500;
        
        // Get GP from localStorage or user data
        const gpPoints = currentUser?.gpPoints || 0;
        
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
                    <i class="fas fa-star"></i>
                    <div>
                        <span class="quick-stat-label">Gliimu Points (GP)</span>
                        <span class="quick-stat-value quick-gp">${gpPoints}</span>
                    </div>
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
                    ${renderLeaderboard(leaderboardData)}
                </div>
            </div>
        `;
        
        document.getElementById('quickAddFundsBtn')?.addEventListener('click', () => switchTab('wallet'));
        document.getElementById('openMvpFormBtn')?.addEventListener('click', () => openMvpModal());
        document.getElementById('refreshLeaderboardBtn')?.addEventListener('click', async () => {
            const newLeaderboard = await getLeaderboard(10);
            const leaderboardList = document.querySelector('.leaderboard-list');
            if (leaderboardList) {
                leaderboardList.innerHTML = renderLeaderboardList(newLeaderboard);
            }
            showToast('Leaderboard refreshed!', 'success');
        });
        
        console.log('Dashboard rendered successfully');
        
    } catch (error) {
        console.error('Error rendering dashboard:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Dashboard</h3>
                <p style="font-size: 12px;">${error.message || 'Unknown error'}</p>
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

// ============================================
// MVP MODAL
// ============================================
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
                            <textarea id="mvpProposal" rows="6" required placeholder="How do you plan to execute this project?"></textarea>
                        </div>
                        <button type="submit" class="btn-primary">Submit MVP Proposal</button>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('closeMvpModal').onclick = () => modal.classList.remove('active');
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
// GO TO MENU
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
// WALLET
// ============================================
async function renderWallet() {
    const container = document.getElementById('wallet-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading wallet...</div>';
    
    try {
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
        `;
        
        document.getElementById('addFundsBtn')?.addEventListener('click', () => openFundWalletModal());
        
    } catch (error) {
        console.error('Error rendering wallet:', error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error Loading Wallet</h3><button class="btn-primary" onclick="location.reload()">Try Again</button></div>`;
    }
}

// ============================================
// OPEN FUND WALLET MODAL
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
    
    if (suggestedAmount) proceedToBank();
    
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
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        newConfirmBtn.onclick = async () => {
            if (!selectedAmount) {
                showToast('Invalid amount', 'error');
                return;
            }
            
            newConfirmBtn.disabled = true;
            newConfirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            
            const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
            
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
            
            try {
                const { error } = await supabase
                    .from('payment_requests')
                    .insert({
                        id: paymentId,
                        user_id: currentUser.id,
                        user_name: currentUser.name,
                        user_email: currentUser.email,
                        amount: selectedAmount,
                        reference_code: referenceCode,
                        bank: selectedBank.name,
                        status: 'pending',
                        submitted_at: new Date().toISOString()
                    });
                
                if (error) {
                    console.error('Insert error:', error);
                    showToast(`Error: ${error.message}. Payment saved locally.`, 'warning');
                } else {
                    showToast(`Payment request submitted! Bank: ${selectedBank.name}, Ref: ${referenceCode}`, 'success');
                }
                
                modal.classList.remove('active');
                document.body.style.overflow = '';
                setTimeout(() => renderWallet(), 500);
                
            } catch (err) {
                console.error('Submission error:', err);
                showToast('Error submitting payment request. Please try again.', 'error');
            } finally {
                newConfirmBtn.disabled = false;
                newConfirmBtn.innerHTML = '✅ I Have Made Payment';
            }
        };
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// ============================================
// SETTINGS
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
    
    if (instructorModule && instructorModule.renderGradeSubmissions) {
        instructorModule.renderGradeSubmissions(container);
        return;
    }
    
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
    
    if (partnerModule && partnerModule.renderProjects) {
        partnerModule.renderProjects(container);
        return;
    }
    
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
// REALTIME WALLET
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
            const balanceElement = document.querySelector('.quick-balance');
            if (balanceElement) {
                balanceElement.textContent = `₦${newBalance.toLocaleString()}`;
            }
        }
        
        showToast(`Wallet updated: ₦${newBalance.toLocaleString()}`, 'info');
    });
}

// ============================================
// INITIALIZE
// ============================================
async function initDashboard() {
    console.log('Initializing dashboard...');
    
    // Load role modules first
    await loadRoleModules();
    
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
window.renderDashboard = renderDashboard;
