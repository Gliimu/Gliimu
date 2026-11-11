import { supabase } from '../config.js';
import { escapeHtml, timeAgo, badge, empty, avatar, rpcError } from '../ui.js?v=2';
import { appConfirm, appAlert } from '../dialog.js';

const moreIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>`;
const msgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
const takedownIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

export default {
  template: `
    <div class="submissions-toolbar">
      <div class="submissions-search">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" id="submissions-search-input" placeholder="Search gliims by title, author, description...">
      </div>
      <select id="submissions-status-filter" class="btn" style="padding: 8px 10px;">
        <option value="all">All gliims</option>
        <option value="approved">Live</option>
        <option value="rejected">Taken down</option>
      </select>
    </div>
    <div id="submissions-list"><p class="loading">Loading gliims...</p></div>
  `,

  async init() {
    window.submissionsInstance = this;
    this.items = [];
    this.people = new Map();
    this.searchQuery = '';
    this.statusFilter = 'all';
    await this.load();
    this._wireSearch();
  },

  _wireSearch() {
    const input = document.getElementById('submissions-search-input');
    if (input) {
      input.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.render();
      });
    }
    const select = document.getElementById('submissions-status-filter');
    if (select) {
      select.addEventListener('change', (e) => {
        this.statusFilter = e.target.value;
        this.render();
      });
    }
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
    let items = this.items;
    if (this.statusFilter !== 'all') {
      items = items.filter(item => item.status === this.statusFilter);
    }
    if (!this.searchQuery) return items;
    return items.filter(item => {
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
      const takenDown = item.status === 'rejected';

      return `
        <div class="sub-card" id="sub-card-${item.id}" onclick="window.submissionsInstance.openDrawer('${item.id}')" style="cursor: pointer;">
          ${item.cover_url ? `<div class="sub-card-cover" style="background-image:url('${escapeHtml(item.cover_url)}')"></div>` : ''}
          <div class="sub-card-body">
            <div class="sub-card-head">
              <div class="sub-card-title">${escapeHtml(item.title)}</div>
              <div class="sub-card-menu-wrap" onclick="event.stopPropagation()">
                <button class="sub-card-menu-btn" onclick="window.submissionsInstance.toggleMenu('${item.id}')" aria-label="Actions">${moreIcon}</button>
                <div class="sub-card-menu" id="sub-menu-${item.id}">
                  <div class="sub-card-menu-item" onclick="window.submissionsInstance.messageCreator('${item.user_id}')">${msgIcon}<span>Message creator</span></div>
                  <div class="sub-card-menu-item${takenDown ? '' : ' danger'}" onclick="window.submissionsInstance.menuReview('${item.id}')">${takedownIcon}<span>${takenDown ? 'Put back online' : 'Take down'}</span></div>
                </div>
              </div>
            </div>
            <div class="sub-card-meta">
              <div class="sub-card-author" onclick="event.stopPropagation(); window.submissionsInstance.viewAuthor('${item.user_id}')">
                ${avatar(person && person.avatar_url, this.submitterName(item.user_id))}
                <span>${escapeHtml(this.submitterName(item.user_id))}</span>
              </div>
              <div class="sub-card-info">${item.status === 'rejected' ? badge('Taken down', 'error') : badge('Live', 'success')} · ${timeAgo(item.created_at)} · ${parts}</div>
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
    window.adminGo('/support');
  },

  viewAuthor(userId) {
    if (!userId) return;
    window.adminGo('/support');
  },

  // Deleting for real belongs to Operations → Site Content → Deleted, so the
  // CRM menu only ever hides a gliim from members.
  menuReview(id) {
    document.querySelectorAll('.sub-card-menu.active').forEach(m => m.classList.remove('active'));
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (item.status === 'rejected') this.restorePost(item);
    else this.openTakedownModal(item);
  },

  openDrawer(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    document.querySelector('.drawer-overlay')?.remove();

    const person = this.people.get(item.user_id);
    const blocks = Array.isArray(item.blocks) ? item.blocks : [];
    const takenDown = item.status === 'rejected';

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = `
      <div class="drawer">
        <div class="drawer-head">
          <div style="min-width: 0;">
            <h2>${escapeHtml(item.title)}</h2>
            <div class="card-sub">${badge('Gliim', 'neutral')}${takenDown ? badge('Taken down', 'error') : badge('Live', 'success')}</div>
          </div>
          <button class="drawer-close" aria-label="Close">\u00d7</button>
        </div>
        <div class="drawer-body">
          ${item.cover_url ? `<img class="cover-preview" src="${escapeHtml(item.cover_url)}" alt="" style="margin-bottom: 18px;">` : ''}

          <dl class="kv" style="margin-bottom: 18px;">
            <dt>Posted by</dt><dd>${escapeHtml(this.submitterName(item.user_id))}${person && person.username ? ` <span class="muted">@${escapeHtml(person.username)}</span>` : ''}</dd>
            <dt>Posted</dt><dd>${escapeHtml(new Date(item.created_at).toLocaleString())}</dd>
            ${takenDown ? `<dt>Reason</dt><dd>${escapeHtml(item.review_note || '\u2014')}${item.reviewed_at ? ` <span class="muted">(${escapeHtml(new Date(item.reviewed_at).toLocaleString())})</span>` : ''}</dd>` : ''}
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

          <div style="display: flex; gap: 12px; margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--border-color);">
            <button class="btn ${takenDown ? 'btn-primary' : 'btn-danger'}" id="review-btn-${item.id}" style="flex: 1;">${takenDown ? 'Put back online' : 'Take down'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.drawer-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector(`#review-btn-${item.id}`).addEventListener('click', () => {
      if (takenDown) {
        close();
        this.restorePost(item);
      } else {
        close();
        this.openTakedownModal(item);
      }
    });
  },

  openTakedownModal(item) {
    document.querySelector('.takedown-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'takedown-overlay';
    overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10001;';
    overlay.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 12px; padding: 24px; max-width: 460px; width: 90%;">
        <h3 style="margin: 0 0 8px 0;">Take down this gliim?</h3>
        <p style="color: var(--text-muted); font-size: 13px; margin: 0 0 16px 0;">It stops appearing in XpLoRe, Search and the reader right away. The member is told why, and can see it in their own library until you put it back online.</p>
        <textarea id="takedown-reason" placeholder="Reason shown to the member (required)..." style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; font-family: inherit; font-size: 13px; resize: vertical; min-height: 80px; margin-bottom: 16px;"></textarea>
        <div style="display: flex; gap: 10px;">
          <button id="takedown-confirm" class="btn btn-danger" style="flex: 1;" disabled>Take down</button>
          <button id="takedown-cancel" class="btn" style="padding: 10px 16px;">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const reason = overlay.querySelector('#takedown-reason');
    const confirmBtn = overlay.querySelector('#takedown-confirm');
    reason.focus();
    reason.addEventListener('input', () => {
      confirmBtn.disabled = reason.value.trim() === '';
    });
    overlay.querySelector('#takedown-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      const result = await this.moderate(item.id, 'reject', reason.value.trim());
      if (result.ok) {
        overlay.remove();
        document.querySelector('.drawer-overlay')?.remove();
        this.load();
      } else {
        confirmBtn.disabled = false;
      }
    });
  },

  async restorePost(item) {
    const ok = await appConfirm(`Put "${item.title}" back online? The member is told it is live again.`, {
      okText: 'Put back online', title: 'Restore this gliim?'
    });
    if (!ok) return;
    const result = await this.moderate(item.id, 'approve', null);
    if (result.ok) {
      document.querySelector('.drawer-overlay')?.remove();
      this.load();
    }
  },

  async moderate(postId, action, note) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      await appAlert('Session expired. Please sign in again.');
      return { ok: false };
    }

    try {
      const { data, error } = await supabase.rpc('admin_review_post', {
        p_post: postId,
        p_action: action,
        p_note: note
      });
      if (error) {
        await appAlert('That did not work: ' + error.message);
        return { ok: false };
      }
      if (!data || !data.ok) {
        await appAlert(rpcError(data, 'That did not work. Please try again.'));
        return { ok: false };
      }
      return { ok: true };
    } catch (err) {
      await appAlert('That did not work: ' + err.message);
      return { ok: false };
    }
  },
};
