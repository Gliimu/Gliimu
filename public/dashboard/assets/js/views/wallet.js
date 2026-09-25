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
    // Fetch user's profile to get balance
    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_balance')
      .eq('id', store.user.id)
      .single();

    // Fetch transaction history
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
              <span class="qa-icon">📈</span>
              <span>Subscribe</span>
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
                <div class="tx-icon ${tx.type === 'topup' ? 'tx-topup' : 'tx-spend'}">
                  ${tx.type === 'topup' ? '↓' : '↑'}
                </div>
                <div class="tx-details">
                  <span class="tx-title">${tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}</span>
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

    document.getElementById('topup-btn').addEventListener('click', () => this.handleTopUp());
  },

  async handleTopUp() {
    // MOCK TOP-UP: In production, this will trigger a Paystack popup
    const amount = 5000; // ₦5,000 mock top-up

    const { error: txError } = await supabase.from('transactions').insert({
      user_id: store.user.id,
      amount: amount,
      type: 'topup',
      status: 'success',
      reference: `mock_${Date.now()}`
    });

    if (txError) return alert("Error processing top-up.");

    // Update user's balance
    const newBalance = this.balance + amount;
    const { error: balanceError } = await supabase
      .from('profiles')
      .update({ wallet_balance: newBalance })
      .eq('id', store.user.id);

    if (balanceError) return alert("Error updating balance.");

    alert("₦5,000 added successfully!");
    await this.fetchData();
    this.render(); // Re-render to show new balance and transaction
  }
};
