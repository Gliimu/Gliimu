// ============================================
// FORGOT PASSWORD - FINAL VERSION
// ============================================

import { supabase } from '../modules/supabase.js';
import { resetPassword } from '../modules/api.js';
import { showToast } from '../modules/toast.js';

// ============================================
// DOM ELEMENTS
// ============================================

const elements = {
    // Form
    resetForm: document.getElementById('resetForm'),
    
    // Inputs
    username: document.getElementById('username'),
    recoveryPhrase: document.getElementById('recoveryPhrase'),
    birthDay: document.getElementById('birthDay'),
    birthMonth: document.getElementById('birthMonth'),
    newPassword: document.getElementById('newPassword'),
    confirmPassword: document.getElementById('confirmPassword'),
    
    // Modal
    modal: document.getElementById('successModal'),
    modalUsername: document.getElementById('modalUsername'),
    modalPassword: document.getElementById('modalPassword'),
    modalPhrase: document.getElementById('modalPhrase'),
    
    // Buttons
    toggleRecovery: document.getElementById('toggleRecovery'),
    togglePassword: document.getElementById('togglePassword'),
    copyPassword: document.getElementById('copyPassword'),
    copyPhrase: document.getElementById('copyPhrase'),
    downloadPdf: document.getElementById('downloadPdf'),
    goToSignin: document.getElementById('goToSignin'),
    closeModal: document.getElementById('closeModal'),
    strengthBar: document.getElementById('strengthBar'),
    strengthText: document.getElementById('strengthText'),
    matchText: document.getElementById('matchText'),
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

function toggleVisibility(inputId, button) {
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
// PASSWORD STRENGTH
// ============================================

function checkStrength(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    
    const levels = ['Weak', 'Fair', 'Good', 'Strong'];
    const colors = ['weak', 'fair', 'good', 'strong'];
    const index = Math.min(score, 3);
    
    return { label: levels[index], class: colors[index], width: ((score + 1) / 4) * 100 };
}

function updatePasswordStrength(password) {
    const result = checkStrength(password);
    const bar = elements.strengthBar;
    bar.innerHTML = `<div class="bar-fill ${result.class}" style="width: ${result.width}%"></div>`;
    elements.strengthText.textContent = result.label;
    elements.strengthText.className = `strength-text ${result.class}`;
}

// ============================================
// SHOW SUCCESS MODAL
// ============================================

function showSuccess(data) {
    elements.modalUsername.textContent = data.username;
    elements.modalPassword.textContent = data.newPassword;
    elements.modalPhrase.textContent = data.newRecoveryPhrase;
    elements.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    elements.modal.classList.remove('active');
    document.body.style.overflow = '';
}

// ============================================
// PDF GENERATION
// ============================================

function generatePDF(data) {
    // Check if jsPDF is loaded
    if (typeof window.jspdf === 'undefined') {
        showToast('PDF library is loading. Please try again.', 'warning');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Header
    doc.setFillColor(44, 47, 120);
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('Gliimu Institute', pageWidth / 2, 25, { align: 'center' });
    
    // Title
    doc.setTextColor(44, 47, 120);
    doc.setFontSize(16);
    doc.text('New Account Credentials', pageWidth / 2, 60, { align: 'center' });
    
    // Warning
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(10);
    doc.text('⚠️ IMPORTANT: Save this document securely', pageWidth / 2, 75, { align: 'center' });
    
    // Credentials
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text('Your New Account Details:', 20, 95);
    
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(`Username: ${data.username}`, 20, 115);
    doc.text(`New Password: ${data.newPassword}`, 20, 130);
    doc.text(`New Recovery Phrase: ${data.newRecoveryPhrase}`, 20, 145);
    
    // Important notes
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(10);
    const warningY = 175;
    doc.text('❗ Keep this recovery phrase safe!', 20, warningY);
    doc.text('❗ You will need it to reset your password if you forget it.', 20, warningY + 12);
    doc.text('❗ This information will not be shown again.', 20, warningY + 24);
    
    // Footer
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, pageHeight - 20);
    doc.text('© Gliimu Institute of Media Technologies Ltd.', pageWidth / 2, pageHeight - 10, { align: 'center' });
    
    doc.save(`Gliimu_Credentials_${data.username}.pdf`);
    showToast('PDF downloaded successfully!', 'success');
}

// ============================================
// MAIN FORM SUBMISSION
// ============================================

elements.resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Get values
    const username = elements.username.value.trim();
    const recoveryPhrase = elements.recoveryPhrase.value.trim();
    const birthDay = parseInt(elements.birthDay.value);
    const birthMonth = parseInt(elements.birthMonth.value);
    const newPassword = elements.newPassword.value;
    const confirmPassword = elements.confirmPassword.value;
    
    // Validate
    if (!username || !recoveryPhrase || !birthDay || !birthMonth || !newPassword) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    // Validate recovery phrase format
    const words = recoveryPhrase.split('-');
    if (words.length !== 6) {
        showToast('Recovery phrase must have 6 words (format: word1-word2-word3-word4-word5-word6)', 'error');
        return;
    }
    
    if (newPassword.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }
    
    // Show loading
    elements.submitBtn.disabled = true;
    elements.submitBtn.innerHTML = '<span class="spinner"></span> Resetting...';
    
    try {
        // Call API
        const result = await resetPassword({
            username,
            recoveryPhrase,
            birthDay,
            birthMonth,
            newPassword
        });
        
        if (result.success) {
            showToast('Password reset successfully! 🎉', 'success');
            showSuccess(result.data);
        } else {
            showToast(result.message || 'Reset failed. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Reset error:', error);
        
        // Better error message
        let errorMessage = 'An error occurred. Please try again.';
        if (error.message?.includes('Failed to fetch') || error.message?.includes('ERR_CONNECTION_REFUSED')) {
            errorMessage = 'Cannot connect to server. Please make sure the backend is running on port 3000.';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        showToast(errorMessage, 'error');
    } finally {
        elements.submitBtn.disabled = false;
        elements.submitBtn.innerHTML = '<i class="fas fa-save"></i> Reset Password';
    }
});

// ============================================
// EVENT LISTENERS
// ============================================

// Toggle visibility
elements.toggleRecovery.addEventListener('click', () => 
    toggleVisibility('recoveryPhrase', elements.toggleRecovery)
);
elements.togglePassword.addEventListener('click', () => 
    toggleVisibility('newPassword', elements.togglePassword)
);

// Password strength
elements.newPassword.addEventListener('input', () => {
    updatePasswordStrength(elements.newPassword.value);
    checkPasswordMatch();
});

// Password match
function checkPasswordMatch() {
    const password = elements.newPassword.value;
    const confirm = elements.confirmPassword.value;
    const matchEl = elements.matchText;
    
    if (!confirm) {
        matchEl.textContent = '';
        matchEl.className = 'match-text';
        return;
    }
    
    if (password === confirm) {
        matchEl.textContent = '✅ Passwords match';
        matchEl.className = 'match-text match';
    } else {
        matchEl.textContent = '❌ Passwords do not match';
        matchEl.className = 'match-text no-match';
    }
}

elements.confirmPassword.addEventListener('input', checkPasswordMatch);

// Copy buttons
elements.copyPassword.addEventListener('click', async () => {
    const text = elements.modalPassword.textContent;
    try {
        await navigator.clipboard.writeText(text);
        showToast('Password copied to clipboard!', 'success');
    } catch {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Password copied to clipboard!', 'success');
    }
});

elements.copyPhrase.addEventListener('click', async () => {
    const text = elements.modalPhrase.textContent;
    try {
        await navigator.clipboard.writeText(text);
        showToast('Recovery phrase copied to clipboard!', 'success');
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Recovery phrase copied to clipboard!', 'success');
    }
});

// PDF download
elements.downloadPdf.addEventListener('click', () => {
    const data = {
        username: elements.modalUsername.textContent,
        newPassword: elements.modalPassword.textContent,
        newRecoveryPhrase: elements.modalPhrase.textContent
    };
    generatePDF(data);
});

// Modal controls
elements.closeModal.addEventListener('click', closeModal);
elements.goToSignin.addEventListener('click', () => {
    closeModal();
    window.location.href = '/signin.html';
});

// Close modal on outside click
window.addEventListener('click', (e) => {
    if (e.target === elements.modal) closeModal();
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.modal.classList.contains('active')) {
        closeModal();
    }
});

// ============================================
// INIT
// ============================================

populateDropdowns();

// Check if already logged in
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

checkSession();
console.log('🔐 Forgot Password ready');
