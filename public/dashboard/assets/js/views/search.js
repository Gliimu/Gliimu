import { supabase } from '/shared/js/config.js';
import { store, tierClass } from '../store.js';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SEARCH_HISTORY_KEY = 'gliimu_search_history';
const MAX_HISTORY = 10;

export default {
  title: 'Search',
  template: `
    <div class="search-layout">
      <div class="search-hero">
        <div class="search-hero-brand">
          <img src="/icons/icon.png" alt="Gliimu">
          <span>Gliimu Search</span>
        </div>
        <div class="search-bar-wrap">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="global-search-input" class="search-hero-input" placeholder="Search gliims, collections, users..." autocomplete="off">
          <button class="search-go-btn" id="search-go-btn" aria-label="Search">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
        </div>
      </div>

      <div class="search-history" id="search-history"></div>

      <div class="search-results" id="search-results">
        <div class="search-empty">
          <p>Start typing to search across everything</p>
        </div>
      </div>
    </div>
  `,

  init() {
    this.query = '';
    this.results = { gliims: [], collections: [], users: [] };

    const savedScroll = sessionStorage.getItem('gliimu_search_scroll');
    if (savedScroll) {
      requestAnimationFrame(() => window.scrollTo(0, parseInt(savedScroll, 10)));
    }

    const input = document.getElementById('global-search-input');
    if (input) {
      input.addEventListener('input', (e) => this.onSearch(e.target.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = e.target.value.trim();
          if (val.length >= 2) {
            this.addToHistory(val);
            this.onSearch(val);
          }
        }
      });
      input.addEventListener('focus', () => this.renderHistory());
      input.focus();
    }

    const goBtn = document.getElementById('search-go-btn');
    if (goBtn) {
      goBtn.addEventListener('click', () => {
        const val = input ? input.value.trim() : '';
        if (val.length >= 2) {
          this.addToHistory(val);
          this.onSearch(val);
        }
      });
    }

    window.addEventListener('scroll', () => {
      if (window.location.hash === '#/search') {
        sessionStorage.setItem('gliimu_search_scroll', String(window.scrollY));
      }
    });

    window.searchInstance = {
      openGliim: (id) => this.openGliim(id),
      openCollection: (name) => this.openCollection(name),
      openProfile: (id) => this.openProfile(id),
      searchFromHistory: (q) => this.searchFromHistory(q),
      removeFromHistory: (i) => this.removeFromHistory(i),
      clearHistory: () => this.clearHistory()
    };

    this.renderHistory();
  },

  destroy() {
    sessionStorage.removeItem('gliimu_search_scroll');
  },

  getHistory() {
    try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY)) || []; }
    catch { return []; }
  },

  addToHistory(query) {
    let history = this.getHistory();
    history = history.filter(h => h.toLowerCase() !== query.toLowerCase());
    history.unshift(query);
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
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
    if (input) input.value = query;
    this.addToHistory(query);
    this.onSearch(query);
  },

  renderHistory() {
    const container = document.getElementById('search-history');
    if (!container) return;
    const history = this.getHistory();
    const input = document.getElementById('global-search-input');
    if (!history.length || (input && input.value.trim().length >= 2)) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = `
      <div class="search-history-header">
        <span class="search-history-title">Recent searches</span>
        <button class="search-history-clear" onclick="searchInstance.clearHistory()">Clear all</button>
      </div>
      <div class="search-history-list">
        ${history.map((h, i) => `
          <div class="search-history-item">
            <svg class="search-history-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span class="search-history-text" onclick="searchInstance.searchFromHistory('${escapeHtml(h)}')">${escapeHtml(h)}</span>
            <button class="search-history-delete" onclick="event.stopPropagation(); searchInstance.removeFromHistory(${i})">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        `).join('')}
      </div>
    `;
  },

  async onSearch(value) {
    this.query = value.trim().toLowerCase();
    if (this.query.length < 2) {
      this.renderHistory();
      this.renderEmpty();
      return;
    }
    const hist = document.getElementById('search-history');
    if (hist) hist.innerHTML = '';
    await this.performSearch();
    this.renderResults();
  },

  async performSearch() {
    const q = `%${this.query}%`;
    const [gliimsRes, collectionsRes, usersRes] = await Promise.all([
      supabase.from('feed_gliims').select('id, title, description, category, cover_url, cover_color, status')
        .eq('status', 'approved').or(`title.ilike.${q},description.ilike.${q}`).limit(10),
      supabase.from('post_hashtags').select('hashtag').ilike('hashtag', this.query + '%').limit(10),
      supabase.from('profiles').select('id, full_name, avatar_url, total_gp').ilike('full_name', q).limit(10)
    ]);
    this.results.gliims = gliimsRes.data || [];
    this.results.collections = (collectionsRes.data || []).map(r => r.hashtag);
    this.results.users = usersRes.data || [];
  },

  renderEmpty() {
    const container = document.getElementById('search-results');
    if (!container) return;
    container.innerHTML = `<div class="search-empty"><p>Start typing to search across everything</p></div>`;
  },

  renderResults() {
    const container = document.getElementById('search-results');
    if (!container) return;
    const { gliims, collections, users } = this.results;
    const hasResults = gliims.length || collections.length || users.length;
    if (!hasResults) {
      container.innerHTML = `<div class="search-empty"><p>No results found for "${escapeHtml(this.query)}"</p></div>`;
      return;
    }
    let html = '';
    if (collections.length) {
      html += `<div class="search-section"><h3 class="search-section-title">Collections</h3><div class="search-section-grid">
        ${collections.map(name => `<div class="search-collection-card" onclick="searchInstance.openCollection('${escapeHtml(name)}')">
          <span class="search-collection-tag">#${escapeHtml(name)}</span></div>`).join('')}</div></div>`;
    }
    if (users.length) {
      html += `<div class="search-section"><h3 class="search-section-title">Users</h3><div class="search-section-list">
        ${users.map(u => {
          const ac = tierClass(u.total_gp, 'blog-avatar');
          const av = u.avatar_url ? `<img src="${escapeHtml(u.avatar_url)}" class="${ac}" style="object-fit:cover;">` : `<div class="${ac}"></div>`;
          return `<div class="search-user-item" onclick="searchInstance.openProfile('${u.id}')">${av}<span class="search-user-name">${escapeHtml(u.full_name || 'Gliimait')}</span></div>`;
        }).join('')}</div></div>`;
    }
    if (gliims.length) {
      html += `<div class="search-section"><h3 class="search-section-title">Gliims</h3><div class="search-section-grid">
        ${gliims.map(g => this.renderGliimCard(g)).join('')}</div></div>`;
    }
    container.innerHTML = html;
  },

  renderGliimCard(gliim) {
    const coverStyle = gliim.cover_url
      ? `background-image: url('${escapeHtml(gliim.cover_url)}')`
      : `background: ${gliim.cover_color || 'var(--bg-tertiary)'}`;
    return `<div class="search-gliim-card" onclick="searchInstance.openGliim('${gliim.id}')">
      <div class="search-gliim-cover" style="${coverStyle}"></div>
      <div class="search-gliim-content"><span class="blog-category">${escapeHtml(gliim.category || 'General')}</span>
      <h4 class="search-gliim-title">${escapeHtml(gliim.title || 'Untitled')}</h4></div></div>`;
  },

  openGliim(id) {
    this.addToHistory(this.query || '');
    sessionStorage.setItem('openReadViewId', id);
    window.location.hash = '#/post';
  },

  openCollection(name) {
    this.addToHistory(name);
    window.location.hash = `#/collection?name=${encodeURIComponent(name)}`;
  },

  openProfile(id) {
    this.addToHistory(this.query || '');
    sessionStorage.setItem('view_profile_id', id);
    window.location.hash = '#/profile';
  }
};
