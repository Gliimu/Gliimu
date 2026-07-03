// ============================================
// MODULE: AUTH HELPERS
// Path: /frontend/js/modules/auth.js
// Purpose: Reusable auth functions for other modules
// ============================================

import { supabase } from './supabase.js';

// ============================================
// HELPER FUNCTIONS
// ============================================

export function generateUsername(fullName) {
    const cleanName = fullName.toLowerCase().trim();
    const nameParts = cleanName.split(' ');
    let username = nameParts[0];
    
    if (nameParts.length > 1) {
        username += '.' + nameParts.slice(1).join('');
    }
    
    username = username.replace(/[^a-z0-9.]/g, '');
    const randomSuffix = Math.floor(Math.random() * 10000);
    return `${username}${randomSuffix}`;
}

export function generateRecoveryPhrase() {
    const words = [
        'blue', 'ocean', 'golden', 'sunset', 'brave', 'tiger', 'swift', 'eagle',
        'calm', 'river', 'mountain', 'forest', 'storm', 'thunder', 'peace', 'light',
        'shadow', 'dream', 'wonder', 'magic', 'silent', 'wisdom', 'courage', 'honor'
    ];
    
    const phrase = [];
    for (let i = 0; i < 6; i++) {
        const randomIndex = Math.floor(Math.random() * words.length);
        phrase.push(words[randomIndex]);
    }
    return phrase.join('-');
}

// ============================================
// AUTH FUNCTIONS
// ============================================

export async function signInUser(usernameOrEmail, password) {
    try {
        let email = usernameOrEmail;
        let isEmail = usernameOrEmail.includes('@');
        
        // If username, get email from users table
        if (!isEmail) {
            const { data, error } = await supabase
                .from('users')
                .select('email')
                .eq('username', usernameOrEmail)
                .single();
            
            if (error) {
                return { success: false, error: 'User not found' };
            }
            email = data.email;
        }
        
        // Sign in with Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            console.error('Sign in error:', error);
            return { success: false, error: 'Invalid credentials' };
        }
        
        // Get user profile
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', data.user.id)
            .single();
        
        if (profileError) {
            console.error('Profile fetch error:', profileError);
            return { success: false, error: 'User profile not found' };
        }
        
        const user = {
            id: data.user.id,
            name: profile.name,
            email: profile.email,
            username: profile.username,
            role: profile.role || 'user',
            plan: profile.plan || 'basic',
            walletBalance: profile.wallet_balance || 25000,
            gpPoints: profile.gp_points || 0,
            address: profile.address || '',
            applicationStatus: profile.application_status || 'none',
            appliedRole: profile.applied_role || null,
            avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=fbb040&color=fff`
        };
        
        localStorage.setItem('glimu_user', JSON.stringify(user));
        return { success: true, user, role: user.role };
        
    } catch (error) {
        console.error('Sign in error:', error);
        return { success: false, error: error.message };
    }
}

export async function signUpUser(email, password, userData) {
    try {
        // ✅ Only create the auth user - the trigger will handle the profile
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
        
        // ✅ DO NOT manually create the profile here
        // The trigger on auth.users will handle it automatically
        
        return { success: true, user: data.user };
        
    } catch (error) {
        console.error('Sign up error:', error);
        return { success: false, error: error.message };
    }
}

export async function signOutUser() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        
        localStorage.removeItem('glimu_user');
        sessionStorage.clear();
        return { success: true };
    } catch (error) {
        console.error('Sign out error:', error);
        return { success: false, error: error.message };
    }
}

export async function getCurrentSession() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        return session;
    } catch (error) {
        console.error('Session error:', error);
        return null;
    }
}

export async function getCurrentUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        return user;
    } catch (error) {
        console.error('Get user error:', error);
        return null;
    }
}

export async function resetPassword(email) {
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password.html',
        });
        
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Reset password error:', error);
        return { success: false, error: error.message };
    }
}

export async function updateUserPassword(newPassword) {
    try {
        const { error } = await supabase.auth.updateUser({ 
            password: newPassword 
        });
        
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Update password error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// APPLICATION FUNCTIONS
// ============================================

export async function submitRoleApplication(role, additionalData = {}) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return { success: false, error: 'User not authenticated' };
        }

        // Get user profile
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();
        
        if (profileError) {
            return { success: false, error: 'User profile not found' };
        }

        // Check if already applied
        if (profile.application_status === 'pending') {
            return { success: false, error: 'You already have a pending application' };
        }

        const applicationId = `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const application = {
            id: applicationId,
            user_id: user.id,
            full_name: profile.name,
            email: profile.email,
            username: profile.username,
            role: role,
            birth_day: profile.birth_day || null,
            birth_month: profile.birth_month || null,
            status: 'pending',
            submitted_at: new Date().toISOString(),
            ...additionalData
        };
        
        const { error: insertError } = await supabase
            .from('applications')
            .insert([application]);
        
        if (insertError) throw insertError;
        
        // Update user's application status
        const { error: updateError } = await supabase
            .from('users')
            .update({ 
                application_status: 'pending',
                applied_role: role
            })
            .eq('id', user.id);
        
        if (updateError) throw updateError;
        
        return { success: true, applicationId };
        
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
            return { success: false, error: 'Unauthorized' };
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

export async function rejectApplication(applicationId, adminNotes = '') {
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
        const { data: appData } = await supabase
            .from('applications')
            .select('user_id')
            .eq('id', applicationId)
            .single();
        
        if (appData) {
            const { error: updateUserError } = await supabase
                .from('users')
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
// USER PROFILE FUNCTIONS
// ============================================

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
        if (!user) return { success: false, error: 'No user logged in' };
        
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
            return { success: false, error: error.message };
        }
        
        return { success: true, data };
    } catch (error) {
        console.error('Profile update error:', error);
        return { success: false, error: error.message };
    }
}
