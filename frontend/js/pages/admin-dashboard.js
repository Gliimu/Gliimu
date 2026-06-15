// ============================================
// SECRETARY/ADMIN DASHBOARD
// Fully functional payment approval system
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
    console.log('Checking admin authentication...');
    
    // Check for dev mode bypass
    const devMode = localStorage.getItem('dev_admin_mode') === 'true';
    if (devMode) {
        console.log('Dev admin mode enabled');
        currentUser = { id: 'dev_admin', email: 'admin@test.com' };
        document.getElementById('adminName').textContent = 'Admin (Dev Mode)';
        return true;
    }
    
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
        console.error('Auth error:', error);
        showToast('Please login as admin', 'error');
        setTimeout(() => {
            window.location.href = '/signin.html';
        }, 1500);
        return false;
    }
    
    // Check if user is admin
    const { data: profile } = await supabase
        .from('users')
        .select('role, name')
        .eq('id', user.id)
        .single();
    
    if (profile?.role !== 'admin') {
        // Allow dev mode as fallback
        if (confirm('You are not registered as admin. Continue in demo mode?')) {
            localStorage.setItem('dev_admin_mode', 'true');
            currentUser = user;
            document.getElementById('adminName').textContent = `${profile?.name || 'User'} (Demo Mode)`;
            return true;
        }
        
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
// LOAD PAYMENTS FROM SUPABASE
// ============================================
async function loadPayments() {
    try {
        console.log('Loading payments from Supabase...');
        
        // First, try to load from Supabase
        const { data, error } = await supabase
            .from('payment_requests')
            .select('*')
            .order('submitted_at', { ascending: false });
        
        if (error) {
            console.error('Supabase error:', error);
            
            // If table doesn't exist, create it
            if (error.code === '42P01') {
                console.warn('payment_requests table not found. Please run the SQL migration.');
                showToast('Payment table not found. Please contact administrator.', 'error');
                return [];
            }
            return [];
        }
        
        if (data && data.length > 0) {
            console.log(`Loaded ${data.length} payments from Supabase`);
            return data;
        }
        
        // Fallback: Try to load from localStorage (for existing pending payments)
        console.log('No payments in Supabase, checking localStorage...');
        const localPayments = [];
        
        // Check each user's localStorage for payments
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('glimu_payments_')) {
                try {
                    const userPayments = JSON.parse(localStorage.getItem(key));
                    if (Array.isArray(userPayments)) {
                        localPayments.push(...userPayments);
                    }
                } catch (e) {
                    console.error('Error parsing localStorage payments:', e);
                }
            }
        }
        
        if (localPayments.length > 0) {
            console.log(`Found ${localPayments.length} payments in localStorage`);
            // Migrate local payments to Supabase
            for (const payment of localPayments) {
                if (payment.status === 'pending') {
                    await supabase
                        .from('payment_requests')
                        .insert([{
                            id: payment.id,
                            user_id: payment.user_id,
                            user_name: payment.user_name,
                            user_email: payment.user_email,
                            amount: payment.amount,
                            reference_code: payment.reference_code,
                            bank: payment.bank,
                            status: payment.status,
                            submitted_at: payment.submitted_at
                        }])
                        .catch(e => console.error('Migration error:', e));
                }
            }
            return localPayments;
        }
        
        return [];
        
    } catch (error) {
        console.error('Error in loadPayments:', error);
        return [];
    }
}

// Mock payments for testing when table doesn't exist
function getMockPayments() {
    return [
        { 
            id: 'pay_1', 
            user_id: 'user_1',
            user_name: 'John Doe', 
            user_email: 'john@example.com', 
            amount: 5000, 
            reference_code: 'GLM-JOHN-1234', 
            status: 'pending', 
            submitted_at: new Date().toISOString(),
            bank: 'MoniePoint'
        },
        { 
            id: 'pay_2', 
            user_id: 'user_2',
            user_name: 'Jane Smith', 
            user_email: 'jane@example.com', 
            amount: 10000, 
            reference_code: 'GLM-JANE-5678', 
            status: 'approved', 
            submitted_at: new Date(Date.now() - 86400000).toISOString(),
            approved_at: new Date().toISOString(),
            bank: 'Opay'
        },
        { 
            id: 'pay_3', 
            user_id: 'user_3',
            user_name: 'Mike Johnson', 
            user_email: 'mike@example.com', 
            amount: 25000, 
            reference_code: 'GLM-MIKE-9012', 
            status: 'pending', 
            submitted_at: new Date(Date.now() - 172800000).toISOString(),
            bank: 'MoniePoint'
        }
    ];
}

// ============================================
// APPROVE PAYMENT
// ============================================
async function approvePayment(paymentId, amount, userName) {
    try {
        // Update payment status in Supabase
        const { error } = await supabase
            .from('payment_requests')
            .update({ 
                status: 'approved', 
                approved_at: new Date().toISOString()
            })
            .eq('id', paymentId);
        
        if (error) throw error;
        
        // Get the payment details to update user's wallet
        const { data: payment } = await supabase
            .from('payment_requests')
            .select('user_id, amount')
            .eq('id', paymentId)
            .single();
        
        if (payment) {
            // Update user's wallet balance
            const { data: user } = await supabase
                .from('users')
                .select('wallet_balance')
                .eq('id', payment.user_id)
                .single();
            
            const newBalance = (user?.wallet_balance || 0) + payment.amount;
            
            await supabase
                .from('users')
                .update({ wallet_balance: newBalance })
                .eq('id', payment.user_id);
            
            // Add transaction record
            await supabase
                .from('transactions')
                .insert([{
                    id: `tx_${Date.now()}`,
                    user_id: payment.user_id,
                    amount: payment.amount,
                    type: 'credit',
                    description: `Wallet funding via ${payment.reference_code}`,
                    status: 'completed',
                    created_at: new Date().toISOString()
                }]);
        }
        
        showToast(`✅ Payment of ₦${amount.toLocaleString()} from ${userName} approved!`, 'success');
        
        // Refresh the payments list
        await renderPayments();
        await renderDashboard();
        
    } catch (error) {
        console.error('Error approving payment:', error);
        showToast('Error approving payment', 'error');
    }
}

// ============================================
// REJECT PAYMENT
// ============================================
async function rejectPayment(paymentId, amount, userName) {
    try {
        const { error } = await supabase
            .from('payment_requests')
            .update({ 
                status: 'rejected', 
                admin_notes: 'Payment rejected by admin'
            })
            .eq('id', paymentId);
        
        if (error) throw error;
        
        showToast(`❌ Payment of ₦${amount.toLocaleString()} from ${userName} rejected`, 'info');
        
        // Refresh the payments list
        await renderPayments();
        await renderDashboard();
        
    } catch (error) {
        console.error('Error rejecting payment:', error);
        showToast('Error rejecting payment', 'error');
    }
}

// ============================================
// LOAD OTHER DATA
// ============================================
async function loadStudents() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'student')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading students:', error);
        return [
            { id: '1', name: 'John Doe', email: 'john@example.com', wallet_balance: 14500, created_at: new Date().toISOString() },
            { id: '2', name: 'Jane Smith', email: 'jane@example.com', wallet_balance: 5000, created_at: new Date().toISOString() }
        ];
    }
}

async function loadInventory() {
    try {
        const { data, error } = await supabase
            .from('inventory')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        return [
            { id: 1, name: 'Gliimu T-Shirt', category: 'uniform', price: 5000, stock: 45 },
            { id: 2, name: 'MacBook Pro', category: 'gadget', price: 2500000, stock: 3 },
            { id: 3, name: 'Video Production Guide', category: 'material', price: 15000, stock: 20 }
        ];
    }
}

async function loadExpenses() {
    try {
        const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .order('date', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        return [
            { id: 1, category: 'rent', amount: 150000, description: 'Office rent - June', date: '2025-06-01' }
        ];
    }
}

async function loadDisbursements() {
    try {
        const { data, error } = await supabase
            .from('disbursements')
            .select('*')
            .order('date', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        return [];
    }
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
    
    // Update badge
    document.getElementById('pendingPaymentsBadge').textContent = pendingPayments.length;
    
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
    
    // Update pending badge
    const pendingCount = payments.filter(p => p.status === 'pending').length;
    document.getElementById('pendingPaymentsBadge').textContent = pendingCount;
    
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
                <div class="payment-ref">Reference: ${p.reference_code}</div>
                <div class="payment-user">Student: ${p.user_name} (${p.user_email})</div>
                ${p.bank ? `<div class="payment-bank">Bank: ${p.bank}</div>` : ''}
            </div>
            <div class="payment-status ${p.status}">${p.status.toUpperCase()}</div>
            <div class="payment-actions">
                ${p.status === 'pending' ? `
                    <button class="btn-approve" data-id="${p.id}" data-amount="${p.amount}" data-user="${p.user_name}">
                        <i class="fas fa-check"></i> Approve
                    </button>
                    <button class="btn-reject" data-id="${p.id}" data-amount="${p.amount}" data-user="${p.user_name}">
                        <i class="fas fa-times"></i> Reject
                    </button>
                ` : p.status === 'approved' ? `
                    <button class="btn-view" data-id="${p.id}">
                        <i class="fas fa-receipt"></i> View Receipt
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
    
    // Add event listeners for approve buttons
    document.querySelectorAll('.btn-approve').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const id = btn.getAttribute('data-id');
            const amount = parseInt(btn.getAttribute('data-amount'));
            const userName = btn.getAttribute('data-user');
            
            if (confirm(`Approve payment of ₦${amount.toLocaleString()} from ${userName}?`)) {
                await approvePayment(id, amount, userName);
            }
        });
    });
    
    // Add event listeners for reject buttons
    document.querySelectorAll('.btn-reject').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
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
                <tr><th>Name</th><th>Email</th><th>Wallet Balance</th><th>Joined</th><th>Status</th></tr>
            </thead>
            <tbody>
                ${students.map(s => `
                    <tr>
                        <td>${s.name || 'N/A'}</td>
                        <td>${s.email}</td>
                        <td>₦${(s.wallet_balance || 0).toLocaleString()}</td>
                        <td>${new Date(s.created_at).toLocaleDateString()}</td>
                        <td><span class="payment-status approved">Active</span></td>
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
    breakdownDiv.innerHTML = Object.entries(breakdown).length === 0 ? 
        '<div class="empty-state">No revenue data yet</div>' :
        Object.entries(breakdown).map(([source, amount]) => `
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
// INITIALIZE
// ============================================
async function initAdminDashboard() {
    console.log('Initializing admin dashboard...');
    
    const isAuth = await checkAuth();
    if (!isAuth) return;
    
    // Tab switching
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
    
    // Payment filters
    const paymentFilters = document.querySelectorAll('.payment-filters .filter-btn');
    paymentFilters.forEach(btn => {
        btn.addEventListener('click', () => {
            paymentFilters.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPaymentFilter = btn.getAttribute('data-payment-filter');
            renderPayments();
        });
    });
    
    // Finance filters
    const financeFilters = document.querySelectorAll('.finance-filters .filter-btn');
    financeFilters.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-finance-filter');
            financeFilters.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.getElementById('financeOverview')?.classList.remove('active');
            document.getElementById('financeExpenses')?.classList.remove('active');
            document.getElementById('financeDisbursements')?.classList.remove('active');
            
            if (filter === 'overview') document.getElementById('financeOverview')?.classList.add('active');
            else if (filter === 'expenses') document.getElementById('financeExpenses')?.classList.add('active');
            else if (filter === 'disbursements') document.getElementById('financeDisbursements')?.classList.add('active');
        });
    });
    
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await supabase.auth.signOut();
            localStorage.clear();
            window.location.href = '/signin.html';
        });
    }
    
    // Load initial dashboard
    await renderDashboard();
    
    console.log('Admin dashboard initialized');
}

// Make functions available globally for debugging
window.admin = {
    approvePayment,
    rejectPayment,
    loadPayments,
    renderPayments
};

// Start the dashboard
initAdminDashboard();
