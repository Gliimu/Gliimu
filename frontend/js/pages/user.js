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
import { submitRoleApplication, getUserApplications } from '../modules/auth.js';

// ============================================
// IMPORT ROLE-SPECIFIC MODULES
// ============================================
let studentModule = null;
let instructorModule = null;
let generalModule = null;
let alertsModule = null;
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
        const general = await import('./user-general.js');
        generalModule = general.default || general;
    } catch (e) { console.log('General module not loaded'); }

    try {
        const alerts = await import('./user-alerts.js');
        alertsModule = alerts.default || alerts;
    } catch (e) { console.log('Alerts module not loaded'); }
}

// ============================================
// GLOBAL STATE
// ============================================
let currentUser = null;
let currentUserProfile = null;
let currentRole = 'user';
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

// Make currentUser available globally for other modules
window.currentUser = currentUser;

// ============================================
// ROLE-BASED TAB CONFIGURATION
// ============================================
const roleTabs = {
    user: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'alerts', name: 'Alerts', icon: 'fas fa-bell' },
        { id: 'gotomenu', name: 'Go To', icon: 'fas fa-door-open' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    student: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'alerts', name: 'Alerts', icon: 'fas fa-bell' },
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
        window.currentUser = currentUser;
        currentRole = currentUser.role || 'user';
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
            // Don't try to create profile - trigger should handle it
            sessionStorage.setItem('redirecting', 'true');
            showToast('Account setup in progress. Please try again.', 'info');
            setTimeout(() => {
                sessionStorage.removeItem('redirecting');
                window.location.href = '/signin.html';
            }, 2000);
            return;
        }
        
        currentUserProfile = profile;
        currentWalletBalance = profile.wallet_balance || 14500;
        
        currentUser = {
            id: userId,
            name: profile.name || 'User',
            email: profile.email,
            username: profile.username || profile.email?.split('@')[0] || 'user',
            role: profile.role || 'user',
            walletBalance: profile.wallet_balance || 14500,
            gpPoints: profile.gp_points || 0,
            address: profile.address || '',
            applicationStatus: profile.application_status || 'none',
            appliedRole: profile.applied_role || null,
            avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=fbb040&color=fff`
        };
        window.currentUser = currentUser;
        currentRole = currentUser.role;
        
        localStorage.setItem('glimu_user', JSON.stringify(currentUser));
        
        // Load role-specific stylesheet
        loadRoleStylesheet(currentRole);
        
        console.log('User loaded from Supabase:', currentUser);
        
    } catch (error) {
        console.error('Error loading user from Supabase:', error);
        sessionStorage.setItem('redirecting', 'true');
        showToast('Error loading profile. Please try again.', 'error');
        setTimeout(() => {
            sessionStorage.removeItem('redirecting');
            window.location.href = '/signin.html';
        }, 2000);
    }
}

function loadRoleStylesheet(role) {
    const existing = document.getElementById('roleStylesheet');
    if (existing) {
        const stylesheet = role === 'user' ? 'student' : role;
        existing.href = `/frontend/css/user-${stylesheet}.css`;
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
    if (userRoleEl) {
        const roleDisplay = currentRole === 'user' ? 'Member' : 
                           currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
        userRoleEl.textContent = roleDisplay;
    }
    if (avatarImg) {
        avatarImg.src = currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name || 'User')}&background=fbb040&color=fff`;
    }
    
    const alertsTab = document.getElementById('mobileAlertsTab');
    if (alertsTab) {
        if (currentRole === 'student' || currentRole === 'user') {
            alertsTab.style.display = 'flex';
        } else {
            alertsTab.style.display = 'none';
        }
    }
}

// ============================================
// THEME
// ============================================

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const dashboardTheme = localStorage.getItem('dashboard_theme');
    
    let theme = dashboardTheme || savedTheme || 'light';
    
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    
    localStorage.setItem('theme', theme);
    localStorage.setItem('dashboard_theme', theme);
    
    console.log('🎨 Theme initialized:', theme, 'mode');
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    const theme = isDark ? 'dark' : 'light';
    
    localStorage.setItem('theme', theme);
    localStorage.setItem('dashboard_theme', theme);
    
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    
    showToast(`Switched to ${isDark ? '🌙 Dark' : '☀️ Light'} mode`, 'info');
}

window.selectTheme = function(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    
    localStorage.setItem('theme', theme);
    localStorage.setItem('dashboard_theme', theme);
    
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    
    showToast(`Switched to ${theme === 'dark' ? '🌙 Dark' : '☀️ Light'} mode`, 'info');
};

// ============================================
// SIDEBAR NAVIGATION
// ============================================
function buildSidebar() {
    const tabs = roleTabs[currentRole] || roleTabs.user;
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
        <div id="alerts-section" class="dashboard-section">
            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading alerts...</div>
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
        case 'alerts':
            renderAlerts();
            break;
        case 'gotomenu':
            await renderGoToMenu();
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
// ALERTS TAB - RENDER ALERTS
// ============================================
function renderAlerts() {
    const container = document.getElementById('alerts-section');
    if (!container) return;
    
    if (currentRole !== 'student' && currentRole !== 'user') {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bell"></i>
                <h3>Alerts Not Available</h3>
                <p>Alerts are available for students and members.</p>
            </div>
        `;
        return;
    }
    
    if (alertsModule && alertsModule.renderAlerts) {
        alertsModule.renderAlerts(container);
        return;
    }
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2><i class="fas fa-bell"></i> Alerts</h2>
                <p>Your achievements, certificates, badges, and messages</p>
            </div>
        </div>
        
        <div class="alerts-grid">
            <div class="alert-card">
                <div class="alert-icon"><i class="fas fa-certificate"></i></div>
                <div class="alert-content">
                    <h3>Certificates</h3>
                    <p>Your earned certificates will appear here.</p>
                    <span class="alert-count">0</span>
                </div>
            </div>
            
            <div class="alert-card">
                <div class="alert-icon"><i class="fas fa-medal"></i></div>
                <div class="alert-content">
                    <h3>Badges</h3>
                    <p>Your unlocked badges and achievements.</p>
                    <span class="alert-count">0</span>
                </div>
            </div>
            
            <div class="alert-card">
                <div class="alert-icon"><i class="fas fa-envelope"></i></div>
                <div class="alert-content">
                    <h3>Messages</h3>
                    <p>Private messages from admins and instructors.</p>
                    <span class="alert-count">0</span>
                </div>
            </div>
            
            <div class="alert-card">
                <div class="alert-icon"><i class="fas fa-bullhorn"></i></div>
                <div class="alert-content">
                    <h3>Notifications</h3>
                    <p>Important updates and announcements.</p>
                    <span class="alert-count">0</span>
                </div>
            </div>
        </div>
        
        <div class="empty-state" style="margin-top: 2rem;">
            <i class="fas fa-check-circle"></i>
            <h3>All Caught Up!</h3>
            <p>You have no new alerts. Keep learning and earning achievements!</p>
        </div>
    `;
}

// ============================================
// GO TO MENU
// ============================================
async function renderGoToMenu() {
    const container = document.getElementById('gotomenu-section');
    if (!container) return;
    
    const hasApplied = currentUser?.applicationStatus === 'pending';
    const appliedRole = currentUser?.appliedRole || '';
    const isStudent = currentUser?.role === 'student';
    const isInstructor = currentUser?.role === 'instructor';
    const isPartner = currentUser?.role === 'partner';
    const isUser = currentUser?.role === 'user';
    
    let statusMessage = '';
    if (hasApplied) {
        statusMessage = `
            <div class="alert alert-info" style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin-bottom: 20px;">
                <i class="fas fa-clock" style="color: #856404;"></i>
                <span style="color: #856404; font-weight: 500;">
                    Your application to become a <strong>${appliedRole}</strong> is pending approval.
                </span>
            </div>
        `;
    } else if (isStudent || isInstructor || isPartner) {
        statusMessage = `
            <div class="alert alert-success" style="background: #d4edda; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745; margin-bottom: 20px;">
                <i class="fas fa-check-circle" style="color: #155724;"></i>
                <span style="color: #155724; font-weight: 500;">
                    You are already a <strong>${currentRole}</strong>! 🎉
                </span>
            </div>
        `;
    }
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2><i class="fas fa-door-open"></i> Go To</h2>
                <p>Quick access to all platform sections</p>
            </div>
        </div>
        
        ${statusMessage}
        
        <div class="go-to-grid">
            <div class="go-to-card" onclick="window.location.href='/hub.html?tab=saved'">
                <div class="go-to-icon"><i class="fas fa-bookmark"></i></div>
                <div class="go-to-info"><h3>Library</h3><p>Your saved books and learning materials</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/hub.html'">
                <div class="go-to-icon"><i class="fas fa-newspaper"></i></div>
                <div class="go-to-info"><h3>Hub</h3><p>Events, insights, and latest updates</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/virtualroom.html'">
                <div class="go-to-icon"><i class="fas fa-video"></i></div>
                <div class="go-to-info"><h3>Virtual Classroom</h3><p>Live classes and interactive sessions</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/chat.html'">
                <div class="go-to-icon"><i class="fas fa-comments"></i></div>
                <div class="go-to-info"><h3>Community Chat</h3><p>Connect with fellow learners and instructors</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
            
            <div class="go-to-card" onclick="window.location.href='/user-course.html'">
                <div class="go-to-icon"><i class="fas fa-graduation-cap"></i></div>
                <div class="go-to-info"><h3>Courses</h3><p>Your learning path and course modules</p></div>
                <i class="fas fa-arrow-right go-to-arrow"></i>
            </div>
        </div>
        
        ${isUser && !hasApplied ? `
            <div class="application-section" style="margin-top: 2rem; padding: 2rem; background: var(--bg-secondary); border-radius: 12px; border: 1px solid var(--border-color);">
                <h3 style="margin-bottom: 1rem;"><i class="fas fa-user-graduate"></i> Upgrade Your Account</h3>
                <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">
                    Apply to become a Student or Instructor to unlock more features and learning paths.
                </p>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <button onclick="openApplicationModal('student')" class="btn-primary" style="background: #2c2f78; color: white;">
                        <i class="fas fa-user-graduate"></i> Apply as Student
                    </button>
                    <button onclick="openApplicationModal('instructor')" class="btn-primary" style="background: #fbb040; color: #1a1c4a;">
                        <i class="fas fa-chalkboard-teacher"></i> Apply as Instructor
                    </button>
                </div>
            </div>
        ` : ''}
    `;
    
    window.openApplicationModal = openApplicationModal;
}

// ============================================
// APPLICATION MODAL
// ============================================
function openApplicationModal(role) {
    const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);
    
    if (currentUser?.applicationStatus === 'pending') {
        showToast(`You already have a pending application to become a ${currentUser.appliedRole}`, 'warning');
        return;
    }
    
    let modal = document.getElementById('applicationModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'applicationModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Apply as ${roleDisplay}</h2>
                    <button class="modal-close" id="closeApplicationModal">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">
                        You are applying to become a <strong>${roleDisplay}</strong>. This will give you access to ${roleDisplay}-specific features and content.
                    </p>
                    
                    <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin-bottom: 1.5rem;">
                        <p style="margin: 0; color: #856404; font-size: 0.9rem;">
                            <i class="fas fa-info-circle"></i> 
                            Your application will be reviewed by an admin. You'll be notified once approved.
                        </p>
                    </div>
                    
                    <div class="form-group">
                        <label>Why do you want to become a ${roleDisplay}?</label>
                        <textarea id="applicationReason" rows="4" placeholder="Tell us why you want to become a ${roleDisplay}..." style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; font-family: inherit; background: var(--bg-primary); color: var(--text-primary);"></textarea>
                    </div>
                    
                    <button id="submitApplicationBtn" class="btn-primary">Submit Application</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('closeApplicationModal').onclick = () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        };
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    document.getElementById('submitApplicationBtn').onclick = async () => {
        const reason = document.getElementById('applicationReason').value.trim();
        
        if (!reason) {
            showToast('Please tell us why you want to become a ' + roleDisplay, 'warning');
            return;
        }
        
        const btn = document.getElementById('submitApplicationBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        
        try {
            const result = await submitRoleApplication(role, { reason: reason });
            
            if (result.success) {
                showToast(`Application to become a ${roleDisplay} submitted successfully!`, 'success');
                modal.classList.remove('active');
                document.body.style.overflow = '';
                
                currentUser.applicationStatus = 'pending';
                currentUser.appliedRole = role;
                window.currentUser = currentUser;
                localStorage.setItem('glimu_user', JSON.stringify(currentUser));
                
                await renderGoToMenu();
            } else {
                showToast(result.error || 'Failed to submit application', 'error');
            }
        } catch (error) {
            console.error('Application error:', error);
            showToast('Failed to submit application', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Submit Application';
        }
    };
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
        } else if (currentRole === 'instructor' && instructorModule && instructorModule.renderDashboard) {
            await instructorModule.renderDashboard(container);
            return;
        } else if (currentRole === 'partner' && generalModule && generalModule.renderDashboard) {
            await generalModule.renderDashboard(container);
            return;
        } else if (currentRole === 'user' && generalModule && generalModule.renderDashboard) {
            await generalModule.renderDashboard(container);
            return;
        }
        
        // Ultimate fallback - simple dashboard
        console.log('Using fallback dashboard render');
        const walletBalance = currentUser?.walletBalance || 14500;
        const gpPoints = currentUser?.gpPoints || 0;
        const hasApplied = currentUser?.applicationStatus === 'pending';
        const appliedRole = currentUser?.appliedRole || '';
        
        container.innerHTML = `
            <div class="section-header">
                <h2>Welcome, ${currentUser?.name || 'User'}!</h2>
                <p>Your learning journey starts here</p>
            </div>
            
            ${currentRole === 'user' && !hasApplied ? `
                <div class="upgrade-prompt" style="background: linear-gradient(135deg, #2c2f78, #1a1c4a); padding: 20px; border-radius: 12px; margin-bottom: 20px; color: white;">
                    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px;">
                        <div>
                            <h3 style="margin: 0; color: white;"><i class="fas fa-rocket"></i> Upgrade Your Account</h3>
                            <p style="margin: 5px 0 0; opacity: 0.8;">Apply to become a Student or Instructor for more features</p>
                        </div>
                        <button onclick="switchTab('gotomenu')" class="btn-primary" style="background: #fbb040; color: #1a1c4a; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">
                            Apply Now →
                        </button>
                    </div>
                </div>
            ` : ''}
            
            ${hasApplied ? `
                <div class="application-pending" style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin-bottom: 20px;">
                    <i class="fas fa-clock" style="color: #856404;"></i>
                    <span style="color: #856404; font-weight: 500;">
                        Your application to become a <strong>${appliedRole}</strong> is pending approval.
                    </span>
                </div>
            ` : ''}
            
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
            
            <div class="quick-actions" style="margin-top: 2rem;">
                <h3>Quick Actions</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-top: 1rem;">
                    <button onclick="switchTab('gotomenu')" class="action-btn" style="padding: 20px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 10px;">
                        <i class="fas fa-door-open" style="font-size: 24px; color: var(--brand-gold);"></i>
                        <span>Go To</span>
                    </button>
                    <button onclick="switchTab('wallet')" class="action-btn" style="padding: 20px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 10px;">
                        <i class="fas fa-wallet" style="font-size: 24px; color: var(--brand-gold);"></i>
                        <span>Wallet</span>
                    </button>
                    <button onclick="switchTab('settings')" class="action-btn" style="padding: 20px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 10px;">
                        <i class="fas fa-cog" style="font-size: 24px; color: var(--brand-gold);"></i>
                        <span>Settings</span>
                    </button>
                </div>
            </div>
        `;
        
        document.getElementById('quickAddFundsBtn')?.addEventListener('click', () => switchTab('wallet'));
        
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
                    window.currentUser = currentUser;
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
                .update({ ...updates, updated_at: new Date() })
                .eq('id', currentUser.id);
            
            if (error) {
                showToast('Failed to update settings', 'error');
            } else {
                currentUser.name = newName;
                currentUser.address = newAddress;
                window.currentUser = currentUser;
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
    
    if (generalModule && generalModule.renderProjects) {
        generalModule.renderProjects(container);
        return;
    }
    
    container.innerHTML = `
        <div class="section-header">
            <h2>Projects</h2>
            <p>Manage your projects</p>
        </div>
        <div class="empty-state">
            <i class="fas fa-project-diagram"></i>
            <h3>No Projects Yet</h3>
            <p>Create your first project to get started.</p>
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
        window.currentUser = currentUser;
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
window.currentUser = currentUser;
