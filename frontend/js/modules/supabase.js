// ============================================
// SUPABASE CLIENT CONFIGURATION
// ============================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

const SUPABASE_URL = 'https://vsgvscemqtqgolrindcx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3ZzY2VtcXRxZ29scmluZGN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTk1NDksImV4cCI6MjA5NjM3NTU0OX0.IUNvIleBOKGTIjTg-vx-v0wNLZEk9IVWGouvVIDlo40';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// SECTION 1: AUTHENTICATION
// ============================================

export async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
        console.error('Error getting user:', error);
        return null;
    }
    return user;
}

export async function getCurrentSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error('Error getting session:', error);
        return null;
    }
    return session;
}

export async function signIn(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            console.error('Sign in error:', error);
            return { success: false, error: error.message };
        }

        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', data.user.id)
            .maybeSingle();

        if (profileError) {
            console.warn('Profile fetch warning:', profileError);
            return { 
                success: true, 
                user: data.user,
                profile: null 
            };
        }

        return { success: true, user: data.user, profile };
    } catch (error) {
        console.error('Sign in error:', error);
        return { success: false, error: error.message };
    }
}

export async function signUp(email, password, userData) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    name: userData.name,
                    username: userData.username,
                    role: 'user'
                }
            }
        });
        
        if (error) {
            console.error('Sign up error:', error);
            return { success: false, error: error.message };
        }
        
        if (data.user) {
            const { error: insertError } = await supabase
                .from('user_profiles')
                .upsert([{
                    id: data.user.id,
                    name: userData.name,
                    username: userData.username,
                    email: email,
                    role: 'user',
                    wallet_balance: 0,
                    gp_points: 0,
                    status: 'active',
                    plan: 'basic',
                    application_status: 'none',
                    birth_day: userData.birthDay || null,
                    birth_month: userData.birthMonth || null,
                    recovery_phrase: userData.recoveryPhrase || null,
                    referral_code: `GLM-${Math.random().toString(36).substring(2, 8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
                }], { onConflict: 'id' });

            if (insertError && insertError.code !== '23505') {
                console.warn('Profile creation warning:', insertError);
            }
        }
        
        return { success: true, user: data.user };
    } catch (error) {
        console.error('Sign up error:', error);
        return { success: false, error: error.message };
    }
}

export async function signOutUser() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Sign out error:', error);
        return false;
    }
    return true;
}

// ============================================
// SECTION 2: USER PROFILES
// ============================================

export async function getUserProfile(userId = null) {
    try {
        if (!userId) {
            const user = await getCurrentUser();
            if (!user) return null;
            userId = user.id;
        }
        
        console.log('🔍 Fetching profile for user ID:', userId);
        
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
        
        if (error) {
            console.error('Error fetching user profile:', error);
            return null;
        }
        
        if (data) {
            console.log('✅ Profile found:', data);
            return data;
        }
        
        console.log('⚠️ No profile found, creating one...');
        const user = await getCurrentUser();
        if (!user) return null;
        
        const newProfile = {
            id: userId,
            name: user.user_metadata?.name || 'User',
            username: user.user_metadata?.username || `user_${Date.now()}`,
            email: user.email,
            role: 'user',
            wallet_balance: 0,
            gp_points: 0,
            status: 'active',
            plan: 'basic',
            application_status: 'none'
        };
        
        const { error: insertError } = await supabase
            .from('user_profiles')
            .upsert(newProfile, { onConflict: 'id' });
        
        if (insertError) {
            console.error('❌ Failed to create profile:', insertError);
            return null;
        }
        
        console.log('✅ Profile created successfully');
        return newProfile;
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
            .from('user_profiles')
            .update(updates)
            .eq('id', user.id)
            .select()
            .maybeSingle();
        
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
        .from('user_profiles')
        .update({ wallet_balance: newBalance })
        .eq('id', user.id);
    
    if (error) {
        console.error('Error updating wallet:', error);
        return false;
    }
    return true;
}

// ============================================
// SECTION 3: USER ALERTS
// ============================================

export async function getUserAlerts(userId) {
    try {
        const { data, error } = await supabase
            .from('user_alerts')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            if (error.code === '42P01' || error.code === 'PGRST205') {
                console.warn('user_alerts table not found, returning empty array');
                return [];
            }
            throw error;
        }

        return data || [];
    } catch (error) {
        console.error('Error getting user alerts:', error);
        return [];
    }
}

export async function createUserAlert(alertData) {
    try {
        const { data, error } = await supabase
            .from('user_alerts')
            .insert([{
                user_id: alertData.user_id,
                icon: alertData.icon || '📌',
                message: alertData.message,
                link: alertData.link || null,
                type: alertData.type || 'info',
                read: false,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) {
            if (error.code === '42P01' || error.code === 'PGRST205') {
                console.warn('user_alerts table not found, returning mock alert');
                return { ...alertData, id: `mock_${Date.now()}` };
            }
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Error creating user alert:', error);
        return null;
    }
}

export async function markAlertRead(alertId) {
    try {
        const { error } = await supabase
            .from('user_alerts')
            .update({ read: true })
            .eq('id', alertId);

        if (error) {
            if (error.code === '42P01' || error.code === 'PGRST205') {
                return true;
            }
            throw error;
        }

        return true;
    } catch (error) {
        console.error('Error marking alert read:', error);
        return false;
    }
}

export async function markAllAlertsRead(userId) {
    try {
        const { error } = await supabase
            .from('user_alerts')
            .update({ read: true })
            .eq('user_id', userId)
            .eq('read', false);

        if (error) {
            if (error.code === '42P01' || error.code === 'PGRST205') {
                return true;
            }
            throw error;
        }

        return true;
    } catch (error) {
        console.error('Error marking all alerts read:', error);
        return false;
    }
}

// ============================================
// SECTION 4: USER ACTIVITY
// ============================================

export async function logUserActivity(activityData) {
    try {
        const { data, error } = await supabase
            .from('user_activity')
            .insert([{
                user_id: activityData.user_id,
                activity_type: activityData.activity_type,
                gp_earned: activityData.gp_earned || 0,
                reference_id: activityData.reference_id || null,
                description: activityData.description || null,
                metadata: activityData.metadata || null,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) {
            if (error.code === '42P01' || error.code === 'PGRST205') {
                console.warn('user_activity table not found, skipping log');
                return null;
            }
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Error logging user activity:', error);
        return null;
    }
}

export async function getUserActivity(userId, limit = 20) {
    try {
        const { data, error } = await supabase
            .from('user_activity')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            if (error.code === '42P01' || error.code === 'PGRST205') {
                return [];
            }
            throw error;
        }

        return data || [];
    } catch (error) {
        console.error('Error getting user activity:', error);
        return [];
    }
}

// ============================================
// SECTION 5: APPLICATIONS
// ============================================

export async function submitApplication(applicationData) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return { success: false, error: 'User not authenticated' };
        }

        const { data: existing, error: checkError } = await supabase
            .from('applications')
            .select('id, status')
            .eq('user_id', user.id)
            .eq('status', 'pending')
            .maybeSingle();

        if (existing) {
            return { success: false, error: 'You already have a pending application' };
        }

        const applicationId = `app_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
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
        
        await supabase
            .from('user_profiles')
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
        const user = await getCurrentUser();
        if (!user) return [];
        
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        
        const adminRoles = ['admin', 'founder', 'crm', 'manager'];
        if (!profile || !adminRoles.includes(profile.role)) {
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

export async function approveApplication(applicationId, adminNotes = '') {
    try {
        const user = await getCurrentUser();
        if (!user) return { success: false, error: 'Not authenticated' };
        
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        
        const adminRoles = ['admin', 'founder', 'crm', 'manager'];
        if (!profile || !adminRoles.includes(profile.role)) {
            return { success: false, error: 'Unauthorized' };
        }
        
        const { data: application, error: appError } = await supabase
            .from('applications')
            .select('*')
            .eq('id', applicationId)
            .maybeSingle();
        
        if (appError || !application) {
            return { success: false, error: 'Application not found' };
        }
        
        const { error: updateAppError } = await supabase
            .from('applications')
            .update({ 
                status: 'approved', 
                approved_at: new Date().toISOString(),
                admin_notes: adminNotes || 'Application approved'
            })
            .eq('id', applicationId);
        
        if (updateAppError) throw updateAppError;
        
        const { error: updateUserError } = await supabase
            .from('user_profiles')
            .update({ 
                role: application.role,
                application_status: 'approved'
            })
            .eq('id', application.user_id);
        
        if (updateUserError) throw updateUserError;

        await createUserAlert({
            user_id: application.user_id,
            icon: '🎓',
            message: `Your application to become a ${application.role} was approved!`,
            type: 'success'
        });
        
        return { success: true };
    } catch (error) {
        console.error('Application approval error:', error);
        return { success: false, error: error.message };
    }
}

export async function rejectApplication(applicationId, adminNotes = '') {
    try {
        const user = await getCurrentUser();
        if (!user) return { success: false, error: 'Not authenticated' };
        
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        
        const adminRoles = ['admin', 'founder', 'crm', 'manager'];
        if (!profile || !adminRoles.includes(profile.role)) {
            return { success: false, error: 'Unauthorized' };
        }
        
        const { data: application, error: appError } = await supabase
            .from('applications')
            .select('user_id, role')
            .eq('id', applicationId)
            .maybeSingle();
        
        if (appError || !application) {
            return { success: false, error: 'Application not found' };
        }
        
        const { error: updateAppError } = await supabase
            .from('applications')
            .update({ 
                status: 'rejected', 
                rejected_at: new Date().toISOString(),
                admin_notes: adminNotes || 'Application rejected'
            })
            .eq('id', applicationId);
        
        if (updateAppError) throw updateAppError;
        
        const { error: updateUserError } = await supabase
            .from('user_profiles')
            .update({ 
                application_status: 'rejected'
            })
            .eq('id', application.user_id);
        
        if (updateUserError) throw updateUserError;

        await createUserAlert({
            user_id: application.user_id,
            icon: '📋',
            message: `Your application to become a ${application.role} was reviewed. Check your dashboard for details.`,
            type: 'info'
        });
        
        return { success: true };
    } catch (error) {
        console.error('Application rejection error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// SECTION 6: PAYMENTS & TRANSACTIONS
// ============================================

export async function createPaymentRequest(amount, bank, referenceCode) {
    try {
        const user = await getCurrentUser();
        const profile = await getUserProfile();
        if (!user || !profile) return { success: false, error: 'User not found' };
        
        const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        const { data, error } = await supabase
            .from('payment_requests')
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
    } catch (error) {
        console.error('Payment creation error:', error);
        return { success: false, error: error.message };
    }
}

export async function getUserPaymentRequests() {
    const user = await getCurrentUser();
    if (!user) return [];
    
    const { data, error } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false });
    
    if (error) {
        console.error('Error fetching payments:', error);
        return [];
    }
    return data;
}

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
            id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
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
// SECTION 7: REFERRALS
// ============================================

export async function getReferralCount(userId) {
    try {
        const { count, error } = await supabase
            .from('referrals')
            .select('id', { count: 'exact' })
            .eq('referrer_id', userId);

        if (error) {
            if (error.code === '42P01') return 0;
            throw error;
        }

        return count || 0;
    } catch (error) {
        console.error('Error getting referral count:', error);
        return 0;
    }
}

export async function createReferral(referrerId, referredUserId, referralCode) {
    try {
        const { error } = await supabase
            .from('referrals')
            .insert([{
                referrer_id: referrerId,
                referred_user_id: referredUserId,
                referral_code: referralCode,
                status: 'active',
                created_at: new Date().toISOString()
            }]);

        if (error) {
            if (error.code === '42P01') {
                console.warn('Referrals table not found, skipping creation');
                return true;
            }
            throw error;
        }

        try {
            const { earnGP } = await import('./progression.js');
            await earnGP(referrerId, 'referral', 10, referredUserId);
        } catch (e) {
            console.warn('Could not award referral GP:', e);
        }

        return true;
    } catch (error) {
        console.error('Error creating referral:', error);
        return false;
    }
}

// ============================================
// SECTION 8: HUB CONTENT (BASIC)
// ============================================

export async function getHubContent(filters = {}) {
    try {
        let query = supabase
            .from('hub_content')
            .select('*')
            .eq('status', 'published')
            .order(filters.sort || 'created_at', { ascending: false });

        if (filters.type && filters.type !== 'all' && filters.type !== 'promoted') {
            query = query.eq('type', filters.type);
        }

        if (filters.type === 'promoted') {
            query = query.eq('is_promoted', true);
        }

        if (filters.limit) {
            query = query.limit(filters.limit);
        }

        if (filters.offset) {
            query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
        }

        if (filters.search && filters.search.trim()) {
            query = query.ilike('title', `%${filters.search.trim()}%`);
        }

        const { data, error } = await query;
        
        if (error) {
            if (error.code === '42P01') {
                console.warn('Hub content table not found, returning empty array');
                return [];
            }
            throw error;
        }

        return data || [];
    } catch (error) {
        console.error('Error getting hub content:', error);
        return [];
    }
}

// ============================================
// SECTION 9: REAL-TIME SUBSCRIPTIONS
// ============================================

export function subscribeToWallet(callback) {
    const user = getCurrentUser();
    if (!user) return null;
    
    return supabase
        .channel('wallet_changes')
        .on('postgres_changes', 
            { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'user_profiles',
                filter: `id=eq.${user.id}` 
            },
            (payload) => {
                if (payload.new) {
                    callback(payload.new.wallet_balance);
                }
            }
        )
        .subscribe();
}

// ============================================
// EXPORT ALL FUNCTIONS
// ============================================

// Authentication
export { 
    getCurrentUser,
    getCurrentSession,
    signIn,
    signUp,
    signOutUser
};

// User Profiles
export {
    getUserProfile,
    updateUserProfile,
    updateWalletBalance
};

// User Alerts
export {
    getUserAlerts,
    createUserAlert,
    markAlertRead,
    markAllAlertsRead
};

// User Activity
export {
    logUserActivity,
    getUserActivity
};

// Applications
export {
    submitApplication,
    getUserApplications,
    getPendingApplications,
    approveApplication,
    rejectApplication
};

// Payments & Transactions
export {
    createPaymentRequest,
    getUserPaymentRequests,
    getUserTransactions,
    addTransaction
};

// Referrals
export {
    getReferralCount,
    createReferral
};

// Hub Content
export {
    getHubContent
};

// Real-time
export {
    subscribeToWallet
};
