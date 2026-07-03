// ============================================
// FORGOT PASSWORD - WITH EMAIL RESET
// No backend server needed!
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// DOM ELEMENTS
// ============================================

const elements = {
    resetForm: document.getElementById('resetForm'),
    username: document.getElementById('username'),
    email: document.getElementById('email'),
    recoveryPhrase: document.getElementById('recoveryPhrase'),
    birthDay: document.getElementById('birthDay'),
    birthMonth: document.getElementById('birthMonth'),
    submitBtn: document.getElementById('submitBtn')
};

// ============================================
// POPULATE DROPDOWNS
// ============================================

function populateDropdowns() {
    // Days
    const daySelect = elements.birthDay;
    for (let i = 1; i <= 31; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        daySelect.appendChild(opt);
    }
    
    // Months
    const monthSelect = elements.birthMonth;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    months.forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = i + 1;
        opt.textContent = m;
        monthSelect.appendChild(opt);
    });
}

// ============================================
// TOGGLE PASSWORD VISIBILITY
// ============================================

document.getElementById('toggleRecovery')?.addEventListener('click', function() {
    const input = document.getElementById('recoveryPhrase');
    const icon = this.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
});

// ============================================
// MAIN FORM SUBMISSION
// ============================================

elements.resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Get values
    const username = elements.username.value.trim();
    const email = elements.email.value.trim();
    const recoveryPhrase = elements.recoveryPhrase.value.trim();
    const birthDay = parseInt(elements.birthDay.value);
    const birthMonth = parseInt(elements.birthMonth.value);
    
    // Validate
    if (!username || !email || !recoveryPhrase || !birthDay || !birthMonth) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    // Validate email format
    if (!email.includes('@') || !email.includes('.')) {
        showToast('Please enter a valid email address', 'error');
        return;
    }
    
    if (recoveryPhrase.split('-').length !== 6) {
        showToast('Recovery phrase must have 6 words (format: word1-word2-word3-word4-word5-word6)', 'error');
        return;
    }
    
    // Show loading
    elements.submitBtn.disabled = true;
    elements.submitBtn.innerHTML = '<span class="spinner"></span> Verifying...';
    
    try {
        // 1. Find user by username
        const { data: user, error: userError } = await supabase
            .from('user_profiles')
            .select('id, username, email, recovery_phrase, birth_day, birth_month')
            .eq('username', username.toLowerCase())
            .maybeSingle();
        
        if (userError || !user) {
            showToast('User not found. Please check your username.', 'error');
            return;
        }
        
        // 2. Verify recovery phrase
        if (user.recovery_phrase?.toLowerCase() !== recoveryPhrase.toLowerCase()) {
            showToast('Invalid recovery phrase. Please try again.', 'error');
            return;
        }
        
        // 3. Verify date of birth
        if (Number(user.birth_day) !== birthDay || Number(user.birth_month) !== birthMonth) {
            showToast('Date of birth does not match our records.', 'error');
            return;
        }
        
        // 4. Send password reset email to the provided email
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
            email,
            {
                redirectTo: window.location.origin + '/reset-password.html'
            }
        );
        
        if (resetError) {
            console.error('Reset error:', resetError);
            showToast('Failed to send reset email. Please try again.', 'error');
            return;
        }
        
        // 5. Show success message
        showToast(`✅ Reset link sent to ${email}! Check your inbox.`, 'success');
        
        // Show success state
        elements.resetForm.innerHTML = `
            <div style="text-align: center; padding: 30px 20px;">
                <div style="font-size: 64px; margin-bottom: 16px;">📧</div>
                <h3 style="color: #2c2f78; margin-bottom: 12px;">Check Your Email!</h3>
                <p style="color: #666; margin-bottom: 8px; line-height: 1.6;">
                    A password reset link has been sent to:<br>
                    <strong style="color: #2c2f78; font-size: 16px;">${email}</strong>
                </p>
                <p style="color: #999; font-size: 14px; margin-top: 12px;">
                    Click the link in the email to set a new password.
                </p>
                <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                    <a href="/signin.html" class="btn-primary" style="display: inline-flex; text-decoration: none; width: auto; padding: 12px 32px;">
                        <i class="fas fa-arrow-left"></i> Back to Sign In
                    </a>
                    <button onclick="location.reload()" class="btn-secondary" style="display: inline-flex; text-decoration: none; width: auto; padding: 12px 32px; background: #f0f0f0; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                        <i class="fas fa-redo"></i> Try Again
                    </button>
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('Reset error:', error);
        showToast('An error occurred. Please try again.', 'error');
    } finally {
        elements.submitBtn.disabled = false;
        elements.submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link';
    }
});

// ============================================
// CHECK SESSION
// ============================================

async function checkSession() {
    try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
            window.location.href = '/user';
        }
    } catch (error) {
        console.error('Session check error:', error);
    }
}

// ============================================
// INIT
// ============================================

populateDropdowns();
checkSession();
console.log('🔐 Forgot Password ready (with email)');
