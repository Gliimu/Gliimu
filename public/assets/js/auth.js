import { supabase } from '/shared/js/config.js?v=2';
import { API_BASE_URL } from '/shared/js/config.js?v=2';

document.addEventListener('DOMContentLoaded', async () => {
  // The landing page hosts this page inside a slide-over. A frame cannot move
  // the page it sits in, so embedded we report the sign-in to the parent and
  // let it navigate the whole window; on its own it still navigates directly.
  const EMBEDDED = window.self !== window.top;
  if (EMBEDDED) document.body.classList.add('auth-embed');

  const enterApp = () => {
    if (EMBEDDED) window.parent.postMessage('gliimu:signed-in', window.location.origin);
    else window.location.href = 'https://dashboard.gliimu.com/xplore';
  };

  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    enterApp();
    return;
  }

  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) localStorage.setItem('gliimu_ref', ref.trim().toUpperCase());
  } catch (e) {}

  // ============================================
  // Background image (same as landing download section)
  // The slide-over is a narrow column on its own flat ground, so the photo
  // would only cost a request.
  // ============================================
  async function loadAuthBackground() {
    const { data } = await supabase.from('site_settings').select('app_download_bg_url').single();
    const el = document.getElementById('auth-bg-image');
    if (!el) return;
    const bg = (data?.app_download_bg_url || '').trim();
    if (bg) {
      el.style.backgroundImage = `url('${bg}')`;
    }
  }
  if (!EMBEDDED) loadAuthBackground();

  // ============================================
  // Terms & Policy (from legal_documents)
  // The content column is either a URL to an uploaded .docx or inline HTML
  // from before the file upload existed. A .docx is converted to HTML via
  // mammoth; anything else that is not HTML shows a download link.
  // ============================================
  async function loadTermsAndPolicy() {
    const container = document.getElementById('terms-content-container');
    const updatedEl = document.getElementById('terms-updated');
    if (!container) return;

    const { data, error } = await supabase
      .from('legal_documents')
      .select('content, updated_at')
      .eq('type', 'terms')
      .single();

    if (error || !data || !data.content) {
      container.innerHTML = '<p>The terms of service are unavailable right now. Please reload this page before continuing.</p>';
      if (updatedEl) updatedEl.textContent = '';
      return;
    }

    // The stored document opens with a hand-typed "Last Updated" line, and the
    // modal already prints the row's own updated_at below it. Two dates, one of
    // them stale, so the copy inside the body is dropped and the real timestamp
    // stays the single source of truth.
    let hasDateLine = false;
    if (updatedEl && data.updated_at) {
      const d = new Date(data.updated_at);
      updatedEl.textContent = 'Last Updated: ' + d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      hasDateLine = true;
    }

    const dropDateLine = () => {
      if (!hasDateLine) return;
      const first = container.firstElementChild;
      if (first && /^last updated/i.test(first.textContent.trim())) first.remove();
    };

    const raw = data.content.trim();
    const isUrl = /^https?:\/\//.test(raw);

    if (isUrl && /\.docx(\?|$)/i.test(raw)) {
      try {
        const resp = await fetch(raw);
        const buf = await resp.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        container.innerHTML = result.value || '<p>The document is empty.</p>';
        dropDateLine();
      } catch (err) {
        container.innerHTML = `<p>Could not load the terms document.</p>
          <p><a href="${raw}" target="_blank" rel="noopener" class="link-muted">Download the document instead</a></p>`;
      }
      return;
    }

    if (isUrl) {
      const name = raw.split('/').pop() || 'document';
      container.innerHTML = `<p>The terms are stored as a file.</p>
        <p><a href="${raw}" download rel="noopener" class="link-muted">Download ${name}</a></p>`;
      return;
    }

    container.innerHTML = data.content;
    dropDateLine();
  }
  loadTermsAndPolicy();

  // ============================================
  // Tab Switching
  // ============================================
  const tabs = document.querySelectorAll('.auth-tab');
  const forms = document.querySelectorAll('.auth-form');
  const authCard = document.querySelector('.auth-card');
  const recoveryView = document.getElementById('recovery-view');

  function showTab(targetTab) {
    tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === targetTab));
    forms.forEach(form => form.classList.toggle('active', form.id === `${targetTab}-form`));
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => showTab(tab.getAttribute('data-tab')));
  });

  // /auth.html?tab=join is what the landing page's "Join Us" link and the
  // slide-over ask for; anything unknown keeps the default Log In view.
  const wantedTab = new URLSearchParams(window.location.search).get('tab');
  if (wantedTab === 'join' || wantedTab === 'login') showTab(wantedTab);

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

  // ============================================
  // Handle Log In
  // ============================================
  // Signing in is a network round trip and then a hand-off to the dashboard
  // host, so the button carries the wait: it says what it is doing, refuses a
  // second tap, and only falls back when the answer is an error.
  const loginBtn = document.querySelector('#login-form .btn-primary');
  const loginLabel = loginBtn.textContent;
  const showLoginBusy = (label) => {
    loginBtn.disabled = true;
    loginBtn.classList.add('is-loading');
    loginBtn.textContent = '';
    const spinner = document.createElement('span');
    spinner.className = 'btn-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    loginBtn.append(spinner, label);
  };
  const resetLoginBtn = () => {
    loginBtn.disabled = false;
    loginBtn.classList.remove('is-loading');
    loginBtn.textContent = loginLabel;
  };

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginBtn.disabled) return;

    const username = document.getElementById('login-username').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const fakeEmail = `${username}@gliimu.app`;

    showLoginBusy('Signing in…');
    const { error } = await supabase.auth.signInWithPassword({ email: fakeEmail, password });

    if (error) {
      resetLoginBtn();
      await appAlert('Error logging in: ' + error.message);
      return;
    }

    showLoginBusy('Opening your dashboard…');
    enterApp();
  });

  // Handle Join Us
  document.getElementById('join-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!document.getElementById('agree-terms').checked) {
      return appAlert('You must agree to the terms and policy to create an account.');
    }

    if (usernameCheck.style.color === 'var(--error)') return appAlert('Please choose an available username.');

    const fullName = document.getElementById('join-name').value.trim();
    const username = document.getElementById('join-username').value.trim().toLowerCase();
    const password = document.getElementById('join-password').value;
    const confirmPass = document.getElementById('join-confirm').value;

    if (password !== confirmPass) return appAlert('Passwords do not match!');
    if (password.length < 8) return appAlert('Password must be at least 8 characters.');

    const fakeEmail = `${username}@gliimu.app`;
    const recoveryPhrase = generateRecoveryPhrase();

    const { error } = await supabase.auth.signUp({
      email: fakeEmail,
      password,
      options: { data: { full_name: fullName, username, recovery_phrase: recoveryPhrase } }
    });

    if (error) {
      await appAlert('Error signing up: ' + error.message);
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

    if (enteredPassword !== actualPassword) return appAlert('Password does not match the one you just created.');
    downloadRecoveryPDF(phrase, false);
  });

  document.getElementById('proceed-to-dashboard-btn').addEventListener('click', enterApp);

  // ============================================
  // TERMS — a full-screen document
  // ============================================
  // Inside the landing slide-over, opening the terms also asks the parent to
  // widen the drawer to the whole window: several pages of legal text in a
  // 440px column is not easier to read than in a 500px box.
  const termsModal = document.getElementById('terms-modal');
  const tellParent = (message) => {
    if (EMBEDDED) window.parent.postMessage(message, window.location.origin);
  };
  const closeTerms = () => {
    tellParent('gliimu:terms-close');
    termsModal.style.display = 'none';
  };

  document.getElementById('terms-link').addEventListener('click', (e) => {
    e.preventDefault();
    tellParent('gliimu:terms-open');
    termsModal.style.display = 'flex';
  });

  document.getElementById('terms-close-btn').addEventListener('click', closeTerms);

  // The drawer owns the keyboard when the visitor has not clicked into the
  // form, so Escape reaches the parent first and the parent asks back.
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data === 'gliimu:close-terms') closeTerms();
  });

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
    if (!username || !phrase) return appAlert('Please enter your username and recovery phrase.');
    document.getElementById('forgot-step-1').style.display = 'none';
    document.getElementById('forgot-step-2').style.display = 'block';
  });

  document.getElementById('update-pass-btn').addEventListener('click', async () => {
    const username = document.getElementById('forgot-username').value.trim().toLowerCase();
    const phrase = document.getElementById('forgot-phrase').value.trim();
    const newPass = document.getElementById('forgot-new-pass').value;
    const confirmPass = document.getElementById('forgot-confirm-pass').value;

    if (newPass.length < 8) return appAlert('Password must be at least 8 characters.');
    if (newPass !== confirmPass) return appAlert('Passwords do not match.');

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
        await appAlert(data.error || 'Failed to reset password. Check your details.');
        document.getElementById('forgot-step-2').style.display = 'none';
        document.getElementById('forgot-step-1').style.display = 'block';
      }
    } catch (err) {
      await appAlert('Server connection error. Is the backend awake?');
    }
  });

  document.getElementById('download-new-pdf-btn').addEventListener('click', () => {
    const newPhrase = document.getElementById('new-recovery-phrase').value;
    downloadRecoveryPDF(newPhrase, true);
  });

  // A reset is finished with, so the card goes back to the log-in form the
  // member now has a password for. Going to the dashboard from inside the
  // slide-over would only move the frame, so hand it to enterApp() as well.
  function resetForgot() {
    forgotModal.style.display = 'none';
    document.getElementById('forgot-step-2').style.display = 'none';
    document.getElementById('forgot-step-3').style.display = 'none';
    document.getElementById('forgot-step-1').style.display = 'block';
    ['forgot-username', 'forgot-phrase', 'forgot-new-pass', 'forgot-confirm-pass', 'new-recovery-phrase']
      .forEach(id => { document.getElementById(id).value = ''; });
  }
  document.getElementById('forgot-done-btn').addEventListener('click', () => {
    resetForgot();
    showTab('login');
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
      appAlert("Error generating PDF. Please try again.");
    }
  }
});
