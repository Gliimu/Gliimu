// ============================================
// ADMIN DASHBOARD - COMPLETE ROLE-BASED SYSTEM
// Roles: Founder, CRM, Secretary, Manager
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// Global state
let currentUser = null;
let currentRole = null;
let currentTab = 'dashboard';
let currentPaymentFilter = 'pending';
let allPayments = [];
let allStudents = [];
let allProducts = [];
let allExpenses = [];
let allDisbursements = [];
let allSubmissions = [];
let allEvents = [];
let allContacts = [];
let allPartnerships = [];
let allOffers = [];
let refreshInterval = null;

// ============================================
// ROLE-BASED TAB CONFIGURATION
// ============================================

const roleTabs = {
    founder: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'payments', name: 'Payments', icon: 'fas fa-wallet' },
        { id: 'students', name: 'Students', icon: 'fas fa-users' },
        { id: 'library', name: 'Library Manager', icon: 'fas fa-book' },
        { id: 'inventory', name: 'Inventory', icon: 'fas fa-boxes' },
        { id: 'finance', name: 'Finance', icon: 'fas fa-chart-line' },
        { id: 'posts', name: 'Update Website', icon: 'fas fa-pen' },
        { id: 'submissions', name: 'User Submissions', icon: 'fas fa-briefcase' },
        { id: 'events', name: 'Hosted Events', icon: 'fas fa-calendar-star' },
        { id: 'contacts', name: 'Contacts', icon: 'fas fa-address-book' },
        { id: 'partnerships', name: 'Partnerships', icon: 'fas fa-handshake' },
        { id: 'peering', name: 'Instructor to Students', icon: 'fas fa-chalkboard-user' },
        { id: 'offers', name: 'Student Work Offers', icon: 'fas fa-briefcase' },
        { id: 'sales', name: 'Store Sales', icon: 'fas fa-chart-simple' }
    ],
    crm: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'posts', name: 'Update Website', icon: 'fas fa-pen' },
        { id: 'submissions', name: 'User Submissions', icon: 'fas fa-briefcase' },
        { id: 'events', name: 'Hosted Events', icon: 'fas fa-calendar-star' },
        { id: 'contacts', name: 'Contacts', icon: 'fas fa-address-book' }
    ],
    secretary: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'payments', name: 'Payments', icon: 'fas fa-cash-register' },
        { id: 'sales', name: 'Store Sales', icon: 'fas fa-chart-simple' },
        { id: 'inventory', name: 'Inventory', icon: 'fas fa-boxes' },
        { id: 'finance', name: 'Finance', icon: 'fas fa-chart-line' }
    ],
    manager: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'partnerships', name: 'Partnership Agreements', icon: 'fas fa-handshake' },
        { id: 'peering', name: 'Instructor to Students', icon: 'fas fa-chalkboard-user' },
        { id: 'offers', name: 'Student Work Offers', icon: 'fas fa-briefcase' },
        { id: 'students', name: 'Students & Status', icon: 'fas fa-chart-bar' }
    ]
};

// ============================================
// AUTHENTICATION CHECK WITH ROLE
// ============================================
async function checkAuth() {
    console.log('Checking admin authentication...');
    
    const devMode = localStorage.getItem('dev_admin_mode') === 'true';
    if (devMode) {
        console.log('Dev admin mode enabled');
        currentUser = { id: 'dev_admin', email: 'admin@test.com', role: 'founder' };
        currentRole = 'founder';
        document.getElementById('adminName').textContent = 'Founder (Dev Mode)';
        document.getElementById('adminRole').textContent = 'Founder';
        return true;
    }
    
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
        console.error('Auth error:', error);
        showToast('Please login as admin', 'error');
        setTimeout(() => window.location.href = '/signin.html', 1500);
        return false;
    }
    
    // Get user profile with role
    const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, name')
        .eq('id', user.id)
        .single();
    
    if (profileError) {
        console.error('Profile error:', profileError);
    }
    
    const userRole = profile?.role || 'secretary'; // Default to secretary
    currentRole = userRole;
    currentUser = user;
    
    // Update UI
    const roleNames = {
        founder: 'Founder',
        crm: 'CRM Manager',
        secretary: 'Secretary',
        manager: 'Operations Manager'
    };
    
    document.getElementById('adminName').textContent = profile?.name || 'Admin';
    document.getElementById('adminRole').textContent = roleNames[userRole] || userRole;
    
    return true;
}

// ============================================
// BUILD SIDEBAR BASED ON ROLE
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
// CREATE CONTENT SECTIONS FOR ALL TABS
// ============================================
function createContentSections() {
    const dashboardContent = document.getElementById('dashboardContent');
    if (!dashboardContent) return;
    
    dashboardContent.innerHTML = `
        <div id="dashboard-section" class="admin-tab active"><div class="loading">Loading dashboard...</div></div>
        <div id="payments-section" class="admin-tab"><div class="loading">Loading payments...</div></div>
        <div id="students-section" class="admin-tab"><div class="loading">Loading students...</div></div>
        <div id="library-section" class="admin-tab"><div class="loading">Loading library...</div></div>
        <div id="inventory-section" class="admin-tab"><div class="loading">Loading inventory...</div></div>
        <div id="finance-section" class="admin-tab"><div class="loading">Loading finance...</div></div>
        <div id="posts-section" class="admin-tab"><div class="loading">Loading posts...</div></div>
        <div id="submissions-section" class="admin-tab"><div class="loading">Loading submissions...</div></div>
        <div id="events-section" class="admin-tab"><div class="loading">Loading events...</div></div>
        <div id="contacts-section" class="admin-tab"><div class="loading">Loading contacts...</div></div>
        <div id="partnerships-section" class="admin-tab"><div class="loading">Loading partnerships...</div></div>
        <div id="peering-section" class="admin-tab"><div class="loading">Loading peering...</div></div>
        <div id="offers-section" class="admin-tab"><div class="loading">Loading offers...</div></div>
        <div id="sales-section" class="admin-tab"><div class="loading">Loading sales...</div></div>
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
        case 'dashboard': await renderDashboard(); break;
        case 'payments': await renderPayments(); break;
        case 'students': await renderStudents(); break;
        case 'library': await renderLibraryManager(); break;
        case 'inventory': await renderInventory(); break;
        case 'finance': await renderFinance(); break;
        case 'posts': await renderPostsManager(); break;
        case 'submissions': await renderSubmissions(); break;
        case 'events': await renderEvents(); break;
        case 'contacts': await renderContacts(); break;
        case 'partnerships': await renderPartnerships(); break;
        case 'peering': await renderPeering(); break;
        case 'offers': await renderOffers(); break;
        case 'sales': await renderSales(); break;
        default: await renderDashboard();
    }
}

// ============================================
// DASHBOARD RENDER (Overview for all roles)
// ============================================
async function renderDashboard() {
    const container = document.getElementById('dashboard-section');
    if (!container) return;
    
    const payments = await loadPayments();
    const students = await loadStudents();
    const pendingPayments = payments.filter(p => p.status === 'pending');
    const approvedPayments = payments.filter(p => p.status === 'approved');
    const totalRevenue = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
    
    container.innerHTML = `
        <div class="dashboard-overview">
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-users"></i></div><div class="stat-info"><h3>Total Students</h3><div class="stat-value">${students.length}</div></div></div>
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-clock"></i></div><div class="stat-info"><h3>Pending Payments</h3><div class="stat-value">${pendingPayments.length}</div></div></div>
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-check-circle"></i></div><div class="stat-info"><h3>Approved Payments</h3><div class="stat-value">${approvedPayments.length}</div></div></div>
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-chart-line"></i></div><div class="stat-info"><h3>Total Revenue</h3><div class="stat-value">₦${totalRevenue.toLocaleString()}</div></div></div>
            </div>
            <div class="recent-section"><h3>Recent Payments</h3><div class="recent-payments">${renderRecentPayments(payments.slice(0, 5))}</div></div>
        </div>
    `;
}

// ============================================
// LIBRARY MANAGER (Secretary & Founder)
// ============================================
async function renderLibraryManager() {
    const container = document.getElementById('library-section');
    if (!container) return;
    
    const { data: items, error } = await supabase.from('library_items').select('*').order('created_at', { ascending: false });
    
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-book"></i> Library Manager</h2><button id="addLibraryItemBtn" class="btn-primary"><i class="fas fa-plus"></i> Add New Item</button></div>
        <div class="library-items-grid">
            ${items?.map(item => `
                <div class="library-admin-card">
                    <img src="${item.cover_url || 'https://placehold.co/80x100'}" alt="${item.title}" onerror="this.src='https://placehold.co/80x100'">
                    <div class="info"><h4>${escapeHtml(item.title)}</h4><p>${item.type} • ${item.category || 'Uncategorized'}</p><p>Digital: ₦${item.price || 0} | Physical: ₦${item.physical_price || 0}</p><p>Stock: ${item.stock_quantity || 0}</p></div>
                    <div class="actions"><button class="btn-outline edit-item" data-id="${item.id}"><i class="fas fa-edit"></i> Edit</button><button class="btn-danger delete-item" data-id="${item.id}"><i class="fas fa-trash"></i> Delete</button></div>
                </div>
            `).join('') || '<div class="empty-state">No library items found</div>'}
        </div>
        ${renderLibraryModal()}
    `;
    
    document.getElementById('addLibraryItemBtn')?.addEventListener('click', () => openLibraryModal());
    document.querySelectorAll('.edit-item').forEach(btn => btn.addEventListener('click', () => openLibraryModal(btn.dataset.id)));
    document.querySelectorAll('.delete-item').forEach(btn => btn.addEventListener('click', () => deleteLibraryItem(btn.dataset.id)));
}

// ============================================
// POSTS MANAGER (CRM & Founder)
// ============================================
async function renderPostsManager() {
    const container = document.getElementById('posts-section');
    if (!container) return;
    
    const { data: posts, error } = await supabase.from('website_posts').select('*').order('created_at', { ascending: false });
    
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-pen"></i> Website Content Manager</h2><button id="addPostBtn" class="btn-primary"><i class="fas fa-plus"></i> New Post</button></div>
        <div class="posts-list">
            ${posts?.map(post => `
                <div class="post-card"><h4>${escapeHtml(post.title)}</h4><p>${escapeHtml(post.excerpt || '')}</p><div class="post-meta">Status: ${post.is_published ? 'Published' : 'Draft'} | ${new Date(post.created_at).toLocaleDateString()}</div><div class="post-actions"><button class="btn-outline edit-post" data-id="${post.id}">Edit</button><button class="btn-danger delete-post" data-id="${post.id}">Delete</button></div></div>
            `).join('') || '<div class="empty-state">No posts yet</div>'}
        </div>
    `;
}

// ============================================
// SUBMISSIONS (User project submissions)
// ============================================
async function renderSubmissions() {
    const container = document.getElementById('submissions-section');
    if (!container) return;
    
    const { data: submissions, error } = await supabase.from('user_submissions').select('*, users(name, email)').order('submitted_at', { ascending: false });
    
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-briefcase"></i> User Submissions</h2><div class="submission-filters"><button class="filter-btn active" data-status="pending">Pending</button><button class="filter-btn" data-status="reviewed">Reviewed</button><button class="filter-btn" data-status="all">All</button></div></div>
        <div class="submissions-list">${renderSubmissionsList(submissions || [])}</div>
    `;
}

// ============================================
// PARTNERSHIPS (Manager & Founder)
// ============================================
async function renderPartnerships() {
    const container = document.getElementById('partnerships-section');
    if (!container) return;
    
    const { data: partnerships, error } = await supabase.from('partnerships').select('*').order('created_at', { ascending: false });
    
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-handshake"></i> Partnership Agreements</h2><button id="addPartnershipBtn" class="btn-primary"><i class="fas fa-plus"></i> New Partnership</button></div>
        <div class="partnerships-grid">
            ${partnerships?.map(p => `
                <div class="partnership-card"><h4>${escapeHtml(p.company_name)}</h4><p>${escapeHtml(p.agreement_type)}</p><div class="status-badge ${p.status}">${p.status}</div><div class="actions"><button class="btn-outline edit-partnership" data-id="${p.id}">Edit</button></div></div>
            `).join('') || '<div class="empty-state">No partnerships yet</div>'}
        </div>
    `;
}

// ============================================
// PEERING (Instructor to Student Matching)
// ============================================
async function renderPeering() {
    const container = document.getElementById('peering-section');
    if (!container) return;
    
    const { data: instructors } = await supabase.from('users').select('id, name, email').eq('role', 'instructor');
    const { data: students } = await supabase.from('users').select('id, name, email').eq('role', 'student');
    
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-chalkboard-user"></i> Instructor to Student Matching</h2></div>
        <div class="peering-container">
            <div class="instructors-list"><h3>Instructors</h3>${instructors?.map(i => `<div class="instructor-card" data-id="${i.id}"><strong>${escapeHtml(i.name)}</strong><br>${i.email}</div>`).join('') || 'No instructors'}</div>
            <div class="students-list"><h3>Students</h3>${students?.map(s => `<div class="student-card" data-id="${s.id}"><strong>${escapeHtml(s.name)}</strong><br>${s.email}<button class="assign-btn" data-instructor="" data-student="${s.id}">Assign</button></div>`).join('') || 'No students'}</div>
        </div>
    `;
}

// ============================================
// OFFERS (Student Work Offers)
// ============================================
async function renderOffers() {
    const container = document.getElementById('offers-section');
    if (!container) return;
    
    const { data: offers } = await supabase.from('work_offers').select('*, users(name, email)').order('created_at', { ascending: false });
    
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-briefcase"></i> Student Work Offers</h2><button id="addOfferBtn" class="btn-primary"><i class="fas fa-plus"></i> Create Offer</button></div>
        <div class="offers-grid">
            ${offers?.map(offer => `
                <div class="offer-card"><h4>${escapeHtml(offer.title)}</h4><p>${escapeHtml(offer.description?.substring(0, 100))}</p><div class="offer-meta">💰 ${offer.budget} | 📅 ${new Date(offer.deadline).toLocaleDateString()}</div><div class="status-badge ${offer.status}">${offer.status}</div></div>
            `).join('') || '<div class="empty-state">No offers yet</div>'}
        </div>
    `;
}

// ============================================
// SALES (Store Sales Tracking)
// ============================================
async function renderSales() {
    const container = document.getElementById('sales-section');
    if (!container) return;
    
    const { data: sales } = await supabase.from('user_purchases').select('*, users(name, email), library_items(title)').order('created_at', { ascending: false });
    const totalSales = sales?.reduce((sum, s) => sum + s.amount, 0) || 0;
    
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-chart-simple"></i> Store Sales</h2></div>
        <div class="sales-stats"><div class="stat-card"><div class="stat-value">₦${totalSales.toLocaleString()}</div><div class="stat-label">Total Revenue</div></div><div class="stat-card"><div class="stat-value">${sales?.length || 0}</div><div class="stat-label">Transactions</div></div></div>
        <div class="sales-list">${sales?.map(s => `<div class="sale-item"><span>${escapeHtml(s.users?.name)}</span><span>${escapeHtml(s.library_items?.title)}</span><span>₦${s.amount.toLocaleString()}</span><span>${new Date(s.created_at).toLocaleDateString()}</span></div>`).join('') || '<div class="empty-state">No sales yet</div>'}</div>
    `;
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function renderRecentPayments(payments) {
    if (!payments.length) return '<div class="empty-state">No payments yet</div>';
    return payments.map(p => `
        <div class="payment-item ${p.status}">
            <div class="payment-info"><div class="payment-amount">₦${p.amount.toLocaleString()}</div><div class="payment-date">${new Date(p.submitted_at).toLocaleDateString()}</div><div class="payment-ref">${p.user_name || p.user_email}</div></div>
            <div class="payment-status ${p.status}">${p.status}</div>
        </div>
    `).join('');
}

function renderSubmissionsList(submissions) {
    if (!submissions.length) return '<div class="empty-state">No submissions yet</div>';
    return submissions.map(s => `
        <div class="submission-item"><div class="submission-info"><strong>${escapeHtml(s.users?.name)}</strong><p>${escapeHtml(s.description?.substring(0, 100))}</p></div><div class="submission-status ${s.status}">${s.status}</div><div class="submission-actions"><button class="btn-outline review-btn" data-id="${s.id}">Review</button></div></div>
    `).join('');
}

function renderLibraryModal() {
    return `
        <div id="libraryItemModal" class="modal"><div class="modal-content"><div class="modal-header"><h2 id="libraryModalTitle">Add Library Item</h2><button class="modal-close" id="closeLibraryModal">&times;</button></div>
        <div class="modal-body"><form id="libraryItemForm"><input type="hidden" id="editItemId"><div class="form-group"><label>Title</label><input type="text" id="itemTitle" required></div>
        <div class="form-group"><label>Type</label><select id="itemType"><option value="book">Book</option><option value="bundle">Bundle</option></select></div>
        <div class="form-group"><label>Category</label><input type="text" id="itemCategory" placeholder="Video Production, Design, etc."></div>
        <div class="form-group"><label>Author</label><input type="text" id="itemAuthor"></div>
        <div class="form-group"><label>Description</label><textarea id="itemDescription" rows="3"></textarea></div>
        <div class="form-group"><label>Cover Image URL</label><input type="url" id="itemCoverUrl"></div>
        <div class="form-group"><label>Digital Price (₦)</label><input type="number" id="itemPrice" value="0"></div>
        <div class="form-group"><label>Physical Price (₦)</label><input type="number" id="itemPhysicalPrice" value="0"></div>
        <div class="form-group"><label>Stock Quantity</label><input type="number" id="itemStock" value="0"></div>
        <div class="form-group"><label>File URL</label><input type="url" id="itemFileUrl" placeholder="PDF, EPUB, or video link"></div>
        <div class="form-group"><label>Download URL</label><input type="url" id="itemDownloadUrl"></div>
        <div class="form-group"><label>Level</label><select id="itemLevel"><option value="Beginner">Beginner</option><option value="Intermediate">Intermediate</option><option value="Advanced">Advanced</option></select></div>
        <button type="submit" class="btn-primary">Save Item</button></form></div></div></div>
    `;
}

// ============================================
// DATABASE LOAD FUNCTIONS
// ============================================
async function loadPayments() {
    try {
        const { data, error } = await supabase.from('payment_requests').select('*').order('submitted_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading payments:', error);
        return [];
    }
}

async function loadStudents() {
    try {
        const { data, error } = await supabase.from('users').select('*').eq('role', 'student').order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        return [];
    }
}

// ============================================
// INITIALIZE ADMIN DASHBOARD
// ============================================
async function initAdminDashboard() {
    console.log('Initializing admin dashboard...');
    
    const isAuth = await checkAuth();
    if (!isAuth) return;
    
    createContentSections();
    buildSidebar();
    await renderDashboard();
    
    // Setup auto-refresh every 30 seconds
    setInterval(async () => {
        if (currentTab === 'payments') await renderPayments();
        else if (currentTab === 'dashboard') await renderDashboard();
    }, 30000);
    
    console.log(`Admin dashboard initialized for role: ${currentRole}`);
}

// Helper functions
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Start the dashboard
initAdminDashboard();
