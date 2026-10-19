import { supabase, API_BASE_URL } from '../config.js';
import { escapeHtml, timeAgo, badge, empty, avatar } from '../ui.js';
import { appConfirm } from '../dialog.js';

const deleteIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

export default {
  template: `
    <div id="submissions-list"><p class="loading">Loading gliims...</p></div>
  `,

  async init() {
    window.submissionsInstance = this;
    this.items = [];
    this.people = new Map();
    await this.load();
  },

  async load() {
    const { data: posts, error: postErr } = await supabase
      .rpc('admin_list_pending_posts', { p_status: 'all' });

    if (postErr) {
      console.error('Failed to load gliims:', postErr);
    }

    this.items = (posts && posts.posts ? posts.posts : []).map(p => ({ ...p, type: 'post' }));

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

  render() {
    const list = document.getElementById('submissions-list');
    const items = this.items;

    if (!items.length) {
      list.innerHTML = empty('Nothing here.');
      return;
    }

    list.innerHTML = `<div class="row-list">${items.map(item => {
      const person = this.people.get(item.user_id);
      const blocks = Array.isArray(item.blocks) ? item.blocks.length : 0;
      const parts = `${blocks} block${blocks === 1 ? '' : 's'}`;
      const safeTitle = (item.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

      return `
        <div class="card" style="position: relative;">
          <button class="delete-btn" onclick="window.submissionsInstance.confirmDelete('${item.id}', '${safeTitle}')" title="Delete permanently" aria-label="Delete">
            ${deleteIcon}
          </button>
          <div class="card-head" data-open="${item.id}" style="cursor: pointer;">
            ${avatar(person && person.avatar_url, this.submitterName(item.user_id))}
            <div style="min-width: 0;">
              <div class="card-title">${escapeHtml(item.title)}</div>
              <div class="card-sub">${escapeHtml(this.submitterName(item.user_id))} · ${timeAgo(item.created_at)} · ${parts}</div>
            </div>
            <div class="card-actions">
              ${badge('Gliim', 'neutral')}
            </div>
          </div>
          <div class="card-body">${escapeHtml((item.description || '').slice(0, 180))}${(item.description || '').length > 180 ? '…' : ''}</div>
        </div>`;
    }).join('')}</div>`;

    list.querySelectorAll('[data-open]').forEach((el) => {
      el.addEventListener('click', () => this.openDrawer(el.dataset.open));
    });
  },

  async confirmDelete(id, title) {
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
      alert('Item deleted successfully.');
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
          <button class="drawer-close" aria-label="Close">×</button>
        </div>
        <div class="drawer-body">
          ${item.cover_url ? `<img class="cover-preview" src="${escapeHtml(item.cover_url)}" alt="" style="margin-bottom: 18px;">` : ''}

          <dl class="kv" style="margin-bottom: 18px;">
            <dt>Posted by</dt><dd>${escapeHtml(this.submitterName(item.user_id))}${person && person.username ? ` <span class="muted">@${escapeHtml(person.username)}</span>` : ''}</dd>
            <dt>Posted</dt><dd>${escapeHtml(new Date(item.created_at).toLocaleString())}</dd>
          </dl>

          <div class="section-title">Description</div>
          <p class="card-body" style="margin-bottom: 18px;">${escapeHtml(item.description || '—')}</p>

          ${blocks.length ? `
            <div class="section-title">Blocks (${blocks.length})</div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${blocks.map(b => {
                const val = b && b.content != null ? String(b.content) : '';
                if (!val.trim()) return '';
                return `<div style="padding: 8px; background: var(--bg-secondary); border-radius: 6px; font-size: 13px;">
                  <span style="font-weight: 600; text-transform: capitalize;">${escapeHtml(b.type)}</span>: ${escapeHtml(val.slice(0, 120))}${val.length > 120 ? '…' : ''}
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
