// ============================================
// SECRETARY/ADMIN DASHBOARD
// Fully functional payment approval system
// Displays user payment requests from Supabase
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// Global state
let currentUser = null;
let currentTab = 'dashboard';
let currentPaymentFilter = 'pending';
let allPayments = [];
let allStudents = [];
let allProducts = [];
let allExpenses = [];
let allDisbursements = [];
let refreshInterval = null;

// ============================================
// AUTHENTICATION CHECK
// ============================================
async function checkAuth() {
    console.log('Checking admin authentication...');
    
    const devMode = localStorage.getItem('dev_admin_mode') === 'true';
    if (devMode) {
        console.log('Dev admin mode enabled');
        currentUser = { id: 'dev_admin', email: 'admin@test.com', role: 'admin' };
        const adminNameEl = document.getElementById('adminName');
        if (adminNameEl) adminNameEl.textContent = 'Admin (Dev Mode)';
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
    const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, name')
        .eq('id', user.id)
        .single();
    
    if (profileError) {
        console.error('Profile error:', profileError);
    }
    
    if (profile?.role !== 'admin') {
        // Allow dev mode as fallback
        if (confirm('You are not registered as admin. Continue in demo mode?')) {
            localStorage.setItem('dev_admin_mode', 'true');
            currentUser = { id: user.id, email: user.email, role: 'admin' };
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
    const adminNameEl = document.getElementById('adminName');
    if (adminNameEl) adminNameEl.textContent = profile?.name || 'Admin';
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
        
        // Log pending payments for debugging
        const pendingCount = data?.filter(p => p.status === 'pending').length || 0;
        console.log(`Pending payments: ${pendingCount}`);
        
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
        console.log(`Approving payment ${paymentId} for ${userName} - Amount: ₦${amount}`);
        
        // Get payment details first
        const { data: payment, error: fetchError } = await supabase
            .from('payment_requests')
            .select('*')
            .eq('id', paymentId)
            .single();
        
        if (fetchError) {
            console.error('Error fetching payment:', fetchError);
            showToast('Error fetching payment details', 'error');
            return;
        }
        
        // Update payment status to approved
        const { error: updateError } = await supabase
            .from('payment_requests')
            .update({ 
                status: 'approved', 
                approved_at: new Date().toISOString()
            })
            .eq('id', paymentId);
        
        if (updateError) {
            console.error('Error updating payment status:', updateError);
            showToast('Error approving payment', 'error');
            return;
        }
        
        // Get current user wallet balance
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('wallet_balance')
            .eq('id', payment.user_id)
            .single();
        
        if (userError) {
            console.error('Error fetching user wallet:', userError);
        }
        
        const currentBalance = user?.wallet_balance || 0;
        const newBalance = currentBalance + payment.amount;
        
        // Update user's wallet balance
        const { error: walletError } = await supabase
            .from('users')
            .update({ wallet_balance: newBalance })
            .eq('id', payment.user_id);
        
        if (walletError) {
            console.error('Error updating wallet:', walletError);
            showToast('Payment approved but wallet update failed', 'warning');
        } else {
            console.log(`Wallet updated: ₦${currentBalance} → ₦${newBalance}`);
        }
        
        // Add transaction record
        try {
            const { error: txError } = await supabase
                .from('transactions')
                .insert({
                    user_id: payment.user_id,
                    amount: payment.amount,
                    type: 'credit',
                    description: `Wallet funding via ${payment.reference_code}`,
                    status: 'completed',
                    created_at: new Date().toISOString()
                });
            
            if (txError) console.error('Error recording transaction:', txError);
        } catch (txErr) {
            console.error('Transaction error:', txErr);
        }
        
        showToast(`✅ Payment of ₦${amount.toLocaleString()} from ${userName} approved! Wallet credited.`, 'success');
        
        // Refresh all displays
        await refreshAllData();
        
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
        console.log(`Rejecting payment ${paymentId} for ${userName} - Amount: ₦${amount}`);
        
        const { error } = await supabase
            .from('payment_requests')
            .update({ 
                status: 'rejected', 
                admin_notes: 'Payment rejected by admin',
                approved_at: new Date().toISOString()
            })
            .eq('id', paymentId);
        
        if (error) {
            console.error('Error rejecting payment:', error);
            showToast('Error rejecting payment', 'error');
            return;
        }
        
        showToast(`❌ Payment of ₦${amount.toLocaleString()} from ${userName} rejected`, 'info');
        
        // Refresh all displays
        await refreshAllData();
        
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

async function loadProducts() {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading products:', error);
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
// REFRESH ALL DATA
// ============================================
async function refreshAllData() {
    console.log('Refreshing all admin data...');
    
    // Reload payments
    allPayments = await loadPayments();
    
    // Update pending badge
    const pendingCount = allPayments.filter(p => p.status === 'pending').length;
    const badgeEl = document.getElementById('pendingPaymentsBadge');
    if (badgeEl) badgeEl.textContent = pendingCount;
    
    // Re-render current tab
    if (currentTab === 'dashboard') await renderDashboard();
    else if (currentTab === 'payments') await renderPayments();
    else if (currentTab === 'students') await renderStudents();
    else if (currentTab === 'inventory') await renderInventory();
    else if (currentTab === 'finance') await renderFinance();
}

// ============================================
// RENDER DASHBOARD
// ============================================
async function renderDashboard() {
    const payments = allPayments.length > 0 ? allPayments : await loadPayments();
    const students = await loadStudents();
    const products = await loadProducts();
    
    const pendingPayments = payments.filter(p => p.status === 'pending');
    const approvedPayments = payments.filter(p => p.status === 'approved');
    const lowStockItems = products.filter(p => (p.stock_quantity || 0) < 10);
    const totalRevenue = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
    
    // Update stats
    const pendingEl = document.getElementById('statPendingPayments');
    const approvedEl = document.getElementById('statApprovedPayments');
    const studentsEl = document.getElementById('statTotalStudents');
    const certificatesEl = document.getElementById('statCertificatesIssued');
    const revenueEl = document.getElementById('statTotalRevenue');
    const lowStockEl = document.getElementById('statLowStock');
    const badgeEl = document.getElementById('pendingPaymentsBadge');
    
    if (pendingEl) pendingEl.textContent = pendingPayments.length;
    if (approvedEl) approvedEl.textContent = approvedPayments.length;
    if (studentsEl) studentsEl.textContent = students.length;
    if (certificatesEl) certificatesEl.textContent = '0';
    if (revenueEl) revenueEl.textContent = `₦${totalRevenue.toLocaleString()}`;
    if (lowStockEl) lowStockEl.textContent = lowStockItems.length;
    if (badgeEl) badgeEl.textContent = pendingPayments.length;
    
    // Recent payments
    const recentPaymentsDiv = document.getElementById('recentPayments');
    if (recentPaymentsDiv) {
        const recent = payments.slice(0, 5);
        recentPaymentsDiv.innerHTML = recent.length === 0 ? 
            '<div class="empty-state">No payments yet</div>' : 
            recent.map(p => `
                <div class="payment-item ${p.status}">
                    <div class="payment-info">
                        <div class="payment-amount">₦${p.amount.toLocaleString()}</div>
                        <div class="payment-date">${new Date(p.submitted_at).toLocaleDateString()}</div>
                        <div class="payment-ref">${p.user_name || p.user_email || 'Unknown'}</div>
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
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading payments...</div>';
    
    // Refresh payments data
    allPayments = await loadPayments();
    
    const pendingCount = allPayments.filter(p => p.status === 'pending').length;
    const badgeEl = document.getElementById('pendingPaymentsBadge');
    if (badgeEl) badgeEl.textContent = pendingCount;
    
    const filtered = allPayments.filter(p => p.status === currentPaymentFilter);
    
    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state">
            <i class="fas fa-inbox"></i>
            <p>No ${currentPaymentFilter} payments found</p>
        </div>`;
        return;
    }
    
    container.innerHTML = filtered.map(p => `
        <div class="payment-item ${p.status}">
            <div class="payment-info">
                <div class="payment-amount">₦${p.amount.toLocaleString()}</div>
                <div class="payment-date">${new Date(p.submitted_at).toLocaleString()}</div>
                <div class="payment-ref">Reference: <strong>${p.reference_code}</strong></div>
                <div class="payment-user">
                    <i class="fas fa-user"></i> ${p.user_name || 'Unknown'} 
                    <span style="color: var(--text-secondary);">(${p.user_email || 'No email'})</span>
                </div>
                ${p.bank ? `<div class="payment-bank"><i class="fas fa-university"></i> Bank: ${p.bank}</div>` : ''}
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
                    <span class="approved-label"><i class="fas fa-check-circle"></i> Approved on ${new Date(p.approved_at).toLocaleDateString()}</span>
                ` : p.status === 'rejected' ? `
                    <span class="rejected-label"><i class="fas fa-ban"></i> Rejected</span>
                ` : ''}
            </div>
        </div>
    `).join('');
    
    // Add event listeners for approve buttons
    document.querySelectorAll('.btn-approve').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const amount = parseInt(btn.getAttribute('data-amount'));
            const userName = btn.getAttribute('data-user');
            
            if (confirm(`Approve payment of ₦${amount.toLocaleString()} from ${userName}? This will credit their wallet.`)) {
                await approvePayment(id, amount, userName);
            }
        });
    });
    
    // Add event listeners for reject buttons
    document.querySelectorAll('.btn-reject').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
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
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading students...</div>';
    
    const students = await loadStudents();
    allStudents = students;
    
    if (students.length === 0) {
        container.innerHTML = '<div class="empty-state">No students found</div>';
        return;
    }
    
    container.innerHTML = `
        <div class="table-responsive">
            <table class="students-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Wallet Balance</th>
                        <th>Joined</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${students.map(s => `
                        <tr>
                            <td><strong>${s.name || 'N/A'}</strong></td>
                            <td>${s.email || 'N/A'}</td>
                            <td class="wallet-amount">₦${(s.wallet_balance || 0).toLocaleString()}</td>
                            <td>${new Date(s.created_at).toLocaleDateString()}</td>
                            <td><span class="status-badge active">Active</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ============================================
// RENDER INVENTORY TAB
// ============================================
async function renderInventory() {
    const container = document.getElementById('inventoryList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading inventory...</div>';
    
    const products = await loadProducts();
    allProducts = products;
    
    const totalProducts = products.length;
    const lowStockCount = products.filter(p => (p.stock_quantity || 0) < 10).length;
    
    const totalEl = document.getElementById('totalProducts');
    const lowStockEl = document.getElementById('lowStockCount');
    const monthlyEl = document.getElementById('monthlySales');
    
    if (totalEl) totalEl.textContent = totalProducts;
    if (lowStockEl) lowStockEl.textContent = lowStockCount;
    if (monthlyEl) monthlyEl.textContent = '₦0';
    
    if (products.length === 0) {
        container.innerHTML = '<div class="empty-state">No products found</div>';
        return;
    }
    
    container.innerHTML = `
        <div class="inventory-grid">
            ${products.map(item => `
                <div class="inventory-card ${(item.stock_quantity || 0) < 10 ? 'low-stock' : ''}">
                    <div class="inventory-card-header">
                        <h4>${escapeHtml(item.name)}</h4>
                        <span class="inventory-category">${item.category || 'General'}</span>
                    </div>
                    <div class="inventory-stock">
                        <i class="fas fa-boxes"></i> Stock: ${item.stock_quantity || 0} units
                    </div>
                    <div class="inventory-price">
                        <i class="fas fa-tag"></i> ₦${(item.price || 0).toLocaleString()}
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
    
    const revenueEl = document.getElementById('financeTotalRevenue');
    const expensesEl = document.getElementById('financeTotalExpenses');
    const profitEl = document.getElementById('financeNetProfit');
    
    if (revenueEl) revenueEl.textContent = `₦${totalRevenue.toLocaleString()}`;
    if (expensesEl) expensesEl.textContent = `₦${totalExpenses.toLocaleString()}`;
    if (profitEl) {
        profitEl.textContent = `₦${netProfit.toLocaleString()}`;
        if (netProfit < 0) profitEl.style.color = 'var(--danger)';
        else profitEl.style.color = 'var(--success)';
    }
    
    // Revenue breakdown by bank
    const breakdown = {};
    approvedPayments.forEach(p => {
        const source = p.bank || 'Bank Transfer';
        breakdown[source] = (breakdown[source] || 0) + p.amount;
    });
    
    const breakdownDiv = document.getElementById('revenueBreakdown');
    if (breakdownDiv) {
        breakdownDiv.innerHTML = Object.entries(breakdown).length === 0 ? 
            '<div class="empty-state">No revenue data yet</div>' :
            Object.entries(breakdown).map(([source, amount]) => `
                <div class="breakdown-item">
                    <span><i class="fas fa-chart-line"></i> ${source}</span>
                    <strong>₦${amount.toLocaleString()}</strong>
                </div>
            `).join('');
    }
    
    // Render expenses list
    const expensesDiv = document.getElementById('expensesList');
    if (expensesDiv) {
        expensesDiv.innerHTML = expenses.length === 0 ? 
            '<div class="empty-state">No expenses recorded</div>' :
            expenses.map(e => `
                <div class="expense-item">
                    <div class="expense-info">
                        <div class="expense-amount">₦${e.amount.toLocaleString()}</div>
                        <div class="expense-date">${new Date(e.date).toLocaleDateString()}</div>
                        <div class="expense-desc">${e.category} - ${e.description || ''}</div>
                    </div>
                </div>
            `).join('');
    }
    
    // Render disbursements list
    const disbursementsDiv = document.getElementById('disbursementsList');
    if (disbursementsDiv) {
        disbursementsDiv.innerHTML = disbursements.length === 0 ? 
            '<div class="empty-state">No disbursements recorded</div>' :
            disbursements.map(d => `
                <div class="disbursement-item">
                    <div class="disbursement-info">
                        <div class="disbursement-amount">₦${d.amount.toLocaleString()}</div>
                        <div class="disbursement-date">${new Date(d.date).toLocaleDateString()}</div>
                        <div class="disbursement-desc">${d.recipient} - ${d.purpose}</div>
                    </div>
                    <div class="disbursement-status ${d.status}">${d.status || 'pending'}</div>
                </div>
            `).join('');
    }
}

// ============================================
// TAB SWITCHING
// ============================================
function switchTab(tabId) {
    console.log('Switching to tab:', tabId);
    currentTab = tabId;
    
    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        const itemTab = item.getAttribute('data-tab');
        if (itemTab === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Update tab content
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
// AUTO REFRESH SETUP
// ============================================
function setupAutoRefresh() {
    // Clear existing interval
    if (refreshInterval) clearInterval(refreshInterval);
    
    // Refresh every 30 seconds
    refreshInterval = setInterval(async () => {
        console.log('Auto-refreshing admin data...');
        if (currentTab === 'payments') {
            await renderPayments();
        } else if (currentTab === 'dashboard') {
            await renderDashboard();
        }
    }, 30000);
}

// ============================================
// INITIALIZE
// ============================================
async function initAdminDashboard() {
    console.log('Initializing admin dashboard...');
    
    const isAuth = await checkAuth();
    if (!isAuth) return;
    
    // Initial data load
    allPayments = await loadPayments();
    console.log(`Initial payments loaded: ${allPayments.length}`);
    console.log(`Pending payments: ${allPayments.filter(p => p.status === 'pending').length}`);
    
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
    
    // Setup auto-refresh
    setupAutoRefresh();
    
    console.log('Admin dashboard initialized successfully');
}

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make functions available globally for debugging
window.admin = {
    approvePayment,
    rejectPayment,
    loadPayments,
    renderPayments,
    refreshAllData,
    allPayments: () => allPayments
};

// Start the dashboard
initAdminDashboard();
