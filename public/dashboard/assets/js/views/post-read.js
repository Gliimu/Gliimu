import { supabase } from '/shared/js/config.js';
import { store, tierClass, tierIcon } from '../store.js?v=2';
import { renderFileInto } from '../reader.js?v=35';
import * as heartbeat from '../heartbeat.js?v=3';
import hubView, { gliimKindOf, gliimCoverOf, isMediaBlock, mediaIsVideo, hasAudioPlayer, isPdfBlock, pdfItemsOf, pdfTilesHtml } from './feed-gliims.js?v=112';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let scrollHandler = null;
let resizeHandler = null;
let keydownHandler = null;
let clickOutsideHandler = null;

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
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
    if (clickOutsideHandler) {
      document.removeEventListener('click', clickOutsideHandler);
      clickOutsideHandler = null;
    }
    heartbeat.stop();
    heartbeat.setCurrentPost(null);
    sessionStorage.removeItem('openReadViewId');
    const modal = document.getElementById('comments-modal');
    if (modal) {
      modal.remove();
    }
    document.body.style.overflow = '';
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
    window.readInstance = this;

    // Block Ctrl+S (save) and Ctrl+P (print) on the reader page
    keydownHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', keydownHandler);

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

    const { data: balanceData } = await supabase.rpc('gliits_get_balance');
    if (balanceData) {
      const balance = Number(balanceData.balance || 0);
      const plan = balanceData.plan;
      const planActive = plan && plan.plan_type && (!plan.expires_at || new Date(plan.expires_at) > new Date());
      if (balance < 3 && !planActive) {
        window.location.hash = '#/xplore';
        setTimeout(() => {
          if (typeof appAlert === 'function') {
            appAlert('Your balance is below G3. Top up or activate a plan to continue reading.');
          }
        }, 100);
        return;
      }
    }

    const viewedKey = `gliimu_viewed_${postId}`;
    if (!sessionStorage.getItem(viewedKey)) {
      sessionStorage.setItem(viewedKey, '1');
      supabase.rpc('bump_post_views', { p_post: postId }).then(({ data, error }) => {
        if (typeof data === 'number') post.views = data;
        if (!error) window.dispatchEvent(new CustomEvent('gliimu-post-viewed', { detail: { postId } }));
      });
    }

    const interactions = await this.fetchInteractions(postId);
    const relatedPosts = await this.fetchRelatedPosts(post);
    await this.populateCardKinds(relatedPosts);
    await this.checkFollowStatus(post.user_id);

    this.render(post, interactions, relatedPosts);
    this.setupScrollProgress();

    // Billing only runs while a post is actually open in the reader.
    heartbeat.setCurrentPost(postId);
    heartbeat.start();
  },

  async fetchPost(postId) {
    const { data, error } = await supabase.from('feed_gliims')
      .select(`*, profiles:profiles!user_id(full_name, avatar_url, total_gp, verification_badge)`)
      .eq('id', postId).single();
    if (error || !data) return null;
    return data;
  },

  async fetchInteractions(postId) {
    const { data } = await supabase
      .from('feed_interactions')
      .select('id, post_id, user_id, interaction_type, amount, comment_text, created_at, metadata, profiles:profiles!user_id(full_name, avatar_url, total_gp)')
      .eq('post_id', postId);
    return data || [];
  },

  async checkFollowStatus(authorId) {
    if (!store.user || authorId === store.user.id) {
      this._isFollowing = false;
      this._authorId = null;
      return;
    }
    this._authorId = authorId;
    const { data } = await supabase.from('followed_users').select('*').eq('follower_id', store.user.id).eq('followed_id', authorId).maybeSingle();
    this._isFollowing = !!data;
  },

  async toggleFollow() {
    if (!this._authorId) return;
    const btn = document.getElementById('reader-follow-btn');
    try {
      if (this._isFollowing) {
        const { error } = await supabase.from('followed_users').delete().eq('follower_id', store.user.id).eq('followed_id', this._authorId);
        if (error) throw error;
        this._isFollowing = false;
        if (btn) { btn.classList.remove('following'); btn.innerHTML = '+'; btn.title = 'Follow'; }
      } else {
        const { error } = await supabase.from('followed_users').insert({ follower_id: store.user.id, followed_id: this._authorId });
        if (error) throw error;
        this._isFollowing = true;
        if (btn) { btn.classList.add('following'); btn.innerHTML = '✓'; btn.title = 'Following'; }
      }
    } catch (err) {
      console.error('Follow error:', err);
    }
  },

  async fetchRelatedPosts(post) {
    const seen = new Set();
    const result = [];

    const addPosts = (posts) => {
      for (const p of (posts || [])) {
        if (!seen.has(p.id) && p.id !== post.id) {
          seen.add(p.id);
          result.push(p);
        }
      }
    };

    // renderPostCard() reads these directly — omit one and the card degrades
    // silently ("Invalid Date", missing premium lock, zero views).
    const fields = `id, title, description, created_at, views, is_premium, cover_url, cover_color, category, user_id, profiles:profiles!user_id(full_name, avatar_url, total_gp, verification_badge)`;

    const [sameAuthor, sameCategory, interestResult] = await Promise.all([
      supabase.from('feed_gliims').select(fields)
        .eq('user_id', post.user_id)
        .eq('status', 'approved')
        .neq('id', post.id)
        .order('created_at', { ascending: false }),
      supabase.from('feed_gliims').select(fields)
        .eq('category', post.category)
        .eq('status', 'approved')
        .neq('id', post.id)
        .order('created_at', { ascending: false }),
      this.fetchInterestPosts(post, fields)
    ]);

    addPosts(sameAuthor.data);
    addPosts(sameCategory.data);
    if (interestResult) addPosts(interestResult);

    return result;
  },

  async fetchInterestPosts(post, fields) {
    const interest = hubView.loadInterest ? hubView.loadInterest() : null;
    if (!interest || !interest.terms || interest.terms.length === 0) return null;

    const topCats = Object.entries(interest.cats || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    if (topCats.length === 0) return null;

    const { data } = await supabase.from('feed_gliims').select(fields)
      .in('category', topCats)
      .eq('status', 'approved')
      .neq('id', post.id)
      .order('created_at', { ascending: false })
      .limit(20);

    return data;
  },

  async populateCardKinds(posts) {
    if (!posts || posts.length === 0) return;
    hubView.cardKinds = hubView.cardKinds || {};
    hubView.cardCovers = hubView.cardCovers || {};
    try {
      const ids = posts.map(p => p.id);
      const { data: kindRows } = await supabase.from('feed_gliim_contents').select('post_id, blocks').in('post_id', ids);
      for (const row of kindRows || []) {
        hubView.cardKinds[row.post_id] = gliimKindOf(row.blocks);
        hubView.cardCovers[row.post_id] = gliimCoverOf(row.blocks);
      }
    } catch { /* cards keep the default style */ }
  },

  render(post, interactions, relatedPosts) {
    const isOwner = post.user_id === store.user.id;
    const avatarClass = tierClass(post.profiles?.total_gp, 'blog-avatar');
    const avatar = post.profiles?.avatar_url
      ? `<img src="${post.profiles.avatar_url}" class="${avatarClass}" style="object-fit:cover;">`
      : `<div class="${avatarClass}"></div>`;
    const followBtnHtml = !isOwner ? `<button class="reader-follow-avatar-btn ${this._isFollowing ? 'following' : ''}" id="reader-follow-btn" onclick="event.stopPropagation(); readInstance.toggleFollow()" title="${this._isFollowing ? 'Following' : 'Follow'}">${this._isFollowing ? '✓' : '+'}</button>` : '';

    const likes = interactions.filter(i => i.interaction_type === 'like').length;
    const comments = interactions.filter(i => i.interaction_type === 'comment').length;
    const shares = interactions.filter(i => i.interaction_type === 'share').length;
    const supports = interactions.filter(i => i.interaction_type === 'support').length;
    const hasLiked = interactions.some(i => i.user_id === store.user.id && i.interaction_type === 'like');
    const isSaved = (hubView.savedPosts || new Set()).has(post.id);

    const postComments = interactions.filter(i => i.interaction_type === 'comment');
    const isAudioLog = gliimKindOf(post.blocks) === 'log' && hasAudioPlayer(post.blocks);
    if (isAudioLog) {
      postComments.sort((a, b) => {
        const ta = a.metadata?.audio_timestamp ?? Infinity;
        const tb = b.metadata?.audio_timestamp ?? Infinity;
        return ta - tb;
      });
    }
    let commentsHtml = '<p style="font-size: 13px; color: var(--text-muted);">No comments yet.</p>';
    if (postComments.length > 0) {
      commentsHtml = postComments.map(c => {
        const cAvatarClass = tierClass(c.profiles?.total_gp, 'comment-avatar');
        const cAvatar = c.profiles?.avatar_url
          ? `<img src="${c.profiles.avatar_url}" class="${cAvatarClass}" style="object-fit:cover;" onclick="hubInstance.showUserMenu(event, '${c.user_id}', '${post.id}', '${c.profiles?.full_name || 'Gliimait'}')">`
          : `<div class="${cAvatarClass}" onclick="hubInstance.showUserMenu(event, '${c.user_id}', '${post.id}', '${c.profiles?.full_name || 'Gliimait'}')"></div>`;
        const parsedText = hubView.parseTags(c.comment_text);
        const commentTime = new Date(c.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const ts = c.metadata?.audio_timestamp;
        const tsBadge = (isAudioLog && ts != null) ? `<button class="audio-ts-badge" onclick="event.stopPropagation(); seekToAudioTime('${post.id}', ${ts})" title="Jump to ${formatAudioTimestamp(ts)}">${formatAudioTimestamp(ts)}</button>` : '';
        return `<div class="comment-item" id="comment-${c.id}">${cAvatar}<div class="comment-content-wrap"><div class="comment-meta"><span class="comment-author">${c.profiles?.full_name || 'Gliimait'}</span>${tsBadge}<span class="comment-time">${commentTime}</span></div><p class="comment-text">${parsedText}</p></div></div>`;
      }).join('');
    }

    const blocksHtml = this.renderBlocks(post, isOwner);
    this.currentPost = post;
    this.isOwnerView = isOwner;

    const backIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>';
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
        <div class="post-read-header-inner">
          <div class="post-read-header-title">${escapeHtml((post.title || 'Gliim').substring(0, 40))}</div>
          <div class="post-read-header-actions">
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
        </div>
      </header>

      <main class="post-read-main" id="post-read-section-1">
        <div class="read-body">
          <span class="blog-category">${post.category || 'General'}</span>
          <h1 class="read-title">${escapeHtml(post.title || 'Untitled Gliim')}</h1>

          <div class="blog-author hub-author-hit" style="margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid var(--border); flex-direction: row; align-items: center; width: fit-content; cursor: pointer;" onclick="hubInstance.viewAuthor('${post.user_id}')">
            <div style="position: relative; flex-shrink: 0; margin-right: 12px;">${avatar}${followBtnHtml}</div>
            <div style="display: flex; flex-direction: column;">
              <span style="font-weight: 700; color: var(--text-primary);">${escapeHtml(post.profiles?.full_name || 'Gliimait')}${tierIcon(post.profiles?.verification_badge)}</span>
              <span style="font-size: 12px; color: var(--text-muted);">${new Date(post.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          <div class="read-blocks" id="read-blocks">${blocksHtml}</div>
        </div>
        <div class="post-read-bottom">
          <div class="post-read-bottom-inner">
            <button class="action-btn like-btn ${hasLiked ? 'liked' : ''}" onclick="hubInstance.toggleLike('${post.id}')">
              <img src="/icons/clap.svg" class="action-icon-img" alt="Punch-it" loading="eager" decoding="async">
              <span>${likes}</span>
            </button>
            <button class="action-btn" onclick="hubInstance.openCommentsModal('${post.id}')">
              <img src="/icons/comment.svg" class="action-icon-img" alt="Comment" loading="eager" decoding="async">
              <span id="read-comment-count">${comments}</span>
            </button>
            <button class="action-btn" onclick="hubInstance.sharePost('${post.id}', '${escapeHtml(post.title)}')" title="Earn 5 GP">
              <img src="/icons/share.svg" class="action-icon-img" alt="Share" loading="eager" decoding="async">
              <span>${shares}</span>
            </button>
            <button class="action-btn support-btn" onclick="hubInstance.supportCreator('${post.id}', '${post.user_id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              <span>${supports}</span>
            </button>
          </div>
        </div>
      </main>

      ${relatedPosts.length > 0 ? `
      <section class="post-read-related" id="post-read-section-2">
        <div class="related-posts-inner">
          <h3 class="related-posts-title">More inspiring contents</h3>
          <div class="related-posts-grid library-feed feed-grid" id="related-posts-grid">
            ${relatedPosts.map(rp => `<div class="feed-item feed-item--gliim">${hubView.renderPostCard(rp)}</div>`).join('')}
          </div>
        </div>
      </section>
      ` : ''}
    `;

    hubView.setupMediaBlocks(container);
    hubView.hydratePolls(container);
    container.querySelectorAll('.rdr-inline-file[data-file-src]').forEach(el => {
      const src = el.getAttribute('data-file-src');
      if (src) renderFileInto(src, el);
    });
    hubView.setupMentionPicker(post.id);
    hubView.setupAudioliteTimestampHint(post.id);

    this.layoutRelatedMasonry();
    this.renderCommentsModal(post, commentsHtml);
  },

  layoutRelatedMasonry() {
    const grid = document.getElementById('related-posts-grid');
    if (!grid) return;

    const ROW = 8;
    const GAP = window.matchMedia('(max-width: 768px)').matches ? 12 : 24;

    grid.querySelectorAll('.feed-item').forEach(item => {
      const inner = item.firstElementChild;
      if (!inner) return;
      item.style.gridRowEnd = 'auto';
      const height = inner.getBoundingClientRect().height;
      item.style.gridRowEnd = `span ${Math.max(1, Math.ceil((height + GAP) / ROW))}`;
    });
  },

  renderCommentsModal(post, commentsHtml) {
    let modal = document.getElementById('comments-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'comments-modal';
      modal.className = 'comments-modal-overlay';
      document.body.appendChild(modal);
    }

    const commentSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';

    const bodyHtml = `
      <div class="comment-input-wrapper">
        <input type="text" id="comment-text-${post.id}" class="input" placeholder="Write a comment... Use @ to tag.">
        <button class="comment-send-btn" onclick="hubInstance.submitComment('${post.id}')">
          ${commentSvg}
        </button>
      </div>
      <div class="comment-list" id="comment-list-${post.id}">
        ${commentsHtml}
      </div>`;

    modal.innerHTML = `
      <div class="comments-modal-content" onclick="event.stopPropagation()">
        <div class="comments-modal-header">
          <h3>Comments</h3>
          <button class="comments-modal-close" onclick="hubInstance.closeCommentsModal()">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="comments-modal-body">
          ${bodyHtml}
        </div>
      </div>
    `;

    modal.onclick = () => hubInstance.closeCommentsModal();

    hubView.setupMentionPicker(post.id);
    hubView.setupAudioliteTimestampHint(post.id);
  },

  openCommentsModal(postId) {
    const modal = document.getElementById('comments-modal');
    if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  },

  closeCommentsModal() {
    const modal = document.getElementById('comments-modal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
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
        if (isMediaBlock(b)) {
          if (mediaIsVideo(b)) {
            return `<figure class="read-video-player"><video src="${escapeHtml(b.content)}" class="read-block-media" preload="metadata" playsinline></video><button type="button" class="rvp-big" aria-label="Play"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg></button><div class="rvp-bar"><button type="button" class="rvp-play" aria-label="Play or pause"></button><input type="range" class="rvp-seek" min="0" max="1000" value="0" aria-label="Seek"><span class="rvp-time">0:00 / 0:00</span><button type="button" class="rvp-mute" aria-label="Mute"></button><button type="button" class="rvp-full" aria-label="Fullscreen"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg></button></div></figure>`;
          }
          const cap = b.caption ? `<p class="read-audio-title">${escapeHtml(b.caption)}</p>` : '';
          return `<div class="read-block-audio-wrapper"><div class="read-audio-head"><div class="lib-eq read-eq"><span></span><span></span><span></span><span></span><span></span></div>${cap}</div><audio src="${escapeHtml(b.content)}" class="read-block-audio" controls preload="metadata" crossorigin="anonymous"></audio></div>`;
        }
        if (isPdfBlock(b)) return pdfTilesHtml(post, pdfItemsOf(b));
        if (b.type === 'document') {
          // Reflowable book file (docx/epub) — hydrated in-page below via
          // renderFileInto, never a new browser tab.
          const cap = b.caption ? `<h3 class="read-block-subtitle">${escapeHtml(b.caption)}</h3>` : '';
          return `${cap}<div class="rdr-inline-file" data-file-src="${escapeHtml(b.content)}"></div>`;
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

  // The rail is fixed to the viewport but must sit beside the reading column,
  // whose right edge moves with the sidebar, the container padding and the
  // 800px cap. Measuring beats viewport arithmetic: it cannot drift out of sync.
  positionRail() {
    const rail = document.querySelector('.post-read-bottom');
    const main = document.getElementById('post-read-section-1');
    if (!rail || !main) return;
    const rect = main.getBoundingClientRect();
    if (rect.width < 100) return;
    // clientWidth, not innerWidth: `right` resolves against the layout viewport,
    // which excludes the scrollbar that innerWidth counts.
    const inset = window.matchMedia('(max-width: 768px)').matches ? 12 : 16;
    rail.style.right = `${Math.max(8, Math.round(document.documentElement.clientWidth - rect.right) + inset)}px`;
  },

  setupScrollProgress() {
    const bar = document.getElementById('post-read-progress');
    const section1 = document.getElementById('post-read-section-1');
    const section2 = document.getElementById('post-read-section-2');
    const rail = document.querySelector('.post-read-bottom');
    if (!bar || !section1) return;

    const scrollKey = `gliimu_scroll_${this.postId}`;
    const savedScroll = sessionStorage.getItem(scrollKey);

    scrollHandler = () => {
      const scrollTop = window.scrollY;
      const section1Rect = section1.getBoundingClientRect();
      const section1Top = section1Rect.top + window.scrollY;
      const section1Height = section1.offsetHeight;
      const viewportHeight = window.innerHeight;
      
      // Calculate progress through section 1 only
      const scrollableDistance = section1Height + section1Top - viewportHeight;
      const scrolledDistance = scrollTop - section1Top;
      let pct = scrollableDistance > 0 ? Math.min(100, Math.max(0, (scrolledDistance / scrollableDistance) * 100)) : 0;
      
      // If section 2 exists and user has scrolled past section 1, cap at 100%
      if (section2) {
        const section2Rect = section2.getBoundingClientRect();
        if (section2Rect.top <= 0) {
          pct = 100;
        }
      }
      // The rail belongs to the article, so it fades once the article has
      // mostly left the screen rather than the moment the grid peeks in —
      // a short gliim shows the grid while the reader is still on it.
      rail?.classList.toggle('is-hidden', section1Rect.bottom < viewportHeight * 0.35);

      bar.style.width = pct + '%';

      sessionStorage.setItem(scrollKey, String(scrollTop));
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });

    this.positionRail();
    resizeHandler = () => this.positionRail();
    window.addEventListener('resize', resizeHandler);

    if (savedScroll) {
      setTimeout(() => {
        window.scrollTo(0, parseInt(savedScroll, 10));
      }, 100);
    }
  },

  closeReader() {
    window.gliimBack();
  }
};
