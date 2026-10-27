import hubView from './feed-gliims.js?v=90';
import { supabase } from '/shared/js/config.js';
import { store } from '../store.js?v=2';
import { loadCollections, renderCollectionCard } from '../collections.js?v=1';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Feed is the merged home of every published work — gliims, books and
// audiolites all live in feed_gliims, classified by their blocks. This view
// owns the shell (topbar search, category tabs, FAB, masonry layout); hubView
// owns the data, the cards, the unified composer and the read view.
export default {
  title: 'XpLoRe',
  template: `
    <div class="libmerge hub-layout" id="library-container">
      <div class="featured-carousel" id="featured-carousel" style="display:none;"></div>

      <div class="hub-category-tabs" id="hub-category-tabs">
        <button class="hub-category-tab active" data-category="all">For You</button>
        <button class="hub-category-tab" data-category="xploring">Xploring</button>
        <button class="hub-category-tab" data-category="collections">Collections</button>
        <button class="hub-category-tab" data-category="Media">Media</button>
        <button class="hub-category-tab" data-category="Tech">Tech</button>
        <button class="hub-category-tab" data-category="Business">Business</button>
        <button class="hub-category-tab" data-category="Personal">Personal</button>
        <button class="hub-category-tab" data-category="Education">Education</button>
      </div>

      <div class="libmerge-feed" id="library-feed">
        <p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">Loading the Feed...</p>
      </div>
    </div>
  `,

  init() {
    this.searchQuery = '';
    this.currentTab = 'all';

    this.setupCategoryTabs();

    hubView.onFeedChange = () => this.renderFeed();

    if (!this._masonryResize) {
      this._masonryResize = () => {
        clearTimeout(this._masonryTimer);
        this._masonryTimer = setTimeout(() => this.layoutMasonry(), 120);
      };
      window.addEventListener('resize', this._masonryResize);
    }

    hubView.init();
    window.feedInstance = this;
    this.loadFeaturedPosts();
  },

  async loadFeaturedPosts() {
    const now = new Date().toISOString();
    const { data: posts } = await supabase
      .from('featured_posts')
      .select('id, title, description, image_url, link_url, link_label')
      .eq('status', 'approved')
      .lte('starts_at', now)
      .gte('ends_at', now)
      .order('created_at', { ascending: false })
      .limit(3);

    this._featuredPosts = posts || [];
    this._featuredIndex = 0;
    this.renderFeaturedCarousel();
    if (this._featuredPosts.length > 1) this.startFeaturedRotation();
  },

  renderFeaturedCarousel() {
    const el = document.getElementById('featured-carousel');
    if (!el) return;
    if (!this._featuredPosts || !this._featuredPosts.length) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    el.onmouseenter = () => {
      if (this._featuredTimer) { clearInterval(this._featuredTimer); this._featuredTimer = null; }
    };
    el.onmouseleave = () => {
      if (this._featuredPosts.length > 1 && !this._featuredTimer) this.startFeaturedRotation();
    };
    this.updateFeaturedSlide();
  },

  updateFeaturedSlide() {
    const el = document.getElementById('featured-carousel');
    if (!el || !this._featuredPosts || !this._featuredPosts.length) return;
    const post = this._featuredPosts[this._featuredIndex];
    const dots = this._featuredPosts.length > 1
      ? `<div class="featured-dots">${this._featuredPosts.map((_, i) => `<span class="featured-dot${i === this._featuredIndex ? ' active' : ''}" onclick="feedInstance.goToFeaturedSlide(${i})"></span>`).join('')}</div>`
      : '';
    el.innerHTML = `
      <div class="featured-slide">
        ${post.image_url ? `<img src="${post.image_url}" alt="" class="featured-slide-img">` : '<div class="featured-slide-img featured-slide-img-empty"></div>'}
        <div class="featured-slide-overlay"></div>
        <span class="featured-badge">Featured</span>
        <div class="featured-slide-content">
          <h3 class="featured-slide-title">${escapeHtml(post.title)}</h3>
          <p class="featured-slide-desc">${escapeHtml(post.description || '')}</p>
          ${post.link_url ? `<a href="${post.link_url}" target="_blank" rel="noopener" class="featured-slide-link" onclick="event.stopPropagation()">${escapeHtml(post.link_label || 'Learn more')}</a>` : ''}
        </div>
      </div>
      ${dots}
    `;
  },

  goToFeaturedSlide(index) {
    this._featuredIndex = index;
    this.updateFeaturedSlide();
  },

  startFeaturedRotation() {
    if (this._featuredTimer) clearInterval(this._featuredTimer);
    this._featuredTimer = setInterval(() => {
      this._featuredIndex = (this._featuredIndex + 1) % this._featuredPosts.length;
      this.updateFeaturedSlide();
    }, 7000);
  },

  setupCategoryTabs() {
    const tabs = document.querySelectorAll('.hub-category-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.category;
        if (tab.dataset.category === 'collections') {
          this.renderCollections();
        } else {
          hubView.currentFilter = tab.dataset.category;
          hubView.renderPosts(hubView.currentPosts);
          this.renderFeed();
        }
      });
    });
  },

  async renderCollections() {
    const container = document.getElementById('library-feed');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;width:100%;padding:60px 0;color:var(--text-muted);">Loading collections...</p>';

    try {
      const collections = await loadCollections();
      if (!container.isConnected || this.currentTab !== 'collections') return;
      collections.sort((a, b) => Number(b.userIds.includes(store.user?.id)) - Number(a.userIds.includes(store.user?.id)) || b.count - a.count);
      container.innerHTML = collections.length
        ? `<div class="collections-grid">${collections.map(renderCollectionCard).join('')}</div>`
        : '<p style="text-align:center;width:100%;padding:60px 0;color:var(--text-muted);">No collections yet.</p>';
    } catch (error) {
      console.error('Collections could not load:', error);
      if (container.isConnected && this.currentTab === 'collections') container.innerHTML = '<p style="text-align:center;width:100%;padding:60px 0;color:var(--text-muted);">Could not load collections.</p>';
    }
  },

  async renderFeed() {
    const container = document.getElementById('library-feed');
    if (!container || this.currentTab === 'collections') return;

    const filtered = await hubView.filterPosts();
    if (!container.isConnected || this.currentTab === 'collections') return;
    const gliimCards = filtered.map(post => ({
        at: Date.parse(post.created_at) || 0,
        html: this.wrapItem(hubView.renderPostCard(post), 'gliim')
      }));

    const cards = gliimCards
      .sort((a, b) => b.at - a.at)
      .map(c => c.html);

    if (!cards.length) {
      const msg = 'Nothing here yet.';
      container.innerHTML = `<p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">${msg}</p>`;
      return;
    }

    container.innerHTML = `<div class="library-feed feed-grid">${cards.join('')}</div>`;
    this.layoutMasonry();
  },

  wrapItem(html, kind) {
    return `<div class="feed-item feed-item--${kind}">${html}</div>`;
  },

  // Pinterest masonry: each item spans exactly its own height in 8px row
  // slices (plus its bottom gap), so short tiles tuck under tall cards with
  // no row-sized dead space. Re-run whenever widths change.
  layoutMasonry(scope = '#library-feed') {
    const feed = document.querySelector(`${scope} .library-feed`);
    if (!feed) return;

    const ROW = 8;
    const GAP = window.matchMedia('(max-width: 768px)').matches ? 12 : 24;

    feed.querySelectorAll('.feed-item').forEach(item => {
      const inner = item.firstElementChild;
      if (!inner) return;
      item.style.gridRowEnd = 'auto';
      const height = inner.getBoundingClientRect().height;
      item.style.gridRowEnd = `span ${Math.max(1, Math.ceil((height + GAP) / ROW))}`;
    });
  }
};
