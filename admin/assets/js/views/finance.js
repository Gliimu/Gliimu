import { supabase } from '../config.js';
import { escapeHtml, naira, gp, empty, timeAgo, rpcError, TIER_LABEL, TXN_LABEL } from '../ui.js';

function stat(label, value, note) {
  return `
    <div class="stat">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value">${value}</div>
      ${note ? `<div class="stat-note">${escapeHtml(note)}</div>` : ''}
    </div>`;
}

// A bar whose width is relative to the largest row, so the eye compares
// without reading every number.
function barTable(rows, columns) {
  const max = Math.max(1, ...rows.map(r => Math.abs(Number(r.total) || 0)));
  return `
    <div class="table-wrap"><table class="table">
      <thead><tr>${columns.map(c => `<th${c.num ? ' class="num"' : ''}>${escapeHtml(c.label)}</th>`).join('')}<th style="width: 32%;"></th></tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          ${columns.map(c => `<td${c.num ? ' class="num"' : ''}>${c.render(r)}</td>`).join('')}
          <td><div class="bar"><span style="width: ${Math.round(Math.abs(Number(r.total) || 0) / max * 100)}%;"></span></div></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
}

export default {
  template: `<div id="finance"><p class="loading">Loading finance...</p></div>`,

  async init() {
    await this.load();
  },

  async load() {
    const host = document.getElementById('finance');
    const { data, error } = await supabase.rpc('registrar_overview');

    if (error) {
      host.innerHTML = empty(error.code === '42883'
        ? 'registrar_overview() is not installed yet. Run sql/registrar.sql.'
        : `Could not load finance: ${error.message}`);
      return;
    }
    if (!data || data.ok === false) {
      host.innerHTML = empty(rpcError(data, 'Could not load finance.'));
      return;
    }

    host.innerHTML = this.render(data);
    host.querySelector('#refresh-btn')?.addEventListener('click', () => this.load());
  },

  render(d) {
    const m = d.members || {};
    const c = d.cycles || {};
    const l30 = d.ledger_30_days || {};
    const lib = d.library || {};
    const payouts = d.creator_payouts || {};
    const attempts = d.payment_attempts || {};

    const toolbar = `
      <div class="filters">
        <span class="muted small">Figures are live from the database.</span>
        <button class="btn-quiet btn-small" id="refresh-btn" style="margin-left: auto;">Refresh</button>
      </div>`;

    const stats = `
      <div class="stat-grid">
        ${stat('Wallet float', naira(m.wallet_total), `${Number(m.with_wallet || 0).toLocaleString()} funded wallets`)}
        ${stat('Members', Number(m.total || 0).toLocaleString(), `${gp(m.gp_total)} in circulation`)}
        ${stat('Collected', naira(c.collected), `${Number(c.paid || 0).toLocaleString()} settled bills`)}
        ${stat('Outstanding', naira(c.billed_value), `${Number(c.open || 0) + Number(c.processing || 0)} unpaid bills`)}
        ${stat('Defaulted', naira(c.defaulted_value), `${Number(c.defaulted || 0).toLocaleString()} bills`)}
        ${stat('Library sales', lib.sales == null ? '—' : naira(lib.total), lib.sales == null ? '' : `${Number(lib.sales).toLocaleString()} unlocks`)}
        ${stat('Creator payouts', naira(payouts.total), `${Number(payouts.payouts || 0).toLocaleString()} shares`)}
        ${stat('Ledger, 30 days', naira(Number(l30.credits || 0) - Number(l30.debits || 0)), `${Number(l30.count || 0).toLocaleString()} entries`)}
      </div>`;

    const attention = (d.attention || []).length ? `
      <div class="card">
        <div class="card-head">
          <div><div class="card-title">Needs a decision</div>
          <div class="card-sub">Bills past or near their due date. Open Bills to settle or void one.</div></div>
          <div class="card-actions"><a class="btn-quiet btn-small" href="#/bills">Open bills</a></div>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Member</th><th>Status</th><th class="num">Amount</th><th>Due</th></tr></thead>
          <tbody>${d.attention.map(a => `
            <tr>
              <td>${escapeHtml(a.name)}</td>
              <td>${escapeHtml(a.status)}</td>
              <td class="num">${naira(a.total)}</td>
              <td>${a.due_at ? escapeHtml(timeAgo(a.due_at)) : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>` : '';

    const byType = (d.by_type || []).length ? `
      <div class="card">
        <div class="card-head">
          <div><div class="card-title">Where the money moved</div>
          <div class="card-sub">Every wallet ledger entry ever recorded, grouped by kind. Credits are positive, debits negative.</div></div>
        </div>
        ${barTable(d.by_type, [
          { label: 'Kind', render: r => escapeHtml(TXN_LABEL[r.type] || r.type || '—') },
          { label: 'Entries', num: true, render: r => Number(r.count || 0).toLocaleString() },
          { label: 'Net', num: true, render: r => `<span class="${r.total >= 0 ? 'amount-pos' : 'amount-neg'}">${naira(r.total)}</span>` }
        ])}
      </div>` : '';

    const tiers = Object.entries(d.tiers || {});
    const tierTotal = Math.max(1, tiers.reduce((sum, [, n]) => sum + Number(n || 0), 0));
    const planMix = tiers.length ? `
      <div class="card">
        <div class="card-head">
          <div><div class="card-title">Plan mix</div>
          <div class="card-sub">Stored tier on each profile.</div></div>
        </div>
        ${barTable(tiers.map(([tier, n]) => ({ tier, count: n, total: n / tierTotal * 100 })), [
          { label: 'Plan', render: r => escapeHtml(TIER_LABEL[r.tier] || r.tier) },
          { label: 'Members', num: true, render: r => Number(r.count || 0).toLocaleString() },
          { label: 'Share', num: true, render: r => `${Math.round(Number(r.total) || 0)}%` }
        ])}
      </div>` : '';

    const billSummary = `
      <div class="card">
        <div class="card-head">
          <div><div class="card-title">Use n' Pay bills</div>
          <div class="card-sub">Monthly usage cycles. ${Number(c.due_soon || 0).toLocaleString()} due within three days.</div></div>
        </div>
        <dl class="kv">
          <dt>Open</dt><dd>${Number(c.open || 0).toLocaleString()}</dd>
          <dt>Processing</dt><dd>${Number(c.processing || 0).toLocaleString()}</dd>
          <dt>Paid</dt><dd>${Number(c.paid || 0).toLocaleString()}</dd>
          <dt>Defaulted</dt><dd>${Number(c.defaulted || 0).toLocaleString()}</dd>
          <dt>Funding intents</dt><dd>${attempts.total == null ? '—' : `${Number(attempts.total).toLocaleString()} total, ${Number(attempts.last_7_days || 0).toLocaleString()} in the last 7 days`}</dd>
        </dl>
      </div>`;

    // A legacy table whose shape this build did not expect still leaves the
    // rest of the page usable, so say so where the number should be.
    const warnings = [lib, attempts]
      .filter(x => x && x.detail)
      .map(x => `<div class="card"><div class="card-body"><strong>Schema mismatch.</strong> ${escapeHtml(x.detail)}</div></div>`)
      .join('');

    return toolbar + stats + warnings + attention + byType + planMix + billSummary;
  }
};
