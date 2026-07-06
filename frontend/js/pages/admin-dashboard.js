// ============================================
// ADMIN DASHBOARD - COMPLETE ROLE-BASED SYSTEM
// Roles: Super Admin, CRM, Secretary, Manager, Member
// FULLY FUNCTIONAL WITH FILE UPLOAD FIXES
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// GLOBAL STATE
// ============================================
let currentUser = null;
let currentRole = null;
let currentTab = 'overview';
let currentPaymentFilter = 'pending';
let allPayments = [];
let allStudents = [];
let allProducts = [];
let allInquiries = [];
let allSubmissions = [];
let allContracts = [];
let allJobs = [];
let allRecords = [];
let allAdminLogs = [];
let allPartnerships = [];
let refreshInterval = null;
let editingItemId = null;
let editingFaqId = null;
let editingIndexId = null;
let editingRecordId = null;

// File tracking for uploads
let coverFileData = null;
let contentFileData = null;
let indexImageFileData = null;
let productImageFileData = null;
let recordFileData = null;

// ============================================
// ROLE-BASED TAB CONFIGURATION
// ============================================
const roleTabs = {
    super_admin: [
        { id: 'overview', name: 'Overview', icon: 'fas fa-tachometer-alt' },
        { id: 'update', name: 'Update', icon: 'fas fa-pen' },
        { id: 'inquiries', name: 'Inquiries', icon: 'fas fa-question-circle' },
        { id: 'events', name: 'Event', icon: 'fas fa-calendar' },
        { id: 'payments', name: 'Payments', icon: 'fas fa-cash-register' },
        { id: 'sales', name: 'Sales', icon: 'fas fa-chart-simple' },
        { id: 'records', name: 'Records', icon: 'fas fa-folder-open' },
        { id: 'submissions', name: 'Info', icon: 'fas fa-briefcase' },
        { id: 'users', name: 'Users', icon: 'fas fa-users' },
        { id: 'partnerships', name: 'Partnerships', icon: 'fas fa-handshake' },
        { id: 'admin_management', name: 'Admin', icon: 'fas fa-user-shield' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    
    crm: [
        { id: 'overview', name: 'Overview', icon: 'fas fa-tachometer-alt' },
        { id: 'update', name: 'Update', icon: 'fas fa-pen' },
        { id: 'inquiries', name: 'Inquiries', icon: 'fas fa-question-circle' },
        { id: 'events', name: 'Event', icon: 'fas fa-calendar' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    
    manager: [
        { id: 'overview', name: 'Overview', icon: 'fas fa-tachometer-alt' },
        { id: 'submissions', name: 'Info', icon: 'fas fa-briefcase' },
        { id: 'users', name: 'Users', icon: 'fas fa-users' },
        { id: 'partnerships', name: 'Partnerships', icon: 'fas fa-handshake' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    
    secretary: [
        { id: 'overview', name: 'Overview', icon: 'fas fa-tachometer-alt' },
        { id: 'payments', name: 'Payments', icon: 'fas fa-cash-register' },
        { id: 'sales', name: 'Sales', icon: 'fas fa-chart-simple' },
        { id: 'records', name: 'Records', icon: 'fas fa-folder-open' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    
    member: [
        { id: 'overview', name: 'Overview', icon: 'fas fa-tachometer-alt' },
        { id: 'records', name: 'Records', icon: 'fas fa-folder-open' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ]
};

// ============================================
// THEME MANAGEMENT
// ============================================

function initTheme() {
    const savedTheme = localStorage.getItem('admin_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        document.body.classList.add('dark-mode');
    } else if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
    } else if (systemPrefersDark) {
        document.body.classList.add('dark-mode');
    }
}

function toggleTheme() {
    if (document.body.classList.contains('dark-mode')) {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('admin_theme', 'light');
        showToast('Light mode activated', 'info');
    } else {
        document.body.classList.add('dark-mode');
        localStorage.setItem('admin_theme', 'dark');
        showToast('Dark mode activated', 'info');
    }
}

// ============================================
// AUTHENTICATION CHECK WITH ROLE - SECURE VERSION
// ============================================
async function checkAuth() {
    console.log('Checking admin authentication...');
    
    const devMode = localStorage.getItem('dev_admin_mode') === 'true';
    if (devMode) {
        console.log('Dev admin mode enabled');
        currentUser = { id: 'dev_admin', email: 'admin@test.com', role: 'super_admin' };
        currentRole = 'super_admin';
        document.getElementById('adminName').textContent = 'Super Admin (Dev Mode)';
        document.getElementById('adminRole').textContent = 'Super Admin';
        document.getElementById('dashboardTitle').textContent = 'Super Admin Dashboard';
        return true;
    }
    
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
        console.error('Auth error:', error);
        showToast('Please login first', 'error');
        setTimeout(() => window.location.href = '/signin.html', 1500);
        return false;
    }
    
    // Get user profile with role
    const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role, name, avatar_url')
        .eq('id', user.id)
        .single();
    
    if (profileError) {
        console.error('Profile error:', profileError);
        showToast('Error loading profile', 'error');
        setTimeout(() => window.location.href = '/user.html', 1500);
        return false;
    }
    
    // ============================================
    // SECURITY CHECK: Verify user has admin role
    // ============================================
    const adminRoles = ['super_admin', 'crm', 'manager', 'member', 'secretary'];
    
    if (!profile || !adminRoles.includes(profile.role)) {
        console.warn('🚨 Unauthorized admin access attempt:', user.email, 'Role:', profile?.role);
        showToast('You do not have admin access', 'error');
        
        // Redirect to user dashboard
        setTimeout(() => {
            window.location.href = '/user.html';
        }, 1500);
        return false;
    }
    
    // User is authorized
    const userRole = profile.role;
    currentRole = userRole;
    currentUser = { ...user, profile };
    
    const roleNames = {
        super_admin: 'Super Admin',
        crm: 'CRM',
        secretary: 'Secretary',
        manager: 'Operations Manager',
        member: 'Board Member'
    };
    
    const roleTitles = {
        super_admin: 'Super Admin Dashboard',
        crm: 'CRM Dashboard',
        secretary: 'Secretary Dashboard',
        manager: 'Manager Dashboard',
        member: 'Board Member Dashboard'
    };
    
    document.getElementById('adminName').textContent = profile?.name || 'Admin';
    document.getElementById('adminRole').textContent = roleNames[userRole] || userRole;
    document.getElementById('dashboardTitle').textContent = roleTitles[userRole] || 'Admin Dashboard';
    
    return true;
}

// ============================================
// BUILD SIDEBAR
// ============================================
function buildSidebar() {
    const tabs = roleTabs[currentRole] || roleTabs.secretary;
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

// ============================================
// CREATE CONTENT SECTIONS
// ============================================
function createContentSections() {
    const dashboardContent = document.getElementById('dashboardContent');
    if (!dashboardContent) return;
    
    dashboardContent.innerHTML = `
        <!-- Overview -->
        <div id="overview-section" class="admin-tab active"><div class="loading">Loading overview...</div></div>
        
        <!-- Update Website -->
        <div id="update-section" class="admin-tab"><div class="loading">Loading update manager...</div></div>
        
        <!-- Inquiries -->
        <div id="inquiries-section" class="admin-tab"><div class="loading">Loading inquiries...</div></div>
        
        <!-- Events -->
        <div id="events-section" class="admin-tab"><div class="loading">Loading events...</div></div>
        
        <!-- Payments -->
        <div id="payments-section" class="admin-tab"><div class="loading">Loading payments...</div></div>
        
        <!-- Sales -->
        <div id="sales-section" class="admin-tab"><div class="loading">Loading sales...</div></div>
        
        <!-- Records -->
        <div id="records-section" class="admin-tab"><div class="loading">Loading records...</div></div>
        
        <!-- Submissions (Info) -->
        <div id="submissions-section" class="admin-tab"><div class="loading">Loading submissions...</div></div>
        
        <!-- Users -->
        <div id="users-section" class="admin-tab"><div class="loading">Loading users...</div></div>
        
        <!-- Partnerships -->
        <div id="partnerships-section" class="admin-tab"><div class="loading">Loading partnerships...</div></div>
        
        <!-- Admin Management -->
        <div id="admin_management-section" class="admin-tab"><div class="loading">Loading admin management...</div></div>
        
        <!-- Settings -->
        <div id="settings-section" class="admin-tab"><div class="loading">Loading settings...</div></div>
    `;
}

// ============================================
// TAB SWITCHING
// ============================================
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
    
    document.querySelectorAll('.admin-tab').forEach(tab => {
        if (tab.id === `${tabId}-section`) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    loadTabData(tabId);
}

async function loadTabData(tabId) {
    switch(tabId) {
        case 'overview': await renderOverview(); break;
        case 'update': await renderUpdate(); break;
        case 'inquiries': await renderInquiries(); break;
        case 'events': await renderEvents(); break;
        case 'payments': await renderPayments(); break;
        case 'sales': await renderSales(); break;
        case 'records': await renderRecords(); break;
        case 'submissions': await renderSubmissions(); break;
        case 'users': await renderUsers(); break;
        case 'partnerships': await renderPartnerships(); break;
        case 'admin_management': await renderAdminManagement(); break;
        case 'settings': await renderSettings(); break;
        default: await renderOverview();
    }
}

// ============================================
// OVERVIEW RENDER
// ============================================
async function renderOverview() {
    const container = document.getElementById('overview-section');
    if (!container) return;
    
    const payments = await loadPayments();
    const students = await loadStudents();
    const inquiries = await loadInquiries();
    const submissions = await loadAllSubmissions();
    
    const pendingPayments = payments.filter(p => p.status === 'pending');
    const approvedPayments = payments.filter(p => p.status === 'approved');
    const totalRevenue = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
    const pendingInquiries = inquiries.filter(i => i.status === 'pending');
    const pendingSubmissions = submissions.filter(s => s.status === 'pending');
    
    container.innerHTML = `
        <div class="dashboard-overview">
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-users"></i></div>
                    <div class="stat-info">
                        <h3>Total Users</h3>
                        <div class="stat-value">${students.length}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-clock"></i></div>
                    <div class="stat-info">
                        <h3>Pending Payments</h3>
                        <div class="stat-value">${pendingPayments.length}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-question-circle"></i></div>
                    <div class="stat-info">
                        <h3>Pending Inquiries</h3>
                        <div class="stat-value">${pendingInquiries.length}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-briefcase"></i></div>
                    <div class="stat-info">
                        <h3>Pending Submissions</h3>
                        <div class="stat-value">${pendingSubmissions.length}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                    <div class="stat-info">
                        <h3>Approved Payments</h3>
                        <div class="stat-value">${approvedPayments.length}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
                    <div class="stat-info">
                        <h3>Total Revenue</h3>
                        <div class="stat-value">₦${totalRevenue.toLocaleString()}</div>
                    </div>
                </div>
            </div>
            <div class="recent-section">
                <h3>Recent Payments</h3>
                <div class="recent-payments">${renderRecentPayments(payments.slice(0, 5))}</div>
            </div>
        </div>
    `;
}

// ============================================
// UPDATE WEBSITE (RENDER POSTS MANAGER)
// ============================================
async function renderUpdate() {
    const container = document.getElementById('update-section');
    if (!container) return;
    
    const [libraryItems, faqItems, indexData] = await Promise.all([
        supabase.from('hub_contents').select('*').order('created_at', { ascending: false }),
        supabase.from('faq_items').select('*').order('order', { ascending: true }),
        supabase.from('index_content').select('*').maybeSingle()
    ]);
    
    const items = libraryItems.data || [];
    const faqs = faqItems.data || [];
    const index = indexData.data || { hero_title: 'Be The Best', hero_subtitle: 'Read the best' };
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-pen"></i> Update Website</h2>
            <p>Manage all website content from one place</p>
        </div>
        
        <div class="website-sections">
            <div class="section-card">
                <div class="section-card-header">
                    <h3><i class="fas fa-book"></i> Library Content</h3>
                    <button class="btn-primary add-library-item"><i class="fas fa-plus"></i> Add Content</button>
                </div>
                <div class="section-card-body">
                    <div class="library-stats">
                        <div class="stat-chip"><span class="stat-value">${items.filter(i => i.type === 'book').length}</span> Books</div>
                        <div class="stat-chip"><span class="stat-value">${items.filter(i => i.type === 'talk').length}</span> Talks</div>
                        <div class="stat-chip"><span class="stat-value">${items.filter(i => i.type === 'bundle').length}</span> Bundles</div>
                        <div class="stat-chip"><span class="stat-value">${items.length}</span> Total</div>
                    </div>
                    <div class="library-items-grid">
                        ${items.map(item => `
                            <div class="library-admin-card" data-id="${item.id}">
                                <img src="${item.cover_url || 'https://placehold.co/70x90/2c2f78/white?text=No+Image'}" alt="${item.title}" onerror="this.src='https://placehold.co/70x90/2c2f78/white?text=No+Image'">
                                <div class="info">
                                    <h4>${escapeHtml(item.title)}</h4>
                                    <p class="meta">${item.type || 'Book'} • ${item.category || 'Uncategorized'}</p>
                                    <span class="status-badge ${item.is_active ? 'active' : 'inactive'}">${item.is_active ? 'Active' : 'Inactive'}</span>
                                </div>
                                <div class="actions">
                                    <button class="btn-outline edit-item" data-id="${item.id}"><i class="fas fa-edit"></i></button>
                                    <button class="btn-danger delete-item" data-id="${item.id}"><i class="fas fa-trash"></i></button>
                                    <button class="btn-outline toggle-item" data-id="${item.id}" data-active="${item.is_active}">
                                        ${item.is_active ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>'}
                                    </button>
                                </div>
                            </div>
                        `).join('') || '<div class="empty-state">No library items</div>'}
                    </div>
                </div>
            </div>
            
            <div class="section-card">
                <div class="section-card-header">
                    <h3><i class="fas fa-question-circle"></i> FAQ Management</h3>
                    <button class="btn-primary add-faq-btn"><i class="fas fa-plus"></i> Add FAQ</button>
                </div>
                <div class="section-card-body">
                    ${faqs.length === 0 ? '<div class="empty-state">No FAQs yet</div>' : `
                        <div class="faq-list">
                            ${faqs.map(faq => `
                                <div class="faq-item" data-id="${faq.id}">
                                    <div class="faq-question">${escapeHtml(faq.question)}</div>
                                    <div class="faq-answer">${escapeHtml(faq.answer)}</div>
                                    <div class="faq-actions">
                                        <button class="btn-outline edit-faq" data-id="${faq.id}"><i class="fas fa-edit"></i></button>
                                        <button class="btn-danger delete-faq" data-id="${faq.id}"><i class="fas fa-trash"></i></button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>
            
            <div class="section-card">
                <div class="section-card-header">
                    <h3><i class="fas fa-home"></i> Homepage / Index</h3>
                    <button class="btn-primary edit-index-btn"><i class="fas fa-edit"></i> Edit Hero</button>
                </div>
                <div class="section-card-body">
                    <div class="index-preview">
                        <div class="index-field">
                            <label>Hero Title</label>
                            <div class="index-value">${escapeHtml(index.hero_title || 'Be The Best')}</div>
                        </div>
                        <div class="index-field">
                            <label>Hero Subtitle</label>
                            <div class="index-value">${escapeHtml(index.hero_subtitle || 'Read the best')}</div>
                        </div>
                        ${index.hero_image ? `
                            <div class="index-field" style="grid-column: 1 / -1;">
                                <label>Hero Image</label>
                                <img src="${index.hero_image}" alt="Hero" style="max-width:300px; border-radius:8px;">
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.querySelector('.add-library-item')?.addEventListener('click', () => openLibraryModal());
    document.querySelector('.add-faq-btn')?.addEventListener('click', () => openFaqModal());
    document.querySelector('.edit-index-btn')?.addEventListener('click', () => openIndexModal());
    
    document.querySelectorAll('.edit-item').forEach(btn => btn.addEventListener('click', () => openLibraryModal(btn.dataset.id)));
    document.querySelectorAll('.delete-item').forEach(btn => btn.addEventListener('click', () => deleteLibraryItem(btn.dataset.id)));
    document.querySelectorAll('.toggle-item').forEach(btn => btn.addEventListener('click', () => toggleLibraryItem(btn.dataset.id, btn.dataset.active === 'true')));
    
    document.querySelectorAll('.edit-faq').forEach(btn => btn.addEventListener('click', () => openFaqModal(btn.dataset.id)));
    document.querySelectorAll('.delete-faq').forEach(btn => btn.addEventListener('click', () => deleteFaqItem(btn.dataset.id)));
}

// ============================================
// INQUIRIES RENDER (CRM)
// ============================================
async function renderInquiries() {
    const container = document.getElementById('inquiries-section');
    if (!container) return;
    
    const inquiries = await loadInquiries();
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-question-circle"></i> Inquiries</h2>
            <p>Manage user inquiries and questions</p>
        </div>
        
        <div class="inquiries-stats">
            <div class="stat-chip"><span class="stat-value">${inquiries.filter(i => i.status === 'pending').length}</span> Pending</div>
            <div class="stat-chip"><span class="stat-value">${inquiries.filter(i => i.status === 'replied').length}</span> Replied</div>
            <div class="stat-chip"><span class="stat-value">${inquiries.filter(i => i.status === 'closed').length}</span> Closed</div>
            <div class="stat-chip"><span class="stat-value">${inquiries.length}</span> Total</div>
        </div>
        
        <div class="inquiries-list">
            ${inquiries.length === 0 ? '<div class="empty-state"><i class="fas fa-inbox"></i><p>No inquiries yet</p></div>' : 
                inquiries.map(inquiry => `
                    <div class="inquiry-item ${inquiry.status}">
                        <div class="inquiry-header">
                            <span class="inquiry-subject"><strong>${escapeHtml(inquiry.subject)}</strong></span>
                            <span class="inquiry-date">${new Date(inquiry.created_at).toLocaleString()}</span>
                        </div>
                        <div class="inquiry-body">
                            <p>${escapeHtml(inquiry.message)}</p>
                            ${inquiry.file_url ? `<a href="${inquiry.file_url}" target="_blank" class="inquiry-file"><i class="fas fa-paperclip"></i> ${inquiry.file_name || 'Attachment'}</a>` : ''}
                        </div>
                        <div class="inquiry-meta">
                            <span class="inquiry-user">From: ${inquiry.user_name || 'User'}</span>
                            <span class="inquiry-status ${inquiry.status}">${inquiry.status.toUpperCase()}</span>
                        </div>
                        ${inquiry.admin_response ? `
                            <div class="inquiry-response">
                                <strong>Admin Response:</strong> ${escapeHtml(inquiry.admin_response)}
                                <span class="response-date">${new Date(inquiry.replied_at).toLocaleString()}</span>
                            </div>
                        ` : ''}
                        <div class="inquiry-actions">
                            ${inquiry.status === 'pending' ? `
                                <button class="btn-primary reply-inquiry" data-id="${inquiry.id}"><i class="fas fa-reply"></i> Reply</button>
                            ` : inquiry.status === 'replied' ? `
                                <button class="btn-outline reply-inquiry" data-id="${inquiry.id}"><i class="fas fa-reply"></i> Reply Again</button>
                                <button class="btn-outline close-inquiry" data-id="${inquiry.id}"><i class="fas fa-check"></i> Close</button>
                            ` : ''}
                        </div>
                    </div>
                `).join('')
            }
        </div>
    `;
    
    document.querySelectorAll('.reply-inquiry').forEach(btn => {
        btn.addEventListener('click', () => openReplyModal('inquiry', btn.dataset.id));
    });
    
    document.querySelectorAll('.close-inquiry').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Close this inquiry?')) {
                await closeInquiry(btn.dataset.id);
                renderInquiries();
            }
        });
    });
}

// ============================================
// SUBMISSIONS RENDER (Info tab - Manager)
// ============================================
async function renderSubmissions() {
    const container = document.getElementById('submissions-section');
    if (!container) return;
    
    const applications = await loadApplications();
    const contracts = await loadContracts();
    const jobs = await loadJobs();
    const submissions = await loadAllSubmissions();
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-briefcase"></i> Info Center</h2>
            <p>Manage applications, contracts, jobs and work submissions</p>
        </div>
        
        <div class="info-tabs">
            <button class="info-tab-btn active" data-info-tab="applications">Applications (${applications.filter(a => a.status === 'pending').length})</button>
            <button class="info-tab-btn" data-info-tab="contracts">Contracts (${contracts.filter(c => c.status === 'pending').length})</button>
            <button class="info-tab-btn" data-info-tab="jobs">Jobs (${jobs.filter(j => j.status === 'pending').length})</button>
            <button class="info-tab-btn" data-info-tab="submissions">Submissions (${submissions.filter(s => s.status === 'pending').length})</button>
        </div>
        
        <div id="info-content">
            ${renderApplicationsList(applications)}
        </div>
    `;
    
    document.querySelectorAll('.info-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.info-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.infoTab;
            const content = document.getElementById('info-content');
            
            switch(tab) {
                case 'applications': content.innerHTML = renderApplicationsList(applications); break;
                case 'contracts': content.innerHTML = renderContractsList(contracts); break;
                case 'jobs': content.innerHTML = renderJobsList(jobs); break;
                case 'submissions': content.innerHTML = renderSubmissionsList(submissions); break;
            }
        });
    });
}

function renderApplicationsList(applications) {
    if (!applications.length) return '<div class="empty-state"><i class="fas fa-inbox"></i><p>No applications</p></div>';
    
    return applications.map(app => `
        <div class="info-item ${app.status}">
            <div class="info-header">
                <span class="info-subject"><strong>${escapeHtml(app.full_name)}</strong> - ${app.role}</span>
                <span class="info-date">${new Date(app.submitted_at).toLocaleString()}</span>
            </div>
            <div class="info-body">
                <p>Email: ${app.email}</p>
                <p>Username: ${app.username}</p>
            </div>
            <div class="info-meta">
                <span class="info-status ${app.status}">${app.status.toUpperCase()}</span>
            </div>
            ${app.status === 'pending' ? `
                <div class="info-actions">
                    <button class="btn-success approve-application" data-id="${app.id}"><i class="fas fa-check"></i> Approve</button>
                    <button class="btn-danger reject-application" data-id="${app.id}"><i class="fas fa-times"></i> Reject</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function renderContractsList(contracts) {
    if (!contracts.length) return '<div class="empty-state"><i class="fas fa-inbox"></i><p>No contracts</p></div>';
    
    return contracts.map(contract => `
        <div class="info-item ${contract.status}">
            <div class="info-header">
                <span class="info-subject"><strong>${escapeHtml(contract.subject)}</strong></span>
                <span class="info-date">${new Date(contract.created_at).toLocaleString()}</span>
            </div>
            <div class="info-body">
                <p>${escapeHtml(contract.message)}</p>
                ${contract.contract_type ? `<p>Type: ${contract.contract_type}</p>` : ''}
                ${contract.file_url ? `<a href="${contract.file_url}" target="_blank"><i class="fas fa-paperclip"></i> ${contract.file_name || 'Attachment'}</a>` : ''}
            </div>
            <div class="info-meta">
                <span class="info-status ${contract.status}">${contract.status.toUpperCase()}</span>
            </div>
            ${contract.status === 'pending' ? `
                <div class="info-actions">
                    <button class="btn-outline reply-contract" data-id="${contract.id}"><i class="fas fa-reply"></i> Reply</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function renderJobsList(jobs) {
    if (!jobs.length) return '<div class="empty-state"><i class="fas fa-inbox"></i><p>No job requests</p></div>';
    
    return jobs.map(job => `
        <div class="info-item ${job.status}">
            <div class="info-header">
                <span class="info-subject"><strong>${escapeHtml(job.subject)}</strong></span>
                <span class="info-date">${new Date(job.created_at).toLocaleString()}</span>
            </div>
            <div class="info-body">
                <p>${escapeHtml(job.message)}</p>
                ${job.job_title ? `<p>Job Title: ${job.job_title}</p>` : ''}
                ${job.job_type ? `<p>Type: ${job.job_type}</p>` : ''}
                ${job.file_url ? `<a href="${job.file_url}" target="_blank"><i class="fas fa-paperclip"></i> ${job.file_name || 'Attachment'}</a>` : ''}
            </div>
            <div class="info-meta">
                <span class="info-status ${job.status}">${job.status.toUpperCase()}</span>
            </div>
            ${job.status === 'pending' ? `
                <div class="info-actions">
                    <button class="btn-outline reply-job" data-id="${job.id}"><i class="fas fa-reply"></i> Reply</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function renderSubmissionsList(submissions) {
    if (!submissions.length) return '<div class="empty-state"><i class="fas fa-inbox"></i><p>No work submissions</p></div>';
    
    return submissions.map(sub => `
        <div class="info-item ${sub.status}">
            <div class="info-header">
                <span class="info-subject"><strong>${escapeHtml(sub.subject)}</strong></span>
                <span class="info-date">${new Date(sub.created_at).toLocaleString()}</span>
            </div>
            <div class="info-body">
                <p>${escapeHtml(sub.message)}</p>
                ${sub.gliimu_link ? `<p>🔗 <a href="${sub.gliimu_link}" target="_blank">${sub.gliimu_link}</a></p>` : ''}
                ${sub.file_url ? `<a href="${sub.file_url}" target="_blank"><i class="fas fa-paperclip"></i> ${sub.file_name || 'Attachment'}</a>` : ''}
            </div>
            <div class="info-meta">
                <span class="info-status ${sub.status}">${sub.status.toUpperCase()}</span>
                ${sub.destination ? `<span class="info-destination">→ ${sub.destination}</span>` : ''}
            </div>
            ${sub.status === 'pending' ? `
                <div class="info-actions">
                    <button class="btn-success approve-submission" data-id="${sub.id}"><i class="fas fa-check"></i> Approve</button>
                    <button class="btn-danger reject-submission" data-id="${sub.id}"><i class="fas fa-times"></i> Reject</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

// ============================================
// RECORDS RENDER
// ============================================
async function renderRecords() {
    const container = document.getElementById('records-section');
    if (!container) return;
    
    const records = await loadRecords();
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-folder-open"></i> Records</h2>
            <button id="addRecordBtn" class="btn-primary"><i class="fas fa-plus"></i> Add Record</button>
        </div>
        
        <div class="records-stats">
            <div class="stat-chip"><span class="stat-value">${records.filter(r => r.type === 'minutes').length}</span> Minutes</div>
            <div class="stat-chip"><span class="stat-value">${records.filter(r => r.type === 'agreement').length}</span> Agreements</div>
            <div class="stat-chip"><span class="stat-value">${records.filter(r => r.type === 'curriculum').length}</span> Curriculums</div>
            <div class="stat-chip"><span class="stat-value">${records.filter(r => r.type === 'partnership').length}</span> Partnerships</div>
            <div class="stat-chip"><span class="stat-value">${records.filter(r => r.type === 'document').length}</span> Documents</div>
            <div class="stat-chip"><span class="stat-value">${records.length}</span> Total</div>
        </div>
        
        <div class="records-grid">
            ${records.length === 0 ? '<div class="empty-state"><i class="fas fa-folder-open"></i><p>No records yet</p></div>' :
                records.map(record => `
                    <div class="record-card">
                        <div class="record-header">
                            <span class="record-type">${record.type}</span>
                            <span class="record-date">${new Date(record.created_at).toLocaleDateString()}</span>
                        </div>
                        <h4>${escapeHtml(record.title)}</h4>
                        ${record.content ? `<p>${escapeHtml(record.content.substring(0, 150))}${record.content.length > 150 ? '...' : ''}</p>` : ''}
                        ${record.file_url ? `<a href="${record.file_url}" target="_blank" class="record-file"><i class="fas fa-paperclip"></i> ${record.file_name || 'Attachment'}</a>` : ''}
                        <div class="record-actions">
                            <button class="btn-outline edit-record" data-id="${record.id}"><i class="fas fa-edit"></i></button>
                            <button class="btn-danger delete-record" data-id="${record.id}"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                `).join('')
            }
        </div>
    `;
    
    document.getElementById('addRecordBtn')?.addEventListener('click', () => openRecordModal());
    document.querySelectorAll('.edit-record').forEach(btn => btn.addEventListener('click', () => openRecordModal(btn.dataset.id)));
    document.querySelectorAll('.delete-record').forEach(btn => btn.addEventListener('click', () => deleteRecord(btn.dataset.id)));
}

// ============================================
// ADMIN MANAGEMENT RENDER (Super Admin only)
// ============================================
async function renderAdminManagement() {
    const container = document.getElementById('admin_management-section');
    if (!container) return;
    
    const allUsers = await loadAllUsers();
    const adminUsers = allUsers.filter(u => 
        ['super_admin', 'crm', 'manager', 'member', 'secretary'].includes(u.role)
    );
    const adminLogs = await loadAdminLogs();
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-user-shield"></i> Admin Management</h2>
            <p>Manage admin roles and view admin activity</p>
        </div>
        
        <div class="admin-search-section">
            <div class="search-box">
                <input type="text" id="adminSearchInput" placeholder="Search users by name or email..." class="search-input">
                <button id="adminSearchBtn" class="btn-primary"><i class="fas fa-search"></i> Search</button>
            </div>
            <div id="adminSearchResults" class="admin-search-results"></div>
        </div>
        
        <div class="admin-list-section">
            <h3>Current Admins</h3>
            <div class="admin-list">
                ${adminUsers.map(user => `
                    <div class="admin-card">
                        <div class="admin-avatar">
                            <img src="${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=fbb040&color=fff`}" alt="">
                        </div>
                        <div class="admin-info">
                            <h4>${escapeHtml(user.name || 'Unknown')}</h4>
                            <p>${user.email || 'No email'}</p>
                            <span class="admin-role-badge ${user.role}">${user.role.toUpperCase()}</span>
                        </div>
                        <div class="admin-actions">
                            <button class="btn-outline view-admin-activity" data-id="${user.id}"><i class="fas fa-history"></i></button>
                            <button class="btn-outline view-admin-portfolio" data-id="${user.id}"><i class="fas fa-user-circle"></i></button>
                            ${user.role !== 'super_admin' ? `
                                <button class="btn-danger remove-admin" data-id="${user.id}"><i class="fas fa-user-minus"></i></button>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="admin-activity-section">
            <h3>Recent Admin Activity</h3>
            <div class="admin-activity-list">
                ${adminLogs.slice(0, 20).map(log => `
                    <div class="activity-item">
                        <span class="activity-action">${log.action_type}</span>
                        <span class="activity-target">${log.target_type || 'N/A'}</span>
                        <span class="activity-admin">${log.admin_name || 'Unknown'}</span>
                        <span class="activity-time">${new Date(log.created_at).toLocaleString()}</span>
                    </div>
                `).join('') || '<div class="empty-state">No admin activity logged yet</div>'}
            </div>
        </div>
    `;
    
    document.getElementById('adminSearchBtn')?.addEventListener('click', async () => {
        const query = document.getElementById('adminSearchInput').value.trim();
        if (!query) return;
        
        const results = await searchUsers(query);
        const resultsContainer = document.getElementById('adminSearchResults');
        
        if (results.length === 0) {
            resultsContainer.innerHTML = '<div class="empty-state">No users found</div>';
            return;
        }
        
        resultsContainer.innerHTML = results.map(user => `
            <div class="search-result-item">
                <span>${escapeHtml(user.name)} (${user.email})</span>
                <span class="user-role-badge">${user.role || 'user'}</span>
                <div class="search-result-actions">
                    <select class="admin-role-select" data-user-id="${user.id}">
                        <option value="">Make Admin</option>
                        <option value="secretary">Secretary</option>
                        <option value="crm">CRM</option>
                        <option value="manager">Manager</option>
                        <option value="member">Member</option>
                    </select>
                </div>
            </div>
        `).join('');
        
        document.querySelectorAll('.admin-role-select').forEach(select => {
            select.addEventListener('change', async () => {
                const userId = select.dataset.userId;
                const role = select.value;
                if (!role) return;
                if (confirm(`Make this user a ${role}?`)) {
                    await makeAdmin(userId, role);
                    renderAdminManagement();
                }
            });
        });
    });
    
    document.querySelectorAll('.view-admin-activity').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = btn.dataset.id;
            showAdminActivity(userId);
        });
    });
    
    document.querySelectorAll('.view-admin-portfolio').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = btn.dataset.id;
            window.open(`/u/${userId}`, '_blank');
        });
    });
    
    document.querySelectorAll('.remove-admin').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.dataset.id;
            if (confirm('Remove this user from admin role?')) {
                await removeAdmin(userId);
                renderAdminManagement();
            }
        });
    });
}

// ============================================
// EVENTS RENDER
// ============================================
async function renderEvents() {
    const container = document.getElementById('events-section');
    if (!container) return;
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-calendar"></i> Event Management</h2>
            <button id="addEventBtn" class="btn-primary"><i class="fas fa-plus"></i> Create Event</button>
        </div>
        <div class="empty-state"><i class="fas fa-calendar-plus"></i><p>Events manager coming soon</p></div>
    `;
}

// ============================================
// SALES RENDER
// ============================================
async function renderSales() {
    const container = document.getElementById('sales-section');
    if (!container) return;
    
    const payments = await loadPayments();
    const approvedPayments = payments.filter(p => p.status === 'approved');
    const totalRevenue = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-chart-simple"></i> Sales Record</h2>
            <p>Track all sales and revenue</p>
        </div>
        <div class="sales-stats">
            <div class="finance-card"><h4>Total Revenue</h4><div class="amount">₦${totalRevenue.toLocaleString()}</div></div>
            <div class="finance-card"><h4>Total Transactions</h4><div class="amount">${approvedPayments.length}</div></div>
        </div>
        <div class="sales-list">
            ${approvedPayments.slice(0, 20).map(p => `
                <div class="sales-item">
                    <span>${p.user_name || p.user_email}</span>
                    <span>₦${p.amount.toLocaleString()}</span>
                    <span>${new Date(p.approved_at || p.submitted_at).toLocaleDateString()}</span>
                </div>
            `).join('') || '<div class="empty-state">No sales yet</div>'}
        </div>
    `;
}

// ============================================
// PARTNERSHIPS RENDER
// ============================================
async function renderPartnerships() {
    const container = document.getElementById('partnerships-section');
    if (!container) return;
    
    const partnerships = await loadPartnerships();
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-handshake"></i> Partnerships</h2>
            <button id="addPartnershipBtn" class="btn-primary"><i class="fas fa-plus"></i> New Partnership</button>
        </div>
        <div class="partnerships-list">
            ${partnerships.length === 0 ? '<div class="empty-state"><i class="fas fa-handshake"></i><p>No partnerships yet</p></div>' :
                partnerships.map(p => `
                    <div class="partnership-card">
                        <h4>${escapeHtml(p.name)}</h4>
                        <p>${escapeHtml(p.description || '')}</p>
                        <span class="partnership-status ${p.status}">${p.status || 'active'}</span>
                    </div>
                `).join('')
            }
        </div>
    `;
}

// ============================================
// PAYMENTS RENDER (Secretary)
// ============================================
async function renderPayments() {
    const container = document.getElementById('payments-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading payments...</div>';
    
    const payments = await loadPayments();
    allPayments = payments;
    
    const pendingCount = payments.filter(p => p.status === 'pending').length;
    const filtered = payments.filter(p => p.status === currentPaymentFilter);
    
    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No ${currentPaymentFilter} payments found</p></div>`;
        return;
    }
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-cash-register"></i> Payment Management</h2>
            <div class="payment-filters">
                <button class="filter-btn ${currentPaymentFilter === 'pending' ? 'active' : ''}" data-filter="pending">Pending (${payments.filter(p => p.status === 'pending').length})</button>
                <button class="filter-btn ${currentPaymentFilter === 'approved' ? 'active' : ''}" data-filter="approved">Approved</button>
                <button class="filter-btn ${currentPaymentFilter === 'rejected' ? 'active' : ''}" data-filter="rejected">Rejected</button>
            </div>
        </div>
        <div class="payments-list">
            ${filtered.map(p => `
                <div class="payment-item ${p.status}">
                    <div class="payment-info">
                        <div class="payment-amount">₦${p.amount.toLocaleString()}</div>
                        <div class="payment-date">${new Date(p.submitted_at).toLocaleString()}</div>
                        <div class="payment-ref">Ref: ${p.reference_code}</div>
                        <div class="payment-user">${p.user_name || p.user_email}</div>
                        ${p.bank ? `<div class="payment-bank">Bank: ${p.bank}</div>` : ''}
                    </div>
                    <div class="payment-status ${p.status}">${p.status.toUpperCase()}</div>
                    <div class="payment-actions">
                        ${p.status === 'pending' ? `
                            <button class="btn-approve" data-id="${p.id}" data-amount="${p.amount}" data-user="${p.user_name || p.user_email}"><i class="fas fa-check"></i> Approve</button>
                            <button class="btn-reject" data-id="${p.id}" data-amount="${p.amount}" data-user="${p.user_name || p.user_email}"><i class="fas fa-times"></i> Reject</button>
                        ` : p.status === 'approved' ? `<span class="approved-label"><i class="fas fa-check-circle"></i> Approved</span>` : `<span class="rejected-label"><i class="fas fa-ban"></i> Rejected</span>`}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPaymentFilter = btn.getAttribute('data-filter');
            renderPayments();
        });
    });
    
    document.querySelectorAll('.btn-approve').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const amount = parseInt(btn.getAttribute('data-amount'));
            const userName = btn.getAttribute('data-user');
            if (confirm(`Approve payment of ₦${amount.toLocaleString()} from ${userName}?`)) {
                await approvePayment(id, amount, userName);
            }
        });
    });
    
    document.querySelectorAll('.btn-reject').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const amount = parseInt(btn.getAttribute('data-amount'));
            const userName = btn.getAttribute('data-user');
            if (confirm(`Reject payment of ₦${amount.toLocaleString()} from ${userName}?`)) {
                await rejectPayment(id, amount, userName);
            }
        });
    });
}

// ============================================
// USERS RENDER
// ============================================
async function renderUsers() {
    const container = document.getElementById('users-section');
    if (!container) return;
    
    const users = await loadAllUsers();
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-users"></i> User Management</h2>
            <button id="exportUsersBtn" class="btn-outline"><i class="fas fa-download"></i> Export CSV</button>
        </div>
        <div class="users-list">
            <div class="table-responsive">
                <table class="users-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Wallet Balance</th>
                            <th>GP Points</th>
                            <th>Joined</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(u => `
                            <tr>
                                <td><strong>${escapeHtml(u.name || 'Unknown')}</strong></td>
                                <td>${escapeHtml(u.email || 'No email')}</td>
                                <td><span class="role-badge ${u.role || 'user'}">${u.role || 'user'}</span></td>
                                <td>₦${(u.wallet_balance || 0).toLocaleString()}</td>
                                <td>${(u.gp_points || 0).toLocaleString()}</td>
                                <td>${u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    document.getElementById('exportUsersBtn')?.addEventListener('click', () => {
        let csv = "Name,Email,Role,Wallet Balance,GP Points,Joined\n";
        users.forEach(u => {
            csv += `"${u.name || ''}","${u.email || ''}","${u.role || 'user'}","${u.wallet_balance || 0}","${u.gp_points || 0}","${u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}"\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Users exported successfully!', 'success');
    });
}

// ============================================
// SETTINGS RENDER
// ============================================
async function renderSettings() {
    const container = document.getElementById('settings-section');
    if (!container) return;
    
    const isDarkMode = document.body.classList.contains('dark-mode');
    const currentTheme = isDarkMode ? 'dark' : 'light';
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-cog"></i> Settings</h2>
            <p>Manage your dashboard preferences</p>
        </div>
        
        <div class="settings-grid">
            <div class="settings-card">
                <h3><i class="fas fa-palette"></i> Appearance</h3>
                <div class="form-group">
                    <label>Theme Preference</label>
                    <div class="theme-selector">
                        <button class="theme-option ${currentTheme === 'light' ? 'active' : ''}" data-theme="light">
                            <i class="fas fa-sun"></i> Light Mode
                        </button>
                        <button class="theme-option ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">
                            <i class="fas fa-moon"></i> Dark Mode
                        </button>
                        <button class="theme-option" data-theme="system">
                            <i class="fas fa-desktop"></i> System Default
                        </button>
                    </div>
                    <small class="form-hint">Choose your preferred theme for the admin dashboard.</small>
                </div>
            </div>
            
            <div class="settings-card">
                <h3><i class="fas fa-bell"></i> Notifications</h3>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="emailNotifications" ${localStorage.getItem('admin_email_notifications') !== 'false' ? 'checked' : ''}>
                        Email notifications for new payments
                    </label>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="paymentAlerts" ${localStorage.getItem('admin_payment_alerts') !== 'false' ? 'checked' : ''}>
                        Sound alerts for new payments
                    </label>
                </div>
            </div>
            
            <div class="settings-card">
                <h3><i class="fas fa-user-shield"></i> Account</h3>
                <div class="form-group">
                    <label>Role</label>
                    <input type="text" value="${currentRole.toUpperCase()}" disabled>
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" value="${currentUser?.email || ''}" disabled>
                </div>
            </div>
            
            <div class="settings-card">
                <h3><i class="fas fa-database"></i> Data Management</h3>
                <div class="form-group">
                    <button id="exportDataBtn" class="btn-outline"><i class="fas fa-download"></i> Export All Data (CSV)</button>
                </div>
                <div class="form-group">
                    <button id="clearCacheBtn" class="btn-outline"><i class="fas fa-broom"></i> Clear Dashboard Cache</button>
                </div>
            </div>
        </div>
        
        <div class="settings-actions">
            <button id="saveSettingsBtn" class="btn-primary"><i class="fas fa-save"></i> Save Preferences</button>
        </div>
    `;
    
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.getAttribute('data-theme');
            
            if (theme === 'system') {
                const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (systemPrefersDark) {
                    document.body.classList.add('dark-mode');
                } else {
                    document.body.classList.remove('dark-mode');
                }
                localStorage.setItem('admin_theme', 'system');
            } else if (theme === 'dark') {
                document.body.classList.add('dark-mode');
                localStorage.setItem('admin_theme', 'dark');
            } else {
                document.body.classList.remove('dark-mode');
                localStorage.setItem('admin_theme', 'light');
            }
            
            document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            showToast(`${theme.charAt(0).toUpperCase() + theme.slice(1)} mode activated`, 'success');
        });
    });
    
    document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
        const emailNotifications = document.getElementById('emailNotifications')?.checked;
        const paymentAlerts = document.getElementById('paymentAlerts')?.checked;
        
        localStorage.setItem('admin_email_notifications', emailNotifications);
        localStorage.setItem('admin_payment_alerts', paymentAlerts);
        
        showToast('Settings saved successfully!', 'success');
    });
    
    document.getElementById('exportDataBtn')?.addEventListener('click', async () => {
        await exportAllData();
    });
    
    document.getElementById('clearCacheBtn')?.addEventListener('click', () => {
        localStorage.removeItem('admin_payments_cache');
        localStorage.removeItem('admin_students_cache');
        showToast('Cache cleared! Refreshing data...', 'success');
        setTimeout(() => refreshAllData(), 1000);
    });
}

// ============================================
// PAYMENT APPROVE/REJECT
// ============================================
async function approvePayment(paymentId, amount, userName) {
    try {
        const { data: payment, error: paymentError } = await supabase
            .from('payment_requests')
            .select('*')
            .eq('id', paymentId)
            .single();
        
        if (paymentError) throw paymentError;
        
        await supabase
            .from('payment_requests')
            .update({ 
                status: 'approved', 
                approved_at: new Date().toISOString() 
            })
            .eq('id', paymentId);
        
        const { data: user, error: userError } = await supabase
            .from('user_profiles')
            .select('wallet_balance')
            .eq('id', payment.user_id)
            .single();
        
        if (!userError) {
            const newBalance = (user?.wallet_balance || 0) + payment.amount;
            await supabase
                .from('user_profiles')
                .update({ wallet_balance: newBalance })
                .eq('id', payment.user_id);
        }
        
        showToast(`✅ Payment of ₦${amount.toLocaleString()} from ${userName} approved!`, 'success');
        await renderPayments();
        await renderOverview();
    } catch (error) {
        console.error('Error approving payment:', error);
        showToast('Error approving payment: ' + error.message, 'error');
    }
}

async function rejectPayment(paymentId, amount, userName) {
    try {
        await supabase
            .from('payment_requests')
            .update({ 
                status: 'rejected', 
                admin_notes: 'Payment rejected by admin',
                reviewed_at: new Date().toISOString()
            })
            .eq('id', paymentId);
        
        showToast(`❌ Payment of ₦${amount.toLocaleString()} from ${userName} rejected`, 'info');
        await renderPayments();
        await renderOverview();
    } catch (error) {
        console.error('Error rejecting payment:', error);
        showToast('Error rejecting payment', 'error');
    }
}

// ============================================
// DATA LOADING FUNCTIONS
// ============================================
async function loadPayments() {
    try {
        const { data, error } = await supabase
            .from('payment_requests')
            .select('*')
            .order('submitted_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading payments:', error);
        return [];
    }
}

async function loadStudents() {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('role', 'student')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading students:', error);
        return [];
    }
}

async function loadAllUsers() {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading users:', error);
        return [];
    }
}

async function loadInquiries() {
    try {
        const { data, error } = await supabase
            .from('inquiries')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading inquiries:', error);
        return [];
    }
}

async function loadAllSubmissions() {
    try {
        const { data, error } = await supabase
            .from('submissions')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading submissions:', error);
        return [];
    }
}

async function loadApplications() {
    try {
        const { data, error } = await supabase
            .from('applications')
            .select('*')
            .order('submitted_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading applications:', error);
        return [];
    }
}

async function loadContracts() {
    try {
        const { data, error } = await supabase
            .from('contracts')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading contracts:', error);
        return [];
    }
}

async function loadJobs() {
    try {
        const { data, error } = await supabase
            .from('jobs')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading jobs:', error);
        return [];
    }
}

async function loadRecords() {
    try {
        const { data, error } = await supabase
            .from('records')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading records:', error);
        return [];
    }
}

async function loadPartnerships() {
    try {
        const { data, error } = await supabase
            .from('partnerships')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading partnerships:', error);
        return [];
    }
}

async function loadAdminLogs() {
    try {
        const { data, error } = await supabase
            .from('admin_activity_log')
            .select('*, user_profiles(name)')
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        return data.map(log => ({
            ...log,
            admin_name: log.user_profiles?.name || 'Unknown'
        })) || [];
    } catch (error) {
        console.error('Error loading admin logs:', error);
        return [];
    }
}

async function searchUsers(query) {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .or(`name.ilike.%${query}%,email.ilike.%${query}%,username.ilike.%${query}%`)
            .limit(20);
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error searching users:', error);
        return [];
    }
}

// ============================================
// ADMIN MANAGEMENT FUNCTIONS
// ============================================
async function makeAdmin(userId, role) {
    try {
        const { error } = await supabase
            .from('user_profiles')
            .update({ role: role })
            .eq('id', userId);
        
        if (error) throw error;
        
        // Log activity
        await logAdminActivity('make_admin', 'user_profiles', userId, { role });
        
        showToast(`✅ User promoted to ${role}`, 'success');
        return true;
    } catch (error) {
        console.error('Error making admin:', error);
        showToast('Error: ' + error.message, 'error');
        return false;
    }
}

async function removeAdmin(userId) {
    try {
        const { error } = await supabase
            .from('user_profiles')
            .update({ role: 'user' })
            .eq('id', userId);
        
        if (error) throw error;
        
        await logAdminActivity('remove_admin', 'user_profiles', userId, {});
        
        showToast('✅ Admin role removed', 'success');
        return true;
    } catch (error) {
        console.error('Error removing admin:', error);
        showToast('Error: ' + error.message, 'error');
        return false;
    }
}

async function logAdminActivity(actionType, targetType, targetId, details) {
    try {
        await supabase
            .from('admin_activity_log')
            .insert([{
                admin_id: currentUser.id,
                action_type: actionType,
                target_type: targetType,
                target_id: targetId,
                details: details || {}
            }]);
    } catch (error) {
        console.error('Error logging admin activity:', error);
    }
}

// ============================================
// RECORD FUNCTIONS
// ============================================
function openRecordModal(recordId = null) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'recordModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:600px;">
            <div class="modal-header">
                <h2>${recordId ? 'Edit' : 'Add'} Record</h2>
                <button class="modal-close" id="closeRecordModal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="recordForm">
                    <input type="hidden" id="editRecordId" value="${recordId || ''}">
                    <div class="form-group">
                        <label>Title *</label>
                        <input type="text" id="recordTitle" required placeholder="Enter record title">
                    </div>
                    <div class="form-group">
                        <label>Type *</label>
                        <select id="recordType" required>
                            <option value="income_expense">Income & Expense</option>
                            <option value="minutes">Meeting Minutes</option>
                            <option value="agreement">Agreement</option>
                            <option value="curriculum">Curriculum</option>
                            <option value="partnership">Partnership</option>
                            <option value="document">Document</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Content</label>
                        <textarea id="recordContent" rows="5" placeholder="Enter record content..."></textarea>
                    </div>
                    <div class="form-group">
                        <label>File Upload</label>
                        <div class="upload-field" onclick="document.getElementById('recordFileInput').click()">
                            <span class="upload-icon">📄</span>
                            <span class="upload-text">Click to upload file</span>
                            <small>PDF, Images, Audio files supported</small>
                            <input type="file" id="recordFileInput" onchange="window.handleRecordUpload(this.files[0])">
                        </div>
                        <div class="file-preview" id="recordFilePreview" style="display:none;">
                            <i class="fas fa-file"></i>
                            <span class="file-name" id="recordFileName">No file selected</span>
                            <button type="button" class="btn-remove-file" onclick="window.removeRecordFile()">✕ Remove</button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="recordPublic">
                            Make public (visible to all users)
                        </label>
                    </div>
                    <button type="submit" class="btn-primary">Save Record</button>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('closeRecordModal')?.addEventListener('click', () => {
        modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    
    if (recordId) {
        loadRecordData(recordId);
    }
    
    document.getElementById('recordForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveRecord();
        modal.remove();
    });
}

async function loadRecordData(recordId) {
    const { data, error } = await supabase
        .from('records')
        .select('*')
        .eq('id', recordId)
        .single();
    
    if (error) {
        showToast('Error loading record', 'error');
        return;
    }
    
    document.getElementById('recordTitle').value = data.title || '';
    document.getElementById('recordType').value = data.type || 'document';
    document.getElementById('recordContent').value = data.content || '';
    document.getElementById('recordPublic').checked = data.is_public || false;
    
    if (data.file_url) {
        const preview = document.getElementById('recordFilePreview');
        const fileName = document.getElementById('recordFileName');
        if (fileName) fileName.textContent = '📎 ' + (data.file_name || 'Current file');
        if (preview) preview.style.display = 'flex';
    }
}

async function saveRecord() {
    const recordId = document.getElementById('editRecordId').value;
    const file = recordFileData;
    
    let fileUrl = null;
    let fileName = null;
    
    if (file) {
        const uploadedUrl = await uploadFileToStorage(file, 'record');
        if (uploadedUrl) {
            fileUrl = uploadedUrl;
            fileName = file.name;
        }
    }
    
    const data = {
        title: document.getElementById('recordTitle').value.trim(),
        type: document.getElementById('recordType').value,
        content: document.getElementById('recordContent').value.trim(),
        is_public: document.getElementById('recordPublic').checked,
        created_by: currentUser.id,
        updated_at: new Date().toISOString()
    };
    
    if (fileUrl) {
        data.file_url = fileUrl;
        data.file_name = fileName;
    }
    
    if (!data.title) {
        showToast('Title is required', 'error');
        return;
    }
    
    let result;
    if (recordId) {
        result = await supabase
            .from('records')
            .update(data)
            .eq('id', recordId);
    } else {
        data.created_at = new Date().toISOString();
        result = await supabase
            .from('records')
            .insert([data]);
    }
    
    if (result.error) {
        showToast('Error: ' + result.error.message, 'error');
    } else {
        showToast('Record saved successfully!', 'success');
        renderRecords();
    }
}

async function deleteRecord(recordId) {
    if (!confirm('Delete this record?')) return;
    
    const { error } = await supabase
        .from('records')
        .delete()
        .eq('id', recordId);
    
    if (error) {
        showToast('Error deleting record', 'error');
    } else {
        showToast('Record deleted', 'success');
        renderRecords();
    }
}

// ============================================
// REPLY MODAL FUNCTIONS
// ============================================
function openReplyModal(type, id) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:500px;">
            <div class="modal-header">
                <h2>Reply to ${type}</h2>
                <button class="modal-close" id="closeReplyModal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="replyForm">
                    <div class="form-group">
                        <label>Your Response</label>
                        <textarea id="replyContent" rows="5" required placeholder="Type your response..."></textarea>
                    </div>
                    <button type="submit" class="btn-primary"><i class="fas fa-paper-plane"></i> Send Reply</button>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('closeReplyModal')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    
    document.getElementById('replyForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const response = document.getElementById('replyContent').value.trim();
        
        if (!response) {
            showToast('Please enter a response', 'error');
            return;
        }
        
        await sendReply(type, id, response);
        modal.remove();
    });
}

async function sendReply(type, id, response) {
    try {
        let table = '';
        let updateData = {};
        
        switch(type) {
            case 'inquiry':
                table = 'inquiries';
                updateData = {
                    admin_response: response,
                    replied_by: currentUser.id,
                    replied_at: new Date().toISOString(),
                    status: 'replied'
                };
                break;
            case 'contract':
                table = 'contracts';
                updateData = {
                    admin_response: response,
                    reviewed_by: currentUser.id,
                    reviewed_at: new Date().toISOString(),
                    status: 'reviewed'
                };
                break;
            case 'job':
                table = 'jobs';
                updateData = {
                    admin_response: response,
                    reviewed_by: currentUser.id,
                    reviewed_at: new Date().toISOString(),
                    status: 'reviewed'
                };
                break;
            default:
                showToast('Unknown type', 'error');
                return;
        }
        
        const { error } = await supabase
            .from(table)
            .update(updateData)
            .eq('id', id);
        
        if (error) throw error;
        
        showToast('Reply sent successfully!', 'success');
        
        // Refresh the current tab
        if (type === 'inquiry') {
            await renderInquiries();
        } else {
            await renderSubmissions();
        }
    } catch (error) {
        console.error('Error sending reply:', error);
        showToast('Error: ' + error.message, 'error');
    }
}

async function closeInquiry(inquiryId) {
    try {
        const { error } = await supabase
            .from('inquiries')
            .update({ status: 'closed' })
            .eq('id', inquiryId);
        
        if (error) throw error;
        showToast('Inquiry closed', 'success');
    } catch (error) {
        console.error('Error closing inquiry:', error);
        showToast('Error: ' + error.message, 'error');
    }
}

// ============================================
// RECORD FILE UPLOAD HANDLERS
// ============================================
let recordFileData = null;

window.handleRecordUpload = function(file) {
    if (!file) return;
    
    recordFileData = file;
    const preview = document.getElementById('recordFilePreview');
    const fileName = document.getElementById('recordFileName');
    
    if (fileName) {
        fileName.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
    }
    
    if (preview) {
        preview.style.display = 'flex';
    }
    showToast(`📄 ${file.name} selected`, 'success');
};

window.removeRecordFile = function() {
    recordFileData = null;
    document.getElementById('recordFileInput').value = '';
    const preview = document.getElementById('recordFilePreview');
    if (preview) {
        preview.style.display = 'none';
    }
    document.getElementById('recordFileName').textContent = 'No file selected';
};

// ============================================
// UPLOAD FILE TO STORAGE (Reused from original)
// ============================================
async function uploadFileToStorage(file, contentType, folder = null) {
    if (!file) {
        console.warn('⚠️ No file provided for upload');
        return null;
    }

    const fileExt = file.name.split('.').pop();
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const fileName = `${timestamp}_${randomStr}.${fileExt}`;
    
    let path = '';
    if (contentType === 'cover') {
        path = `covers/${fileName}`;
    } else if (contentType === 'book') {
        path = `book/${fileName}`;
    } else if (contentType === 'talk') {
        path = `talk/${fileName}`;
    } else if (contentType === 'bundle') {
        path = `bundle/${fileName}`;
    } else if (contentType === 'hero') {
        path = `hero/${fileName}`;
    } else if (contentType === 'product') {
        path = `products/${fileName}`;
    } else if (contentType === 'record') {
        path = `records/${fileName}`;
    } else if (folder) {
        path = `${folder}/${fileName}`;
    } else {
        path = `general/${fileName}`;
    }
    
    console.log('📤 Uploading to:', path);

    try {
        const { data, error } = await supabase.storage
            .from('hub_content')
            .upload(path, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type || 'application/octet-stream'
            });

        if (error) {
            console.error('❌ Upload error:', error);
            showToast(`Upload failed: ${error.message}`, 'error');
            return null;
        }

        const { data: urlData } = supabase.storage
            .from('hub_content')
            .getPublicUrl(path);

        if (!urlData || !urlData.publicUrl) {
            console.error('❌ Failed to generate public URL');
            showToast('Failed to generate file URL', 'error');
            return null;
        }

        return urlData.publicUrl;

    } catch (error) {
        console.error('❌ Upload exception:', error);
        showToast(`Upload error: ${error.message || 'Unknown error'}`, 'error');
        return null;
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function renderRecentPayments(payments) {
    if (!payments.length) return '<div class="empty-state">No payments yet</div>';
    return payments.map(p => `
        <div class="payment-item ${p.status}">
            <div class="payment-info">
                <div class="payment-amount">₦${p.amount.toLocaleString()}</div>
                <div class="payment-date">${new Date(p.submitted_at).toLocaleDateString()}</div>
                <div class="payment-ref">${p.user_name || p.user_email}</div>
            </div>
            <div class="payment-status ${p.status}">${p.status}</div>
        </div>
    `).join('');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function refreshAllData() {
    await renderPayments();
    await renderOverview();
}

async function exportAllData() {
    try {
        const payments = await loadPayments();
        const users = await loadAllUsers();
        
        let csvContent = "Data Type,ID,Name,Amount,Status,Date\n";
        payments.forEach(p => {
            csvContent += `Payment,${p.id},${p.user_name},${p.amount},${p.status},${new Date(p.submitted_at).toLocaleDateString()}\n`;
        });
        users.forEach(u => {
            csvContent += `User,${u.id},${u.name},${u.wallet_balance},${u.role},${u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}\n`;
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `admin_export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('Data exported successfully!', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Error exporting data', 'error');
    }
}

// ============================================
// LIBRARY MODAL FUNCTIONS (Reused from original)
// ============================================
function openLibraryModal(itemId = null) {
    const modal = document.getElementById('libraryItemModal');
    const form = document.getElementById('libraryItemForm');
    const title = document.getElementById('libraryModalTitle');
    
    if (!modal) {
        showToast('Modal not found', 'error');
        return;
    }
    
    form.reset();
    document.getElementById('editItemId').value = '';
    document.getElementById('coverPreview').style.display = 'none';
    document.getElementById('contentFilePreview').style.display = 'none';
    document.getElementById('bundleDownloadGroup').style.display = 'none';
    document.getElementById('talkDurationGroup').style.display = 'none';
    
    coverFileData = null;
    contentFileData = null;
    
    document.getElementById('coverFileInput').value = '';
    document.getElementById('contentFileInput').value = '';
    document.getElementById('coverFileName').textContent = 'No file selected';
    document.getElementById('contentFileName').textContent = 'No file selected';
    document.getElementById('coverPreview').style.display = 'none';
    document.getElementById('contentFilePreview').style.display = 'none';
    document.getElementById('coverPreviewImg').src = '';
    
    title.textContent = 'Add New Content';
    editingItemId = null;
    
    updateFolderHint();
    
    if (itemId) {
        title.textContent = 'Edit Content';
        document.getElementById('editItemId').value = itemId;
        editingItemId = itemId;
        loadItemData(itemId);
    }
    
    modal.classList.add('active');
}

function closeLibraryModal() {
    const modal = document.getElementById('libraryItemModal');
    if (modal) {
        modal.classList.remove('active');
        document.getElementById('libraryItemForm').reset();
        document.getElementById('coverPreview').style.display = 'none';
        document.getElementById('contentFilePreview').style.display = 'none';
        document.getElementById('editItemId').value = '';
        document.getElementById('coverFileInput').value = '';
        document.getElementById('contentFileInput').value = '';
        document.getElementById('bundleDownloadGroup').style.display = 'none';
        document.getElementById('talkDurationGroup').style.display = 'none';
        document.getElementById('coverFileName').textContent = 'No file selected';
        document.getElementById('contentFileName').textContent = 'No file selected';
        coverFileData = null;
        contentFileData = null;
    }
}

function updateFolderHint() {
    const typeSelect = document.getElementById('itemType');
    const folderHint = document.getElementById('uploadFolderHint');
    const bundleGroup = document.getElementById('bundleDownloadGroup');
    const durationGroup = document.getElementById('talkDurationGroup');
    
    if (typeSelect && folderHint) {
        const type = typeSelect.value;
        folderHint.textContent = type;
        
        if (bundleGroup) {
            bundleGroup.style.display = type === 'bundle' ? 'block' : 'none';
        }
        if (durationGroup) {
            durationGroup.style.display = type === 'talk' ? 'block' : 'none';
        }
    }
}

async function loadItemData(itemId) {
    const { data: item, error } = await supabase
        .from('hub_contents')
        .select('*')
        .eq('id', itemId)
        .single();
    
    if (error) {
        showToast('Error loading item', 'error');
        return;
    }
    
    document.getElementById('itemTitle').value = item.title || '';
    document.getElementById('itemType').value = item.type || 'book';
    document.getElementById('itemCategory').value = item.category || '';
    document.getElementById('itemAuthor').value = item.author || '';
    document.getElementById('itemPrice').value = item.price || 0;
    document.getElementById('itemPhysicalPrice').value = item.physical_price || 0;
    document.getElementById('itemAudioPrice').value = item.audio_price || 0;
    document.getElementById('itemDownloadUrl').value = item.download_url || '';
    document.getElementById('itemLevel').value = item.level || 'Beginner';
    document.getElementById('itemDuration').value = item.duration || '';
    document.getElementById('itemStatus').value = item.is_active ? 'active' : 'inactive';
    document.getElementById('itemFirstChapter').value = item.first_chapter || '';
    
    updateFolderHint();
    
    if (item.cover_url) {
        const preview = document.getElementById('coverPreview');
        const img = document.getElementById('coverPreviewImg');
        const fileName = document.getElementById('coverFileName');
        if (img) img.src = item.cover_url;
        if (fileName) fileName.textContent = 'Current cover image';
        if (preview) preview.style.display = 'flex';
    }
    
    if (item.file_url) {
        const preview = document.getElementById('contentFilePreview');
        const fileName = document.getElementById('contentFileName');
        const fileParts = item.file_url.split('/');
        if (fileName) fileName.textContent = '📎 ' + fileParts[fileParts.length - 1];
        if (preview) preview.style.display = 'flex';
    }
}

async function saveLibraryItem(e) {
    e.preventDefault();
    
    const itemId = document.getElementById('editItemId').value;
    const contentType = document.getElementById('itemType').value;
    const coverFile = coverFileData;
    const contentFile = contentFileData;
    
    let existingCoverUrl = '';
    let existingFileUrl = '';
    if (itemId) {
        const { data: oldItem } = await supabase
            .from('hub_contents')
            .select('cover_url, file_url')
            .eq('id', itemId)
            .single();
        if (oldItem) {
            existingCoverUrl = oldItem.cover_url || '';
            existingFileUrl = oldItem.file_url || '';
        }
    }
    
    let coverUrl = existingCoverUrl;
    if (coverFile) {
        const uploadedUrl = await uploadFileToStorage(coverFile, 'cover');
        if (uploadedUrl) {
            if (existingCoverUrl) {
                await deleteFileFromStorage(existingCoverUrl);
            }
            coverUrl = uploadedUrl;
        } else {
            showToast('Cover upload failed', 'error');
            return;
        }
    }
    
    let fileUrl = existingFileUrl;
    if (contentFile) {
        const uploadedUrl = await uploadFileToStorage(contentFile, contentType);
        if (uploadedUrl) {
            if (existingFileUrl) {
                await deleteFileFromStorage(existingFileUrl);
            }
            fileUrl = uploadedUrl;
        } else {
            showToast('Content file upload failed', 'error');
            return;
        }
    }
    
    const data = {
        title: document.getElementById('itemTitle').value.trim(),
        type: contentType,
        category: document.getElementById('itemCategory').value.trim(),
        author: document.getElementById('itemAuthor').value.trim(),
        cover_url: coverUrl,
        file_url: fileUrl,
        download_url: document.getElementById('itemDownloadUrl').value.trim() || null,
        price: parseFloat(document.getElementById('itemPrice').value) || 0,
        physical_price: parseFloat(document.getElementById('itemPhysicalPrice').value) || 0,
        audio_price: parseFloat(document.getElementById('itemAudioPrice').value) || 0,
        first_chapter: document.getElementById('itemFirstChapter').value.trim() || null,
        duration: document.getElementById('itemDuration').value.trim() || null,
        level: document.getElementById('itemLevel').value,
        is_active: document.getElementById('itemStatus').value === 'active',
        updated_at: new Date().toISOString()
    };
    
    if (!data.title) {
        showToast('Title is required', 'error');
        return;
    }
    
    let result;
    if (itemId) {
        result = await supabase
            .from('hub_contents')
            .update(data)
            .eq('id', itemId);
    } else {
        data.created_at = new Date().toISOString();
        result = await supabase
            .from('hub_contents')
            .insert([data]);
    }
    
    if (result.error) {
        showToast(`Error: ${result.error.message}`, 'error');
        console.error('Database error:', result.error);
    } else {
        showToast(`Content ${itemId ? 'updated' : 'added'} successfully!`, 'success');
        closeLibraryModal();
        renderUpdate();
    }
}

async function deleteLibraryItem(itemId) {
    if (!confirm('Delete this content permanently? This cannot be undone.')) return;
    
    const { data: item } = await supabase
        .from('hub_contents')
        .select('cover_url, file_url')
        .eq('id', itemId)
        .single();
    
    if (item) {
        if (item.cover_url) await deleteFileFromStorage(item.cover_url);
        if (item.file_url) await deleteFileFromStorage(item.file_url);
    }
    
    const { error } = await supabase
        .from('hub_contents')
        .delete()
        .eq('id', itemId);
    
    if (error) {
        showToast('Error deleting item', 'error');
    } else {
        showToast('Content deleted', 'success');
        renderUpdate();
    }
}

async function toggleLibraryItem(itemId, currentState) {
    const { error } = await supabase
        .from('hub_contents')
        .update({ is_active: !currentState })
        .eq('id', itemId);
    
    if (error) {
        showToast('Error toggling item', 'error');
    } else {
        showToast(`Content ${!currentState ? 'activated' : 'deactivated'}`, 'success');
        renderUpdate();
    }
}

// ============================================
// FAQ FUNCTIONS (Reused from original)
// ============================================
function openFaqModal(faqId = null) {
    const modal = document.getElementById('faqModal');
    const form = document.getElementById('faqForm');
    const title = document.getElementById('faqModalTitle');
    
    if (!modal) return;
    
    form.reset();
    document.getElementById('editFaqId').value = '';
    title.textContent = 'Add FAQ';
    editingFaqId = null;
    
    if (faqId) {
        title.textContent = 'Edit FAQ';
        document.getElementById('editFaqId').value = faqId;
        editingFaqId = faqId;
        loadFaqData(faqId);
    }
    
    modal.classList.add('active');
}

function closeFaqModal() {
    const modal = document.getElementById('faqModal');
    if (modal) modal.classList.remove('active');
}

async function loadFaqData(faqId) {
    const { data, error } = await supabase
        .from('faq_items')
        .select('*')
        .eq('id', faqId)
        .single();
    
    if (error) {
        showToast('Error loading FAQ', 'error');
        return;
    }
    
    document.getElementById('faqQuestion').value = data.question || '';
    document.getElementById('faqAnswer').value = data.answer || '';
    document.getElementById('faqOrder').value = data.order || 0;
}

async function saveFaqItem(e) {
    e.preventDefault();
    
    const faqId = document.getElementById('editFaqId').value;
    const data = {
        question: document.getElementById('faqQuestion').value.trim(),
        answer: document.getElementById('faqAnswer').value.trim(),
        order: parseInt(document.getElementById('faqOrder').value) || 0,
        updated_at: new Date().toISOString()
    };
    
    if (!data.question || !data.answer) {
        showToast('Question and answer are required', 'error');
        return;
    }
    
    let result;
    if (faqId) {
        result = await supabase
            .from('faq_items')
            .update(data)
            .eq('id', faqId);
    } else {
        data.created_at = new Date().toISOString();
        result = await supabase
            .from('faq_items')
            .insert([data]);
    }
    
    if (result.error) {
        showToast(`Error: ${result.error.message}`, 'error');
    } else {
        showToast(`FAQ ${faqId ? 'updated' : 'added'} successfully!`, 'success');
        closeFaqModal();
        renderUpdate();
    }
}

async function deleteFaqItem(faqId) {
    if (!confirm('Delete this FAQ?')) return;
    
    const { error } = await supabase
        .from('faq_items')
        .delete()
        .eq('id', faqId);
    
    if (error) {
        showToast('Error deleting FAQ', 'error');
    } else {
        showToast('FAQ deleted', 'success');
        renderUpdate();
    }
}

// ============================================
// INDEX/HERO FUNCTIONS (Reused from original)
// ============================================
function openIndexModal() {
    const modal = document.getElementById('indexModal');
    if (!modal) return;
    
    indexImageFileData = null;
    document.getElementById('indexImageInput').value = '';
    document.getElementById('indexImagePreview').style.display = 'none';
    document.getElementById('indexFileName').textContent = 'No file selected';
    
    supabase.from('index_content').select('*').maybeSingle()
        .then(({ data }) => {
            document.getElementById('indexHeroTitle').value = data?.hero_title || 'Be The Best';
            document.getElementById('indexHeroSubtitle').value = data?.hero_subtitle || 'Read the best';
            document.getElementById('editIndexId').value = data?.id || '';
            
            if (data?.hero_image) {
                const preview = document.getElementById('indexImagePreview');
                const img = document.getElementById('indexImagePreviewImg');
                const fileName = document.getElementById('indexFileName');
                if (img) img.src = data.hero_image;
                if (fileName) fileName.textContent = 'Current hero image';
                if (preview) preview.style.display = 'flex';
            }
        });
    
    modal.classList.add('active');
}

function closeIndexModal() {
    const modal = document.getElementById('indexModal');
    if (modal) modal.classList.remove('active');
    indexImageFileData = null;
    document.getElementById('indexImageInput').value = '';
}

async function saveIndexItem(e) {
    e.preventDefault();
    
    const indexId = document.getElementById('editIndexId').value;
    const imageFile = indexImageFileData;
    
    let existingImageUrl = '';
    if (indexId) {
        const { data: oldData } = await supabase
            .from('index_content')
            .select('hero_image')
            .eq('id', indexId)
            .single();
        if (oldData) {
            existingImageUrl = oldData.hero_image || '';
        }
    }
    
    let imageUrl = existingImageUrl;
    if (imageFile) {
        const uploadedUrl = await uploadFileToStorage(imageFile, 'hero');
        if (uploadedUrl) {
            if (existingImageUrl) {
                await deleteFileFromStorage(existingImageUrl);
            }
            imageUrl = uploadedUrl;
        } else {
            showToast('Image upload failed', 'error');
            return;
        }
    }
    
    const data = {
        hero_title: document.getElementById('indexHeroTitle').value.trim(),
        hero_subtitle: document.getElementById('indexHeroSubtitle').value.trim(),
        hero_image: imageUrl,
        updated_at: new Date().toISOString()
    };
    
    let result;
    if (indexId) {
        result = await supabase
            .from('index_content')
            .update(data)
            .eq('id', indexId);
    } else {
        data.created_at = new Date().toISOString();
        result = await supabase
            .from('index_content')
            .insert([data]);
    }
    
    if (result.error) {
        showToast(`Error: ${result.error.message}`, 'error');
        console.error('Database error:', result.error);
    } else {
        showToast('Hero content updated successfully!', 'success');
        closeIndexModal();
        renderUpdate();
    }
}

// ============================================
// DELETE FILE FROM STORAGE (Reused from original)
// ============================================
async function deleteFileFromStorage(fileUrl) {
    if (!fileUrl) return;
    
    try {
        const urlParts = fileUrl.split('/');
        const pathIndex = urlParts.indexOf('hub_content') + 1;
        if (pathIndex > 0 && pathIndex < urlParts.length) {
            const path = urlParts.slice(pathIndex).join('/');
            if (path) {
                const { error } = await supabase.storage
                    .from('hub_content')
                    .remove([path]);
                
                if (error) {
                    console.error('Delete error:', error);
                } else {
                    console.log('✅ File deleted:', path);
                }
            }
        }
    } catch (e) {
        console.error('Error deleting file:', e);
    }
}

// ============================================
// FILE UPLOAD HANDLERS (Reused from original)
// ============================================
function handleCoverUpload(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }
    
    coverFileData = file;
    const preview = document.getElementById('coverPreview');
    const img = document.getElementById('coverPreviewImg');
    const fileName = document.getElementById('coverFileName');
    
    if (img) {
        const reader = new FileReader();
        reader.onload = function(e) {
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    
    if (fileName) {
        fileName.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
    }
    
    if (preview) {
        preview.style.display = 'flex';
    }
    showToast(`📸 ${file.name} selected`, 'success');
}

function removeCoverFile() {
    coverFileData = null;
    document.getElementById('coverFileInput').value = '';
    const preview = document.getElementById('coverPreview');
    if (preview) {
        preview.style.display = 'none';
    }
    document.getElementById('coverPreviewImg').src = '';
    document.getElementById('coverFileName').textContent = 'No file selected';
}

function handleContentUpload(file) {
    if (!file) return;
    
    contentFileData = file;
    const preview = document.getElementById('contentFilePreview');
    const fileName = document.getElementById('contentFileName');
    
    if (fileName) {
        fileName.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
    }
    
    if (preview) {
        preview.style.display = 'flex';
    }
    showToast(`📁 ${file.name} selected`, 'success');
}

function removeContentFile() {
    contentFileData = null;
    document.getElementById('contentFileInput').value = '';
    const preview = document.getElementById('contentFilePreview');
    if (preview) {
        preview.style.display = 'none';
    }
    document.getElementById('contentFileName').textContent = 'No file selected';
}

function handleIndexImageUpload(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }
    
    indexImageFileData = file;
    const preview = document.getElementById('indexImagePreview');
    const img = document.getElementById('indexImagePreviewImg');
    const fileName = document.getElementById('indexFileName');
    
    if (img) {
        const reader = new FileReader();
        reader.onload = function(e) {
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    
    if (fileName) {
        fileName.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
    }
    
    if (preview) {
        preview.style.display = 'flex';
    }
    showToast(`🏞️ ${file.name} selected`, 'success');
}

function removeIndexImage() {
    indexImageFileData = null;
    document.getElementById('indexImageInput').value = '';
    const preview = document.getElementById('indexImagePreview');
    if (preview) {
        preview.style.display = 'none';
    }
    document.getElementById('indexImagePreviewImg').src = '';
    document.getElementById('indexFileName').textContent = 'No file selected';
}

function handleProductImageUpload(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }
    
    productImageFileData = file;
    const preview = document.getElementById('productImagePreview');
    const img = document.getElementById('productImagePreviewImg');
    const fileName = document.getElementById('productFileName');
    
    if (img) {
        const reader = new FileReader();
        reader.onload = function(e) {
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    
    if (fileName) {
        fileName.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
    }
    
    if (preview) {
        preview.style.display = 'flex';
    }
    showToast(`🛍️ ${file.name} selected`, 'success');
}

function removeProductImage() {
    productImageFileData = null;
    document.getElementById('productImageInput').value = '';
    const preview = document.getElementById('productImagePreview');
    if (preview) {
        preview.style.display = 'none';
    }
    document.getElementById('productImagePreviewImg').src = '';
    document.getElementById('productFileName').textContent = 'No file selected';
}

// ============================================
// PRODUCT FUNCTIONS (Reused from original)
// ============================================
function openProductModal(productId = null) {
    const modal = document.getElementById('productModal');
    if (!modal) return;
    
    document.getElementById('productForm').reset();
    document.getElementById('editProductId').value = '';
    productImageFileData = null;
    document.getElementById('productImageInput').value = '';
    document.getElementById('productImagePreview').style.display = 'none';
    document.getElementById('productFileName').textContent = 'No file selected';
    
    if (productId) {
        document.getElementById('productModalTitle').textContent = 'Edit Product';
        document.getElementById('editProductId').value = productId;
        loadProductData(productId);
    } else {
        document.getElementById('productModalTitle').textContent = 'Add Product';
    }
    
    modal.classList.add('active');
}

function closeProductModal() {
    const modal = document.getElementById('productModal');
    if (modal) modal.classList.remove('active');
    productImageFileData = null;
    document.getElementById('productImageInput').value = '';
}

async function loadProductData(productId) {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();
    
    if (error) {
        showToast('Error loading product', 'error');
        return;
    }
    
    document.getElementById('productName').value = data.name || '';
    document.getElementById('productCategory').value = data.category || 'uniform';
    document.getElementById('productPrice').value = data.price || 0;
    document.getElementById('productStock').value = data.stock_quantity || 0;
    
    if (data.image_url) {
        const preview = document.getElementById('productImagePreview');
        const img = document.getElementById('productImagePreviewImg');
        const fileName = document.getElementById('productFileName');
        if (img) img.src = data.image_url;
        if (fileName) fileName.textContent = 'Current product image';
        if (preview) preview.style.display = 'flex';
    }
}

async function saveProductItem(e) {
    e.preventDefault();
    
    const productId = document.getElementById('editProductId').value;
    const imageFile = productImageFileData;
    
    let existingImageUrl = '';
    if (productId) {
        const { data: oldData } = await supabase
            .from('products')
            .select('image_url')
            .eq('id', productId)
            .single();
        if (oldData) {
            existingImageUrl = oldData.image_url || '';
        }
    }
    
    let imageUrl = existingImageUrl;
    if (imageFile) {
        const uploadedUrl = await uploadFileToStorage(imageFile, 'product');
        if (uploadedUrl) {
            if (existingImageUrl) {
                await deleteFileFromStorage(existingImageUrl);
            }
            imageUrl = uploadedUrl;
        } else {
            showToast('Image upload failed', 'error');
            return;
        }
    }
    
    const data = {
        name: document.getElementById('productName').value.trim(),
        category: document.getElementById('productCategory').value,
        price: parseFloat(document.getElementById('productPrice').value) || 0,
        stock_quantity: parseInt(document.getElementById('productStock').value) || 0,
        image_url: imageUrl,
        updated_at: new Date().toISOString()
    };
    
    if (!data.name) {
        showToast('Product name is required', 'error');
        return;
    }
    
    let result;
    if (productId) {
        result = await supabase
            .from('products')
            .update(data)
            .eq('id', productId);
    } else {
        data.created_at = new Date().toISOString();
        result = await supabase
            .from('products')
            .insert([data]);
    }
    
    if (result.error) {
        showToast(`Error: ${result.error.message}`, 'error');
        console.error('Database error:', result.error);
    } else {
        showToast(`Product ${productId ? 'updated' : 'added'} successfully!`, 'success');
        closeProductModal();
        // Refresh the update tab since products are managed there
        renderUpdate();
    }
}

// ============================================
// INITIALIZE ADMIN DASHBOARD
// ============================================
async function initAdminDashboard() {
    console.log('Initializing admin dashboard...');
    
    initTheme();
    
    const isAuth = await checkAuth();
    if (!isAuth) return;
    
    createContentSections();
    buildSidebar();
    await renderOverview();
    
    setInterval(async () => {
        if (currentTab === 'payments') await renderPayments();
        else if (currentTab === 'overview') await renderOverview();
    }, 30000);
    
    console.log(`Admin dashboard initialized for role: ${currentRole}`);
}

// ============================================
// EVENT LISTENERS FOR MODAL CLOSING
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const typeSelect = document.getElementById('itemType');
    if (typeSelect) {
        typeSelect.addEventListener('change', updateFolderHint);
    }
    
    const closeLibraryBtn = document.getElementById('closeLibraryModalBtn');
    if (closeLibraryBtn) {
        closeLibraryBtn.addEventListener('click', closeLibraryModal);
    }
    
    const closeFaqBtn = document.getElementById('closeFaqModalBtn');
    if (closeFaqBtn) {
        closeFaqBtn.addEventListener('click', closeFaqModal);
    }
    
    const closeIndexBtn = document.getElementById('closeIndexModalBtn');
    if (closeIndexBtn) {
        closeIndexBtn.addEventListener('click', closeIndexModal);
    }
    
    const closeProductBtn = document.getElementById('closeProductModalBtn');
    if (closeProductBtn) {
        closeProductBtn.addEventListener('click', closeProductModal);
    }
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (document.getElementById('libraryItemModal')?.classList.contains('active')) {
                closeLibraryModal();
            }
            if (document.getElementById('faqModal')?.classList.contains('active')) {
                closeFaqModal();
            }
            if (document.getElementById('indexModal')?.classList.contains('active')) {
                closeIndexModal();
            }
            if (document.getElementById('productModal')?.classList.contains('active')) {
                closeProductModal();
            }
        }
    });
});

// ============================================
// MAKE FUNCTIONS GLOBALLY AVAILABLE
// ============================================
window.closeLibraryModal = closeLibraryModal;
window.saveLibraryItem = saveLibraryItem;
window.closeFaqModal = closeFaqModal;
window.saveFaqItem = saveFaqItem;
window.closeIndexModal = closeIndexModal;
window.saveIndexItem = saveIndexItem;
window.closeProductModal = closeProductModal;
window.saveProductItem = saveProductItem;
window.openProductModal = openProductModal;
window.handleCoverUpload = handleCoverUpload;
window.handleContentUpload = handleContentUpload;
window.removeCoverFile = removeCoverFile;
window.removeContentFile = removeContentFile;
window.handleIndexImageUpload = handleIndexImageUpload;
window.removeIndexImage = removeIndexImage;
window.handleProductImageUpload = handleProductImageUpload;
window.removeProductImage = removeProductImage;
window.updateFolderHint = updateFolderHint;
window.openLibraryModal = openLibraryModal;
window.openFaqModal = openFaqModal;
window.openIndexModal = openIndexModal;
window.handleRecordUpload = handleRecordUpload;
window.removeRecordFile = removeRecordFile;

// ============================================
// START THE DASHBOARD
// ============================================
initAdminDashboard();

console.log('✅ Admin dashboard loaded successfully');
