import { supabase } from '/shared/js/config.js';
import { store, tierClass } from '../store.js';
import { uploadFile } from '../upload.js';
import { renderFileInto } from '../reader.js?v=32';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseHashtags(text) {
  if (!text) return '';
  return escapeHtml(text).replace(/#([a-z0-9_]+)/gi, (match, tag) =>
    `<a href="#/collection?name=${tag.toLowerCase()}" class="hub-hashtag" onclick="event.stopPropagation()">#${escapeHtml(tag.toLowerCase())}</a>`
  );
}

// Client mirror of the gliim_kind classifier (sql/unify_feed.sql): video →
// bundle; audio (no video) → audiolite; document (no video/audio) → book;
// image-only (no video/audio/document/pdf) → image-only.
// Cards use it to style audiolites/books/image-only, without ever loading the body.
function gliimKindOf(blocks) {
  const types = new Set((blocks || []).map(b => b && b.type).filter(Boolean));
  if (types.has('video')) return 'bundle';
  if (types.has('audio')) return 'audiolite';
  if (types.has('document')) return 'book';
  if (types.has('pdf')) return 'bundle';
  if (types.has('image') && types.size === 1) return 'image-only';
  return null;
}

// Best-contrast text shade for a solid card color (null when the value isn't
// a plain hex — the caller then keeps the theme's own colors).
function readableOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 150 ? '#111827' : '#ffffff';
}

const hubView = {
  // Gliims live inside the merged Feed: this module owns the data,
  // the modals and realtime, while the Feed view owns the topbar, the FAB and the
  // DOM. Feed changes are pushed out through onFeedChange.
  init() {
    this.currentPosts = [];
    this.allInteractions = [];
    this.savedPosts = new Set();
    this.searchQuery = '';
    this.currentFilter = 'all';
    this.isModalOpen = false;
    this.feedLoaded = false;
    this.draggedBlock = null;
    this.editingDraftId = null;

    this.setupRealtime();

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
      const { data, error } = await supabase.from('feed_gliims')
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

  // The gliim filter menu. The button lives in the Xplore page template
  // (below the category tabs); this just wires up the event listeners.
  setupTopbarActions() {
    const filterBtn = document.getElementById('hub-filter-btn');
    if (!filterBtn) return;

    filterBtn.addEventListener('click', (e) => {
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

    // Close the filter menu when tapping anywhere else in the app
    document.addEventListener('click', () => {
      document.getElementById('hub-dropdown')?.classList.remove('active');
    });
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
        const av = u.avatar_url ? `<img src="${u.avatar_url}" class="${cls}" style="object-fit:cover;">` : `<div class="${cls}"></div>`;
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
    // Use hash parameter for persistence across refresh
    const hash = userId === store.user.id ? '#/profile' : `#/profile?u=${userId}`;
    if (window.location.hash.startsWith('#/profile')) {
      window.location.hash = hash;
    } else {
      window.location.hash = hash;
    }
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

      timer = setTimeout(async () => {        const { data } = await supabase.from('profiles')
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
            const av = u.avatar_url ? `<img src="${u.avatar_url}" class="${cls}" style="object-fit:cover;">` : `<div class="${cls}"></div>`;
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

  setupHashtagInput() {
    const input = document.getElementById('hashtag-input');
    if (!input) return;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const raw = input.value.replace(/,/g, '').trim().replace(/^#/, '');
        if (!raw) return;
        if (this.hashtags.length >= 3) { input.value = ''; return; }
        const tag = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (!tag || this.hashtags.includes(tag)) { input.value = ''; return; }
        this.hashtags.push(tag);
        input.value = '';
        this.renderHashtagChips();
      }
    });
  },

  renderHashtagChips() {
    const chips = document.getElementById('hashtag-chips');
    if (!chips) return;
    chips.innerHTML = this.hashtags.map((t, i) => `
      <span class="hub-tag-chip" style="background: rgba(99,102,241,0.12); color: var(--brand-primary);"><span>#${escapeHtml(t)}</span><button type="button" class="hub-tag-chip-x" onclick="hubInstance.removeHashtag(${i})">&times;</button></span>
    `).join('');
    const input = document.getElementById('hashtag-input');
    if (input) {
      input.placeholder = this.hashtags.length >= 3 ? 'Max 3 reached' : 'Type and press Enter...';
      input.disabled = this.hashtags.length >= 3;
    }
  },

  removeHashtag(index) {
    this.hashtags.splice(index, 1);
    this.renderHashtagChips();
  },

  async promptDelete(postId) {
    const password = await appPrompt("To permanently delete this Gliim, please enter your password:", { inputType: 'password', okText: 'Delete', danger: true });
    if (!password) return;

    const email = store.user && store.user.email;
    if (!email) return alert('Account information not available. Please sign in again.');
    
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      return alert("Incorrect password. Deletion cancelled.");
    }

    const { error: deleteError } = await supabase.from('feed_gliims').delete().eq('id', postId);
    if (deleteError) return alert("Error deleting post: " + deleteError.message);

    alert("Gliim deleted successfully.");
    this.closeModal();
    this.fetchPosts();
    window.profileInstance?.refreshProjects?.();
  },

  async openCreateModal(opts = {}) {
    // Eligibility ladder: 50 GP to post in the Feed at all.
    const userGP = (store.profile && store.profile.total_gp) || 0;
    if (userGP < 50) {
      return alert(`You need at least 50 GP to post in the Feed. You have ${userGP.toLocaleString()} GP.`);
    }

    // 1000 GP to premium-lock a bundle.
    const canLock = userGP >= 1000;

    const composerInnerHtml = `
        ${opts.inline ? '' : '<button class="modal-close" onclick="hubInstance.closeModal()">×</button>'}
        <h2 style="margin-bottom: 24px;">Publish to the Feed</h2>
        <div class="form-group"><label>Title</label><input type="text" id="post-title" class="input" placeholder="An elite headline..."></div>
        <div class="form-row" style="gap: 16px;">
          <div class="form-group" id="post-category-group" style="flex: 1;"><label>Category</label><select id="post-category" class="input"><option>Media</option><option>Tech</option><option>Business</option><option>Personal</option><option>Education</option></select></div>
          <div class="form-group" style="flex: 2;"><label>Description (SEO Summary)</label><input type="text" id="post-description" class="input" placeholder="Brief summary..."></div>
        </div>
        <div class="form-group">
          <label>Tag People (optional)</label>
          <div class="hub-tag-picker">
            <div class="hub-tag-chips" id="tag-chips"></div>
            <input type="text" id="tag-search" class="input" placeholder="Type a name to tag someone..." autocomplete="off">
            <div class="hub-tag-results" id="tag-results"></div>
          </div>
        </div>
        <div class="form-group">
          <label>Hashtags (optional, max 3)</label>
          <div class="hub-tag-picker">
            <div class="hub-tag-chips" id="hashtag-chips"></div>
            <input type="text" id="hashtag-input" class="input" placeholder="Type and press Enter..." autocomplete="off">
          </div>
        </div>
        ${canLock ? `
        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
            <input type="checkbox" id="post-premium-toggle" style="width: 18px; height: 18px; accent-color: var(--brand-primary); flex-shrink: 0;">
            <span><strong>Premium lock</strong> — viewers pay per minute while reading</span>
          </label>
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">You earn from every minute readers spend on your content. Leave it unchecked and the gliim stays free to open.</p>
        </div>
        ` : `
        <div class="form-group">
          <p style="font-size: 12px; color: var(--text-muted);">Reach <strong>1000 GP</strong> to premium-lock a gliim and charge viewers per open. You're at ${userGP.toLocaleString()} GP.</p>
        </div>
        `}
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
            <div onclick="hubInstance.addBlock('document')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg> Document</div>
            <div onclick="hubInstance.addBlock('pdf')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> PDF</div>
            <div onclick="hubInstance.addBlock('poll')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg> Poll</div>
            <div onclick="hubInstance.addBlock('table')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg> Table</div>
            <div onclick="hubInstance.addBlock('slide')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M10 4v16"></path><path d="M14 4v16"></path></svg> Slide</div>
          </div>
        </div>

        <div style="display: flex; gap: 12px; margin-top: 32px;">
          <button id="save-draft-btn" class="btn-secondary" style="flex: 1;">Save Draft</button>
          <button id="submit-post-btn" class="btn-primary" style="flex: 1;">Publish</button>
        </div>
      </div>
    `;

    let modal;
    const closeComposer = () => {
      if (opts.inline) {
        window.location.hash = '#/xplore';
      } else {
        modal.remove();
        this.isModalOpen = false;
      }
    };

    if (opts.inline) {
      const mount = document.querySelector(opts.mountPoint || '#publish-mount');
      if (!mount) return;
      mount.innerHTML = `<div id="create-modal" class="publish-composer">${composerInnerHtml}`;
      modal = mount;
    } else {
      modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `<div class="modal-content gliim-builder">${composerInnerHtml}`;
      document.body.appendChild(modal);
      this.isModalOpen = true;
    }

    this.taggedUsers = [];
    this.hashtags = [];
    this.setupTagPicker();
    this.setupHashtagInput();

    document.getElementById('add-block-trigger').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('add-block-menu').classList.toggle('active');
    });
    document.addEventListener('click', () => {
      document.getElementById('add-block-menu')?.classList.remove('active');
    });

    // Autosave: restore composer state if it exists, then wire up save on changes
    this.restoreComposerState();
    this.wireComposerAutosave();

    document.getElementById('submit-post-btn').addEventListener('click', async () => {
      const title = document.getElementById('post-title').value.trim();
      const category = document.getElementById('post-category').value;
      const rawDescription = document.getElementById('post-description').value.trim();

      if (!title) return alert("Title is required.");

      // Every pool block must be complete before we can publish.
      for (const pb of document.querySelectorAll('.builder-block[data-type="poll"]')) {
        let poll = null;
        try { poll = JSON.parse(pb.querySelector('.block-content-input').value); } catch { poll = null; }
        const opts = (poll && Array.isArray(poll.options)) ? poll.options.map(o => String(o).trim()).filter(Boolean) : [];
        if (!poll || !String(poll.question || '').trim() || opts.length < 2) {
          return alert("Your pool block needs a question and at least 2 filled options.");
        }
      }

      const tagSuffix = this.taggedUsers.map(u => `@${u.full_name}`).join(' ');
      const hashSuffix = this.hashtags.map(t => `#${t}`).join(' ');
      const description = [rawDescription, tagSuffix, hashSuffix].filter(Boolean).join(' ');

      const finalBlocks = [];
      let coverUrl = null;

      document.querySelectorAll('.builder-block').forEach(b => {
        const type = b.dataset.type;
        const content = b.querySelector('.block-content-input').value.trim();
        if (content) {
          const blockData = { type, content };
          if (type === 'text') blockData.style = b.querySelector('.block-style-select').value;
          if (type === 'image' || type === 'audio' || type === 'document') {
            const capEl = b.querySelector('.block-caption-input');
            const cap = capEl ? capEl.value.trim() : '';
            if (cap) blockData.caption = cap;
          }
          if (type === 'poll') {
            const poll = JSON.parse(content);
            blockData.question = poll.question;
            blockData.options = poll.options;
            delete blockData.content;
          }
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

      const newId = crypto.randomUUID();
      const payload = {
        id: newId,
        title, category, description,
        cover_url: coverUrl,
        user_id: store.user.id
      };
      const premiumToggle = document.getElementById('post-premium-toggle');
      if (premiumToggle && premiumToggle.checked) payload.is_premium = true;

      // No .select(): a member's gliim is forced to 'pending' and RLS hides it
      // even from its author, so RETURNING would abort the insert. We set the id.
      const { error } = await supabase.from('feed_gliims').insert(payload);

      if (error) {
        alert("Failed: " + error.message);
        btn.innerText = "Publish";
        btn.disabled = false;
        return;
      }

      // The body lives in feed_gliim_contents (RLS-locked for premium feed_gliims).
      // If that write fails, remove the shell so no empty gliim lingers.
      const { error: bodyError } = await supabase
        .from('feed_gliim_contents').insert({ post_id: newId, blocks: finalBlocks });
      if (bodyError) {
        await supabase.from('feed_gliims').delete().eq('id', newId);
        alert("Failed to save your content: " + bodyError.message);
        btn.innerText = "Publish";
        btn.disabled = false;
        return;
      }

      // Bundles (gliims) auto-publish without approval. Tag pings go out
      // immediately since the post is live.
      for (const u of this.taggedUsers) {
        const content = `${store.profile.full_name} tagged you in the hub page: "${title}" — click to check it out. [[hub:${newId}]]`;
        await supabase.from('messages').insert({ sender_id: store.user.id, receiver_id: u.id, content, is_ai: false });
      }
      this.clearComposerAutosave();
      closeComposer();
      this.fetchPosts();
    });

    // Save as Draft handler
    document.getElementById('save-draft-btn').addEventListener('click', async () => {
      const title = document.getElementById('post-title').value.trim();
      const category = document.getElementById('post-category').value;
      const rawDescription = document.getElementById('post-description').value.trim();

      if (!title) return alert("Title is required even for drafts.");

      const tagSuffix = this.taggedUsers.map(u => `@${u.full_name}`).join(' ');
      const hashSuffix = this.hashtags.map(t => `#${t}`).join(' ');
      const description = [rawDescription, tagSuffix, hashSuffix].filter(Boolean).join(' ');

      const finalBlocks = [];
      let coverUrl = null;

      document.querySelectorAll('.builder-block').forEach(b => {
        const type = b.dataset.type;
        const content = b.querySelector('.block-content-input').value.trim();
        if (content) {
          const blockData = { type, content };
          if (type === 'text') blockData.style = b.querySelector('.block-style-select').value;
          if (type === 'image' || type === 'audio' || type === 'document') {
            const capEl = b.querySelector('.block-caption-input');
            const cap = capEl ? capEl.value.trim() : '';
            if (cap) blockData.caption = cap;
          }
          finalBlocks.push(blockData);

          if (!coverUrl && (type === 'image' || type === 'video')) {
            coverUrl = content;
          }
        }
      });

      const btn = document.getElementById('save-draft-btn');
      btn.innerText = "Saving...";
      btn.disabled = true;

      const newId = crypto.randomUUID();
      const payload = {
        id: newId,
        title, category, description,
        cover_url: coverUrl,
        user_id: store.user.id,
        status: 'draft'
      };

      const { error } = await supabase.from('feed_gliims').insert(payload);

      if (error) {
        alert("Failed to save draft: " + error.message);
        btn.innerText = "Save Draft";
        btn.disabled = false;
        return;
      }

      // Save blocks if any exist
      if (finalBlocks.length > 0) {
        const { error: bodyError } = await supabase
          .from('feed_gliim_contents').insert({ post_id: newId, blocks: finalBlocks });
        if (bodyError) {
          await supabase.from('feed_gliims').delete().eq('id', newId);
          alert("Failed to save draft content: " + bodyError.message);
          btn.innerText = "Save Draft";
          btn.disabled = false;
          return;
        }
      }

      alert("Draft saved successfully!");
      this.clearComposerAutosave();
      closeComposer();
      this.fetchPosts();
    });
  },

  async openDraftComposer(draft) {
    // Clear any stale autosave from a different session — the draft itself
    // is the source of truth when editing.
    this.clearComposerAutosave();

    // Open the composer modal first
    await this.openCreateModal();
    
    // Store the draft ID so publish updates instead of inserts
    this.editingDraftId = draft.id;
    
    // Pre-fill the fields
    document.getElementById('post-title').value = draft.title || '';
    document.getElementById('post-category').value = draft.category || 'Media';
    document.getElementById('post-description').value = draft.description || '';
    
    // Pre-fill premium toggle if applicable
    const premiumToggle = document.getElementById('post-premium-toggle');
    if (premiumToggle && draft.is_premium) {
      premiumToggle.checked = true;
    }
    
    // Clear existing blocks and load draft blocks
    const blocksContainer = document.getElementById('blocks-container');
    blocksContainer.innerHTML = '';
    
    // Fetch the draft's content blocks
    const { data: contentRow } = await supabase
      .from('feed_gliim_contents')
      .select('blocks')
      .eq('post_id', draft.id)
      .maybeSingle();
    
    if (contentRow?.blocks && Array.isArray(contentRow.blocks)) {
      for (const block of contentRow.blocks) {
        this.addBlock(block.type);
        const blockDiv = blocksContainer.lastElementChild;
        blockDiv.querySelector('.block-content-input').value = block.content || '';
        
        if (block.type === 'text' && block.style) {
          blockDiv.querySelector('.block-style-select').value = block.style;
        }
        if (block.type === 'image') {
          const capEl = blockDiv.querySelector('.block-caption-input');
          if (capEl && block.caption) capEl.value = block.caption;
          
          // Show preview
          const preview = blockDiv.querySelector('.block-preview');
          if (preview) {
            preview.innerHTML = `<img src="${block.content}" style="max-width:100%;border-radius:8px;margin-top:8px;">`;
          }
          blockDiv.querySelector('.block-file-name').innerText = 'Loaded image';
          blockDiv.querySelector('.upload-status').innerText = 'Upload complete!';
          blockDiv.querySelector('.upload-status').style.color = 'var(--success)';
        }
        if (block.type === 'video' || block.type === 'audio') {
          const capEl = blockDiv.querySelector('.block-caption-input');
          if (capEl && block.caption) capEl.value = block.caption;
          const preview = blockDiv.querySelector('.block-preview');
          if (preview) {
            const mediaEl = block.type === 'video'
              ? `<video src="${block.content}" controls style="max-width:100%;border-radius:8px;margin-top:8px;"></video>`
              : `<audio src="${block.content}" controls style="width:100%;margin-top:8px;"></audio>`;
            preview.innerHTML = mediaEl;
          }
          blockDiv.querySelector('.block-file-name').innerText = 'Loaded media';
          blockDiv.querySelector('.upload-status').innerText = 'Upload complete!';
          blockDiv.querySelector('.upload-status').style.color = 'var(--success)';
        }
        if (block.type === 'document') {
          const capEl = blockDiv.querySelector('.block-caption-input');
          if (capEl && block.caption) capEl.value = block.caption;
          const preview = blockDiv.querySelector('.block-preview');
          if (preview) preview.innerHTML = '<div style="background:var(--bg-tertiary);padding:8px;border-radius:8px;margin-top:8px;font-size:12px;">Document loaded</div>';
          blockDiv.querySelector('.block-file-name').innerText = 'Loaded document';
          blockDiv.querySelector('.upload-status').innerText = 'Upload complete!';
          blockDiv.querySelector('.upload-status').style.color = 'var(--success)';
        }
        if (block.type === 'pdf') {
          let items = [];
          try {
            const parsed = JSON.parse(block.content || '');
            if (Array.isArray(parsed && parsed.items)) items = parsed.items;
          } catch { if (block.content) items = [{ pdf_url: block.content, cover_url: '', price: Number(block.price || 0) }]; }
          items.forEach((it, i) => {
            const slot = blockDiv.querySelectorAll('.pdf-slot')[i];
            if (!slot || !it || !it.pdf_url) return;
            slot.querySelector('.pdf-file-url').value = it.pdf_url;
            slot.querySelector('.pdf-file-name').textContent = 'PDF loaded';
            slot.querySelector('.pdf-file-status').textContent = 'Upload complete!';
            slot.querySelector('.pdf-file-status').style.color = 'var(--success)';
            if (it.cover_url) {
              slot.querySelector('.pdf-cover-url').value = it.cover_url;
              slot.querySelector('.pdf-cover-name').textContent = 'Cover loaded';
              slot.querySelector('.pdf-cover-status').textContent = 'Upload complete!';
              slot.querySelector('.pdf-cover-status').style.color = 'var(--success)';
              slot.querySelector('.pdf-cover-preview').innerHTML = `<img src="${escapeHtml(it.cover_url)}" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">`;
            }
            if (it.price) slot.querySelector('.pdf-price-input').value = it.price;
          });
        }
        if (block.type === 'table') {
          let data = null;
          try { data = JSON.parse(block.content || ''); } catch { data = null; }
          if (data && data.rows && data.cols) {
            blockDiv.querySelector('.table-rows-input').value = data.rows;
            blockDiv.querySelector('.table-cols-input').value = data.cols;
            blockDiv.querySelector('.table-generate-btn').click();
            if (Array.isArray(data.cells)) {
              data.cells.forEach((row, r) => {
                if (!Array.isArray(row)) return;
                row.forEach((val, c) => {
                  const inp = blockDiv.querySelector(`.table-cell-input[data-r="${r}"][data-c="${c}"]`);
                  if (inp) inp.value = val || '';
                });
              });
              blockDiv.querySelector('.block-content-input').value = block.content || '';
            }
          }
        }
      }
    } else {
      // No blocks, add a default text block
      this.addBlock('text');
    }
    
    // Change the publish button text and handler
    const publishBtn = document.getElementById('submit-post-btn');
    publishBtn.innerText = 'Publish Draft';
    
    // Clone and replace the publish button to remove old handler
    const newPublishBtn = publishBtn.cloneNode(true);
    publishBtn.parentNode.replaceChild(newPublishBtn, publishBtn);
    
    // Attach new handler that updates the draft
    newPublishBtn.addEventListener('click', async () => {
      const title = document.getElementById('post-title').value.trim();
      const category = document.getElementById('post-category').value;
      const rawDescription = document.getElementById('post-description').value.trim();

      if (!title) return alert("Title is required.");

      const tagSuffix = this.taggedUsers.map(u => `@${u.full_name}`).join(' ');
      const hashSuffix = this.hashtags.map(t => `#${t}`).join(' ');
      const description = [rawDescription, tagSuffix, hashSuffix].filter(Boolean).join(' ');

      const finalBlocks = [];
      let coverUrl = null;

      document.querySelectorAll('.builder-block').forEach(b => {
        const type = b.dataset.type;
        const content = b.querySelector('.block-content-input').value.trim();
        if (content) {
          const blockData = { type, content };
          if (type === 'text') blockData.style = b.querySelector('.block-style-select').value;
          if (type === 'image' || type === 'audio' || type === 'document') {
            const capEl = b.querySelector('.block-caption-input');
            const cap = capEl ? capEl.value.trim() : '';
            if (cap) blockData.caption = cap;
          }
          finalBlocks.push(blockData);

          if (!coverUrl && (type === 'image' || type === 'video')) {
            coverUrl = content;
          }
        }
      });

      if (finalBlocks.length === 0) return alert("Add some content blocks.");

      const btn = newPublishBtn;
      btn.innerText = "Publishing...";
      btn.disabled = true;

      const payload = {
        title, category, description,
        cover_url: coverUrl,
        status: 'approved'
      };
      const premiumToggle = document.getElementById('post-premium-toggle');
      if (premiumToggle && premiumToggle.checked) payload.is_premium = true;

      // Update the existing draft
      const { error } = await supabase.from('feed_gliims').update(payload).eq('id', this.editingDraftId);

      if (error) {
        alert("Failed: " + error.message);
        btn.innerText = "Publish Draft";
        btn.disabled = false;
        return;
      }

      // Update the content blocks
      const { error: bodyError } = await supabase
        .from('feed_gliim_contents')
        .update({ blocks: finalBlocks })
        .eq('post_id', this.editingDraftId);
      
      if (bodyError) {
        alert("Failed to save content: " + bodyError.message);
        btn.innerText = "Publish Draft";
        btn.disabled = false;
        return;
      }

      // Tag pings
      for (const u of this.taggedUsers) {
        const content = `${store.profile.full_name} tagged you in the hub page: "${title}" — click to check it out. [[hub:${this.editingDraftId}]]`;
        await supabase.from('messages').insert({ sender_id: store.user.id, receiver_id: u.id, content, is_ai: false });
      }
      
      this.clearComposerAutosave();
      this.editingDraftId = null;
      document.querySelector('.modal-overlay').remove();
      this.fetchPosts();
    });
    
    // Also update the save draft button to update instead of insert
    const saveDraftBtn = document.getElementById('save-draft-btn');
    const newSaveDraftBtn = saveDraftBtn.cloneNode(true);
    saveDraftBtn.parentNode.replaceChild(newSaveDraftBtn, saveDraftBtn);
    
    newSaveDraftBtn.addEventListener('click', async () => {
      const title = document.getElementById('post-title').value.trim();
      const category = document.getElementById('post-category').value;
      const rawDescription = document.getElementById('post-description').value.trim();

      if (!title) return alert("Title is required even for drafts.");

      const tagSuffix = this.taggedUsers.map(u => `@${u.full_name}`).join(' ');
      const hashSuffix = this.hashtags.map(t => `#${t}`).join(' ');
      const description = [rawDescription, tagSuffix, hashSuffix].filter(Boolean).join(' ');

      const finalBlocks = [];
      let coverUrl = null;

      document.querySelectorAll('.builder-block').forEach(b => {
        const type = b.dataset.type;
        const content = b.querySelector('.block-content-input').value.trim();
        if (content) {
          const blockData = { type, content };
          if (type === 'text') blockData.style = b.querySelector('.block-style-select').value;
          if (type === 'image' || type === 'audio' || type === 'document') {
            const capEl = b.querySelector('.block-caption-input');
            const cap = capEl ? capEl.value.trim() : '';
            if (cap) blockData.caption = cap;
          }
          finalBlocks.push(blockData);

          if (!coverUrl && (type === 'image' || type === 'video')) {
            coverUrl = content;
          }
        }
      });

      const btn = newSaveDraftBtn;
      btn.innerText = "Saving...";
      btn.disabled = true;

      const payload = {
        title, category, description,
        cover_url: coverUrl,
        status: 'draft'
      };

      const { error } = await supabase.from('feed_gliims').update(payload).eq('id', this.editingDraftId);

      if (error) {
        alert("Failed to save draft: " + error.message);
        btn.innerText = "Save Draft";
        btn.disabled = false;
        return;
      }

      // Update blocks
      if (finalBlocks.length > 0) {
        const { error: bodyError } = await supabase
          .from('feed_gliim_contents')
          .update({ blocks: finalBlocks })
          .eq('post_id', this.editingDraftId);
        
        if (bodyError) {
          alert("Failed to save draft content: " + bodyError.message);
          btn.innerText = "Save Draft";
          btn.disabled = false;
          return;
        }
      }

      alert("Draft updated!");
      this.clearComposerAutosave();
      this.editingDraftId = null;
      document.querySelector('.modal-overlay').remove();
      this.fetchPosts();
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
    if (type === 'document') iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>';
    if (type === 'pdf') iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
    if (type === 'poll') iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>';
    if (type === 'table') iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>';
    if (type === 'slide') iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M10 4v16"></path><path d="M14 4v16"></path></svg>';

    const removeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

    let inputHtml = '';
    if (type === 'text') {
      inputHtml = `<select class="input block-style-select" style="margin-bottom: 8px;"><option value="paragraph">Paragraph</option><option value="title">Title</option><option value="subtitle">Subtitle</option><option value="list">List</option></select><textarea class="input block-content-input" placeholder="Write your text..." rows="4"></textarea>`;
    } else if (type === 'poll') {
      inputHtml = `
        <input type="text" class="input poll-question-input" placeholder="Ask a question..." style="margin-bottom: 8px;">
        <div class="poll-options" style="display: flex; flex-direction: column; gap: 8px;"></div>
        <button type="button" class="btn-secondary poll-add-option" style="margin-top: 8px; padding: 6px 12px; font-size: 13px;">+ Add Option</button>
        <input type="hidden" class="block-content-input">
      `;
    } else if (type === 'pdf') {
      const pdfSlot = (i) => `
        <div class="pdf-slot" data-slot="${i}">
          <div class="pdf-slot-title">PDF ${i + 1}</div>
          <label class="custom-file-upload">
            <img src="/icons/clip.svg" class="upload-icon-img" alt="Upload">
            <span class="pdf-cover-name">Choose cover image</span>
            <input type="file" class="pdf-cover-input" accept="image/*" hidden>
          </label>
          <div class="upload-status pdf-cover-status"></div>
          <div class="pdf-cover-preview"></div>
          <label class="custom-file-upload">
            <img src="/icons/clip.svg" class="upload-icon-img" alt="Upload">
            <span class="pdf-file-name">Choose PDF file</span>
            <input type="file" class="pdf-file-input" accept="application/pdf" hidden>
          </label>
          <div class="upload-status pdf-file-status"></div>
          <input type="number" class="input pdf-price-input" min="0" step="1" placeholder="Price in ₦ (0 = free)">
          <input type="hidden" class="pdf-cover-url">
          <input type="hidden" class="pdf-file-url">
        </div>`;
      inputHtml = `<div class="pdf-slot-row">${pdfSlot(0)}${pdfSlot(1)}</div><input type="hidden" class="block-content-input">`;
    } else if (type === 'table') {
      inputHtml = `
        <div class="table-config" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
          <label style="font-size:12px;font-weight:600;color:var(--text-muted);">Rows</label>
          <input type="number" class="input table-rows-input" min="1" max="20" value="2" style="width:60px;">
          <label style="font-size:12px;font-weight:600;color:var(--text-muted);">Cols</label>
          <input type="number" class="input table-cols-input" min="1" max="10" value="2" style="width:60px;">
          <button type="button" class="btn-secondary table-generate-btn" style="padding:6px 12px;font-size:13px;">Generate</button>
        </div>
        <div class="table-grid-wrapper" style="overflow-x:auto;"></div>
        <input type="hidden" class="block-content-input">
      `;
    } else if (type === 'slide') {
      inputHtml = `
        <div class="slide-carousel-wrapper">
          <div class="slide-list"></div>
          <button type="button" class="btn-secondary slide-add-btn" style="margin-top:8px;padding:6px 12px;font-size:13px;width:100%;">+ Add Slide</button>
        </div>
        <input type="hidden" class="block-content-input">
      `;
    } else {
      const accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : type === 'audio' ? 'audio/*' : type === 'document' ? '.pdf,.doc,.docx,.epub' : '*/*';
      inputHtml = `
        <label class="custom-file-upload">
          <img src="/icons/clip.svg" class="upload-icon-img" alt="Upload">
          <span class="block-file-name">Choose ${type}</span>
          <input type="file" class="block-file-input" accept="${accept}" hidden>
        </label>
        <div class="upload-status" style="font-size: 12px; margin-top: 8px;"></div>
        <div class="block-preview"></div>
        ${['image', 'audio', 'document'].includes(type) ? `<input type="text" class="input block-caption-input" placeholder="${type === 'image' ? 'Caption (optional)' : type === 'audio' ? 'Chapter title (optional)' : 'Document title (optional)'}" style="margin-top: 8px;">` : ''}
        <input type="hidden" class="block-content-input">
      `;
    }

    blockDiv.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;"><div style="display: flex; align-items: center; gap: 8px;"><span class="block-drag-handle" style="cursor: grab; padding: 4px; display: flex; align-items: center;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5;"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg></span><span class="block-label">${iconHtml}</span></div><button class="block-remove-btn" onclick="this.parentElement.parentElement.remove(); hubInstance.saveComposerState()">${removeIcon}</button></div>${inputHtml}`;
    blocksContainer.appendChild(blockDiv);

    if (type === 'poll') {
      const optionsDiv = blockDiv.querySelector('.poll-options');
      const hiddenInput = blockDiv.querySelector('.block-content-input');
      const syncPoll = () => {
        const question = blockDiv.querySelector('.poll-question-input').value.trim();
        const options = Array.from(optionsDiv.querySelectorAll('.poll-option-input'))
          .map(i => i.value.trim()).filter(Boolean);
        hiddenInput.value = (question || options.length)
          ? JSON.stringify({ question, options })
          : '';
      };
      const addOption = (value = '') => {
        if (optionsDiv.children.length >= 6) return;
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
        row.innerHTML = `<input type="text" class="input poll-option-input" placeholder="Option ${optionsDiv.children.length + 1}" value="${escapeHtml(value)}"><button type="button" class="poll-option-remove" aria-label="Remove option" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;">×</button>`;
        row.querySelector('.poll-option-input').addEventListener('input', syncPoll);
        row.querySelector('.poll-option-remove').onclick = () => {
          if (optionsDiv.children.length <= 2) return;
          row.remove();
          optionsDiv.querySelectorAll('.poll-option-input').forEach((inp, i) => { inp.placeholder = `Option ${i + 1}`; });
          syncPoll();
        };
        optionsDiv.appendChild(row);
      };
      addOption();
      addOption();
      blockDiv.querySelector('.poll-question-input').addEventListener('input', syncPoll);
      blockDiv.querySelector('.poll-add-option').onclick = () => {
        addOption();
        syncPoll();
      };
      return;
    }

    if (type === 'table') {
      const wrapper = blockDiv.querySelector('.table-grid-wrapper');
      const hiddenInput = blockDiv.querySelector('.block-content-input');
      const rowsInput = blockDiv.querySelector('.table-rows-input');
      const colsInput = blockDiv.querySelector('.table-cols-input');
      const genBtn = blockDiv.querySelector('.table-generate-btn');

      const buildTable = (rows, cols, existingCells) => {
        let html = '<table class="table-grid" style="border-collapse:collapse;width:max-content;min-width:100%;">';
        for (let r = 0; r < rows; r++) {
          html += '<tr>';
          for (let c = 0; c < cols; c++) {
            const val = existingCells && existingCells[r] ? (existingCells[r][c] || '') : '';
            html += `<td style="border:1px solid var(--border);padding:0;min-width:100px;"><input type="text" class="input table-cell-input" data-r="${r}" data-c="${c}" value="${escapeHtml(val)}" placeholder="Cell ${r+1},${c+1}" style="border:none;border-radius:0;font-size:13px;padding:8px;min-width:90px;background:transparent;"></td>`;
          }
          html += '</tr>';
        }
        html += '</table>';
        wrapper.innerHTML = html;
        wrapper.querySelectorAll('.table-cell-input').forEach(inp => {
          inp.addEventListener('input', syncTable);
        });
        syncTable();
      };

      const syncTable = () => {
        const rows = parseInt(rowsInput.value) || 0;
        const cols = parseInt(colsInput.value) || 0;
        if (rows < 1 || cols < 1) { hiddenInput.value = ''; return; }
        const cells = [];
        for (let r = 0; r < rows; r++) {
          cells[r] = [];
          for (let c = 0; c < cols; c++) {
            const inp = wrapper.querySelector(`.table-cell-input[data-r="${r}"][data-c="${c}"]`);
            cells[r][c] = inp ? inp.value : '';
          }
        }
        const hasContent = cells.some(row => row.some(c => c.trim()));
        hiddenInput.value = hasContent ? JSON.stringify({ rows, cols, cells }) : '';
      };

      genBtn.onclick = () => {
        const rows = Math.min(20, Math.max(1, parseInt(rowsInput.value) || 2));
        const cols = Math.min(10, Math.max(1, parseInt(colsInput.value) || 2));
        rowsInput.value = rows;
        colsInput.value = cols;
        buildTable(rows, cols);
      };

      rowsInput.addEventListener('change', () => {
        const rows = Math.min(20, Math.max(1, parseInt(rowsInput.value) || 2));
        const cols = Math.min(10, Math.max(1, parseInt(colsInput.value) || 2));
        rowsInput.value = rows;
        colsInput.value = cols;
        buildTable(rows, cols);
      });
      colsInput.addEventListener('change', () => {
        const rows = Math.min(20, Math.max(1, parseInt(rowsInput.value) || 2));
        const cols = Math.min(10, Math.max(1, parseInt(colsInput.value) || 2));
        rowsInput.value = rows;
        colsInput.value = cols;
        buildTable(rows, cols);
      });

      buildTable(parseInt(rowsInput.value) || 2, parseInt(colsInput.value) || 2);
      return;
    }

    if (type === 'slide') {
      const slideList = blockDiv.querySelector('.slide-list');
      const hiddenInput = blockDiv.querySelector('.block-content-input');
      let slideIndex = 0;

      const syncSlides = () => {
        const slides = [];
        slideList.querySelectorAll('.slide-item').forEach(item => {
          const sType = item.dataset.slideType;
          if (sType === 'text') {
            const content = item.querySelector('.slide-text-input').value.trim();
            if (content) slides.push({ type: 'text', content });
          } else if (sType === 'image') {
            const url = item.querySelector('.slide-file-url').value;
            const caption = item.querySelector('.slide-caption-input')?.value.trim() || '';
            if (url) slides.push({ type: 'image', url, caption });
          } else if (sType === 'video') {
            const url = item.querySelector('.slide-file-url').value;
            if (url) slides.push({ type: 'video', url });
          } else if (sType === 'audio') {
            const url = item.querySelector('.slide-file-url').value;
            const title = item.querySelector('.slide-caption-input')?.value.trim() || '';
            if (url) slides.push({ type: 'audio', url, title });
          }
        });
        hiddenInput.value = slides.length ? JSON.stringify({ slides }) : '';
      };

      const addSlide = () => {
        const idx = slideIndex++;
        const item = document.createElement('div');
        item.className = 'slide-item';
        item.dataset.slideType = 'image';
        item.innerHTML = `
          <div class="slide-item-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <select class="input slide-type-select" style="width:auto;font-size:12px;padding:4px 8px;">
              <option value="image" selected>Image</option>
              <option value="video">Video</option>
              <option value="text">Text</option>
              <option value="audio">Audio</option>
            </select>
            <button type="button" class="slide-remove-btn" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;">×</button>
          </div>
          <div class="slide-item-body"></div>
        `;
        slideList.appendChild(item);

        const body = item.querySelector('.slide-item-body');
        const typeSelect = item.querySelector('.slide-type-select');

        const renderBody = (sType) => {
          item.dataset.slideType = sType;
          if (sType === 'text') {
            body.innerHTML = `<textarea class="input slide-text-input" placeholder="Slide text..." rows="3" style="font-size:13px;"></textarea>`;
            body.querySelector('.slide-text-input').addEventListener('input', syncSlides);
          } else {
            const accept = sType === 'image' ? 'image/*' : sType === 'video' ? 'video/*' : 'audio/*';
            const captionLabel = sType === 'image' ? 'Caption (optional)' : sType === 'audio' ? 'Title (optional)' : '';
            body.innerHTML = `
              <label class="custom-file-upload" style="font-size:12px;">
                <img src="/icons/clip.svg" class="upload-icon-img" alt="Upload">
                <span class="slide-file-name">Choose ${sType}</span>
                <input type="file" class="slide-file-input" accept="${accept}" hidden>
              </label>
              <div class="upload-status slide-upload-status" style="font-size:11px;margin-top:4px;"></div>
              <input type="hidden" class="slide-file-url">
              ${captionLabel ? `<input type="text" class="input slide-caption-input" placeholder="${captionLabel}" style="margin-top:6px;font-size:12px;">` : ''}
            `;
            const fileInput = body.querySelector('.slide-file-input');
            const urlInput = body.querySelector('.slide-file-url');
            const statusEl = body.querySelector('.slide-upload-status');
            const nameEl = body.querySelector('.slide-file-name');
            fileInput.addEventListener('change', async () => {
              const file = fileInput.files[0];
              if (!file) return;
              statusEl.textContent = 'Uploading...';
              statusEl.style.color = 'var(--brand-primary)';
              try {
                const url = await uploadFile(file, sType, (percent) => {
                  statusEl.textContent = `Uploading... ${percent}%`;
                });
                urlInput.value = url;
                nameEl.textContent = file.name;
                statusEl.textContent = 'Done';
                statusEl.style.color = 'var(--success)';
              } catch (err) {
                statusEl.textContent = err.message || 'Upload failed';
                statusEl.style.color = 'var(--error)';
              }
              syncSlides();
            });
            urlInput.addEventListener('change', syncSlides);
            const captionInput = body.querySelector('.slide-caption-input');
            if (captionInput) captionInput.addEventListener('input', syncSlides);
          }
        };

        typeSelect.addEventListener('change', () => renderBody(typeSelect.value));
        renderBody('image');

        item.querySelector('.slide-remove-btn').onclick = () => {
          if (slideList.querySelectorAll('.slide-item').length <= 1) return;
          item.remove();
          syncSlides();
        };
      };

      blockDiv.querySelector('.slide-add-btn').onclick = () => {
        if (slideList.querySelectorAll('.slide-item').length >= 20) return;
        addSlide();
      };

      addSlide();
      return;
    }

    // Make block draggable
    blockDiv.draggable = true;
    const dragHandle = blockDiv.querySelector('.block-drag-handle');
    
    dragHandle.addEventListener('mousedown', () => {
      blockDiv.draggable = true;
    });
    
    blockDiv.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', blockDiv.outerHTML);
      blockDiv.style.opacity = '0.4';
      hubView.draggedBlock = blockDiv;
    });
    
    blockDiv.addEventListener('dragend', (e) => {
      blockDiv.style.opacity = '';
      document.querySelectorAll('.builder-block').forEach(b => {
        b.style.borderTop = '';
        b.style.borderBottom = '';
      });
      hubView.draggedBlock = null;
    });
    
    blockDiv.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      const dragged = hubView.draggedBlock;
      if (!dragged || dragged === blockDiv) return;
      
      const rect = blockDiv.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      
      // Reset all borders
      document.querySelectorAll('.builder-block').forEach(b => {
        b.style.borderTop = '';
        b.style.borderBottom = '';
      });
      
      // Show indicator
      if (e.clientY < midpoint) {
        blockDiv.style.borderTop = '2px solid var(--brand-primary)';
      } else {
        blockDiv.style.borderBottom = '2px solid var(--brand-primary)';
      }
    });
    
    blockDiv.addEventListener('dragleave', (e) => {
      blockDiv.style.borderTop = '';
      blockDiv.style.borderBottom = '';
    });
    
    blockDiv.addEventListener('drop', (e) => {
      e.preventDefault();
      const dragged = hubView.draggedBlock;
      if (!dragged || dragged === blockDiv) return;
      
      const rect = blockDiv.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      
      if (e.clientY < midpoint) {
        blocksContainer.insertBefore(dragged, blockDiv);
      } else {
        blocksContainer.insertBefore(dragged, blockDiv.nextSibling);
      }
      
      // Clean up borders
      document.querySelectorAll('.builder-block').forEach(b => {
        b.style.borderTop = '';
        b.style.borderBottom = '';
      });
    });

    const runUpload = async (file, kind, statusEl, urlEl, inputEl, onDone) => {
      statusEl.style.color = 'var(--brand-primary)';
      try {
        statusEl.textContent = 'Uploading... 0%';
        const fileUrl = await uploadFile(file, kind, (percent) => {
          statusEl.textContent = `Uploading... ${percent}%`;
        });
        urlEl.value = fileUrl;
        statusEl.textContent = 'Upload complete!';
        statusEl.style.color = 'var(--success)';
        if (onDone) onDone(fileUrl);
      } catch (err) {
        statusEl.style.color = 'var(--error)';
        statusEl.textContent = '';
        statusEl.append(err.message || 'Upload failed.');
        const retry = document.createElement('a');
        retry.textContent = 'Retry';
        retry.style.cssText = 'margin-left: 6px; color: var(--brand-primary); text-decoration: underline; cursor: pointer;';
        retry.onclick = (ev) => { ev.preventDefault(); runUpload(file, kind, statusEl, urlEl, inputEl, onDone); };
        const reset = document.createElement('a');
        reset.textContent = 'Start over';
        reset.style.cssText = 'margin-left: 6px; color: var(--brand-primary); text-decoration: underline; cursor: pointer;';
        reset.onclick = (ev) => { ev.preventDefault(); urlEl.value = ''; inputEl.value = ''; inputEl.click(); };
        statusEl.append(retry, ' · ', reset);
      }
    };

    if (type === 'pdf') {
      const hiddenInput = blockDiv.querySelector('.block-content-input');
      const syncPdfBlock = () => {
        const items = [];
        blockDiv.querySelectorAll('.pdf-slot').forEach(slot => {
          const pdfUrl = slot.querySelector('.pdf-file-url').value;
          if (!pdfUrl) return;
          items.push({
            cover_url: slot.querySelector('.pdf-cover-url').value || '',
            pdf_url: pdfUrl,
            price: Math.max(0, Math.round(Number(slot.querySelector('.pdf-price-input').value) || 0))
          });
        });
        hiddenInput.value = items.length ? JSON.stringify({ items }) : '';
      };
      blockDiv.querySelectorAll('.pdf-slot').forEach(slot => {
        const coverInput = slot.querySelector('.pdf-cover-input');
        coverInput.addEventListener('change', () => {
          const file = coverInput.files[0];
          if (!file) return;
          slot.querySelector('.pdf-cover-name').textContent = file.name;
          runUpload(file, 'media', slot.querySelector('.pdf-cover-status'), slot.querySelector('.pdf-cover-url'), coverInput, (url) => {
            slot.querySelector('.pdf-cover-preview').innerHTML = `<img src="${url}" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">`;
            syncPdfBlock();
          });
        });
        const fileInput = slot.querySelector('.pdf-file-input');
        fileInput.addEventListener('change', () => {
          const file = fileInput.files[0];
          if (!file) return;
          slot.querySelector('.pdf-file-name').textContent = file.name;
          runUpload(file, 'library', slot.querySelector('.pdf-file-status'), slot.querySelector('.pdf-file-url'), fileInput, syncPdfBlock);
        });
        slot.querySelector('.pdf-price-input').addEventListener('input', syncPdfBlock);
      });
    } else if (type !== 'text') {
      blockDiv.querySelector('.block-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        blockDiv.querySelector('.block-file-name').innerText = file.name;
        // EPUB/DOCX/PDF masters ride the 'library' kind — the 'media' presign
        // only accepts images, audio and video.
        runUpload(file, type === 'document' ? 'library' : 'media', blockDiv.querySelector('.upload-status'), blockDiv.querySelector('.block-content-input'), e.target, (fileUrl) => {
          const preview = blockDiv.querySelector('.block-preview');
          preview.innerHTML = type === 'image' ? `<img src="${fileUrl}" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">` : `<div style="background:var(--bg-tertiary);padding:8px;border-radius:8px;margin-top:8px;font-size:12px;">File ready</div>`;
        });
      });
    }
  },

  // Autosave: serialize composer state to localStorage so a refresh doesn't
  // wipe the user's work-in-progress.
  saveComposerState() {
    const modal = document.getElementById('create-modal');
    if (!modal) return;
    const blocks = [];
    modal.querySelectorAll('.builder-block').forEach(block => {
      const type = block.dataset.type;
      const content = block.querySelector('.block-content-input')?.value || '';
      const style = block.querySelector('.block-style-select')?.value || '';
      const caption = block.querySelector('.block-caption-input')?.value || '';
      blocks.push({ type, content, style, caption });
    });
    const state = {
      title: document.getElementById('post-title')?.value || '',
      description: document.getElementById('post-description')?.value || '',
      category: document.getElementById('post-category')?.value || '',
      taggedUsers: this.taggedUsers || [],
      hashtags: this.hashtags || [],
      premium: document.getElementById('post-premium-toggle')?.checked || false,
      blocks
    };
    try {
      localStorage.setItem('gliim_composer_autosave', JSON.stringify(state));
    } catch { /* quota exceeded — silently skip */ }
  },

  restoreComposerState() {
    try {
      const raw = localStorage.getItem('gliim_composer_autosave');
      if (!raw) return;
      const state = JSON.parse(raw);
      const modal = document.getElementById('create-modal');
      if (!modal) return;

      if (state.title) {
        const titleInput = document.getElementById('post-title');
        if (titleInput) titleInput.value = state.title;
      }
      if (state.description) {
        const descInput = document.getElementById('post-description');
        if (descInput) descInput.value = state.description;
      }
      if (state.category) {
        const catSelect = document.getElementById('post-category');
        if (catSelect) catSelect.value = state.category;
      }
      if (state.premium) {
        const premiumToggle = document.getElementById('post-premium-toggle');
        if (premiumToggle) premiumToggle.checked = true;
      }
      if (state.taggedUsers && state.taggedUsers.length) {
        this.taggedUsers = state.taggedUsers;
        const taggedDiv = document.getElementById('tagged-users-list');
        if (taggedDiv) {
          taggedDiv.innerHTML = state.taggedUsers.map(u =>
            `<div class="tagged-user-chip">${escapeHtml(u.full_name)}<button type="button" class="tagged-user-remove" onclick="hubInstance.removeTaggedUser('${u.id}')">×</button></div>`
          ).join('');
        }
        this.renderTagChips();
      }
      if (state.hashtags && state.hashtags.length) {
        this.hashtags = state.hashtags;
        this.renderHashtagChips();
      }

      // Restore blocks: remove the default empty text block, then rebuild
      if (state.blocks && state.blocks.length) {
        const builder = modal.querySelector('.block-builder');
        if (builder) {
          builder.innerHTML = '';
          for (const block of state.blocks) {
            this.addBlock(block.type);
            const blockDiv = builder.lastElementChild;
            if (!blockDiv) continue;
            if (block.content) {
              const contentInput = blockDiv.querySelector('.block-content-input');
              if (contentInput) contentInput.value = block.content;
            }
            if (block.style) {
              const styleSelect = blockDiv.querySelector('.block-style-select');
              if (styleSelect) styleSelect.value = block.style;
            }
            if (block.caption) {
              const captionInput = blockDiv.querySelector('.block-caption-input');
              if (captionInput) captionInput.value = block.caption;
            }
            if (block.type === 'table' && block.content) {
              let data = null;
              try { data = JSON.parse(block.content); } catch { data = null; }
              if (data && data.rows && data.cols) {
                blockDiv.querySelector('.table-rows-input').value = data.rows;
                blockDiv.querySelector('.table-cols-input').value = data.cols;
                blockDiv.querySelector('.table-generate-btn').click();
                if (Array.isArray(data.cells)) {
                  data.cells.forEach((row, r) => {
                    if (!Array.isArray(row)) return;
                    row.forEach((val, c) => {
                      const inp = blockDiv.querySelector(`.table-cell-input[data-r="${r}"][data-c="${c}"]`);
                      if (inp) inp.value = val || '';
                    });
                  });
                  const ci = blockDiv.querySelector('.block-content-input');
                  if (ci) ci.value = block.content;
                }
              }
            }
          }
        }
      }
    } catch { /* corrupt data — ignore */ }
  },

  wireComposerAutosave() {
    if (this._autosaveWired) return;
    this._autosaveWired = true;
    const modal = document.getElementById('create-modal');
    if (!modal) return;

    // Save on any input/change in the modal
    modal.addEventListener('input', () => this.saveComposerState());
    modal.addEventListener('change', () => this.saveComposerState());

    // Also save when blocks are added (these don't always fire input)
    const originalAddBlock = this.addBlock.bind(this);
    this.addBlock = (type) => {
      originalAddBlock(type);
      this.saveComposerState();
    };
  },

  clearComposerAutosave() {
    try {
      localStorage.removeItem('gliim_composer_autosave');
    } catch { /* ignore */ }
  },

  // A PDF tile click: owners and free files download directly; priced files
  // are included in the per-minute heartbeat billing — no separate unlock.
  async openPdfTile(el) {
    const url = el.dataset.pdf;
    if (!url) return;
    const isOwner = el.dataset.creator && el.dataset.creator === store.user.id;
    const download = () => {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    if (isOwner) return download();
    download();
  },

  async fetchPosts() {
    // No blocks column here: gliim bodies live in feed_gliim_contents and are
    // fetched per-open, so premium content never rides along in the feed.
    // status drives CRM moderation: only 'approved' gliims are shown (a
    // pending/rejected row is invisible to everyone but staff). The legacy
    // fallback drops is_premium AND status for a pre-migration database.
    const colsFull = `id, title, category, description, cover_url, views, created_at, user_id, is_premium, status, profiles:profiles!user_id(full_name, avatar_url, total_gp)`;
    const colsLegacy = `id, title, category, description, cover_url, views, created_at, user_id, profiles:profiles!user_id(full_name, avatar_url, total_gp)`;
    const load = (cols) => Promise.all([
      supabase.from('feed_gliims').select(cols).order('created_at', { ascending: false }),
      supabase.from('feed_interactions').select('id, post_id, user_id, interaction_type, amount, comment_text, created_at, profiles:profiles!user_id(full_name, avatar_url)'),
      supabase.from('profiles').select('wallet_balance, total_gp').eq('id', store.user.id).single(),
      supabase.from('saved_items').select('item_id').eq('user_id', store.user.id)
    ]);

    let [{ data: feed_gliims, error }, { data: interactions }, { data: profile }, { data: saved }] = await load(colsFull);
    if (error) {
      // Pre-migration fallback: feed_gliims.is_premium / feed_gliims.status may not exist yet.
      [{ data: feed_gliims, error }, { data: interactions }, { data: profile }, { data: saved }] = await load(colsLegacy);
    }
    if (error) { console.error(error); return; }
    this.userBalance = profile?.wallet_balance || 0;
    this.userGP = profile?.total_gp || 0;
    this.allInteractions = interactions || [];
    
    // A row with no status predates moderation and stays visible; approved gliims
    // reach the feed; drafts are visible to their owners.
    const visible = (feed_gliims || []).filter(p => !p.status || p.status === 'approved' || (p.status === 'draft' && p.user_id === store.user.id));
    this.currentPosts = this.orderFeed(visible);
    this.savedPosts = new Set(saved?.map(s => s.item_id) || []);

    // Card kind detection: read only the block shapes of the listed posts
    // (never the bodies — RLS withholds premium rows here just the same, so
    // a locked post simply falls back to the default card).
    this.cardKinds = {};
    try {
      const ids = (feed_gliims || []).map(p => p.id);
      if (ids.length) {
        const { data: kindRows } = await supabase.from('feed_gliim_contents').select('post_id, blocks').in('post_id', ids);
        for (const row of kindRows || []) this.cardKinds[row.post_id] = gliimKindOf(row.blocks);
      }
    } catch { /* cards keep the default style */ }

    this.feedLoaded = true;
    this.renderPosts(this.currentPosts);
  },

  // Gliim cards live inside the merged Library feed, so filtering and card
  // markup are split out: Library interleaves these cards with shelf items.
  async filterPosts(feed_gliims) {
    let filtered = feed_gliims || this.currentPosts || [];

    if (this.currentFilter === 'drafts') {
      filtered = filtered.filter(p => p.status === 'draft' && p.user_id === store.user.id);
    } else {
      // Exclude drafts from all filters except 'drafts'
      filtered = filtered.filter(p => p.status !== 'draft');
      
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
      } else if (this.currentFilter === 'xploring') {
        // Xploring: only show posts from users I'm following, sorted by interest score
        const { data: following } = await supabase.from('followed_users').select('followed_id').eq('follower_id', store.user.id);
        const followingIds = new Set((following || []).map(f => f.followed_id));
        filtered = filtered.filter(p => followingIds.has(p.user_id));
        
        const interest = this.loadInterest();
        filtered = filtered.map(p => ({ post: p, score: this.feedScore(p, interest) }))
          .sort((a, b) => b.score - a.score)
          .map(x => x.post);
      } else if (this.currentFilter !== 'all') {
        filtered = filtered.filter(p => p.category === this.currentFilter);
      }
    }

    if (this.searchQuery) {
      filtered = filtered.filter(p => p.title?.toLowerCase().includes(this.searchQuery) || p.description?.toLowerCase().includes(this.searchQuery) || p.category?.toLowerCase().includes(this.searchQuery));
    }

    return filtered;
  },

  renderPostCard(post) {
    const premiumPrice = Number((this.billingSummary && this.billingSummary.prices && this.billingSummary.prices.premium_unlock) || 0);
    const isAmbassador = (post.profiles?.total_gp || 0) >= 5000;
    const avatarClass = tierClass(post.profiles?.total_gp, 'blog-avatar');
    const avatar = post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="${avatarClass}" style="object-fit:cover;">` : `<div class="${avatarClass}"></div>`;

    const comments = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'comment').length;
    const coverHtml = post.cover_url ? `<div class="blog-cover" style="background-image: url('${post.cover_url}');"></div>` : '';
    const lockSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
    const premiumBadge = post.is_premium ? `<span class="blog-premium-badge" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:rgba(245,158,11,.15);color:#B45309;font-size:11px;font-weight:700;">${lockSvg}${premiumPrice ? `₦${premiumPrice.toLocaleString()}` : 'Premium'}</span>` : '';
    const draftBadge = post.status === 'draft' ? `<span class="blog-draft-badge" style="display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(107,114,128,.15);color:#4B5563;font-size:11px;font-weight:700;">Draft</span>` : '';
    const eyeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    const commentSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';

    // Audiolites: cover image background with a centered headset icon,
    // title + author + stats at the bottom, badges in the corner.
    if (this.cardKinds && this.cardKinds[post.id] === 'audiolite') {
      const headsetSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>';
      if (post.cover_url) {
        const cardStyle = `background-image: url('${post.cover_url}');`;
        return `<article class="audiolite-card audiolite-cover-card${isAmbassador ? ' ambassador-card' : ''}" id="post-${post.id}" style="${cardStyle}" onclick="hubInstance.openReadView('${post.id}')">
          ${draftBadge || premiumBadge ? `<div class="book-cover-badges">${draftBadge}${premiumBadge}</div>` : ''}
          <div class="audiolite-center-icon">${headsetSvg}</div>
          <h2 class="audiolite-title">${post.title || 'Untitled Gliim'}</h2>
          <div class="blog-footer"><div class="blog-author hub-author-hit" onclick="event.stopPropagation(); hubInstance.viewAuthor('${post.user_id}')"><div style="position:relative;">${avatar}</div><span>${escapeHtml(post.profiles?.full_name || 'Gliimait')}</span></div><div class="blog-stats"><span class="blog-stat">${eyeSvg}${post.views || 0}</span><span class="blog-stat">${commentSvg}${comments}</span></div></div>
        </article>`;
      }
      const color = String(post.cover_color || '').trim();
      const onColor = readableOn(color);
      const cardStyle = color && onColor ? ` style="background:${escapeHtml(color)};color:${onColor};"` : '';
      return `<article class="audiolite-card${isAmbassador ? ' ambassador-card' : ''}" id="post-${post.id}"${cardStyle} onclick="hubInstance.openReadView('${post.id}')">
        ${draftBadge || premiumBadge ? `<div class="book-cover-badges">${draftBadge}${premiumBadge}</div>` : ''}
        <div class="audiolite-center-icon">${headsetSvg}</div>
        <h2 class="audiolite-title">${post.title || 'Untitled Gliim'}</h2>
        <div class="blog-footer"><div class="blog-author hub-author-hit" onclick="event.stopPropagation(); hubInstance.viewAuthor('${post.user_id}')"><div style="position:relative;">${avatar}</div><span>${escapeHtml(post.profiles?.full_name || 'Gliimait')}</span></div><div class="blog-stats"><span class="blog-stat">${eyeSvg}${post.views || 0}</span><span class="blog-stat">${commentSvg}${comments}</span></div></div>
      </article>`;
    }

    // Books: just the cover image as a square — no title, no author, no stats.
    if (this.cardKinds && this.cardKinds[post.id] === 'book' && post.cover_url) {
      return `<article class="book-cover-card${isAmbassador ? ' ambassador-card' : ''}" id="post-${post.id}" style="background-image: url('${post.cover_url}');" onclick="hubInstance.openReadView('${post.id}')">
        ${draftBadge ? `<div class="book-cover-badges">${draftBadge}${premiumBadge}</div>` : (premiumBadge ? `<div class="book-cover-badges">${premiumBadge}</div>` : '')}
      </article>`;
    }

    // Bundles: square card with cover image background + gradient + title/author/stats.
    if (this.cardKinds && this.cardKinds[post.id] === 'bundle' && post.cover_url) {
      const bundleSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>';
      return `<article class="audiolite-card bundle-card${isAmbassador ? ' ambassador-card' : ''}" id="post-${post.id}" style="background-image: url('${post.cover_url}');" onclick="hubInstance.openReadView('${post.id}')">
        <div class="blog-meta audiolite-meta"><span class="audiolite-kind">${bundleSvg}Bundle</span><span class="audiolite-spacer"></span>${draftBadge}${premiumBadge}</div>
        <h2 class="audiolite-title">${post.title || 'Untitled Gliim'}</h2>
        <div class="blog-footer"><div class="blog-author hub-author-hit" onclick="event.stopPropagation(); hubInstance.viewAuthor('${post.user_id}')"><div style="position:relative;">${avatar}</div><span>${escapeHtml(post.profiles?.full_name || 'Gliimait')}</span></div><div class="blog-stats"><span class="blog-stat">${eyeSvg}${post.views || 0}</span><span class="blog-stat">${commentSvg}${comments}</span></div></div>
      </article>`;
    }

    // Image-only gliims render as 1:1 squares with the first image as the card background.
    if (this.cardKinds && this.cardKinds[post.id] === 'image-only' && post.cover_url) {
      const imgCover = `background-image: url('${post.cover_url}');`;
      return `<article class="audiolite-card image-only-card${isAmbassador ? ' ambassador-card' : ''}" id="post-${post.id}" style="${imgCover}" onclick="hubInstance.openReadView('${post.id}')">
        <div class="blog-meta audiolite-meta"><span class="audiolite-spacer"></span>${draftBadge}${premiumBadge}</div>
        <h2 class="audiolite-title">${post.title || 'Untitled Gliim'}</h2>
        <div class="blog-footer"><div class="blog-author hub-author-hit" onclick="event.stopPropagation(); hubInstance.viewAuthor('${post.user_id}')"><div style="position:relative;">${avatar}</div><span>${escapeHtml(post.profiles?.full_name || 'Gliimait')}</span></div><div class="blog-stats"><span class="blog-stat">${eyeSvg}${post.views || 0}</span><span class="blog-stat">${commentSvg}${comments}</span></div></div>
      </article>`;
    }

    return `<article class="blog-card${isAmbassador ? ' ambassador-card' : ''}" id="post-${post.id}" onclick="hubInstance.openReadView('${post.id}')">${coverHtml}<div class="blog-content"><div class="blog-meta"><span class="blog-category">${post.category || 'General'}</span>${draftBadge}${premiumBadge}<span class="blog-date">${new Date(post.created_at).toLocaleDateString([], {month: 'short', day: 'numeric'})}</span></div><h2 class="blog-title">${post.title || 'Untitled Gliim'}</h2><p class="blog-desc">${parseHashtags(post.description)}</p><div class="blog-footer"><div class="blog-author hub-author-hit" onclick="event.stopPropagation(); hubInstance.viewAuthor('${post.user_id}')"><div style="position:relative;">${avatar}</div><span>${escapeHtml(post.profiles?.full_name || 'Gliimait')}</span></div><div class="blog-stats"><span class="blog-stat">${eyeSvg}${post.views || 0}</span><span class="blog-stat">${commentSvg}${comments}</span></div></div></div></article>`;
  },

  async renderPosts(feed_gliims) {
    // The merged Library feed owns rendering; hand off to it when embedded.
    if (this.onFeedChange) { this.onFeedChange(); return; }

    const container = document.getElementById('feed_gliims-container');
    if (!container) return;
    const filtered = await this.filterPosts(feed_gliims);
    
    const postsHtml = filtered.map(post => this.renderPostCard(post)).join('');
    
    if (filtered.length === 0) { 
      container.innerHTML = '<p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">No Gliims found.</p>'; 
      return; 
    }
    
    container.className = 'blog-feed';
    container.innerHTML = postsHtml;
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

  seededShuffle(feed_gliims) {
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
    const arr = [...feed_gliims];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  orderFeed(feed_gliims) {
    const interest = this.loadInterest();
    if ((interest.signals || 0) >= 5) {
      return [...feed_gliims].sort((a, b) =>
        this.feedScore(b, interest) - this.feedScore(a, interest) ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    return this.seededShuffle(feed_gliims);
  },

  async openReadView(postId) {
    sessionStorage.setItem('openReadViewId', postId);
    window.location.hash = `#/post?id=${postId}`;
  },

  async _openReadViewModal(postId) {
    if (this.isModalOpen) return;
    this.isModalOpen = true;

    if (!this.feedLoaded) await this.fetchPosts();

    let post = (this.currentPosts || []).find(p => p.id === postId);
    if (!post) {
      const { data, error } = await supabase.from('feed_gliims')
        .select(`*, profiles:profiles!user_id(full_name, avatar_url, total_gp)`)
        .eq('id', postId).single();

      if (error || !data) {
        this.isModalOpen = false;
        return alert("This particular post is no longer available.");
      }
      post = data;
      this.currentPosts = this.currentPosts || [];
      this.currentPosts.unshift(post);
    }

    if (!this.isModalOpen) return;

    // Drafts open in the composer for editing, not the reader
    if (post.status === 'draft' && post.user_id === store.user.id) {
      this.isModalOpen = false;
      this.openDraftComposer(post);
      return;
    }

    const isOwner = post.user_id === store.user.id;

    // Server-side content lock: the body lives in feed_gliim_contents, and RLS
    // only returns a premium body once the heartbeat has recorded the unlock.
    // A client that skips the gate above simply gets no rows here.
    const { data: contentRow } = await supabase
      .from('feed_gliim_contents').select('blocks')
      .eq('post_id', postId).maybeSingle();
    post.blocks = contentRow?.blocks || null;

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
    const avatar = post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="${avatarClass}" style="object-fit:cover;">` : `<div class="${avatarClass}"></div>`;

    const likes = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'like').length;
    const comments = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'comment').length;
    const shares = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'share').length;
    const supports = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'support').length;
    const hasLiked = this.allInteractions.some(i => i.post_id === post.id && i.user_id === store.user.id && i.interaction_type === 'like');
    const hasSupported = this.allInteractions.some(i => i.post_id === post.id && i.user_id === store.user.id && i.interaction_type === 'support');
    const isSaved = this.savedPosts.has(post.id);

    const postComments = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'comment');
    let commentsHtml = '<p style="font-size: 13px; color: var(--text-muted);">No comments yet.</p>';
    if (postComments.length > 0) {
      commentsHtml = postComments.map(c => {
        const cAvatarClass = tierClass(c.profiles?.total_gp, 'comment-avatar');
        const cAvatar = c.profiles?.avatar_url ? `<img src="${c.profiles.avatar_url}" class="${cAvatarClass}" style="object-fit:cover;" onclick="hubInstance.showUserMenu(event, '${c.user_id}', '${post.id}', '${c.profiles?.full_name || 'Gliimait'}')">` : `<div class="${cAvatarClass}" onclick="hubInstance.showUserMenu(event, '${c.user_id}', '${post.id}', '${c.profiles?.full_name || 'Gliimait'}')"></div>`;
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
        if (b.type === 'image') {
          const cap = b.caption ? `<figcaption class="read-block-caption">${escapeHtml(b.caption)}</figcaption>` : '';
          return `<figure class="read-block-figure"><img src="${escapeHtml(b.content)}" class="read-block-media" data-lightbox data-caption="${escapeHtml(b.caption || '')}">${cap}</figure>`;
        }
        if (b.type === 'video') {
          return `<figure class="read-video-player"><video src="${escapeHtml(b.content)}" class="read-block-media" preload="metadata" playsinline></video><button type="button" class="rvp-big" aria-label="Play"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg></button><div class="rvp-bar"><button type="button" class="rvp-play" aria-label="Play or pause"></button><input type="range" class="rvp-seek" min="0" max="1000" value="0" aria-label="Seek"><span class="rvp-time">0:00 / 0:00</span><button type="button" class="rvp-mute" aria-label="Mute"></button><button type="button" class="rvp-full" aria-label="Fullscreen"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg></button></div></figure>`;
        }
        if (b.type === 'audio') {
          const cap = b.caption ? `<p class="read-audio-title">${escapeHtml(b.caption)}</p>` : '';
          return `<div class="read-block-audio-wrapper"><div class="read-audio-head"><div class="lib-eq read-eq"><span></span><span></span><span></span><span></span><span></span></div>${cap}</div><audio src="${escapeHtml(b.content)}" class="read-block-audio" controls preload="metadata" crossorigin="anonymous"></audio></div>`;
        }
        if (b.type === 'document') {
          // Reflowable book file — hydrated in-page below via renderFileInto
          // (pdf.js/mammoth/epub.js), never a new browser tab.
          const cap = b.caption ? `<h3 class="read-block-subtitle">${escapeHtml(b.caption)}</h3>` : '';
          return `${cap}<div class="rdr-inline-file" data-file-src="${escapeHtml(b.content)}"></div>`;
        }
        if (b.type === 'pdf') {
          let items = [];
          try {
            const parsed = JSON.parse(b.content);
            if (Array.isArray(parsed && parsed.items)) items = parsed.items;
          } catch { items = [{ pdf_url: b.content, cover_url: '', price: Number(b.price || 0) }]; }
          const pdfTileIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
          const tiles = items.filter(it => it && it.pdf_url).map((it, idx) => {
            const price = Number(it.price || 0);
            const cover = it.cover_url
              ? `<img class="pdf-tile-cover" src="${escapeHtml(it.cover_url)}" alt="" loading="lazy">`
              : `<div class="pdf-tile-cover pdf-tile-blank">${pdfTileIcon}</div>`;
            return `<div class="pdf-tile" data-pdf="${escapeHtml(it.pdf_url)}" data-price="${price}" data-post="${post.id}" data-idx="${idx}" data-creator="${post.user_id || ''}" onclick="hubInstance.openPdfTile(this)">${cover}<span class="pdf-tile-price">${price > 0 ? '₦' + price.toLocaleString() : 'Free'}</span></div>`;
          }).join('');
          if (!tiles) return '';
          return `<div class="pdf-block-row">${tiles}</div>`;
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
        if (b.type === 'table') {
          let data = null;
          try { data = JSON.parse(b.content); } catch { data = null; }
          if (!data || !Array.isArray(data.cells) || !data.rows || !data.cols) return '';
          let html = '<div class="read-block-table-wrap"><table class="read-block-table"><tbody>';
          for (let r = 0; r < data.rows; r++) {
            html += '<tr>';
            for (let c = 0; c < data.cols; c++) {
              const val = data.cells[r] && data.cells[r][c] ? escapeHtml(data.cells[r][c]) : '';
              html += `<td>${val}</td>`;
            }
            html += '</tr>';
          }
          html += '</tbody></table></div>';
          return html;
        }
        if (b.type === 'slide') {
          let data = null;
          try { data = JSON.parse(b.content); } catch { data = null; }
          if (!data || !Array.isArray(data.slides) || !data.slides.length) return '';
          const slidesHtml = data.slides.map((s, idx) => {
            if (s.type === 'image') {
              const cap = s.caption ? `<div class="slide-caption">${escapeHtml(s.caption)}</div>` : '';
              return `<div class="slide-item-view"><img src="${escapeHtml(s.url)}" alt="" loading="lazy">${cap}</div>`;
            }
            if (s.type === 'video') {
              return `<div class="slide-item-view"><video controls preload="metadata" src="${escapeHtml(s.url)}"></video></div>`;
            }
            if (s.type === 'audio') {
              const title = s.title ? `<div class="slide-caption">${escapeHtml(s.title)}</div>` : '';
              return `<div class="slide-item-view"><audio controls preload="metadata" src="${escapeHtml(s.url)}"></audio>${title}</div>`;
            }
            if (s.type === 'text') {
              return `<div class="slide-item-view slide-text-view"><p>${escapeHtml(s.content)}</p></div>`;
            }
            return '';
          }).join('');
          return `<div class="slide-carousel-view" data-slide-idx="0"><div class="slide-track">${slidesHtml}</div><div class="slide-nav"><button class="slide-nav-btn slide-prev" onclick="hubInstance.slideNav(this,-1)">&#8249;</button><span class="slide-counter">1 / ${data.slides.length}</span><button class="slide-nav-btn slide-next" onclick="hubInstance.slideNav(this,1)">&#8250;</button></div></div>`;
        }
        return '';
      }).join('');
    } else if (post.is_premium && !isOwner) {
      // RLS withheld the body — the unlock was never recorded server-side.
      // Show the lock card; never fall through to post.content.
      const lockPrice = Number((this.billingSummary && this.billingSummary.prices && this.billingSummary.prices.premium_unlock) || 0);
      blocksHtml = `
        <div style="text-align:center;padding:48px 24px;border:1px dashed var(--border);border-radius:12px;color:var(--text-muted);">
          <p style="font-weight:700;color:var(--text-primary);margin-bottom:8px;">This gliim is locked</p>
          <p style="margin-bottom:16px;">${lockPrice ? `Unlock it for ₦${lockPrice.toLocaleString()}.` : 'Unlock it to read the full gliim.'}</p>
          <button class="btn-primary" onclick="hubInstance.unlockPremiumPost('${post.id}')">Unlock</button>
        </div>`;
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
              <div style="font-size: 11px; color: var(--text-muted); margin-top: -18px; margin-bottom: 16px;">₦50 per comment</div>
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
          <button class="action-btn" onclick="hubInstance.sharePost('${post.id}', '${post.title}')" title="Earn 2 GP">
            <img src="/icons/share.svg" class="action-icon-img" alt="Share" loading="eager" decoding="async">
            <span>${shares}</span>
          </button>
          ${(post.profiles?.total_gp || 0) >= 500 ? `
          <button class="action-btn support-btn ${hasSupported ? 'supported' : ''}" ${hasSupported ? 'disabled' : ''} onclick="hubInstance.supportCreator('${post.id}', '${post.user_id}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <span>${supports}</span>
          </button>` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this.setupMediaBlocks(modal);
    this.hydratePolls(modal);
    // Hydrate document/PDF blocks in-page (pdf.js/mammoth/epub.js) so they
    // never leave the read view for a new browser tab.
    modal.querySelectorAll('.rdr-inline-file[data-file-src]').forEach(el => {
      const src = el.getAttribute('data-file-src');
      if (src) renderFileInto(src, el);
    });
    this.setupMentionPicker(post.id);
  },

  // Pool blocks: fetch counts from the SECURITY DEFINER RPC (nobody can read
  // other people's votes directly) plus your own row, then size each bar to
  // its share of the total votes.
  async hydratePolls(scope) {
    const root = scope || document;
    const blocks = root.matches?.('.poll-block[data-poll-post]')
      ? [root]
      : Array.from(root.querySelectorAll('.poll-block[data-poll-post]'));
    for (const block of blocks) {
      const postId = block.dataset.pollPost;
      const [resRes, mineRes] = await Promise.all([
        supabase.rpc('poll_results', { p_post_id: postId }),
        supabase.from('poll_votes').select('option_index').eq('post_id', postId).maybeSingle()
      ]);
      const res = resRes.data;
      if (!res || !res.ok) continue;
      const myVote = (mineRes.data && typeof mineRes.data.option_index === 'number')
        ? mineRes.data.option_index
        : null;
      const maxCount = Math.max(...res.options.map(o => o.count));
      res.options.forEach(o => {
        const row = block.querySelector(`.poll-option-row[data-idx="${o.index}"]`);
        if (!row) return;
        row.querySelector('.poll-option-fill').style.width = `${o.percent || 0}%`;
        row.querySelector('.poll-option-meta').textContent = res.total > 0 ? `${o.percent}% · ${o.count}` : '';
        row.classList.toggle('poll-option-mine', myVote === o.index);
        row.classList.toggle('poll-option-lead', res.total > 0 && o.count === maxCount);
      });
      const totalEl = block.querySelector('[data-poll-total]');
      if (totalEl) totalEl.textContent = `${res.total} ${res.total === 1 ? 'vote' : 'votes'}`;
    }
  },

  async pollVote(postId, optionIndex) {
    const block = document.querySelector(`.poll-block[data-poll-post="${postId}"]`);
    if (!block) return;
    const { data, error } = await supabase.rpc('poll_vote', {
      p_post_id: postId,
      p_option_index: optionIndex
    });
    if (error || !data || !data.ok) {
      const code = data && data.code;
      if (code === 'NOT_AUTHENTICATED') return alert('Sign in to vote.');
      return alert(code === 'BAD_OPTION'
        ? 'That option no longer exists.'
        : (error && error.message) || 'Could not save your vote.');
    }
    await this.hydratePolls(block);
  },

  slideNav(btn, dir) {
    const carousel = btn.closest('.slide-carousel-view');
    if (!carousel) return;
    const track = carousel.querySelector('.slide-track');
    const items = track.querySelectorAll('.slide-item-view');
    if (!items.length) return;
    let idx = parseInt(carousel.dataset.slideIdx || '0');
    idx = Math.max(0, Math.min(items.length - 1, idx + dir));
    carousel.dataset.slideIdx = idx;
    track.style.transform = `translateX(-${idx * 100}%)`;
    const counter = carousel.querySelector('.slide-counter');
    if (counter) counter.textContent = `${idx + 1} / ${items.length}`;
    const prev = carousel.querySelector('.slide-prev');
    const next = carousel.querySelector('.slide-next');
    if (prev) prev.disabled = idx === 0;
    if (next) next.disabled = idx === items.length - 1;
  },

  // Read-view media wiring: the equalizer dances while an audio chapter
  // plays, and every video gets the custom chrome (big play, seek, time,
  // mute, fullscreen) instead of the bare browser controls.
  setupMediaBlocks(root) {
    root.querySelectorAll('.read-block-audio').forEach(a => {
      const eq = a.closest('.read-block-audio-wrapper')?.querySelector('.lib-eq');
      if (!eq) return;
      
      // Ensure audio can play (fix for browser autoplay policies)
      a.preload = 'metadata';
      a.setAttribute('playsinline', '');
      
      a.addEventListener('play', () => {
        eq.classList.add('playing');
        // Ensure volume is up
        if (a.muted) a.muted = false;
        if (a.volume === 0) a.volume = 1.0;
      });
      a.addEventListener('pause', () => eq.classList.remove('playing'));
      a.addEventListener('ended', () => eq.classList.remove('playing'));
      
      // Add error handling
      a.addEventListener('error', (e) => {
        console.error('Audio playback error:', e, 'Source:', a.src);
      });
    });

    root.querySelectorAll('.read-video-player').forEach(fig => {
      const video = fig.querySelector('video');
      if (!video) return;
      const big = fig.querySelector('.rvp-big');
      const playBtn = fig.querySelector('.rvp-play');
      const seek = fig.querySelector('.rvp-seek');
      const time = fig.querySelector('.rvp-time');
      const muteBtn = fig.querySelector('.rvp-mute');
      const fullBtn = fig.querySelector('.rvp-full');
      const ICON_PLAY = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg>';
      const ICON_PAUSE = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>';
      const ICON_VOL = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
      const ICON_MUTED = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';
      const fmt = (s) => !isFinite(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

      playBtn.innerHTML = ICON_PLAY;
      muteBtn.innerHTML = video.muted ? ICON_MUTED : ICON_VOL;
      const syncPlay = () => {
        big.classList.toggle('hidden', !video.paused);
        playBtn.innerHTML = video.paused ? ICON_PLAY : ICON_PAUSE;
      };
      const toggle = () => (video.paused ? video.play() : video.pause());
      big.addEventListener('click', toggle);
      playBtn.addEventListener('click', toggle);
      video.addEventListener('click', toggle);
      video.addEventListener('play', syncPlay);
      video.addEventListener('pause', syncPlay);
      video.addEventListener('timeupdate', () => {
        if (video.duration) seek.value = Math.round((video.currentTime / video.duration) * 1000);
        time.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
      });
      seek.addEventListener('input', () => {
        if (video.duration) video.currentTime = (seek.value / 1000) * video.duration;
      });
      muteBtn.addEventListener('click', () => {
        video.muted = !video.muted;
        muteBtn.innerHTML = video.muted ? ICON_MUTED : ICON_VOL;
      });
      fullBtn.addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else if (fig.requestFullscreen) fig.requestFullscreen().catch(() => {});
      });
      syncPlay();
    });
  },

  // Shown when RLS withheld a premium body (gate skipped or unlock stale).
  // Reopens the reader to retry the content fetch.
  async unlockPremiumPost(postId) {
    this.closeModal();
    this.openReadView(postId);
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
      await supabase.from('saved_items').delete().eq('user_id', store.user.id).eq('item_id', postId);
      this.savedPosts.delete(postId);
      alert("Gliim unsaved.");
    } else {
      await supabase.from('saved_items').insert({ user_id: store.user.id, item_id: postId });
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
      if (msg.includes('INSUFFICIENT_FUNDS')) return appAlert("You don't have enough in your wallet to support. ₦1,000 is required.");
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
      await supabase.from('feed_interactions').delete().eq('id', existingLike.id);
      this.allInteractions = this.allInteractions.filter(i => i.id !== existingLike.id);
    } else {
      const { data } = await supabase.from('feed_interactions').insert({ post_id: postId, user_id: store.user.id, interaction_type: 'like' }).select('*').single();
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
    const { data } = await supabase.from('feed_interactions').insert({ post_id: postId, user_id: store.user.id, interaction_type: 'comment', comment_text: text }).select('*').single();

    if (data) {
      data.profiles = { full_name: store.profile.full_name, avatar_url: store.profile.avatar_url, total_gp: store.profile.total_gp };
      this.allInteractions.push(data);
      const list = document.getElementById(`comment-list-${postId}`);
      const cAvatarClass = tierClass(data.profiles.total_gp, 'comment-avatar');
      const cAvatar = data.profiles.avatar_url ? `<img src="${data.profiles.avatar_url}" class="${cAvatarClass}" style="object-fit:cover;" onclick="hubInstance.showUserMenu(event, '${data.user_id}', '${postId}', '${data.profiles.full_name}')">` : `<div class="${cAvatarClass}" onclick="hubInstance.showUserMenu(event, '${data.user_id}', '${postId}', '${data.profiles.full_name}')"></div>`;
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
    const { data } = await supabase.from('feed_interactions').insert({ post_id: postId, user_id: store.user.id, interaction_type: 'share' }).select('*').single();
    if (data) this.allInteractions.push(data);
    const post = this.currentPosts.find(p => p.id === postId);
    if (post && post.user_id !== store.user.id) await supabase.rpc('add_gp', { target_user_id: post.user_id, points_to_add: 5 });
    await supabase.rpc('add_gp', { target_user_id: store.user.id, points_to_add: 2 });

    this.closeModal();
    this.openReadView(postId);
    if (navigator.share) { navigator.share({ title: title || 'Gliimu Post', url: window.location.href }).catch(() => {}); } else { alert("Share link copied!"); }
  },

  setupRealtime() {
    const channelName = `hub-feed_gliims-${Date.now()}`;
    supabase.channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_gliims' }, async () => { this.fetchPosts(); })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'feed_gliims' }, async () => { this.fetchPosts(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'feed_gliims' }, async () => { this.fetchPosts(); })
      .subscribe();
  }
};

// Module scope, not init(): the reader and the router's modal guard must work
// even when the hub view was never visited (reader opened from a profile).
window.hubInstance = {
  openReadView: (id) => hubView.openReadView(id),
  unlockPremiumPost: (id) => hubView.unlockPremiumPost(id),
  toggleLike: (id) => hubView.toggleLike(id),
  sharePost: (id, title) => hubView.sharePost(id, title),
  scrollToComments: (id) => hubView.scrollToComments(id),
  submitComment: (id) => hubView.submitComment(id),
  supportCreator: (id, authorId) => hubView.supportCreator(id, authorId),
  showUserMenu: (e, userId, postId, fullName) => hubView.showUserMenu(e, userId, postId, fullName),
  closeUserMenu: () => hubView.closeUserMenu(),
  toggleSavePost: (id) => hubView.toggleSavePost(id),
  toggleReadMenu: (id) => hubView.toggleReadMenu(id),
  closeModal: () => hubView.closeModal(),
  addBlock: (type) => hubView.addBlock(type),
  hydratePolls: (scope) => hubView.hydratePolls(scope),
  pollVote: (postId, idx) => hubView.pollVote(postId, idx),
  slideNav: (btn, dir) => hubView.slideNav(btn, dir),
  saveComposerState: () => hubView.saveComposerState(),
  openPdfTile: (el) => hubView.openPdfTile(el),
  promptDelete: (id) => hubView.promptDelete(id),
  replyToUser: (postId, fullName, userId) => hubView.replyToUser(postId, fullName, userId),
  viewAuthor: (userId) => hubView.viewAuthor(userId),
  promptReport: (targetType, targetId) => hubView.promptReport(targetType, targetId),
  removeTag: (index) => hubView.removeTag(index),
  removeHashtag: (index) => hubView.removeHashtag(index),
  isModalOpen: () => hubView.isModalOpen
};

export default hubView;
