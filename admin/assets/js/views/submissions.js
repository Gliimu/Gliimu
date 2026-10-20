import { supabase, API_BASE_URL } from '../config.js';
import { escapeHtml, timeAgo, badge, empty, avatar } from '../ui.js';
import { appConfirm } from '../dialog.js';

const deleteIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
const moreIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>`;
const msgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
const trashIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

export default {
  template: `
    <div class="submissions-toolbar">
      <div class="submissions-search">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" id="submissions-search-input" placeholder="Search gliims by title, author, description...">
      </div>
    </div>
    <div id="submissions-list"><p class="loading">Loading gliims...</p></div>
  `,

  async init() {
    window.submissionsInstance = this;
    this.items = [];
    this.people = new Map();
    this.searchQuery = '';
    await this.load();
    this._wireSearch();
  },

  _wireSearch() {
    const input = document.getElementById('submissions-search-input');
    if (!input) return;
    input.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.render();
    });
  },

  async load() {
    const { data: posts, error: postErr } = await supabase
      .rpc('admin_list_pending_posts', { p_status: 'all' });

    if (postErr) {
      console.error('Failed to load gliims:', postErr);
    }

    this.items = (posts && posts.posts ? posts.posts : [])
      .filter(p => p.status !== 'draft')
      .map(p => ({ ...p, type: 'post' }));

    const ids = [...new Set(this.items.map(i => i.user_id).filter(Boolean))];
    if (ids.length) {
      const { data: profiles } = await supabase.rpc('admin_member_lookup', { p_ids: ids });
      this.people = new Map((profiles || []).map(p => [p.id, p]));
    }

    this.render();
  },

  submitterName(userId) {
    const p = this.people.get(userId);
    if (!p) return 'Unknown member';
    return p.full_name || p.username || 'Unknown member';
  },

  _filteredItems() {
    if (!this.searchQuery) return this.items;
    return this.items.filter(item => {
      const name = this.submitterName(item.user_id).toLowerCase();
      const title = (item.title || '').toLowerCase();
      const desc = (item.description || '').toLowerCase();
      return title.includes(this.searchQuery) || name.includes(this.searchQuery) || desc.includes(this.searchQuery);
    });
  },

  render() {
    const list = document.getElementById('submissions-list');
    const items = this._filteredItems();

    if (!items.length) {
      list.innerHTML = empty(this.searchQuery ? 'No gliims match your search.' : 'Nothing here.');
      return;
    }

    list.innerHTML = `<div class="submissions-grid">${items.map(item => {
      const person = this.people.get(item.user_id);
      const blocks = Array.isArray(item.blocks) ? item.blocks.length : 0;
      const parts = `${blocks} block${blocks === 1 ? '' : 's'}`;
      const safeTitle = (item.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

      return `
        <div class="sub-card" id="sub-card-${item.id}">
          ${item.cover_url ? `<div class="sub-card-cover" style="background-image:url('${escapeHtml(item.cover_url)}')"></div>` : ''}
          <div class="sub-card-body">
            <div class="sub-card-head">
              <div class="sub-card-title">${escapeHtml(item.title)}</div>
              <div class="sub-card-menu-wrap">
                <button class="sub-card-menu-btn" onclick="window.submissionsInstance.toggleMenu('${item.id}')" aria-label="Actions">${moreIcon}</button>
                <div class="sub-card-menu" id="sub-menu-${item.id}">
                  <div class="sub-card-menu-item" onclick="window.submissionsInstance.messageCreator('${item.user_id}')">${msgIcon}<span>Message creator</span></div>
                  <div class="sub-card-menu-item danger" onclick="window.submissionsInstance.confirmDelete('${item.id}', '${safeTitle}')">${trashIcon}<span>Delete</span></div>
                </div>
              </div>
            </div>
            <div class="sub-card-meta">
              <div class="sub-card-author" onclick="window.submissionsInstance.viewAuthor('${item.user_id}')">
                ${avatar(person && person.avatar_url, this.submitterName(item.user_id))}
                <span>${escapeHtml(this.submitterName(item.user_id))}</span>
              </div>
              <div class="sub-card-info">${timeAgo(item.created_at)} · ${parts}</div>
            </div>
            <div class="sub-card-desc">${escapeHtml((item.description || '').slice(0, 120))}${(item.description || '').length > 120 ? '...' : ''}</div>
          </div>
        </div>`;
    }).join('')}</div>`;

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.sub-card-menu-wrap')) {
        document.querySelectorAll('.sub-card-menu.active').forEach(m => m.classList.remove('active'));
      }
    });
  },

  toggleMenu(id) {
    const menu = document.getElementById(`sub-menu-${id}`);
    if (!menu) return;
    const wasActive = menu.classList.contains('active');
    document.querySelectorAll('.sub-card-menu.active').forEach(m => m.classList.remove('active'));
    if (!wasActive) menu.classList.add('active');
  },

  messageCreator(userId) {
    document.querySelectorAll('.sub-card-menu.active').forEach(m => m.classList.remove('active'));
    if (!userId) return alert('No author found for this post.');
    window.location.hash = '#/support';
  },

  viewAuthor(userId) {
    if (!userId) return;
    window.location.hash = '#/support';
  },

  async confirmDelete(id, title) {
    document.querySelectorAll('.sub-card-menu.active').forEach(m => m.classList.remove('active'));
    const ok = await appConfirm(`Delete "${title}" permanently? This cannot be undone.`, {
      okText: 'Delete', title: 'Confirm deletion?', danger: true
    });
    if (!ok) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return alert('Session expired. Please sign in again.');

    try {
      const res = await fetch(`${API_BASE_URL}/api/content/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const result = await res.json();
      if (!res.ok || !result.deleted) {
        return alert('Deletion failed: ' + (result.error || 'Unknown error'));
      }
      this.load();
      window.adminApp?.refreshCounts();
    } catch (err) {
      alert('Deletion failed: ' + err.message);
    }
  },

  openDrawer(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    document.querySelector('.drawer-overlay')?.remove();

    const person = this.people.get(item.user_id);
    const blocks = Array.isArray(item.blocks) ? item.blocks : [];

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = `
      <div class="drawer">
        <div class="drawer-head">
          <div style="min-width: 0;">
            <h2>${escapeHtml(item.title)}</h2>
            <div class="card-sub">${badge('Gliim', 'neutral')}</div>
          </div>
          <button class="drawer-close" aria-label="Close">\u00d7</button>
        </div>
        <div class="drawer-body">
          ${item.cover_url ? `<img class="cover-preview" src="${escapeHtml(item.cover_url)}" alt="" style="margin-bottom: 18px;">` : ''}

          <dl class="kv" style="margin-bottom: 18px;">
            <dt>Posted by</dt><dd>${escapeHtml(this.submitterName(item.user_id))}${person && person.username ? ` <span class="muted">@${escapeHtml(person.username)}</span>` : ''}</dd>
            <dt>Posted</dt><dd>${escapeHtml(new Date(item.created_at).toLocaleString())}</dd>
          </dl>

          <div class="section-title">Description</div>
          <p class="card-body" style="margin-bottom: 18px;">${escapeHtml(item.description || '\u2014')}</p>

          ${blocks.length ? `
            <div class="section-title">Blocks (${blocks.length})</div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${blocks.map(b => {
                const val = b && b.content != null ? String(b.content) : '';
                if (!val.trim()) return '';
                return `<div style="padding: 8px; background: var(--bg-secondary); border-radius: 6px; font-size: 13px;">
                  <span style="font-weight: 600; text-transform: capitalize;">${escapeHtml(b.type)}</span>: ${escapeHtml(val.slice(0, 120))}${val.length > 120 ? '\u2026' : ''}
                </div>`;
              }).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.drawer-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }
};
