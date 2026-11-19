import { supabase, API_BASE_URL } from '../config.js';
import { escapeHtml, gliits, badge, empty, timeAgo, rpcError } from '../ui.js?v=4';
import { appAlert, appConfirm } from '../dialog.js';

const TABS = [
  { id: 'library', label: 'Library sales' },
  { id: 'creators', label: 'Creator payouts' },
  { id: 'charges', label: 'Usage charges' },
  { id: 'config', label: 'Config' },
  { id: 'payouts', label: 'Payouts' },
  { id: 'funding', label: 'Funding intents' },
  { id: 'audit', label: 'Audit log' }
];

const GUARDED_KEYS = [
  'exchange_rate_naira_to_gliits', 'min_topup_gliits',
  'min_withdrawal_gliits', 'max_withdrawal_gliits'
];

const CONFIG_FIELDS = [
  { key: 'exchange_rate_naira_to_gliits', label: 'Exchange rate', step: '1', unit: '₦ per token', help: 'The naira one token is worth, and the only bridge between tokens and money. Everything multiplies by this figure in the same direction: at rate 10 a member pays ₦1,000 for 100 tokens, and a 100-token payout sends ₦1,000. Raising it makes the platform dearer and every existing balance worth more.' },
  { key: 'per_minute_rate_gliits', label: 'Per-minute charge', step: '0.5', unit: 'tokens/min' },
  { key: 'plan_monthly_price_gliits', label: 'Monthly plan price', step: '100', unit: 'tokens/month' },
  { key: 'plan_yearly_price_gliits', label: 'Yearly plan price', step: '100', unit: 'tokens/year' },
  { key: 'signup_credit_gliits', label: 'Signup credit', step: '10', unit: 'tokens' },
  { key: 'min_topup_gliits', label: 'Minimum topup', step: '10', unit: 'tokens' },
  { key: 'min_withdrawal_gliits', label: 'Minimum withdrawal', step: '500', unit: 'tokens', help: 'The threshold a member must reach before tokens can leave the platform.' },
  { key: 'max_withdrawal_gliits', label: 'Maximum withdrawal', step: '1000', unit: 'tokens per payout', help: 'Ceiling for one payout. It raises the per-request limit, not the member total.' },
  { key: 'withdrawal_hold_hours', label: 'Top-up hold', step: '1', unit: 'hours', help: 'How long after a top-up a payout can be requested or sent. Anti-fraud window.' },
  { key: 'creator_rate_per_minute', label: 'Creator rate', step: '0.1', unit: 'tokens/min' },
  { key: 'creator_cap_per_post_session', label: 'Creator cap per post/24h', step: '1', unit: 'tokens' },
  { key: 'idle_timeout_minutes', label: 'Idle timeout', step: '1', unit: 'min' },
  { key: 'gp_to_gliits_ratio', label: 'GP→token ratio', step: '1', unit: 'tokens per conversion' },
  { key: 'gp_to_gliits_threshold', label: 'GP→token threshold', step: '10', unit: 'GP' }
];

function nairaText(value) {
  const num = Number(value || 0);
  return `₦${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// Every figure the engine can be asked about, converted through the exchange
// rate with the same rounding the server and the payout RPC actually use.
function moneyPreview(cfg) {
  const rate = Number(cfg.exchange_rate_naira_to_gliits || 0);
  const num = (key) => Number(cfg[key] || 0);

  if (!(rate > 0)) {
    return `
      <div class="card">
        <div class="card-head"><div><div class="card-title">Naira impact</div>
        <div class="card-sub">The exchange rate has to be above zero before anything here can be worked out.</div></div></div>
      </div>`;
  }

  const topup = num('min_topup_gliits');
  const perMin = num('per_minute_rate_gliits');
  const monthly = num('plan_monthly_price_gliits');
  const yearly = num('plan_yearly_price_gliits');
  const signup = num('signup_credit_gliits');
  const creator = num('creator_rate_per_minute');
  const cap = num('creator_cap_per_post_session');
  const minOut = num('min_withdrawal_gliits');
  const maxOut = num('max_withdrawal_gliits');

  const rows = [
    ['One token is worth', `${nairaText(rate)} per token`],
    ['Smallest top-up', `${gliits(topup)} charges ${nairaText(Math.ceil(topup * rate))}${topup * rate < 100 ? ' — below ₦100, check the card minimum your Paystack account accepts' : ''}`],
    ['One minute of reading', `${gliits(perMin)} = ${nairaText(perMin * rate)} a minute`],
    ['Monthly plan', `${gliits(monthly)} = ${nairaText(monthly * rate)}`],
    ['Yearly plan', `${gliits(yearly)} = ${nairaText(yearly * rate)}`],
    ['Signup credit', `${gliits(signup)} = ${nairaText(signup * rate)} of free reading`],
    ['A creator earns', `${gliits(creator)}/min = ${nairaText(creator * rate)} a minute, capped at ${gliits(cap)} (${nairaText(cap * rate)}) per post per 24h`],
    ['Smallest payout', `${gliits(minOut)} sends ${nairaText(minOut * rate)}`],
    ['Largest payout', `${gliits(maxOut)} sends ${nairaText(maxOut * rate)}`]
  ];

  return `
    <div class="card">
      <div class="card-head"><div><div class="card-title">Naira impact</div>
      <div class="card-sub">Worked out live from the boxes below using the engine's own rule: every price multiplies by the exchange rate. A top-up rounds up to the next whole naira; a payout does not.</div></div></div>
      <dl class="kv">${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl>
    </div>`;
}

// What the database guard says about a value that has not been saved yet.
function guardNote(out) {
  if (!out || typeof out !== 'object') return '';
  if (out.ok !== true) {
    return `${badge('Blocked', 'danger')}<div class="muted small" style="margin-top: 4px;">${escapeHtml(out.hint || out.code || 'This value will be rejected.')}</div>`;
  }
  const warns = Array.isArray(out.warnings) ? out.warnings : [];
  if (!warns.length) return badge('Accepted', 'success');
  return warns.map((w) => `${badge('Saved, but check', 'warning')}<div class="muted small" style="margin-top: 4px;">${escapeHtml(w.hint || '')}</div>`).join('');
}

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
      payouts: () => this.payoutsHtml(this.cache.payouts),
      funding: () => this.fundingHtml(this.cache.funding),
      audit: () => this.auditHtml(this.cache.audit)
    }[this.tab]();

    pane.innerHTML = html;
    if (this.tab === 'config') this.wireConfig(pane);
    if (this.tab === 'payouts') this.wirePayouts(pane);
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
      const a = unwrap(await supabase.rpc('registrar_payment_attempts', { p_limit: 200 }));
      return a.failed ? { attempts: [], attemptsFailed: a.failed } : a;
    }

    if (key === 'payouts') {
      return unwrap(await supabase.rpc('registrar_withdrawals', { p_status: null, p_limit: 200 }));
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
          <div class="stat-note">From heartbeat usage — 1.5 tokens/min capped at 30 tokens/post/24h</div></div>
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
      <div id="money-preview">${moneyPreview(cfg)}</div>
      <div class="card">
        <div class="card-head"><div><div class="card-title">Token configuration</div>
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
              const guarded = GUARDED_KEYS.includes(f.key);
              return `
              <tr data-config="${f.key}">
                <td>${escapeHtml(f.label)}${f.unit ? `<div class="muted small">${escapeHtml(f.unit)}</div>` : ''}${f.help ? `<div class="muted small" style="margin-top: 4px; font-size: 0.85em;">${escapeHtml(f.help)}</div>` : ''}${guarded ? `<div data-guard="${f.key}" style="margin-top: 6px;"></div>` : ''}</td>
                <td class="num"><input type="number" min="0" step="${f.step}" class="input" style="width: 130px; padding: 6px 10px;" data-value="${f.key}" value="${val != null ? Number(val || 0) : 0}"></td>
                <td class="muted small">${cfg.updated_at ? escapeHtml(timeAgo(cfg.updated_at)) : '—'}</td>
                <td style="text-align: right;"><button class="btn-quiet btn-small" data-save-config="${f.key}">Save</button></td>
              </tr>`;
            }).join('')}
            </tbody>
          </table></div>` : empty('No configuration found — run sql/gliits_billing.sql.')}
      </div>`;
  },

  readForm(pane) {
    const out = {};
    CONFIG_FIELDS.forEach((f) => {
      const el = pane.querySelector(`[data-value="${f.key}"]`);
      out[f.key] = el ? Number(el.value) : 0;
    });
    return out;
  },

  refreshPreview(pane) {
    const host = pane.querySelector('#money-preview');
    if (host) host.innerHTML = moneyPreview(this.readForm(pane));
  },

  async checkGuard(pane, key) {
    const el = pane.querySelector(`[data-value="${key}"]`);
    const slot = pane.querySelector(`[data-guard="${key}"]`);
    if (!el || !slot) return;
    const value = Number(el.value);
    if (!Number.isFinite(value)) { slot.innerHTML = ''; return; }

    const { data, error } = await supabase.rpc('gliits_config_guard', { p_key: key, p_value: value });
    if (Number(el.value) !== value) return;
    slot.innerHTML = error ? '' : guardNote(data);
  },

  wireConfig(pane) {
    let previewTimer = null;
    let guardTimer = null;

    pane.querySelectorAll('[data-value]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.value;
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => this.refreshPreview(pane), 120);

        if (!GUARDED_KEYS.includes(key)) return;
        clearTimeout(guardTimer);
        guardTimer = setTimeout(() => {
          if (pane.isConnected) this.checkGuard(pane, key);
        }, 420);
      });
    });

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

        const warns = Array.isArray(data.warnings) ? data.warnings : [];
        const message = `${field.label} is now ${value} (was ${data.previous}).`;
        await appAlert(warns.length
          ? `${message}\n\nThe pricing guard added a note:\n${warns.map(w => w.hint).join('\n')}`
          : message);
      });
    });
  },

  payoutsHtml(d) {
    const rows = d.rows || [];
    const totals = d.totals || {};
    const isOpen = (r) => r.status === 'requested' || r.status === 'processing';
    const open = rows.filter(isOpen);
    const paid = rows.filter(r => r.status === 'paid');
    const blocked = open.filter(r => r.name_match !== true);
    const paidNaira = paid.reduce((s, r) => s + Number(r.amount_naira || 0), 0);
    const filter = this.payoutFilter || 'open';

    const shown = filter === 'open' ? open
      : filter === 'paid' ? paid
      : filter === 'blocked' ? blocked
      : rows;

    const chips = [
      { id: 'open', label: `Waiting (${open.length})` },
      { id: 'blocked', label: `Name check (${blocked.length})` },
      { id: 'paid', label: `Paid (${paid.length})` },
      { id: 'all', label: `All (${rows.length})` }
    ];

    return `
      <div class="stat-grid">
        <div class="stat"><div class="stat-label">Owed to members</div>
          <div class="stat-value">${gliits(Number(d.pending_gliits || 0))}</div>
          <div class="stat-note">${open.length} payout${open.length === 1 ? '' : 's'} not settled</div></div>
        <div class="stat"><div class="stat-label">Paid out (last ${rows.length})</div>
          <div class="stat-value">${paid.length}</div>
          <div class="stat-note">${paidNaira ? `₦${paidNaira.toLocaleString()}` : 'Nothing paid yet'}</div></div>
        <div class="stat"><div class="stat-label">Payout rules</div>
          <div class="stat-value">${gliits(Number(d.min_withdrawal || 0))}</div>
          <div class="stat-note">Max ${gliits(Number(d.max_withdrawal || 0))} · ${Number(d.hold_hours || 0)}h top-up hold</div></div>
      </div>

      <div class="card">
        <div class="card-head"><div><div class="card-title">Payout queue</div>
        <div class="card-sub">Gliims already left the wallet when the member asked. Send pays through Paystack; Paid by hand records a transfer you settled outside the app. Reject returns the Gliims.</div></div></div>

        <div class="filters" style="margin-bottom: 12px;">
          ${chips.map(c => `<button class="filter-btn${filter === c.id ? ' active' : ''}" data-payout-filter="${c.id}">${escapeHtml(c.label)}</button>`).join('')}
        </div>

        <div class="form-group">
          <label for="payout-note">Receipt or reason (written to the audit log)</label>
          <input type="text" id="payout-note" class="input" value="Paid by hand from the Paystack dashboard">
        </div>

        ${shown.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Asked</th><th>Member</th><th class="num">Tokens</th><th>Bank account</th><th>State</th><th></th></tr></thead>
            <tbody>${shown.map(r => this.payoutRowHtml(r)).join('')}</tbody>
          </table></div>` : empty(filter === 'open' ? 'Nothing waiting — every payout has been settled.' : 'Nothing in this view.')}
      </div>

      ${totals.failed ? `<div class="card"><div class="card-head"><div><div class="card-title">Failed at the bank</div>
        <div class="card-sub">${Number(totals.failed)} transfer${Number(totals.failed) === 1 ? '' : 's'} came back. The tokens went back to the wallet on their own.</div></div></div></div>` : ''}`;
  },

  payoutRowHtml(r) {
    const id = escapeHtml(r.id);
    const open = r.status === 'requested' || r.status === 'processing';
    const resolvable = Boolean(r.account_name);
    const sendable = r.status === 'requested' && r.name_match === true && resolvable;

    let identity = '';
    if (!resolvable) identity = '<div class="muted small">Account not resolved with the bank yet</div>';
    else if (r.name_match !== true) identity = `<div class="muted small">Bank says: ${escapeHtml(r.account_name)}</div>`;

    const state = {
      requested: badge('Waiting', 'warning'),
      processing: badge('At Paystack', 'brand'),
      paid: badge('Paid', 'success'),
      failed: badge('Failed', 'danger'),
      rejected: badge('Rejected', 'neutral'),
      cancelled: badge('Cancelled', 'neutral')
    }[r.status] || escapeHtml(r.status);

    const trail = r.status === 'failed' && r.failure_reason
      ? `<div class="muted small">${escapeHtml(r.failure_reason)}</div>`
      : r.reviewer ? `<div class="muted small">By ${escapeHtml(r.reviewer)}</div>` : '';

    const buttons = []
      if (sendable) buttons.push(`<button class="btn-primary btn-small" data-send="${id}">Send</button>`);
      if (r.status === 'requested' && !sendable) buttons.push(`<button class="btn-primary btn-small" disabled>Send</button>`);
      if (open) buttons.push(`<button class="btn-quiet btn-small" data-hand="${id}" data-name="${escapeHtml(r.name)}">Paid by hand</button>`);
      if (r.status === 'requested') buttons.push(`<button class="btn-quiet btn-small" data-decline="${id}" data-name="${escapeHtml(r.name)}">Reject</button>`);

    return `
      <tr>
        <td class="muted small" style="white-space: nowrap;">${escapeHtml(timeAgo(r.created_at))}<div>${escapeHtml(new Date(r.created_at).toLocaleString())}</div></td>
        <td>${escapeHtml(r.name)}${r.username ? `<div class="muted small">@${escapeHtml(r.username)}</div>` : ''}
          <div class="mono small">${escapeHtml(r.reference || '')}</div></td>
        <td class="num">${gliits(r.amount_gliits)}<div class="muted small">${r.amount_naira ? `₦${Number(r.amount_naira).toLocaleString()}` : ''}</div></td>
        <td>${escapeHtml(r.bank_name || 'Bank not named')}<div class="mono small">${escapeHtml(r.account_number)}</div>
          <div class="small">${escapeHtml(r.account_name || '')}</div>${identity}</td>
        <td>${state}${trail}${r.transfer_code ? `<div class="muted small mono">${escapeHtml(r.transfer_code)}</div>` : ''}</td>
        <td style="text-align: right; white-space: nowrap;">${buttons.join(' ')}</td>
      </tr>`;
  },

  async payoutToken() {
    const { data } = await supabase.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) throw new Error('Your session expired. Please sign in again.');
    return token;
  },

  wirePayouts(pane) {
    const reload = async (message) => {
      this.cache.payouts = null;
      await this.render();
      await appAlert(message);
    };

    const readNote = () => {
      const el = document.getElementById('payout-note');
      return (el ? el.value : '').trim();
    };

    pane.querySelectorAll('[data-payout-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.payoutFilter = btn.dataset.payoutFilter;
        this.render();
      });
    });

    pane.querySelectorAll('[data-send]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.send;
        const row = this.cache.payouts.rows.find(r => r.id === id);
        if (!row) return;

        const ok = await appConfirm(
          `Pay ${escapeHtml(row.name)} ₦${Number(row.amount_naira).toLocaleString()} into ` +
          `${escapeHtml(row.bank_name || 'their bank')} ${escapeHtml(row.account_number)} ` +
          `(${escapeHtml(row.account_name)}). This moves real money and cannot be undone.`,
          { title: 'Send this payout?', okText: 'Send now' }
        );
        if (!ok) return;

        btn.disabled = true;
        try {
          const token = await this.payoutToken();
          const res = await fetch(`${API_BASE_URL}/api/payout/disburse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ id })
          });
          const out = await res.json();
          if (!res.ok || out.ok === false) {
            btn.disabled = false;
            return appAlert(out.error || 'Paystack did not take the transfer. Nothing was sent twice — reload the queue.');
          }
          await reload(`Sent ₦${Number(out.amount_naira || row.amount_naira).toLocaleString()} to ${row.account_name}.`);
        } catch (err) {
          btn.disabled = false;
          await appAlert('Could not reach the payout service: ' + err.message);
        }
      });
    });

    pane.querySelectorAll('[data-hand]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.hand;
        const note = readNote();
        if (note.length < 5) return appAlert('Write the receipt or the reason first — it is the only proof this payout happened.');

        const ok = await appConfirm(
          `${btn.dataset.name}'s payout will be marked paid with no transfer sent by Gliimu. ${note}`,
          { title: 'Record a hand-settled payout?', okText: 'Mark paid' }
        );
        if (!ok) return;

        const { data, error } = await supabase.rpc('registrar_mark_withdrawal_paid', {
          p_id: id, p_reason: note, p_transfer_ref: null
        });
        if (error) return appAlert(rpcError({ code: error.code, detail: error.message }, 'Could not record it: ' + error.message));
        if (!data || data.ok === false) return appAlert(rpcError(data));

        await reload(`Marked paid — ${btn.dataset.name} was told in Alerts.`);
      });
    });

    pane.querySelectorAll('[data-decline]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.decline;
        const note = readNote();
        const meaningful = note.length >= 5 && !note.startsWith('Paid by hand');
        if (!meaningful) return appAlert('Write why you are declining this payout — the member is told exactly this.');

        const ok = await appConfirm(
          `${btn.dataset.name} will not be paid, and the Gliims go back to their wallet. ${note}`,
          { title: 'Reject this payout?', okText: 'Reject', danger: true }
        );
        if (!ok) return;

        const { data, error } = await supabase.rpc('registrar_reject_withdrawal', { p_id: id, p_reason: note });
        if (error) return appAlert(rpcError({ code: error.code, detail: error.message }, 'Could not reject it: ' + error.message));
        if (!data || data.ok === false) return appAlert(rpcError(data));

        await reload(`Rejected — ${gliits(data.balance)} is back in ${btn.dataset.name}'s wallet.`);
      });
    });
  },

  fundingHtml(d) {
    const attempts = d.attempts || [];

    return `
      <div class="card">
        <div class="card-head"><div><div class="card-title">Funding intents</div>
        <div class="card-sub">Every time a member opened the add-fund flow. Wallets are credited by Paystack, so nobody verifies a transfer by hand any more.</div></div></div>
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
