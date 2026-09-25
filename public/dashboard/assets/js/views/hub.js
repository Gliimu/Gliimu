import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Hub',
  template: `
    <div class="hub-layout">
      <div class="card post-creator">
        <h3>Share an update</h3>
        <textarea id="post-content" class="input" placeholder="What's happening in your Gliimait journey?" rows="3"></textarea>
        <input type="file" id="media-input" accept="image/*,video/*" style="display: none;">
        <div class="post-actions">
          <div style="display: flex; gap: var(--space-3); align-items: center;">
          <button id="upload-media-btn" class="btn-icon" title="Attach Image/Video">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          </button>
            <span id="file-name" style="font-size: var(--fs-xs); color: var(--text-muted);"></span>
          </div>
          <button id="submit-post-btn" class="btn-primary">Post Update</button>
        </div>
      </div>

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
    // Expose methods to window for inline onclick handlers
    window.hubInstance = {
      toggleComments: (id) => this.toggleComments(id),
      submitComment: (id) => this.submitComment(id),
      toggleLike: (id, likes) => this.toggleLike(id, likes),
      sharePost: (id, content) => this.sharePost(id, content)
    };

    this.selectedFile = null;
    this.fetchPosts();
    this.setupRealtime();

    const fileInput = document.getElementById('media-input');
    document.getElementById('upload-media-btn').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      this.selectedFile = e.target.files[0];
      document.getElementById('file-name').innerText = this.selectedFile ? this.selectedFile.name : '';
    });

    document.getElementById('submit-post-btn').addEventListener('click', async () => {
      const content = document.getElementById('post-content').value.trim();
      if (!content && !this.selectedFile) return alert("Post cannot be empty.");

      const btn = document.getElementById('submit-post-btn');
      btn.innerText = "Posting...";
      btn.disabled = true;

      let mediaUrl = null, mediaType = null;

      if (this.selectedFile) {
        mediaType = this.selectedFile.type.startsWith('image/') ? 'image' : 'video';
        const fileName = `${store.user.id}/${Date.now()}_${this.selectedFile.name}`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(fileName, this.selectedFile);
        if (upErr) { alert("Upload failed."); btn.innerText = "Post Update"; btn.disabled = false; return; }
        const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
        mediaUrl = data.publicUrl;
      }

      const { error } = await supabase.from('posts').insert({
        content, user_id: store.user.id, media_url: mediaUrl, media_type: mediaType
      });

      if (error) alert("Failed: " + error.message);
      else {
        document.getElementById('post-content').value = "";
        this.selectedFile = null;
        document.getElementById('file-name').innerText = "";
      }

      btn.innerText = "Post Update";
      btn.disabled = false;
    });
  },

  async fetchPosts() {
    const { data, error } = await supabase
      .from('posts')
      .select(`id, content, media_url, media_type, likes, created_at, user_id, profiles:profiles!user_id(username, full_name, avatar_url)`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) { console.error(error); return; }
    this.renderPosts(data);
  },

  renderPosts(posts) {
    const container = document.getElementById('posts-container');
    if (!container) return;
    if (posts.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">No posts yet.</p>';
      return;
    }

    container.innerHTML = posts.map(post => {
      const avatar = post.profiles?.avatar_url
        ? `<img src="${post.profiles.avatar_url}" class="post-avatar" style="object-fit:cover;">`
        : `<div class="post-avatar">${post.profiles?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;

      const mediaHtml = post.media_url ? (
        post.media_type === 'image'
          ? `<img src="${post.media_url}" class="post-media" style="max-height: 400px; object-fit: contain; background: var(--bg-tertiary);">`
          : `<video src="${post.media_url}" class="post-media" style="max-height: 400px; object-fit: contain; background: black;" controls></video>`
      ) : '';

      return `
        <div class="post-item" id="post-${post.id}">
          ${avatar}
          <div class="post-content-wrap">
            <div class="post-meta">
              <span class="post-username">${post.profiles?.full_name || 'Gliimait'}</span>
              <span class="post-handle">@${post.profiles?.username || 'gliimait'}</span>
              <span class="post-time">· ${new Date(post.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
            <p class="post-text">${post.content || ''}</p>
            ${mediaHtml}
            <div class="post-actions-bar">
              <button class="action-btn" onclick="hubInstance.toggleComments('${post.id}')">💬</button>
              <button class="action-btn like-btn" onclick="hubInstance.toggleLike('${post.id}', ${post.likes})">❤️ <span>${post.likes}</span></button>
              <button class="action-btn" onclick="hubInstance.sharePost('${post.id}', \`${(post.content || '').replace(/`/g, '\\`')}\`)">↗️</button>
            </div>
            <div class="comments-section" id="comments-${post.id}" style="display: none;">
              <div class="existing-comments" id="existing-comments-${post.id}"></div>
              <div class="new-comment-box">
                <input type="text" class="input" placeholder="Write a comment..." id="comment-input-${post.id}">
                <button class="btn-primary" onclick="hubInstance.submitComment('${post.id}')">Reply</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  async toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    if (section.style.display === 'none') {
      section.style.display = 'block';
      const { data: comments } = await supabase
        .from('comments')
        .select('content, profiles:profiles!user_id(username, avatar_url)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      const commentsEl = document.getElementById(`existing-comments-${postId}`);
      if (comments && comments.length > 0) {
        commentsEl.innerHTML = comments.map(c => `
          <div class="comment-item">
            <div class="comment-avatar">${c.profiles?.avatar_url ? `<img src="${c.profiles.avatar_url}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;">` : '💬'}</div>
            <div>
              <span class="comment-author">@${c.profiles?.username || 'gliimait'}</span>
              <p class="comment-text">${c.content}</p>
            </div>
          </div>
        `).join('');
      } else {
        commentsEl.innerHTML = '<p style="font-size: var(--fs-xs); color: var(--text-muted);">No comments yet.</p>';
      }
    } else {
      section.style.display = 'none';
    }
  },

  async submitComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input.value.trim();
    if (!content) return;

    await supabase.from('comments').insert({ post_id: postId, user_id: store.user.id, content });
    input.value = "";
    this.toggleComments(postId);
    this.toggleComments(postId);
  },

  async toggleLike(postId, currentLikes) {
    await supabase.from('posts').update({ likes: currentLikes + 1 }).eq('id', postId);
    const btn = document.querySelector(`#post-${postId} .like-btn span`);
    if (btn) btn.innerText = currentLikes + 1;
  },

  sharePost(postId, content) {
    if (navigator.share) {
      navigator.share({ title: 'Gliimu Post', text: content, url: window.location.href })
        .catch(err => console.log('Share cancelled'));
    } else {
      alert("Sharing not supported. Copy URL.");
    }
  },

  setupRealtime() {
    supabase.removeChannel(supabase.channel('public:posts'));
    supabase
      .channel('public:posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, full_name, avatar_url')
          .eq('id', payload.new.user_id)
          .single();

        const newPost = { ...payload.new, profiles: profile };
        const container = document.getElementById('posts-container');
        if (!container) return;

        const avatar = profile?.avatar_url
          ? `<img src="${profile.avatar_url}" class="post-avatar" style="object-fit:cover;">`
          : `<div class="post-avatar">${profile?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;

        const html = `
          <div class="post-item" id="post-${newPost.id}">
            ${avatar}
            <div class="post-content-wrap">
              <div class="post-meta">
                <span class="post-username">${profile?.full_name || 'Gliimait'}</span>
                <span class="post-handle">@${profile?.username || 'gliimait'}</span>
                <span class="post-time">· Just now</span>
              </div>
              <p class="post-text">${newPost.content || ''}</p>
              <div class="post-actions-bar">
                <button class="action-btn" onclick="hubInstance.toggleComments('${newPost.id}')">💬</button>
                <button class="action-btn like-btn" onclick="hubInstance.toggleLike('${newPost.id}', 0)">❤️ <span>0</span></button>
                <button class="action-btn" onclick="hubInstance.sharePost('${newPost.id}', \`${(newPost.content || '').replace(/`/g, '\\`')}\`)">↗️</button>
              </div>
            </div>
          </div>`;

        container.innerHTML = html + container.innerHTML;
      })
      .subscribe();
  }
};
