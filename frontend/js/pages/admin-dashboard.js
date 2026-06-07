// Admin Dashboard - Supabase Version
import { supabase, getUserProfile, subscribeToAllPayments } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

let allPayments = [];
let currentPaymentId = null;
let currentAction = 'approve';
let paymentSubscription = null;

// Check if user is admin
async function checkAdminAccess() {
    const profile = await getUserProfile();
    if (!profile || profile.role !== 'admin') {
        showToast('Admin access required', 'error');
        setTimeout(() => {
            window.location.href = '/dashboard.html';
        }, 2000);
        return false;
    }
    return true;
}

// Load payments from Supabase
async function loadPayments() {
    const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('submitted_at', { ascending: false });
    
    if (error) {
        console.error('Error loading payments:', error);
        return [];
    }
    
    allPayments = data.map(p => ({
        id: p.id,
        userId: p.user_id,
        userName: p.user_name,
        userEmail: p.user_email,
        amount: p.amount,
        bank: p.bank,
        referenceCode: p.reference_code,
        status: p.status,
        submittedAt: p.submitted_at,
        approvedAt: p.approved_at,
        adminNotes: p.admin_notes
    }));
    
    return allPayments;
}

// Update payment status
async function updatePaymentStatus(paymentId, status, adminNotes, narrationCode = null, receivedAmount = null) {
    const updates = { status, admin_notes: adminNotes };
    
    if (status === 'approved') {
        updates.approved_at = new Date().toISOString();
    }
    
    const { error } = await supabase
        .from('payments')
        .update(updates)
        .eq('id', paymentId);
    
    if (error) {
        throw error;
    }
    
    if (status === 'approved') {
        // Update user's wallet balance
        const payment = allPayments.find(p => p.id === paymentId);
        if (payment) {
            const { data: user } = await supabase
                .from('users')
                .select('wallet_balance')
                .eq('id', payment.userId)
                .single();
            
            const newBalance = (user?.wallet_balance || 25000) + payment.amount;
            
            await supabase
                .from('users')
                .update({ wallet_balance: newBalance })
                .eq('id', payment.userId);
            
            // Add transaction record
            await supabase
                .from('transactions')
                .insert([{
                    id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    user_id: payment.userId,
                    amount: payment.amount,
                    type: 'credit',
                    description: `Wallet funding - ${payment.referenceCode}`,
                    status: 'completed',
                    created_at: new Date().toISOString()
                }]);
        }
    }
    
    return true;
}

// Render functions (similar to before but use allPayments)
function renderPendingPayments() {
    const container = document.getElementById('pendingList');
    const pending = allPayments.filter(p => p.status === 'pending');
    
    updateStats();
    
    if (pending.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-check-circle"></i>
                <h3>No pending payments</h3>
                <p>All caught up! Check back later.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = pending.map(payment => `
        <div class="payment-card" data-id="${payment.id}">
            <div class="payment-header">
                <span class="payment-code">${escapeHtml(payment.referenceCode)}</span>
                <span class="payment-status pending">Pending</span>
            </div>
            <div class="payment-details">
                <div class="payment-detail"><strong>User:</strong> ${escapeHtml(payment.userName)}</div>
                <div class="payment-detail"><strong>Email:</strong> ${escapeHtml(payment.userEmail)}</div>
                <div class="payment-detail"><strong>Amount:</strong> ₦${payment.amount.toLocaleString()}</div>
                <div class="payment-detail"><strong>Bank:</strong> ${payment.bank}</div>
                <div class="payment-detail"><strong>Submitted:</strong> ${new Date(payment.submittedAt).toLocaleString()}</div>
            </div>
            <div class="payment-actions">
                <button class="btn-approve" onclick="window.openApproveModal('${payment.id}')">✓ Verify & Approve</button>
                <button class="btn-reject" onclick="window.openRejectModal('${payment.id}')">✗ Reject</button>
            </div>
        </div>
    `).join('');
}

// Similar renderApprovedPayments and renderRejectedPayments functions...

// Approve payment
async function approvePayment() {
    const narrationCode = document.getElementById('narrationCode').value.trim();
    const receivedAmount = parseInt(document.getElementById('receivedAmount').value);
    const adminNotes = document.getElementById('adminNotes').value;
    
    const payment = allPayments.find(p => p.id === currentPaymentId);
    
    if (!payment) {
        showToast('Payment not found', 'error');
        return;
    }
    
    if (narrationCode !== payment.referenceCode) {
        showToast(`Code mismatch! Expected: ${payment.referenceCode}`, 'error');
        return;
    }
    
    if (receivedAmount !== payment.amount) {
        showToast(`Amount mismatch! Expected: ₦${payment.amount.toLocaleString()}`, 'error');
        return;
    }
    
    try {
        await updatePaymentStatus(currentPaymentId, 'approved', adminNotes, narrationCode, receivedAmount);
        await loadPayments();
        renderPendingPayments();
        renderApprovedPayments();
        renderRejectedPayments();
        closeModal();
        showToast(`✅ Payment approved! ₦${payment.amount.toLocaleString()} added to ${payment.userName}'s wallet`, 'success');
    } catch (error) {
        showToast('Error approving payment', 'error');
    }
}

// Setup real-time subscription
async function setupRealtimeSubscription() {
    if (paymentSubscription) {
        paymentSubscription.unsubscribe();
    }
    
    paymentSubscription = subscribeToAllPayments((payload) => {
        // Reload payments when any change occurs
        loadPayments().then(() => {
            if (currentTab === 'pending') renderPendingPayments();
            if (currentTab === 'approved') renderApprovedPayments();
            if (currentTab === 'rejected') renderRejectedPayments();
            updateStats();
        });
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    const isAdmin = await checkAdminAccess();
    if (!isAdmin) return;
    
    await loadPayments();
    updateStats();
    renderPendingPayments();
    renderApprovedPayments();
    renderRejectedPayments();
    setupRealtimeSubscription();
    
    // Rest of initialization...
});
    
    // Tab switching
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
    
    // Search
    const searchInput = document.getElementById('searchPending');
    if (searchInput) {
        searchInput.addEventListener('input', filterPendingPayments);
    }
    
    const searchCodeBtn = document.getElementById('searchCodeBtn');
    if (searchCodeBtn) {
        searchCodeBtn.addEventListener('click', searchByCode);
    }
    
    const searchCodeInput = document.getElementById('searchCodeInput');
    if (searchCodeInput) {
        searchCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchByCode();
        });
    }
    
    // Modal buttons
    const actionBtn = document.getElementById('actionBtn');
    if (actionBtn) {
        actionBtn.addEventListener('click', () => {
            if (currentAction === 'approve') {
                approvePayment();
            } else {
                rejectPayment();
            }
        });
    }
    
    const cancelBtn = document.getElementById('cancelModalBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
    }
    
    const closeBtn = document.getElementById('closeModalBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    // Close modal on outside click
    window.onclick = (e) => {
        const modal = document.getElementById('approvalModal');
        if (e.target === modal) closeModal();
    };
    
    // Mobile sidebar toggle
    const sidebar = document.querySelector('.admin-sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    // Add mobile menu button to top bar
    const topbar = document.querySelector('.admin-topbar');
    if (topbar && window.innerWidth <= 768) {
        const menuBtn = document.createElement('button');
        menuBtn.innerHTML = '<i class="fas fa-bars"></i>';
        menuBtn.style.cssText = 'background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--text-primary);';
        menuBtn.onclick = () => {
            sidebar.classList.toggle('mobile-open');
            overlay.classList.toggle('active');
        };
        topbar.insertBefore(menuBtn, topbar.firstChild);
    }
    
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
        });
    }
});

// Make functions global
window.approvePayment = approvePayment;
window.rejectPayment = rejectPayment;
window.closeModal = closeModal;
window.showToast = showToast;
window.switchTab = switchTab;
window.openApproveModal = openApproveModal;
window.openRejectModal = openRejectModal;
