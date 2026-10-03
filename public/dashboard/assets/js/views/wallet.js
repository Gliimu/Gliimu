import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Wallet',
  template: `
    <div class="wallet-layout" id="wallet-container">
      <p style="color: var(--text-muted); text-align: center;">Loading wallet...</p>
    </div>
  `,
  async init() {
    // Expose instance to window for onclick handlers
    window.walletInstance = {
      switchTab: (tab) => this.switchTab(tab),
      openTopUpModal: () => this.openTopUpModal()
    };

    this.currentTab = 'activity'; // Default tab
    await this.fetchData();
    this.render();
  },

  async fetchData() {
    if (!store.user || !store.user.id) return;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('wallet_balance, subscription_expires_at')
      .eq('id', store.user.id)
      .single();

    if (profileError) console.error("Profile fetch error:", profileError);

    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('id, user_id, amount, type, status, reference, description, created_at')
      .eq('user_id', store.user.id)
      .order('created_at', { ascending: false });

    if (txError) console.error("Transactions fetch error:", txError);

    this.balance = profile?.wallet_balance || 0;
    this.subscriptionExpiresAt = profile?.subscription_expires_at || null;
    this.allTransactions = transactions || [];
  },

  render() {
    const container = document.getElementById('wallet-container');
    if (!container) return;

    const isActiveSub = this.subscriptionExpiresAt && new Date(this.subscriptionExpiresAt) > new Date();

    container.innerHTML = `
      <div class="wallet-header-card">
        <span class="balance-label">Current Balance</span>
        <h1 class="balance-amount">₦${this.balance.toLocaleString()}</h1>
        <div class="wallet-actions">
          <button class="btn-primary" onclick="walletInstance.openTopUpModal()">Add Funds</button>
          <button class="btn-secondary" onclick="alert('Withdrawal feature coming soon!')">Withdraw</button>
          <button class="btn-secondary" onclick="alert('Transfer feature coming soon!')">Transfer</button>
        </div>
      </div>

      <div class="wallet-tabs">
        <button class="wallet-tab ${this.currentTab === 'activity' ? 'active' : ''}" onclick="walletInstance.switchTab('activity')">Activity Summary</button>
        <button class="wallet-tab ${this.currentTab === 'transactions' ? 'active' : ''}" onclick="walletInstance.switchTab('transactions')">Transactions</button>
        <button class="wallet-tab ${this.currentTab === 'subscription' ? 'active' : ''}" onclick="walletInstance.switchTab('subscription')">Subscription</button>
      </div>

      <div id="wallet-tab-content" class="wallet-tab-content">
        ${this.renderTabContent()}
      </div>
    `;
  },

  renderTabContent() {
    if (this.currentTab === 'activity') {
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

    if (this.currentTab === 'transactions') {
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
      const isActive = this.subscriptionExpiresAt && new Date(this.subscriptionExpiresAt) > new Date();
      const expiryDate = isActive ? new Date(this.subscriptionExpiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

      return `
        <div class="card sub-card">
          <div class="sub-header">
            <h3>Elite Subscription</h3>
            <span class="sub-badge ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span>
          </div>
          <div class="sub-details">
            <div class="sub-row">
              <span>Plan</span>
              <strong>Monthly Elite</strong>
            </div>
            <div class="sub-row">
              <span>Cost</span>
              <strong>₦5,000 / month</strong>
            </div>
            ${isActive ? `
              <div class="sub-row">
                <span>Expires On</span>
                <strong>${expiryDate}</strong>
              </div>
            ` : `
              <div class="sub-row">
                <span>Status</span>
                <strong>No active plan</strong>
              </div>
            `}
          </div>
          <button class="btn-primary" style="width: 100%; margin-top: 24px;" onclick="alert('Subscription management coming soon!')">
            ${isActive ? 'Change Plan' : 'Subscribe Now'}
          </button>
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
    } else {
      icon = `<div class="txn-icon bg-muted"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div>`;
    }

    const date = new Date(tx.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const statusBadge = tx.status === 'pending' ? '<span class="txn-status pending">Pending</span>' : '';

    // Pure GP rewards (no cash movement) show the GP value as the primary amount
    const isPurePoints = (!tx.amount || tx.amount === 0) && tx.points > 0;
    const pointsHtml = !isPurePoints && tx.points && tx.points > 0 ? `<span class="txn-points">+${tx.points} GP</span>` : '';
    const amountHtml = isPurePoints
      ? `<span class="txn-amount amount-positive">+${tx.points} GP</span>`
      : `<span class="txn-amount ${amountClass}">${amountPrefix}₦${Math.abs(tx.amount).toLocaleString()}</span>`;

    return `
      <div class="txn-item">
        ${icon}
        <div class="txn-info">
          <span class="txn-title">${label} ${statusBadge}</span>
          <span class="txn-date">${date}</span>
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
    document.querySelectorAll('.wallet-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.wallet-tab[onclick="walletInstance.switchTab('${tab}')"]`)?.classList.add('active');
    document.getElementById('wallet-tab-content').innerHTML = this.renderTabContent();
  },

  openTopUpModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close" id="close-modal">×</button>
        <h2 style="margin-bottom: var(--space-4);">Fund Wallet</h2>

        <div class="form-group">
          <label>Enter Amount (₦)</label>
          <input type="number" id="topup-amount" class="input" placeholder="e.g. 5000" min="100">
        </div>

        <button id="generate-details-btn" class="btn-primary" style="width: 100%; margin-bottom: var(--space-4);">Generate Bank Details</button>

        <div id="bank-details-area" style="display: none;">
          <div class="info-banner" style="margin-bottom: var(--space-4); padding: 16px; background: var(--brand-primary-light); border-radius: 8px;">
            <p style="color: var(--text-secondary); font-size: 14px;">Transfer the exact amount to the account below. Use the <strong>Reference Code</strong> as the narration. Your wallet will be funded after confirmation.</p>
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
      if (!amount || amount < 100) return alert("Please enter a valid amount (min ₦100).");

      const banks = [
        { name: 'Opay', acct: '7058929080' },
        { name: 'Moniepoint', acct: '7058929080' }
      ];
      const selectedBank = banks[Math.floor(Math.random() * banks.length)];
      const ref = `GLI-${store.profile.username.substring(0, 4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

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
        description: 'Wallet Top-up'
      });

      if (error) {
        alert("Error logging transaction.");
        btn.innerText = 'I Have Sent the Cash';
        btn.disabled = false;
        return;
      }

      alert("Transaction received! Your wallet will be credited once the payment is verified.");
      modal.remove();
      await this.fetchData();
      this.render();
    });
  }
};
