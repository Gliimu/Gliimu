import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';
import { uploadFile } from '../upload.js';
import { notify } from '../notify.js?v=32';

const APP_VERSION_KEY = 'gliimu_app_version';
const SOUND_KEY = 'gliimu_notification_sound';
const SOUND_PREFS = ['off', 'default', 'crunch'];

function soundPref() {
  const saved = localStorage.getItem(SOUND_KEY);
  return SOUND_PREFS.includes(saved) ? saved : 'default';
}

function parseVersion(v) {
  return String(v || '0').split('.').map(n => parseInt(n, 10) || 0);
}

function isNewerVersion(candidate, baseline) {
  const a = parseVersion(candidate);
  const b = parseVersion(baseline);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

export default {
  title: 'Settings',
  template: `
    <div class="settings-layout">

      <!-- General Settings -->
      <div class="card settings-card">
        <h2>General</h2>
        <div class="setting-row">
          <div>
            <span class="setting-title">Appearance</span>
            <span class="setting-desc">Switch between light and dark themes.</span>
          </div>
          <button class="theme-toggle-btn" onclick="toggleTheme()">
            <svg id="sun-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
            <svg id="moon-icon" style="display:none;" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
          </button>
        </div>
      </div>

      <!-- Notification Sound -->
      <div class="card settings-card">
        <h2>Notification Sound</h2>
        <div class="setting-row sound-row">
          <div>
            <span class="setting-title">Alert sound</span>
            <span class="setting-desc">Choose what plays when a new message arrives.</span>
          </div>
          <div class="sound-options" id="sound-options">
            <button type="button" class="sound-opt" data-sound="off">Off</button>
            <button type="button" class="sound-opt" data-sound="default">Default</button>
            <button type="button" class="sound-opt" data-sound="crunch">Crunch</button>
          </div>
        </div>
      </div>

      <!-- Profile Settings -->
      <div class="card settings-card">
        <h2>Profile</h2>
        <div class="avatar-upload-section">
          <img id="avatar-preview" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23F1F5F9'/%3E%3C/svg%3E" class="settings-avatar" alt="Avatar">
          <div>
            <input type="file" id="avatar-input" accept="image/*" style="display: none;">
            <button type="button" class="btn-secondary" id="upload-avatar-btn">Change Picture</button>
          </div>
        </div>
        <form id="profile-form" style="margin-top: 24px;">
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" id="settings-name" class="input">
          </div>
          <div class="form-group">
            <label>Username</label>
            <input type="text" id="settings-username" class="input" disabled style="opacity: 0.6; cursor: not-allowed;">
          </div>
          <div class="form-group">
            <label>Bio</label>
            <textarea id="settings-bio" class="input" rows="3"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex: 1; margin-right: 12px;">
              <label>Skills (Comma separated)</label>
              <input type="text" id="settings-skills" class="input">
            </div>
            <div class="form-group" style="flex: 1;">
              <label>Interests (Comma separated)</label>
              <input type="text" id="settings-interests" class="input">
            </div>
          </div>
          <button type="submit" class="btn-primary">Save Changes</button>
        </form>
      </div>

      <!-- Security Settings -->
      <div class="card settings-card">
        <h2>Security & Password</h2>
        <form id="password-form">
          <div class="form-group">
            <label>New Password</label>
            <input type="password" id="new-pass" class="input" placeholder="Min. 8 characters">
          </div>
          <div class="form-group">
            <label>Verify Identity: Current Password</label>
            <input type="password" id="current-pass" class="input" placeholder="Enter current password">
          </div>
          <div class="separator">OR</div>
          <div class="form-group">
            <label>Verify Identity: Recovery Passphrase</label>
            <input type="text" id="recovery-phrase-input" class="input" placeholder="Enter your recovery phrase">
          </div>
          <button type="submit" class="btn-primary">Update Password</button>
        </form>
      </div>

      <!-- App Updates -->
      <div class="card settings-card">
        <h2>App Updates</h2>
        <div class="setting-row">
          <div>
            <span class="setting-title">Installed Edition</span>
            <span class="setting-desc" id="installed-version">Checking…</span>
          </div>
          <button type="button" class="btn-secondary" id="check-update-btn">Check for Updates</button>
        </div>
        <div id="update-result"></div>
      </div>

      <!-- Session -->
      <div class="card settings-card">
        <h2>Session</h2>
        <button type="button" id="logout-btn" class="btn-secondary">Log Out</button>
      </div>

      <!-- Danger Zone -->
      <div class="card settings-card danger-zone">
        <h2>Danger Zone</h2>
        <div id="danger-normal">
          <p class="danger-text">Deleting your account removes your profile, posts, messages and wallet. You have a 3-day grace period — sign back in before it ends to recover your account. After that, the deletion is permanent and cannot be undone.</p>
          <button type="button" class="btn-danger" id="delete-account-btn">Delete Account</button>
        </div>
        <div id="danger-scheduled" style="display:none;">
          <p class="danger-text">Your account is scheduled for deletion on <strong id="deletion-date"></strong>. Sign back in any time before then and your account will be recovered automatically.</p>
          <button type="button" class="btn-secondary" id="cancel-deletion-btn">Cancel Deletion Request</button>
        </div>
      </div>

    </div>

    <!-- Delete account confirmation -->
    <div class="modal-overlay" id="delete-modal" style="display:none;">
      <div class="modal-content danger-modal">
        <h3 class="danger-title">ARE YOU SURE YOU WANT TO DELETE YOUR ACCOUNT?</h3>
        <p class="danger-text">This action can't be undone. Your account will be scheduled for deletion and permanently erased in 3 days unless you sign back in to recover it.</p>
        <div class="form-group">
          <label>Recovery Passphrase or Password</label>
          <input type="text" id="delete-passphrase" class="input" placeholder="Enter your recovery passphrase or account password" autocomplete="off">
        </div>
        <p class="danger-error" id="delete-error" style="display:none;"></p>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="delete-cancel-btn">Cancel</button>
          <button type="button" class="btn-danger" id="delete-confirm-btn">Delete</button>
        </div>
      </div>
    </div>
  `,
  async init() {
    window.settingsInstance = this;

    // Mobile bottom bar hint
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    if (topbarDynamic) topbarDynamic.innerHTML = `<span class="mobile-bar-hint">Set up your account and details</span>`;

    // Sync theme icons when the view loads
    if (typeof updateThemeIcon === 'function') updateThemeIcon();

    // App Updates
    document.getElementById('check-update-btn').addEventListener('click', () => this.checkForUpdates(true));
    this.checkForUpdates(false);

    // Fetch Profile Data. Explicit columns (never select('*')) because the
    // profiles.username column is revoked from authenticated; username is
    // shown from the JWT-sourced store.profile.username instead.
    const { data: profile } = await supabase.from('profiles').select('full_name, bio, skills, interests, avatar_url').eq('id', store.user.id).single();
    if (profile) {
      document.getElementById('settings-name').value = profile.full_name || '';
      document.getElementById('settings-username').value = store.profile?.username || '';
      document.getElementById('settings-bio').value = profile.bio || '';
      document.getElementById('settings-skills').value = profile.skills || '';
      document.getElementById('settings-interests').value = profile.interests || '';
      if (profile.avatar_url) {
        document.getElementById('avatar-preview').src = profile.avatar_url + `?t=${Date.now()}`;
      }
    }

    // Handle Avatar Upload
    const fileInput = document.getElementById('avatar-input');
    document.getElementById('upload-avatar-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      let avatarUrl;
      try {
        avatarUrl = await uploadFile(file, 'avatar');
      } catch (err) {
        return alert("Error uploading image: " + (err.message || err));
      }
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', store.user.id);
      if (updateError) return alert("Error saving profile picture.");
      document.getElementById('avatar-preview').src = avatarUrl + `?t=${Date.now()}`;
      alert("Profile picture updated!");
    });

    // Handle Profile Update
    document.getElementById('profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const updates = {
        full_name: document.getElementById('settings-name').value,
        bio: document.getElementById('settings-bio').value,
        skills: document.getElementById('settings-skills').value,
        interests: document.getElementById('settings-interests').value
      };
      const { error } = await supabase.from('profiles').update(updates).eq('id', store.user.id);
      if (error) alert("Error updating profile.");
      else alert("Profile saved successfully!");
    });

    // Handle Password Update
    document.getElementById('password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPass = document.getElementById('new-pass').value;
      const currentPass = document.getElementById('current-pass').value;
      const passPhrase = document.getElementById('recovery-phrase-input').value.trim();

      if (newPass.length < 8) return alert("Password must be at least 8 characters.");
      if (!currentPass && !passPhrase) return alert("Please verify your identity.");

      let isVerified = false;

      if (currentPass) {
        const fakeEmail = `${store.profile.username}@gliimu.app`;
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: fakeEmail, password: currentPass });
        if (signInError) return alert("Current password is incorrect.");
        isVerified = true;
      }

      if (!isVerified && passPhrase) {
        const { data: profileData } = await supabase.from('profiles').select('recovery_phrase').eq('id', store.user.id).single();
        if (profileData.recovery_phrase !== passPhrase) return alert("Recovery passphrase is incorrect.");
        await supabase.auth.refreshSession();
        isVerified = true;
      }

      if (isVerified) {
        const { error: updateError } = await supabase.auth.updateUser({ password: newPass });
        if (updateError) alert("Error updating password: " + updateError.message);
        else {
          alert("Password updated successfully! Please log in with your new password.");
          store.signOut();
        }
      }
    });

    // Handle Logout
    document.getElementById('logout-btn').addEventListener('click', () => store.signOut());

    // Notification Sound preference. Saved to both localStorage (instant,
    // read by notify.js on every ping) and user_metadata (syncs the choice
    // across devices on next login).
    this.renderSoundOptions();
    document.getElementById('sound-options').addEventListener('click', async (e) => {
      const btn = e.target.closest('.sound-opt');
      if (!btn) return;
      const pref = btn.dataset.sound;
      if (!SOUND_PREFS.includes(pref)) return;
      localStorage.setItem(SOUND_KEY, pref);
      this.renderSoundOptions();
      notify.sound();
      const { error } = await supabase.auth.updateUser({ data: { notification_sound: pref } });
      if (error) alert('Could not save your sound preference.');
    });

    // Danger Zone
    this.loadDeletionState();

    document.getElementById('delete-account-btn').addEventListener('click', () => {
      document.getElementById('delete-passphrase').value = '';
      const errEl = document.getElementById('delete-error');
      errEl.style.display = 'none';
      document.getElementById('delete-modal').style.display = 'flex';
    });

    document.getElementById('delete-cancel-btn').addEventListener('click', () => {
      document.getElementById('delete-modal').style.display = 'none';
    });

    document.getElementById('delete-confirm-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const errEl = document.getElementById('delete-error');
      errEl.style.display = 'none';

      const secret = document.getElementById('delete-passphrase').value.trim();
      if (!secret) {
        errEl.textContent = 'Enter your recovery passphrase or account password.';
        errEl.style.display = 'block';
        return;
      }

      btn.disabled = true;
      try {
        // Either credential unlocks the deletion: the recovery passphrase
        // (compared locally) or the account password (verified with a real
        // Supabase sign-in, which also refreshes the session in place).
        // store.user.email is the synthetic "<username>@gliimu.app" address
        // every member is signed up with (auth.js), so the password grant
        // targets the right auth user.
        let verified = false;
        const { data: row } = await supabase.from('profiles')
          .select('recovery_phrase').eq('id', store.user.id).maybeSingle();
        if (row && row.recovery_phrase && row.recovery_phrase === secret) {
          verified = true;
        } else {
          const { error: pwError } = await supabase.auth.signInWithPassword({ email: store.user.email, password: secret });
          if (!pwError) verified = true;
          else if (pwError.status !== 400) {
            errEl.textContent = 'Verification failed. Please try again.';
            errEl.style.display = 'block';
            return;
          }
        }

        if (!verified) {
          errEl.textContent = 'Passphrase or password is incorrect.';
          errEl.style.display = 'block';
          return;
        }

        const { data, error } = await supabase.rpc('request_account_deletion');
        if (error || !data || data.ok !== true) {
          errEl.textContent = 'Could not schedule the deletion. Please try again.';
          errEl.style.display = 'block';
          return;
        }

        document.getElementById('delete-modal').style.display = 'none';
        alert('Your account is scheduled for deletion. You have 3 days to sign back in and recover it. You will now be logged out.');
        store.signOut();
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('cancel-deletion-btn').addEventListener('click', async () => {
      await supabase.rpc('cancel_account_deletion');
      this.loadDeletionState();
    });
  },

  renderSoundOptions() {
    const current = soundPref();
    document.querySelectorAll('#sound-options .sound-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sound === current);
    });
  },

  async loadDeletionState() {
    const { data: row } = await supabase.from('profiles')
      .select('deletion_requested_at, deletion_scheduled_at')
      .eq('id', store.user.id)
      .maybeSingle();
    const pending = !!(row && row.deletion_scheduled_at && new Date(row.deletion_scheduled_at) > new Date());
    document.getElementById('danger-normal').style.display = pending ? 'none' : 'block';
    document.getElementById('danger-scheduled').style.display = pending ? 'block' : 'none';
    if (pending) {
      document.getElementById('deletion-date').textContent =
        new Date(row.deletion_scheduled_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    }
  },

  async checkForUpdates(manual) {
    const installedEl = document.getElementById('installed-version');
    const resultEl = document.getElementById('update-result');
    const btn = document.getElementById('check-update-btn');
    if (!installedEl || !resultEl) return;

    const installed = localStorage.getItem(APP_VERSION_KEY);
    installedEl.innerText = installed ? `Gliimu Web v${installed}` : 'Gliimu Web';

    if (manual && btn) { btn.disabled = true; btn.innerText = 'Checking…'; }

    try {
      const res = await fetch(`/version.json?t=${Date.now()}`);
      const latest = await res.json();

      if (!installed) {
        // First check on this browser: it is already running the newest edition
        localStorage.setItem(APP_VERSION_KEY, latest.version);
        installedEl.innerText = `Gliimu Web v${latest.version}`;
        resultEl.innerHTML = `<p class="update-msg">You're on the latest edition (v${latest.version}).</p>`;
        return;
      }

      if (isNewerVersion(latest.version, installed)) {
        resultEl.innerHTML = `
          <div class="update-available">
            <p class="update-msg"><strong>v${latest.version}</strong> is now available${latest.released ? ` — released ${latest.released}` : ''}.</p>
            ${latest.notes ? `<p class="update-notes">${latest.notes}</p>` : ''}
            <div class="update-actions">
              ${latest.download_url ? `<a class="btn-secondary" href="${latest.download_url}" download>Download Edition</a>` : ''}
              <button type="button" class="btn-primary" onclick="settingsInstance.applyUpdate('${latest.version}')">Update to v${latest.version}</button>
            </div>
          </div>
        `;
      } else {
        resultEl.innerHTML = `<p class="update-msg">You're on the latest edition (v${installed}).</p>`;
      }
    } catch (err) {
      resultEl.innerHTML = `<p class="update-msg update-error">Could not check for updates. Please try again later.</p>`;
    } finally {
      if (manual && btn) { btn.disabled = false; btn.innerText = 'Check for Updates'; }
    }
  },

  applyUpdate(version) {
    localStorage.setItem(APP_VERSION_KEY, version);
    const installedEl = document.getElementById('installed-version');
    if (installedEl) installedEl.innerText = `Gliimu Web v${version}`;
    const resultEl = document.getElementById('update-result');
    if (resultEl) {
      resultEl.innerHTML = `
        <div class="update-available">
          <p class="update-msg">Updated to v${version}. Reload to start using the newest edition.</p>
          <div class="update-actions">
            <button type="button" class="btn-primary" onclick="location.reload()">Reload Now</button>
          </div>
        </div>
      `;
    }
  }
};
