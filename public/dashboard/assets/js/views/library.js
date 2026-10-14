import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';
import { ensureAccess, showBillingDenied, fetchBillingSummary } from '../billing.js';
import { uploadFile } from '../upload.js';
import hubView from './hub.js?v=6';

// Library is the merged home of gliims (hub feed) and shelf items. The shelf
// keeps its database types; only the labels are member-facing.
function typeLabel(type) {
  if (type === 'publication') return 'Book';
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

// Books can attach documents as well as media; the server allowlist for the
// 'library' upload kind is the authority, this just narrows the file picker.
const LIB_FILE_ACCEPT = '.pdf,.epub,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.rtf,.zip,image/*,audio/*,video/*';

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
  title: 'Hub',
  template: `
    <div class="libmerge hub-layout" id="library-container">
      <div class="libmerge-feed" id="library-feed">
        <p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">Loading the Hub...</p>
      </div>

      <div class="library-fab-wrapper">
        <div class="libmerge-fab-menu" id="libmerge-fab-menu">
          <button type="button" data-act="book">Publish a Book</button>
          <button type="button" data-act="audiolite">Publish an Audiolite</button>
          <button type="button" data-act="bundle">Publish a Bundle</button>
        </div>
        <button class="library-fab-main" id="library-fab-main" title="Create">
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
      logInteraction: (id, type) => this.logInteraction(id, type)
    };

    this.setupTopbar();
    this.setupFab();

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
      supabase.from('library_items').select('*').order('created_at', { ascending: false }),
      supabase.from('purchases').select('item_id').eq('user_id', store.user.id),
      supabase.from('saved_items').select('item_id').eq('user_id', store.user.id),
      supabase.from('profiles').select('wallet_balance').eq('id', store.user.id).single(),
      supabase.from('profiles').select('id, full_name, avatar_url').neq('id', store.user.id),
      supabase.from('profiles').select('id, full_name, avatar_url').eq('username', 'adam').maybeSingle(),
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
    const menu = document.getElementById('libmerge-fab-menu');
    if (!fab || !menu) return;

    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('active');
    });
    menu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.remove('active');
        if (btn.dataset.act === 'bundle') hubView.openCreateModal();
        else this.openSubmitModal(btn.dataset.act === 'audiolite' ? 'audiolite' : 'publication');
      });
    });
    document.addEventListener('click', () => menu.classList.remove('active'));
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

    // The gliim filter menu (Mine / Tagged / Saved / categories).
    hubView.setupTopbarActions();
  },

  async logInteraction(itemId, type) {
    await supabase.from('library_interactions').insert({ user_id: store.user.id, item_id: itemId, interaction_type: type });
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

  // Books and audiolites only, matched against the single search box.
  visibleItems() {
    const q = this.searchQuery;
    if (!q) return this.allItems || [];
    return (this.allItems || []).filter(item =>
      item.title?.toLowerCase().includes(q) ||
      item.author?.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q)
    );
  },

  // One list for everything. Gliims keep the order the feed engine gave them;
  // shelf items are woven through that list so books and audiolites sit beside
  // gliims instead of piling up at the bottom of the page.
  renderFeed() {
    const container = document.getElementById('library-feed');
    if (!container) return;

    const cards = hubView.filterPosts().map(post => this.wrapItem(hubView.renderPostCard(post), 'gliim'));

    // A gliim filter (Mine / Tagged / Saved / a category) has no meaning for
    // shelf items, so those only join the feed when everything is showing.
    if ((hubView.currentFilter || 'all') === 'all') {
      const shelfCards = this.visibleItems().map(item => this.wrapItem(this.renderShelfCard(item), 'tile'));
      if (shelfCards.length) {
        const gap = Math.max(2, Math.ceil(cards.length / shelfCards.length));
        shelfCards.forEach((html, i) => {
          cards.splice(Math.min(cards.length, (i + 1) * gap - 1), 0, html);
        });
      }
    }

    container.innerHTML = cards.length
      ? `<div class="library-feed">${cards.join('')}</div>`
      : '<p style="text-align: center; width: 100%; padding: 60px 0; color: var(--text-muted);">Nothing here yet.</p>';

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
  // gliims: cover (or hue-gradient fallback), ownership badge, and a hover
  // overlay with the title. No text below the thumbnail.
  renderShelfCard(item) {
    const isOwned = this.ownedItems.has(item.id);
    const isSaved = this.savedItems.has(item.id);
    const icons = {
      publication: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
      audiolite: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>'
    };

    let thumb;
    if (item.cover_url) {
      thumb = `<img class="lib-thumb" src="${escapeHtml(item.cover_url)}" alt="" loading="lazy">`;
    } else {
      const hue = [...(item.title || '?')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
      thumb = `<div class="lib-thumb lib-thumb-fallback" style="background: linear-gradient(135deg, hsl(${hue}, 42%, 34%), hsl(${(hue + 70) % 360}, 45%, 16%));">${icons[item.type] || icons.publication}</div>`;
    }

    const ownedBadge = isOwned
      ? '<span class="lib-tick-badge"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>'
      : '';
    const savedBadge = (isSaved && !isOwned)
      ? '<span class="lib-saved-badge"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg></span>'
      : '';

    return `
      <div class="lib-tile lib-${item.type}" onclick="libraryInstance.openDetails('${item.id}')">
        ${thumb}
        ${ownedBadge}${savedBadge}
        <div class="lib-overlay"><h4>${escapeHtml(item.title)}</h4></div>
      </div>
    `;
  },

  openDetails(item, isOwned, balance, isSaved) {
    document.querySelector('.modal-overlay')?.remove();

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
          ${!isOwned && !this.subscriber ? `<div class="lib-modal-price">Price: <strong>₦${item.price?.toLocaleString() || 0}</strong></div>` : ''}
          ${!isOwned && this.subscriber ? `<div class="lib-modal-price">Included with your subscription</div>` : ''}

          <div class="lib-action-row">
            ${canOpen
              ? `<button class="btn-primary lib-action-btn" id="access-content-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  Access Content
                </button>`
              : `<button class="btn-primary lib-action-btn" onclick="libraryInstance.purchase('${item.id}')">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  ${balance >= item.price ? 'Unlock' : 'Insufficient'}
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
                    : `<div class="lib-menu-avatar lib-menu-avatar-fallback">${authorName.charAt(0).toUpperCase()}</div>`} ${authorName}
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
  // library_contents, whose RLS policy returns a row solely to viewers who
  // have unlocked the item — so a failed gate shows up here as an empty body
  // rather than as leaked content.
  async openContent(item) {
    document.querySelector('.modal-overlay')?.remove();

    let body = null;
    const { data, error } = await supabase.from('library_contents')
      .select('blocks, files').eq('item_id', item.id).maybeSingle();
    if (!error && data) body = data;

    const blocks = (body && Array.isArray(body.blocks)) ? body.blocks : [];
    const fileUrl = ((body && Array.isArray(body.files) && body.files[0] && body.files[0].url) || item.file_url || null);

    if (item.type === 'audiolite') return this.openAudiolite(item, fileUrl);
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

    if (b.type === 'image') return `<img src="${escapeHtml(value)}" class="read-block-media">`;
    if (b.type === 'video') return `<video src="${escapeHtml(value)}" class="read-block-media" controls></video>`;
    if (b.type === 'audio') return `<div class="read-block-audio-wrapper"><audio src="${escapeHtml(value)}" class="read-block-audio" controls></audio></div>`;
    if (b.type === 'file') {
      return `<a class="lib-article-file" href="${escapeHtml(value)}" target="_blank" rel="noopener">${this.fileIcon(this.fileKind(value))}<span>Open document</span></a>`;
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

  openReader(item, blocks, fileUrl) {
    const kind = this.fileKind(fileUrl);
    let contentHtml;
    if (blocks && blocks.length) {
      contentHtml = `<div class="lib-article">${blocks.map(b => this.renderBlock(b)).join('')}</div>`;
    } else if (!fileUrl) {
      contentHtml = '<p class="lib-reader-empty">The author hasn\'t attached a file to this book yet.</p>';
    } else if (kind === 'image') {
      contentHtml = `<img class="lib-reader-image" src="${escapeHtml(fileUrl)}" alt="${escapeHtml(item.title)}">`;
    } else if (kind === 'pdf') {
      contentHtml = `<iframe class="lib-reader-frame" src="${escapeHtml(fileUrl)}" title="${escapeHtml(item.title)}"></iframe>`;
    } else if (kind === 'video') {
      contentHtml = `<video class="lib-reader-video" src="${escapeHtml(fileUrl)}" controls></video>`;
    } else {
      contentHtml = `<a class="btn-primary lib-reader-download" href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener">Open file</a>`;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content lib-modal-content lib-reader-modal">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        ${item.cover_url ? `<img class="lib-reader-cover" src="${escapeHtml(item.cover_url)}" alt="">` : ''}
        <div class="lib-modal-body">
          <span class="lib-modal-type">${escapeHtml(typeLabel(item.type))}</span>
          <h2>${escapeHtml(item.title)}</h2>
          <p class="lib-modal-author">by ${escapeHtml(this.displayAuthorName(item))}</p>
          <p class="lib-modal-desc">${escapeHtml(item.description)}</p>
          <hr class="lib-reader-divider">
          ${contentHtml}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  openAudiolite(item, audioUrl) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content lib-modal-content lib-audio-modal">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        <div class="lib-audio-art ${item.cover_url ? '' : 'lib-audio-art-fallback'}" style="${item.cover_url ? `background-image:url('${item.cover_url}')` : ''}">
          ${item.cover_url ? '' : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>'}
        </div>
        <h2 class="lib-audio-title">${item.title}</h2>
        <p class="lib-audio-author">${this.displayAuthorName(item)}</p>

        <div class="lib-eq" id="lib-eq"><span></span><span></span><span></span><span></span><span></span></div>

        <div class="lib-audio-player">
          <button class="lib-audio-play" id="lib-audio-play" ${audioUrl ? '' : 'disabled'}>
            <svg id="lib-audio-play-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
          </button>
          <div class="lib-audio-timeline">
            <span id="lib-audio-cur">0:00</span>
            <input type="range" id="lib-audio-seek" min="0" max="1000" value="0" ${audioUrl ? '' : 'disabled'}>
            <span id="lib-audio-dur">0:00</span>
          </div>
          <button class="lib-audio-speed" id="lib-audio-speed">1x</button>
        </div>
        ${audioUrl ? '' : '<p class="lib-reader-empty" style="margin-top: 16px;">No audio file attached yet.</p>'}
        <audio id="lib-audio" src="${escapeHtml(audioUrl || '')}" preload="metadata"></audio>
      </div>
    `;
    document.body.appendChild(modal);
    if (!audioUrl) return;

    const audio = document.getElementById('lib-audio');
    const playBtn = document.getElementById('lib-audio-play');
    const playIcon = document.getElementById('lib-audio-play-icon');
    const seek = document.getElementById('lib-audio-seek');
    const cur = document.getElementById('lib-audio-cur');
    const dur = document.getElementById('lib-audio-dur');
    const eq = document.getElementById('lib-eq');
    const speedBtn = document.getElementById('lib-audio-speed');
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const PLAY = '<polygon points="6 4 20 12 6 20 6 4"></polygon>';
    const PAUSE = '<rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect>';

    playBtn.addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
    audio.addEventListener('play', () => { playIcon.innerHTML = PAUSE; eq.classList.add('playing'); });
    audio.addEventListener('pause', () => { playIcon.innerHTML = PLAY; eq.classList.remove('playing'); });
    audio.addEventListener('ended', () => { playIcon.innerHTML = PLAY; eq.classList.remove('playing'); seek.value = 0; cur.textContent = '0:00'; });
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

  openSubmitModal(presetType) {
    document.querySelector('.modal-overlay')?.remove();
    const type = presetType === 'audiolite' ? 'audiolite' : 'publication';
    const noun = type === 'audiolite' ? 'an Audiolite' : 'a Book';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content lib-modal-content">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        <div class="lib-modal-body">
          <span class="lib-modal-type">${type === 'audiolite' ? 'Audiolite' : 'Book'}</span>
          <h2>Submit ${noun}</h2>
          <p class="lib-modal-author">Reviewed by the Gliimu team before it goes live on the shelf.</p>

          <div class="form-group" style="margin-top: 24px;">
            <label>Title</label>
            <input type="text" id="lib-sub-title" class="input" placeholder="e.g. UI/UX Fundamentals">
          </div>

          <div class="form-row">
            <div class="form-group" style="flex: 1; margin-right: 12px;">
              <label>Format</label>
              <select id="lib-sub-type" class="input">
                <option value="publication">Book</option>
                <option value="audiolite">Audiolite</option>
              </select>
            </div>
            <div class="form-group" style="flex: 1;">
              <label>Price (₦)</label>
              <input type="number" id="lib-sub-price" class="input" min="0" placeholder="Free or set a price">
            </div>
          </div>

          <div class="form-group">
            <label>Description</label>
            <textarea id="lib-sub-desc" class="input" rows="4" placeholder="What will readers get from this?"></textarea>
          </div>

          <div class="form-group">
            <label>Cover ${type === 'audiolite' ? 'Art' : 'Image'} (optional)</label>
            <input type="file" id="lib-sub-cover" class="input" accept="image/*">
          </div>

          <div class="form-group">
            <label>Content</label>
            <div id="lib-sub-content"></div>
          </div>

          <button class="btn-primary" style="width: 100%; margin-top: 16px;" id="lib-submit-publication-btn">Submit for Review</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const typeSelect = document.getElementById('lib-sub-type');
    typeSelect.value = type;
    typeSelect.addEventListener('change', (e) => this.renderComposerBody(e.target.value));
    this.renderComposerBody(type);

    document.getElementById('lib-submit-publication-btn').addEventListener('click', () => this.submitForPublication(modal));
  },

  // Each format gets its own composer: audiolites are one audio file plus
  // optional read-along text; books are text and inner pictures only.
  renderComposerBody(type) {
    const host = document.getElementById('lib-sub-content');
    if (!host) return;

    if (type === 'audiolite') {
      host.innerHTML = `
        <p class="lib-composer-hint">One audio file. Listeners play it inside the app. Add text blocks if they should read along.</p>
        <div class="builder-block" id="lib-audio-slot">${this.uploadMarkup('Choose audio', 'audio/*')}</div>
        <div id="lib-blocks-container" style="display: flex; flex-direction: column; gap: 16px; margin-top: 16px;"></div>
        <button class="btn-secondary" id="lib-audiolite-add-text" type="button" style="margin-top: 12px;">+ Add Text</button>
      `;
      this.wireFileUpload(document.getElementById('lib-audio-slot'), { accept: 'audio/*', kind: 'library' });
      document.getElementById('lib-audiolite-add-text').addEventListener('click', () => this.addLibBlock('text'));
      return;
    }

    host.innerHTML = `
      <p class="lib-composer-hint">Build it the way readers should see it — text and inner pictures, in any order.</p>
      <div id="lib-blocks-container" style="display: flex; flex-direction: column; gap: 16px;"></div>
      <div class="builder-add-dropdown">
        <button class="btn-secondary" id="lib-block-trigger" type="button">+ Add Block</button>
        <div class="dropdown-menu" id="lib-block-menu">
          <div data-block="text">${BLOCK_ICONS.text} Text</div>
          <div data-block="image">${BLOCK_ICONS.image} Image</div>
        </div>
      </div>
    `;
    document.getElementById('lib-block-trigger').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('lib-block-menu').classList.toggle('active');
    });
    document.getElementById('lib-block-menu').querySelectorAll('[data-block]').forEach((el) => {
      el.addEventListener('click', () => this.addLibBlock(el.dataset.block));
    });
    this.addLibBlock('text');
  },

  uploadMarkup(label, accept) {
    return `
      <label class="custom-file-upload">
        <img src="/icons/clip.svg" class="upload-icon-img" alt="Upload">
        <span class="block-file-name">${label}</span>
        <input type="file" class="block-file-input" accept="${accept}" hidden>
      </label>
      <div class="upload-status" style="font-size: 12px; margin-top: 8px;"></div>
      <div class="block-preview"></div>
      <input type="hidden" class="block-content-input">
    `;
  },

  // One upload path for every file slot: the chosen name shows on the label,
  // the bytes go up through uploadFile(), and the public URL lands in the
  // hidden .block-content-input that collectComposer() reads back.
  wireFileUpload(root, { accept, kind, onDone }) {
    const input = root.querySelector('.block-file-input');
    const nameEl = root.querySelector('.block-file-name');
    const statusEl = root.querySelector('.upload-status');
    const hidden = root.querySelector('.block-content-input');
    const preview = root.querySelector('.block-preview');
    if (accept) input.accept = accept;

    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      nameEl.innerText = file.name;
      statusEl.innerText = 'Uploading...';
      statusEl.style.color = 'var(--brand-primary)';
      try {
        const url = await uploadFile(file, kind);
        hidden.value = url;
        statusEl.innerText = 'Upload complete!';
        statusEl.style.color = 'var(--success)';
        if (preview) {
          preview.innerHTML = /^image\//.test(file.type)
            ? `<img src="${url}" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">`
            : '<div style="background: var(--bg-tertiary); padding: 8px; border-radius: 8px; margin-top: 8px; font-size: 12px;">File ready</div>';
        }
        if (onDone) onDone(url, file);
      } catch (err) {
        hidden.value = '';
        if (preview) preview.innerHTML = '';
        statusEl.innerText = err.message || 'Upload failed.';
        statusEl.style.color = 'var(--error)';
      }
    });
  },

  addLibBlock(type) {
    document.getElementById('lib-block-menu')?.classList.remove('active');
    const container = document.getElementById('lib-blocks-container');
    if (!container) return;

    const block = document.createElement('div');
    block.className = 'builder-block';
    block.dataset.type = type;
    const head = `${BLOCK_HEAD}<span class="block-label">${BLOCK_ICONS[type] || BLOCK_ICONS.file}</span><button class="block-remove-btn" type="button">${REMOVE_ICON}</button></div>`;

    if (type === 'text') {
      block.innerHTML = `${head}
        <select class="input block-style-select" style="margin-bottom: 8px;">
          <option value="paragraph">Paragraph</option>
          <option value="title">Title</option>
          <option value="subtitle">Subtitle</option>
          <option value="list">List</option>
        </select>
        <textarea class="input block-content-input" placeholder="Write your text..." rows="4"></textarea>`;
    } else {
      const accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : type === 'audio' ? 'audio/*' : LIB_FILE_ACCEPT;
      const label = type === 'file' ? 'Choose document' : `Choose ${type}`;
      block.innerHTML = `${head}${this.uploadMarkup(label, accept)}`;
    }

    container.appendChild(block);
    block.querySelector('.block-remove-btn').addEventListener('click', () => block.remove());
    if (type !== 'text') this.wireFileUpload(block, { kind: 'library' });
  },

  // Reads the composer back out. Returns { error } when the format has nothing
  // worth submitting, otherwise { blocks, fileUrl }.
  collectComposer(type) {
    const blocks = [];
    let fileUrl = null;

    if (type === 'audiolite') {
      const input = document.querySelector('#lib-audio-slot .block-content-input');
      fileUrl = input ? input.value : '';
      if (!fileUrl) return { error: 'Attach the audio file for this audiolite.' };
      // Optional read-along text blocks live in the same container the book uses.
      document.querySelectorAll('#lib-blocks-container .builder-block').forEach((b) => {
        const textInput = b.querySelector('.block-content-input');
        if (!textInput || !textInput.value.trim()) return;
        blocks.push({ type: 'text', style: b.querySelector('.block-style-select').value, content: textInput.value.trim() });
      });
    } else {
      document.querySelectorAll('#lib-blocks-container .builder-block').forEach((b) => {
        const kind = b.dataset.type;
        const input = b.querySelector('.block-content-input');
        if (!input || !input.value.trim()) return;
        if (kind === 'text') {
          blocks.push({ type: 'text', style: b.querySelector('.block-style-select').value, content: input.value.trim() });
        } else {
          blocks.push({ type: kind, content: input.value.trim() });
        }
      });
      if (!blocks.length) return { error: 'Add at least one content block.' };
    }

    return { blocks, fileUrl };
  },

  async submitForPublication(modal) {
    const title = document.getElementById('lib-sub-title').value.trim();
    const type = document.getElementById('lib-sub-type').value;
    const price = parseInt(document.getElementById('lib-sub-price').value, 10) || 0;
    const description = document.getElementById('lib-sub-desc').value.trim();

    if (!title) return alert("Title is required.");
    if (!description) return alert("Please add a short description.");

    const composer = this.collectComposer(type);
    if (composer.error) return alert(composer.error);

    const btn = document.getElementById('lib-submit-publication-btn');
    const reset = () => { btn.disabled = false; btn.innerText = 'Submit for Review'; };
    btn.disabled = true;
    btn.innerText = 'Submitting...';

    let coverUrl = null;
    try {
      const coverFile = document.getElementById('lib-sub-cover').files[0];
      coverUrl = coverFile ? await uploadFile(coverFile, 'library') : null;
    } catch (e) {
      alert(e.message || 'Upload failed. Please try again.');
      reset();
      return;
    }

    const { error } = await supabase.from('library_submissions').insert({
      user_id: store.user.id,
      title,
      type,
      description,
      price,
      cover_url: coverUrl,
      file_url: composer.fileUrl,
      blocks: composer.blocks,
      status: 'pending'
    });

    if (error) {
      // 42P01/42703/PGRST2xx = the submissions table or its new columns are
      // not in the database yet (sql/library_content.sql not run).
      if (error.code === '42P01' || error.code === '42703' || /^PGRST2/.test(error.code)) {
        alert("Library submissions are not enabled yet. Please try again later.");
      } else {
        alert("Submission failed: " + error.message);
      }
      reset();
      return;
    }

    modal.remove();
    alert("Submission received! The Gliimu team will review it shortly.");
  }
};
