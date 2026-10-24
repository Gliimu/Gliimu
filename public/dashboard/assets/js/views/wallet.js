import { supabase, API_BASE_URL } from '/shared/js/config.js';
import { store, tierClass } from '../store.js';
import { getBalance, getConfig, setPlan, initTopup } from '../heartbeat.js';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TX_TYPE_LABELS = {
  purchase: 'Purchase',
  support: 'Creator support',
  live_support: 'Live support',
  live_entry: 'Live session entry',
  live_session: 'Live session',
  subscription: 'Subscription',
  transfer_out: 'Transfer out',
  transfer_in: 'Transfer in',
  topup: 'Wallet top-up',
  reward: 'GP reward',
  bill_payment: 'Bill payment',
  refund: 'Refund',
  adjustment: 'Adjustment'
};

const PLAN_LABELS = {
  payngo: "Pay n' Go",
  monthly: 'Monthly',
  yearly: 'Yearly'
};

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
      choosePaymentMethod: (m) => this.choosePaymentMethod(m),
      toggleTransferMenu: () => this.toggleTransferMenu(),
      transferToBank: () => this.transferToBank(),
      openTransferModal: () => this.openTransferModal(),
      toggleFilterMenu: () => this.toggleFilterMenu(),
      selectTransferUser: (id) => this.selectTransferUser(id),
      clearTransferUser: () => this.clearTransferUser(),
      activatePlan: (type) => this.activatePlan(type),
      openReferralModal: () => this.openReferralModal(),
      copyReferralCode: (code) => this.copyReferralCode(code),
      copyReferralLink: (link) => this.copyReferralLink(link)
    };

    this.currentTab = 'summary';
    this.balance = 0;
    this.plan = null;
    this.config = null;
    this.allTransactions = [];
    this.transferTarget = null;
    this.transferSearchList = [];
    this.transferSearchTimer = null;

    document.addEventListener('click', () => {
      document.getElementById('wallet-transfer-menu')?.classList.remove('active');
      document.getElementById('billing-filter-menu')?.classList.remove('active');
    });

    this.setupTopbar();
    await this.fetchData();
    this.render();
    await this.checkPaystackReturn();
  },

  setupTopbar() {
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    if (topbarDynamic) {
      topbarDynamic.innerHTML = `<span class="mobile-bar-hint">G${Number(this.balance || 0).toLocaleString()} balance</span>`;
    }
  },

  async fetchData() {
    if (!store.user || !store.user.id) return;

    const balanceData = await getBalance();
    this.balance = Number(balanceData?.balance || 0);
    this.plan = balanceData?.plan || null;

    this.config = await getConfig();

    const { data: transactions } = await supabase
      .from('transactions')
      .select('id, user_id, amount, points, type, status, reference, description, created_at')
      .eq('user_id', store.user.id)
      .order('created_at', { ascending: false });

    this.allTransactions = transactions || [];

    if (store.profile) store.profile.wallet_balance = this.balance;
  },

  render() {
    const container = document.getElementById('wallet-container');
    if (!container) return;

    const planLabel = this.plan?.plan_type ? (PLAN_LABELS[this.plan.plan_type] || this.plan.plan_type) : "Pay n' Go";

    container.innerHTML = `
      <div class="wallet-header-card">
        <span class="balance-label">Wallet Balance</span>
        <h1 class="balance-amount">G${this.balance.toLocaleString()}</h1>
        <div style="font-size: 13px; opacity: 0.85; margin-bottom: 16px;">Plan: ${escapeHtml(planLabel)}</div>
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
          <button class="icon-btn-light" title="Refer & Earn" onclick="walletInstance.openReferralModal()">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
          </button>
        </div>
      </div>

      <div class="billing-toolbar">
        <div class="wallet-filter-wrap" onclick="event.stopPropagation();">
          <button class="billing-filter-btn" title="Filter" onclick="walletInstance.toggleFilterMenu()">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
          </button>
          <div class="billing-filter-menu" id="billing-filter-menu">
            <div class="billing-filter-item ${this.currentTab === 'summary' ? 'active' : ''}" data-tab="summary" onclick="walletInstance.switchTab('summary')">Summary</div>
            <div class="billing-filter-item ${this.currentTab === 'trxn' ? 'active' : ''}" data-tab="trxn" onclick="walletInstance.switchTab('trxn')">Trxn</div>
            <div class="billing-filter-item ${this.currentTab === 'plans' ? 'active' : ''}" data-tab="plans" onclick="walletInstance.switchTab('plans')">Plans</div>
          </div>
        </div>
      </div>

      <div id="wallet-tab-content" class="wallet-tab-content">
        ${this.renderTabContent()}
      </div>
    `;
  },

  renderTabContent() {
    if (this.currentTab === 'summary') return this.renderSummary();
    if (this.currentTab === 'trxn') return this.renderTransactions();
    if (this.currentTab === 'plans') return this.renderPlans();
    return '';
  },

  renderSummary() {
    const planType = this.plan?.plan_type || 'payngo';
    const planLabel = PLAN_LABELS[planType] || planType;
    const expiresAt = this.plan?.expires_at;
    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
    const daysLeft = (d) => d ? Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)) : 0;

    const perMin = Number(this.config?.per_minute_rate_gliits || 3);

    let planDetail = '';
    if (planType === 'payngo') {
      planDetail = `
        <div class="sub-row"><span>Rate</span><strong>G${perMin}/minute</strong></div>
        <div class="sub-row"><span>Billing</span><strong>Deducted from wallet</strong></div>
      `;
    } else if (expiresAt) {
      planDetail = `
        <div class="sub-row"><span>Active until</span><strong>${fmt(expiresAt)} (${daysLeft(expiresAt)} days)</strong></div>
        <div class="sub-row"><span>Billing</span><strong>Unlimited usage</strong></div>
      `;
    }

    return `
      <div class="card sub-card">
        <div class="sub-header">
          <h3>${escapeHtml(planLabel)} Plan</h3>
          <span class="sub-badge active">Active</span>
        </div>
        <div class="sub-details">
          ${planDetail}
        </div>
      </div>
      <div class="card stat-card" style="margin-top: 16px;">
        <div class="stat-row">
          <div class="stat-icon-wrap bg-brand">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">G${this.balance.toLocaleString()}</span>
            <span class="stat-label">Available Balance</span>
          </div>
        </div>
      </div>
      <div class="card stat-card" style="margin-top: 16px;">
        <div class="stat-row">
          <div class="stat-icon-wrap bg-success">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">${this.allTransactions.filter(t => t.type === 'topup' || (t.amount && t.amount > 0)).length}</span>
            <span class="stat-label">Top-ups</span>
          </div>
        </div>
      </div>
    `;
  },

  renderTransactions() {
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
  },

  renderPlans() {
    const currentPlan = this.plan?.plan_type || 'payngo';
    const monthlyPrice = Number(this.config?.plan_monthly_price_gliits || 3600);
    const yearlyPrice = Number(this.config?.plan_yearly_price_gliits || 32400);
    const perMin = Number(this.config?.per_minute_rate_gliits || 3);

    const check = (text) => `
      <li class="plan-feature">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>${text}</span>
      </li>`;

    const btn = (planType, label) => {
      if (currentPlan === planType) {
        return `<button class="plan-buy active-plan" disabled>Current Plan</button>`;
      }
      return `<button class="plan-buy btn-primary" onclick="walletInstance.activatePlan('${planType}')">${label}</button>`;
    };

    return `
      <div class="plan-list">
        <div class="plan-card">
          <span class="plan-name">Pay n' Go</span>
          <div class="plan-price">G${perMin}/min</div>
          <span class="plan-price-note">deducted from wallet</span>
          <ul class="plan-features">
            ${check('Full platform access')}
            ${check('Pay only for what you use')}
            ${check('No commitment')}
            ${check('Top up anytime')}
          </ul>
          ${btn('payngo', 'Switch to Pay n\' Go')}
        </div>
        <div class="plan-card">
          <span class="plan-name">Monthly</span>
          <div class="plan-price">G${monthlyPrice.toLocaleString()}</div>
          <span class="plan-price-note">per month · unlimited</span>
          <ul class="plan-features">
            ${check('Unlimited usage')}
            ${check('No per-minute charges')}
            ${check('All content accessible')}
            ${check('Cancel anytime')}
          </ul>
          ${btn('monthly', 'Go Monthly')}
        </div>
        <div class="plan-card">
          <span class="plan-name">Yearly</span>
          <div class="plan-price">G${yearlyPrice.toLocaleString()}</div>
          <span class="plan-price-note">per year · unlimited</span>
          <ul class="plan-features">
            ${check('Unlimited usage')}
            ${check('Best value')}
            ${check('All content accessible')}
            ${check('12 months covered')}
          </ul>
          ${btn('yearly', 'Go Yearly')}
        </div>
      </div>
    `;
  },

  renderTxItem(tx) {
    let icon = '';
    let label = tx.description || TX_TYPE_LABELS[tx.type] || 'Transaction';
    let amountClass = 'amount-negative';
    let amountPrefix = '-';

    if (tx.amount > 0) {
      amountClass = 'amount-positive';
      amountPrefix = '+';
    }

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

    const isPurePoints = (!tx.amount || tx.amount === 0) && tx.points > 0;

    if (isPurePoints) {
      icon = `<img src="/icons/icon.png" class="txn-gp-icon" alt="GP">`;
    }

    const pointsHtml = !isPurePoints && tx.points && tx.points > 0 ? `<span class="txn-points">+${tx.points} GP</span>` : '';
    const amountHtml = isPurePoints
      ? `<span class="txn-amount amount-positive">+${tx.points} GP</span>`
      : `<span class="txn-amount ${amountClass}">${amountPrefix}G${Math.abs(tx.amount).toLocaleString()}</span>`;

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
  // PLANS
  // ============================================
  async activatePlan(planType) {
    const labels = { payngo: "Pay n' Go", monthly: 'Monthly', yearly: 'Yearly' };
    const prices = {
      monthly: Number(this.config?.plan_monthly_price_gliits || 3600),
      yearly: Number(this.config?.plan_yearly_price_gliits || 32400)
    };

    let confirmMsg = '';
    if (planType === 'payngo') {
      confirmMsg = "Switch to Pay n' Go?\n\nYou'll be charged G3 per minute of usage from your wallet balance. No subscription fee.";
    } else {
      confirmMsg = `Switch to ${labels[planType]} for G${prices[planType].toLocaleString()}?\n\nUnlimited usage for ${planType === 'monthly' ? '1 month' : '1 year'}. Paid from your wallet balance.`;
    }

    const ok = await appConfirm(confirmMsg, { okText: 'Switch' });
    if (!ok) return;

    const { data, error } = await setPlan(planType);
    if (error) {
      const msg = error.message || '';
      if (msg.includes('INSUFFICIENT_BALANCE')) {
        const short = (prices[planType] || 0) - this.balance;
        await appAlert(`You need G${short.toLocaleString()} more in your wallet. Top up and try again.`);
        this.openTopUpModal();
        return;
      }
      return appAlert('Could not switch plan: ' + msg);
    }

    await appAlert(`You're now on ${labels[planType]}!`);
    await this.fetchData();
    this.render();
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
          <label>Amount (G)</label>
          <input type="number" id="transfer-amount" class="input" placeholder="e.g. 100" min="1">
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
        const av = u.avatar_url ? `<img src="${u.avatar_url}" class="${cls}" style="object-fit:cover;">` : `<div class="${cls}"></div>`;
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
    const password = await appPrompt(`To send G${amount.toLocaleString()} to ${name}, please enter your password:`, { inputType: 'password', okText: 'Send' });
    if (password === null) return;
    if (!password) return appAlert('Please enter your password.');

    const fakeEmail = `${store.profile.username}@gliimu.app`;
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: fakeEmail, password });
    if (signInError) return appAlert('Incorrect password. Transfer cancelled.');

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
      if (msg.includes('INSUFFICIENT_FUNDS')) return appAlert("You don't have enough in your wallet for this transfer.");
      if (msg.includes('CANNOT_TRANSFER_SELF')) return appAlert("You can't transfer to yourself.");
      if (msg.includes('RECEIVER_NOT_FOUND')) return appAlert("That user no longer exists.");
      if (msg.includes('INVALID_AMOUNT')) return appAlert("Enter a valid amount.");
      return appAlert("Transfer failed: " + msg);
    }

    modal.remove();
    await appAlert(`G${amount.toLocaleString()} sent to ${name}.`);
    await this.fetchData();
    this.render();
  },

  // ============================================
  // FUND WALLET (top-up via Paystack / bank transfer)
  // ============================================
  openTopUpModal() {
    if (document.getElementById('wallet-fund-modal')) return;

    const minTopup = Number(this.config?.min_topup_gliits || 100);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'wallet-fund-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close" id="fund-close-btn">×</button>

        <div id="fund-picker-screen">
          <h2 style="margin-bottom: 6px;">Top Up Wallet</h2>
          <p class="fund-subtitle">Add Gliits (G) to your balance. Minimum G${minTopup}.</p>

          <div class="form-group" style="margin-top: var(--space-4);">
            <label>Amount (G)</label>
            <input type="number" id="topup-amount" class="input" placeholder="e.g. 500" min="${minTopup}">
            <div id="naira-equivalent" class="muted small" style="margin-top: 6px; font-size: 0.9em;"></div>
          </div>

          <div class="pay-methods">
            <div class="pay-method" onclick="walletInstance.choosePaymentMethod('bank')">
              <div class="pay-method-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l7-4 7 4v14"></path><path d="M9 21v-4h6v4"></path></svg>
              </div>
              <div class="pay-method-info">
                <span class="pay-method-name">Direct Bank Transfer</span>
                <span class="pay-method-note">Manual verification · up to 24 hours</span>
              </div>
              <span class="pay-method-chevron">›</span>
            </div>

            <div class="pay-method" onclick="walletInstance.choosePaymentMethod('paystack')">
              <div class="pay-method-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
              </div>
              <div class="pay-method-info">
                <span class="pay-method-name">Paystack</span>
                <span class="pay-method-note">Card, bank or USSD · instant</span>
              </div>
              <span class="pay-method-chevron">›</span>
            </div>
          </div>
        </div>

        <div id="fund-bank-screen" style="display: none;">
          <button class="fund-back" id="fund-back-btn">← All methods</button>
          <h2 style="margin-bottom: var(--space-4);">Bank Transfer</h2>

          <div class="info-banner" style="margin-bottom: var(--space-4); padding: 16px; background: var(--brand-primary-light); border-radius: 8px;">
            <p style="color: var(--text-secondary); font-size: 14px;">Transfer <strong id="bd-amount"></strong> exactly to the account below. Use the <strong>Reference Code</strong> as the narration. Your wallet will be credited after confirmation.</p>
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

    document.getElementById('fund-close-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.getElementById('fund-back-btn').addEventListener('click', () => this.backToMethods());
    document.getElementById('confirm-sent-btn').addEventListener('click', (e) => this.confirmBankSent(e.target));
    
    // Live Naira conversion
    const amountInput = document.getElementById('topup-amount');
    const nairaDisplay = document.getElementById('naira-equivalent');
    const exchangeRate = Number(this.config?.exchange_rate_naira_to_gliits || 1.0);
    
    amountInput.addEventListener('input', () => {
      const gliitsAmount = Number(amountInput.value);
      if (gliitsAmount > 0) {
        const nairaAmount = gliitsAmount / exchangeRate;
        nairaDisplay.textContent = `= ₦${nairaAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} (at ₦${exchangeRate} = G1)`;
      } else {
        nairaDisplay.textContent = '';
      }
    });
  },

  backToMethods() {
    document.getElementById('fund-bank-screen').style.display = 'none';
    document.getElementById('fund-picker-screen').style.display = 'block';
  },

  readTopUpAmount() {
    const minTopup = Number(this.config?.min_topup_gliits || 100);
    const amount = parseInt(document.getElementById('topup-amount').value, 10);
    if (!amount || amount < minTopup) {
      appAlert(`Please enter a valid amount (min G${minTopup}).`);
      return null;
    }
    return amount;
  },

  logPaymentAttempt(method) {
    supabase.from('payment_attempts')
      .insert({ user_id: store.user.id, method })
      .then(() => {}, () => {});
  },

  choosePaymentMethod(method) {
    const amount = this.readTopUpAmount();
    if (!amount) return;

    if (method === 'bank') {
      this.logPaymentAttempt('bank_transfer');
      const banks = [
        { name: 'Opay', acct: '7058929080' },
        { name: 'Moniepoint', acct: '7058929080' }
      ];
      const selectedBank = banks[Math.floor(Math.random() * banks.length)];
      const username = store.profile.username || 'GLII';
      const ref = `GLI-${username.substring(0, 4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

      this.pendingTopUp = { amount, bank: selectedBank, ref };

      const exchangeRate = Number(this.config?.exchange_rate_naira_to_gliits || 1.0);
      const nairaAmount = amount / exchangeRate;
      document.getElementById('bd-amount').innerHTML = `G${amount.toLocaleString()} <span style="color: var(--text-secondary); font-weight: normal;">(₦${nairaAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })})</span>`;
      document.getElementById('bd-bank').innerText = selectedBank.name;
      document.getElementById('bd-acct').innerText = selectedBank.acct;
      document.getElementById('bd-ref').innerText = ref;

      document.getElementById('fund-picker-screen').style.display = 'none';
      document.getElementById('fund-bank-screen').style.display = 'block';
      return;
    }

    if (method === 'paystack') {
      this.logPaymentAttempt('paystack');
      this.startPaystack(amount);
      return;
    }
  },

  async startPaystack(gliitsAmount) {
    document.getElementById('wallet-fund-modal')?.remove();

    try {
      const data = await initTopup(gliitsAmount);
      if (!data.authorization_url) {
        throw new Error('Could not start Paystack checkout.');
      }
      window.location.href = data.authorization_url;
    } catch (err) {
      await appAlert("Paystack checkout failed: " + err.message);
    }
  },

  async checkPaystackReturn() {
    const hash = window.location.hash || '';
    const source = hash + '&' + (window.location.search || '');
    const match = source.match(/[?&](?:reference|trxref)=([A-Za-z0-9._-]+)/);
    if (!match) return;

    const reference = match[1];
    history.replaceState(null, '', `${location.pathname}#/wallet`);

    try {
      const res = await fetch(`${API_BASE_URL}/api/paystack/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference })
      });
      const data = await res.json();

      if (data.credited) {
        const unit = data.gliits ? 'G' : 'G';
        const amt = data.gliits || data.amount || 0;
        await appAlert(`Wallet funded! ${unit}${Number(amt).toLocaleString()} has been added to your balance.`);
        await this.fetchData();
        this.render();
        return;
      }
      if (data.reason === 'duplicate') {
        await this.fetchData();
        this.render();
        return;
      }
      await appAlert("We couldn't confirm this payment yet. If you were debited, your wallet will be credited automatically.");
    } catch (err) {
      await appAlert("Payment confirmation is taking longer than usual. If you were debited, your wallet will be credited automatically.");
    }
  },

  async confirmBankSent(btn) {
    btn.innerText = 'Logging...';
    btn.disabled = true;

    const { amount, ref } = this.pendingTopUp;

    const { error } = await supabase.from('transactions').insert({
      user_id: store.user.id,
      amount: amount,
      type: 'topup',
      status: 'pending',
      reference: ref,
      description: 'Wallet Top-up'
    });

    if (error) {
      await appAlert("Error logging transaction.");
      btn.innerText = 'I Have Sent the Cash';
      btn.disabled = false;
      return;
    }

    await appAlert("Transaction received! Your wallet will be credited once the payment is verified.");
    document.getElementById('wallet-fund-modal')?.remove();
    await this.fetchData();
    this.render();
  },

  // ============================================
  // REFERRAL
  // ============================================
  async openReferralModal() {
    const { data: summary } = await supabase.rpc('referral_summary', {})
      .then((r) => (r.error ? null : r.data), () => null);

    const code = summary?.code || '';
    const fullLink = code ? `https://gliimu.com/?ref=${code}` : '';
    const pending = summary?.pending || 0;
    const vested = summary?.vested || 0;
    const gpEarned = Number(summary?.gp_earned || 0).toLocaleString();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'referral-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 420px;">
        <button class="modal-close" id="close-referral-modal">&times;</button>
        <h2 style="margin-bottom: 8px;">Refer & earn</h2>
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 20px;">Invite friends to Gliimu and earn GP when they sign up.</p>
        ${!code ? '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Sign in to get your referral code.</p>' : `
          <div style="background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">Your code</div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="flex: 1; font-size: 18px; font-weight: 700; color: var(--text-primary); letter-spacing: 1px;">${escapeHtml(code)}</div>
              <button class="btn-secondary" style="padding: 8px 12px; font-size: 13px;" onclick="walletInstance.copyReferralCode('${escapeHtml(code)}')">Copy</button>
            </div>
          </div>
          <div style="background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">Your link</div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="flex: 1; font-size: 13px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(fullLink)}</div>
              <button class="btn-secondary" style="padding: 8px 12px; font-size: 13px;" onclick="walletInstance.copyReferralLink('${escapeHtml(fullLink)}')">Copy</button>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center;">
            <div>
              <div style="font-size: 20px; font-weight: 800; color: var(--text-primary);">${pending}</div>
              <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Pending</div>
            </div>
            <div>
              <div style="font-size: 20px; font-weight: 800; color: var(--text-primary);">${vested}</div>
              <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Vested</div>
            </div>
            <div>
              <div style="font-size: 20px; font-weight: 800; color: var(--brand-primary);">${gpEarned}</div>
              <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">GP earned</div>
            </div>
          </div>
        `}
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('close-referral-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  },

  async copyReferralCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      await appAlert('Referral code copied.');
    } catch { await appAlert('Could not copy to clipboard.'); }
  },

  async copyReferralLink(link) {
    try {
      await navigator.clipboard.writeText(link);
      await appAlert('Referral link copied.');
    } catch { await appAlert('Could not copy to clipboard.'); }
  }
};
