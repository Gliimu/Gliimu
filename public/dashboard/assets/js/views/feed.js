import hubView from './feed-gliims.js?v=83';
import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

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
      .select('id, user_id, views, cover_url')
      .in('id', postIds);

    const { data: interactions } = await supabase
      .from('feed_interactions')
      .select('post_id, interaction_type')
      .in('post_id', postIds)
      .in('interaction_type', ['like', 'comment', 'share']);

    const postMap = {};
    (posts || []).forEach(p => { postMap[p.id] = p; });

    const interactionMap = {};
    (interactions || []).forEach(i => {
      if (!interactionMap[i.post_id]) interactionMap[i.post_id] = { likes: 0, comments: 0, shares: 0 };
      if (i.interaction_type === 'like') interactionMap[i.post_id].likes++;
      else if (i.interaction_type === 'comment') interactionMap[i.post_id].comments++;
      else if (i.interaction_type === 'share') interactionMap[i.post_id].shares++;
    });

    const userIds = [...new Set((posts || []).map(p => p.user_id).filter(Boolean))];
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id, avatar_url').in('id', userIds)
      : { data: [] };

    const avatarMap = {};
    (profiles || []).forEach(p => { avatarMap[p.id] = p.avatar_url; });

    const counts = {};
    const contributors = {};
    const stats = {};
    const topPost = {};
    rows.forEach(r => {
      const tag = (r.hashtag || '').toLowerCase();
      if (!tag) return;
      counts[tag] = (counts[tag] || 0) + 1;
      const post = postMap[r.post_id];
      if (!post) return;
      const userId = post.user_id;
      if (userId) {
        if (!contributors[tag]) contributors[tag] = {};
        contributors[tag][userId] = (contributors[tag][userId] || 0) + 1;
      }
      if (!stats[tag]) stats[tag] = { views: 0, comments: 0, shares: 0 };
      stats[tag].views += Number(post.views || 0);
      const postInteractions = interactionMap[r.post_id] || { likes: 0, comments: 0, shares: 0 };
      stats[tag].comments += postInteractions.comments;
      stats[tag].shares += postInteractions.shares;
      const pv = Number(post.views || 0);
      if (!topPost[tag] || pv > topPost[tag].views) {
        topPost[tag] = { views: pv, cover_url: post.cover_url };
      }
    });

    const currentUserId = store.user?.id;
    const userCollections = new Set();
    if (currentUserId) {
      Object.entries(contributors).forEach(([tag, contribMap]) => {
        if (contribMap[currentUserId]) userCollections.add(tag);
      });
    }

    const tags = Object.keys(counts).sort((a, b) => {
      const aIsUser = userCollections.has(a);
      const bIsUser = userCollections.has(b);
      if (aIsUser && !bIsUser) return -1;
      if (!aIsUser && bIsUser) return 1;
      return counts[b] - counts[a];
    });

    if (!tags.length) {
      container.innerHTML = '<p style="text-align:center;width:100%;padding:60px 0;color:var(--text-muted);">No collections yet.</p>';
      return;
    }

    container.innerHTML = `<div class="collections-grid">${tags.map(t => {
      const contribMap = contributors[t] || {};
      const topContribs = Object.entries(contribMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 9)
        .map(([uid]) => ({ user_id: uid, avatar_url: avatarMap[uid] }));
      const collectionStats = stats[t] || { views: 0, comments: 0, shares: 0 };
      const topCover = topPost[t]?.cover_url;

      const coverHtml = topCover
        ? `<div class="collection-tag-cover" style="background-image:url('${topCover}');"></div>`
        : `<div class="collection-tag-cover collection-tag-cover-empty"></div>`;

      const avatarsHtml = topContribs.length
        ? `<div class="collection-tag-avatars">${topContribs.map(c => c.avatar_url ? `<img src="${c.avatar_url}" alt="" class="collection-tag-avatar">` : `<div class="collection-tag-avatar collection-tag-avatar-fallback"></div>`).join('')}</div>`
        : '';

      const statsHtml = `<div class="collection-tag-stats">
        <span class="collection-stat"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>${collectionStats.views.toLocaleString()}</span>
        <span class="collection-stat"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>${collectionStats.comments.toLocaleString()}</span>
        <span class="collection-stat"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>${collectionStats.shares.toLocaleString()}</span>
      </div>`;

      return `<div class="collection-tag-card" onclick="window.location.hash='#/collection?name=${encodeURIComponent(t)}'">
        ${coverHtml}
        <div class="collection-tag-info">
          <span class="collection-tag-name">#${escapeHtml(t)}</span>
          <span class="collection-tag-count">${counts[t]} ${counts[t] === 1 ? 'gliim' : 'gliims'}</span>
          ${avatarsHtml}
          ${statsHtml}
        </div>
      </div>`;
    }).join('')}</div>`;
  },

  async renderFeed() {
    const container = document.getElementById('library-feed');
    if (!container) return;

    const filtered = await hubView.filterPosts();
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
