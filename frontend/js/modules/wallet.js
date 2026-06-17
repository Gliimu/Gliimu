// ============================================
// GLIIMU WALLET MODULE - UPDATED
// Free access to everything. Users pay only for what they value.
// ============================================

import { supabase } from './supabase.js';
import { showToast } from './toast.js';

// ============================================
// CORE WALLET FUNCTIONS
// ============================================

// Get current user's wallet balance
export async function getWalletBalance() {
    try {
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
    } catch (error) {
        console.error('Error in getWalletBalance:', error);
        return 0;
    }
}

// Update user's wallet balance
async function updateWalletBalance(userId, newBalance) {
    const { error } = await supabase
        .from('users')
        .update({ 
            wallet_balance: newBalance, 
            updated_at: new Date().toISOString() 
        })
        .eq('id', userId);
    
    if (error) console.error('Error updating wallet:', error);
}

// Record transaction
async function addTransaction(userId, amount, type, description, reference = null) {
    try {
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
    } catch (error) {
        console.error('Error in addTransaction:', error);
    }
}

// ============================================
// PURCHASE FUNCTIONS
// ============================================

// Purchase a book (digital or physical)
export async function purchaseBook(bookId, price, bookTitle, type = 'digital') {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showToast('Please login first', 'error');
            return false;
        }
        
        const currentBalance = await getWalletBalance();
        
        if (currentBalance < price) {
            showToast(`Insufficient funds. Need ₦${(price - currentBalance).toLocaleString()} more.`, 'error');
            return false;
        }
        
        const newBalance = currentBalance - price;
        await updateWalletBalance(user.id, newBalance);
        
        // Record the purchase in user_purchases table
        const { error: purchaseError } = await supabase
            .from('user_purchases')
            .insert([{
                user_id: user.id,
                item_id: bookId,
                purchase_type: type,
                amount: price,
                created_at: new Date().toISOString()
            }]);
        
        if (purchaseError) {
            console.error('Error recording purchase:', purchaseError);
            // Refund if purchase recording fails
            await updateWalletBalance(user.id, currentBalance);
            showToast('Purchase failed. Please try again.', 'error');
            return false;
        }
        
        await addTransaction(user.id, -price, 'debit', `${type === 'physical' ? 'Physical' : 'Digital'} Book: ${bookTitle}`);
        
        showToast(`Successfully purchased "${bookTitle}" for ₦${price.toLocaleString()}!`, 'success');
        return true;
        
    } catch (error) {
        console.error('Error in purchaseBook:', error);
        showToast('Failed to complete purchase. Please try again.', 'error');
        return false;
    }
}

// Purchase a bundle
export async function purchaseBundle(bundleId, price, bundleTitle) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showToast('Please login first', 'error');
            return false;
        }
        
        const currentBalance = await getWalletBalance();
        
        if (currentBalance < price) {
            showToast(`Insufficient funds. Need ₦${(price - currentBalance).toLocaleString()} more.`, 'error');
            return false;
        }
        
        const newBalance = currentBalance - price;
        await updateWalletBalance(user.id, newBalance);
        
        // Record the purchase in user_purchases table
        const { error: purchaseError } = await supabase
            .from('user_purchases')
            .insert([{
                user_id: user.id,
                item_id: bundleId,
                purchase_type: 'bundle',
                amount: price,
                created_at: new Date().toISOString()
            }]);
        
        if (purchaseError) {
            console.error('Error recording purchase:', purchaseError);
            await updateWalletBalance(user.id, currentBalance);
            showToast('Purchase failed. Please try again.', 'error');
            return false;
        }
        
        await addTransaction(user.id, -price, 'debit', `Bundle: ${bundleTitle}`);
        
        showToast(`Successfully purchased bundle "${bundleTitle}" for ₦${price.toLocaleString()}!`, 'success');
        return true;
        
    } catch (error) {
        console.error('Error in purchaseBundle:', error);
        showToast('Failed to complete purchase. Please try again.', 'error');
        return false;
    }
}

// Purchase a product (uniforms, gadgets, merchandise)
export async function purchaseProduct(productId, price, productName) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showToast('Please login first', 'error');
            return false;
        }
        
        const currentBalance = await getWalletBalance();
        
        if (currentBalance < price) {
            showToast(`Insufficient funds. Need ₦${(price - currentBalance).toLocaleString()} more.`, 'error');
            return false;
        }
        
        // Check product stock
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('stock_quantity')
            .eq('id', productId)
            .single();
        
        if (productError) {
            console.error('Error checking product:', productError);
        }
        
        if (product && product.stock_quantity <= 0) {
            showToast('Product is out of stock!', 'error');
            return false;
        }
        
        const newBalance = currentBalance - price;
        await updateWalletBalance(user.id, newBalance);
        
        // Update stock if product exists
        if (product && product.stock_quantity > 0) {
            await supabase
                .from('products')
                .update({ stock_quantity: product.stock_quantity - 1 })
                .eq('id', productId);
        }
        
        // Record purchase
        const { error: purchaseError } = await supabase
            .from('user_purchases')
            .insert([{
                user_id: user.id,
                item_id: productId,
                purchase_type: 'product',
                amount: price,
                created_at: new Date().toISOString()
            }]);
        
        if (purchaseError) {
            console.error('Error recording purchase:', purchaseError);
            await updateWalletBalance(user.id, currentBalance);
            showToast('Purchase failed. Please try again.', 'error');
            return false;
        }
        
        await addTransaction(user.id, -price, 'debit', `Product: ${productName}`);
        
        showToast(`Successfully purchased "${productName}" for ₦${price.toLocaleString()}!`, 'success');
        return true;
        
    } catch (error) {
        console.error('Error in purchaseProduct:', error);
        showToast('Failed to complete purchase. Please try again.', 'error');
        return false;
    }
}

// ============================================
// TIP CREATOR
// ============================================

export async function tipCreator(receiverId, amount, entityType, entityId, message = '') {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showToast('Please login first', 'error');
            return false;
        }
        
        if (user.id === receiverId) {
            showToast('You cannot tip yourself', 'error');
            return false;
        }
        
        if (amount < 100) {
            showToast('Minimum tip amount is ₦100', 'error');
            return false;
        }
        
        const currentBalance = await getWalletBalance();
        
        if (currentBalance < amount) {
            showToast(`Insufficient funds. Need ₦${(amount - currentBalance).toLocaleString()} more.`, 'error');
            return false;
        }
        
        // Deduct from sender
        const newBalance = currentBalance - amount;
        await updateWalletBalance(user.id, newBalance);
        
        // Record tip
        const { error: tipError } = await supabase
            .from('tips')
            .insert([{
                sender_id: user.id,
                receiver_id: receiverId,
                amount: amount,
                entity_type: entityType,
                entity_id: entityId,
                message: message,
                created_at: new Date().toISOString()
            }]);
        
        if (tipError) {
            console.error('Error recording tip:', tipError);
            // Refund the user if tip recording fails
            await updateWalletBalance(user.id, currentBalance);
            showToast('Failed to send tip. Please try again.', 'error');
            return false;
        }
        
        // Update receiver's total tips received
        const { error: rpcError } = await supabase.rpc('increment_user_tips', { 
            p_user_id: receiverId, 
            p_amount: amount 
        });
        
        if (rpcError) {
            console.warn('Could not update tips count:', rpcError);
        }
        
        await addTransaction(user.id, -amount, 'debit', `Tip to ${receiverId}: ${message || 'Thanks!'}`);
        
        showToast(`Tip of ₦${amount.toLocaleString()} sent successfully!`, 'success');
        return true;
        
    } catch (error) {
        console.error('Error in tipCreator:', error);
        showToast('Failed to send tip. Please try again.', 'error');
        return false;
    }
}

// ============================================
// TRANSACTION HISTORY
// ============================================

// Get transaction history
export async function getTransactionHistory(limit = 20) {
    try {
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
        
        return data || [];
    } catch (error) {
        console.error('Error in getTransactionHistory:', error);
        return [];
    }
}

// ============================================
// REAL-TIME WALLET UPDATES
// ============================================

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

// ============================================
// ADD FUNDS REQUEST
// ============================================

// Request to add funds to wallet (admin approval required)
export async function requestAddFunds(amount, bank, referenceCode) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showToast('Please login first', 'error');
        return false;
    }
    
    const { data: profile } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', user.id)
        .single();
    
    const paymentRequest = {
        id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
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

// ============================================
// LEGACY FUNCTIONS (Backward Compatibility)
// ============================================

// Get user's current access (legacy - always free)
export async function getUserAccess() {
    const balance = await getWalletBalance();
    return {
        plan: 'free',
        selectedPlatforms: [],
        walletBalance: balance
    };
}

// Check if user can access a platform (legacy - always true for free access)
export async function canAccess(platform) {
    return true;
}

// Legacy functions for backward compatibility
export async function purchaseBasic() { return true; }
export async function purchaseStandard() { return true; }
export async function purchasePremium() { return true; }
export async function isPremium() { return false; }
export function getAvailablePlatforms() { return []; }
export function getPlanDetails() { return {}; }

// ============================================
// EXPORTS
// ============================================

// Export constants (kept for compatibility)
export const PRICING = {};
export const PLATFORM_INFO = {};
export const PAID_PLATFORMS = [];
export const FREE_PLATFORMS = ['hub'];
