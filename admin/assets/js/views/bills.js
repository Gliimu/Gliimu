import { supabase } from '../config.js';
import { escapeHtml, naira, badge, empty, timeAgo, rpcError, openDrawer } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';

const CYCLE_TONE = { open: 'neutral', processing: 'warning', paid: 'success', defaulted: 'error', closed_empty: 'neutral', void: 'neutral' };
const PAGE = 100;

export default {
  template: `
    <div class="filters">
      <button class="filter-btn active" data-status="processing">Due now</button>
      <button class="filter-btn" data-status="open">Open</button>
      <button class="filter-btn" data-status="paid">Paid</button>
      <button class="filter-btn" data-status="defaulted">Defaulted</button>
      <button class="filter-btn" data-status="all">All</button>
      <span class="muted small" id="bills-count"></span>
      <button class="btn-quiet btn-small" id="bills-more" style="margin-left: auto;" hidden>Load more</button>
    </div>
    <div class="card"><div id="bills-body"><p class="loading">Loading bills...</p></div></div>
  `,

  async init() {
    this.filter = 'processing';
    this.rows = [];
    this.total = 0;
    this.busy = false;

    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filter = btn.dataset.status;
        this.reload();
      });
    });
    document.getElementById('bills-more').addEventListener('click', () => this.fetch());

    await this.reload();
  },

  reload() {
    this.rows = [];
    this.total = 0;
    document.getElementById('bills-body').innerHTML = '<p class="loading">Loading bills...</p>';
    return this.fetch();
  },

  async fetch() {
    if (this.busy) return;
    this.busy = true;

    const { data, error } = await supabase.rpc('registrar_cycles', {
      p_status: this.filter === 'all' ? null : this.filter,
      p_limit: PAGE,
      p_offset: this.rows.length
    });

    this.busy = false;
    const body = document.getElementById('bills-body');

    if (error) {
      body.innerHTML = empty(error.code === '42883'
        ? 'registrar_cycles() is not installed yet. Run sql/registrar.sql.'
        : `Could not load bills: ${error.message}`);
      return;
    }
    if (!data || data.ok === false) {
      body.innerHTML = empty(rpcError(data, 'Could not load bills.'));
      return;
    }

    this.total = Number(data.total || 0);
    this.rows = this.rows.concat(data.cycles || []);
    this.render();
  },

  render() {
    const body = document.getElementById('bills-body');
    const more = document.getElementById('bills-more');

    document.getElementById('bills-count').textContent =
      this.total ? `${this.rows.length.toLocaleString()} of ${this.total.toLocaleString()} bills` : '';

    if (!this.rows.length) {
      body.innerHTML = empty('No bills with that status.');
      more.hidden = true;
      return;
    }

    more.hidden = this.rows.length >= this.total;

    body.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Member</th><th>Status</th><th class="num">Amount</th>
          <th>Due</th><th>Made up of</th><th>Reference</th>
        </tr></thead>
        <tbody>${this.rows.map(c => `
          <tr data-open="${c.id}">
            <td>${escapeHtml(c.name)}${c.username ? `<div class="muted small">@${escapeHtml(c.username)}</div>` : ''}</td>
            <td>${badge(c.status, CYCLE_TONE[c.status] || 'neutral')}</td>
            <td class="num">${naira(c.total_amount)}</td>
            <td class="muted small" style="white-space: nowrap;">${c.due_at ? `${escapeHtml(new Date(c.due_at).toLocaleDateString())}<div>${escapeHtml(timeAgo(c.due_at))}</div>` : '—'}</td>
            <td class="small muted">${(c.breakdown || []).map(b => `${escapeHtml(b.event_type)} · ${naira(b.amount)}`).join('<br>') || '—'}</td>
            <td class="muted small mono">${escapeHtml(c.payment_reference || '—')}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;

    body.querySelectorAll('[data-open]').forEach((el) => {
      el.addEventListener('click', () => this.openBill(Number(el.dataset.open)));
    });
  },

  openBill(id) {
    const c = this.rows.find(r => Number(r.id) === id);
    if (!c) return;

    const actionable = c.status !== 'paid' && c.status !== 'void';

    const { overlay, close } = openDrawer({
      title: `Bill #${c.id}`,
      sub: `${badge(c.status, CYCLE_TONE[c.status] || 'neutral')} · ${escapeHtml(c.name)} · ${naira(c.total_amount)}`,
      body: `
        <dl class="kv" style="margin-bottom: 18px;">
          <dt>Member</dt><dd>${escapeHtml(c.name)}${c.username ? ` <span class="muted">@${escapeHtml(c.username)}</span>` : ''}</dd>
          <dt>Amount</dt><dd>${naira(c.total_amount)}</dd>
          <dt>Period</dt><dd>${c.start_date ? escapeHtml(new Date(c.start_date).toLocaleDateString()) : '—'} → ${c.end_date ? escapeHtml(new Date(c.end_date).toLocaleDateString()) : 'open'}</dd>
          <dt>Due</dt><dd>${c.due_at ? escapeHtml(new Date(c.due_at).toLocaleString()) : '—'}</dd>
          <dt>Reference</dt><dd class="mono">${escapeHtml(c.payment_reference || '—')}</dd>
        </dl>

        <div class="section-title">What this bill is made of</div>
        ${(c.breakdown || []).length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Charge</th><th class="num">Amount</th></tr></thead>
            <tbody>${c.breakdown.map(b => `<tr><td>${escapeHtml(b.event_type)}</td><td class="num">${naira(b.amount)}</td></tr>`).join('')}</tbody>
          </table></div>` : '<p class="muted small">Nothing was charged in this period.</p>'}

        ${actionable ? `
          <div class="section-title">Reconcile by hand</div>
          <div class="form-group">
            <label for="bill-reference">Payment reference (bank transfer code, Paystack reference)</label>
            <input type="text" id="bill-reference" class="input" placeholder="e.g. TRF-2026-00431">
          </div>
          <div class="form-group">
            <label for="bill-reason">Reason (required — it goes on the audit log)</label>
            <input type="text" id="bill-reason" class="input" placeholder="Member paid by transfer, confirmed in bank statement">
          </div>
        ` : '<p class="muted small">This bill is already settled. Refund the wallet from Members if the payment bounced.</p>'}
      `,
      foot: actionable ? `
        <button class="btn-danger" id="bill-void">Void</button>
        <button class="btn-quiet" id="bill-default">Mark defaulted</button>
        <button class="btn-primary" id="bill-paid">Mark paid</button>
      ` : ''
    });

    if (!actionable) return;

    overlay.querySelector('#bill-paid').addEventListener('click', () => this.setStatus(c, 'paid', overlay, close));
    overlay.querySelector('#bill-default').addEventListener('click', () => this.setStatus(c, 'defaulted', overlay, close));
    overlay.querySelector('#bill-void').addEventListener('click', () => this.setStatus(c, 'void', overlay, close));
  },

  async setStatus(c, status, overlay, close) {
    const reason = overlay.querySelector('#bill-reason').value.trim();
    const reference = overlay.querySelector('#bill-reference').value.trim() || null;

    if (reason.length < 5) return appAlert('A reason of at least 5 characters is required — it goes on the audit log.');

    const copy = status === 'paid'
      ? `Mark bill #${c.id} as paid. ${c.name} gets 33 days of Use n' Pay from today and a fresh bill opens, exactly as an automated payment would do.`
      : status === 'void'
        ? `Void bill #${c.id} for ${naira(c.total_amount)}. Nothing is charged and no time is granted.`
        : `Mark bill #${c.id} defaulted. ${c.name} drops back to Pay n' Go until it is settled.`;

    const ok = await appConfirm(copy, {
      title: `${status === 'paid' ? 'Settle' : status === 'void' ? 'Void' : 'Default'} this bill?`,
      okText: status === 'paid' ? 'Mark paid' : status === 'void' ? 'Void bill' : 'Mark defaulted',
      danger: status !== 'paid'
    });
    if (!ok) return;

    const { data, error } = await supabase.rpc('registrar_set_cycle_status', {
      p_cycle: Number(c.id), p_status: status, p_reference: reference, p_reason: reason
    });

    if (error) return appAlert(rpcError({ code: error.code, detail: error.message }, 'Could not update that bill: ' + error.message));
    if (!data || data.ok === false) return appAlert(rpcError(data));

    close();
    await this.reload();
  }
};
