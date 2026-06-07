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
    const modalInfo = document.getElementById('modalPaymentInfo');
    
    modalInfo.innerHTML = `
        <div class="payment-card" style="margin-bottom: 1rem;">
            <div class="payment-details">
                <div class="payment-detail"><strong>User:</strong> ${payment.userName}</div>
                <div class="payment-detail"><strong>Expected Amount:</strong> ₦${payment.amount.toLocaleString()}</div>
                <div class="payment-detail"><strong>Reference Code:</strong> <code>${payment.referenceCode}</code></div>
                <div class="payment-detail"><strong>Bank:</strong> ${payment.bank}</div>
            </div>
        </div>
    `;
    
    document.getElementById('narrationCode').value = '';
    document.getElementById('receivedAmount').value = '';
    document.getElementById('adminNotes').value = '';
    
    modal.classList.add('active');
}

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
    
    // Check if code matches
    if (narrationCode !== payment.referenceCode) {
        showToast(`Code mismatch! Expected: ${payment.referenceCode}`, 'error');
        return;
    }
    
    // Check if amount matches (allow small difference for charges)
    const amountDiff = Math.abs(receivedAmount - payment.amount);
    if (amountDiff > 100) {
        showToast(`Amount mismatch! Expected: ₦${payment.amount}`, 'error');
        return;
    }
    
    // Approve payment
    payment.status = 'approved';
    payment.approvedAt = new Date().toISOString();
    payment.adminNotes = adminNotes;
    
    // Update user's wallet
    updateUserWallet(payment.userId, payment.amount);
    
    savePayments();
    renderPendingPayments();
    renderApprovedPayments();
    
    closeModal();
    showToast(`Payment approved! ₦${payment.amount.toLocaleString()} added to ${payment.userName}'s wallet`, 'success');
}

// Reject payment
window.rejectPayment = function(paymentId) {
    if (confirm('Are you sure you want to reject this payment? The user will be notified.')) {
        const payment = allPayments.find(p => p.id === paymentId);
        if (payment) {
            payment.status = 'rejected';
            payment.adminNotes = 'Payment rejected by admin';
            savePayments();
            renderPendingPayments();
            showToast(`Payment request from ${payment.userName} rejected`, 'info');
        }
    }
}

// Update user's wallet
function updateUserWallet(userId, amount) {
    // Get all users' wallets from localStorage
    let wallets = JSON.parse(localStorage.getItem('glimu_user_wallets') || '{}');
    let currentBalance = wallets[userId] || 25000;
    wallets[userId] = currentBalance + amount;
    localStorage.setItem('glimu_user_wallets', JSON.stringify(wallets));
    
    // Also update the current user's wallet if they're logged in
    const currentUser = JSON.parse(localStorage.getItem('glimu_user') || '{}');
    if (currentUser.id === userId) {
        let userWallet = parseInt(localStorage.getItem('glimu_wallet') || '25000');
        userWallet += amount;
        localStorage.setItem('glimu_wallet', userWallet);
        
        // Add transaction
        let transactions = JSON.parse(localStorage.getItem('glimu_transactions') || '[]');
        transactions.unshift({
            id: Date.now(),
            amount: amount,
            type: 'credit',
            date: new Date().toISOString(),
            status: 'approved',
            description: `Wallet funding - Payment approved`
        });
        localStorage.setItem('glimu_transactions', JSON.stringify(transactions));
    }
}

// Search by code
function searchByCode() {
    const code = document.getElementById('searchCodeInput').value.trim();
    const resultDiv = document.getElementById('searchResult');
    
    if (!code) {
        showToast('Enter a reference code to search', 'error');
        return;
    }
    
    const payment = allPayments.find(p => p.referenceCode === code);
    
    if (!payment) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>Payment not found</h3>
                <p>No payment with code: ${code}</p>
            </div>
        `;
        return;
    }
    
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `
        <div class="payment-card">
            <div class="payment-header">
                <span class="payment-code">${payment.referenceCode}</span>
                <span class="payment-status ${payment.status}">${payment.status}</span>
            </div>
            <div class="payment-details">
                <div class="payment-detail"><strong>User:</strong> ${payment.userName}</div>
                <div class="payment-detail"><strong>Email:</strong> ${payment.userEmail}</div>
                <div class="payment-detail"><strong>Amount:</strong> ₦${payment.amount.toLocaleString()}</div>
                <div class="payment-detail"><strong>Bank:</strong> ${payment.bank}</div>
                <div class="payment-detail"><strong>Submitted:</strong> ${new Date(payment.submittedAt).toLocaleString()}</div>
                ${payment.status === 'approved' ? `<div class="payment-detail"><strong>Approved:</strong> ${new Date(payment.approvedAt).toLocaleString()}</div>` : ''}
            </div>
            ${payment.status === 'pending' ? `
                <div class="payment-actions" style="margin-top: 1rem;">
                    <button class="btn-approve" onclick="openApprovalModal('${payment.id}')">Verify & Approve</button>
                </div>
            ` : ''}
        </div>
    `;
}

// Filter pending payments by search
function filterPendingPayments() {
    const searchTerm = document.getElementById('searchPending').value.toLowerCase();
    const pending = allPayments.filter(p => p.status === 'pending');
    const filtered = pending.filter(p => 
        p.referenceCode.toLowerCase().includes(searchTerm) ||
        p.userName.toLowerCase().includes(searchTerm) ||
        p.userEmail.toLowerCase().includes(searchTerm)
    );
    
    const container = document.getElementById('pendingList');
    
    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><h3>No matching payments</h3></div>`;
        return;
    }
    
    container.innerHTML = filtered.map(payment => `
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

// Tab switching
function switchTab(tabId) {
    currentTab = tabId;
    
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
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
    
    if (tabId === 'pending') renderPendingPayments();
    if (tabId === 'approved') renderApprovedPayments();
}

// Modal functions
function closeModal() {
    const modal = document.getElementById('approvalModal');
    modal.classList.remove('active');
}

// Toast notification
function showToast(message, type) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadPayments();
    renderPendingPayments();
    renderApprovedPayments();
    
    // Tab switching
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
    
    // Search
    document.getElementById('searchPending')?.addEventListener('input', filterPendingPayments);
    document.getElementById('searchCodeBtn')?.addEventListener('click', searchByCode);
    document.getElementById('searchCodeInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchByCode();
    });
    
    // Modal buttons
    document.getElementById('approveBtn')?.addEventListener('click', approvePayment);
    document.getElementById('rejectBtn')?.addEventListener('click', () => {
        if (currentPaymentId) rejectPayment(currentPaymentId);
        closeModal();
    });
    document.getElementById('closeModal')?.addEventListener('click', closeModal);
    
    // Close modal on outside click
    window.onclick = (e) => {
        const modal = document.getElementById('approvalModal');
        if (e.target === modal) closeModal();
    };
});

// Make functions global
window.approvePayment = approvePayment;
window.closeModal = closeModal;
window.showToast = showToast;
