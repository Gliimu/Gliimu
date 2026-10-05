import { supabase } from '/shared/js/config.js';
import { API_BASE_URL } from '/shared/js/config.js';

document.addEventListener('DOMContentLoaded', async () => {
  // ============================================
  // Auto-redirect if already logged in
  // ============================================
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
      const overlay = document.getElementById('auth-bg-overlay');

      if (data.hero_video_url) {
        source.src = data.hero_video_url;
        video.load();
        video.play().catch(err => {
          // If iOS blocks autoplay, hide video and show fallback image on the overlay
          video.style.display = 'none';
          if (data.hero_fallback_image_url) {
            overlay.style.backgroundImage = `url('${data.hero_fallback_image_url}')`;
            overlay.style.backgroundSize = 'cover';
            overlay.style.backgroundPosition = 'center';
          }
        });
      }
    }
  }
  loadAuthVideo();

  // ============================================
  // Load Terms & Policy from Database
  // ============================================
  // Shown when the legal_documents row is missing or unreachable, so the
  // agreement is never silently blank at signup.
  const FALLBACK_TERMS = `
<p style="margin-bottom: 12px;"><strong>Last Updated:</strong> October 2024</p>
<p style="margin-bottom: 16px;">Welcome to Gliimu. By creating an account, you explicitly agree to the following binding terms:</p>

<p style="margin-bottom: 6px;"><strong>1. Eligibility &amp; The Elite Standard</strong></p>
<p style="margin-bottom: 16px;">You must be at least 16 years old to use Gliimu. By registering, you legally attest to this age requirement. Gliimu trains "Full Stack Media Architects"&mdash;individuals transitioning from traditional employment to self-sustaining independence. We provide elite skill acquisition and networking infrastructure. We explicitly do not guarantee employment, specific financial outcomes, or client acquisition. Your success is entirely dependent on your own effort, application of skills, and market conditions.</p>

<p style="margin-bottom: 6px;"><strong>2. Code of Conduct &amp; Termination</strong></p>
<p style="margin-bottom: 16px;">You agree to maintain professional, respectful, and ethical conduct at all times. Gliimu reserves the unilateral right to suspend or permanently terminate your account, access to Triads, and platform features immediately, without prior notice or refund, if you engage in: plagiarism, intellectual property theft, harassment, hate speech, scamming, or any behavior that fundamentally contradicts the elite, self-sustaining culture of the platform. Gliimu reserves the right to define disruptive behavior at its sole discretion.</p>

<p style="margin-bottom: 6px;"><strong>3. Tuition, Fees &amp; Refund Policy</strong></p>
<p style="margin-bottom: 16px;">Tuition is priced at a premium tier ranging from &#8358;70,000 to &#8358;780,000 based on your selected subscription plan to reflect the absolute value of the program. All payments are final and strictly non-refundable once access to the curriculum and platform features is granted. Gliimu retains the sole and absolute discretion to issue a refund in exceptional, documented cases of verifiable platform failure, but is under no legal obligation to do so.</p>

<p style="margin-bottom: 6px;"><strong>4. Earnings, Revenue Share, &amp; Withdrawals</strong></p>
<p style="margin-bottom: 16px;">You may generate revenue by completing real client gigs and receiving digital appreciation (donations/tips) during live sessions. Gliimu automatically deducts a 10% platform fee from all gross earnings before they are credited to your internal wallet. Earnings generated prior to graduation are held in your internal Gliimu wallet. You are strictly prohibited from withdrawing these internal funds to external bank accounts until your entire tuition balance is paid in full. Once tuition is cleared, standard withdrawal requests are processed within 24 hours. You are responsible for any third-party payment gateway fees or tax liabilities applicable to your earnings.</p>

<p style="margin-bottom: 6px;"><strong>5. Intellectual Property &amp; Ownership</strong></p>
<p style="margin-bottom: 16px;">You retain all rights to your personal name, likeness, and pre-existing portfolio. For internal apprenticeship curriculum projects created solely for skill demonstration, Gliimu retains a perpetual, royalty-free license to use, reproduce, and display said content for educational and promotional purposes. However, for "real client gigs" facilitated or completed through the platform, the intellectual property rights are strictly governed by the agreement between you and the paying client, provided Gliimu's 10% platform fee is honored. Gliimu will never use your personal identity for external marketing without your explicit, written consent.</p>

<p style="margin-bottom: 6px;"><strong>6. Account Security &amp; Authentication</strong></p>
<p style="margin-bottom: 16px;">Gliimu utilizes a privacy-first, cryptographic authentication system. We do not collect or store email addresses or traditional Personally Identifiable Information (PII) for password recovery. Upon account creation, you are issued a unique 16-word recovery phrase. You are solely and exclusively responsible for safeguarding this phrase and your password. If you lose both your password and your 16-word recovery phrase, your account, digital assets, and internal wallet funds become permanently inaccessible. Gliimu has no administrative override, backend access, or capability to recover your account, reset your password, or restore lost funds under any circumstances.</p>

<p style="margin-bottom: 6px;"><strong>7. Limitation of Liability &amp; Third-Party Services</strong></p>
<p style="margin-bottom: 16px;">The Gliimu platform operates on third-party infrastructure (including but not limited to Supabase, Render, Cloudflare, and Paystack). Gliimu is not liable for any service interruptions, data loss, security breaches, or technical failures originating from these external providers. Furthermore, Gliimu is provided on an "AS IS" basis without warranties of any kind. Under no circumstances shall Gliimu, its directors, or affiliates be liable for indirect, incidental, or consequential damages, including loss of profits or client revenue, resulting from your use of or inability to use the platform.</p>
`;

  async function loadTermsAndPolicy() {
    const { data } = await supabase
      .from('legal_documents')
      .select('content')
      .eq('type', 'terms')
      .single();

    const container = document.getElementById('terms-content-container');
    if (!container) return;
    container.innerHTML = (data && data.content) ? data.content : FALLBACK_TERMS;
  }
  loadTermsAndPolicy();

  // ============================================
  // Tab Switching
  // ============================================
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

      // Checkbox Check
      if (!document.getElementById('agree-terms').checked) {
        return alert('You must agree to the terms and policy to create an account.');
      }

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
    downloadRecoveryPDF(phrase, false);
  });

  document.getElementById('proceed-to-dashboard-btn').addEventListener('click', () => window.location.href = '/dashboard/index.html');

  // ============================================
  // TERMS MODAL LOGIC
  // ============================================
  document.getElementById('terms-link').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('terms-modal').style.display = 'flex';
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
