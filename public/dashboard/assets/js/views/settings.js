import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Settings',
  template: `
    <div class="settings-layout" id="settings-container">
      <p style="color: var(--text-muted); text-align: center;">Loading settings...</p>
    </div>
  `,

  async init() {
    this.fetchAndRender();
  },

  async fetchAndRender() {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', store.user.id)
      .single();

    if (error) {
      console.error("Error fetching profile:", error);
      return;
    }

    const container = document.getElementById('settings-container');
    if (!container) return;

    const avatarSrc = profile.avatar_url || `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23F1F5F9'/%3E%3C/svg%3E`;

    container.innerHTML = `
      <!-- General Settings -->
      <div class="card settings-section">
        <h2>General</h2>
        <div class="settings-row">
          <div>
            <span style="font-weight: 600; font-size: 16px; color: var(--text-primary);">Appearance</span><br>
            <span style="font-size: 13px; color: var(--text-muted);">Toggle between light and dark mode.</span>
          </div>
          <button class="btn-secondary" onclick="toggleTheme()">Toggle Theme</button>
        </div>
      </div>

      <!-- Profile Settings -->
      <div class="card settings-section">
        <h2>Profile Settings</h2>

        <div class="avatar-upload-section">
          <img id="settings-avatar" src="${avatarSrc}" class="settings-avatar" alt="Avatar">
          <div>
            <input type="file" id="avatar-input" accept="image/*" style="display: none;">
            <button class="btn-secondary" id="upload-avatar-btn">Change Picture</button>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">JPG or PNG. Max 2MB.</p>
          </div>
        </div>

        <form id="profile-form" style="margin-top: 24px;">
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" id="settings-name" class="input" value="${profile.full_name || ''}">
          </div>
          <div class="form-group">
            <label>Username</label>
            <input type="text" class="input" value="${profile.username || ''}" disabled style="opacity: 0.6; cursor: not-allowed;">
          </div>
          <div class="form-group">
            <label>Bio</label>
            <textarea id="settings-bio" class="input" rows="3">${profile.bio || ''}</textarea>
          </div>
          <div class="form-row" style="gap: 16px;">
            <div class="form-group" style="flex: 1;">
              <label>Skills (Comma separated)</label>
              <input type="text" id="settings-skills" class="input" value="${profile.skills || ''}">
            </div>
            <div class="form-group" style="flex: 1;">
              <label>Interests (Comma separated)</label>
              <input type="text" id="settings-interests" class="input" value="${profile.interests || ''}">
            </div>
          </div>
          <button type="submit" class="btn-primary">Save Changes</button>
        </form>
      </div>

      <!-- Security Settings -->
      <div class="card settings-section">
        <h2>Security & Password</h2>
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 24px;">Change your password. You must verify your identity using your current password.</p>

        <form id="password-form">
          <div class="form-group">
            <label>New Password</label>
            <input type="password" id="new-password" class="input" placeholder="Min. 8 characters" required>
          </div>
          <div class="form-group">
            <label>Verify Identity: Current Password</label>
            <input type="password" id="current-password" class="input" placeholder="Enter current password">
          </div>
          <button type="submit" class="btn-primary">Update Password</button>
        </form>
      </div>

      <!-- Session Settings -->
      <div class="card settings-section">
        <h2>Session</h2>
        <button id="logout-btn" class="btn-secondary" style="color: var(--error); border-color: var(--error);">Log Out</button>
      </div>
    `;

    this.attachEventListeners();
  },

  attachEventListeners() {
    // Avatar Upload
    const fileInput = document.getElementById('avatar-input');
    document.getElementById('upload-avatar-btn').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `${store.user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { cacheControl: '3600', upsert: true });

      if (uploadError) return alert("Error uploading image: " + uploadError.message);

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const publicUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', store.user.id);

      if (updateError) {
        alert("Error saving profile picture.");
      } else {
        document.getElementById('settings-avatar').src = publicUrl + `?t=${Date.now()}`;
        store.profile.avatar_url = publicUrl; // Update local store
        alert("Profile picture updated!");
      }
    });

    // Profile Update
    document.getElementById('profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.innerText = "Saving...";
      btn.disabled = true;

      const updates = {
        full_name: document.getElementById('settings-name').value,
        bio: document.getElementById('settings-bio').value,
        skills: document.getElementById('settings-skills').value,
        interests: document.getElementById('settings-interests').value
      };

      const { error } = await supabase.from('profiles').update(updates).eq('id', store.user.id);

      if (error) {
        alert("Error updating profile.");
      } else {
        alert("Profile saved successfully!");
      }

      btn.innerText = "Save Changes";
      btn.disabled = false;
    });

    // Password Update
    document.getElementById('password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPass = document.getElementById('new-password').value;
      const currentPass = document.getElementById('current-password').value;

      if (newPass.length < 8) return alert("New password must be at least 8 characters.");
      if (!currentPass) return alert("Please enter your current password.");

      const btn = e.target.querySelector('button[type="submit"]');
      btn.innerText = "Updating...";
      btn.disabled = true;

      const fakeEmail = `${store.profile.username}@gliimu.app`;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: fakeEmail,
        password: currentPass
      });

      if (signInError) {
        alert("Current password is incorrect.");
        btn.innerText = "Update Password";
        btn.disabled = false;
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPass });

      if (updateError) {
        alert("Error updating password: " + updateError.message);
      } else {
        alert("Password updated successfully!");
        document.getElementById('password-form').reset();
      }

      btn.innerText = "Update Password";
      btn.disabled = false;
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.href = '/auth.html';
    });
  }
};
