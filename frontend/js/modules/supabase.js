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
                    wallet_balance: 25000,
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

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Sign out error:', error);
        return false;
    }
    return true;
}

// ============================================
// REFERRALS
// ============================================

/**
 * Get user's referrals (people who used their referral link)
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} - Array of referral objects
 */
export async function getUserReferrals(userId) {
    try {
        const { data, error } = await supabase
            .from('referrals')
            .select(`
                id,
                referred_user_id,
                referred_user:referred_user_id (
                    name,
                    email,
                    created_at
                ),
                created_at,
                status
            `)
            .eq('referrer_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            // If table doesn't exist, return empty array
            if (error.code === '42P01') {
                console.warn('Referrals table not found, returning empty array');
                return [];
            }
            throw error;
        }

        return data || [];
    } catch (error) {
        console.error('Error getting referrals:', error);
        return [];
    }
}

/**
 * Get referral count for a user
 * @param {string} userId - The user ID
 * @returns {Promise<number>} - Count of referrals
 */
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

/**
 * Create a referral record when someone signs up using a referral link
 * @param {string} referrerId - The user who referred
 * @param {string} referredUserId - The new user who signed up
 * @param {string} referralCode - The referral code used
 * @returns {Promise<boolean>} - Success status
 */
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

        // Award GP to referrer for successful referral
        // Import earnGP dynamically to avoid circular dependency
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
// USER PROFILE HELPERS
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
            wallet_balance: 25000,
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
        const user = await getCurrentUser();
        if (!user) return { success: false, error: 'Not authenticated' };
        
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        
        if (profile?.role !== 'admin') {
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
                admin_notes: adminNotes
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
        
        return { success: true };
    } catch (error) {
        console.error('Application approval error:', error);
        return { success: false, error: error.message };
    }
}

export async function rejectApplication(applicationId, adminNotes) {
    try {
        const user = await getCurrentUser();
        if (!user) return { success: false, error: 'Not authenticated' };
        
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        
        if (profile?.role !== 'admin') {
            return { success: false, error: 'Unauthorized' };
        }
        
        const { error: updateAppError } = await supabase
            .from('applications')
            .update({ 
                status: 'rejected', 
                rejected_at: new Date().toISOString(),
                admin_notes: adminNotes
            })
            .eq('id', applicationId);
        
        if (updateAppError) throw updateAppError;
        
        const { data: appData } = await supabase
            .from('applications')
            .select('user_id')
            .eq('id', applicationId)
            .maybeSingle();
        
        if (appData) {
            const { error: updateUserError } = await supabase
                .from('user_profiles')
                .update({ 
                    application_status: 'rejected'
                })
                .eq('id', appData.user_id);
            
            if (updateUserError) throw updateUserError;
        }
        
        return { success: true };
    } catch (error) {
        console.error('Application rejection error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// PAYMENT HELPERS
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
// TRANSACTION HELPERS
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
// LIBRARY HELPERS
// ============================================

export async function saveToShelf(itemId, itemType, itemData) {
    const user = await getCurrentUser();
    if (!user) return false;
    
    const { data: existing } = await supabase
        .from('saved_items')
        .select('id')
        .eq('user_id', user.id)
        .eq('item_id', itemId)
        .maybeSingle();
    
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
// REAL-TIME SUBSCRIPTIONS
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
// HUB CONTENT FUNCTIONS
// ============================================

/**
 * Get hub content with filters
 * @param {Object} filters - Filter options
 * @param {string} filters.type - Content type (book, talk, bundle, portfolio, all)
 * @param {number} filters.limit - Number of items to return
 * @param {number} filters.offset - Offset for pagination
 * @param {string} filters.search - Search query
 * @param {string} filters.sort - Sort field (hearts, created_at, views)
 * @returns {Promise<Array>} - Array of content items
 */
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

/**
 * Get trending content (most hearts)
 * @param {number} limit - Number of items to return
 * @returns {Promise<Array>} - Array of trending content
 */
export async function getTrendingContent(limit = 12) {
    try {
        const { data, error } = await supabase
            .from('hub_content')
            .select('*')
            .eq('status', 'published')
            .order('hearts', { ascending: false })
            .limit(limit);

        if (error) {
            if (error.code === '42P01') return [];
            throw error;
        }
        return data || [];
    } catch (error) {
        console.error('Error getting trending content:', error);
        return [];
    }
}

/**
 * Get promoted content
 * @param {number} limit - Number of items to return
 * @returns {Promise<Array>} - Array of promoted content
 */
export async function getPromotedContent(limit = 6) {
    try {
        const { data, error } = await supabase
            .from('hub_content')
            .select('*')
            .eq('is_promoted', true)
            .eq('status', 'published')
            .order('promoted_until', { ascending: true })
            .limit(limit);

        if (error) {
            if (error.code === '42P01') return [];
            throw error;
        }
        return data || [];
    } catch (error) {
        console.error('Error getting promoted content:', error);
        return [];
    }
}

/**
 * Get content by ID with details
 * @param {string} contentId - Content ID
 * @returns {Promise<Object>} - Content object
 */
export async function getContentDetails(contentId) {
    try {
        const { data, error } = await supabase
            .from('hub_content')
            .select('*')
            .eq('id', contentId)
            .single();

        if (error) {
            if (error.code === '42P01') return null;
            throw error;
        }

        if (data) {
            // Increment views
            await supabase
                .from('hub_content')
                .update({ views: (data.views || 0) + 1 })
                .eq('id', contentId);

            // Log view
            try {
                const user = await getCurrentUser();
                await supabase
                    .from('content_views')
                    .insert({
                        content_id: contentId,
                        user_id: user?.id || null,
                        viewed_at: new Date().toISOString()
                    });
            } catch (e) {
                console.warn('Could not log view:', e);
            }
        }

        return data;
    } catch (error) {
        console.error('Error getting content details:', error);
        return null;
    }
}

/**
 * Get content by author
 * @param {string} authorId - Author user ID
 * @returns {Promise<Array>} - Array of content items
 */
export async function getContentByAuthor(authorId) {
    try {
        const { data, error } = await supabase
            .from('hub_content')
            .select('*')
            .eq('author_id', authorId)
            .eq('status', 'published')
            .order('created_at', { ascending: false });

        if (error) {
            if (error.code === '42P01') return [];
            throw error;
        }
        return data || [];
    } catch (error) {
        console.error('Error getting content by author:', error);
        return [];
    }
}

// ============================================
// HUB COMMENT FUNCTIONS
// ============================================

/**
 * Get comments for content
 * @param {string} contentId - Content ID
 * @returns {Promise<Array>} - Array of comments
 */
export async function getComments(contentId) {
    try {
        const { data, error } = await supabase
            .from('hub_comments')
            .select('*')
            .eq('content_id', contentId)
            .order('created_at', { ascending: true });

        if (error) {
            if (error.code === '42P01') return [];
            throw error;
        }
        return data || [];
    } catch (error) {
        console.error('Error getting comments:', error);
        return [];
    }
}

/**
 * Add a comment
 * @param {Object} commentData - Comment data
 * @param {string} commentData.content_id - Content ID
 * @param {string} commentData.user_id - User ID
 * @param {string} commentData.author - Author name
 * @param {string} commentData.author_avatar - Author avatar URL
 * @param {string} commentData.content - Comment text
 * @returns {Promise<Object>} - Result object
 */
export async function addComment(commentData) {
    try {
        const { data, error } = await supabase
            .from('hub_comments')
            .insert({
                content_id: commentData.content_id,
                user_id: commentData.user_id,
                author: commentData.author,
                author_avatar: commentData.author_avatar,
                content: commentData.content,
                created_at: new Date().toISOString()
            })
            .select();

        if (error) {
            if (error.code === '42P01') {
                return { success: false, error: 'Comments table not found' };
            }
            throw error;
        }

        return { success: true, data: data?.[0] };
    } catch (error) {
        console.error('Error adding comment:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// HUB INTERACTION FUNCTIONS
// ============================================

/**
 * Heart/unheart content
 * @param {string} contentId - Content ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Result with new heart count
 */
export async function heartContent(contentId, userId) {
    try {
        // Check if already hearted
        const { data: existing, error: checkError } = await supabase
            .from('user_hearts')
            .select('id')
            .eq('user_id', userId)
            .eq('content_id', contentId)
            .maybeSingle();

        if (checkError && checkError.code !== '42P01') {
            throw checkError;
        }

        if (existing) {
            // Remove heart
            const { error } = await supabase
                .from('user_hearts')
                .delete()
                .eq('user_id', userId)
                .eq('content_id', contentId);

            if (error) throw error;

            // Get updated count
            const { data: content } = await supabase
                .from('hub_content')
                .select('hearts')
                .eq('id', contentId)
                .single();

            return { success: true, hearts: content?.hearts || 0, action: 'unheart' };
        } else {
            // Add heart
            const { error } = await supabase
                .from('user_hearts')
                .insert({ user_id: userId, content_id: contentId, created_at: new Date().toISOString() });

            if (error) throw error;

            // Get updated count
            const { data: content } = await supabase
                .from('hub_content')
                .select('hearts, author_id')
                .eq('id', contentId)
                .single();

            // Check if content reached 12 hearts (trending threshold)
            if ((content?.hearts || 0) >= 12 && content?.author_id) {
                // Award bonus GP to creator
                try {
                    await supabase
                        .from('user_profiles')
                        .update({ gp_points: supabase.raw('gp_points + 5') })
                        .eq('id', content.author_id);
                } catch (e) {
                    console.warn('Could not award trending bonus:', e);
                }
            }

            return { success: true, hearts: content?.hearts || 0, action: 'heart' };
        }
    } catch (error) {
        console.error('Error hearting content:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Save/unsave content
 * @param {string} contentId - Content ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Result
 */
export async function saveContent(contentId, userId) {
    try {
        const { data, error } = await supabase
            .from('user_saved_content')
            .insert({ user_id: userId, content_id: contentId, created_at: new Date().toISOString() })
            .select();

        if (error) {
            if (error.code === '42P01') {
                return { success: false, error: 'Saved content table not found' };
            }
            throw error;
        }

        // Update saves count
        await supabase
            .from('hub_content')
            .update({ saves_count: supabase.raw('saves_count + 1') })
            .eq('id', contentId);

        return { success: true, data: data?.[0] };
    } catch (error) {
        console.error('Error saving content:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Unsave content
 * @param {string} contentId - Content ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Result
 */
export async function unsaveContent(contentId, userId) {
    try {
        const { error } = await supabase
            .from('user_saved_content')
            .delete()
            .eq('user_id', userId)
            .eq('content_id', contentId);

        if (error) {
            if (error.code === '42P01') {
                return { success: false, error: 'Saved content table not found' };
            }
            throw error;
        }

        // Update saves count
        await supabase
            .from('hub_content')
            .update({ saves_count: supabase.raw('saves_count - 1') })
            .eq('id', contentId);

        return { success: true };
    } catch (error) {
        console.error('Error unsaving content:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// STAR FUNCTIONS
// ============================================

/**
 * Get user's star balance (available stars)
 * @param {string} userId - User ID
 * @returns {Promise<number>} - Available stars
 */
export async function getStarBalance(userId) {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('stars_available')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            console.warn('Error getting star balance:', error);
            return 0;
        }
        return data?.stars_available || 0;
    } catch (error) {
        console.error('Error getting star balance:', error);
        return 0;
    }
}

/**
 * Get user's total stars earned
 * @param {string} userId - User ID
 * @returns {Promise<number>} - Total stars earned
 */
export async function getStarsEarned(userId) {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('stars_earned')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            console.warn('Error getting stars earned:', error);
            return 0;
        }
        return data?.stars_earned || 0;
    } catch (error) {
        console.error('Error getting stars earned:', error);
        return 0;
    }
}

/**
 * Convert GP to Stars (1,000 GP = 1 Star)
 * @param {string} userId - User ID
 * @param {number} gpAmount - Amount of GP to convert
 * @returns {Promise<number>} - Stars converted
 */
export async function convertGpToStars(userId, gpAmount) {
    try {
        const { data, error } = await supabase
            .rpc('convert_gp_to_stars', {
                p_user_id: userId,
                p_amount: gpAmount
            });

        if (error) {
            console.warn('Error converting GP to stars:', error);
            return 0;
        }
        return data || 0;
    } catch (error) {
        console.error('Error converting GP to stars:', error);
        return 0;
    }
}

/**
 * Use stars for promotion
 * @param {string} userId - User ID
 * @param {string} contentId - Content ID
 * @param {string} promotionType - Type of promotion
 * @param {number} starCost - Cost in stars
 * @returns {Promise<Object>} - Result
 */
export async function useStarsForPromotion(userId, contentId, promotionType, starCost) {
    try {
        // Check if user has enough stars
        const balance = await getStarBalance(userId);
        if (balance < starCost) {
            return { success: false, error: 'Not enough stars' };
        }

        // Use the RPC function
        const { data, error } = await supabase
            .rpc('use_stars_for_promotion', {
                p_user_id: userId,
                p_content_id: contentId,
                p_promotion_type: promotionType,
                p_stars_cost: starCost
            });

        if (error) {
            console.warn('Error using stars for promotion:', error);
            return { success: false, error: error.message };
        }
        return { success: data || false };
    } catch (error) {
        console.error('Error using stars for promotion:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get star transactions history
 * @param {string} userId - User ID
 * @param {number} limit - Number of transactions to return
 * @returns {Promise<Array>} - Array of transactions
 */
export async function getStarTransactions(userId, limit = 20) {
    try {
        const { data, error } = await supabase
            .from('user_stars_transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            if (error.code === '42P01') return [];
            throw error;
        }
        return data || [];
    } catch (error) {
        console.error('Error getting star transactions:', error);
        return [];
    }
}

// ============================================
// AMBASSADOR FUNCTIONS
// ============================================

/**
 * Check if user is an ambassador
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Is ambassador
 */
export async function getAmbassadorStatus(userId) {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('ambassador_status, progress, stars_earned')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            console.warn('Error getting ambassador status:', error);
            return false;
        }
        
        // User is ambassador if status is true OR progress >= 100 AND stars_earned >= 5
        const isAmbassador = data?.ambassador_status || 
            (data?.progress >= 100 && data?.stars_earned >= 5);
        
        return isAmbassador;
    } catch (error) {
        console.error('Error getting ambassador status:', error);
        return false;
    }
}

/**
 * Claim free promotion (ambassador perk - 24 hours)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Result
 */
export async function claimFreePromotion(userId) {
    try {
        // Check if already claimed recently
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('promotion_claimed_at')
            .eq('id', userId)
            .maybeSingle();

        if (profile?.promotion_claimed_at) {
            const claimedDate = new Date(profile.promotion_claimed_at);
            const now = new Date();
            const diffHours = (now - claimedDate) / (1000 * 60 * 60);
            
            if (diffHours < 168) { // 7 days cooldown
                return { success: false, error: 'You can only claim once per week' };
            }
        }

        // Get user's best content to promote (most hearts)
        const { data: content } = await supabase
            .from('hub_content')
            .select('id')
            .eq('author_id', userId)
            .eq('status', 'published')
            .order('hearts', { ascending: false })
            .limit(1);

        if (!content || content.length === 0) {
            return { success: false, error: 'Create some content first!' };
        }

        // Update content as promoted
        const promotedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        
        await supabase
            .from('hub_content')
            .update({
                is_promoted: true,
                promoted_until: promotedUntil,
                promotion_type: 'ambassador_free'
            })
            .eq('id', content[0].id);

        // Update profile
        await supabase
            .from('user_profiles')
            .update({ promotion_claimed_at: new Date().toISOString() })
            .eq('id', userId);

        return { success: true, contentId: content[0].id };
    } catch (error) {
        console.error('Error claiming free promotion:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// CREATE CONTENT
// ============================================

/**
 * Create new content
 * @param {Object} contentData - Content data
 * @param {string} contentData.type - Content type (book, talk, bundle, portfolio)
 * @param {string} contentData.title - Content title
 * @param {string} contentData.description - Content description
 * @param {Array} contentData.tags - Array of tags
 * @param {string} contentData.image_url - Cover image URL
 * @param {string} contentData.content_url - Content URL (optional)
 * @param {string} contentData.author_id - Author user ID
 * @param {string} contentData.author - Author name
 * @param {string} contentData.author_avatar - Author avatar URL
 * @returns {Promise<Object>} - Result
 */
export async function createContent(contentData) {
    try {
        const { data, error } = await supabase
            .from('hub_content')
            .insert({
                title: contentData.title,
                description: contentData.description,
                type: contentData.type,
                tags: contentData.tags || [],
                image_url: contentData.image_url || null,
                content_url: contentData.content_url || null,
                author_id: contentData.author_id,
                author: contentData.author,
                author_avatar: contentData.author_avatar || null,
                status: 'published',
                gp_reward: contentData.type === 'portfolio' ? 50 : 25,
                created_at: new Date().toISOString(),
                published_at: new Date().toISOString()
            })
            .select();

        if (error) {
            if (error.code === '42P01') {
                return { success: false, error: 'Content table not found' };
            }
            throw error;
        }

        // Award GP to creator
        try {
            await supabase
                .from('user_profiles')
                .update({ gp_points: supabase.raw('gp_points + ' + (contentData.type === 'portfolio' ? 50 : 25)) })
                .eq('id', contentData.author_id);
        } catch (e) {
            console.warn('Could not award GP for content creation:', e);
        }

        return { success: true, data: data?.[0] };
    } catch (error) {
        console.error('Error creating content:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// USER CONTENT FUNCTIONS
// ============================================

/**
 * Get user's saved content IDs
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of content IDs
 */
export async function getUserSavedContent(userId) {
    try {
        const { data, error } = await supabase
            .from('user_saved_content')
            .select('content_id')
            .eq('user_id', userId);

        if (error) {
            if (error.code === '42P01') return [];
            throw error;
        }
        return data || [];
    } catch (error) {
        console.error('Error getting user saved content:', error);
        return [];
    }
}

/**
 * Get user's hearted content IDs
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of content IDs
 */
export async function getUserHeartedContent(userId) {
    try {
        const { data, error } = await supabase
            .from('user_hearts')
            .select('content_id')
            .eq('user_id', userId);

        if (error) {
            if (error.code === '42P01') return [];
            throw error;
        }
        return data || [];
    } catch (error) {
        console.error('Error getting user hearted content:', error);
        return [];
    }
}

// ============================================
// SESSION HELPERS
// ============================================

export async function getCurrentSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error('Error getting session:', error);
        return null;
    }
    return session;
}

export async function signOutUser() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Error signing out:', error);
        return false;
    }
    return true;
}
