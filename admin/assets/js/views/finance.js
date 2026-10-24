import { supabase } from '../config.js';
import { escapeHtml, naira, gliits, gp, empty, timeAgo, rpcError, TIER_LABEL, TXN_LABEL } from '../ui.js?v=1';

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
        ? 'registrar_overview() is not installed yet. Run sql/registrar_gliits.sql.'
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
    const plans = d.plans || {};
    const usage = d.usage || {};
    const topups = d.topups || {};
    const cfg = d.config || {};
    const l30 = d.ledger_30_days || {};
    const attempts = d.payment_attempts || {};

    const toolbar = `
      <div class="filters">
        <span class="muted small">Figures are live from the database. All amounts in Gliits (G).</span>
        <button class="btn-quiet btn-small" id="refresh-btn" style="margin-left: auto;">Refresh</button>
      </div>`;

    const stats = `
      <div class="stat-grid">
        ${stat('Wallet float', gliits(m.wallet_total), `${Number(m.with_wallet || 0).toLocaleString()} funded wallets`)}
        ${stat('Members', Number(m.total || 0).toLocaleString(), `${gp(m.gp_total)} in circulation`)}
        ${stat('Usage, all time', usage.total_minutes == null ? '—' : `${Number(usage.total_minutes).toLocaleString()} min`, usage.total_charged ? `${gliits(usage.total_charged)} charged` : '')}
        ${stat('Usage, last 30 days', usage.last_30_minutes == null ? '—' : `${Number(usage.last_30_minutes).toLocaleString()} min`, usage.last_30_charged ? `${gliits(usage.last_30_charged)} charged` : '')}
        ${stat('Creator payouts', usage.total_creator_credited == null ? '—' : gliits(usage.total_creator_credited), 'from heartbeat credits')}
        ${stat('Topups', Number(topups.total || 0).toLocaleString(), `${gliits(topups.total_gliits || 0)} total, ${Number(topups.pending || 0)} pending`)}
        ${stat('Ledger, 30 days', gliits(Number(l30.credits || 0) - Number(l30.debits || 0)), `${Number(l30.count || 0).toLocaleString()} entries`)}
      </div>`;

    // Plan distribution
    const planEntries = Object.entries(plans);
    const planTotal = Math.max(1, planEntries.reduce((sum, [, n]) => sum + Number(n || 0), 0));
    const planMix = planEntries.length ? `
      <div class="card">
        <div class="card-head">
          <div><div class="card-title">Plan mix</div>
          <div class="card-sub">Active plan on each member profile.</div></div>
        </div>
        ${barTable(planEntries.map(([plan, n]) => ({ plan, count: n, total: n / planTotal * 100 })), [
          { label: 'Plan', render: r => escapeHtml(TIER_LABEL[r.plan] || r.plan) },
          { label: 'Members', num: true, render: r => Number(r.count || 0).toLocaleString() },
          { label: 'Share', num: true, render: r => `${Math.round(Number(r.total) || 0)}%` }
        ])}
      </div>` : '';

    // Current config summary
    const configCard = cfg.per_minute ? `
      <div class="card">
        <div class="card-head">
          <div><div class="card-title">Current pricing</div>
          <div class="card-sub">Live from gliits_config. Change these from the Revenue &amp; Pricing screen.</div></div>
        </div>
        <dl class="kv">
          <dt>Per-minute charge</dt><dd>${gliits(cfg.per_minute)}/min</dd>
          <dt>Monthly plan</dt><dd>${gliits(cfg.plan_monthly)}/month</dd>
          <dt>Yearly plan</dt><dd>${gliits(cfg.plan_yearly)}/year</dd>
          <dt>Creator rate</dt><dd>${gliits(cfg.creator_rate)}/min (cap ${gliits(cfg.creator_cap)}/post/24h)</dd>
          <dt>Signup credit</dt><dd>${gliits(cfg.signup_credit)}</dd>
          <dt>Min topup</dt><dd>${gliits(cfg.min_topup)}</dd>
          <dt>Exchange rate</dt><dd>1 Naira = ${cfg.exchange_rate} G</dd>
          <dt>GP conversion</dt><dd>${cfg.gp_threshold} GP = ${gliits(cfg.gp_ratio)}</dd>
          <dt>Idle timeout</dt><dd>${cfg.idle_timeout} min</dd>
          ${cfg.updated_at ? `<dt>Last changed</dt><dd>${escapeHtml(timeAgo(cfg.updated_at))}</dd>` : ''}
        </dl>
      </div>` : '';

    // Topup summary
    const topupCard = `
      <div class="card">
        <div class="card-head">
          <div><div class="card-title">Topup summary</div>
          <div class="card-sub">All Gliits topups processed through the platform.</div></div>
        </div>
        ${topups.detail ? `<p class="muted small">${escapeHtml(topups.detail)}</p>` : `
        <dl class="kv">
          <dt>Total topups</dt><dd>${Number(topups.total || 0).toLocaleString()}</dd>
          <dt>Total Gliits credited</dt><dd>${gliits(topups.total_gliits || 0)}</dd>
          <dt>Total Naira received</dt><dd>₦${Number(topups.total_naira || 0).toLocaleString()}</dd>
          <dt>Pending verification</dt><dd>${Number(topups.pending || 0).toLocaleString()} (${gliits(topups.pending_gliits || 0)})</dd>
          <dt>Successful</dt><dd>${Number(topups.success || 0).toLocaleString()}</dd>
          <dt>Last 7 days</dt><dd>${Number(topups.last_7_days || 0).toLocaleString()}</dd>
          <dt>Funding intents</dt><dd>${attempts.total == null ? '—' : `${Number(attempts.total).toLocaleString()} total, ${Number(attempts.last_7_days || 0).toLocaleString()} in the last 7 days`}</dd>
        </dl>`}
      </div>`;

    // Transaction ledger breakdown
    const byType = (d.by_type || []).length ? `
      <div class="card">
        <div class="card-head">
          <div><div class="card-title">Where the money moved</div>
          <div class="card-sub">Every manual transaction entry, grouped by kind. Credits are positive, debits negative.</div></div>
        </div>
        ${barTable(d.by_type, [
          { label: 'Kind', render: r => escapeHtml(TXN_LABEL[r.type] || r.type || '—') },
          { label: 'Entries', num: true, render: r => Number(r.count || 0).toLocaleString() },
          { label: 'Net', num: true, render: r => `<span class="${r.total >= 0 ? 'amount-pos' : 'amount-neg'}">${gliits(r.total)}</span>` }
        ])}
      </div>` : '';

    // Schema mismatch warnings
    const warnings = [usage, topups, attempts]
      .filter(x => x && x.detail)
      .map(x => `<div class="card"><div class="card-body"><strong>Schema mismatch.</strong> ${escapeHtml(x.detail)}</div></div>`)
      .join('');

    return toolbar + stats + configCard + planMix + topupCard + byType + warnings;
  }
};
