import { supabase } from '/shared/js/config.js';
import { store, tierClass, tierIcon } from '../store.js?v=2';
import { uploadFile } from '../upload.js';
import hubView, { gliimKindOf } from './feed-gliims.js?v=93';
import feedView from './feed.js?v=88';
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
      copyShareLink: () => this.copyShareLink(),
      goFeature: () => this.goFeature(),
      toggleFilterMenu: (e) => this.toggleFilterMenu(e),
      applyFilter: (filter) => this.applyFilter(filter),
      toggleFollow: () => this.toggleFollow(),
      messageUser: () => this.messageUser(),
      toggleDetailsAcc: (head) => this.toggleDetailsAcc(head),
      toggleDetails: () => this.toggleDetails()
    };

    // Re-slice the masonry when the viewport width changes (column count flips).
    if (!this._masonryResize) {
      this._masonryResize = () => {
        clearTimeout(this._masonryTimer);
        this._masonryTimer = setTimeout(() => feedView.layoutMasonry('#profile-container'), 120);
      };
      window.addEventListener('resize', this._masonryResize);
    }

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

  copyShareLink() {
    const url = `${location.origin}/dashboard/#/profile?u=${this.targetUserId}`;
    if (navigator.clipboard) navigator.clipboard.writeText(url);
    const btn = document.querySelector('.profile-share-copy');
    if (btn) {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    }
    notify.toast('Profile link copied');
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

  toggleDetailsAcc(head) {
    const item = head.closest('.details-acc');
    if (!item) return;
    const wasOpen = item.classList.contains('open');
    item.parentElement.querySelectorAll('.details-acc.open').forEach(el => el.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  },

  buildDetailsPanel(p, isMe) {
    const gp = p.total_gp || 0;
    const gpDisplay = gp >= 10000 ? 'Maxed out' : gp.toLocaleString();
    const skills = p.skills?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const interests = p.interests?.split(',').map(s => s.trim()).filter(Boolean) || [];

    const boltSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>`;
    const chevronSvg = `<svg class="details-acc-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    const shareSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`;
    const copySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

    const profileUrl = `${location.origin}/dashboard/#/profile?u=${this.targetUserId}`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&ecc=H&margin=6&qzone=1&data=${encodeURIComponent(profileUrl)}`;

    const streakAcc = isMe ? `
      <div class="details-acc">
        <button class="details-acc-head" onclick="profileInstance.toggleDetailsAcc(this)">
          <span class="details-acc-title">${boltSvg}Activity Streak</span>
          ${chevronSvg}
        </button>
        <div class="details-acc-body">
          <div class="streak-stats">
            <div class="streak-item">
              <span class="streak-value">${this._posts.length}</span>
              <span class="streak-label">Total Gliims</span>
            </div>
            <div class="streak-item">
              <span class="streak-value">${this.calculateStreak(this._posts)}</span>
              <span class="streak-label">Day Streak</span>
            </div>
            <div class="streak-item">
              <span class="streak-value">${this.getMostActiveDay(this._posts)}</span>
              <span class="streak-label">Most Active</span>
            </div>
          </div>
        </div>
      </div>
    ` : '';

    const shareAcc = isMe ? `
      <div class="details-acc">
        <button class="details-acc-head" onclick="profileInstance.toggleDetailsAcc(this)">
          <span class="details-acc-title">${shareSvg}Profile QR & share</span>
          ${chevronSvg}
        </button>
        <div class="details-acc-body">
          <div class="details-share-row">
            <div class="portfolio-qr-img" onclick="profileInstance.openQr()" title="Enlarge QR code">
              <img class="qr" src="${qrSrc}" alt="Profile QR code">
              <img class="qr-logo" src="/icons/icon.png" alt="Gliimu">
            </div>
            <div class="details-share-info">
              <span class="verify-title">Share your profile</span>
              <div class="profile-share-row">
                <span class="profile-share-url">${profileUrl}</span>
                <button class="profile-share-copy" onclick="profileInstance.copyShareLink()" title="Copy link">${copySvg}</button>
              </div>
              <span class="verify-hint">Tap the QR code to enlarge</span>
            </div>
          </div>
        </div>
      </div>
    ` : '';

    const starSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    const featureAcc = isMe ? `
      <button class="profile-feature-btn" onclick="profileInstance.goFeature()" title="Feature your content on the XpLoRe carousel">
        ${starSvg}
        <span>Feature your content</span>
      </button>
    ` : '';

    return `
      <div class="profile-details-panel" id="profile-details-panel">
        <div class="profile-details-stats">
          <div class="profile-stat">
            <span class="stat-value">${gpDisplay}</span>
            <span class="stat-label">${gp >= 10000 ? 'Growth Points' : 'GP Points'}</span>
          </div>
          <div class="profile-stat">
            <span class="stat-value">${this._postsCount || 0}</span>
            <span class="stat-label">Gliims</span>
          </div>
          <div class="profile-stat">
            <span class="stat-value">${this._followersCount || 0}</span>
            <span class="stat-label">Followers</span>
          </div>
          <div class="profile-stat">
            <span class="stat-value">${this._followingCount || 0}</span>
            <span class="stat-label">Following</span>
          </div>
        </div>
        ${skills.length ? `
          <div class="profile-details-group">
            <h4>Skills</h4>
            <div class="tag-group">${skills.map(s => `<span class="tag tag-primary">${s}</span>`).join('')}</div>
          </div>
        ` : ''}
        ${interests.length ? `
          <div class="profile-details-group">
            <h4>Interests</h4>
            <div class="tag-group">${interests.map(i => `<span class="tag tag-secondary">${i}</span>`).join('')}</div>
          </div>
        ` : ''}
        ${streakAcc}
        ${shareAcc}
        ${featureAcc}
      </div>
    `;
  },

  toggleDetails() {
    const panel = document.getElementById('profile-details-panel');
    if (!panel) return;
    const open = panel.classList.toggle('open');
    document.getElementById('profile-details-toggle')?.classList.toggle('open', open);
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
      btn.title = this._isFollowing ? 'Unfollow' : 'Follow';
      btn.innerHTML = this._isFollowing ? `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      ` : `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      `;

      // Refresh follower count
      const { count: newCount } = await supabase.from('followed_users').select('*', { count: 'exact', head: true }).eq('followed_id', targetId);
      this._followersCount = newCount || 0;

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
      supabase.from('profiles').select('full_name, avatar_url, banner_url, social_link, portfolio_image_url, total_gp, skills, interests, bio, verification_badge').eq('id', userId).single(),
      supabase.from('feed_gliims').select('id, title, category, description, created_at, views, cover_url, cover_color, user_id, is_premium, status').eq('user_id', userId).order('created_at', { ascending: false }),
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
    this.currentUser = user;
    this._postsCount = posts?.length || 0;
    this._posts = posts || [];
    this._followersCount = followerCount;
    this._followingCount = followingCount;

    const p = user;

    const settingsGearSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

    let socialLink = (p.social_link || '').trim();
    // Settings prepends https:// on save; older rows may still be schemeless
    if (socialLink && !/^https?:\/\//i.test(socialLink)) socialLink = 'https://' + socialLink;
    let socialHost = '';
    if (socialLink) { try { socialHost = new URL(socialLink).hostname.replace(/^www\./, ''); } catch { socialHost = ''; } }
    const socialOk = !!socialHost;
    const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const globeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
    const chevronDownSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

    // Grid list first, then card context, then the template — cards must render
    // with their kinds and comment counts already known.
    let gridPosts;
    if (isMe && this._projectFilter === 'saved') {
      gridPosts = await this.fetchSavedGliims();
    } else {
      gridPosts = posts || [];
      if (this._projectFilter === 'drafts') {
        gridPosts = gridPosts.filter(item => item.status === 'draft');
      } else {
        gridPosts = gridPosts.filter(item => item.status !== 'draft');
        if (this._projectFilter === 'tagged') {
          const myName = store.profile?.full_name || '';
          const tag = `@${myName}`;
          gridPosts = gridPosts.filter(item => item.description && item.description.includes(tag));
        }
      }
    }
    await this.syncCardContext(gridPosts, this._projectFilter === 'saved' ? null : p);

    const emptyMessage = this._projectFilter === 'saved' ? 'No saved gliims yet.'
      : this._projectFilter === 'drafts' ? 'No drafts found.'
      : 'No gliims found.';

    const detailsPanel = this.buildDetailsPanel(p, isMe);

    container.innerHTML = `
      <!-- Profile Header: banner identity, actions row, inline details panel -->
      <div class="profile-header card">
        <div class="profile-banner${p.banner_url ? '' : ' no-image'}">
          ${p.banner_url ? `<img src="${escAttr(p.banner_url)}" alt="">` : ''}
          <div class="profile-banner-scrim"></div>
          <div class="profile-banner-identity">
            ${p.avatar_url
              ? `<img src="${escAttr(p.avatar_url)}" alt="${escText(p.full_name || 'Gliimait')}" class="profile-avatar-large">`
              : `<div class="profile-avatar-fallback">${(p.full_name || 'G').charAt(0).toUpperCase()}</div>`}
            <div class="profile-banner-text">
              <h1>${p.full_name || 'Gliimait'}${tierIcon(p.verification_badge)}</h1>
              ${p.bio ? `<p class="profile-banner-bio">${escText(p.bio)}</p>` : ''}
            </div>
          </div>
          ${socialOk ? `
            <a class="profile-social-chip profile-banner-social" href="${escAttr(socialLink)}" target="_blank" rel="noopener noreferrer nofollow" title="${escAttr(socialLink)}">${globeSvg}<span>${escText(socialHost)}</span></a>
          ` : ''}
        </div>
        <div class="profile-header-actions">
          <button class="profile-details-toggle" id="profile-details-toggle" onclick="profileInstance.toggleDetails()">
            More details
            ${chevronDownSvg}
          </button>
          <div class="profile-header-actions-right">
            ${isMe ? `
              <div class="profile-filter-wrap">
                <button class="profile-filter-btn" onclick="profileInstance.toggleFilterMenu(event)" title="Filter gliims">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                </button>
                <div class="profile-filter-dropdown" id="profile-filter-dropdown">
                  <div class="profile-filter-item ${this._projectFilter === 'all' ? 'active' : ''}" data-filter="all" onclick="profileInstance.applyFilter('all')">All Gliims</div>
                  <div class="profile-filter-item ${this._projectFilter === 'drafts' ? 'active' : ''}" data-filter="drafts" onclick="profileInstance.applyFilter('drafts')">Drafts</div>
                  <div class="profile-filter-item ${this._projectFilter === 'saved' ? 'active' : ''}" data-filter="saved" onclick="profileInstance.applyFilter('saved')">Saved Gliims</div>
                  <div class="profile-filter-item ${this._projectFilter === 'tagged' ? 'active' : ''}" data-filter="tagged" onclick="profileInstance.applyFilter('tagged')">Tagged</div>
                </div>
              </div>
              <button class="profile-gear-btn" title="Settings" onclick="window.location.hash='#/settings'">${settingsGearSvg}</button>
            ` : `
              <button class="profile-follow-btn ${this._isFollowing ? 'following' : ''}" onclick="profileInstance.toggleFollow()" id="follow-btn" title="${this._isFollowing ? 'Unfollow' : 'Follow'}">
                ${this._isFollowing ? `
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                ` : `
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                `}
              </button>
              <button type="button" class="profile-ping-btn" onclick="profileInstance.messageUser()" title="Send message">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              </button>
            `}
          </div>
        </div>
        ${detailsPanel}
      </div>

      <!-- Gliims Section -->
      <div class="profile-projects-section">
        <div class="profile-projects-header">
          <h2>Gliims</h2>
        </div>
        <div class="profile-gliims-feed">
          ${gridPosts.length
            ? `<div class="library-feed feed-grid">${gridPosts.map(item => feedView.wrapItem(this.renderCard(item, p), 'gliim')).join('')}</div>`
            : `<p style="color: var(--text-muted); text-align: center; padding: 40px;">${emptyMessage}</p>`}
        </div>
      </div>
    `;

    feedView.layoutMasonry('#profile-container');
  },

  // Point the shared XpLoRe renderer at this profile's data: block shapes for
  // card kinds and comment counts. Pass a profile to stamp every card with it
  // (own posts); pass null when posts already carry their own author relation
  // (saved gliims by other authors).
  async syncCardContext(list, profile) {
    const ids = list.map(item => item.id);
    hubView.cardKinds = {};
    hubView.allInteractions = [];
    if (!ids.length) return;

    try {
      const [kindRes, interRes] = await Promise.all([
        supabase.from('feed_gliim_contents').select('post_id, blocks').in('post_id', ids),
        supabase.from('feed_interactions').select('post_id, interaction_type').in('post_id', ids)
      ]);
      for (const row of kindRes.data || []) hubView.cardKinds[row.post_id] = gliimKindOf(row.blocks);
      hubView.allInteractions = interRes.data || [];
    } catch { /* cards keep the default style */ }

    if (profile) {
      list.forEach(item => {
        item.profiles = { full_name: profile.full_name, avatar_url: profile.avatar_url, total_gp: profile.total_gp };
      });
    }
  },

  renderCard(post, profile) {
    if (!post.profiles) {
      post.profiles = { full_name: profile.full_name, avatar_url: profile.avatar_url, total_gp: profile.total_gp };
    }
    return hubView.renderPostCard(post);
  },

  // Saved Gliims load from saved_items — the full history across sessions and
  // authors — instead of the XpLoRe feed's in-memory set. RLS hides drafts and
  // other members' unpublished rows from the fetch, same as the feed.
  async fetchSavedGliims() {
    const { data: saved } = await supabase.from('saved_items')
      .select('item_id').eq('user_id', store.user.id)
      .order('created_at', { ascending: false });
    const ids = (saved || []).map(s => s.item_id);
    if (!ids.length) return [];

    const { data: savedPosts } = await supabase.from('feed_gliims')
      .select('id, title, category, description, created_at, views, cover_url, cover_color, user_id, is_premium, status')
      .in('id', ids);
    const visible = (savedPosts || []).filter(item => !item.status || item.status === 'approved');
    if (!visible.length) return [];

    const authorIds = [...new Set(visible.map(item => item.user_id))];
    const { data: authors } = await supabase.from('profiles')
      .select('id, full_name, avatar_url, total_gp').in('id', authorIds);
    const authorMap = new Map((authors || []).map(a => [a.id, a]));
    visible.forEach(item => { item.profiles = authorMap.get(item.user_id) || { full_name: '', avatar_url: null, total_gp: 0 }; });

    const order = new Map(ids.map((id, i) => [id, i]));
    return visible.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  },

  calculateStreak(posts) {
    if (!posts || !posts.length) return 0;
    const days = new Set(posts.map(p => new Date(p.created_at).toDateString()));
    const sorted = [...days].map(d => new Date(d)).sort((a, b) => b - a);
    let streak = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      const diff = (sorted[i] - sorted[i + 1]) / 86400000;
      if (diff === 1) streak++;
      else break;
    }
    return streak;
  },

  getMostActiveDay(posts) {
    if (!posts || !posts.length) return '—';
    const dayCounts = {};
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    posts.forEach(p => {
      const day = dayNames[new Date(p.created_at).getDay()];
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });
    return Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0][0];
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
