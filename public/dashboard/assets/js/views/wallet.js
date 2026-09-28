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
    this.currentFilter = 'week'; // Default filter
    await this.fetchData();
    this.render();
  },

  async fetchData() {
    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_balance')
      .eq('id', store.user.id)
      .single();

    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', store.user.id)
      .order('created_at', { ascending: false });

    this.balance = profile?.wallet_balance || 0;
    this.allTransactions = transactions || [];
  },

  render() {
    const container = document.getElementById('wallet-container');
    if (!container) return;

    // Calculate Activity Summary based on filter
    const summary = this.calculateSummary();

    container.innerHTML = `
      <div class="wallet-grid">
        <!-- Balance Card -->
        <div class="card balance-card">
          <span class="balance-label">Current Balance</span>
          <h1 class="balance-amount">₦${this.balance.toLocaleString()}</h1>
          <button id="topup-btn" class="btn-primary" style="margin-top: var(--space-4); width: 100%; background: rgba(255,255,255,0.2); color: white;">Add Funds</button>
        </div>

        <!-- Activity Summary Card -->
        <div class="card activity-summary-card">
          <div class="activity-header">
            <h3>Activity Summary</h3>
            <select id="activity-filter" class="activity-filter-dropdown">
              <option value="day" ${this.currentFilter === 'day' ? 'selected' : ''}>Today</option>
              <option value="week" ${this.currentFilter === 'week' ? 'selected' : ''}>This Week</option>
              <option value="month" ${this.currentFilter === 'month' ? 'selected' : ''}>This Month</option>
            </select>
          </div>

          <div class="activity-stats">
            <div class="stat-item">
              <div class="stat-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
              <div class="stat-info">
                <span class="stat-value">₦${summary.expenses.toLocaleString()}</span>
                <span class="stat-label">Total Expenses</span>
              </div>
            </div>

            <div class="stat-row">
              <div class="stat-item-small">
                <span class="stat-label">Library Unlocks</span>
                <span class="stat-value-small">${summary.unlocks}</span>
              </div>
              <div class="stat-item-small">
                <span class="stat-label">Supports</span>
                <span class="stat-value-small">${summary.supports}</span>
              </div>
            </div>

            <div class="points-badge">
              <span class="points-value">${summary.points} GP</span>
              <span class="points-label">Total Points Earned</span>
            </div>
          </div>

          <div class="prize-info">
            <strong>Top 7 GP Earners Win Monthly:</strong>
            <span>1st: ₦100k + Sub | 2-4: ₦20k + Sub | 5-7: ₦10k</span>
          </div>
        </div>
      </div>

      <!-- Transaction History -->
      <div class="card" style="margin-top: var(--space-6);">
        <h3>Recent Transactions</h3>
        <div class="transaction-list">
          ${this.allTransactions.length === 0
            ? '<p style="color: var(--text-muted); text-align: center; padding: var(--space-4);">No transactions yet.</p>'
            : this.allTransactions.map(tx => `
              <div class="transaction-item">
                <div class="tx-icon ${tx.type === 'topup' ? 'tx-topup' : 'tx-spend'} ${tx.status === 'pending' ? 'tx-pending' : ''}">
                  ${tx.type === 'topup' ? '↓' : '↑'}
                </div>
                <div class="tx-details">
                  <span class="tx-title">${tx.description || (tx.type.charAt(0).toUpperCase() + tx.type.slice(1))} <span style="font-size: var(--fs-xs); color: ${tx.status === 'pending' ? 'var(--warning)' : 'var(--success)'};">(${tx.status})</span></span>
                  <span class="tx-date">${new Date(tx.created_at).toLocaleDateString()} ${new Date(tx.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div class="tx-right">
                  ${tx.points > 0 ? `<span class="tx-points">+${tx.points} GP</span>` : ''}
                  <span class="tx-amount ${tx.type === 'topup' ? 'amount-positive' : 'amount-negative'}">
                    ${tx.type === 'topup' ? '+' : '-'}₦${Math.abs(tx.amount).toLocaleString()}
                  </span>
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    `;

    document.getElementById('topup-btn').addEventListener('click', () => this.openTopUpModal());
    document.getElementById('activity-filter').addEventListener('change', (e) => {
      this.currentFilter = e.target.value;
      this.render();
    });
  },

  calculateSummary() {
    const now = new Date();
    let startDate = new Date();

    if (this.currentFilter === 'day') startDate.setDate(now.getDate() - 1);
    if (this.currentFilter === 'week') startDate.setDate(now.getDate() - 7);
    if (this.currentFilter === 'month') startDate.setMonth(now.getMonth() - 1);

    const filteredTx = this.allTransactions.filter(tx => new Date(tx.created_at) >= startDate && tx.status === 'success');

    let expenses = 0, unlocks = 0, supports = 0, points = 0;

    filteredTx.forEach(tx => {
      if (tx.type === 'purchase') {
        expenses += Math.abs(tx.amount);
        unlocks++;
        points += tx.points || 0;
      } else if (tx.type === 'support') {
        expenses += Math.abs(tx.amount);
        supports++;
        points += tx.points || 0;
      }
    });

    return { expenses, unlocks, supports, points };
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

    // Fixed Duplicate Click Logic
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
        reference: ref
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
