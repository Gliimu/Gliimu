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

        <form id="profile-form">
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
            <input type="password" id="new-password" class="input" placeholder="Enter new password" required>
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

      <!-- Session Settings -->
      <div class="card" style="margin-top: var(--space-6);">
        <h2>Session</h2>
        <button id="logout-btn" class="btn-secondary">Log Out</button>
      </div>

    </div>
  `,
  async init() {
    // 1. Fetch Profile Data
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
    }

    // 2. Handle Profile Update
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

      if (error) alert("Error updating profile.");
      else alert("Profile saved successfully!");

      btn.innerText = "Save Changes";
      btn.disabled = false;
    });

    // 3. Handle Password Update
    document.getElementById('password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPass = document.getElementById('new-password').value;
      const currentPass = document.getElementById('current-password').value;
      const passPhrase = document.getElementById('recovery-phrase-input').value.trim();

      if (!newPass) return alert("Please enter a new password.");
      if (!currentPass && !passPhrase) return alert("Please verify your identity with your current password or passphrase.");

      let isVerified = false;

      // Verify via Current Password
      if (currentPass) {
        const fakeEmail = `${store.profile.username}@gliimu.app`;
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: fakeEmail,
          password: currentPass
        });
        if (signInError) return alert("Current password is incorrect.");
        isVerified = true;
      }

      // Verify via Passphrase
      if (!isVerified && passPhrase) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('recovery_phrase')
          .eq('id', store.user.id)
          .single();

        if (profileError || profileData.recovery_phrase !== passPhrase) {
          return alert("Recovery passphrase is incorrect.");
        }
        isVerified = true;
      }

      // Update Password if Verified
      if (isVerified) {
        const { error: updateError } = await supabase.auth.updateUser({ password: newPass });
        if (updateError) {
          alert("Error updating password: " + updateError.message);
        } else {
          alert("Password updated successfully!");
          document.getElementById('password-form').reset();
        }
      }
    });

    // 4. Handle Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
      store.signOut();
    });
  }
};
