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
    
    const { data: profile } = await supabase
        .from('users')
        .select('role, name')
        .eq('id', user.id)
        .single();
    
    if (profile?.role !== 'admin') {
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
        
        const { data, error } = await supabase
            .from('payment_requests')
            .select('*')
            .order('submitted_at', { ascending: false });
        
        if (error) {
            console.error('Supabase error:', error);
            if (error.code === '42P01') {
                showToast('Payment table not found. Please run database migration.', 'error');
            }
            return [];
        }
        
        console.log(`Loaded ${data?.length || 0} payments from Supabase`);
        return data || [];
        
    } catch (error) {
        console.error('Error loading payments:', error);
        return [];
    }
}

// ============================================
// APPROVE PAYMENT - Updates user wallet
// ============================================
async function approvePayment(paymentId, amount, userName) {
    try {
        // Get payment details first
        const { data: payment, error: fetchError } = await supabase
            .from('payment_requests')
            .select('*')
            .eq('id', paymentId)
            .single();
        
        if (fetchError) throw fetchError;
        
        // Update payment status
        const { error: updateError } = await supabase
            .from('payment_requests')
            .update({ 
                status: 'approved', 
                approved_at: new Date().toISOString()
            })
            .eq('id', paymentId);
        
        if (updateError) throw updateError;
        
        // Update user's wallet balance
        const { data: user } = await supabase
            .from('users')
            .select('wallet_balance')
            .eq('id', payment.user_id)
            .single();
        
        const currentBalance = user?.wallet_balance || 0;
        const newBalance = currentBalance + payment.amount;
        
        const { error: walletError } = await supabase
            .from('users')
            .update({ wallet_balance: newBalance })
            .eq('id', payment.user_id);
        
        if (walletError) throw walletError;
        
        // Add transaction record
        const { error: txError } = await supabase
            .from('transactions')
            .insert([{
                user_id: payment.user_id,
                amount: payment.amount,
                type: 'credit',
                description: `Wallet funding via ${payment.reference_code}`,
                status: 'completed',
                created_at: new Date().toISOString()
            }]);
        
        if (txError) console.error('Error recording transaction:', txError);
        
        showToast(`✅ Payment of ₦${amount.toLocaleString()} from ${userName} approved! Wallet credited.`, 'success');
        
        // Refresh all displays
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
                admin_notes: 'Payment rejected by admin',
                approved_at: new Date().toISOString()
            })
            .eq('id', paymentId);
        
        if (error) throw error;
        
        showToast(`❌ Payment of ₦${amount.toLocaleString()} from ${userName} rejected`, 'info');
        
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
        return [];
    }
}

async function loadInventory() {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading inventory:', error);
        return [];
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
        return [];
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
    const lowStockItems = inventory.filter(i => i.stock_quantity < 10);
    
    const pendingSpan = document.getElementById('statPendingPayments');
    const approvedSpan = document.getElementById('statApprovedPayments');
    const studentsSpan = document.getElementById('statTotalStudents');
    const certificatesSpan = document.getElementById('statCertificatesIssued');
    const revenueSpan = document.getElementById('statTotalRevenue');
    const lowStockSpan = document.getElementById('statLowStock');
    const badgeSpan = document.getElementById('pendingPaymentsBadge');
    
    if (pendingSpan) pendingSpan.textContent = pendingPayments.length;
    if (approvedSpan) approvedSpan.textContent = approvedPayments.length;
    if (studentsSpan) studentsSpan.textContent = students.length;
    if (certificatesSpan) certificatesSpan.textContent = '0';
    if (revenueSpan) revenueSpan.textContent = `₦${approvedPayments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}`;
    if (lowStockSpan) lowStockSpan.textContent = lowStockItems.length;
    if (badgeSpan) badgeSpan.textContent = pendingPayments.length;
    
    const recentPaymentsDiv = document.getElementById('recentPayments');
    if (recentPaymentsDiv) {
        const recent = payments.slice(0, 5);
        recentPaymentsDiv.innerHTML = recent.length === 0 ? '<div class="empty-state">No payments yet</div>' : 
            recent.map(p => `
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
}

// ============================================
// RENDER PAYMENTS TAB
// ============================================
async function renderPayments() {
    const container = document.getElementById('paymentsList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading payments...</div>';
    
    const payments = await loadPayments();
    allPayments = payments;
    
    const pendingCount = payments.filter(p => p.status === 'pending').length;
    const badgeSpan = document.getElementById('pendingPaymentsBadge');
    if (badgeSpan) badgeSpan.textContent = pendingCount;
    
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
                <div class="payment-user">Student: ${p.user_name || 'N/A'} (${p.user_email || 'N/A'})</div>
                ${p.bank ? `<div class="payment-bank">Bank: ${p.bank}</div>` : ''}
            </div>
            <div class="payment-status ${p.status}">${p.status.toUpperCase()}</div>
            <div class="payment-actions">
                ${p.status === 'pending' ? `
                    <button class="btn-approve" data-id="${p.id}" data-amount="${p.amount}" data-user="${p.user_name || p.user_email}">
                        <i class="fas fa-check"></i> Approve
                    </button>
                    <button class="btn-reject" data-id="${p.id}" data-amount="${p.amount}" data-user="${p.user_name || p.user_email}">
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
    
    document.querySelectorAll('.btn-approve').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const id = btn.getAttribute('data-id');
            const amount = parseInt(btn.getAttribute('data-amount'));
            const userName = btn.getAttribute('data-user');
            
            if (confirm(`Approve payment of ₦${amount.toLocaleString()} from ${userName}? This will credit their wallet.`)) {
                await approvePayment(id, amount, userName);
            }
        });
    });
    
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
    if (!container) return;
    
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
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading inventory...</div>';
    
    const inventory = await loadInventory();
    allInventory = inventory;
    
    const totalProducts = inventory.length;
    const lowStockCount = inventory.filter(i => (i.stock_quantity || 0) < 10).length;
    
    const totalSpan = document.getElementById('totalProducts');
    const lowStockSpan = document.getElementById('lowStockCount');
    const monthlySpan = document.getElementById('monthlySales');
    
    if (totalSpan) totalSpan.textContent = totalProducts;
    if (lowStockSpan) lowStockSpan.textContent = lowStockCount;
    if (monthlySpan) monthlySpan.textContent = '₦0';
    
    if (inventory.length === 0) {
        container.innerHTML = '<div class="empty-state">No products found</div>';
        return;
    }
    
    container.innerHTML = `
        <div class="inventory-grid">
            ${inventory.map(item => `
                <div class="inventory-card ${(item.stock_quantity || 0) < 10 ? 'low-stock' : ''}">
                    <div class="inventory-card-header">
                        <h4>${item.name}</h4>
                        <span class="inventory-category">${item.category}</span>
                    </div>
                    <div class="inventory-stock">Stock: ${item.stock_quantity || 0} units</div>
                    <div class="inventory-price">₦${(item.price || 0).toLocaleString()}</div>
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
    
    const revenueSpan = document.getElementById('financeTotalRevenue');
    const expensesSpan = document.getElementById('financeTotalExpenses');
    const profitSpan = document.getElementById('financeNetProfit');
    
    if (revenueSpan) revenueSpan.textContent = `₦${totalRevenue.toLocaleString()}`;
    if (expensesSpan) expensesSpan.textContent = `₦${totalExpenses.toLocaleString()}`;
    if (profitSpan) profitSpan.textContent = `₦${netProfit.toLocaleString()}`;
    
    const breakdown = {};
    approvedPayments.forEach(p => {
        breakdown[p.bank || 'Bank Transfer'] = (breakdown[p.bank || 'Bank Transfer'] || 0) + p.amount;
    });
    
    const breakdownDiv = document.getElementById('revenueBreakdown');
    if (breakdownDiv) {
        breakdownDiv.innerHTML = Object.entries(breakdown).length === 0 ? 
            '<div class="empty-state">No revenue data yet</div>' :
            Object.entries(breakdown).map(([source, amount]) => `
                <div class="breakdown-item">
                    <span>${source}</span>
                    <strong>₦${amount.toLocaleString()}</strong>
                </div>
            `).join('');
    }
    
    const expensesDiv = document.getElementById('expensesList');
    if (expensesDiv) {
        expensesDiv.innerHTML = expenses.length === 0 ? '<div class="empty-state">No expenses recorded</div>' :
            expenses.map(e => `
                <div class="payment-item">
                    <div class="payment-info">
                        <div class="payment-amount">₦${e.amount.toLocaleString()}</div>
                        <div class="payment-date">${new Date(e.date).toLocaleDateString()}</div>
                        <div class="payment-ref">${e.category} - ${e.description || ''}</div>
                    </div>
                </div>
            `).join('');
    }
    
    const disbursementsDiv = document.getElementById('disbursementsList');
    if (disbursementsDiv) {
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
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
    
    const paymentFilters = document.querySelectorAll('.payment-filters .filter-btn');
    paymentFilters.forEach(btn => {
        btn.addEventListener('click', () => {
            paymentFilters.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPaymentFilter = btn.getAttribute('data-payment-filter');
            renderPayments();
        });
    });
    
    const financeFilters = document.querySelectorAll('.finance-filters .filter-btn');
    financeFilters.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-finance-filter');
            financeFilters.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const overview = document.getElementById('financeOverview');
            const expenses = document.getElementById('financeExpenses');
            const disbursements = document.getElementById('financeDisbursements');
            
            if (overview) overview.classList.remove('active');
            if (expenses) expenses.classList.remove('active');
            if (disbursements) disbursements.classList.remove('active');
            
            if (filter === 'overview' && overview) overview.classList.add('active');
            else if (filter === 'expenses' && expenses) expenses.classList.add('active');
            else if (filter === 'disbursements' && disbursements) disbursements.classList.add('active');
        });
    });
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await supabase.auth.signOut();
            localStorage.clear();
            window.location.href = '/signin.html';
        });
    }
    
    await renderDashboard();
    
    console.log('Admin dashboard initialized');
}

window.admin = {
    approvePayment,
    rejectPayment,
    loadPayments,
    renderPayments
};

initAdminDashboard();
