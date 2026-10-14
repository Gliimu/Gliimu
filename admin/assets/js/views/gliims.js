import { supabase } from '../config.js';
import { escapeHtml, timeAgo, badge, empty, avatar, rpcError } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';

const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'error' };

export default {
  template: `
    <div class="filters">
      <button class="filter-btn active" data-status="pending">Pending</button>
      <button class="filter-btn" data-status="approved">Approved</button>
      <button class="filter-btn" data-status="rejected">Rejected</button>
    </div>
    <div id="gliims-list"><p class="loading">Loading gliims...</p></div>
  `,

  async init() {
    this.filter = 'pending';
    this.items = [];

    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filter = btn.dataset.status;
        this.load();
      });
    });

    await this.load();
  },

  async load() {
    const list = document.getElementById('gliims-list');
    list.innerHTML = '<p class="loading">Loading gliims...</p>';

    const { data, error } = await supabase.rpc('admin_list_pending_posts', { p_status: this.filter });

    if (error) {
      list.innerHTML = empty(error.code === '42883'
        ? 'admin_list_pending_posts does not exist yet. Run sql/gliim_approval.sql.'
        : `Could not load gliims: ${error.message}`);
      return;
    }
    if (!data || data.ok === false) {
      list.innerHTML = empty(rpcError(data));
      return;
    }

    this.items = data.posts || [];
    this.render();
  },

  blockCount(item) {
    const blocks = Array.isArray(item.blocks) ? item.blocks.length : 0;
    return `${blocks} block${blocks === 1 ? '' : 's'}`;
  },

  render() {
    const list = document.getElementById('gliims-list');
    if (!this.items.length) {
      list.innerHTML = empty(this.filter === 'pending' ? 'Nothing waiting for review.' : 'No gliims here.');
      return;
    }

    list.innerHTML = `<div class="row-list">${this.items.map(item => `
      <div class="card" data-open="${item.id}" style="cursor: pointer;">
        <div class="card-head">
          ${avatar(item.author_avatar, item.author_name)}
          <div style="min-width: 0;">
            <div class="card-title">${escapeHtml(item.title || 'Untitled')}</div>
            <div class="card-sub">${escapeHtml(item.author_name)} · ${timeAgo(item.created_at)} · ${this.blockCount(item)}</div>
          </div>
          <div class="card-actions">
            ${item.is_premium ? badge('premium', 'brand') : ''}
            ${badge(item.status, STATUS_TONE[item.status] || 'neutral')}
          </div>
        </div>
        <div class="card-body">${escapeHtml((item.description || '').slice(0, 180))}${(item.description || '').length > 180 ? '…' : ''}</div>
      </div>`).join('')}</div>`;

    list.querySelectorAll('[data-open]').forEach((el) => {
      el.addEventListener('click', () => this.openDrawer(el.dataset.open));
    });
  },

  // Reviewers must see exactly what goes live, so this renders the same
  // block shapes the member app does (text, image, video, audio, pdf).
  previewBody(item) {
    const blocks = Array.isArray(item.blocks) ? item.blocks : [];
    if (!blocks.length) return '<p class="muted small">This gliim has no content attached.</p>';

    return blocks.map((b) => {
      const value = b && b.content != null ? String(b.content) : '';
      if (!value.trim()) return '';
      const kind = b.type === 'text' ? `text · ${escapeHtml(b.style || 'paragraph')}` : escapeHtml(b.type || 'block');

      let inner;
      if (b.type === 'image') inner = `<img src="${escapeHtml(value)}" alt="">`;
      else if (b.type === 'video') inner = `<video src="${escapeHtml(value)}" controls></video>`;
      else if (b.type === 'audio') inner = `<audio src="${escapeHtml(value)}" controls></audio>`;
      else if (b.type === 'pdf') {
        const price = Number(b.price || 0);
        const label = price > 0 ? `₦${price.toLocaleString()}` : 'Free';
        inner = `<div class="file-chip"><span>PDF · ${escapeHtml(label)}</span><a href="${escapeHtml(value)}" target="_blank" rel="noopener">Open</a></div>`;
      }
      else inner = `<p>${escapeHtml(value)}</p>`;

      return `<div class="block-preview-item"><span class="block-kind">${kind}</span>${inner}</div>`;
    }).join('');
  },

  openDrawer(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    document.querySelector('.drawer-overlay')?.remove();
    const decided = item.status !== 'pending';

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = `
      <div class="drawer">
        <div class="drawer-head">
          <div style="min-width: 0;">
            <h2>${escapeHtml(item.title || 'Untitled')}</h2>
            <div class="card-sub">${item.is_premium ? badge('premium', 'brand') : ''} ${badge(item.status, STATUS_TONE[item.status] || 'neutral')}</div>
          </div>
          <button class="drawer-close" aria-label="Close">×</button>
        </div>
        <div class="drawer-body">
          ${item.cover_url ? `<img class="cover-preview" src="${escapeHtml(item.cover_url)}" alt="" style="margin-bottom: 18px;">` : ''}

          <dl class="kv" style="margin-bottom: 18px;">
            <dt>Posted by</dt><dd>${escapeHtml(item.author_name)}</dd>
            <dt>Category</dt><dd>${escapeHtml(item.category || '—')}</dd>
            <dt>Submitted</dt><dd>${escapeHtml(new Date(item.created_at).toLocaleString())}</dd>
            ${item.reviewed_at ? `<dt>Reviewed</dt><dd>${escapeHtml(new Date(item.reviewed_at).toLocaleString())}</dd>` : ''}
            ${item.review_note ? `<dt>Review note</dt><dd>${escapeHtml(item.review_note)}</dd>` : ''}
          </dl>

          <div class="section-title">Description</div>
          <p class="card-body" style="margin-bottom: 18px;">${escapeHtml(item.description || '—')}</p>

          <div class="section-title">Content as members will see it</div>
          ${this.previewBody(item)}

          ${decided ? '' : `
            <div class="section-title">Note to the author</div>
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
        `"${item.title || 'Untitled'}" goes live in the Hub, attributed to ${item.author_name}.`,
        { okText: 'Approve', title: 'Approve gliim?' }
      );
      if (!ok) return;
      await this.review(item.id, 'approve', note, close);
    });

    overlay.querySelector('#reject-btn').addEventListener('click', async () => {
      const note = overlay.querySelector('#review-note').value.trim();
      if (note.length < 5) {
        return appAlert('Write a reason of at least 5 characters — the author receives it as a ping.');
      }
      const ok = await appConfirm(`Reject "${item.title || 'Untitled'}"? The author can fix it and post again.`, {
        okText: 'Reject', title: 'Reject gliim?', danger: true
      });
      if (!ok) return;
      await this.review(item.id, 'reject', note, close);
    });
  },

  async review(id, action, note, close) {
    const { data, error } = await supabase.rpc('admin_review_post', {
      p_post: id, p_action: action, p_note: note || null
    });

    if (error) return appAlert(rpcError({ code: error.code, detail: error.message }, 'Review failed: ' + error.message));
    if (!data || data.ok === false) return appAlert(rpcError(data));

    close();
    await this.load();
    appAlert(action === 'approve' ? 'Approved and published to the Hub.' : 'Rejected. The author has been told why.');
  }
};
