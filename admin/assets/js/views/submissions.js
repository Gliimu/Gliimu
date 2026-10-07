import { supabase } from '../config.js';
import { escapeHtml, money, timeAgo, badge, empty, avatar, rpcError } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';

const TYPE_TONE = { publication: 'brand', audiolite: 'info', bundle: 'warning' };
const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'error' };

export default {
  template: `
    <div class="filters">
      <button class="filter-btn active" data-status="pending">Pending</button>
      <button class="filter-btn" data-status="approved">Approved</button>
      <button class="filter-btn" data-status="rejected">Rejected</button>
      <button class="filter-btn" data-status="all">All</button>
    </div>
    <div id="submissions-list"><p class="loading">Loading submissions...</p></div>
  `,

  async init() {
    this.filter = 'pending';
    this.items = [];
    this.people = new Map();

    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filter = btn.dataset.status;
        this.render();
      });
    });

    await this.load();
  },

  async load() {
    const query = supabase.from('library_submissions')
      .select('id, user_id, title, type, description, price, cover_url, file_url, blocks, bundle_items, status, review_note, created_at, reviewed_at')
      .order('created_at', { ascending: false })
      .limit(200);

    const { data, error } = await query;
    const list = document.getElementById('submissions-list');

    if (error) {
      // 42P01 = the submissions table is not in this project yet.
      list.innerHTML = empty(error.code === '42P01'
        ? 'library_submissions does not exist yet. Run sql/library_submissions.sql, then sql/admin.sql.'
        : `Could not load submissions: ${error.message}`);
      return;
    }

    this.items = data || [];

    const ids = [...new Set(this.items.map(i => i.user_id).filter(Boolean))];
    if (ids.length) {
      const { data: profiles } = await supabase.from('profiles')
        .select('id, full_name, username, avatar_url').in('id', ids);
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
    return this.filter === 'all' ? this.items : this.items.filter(i => i.status === this.filter);
  },

  render() {
    const list = document.getElementById('submissions-list');
    const items = this.visible();

    if (!items.length) {
      list.innerHTML = empty(this.filter === 'pending' ? 'Nothing waiting for review.' : 'No submissions here.');
      return;
    }

    list.innerHTML = `<div class="row-list">${items.map(item => {
      const person = this.people.get(item.user_id);
      const parts = this.partCount(item);
      return `
        <div class="card" data-open="${item.id}" style="cursor: pointer;">
          <div class="card-head">
            ${avatar(person && person.avatar_url, this.submitterName(item.user_id))}
            <div style="min-width: 0;">
              <div class="card-title">${escapeHtml(item.title)}</div>
              <div class="card-sub">${escapeHtml(this.submitterName(item.user_id))} · ${timeAgo(item.created_at)} · ${parts}</div>
            </div>
            <div class="card-actions">
              ${badge(item.type, TYPE_TONE[item.type] || 'neutral')}
              ${badge(item.status, STATUS_TONE[item.status] || 'neutral')}
            </div>
          </div>
          <div class="card-body">${escapeHtml((item.description || '').slice(0, 180))}${(item.description || '').length > 180 ? '…' : ''}</div>
        </div>`;
    }).join('')}</div>`;

    list.querySelectorAll('[data-open]').forEach((el) => {
      el.addEventListener('click', () => this.openDrawer(el.dataset.open));
    });
  },

  partCount(item) {
    const blocks = Array.isArray(item.blocks) ? item.blocks.length : 0;
    const files = Array.isArray(item.bundle_items) ? item.bundle_items.length : 0;
    if (item.type === 'bundle') return `${files} file${files === 1 ? '' : 's'}`;
    if (item.type === 'audiolite') return item.file_url ? '1 audio file' : 'no audio yet';
    return `${blocks} block${blocks === 1 ? '' : 's'}`;
  },

  // Reviewers must be able to see exactly what will go on the shelf before
  // approving it, so this renders the same block shapes the member app does.
  previewBody(item) {
    const blocks = Array.isArray(item.blocks) ? item.blocks : [];
    const files = Array.isArray(item.bundle_items) ? item.bundle_items : [];

    const blockHtml = blocks.map((b) => {
      const value = b && b.content != null ? String(b.content) : '';
      if (!value.trim()) return '';
      const kind = b.type === 'text' ? `text · ${escapeHtml(b.style || 'paragraph')}` : escapeHtml(b.type);

      let inner;
      if (b.type === 'image') inner = `<img src="${escapeHtml(value)}" alt="">`;
      else if (b.type === 'video') inner = `<video src="${escapeHtml(value)}" controls></video>`;
      else if (b.type === 'audio') inner = `<audio src="${escapeHtml(value)}" controls></audio>`;
      else if (b.type === 'file') inner = `<a class="file-chip" href="${escapeHtml(value)}" target="_blank" rel="noopener">Open document</a>`;
      else inner = `<p>${escapeHtml(value)}</p>`;

      return `<div class="block-preview-item"><span class="block-kind">${kind}</span>${inner}</div>`;
    }).join('');

    const fileList = (item.type === 'bundle' ? files : [])
      .filter(f => f && f.url)
      .map(f => `<div class="file-chip"><span>${escapeHtml(f.title || 'File')}</span><a href="${escapeHtml(f.url)}" target="_blank" rel="noopener">Open</a></div>`)
      .join('');

    const singleFile = (item.type !== 'bundle' && item.file_url)
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
            <div class="card-sub">${badge(item.type, TYPE_TONE[item.type] || 'neutral')} ${badge(item.status, STATUS_TONE[item.status] || 'neutral')}</div>
          </div>
          <button class="drawer-close" aria-label="Close">×</button>
        </div>
        <div class="drawer-body">
          ${item.cover_url ? `<img class="cover-preview" src="${escapeHtml(item.cover_url)}" alt="" style="margin-bottom: 18px;">` : ''}

          <dl class="kv" style="margin-bottom: 18px;">
            <dt>Submitted by</dt><dd>${escapeHtml(this.submitterName(item.user_id))}${person && person.username ? ` <span class="muted">@${escapeHtml(person.username)}</span>` : ''}</dd>
            <dt>Format</dt><dd>${escapeHtml(item.type)}</dd>
            <dt>Price</dt><dd>${money(item.price)}</dd>
            <dt>Submitted</dt><dd>${escapeHtml(new Date(item.created_at).toLocaleString())}</dd>
            ${item.reviewed_at ? `<dt>Reviewed</dt><dd>${escapeHtml(new Date(item.reviewed_at).toLocaleString())}</dd>` : ''}
            ${item.review_note ? `<dt>Review note</dt><dd>${escapeHtml(item.review_note)}</dd>` : ''}
          </dl>

          <div class="section-title">Description</div>
          <p class="card-body" style="margin-bottom: 18px;">${escapeHtml(item.description || '—')}</p>

          <div class="section-title">Content as members will see it</div>
          ${this.previewBody(item)}

          ${decided ? '' : `
            <div class="section-title">Note to the submitter</div>
            <textarea class="input" id="review-note" rows="3" placeholder="Optional on approval, required to reject — they receive it as a ping."></textarea>
          `}
        </div>
        ${decided ? '' : `
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

    if (decided) return;

    overlay.querySelector('#approve-btn').addEventListener('click', async () => {
      const note = overlay.querySelector('#review-note').value.trim();
      const ok = await appConfirm(
        `"${item.title}" goes live on the shelf at ${money(item.price)}, attributed to ${this.submitterName(item.user_id)}.`,
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
    appAlert(action === 'approve' ? 'Approved and published to the shelf.' : 'Rejected. The submitter has been told why.');
  }
};
