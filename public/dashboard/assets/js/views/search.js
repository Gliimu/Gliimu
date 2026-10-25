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
          <img src="/icons/logo.png" alt="Gliimu">
          <span>Ideas that inspire</span>
        </div>
        <div class="search-bar-wrap">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="global-search-input" class="search-hero-input" placeholder="Search gliims, collections, users..." autocomplete="off">
          <button class="search-go-btn" id="search-go-btn" aria-label="Search">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
        </div>
      </div>

      <div class="search-collections" id="search-collections"></div>

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
    this.loadCollections();
  },

  async loadCollections() {
    const { data: rows } = await supabase
      .from('post_hashtags')
      .select('hashtag, post_id');

    if (!rows || !rows.length) return;

    const postIds = [...new Set(rows.map(r => r.post_id))];
    const { data: posts } = await supabase
      .from('feed_gliims')
      .select('id, user_id, cover_url')
      .in('id', postIds);

    const postMap = {};
    (posts || []).forEach(p => { postMap[p.id] = p; });

    const userIds = [...new Set((posts || []).map(p => p.user_id).filter(Boolean))];
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id, avatar_url').in('id', userIds)
      : { data: [] };

    const avatarMap = {};
    (profiles || []).forEach(p => { avatarMap[p.id] = p.avatar_url; });

    const counts = {};
    const contributors = {};
    const previews = {};
    rows.forEach(r => {
      const tag = (r.hashtag || '').toLowerCase();
      if (!tag) return;
      counts[tag] = (counts[tag] || 0) + 1;
      const post = postMap[r.post_id];
      if (!post) return;
      const userId = post.user_id;
      if (userId) {
        if (!contributors[tag]) contributors[tag] = {};
        contributors[tag][userId] = (contributors[tag][userId] || 0) + 1;
      }
      if (post.cover_url) {
        if (!previews[tag]) previews[tag] = [];
        if (previews[tag].length < 3) previews[tag].push(post.cover_url);
      }
    });

    this._collectionsData = Object.keys(counts)
      .sort((a, b) => counts[b] - counts[a])
      .slice(0, 12)
      .map(t => {
        const contribMap = contributors[t] || {};
        const topContribs = Object.entries(contribMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([uid]) => ({ user_id: uid, avatar_url: avatarMap[uid] }));
        return { tag: t, count: counts[t], contribs: topContribs, previews: previews[t] || [] };
      });

    this.renderCollections();
  },

  renderCollections() {
    const el = document.getElementById('search-collections');
    if (!el || !this._collectionsData || !this._collectionsData.length) return;

    el.innerHTML = `
      <div class="search-collections-header">
        <span class="search-collections-title">Browse Collections</span>
      </div>
      <div class="collections-grid">
        ${this._collectionsData.map(c => {
          const previewHtml = c.previews.length
            ? `<div class="collection-tag-previews">${c.previews.map(url => `<img src="${url}" alt="" class="collection-tag-preview-img">`).join('')}</div>`
            : `<div class="collection-tag-previews collection-tag-previews-empty"></div>`;
          const avatarsHtml = c.contribs.length
            ? `<div class="collection-tag-avatars">${c.contribs.map(a => a.avatar_url ? `<img src="${a.avatar_url}" alt="" class="collection-tag-avatar">` : `<div class="collection-tag-avatar collection-tag-avatar-fallback"></div>`).join('')}</div>`
            : '';
          return `<div class="collection-tag-card" onclick="searchInstance.openCollection('${encodeURIComponent(c.tag)}')">
            ${previewHtml}
            <div class="collection-tag-info">
              <span class="collection-tag-name">#${escapeHtml(c.tag)}</span>
              <span class="collection-tag-count">${c.count} ${c.count === 1 ? 'gliim' : 'gliims'}</span>
              ${avatarsHtml}
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
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
    const collEl = document.getElementById('search-collections');
    if (this.query.length < 2) {
      if (collEl) collEl.style.display = '';
      this.renderHistory();
      this.renderEmpty();
      return;
    }
    if (collEl) collEl.style.display = 'none';
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
    const total = gliims.length + collections.length + users.length;
    if (!total) {
      container.innerHTML = `<div class="search-empty"><p>No results found for "${escapeHtml(this.query)}"</p></div>`;
      return;
    }
    let html = `<div class="search-result-count">About ${total} results</div>`;
    if (collections.length) {
      html += collections.map(name => `<div class="search-result-item" onclick="searchInstance.openCollection('${escapeHtml(name)}')">
        <div class="search-result-url">gliimu.com/collection</div>
        <div class="search-result-title">#${escapeHtml(name)}</div>
        <div class="search-result-desc">Browse all gliims tagged with #${escapeHtml(name)}</div>
      </div>`).join('');
    }
    if (users.length) {
      html += users.map(u => {
        const av = u.avatar_url ? `<img src="${escapeHtml(u.avatar_url)}" class="search-result-avatar" alt="">` : `<div class="search-result-avatar search-result-avatar-empty"></div>`;
        return `<div class="search-result-item" onclick="searchInstance.openProfile('${u.id}')">
          <div class="search-result-url">gliimu.com/profile</div>
          <div class="search-result-title">${av}${escapeHtml(u.full_name || 'Gliimait')}</div>
          <div class="search-result-desc">${u.total_gp ? u.total_gp.toLocaleString() + ' GP' : 'Gliimait member'}</div>
        </div>`;
      }).join('');
    }
    if (gliims.length) {
      html += gliims.map(g => this.renderGliimCard(g)).join('');
    }
    container.innerHTML = html;
  },

  renderGliimCard(gliim) {
    const desc = gliim.description || '';
    const cat = gliim.category || 'General';
    return `<div class="search-result-item" onclick="searchInstance.openGliim('${gliim.id}')">
      <div class="search-result-url">gliimu.com/gliim/${escapeHtml(cat.toLowerCase())}</div>
      <div class="search-result-title">${escapeHtml(gliim.title || 'Untitled')}</div>
      <div class="search-result-desc">${escapeHtml(desc)}</div>
    </div>`;
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
    window.location.hash = id === store.user.id ? '#/profile' : `#/profile?u=${id}`;
  }
};
