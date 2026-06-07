// Wallet Module - Supabase Version
import { supabase, getCurrentUser, getUserProfile, subscribeToPayments } from './supabase.js';
import { showToast } from './toast.js';

// Generate unique reference code
export function generateReferenceCode() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `GLM-${timestamp}-${random}`;
}

// Fetch wallet balance from Supabase
export async function fetchWallet() {
    const user = await getCurrentUser();
    if (!user) return null;
    
    const profile = await getUserProfile();
    if (!profile) return null;
    
    // Fetch transactions
    const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
    
    if (txError) {
        console.error('Error fetching transactions:', txError);
    }
    
    return {
        balance: profile.wallet_balance || 25000,
        transactions: transactions || []
    };
}

// Submit payment request to Supabase
export async function submitPaymentRequest(amount, bank) {
    const user = await getCurrentUser();
    if (!user) {
        showToast('Please login first', 'error');
        return false;
    }
    
    const profile = await getUserProfile();
    if (!profile) return false;
    
    const referenceCode = generateReferenceCode();
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const payment = {
        id: paymentId,
        user_id: user.id,
        user_name: profile.name,
        user_email: user.email,
        amount: amount,
        bank: bank,
        reference_code: referenceCode,
        status: 'pending',
        submitted_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
        .from('payments')
        .insert([payment])
        .select();
    
    if (error) {
        console.error('Submit payment error:', error);
        showToast('Failed to submit payment request', 'error');
        return false;
    }
    
    showToast(`Payment request submitted! Use code: ${referenceCode} as narration`, 'success');
    return referenceCode;
}

// Fetch user's pending requests
export async function fetchPendingRequests() {
    const user = await getCurrentUser();
    if (!user) return [];
    
    const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false });
    
    if (error) {
        console.error('Fetch pending error:', error);
        return [];
    }
    
    // Transform to match expected format
    return data.map(p => ({
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
}

// Check payment status with real-time updates
export function subscribeToPaymentStatus(userId, callback) {
    return subscribeToPayments(userId, (payload) => {
        const payment = payload.new;
        if (payment && payment.status === 'approved') {
            callback(payment);
            // Refresh wallet after approval
            fetchWallet().then(wallet => {
                if (wallet) {
                    updateWalletDisplay(wallet.balance);
                }
            });
        }
    });
}

// Update wallet display
function updateWalletDisplay(balance) {
    const walletElement = document.getElementById('walletBalanceDisplay');
    if (walletElement) {
        walletElement.textContent = `₦${balance.toLocaleString()}`;
    }
}

// Save item to shelf
export async function saveToShelf(itemId, itemType, itemData) {
    const user = await getCurrentUser();
    if (!user) return false;
    
    const savedId = `saved_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const { error } = await supabase
        .from('saved_items')
        .insert([{
            id: savedId,
            user_id: user.id,
            item_id: itemId,
            item_type: itemType,
            item_data: itemData,
            saved_at: new Date().toISOString()
        }]);
    
    if (error) {
        console.error('Save to shelf error:', error);
        return false;
    }
    return true;
}

// Get saved items
export async function getSavedItems() {
    const user = await getCurrentUser();
    if (!user) return [];
    
    const { data, error } = await supabase
        .from('saved_items')
        .select('*')
        .eq('user_id', user.id)
        .order('saved_at', { ascending: false });
    
    if (error) {
        console.error('Get saved items error:', error);
        return [];
    }
    return data;
}

// Record recently viewed
export async function recordRecentlyViewed(itemId, itemType, itemData) {
    const user = await getCurrentUser();
    if (!user) return;
    
    // Delete old entry if exists
    await supabase
        .from('recently_viewed')
        .delete()
        .eq('user_id', user.id)
        .eq('item_id', itemId);
    
    // Insert new
    const viewedId = `view_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await supabase
        .from('recently_viewed')
        .insert([{
            id: viewedId,
            user_id: user.id,
            item_id: itemId,
            item_type: itemType,
            item_data: itemData,
            viewed_at: new Date().toISOString()
        }]);
    
    // Keep only last 20
    const { data } = await supabase
        .from('recently_viewed')
        .select('id')
        .eq('user_id', user.id)
        .order('viewed_at', { ascending: false });
    
    if (data && data.length > 20) {
        const toDelete = data.slice(20);
        for (const item of toDelete) {
            await supabase.from('recently_viewed').delete().eq('id', item.id);
        }
    }
}

// Get recently viewed
export async function getRecentlyViewed() {
    const user = await getCurrentUser();
    if (!user) return [];
    
    const { data, error } = await supabase
        .from('recently_viewed')
        .select('*')
        .eq('user_id', user.id)
        .order('viewed_at', { ascending: false })
        .limit(10);
    
    if (error) {
        console.error('Get recently viewed error:', error);
        return [];
    }
    return data;
}
