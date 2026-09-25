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
      .order('created_at', { ascending: false })
      .limit(10);

    this.balance = profile?.wallet_balance || 0;
    this.transactions = transactions || [];
  },

  render() {
    const container = document.getElementById('wallet-container');
    if (!container) return;

    container.innerHTML = `
      <div class="wallet-grid">
        <!-- Balance Card -->
        <div class="card balance-card">
          <span class="balance-label">Current Balance</span>
          <h1 class="balance-amount">₦${this.balance.toLocaleString()}</h1>
          <button id="topup-btn" class="btn-primary" style="margin-top: var(--space-4); width: 100%;">Add Funds</button>
        </div>

        <!-- Quick Actions -->
        <div class="card quick-actions-card">
          <h3>Quick Actions</h3>
          <div class="quick-actions">
            <div class="quick-action-item">
              <span class="qa-icon">📚</span>
              <span>Buy Library Item</span>
            </div>
            <div class="quick-action-item">
              <span class="qa-icon">🎁</span>
              <span>Tip Creator</span>
            </div>
            <div class="quick-action-item">
              <span class="qa-icon">⏳</span>
              <span>Pending Approvals</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Transaction History -->
      <div class="card" style="margin-top: var(--space-6);">
        <h3>Recent Transactions</h3>
        <div class="transaction-list">
          ${this.transactions.length === 0
            ? '<p style="color: var(--text-muted); text-align: center; padding: var(--space-4);">No transactions yet.</p>'
            : this.transactions.map(tx => `
              <div class="transaction-item">
                <div class="tx-icon ${tx.type === 'topup' ? 'tx-topup' : 'tx-spend'} ${tx.status === 'pending' ? 'tx-pending' : ''}">
                  ${tx.type === 'topup' ? '↓' : '↑'}
                </div>
                <div class="tx-details">
                  <span class="tx-title">${tx.type.charAt(0).toUpperCase() + tx.type.slice(1)} <span style="font-size: var(--fs-xs); color: ${tx.status === 'pending' ? 'var(--warning)' : 'var(--success)'};">(${tx.status})</span></span>
                  <span class="tx-date">${new Date(tx.created_at).toLocaleDateString()} ${new Date(tx.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <span class="tx-amount ${tx.type === 'topup' ? 'amount-positive' : 'amount-negative'}">
                  ${tx.type === 'topup' ? '+' : '-'}₦${tx.amount.toLocaleString()}
                </span>
              </div>
            `).join('')}
        </div>
      </div>
    `;

    document.getElementById('topup-btn').addEventListener('click', () => this.openTopUpModal());
  },

  openTopUpModal() {
    // Create a modal overlay
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
          <div class="info-banner" style="margin-bottom: var(--space-4);">
            <p>Transfer the exact amount to the account below. Use the <strong>Reference Code</strong> as the narration. Your wallet will be funded after confirmation.</p>
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

    // Modal Logic
    document.getElementById('close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    document.getElementById('generate-details-btn').addEventListener('click', () => {
      const amount = parseInt(document.getElementById('topup-amount').value);
      if (!amount || amount < 100) return alert("Please enter a valid amount (min ₦100).");

      // Randomly select bank
      const banks = [
        { name: 'Opay', acct: '7058929080' },
        { name: 'Moniepoint', acct: '7058929080' }
      ];
      const selectedBank = banks[Math.floor(Math.random() * banks.length)];

      // Generate Reference
      const ref = `GLI-${store.profile.username.substring(0, 4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

      this.pendingTopUp = { amount, bank: selectedBank, ref };

      document.getElementById('bd-bank').innerText = selectedBank.name;
      document.getElementById('bd-acct').innerText = selectedBank.acct;
      document.getElementById('bd-ref').innerText = ref;

      document.getElementById('bank-details-area').style.display = 'block';
      document.getElementById('generate-details-btn').style.display = 'none';
    });

    document.getElementById('confirm-sent-btn').addEventListener('click', async () => {
      const { amount, ref } = this.pendingTopUp;

      const { error } = await supabase.from('transactions').insert({
        user_id: store.user.id,
        amount: amount,
        type: 'topup',
        status: 'pending', // Awaiting admin approval
        reference: ref
      });

      if (error) return alert("Error logging transaction.");

      alert("Transaction received! Your wallet will be credited once the payment is verified.");
      modal.remove();
      await this.fetchData();
      this.render();
    });
  }
};
