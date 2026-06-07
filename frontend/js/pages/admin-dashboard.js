// ============================================
// ADMIN SECRETARY DASHBOARD
// Payment Verification System
// ============================================

let allPayments = [];
let currentTab = 'pending';

// Load payments from localStorage (will connect to backend later)
function loadPayments() {
    const payments = JSON.parse(localStorage.getItem('glimu_pending_payments') || '[]');
    allPayments = payments;
    return payments;
}

// Save payments
function savePayments() {
    localStorage.setItem('glimu_pending_payments', JSON.stringify(allPayments));
}

// Render pending payments
function renderPendingPayments() {
    const container = document.getElementById('pendingList');
    const pending = allPayments.filter(p => p.status === 'pending');
    
    document.getElementById('pendingCount').textContent = pending.length;
    document.getElementById('totalPending').textContent = pending.length;
    document.getElementById('totalApproved').textContent = allPayments.filter(p => p.status === 'approved').length;
    
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
                <span class="payment-code">${payment.referenceCode}</span>
                <span class="payment-status pending">Pending</span>
            </div>
            <div class="payment-details">
                <div class="payment-detail"><strong>User:</strong> ${payment.userName}</div>
                <div class="payment-detail"><strong>Email:</strong> ${payment.userEmail}</div>
                <div class="payment-detail"><strong>Amount:</strong> ₦${payment.amount.toLocaleString()}</div>
                <div class="payment-detail"><strong>Bank:</strong> ${payment.bank}</div>
                <div class="payment-detail"><strong>Submitted:</strong> ${new Date(payment.submittedAt).toLocaleString()}</div>
            </div>
            <div class="payment-actions">
                <button class="btn-approve" onclick="openApprovalModal('${payment.id}')">Verify & Approve</button>
                <button class="btn-reject" onclick="rejectPayment('${payment.id}')">Reject</button>
            </div>
        </div>
    `).join('');
}

// Render approved payments
function renderApprovedPayments() {
    const container = document.getElementById('approvedList');
    const approved = allPayments.filter(p => p.status === 'approved');
    
    if (approved.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-history"></i>
                <h3>No approved payments yet</h3>
            </div>
        `;
        return;
    }
    
    container.innerHTML = approved.map(payment => `
        <div class="payment-card">
            <div class="payment-header">
                <span class="payment-code">${payment.referenceCode}</span>
                <span class="payment-status approved">Approved</span>
            </div>
            <div class="payment-details">
                <div class="payment-detail"><strong>User:</strong> ${payment.userName}</div>
                <div class="payment-detail"><strong>Amount:</strong> ₦${payment.amount.toLocaleString()}</div>
                <div class="payment-detail"><strong>Approved:</strong> ${payment.approvedAt ? new Date(payment.approvedAt).toLocaleString() : 'N/A'}</div>
                ${payment.adminNotes ? `<div class="payment-detail"><strong>Notes:</strong> ${payment.adminNotes}</div>` : ''}
            </div>
        </div>
    `).join('');
}

// Open approval modal
let currentPaymentId = null;

window.openApprovalModal = function(paymentId) {
    currentPaymentId = paymentId;
    const payment = allPayments.find(p => p.id === paymentId);
    
    if (!payment) return;
    
    const modal = document.getElementById('approvalModal');
    const modalInfo
