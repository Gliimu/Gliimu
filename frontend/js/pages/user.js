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
let partnerModule = null;
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
        const partner = await import('./user-partner.js');
        partnerModule = partner.default || partner;
    } catch (e) { console.log('Partner module not loaded'); }

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
let currentRole = 'user'; // Changed from 'student' to 'user'
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
    user: [  // Default role for all new users
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
            const { data: authUser } = await supabase.auth.getUser();
            if (authUser?.user) {
                // ✅ FIXED: Include ALL required fields
                const defaultProfile = {
                    id: userId,
                    name: authUser.user.email?.split('@')[0] || 'User',
                    email: authUser.user.email,
                    username: authUser.user.email?.split('@')[0] || 'user',
                    role: 'user',  // Changed from 'student'
                    wallet_balance: 14500,
                    gp_points: 0,
                    status: 'active',
                    application_status: 'none',
                    plan: 'basic',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                
                const { error: insertError } = await supabase
                    .from('users')
                    .insert([defaultProfile]);
                
                if (!insertError) {
                    currentUser = {
                        id: userId,
                        name: defaultProfile.name,
                        email: defaultProfile.email,
                        username: defaultProfile.username,
                        role: defaultProfile.role,
                        walletBalance: defaultProfile.wallet_balance,
                        gpPoints: defaultProfile.gp_points,
                        applicationStatus: defaultProfile.application_status,
                        appliedRole: null,
                        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(defaultProfile.name)}&background=fbb040&color=fff`
                    };
                    currentRole = 'user';
                    currentWalletBalance = 14500;
                    localStorage.setItem('glimu_user', JSON.stringify(currentUser));
                    return;
                }
            }
            throw profileError;
        }
        
        currentUserProfile = profile;
        currentWalletBalance = profile.wallet_balance || 14500;
        
        // ✅ FIXED: Include all fields
        currentUser = {
            id: userId,
            name: profile.name || profile.full_name || 'User',
            email: profile.email,
            username: profile.username || profile.email?.split('@')[0] || 'user',
            role: profile.role || 'user',  // Changed default to 'user'
            walletBalance: profile.wallet_balance || 14500,
            gpPoints: profile.gp_points || 0,
            address: profile.address || '',
            applicationStatus: profile.application_status || 'none',
            appliedRole: profile.applied_role || null,
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
        // If role is 'user', use student stylesheet as default
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
        // Display role nicely
        const roleDisplay = currentRole === 'user' ? 'Member' : 
                           currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
        userRoleEl.textContent = roleDisplay;
    }
    if (avatarImg) {
        avatarImg.src = currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name || 'User')}&background=fbb040&color=fff`;
    }
    
    // Show/hide alerts tab based on role
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
            await renderGoToMenu();  // Made async
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
    
    // Check if user is student or basic user
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
    
    // Use alerts module if available
    if (alertsModule && alertsModule.renderAlerts) {
        alertsModule.renderAlerts(container);
        return;
    }
    
    // Fallback: Show placeholder
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
// GO TO MENU - WITH APPLICATION FEATURE
// ============================================
async function renderGoToMenu() {
    const container = document.getElementById('gotomenu-section');
    if (!container) return;
    
    // Check application status
    const hasApplied = currentUser?.applicationStatus === 'pending';
    const appliedRole = currentUser?.appliedRole || '';
    const isStudent = currentUser?.role === 'student';
    const isInstructor = currentUser?.role === 'instructor';
    const isPartner = currentUser?.role === 'partner';
    const isUser = currentUser?.role === 'user';
    
    // Build application status message
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
    
    // Expose the modal function globally
    window.openApplicationModal = openApplicationModal;
}

// ============================================
// APPLICATION MODAL
// ============================================
function openApplicationModal(role) {
    const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);
    
    // Check if already applied
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
                
                // Update local state
                currentUser.applicationStatus = 'pending';
                currentUser.appliedRole = role;
                localStorage.setItem('glimu_user', JSON.stringify(currentUser));
                
                // Refresh Go To menu
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
        // Use role-specific render if available and role is not 'user'
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
        
        // Fallback to generic dashboard (for 'user' role or if modules not loaded)
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
        
        // Get GP from user data
        const gpPoints = currentUser?.gpPoints || 0;
        
        // Check if user has applied for upgrade
        const hasApplied = currentUser?.applicationStatus === 'pending';
        const appliedRole = currentUser?.appliedRole || '';
        
        container.innerHTML = `
            <div class="progress-section">
                ${renderProgressBar(scoreData?.current_score || 0, currentBadge, nextBadge, progressToNext)}
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
// WALLET - REST OF THE FILE REMAINS THE SAME
// (renderWallet, openFundWalletModal, renderSettings, etc. stay the same)
// ============================================

// ... [Keep renderWallet, openFundWalletModal, renderSettings, renderGradeSubmissions, renderProjects, escapeHtml, initMobileNavigation, setupRealtimeWallet from your original file]

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
