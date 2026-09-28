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

    const [{ data: items }, { data: purchases }, { data: saved }, { data: profile }, { data: ratings }] = await Promise.all([
      supabase.from('library_items').select('*').order('created_at', { ascending: false }),
      supabase.from('purchases').select('item_id').eq('user_id', store.user.id),
      supabase.from('saved_items').select('item_id').eq('user_id', store.user.id),
      supabase.from('profiles').select('wallet_balance, interests, subscription_expires_at').eq('id', store.user.id).single(),
      supabase.from('content_info').select('item_id, rating, review') // Fetch all ratings for trending calc
    ]);

    this.allItems = items || [];
    this.ownedItems = new Set(purchases?.map(p => p.item_id) || []);
    this.savedItems = new Set(saved?.map(s => s.item_id) || []);
    this.walletBalance = profile?.wallet_balance || 0;
    this.userInterests = profile?.interests ? profile.interests.toLowerCase().split(',') : [];
    this.ratings = ratings || [];

    document.getElementById('lib-balance').innerText = this.walletBalance.toLocaleString();
    this.updateSubIndicator(profile?.subscription_expires_at);

    this.applyFilters();

    window.libraryInstance = {
      openDetails: (id) => {
        const item = this.allItems.find(i => i.id == id);
        if (item) this.openDetails(item, this.ownedItems.has(item.id), this.walletBalance, this.savedItems.has(item.id));
      },
      purchase: (id) => this.purchaseItem(id),
      toggleSave: (id, isSaved) => this.toggleSave(id, isSaved),
      rateItem: (id) => this.promptRate(id)
    };

    document.getElementById('lib-search').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.applyFilters();
    });

    document.getElementById('lib-filter-btn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('lib-dropdown').classList.toggle('active');
    });

    document.querySelectorAll('.lib-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.lib-dropdown-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        this.currentFilter = item.dataset.filter;
        document.getElementById('lib-dropdown').classList.remove('active');
        this.applyFilters();
      });
    });

    document.addEventListener('click', () => {
      document.getElementById('lib-dropdown').classList.remove('active');
    });
  },

  // Helper: Calculate Trending Score
  calculateTrendScore(item) {
    let score = item.sales || 0;
    const itemRatings = this.ratings.filter(r => r.item_id === item.id);

    itemRatings.forEach(r => {
      if (r.rating > 5) score += 20; // High rating boosts trend
      if (r.review) {
        const lowerReview = r.review.toLowerCase();
        const positiveWords = ['good', 'great', 'excellent', 'amazing', 'helpful', 'elite', 'best', 'top', 'love', 'perfect', 'quality'];
        positiveWords.forEach(w => {
          if (lowerReview.includes(w)) score += 10; // Positive words boost trend
        });
      }
    });
    return score;
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
    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    let color;
    if (diffDays <= 0) color = 'var(--error)';
    else if (diffDays <= 7) color = '#F97316';
    else if (diffDays <= 14) color = 'var(--warning)';
    else color = 'var(--success)';
    indicator.style.background = color;
    indicator.style.boxShadow = `0 0 10px ${color}`;
  },

  applyFilters() {
    let filtered = this.allItems;

    if (this.currentFilter === 'owned') {
      filtered = filtered.filter(item => this.ownedItems.has(item.id) || this.savedItems.has(item.id));
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
    if (items.length === 0) {
      contentDiv.innerHTML = '<p style="color: var(--text-muted); text-align: center; margin-top: 40px;">No items found.</p>';
      return;
    }

    if (this.currentFilter === 'all' && !this.searchQuery) {
      // Use new Trending Algorithm
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

  openDetails(item, isOwned, balance, isSaved) {
    document.querySelector('.modal-overlay')?.remove();

    let menuActionHtml = '';
    if (isOwned) {
      menuActionHtml = `<div class="lib-menu-item" id="rate-item-btn">Rate Item</div>`;
    } else {
      menuActionHtml = `<div class="lib-menu-item" id="save-item-btn">${isSaved ? 'Unsave Item' : 'Save Item'}</div>`;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content lib-modal-content">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>

        <div class="lib-modal-body">
          <span class="lib-modal-type">${item.type}</span>
          <h2>${item.title}</h2>
          <p class="lib-modal-author">by ${item.author || 'Gliimu Originals'}</p>
          <p class="lib-modal-desc">${item.description}</p>

          ${!isOwned ? `<div class="lib-modal-price">Price: <strong>₦${item.price?.toLocaleString() || 0}</strong></div>` : ''}

          <div class="lib-action-row">
            ${isOwned
              ? `<button class="btn-primary lib-action-btn" onclick="alert('Opening file...');">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  Access Content
                </button>`
              : `<button class="btn-primary lib-action-btn" onclick="libraryInstance.purchase('${item.id}')">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  ${balance >= item.price ? 'Unlock' : 'Insufficient'}
                </button>`
            }

            <div class="lib-modal-menu">
              <button class="lib-menu-btn" id="lib-menu-toggle">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
              </button>
              <div class="lib-menu-dropdown" id="lib-menu-dropdown">
                ${menuActionHtml}
                <div class="lib-menu-item" onclick="alert('Content reported.'); document.getElementById('lib-menu-dropdown').classList.remove('active');">Report Content</div>
                <div class="lib-menu-item ask-me-item">
                  <img src="${item.author_avatar || 'https://via.placeholder.com/20'}" alt="Author" class="lib-menu-avatar">
                  Ask Me
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('lib-menu-toggle').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('lib-menu-dropdown').classList.toggle('active');
    });

    if (isOwned) {
      document.getElementById('rate-item-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        libraryInstance.rateItem(item.id);
      });
    } else {
      document.getElementById('save-item-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        libraryInstance.toggleSave(item.id, isSaved);
      });
    }
  },

  async toggleSave(itemId, isCurrentlySaved) {
    if (isCurrentlySaved) {
      await supabase.from('saved_items').delete().eq('user_id', store.user.id).eq('item_id', itemId);
      this.savedItems.delete(itemId);
      alert("Item removed from collections.");
    } else {
      await supabase.from('saved_items').insert({ user_id: store.user.id, item_id: itemId });
      this.savedItems.add(itemId);
      alert("Item saved to your collections! You can view it in 'My Collections'.");
    }
    document.querySelector('.modal-overlay')?.remove();
    this.applyFilters();
  },

  promptRate(itemId) {
    document.querySelector('.modal-overlay')?.remove();
    const item = this.allItems.find(i => i.id == itemId);
    if (!item) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content lib-modal-content">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        <div class="lib-modal-body">
          <span class="lib-modal-type">Feedback</span>
          <h2>Rate: ${item.title}</h2>
          <p class="lib-modal-author">Your feedback helps us identify trending content.</p>

          <div class="form-group" style="margin-top: 24px;">
            <label>How good is this content? (1 - 10)</label>
            <input type="number" id="rate-score" class="input" min="1" max="10" placeholder="e.g. 8">
          </div>
          <div class="form-group">
            <label>Review (Max 50 words)</label>
            <textarea id="rate-review" class="input" rows="3" maxlength="300" placeholder="Share your thoughts..."></textarea>
          </div>
          <button class="btn-primary" style="width: 100%;" id="submit-rate-btn">Submit Rating</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('submit-rate-btn').addEventListener('click', async () => {
      const score = parseInt(document.getElementById('rate-score').value);
      const review = document.getElementById('rate-review').value.trim();

      if (!score || score < 1 || score > 10) return alert("Please enter a score between 1 and 10.");

      const { error } = await supabase.from('content_info').insert({
        user_id: store.user.id,
        item_id: item.id,
        rating: score,
        review: review
      });

      if (error) {
        if (error.code === '23505') return alert("You have already rated this item.");
        return alert("Error submitting rating: " + error.message);
      }

      alert("Thank you for your rating!");
      modal.remove();
      this.init(); // Reload to update trending scores
    });
  },

  async purchaseItem(itemId) {
    const item = this.allItems.find(i => i.id == itemId);
    if (!item) return alert("Item not found.");

    if (this.walletBalance < item.price) {
      return alert("Insufficient funds. Please top up your wallet.");
    }

    const earnedPoints = Math.round(item.price / 1000);
    const newBalance = this.walletBalance - item.price;

    const { error: walletError } = await supabase.from('profiles')
      .update({ wallet_balance: newBalance })
      .eq('id', store.user.id);

    if (walletError) return alert("Error processing payment.");

    await supabase.from('purchases').insert({ user_id: store.user.id, item_id: item.id });
    await supabase.from('transactions').insert({
      user_id: store.user.id,
      amount: -item.price,
      type: 'purchase',
      status: 'success',
      description: `Library Unlock: ${item.title}`,
      points: earnedPoints
    });

    this.ownedItems.add(item.id);
    this.walletBalance = newBalance;

    alert(`Purchase successful! You earned ${earnedPoints} GP.`);
    document.querySelector('.modal-overlay')?.remove();
    this.init();
  }
};
