import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Library',
  template: `
    <div class="library-layout" id="library-container">
      <p style="color: var(--text-muted); text-align: center;">Loading library...</p>
    </div>
  `,

  init() {
    this.currentFilter = 'all';
    this.searchQuery = '';

    window.libraryInstance = {
      openDetails: (id) => this.openDetails(id),
      purchase: (id) => this.purchaseItem(id),
      toggleSave: (id, isSaved) => this.toggleSave(id, isSaved),
      rateItem: (id) => this.promptRate(id),
      logInteraction: (id, type) => this.logInteraction(id, type),
      addBlock: (type) => this.addBlock(type)
    };

    this.setupTopbarActions();
    this.fetchItems();
  },

  setupTopbarActions() {
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    const rightActions = document.getElementById('topbar-right-actions');

    if (topbarDynamic) {
      topbarDynamic.innerHTML = `
        <div class="hub-topbar-search">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="lib-search" placeholder="Search for elite contents...">
        </div>
      `;
      document.getElementById('lib-search').addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.applyFilters();
      });
    }

    if (rightActions) {
      rightActions.innerHTML = `
        <div class="hub-filter-wrapper">
          <button class="hub-filter-btn" id="lib-filter-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
          </button>
          <div class="hub-filter-menu" id="lib-dropdown">
            <div class="hub-filter-item active" data-filter="all">All Contents</div>
            <div class="hub-filter-item" data-filter="owned">My Collections</div>
            <div class="hub-filter-item" data-filter="bundle">Bundles</div>
            <div class="hub-filter-item" data-filter="publication">Publications</div>
            <div class="hub-filter-item" data-filter="audiolite">Audiolites</div>
          </div>
        </div>
      `;

      document.getElementById('lib-filter-btn').addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        document.getElementById('lib-dropdown').classList.toggle('active');
      });
      document.querySelectorAll('#lib-dropdown .hub-filter-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('#lib-dropdown .hub-filter-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          this.currentFilter = item.dataset.filter;
          document.getElementById('lib-dropdown').classList.remove('active');
          this.applyFilters();
        });
      });
    }
  },

  async fetchItems() {
    const [{ data: items }, { data: purchases }, { data: saved }, { data: profile }] = await Promise.all([
      supabase.from('library_items').select('*').order('created_at', { ascending: false }),
      supabase.from('purchases').select('item_id').eq('user_id', store.user.id),
      supabase.from('saved_items').select('item_id').eq('user_id', store.user.id),
      supabase.from('profiles').select('wallet_balance, interests').eq('id', store.user.id).single()
    ]);

    this.allItems = items || [];
    this.ownedItems = new Set(purchases?.map(p => p.item_id) || []);
    this.savedItems = new Set(saved?.map(s => s.item_id) || []);
    this.walletBalance = profile?.wallet_balance || 0;
    this.userInterests = profile?.interests ? profile.interests.toLowerCase().split(',') : [];

    this.applyFilters();
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
        item.title?.toLowerCase().includes(this.searchQuery) ||
        item.author?.toLowerCase().includes(this.searchQuery) ||
        item.description?.toLowerCase().includes(this.searchQuery)
      );
    }

    this.renderSections(filtered);
  },

  renderSections(items) {
    const contentDiv = document.getElementById('library-container');
    if (!contentDiv) return;

    if (items.length === 0) {
      contentDiv.innerHTML = '<p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">No items found.</p>';
      return;
    }

    const trending = [...items].sort((a, b) => this.calculateTrendScore(b) - this.calculateTrendScore(a)).slice(0, 4);
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
  },

  calculateTrendScore(item) {
    let score = item.sales || 0;
    return score;
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
    const isSaved = this.savedItems.has(item.id);
    const bg = item.cover_url ? `background-image: url('${item.cover_url}'); background-size: cover;` : `background: ${item.cover_color || item.color};`;
    const ownedBadge = isOwned ? '<span class="lib-tick-badge"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>' : '';
    const savedBadge = (isSaved && !isOwned) ? '<span class="lib-saved-badge"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg></span>' : '';

    return `
      <div class="lib-card lib-${item.type}" onclick="libraryInstance.openDetails('${item.id}')">
        <div class="lib-thumb" style="${bg}">
          ${ownedBadge}
          ${savedBadge}
        </div>
        <div class="lib-overlay">
          <h4>${item.title}</h4>
        </div>
      </div>
    `;
  },

  openDetails(item) {
    // Since we need the full item object, we find it from allItems
    const fullItem = this.allItems.find(i => i.id === item);
    if (!fullItem) return;

    const isOwned = this.ownedItems.has(fullItem.id);
    const isSaved = this.savedItems.has(fullItem.id);
    const balance = this.walletBalance;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay lib-modal-overlay';
    modal.innerHTML = `
      <div class="modal-content lib-modal-content">
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        <div class="lib-modal-header" style="background: ${fullItem.cover_color || fullItem.color};"></div>
        <div class="lib-modal-body">
          <span class="lib-modal-type">${fullItem.type}</span>
          <h2>${fullItem.title}</h2>
          <p class="lib-modal-author">by ${fullItem.author || 'Gliimu Originals'}</p>
          <p class="lib-modal-desc">${fullItem.description}</p>

          ${!isOwned ? `<div class="lib-modal-price">Price: <strong>₦${fullItem.price?.toLocaleString() || 0}</strong></div>` : ''}

          <div class="lib-action-row">
            ${isOwned
              ? `<button class="btn-primary lib-action-btn" onclick="alert('Opening file...');">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  Access Content
                </button>`
              : `<button class="btn-primary lib-action-btn" onclick="libraryInstance.purchase('${fullItem.id}')">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  ${balance >= fullItem.price ? 'Unlock' : 'Insufficient'}
                </button>`
            }

            <div class="hub-menu-wrapper">
              <button class="hub-menu-btn" onclick="event.stopPropagation(); libraryInstance.toggleMenu('${fullItem.id}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
              </button>
              <div class="hub-read-menu" id="lib-read-menu-${fullItem.id}">
                <div class="hub-read-menu-item" onclick="event.stopPropagation(); libraryInstance.toggleSave('${fullItem.id}', ${isSaved})">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                  ${isSaved ? 'Unsave Item' : 'Save Item'}
                </div>
                <div class="hub-read-menu-item" onclick="event.stopPropagation(); libraryInstance.rateItem('${fullItem.id}')">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                  Rate Item
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  toggleMenu(id) {
    const menu = document.getElementById(`lib-read-menu-${id}`);
    if (menu) menu.classList.toggle('active');
  },

  async toggleSave(id, isSaved) {
    if (isSaved) {
      await supabase.from('saved_items').delete().eq('user_id', store.user.id).eq('item_id', id);
      this.savedItems.delete(id);
    } else {
      await supabase.from('saved_items').insert({ user_id: store.user.id, item_id: id });
      this.savedItems.add(id);
    }
    this.toggleMenu(id);
    this.applyFilters();
    document.querySelector('.lib-modal-overlay')?.remove();
    this.openDetails(id);
  },

  promptRate(id) {
    const score = prompt("How good is this content? (1 - 10)");
    if (!score) return;

    const { error } = supabase.from('content_info').insert({ user_id: store.user.id, item_id: id, rating: parseInt(score) });
    if (error) return alert("Error submitting rating.");
    alert("Thank you for your rating!");
    this.toggleMenu(id);
  },

  async purchase(id) {
    const item = this.allItems.find(i => i.id === id);
    if (!item) return;

    if (this.walletBalance < item.price) return alert("Insufficient funds. Please top up your wallet.");

    const newBalance = this.walletBalance - item.price;
    const { error: walletError } = await supabase.from('profiles').update({ wallet_balance: newBalance }).eq('id', store.user.id);
    if (walletError) return alert("Error processing payment.");

    await supabase.from('purchases').insert({ user_id: store.user.id, item_id: id });
    await supabase.from('transactions').insert({ user_id: store.user.id, amount: -item.price, type: 'purchase', status: 'success', description: `Library Unlock: ${item.title}` });

    this.ownedItems.add(id);
    this.walletBalance = newBalance;
    alert(`Purchase successful! You earned ${Math.round(item.price / 1000)} GP.`);
    document.querySelector('.lib-modal-overlay')?.remove();
    this.applyFilters();
  }
};
