import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Profile',
  template: `
    <div class="profile-layout" id="profile-container">
      <p style="color: var(--text-muted); text-align: center; padding: 40px;">Loading profile...</p>
    </div>
  `,

  async init() {
    window.profileInstance = {
      editProfile: () => window.location.hash = '#/settings',
      printProfile: () => window.print(),
      switchTab: (tab) => this.switchTab(tab)
    };

    await this.fetchData();
    this.activeTab = 'gliims';
    this.render();
  },

  async fetchData() {
    const [{ data: profile }, { data: posts }, { data: savedIds }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', store.user.id).single(),
      supabase.from('posts').select('id, title, category, created_at').eq('user_id', store.user.id).order('created_at', { ascending: false }),
      supabase.from('saved_posts').select('post_id').eq('user_id', store.user.id)
    ]);

    this.profile = profile;
    this.posts = posts || [];

    const savedIdsArray = savedIds?.map(s => s.post_id) || [];
    if (savedIdsArray.length > 0) {
      const { data: savedPosts } = await supabase.from('posts').select('id, title, category, created_at').in('id', savedIdsArray).order('created_at', { ascending: false });
      this.savedPosts = savedPosts || [];
    } else {
      this.savedPosts = [];
    }
  },

  render() {
    const container = document.getElementById('profile-container');
    if (!container || !this.profile) return;

    const p = this.profile;
    const isElite = (p.total_gp || 0) >= 1000;
    const avatarClass = isElite ? 'profile-avatar glow-avatar' : 'profile-avatar';
    const avatar = p.avatar_url
      ? `<img src="${p.avatar_url}" class="${avatarClass}" style="object-fit:cover;">`
      : `<div class="${avatarClass}">${p.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;

    const tick = isElite ? '<svg class="inline-tick" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>' : '';

    const skills = p.skills?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const interests = p.interests?.split(',').map(s => s.trim()).filter(Boolean) || [];

    container.innerHTML = `
      <div class="profile-card card printable-area">
        <div class="profile-header">
          <div class="profile-header-left">
            ${avatar}
            <div class="profile-header-info">
              <h1>${p.full_name || 'Gliimait'} ${tick}</h1>
              <p class="profile-username">@${p.username}</p>
              <div class="profile-badges">
                <span class="profile-badge">Gliimait</span>
                ${p.subscription_expires_at && new Date(p.subscription_expires_at) > new Date() ? '<span class="profile-badge elite">Elite Subscriber</span>' : ''}
              </div>
            </div>
          </div>
          <div class="profile-actions">
            <button class="btn-secondary" onclick="profileInstance.editProfile()">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              Edit Profile
            </button>
            <button class="btn-primary" onclick="profileInstance.printProfile()">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              Print / Save PDF
            </button>
          </div>
        </div>

        <div class="profile-stats">
          <div class="stat-item">
            <span class="stat-value">${p.total_gp || 0}</span>
            <span class="stat-label">GP Points</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${this.posts.length}</span>
            <span class="stat-label">Gliims Published</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">₦${p.wallet_balance?.toLocaleString() || 0}</span>
            <span class="stat-label">Wallet Balance</span>
          </div>
        </div>

        <div class="profile-section">
          <h3>About Me</h3>
          <p>${p.bio || 'No bio added yet. Edit your profile to add a bio.'}</p>
        </div>

        <div class="profile-section">
          <h3>Skills & Proficiency</h3>
          <div class="tag-group">
            ${skills.length > 0 ? skills.map(s => `<span class="tag tag-primary">${s}</span>`).join('') : '<span class="text-muted">No skills added.</span>'}
          </div>
        </div>

        <div class="profile-section">
          <h3>Interests</h3>
          <div class="tag-group">
            ${interests.length > 0 ? interests.map(i => `<span class="tag tag-secondary">${i}</span>`).join('') : '<span class="text-muted">No interests added.</span>'}
          </div>
        </div>
      </div>

      <!-- Tabs Section -->
      <div class="profile-tabs-card card">
        <div class="profile-tabs">
          <button class="profile-tab ${this.activeTab === 'gliims' ? 'active' : ''}" onclick="profileInstance.switchTab('gliims')">My Gliims</button>
          <button class="profile-tab ${this.activeTab === 'saved' ? 'active' : ''}" onclick="profileInstance.switchTab('saved')">Collections</button>
        </div>
        <div class="profile-tab-content" id="profile-tab-content">
          ${this.renderTabContent()}
        </div>
      </div>
    `;
  },

  renderTabContent() {
    const items = this.activeTab === 'gliims' ? this.posts : this.savedPosts;

    if (items.length === 0) {
      return `<p style="color: var(--text-muted); text-align: center; padding: 40px;">No content here yet.</p>`;
    }

    return items.map(item => `
      <div class="profile-item-row" onclick="window.location.hash='#/hub'">
        <div class="profile-item-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        </div>
        <div class="profile-item-info">
          <h4>${item.title}</h4>
          <span>${item.category || 'General'} • ${new Date(item.created_at).toLocaleDateString()}</span>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5;"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </div>
    `).join('');
  },

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.profile-tab[onclick="profileInstance.switchTab('${tab}')"]`)?.classList.add('active');
    document.getElementById('profile-tab-content').innerHTML = this.renderTabContent();
  }
};
