import { supabase, API_BASE_URL } from '/shared/js/config.js';
import { store } from '../store.js';
import { ensureAccess, showBillingDenied, fetchBillingSummary } from '../billing.js';
import { uploadFile } from '../upload.js';
import { openReader } from '../reader.js?v=30';
import hubView from './feed-gliims.js?v=42';

// Feed is the merged home of gliims (posts) and shelf items (books, audiolites). The shelf
// keeps its database types; only the labels are member-facing.
function typeLabel(type) {
  if (type === 'book') return 'Book';
  if (type === 'audiolite') return 'Audiolite';
  return type || 'Item';
}

// The book builder mirrors the hub composer, so it reuses its icons and
// its CSS classes (both stylesheets are loaded globally in the dashboard).
const BLOCK_ICONS = {
  text: '<span style="font-weight:700; font-size: 14px;">Aa</span>',
  image: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
  video: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>',
  audio: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg>',
  file: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>'
};

const REMOVE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

// The server allowlist for the 'library' upload kind is the authority; these
// just narrow the file picker to what each format actually accepts. A Book
// takes one reflowable document (no PDF); an Audiolite takes audio chapters.
const BOOK_FILE_ACCEPT = '.epub,.doc,.docx';
const COVER_FILE_ACCEPT = 'image/*';
const AUDIO_FILE_ACCEPT = 'audio/*';

const CATEGORY_OPTIONS = ['Media', 'Tech', 'Business', 'Personal', 'Education']
  .map(c => `<option>${c}</option>`).join('');

const KIND_ICONS = {
  bundle: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect></svg>',
  book: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
  audiolite: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>'
};

const BLOCK_HEAD = '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default {
  title: 'Feed',
  template: `
    <div class="libmerge hub-layout" id="library-container">
      <div class="hub-category-tabs" id="hub-category-tabs">
        <button class="hub-category-tab active" data-category="all">Everything</button>
        <button class="hub-category-tab" data-category="Media">Media</button>
        <button class="hub-category-tab" data-category="Tech">Tech</button>
        <button class="hub-category-tab" data-category="Business">Business</button>
        <button class="hub-category-tab" data-category="Personal">Personal</button>
        <button class="hub-category-tab" data-category="Education">Education</button>
      </div>

      <div class="libmerge-feed" id="library-feed">
        <p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">Loading the Feed...</p>
      </div>

      <div class="library-fab-wrapper">
        <button class="library-fab-main" id="library-fab-main" title="Publish">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
    </div>
  `,

  init() {
    this.searchQuery = '';

    window.libraryInstance = {
      openDetails: (id) => {
        const item = (this.allItems || []).find(i => i.id == id);
        if (item) this.openDetails(item, this.ownedItems.has(item.id), this.walletBalance, this.savedItems.has(item.id));
      },
      purchase: (id) => this.purchaseItem(id),
      toggleSave: (id, isSaved) => this.toggleSave(id, isSaved),
      rateItem: (id) => this.promptRate(id),
      logInteraction: (id, type) => this.logInteraction(id, type),
      toggleTileMenu: (id) => this.toggleTileMenu(id),
      promptDeleteItem: (id) => this.promptDeleteItem(id)
    };

    this.setupTopbar();
    this.setupFab();
    this.setupCategoryTabs();

    // Gliims and shelf items share one feed: hub hands its render calls back
    // here so both card types stay interleaved in a single list.
    hubView.onFeedChange = () => this.renderFeed();

    // Column widths change with the viewport, so re-pack the masonry on resize.
    if (!this._masonryResize) {
      this._masonryResize = () => {
        clearTimeout(this._masonryTimer);
        this._masonryTimer = setTimeout(() => this.layoutMasonry(), 120);
      };
      window.addEventListener('resize', this._masonryResize);
    }

    hubView.init();
    this.loadShelf();
  },

  async loadShelf() {
    const [{ data: items }, { data: purchases }, { data: saved }, { data: profile }, { data: authorProfiles }, { data: adamProfile }, summary] = await Promise.all([
      supabase.from('feed_items').select('*').order('created_at', { ascending: false }),
      supabase.from('purchases').select('item_id').eq('user_id', store.user.id),
      supabase.from('saved_items').select('item_id').eq('user_id', store.user.id),
      supabase.from('profiles').select('wallet_balance').eq('id', store.user.id).single(),
      supabase.from('profiles').select('id, full_name, avatar_url').neq('id', store.user.id),
      supabase.rpc('library_adam_profile'),
      fetchBillingSummary()
    ]);

    this.allItems = (items || []).filter(item => item.type !== 'bundle');
    this.ownedItems = new Set(purchases?.map(p => p.item_id) || []);
    this.savedItems = new Set(saved?.map(s => s.item_id) || []);
    this.walletBalance = profile?.wallet_balance || 0;
    this.authorProfiles = authorProfiles || [];
    this.adamProfile = adamProfile || null;
    this.effTier = (summary && !summary.code) ? summary.tier : null;
    this.subscriber = this.effTier === 'trial' || this.effTier === 'payngo' || this.effTier === 'pro';

    this.renderFeed();
  },

  setupFab() {
    const fab = document.getElementById('library-fab-main');
    if (!fab) return;
    // The FAB opens a three-kind chooser: Bundle (gliim), Book, Audiolite.
    fab.addEventListener('click', () => this.openKindChooser());
  },

  // Step 1 of publishing: pick the kind. All three publish instantly.
  openKindChooser() {
    document.querySelector('.modal-overlay')?.remove();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content kind-chooser">
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        <h2 style="margin-bottom: 4px;">Publish to the Feed</h2>
        <p class="text-muted" style="margin-bottom: 20px;">Choose what you're uploading. Everything publishes instantly to the Feed.</p>
        <div class="kind-options">
          <button type="button" class="kind-option" id="kind-bundle">
            <span class="kind-ico">${KIND_ICONS.bundle}</span>
            <span class="kind-name">Bundle</span>
            <span class="kind-desc">A gliim: mixed text, image, video and audio blocks.</span>
          </button>
          <button type="button" class="kind-option" id="kind-book">
            <span class="kind-ico">${KIND_ICONS.book}</span>
            <span class="kind-name">Book</span>
            <span class="kind-desc">A cover, its details, and one EPUB or DOCX document.</span>
          </button>
          <button type="button" class="kind-option" id="kind-audiolite">
            <span class="kind-ico">${KIND_ICONS.audiolite}</span>
            <span class="kind-name">Audiolite</span>
            <span class="kind-desc">Audio chapters that play one after another.</span>
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('kind-bundle').addEventListener('click', () => { modal.remove(); hubView.openCreateModal(); });
    document.getElementById('kind-book').addEventListener('click', () => { modal.remove(); this.openBookComposer(); });
    document.getElementById('kind-audiolite').addEventListener('click', () => { modal.remove(); this.openAudioliteComposer(); });
  },

  // Shared metadata head for the Book and Audiolite submission forms.
  submissionHeadFields(kindLabel) {
    return `
      <div class="form-group"><label>Title</label><input type="text" id="sub-title" class="input" placeholder="Give your ${kindLabel} a title..."></div>
      <div class="form-group"><label>Category</label><select id="sub-category" class="input">${CATEGORY_OPTIONS}</select></div>
      <div class="form-group"><label>Description</label><textarea id="sub-description" class="input" rows="3" placeholder="A short summary readers see before opening..."></textarea></div>`;
  },

  coverUploadField() {
    return `
      <div class="form-group">
        <label>Cover image</label>
        <label class="custom-file-upload">
          <img src="/icons/clip.svg" class="upload-icon-img" alt="Upload">
          <span class="block-file-name">Choose cover</span>
          <input type="file" id="sub-cover-input" accept="${COVER_FILE_ACCEPT}" hidden>
        </label>
        <div class="upload-status" id="sub-cover-status" style="font-size: 12px; margin-top: 8px;"></div>
        <div class="block-preview" id="sub-cover-preview"></div>
      </div>`;
  },

  // Wires a single file input to uploadFile, writing the public URL into
  // `urlTarget` (a hidden input) and reporting progress in `statusEl`.
  wireSingleUpload(inputEl, statusEl, urlTarget, previewEl, kind) {
    inputEl.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      statusEl.textContent = 'Uploading...';
      statusEl.style.color = 'var(--brand-primary)';
      try {
        const url = await uploadFile(file, kind);
        urlTarget.value = url;
        statusEl.textContent = 'Upload complete.';
        statusEl.style.color = 'var(--success)';
        if (previewEl) previewEl.innerHTML = `<img src="${url}" style="max-width: 140px; border-radius: 8px; margin-top: 8px;">`;
      } catch (err) {
        statusEl.textContent = err.message || 'Upload failed.';
        statusEl.style.color = 'var(--error)';
      }
    });
  },

  openBookComposer() {
    document.querySelector('.modal-overlay')?.remove();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content lib-submission-form">
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        <h2 style="margin-bottom: 4px;">Publish a Book</h2>
        <p class="text-muted" style="margin-bottom: 20px;">Only the cover shows on the shelf. Upload one EPUB or DOCX — readers open it in-page.</p>
        ${this.submissionHeadFields('book')}
        ${this.coverUploadField()}
        <div class="form-group">
          <label>Document (EPUB or DOCX)</label>
          <label class="custom-file-upload">
            <img src="/icons/clip.svg" class="upload-icon-img" alt="Upload">
            <span class="block-file-name" id="sub-doc-name">Choose document</span>
            <input type="file" id="sub-doc-input" accept="${BOOK_FILE_ACCEPT}" hidden>
          </label>
          <div class="upload-status" id="sub-doc-status" style="font-size: 12px; margin-top: 8px;"></div>
          <input type="hidden" id="sub-doc-url">
        </div>
        <button class="btn-primary" id="sub-submit" style="width: 100%; margin-top: 24px;">Publish Book</button>
      </div>`;
    document.body.appendChild(modal);

    const docName = document.getElementById('sub-doc-name');
    this.wireSingleUpload(
      document.getElementById('sub-doc-input'),
      document.getElementById('sub-doc-status'),
      document.getElementById('sub-doc-url'),
      null,
      'library'
    );
    document.getElementById('sub-doc-input').addEventListener('change', (e) => {
      if (e.target.files[0]) docName.textContent = e.target.files[0].name;
    });
    this.wireSingleUpload(
      document.getElementById('sub-cover-input'),
      document.getElementById('sub-cover-status'),
      { set value(v) { modal.dataset.coverUrl = v; }, get value() { return modal.dataset.coverUrl || ''; } },
      document.getElementById('sub-cover-preview'),
      'library'
    );

    document.getElementById('sub-submit').addEventListener('click', async () => {
      const title = document.getElementById('sub-title').value.trim();
      const fileUrl = document.getElementById('sub-doc-url').value;
      if (!title) return appAlert('Give your book a title.');
      if (!fileUrl) return appAlert('Upload the EPUB or DOCX document.');

      const btn = document.getElementById('sub-submit');
      btn.disabled = true; btn.textContent = 'Publishing...';

      const { data: itemRow, error: itemError } = await supabase.from('feed_items').insert({
        type: 'book',
        title,
        description: document.getElementById('sub-description').value.trim(),
        category: document.getElementById('sub-category').value,
        cover_url: modal.dataset.coverUrl || null,
        author: store.profile.full_name || null,
        author_avatar: store.profile.avatar_url || null,
        owner_id: store.user.id
      }).select('id').single();

      if (itemError) {
        btn.disabled = false; btn.textContent = 'Publish Book';
        return appAlert('Publish failed: ' + itemError.message);
      }

      const { error: contentError } = await supabase.from('feed_contents').insert({
        item_id: itemRow.id,
        blocks: [],
        files: [{ url: fileUrl, title }]
      });

      if (contentError) {
        await supabase.from('feed_items').delete().eq('id', itemRow.id);
        btn.disabled = false; btn.textContent = 'Publish Book';
        return appAlert('Publish failed: ' + contentError.message);
      }

      modal.remove();
      this.loadShelf();
      appAlert('Your book is now live on the Feed.');
    });
  },

  openAudioliteComposer() {
    document.querySelector('.modal-overlay')?.remove();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content lib-submission-form">
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        <h2 style="margin-bottom: 4px;">Publish an Audiolite</h2>
        <p class="text-muted" style="margin-bottom: 20px;">Add one audio file per chapter. They play in order, one after another.</p>
        ${this.submissionHeadFields('audiolite')}
        ${this.coverUploadField()}
        <div class="form-group">
          <label>Chapters</label>
          <div id="sub-chapters" style="display: flex; flex-direction: column; gap: 12px;"></div>
          <button type="button" class="btn-secondary" id="sub-add-chapter" style="margin-top: 12px;">+ Add chapter</button>
        </div>
        <button class="btn-primary" id="sub-submit" style="width: 100%; margin-top: 24px;">Publish Audiolite</button>
      </div>`;
    document.body.appendChild(modal);

    this.wireSingleUpload(
      document.getElementById('sub-cover-input'),
      document.getElementById('sub-cover-status'),
      { set value(v) { modal.dataset.coverUrl = v; }, get value() { return modal.dataset.coverUrl || ''; } },
      document.getElementById('sub-cover-preview'),
      'library'
    );

    const chaptersEl = document.getElementById('sub-chapters');
    let chapterSeq = 0;
    const addChapter = () => {
      chapterSeq += 1;
      const row = document.createElement('div');
      row.className = 'chapter-row';
      row.innerHTML = `
        <div class="chapter-row-head">
          <input type="text" class="input chapter-title" placeholder="Chapter ${chapterSeq} title">
          <button type="button" class="chapter-remove" title="Remove chapter">
            ${REMOVE_ICON}
          </button>
        </div>
        <label class="custom-file-upload">
          <img src="/icons/clip.svg" class="upload-icon-img" alt="Upload">
          <span class="block-file-name chapter-file-name">Choose audio</span>
          <input type="file" class="chapter-file-input" accept="${AUDIO_FILE_ACCEPT}" hidden>
        </label>
        <div class="upload-status chapter-status" style="font-size: 12px; margin-top: 6px;"></div>
        <input type="hidden" class="chapter-url">`;
      chaptersEl.appendChild(row);

      row.querySelector('.chapter-remove').addEventListener('click', () => row.remove());
      const fileInput = row.querySelector('.chapter-file-input');
      fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) row.querySelector('.chapter-file-name').textContent = e.target.files[0].name;
      });
      this.wireSingleUpload(
        fileInput,
        row.querySelector('.chapter-status'),
        row.querySelector('.chapter-url'),
        null,
        'library'
      );
    };
    document.getElementById('sub-add-chapter').addEventListener('click', addChapter);
    addChapter();

    document.getElementById('sub-submit').addEventListener('click', async () => {
      const title = document.getElementById('sub-title').value.trim();
      if (!title) return appAlert('Give your audiolite a title.');

      const chapters = [];
      chaptersEl.querySelectorAll('.chapter-row').forEach((row, i) => {
        const url = row.querySelector('.chapter-url').value;
        if (!url) return;
        const chapterTitle = row.querySelector('.chapter-title').value.trim() || `Chapter ${i + 1}`;
        chapters.push({ title: chapterTitle, url });
      });
      if (!chapters.length) return appAlert('Upload at least one audio chapter.');

      const btn = document.getElementById('sub-submit');
      btn.disabled = true; btn.textContent = 'Publishing...';

      const { data: itemRow, error: itemError } = await supabase.from('feed_items').insert({
        type: 'audiolite',
        title,
        description: document.getElementById('sub-description').value.trim(),
        category: document.getElementById('sub-category').value,
        cover_url: modal.dataset.coverUrl || null,
        author: store.profile.full_name || null,
        author_avatar: store.profile.avatar_url || null,
        owner_id: store.user.id
      }).select('id').single();

      if (itemError) {
        btn.disabled = false; btn.textContent = 'Publish Audiolite';
        return appAlert('Publish failed: ' + itemError.message);
      }

      const { error: contentError } = await supabase.from('feed_contents').insert({
        item_id: itemRow.id,
        blocks: [],
        files: chapters
      });

      if (contentError) {
        await supabase.from('feed_items').delete().eq('id', itemRow.id);
        btn.disabled = false; btn.textContent = 'Publish Audiolite';
        return appAlert('Publish failed: ' + contentError.message);
      }

      modal.remove();
      this.loadShelf();
      appAlert('Your audiolite is now live on the Feed.');
    });
  },

  setupTopbar() {
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    if (topbarDynamic) {
      topbarDynamic.innerHTML = `
        <div class="lib-topbar-search">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="lib-search" class="lib-topbar-search-input" placeholder="Search gliims, books and audiolites...">
        </div>
      `;
      document.getElementById('lib-search').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        this.searchQuery = q;
        hubView.searchQuery = q;
        if (q.length >= 3) hubView.interestSignal(0, null, q);
        this.renderFeed();
      });
    }

    // The gliim filter menu (Mine / Tagged / Saved / Drafts).
    hubView.setupTopbarActions();
  },

  setupCategoryTabs() {
    const tabs = document.querySelectorAll('.hub-category-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        hubView.currentFilter = tab.dataset.category;
        hubView.renderPosts(hubView.currentPosts);
      });
    });
  },

  async logInteraction(itemId, type) {
    await supabase.from('feed_interactions').insert({ user_id: store.user.id, item_id: itemId, interaction_type: type });
  },

  // Shelf items belong to the account with username 'adam'; name and
  // avatar resolve live so the attribution survives profile edits.
  displayAuthorName(item) {
    return item.author || (this.adamProfile && this.adamProfile.full_name) || 'adam';
  },

  resolveAuthor(item) {
    const name = this.displayAuthorName(item);
    const known = (this.authorProfiles || []).find(p => p.full_name === name) ||
      (this.adamProfile && this.adamProfile.full_name === name ? this.adamProfile : null);
    if (known) return known;
    if (name && store.profile?.full_name === name) {
      return { id: store.user.id, full_name: store.profile.full_name, avatar_url: store.profile.avatar_url };
    }
    return this.adamProfile || null;
  },

  toggleLibMenu() {
    const menu = document.getElementById('lib-menu-dropdown');
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

  // Same flow as reporting in the hub: reason (min 5 chars) → reports row.
  promptReport(itemId) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content" style="max-width: 440px;">
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        <h2 style="margin-bottom: 8px;">Report Content</h2>
        <p class="text-muted" style="margin-bottom: 16px;">State your reason for reporting this item. It will be reviewed by the team.</p>
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
        target_type: 'library',
        target_id: itemId,
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

  // Books and audiolites, matched against the same filter + search box that
  // drives the gliim feed, so both kinds weave into one list consistently.
  visibleItems() {
    const f = hubView.currentFilter || 'all';
    let items = this.allItems || [];
    if (f === 'saved') items = items.filter(i => this.savedItems.has(i.id));
    else if (f === 'mine') items = items.filter(i => i.owner_id === store.user.id);
    else if (f === 'tagged') items = [];
    else if (f !== 'all') items = items.filter(i => i.category === f);

    const q = this.searchQuery;
    if (q) {
      items = items.filter(item =>
        item.title?.toLowerCase().includes(q) ||
        item.author?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
      );
    }
    return items;
  },

  // Gliims and shelf items (books/audiolites) share one feed: both card kinds
  // are merged and sorted newest-first so they interleave by publish date. A
  // small in-page toolbar switches between the masonry grid and a list.
  renderFeed() {
    const container = document.getElementById('library-feed');
    if (!container) return;

    const gliims = hubView.filterPosts().map(post => ({
      at: Date.parse(post.created_at) || 0,
      html: this.wrapItem(hubView.renderPostCard(post), 'gliim')
    }));
    const shelf = this.visibleItems().map(item => ({
      at: Date.parse(item.created_at) || 0,
      html: this.wrapItem(this.renderShelfCard(item), 'shelf')
    }));
    const cards = [...gliims, ...shelf]
      .sort((a, b) => b.at - a.at)
      .map(c => c.html);

    if (!cards.length) {
      container.innerHTML = '<p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">Nothing here yet.</p>';
      return;
    }

    container.innerHTML = `<div class="library-feed feed-grid">${cards.join('')}</div>`;
    this.layoutMasonry();
  },

  wrapItem(html, kind) {
    return `<div class="feed-item feed-item--${kind}">${html}</div>`;
  },

  // Pinterest masonry: each item spans exactly its own height in 8px row
  // slices (plus its bottom gap), so short tiles tuck under tall cards with
  // no row-sized dead space. Re-run whenever widths change.
  layoutMasonry() {
    const feed = document.querySelector('#library-feed .library-feed');
    if (!feed) return;

    const ROW = 8;
    const GAP = window.matchMedia('(max-width: 768px)').matches ? 12 : 24;

    feed.querySelectorAll('.feed-item').forEach(item => {
      const inner = item.firstElementChild;
      if (!inner) return;
      item.style.gridRowEnd = 'auto';
      const height = inner.getBoundingClientRect().height;
      item.style.gridRowEnd = `span ${Math.max(1, Math.ceil((height + GAP) / ROW))}`;
    });
  },

  // Shelf items are thumbnail-only cover tiles woven into the same feed as
  // gliims: real cover or a plain placeholder tile, ownership badge, and a hover
  // overlay with the title. No text below the thumbnail.
  renderShelfCard(item) {
    const isOwned = this.ownedItems.has(item.id);
    const isSaved = this.savedItems.has(item.id);
    const isOwner = item.owner_id === store.user.id;

    let thumb;
    if (item.cover_url) {
      thumb = `<img class="lib-thumb" src="${escapeHtml(item.cover_url)}" alt="" loading="lazy">`;
    } else {
      thumb = '<div class="lib-thumb lib-thumb-fallback"></div>';
    }

    const ownedBadge = isOwned
      ? '<span class="lib-tick-badge"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>'
      : '';
    const savedBadge = (isSaved && !isOwned)
      ? '<span class="lib-saved-badge"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg></span>'
      : '';

    const playIcon = item.type === 'audiolite'
      ? `<div class="lib-play-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>`
      : '';

    const ownerMenu = isOwner ? `
      <div class="lib-tile-menu-wrap">
        <button class="lib-tile-menu-btn" onclick="event.stopPropagation(); event.preventDefault(); libraryInstance.toggleTileMenu('${item.id}')">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
        </button>
        <div class="lib-tile-menu" id="tile-menu-${item.id}">
          <div class="lib-tile-menu-item danger" onclick="event.stopPropagation(); event.preventDefault(); libraryInstance.promptDeleteItem('${item.id}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Delete
          </div>
        </div>
      </div>
    ` : '';

    return `
      <div class="lib-tile lib-${item.type}" onclick="libraryInstance.openDetails('${item.id}')">
        ${thumb}
        ${playIcon}
        ${ownedBadge}${savedBadge}
        ${ownerMenu}
        <div class="lib-overlay"><h4>${escapeHtml(item.title)}</h4></div>
      </div>
    `;
  },

  openDetails(item, isOwned, balance, isSaved) {
    document.querySelector('.modal-overlay')?.remove();

    // Owned items skip the detail modal and open straight into the content
    // (same as audiolites). The billing gate already passed at purchase time.
    if (isOwned) {
      this.openContent(item);
      return;
    }

    const author = this.resolveAuthor(item);
    const authorName = this.displayAuthorName(item);
    const authorAvatar = (author && author.avatar_url) || item.author_avatar;

    // Owned opens skip the billing gate (wallet tier owns these forever);
    // subscriber opens still gate so the server records/mini-prices the usage.
    const canOpen = isOwned || this.subscriber;

    const menuActionHtml = isOwned
      ? `
        <div class="lib-menu-item" id="rate-item-btn">Rate Item</div>
        <div class="lib-menu-item" id="share-item-btn">Share Item</div>
      `
      : `<div class="lib-menu-item" id="save-item-btn">${isSaved ? 'Unsave Item' : 'Save Item'}</div>`;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content lib-modal-content">
        <div class="lib-modal-body">
          <span class="lib-modal-type">${typeLabel(item.type)}</span>
          <h2>${item.title}</h2>
          <p class="lib-modal-author">by ${authorName}</p>
          <p class="lib-modal-desc">${item.description}</p>
          ${!isOwned && this.subscriber ? `<div class="lib-modal-price">Included with your subscription</div>` : ''}

          <div class="lib-action-row">
            ${canOpen
              ? `<button class="btn-primary lib-action-btn" id="access-content-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  Access Content
                </button>`
              : `<button class="btn-primary lib-action-btn" onclick="libraryInstance.purchase('${item.id}')">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  ${balance >= (item.price || 0) ? 'Unlock' : 'Insufficient'}
                </button>`
            }
            <div class="lib-modal-menu">
              <button class="lib-menu-btn" id="lib-menu-toggle">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
              </button>
              <div class="lib-menu-dropdown" id="lib-menu-dropdown">
                <div class="lib-menu-item" id="close-item-btn">Close</div>
                ${menuActionHtml}
                <div class="lib-menu-item" id="report-item-btn">Report Content</div>
                <div class="lib-menu-item ask-me-item" id="ask-me-btn">
                  ${authorAvatar
                    ? `<img src="${authorAvatar}" alt="Author" class="lib-menu-avatar">`
                    : `<div class="lib-menu-avatar lib-menu-avatar-fallback"></div>`} ${authorName}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const hideMenu = () => document.getElementById('lib-menu-dropdown')?.classList.remove('active');

    document.getElementById('lib-menu-toggle').addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.toggleLibMenu();
    });

    document.getElementById('close-item-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      hideMenu();
      modal.remove();
    });

    document.getElementById('report-item-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      hideMenu();
      this.promptReport(item.id);
    });

    if (canOpen) {
      document.getElementById('access-content-btn').addEventListener('click', async () => {
        if (this.subscriber) {
          // Server decides price/recording for this open. Owned wallet opens
          // never reach here, so PURCHASE_REQUIRED can't fire for them.
          const gate = await ensureAccess(item.type, { itemId: item.id });
          if (!gate.allowed) { await showBillingDenied(gate); return; }
        }
        this.logInteraction(item.id, 'read_end');
        this.openContent(item);
      });
    }
    if (isOwned) {
      document.getElementById('rate-item-btn').addEventListener('click', (e) => {
        e.stopPropagation(); hideMenu(); libraryInstance.rateItem(item.id);
      });
      document.getElementById('share-item-btn').addEventListener('click', (e) => {
        e.stopPropagation(); hideMenu(); this.logInteraction(item.id, 'share'); this.shareItem(item);
      });
    } else {
      document.getElementById('save-item-btn').addEventListener('click', (e) => {
        e.stopPropagation(); hideMenu(); libraryInstance.toggleSave(item.id, isSaved);
      });
    }

    document.getElementById('ask-me-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.logInteraction(item.id, 'ask_me');
      const target = this.resolveAuthor(item);
      if (!target) return alert("Author profile not found.");
      if (target.id === store.user.id) sessionStorage.removeItem('view_profile_id');
      else sessionStorage.setItem('view_profile_id', target.id);
      document.querySelector('.modal-overlay')?.remove();
      window.location.hash = '#/profile';
    });
  },

  // Called only after the billing gate has passed. The body lives in
  // feed_contents, whose RLS policy returns a row solely to viewers who
  // have unlocked the item — so a failed gate shows up here as an empty body
  // rather than as leaked content.
  async openContent(item) {
    document.querySelector('.modal-overlay')?.remove();

    let body = null;
    const { data, error } = await supabase.from('feed_contents')
      .select('blocks, files').eq('item_id', item.id).maybeSingle();
    if (!error && data) body = data;

    const blocks = (body && Array.isArray(body.blocks)) ? body.blocks : [];
    const files = (body && Array.isArray(body.files)) ? body.files.filter(f => f && f.url) : [];

    if (item.type === 'audiolite') return this.openAudiolite(item, files);
    const fileUrl = (files[0] && files[0].url) || item.file_url || null;
    return this.openReader(item, blocks, fileUrl);
  },

  fileKind(url) {
    if (!url) return null;
    const ext = url.split('?')[0].split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (['mp3', 'wav', 'm4a', 'ogg', 'aac'].includes(ext)) return 'audio';
    if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
    return 'file';
  },

  fileIcon(kind) {
    const svgs = {
      image: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
      pdf: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
      audio: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>',
      video: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>',
      file: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>'
    };
    return svgs[kind] || svgs.file;
  },

  // Book blocks reuse the hub reader's .read-block-* classes, so a library
  // book reads like a gliim.
  renderBlock(b) {
    const value = b && b.content != null ? String(b.content) : '';
    if (!value.trim()) return '';

    if (b.type === 'image') {
      const cap = b.caption ? `<figcaption class="read-block-caption">${escapeHtml(b.caption)}</figcaption>` : '';
      return `<figure class="read-block-figure"><img src="${escapeHtml(value)}" class="read-block-media" data-lightbox data-caption="${escapeHtml(b.caption || '')}">${cap}</figure>`;
    }
    if (b.type === 'video') return `<video src="${escapeHtml(value)}" class="read-block-media" controls></video>`;
    if (b.type === 'audio') return `<div class="read-block-audio-wrapper"><audio src="${escapeHtml(value)}" class="read-block-audio" controls></audio></div>`;
    if (b.type === 'file') {
      // Placeholder — reader.js hydrates this in-page (pdf.js/mammoth/epub.js)
      // so the document never leaves the reader overlay for a new browser tab.
      return `<div class="rdr-inline-file" data-file-src="${escapeHtml(value)}"></div>`;
    }

    const text = escapeHtml(value);
    if (b.type === 'text' && b.style === 'title') return `<h2 class="read-block-title">${text}</h2>`;
    if (b.type === 'text' && b.style === 'subtitle') return `<h3 class="read-block-subtitle">${text}</h3>`;
    if (b.type === 'text' && b.style === 'list') {
      const items = text.split('\n')
        .map(line => line.replace(/^[-*\u2022]\s*/, '').trim())
        .filter(Boolean)
        .map(line => `<div class="read-block-list-item">${line}</div>`)
        .join('');
      return `<div class="read-block-list">${items}</div>`;
    }
    return `<p class="read-block-text">${text.replace(/\n/g, '<br>')}</p>`;
  },

  // Delegate to the shared client-side reader (assets/js/reader.js). It owns
  // the overlay, progress tracking, completion GP and the deterrence layer.
  openReader(item, blocks, fileUrl) {
    const author = this.resolveAuthor(item);
    const authorName = this.displayAuthorName(item);
    const isSaved = this.savedItems.has(item.id);
    return openReader({
      item,
      blocks,
      fileUrl,
      renderBlock: (b) => this.renderBlock(b),
      engagement: {
        itemId: item.id,
        authorName,
        authorAvatar: author?.avatar_url || null,
        isSaved,
        onRecordInteraction: (type) => this.logInteraction(item.id, type)
      }
    });
  },

  // Audiolite player: `chapters` is an ordered [{title,url}] list. Chapters
  // auto-advance — when one ends the next starts — and finishing the last one
  // completes the audiolite and earns its GP (idempotent, once).
  openAudiolite(item, chapters) {
    let list = Array.isArray(chapters) ? chapters.filter(c => c && c.url) : [];
    if (!list.length && item.file_url) list = [{ title: item.title, url: item.file_url }];
    const hasAudio = list.length > 0;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content lib-modal-content lib-audio-modal">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        <div class="lib-audio-art ${item.cover_url ? '' : 'lib-audio-art-fallback'}" style="${item.cover_url ? `background-image:url('${escapeHtml(item.cover_url)}')` : ''}">
          ${item.cover_url ? '' : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>'}
        </div>
        <h2 class="lib-audio-title">${escapeHtml(item.title)}</h2>
        <p class="lib-audio-author">${escapeHtml(this.displayAuthorName(item))}</p>
        <p class="lib-audio-chapter" id="lib-audio-chapter">${hasAudio ? escapeHtml(list[0].title || 'Chapter 1') : ''}</p>

        <div class="lib-eq" id="lib-eq"><span></span><span></span><span></span><span></span><span></span></div>

        <div class="lib-audio-player">
          <button class="lib-audio-play" id="lib-audio-play" ${hasAudio ? '' : 'disabled'}>
            <svg id="lib-audio-play-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
          </button>
          <div class="lib-audio-timeline">
            <span id="lib-audio-cur">0:00</span>
            <input type="range" id="lib-audio-seek" min="0" max="1000" value="0" ${hasAudio ? '' : 'disabled'}>
            <span id="lib-audio-dur">0:00</span>
          </div>
          <button class="lib-audio-speed" id="lib-audio-speed">1x</button>
        </div>
        ${hasAudio ? `
          <div class="lib-audio-chapters" id="lib-audio-chapters">
            ${list.map((c, i) => `
              <button type="button" class="lib-chapter${i === 0 ? ' active' : ''}" data-idx="${i}">
                <span class="lib-chapter-n">${i + 1}</span>
                <span class="lib-chapter-title">${escapeHtml(c.title || `Chapter ${i + 1}`)}</span>
              </button>`).join('')}
          </div>` : '<p class="lib-reader-empty" style="margin-top: 16px;">No audio chapters attached yet.</p>'}
        <audio id="lib-audio" preload="metadata"></audio>
      </div>
    `;
    document.body.appendChild(modal);
    if (!hasAudio) return;

    const audio = document.getElementById('lib-audio');
    const playBtn = document.getElementById('lib-audio-play');
    const playIcon = document.getElementById('lib-audio-play-icon');
    const seek = document.getElementById('lib-audio-seek');
    const cur = document.getElementById('lib-audio-cur');
    const dur = document.getElementById('lib-audio-dur');
    const eq = document.getElementById('lib-eq');
    const speedBtn = document.getElementById('lib-audio-speed');
    const chapterLabel = document.getElementById('lib-audio-chapter');
    const chapterBtns = Array.from(modal.querySelectorAll('.lib-chapter'));
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const PLAY = '<polygon points="6 4 20 12 6 20 6 4"></polygon>';
    const PAUSE = '<rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect>';

    let idx = 0;
    let audioCompleted = false;

    function highlight(i) {
      chapterBtns.forEach((b, bi) => b.classList.toggle('active', bi === i));
      chapterLabel.textContent = list[i].title || `Chapter ${i + 1}`;
    }
    function loadChapter(i, autoplay) {
      idx = i;
      highlight(i);
      seek.value = 0; cur.textContent = '0:00'; dur.textContent = '0:00';
      audio.src = list[i].url;
      audio.playbackRate = parseFloat(speedBtn.textContent) || 1;
      if (autoplay) audio.play().catch(() => {});
    }

    chapterBtns.forEach((b) => {
      b.addEventListener('click', () => loadChapter(parseInt(b.dataset.idx, 10), true));
    });

    loadChapter(0, false);

    playBtn.addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
    audio.addEventListener('play', () => { playIcon.innerHTML = PAUSE; eq.classList.add('playing'); });
    audio.addEventListener('pause', () => { playIcon.innerHTML = PLAY; eq.classList.remove('playing'); });
    audio.addEventListener('ended', async () => {
      playIcon.innerHTML = PLAY; eq.classList.remove('playing');
      // Auto-advance to the next chapter; the last one completes the audiolite.
      if (idx < list.length - 1) { loadChapter(idx + 1, true); return; }

      seek.value = 0; cur.textContent = '0:00';
      if (audioCompleted) return;
      audioCompleted = true;
      try {
        await supabase.from('reading_progress').upsert(
          { user_id: store.user.id, item_id: item.id, percent: 100, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { onConflict: 'user_id,item_id' }
        );
        const { data } = await supabase.rpc('complete_reading', { p_item: item.id });
        if (data && data.ok && data.gp_awarded > 0) {
          const t = document.createElement('div');
          t.className = 'rdr-toast';
          t.textContent = `Completed — +${data.gp_awarded} GP`;
          modal.appendChild(t);
          setTimeout(() => t.remove(), 3200);
        }
      } catch (_) {}
    });
    audio.addEventListener('loadedmetadata', () => { dur.textContent = fmt(audio.duration); });
    audio.addEventListener('timeupdate', () => {
      cur.textContent = fmt(audio.currentTime);
      if (audio.duration) seek.value = (audio.currentTime / audio.duration) * 1000;
    });
    seek.addEventListener('input', () => {
      if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration;
    });
    speedBtn.addEventListener('click', () => {
      const speeds = [1, 1.25, 1.5, 2];
      const next = speeds[(speeds.indexOf(audio.playbackRate) + 1) % speeds.length];
      audio.playbackRate = next;
      speedBtn.textContent = `${next}x`;
    });
  },

  shareItem(item) {
    if (navigator.share) {
      navigator.share({ title: item.title, text: item.description, url: window.location.href }).catch(err => console.log('Share cancelled'));
    } else {
      alert("Sharing not supported. Copy URL from address bar.");
    }
  },

  async toggleSave(itemId, isCurrentlySaved) {
    if (isCurrentlySaved) {
      await supabase.from('saved_items').delete().eq('user_id', store.user.id).eq('item_id', itemId);
      this.savedItems.delete(itemId);
      alert("Item removed from collections.");
    } else {
      await supabase.from('saved_items').insert({ user_id: store.user.id, item_id: itemId });
      this.savedItems.add(itemId);
      alert("Item saved to your collections!");
    }
    document.querySelector('.modal-overlay')?.remove();
    this.renderFeed();
  },

  toggleTileMenu(itemId) {
    document.querySelectorAll('.lib-tile-menu.active').forEach(m => m.classList.remove('active'));
    const menu = document.getElementById(`tile-menu-${itemId}`);
    if (menu) menu.classList.toggle('active');

    if (!this._tileMenuClose) {
      this._tileMenuClose = (e) => {
        if (!e.target.closest('.lib-tile-menu-wrap')) {
          document.querySelectorAll('.lib-tile-menu.active').forEach(m => m.classList.remove('active'));
        }
      };
      document.addEventListener('click', this._tileMenuClose, true);
    }
  },

  async promptDeleteItem(itemId) {
    document.querySelectorAll('.lib-tile-menu.active').forEach(m => m.classList.remove('active'));

    const item = (this.allItems || []).find(i => i.id === itemId);
    const label = item ? (item.type === 'audiolite' ? 'Audiolite' : 'Book') : 'Item';

    const password = await appPrompt(`To permanently delete this ${label.toLowerCase()}, please enter your password:`, { inputType: 'password', okText: 'Delete', danger: true });
    if (!password) return;

    const email = store.user && store.user.email;
    if (!email) return alert('Account information not available. Please sign in again.');
    
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) return alert('Incorrect password. Deletion cancelled.');

    try {
      // Delete directly from Supabase (RLS ensures owners can only delete their own items)
      const { error: deleteError } = await supabase.from('feed_items').delete().eq('id', itemId);
      if (deleteError) return alert('Delete failed: ' + deleteError.message);
      
      alert(`${label} deleted successfully.`);
      this.loadShelf();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  },

  promptRate(itemId) {
    document.querySelector('.modal-overlay')?.remove();
    const item = this.allItems.find(i => i.id == itemId);
    if (!item) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content lib-modal-content">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        <div class="lib-modal-body">
          <span class="lib-modal-type">Feedback</span>
          <h2>Rate: ${item.title}</h2>
          <p class="lib-modal-author">Your feedback helps us identify trending content.</p>
          <div class="form-group" style="margin-top: 24px;">
            <label>How good is this content? (1 - 10)</label>
            <input type="number" id="rate-score" class="input" min="1" max="10" placeholder="e.g. 8">
          </div>
          <div class="form-group">
            <label>Review (Max 50 words)</label>
            <textarea id="rate-review" class="input" rows="3" maxlength="300" placeholder="Share your thoughts..."></textarea>
          </div>
          <button class="btn-primary" style="width: 100%;" id="submit-rate-btn">Submit Rating</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('submit-rate-btn').addEventListener('click', async () => {
      const score = parseInt(document.getElementById('rate-score').value);
      const review = document.getElementById('rate-review').value.trim();
      if (!score || score < 1 || score > 10) return alert("Please enter a score between 1 and 10.");

      const { error } = await supabase.from('content_info').insert({ user_id: store.user.id, item_id: item.id, rating: score, review: review });
      if (error) {
        if (error.code === '23505') return alert("You have already rated this item.");
        return alert("Error submitting rating: " + error.message);
      }
      alert("Thank you for your rating!");
      modal.remove();
      this.loadShelf();
    });
  },

  async purchaseItem(itemId) {
    const item = this.allItems.find(i => i.id == itemId);
    if (!item) return alert("Item not found.");

    // Price, wallet debit and purchase row all happen inside the RPC; the
    // client never touches wallet_balance (a DB guard blocks it anyway).
    const { data, error } = await supabase.rpc('purchase_library_item', { p_item: itemId });
    if (error) return alert("Error processing payment: " + error.message);

    if (data && data.ok === false) {
      if (data.code === 'INSUFFICIENT_FUNDS') {
        return alert(`Insufficient funds. This costs ₦${Number(data.price || item.price || 0).toLocaleString()} and your wallet has ₦${Number(data.balance || 0).toLocaleString()}. Top up to continue.`);
      }
      if (data.code === 'NOT_FOUND') return alert("This item is no longer available.");
      if (data.code === 'NOT_AUTHENTICATED') return alert("Please sign in again.");
      return alert("Purchase could not be completed. Please try again.");
    }

    this.ownedItems.add(item.id);
    if (data && typeof data.balance === 'number') this.walletBalance = data.balance;
    alert(data && data.already_owned ? "You already own this item." : "Purchase successful! It's unlocked in My Collections.");
    document.querySelector('.modal-overlay')?.remove();
    this.loadShelf();
  },

};
