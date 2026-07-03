// ============================================
// PAGE: AUTHENTICATION PAGE
// Path: /frontend/js/pages/auth.js
// Purpose: Handles signin.html form submissions and UI
// ============================================

import { 
    signInUser, 
    signUpUser, 
    signOutUser,
    getCurrentSession,
    resetPassword,
    generateUsername,
    generateRecoveryPhrase
} from '../modules/auth.js';

// ============================================
// TOAST NOTIFICATION
// ============================================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <span class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
            <span class="toast-message">${message}</span>
        </div>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('toast-show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
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
    doc.text(`Email: ${userData.email}`, 20, 150);
    
    doc.setTextColor(0, 128, 0);
    doc.setFontSize(11);
    doc.text('✅ Your account is ready to use!', 20, 175);
    doc.text('📝 You can apply for student/instructor roles from your dashboard.', 20, 188);
    
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(10);
    doc.text('❗ Keep this recovery phrase safe!', 20, 210);
    doc.text('❗ You will need it to reset your password if you forget it.', 20, 220);
    doc.text('❗ This information will not be shown again.', 20, 230);
    
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
    
    const modalTitle = document.querySelector('.modal-header h2');
    if (modalTitle) {
        modalTitle.textContent = '✅ Account Created Successfully!';
    }
    
    // Update next steps
    const nextSteps = document.querySelector('.next-steps ol');
    if (nextSteps) {
        nextSteps.innerHTML = `
            <li>Download and save your credentials PDF</li>
            <li>Use your username and password to Log In</li>
            <li>Apply for student/instructor roles from your dashboard</li>
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
// SIGN UP HANDLER
// ============================================

async function handleSignUp(fullName, birthDay, birthMonth, password, confirmPassword) {
    if (!fullName || !birthDay || !birthMonth || !password) {
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
        const email = `${username}@gliimu.com`; // ✅ CORRECT: double 'i'
        
        console.log('📝 Signing up with:', { username, email });
        
        // Create user with role 'user'
        const result = await signUpUser(email, password, {
            name: fullName,
            username: username,
            birthDay: parseInt(birthDay),
            birthMonth: parseInt(birthMonth)
        });
        
        if (!result.success) {
            return { success: false, error: result.error };
        }
        
        // Show credentials modal
        showCredentialsModal({
            fullName,
            username,
            password,
            recoveryPhrase,
            email
        });
        
        return { success: true };
        
    } catch (error) {
        console.error('Sign up error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// SIGN IN HANDLER
// ============================================

async function handleSignIn(usernameOrEmail, password) {
    if (!usernameOrEmail || !password) {
        return { success: false, error: 'Please enter both username and password' };
    }
    
    try {
        const result = await signInUser(usernameOrEmail, password);
        return result;
    } catch (error) {
        console.error('Sign in error:', error);
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

// ============================================
// SIGN IN FORM
// ============================================

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
        submitBtn.disabled = true;
        
        const result = await handleSignIn(username, password);
        
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        
        if (result.success) {
            showToast(`Welcome, ${result.user.name}!`, 'success');
            setTimeout(() => {
                window.location.href = '/user';
            }, 1000);
        } else {
            showToast(result.error || 'Invalid username or password', 'error');
        }
    });
}

// ============================================
// SIGN UP FORM
// ============================================

const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fullName = document.getElementById('signupName').value.trim();
        const birthDay = document.getElementById('signupBirthDay').value;
        const birthMonth = document.getElementById('signupBirthMonth').value;
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('signupConfirmPassword').value;
        
        const submitBtn = registerForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
        submitBtn.disabled = true;
        
        const result = await handleSignUp(fullName, birthDay, birthMonth, password, confirmPassword);
        
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        
        if (result.success) {
            showToast('Account created successfully!', 'success');
        } else {
            showToast(result.error || 'Failed to create account', 'error');
        }
    });
}

// ============================================
// PDF DOWNLOAD
// ============================================

const downloadBtn = document.getElementById('downloadPdfBtn');
if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
        if (window.currentCredentials) {
            generatePDF(window.currentCredentials);
            showToast('PDF downloaded! Save it somewhere safe.', 'success');
        }
    });
}

// ============================================
// GO TO DASHBOARD
// ============================================

const goToDashboardBtn = document.getElementById('goToDashboardBtn');
if (goToDashboardBtn) {
    goToDashboardBtn.addEventListener('click', async () => {
        const creds = window.currentCredentials;
        if (creds) {
            const result = await handleSignIn(creds.username, creds.password);
            if (result.success) {
                window.location.href = '/user';
            } else {
                window.location.href = '/signin.html';
            }
        } else {
            window.location.href = '/signin.html';
        }
    });
}

// ============================================
// MODAL CONTROLS
// ============================================

const closeModalBtn = document.getElementById('closePdfModal');
if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closePdfModal);
}

window.onclick = (e) => {
    const modal = document.getElementById('pdfModal');
    if (e.target === modal) {
        closePdfModal();
    }
};

// ============================================
// FORGOT PASSWORD
// ============================================

const forgotLink = document.getElementById('forgotPasswordLink');
if (forgotLink) {
    forgotLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = prompt('Please enter your email address to reset your password:');
        if (email) {
            const result = await resetPassword(email);
            if (result.success) {
                showToast('Password reset email sent! Check your inbox.', 'success');
            } else {
                showToast(result.error || 'Failed to send reset email', 'error');
            }
        }
    });
}

// ============================================
// AUTO-REDIRECT IF ALREADY LOGGED IN
// ============================================

(async function checkExistingSession() {
    const session = await getCurrentSession();
    if (session) {
        const localUser = localStorage.getItem('glimu_user');
        if (localUser) {
            window.location.href = '/user';
        }
    }
})();

console.log('✅ Auth page initialized with domain:', 'gliimu.com');
