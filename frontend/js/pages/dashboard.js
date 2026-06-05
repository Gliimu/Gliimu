// dashboard.js - Role-based dashboard

let currentUser = null;
let currentTab = 'dashboard';

// ============================================
// ROLE-BASED TAB CONFIGURATION
// ============================================

const roleTabs = {
  Student: [
    { id: 'dashboard', icon: 'fas fa-th-large', label: 'Dashboard' },
    { id: 'courses', icon: 'fas fa-book-open', label: 'My Courses' },
    { id: 'assignments', icon: 'fas fa-tasks', label: 'Assignments' },
    { id: 'wallet', icon: 'fas fa-wallet', label: 'Wallet' },
    { id: 'library', icon: 'fas fa-book', label: 'Library' },
    { id: 'portfolio', icon: 'fas fa-id-card', label: 'Portfolio' },
    { id: 'settings', icon: 'fas fa-cog', label: 'Settings' }
  ],
  Partner: [
    { id: 'dashboard', icon: 'fas fa-th-large', label: 'Dashboard' },
    { id: 'projects', icon: 'fas fa-briefcase', label: 'My Projects' },
    { id: 'submit-project', icon: 'fas fa-plus-circle', label: 'Submit Project' },
    { id: 'invoices', icon: 'fas fa-file-invoice', label: 'Invoices' },
    { id: 'settings', icon: 'fas fa-cog', label: 'Settings' }
  ],
  Instructor: [
    { id: 'dashboard', icon: 'fas fa-th-large', label: 'Dashboard' },
    { id: 'students', icon: 'fas fa-users', label: 'My Students' },
    { id: 'submissions', icon: 'fas fa-file-import', label: 'Submissions' },
    { id: 'create-assignment', icon: 'fas fa-plus-circle', label: 'Create' },
    { id: 'wallet', icon: 'fas fa-wallet', label: 'Wallet' },
    { id: 'settings', icon: 'fas fa-cog', label: 'Settings' }
  ],
  Other: [
    { id: 'dashboard', icon: 'fas fa-th-large', label: 'Dashboard' },
    { id: 'announcements', icon: 'fas fa-bullhorn', label: 'Announcements' },
    { id: 'contact', icon: 'fas fa-envelope', label: 'Contact Support' },
    { id: 'settings', icon: 'fas fa-cog', label: 'Settings' }
  ]
};

// ============================================
// MOCK DATA
// ============================================

const mockData = {
  Student: {
    stats: { enrolledCourses: 4, completedAssignments: 8, pendingAssignments: 3, walletBalance: 25000 },
    assignments: [
      { title: 'Short Film Project', dueDate: '2025-03-20', status: 'pending', grade: null },
      { title: 'Color Grading Exercise', dueDate: '2025-03-15', status: 'submitted', grade: 85 },
      { title: 'UI/UX Design Challenge', dueDate: '2025-03-25', status: 'pending', grade: null }
    ],
    transactions: [
      { id: 1, description: 'Tuition Payment', amount: 25000, type: 'debit', date: '2025-03-01', status: 'approved' },
      { id: 2, description: 'Book Purchase', amount: 3500, type: 'debit', date: '2025-03-05', status: 'approved' }
    ]
  },
  Instructor: {
    stats: { totalStudents: 12, pendingGrading: 5, coursesTaught: 2, earnings: 150000 },
    submissions: [
      { student: 'John Doe', assignment: 'Short Film', submitted: '2025-03-10', status: 'pending' },
      { student: 'Jane Smith', assignment: 'UI Design', submitted: '2025-03-12', status: 'pending' }
    ]
  },
  Partner: {
    stats: { activeProjects: 2, completedProjects: 5, pendingInvoices: 1 },
    projects: [
      { name: 'Website Development', status: 'in-progress', budget: 250000, deadline: '2025-04-15' },
      { name: 'Brand Identity', status: 'completed', budget: 150000, deadline: '2025-02-28' }
    ]
  },
  Other: {
    stats: { announcements: 3, supportTickets: 1 },
    announcements: [
      { title: 'New Campus Opening', date: '2025-03-01', content: 'We are expanding to Lagos!' },
      { title: 'Scholarship Available', date: '2025-02-15', content: 'Apply for early bird discount' }
    ]
  }
};

// ============================================
// INITIALIZATION
// ============================================

function initDashboard() {
  // Get logged-in user
  const storedUser = localStorage.getItem('gliimu_user');
  
  if (!storedUser) {
    window.location.href = 'index.html';
    return;
  }
  
  currentUser = JSON.parse(storedUser);
  
  // Ensure user has a role (default to Student if missing)
  if (!currentUser.role) {
    currentUser.role = 'Student';
  }
  
  // Update UI with user info
  document.getElementById('userName').textContent = currentUser.name || currentUser.username;
  document.getElementById('userAvatar').src = currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name || currentUser.username)}&background=random&color=fff`;
  
  // Render sidebar tabs based on role
  renderSidebar();
  
  // Load dashboard content
  loadDashboardContent();
}

function renderSidebar() {
  const tabs = roleTabs[currentUser.role] || roleTabs.Other;
  const sidebarNav = document.getElementById('sidebarNav');
  
  sidebarNav.innerHTML = tabs.map(tab => `
    <div class="nav-item ${tab.id === currentTab ? 'active' : ''}" data-tab="${tab.id}">
      <i class="${tab.icon}"></i>
      <span>${tab.label}</span>
    </div>
  `).join('');
  
  // Add event listeners to nav items
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
    item.classList.remove('active');
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    }
  });
  
  // Load content for the selected tab
  loadTabContent(tabId);
}

function loadTabContent(tabId) {
  const mainContent = document.getElementById('dashboardContent');
  
  switch (tabId) {
    case 'dashboard':
      mainContent.innerHTML = renderDashboard();
      break;
    case 'courses':
      mainContent.innerHTML = renderCourses();
      break;
    case 'assignments':
      mainContent.innerHTML = renderAssignments();
      break;
    case 'wallet':
      mainContent.innerHTML = renderWallet();
      break;
    case 'library':
      mainContent.innerHTML = renderLibrary();
      break;
    case 'portfolio':
      mainContent.innerHTML = renderPortfolio();
      break;
    case 'settings':
      mainContent.innerHTML = renderSettings();
      break;
    case 'students':
      mainContent.innerHTML = renderStudents();
      break;
    case 'submissions':
      mainContent.innerHTML = renderSubmissions();
      break;
    case 'create-assignment':
      mainContent.innerHTML = renderCreateAssignment();
      break;
    case 'projects':
      mainContent.innerHTML = renderProjects();
      break;
    case 'submit-project':
      mainContent.innerHTML = renderSubmitProject();
      break;
    case 'invoices':
      mainContent.innerHTML = renderInvoices();
      break;
    case 'announcements':
      mainContent.innerHTML = renderAnnouncements();
      break;
    case 'contact':
      mainContent.innerHTML = renderContact();
      break;
    default:
      mainContent.innerHTML = renderDashboard();
  }
}

// ============================================
// DASHBOARD CONTENT RENDERERS
// ============================================

function loadDashboardContent() {
  const mainContent = document.getElementById('dashboardContent');
  mainContent.innerHTML = renderDashboard();
}

function renderDashboard() {
  const data = mockData[currentUser.role] || mockData.Other;
  const isStudent = currentUser.role === 'Student';
  const isInstructor = currentUser.role === 'Instructor';
  const isPartner = currentUser.role === 'Partner';
  
  let statsHtml = '';
  let actionCardsHtml = '';
  
  if (isStudent) {
    statsHtml = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-info"><h4>Enrolled Courses</h4><div class="stat-number">${data.stats.enrolledCourses}</div><div class="stat-label">Active this semester</div></div><div class="stat-icon"><i class="fas fa-book-open"></i></div></div>
        <div class="stat-card"><div class="stat-info"><h4>Completed</h4><div class="stat-number">${data.stats.completedAssignments}</div><div class="stat-label">Assignments done</div></div><div class="stat-icon"><i class="fas fa-check-circle"></i></div></div>
        <div class="stat-card"><div class="stat-info"><h4>Pending</h4><div class="stat-number">${data.stats.pendingAssignments}</div><div class="stat-label">Awaiting submission</div></div><div class="stat-icon"><i class="fas fa-clock"></i></div></div>
        <div class="stat-card"><div class="stat-info"><h4>Wallet</h4><div class="stat-number">₦${data.stats.walletBalance.toLocaleString()}</div><div class="stat-label">Available balance</div></div><div class="stat-icon"><i class="fas fa-wallet"></i></div></div>
      </div>
      <div class="cards-grid">
        <div class="action-card" onclick="switchTab('courses')"><div class="action-icon"><i class="fas fa-book-open"></i></div><div class="action-info"><h3>My Courses</h3><p>Continue your learning journey</p></div></div>
        <div class="action-card" onclick="switchTab('assignments')"><div class="action-icon"><i class="fas fa-tasks"></i></div><div class="action-info"><h3>Assignments</h3><p>${data.stats.pendingAssignments} pending submissions</p></div></div>
        <div class="action-card" onclick="switchTab('wallet')"><div class="action-icon"><i class="fas fa-wallet"></i></div><div class="action-info"><h3>Wallet</h3><p>₦${data.stats.walletBalance.toLocaleString()} balance</p></div></div>
      </div>
    `;
  } else if (isInstructor) {
    statsHtml = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-info"><h4>Total Students</h4><div class="stat-number">${data.stats.totalStudents}</div><div class="stat-label">Enrolled</div></div><div class="stat-icon"><i class="fas fa-users"></i></div></div>
        <div class="stat-card"><div class="stat-info"><h4>Pending Grading</h4><div class="stat-number">${data.stats.pendingGrading}</div><div class="stat-label">Submissions to review</div></div><div class="stat-icon"><i class="fas fa-file-alt"></i></div></div>
        <div class="stat-card"><div class="stat-info"><h4>Courses</h4><div class="stat-number">${data.stats.coursesTaught}</div><div class="stat-label">Active</div></div><div class="stat-icon"><i class="fas fa-chalkboard"></i></div></div>
        <div class="stat-card"><div class="stat-info"><h4>Earnings</h4><div class="stat-number">₦${data.stats.earnings.toLocaleString()}</div><div class="stat-label">This month</div></div><div class="stat-icon"><i class="fas fa-money-bill-wave"></i></div></div>
      </div>
      <div class="cards-grid">
        <div class="action-card" onclick="switchTab('students')"><div class="action-icon"><i class="fas fa-users"></i></div><div class="action-info"><h3>My Students</h3><p>Manage your class</p></div></div>
        <div class="action-card" onclick="switchTab('submissions')"><div class="action-icon"><i class="fas fa-file-import"></i></div><div class="action-info"><h3>Grade Submissions</h3><p>${data.stats.pendingGrading} pending</p></div></div>
        <div class="action-card" onclick="switchTab('create-assignment')"><div class="action-icon"><i class="fas fa-plus-circle"></i></div><div class="action-info"><h3>Create Assignment</h3><p>Post new tasks</p></div></div>
      </div>
    `;
  } else if (isPartner) {
    statsHtml = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-info"><h4>Active Projects</h4><div class="stat-number">${data.stats.activeProjects}</div><div class="stat-label">In progress</div></div><div class="stat-icon"><i class="fas fa-spinner"></i></div></div>
        <div class="stat-card"><div class="stat-info"><h4>Completed</h4><div class="stat-number">${data.stats.completedProjects}</div><div class="stat-label">Delivered</div></div><div class="stat-icon"><i class="fas fa-check-circle"></i></div></div>
        <div class="stat-card"><div class="stat-info"><h4>Pending Invoices</h4><div class="stat-number">${data.stats.pendingInvoices}</div><div class="stat-label">Awaiting payment</div></div><div class="stat-icon"><i class="fas fa-file-invoice"></i></div></div>
      </div>
      <div class="cards-grid">
        <div class="action-card" onclick="switchTab('projects')"><div class="action-icon"><i class="fas fa-briefcase"></i></div><div class="action-info"><h3>My Projects</h3><p>Track your work</p></div></div>
        <div class="action-card" onclick="switchTab('submit-project')"><div class="action-icon"><i class="fas fa-plus-circle"></i></div><div class="action-info"><h3>Submit Project</h3><p>Send new project brief</p></div></div>
      </div>
    `;
  } else {
    statsHtml = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-info"><h4>Announcements</h4><div class="stat-number">${data.stats.announcements}</div><div class="stat-label">New updates</div></div><div class="stat-icon"><i class="fas fa-bullhorn"></i></div></div>
        <div class="stat-card"><div class="stat-info"><h4>Support Tickets</h4><div class="stat-number">${data.stats.supportTickets}</div><div class="stat-label">Open requests</div></div><div class="stat-icon"><i class="fas fa-headset"></i></div></div>
      </div>
      <div class="cards-grid">
        <div class="action-card" onclick="switchTab('announcements')"><div class="action-icon"><i class="fas fa-bullhorn"></i></div><div class="action-info"><h3>Announcements</h3><p>Latest updates</p></div></div>
        <div class="action-card" onclick="switchTab('contact')"><div class="action-icon"><i class="fas fa-envelope"></i></div><div class="action-info"><h3>Contact Support</h3><p>Get help</p></div></div>
      </div>
    `;
  }
  
  const now = new Date();
  const day = now.getDate();
  const month = now.toLocaleString('default', { month: 'long' });
  
  return `
    <div class="welcome-card">
      <div class="welcome-text">
        <h2>Welcome back, ${currentUser.name || currentUser.username}!</h2>
        <p>Here's what's happening with your ${currentUser.role === 'Student' ? 'learning' : currentUser.role === 'Instructor' ? 'teaching' : 'account'} today.</p>
      </div>
      <div class="welcome-date">
        <div class="day">${day}</div>
        <div class="month">${month}</div>
      </div>
    </div>
    ${statsHtml}
  `;
}

function renderCourses() {
  return `<div class="table-container"><table><thead><tr><th>Course</th><th>Progress</th><th>Instructor</th><th>Next Session</th></tr></thead><tbody><tr><td>Full-Stack Media Production</td><td><div style="background:#e0e0e0; border-radius:10px; height:6px; width:100%;"><div style="background:var(--accent); width:45%; height:6px; border-radius:10px;"></div></div>45%</td><td>Jeremiah Iyo</td><td>Mar 20, 2025</td></tr><tr><td>Video Production</td><td><div style="background:#e0e0e0; border-radius:10px; height:6px; width:100%;"><div style="background:var(--accent); width:60%; height:6px; border-radius:10px;"></div></div>60%</td><td>Finiks Kshel</td><td>Mar 18, 2025</td></tr></tbody></table></div>`;
}

function renderAssignments() {
  const data = mockData.Student;
  return `
    <div class="table-container">
      <table>
        <thead><tr><th>Assignment</th><th>Due Date</th><th>Status</th><th>Grade</th><th>Action</th></tr></thead>
        <tbody>
          ${data.assignments.map(a => `
            <tr>
              <td><strong>${a.title}</strong></td>
              <td>${a.dueDate}</td>
              <td><span class="badge ${a.status === 'submitted' ? 'badge-success' : 'badge-warning'}">${a.status}</span></td>
              <td>${a.grade ? a.grade + '%' : '-'}</td>
              <td><button class="btn-sm" onclick="alert('Submit assignment')">Submit</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderWallet() {
  const data = mockData.Student;
  return `
    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card"><div class="stat-info"><h4>Current Balance</h4><div class="stat-number" style="font-size:2rem;">₦${data.stats.walletBalance.toLocaleString()}</div></div><div class="stat-icon"><i class="fas fa-wallet"></i></div></div>
    </div>
    <div class="table-container">
      <table>
        <thead><tr><th>Description</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          ${data.transactions.map(t => `
            <tr>
              <td>${t.description}</td>
              <td>${t.date}</td>
              <td style="color:${t.type === 'credit' ? 'var(--success)' : 'var(--danger)'}">${t.type === 'credit' ? '+' : '-'}₦${t.amount.toLocaleString()}</td>
              <td><span class="badge badge-success">${t.status}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderLibrary() {
  return `<div class="table-container"><table><thead><tr><th>Title</th><th>Type</th><th>Date Purchased</th><th>Action</th></tr></thead><tbody><tr><td>Complete Guide to Video Production</td><td>Book</td><td>2025-03-01</td><td><button class="btn-sm">Download</button></td></tr><tr><td>UI/UX Design Mastery</td><td>Book</td><td>2025-02-15</td><td><button class="btn-sm">Download</button></td></tr></tbody></table></div>`;
}

function renderPortfolio() {
  return `<div class="cards-grid"><div class="action-card"><div class="action-icon"><i class="fas fa-image"></i></div><div class="action-info"><h3>Short Film Project</h3><p>Submitted Mar 10, 2025</p></div></div><div class="action-card"><div class="action-icon"><i class="fas fa-palette"></i></div><div class="action-info"><h3>Brand Identity Design</h3><p>Submitted Feb 28, 2025</p></div></div></div>`;
}

function renderSettings() {
  return `
    <div style="max-width:500px; background:var(--bg-card); border-radius:20px; padding:24px; border:1px solid var(--border-color);">
      <h3 style="margin-bottom:20px;">Account Settings</h3>
      <div style="margin-bottom:16px;"><label style="display:block; margin-bottom:6px;">Display Name</label><input type="text" class="input-field" value="${currentUser.name || ''}" placeholder="Your name"></div>
      <div style="margin-bottom:16px;"><label style="display:block; margin-bottom:6px;">Email</label><input type="email" class="input-field" value="${currentUser.email || ''}" placeholder="Email (optional)"></div>
      <div style="margin-bottom:16px;"><label style="display:block; margin-bottom:6px;">Phone</label><input type="tel" class="input-field" placeholder="Phone (optional)"></div>
      <button class="btn-sm" onclick="alert('Settings saved (demo)')">Save Changes</button>
    </div>
  `;
}

function renderStudents() {
  return `<div class="table-container"><table><thead><tr><th>Student</th><th>Track</th><th>Progress</th><th>Actions</th></tr></thead><tbody><tr><td>John Doe</td><td>Media</td><td>45%</td><td><button class="btn-sm">View</button></td></tr><tr><td>Jane Smith</td><td>Tech</td><td>60%</td><td><button class="btn-sm">View</button></td></tr></tbody></table></div>`;
}

function renderSubmissions() {
  const data = mockData.Instructor;
  return `
    <div class="table-container">
      <table>
        <thead><tr><th>Student</th><th>Assignment</th><th>Submitted</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          ${data.submissions.map(s => `
            <tr><td>${s.student}</td><td>${s.assignment}</td><td>${s.submitted}</td><td><span class="badge badge-warning">${s.status}</span></td><td><button class="btn-sm">Grade</button></td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCreateAssignment() {
  return `<div style="max-width:500px; background:var(--bg-card); border-radius:20px; padding:24px; border:1px solid var(--border-color);"><h3 style="margin-bottom:20px;">Create New Assignment</h3><div style="margin-bottom:16px;"><label>Title</label><input type="text" class="input-field" placeholder="Assignment title"></div><div style="margin-bottom:16px;"><label>Due Date</label><input type="date" class="input-field"></div><div style="margin-bottom:16px;"><label>Instructions</label><textarea class="input-field" rows="4" placeholder="Describe the assignment..."></textarea></div><button class="btn-sm" onclick="alert('Assignment created (demo)')">Publish Assignment</button></div>`;
}

function renderProjects() {
  const data = mockData.Partner;
  return `<div class="table-container"><table><thead><tr><th>Project</th><th>Budget</th><th>Deadline</th><th>Status</th></tr></thead><tbody>${data.projects.map(p => `<tr><td>${p.name}</td><td>₦${p.budget.toLocaleString()}</td><td>${p.deadline}</td><td><span class="badge ${p.status === 'in-progress' ? 'badge-warning' : 'badge-success'}">${p.status}</span></td></tr>`).join('')}</tbody></table></div>`;
}

function renderSubmitProject() {
  return `<div style="max-width:500px; background:var(--bg-card); border-radius:20px; padding:24px; border:1px solid var(--border-color);"><h3 style="margin-bottom:20px;">Submit New Project</h3><div style="margin-bottom:16px;"><label>Project Title</label><input type="text" class="input-field" placeholder="Project name"></div><div style="margin-bottom:16px;"><label>Budget Range</label><select class="input-field"><option>₦50k - ₦100k</option><option>₦100k - ₦250k</option><option>₦250k - ₦500k</option><option>₦500k+</option></select></div><div style="margin-bottom:16px;"><label>Description</label><textarea class="input-field" rows="4" placeholder="Describe your project requirements..."></textarea></div><button class="btn-sm" onclick="alert('Project submitted (demo)')">Submit for Review</button></div>`;
}

function renderInvoices() {
  return `<div class="table-container"><table><thead><tr><th>Invoice #</th><th>Project</th><th>Amount</th><th>Due Date</th><th>Status</th></tr></thead><tbody><tr><td>INV-001</td><td>Website Development</td><td>₦250,000</td><td>2025-04-15</td><td><span class="badge badge-warning">Pending</span></td></tr><tr><td>INV-002</td><td>Brand Identity</td><td>₦150,000</td><td>2025-03-01</td><td><span class="badge badge-success">Paid</span></td></tr></tbody></table></div>`;
}

function renderAnnouncements() {
  const data = mockData.Other;
  return `<div class="cards-grid">${data.announcements.map(a => `<div class="action-card"><div class="action-icon"><i class="fas fa-bullhorn"></i></div><div class="action-info"><h3>${a.title}</h3><p>${a.date} - ${a.content}</p></div></div>`).join('')}</div>`;
}

function renderContact() {
  return `<div style="max-width:500px; background:var(--bg-card); border-radius:20px; padding:24px; border:1px solid var(--border-color);"><h3 style="margin-bottom:20px;">Contact Support</h3><div style="margin-bottom:16px;"><label>Subject</label><input type="text" class="input-field" placeholder="What's this about?"></div><div style="margin-bottom:16px;"><label>Message</label><textarea class="input-field" rows="4" placeholder="Describe your issue..."></textarea></div><button class="btn-sm" onclick="alert('Message sent (demo)')">Send Message</button><p style="margin-top:16px; font-size:0.75rem; color:var(--text-muted);"><i class="fas fa-envelope"></i> Or email: support@gliimu.com</p></div>`;
}

// Make functions globally available
window.switchTab = switchTab;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initDashboard);
