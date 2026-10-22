import { supabase } from '/shared/js/config.js';
import { store, tierClass } from '../store.js';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default {
  title: 'Search',
  template: `
    <div class="search-layout">
      <div class="search-hero">
        <div class="search-hero-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </div>
        <input type="text" id="global-search-input" class="search-hero-input" placeholder="Search gliims, collections, users..." autocomplete="off">
      </div>

      <div class="search-results" id="search-results">
        <div class="search-empty">
          <p>Start typing to search across everything</p>
        </div>
      </div>
    </div>
  `,

  init() {
    this.query = '';
    this.results = {
      gliims: [],
      collections: [],
      users: []
    };

    const input = document.getElementById('global-search-input');
    if (input) {
      input.addEventListener('input', (e) => this.onSearch(e.target.value));
      input.focus();
    }

    window.searchInstance = {
      openGliim: (id) => this.openGliim(id),
      openCollection: (name) => this.openCollection(name),
      openProfile: (id) => this.openProfile(id)
    };
  },

  async onSearch(value) {
    this.query = value.trim().toLowerCase();
    
    if (this.query.length < 2) {
      this.renderEmpty();
      return;
    }

    await this.performSearch();
    this.renderResults();
  },

  async performSearch() {
    const q = `%${this.query}%`;

    const [gliimsRes, collectionsRes, usersRes] = await Promise.all([
      supabase
        .from('feed_gliims')
        .select('id, title, description, category, cover_url, cover_color, status')
        .eq('status', 'approved')
        .or(`title.ilike.${q},description.ilike.${q}`)
        .limit(10),
      supabase
        .from('post_hashtags')
        .select('hashtag')
        .ilike('hashtag', this.query + '%')
        .limit(10),
      supabase
        .from('profiles')
        .select('id, full_name, avatar_url, total_gp')
        .ilike('full_name', q)
        .limit(10)
    ]);

    this.results.gliims = gliimsRes.data || [];
    this.results.collections = (collectionsRes.data || []).map(r => r.hashtag);
    this.results.users = usersRes.data || [];
  },

  renderEmpty() {
    const container = document.getElementById('search-results');
    if (!container) return;
    container.innerHTML = `
      <div class="search-empty">
        <p>Start typing to search across everything</p>
      </div>
    `;
  },

  renderResults() {
    const container = document.getElementById('search-results');
    if (!container) return;

    const { gliims, collections, users } = this.results;
    const hasResults = gliims.length || collections.length || users.length;

    if (!hasResults) {
      container.innerHTML = `
        <div class="search-empty">
          <p>No results found for "${escapeHtml(this.query)}"</p>
        </div>
      `;
      return;
    }

    let html = '';

    if (collections.length) {
      html += `
        <div class="search-section">
          <h3 class="search-section-title">Collections</h3>
          <div class="search-section-grid">
            ${collections.map(name => `
              <div class="search-collection-card" onclick="searchInstance.openCollection('${escapeHtml(name)}')">
                <span class="search-collection-tag">#${escapeHtml(name)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (users.length) {
      html += `
        <div class="search-section">
          <h3 class="search-section-title">Users</h3>
          <div class="search-section-list">
            ${users.map(u => {
              const avatarClass = tierClass(u.total_gp, 'blog-avatar');
              const avatar = u.avatar_url
                ? `<img src="${escapeHtml(u.avatar_url)}" class="${avatarClass}" style="object-fit:cover;">`
                : `<div class="${avatarClass}"></div>`;
              return `
                <div class="search-user-item" onclick="searchInstance.openProfile('${u.id}')">
                  ${avatar}
                  <span class="search-user-name">${escapeHtml(u.full_name || 'Gliimait')}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    if (gliims.length) {
      html += `
        <div class="search-section">
          <h3 class="search-section-title">Gliims</h3>
          <div class="search-section-grid">
            ${gliims.map(g => this.renderGliimCard(g)).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  },

  renderGliimCard(gliim) {
    const coverStyle = gliim.cover_url
      ? `background-image: url('${escapeHtml(gliim.cover_url)}')`
      : `background: ${gliim.cover_color || 'var(--bg-tertiary)'}`;

    return `
      <div class="search-gliim-card" onclick="searchInstance.openGliim('${gliim.id}')">
        <div class="search-gliim-cover" style="${coverStyle}"></div>
        <div class="search-gliim-content">
          <span class="blog-category">${escapeHtml(gliim.category || 'General')}</span>
          <h4 class="search-gliim-title">${escapeHtml(gliim.title || 'Untitled')}</h4>
        </div>
      </div>
    `;
  },

  openGliim(id) {
    sessionStorage.setItem('openReadViewId', id);
    window.location.hash = '#/post';
  },

  openCollection(name) {
    window.location.hash = `#/collection?name=${encodeURIComponent(name)}`;
  },

  openProfile(id) {
    sessionStorage.setItem('view_profile_id', id);
    window.location.hash = '#/profile';
  }
};
