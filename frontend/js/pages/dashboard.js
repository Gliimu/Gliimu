// ============================================
// GLIIMU DASHBOARD - COMPLETE
// Role-based, localStorage-synced, fully functional
// ============================================

// ============================================
// GLOBAL STATE
// ============================================

let currentUser = null;
let currentRole = 'student';
let currentTab = 'dashboard';
let allMaterials = [];

// Role-based tab configurations
const roleTabs = {
    student: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'courses', name: 'My Courses', icon: 'fas fa-book-open' },
        { id: 'assignments', name: 'Assignments', icon: 'fas fa-tasks' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'library', name: 'Library', icon: 'fas fa-book' },
        { id: 'portfolio', name: 'Portfolio', icon: 'fas fa-briefcase' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    instructor: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'students', name: 'My Students', icon: 'fas fa-users' },
        { id: 'submissions', name: 'Submissions', icon: 'fas fa-file-alt' },
        { id: 'create-assignment', name: 'Create Assignment', icon: 'fas fa-plus-circle' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    admin: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'users', name: 'User Management', icon: 'fas fa-users-cog' },
        { id: 'finance', name: 'Finance', icon: 'fas fa-chart-line' },
        { id: 'content', name: 'Content Hub', icon: 'fas fa-database' },
        { id: 'analytics', name: 'Analytics', icon: 'fas fa-chart-bar' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' },
        { id: 'support', name: 'Support', icon: 'fas fa-headset' }
    ],
    partner: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'projects', name: 'My Projects', icon: 'fas fa-project-diagram' },
        { id: 'submit', name: 'Submit Project', icon: 'fas fa-upload' },
        { id: 'invoices', name: 'Invoices', icon: 'fas fa-file-invoice' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    other: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'announcements', name: 'Announcements', icon: 'fas fa-bullhorn' },
        { id: 'support', name: 'Contact Support', icon: 'fas fa-envelope' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ]
};

// Mock data for different roles
const mockData = {
    student: {
        stats: {
            enrolledCourses: 4,
            completedAssignments: 8,
            pendingAssignments: 2,
            walletBalance: 25000
        },
        courses: [
            { id: 1, name: 'Video Production Mastery', progress: 75, instructor: 'John Doe' },
            { id: 2, name: 'UI/UX Design Fundamentals', progress: 45, instructor: 'Jane Smith' },
            { id: 3, name: 'JavaScript Complete Guide', progress: 30, instructor: 'Mike Johnson' }
        ],
        assignments: [
            { id: 1, title: 'Video Editing Project', dueDate: '2025-06-15', status: 'pending', grade: null },
            { id: 2, title: 'UI Mockup Design', dueDate: '2025-06-10', status: 'submitted', grade: 'A' },
            { id: 3, title: 'JavaScript Quiz', dueDate: '2025-06-05', status: 'graded', grade: 'B+' }
        ],
        transactions: [
            { id: 1, date: '2025-05-01', description: 'Subscription - Basic Plan', amount: -2500, status: 'completed' },
            { id: 2, date: '2025-04-15', description: 'Wallet Funding', amount: 10000, status: 'completed' }
        ]
    },
    instructor: {
        stats: {
            totalStudents: 45,
            pendingGrading: 12,
            coursesTaught: 3,
            earnings: 150000
        },
        students: [
            { id: 1, name: 'Alice Johnson', course: 'Video Production', submissions: 3, grade: 'A' },
            { id: 2, name: 'Bob Williams', course: 'UI/UX Design', submissions: 2, grade: 'B+' }
        ],
        submissions: [
            { id: 1, student: 'Alice Johnson', assignment: 'Video Project', submitted: '2025-06-01', status: 'pending' },
            { id: 2, student: 'Bob Williams', assignment: 'UI Mockup', submitted: '2025-05-30', status: 'graded' }
        ]
    },
    admin: {
        stats: {
            totalUsers: 342,
            pendingApplications: 15,
            monthlyRevenue: 1250000,
            activeStudents: 189
        }
    },
    partner: {
        stats: {
            activeProjects: 3,
            completedProjects: 7,
            pendingInvoices: 2,
            totalEarned: 450000
        }
    },
    other: {
        stats: {
            announcements: 5,
            unreadMessages: 3
        }
    }
};

// ============================================
// THEME HANDLING (Unified with header.js)
// ============================================

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const body = document.body;
    const sunIcon = document.querySelector('.theme-toggle .fa-sun');
    const moonIcon = document.querySelector('.theme-toggle .fa-moon');
    
    if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
        if (sunIcon && moonIcon) {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'inline-block';
        }
    } else {
        body.classList.remove('dark-mode');
        if (sunIcon && moonIcon) {
            sunIcon.style.display = 'inline-block';
            moonIcon.style.display = 'none';
        }
    }
}

function toggleTheme() {
    const body = document.body;
    const sunIcon = document.querySelector('.theme-toggle .fa-sun');
    const moonIcon = document.querySelector('.theme-toggle .fa-moon');
    
    body.classList.toggle('dark-mode');
    const isDark = body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    if (sunIcon && moonIcon) {
        if (isDark) {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'inline-block';
        } else {
            sunIcon.style.display = 'inline-block';
            moonIcon.style.display = 'none';
        }
    }
}

// ============================================
// USER DATA LOADING
// ============================================

function loadUserData() {
    const savedUser = localStorage.getItem('glimu_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        currentRole = currentUser.role?.toLowerCase() || 'student';
    } else {
        // Demo user for testing
        currentUser = {
            id: 'demo_001',
            name: 'Alex Creator',
            email: 'alex@example.com',
            role: 'student',
            plan: 'basic',
            avatar: 'https://ui-avatars.com/api/?name=Alex+Creator&background=fbb040&color=fff'
        };
        currentRole = 'student';
        localStorage.setItem('glimu_user', JSON.stringify(currentUser));
    }
    
    // Update UI with user info
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = currentUser.role || 'Student';
    const avatarImg = document.querySelector('.user-avatar img');
    if (avatarImg) {
        avatarImg.src = currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=fbb040&color=fff`;
    }
}

// ============================================
// SIDEBAR NAVIGATION
// ============================================

function buildSidebar() {
    const tabs = roleTabs[currentRole] || roleTabs.other;
    const sidebarNav = document.getElementById('sidebarNav');
    
    sidebarNav.innerHTML = tabs.map(tab => `
        <div class="nav-item ${currentTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
            <i class="${tab.icon}"></i>
            <span>${tab.name}</span>
        </div>
    `).join('');
    
    // Add event listeners
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    currentTab = tabId;
    
    // Update active state in sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
        const itemTab = item.getAttribute('data-tab');
        if (itemTab === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Hide all sections and show selected
    document.querySelectorAll('.dashboard-section').forEach(section => {
        section.classList.remove('active');
    });
    
    const activeSection = document.getElementById(`${tabId}-section`);
    if (activeSection) {
        activeSection.classList.add('active');
    }
    
    // Load data for the tab
    loadTabData(tabId);
}

// ============================================
// TAB DATA LOADING
// ============================================

function loadTabData(tabId) {
    switch(tabId) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'courses':
            renderCourses();
            break;
        case 'assignments':
            renderAssignments();
            break;
        case 'wallet':
            renderWallet();
            break;
        case 'library':
            renderLibraryTab();
            break;
        case 'portfolio':
            renderPortfolio();
            break;
        case 'students':
            renderStudents();
            break;
        case 'submissions':
            renderSubmissions();
            break;
        case 'create-assignment':
            renderCreateAssignment();
            break;
        case 'settings':
            renderSettings();
            break;
        default:
            renderDashboard();
    }
}

// ============================================
// RENDER FUNCTIONS
// ============================================

function renderDashboard() {
    const data = mockData[currentRole] || mockData.student;
    const stats = data.stats;
    
    const container = document.getElementById('dashboard-section');
    if (!container) return;
    
    let statsHtml = '';
    if (currentRole === 'student') {
        statsHtml = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-book-open"></i></div>
                    <div class="stat-info">
                        <h3>Enrolled Courses</h3>
                        <div class="stat-value">${stats.enrolledCourses}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                    <div class="stat-info">
                        <h3>Completed Assignments</h3>
                        <div class="stat-value">${stats.completedAssignments}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-clock"></i></div>
                    <div class="stat-info">
                        <h3>Pending Assignments</h3>
                        <div class="stat-value">${stats.pendingAssignments}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-wallet"></i></div>
                    <div class="stat-info">
                        <h3>Wallet Balance</h3>
                        <div class="stat-value">₦${stats.walletBalance.toLocaleString()}</div>
                        <button class="add-funds-small" id="quickAddFunds">Add Funds</button>
                    </div>
                </div>
            </div>
            <div class="action-cards">
                <div class="action-card" onclick="window.location.href='/library.html'">
                    <i class="fas fa-book"></i>
                    <h4>Go to Library</h4>
                    <p>Access your books and bundles</p>
                </div>
                <div class="action-card" onclick="window.location.href='/virtualroom.html'">
                    <i class="fas fa-video"></i>
                    <h4>Live Class</h4>
                    <p>Join your next session</p>
                </div>
                <div class="action-card" id="viewSubscriptionsBtn">
                    <i class="fas fa-crown"></i>
                    <h4>Subscription</h4>
                    <p>Manage your plan</p>
                </div>
            </div>
            <div class="data-table">
                <h3 style="padding: 1rem; margin: 0;">Recent Assignments</h3>
                <table>
                    <thead>
                        <tr><th>Title</th><th>Due Date</th><th>Status</th><th>Grade</th></tr>
                    </thead>
                    <tbody>
                        ${data.assignments?.map(a => `
                            <tr>
                                <td>${a.title}</td>
                                <td>${a.dueDate}</td>
                                <td><span class="status-badge ${a.status === 'pending' ? 'status-pending' : 'status-completed'}">${a.status}</span></td>
                                <td>${a.grade || '-'}</td>
                            </tr>
                        `).join('') || '<tr><td colspan="4">No assignments found</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    } else if (currentRole === 'instructor') {
        statsHtml = `
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-users"></i></div><div class="stat-info"><h3>Total Students</h3><div class="stat-value">${stats.totalStudents}</div></div></div>
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-file-alt"></i></div><div class="stat-info"><h3>Pending Grading</h3><div class="stat-value">${stats.pendingGrading}</div></div></div>
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-chalkboard"></i></div><div class="stat-info"><h3>Courses Taught</h3><div class="stat-value">${stats.coursesTaught}</div></div></div>
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-money-bill"></i></div><div class="stat-info"><h3>Earnings</h3><div class="stat-value">₦${stats.earnings.toLocaleString()}</div></div></div>
            </div>
        `;
    } else {
        statsHtml = `<div class="stats-grid"><div class="stat-card"><div class="stat-info"><h3>Welcome to your Dashboard</h3><div class="stat-value">Role: ${currentRole}</div></div></div></div>`;
    }
    
    container.innerHTML = `
        <div class="section-header">
            <div><h2>Dashboard</h2><p>Welcome back, ${currentUser.name}!</p></div>
        </div>
        ${statsHtml}
    `;
    
    const quickAddFunds = document.getElementById('quickAddFunds');
    if (quickAddFunds) {
        quickAddFunds.addEventListener('click', () => openModal('addFundsModal'));
    }
    const viewSubscriptionsBtn = document.getElementById('viewSubscriptionsBtn');
    if (viewSubscriptionsBtn) {
        viewSubscriptionsBtn.addEventListener('click', () => openModal('upgradeModal'));
    }
}

function renderCourses() {
    const data = mockData.student;
    const container = document.getElementById('courses-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <div><h2>My Courses</h2><p>Track your progress in enrolled courses</p></div>
        </div>
        <div class="stats-grid">
            ${data.courses.map(course => `
                <div class="stat-card">
                    <div class="stat-info">
                        <h3>${course.name}</h3>
                        <div class="stat-value">${course.progress}% Complete</div>
                        <div class="progress-bar" style="margin-top: 0.5rem;"><div style="width: ${course.progress}%; height: 4px; background: var(--brand-gold); border-radius: 2px;"></div></div>
                        <div class="stat-sub">Instructor: ${course.instructor}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderAssignments() {
    const data = mockData.student;
    const container = document.getElementById('assignments-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <div><h2>Assignments</h2><p>Track your homework and submissions</p></div>
        </div>
        <div class="data-table">
            <table>
                <thead><tr><th>Title</th><th>Due Date</th><th>Status</th><th>Grade</th><th>Action</th></tr></thead>
                <tbody>
                    ${data.assignments.map(a => `
                        <tr>
                            <td>${a.title}</td>
                            <td>${a.dueDate}</td>
                            <td><span class="status-badge ${a.status === 'pending' ? 'status-pending' : a.status === 'submitted' ? 'status-pending' : 'status-completed'}">${a.status}</span></td>
                            <td>${a.grade || '-'}</td>
                            <td>${a.status === 'pending' ? '<button class="submit-btn" onclick="alert(\'Submit assignment\')">Submit</button>' : '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderWallet() {
    const data = mockData.student;
    const container = document.getElementById('wallet-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <div><h2>Wallet</h2><p>Manage your funds and subscriptions</p></div>
            <button class="btn-primary" id="addFundsWalletBtn">Add Funds</button>
        </div>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-wallet"></i></div>
                <div class="stat-info">
                    <h3>Current Balance</h3>
                    <div class="stat-value">₦${data.stats.walletBalance.toLocaleString()}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-crown"></i></div>
                <div class="stat-info">
                    <h3>Current Plan</h3>
                    <div class="stat-value">${currentUser.plan?.toUpperCase() || 'Basic'}</div>
                    <button class="upgrade-plan-btn" id="upgradePlanBtn">Upgrade</button>
                </div>
            </div>
        </div>
        <div class="data-table">
            <h3 style="padding: 1rem; margin: 0;">Transaction History</h3>
            <table>
                <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>
                    ${data.transactions.map(t => `
                        <tr>
                            <td>${t.date}</td>
                            <td>${t.description}</td>
                            <td style="color: ${t.amount < 0 ? '#ef4444' : '#10b981'}">${t.amount < 0 ? '-' : '+'}₦${Math.abs(t.amount).toLocaleString()}</td>
                            <td><span class="status-badge status-completed">${t.status}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    document.getElementById('addFundsWalletBtn')?.addEventListener('click', () => openModal('addFundsModal'));
    document.getElementById('upgradePlanBtn')?.addEventListener('click', () => openModal('upgradeModal'));
}

async function renderLibraryTab() {
    const container = document.getElementById('library-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading your library...</div>';
    
    try {
        // Fetch materials
        let response = await fetch('../../backend/data/library.json');
        if (!response.ok) response = await fetch('../backend/data/library.json');
        if (!response.ok) response = await fetch('/backend/data/library.json');
        if (!response.ok) response = await fetch('https://raw.githubusercontent.com/Gliimu/Gliimu/main/backend/data/library.json');
        
        const data = await response.json();
        allMaterials = data.materials || [];
        
        const savedItems = JSON.parse(localStorage.getItem('savedLibraryItems') || '[]');
        const savedMaterials = allMaterials.filter(m => savedItems.includes(m.id));
        
        container.innerHTML = `
            <div class="section-header">
                <div><h2>My Library</h2><p>Your saved books and bundles</p></div>
                <button class="btn-primary" onclick="window.location.href='/library.html'">Browse Library</button>
            </div>
            ${savedMaterials.length === 0 ? `
                <div class="empty-state">
                    <i class="fas fa-book-open"></i>
                    <h3>Your shelf is empty</h3>
                    <p>Start saving books and bundles to see them here</p>
                    <button class="btn-primary" onclick="window.location.href='/library.html'">Explore Library</button>
                </div>
            ` : `
                <div class="library-grid">
                    ${savedMaterials.map(item => `
                        <div class="library-item" data-id="${item.id}">
                            <div class="library-item-cover" style="background-image: url('${item.image}'); background-size: cover;"></div>
                            <div class="library-item-info">
                                <div class="library-item-title">${escapeHtml(item.title)}</div>
                                <div class="library-item-type">${item.type === 'book' ? '📖 Book' : '📦 Bundle'}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `}
        `;
        
        document.querySelectorAll('.library-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.getAttribute('data-id');
                const material = allMaterials.find(m => m.id === id);
                if (material) openViewModal(material);
            });
        });
    } catch (error) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Failed to load library</h3></div>';
    }
}

function renderPortfolio() {
    const container = document.getElementById('portfolio-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <div><h2>My Portfolio</h2><p>Showcase your best work</p></div>
            <button class="btn-primary" id="addPortfolioBtn">Add Project</button>
        </div>
        <div class="library-grid">
            <div class="empty-state" style="grid-column: 1/-1;">
                <i class="fas fa-briefcase"></i>
                <h3>No projects yet</h3>
                <p>Upload your first project to build your portfolio</p>
            </div>
        </div>
    `;
}

function renderStudents() {
    const data = mockData.instructor;
    const container = document.getElementById('students-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header"><div><h2>My Students</h2><p>Track your student progress</p></div></div>
        <div class="data-table">
            <table><thead><tr><th>Name</th><th>Course</th><th>Submissions</th><th>Average Grade</th></tr></thead>
            <tbody>${data.students.map(s => `<tr><td>${s.name}</td><td>${s.course}</td><td>${s.submissions}</td><td>${s.grade}</td></tr>`).join('')}</tbody>
            </table>
        </div>
    `;
}

function renderSubmissions() {
    const data = mockData.instructor;
    const container = document.getElementById('submissions-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header"><div><h2>Pending Submissions</h2><p>Grade student work</p></div></div>
        <div class="data-table">
            <table><thead><tr><th>Student</th><th>Assignment</th><th>Submitted</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>${data.submissions.map(s => `<tr><td>${s.student}</td><td>${s.assignment}</td><td>${s.submitted}</td><td><span class="status-badge status-pending">${s.status}</span></td><td><button class="grade-btn" onclick="alert('Grade submission')">Grade</button></td></tr>`).join('')}</tbody>
            </table>
        </div>
    `;
}

function renderCreateAssignment() {
    const container = document.getElementById('create-assignment-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header"><div><h2>Create Assignment</h2><p>Post new homework for students</p></div></div>
        <div class="data-table" style="padding: 1.5rem;">
            <form id="createAssignmentForm">
                <div class="form-group"><label>Title</label><input type="text" required></div>
                <div class="form-group"><label>Description</label><textarea required></textarea></div>
                <div class="form-group"><label>Due Date</label><input type="date" required></div>
                <div class="form-group"><label>Course</label><select><option>Video Production</option><option>UI/UX Design</option><option>JavaScript</option></select></div>
                <button type="submit" class="btn-primary">Create Assignment</button>
            </form>
        </div>
    `;
}

function renderSettings() {
    const container = document.getElementById('settings-section');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header"><div><h2>Settings</h2><p>Manage your account preferences</p></div></div>
        <div class="data-table" style="padding: 1.5rem;">
            <form id="settingsForm">
                <div class="form-group"><label>Full Name</label><input type="text" value="${currentUser.name}"></div>
                <div class="form-group"><label>Email</label><input type="email" value="${currentUser.email}"></div>
                <div class="form-group"><label>Password</label><input type="password" placeholder="Leave blank to keep current"></div>
                <button type="submit" class="btn-primary">Save Changes</button>
            </form>
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

function openViewModal(item) {
    const modal = document.getElementById('viewBookModal');
    document.getElementById('viewBookTitle').textContent = item.title;
    document.getElementById('viewBookImage').src = item.image;
    document.getElementById('viewBookDescription').textContent = item.description || 'No description available.';
    
    const readBtn = document.getElementById('readBookBtn');
    readBtn.onclick = () => {
        window.location.href = `/library.html?id=${item.id}`;
    };
    
    modal.classList.add('active');
}

// ============================================
// MODAL EVENT LISTENERS
// ============================================

function setupModals() {
    const modals = ['upgradeModal', 'addFundsModal', 'viewBookModal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        const closeBtn = document.getElementById(`close${modalId.charAt(0).toUpperCase() + modalId.slice(1)}`);
        if (closeBtn) {
            closeBtn.onclick = closeModal;
        }
        if (modal) {
            modal.onclick = (e) => {
                if (e.target === modal) closeModal();
            };
        }
    });
    
    // Plan selection
    document.querySelectorAll('.select-plan-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const planCard = btn.closest('.plan-card');
            const plan = planCard.getAttribute('data-plan');
            alert(`Upgrading to ${plan.toUpperCase()} plan. Payment will be processed.`);
            closeModal();
        });
    });
    
    // Amount buttons
    document.querySelectorAll('.amount-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const customInput = document.getElementById('customAmount');
            if (customInput) customInput.value = '';
        });
    });
    
    // Confirm payment
    const confirmBtn = document.getElementById('confirmPayment');
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            const activeBtn = document.querySelector('.amount-btn.active');
            const customAmount = document.getElementById('customAmount')?.value;
            let amount = 0;
            
            if (activeBtn) {
                amount = parseInt(activeBtn.getAttribute('data-amount'));
            } else if (customAmount) {
                amount = parseInt(customAmount);
            }
            
            if (amount > 0) {
                alert(`₦${amount.toLocaleString()} added to your wallet!`);
                closeModal();
                setTimeout(() => renderWallet(), 500);
            } else {
                alert('Please select or enter an amount');
            }
        };
    }
    
    const closeViewBookFooter = document.getElementById('closeViewBookFooterBtn');
    if (closeViewBookFooter) {
        closeViewBookFooter.onclick = closeModal;
    }
}

// ============================================
// MOBILE SIDEBAR
// ============================================

function setupMobileSidebar() {
    const toggleBtn = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('dashboardSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            overlay.classList.toggle('active');
        });
    }
    
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
        });
    }
}

// ============================================
// INITIALIZE DASHBOARD
// ============================================

function createContentSections() {
    const dashboardContent = document.getElementById('dashboardContent');
    const tabs = roleTabs[currentRole] || roleTabs.other;
    
    dashboardContent.innerHTML = tabs.map(tab => `
        <div id="${tab.id}-section" class="dashboard-section ${tab.id === 'dashboard' ? 'active' : ''}">
            <!-- Content will be loaded dynamically -->
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
    loadUserData();
    initTheme();
    createContentSections();
    buildSidebar();
    setupModals();
    setupMobileSidebar();
    
    // Load initial tab data
    await renderDashboard();
    
    const themeToggleBtn = document.getElementById('themeToggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }
});

// Make functions global for onclick handlers
window.openModal = openModal;
window.closeModal = closeModal;
window.renderWallet = renderWallet;
