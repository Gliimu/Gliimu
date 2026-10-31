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
        <div class="sub-card" id="sub-card-${item.id}" onclick="window.submissionsInstance.openDrawer('${item.id}')" style="cursor: pointer;">
          ${item.cover_url ? `<div class="sub-card-cover" style="background-image:url('${escapeHtml(item.cover_url)}')"></div>` : ''}
          <div class="sub-card-body">
            <div class="sub-card-head">
              <div class="sub-card-title">${escapeHtml(item.title)}</div>
              <div class="sub-card-menu-wrap" onclick="event.stopPropagation()">
                <button class="sub-card-menu-btn" onclick="window.submissionsInstance.toggleMenu('${item.id}')" aria-label="Actions">${moreIcon}</button>
                <div class="sub-card-menu" id="sub-menu-${item.id}">
                  <div class="sub-card-menu-item" onclick="window.submissionsInstance.messageCreator('${item.user_id}')">${msgIcon}<span>Message creator</span></div>
                  <div class="sub-card-menu-item danger" onclick="window.submissionsInstance.confirmDelete('${item.id}', '${safeTitle}')">${trashIcon}<span>Delete</span></div>
                </div>
              </div>
            </div>
            <div class="sub-card-meta">
              <div class="sub-card-author" onclick="event.stopPropagation(); window.submissionsInstance.viewAuthor('${item.user_id}')">
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

          <div style="display: flex; gap: 12px; margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--border-color);">
            <button class="btn btn-primary" id="review-btn-${item.id}" style="flex: 1;">Review & Decide</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.drawer-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector(`#review-btn-${item.id}`).addEventListener('click', () => {
      this.openReviewRubric(item);
    });
  },

  openReviewRubric(item) {
    document.querySelector('.rubric-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'rubric-overlay';
    overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    overlay.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
        <h3 style="margin: 0 0 8px 0;">Content Review Rubric</h3>
        <p style="color: var(--text-muted); font-size: 13px; margin: 0 0 20px 0;">Evaluate this submission against Gliimu's quality criteria</p>

        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
          <label style="display: flex; gap: 10px; align-items: flex-start; padding: 12px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer;">
            <input type="checkbox" class="rubric-check" data-criteria="what_if_how_to" style="margin-top: 2px;">
            <div>
              <div style="font-weight: 600; font-size: 14px;">Answers "What if" or "How to"</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Does this content provide practical guidance or explore possibilities?</div>
            </div>
          </label>

          <label style="display: flex; gap: 10px; align-items: flex-start; padding: 12px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer;">
            <input type="checkbox" class="rubric-check" data-criteria="inspiring_educational" style="margin-top: 2px;">
            <div>
              <div style="font-weight: 600; font-size: 14px;">Inspiring or Educational</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Does it motivate readers or teach valuable skills?</div>
            </div>
          </label>

          <label style="display: flex; gap: 10px; align-items: flex-start; padding: 12px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer;">
            <input type="checkbox" class="rubric-check" data-criteria="financial_freedom" style="margin-top: 2px;">
            <div>
              <div style="font-weight: 600; font-size: 14px;">Promotes Financial/Economic Freedom</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Does it align with our mission of building self-sustainable individuals?</div>
            </div>
          </label>

          <label style="display: flex; gap: 10px; align-items: flex-start; padding: 12px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer;">
            <input type="checkbox" class="rubric-check" data-criteria="age_appropriate" style="margin-top: 2px;">
            <div>
              <div style="font-weight: 600; font-size: 14px;">Age-Appropriate</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Is this content suitable for all ages?</div>
            </div>
          </label>

          <label style="display: flex; gap: 10px; align-items: flex-start; padding: 12px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer;">
            <input type="checkbox" class="rubric-check" data-criteria="quality_standard" style="margin-top: 2px;">
            <div>
              <div style="font-weight: 600; font-size: 14px;">Meets Quality Standards</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Is the content well-written, clear, and professionally presented?</div>
            </div>
          </label>
        </div>

        <textarea id="review-note" placeholder="Additional notes (optional)..." style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; font-family: inherit; font-size: 13px; resize: vertical; min-height: 60px; margin-bottom: 16px;"></textarea>

        <div style="display: flex; gap: 10px;">
          <button id="rubric-approve" class="btn btn-primary" style="flex: 1;" disabled>Approve</button>
          <button id="rubric-reject" class="btn btn-danger" style="flex: 1;" disabled>Reject</button>
          <button id="rubric-cancel" class="btn" style="padding: 10px 16px;">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const checks = overlay.querySelectorAll('.rubric-check');
    const approveBtn = overlay.querySelector('#rubric-approve');
    const rejectBtn = overlay.querySelector('#rubric-reject');

    const updateButtons = () => {
      const checked = [...checks].filter(c => c.checked).length;
      approveBtn.disabled = checked < 3;
      rejectBtn.disabled = false;
      approveBtn.style.opacity = checked < 3 ? '0.5' : '1';
    };

    checks.forEach(c => c.addEventListener('change', updateButtons));
    updateButtons();

    overlay.querySelector('#rubric-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#rubric-approve').addEventListener('click', async () => {
      const criteria = [...checks].filter(c => c.checked).map(c => c.dataset.criteria);
      const note = overlay.querySelector('#review-note').value.trim();
      await this.submitReview(item.id, 'approved', criteria, note);
      overlay.remove();
      document.querySelector('.drawer-overlay')?.remove();
      this.load();
    });

    overlay.querySelector('#rubric-reject').addEventListener('click', async () => {
      const criteria = [...checks].filter(c => c.checked).map(c => c.dataset.criteria);
      const note = overlay.querySelector('#review-note').value.trim();
      await this.submitReview(item.id, 'rejected', criteria, note);
      overlay.remove();
      document.querySelector('.drawer-overlay')?.remove();
      this.load();
    });
  },

  async submitReview(postId, decision, criteria, note) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return alert('Session expired. Please sign in again.');

    const reviewNote = note || `Criteria met: ${criteria.join(', ')}`;

    try {
      const { error } = await supabase.rpc('admin_review_post', {
        p_post: postId,
        p_action: decision,
        p_note: reviewNote
      });

      if (error) {
        alert('Review failed: ' + error.message);
        return;
      }

      const action = decision === 'approved' ? 'approved' : 'rejected';
      alert(`Post ${action} successfully.`);
    } catch (err) {
      alert('Review failed: ' + err.message);
    }
  },
};
