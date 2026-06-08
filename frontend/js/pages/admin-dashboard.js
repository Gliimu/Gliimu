// ============================================
// SECRETARY/ADMIN DASHBOARD
// Tabs: Dashboard, Payments, Students, Inventory, Finance
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// Global state
let currentUser = null;
let currentTab = 'dashboard';
let currentPaymentFilter = 'pending';
let allPayments = [];
let allStudents = [];
let allInventory = [];
let allExpenses = [];
let allDisbursements = [];

// ============================================
// AUTHENTICATION CHECK
// ============================================
async function checkAuth() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        showToast('Please login as admin', 'error');
        setTimeout(() => {
            window.location.href = '/signin.html';
        }, 1500);
        return false;
    }
    
    // Check if user is admin
    const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
    
    if (profile?.role !== 'admin') {
        showToast('Admin access required', 'error');
        setTimeout(() => {
            window.location.href = '/dashboard.html';
        }, 1500);
        return false;
    }
    
    currentUser = user;
    document.getElementById('adminName').textContent = profile?.name || 'Admin';
    return true;
}

// ============================================
// LOAD DATA FUNCTIONS
// ============================================
async function loadPayments() {
    const { data, error } = await supabase
        .from('payment_requests')
        .select('*')
        .order('submitted_at', { ascending: false });
    
    if (error) {
        console.error('Error loading payments:', error);
        return [];
    }
    return data || [];
}

async function loadStudents() {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'student')
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('Error loading students:', error);
        return [];
    }
    return data || [];
}

async function loadInventory() {
    const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) {
        // Mock data for demo
        return [
            { id: 1, name: 'Gliimu T-Shirt', category: 'uniform', price: 5000, stock: 45 },
            { id: 2, name: 'MacBook Pro', category: 'gadget', price: 2500000, stock: 3 },
            { id: 3, name: 'Video Production Guide', category: 'material', price: 15000, stock: 20 },
            { id: 4, name: 'Hoodie', category: 'uniform', price: 12000, stock: 8 },
            { id: 5, name: 'iPad', category: 'gadget', price: 450000, stock: 2 }
        ];
    }
    return data || [];
}

async function loadExpenses() {
    const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false });
    
    if (error) {
        // Mock data for demo
        return [
            { id: 1, category: 'rent', amount: 150000, description: 'Office rent - June', date: '2025-06-01' },
            { id: 2, category: 'salary', amount: 120000, description: 'Instructor salaries', date: '2025-06-01' },
            { id: 3, category: 'software', amount: 50000, description: 'Software subscriptions', date: '2025-05-28' }
        ];
    }
    return data || [];
}

async function loadDisbursements() {
    const { data, error } = await supabase
        .from('disbursements')
        .select('*')
        .order('date', { ascending: false });
    
    if (error) {
        // Mock data for demo
        return [
            { id: 1, recipient: 'John Doe', type: 'instructor', amount: 50000, purpose: 'May stipend', date: '2025-05-30', status: 'paid' },
            { id: 2, recipient: 'Jane Smith', type: 'instructor', amount: 50000, purpose: 'May stipend', date: '2025-05-30', status: 'paid' }
        ];
    }
    return data || [];
}

// ============================================
// RENDER DASHBOARD
// ============================================
async function renderDashboard() {
    const payments = await loadPayments();
    const students = await loadStudents();
    const inventory = await loadInventory();
    
    const pendingPayments = payments.filter(p => p.status === 'pending');
    const approvedPayments = payments.filter(p => p.status === 'approved');
    const lowStockItems = inventory.filter(i => i.stock < 10);
    
    document.getElementById('statPendingPayments').textContent = pendingPayments.length;
    document.getElementById('statApprovedPayments').textContent = approvedPayments.length;
    document.getElementById('statTotalStudents').textContent = students.length;
    document.getElementById('statCertificatesIssued').textContent = '0';
    document.getElementById('statTotalRevenue').textContent = `₦${approvedPayments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}`;
    document.getElementById('statLowStock').textContent = lowStockItems.length;
    
    // Recent payments
    const recentPaymentsDiv = document.getElementById('recentPayments');
    const recent = payments.slice(0, 5);
    recentPaymentsDiv.innerHTML = recent.length === 0 ? '<div class="empty-state">No payments yet</div>' : 
        recent.map(p => `
            <div class="payment-item ${p.status}">
                <div class="payment-info">
                    <div class="payment-amount">₦${p.amount.toLocaleString()}</div>
                    <div class="payment-date">${new Date(p.submitted_at).toLocaleDateString()}</div>
                    <div class="payment-ref">${p.user_name}</div>
                </div>
                <div class="payment-status ${p.status}">${p.status}</div>
            </div>
        `).join('');
}

// ============================================
// RENDER PAYMENTS TAB
// ============================================
async function renderPayments() {
    const container = document.getElementById('paymentsList');
    container.innerHTML = '<div class="loading">Loading payments...</div>';
    
    const payments = await loadPayments();
    allPayments = payments;
    
    const filtered = payments.filter(p => p.status === currentPaymentFilter);
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">No payments found</div>';
        return;
    }
    
    container.innerHTML = filtered.map(p => `
        <div class="payment-item ${p.status}">
            <div class="payment-info">
                <div class="payment-amount">₦${p.amount.toLocaleString()}</div>
                <div class="payment-date">${new Date(p.submitted_at).toLocaleString()}</div>
                <div class="payment-ref">Ref: ${p.reference_code}</div>
                <div class="payment-user">Student: ${p.user_name}</div>
            </div>
            <div class="payment-status ${p.status}">${p.status}</div>
            <div class="payment-actions">
                ${p.status === 'pending' ? `
                    <button class="btn-approve" data-id="${p.id}" data-amount="${p.amount}" data-user="${p.user_name}">Approve</button>
                    <button class="btn-reject" data-id="${p.id}">Reject</button>
                ` : `
                    <button class="btn-view" data-id="${p.id}">View Receipt</button>
                `}
            </div>
        </div>
    `).join('');
    
    // Add event listeners
    document.querySelectorAll('.btn-approve').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const amount = btn.getAttribute('data-amount');
            const userName = btn.getAttribute('data-user');
            
            await supabase
                .from('payment_requests')
                .update({ status: 'approved', approved_at: new Date() })
                .eq('id', id);
            
            showToast(`Payment approved! Receipt generated.`, 'success');
            renderPayments();
            renderDashboard();
        });
    });
    
    document.querySelectorAll('.btn-reject').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            await supabase
                .from('payment_requests')
                .update({ status: 'rejected' })
                .eq('id', id);
            showToast('Payment rejected', 'info');
            renderPayments();
            renderDashboard();
        });
    });
}

// ============================================
// RENDER STUDENTS TAB
// ============================================
async function renderStudents() {
    const container = document.getElementById('studentsList');
    container.innerHTML = '<div class="loading">Loading students...</div>';
    
    const students = await loadStudents();
    allStudents = students;
    
    if (students.length === 0) {
        container.innerHTML = '<div class="empty-state">No students found</div>';
        return;
    }
    
    container.innerHTML = `
        <table class="students-table">
            <thead>
                <tr><th>Name</th><th>Email</th><th>Wallet Balance</th><th>Joined</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
                ${students.map(s => `
                    <tr>
                        <td>${s.name || 'N/A'}</td>
                        <td>${s.email}</td>
                        <td>₦${(s.wallet_balance || 0).toLocaleString()}</td>
                        <td>${new Date(s.created_at).toLocaleDateString()}</td>
                        <td><span class="payment-status approved">Active</span></td>
                        <td>
                            <button class="btn-view" data-id="${s.id}">View</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// ============================================
// RENDER INVENTORY TAB
// ============================================
async function renderInventory() {
    const container = document.getElementById('inventoryList');
    container.innerHTML = '<div class="loading">Loading inventory...</div>';
    
    const inventory = await loadInventory();
    allInventory = inventory;
    
    const totalProducts = inventory.length;
    const lowStockCount = inventory.filter(i => i.stock < 10).length;
    const monthlySales = 0; // Would come from sales table
    
    document.getElementById('totalProducts').textContent = totalProducts;
    document.getElementById('lowStockCount').textContent = lowStockCount;
    document.getElementById('monthlySales').textContent = '₦0';
    
    if (inventory.length === 0) {
        container.innerHTML = '<div class="empty-state">No products found</div>';
        return;
    }
    
    container.innerHTML = `
        <div class="inventory-grid">
            ${inventory.map(item => `
                <div class="inventory-card ${item.stock < 10 ? 'low-stock' : ''}">
                    <div class="inventory-card-header">
                        <h4>${item.name}</h4>
                        <span class="inventory-category">${item.category}</span>
                    </div>
                    <div class="inventory-stock">Stock: ${item.stock} units</div>
                    <div class="inventory-price">₦${item.price.toLocaleString()}</div>
                    <div class="inventory-actions">
                        <button class="btn-outline edit-product" data-id="${item.id}">Edit</button>
                        <button class="btn-outline sell-product" data-id="${item.id}">Record Sale</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ============================================
// RENDER FINANCE TAB
// ============================================
async function renderFinance() {
    const payments = await loadPayments();
    const expenses = await loadExpenses();
    const disbursements = await loadDisbursements();
    
    const approvedPayments = payments.filter(p => p.status === 'approved');
    const totalRevenue = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = totalRevenue - totalExpenses;
    
    document.getElementById('financeTotalRevenue').textContent = `₦${totalRevenue.toLocaleString()}`;
    document.getElementById('financeTotalExpenses').textContent = `₦${totalExpenses.toLocaleString()}`;
    document.getElementById('financeNetProfit').textContent = `₦${netProfit.toLocaleString()}`;
    
    // Revenue breakdown
    const breakdown = {};
    approvedPayments.forEach(p => {
        breakdown[p.bank || 'Bank Transfer'] = (breakdown[p.bank || 'Bank Transfer'] || 0) + p.amount;
    });
    
    const breakdownDiv = document.getElementById('revenueBreakdown');
    breakdownDiv.innerHTML = Object.entries(breakdown).map(([source, amount]) => `
        <div class="breakdown-item">
            <span>${source}</span>
            <strong>₦${amount.toLocaleString()}</strong>
        </div>
    `).join('');
    
    // Render expenses list
    const expensesDiv = document.getElementById('expensesList');
    expensesDiv.innerHTML = expenses.length === 0 ? '<div class="empty-state">No expenses recorded</div>' :
        expenses.map(e => `
            <div class="payment-item">
                <div class="payment-info">
                    <div class="payment-amount">₦${e.amount.toLocaleString()}</div>
                    <div class="payment-date">${new Date(e.date).toLocaleDateString()}</div>
                    <div class="payment-ref">${e.category} - ${e.description}</div>
                </div>
            </div>
        `).join('');
    
    // Render disbursements list
    const disbursementsDiv = document.getElementById('disbursementsList');
    disbursementsDiv.innerHTML = disbursements.length === 0 ? '<div class="empty-state">No disbursements recorded</div>' :
        disbursements.map(d => `
            <div class="payment-item">
                <div class="payment-info">
                    <div class="payment-amount">₦${d.amount.toLocaleString()}</div>
                    <div class="payment-date">${new Date(d.date).toLocaleDateString()}</div>
                    <div class="payment-ref">${d.recipient} - ${d.purpose}</div>
                </div>
                <div class="payment-status ${d.status}">${d.status}</div>
            </div>
        `).join('');
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
        if (tab.id === `${tabId}Tab`) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    // Load tab data
    if (tabId === 'dashboard') renderDashboard();
    else if (tabId === 'payments') renderPayments();
    else if (tabId === 'students') renderStudents();
    else if (tabId === 'inventory') renderInventory();
    else if (tabId === 'finance') renderFinance();
}

// ============================================
// MODAL HANDLERS
// ============================================
function setupModals() {
    // Add Product Modal
    const addProductBtn = document.getElementById('addProductBtn');
    const productModal = document.getElementById('productModal');
    const closeProductBtns = document.querySelectorAll('.closeProductModal');
    
    if (addProductBtn) {
        addProductBtn.onclick = () => productModal.classList.add('active');
    }
    closeProductBtns.forEach(btn => {
        btn.onclick = () => productModal.classList.remove('active');
    });
    
    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.onsubmit = (e) => {
            e.preventDefault();
            showToast('Product added!', 'success');
            productModal.classList.remove('active');
            renderInventory();
        };
    }
    
    // Add Expense Modal
    const addExpenseBtn = document.getElementById('addExpenseBtn');
    const expenseModal = document.getElementById('expenseModal');
    const closeExpenseBtns = document.querySelectorAll('.closeExpenseModal');
    
    if (addExpenseBtn) {
        addExpenseBtn.onclick = () => expenseModal.classList.add('active');
    }
    closeExpenseBtns.forEach(btn => {
        btn.onclick = () => expenseModal.classList.remove('active');
    });
    
    const expenseForm = document.getElementById('expenseForm');
    if (expenseForm) {
        expenseForm.onsubmit = (e) => {
            e.preventDefault();
            showToast('Expense added!', 'success');
            expenseModal.classList.remove('active');
            renderFinance();
        };
    }
}

// ============================================
// INITIALIZE
// ============================================
async function initAdminDashboard() {
    const isAuth = await checkAuth();
    if (!isAuth) return;
    
    setupModals();
    
    // Tab switching
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
    
    // Payment filters
    document.querySelectorAll('.payment-filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.payment-filters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPaymentFilter = btn.getAttribute('data-payment-filter');
            renderPayments();
        });
    });
    
    // Finance filters
    document.querySelectorAll('.finance-filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-finance-filter');
            document.querySelectorAll('.finance-filters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.finance-section').forEach(section => section.classList.remove('active'));
            if (filter === 'overview') document.getElementById('financeOverview').classList.add('active');
            else if (filter === 'expenses') document.getElementById('financeExpenses').classList.add('active');
            else if (filter === 'disbursements') document.getElementById('financeDisbursements').classList.add('active');
        });
    });
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await supabase.auth.signOut();
        localStorage.clear();
        window.location.href = '/signin.html';
    });
    
    // Load initial dashboard
    await renderDashboard();
}

initAdminDashboard();
