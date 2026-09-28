import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Library',
  template: `
    <div class="library-layout" id="library-container">
      <div class="library-header">
        <div>
          <h2>Gliimu Elite Library</h2>
          <p>Premium publications, audiolites, and bundles.</p>
        </div>
        <div class="subscription-badge" id="sub-badge">
          <span class="sub-indicator" id="sub-indicator"></span>
          <span>₦<span id="lib-balance">0</span></span>
        </div>
      </div>

      <div class="lib-controls">
        <div class="lib-search-wrapper">
          <i class="fas fa-search lib-search-icon"></i>
          <input type="text" id="lib-search" class="lib-search-input" placeholder="Search for elite contents...">
        </div>
        <div class="lib-filter-wrapper">
          <button class="lib-filter-btn" id="lib-filter-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
          </button>
          <div class="lib-dropdown-menu" id="lib-dropdown">
            <div class="lib-dropdown-item active" data-filter="all">All Contents</div>
            <div class="lib-dropdown-item" data-filter="owned">My Collections</div>
            <div class="lib-dropdown-item" data-filter="bundle">Bundles</div>
            <div class="lib-dropdown-item" data-filter="publication">Publications</div>
            <div class="lib-dropdown-item" data-filter="audiolite">Audiolites</div>
          </div>
        </div>
      </div>

      <div id="library-content">
        <p style="color: var(--text-muted); text-align: center;">Loading library...</p>
      </div>
    </div>
  `,
  async init() {
    this.currentFilter = 'all';
    this.searchQuery = '';

    const container = document.getElementById('library-container');
    if (!container) return;

    const [{ data: items }, { data: purchases }, { data: profile }] = await Promise.all([
      supabase.from('library_items').select('*').order('created_at', { ascending: false }),
      supabase.from('purchases').select('item_id').eq('user_id', store.user.id),
      supabase.from('profiles').select('wallet_balance, interests, subscription_expires_at').eq('id', store.user.id).single()
    ]);

    // Rich Mock Data with Thumbnails
    this.allItems = [
      { id: '1', type: 'bundle', title: 'Ultimate Media Kit', author: 'Gliimu Ltd', price: 15000, cover_url: 'https://images.unsplash.com/photo-1620712943543-bcc4688e391b?q=80&w=800', description: 'All the tools, presets, and templates you need to launch your media empire.', created_at: new Date().toISOString(), sales: 120 },
      { id: '2', type: 'publication', title: 'Business Services Playbook', author: 'Captain A.', price: 7500, cover_url: 'https://images.unsplash.com/photo-1454165804609-c3dadc57d400?q=80&w=800', description: 'A comprehensive guide to structuring your freelance business for high-ticket clients.', created_at: new Date().toISOString(), sales: 85 },
      { id: '3', type: 'audiolite', title: 'Mindset of an Elite Gliimait', author: 'Captain B.', price: 5000, cover_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=800', description: 'Audio series on building the mental resilience required for independent success.', created_at: new Date().toISOString(), sales: 200 },
      { id: '4', type: 'publication', title: 'Elite Freelancing Guide', author: 'Gliimu Ltd', price: 6000, cover_url: 'https://images.unsplash.com/photo-1551434678-e076c223a692?q=80&w=800', description: 'How to find, pitch, and close premium clients globally.', created_at: new Date(Date.now() - 86400000).toISOString(), sales: 50 },
      { id: '5', type: 'bundle', title: 'Full Stack Media Architecture', author: 'Gliimu Originals', price: 12000, cover_url: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?q=80&w=800', description: 'The complete blueprint for building media empires from scratch.', created_at: new Date(Date.now() - 172800000).toISOString(), sales: 300 },
      { id: '6', type: 'audiolite', title: 'Creative Flow States', author: 'Captain C.', price: 3000, cover_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=800', description: 'Audio guides for entering deep work and creative flow.', created_at: new Date(Date.now() - 259200000).toISOString(), sales: 15 },
      { id: '7', type: 'publication', title: 'Cinematic LUT Pack', author: 'Captain D.', price: 8000, cover_url: 'https://images.unsplash.com/photo-1572044162444-ad60f128bdea?q=80&w=800', description: 'Hollywood-grade color grading presets for your video projects.', created_at: new Date().toISOString(), sales: 90 },
      { id: '8', type: 'audiolite', title: 'Client Acquisition Audio', author: 'Captain A.', price: 4000, cover_url: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?q=80&w=800', description: 'Listen to real cold calls and pitch breakdowns.', created_at: new Date().toISOString(), sales: 45 },
      { id: '9', type: 'bundle', title: 'UI/UX Wireframe Kit', author: 'Gliimu Ltd', price: 10000, cover_url: 'https://images.unsplash.com/photo-1545235617-9465d5a6c59f?q=80&w=800', description: 'Steal my exact Figma wireframes for client web projects.', created_at: new Date(Date.now() - 300000000).toISOString(), sales: 150 },
      { id: '10', type: 'publication', title: 'The 1B Naira Mindset', author: 'Gliimu', price: 5000, cover_url: 'https://images.unsplash.com/photo-1542744095-291d1f67b221?q=80&w=800', description: 'Reprogramming your brain for premium value.', created_at: new Date().toISOString(), sales: 210 },
      { id: '11', type: 'audiolite', title: 'Audio Mixing Presets', author: 'Captain E.', price: 3500, cover_url: 'https://images.unsplash.com/photo-1598488035136-b9b8a8710c46?q=80&w=800', description: 'Studio-grade EQ and compression presets for podcasts.', created_at: new Date().toISOString(), sales: 60 },
      { id: '12', type: 'bundle', title: 'Legal Contract Templates', author: 'Gliimu Ltd', price: 9000, cover_url: 'https://images.unsplash.com/photo-1589829085413-56de8db18f14?q=80&w=800', description: 'Never get scammed. Protect your payments with these lawyer-approved templates.', created_at: new Date().toISOString(), sales: 180 }
    ];

    this.ownedItems = new Set(purchases?.map(p => p.item_id) || []);
    this.walletBalance = profile?.wallet_balance || 0;
    this.userInterests = profile?.interests ? profile.interests.toLowerCase().split(',') : [];

    document.getElementById('lib-balance').innerText = this.walletBalance.toLocaleString();
    this.updateSubIndicator(profile?.subscription_expires_at);

    this.applyFilters();

    window.libraryInstance = {
      openDetails: (id) => {
        const item = this.allItems.find(i => i.id == id);
        if (item) this.openDetails(item, this.ownedItems.has(item.id), this.walletBalance);
      },
      purchase: (id) => this.purchaseItem(id)
    };

    // Listeners
    document.getElementById('lib-search').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.applyFilters();
    });

    document.getElementById('lib-filter-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('lib-dropdown').classList.toggle('active');
    });

    document.querySelectorAll('.lib-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.lib-dropdown-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        this.currentFilter = item.dataset.filter;
        document.getElementById('lib-dropdown').classList.remove('active');
        this.applyFilters();
      });
    });

    // Close dropdown if clicked outside
    document.addEventListener('click', () => {
      document.getElementById('lib-dropdown').classList.remove('active');
    });
  },

  updateSubIndicator(expiresAt) {
    const indicator = document.getElementById('sub-indicator');
    if (!expiresAt) {
      indicator.style.background = 'var(--error)';
      indicator.style.boxShadow = '0 0 8px var(--error)';
      return;
    }

    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let color;
    if (diffDays <= 0) color = 'var(--error)'; // Red
    else if (diffDays <= 7) color = '#F97316'; // Orange
    else if (diffDays <= 14) color = 'var(--warning)'; // Yellow
    else color = 'var(--success)'; // Green

    indicator.style.background = color;
    indicator.style.boxShadow = `0 0 10px ${color}`;
  },

  applyFilters() {
    let filtered = this.allItems;

    if (this.currentFilter === 'owned') {
      filtered = filtered.filter(item => this.ownedItems.has(item.id));
    } else if (this.currentFilter !== 'all') {
      filtered = filtered.filter(item => item.type === this.currentFilter);
    }

    if (this.searchQuery) {
      filtered = filtered.filter(item =>
        item.title.toLowerCase().includes(this.searchQuery) ||
        item.author?.toLowerCase().includes(this.searchQuery) ||
        item.description?.toLowerCase().includes(this.searchQuery)
      );
    }

    this.renderSections(filtered);
  },

  renderSections(items) {
    const contentDiv = document.getElementById('library-content');
    if (!contentDiv) return;

    if (items.length === 0) {
      contentDiv.innerHTML = '<p style="color: var(--text-muted); text-align: center; margin-top: 40px;">No items found.</p>';
      return;
    }

    if (this.currentFilter === 'all' && !this.searchQuery) {
      const trending = [...items].sort((a, b) => (b.sales || 0) - (a.sales || 0)).slice(0, 4);
      const newToShelf = [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4);
      const forYou = items.filter(item =>
        this.userInterests.some(interest => item.title.toLowerCase().includes(interest.trim()) || item.description.toLowerCase().includes(interest.trim()))
      ).slice(0, 4);
      const forYouFinal = forYou.length > 0 ? forYou : items.slice(0, 4);

      let html = '';
      html += this.renderSection('For You', forYouFinal);
      html += this.renderSection('Trending', trending);
      html += this.renderSection('New to Shelf', newToShelf);
      html += this.renderSection('All Contents', items);

      contentDiv.innerHTML = html;
    } else {
      contentDiv.innerHTML = this.renderSection('Results', items);
    }
  },

  renderSection(title, items) {
    if (items.length === 0) return '';
    return `
      <div class="lib-section">
        <h3 class="lib-section-title">${title}</h3>
        <div class="lib-masonry-grid">
          ${items.map(item => this.renderCard(item)).join('')}
        </div>
      </div>
    `;
  },

  renderCard(item) {
    const isOwned = this.ownedItems.has(item.id);
    const bg = item.cover_url ? `background-image: url('${item.cover_url}'); background-size: cover;` : `background: ${item.cover_color || item.color};`;
    // Removed text badge, kept Owned badge
    return `
      <div class="lib-card lib-${item.type}" onclick="libraryInstance.openDetails('${item.id}')">
        <div class="lib-thumb" style="${bg}">
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
        <div class="lib-modal-header" style="background: ${item.cover_color || item.color};"></div>
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

  async purchaseItem(itemId) {
    const item = this.allItems.find(i => i.id == itemId);
    if (!item) return alert("Item not found.");

    if (this.walletBalance < item.price) {
      return alert("Insufficient funds. Please top up your wallet.");
    }

    const newBalance = this.walletBalance - item.price;
    const { error: walletError } = await supabase.from('profiles')
      .update({ wallet_balance: newBalance })
      .eq('id', store.user.id);

    if (walletError) return alert("Error processing payment.");

    await supabase.from('purchases').insert({ user_id: store.user.id, item_id: item.id });
    await supabase.from('transactions').insert({ user_id: store.user.id, amount: -item.price, type: 'purchase', status: 'success', description: `Library: ${item.title}` });

    alert("Purchase successful! You now own this item.");
    document.querySelector('.modal-overlay')?.remove();
    this.init(); // Reload library
  }
};
