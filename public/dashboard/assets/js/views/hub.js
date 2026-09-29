import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Hub',
  template: `
    <div class="hub-layout">
      <div class="hub-subheader">
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
            <div class="lib-dropdown-item active" data-filter="all">All Categories</div>
            <div class="lib-dropdown-item" data-filter="Media">Media</div>
            <div class="lib-dropdown-item" data-filter="Tech">Tech</div>
            <div class="lib-dropdown-item" data-filter="Business">Business</div>
            <div class="lib-dropdown-item" data-filter="Personal">Personal</div>
            <div class="lib-dropdown-item" data-filter="Education">Education</div>
          </div>
        </div>
      </div>

      <div class="blog-feed" id="posts-container">
        <p class="hub-empty-state" style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">Loading published Gliims...</p>
      </div>

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
    this.viewStyle = localStorage.getItem('hub-view') || 'list';
    this.userGP = 0;

    window.hubInstance = {
      openReadView: (id) => this.openReadView(id),
      toggleLike: (id) => this.toggleLike(id),
      sharePost: (id, title) => this.sharePost(id, title),
      toggleCommentBox: (id) => this.toggleCommentBox(id),
      submitComment: (id) => this.submitComment(id),
      toggleHubMenu: (id) => this.toggleHubMenu(id),
      deletePost: (id) => this.deletePost(id),
      deleteComment: (cId, pId) => this.deleteComment(cId, pId),
      openLiveSetup: () => this.openLiveSetup(),
      joinLive: (id) => this.joinLive(id),
      addLiveBlock: (id, type) => this.addLiveBlock(id, type),
      endLive: (id) => this.endLive(id),
      sendLiveChat: (postId) => this.sendLiveChat(postId),
      handleLiveInteraction: (postId, type) => this.handleLiveInteraction(postId, type),
      toggleMute: (type) => this.toggleMute(type),
      toggleScreenShare: () => this.toggleScreenShare(),
      toggleAudioOnly: () => this.toggleAudioOnly()
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
      e.stopPropagation(); fabMenu.style.display = 'none'; this.openCreateModal();
    });

    document.getElementById('fab-live-btn').addEventListener('click', (e) => {
      e.stopPropagation(); fabMenu.style.display = 'none';
      if (this.userGP >= 1000) {
        this.openLiveSetup();
      } else {
        alert('Only eligible gliimaits can do a live post. Earn 1000 GPS to become eligible.');
      }
    });
  },

  openCreateModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content gliim-builder">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        <h2 style="margin-bottom: 24px;">Publish a Gliim</h2>
        <div class="form-group"><label>Title</label><input type="text" id="post-title" class="input" placeholder="An elite headline..."></div>
        <div class="form-row" style="gap: 16px;">
          <div class="form-group" style="flex: 1;"><label>Category</label><select id="post-category" class="input"><option>Media</option><option>Tech</option><option>Business</option><option>Personal</option><option>Education</option></select></div>
          <div class="form-group" style="flex: 2;"><label>Description (SEO Summary)</label><input type="text" id="post-description" class="input" placeholder="Brief summary..."></div>
        </div>

        <div class="form-group">
          <label>Cover Image</label>
          <label class="custom-file-upload">
            <img src="/icons/clip.svg" class="upload-icon-img" alt="Upload">
            <span id="cover-file-name">Choose File</span>
            <input type="file" id="post-cover-file" accept="image/*" hidden>
          </label>
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

    document.getElementById('post-cover-file').addEventListener('change', (e) => {
      const fileName = e.target.files[0]?.name || 'Choose File';
      document.getElementById('cover-file-name').innerText = fileName;
    });

    const blocksContainer = document.getElementById('blocks-container');

    const handleFileUpload = async (file, blockDiv, type) => {
      const statusEl = blockDiv.querySelector('.upload-status');
      const hiddenInput = blockDiv.querySelector('.block-content-input');
      statusEl.innerText = "Uploading..."; statusEl.style.color = "var(--brand-primary)";
      const fileName = `${store.user.id}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('media').upload(fileName, file);
      if (error) { statusEl.innerText = "Upload failed."; statusEl.style.color = "var(--error)"; return false; }
      const { data } = supabase.storage.from('media').getPublicUrl(fileName);
      hiddenInput.value = data.publicUrl;
      statusEl.innerText = "Upload complete!"; statusEl.style.color = "var(--success)";
      const preview = blockDiv.querySelector('.block-preview');
      preview.innerHTML = type === 'image' ? `<img src="${data.publicUrl}" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">` : `<div style="background:var(--bg-tertiary);padding:8px;border-radius:8px;margin-top:8px;font-size:12px;">File ready: ${file.name}</div>`;
      return true;
    };

    const addBlock = (type) => {
      const blockDiv = document.createElement('div');
      blockDiv.className = 'builder-block'; blockDiv.dataset.type = type;
      let inputHtml = '';
      if (type === 'text') {
        inputHtml = `<select class="input block-style-select" style="margin-bottom: 8px;"><option value="paragraph">Paragraph</option><option value="title">Title</option><option value="subtitle">Subtitle</option></select><textarea class="input block-content-input" placeholder="Write your text..." rows="4"></textarea>`;
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
      blockDiv.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;"><span class="block-label">${type.toUpperCase()}</span><button class="block-remove-btn" onclick="this.parentElement.parentElement.remove()">Remove</button></div>${inputHtml}`;
      blocksContainer.appendChild(blockDiv);

      if (type !== 'text') {
        const fileInput = blockDiv.querySelector('.block-file-input');
        const fileNameEl = blockDiv.querySelector('.block-file-name');
        fileInput.addEventListener('change', (e) => {
          if (e.target.files[0]) {
            fileNameEl.innerText = e.target.files[0].name;
            handleFileUpload(e.target.files[0], blockDiv, type);
          }
        });
      }
    };

    document.getElementById('add-text-block').addEventListener('click', () => addBlock('text'));
    document.getElementById('add-image-block').addEventListener('click', () => addBlock('image'));
    document.getElementById('add-video-block').addEventListener('click', () => addBlock('video'));
    document.getElementById('add-audio-block').addEventListener('click', () => addBlock('audio'));
    addBlock('text');

    document.getElementById('submit-post-btn').addEventListener('click', async () => {
      const title = document.getElementById('post-title').value.trim();
      const category = document.getElementById('post-category').value;
      const description = document.getElementById('post-description').value.trim();
      let coverUrl = null;
      const coverFile = document.getElementById('post-cover-file').files[0];
      if (coverFile) {
        const coverFileName = `${store.user.id}/cover_${Date.now()}_${coverFile.name}`;
        const { error: coverErr } = await supabase.storage.from('media').upload(coverFileName, coverFile);
        if (!coverErr) coverUrl = supabase.storage.from('media').getPublicUrl(coverFileName).data.publicUrl;
      }
      if (!title) return alert("Title is required.");
      const finalBlocks = [];
      document.querySelectorAll('.builder-block').forEach(b => {
        const type = b.dataset.type; const content = b.querySelector('.block-content-input').value.trim();
        if (content) { const blockData = { type, content }; if (type === 'text') blockData.style = b.querySelector('.block-style-select').value; finalBlocks.push(blockData); }
      });
      if (finalBlocks.length === 0 && !coverUrl) return alert("Add some content blocks.");
      const btn = document.getElementById('submit-post-btn'); btn.innerText = "Publishing..."; btn.disabled = true;
      const { error } = await supabase.from('posts').insert({ title, category, description, cover_url: coverUrl, blocks: finalBlocks, content: description, user_id: store.user.id });
      if (error) { alert("Failed: " + error.message); btn.innerText = "Publish Gliim"; btn.disabled = false; } else { modal.remove(); }
    });
  },

  async fetchPosts() {
    const [{ data: posts, error }, { data: interactions }, { data: profile }] = await Promise.all([
      supabase.from('posts').select(`id, title, category, description, cover_url, blocks, created_at, user_id, is_live, profiles:profiles!user_id(full_name, avatar_url, total_gp)`).order('created_at', { ascending: false }).limit(20),
      supabase.from('hub_interactions').select('id, post_id, user_id, interaction_type, amount, comment_text, profiles:profiles!user_id(full_name, avatar_url)'),
      supabase.from('profiles').select('wallet_balance, total_gp').eq('id', store.user.id).single()
    ]);
    if (error) { console.error(error); return; }
    this.userBalance = profile?.wallet_balance || 0;
    this.userGP = profile?.total_gp || 0;
    this.allInteractions = interactions || [];
    this.currentPosts = posts || [];
    this.renderPosts(this.currentPosts);
  },

  renderPosts(posts) {
    const container = document.getElementById('posts-container');
    if (!container) return;
    let filtered = posts;
    if (this.currentFilter !== 'all') filtered = filtered.filter(p => p.category === this.currentFilter);
    if (this.searchQuery) filtered = filtered.filter(p => p.title?.toLowerCase().includes(this.searchQuery) || p.description?.toLowerCase().includes(this.searchQuery) || p.category?.toLowerCase().includes(this.searchQuery));
    if (filtered.length === 0) { container.innerHTML = '<p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">No Gliims found.</p>'; return; }
    container.className = `blog-feed ${this.viewStyle === 'grid' ? 'grid-view' : ''}`;
    container.innerHTML = filtered.map(post => {
      const avatar = post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="blog-avatar" style="object-fit:cover;">` : `<div class="blog-avatar">${post.profiles?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
      const star = post.profiles?.total_gp >= 1000 ? '<img src="/icons/star.svg" class="inline-star">' : '';
      const likes = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'like').length;
      const comments = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'comment').length;
      const coverHtml = post.cover_url ? `<div class="blog-cover" style="background-image: url('${post.cover_url}');"></div>` : '';

      const liveBadge = post.is_live ? '<span class="live-badge">LIVE</span>' : '';
      const onClickAction = post.is_live ? `hubInstance.joinLive('${post.id}')` : `hubInstance.openReadView('${post.id}')`;

      return `<article class="blog-card" id="post-${post.id}" onclick="${onClickAction}">${coverHtml}<div class="blog-content"><div class="blog-meta"><span class="blog-category">${post.category || 'General'}</span><span class="blog-date">${new Date(post.created_at).toLocaleDateString([], {month: 'short', day: 'numeric'})}</span>${liveBadge}</div><h2 class="blog-title">${post.title || 'Untitled Gliim'}</h2><p class="blog-desc">${post.description || ''}</p><div class="blog-footer"><div class="blog-author"><div style="position:relative;">${avatar}</div><span>${post.profiles?.full_name || 'Gliimait'} ${star}</span></div><div class="blog-stats"><span>${likes} Claps</span><span>${comments} Comments</span></div></div></div></article>`;
    }).join('');
  },

  parseTags(text) {
    if (!text) return '';
    return text.replace(/@([a-zA-Z0-9_ ]+)/g, (match, name) => {
      return `<span class="comment-tag">${match}</span>`;
    });
  },

  openReadView(postId) {
    const post = this.currentPosts.find(p => p.id === postId);
    if (!post) return;
    const avatar = post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="blog-avatar" style="object-fit:cover;">` : `<div class="blog-avatar">${post.profiles?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
    const star = post.profiles?.total_gp >= 1000 ? '<img src="/icons/star.svg" class="inline-star">' : '';

    const likes = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'like').length;
    const comments = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'comment').length;
    const shares = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'share').length;
    const hasLiked = this.allInteractions.some(i => i.post_id === post.id && i.user_id === store.user.id && i.interaction_type === 'like');

    const postComments = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'comment');
    let commentsHtml = '<p style="font-size: 13px; color: var(--text-muted);">No comments yet.</p>';
    if (postComments.length > 0) {
      commentsHtml = postComments.map(c => {
        const cAvatar = c.profiles?.avatar_url ? `<img src="${c.profiles.avatar_url}" class="comment-avatar" style="object-fit:cover;">` : `<div class="comment-avatar">${c.profiles?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
        const parsedText = this.parseTags(c.comment_text);
        const isMyComment = c.user_id === store.user.id;
        const deleteBtn = isMyComment ? `<button class="comment-delete-btn" onclick="event.stopPropagation(); hubInstance.deleteComment('${c.id}', '${post.id}')"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : '';
        return `<div class="comment-item" id="comment-${c.id}">${cAvatar}<div class="comment-content-wrap"><span class="comment-author">${c.profiles?.full_name || 'Gliimait'}</span><p class="comment-text">${parsedText}</p></div>${deleteBtn}</div>`;
      }).join('');
    }

    let blocksHtml = '';
    if (post.blocks && post.blocks.length > 0) {
      blocksHtml = post.blocks.map(b => {
        if (b.type === 'text') { if (b.style === 'title') return `<h2 class="read-block-title">${b.content}</h2>`; if (b.style === 'subtitle') return `<h3 class="read-block-subtitle">${b.content}</h3>`; return `<p class="read-block-text">${b.content}</p>`; }
        if (b.type === 'image') return `<img src="${b.content}" class="read-block-media">`;
        if (b.type === 'video') return `<video src="${b.content}" class="read-block-media" controls></video>`;
        if (b.type === 'audio') return `<div class="read-block-audio-wrapper"><i class="fas fa-podcast"></i><audio src="${b.content}" class="read-block-audio" controls></audio></div>`;
        return '';
      }).join('');
    } else { blocksHtml = `<p class="read-block-text">${post.content || ''}</p>`; }
    const coverHtml = post.cover_url ? `<div class="read-cover" style="background-image: url('${post.cover_url}');"></div>` : '';

    const isOwner = post.user_id === store.user.id;
    let menuHtml = `
      <div class="lib-menu-item" onclick="alert('Gliim saved!'); hubInstance.toggleHubMenu('${post.id}')">Save Gliim</div>
      <div class="lib-menu-item" onclick="alert('Content reported.'); hubInstance.toggleHubMenu('${post.id}')">Report</div>
    `;
    if (isOwner) {
      menuHtml += `<div class="lib-menu-item danger" onclick="hubInstance.deletePost('${post.id}')">Delete</div>`;
    }

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
            <div style="position:relative;">${avatar}</div>
            <div>
              <span style="font-weight: 700; color: var(--text-primary); display: flex; align-items: center;">${post.profiles?.full_name || 'Gliimait'} ${star}</span><br>
              <span style="font-size: 12px; color: var(--text-muted);">${new Date(post.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          ${blocksHtml}

          <div class="comment-section" id="comment-box-${post.id}" style="display: none;">
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

        <div class="post-actions-bar">
          <button class="action-btn like-btn ${hasLiked ? 'liked' : ''}" onclick="hubInstance.toggleLike('${post.id}')">
            <img src="/icons/clap.svg" class="action-icon-img" alt="Clap" loading="eager" decoding="async">
            <span>${likes}</span>
          </button>
          <button class="action-btn" onclick="hubInstance.toggleCommentBox('${post.id}')">
            <img src="/icons/comment.svg" class="action-icon-img" alt="Comment" loading="eager" decoding="async">
            <span>${comments}</span>
          </button>
          <button class="action-btn" onclick="hubInstance.sharePost('${post.id}', '${post.title}')">
            <img src="/icons/share.svg" class="action-icon-img" alt="Share" loading="eager" decoding="async">
            <span>${shares}</span>
          </button>

          <div class="lib-modal-menu">
            <button class="lib-menu-btn" onclick="hubInstance.toggleHubMenu('${post.id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
            </button>
            <div class="lib-menu-dropdown" id="hub-menu-${post.id}">
              ${menuHtml}
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  toggleHubMenu(postId) {
    const menu = document.getElementById(`hub-menu-${postId}`);
    if (menu) menu.classList.toggle('active');
  },

  async deletePost(postId) {
    if (!confirm("Are you sure you want to delete this Gliim?")) return;
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) return alert("Error deleting post.");
    alert("Post deleted.");
    document.querySelector('.modal-overlay')?.remove();
    this.fetchPosts();
  },

  async deleteComment(commentId, postId) {
    if (!confirm("Delete this comment?")) return;
    const { error } = await supabase.from('hub_interactions').delete().eq('id', commentId);
    if (error) return alert("Error deleting comment.");

    this.allInteractions = this.allInteractions.filter(i => i.id !== commentId);
    const commentEl = document.getElementById(`comment-${commentId}`);
    if (commentEl) commentEl.remove();
    this.renderPosts(this.currentPosts);
  },

  toggleCommentBox(postId) {
    const box = document.getElementById(`comment-box-${postId}`);
    if (box) {
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
    }
  },

  async submitComment(postId) {
    const input = document.getElementById(`comment-text-${postId}`);
    const text = input.value.trim();
    if (!text) return;

    const post = this.currentPosts.find(p => p.id === postId);

    const { data } = await supabase.from('hub_interactions').insert({
      post_id: postId,
      user_id: store.user.id,
      interaction_type: 'comment',
      comment_text: text
    }).select('*').single();

    if (data) {
      data.profiles = {
        full_name: store.profile.full_name,
        avatar_url: store.profile.avatar_url
      };
      this.allInteractions.push(data);

      const list = document.getElementById(`comment-list-${postId}`);
      const cAvatar = data.profiles.avatar_url ? `<img src="${data.profiles.avatar_url}" class="comment-avatar" style="object-fit:cover;">` : `<div class="comment-avatar">${data.profiles.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
      const parsedText = this.parseTags(text);
      const deleteBtn = `<button class="comment-delete-btn" onclick="event.stopPropagation(); hubInstance.deleteComment('${data.id}', '${postId}')"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`;

      list.innerHTML += `<div class="comment-item" id="comment-${data.id}">${cAvatar}<div class="comment-content-wrap"><span class="comment-author">${data.profiles.full_name}</span><p class="comment-text">${parsedText}</p></div>${deleteBtn}</div>`;
      input.value = "";
    }

    if (post && post.user_id !== store.user.id) await supabase.rpc('add_gp', { target_user_id: post.user_id, points_to_add: 4 });
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
    const likeBtn = document.querySelector('.read-view-content .like-btn span');
    if (likeBtn) {
      const likes = this.allInteractions.filter(i => i.post_id === postId && i.interaction_type === 'like').length;
      likeBtn.innerText = likes;
      const btnParent = document.querySelector('.read-view-content .like-btn');
      const hasLiked = this.allInteractions.some(i => i.post_id === postId && i.user_id === store.user.id && i.interaction_type === 'like');
      if (btnParent) btnParent.classList.toggle('liked', hasLiked);
    }
  },

  async sharePost(postId, title) {
    this.logInteraction(postId, 'share');
    const post = this.currentPosts.find(p => p.id === postId);
    if (post && post.user_id !== store.user.id) await supabase.rpc('add_gp', { target_user_id: post.user_id, points_to_add: 5 });

    const shareBtn = document.querySelector('.read-view-content .action-btn:nth-child(3) span');
    if (shareBtn) {
      const shares = this.allInteractions.filter(i => i.post_id === postId && i.interaction_type === 'share').length;
      shareBtn.innerText = shares;
    }

    if (navigator.share) { navigator.share({ title: title || 'Gliimu Post', url: window.location.href }).catch(() => {}); } else { alert("Share link copied. Author earned 5 GP!"); }
  },

  async logInteraction(postId, type, amount = 0) {
    const { data } = await supabase.from('hub_interactions').insert({ post_id: postId, user_id: store.user.id, interaction_type: type, amount: amount }).select('*').single();
    if (data) this.allInteractions.push(data);
  },

  setupRealtime() {
    supabase.removeChannel(supabase.channel('public:posts'));
    supabase.channel('public:posts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => { this.fetchPosts(); }).subscribe();
  },

  // ============================================
  // LIVE STUDIO LOGIC (SIMPLIFIED)
  // ============================================
  openLiveSetup() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content gliim-builder">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        <h2 style="margin-bottom: 24px; text-align: center; color: var(--error);">Go Live</h2>
        <div class="form-group"><label>Title</label><input type="text" id="live-title" class="input" placeholder="Live Session Title..."></div>
        <div class="form-group"><label>Category</label><select id="live-category" class="input"><option>Media</option><option>Tech</option><option>Business</option><option>Personal</option><option>Education</option></select></div>
        <div class="form-group"><label>Description</label><input type="text" id="live-description" class="input" placeholder="What is this live session about?"></div>
        <button id="start-live-btn" class="btn-primary" style="width: 100%; background: var(--error); margin-top: 16px;">Start Live Gliim</button>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('start-live-btn').addEventListener('click', async () => {
      const title = document.getElementById('live-title').value.trim();
      const category = document.getElementById('live-category').value;
      const description = document.getElementById('live-description').value.trim();
      if (!title) return alert("Title is required.");

      const { data, error } = await supabase.from('posts').insert({
        title, category, description,
        content: description,
        user_id: store.user.id,
        is_live: true,
        blocks: []
      }).select('*').single();

      if (error) return alert("Failed to go live: " + error.message);
      modal.remove();
      this.joinLive(data.id, true); // true = isHost
    });
  },

  async joinLive(postId, isHost = false) {
    const { data: post } = await supabase.from('posts').select(`*, profiles:profiles!user_id(full_name, avatar_url)`).eq('id', postId).single();
    if (!post) return alert("Live session not found.");

    this.isAudioOnly = false;
    this.isScreenSharing = false;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay live-studio-overlay';
    modal.innerHTML = `
      <div class="live-studio-container">
        <div class="live-studio-main">
          <div class="live-video-wrapper">
            <video id="live-video-feed" autoplay muted playsinline></video>
            <div class="live-video-overlay">
              <span class="live-indicator"><span class="live-pulse"></span> LIVE</span>
              <h2>${post.title}</h2>
              <div class="live-host-info">
                <span>Hosted by ${post.profiles?.full_name || 'Gliimait'}</span>
              </div>
            </div>

            ${isHost ? `
              <div class="live-host-toolbar">
                <button class="live-ctrl-btn" id="mute-mic-btn" title="Mute/Unmute Mic">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                </button>
                <button class="live-ctrl-btn" id="mute-cam-btn" title="Mute/Unmute Cam">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                </button>
                <button class="live-ctrl-btn" id="screen-share-btn" title="Share Screen">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                </button>
                <button class="live-ctrl-btn" id="audio-only-btn" title="Audio Only Mode">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path></svg>
                </button>
                <button class="live-ctrl-btn danger" id="end-live-btn" title="End Live">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                </button>
              </div>
            ` : ''}
          </div>

          <div class="live-content-feed" id="live-content-feed">
            <div class="live-block live-text-block"><p>${post.description || 'Live session starting...'}</p></div>
          </div>

          ${isHost ? `
            <div class="live-host-add-controls">
              <input type="text" id="live-add-text" class="input" placeholder="Add text to live feed...">
              <button class="btn-secondary" onclick="document.getElementById('live-img-input').click()">+ Image</button>
              <input type="file" id="live-img-input" accept="image/*" style="display:none" onchange="hubInstance.addLiveBlock('${postId}', 'image')">
              <button class="btn-primary" onclick="hubInstance.addLiveBlock('${postId}', 'text')">Post Text</button>
            </div>
          ` : ''}
        </div>

        <div class="live-side-panel">
          <div class="live-participants">
            <h4>Co-Hosts/Viewers</h4>
            <div class="participant-boxes" id="participant-boxes">
              <div class="participant-placeholder">Waiting for others to join...</div>
            </div>
          </div>

          <div class="live-chat-box">
            <div class="live-chat-messages" id="live-chat-messages"></div>
            <div class="live-chat-input-wrapper">
              <input type="text" id="live-chat-input" class="input" placeholder="Send a message...">
              <button class="comment-send-btn" onclick="hubInstance.sendLiveChat('${postId}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
          </div>
        </div>

        <div class="live-bottom-bar">
          <button class="action-btn like-btn" onclick="hubInstance.handleLiveInteraction('${postId}', 'like')">
            <img src="/icons/clap.svg" class="action-icon-img" alt="Clap" loading="eager" decoding="async">
            <span id="live-claps-count">0</span>
          </button>
          <button class="action-btn" onclick="hubInstance.handleLiveInteraction('${postId}', 'share')">
            <img src="/icons/share.svg" class="action-icon-img" alt="Share" loading="eager" decoding="async">
            <span id="live-shares-count">0</span>
          </button>
          <button class="action-btn support-btn" onclick="hubInstance.handleLiveInteraction('${postId}', 'support')">
            <svg xmlns="http://www.w3.org/2000/svg" width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <span id="live-supports-count">0</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // 1. Setup Media (Host only)
    if (isHost) {
      this.startMedia();

      document.getElementById('mute-mic-btn').addEventListener('click', () => this.toggleMute('audio'));
      document.getElementById('mute-cam-btn').addEventListener('click', () => this.toggleMute('video'));
      document.getElementById('screen-share-btn').addEventListener('click', () => this.toggleScreenShare());
      document.getElementById('audio-only-btn').addEventListener('click', () => this.toggleAudioOnly());
      document.getElementById('end-live-btn').addEventListener('click', () => this.endLive(postId));
    } else {
      document.getElementById('live-video-feed').style.background = 'var(--bg-tertiary)';
    }

    // 2. Fetch existing chat and interactions
    const { data: existingData } = await supabase.from('hub_interactions')
      .select('*, profiles:profiles!user_id(full_name, avatar_url)')
      .eq('post_id', postId).order('created_at', { ascending: true });

    const chatBox = document.getElementById('live-chat-messages');
    const clapsEl = document.getElementById('live-claps-count');
    const sharesEl = document.getElementById('live-shares-count');
    const supportsEl = document.getElementById('live-supports-count');

    let claps = 0, shares = 0, supports = 0;
    if (existingData && existingData.length > 0) {
      const chats = existingData.filter(d => d.interaction_type === 'live_chat');
      chatBox.innerHTML = chats.map(c => this.renderLiveChatHtml(c)).join('') || '<p style="font-size: 13px; color: var(--text-muted); text-align: center; margin-top: 20px;">No messages yet.</p>';

      claps = existingData.filter(d => d.interaction_type === 'like').length;
      shares = existingData.filter(d => d.interaction_type === 'share').length;
      supports = existingData.filter(d => d.interaction_type === 'support').length;
    } else {
      chatBox.innerHTML = '<p style="font-size: 13px; color: var(--text-muted); text-align: center; margin-top: 20px;">No messages yet.</p>';
    }
    clapsEl.innerText = claps;
    sharesEl.innerText = shares;
    supportsEl.innerText = supports;

    // 3. Setup Realtime for Chat & Interactions
    this.liveChatChannel = supabase.channel(`live-chat-${postId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hub_interactions', filter: `post_id=eq.${postId}` }, payload => {
        if (payload.new.interaction_type === 'live_chat') {
          supabase.from('profiles').select('full_name, avatar_url').eq('id', payload.new.user_id).single().then(({ data }) => {
            payload.new.profiles = data;
            chatBox.innerHTML += this.renderLiveChatHtml(payload.new);
            chatBox.scrollTop = chatBox.scrollHeight;
          });
        } else if (payload.new.interaction_type === 'like') {
          clapsEl.innerText = parseInt(clapsEl.innerText) + 1;
        } else if (payload.new.interaction_type === 'share') {
          sharesEl.innerText = parseInt(sharesEl.innerText) + 1;
        } else if (payload.new.interaction_type === 'support') {
          supportsEl.innerText = parseInt(supportsEl.innerText) + 1;
        }
      }).subscribe();

    // 4. Setup Realtime for Content Blocks
    this.liveContentChannel = supabase.channel(`live-content-${postId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts', filter: `id=eq.${postId}` }, payload => {
        const feed = document.getElementById('live-content-feed');
        if (feed && payload.new.blocks) {
          feed.innerHTML = payload.new.blocks.map(b => {
            if (b.type === 'text') return `<div class="live-block live-text-block"><p>${b.content}</p></div>`;
            if (b.type === 'image') return `<div class="live-block live-image-block"><img src="${b.content}"></div>`;
            return '';
          }).join('');
          feed.scrollTop = feed.scrollHeight;
        }
      }).subscribe();

    // Handle Enter key in chat
    document.getElementById('live-chat-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendLiveChat(postId);
    });
  },

  async startMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      document.getElementById('live-video-feed').srcObject = this.localStream;
    } catch (err) {
      alert("Camera/Mic access denied. Please allow permissions to go live.");
    }
  },

  toggleMute(type) {
    if (!this.localStream) return;
    if (type === 'audio') {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = !audioTrack.enabled;
    } else if (type === 'video') {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) videoTrack.enabled = !videoTrack.enabled;
    }
  },

  async toggleScreenShare() {
    if (!this.isScreenSharing) {
      try {
        this.displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const videoFeed = document.getElementById('live-video-feed');
        videoFeed.srcObject = this.displayStream;
        this.isScreenSharing = true;

        // When user stops sharing via browser UI
        this.displayStream.getVideoTracks()[0].onended = () => {
          this.toggleScreenShare();
        };
      } catch (err) {
        console.error("Screen share error:", err);
      }
    } else {
      // Revert to camera
      this.displayStream.getTracks().forEach(track => track.stop());
      document.getElementById('live-video-feed').srcObject = this.localStream;
      this.isScreenSharing = false;
    }
  },

  toggleAudioOnly() {
    const videoFeed = document.getElementById('live-video-feed');
    if (!this.isAudioOnly) {
      if (this.localStream) {
        this.localStream.getVideoTracks()[0].enabled = false;
      }
      videoFeed.style.display = 'none';

      let audioVisual = document.getElementById('audio-visual-placeholder');
      if (!audioVisual) {
        audioVisual = document.createElement('div');
        audioVisual.id = 'audio-visual-placeholder';
        audioVisual.className = 'audio-visual-placeholder';
        audioVisual.innerHTML = '<i class="fas fa-microphone"></i><p>Audio Only Mode</p>';
        videoFeed.parentElement.appendChild(audioVisual);
      }
      audioVisual.style.display = 'flex';
      this.isAudioOnly = true;
    } else {
      if (this.localStream) {
        this.localStream.getVideoTracks()[0].enabled = true;
      }
      videoFeed.style.display = 'block';
      const audioVisual = document.getElementById('audio-visual-placeholder');
      if (audioVisual) audioVisual.style.display = 'none';
      this.isAudioOnly = false;
    }
  },

  renderLiveChatHtml(c) {
    const cAvatar = c.profiles?.avatar_url ? `<img src="${c.profiles.avatar_url}" class="comment-avatar" style="object-fit:cover;">` : `<div class="comment-avatar">${c.profiles?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
    return `<div class="comment-item">${cAvatar}<div class="comment-content-wrap"><span class="comment-author">${c.profiles?.full_name || 'Gliimait'}</span><p class="comment-text">${c.comment_text}</p></div></div>`;
  },

  async sendLiveChat(postId) {
    const input = document.getElementById('live-chat-input');
    const text = input.value.trim();
    if (!text) return;

    await supabase.from('hub_interactions').insert({
      post_id: postId, user_id: store.user.id, interaction_type: 'live_chat', comment_text: text
    });
    input.value = "";
  },

  async handleLiveInteraction(postId, type) {
    await supabase.from('hub_interactions').insert({
      post_id: postId, user_id: store.user.id, interaction_type: type
    });
    // The realtime channel will update the count automatically
    if (type === 'like') {
      const post = this.currentPosts.find(p => p.id === postId);
      if (post && post.user_id !== store.user.id) await supabase.rpc('add_gp', { target_user_id: post.user_id, points_to_add: 3 });
    } else if (type === 'share') {
      const post = this.currentPosts.find(p => p.id === postId);
      if (post && post.user_id !== store.user.id) await supabase.rpc('add_gp', { target_user_id: post.user_id, points_to_add: 5 });
    } else if (type === 'support') {
      const post = this.currentPosts.find(p => p.id === postId);
      if (post && post.user_id !== store.user.id) await supabase.rpc('add_gp', { target_user_id: post.user_id, points_to_add: 10 });
    }
  },

  async addLiveBlock(postId, type) {
    if (type === 'text') {
      const input = document.getElementById('live-add-text');
      const text = input.value.trim();
      if (!text) return;

      const { data: post } = await supabase.from('posts').select('blocks').eq('id', postId).single();
      const currentBlocks = post.blocks || [];
      currentBlocks.push({ type: 'text', content: text });

      await supabase.from('posts').update({ blocks: currentBlocks }).eq('id', postId);
      input.value = "";
    } else if (type === 'image') {
      const fileInput = document.getElementById('live-img-input');
      const file = fileInput.files[0];
      if (!file) return;

      const fileName = `${store.user.id}/live_${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('media').upload(fileName, file);
      if (error) return alert("Image upload failed.");

      const { data } = supabase.storage.from('media').getPublicUrl(fileName);
      const imgUrl = data.publicUrl;

      const { data: post } = await supabase.from('posts').select('blocks').eq('id', postId).single();
      const currentBlocks = post.blocks || [];
      currentBlocks.push({ type: 'image', content: imgUrl });

      await supabase.from('posts').update({ blocks: currentBlocks }).eq('id', postId);
      fileInput.value = ""; // Clear input
    }
  },

  async endLive(postId) {
    if (!confirm("Are you sure you want to end this live session?")) return;

    // Stop media tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    if (this.displayStream) {
      this.displayStream.getTracks().forEach(track => track.stop());
    }

    // Unsubscribe realtime
    if (this.liveChatChannel) supabase.removeChannel(this.liveChatChannel);
    if (this.liveContentChannel) supabase.removeChannel(this.liveContentChannel);

    // Remove the live modal
    document.querySelector('.live-studio-overlay')?.remove();

    // Ask to publish as Gliim
    if (confirm("Would you like to publish the content of this live session as a Gliim?")) {
      this.publishLiveAsGliim(postId);
    } else {
      // Just mark as ended in DB
      await supabase.from('posts').update({ is_live: false, live_ended_at: new Date().toISOString() }).eq('id', postId);
      this.fetchPosts();
    }
  },

  async publishLiveAsGliim(postId) {
    // Fetch the live post data
    const { data: post } = await supabase.from('posts').select('*').eq('id', postId).single();
    if (!post) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content gliim-builder">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        <h2 style="margin-bottom: 24px;">Publish Live as Gliim</h2>

        <div class="form-group">
          <label>Title</label>
          <input type="text" id="publish-title" class="input" value="${post.title || ''}">
        </div>
        <div class="form-row" style="gap: 16px;">
          <div class="form-group" style="flex: 1;">
            <label>Category</label>
            <select id="publish-category" class="input">
              <option ${post.category === 'Media' ? 'selected' : ''}>Media</option>
              <option ${post.category === 'Tech' ? 'selected' : ''}>Tech</option>
              <option ${post.category === 'Business' ? 'selected' : ''}>Business</option>
              <option ${post.category === 'Personal' ? 'selected' : ''}>Personal</option>
              <option ${post.category === 'Education' ? 'selected' : ''}>Education</option>
            </select>
          </div>
          <div class="form-group" style="flex: 2;">
            <label>Description</label>
            <input type="text" id="publish-description" class="input" value="${post.description || ''}">
          </div>
        </div>

        <hr style="border: none; border-top: 1px solid var(--border); margin: 24px 0;">
        <h3 style="margin-bottom: 16px;">Content Blocks (From Live)</h3>
        <div id="publish-blocks-container" style="display: flex; flex-direction: column; gap: 16px;"></div>

        <button id="final-publish-btn" class="btn-primary" style="width: 100%; margin-top: 32px;">Publish Gliim</button>
      </div>
    `;
    document.body.appendChild(modal);

    const blocksContainer = document.getElementById('publish-blocks-container');

    // Render existing blocks for editing
    if (post.blocks && post.blocks.length > 0) {
      post.blocks.forEach(b => {
        const blockDiv = document.createElement('div');
        blockDiv.className = 'builder-block';
        blockDiv.dataset.type = b.type;

        let inputHtml = '';
        if (b.type === 'text') {
          inputHtml = `<textarea class="input block-content-input" rows="4">${b.content}</textarea>`;
        } else if (b.type === 'image') {
          inputHtml = `<input type="text" class="input block-content-input" value="${b.content}"><img src="${b.content}" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">`;
        }

        blockDiv.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;"><span class="block-label">${b.type.toUpperCase()}</span><button class="block-remove-btn" onclick="this.parentElement.parentElement.remove()">Remove</button></div>${inputHtml}`;
        blocksContainer.appendChild(blockDiv);
      });
    }

    document.getElementById('final-publish-btn').addEventListener('click', async () => {
      const title = document.getElementById('publish-title').value.trim();
      const category = document.getElementById('publish-category').value;
      const description = document.getElementById('publish-description').value.trim();

      if (!title) return alert("Title is required.");

      const finalBlocks = [];
      document.querySelectorAll('#publish-blocks-container .builder-block').forEach(b => {
        const type = b.dataset.type;
        const content = b.querySelector('.block-content-input').value.trim();
        if (content) { finalBlocks.push({ type, content }); }
      });

      const btn = document.getElementById('final-publish-btn');
      btn.innerText = "Publishing..."; btn.disabled = true;

      // Update the existing post record
      const { error } = await supabase.from('posts').update({
        title, category, description,
        content: description,
        blocks: finalBlocks,
        is_live: false,
        live_ended_at: new Date().toISOString()
      }).eq('id', postId);

      if (error) {
        alert("Failed: " + error.message);
        btn.innerText = "Publish Gliim"; btn.disabled = false;
      } else {
        modal.remove();
        this.fetchPosts();
      }
    });
  }
};
