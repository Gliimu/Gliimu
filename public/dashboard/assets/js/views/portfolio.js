import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Leaderboard',
  template: `
    <div class="profile-layout" id="profile-container">
      <p style="color: var(--text-muted); text-align: center; padding: 40px;">Loading...</p>
    </div>
  `,

  async init() {
    this.allUsers = [];
    this.activeTab = 'leaderboard'; // Default view

    // Check if we are viewing a specific user from another page
    const targetId = sessionStorage.getItem('view_profile_id');
    if (targetId) {
      sessionStorage.removeItem('view_profile_id');
      this.targetUserId = targetId;
      this.activeTab = 'profile';
    }

    window.profileInstance = {
      editProfile: () => window.location.hash = '#/settings',
      printProfile: () => window.print(),
      switchTab: (tab) => this.switchTab(tab),
      viewUser: (userId) => this.viewUser(userId),
      searchUsers: (query) => this.searchUsers(query)
    };

    await this.fetchAllUsers();
    this.setupTopbar();

    if (this.activeTab === 'leaderboard') {
      this.renderLeaderboard();
    } else if (this.activeTab === 'profile') {
      await this.renderProfile(this.targetUserId || store.user.id);
    }
  },

  setupTopbar() {
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    const topbarRight = document.getElementById('topbar-right-actions');

    if (topbarDynamic) {
      topbarDynamic.innerHTML = `
        <div class="lib-topbar-search">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="profile-search" class="lib-topbar-search-input" placeholder="Search Gliimaits..." oninput="profileInstance.searchUsers(this.value)">
          <div class="lib-dropdown-menu" id="profile-search-dropdown" style="display:none; top: 110%;"></div>
        </div>
      `;
    }

    if (topbarRight) {
      topbarRight.innerHTML = `
        <div class="lib-filter-wrapper">
          <button class="lib-filter-btn" id="profile-filter-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
          </button>
          <div class="lib-dropdown-menu" id="profile-dropdown">
            <div class="lib-dropdown-item ${this.activeTab === 'leaderboard' ? 'active' : ''}" onclick="profileInstance.switchTab('leaderboard')">Leaderboard</div>
            <div class="lib-dropdown-item ${this.activeTab === 'profile' ? 'active' : ''}" onclick="profileInstance.switchTab('profile')">My Profile</div>
          </div>
        </div>
      `;

      document.getElementById('profile-filter-btn').addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        document.getElementById('profile-dropdown').classList.toggle('active');
      });
    }

    document.addEventListener('click', () => {
      document.getElementById('profile-dropdown')?.classList.remove('active');
      const dd = document.getElementById('profile-search-dropdown');
      if (dd) dd.style.display = 'none';
    });
  },

  async fetchAllUsers() {
    const { data } = await supabase.from('profiles').select('id, full_name, username, avatar_url, total_gp, bio, skills, interests').order('total_gp', { ascending: false });
    this.allUsers = data || [];
  },

  searchUsers(query) {
    const dropdown = document.getElementById('profile-search-dropdown');
    if (!query || query.length < 2) {
      dropdown.style.display = 'none';
      return;
    }

    const q = query.toLowerCase();
    const filtered = this.allUsers.filter(u => u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q));

    if (filtered.length === 0) {
      dropdown.style.display = 'block';
      dropdown.innerHTML = '<div class="lib-dropdown-item">No users found.</div>';
      return;
    }

    dropdown.style.display = 'block';
    dropdown.innerHTML = filtered.map(u => {
      const avatar = u.avatar_url
        ? `<img src="${u.avatar_url}" style="width:24px; height:24px; border-radius:50%; object-fit:cover; margin-right:8px;">`
        : `<div style="width:24px; height:24px; border-radius:50%; background:var(--gradient-primary); color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; margin-right:8px;">${u.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
      return `
      <div class="lib-dropdown-item" onclick="profileInstance.viewUser('${u.id}')" style="display:flex; align-items:center;">
        ${avatar}
        <div style="display:flex; flex-direction:column; line-height:1.3;">
          <span>${u.full_name}</span>
          <span style="color:var(--text-muted); font-size:11px;">${u.total_gp || 0} GP</span>
        </div>
      </div>
    `}).join('');
  },

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('#profile-dropdown .lib-dropdown-item').forEach(i => i.classList.remove('active'));

    if (tab === 'leaderboard') {
      this.renderLeaderboard();
    } else {
      this.renderProfile(store.user.id);
    }
  },

  viewUser(userId) {
    document.getElementById('profile-search-dropdown').style.display = 'none';
    document.getElementById('profile-search').value = '';
    this.renderProfile(userId);
  },

  renderLeaderboard() {
    const container = document.getElementById('profile-container');

    container.innerHTML = `
      <div class="leaderboard-card card">
        <div class="leaderboard-header">
          <h2>Elite Leaderboard</h2>
          <p>Top Gliimaits ranked by total GP earned.</p>
        </div>
        <div class="leaderboard-list">
          ${this.allUsers.map((u, index) => {
            const avatar = u.avatar_url
              ? `<img src="${u.avatar_url}" class="lb-avatar" style="object-fit:cover;" alt="">`
              : `<div class="lb-avatar lb-avatar-fallback">${u.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
            return `
            <div class="leaderboard-item" onclick="profileInstance.viewUser('${u.id}')">
              <span class="lb-rank">#${index + 1}</span>
              ${avatar}
              <div class="lb-info">
                <span class="lb-name">${u.full_name || 'Gliimait'}</span>
              </div>
              <span class="lb-score">${u.total_gp || 0} GP</span>
            </div>
          `}).join('')}
        </div>
      </div>
    `;
  },

  async renderProfile(userId) {
    const container = document.getElementById('profile-container');
    const isMe = userId === store.user.id;

    // Find user in our cached list first for instant load
    let user = this.allUsers.find(u => u.id === userId);

    // Fetch full details + posts
    const [{ data: freshUser }, { data: posts }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('posts').select('id, title, category, created_at').eq('user_id', userId).order('created_at', { ascending: false })
    ]);

    if (freshUser) user = freshUser;
    if (!user) return;

    const p = user;
    const isElite = (p.total_gp || 0) >= 1000;
    const avatarClass = isElite ? 'profile-avatar glow-avatar' : 'profile-avatar';
    const avatar = p.avatar_url
      ? `<img src="${p.avatar_url}" class="${avatarClass}" style="object-fit:cover;">`
      : `<div class="${avatarClass}">${p.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;

    const tick = isElite ? '<svg class="inline-tick" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>' : '';

    const skills = p.skills?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const interests = p.interests?.split(',').map(s => s.trim()).filter(Boolean) || [];

    container.innerHTML = `
      <div class="profile-card card printable-area${isMe ? ' my-profile-card' : ''}">
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
          ${isMe ? `
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
          ` : `
            <div class="profile-actions">
              <button class="btn-primary" onclick="alert('Redirecting to Ping...'); window.location.hash='/ping';">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                Message
              </button>
            </div>
          `}
        </div>

        <div class="profile-stats">
          <div class="stat-item">
            <span class="stat-value">${p.total_gp || 0}</span>
            <span class="stat-label">GP Points</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${posts?.length || 0}</span>
            <span class="stat-label">Gliims Published</span>
          </div>
          ${isMe ? `
            <div class="stat-item">
              <span class="stat-value">₦${p.wallet_balance?.toLocaleString() || 0}</span>
              <span class="stat-label">Wallet Balance</span>
            </div>
          ` : ''}
        </div>

        <div class="profile-section">
          <h3>About Me</h3>
          <p>${p.bio || 'No bio added yet.'}</p>
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

      <!-- Works Published -->
      <div class="profile-tabs-card card">
        <div class="profile-tabs">
          <button class="profile-tab active">Published Gliims</button>
        </div>
        <div class="profile-tab-content">
          ${(posts && posts.length > 0) ? posts.map(item => `
            <div class="profile-item-row" onclick="window.location.hash='#/hub'">
              <div class="profile-item-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
              </div>
              <div class="profile-item-info">
                <h4>${item.title}</h4>
                <span>${item.category || 'General'} • ${new Date(item.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          `).join('') : '<p style="color: var(--text-muted); text-align: center; padding: 40px;">No published Gliims yet.</p>'}
        </div>
      </div>
    `;
  }
};
