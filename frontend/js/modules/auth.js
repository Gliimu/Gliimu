// ============================================
// AUTHENTICATION MODULE - Supabase Integration
// ============================================

import { supabase } from './supabase.js';
import { showToast } from './toast.js';

// Sign in user
export async function signIn(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) throw error;
        
        // Get user profile from database
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', data.user.id)
            .single();
        
        if (profileError) {
            console.error('Profile fetch error:', profileError);
        }
        
        // Store user data in localStorage
        const userData = {
            id: data.user.id,
            email: data.user.email,
            name: profile?.name || data.user.user_metadata?.name || 'User',
            role: profile?.role || 'student',
            plan: profile?.plan || 'basic',
            walletBalance: profile?.wallet_balance || 25000
        };
        
        localStorage.setItem('glimu_user', JSON.stringify(userData));
        localStorage.setItem('supabase_token', data.session.access_token);
        
        showToast(`Welcome back, ${userData.name}!`, 'success');
        
        // Redirect based on role
        setTimeout(() => {
            if (userData.role === 'admin') {
                window.location.href = '/admin-dashboard.html';
            } else {
                window.location.href = '/user';
            }
        }, 1000);
        
        return { success: true, user: userData };
        
    } catch (error) {
        console.error('Sign in error:', error);
        showToast(error.message || 'Invalid email or password', 'error');
        return { success: false, error: error.message };
    }
}

// Sign up user
export async function signUp(name, email, password, confirmPassword) {
    // Validation
    if (!name || !email || !password) {
        showToast('Please fill in all fields', 'error');
        return { success: false };
    }
    
    if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return { success: false };
    }
    
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return { success: false };
    }
    
    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    name: name,
                    role: 'student'
                }
            }
        });
        
        if (error) throw error;
        
        if (data.user) {
            showToast('Account created successfully! Please sign in.', 'success');
            
            // Switch to login form
            setTimeout(() => {
                document.getElementById('signupFormContainer').style.display = 'none';
                document.getElementById('loginFormContainer').style.display = 'block';
            }, 1500);
        }
        
        return { success: true, user: data.user };
        
    } catch (error) {
        console.error('Sign up error:', error);
        showToast(error.message || 'Failed to create account', 'error');
        return { success: false, error: error.message };
    }
}

// Sign out user
export async function signOut() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        
        localStorage.removeItem('glimu_user');
        localStorage.removeItem('supabase_token');
        
        showToast('Signed out successfully', 'success');
        
        setTimeout(() => {
            window.location.href = '/index.html';
        }, 1000);
        
        return { success: true };
        
    } catch (error) {
        console.error('Sign out error:', error);
        showToast('Failed to sign out', 'error');
        return { success: false };
    }
}

// Get current user from localStorage
export function getCurrentUser() {
    const user = localStorage.getItem('glimu_user');
    return user ? JSON.parse(user) : null;
}

// Check if user is authenticated
export function isAuthenticated() {
    return !!getCurrentUser();
}

// Check if user is admin
export function isAdmin() {
    const user = getCurrentUser();
    return user?.role === 'admin';
}

// Get user role
export function getUserRole() {
    const user = getCurrentUser();
    return user?.role || 'student';
}

// Redirect based on authentication status
export function requireAuth() {
    if (!isAuthenticated()) {
        showToast('Please login to continue', 'info');
        setTimeout(() => {
            window.location.href = '/index.html';
        }, 1500);
        return false;
    }
    return true;
}

// Redirect based on role
export function redirectBasedOnRole() {
    const user = getCurrentUser();
    if (!user) return;
    
    if (user.role === 'admin') {
        window.location.href = '/admin-dashboard.html';
    } else {
        window.location.href = '/dashboard.html';
    }
}
