// ============================================
// GLIIMU WALLET MODULE - UPDATED
// Plans: Basic (1 platform), Standard (2 platforms), Premium (All 3)
// Hub is always FREE (not part of paid plans)
// Platforms: library, virtualroom, chat
// ============================================

import { supabase } from './supabase.js';
import { showToast } from './toast.js';

// Platform pricing (locked)
const PRICING = {
    library: 7500,      // Individual platform price
    virtualroom: 7500,  // Individual platform price
    chat: 7500,         // Individual platform price
    premium: 15000,     // All 3 platforms
    standard: 13000,    // Any 2 platforms
    basic: 7500         // Any 1 platform
};

// Platform display names and icons
const PLATFORM_INFO = {
    library: { name: 'Digital Library', icon: '📚', description: 'Access books, bundles, and learning materials' },
    virtualroom: { name: 'Virtual Classroom', icon: '🎥', description: 'Live classes, whiteboard, screen sharing' },
    chat: { name: 'Community Chat', icon: '💬', description: 'Connect with peers and instructors' }
};

// Hub is always free - not in paid platforms list
const PAID_PLATFORMS = ['library', 'virtualroom', 'chat'];
const FREE_PLATFORMS = ['hub']; // Always accessible

// Get current user's wallet balance
export async function getWalletBalance() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 14500;
    
    const { data, error } = await supabase
        .from('users')
        .select('wallet_balance')
        .eq('id', user.id)
        .single();
    
    if (error) {
        console.error('Error fetching wallet:', error);
        return 14500;
    }
    
    const balance = data?.wallet_balance || 14500;
    if (balance === 25000) {
        await supabase
            .from('users')
            .update({ wallet_balance: 14500 })
            .eq('id', user.id);
        return 14500;
    }
    
    return balance;
}

// Get user's current access and subscription
export async function getUserAccess() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    const { data, error } = await supabase
        .from('users')
        .select('subscription_plan, selected_platforms, wallet_balance')
        .eq('id', user.id)
        .single();
    
    if (error) {
        console.error('Error fetching access:', error);
        return null;
    }
    
    return {
        plan: data?.subscription_plan || 'free',
        selectedPlatforms: data?.selected_platforms || [],
        walletBalance: data?.wallet_balance || 14500
    };
}

// Check if user can access a specific platform
export async function canAccess(platform) {
    // Hub is always free
    if (platform === 'hub') return true;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    
    const { data, error } = await supabase
        .from('users')
        .select('subscription_plan, selected_platforms')
        .eq('id', user.id)
        .single();
    
    if (error) return false;
    
    const plan = data?.subscription_plan || 'free';
    const selectedPlatforms = data?.selected_platforms || [];
    
    if (plan === 'premium') return true;
    if (plan === 'standard') return selectedPlatforms.includes(platform);
    if (plan === 'basic') return selectedPlatforms.includes(platform);
    
    return false;
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

// Update user's subscription plan and selected platforms
async function updateUserSubscription(userId, plan, selectedPlatforms) {
    const { error } = await supabase
        .from('users')
        .update({
            subscription_plan: plan,
            selected_platforms: selectedPlatforms,
            updated_at: new Date().toISOString()
        })
        .eq('id', userId);
    
    if (error) console.error('Error updating subscription:', error);
}

// Purchase Basic plan (1 platform)
export async function purchaseBasic(selectedPlatform) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showToast('Please login first', 'error');
        return false;
    }
    
    const currentBalance = await getWalletBalance();
    const price = PRICING.basic;
    
    if (currentBalance < price) {
        showToast(`Insufficient funds. Need ₦${price - currentBalance} more.`, 'error');
        return { needsTopUp: true, amount: price - currentBalance, targetBalance: price };
    }
    
    const newBalance = currentBalance - price;
    await updateWalletBalance(user.id, newBalance);
    await updateUserSubscription(user.id, 'basic', [selectedPlatform]);
    
    await addTransaction(user.id, -price, 'debit', 
        `Basic Plan: ${PLATFORM_INFO[selectedPlatform]?.name || selectedPlatform} access`);
    
    showToast(`Basic plan activated! You now have unlimited access to ${PLATFORM_INFO[selectedPlatform]?.name || selectedPlatform}.`, 'success');
    return true;
}

// Purchase Standard plan (2 platforms)
export async function purchaseStandard(selectedPlatforms) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showToast('Please login first', 'error');
        return false;
    }
    
    if (!selectedPlatforms || selectedPlatforms.length !== 2) {
        showToast('Please select 2 platforms for your Standard plan', 'error');
        return false;
    }
    
    const currentBalance = await getWalletBalance();
    const price = PRICING.standard;
    
    if (currentBalance < price) {
        showToast(`Insufficient funds. Need ₦${price - currentBalance} more.`, 'error');
        return { needsTopUp: true, amount: price - currentBalance, targetBalance: price };
    }
    
    const newBalance = currentBalance - price;
    await updateWalletBalance(user.id, newBalance);
    await updateUserSubscription(user.id, 'standard', selectedPlatforms);
    
    const platformNames = selectedPlatforms.map(p => PLATFORM_INFO[p]?.name || p).join(' + ');
    await addTransaction(user.id, -price, 'debit', `Standard Plan: ${platformNames} access`);
    
    showToast(`Standard plan activated! You now have unlimited access to ${platformNames}.`, 'success');
    return true;
}

// Purchase Premium plan (all 3 platforms)
export async function purchasePremium() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showToast('Please login first', 'error');
        return false;
    }
    
    const currentBalance = await getWalletBalance();
    const price = PRICING.premium;
    
    if (currentBalance < price) {
        showToast(`You need ₦${price - currentBalance} more to get Premium`, 'info');
        return { needsTopUp: true, amount: price - currentBalance, targetBalance: price };
    }
    
    const newBalance = currentBalance - price;
    await updateWalletBalance(user.id, newBalance);
    await updateUserSubscription(user.id, 'premium', PAID_PLATFORMS);
    
    await addTransaction(user.id, -price, 'debit', 'Premium Plan: All platforms access');
    
    showToast('Premium activated! You now have unlimited access to Library, Virtual Classroom, and Community Chat.', 'success');
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

// Check if user is Premium
export async function isPremium() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    
    const { data, error } = await supabase
        .from('users')
        .select('subscription_plan')
        .eq('id', user.id)
        .single();
    
    if (error) return false;
    return data?.subscription_plan === 'premium';
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
    
    const { data: profile } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', user.id)
        .single();
    
    const paymentRequest = {
        id: `pay_${Date.now()}`,
        user_id: user.id,
        user_name: profile?.name || 'User',
        user_email: profile?.email || '',
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

// Get available platforms for selection
export function getAvailablePlatforms() {
    return PAID_PLATFORMS.map(platform => ({
        id: platform,
        name: PLATFORM_INFO[platform].name,
        icon: PLATFORM_INFO[platform].icon,
        description: PLATFORM_INFO[platform].description
    }));
}

// Get plan details for display
export function getPlanDetails() {
    return {
        basic: {
            name: 'Basic',
            price: PRICING.basic,
            priceDisplay: '₦7,500',
            platforms: 1,
            features: ['Access to 1 paid platform of your choice', 'Unlimited Hub access', 'Basic support'],
            icon: '🌱'
        },
        standard: {
            name: 'Standard',
            price: PRICING.standard,
            priceDisplay: '₦13,000',
            platforms: 2,
            features: ['Access to 2 paid platforms of your choice', 'Unlimited Hub access', 'Priority support'],
            icon: '📦'
        },
        premium: {
            name: 'Premium',
            price: PRICING.premium,
            priceDisplay: '₦15,000',
            platforms: 3,
            features: ['Full access to all 3 platforms', 'Unlimited Hub access', '24/7 priority support', 'Monthly bonus rewards'],
            icon: '👑'
        }
    };
}

export { PRICING, PLATFORM_INFO, PAID_PLATFORMS, FREE_PLATFORMS };
