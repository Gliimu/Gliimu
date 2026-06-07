// ============================================
// SUPABASE CLIENT CONFIGURATION
// ============================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

// Your Supabase credentials
const SUPABASE_URL = 'https://vsgvscemqtqgolrindcx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3ZzY2VtcXRxZ29scmluZGN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTk1NDksImV4cCI6MjA5NjM3NTU0OX0.IUNvIleBOKGTIjTg-vx-v0wNLZEk9IVWGouvVIDlo40';

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// AUTHENTICATION HELPERS
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

// Sign up
export async function signUp(email, password, userData) {
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            data: userData
        }
    });
    
    if (error) {
        console.error('Sign up error:', error);
        return { success: false, error: error.message };
    }
    
    // Create user profile
    if (data.user) {
        await createUserProfile(data.user.id, userData);
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
// USER PROFILE HELPERS
// ============================================

// Create user profile
export async function createUserProfile(userId, userData) {
    const { error } = await supabase
        .from('users')
        .insert([{
            id: userId,
            name: userData.name || 'User',
            email: userData.email,
            role: userData.role || 'student',
            plan: userData.plan || 'basic',
            wallet_balance: 25000,
            created_at: new Date().toISOString()
        }]);
    
    if (error) {
        console.error('Error creating user profile:', error);
    }
}

// Get user profile
export async function getUserProfile() {
    const user = await getCurrentUser();
    if (!user) return null;
    
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
    
    if (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }
    return data;
}

// Update user profile
export async function updateUserProfile(updates) {
    const user = await getCurrentUser();
    if (!user) return null;
    
    const { data, error } = await supabase
        .from('users')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .select()
        .single();
    
    if (error) {
        console.error('Error updating user profile:', error);
        return null;
    }
    return data;
}

// Update wallet balance
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
// PAYMENT HELPERS
// ============================================

// Create payment request
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

// Get user payments
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

// Get all pending payments (admin only)
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

// Approve payment (admin only)
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

// Reject payment (admin only)
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
// TRANSACTION HELPERS
// ============================================

// Get user transactions
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

// Add transaction
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
// LIBRARY HELPERS (Shelf & Recently Viewed)
// ============================================

// Save item to shelf
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

// Check if item is saved
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

// ============================================
// REAL-TIME SUBSCRIPTIONS
// ============================================

// Subscribe to user's payments
export function subscribeToUserPayments(callback) {
    return supabase
        .channel('user_payments')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'payments' },
            callback
        )
        .subscribe();
}

// Subscribe to all payments (admin)
export function subscribeToAllPayments(callback) {
    return supabase
        .channel('all_payments')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'payments' },
            callback
        )
        .subscribe();
}

// Subscribe to user's wallet changes
export function subscribeToWallet(callback) {
    const user = getCurrentUser();
    if (!user) return null;
    
    return supabase
        .channel('wallet_changes')
        .on('postgres_changes', 
            { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` },
            callback
        )
        .subscribe();
}
