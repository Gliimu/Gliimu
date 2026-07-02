// ============================================
// SUPABASE CLIENT CONFIGURATION
// ============================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

const SUPABASE_URL = 'https://vsgvscemqtqgolrindcx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3ZzY2VtcXRxZ29scmluZGN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTk1NDksImV4cCI6MjA5NjM3NTU0OX0.IUNvIleBOKGTIjTg-vx-v0wNLZEk9IVWGouvVIDlo40';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// AUTHENTICATION HELPERS
// ============================================

export async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
        console.error('Error getting user:', error);
        return null;
    }
    return user;
}

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

export async function signUp(email, password, userData) {
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                name: userData.name,
                username: userData.username,
                role: 'user' // Always start as 'user'
            }
        }
    });
    
    if (error) {
        console.error('Sign up error:', error);
        return { success: false, error: error.message };
    }
    
    if (data.user) {
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

export async function createUserProfile(userId, userData) {
    try {
        const { data, error } = await supabase
            .from('users')
            .insert([{
                id: userId,
                name: userData.name || 'User',
                email: userData.email,
                username: userData.username || null,
                role: 'user', // Always start as 'user'
                plan: 'basic',
                wallet_balance: 25000,
                avatar_url: userData.avatar_url || null,
                address: userData.address || null,
                birth_day: userData.birthDay || null,
                birth_month: userData.birthMonth || null,
                gp_points: 0,
                status: 'active',
                application_status: 'none',
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
// APPLICATION HELPERS
// ============================================

export async function submitApplication(applicationData) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return { success: false, error: 'User not authenticated' };
        }

        const applicationId = `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const application = {
            id: applicationId,
            user_id: user.id,
            full_name: applicationData.fullName,
            email: applicationData.email,
            username: applicationData.username,
            role: applicationData.role,
            birth_day: applicationData.birthDay || null,
            birth_month: applicationData.birthMonth || null,
            status: 'pending',
            submitted_at: new Date().toISOString()
        };
        
        const { data, error } = await supabase
            .from('applications')
            .insert([application])
            .select();
        
        if (error) throw error;
        
        // Update user's application status
        await supabase
            .from('users')
            .update({ 
                application_status: 'pending',
                applied_role: applicationData.role
            })
            .eq('id', user.id);
        
        return { success: true, data: data[0] };
    } catch (error) {
        console.error('Application submission error:', error);
        return { success: false, error: error.message };
    }
}

export async function getUserApplications() {
    try {
        const user = await getCurrentUser();
        if (!user) return [];
        
        const { data, error } = await supabase
            .from('applications')
            .select('*')
            .eq('user_id', user.id)
            .order('submitted_at', { ascending: false });
        
        if (error) {
            console.error('Error fetching applications:', error);
            return [];
        }
        return data;
    } catch (error) {
        console.error('Applications fetch error:', error);
        return [];
    }
}

export async function getPendingApplications() {
    try {
        // Check if user is admin
        const user = await getCurrentUser();
        if (!user) return [];
        
        const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();
        
        if (profile?.role !== 'admin') {
            return [];
        }
        
        const { data, error } = await supabase
            .from('applications')
            .select('*')
            .eq('status', 'pending')
            .order('submitted_at', { ascending: true });
        
        if (error) {
            console.error('Error fetching pending applications:', error);
            return [];
        }
        return data;
    } catch (error) {
        console.error('Pending applications fetch error:', error);
        return [];
    }
}

export async function approveApplication(applicationId, adminNotes) {
    try {
        // Check if user is admin
        const user = await getCurrentUser();
        if (!user) return { success: false, error: 'Not authenticated' };
        
        const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();
        
        if (profile?.role !== 'admin') {
            return { success: false, error: 'Unauthorized' };
        }
        
        // Get application details
        const { data: application, error: appError } = await supabase
            .from('applications')
            .select('*')
            .eq('id', applicationId)
            .single();
        
        if (appError || !application) {
            return { success: false, error: 'Application not found' };
        }
        
        // Update application status
        const { error: updateAppError } = await supabase
            .from('applications')
            .update({ 
                status: 'approved', 
                approved_at: new Date().toISOString(),
                admin_notes: adminNotes
            })
            .eq('id', applicationId);
        
        if (updateAppError) throw updateAppError;
        
        // Update user's role and application status
        const { error: updateUserError } = await supabase
            .from('users')
            .update({ 
                role: application.role,
                application_status: 'approved'
            })
            .eq('id', application.user_id);
        
        if (updateUserError) throw updateUserError;
        
        return { success: true };
    } catch (error) {
        console.error('Application approval error:', error);
        return { success: false, error: error.message };
    }
}

export async function rejectApplication(applicationId, adminNotes) {
    try {
        // Check if user is admin
        const user = await getCurrentUser();
        if (!user) return { success: false, error: 'Not authenticated' };
        
        const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();
        
        if (profile?.role !== 'admin') {
            return { success: false, error: 'Unauthorized' };
        }
        
        // Update application status
        const { error: updateAppError } = await supabase
            .from('applications')
            .update({ 
                status: 'rejected', 
                rejected_at: new Date().toISOString(),
                admin_notes: adminNotes
            })
            .eq('id', applicationId);
        
        if (updateAppError) throw updateAppError;
        
        // Update user's application status
        const { error: updateUserError } = await supabase
            .from('users')
            .update({ 
                application_status: 'rejected'
            })
            .eq('id', (await supabase.from('applications').select('user_id').eq('id', applicationId).single()).data.user_id);
        
        if (updateUserError) throw updateUserError;
        
        return { success: true };
    } catch (error) {
        console.error('Application rejection error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// PAYMENT HELPERS (PRESERVED)
// ============================================

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

// ============================================
// TRANSACTION HELPERS (PRESERVED)
// ============================================

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

export async function saveToShelf(itemId, itemType, itemData) {
    const user = await getCurrentUser();
    if (!user) return false;
    
    const { data: existing } = await supabase
        .from('saved_items')
        .select('id')
        .eq('user_id', user.id)
        .eq('item_id', itemId)
        .single();
    
    if (existing) {
        await supabase
            .from('saved_items')
            .delete()
            .eq('id', existing.id);
        return { action: 'unsaved' };
    }
    
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

// ============================================
// REAL-TIME SUBSCRIPTIONS (PRESERVED)
// ============================================

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
