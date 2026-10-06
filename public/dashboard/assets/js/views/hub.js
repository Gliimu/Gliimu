import { supabase } from '/shared/js/config.js';
import { store, tierClass } from '../store.js';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    this.isModalOpen = false;

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
      addBlock: (type) => this.addBlock(type),
      promptDelete: (id) => this.promptDelete(id),
      replyToUser: (postId, fullName) => this.replyToUser(postId, fullName),
      viewAuthor: (userId) => this.viewAuthor(userId),
      promptReport: (targetType, targetId) => this.promptReport(targetType, targetId),
      removeTag: (index) => this.removeTag(index),
      isModalOpen: () => this.isModalOpen
    };

    this.setupTopbarSearch();
    this.setupTopbarActions();
    this.setupRealtime();
    this.setupFab();

    this.fetchPosts().then(() => {
      this.checkPersistedModal();
    });
  },

  async checkPersistedModal() {
    const savedPostId = sessionStorage.getItem('openReadViewId');
    if (!savedPostId) return;

    sessionStorage.removeItem('openReadViewId');
    const commentId = sessionStorage.getItem('openCommentId');
    sessionStorage.removeItem('openCommentId');

    let post = this.currentPosts.find(p => p.id === savedPostId);

    if (!post) {
      const { data, error } = await supabase.from('posts')
        .select(`*, profiles:profiles!user_id(full_name, avatar_url, total_gp)`)
        .eq('id', savedPostId).single();

      if (error || !data) {
        alert("This particular post is no longer available.");
        return;
      }
      post = data;
      this.currentPosts.unshift(post);
      this.renderPosts(this.currentPosts);
    }

    this.openReadView(post.id);

    if (commentId) {
      setTimeout(() => {
        const el = document.getElementById(`comment-${commentId}`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('comment-highlight');
        setTimeout(() => el.classList.remove('comment-highlight'), 3000);
      }, 200);
    }
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
        if (this.searchQuery.length >= 3) this.interestSignal(0, null, this.searchQuery);
        this.renderPosts(this.currentPosts);
      });
    }
  },

  setupTopbarActions() {
    const rightActions = document.getElementById('topbar-right-actions');
    if (rightActions) {
      rightActions.innerHTML = `
        <div class="hub-view-toggle">
          <button class="hub-view-btn" data-view="list" title="List View">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
          </button>
          <button class="hub-view-btn" data-view="grid" title="Grid View">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          </button>
        </div>
        <div class="hub-filter-wrapper">
          <button class="hub-filter-btn" id="hub-filter-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
          </button>
          <div class="hub-filter-menu" id="hub-dropdown">
            <div class="hub-filter-item active" data-filter="all">All Gliims</div>
            <div class="hub-filter-item" data-filter="mine">My Gliims</div>
            <div class="hub-filter-item" data-filter="tagged">Tagged Gliims</div>
            <div class="hub-filter-item" data-filter="saved">Saved Gliims</div>
            <div class="hub-filter-item" data-filter="Media">Media</div>
            <div class="hub-filter-item" data-filter="Tech">Tech</div>
            <div class="hub-filter-item" data-filter="Business">Business</div>
            <div class="hub-filter-item" data-filter="Personal">Personal</div>
            <div class="hub-filter-item" data-filter="Education">Education</div>
          </div>
        </div>
      `;

      const activeBtn = document.querySelector(`.hub-view-btn[data-view="${this.viewStyle}"]`);
      if (activeBtn) activeBtn.classList.add('active');

      document.getElementById('hub-filter-btn').addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        document.getElementById('hub-dropdown').classList.toggle('active');
      });
      document.querySelectorAll('#hub-dropdown .hub-filter-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('#hub-dropdown .hub-filter-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          this.currentFilter = item.dataset.filter;
          document.getElementById('hub-dropdown').classList.remove('active');
          this.renderPosts(this.currentPosts);
        });
      });

      document.querySelectorAll('.hub-view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.hub-view-btn').forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          this.viewStyle = e.currentTarget.dataset.view;
          localStorage.setItem('hub-view', this.viewStyle);
          this.renderPosts(this.currentPosts);
        });
      });

      // Close the filter menu when tapping anywhere else in the app
      document.addEventListener('click', () => {
        document.getElementById('hub-dropdown')?.classList.remove('active');
      });
    }
  },

  setupFab() {
    document.getElementById('hub-fab-main').addEventListener('click', () => this.openCreateModal());
  },

  closeModal() {
    document.querySelector('.modal-overlay')?.remove();
    this.isModalOpen = false;
    sessionStorage.removeItem('openReadViewId');
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
      <div class="ctx-item" onclick="hubInstance.replyToUser('${postId}', '${fullName}', '${userId}')">Reply</div>
      <div class="ctx-item" onclick="hubInstance.viewAuthor('${userId}')">View Profile</div>
      <div class="ctx-item" onclick="hubInstance.promptReport('user', '${userId}')">Report</div>
    `;
    document.body.appendChild(menu);

    setTimeout(() => {
      document.addEventListener('click', this.closeUserMenu, { once: true });
    }, 0);
  },

  replyToUser(postId, fullName, userId) {
    this.closeUserMenu();
    if (userId) this.recordMentionPick(postId, { id: userId, name: fullName });
    const input = document.getElementById(`comment-text-${postId}`);
    if (input) {
      input.value = `@${fullName} `;
      input.focus();
    }
  },

  recordMentionPick(postId, user) {
    this.pickedMentions = this.pickedMentions || {};
    const picks = this.pickedMentions[postId] || [];
    if (!picks.some(p => p.id === user.id)) picks.push(user);
    this.pickedMentions[postId] = picks;
  },

  async loadMentionPeople() {
    if (this.mentionPeople) return this.mentionPeople;
    const { data } = await supabase.from('profiles').select('id, full_name, avatar_url, total_gp').neq('id', store.user.id);
    this.mentionPeople = data || [];
    return this.mentionPeople;
  },

  // Suggests exact users while typing after an @ so people who share
  // a full name (two "John Doe") can be told apart — the picked row's
  // id, not the typed name, decides who gets pinged.
  setupMentionPicker(postId) {
    const input = document.getElementById(`comment-text-${postId}`);
    const wrapper = input?.closest('.comment-input-wrapper');
    if (!input || !wrapper) return;

    const picker = document.createElement('div');
    picker.className = 'mention-picker';
    wrapper.appendChild(picker);

    let matches = [];
    let activeIndex = -1;

    const close = () => {
      picker.classList.remove('active');
      picker.innerHTML = '';
      matches = [];
      activeIndex = -1;
    };

    const render = () => {
      if (matches.length === 0) return close();
      picker.innerHTML = matches.map((u, i) => {
        const cls = tierClass(u.total_gp, 'mention-avatar');
        const av = u.avatar_url ? `<img src="${u.avatar_url}" class="${cls}" style="object-fit:cover;">` : `<div class="${cls}">${escapeHtml((u.full_name || 'G').charAt(0).toUpperCase())}</div>`;
        return `<div class="mention-option${i === activeIndex ? ' active' : ''}" data-index="${i}">${av}<span class="mention-option-name">${escapeHtml(u.full_name || 'Gliimait')}</span><span class="mention-option-gp">${u.total_gp || 0} GP</span></div>`;
      }).join('');
      picker.classList.add('active');
    };

    const mentionQuery = () => {
      const upTo = input.value.slice(0, input.selectionStart);
      const m = upTo.match(/(?:^|[\s(])@([a-zA-Z0-9_ ]*)$/);
      if (!m) return null;
      const partial = m[1];
      return { partial, atIndex: upTo.length - partial.length - 1 };
    };

    const choose = (u) => {
      const q = mentionQuery();
      if (!q) return;
      const caret = input.selectionStart;
      input.value = input.value.slice(0, q.atIndex) + `@${u.full_name} ` + input.value.slice(caret);
      const pos = q.atIndex + (u.full_name || '').length + 2;
      input.setSelectionRange(pos, pos);
      this.recordMentionPick(postId, { id: u.id, name: u.full_name });
      close();
      input.focus();
    };

    input.addEventListener('input', async () => {
      const q = mentionQuery();
      if (!q) return close();
      const needle = q.partial.toLowerCase();
      const people = await this.loadMentionPeople();
      // The text may have changed while profiles were loading
      const again = mentionQuery();
      if (!again || again.partial.toLowerCase() !== needle) return close();
      matches = people
        .filter(u => (u.full_name || '').toLowerCase().includes(needle))
        .sort((a, b) => {
          const an = (a.full_name || '').toLowerCase();
          const bn = (b.full_name || '').toLowerCase();
          return (an.startsWith(needle) ? 0 : 1) - (bn.startsWith(needle) ? 0 : 1) || an.localeCompare(bn);
        })
        .slice(0, 8);
      activeIndex = matches.length ? 0 : -1;
      render();
    });

    input.addEventListener('keydown', (e) => {
      if (!picker.classList.contains('active')) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % matches.length;
        render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + matches.length) % matches.length;
        render();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (matches[activeIndex]) choose(matches[activeIndex]);
      } else if (e.key === 'Escape') {
        close();
      }
    });

    // mousedown (not click) so the choice lands before the input blurs
    picker.addEventListener('mousedown', (e) => {
      const row = e.target.closest('.mention-option');
      if (!row) return;
      e.preventDefault();
      const u = matches[parseInt(row.dataset.index, 10)];
      if (u) choose(u);
    });
  },

  viewAuthor(userId) {
    this.closeUserMenu();
    this.closeModal();
    if (userId === store.user.id) {
      sessionStorage.removeItem('view_profile_id');
    } else {
      sessionStorage.setItem('view_profile_id', userId);
    }
    window.location.hash = '#/profile';
  },

  promptReport(targetType, targetId) {
    this.closeUserMenu();
    const isUser = targetType === 'user';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content" style="max-width: 440px;">
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        <h2 style="margin-bottom: 8px;">Report ${isUser ? 'User' : 'Gliim'}</h2>
        <p class="text-muted" style="margin-bottom: 16px;">State your reason for reporting this ${isUser ? 'user' : 'post'}. It will be reviewed by the team.</p>
        <textarea id="report-reason" class="input" rows="4" placeholder="Reason for reporting..."></textarea>
        <button class="btn-primary" id="report-submit" style="width: 100%; margin-top: 16px;">Submit Report</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('report-submit').addEventListener('click', async () => {
      const reason = document.getElementById('report-reason').value.trim();
      if (reason.length < 5) return appAlert("Please state a reason (at least 5 characters).");

      const btn = document.getElementById('report-submit');
      btn.disabled = true;
      btn.innerText = "Submitting...";

      const { error } = await supabase.from('reports').insert({
        reporter_id: store.user.id,
        target_type: targetType,
        target_id: targetId,
        reason
      });

      if (error) {
        btn.disabled = false;
        btn.innerText = "Submit Report";
        return appAlert("Report failed: " + error.message);
      }

      overlay.remove();
      appAlert("Thank you. Your report has been submitted for review.");
    });
  },

  setupTagPicker() {
    const input = document.getElementById('tag-search');
    const results = document.getElementById('tag-results');
    if (!input || !results) return;
    let timer = null;

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearTimeout(timer);

      if (q.length < 2) { results.innerHTML = ''; return; }

      timer = setTimeout(async () => {
        const { data } = await supabase.from('profiles')
          .select('id, full_name, avatar_url, total_gp')
          .ilike('full_name', `%${q}%`)
          .neq('id', store.user.id)
          .limit(6);

        const taken = new Set(this.taggedUsers.map(u => u.id));
        const list = (data || []).filter(u => !taken.has(u.id));

        if (list.length === 0) {
          results.innerHTML = '<div class="hub-tag-empty">No users found.</div>';
        } else {
          results.innerHTML = list.map(u => {
            const cls = tierClass(u.total_gp, 'hub-tag-avatar');
            const av = u.avatar_url ? `<img src="${u.avatar_url}" class="${cls}" style="object-fit:cover;">` : `<div class="${cls}">${(u.full_name || 'G').charAt(0).toUpperCase()}</div>`;
            return `<div class="hub-tag-result" data-id="${u.id}">${av}<span>${escapeHtml(u.full_name)}</span></div>`;
          }).join('');

          results.querySelectorAll('.hub-tag-result').forEach(row => {
            row.addEventListener('click', () => {
              const u = list.find(x => x.id === row.dataset.id);
              if (!u) return;
              this.taggedUsers.push(u);
              input.value = '';
              results.innerHTML = '';
              this.renderTagChips();
              input.focus();
            });
          });
        }
      }, 250);
    });
  },

  renderTagChips() {
    const chips = document.getElementById('tag-chips');
    if (!chips) return;
    chips.innerHTML = this.taggedUsers.map((u, i) => `
      <span class="hub-tag-chip"><span>@${escapeHtml(u.full_name)}</span><button type="button" class="hub-tag-chip-x" onclick="hubInstance.removeTag(${i})">&times;</button></span>
    `).join('');
  },

  removeTag(index) {
    this.taggedUsers.splice(index, 1);
    this.renderTagChips();
  },

  async promptDelete(postId) {
    const password = await appPrompt("To permanently delete this Gliim, please enter your password:", { inputType: 'password', okText: 'Delete', danger: true });
    if (!password) return;

    const fakeEmail = `${store.profile.username}@gliimu.app`;
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: fakeEmail, password });

    if (signInError) {
      return alert("Incorrect password. Deletion cancelled.");
    }

    const { error: deleteError } = await supabase.from('posts').delete().eq('id', postId);
    if (deleteError) return alert("Error deleting post: " + deleteError.message);

    alert("Gliim deleted successfully.");
    this.closeModal();
    this.fetchPosts();
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
        <div class="form-group">
          <label>Tag People (optional)</label>
          <div class="hub-tag-picker">
            <div class="hub-tag-chips" id="tag-chips"></div>
            <input type="text" id="tag-search" class="input" placeholder="Type a full name to tag someone..." autocomplete="off">
            <div class="hub-tag-results" id="tag-results"></div>
          </div>
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

    this.taggedUsers = [];
    this.setupTagPicker();

    document.getElementById('add-block-trigger').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('add-block-menu').classList.toggle('active');
    });
    document.addEventListener('click', () => {
      document.getElementById('add-block-menu')?.classList.remove('active');
    });

    this.addBlock('text');

    document.getElementById('submit-post-btn').addEventListener('click', async () => {
      const title = document.getElementById('post-title').value.trim();
      const category = document.getElementById('post-category').value;
      const rawDescription = document.getElementById('post-description').value.trim();

      if (!title) return alert("Title is required.");

      const tagSuffix = this.taggedUsers.map(u => `@${u.full_name}`).join(' ');
      const description = [rawDescription, tagSuffix].filter(Boolean).join(' ');

      const finalBlocks = [];
      let coverUrl = null;

      document.querySelectorAll('.builder-block').forEach(b => {
        const type = b.dataset.type;
        const content = b.querySelector('.block-content-input').value.trim();
        if (content) {
          const blockData = { type, content };
          if (type === 'text') blockData.style = b.querySelector('.block-style-select').value;
          finalBlocks.push(blockData);

          if (!coverUrl && (type === 'image' || type === 'video')) {
            coverUrl = content;
          }
        }
      });

      if (finalBlocks.length === 0) return alert("Add some content blocks.");

      const btn = document.getElementById('submit-post-btn');
      btn.innerText = "Publishing...";
      btn.disabled = true;

      const { data: created, error } = await supabase.from('posts').insert({
        title, category, description,
        cover_url: coverUrl,
        blocks: finalBlocks,
        content: description,
        user_id: store.user.id
      }).select('id').single();

      if (error) {
        alert("Failed: " + error.message);
        btn.innerText = "Publish Gliim";
        btn.disabled = false;
      } else {
        for (const u of this.taggedUsers) {
          const content = `${store.profile.full_name} tagged you in the hub page: "${title}" — click to check it out. [[hub:${created.id}]]`;
          await supabase.from('messages').insert({ sender_id: store.user.id, receiver_id: u.id, content, is_ai: false });
        }
        modal.remove();
        this.fetchPosts();
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

    const removeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

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

    blockDiv.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;"><span class="block-label">${iconHtml}</span><button class="block-remove-btn" onclick="this.parentElement.parentElement.remove()">${removeIcon}</button></div>${inputHtml}`;
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
      supabase.from('posts').select(`id, title, category, description, cover_url, blocks, views, created_at, user_id, profiles:profiles!user_id(full_name, avatar_url, total_gp)`).order('created_at', { ascending: false }).limit(20),
      supabase.from('hub_interactions').select('id, post_id, user_id, interaction_type, amount, comment_text, created_at, profiles:profiles!user_id(full_name, avatar_url)'),
      supabase.from('profiles').select('wallet_balance, total_gp').eq('id', store.user.id).single(),
      supabase.from('saved_posts').select('post_id').eq('user_id', store.user.id)
    ]);
    if (error) { console.error(error); return; }
    this.userBalance = profile?.wallet_balance || 0;
    this.userGP = profile?.total_gp || 0;
    this.allInteractions = interactions || [];
    this.currentPosts = this.orderFeed(posts || []);
    this.savedPosts = new Set(saved?.map(s => s.post_id) || []);
    this.renderPosts(this.currentPosts);
  },

  renderPosts(posts) {
    const container = document.getElementById('posts-container');
    if (!container) return;
    let filtered = posts;

    if (this.currentFilter === 'saved') {
      filtered = filtered.filter(p => this.savedPosts.has(p.id));
    } else if (this.currentFilter === 'mine') {
      filtered = filtered.filter(p => p.user_id === store.user.id);
    } else if (this.currentFilter === 'tagged') {
      const myName = store.profile?.full_name || '';
      const tag = `@${myName}`;
      filtered = filtered.filter(p => {
        const inDesc = p.description && p.description.includes(tag);
        const inBlocks = p.blocks && p.blocks.some(b => b.type === 'text' && b.content.includes(tag));
        const inComments = this.allInteractions.some(i => i.post_id === p.id && i.comment_text && i.comment_text.includes(tag));
        return inDesc || inBlocks || inComments;
      });
    } else if (this.currentFilter !== 'all') {
      filtered = filtered.filter(p => p.category === this.currentFilter);
    }

    if (this.searchQuery) {
      filtered = filtered.filter(p => p.title?.toLowerCase().includes(this.searchQuery) || p.description?.toLowerCase().includes(this.searchQuery) || p.category?.toLowerCase().includes(this.searchQuery));
    }

    if (filtered.length === 0) { container.innerHTML = '<p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">No Gliims found.</p>'; return; }

    container.className = `blog-feed ${this.viewStyle === 'grid' ? 'grid-view' : ''}`;
    container.innerHTML = filtered.map(post => {
      const isAmbassador = (post.profiles?.total_gp || 0) >= 5000;
      const avatarClass = tierClass(post.profiles?.total_gp, 'blog-avatar');
      const avatar = post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="${avatarClass}" style="object-fit:cover;">` : `<div class="${avatarClass}">${post.profiles?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;

      const likes = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'like').length;
      const comments = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'comment').length;
      const coverHtml = post.cover_url ? `<div class="blog-cover" style="background-image: url('${post.cover_url}');"></div>` : '';
      const eyeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      const commentSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
      return `<article class="blog-card${isAmbassador ? ' ambassador-card' : ''}" id="post-${post.id}" onclick="hubInstance.openReadView('${post.id}')">${coverHtml}<div class="blog-content"><div class="blog-meta"><span class="blog-category">${post.category || 'General'}</span><span class="blog-date">${new Date(post.created_at).toLocaleDateString([], {month: 'short', day: 'numeric'})}</span></div><h2 class="blog-title">${post.title || 'Untitled Gliim'}</h2><p class="blog-desc">${post.description || ''}</p><div class="blog-footer"><div class="blog-author hub-author-hit" onclick="event.stopPropagation(); hubInstance.viewAuthor('${post.user_id}')"><div style="position:relative;">${avatar}</div><span>${escapeHtml(post.profiles?.full_name || 'Gliimait')}</span></div><div class="blog-stats"><span class="blog-stat">${eyeSvg}${post.views || 0}</span><span class="blog-stat">${commentSvg}${comments}</span></div></div></div></article>`;
    }).join('');
  },

  parseTags(text) {
    if (!text) return '';
    return text.replace(/@([a-zA-Z0-9_ ]+)/g, (match, name) => `<span class="comment-tag">${match}</span>`);
  },

  // ============================================
  // INTEREST ENGINE — the feed starts random (stable per
  // session), then settles into an interest-ordered feed once
  // enough engagement signals are collected (>= 5).
  // ============================================
  loadInterest() {
    try {
      return JSON.parse(localStorage.getItem('gliimu_interest_v1')) || { cats: {}, terms: [], signals: 0 };
    } catch {
      return { cats: {}, terms: [], signals: 0 };
    }
  },

  interestSignal(weight, category, term) {
    try {
      const it = this.loadInterest();
      it.signals = (it.signals || 0) + weight;
      if (category) it.cats[category] = (it.cats[category] || 0) + weight;
      if (term) {
        const t = term.toLowerCase().trim();
        if (t.length >= 3 && !it.terms.includes(t)) {
          it.terms.push(t);
          if (it.terms.length > 30) it.terms = it.terms.slice(-30);
        }
      }
      localStorage.setItem('gliimu_interest_v1', JSON.stringify(it));
    } catch { /* storage unavailable — feed stays chronological */ }
  },

  feedScore(post, interest) {
    const ageDays = (Date.now() - new Date(post.created_at).getTime()) / 86400000;
    let score = (interest.cats[post.category] || 0) - ageDays * 0.5;
    const text = `${post.title || ''} ${post.description || ''}`.toLowerCase();
    (interest.terms || []).forEach(t => { if (text.includes(t)) score += 2; });
    const myName = store.profile?.full_name;
    if (myName && `${post.description || ''}`.includes(`@${myName}`)) score += 3;
    return score;
  },

  seededShuffle(posts) {
    let seed = parseInt(sessionStorage.getItem('gliimu_feed_seed') || '', 10);
    if (isNaN(seed)) {
      seed = Math.floor(Math.random() * 1e9);
      sessionStorage.setItem('gliimu_feed_seed', String(seed));
    }
    const rand = () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    const arr = [...posts];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  orderFeed(posts) {
    const interest = this.loadInterest();
    if ((interest.signals || 0) >= 5) {
      return [...posts].sort((a, b) =>
        this.feedScore(b, interest) - this.feedScore(a, interest) ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    return this.seededShuffle(posts);
  },

  openReadView(postId) {
    const post = this.currentPosts.find(p => p.id === postId);
    if (!post) return;

    this.isModalOpen = true;
    sessionStorage.setItem('openReadViewId', postId);

    // Count one view per post per browser session
    const viewedKey = `gliimu_viewed_${postId}`;
    if (!sessionStorage.getItem(viewedKey)) {
      sessionStorage.setItem(viewedKey, '1');
      supabase.rpc('bump_post_views', { p_post: postId }).then(({ data }) => {
        if (typeof data === 'number') post.views = data;
      });
      // Interest: opening a post counts; one where I'm tagged counts extra
      const myName = store.profile?.full_name;
      const tagged = myName && (post.description || '').includes(`@${myName}`);
      this.interestSignal(tagged ? 3 : 1, post.category);
    }

    const avatarClass = tierClass(post.profiles?.total_gp, 'blog-avatar');
    const avatar = post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="${avatarClass}" style="object-fit:cover;">` : `<div class="${avatarClass}">${post.profiles?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;

    const likes = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'like').length;
    const comments = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'comment').length;
    const shares = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'share').length;
    const supports = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'support').length;
    const hasLiked = this.allInteractions.some(i => i.post_id === post.id && i.user_id === store.user.id && i.interaction_type === 'like');
    const hasSupported = this.allInteractions.some(i => i.post_id === post.id && i.user_id === store.user.id && i.interaction_type === 'support');
    const isSaved = this.savedPosts.has(post.id);
    const isOwner = post.user_id === store.user.id;

    const postComments = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'comment');
    let commentsHtml = '<p style="font-size: 13px; color: var(--text-muted);">No comments yet.</p>';
    if (postComments.length > 0) {
      commentsHtml = postComments.map(c => {
        const cAvatarClass = tierClass(c.profiles?.total_gp, 'comment-avatar');
        const cAvatar = c.profiles?.avatar_url ? `<img src="${c.profiles.avatar_url}" class="${cAvatarClass}" style="object-fit:cover;" onclick="hubInstance.showUserMenu(event, '${c.user_id}', '${post.id}', '${c.profiles?.full_name || 'Gliimait'}')">` : `<div class="${cAvatarClass}" onclick="hubInstance.showUserMenu(event, '${c.user_id}', '${post.id}', '${c.profiles?.full_name || 'Gliimait'}')">${c.profiles?.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
        const parsedText = this.parseTags(c.comment_text);
        const commentTime = new Date(c.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `<div class="comment-item" id="comment-${c.id}">${cAvatar}<div class="comment-content-wrap"><div class="comment-meta"><span class="comment-author">${c.profiles?.full_name || 'Gliimait'}</span><span class="comment-time">${commentTime}</span></div><p class="comment-text">${parsedText}</p></div></div>`;
      }).join('');
    }

    let blocksHtml = '';
    if (post.blocks && post.blocks.length > 0) {
      blocksHtml = post.blocks.map(b => {
        if (b.type === 'text') {
          if (b.style === 'title') return `<h2 class="read-block-title">${b.content}</h2>`;
          if (b.style === 'subtitle') return `<h3 class="read-block-subtitle">${b.content}</h3>`;
          if (b.style === 'list') {
            const items = b.content.split('\n').map(line => `<div class="read-block-list-item">${line}</div>`).join('');
            return `<div class="read-block-list">${items}</div>`;
          }
          return `<p class="read-block-text">${b.content}</p>`;
        }
        if (b.type === 'image') return `<img src="${b.content}" class="read-block-media">`;
        if (b.type === 'video') return `<video src="${b.content}" class="read-block-media" controls></video>`;
        if (b.type === 'audio') return `<div class="read-block-audio-wrapper"><i class="fas fa-podcast"></i><audio src="${b.content}" class="read-block-audio" controls></audio></div>`;
        return '';
      }).join('');
    } else { blocksHtml = `<p class="read-block-text">${post.content || ''}</p>`; }

    // Menu Icons
    const closeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    const saveIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
    const reportIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>';
    const deleteIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

    // Delete Button (Only visible if user is the owner)
    const deleteBtnHtml = isOwner ? `
      <div class="hub-read-menu-item danger" onclick="event.stopPropagation(); hubInstance.promptDelete('${post.id}')">${deleteIcon} Delete Gliim</div>
    ` : '';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay read-view-overlay';
    modal.innerHTML = `
      <div class="modal-content read-view-content">

      <div class="read-top-bar">
        <div class="hub-menu-wrapper">
          <button class="hub-menu-btn" onclick="event.stopPropagation(); hubInstance.toggleReadMenu('${post.id}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
          </button>
          <div class="hub-read-menu" id="read-menu-${post.id}">
            <div class="hub-read-menu-item" onclick="event.stopPropagation(); hubInstance.closeModal()">${closeIcon} Close Modal</div>
            <div class="hub-read-menu-item" onclick="event.stopPropagation(); hubInstance.toggleSavePost('${post.id}')">${saveIcon} ${isSaved ? 'Unsave Gliim' : 'Save Gliim'}</div>
            <div class="hub-read-menu-item" onclick="event.stopPropagation(); hubInstance.promptReport('post', '${post.id}')">${reportIcon} Report Gliim</div>
            ${deleteBtnHtml}
          </div>
        </div>
      </div>

        <div class="read-scroll-container">
          <div class="read-body">
            <span class="blog-category">${post.category || 'General'}</span>
            <h1 class="read-title">${post.title || 'Untitled Gliim'}</h1>

            <div class="blog-author hub-author-hit" style="margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid var(--border); flex-direction: row; align-items: center;" onclick="hubInstance.viewAuthor('${post.user_id}')">
              <div style="position: relative; flex-shrink: 0; margin-right: 12px;">${avatar}</div>
              <div style="display: flex; flex-direction: column;">
                <span style="font-weight: 700; color: var(--text-primary);">${escapeHtml(post.profiles?.full_name || 'Gliimait')}</span>
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
            <img src="/icons/clap.svg" class="action-icon-img" alt="Punch-it" loading="eager" decoding="async">
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
          <button class="action-btn support-btn ${hasSupported ? 'supported' : ''}" ${hasSupported ? 'disabled' : ''} onclick="hubInstance.supportCreator('${post.id}', '${post.user_id}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <span>${supports}</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this.setupMentionPicker(post.id);
  },

  toggleReadMenu(postId) {
    const menu = document.getElementById(`read-menu-${postId}`);
    if (!menu) return;
    menu.classList.toggle('active');
    if (menu.classList.contains('active')) {
      setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
          if (!menu.contains(e.target)) {
            menu.classList.remove('active');
            document.removeEventListener('click', closeMenu);
          }
        });
      }, 0);
    }
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
    if (authorId === store.user.id) return;

    const already = this.allInteractions.some(i => i.post_id === postId && i.user_id === store.user.id && i.interaction_type === 'support');
    if (already) return;

    const post = this.currentPosts.find(p => p.id === postId);

    const { data: credited, error } = await supabase.rpc('send_support', { p_post: postId });
    if (error) {
      const msg = error.message || '';
      if (msg.includes('INSUFFICIENT_FUNDS')) return appAlert("You don't have enough in your bill to support. ₦1,000 is required.");
      if (msg.includes('ALREADY_SUPPORTED') || msg.includes('CANNOT_SUPPORT_SELF')) return;
      return appAlert("Support failed: " + msg);
    }

    this.allInteractions.push({ id: `local-${Date.now()}`, post_id: postId, user_id: store.user.id, interaction_type: 'support', amount: credited });
    this.userBalance = (this.userBalance || 0) - 1000;
    if (store.profile) store.profile.wallet_balance = this.userBalance;

    this.interestSignal(4, post?.category);
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
      if (post && post.user_id !== store.user.id) {
        await supabase.rpc('add_gp', { target_user_id: post.user_id, points_to_add: 3 });
        this.interestSignal(2, post.category);
      }
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
      const cAvatarClass = tierClass(data.profiles.total_gp, 'comment-avatar');
      const cAvatar = data.profiles.avatar_url ? `<img src="${data.profiles.avatar_url}" class="${cAvatarClass}" style="object-fit:cover;" onclick="hubInstance.showUserMenu(event, '${data.user_id}', '${postId}', '${data.profiles.full_name}')">` : `<div class="${cAvatarClass}" onclick="hubInstance.showUserMenu(event, '${data.user_id}', '${postId}', '${data.profiles.full_name}')">${data.profiles.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;
      const parsedText = this.parseTags(text);
      const commentTime = new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      list.innerHTML += `<div class="comment-item" id="comment-${data.id}">${cAvatar}<div class="comment-content-wrap"><div class="comment-meta"><span class="comment-author">${data.profiles.full_name}</span><span class="comment-time">${commentTime}</span></div><p class="comment-text">${parsedText}</p></div></div>`;
      input.value = "";
    }
    if (post && post.user_id !== store.user.id) {
      await supabase.rpc('add_gp', { target_user_id: post.user_id, points_to_add: 4 });
      this.interestSignal(3, post.category);
    }
    if (post) this.notifyMentions(postId, post, text, data?.id);
    if (this.pickedMentions) delete this.pickedMentions[postId];
  },

  // Ping every @FullName-mentioned user via the message system.
  // When the sender picked from the @ dropdown, the picked id wins —
  // namesakes who were not picked are skipped. Manually typed names
  // still fall back to matching every profile with that name.
  // The trailing [[hub:...]] marker is stripped by the chat
  // renderer, which shows a "Check it out" button that deep-links
  // to the exact post — and to the exact comment on a reply.
  async notifyMentions(postId, post, text, commentId) {
    const picks = (this.pickedMentions && this.pickedMentions[postId]) || [];

    if (!this.profileCache) {
      const { data } = await supabase.from('profiles').select('id, full_name').neq('id', store.user.id);
      this.profileCache = data || [];
    }

    const lower = text.toLowerCase();
    const myName = (store.profile?.full_name || '').toLowerCase();
    const seen = new Set();
    const marker = commentId ? ` [[hub:${postId}:${commentId}]]` : ` [[hub:${postId}]]`;

    const ping = async (receiverId) => {
      const content = `${store.profile.full_name} tagged you in the hub page: "${post.title || 'a gliim'}" — click to check it out.${marker}`;
      await supabase.from('messages').insert({ sender_id: store.user.id, receiver_id: receiverId, content, is_ai: false });
    };

    const pickedNames = new Set();
    for (const p of picks) {
      pickedNames.add((p.name || '').toLowerCase());
      if (seen.has(p.id)) continue;
      if (!lower.includes(`@${(p.name || '').toLowerCase()}`)) continue;
      seen.add(p.id);
      await ping(p.id);
    }

    for (const p of this.profileCache) {
      const name = (p.full_name || '').trim();
      if (!name || name.toLowerCase() === myName || seen.has(p.id)) continue;
      if (pickedNames.has(name.toLowerCase())) continue;
      if (!lower.includes(`@${name.toLowerCase()}`)) continue;
      seen.add(p.id);
      await ping(p.id);
    }
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
    const channelName = `hub-posts-${Date.now()}`;
    supabase.channel(channelName).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => { this.fetchPosts(); }).subscribe();
  }
};
