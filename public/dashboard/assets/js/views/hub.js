import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Hub',
  template: `
    <div class="hub-layout">
      <!-- Post Creation Box -->
      <div class="card post-creator">
        <h3>Share an update</h3>
        <textarea id="post-content" class="input" placeholder="What's happening in your Gliimait journey?" rows="3"></textarea>
        <div class="post-actions">
          <span id="post-error" class="text-error" style="font-size: var(--fs-xs);"></span>
          <button id="submit-post-btn" class="btn-primary">Post Update</button>
        </div>
      </div>

      <!-- Live Feed -->
      <div class="card live-feed">
        <div class="feed-header">
          <h3>Live Hub Feed</h3>
          <div class="pulse-dot"></div>
        </div>
        <div id="posts-container">
          <p style="color: var(--text-muted); text-align: center;">Loading posts...</p>
        </div>
      </div>
    </div>
  `,
  init() {
    this.fetchPosts();
    this.setupRealtime();

    // Handle New Post Submission
    document.getElementById('submit-post-btn').addEventListener('click', async () => {
      const content = document.getElementById('post-content').value.trim();
      const errorEl = document.getElementById('post-error');

      if (!content) {
        errorEl.innerText = "Post cannot be empty.";
        return;
      }

      errorEl.innerText = "";
      const btn = document.getElementById('submit-post-btn');
      btn.innerText = "Posting...";
      btn.disabled = true;

      const { error } = await supabase.from('posts').insert({
        content: content,
        user_id: store.user.id
      });

      if (error) {
        errorEl.innerText = "Failed to post. Try again.";
      } else {
        document.getElementById('post-content').value = "";
      }

      btn.innerText = "Post Update";
      btn.disabled = false;
    });
  },

  async fetchPosts() {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        content,
        created_at,
        profiles:profiles(username)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error(error);
      return;
    }

    this.renderPosts(data);
  },

  renderPosts(posts) {
    const container = document.getElementById('posts-container');
    if (posts.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">No posts yet. Be the first!</p>';
      return;
    }

    container.innerHTML = posts.map(post => `
      <div class="post-item">
        <div class="post-avatar">${post.profiles?.username?.charAt(0).toUpperCase() || 'G'}</div>
        <div class="post-content-wrap">
          <div class="post-meta">
            <span class="post-username">@${post.profiles?.username || 'gliimait'}</span>
            <span class="post-time">${new Date(post.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
          <p class="post-text">${post.content}</p>
        </div>
      </div>
    `).join('');
  },

  setupRealtime() {
    // 1. Remove existing channel to prevent duplicate listener crash in SPA
    supabase.removeChannel(supabase.channel('public:posts'));

    // 2. Listen for new posts in real-time
    supabase
      .channel('public:posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => {
        // When a new post arrives, fetch the user data for it
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', payload.new.user_id)
          .single();

        const newPost = {
          content: payload.new.content,
          created_at: payload.new.created_at,
          profiles: profile
        };

        // Prepend to the DOM
        const container = document.getElementById('posts-container');
        if (!container) return; // Safety check if user switched tabs

        const currentHTML = container.innerHTML;
        const postHTML = `
          <div class="post-item">
            <div class="post-avatar">${newPost.profiles?.username?.charAt(0).toUpperCase() || 'G'}</div>
            <div class="post-content-wrap">
              <div class="post-meta">
                <span class="post-username">@${newPost.profiles?.username || 'gliimait'}</span>
                <span class="post-time">Just now</span>
              </div>
              <p class="post-text">${newPost.content}</p>
            </div>
          </div>`;

        container.innerHTML = postHTML + currentHTML;
      })
      .subscribe();
  }
};
