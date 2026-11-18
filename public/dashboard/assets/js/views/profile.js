import { supabase } from '/shared/js/config.js?v=2';
import { store, tierClass, tierIcon } from '../store.js?v=3';
import { uploadFile } from '../upload.js?v=2';
import hubView, { gliimKindOf, gliimCoverOf, trashReason } from './gliims.js?v=132';
import feedView from './xplore.js?v=131';
import { notify } from '../notify.js?v=33';

const SUB_PLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
const SUB_MINUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

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
    this._detailsOpen = false;
    this._isFollowing = false;

    // Get user ID from query parameter ?u=<id> for persistence across refresh
    const targetId = new URLSearchParams(window.gliimRoute.query()).get('u') || store.user.id;
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
      toggleFilterMenu: (e) => this.toggleFilterMenu(e),
      applyFilter: (filter) => this.applyFilter(filter),
      restoreTrash: (postId, btn) => this.restoreTrash(postId, btn),
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
    const url = window.gliimAppUrl(`/profile?u=${this.targetUserId}`);
    if (navigator.clipboard) navigator.clipboard.writeText(url);
    const btn = document.querySelector('.profile-share-copy');
    if (btn) {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    }
    notify.toast('Profile link copied');
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
    document.querySelectorAll('.profile-filter-item[data-filter]').forEach(el => {
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

  buildDetailsPanel(isMe) {
    if (!isMe) return '';

    const boltSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>`;
    const chevronSvg = `<svg class="details-acc-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    const shareSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`;
    const copySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

    const profileUrl = window.gliimAppUrl(`/profile?u=${this.targetUserId}`);
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&ecc=H&margin=6&qzone=1&data=${encodeURIComponent(profileUrl)}`;

    return `
      <div class="profile-details-panel${this._detailsOpen ? ' open' : ''}" id="profile-details-panel">
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
                <span class="streak-value">${this._followingCount || 0}</span>
                <span class="streak-label">Subscribed</span>
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
      </div>
    `;
  },

  toggleDetails() {
    const panel = document.getElementById('profile-details-panel');
    if (!panel) return;
    this._detailsOpen = panel.classList.toggle('open');
    document.getElementById('profile-details-toggle')?.classList.toggle('active', this._detailsOpen);
    document.getElementById('profile-filter-dropdown')?.classList.remove('active');
  },

  async toggleFollow() {
    const btn = document.getElementById('subscribe-btn');
    if (!btn) return;

    const targetId = this.targetUserId;
    const wasFollowing = this._isFollowing;

    btn.disabled = true;

    try {
      if (wasFollowing) {
        const { error } = await supabase.from('followed_users').delete().eq('follower_id', store.user.id).eq('followed_id', targetId);
        if (error) throw error;
        this._isFollowing = false;
        notify.toast('Unsubscribed.');
      } else {
        const { error } = await supabase.from('followed_users').insert({ follower_id: store.user.id, followed_id: targetId });
        if (error) throw error;
        this._isFollowing = true;
        notify.toast('Subscribed. Their new gliims will appear in your XpLoRe feed.');
      }

      btn.classList.toggle('subscribed', this._isFollowing);
      btn.title = this._isFollowing ? 'Unsubscribe' : 'Subscribe';
      btn.setAttribute('aria-label', btn.title);
      btn.innerHTML = this._isFollowing ? SUB_MINUS_SVG : SUB_PLUS_SVG;

    } catch (err) {
      notify.toast('Could not update your subscription. Please try again.');
      console.error('Subscribe/unsubscribe error:', err);
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
    // Both followed_users counts are owner-only, so a visitor's page never fetches them.
    const [profileResult, postsResult, followerResult, followingResult, followCheckResult] = await Promise.all([
      supabase.from('profiles').select('full_name, avatar_url, banner_url, portfolio_image_url, total_gp, bio, verification_badge').eq('id', userId).single(),
      supabase.from('feed_gliims').select('id, title, category, description, created_at, views, cover_url, cover_color, user_id, status').eq('user_id', userId).order('created_at', { ascending: false }),
      isMe ? supabase.from('followed_users').select('*', { count: 'exact', head: true }).eq('followed_id', userId) : Promise.resolve({ count: 0 }),
      isMe ? supabase.from('followed_users').select('*', { count: 'exact', head: true }).eq('follower_id', userId) : Promise.resolve({ count: 0 }),
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

    const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const gp = p.total_gp || 0;
    const gpDisplay = gp >= 10000 ? 'Maxed out' : gp.toLocaleString();

    // Grid list first, then card context, then the template — cards must render
    // with their kinds and comment counts already known.
    // The Trash is its own list, not the masonry grid: every row needs a
    // countdown and a Restore button beside the card.
    let trashItems = [];
    let gridPosts;
    if (isMe && this._projectFilter === 'trash') {
      trashItems = await this.fetchTrashGliims();
    } else if (isMe && this._projectFilter === 'saved') {
      gridPosts = await this.fetchSavedGliims();
    } else {
      gridPosts = (posts || []).filter(item =>
        this._projectFilter === 'drafts' ? item.status === 'draft' : item.status !== 'draft');
    }
    if (gridPosts) await this.syncCardContext(gridPosts, this._projectFilter === 'saved' ? null : p);

    const emptyMessage = this._projectFilter === 'saved' ? 'No saved gliims yet.'
      : this._projectFilter === 'drafts' ? 'No drafts found.'
      : this._projectFilter === 'trash' ? 'Your Trash is empty.'
      : 'No gliims found.';

    const detailsPanel = this.buildDetailsPanel(isMe);

    container.innerHTML = `
      <!-- Banner identity: name, bio, chips, stats and actions all overlay
           the banner art; only the gliims feed sits below the banner. -->
      <div class="profile-banner${p.banner_url ? '' : ' no-image'}">
        ${p.banner_url ? `<img src="${escAttr(p.banner_url)}" alt="">` : ''}
        <div class="banner-scrim"></div>
        <div class="banner-content">
          <div class="banner-identity-row">
            <div class="profile-avatar-wrap">
              ${p.avatar_url
                ? `<img src="${escAttr(p.avatar_url)}" alt="${escText(p.full_name || 'Gliimait')}" class="profile-avatar-large">`
                : `<div class="profile-avatar-fallback">${(p.full_name || 'G').charAt(0).toUpperCase()}</div>`}
              ${!isMe ? `
                <button class="profile-sub-badge ${this._isFollowing ? 'subscribed' : ''}" id="subscribe-btn" onclick="profileInstance.toggleFollow()" title="${this._isFollowing ? 'Unsubscribe' : 'Subscribe'}" aria-label="${this._isFollowing ? 'Unsubscribe' : 'Subscribe'}">
                  ${this._isFollowing ? SUB_MINUS_SVG : SUB_PLUS_SVG}
                </button>
              ` : ''}
            </div>
            <div class="banner-identity-text">
              <h1>${p.full_name || 'Gliimait'}${tierIcon(p.verification_badge)}</h1>
              ${p.bio ? `<p class="profile-identity-bio">${escText(p.bio)}</p>` : ''}
            </div>
          </div>
          <div class="banner-stats-row">
            <span class="banner-stat"><strong>${gpDisplay}</strong> GP</span>
            <!-- Subscriber counts are owner-only: nobody sees another member's number. -->
            ${isMe ? `<span class="banner-stat"><strong id="stat-subscribers">${this._followersCount || 0}</strong> Subscribers</span>` : ''}
            ${isMe ? `
              <div class="profile-filter-wrap">
                <button class="profile-filter-btn" onclick="profileInstance.toggleFilterMenu(event)" title="Filters and details" aria-label="Filters and details" aria-haspopup="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                </button>
                <div class="profile-filter-dropdown" id="profile-filter-dropdown">
                  <div class="profile-filter-item ${this._projectFilter === 'all' ? 'active' : ''}" data-filter="all" onclick="profileInstance.applyFilter('all')">All Gliims</div>
                  <div class="profile-filter-item ${this._projectFilter === 'drafts' ? 'active' : ''}" data-filter="drafts" onclick="profileInstance.applyFilter('drafts')">Drafts</div>
                  <div class="profile-filter-item ${this._projectFilter === 'saved' ? 'active' : ''}" data-filter="saved" onclick="profileInstance.applyFilter('saved')">Saved Gliims</div>
                  <div class="profile-filter-item ${this._projectFilter === 'trash' ? 'active' : ''}" data-filter="trash" onclick="profileInstance.applyFilter('trash')">Trash</div>
                  <div class="profile-filter-item profile-filter-details ${this._detailsOpen ? 'active' : ''}" id="profile-details-toggle" onclick="profileInstance.toggleDetails()">More details</div>
                </div>
              </div>
            ` : `
              <button type="button" class="profile-ping-btn" onclick="profileInstance.messageUser()" title="Send a Ping" aria-label="Send a Ping">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              </button>
            `}
          </div>
        </div>
      </div>
      ${detailsPanel}

      <!-- Gliims Section -->
      <div class="profile-projects-section">
        <div class="profile-projects-header">
          <h2>${this._projectFilter === 'trash' ? 'Trash' : 'Gliims'}</h2>
        </div>
        <div class="profile-gliims-feed">
          ${this._projectFilter === 'trash'
            ? (trashItems.length ? trashItems.map(item => this.trashRowHtml(item)).join('')
                                 : `<p style="color: var(--text-muted); text-align: center; padding: 40px;">${emptyMessage}</p>`)
            : (gridPosts.length
              ? `<div class="library-feed feed-grid">${gridPosts.map(item => feedView.wrapItem(this.renderCard(item, p), 'gliim')).join('')}</div>`
              : `<p style="color: var(--text-muted); text-align: center; padding: 40px;">${emptyMessage}</p>`)}
        </div>
      </div>
    `;

    if (this._projectFilter !== 'trash') feedView.layoutMasonry('#profile-container');
  },

  // Point the shared XpLoRe renderer at this profile's data: block shapes for
  // card kinds and comment counts. Pass a profile to stamp every card with it
  // (own posts); pass null when posts already carry their own author relation
  // (saved gliims by other authors).
  async syncCardContext(list, profile) {
    const ids = list.map(item => item.id);
    hubView.cardKinds = {};
    hubView.cardCovers = {};
    hubView.allInteractions = [];
    if (!ids.length) return;

    try {
      const [kindRes, interRes] = await Promise.all([
        supabase.from('feed_gliim_contents').select('post_id, blocks').in('post_id', ids),
        supabase.from('feed_interactions').select('post_id, interaction_type').in('post_id', ids)
      ]);
      for (const row of kindRes.data || []) {
        hubView.cardKinds[row.post_id] = gliimKindOf(row.blocks);
        hubView.cardCovers[row.post_id] = gliimCoverOf(row.blocks);
      }
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
      .select('id, title, category, description, created_at, views, cover_url, cover_color, user_id, status')
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

  // RLS hides trashed rows from every normal read, so the Trash is served by
  // the SECURITY DEFINER RPC instead.
  async fetchTrashGliims() {
    const { data, error } = await supabase.rpc('gliim_list_trash');
    if (error || !data || data.ok !== true) return [];
    return data.items || [];
  },

  trashRowHtml(item) {
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const when = item.deleted_at ? new Date(item.deleted_at).toLocaleDateString() : '';
    const restore = item.deleted_by_me
      ? `<button class="profile-trash-restore" onclick="profileInstance.restoreTrash('${esc(item.id)}', this)">Restore</button>`
      : `<span class="profile-trash-locked">Only the team that moved it here can restore it.</span>`;
    return `
      <div class="profile-trash-row" id="trash-${esc(item.id)}">
        ${item.cover_url ? `<img class="profile-trash-cover" src="${esc(item.cover_url)}" alt="">` : '<div class="profile-trash-cover profile-trash-cover-empty"></div>'}
        <div class="profile-trash-text">
          <div class="profile-trash-title">${esc(item.title)}</div>
          <div class="profile-trash-meta">Moved to the Trash on ${esc(when)} · ${item.days_left} day${item.days_left === 1 ? '' : 's'} left before it is gone for good.</div>
          ${item.deleted_reason ? `<div class="profile-trash-reason">Reason: ${esc(item.deleted_reason)}</div>` : ''}
        </div>
        <div class="profile-trash-action">${restore}</div>
      </div>
    `;
  },

  async restoreTrash(postId, btn) {
    if (btn) btn.disabled = true;
    const { data, error } = await supabase.rpc('gliim_restore', { p_post: postId });
    if (error) {
      if (btn) btn.disabled = false;
      return notify.toast('Could not restore it. ' + error.message, 5000);
    }
    if (!data || data.ok !== true) {
      if (btn) btn.disabled = false;
      return notify.toast('Could not restore it. ' + trashReason(data && data.code), 5000);
    }

    notify.toast('Gliim restored.');
    document.getElementById(`trash-${postId}`)?.remove();
    const rows = document.querySelectorAll('.profile-trash-row');
    if (!rows.length) this.renderProfile(this.targetUserId);
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
    const profileUrl = window.gliimAppUrl(`/profile?u=${userId}`);
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
