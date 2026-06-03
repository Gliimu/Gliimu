// Wallet Module - Handles wallet balance, transactions, top-up

import { showToast } from './toast.js';

// Get current user from localStorage
function getCurrentUser() {
  const user = localStorage.getItem('gliimu_user');
  return user ? JSON.parse(user) : null;
}

// Fetch wallet balance and transactions
export async function fetchWallet() {
  const user = getCurrentUser();
  if (!user) return null;
  
  try {
    // Mock data for now (replace with API call when backend is ready)
    const mockWallet = {
      balance: 25000,
      transactions: [
        { id: 1, amount: 25000, type: 'credit', date: '2025-03-01', status: 'approved', description: 'Tuition Payment' },
        { id: 2, amount: 5000, type: 'debit', date: '2025-03-05', status: 'approved', description: 'Book Purchase' }
      ]
    };
    
    return mockWallet;
  } catch (error) {
    console.error('Fetch wallet error:', error);
    return null;
  }
}

// Request wallet top-up
export async function requestTopUp(amount, receiptFile) {
  const user = getCurrentUser();
  if (!user) {
    showToast('Please login first', 'error');
    return false;
  }
  
  if (!amount || amount < 100) {
    showToast('Amount must be at least ₦100', 'error');
    return false;
  }
  
  if (!receiptFile) {
    showToast('Please upload receipt', 'error');
    return false;
  }
  
  try {
    // Mock success for now
    showToast(`Top-up request of ₦${amount} submitted for approval`, 'success');
    return true;
  } catch (error) {
    console.error('Top-up error:', error);
    showToast('Failed to submit request', 'error');
    return false;
  }
}

// Withdraw funds
export async function withdrawFunds(amount) {
  const user = getCurrentUser();
  if (!user) {
    showToast('Please login first', 'error');
    return false;
  }
  
  if (!amount || amount < 1000) {
    showToast('Minimum withdrawal is ₦1,000', 'error');
    return false;
  }
  
  try {
    // Mock success
    showToast(`Withdrawal request of ₦${amount} submitted`, 'success');
    return true;
  } catch (error) {
    console.error('Withdrawal error:', error);
    showToast('Failed to submit withdrawal', 'error');
    return false;
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
          <div style="font-size:0.75rem; color:var(--text-muted);">${t.date}</div>
        </div>
        <div style="color:${t.type === 'credit' ? 'green' : 'red'}">
          ${t.type === 'credit' ? '+' : '-'}₦${t.amount.toLocaleString()}
        </div>
      </div>
    `).join('');
  }
}