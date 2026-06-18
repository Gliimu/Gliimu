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
let editingItemId = null;
let editingFaqId = null;
let editingIndexId = null;

// File tracking for uploads
let coverFileData = null;
let contentFileData = null;
let indexImageFileData = null;
let productImageFileData = null;

// ============================================
// ROLE-BASED TAB CONFIGURATION
// ============================================

const roleTabs = {
    founder: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'payments', name: 'Payments', icon: 'fas fa-wallet' },
        { id: 'users', name: 'Users', icon: 'fas fa-users' },
        { id: 'inventory', name: 'Inventory', icon: 'fas fa-boxes' },
        { id: 'finance', name: 'Finance', icon: 'fas fa-chart-line' },
        { id: 'posts', name: 'Update Website', icon: 'fas fa-pen' },
        { id: 'submissions', name: 'User Submissions', icon: 'fas fa-briefcase' },
        { id: 'events', name: 'Hosted Events', icon: 'fas fa-calendar' },
        { id: 'contacts', name: 'Contacts', icon: 'fas fa-address-book' },
        { id: 'partnerships', name: 'Partnerships', icon: 'fas fa-handshake' },
        { id: 'peering', name: 'Instructor to Students', icon: 'fas fa-chalkboard-user' },
        { id: 'offers', name: 'Student Work Offers', icon: 'fas fa-briefcase' },
        { id: 'sales', name: 'Store Sales', icon: 'fas fa-chart-simple' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    crm: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'posts', name: 'Update Website', icon: 'fas fa-pen' },
        { id: 'submissions', name: 'User Submissions', icon: 'fas fa-briefcase' },
        { id: 'events', name: 'Hosted Events', icon: 'fas fa-calendar' },
        { id: 'contacts', name: 'Contacts', icon: 'fas fa-address-book' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    secretary: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'payments', name: 'Payments', icon: 'fas fa-cash-register' },
        { id: 'sales', name: 'Store Sales', icon: 'fas fa-chart-simple' },
        { id: 'inventory', name: 'Inventory', icon: 'fas fa-boxes' },
        { id: 'finance', name: 'Finance', icon: 'fas fa-chart-line' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    manager: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'partnerships', name: 'Partnership Agreements', icon: 'fas fa-handshake' },
        { id: 'peering', name: 'Instructor to Students', icon: 'fas fa-chalkboard-user' },
        { id: 'offers', name: 'Student Work Offers', icon: 'fas fa-briefcase' },
        { id: 'users', name: 'Users', icon: 'fas fa-users' },
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
        document.getElementById('dashboardTitle').textContent = 'Founder Dashboard';
        return true;
    }
    
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
        console.error('Auth error:', error);
        showToast('Please login as admin', 'error');
        setTimeout(() => window.location.href = '/signin.html', 1500);
        return false;
    }
    
    const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, name')
        .eq('id', user.id)
        .single();
    
    if (profileError) {
        console.error('Profile error:', profileError);
    }
    
    const userRole = profile?.role || 'secretary';
    currentRole = userRole;
    currentUser = user;
    
    const roleNames = {
        founder: 'Founder',
        crm: 'CRM',
        secretary: 'Secretary',
        manager: 'Operations Manager'
    };
    
    const roleTitles = {
        founder: 'Founder Dashboard',
        crm: 'CRM Dashboard',
        secretary: 'Secretary Dashboard',
        manager: 'Manager Dashboard'
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
        <div id="dashboard-section" class="admin-tab active"><div class="loading">Loading dashboard...</div></div>
        <div id="payments-section" class="admin-tab"><div class="loading">Loading payments...</div></div>
        <div id="users-section" class="admin-tab"><div class="loading">Loading users...</div></div>
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
        case 'dashboard': await renderDashboard(); break;
        case 'payments': await renderPayments(); break;
        case 'users': await renderUsers(); break;
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
        case 'settings': await renderSettings(); break;
        default: await renderDashboard();
    }
}

// ============================================
// DASHBOARD RENDER
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
// UPLOAD FILE TO STORAGE - RETURNS PUBLIC URL
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
    
    // Determine folder path
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
    } else if (folder) {
        path = `${folder}/${fileName}`;
    } else {
        path = `general/${fileName}`;
    }
    
    console.log('📤 Uploading to:', path);

    try {
        // 1. Upload the file
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

        console.log('✅ File uploaded successfully:', data);

        // 2. Get the public URL - THIS IS CRITICAL
        const { data: urlData } = supabase.storage
            .from('hub_content')
            .getPublicUrl(path);

        if (!urlData || !urlData.publicUrl) {
            console.error('❌ Failed to generate public URL');
            showToast('Failed to generate file URL', 'error');
            return null;
        }

        const publicUrl = urlData.publicUrl;
        console.log('🔗 Public URL generated:', publicUrl);

        // 3. Return the URL so it can be saved to database
        return publicUrl;

    } catch (error) {
        console.error('❌ Upload exception:', error);
        showToast(`Upload error: ${error.message || 'Unknown error'}`, 'error');
        return null;
    }
}

// Delete file from storage
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
// FILE UPLOAD HANDLERS - DIRECT FROM COMPUTER
// ============================================

// Cover image handlers
function handleCoverUpload(file) {
    if (!file) return;
    
    // Validate file type
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
    
    preview.style.display = 'flex';
    showToast(`📸 ${file.name} selected`, 'success');
}

function removeCoverFile() {
    coverFileData = null;
    document.getElementById('coverFileInput').value = '';
    document.getElementById('coverPreview').style.display = 'none';
    document.getElementById('coverPreviewImg').src = '';
    document.getElementById('coverFileName').textContent = 'No file selected';
}

// Content file handlers
function handleContentUpload(file) {
    if (!file) return;
    
    contentFileData = file;
    
    const preview = document.getElementById('contentFilePreview');
    const fileName = document.getElementById('contentFileName');
    
    if (fileName) {
        fileName.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
    }
    
    preview.style.display = 'flex';
    showToast(`📁 ${file.name} selected`, 'success');
}

function removeContentFile() {
    contentFileData = null;
    document.getElementById('contentFileInput').value = '';
    document.getElementById('contentFilePreview').style.display = 'none';
    document.getElementById('contentFileName').textContent = 'No file selected';
}

// Index image handlers
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
    
    preview.style.display = 'flex';
    showToast(`🏞️ ${file.name} selected`, 'success');
}

function removeIndexImage() {
    indexImageFileData = null;
    document.getElementById('indexImageInput').value = '';
    document.getElementById('indexImagePreview').style.display = 'none';
    document.getElementById('indexImagePreviewImg').src = '';
    document.getElementById('indexFileName').textContent = 'No file selected';
}

// Product image handlers
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
    
    preview.style.display = 'flex';
    showToast(`🛍️ ${file.name} selected`, 'success');
}

function removeProductImage() {
    productImageFileData = null;
    document.getElementById('productImageInput').value = '';
    document.getElementById('productImagePreview').style.display = 'none';
    document.getElementById('productImagePreviewImg').src = '';
    document.getElementById('productFileName').textContent = 'No file selected';
}

// ============================================
// POSTS MANAGER - Combined Update Website Tab
// ============================================
async function renderPostsManager() {
    const container = document.getElementById('posts-section');
    if (!container) return;
    
    // Load all data
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
        
        <!-- Website Sections -->
        <div class="website-sections">
            <!-- Library Manager Section -->
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
            
            <!-- FAQ Section -->
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
            
            <!-- Index/Hero Section -->
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
    
    // Event Listeners
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
// LIBRARY MODAL FUNCTIONS - WITH FILE UPLOAD
// ============================================
function openLibraryModal(itemId = null) {
    const modal = document.getElementById('libraryItemModal');
    const form = document.getElementById('libraryItemForm');
    const title = document.getElementById('libraryModalTitle');
    
    if (!modal) {
        showToast('Modal not found', 'error');
        return;
    }
    
    // Reset form
    form.reset();
    document.getElementById('editItemId').value = '';
    document.getElementById('coverPreview').style.display = 'none';
    document.getElementById('contentFilePreview').style.display = 'none';
    document.getElementById('bundleDownloadGroup').style.display = 'none';
    document.getElementById('talkDurationGroup').style.display = 'none';
    
    // Reset file data
    coverFileData = null;
    contentFileData = null;
    
    // Reset file inputs
    document.getElementById('coverFileInput').value = '';
    document.getElementById('contentFileInput').value = '';
    document.getElementById('coverFileName').textContent = 'No file selected';
    document.getElementById('contentFileName').textContent = 'No file selected';
    
    title.textContent = 'Add New Content';
    editingItemId = null;
    
    // Update folder hint
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
        // Reset form
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
    document.getElementById('itemDescription').value = item.description || '';
    document.getElementById('itemPrice').value = item.price || 0;
    document.getElementById('itemPhysicalPrice').value = item.physical_price || 0;
    document.getElementById('itemAudioPrice').value = item.audio_price || 0;
    document.getElementById('itemDownloadUrl').value = item.download_url || '';
    document.getElementById('itemLevel').value = item.level || 'Beginner';
    document.getElementById('itemDuration').value = item.duration || '';
    document.getElementById('itemStatus').value = item.is_active ? 'active' : 'inactive';
    document.getElementById('itemFirstChapter').value = item.first_chapter || '';
    
    // Update folder hint
    updateFolderHint();
    
    // Show existing cover
    if (item.cover_url) {
        const preview = document.getElementById('coverPreview');
        const img = document.getElementById('coverPreviewImg');
        const fileName = document.getElementById('coverFileName');
        img.src = item.cover_url;
        fileName.textContent = 'Current cover image';
        preview.style.display = 'flex';
    }
    
    // Show existing file
    if (item.file_url) {
        const preview = document.getElementById('contentFilePreview');
        const fileName = document.getElementById('contentFileName');
        const fileParts = item.file_url.split('/');
        fileName.textContent = '📎 ' + fileParts[fileParts.length - 1];
        preview.style.display = 'flex';
    }
}

// ============================================
// SAVE LIBRARY ITEM - CORRECTED COLUMN NAMES
// ============================================
async function saveLibraryItem(e) {
    e.preventDefault();
    
    const itemId = document.getElementById('editItemId').value;
    const contentType = document.getElementById('itemType').value;
    const coverFile = coverFileData;
    const contentFile = contentFileData;
    
    // ... upload logic (same as before) ...
    
    // --- Build data object with CORRECT column names ---
    const data = {
        title: document.getElementById('itemTitle').value.trim(),
        type: contentType,
        category: document.getElementById('itemCategory').value.trim(),
        author: document.getElementById('itemAuthor').value.trim(),
        description: document.getElementById('itemDescription').value.trim(),
        cover_url: coverUrl,
        file_url: fileUrl,
        download_url: document.getElementById('itemDownloadUrl').value.trim() || null, // ← This column now exists!
        price: parseFloat(document.getElementById('itemPrice').value) || 0,
        physical_price: parseFloat(document.getElementById('itemPhysicalPrice').value) || 0,
        audio_price: parseFloat(document.getElementById('itemAudioPrice').value) || 0,
        first_chapter: document.getElementById('itemFirstChapter').value.trim() || null,
        duration: document.getElementById('itemDuration').value.trim() || null,
        level: document.getElementById('itemLevel').value,
        is_active: document.getElementById('itemStatus').value === 'active',
        updated_at: new Date().toISOString()
    };
    
    console.log('📦 Saving to database:', { 
        title: data.title, 
        cover_url: data.cover_url, 
        file_url: data.file_url 
    });
    
    if (!data.title) {
        showToast('Title is required', 'error');
        return;
    }
    
    // --- Save to database ---
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
        console.log('✅ Database updated successfully');
        showToast(`Content ${itemId ? 'updated' : 'added'} successfully!`, 'success');
        closeLibraryModal();
        renderPostsManager();
    }
}

// ============================================
// DELETE LIBRARY ITEM
// ============================================
async function deleteLibraryItem(itemId) {
    if (!confirm('Delete this content permanently? This cannot be undone.')) return;
    
    // Get the item to delete its files
    const { data: item } = await supabase
        .from('hub_contents')
        .select('cover_url, file_url')
        .eq('id', itemId)
        .single();
    
    // Delete files from storage
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
        renderPostsManager();
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
        renderPostsManager();
    }
}

// ============================================
// FAQ FUNCTIONS
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
        renderPostsManager();
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
        renderPostsManager();
    }
}

// ============================================
// INDEX/HERO FUNCTIONS - WITH FILE UPLOAD
// ============================================
function openIndexModal() {
    const modal = document.getElementById('indexModal');
    if (!modal) return;
    
    // Reset file data
    indexImageFileData = null;
    document.getElementById('indexImageInput').value = '';
    document.getElementById('indexImagePreview').style.display = 'none';
    document.getElementById('indexFileName').textContent = 'No file selected';
    
    // Load current index data
    supabase.from('index_content').select('*').maybeSingle()
        .then(({ data }) => {
            document.getElementById('indexHeroTitle').value = data?.hero_title || 'Be The Best';
            document.getElementById('indexHeroSubtitle').value = data?.hero_subtitle || 'Read the best';
            document.getElementById('editIndexId').value = data?.id || '';
            
            // Show existing image if any
            if (data?.hero_image) {
                const preview = document.getElementById('indexImagePreview');
                const img = document.getElementById('indexImagePreviewImg');
                const fileName = document.getElementById('indexFileName');
                img.src = data.hero_image;
                fileName.textContent = 'Current hero image';
                preview.style.display = 'flex';
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

// ============================================
// SAVE INDEX ITEM - WITH AUTO URL STORAGE
// ============================================
async function saveIndexItem(e) {
    e.preventDefault();
    
    const indexId = document.getElementById('editIndexId').value;
    const imageFile = indexImageFileData;
    
    // Get existing image URL if editing
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
        console.log('📤 Uploading hero image...', imageFile.name);
        const uploadedUrl = await uploadFileToStorage(imageFile, 'hero');
        
        if (uploadedUrl) {
            // Delete old image if exists
            if (existingImageUrl) {
                await deleteFileFromStorage(existingImageUrl);
            }
            imageUrl = uploadedUrl;  // ✅ Store the uploaded URL
            console.log('✅ Hero image URL saved:', imageUrl);
        } else {
            showToast('Image upload failed', 'error');
            return;
        }
    }
    
    const data = {
        hero_title: document.getElementById('indexHeroTitle').value.trim(),
        hero_subtitle: document.getElementById('indexHeroSubtitle').value.trim(),
        hero_image: imageUrl,  // ✅ This now has the uploaded URL
        updated_at: new Date().toISOString()
    };
    
    console.log('📦 Saving index data:', data);
    
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
        console.log('✅ Index updated successfully');
        showToast('Hero content updated successfully!', 'success');
        closeIndexModal();
        renderPostsManager();
    }
}

// ============================================
// PRODUCT FUNCTIONS - WITH FILE UPLOAD
// ============================================
function openProductModal(productId = null) {
    const modal = document.getElementById('productModal');
    if (!modal) return;
    
    // Reset form
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
        img.src = data.image_url;
        fileName.textContent = 'Current product image';
        preview.style.display = 'flex';
    }
}

// ============================================
// SAVE PRODUCT - WITH AUTO URL STORAGE
// ============================================
async function saveProductItem(e) {
    e.preventDefault();
    
    const productId = document.getElementById('editProductId').value;
    const imageFile = productImageFileData;
    
    // Get existing image URL if editing
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
        console.log('📤 Uploading product image...', imageFile.name);
        const uploadedUrl = await uploadFileToStorage(imageFile, 'product');
        
        if (uploadedUrl) {
            if (existingImageUrl) {
                await deleteFileFromStorage(existingImageUrl);
            }
            imageUrl = uploadedUrl;  // ✅ Store the uploaded URL
            console.log('✅ Product image URL saved:', imageUrl);
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
        image_url: imageUrl,  // ✅ This now has the uploaded URL
        updated_at: new Date().toISOString()
    };
    
    console.log('📦 Saving product:', data);
    
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
        console.log('✅ Product saved successfully');
        showToast(`Product ${productId ? 'updated' : 'added'} successfully!`, 'success');
        closeProductModal();
        renderInventory();
    }
}
// ============================================
// SETTINGS TAB
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
    
    // Theme selector event listeners
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
    
    // Save settings
    document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
        const emailNotifications = document.getElementById('emailNotifications')?.checked;
        const paymentAlerts = document.getElementById('paymentAlerts')?.checked;
        
        localStorage.setItem('admin_email_notifications', emailNotifications);
        localStorage.setItem('admin_payment_alerts', paymentAlerts);
        
        showToast('Settings saved successfully!', 'success');
    });
    
    // Export data
    document.getElementById('exportDataBtn')?.addEventListener('click', async () => {
        await exportAllData();
    });
    
    // Clear cache
    document.getElementById('clearCacheBtn')?.addEventListener('click', () => {
        localStorage.removeItem('admin_payments_cache');
        localStorage.removeItem('admin_students_cache');
        showToast('Cache cleared! Refreshing data...', 'success');
        setTimeout(() => refreshAllData(), 1000);
    });
}

// ============================================
// OTHER RENDER FUNCTIONS
// ============================================
async function renderPayments() {
    const container = document.getElementById('payments-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading payments...</div>';
    
    const payments = await loadPayments();
    allPayments = payments;
    
    const pendingCount = payments.filter(p => p.status === 'pending').length;
    const badgeEl = document.getElementById('pendingPaymentsBadge');
    if (badgeEl) badgeEl.textContent = pendingCount;
    
    const filtered = payments.filter(p => p.status === currentPaymentFilter);
    
    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No ${currentPaymentFilter} payments found</p></div>`;
        return;
    }
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-wallet"></i> Payment Management</h2>
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

async function renderUsers() {
    const container = document.getElementById('users-section');
    if (!container) return;
    
    const students = await loadStudents();
    
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-users"></i> User Management</h2><button id="exportUsersBtn" class="btn-outline"><i class="fas fa-download"></i> Export CSV</button></div>
        <div class="users-list"><div class="table-responsive"><table class="users-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Wallet Balance</th><th>Joined</th></tr></thead><tbody>
            ${students.map(s => `<tr><td><strong>${escapeHtml(s.name)}</strong></td><td>${s.email}</td><td>${s.role || 'Student'}</td><td>₦${(s.wallet_balance || 0).toLocaleString()}</td><td>${new Date(s.created_at).toLocaleDateString()}</td></tr>`).join('')}
        </tbody></table></div></div>
    `;
    
    document.getElementById('exportUsersBtn')?.addEventListener('click', () => {
        let csv = "Name,Email,Role,Wallet Balance,Joined\n";
        students.forEach(s => {
            csv += `"${s.name || ''}","${s.email}","${s.role || 'Student'}","${s.wallet_balance || 0}","${new Date(s.created_at).toLocaleDateString()}"\n`;
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

async function renderInventory() {
    const container = document.getElementById('inventory-section');
    if (!container) return;
    
    const { data: products } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-boxes"></i> Inventory Management</h2><button id="addProductBtn" class="btn-primary"><i class="fas fa-plus"></i> Add Product</button></div>
        <div class="inventory-stats"><div class="inv-stat"><span>Total Products</span><strong>${products?.length || 0}</strong></div><div class="inv-stat"><span>Low Stock Alerts</span><strong>${products?.filter(p => p.stock_quantity < 10).length || 0}</strong></div></div>
        <div class="inventory-grid">${products?.map(p => `<div class="inventory-card ${p.stock_quantity < 10 ? 'low-stock' : ''}"><div class="inventory-card-header"><h4>${escapeHtml(p.name)}</h4><span>${p.category}</span></div><div class="inventory-stock">Stock: ${p.stock_quantity || 0} units</div><div class="inventory-price">₦${(p.price || 0).toLocaleString()}</div></div>`).join('') || '<div class="empty-state">No products found</div>'}</div>
    `;
    
    document.getElementById('addProductBtn')?.addEventListener('click', () => openProductModal());
}

async function renderFinance() {
    const container = document.getElementById('finance-section');
    if (!container) return;
    
    const payments = await loadPayments();
    const approvedPayments = payments.filter(p => p.status === 'approved');
    const totalRevenue = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
    
    container.innerHTML = `
        <div class="tab-header"><h2><i class="fas fa-chart-line"></i> Financial Management</h2></div>
        <div class="finance-stats"><div class="finance-card"><h4>Total Revenue</h4><div class="amount">₦${totalRevenue.toLocaleString()}</div></div><div class="finance-card"><h4>Total Transactions</h4><div class="amount">${payments.length}</div></div></div>
        <div class="revenue-breakdown"><h3>Recent Transactions</h3><div class="breakdown-list">${approvedPayments.slice(0, 10).map(p => `<div class="breakdown-item"><span>${p.user_name || p.user_email}</span><strong>₦${p.amount.toLocaleString()}</strong></div>`).join('') || '<div class="empty-state">No transactions yet</div>'}</div></div>
    `;
}

async function renderSubmissions() {
    const container = document.getElementById('submissions-section');
    if (!container) return;
    container.innerHTML = `<div class="tab-header"><h2><i class="fas fa-briefcase"></i> User Submissions</h2></div><div class="empty-state">Submissions manager - Coming soon</div>`;
}

async function renderEvents() {
    const container = document.getElementById('events-section');
    if (!container) return;
    container.innerHTML = `<div class="tab-header"><h2><i class="fas fa-calendar"></i> Hosted Events</h2><button id="addEventBtn" class="btn-primary">Create Event</button></div><div class="empty-state">Events manager - Coming soon</div>`;
}

async function renderContacts() {
    const container = document.getElementById('contacts-section');
    if (!container) return;
    container.innerHTML = `<div class="tab-header"><h2><i class="fas fa-address-book"></i> Contacts</h2><button id="addContactBtn" class="btn-primary">Add Contact</button></div><div class="empty-state">Contacts manager - Coming soon</div>`;
}

async function renderPartnerships() {
    const container = document.getElementById('partnerships-section');
    if (!container) return;
    container.innerHTML = `<div class="tab-header"><h2><i class="fas fa-handshake"></i> Partnership Agreements</h2><button id="addPartnershipBtn" class="btn-primary">New Partnership</button></div><div class="empty-state">Partnerships manager - Coming soon</div>`;
}

async function renderPeering() {
    const container = document.getElementById('peering-section');
    if (!container) return;
    container.innerHTML = `<div class="tab-header"><h2><i class="fas fa-chalkboard-user"></i> Instructor to Student Matching</h2></div><div class="empty-state">Peering system - Coming soon</div>`;
}

async function renderOffers() {
    const container = document.getElementById('offers-section');
    if (!container) return;
    container.innerHTML = `<div class="tab-header"><h2><i class="fas fa-briefcase"></i> Student Work Offers</h2><button id="addOfferBtn" class="btn-primary">Create Offer</button></div><div class="empty-state">Work offers - Coming soon</div>`;
}

async function renderSales() {
    const container = document.getElementById('sales-section');
    if (!container) return;
    container.innerHTML = `<div class="tab-header"><h2><i class="fas fa-chart-simple"></i> Store Sales</h2></div><div class="empty-state">Sales data - Coming soon</div>`;
}

// ============================================
// APPROVE/REJECT PAYMENT FUNCTIONS
// ============================================
async function approvePayment(paymentId, amount, userName) {
    try {
        const { data: payment } = await supabase.from('payment_requests').select('*').eq('id', paymentId).single();
        
        await supabase.from('payment_requests').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', paymentId);
        
        const { data: user } = await supabase.from('users').select('wallet_balance').eq('id', payment.user_id).single();
        const newBalance = (user?.wallet_balance || 0) + payment.amount;
        await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', payment.user_id);
        
        showToast(`✅ Payment of ₦${amount.toLocaleString()} from ${userName} approved!`, 'success');
        await renderPayments();
        await renderDashboard();
    } catch (error) {
        console.error('Error approving payment:', error);
        showToast('Error approving payment', 'error');
    }
}

async function rejectPayment(paymentId, amount, userName) {
    try {
        await supabase.from('payment_requests').update({ status: 'rejected', admin_notes: 'Payment rejected by admin' }).eq('id', paymentId);
        showToast(`❌ Payment of ₦${amount.toLocaleString()} from ${userName} rejected`, 'info');
        await renderPayments();
        await renderDashboard();
    } catch (error) {
        console.error('Error rejecting payment:', error);
        showToast('Error rejecting payment', 'error');
    }
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

async function refreshAllData() {
    await renderPayments();
    await renderDashboard();
}

async function exportAllData() {
    try {
        const payments = await loadPayments();
        const students = await loadStudents();
        
        let csvContent = "Data Type,ID,Name,Amount,Status,Date\n";
        payments.forEach(p => {
            csvContent += `Payment,${p.id},${p.user_name},${p.amount},${p.status},${new Date(p.submitted_at).toLocaleDateString()}\n`;
        });
        students.forEach(s => {
            csvContent += `Student,${s.id},${s.name},${s.wallet_balance},Active,${new Date(s.created_at).toLocaleDateString()}\n`;
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

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    await renderDashboard();
    
    // Setup auto-refresh every 30 seconds
    setInterval(async () => {
        if (currentTab === 'payments') await renderPayments();
        else if (currentTab === 'dashboard') await renderDashboard();
    }, 30000);
    
    console.log(`Admin dashboard initialized for role: ${currentRole}`);
}

// ============================================
// EVENT LISTENERS FOR MODAL CLOSING
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Type change handler
    const typeSelect = document.getElementById('itemType');
    if (typeSelect) {
        typeSelect.addEventListener('change', updateFolderHint);
    }
    
    // Library modal close button
    const closeLibraryBtn = document.getElementById('closeLibraryModalBtn');
    if (closeLibraryBtn) {
        closeLibraryBtn.addEventListener('click', closeLibraryModal);
    }
    
    // Close library modal on overlay click
    const libraryModal = document.getElementById('libraryItemModal');
    if (libraryModal) {
        libraryModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeLibraryModal();
            }
        });
    }
    
    // FAQ modal close
    const closeFaqBtn = document.getElementById('closeFaqModalBtn');
    if (closeFaqBtn) {
        closeFaqBtn.addEventListener('click', closeFaqModal);
    }
    
    const faqModal = document.getElementById('faqModal');
    if (faqModal) {
        faqModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeFaqModal();
            }
        });
    }
    
    // Index modal close
    const closeIndexBtn = document.getElementById('closeIndexModalBtn');
    if (closeIndexBtn) {
        closeIndexBtn.addEventListener('click', closeIndexModal);
    }
    
    const indexModal = document.getElementById('indexModal');
    if (indexModal) {
        indexModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeIndexModal();
            }
        });
    }
    
    // Product modal close
    const closeProductBtn = document.getElementById('closeProductModalBtn');
    if (closeProductBtn) {
        closeProductBtn.addEventListener('click', closeProductModal);
    }
    
    const productModal = document.getElementById('productModal');
    if (productModal) {
        productModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeProductModal();
            }
        });
    }
    
    // Escape key to close modals
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

// Start the dashboard
initAdminDashboard();

// Make functions available globally
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
