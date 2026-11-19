import { supabase, API_BASE_URL } from '/shared/js/config.js?v=2';
import { store, tierClass } from '../store.js?v=3';
import { getBalance, getConfig, setPlan, initTopup } from '../heartbeat.js?v=10';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Every number on this page is a token amount — the heading says so, so the
// figures do not repeat the word. Identifiers still say gliits.
function tokensText(value) {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
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
  withdrawal: 'Payout to bank',
  withdrawal_refund: 'Payout returned',
  adjustment: 'Adjustment'
};

// Mirrors the SQL comparison in request_withdrawal, so the client's verdict is
// the same one the database will reach when the payout is queued.
const samePayoutName = (a, b) => String(a || '').toLowerCase().replace(/\s+/g, ' ').trim()
  === String(b || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Every payout RPC answers {ok:false, code} instead of raising, so the codes
// are the contract with the member.
const PAYOUT_ERRORS = {
  NOT_AUTHENTICATED: 'Your session expired. Please open this again.',
  MISSING_CONFIG: 'Withdrawals are not switched on yet.',
  INVALID_AMOUNT: 'Enter a valid amount.',
  BELOW_MINIMUM: 'That is below the smallest payout we can send.',
  ABOVE_MAXIMUM: 'That is more than one payout can carry. Ask Support if you need it split.',
  INSUFFICIENT_FUNDS: 'Your wallet does not hold that much.',
  NO_PAYOUT_DETAILS: 'Add the bank account to receive it first.',
  NEED_BANK_VERIFICATION: 'Your bank account still needs confirming with the bank.',
  PAYOUT_IN_FLIGHT: 'A payout is already on its way to your account.',
  ONE_PER_DAY: 'One payout a day. Please try again tomorrow.',
  RECENT_TOPUP: 'Gliims you bought very recently are still on hold.',
  BAD_NAME: 'Set the full name on your bank account in Settings first.',
  BAD_PHONE: 'Enter a valid phone number.',
  BAD_ACCOUNT: 'Enter the 10-digit account number.',
  BAD_BANK: 'Pick your bank.',
  ACCOUNT_IN_USE: 'Another member already receives payouts on that account number.',
  NOT_FOUND: 'We could not load your account.',
  NOT_RESOLVED: 'The bank did not answer for that account number. Check it and try again.',
  CANNOT_CANCEL: 'That payout is already with the bank.'
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
      openTransferModal: () => this.openTransferModal(),
      openWithdrawModal: () => this.openWithdrawModal(),
      toggleFilterMenu: () => this.toggleFilterMenu(),
      selectTransferUser: (id) => this.selectTransferUser(id),
      clearTransferUser: () => this.clearTransferUser(),
      activatePlan: (type) => this.activatePlan(type),
      openReferralModal: () => this.openReferralModal(),
      copyReferralLink: (link) => this.copyReferralLink(link)
    };

    this.currentTab = 'summary';
    this.balance = 0;
    this.plan = null;
    this.config = null;
    this.allTransactions = [];
    this.earnings = null;
    this.referralSummary = null;
    this.referralCount = 0;
    this.totalMinutes = 0;
    this.transferTarget = null;
    this.transferSearchList = [];
    this.transferSearchTimer = null;

    document.addEventListener('click', () => {
      document.getElementById('billing-filter-menu')?.classList.remove('active');
    });

    this.setupTopbar();
    await this.fetchData();
    this.setupTopbar();
    this.render();
    await this.checkPaystackReturn();
  },

  setupTopbar() {
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    if (topbarDynamic) {
      topbarDynamic.innerHTML = `<span class="mobile-bar-hint">${this.formatTime(this.totalMinutes)} read</span>`;
    }
  },

  formatTime(minutes) {
    const m = Number(minutes || 0);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem ? `${h}h ${rem}m` : `${h}h`;
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

    const referralResult = await supabase.rpc('referral_summary', {});
    this.referralSummary = referralResult?.data || null;
    this.referralCount = Number(referralResult?.data?.pending || 0) + Number(referralResult?.data?.vested || 0);

    const earningsResult = await supabase.rpc('gliits_earnings');
    this.earnings = earningsResult?.data || null;

    const { count } = await supabase
      .from('gliits_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', store.user.id);
    this.totalMinutes = count || 0;

    if (store.profile) store.profile.wallet_balance = this.balance;
  },

  render() {
    const container = document.getElementById('wallet-container');
    if (!container) return;

    const planLabel = this.plan?.plan_type ? (PLAN_LABELS[this.plan.plan_type] || this.plan.plan_type) : "Pay n' Go";

    container.innerHTML = `
      <div class="wallet-header-card">
        <span class="balance-label">Token Balance</span>
        <h1 class="balance-amount">${tokensText(this.balance)}</h1>
        <div style="font-size: 13px; opacity: 0.85; margin-bottom: 16px;">Plan: ${escapeHtml(planLabel)}</div>
        <div class="wallet-actions">
          <div class="wallet-action">
            <button class="icon-btn-light" title="Add funds" onclick="walletInstance.openTopUpModal()">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <span class="wallet-action-label">Fund</span>
          </div>
          <div class="wallet-action">
            <button class="icon-btn-light" title="Send tokens to another member" onclick="walletInstance.openTransferModal()">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="10.49"></line><line x1="15.41" y1="14.51" x2="8.59" y2="11.49"></line></svg>
            </button>
            <span class="wallet-action-label">Share</span>
          </div>
          <div class="wallet-action">
            <button class="icon-btn-light" title="Withdraw to your bank account" onclick="walletInstance.openWithdrawModal()">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l7-4 7 4v14"></path><path d="M9 21v-4h6v4"></path></svg>
            </button>
            <span class="wallet-action-label">Withdraw</span>
          </div>
          <div class="wallet-action">
            <button class="icon-btn-light" title="Refer & Earn" onclick="walletInstance.openReferralModal()">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
            </button>
            <span class="wallet-action-label">Refer</span>
          </div>
        </div>
      </div>

      <div class="billing-toolbar">
        <div class="wallet-filter-wrap" onclick="event.stopPropagation();">
          <button class="billing-filter-btn" title="Filter" onclick="walletInstance.toggleFilterMenu()">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
          </button>
          <div class="billing-filter-menu" id="billing-filter-menu">
            <div class="billing-filter-item ${this.currentTab === 'summary' ? 'active' : ''}" data-tab="summary" onclick="walletInstance.switchTab('summary')">Summary</div>
            <div class="billing-filter-item ${this.currentTab === 'earnings' ? 'active' : ''}" data-tab="earnings" onclick="walletInstance.switchTab('earnings')">Earnings</div>
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
    if (this.currentTab === 'earnings') return this.renderEarnings();
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

    let planDetail = '';
    if (planType !== 'payngo' && expiresAt) {
      planDetail = `
        <div class="sub-row"><span>Active until</span><strong>${fmt(expiresAt)} (${daysLeft(expiresAt)} days)</strong></div>
        <div class="sub-row"><span>Billing</span><strong>Unlimited usage</strong></div>
      `;
    }

    let planMessage = '';
    if (planType === 'payngo') {
      planMessage = `<p class="plan-upgrade-hint">Get the best deal with <a href="#" onclick="window.walletInstance.switchTab('plans'); return false;">unlimited plans</a></p>`;
    } else if (planType === 'monthly') {
      planMessage = `<p class="plan-upgrade-hint">Annual plan helps you <a href="#" onclick="window.walletInstance.switchTab('plans'); return false;">SAVE MORE!!!</a></p>`;
    } else if (planType === 'yearly') {
      planMessage = `<p class="plan-upgrade-hint plan-upgrade-congrats">Congratulations, you have the best value</p>`;
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
      ${planMessage}
      <div class="card stat-card" style="margin-top: 16px;">
        <div class="stat-row">
          <div class="stat-icon-wrap bg-brand">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">${this.formatTime(this.totalMinutes)}</span>
            <span class="stat-label">Time Spent</span>
          </div>
        </div>
      </div>
      <div class="card stat-card" style="margin-top: 16px;">
        <div class="stat-row">
          <div class="stat-icon-wrap bg-success">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">${this.referralCount || 0}</span>
            <span class="stat-label">Referrals</span>
          </div>
        </div>
      </div>
    `;
  },

  renderEarnings() {
    const e = this.earnings || {};
    const totalG = Number(e.total_gliits || 0);
    const minutes = Number(e.total_minutes || 0);
    const last30 = Number(e.earned_30d || 0);
    const gpEarned = Number(e.total_gp || 0);
    const supportReceived = Number(e.support_received || 0);
    const referralGp = Number(this.referralSummary?.gp_earned || 0);
    const topPosts = Array.isArray(e.top_posts) ? e.top_posts : [];

    const postsHtml = topPosts.length === 0
      ? '<p style="color: var(--text-muted); text-align: center; padding: 24px 0;">No creator earnings yet.</p>'
      : `<div class="txn-list">
          ${topPosts.map(p => `
            <div class="txn-item">
              <div class="txn-icon bg-brand"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg></div>
              <div class="txn-info">
                <span class="txn-title">${escapeHtml(p.title)}</span>
                <span class="txn-date">${Number(p.minutes || 0).toLocaleString()} min read</span>
              </div>
              <div class="txn-right">
                <span class="txn-amount amount-positive">+${tokensText(Number(p.earned || 0))}</span>
              </div>
            </div>
          `).join('')}
        </div>`;

    return `
      <div class="card stat-card">
        <div class="stat-row">
          <div class="stat-icon-wrap bg-brand">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"></circle><path d="M18.09 10.37A6 6 0 1 1 10.34 18"></path><path d="M7 6h1v4"></path><path d="m16.71 13.88.7.71-2.82 2.82"></path></svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">${tokensText(totalG)}</span>
            <span class="stat-label">Creator earnings</span>
          </div>
        </div>
      </div>
      <div class="card stat-card" style="margin-top: 16px;">
        <div class="stat-row">
          <div class="stat-icon-wrap bg-success">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">${minutes.toLocaleString()}</span>
            <span class="stat-label">Minutes read on your content</span>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top: 16px;">
        <div class="sub-details">
          <div class="sub-row"><span>Last 30 days</span><strong>${tokensText(last30)}</strong></div>
          <div class="sub-row"><span>GP earned</span><strong>${gpEarned.toLocaleString()} GP</strong></div>
          <div class="sub-row"><span>Creator support received</span><strong>${tokensText(supportReceived)}</strong></div>
          <div class="sub-row"><span>Referral GP earned</span><strong>${referralGp.toLocaleString()} GP</strong></div>
        </div>
      </div>
      <div class="card" style="margin-top: 16px;">
        <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">Top earning posts</h3>
        ${postsHtml}
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
    // Every number here is the price the database actually charges, so none of
    // them is guessed. An unreadable config shows a dash, not a figure nobody
    // set in the Config tab.
    const price = (key) => {
      const n = Number(this.config?.[key]);
      return Number.isFinite(n) && n > 0 ? tokensText(n) : '—';
    };

    const check = (text) => `
      <li class="plan-feature">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>${text}</span>
      </li>`;

    const isCurrent = (planType) => currentPlan === planType;
    // The plan a member already holds has no button — nothing to click — so the
    // card marks itself with an outline and a corner badge instead.
    const cardClass = (planType) => `plan-card${isCurrent(planType) ? ' plan-card--current' : ''}`;
    const badge = (planType) => isCurrent(planType) ? '<span class="plan-current-badge">Current plan</span>' : '';

    const btn = (planType, label) => {
      if (isCurrent(planType)) return '';
      return `<button class="plan-buy btn-primary" onclick="walletInstance.activatePlan('${planType}')">${label}</button>`;
    };

    return `
      <div class="plan-list">
        <div class="${cardClass('payngo')}">
          ${badge('payngo')}
          <span class="plan-name">Pay n' Go</span>
          <div class="plan-price">${price('per_minute_rate_gliits')}/min</div>
          <span class="plan-price-note">deducted from wallet</span>
          <ul class="plan-features">
            ${check('Full platform access')}
            ${check('Pay only for what you use')}
            ${check('No commitment')}
            ${check('Top up anytime')}
          </ul>
          ${btn('payngo', 'Switch to Pay n\' Go')}
        </div>
        <div class="${cardClass('monthly')}">
          ${badge('monthly')}
          <span class="plan-name">Monthly</span>
          <div class="plan-price">${price('plan_monthly_price_gliits')}</div>
          <span class="plan-price-note">per month · unlimited</span>
          <ul class="plan-features">
            ${check('Unlimited usage')}
            ${check('No per-minute charges')}
            ${check('All content accessible')}
            ${check('Cancel anytime')}
          </ul>
          ${btn('monthly', 'Go Monthly')}
        </div>
        <div class="${cardClass('yearly')}">
          ${badge('yearly')}
          <span class="plan-name">Yearly</span>
          <div class="plan-price">${price('plan_yearly_price_gliits')}</div>
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
      : `<span class="txn-amount ${amountClass}">${amountPrefix}${tokensText(Math.abs(tx.amount))}</span>`;

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

  toggleFilterMenu() {
    document.getElementById('billing-filter-menu')?.classList.toggle('active');
  },

  // ============================================
  // PLANS
  // ============================================
  async activatePlan(planType) {
    const labels = { payngo: "Pay n' Go", monthly: 'Monthly', yearly: 'Yearly' };
    // The confirm dialog has to quote what gliits_set_plan will actually take,
    // so every figure comes from the admin's Config tab. When the config
    // cannot be read the copy says nothing about money rather than guessing.
    const priceOf = (key) => {
      const n = Number(this.config?.[key]);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const prices = {
      payngo: priceOf('per_minute_rate_gliits'),
      monthly: priceOf('plan_monthly_price_gliits'),
      yearly: priceOf('plan_yearly_price_gliits')
    };

    let confirmMsg = '';
    if (planType === 'payngo') {
      const cost = prices.payngo === null ? 'a per-minute rate' : `${tokensText(prices.payngo)} per minute`;
      confirmMsg = `Switch to Pay n' Go?\n\nYou'll be charged ${cost} of usage from your wallet balance. No subscription fee.`;
    } else {
      const cost = prices[planType] === null ? '' : ` for ${tokensText(prices[planType])}`;
      confirmMsg = `Switch to ${labels[planType]}${cost}?\n\nUnlimited usage for ${planType === 'monthly' ? '1 month' : '1 year'}. Paid from your wallet balance.`;
    }

    const ok = await appConfirm(confirmMsg, { okText: 'Switch' });
    if (!ok) return;

    const { data, error } = await setPlan(planType);
    if (error) {
      const msg = error.message || '';
      if (msg.includes('INSUFFICIENT_BALANCE')) {
        const short = prices[planType] === null ? null : prices[planType] - this.balance;
        await appAlert(short > 0
          ? `You need ${tokensText(short)} more in your wallet. Top up and try again.`
          : 'You do not have enough tokens in your wallet for this plan. Top up and try again.');
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
          <label>Amount (tokens)</label>
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
    const password = await appPrompt(`To send ${tokensText(amount)} to ${name}, please enter your password:`, { inputType: 'password', okText: 'Send' });
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
    await appAlert(`${tokensText(amount)} sent to ${name}.`);
    await this.fetchData();
    this.render();
  },

  // ============================================
  // WITHDRAW TO A BANK ACCOUNT
  // ============================================
  // The member never types the name the payout is paid against: the database
  // reads it from the profile and the bank confirms whose account it is. So
  // the only way through is to hold an account the bank records under the
  // member's own name.
  async openWithdrawModal() {
    if (document.getElementById('wallet-withdraw-modal')) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'wallet-withdraw-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close" id="withdraw-close-btn">×</button>
        <h2 style="margin-bottom: 6px;">Withdraw to your bank</h2>
        <p class="fund-subtitle">Gliims leave the platform as naira, into an account held in your own name.</p>
        <div id="withdraw-body">
          <p class="fund-subtitle" style="margin-top: var(--space-4);">Checking your bank details…</p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('withdraw-close-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    this.withdraw = { loading: true, banks: [], details: null, inflight: null, notice: null, editing: false };

    const [details, queued, banks] = await Promise.all([
      supabase.from('payout_details')
        .select('full_name, phone, bank_code, bank_name, account_number, account_name')
        .eq('user_id', store.user.id).maybeSingle()
        .then((r) => r.data),
      supabase.from('withdrawals')
        .select('id, amount_gliits, status, bank_code, account_number, created_at')
        .eq('user_id', store.user.id).in('status', ['requested', 'processing'])
        .order('created_at', { ascending: false }).limit(1)
        .then((r) => (r.data || [])[0]),
      this.fetchPayoutBanks()
    ]);

    Object.assign(this.withdraw, {
      loading: false,
      details: details || null,
      inflight: queued || null,
      banks,
      editing: !details || !details.account_name
    });
    this.renderWithdraw();
  },

  async fetchPayoutBanks() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const res = await fetch(`${API_BASE_URL}/api/payout/banks`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.banks) ? json.banks : [];
    } catch (e) {
      return [];
    }
  },

  payoutBankName(code) {
    const bank = (this.withdraw?.banks || []).find((b) => Number(b.code) === Number(code));
    return bank ? bank.name : '';
  },

  renderWithdraw() {
    const body = document.getElementById('withdraw-body');
    const s = this.withdraw;
    if (!body || !s) return;

    if (s.inflight) {
      body.innerHTML = this.payoutQueuedHtml(s.inflight);
      body.querySelector('[data-cancel-payout]')
        ?.addEventListener('click', () => this.cancelPayout(s.inflight.id));
      return;
    }

    const confirmed = Boolean(s.details && s.details.account_name);
    const matches = confirmed && samePayoutName(s.details.account_name, s.details.full_name);

    const notice = s.notice ? `
      <div style="margin-top: var(--space-4); padding: 10px 12px; border-radius: var(--radius-md);
                  background: var(--${s.notice.tone}-light); color: var(--${s.notice.tone}-text);
                  font-size: 13px;">${escapeHtml(s.notice.text)}</div>` : '';

    body.innerHTML = `
      ${confirmed && !s.editing ? this.payoutSavedHtml(s.details, matches) : this.payoutFormHtml()}
      ${notice}
      ${matches ? this.payoutAmountHtml() : ''}
    `;
    this.wireWithdraw(body);
  },

  payoutFormHtml() {
    const s = this.withdraw;
    if (!s.banks.length) {
      return `<p class="fund-subtitle" style="margin-top: var(--space-4);">
        The bank list could not be loaded from the payment provider. Close this and try again in a minute.</p>`;
    }

    const d = s.details || {};
    const isChange = Boolean(s.details);
    const options = s.banks.map((b) => `<option value="${escapeHtml(b.code)}"${Number(b.code) === Number(d.bank_code) ? ' selected' : ''}>${escapeHtml(b.name)}</option>`).join('');

    return `
      <div class="form-group" style="margin-top: var(--space-4);">
        <label>Your bank</label>
        <select id="withdraw-bank" class="input">
          <option value="">Select your bank</option>
          ${options}
        </select>
      </div>
      <div class="form-group" style="margin-top: var(--space-3);">
        <label>Account number</label>
        <input type="text" id="withdraw-account" class="input" inputmode="numeric" maxlength="10"
               placeholder="10 digits" value="${escapeHtml(d.account_number || '')}">
      </div>
      <div class="form-group" style="margin-top: var(--space-3);">
        <label>Phone number</label>
        <input type="text" id="withdraw-phone" class="input" inputmode="tel" maxlength="15"
               placeholder="e.g. 08012345678" value="${escapeHtml(d.phone || '')}">
      </div>
      <p class="fund-subtitle" style="margin-top: var(--space-3);">
        We pay against <strong>${escapeHtml(store.profile?.full_name || '')}</strong> — the name on your
        Gliimu profile. ${isChange ? 'A new account has to be confirmed by the bank again.' : 'Your bank will be asked to confirm the account.'}
      </p>
      <button class="btn-primary" id="withdraw-save-btn" data-save-payout style="width: 100%; margin-top: var(--space-4);">
        ${isChange ? 'Update and confirm' : 'Confirm with my bank'}
      </button>
    `;
  },

  payoutSavedHtml(d, matches) {
    const tail = String(d.account_number || '').slice(-4);
    return `
      <div style="margin-top: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-4);">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: var(--space-3);">
          <div>
            <div style="font-weight: var(--fw-semibold);">${escapeHtml(d.bank_name || this.payoutBankName(d.bank_code))}</div>
            <div class="fund-subtitle">••••${escapeHtml(tail)}</div>
          </div>
          <button class="btn-secondary" data-edit-payout style="padding: 6px 12px; font-size: 13px;">Change</button>
        </div>
        <div style="margin-top: var(--space-3); font-size: 13px; color: var(--${matches ? 'success' : 'error'}-text);">
          ${matches
            ? `Confirmed by the bank as ${escapeHtml(d.account_name)}.`
            : `The bank holds this account as ${escapeHtml(d.account_name)}, but we pay against ${escapeHtml(d.full_name)}. Use an account in your own name.`}
        </div>
      </div>`;
  },

  payoutAmountHtml() {
    const min = Number(this.config?.min_withdrawal_gliits || 0);
    const max = Number(this.config?.max_withdrawal_gliits || 0);
    const hold = Number(this.config?.withdrawal_hold_hours || 0);
    const prefill = min > 0 && min <= this.balance ? min : '';

    return `
      <div class="form-group" style="margin-top: var(--space-4);">
        <label>Amount (tokens)</label>
        <input type="number" id="withdraw-amount" class="input" min="${min}" max="${max}" step="1"
               placeholder="e.g. ${min}" value="${prefill}">
        <div id="withdraw-naira" class="fund-subtitle" style="margin-top: 6px;"></div>
      </div>
      <div class="form-group" style="margin-top: var(--space-3);">
        <label>Your password</label>
        <input type="password" id="withdraw-password" class="input" autocomplete="current-password"
               placeholder="Confirm it is you">
      </div>
      <button class="btn-primary" id="withdraw-send-btn" style="width: 100%; margin-top: var(--space-4);" disabled>Withdraw</button>
      <p class="fund-subtitle" style="margin-top: 10px;">
        Balance ${tokensText(this.balance)} · ${tokensText(min)} to ${tokensText(max)} a time ·
        one payout a day${hold ? ` · Gliims bought in the last ${hold} hours are held back` : ''}
      </p>
    `;
  },

  payoutQueuedHtml(row) {
    const sent = row.status === 'processing';
    return `
      <div style="margin-top: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-4);">
        <div style="font-weight: var(--fw-semibold);">${tokensText(Number(row.amount_gliits))} on its way</div>
        <p class="fund-subtitle" style="margin-top: 4px;">
          ${sent
            ? 'The bank has the transfer now. It clears into your account without any action from you.'
            : `Held out of your wallet while we send it to ${escapeHtml(this.payoutBankName(row.bank_code))} ••••${escapeHtml(String(row.account_number || '').slice(-4))}.`}
        </p>
        ${row.status === 'requested'
          ? '<button class="btn-secondary" data-cancel-payout style="margin-top: var(--space-3); padding: 6px 12px; font-size: 13px;">Cancel payout</button>'
          : ''}
      </div>`;
  },

  wireWithdraw(body) {
    const s = this.withdraw;
    body.querySelector('[data-save-payout]')?.addEventListener('click', () => this.savePayoutDetails());
    body.querySelector('[data-edit-payout]')?.addEventListener('click', () => {
      s.editing = true;
      s.notice = null;
      this.renderWithdraw();
    });

    const amount = body.querySelector('#withdraw-amount');
    const send = body.querySelector('#withdraw-send-btn');
    if (!amount || !send) return;

    const naira = body.querySelector('#withdraw-naira');
    const rawRate = Number(this.config?.exchange_rate_naira_to_gliits);
    const rate = Number.isFinite(rawRate) && rawRate > 0 ? rawRate : 0;
    const min = Number(this.config?.min_withdrawal_gliits || 0);
    const max = Number(this.config?.max_withdrawal_gliits || 0);

    const sync = () => {
      const value = parseInt(amount.value, 10);
      if (!(value > 0)) { naira.textContent = ''; send.disabled = true; return; }
      if (min && value < min) { naira.textContent = `The smallest payout is ${tokensText(min)}.`; send.disabled = true; return; }
      if (max && value > max) { naira.textContent = `The largest payout at one time is ${tokensText(max)}.`; send.disabled = true; return; }
      if (value > this.balance) { naira.textContent = `Your wallet holds ${tokensText(this.balance)}.`; send.disabled = true; return; }
      if (!rate) { naira.textContent = 'The payout rate is unavailable right now. Try again in a moment.'; send.disabled = true; return; }
      naira.textContent = `= ₦${(value * rate).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} into your account.`;
      send.disabled = false;
    };

    amount.addEventListener('input', sync);
    sync();
    send.addEventListener('click', () => this.submitWithdrawal());
  },

  async savePayoutDetails() {
    const s = this.withdraw;
    const bankCode = document.getElementById('withdraw-bank')?.value || '';
    const account = String(document.getElementById('withdraw-account')?.value || '').replace(/\D/g, '');
    const phone = String(document.getElementById('withdraw-phone')?.value || '').replace(/\D/g, '');

    const btn = document.getElementById('withdraw-save-btn');
    if (btn) { btn.disabled = true; btn.innerText = 'Checking with your bank…'; }

    const { data, error } = await supabase.rpc('save_payout_details', {
      p_phone: phone,
      p_bank_code: bankCode ? Number(bankCode) : null,
      p_account_number: account
    });
    if (error || !data || data.ok === false) {
      s.notice = { tone: 'error', text: (data && PAYOUT_ERRORS[data.code]) || error?.message || 'That did not save. Please try again.' };
      return this.renderWithdraw();
    }

    const out = await this.resolvePayoutAccount();
    if (!out || out.ok !== true) {
      s.details = { ...s.details, full_name: data.full_name, account_name: null, bank_name: null, bank_code: Number(bankCode), account_number: account, phone };
      s.notice = { tone: 'error', text: (out && (PAYOUT_ERRORS[out.code] || out.error)) || 'The bank could not be reached. Your account is saved — open this again to confirm it.' };
      return this.renderWithdraw();
    }

    s.details = {
      ...s.details,
      full_name: data.full_name,
      bank_code: Number(bankCode),
      account_number: account,
      phone,
      account_name: out.account_name,
      bank_name: out.bank_name
    };
    s.editing = !out.name_match;
    s.notice = out.name_match
      ? { tone: 'success', text: 'Confirmed. Choose how much to withdraw.' }
      : { tone: 'error', text: `The bank holds that account as ${out.account_name}, not as ${data.full_name}.` };
    this.renderWithdraw();
  },

  async resolvePayoutAccount() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const res = await fetch(`${API_BASE_URL}/api/payout/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async submitWithdrawal() {
    const s = this.withdraw;
    const amount = parseInt(document.getElementById('withdraw-amount')?.value, 10);
    const password = document.getElementById('withdraw-password')?.value || '';

    if (!amount || amount <= 0) return appAlert('Enter the amount you want to withdraw.');
    if (!password) return appAlert('Enter your password so we know it is you.');

    const fakeEmail = `${store.profile.username}@gliimu.app`;
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: fakeEmail, password });
    if (signInError) {
      s.notice = { tone: 'error', text: 'Incorrect password. Nothing was sent.' };
      return this.renderWithdraw();
    }

    const btn = document.getElementById('withdraw-send-btn');
    if (btn) { btn.disabled = true; btn.innerText = 'Sending…'; }

    const { data, error } = await supabase.rpc('request_withdrawal', { p_amount: amount });
    if (error || !data || data.ok === false) {
      s.notice = { tone: 'error', text: (data && PAYOUT_ERRORS[data.code]) || error?.message || 'That payout could not be queued.' };
      return this.renderWithdraw();
    }

    document.getElementById('wallet-withdraw-modal')?.remove();
    await this.fetchData();
    this.render();
    await appAlert('Your payout is on its way to your bank account.');
  },

  async cancelPayout(id) {
    const ok = await appConfirm('Cancel this payout? The tokens go straight back to your wallet.', {
      okText: 'Cancel payout',
      danger: true
    });
    if (!ok) return;

    const { data, error } = await supabase.rpc('cancel_withdrawal', { p_id: id });
    if (error || !data || data.ok === false) {
      return appAlert((data && PAYOUT_ERRORS[data.code]) || 'That payout can no longer be cancelled.');
    }

    document.getElementById('wallet-withdraw-modal')?.remove();
    await this.fetchData();
    this.render();
    await appAlert('Cancelled — the Gliims are back in your wallet.');
  },

  // ============================================
  // FUND WALLET (Paystack)
  // ============================================
  openTopUpModal() {
    if (document.getElementById('wallet-fund-modal')) return;

    const minTopup = Number(this.config?.min_topup_gliits || 100);
    // A guessed rate would promise the member a price the server will not charge.
    const rawRate = Number(this.config?.exchange_rate_naira_to_gliits);
    const exchangeRate = Number.isFinite(rawRate) && rawRate > 0 ? rawRate : 0;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'wallet-fund-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close" id="fund-close-btn">×</button>
        <h2 style="margin-bottom: 6px;">Top Up Wallet</h2>
        <p class="fund-subtitle">Add tokens to your balance. Minimum ${tokensText(minTopup)}.</p>

        <div class="form-group" style="margin-top: var(--space-4);">
          <label>Amount (tokens)</label>
          <input type="number" id="topup-amount" class="input" placeholder="e.g. 500" min="${minTopup}">
          <div id="naira-equivalent" class="muted small" style="margin-top: 6px; font-size: 0.9em;"></div>
        </div>

        <button class="btn-primary" id="fund-paystack-btn" style="width: 100%; margin-top: var(--space-4);" disabled>
          Pay with Paystack
        </button>
        <p class="muted small" style="margin-top: 10px; text-align: center;">Card, bank or USSD · credited instantly</p>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('fund-close-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    const amountInput = document.getElementById('topup-amount');
    const nairaDisplay = document.getElementById('naira-equivalent');
    const payBtn = document.getElementById('fund-paystack-btn');

    amountInput.addEventListener('input', () => {
      const amount = Number(amountInput.value);
      if (!(amount > 0)) {
        nairaDisplay.textContent = '';
        payBtn.disabled = true;
        return;
      }
      if (amount < minTopup) {
        nairaDisplay.textContent = `Minimum top-up is ${tokensText(minTopup)}.`;
        payBtn.disabled = true;
        return;
      }
      if (!exchangeRate) {
        nairaDisplay.textContent = 'The naira price comes from the current rate and is shown by Paystack at checkout.';
        payBtn.disabled = false;
        return;
      }
      const naira = amount * exchangeRate;
      nairaDisplay.textContent = `= ₦${naira.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} (at ₦${exchangeRate} = 1 token)`;
      payBtn.disabled = false;
    });

    payBtn.addEventListener('click', () => {
      const amount = this.readTopUpAmount();
      if (!amount) return;
      this.logPaymentAttempt('paystack');
      this.startPaystack(amount);
    });
    amountInput.focus();
  },

  readTopUpAmount() {
    const minTopup = Number(this.config?.min_topup_gliits || 100);
    const amount = parseInt(document.getElementById('topup-amount').value, 10);
    if (!amount || amount < minTopup) {
      appAlert(`Please enter at least ${tokensText(minTopup)}.`);
      return null;
    }
    return amount;
  },

  logPaymentAttempt(method) {
    supabase.from('payment_attempts')
      .insert({ user_id: store.user.id, method })
      .then(() => {}, () => {});
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
    history.replaceState(null, '', window.location.hostname === 'dashboard.gliimu.com' ? '/wallet' : `${location.pathname}#/wallet`);

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

  // ============================================
  // REFERRAL
  // ============================================
  async openReferralModal() {
    const [{ data: summary }, { data: listData }] = await Promise.all([
      supabase.rpc('referral_summary', {}).then(r => r.error ? { data: null } : r),
      supabase.rpc('referral_list', {}).then(r => r.error ? { data: null } : r)
    ]);

    const code = summary?.code || '';
    const fullLink = code ? `https://gliimu.com/?ref=${code}` : '';
    const pending = summary?.pending || 0;
    const vested = summary?.vested || 0;
    const gpEarned = Number(summary?.gp_earned || 0).toLocaleString();
    const referrals = (listData?.ok && Array.isArray(listData.rows)) ? listData.rows : [];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'referral-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <button class="modal-close" id="close-referral-modal">&times;</button>
        <h2 style="margin-bottom: 8px;">Refer & earn</h2>
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 20px;">Invite friends to Gliimu and earn GP when they sign up.</p>
        ${!code ? '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Sign in to get your referral link.</p>' : `
          <div style="background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">Your link</div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="flex: 1; font-size: 13px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(fullLink)}</div>
              <button class="btn-secondary" style="padding: 8px 12px; font-size: 13px;" onclick="walletInstance.copyReferralLink('${escapeHtml(fullLink)}')">Copy</button>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center; margin-bottom: 20px;">
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
          <div style="border-top: 1px solid var(--border); padding-top: 16px;">
            <h3 style="font-size: 15px; font-weight: 700; margin-bottom: 12px;">Your referrals (${referrals.length})</h3>
            ${referrals.length === 0 ? '<p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px;">No referrals yet. Share your link to get started.</p>' : `
              <div style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px;">
                <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                  <thead style="position: sticky; top: 0; background: var(--surface);">
                    <tr style="border-bottom: 1px solid var(--border);">
                      <th style="text-align: left; padding: 10px; font-weight: 600; color: var(--text-secondary);">Member</th>
                      <th style="text-align: center; padding: 10px; font-weight: 600; color: var(--text-secondary);">Status</th>
                      <th style="text-align: right; padding: 10px; font-weight: 600; color: var(--text-secondary);">GP</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${referrals.map(r => {
                      const name = r.referee_name || 'Member';
                      const status = r.status === 'vested' ? 'Vested' : 'Pending';
                      const statusColor = r.status === 'vested' ? '#10b981' : '#f59e0b';
                      const gp = Number(r.signup_reward_gp || 0);
                      const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      return `
                        <tr style="border-bottom: 1px solid var(--border);">
                          <td style="padding: 10px;">
                            <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(name)}</div>
                            <div style="font-size: 11px; color: var(--text-muted);">${date}</div>
                          </td>
                          <td style="text-align: center; padding: 10px;">
                            <span style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: ${statusColor}20; color: ${statusColor};">${status}</span>
                          </td>
                          <td style="text-align: right; padding: 10px; font-weight: 600; color: var(--brand-primary);">+${gp}</td>
                        </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        `}
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('close-referral-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  },

  async copyReferralLink(link) {
    try {
      await navigator.clipboard.writeText(link);
      await appAlert('Referral link copied.');
    } catch { await appAlert('Could not copy to clipboard.'); }
  }
};
