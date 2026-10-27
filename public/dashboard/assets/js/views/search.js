import { supabase } from '/shared/js/config.js';
import { store, tierClass, badgeIcon } from '../store.js?v=2';
import { loadCollections, renderCollectionCard } from '../collections.js?v=1';

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SEARCH_HISTORY_KEY = 'gliimu_search_history';
const MAX_HISTORY = 10;

export default {
  title: 'Search',
  template: `
    <div class="search-layout">
      <div class="search-hero">
        <a class="search-hero-brand" href="/" aria-label="Gliimu home"><img src="/icons/logo.png" alt="Gliimu"></a>
        <div class="search-bar-wrap">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"/></svg>
          <input type="search" id="global-search-input" class="search-hero-input" placeholder="Search gliims, collections, users..." aria-label="Search gliims, collections and users" autocomplete="off">
        </div>
      </div>
      <div id="search-discovery">
        <section class="search-section" aria-labelledby="search-collections-heading">
          <h2 id="search-collections-heading">Collections</h2>
          <div class="search-row search-collections-row" id="search-collections"><p class="search-section-status">Loading collections...</p></div>
        </section>
        <section class="search-section" aria-labelledby="search-recent-heading">
          <h2 id="search-recent-heading">Recent posts <span>Last 3 hours</span></h2>
          <div class="search-row search-posts-row" id="search-recent"><p class="search-section-status">Loading recent posts...</p></div>
        </section>
        <section class="search-section" aria-labelledby="search-creators-heading">
          <h2 id="search-creators-heading">Top creators <span>All-time GP</span></h2>
          <div class="search-row search-creators-row" id="search-creators"><p class="search-section-status">Loading creators...</p></div>
        </section>
        <div class="search-history" id="search-history"></div>
      </div>
      <div class="search-results" id="search-results" aria-live="polite" hidden></div>
    </div>
  `,

  init() {
    this.query = '';
    this.requestId = (this.requestId || 0) + 1;
    this.disposed = false;
    this.results = { gliims: [], collections: [], users: [] };
    this.layout = document.querySelector('.search-layout');
    this.layout.addEventListener('click', event => {
      const post = event.target.closest('[data-post-id]');
      if (post) { event.preventDefault(); this.openGliim(post.dataset.postId); }
      const history = event.target.closest('[data-history-index]');
      if (history) this.searchFromHistory(this.getHistory()[Number(history.dataset.historyIndex)]);
      const remove = event.target.closest('[data-remove-history]');
      if (remove) this.removeFromHistory(Number(remove.dataset.removeHistory));
      if (event.target.closest('[data-clear-history]')) this.clearHistory();
    });
    const input = document.getElementById('global-search-input');
    input.addEventListener('input', event => this.onSearch(event.target.value));
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.addToHistory(input.value.trim());
        this.onSearch(input.value);
      }
    });
    this.renderHistory();
    this.loadDiscovery();
  },

  async loadDiscovery() {
    const layout = this.layout;
    const render = (id, html) => {
      if (!layout.isConnected) return;
      layout.querySelector(`#${id}`).innerHTML = html;
    };
    const now = new Date();
    await Promise.all([
      loadCollections().then(collections => render('search-collections', collections.length
        ? collections.slice(0, 2).map(renderCollectionCard).join('')
        : '<p class="search-section-status">No collections yet.</p>')).catch(error => {
        console.error('Search collections:', error);
        render('search-collections', '<p class="search-section-status">Could not load collections.</p>');
      }),
      (async () => {
        try {
          const { data, error } = await supabase.from('feed_gliims')
            .select('id, user_id, title, description, category, cover_url, created_at')
            .eq('status', 'approved').gte('created_at', new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString())
            .lte('created_at', now.toISOString()).order('created_at', { ascending: false }).order('id').limit(3);
          if (error) throw error;
          const posts = await this.withCreators(data);
          render('search-recent', posts.length ? posts.map(post => this.renderGliimCard(post, true)).join('')
            : '<p class="search-section-status">No posts in the last 3 hours.</p>');
        } catch (error) {
          console.error('Search recent posts:', error);
          render('search-recent', '<p class="search-section-status">Could not load recent posts.</p>');
        }
      })(),
      (async () => {
        try {
          const { data, error } = await supabase.from('profiles').select('id, full_name, avatar_url, total_gp, verification_badge')
            .order('total_gp', { ascending: false, nullsFirst: false }).order('id').limit(9);
          if (error) throw error;
          render('search-creators', data.length ? data.map(user => `<a class="search-creator" href="${this.profileHref(user.id)}">
            ${user.avatar_url ? `<img class="${tierClass(user.total_gp, 'search-creator-avatar')}" src="${escapeHtml(user.avatar_url)}" alt="" loading="lazy">` : ''}
            <span class="search-creator-name">${escapeHtml(user.full_name)}${badgeIcon(user.verification_badge)}</span>
            <span class="search-creator-gp">${Number(user.total_gp || 0).toLocaleString()} GP</span>
          </a>`).join('') : '<p class="search-section-status">No creators yet.</p>');
        } catch (error) {
          console.error('Search creators:', error);
          render('search-creators', '<p class="search-section-status">Could not load creators.</p>');
        }
      })()
    ]);
  },

  async withCreators(posts) {
    const userIds = [...new Set(posts.map(post => post.user_id).filter(Boolean))];
    if (!userIds.length) return posts;
    const { data, error } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', userIds);
    if (error) throw error;
    const creators = new Map(data.map(user => [user.id, user]));
    return posts.map(post => ({ ...post, creator: creators.get(post.user_id) }));
  },

  destroy() {
    this.disposed = true;
    this.requestId++;
    clearTimeout(this.searchTimer);
  },

  getHistory() {
    try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY)) || []; }
    catch { return []; }
  },

  addToHistory(query) {
    if (query.length < 2) return;
    const history = this.getHistory().filter(item => item.toLowerCase() !== query.toLowerCase());
    history.unshift(query);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  },

  removeFromHistory(index) {
    const history = this.getHistory();
    history.splice(index, 1);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
    this.renderHistory();
  },

  clearHistory() {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    this.renderHistory();
  },

  searchFromHistory(query) {
    const input = document.getElementById('global-search-input');
    input.value = query;
    this.addToHistory(query);
    this.onSearch(query);
  },

  renderHistory() {
    const container = document.getElementById('search-history');
    if (!container) return;
    const history = this.getHistory();
    container.innerHTML = history.length ? `
      <div class="search-history-header"><span>Recent searches</span><button type="button" data-clear-history>Clear all</button></div>
      <div class="search-history-list">${history.map((query, index) => `<div class="search-history-item">
        <button class="search-history-text" type="button" data-history-index="${index}">${escapeHtml(query)}</button>
        <button class="search-history-delete" type="button" data-remove-history="${index}" aria-label="Remove search">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>
        </button></div>`).join('')}</div>` : '';
  },

  onSearch(value) {
    this.query = value.trim();
    const requestId = ++this.requestId;
    clearTimeout(this.searchTimer);
    const searching = this.query.length >= 2;
    document.getElementById('search-discovery').hidden = searching;
    const container = document.getElementById('search-results');
    container.hidden = !searching;
    if (!searching) {
      container.innerHTML = '';
      this.renderHistory();
      return;
    }
    container.innerHTML = '<p class="search-section-status">Searching...</p>';
    this.searchTimer = setTimeout(() => this.performSearch(this.query, requestId), 200);
  },

  async performSearch(query, requestId) {
    try {
      const q = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
      const filter = q.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const [postsResult, collectionsResult, usersResult] = await Promise.all([
        supabase.from('feed_gliims').select('id, user_id, title, description, category, cover_url, created_at')
          .eq('status', 'approved').or(`title.ilike."${filter}",description.ilike."${filter}"`).limit(10),
        loadCollections(),
        supabase.from('profiles').select('id, full_name, avatar_url, total_gp, verification_badge').ilike('full_name', q).limit(10)
      ]);
      if (postsResult.error) throw postsResult.error;
      if (usersResult.error) throw usersResult.error;
      const gliims = await this.withCreators(postsResult.data);
      if (this.disposed || requestId !== this.requestId) return;
      this.results = {
        gliims,
        collections: collectionsResult.filter(collection => collection.tag.includes(query.toLowerCase().replace(/^#/, ''))).slice(0, 10),
        users: usersResult.data
      };
      this.renderResults();
    } catch (error) {
      if (this.disposed || requestId !== this.requestId) return;
      console.error('Search failed:', error);
      document.getElementById('search-results').innerHTML = '<p class="search-section-status">Could not load search results. Please try again.</p>';
    }
  },

  renderResults() {
    const { gliims, collections, users } = this.results;
    const total = gliims.length + collections.length + users.length;
    const container = document.getElementById('search-results');
    if (!total) {
      container.innerHTML = `<div class="search-empty">No results found for “${escapeHtml(this.query)}”</div>`;
      return;
    }
    container.innerHTML = `<div class="search-result-count">${total} results</div>
      ${collections.length ? `<div class="search-row search-collections-row">${collections.map(renderCollectionCard).join('')}</div>` : ''}
      ${users.map(user => `<a class="search-result-item" href="${this.profileHref(user.id)}">
        <div class="search-result-title">${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" class="search-result-avatar" alt="">` : ''}${escapeHtml(user.full_name)}${badgeIcon(user.verification_badge)}</div>
        <div class="search-result-desc">${Number(user.total_gp || 0).toLocaleString()} GP</div>
      </a>`).join('')}
      ${gliims.map(post => this.renderGliimCard(post)).join('')}`;
  },

  renderGliimCard(post, recent = false) {
    const creator = post.creator;
    return `<article class="${recent ? 'search-post-card' : 'search-result-item'}">
      <a href="#/post" data-post-id="${escapeHtml(post.id)}" class="search-post-link">
        ${recent && post.cover_url ? `<img class="search-post-cover" src="${escapeHtml(post.cover_url)}" alt="" loading="lazy">` : ''}
        <div class="search-result-title">${escapeHtml(post.title)}</div>
        ${!recent ? `<div class="search-result-desc">${escapeHtml(post.description)}</div>` : ''}
      </a>
      ${creator ? `<a class="search-post-creator" href="${this.profileHref(post.user_id)}">
        ${creator.avatar_url ? `<img src="${escapeHtml(creator.avatar_url)}" class="search-result-avatar" alt="" loading="lazy">` : ''}
        <span>${escapeHtml(creator.full_name)}</span>
      </a>` : ''}
    </article>`;
  },

  profileHref(id) {
    return id === store.user?.id ? '#/profile' : `#/profile?u=${encodeURIComponent(id)}`;
  },

  openGliim(id) {
    this.addToHistory(this.query);
    sessionStorage.setItem('openReadViewId', id);
    window.location.hash = '#/post';
  }
};
