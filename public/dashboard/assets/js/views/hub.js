import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Hub',
  template: `
    <div class="hub-layout">
      <!-- Sub Header (Filter & View Toggle) -->
      <div class="hub-subheader">
        <select id="hub-filter" class="lib-dropdown">
          <option value="all">All Categories</option>
          <option value="Media">Media</option>
          <option value="Tech">Tech</option>
          <option value="Business">Business</option>
          <option value="Personal">Personal</option>
          <option value="Education">Education</option>
        </select>
        <div class="view-toggle-wrapper">
          <button class="view-toggle-btn active" data-view="list" title="List View">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
          </button>
          <button class="view-toggle-btn" data-view="grid" title="Grid View">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          </button>
        </div>
      </div>

      <!-- Blog Feed -->
      <div class="blog-feed" id="posts-container">
        <p style="color: var(--text-muted); text-align: center; padding: 40px;">Loading published Gliims...</p>
      </div>

      <!-- Floating Action Button (FAB) -->
      <div class="hub-fab-wrapper">
        <div class="hub-fab-menu" id="hub-fab-menu" style="display: none;">
          <button class="fab-menu-btn" id="fab-live-btn" title="Go Live">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
          </button>
          <button class="fab-menu-btn" id="fab-upload-btn" title="Publish Gliim">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
        </div>
        <button class="hub-fab-main" id="hub-fab-main">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
    </div>
  `,

  init() {
    this.currentPosts = [];
    this.allInteractions = [];
    this.searchQuery = '';
    this.currentFilter = 'all';
    this.viewStyle = 'list';

    window.hubInstance = {
      openReadView: (id) => this.openReadView(id),
      toggleLike: (id) => this.toggleLike(id),
      sharePost: (id, title) => this.sharePost(id, title),
      supportCreator: (id, authorId) => this.openSupportModal(id, authorId)
    };

    this.setupTopbarSearch();
    this.setupSubheader();
    this.fetchPosts();
    this.setupRealtime();
    this.setupFab();
  },

  setupTopbarSearch() {
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    if (topbarDynamic) {
      topbarDynamic.innerHTML = `
        <div class="hub-topbar-search">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="hub-search" placeholder="Search the Hub...">
        </div>
      `;
      document.getElementById('hub-search').addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.renderPosts(this.currentPosts);
      });
    }
  },

  setupSubheader() {
    document.getElementById('hub-filter').addEventListener('change', (e) => {
      this.currentFilter = e.target.value;
      this.renderPosts(this.currentPosts);
    });

    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.viewStyle = e.currentTarget.dataset.view;
        this.renderPosts(this.currentPosts);
      });
    });
  },

  setupFab() {
    const fabMain = document.getElementById('hub-fab-main');
    const fabMenu = document.getElementById('hub-fab-menu');

    fabMain.addEventListener('click', (e) => {
      e.stopPropagation();
      fabMenu.style.display = fabMenu.style.display === 'none' ? 'flex' : 'none';
    });

    document.addEventListener('click', () => fabMenu.style.display = 'none');

    document.getElementById('fab-upload-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      fabMenu.style.display = 'none';
      this.openCreateModal();
    });

    document.getElementById('fab-live-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      fabMenu.style.display = 'none';
      alert('Live session starting soon!');
    });
  },

  // ============================================
  // GLIIM STUDIO (MAKER)
  // ============================================
  openCreateModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content gliim-builder">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        <h2 style="margin-bottom: 24px;">Publish a Gliim</h2>

        <div class="form-group">
          <label>Title</label>
          <input type="text" id="post-title" class="input" placeholder="An elite headline...">
        </div>

        <div class="form-row" style="gap: 16px;">
          <div class="form-group" style="flex: 1;">
            <label>Category</label>
            <select id="post-category" class="input">
              <option>Media</option>
              <option>Tech</option>
              <option>Business</option>
              <option>Personal</option>
              <option>Education</option>
            </select>
          </div>
          <div class="form-group" style="flex: 2;">
            <label>Description (SEO Summary)</label>
            <input type="text" id="post-description" class="input" placeholder="Brief summary...">
          </div>
        </div>

        <div class="form-group">
          <label>Cover Image Upload</label>
          <input type="file" id="post-cover-file" class="input" accept="image/*">
        </div>

        <hr style="border: none; border-top: 1px solid var(--border); margin: 24px 0;">

        <h3 style="margin-bottom: 16px;">Content Blocks</h3>
        <div id="blocks-container" style="display: flex; flex-direction: column; gap: 16px;"></div>

        <div class="builder-toolbar">
          <button class="btn-secondary" id="add-text-block">+ Text</button>
          <button class="btn-secondary" id="add-image-block">+ Image</button>
          <button class="btn-secondary" id="add-video-block">+ Video</button>
          <button class="btn-secondary" id="add-audio-block">+ Audio</button>
        </div>

        <button id="submit-post-btn" class="btn-primary" style="width: 100%; margin-top: 32px;">Publish Gliim</button>
      </div>
    `;
    document.body.appendChild(modal);

    const blocksContainer = document.getElementById('blocks-container');

    const handleFileUpload = async (file, blockDiv, type) => {
      const statusEl = blockDiv.querySelector('.upload-status');
      const hiddenInput = blockDiv.querySelector('.block-content-input');

      statusEl.innerText = "Uploading...";
      statusEl.style.color = "var(--brand-primary)";

      const fileName = `${store.user.id}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('media').upload(fileName, file);

      if (error) {
        statusEl.innerText = "Upload failed.";
        statusEl.style.color = "var(--error)";
        return false;
      }

      const { data } = supabase.storage.from('media').getPublicUrl(fileName);
      hiddenInput.value = data.publicUrl;
      statusEl.innerText = "Upload complete!";
      statusEl.style.color = "var(--success)";

      // Show preview
      const preview = blockDiv.querySelector('.block-preview');
      preview.innerHTML = type === 'image' ? `<img src="${data.publicUrl}" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">` : `<div style="background:var(--bg-tertiary);padding:8px;border-radius:8px;margin-top:8px;font-size:12px;">File ready: ${file.name}</div>`;
      return true;
    };

    const addBlock = (type) => {
      const blockDiv = document.createElement('div');
      blockDiv.className = 'builder-block';
      blockDiv.dataset.type = type;

      let inputHtml = '';
      if (type === 'text') {
        inputHtml = `
          <select class="input block-style-select" style="margin-bottom: 8px;">
            <option value="paragraph">Paragraph</option>
            <option value="title">Title</option>
            <option value="subtitle">Subtitle</option>
          </select>
          <textarea class="input block-content-input" placeholder="Write your text..." rows="4"></textarea>
        `;
      } else {
        const accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'audio/*';
        inputHtml = `
          <input type="file" class="input block-file-input" accept="${accept}" style="margin-bottom: 8px;">
          <div class="upload-status" style="font-size: 12px; margin-bottom: 8px;"></div>
          <div class="block-preview"></div>
          <input type="hidden" class="block-content-input">
        `;
      }

      blockDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span class="block-label">${type.toUpperCase()}</span>
          <button class="block-remove-btn" onclick="this.parentElement.parentElement.remove()">Remove</button>
        </div>
        ${inputHtml}
      `;
      blocksContainer.appendChild(blockDiv);

      if (type !== 'text') {
        const fileInput = blockDiv.querySelector('.block-file-input');
        fileInput.addEventListener('change', (e) => {
          if (e.target.files[0]) handleFileUpload(e.target.files[0], blockDiv, type);
        });
      }
    };

    document.getElementById('add-text-block').addEventListener('click', () => addBlock('text'));
    document.getElementById('add-image-block').addEventListener('click', () => addBlock('image'));
    document.getElementById('add-video-block').addEventListener('click', () => addBlock('video'));
    document.getElementById('add-audio-block').addEventListener('click', () => addBlock('audio'));

    addBlock('text'); // Default block

    document.getElementById('submit-post-btn').addEventListener('click', async () => {
      const title = document.getElementById('post-title').value.trim();
      const category = document.getElementById('post-category').value;
      const description = document.getElementById('post-description').value.trim();

      // Handle Cover Upload
      let coverUrl = null;
      const coverFile = document.getElementById('post-cover-file').files[0];
      if (coverFile) {
        const coverFileName = `${store.user.id}/cover_${Date.now()}_${coverFile.name}`;
        const { error: coverErr } = await supabase.storage.from('media').upload(coverFileName, coverFile);
        if (!coverErr) {
          coverUrl = supabase.storage.from('media').getPublicUrl(coverFileName).data.publicUrl;
        }
      }

      if (!title) return alert("Title is required.");

      const finalBlocks = [];
      document.querySelectorAll('.builder-block').forEach(b => {
        const type = b.dataset.type;
        const content = b.querySelector('.block-content-input').value.trim();
        if (content) {
          const blockData = { type, content };
          if (type === 'text') {
            blockData.style = b.querySelector('.block-style-select').value;
          }
          finalBlocks.push(blockData);
        }
      });

      if (finalBlocks.length === 0 && !coverUrl) return alert("Add some content blocks.");

      const btn = document.getElementById('submit-post-btn');
      btn.innerText = "Publishing...";
      btn.disabled = true;

      const { error } = await supabase.from('posts').insert({
        title, category, description,
        cover_url: coverUrl,
        blocks: finalBlocks,
        content: description,
        user_id: store.user.id
      });

      if (error) {
        alert("Failed: " + error.message);
        btn.innerText = "Publish Gliim";
        btn.disabled = false;
      } else {
        modal.remove();
      }
    });
  },

  // ============================================
  // FETCH & RENDER BLOG FEED
  // ============================================
  async fetchPosts() {
    const [{ data: posts, error }, { data: interactions }, { data: profile }] = await Promise.all([
      supabase.from('posts').select(`id, title, category, description, cover_url, blocks, created_at, user_id, profiles:profiles!user_id(username, full_name, avatar_url)`).order('created_at', { ascending: false }).limit(20),
      supabase.from('hub_interactions').select('post_id, user_id, interaction_type, amount'),
      supabase.from('profiles').select('wallet_balance').eq('id', store.user.id).single()
    ]);

    if (error) { console.error(error); return; }
    this.userBalance = profile?.wallet_balance || 0;
    this.allInteractions = interactions || [];
    this.currentPosts = posts || [];

    this.renderPosts(this.currentPosts);
  },

  renderPosts(posts) {
    const container = document.getElementById('posts-container');
    if (!container) return;

    // Apply Filters
    let filtered = posts;
    if (this.currentFilter !== 'all') {
      filtered = filtered.filter(p => p.category === this.currentFilter);
    }
    if (this.searchQuery) {
      filtered = filtered.filter(p =>
        p.title?.toLowerCase().includes(this.searchQuery) ||
        p.description?.toLowerCase().includes(this.searchQuery) ||
        p.category?.toLowerCase().includes(this.searchQuery)
      );
    }

    if (filtered.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">No Gliims found.</p>';
      return;
    }

    // Apply Grid or List Class to Container
    container.className = `blog-feed ${this.viewStyle === 'grid' ? 'grid-view' : ''}`;

    container.innerHTML = filtered.map(post => {
      const avatar = post.profiles?.avatar_url
        ? `<img src="${post.profiles.avatar_url}" class="blog-avatar" style="object-fit:cover;">`
        : `<div class="blog-avatar">${post.profiles?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;

      const likes = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'like').length;
      const comments = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'comment').length;
      const supports = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'support').length;

      const coverHtml = post.cover_url ? `<div class="blog-cover" style="background-image: url('${post.cover_url}');"></div>` : '';

      return `
        <article class="blog-card" id="post-${post.id}" onclick="hubInstance.openReadView('${post.id}')">
          ${coverHtml}
          <div class="blog-content">
            <div class="blog-meta">
              <span class="blog-category">${post.category || 'General'}</span>
              <span class="blog-date">${new Date(post.created_at).toLocaleDateString([], {month: 'short', day: 'numeric'})}</span>
            </div>
            <h2 class="blog-title">${post.title || 'Untitled Gliim'}</h2>
            <p class="blog-desc">${post.description || ''}</p>

            <div class="blog-footer">
              <div class="blog-author">
                ${avatar}
                <span>${post.profiles?.full_name || 'Gliimait'}</span>
              </div>
              <div class="blog-stats">
                <span>${likes} Claps</span>
                <span>${comments} Comments</span>
                ${supports > 0 ? `<span>${supports} Supports</span>` : ''}
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');
  },

  // ============================================
  // READ VIEW (Modal)
  // ============================================
  openReadView(postId) {
    const post = this.currentPosts.find(p => p.id === postId);
    if (!post) return;

    const avatar = post.profiles?.avatar_url
      ? `<img src="${post.profiles.avatar_url}" class="blog-avatar" style="object-fit:cover;">`
      : `<div class="blog-avatar">${post.profiles?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;

    const likes = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'like').length;
    const hasLiked = this.allInteractions.some(i => i.post_id === post.id && i.user_id === store.user.id && i.interaction_type === 'like');
    const supports = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'support').length;

    let blocksHtml = '';
    if (post.blocks && post.blocks.length > 0) {
      blocksHtml = post.blocks.map(b => {
        if (b.type === 'text') {
          if (b.style === 'title') return `<h2 class="read-block-title">${b.content}</h2>`;
          if (b.style === 'subtitle') return `<h3 class="read-block-subtitle">${b.content}</h3>`;
          return `<p class="read-block-text">${b.content}</p>`;
        }
        if (b.type === 'image') return `<img src="${b.content}" class="read-block-media">`;
        if (b.type === 'video') return `<video src="${b.content}" class="read-block-media" controls></video>`;
        if (b.type === 'audio') return `<div class="read-block-audio-wrapper"><i class="fas fa-podcast"></i><audio src="${b.content}" class="read-block-audio" controls></audio></div>`;
        return '';
      }).join('');
    } else {
      blocksHtml = `<p class="read-block-text">${post.content || ''}</p>`;
    }

    const coverHtml = post.cover_url ? `<div class="read-cover" style="background-image: url('${post.cover_url}');"></div>` : '';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay read-view-overlay';
    modal.innerHTML = `
      <div class="modal-content read-view-content">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>

        ${coverHtml}

        <div class="read-body">
          <span class="blog-category">${post.category || 'General'}</span>
          <h1 class="read-title">${post.title || 'Untitled Gliim'}</h1>

          <div class="blog-author" style="margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
            ${avatar}
            <div>
              <span style="font-weight: 700; color: var(--text-primary);">${post.profiles?.full_name || 'Gliimait'}</span><br>
              <span style="font-size: 12px; color: var(--text-muted);">${new Date(post.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          ${blocksHtml}

          <div class="post-actions-bar" style="margin-top: 40px; border-top: 1px solid var(--border); padding-top: 24px;">
            <button class="action-btn like-btn ${hasLiked ? 'liked' : ''}" onclick="hubInstance.toggleLike('${post.id}')">
              <img src="/icons/gliim.svg" alt="Clap" class="action-icon-img" style="width:18px; height:18px;">
              <span>${likes}</span>
            </button>
            <button class="action-btn" onclick="hubInstance.sharePost('${post.id}', '${post.title}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
            </button>
            <button class="action-btn support-btn" onclick="hubInstance.supportCreator('${post.id}', '${post.user_id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
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
    this.renderPosts(this.currentPosts);

    const likeBtn = document.querySelector('.read-view-content .like-btn span');
    if (likeBtn) {
      const likes = this.allInteractions.filter(i => i.post_id === postId && i.interaction_type === 'like').length;
      likeBtn.innerText = likes;
      const btnParent = document.querySelector('.read-view-content .like-btn');
      const hasLiked = this.allInteractions.some(i => i.post_id === postId && i.user_id === store.user.id && i.interaction_type === 'like');
      if (btnParent) btnParent.classList.toggle('liked', hasLiked);
    }
  },

  sharePost(postId, title) {
    this.logInteraction(postId, 'share');
    if (navigator.share) { navigator.share({ title: title || 'Gliimu Post', url: window.location.href }).catch(() => {}); } else { alert("Share link copied."); }
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
        this.fetchPosts();
      })
      .subscribe();
  }
};
