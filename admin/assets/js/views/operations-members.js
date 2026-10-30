import { supabase } from '../config.js';
import { escapeHtml, gliits, gp, badge, empty, timeAgo, rpcError, openDrawer, TIER_LABEL } from '../ui.js?v=1';
import { appAlert, appConfirm } from '../dialog.js';

const TOPUP_TONE = { pending: 'warning', success: 'success', failed: 'error' };

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
        ? 'registrar_members() is not installed yet. Run the SQL scripts in sql/ folder.'
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
          <th>Member</th><th class="num">Wallet (G)</th><th class="num">GP</th>
          <th>Plan</th><th>Plan expires</th>
        </tr></thead>
        <tbody>${this.members.map(p => `
          <tr data-open="${p.id}">
            <td>${escapeHtml(p.full_name || p.username || 'Member')}${p.username ? `<div class="muted small">@${escapeHtml(p.username)}</div>` : ''}</td>
            <td class="num">${gliits(p.wallet_balance)}</td>
            <td class="num muted">${Number(p.total_gp || 0).toLocaleString()}</td>
            <td>${badge(TIER_LABEL[p.plan_type] || p.plan_type || '—', p.plan_type === 'yearly' ? 'brand' : p.plan_type === 'monthly' ? 'warning' : 'neutral')}</td>
            <td class="muted small">${p.plan_expires_at ? escapeHtml(new Date(p.plan_expires_at).toLocaleDateString()) : '—'}</td>
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
    const plan = data.plan || {};
    const { overlay, close } = openDrawer({
      title: escapeHtml(p.full_name || p.username || 'Member'),
      sub: `${badge(TIER_LABEL[plan.plan_type] || plan.plan_type || 'payngo', plan.plan_type === 'yearly' ? 'brand' : plan.plan_type === 'monthly' ? 'warning' : 'neutral')} ${p.username ? `· @${escapeHtml(p.username)}` : ''}`,
      body: this.memberBody(data, ledger && ledger.ok ? (ledger.rows || []) : []),
      foot: `
        <button class="btn-quiet" id="apply-days">Apply plan days</button>
        <button class="btn-primary" id="apply-wallet">Apply wallet change</button>
      `
    });

    overlay.querySelector('#apply-wallet').addEventListener('click', () => this.adjustWallet(p, overlay, close));
    overlay.querySelector('#apply-days').addEventListener('click', () => this.adjustDays(p, plan, overlay, close));

    overlay.querySelectorAll('.badge-grant-btn').forEach(btn => {
      btn.addEventListener('click', () => this.grantBadge(p, btn.dataset.badge, overlay, close));
    });

    const revokeBtn = overlay.querySelector('#revoke-badge');
    if (revokeBtn) revokeBtn.addEventListener('click', () => this.revokeBadge(p, overlay, close));
  },

  memberBody(d, ledger) {
    const p = d.profile;
    const plan = d.plan || {};
    const usage = Array.isArray(d.usage) ? d.usage : [];
    const topups = Array.isArray(d.topups) ? d.topups : [];
    const buys = Array.isArray(d.purchases) ? d.purchases : null;
    const edits = d.adjustments || [];
    const currentBadge = p.verification_badge || null;

    const section = (title, inner) => `<div class="section-title">${escapeHtml(title)}</div>${inner}`;
    const schemaNote = (value) => `<p class="muted small">Not available — ${escapeHtml(value && value.detail ? value.detail : 'the table shape did not match.')} </p>`;

    const badgeButtons = ['tick', 'pen', 'pod'].map(b => `
      <button class="btn-quiet badge-grant-btn ${currentBadge === b ? 'badge-active' : ''}" data-badge="${b}">
        <img src="https://gliimu.com/icons/${b}.svg" alt="${b}" width="14" height="14" style="vertical-align: middle; margin-right: 4px;">
        ${b.charAt(0).toUpperCase() + b.slice(1)}
      </button>
    `).join('');

    return `
      ${section('Verification badge', `
        <div style="margin-bottom: 8px;">
          ${currentBadge ? `<span class="badge-brand">Current: <img src="https://gliimu.com/icons/${currentBadge}.svg" alt="${currentBadge}" width="14" height="14" style="vertical-align: middle;"></span>` : '<span class="muted small">No badge granted</span>'}
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">
          ${badgeButtons}
        </div>
        ${currentBadge ? '<button class="btn-quiet" id="revoke-badge" style="color: #EF4444;">Remove badge</button>' : ''}
      `)}

      <dl class="kv" style="margin-bottom: 6px;">
        <dt>Wallet</dt><dd>${gliits(p.wallet_balance)}</dd>
        <dt>GP</dt><dd>${gp(p.total_gp)}</dd>
        <dt>Plan</dt><dd>${escapeHtml(TIER_LABEL[plan.plan_type] || plan.plan_type || '—')}</dd>
        <dt>Plan started</dt><dd>${plan.started_at ? escapeHtml(new Date(plan.started_at).toLocaleString()) : '—'}</dd>
        <dt>Plan expires</dt><dd>${plan.expires_at ? escapeHtml(new Date(plan.expires_at).toLocaleString()) : '—'}</dd>
        <dt>Auto-renew</dt><dd>${plan.auto_renew ? 'Yes' : 'No'}</dd>
        <dt>Staff</dt><dd>${p.is_admin ? 'Yes' : 'No'}</dd>
      </dl>

      ${section('Manual adjustment', `
        <div class="form-group">
          <label for="adj-amount">Wallet change in G — positive credits, negative debits</label>
          <input type="number" step="10" id="adj-amount" class="input" placeholder="e.g. 500 or -100">
        </div>
        <div class="form-group">
          <label for="adj-days">Plan days — positive grants, negative cuts</label>
          <input type="number" id="adj-days" class="input" placeholder="e.g. 30 or -7">
        </div>
        <div class="form-group">
          <label for="adj-reason">Reason (required — it goes on the audit log)</label>
          <input type="text" id="adj-reason" class="input" placeholder="Bank transfer received, reference 12345">
        </div>
      `)}

      ${section(`Topups (${topups.length})`, topups.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>When</th><th>Status</th><th class="num">G</th><th class="num">₦</th><th>Reference</th></tr></thead>
          <tbody>${topups.slice(0, 15).map(t => `
            <tr>
              <td class="muted small" style="white-space: nowrap;">${escapeHtml(timeAgo(t.created_at))}</td>
              <td>${badge(t.payment_status, TOPUP_TONE[t.payment_status] || 'neutral')}</td>
              <td class="num">${gliits(t.amount_gliits)}</td>
              <td class="num muted">${t.amount_naira ? `₦${Number(t.amount_naira).toLocaleString()}` : '—'}</td>
              <td class="muted small mono">${escapeHtml(t.payment_reference || '—')}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>` : '<p class="muted small">No topups yet.</p>')}

      ${section(`Usage (${usage.length} most recent)`, usage.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>When</th><th class="num">Charged (G)</th><th class="num">Creator credited (G)</th></tr></thead>
          <tbody>${usage.slice(0, 15).map(u => `
            <tr>
              <td class="muted small" style="white-space: nowrap;">${escapeHtml(timeAgo(u.minute_at))}</td>
              <td class="num">${gliits(u.gliits_charged)}</td>
              <td class="num amount-pos">${gliits(u.creator_credited)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>` : '<p class="muted small">No usage recorded.</p>')}

      ${section('Library', `
        ${buys === null ? schemaNote(d.purchases) : buys.length ? `
          <div class="card-sub" style="margin-bottom: 6px;">Unlocked (${buys.length})</div>
          <div class="table-wrap"><table class="table">
            <tbody>${buys.map(b => `<tr><td>${escapeHtml(b.title || b.item_id)}</td><td class="num muted">${gliits(b.price)}</td></tr>`).join('')}</tbody>
          </table></div>` : '<p class="muted small">Nothing unlocked.</p>'}
      `)}

      ${edits.length ? section(`Admin adjustments (${edits.length})`, `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>When</th><th>Kind</th><th class="num">Value</th><th>Reason</th></tr></thead>
          <tbody>${edits.map(a => `
            <tr>
              <td class="muted small" style="white-space: nowrap;">${escapeHtml(timeAgo(a.created_at))}</td>
              <td>${escapeHtml(a.kind)}</td>
              <td class="num">${a.kind === 'subscription' ? `${Number(a.amount) > 0 ? '+' : ''}${a.amount}d` : gliits(a.amount)}</td>
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
              <td class="num"><span class="${r.amount >= 0 ? 'amount-pos' : 'amount-neg'}">${gliits(r.amount)}</span></td>
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
      `${amount > 0 ? 'Credit' : 'Debit'} ${gliits(Math.abs(amount))} ${amount > 0 ? 'to' : 'from'} ${p.full_name || p.username}. ` +
      `Balance goes from ${gliits(p.wallet_balance)} to ${gliits(Number(p.wallet_balance) + amount)}.`,
      { title: 'Change this wallet?', okText: 'Apply', danger: amount < 0 }
    );
    if (!ok) return;

    const { data, error } = await supabase.rpc('registrar_adjust_wallet', { p_user: p.id, p_amount: amount, p_reason: reason });
    if (error) return appAlert(rpcError({ code: error.code, detail: error.message }, 'Could not adjust that wallet: ' + error.message));
    if (!data || data.ok === false) return appAlert(rpcError(data));

    close();
    await this.load(document.getElementById('member-search').value);
    await appAlert(`Wallet updated. New balance ${gliits(data.balance)}.`);
  },

  async adjustDays(p, plan, overlay, close) {
    const raw = overlay.querySelector('#adj-days').value.trim();
    const days = Number(raw);
    if (!raw || !Number.isFinite(days) || days === 0) {
      return appAlert('Enter a number of days other than zero.');
    }
    if (Math.abs(days) > 3650) return appAlert('That is too many days to change at once.');

    const reason = this.reason(overlay);
    if (reason.length < 5) return appAlert('A reason of at least 5 characters is required — it goes on the audit log.');

    const ok = await appConfirm(
      `${days > 0 ? 'Grant' : 'Remove'} ${Math.abs(days)} plan day${Math.abs(days) === 1 ? '' : 's'} for ${p.full_name || p.username}.`,
      { title: 'Change plan time?', okText: 'Apply', danger: days < 0 }
    );
    if (!ok) return;

    const { data, error } = await supabase.rpc('registrar_extend_subscription', { p_user: p.id, p_days: days, p_reason: reason });
    if (error) return appAlert(rpcError({ code: error.code, detail: error.message }, 'Could not change plan time: ' + error.message));
    if (!data || data.ok === false) return appAlert(rpcError(data));

    close();
    await this.load(document.getElementById('member-search').value);
    await appAlert(`Plan ${data.tier}${data.subscription_expires_at ? ` until ${new Date(data.subscription_expires_at).toLocaleString()}` : ''}.`);
  },

  async grantBadge(p, badgeType, overlay, close) {
    const ok = await appConfirm(
      `Grant ${badgeType} verification badge to ${p.full_name || p.username}?`,
      { title: 'Grant badge?', okText: 'Grant' }
    );
    if (!ok) return;

    const { error } = await supabase.rpc('admin_grant_verification', { p_user_id: p.id, p_badge: badgeType });
    if (error) return appAlert(`Could not grant badge: ${error.message}`);

    close();
    await this.load(document.getElementById('member-search').value);
    await appAlert(`${badgeType.charAt(0).toUpperCase() + badgeType.slice(1)} badge granted to ${p.full_name || p.username}.`);
  },

  async revokeBadge(p, overlay, close) {
    const ok = await appConfirm(
      `Remove verification badge from ${p.full_name || p.username}?`,
      { title: 'Remove badge?', okText: 'Remove', danger: true }
    );
    if (!ok) return;

    const { error } = await supabase.rpc('admin_revoke_verification', { p_user_id: p.id });
    if (error) return appAlert(`Could not remove badge: ${error.message}`);

    close();
    await this.load(document.getElementById('member-search').value);
    await appAlert(`Badge removed from ${p.full_name || p.username}.`);
  }
};
