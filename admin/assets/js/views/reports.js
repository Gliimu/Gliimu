import { supabase } from '../config.js';
import { escapeHtml, timeAgo, badge, empty, avatar, rpcError } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';

const STATUS_TONE = { open: 'error', resolved: 'success', dismissed: 'neutral' };
const TARGET_LABEL = { user: 'Member', post: 'Gliim', library: 'Library item' };

export default {
  template: `
    <div class="filters">
      <button class="filter-btn active" data-status="open">Open</button>
      <button class="filter-btn" data-status="resolved">Resolved</button>
      <button class="filter-btn" data-status="dismissed">Dismissed</button>
      <button class="filter-btn" data-status="all">All</button>
    </div>
    <div id="reports-list"><p class="loading">Loading reports...</p></div>
  `,

  async init() {
    this.filter = 'open';
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
    const { data, error } = await supabase.from('reports')
      .select('id, reporter_id, target_type, target_id, reason, status, created_at')
      .order('created_at', { ascending: false })
      .limit(300);

    const list = document.getElementById('reports-list');

    if (error) {
      list.innerHTML = empty(`Could not load reports: ${error.message}`);
      return;
    }

    this.items = data || [];

    const ids = [...new Set(this.items.map(i => i.reporter_id).filter(Boolean))];
    if (ids.length) {
      const { data: profiles } = await supabase.from('profiles')
        .select('id, full_name, username, avatar_url').in('id', ids);
      this.people = new Map((profiles || []).map(p => [p.id, p]));
    }

    this.render();
  },

  name(userId) {
    const p = this.people.get(userId);
    return (p && (p.full_name || p.username)) || 'Unknown member';
  },

  render() {
    const list = document.getElementById('reports-list');
    const items = this.filter === 'all' ? this.items : this.items.filter(i => i.status === this.filter);

    if (!items.length) {
      list.innerHTML = empty(this.filter === 'open' ? 'No open reports. Nothing to triage.' : 'No reports here.');
      return;
    }

    list.innerHTML = `<div class="row-list">${items.map(item => {
      const person = this.people.get(item.reporter_id);
      return `
        <div class="card" data-open="${item.id}" style="cursor: pointer;">
          <div class="card-head">
            ${avatar(person && person.avatar_url, this.name(item.reporter_id))}
            <div style="min-width: 0;">
              <div class="card-title">${escapeHtml(TARGET_LABEL[item.target_type] || item.target_type)} reported</div>
              <div class="card-sub">by ${escapeHtml(this.name(item.reporter_id))} · ${timeAgo(item.created_at)}</div>
            </div>
            <div class="card-actions">${badge(item.status, STATUS_TONE[item.status] || 'neutral')}</div>
          </div>
          <div class="card-body">${escapeHtml((item.reason || '').slice(0, 200))}${(item.reason || '').length > 200 ? '…' : ''}</div>
        </div>`;
    }).join('')}</div>`;

    list.querySelectorAll('[data-open]').forEach((el) => {
      el.addEventListener('click', () => this.openDrawer(el.dataset.open));
    });
  },

  // The reported thing itself is fetched only when a reviewer opens it: the
  // list stays fast and a locked premium body is never pulled speculatively.
  async targetDetails(item) {
    if (item.target_type === 'user') {
      const { data } = await supabase.from('profiles')
        .select('full_name, username, avatar_url, total_gp, tier, is_admin')
        .eq('id', item.target_id).maybeSingle();
      if (!data) return '<p class="muted small">This member account no longer exists.</p>';
      return `
        <dl class="kv">
          <dt>Name</dt><dd>${escapeHtml(data.full_name || '—')}</dd>
          <dt>Username</dt><dd>${escapeHtml(data.username || '—')}</dd>
          <dt>GP</dt><dd>${escapeHtml(String(data.total_gp || 0))}</dd>
          <dt>Tier</dt><dd>${escapeHtml(data.tier || '—')}</dd>
          <dt>Staff</dt><dd>${data.is_admin ? 'Yes — admin flag set' : 'No'}</dd>
        </dl>`;
    }

    if (item.target_type === 'post') {
      const { data } = await supabase.from('posts')
        .select('title, description, category, is_premium, created_at, user_id')
        .eq('id', item.target_id).maybeSingle();
      if (!data) return '<p class="muted small">This gliim has been deleted.</p>';
      const { data: author } = await supabase.from('profiles')
        .select('full_name, username').eq('id', data.user_id).maybeSingle();
      return `
        <dl class="kv">
          <dt>Title</dt><dd>${escapeHtml(data.title || '—')}</dd>
          <dt>Author</dt><dd>${escapeHtml((author && (author.full_name || author.username)) || 'Unknown')}</dd>
          <dt>Category</dt><dd>${escapeHtml(data.category || '—')}</dd>
          <dt>Premium</dt><dd>${data.is_premium ? 'Yes' : 'No'}</dd>
          <dt>Posted</dt><dd>${escapeHtml(new Date(data.created_at).toLocaleString())}</dd>
        </dl>
        <div class="section-title">Description</div>
        <p class="card-body">${escapeHtml(data.description || '—')}</p>`;
    }

    const { data } = await supabase.from('library_items')
      .select('title, type, description, price, author')
      .eq('id', item.target_id).maybeSingle();
    if (!data) return '<p class="muted small">This library item no longer exists.</p>';
    return `
      <dl class="kv">
        <dt>Title</dt><dd>${escapeHtml(data.title || '—')}</dd>
        <dt>Author</dt><dd>${escapeHtml(data.author || '—')}</dd>
        <dt>Format</dt><dd>${escapeHtml(data.type || '—')}</dd>
        <dt>Price</dt><dd>${escapeHtml(String(data.price || 0))}</dd>
      </dl>
      <div class="section-title">Description</div>
      <p class="card-body">${escapeHtml(data.description || '—')}</p>`;
  },

  async openDrawer(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    document.querySelector('.drawer-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = `
      <div class="drawer">
        <div class="drawer-head">
          <div style="min-width: 0;">
            <h2>${escapeHtml(TARGET_LABEL[item.target_type] || item.target_type)} report</h2>
            <div class="card-sub">${badge(item.status, STATUS_TONE[item.status] || 'neutral')} · ${timeAgo(item.created_at)}</div>
          </div>
          <button class="drawer-close" aria-label="Close">×</button>
        </div>
        <div class="drawer-body">
          <div class="section-title">Reason given</div>
          <p class="card-body" style="margin-bottom: 18px;">${escapeHtml(item.reason || '—')}</p>

          <div class="section-title">Reported by</div>
          <div class="who" style="margin-bottom: 18px;">
            ${avatar((this.people.get(item.reporter_id) || {}).avatar_url, this.name(item.reporter_id))}
            <span>${escapeHtml(this.name(item.reporter_id))}</span>
          </div>

          <div class="section-title">What was reported</div>
          <div id="report-target"><p class="loading">Loading...</p></div>
        </div>
        ${item.status === 'open' ? `
          <div class="drawer-foot">
            <button class="btn-quiet" id="dismiss-btn">Dismiss</button>
            <button class="btn-primary" id="resolve-btn">Mark resolved</button>
          </div>
        ` : ''}
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.drawer-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#report-target').innerHTML = await this.targetDetails(item);

    if (item.status !== 'open') return;

    overlay.querySelector('#resolve-btn').addEventListener('click', () => this.setStatus(item, 'resolved', close));
    overlay.querySelector('#dismiss-btn').addEventListener('click', async () => {
      const ok = await appConfirm('Dismissing means the report needed no action. It stays on record.', {
        okText: 'Dismiss report', title: 'Dismiss this report?'
      });
      if (ok) await this.setStatus(item, 'dismissed', close);
    });
  },

  async setStatus(item, status, close) {
    const { data, error } = await supabase.rpc('admin_resolve_report', { p_report: item.id, p_status: status });

    if (error) return appAlert(rpcError({ code: error.code }, 'Could not update that report: ' + error.message));
    if (!data || data.ok === false) return appAlert(rpcError(data));

    close();
    await this.load();
    window.adminApp?.refreshCounts();
  }
};
