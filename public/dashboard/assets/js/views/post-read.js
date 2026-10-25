import { supabase } from '/shared/js/config.js';
import { store, tierClass } from '../store.js';
import { renderFileInto } from '../reader.js?v=32';
import * as heartbeat from '../heartbeat.js?v=2';
import hubView from './feed-gliims.js?v=85';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let scrollHandler = null;

export default {
  template: `
    <div class="post-read-layout" id="post-read-container">
      <div class="post-read-progress" id="post-read-progress"></div>
      <p style="color: var(--text-muted); text-align: center; padding: 80px 20px;">Loading...</p>
    </div>
  `,

  destroy() {
    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler);
      scrollHandler = null;
    }
    heartbeat.stop();
    heartbeat.setCurrentPost(null);
    sessionStorage.removeItem('openReadViewId');
  },

  async init() {
    let postId = sessionStorage.getItem('openReadViewId');
    if (postId) {
      sessionStorage.removeItem('openReadViewId');
    } else {
      const m = location.hash.match(/[?&]id=([a-zA-Z0-9-]+)/);
      if (m) postId = m[1];
    }

    if (!postId) {
      window.location.hash = '#/xplore';
      return;
    }

    this.postId = postId;

    const post = await this.fetchPost(postId);
    if (!post) {
      document.getElementById('post-read-container').innerHTML =
        '<p style="color: var(--text-muted); text-align: center; padding: 80px 20px;">This post is no longer available.</p>';
      return;
    }

    if (post.status === 'draft' && post.user_id === store.user.id) {
      hubView.openDraftComposer(post);
      window.location.hash = '#/xplore';
      return;
    }

    const { data: contentRow } = await supabase
      .from('feed_gliim_contents').select('blocks')
      .eq('post_id', postId).maybeSingle();
    post.blocks = contentRow?.blocks || null;

    const viewedKey = `gliimu_viewed_${postId}`;
    if (!sessionStorage.getItem(viewedKey)) {
      sessionStorage.setItem(viewedKey, '1');
      supabase.rpc('bump_post_views', { p_post: postId }).then(({ data }) => {
        if (typeof data === 'number') post.views = data;
      });
    }

    const interactions = await this.fetchInteractions(postId);
    const relatedPosts = await this.fetchRelatedPosts(post);
    this.render(post, interactions, relatedPosts);
    this.setupScrollProgress();

    // Billing only runs while a post is actually open in the reader.
    heartbeat.setCurrentPost(postId);
    heartbeat.start();
  },

  async fetchPost(postId) {
    const { data, error } = await supabase.from('feed_gliims')
      .select(`*, profiles:profiles!user_id(full_name, avatar_url, total_gp)`)
      .eq('id', postId).single();
    if (error || !data) return null;
    return data;
  },

  async fetchInteractions(postId) {
    const { data } = await supabase
      .from('feed_interactions')
      .select('id, post_id, user_id, interaction_type, amount, comment_text, created_at, profiles:profiles!user_id(full_name, avatar_url)')
      .eq('post_id', postId);
    return data || [];
  },

  async fetchRelatedPosts(post) {
    if (!post.user_id || !post.category) return [];
    const { data } = await supabase
      .from('feed_gliims')
      .select(`id, title, cover_url, cover_color, category, user_id, profiles:profiles!user_id(full_name, avatar_url, total_gp)`)
      .eq('user_id', post.user_id)
      .eq('category', post.category)
      .eq('status', 'approved')
      .neq('id', post.id);
    if (!data || data.length === 0) return [];
    const shuffled = data.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  },

  render(post, interactions, relatedPosts) {
    const isOwner = post.user_id === store.user.id;
    const avatarClass = tierClass(post.profiles?.total_gp, 'blog-avatar');
    const avatar = post.profiles?.avatar_url
      ? `<img src="${post.profiles.avatar_url}" class="${avatarClass}" style="object-fit:cover;">`
      : `<div class="${avatarClass}"></div>`;

    const likes = interactions.filter(i => i.interaction_type === 'like').length;
    const comments = interactions.filter(i => i.interaction_type === 'comment').length;
    const shares = interactions.filter(i => i.interaction_type === 'share').length;
    const supports = interactions.filter(i => i.interaction_type === 'support').length;
    const hasLiked = interactions.some(i => i.user_id === store.user.id && i.interaction_type === 'like');
    const hasSupported = interactions.some(i => i.user_id === store.user.id && i.interaction_type === 'support');
    const isSaved = (hubView.savedPosts || new Set()).has(post.id);

    const postComments = interactions.filter(i => i.interaction_type === 'comment');
    let commentsHtml = '<p style="font-size: 13px; color: var(--text-muted);">No comments yet.</p>';
    if (postComments.length > 0) {
      commentsHtml = postComments.map(c => {
        const cAvatarClass = tierClass(c.profiles?.total_gp, 'comment-avatar');
        const cAvatar = c.profiles?.avatar_url
          ? `<img src="${c.profiles.avatar_url}" class="${cAvatarClass}" style="object-fit:cover;" onclick="hubInstance.showUserMenu(event, '${c.user_id}', '${post.id}', '${c.profiles?.full_name || 'Gliimait'}')">`
          : `<div class="${cAvatarClass}" onclick="hubInstance.showUserMenu(event, '${c.user_id}', '${post.id}', '${c.profiles?.full_name || 'Gliimait'}')"></div>`;
        const parsedText = hubView.parseTags(c.comment_text);
        const commentTime = new Date(c.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `<div class="comment-item" id="comment-${c.id}">${cAvatar}<div class="comment-content-wrap"><div class="comment-meta"><span class="comment-author">${c.profiles?.full_name || 'Gliimait'}</span><span class="comment-time">${commentTime}</span></div><p class="comment-text">${parsedText}</p></div></div>`;
      }).join('');
    }

    const blocksHtml = this.renderBlocks(post, isOwner);

    const backIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>';
    const minimizeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>';
    const closeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    const saveIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
    const reportIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>';
    const deleteIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

    const deleteBtnHtml = isOwner ? `
      <div class="hub-read-menu-item danger" onclick="hubInstance.promptDelete('${post.id}')">${deleteIcon} Delete Gliim</div>
    ` : '';

    const container = document.getElementById('post-read-container');
    container.innerHTML = `
      <div class="post-read-progress" id="post-read-progress"></div>

      <header class="post-read-header">
        <div class="post-read-header-title">${escapeHtml((post.title || 'Gliim').substring(0, 40))}</div>
        <div class="post-read-header-actions">
          <button class="post-read-action-btn" onclick="hubInstance.minimizeReader('${post.id}')" title="Open in new tab">${minimizeIcon}</button>
          <div class="hub-menu-wrapper">
            <button class="post-read-action-btn" onclick="hubInstance.toggleReadMenu('${post.id}')" title="More options">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
            </button>
            <div class="hub-read-menu" id="read-menu-${post.id}">
              <div class="hub-read-menu-item" onclick="hubInstance.toggleSavePost('${post.id}')">${saveIcon} ${isSaved ? 'Unsave Gliim' : 'Save Gliim'}</div>
              <div class="hub-read-menu-item" onclick="hubInstance.promptReport('post', '${post.id}')">${reportIcon} Report Gliim</div>
              ${deleteBtnHtml}
            </div>
          </div>
          <button class="post-read-action-btn" onclick="hubInstance.closeReader()" title="Close">${closeIcon}</button>
        </div>
      </header>

      <main class="post-read-main">
        <div class="read-body">
          <span class="blog-category">${post.category || 'General'}</span>
          <h1 class="read-title">${escapeHtml(post.title || 'Untitled Gliim')}</h1>

          <div class="blog-author hub-author-hit" style="margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid var(--border); flex-direction: row; align-items: center;" onclick="hubInstance.viewAuthor('${post.user_id}')">
            <div style="position: relative; flex-shrink: 0; margin-right: 12px;">${avatar}</div>
            <div style="display: flex; flex-direction: column;">
              <span style="font-weight: 700; color: var(--text-primary);">${escapeHtml(post.profiles?.full_name || 'Gliimait')}</span>
              <span style="font-size: 12px; color: var(--text-muted);">${new Date(post.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          ${blocksHtml}

          ${relatedPosts.length > 0 ? `
          <div class="related-posts-section">
            <h3 class="related-posts-title">You may also like</h3>
            <div class="related-posts-row">
              ${relatedPosts.map(rp => `<div class="related-post-card-wrapper">${hubView.renderPostCard(rp)}</div>`).join('')}
            </div>
          </div>
          ` : ''}

          <div class="comment-section" id="comment-section-${post.id}">
            <h3>Comments</h3>
            <div class="comment-input-wrapper">
              <input type="text" id="comment-text-${post.id}" class="input" placeholder="Write a comment... Use @ to tag.">
              <button class="comment-send-btn" onclick="hubInstance.submitComment('${post.id}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
            <div class="comment-list" id="comment-list-${post.id}">
              ${commentsHtml}
            </div>
          </div>
        </div>
      </main>

      <div class="post-read-bottom">
        <button class="action-btn like-btn ${hasLiked ? 'liked' : ''}" onclick="hubInstance.toggleLike('${post.id}')">
          <img src="/icons/clap.svg" class="action-icon-img" alt="Punch-it" loading="eager" decoding="async">
          <span>${likes}</span>
        </button>
        <button class="action-btn" onclick="hubInstance.scrollToComments('${post.id}')">
          <img src="/icons/comment.svg" class="action-icon-img" alt="Comment" loading="eager" decoding="async">
          <span>${comments}</span>
        </button>
        <button class="action-btn" onclick="hubInstance.sharePost('${post.id}', '${escapeHtml(post.title)}')" title="Earn 2 GP">
          <img src="/icons/share.svg" class="action-icon-img" alt="Share" loading="eager" decoding="async">
          <span>${shares}</span>
        </button>
        ${(post.profiles?.total_gp || 0) >= 500 ? `
        <button class="action-btn support-btn ${hasSupported ? 'supported' : ''}" ${hasSupported ? 'disabled' : ''} onclick="hubInstance.supportCreator('${post.id}', '${post.user_id}')">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          <span>${supports}</span>
        </button>` : ''}
      </div>
    `;

    hubView.setupMediaBlocks(container);
    hubView.hydratePolls(container);
    container.querySelectorAll('.rdr-inline-file[data-file-src]').forEach(el => {
      const src = el.getAttribute('data-file-src');
      if (src) renderFileInto(src, el);
    });
    hubView.setupMentionPicker(post.id);
  },

  renderBlocks(post, isOwner) {
    if (post.blocks && post.blocks.length > 0) {
      return post.blocks.map(b => {
        if (b.type === 'text') {
          if (b.style === 'title') return `<h2 class="read-block-title">${escapeHtml(b.content)}</h2>`;
          if (b.style === 'subtitle') return `<h3 class="read-block-subtitle">${escapeHtml(b.content)}</h3>`;
          if (b.style === 'list') {
            const items = b.content.split('\n').map(line => `<div class="read-block-list-item">${escapeHtml(line)}</div>`).join('');
            return `<div class="read-block-list">${items}</div>`;
          }
          return `<p class="read-block-text">${escapeHtml(b.content)}</p>`;
        }
        if (b.type === 'image') {
          const cap = b.caption ? `<figcaption class="read-block-caption">${escapeHtml(b.caption)}</figcaption>` : '';
          return `<figure class="read-block-figure"><img src="${escapeHtml(b.content)}" class="read-block-media" data-lightbox data-caption="${escapeHtml(b.caption || '')}">${cap}</figure>`;
        }
        if (b.type === 'video') {
          return `<figure class="read-video-player"><video src="${escapeHtml(b.content)}" class="read-block-media" preload="metadata" playsinline></video><button type="button" class="rvp-big" aria-label="Play"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg></button><div class="rvp-bar"><button type="button" class="rvp-play" aria-label="Play or pause"></button><input type="range" class="rvp-seek" min="0" max="1000" value="0" aria-label="Seek"><span class="rvp-time">0:00 / 0:00</span><button type="button" class="rvp-mute" aria-label="Mute"></button><button type="button" class="rvp-full" aria-label="Fullscreen"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg></button></div></figure>`;
        }
        if (b.type === 'audio') {
          const cap = b.caption ? `<p class="read-audio-title">${escapeHtml(b.caption)}</p>` : '';
          return `<div class="read-block-audio-wrapper"><div class="read-audio-head"><div class="lib-eq read-eq"><span></span><span></span><span></span><span></span><span></span></div>${cap}</div><audio src="${escapeHtml(b.content)}" class="read-block-audio" controls preload="metadata" crossorigin="anonymous"></audio></div>`;
        }
        if (b.type === 'document') {
          const cap = b.caption ? `<h3 class="read-block-subtitle">${escapeHtml(b.caption)}</h3>` : '';
          return `${cap}<div class="rdr-inline-file" data-file-src="${escapeHtml(b.content)}"></div>`;
        }
        if (b.type === 'pdf') {
          let items = [];
          try {
            const parsed = JSON.parse(b.content);
            if (Array.isArray(parsed && parsed.items)) items = parsed.items;
          } catch { items = [{ pdf_url: b.content, cover_url: '', price: Number(b.price || 0) }]; }
          const pdfTileIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
          const tiles = items.filter(it => it && it.pdf_url).map((it, idx) => {
            const price = Number(it.price || 0);
            const cover = it.cover_url
              ? `<img class="pdf-tile-cover" src="${escapeHtml(it.cover_url)}" alt="" loading="lazy">`
              : `<div class="pdf-tile-cover pdf-tile-blank">${pdfTileIcon}</div>`;
            return `<div class="pdf-tile" data-pdf="${escapeHtml(it.pdf_url)}" data-price="${price}" data-post="${post.id}" data-idx="${idx}" data-creator="${post.user_id || ''}" onclick="hubInstance.openPdfTile(this)">${cover}<span class="pdf-tile-price">${price > 0 ? '₦' + price.toLocaleString() : 'Free'}</span></div>`;
          }).join('');
          if (!tiles) return '';
          return `<div class="pdf-block-row">${tiles}</div>`;
        }
        if (b.type === 'poll') {
          let question = b.question || '';
          let options = Array.isArray(b.options) ? b.options : null;
          if (!options && b.content) {
            try {
              const parsed = JSON.parse(b.content);
              if (parsed && Array.isArray(parsed.options)) {
                options = parsed.options;
                if (!question) question = parsed.question || '';
              }
            } catch { options = null; }
          }
          if (!options || options.length < 2) return '';
          const rows = options.map((opt, idx) => `
            <button type="button" class="poll-option-row" data-idx="${idx}" onclick="hubInstance.pollVote('${post.id}', ${idx})">
              <span class="poll-option-fill" style="width:0%"></span>
              <span class="poll-option-label">${escapeHtml(String(opt))}</span>
              <span class="poll-option-meta"></span>
            </button>`).join('');
          return `<div class="poll-block" data-poll-post="${post.id}"><h3 class="read-block-subtitle">${escapeHtml(question)}</h3><div class="poll-options-list">${rows}</div><div class="poll-total" data-poll-total></div></div>`;
        }
        return '';
      }).join('');
    } else if (post.is_premium && !isOwner) {
      const lockPrice = Number((hubView.billingSummary && hubView.billingSummary.prices && hubView.billingSummary.prices.premium_unlock) || 0);
      return `
        <div style="text-align:center;padding:48px 24px;border:1px dashed var(--border);border-radius:12px;color:var(--text-muted);">
          <p style="font-weight:700;color:var(--text-primary);margin-bottom:8px;">This gliim is locked</p>
          <p style="margin-bottom:16px;">${lockPrice ? `Unlock it for ₦${lockPrice.toLocaleString()}.` : 'Unlock it to read the full gliim.'}</p>
          <button class="btn-primary" onclick="hubInstance.unlockPremiumPost('${post.id}')">Unlock</button>
        </div>`;
    } else {
      return `<p class="read-block-text">${escapeHtml(post.content || '')}</p>`;
    }
  },

  setupScrollProgress() {
    const bar = document.getElementById('post-read-progress');
    if (!bar) return;

    const scrollKey = `gliimu_scroll_${this.postId}`;
    const savedScroll = sessionStorage.getItem(scrollKey);

    scrollHandler = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
      bar.style.width = pct + '%';

      sessionStorage.setItem(scrollKey, String(scrollTop));
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });

    if (savedScroll) {
      setTimeout(() => {
        window.scrollTo(0, parseInt(savedScroll, 10));
      }, 100);
    }
  },

  minimizeReader(postId) {
    const url = `${location.origin}/dashboard/#/post?id=${postId}`;
    window.open(url, '_blank');
  },

  closeReader() {
    history.back();
  }
};
