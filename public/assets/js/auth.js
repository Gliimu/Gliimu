import { supabase } from '../../shared/js/config.js';

document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.auth-tab');
  const forms = document.querySelectorAll('.auth-form');
  const authView = document.getElementById('auth-view');
  const recoveryView = document.getElementById('recovery-view');

  // Tab Switching
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

  // Generate a random 16-word phrase
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

  // Handle Log In
  const loginForm = document.getElementById('login-form');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const fakeEmail = `${username}@gliimu.app`; // Supabase requires email format

    const { data, error } = await supabase.auth.signInWithPassword({
      email: fakeEmail,
      password: password,
    });

    if (error) {
      alert('Error logging in: ' + error.message);
    } else {
      window.location.href = '/dashboard/index.html';
    }
  });

  // Handle Join Us (Sign Up)
  const joinForm = document.getElementById('join-form');
  joinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('join-name').value.trim();
    const username = document.getElementById('join-username').value.trim().toLowerCase();
    const password = document.getElementById('join-password').value;
    const confirmPass = document.getElementById('join-confirm').value;

    if (password !== confirmPass) {
      alert('Passwords do not match!');
      return;
    }

    const fakeEmail = `${username}@gliimu.app`;
    const recoveryPhrase = generateRecoveryPhrase();

    // Sign up user in Supabase
    const { data, error } = await supabase.auth.signUp({
      email: fakeEmail,
      password: password,
      options: {
        data: {
          full_name: fullName,
          username: username,
          recovery_phrase: recoveryPhrase // Save to user metadata for later verification
        }
      }
    });

    if (error) {
      alert('Error signing up: ' + error.message);
    } else {
      // Switch to Recovery View
      authView.style.display = 'none';
      recoveryView.style.display = 'block';
      document.getElementById('recovery-phrase').value = recoveryPhrase;
    }
  });

  // Handle PDF Download
  document.getElementById('download-pdf-btn').addEventListener('click', () => {
    const phrase = document.getElementById('recovery-phrase').value;
    const enteredPassword = document.getElementById('recovery-password').value;
    const actualPassword = document.getElementById('join-password').value;

    if (enteredPassword !== actualPassword) {
      alert('Password does not match the one you just created.');
      return;
    }

    // Generate PDF using jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(22);
    doc.setTextColor(99, 102, 241); // Gliimu Indigo
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
});
