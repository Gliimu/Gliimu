// ============================================
// GLIIMU WALLET MODULE
// Handles all wallet operations, purchases, bonuses
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

// Get current user's wallet balance
export async function getWalletBalance() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;
    
    const { data, error } = await supabase
        .from('users')
        .select('wallet_balance')
        .eq('id', user.id)
        .single();
    
    if (error) {
        console.error('Error fetching wallet:', error);
        return 0;
    }
    
    return data?.wallet_balance || 0;
}

// Get user's current access
export async function getUserAccess() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    const { data, error } = await supabase
        .from('users')
        .select('access_library, access_hub, access_community, subscription_tier')
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
        .update({ wallet_balance: newBalance })
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
    
    // Student has ₦14,500 free credit. Needs ₦500 more.
    if (currentBalance >= 15000) {
        // Already have enough
        await completePremiumPurchase(user.id, currentBalance);
        return true;
    }
    
    // Need to add ₦500
    showToast('You need to add ₦500 to get Premium', 'info');
    
    // This will trigger the top-up modal
    return { needsTopUp: true, amount: 500, targetBalance: 15000 };
}

// Complete Premium purchase
async function completePremiumPurchase(userId, balance) {
    const newBalance = balance - 15000;
    
    await updateWalletBalance(userId, newBalance);
    await updateUserAccess(userId, ['library', 'hub', 'community'], 'premium');
    
    await addTransaction(userId, -15000, 'debit', 'Premium Purchase (Library + Hub + Community)');
    await addTransaction(userId, 0, 'credit', 'Premium access granted until end of month');
    
    // Record purchase
    await supabase.from('access_purchases').insert([{
        user_id: userId,
        plan_type: 'premium',
        amount_paid: 15000,
        platforms: ['library', 'hub', 'community'],
        purchase_date: new Date().toISOString(),
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }]);
    
    showToast('Premium activated! You now have access to everything.', 'success');
    return true;
}

// STANDARD PATH: Hub + Community only (forfeit remaining credit)
export async function purchaseStandard() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showToast('Please login first', 'error');
        return false;
    }
    
    const currentBalance = await getWalletBalance();
    
    // Warning: They will forfeit remaining credit
    const confirmed = confirm(
        '⚠️ WARNING ⚠️\n\n' +
        'If you choose Standard (Hub + Community):\n' +
        '• You will pay ₦13,000 from your free credit\n' +
        '• You will forfeit any remaining credit\n' +
        '• You will receive NO monthly bonuses\n' +
        '• Future purchases will be at FULL PRICE\n\n' +
        'Premium students receive RANDOM BONUSES every month!\n\n' +
        'Are you sure you want to continue?'
    );
    
    if (!confirmed) return false;
    
    // Deduct ₦13,000
    const newBalance = 0; // Forfeit everything
    
    await updateWalletBalance(user.id, newBalance);
    await updateUserAccess(user.id, ['hub', 'community'], 'standard');
    
    await addTransaction(user.id, -13000, 'debit', 'Standard Purchase (Hub + Community)');
    await addTransaction(user.id, 0, 'debit', 'Remaining credit forfeited by choice');
    
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
        .update({ [accessField]: true })
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

export { PRICING };
