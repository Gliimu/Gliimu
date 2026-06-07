// Wallet Module - Handles wallet balance, transactions, payment requests

// Get current user from localStorage
function getCurrentUser() {
  const user = localStorage.getItem('glimu_user');
  return user ? JSON.parse(user) : null;
}

// Generate unique reference code
export function generateReferenceCode() {
  const user = getCurrentUser();
  const userId = user?.id || 'guest';
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `GLM-${userId}-${timestamp}-${random}`;
}

// Fetch wallet balance
export async function fetchWallet() {
  const user = getCurrentUser();
  if (!user) return null;
  
  try {
    // Get from localStorage first
    let balance = localStorage.getItem('glimu_wallet');
    if (!balance) {
      balance = '25000';
      localStorage.setItem('glimu_wallet', balance);
    }
    
    // Get transactions
    let transactions = localStorage.getItem('glimu_transactions');
    if (!transactions) {
      transactions = JSON.stringify([
        { id: 1, amount: 25000, type: 'credit', date: new Date().toISOString(), status: 'approved', description: 'Initial wallet funding' }
      ]);
      localStorage.setItem('glimu_transactions', transactions);
    }
    
    return {
      balance: parseInt(balance),
      transactions: JSON.parse(transactions)
    };
  } catch (error) {
    console.error('Fetch wallet error:', error);
    return null;
  }
}

// Save transaction
export async function saveTransaction(transaction) {
  const wallet = await fetchWallet();
  if (wallet) {
    const transactions = wallet.transactions || [];
    transactions.unshift({
      id: Date.now(),
      ...transaction,
      date: new Date().toISOString()
    });
    localStorage.setItem('glimu_transactions', JSON.stringify(transactions));
  }
}

// Update wallet balance
export async function updateWalletBalance(newBalance) {
  localStorage.setItem('glimu_wallet', newBalance.toString());
  return true;
}

// Submit payment request
export async function submitPaymentRequest(amount, bank) {
  const user = getCurrentUser();
  if (!user) {
    showToast('Please login first', 'error');
    return false;
  }
  
  if (!amount || amount < 100) {
    showToast('Amount must be at least ₦100', 'error');
    return false;
  }
  
  // Generate unique reference code
  const referenceCode = generateReferenceCode();
  
  // Create payment request
  const paymentRequest = {
    id: `pay_${Date.now()}`,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    amount: amount,
    bank: bank,
    referenceCode: referenceCode,
    status: 'pending',
    submittedAt: new Date().toISOString(),
    approvedAt: null,
    adminNotes: null
  };
  
  try {
    // Store in localStorage (will sync with backend later)
    let pendingRequests = JSON.parse(localStorage.getItem('glimu_pending_payments') || '[]');
    pendingRequests.push(paymentRequest);
    localStorage.setItem('glimu_pending_payments', JSON.stringify(pendingRequests));
    
    // Also try to save to backend JSON if server is running
    try {
      const response = await fetch('/api/payments/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentRequest)
      });
      if (!response.ok) console.log('Backend not available, saved locally');
    } catch (e) {
      console.log('Backend not available, saved locally');
    }
    
    showToast(`Payment request submitted! Use code: ${referenceCode} as narration`, 'success');
    return true;
  } catch (error) {
    console.error('Submit payment error:', error);
    showToast('Failed to submit payment request', 'error');
    return false;
  }
}

// Fetch user's pending payment requests
export async function fetchPendingRequests() {
  const user = getCurrentUser();
  if (!user) return [];
  
  try {
    let pendingRequests = JSON.parse(localStorage.getItem('glimu_pending_payments') || '[]');
    const userRequests = pendingRequests.filter(r => r.userId === user.id);
    
    // Try to fetch from backend
    try {
      const response = await fetch(`/api/payments/user/${user.id}`);
      if (response.ok) {
        const backendRequests = await response.json();
        return backendRequests;
      }
    } catch (e) {
      // Use localStorage data
    }
    
    return userRequests;
  } catch (error) {
    console.error('Fetch pending requests error:', error);
    return [];
  }
}

// Check if payment was approved (called periodically)
export async function checkPaymentStatus(referenceCode) {
  try {
    const pendingRequests = JSON.parse(localStorage.getItem('glimu_pending_payments') || '[]');
    const request = pendingRequests.find(r => r.referenceCode === referenceCode);
    
    if (request && request.status === 'approved') {
      // Update wallet
      const wallet = await fetchWallet();
      if (wallet) {
        const newBalance = wallet.balance + request.amount;
        await updateWalletBalance(newBalance);
        await saveTransaction({
          amount: request.amount,
          type: 'credit',
          status: 'approved',
          description: `Wallet funding - ${request.referenceCode}`
        });
      }
      return { approved: true, amount: request.amount };
    }
    
    return { approved: false };
  } catch (error) {
    console.error('Check payment status error:', error);
    return { approved: false };
  }
}

// Display wallet balance on page
export async function displayWalletBalance(elementId = 'walletBalance') {
  const wallet = await fetchWallet();
  const element = document.getElementById(elementId);
  
  if (element && wallet) {
    element.textContent = `₦${wallet.balance.toLocaleString()}`;
  }
}

// Display transactions on page
export async function displayTransactions(containerId = 'transactionList') {
  const wallet = await fetchWallet();
  const container = document.getElementById(containerId);
  
  if (container && wallet && wallet.transactions) {
    if (wallet.transactions.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:20px;">No transactions yet</div>';
      return;
    }
    
    container.innerHTML = wallet.transactions.map(t => `
      <div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid var(--border-color);">
        <div>
          <div style="font-weight:600;">${t.description}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${new Date(t.date).toLocaleString()}</div>
        </div>
        <div style="color:${t.type === 'credit' ? '#10b981' : '#ef4444'}">
          ${t.type === 'credit' ? '+' : '-'}₦${t.amount.toLocaleString()}
        </div>
      </div>
    `).join('');
  }
}

// Toast helper (will be replaced by actual import when available)
function showToast(message, type) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  } else {
    alert(message);
  }
}
