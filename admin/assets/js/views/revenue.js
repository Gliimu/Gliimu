import { supabase } from '../config.js';
import { escapeHtml, gliits, badge, empty, timeAgo, rpcError } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';

const TABS = [
  { id: 'library', label: 'Library sales' },
  { id: 'creators', label: 'Creator payouts' },
  { id: 'charges', label: 'Usage charges' },
  { id: 'config', label: 'Config' },
  { id: 'funding', label: 'Funding queue' },
  { id: 'audit', label: 'Audit log' }
];

const CONFIG_FIELDS = [
  { key: 'exchange_rate_naira_to_gliits', label: 'Exchange rate', step: '0.01', unit: 'G per ₦1', help: 'How many Gliits a user gets for 1 Naira. Default is 1.0 (G1 = ₦1). Lower = more expensive, higher = cheaper.' },
  { key: 'per_minute_rate_gliits', label: 'Per-minute charge', step: '0.5', unit: 'G/min' },
  { key: 'plan_monthly_price_gliits', label: 'Monthly plan price', step: '100', unit: 'G/month' },
  { key: 'plan_yearly_price_gliits', label: 'Yearly plan price', step: '100', unit: 'G/year' },
  { key: 'signup_credit_gliits', label: 'Signup credit', step: '10', unit: 'G' },
  { key: 'min_topup_gliits', label: 'Minimum topup', step: '10', unit: 'G' },
  { key: 'creator_rate_per_minute', label: 'Creator rate', step: '0.1', unit: 'G/min' },
  { key: 'creator_cap_per_post_session', label: 'Creator cap per post/24h', step: '1', unit: 'G' },
  { key: 'idle_timeout_minutes', label: 'Idle timeout', step: '1', unit: 'min' },
  { key: 'gp_to_gliits_ratio', label: 'GP→G ratio', step: '1', unit: 'G per conversion' },
  { key: 'gp_to_gliits_threshold', label: 'GP→G threshold', step: '10', unit: 'GP' }
];

export default {
  template: `
    <div class="filters">
      ${TABS.map((t, i) => `<button class="filter-btn${i === 0 ? ' active' : ''}" data-tab="${t.id}">${escapeHtml(t.label)}</button>`).join('')}
    </div>
    <div id="revenue-pane"><p class="loading">Loading...</p></div>
  `,

  async init() {
    this.tab = 'library';
    this.cache = {};

    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.tab = btn.dataset.tab;
        this.render();
      });
    });

    await this.render();
  },

  async render() {
    const pane = document.getElementById('revenue-pane');
    const key = ['library', 'creators', 'charges'].includes(this.tab) ? 'revenue' : this.tab;

    if (!this.cache[key]) {
      pane.innerHTML = '<p class="loading">Loading...</p>';
      this.cache[key] = await this.fetchFor(key);
    }

    if (this.cache[key].failed) {
      pane.innerHTML = empty(this.cache[key].failed);
      return;
    }

    const html = {
      library: () => this.libraryHtml(this.cache.revenue),
      creators: () => this.creatorsHtml(this.cache.revenue),
      charges: () => this.chargesHtml(this.cache.revenue),
      config: () => this.configHtml(this.cache.config),
      funding: () => this.fundingHtml(this.cache.funding),
      audit: () => this.auditHtml(this.cache.audit)
    }[this.tab]();

    pane.innerHTML = html;
    if (this.tab === 'config') this.wireConfig(pane);
    if (this.tab === 'funding') this.wireFunding(pane);
  },

  async fetchFor(key) {
    const unwrap = ({ data, error }) =>
      (error || !data || data.ok === false)
        ? { failed: error ? error.message : rpcError(data) }
        : data;

    if (key === 'revenue') return unwrap(await supabase.rpc('registrar_revenue', { p_limit: 200 }));
    if (key === 'audit') return unwrap(await supabase.rpc('registrar_audit', { p_limit: 200 }));

    if (key === 'config') {
      const { data, error } = await supabase.from('gliits_config')
        .select('*').eq('id', 1).single();
      return error ? { failed: error.message } : { config: data };
    }

    if (key === 'funding') {
      const [queue, attempts] = await Promise.all([
        supabase.rpc('registrar_pending_topups', { p_limit: 200 }),
        supabase.rpc('registrar_payment_attempts', { p_limit: 200 })
      ]);
      const q = unwrap(queue);
      if (q.failed) return q;
      const a = unwrap(attempts);
      return { ...q, attempts: a.failed ? null : a.attempts, attemptsFailed: a.failed || null };
    }
  },

  libraryHtml(d) {
    const owners = d.owners || [];
    const items = d.items || [];
    const total = owners.reduce((sum, o) => sum + Number(o.revenue || 0), 0);

    return `
      <div class="stat-grid">
        <div class="stat"><div class="stat-label">Library revenue</div><div class="stat-value">${gliits(total)}</div>
          <div class="stat-note">${owners.length} attributed owners</div></div>
        <div class="stat"><div class="stat-label">Items on the shelf</div><div class="stat-value">${items.length}</div></div>
      </div>

      <div class="card">
        <div class="card-head"><div><div class="card-title">By owner</div>
        <div class="card-sub">Sales are counted from the purchases table at the item's current price.</div></div></div>
        ${owners.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Owner</th><th class="num">Items</th><th class="num">Sales</th><th class="num">Revenue</th></tr></thead>
            <tbody>${owners.map(o => `
              <tr>
                <td>${escapeHtml(o.owner)}${o.owner_id ? '' : '<div class="muted small">no owner stamped</div>'}</td>
                <td class="num">${Number(o.items || 0)}</td>
                <td class="num">${Number(o.sales || 0)}</td>
                <td class="num">${gliits(o.revenue)}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : empty('Nothing on the shelf yet.')}
      </div>

      <div class="card">
        <div class="card-head"><div><div class="card-title">By item</div>
        <div class="card-sub">Top ${items.length} by revenue.</div></div></div>
        ${items.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Title</th><th>Format</th><th class="num">Price</th><th class="num">Sales</th><th class="num">Revenue</th></tr></thead>
            <tbody>${items.map(i => `
              <tr>
                <td>${escapeHtml(i.title || '—')}<div class="muted small">${escapeHtml(i.owner || '')}</div></td>
                <td>${badge(i.type || '—', i.type === 'bundle' ? 'warning' : 'brand')}</td>
                <td class="num">${gliits(i.price)}</td>
                <td class="num">${Number(i.sales || 0)}</td>
                <td class="num">${gliits(i.revenue)}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : empty('No library items yet.')}
      </div>`;
  },

  creatorsHtml(d) {
    const rows = d.creators || [];
    const total = rows.reduce((sum, r) => sum + Number(r.total || 0), 0);

    return `
      <div class="stat-grid">
        <div class="stat"><div class="stat-label">Paid out to creators</div><div class="stat-value">${gliits(total)}</div>
          <div class="stat-note">From heartbeat usage — G1.5/min capped at G30/post/24h</div></div>
        <div class="stat"><div class="stat-label">Creators earning</div><div class="stat-value">${rows.length}</div></div>
      </div>
      <div class="card">
        <div class="card-head"><div><div class="card-title">By creator</div></div></div>
        ${rows.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Creator</th><th class="num">Minutes</th><th class="num">Total</th></tr></thead>
            <tbody>${rows.map(r => `
              <tr><td>${escapeHtml(r.creator)}</td><td class="num">${Number(r.events || 0).toLocaleString()}</td><td class="num amount-pos">${gliits(r.total)}</td></tr>`).join('')}
            </tbody>
          </table></div>` : empty('No creator payouts recorded yet.')}
      </div>`;
  },

  chargesHtml(d) {
    const rows = d.usage || [];

    return `
      <div class="card">
        <div class="card-head"><div><div class="card-title">Usage charges</div>
        <div class="card-sub">Every minute the heartbeat engine has billed, from gliits_usage.</div></div></div>
        ${rows.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Charge</th><th class="num">Minutes</th><th class="num">Last 30 days</th><th class="num">All time</th></tr></thead>
            <tbody>${rows.map(r => `
              <tr>
                <td class="mono">${escapeHtml(r.event_type)}</td>
                <td class="num">${Number(r.events || 0).toLocaleString()}</td>
                <td class="num">${gliits(r.last_30_days)}</td>
                <td class="num">${gliits(r.total)}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : empty('No usage recorded yet.')}
      </div>`;
  },

  configHtml(d) {
    const cfg = d.config || {};

    return `
      <div class="card">
        <div class="card-head"><div><div class="card-title">Gliits configuration</div>
        <div class="card-sub">Every number that drives the billing engine. Changes apply immediately to the next heartbeat or topup. Every change is written to the audit log.</div></div></div>
        <div class="form-group">
          <label for="config-reason">Reason for the next change (required)</label>
          <input type="text" id="config-reason" class="input" placeholder="e.g. Launch pricing review, 2026-10">
        </div>
        ${CONFIG_FIELDS.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Setting</th><th class="num">Value</th><th>Changed</th><th></th></tr></thead>
            <tbody>${CONFIG_FIELDS.map(f => {
              const val = cfg[f.key];
              return `
              <tr data-config="${f.key}">
                <td>${escapeHtml(f.label)}${f.unit ? `<div class="muted small">${escapeHtml(f.unit)}</div>` : ''}${f.help ? `<div class="muted small" style="margin-top: 4px; font-size: 0.85em;">${escapeHtml(f.help)}</div>` : ''}</td>
                <td class="num"><input type="number" min="0" step="${f.step}" class="input" style="width: 130px; padding: 6px 10px;" data-value="${f.key}" value="${val != null ? Number(val || 0) : 0}"></td>
                <td class="muted small">${cfg.updated_at ? escapeHtml(timeAgo(cfg.updated_at)) : '—'}</td>
                <td style="text-align: right;"><button class="btn-quiet btn-small" data-save-config="${f.key}">Save</button></td>
              </tr>`;
            }).join('')}
            </tbody>
          </table></div>` : empty('No configuration found — run sql/gliits_billing.sql.')}
      </div>`;
  },

  wireConfig(pane) {
    pane.querySelectorAll('[data-save-config]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.saveConfig;
        const field = CONFIG_FIELDS.find(f => f.key === key);
        const value = Number(pane.querySelector(`[data-value="${key}"]`).value);
        const reason = pane.querySelector('#config-reason').value.trim();

        if (!Number.isFinite(value) || value < 0) return appAlert('Enter a value of zero or more.');
        if (reason.length < 5) return appAlert('Write a reason of at least 5 characters — it goes on the audit log.');

        const ok = await appConfirm(`${field.label} will be set to ${value}. The change applies immediately.`, {
          title: 'Change this setting?', okText: 'Save'
        });
        if (!ok) return;

        const { data, error } = await supabase.rpc('registrar_set_config', { p_key: key, p_value: value, p_reason: reason });
        if (error) return appAlert(rpcError({ code: error.code, detail: error.message }, 'Could not save: ' + error.message));
        if (!data || data.ok === false) return appAlert(rpcError(data));

        const typed = pane.querySelector('#config-reason').value;
        this.cache.config = null;
        await this.render();
        const again = document.getElementById('config-reason');
        if (again) again.value = typed;
        await appAlert(`${field.label} is now ${value} (was ${data.previous}).`);
      });
    });
  },

  fundingHtml(d) {
    const rows = d.rows || [];
    const attempts = d.attempts || [];
    const claimed = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

    return `
      <div class="stat-grid">
        <div class="stat"><div class="stat-label">Awaiting verification</div>
          <div class="stat-value">${Number(d.total || rows.length)}</div>
          <div class="stat-note">${gliits(claimed)} claimed</div></div>
      </div>

      <div class="card">
        <div class="card-head"><div><div class="card-title">Bank transfers to verify</div>
        <div class="card-sub">Match the reference against the bank statement, then press Verify. The amount is what the member claimed — correct it in the row if the bank says otherwise. You are recorded as the approver.</div></div></div>
        <div class="form-group">
          <label for="funding-reason">Reason (optional to verify, required to reject)</label>
          <input type="text" id="funding-reason" class="input" placeholder="e.g. Matches the Opay statement, 07/10">
        </div>
        ${rows.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Waiting</th><th>Member</th><th>Reference</th><th class="num">Credit (G)</th><th class="num">Naira</th><th></th></tr></thead>
            <tbody>${rows.map(r => `
              <tr data-txn="${escapeHtml(r.id)}" data-name="${escapeHtml(r.name)}">
                <td class="muted small" style="white-space: nowrap;">${escapeHtml(timeAgo(r.created_at))}<div>${escapeHtml(new Date(r.created_at).toLocaleString())}</div></td>
                <td>${escapeHtml(r.name)}${r.username ? `<div class="muted small">@${escapeHtml(r.username)}</div>` : ''}</td>
                <td class="mono small">${escapeHtml(r.reference || '—')}</td>
                <td class="num"><input type="number" min="1" step="1" class="input" style="width: 100px; padding: 6px 10px;" data-amount="${escapeHtml(r.id)}" value="${Number(r.amount || 0)}"></td>
                <td class="num muted small">${r.amount_naira ? `₦${Number(r.amount_naira).toLocaleString()}` : '—'}</td>
                <td style="text-align: right; white-space: nowrap;">
                  <button class="btn-primary btn-small" data-verify="${escapeHtml(r.id)}">Verify</button>
                  <button class="btn-quiet btn-small" data-reject="${escapeHtml(r.id)}">Reject</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : empty('Nothing waiting — every claimed bank transfer has been settled.')}
      </div>

      <div class="card">
        <div class="card-head"><div><div class="card-title">Funding intents</div>
        <div class="card-sub">Every time a member opened the add-fund flow. Paystack rows credit themselves, so only bank_transfer needs a person.</div></div></div>
        ${d.attemptsFailed ? empty(d.attemptsFailed) : attempts.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>When</th><th>Member</th><th>Method</th></tr></thead>
            <tbody>${attempts.map(a => `
              <tr>
                <td class="muted small" style="white-space: nowrap;">${escapeHtml(timeAgo(a.created_at))}<div>${escapeHtml(new Date(a.created_at).toLocaleString())}</div></td>
                <td>${escapeHtml(a.name)}${a.username ? `<div class="muted small">@${escapeHtml(a.username)}</div>` : ''}</td>
                <td>${badge(a.method, a.method === 'bank_transfer' ? 'warning' : 'neutral')}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : empty('No funding intents recorded yet.')}
      </div>`;
  },

  wireFunding(pane) {
    const reload = async (message) => {
      const typed = pane.querySelector('#funding-reason')?.value || '';
      this.cache.funding = null;
      await this.render();
      const again = document.getElementById('funding-reason');
      if (again) again.value = typed;
      await appAlert(message);
    };

    const readReason = () => pane.querySelector('#funding-reason').value.trim();

    pane.querySelectorAll('[data-verify]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.verify;
        const row = pane.querySelector(`[data-txn="${id}"]`);
        const amount = Number(pane.querySelector(`[data-amount="${id}"]`).value);
        if (!Number.isFinite(amount) || amount <= 0) return appAlert('Enter an amount above zero.');

        const ok = await appConfirm(
          `${row.dataset.name} will be credited ${gliits(amount)}. You will be recorded as the approver.`,
          { title: 'Verify this transfer?', okText: 'Credit wallet' }
        );
        if (!ok) return;

        const { data, error } = await supabase.rpc('registrar_verify_topup', {
          p_txn: id, p_amount: amount, p_reason: readReason() || null
        });
        if (error) return appAlert(rpcError({ code: error.code, detail: error.message }, 'Could not verify: ' + error.message));
        if (!data || data.ok === false) return appAlert(rpcError(data));

        await reload(`${row.dataset.name} now has ${gliits(data.balance)}.`);
      });
    });

    pane.querySelectorAll('[data-reject]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.reject;
        const row = pane.querySelector(`[data-txn="${id}"]`);
        const reason = readReason();
        if (reason.length < 5) {
          return appAlert('Write a reason of at least 5 characters — it goes on the audit log.');
        }

        const ok = await appConfirm(
          `${row.dataset.name}'s claim will be marked failed. Nothing is credited.`,
          { title: 'Reject this transfer?', okText: 'Reject', danger: true }
        );
        if (!ok) return;

        const { data, error } = await supabase.rpc('registrar_reject_topup', { p_txn: id, p_reason: reason });
        if (error) return appAlert(rpcError({ code: error.code, detail: error.message }, 'Could not reject: ' + error.message));
        if (!data || data.ok === false) return appAlert(rpcError(data));

        await reload(`Rejected — ${row.dataset.name} was not credited.`);
      });
    });
  },

  auditHtml(d) {
    const rows = d.adjustments || [];

    return `
      <div class="card">
        <div class="card-head"><div><div class="card-title">Audit log</div>
        <div class="card-sub">Every manual money or config change made from this app, newest first.</div></div></div>
        ${rows.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>When</th><th>Admin</th><th>Member</th><th>Kind</th><th class="num">Value</th><th>Reason</th></tr></thead>
            <tbody>${rows.map(a => `
              <tr>
                <td class="muted small" style="white-space: nowrap;">${escapeHtml(timeAgo(a.created_at))}</td>
                <td>${escapeHtml(a.admin)}</td>
                <td>${escapeHtml(a.member)}</td>
                <td>${badge(a.kind, a.kind === 'wallet' ? 'brand' : 'neutral')}</td>
                <td class="num">${a.kind === 'subscription' ? `${Number(a.amount) > 0 ? '+' : ''}${a.amount}d` : gliits(a.amount)}</td>
                <td class="small">${escapeHtml(a.reason)}${a.reference ? `<div class="muted small mono">${escapeHtml(a.reference)}</div>` : ''}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : empty('No manual changes yet.')}
      </div>`;
  }
};
