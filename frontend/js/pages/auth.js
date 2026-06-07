// ============================================
// AUTHENTICATION PAGE - SIGN IN / SIGN UP
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateUsername(fullName) {
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

function generateRecoveryPhrase() {
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

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function saveApplication(applicationData) {
    const applicationId = `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const application = {
        id: applicationId,
        full_name: applicationData.fullName,
        birth_day: applicationData.birthDay,
        birth_month: applicationData.birthMonth,
        role: applicationData.role,
        password_hash: applicationData.passwordHash,
        username: applicationData.username,
        recovery_phrase: applicationData.recoveryPhrase,
        status: 'pending',
        submitted_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
        .from('applications')
        .insert([application])
        .select();
    
    if (error) throw error;
    return { success: true, data: data[0] };
}

// ============================================
// SIGN IN FUNCTION
// ============================================

async function signIn(usernameOrEmail, password) {
    try {
        // Try to find user in applications table first
        let userData = null;
        let isEmail = usernameOrEmail.includes('@');
        
        let query = supabase.from('applications').select('*');
        if (isEmail) {
            query = query.eq('email', usernameOrEmail);
        } else {
            query = query.eq('username', usernameOrEmail);
        }
        
        const { data: appData, error: appError } = await query.single();
        
        if (!appError && appData) {
            // Verify password
            const hashedInput = await hashPassword(password);
            if (hashedInput === appData.password_hash) {
                // Check if user already exists in auth
                const { data: existingUser } = await supabase.auth.getUser();
                
                if (!existingUser.user) {
                    // Create auth user
                    const { data: authData, error: authError } = await supabase.auth.signUp({
                        email: `${appData.username}@temp.gliimu.com`,
                        password: password,
                        options: {
                            data: {
                                name: appData.full_name,
                                role: appData.role
                            }
                        }
                    });
                    
                    if (authError) throw authError;
                    userData = authData.user;
                } else {
                    userData = existingUser.user;
                }
                
                // Create or update user profile
                const { error: upsertError } = await supabase
                    .from('users')
                    .upsert({
                        id: userData.id,
                        name: appData.full_name,
                        email: appData.email || `${appData.username}@temp.gliimu.com`,
                        role: appData.role,
                        plan: 'basic',
                        wallet_balance: 25000
                    });
                
                if (upsertError) console.error('Profile upsert error:', upsertError);
                
                // Store user in localStorage
                const user = {
                    id: userData.id,
                    name: appData.full_name,
                    email: appData.email || `${appData.username}@temp.gliimu.com`,
                    role: appData.role,
                    plan: 'basic',
                    walletBalance: 25000,
                    username: appData.username
                };
                
                localStorage.setItem('glimu_user', JSON.stringify(user));
                return { success: true, user, role: appData.role };
            }
        }
        
        // Try direct Supabase auth
        const { data, error } = await supabase.auth.signInWithPassword({
            email: usernameOrEmail.includes('@') ? usernameOrEmail : `${usernameOrEmail}@temp.gliimu.com`,
            password: password
        });
        
        if (error) throw error;
        
        // Get profile
        const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', data.user.id)
            .single();
        
        const user = {
            id: data.user.id,
            name: profile?.name || data.user.user_metadata?.name || 'User',
            email: data.user.email,
            role: profile?.role || 'student',
            plan: profile?.plan || 'basic',
            walletBalance: profile?.wallet_balance || 25000
        };
        
        localStorage.setItem('glimu_user', JSON.stringify(user));
        return { success: true, user, role: user.role };
        
    } catch (error) {
        console.error('Sign in error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// SIGN UP FUNCTION
// ============================================

async function signUp(fullName, birthDay, birthMonth, role, password, confirmPassword) {
    if (!fullName || !birthDay || !birthMonth || !role || !password) {
        return { success: false, error: 'Please fill in all fields' };
    }
    
    if (password !== confirmPassword) {
        return { success: false, error: 'Passwords do not match' };
    }
    
    if (password.length < 8) {
        return { success: false, error: 'Password must be at least 8 characters' };
    }
    
    try {
        const username = generateUsername(fullName);
        const recoveryPhrase = generateRecoveryPhrase();
        const passwordHash = await hashPassword(password);
        
        const result = await saveApplication({
            fullName,
            birthDay: parseInt(birthDay),
            birthMonth: parseInt(birthMonth),
            role,
            passwordHash,
            username,
            recoveryPhrase
        });
        
        if (result.success) {
            // Store credentials temporarily for display
            sessionStorage.setItem('temp_credentials', JSON.stringify({
                username,
                password,
                recoveryPhrase,
                fullName,
                role
            }));
            
            return { success: true, username, password, recoveryPhrase, role };
        }
        
        return { success: false, error: 'Failed to create account' };
        
    } catch (error) {
        console.error('Sign up error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// FORM HANDLERS
// ============================================

// Tab switching
document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab');
        
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
        document.getElementById(`${tabId}Form`).classList.add('active');
    });
});

// Sign In Form
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
        submitBtn.disabled = true;
        
        const result = await signIn(username, password);
        
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        
        if (result.success) {
            showToast(`Welcome back, ${result.user.name}!`, 'success');
            setTimeout(() => {
                if (result.role === 'admin') {
                    window.location.href = '/admin-dashboard.html';
                } else {
                    window.location.href = '/dashboard.html';
                }
            }, 1000);
        } else {
            showToast(result.error || 'Invalid username or password', 'error');
        }
    });
}

// Sign Up Form
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fullName = document.getElementById('signupName').value;
        const birthDay = document.getElementById('signupBirthDay').value;
        const birthMonth = document.getElementById('signupBirthMonth').value;
        const role = document.getElementById('signupRole').value;
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('signupConfirmPassword').value;
        
        const submitBtn = registerForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
        submitBtn.disabled = true;
        
        const result = await signUp(fullName, birthDay, birthMonth, role, password, confirmPassword);
        
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        
        if (result.success) {
            showToast('Account created successfully! Please sign in.', 'success');
            
            // Switch to sign in tab
            document.querySelector('.auth-tab[data-tab="signin"]').click();
            
            // Pre-fill username
            document.getElementById('loginUsername').value = result.username;
            
            // Show credentials alert
            alert(`Your account has been created!\n\nUsername: ${result.username}\nPassword: ${result.password}\nRecovery Phrase: ${result.recoveryPhrase}\n\nPlease save these credentials. You will need them to sign in.`);
        } else {
            showToast(result.error || 'Failed to create account', 'error');
        }
    });
}

// Forgot password link
const forgotLink = document.getElementById('forgotPasswordLink');
if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        showToast('Contact support to reset your password', 'info');
    });
}
