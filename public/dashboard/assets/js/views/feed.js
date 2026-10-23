import hubView from './feed-gliims.js?v=78';
import { supabase } from '/shared/js/config.js';

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

      <div class="hub-category-tabs" id="hub-category-tabs">
        <button class="hub-category-tab active" data-category="all">Everything</button>
        <button class="hub-category-tab" data-category="xploring">Xploring</button>
        <button class="hub-category-tab" data-category="Media">Media</button>
        <button class="hub-category-tab" data-category="Tech">Tech</button>
        <button class="hub-category-tab" data-category="Business">Business</button>
        <button class="hub-category-tab" data-category="Personal">Personal</button>
        <button class="hub-category-tab" data-category="Education">Education</button>
        <button class="hub-category-tab" data-category="collections">Collections</button>
      </div>

      <div class="libmerge-feed" id="library-feed">
        <p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">Loading the Feed...</p>
      </div>
    </div>
  `,

  init() {
    this.searchQuery = '';

    this.setupTopbar();
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

    const { data: rows } = await supabase
      .from('post_hashtags')
      .select('hashtag, post_id');

    if (!rows || !rows.length) {
      container.innerHTML = '<p style="text-align:center;width:100%;padding:60px 0;color:var(--text-muted);">No collections yet.</p>';
      return;
    }

    const postIds = [...new Set(rows.map(r => r.post_id))];
    const { data: posts } = await supabase
      .from('feed_gliims')
      .select('id, user_id')
      .in('id', postIds);

    const postUserMap = {};
    (posts || []).forEach(p => { postUserMap[p.id] = p.user_id; });

    const counts = {};
    const participants = {};
    rows.forEach(r => {
      const tag = (r.hashtag || '').toLowerCase();
      if (!tag) return;
      counts[tag] = (counts[tag] || 0) + 1;
      const userId = postUserMap[r.post_id];
      if (userId) {
        if (!participants[tag]) participants[tag] = new Set();
        participants[tag].add(userId);
      }
    });

    const tags = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

    if (!tags.length) {
      container.innerHTML = '<p style="text-align:center;width:100%;padding:60px 0;color:var(--text-muted);">No collections yet.</p>';
      return;
    }

    container.innerHTML = `<div class="collections-grid">${tags.map(t => {
      const pCount = participants[t] ? participants[t].size : 0;
      return `<div class="collection-tag-card" onclick="window.location.hash='#/collection?name=${encodeURIComponent(t)}'">
        <span class="collection-tag-name">#${escapeHtml(t)}</span>
        <span class="collection-tag-count">${counts[t]} ${counts[t] === 1 ? 'gliim' : 'gliims'}</span>
        <span class="collection-tag-participants">${pCount} ${pCount === 1 ? 'participant' : 'participants'}</span>
      </div>`;
    }).join('')}</div>`;
  },

  renderFeed() {
    const container = document.getElementById('library-feed');
    if (!container) return;

    const gliimCards = hubView.filterPosts().map(post => ({
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
