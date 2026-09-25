import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Library',
  template: `
    <div class="library-layout" id="library-container">
      <p style="color: var(--text-muted); text-align: center;">Loading library...</p>
    </div>
  `,
  async init() {
    const container = document.getElementById('library-container');
    if (!container) return;

    // Fetch Library Items and User's Purchases
    const [{ data: items }, { data: purchases }, { data: profile }] = await Promise.all([
      supabase.from('library_items').select('*').order('created_at', { ascending: false }),
      supabase.from('purchases').select('item_id').eq('user_id', store.user.id),
      supabase.from('profiles').select('wallet_balance').eq('id', store.user.id).single()
    ]);

    const ownedItems = new Set(purchases?.map(p => p.item_id) || []);
    const balance = profile?.wallet_balance || 0;

    container.innerHTML = `
      <div class="library-grid">
        ${items.map(item => `
          <div class="card library-card">
            <div class="lib-cover" style="background-image: url('${item.cover_url}');">
              <span class="lib-badge">${item.type}</span>
            </div>
            <div class="lib-body">
              <h3 class="lib-title">${item.title}</h3>
              <p class="lib-desc">${item.description}</p>
              <div class="lib-footer">
                <span class="lib-price">₦${item.price.toLocaleString()}</span>
                ${ownedItems.has(item.id)
                  ? `<button class="btn-secondary" disabled>Owned</button>`
                  : `<button class="btn-primary" onclick="libraryInstance.buyItem('${item.id}', ${item.price}, ${balance})">Buy Now</button>`
                }
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    window.libraryInstance = {
      buyItem: (id, price, currentBalance) => this.buyItem(id, price, currentBalance)
    };
  },

  async buyItem(itemId, price, currentBalance) {
    if (currentBalance < price) {
      alert("Insufficient funds. Please top up your wallet.");
      return;
    }

    // 1. Deduct from Wallet
    const newBalance = currentBalance - price;
    await supabase.from('profiles').update({ wallet_balance: newBalance }).eq('id', store.user.id);

    // 2. Record Purchase
    await supabase.from('purchases').insert({
      user_id: store.user.id,
      item_id: itemId
    });

    // 3. Record Transaction
    await supabase.from('transactions').insert({
      user_id: store.user.id,
      amount: -price,
      type: 'purchase',
      description: 'Library Item Purchase'
    });

    alert("Purchase successful! You now have access to this item.");
    this.init(); // Reload library
  }
};
