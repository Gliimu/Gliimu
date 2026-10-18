import { supabase } from '../config.js';
import { escapeHtml, money, timeAgo, badge, empty, avatar, rpcError } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';

const TYPE_TONE = { publication: 'brand', audiolite: 'info', bundle: 'warning', post: 'neutral' };
const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'error' };
const KIND_LABEL = { submission: 'Publication', post: 'Gliim' };

// Delete icon SVG
const deleteIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

export default {
  template: `
    <div class="filters">
      <button class="filter-btn active" data-kind="all">All</button>
      <button class="filter-btn" data-kind="submission">Publications</button>
      <button class="filter-btn" data-kind="post">Gliims</button>
      <button class="filter-btn" data-status="pending">Pending</button>
      <button class="filter-btn" data-status="approved">Approved</button>
      <button class="filter-btn" data-status="rejected">Rejected</button>
    </div>
    <div id="submissions-list"><p class="loading">Loading submissions...</p></div>
  `,

  async init() {
    // Expose for onclick handlers
    window.submissionsInstance = this;

    this.filterKind = 'all';
    this.filterStatus = 'pending';
    this.items = [];
    this.people = new Map();

    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (btn.dataset.kind) {
          this.filterKind = btn.dataset.kind;
        } else if (btn.dataset.status) {
          this.filterStatus = btn.dataset.status;
        }
        this.render();
      });
    });

    await this.load();
  },

  async load() {
    // Load library submissions
    const { data: subs, error: subErr } = await supabase
      .from('library_submissions')
      .select('id, user_id, title, type, description, price, cover_url, file_url, blocks, bundle_items, status, review_note, created_at, reviewed_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (subErr && subErr.code !== '42P01') {
      console.error('Failed to load submissions:', subErr);
    }

    // Load hub posts (gliims)
    const { data: posts, error: postErr } = await supabase
      .rpc('admin_list_pending_posts', { p_status: 'all' });

    if (postErr) {
      console.error('Failed to load posts:', postErr);
    }

    // Normalize both into unified items
    const submissions = (subs || []).map(s => ({ ...s, kind: 'submission' }));
    const gliims = (posts && posts.posts ? posts.posts : []).map(p => ({ ...p, kind: 'post', type: 'post' }));

    this.items = [...submissions, ...gliims].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

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

  visible() {
    let items = this.items;

    // Filter by kind
    if (this.filterKind !== 'all') {
      items = items.filter(i => i.kind === this.filterKind);
    }

    // Filter by status
    if (this.filterStatus !== 'all') {
      items = items.filter(i => i.status === this.filterStatus);
    }

    return items;
  },

  partCount(item) {
    if (item.kind === 'post') {
      const blocks = Array.isArray(item.blocks) ? item.blocks.length : 0;
      return `${blocks} block${blocks === 1 ? '' : 's'}`;
    }

    const blocks = Array.isArray(item.blocks) ? item.blocks.length : 0;
    const files = Array.isArray(item.bundle_items) ? item.bundle_items.length : 0;
    if (item.type === 'bundle') return `${files} file${files === 1 ? '' : 's'}`;
    if (item.type === 'audiolite') {
      if (files) return `${files} chapter${files === 1 ? '' : 's'}`;
      return item.file_url ? '1 audio file' : 'no audio yet';
    }
    if (item.file_url) return '1 document';
    return `${blocks} block${blocks === 1 ? '' : 's'}`;
  },

  render() {
    const list = document.getElementById('submissions-list');
    const items = this.visible();

    if (!items.length) {
      list.innerHTML = empty('Nothing here.');
      return;
    }

    list.innerHTML = `<div class="row-list">${items.map(item => {
      const person = this.people.get(item.user_id);
      const parts = this.partCount(item);
      const kindBadge = badge(KIND_LABEL[item.kind] || item.kind, 'neutral');
      const typeBadge = item.kind === 'post' ? '' : badge(item.type, TYPE_TONE[item.type] || 'neutral');
      const statusBadge = badge(item.status, STATUS_TONE[item.status] || 'neutral');
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
              ${kindBadge}${typeBadge}${statusBadge}
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

    // Show password modal
    this.showPasswordModal(id);
  },

  showPasswordModal(itemId) {
    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = `
      <div class="drawer" style="max-width: 400px;">
        <div class="drawer-head">
          <h2>Enter your password</h2>
          <button class="drawer-close" aria-label="Close">×</button>
        </div>
        <div class="drawer-body">
          <p class="muted small">To confirm this deletion, enter your password.</p>
          <input type="password" id="delete-password" class="input" placeholder="Your password" autocomplete="current-password" style="margin-top: 12px;">
          <div id="delete-error" class="error-msg" style="display: none; margin-top: 8px;"></div>
        </div>
        <div class="drawer-foot">
          <button class="btn-secondary" id="cancel-delete-btn">Cancel</button>
          <button class="btn-danger" id="confirm-delete-btn">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.drawer-close').addEventListener('click', close);
    overlay.querySelector('#cancel-delete-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const input = overlay.querySelector('#delete-password');
    const errorDiv = overlay.querySelector('#delete-error');
    const confirmBtn = overlay.querySelector('#confirm-delete-btn');

    const attemptDelete = async () => {
      const password = input.value.trim();
      if (!password) {
        errorDiv.textContent = 'Password is required.';
        errorDiv.style.display = 'block';
        return;
      }

      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Deleting...';

      const { data, error } = await supabase.rpc('admin_delete_feed_item', {
        p_item_id: itemId,
        p_password: password
      });

      if (error || !data) {
        errorDiv.textContent = error?.message || 'Deletion failed.';
        errorDiv.style.display = 'block';
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Delete';
        return;
      }

      if (!data.deleted) {
        errorDiv.textContent = data.error || 'Deletion failed.';
        errorDiv.style.display = 'block';
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Delete';
        return;
      }

      close();
      await this.load();
      window.adminApp?.refreshCounts();
      appAlert('Deleted successfully.');
    };

    confirmBtn.addEventListener('click', attemptDelete);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') attemptDelete();
    });

    setTimeout(() => input.focus(), 100);
  },

  previewBody(item) {
    const blocks = Array.isArray(item.blocks) ? item.blocks : [];
    const files = Array.isArray(item.bundle_items) ? item.bundle_items : [];

    const blockHtml = blocks.map((b) => {
      const value = b && b.content != null ? String(b.content) : '';
      if (!value.trim()) return '';
      const kind = b.type === 'text' ? `text · ${escapeHtml(b.style || 'paragraph')}` : escapeHtml(b.type);

      let inner;
      if (b.type === 'image') inner = `<img src="${escapeHtml(value)}" alt="">${b.caption ? `<div class="muted small" style="margin-top:6px;text-align:center;">${escapeHtml(b.caption)}</div>` : ''}`;
      else if (b.type === 'video') inner = `<video src="${escapeHtml(value)}" controls></video>`;
      else if (b.type === 'audio') inner = `<audio src="${escapeHtml(value)}" controls></audio>`;
      else if (b.type === 'file') inner = `<a class="file-chip" href="${escapeHtml(value)}" target="_blank" rel="noopener">Open document</a>`;
      else inner = `<p>${escapeHtml(value)}</p>`;

      return `<div class="block-preview-item"><span class="block-kind">${kind}</span>${inner}</div>`;
    }).join('');

    const isChapters = item.type === 'audiolite';
    const fileList = (item.type === 'bundle' || isChapters ? files : [])
      .filter(f => f && f.url)
      .map((f, i) => {
        const label = f.title || (isChapters ? `Chapter ${i + 1}` : 'File');
        return `<div class="file-chip"><span>${isChapters ? `${i + 1}. ` : ''}${escapeHtml(label)}</span><a href="${escapeHtml(f.url)}" target="_blank" rel="noopener">Open</a></div>`;
      }).join('');

    const singleFile = (item.type !== 'bundle' && !isChapters && item.file_url)
      ? `<div class="file-chip"><span>${escapeHtml(item.title)}</span><a href="${escapeHtml(item.file_url)}" target="_blank" rel="noopener">Open</a></div>`
      : '';

    return blockHtml + fileList + singleFile
      || '<p class="muted small">This submission has no content attached.</p>';
  },

  openDrawer(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    document.querySelector('.drawer-overlay')?.remove();

    const person = this.people.get(item.user_id);
    const decided = item.status !== 'pending';

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = `
      <div class="drawer">
        <div class="drawer-head">
          <div style="min-width: 0;">
            <h2>${escapeHtml(item.title)}</h2>
            <div class="card-sub">${badge(item.kind === 'post' ? 'Gliim' : item.type, TYPE_TONE[item.type] || 'neutral')} ${badge(item.status, STATUS_TONE[item.status] || 'neutral')}</div>
          </div>
          <button class="drawer-close" aria-label="Close">×</button>
        </div>
        <div class="drawer-body">
          ${item.cover_url ? `<img class="cover-preview" src="${escapeHtml(item.cover_url)}" alt="" style="margin-bottom: 18px;">` : ''}

          <dl class="kv" style="margin-bottom: 18px;">
            <dt>Submitted by</dt><dd>${escapeHtml(this.submitterName(item.user_id))}${person && person.username ? ` <span class="muted">@${escapeHtml(person.username)}</span>` : ''}</dd>
            ${item.kind !== 'post' ? `<dt>Format</dt><dd>${escapeHtml(item.type)}</dd>` : ''}
            ${item.kind !== 'post' ? `<dt>Price</dt><dd>${money(item.price)}</dd>` : ''}
            <dt>Submitted</dt><dd>${escapeHtml(new Date(item.created_at).toLocaleString())}</dd>
            ${item.reviewed_at ? `<dt>Reviewed</dt><dd>${escapeHtml(new Date(item.reviewed_at).toLocaleString())}</dd>` : ''}
            ${item.review_note ? `<dt>Review note</dt><dd>${escapeHtml(item.review_note)}</dd>` : ''}
          </dl>

          <div class="section-title">Description</div>
          <p class="card-body" style="margin-bottom: 18px;">${escapeHtml(item.description || '—')}</p>

          ${item.kind !== 'post' ? `
            <div class="section-title">Content as members will see it</div>
            ${this.previewBody(item)}
          ` : ''}

          ${decided || item.kind === 'post' ? '' : `
            <div class="section-title">Note to the submitter</div>
            <textarea class="input" id="review-note" rows="3" placeholder="Optional on approval, required to reject — they receive it as a ping."></textarea>
          `}
        </div>
        ${decided || item.kind === 'post' ? '' : `
          <div class="drawer-foot">
            <button class="btn-danger" id="reject-btn">Reject</button>
            <button class="btn-primary" id="approve-btn">Approve & publish</button>
          </div>
        `}
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.drawer-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    if (decided || item.kind === 'post') return;

    overlay.querySelector('#approve-btn').addEventListener('click', async () => {
      const note = overlay.querySelector('#review-note').value.trim();
      const ok = await appConfirm(
        `"${item.title}" goes live on the Feed at ${money(item.price)}, attributed to ${this.submitterName(item.user_id)}.`,
        { okText: 'Approve', title: 'Approve submission?' }
      );
      if (!ok) return;
      await this.review(item.id, 'approve', note, close);
    });

    overlay.querySelector('#reject-btn').addEventListener('click', async () => {
      const note = overlay.querySelector('#review-note').value.trim();
      if (note.length < 5) {
        return appAlert('Write a reason of at least 5 characters — the submitter receives it as a ping.');
      }
      const ok = await appConfirm(`Reject "${item.title}"? The submitter can fix it and submit again.`, {
        okText: 'Reject', title: 'Reject submission?', danger: true
      });
      if (!ok) return;
      await this.review(item.id, 'reject', note, close);
    });
  },

  async review(id, action, note, close) {
    const { data, error } = await supabase.rpc('admin_review_submission', {
      p_submission: id, p_action: action, p_note: note || null
    });

    if (error) return appAlert(rpcError({ code: error.code, detail: error.message }, 'Review failed: ' + error.message));
    if (!data || data.ok === false) return appAlert(rpcError(data));

    close();
    await this.load();
    window.adminApp?.refreshCounts();
    appAlert(action === 'approve' ? 'Approved and published to the Feed.' : 'Rejected. The submitter has been told why.');
  }
};
