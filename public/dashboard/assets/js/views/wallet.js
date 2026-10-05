import { supabase } from '/shared/js/config.js';
import { store, tierClass } from '../store.js';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Billing plans — paid from the bill balance (tuition-through-earnings).
// Duration months include the free months: Pro = 4 + 1, Elite = 12 + 2.
const PLANS = [
  { id: 'starter', name: 'Starter Plan', short: 'Starter', price: 70000, priceNote: 'billed monthly', features: ['Full platform access', 'Conditional updates'], months: 1 },
  { id: 'pro', name: 'Pro Plan', short: 'Pro', price: 250000, priceNote: 'billed in 4 months', features: ['Everything in starter', 'Full update participation', '+ 1 month free subscription (saved 30,000 + 70,000 = 100,000)'], months: 5 },
  { id: 'elite', name: 'Elite Plan', short: 'Elite', price: 780000, priceNote: 'billed annually', features: ['Everything in pro plan', 'Extra security', '+ 2 months free subscription (saved 60,000 + 140,000 = 200,000)'], months: 14 }
];

export default {
  title: 'Billing',
  template: `
    <div class="wallet-layout" id="wallet-container">
      <p style="color: var(--text-muted); text-align: center;">Loading billing...</p>
    </div>
  `,
  async init() {
    window.walletInstance = {
      switchTab: (tab) => this.switchTab(tab),
      openTopUpModal: () => this.openTopUpModal(),
      toggleTransferMenu: () => this.toggleTransferMenu(),
      transferToBank: () => this.transferToBank(),
      openTransferModal: () => this.openTransferModal(),
      toggleFilterMenu: () => this.toggleFilterMenu(),
      selectTransferUser: (id) => this.selectTransferUser(id),
      clearTransferUser: () => this.clearTransferUser(),
      buyPlan: (id) => this.buyPlan(id)
    };

    this.currentTab = 'summary'; // Default view
    this.transferTarget = null;
    this.transferSearchList = [];
    this.transferSearchTimer = null;

    // Menus close when tapping anywhere else in the app
    document.addEventListener('click', () => {
      document.getElementById('wallet-transfer-menu')?.classList.remove('active');
      document.getElementById('billing-filter-menu')?.classList.remove('active');
    });

    this.setupTopbar();
    await this.fetchData();
    this.render();
  },

  setupTopbar() {
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    if (topbarDynamic) {
      topbarDynamic.innerHTML = `<span class="mobile-bar-hint">Fund your bill to make purchases</span>`;
    }
  },

  async fetchData() {
    if (!store.user || !store.user.id) return;

    let { data: profile } = await supabase
      .from('profiles')
      .select('wallet_balance, subscription_expires_at, subscription_plan')
      .eq('id', store.user.id)
      .single();

    // Fallback for the billing columns until the SQL migration is applied
    if (!profile) {
      ({ data: profile } = await supabase
        .from('profiles')
        .select('wallet_balance, subscription_expires_at')
        .eq('id', store.user.id)
        .single());
    }

    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('id, user_id, amount, points, type, status, reference, description, created_at')
      .eq('user_id', store.user.id)
      .order('created_at', { ascending: false });

    if (txError) console.error("Transactions fetch error:", txError);

    this.balance = profile?.wallet_balance || 0;
    this.subscriptionExpiresAt = profile?.subscription_expires_at || null;
    this.subscriptionPlan = profile?.subscription_plan || null;
    this.allTransactions = transactions || [];
  },

  getActivePlan() {
    if (!this.subscriptionExpiresAt || new Date(this.subscriptionExpiresAt) <= new Date()) return null;
    return this.subscriptionPlan || null;
  },

  render() {
    const container = document.getElementById('wallet-container');
    if (!container) return;

    container.innerHTML = `
      <div class="wallet-header-card">
        <span class="balance-label">Your Bill</span>
        <h1 class="balance-amount">₦${this.balance.toLocaleString()}</h1>
        <div class="wallet-actions">
          <button class="icon-btn-light" title="Add Funds" onclick="walletInstance.openTopUpModal()">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <div class="wallet-transfer-wrap" onclick="event.stopPropagation();">
            <button class="icon-btn-light" title="Transfer" onclick="walletInstance.toggleTransferMenu()">
              <img src="/icons/share.svg" alt="Transfer">
            </button>
            <div class="wallet-transfer-menu" id="wallet-transfer-menu">
              <div class="wallet-transfer-item" onclick="walletInstance.transferToBank()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l7-4 7 4v14"></path><path d="M9 21v-4h6v4"></path></svg>
                Transfer to Bank
              </div>
              <div class="wallet-transfer-item" onclick="walletInstance.openTransferModal()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                Transfer to Another User
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="billing-toolbar">
        <div class="billing-filter-wrap">
          <button class="billing-filter-btn" id="billing-filter-btn" onclick="event.stopPropagation(); walletInstance.toggleFilterMenu()">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
          </button>
          <div class="billing-filter-menu" id="billing-filter-menu">
            <div class="billing-filter-item ${this.currentTab === 'summary' ? 'active' : ''}" data-tab="summary" onclick="walletInstance.switchTab('summary')">Summary</div>
            <div class="billing-filter-item ${this.currentTab === 'trxn' ? 'active' : ''}" data-tab="trxn" onclick="walletInstance.switchTab('trxn')">Trxn</div>
            <div class="billing-filter-item ${this.currentTab === 'subscription' ? 'active' : ''}" data-tab="subscription" onclick="walletInstance.switchTab('subscription')">Subscription</div>
          </div>
        </div>
      </div>

      <div id="wallet-tab-content" class="wallet-tab-content">
        ${this.renderTabContent()}
      </div>
    `;
  },

  renderTabContent() {
    if (this.currentTab === 'summary') {
      const unlocks = this.allTransactions.filter(t => t.type === 'purchase').length;
      const supports = this.allTransactions.filter(t => t.type === 'support' || t.type === 'live_support').length;
      const liveEntries = this.allTransactions.filter(t => t.type === 'live_entry' || t.type === 'live_session').length;

      return `
        <div class="card stat-card">
          <div class="stat-row">
            <div class="stat-icon-wrap bg-brand"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg></div>
            <div class="stat-info">
              <span class="stat-value">${unlocks}</span>
              <span class="stat-label">Library Unlocks</span>
            </div>
          </div>
        </div>
        <div class="card stat-card" style="margin-top: 16px;">
          <div class="stat-row">
            <div class="stat-icon-wrap bg-gold"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></div>
            <div class="stat-info">
              <span class="stat-value">${supports}</span>
              <span class="stat-label">Creator Supports</span>
            </div>
          </div>
        </div>
        <div class="card stat-card" style="margin-top: 16px;">
          <div class="stat-row">
            <div class="stat-icon-wrap bg-error"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></div>
            <div class="stat-info">
              <span class="stat-value">${liveEntries}</span>
              <span class="stat-label">Live Sessions</span>
            </div>
          </div>
        </div>
      `;
    }

    if (this.currentTab === 'trxn') {
      if (this.allTransactions.length === 0) {
        return '<div class="card"><p style="color: var(--text-muted); text-align: center; padding: 40px;">No transactions yet.</p></div>';
      }

      return `
        <div class="card">
          <div class="txn-list">
            ${this.allTransactions.map(tx => this.renderTxItem(tx)).join('')}
          </div>
        </div>
      `;
    }

    if (this.currentTab === 'subscription') {
      const activePlanId = this.getActivePlan();
      const activePlan = PLANS.find(p => p.id === activePlanId) || null;
      const isActive = !!this.getActivePlan() || (this.subscriptionExpiresAt && new Date(this.subscriptionExpiresAt) > new Date());
      const expiryDate = isActive ? new Date(this.subscriptionExpiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

      return `
        <div class="card sub-card">
          <div class="sub-header">
            <h3>Your Subscription</h3>
            <span class="sub-badge ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span>
          </div>
          <div class="sub-details">
            <div class="sub-row">
              <span>Plan</span>
              <strong>${activePlan ? activePlan.name : 'No active plan'}</strong>
            </div>
            ${isActive ? `
              <div class="sub-row">
                <span>Expires On</span>
                <strong>${expiryDate}</strong>
              </div>
              ${activePlan ? `
              <div class="sub-row">
                <span>Billing</span>
                <strong>${activePlan.priceNote}</strong>
              </div>
              ` : ''}
            ` : ''}
          </div>
        </div>

        <div class="plan-list">
          ${PLANS.map(p => `
            <div class="plan-card">
              <span class="plan-name">${p.name}</span>
              <div class="plan-price">₦${p.price.toLocaleString()}</div>
              <span class="plan-price-note">${p.priceNote}</span>
              <ul class="plan-features">
                ${p.features.map(f => `
                  <li class="plan-feature">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span>${f}</span>
                  </li>
                `).join('')}
              </ul>
              ${activePlanId === p.id
                ? `<button class="plan-buy active-plan" disabled>Current Plan</button>`
                : `<button class="plan-buy btn-primary" data-plan="${p.id}" onclick="walletInstance.buyPlan('${p.id}')">Buy ${p.short}</button>`}
            </div>
          `).join('')}
        </div>
      `;
    }
  },

  renderTxItem(tx) {
    let icon = '';
    let label = tx.description || 'Transaction';
    let amountClass = 'amount-negative';
    let amountPrefix = '-';

    // FIX: If amount > 0, it's income (green). If negative, it's an expense (red).
    if (tx.amount > 0) {
      amountClass = 'amount-positive';
      amountPrefix = '+';
    }

    // FIX: GP Rewards should always be green
    if (tx.type === 'reward' && tx.points > 0) {
      amountClass = 'amount-positive';
      amountPrefix = '+';
    }

    if (tx.type === 'topup') {
      icon = `<div class="txn-icon bg-success"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></div>`;
    } else if (tx.type === 'purchase') {
      icon = `<div class="txn-icon bg-brand"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg></div>`;
    } else if (tx.type === 'support' || tx.type === 'live_support') {
      icon = `<div class="txn-icon bg-gold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></div>`;
    } else if (tx.type === 'live_entry' || tx.type === 'live_session') {
      icon = `<div class="txn-icon bg-error"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></div>`;
    } else if (tx.type === 'subscription') {
      icon = `<div class="txn-icon bg-gold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></div>`;
    } else if (tx.type === 'transfer_out') {
      icon = `<div class="txn-icon bg-error"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg></div>`;
    } else if (tx.type === 'transfer_in') {
      icon = `<div class="txn-icon bg-success"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="7" x2="7" y2="17"></line><polyline points="17 17 7 17 7 7"></polyline></svg></div>`;
    } else {
      icon = `<div class="txn-icon bg-muted"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div>`;
    }

    const date = new Date(tx.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const statusBadge = tx.status === 'pending' ? '<span class="txn-status pending">Pending</span>' : '';

    // Pure GP rewards (no cash movement) show the GP value as the primary amount
    const isPurePoints = (!tx.amount || tx.amount === 0) && tx.points > 0;

    if (isPurePoints) {
      icon = `<img src="/icons/icon.png" class="txn-gp-icon" alt="GP">`;
    }

    const pointsHtml = !isPurePoints && tx.points && tx.points > 0 ? `<span class="txn-points">+${tx.points} GP</span>` : '';
    const amountHtml = isPurePoints
      ? `<span class="txn-amount amount-positive">+${tx.points} GP</span>`
      : `<span class="txn-amount ${amountClass}">${amountPrefix}₦${Math.abs(tx.amount).toLocaleString()}</span>`;

    return `
      <div class="txn-item">
        ${icon}
        <div class="txn-info">
          <span class="txn-title">${label} ${statusBadge}</span>
          <span class="txn-date">${date}${isPurePoints ? ` · +${tx.points} GP earned` : ''}</span>
        </div>
        <div class="txn-right">
          ${pointsHtml}
          ${amountHtml}
        </div>
      </div>
    `;
  },

  switchTab(tab) {
    this.currentTab = tab;
    document.getElementById('billing-filter-menu')?.classList.remove('active');
    document.querySelectorAll('.billing-filter-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`.billing-filter-item[data-tab="${tab}"]`)?.classList.add('active');
    document.getElementById('wallet-tab-content').innerHTML = this.renderTabContent();
  },

  toggleTransferMenu() {
    document.getElementById('billing-filter-menu')?.classList.remove('active');
    document.getElementById('wallet-transfer-menu')?.classList.toggle('active');
  },

  transferToBank() {
    document.getElementById('wallet-transfer-menu')?.classList.remove('active');
    appAlert('Bank transfers are coming soon!');
  },

  toggleFilterMenu() {
    document.getElementById('wallet-transfer-menu')?.classList.remove('active');
    document.getElementById('billing-filter-menu')?.classList.toggle('active');
  },

  // ============================================
  // TRANSFER TO ANOTHER USER
  // ============================================
  openTransferModal() {
    document.getElementById('wallet-transfer-menu')?.classList.remove('active');
    this.transferTarget = null;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close" id="close-transfer-modal">×</button>
        <h2 style="margin-bottom: var(--space-4);">Transfer to Another User</h2>

        <div class="form-group">
          <label>Recipient's Full Name</label>
          <input type="text" id="transfer-search" class="input" placeholder="Type a full name..." autocomplete="off">
          <div class="transfer-results" id="transfer-results"></div>
          <div class="transfer-selected" id="transfer-selected">
            <span class="transfer-selected-name" id="transfer-selected-name"></span>
            <button class="transfer-selected-x" onclick="walletInstance.clearTransferUser()">×</button>
          </div>
        </div>

        <div class="form-group" style="margin-top: var(--space-4);">
          <label>Amount (₦)</label>
          <input type="number" id="transfer-amount" class="input" placeholder="e.g. 5000" min="1">
        </div>

        <button class="btn-primary" id="transfer-send-btn" style="width: 100%; margin-top: var(--space-4);">Send</button>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('close-transfer-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.getElementById('transfer-search').addEventListener('input', (e) => this.searchTransferUsers(e.target.value));
    document.getElementById('transfer-send-btn').addEventListener('click', () => this.sendTransfer(modal));
  },

  searchTransferUsers(query) {
    clearTimeout(this.transferSearchTimer);
    const results = document.getElementById('transfer-results');
    if (!results) return;

    const q = query.trim();
    if (q.length < 2) {
      results.classList.remove('active');
      results.innerHTML = '';
      return;
    }

    this.transferSearchTimer = setTimeout(async () => {
      const { data } = await supabase.from('profiles')
        .select('id, full_name, avatar_url, total_gp')
        .ilike('full_name', `%${q}%`)
        .neq('id', store.user.id)
        .limit(8);

      const list = data || [];
      this.transferSearchList = list;

      if (list.length === 0) {
        results.innerHTML = '<div class="transfer-empty">No users found.</div>';
        results.classList.add('active');
        return;
      }

      results.innerHTML = list.map(u => {
        const cls = tierClass(u.total_gp, 'transfer-result-avatar');
        const av = u.avatar_url ? `<img src="${u.avatar_url}" class="${cls}" style="object-fit:cover;">` : `<div class="${cls}">${(u.full_name || 'G').charAt(0).toUpperCase()}</div>`;
        return `<div class="transfer-result" onclick="walletInstance.selectTransferUser('${u.id}')">${av}<div class="transfer-result-info"><span class="transfer-result-name">${escapeHtml(u.full_name || 'Gliimait')}</span><span class="transfer-result-gp">${u.total_gp || 0} GP</span></div></div>`;
      }).join('');
      results.classList.add('active');
    }, 250);
  },

  selectTransferUser(id) {
    const u = (this.transferSearchList || []).find(x => x.id === id);
    if (!u) return;

    this.transferTarget = u;
    document.getElementById('transfer-selected-name').innerText = u.full_name || 'Gliimait';
    document.getElementById('transfer-selected').classList.add('active');
    document.getElementById('transfer-results').classList.remove('active');
    document.getElementById('transfer-search').value = u.full_name || '';
    document.getElementById('transfer-amount')?.focus();
  },

  clearTransferUser() {
    this.transferTarget = null;
    document.getElementById('transfer-selected')?.classList.remove('active');
    const search = document.getElementById('transfer-search');
    if (search) { search.value = ''; search.focus(); }
  },

  async sendTransfer(modal) {
    if (!this.transferTarget) return appAlert("Select the user you want to transfer to.");

    const amount = parseInt(document.getElementById('transfer-amount').value, 10);
    if (!amount || amount <= 0) return appAlert("Enter a valid amount.");

    const name = this.transferTarget.full_name || 'this user';
    const ok = await appConfirm(`Send ₦${amount.toLocaleString()} to ${name}?`);
    if (!ok) return;

    const btn = document.getElementById('transfer-send-btn');
    btn.disabled = true;
    btn.innerText = 'Sending...';

    const { error } = await supabase.rpc('transfer_to_user', {
      p_receiver: this.transferTarget.id,
      p_amount: amount
    });

    if (error) {
      btn.disabled = false;
      btn.innerText = 'Send';
      const msg = error.message || '';
      if (msg.includes('INSUFFICIENT_FUNDS')) return appAlert("You don't have enough in your bill for this transfer.");
      if (msg.includes('CANNOT_TRANSFER_SELF')) return appAlert("You can't transfer to yourself.");
      if (msg.includes('RECEIVER_NOT_FOUND')) return appAlert("That user no longer exists.");
      if (msg.includes('INVALID_AMOUNT')) return appAlert("Enter a valid amount.");
      return appAlert("Transfer failed: " + msg);
    }

    modal.remove();
    await appAlert(`₦${amount.toLocaleString()} sent to ${name}.`);
    await this.fetchData();
    this.render();
  },

  // ============================================
  // SUBSCRIPTION
  // ============================================
  async buyPlan(planId) {
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) return;
    if (this.getActivePlan() === planId) return;

    const ok = await appConfirm(`Subscribe to the ${plan.name} for ₦${plan.price.toLocaleString()}? It will be paid from your bill.`);
    if (!ok) return;

    const btn = document.querySelector(`.plan-buy[data-plan="${planId}"]`);
    if (btn) { btn.disabled = true; btn.innerText = 'Processing...'; }

    const { data, error } = await supabase.rpc('purchase_subscription', { p_plan: plan.id });

    if (error) {
      if (btn) { btn.disabled = false; btn.innerText = `Buy ${plan.short}`; }
      const msg = error.message || '';
      if (msg.includes('INSUFFICIENT_FUNDS')) return appAlert("You don't have enough in your bill to buy this plan.");
      if (msg.includes('INVALID_PLAN')) return appAlert("That plan is not available.");
      return appAlert("Subscription failed: " + msg);
    }

    const expires = data?.expires_at
      ? new Date(data.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : null;
    await appAlert(`${plan.name} activated!${expires ? ` Valid until ${expires}.` : ''}`);
    await this.fetchData();
    this.render();
  },

  openTopUpModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close" id="close-modal">×</button>
        <h2 style="margin-bottom: var(--space-4);">Fund Your Bill</h2>

        <div class="form-group">
          <label>Enter Amount (₦)</label>
          <input type="number" id="topup-amount" class="input" placeholder="e.g. 5000" min="100">
        </div>

        <button id="generate-details-btn" class="btn-primary" style="width: 100%; margin-bottom: var(--space-4);">Generate Bank Details</button>

        <div id="bank-details-area" style="display: none;">
          <div class="info-banner" style="margin-bottom: var(--space-4); padding: 16px; background: var(--brand-primary-light); border-radius: 8px;">
            <p style="color: var(--text-secondary); font-size: 14px;">Transfer the exact amount to the account below. Use the <strong>Reference Code</strong> as the narration. Your bill will be funded after confirmation.</p>
          </div>

          <div class="bank-details-box">
            <div class="bd-row"><span>Bank:</span> <strong id="bd-bank"></strong></div>
            <div class="bd-row"><span>Account No:</span> <strong id="bd-acct"></strong></div>
            <div class="bd-row"><span>Account Name:</span> <strong>Gliimu ltd</strong></div>
            <div class="bd-row highlight"><span>Reference:</span> <strong id="bd-ref"></strong></div>
          </div>

          <button id="confirm-sent-btn" class="btn-secondary" style="width: 100%; margin-top: var(--space-4);">I Have Sent the Cash</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    document.getElementById('generate-details-btn').addEventListener('click', () => {
      const amount = parseInt(document.getElementById('topup-amount').value);
      if (!amount || amount < 100) return appAlert("Please enter a valid amount (min ₦100).");

      const banks = [
        { name: 'Opay', acct: '7058929080' },
        { name: 'Moniepoint', acct: '7058929080' }
      ];
      const selectedBank = banks[Math.floor(Math.random() * banks.length)];
      const username = store.profile.username || 'GLII';
      const ref = `GLI-${username.substring(0, 4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

      this.pendingTopUp = { amount, bank: selectedBank, ref };

      document.getElementById('bd-bank').innerText = selectedBank.name;
      document.getElementById('bd-acct').innerText = selectedBank.acct;
      document.getElementById('bd-ref').innerText = ref;

      document.getElementById('bank-details-area').style.display = 'block';
      document.getElementById('generate-details-btn').style.display = 'none';
    });

    document.getElementById('confirm-sent-btn').addEventListener('click', async (e) => {
      const btn = e.target;
      btn.innerText = 'Logging...';
      btn.disabled = true;

      const { amount, ref } = this.pendingTopUp;

      const { error } = await supabase.from('transactions').insert({
        user_id: store.user.id,
        amount: amount,
        type: 'topup',
        status: 'pending',
        reference: ref,
        description: 'Bill Top-up'
      });

      if (error) {
        await appAlert("Error logging transaction.");
        btn.innerText = 'I Have Sent the Cash';
        btn.disabled = false;
        return;
      }

      await appAlert("Transaction received! Your bill will be credited once the payment is verified.");
      modal.remove();
      await this.fetchData();
      this.render();
    });
  }
};
