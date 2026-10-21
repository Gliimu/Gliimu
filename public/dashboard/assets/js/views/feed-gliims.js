import { supabase } from '/shared/js/config.js';
import { store, tierClass } from '../store.js';
import { ensureAccess, showBillingDenied, fetchBillingSummary } from '../billing.js';
import { uploadFile } from '../upload.js';
import { renderFileInto } from '../reader.js?v=31';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    this.billingSummary = null;
    this.draggedBlock = null;
    this.editingDraftId = null;

    // Cached for the premium badge and the composer lock toggle; refreshed
    // when the composer opens. Fails silently pre-migration.
    fetchBillingSummary().then(s => { if (s && !s.code) this.billingSummary = s; });

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

  // The gliim filter menu. Library owns the topbar and calls this.
  setupTopbarActions() {
    const rightActions = document.getElementById('topbar-right-actions');
    if (!rightActions) return;

    rightActions.innerHTML = `
      <div class="hub-filter-wrapper">
        <button class="hub-filter-btn" id="hub-filter-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
        </button>
        <div class="hub-filter-menu" id="hub-dropdown">
          <div class="hub-filter-item" data-filter="mine">My Gliims</div>
          <div class="hub-filter-item" data-filter="saved">Saved Gliims</div>
          <div class="hub-filter-item" data-filter="tagged">Tagged Gliims</div>
          <div class="hub-filter-item" data-filter="drafts">Drafts</div>
        </div>
      </div>
    `;

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
    if (userId === store.user.id) {
      sessionStorage.removeItem('view_profile_id');
    } else {
      sessionStorage.setItem('view_profile_id', userId);
    }
    // Setting the hash to its current value fires no hashchange; re-render manually
    if (window.location.hash.startsWith('#/profile')) {
      window.dispatchEvent(new Event('hashchange'));
    } else {
      window.location.hash = '#/profile';
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

      if (q.length < 2 && !q.startsWith('#')) { results.innerHTML = ''; return; }

      timer = setTimeout(async () => {
        // '#Tag an event': only events the user hosts or participates in.
        if (q.startsWith('#')) {
          await this.searchTaggableEvents(q.slice(1).trim(), input, results);
          return;
        }

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

  async searchTaggableEvents(query, input, results) {
    const [{ data: joined }, { data: hosted }] = await Promise.all([
      supabase.from('event_participants').select('event_id').eq('user_id', store.user.id),
      supabase.from('events').select('id, title, status').eq('host_id', store.user.id).in('status', ['recruiting', 'active'])
    ]);

    const joinedIds = (joined || []).map(r => r.event_id);
    let participations = [];
    if (joinedIds.length) {
      const { data } = await supabase.from('events')
        .select('id, title, status')
        .in('id', joinedIds)
        .in('status', ['recruiting', 'active']);
      participations = data || [];
    }

    const lower = query.toLowerCase();
    const seen = new Set(this.taggedEvent ? [this.taggedEvent.id] : []);
    const list = [...(hosted || []), ...participations].filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return !query || (e.title || '').toLowerCase().includes(lower);
    });

    if (list.length === 0) {
      results.innerHTML = '<div class="hub-tag-empty">No events found. You can only tag events you host or participate in.</div>';
      return;
    }

    const calSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"></path></svg>';
    results.innerHTML = list.map(e => `
      <div class="hub-tag-result" data-event-id="${e.id}">${calSvg}<span>#${escapeHtml(e.title)}</span></div>
    `).join('');

    results.querySelectorAll('.hub-tag-result').forEach(row => {
      row.addEventListener('click', () => {
        const e = list.find(x => x.id === row.dataset.eventId);
        if (!e) return;
        this.taggedEvent = { id: e.id, title: e.title };
        input.value = '';
        results.innerHTML = '';
        this.renderTagChips();
        input.focus();
      });
    });
  },

  renderTagChips() {
    const chips = document.getElementById('tag-chips');
    if (!chips) return;
    chips.innerHTML = this.taggedUsers.map((u, i) => `
      <span class="hub-tag-chip"><span>@${escapeHtml(u.full_name)}</span><button type="button" class="hub-tag-chip-x" onclick="hubInstance.removeTag(${i})">&times;</button></span>
    `).join('') + (this.taggedEvent ? `
      <span class="hub-tag-chip"><span>#${escapeHtml(this.taggedEvent.title)}</span><button type="button" class="hub-tag-chip-x" onclick="hubInstance.removeEventTag()">&times;</button></span>
    ` : '');
  },

  removeTag(index) {
    this.taggedUsers.splice(index, 1);
    this.renderTagChips();
  },

  removeEventTag() {
    this.taggedEvent = null;
    this.renderTagChips();
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

  async openCreateModal() {
    // Eligibility ladder: 50 GP to post in the Feed at all.
    const userGP = (store.profile && store.profile.total_gp) || 0;
    if (userGP < 50) {
      return alert(`You need at least 50 GP to post in the Feed. You have ${userGP.toLocaleString()} GP.`);
    }

    this.billingSummary = (await fetchBillingSummary()) || this.billingSummary;
    const summary = this.billingSummary;
    // 1000 GP to premium-lock a bundle.
    const canLock = userGP >= 1000;
    const premiumPrice = Number((summary && summary.prices && summary.prices.premium_unlock) || 0);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content gliim-builder">
        <button class="modal-close" onclick="hubInstance.closeModal()">×</button>
        <h2 style="margin-bottom: 24px;">Publish to the Feed</h2>
        <div class="form-group"><label>Title</label><input type="text" id="post-title" class="input" placeholder="An elite headline..."></div>
        <div class="form-row" style="gap: 16px;">
          <div class="form-group" id="post-category-group" style="flex: 1;"><label>Category</label><select id="post-category" class="input"><option>Media</option><option>Tech</option><option>Business</option><option>Personal</option><option>Education</option></select></div>
          <div class="form-group" style="flex: 2;"><label>Description (SEO Summary)</label><input type="text" id="post-description" class="input" placeholder="Brief summary..."></div>
        </div>
        <div class="form-group">
          <label>Tag People or Events (optional)</label>
          <div class="hub-tag-picker">
            <div class="hub-tag-chips" id="tag-chips"></div>
            <input type="text" id="tag-search" class="input" placeholder="Type a name to tag someone, or # to tag an event..." autocomplete="off">
            <div class="hub-tag-results" id="tag-results"></div>
          </div>
        </div>
        ${canLock ? `
        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
            <input type="checkbox" id="post-premium-toggle" style="width: 18px; height: 18px; accent-color: var(--brand-primary); flex-shrink: 0;">
            <span><strong>Premium lock</strong>${premiumPrice ? ` — viewers pay ₦${premiumPrice.toLocaleString()} per open` : ' — viewers pay per open'}</span>
          </label>
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">You earn 70% of every unlock. Leave it unchecked and the gliim stays free to open.</p>
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
            <div onclick="hubInstance.addBlock('poll')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg> Pool</div>
            <div onclick="hubInstance.addBlock('event')" style="border-top: 1px solid var(--border); margin-top: 4px; padding-top: 8px;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"></path></svg> Event</div>
          </div>
        </div>

        <div style="display: flex; gap: 12px; margin-top: 32px;">
          <button id="save-draft-btn" class="btn-secondary" style="flex: 1;">Save Draft</button>
          <button id="submit-post-btn" class="btn-primary" style="flex: 1;">Publish</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    this.taggedUsers = [];
    this.taggedEvent = null;
    this.setupTagPicker();

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

      // An Event block turns this gliim into an event — publish runs the
      // event path instead of the normal feed_gliims insert.
      const eventBlock = document.querySelector('.builder-block[data-type="event"]');
      if (eventBlock) return this.createEvent(modal);

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
      const eventSuffix = this.taggedEvent ? `#${this.taggedEvent.title}` : '';
      const description = [rawDescription, tagSuffix, eventSuffix].filter(Boolean).join(' ');

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
      if (this.taggedEvent) payload.event_id = this.taggedEvent.id;
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
      modal.remove();
      this.fetchPosts();
    });

    // Save as Draft handler
    document.getElementById('save-draft-btn').addEventListener('click', async () => {
      const title = document.getElementById('post-title').value.trim();
      const category = document.getElementById('post-category').value;
      const rawDescription = document.getElementById('post-description').value.trim();

      if (!title) return alert("Title is required even for drafts.");

      const tagSuffix = this.taggedUsers.map(u => `@${u.full_name}`).join(' ');
      const eventSuffix = this.taggedEvent ? `#${this.taggedEvent.title}` : '';
      const description = [rawDescription, tagSuffix, eventSuffix].filter(Boolean).join(' ');

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
      if (this.taggedEvent) payload.event_id = this.taggedEvent.id;

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
      modal.remove();
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
      const eventSuffix = this.taggedEvent ? `#${this.taggedEvent.title}` : '';
      const description = [rawDescription, tagSuffix, eventSuffix].filter(Boolean).join(' ');

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
      if (this.taggedEvent) payload.event_id = this.taggedEvent.id;
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
      const eventSuffix = this.taggedEvent ? `#${this.taggedEvent.title}` : '';
      const description = [rawDescription, tagSuffix, eventSuffix].filter(Boolean).join(' ');

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
      if (this.taggedEvent) payload.event_id = this.taggedEvent.id;

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
    if (type === 'event') iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"></path></svg>';

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
    } else if (type === 'event') {
      // Title and description come from the composer's common fields —
      // this block only holds the event-specific settings.
      inputHtml = `
        <div class="form-group">
          <label>Categories * (select up to 2)</label>
          <div class="hub-tag-picker">
            <div class="hub-tag-chips" id="event-category-chips"></div>
            <input type="text" id="event-category-search" class="input" placeholder="Search categories..." autocomplete="off">
            <div class="hub-tag-results" id="event-category-results"></div>
          </div>
        </div>
        <div class="form-group">
          <label>Cover Image *</label>
          <label class="custom-file-upload" style="display: block;">
            <img src="/icons/clip.svg" class="upload-icon-img" alt="Upload">
            <span id="event-cover-name">Choose cover image</span>
            <input type="file" id="event-cover-input" accept="image/*" hidden>
          </label>
          <div id="event-cover-status" style="font-size: 12px; margin-top: 8px;"></div>
          <div id="event-cover-preview" style="margin-top: 8px;"></div>
          <input type="hidden" id="event-cover-url">
        </div>
        <div class="form-row" style="gap: 16px;">
          <div class="form-group" style="flex: 1;">
            <label>Start Date & Time *</label>
            <input type="datetime-local" id="event-start-date" class="input">
          </div>
          <div class="form-group" style="flex: 1;">
            <label>Duration *</label>
            <select id="event-duration" class="input">
              <option value="7">1 week</option>
              <option value="14">2 weeks</option>
              <option value="30" selected>1 month</option>
              <option value="60">2 months</option>
              <option value="90">3 months</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label id="event-budget-label">Budget / Prize Pool *</label>
          <input type="number" id="event-budget" class="input" step="1000" placeholder="e.g., 50000">
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">
            Max participants: <strong id="event-max-participants">-</strong> |
            Prize pool: <strong id="event-prize-pool">₦0</strong>
          </p>
        </div>
        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
            <input type="checkbox" id="event-team-mode" style="width: 18px; height: 18px; accent-color: var(--brand-primary);">
            <span><strong>Team Mode</strong> — allow participants to form teams</span>
          </label>
          <div id="event-team-size-group" style="display: none; margin-top: 12px;">
            <label>Max team size (1-3)</label>
            <input type="number" id="event-max-team-size" class="input" min="1" max="3" value="3">
          </div>
        </div>
        <div class="form-group">
          <label>Rules & Guidelines (optional)</label>
          <textarea id="event-rules" class="input" rows="3" placeholder="Any specific rules for participants..."></textarea>
        </div>
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

    if (type === 'event') {
      // An event is the whole post — drop any other blocks, hide the
      // block menu, and swap Save Draft for Preview (events can't draft).
      blocksContainer.querySelectorAll('.builder-block:not([data-type="event"])').forEach(b => b.remove());
      document.getElementById('add-block-trigger').style.display = 'none';
      document.getElementById('post-category-group').style.display = 'none';
      const draftBtn = document.getElementById('save-draft-btn');
      if (draftBtn) draftBtn.style.display = 'none';
      const btnRow = draftBtn ? draftBtn.parentElement : null;
      if (btnRow && !document.getElementById('event-preview-btn')) {
        const previewBtn = document.createElement('button');
        previewBtn.id = 'event-preview-btn';
        previewBtn.className = 'btn-secondary';
        previewBtn.style.flex = '1';
        previewBtn.textContent = 'Preview';
        previewBtn.onclick = () => this.showEventPreview();
        btnRow.insertBefore(previewBtn, btnRow.firstChild);
      }
      const eventRemoveBtn = blockDiv.querySelector('.block-remove-btn');
      eventRemoveBtn.onclick = () => {
        blockDiv.remove();
        document.getElementById('add-block-trigger').style.display = '';
        document.getElementById('post-category-group').style.display = '';
        const preview = document.getElementById('event-preview-btn');
        if (preview) preview.remove();
        const restoredDraft = document.getElementById('save-draft-btn');
        if (restoredDraft) restoredDraft.style.display = '';
        this.saveComposerState();
      };
      this.initEventBlock();
      return;
    }

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

  async initEventBlock() {
    // Fetch categories and pricing, then wire the event block's controls.
    const [catRes, pricingRes] = await Promise.all([
      supabase.rpc('event_categories_list', {}),
      supabase.rpc('event_pricing_get', {})
    ]);

    const categories = catRes.data || [];
    const pricing = pricingRes.data || {};

    this.eventSelectedCategories = [];
    this.eventAllCategories = categories;
    this.setupEventCategoryPicker();

    const budgetLabel = document.getElementById('event-budget-label');
    const budgetInput = document.getElementById('event-budget');
    const minBudget = Number(pricing.min_budget || 10000);
    if (budgetLabel) budgetLabel.textContent = `Budget / Prize Pool * (minimum ₦${minBudget.toLocaleString()})`;
    if (budgetInput) budgetInput.min = minBudget;

    // Cover image upload
    const coverInput = document.getElementById('event-cover-input');
    coverInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const statusEl = document.getElementById('event-cover-status');
      const urlEl = document.getElementById('event-cover-url');
      statusEl.style.color = 'var(--brand-primary)';
      statusEl.textContent = 'Uploading... 0%';
      try {
        const fileUrl = await uploadFile(file, 'media', (percent) => {
          statusEl.textContent = `Uploading... ${percent}%`;
        });
        urlEl.value = fileUrl;
        statusEl.textContent = 'Upload complete!';
        statusEl.style.color = 'var(--success)';
        document.getElementById('event-cover-name').textContent = 'Cover uploaded';
        document.getElementById('event-cover-preview').innerHTML = `<img src="${fileUrl}" style="max-width: 200px; border-radius: 8px;">`;
      } catch (err) {
        statusEl.style.color = 'var(--error)';
        statusEl.textContent = err.message || 'Upload failed.';
      }
    });

    // Team mode toggle
    document.getElementById('event-team-mode').addEventListener('change', (e) => {
      document.getElementById('event-team-size-group').style.display = e.target.checked ? 'block' : 'none';
    });

    // Budget calculation
    const durationSelect = document.getElementById('event-duration');
    const updateCalc = () => {
      const budget = Number(budgetInput.value) || 0;
      const duration = Number(durationSelect.value);
      const perParticipantCost = this.calcParticipantCost(duration, pricing);
      const maxParticipants = Math.floor(budget / perParticipantCost);
      document.getElementById('event-max-participants').textContent = maxParticipants > 0 ? maxParticipants : '-';
      const prizePool = budget * (1 - (pricing.gliimu_fee_percent || 15) / 100);
      document.getElementById('event-prize-pool').textContent = `₦${prizePool.toLocaleString()}`;
    };
    budgetInput.addEventListener('input', updateCalc);
    durationSelect.addEventListener('change', updateCalc);
  },

  setupEventCategoryPicker() {
    const searchInput = document.getElementById('event-category-search');
    const resultsDiv = document.getElementById('event-category-results');
    const chipsDiv = document.getElementById('event-category-chips');

    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim();
      if (!query) {
        resultsDiv.style.display = 'none';
        return;
      }

      const matches = this.eventAllCategories.filter(c =>
        c.name.toLowerCase().includes(query) &&
        !this.eventSelectedCategories.find(sc => sc.id === c.id)
      ).slice(0, 5);

      if (matches.length === 0) {
        resultsDiv.style.display = 'none';
        return;
      }

      resultsDiv.innerHTML = matches.map(c => `
        <div class="hub-tag-result" data-id="${c.id}" data-name="${escapeHtml(c.name)}">
          ${c.icon_url ? `<img src="${c.icon_url}" alt="" style="width: 20px; height: 20px; border-radius: 4px;">` : ''}
          <div>
            <div style="font-weight: 500;">${escapeHtml(c.name)}</div>
            ${c.description ? `<div style="font-size: 12px; color: var(--text-muted);">${escapeHtml(c.description)}</div>` : ''}
          </div>
        </div>
      `).join('');
      resultsDiv.style.display = 'block';

      resultsDiv.querySelectorAll('.hub-tag-result').forEach(el => {
        el.addEventListener('click', () => {
          if (this.eventSelectedCategories.length >= 2) {
            alert('You can select up to 2 categories.');
            return;
          }
          const id = el.dataset.id;
          const name = el.dataset.name;
          this.eventSelectedCategories.push({ id, name });
          this.renderEventCategoryChips();
          searchInput.value = '';
          resultsDiv.style.display = 'none';
        });
      });
    });

    searchInput.addEventListener('blur', () => {
      setTimeout(() => { resultsDiv.style.display = 'none'; }, 200);
    });
  },

  renderEventCategoryChips() {
    const chipsDiv = document.getElementById('event-category-chips');
    chipsDiv.innerHTML = this.eventSelectedCategories.map((c, i) => `
      <span class="hub-tag-chip">
        ${escapeHtml(c.name)}
        <button type="button" onclick="hubInstance.removeEventCategory(${i})" style="background: none; border: none; color: inherit; cursor: pointer; padding: 0; margin-left: 4px;">×</button>
      </span>
    `).join('');
  },

  removeEventCategory(index) {
    this.eventSelectedCategories.splice(index, 1);
    this.renderEventCategoryChips();
  },

  calcParticipantCost(durationDays, pricing) {
    if (!pricing) pricing = {};
    if (durationDays <= 7) return Number(pricing.cost_1_week || 4000);
    if (durationDays <= 14) return Number(pricing.cost_2_weeks || 3000);
    if (durationDays <= 30) return Number(pricing.cost_1_month || 2000);
    if (durationDays <= 60) return Number(pricing.cost_2_months || 1500);
    return Number(pricing.cost_3_months || 1000);
  },

  async showEventPreview() {
    // Validate required fields — title and description live in the
    // composer's common section, the rest inside the event block.
    const title = document.getElementById('post-title').value.trim();
    const description = document.getElementById('post-description').value.trim();
    const coverUrl = document.getElementById('event-cover-url').value;
    const startDate = document.getElementById('event-start-date').value;
    const duration = Number(document.getElementById('event-duration').value);
    const budget = Number(document.getElementById('event-budget').value);

    if (!title || !description || !coverUrl || !startDate || !budget) {
      alert('Please fill in all required fields.');
      return;
    }

    if (this.eventSelectedCategories.length === 0) {
      alert('Please select at least one category.');
      return;
    }

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + duration);

    const { data: pricing } = await supabase.rpc('event_pricing_get', {});
    const safePricing = pricing || {};
    const perParticipantCost = this.calcParticipantCost(duration, safePricing);
    const maxParticipants = Math.floor(budget / perParticipantCost);
    const prizePool = budget * (1 - (safePricing.gliimu_fee_percent || 15) / 100);

    const previewModal = document.createElement('div');
    previewModal.className = 'modal-overlay';
    previewModal.id = 'event-preview-modal';
    previewModal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <button class="modal-close" onclick="document.getElementById('event-preview-modal').remove()">×</button>
        <h2 style="margin-bottom: 24px;">Event Preview</h2>
        
        <div class="event-card-preview" style="border: 2px solid var(--border); border-radius: 12px; overflow: hidden;">
          <div style="height: 200px; background: url('${coverUrl}') center/cover no-repeat;"></div>
          <div style="padding: 20px;">
            <h3 style="margin: 0 0 12px;">${escapeHtml(title)}</h3>
            <p style="color: var(--text-secondary); font-size: 14px; margin: 0 0 16px;">${escapeHtml(description.substring(0, 150))}${description.length > 150 ? '...' : ''}</p>
            
            <div style="display: flex; gap: 16px; font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
              <div><strong>${duration}</strong> days</div>
              <div><strong>${maxParticipants}</strong> participants max</div>
            </div>

            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
              <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Prize Pool</div>
              <div style="font-size: 20px; font-weight: 700; color: var(--brand-primary);">₦${prizePool.toLocaleString()}</div>
            </div>

            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;">
              ${this.eventSelectedCategories.map(c => `<span style="background: var(--brand-primary); color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px;">${escapeHtml(c.name)}</span>`).join('')}
            </div>

            <button class="btn-primary" style="width: 100%;">Join Event</button>
          </div>
        </div>

        <div style="margin-top: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 8px; font-size: 13px;">
          <div style="margin-bottom: 8px;"><strong>Start:</strong> ${new Date(startDate).toLocaleString()}</div>
          <div style="margin-bottom: 8px;"><strong>End:</strong> ${endDate.toLocaleString()}</div>
          <div><strong>Budget:</strong> ₦${budget.toLocaleString()}</div>
        </div>

        <button class="btn-secondary" style="width: 100%; margin-top: 20px;" onclick="document.getElementById('event-preview-modal').remove()">Close Preview</button>
      </div>
    `;
    document.body.appendChild(previewModal);
  },

  async createEvent(modalEl) {
    // Title and description come from the composer's common fields.
    const title = document.getElementById('post-title').value.trim();
    const description = document.getElementById('post-description').value.trim();
    const coverUrl = document.getElementById('event-cover-url').value;
    const startDate = document.getElementById('event-start-date').value;
    const duration = Number(document.getElementById('event-duration').value);
    const budget = Number(document.getElementById('event-budget').value);
    const teamMode = document.getElementById('event-team-mode').checked;
    const maxTeamSize = teamMode ? Number(document.getElementById('event-max-team-size').value) : null;
    const rules = document.getElementById('event-rules').value.trim();

    if (!title || !description || !coverUrl || !startDate || !budget) {
      alert('Please fill in all required fields.');
      return;
    }

    if (this.eventSelectedCategories.length === 0) {
      alert('Please select at least one category.');
      return;
    }

    const categoryIds = this.eventSelectedCategories.map(c => c.id);

    // Create event via RPC
    const { data, error } = await supabase.rpc('event_create', {
      p_title: title,
      p_description: description,
      p_cover_url: coverUrl,
      p_category_ids: categoryIds,
      p_start_date: new Date(startDate).toISOString(),
      p_duration_days: duration,
      p_budget_naira: budget,
      p_team_mode: teamMode,
      p_max_team_size: maxTeamSize,
      p_rules_text: rules || null
    });

    if (error || !data || !data.ok) {
      alert(`Failed to create event: ${data?.code || error?.message || 'Unknown error'}`);
      return;
    }

    if (modalEl) modalEl.remove();
    this.clearComposerAutosave();
    alert('Event created successfully! It will appear in the feed once enough participants join.');

    // Refresh feed
    this.fetchPosts();
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

  // A PDF tile click: owners and free files download directly; everyone else
  // pays the creator-set price via billing_access (deduped server-side, so
  // re-clicking a bought PDF never charges again) then downloads.
  async openPdfTile(el) {
    const url = el.dataset.pdf;
    if (!url) return;
    const price = Number(el.dataset.price || 0);
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
    if (isOwner || price <= 0) return download();

    const { data, error } = await supabase.rpc('billing_access', {
      p_event_type: 'premium_unlock',
      p_item_id: `${el.dataset.post}::pdf::${el.dataset.idx}`,
      p_request_id: crypto.randomUUID(),
      p_creator: el.dataset.creator || null,
      p_price_override: price
    });
    if (error) return alert('Purchase failed: ' + error.message);
    if (data && data.allowed) return download();
    alert(data && data.code === 'INSUFFICIENT_FUNDS'
      ? 'Not enough wallet balance. Top up your wallet and try again.'
      : 'This file could not be unlocked. Please try again.');
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
      supabase.from('saved_items').select('item_id').eq('user_id', store.user.id),
      supabase.from('events').select(`
        id, host_id, title, description, cover_url, status, start_date, end_date,
        duration_days, budget_naira, max_participants, current_participants,
        team_mode, prize_1st, prize_2nd, prize_3rd, created_at,
        profiles:profiles!host_id(full_name, avatar_url, total_gp)
      `).in('status', ['recruiting', 'active']).order('created_at', { ascending: false })
    ]);

    let [{ data: feed_gliims, error }, { data: interactions }, { data: profile }, { data: saved }, { data: events }] = await load(colsFull);
    if (error) {
      // Pre-migration fallback: feed_gliims.is_premium / feed_gliims.status may not exist yet.
      [{ data: feed_gliims, error }, { data: interactions }, { data: profile }, { data: saved }, { data: events }] = await load(colsLegacy);
    }
    if (error) { console.error(error); return; }
    this.userBalance = profile?.wallet_balance || 0;
    this.userGP = profile?.total_gp || 0;
    this.allInteractions = interactions || [];
    this.currentEvents = events || [];
    
    // Fetch top 3 participants for full events
    this.eventLeaderboards = {};
    const fullEvents = this.currentEvents.filter(e => e.current_participants >= e.max_participants);
    for (const event of fullEvents) {
      const { data: leaderboardData } = await supabase.rpc('event_leaderboard', { p_event_id: event.id });
      if (leaderboardData?.leaderboard) {
        this.eventLeaderboards[event.id] = leaderboardData.leaderboard.slice(0, 3);
      }
    }
    
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
  filterPosts(feed_gliims) {
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

    return `<article class="blog-card${isAmbassador ? ' ambassador-card' : ''}" id="post-${post.id}" onclick="hubInstance.openReadView('${post.id}')">${coverHtml}<div class="blog-content"><div class="blog-meta"><span class="blog-category">${post.category || 'General'}</span>${draftBadge}${premiumBadge}<span class="blog-date">${new Date(post.created_at).toLocaleDateString([], {month: 'short', day: 'numeric'})}</span></div><h2 class="blog-title">${post.title || 'Untitled Gliim'}</h2><p class="blog-desc">${post.description || ''}</p><div class="blog-footer"><div class="blog-author hub-author-hit" onclick="event.stopPropagation(); hubInstance.viewAuthor('${post.user_id}')"><div style="position:relative;">${avatar}</div><span>${escapeHtml(post.profiles?.full_name || 'Gliimait')}</span></div><div class="blog-stats"><span class="blog-stat">${eyeSvg}${post.views || 0}</span><span class="blog-stat">${commentSvg}${comments}</span></div></div></div></article>`;
  },

  renderPosts(feed_gliims) {
    // The merged Library feed owns rendering; hand off to it when embedded.
    if (this.onFeedChange) { this.onFeedChange(); return; }

    const container = document.getElementById('feed_gliims-container');
    if (!container) return;
    const filtered = this.filterPosts(feed_gliims);
    
    // Render events first (if any), then regular posts
    const eventsHtml = (this.currentEvents || []).map(event => this.renderEventCard(event)).join('');
    const postsHtml = filtered.map(post => this.renderPostCard(post)).join('');
    
    if (!eventsHtml && filtered.length === 0) { 
      container.innerHTML = '<p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">No Gliims found.</p>'; 
      return; 
    }
    
    container.className = 'blog-feed';
    container.innerHTML = eventsHtml + postsHtml;
  },

  renderEventCard(event) {
    const isHost = event.host_id === store.user.id;
    const isFull = event.current_participants >= event.max_participants;
    const timeLeft = this.getEventTimeLeft(event);
    const prizePool = (event.prize_1st || 0) + (event.prize_2nd || 0) + (event.prize_3rd || 0);
    
    // Hide recruiting badge when event is full
    const statusBadge = (!isFull && event.status === 'recruiting') 
      ? `<span style="background: #F59E0B; color: white; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 700;">Recruiting</span>`
      : `<span style="background: #10B981; color: white; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 700;">Live</span>`;

    const coverHtml = event.cover_url 
      ? `<div class="event-card-cover" style="background-image: url('${event.cover_url}');"></div>`
      : `<div class="event-card-cover" style="background: var(--gradient-primary);"></div>`;

    // Show top 3 participants when event is full
    const topParticipants = this.eventLeaderboards?.[event.id] || [];
    const topParticipantsHtml = isFull && topParticipants.length > 0 ? `
      <div style="margin: 16px 0; padding: 12px; background: var(--surface-secondary, #f8f9fa); border-radius: 8px;">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-secondary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Top Participants</div>
        ${topParticipants.map((p, i) => `
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: ${i < topParticipants.length - 1 ? '6px' : '0'};">
            <div style="width: 20px; height: 20px; border-radius: 50%; background: ${i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32'}; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: white;">${i + 1}</div>
            <img src="${p.avatar_url || '/icon.png'}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;" onerror="this.src='/icon.png'">
            <span style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${escapeHtml(p.full_name)}</span>
            <span style="font-size: 12px; color: var(--text-muted); margin-left: auto;">${Number(p.total_gp || 0).toLocaleString()} GP</span>
          </div>
        `).join('')}
      </div>
    ` : '';

    // Hide join button when event is full
    const actionButton = isFull ? '' : `
      <button class="btn-primary event-card-btn" onclick="event.stopPropagation(); hubInstance.joinEvent('${event.id}')">
        ${event.status === 'recruiting' ? 'Join Event' : 'View Event'}
      </button>
    `;

    return `
      <article class="event-card" onclick="hubInstance.openEventPage('${event.id}')">
        ${coverHtml}
        <div class="event-card-body">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
            <h3 class="event-card-title">${escapeHtml(event.title)}</h3>
            ${statusBadge}
          </div>
          <p class="event-card-desc">${escapeHtml((event.description || '').substring(0, 100))}${event.description && event.description.length > 100 ? '...' : ''}</p>
          
          ${topParticipantsHtml}
          
          <div class="event-card-stats">
            <div class="event-stat">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>${timeLeft}</span>
            </div>
            <div class="event-stat">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              <span>${event.current_participants}/${event.max_participants}</span>
            </div>
            <div class="event-stat">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              <span>₦${prizePool.toLocaleString()}</span>
            </div>
          </div>

          ${actionButton}
        </div>
      </article>
    `;
  },

  getEventTimeLeft(event) {
    const isFull = event.current_participants >= event.max_participants;
    // Show countdown when event is full/active, not spots left
    if (event.status === 'recruiting' && !isFull) {
      return `${event.max_participants - event.current_participants} spots left`;
    }
    const end = new Date(event.end_date);
    const now = new Date();
    const diff = end - now;
    if (diff <= 0) return 'Ended';
    const days = Math.floor(diff / 86400000);
    if (days > 30) return Math.floor(days / 30) + 'mo left';
    if (days > 0) return days + 'd left';
    const hrs = Math.floor(diff / 3600000);
    return hrs + 'h left';
  },

  async openEventPage(eventId) {
    // Fetch event details
    const { data: event, error } = await supabase
      .from('events')
      .select(`
        *,
        profiles:profiles!host_id(full_name, avatar_url, total_gp)
      `)
      .eq('id', eventId)
      .single();

    if (error || !event) {
      alert('Event not found.');
      return;
    }

    // Fetch leaderboard
    const { data: leaderboardData } = await supabase.rpc('event_leaderboard', { p_event_id: eventId });
    const leaderboard = leaderboardData?.leaderboard || [];

    // Tagged gliims: participants tag the event with # in the composer and
    // the post lands here as well as in the main feed.
    const { data: taggedPosts } = await supabase
      .from('feed_gliims')
      .select(`
        id, title, category, description, cover_url, views, created_at, user_id, status,
        profiles:profiles!user_id(full_name, avatar_url, total_gp)
      `)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    // Same visibility rule as the feed: only live gliims (drafts stay private).
    const posts = (taggedPosts || []).filter(p => !p.status || p.status === 'approved');

    // Check if user is participant
    const { data: participation } = await supabase
      .from('event_participants')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', store.user.id)
      .maybeSingle();

    const isParticipant = !!participation;
    const isHost = event.host_id === store.user.id;
    // Participants can share submissions while the event is recruiting or
    // live — the countdown starts when spots fill up, but posts don't wait.
    const canPost = isParticipant && (event.status === 'recruiting' || event.status === 'active');

    const prizePool = (event.prize_1st || 0) + (event.prize_2nd || 0) + (event.prize_3rd || 0);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'event-page-modal';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 900px; max-height: 95vh; overflow-y: auto; padding: 0;">
        <div class="event-page-header" style="background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary)); padding: 32px; color: white; position: relative; overflow: hidden;">
          <button class="modal-close" onclick="document.getElementById('event-page-modal').remove()" style="position: absolute; top: 16px; right: 16px; color: white; z-index: 2; background: rgba(0,0,0,0.3); border: none; width: 32px; height: 32px; border-radius: 50%; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center;">×</button>
          
          ${event.cover_url ? `<img src="${event.cover_url}" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;">` : ''}
          
          <!-- Dark overlay for better text contrast in both modes -->
          <div style="position: absolute; inset: 0; background: linear-gradient(135deg, rgba(0,0,0,0.6), rgba(0,0,0,0.4)); z-index: 1;"></div>
          
          <div style="position: relative; z-index: 2;">
            <div style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
              <span style="background: rgba(255,255,255,0.25); backdrop-filter: blur(8px); padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid rgba(255,255,255,0.3);">${event.status === 'recruiting' ? 'Recruiting' : event.status === 'active' ? 'Live' : 'Ended'}</span>
              ${event.team_mode ? '<span style="background: rgba(255,255,255,0.25); backdrop-filter: blur(8px); padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid rgba(255,255,255,0.3);">Team Event</span>' : ''}
            </div>
            
            <h1 style="font-size: 32px; font-weight: 800; margin: 0 0 12px 0; text-shadow: 0 2px 8px rgba(0,0,0,0.5);">${escapeHtml(event.title)}</h1>
            <p style="font-size: 16px; margin: 0 0 24px 0; text-shadow: 0 1px 4px rgba(0,0,0,0.5); line-height: 1.5;">${escapeHtml(event.description)}</p>
            
            <div style="display: flex; gap: 32px; flex-wrap: wrap;">
              <div>
                <div style="font-size: 12px; opacity: 0.8; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Prize Pool</div>
                <div style="font-size: 24px; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">₦${prizePool.toLocaleString()}</div>
              </div>
              <div>
                <div style="font-size: 12px; opacity: 0.8; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Participants</div>
                <div style="font-size: 24px; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">${event.current_participants}/${event.max_participants}</div>
              </div>
              <div>
                <div style="font-size: 12px; opacity: 0.8; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Duration</div>
                <div style="font-size: 24px; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">${event.duration_days} days</div>
              </div>
              <div>
                <div style="font-size: 12px; opacity: 0.8; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Time Left</div>
                <div style="font-size: 24px; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">${this.getEventTimeLeft(event)}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="event-page-tabs" style="display: flex; border-bottom: 2px solid var(--border); background: var(--surface);">
          <button class="event-tab active" data-tab="leaderboard" style="flex: 1; padding: 16px; border: none; background: none; font-size: 15px; font-weight: 700; cursor: pointer; border-bottom: 3px solid var(--brand-primary); color: var(--brand-primary);">Leaderboard</button>
          <button class="event-tab" data-tab="posts" style="flex: 1; padding: 16px; border: none; background: none; font-size: 15px; font-weight: 700; cursor: pointer; color: var(--text-muted);">Posts</button>
        </div>

        <div class="event-page-content" style="padding: 24px;">
          <div id="event-tab-leaderboard" class="event-tab-content">
            ${leaderboard.length === 0 ? '<p style="text-align: center; color: var(--text-muted); padding: 40px;">No rankings yet. Be the first to post!</p>' : ''}
            ${leaderboard.map((entry, i) => `
              <div class="leaderboard-entry" style="display: flex; align-items: center; gap: 16px; padding: 16px; border: 1px solid var(--border); border-radius: 12px; margin-bottom: 12px; ${i < 3 ? 'background: linear-gradient(135deg, rgba(245,158,11,0.1), rgba(99,102,241,0.1));' : ''}">
                <div style="font-size: 24px; font-weight: 800; color: ${i === 0 ? '#F59E0B' : i === 1 ? '#9CA3AF' : i === 2 ? '#CD7F32' : 'var(--text-muted)'}; min-width: 40px;">#${entry.rank}</div>
                ${event.team_mode ? `
                  <div style="flex: 1;">
                    <div style="font-weight: 700; font-size: 16px;">${escapeHtml(entry.team_name)}</div>
                    <div style="font-size: 13px; color: var(--text-muted);">${entry.members?.length || 0} members</div>
                  </div>
                ` : `
                  <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                    ${entry.avatar_url ? `<img src="${entry.avatar_url}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">` : '<div style="width: 40px; height: 40px; border-radius: 50%; background: var(--gradient-primary);"></div>'}
                    <div style="font-weight: 700; font-size: 16px;">${escapeHtml(entry.full_name)}</div>
                  </div>
                `}
                <div style="font-size: 20px; font-weight: 800; color: var(--brand-primary);">${entry.total_gp} GP</div>
              </div>
            `).join('')}
          </div>

          <div id="event-tab-posts" class="event-tab-content" style="display: none;">
            ${canPost ? `
              <div style="text-align: center; padding: 24px; background: var(--bg-tertiary); border-radius: 12px; margin-bottom: 24px;">
                <p style="color: var(--text-secondary); margin: 0 0 8px 0; font-weight: 700;">Share your progress from the composer</p>
                <p style="color: var(--text-muted); margin: 0; font-size: 13px;">Publish a gliim and tag <span style="color: var(--brand-primary); font-weight: 700;">#${escapeHtml(event.title)}</span> — it appears here and in the feed.</p>
              </div>
            ` : !isParticipant ? `
              <div style="text-align: center; padding: 40px; background: var(--bg-tertiary); border-radius: 12px; margin-bottom: 24px;">
                <p style="color: var(--text-muted); margin-bottom: 16px;">Join this event, then tag it with # in the composer to post here.</p>
                ${event.status === 'recruiting' && event.current_participants < event.max_participants ? `<button class="btn-primary" onclick="hubInstance.joinEvent('${eventId}')">Join Event</button>` : ''}
              </div>
            ` : ''}

            ${(posts || []).length === 0 ? '<p style="text-align: center; color: var(--text-muted); padding: 40px;">No posts yet.</p>' : ''}
            ${(posts || []).map(post => {
              const avClass = tierClass(post.profiles?.total_gp, 'blog-avatar');
              const av = post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="${avClass}" style="object-fit:cover;">` : `<div class="${avClass}"></div>`;
              return `
              <div class="event-post" style="padding: 20px; border: 1px solid var(--border); border-radius: 12px; margin-bottom: 16px; cursor: pointer;" onclick="hubInstance.openReadView('${post.id}')">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                  <div style="position: relative;">${av}</div>
                  <div>
                    <div style="font-weight: 700;">${escapeHtml(post.profiles?.full_name || 'Gliimait')}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">${new Date(post.created_at).toLocaleString()}</div>
                  </div>
                </div>
                <div style="font-size: 17px; font-weight: 800; margin-bottom: 6px;">${escapeHtml(post.title)}</div>
                ${post.cover_url ? `<img src="${post.cover_url}" style="width: 100%; max-height: 280px; object-fit: cover; border-radius: 8px; margin-bottom: 10px;">` : ''}
                ${post.description ? `<div style="color: var(--text-secondary); line-height: 1.6;">${escapeHtml(post.description)}</div>` : ''}
                <div style="display: flex; gap: 16px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 13px;">
                  <span style="display: flex; align-items: center; gap: 6px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    ${post.views || 0}
                  </span>
                </div>
              </div>
            `; }).join('')}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Tab switching
    modal.querySelectorAll('.event-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.event-tab').forEach(t => {
          t.classList.remove('active');
          t.style.borderBottom = 'none';
          t.style.color = 'var(--text-muted)';
        });
        tab.classList.add('active');
        tab.style.borderBottom = '3px solid var(--brand-primary)';
        tab.style.color = 'var(--brand-primary)';

        modal.querySelectorAll('.event-tab-content').forEach(c => c.style.display = 'none');
        modal.querySelector(`#event-tab-${tab.dataset.tab}`).style.display = 'block';
      });
    });
  },

  async joinEvent(eventId) {
    const { data, error } = await supabase.rpc('event_join', {
      p_event_id: eventId,
      p_team_id: null
    });

    if (error || !data || !data.ok) {
      alert(`Failed to join event: ${data?.code || error?.message || 'Unknown error'}`);
      return;
    }

    alert('You have joined the event!');
    this.fetchPosts(); // Refresh to update participant count
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

    // Billing gate: premium unlocks are persistent — the server charges the
    // first open only and short-circuits every re-open (unlock once, read
    // forever). Free gliims record the per-open mini-price, deduped per cycle.
    const access = await ensureAccess('gliim', { itemId: postId });
    if (!access.allowed) {
      this.isModalOpen = false;
      await showBillingDenied(access);
      return;
    }

    // Server-side content lock: the body lives in feed_gliim_contents, and RLS
    // only returns a premium body once billing_access() recorded the unlock.
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
          return `<div class="read-block-audio-wrapper"><div class="read-audio-head"><div class="lib-eq read-eq"><span></span><span></span><span></span><span></span><span></span></div>${cap}</div><audio src="${escapeHtml(b.content)}" class="read-block-audio" controls preload="metadata"></audio></div>`;
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

  // Read-view media wiring: the equalizer dances while an audio chapter
  // plays, and every video gets the custom chrome (big play, seek, time,
  // mute, fullscreen) instead of the bare browser controls.
  setupMediaBlocks(root) {
    root.querySelectorAll('.read-block-audio').forEach(a => {
      const eq = a.closest('.read-block-audio-wrapper')?.querySelector('.lib-eq');
      if (!eq) return;
      a.addEventListener('play', () => eq.classList.add('playing'));
      a.addEventListener('pause', () => eq.classList.remove('playing'));
      a.addEventListener('ended', () => eq.classList.remove('playing'));
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
  // Records the unlock server-side, then reopens the reader.
  async unlockPremiumPost(postId) {
    const gate = await ensureAccess('gliim', { itemId: postId });
    if (!gate.allowed) { await showBillingDenied(gate); return; }
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
  removeEventCategory: (index) => hubView.removeEventCategory(index),
  hydratePolls: (scope) => hubView.hydratePolls(scope),
  pollVote: (postId, idx) => hubView.pollVote(postId, idx),
  openEventPage: (id) => hubView.openEventPage(id),
  joinEvent: (id) => hubView.joinEvent(id),
  saveComposerState: () => hubView.saveComposerState(),
  openPdfTile: (el) => hubView.openPdfTile(el),
  promptDelete: (id) => hubView.promptDelete(id),
  replyToUser: (postId, fullName, userId) => hubView.replyToUser(postId, fullName, userId),
  viewAuthor: (userId) => hubView.viewAuthor(userId),
  promptReport: (targetType, targetId) => hubView.promptReport(targetType, targetId),
  removeTag: (index) => hubView.removeTag(index),
  removeEventTag: () => hubView.removeEventTag(),
  isModalOpen: () => hubView.isModalOpen
};

export default hubView;
