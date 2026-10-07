import { supabase } from '../config.js';
import { escapeHtml, naira, gp, money, badge, empty, timeAgo, rpcError, openDrawer, TIER_LABEL } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';

const CYCLE_TONE = { open: 'neutral', processing: 'warning', paid: 'success', defaulted: 'error', closed_empty: 'neutral', void: 'neutral' };

export default {
  template: `
    <div class="filters">
      <input type="search" id="member-search" class="input" placeholder="Search by name or username..." autocomplete="off">
      <span class="muted small" id="member-count"></span>
    </div>
    <div class="card"><div id="members-body"><p class="loading">Loading members...</p></div></div>
  `,

  async init() {
    this.members = [];
    this.timer = null;

    const search = document.getElementById('member-search');
    search.addEventListener('input', () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.load(search.value), 350);
    });

    await this.load('');
  },

  async load(q) {
    const body = document.getElementById('members-body');
    const { data, error } = await supabase.rpc('registrar_members', { p_q: q || null, p_limit: 100 });

    if (error) {
      body.innerHTML = empty(error.code === '42883'
        ? 'registrar_members() is not installed yet. Run sql/registrar.sql.'
        : `Could not load members: ${error.message}`);
      return;
    }
    if (!data || data.ok === false) {
      body.innerHTML = empty(rpcError(data, 'Could not load members.'));
      return;
    }

    this.members = data.members || [];
    document.getElementById('member-count').textContent =
      this.members.length >= 100 ? 'First 100 shown — narrow the search.' : `${this.members.length} member${this.members.length === 1 ? '' : 's'}`;
    this.render();
  },

  render() {
    const body = document.getElementById('members-body');

    if (!this.members.length) {
      body.innerHTML = empty('No members match that search.');
      return;
    }

    body.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Member</th><th class="num">Wallet</th><th class="num">GP</th>
          <th>Plan</th><th>Paid until</th>
        </tr></thead>
        <tbody>${this.members.map(p => `
          <tr data-open="${p.id}">
            <td>${escapeHtml(p.full_name || p.username || 'Member')}${p.username ? `<div class="muted small">@${escapeHtml(p.username)}</div>` : ''}</td>
            <td class="num">${naira(p.wallet_balance)}</td>
            <td class="num muted">${Number(p.total_gp || 0).toLocaleString()}</td>
            <td>${badge(TIER_LABEL[p.tier] || p.tier || '—', p.tier === 'pro' ? 'brand' : 'neutral')}</td>
            <td class="muted small">${p.subscription_expires_at ? escapeHtml(new Date(p.subscription_expires_at).toLocaleDateString()) : (p.trial_ends_at ? `trial to ${escapeHtml(new Date(p.trial_ends_at).toLocaleDateString())}` : '—')}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;

    body.querySelectorAll('[data-open]').forEach((el) => {
      el.addEventListener('click', () => this.openMember(el.dataset.open));
    });
  },

  async openMember(id) {
    const [{ data, error }, { data: ledger }] = await Promise.all([
      supabase.rpc('registrar_member', { p_user: id }),
      supabase.rpc('registrar_ledger', { p_type: null, p_status: null, p_user: id, p_limit: 25, p_offset: 0 })
    ]);

    if (error || !data || data.ok === false) {
      return appAlert(error ? `Could not load that member: ${error.message}` : rpcError(data));
    }

    const p = data.profile;
    const { overlay, close } = openDrawer({
      title: escapeHtml(p.full_name || p.username || 'Member'),
      sub: `${badge(TIER_LABEL[p.tier] || p.tier, p.tier === 'pro' ? 'brand' : 'neutral')} ${p.username ? `· @${escapeHtml(p.username)}` : ''}`,
      body: this.memberBody(data, ledger && ledger.ok ? (ledger.rows || []) : []),
      foot: `
        <button class="btn-quiet" id="apply-days">Apply days</button>
        <button class="btn-primary" id="apply-wallet">Apply wallet change</button>
      `
    });

    overlay.querySelector('#apply-wallet').addEventListener('click', () => this.adjustWallet(p, overlay, close));
    overlay.querySelector('#apply-days').addEventListener('click', () => this.adjustDays(p, overlay, close));
  },

  memberBody(d, ledger) {
    const p = d.profile;
    const cycles = d.cycles || [];
    const events = Array.isArray(d.events) ? d.events : [];
    const buys = Array.isArray(d.purchases) ? d.purchases : null;
    const sells = Array.isArray(d.library_items) ? d.library_items : null;
    const deals = d.deals || [];
    const edits = d.adjustments || [];

    const section = (title, inner) => `<div class="section-title">${escapeHtml(title)}</div>${inner}`;
    const schemaNote = (value) => `<p class="muted small">Not available — ${escapeHtml(value && value.detail ? value.detail : 'the table shape did not match.')} </p>`;

    return `
      <dl class="kv" style="margin-bottom: 6px;">
        <dt>Wallet</dt><dd>${naira(p.wallet_balance)}</dd>
        <dt>GP</dt><dd>${gp(p.total_gp)}</dd>
        <dt>Stored plan</dt><dd>${escapeHtml(TIER_LABEL[p.tier] || p.tier || '—')}${p.subscription_plan ? ` (${escapeHtml(p.subscription_plan)})` : ''}</dd>
        <dt>Effective plan</dt><dd>${escapeHtml(TIER_LABEL[p.effective_tier] || p.effective_tier || '—')}</dd>
        <dt>Trial ends</dt><dd>${p.trial_ends_at ? escapeHtml(new Date(p.trial_ends_at).toLocaleString()) : '—'}</dd>
        <dt>Paid until</dt><dd>${p.subscription_expires_at ? escapeHtml(new Date(p.subscription_expires_at).toLocaleString()) : '—'}</dd>
        <dt>Staff</dt><dd>${p.is_admin ? 'Yes' : 'No'}</dd>
      </dl>

      ${section('Manual adjustment', `
        <div class="form-group">
          <label for="adj-amount">Wallet change in naira — positive credits, negative debits</label>
          <input type="number" step="100" id="adj-amount" class="input" placeholder="e.g. 5000 or -1500">
        </div>
        <div class="form-group">
          <label for="adj-days">Paid days — positive grants, negative cuts</label>
          <input type="number" id="adj-days" class="input" placeholder="e.g. 33 or -7">
        </div>
        <div class="form-group">
          <label for="adj-reason">Reason (required — it goes on the audit log)</label>
          <input type="text" id="adj-reason" class="input" placeholder="Bank transfer received, reference 12345">
        </div>
      `)}

      ${section(`Bills (${cycles.length})`, cycles.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Status</th><th class="num">Amount</th><th>Due</th><th>Reference</th></tr></thead>
          <tbody>${cycles.map(c => `
            <tr>
              <td>${badge(c.status, CYCLE_TONE[c.status] || 'neutral')}</td>
              <td class="num">${naira(c.total_amount)}</td>
              <td class="muted small">${c.due_at ? escapeHtml(new Date(c.due_at).toLocaleDateString()) : '—'}</td>
              <td class="muted small mono">${escapeHtml(c.payment_reference || '—')}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>` : '<p class="muted small">No bills yet.</p>')}

      ${section(`Usage charges (${events.length} shown)`, events.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>When</th><th>Charge</th><th class="num">Amount</th></tr></thead>
          <tbody>${events.slice(0, 15).map(e => `
            <tr>
              <td class="muted small" style="white-space: nowrap;">${escapeHtml(timeAgo(e.created_at))}</td>
              <td>${escapeHtml(e.event_type)}${e.tier ? `<div class="muted small">on ${escapeHtml(e.tier)}</div>` : ''}</td>
              <td class="num">${naira(e.amount)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>` : '<p class="muted small">No usage recorded.</p>')}

      ${section('Library', `
        ${buys === null ? schemaNote(d.purchases) : buys.length ? `
          <div class="card-sub" style="margin-bottom: 6px;">Unlocked (${buys.length})</div>
          <div class="table-wrap"><table class="table">
            <tbody>${buys.map(b => `<tr><td>${escapeHtml(b.title || b.item_id)}</td><td class="num muted">${money(b.price)}</td></tr>`).join('')}</tbody>
          </table></div>` : '<p class="muted small">Nothing unlocked.</p>'}
        ${sells === null ? '' : sells.length ? `
          <div class="card-sub" style="margin: 12px 0 6px;">On the shelf (${sells.length})</div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Title</th><th class="num">Price</th><th class="num">Sales</th></tr></thead>
            <tbody>${sells.map(s => `<tr><td>${escapeHtml(s.title || '—')}</td><td class="num">${money(s.price)}</td><td class="num">${Number(s.sales || 0)}</td></tr>`).join('')}</tbody>
          </table></div>` : ''}
      `)}

      ${deals.length ? section(`Deals (${deals.length})`, `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Company</th><th>Status</th><th>Budget</th></tr></thead>
          <tbody>${deals.map(x => `<tr><td>${escapeHtml(x.company_name || x.deal_type || '—')}</td><td>${badge(x.status, x.status === 'completed' ? 'success' : 'neutral')}</td><td class="muted small">${escapeHtml(x.budget || '—')}</td></tr>`).join('')}</tbody>
        </table></div>`) : ''}

      ${edits.length ? section(`Admin adjustments (${edits.length})`, `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>When</th><th>Kind</th><th class="num">Value</th><th>Reason</th></tr></thead>
          <tbody>${edits.map(a => `
            <tr>
              <td class="muted small" style="white-space: nowrap;">${escapeHtml(timeAgo(a.created_at))}</td>
              <td>${escapeHtml(a.kind)}</td>
              <td class="num">${a.kind === 'subscription' ? `${Number(a.amount) > 0 ? '+' : ''}${a.amount}d` : naira(a.amount)}</td>
              <td class="small">${escapeHtml(a.reason)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>`) : ''}

      ${section('Recent ledger', ledger.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>When</th><th>Kind</th><th class="num">Amount</th></tr></thead>
          <tbody>${ledger.map(r => `
            <tr>
              <td class="muted small" style="white-space: nowrap;">${escapeHtml(timeAgo(r.created_at))}</td>
              <td>${escapeHtml(r.description || r.type || '—')}</td>
              <td class="num"><span class="${r.amount >= 0 ? 'amount-pos' : 'amount-neg'}">${naira(r.amount)}</span></td>
            </tr>`).join('')}
          </tbody>
        </table></div>` : '<p class="muted small">No ledger entries.</p>')}
    `;
  },

  reason(overlay) {
    return overlay.querySelector('#adj-reason').value.trim();
  },

  async adjustWallet(p, overlay, close) {
    const raw = overlay.querySelector('#adj-amount').value.trim();
    const amount = Number(raw);
    if (!raw || !Number.isFinite(amount) || amount === 0) {
      return appAlert('Enter a wallet amount other than zero, or leave it blank and use days instead.');
    }

    const reason = this.reason(overlay);
    if (reason.length < 5) return appAlert('A reason of at least 5 characters is required — it goes on the audit log.');

    const ok = await appConfirm(
      `${amount > 0 ? 'Credit' : 'Debit'} ${naira(Math.abs(amount))} ${amount > 0 ? 'to' : 'from'} ${p.full_name || p.username}. ` +
      `Balance goes from ${naira(p.wallet_balance)} to ${naira(Number(p.wallet_balance) + amount)}.`,
      { title: 'Change this wallet?', okText: 'Apply', danger: amount < 0 }
    );
    if (!ok) return;

    const { data, error } = await supabase.rpc('registrar_adjust_wallet', { p_user: p.id, p_amount: amount, p_reason: reason });
    if (error) return appAlert(rpcError({ code: error.code, detail: error.message }, 'Could not adjust that wallet: ' + error.message));
    if (!data || data.ok === false) return appAlert(rpcError(data));

    close();
    await this.load(document.getElementById('member-search').value);
    await appAlert(`Wallet updated. New balance ${naira(data.balance)}.`);
  },

  async adjustDays(p, overlay, close) {
    const raw = overlay.querySelector('#adj-days').value.trim();
    const days = Number(raw);
    if (!raw || !Number.isFinite(days) || days === 0) {
      return appAlert('Enter a number of days other than zero.');
    }
    if (Math.abs(days) > 3650) return appAlert('That is too many days to change at once.');

    const reason = this.reason(overlay);
    if (reason.length < 5) return appAlert('A reason of at least 5 characters is required — it goes on the audit log.');

    const ok = await appConfirm(
      `${days > 0 ? 'Grant' : 'Remove'} ${Math.abs(days)} paid day${Math.abs(days) === 1 ? '' : 's'} for ${p.full_name || p.username}.`,
      { title: 'Change paid time?', okText: 'Apply', danger: days < 0 }
    );
    if (!ok) return;

    const { data, error } = await supabase.rpc('registrar_extend_subscription', { p_user: p.id, p_days: days, p_reason: reason });
    if (error) return appAlert(rpcError({ code: error.code, detail: error.message }, 'Could not change paid time: ' + error.message));
    if (!data || data.ok === false) return appAlert(rpcError(data));

    close();
    await this.load(document.getElementById('member-search').value);
    await appAlert(`Paid until ${new Date(data.subscription_expires_at).toLocaleString()} (${data.tier}).`);
  }
};
