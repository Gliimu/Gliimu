import { supabase } from '../config.js';
import { escapeHtml, naira, money, badge, empty, timeAgo, rpcError } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';

const TABS = [
  { id: 'library', label: 'Library sales' },
  { id: 'creators', label: 'Creator payouts' },
  { id: 'charges', label: 'Usage charges' },
  { id: 'pricing', label: 'Price list' },
  { id: 'funding', label: 'Funding queue' },
  { id: 'audit', label: 'Audit log' }
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

    // The revenue RPC backs three of the tabs; fetch it once.
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
      pricing: () => this.pricingHtml(this.cache.pricing),
      funding: () => this.fundingHtml(this.cache.funding),
      audit: () => this.auditHtml(this.cache.audit)
    }[this.tab]();

    pane.innerHTML = html;
    if (this.tab === 'pricing') this.wirePricing(pane);
    if (this.tab === 'funding') this.wireFunding(pane);
  },

  async fetchFor(key) {
    const unwrap = ({ data, error }) =>
      (error || !data || data.ok === false)
        ? { failed: error ? error.message : rpcError(data) }
        : data;

    if (key === 'revenue') return unwrap(await supabase.rpc('registrar_revenue', { p_limit: 200 }));
    if (key === 'audit') return unwrap(await supabase.rpc('registrar_audit', { p_limit: 200 }));

    if (key === 'funding') {
      const [queue, attempts] = await Promise.all([
        supabase.rpc('registrar_pending_topups', { p_limit: 200 }),
        supabase.rpc('registrar_payment_attempts', { p_limit: 200 })
      ]);
      const q = unwrap(queue);
      if (q.failed) return q;
      // The intent log is context, not the queue — if it is missing the
      // verify buttons still work.
      const a = unwrap(attempts);
      return { ...q, attempts: a.failed ? null : a.attempts, attemptsFailed: a.failed || null };
    }

    // billing_prices is readable by any signed-in user, so no RPC is needed.
    const { data, error } = await supabase.from('billing_prices')
      .select('event_type, amount, updated_at').order('event_type', { ascending: true });
    return error ? { failed: error.message } : { prices: data || [] };
  },

  libraryHtml(d) {
    const owners = d.owners || [];
    const items = d.items || [];
    const total = owners.reduce((sum, o) => sum + Number(o.revenue || 0), 0);

    return `
      <div class="stat-grid">
        <div class="stat"><div class="stat-label">Library revenue</div><div class="stat-value">${naira(total)}</div>
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
                <td class="num">${naira(o.revenue)}</td>
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
                <td class="num">${money(i.price)}</td>
                <td class="num">${Number(i.sales || 0)}</td>
                <td class="num">${naira(i.revenue)}</td>
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
        <div class="stat"><div class="stat-label">Paid out to creators</div><div class="stat-value">${naira(total)}</div>
          <div class="stat-note">Premium share from gliims and library opens</div></div>
        <div class="stat"><div class="stat-label">Creators earning</div><div class="stat-value">${rows.length}</div></div>
      </div>
      <div class="card">
        <div class="card-head"><div><div class="card-title">By creator</div></div></div>
        ${rows.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Creator</th><th class="num">Shares</th><th class="num">Total</th></tr></thead>
            <tbody>${rows.map(r => `
              <tr><td>${escapeHtml(r.creator)}</td><td class="num">${Number(r.events || 0).toLocaleString()}</td><td class="num amount-pos">${naira(r.total)}</td></tr>`).join('')}
            </tbody>
          </table></div>` : empty('No creator payouts recorded yet.')}
      </div>`;
  },

  chargesHtml(d) {
    const rows = d.usage || [];

    return `
      <div class="card">
        <div class="card-head"><div><div class="card-title">Usage charges</div>
        <div class="card-sub">Everything the billing engine has charged, by event type.</div></div></div>
        ${rows.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Charge</th><th class="num">Events</th><th class="num">Last 30 days</th><th class="num">All time</th></tr></thead>
            <tbody>${rows.map(r => `
              <tr>
                <td class="mono">${escapeHtml(r.event_type)}</td>
                <td class="num">${Number(r.events || 0).toLocaleString()}</td>
                <td class="num">${naira(r.last_30_days)}</td>
                <td class="num">${naira(r.total)}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : empty('No usage recorded yet.')}
      </div>`;
  },

  pricingHtml(d) {
    const prices = d.prices || [];

    return `
      <div class="card">
        <div class="card-head"><div><div class="card-title">Price list</div>
        <div class="card-sub">In naira. Changes apply to the next charge — nothing already billed moves. Every change is written to the audit log.</div></div></div>
        <div class="form-group">
          <label for="price-reason">Reason for the next change (required)</label>
          <input type="text" id="price-reason" class="input" placeholder="e.g. Launch pricing review, 2026-10">
        </div>
        ${prices.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Charge</th><th class="num">Amount</th><th>Changed</th><th></th></tr></thead>
            <tbody>${prices.map(p => `
              <tr data-price="${escapeHtml(p.event_type)}">
                <td class="mono">${escapeHtml(p.event_type)}</td>
                <td class="num"><input type="number" min="0" step="50" class="input" style="width: 130px; padding: 6px 10px;" data-amount="${escapeHtml(p.event_type)}" value="${Number(p.amount || 0)}"></td>
                <td class="muted small">${p.updated_at ? escapeHtml(timeAgo(p.updated_at)) : '—'}</td>
                <td style="text-align: right;"><button class="btn-quiet btn-small" data-save-price="${escapeHtml(p.event_type)}">Save</button></td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : empty('The price list is empty — run sql/billing.sql.')}
      </div>`;
  },

  wirePricing(pane) {
    pane.querySelectorAll('[data-save-price]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.savePrice;
        const row = pane.querySelector(`[data-price="${key}"]`);
        const amount = Number(pane.querySelector(`[data-amount="${key}"]`).value);
        const reason = pane.querySelector('#price-reason').value.trim();

        if (!Number.isFinite(amount) || amount < 0) return appAlert('Enter an amount of zero or more.');
        if (reason.length < 5) return appAlert('Write a reason of at least 5 characters — it goes on the audit log.');

        const ok = await appConfirm(`${key} will cost ${naira(amount)} from the next charge.`, {
          title: 'Change this price?', okText: 'Change price'
        });
        if (!ok) return;

        const { data, error } = await supabase.rpc('registrar_set_price', { p_event_type: key, p_amount: amount, p_reason: reason });
        if (error) return appAlert(rpcError({ code: error.code, detail: error.message }, 'Could not save that price: ' + error.message));
        if (!data || data.ok === false) return appAlert(rpcError(data));

        const typed = pane.querySelector('#price-reason').value;
        this.cache.pricing = null;
        await this.render();
        const again = document.getElementById('price-reason');
        if (again) again.value = typed;
        await appAlert(`${key} is now ${naira(amount)} (was ${naira(data.previous)}).`);
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
          <div class="stat-note">${naira(claimed)} claimed</div></div>
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
            <thead><tr><th>Waiting</th><th>Member</th><th>Reference</th><th class="num">Credit</th><th></th></tr></thead>
            <tbody>${rows.map(r => `
              <tr data-txn="${escapeHtml(r.id)}" data-name="${escapeHtml(r.name)}">
                <td class="muted small" style="white-space: nowrap;">${escapeHtml(timeAgo(r.created_at))}<div>${escapeHtml(new Date(r.created_at).toLocaleString())}</div></td>
                <td>${escapeHtml(r.name)}${r.username ? `<div class="muted small">@${escapeHtml(r.username)}</div>` : ''}</td>
                <td class="mono small">${escapeHtml(r.reference || '—')}</td>
                <td class="num"><input type="number" min="100" step="50" class="input" style="width: 130px; padding: 6px 10px;" data-amount="${escapeHtml(r.id)}" value="${Number(r.amount || 0)}"></td>
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
        <div class="card-sub">Every time a member opened the add-fund flow, paid or not. Paystack rows credit themselves, so only bank_transfer needs a person.</div></div></div>
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
    // The reason field survives the re-render so a registrar working down a
    // long queue does not retype it for every row.
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
          `${row.dataset.name} will be credited ${naira(amount)}. You will be recorded as the approver.`,
          { title: 'Verify this transfer?', okText: 'Credit wallet' }
        );
        if (!ok) return;

        const { data, error } = await supabase.rpc('registrar_verify_topup', {
          p_txn: id, p_amount: amount, p_reason: readReason() || null
        });
        if (error) return appAlert(rpcError({ code: error.code, detail: error.message }, 'Could not verify: ' + error.message));
        if (!data || data.ok === false) return appAlert(rpcError(data));

        await reload(`${row.dataset.name} now has ${naira(data.balance)}.`);
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
        <div class="card-sub">Every manual money or plan change made from this app, newest first.</div></div></div>
        ${rows.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>When</th><th>Admin</th><th>Member</th><th>Kind</th><th class="num">Value</th><th>Reason</th></tr></thead>
            <tbody>${rows.map(a => `
              <tr>
                <td class="muted small" style="white-space: nowrap;">${escapeHtml(timeAgo(a.created_at))}</td>
                <td>${escapeHtml(a.admin)}</td>
                <td>${escapeHtml(a.member)}</td>
                <td>${badge(a.kind, a.kind === 'wallet' ? 'brand' : 'neutral')}</td>
                <td class="num">${a.kind === 'subscription' ? `${Number(a.amount) > 0 ? '+' : ''}${a.amount}d` : a.kind === 'price' ? naira(a.amount) : naira(a.amount)}</td>
                <td class="small">${escapeHtml(a.reason)}${a.reference ? `<div class="muted small mono">${escapeHtml(a.reference)}</div>` : ''}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : empty('No manual changes yet.')}
      </div>`;
  }
};
