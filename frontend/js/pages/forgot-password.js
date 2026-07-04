// ============================================
// FORGOT PASSWORD - USING RENDER BACKEND
// ============================================

// ============================================
// TOAST NOTIFICATION
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
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// ============================================
// BACKEND API URL (YOUR RENDER URL)
// ============================================

const API_URL = 'https://gliimu-secure-api.onrender.com'; // ⚠️ REPLACE WITH YOUR RENDER URL

// ============================================
// DOM ELEMENTS
// ============================================

const elements = {
    resetForm: document.getElementById('resetForm'),
    username: document.getElementById('username'),
    recoveryPhrase: document.getElementById('recoveryPhrase'),
    birthDay: document.getElementById('birthDay'),
    birthMonth: document.getElementById('birthMonth'),
    newPassword: document.getElementById('newPassword'),
    confirmPassword: document.getElementById('confirmPassword'),
    
    modal: document.getElementById('successModal'),
    modalUsername: document.getElementById('modalUsername'),
    modalPassword: document.getElementById('modalPassword'),
    modalPhrase: document.getElementById('modalPhrase'),
    
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
// GENERATE RECOVERY PHRASE (Frontend)
// ============================================

function generateRecoveryPhrase() {
    const words = [
        'blue', 'ocean', 'golden', 'sunset', 'brave', 'tiger', 'swift', 'eagle',
        'calm', 'river', 'mountain', 'forest', 'storm', 'thunder', 'peace', 'light',
        'shadow', 'dream', 'wonder', 'magic', 'silent', 'wisdom', 'courage', 'honor'
    ];
    
    const phrase = [];
    for (let i = 0; i < 6; i++) {
        phrase.push(words[Math.floor(Math.random() * words.length)]);
    }
    return phrase.join('-');
}

// ============================================
// POPULATE DROPDOWNS
// ============================================

function populateDropdowns() {
    const daySelect = elements.birthDay;
    for (let i = 1; i <= 31; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        daySelect.appendChild(opt);
    }
    
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

document.getElementById('togglePassword')?.addEventListener('click', function() {
    const input = document.getElementById('newPassword');
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

elements.newPassword?.addEventListener('input', function() {
    const result = checkStrength(this.value);
    elements.strengthBar.innerHTML = `<div class="bar-fill ${result.class}" style="width: ${result.width}%"></div>`;
    elements.strengthText.textContent = result.label;
    elements.strengthText.className = `strength-text ${result.class}`;
    checkPasswordMatch();
});

elements.confirmPassword?.addEventListener('input', checkPasswordMatch);

function checkPasswordMatch() {
    const password = elements.newPassword.value;
    const confirm = elements.confirmPassword.value;
    
    if (!confirm) {
        elements.matchText.textContent = '';
        elements.matchText.className = 'match-text';
        return;
    }
    
    if (password === confirm) {
        elements.matchText.textContent = '✅ Passwords match';
        elements.matchText.className = 'match-text match';
    } else {
        elements.matchText.textContent = '❌ Passwords do not match';
        elements.matchText.className = 'match-text no-match';
    }
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
    if (typeof window.jspdf === 'undefined') {
        showToast('PDF library is loading. Please try again.', 'warning');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    doc.setFillColor(44, 47, 120);
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('Gliimu Institute', pageWidth / 2, 25, { align: 'center' });
    
    doc.setTextColor(44, 47, 120);
    doc.setFontSize(16);
    doc.text('New Account Credentials', pageWidth / 2, 60, { align: 'center' });
    
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(10);
    doc.text('⚠️ IMPORTANT: Save this document securely', pageWidth / 2, 75, { align: 'center' });
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text('Your New Account Details:', 20, 95);
    
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(`Username: ${data.username}`, 20, 115);
    doc.text(`New Password: ${data.newPassword}`, 20, 130);
    doc.text(`New Recovery Phrase: ${data.newRecoveryPhrase}`, 20, 145);
    
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(10);
    const warningY = 175;
    doc.text('❗ Keep this recovery phrase safe!', 20, warningY);
    doc.text('❗ You will need it to reset your password if you forget it.', 20, warningY + 12);
    doc.text('❗ This information will not be shown again.', 20, warningY + 24);
    
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, pageHeight - 20);
    doc.text('© Gliimu Institute of Media Technologies Ltd.', pageWidth / 2, pageHeight - 10, { align: 'center' });
    
    doc.save(`Gliimu_Credentials_${data.username}.pdf`);
    showToast('PDF downloaded successfully!', 'success');
}

// ============================================
// MAIN FORM SUBMISSION (Using Backend)
// ============================================

elements.resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = elements.username.value.trim();
    const recoveryPhrase = elements.recoveryPhrase.value.trim();
    const birthDay = parseInt(elements.birthDay.value);
    const birthMonth = parseInt(elements.birthMonth.value);
    const newPassword = elements.newPassword.value;
    const confirmPassword = elements.confirmPassword.value;
    
    if (!username || !recoveryPhrase || !birthDay || !birthMonth || !newPassword) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    if (recoveryPhrase.split('-').length !== 6) {
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
    
    elements.submitBtn.disabled = true;
    elements.submitBtn.innerHTML = '<span class="spinner"></span> Resetting...';
    
    try {
        // Call your secure backend on Render
        const response = await fetch(`${API_URL}/api/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username,
                recoveryPhrase,
                birthDay,
                birthMonth,
                newPassword
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Password reset failed');
        }

        if (result.success) {
            showToast('Password reset successfully! 🎉', 'success');
            showSuccess({
                username: result.data.username,
                newPassword: result.data.newPassword,
                newRecoveryPhrase: result.data.newRecoveryPhrase
            });
        } else {
            showToast(result.message || 'Reset failed', 'error');
        }
        
    } catch (error) {
        console.error('Reset error:', error);
        showToast(error.message || 'An error occurred. Please try again.', 'error');
    } finally {
        elements.submitBtn.disabled = false;
        elements.submitBtn.innerHTML = '<i class="fas fa-save"></i> Reset Password';
    }
});

// ============================================
// MODAL CONTROLS
// ============================================

elements.closeModal.addEventListener('click', closeModal);
elements.goToSignin.addEventListener('click', () => {
    closeModal();
    window.location.href = '/signin.html';
});

elements.copyPassword.addEventListener('click', async () => {
    const text = elements.modalPassword.textContent;
    try {
        await navigator.clipboard.writeText(text);
        showToast('Password copied to clipboard!', 'success');
    } catch {
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

elements.downloadPdf.addEventListener('click', () => {
    const data = {
        username: elements.modalUsername.textContent,
        newPassword: elements.modalPassword.textContent,
        newRecoveryPhrase: elements.modalPhrase.textContent
    };
    generatePDF(data);
});

window.addEventListener('click', (e) => {
    if (e.target === elements.modal) closeModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.modal.classList.contains('active')) {
        closeModal();
    }
});

// ============================================
// INIT
// ============================================

populateDropdowns();
console.log('🔐 Forgot Password ready (using Render backend)');
console.log(`📡 API URL: ${API_URL}`);
