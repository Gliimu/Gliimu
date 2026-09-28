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

    // 1. Fetch Library Items, User's Purchases, and User's Profile (for balance & interests)
    const [{ data: items }, { data: purchases }, { data: profile }] = await Promise.all([
      supabase.from('library_items').select('*').order('created_at', { ascending: false }),
      supabase.from('purchases').select('item_id').eq('user_id', store.user.id),
      supabase.from('profiles').select('wallet_balance, interests').eq('id', store.user.id).single()
    ]);

    // Fallback mock data if database is empty
    const libraryItems = items?.length > 0 ? items : [
      { id: '1', type: 'bundle', title: 'Ultimate Media Kit', author: 'Gliimu Ltd', price: 15000, cover_color: 'linear-gradient(135deg, #F97316, #F59E0B)', description: 'All the tools, presets, and templates you need to launch your media empire.', created_at: new Date().toISOString(), sales: 120 },
      { id: '2', type: 'publication', title: 'Business Services Playbook', author: 'Captain A.', price: 7500, cover_color: 'linear-gradient(135deg, #10B981, #06B6D4)', description: 'A comprehensive guide to structuring your freelance business for high-ticket clients.', created_at: new Date().toISOString(), sales: 85 },
      { id: '3', type: 'audiolite', title: 'Mindset of an Elite Gliimait', author: 'Captain B.', price: 5000, cover_color: 'linear-gradient(135deg, #3B82F6, #8B5CF6)', description: 'Audio series on building the mental resilience required for independent success.', created_at: new Date().toISOString(), sales: 200 },
      { id: '4', type: 'publication', title: 'Elite Freelancing Guide', author: 'Gliimu Ltd', price: 6000, cover_color: 'linear-gradient(135deg, #F59E0B, #EF4444)', description: 'How to find, pitch, and close premium clients globally.', created_at: new Date(Date.now() - 86400000).toISOString(), sales: 50 },
      { id: '5', type: 'bundle', title: 'Full Stack Media Architecture', author: 'Gliimu Originals', price: 12000, cover_color: 'linear-gradient(135deg, #6366F1, #8B5CF6)', description: 'The complete blueprint for building media empires from scratch.', created_at: new Date(Date.now() - 172800000).toISOString(), sales: 300 },
      { id: '6', type: 'audiolite', title: 'Creative Flow States', author: 'Captain C.', price: 3000, cover_color: 'linear-gradient(135deg, #0F172A, #334155)', description: 'Audio guides for entering deep work and creative flow.', created_at: new Date(Date.now() - 259200000).toISOString(), sales: 15 }
    ];

    const ownedItems = new Set(purchases?.map(p => p.item_id) || []);
    const walletBalance = profile?.wallet_balance || 0;
    const userInterests = profile?.interests ? profile.interests.toLowerCase().split(',') : [];

    // 2. Categorize Items
    const trending = [...libraryItems].sort((a, b) => (b.sales || 0) - (a.sales || 0)).slice(0, 4);
    const newToShelf = [...libraryItems].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4);
    const forYou = libraryItems.filter(item =>
      userInterests.some(interest => item.title.toLowerCase().includes(interest.trim()) || item.description.toLowerCase().includes(interest.trim()))
    ).slice(0, 4);

    // If "For You" is empty because no interests matched, just show top items
    const forYouFinal = forYou.length > 0 ? forYou : libraryItems.slice(0, 4);
    const allItems = libraryItems;

    // 3. Render Sections
    container.innerHTML = `
      <div class="library-header">
        <div>
          <h2>Gliimu Elite Library</h2>
          <p>Premium publications, audiolites, and bundles.</p>
        </div>
        <div class="subscription-badge">
          <span>Balance: ₦${walletBalance.toLocaleString()}</span>
        </div>
      </div>

      <div id="library-content"></div>
    `;

    const contentDiv = document.getElementById('library-content');

    contentDiv.innerHTML += this.renderSection('For You', forYouFinal, ownedItems, walletBalance);
    contentDiv.innerHTML += this.renderSection('Trending', trending, ownedItems, walletBalance);
    contentDiv.innerHTML += this.renderSection('New to Shelf', newToShelf, ownedItems, walletBalance);
    contentDiv.innerHTML += this.renderSection('All Contents', allItems, ownedItems, walletBalance);

    // Expose instance for onclick
    window.libraryInstance = {
      openDetails: (id) => {
        const item = libraryItems.find(i => i.id == id);
        if (item) this.openDetails(item, ownedItems.has(item.id), walletBalance);
      },
      purchase: (id) => this.purchaseItem(id, libraryItems, walletBalance)
    };
  },

  renderSection(title, items, ownedItems, balance) {
    if (items.length === 0) return '';
    return `
      <div class="lib-section">
        <h3 class="lib-section-title">${title}</h3>
        <div class="lib-masonry-grid">
          ${items.map(item => this.renderCard(item, ownedItems.has(item.id))).join('')}
        </div>
      </div>
    `;
  },

  renderCard(item, isOwned) {
    const bg = item.cover_url ? `background-image: url('${item.cover_url}'); background-size: cover;` : `background: ${item.cover_color || item.color};`;
    return `
      <div class="lib-card lib-${item.type}" onclick="libraryInstance.openDetails('${item.id}')">
        <div class="lib-thumb" style="${bg}">
          <span class="lib-type">${item.type}</span>
          ${isOwned ? '<span class="lib-owned-badge">Owned</span>' : ''}
        </div>
        <div class="lib-overlay">
          <h4>${item.title}</h4>
        </div>
      </div>
    `;
  },

  openDetails(item, isOwned, balance) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        <div class="lib-modal-header" style="background: ${item.cover_color || item.color};">
          <span class="lib-type">${item.type}</span>
        </div>
        <div style="padding: 24px;">
          <h2 style="margin-bottom: 8px; font-size: 24px;">${item.title}</h2>
          <p style="color: var(--text-muted); margin-bottom: 24px; font-size: 14px;">by ${item.author || 'Gliimu Originals'}</p>
          <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 32px;">${item.description}</p>

          ${isOwned
            ? `<button class="btn-primary" style="width: 100%;" onclick="alert('Opening file...');">Access Content</button>`
            : `<div class="lib-purchase-footer">
                <div>
                  <span style="font-size: 12px; color: var(--text-muted);">Price</span><br>
                  <span style="font-size: 24px; font-weight: 800;">₦${item.price?.toLocaleString() || 0}</span>
                </div>
                <button class="btn-primary" style="flex: 1; margin-left: 16px;" onclick="libraryInstance.purchase('${item.id}')">
                  ${balance >= item.price ? 'Unlock with Wallet' : 'Insufficient Balance'}
                </button>
              </div>`
          }
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async purchaseItem(itemId, items, currentBalance) {
    const item = items.find(i => i.id == itemId);
    if (!item) return alert("Item not found.");

    if (currentBalance < item.price) {
      return alert("Insufficient funds. Please top up your wallet.");
    }

    // 1. Deduct Wallet
    const newBalance = currentBalance - item.price;
    const { error: walletError } = await supabase.from('profiles')
      .update({ wallet_balance: newBalance })
      .eq('id', store.user.id);

    if (walletError) return alert("Error processing payment.");

    // 2. Record Purchase
    await supabase.from('purchases').insert({
      user_id: store.user.id,
      item_id: item.id
    });

    // 3. Record Transaction
    await supabase.from('transactions').insert({
      user_id: store.user.id,
      amount: -item.price,
      type: 'purchase',
      status: 'success',
      description: `Library: ${item.title}`
    });

    // 4. Increment Sales Counter (Optional, if you have a sales column)
    // await supabase.rpc('increment_sales', { item_id: item.id });

    alert("Purchase successful! You now own this item.");
    document.querySelector('.modal-overlay')?.remove();
    this.init(); // Reload library
  }
};
