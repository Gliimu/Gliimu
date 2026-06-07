// ============================================
// ADMIN SECRETARY DASHBOARD
// Payment Verification System
// ============================================

let allPayments = [];
let currentTab = 'pending';
let currentPaymentId = null;
let currentAction = 'approve'; // 'approve' or 'reject'

// Load payments from localStorage
function loadPayments() {
    const payments = JSON.parse(localStorage.getItem('glimu_pending_payments') || '[]');
    allPayments = payments;
    return payments;
}

// Save payments
function savePayments() {
    localStorage.setItem('glimu_pending_payments', JSON.stringify(allPayments));
}

// Update stats counters
function updateStats() {
    const pending = allPayments.filter(p => p.status === 'pending').length;
    const approved = allPayments.filter(p => p.status === 'approved').length;
    const rejected = allPayments.filter(p => p.status === 'rejected').length;
    
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('approvedCount').textContent = approved;
    document.getElementById('rejectedCount').textContent = rejected;
    document.getElementById('totalPending').textContent = pending;
    document.getElementById('totalApproved').textContent = approved;
    document.getElementById('totalRejected').textContent = rejected;
}

// Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Render pending payments
function renderPendingPayments() {
    const container = document.getElementById('pendingList');
    const pending = allPayments.filter(p => p.status === 'pending');
    
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
                <button class="btn-approve" onclick="openApproveModal('${payment.id}')">✓ Verify & Approve</button>
                <button class="btn-reject" onclick="openRejectModal('${payment.id}')">✗ Reject</button>
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
                <span class="payment-code">${escapeHtml(payment.referenceCode)}</span>
                <span class="payment-status approved">Approved</span>
            </div>
            <div class="payment-details">
                <div class="payment-detail"><strong>User:</strong> ${escapeHtml(payment.userName)}</div>
                <div class="payment-detail"><strong>Email:</strong> ${escapeHtml(payment.userEmail)}</div>
                <div class="payment-detail"><strong>Amount:</strong> ₦${payment.amount.toLocaleString()}</div>
                <div class="payment-detail"><strong>Bank:</strong> ${payment.bank}</div>
                <div class="payment-detail"><strong>Approved:</strong> ${payment.approvedAt ? new Date(payment.approvedAt).toLocaleString() : 'N/A'}</div>
                ${payment.adminNotes ? `<div class="payment-detail"><strong>Notes:</strong> ${escapeHtml(payment.adminNotes)}</div>` : ''}
            </div>
        </div>
    `).join('');
}

// Render rejected payments
function renderRejectedPayments() {
    const container = document.getElementById('rejectedList');
    const rejected = allPayments.filter(p => p.status === 'rejected');
    
    if (rejected.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-times-circle"></i>
                <h3>No rejected payments</h3>
            </div>
        `;
        return;
    }
    
    container.innerHTML = rejected.map(payment => `
        <div class="payment-card">
            <div class="payment-header">
                <span class="payment-code">${escapeHtml(payment.referenceCode)}</span>
                <span class="payment-status rejected">Rejected</span>
            </div>
            <div class="payment-details">
                <div class="payment-detail"><strong>User:</strong> ${escapeHtml(payment.userName)}</div>
                <div class="payment-detail"><strong>Email:</strong> ${escapeHtml(payment.userEmail)}</div>
                <div class="payment-detail"><strong>Amount:</strong> ₦${payment.amount.toLocaleString()}</div>
                <div class="payment-detail"><strong>Bank:</strong> ${payment.bank}</div>
                <div class="payment-detail"><strong>Submitted:</strong> ${new Date(payment.submittedAt).toLocaleString()}</div>
                ${payment.adminNotes ? `<div class="payment-detail"><strong>Reason:</strong> ${escapeHtml(payment.adminNotes)}</div>` : ''}
            </div>
        </div>
    `).join('');
}

// Open approve modal
window.openApproveModal = function(paymentId) {
    currentPaymentId = paymentId;
    currentAction = 'approve';
    const payment = allPayments.find(p => p.id === paymentId);
    
    if (!payment) return;
    
    const modal = document.getElementById('approvalModal');
    const modalInfo = document.getElementById('modalPaymentInfo');
    
    document.getElementById('modalTitle').textContent = 'Verify & Approve Payment';
    document.getElementById('actionBtn').textContent = '✓ Approve Payment';
    document.getElementById('actionBtn').className = 'modal-btn modal-btn-primary';
    
    // Show code and amount fields for approval
    document.getElementById('narrationCodeGroup').style.display = 'block';
    document.getElementById('receivedAmountGroup').style.display = 'block';
    
    modalInfo.innerHTML = `
        <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
            <p><strong>User:</strong> ${escapeHtml(payment.userName)}</p>
            <p><strong>Expected Amount:</strong> ₦${payment.amount.toLocaleString()}</p>
            <p><strong>Reference Code:</strong> <code>${payment.referenceCode}</code></p>
            <p><strong>Bank:</strong> ${payment.bank}</p>
        </div>
    `;
    
    document.getElementById('narrationCode').value = '';
    document.getElementById('receivedAmount').value = '';
    document.getElementById('adminNotes').value = '';
    
    modal.classList.add('active');
};

// Open reject modal
window.openRejectModal = function(paymentId) {
    currentPaymentId = paymentId;
    currentAction = 'reject';
    const payment = allPayments.find(p => p.id === paymentId);
    
    if (!payment) return;
    
    const modal = document.getElementById('approvalModal');
    const modalInfo = document.getElementById('modalPaymentInfo');
    
    document.getElementById('modalTitle').textContent = 'Reject Payment';
    document.getElementById('actionBtn').textContent = '✗ Confirm Rejection';
    document.getElementById('actionBtn').className = 'modal-btn modal-btn-danger';
    
    // Hide code and amount fields for rejection
    document.getElementById('narrationCodeGroup').style.display = 'none';
    document.getElementById('receivedAmountGroup').style.display = 'none';
    
    modalInfo.innerHTML = `
        <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
            <p><strong>User:</strong> ${escapeHtml(payment.userName)}</p>
            <p><strong>Amount:</strong> ₦${payment.amount.toLocaleString()}</p>
            <p><strong>Reference Code:</strong> <code>${payment.referenceCode}</code></p>
        </div>
    `;
    
    document.getElementById('adminNotes').value = '';
    document.getElementById('adminNotes').placeholder = 'Reason for rejection...';
    
    modal.classList.add('active');
};

// Approve payment
function approvePayment() {
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
    
    // Check if amount matches
    if (receivedAmount !== payment.amount) {
        showToast(`Amount mismatch! Expected: ₦${payment.amount.toLocaleString()}`, 'error');
        return;
    }
    
    // Approve payment
    payment.status = 'approved';
    payment.approvedAt = new Date().toISOString();
    payment.adminNotes = adminNotes;
    
    // Update user's wallet
    updateUserWallet(payment.userId, payment.amount);
    
    savePayments();
    updateStats();
    renderPendingPayments();
    renderApprovedPayments();
    renderRejectedPayments();
    
    closeModal();
    showToast(`✅ Payment approved! ₦${payment.amount.toLocaleString()} added to ${payment.userName}'s wallet`, 'success');
}

// Reject payment
function rejectPayment() {
    const adminNotes = document.getElementById('adminNotes').value;
    
    const payment = allPayments.find(p => p.id === currentPaymentId);
    
    if (!payment) {
        showToast('Payment not found', 'error');
        return;
    }
    
    if (!adminNotes) {
        showToast('Please provide a reason for rejection', 'error');
        return;
    }
    
    // Reject payment
    payment.status = 'rejected';
    payment.adminNotes = adminNotes;
    
    savePayments();
    updateStats();
    renderPendingPayments();
    renderApprovedPayments();
    renderRejectedPayments();
    
    closeModal();
    showToast(`❌ Payment request from ${payment.userName} rejected`, 'info');
}

// Update user's wallet
function updateUserWallet(userId, amount) {
    // Check if user is the current logged-in user
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
    
    // Store in user wallets map
    let wallets = JSON.parse(localStorage.getItem('glimu_user_wallets') || '{}');
    let currentBalance = wallets[userId] || 25000;
    wallets[userId] = currentBalance + amount;
    localStorage.setItem('glimu_user_wallets', JSON.stringify(wallets));
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
                <span class="payment-code">${escapeHtml(payment.referenceCode)}</span>
                <span class="payment-status ${payment.status}">${payment.status}</span>
            </div>
            <div class="payment-details">
                <div class="payment-detail"><strong>User:</strong> ${escapeHtml(payment.userName)}</div>
                <div class="payment-detail"><strong>Email:</strong> ${escapeHtml(payment.userEmail)}</div>
                <div class="payment-detail"><strong>Amount:</strong> ₦${payment.amount.toLocaleString()}</div>
                <div class="payment-detail"><strong>Bank:</strong> ${payment.bank}</div>
                <div class="payment-detail"><strong>Submitted:</strong> ${new Date(payment.submittedAt).toLocaleString()}</div>
                ${payment.status === 'approved' ? `<div class="payment-detail"><strong>Approved:</strong> ${new Date(payment.approvedAt).toLocaleString()}</div>` : ''}
                ${payment.adminNotes ? `<div class="payment-detail"><strong>Notes:</strong> ${escapeHtml(payment.adminNotes)}</div>` : ''}
            </div>
            ${payment.status === 'pending' ? `
                <div class="payment-actions" style="margin-top: 1rem;">
                    <button class="btn-approve" onclick="openApproveModal('${payment.id}')">✓ Verify & Approve</button>
                    <button class="btn-reject" onclick="openRejectModal('${payment.id}')">✗ Reject</button>
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
        <div class="payment-card">
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
                <button class="btn-approve" onclick="openApproveModal('${payment.id}')">✓ Verify & Approve</button>
                <button class="btn-reject" onclick="openRejectModal('${payment.id}')">✗ Reject</button>
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
    if (tabId === 'rejected') renderRejectedPayments();
}

// Modal functions
function closeModal() {
    const modal = document.getElementById('approvalModal');
    modal.classList.remove('active');
    currentPaymentId = null;
}

// Toast notification
function showToast(message, type) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position: fixed; top: 80px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px;';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.cssText = `
        background: var(--bg-glass, rgba(0,0,0,0.8));
        backdrop-filter: blur(12px);
        padding: 12px 20px;
        border-radius: 8px;
        border-left: 4px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#fbb040'};
        box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 0.9rem;
        color: white;
        animation: slideInRight 0.3s ease;
    `;
    
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadPayments();
    updateStats();
    renderPendingPayments();
    renderApprovedPayments();
    renderRejectedPayments();
    
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
