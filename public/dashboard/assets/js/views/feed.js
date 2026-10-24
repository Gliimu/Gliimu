import hubView from './feed-gliims.js?v=78';
import { supabase } from '/shared/js/config.js';
import { uploadFile } from '../upload.js';
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
        <button class="feature-content-btn" id="feature-content-btn" onclick="feedInstance.openFeatureModal()">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          <span>Feature your content</span>
        </button>
      </div>

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

      <div class="featured-carousel" id="featured-carousel" style="display:none;"></div>

      <div class="libmerge-feed" id="library-feed">
        <p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">Loading the Feed...</p>
      </div>
    </div>
  `,

  init() {
    this.searchQuery = '';

    this.setupTopbar();
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
        <div class="featured-slide-content">
          <span class="featured-badge">Featured</span>
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
    }, 5000);
  },

  openFeatureModal() {
    if (document.getElementById('feature-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'feature-modal';
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) this.closeFeatureModal(); };
    modal.innerHTML = `
      <div class="modal-content feature-modal-content">
        <button class="modal-close" onclick="feedInstance.closeFeatureModal()">&times;</button>
        <h2>Feature Your Content</h2>
        <p class="feature-modal-subtitle">Get your content in front of thousands of users on the XpLoRe carousel</p>

        <div class="feature-form">
          <label class="feature-label">Title <span class="feature-required">*</span></label>
          <input type="text" id="feature-title" class="feature-input" placeholder="What are you promoting?" maxlength="80">

          <label class="feature-label">Description <span class="feature-required">*</span></label>
          <textarea id="feature-desc" class="feature-input feature-textarea" placeholder="Describe your content in a few sentences..." maxlength="300"></textarea>

          <label class="feature-label">Image <span class="feature-required">*</span></label>
          <div class="feature-upload-area" id="feature-upload-area" onclick="document.getElementById('feature-image-input').click()">
            <input type="file" id="feature-image-input" accept="image/*" style="display:none" onchange="feedInstance.handleFeatureImage(this)">
            <div id="feature-upload-placeholder">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              <span>Click to upload an image</span>
            </div>
            <img id="feature-image-preview" style="display:none" alt="">
          </div>

          <label class="feature-label">Link URL</label>
          <input type="url" id="feature-link" class="feature-input" placeholder="https://example.com/your-content">

          <label class="feature-label">Link button text</label>
          <input type="text" id="feature-link-label" class="feature-input" placeholder="Learn more" maxlength="30">

          <label class="feature-label">Duration <span class="feature-required">*</span></label>
          <div class="feature-duration-options">
            <button type="button" class="feature-duration-btn active" data-days="1" data-price="5000" onclick="feedInstance.selectDuration(this)">
              <span class="feature-duration-period">1 Day</span>
              <span class="feature-duration-price">₦5,000</span>
            </button>
            <button type="button" class="feature-duration-btn" data-days="7" data-price="25000" onclick="feedInstance.selectDuration(this)">
              <span class="feature-duration-period">1 Week</span>
              <span class="feature-duration-price">₦25,000</span>
              <span class="feature-duration-save">Save ₦10k</span>
            </button>
            <button type="button" class="feature-duration-btn" data-days="30" data-price="75000" onclick="feedInstance.selectDuration(this)">
              <span class="feature-duration-period">1 Month</span>
              <span class="feature-duration-price">₦75,000</span>
              <span class="feature-duration-save">Save ₦75k</span>
            </button>
          </div>

          <button class="feature-submit-btn" id="feature-submit-btn" onclick="feedInstance.submitFeature()">
            Pay ₦5,000 to submit for review
          </button>
          <p class="feature-modal-note">Your submission will be reviewed by our team before going live. Payment is deducted from your GP wallet.</p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  closeFeatureModal() {
    const modal = document.getElementById('feature-modal');
    if (modal) modal.remove();
    this._featureImageFile = null;
  },

  handleFeatureImage(input) {
    const file = input.files[0];
    if (!file) return;
    this._featureImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = document.getElementById('feature-image-preview');
      const placeholder = document.getElementById('feature-upload-placeholder');
      if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
      if (placeholder) placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
  },

  selectDuration(btn) {
    document.querySelectorAll('.feature-duration-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const price = parseInt(btn.dataset.price, 10);
    const submitBtn = document.getElementById('feature-submit-btn');
    if (submitBtn) submitBtn.textContent = `Pay ₦${price.toLocaleString()} to submit for review`;
  },

  async submitFeature() {
    const title = document.getElementById('feature-title')?.value.trim();
    const desc = document.getElementById('feature-desc')?.value.trim();
    const link = document.getElementById('feature-link')?.value.trim();
    const linkLabel = document.getElementById('feature-link-label')?.value.trim();
    const activeBtn = document.querySelector('.feature-duration-btn.active');
    const days = activeBtn ? parseInt(activeBtn.dataset.days, 10) : 1;
    const price = activeBtn ? parseInt(activeBtn.dataset.price, 10) : 5000;

    if (!title) { appAlert('Please enter a title'); return; }
    if (!desc) { appAlert('Please enter a description'); return; }
    if (!this._featureImageFile) { appAlert('Please upload an image'); return; }

    const submitBtn = document.getElementById('feature-submit-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Processing...'; }

    try {
      const imageUrl = await uploadFile(this._featureImageFile, 'media');

      const balance = store.user?.wallet_balance || 0;
      if (balance < price) {
        appAlert(`Insufficient balance. You need ₦${price.toLocaleString()} but have ₦${balance.toLocaleString()}. Please top up your wallet.`);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = `Pay ₦${price.toLocaleString()} to submit for review`; }
        return;
      }

      const { error: deductErr } = await supabase.rpc('deduct_wallet', { p_amount: price, p_description: `Featured content: ${title}` });
      if (deductErr) throw new Error('Payment failed: ' + deductErr.message);

      const startsAt = new Date().toISOString();
      const endsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      const { error: insertErr } = await supabase.from('featured_posts').insert({
        user_id: store.user.id,
        title,
        description: desc,
        image_url: imageUrl,
        link_url: link || null,
        link_label: linkLabel || null,
        price_paid: price,
        duration_days: days,
        starts_at: startsAt,
        ends_at: endsAt,
        status: 'pending'
      });
      if (insertErr) throw new Error('Submission failed: ' + insertErr.message);

      store.user.wallet_balance = balance - price;
      this.closeFeatureModal();
      appAlert('Your featured content has been submitted for review. You will be notified once it is approved.');
    } catch (err) {
      appAlert(err.message || 'Something went wrong. Please try again.');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = `Pay ₦${price.toLocaleString()} to submit for review`; }
    }
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
      .select('id, user_id, cover_url')
      .in('id', postIds);

    const postMap = {};
    (posts || []).forEach(p => { postMap[p.id] = p; });

    const userIds = [...new Set((posts || []).map(p => p.user_id).filter(Boolean))];
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id, avatar_url').in('id', userIds)
      : { data: [] };

    const avatarMap = {};
    (profiles || []).forEach(p => { avatarMap[p.id] = p.avatar_url; });

    const counts = {};
    const contributors = {};
    const previews = {};
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
      if (post.cover_url) {
        if (!previews[tag]) previews[tag] = [];
        if (previews[tag].length < 3) previews[tag].push(post.cover_url);
      }
    });

    const tags = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

    if (!tags.length) {
      container.innerHTML = '<p style="text-align:center;width:100%;padding:60px 0;color:var(--text-muted);">No collections yet.</p>';
      return;
    }

    container.innerHTML = `<div class="collections-grid">${tags.map(t => {
      const contribMap = contributors[t] || {};
      const topContribs = Object.entries(contribMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([uid]) => ({ user_id: uid, avatar_url: avatarMap[uid] }));
      const pCount = Object.keys(contribMap).length;
      const previewImgs = previews[t] || [];

      const previewHtml = previewImgs.length
        ? `<div class="collection-tag-previews">${previewImgs.map(url => `<img src="${url}" alt="" class="collection-tag-preview-img">`).join('')}</div>`
        : `<div class="collection-tag-previews collection-tag-previews-empty"></div>`;

      const avatarsHtml = topContribs.length
        ? `<div class="collection-tag-avatars">${topContribs.map(c => c.avatar_url ? `<img src="${c.avatar_url}" alt="" class="collection-tag-avatar">` : `<div class="collection-tag-avatar collection-tag-avatar-fallback"></div>`).join('')}</div>`
        : '';

      return `<div class="collection-tag-card" onclick="window.location.hash='#/collection?name=${encodeURIComponent(t)}'">
        ${previewHtml}
        <div class="collection-tag-info">
          <span class="collection-tag-name">#${escapeHtml(t)}</span>
          <span class="collection-tag-count">${counts[t]} ${counts[t] === 1 ? 'gliim' : 'gliims'}</span>
          ${avatarsHtml}
        </div>
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
