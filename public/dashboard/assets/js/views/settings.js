import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Settings',
  template: `
    <div class="settings-layout">

      <!-- Profile Settings -->
      <div class="card">
        <h2>Profile Settings</h2>
        <p style="color: var(--text-secondary); margin-bottom: var(--space-6);">Update your identity. This will reflect on your Portfolio.</p>

        <!-- Avatar Upload -->
        <div class="avatar-upload-section">
          <img id="avatar-preview" src="https://via.placeholder.com/100" class="settings-avatar">
          <div>
            <input type="file" id="avatar-input" accept="image/*" style="display: none;">
            <button class="btn-secondary" id="upload-avatar-btn">Change Picture</button>
            <p style="font-size: var(--fs-xs); color: var(--text-muted); margin-top: var(--space-2);">JPG or PNG. Max 2MB.</p>
          </div>
        </div>

        <form id="profile-form" style="margin-top: var(--space-6);">
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
            <div class="form-group" style="flex: 1; margin-right: var(--space-3);">
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
      <div class="card" style="margin-top: var(--space-6);">
        <h2>Security & Password</h2>
        <p style="color: var(--text-secondary); margin-bottom: var(--space-6);">Change your password. You must verify your identity using either your current password or your 16-word recovery passphrase.</p>

        <form id="password-form">
          <div class="form-group">
            <label>New Password</label>
            <input type="password" id="new-password" class="input" placeholder="Min. 8 characters" required>
          </div>

          <div class="form-group">
            <label>Verify Identity: Current Password</label>
            <input type="password" id="current-password" class="input" placeholder="Enter current password">
          </div>

          <div class="separator">OR</div>

          <div class="form-group">
            <label>Verify Identity: Recovery Passphrase</label>
            <input type="text" id="recovery-phrase-input" class="input" placeholder="Enter your recovery phrase">
          </div>

          <button type="submit" class="btn-primary">Update Password</button>
        </form>
      </div>

      <div class="card" style="margin-top: var(--space-6);">
        <h2>Session</h2>
        <button id="logout-btn" class="btn-secondary">Log Out</button>
      </div>

    </div>
  `,
  async init() {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', store.user.id)
      .single();

    if (profile) {
      document.getElementById('settings-name').value = profile.full_name || '';
      document.getElementById('settings-username').value = profile.username || '';
      document.getElementById('settings-bio').value = profile.bio || '';
      document.getElementById('settings-skills').value = profile.skills || '';
      document.getElementById('settings-interests').value = profile.interests || '';
      if (profile.avatar_url) document.getElementById('avatar-preview').src = profile.avatar_url;
    }

    // --- Handle Avatar Upload ---
    const fileInput = document.getElementById('avatar-input');
    document.getElementById('upload-avatar-btn').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `${store.user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { cacheControl: '3600', upsert: true });

      if (uploadError) {
        alert("Error uploading image.");
        return;
      }

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const publicUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', store.user.id);

      if (updateError) {
        alert("Error saving profile picture.");
      } else {
        document.getElementById('avatar-preview').src = publicUrl + `?t=${Date.now()}`; // Cache busting
        alert("Profile picture updated!");
      }
    });

    // --- Handle Profile Update ---
    document.getElementById('profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const updates = {
        full_name: document.getElementById('settings-name').value,
        bio: document.getElementById('settings-bio').value,
        skills: document.getElementById('settings-skills').value,
        interests: document.getElementById('settings-interests').value
      };
      await supabase.from('profiles').update(updates).eq('id', store.user.id);
      alert("Profile saved successfully!");
    });

    // --- Handle Password Update ---
    document.getElementById('password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPass = document.getElementById('new-password').value;
      const currentPass = document.getElementById('current-password').value;
      const passPhrase = document.getElementById('recovery-phrase-input').value.trim();

      if (newPass.length < 8) return alert("New password must be at least 8 characters.");
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
        isVerified = true;
      }

      if (isVerified) {
        // FIX: Refresh session to prevent 400 Bad Request on older tokens
        await supabase.auth.refreshSession();

        const { data, error: updateError } = await supabase.auth.updateUser({ password: newPass });
        if (updateError) {
          console.error("Password Update Error:", updateError);
          alert("Error updating password: " + updateError.message);
        } else {
          alert("Password updated successfully!");
          document.getElementById('password-form').reset();
        }
      }
    });

    document.getElementById('logout-btn').addEventListener('click', () => store.signOut());
  }
};
