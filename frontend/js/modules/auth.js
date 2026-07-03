// ============================================
// MODULE: AUTH HELPERS
// Path: /frontend/js/modules/auth.js
// Purpose: Reusable auth functions - Using Backend API
// ============================================

import { supabase } from './supabase.js';
import { login, register } from './api.js';

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
// AUTH FUNCTIONS - Using Backend API
// ============================================

export async function signInUser(usernameOrEmail, password) {
    try {
        console.log('🔐 Sign in attempt for:', usernameOrEmail);
        
        // ✅ Use your backend API for login
        const result = await login(usernameOrEmail, password);
        
        if (!result.success) {
            console.error('❌ Login failed:', result.message);
            return { 
                success: false, 
                error: result.message || 'Invalid username or password' 
            };
        }
        
        console.log('✅ Login successful for:', result.user.username);
        
        // Store user data from backend
        const user = {
            id: result.user.id,
            name: `${result.user.firstName} ${result.user.lastName}`,
            firstName: result.user.firstName,
            lastName: result.user.lastName,
            email: result.user.email,
            username: result.user.username,
            role: result.user.role || 'user',
            token: result.token,
            walletBalance: result.user.walletBalance || 25000,
            gpPoints: result.user.gpPoints || 0,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(result.user.firstName + ' ' + result.user.lastName)}&background=fbb040&color=fff`
        };
        
        // Store in localStorage
        localStorage.setItem('glimu_user', JSON.stringify(user));
        
        // ✅ Also sync with Supabase user_profiles (if needed)
        try {
            await syncUserToSupabase(user);
        } catch (syncError) {
            console.warn('⚠️ Supabase sync warning:', syncError);
        }
        
        console.log('✅ Login complete, user stored');
        return { success: true, user, role: user.role };
        
    } catch (error) {
        console.error('❌ Sign in error:', error);
        return { success: false, error: error.message || 'Invalid username or password' };
    }
}

export async function signUpUser(email, password, userData) {
    try {
        console.log('📝 Sign up attempt for:', email);
        
        // Parse full name
        const nameParts = userData.name.split(' ');
        const firstName = nameParts[0] || 'User';
        const lastName = nameParts.slice(1).join(' ') || 'User';
        
        // ✅ Use your backend API for registration
        const result = await register({
            firstName: firstName,
            lastName: lastName,
            email: email,
            password: password,
            phone: userData.phone || '',
            role: 'Student'  // Default role on signup
        });
        
        if (!result.success) {
            console.error('❌ Registration failed:', result.message);
            return { success: false, error: result.message };
        }
        
        console.log('✅ Registration successful for:', result.user.username);
        
        // Store user data from backend
        const user = {
            id: result.user.id,
            name: `${result.user.firstName} ${result.user.lastName}`,
            firstName: result.user.firstName,
            lastName: result.user.lastName,
            email: result.user.email,
            username: result.user.username,
            role: result.user.role || 'user',
            token: result.token,
            walletBalance: result.user.walletBalance || 25000,
            gpPoints: result.user.gpPoints || 0,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(result.user.firstName + ' ' + result.user.lastName)}&background=fbb040&color=fff`
        };
        
        // ✅ Also create user in Supabase user_profiles
        try {
            await createSupabaseUser(user, password);
        } catch (syncError) {
            console.warn('⚠️ Supabase sync warning:', syncError);
        }
        
        return { success: true, user: result.user };
        
    } catch (error) {
        console.error('❌ Sign up error:', error);
        return { success: false, error: error.message };
    }
}

export async function signOutUser() {
    try {
        // Clear Supabase session if exists
        try {
            await supabase.auth.signOut();
        } catch (e) {
            // Ignore supabase signout errors
        }
        
        localStorage.removeItem('glimu_user');
        sessionStorage.clear();
        console.log('✅ Sign out successful');
        return { success: true };
    } catch (error) {
        console.error('❌ Sign out error:', error);
        return { success: false, error: error.message };
    }
}

export async function getCurrentSession() {
    try {
        // Check if user exists in localStorage
        const userStr = localStorage.getItem('glimu_user');
        if (userStr) {
            const user = JSON.parse(userStr);
            return { user: user, session: true };
        }
        return null;
    } catch (error) {
        console.error('❌ Session error:', error);
        return null;
    }
}

export async function getCurrentUser() {
    try {
        const userStr = localStorage.getItem('glimu_user');
        if (userStr) {
            return JSON.parse(userStr);
        }
        return null;
    } catch (error) {
        console.error('❌ Get user error:', error);
        return null;
    }
}

export async function resetPassword(email) {
    try {
        // ✅ Use your backend API for password reset
        const response = await fetch('http://127.0.0.1:3000/api/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to send reset email');
        }
        
        return { success: true };
    } catch (error) {
        console.error('❌ Reset password error:', error);
        return { success: false, error: error.message };
    }
}

export async function updateUserPassword(currentPassword, newPassword) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return { success: false, error: 'Not logged in' };
        }
        
        const response = await fetch('http://127.0.0.1:3000/api/update-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ 
                currentPassword, 
                newPassword 
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to update password');
        }
        
        return { success: true };
    } catch (error) {
        console.error('❌ Update password error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// SUPABASE SYNC FUNCTIONS
// ============================================

async function syncUserToSupabase(user) {
    try {
        // Check if user exists in user_profiles
        const { data: existing } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();
        
        if (existing) {
            // Update existing
            await supabase
                .from('user_profiles')
                .update({
                    name: user.name,
                    username: user.username,
                    email: user.email,
                    role: user.role || 'user',
                    wallet_balance: user.walletBalance || 25000,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);
        } else {
            // Insert new
            await supabase
                .from('user_profiles')
                .insert([{
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    email: user.email,
                    role: user.role || 'user',
                    wallet_balance: user.walletBalance || 25000,
                    gp_points: 0,
                    status: 'active',
                    plan: 'basic',
                    application_status: 'none',
                    referral_code: `GLM-${Math.random().toString(36).substring(2, 8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
                }]);
        }
    } catch (error) {
        console.warn('⚠️ Supabase sync error:', error);
        // Don't throw - this is non-critical
    }
}

async function createSupabaseUser(user, password) {
    try {
        // Create auth user in Supabase
        const { data, error } = await supabase.auth.signUp({
            email: user.email,
            password: password,
            options: {
                data: {
                    name: user.name,
                    username: user.username,
                    role: 'user'
                }
            }
        });
        
        if (error) {
            console.warn('⚠️ Supabase auth creation error:', error);
        }
        
        // Create user_profiles entry
        const { error: insertError } = await supabase
            .from('user_profiles')
            .insert([{
                id: data?.user?.id || user.id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: 'user',
                wallet_balance: user.walletBalance || 25000,
                gp_points: 0,
                status: 'active',
                plan: 'basic',
                application_status: 'none',
                referral_code: `GLM-${Math.random().toString(36).substring(2, 8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
            }]);
        
        if (insertError && insertError.code !== '23505') {
            console.warn('⚠️ Profile creation warning:', insertError);
        }
    } catch (error) {
        console.warn('⚠️ Supabase user creation error:', error);
        // Don't throw - this is non-critical
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
        
        const response = await fetch('http://127.0.0.1:3000/api/apply-role', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ 
                role, 
                ...additionalData 
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to submit application');
        }
        
        return { success: true, applicationId: data.applicationId };
        
    } catch (error) {
        console.error('❌ Application submission error:', error);
        return { success: false, error: error.message };
    }
}

export async function getUserApplications() {
    try {
        const user = await getCurrentUser();
        if (!user) return [];
        
        const response = await fetch('http://127.0.0.1:3000/api/applications', {
            headers: {
                'Authorization': `Bearer ${user.token}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch applications');
        }
        
        return data.applications || [];
        
    } catch (error) {
        console.error('❌ Applications fetch error:', error);
        return [];
    }
}

export async function getPendingApplications() {
    try {
        const user = await getCurrentUser();
        if (!user) return [];
        
        const response = await fetch('http://127.0.0.1:3000/api/pending-applications', {
            headers: {
                'Authorization': `Bearer ${user.token}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch pending applications');
        }
        
        return data.applications || [];
        
    } catch (error) {
        console.error('❌ Pending applications fetch error:', error);
        return [];
    }
}

export async function approveApplication(applicationId, adminNotes = '') {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }
        
        const response = await fetch('http://127.0.0.1:3000/api/approve-application', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ applicationId, adminNotes })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to approve application');
        }
        
        return { success: true };
    } catch (error) {
        console.error('❌ Application approval error:', error);
        return { success: false, error: error.message };
    }
}

export async function rejectApplication(applicationId, adminNotes = '') {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }
        
        const response = await fetch('http://127.0.0.1:3000/api/reject-application', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ applicationId, adminNotes })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to reject application');
        }
        
        return { success: true };
    } catch (error) {
        console.error('❌ Application rejection error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// USER PROFILE FUNCTIONS
// ============================================

export async function getUserProfile(userId = null) {
    try {
        const user = await getCurrentUser();
        if (!user) return null;
        
        // Try to get from Supabase user_profiles first
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', userId || user.id)
            .maybeSingle();
        
        if (error) {
            console.warn('⚠️ Supabase profile fetch error:', error);
        }
        
        if (data) {
            return data;
        }
        
        // Fallback to user data from localStorage
        return {
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email,
            role: user.role || 'user',
            wallet_balance: user.walletBalance || 25000,
            gp_points: user.gpPoints || 0,
            avatar_url: user.avatar || null
        };
        
    } catch (error) {
        console.error('❌ Profile fetch error:', error);
        return null;
    }
}

export async function updateUserProfile(updates) {
    try {
        const user = await getCurrentUser();
        if (!user) return { success: false, error: 'No user logged in' };
        
        // Update in Supabase user_profiles
        const { data, error } = await supabase
            .from('user_profiles')
            .update(updates)
            .eq('id', user.id)
            .select()
            .maybeSingle();
        
        if (error) {
            console.warn('⚠️ Supabase update error:', error);
        }
        
        // Update localStorage
        const storedUser = JSON.parse(localStorage.getItem('glimu_user'));
        if (storedUser) {
            const updatedUser = { ...storedUser, ...updates };
            localStorage.setItem('glimu_user', JSON.stringify(updatedUser));
        }
        
        return { success: true, data };
        
    } catch (error) {
        console.error('❌ Profile update error:', error);
        return { success: false, error: error.message };
    }
}
