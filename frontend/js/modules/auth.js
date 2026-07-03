// ============================================
// MODULE: AUTH HELPERS
// Path: /frontend/js/modules/auth.js
// Purpose: Reusable auth functions using Supabase Auth
// ============================================

import { supabase } from './supabase.js';

// ============================================
// CONSTANTS
// ============================================

const DOMAIN = 'gliimu.com'; // ✅ CORRECT: Double 'i'

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
// GET USER BY USERNAME
// ============================================

async function getUserByUsername(username) {
    try {
        const cleanUsername = username.trim().toLowerCase();
        
        const { data, error } = await supabase
            .from('user_profiles')
            .select('email, id, username, name, role')
            .ilike('username', cleanUsername)
            .maybeSingle();
        
        if (error) {
            console.error('Username lookup error:', error);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('Username lookup error:', error);
        return null;
    }
}

// ============================================
// GET USER BY EMAIL
// ============================================

async function getUserByEmail(email) {
    try {
        const cleanEmail = email.trim().toLowerCase();
        
        const { data, error } = await supabase
            .from('user_profiles')
            .select('email, id, username, name, role')
            .ilike('email', cleanEmail)
            .maybeSingle();
        
        if (error) {
            console.error('Email lookup error:', error);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('Email lookup error:', error);
        return null;
    }
}

// ============================================
// GET USER BY ID
// ============================================

async function getUserById(userId) {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
        
        if (error) {
            console.error('User ID lookup error:', error);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('User ID lookup error:', error);
        return null;
    }
}

// ============================================
// ENSURE USER PROFILE EXISTS
// ============================================

async function ensureUserProfile(user) {
    try {
        // Check if profile exists
        const { data: existing, error: checkError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
        
        if (checkError) {
            console.error('Error checking profile:', checkError);
            return null;
        }
        
        if (existing) {
            return existing;
        }
        
        // Create profile if it doesn't exist
        console.log('Creating missing profile for user:', user.id);
        
        const newProfile = {
            id: user.id,
            name: user.user_metadata?.name || 'User',
            username: user.user_metadata?.username || `user_${Date.now()}`,
            email: user.email,
            role: 'user',
            wallet_balance: 25000,
            gp_points: 0,
            status: 'active',
            plan: 'basic',
            application_status: 'none',
            referral_code: `GLM-${Math.random().toString(36).substring(2, 8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
        };
        
        const { error: insertError } = await supabase
            .from('user_profiles')
            .upsert(newProfile, { onConflict: 'id' });
        
        if (insertError) {
            console.error('Failed to create profile:', insertError);
            return null;
        }
        
        console.log('Profile created successfully');
        return newProfile;
    } catch (error) {
        console.error('Ensure profile error:', error);
        return null;
    }
}

// ============================================
// SIGN IN USER
// ============================================

export async function signInUser(usernameOrEmail, password) {
    try {
        const cleanInput = usernameOrEmail.trim();
        let email = cleanInput;
        let isEmail = cleanInput.includes('@');
        let userData = null;
        
        // Find user in user_profiles
        if (!isEmail) {
            userData = await getUserByUsername(cleanInput);
        } else {
            userData = await getUserByEmail(cleanInput);
        }
        
        // If found, use their email
        if (userData) {
            email = userData.email;
        } else if (!isEmail) {
            // Try constructing email with correct domain (gliimu.com - double 'i')
            const possibleEmail = `${cleanInput}@${DOMAIN}`;
            const emailUser = await getUserByEmail(possibleEmail);
            if (emailUser) {
                email = possibleEmail;
                userData = emailUser;
            } else {
                // Try signing in directly with constructed email
                const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                    email: `${cleanInput}@${DOMAIN}`,
                    password: password
                });
                
                if (authError) {
                    return {
                        success: false,
                        error: 'User not found. Please check your username.'
                    };
                }
                
                // Ensure profile exists
                const profile = await ensureUserProfile(authData.user);
                
                if (!profile) {
                    return {
                        success: false,
                        error: 'User profile could not be created.'
                    };
                }
                
                // Build user object
                const user = {
                    id: authData.user.id,
                    name: profile.name || cleanInput,
                    email: authData.user.email,
                    username: profile.username || cleanInput,
                    role: profile.role || 'user',
                    plan: profile.plan || 'basic',
                    walletBalance: profile.wallet_balance || 25000,
                    gpPoints: profile.gp_points || 0,
                    address: profile.address || '',
                    applicationStatus: profile.application_status || 'none',
                    appliedRole: profile.applied_role || null,
                    avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || cleanInput)}&background=fbb040&color=fff`
                };
                
                localStorage.setItem('glimu_user', JSON.stringify(user));
                
                return { success: true, user, role: user.role };
            }
        } else {
            return {
                success: false,
                error: 'User not found. Please check your credentials.'
            };
        }
        
        // Authenticate with Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            if (error.message === 'Invalid login credentials') {
                return {
                    success: false,
                    error: 'Invalid username or password. Please try again.'
                };
            }
            
            if (error.message.includes('Email not confirmed')) {
                return {
                    success: false,
                    error: 'Please confirm your email before logging in.'
                };
            }
            
            return {
                success: false,
                error: 'Login failed. Please try again.'
            };
        }
        
        // Ensure profile exists
        let profile = await ensureUserProfile(data.user);
        
        // If profile still doesn't exist, try to get it by ID
        if (!profile) {
            profile = await getUserById(data.user.id);
        }
        
        // Build fallback profile if needed
        if (!profile) {
            profile = {
                id: data.user.id,
                name: data.user.user_metadata?.name || cleanInput,
                email: data.user.email,
                username: data.user.user_metadata?.username || cleanInput,
                role: data.user.user_metadata?.role || 'user',
                wallet_balance: 25000,
                gp_points: 0,
                address: '',
                application_status: 'none',
                avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.user.user_metadata?.name || cleanInput)}&background=fbb040&color=fff`
            };
        }
        
        // Build user object
        const user = {
            id: data.user.id,
            name: profile.name || profile.username || cleanInput,
            email: profile.email || email,
            username: profile.username || cleanInput,
            role: profile.role || 'user',
            plan: profile.plan || 'basic',
            walletBalance: profile.wallet_balance || 25000,
            gpPoints: profile.gp_points || 0,
            address: profile.address || '',
            applicationStatus: profile.application_status || 'none',
            appliedRole: profile.applied_role || null,
            avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || cleanInput)}&background=fbb040&color=fff`
        };
        
        // Store in localStorage
        localStorage.setItem('glimu_user', JSON.stringify(user));
        
        return { success: true, user, role: user.role };
        
    } catch (error) {
        console.error('Sign in error:', error);
        return { success: false, error: 'Invalid username or password' };
    }
}

// ============================================
// SIGN UP USER
// ============================================

export async function signUpUser(email, password, userData) {
    try {
        // Create user in Supabase Auth
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
        
        // Create user profile using upsert
        if (data.user) {
            const profileData = {
                id: data.user.id,
                name: userData.name,
                username: userData.username.toLowerCase(),
                email: email.toLowerCase(),
                role: 'user',
                wallet_balance: 25000,
                gp_points: 0,
                status: 'active',
                plan: 'basic',
                application_status: 'none',
                birth_day: userData.birthDay || null,
                birth_month: userData.birthMonth || null,
                referral_code: `GLM-${Math.random().toString(36).substring(2, 8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
            };
            
            // Use upsert to avoid 409 conflict
            const { error: upsertError } = await supabase
                .from('user_profiles')
                .upsert(profileData, { 
                    onConflict: 'id',
                    ignoreDuplicates: false 
                });

            if (upsertError) {
                console.error('Profile creation error:', upsertError);
                return { success: false, error: 'Failed to create user profile' };
            }
        }
        
        return { success: true, user: data.user };
        
    } catch (error) {
        console.error('Sign up error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// SIGN OUT USER
// ============================================

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

// ============================================
// GET CURRENT SESSION
// ============================================

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

// ============================================
// GET CURRENT USER
// ============================================

export async function getCurrentUser() {
    try {
        // Check localStorage first
        const localUser = localStorage.getItem('glimu_user');
        if (localUser) {
            return JSON.parse(localUser);
        }
        
        // Then check Supabase auth
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        
        if (user) {
            // Ensure profile exists and get it
            const profile = await ensureUserProfile(user);
            
            if (profile) {
                const userObject = {
                    id: user.id,
                    name: profile.name || user.user_metadata?.name || 'User',
                    email: user.email,
                    username: profile.username || user.user_metadata?.username || 'user',
                    role: profile.role || 'user',
                    walletBalance: profile.wallet_balance || 25000,
                    gpPoints: profile.gp_points || 0,
                    avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=fbb040&color=fff`
                };
                localStorage.setItem('glimu_user', JSON.stringify(userObject));
                return userObject;
            }
        }
        
        return user;
    } catch (error) {
        console.error('Get user error:', error);
        return null;
    }
}

// ============================================
// RESET PASSWORD
// ============================================

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

// ============================================
// UPDATE PASSWORD
// ============================================

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

        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
        
        if (profileError || !profile) {
            return { success: false, error: 'User profile not found' };
        }

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
        
        const { error: updateError } = await supabase
            .from('user_profiles')
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
        const user = await getCurrentUser();
        if (!user) return [];
        
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        
        if (!profile || profile?.role !== 'admin') {
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
        const user = await getCurrentUser();
        if (!user) return { success: false, error: 'Not authenticated' };
        
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        
        if (!profile || profile?.role !== 'admin') {
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

export async function rejectApplication(applicationId, adminNotes = '') {
    try {
        const user = await getCurrentUser();
        if (!user) return { success: false, error: 'Not authenticated' };
        
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        
        if (!profile || profile?.role !== 'admin') {
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
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
        
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
            .from('user_profiles')
            .update(updates)
            .eq('id', user.id)
            .select()
            .maybeSingle();
        
        if (error) {
            console.error('Error updating user profile:', error);
            return { success: false, error: error.message };
        }
        
        // Update local storage
        const storedUser = localStorage.getItem('glimu_user');
        if (storedUser && data) {
            const updatedUser = { ...JSON.parse(storedUser), ...data };
            localStorage.setItem('glimu_user', JSON.stringify(updatedUser));
        }
        
        return { success: true, data };
    } catch (error) {
        console.error('Profile update error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// EXPORT HELPERS
// ============================================

export { getUserByUsername, getUserByEmail, getUserById };
