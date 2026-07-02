// ============================================
// SUPABASE CLIENT CONFIGURATION
// ============================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

const SUPABASE_URL = 'https://vsgvscemqtqgolrindcx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3ZzY2VtcXRxZ29scmluZGN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTk1NDksImV4cCI6MjA5NjM3NTU0OX0.IUNvIleBOKGTIjTg-vx-v0wNLZEk9IVWGouvVIDlo40';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// AUTHENTICATION HELPERS (PRESERVED + ENHANCED)
// ============================================

// Get current user
export async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
        console.error('Error getting user:', error);
        return null;
    }
    return user;
}

// Sign in with email
export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });
    
    if (error) {
        console.error('Sign in error:', error);
        return { success: false, error: error.message };
    }
    
    return { success: true, user: data.user };
}

// Sign up - ENHANCED to create profile automatically
export async function signUp(email, password, userData) {
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                name: userData.name,
                username: userData.username,
                role: userData.role || 'student'
            }
        }
    });
    
    if (error) {
        console.error('Sign up error:', error);
        return { success: false, error: error.message };
    }
    
    if (data.user) {
        // Create user profile immediately
        const profileResult = await createUserProfile(data.user.id, {
            ...userData,
            email: email
        });
        
        if (!profileResult.success) {
            console.error('Profile creation failed:', profileResult.error);
        }
    }
    
    return { success: true, user: data.user };
}

// Sign out
export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Sign out error:', error);
        return false;
    }
    return true;
}

// ============================================
// USER PROFILE HELPERS (PRESERVED + ENHANCED)
// ============================================

// Create user profile - ENHANCED with more fields
export async function createUserProfile(userId, userData) {
    try {
        const { data, error } = await supabase
            .from('users')
            .insert([{
                id: userId,
                name: userData.name || 'User',
                email: userData.email,
                username: userData.username || null,
                role: userData.role || 'student',
                plan: userData.plan || 'basic',
                wallet_balance: userData.wallet_balance || 25000,
                avatar_url: userData.avatar_url || null,
                address: userData.address || null,
                birth_day: userData.birthDay || null,
                birth_month: userData.birthMonth || null,
                gp_points: 0,
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();
        
        if (error) {
            console.error('Error creating user profile:', error);
            return { success: false, error: error.message };
        }
        
        return { success: true, data };
    } catch (error) {
        console.error('Profile creation error:', error);
        return { success: false, error: error.message };
    }
}

// Get user profile - PRESERVED
export async function getUserProfile(userId = null) {
    try {
        if (!userId) {
            const user = await getCurrentUser();
            if (!user) return null;
            userId = user.id;
        }
        
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) {
            console.error('Error fetching user profile:', error);
            return null;
        }
        return data;
    } catch (error) {
        console.error('Profile fetch error:', error);
        return null;
    }
}

// Update user profile - PRESERVED
export async function updateUserProfile(updates) {
    try {
        const user = await getCurrentUser();
        if (!user) return null;
        
        const { data, error } = await supabase
            .from('users')
            .update({ 
                ...updates, 
                updated_at: new Date().toISOString() 
            })
            .eq('id', user.id)
            .select()
            .single();
        
        if (error) {
            console.error('Error updating user profile:', error);
            return null;
        }
        return data;
    } catch (error) {
        console.error('Profile update error:', error);
        return null;
    }
}

// Update wallet balance - PRESERVED
export async function updateWalletBalance(newBalance) {
    const user = await getCurrentUser();
    if (!user) return false;
    
    const { error } = await supabase
        .from('users')
        .update({ wallet_balance: newBalance })
        .eq('id', user.id);
    
    if (error) {
        console.error('Error updating wallet:', error);
        return false;
    }
    return true;
}

// ============================================
// PAYMENT HELPERS (PRESERVED)
// ============================================

// Create payment request - PRESERVED
export async function createPaymentRequest(amount, bank, referenceCode) {
    const user = await getCurrentUser();
    const profile = await getUserProfile();
    if (!user || !profile) return { success: false, error: 'User not found' };
    
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const { data, error } = await supabase
        .from('payments')
        .insert([{
            id: paymentId,
            user_id: user.id,
            user_name: profile.name,
            user_email: user.email,
            amount: amount,
            bank: bank,
            reference_code: referenceCode,
            status: 'pending',
            submitted_at: new Date().toISOString()
        }])
        .select();
    
    if (error) {
        console.error('Error creating payment:', error);
        return { success: false, error: error.message };
    }
    
    return { success: true, payment: data[0] };
}

// Get user payments - PRESERVED
export async function getUserPayments() {
    const user = await getCurrentUser();
    if (!user) return [];
    
    const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false });
    
    if (error) {
        console.error('Error fetching payments:', error);
        return [];
    }
    
    return data;
}

// Get all pending payments (admin only) - PRESERVED
export async function getPendingPayments() {
    const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true });
    
    if (error) {
        console.error('Error fetching pending payments:', error);
        return [];
    }
    
    return data;
}

// Approve payment (admin only) - PRESERVED
export async function approvePayment(paymentId, adminNotes) {
    const { error } = await supabase
        .from('payments')
        .update({ 
            status: 'approved', 
            approved_at: new Date().toISOString(),
            admin_notes: adminNotes
        })
        .eq('id', paymentId);
    
    if (error) {
        console.error('Error approving payment:', error);
        return false;
    }
    
    // Get payment details to update wallet
    const { data: payment } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();
    
    if (payment) {
        // Update user's wallet balance
        const { data: user } = await supabase
            .from('users')
            .select('wallet_balance')
            .eq('id', payment.user_id)
            .single();
        
        const newBalance = (user?.wallet_balance || 25000) + payment.amount;
        
        await supabase
            .from('users')
            .update({ wallet_balance: newBalance })
            .eq('id', payment.user_id);
        
        // Add transaction record
        await supabase
            .from('transactions')
            .insert([{
                id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                user_id: payment.user_id,
                amount: payment.amount,
                type: 'credit',
                description: `Wallet funding - ${payment.reference_code}`,
                status: 'completed',
                created_at: new Date().toISOString()
            }]);
    }
    
    return true;
}

// Reject payment (admin only) - PRESERVED
export async function rejectPayment(paymentId, adminNotes) {
    const { error } = await supabase
        .from('payments')
        .update({ 
            status: 'rejected', 
            admin_notes: adminNotes
        })
        .eq('id', paymentId);
    
    if (error) {
        console.error('Error rejecting payment:', error);
        return false;
    }
    return true;
}

// ============================================
// TRANSACTION HELPERS (PRESERVED)
// ============================================

// Get user transactions - PRESERVED
export async function getUserTransactions() {
    const user = await getCurrentUser();
    if (!user) return [];
    
    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
    
    if (error) {
        console.error('Error fetching transactions:', error);
        return [];
    }
    
    return data;
}

// Add transaction - PRESERVED
export async function addTransaction(amount, type, description) {
    const user = await getCurrentUser();
    if (!user) return false;
    
    const { error } = await supabase
        .from('transactions')
        .insert([{
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            user_id: user.id,
            amount: amount,
            type: type,
            description: description,
            status: 'completed',
            created_at: new Date().toISOString()
        }]);
    
    if (error) {
        console.error('Error adding transaction:', error);
        return false;
    }
    return true;
}

// ============================================
// LIBRARY HELPERS (PRESERVED)
// ============================================

// Save item to shelf - PRESERVED
export async function saveToShelf(itemId, itemType, itemData) {
    const user = await getCurrentUser();
    if (!user) return false;
    
    // Check if already saved
    const { data: existing } = await supabase
        .from('saved_items')
        .select('id')
        .eq('user_id', user.id)
        .eq('item_id', itemId)
        .single();
    
    if (existing) {
        // Already saved, so unsave
        await supabase
            .from('saved_items')
            .delete()
            .eq('id', existing.id);
        return { action: 'unsaved' };
    }
    
    // Save new
    const { error } = await supabase
        .from('saved_items')
        .insert([{
            id: `saved_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
    return { action: 'saved' };
}

// Get saved items - PRESERVED
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

// Check if item is saved - PRESERVED
export async function isItemSaved(itemId) {
    const user = await getCurrentUser();
    if (!user) return false;
    
    const { data, error } = await supabase
        .from('saved_items')
        .select('id')
        .eq('user_id', user.id)
        .eq('item_id', itemId)
        .single();
    
    if (error && error.code !== 'PGRST116') {
        console.error('Check saved error:', error);
    }
    
    return !!data;
}

// Record recently viewed - PRESERVED
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
    await supabase
        .from('recently_viewed')
        .insert([{
            id: `view_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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

// Get recently viewed - PRESERVED
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

// ============================================
// REAL-TIME SUBSCRIPTIONS (PRESERVED)
// ============================================

// Subscribe to user's payments - PRESERVED
export function subscribeToUserPayments(callback) {
    return supabase
        .channel('user_payments')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'payments' },
            callback
        )
        .subscribe();
}

// Subscribe to all payments (admin) - PRESERVED
export function subscribeToAllPayments(callback) {
    return supabase
        .channel('all_payments')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'payments' },
            callback
        )
        .subscribe();
}

// Subscribe to user's wallet changes - PRESERVED
export function subscribeToWallet(callback) {
    const user = getCurrentUser();
    if (!user) return null;
    
    return supabase
        .channel('wallet_changes')
        .on('postgres_changes', 
            { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` },
            (payload) => {
                if (payload.new) {
                    callback(payload.new.wallet_balance);
                }
            }
        )
        .subscribe();
}

// ============================================
// NEW: USERNAME HELPER
// ============================================

// Get user by username - NEW
export async function getUserByUsername(username) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();
        
        if (error) {
            console.error('Error fetching user by username:', error);
            return null;
        }
        return data;
    } catch (error) {
        console.error('Username fetch error:', error);
        return null;
    }
}

// Get user by email - NEW
export async function getUserByEmail(email) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();
        
        if (error) {
            console.error('Error fetching user by email:', error);
            return null;
        }
        return data;
    } catch (error) {
        console.error('Email fetch error:', error);
        return null;
    }
}

// ============================================
// NEW: WALLET TRANSFER FUNCTION
// ============================================

// Transfer funds between users - NEW
export async function transferFunds(fromUserId, toUserId, amount, description) {
    try {
        // Start a transaction by using a single query with multiple operations
        // Since Supabase doesn't support transactions directly, we'll use a combination of operations
        
        // 1. Check if sender has enough balance
        const { data: senderData, error: senderError } = await supabase
            .from('users')
            .select('wallet_balance')
            .eq('id', fromUserId)
            .single();
        
        if (senderError) throw senderError;
        if (senderData.wallet_balance < amount) {
            return { success: false, error: 'Insufficient balance' };
        }
        
        // 2. Deduct from sender
        const { error: deductError } = await supabase
            .from('users')
            .update({ wallet_balance: senderData.wallet_balance - amount })
            .eq('id', fromUserId);
        
        if (deductError) throw deductError;
        
        // 3. Add to receiver
        const { data: receiverData } = await supabase
            .from('users')
            .select('wallet_balance')
            .eq('id', toUserId)
            .single();
        
        const { error: addError } = await supabase
            .from('users')
            .update({ wallet_balance: (receiverData?.wallet_balance || 0) + amount })
            .eq('id', toUserId);
        
        if (addError) {
            // Rollback sender's balance
            await supabase
                .from('users')
                .update({ wallet_balance: senderData.wallet_balance })
                .eq('id', fromUserId);
            throw addError;
        }
        
        // 4. Create transaction records
        await supabase
            .from('transactions')
            .insert([
                {
                    id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    user_id: fromUserId,
                    amount: -amount,
                    type: 'debit',
                    description: description || `Transfer to user ${toUserId}`,
                    status: 'completed',
                    created_at: new Date().toISOString()
                },
                {
                    id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    user_id: toUserId,
                    amount: amount,
                    type: 'credit',
                    description: description || `Transfer from user ${fromUserId}`,
                    status: 'completed',
                    created_at: new Date().toISOString()
                }
            ]);
        
        return { success: true };
        
    } catch (error) {
        console.error('Transfer error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// NEW: USER REFERRAL SYSTEM
// ============================================

// Get user's referral code - NEW
export async function getReferralCode() {
    const user = await getCurrentUser();
    if (!user) return null;
    
    const profile = await getUserProfile(user.id);
    if (!profile) return null;
    
    // If no referral code, generate one
    if (!profile.referral_code) {
        const newCode = UPPER(SUBSTRING(MD5(user.id + Date.now()) FROM 1 FOR 8));
        await updateUserProfile({ referral_code: newCode });
        return newCode;
    }
    
    return profile.referral_code;
}

// Get users referred by a specific user - NEW
export async function getReferredUsers(userId) {
    try {
        // This assumes you have a 'referred_by' column in users table
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('referred_by', userId)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error fetching referred users:', error);
            return [];
        }
        return data;
    } catch (error) {
        console.error('Referred users fetch error:', error);
        return [];
    }
}

// Apply referral code during signup - NEW
export async function applyReferralCode(referralCode, newUserId) {
    try {
        // Find the referrer
        const { data: referrer, error } = await supabase
            .from('users')
            .select('id')
            .eq('referral_code', referralCode)
            .single();
        
        if (error || !referrer) {
            return { success: false, error: 'Invalid referral code' };
        }
        
        // Update new user with referrer
        const { error: updateError } = await supabase
            .from('users')
            .update({ referred_by: referrer.id })
            .eq('id', newUserId);
        
        if (updateError) throw updateError;
        
        // Give bonus to referrer (e.g., 500 GP points)
        const { data: referrerData } = await supabase
            .from('users')
            .select('gp_points')
            .eq('id', referrer.id)
            .single();
        
        await supabase
            .from('users')
            .update({ gp_points: (referrerData?.gp_points || 0) + 500 })
            .eq('id', referrer.id);
        
        return { success: true };
        
    } catch (error) {
        console.error('Referral application error:', error);
        return { success: false, error: error.message };
    }
}
