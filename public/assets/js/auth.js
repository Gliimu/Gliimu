import { supabase } from '/shared/js/config.js';
import { API_BASE_URL } from '/shared/js/config.js';

document.addEventListener('DOMContentLoaded', () => {
  // Sync Theme Icons on Load
  if (typeof updateThemeIcon === 'function') updateThemeIcon();

  const tabs = document.querySelectorAll('.auth-tab');
  const forms = document.querySelectorAll('.auth-form');
  const authCard = document.querySelector('.auth-card');
  const recoveryView = document.getElementById('recovery-view');

  // ============================================
  // Tab Switching
  // ============================================
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      forms.forEach(form => {
        form.classList.remove('active');
        if (form.id === `${targetTab}-form`) form.classList.add('active');
      });
    });
  });

  // ============================================
  // Helper: Generate 16-word phrase
  // ============================================
  function generateRecoveryPhrase() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let phrase = [];
    for (let i = 0; i < 4; i++) {
      let block = '';
      for (let j = 0; j < 4; j++) {
        block += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      phrase.push(block);
    }
    return phrase.join('-');
  }

  // ============================================
  // Handle Log In
  // ============================================
  const loginForm = document.getElementById('login-form');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const fakeEmail = `${username}@gliimu.app`;

    const { data, error } = await supabase.auth.signInWithPassword({ email: fakeEmail, password: password });
    if (error) {
      alert('Error logging in: ' + error.message);
    } else {
      window.location.href = '/dashboard/index.html';
    }
  });

  // ============================================
  // Handle Join Us
  // ============================================
  const joinForm = document.getElementById('join-form');
  joinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('join-name').value.trim();
    const username = document.getElementById('join-username').value.trim().toLowerCase();
    const password = document.getElementById('join-password').value;
    const confirmPass = document.getElementById('join-confirm').value;

    if (password !== confirmPass) return alert('Passwords do not match!');
    if (password.length < 8) return alert('Password must be at least 8 characters.');

    const fakeEmail = `${username}@gliimu.app`;
    const recoveryPhrase = generateRecoveryPhrase();

    const { data, error } = await supabase.auth.signUp({
      email: fakeEmail,
      password: password,
      options: {
        data: { full_name: fullName, username: username, recovery_phrase: recoveryPhrase }
      }
    });

    if (error) {
      alert('Error signing up: ' + error.message);
    } else {
      authCard.style.display = 'none';
      recoveryView.style.display = 'block';
      document.getElementById('recovery-phrase').value = recoveryPhrase;
    }
  });

  // ============================================
  // Handle PDF Download (Signup)
  // ============================================
  document.getElementById('download-pdf-btn').addEventListener('click', () => {
    const phrase = document.getElementById('recovery-phrase').value;
    const enteredPassword = document.getElementById('recovery-password').value;
    const actualPassword = document.getElementById('join-password').value;

    if (enteredPassword !== actualPassword) return alert('Password does not match the one you just created.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(22);
    doc.setTextColor(99, 102, 241);
    doc.text("Gliimu Recovery Kit", 105, 30, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text("Keep this document private and secure.", 105, 45, { align: 'center' });
    doc.text("Do not share this phrase with anyone.", 105, 53, { align: 'center' });

    doc.setDrawColor(200, 200, 200);
    doc.roundedRect(20, 65, 170, 30, 3, 3, 'S');
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(phrase, 105, 83, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("Gliimu EdTech Platform", 105, 280, { align: 'center' });

    doc.save("Gliimu_Recovery_Kit.pdf");
  });

  // Proceed to Dashboard
  document.getElementById('proceed-to-dashboard-btn').addEventListener('click', () => {
    window.location.href = '/dashboard/index.html';
  });

  // ============================================
  // FORGOT PASSWORD MODAL LOGIC
  // ============================================
  const forgotModal = document.getElementById('forgot-modal');

  // Open Modal
  document.getElementById('forgot-link').addEventListener('click', (e) => {
    e.preventDefault();
    forgotModal.style.display = 'flex';
  });

  // Step 1: Move to Step 2 (Backend does the actual verification)
  document.getElementById('verify-recovery-btn').addEventListener('click', () => {
    const username = document.getElementById('forgot-username').value.trim().toLowerCase();
    const phrase = document.getElementById('forgot-phrase').value.trim();

    if (!username || !phrase) return alert('Please enter your username and recovery phrase.');

    document.getElementById('forgot-step-1').style.display = 'none';
    document.getElementById('forgot-step-2').style.display = 'block';
  });

  // Step 2 & 3: Verify & Update Password via Backend
  document.getElementById('update-pass-btn').addEventListener('click', async () => {
    const username = document.getElementById('forgot-username').value.trim().toLowerCase();
    const phrase = document.getElementById('forgot-phrase').value.trim();
    const newPass = document.getElementById('forgot-new-pass').value;
    const confirmPass = document.getElementById('forgot-confirm-pass').value;

    if (newPass.length < 8) return alert('Password must be at least 8 characters.');
    if (newPass !== confirmPass) return alert('Passwords do not match.');

    try {
      const response = await fetch(`${API_BASE_URL}/api/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, recoveryPhrase: phrase, newPassword: newPass })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Success! Show the new recovery phrase.
        document.getElementById('forgot-step-2').style.display = 'none';
        document.getElementById('forgot-step-3').style.display = 'block';
        document.getElementById('new-recovery-phrase').value = data.newRecoveryPhrase;
      } else {
        // Backend rejected (e.g. invalid phrase or user not found)
        alert(data.error || 'Failed to reset password. Check your details.');
        // Send them back to step 1 to try again
        document.getElementById('forgot-step-2').style.display = 'none';
        document.getElementById('forgot-step-1').style.display = 'block';
      }
    } catch (err) {
      alert('Server connection error. Is the backend awake?');
    }
  });
});
