import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Profile',
  template: `
    <div class="profile-layout" id="profile-container">
      <p style="color: var(--text-muted); text-align: center; padding: 40px;">Loading...</p>
    </div>
  `,

  async init() {
    this.allUsers = [];

    // Deep links: sessionStorage (hub/library) or ?u=<id> in the hash (QR scans)
    let targetId = sessionStorage.getItem('view_profile_id');
    if (targetId) {
      sessionStorage.removeItem('view_profile_id');
    } else {
      const m = location.hash.match(/[?&]u=([a-zA-Z0-9-]+)/);
      if (m) targetId = m[1];
    }
    this.targetUserId = targetId || store.user.id;

    window.profileInstance = {
      printProfile: () => window.print(),
      viewUser: (userId) => this.viewUser(userId),
      searchUsers: (query) => this.searchUsers(query),
      changePortfolioImage: () => document.getElementById('portfolio-image-input')?.click(),
      handlePortfolioImage: (input) => this.uploadPortfolioImage(input),
      openQr: () => this.openQrModal(),
      closeQr: (e, el) => { if (e.target === el) el.remove(); },
      copyName: () => this.copyName()
    };

    await this.fetchAllUsers();
    this.setupTopbar();
    await this.renderProfile(this.targetUserId);
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
        <button class="lib-filter-btn" id="profile-print-btn" title="Print / Save as PDF" onclick="profileInstance.printProfile()">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        </button>
      `;
    }

    document.addEventListener('click', () => {
      const dd = document.getElementById('profile-search-dropdown');
      if (dd) dd.style.display = 'none';
    });
  },

  async fetchAllUsers() {
    const { data } = await supabase.from('profiles').select('id, full_name, avatar_url, total_gp').order('total_gp', { ascending: false });
    this.allUsers = data || [];
  },

  searchUsers(query) {
    const dropdown = document.getElementById('profile-search-dropdown');
    if (!query || query.length < 2) {
      dropdown.style.display = 'none';
      return;
    }

    const q = query.toLowerCase();
    const filtered = this.allUsers.filter(u => u.full_name?.toLowerCase().includes(q));

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

  viewUser(userId) {
    document.getElementById('profile-search-dropdown').style.display = 'none';
    document.getElementById('profile-search').value = '';
    this.renderProfile(userId);
  },

  copyName() {
    const btn = document.querySelector('.copy-name-btn');
    if (navigator.clipboard && this.currentName) {
      navigator.clipboard.writeText(this.currentName);
    }
    if (btn) {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    }
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

    this.currentName = user.full_name || '';

    const p = user;
    const gp = p.total_gp || 0;
    const gpDisplay = gp >= 10000 ? 'Maxed out' : gp.toLocaleString();

    // Portfolio-only image: falls back to the app avatar
    const portfolioImg = p.portfolio_image_url || p.avatar_url;
    const tierClass = gp >= 5000 ? 'tier-5000' : (gp >= 1000 ? 'tier-1000' : '');

    const skills = p.skills?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const interests = p.interests?.split(',').map(s => s.trim()).filter(Boolean) || [];

    const profileUrl = `${location.origin}/dashboard/#/profile?u=${userId}`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&ecc=H&margin=6&qzone=1&data=${encodeURIComponent(profileUrl)}`;

    container.innerHTML = `
      <div class="portfolio-a4 card printable-area" id="portfolio-a4">
        <div class="portfolio-left ${tierClass}">
          ${portfolioImg
            ? `<img src="${portfolioImg}" alt="${p.full_name || 'Gliimait'}" style="object-fit:cover;">`
            : `<div class="portfolio-img-fallback">${p.full_name?.charAt(0).toUpperCase() || 'G'}</div>`}
          ${isMe ? `
            <button class="portfolio-img-edit" title="Change portfolio image" onclick="profileInstance.changePortfolioImage()">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            </button>
            <input type="file" id="portfolio-image-input" accept="image/*" style="display:none" onchange="profileInstance.handlePortfolioImage(this)">
          ` : ''}
        </div>

        <div class="portfolio-right">
          <div class="portfolio-identity">
            <div class="portfolio-name-row">
              <h1>${p.full_name || 'Gliimait'}</h1>
              <button class="copy-name-btn" title="Copy name — paste it in Ping to start a chat" onclick="profileInstance.copyName()">
                <svg class="ic-copy" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <svg class="ic-check" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </button>
            </div>
            ${p.bio ? `<p class="portfolio-bio">${p.bio}</p>` : ''}
          </div>

          <div class="portfolio-stats">
            <div class="portfolio-stat">
              <span class="stat-value">${gpDisplay}</span>
              <span class="stat-label">${gp >= 10000 ? 'Growth Points' : 'GP Points'}</span>
            </div>
            <div class="portfolio-stat">
              <span class="stat-value">${posts?.length || 0}</span>
              <span class="stat-label">Gliims Published</span>
            </div>
          </div>

          ${skills.length > 0 ? `
            <div class="portfolio-section">
              <h3>Skills & Proficiency</h3>
              <div class="tag-group">
                ${skills.map(s => `<span class="tag tag-primary">${s}</span>`).join('')}
              </div>
            </div>
          ` : ''}

          ${interests.length > 0 ? `
            <div class="portfolio-section">
              <h3>Interests</h3>
              <div class="tag-group">
                ${interests.map(i => `<span class="tag tag-secondary">${i}</span>`).join('')}
              </div>
            </div>
          ` : ''}

          <div class="portfolio-verify" onclick="profileInstance.openQr()" title="View verification code">
            <div class="portfolio-qr-img">
              <img class="qr" src="${qrSrc}" alt="Profile verification QR code">
              <img class="qr-logo" src="/icons/icon.png" alt="Gliimu">
            </div>
            <div class="portfolio-verify-info">
              <span class="verify-title">Verified Gliimait</span>
              <span class="verify-hint">Scan or tap to view this profile</span>
            </div>
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
  },

  openQrModal() {
    document.getElementById('qr-large-overlay')?.remove();

    const userId = this.targetUserId;
    const profileUrl = `${location.origin}/dashboard/#/profile?u=${userId}`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=560x560&ecc=H&margin=10&qzone=1&data=${encodeURIComponent(profileUrl)}`;

    const overlay = document.createElement('div');
    overlay.id = 'qr-large-overlay';
    overlay.onclick = (e) => profileInstance.closeQr(e, overlay);
    overlay.innerHTML = `
      <div class="qr-large-box">
        <h3>Profile Verification</h3>
        <div class="qr-large-wrap">
          <img class="qr" src="${qrSrc}" alt="Profile QR code">
          <img class="qr-logo-large" src="/icons/icon.png" alt="Gliimu">
        </div>
        <p class="qr-large-url">${profileUrl}</p>
        <div class="qr-large-actions">
          <a class="btn-secondary" href="${profileUrl}" target="_blank" rel="noopener">Open profile link</a>
          <button class="btn-primary" onclick="document.getElementById('qr-large-overlay')?.remove()">Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  async uploadPortfolioImage(input) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      input.disabled = true;
      const path = `${store.user.id}/portfolio/portfolio_${Date.now()}`;
      const { error: upErr } = await supabase.storage.from('media').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('media').getPublicUrl(path);
      const { error: dbErr } = await supabase.from('profiles').update({ portfolio_image_url: data.publicUrl }).eq('id', store.user.id);
      if (dbErr) throw dbErr;
      alert('Portfolio image updated.');
      await this.renderProfile(this.targetUserId);
    } catch (e) {
      alert('Could not update portfolio image: ' + (e.message || 'upload failed.'));
    } finally {
      input.disabled = false;
      input.value = '';
    }
  }
};
