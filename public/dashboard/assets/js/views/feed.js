import hubView from './feed-gliims.js?v=107';
import { supabase } from '/shared/js/config.js';
import { store, tierClass, badgeIcon } from '../store.js?v=2';
import { loadCollections, renderCollectionCard } from '../collections.js?v=1';

const SEARCH_HISTORY_KEY = 'gliimu_search_history';
const MAX_HISTORY = 8;
const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
const TRENDING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SHELF_LIMIT = 8;
const CREATOR_LIMIT = 8;

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

// XpLoRe is the single home of every published work and of search itself.
// The resting state is browse (search box, people you follow, featured hero,
// category tabs, then the feed); typing swaps the feed for results in place.
// Data, cards and the composer still belong to hubView.
export default {
  title: 'XpLoRe',
  template: `
    <div class="xplore-page">
      <div class="xplore-hero" id="xplore-hero">
        <div class="xplore-search-box">
          ${SEARCH_ICON}
          <input type="search" id="xplore-search-input" class="xplore-search-input" placeholder="Search gliims, collections, people" aria-label="Search gliims, collections and people" autocomplete="off">
          <button type="button" id="xplore-search-clear" class="xplore-search-clear" aria-label="Clear search" hidden>${CLOSE_ICON}</button>
        </div>
        <div class="xplore-chips" id="xplore-chips"></div>
      </div>

      <div class="xplore-strip" id="xplore-follow" hidden></div>

      <div class="featured-carousel" id="featured-carousel" style="display:none;"></div>

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
          <button type="button" class="hub-tabs-search" id="hub-tabs-search" aria-label="Search" hidden>${SEARCH_ICON}</button>
        </div>

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

    this.setupCategoryTabs();
    this.setupSearch();
    this.watchStickyTabs();
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
    this.loadFeaturedPosts();
    this.loadFollowing();
  },

  destroy() {
    this.disposed = true;
    this.requestId++;
    clearTimeout(this.searchTimer);
    clearInterval(this._featuredTimer);
    this._featuredTimer = null;
    document.removeEventListener('click', this._followClick);
    this._observer?.disconnect();
    this._observer = null;
  },

  /* ---------------------------------- search --------------------------------- */

  setupSearch() {
    const input = document.getElementById('xplore-search-input');
    const clear = document.getElementById('xplore-search-clear');
    input.addEventListener('input', () => this.onQueryChange(input.value));
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const term = input.value.trim();
      if (term.length < 2) return;
      this.addToHistory(term);
      this.renderChips(false);
    });
    input.addEventListener('focus', () => this.renderChips(true));
    clear.addEventListener('click', () => this.clearQuery());
    document.getElementById('hub-tabs-search').addEventListener('click', () => {
      document.getElementById('xplore-hero').scrollIntoView({ behavior: 'smooth', block: 'start' });
      input.focus({ preventScroll: true });
    });
    document.getElementById('xplore-chips').addEventListener('click', event => {
      const chip = event.target.closest('[data-chip-term]');
      if (chip) {
        input.value = chip.dataset.chipTerm;
        this.onQueryChange(chip.dataset.chipTerm);
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
    this.renderChips(false);
  },

  onQueryChange(value) {
    const term = (value || '').trim();
    this.searchQuery = term;
    clearTimeout(this.searchTimer);
    // Bumping the id is what retires any search already in flight.
    const requestId = ++this.requestId;
    document.getElementById('xplore-search-clear').hidden = !term;
    // Browse furniture has no business on screen while results are wanted.
    document.getElementById('xplore-follow').hidden = term.length >= 2;
    document.getElementById('featured-carousel').style.display = term.length >= 2 ? 'none' : '';
    if (term.length < 2) {
      this.renderChips(document.getElementById('xplore-search-input') === document.activeElement);
      this.renderFeed();
      return;
    }
    const container = document.getElementById('library-feed');
    if (container) container.innerHTML = '<p style="text-align:center;width:100%;padding:60px 0;color:var(--text-muted);">Searching…</p>';
    this.searchTimer = setTimeout(() => this.performSearch(term, requestId), 200);
  },

  clearQuery() {
    const input = document.getElementById('xplore-search-input');
    input.value = '';
    this.onQueryChange('');
    input.focus();
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
    const history = this.getHistory();
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
    container.querySelector('[data-clear-search]').addEventListener('click', () => this.clearQuery());
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

  // One strip, two jobs: the people you follow, and — when that is empty,
  // which is where almost everyone starts — the creators worth following.
  async loadFollowing() {
    const strip = document.getElementById('xplore-follow');
    if (!strip || !store.user?.id) return;
    try {
      await this.loadFollowedIds();
      const ids = this._followedOrder.slice(0, 12);
      if (ids.length) {
        const { data: people, error } = await supabase.from('profiles')
          .select('id, full_name, avatar_url, total_gp, verification_badge').in('id', ids);
        if (error) throw error;
        const byId = new Map((people || []).map(person => [person.id, person]));
        const ordered = ids.map(id => byId.get(id)).filter(Boolean);
        if (!ordered.length) return;
        strip.hidden = this.searchQuery.length >= 2;
        strip.innerHTML = this.peopleBlock('Following', '', ordered, true);
        return;
      }
      const creators = await this.topCreators();
      if (!creators.length) return;
      strip.hidden = this.searchQuery.length >= 2;
      strip.innerHTML = this.peopleBlock('People worth following', '', creators, true);
    } catch (error) {
      console.error('Following could not load:', error);
    }
  },

  async topCreators() {
    if (!this._creatorsPromise) {
      this._creatorsPromise = supabase.from('profiles')
        .select('id, full_name, avatar_url, total_gp, verification_badge')
        .neq('id', store.user?.id).is('deletion_scheduled_at', null)
        .order('total_gp', { ascending: false, nullsFirst: false }).order('id').limit(CREATOR_LIMIT)
        .then(({ data, error }) => {
          if (error) { this._creatorsPromise = null; throw error; }
          return data || [];
        });
    }
    return this._creatorsPromise;
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
      this.loadFollowing();
    } catch (error) {
      console.error('Follow failed:', error);
      button.disabled = false;
    }
  },

  /* --------------------------------- shelves -------------------------------- */

  // live_gliim_links is service-only, so the session id comes from the card's
  // own live block and its on-air state from live_requests.
  async liveNowIds(posts) {
    const kinds = hubView.cardKinds || {};
    const livePosts = posts.filter(post => kinds[post.id] === 'live');
    if (!livePosts.length) return new Set();
    try {
      const { data: contents } = await supabase.from('feed_gliim_contents')
        .select('post_id, blocks').in('post_id', livePosts.map(post => post.id));
      const sessionToPost = new Map();
      for (const row of contents || []) {
        const block = (Array.isArray(row.blocks) ? row.blocks : [])
          .find(item => item && item.type === 'live' && item.session_id);
        if (block) sessionToPost.set(block.session_id, row.post_id);
      }
      if (!sessionToPost.size) return new Set();
      const { data: sessions } = await supabase.from('live_requests')
        .select('id, status').in('id', [...sessionToPost.keys()]).eq('status', 'active');
      const live = new Set();
      for (const session of sessions || []) {
        const postId = sessionToPost.get(session.id);
        if (postId) live.add(postId);
      }
      return live;
    } catch (error) {
      console.error('Live sessions could not be checked:', error);
      return new Set();
    }
  },

  // One shelf, three reasons to be on it: on air now, new in the last 24
  // hours, then the most-read of the week. Each post appears once.
  async buildNowShelf(posts) {
    const now = Date.now();
    const live = await this.liveNowIds(posts);
    const picked = [];
    const seen = new Set();
    const add = post => {
      if (!post || seen.has(post.id) || picked.length >= SHELF_LIMIT) return;
      seen.add(post.id);
      picked.push(post);
    };
    posts.filter(post => live.has(post.id)).forEach(add);
    posts.filter(post => now - (Date.parse(post.created_at) || 0) <= FRESH_WINDOW_MS)
      .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))
      .forEach(add);
    posts.filter(post => now - (Date.parse(post.created_at) || 0) <= TRENDING_WINDOW_MS && (post.views || 0) > 0)
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .forEach(add);
    return picked;
  },

  renderShelf(title, note, posts) {
    if (!posts.length) return '';
    return `<section class="xplore-slice">
      <h2 class="xplore-slice-title">${title} <span>${note}</span></h2>
      <div class="xplore-row">${posts.map(post => hubView.renderPostCard(post)).join('')}</div>
    </section>`;
  },

  /* ------------------------------- the feed -------------------------------- */

  setupCategoryTabs() {
    const tabs = document.querySelectorAll('.hub-category-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.category;
        // Tabs browse, they do not refine a search.
        if (this.searchQuery) {
          this.searchQuery = '';
          const input = document.getElementById('xplore-search-input');
          if (input) input.value = '';
          this.onQueryChange('');
        }
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

  // The tabs row is already sticky; the sentinel tells us when the search box
  // has scrolled away, which is when the icon earns its place.
  watchStickyTabs() {
    const hero = document.getElementById('xplore-hero');
    const icon = document.getElementById('hub-tabs-search');
    if (!hero || !icon || typeof IntersectionObserver !== 'function') {
      if (icon) icon.hidden = false;
      return;
    }
    this._observer = new IntersectionObserver(entries => {
      icon.hidden = entries[0].isIntersecting;
    }, { threshold: 0 });
    this._observer.observe(hero);
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
    if (this.searchQuery.length >= 2) {
      await this.performSearch(this.searchQuery, this.requestId);
      return;
    }

    const filtered = await hubView.filterPosts();
    if (!container.isConnected || this.currentTab === 'collections') return;

    const shelvesHtml = this.currentTab === 'all'
      ? await this.renderHeadShelves(filtered)
      : '';

    const gliimCards = filtered.map(post => ({
        at: Date.parse(post.created_at) || 0,
        html: this.wrapItem(hubView.renderPostCard(post), 'gliim')
      }));

    const cards = gliimCards
      .sort((a, b) => b.at - a.at)
      .map(c => c.html);

    if (!cards.length && !shelvesHtml) {
      const msg = 'Nothing here yet.';
      container.innerHTML = `<p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">${msg}</p>`;
      return;
    }

    container.innerHTML = `${shelvesHtml}<div class="library-feed feed-grid">${cards.join('')}</div>`;
    this.layoutMasonry();
  },

  // Both head shelves read from the already-loaded feed, so they cost no extra
  // queries beyond the live-session check.
  async renderHeadShelves(posts) {
    const visible = posts.filter(post => !post.status || post.status === 'approved');
    // Follow state must be known before any creator tile is drawn, otherwise
    // the buttons would promise the wrong action.
    const [now, creators] = await Promise.all([
      this.buildNowShelf(visible),
      this.loadFollowedIds().then(() => this.topCreators())
    ]);
    const slices = [this.renderShelf('Now on Gliimu', 'Live, new and most-read', now)];
    if (creators.length)
      slices.push(`<section class="xplore-slice">${this.peopleBlock('Top creators', 'All-time GP', creators, true)}</section>`);
    return slices.join('');
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
  },

  /* ------------------------------ featured hero ----------------------------- */

  async loadFeaturedPosts() {
    const now = new Date().toISOString();
    const { data: posts } = await supabase
      .from('featured_posts')
      .select('id, title, description, image_url, link_url, link_label')
      .eq('status', 'approved')
      .lte('starts_at', now)
      .gte('ends_at', now)
      .order('created_at', { ascending: false })
      .limit(3);

    this._featuredPosts = posts || [];
    this._featuredIndex = 0;
    this.renderFeaturedCarousel();
    if (this._featuredPosts.length > 1) this.startFeaturedRotation();
  },

  renderFeaturedCarousel() {
    const el = document.getElementById('featured-carousel');
    if (!el) return;
    if (!this._featuredPosts || !this._featuredPosts.length) {
      el.style.display = 'none';
      return;
    }
    if (this.searchQuery.length >= 2) return;
    el.style.display = '';
    el.onmouseenter = () => {
      if (this._featuredTimer) { clearInterval(this._featuredTimer); this._featuredTimer = null; }
    };
    el.onmouseleave = () => {
      if (this._featuredPosts.length > 1 && !this._featuredTimer) this.startFeaturedRotation();
    };
    this.updateFeaturedSlide();
  },

  updateFeaturedSlide() {
    const el = document.getElementById('featured-carousel');
    if (!el || !this._featuredPosts || !this._featuredPosts.length) return;
    const post = this._featuredPosts[this._featuredIndex];
    const dots = this._featuredPosts.length > 1
      ? `<div class="featured-dots">${this._featuredPosts.map((_, i) => `<span class="featured-dot${i === this._featuredIndex ? ' active' : ''}" onclick="feedInstance.goToFeaturedSlide(${i})"></span>`).join('')}</div>`
      : '';
    el.innerHTML = `
      <div class="featured-slide">
        ${post.image_url ? `<img src="${post.image_url}" alt="" class="featured-slide-img">` : '<div class="featured-slide-img featured-slide-img-empty"></div>'}
        <div class="featured-slide-overlay"></div>
        <span class="featured-badge">Featured</span>
        <div class="featured-slide-content">
          <h3 class="featured-slide-title">${escapeHtml(post.title)}</h3>
          <p class="featured-slide-desc">${escapeHtml(post.description || '')}</p>
          ${post.link_url ? `<a href="${post.link_url}" target="_blank" rel="noopener" class="featured-slide-link" onclick="event.stopPropagation()">${escapeHtml(post.link_label || 'Learn more')}</a>` : ''}
        </div>
      </div>
      ${dots}
    `;
  },

  goToFeaturedSlide(index) {
    this._featuredIndex = index;
    this.updateFeaturedSlide();
  },

  startFeaturedRotation() {
    if (this._featuredTimer) clearInterval(this._featuredTimer);
    this._featuredTimer = setInterval(() => {
      this._featuredIndex = (this._featuredIndex + 1) % this._featuredPosts.length;
      this.updateFeaturedSlide();
    }, 7000);
  }
};
