import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Hub',
  template: `
    <div class="hub-layout">
      <!-- New Action Bar -->
      <div class="hub-action-bar">
        <button class="hub-action-btn" id="create-post-btn" title="Create Post">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button class="hub-action-btn live-btn" id="live-btn" title="Go Live">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
          <span>Live</span>
        </button>
        <div class="hub-search-wrapper">
          <i class="fas fa-search hub-search-icon"></i>
          <input type="text" id="hub-search" class="hub-search-input" placeholder="Search the Hub...">
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
    window.hubInstance = {
      toggleComments: (id) => this.toggleComments(id),
      submitComment: (id) => this.submitComment(id),
      toggleLike: (id) => this.toggleLike(id),
      sharePost: (id, content) => this.sharePost(id, content),
      supportCreator: (id, authorId) => this.openSupportModal(id, authorId)
    };

    this.fetchPosts();
    this.setupRealtime();

    // Action Bar Listeners
    document.getElementById('create-post-btn').addEventListener('click', () => this.openCreateModal());
    document.getElementById('live-btn').addEventListener('click', () => alert('Live session starting soon!'));

    let searchTimer = null;
    document.getElementById('hub-search').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      const query = e.target.value.trim();
      if (query.length > 2) {
        searchTimer = setTimeout(() => this.logSearch(query), 800);
      }
    });
  },

  // ============================================
  // CREATE POST MODAL & TAGGING SYSTEM
  // ============================================
  openCreateModal() {
    this.taggedUsers = []; // Reset tagged users array

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        <h2 style="margin-bottom: 16px;">Create Post</h2>
        <textarea id="post-content" class="input" style="min-height: 100px; resize: vertical;" placeholder="What's happening? Use @ to tag someone..."></textarea>

        <!-- Tag Suggestions Dropdown -->
        <div id="tag-suggestions" class="tag-suggestions" style="display: none;"></div>

        <input type="file" id="media-input" accept="image/*,video/*" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
          <button class="btn-icon" id="upload-media-btn" title="Attach Media">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          </button>
          <span id="file-name" style="font-size: 12px; color: var(--text-muted); flex: 1; margin-left: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></span>
          <button id="submit-post-btn" class="btn-primary" style="width: auto; padding: 8px 24px;">Post</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const textarea = document.getElementById('post-content');
    const suggestionsBox = document.getElementById('tag-suggestions');
    this.selectedFile = null;

    // Tagging Logic
    textarea.addEventListener('input', async (e) => {
      const text = e.target.value;
      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = text.substring(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@(\w+)$/);

      if (atMatch) {
        const query = atMatch[1];
        // Fetch users by real name (ilike)
        const { data: users } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .ilike('full_name', `%${query}%`)
          .limit(5);

        if (users && users.length > 0) {
          suggestionsBox.style.display = 'block';
          suggestionsBox.innerHTML = users.map(u => `
            <div class="tag-suggestion-item" data-id="${u.id}" data-name="${u.full_name}" data-avatar="${u.avatar_url || ''}">
              ${u.avatar_url ? `<img src="${u.avatar_url}" class="tag-avatar">` : `<div class="tag-avatar">${u.full_name.charAt(0)}</div>`}
              <span>${u.full_name}</span>
            </div>
          `).join('');

          document.querySelectorAll('.tag-suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
              const id = item.dataset.id;
              const name = item.dataset.name;

              // Add to tagged array if not already there
              if (!this.taggedUsers.some(u => u.id === id)) {
                this.taggedUsers.push(id);
              }

              // Replace the @query with the real name in the textarea
              const newText = text.substring(0, cursorPos - query.length - 1) + `@${name} ` + text.substring(cursorPos);
              textarea.value = newText;
              suggestionsBox.style.display = 'none';
              textarea.focus();
            });
          });
        } else {
          suggestionsBox.style.display = 'none';
        }
      } else {
        suggestionsBox.style.display = 'none';
      }
    });

    // Media Logic
    const fileInput = document.getElementById('media-input');
    document.getElementById('upload-media-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      this.selectedFile = e.target.files[0];
      document.getElementById('file-name').innerText = this.selectedFile ? this.selectedFile.name : '';
    });

    // Submit Logic
    document.getElementById('submit-post-btn').addEventListener('click', async () => {
      const btn = document.getElementById('submit-post-btn');
      const content = document.getElementById('post-content').value.trim();
      if (!content && !this.selectedFile) return alert("Post cannot be empty.");

      btn.innerText = "Posting...";
      btn.disabled = true;

      let mediaUrl = null, mediaType = null;
      if (this.selectedFile) {
        mediaType = this.selectedFile.type.startsWith('image/') ? 'image' : 'video';
        const fileName = `${store.user.id}/${Date.now()}_${this.selectedFile.name}`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(fileName, this.selectedFile);
        if (!upErr) {
          const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
          mediaUrl = data.publicUrl;
        }
      }

      const { error } = await supabase.from('posts').insert({
        content,
        user_id: store.user.id,
        media_url: mediaUrl,
        media_type: mediaType,
        tagged_users: this.taggedUsers // Save the UUIDs of tagged users
      });

      if (error) alert("Failed: " + error.message);
      modal.remove();
    });
  },

  async logSearch(keyword) {
    await supabase.from('user_history_data').insert({
      user_id: store.user.id,
      keyword: keyword.toLowerCase()
    });
    // console.log("Saved search for For You algorithm:", keyword);
  },

  // ============================================
  // FETCH & RENDER POSTS
  // ============================================
  async fetchPosts() {
    const [{ data: posts, error }, { data: interactions }, { data: profile }] = await Promise.all([
      supabase.from('posts').select(`id, content, media_url, media_type, created_at, user_id, tagged_users, profiles:profiles!user_id(username, full_name, avatar_url)`).order('created_at', { ascending: false }).limit(50),
      supabase.from('hub_interactions').select('post_id, user_id, interaction_type, amount'),
      supabase.from('profiles').select('wallet_balance').eq('id', store.user.id).single()
    ]);

    if (error) { console.error(error); return; }

    this.userBalance = profile?.wallet_balance || 0;
    this.allInteractions = interactions || [];
    this.renderPosts(posts || []);
  },

  isTrending(postId) {
    const postInteractions = this.allInteractions.filter(i => i.post_id === postId);
    const oneDayAgo = new Date(Date.now() - 86400000);
    const dailyInteractions = postInteractions.filter(i => new Date(i.created_at) >= oneDayAgo);
    const points = dailyInteractions.length;
    const uniqueUsers = new Set(dailyInteractions.map(i => i.user_id)).size;
    if (points >= 3 && (uniqueUsers >= 21 || uniqueUsers >= 9)) return true; // 9% rule fallback
    return false;
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

      // Assign CSS class based on media type for Masonry layout later
      let mediaClass = 'post-square'; // Default for text
      if (post.media_type === 'image' || post.media_type === 'video') {
        // We'll use a simple trick: if it's media, give it a standard responsive class for now
        // The true masonry math will come in the CSS phase
        mediaClass = 'post-media-default';
      }

      const mediaHtml = post.media_url ? (
        post.media_type === 'image'
          ? `<img src="${post.media_url}" class="post-media">`
          : `<video src="${post.media_url}" class="post-media" controls></video>`
      ) : '';

      const likes = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'like').length;
      const hasLiked = this.allInteractions.some(i => i.post_id === post.id && i.user_id === store.user.id && i.interaction_type === 'like');
      const supports = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'support').length;
      const trendingBadge = this.isTrending(post.id) ? '<span class="trending-badge">🔥 Trending</span>' : '';

      return `
        <div class="post-item" id="post-${post.id}">
          ${avatar}
          <div class="post-content-wrap">
            <div class="post-meta">
              <span class="post-username">${post.profiles?.full_name || 'Gliimait'}</span>
              <span class="post-handle">@${post.profiles?.username || 'gliimait'}</span>
              <span class="post-time">· ${new Date(post.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              ${trendingBadge}
            </div>
            <p class="post-text">${post.content || ''}</p>
            ${mediaHtml}
            <div class="post-actions-bar">
              <button class="action-btn" onclick="hubInstance.toggleComments('${post.id}')">💬</button>
              <button class="action-btn like-btn ${hasLiked ? 'liked' : ''}" onclick="hubInstance.toggleLike('${post.id}')">❤️ <span>${likes}</span></button>
              <button class="action-btn" onclick="hubInstance.sharePost('${post.id}', \`${(post.content || '').replace(/`/g, '\\`')}\`)">↗️</button>
              <button class="action-btn support-btn" onclick="hubInstance.supportCreator('${post.id}', '${post.user_id}')">⚡ <span>${supports > 0 ? supports : 'Support'}</span></button>
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

  // ... (Keep toggleComments, submitComment, toggleLike, sharePost, openSupportModal, logInteraction, setupRealtime exactly as they were in the previous code block)
  async toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    if (section.style.display === 'none') {
      section.style.display = 'block';
      this.logInteraction(postId, 'view');
      const { data: comments } = await supabase.from('comments').select('content, profiles:profiles!user_id(username, avatar_url)').eq('post_id', postId).order('created_at', { ascending: true });
      const commentsEl = document.getElementById(`existing-comments-${postId}`);
      if (comments && comments.length > 0) {
        commentsEl.innerHTML = comments.map(c => `<div class="comment-item"><div class="comment-avatar">${c.profiles?.avatar_url ? `<img src="${c.profiles.avatar_url}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;">` : '💬'}</div><div><span class="comment-author">@${c.profiles?.username || 'gliimait'}</span><p class="comment-text">${c.content}</p></div></div>`).join('');
      } else {
        commentsEl.innerHTML = '<p style="font-size: var(--fs-xs); color: var(--text-muted);">No comments yet.</p>';
      }
    } else { section.style.display = 'none'; }
  },

  async submitComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input.value.trim();
    if (!content) return;
    await supabase.from('comments').insert({ post_id: postId, user_id: store.user.id, content });
    this.logInteraction(postId, 'comment');
    input.value = "";
    this.toggleComments(postId); this.toggleComments(postId);
  },

  async toggleLike(postId) {
    const existingLike = this.allInteractions.find(i => i.post_id === postId && i.user_id === store.user.id && i.interaction_type === 'like');
    if (existingLike) {
      await supabase.from('hub_interactions').delete().eq('id', existingLike.id);
      this.allInteractions = this.allInteractions.filter(i => i.id !== existingLike.id);
    } else {
      const { data } = await supabase.from('hub_interactions').insert({ post_id: postId, user_id: store.user.id, interaction_type: 'like' }).select('*').single();
      if (data) this.allInteractions.push(data);
    }
    const post = this.allInteractions.filter(i => i.post_id === postId && i.interaction_type === 'like');
    const btn = document.querySelector(`#post-${postId} .like-btn span`);
    const btnParent = document.querySelector(`#post-${postId} .like-btn`);
    if (btn) btn.innerText = post.length;
    if (btnParent) btnParent.classList.toggle('liked', !existingLike);
  },

  async sharePost(postId, content) {
    this.logInteraction(postId, 'share');
    if (navigator.share) { navigator.share({ title: 'Gliimu Post', text: content, url: window.location.href }).catch(() => {}); } else { alert("Share link copied."); }
  },

  openSupportModal(postId, authorId) {
    if (authorId === store.user.id) return alert("You cannot support yourself!");
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal-content"><button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button><h2 style="margin-bottom: 16px;">Support Creator</h2><p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 24px;">Your wallet balance: ₦${this.userBalance.toLocaleString()}</p><div class="form-group"><label>Enter Amount (₦)</label><input type="number" id="support-amount" class="input" placeholder="e.g. 1000" min="100"></div><button id="confirm-support-btn" class="btn-primary" style="width: 100%;">Send Support</button></div>`;
    document.body.appendChild(modal);

    document.getElementById('confirm-support-btn').addEventListener('click', async (e) => {
      const btn = e.target; btn.innerText = 'Processing...'; btn.disabled = true;
      const amount = parseInt(document.getElementById('support-amount').value);
      if (!amount || amount < 100) { alert("Minimum support is ₦100."); btn.innerText = 'Send Support'; btn.disabled = false; return; }
      if (this.userBalance < amount) { alert("Insufficient funds."); btn.innerText = 'Send Support'; btn.disabled = false; return; }

      const newBalance = this.userBalance - amount;
      await supabase.from('profiles').update({ wallet_balance: newBalance }).eq('id', store.user.id);
      this.userBalance = newBalance;
      await supabase.rpc('increment_wallet', { user_id: authorId, amount: amount });
      const earnedPoints = Math.round(amount / 1000);
      await supabase.from('transactions').insert({ user_id: store.user.id, amount: -amount, type: 'support', status: 'success', description: `Hub Support`, points: earnedPoints });
      this.logInteraction(postId, 'support', amount);
      alert(`Supported successfully! You earned ${earnedPoints} GP.`);
      modal.remove(); this.fetchPosts();
    });
  },

  async logInteraction(postId, type, amount = 0) {
    const { data } = await supabase.from('hub_interactions').insert({ post_id: postId, user_id: store.user.id, interaction_type: type, amount: amount }).select('*').single();
    if (data) this.allInteractions.push(data);
  },

  setupRealtime() {
    supabase.removeChannel(supabase.channel('public:posts'));
    supabase
      .channel('public:posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => {
        const { data: profile } = await supabase.from('profiles').select('username, full_name, avatar_url').eq('id', payload.new.user_id).single();
        const newPost = { ...payload.new, profiles: profile };
        const container = document.getElementById('posts-container');
        if (!container) return;
        const avatar = profile?.avatar_url ? `<img src="${profile.avatar_url}" class="post-avatar" style="object-fit:cover;">` : `<div class="post-avatar">${profile?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
        const html = `<div class="post-item" id="post-${newPost.id}">${avatar}<div class="post-content-wrap"><div class="post-meta"><span class="post-username">${profile?.full_name || 'Gliimait'}</span><span class="post-handle">@${profile?.username || 'gliimait'}</span><span class="post-time">· Just now</span></div><p class="post-text">${newPost.content || ''}</p><div class="post-actions-bar"><button class="action-btn" onclick="hubInstance.toggleComments('${newPost.id}')">💬</button><button class="action-btn like-btn" onclick="hubInstance.toggleLike('${newPost.id}')">❤️ <span>0</span></button><button class="action-btn" onclick="hubInstance.sharePost('${newPost.id}', \`${(newPost.content || '').replace(/`/g, '\\`')}\`)">↗️</button><button class="action-btn support-btn" onclick="hubInstance.supportCreator('${newPost.id}', '${newPost.user_id}')">⚡ <span>Support</span></button></div></div></div>`;
        container.innerHTML = html + container.innerHTML;
      })
      .subscribe();
  }
};
