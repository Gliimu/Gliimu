import { supabase } from '/shared/js/config.js';
import { store, tierClass } from '../store.js';
import hubView from './feed-gliims.js?v=75';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function gliimKindOf(blocks) {
  if (!blocks || !blocks.length) return 'bundle';
  const has = t => blocks.some(b => b.type === t);
  if (has('video')) return 'audiolite';
  if (has('audio')) return 'audiolite';
  if (has('document')) return 'book';
  if (has('image') && blocks.length === 1) return 'image-only';
  return 'bundle';
}

export default {
  title: 'Collection',
  template: `
    <div class="collection-layout" id="collection-container">
      <p style="color: var(--text-muted); text-align: center; padding: 80px 20px;">Loading...</p>
    </div>
  `,

  async init() {
    const m = location.hash.match(/[?&]name=([^&]+)/);
    if (!m) {
      window.location.hash = '#/xplore';
      return;
    }
    this.hashtag = decodeURIComponent(m[1]).replace(/[^a-z0-9_]/g, '').toLowerCase();
    if (!this.hashtag) {
      window.location.hash = '#/xplore';
      return;
    }

    await this.loadData();
    this.render();
  },

  async loadData() {
    // Use the post_hashtags index table for fast lookups
    const { data: hashtagRows } = await supabase
      .from('post_hashtags')
      .select('post_id')
      .eq('hashtag', this.hashtag);

    const postIds = (hashtagRows || []).map(r => r.post_id);

    if (postIds.length === 0) {
      this.posts = [];
      this.interactions = [];
      this.cardKinds = {};
      return;
    }

    const { data: posts } = await supabase
      .from('feed_gliims')
      .select(`
        id, title, category, description, cover_url, cover_color, views, created_at, user_id, is_premium, status,
        profiles:profiles!user_id(full_name, avatar_url, total_gp)
      `)
      .in('id', postIds)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    this.posts = posts || [];

    if (postIds.length) {
      const { data: interactions } = await supabase
        .from('feed_interactions')
        .select('post_id, interaction_type, user_id')
        .in('post_id', postIds);
      this.interactions = interactions || [];

      const { data: kindRows } = await supabase
        .from('feed_gliim_contents')
        .select('post_id, blocks')
        .in('post_id', postIds);
      this.cardKinds = {};
      for (const row of kindRows || []) this.cardKinds[row.post_id] = gliimKindOf(row.blocks);
    } else {
      this.interactions = [];
      this.cardKinds = {};
    }

    hubView.allInteractions = this.interactions;
    hubView.cardKinds = this.cardKinds;

    const contributors = {};
    for (const p of this.posts) {
      if (!contributors[p.user_id]) {
        contributors[p.user_id] = {
          user_id: p.user_id,
          full_name: p.profiles?.full_name || 'Gliimait',
          avatar_url: p.profiles?.avatar_url || null,
          total_gp: p.profiles?.total_gp || 0,
          post_count: 0,
          total_views: 0
        };
      }
      contributors[p.user_id].post_count++;
      contributors[p.user_id].total_views += (p.views || 0);
    }
    this.leaderboard = Object.values(contributors).sort((a, b) => b.total_views - a.total_views);
  },

  render() {
    const container = document.getElementById('collection-container');
    if (!container) return;

    const postCount = this.posts.length;
    const contributorCount = this.leaderboard.length;

    container.innerHTML = `
      <div class="collection-hero">
        <div class="collection-hero-inner">
          <h1 class="collection-hero-title">#${escapeHtml(this.hashtag)}</h1>
          <div class="collection-hero-stats">
            <span>${postCount} post${postCount !== 1 ? 's' : ''}</span>
            <span class="collection-hero-dot"></span>
            <span>${contributorCount} contributor${contributorCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      <div class="collection-tabs">
        <button class="collection-tab active" data-tab="posts">Posts</button>
        <button class="collection-tab" data-tab="leaderboard">Leaderboard</button>
      </div>

      <div class="collection-content">
        <div id="collection-tab-posts" class="collection-tab-content">
          ${postCount === 0 ? '<p style="text-align: center; color: var(--text-muted); padding: 60px 20px;">No posts in this collection yet.</p>' : ''}
          <div class="collection-grid" id="collection-grid">
            ${this.posts.map(p => hubView.renderPostCard(p)).join('')}
          </div>
        </div>
        <div id="collection-tab-leaderboard" class="collection-tab-content" style="display: none;">
          ${this.leaderboard.length === 0 ? '<p style="text-align: center; color: var(--text-muted); padding: 60px 20px;">No contributors yet.</p>' : ''}
          ${this.leaderboard.map((entry, i) => `
            <div class="leaderboard-row" onclick="hubInstance.viewAuthor('${entry.user_id}')" style="cursor: pointer;">
              <div class="leaderboard-rank">${i + 1}</div>
              <div class="leaderboard-avatar">
                ${entry.avatar_url ? `<img src="${entry.avatar_url}" class="${tierClass(entry.total_gp, 'blog-avatar')}" style="object-fit: cover;">` : `<div class="${tierClass(entry.total_gp, 'blog-avatar')}"></div>`}
              </div>
              <div class="leaderboard-info">
                <div class="leaderboard-name">${escapeHtml(entry.full_name)}</div>
                <div class="leaderboard-meta">${entry.post_count} post${entry.post_count !== 1 ? 's' : ''}</div>
              </div>
              <div class="leaderboard-views">${entry.total_views.toLocaleString()} views</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    container.querySelectorAll('.collection-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.collection-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        container.querySelectorAll('.collection-tab-content').forEach(c => c.style.display = 'none');
        container.querySelector(`#collection-tab-${tab.dataset.tab}`).style.display = 'block';
      });
    });

    this.layoutMasonry();
    if (!this._resizeHandler) {
      this._resizeHandler = () => {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => this.layoutMasonry(), 150);
      };
      window.addEventListener('resize', this._resizeHandler);
    }
  },

  layoutMasonry() {
    const grid = document.getElementById('collection-grid');
    if (!grid) return;

    const ROW = 8;
    const GAP = window.matchMedia('(max-width: 768px)').matches ? 12 : 24;

    grid.querySelectorAll('.blog-card, .audiolite-card, .book-cover-card').forEach(card => {
      card.style.gridRowEnd = 'auto';
      const height = card.getBoundingClientRect().height;
      card.style.gridRowEnd = `span ${Math.max(1, Math.ceil((height + GAP) / ROW))}`;
    });
  },

  destroy() {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
  }
};
