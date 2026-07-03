// ============================================
// FORGOT PASSWORD - SIMPLIFIED VERSION
// ============================================

import { supabase } from '../modules/supabase.js';
import { resetPassword } from '../modules/api.js';

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
// TOAST
// ============================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
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
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
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
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFillColor(44, 47, 120);
  doc.rect(0, 0, pageWidth, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text('Gliimu Institute', pageWidth / 2, 25, { align: 'center' });
  
  doc.setTextColor(44, 47, 120);
  doc.setFontSize(16);
  doc.text('New Credentials', pageWidth / 2, 60, { align: 'center' });
  
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.text(`Username: ${data.username}`, 20, 90);
  doc.text(`Password: ${data.newPassword}`, 20, 105);
  doc.text(`Recovery Phrase: ${data.newRecoveryPhrase}`, 20, 120);
  
  doc.setTextColor(200, 0, 0);
  doc.setFontSize(10);
  doc.text('⚠️ Keep this recovery phrase safe!', 20, 150);
  doc.text('This information will not be shown again.', 20, 162);
  
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 270);
  doc.text('© Gliimu Institute of Media Technologies Ltd.', pageWidth / 2, 280, { align: 'center' });
  
  doc.save(`Gliimu_Credentials_${data.username}.pdf`);
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
      showToast('Password reset successfully!', 'success');
      showSuccess(result.data);
    } else {
      showToast(result.message || 'Reset failed', 'error');
    }
  } catch (error) {
    showToast(error.message || 'An error occurred', 'error');
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
  const pwd = elements.newPassword.value;
  const result = checkStrength(pwd);
  elements.strengthBar.innerHTML = `<div class="bar-fill ${result.class}" style="width: ${result.width}%"></div>`;
  elements.strengthText.textContent = result.label;
  elements.strengthText.className = `strength-text ${result.class}`;
});

// Password match
elements.confirmPassword.addEventListener('input', () => {
  const match = elements.newPassword.value === elements.confirmPassword.value;
  elements.matchText.textContent = match ? '✅ Passwords match' : '❌ Passwords do not match';
  elements.matchText.className = `match-text ${match ? 'match' : 'no-match'}`;
});

// Copy buttons
elements.copyPassword.addEventListener('click', () => {
  navigator.clipboard.writeText(elements.modalPassword.textContent);
  showToast('Password copied!', 'success');
});

elements.copyPhrase.addEventListener('click', () => {
  navigator.clipboard.writeText(elements.modalPhrase.textContent);
  showToast('Recovery phrase copied!', 'success');
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

window.addEventListener('click', (e) => {
  if (e.target === elements.modal) closeModal();
});

// ============================================
// INIT
// ============================================

populateDropdowns();

// Check if already logged in
supabase.auth.getSession().then(({ data }) => {
  if (data.session) window.location.href = '/user';
});

console.log('🔐 Forgot Password ready');
