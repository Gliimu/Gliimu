import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Hub',
  template: `
    <div class="hub-layout">
      <!-- Live Feed -->
      <div class="live-feed" id="posts-container">
        <p style="color: var(--text-muted); text-align: center; padding: 40px;">Loading posts...</p>
      </div>

      <!-- Fixed Bottom Action Bar -->
      <nav class="hub-bottom-nav">
        <div class="hub-bottom-inner">
          <button class="hub-nav-btn" id="create-post-btn" title="Create Post">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <div class="hub-search-wrapper">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="hub-search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" id="hub-search" class="hub-search-input" placeholder="Search the Hub...">
          </div>
          <button class="hub-nav-btn live-btn" id="live-btn" title="Go Live">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
          </button>
        </div>
      </nav>
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
    this.taggedUsers = [];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        <h2 style="margin-bottom: 16px;">Create Post</h2>
        <textarea id="post-content" class="input" style="min-height: 100px; resize: vertical; border-color: var(--border);" placeholder="What's happening? Use @ to tag someone..."></textarea>

        <div id="tag-suggestions" class="tag-suggestions" style="display: none;"></div>

        <input type="file" id="media-input" accept="image/*,video/*,application/pdf" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; border-top: 1px solid var(--border); padding-top: 16px;">
          <button class="btn-icon" id="upload-media-btn" title="Attach Media (Img, Vid, PDF)">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
          </button>
          <div id="file-name" style="font-size: 12px; color: var(--text-muted); flex: 1; margin-left: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
          <button id="submit-post-btn" class="btn-primary" style="width: auto; padding: 10px 28px;">Post</button>
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
        const { data: users } = await supabase.from('profiles').select('id, full_name, avatar_url').ilike('full_name', `%${query}%`).limit(5);

        if (users && users.length > 0) {
          suggestionsBox.style.display = 'block';
          suggestionsBox.innerHTML = users.map(u => `
            <div class="tag-suggestion-item" data-id="${u.id}" data-name="${u.full_name}">
              ${u.avatar_url ? `<img src="${u.avatar_url}" class="tag-avatar">` : `<div class="tag-avatar">${u.full_name.charAt(0)}</div>`}
              <span>${u.full_name}</span>
            </div>
          `).join('');

          document.querySelectorAll('.tag-suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
              const id = item.dataset.id;
              const name = item.dataset.name;
              if (!this.taggedUsers.some(u => u.id === id)) this.taggedUsers.push(id);
              const newText = text.substring(0, cursorPos - query.length - 1) + `@${name} ` + text.substring(cursorPos);
              textarea.value = newText;
              suggestionsBox.style.display = 'none';
              textarea.focus();
            });
          });
        } else { suggestionsBox.style.display = 'none'; }
      } else { suggestionsBox.style.display = 'none'; }
    });

    // Media & PDF Upload Logic
    const fileInput = document.getElementById('media-input');
    document.getElementById('upload-media-btn').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // PDF Validation (Max 5MB)
      if (file.type === 'application/pdf' && file.size > 5 * 1024 * 1024) {
        alert("PDF must be under 5MB.");
        fileInput.value = '';
        return;
      }

      // Video Validation (Max 5 Min - requires async duration check)
      if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
          if (video.duration > 300) {
            alert("Video must be under 5 minutes.");
            this.selectedFile = null;
            document.getElementById('file-name').innerText = '';
          } else {
            this.selectedFile = file;
            document.getElementById('file-name').innerText = file.name;
          }
          URL.revokeObjectURL(video.src);
        };
        video.src = URL.createObjectURL(file);
      } else {
        this.selectedFile = file;
        document.getElementById('file-name').innerText = file.name;
      }
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
        if (this.selectedFile.type.startsWith('image/')) mediaType = 'image';
        else if (this.selectedFile.type.startsWith('video/')) mediaType = 'video';
        else if (this.selectedFile.type === 'application/pdf') mediaType = 'pdf';

        const fileName = `${store.user.id}/${Date.now()}_${this.selectedFile.name}`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(fileName, this.selectedFile);
        if (!upErr) {
          const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
          mediaUrl = data.publicUrl;
        }
      }

      const { error } = await supabase.from('posts').insert({
        content, user_id: store.user.id, media_url: mediaUrl, media_type: mediaType, tagged_users: this.taggedUsers
      });

      if (error) alert("Failed: " + error.message);
      modal.remove();
    });
  },

  async logSearch(keyword) {
    await supabase.from('user_history_data').insert({ user_id: store.user.id, keyword: keyword.toLowerCase() });
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
    if (points >= 3 && (uniqueUsers >= 21 || uniqueUsers >= 9)) return true;
    return false;
  },

  renderPosts(posts) {
    const container = document.getElementById('posts-container');
    if (!container) return;
    if (posts.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">No posts yet.</p>';
      return;
    }

    container.innerHTML = posts.map(post => {
      const avatar = post.profiles?.avatar_url
        ? `<img src="${post.profiles.avatar_url}" class="post-avatar" style="object-fit:cover;">`
        : `<div class="post-avatar">${post.profiles?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;

      // Render Media (Image, Video, or PDF Chip)
      let mediaHtml = '';
      if (post.media_url) {
        if (post.media_type === 'image') {
          mediaHtml = `<img src="${post.media_url}" class="post-media">`;
        } else if (post.media_type === 'video') {
          mediaHtml = `<video src="${post.media_url}" class="post-media" controls></video>`;
        } else if (post.media_type === 'pdf') {
          // Sleek PDF Chip
          const fileName = post.media_url.split('/').pop().replace(/^\d+_/, '');
          mediaHtml = `
            <a href="${post.media_url}" target="_blank" class="pdf-chip">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              <div class="pdf-info">
                <span class="pdf-title">${fileName}</span>
                <span class="pdf-subtitle">PDF Document</span>
              </div>
            </a>
          `;
        }
      }

      const likes = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'like').length;
      const hasLiked = this.allInteractions.some(i => i.post_id === post.id && i.user_id === store.user.id && i.interaction_type === 'like');
      const supports = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'support').length;
      const trendingBadge = this.isTrending(post.id) ? '<span class="trending-badge">🔥 Trending</span>' : '';

      // Strict SVG Icons for Actions
      return `
        <div class="post-card" id="post-${post.id}">
          <div class="post-header">
            ${avatar}
            <div class="post-meta">
              <div class="post-author-row">
                <span class="post-username">${post.profiles?.full_name || 'Gliimait'}</span>
                ${trendingBadge}
              </div>
              <span class="post-time">${new Date(post.created_at).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}</span>
            </div>
          </div>

          <div class="post-body">
            <p class="post-text">${post.content || ''}</p>
            ${mediaHtml}
          </div>

          <div class="post-actions-bar">
            <button class="action-btn" onclick="hubInstance.toggleComments('${post.id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </button>
            <button class="action-btn like-btn ${hasLiked ? 'liked' : ''}" onclick="hubInstance.toggleLike('${post.id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
              <span>${likes}</span>
            </button>
            <button class="action-btn" onclick="hubInstance.sharePost('${post.id}', \`${(post.content || '').replace(/`/g, '\\`')}\`)">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
            </button>
            <button class="action-btn support-btn" onclick="hubInstance.supportCreator('${post.id}', '${post.user_id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              <span>${supports > 0 ? supports : 'Support'}</span>
            </button>
          </div>

          <div class="comments-section" id="comments-${post.id}" style="display: none;">
            <div class="existing-comments" id="existing-comments-${post.id}"></div>
            <div class="new-comment-box">
              <input type="text" class="input" placeholder="Write a comment..." id="comment-input-${post.id}">
              <button class="btn-primary" onclick="hubInstance.submitComment('${post.id}')">Reply</button>
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
      this.logInteraction(postId, 'view');
      const { data: comments } = await supabase.from('comments').select('content, profiles:profiles!user_id(username, avatar_url)').eq('post_id', postId).order('created_at', { ascending: true });
      const commentsEl = document.getElementById(`existing-comments-${postId}`);
      if (comments && comments.length > 0) {
        commentsEl.innerHTML = comments.map(c => `<div class="comment-item"><div class="comment-avatar">${c.profiles?.avatar_url ? `<img src="${c.profiles.avatar_url}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;">` : '💬'}</div><div><span class="comment-author">@${c.profiles?.username || 'gliimait'}</span><p class="comment-text">${c.content}</p></div></div>`).join('');
      } else { commentsEl.innerHTML = '<p style="font-size: var(--fs-xs); color: var(--text-muted);">No comments yet.</p>'; }
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
        this.fetchPosts(); // Simply refetch to keep it clean and apply trending logic
      })
      .subscribe();
  }
};
