import hubView from './feed-gliims.js?v=112';
import { supabase } from '/shared/js/config.js';
import { store, tierClass, badgeIcon } from '../store.js?v=2';
import { loadCollections, renderCollectionCard } from '../collections.js?v=1';

const SEARCH_HISTORY_KEY = 'gliimu_search_history';
const MAX_HISTORY = 8;
const CHIP_COUNT = 3;

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SEARCH_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"/></svg>';
const CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>';
const BELL_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';
const GEAR_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
const BLANK_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23F1F5F9'/%3E%3C/svg%3E";

// XpLoRe is the single home of every published work and of search itself.
// The resting state is browse (account cluster, search box, category tabs,
// then the feed); typing swaps the feed for results in place.
// Data, cards and the composer still belong to hubView.
export default {
  title: 'XpLoRe',
  template: `
    <div class="xplore-page">
      <div class="xplore-actions">
        <a class="xplore-action" href="#/alerts" title="Alerts" aria-label="Alerts">${BELL_ICON}</a>
        <a class="xplore-action" href="#/settings" title="Settings" aria-label="Settings">${GEAR_ICON}</a>
        <a class="xplore-avatar-link" href="#/profile" data-account-trigger aria-haspopup="menu" aria-expanded="false" title="Profile" aria-label="Your profile">
          <img class="xplore-avatar" data-user-avatar src="${BLANK_AVATAR}" alt="Your profile">
          <span class="unread-dot" data-dot="alerts" hidden></span>
        </a>
      </div>

      <div class="xplore-hero" id="xplore-hero">
        <img class="xplore-brand" src="/icons/logo.png" alt="Gliimu">
        <div class="xplore-search-box">
          ${SEARCH_ICON}
          <input type="search" id="xplore-search-input" class="xplore-search-input" placeholder="Search gliims, collections, people" aria-label="Search gliims, collections and people" autocomplete="off">
        </div>
        <div class="xplore-chips" id="xplore-chips"></div>
      </div>

      <div class="libmerge hub-layout" id="library-container">
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

        <div class="xplore-ring" id="xplore-ring" hidden></div>

        <div class="libmerge-feed" id="library-feed">
          <p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">Loading the Feed...</p>
        </div>
      </div>
    </div>
  `,

  init() {
    this.searchQuery = '';
    this.currentTab = 'all';
    this.requestId = (this.requestId || 0) + 1;
    this.disposed = false;
    this._collections = null;
    this._ringCreator = null;
    // Re-read which gliims I have opened, so views made elsewhere count here too.
    this._viewedIds = null;

    this.setupCategoryTabs();
    this.setupSearch();
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
    this.refreshDots();
    this.applySelfAvatar();
  },

  // app.js paints [data-user-avatar] once at boot, before this view exists,
  // so the cluster avatar has to take the profile picture itself.
  applySelfAvatar() {
    const img = document.querySelector('.xplore-avatar');
    if (img && store.profile?.avatar_url) img.src = store.profile.avatar_url;
  },

  // The cluster and rail dots live inside this view, so a re-render starts
  // with them hidden until the counts are pushed back onto them.
  refreshDots() {
    const manager = window.NotificationManager;
    if (!manager) return;
    ['ping', 'alerts'].forEach(name => manager.updateBadge(name, manager.counts?.[name] || 0));
  },

  destroy() {
    this.disposed = true;
    this.requestId++;
    document.removeEventListener('click', this._followClick);
    document.removeEventListener('click', this._navReset);
    window.removeEventListener('gliimu-post-viewed', this._viewedListener);
  },

  /* ---------------------------------- search --------------------------------- */

  setupSearch() {
    const input = document.getElementById('xplore-search-input');
    // Typing costs nothing on screen: Enter (or the keyboard's Go) commits a
    // search, and the results then hold their place until a tab takes the page
    // back to browse.
    input.addEventListener('input', () => this.renderChips(true));
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.submitSearch(input.value);
    });
    input.addEventListener('focus', () => this.renderChips(true));
    document.getElementById('xplore-chips').addEventListener('click', event => {
      const chip = event.target.closest('[data-chip-term]');
      if (chip) {
        input.value = chip.dataset.chipTerm;
        this.submitSearch(chip.dataset.chipTerm);
        return;
      }
      const remove = event.target.closest('[data-chip-remove]');
      if (remove) {
        this.removeFromHistory(Number(remove.dataset.chipRemove));
        this.renderChips(true);
        return;
      }
      if (event.target.closest('[data-chip-clear]')) {
        this.clearHistory();
        this.renderChips(true);
      }
    });
    // Tapping the XpLoRe tab while already on it changes no hash, so the router
    // never re-inits this view. Clearing the search here is the one door back.
    this._navReset = (event) => {
      if (!event.target.closest('.nav-item[href="#/xplore"], .bottom-item[href="#/xplore"]')) return;
      this.clearSearch();
      this.renderFeed();
    };
    document.addEventListener('click', this._navReset);
    this.renderChips(false);
  },

  submitSearch(value) {
    const term = (value || '').trim();
    if (term.length < 2) return;
    const requestId = ++this.requestId;
    this.searchQuery = term;
    this.addToHistory(term);
    this.renderChips(false);
    this.renderRing();
    const container = document.getElementById('library-feed');
    if (container) container.innerHTML = '<p style="text-align:center;width:100%;padding:60px 0;color:var(--text-muted);">Searching…</p>';
    this.performSearch(term, requestId);
  },

  clearSearch() {
    if (!this.searchQuery) return;
    this.searchQuery = '';
    // A search still in flight must not land on the browse page it was asked to
    // leave, so its request id is retired here.
    this.requestId++;
    const input = document.getElementById('xplore-search-input');
    if (input) input.value = '';
    this.renderRing();
    this.renderChips(document.activeElement === input);
  },

  getHistory() {
    try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY)) || []; }
    catch { return []; }
  },

  addToHistory(term) {
    const history = this.getHistory().filter(item => item.toLowerCase() !== term.toLowerCase());
    history.unshift(term);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  },

  removeFromHistory(index) {
    const history = this.getHistory();
    history.splice(index, 1);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
  },

  clearHistory() {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
  },

  // Chips are the only history surface, and only while the box is empty —
  // once there is a term, the results are the point.
  renderChips(visible) {
    const el = document.getElementById('xplore-chips');
    if (!el) return;
    const history = this.getHistory().slice(0, CHIP_COUNT);
    if (!history.length || this.searchQuery || !visible) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `<span class="xplore-chips-label">Recent</span>` + history.map((term, index) => `
      <span class="xplore-chip">
        <button type="button" class="xplore-chip-text" data-chip-term="${escapeHtml(term)}">${escapeHtml(term)}</button>
        <button type="button" class="xplore-chip-remove" data-chip-remove="${index}" aria-label="Remove ${escapeHtml(term)}">${CLOSE_ICON}</button>
      </span>`).join('') +
      `<button type="button" class="xplore-chip-clear" data-chip-clear>Clear all</button>`;
  },

  async collections() {
    if (!this._collections) this._collections = await loadCollections();
    return this._collections;
  },

  async performSearch(term, requestId) {
    const needle = term.toLowerCase();
    try {
      const [usersResult, collectionList] = await Promise.all([
        supabase.from('profiles')
          .select('id, full_name, avatar_url, total_gp, verification_badge')
          .ilike('full_name', `%${term.replace(/[\\%_]/g, '\\$&')}%`)
          .is('deletion_scheduled_at', null)
          .limit(10),
        this.collections().catch(() => [])
      ]);
      if (usersResult.error) throw usersResult.error;
      if (this.disposed || requestId !== this.requestId) return;

      // The feed already holds every approved gliim, so gliims and collections
      // match locally — cards then render through hubView like the feed does.
      const posts = (hubView.currentPosts || [])
        .filter(post => post.status !== 'draft')
        .filter(post => !post.status || post.status === 'approved' || post.user_id === store.user?.id)
        .filter(post => {
          const haystack = [post.title, post.description, post.category, post.profiles?.full_name]
            .filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(needle);
        });

      const tag = needle.replace(/^#/, '');
      const collections = collectionList.filter(item => item.tag.includes(tag));
      this.renderResults({ posts, collections, users: usersResult.data || [] });
    } catch (error) {
      if (this.disposed || requestId !== this.requestId) return;
      console.error('XpLoRe search failed:', error);
      const container = document.getElementById('library-feed');
      if (container) container.innerHTML = '<p style="text-align:center;width:100%;padding:60px 0;color:var(--text-muted);">Could not run that search. Please try again.</p>';
    }
  },

  renderResults({ posts, collections, users }) {
    const container = document.getElementById('library-feed');
    if (!container || !container.isConnected) return;
    const total = posts.length + collections.length + users.length;
    if (!total) {
      container.innerHTML = `<p class="xplore-no-results">Nothing matches “${escapeHtml(this.searchQuery)}”.</p>`;
      return;
    }
    const people = users.length
      ? `<section class="xplore-slice">${this.peopleBlock('People', String(users.length), users, true)}</section>`
      : '';
    const groups = collections.length
      ? `<section class="xplore-slice"><h2 class="xplore-slice-title">Collections <span>${collections.length}</span></h2>
         <div class="xplore-row">${collections.map(renderCollectionCard).join('')}</div></section>`
      : '';
    const gliims = posts.length
      ? `<section class="xplore-slice"><h2 class="xplore-slice-title">Gliims <span>${posts.length}</span></h2>
         <div class="library-feed feed-grid">${posts.map(post => this.wrapItem(hubView.renderPostCard(post), 'gliim')).join('')}</div></section>`
      : '';
    container.innerHTML = `<div class="xplore-results-head">${total} result${total === 1 ? '' : 's'} for “${escapeHtml(this.searchQuery)}”
      <button type="button" class="xplore-results-clear" data-clear-search>Clear</button></div>${people}${groups}${gliims}`;
    container.querySelector('[data-clear-search]').addEventListener('click', () => {
      this.clearSearch();
      this.renderFeed();
    });
    this.layoutMasonry();
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
    if (this.currentTab !== 'xploring' || this.searchQuery.length >= 2) {
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
        // Tabs browse, they do not refine a search.
        this.clearSearch();
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
    if (this.searchQuery.length >= 2) {
      await this.performSearch(this.searchQuery, this.requestId);
      return;
    }

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
