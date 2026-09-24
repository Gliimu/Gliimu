import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Settings',
  template: `
    <div class="settings-layout">
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
            <input type="text" id="settings-username" class="input" disabled>
          </div>
          <div class="form-group">
            <label>Bio</label>
            <textarea id="settings-bio" class="input" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>Skills (Separate with commas)</label>
            <input type="text" id="settings-skills" class="input">
          </div>
          <div class="form-group">
            <label>Interests (Separate with commas)</label>
            <input type="text" id="settings-interests" class="input">
          </div>
          <button type="submit" class="btn-primary">Save Changes</button>
        </form>
      </div>

      <div class="card" style="margin-top: var(--space-6);">
        <h2>Session</h2>
        <button id="logout-btn" class="btn-secondary">Log Out</button>
      </div>
    </div>
  `,
  async init() {
    // Fetch latest profile data
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

    // Handle Form Submit
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

    // Handle Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
      store.signOut();
    });
  }
};
