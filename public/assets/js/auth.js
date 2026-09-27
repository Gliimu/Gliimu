import { supabase } from '/shared/js/config.js';
import { API_BASE_URL } from '/shared/js/config.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Auto-redirect if already logged in
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = '/dashboard/index.html';
    return;
  }

  // ============================================
  // Load Video Settings from Database
  // ============================================
  async function loadAuthVideo() {
    const { data } = await supabase.from('site_settings').select('hero_video_url, hero_fallback_image_url').single();
    if (data) {
      const video = document.getElementById('auth-video');
      const source = document.getElementById('auth-video-src');
      const panel = document.getElementById('auth-brand-panel');

      if (data.hero_video_url) {
        source.src = data.hero_video_url;
        video.load();
        video.play().catch(err => {
          // If iOS blocks autoplay, hide video and show fallback image
          video.style.display = 'none';
          if (data.hero_fallback_image_url) {
            panel.style.backgroundImage = `url('${data.hero_fallback_image_url}')`;
            panel.style.backgroundSize = 'cover';
            panel.style.backgroundPosition = 'center';
          }
        });
      }
    }
  }
  loadAuthVideo();

  const tabs = document.querySelectorAll('.auth-tab');
  const forms = document.querySelectorAll('.auth-form');
  const authCard = document.querySelector('.auth-card');
  const recoveryView = document.getElementById('recovery-view');

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

  function generateRecoveryPhrase() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let phrase = [];
    for (let i = 0; i < 4; i++) {
      let block = '';
      for (let j = 0; j < 4; j++) block += chars.charAt(Math.floor(Math.random() * chars.length));
      phrase.push(block);
    }
    return phrase.join('-');
  }

  // ============================================
  // Live Username Availability Checker
  // ============================================
  const usernameInput = document.getElementById('join-username');
  const usernameCheck = document.getElementById('username-check');
  let usernameTimer = null;

  usernameInput.addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    usernameCheck.innerText = '';
    usernameCheck.className = 'username-check';

    clearTimeout(usernameTimer);
    if (val.length < 3) return;

    usernameCheck.innerText = 'Checking...';
    usernameCheck.style.color = 'var(--text-muted)';

    usernameTimer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('is_username_taken', { input_username: val });

      if (error) {
        usernameCheck.innerText = 'Error checking username.';
        usernameCheck.style.color = 'var(--error)';
        return;
      }

      if (data === true) {
        const suggestion = val + Math.floor(Math.random() * 90 + 10);
        usernameCheck.innerText = `This username is already used. Try ${suggestion}`;
        usernameCheck.style.color = 'var(--error)';
      } else {
        usernameCheck.innerText = 'This username is available';
        usernameCheck.style.color = 'var(--success)';
      }
    }, 400);
  });

  // Handle Log In
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const fakeEmail = `${username}@gliimu.app`;

    const { data, error } = await supabase.auth.signInWithPassword({ email: fakeEmail, password });
    if (error) alert('Error logging in: ' + error.message);
    else window.location.href = '/dashboard/index.html';
  });

  // Handle Join Us
  document.getElementById('join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (usernameCheck.style.color === 'var(--error)') return alert('Please choose an available username.');

    const fullName = document.getElementById('join-name').value.trim();
    const username = document.getElementById('join-username').value.trim().toLowerCase();
    const password = document.getElementById('join-password').value;
    const confirmPass = document.getElementById('join-confirm').value;

    if (password !== confirmPass) return alert('Passwords do not match!');
    if (password.length < 8) return alert('Password must be at least 8 characters.');

    const fakeEmail = `${username}@gliimu.app`;
    const recoveryPhrase = generateRecoveryPhrase();

    const { error } = await supabase.auth.signUp({
      email: fakeEmail,
      password,
      options: { data: { full_name: fullName, username, recovery_phrase: recoveryPhrase } }
    });

    if (error) alert('Error signing up: ' + error.message);
    else {
      authCard.style.display = 'none';
      recoveryView.style.display = 'block';
      document.getElementById('recovery-phrase').value = recoveryPhrase;
    }
  });

  // Handle PDF Download (Signup)
  document.getElementById('download-pdf-btn').addEventListener('click', () => {
    const phrase = document.getElementById('recovery-phrase').value;
    const enteredPassword = document.getElementById('recovery-password').value;
    const actualPassword = document.getElementById('join-password').value;

    if (enteredPassword !== actualPassword) return alert('Password does not match the one you just created.');
    downloadRecoveryPDF(phrase, false);
  });

  document.getElementById('proceed-to-dashboard-btn').addEventListener('click', () => window.location.href = '/dashboard/index.html');

  // ============================================
  // FORGOT PASSWORD MODAL LOGIC
  // ============================================
  const forgotModal = document.getElementById('forgot-modal');
  document.getElementById('forgot-link').addEventListener('click', (e) => {
    e.preventDefault();
    forgotModal.style.display = 'flex';
  });

  document.getElementById('verify-recovery-btn').addEventListener('click', () => {
    const username = document.getElementById('forgot-username').value.trim().toLowerCase();
    const phrase = document.getElementById('forgot-phrase').value.trim();
    if (!username || !phrase) return alert('Please enter your username and recovery phrase.');
    document.getElementById('forgot-step-1').style.display = 'none';
    document.getElementById('forgot-step-2').style.display = 'block';
  });

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
        document.getElementById('forgot-step-2').style.display = 'none';
        document.getElementById('forgot-step-3').style.display = 'block';
        document.getElementById('new-recovery-phrase').value = data.newRecoveryPhrase;
      } else {
        alert(data.error || 'Failed to reset password. Check your details.');
        document.getElementById('forgot-step-2').style.display = 'none';
        document.getElementById('forgot-step-1').style.display = 'block';
      }
    } catch (err) {
      alert('Server connection error. Is the backend awake?');
    }
  });

  document.getElementById('download-new-pdf-btn').addEventListener('click', () => {
    const newPhrase = document.getElementById('new-recovery-phrase').value;
    downloadRecoveryPDF(newPhrase, true);
  });

  // ============================================
  // Helper: Generate PDF with Logo
  // ============================================
  async function downloadRecoveryPDF(phrase, isNew) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    try {
      const logoUrl = '/icons/logo.png';
      const response = await fetch(logoUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const base64data = reader.result;

        // Logo dimensions: 35x9.1
        doc.addImage(base64data, 'PNG', 87.5, 22, 35, 9.1);

        doc.setFontSize(22);
        doc.setTextColor(99, 102, 241);
        doc.text("Recovery Kit", 105, 45, { align: 'center' });

        doc.setFontSize(12);
        doc.setTextColor(40, 40, 40);
        if (isNew) {
          doc.text("This is your NEW recovery phrase.", 105, 55, { align: 'center' });
          doc.text("Your old phrase is no longer valid.", 105, 63, { align: 'center' });
        } else {
          doc.text("Keep this document private and secure.", 105, 55, { align: 'center' });
          doc.text("Do not share this phrase with anyone.", 105, 63, { align: 'center' });
        }

        doc.setDrawColor(200, 200, 200);
        doc.roundedRect(20, 75, 170, 30, 3, 3, 'S');
        doc.setFontSize(16);
        doc.setTextColor(15, 23, 42);
        doc.text(phrase, 105, 93, { align: 'center' });

        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text("Gliimu EdTech Platform", 105, 280, { align: 'center' });

        doc.save("Gliimu_Recovery_Kit.pdf");
      };
    } catch (error) {
      console.error("Failed to generate PDF with logo", error);
      alert("Error generating PDF. Please try again.");
    }
  }
});
