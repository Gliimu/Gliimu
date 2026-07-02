// ============================================
// AUTHENTICATION PAGE - SIMPLIFIED VERSION
// ============================================

import { supabase, signUp as supabaseSignUp, signIn as supabaseSignIn, getUserProfile } from '../modules/supabase.js';
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

// ============================================
// SIMPLIFIED SIGN UP
// ============================================

async function signUp(fullName, birthDay, birthMonth, role, password, confirmPassword) {
    // Validation
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
        const email = `${username}@glimu.com`;
        
        // ✅ Create auth user AND profile in one call
        const result = await supabaseSignUp(email, password, {
            name: fullName,
            username: username,
            role: role,
            birthDay: parseInt(birthDay),
            birthMonth: parseInt(birthMonth)
        });
        
        if (!result.success) {
            return { success: false, error: result.error };
        }
        
        // ✅ Show credentials modal
        showCredentialsModal({
            fullName,
            username,
            password,
            recoveryPhrase,
            role,
            email
        });
        
        return { success: true };
        
    } catch (error) {
        console.error('Sign up error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// SIMPLIFIED SIGN IN
// ============================================

async function signIn(usernameOrEmail, password) {
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
        
        // ✅ Sign in with Supabase Auth
        const result = await supabaseSignIn(email, password);
        
        if (!result.success) {
            return { success: false, error: 'Invalid credentials' };
        }
        
        // ✅ Get user profile
        const profile = await getUserProfile(result.user.id);
        
        if (!profile) {
            return { success: false, error: 'User profile not found' };
        }
        
        // ✅ Prepare session
        const user = {
            id: result.user.id,
            name: profile.name,
            email: profile.email,
            username: profile.username,
            role: profile.role,
            plan: profile.plan || 'basic',
            walletBalance: profile.wallet_balance || 25000,
            avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=fbb040&color=fff`
        };
        
        localStorage.setItem('glimu_user', JSON.stringify(user));
        return { success: true, user, role: user.role };
        
    } catch (error) {
        console.error('Sign in error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// PDF GENERATION
// ============================================

function generatePDF(userData) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(44, 47, 120);
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('Gliimu Institute', pageWidth / 2, 25, { align: 'center' });
    
    // Title
    doc.setTextColor(44, 47, 120);
    doc.setFontSize(16);
    doc.text('Account Credentials', pageWidth / 2, 60, { align: 'center' });
    
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
    doc.text(`Role: ${userData.role === 'student' ? 'Student' : userData.role === 'instructor' ? 'Instructor' : 'Partner'}`, 20, 150);
    doc.text(`Email: ${userData.email}`, 20, 160);
    
    // Success message
    doc.setTextColor(0, 128, 0);
    doc.setFontSize(11);
    doc.text('✅ Your account is ready to use!', 20, 185);
    
    // Security warnings
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(10);
    doc.text('❗ Keep this recovery phrase safe!', 20, 205);
    doc.text('❗ You will need it to reset your password if you forget it.', 20, 215);
    doc.text('❗ This information will not be shown again.', 20, 225);
    
    // Footer
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 270);
    doc.text('© Gliimu Institute of Media Technologies Ltd.', pageWidth / 2, 280, { align: 'center' });
    
    doc.save(`Gliimu_Credentials_${userData.username}.pdf`);
}

// ============================================
// SHOW CREDENTIALS MODAL
// ============================================

function showCredentialsModal(userData) {
    document.getElementById('displayUsername').textContent = userData.username;
    document.getElementById('displayRecoveryPhrase').textContent = userData.recoveryPhrase;
    document.getElementById('displayPassword').textContent = userData.password;
    
    // Update success message
    const successIcon = document.querySelector('.success-icon i');
    if (successIcon) {
        successIcon.className = 'fas fa-check-circle';
        successIcon.style.color = '#4CAF50';
    }
    
    const modalTitle = document.querySelector('.modal-header h2');
    if (modalTitle) {
        modalTitle.textContent = '✅ Account Created Successfully!';
    }
    
    // Remove pending status message if exists
    const statusMsg = document.querySelector('.approval-status');
    if (statusMsg) {
        statusMsg.remove();
    }
    
    // Update next steps
    const nextSteps = document.querySelector('.next-steps ol');
    if (nextSteps) {
        nextSteps.innerHTML = `
            <li>Download and save your credentials PDF</li>
            <li>Use your username and password to Log In</li>
            <li>Keep your recovery phrase safe</li>
            <li>You'll be redirected to your dashboard</li>
        `;
    }
    
    window.currentCredentials = userData;
    
    const modal = document.getElementById('pdfModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closePdfModal() {
    const modal = document.getElementById('pdfModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
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
        
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        if (!username || !password) {
            showToast('Please enter both username and password', 'error');
            return;
        }
        
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
                } else if (result.role === 'instructor') {
                    window.location.href = '/instructor-dashboard.html';
                } else if (result.role === 'partner') {
                    window.location.href = '/partner-dashboard.html';
                } else {
                    window.location.href = '/user';
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
        
        const fullName = document.getElementById('signupName').value.trim();
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
            showToast('Account created successfully!', 'success');
        } else {
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

// Go to Dashboard - Now redirects immediately
const goToDashboardBtn = document.getElementById('goToDashboardBtn');
if (goToDashboardBtn) {
    goToDashboardBtn.addEventListener('click', () => {
        const creds = window.currentCredentials;
        if (creds) {
            // Auto-login and redirect
            signIn(creds.username, creds.password).then(result => {
                if (result.success) {
                    if (result.role === 'admin') {
                        window.location.href = '/admin-dashboard.html';
                    } else if (result.role === 'instructor') {
                        window.location.href = '/instructor-dashboard.html';
                    } else if (result.role === 'partner') {
                        window.location.href = '/partner-dashboard.html';
                    } else {
                        window.location.href = '/user';
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

// Forgot password
const forgotLink = document.getElementById('forgotPasswordLink');
if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        const email = prompt('Please enter your email address to reset your password:');
        if (email) {
            supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password.html',
            });
            showToast('Password reset email sent! Check your inbox.', 'success');
        }
    });
}
