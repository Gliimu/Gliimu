import { supabase } from '../config.js';
import { escapeHtml, naira, gp, empty, timeAgo, rpcError, TXN_LABEL } from '../ui.js';

const TYPES = ['topup', 'purchase', 'support', 'subscription', 'transfer_in', 'transfer_out',
  'adjustment', 'live_session', 'live_entry', 'live_support', 'reward'];

const PAGE = 100;

export default {
  template: `
    <div class="filters">
      <select id="ledger-type" class="input" style="width: auto; min-width: 178px;">
        <option value="">Every kind</option>
        ${TYPES.map(t => `<option value="${t}">${escapeHtml(TXN_LABEL[t] || t)}</option>`).join('')}
      </select>
      <select id="ledger-status" class="input" style="width: auto; min-width: 140px;">
        <option value="">Any status</option>
        <option value="success">Success</option>
        <option value="pending">Pending</option>
      </select>
      <span class="muted small" id="ledger-count"></span>
      <button class="btn-quiet btn-small" id="ledger-more" style="margin-left: auto;" hidden>Load more</button>
    </div>
    <div class="card"><div id="ledger-body"><p class="loading">Loading ledger...</p></div></div>
  `,

  async init() {
    this.rows = [];
    this.total = 0;
    this.busy = false;

    document.getElementById('ledger-type').addEventListener('change', () => this.reload());
    document.getElementById('ledger-status').addEventListener('change', () => this.reload());
    document.getElementById('ledger-more').addEventListener('click', () => this.fetch());

    await this.reload();
  },

  reload() {
    this.rows = [];
    this.total = 0;
    document.getElementById('ledger-body').innerHTML = '<p class="loading">Loading ledger...</p>';
    return this.fetch();
  },

  async fetch() {
    if (this.busy) return;
    this.busy = true;

    const { data, error } = await supabase.rpc('registrar_ledger', {
      p_type: document.getElementById('ledger-type').value || null,
      p_status: document.getElementById('ledger-status').value || null,
      p_user: null,
      p_limit: PAGE,
      p_offset: this.rows.length
    });

    this.busy = false;
    const body = document.getElementById('ledger-body');

    if (error) {
      body.innerHTML = empty(error.code === '42883'
        ? 'registrar_ledger() is not installed yet. Run sql/registrar.sql.'
        : `Could not load the ledger: ${error.message}`);
      return;
    }
    if (!data || data.ok === false) {
      body.innerHTML = empty(rpcError(data, 'Could not load the ledger.'));
      return;
    }

    this.total = Number(data.total || 0);
    this.rows = this.rows.concat(data.rows || []);
    this.render();
  },

  render() {
    const body = document.getElementById('ledger-body');
    const more = document.getElementById('ledger-more');
    const count = document.getElementById('ledger-count');

    count.textContent = this.total ? `${this.rows.length.toLocaleString()} of ${this.total.toLocaleString()} entries` : '';

    if (!this.rows.length) {
      body.innerHTML = empty('No ledger entries match those filters.');
      more.hidden = true;
      return;
    }

    more.hidden = this.rows.length >= this.total;

    body.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>When</th><th>Member</th><th>Kind</th><th>Description</th>
          <th class="num">GP</th><th class="num">Amount</th>
        </tr></thead>
        <tbody>${this.rows.map(r => `
          <tr>
            <td class="muted small" style="white-space: nowrap;" title="${escapeHtml(new Date(r.created_at).toLocaleString())}">${escapeHtml(timeAgo(r.created_at))}</td>
            <td>${escapeHtml(r.name)}${r.username ? `<div class="muted small">@${escapeHtml(r.username)}</div>` : ''}</td>
            <td>${escapeHtml(TXN_LABEL[r.type] || r.type || '—')}</td>
            <td>${escapeHtml(r.description || '—')}${r.reference ? `<div class="muted small mono">${escapeHtml(r.reference)}</div>` : ''}</td>
            <td class="num muted">${Number(r.points || 0) ? gp(r.points) : '—'}</td>
            <td class="num"><span class="${r.amount >= 0 ? 'amount-pos' : 'amount-neg'}">${naira(r.amount)}</span>${r.status && r.status !== 'success' ? `<div class="muted small">${escapeHtml(r.status)}</div>` : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
  }
};
