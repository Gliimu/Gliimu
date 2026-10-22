import { supabase } from '/shared/js/config.js';
import hubView from './feed-gliims.js?v=71';

// Feed is the merged home of every published work — gliims, books and
// audiolites all live in feed_gliims, classified by their blocks. This view
// owns the shell (topbar search, category tabs, FAB, masonry layout); hubView
// owns the data, the cards, the unified composer and the read view.
export default {
  title: 'XpLoRe',
  template: `
    <div class="libmerge hub-layout" id="library-container">
      <div class="sponsor-carousel-wrapper" id="sponsor-carousel-wrapper" style="display: none;">
        <div class="sponsor-carousel" id="sponsor-carousel"></div>
        <button class="sponsor-carousel-nav sponsor-carousel-prev" id="sponsor-prev" style="display: none;">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <button class="sponsor-carousel-nav sponsor-carousel-next" id="sponsor-next" style="display: none;">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>

      <div class="hub-category-tabs" id="hub-category-tabs">
        <button class="hub-category-tab active" data-category="all">Everything</button>
        <button class="hub-category-tab" data-category="xploring">Xploring</button>
        <button class="hub-category-tab" data-category="events">Events</button>
        <button class="hub-category-tab" data-category="Media">Media</button>
        <button class="hub-category-tab" data-category="Tech">Tech</button>
        <button class="hub-category-tab" data-category="Business">Business</button>
        <button class="hub-category-tab" data-category="Personal">Personal</button>
        <button class="hub-category-tab" data-category="Education">Education</button>
      </div>

      <div class="hub-filter-bar">
        <div class="hub-filter-wrapper">
          <button class="hub-filter-btn" id="hub-filter-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
          </button>
          <div class="hub-filter-menu" id="hub-dropdown">
            <div class="hub-filter-item" data-filter="mine">My Gliims</div>
            <div class="hub-filter-item" data-filter="saved">Saved Gliims</div>
            <div class="hub-filter-item" data-filter="tagged">Tagged Gliims</div>
            <div class="hub-filter-item" data-filter="drafts">Drafts</div>
          </div>
        </div>
      </div>

      <div class="libmerge-feed" id="library-feed">
        <p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">Loading the Feed...</p>
      </div>

      <div class="library-fab-wrapper">
        <button class="library-fab-main" id="library-fab-main" title="Publish">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
    </div>
  `,

  init() {
    this.searchQuery = '';
    this.sponsors = [];
    this.sponsorIndex = 0;

    this.setupTopbar();
    this.setupFab();
    this.setupCategoryTabs();
    this.loadSponsors();

    // Gliim cards render through this view so they sit in the shared masonry
    // feed; hub hands its render calls back here.
    hubView.onFeedChange = () => this.renderFeed();

    // Column widths change with the viewport, so re-pack the masonry on resize.
    if (!this._masonryResize) {
      this._masonryResize = () => {
        clearTimeout(this._masonryTimer);
        this._masonryTimer = setTimeout(() => this.layoutMasonry(), 120);
      };
      window.addEventListener('resize', this._masonryResize);
    }

    hubView.init();
  },

  setupFab() {
    const fab = document.getElementById('library-fab-main');
    if (!fab) return;
    // One compiler for every kind: the composer auto-classifies the work from
    // its blocks (video → bundle, audio → audiolite, document → book).
    fab.addEventListener('click', () => hubView.openCreateModal());
  },

  setupTopbar() {
    // The gliim filter menu (Mine / Tagged / Saved / Drafts).
    hubView.setupTopbarActions();
  },

  setupCategoryTabs() {
    const tabs = document.querySelectorAll('.hub-category-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        hubView.currentFilter = tab.dataset.category;
        hubView.renderPosts(hubView.currentPosts);
      });
    });
  },

  renderFeed() {
    const container = document.getElementById('library-feed');
    if (!container) return;

    const showPosts = hubView.currentFilter !== 'events';

    const gliimCards = showPosts
      ? hubView.filterPosts().map(post => ({
          at: Date.parse(post.created_at) || 0,
          html: this.wrapItem(hubView.renderPostCard(post), 'gliim')
        }))
      : [];

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
  layoutMasonry() {
    const feed = document.querySelector('#library-feed .library-feed');
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
  },

  async loadSponsors() {
    const { data: sponsors, error } = await supabase
      .from('sponsor_posts')
      .select('*')
      .eq('active', true)
      .order('position', { ascending: true });

    if (error || !sponsors || sponsors.length === 0) {
      return;
    }

    this.sponsors = sponsors;
    this.renderSponsorCarousel();
  },

  renderSponsorCarousel() {
    if (!this.sponsors.length) return;

    const wrapper = document.getElementById('sponsor-carousel-wrapper');
    const carousel = document.getElementById('sponsor-carousel');
    const prevBtn = document.getElementById('sponsor-prev');
    const nextBtn = document.getElementById('sponsor-next');

    if (!wrapper || !carousel) return;

    wrapper.style.display = '';

    const renderSlide = () => {
      const sponsor = this.sponsors[this.sponsorIndex];
      if (!sponsor) return;

      carousel.innerHTML = `
        <a href="${sponsor.link_url || '#'}" class="sponsor-slide" target="_blank" rel="noopener">
          <img src="${sponsor.image_url}" alt="${sponsor.title}" class="sponsor-image">
          <div class="sponsor-overlay">
            <div class="sponsor-badge">Sponsored</div>
            <h3 class="sponsor-title">${sponsor.title}</h3>
            ${sponsor.description ? `<p class="sponsor-desc">${sponsor.description}</p>` : ''}
            <div class="sponsor-meta">${sponsor.sponsor_name}</div>
          </div>
        </a>
      `;

      // Show/hide nav buttons based on number of sponsors
      if (this.sponsors.length > 1) {
        prevBtn.style.display = '';
        nextBtn.style.display = '';
      } else {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
      }
    };

    prevBtn.onclick = () => {
      this.sponsorIndex = (this.sponsorIndex - 1 + this.sponsors.length) % this.sponsors.length;
      renderSlide();
    };

    nextBtn.onclick = () => {
      this.sponsorIndex = (this.sponsorIndex + 1) % this.sponsors.length;
      renderSlide();
    };

    renderSlide();

    // Auto-advance every 5 seconds if multiple sponsors
    if (this.sponsors.length > 1) {
      if (this.sponsorInterval) clearInterval(this.sponsorInterval);
      this.sponsorInterval = setInterval(() => {
        this.sponsorIndex = (this.sponsorIndex + 1) % this.sponsors.length;
        renderSlide();
      }, 5000);
    }
  }
};
