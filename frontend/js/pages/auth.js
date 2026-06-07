// ============================================
// AUTHENTICATION PAGE - SIGN IN / SIGN UP
// With PDF Generation and Theme Persistence
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
// PDF GENERATION FUNCTION
// ============================================

function generatePDF(userData) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header with brand color
    doc.setFillColor(44, 47, 120);
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('Gliimu Institute', pageWidth / 2, 25, { align: 'center' });
    
    // Title
    doc.setTextColor(44, 47, 120);
    doc.setFontSize(16);
    doc.text('Account Credentials', pageWidth / 2, 60, { align: 'center' });
    
    // Important Note
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(10);
    doc.text('⚠️ IMPORTANT: Save this document securely', pageWidth / 2, 75, { align: 'center' });
    
    // Credentials
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text('Your Account Details:', 20, 95);
    
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(`Full Name: ${userData.fullName}`, 20, 110);
    doc.text(`Username: ${userData.username}`, 20, 120);
    doc.text(`Password: ${userData.password}`, 20, 130);
    doc.text(`Recovery Phrase: ${userData.recoveryPhrase}`, 20, 140);
    doc.text(`Role: ${userData.role === 'student' ? 'Student' : userData.role === 'instructor' ? 'Instructor' : userData.role === 'partner' ? 'Partner' : 'Other'}`, 20, 150);
    
    // Security Warning
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(10);
    doc.text('❗ Keep this recovery phrase safe!', 20, 175);
    doc.text('❗ You will need it to reset your password if you forget it.', 20, 185);
    doc.text('❗ This information will not be shown again.', 20, 195);
    
    // Footer
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 270);
    doc.text('© Gliimu Institute of Media Technologies Ltd.', pageWidth / 2, 280, { align: 'center' });
    
    // Save PDF
    doc.save(`Gliimu_Credentials_${userData.username}.pdf`);
}

// ============================================
// SHOW CREDENTIALS MODAL
// ============================================

function showCredentialsModal(userData) {
    document.getElementById('displayUsername').textContent = userData.username;
    document.getElementById('displayRecoveryPhrase').textContent = userData.recoveryPhrase;
    document.getElementById('displayPassword').textContent = userData.password;
    
    window.currentCredentials = userData;
    
    const modal = document.getElementById('pdfModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close modal function
function closePdfModal() {
    const modal = document.getElementById('pdfModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// ============================================
// SIGN IN FUNCTION
// ============================================

async function signIn(usernameOrEmail, password) {
    try {
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
            const hashedInput = await hashPassword(password);
            if (hashedInput === appData.password_hash) {
                // Create or get existing auth user
                let authUser = null;
                
                const { data: existingUser } = await supabase.auth.getUser();
                
                if (!existingUser.user) {
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
                    
                    if (authError && authError.message !== 'User already registered') {
                        throw authError;
                    }
                    authUser = authData?.user || existingUser.user;
                } else {
                    authUser = existingUser.user;
                }
                
                if (authUser) {
                    await supabase
                        .from('users')
                        .upsert({
                            id: authUser.id,
                            name: appData.full_name,
                            email: appData.email || `${appData.username}@temp.gliimu.com`,
                            role: appData.role,
                            plan: 'basic',
                            wallet_balance: 25000
                        });
                    
                    const user = {
                        id: authUser.id,
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
        }
        
        // Try direct Supabase auth
        const { data, error } = await supabase.auth.signInWithPassword({
            email: usernameOrEmail.includes('@') ? usernameOrEmail : `${usernameOrEmail}@temp.gliimu.com`,
            password: password
        });
        
        if (error) throw error;
        
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
            const userData = {
                fullName,
                username,
                password,
                recoveryPhrase,
                role
            };
            
            // Show modal with credentials and PDF download
            showCredentialsModal(userData);
            
            return { success: true, ...userData };
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
        
        if (!result.success) {
            showToast(result.error || 'Failed to create account', 'error');
        }
    });
}

// PDF Download
const downloadBtn = document.getElementById('downloadPdfBtn');
if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
        if (window.currentCredentials) {
            generatePDF(window.currentCredentials);
            showToast('PDF downloaded! Save it somewhere safe.', 'success');
        }
    });
}

// Go to Dashboard
const goToDashboardBtn = document.getElementById('goToDashboardBtn');
if (goToDashboardBtn) {
    goToDashboardBtn.addEventListener('click', () => {
        // Try to sign in with the newly created account
        const username = window.currentCredentials?.username;
        const password = window.currentCredentials?.password;
        
        if (username && password) {
            // Auto sign in
            signIn(username, password).then(result => {
                if (result.success) {
                    if (result.role === 'admin') {
                        window.location.href = '/admin-dashboard.html';
                    } else {
                        window.location.href = '/dashboard.html';
                    }
                } else {
                    window.location.href = '/signin.html';
                }
            });
        } else {
            window.location.href = '/signin.html';
        }
    });
}

// Modal close
const closeModalBtn = document.getElementById('closePdfModal');
if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closePdfModal);
}

// Close modal on outside click
window.onclick = (e) => {
    const modal = document.getElementById('pdfModal');
    if (e.target === modal) {
        closePdfModal();
    }
};

// Forgot password link
const forgotLink = document.getElementById('forgotPasswordLink');
if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        showToast('Contact support to reset your password', 'info');
    });
}
