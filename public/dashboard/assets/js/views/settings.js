import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

const APP_VERSION_KEY = 'gliimu_app_version';
const SITE_ASSETS_BUCKET = 'site_assets';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(value) {
  const raw = String(value == null ? '' : value).trim();
  return /^https?:\/\//i.test(raw) || /^\/[^/]/.test(raw) ? raw : '';
}

function fileExtension(file) {
  const raw = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return raw || 'png';
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

      <!-- Admin tools (injected for admins only) -->
      <div id="admin-slot"></div>

    </div>
  `,
  async init() {
    window.settingsInstance = this;

    // Mobile bottom bar hint
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    if (topbarDynamic) topbarDynamic.innerHTML = `<span class="mobile-bar-hint">Set up your account and details</span>`;

    // Sync theme icons when the view loads
    if (typeof updateThemeIcon === 'function') updateThemeIcon();

    // Admin-only tools: partner wall and app release
    if (store.profile && store.profile.is_admin) this.initAdmin();

    // App Updates
    document.getElementById('check-update-btn').addEventListener('click', () => this.checkForUpdates(true));
    this.checkForUpdates(false);

    // Fetch Profile Data
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', store.user.id).single();
    if (profile) {
      document.getElementById('settings-name').value = profile.full_name || '';
      document.getElementById('settings-username').value = profile.username || '';
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
      const fileExt = file.name.split('.').pop();
      const fileName = `${store.user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { cacheControl: '3600', upsert: true });
      if (uploadError) return alert("Error uploading image: " + uploadError.message);
      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrlData.publicUrl }).eq('id', store.user.id);
      if (updateError) return alert("Error saving profile picture.");
      document.getElementById('avatar-preview').src = publicUrlData.publicUrl + `?t=${Date.now()}`;
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
  },

  // ============================================
  // ADMIN — LANDING PAGE CONTENT
  // ============================================
  async initAdmin() {
    const slot = document.getElementById('admin-slot');
    if (!slot) return;

    slot.innerHTML = `
      <div class="card settings-card">
        <h2>Partner Wall</h2>
        <p class="setting-desc" style="margin-bottom: 16px;">Logos shown in the "Trusted By" section of the landing page. Lower order numbers come first.</p>
        <div id="admin-partner-list" class="admin-list"><p class="setting-desc">Loading…</p></div>
        <form id="admin-partner-form" style="margin-top: 24px;">
          <div class="form-row">
            <div class="form-group" style="flex: 1; margin-right: 12px;">
              <label>Partner Name</label>
              <input type="text" id="admin-partner-name" class="input" placeholder="e.g. Northwind Studios" required>
            </div>
            <div class="form-group" style="flex: 1;">
              <label>Logo</label>
              <input type="file" id="admin-partner-logo" class="input" accept="image/*" required>
            </div>
          </div>
          <button type="submit" class="btn-primary">Add Partner</button>
        </form>
      </div>

      <div class="card settings-card">
        <h2>App Release</h2>
        <p class="setting-desc" style="margin-bottom: 16px;">Powers the "Take Gliimu Everywhere" section on the landing page.</p>
        <form id="admin-release-form">
          <div class="form-row">
            <div class="form-group" style="flex: 1; margin-right: 12px;">
              <label>Latest Version</label>
              <input type="text" id="admin-app-version" class="input" placeholder="1.2.0">
            </div>
            <div class="form-group" style="flex: 1;">
              <label>Version Notes</label>
              <input type="text" id="admin-app-notes" class="input" placeholder="What changed in this release?">
            </div>
          </div>
          <div class="form-group">
            <label>Download Section Background Image</label>
            <input type="file" id="admin-app-bg" class="input" accept="image/*">
            <span class="setting-desc" id="admin-app-bg-current">No image set.</span>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex: 1; margin-right: 12px;">
              <label>Windows Download URL</label>
              <input type="url" id="admin-app-windows" class="input" placeholder="https://">
            </div>
            <div class="form-group" style="flex: 1;">
              <label>macOS Download URL</label>
              <input type="url" id="admin-app-mac" class="input" placeholder="https://">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex: 1; margin-right: 12px;">
              <label>Linux Download URL</label>
              <input type="url" id="admin-app-linux" class="input" placeholder="https://">
            </div>
            <div class="form-group" style="flex: 1;">
              <label>Android Download URL</label>
              <input type="url" id="admin-app-android" class="input" placeholder="https://">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex: 1; margin-right: 12px;">
              <label>iOS Download URL</label>
              <input type="url" id="admin-app-ios" class="input" placeholder="https://">
            </div>
            <div class="form-group" style="flex: 1;">
              <label>Mobile QR Link (optional)</label>
              <input type="url" id="admin-app-qr" class="input" placeholder="Defaults to the Android link">
            </div>
          </div>
          <button type="submit" class="btn-primary" id="admin-release-save">Save Release</button>
        </form>
      </div>
    `;

    document.getElementById('admin-partner-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.addPartner();
    });
    document.getElementById('admin-release-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveRelease();
    });

    await this.renderPartnerList();
    await this.loadRelease();
  },

  async renderPartnerList() {
    const list = document.getElementById('admin-partner-list');
    if (!list) return;

    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      list.innerHTML = `<p class="setting-desc">Could not load partners: ${escapeHtml(error.message)}</p>`;
      return;
    }
    if (!data || data.length === 0) {
      list.innerHTML = '<p class="setting-desc">No partners yet. Add the first logo below.</p>';
      return;
    }

    list.innerHTML = data.map(p => {
      const logo = safeUrl(p.logo_url);
      return `
        <div class="admin-row">
          ${logo
            ? `<img src="${escapeHtml(logo)}" class="admin-logo" alt="">`
            : `<div class="admin-logo admin-logo-fallback">${escapeHtml((p.name || '?').charAt(0).toUpperCase())}</div>`}
          <span class="admin-row-name">${escapeHtml(p.name || 'Untitled')}</span>
          <input type="number" class="input admin-order" value="${Number(p.display_order) || 0}" title="Display order" onchange="settingsInstance.savePartnerOrder('${p.id}', this.value)">
          <button type="button" class="btn-secondary btn-sm" onclick="settingsInstance.deletePartner('${p.id}')">Delete</button>
        </div>
      `;
    }).join('');
  },

  async addPartner() {
    const name = document.getElementById('admin-partner-name').value.trim();
    const file = document.getElementById('admin-partner-logo').files[0];
    if (!name || !file) return alert("Please enter a name and choose a logo.");

    const path = `partners/${Date.now()}_${fileExtension(file)}`;
    const { error: uploadError } = await supabase.storage.from(SITE_ASSETS_BUCKET).upload(path, file);
    if (uploadError) return alert("Logo upload failed: " + uploadError.message);
    const logoUrl = supabase.storage.from(SITE_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl;

    const { data: rows } = await supabase.from('partners').select('display_order');
    const nextOrder = (rows || []).reduce((max, r) => Math.max(max, Number(r.display_order) || 0), 0) + 1;

    const { error } = await supabase.from('partners').insert({ name, logo_url: logoUrl, display_order: nextOrder });
    if (error) return alert("Error: " + error.message);

    document.getElementById('admin-partner-form').reset();
    await this.renderPartnerList();
  },

  async deletePartner(id) {
    if (!await appConfirm("Remove this partner from the landing page?", { okText: 'Delete', danger: true })) return;
    const { error } = await supabase.from('partners').delete().eq('id', id);
    if (error) return alert("Error: " + error.message);
    await this.renderPartnerList();
  },

  async savePartnerOrder(id, value) {
    const order = parseInt(value, 10) || 0;
    const { error } = await supabase.from('partners').update({ display_order: order }).eq('id', id);
    if (error) alert("Error: " + error.message);
    else await this.renderPartnerList();
  },

  async loadRelease() {
    const { data } = await supabase.from('site_settings').select('*').single();
    if (!data) return;
    this.siteSettingsId = data.id;

    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || '';
    };
    set('admin-app-version', data.app_version);
    set('admin-app-notes', data.app_version_notes);
    set('admin-app-windows', data.app_windows_url);
    set('admin-app-mac', data.app_mac_url);
    set('admin-app-linux', data.app_linux_url);
    set('admin-app-android', data.app_android_url);
    set('admin-app-ios', data.app_ios_url);
    set('admin-app-qr', data.app_mobile_qr_url);

    const bg = document.getElementById('admin-app-bg-current');
    if (bg) bg.innerText = data.app_download_bg_url
      ? 'A background image is set. Choose a file to replace it.'
      : 'No background image set.';
  },

  async saveRelease() {
    const btn = document.getElementById('admin-release-save');
    const updates = {
      app_version: document.getElementById('admin-app-version').value.trim(),
      app_version_notes: document.getElementById('admin-app-notes').value.trim(),
      app_windows_url: document.getElementById('admin-app-windows').value.trim(),
      app_mac_url: document.getElementById('admin-app-mac').value.trim(),
      app_linux_url: document.getElementById('admin-app-linux').value.trim(),
      app_android_url: document.getElementById('admin-app-android').value.trim(),
      app_ios_url: document.getElementById('admin-app-ios').value.trim(),
      app_mobile_qr_url: document.getElementById('admin-app-qr').value.trim()
    };

    const bgFile = document.getElementById('admin-app-bg').files[0];
    if (btn) btn.disabled = true;

    if (bgFile) {
      const path = `app/bg_${Date.now()}.${fileExtension(bgFile)}`;
      const { error: uploadError } = await supabase.storage.from(SITE_ASSETS_BUCKET).upload(path, bgFile);
      if (uploadError) {
        if (btn) btn.disabled = false;
        return alert("Upload failed: " + uploadError.message);
      }
      updates.app_download_bg_url = supabase.storage.from(SITE_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl;
    }

    const { error } = await supabase.from('site_settings').update(updates).eq('id', this.siteSettingsId || 1);
    if (btn) btn.disabled = false;
    if (error) return alert("Error: " + error.message);

    // Keep the "App Updates" card in sync with the version we just published.
    if (updates.app_version) localStorage.setItem(APP_VERSION_KEY, updates.app_version);
    await alert("Release settings saved. The landing page updates immediately.");
    document.getElementById('admin-app-bg').value = '';
    await this.loadRelease();
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
