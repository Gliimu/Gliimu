import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';
import { uploadFile } from '../upload.js';
import hubView from './feed-gliims.js?v=84';
import { notify } from '../notify.js?v=33';

export default {
  title: 'Profile',
  template: `
    <div class="profile-layout" id="profile-container">
      <p style="color: var(--text-muted); text-align: center; padding: 40px;">Loading...</p>
    </div>
  `,

  async init() {
    this.allUsers = [];
    this._projectFilter = 'all';
    this._isFollowing = false;

    // Get user ID from hash parameter ?u=<id> for persistence across refresh
    const m = location.hash.match(/[?&]u=([a-zA-Z0-9-]+)/);
    const targetId = m ? m[1] : store.user.id;
    this.targetUserId = targetId;

    window.profileInstance = {
      printProfile: async () => {
        window.print();
      },
      viewUser: (userId) => this.viewUser(userId),
      searchUsers: (query) => this.searchUsers(query),
      changePortfolioImage: () => document.getElementById('portfolio-image-input')?.click(),
      handlePortfolioImage: (input) => this.uploadPortfolioImage(input),
      resetPortfolioImage: () => this.resetPortfolioImage(),
      openProject: (postId) => this.openProject(postId),
      refreshProjects: () => { if (document.getElementById('profile-container')) this.renderProfile(this.targetUserId); },
      openQr: () => this.openQrModal(),
      closeQr: (e, el) => { if (e.target === el) el.remove(); },
      copyName: () => this.copyName(),
      goFeature: () => this.goFeature(),
      toggleFilterMenu: (e) => this.toggleFilterMenu(e),
      applyFilter: (filter) => this.applyFilter(filter),
      toggleFollow: () => this.toggleFollow(),
      messageUser: () => this.messageUser()
    };

    await this.fetchAllUsers();
    this.setupTopbar();
    await this.renderProfile(this.targetUserId);
  },

  setupTopbar() {
    const topbarRight = document.getElementById('topbar-right-actions');
    if (topbarRight) topbarRight.innerHTML = '';
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
        : `<div style="width:24px; height:24px; border-radius:50%; background:var(--gradient-primary); color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; margin-right:8px;"></div>`;
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

  messageUser() {
    if (!this.targetUserId || this.targetUserId === store.user.id) return;
    sessionStorage.setItem('ping_target_user', this.targetUserId);
    window.location.hash = '#/ping';
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

  async goFeature() {
    const { data, error } = await supabase.rpc('featured_slot_check');
    if (error || !data) {
      appAlert('Could not check availability. Please try again.');
      return;
    }
    if (!data.available) {
      appAlert('Feature is currently unavailable. Slots are filled out. Contact support in Ping.');
      return;
    }
    window.location.hash = '#/feature';
  },

  toggleFilterMenu(e) {
    e.stopPropagation();
    const dd = document.getElementById('profile-filter-dropdown');
    if (!dd) return;
    dd.classList.toggle('active');
    if (dd.classList.contains('active')) {
      const close = (ev) => {
        if (!dd.contains(ev.target)) {
          dd.classList.remove('active');
          document.removeEventListener('click', close);
        }
      };
      setTimeout(() => document.addEventListener('click', close), 0);
    }
  },

  applyFilter(filter) {
    this._projectFilter = filter;
    document.querySelectorAll('.profile-filter-item').forEach(el => {
      el.classList.toggle('active', el.dataset.filter === filter);
    });
    const dd = document.getElementById('profile-filter-dropdown');
    if (dd) dd.classList.remove('active');
    this.renderProfile(this.targetUserId);
  },

  async toggleFollow() {
    const btn = document.getElementById('follow-btn');
    if (!btn) return;

    const targetId = this.targetUserId;
    const wasFollowing = this._isFollowing;

    btn.disabled = true;

    try {
      if (wasFollowing) {
        const { error } = await supabase.from('followed_users').delete().eq('follower_id', store.user.id).eq('followed_id', targetId);
        if (error) throw error;
        this._isFollowing = false;
        notify.toast('You have unfollowed this user');
      } else {
        const { error } = await supabase.from('followed_users').insert({ follower_id: store.user.id, followed_id: targetId });
        if (error) throw error;
        this._isFollowing = true;
        notify.toast('You are now following this user. Their gliims will appear in your XpLoRe feed.');
      }

      // Update button state
      btn.classList.toggle('following', this._isFollowing);
      btn.innerHTML = this._isFollowing ? `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        <span>Following</span>
      ` : `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        <span>Follow</span>
      `;

      // Refresh follower count
      const { count: newCount } = await supabase.from('followed_users').select('*', { count: 'exact', head: true }).eq('followed_id', targetId);
      const followerStat = document.querySelector('.profile-stat:nth-child(3) .stat-value');
      if (followerStat && newCount !== null) followerStat.textContent = newCount;

    } catch (err) {
      notify.toast('Could not update follow status. Please try again.');
      console.error('Follow/unfollow error:', err);
    } finally {
      btn.disabled = false;
    }
  },

  async renderProfile(userId) {
    const container = document.getElementById('profile-container');
    const isMe = userId === store.user.id;
    this.targetUserId = userId;

    // Find user in our cached list first for instant load
    let user = this.allUsers.find(u => u.id === userId);

    // Fetch full details + posts + follow status. Explicit columns (never select('*')) because
    // the profiles.username column is revoked from authenticated, and this
    // usually renders ANOTHER member's portfolio — username must never load.
    const [profileResult, postsResult, followerResult, followingResult, followCheckResult] = await Promise.all([
      supabase.from('profiles').select('full_name, avatar_url, portfolio_image_url, total_gp, skills, interests, bio').eq('id', userId).single(),
      supabase.from('feed_gliims').select('id, title, category, description, created_at, views, cover_url, cover_color, user_id').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('followed_users').select('*', { count: 'exact', head: true }).eq('followed_id', userId),
      supabase.from('followed_users').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
      isMe ? Promise.resolve({ data: null }) : supabase.from('followed_users').select('*').eq('follower_id', store.user.id).eq('followed_id', userId).maybeSingle()
    ]);

    const freshUser = profileResult.data;
    const posts = postsResult.data;
    const followerCount = followerResult.count || 0;
    const followingCount = followingResult.count || 0;
    this._isFollowing = isMe ? false : !!followCheckResult.data;

    if (freshUser) user = freshUser;
    if (!user) return;

    this.currentName = user.full_name || '';

    const p = user;
    const gp = p.total_gp || 0;
    const gpDisplay = gp >= 10000 ? 'Maxed out' : gp.toLocaleString();

    const skills = p.skills?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const interests = p.interests?.split(',').map(s => s.trim()).filter(Boolean) || [];

    const profileUrl = `${location.origin}/dashboard/#/profile?u=${userId}`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&ecc=H&margin=6&qzone=1&data=${encodeURIComponent(profileUrl)}`;

    container.innerHTML = `
      <!-- Profile Header -->
      <div class="profile-header card">
        <div class="profile-header-top">
          <div class="profile-avatar-wrap">
            ${p.avatar_url
              ? `<img src="${p.avatar_url}" alt="${p.full_name || 'Gliimait'}" class="profile-avatar-large">`
              : `<div class="profile-avatar-fallback">${(p.full_name || 'G').charAt(0).toUpperCase()}</div>`}
            ${isMe ? `
              <button class="profile-avatar-edit" title="Change profile picture" onclick="window.location.hash='#/settings'">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
              </button>
            ` : ''}
          </div>
          <div class="profile-action-btn">
            ${isMe ? `
              <button class="btn-secondary" onclick="window.location.hash='#/settings'">Edit Profile</button>
            ` : `
              <button class="follow-btn ${this._isFollowing ? 'following' : ''}" onclick="profileInstance.toggleFollow()" id="follow-btn">
                ${this._isFollowing ? `
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  <span>Following</span>
                ` : `
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  <span>Follow</span>
                `}
              </button>
              <button type="button" class="btn-secondary profile-message-btn" onclick="profileInstance.messageUser()">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                <span>Message</span>
              </button>
            `}
          </div>
        </div>
        <div class="profile-header-info">
          <div class="profile-name-row">
            <h1>${p.full_name || 'Gliimait'}</h1>
            <button class="copy-name-btn" title="Copy name" onclick="profileInstance.copyName()">
              <svg class="ic-copy" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <svg class="ic-check" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
          </div>
          ${p.bio ? `<p class="profile-bio">${p.bio}</p>` : ''}
        </div>
        <div class="profile-stats-row">
          <div class="profile-stat">
            <span class="stat-value">${gpDisplay}</span>
            <span class="stat-label">${gp >= 10000 ? 'Growth Points' : 'GP Points'}</span>
          </div>
          <div class="profile-stat">
            <span class="stat-value">${posts?.length || 0}</span>
            <span class="stat-label">Gliims</span>
          </div>
          <div class="profile-stat">
            <span class="stat-value">${followerCount}</span>
            <span class="stat-label">Followers</span>
          </div>
          <div class="profile-stat">
            <span class="stat-value">${followingCount}</span>
            <span class="stat-label">Following</span>
          </div>
        </div>
      </div>

      ${skills.length > 0 || interests.length > 0 ? `
        <div class="profile-tags-section card">
          ${skills.length > 0 ? `
            <div class="profile-tag-group">
              <h3>Skills</h3>
              <div class="tag-group">
                ${skills.map(s => `<span class="tag tag-primary">${s}</span>`).join('')}
              </div>
            </div>
          ` : ''}
          ${interests.length > 0 ? `
            <div class="profile-tag-group">
              <h3>Interests</h3>
              <div class="tag-group">
                ${interests.map(i => `<span class="tag tag-secondary">${i}</span>`).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- Gliims Section -->
      <div class="profile-projects-section">
        <div class="profile-projects-header">
          <h2>Gliims</h2>
          ${isMe ? `
            <div class="profile-projects-actions">
              <button class="profile-feature-btn" onclick="profileInstance.goFeature()" title="Feature your content on the XpLoRe carousel">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                <span>Feature your content</span>
              </button>
              <div class="profile-filter-wrap">
                <button class="profile-filter-btn" onclick="profileInstance.toggleFilterMenu(event)" title="Filter gliims">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                </button>
                <div class="profile-filter-dropdown" id="profile-filter-dropdown">
                  <div class="profile-filter-item active" data-filter="all" onclick="profileInstance.applyFilter('all')">All Gliims</div>
                  <div class="profile-filter-item" data-filter="saved" onclick="profileInstance.applyFilter('saved')">Saved Gliims</div>
                  <div class="profile-filter-item" data-filter="tagged" onclick="profileInstance.applyFilter('tagged')">Tagged</div>
                </div>
              </div>
              <button class="profile-print-btn" onclick="profileInstance.printProfile()" title="Print / Save as PDF">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              </button>
            </div>
          ` : ''}
        </div>
        <div class="profile-gliims-grid blog-feed">
          ${(() => {
            let filteredPosts = posts || [];
            if (this._projectFilter === 'saved' && hubView.savedPosts) {
              filteredPosts = filteredPosts.filter(item => hubView.savedPosts.has(item.id));
            } else if (this._projectFilter === 'tagged') {
              const myName = store.profile?.full_name || '';
              const tag = `@${myName}`;
              filteredPosts = filteredPosts.filter(item => {
                return item.description && item.description.includes(tag);
              });
            }
            if (!filteredPosts.length) {
              return '<p style="color: var(--text-muted); text-align: center; padding: 40px; grid-column: 1/-1;">No gliims found.</p>';
            }
            return filteredPosts.map(item => this.renderGliimCard(item, p)).join('');
          })()}
        </div>
      </div>

      ${isMe ? `
        <div class="profile-verify card" onclick="profileInstance.openQr()" title="View verification code">
          <div class="portfolio-qr-img">
            <img class="qr" src="${qrSrc}" alt="Profile verification QR code">
            <img class="qr-logo" src="/icons/icon.png" alt="Gliimu">
          </div>
          <div class="portfolio-verify-info">
            <span class="verify-title">Verified Profile</span>
            <span class="verify-hint">Scan or tap to view this profile</span>
          </div>
        </div>
      ` : ''}
    `;
  },

  renderGliimCard(post, profile) {
    const isAmbassador = (profile.total_gp || 0) >= 5000;

    const comments = post.comments_count || 0;
    const eyeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const commentSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;

    const coverHtml = post.cover_url
      ? `<div class="blog-cover" style="background-image: url('${post.cover_url}');"></div>`
      : post.cover_color
        ? `<div class="blog-cover" style="background: ${post.cover_color};"></div>`
        : '';

    return `<article class="blog-card${isAmbassador ? ' ambassador-card' : ''}" id="post-${post.id}" onclick="profileInstance.openProject('${post.id}')">
      ${coverHtml}
      <div class="blog-content">
        <div class="blog-meta">
          <span class="blog-category">${post.category || 'General'}</span>
          <span class="blog-date">${new Date(post.created_at).toLocaleDateString([], {month: 'short', day: 'numeric'})}</span>
        </div>
        <h2 class="blog-title">${post.title || 'Untitled Gliim'}</h2>
        <p class="blog-desc">${post.description ? post.description.substring(0, 120) + (post.description.length > 120 ? '...' : '') : ''}</p>
        <div class="blog-footer">
          <div class="blog-stats">
            <span class="blog-stat">${eyeSvg}${post.views || 0}</span>
            <span class="blog-stat">${commentSvg}${comments}</span>
          </div>
        </div>
      </div>
    </article>`;
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
      const publicUrl = await uploadFile(file, 'media');
      const { error: dbErr } = await supabase.from('profiles').update({ portfolio_image_url: publicUrl }).eq('id', store.user.id);
      if (dbErr) throw dbErr;
      alert('Portfolio image updated.');
      await this.renderProfile(this.targetUserId);
    } catch (e) {
      alert('Could not update portfolio image: ' + (e.message || 'upload failed.'));
    } finally {
      input.disabled = false;
      input.value = '';
    }
  },

  openProject(postId) {
    // Same reader as the hub — like, comment, share, support, save, report —
    // opened in place, so portfolio projects never detour to the hub page.
    hubView.openReadView(postId);
  },

  async resetPortfolioImage() {
    try {
      const { error } = await supabase.from('profiles').update({ portfolio_image_url: null }).eq('id', store.user.id);
      if (error) throw error;
      alert('Portfolio image reverted to your profile picture.');
      await this.renderProfile(this.targetUserId);
    } catch (e) {
      alert('Could not revert the image: ' + (e.message || 'update failed.'));
    }
  }
};
