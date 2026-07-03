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
        console.log('🔍 Looking up username:', cleanUsername);
        
        const { data, error } = await supabase
            .from('user_profiles')
            .select('email, id, username, name, role')
            .ilike('username', cleanUsername)
            .maybeSingle();
        
        if (error) {
            console.error('Username lookup error:', error);
            return null;
        }
        
        if (data) {
            console.log('✅ Found user by username:', data.username);
        } else {
            console.log('❌ No user found with username:', cleanUsername);
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
        console.log('🔍 Looking up email:', cleanEmail);
        
        const { data, error } = await supabase
            .from('user_profiles')
            .select('email, id, username, name, role')
            .ilike('email', cleanEmail)
            .maybeSingle();
        
        if (error) {
            console.error('Email lookup error:', error);
            return null;
        }
        
        if (data) {
            console.log('✅ Found user by email:', data.email);
        } else {
            console.log('❌ No user found with email:', cleanEmail);
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
// SIGN IN USER
// ============================================

export async function signInUser(usernameOrEmail, password) {
    try {
        console.log('🔐 Login attempt for:', usernameOrEmail);
        
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
            console.log('✅ User found in profiles, using email:', email);
        } else if (!isEmail) {
            // Try constructing email with correct domain (gliimu.com - double 'i')
            const possibleEmail = `${cleanInput}@${DOMAIN}`;
            console.log('🔍 Trying constructed email:', possibleEmail);
            const emailUser = await getUserByEmail(possibleEmail);
            if (emailUser) {
                email = possibleEmail;
                userData = emailUser;
                console.log('✅ Found via constructed email');
            } else {
                console.log('❌ User not found in profiles');
                return {
                    success: false,
                    error: 'User not found. Please check your username.'
                };
            }
        } else {
            console.log('❌ Email not found');
            return {
                success: false,
                error: 'User not found. Please check your credentials.'
            };
        }
        
        // Authenticate with Supabase Auth
        console.log('🔑 Authenticating with email:', email);
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            console.error('❌ Auth error:', error);
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
        
        console.log('✅ Auth successful for user:', data.user.id);
        
        // Fetch full user profile
        let profile = userData;
        
        if (!profile || profile.id !== data.user.id) {
            const { data: fullProfile, error: profileError } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', data.user.id)
                .maybeSingle();
            
            if (!profileError && fullProfile) {
                profile = fullProfile;
                console.log('✅ Full profile fetched');
            }
        }
        
        // If still no profile, try to get it by ID
        if (!profile) {
            profile = await getUserById(data.user.id);
            if (profile) console.log('✅ Profile fetched by ID');
        }
        
        // Build fallback profile if needed
        if (!profile) {
            console.log('⚠️ No profile found, building fallback');
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
        console.log('✅ User stored in localStorage');
        
        return { success: true, user, role: user.role };
        
    } catch (error) {
        console.error('❌ Sign in error:', error);
        return { success: false, error: 'Invalid username or password' };
    }
}

// ============================================
// SIGN UP USER
// ============================================

export async function signUpUser(email, password, userData) {
    try {
        console.log('📝 Sign up attempt for:', email);
        
        // ✅ CREATE USER IN SUPABASE AUTH
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
            console.error('❌ Sign up error:', error);
            return { success: false, error: error.message };
        }
        
        console.log('✅ Auth user created:', data.user.id);
        
        // ✅ CREATE USER PROFILE USING UPSERT
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
            
            console.log('📝 Creating profile:', profileData);
            
            // ✅ Use upsert to avoid 409 conflict
            const { error: upsertError } = await supabase
                .from('user_profiles')
                .upsert(profileData, { 
                    onConflict: 'id',
                    ignoreDuplicates: false 
                });

            if (upsertError) {
                console.error('❌ Profile creation error:', upsertError);
                return { success: false, error: 'Failed to create user profile' };
            }
            
            console.log('✅ Profile created successfully');
            
            // Verify the profile was created
            const { data: verifyData, error: verifyError } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', data.user.id)
                .maybeSingle();
            
            if (verifyError) {
                console.warn('⚠️ Profile verification failed:', verifyError);
            } else if (verifyData) {
                console.log('✅ Profile verified:', verifyData);
            } else {
                console.warn('⚠️ Profile not found after creation');
            }
        }
        
        return { success: true, user: data.user };
        
    } catch (error) {
        console.error('❌ Sign up error:', error);
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
        console.log('✅ User signed out');
        return { success: true };
    } catch (error) {
        console.error('❌ Sign out error:', error);
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
        console.error('❌ Session error:', error);
        return null;
    }
}

// ============================================
// GET CURRENT USER
// ============================================

export async function getCurrentUser() {
    try {
        const localUser = localStorage.getItem('glimu_user');
        if (localUser) {
            return JSON.parse(localUser);
        }
        
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        return user;
    } catch (error) {
        console.error('❌ Get user error:', error);
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
        console.error('❌ Reset password error:', error);
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
        console.error('❌ Update password error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// EXPORT HELPERS
// ============================================

export { getUserByUsername, getUserByEmail, getUserById };
