import hubView from './feed-gliims.js?v=58';

// Feed is the merged home of every published work — gliims, books and
// audiolites all live in feed_gliims, classified by their blocks. This view
// owns the shell (topbar search, category tabs, FAB, masonry layout); hubView
// owns the data, the cards, the unified composer and the read view.
export default {
  title: 'XpLoRe',
  template: `
    <div class="libmerge hub-layout" id="library-container">
      <div class="hub-category-tabs" id="hub-category-tabs">
        <button class="hub-category-tab active" data-category="all">Everything</button>
        <button class="hub-category-tab" data-category="Media">Media</button>
        <button class="hub-category-tab" data-category="Tech">Tech</button>
        <button class="hub-category-tab" data-category="Business">Business</button>
        <button class="hub-category-tab" data-category="Personal">Personal</button>
        <button class="hub-category-tab" data-category="Education">Education</button>
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

    this.setupTopbar();
    this.setupFab();
    this.setupCategoryTabs();

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
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    if (topbarDynamic) {
      topbarDynamic.innerHTML = `
        <div class="lib-topbar-search">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="lib-search" class="lib-topbar-search-input" placeholder="Search gliims, books and audiolites...">
        </div>
      `;
      document.getElementById('lib-search').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        this.searchQuery = q;
        hubView.searchQuery = q;
        if (q.length >= 3) hubView.interestSignal(0, null, q);
        this.renderFeed();
      });
    }

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

    // Events render at the top of the feed, interleaved with gliim posts
    const eventCards = (hubView.currentEvents || []).map(event => ({
      at: Date.parse(event.start_date) || Date.parse(event.created_at) || 0,
      html: this.wrapItem(hubView.renderEventCard(event), 'event')
    }));

    const gliimCards = hubView.filterPosts().map(post => ({
      at: Date.parse(post.created_at) || 0,
      html: this.wrapItem(hubView.renderPostCard(post), 'gliim')
    }));

    const cards = [...eventCards, ...gliimCards]
      .sort((a, b) => b.at - a.at)
      .map(c => c.html);

    if (!cards.length) {
      container.innerHTML = '<p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">Nothing here yet.</p>';
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
  }
};
