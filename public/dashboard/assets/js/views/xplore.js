import hubView from './gliims.js?v=127';
import { supabase } from '/shared/js/config.js?v=2';
import { store, tierClass, badgeIcon } from '../store.js?v=2';
import { loadCollections, renderCollectionCard } from '../collections.js?v=1';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// XpLoRe is pure browse: the category tabs, then every published work. Publish,
// Search and Billing all live in the navigation now, and the brand mark sits in
// the sidebar header, so nothing on this page duplicates a door the rail or the
// bottom bar already opens. Data, cards and the composer still belong to hubView.
export default {
  title: 'XpLoRe',
  template: `
    <div class="xplore-page">
      <div class="libmerge hub-layout" id="library-container">
        <div class="hub-top-band">
          <div class="hub-category-tabs" id="hub-category-tabs">
            <button class="hub-category-tab active" data-category="all">For You</button>
            <button class="hub-category-tab" data-category="xploring">Xploring</button>
            <button class="hub-category-tab" data-category="collections">Collections</button>
            <button class="hub-category-tab" data-category="Media">Media</button>
            <button class="hub-category-tab" data-category="Tech">Tech</button>
            <button class="hub-category-tab" data-category="Business">Business</button>
            <button class="hub-category-tab" data-category="Personal">Personal</button>
            <button class="hub-category-tab" data-category="Education">Education</button>
          </div>
          <button class="cohort-strip" id="cohort-strip" hidden type="button"></button>
        </div>

        <div class="xplore-ring" id="xplore-ring" hidden></div>

        <div class="libmerge-feed" id="library-feed">
          <p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">Loading the Feed...</p>
        </div>
      </div>
    </div>
  `,

  init() {
    this.currentTab = 'all';
    this.requestId = (this.requestId || 0) + 1;
    this.disposed = false;
    this._collections = null;
    this._ringCreator = null;
    // Re-read which gliims I have opened, so views made elsewhere count here too.
    this._viewedIds = null;

    this.setupCategoryTabs();
    this.setupCohortStrip();
    this.setupRing();
    this.bindFollowButtons();

    hubView.onFeedChange = () => this.renderFeed();

    if (!this._masonryResize) {
      this._masonryResize = () => {
        clearTimeout(this._masonryTimer);
        this._masonryTimer = setTimeout(() => this.layoutMasonry(), 120);
      };
      window.addEventListener('resize', this._masonryResize);
    }

    hubView.init();
    window.feedInstance = this;
  },

  destroy() {
    this.disposed = true;
    this.requestId++;
    document.removeEventListener('click', this._followClick);
    window.removeEventListener('gliimu-post-viewed', this._viewedListener);
  },

  /* ------------------------------- co-hort strip ---------------------------- */

  // Operations starts one co-hort at a time; the strip sits over the filter
  // tabs and reads "2/9 Full Stack Media Architecture". Tapping it records
  // interest, then hands the member to Support in Ping with a pre-arranged
  // message they can send, edit or add to. Anything failing keeps it hidden.
  async setupCohortStrip() {
    const requestId = this.requestId;
    const { data, error } = await supabase.rpc('get_active_cohort');
    if (this.disposed || requestId !== this.requestId) return;
    if (error || !data || data.ok !== true || !data.cohort) return;
    this.cohort = data.cohort;
    this.renderCohortStrip();
  },

  renderCohortStrip() {
    const strip = document.getElementById('cohort-strip');
    const c = this.cohort;
    if (!strip || !c) return;
    strip.innerHTML = `
      <span class="cohort-strip-count">${Number(c.interested_count || 0)}/${Number(c.required_count || 0)}</span>
      <span class="cohort-strip-title">${escapeHtml(c.strip_label || c.title || '')}</span>
      <svg class="cohort-strip-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    strip.hidden = false;
    if (!this._cohortClick) {
      this._cohortClick = () => this.onCohortTap();
      strip.addEventListener('click', this._cohortClick);
    }
  },

  async onCohortTap() {
    const c = this.cohort;
    if (!c) return;
    const { data, error } = await supabase.rpc('cohort_show_interest', { p_cohort: c.id });
    if (!error && data && data.ok === true) {
      this.cohort.interested_count = data.interested_count;
      this.cohort.my_status = data.my_status;
      this.renderCohortStrip();
    }
    sessionStorage.setItem('cohortSupportPrefill', 'I would like to join the co-hort, how do I register?');
    window.location.hash = '#/ping';
  },

  async collections() {
    if (!this._collections) this._collections = await loadCollections();
    return this._collections;
  },

  /* --------------------------------- people -------------------------------- */

  profileHref(id) {
    return id === store.user?.id ? '#/profile' : `#/profile?u=${encodeURIComponent(id)}`;
  },

  renderPerson(user, followable) {
    const avatarClass = tierClass(user.total_gp, 'xplore-person-avatar');
    const isSelf = user.id === store.user?.id;
    const following = this._followedIds?.has(user.id);
    const action = followable && !isSelf
      ? `<button type="button" class="xplore-follow-btn${following ? ' is-following' : ''}" data-follow="${escapeHtml(user.id)}"${following ? ' title="Unfollow"' : ''}>${following ? 'Following' : 'Follow'}</button>`
      : '';
    return `<div class="xplore-person">
      <a class="xplore-person-id" href="${this.profileHref(user.id)}">
        ${user.avatar_url ? `<img class="${avatarClass}" src="${escapeHtml(user.avatar_url)}" alt="" loading="lazy">` : `<span class="${avatarClass}"></span>`}
        <span class="xplore-person-name">${escapeHtml(user.full_name)}${badgeIcon(user.verification_badge)}</span>
      </a>
      ${action}
    </div>`;
  },

  bindFollowButtons() {
    this._followClick = event => {
      const button = event.target.closest('[data-follow]');
      if (button) this.toggleFollow(button.dataset.follow, button);
    };
    document.addEventListener('click', this._followClick);
  },

  peopleBlock(title, note, people, followable) {
    if (!people.length) return '';
    return `<div class="xplore-people">
      <h2 class="xplore-people-heading">${title}${note ? ` <span>${note}</span>` : ''}</h2>
      <div class="xplore-people-track">${people.map(person => this.renderPerson(person, followable)).join('')}</div>
    </div>`;
  },

  // A person's follow state comes from one cached read of followed_users, so
  // every follow button on the page renders from the same truth.
  async loadFollowedIds() {
    if (this._followedIds) return this._followedIds;
    if (!store.user?.id) {
      this._followedIds = new Set();
      this._followedOrder = [];
      return this._followedIds;
    }
    if (!this._followedPromise) {
      this._followedPromise = supabase.from('followed_users')
        .select('followed_id').eq('follower_id', store.user.id)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          this._followedPromise = null;
          if (error) throw error;
          this._followedOrder = (data || []).map(row => row.followed_id);
          this._followedIds = new Set(this._followedOrder);
          return this._followedIds;
        });
    }
    return this._followedPromise;
  },

  /* -------------------------------- xploring ------------------------------- */
  // Xploring opens with the faces it is about: one pill per followed creator
  // who has published, each badged with the number of their gliims this member
  // has never opened. Tapping a face narrows the list below to that creator
  // while the row stays put; tapping it again lets everyone back in.

  setupRing() {
    const el = document.getElementById('xplore-ring');
    if (!el) return;
    this._ringClick = event => {
      const face = event.target.closest('[data-ring]');
      if (!face) return;
      const creator = face.dataset.ring;
      this._ringCreator = this._ringCreator === creator ? null : creator;
      this.renderRing();
      this.renderFeed();
    };
    el.addEventListener('click', this._ringClick);

    window.removeEventListener('gliimu-post-viewed', this._viewedListener);
    this._viewedListener = event => {
      const postId = event.detail?.postId;
      // Only clear a badge once the read history is already in memory; otherwise
      // the next render fetches the truth from the database anyway.
      if (postId && this._viewedIds) {
        this._viewedIds.add(postId);
        if (this.currentTab === 'xploring') this.renderRing();
      }
    };
    window.addEventListener('gliimu-post-viewed', this._viewedListener);
  },

  async loadViewedIds() {
    if (this._viewedIds) return this._viewedIds;
    if (!store.user?.id) {
      this._viewedIds = new Set();
      return this._viewedIds;
    }
    const { data, error } = await supabase.from('post_views').select('post_id');
    if (error) {
      console.warn('Read history could not be read, so every gliim counts as new:', error.message);
      this._viewedIds = new Set();
      return this._viewedIds;
    }
    this._viewedIds = new Set((data || []).map(row => row.post_id));
    return this._viewedIds;
  },

  async renderRing() {
    const el = document.getElementById('xplore-ring');
    if (!el) return;
    if (this.currentTab !== 'xploring') {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }

    const [followed, viewed] = await Promise.all([
      this.loadFollowedIds().catch(() => new Set()),
      this.loadViewedIds()
    ]);
    if (el.isConnected === false || this.currentTab !== 'xploring') return;

    const creators = new Map();
    for (const post of hubView.currentPosts || []) {
      if (post.status === 'draft' || !followed.has(post.user_id)) continue;
      const entry = creators.get(post.user_id) || {
        name: post.profiles?.full_name || '',
        avatar: post.profiles?.avatar_url || '',
        badge: post.profiles?.verification_badge || null,
        latest: 0,
        unread: 0
      };
      entry.latest = Math.max(entry.latest, Date.parse(post.created_at) || 0);
      if (!viewed.has(post.id)) entry.unread++;
      creators.set(post.user_id, entry);
    }

    const list = [...creators.entries()]
      .map(([id, creator]) => ({ id, ...creator }))
      .sort((a, b) => b.latest - a.latest);

    if (!list.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }

    el.hidden = false;
    el.innerHTML = list.map(creator => `
      <button type="button" class="xplore-ring-person${creator.id === this._ringCreator ? ' is-active' : ''}"
              data-ring="${escapeHtml(creator.id)}" aria-pressed="${creator.id === this._ringCreator}">
        <span class="xplore-ring-face">
          ${creator.avatar
            ? `<img class="xplore-ring-avatar" src="${escapeHtml(creator.avatar)}" alt="" loading="lazy">`
            : '<span class="xplore-ring-avatar"></span>'}
          ${creator.unread ? `<span class="xplore-ring-count">${creator.unread > 9 ? '9+' : creator.unread}</span>` : ''}
        </span>
        <span class="xplore-ring-name">${escapeHtml(creator.name)}${creator.badge ? badgeIcon(creator.badge) : ''}</span>
      </button>`).join('');
  },

  async toggleFollow(userId, button) {
    if (!store.user?.id || button.disabled) return;
    button.disabled = true;
    const following = this._followedIds?.has(userId);
    try {
      if (following) {
        const { error } = await supabase.from('followed_users')
          .delete().eq('follower_id', store.user.id).eq('followed_id', userId);
        if (error) throw error;
        this._followedIds.delete(userId);
        this._followedOrder = this._followedOrder.filter(id => id !== userId);
      } else {
        const { error } = await supabase.from('followed_users')
          .insert({ follower_id: store.user.id, followed_id: userId });
        if (error) throw error;
        this._followedIds.add(userId);
        this._followedOrder = [userId, ...this._followedOrder];
      }
      button.disabled = false;
      button.classList.toggle('is-following', !following);
      button.textContent = following ? 'Follow' : 'Following';
      button.title = following ? '' : 'Unfollow';
      // The avatar rail in the sidebar listens for this so faces appear and
      // leave the moment the follow list changes.
      window.dispatchEvent(new CustomEvent('gliimu-follow-changed'));
    } catch (error) {
      console.error('Follow failed:', error);
      button.disabled = false;
    }
  },

  /* ------------------------------- the feed -------------------------------- */

  setupCategoryTabs() {
    const tabs = document.querySelectorAll('.hub-category-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.category;
        // Re-tapping Xploring drops a creator filter without a second control.
        if (tab.dataset.category === 'xploring') this._ringCreator = null;
        this.renderRing();
        if (tab.dataset.category === 'collections') {
          this.renderCollections();
        } else {
          hubView.currentFilter = tab.dataset.category;
          hubView.renderPosts(hubView.currentPosts);
          this.renderFeed();
        }
      });
    });
  },

  async renderCollections() {
    const container = document.getElementById('library-feed');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;width:100%;padding:60px 0;color:var(--text-muted);">Loading collections...</p>';

    try {
      const collections = await this.collections();
      if (!container.isConnected || this.currentTab !== 'collections') return;
      collections.sort((a, b) => Number(b.userIds.includes(store.user?.id)) - Number(a.userIds.includes(store.user?.id)) || b.count - a.count);
      container.innerHTML = collections.length
        ? `<div class="collections-grid">${collections.map(renderCollectionCard).join('')}</div>`
        : '<p style="text-align:center;width:100%;padding:60px 0;color:var(--text-muted);">No collections yet.</p>';
    } catch (error) {
      console.error('Collections could not load:', error);
      if (container.isConnected && this.currentTab === 'collections') container.innerHTML = '<p style="text-align:center;width:100%;padding:60px 0;color:var(--text-muted);">Could not load collections.</p>';
    }
  },

  async renderFeed() {
    const container = document.getElementById('library-feed');
    if (!container || this.currentTab === 'collections') return;
    this.renderRing();

    const filtered = await hubView.filterPosts();
    if (!container.isConnected || this.currentTab === 'collections') return;

    const shown = this.currentTab === 'xploring' && this._ringCreator
      ? filtered.filter(post => post.user_id === this._ringCreator)
      : filtered;

    const cards = shown
      .map(post => ({
        at: Date.parse(post.created_at) || 0,
        html: this.wrapItem(hubView.renderPostCard(post), 'gliim')
      }))
      .sort((a, b) => b.at - a.at)
      .map(c => c.html);

    if (!cards.length) {
      container.innerHTML = '<p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">Nothing here yet.</p>';
      return;
    }

    container.innerHTML = `<div class="library-feed feed-grid">${cards.join('')}</div>`;
    this.layoutMasonry();
  },

  wrapItem(html, kind) {
    return `<div class="feed-item feed-item--${kind}">${html}</div>`;
  },

  // Pinterest masonry: each item spans exactly its own height in 8px row
  // slices (plus its bottom gap), so short tiles tuck under tall cards with
  // no row-sized dead space. Re-run whenever widths change.
  layoutMasonry(scope = '#library-feed') {
    const feed = document.querySelector(`${scope} .library-feed`);
    if (!feed) return;

    const ROW = 8;
    const GAP = window.matchMedia('(max-width: 768px)').matches ? 12 : 24;

    feed.querySelectorAll('.feed-item').forEach(item => {
      const inner = item.firstElementChild;
      if (!inner) return;
      item.style.gridRowEnd = 'auto';
      const height = inner.getBoundingClientRect().height;
      item.style.gridRowEnd = `span ${Math.max(1, Math.ceil((height + GAP) / ROW))}`;
    });
  }
};
