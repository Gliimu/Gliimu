// ============================================
// GLIIMU DASHBOARD - COMPLETE VERSION
// Roles: Student, Instructor, Partner
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// GLOBAL STATE
// ============================================
let currentUser = null;
let currentRole = 'student';
let currentTab = 'overview';

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
    ]
};

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    console.log('Checking authentication...');
    
    try {
        // Check localStorage first
        const localUser = localStorage.getItem('glimu_user');
        if (localUser) {
            currentUser = JSON.parse(localUser);
            currentRole = currentUser.role || 'student';
            console.log('User found in localStorage:', currentUser);
            return true;
        }
        
        // Check Supabase session
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
        
    } catch (err) {
        console.error('Auth check error:', err);
        return false;
    }
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
            // Create fallback user
            currentUser = {
                id: userId,
                name: 'User',
                email: 'user@example.com',
                role: 'student',
                walletBalance: 0,
                avatar: 'https://ui-avatars.com/api/?name=User&background=fbb040&color=fff'
            };
            currentRole = 'student';
            localStorage.setItem('glimu_user', JSON.stringify(currentUser));
            return;
        }
        
        currentUser = {
            id: userId,
            name: profile.name || profile.full_name || 'User',
            email: profile.email,
            role: profile.role || 'student',
            walletBalance: profile.wallet_balance || 0,
            address: profile.address || '',
            phone: profile.phone || '',
            avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=fbb040&color=fff`
        };
        currentRole = currentUser.role;
        
        localStorage.setItem('glimu_user', JSON.stringify(currentUser));
        console.log('User loaded from Supabase:', currentUser);
        
    } catch (error) {
        console.error('Error loading user:', error);
        // Fallback user
        currentUser = {
            id: userId,
            name: 'User',
            email: 'user@example.com',
            role: 'student',
            walletBalance: 0,
            avatar: 'https://ui-avatars.com/api/?name=User&background=fbb040&color=fff'
        };
        currentRole = 'student';
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
    const container = document.getElementById(`${tabId}-section`);
    if (!container) return;
    
    switch(tabId) {
        case 'overview':
            container.innerHTML = await renderOverview();
            break;
        case 'question':
            container.innerHTML = await renderQuestionPlaceholder();
            break;
        case 'question-pull':
            container.innerHTML = await renderQuestionPullPlaceholder();
            break;
        case 'submit-project':
            container.innerHTML = await renderSubmitProjectPlaceholder();
            break;
        case 'gotomenu':
            container.innerHTML = renderGoToMenu();
            break;
        case 'wallet':
            container.innerHTML = await renderWallet();
            break;
        case 'settings':
            container.innerHTML = await renderSettings();
            break;
        default:
            container.innerHTML = await renderOverview();
    }
}

// ============================================
// OVERVIEW TAB
// ============================================
async function renderOverview() {
    // Simple overview without complex imports
    return `
        <div class="section-header">
            <h2>Welcome back, ${currentUser?.name || 'Student'}!</h2>
            <p>Track your progress and stay updated</p>
        </div>
        
        <div class="progress-section">
            <div class="progress-header">
                <div class="current-badge">
                    <div class="badge-icon">🎓</div>
                    <div class="badge-info">
                        <h4>Learning Progress</h4>
                        <p>Keep going to unlock achievements</p>
                    </div>
                </div>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: 45%; background: var(--brand-gold)"></div>
            </div>
            <div class="next-badge-info">
                <span>45% Complete</span>
                <span>Next: 50% → Silver Badge</span>
            </div>
        </div>
        
        <div class="notifications-section">
            <div class="notifications-header">
                <i class="fas fa-bell"></i>
                <h3>Notifications</h3>
            </div>
            <div class="notifications-list">
                <div class="notification-item unread">
                    <div class="notification-icon"><i class="fas fa-rocket"></i></div>
                    <div class="notification-content">
                        <div class="notification-title">Welcome to Gliimu!</div>
                        <div class="notification-message">Start your learning journey today.</div>
                        <div class="notification-time">Just now</div>
                    </div>
                </div>
                <div class="notification-item">
                    <div class="notification-icon"><i class="fas fa-graduation-cap"></i></div>
                    <div class="notification-content">
                        <div class="notification-title">New Course Available</div>
                        <div class="notification-message">Advanced Motion Graphics is now in the library.</div>
                        <div class="notification-time">Yesterday</div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="leaderboard-section">
            <div class="leaderboard-header">
                <i class="fas fa-trophy"></i>
                <h3>Top Performers</h3>
            </div>
            <div class="leaderboard-list">
                <div class="leaderboard-item"><div class="leaderboard-rank">#1</div><div class="leaderboard-info"><div class="leaderboard-name">Michael Chen</div></div><div class="leaderboard-score">98%</div></div>
                <div class="leaderboard-item"><div class="leaderboard-rank">#2</div><div class="leaderboard-info"><div class="leaderboard-name">Sarah Johnson</div></div><div class="leaderboard-score">95%</div></div>
                <div class="leaderboard-item"><div class="leaderboard-rank">#3</div><div class="leaderboard-info"><div class="leaderboard-name">David Okafor</div></div><div class="leaderboard-score">92%</div></div>
            </div>
        </div>
    `;
}

// ============================================
// PLACEHOLDER FUNCTIONS (to be implemented)
// ============================================
async function renderQuestionPlaceholder() {
    return `
        <div class="section-header">
            <h2><i class="fas fa-question-circle"></i> Questions</h2>
            <p>Test your knowledge and earn points</p>
        </div>
        <div class="empty-state">
            <i class="fas fa-check-circle"></i>
            <h3>Questions Coming Soon</h3>
            <p>Check back later for new challenges!</p>
        </div>
    `;
}

async function renderQuestionPullPlaceholder() {
    return `
        <div class="section-header">
            <h2><i class="fas fa-database"></i> Question Pull</h2>
            <p>Create and manage questions for students</p>
        </div>
        <div class="empty-state">
            <i class="fas fa-plus-circle"></i>
            <h3>Create Your First Question</h3>
            <p>Use the button below to start creating questions.</p>
            <button class="btn-primary" onclick="alert('Question creation coming soon')">Create Question</button>
        </div>
    `;
}

async function renderSubmitProjectPlaceholder() {
    return `
        <div class="section-header">
            <h2><i class="fas fa-file-alt"></i> Submit Project</h2>
            <p>Submit your project proposals for review</p>
        </div>
        <div class="empty-state">
            <i class="fas fa-paper-plane"></i>
            <h3>Submit a Project</h3>
            <p>Fill out the form below to submit your project.</p>
            <button class="btn-primary" onclick="alert('Project submission coming soon')">Submit Project</button>
        </div>
    `;
}

// ============================================
// GO TO MENU TAB
// ============================================
function renderGoToMenu() {
    return `
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
// WALLET TAB
// ============================================
async function renderWallet() {
    const balance = currentUser?.walletBalance || 0;
    
    return `
        <div class="section-header">
            <h2><i class="fas fa-wallet"></i> My Wallet</h2>
            <p>Manage your funds and transactions</p>
        </div>
        
        <div class="wallet-balance-card">
            <div class="wallet-balance-icon"><i class="fas fa-wallet"></i></div>
            <div class="wallet-balance-info">
                <span class="wallet-label">Available Balance</span>
                <span class="wallet-balance-large">₦${balance.toLocaleString()}</span>
            </div>
            <button id="addFundsBtn" class="btn-primary">Add Funds</button>
            <button id="withdrawFundsBtn" class="btn-outline">Withdraw</button>
        </div>
        
        <div class="transactions-section">
            <h3>Transaction History</h3>
            <div class="transactions-list">
                <div class="empty-state"><p>No transactions yet</p></div>
            </div>
        </div>
    `;
}

// ============================================
// SETTINGS TAB
// ============================================
async function renderSettings() {
    const isDark = document.body.classList.contains('dark-mode');
    
    return `
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
                <h3>Notification Preferences</h3>
                <form id="notificationPrefsForm">
                    <div class="form-group">
                        <label>Email for notifications</label>
                        <input type="email" id="notificationEmail" placeholder="Enter email for notifications" value="${currentUser?.email || ''}">
                    </div>
                    <div class="form-group">
                        <label>Phone for SMS alerts</label>
                        <input type="tel" id="notificationPhone" placeholder="Enter phone number for SMS" value="${currentUser?.phone || ''}">
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
        </div>
        
        <div class="settings-actions">
            <button class="btn-primary" id="saveSettingsBtn">Save Changes</button>
            <button id="logOutBtn" class="btn-danger">Log Out</button>
        </div>
    `;
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
    await loadTabData('overview');
    
    // Set up event listeners after DOM is ready
    setTimeout(() => {
        setupEventListeners();
    }, 100);
    
    console.log('Dashboard initialized successfully');
}

function setupEventListeners() {
    // Add Funds button
    const addFundsBtn = document.getElementById('addFundsBtn');
    if (addFundsBtn) {
        addFundsBtn.addEventListener('click', () => {
            showToast('Add funds feature coming soon. Please contact support.', 'info');
        });
    }
    
    // Withdraw button
    const withdrawBtn = document.getElementById('withdrawFundsBtn');
    if (withdrawBtn) {
        withdrawBtn.addEventListener('click', () => {
            showToast('Withdrawal requests coming soon.', 'info');
        });
    }
    
    // Save settings
    const saveBtn = document.getElementById('saveSettingsBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const newName = document.getElementById('fullNameInput')?.value;
            const newPhone = document.getElementById('phoneInput')?.value;
            const newAddress = document.getElementById('addressInput')?.value;
            
            if (newName && newName !== currentUser.name) {
                const { error } = await supabase.from('users').update({ name: newName }).eq('id', currentUser.id);
                if (!error) {
                    currentUser.name = newName;
                    localStorage.setItem('glimu_user', JSON.stringify(currentUser));
                    document.getElementById('userName').textContent = newName;
                    showToast('Settings saved!', 'success');
                }
            } else {
                showToast('No changes to save', 'info');
            }
        });
    }
    
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
    
    // Log out
    const logoutBtn = document.getElementById('logOutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to log out?')) {
                await supabase.auth.signOut();
                localStorage.clear();
                window.location.href = '/signin';
            }
        });
    }
    
    // Avatar upload
    const uploadBtn = document.getElementById('uploadAvatarBtn');
    const avatarInput = document.getElementById('avatarUpload');
    if (uploadBtn && avatarInput) {
        uploadBtn.addEventListener('click', () => avatarInput.click());
        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const avatarUrl = event.target.result;
                    const preview = document.getElementById('profilePreview');
                    if (preview) preview.src = avatarUrl;
                    
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
    }
}

// Start the dashboard
initDashboard();

// Make functions global for onclick handlers
window.switchTab = switchTab;
