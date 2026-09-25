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
    const container = document.getElementById('wallet-container');
    if (!container) return;

    // Fetch Profile (for balance) and Transactions
    const [{ data: profile }, { data: txns }] = await Promise.all([
      supabase.from('profiles').select('wallet_balance').eq('id', store.user.id).single(),
      supabase.from('transactions').select('*').eq('user_id', store.user.id).order('created_at', { ascending: false })
    ]);

    const balance = profile?.wallet_balance || 0;

    container.innerHTML = `
      <div class="card balance-card">
        <div class="balance-info">
          <span class="balance-label">Current Balance</span>
          <h1 class="balance-amount">₦${balance.toLocaleString()}</h1>
        </div>
        <button class="btn-primary" id="fund-wallet-btn">Fund Wallet</button>
      </div>

      <div class="card" style="margin-top: var(--space-6);">
        <h3>Transaction History</h3>
        <div class="txn-list" id="txn-list">
          ${txns && txns.length > 0 ? txns.map(t => `
            <div class="txn-item">
              <div class="txn-info">
                <span class="txn-type ${t.type}">${t.type === 'topup' ? '⬆️ Wallet Top-up' : '⬇️ Purchase'}</span>
                <span class="txn-desc">${t.description || ''}</span>
              </div>
              <span class="txn-amount ${t.type}">${t.type === 'topup' ? '+' : '-'}₦${Math.abs(t.amount).toLocaleString()}</span>
            </div>
          `).join('') : '<p style="color: var(--text-muted); text-align: center; padding: var(--space-4);">No transactions yet.</p>'}
        </div>
      </div>
    `;

    document.getElementById('fund-wallet-btn').addEventListener('click', async () => {
      const amount = prompt("Enter amount to fund (in Naira):", "5000");
      if (!amount || isNaN(amount) || amount <= 0) return;

      // 1. Update Wallet Balance
      const newBalance = balance + parseInt(amount);
      await supabase.from('profiles').update({ wallet_balance: newBalance }).eq('id', store.user.id);

      // 2. Record Transaction
      await supabase.from('transactions').insert({
        user_id: store.user.id,
        amount: parseInt(amount),
        type: 'topup',
        description: 'Wallet funded via Paystack (Mock)'
      });

      alert("Wallet funded successfully!");
      this.init(); // Reload view
    });
  }
};
