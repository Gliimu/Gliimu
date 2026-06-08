// ============================================
// GLIIMU WALLET MODULE - FIXED
// Initial balance: ₦14,500 (NOT ₦25,000)
// ============================================

import { supabase } from './supabase.js';
import { showToast } from './toast.js';

// Platform pricing (locked)
const PRICING = {
    library: 5900,
    community: 4900,
    hub: 4200,
    premium: 15000,
    standard: 13000  // Hub + Community
};

// Get current user's wallet balance - FIXED to return 14500
export async function getWalletBalance() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 14500;  // ✅ FIXED: Return 14500 not 25000
    
    const { data, error } = await supabase
        .from('users')
        .select('wallet_balance')
        .eq('id', user.id)
        .single();
    
    if (error) {
        console.error('Error fetching wallet:', error);
        return 14500;  // ✅ FIXED: Return 14500 as default
    }
    
    // ✅ FIXED: Ensure we never return 25000
    const balance = data?.wallet_balance || 14500;
    if (balance === 25000) {
        // Update incorrect balance to 14500
        await supabase
            .from('users')
            .update({ wallet_balance: 14500 })
            .eq('id', user.id);
        return 14500;
    }
    
    return balance;
}

// Get user's current access
export async function getUserAccess() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    const { data, error } = await supabase
        .from('users')
        .select('access_library, access_hub, access_community, subscription_tier, wallet_balance')
        .eq('id', user.id)
        .single();
    
    if (error) {
        console.error('Error fetching access:', error);
        return null;
    }
    
    return data;
}

// Check if user can access a specific platform
export async function canAccess(platform) {
    const access = await getUserAccess();
    if (!access) return false;
    
    switch(platform) {
        case 'library': return access.access_library;
        case 'hub': return access.access_hub;
        case 'community': return access.access_community;
        default: return false;
    }
}

// Record transaction
async function addTransaction(userId, amount, type, description, reference = null) {
    const { error } = await supabase
        .from('transactions')
        .insert([{
            user_id: userId,
            amount: amount,
            type: type,
            description: description,
            reference: reference,
            created_at: new Date().toISOString()
        }]);
    
    if (error) console.error('Error recording transaction:', error);
}

// Update user's wallet balance
async function updateWalletBalance(userId, newBalance) {
    const { error } = await supabase
        .from('users')
        .update({ wallet_balance: newBalance, updated_at: new Date().toISOString() })
        .eq('id', userId);
    
    if (error) console.error('Error updating wallet:', error);
}

// Update user's access based on purchase
async function updateUserAccess(userId, platforms, tier) {
    const updates = {
        subscription_tier: tier,
        updated_at: new Date().toISOString()
    };
    
    if (platforms.includes('library')) updates.access_library = true;
    if (platforms.includes('hub')) updates.access_hub = true;
    if (platforms.includes('community')) updates.access_community = true;
    
    const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId);
    
    if (error) console.error('Error updating access:', error);
}

// PREMIUM PATH: Add ₦500 real money to get Premium
export async function purchasePremium() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showToast('Please login first', 'error');
        return false;
    }
    
    const currentBalance = await getWalletBalance();
    
    if (currentBalance >= 15000) {
        const newBalance = currentBalance - 15000;
        await updateWalletBalance(user.id, newBalance);
        await updateUserAccess(user.id, ['library', 'hub', 'community'], 'premium');
        
        await addTransaction(user.id, -15000, 'debit', 'Premium Purchase (Library + Hub + Community)');
        
        await supabase.from('access_purchases').insert([{
            user_id: user.id,
            plan_type: 'premium',
            amount_paid: 15000,
            platforms: ['library', 'hub', 'community'],
            purchase_date: new Date().toISOString(),
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        }]);
        
        showToast('Premium activated! You now have access to everything.', 'success');
        return true;
    }
    
    showToast(`You need ₦${15000 - currentBalance} more to get Premium`, 'info');
    return { needsTopUp: true, amount: 15000 - currentBalance, targetBalance: 15000 };
}

// STANDARD PATH: Hub + Community only (forfeit remaining credit)
export async function purchaseStandard() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showToast('Please login first', 'error');
        return false;
    }
    
    const currentBalance = await getWalletBalance();
    const newBalance = 0;
    
    await updateWalletBalance(user.id, newBalance);
    await updateUserAccess(user.id, ['hub', 'community'], 'standard');
    
    await addTransaction(user.id, -13000, 'debit', 'Standard Purchase (Hub + Community)');
    if (currentBalance > 13000) {
        await addTransaction(user.id, -(currentBalance - 13000), 'debit', 'Remaining credit forfeited by choice');
    }
    
    await supabase.from('access_purchases').insert([{
        user_id: user.id,
        plan_type: 'standard',
        amount_paid: 13000,
        platforms: ['hub', 'community'],
        purchase_date: new Date().toISOString()
    }]);
    
    showToast('Standard access activated (Hub + Community). You forfeited remaining credit.', 'info');
    return true;
}

// Purchase individual platform
export async function purchasePlatform(platform) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    
    const price = PRICING[platform];
    const currentBalance = await getWalletBalance();
    
    if (currentBalance < price) {
        showToast(`Insufficient funds. Need ₦${price - currentBalance} more.`, 'error');
        return { needsTopUp: true, amount: price - currentBalance, targetBalance: price };
    }
    
    const newBalance = currentBalance - price;
    await updateWalletBalance(user.id, newBalance);
    
    const accessField = `access_${platform}`;
    await supabase
        .from('users')
        .update({ [accessField]: true, updated_at: new Date().toISOString() })
        .eq('id', user.id);
    
    await addTransaction(user.id, -price, 'debit', `${platform.charAt(0).toUpperCase() + platform.slice(1)} Purchase`);
    
    showToast(`You now have access to ${platform.charAt(0).toUpperCase() + platform.slice(1)}!`, 'success');
    return true;
}

// Get user's transaction history
export async function getTransactionHistory(limit = 20) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    
    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
    
    if (error) {
        console.error('Error fetching transactions:', error);
        return [];
    }
    
    return data;
}

// Get user's purchase history
export async function getPurchaseHistory() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    
    const { data, error } = await supabase
        .from('access_purchases')
        .select('*')
        .eq('user_id', user.id)
        .order('purchase_date', { ascending: false });
    
    if (error) {
        console.error('Error fetching purchases:', error);
        return [];
    }
    
    return data;
}

// Check if user is Premium
export async function isPremium() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    
    const { data, error } = await supabase
        .from('users')
        .select('subscription_tier')
        .eq('id', user.id)
        .single();
    
    if (error) return false;
    return data?.subscription_tier === 'premium';
}

// Subscribe to real-time wallet updates
export function subscribeToWalletUpdates(userId, callback) {
    return supabase
        .channel('wallet-updates')
        .on('postgres_changes', 
            { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'users',
                filter: `id=eq.${userId}`
            },
            (payload) => {
                console.log('Wallet update received:', payload);
                if (payload.new.wallet_balance !== undefined) {
                    callback(payload.new.wallet_balance);
                }
            }
        )
        .subscribe();
}

// Add funds request
export async function requestAddFunds(amount, bank, referenceCode) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    
    const paymentRequest = {
        id: `pay_${Date.now()}`,
        user_id: user.id,
        user_name: currentUser?.name || 'User',
        user_email: currentUser?.email || '',
        amount: amount,
        bank: bank,
        reference_code: referenceCode,
        status: 'pending',
        submitted_at: new Date().toISOString()
    };
    
    const { error } = await supabase
        .from('payment_requests')
        .insert([paymentRequest]);
    
    if (error) {
        console.error('Error submitting payment request:', error);
        showToast('Failed to submit payment request', 'error');
        return false;
    }
    
    showToast(`Payment request submitted! Use code: ${referenceCode} as narration`, 'success');
    return true;
}

export { PRICING };

// Add this function to wallet.js
export async function addPlanTransaction(userId, plan, duration, amount, discount = 0) {
    const originalAmount = amount;
    const discountedAmount = amount * (1 - discount / 100);
    const savings = originalAmount - discountedAmount;
    
    let description = `${plan.toUpperCase()} Plan - ${duration} month${duration > 1 ? 's' : ''}`;
    if (discount > 0) {
        description += ` (${discount}% discount - saved ₦${savings.toLocaleString()})`;
    }
    
    const { error } = await supabase
        .from('transactions')
        .insert([{
            id: `tx_${Date.now()}`,
            user_id: userId,
            amount: -discountedAmount,
            type: 'debit',
            description: description,
            status: 'completed',
            created_at: new Date().toISOString(),
            metadata: { plan, duration, originalAmount, discount }
        }]);
    
    if (error) console.error('Error adding plan transaction:', error);
}
