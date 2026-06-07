// Wallet Module - Supabase Integration
import { 
    supabase, 
    getCurrentUser, 
    getUserProfile, 
    updateWalletBalance,
    createPaymentRequest,
    getUserPayments,
    getUserTransactions,
    addTransaction,
    subscribeToUserPayments
} from './supabase.js';
import { showToast } from './toast.js';

// Generate unique reference code
export function generateReferenceCode() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `GLM-${timestamp}-${random}`;
}

// Fetch wallet balance from Supabase
export async function fetchWallet() {
    const profile = await getUserProfile();
    if (!profile) return null;
    
    const transactions = await getUserTransactions();
    
    return {
        balance: profile.wallet_balance || 25000,
        transactions: transactions
    };
}

// Submit payment request
export async function submitPaymentRequest(amount, bank) {
    const user = await getCurrentUser();
    if (!user) {
        showToast('Please login first', 'error');
        return false;
    }
    
    if (!amount || amount < 100) {
        showToast('Amount must be at least ₦100', 'error');
        return false;
    }
    
    const referenceCode = generateReferenceCode();
    
    const result = await createPaymentRequest(amount, bank, referenceCode);
    
    if (result.success) {
        showToast(`Payment request submitted! Use code: ${referenceCode} as narration`, 'success');
        return referenceCode;
    } else {
        showToast(result.error || 'Failed to submit payment request', 'error');
        return false;
    }
}

// Fetch user's pending requests
export async function fetchPendingRequests() {
    const payments = await getUserPayments();
    return payments;
}

// Display wallet balance
export async function displayWalletBalance(elementId = 'walletBalance') {
    const wallet = await fetchWallet();
    const element = document.getElementById(elementId);
    
    if (element && wallet) {
        element.textContent = `₦${wallet.balance.toLocaleString()}`;
    }
}

// Display transactions
export async function displayTransactions(containerId = 'transactionList') {
    const transactions = await getUserTransactions();
    const container = document.getElementById(containerId);
    
    if (container) {
        if (!transactions || transactions.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px;">No transactions yet</div>';
            return;
        }
        
        container.innerHTML = transactions.map(t => `
            <div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid var(--border-color);">
                <div>
                    <div style="font-weight:600;">${t.description}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${new Date(t.created_at).toLocaleString()}</div>
                </div>
                <div style="color:${t.type === 'credit' ? '#10b981' : '#ef4444'}">
                    ${t.type === 'credit' ? '+' : '-'}₦${t.amount.toLocaleString()}
                </div>
            </div>
        `).join('');
    }
}

// Setup real-time payment status listener
export function setupPaymentListener(callback) {
    return subscribeToUserPayments((payload) => {
        if (payload.new && payload.new.status === 'approved') {
            showToast(`Your payment of ₦${payload.new.amount.toLocaleString()} has been approved!`, 'success');
            if (callback) callback(payload.new);
        }
        if (payload.new && payload.new.status === 'rejected') {
            showToast(`Your payment request was rejected: ${payload.new.admin_notes || 'No reason provided'}`, 'error');
        }
    });
}
