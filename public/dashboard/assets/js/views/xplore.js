import hubView from './gliims.js?v=132';
import { supabase } from '/shared/js/config.js?v=2';
import { store, tierClass, badgeIcon } from '../store.js?v=3';
import { loadCollections, renderCollectionCard } from '../collections.js?v=2';
import { createSearchEngine } from '../search-engine.js?v=4';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LIVE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2"></circle><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"></path></svg>';
const PUBLISH_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>';
const COMPASS_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>';

const feedView = {
  title: 'XpLoRe',
  template: '',

  init() {
    this.currentTab = 'all';
    this.requestId = (this.requestId || 0) + 1;
    this.disposed = false;
    this._collections = null;
    this._ringCreator = null;
    this._viewedIds = null;

    this.setupCategoryTabs();
    this.setupRing();
    hubView.onFeedChange = () => this.renderFeed();

    if (!this._masonryResize) {
      this._masonryResize = () => {
        clearTimeout(this._masonryTimer);
        this._masonryTimer = setTimeout(() => this.layoutMasonry(), 120);
      };
      window.addEventListener('resize', this._masonryResize);
    }

    hubView.init();
    search.init();
    this.syncSearchState(false);
    window.feedInstance = this;
  },

  destroy() {
    this.disposed = true;
    this.requestId++;
    search.destroy();
    document.removeEventListener('click', this._followClick);
    window.removeEventListener('gliimu-post-viewed', this._viewedListener);
    if (hubView.onFeedChange) hubView.onFeedChange = null;
  },

  syncSearchState(active) {
    const band = document.getElementById('hub-top-band');
    const feed = document.getElementById('library-feed');
    if (band) band.hidden = active;
    if (feed) feed.hidden = active;
    if (!active) {
      this.renderRing();
      this.layoutMasonry();
    }
  },

  async collections() {
    if (!this._collections) this._collections = await loadCollections();
    return this._collections;
  },

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

  setupRing() {
    const el = document.getElementById('xplore-ring');
    if (!el) return;
    el.addEventListener('click', event => {
      const face = event.target.closest('[data-ring]');
      if (!face) return;
      const creator = face.dataset.ring;
      this._ringCreator = this._ringCreator === creator ? null : creator;
      this.currentTab = 'all';
      hubView.currentFilter = 'all';
      document.querySelectorAll('.xplore-page .hub-category-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === 'all');
      });
      this.renderRing();
      this.renderFeed();
    });

    window.removeEventListener('gliimu-post-viewed', this._viewedListener);
    this._viewedListener = event => {
      const postId = event.detail?.postId;
      if (postId && this._viewedIds) {
        this._viewedIds.add(postId);
        this.renderRing();
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
    const requestId = this.requestId;
    const [followed, viewed] = await Promise.all([
      this.loadFollowedIds().catch(() => new Set()),
      this.loadViewedIds()
    ]);
    if (!el.isConnected || this.disposed || requestId !== this.requestId) return;

    const creators = new Map();
    for (const post of hubView.currentPosts || []) {
      if (post.status === 'draft' || !followed.has(post.user_id)) continue;
      const entry = creators.get(post.user_id) || {
        name: post.profiles?.full_name || '',
        avatar: post.profiles?.avatar_url || '',
        latest: 0,
        unread: false
      };
      entry.latest = Math.max(entry.latest, Date.parse(post.created_at) || 0);
      if (!viewed.has(post.id)) entry.unread = true;
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
      <button type="button" class="xplore-ring-person${creator.id === this._ringCreator ? ' is-active' : ''}${creator.unread ? ' has-unread' : ''}"
              data-ring="${escapeHtml(creator.id)}" aria-pressed="${creator.id === this._ringCreator}"
              aria-label="${escapeHtml(creator.name)}${creator.unread ? ', new gliims' : ''}" title="${escapeHtml(creator.name)}">
        ${creator.avatar
          ? `<img class="xplore-ring-avatar" src="${escapeHtml(creator.avatar)}" alt="" loading="lazy">`
          : '<span class="xplore-ring-avatar"></span>'}
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
      window.dispatchEvent(new CustomEvent('gliimu-follow-changed'));
      this.renderRing();
    } catch (error) {
      console.error('Follow failed:', error);
      button.disabled = false;
    }
  },

  setupCategoryTabs() {
    const tabs = document.querySelectorAll('.xplore-page .hub-category-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.category;
        this._ringCreator = null;
        this.renderRing();
        if (this.currentTab === 'collections') {
          this.renderCollections();
        } else {
          hubView.currentFilter = this.currentTab;
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
    if (!container || this.currentTab === 'collections' || search.isActive()) return;
    this.renderRing();

    const filtered = await hubView.filterPosts();
    if (!container.isConnected || this.currentTab === 'collections' || search.isActive()) return;

    const shown = this._ringCreator
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

const search = createSearchEngine({
  feedView,
  embedded: true,
  collapsible: true,
  leadingHtml: `<a class="xplore-brand" href="/xplore" aria-label="Gliimu home">
    <img src="/icons/icon.png" alt="" aria-hidden="true"><span>liimu</span>
  </a>`,
  actionsHtml: `<nav class="xplore-actions" aria-label="Create and live">
    <a class="xplore-action" href="/live">${LIVE_ICON}<span>Live</span></a>
    <a class="xplore-action xplore-action-primary" href="/publish">${PUBLISH_ICON}<span>Publish</span></a>
  </nav>`,
  onStateChange: ({ active }) => feedView.syncSearchState(active)
});

feedView.template = `
  <div class="xplore-page">
    <div class="libmerge hub-layout" id="library-container">
      <div class="xplore-command" id="xplore-command">${search.template}</div>
      <div class="hub-top-band" id="hub-top-band">
        <div class="xplore-tab-row">
          <div class="hub-category-tabs" id="hub-category-tabs" aria-label="XpLoRe sections">
            <button class="hub-category-tab active" data-category="all">${COMPASS_ICON}<span>XpLoRe</span></button>
            <button class="hub-category-tab" data-category="collections">Collections</button>
            <button class="hub-category-tab" data-category="saved">Saved</button>
          </div>
          <div class="xplore-ring" id="xplore-ring" aria-label="Followed creators" hidden></div>
        </div>
      </div>
      <div class="libmerge-feed" id="library-feed">
        <p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">Loading the Feed...</p>
      </div>
    </div>
  </div>
`;

export default feedView;
