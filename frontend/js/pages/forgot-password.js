// ============================================
// PAGE: FORGOT PASSWORD
// Path: /frontend/js/pages/forgot-password.js
// Purpose: Handle password recovery with recovery phrase and user verification
// ============================================

import { supabase } from '../modules/supabase.js';

// ============================================
// STATE MANAGEMENT
// ============================================

const state = {
    currentStep: 1,
    userId: null,
    username: null,
    recoveryPhrase: null,
    verifiedUsers: [],
    isLoading: false
};

// ============================================
// DOM REFERENCES
// ============================================

const elements = {
    // Steps
    step1: document.getElementById('step1'),
    step2: document.getElementById('step2'),
    step3: document.getElementById('step3'),
    step1Content: document.getElementById('step1Content'),
    step2Content: document.getElementById('step2Content'),
    step3Content: document.getElementById('step3Content'),
    successContent: document.getElementById('successContent'),

    // Forms
    recoveryPhraseForm: document.getElementById('recoveryPhraseForm'),
    verifyUsersForm: document.getElementById('verifyUsersForm'),
    newPasswordForm: document.getElementById('newPasswordForm'),

    // Inputs
    username: document.getElementById('username'),
    recoveryPhrase: document.getElementById('recoveryPhrase'),
    user1: document.getElementById('user1'),
    user2: document.getElementById('user2'),
    user3: document.getElementById('user3'),
    newPassword: document.getElementById('newPassword'),
    confirmPassword: document.getElementById('confirmPassword'),

    // Buttons
    backToStep1: document.getElementById('backToStep1'),
    backToStep2: document.getElementById('backToStep2'),
    resetPasswordBtn: document.getElementById('resetPasswordBtn'),
    toggleVisibility: document.getElementById('toggleVisibility'),
    toggleNewPassword: document.getElementById('toggleNewPassword'),
    toggleConfirmPassword: document.getElementById('toggleConfirmPassword'),

    // Password Strength
    strengthBar: document.getElementById('strengthBar'),
    strengthText: document.getElementById('strengthText'),
    passwordMatch: document.getElementById('passwordMatch')
};

// ============================================
// TOAST NOTIFICATIONS
// ============================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="fas ${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// ============================================
// STEP MANAGEMENT
// ============================================

function goToStep(step) {
    // Hide all steps
    document.querySelectorAll('.reset-step').forEach(el => {
        el.classList.remove('active');
    });
    
    // Update step indicators
    document.querySelectorAll('.step').forEach(el => {
        el.classList.remove('active', 'completed');
    });

    // Show target step
    const stepContent = document.getElementById(`step${step}Content`);
    if (stepContent) {
        stepContent.classList.add('active');
    }

    // Update progress
    for (let i = 1; i <= 3; i++) {
        const stepEl = document.getElementById(`step${i}`);
        if (stepEl) {
            if (i < step) {
                stepEl.classList.add('completed');
            } else if (i === step) {
                stepEl.classList.add('active');
            }
        }
    }

    state.currentStep = step;
}

// ============================================
// STEP 1: RECOVERY PHRASE VERIFICATION
// ============================================

async function verifyRecoveryPhrase(username, recoveryPhrase) {
    try {
        state.isLoading = true;
        setLoadingState(elements.recoveryPhraseForm, true);

        // Find user by username or email
        let userQuery = supabase
            .from('user_profiles')
            .select('id, username, email, name, recovery_phrase')
            .or(`username.ilike.%${username}%,email.ilike.%${username}%`)
            .maybeSingle();

        const { data: user, error } = await userQuery;

        if (error || !user) {
            showToast('User not found. Please check your username or email.', 'error');
            return false;
        }

        // Check if user has a recovery phrase stored
        if (!user.recovery_phrase) {
            showToast('No recovery phrase found for this account. Please contact support.', 'error');
            return false;
        }

        // Verify the recovery phrase (case insensitive, trim spaces)
        const storedPhrase = user.recovery_phrase.toLowerCase().trim();
        const enteredPhrase = recoveryPhrase.toLowerCase().trim();

        if (storedPhrase !== enteredPhrase) {
            showToast('Invalid recovery phrase. Please try again.', 'error');
            return false;
        }

        // Store user info in state
        state.userId = user.id;
        state.username = user.username;
        state.recoveryPhrase = user.recovery_phrase;

        showToast('Recovery phrase verified successfully!', 'success');
        
        // Move to step 2
        goToStep(2);
        return true;

    } catch (error) {
        console.error('Recovery verification error:', error);
        showToast('An error occurred. Please try again.', 'error');
        return false;
    } finally {
        state.isLoading = false;
        setLoadingState(elements.recoveryPhraseForm, false);
    }
}

// ============================================
// STEP 2: USER VERIFICATION
// ============================================

async function verifyUsers(userNames) {
    try {
        state.isLoading = true;
        setLoadingState(elements.verifyUsersForm, true);

        // Get list of users this user has interacted with
        // For now, we'll check if the entered usernames exist in the system
        // In a real app, you'd check for actual interactions (messages, courses, etc.)
        
        const verified = [];
        const errors = [];

        for (const name of userNames) {
            if (!name.trim()) {
                errors.push('All user fields are required');
                continue;
            }

            const { data: user, error } = await supabase
                .from('user_profiles')
                .select('id, username, name')
                .ilike('username', name.trim())
                .maybeSingle();

            if (error || !user) {
                errors.push(`User "${name}" not found`);
            } else {
                verified.push(user);
            }
        }

        if (errors.length > 0) {
            showToast(errors.join('. '), 'error');
            return false;
        }

        if (verified.length < 3) {
            showToast('Please enter three valid usernames.', 'error');
            return false;
        }

        // Check if any of the verified users is the current user
        if (verified.some(u => u.id === state.userId)) {
            showToast('You cannot use your own username.', 'error');
            return false;
        }

        // Store verified users
        state.verifiedUsers = verified;
        showToast('Users verified successfully!', 'success');
        
        // Move to step 3
        goToStep(3);
        return true;

    } catch (error) {
        console.error('User verification error:', error);
        showToast('An error occurred. Please try again.', 'error');
        return false;
    } finally {
        state.isLoading = false;
        setLoadingState(elements.verifyUsersForm, false);
    }
}

// ============================================
// STEP 3: NEW PASSWORD
// ============================================

async function resetPassword(newPassword) {
    try {
        state.isLoading = true;
        setLoadingState(elements.newPasswordForm, true);

        // Update password in Supabase Auth
        const { error: authError } = await supabase.auth.admin.updateUserById(
            state.userId,
            { password: newPassword }
        );

        if (authError) {
            // If admin update fails, try using the user's session
            // First, sign in with current password (if available)
            // For now, we'll use the user's email to reset via email
            const { data: userData, error: userError } = await supabase
                .from('user_profiles')
                .select('email')
                .eq('id', state.userId)
                .maybeSingle();

            if (userError || !userData) {
                showToast('Unable to reset password. Please contact support.', 'error');
                return false;
            }

            // Send password reset email as fallback
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(
                userData.email,
                { redirectTo: window.location.origin + '/reset-password.html' }
            );

            if (resetError) {
                showToast('Unable to reset password. Please contact support.', 'error');
                return false;
            }

            showToast('Password reset email sent! Check your inbox.', 'success');
            showSuccessStep();
            return true;
        }

        showToast('Password reset successfully!', 'success');
        showSuccessStep();
        return true;

    } catch (error) {
        console.error('Password reset error:', error);
        showToast('An error occurred. Please try again.', 'error');
        return false;
    } finally {
        state.isLoading = false;
        setLoadingState(elements.newPasswordForm, false);
    }
}

// ============================================
// UI HELPERS
// ============================================

function setLoadingState(form, loading) {
    const submitBtn = form?.querySelector('button[type="submit"]');
    if (!submitBtn) return;

    if (loading) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Processing...';
    } else {
        submitBtn.disabled = false;
        // Restore original text
        const originalText = submitBtn.textContent.replace(' Processing...', '');
        submitBtn.textContent = originalText || 'Submit';
    }
}

function showSuccessStep() {
    // Hide all steps
    document.querySelectorAll('.reset-step').forEach(el => {
        el.classList.remove('active');
    });
    
    // Show success
    elements.successContent.style.display = 'block';
    
    // Update progress
    document.querySelectorAll('.step').forEach(el => {
        el.classList.add('completed');
        el.classList.remove('active');
    });
}

function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const icon = button.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

// ============================================
// PASSWORD STRENGTH CHECKER
// ============================================

function checkPasswordStrength(password) {
    let strength = 0;
    let label = 'Weak';
    let className = 'weak';

    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    if (strength >= 4) {
        label = 'Very Strong';
        className = 'very-strong';
    } else if (strength >= 3) {
        label = 'Strong';
        className = 'strong';
    } else if (strength >= 2) {
        label = 'Medium';
        className = 'medium';
    }

    return { strength: Math.min(strength / 4 * 100, 100), label, className };
}

function updatePasswordStrength(password) {
    const result = checkPasswordStrength(password);
    
    // Update bar
    const bar = elements.strengthBar;
    bar.innerHTML = `<div class="bar-fill ${result.className}" style="width: ${result.strength}%"></div>`;
    
    // Update text
    elements.strengthText.textContent = result.label;
    elements.strengthText.className = `strength-text ${result.className}`;
}

function checkPasswordMatch() {
    const password = elements.newPassword.value;
    const confirm = elements.confirmPassword.value;
    const matchEl = elements.passwordMatch;

    if (!confirm) {
        matchEl.textContent = '';
        matchEl.className = 'password-match';
        return;
    }

    if (password === confirm) {
        matchEl.textContent = '✅ Passwords match';
        matchEl.className = 'password-match match';
    } else {
        matchEl.textContent = '❌ Passwords do not match';
        matchEl.className = 'password-match no-match';
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

// Step 1: Recovery Phrase Form
elements.recoveryPhraseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = elements.username.value.trim();
    const recoveryPhrase = elements.recoveryPhrase.value.trim();

    if (!username) {
        showToast('Please enter your username or email.', 'error');
        return;
    }

    if (!recoveryPhrase) {
        showToast('Please enter your recovery phrase.', 'error');
        return;
    }

    // Check if recovery phrase has 6 words
    const words = recoveryPhrase.split('-');
    if (words.length !== 6) {
        showToast('Please enter a valid 6-word recovery phrase (format: word1-word2-word3-word4-word5-word6)', 'error');
        return;
    }

    await verifyRecoveryPhrase(username, recoveryPhrase);
});

// Step 2: Verify Users Form
elements.verifyUsersForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userNames = [
        elements.user1.value.trim(),
        elements.user2.value.trim(),
        elements.user3.value.trim()
    ];

    if (userNames.some(name => !name)) {
        showToast('Please enter all three usernames.', 'error');
        return;
    }

    await verifyUsers(userNames);
});

// Step 3: New Password Form
elements.newPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newPassword = elements.newPassword.value;
    const confirmPassword = elements.confirmPassword.value;

    if (!newPassword || newPassword.length < 8) {
        showToast('Password must be at least 8 characters.', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match.', 'error');
        return;
    }

    await resetPassword(newPassword);
});

// Navigation Back Buttons
elements.backToStep1.addEventListener('click', () => {
    goToStep(1);
});

elements.backToStep2.addEventListener('click', () => {
    goToStep(2);
});

// Toggle Password Visibility
elements.toggleVisibility.addEventListener('click', () => {
    togglePasswordVisibility('recoveryPhrase', elements.toggleVisibility);
});

elements.toggleNewPassword.addEventListener('click', () => {
    togglePasswordVisibility('newPassword', elements.toggleNewPassword);
});

elements.toggleConfirmPassword.addEventListener('click', () => {
    togglePasswordVisibility('confirmPassword', elements.toggleConfirmPassword);
});

// Password Strength & Match (Real-time)
elements.newPassword.addEventListener('input', () => {
    updatePasswordStrength(elements.newPassword.value);
    checkPasswordMatch();
});

elements.confirmPassword.addEventListener('input', checkPasswordMatch);

// ============================================
// MIGRATION: Add recovery_phrase column
// ============================================

// This function checks if the recovery_phrase column exists and adds it if not
// To be used during signup to store the recovery phrase

export async function ensureRecoveryPhraseColumn() {
    try {
        // Check if column exists
        const { data, error } = await supabase
            .from('user_profiles')
            .select('recovery_phrase')
            .limit(1);

        if (error && error.code === 'PGRST204') {
            // Column doesn't exist, add it
            console.log('Adding recovery_phrase column...');
            
            // You'll need to run this SQL in Supabase SQL Editor:
            // ALTER TABLE user_profiles ADD COLUMN recovery_phrase TEXT;
            
            showToast('Database migration needed. Please contact support.', 'error');
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Column check error:', error);
        return false;
    }
}

// ============================================
// INITIALIZATION
// ============================================

// Check if user is already logged in
async function checkExistingSession() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (session) {
            // User is already logged in, redirect to dashboard
            window.location.href = '/user';
        }
    } catch (error) {
        console.error('Session check error:', error);
    }
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    checkExistingSession();
    console.log('🔐 Forgot Password page initialized');
});

// ============================================
// EXPORT FUNCTIONS (for use in signup)
// ============================================

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
