import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Hub',
  template: `
    <div class="hub-layout">
      <div class="blog-feed" id="posts-container">
        <p class="hub-empty-state" style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">Loading published Gliims...</p>
      </div>

      <div class="hub-fab-wrapper">
        <button class="hub-fab-main" id="hub-fab-main">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
    </div>
  `,

  init() {
    this.currentPosts = [];
    this.allInteractions = [];
    this.savedPosts = new Set();
    this.searchQuery = '';
    this.currentFilter = 'all';
    this.viewStyle = localStorage.getItem('hub-view') || 'list';

    window.hubInstance = {
      openReadView: (id) => this.openReadView(id),
      toggleLike: (id) => this.toggleLike(id),
      sharePost: (id, title) => this.sharePost(id, title),
      scrollToComments: (id) => this.scrollToComments(id),
      submitComment: (id) => this.submitComment(id),
      supportCreator: (id, authorId) => this.supportCreator(id, authorId),
      showUserMenu: (e, userId, postId, fullName) => this.showUserMenu(e, userId, postId, fullName),
      closeUserMenu: () => this.closeUserMenu(),
      toggleSavePost: (id) => this.toggleSavePost(id),
      toggleReadMenu: (id) => this.toggleReadMenu(id),
      closeModal: () => this.closeModal(),
      addBlock: (type) => this.addBlock(type)
    };

    this.setupTopbarSearch();
    this.setupTopbarActions();
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

  setupTopbarActions() {
    const rightActions = document.getElementById('topbar-right-actions');
    if (rightActions) {
      rightActions.innerHTML = `
        <div class="view-toggle-wrapper">
          <button class="view-toggle-btn" data-view="list" title="List View">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
          </button>
          <button class="view-toggle-btn" data-view="grid" title="Grid View">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          </button>
        </div>
        <div class="lib-filter-wrapper">
          <button class="lib-filter-btn" id="hub-filter-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
          </button>
          <div class="lib-dropdown-menu" id="hub-dropdown">
            <div class="lib-dropdown-item active" data-filter="all">All Gliims</div>
            <div class="lib-dropdown-item" data-filter="saved">Saved Gliims</div>
            <div class="lib-dropdown-item" data-filter="Media">Media</div>
            <div class="lib-dropdown-item" data-filter="Tech">Tech</div>
            <div class="lib-dropdown-item" data-filter="Business">Business</div>
            <div class="lib-dropdown-item" data-filter="Personal">Personal</div>
            <div class="lib-dropdown-item" data-filter="Education">Education</div>
          </div>
        </div>
      `;

      const activeBtn = document.querySelector(`.view-toggle-btn[data-view="${this.viewStyle}"]`);
      if (activeBtn) activeBtn.classList.add('active');

      document.getElementById('hub-filter-btn').addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        document.getElementById('hub-dropdown').classList.toggle('active');
      });
      document.querySelectorAll('#hub-dropdown .lib-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('#hub-dropdown .lib-dropdown-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          this.currentFilter = item.dataset.filter;
          document.getElementById('hub-dropdown').classList.remove('active');
          this.renderPosts(this.currentPosts);
        });
      });

      document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          this.viewStyle = e.currentTarget.dataset.view;
          localStorage.setItem('hub-view', this.viewStyle);
          this.renderPosts(this.currentPosts);
        });
      });
    }
  },

  setupFab() {
    document.getElementById('hub-fab-main').addEventListener('click', () => this.openCreateModal());
  },

  closeModal() {
    document.querySelector('.modal-overlay')?.remove();
  },

  closeUserMenu() {
    document.querySelectorAll('.context-menu').forEach(m => m.remove());
  },

  showUserMenu(e, userId, postId, fullName) {
    e.stopPropagation();
    this.closeUserMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.innerHTML = `
      <div class="ctx-item" onclick="hubInstance.replyToUser('${postId}', '${fullName}')">Reply</div>
      <div class="ctx-item" onclick="window.location.hash='#/portfolio'; hubInstance.closeUserMenu()">View Profile</div>
      <div class="ctx-item" onclick="alert('User reported.'); hubInstance.closeUserMenu()">Report</div>
    `;
    document.body.appendChild(menu);

    setTimeout(() => {
      document.addEventListener('click', this.closeUserMenu, { once: true });
    }, 0);
  },

  replyToUser(postId, fullName) {
    this.closeUserMenu();
    const input = document.getElementById(`comment-text-${postId}`);
    if (input) {
      input.value = `@${fullName} `;
      input.focus();
    }
  },

  openCreateModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content gliim-builder">
        <button class="modal-close" onclick="hubInstance.closeModal()">×</button>
        <h2 style="margin-bottom: 24px;">Publish a Gliim</h2>
        <div class="form-group"><label>Title</label><input type="text" id="post-title" class="input" placeholder="An elite headline..."></div>
        <div class="form-row" style="gap: 16px;">
          <div class="form-group" style="flex: 1;"><label>Category</label><select id="post-category" class="input"><option>Media</option><option>Tech</option><option>Business</option><option>Personal</option><option>Education</option></select></div>
          <div class="form-group" style="flex: 2;"><label>Description (SEO Summary)</label><input type="text" id="post-description" class="input" placeholder="Brief summary..."></div>
        </div>
        <hr style="border: none; border-top: 1px solid var(--border); margin: 24px 0;">
        <h3 style="margin-bottom: 16px;">Content Blocks</h3>
        <div id="blocks-container" style="display: flex; flex-direction: column; gap: 16px;"></div>

        <div class="builder-add-dropdown">
          <button class="btn-secondary" id="add-block-trigger">+ Add Block</button>
          <div class="dropdown-menu" id="add-block-menu">
            <div onclick="hubInstance.addBlock('text')"><span style="font-weight:700;">Aa</span> Text</div>
            <div onclick="hubInstance.addBlock('image')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg> Image</div>
            <div onclick="hubInstance.addBlock('video')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg> Video</div>
            <div onclick="hubInstance.addBlock('audio')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg> Audio</div>
          </div>
        </div>

        <button id="submit-post-btn" class="btn-primary" style="width: 100%; margin-top: 32px;">Publish Gliim</button>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('add-block-trigger').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('add-block-menu').classList.toggle('active');
    });
    document.addEventListener('click', () => {
      document.getElementById('add-block-menu')?.classList.remove('active');
    });

    this.addBlock('text'); // Default block

    document.getElementById('submit-post-btn').addEventListener('click', async () => {
      const title = document.getElementById('post-title').value.trim();
      const category = document.getElementById('post-category').value;
      const description = document.getElementById('post-description').value.trim();

      if (!title) return alert("Title is required.");

      const finalBlocks = [];
      let coverUrl = null;

      document.querySelectorAll('.builder-block').forEach(b => {
        const type = b.dataset.type;
        const content = b.querySelector('.block-content-input').value.trim();
        if (content) {
          const blockData = { type, content };
          if (type === 'text') blockData.style = b.querySelector('.block-style-select').value;
          finalBlocks.push(blockData);

          // Set first image/video as cover
          if (!coverUrl && (type === 'image' || type === 'video')) {
            coverUrl = content;
          }
        }
      });

      if (finalBlocks.length === 0) return alert("Add some content blocks.");

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

  addBlock(type) {
    document.getElementById('add-block-menu')?.classList.remove('active');
    const blocksContainer = document.getElementById('blocks-container');
    const blockDiv = document.createElement('div');
    blockDiv.className = 'builder-block'; blockDiv.dataset.type = type;

    let iconHtml = '';
    if (type === 'text') iconHtml = '<span style="font-weight:700; font-size: 14px;">Aa</span>';
    if (type === 'image') iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
    if (type === 'video') iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>';
    if (type === 'audio') iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg>';

    let inputHtml = '';
    if (type === 'text') {
      inputHtml = `<select class="input block-style-select" style="margin-bottom: 8px;"><option value="paragraph">Paragraph</option><option value="title">Title</option><option value="subtitle">Subtitle</option><option value="list">List</option></select><textarea class="input block-content-input" placeholder="Write your text..." rows="4"></textarea>`;
    } else {
      const accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'audio/*';
      inputHtml = `
        <label class="custom-file-upload">
          <img src="/icons/clip.svg" class="upload-icon-img" alt="Upload">
          <span class="block-file-name">Choose ${type}</span>
          <input type="file" class="block-file-input" accept="${accept}" hidden>
        </label>
        <div class="upload-status" style="font-size: 12px; margin-top: 8px;"></div>
        <div class="block-preview"></div>
        <input type="hidden" class="block-content-input">
      `;
    }

    blockDiv.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;"><span class="block-label">${iconHtml}</span><button class="block-remove-btn" onclick="this.parentElement.parentElement.remove()">−</button></div>${inputHtml}`;
    blocksContainer.appendChild(blockDiv);

    if (type !== 'text') {
      blockDiv.querySelector('.block-file-input').addEventListener('change', async (e) => {
        if (e.target.files[0]) {
          blockDiv.querySelector('.block-file-name').innerText = e.target.files[0].name;
          const statusEl = blockDiv.querySelector('.upload-status');
          const hiddenInput = blockDiv.querySelector('.block-content-input');
          statusEl.innerText = "Uploading..."; statusEl.style.color = "var(--brand-primary)";
          const fileName = `${store.user.id}/${Date.now()}_${e.target.files[0].name}`;
          const { error } = await supabase.storage.from('media').upload(fileName, e.target.files[0]);
          if (error) { statusEl.innerText = "Upload failed."; statusEl.style.color = "var(--error)"; return; }
          const { data } = supabase.storage.from('media').getPublicUrl(fileName);
          hiddenInput.value = data.publicUrl;
          statusEl.innerText = "Upload complete!"; statusEl.style.color = "var(--success)";
          const preview = blockDiv.querySelector('.block-preview');
          preview.innerHTML = type === 'image' ? `<img src="${data.publicUrl}" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">` : `<div style="background:var(--bg-tertiary);padding:8px;border-radius:8px;margin-top:8px;font-size:12px;">File ready</div>`;
        }
      });
    }
  },

  async fetchPosts() {
    const [{ data: posts, error }, { data: interactions }, { data: profile }, { data: saved }] = await Promise.all([
      supabase.from('posts').select(`id, title, category, description, cover_url, blocks, created_at, user_id, profiles:profiles!user_id(full_name, avatar_url, total_gp)`).order('created_at', { ascending: false }).limit(20),
      supabase.from('hub_interactions').select('id, post_id, user_id, interaction_type, amount, comment_text, profiles:profiles!user_id(full_name, avatar_url)'),
      supabase.from('profiles').select('wallet_balance, total_gp').eq('id', store.user.id).single(),
      supabase.from('saved_posts').select('post_id').eq('user_id', store.user.id)
    ]);
    if (error) { console.error(error); return; }
    this.userBalance = profile?.wallet_balance || 0;
    this.userGP = profile?.total_gp || 0;
    this.allInteractions = interactions || [];
    this.currentPosts = posts || [];
    this.savedPosts = new Set(saved?.map(s => s.post_id) || []);
    this.renderPosts(this.currentPosts);
  },

  renderPosts(posts) {
    const container = document.getElementById('posts-container');
    if (!container) return;
    let filtered = posts;
    if (this.currentFilter === 'saved') {
      filtered = filtered.filter(p => this.savedPosts.has(p.id));
    } else if (this.currentFilter !== 'all') {
      filtered = filtered.filter(p => p.category === this.currentFilter);
    }
    if (this.searchQuery) filtered = filtered.filter(p => p.title?.toLowerCase().includes(this.searchQuery) || p.description?.toLowerCase().includes(this.searchQuery) || p.category?.toLowerCase().includes(this.searchQuery));
    if (filtered.length === 0) { container.innerHTML = '<p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">No Gliims found.</p>'; return; }

    container.className = `blog-feed ${this.viewStyle === 'grid' ? 'grid-view' : ''}`;
    container.innerHTML = filtered.map(post => {
      const avatarClass = post.profiles?.total_gp >= 1000 ? 'blog-avatar glow-avatar' : 'blog-avatar';
      const avatar = post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="${avatarClass}" style="object-fit:cover;">` : `<div class="${avatarClass}">${post.profiles?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;

      const likes = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'like').length;
      const comments = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'comment').length;
      const coverHtml = post.cover_url ? `<div class="blog-cover" style="background-image: url('${post.cover_url}');"></div>` : '';
      return `<article class="blog-card" id="post-${post.id}" onclick="hubInstance.openReadView('${post.id}')">${coverHtml}<div class="blog-content"><div class="blog-meta"><span class="blog-category">${post.category || 'General'}</span><span class="blog-date">${new Date(post.created_at).toLocaleDateString([], {month: 'short', day: 'numeric'})}</span></div><h2 class="blog-title">${post.title || 'Untitled Gliim'}</h2><p class="blog-desc">${post.description || ''}</p><div class="blog-footer"><div class="blog-author"><div style="position:relative;">${avatar}</div><span>${post.profiles?.full_name || 'Gliimait'}</span></div><div class="blog-stats"><span>${likes} Claps</span><span>${comments} Comments</span></div></div></div></article>`;
    }).join('');
  },

  parseTags(text) {
    if (!text) return '';
    return text.replace(/@([a-zA-Z0-9_ ]+)/g, (match, name) => `<span class="comment-tag">${match}</span>`);
  },

  openReadView(postId) {
    const post = this.currentPosts.find(p => p.id === postId);
    if (!post) return;

    const avatarClass = post.profiles?.total_gp >= 1000 ? 'blog-avatar glow-avatar' : 'blog-avatar';
    const avatar = post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="${avatarClass}" style="object-fit:cover;">` : `<div class="${avatarClass}">${post.profiles?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;

    const likes = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'like').length;
    const comments = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'comment').length;
    const shares = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'share').length;
    const supports = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'support').length;
    const hasLiked = this.allInteractions.some(i => i.post_id === post.id && i.user_id === store.user.id && i.interaction_type === 'like');
    const isSaved = this.savedPosts.has(post.id);

    const postComments = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'comment');
    let commentsHtml = '<p style="font-size: 13px; color: var(--text-muted);">No comments yet.</p>';
    if (postComments.length > 0) {
      commentsHtml = postComments.map(c => {
        const cAvatarClass = c.profiles?.total_gp >= 1000 ? 'comment-avatar glow-avatar' : 'comment-avatar';
        const cAvatar = c.profiles?.avatar_url ? `<img src="${c.profiles.avatar_url}" class="${cAvatarClass}" style="object-fit:cover;" onclick="hubInstance.showUserMenu(event, '${c.user_id}', '${post.id}', '${c.profiles?.full_name || 'Gliimait'}')">` : `<div class="${cAvatarClass}" onclick="hubInstance.showUserMenu(event, '${c.user_id}', '${post.id}', '${c.profiles?.full_name || 'Gliimait'}')">${c.profiles?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
        const parsedText = this.parseTags(c.comment_text);
        return `<div class="comment-item" id="comment-${c.id}">${cAvatar}<div class="comment-content-wrap"><span class="comment-author">${c.profiles?.full_name || 'Gliimait'}</span><p class="comment-text">${parsedText}</p></div></div>`;
      }).join('');
    }

    let blocksHtml = '';
    if (post.blocks && post.blocks.length > 0) {
      blocksHtml = post.blocks.map(b => {
        if (b.type === 'text') {
          if (b.style === 'title') return `<h2 class="read-block-title">${b.content}</h2>`;
          if (b.style === 'subtitle') return `<h3 class="read-block-subtitle">${b.content}</h3>`;
          if (b.style === 'list') {
            const items = b.content.split('\n').map(line => `<li>${line}</li>`).join('');
            return `<ul class="read-block-list">${items}</ul>`;
          }
          return `<p class="read-block-text">${b.content}</p>`;
        }
        if (b.type === 'image') return `<img src="${b.content}" class="read-block-media">`;
        if (b.type === 'video') return `<video src="${b.content}" class="read-block-media" controls></video>`;
        if (b.type === 'audio') return `<div class="read-block-audio-wrapper"><i class="fas fa-podcast"></i><audio src="${b.content}" class="read-block-audio" controls></audio></div>`;
        return '';
      }).join('');
    } else { blocksHtml = `<p class="read-block-text">${post.content || ''}</p>`; }
    const coverHtml = post.cover_url ? `<div class="read-cover" style="background-image: url('${post.cover_url}');"></div>` : '';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay read-view-overlay';
    modal.innerHTML = `
      <div class="modal-content read-view-content">

        <div class="read-top-bar">
          <div class="lib-modal-menu">
            <button class="lib-menu-btn" onclick="hubInstance.toggleReadMenu('${post.id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
            </button>
            <div class="lib-menu-dropdown" id="read-menu-${post.id}">
              <div class="lib-menu-item" onclick="hubInstance.toggleSavePost('${post.id}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                ${isSaved ? 'Unsave Gliim' : 'Save Gliim'}
              </div>
              <div class="lib-menu-item" onclick="alert('Content reported.'); hubInstance.toggleReadMenu('${post.id}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
                Report Gliim
              </div>
              <div class="lib-menu-item danger" onclick="hubInstance.closeModal()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                Close
              </div>
            </div>
          </div>
        </div>

        <div class="read-scroll-container">
          ${coverHtml}
          <div class="read-body">
            <span class="blog-category">${post.category || 'General'}</span>
            <h1 class="read-title">${post.title || 'Untitled Gliim'}</h1>
            <div class="blog-author" style="margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
              <div style="position:relative;">${avatar}</div>
              <div>
                <span style="font-weight: 700; color: var(--text-primary); display: flex; align-items: center;">${post.profiles?.full_name || 'Gliimait'}</span><br>
                <span style="font-size: 12px; color: var(--text-muted);">${new Date(post.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            ${blocksHtml}

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
        </div>

        <div class="read-bottom-bar">
          <button class="action-btn like-btn ${hasLiked ? 'liked' : ''}" onclick="hubInstance.toggleLike('${post.id}')">
            <img src="/icons/clap.svg" class="action-icon-img" alt="Clap" loading="eager" decoding="async">
            <span>${likes}</span>
          </button>
          <button class="action-btn" onclick="hubInstance.scrollToComments('${post.id}')">
            <img src="/icons/comment.svg" class="action-icon-img" alt="Comment" loading="eager" decoding="async">
            <span>${comments}</span>
          </button>
          <button class="action-btn" onclick="hubInstance.sharePost('${post.id}', '${post.title}')">
            <img src="/icons/share.svg" class="action-icon-img" alt="Share" loading="eager" decoding="async">
            <span>${shares}</span>
          </button>
          <button class="action-btn support-btn" onclick="hubInstance.supportCreator('${post.id}', '${post.user_id}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <span>${supports}</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  toggleReadMenu(postId) {
    const menu = document.getElementById(`read-menu-${postId}`);
    if (menu) menu.classList.toggle('active');
  },

  async toggleSavePost(postId) {
    if (this.savedPosts.has(postId)) {
      await supabase.from('saved_posts').delete().eq('user_id', store.user.id).eq('post_id', postId);
      this.savedPosts.delete(postId);
      alert("Gliim unsaved.");
    } else {
      await supabase.from('saved_posts').insert({ user_id: store.user.id, post_id: postId });
      this.savedPosts.add(postId);
      alert("Gliim saved! Find it in the 'Saved Gliims' filter.");
    }
    this.toggleReadMenu(postId);
    this.renderPosts(this.currentPosts);
  },

  scrollToComments(postId) {
    const section = document.getElementById(`comment-section-${postId}`);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById(`comment-text-${postId}`).focus();
    }
  },

  async supportCreator(postId, authorId) {
    if (authorId === store.user.id) return alert("You cannot support yourself!");
    const amountStr = prompt("Enter support amount (NGN):");
    if (!amountStr) return;
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount <= 0) return alert("Invalid amount.");

    const { data: profile } = await supabase.from('profiles').select('wallet_balance').eq('id', store.user.id).single();
    if (profile.wallet_balance < amount) return alert("Insufficient funds. Please top up your wallet.");

    await supabase.from('profiles').update({ wallet_balance: profile.wallet_balance - amount }).eq('id', store.user.id);
    await supabase.rpc('increment_wallet', { user_id: authorId, amount: amount });
    await supabase.from('transactions').insert({ user_id: store.user.id, amount: -amount, type: 'support', status: 'success', description: `Hub Support` });

    const { data } = await supabase.from('hub_interactions').insert({ post_id: postId, user_id: store.user.id, interaction_type: 'support', amount: amount }).select('*').single();
    if (data) this.allInteractions.push(data);

    alert(`Supported successfully!`);
    this.closeModal();
    this.openReadView(postId);
  },

  async toggleLike(postId) {
    const post = this.currentPosts.find(p => p.id === postId);
    const existingLike = this.allInteractions.find(i => i.post_id === postId && i.user_id === store.user.id && i.interaction_type === 'like');
    if (existingLike) {
      await supabase.from('hub_interactions').delete().eq('id', existingLike.id);
      this.allInteractions = this.allInteractions.filter(i => i.id !== existingLike.id);
    } else {
      const { data } = await supabase.from('hub_interactions').insert({ post_id: postId, user_id: store.user.id, interaction_type: 'like' }).select('*').single();
      if (data) this.allInteractions.push(data);
      if (post && post.user_id !== store.user.id) await supabase.rpc('add_gp', { target_user_id: post.user_id, points_to_add: 3 });
    }
    this.renderPosts(this.currentPosts);
    this.closeModal();
    this.openReadView(postId);
  },

  async submitComment(postId) {
    const input = document.getElementById(`comment-text-${postId}`);
    const text = input.value.trim();
    if (!text) return;

    const post = this.currentPosts.find(p => p.id === postId);
    const { data } = await supabase.from('hub_interactions').insert({ post_id: postId, user_id: store.user.id, interaction_type: 'comment', comment_text: text }).select('*').single();

    if (data) {
      data.profiles = { full_name: store.profile.full_name, avatar_url: store.profile.avatar_url, total_gp: store.profile.total_gp };
      this.allInteractions.push(data);
      const list = document.getElementById(`comment-list-${postId}`);
      const cAvatarClass = data.profiles.total_gp >= 1000 ? 'comment-avatar glow-avatar' : 'comment-avatar';
      const cAvatar = data.profiles.avatar_url ? `<img src="${data.profiles.avatar_url}" class="${cAvatarClass}" style="object-fit:cover;" onclick="hubInstance.showUserMenu(event, '${data.user_id}', '${postId}', '${data.profiles.full_name}')">` : `<div class="${cAvatarClass}" onclick="hubInstance.showUserMenu(event, '${data.user_id}', '${postId}', '${data.profiles.full_name}')">${data.profiles.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
      const parsedText = this.parseTags(text);
      list.innerHTML += `<div class="comment-item" id="comment-${data.id}">${cAvatar}<div class="comment-content-wrap"><span class="comment-author">${data.profiles.full_name}</span><p class="comment-text">${parsedText}</p></div></div>`;
      input.value = "";
    }
    if (post && post.user_id !== store.user.id) await supabase.rpc('add_gp', { target_user_id: post.user_id, points_to_add: 4 });
  },

  async sharePost(postId, title) {
    const { data } = await supabase.from('hub_interactions').insert({ post_id: postId, user_id: store.user.id, interaction_type: 'share' }).select('*').single();
    if (data) this.allInteractions.push(data);
    const post = this.currentPosts.find(p => p.id === postId);
    if (post && post.user_id !== store.user.id) await supabase.rpc('add_gp', { target_user_id: post.user_id, points_to_add: 5 });

    this.closeModal();
    this.openReadView(postId);
    if (navigator.share) { navigator.share({ title: title || 'Gliimu Post', url: window.location.href }).catch(() => {}); } else { alert("Share link copied!"); }
  },

  setupRealtime() {
    supabase.removeChannel(supabase.channel('public:posts'));
    supabase.channel('public:posts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => { this.fetchPosts(); }).subscribe();
  }
};
