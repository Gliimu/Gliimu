// dashboard.js - Unified Dashboard for All Roles

// ============================================
// USER DATA (Mock - Replace with API later)
// ============================================

const mockUsers = {
  student: {
    id: "stu_001",
    username: "john_doe",
    name: "John Doe",
    email: "john@example.com",
    role: "Student",
    track: "Media Track",
    avatar: "https://ui-avatars.com/api/?name=John+Doe&background=4f46e5&color=fff",
    walletBalance: 25000,
    enrolledCourses: 4,
    completedAssignments: 8,
    pendingAssignments: 3,
    attendance: 92
  },
  instructor: {
    id: "ins_001",
    username: "jane_smith",
    name: "Jane Smith",
    email: "jane@example.com",
    role: "Instructor",
    track: "Tech Track",
    avatar: "https://ui-avatars.com/api/?name=Jane+Smith&background=f59e0b&color=fff",
    walletBalance: 150000,
    totalStudents: 45,
    pendingGrading: 12,
    coursesTaught: 3
  },
  admin: {
    id: "adm_001",
    username: "admin",
    name: "Super Admin",
    email: "admin@gliimu.com",
    role: "Admin",
    avatar: "https://ui-avatars.com/api/?name=Super+Admin&background=2c2f78&color=fff"
  },
  others: {
    id: "oth_001",
    username: "partner_001",
    name: "Partner User",
    email: "partner@example.com",
    role: "Others",
    avatar: "https://ui-avatars.com/api/?name=Partner+User&background=8b5cf6&color=fff"
  }
};

// Mock data for different sections
const mockWalletTransactions = [
  { id: 1, description: "Tuition Payment", amount: 25000, type: "debit", date: "2025-03-01", status: "approved" },
  { id: 2, description: "Book Purchase", amount: 3500, type: "debit", date: "2025-03-05", status: "approved" },
  { id: 3, description: "Wallet Top-up", amount: 10000, type: "credit", date: "2025-02-28", status: "approved" }
];

const mockAssignments = [
  { id: 1, title: "Short Film Project", dueDate: "2025-03-20", status: "pending", grade: null },
  { id: 2, title: "Color Grading Exercise", dueDate: "2025-03-15", status: "submitted", grade: 85 },
  { id: 3, title: "UI/UX Design Challenge", dueDate: "2025-03-25", status: "pending", grade: null }
];

const mockPortfolio = [
  { id: 1, title: "Short Film: The Journey", image: "https://via.placeholder.com/300x180?text=Project+1", date: "2025-02-15" },
  { id: 2, title: "Brand Identity Design", image: "https://via.placeholder.com/300x180?text=Project+2", date: "2025-02-20" },
  { id: 3, title: "E-commerce Website", image: "https://via.placeholder.com/300x180?text=Project+3", date: "2025-02-25" }
];

const mockStudents = [
  { id: 1, name: "Alice Johnson", email: "alice@example.com", track: "Media", submissions: 5, completed: 4 },
  { id: 2, name: "Bob Williams", email: "bob@example.com", track: "Tech", submissions: 3, completed: 2 },
  { id: 3, name: "Carol Davis", email: "carol@example.com", track: "Design", submissions: 4, completed: 3 }
];

const mockSubmissions = [
  { id: 1, student: "Alice Johnson", assignment: "Short Film Project", submitted: "2025-03-10", status: "pending" },
  { id: 2, student: "Bob Williams", assignment: "JavaScript Assignment", submitted: "2025-03-12", status: "pending" }
];

const mockApplications = [
  { id: 1, name: "David Lee", email: "david@example.com", type: "Student", date: "2025-03-10", status: "pending" },
  { id: 2, name: "Emma Wilson", email: "emma@example.com", type: "Instructor", date: "2025-03-11", status: "pending" }
];

const mockPayments = [
  { id: 1, user: "John Doe", amount: 10000, date: "2025-03-10", reference: "REF123456", status: "pending" }
];

// ============================================
// ROLE-BASED TAB CONFIGURATION
// ============================================

const roleTabs = {
  Student: [
    { id: "dashboard", icon: "fas fa-th-large", label: "Dashboard" },
    { id: "my-courses", icon: "fas fa-book-open", label: "My Courses" },
    { id: "wallet", icon: "fas fa-wallet", label: "Wallet" },
    { id: "library", icon: "fas fa-book", label: "Library" },
    { id: "assignments", icon: "fas fa-tasks", label: "Assignments" },
    { id: "portfolio", icon: "fas fa-id-card", label: "Portfolio" },
    { id: "live-class", icon: "fas fa-chalkboard-teacher", label: "Live Class" },
    { id: "community", icon: "fas fa-comments", label: "Community" },
    { id: "settings", icon: "fas fa-cog", label: "Settings" }
  ],
  Instructor: [
    { id: "dashboard", icon: "fas fa-th-large", label: "Dashboard" },
    { id: "my-students", icon: "fas fa-user-graduate", label: "My Students" },
    { id: "submissions", icon: "fas fa-file-import", label: "Submissions" },
    { id: "create-assignment", icon: "fas fa-plus-circle", label: "Create Assignment" },
    { id: "live-class", icon: "fas fa-chalkboard-teacher", label: "Live Class" },
    { id: "wallet", icon: "fas fa-wallet", label: "Wallet" },
    { id: "community", icon: "fas fa-comments", label: "Community" },
    { id: "settings", icon: "fas fa-cog", label: "Settings" }
  ],
  Admin: [
    { id: "dashboard", icon: "fas fa-th-large", label: "Dashboard" },
    { id: "user-management", icon: "fas fa-users-cog", label: "User Management" },
    { id: "finance", icon: "fas fa-chart-line", label: "Finance" },
    { id: "content-hub", icon: "fas fa-newspaper", label: "Content Hub" },
    { id: "analytics", icon: "fas fa-chart-bar", label: "Analytics" },
    { id: "settings", icon: "fas fa-cog", label: "Settings" },
    { id: "support", icon: "fas fa-headset", label: "Support" }
  ],
  Others: [
    { id: "dashboard", icon: "fas fa-th-large", label: "Dashboard" },
    { id: "directory", icon: "fas fa-address-book", label: "Directory" },
    { id: "events", icon: "fas fa-calendar-alt", label: "Events" },
    { id: "contact", icon: "fas fa-envelope", label: "Contact" },
    { id: "settings", icon: "fas fa-cog", label: "Settings" }
  ]
};

// ============================================
// GLOBAL VARIABLES
// ============================================

let currentUser = null;
let currentTab = "dashboard";

// ============================================
// INITIALIZATION
// ============================================

function initDashboard() {
  // Get user from localStorage (or use mock for demo)
  const storedUser = localStorage.getItem('gliimu_user');
  
  if (storedUser) {
    currentUser = JSON.parse(storedUser);
  } else {
    // For demo, default to student
    currentUser = mockUsers.student;
    localStorage.setItem('gliimu_user', JSON.stringify(currentUser));
  }
  
  // Update UI with user info
  updateUserUI();
  
  // Render sidebar based on role
  renderSidebar();
  
  // Load dashboard content based on role
  loadDashboardContent();
  
  // Setup event listeners
  setupEventListeners();
  
  // Set current date
  setCurrentDate();
}

function updateUserUI() {
  document.getElementById('userNameSidebar').textContent = currentUser.name;
  document.getElementById('userRoleSidebar').textContent = currentUser.role;
  document.getElementById('userAvatarSidebar').src = currentUser.avatar;
  document.getElementById('pageTitle').textContent = `${currentUser.role} Dashboard`;
}

function renderSidebar() {
  const tabs = roleTabs[currentUser.role] || roleTabs.Others;
  const navMenu = document.getElementById('navMenu');
  const logoutBtn = document.getElementById('logoutBtn');
  
  navMenu.innerHTML = '';
  
  tabs.forEach(tab => {
    const navItem = document.createElement('div');
    navItem.className = `nav-item ${tab.id === currentTab ? 'active' : ''}`;
    navItem.setAttribute('data-tab', tab.id);
    navItem.innerHTML = `
      <i class="${tab.icon}"></i>
      <span>${tab.label}</span>
    `;
    navItem.addEventListener('click', () => switchTab(tab.id));
    navMenu.appendChild(navItem);
  });
  
  // Re-append logout button
  navMenu.appendChild(logoutBtn);
}

function switchTab(tabId) {
  currentTab = tabId;
  
  // Update active state in sidebar
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    }
  });
  
  // Hide all sections
  document.querySelectorAll('.dashboard-section').forEach(section => {
    section.classList.remove('active');
  });
  
  // Show selected section
  const targetSection = document.getElementById(`section-${tabId}`);
  if (targetSection) {
    targetSection.classList.add('active');
  }
  
  // Load section-specific data
  loadSectionData(tabId);
}

function loadSectionData(tabId) {
  switch(tabId) {
    case 'dashboard':
      loadDashboardStats();
      break;
    case 'wallet':
      loadWalletData();
      break;
    case 'assignments':
      loadAssignmentsData();
      break;
    case 'portfolio':
      loadPortfolioData();
      break;
    case 'my-students':
      loadStudentsData();
      break;
    case 'submissions':
      loadSubmissionsData();
      break;
    case 'user-management':
      loadUserManagementData();
      break;
    case 'finance':
      loadFinanceData();
      break;
  }
}

// ============================================
// DASHBOARD CONTENT LOADERS
// ============================================

function loadDashboardContent() {
  // Based on role, show different dashboard content
  const role = currentUser.role;
  const dashboardContent = document.getElementById('dashboard-content');
  
  if (role === 'Student') {
    renderStudentDashboard();
  } else if (role === 'Instructor') {
    renderInstructorDashboard();
  } else if (role === 'Admin') {
    renderAdminDashboard();
  } else {
    renderOthersDashboard();
  }
}

function renderStudentDashboard() {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-info">
          <h4>Enrolled Courses</h4>
          <h2>${currentUser.enrolledCourses || 4}</h2>
          <p>Active this semester</p>
        </div>
        <div class="stat-icon"><i class="fas fa-book-open"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h4>Completed</h4>
          <h2>${currentUser.completedAssignments || 8}</h2>
          <p>Assignments done</p>
        </div>
        <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h4>Pending</h4>
          <h2>${currentUser.pendingAssignments || 3}</h2>
          <p>Awaiting submission</p>
        </div>
        <div class="stat-icon"><i class="fas fa-clock"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h4>Attendance</h4>
          <h2>${currentUser.attendance || 92}%</h2>
          <p>This month</p>
        </div>
        <div class="stat-icon"><i class="fas fa-calendar-check"></i></div>
      </div>
    </div>
    
    <div class="cards-grid">
      <div class="dashboard-card" onclick="switchTab('live-class')">
        <div class="card-icon-large"><i class="fas fa-chalkboard-teacher"></i></div>
        <h3>Join Live Class</h3>
        <p>Enter the virtual classroom to attend lectures in real-time.</p>
        <div class="card-arrow"><i class="fas fa-arrow-right"></i></div>
      </div>
      
      <div class="dashboard-card" onclick="switchTab('wallet')">
        <div class="card-icon-large"><i class="fas fa-wallet"></i></div>
        <h3>Wallet Balance</h3>
        <p>₦${currentUser.walletBalance.toLocaleString()}</p>
        <div class="card-arrow"><i class="fas fa-arrow-right"></i></div>
      </div>
      
      <div class="dashboard-card" onclick="switchTab('assignments')">
        <div class="card-icon-large"><i class="fas fa-tasks"></i></div>
        <h3>Pending Assignments</h3>
        <p>${currentUser.pendingAssignments || 3} tasks waiting</p>
        <div class="card-arrow"><i class="fas fa-arrow-right"></i></div>
      </div>
    </div>
  `;
}

function renderInstructorDashboard() {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-info">
          <h4>Total Students</h4>
          <h2>${currentUser.totalStudents || 45}</h2>
          <p>Enrolled in your courses</p>
        </div>
        <div class="stat-icon"><i class="fas fa-users"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h4>Pending Grading</h4>
          <h2>${currentUser.pendingGrading || 12}</h2>
          <p>Submissions to review</p>
        </div>
        <div class="stat-icon"><i class="fas fa-file-alt"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h4>Courses</h4>
          <h2>${currentUser.coursesTaught || 3}</h2>
          <p>Active this semester</p>
        </div>
        <div class="stat-icon"><i class="fas fa-chalkboard"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h4>Earnings</h4>
          <h2>₦${currentUser.walletBalance.toLocaleString()}</h2>
          <p>This month</p>
        </div>
        <div class="stat-icon"><i class="fas fa-money-bill-wave"></i></div>
      </div>
    </div>
    
    <div class="cards-grid">
      <div class="dashboard-card" onclick="switchTab('live-class')">
        <div class="card-icon-large"><i class="fas fa-video"></i></div>
        <h3>Start Live Class</h3>
        <p>Begin a live session with your students.</p>
        <div class="card-arrow"><i class="fas fa-arrow-right"></i></div>
      </div>
      
      <div class="dashboard-card" onclick="switchTab('submissions')">
        <div class="card-icon-large"><i class="fas fa-file-import"></i></div>
        <h3>Grade Submissions</h3>
        <p>${currentUser.pendingGrading || 12} assignments pending</p>
        <div class="card-arrow"><i class="fas fa-arrow-right"></i></div>
      </div>
      
      <div class="dashboard-card" onclick="switchTab('create-assignment')">
        <div class="card-icon-large"><i class="fas fa-plus-circle"></i></div>
        <h3>Create Assignment</h3>
        <p>Post new tasks for students</p>
        <div class="card-arrow"><i class="fas fa-arrow-right"></i></div>
      </div>
    </div>
  `;
}

function renderAdminDashboard() {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-info">
          <h4>Total Users</h4>
          <h2>156</h2>
          <p>Students + Instructors</p>
        </div>
        <div class="stat-icon"><i class="fas fa-users"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h4>Pending Apps</h4>
          <h2>8</h2>
          <p>Awaiting review</p>
        </div>
        <div class="stat-icon"><i class="fas fa-file-alt"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h4>Revenue</h4>
          <h2>₦450K</h2>
          <p>This month</p>
        </div>
        <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h4>Active Today</h4>
          <h2>42</h2>
          <p>Users online</p>
        </div>
        <div class="stat-icon"><i class="fas fa-user-check"></i></div>
      </div>
    </div>
    
    <div class="cards-grid">
      <div class="dashboard-card" onclick="switchTab('user-management')">
        <div class="card-icon-large"><i class="fas fa-users-cog"></i></div>
        <h3>User Management</h3>
        <p>Review applications, manage users</p>
        <div class="card-arrow"><i class="fas fa-arrow-right"></i></div>
      </div>
      
      <div class="dashboard-card" onclick="switchTab('finance')">
        <div class="card-icon-large"><i class="fas fa-chart-line"></i></div>
        <h3>Finance Overview</h3>
        <p>Approve payments, view reports</p>
        <div class="card-arrow"><i class="fas fa-arrow-right"></i></div>
      </div>
      
      <div class="dashboard-card" onclick="switchTab('analytics')">
        <div class="card-icon-large"><i class="fas fa-chart-bar"></i></div>
        <h3>Analytics</h3>
        <p>View platform statistics</p>
        <div class="card-arrow"><i class="fas fa-arrow-right"></i></div>
      </div>
    </div>
  `;
}

function renderOthersDashboard() {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = `
    <div class="welcome-banner">
      <div>
        <h2>Welcome, ${currentUser.name}!</h2>
        <p>Thank you for being part of the Gliimu community.</p>
      </div>
      <div class="welcome-date">
        <h3 id="currentDateDisplay"></h3>
      </div>
    </div>
    
    <div class="cards-grid">
      <div class="dashboard-card" onclick="switchTab('directory')">
        <div class="card-icon-large"><i class="fas fa-address-book"></i></div>
        <h3>Directory</h3>
        <p>Find instructors and students</p>
        <div class="card-arrow"><i class="fas fa-arrow-right"></i></div>
      </div>
      
      <div class="dashboard-card" onclick="switchTab('events')">
        <div class="card-icon-large"><i class="fas fa-calendar-alt"></i></div>
        <h3>Upcoming Events</h3>
        <p>Workshops and webinars</p>
        <div class="card-arrow"><i class="fas fa-arrow-right"></i></div>
      </div>
      
      <div class="dashboard-card" onclick="switchTab('contact')">
        <div class="card-icon-large"><i class="fas fa-envelope"></i></div>
        <h3>Contact Support</h3>
        <p>Get help from our team</p>
        <div class="card-arrow"><i class="fas fa-arrow-right"></i></div>
      </div>
    </div>
  `;
}

// ============================================
// SECTION DATA LOADERS
// ============================================

function loadDashboardStats() {
  // Already handled by render functions above
}

function loadWalletData() {
  const container = document.getElementById('wallet-content');
  if (!container) return;
  
  container.innerHTML = `
    <div class="wallet-balance-card">
      <h4>Total Balance</h4>
      <h2>₦${currentUser.walletBalance.toLocaleString()}</h2>
      <div class="wallet-actions">
        <button class="wallet-btn" onclick="alert('Top-up coming soon')"><i class="fas fa-plus"></i> Top Up</button>
        <button class="wallet-btn" onclick="alert('Withdrawal coming soon')"><i class="fas fa-download"></i> Withdraw</button>
      </div>
    </div>
    
    <div class="dashboard-card" style="padding: 20px;">
      <h3 style="margin-bottom: 16px;">Recent Transactions</h3>
      <div class="transaction-list" id="transactionList"></div>
    </div>
  `;
  
  const transactionList = document.getElementById('transactionList');
  if (transactionList) {
    transactionList.innerHTML = mockWalletTransactions.map(t => `
      <div class="transaction-item">
        <div>
          <div class="transaction-desc">${t.description}</div>
          <div class="transaction-date">${t.date}</div>
        </div>
        <div class="transaction-amount ${t.type === 'credit' ? 'credit' : 'debit'}">
          ${t.type === 'credit' ? '+' : '-'}₦${t.amount.toLocaleString()}
        </div>
      </div>
    `).join('');
  }
}

function loadAssignmentsData() {
  const container = document.getElementById('assignments-content');
  if (!container) return;
  
  container.innerHTML = `
    <div class="table-container">
      <table>
        <thead>
          <tr><th>Assignment</th><th>Due Date</th><th>Status</th><th>Grade</th><th>Action</th></tr>
        </thead>
        <tbody id="assignmentsTableBody"></tbody>
      </table>
    </div>
  `;
  
  const tableBody = document.getElementById('assignmentsTableBody');
  if (tableBody) {
    tableBody.innerHTML = mockAssignments.map(a => `
      <tr>
        <td><strong>${a.title}</strong></td>
        <td>${a.dueDate}</td>
        <td><span class="badge ${a.status === 'submitted' ? 'badge-success' : 'badge-warning'}">${a.status}</span></td>
        <td>${a.grade ? a.grade + '%' : '-'}</td>
        <td><button class="btn-sm btn-outline" onclick="alert('Submit assignment')">Submit</button></td>
      </tr>
    `).join('');
  }
}

function loadPortfolioData() {
  const container = document.getElementById('portfolio-content');
  if (!container) return;
  
  container.innerHTML = `
    <div class="portfolio-grid" id="portfolioGrid"></div>
  `;
  
  const grid = document.getElementById('portfolioGrid');
  if (grid) {
    grid.innerHTML = mockPortfolio.map(p => `
      <div class="portfolio-item" onclick="alert('View project: ${p.title}')">
        <div class="portfolio-image" style="background-image: url('${p.image}')"></div>
        <div class="portfolio-info">
          <div class="portfolio-title">${p.title}</div>
          <div class="portfolio-date">${p.date}</div>
        </div>
      </div>
    `).join('');
  }
}

function loadStudentsData() {
  const container = document.getElementById('my-students-content');
  if (!container) return;
  
  container.innerHTML = `
    <div class="table-container">
      <table>
        <thead><tr><th>Student</th><th>Email</th><th>Track</th><th>Submissions</th><th>Completed</th><th>Action</th></tr></thead>
        <tbody id="studentsTableBody"></tbody>
      </table>
    </div>
  `;
  
  const tableBody = document.getElementById('studentsTableBody');
  if (tableBody) {
    tableBody.innerHTML = mockStudents.map(s => `
      <tr>
        <td><strong>${s.name}</strong></td>
        <td>${s.email}</td>
        <td><span class="badge badge-success">${s.track}</span></td>
        <td>${s.submissions}</td>
        <td>${s.completed}</td>
        <td><button class="btn-sm btn-outline">View</button></td>
      </tr>
    `).join('');
  }
}

function loadSubmissionsData() {
  const container = document.getElementById('submissions-content');
  if (!container) return;
  
  container.innerHTML = `
    <div class="table-container">
      <table>
        <thead><tr><th>Student</th><th>Assignment</th><th>Submitted</th><th>Status</th><th>Action</th></tr></thead>
        <tbody id="submissionsTableBody"></tbody>
      </table>
    </div>
  `;
  
  const tableBody = document.getElementById('submissionsTableBody');
  if (tableBody) {
    tableBody.innerHTML = mockSubmissions.map(s => `
      <tr>
        <td><strong>${s.student}</strong></td>
        <td>${s.assignment}</td>
        <td>${s.submitted}</td>
        <td><span class="badge badge-warning">${s.status}</span></td>
        <td><button class="btn-sm btn-outline">Grade</button></td>
      </tr>
    `).join('');
  }
}

function loadUserManagementData() {
  const container = document.getElementById('user-management-content');
  if (!container) return;
  
  container.innerHTML = `
    <div style="margin-bottom: 20px;">
      <button class="wallet-btn" style="background: var(--primary); color: white;" onclick="alert('Add user form')"><i class="fas fa-plus"></i> Add User</button>
    </div>
    <div class="table-container">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Type</th><th>Date</th><th>Status</th><th>Action</th></tr></thead>
        <tbody id="applicationsTableBody"></tbody>
      </table>
    </div>
  `;
  
  const tableBody = document.getElementById('applicationsTableBody');
  if (tableBody) {
    tableBody.innerHTML = mockApplications.map(a => `
      <tr>
        <td><strong>${a.name}</strong></td>
        <td>${a.email}</td>
        <td>${a.type}</td>
        <td>${a.date}</td>
        <td><span class="badge badge-warning">${a.status}</span></td>
        <td><button class="btn-sm btn-outline">Review</button></td>
      </tr>
    `).join('');
  }
}

function loadFinanceData() {
  const container = document.getElementById('finance-content');
  if (!container) return;
  
  container.innerHTML = `
    <div class="table-container">
      <table>
        <thead><tr><th>User</th><th>Amount</th><th>Date</th><th>Reference</th><th>Status</th><th>Action</th></tr></thead>
        <tbody id="paymentsTableBody"></tbody>
      </table>
    </div>
  `;
  
  const tableBody = document.getElementById('paymentsTableBody');
  if (tableBody) {
    tableBody.innerHTML = mockPayments.map(p => `
      <tr>
        <td>${p.user}</td>
        <td>₦${p.amount.toLocaleString()}</td>
        <td>${p.date}</td>
        <td><code>${p.reference}</code></td>
        <td><span class="badge badge-warning">${p.status}</span></td>
        <td><button class="btn-sm btn-outline">Approve</button></td>
      </tr>
    `).join('');
  }
}

// ============================================
// UTILITIES
// ============================================

function setCurrentDate() {
  const now = new Date();
  const dateEl = document.getElementById('currentDateDisplay');
  if (dateEl) {
    dateEl.innerHTML = `${now.getDate()} ${now.toLocaleString('default', { month: 'short' })} ${now.getFullYear()}`;
  }
}

function setupEventListeners() {
  // Mobile menu toggle
  const menuToggle = document.getElementById('mobileMenuToggle');
  const sidebar = document.getElementById('sidebar');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
  
  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 992 && sidebar && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    }
  });
  
  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('gliimu_user');
      window.location.href = 'index.html';
    });
  }
}

// ============================================
// EXPOSE FUNCTIONS GLOBALLY
// ============================================

window.switchTab = switchTab;
window.initDashboard = initDashboard;

// Start when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
});