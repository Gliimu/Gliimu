import { supabase } from '/shared/js/config.js?v=2';
import { store, tierClass, tierIcon } from '../store.js?v=2';
import { uploadFile } from '../upload.js?v=1';
import { renderFileInto } from '../secure-reader.js?v=37';
import { notify } from '../notify.js?v=33';
import { trackMedia, minimizePlaying, minimizeNow, closePlayer } from '../audiolite-minimizer.js?v=8';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// controlsList="nodownload" only hides the player's own button; the browser's
// right-click "Save audio/video as" item is a second way out of the reader.
function blockSaveMenu(e) {
  e.preventDefault();
}

// gliim_trash / gliim_restore report a machine code instead of a message.
export function trashReason(code) {
  if (code === 'ALREADY_IN_TRASH') return 'It is already in the Trash.';
  if (code === 'NOT_IN_TRASH') return 'It is not in the Trash.';
  if (code === 'TOO_LATE') return 'The 30 days are over, so it can no longer be restored.';
  if (code === 'STAFF_ONLY') return 'Only the team that moved it here can put it back.';
  if (code === 'NOT_ALLOWED') return 'You can only move your own Gliims to the Trash.';
  if (code === 'NOT_FOUND') return 'That Gliim no longer exists.';
  return 'Something went wrong.';
}

// Escape the words, linkify the tags. Escaping first and matching second used
// to turn "didn't" into "didn&#39;t" and then linkify the "#39", so the tag
// regex runs over the raw text and each piece is escaped on its own.
export function parseHashtags(text) {
  if (!text) return '';
  return String(text).split(/(#[a-z0-9_]+)/gi).map(part => {
    if (!/^#[a-z0-9_]+$/i.test(part)) return escapeHtml(part);
    const tag = part.slice(1).toLowerCase();
    return `<a href="/collection?name=${encodeURIComponent(tag)}" class="hub-hashtag" onclick="event.stopPropagation()">#${escapeHtml(tag)}</a>`;
  }).join('');
}

// Block types the composer no longer offers. Drafts and stored content that
// still carry them are dropped rather than rebuilt.
const RETIRED_BLOCK_TYPES = ['live', 'slide', 'table'];

// A text block whose style is Poll swaps its textarea for the question and
// options editor. The poll lives in a hidden .poll-data-input as JSON so the
// prose in .block-content-input is never mistaken for poll data.
function setupTextBlock(blockDiv) {
  const select = blockDiv.querySelector('.block-style-select');
  const textarea = blockDiv.querySelector('.block-content-input');
  const panel = blockDiv.querySelector('.poll-builder');
  const dataInput = blockDiv.querySelector('.poll-data-input');
  const optionsDiv = panel.querySelector('.poll-options');
  const questionInput = panel.querySelector('.poll-question-input');

  const sync = () => {
    const question = questionInput.value.trim();
    const options = Array.from(optionsDiv.querySelectorAll('.poll-option-input'))
      .map(input => input.value.trim()).filter(Boolean);
    dataInput.value = (question || options.length) ? JSON.stringify({ question, options }) : '';
  };

  const addOption = (value = '') => {
    if (optionsDiv.children.length >= 6) return;
    const row = document.createElement('div');
    row.className = 'poll-builder-row';
    row.innerHTML = `<input type="text" class="input poll-option-input" placeholder="Option ${optionsDiv.children.length + 1}" value="${escapeHtml(value)}"><button type="button" class="poll-option-remove" aria-label="Remove option">&times;</button>`;
    row.querySelector('.poll-option-input').addEventListener('input', sync);
    row.querySelector('.poll-option-remove').onclick = () => {
      if (optionsDiv.children.length <= 2) return;
      row.remove();
      optionsDiv.querySelectorAll('.poll-option-input').forEach((input, i) => {
        input.placeholder = `Option ${i + 1}`;
      });
      sync();
    };
    optionsDiv.appendChild(row);
  };

  questionInput.addEventListener('input', sync);
  panel.querySelector('.poll-add-option').onclick = () => { addOption(); sync(); };

  // Restore needs to refill the panel before it knows the style is Poll.
  blockDiv._setPoll = (draft) => {
    questionInput.value = (draft && draft.question) || '';
    optionsDiv.innerHTML = '';
    const opts = (draft && Array.isArray(draft.options)) ? draft.options.slice(0, 6) : [];
    opts.forEach(opt => addOption(String(opt)));
    while (optionsDiv.children.length < 2) addOption('');
    sync();
  };

  const toggle = () => {
    const isPoll = select.value === 'poll';
    textarea.style.display = isPoll ? 'none' : '';
    panel.style.display = isPoll ? 'block' : 'none';
    if (isPoll && optionsDiv.children.length < 2) { addOption(); addOption(); }
  };
  select.addEventListener('change', toggle);
}

function setPollDraft(blockDiv, block) {
  blockDiv._setPoll({ question: block.question, options: Array.isArray(block.options) ? block.options : [] });
}

// One Media tile replaced the separate Audio and Video blocks, so the file
// itself decides which player a block needs. Rows written before the merge
// still say 'audio' or 'video' until sql/media_block.sql rewrites them, and a
// cached client can post either shape, so all three names are accepted here.
const MEDIA_TYPES = new Set(['media', 'audio', 'video']);
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|avi|mkv|3gp)(?:$|[?#])/i;

export function isMediaBlock(block) {
  return !!block && MEDIA_TYPES.has(block.type);
}

export function mediaIsVideo(block) {
  if (!isMediaBlock(block)) return false;
  return block.type === 'video' || VIDEO_EXT.test(String(block.content || ''));
}

// The three things a gliim can be, decided from its block shapes alone:
//   log   — media only (audio or video), nothing else
//   book  — a reflowable document (epub/docx), no media
//   bundle — everything else, shown the way a gliim has always looked
export function gliimKindOf(blocks) {
  const list = (blocks || []).filter(b => b && b.type);
  if (!list.length) return null;
  const media = list.filter(isMediaBlock);
  if (media.length === list.length) return 'log';
  const books = list.filter(b => b.type === 'document' && !isPdfBlock(b));
  if (books.length && !media.length) return 'book';
  return 'bundle';
}

// Old gliims were published before covers were compulsory, so a missing
// cover_url falls back to the first image in the body. Nothing is invented:
// when there is no image either, the card simply has no cover.
export function gliimCoverOf(blocks) {
  for (const b of blocks || []) {
    if (!b || !b.type) continue;
    if (b.type === 'image' && b.content) return b.content;
    if (b.type === 'document' && b.cover_url) return b.cover_url;
  }
  return '';
}

// The four kinds the Publish canvas offers. The same icons label a block and
// every "+ Insert" menu, so they live once, here.
const BLOCK_KINDS = ['text', 'image', 'media', 'document'];
const BLOCK_NAMES = { text: 'Text', image: 'Image', media: 'Media', document: 'Document' };
const BLOCK_ICONS = {
  text: '<span class="block-kind-aa">Aa</span>',
  image: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
  media: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>',
  document: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>'
};
const gripIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>';
const removeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

// One upload routine for the whole canvas: percent progress in the status
// line, then a retry and a start-over link instead of a silent failure.
async function runComposerUpload(file, kind, statusEl, urlEl, inputEl, onDone) {
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
    retry.onclick = (ev) => { ev.preventDefault(); runComposerUpload(file, kind, statusEl, urlEl, inputEl, onDone); };
    const reset = document.createElement('a');
    reset.textContent = 'Start over';
    reset.style.cssText = 'margin-left: 6px; color: var(--brand-primary); text-decoration: underline; cursor: pointer;';
    reset.onclick = (ev) => { ev.preventDefault(); urlEl.value = ''; inputEl.value = ''; inputEl.click(); };
    statusEl.append(retry, ' · ', reset);
  }
}

// Timestamp comments read the position off the first <audio> element in the
// reader, so they only make sense on a log that has audio. A video log keeps
// plain comments rather than a badge stuck at 0:00.
export function hasAudioPlayer(blocks) {
  return (blocks || []).some(b => isMediaBlock(b) && !mediaIsVideo(b));
}

// A document block whose file is a PDF renders through the PDF tile path.
export function isPdfSource(value) {
  return /\.pdf(?:$|[?#])/i.test(String(value || ''));
}

export function isPdfBlock(b) {
  if (!b) return false;
  if (b.type === 'pdf') return true;
  return b.type === 'document' && (b.is_pdf === true || isPdfSource(b.content));
}

// Shared tile markup for every PDF-shaped block (legacy 'pdf' blocks and
// document blocks that hold a .pdf file).
export function pdfTilesHtml(post, items) {
  const pdfTileIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
  const tiles = (items || []).filter(it => it && it.pdf_url).map((it, idx) => {
    const price = Number(it.price || 0);
    const cover = it.cover_url
      ? `<img class="pdf-tile-cover" src="${escapeHtml(it.cover_url)}" alt="" loading="lazy">`
      : `<div class="pdf-tile-cover pdf-tile-blank">${pdfTileIcon}</div>`;
    return `<div class="pdf-tile" data-pdf="${escapeHtml(it.pdf_url)}" data-price="${price}" data-post="${post.id}" data-idx="${idx}" data-creator="${post.user_id || ''}" onclick="hubInstance.openPdfTile(this)">${cover}<span class="pdf-tile-price">${price > 0 ? '₦' + price.toLocaleString() : 'Free'}</span></div>`;
  }).join('');
  if (!tiles) return '';
  return `<div class="pdf-block-row">${tiles}</div>`;
}

// Turn any PDF-shaped block into the tile item shape.
export function pdfItemsOf(b) {
  if (!b) return [];
  if (b.type === 'pdf') {
    try {
      const parsed = JSON.parse(b.content);
      if (Array.isArray(parsed && parsed.items)) return parsed.items;
    } catch { /* single-file block written before the items shape existed */ }
    return [{ pdf_url: b.content, cover_url: '', price: Number(b.price || 0) }];
  }
  return [{ pdf_url: b.content, cover_url: b.cover_url || '', price: Number(b.price || 0) }];
}

// Format seconds as M:SS or H:MM:SS for audiolite timestamp badges.
function formatAudioTimestamp(secs) {
  const s = Math.floor(Number(secs) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Get the current playback position from the first audio element in the open reader.
function getCurrentAudioTime() {
  const audio = document.querySelector('.read-body .read-block-audio');
  return audio ? audio.currentTime : null;
}

// Seek the first audio element in the reader to the given time and play it.
function seekToAudioTime(postId, secs) {
  const audio = document.querySelector('.read-body .read-block-audio');
  if (!audio) return;
  audio.currentTime = Number(secs) || 0;
  audio.play().catch(() => {});
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

    // Check balance on XpLoRe page and show G0 modal if needed
    this.checkBalanceAndShowModal();

    this.fetchPosts().then(() => {
      this.checkPersistedModal();
    });
  },

  async checkBalanceAndShowModal() {
    if (!store.user || !store.profile) return;
    try {
      const { data: balanceData } = await supabase.rpc('gliits_get_balance');
      if (!balanceData) return;
      const balance = Number(balanceData.balance || 0);
      const plan = balanceData.plan;
      const planActive = plan && plan.plan_type && (!plan.expires_at || new Date(plan.expires_at) > new Date());
      if (balance < 3 && !planActive && typeof appAlert === 'function') {
        setTimeout(() => {
          appAlert('Your balance is below G3. Top up or activate a plan to continue using the platform.').then(() => {
            window.location.hash = '#/wallet';
          });
        }, 500);
      }
    } catch (e) {
      console.warn('Balance check failed:', e.message);
    }
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
    minimizePlaying();
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

  setupAudioliteTimestampHint(postId) {
    const hint = document.getElementById(`audiolite-ts-hint-${postId}`);
    const current = document.getElementById(`audiolite-ts-current-${postId}`);
    const input = document.getElementById(`comment-text-${postId}`);
    if (!hint || !current || !input) return;
    let timer = null;
    const update = () => {
      const t = getCurrentAudioTime();
      if (t != null) current.textContent = formatAudioTimestamp(t);
    };
    input.addEventListener('focus', () => {
      hint.style.display = '';
      update();
      timer = setInterval(update, 500);
    });
    input.addEventListener('blur', () => {
      hint.style.display = 'none';
      if (timer) { clearInterval(timer); timer = null; }
    });
  },

  viewAuthor(userId) {
    this.closeUserMenu();
    this.closeModal();
    // Card clicks can fire after the session drops (store.user null) or with a
    // missing author id — bail out instead of crashing.
    if (!userId || userId === 'null') return;
    const hash = userId === store.user?.id ? '#/profile' : `#/profile?u=${userId}`;
    window.location.hash = hash;
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
    this.updateSettingsSummary();
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
    this.updateSettingsSummary();
  },

  removeHashtag(index) {
    this.hashtags.splice(index, 1);
    this.renderHashtagChips();
  },

  async promptDelete(postId) {
    const ok = await appConfirm(
      'Move this Gliim to the Trash? It disappears from Gliimu straight away and can be restored from your profile for 30 days.',
      { okText: 'Move to Trash', danger: true }
    );
    if (!ok) return;

    const { data, error } = await supabase.rpc('gliim_trash', { p_post: postId });
    if (error) return notify.toast('Could not move it to the Trash. ' + error.message, 5000);
    if (!data || data.ok !== true) {
      return notify.toast('Could not move it to the Trash. ' + trashReason(data && data.code), 5000);
    }

    notify.toast('Moved to Trash. Restore it within 30 days.', 5000);
    this.closeModal();
    this.fetchPosts();
    window.profileInstance?.refreshProjects?.();
  },

  async openCreateModal(opts = {}) {
    const composerInnerHtml = `
        ${opts.inline ? '' : '<button class="modal-close" onclick="hubInstance.closeModal()">×</button>'}
        <div class="doc-canvas">
        <div class="doc-masthead">
          <input type="text" id="post-title" class="doc-title" placeholder="Give your gliim a title" autocomplete="off">
          <input type="text" id="post-description" class="doc-standfirst" placeholder="One line that tells readers what it is" autocomplete="off">
          <div class="doc-cover" id="post-cover-slot">
            <label class="doc-cover-picker">
              <input type="file" class="mast-cover-input" accept="image/*" hidden>
              <img class="doc-cover-img" alt="" hidden>
              <span class="doc-cover-empty">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                <strong>Add a cover</strong>
                <small>This picture becomes the card readers see.</small>
              </span>
            </label>
            <button type="button" class="doc-cover-clear" hidden>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              <span>Remove</span>
            </button>
            <span class="upload-status mast-cover-status"></span>
            <input type="hidden" id="post-cover-url">
          </div>
        </div>

        <div class="doc-settings">
          <button type="button" class="doc-settings-summary" id="settings-summary-btn" aria-expanded="false">
            <span id="settings-summary-text">Details</span>
            <svg class="doc-settings-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <div class="doc-settings-body" id="settings-body">
        <div class="form-group"><label>Category</label><select id="post-category" class="input"><option value="" disabled selected>Choose a category</option><option>Media</option><option>Tech</option><option>Business</option><option>Personal</option><option>Education</option></select></div>
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
          </div>
        </div>

        <div id="blocks-container" class="doc-blocks"></div>

        <div class="doc-actions">
          <button id="save-draft-btn" class="btn-secondary">Save Draft</button>
          <button id="submit-post-btn" class="btn-primary">Publish</button>
        </div>
        </div>
      </div>
    `;

    let modal;
    this.composerInline = !!opts.inline;
    const closeComposer = () => this.dismissComposer();

    if (opts.inline) {
      const mount = document.querySelector(opts.mountPoint || '#publish-mount');
      if (!mount) return;
      mount.innerHTML = `<div id="create-modal" class="publish-composer">${composerInnerHtml}`;
      modal = mount;
    } else {
      // A draft opened from a card or the reader must not share the page with
      // the Publish canvas — two composers with the same ids would fight.
      document.getElementById('publish-mount')?.replaceChildren();
      modal = document.createElement('div');
      modal.className = 'modal-overlay';
      // Same id as the inline mount: autosave looks the composer up by it, and
      // without it the modal composer never saved or restored anything.
      modal.innerHTML = `<div id="create-modal" class="modal-content gliim-builder">${composerInnerHtml}`;
      document.body.appendChild(modal);
      this.isModalOpen = true;
    }

    this.taggedUsers = [];
    this.hashtags = [];
    this.setupTagPicker();
    this.setupHashtagInput();

    this.setupCoverSlot();

    const summaryBtn = document.getElementById('settings-summary-btn');
    summaryBtn.addEventListener('click', () => {
      const open = document.querySelector('.doc-settings').classList.toggle('open');
      summaryBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.getElementById('post-category').addEventListener('change', () => this.updateSettingsSummary());
    this.updateSettingsSummary();

    this.wireCanvasDismiss();
    this.renderInsertBars();

    // Autosave: restore composer state if it exists, then wire up save on changes
    this.restoreComposerState();
    this.wireComposerAutosave();

    document.getElementById('submit-post-btn').addEventListener('click', async () => {
      const title = document.getElementById('post-title').value.trim();
      const category = document.getElementById('post-category').value;
      const rawDescription = document.getElementById('post-description').value.trim();

      if (!title) return alert("Title is required.");
      if (!category) return alert("Choose a category.");

      // Every poll needs a question and two real options before we can publish.
      for (const pb of document.querySelectorAll('.builder-block[data-type="text"]')) {
        if (pb.querySelector('.block-style-select')?.value !== 'poll') continue;
        let poll = null;
        try { poll = JSON.parse(pb.querySelector('.poll-data-input').value); } catch { poll = null; }
        const opts = (poll && Array.isArray(poll.options)) ? poll.options.map(o => String(o).trim()).filter(Boolean) : [];
        if (!poll || !String(poll.question || '').trim() || opts.length < 2) {
          return alert("Your poll needs a question and at least 2 filled options.");
        }
      }

      const tagSuffix = this.taggedUsers.map(u => `@${u.full_name}`).join(' ');
      const hashSuffix = this.hashtags.map(t => `#${t}`).join(' ');
      const description = [rawDescription, tagSuffix, hashSuffix].filter(Boolean).join(' ');

      const { blocks: finalBlocks, coverUrl } = this.collectBlocksFromComposer();

      if (finalBlocks.length === 0) return alert("Add some content blocks.");

      if (!coverUrl) return this.requireCover();

      const btn = document.getElementById('submit-post-btn');
      btn.innerText = "Publishing...";
      btn.disabled = true;

      const newId = crypto.randomUUID();
      try {
        const payload = {
          id: newId,
          title, category, description,
          cover_url: coverUrl,
          user_id: store.user.id
        };

        const { error } = await supabase.from('feed_gliims').insert(payload);
        if (error) throw new Error(error.message);

        // The body lives in feed_gliim_contents.
        // If that write fails, remove the shell so no empty gliim lingers.
        const { error: bodyError } = await supabase
          .from('feed_gliim_contents').insert({ post_id: newId, blocks: finalBlocks });
        if (bodyError) {
          await supabase.from('feed_gliims').delete().eq('id', newId);
          throw new Error('Failed to save your content: ' + bodyError.message);
        }
      } catch (err) {
        alert(err.message.startsWith('Failed') ? err.message : 'Failed: ' + err.message);
        btn.innerText = "Publish";
        btn.disabled = false;
        return;
      }

      // Publishing is instant, so tag notifications go straight out.
      for (const u of this.taggedUsers) {
        await supabase.from('notifications').insert({
          user_id: u.id,
          actor_id: store.user.id,
          kind: 'tag',
          title: `${store.profile.full_name} tagged you in the hub page: "${title}"`,
          link_post: newId
        });
      }
      notify.toast('Published');
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

      const { blocks: finalBlocks, coverUrl } = this.collectBlocksFromComposer();

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

  // ---- Publish canvas --------------------------------------------------------
  // The document header owns the cover. A body image or a document's own cover
  // still works as a fallback, but nothing publishes without one of the three.
  setupCoverSlot() {
    const slot = document.getElementById('post-cover-slot');
    if (!slot) return;
    const input = slot.querySelector('.mast-cover-input');
    const status = slot.querySelector('.mast-cover-status');
    const clearBtn = slot.querySelector('.doc-cover-clear');

    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      status.textContent = '';
      runComposerUpload(file, 'media', status, document.getElementById('post-cover-url'), input, (url) => {
        this.setCover(url);
        this.saveComposerState();
      });
    });

    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      input.value = '';
      status.textContent = '';
      // Clearing the header only drops the explicit choice: an image already
      // in the body still becomes the cover, so show that instead of a blank.
      this.setCover(this.bodyCover());
      this.saveComposerState();
    });

    this.setCover(document.getElementById('post-cover-url').value);
  },

  setCover(url) {
    const hidden = document.getElementById('post-cover-url');
    if (hidden) hidden.value = url || '';
    const slot = document.getElementById('post-cover-slot');
    if (!slot) return;
    const img = slot.querySelector('.doc-cover-img');
    const empty = slot.querySelector('.doc-cover-empty');
    const clearBtn = slot.querySelector('.doc-cover-clear');
    if (url) img.src = url;
    img.hidden = !url;
    empty.hidden = !!url;
    clearBtn.hidden = !url;
    if (url) slot.classList.remove('needs-cover');
  },

  // The cover the body alone would give this gliim, using the same rule the
  // feed cards already fall back to.
  bodyCover() {
    return gliimCoverOf(this.collectBlocksFromComposer().blocks);
  },

  // Called when a body upload supplies the first picture in the document.
  syncCoverFromBody(url) {
    if (url && !document.getElementById('post-cover-url').value) this.setCover(url);
  },

  // Used instead of an alert when there is genuinely no cover to use: point at
  // the one place that can supply it rather than describing the whole ruleset.
  requireCover() {
    const slot = document.getElementById('post-cover-slot');
    if (slot) {
      slot.classList.add('needs-cover');
      slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const status = slot.querySelector('.mast-cover-status');
      if (status) status.textContent = 'Readers need a picture to click on. Add a cover here.';
    }
  },

  // The collapsed settings row says what is inside without opening it.
  // The category is deliberately left out: it reads as a label the page picked
  // for you ("Details · Media"), and the category has to be the author's choice.
  updateSettingsSummary() {
    const text = document.getElementById('settings-summary-text');
    if (!text) return;
    const parts = [];
    if (this.taggedUsers?.length) parts.push(`${this.taggedUsers.length} ${this.taggedUsers.length === 1 ? 'tag' : 'tags'}`);
    if (this.hashtags?.length) parts.push(this.hashtags.map(t => `#${t}`).join(' '));
    text.textContent = parts.length ? `Details · ${parts.join(' · ')}` : 'Details';
  },

  // Blocks only — insert bars share the container, so never use lastElementChild.
  blockEls() {
    return Array.from(document.querySelectorAll('#blocks-container .builder-block'));
  },

  // One "+ Insert" bar per insertion point: before each block and after the last.
  renderInsertBars() {
    const container = document.getElementById('blocks-container');
    if (!container) return;
    container.querySelectorAll('.block-insert-bar').forEach(bar => bar.remove());
    const els = this.blockEls();
    els.forEach((el, i) => {
      if (i === 0) container.insertBefore(this.insertBar(0), el);
      container.insertBefore(this.insertBar(i + 1), el.nextSibling);
    });
    if (!els.length) container.appendChild(this.insertBar(0));
  },

  insertBar(at) {
    const bar = document.createElement('div');
    bar.className = 'block-insert-bar';
    bar.dataset.at = at;
    bar.innerHTML = `
      <button type="button" class="block-insert-btn" aria-expanded="false">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        <span>Insert</span>
      </button>
      <div class="block-insert-menu">
        ${BLOCK_KINDS.map(kind => `<button type="button" class="block-insert-option" data-kind="${kind}">${BLOCK_ICONS[kind]}<span>${BLOCK_NAMES[kind]}</span></button>`).join('')}
      </div>
    `;
    const btn = bar.querySelector('.block-insert-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = bar.classList.contains('open');
      this.closeInsertMenus();
      if (wasOpen) return;
      bar.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    });
    bar.querySelectorAll('.block-insert-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        this.addBlock(opt.dataset.kind, Number(bar.dataset.at));
        this.closeInsertMenus();
      });
    });
    return bar;
  },

  closeInsertMenus() {
    document.querySelectorAll('.block-insert-bar.open').forEach(bar => bar.classList.remove('open'));
    document.querySelectorAll('.block-insert-btn[aria-expanded="true"]').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
  },

  // Tapping away from a block hides its handles again on touch screens.
  wireCanvasDismiss() {
    if (this._canvasDismissWired) return;
    this._canvasDismissWired = true;
    document.addEventListener('click', () => {
      this.closeInsertMenus();
      document.querySelectorAll('.builder-block.is-open').forEach(b => b.classList.remove('is-open'));
    });
  },

  removeBlock(blockDiv) {
    blockDiv.remove();
    this.renderInsertBars();
    this.saveComposerState();
  },

  // Closes whichever mount the composer is living in: the Publish page canvas
  // or the overlay modal opened from a feed card or the reader.
  dismissComposer() {
    if (this.composerInline) {
      window.location.hash = '#/xplore';
      return;
    }
    document.querySelector('.modal-overlay')?.remove();
    this.isModalOpen = false;
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
    document.getElementById('post-category').value = draft.category || '';
    document.getElementById('post-description').value = draft.description || '';

    // A draft keeps whatever cover it already had in the header slot.
    this.setCover(draft.cover_url || '');
    this.updateSettingsSummary();
    
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
        // Blocks the composer no longer offers are not carried back into a draft.
        if (RETIRED_BLOCK_TYPES.includes(block.type)) continue;

        // A stored poll is a text block wearing the Poll style.
        const blockDiv = this.addBlock(block.type === 'poll' ? 'text' : block.type);

        if (block.type === 'poll') {
          const styleSelect = blockDiv.querySelector('.block-style-select');
          styleSelect.value = 'poll';
          styleSelect.dispatchEvent(new Event('change'));
          setPollDraft(blockDiv, block);
          continue;
        }

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
        if (isMediaBlock(block)) {
          const capEl = blockDiv.querySelector('.block-caption-input');
          if (capEl && block.caption) capEl.value = block.caption;
          const preview = blockDiv.querySelector('.block-preview');
          if (preview) {
            const mediaEl = mediaIsVideo(block)
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
          if (block.cover_url) {
            blockDiv.querySelector('.doc-cover-url').value = block.cover_url;
            blockDiv.querySelector('.doc-cover-name').textContent = 'Cover loaded';
            blockDiv.querySelector('.doc-cover-status').textContent = 'Upload complete!';
            blockDiv.querySelector('.doc-cover-status').style.color = 'var(--success)';
            blockDiv.querySelector('.doc-cover-preview').innerHTML = `<img src="${escapeHtml(block.cover_url)}" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">`;
          }
          if (block.price) blockDiv.querySelector('.doc-price-input').value = block.price;
          if (block.is_pdf || isPdfSource(block.content)) blockDiv.querySelector('.doc-is-pdf').value = '1';
        }
        if (block.type === 'pdf') {
          // Legacy PDF blocks survive in old drafts; the composer no longer
          // offers them, so keep the raw JSON in place for a faithful re-save.
          const legacy = document.createElement('div');
          legacy.className = 'upload-status';
          legacy.style.cssText = 'font-size:12px;color:var(--text-muted);margin-top:8px;';
          legacy.textContent = 'This draft carries an older PDF block. It will be published as it is.';
          blockDiv.appendChild(legacy);
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

      const { blocks: finalBlocks, coverUrl } = this.collectBlocksFromComposer();

      if (finalBlocks.length === 0) return alert("Add some content blocks.");

      if (!coverUrl) return this.requireCover();

      const btn = newPublishBtn;
      btn.innerText = "Publishing...";
      btn.disabled = true;

      const draftId = this.editingDraftId;

      const postId = draftId;
      try {
        const payload = {
          title, category, description,
          cover_url: coverUrl,
          status: 'approved'
        };

        const { error } = await supabase.from('feed_gliims').update(payload).eq('id', draftId);
        if (error) throw new Error(error.message);

        // The body lives in feed_gliim_contents.
        const { error: bodyError } = await supabase
          .from('feed_gliim_contents')
          .update({ blocks: finalBlocks })
          .eq('post_id', draftId);
        if (bodyError) throw new Error('Failed to save content: ' + bodyError.message);
      } catch (err) {
        alert(err.message);
        btn.innerText = "Publish Draft";
        btn.disabled = false;
        return;
      }

      // Same as a fresh publish: tags notify immediately.
      for (const u of this.taggedUsers) {
        await supabase.from('notifications').insert({
          user_id: u.id,
          actor_id: store.user.id,
          kind: 'tag',
          title: `${store.profile.full_name} tagged you in the hub page: "${title}"`,
          link_post: postId
        });
      }
      notify.toast('Published');

      this.clearComposerAutosave();
      this.editingDraftId = null;
      this.dismissComposer();
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

      const { blocks: finalBlocks, coverUrl } = this.collectBlocksFromComposer();

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
      this.dismissComposer();
      this.fetchPosts();
    });
  },

  // Builds one block on the canvas and returns its element. Callers must not
  // read lastElementChild: "+ Insert" bars share the same container.
  addBlock(rawType, at = null) {
    // Audio and Video used to be separate tiles; a draft or autosave written
    // before the merge still names them, so they open as the one Media tile.
    const type = isMediaBlock({ type: rawType }) ? 'media' : rawType;
    const blocksContainer = document.getElementById('blocks-container');
    const blockDiv = document.createElement('div');
    blockDiv.className = 'builder-block'; blockDiv.dataset.type = type;

    let inputHtml = '';
    if (type === 'text') {
      inputHtml = `
        <select class="input block-style-select" style="margin-bottom: 8px;"><option value="paragraph">Paragraph</option><option value="title">Title</option><option value="subtitle">Subtitle</option><option value="list">List</option><option value="poll">Poll</option></select>
        <textarea class="input block-content-input" placeholder="Write your text..." rows="4"></textarea>
        <div class="poll-builder" style="display:none;">
          <input type="text" class="input poll-question-input" placeholder="Ask a question..." style="margin-bottom: 8px;">
          <div class="poll-options"></div>
          <button type="button" class="btn-secondary poll-add-option" style="margin-top: 8px; padding: 6px 12px; font-size: 13px;">+ Add Option</button>
        </div>
        <input type="hidden" class="poll-data-input">
      `;
    } else if (type === 'document') {
      inputHtml = `
        <label class="custom-file-upload">
          <img src="/icons/clip.svg" class="upload-icon-img" alt="Upload">
          <span class="block-file-name">Choose document</span>
          <input type="file" class="block-file-input" accept=".pdf,.doc,.docx,.epub" hidden>
        </label>
        <div class="upload-status" style="font-size: 12px; margin-top: 8px;"></div>
        <div class="block-preview"></div>
        <input type="text" class="input block-caption-input" placeholder="Document title (optional)" style="margin-top: 8px;">
        <label class="custom-file-upload" style="margin-top: 8px;">
          <img src="/icons/clip.svg" class="upload-icon-img" alt="Upload">
          <span class="doc-cover-name">Choose cover image (optional)</span>
          <input type="file" class="doc-cover-input" accept="image/*" hidden>
        </label>
        <div class="upload-status doc-cover-status" style="font-size: 12px; margin-top: 8px;"></div>
        <div class="doc-cover-preview"></div>
        <input type="number" class="input doc-price-input" min="0" step="1" placeholder="Price in ₦ (0 = free)" style="margin-top: 8px;">
        <input type="hidden" class="doc-cover-url">
        <input type="hidden" class="doc-is-pdf">
        <input type="hidden" class="block-content-input">
      `;
    } else {
      const accept = type === 'image' ? 'image/*' : type === 'media' ? 'video/*,audio/*' : '*/*';
      inputHtml = `
        <label class="custom-file-upload">
          <img src="/icons/clip.svg" class="upload-icon-img" alt="Upload">
          <span class="block-file-name">Choose ${type === 'media' ? 'video or audio file' : type}</span>
          <input type="file" class="block-file-input" accept="${accept}" hidden>
        </label>
        <div class="upload-status" style="font-size: 12px; margin-top: 8px;"></div>
        <div class="block-preview"></div>
        ${['image', 'media'].includes(type) ? `<input type="text" class="input block-caption-input" placeholder="${type === 'image' ? 'Caption (optional)' : 'Chapter title (optional)'}" style="margin-top: 8px;">` : ''}
        <input type="hidden" class="block-content-input">
      `;
    }

    blockDiv.innerHTML = `
      <div class="block-tools">
        <span class="block-drag-handle" title="Drag to reorder">${gripIcon}</span>
        <span class="block-label">${BLOCK_ICONS[type] || ''}<span>${BLOCK_NAMES[type] || type}</span></span>
        <button type="button" class="block-remove-btn" title="Remove block">${removeIcon}</button>
      </div>${inputHtml}`;

    // Blocks live at the front of the container; an insert bar can ask for a
    // block at any position, including the very first.
    const existing = this.blockEls();
    if (at === null || at >= existing.length) blocksContainer.appendChild(blockDiv);
    else blocksContainer.insertBefore(blockDiv, existing[at]);
    this.renderInsertBars();

    blockDiv.querySelector('.block-remove-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeBlock(blockDiv);
    });

    // Touch screens get the handles by tapping the block; a tap anywhere
    // outside them closes it again (see wireCanvasDismiss).
    blockDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeInsertMenus();
      document.querySelectorAll('.builder-block.is-open').forEach(b => {
        if (b !== blockDiv) b.classList.remove('is-open');
      });
      blockDiv.classList.add('is-open');
    });

    // Make block draggable
    blockDiv.draggable = true;
    const dragHandle = blockDiv.querySelector('.block-drag-handle');

    dragHandle.addEventListener('mousedown', () => {
      blockDiv.draggable = true;
    });

    blockDiv.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', blockDiv.outerHTML);
      blockDiv.classList.add('is-dragging');
      hubView.draggedBlock = blockDiv;
    });

    blockDiv.addEventListener('dragend', () => {
      blockDiv.classList.remove('is-dragging');
      document.querySelectorAll('.builder-block').forEach(b => {
        b.classList.remove('drag-above', 'drag-below');
      });
      hubView.draggedBlock = null;
    });

    blockDiv.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const dragged = hubView.draggedBlock;
      if (!dragged || dragged === blockDiv) return;

      const before = e.clientY < blockDiv.getBoundingClientRect().top + blockDiv.offsetHeight / 2;
      document.querySelectorAll('.builder-block').forEach(b => {
        b.classList.remove('drag-above', 'drag-below');
      });
      blockDiv.classList.add(before ? 'drag-above' : 'drag-below');
    });

    blockDiv.addEventListener('dragleave', () => {
      blockDiv.classList.remove('drag-above', 'drag-below');
    });

    blockDiv.addEventListener('drop', (e) => {
      e.preventDefault();
      const dragged = hubView.draggedBlock;
      if (!dragged || dragged === blockDiv) return;

      const before = e.clientY < blockDiv.getBoundingClientRect().top + blockDiv.offsetHeight / 2;
      blocksContainer.insertBefore(dragged, before ? blockDiv : blockDiv.nextSibling);

      document.querySelectorAll('.builder-block').forEach(b => {
        b.classList.remove('drag-above', 'drag-below');
      });
      // The gaps moved with the blocks, so rebuild them.
      this.renderInsertBars();
      this.saveComposerState();
    });

    if (type === 'text') setupTextBlock(blockDiv);
    if (type !== 'text') {
      blockDiv.querySelector('.block-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        blockDiv.querySelector('.block-file-name').innerText = file.name;
        // EPUB/DOCX/PDF masters ride the 'library' kind — the 'media' presign
        // only accepts images, audio and video.
        runComposerUpload(file, type === 'document' ? 'library' : 'media', blockDiv.querySelector('.upload-status'), blockDiv.querySelector('.block-content-input'), e.target, (fileUrl) => {
          if (type === 'document') {
            blockDiv.querySelector('.doc-is-pdf').value = (isPdfSource(file.name) || isPdfSource(fileUrl)) ? '1' : '';
          }
          const preview = blockDiv.querySelector('.block-preview');
          if (type === 'image') {
            preview.innerHTML = `<img src="${fileUrl}" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">`;
            // The first picture in the body becomes the cover, unless the
            // header slot already carries an explicit one.
            this.syncCoverFromBody(fileUrl);
          } else if (type === 'media') {
            // The file's own MIME type picks the player — there is no separate
            // video block or audio block any more.
            preview.innerHTML = file.type.startsWith('video/')
              ? `<video src="${fileUrl}" controls style="max-width: 100%; border-radius: 8px; margin-top: 8px;"></video>`
              : `<audio src="${fileUrl}" controls style="width: 100%; margin-top: 8px;"></audio>`;
          } else {
            preview.innerHTML = '<div style="background:var(--bg-tertiary);padding:8px;border-radius:8px;margin-top:8px;font-size:12px;">File ready</div>';
          }
        });
      });
      if (type === 'document') {
        const coverInput = blockDiv.querySelector('.doc-cover-input');
        coverInput.addEventListener('change', () => {
          const file = coverInput.files[0];
          if (!file) return;
          blockDiv.querySelector('.doc-cover-name').textContent = file.name;
          runComposerUpload(file, 'media', blockDiv.querySelector('.doc-cover-status'), blockDiv.querySelector('.doc-cover-url'), coverInput, (url) => {
            blockDiv.querySelector('.doc-cover-preview').innerHTML = `<img src="${url}" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">`;
            this.syncCoverFromBody(url);
          });
        });
      }
    }

    return blockDiv;
  },

  // Serialize the composer's blocks for storage, also returning the card cover.
  collectBlocksFromComposer() {
    const blocks = [];
    let coverUrl = null;
    // The header slot wins; the body only fills in when it was left empty.
    const headerCover = (document.getElementById('post-cover-url')?.value || '').trim() || null;

    document.querySelectorAll('.builder-block').forEach(b => {
      const type = b.dataset.type;
      const content = b.querySelector('.block-content-input').value.trim();

      // A text block styled as a poll stores its question in .poll-data-input.
      if (type === 'text' && b.querySelector('.block-style-select').value === 'poll') {
        let poll = null;
        try { poll = JSON.parse(b.querySelector('.poll-data-input').value); } catch { poll = null; }
        if (!poll || !String(poll.question || '').trim()) return;
        blocks.push({ type: 'poll', question: poll.question, options: poll.options || [] });
        return;
      }

      if (!content) return;

      const blockData = { type, content };
      if (type === 'text') blockData.style = b.querySelector('.block-style-select').value;
      if (type === 'image' || type === 'media' || type === 'document') {
        const capEl = b.querySelector('.block-caption-input');
        const cap = capEl ? capEl.value.trim() : '';
        if (cap) blockData.caption = cap;
      }
      if (type === 'document') {
        const cover = b.querySelector('.doc-cover-url')?.value || '';
        if (cover) blockData.cover_url = cover;
        const price = Math.max(0, Math.round(Number(b.querySelector('.doc-price-input')?.value) || 0));
        if (price) blockData.price = price;
        if (b.querySelector('.doc-is-pdf')?.value === '1' || isPdfSource(content)) blockData.is_pdf = true;
      }
      blocks.push(blockData);

      // A video URL is not a cover, so only an image (or a document's own
      // cover) can become the card background.
      if (!coverUrl && type === 'image') coverUrl = content;
      if (!coverUrl && type === 'document') coverUrl = blockData.cover_url || null;
    });

    return { blocks, coverUrl: headerCover || coverUrl };
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
      const saved = { type, content, style, caption };
      if (type === 'text' && style === 'poll') saved.poll = block.querySelector('.poll-data-input')?.value || '';
      if (type === 'document') {
        saved.cover = block.querySelector('.doc-cover-url')?.value || '';
        saved.price = block.querySelector('.doc-price-input')?.value || '';
        saved.isPdf = block.querySelector('.doc-is-pdf')?.value || '';
      }
      blocks.push(saved);
    });
    const state = {
      title: document.getElementById('post-title')?.value || '',
      description: document.getElementById('post-description')?.value || '',
      category: document.getElementById('post-category')?.value || '',
      cover: document.getElementById('post-cover-url')?.value || '',
      taggedUsers: this.taggedUsers || [],
      hashtags: this.hashtags || [],
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
      if (state.cover) this.setCover(state.cover);
      if (state.taggedUsers && state.taggedUsers.length) {
        this.taggedUsers = state.taggedUsers;
        this.renderTagChips();
      }
      if (state.hashtags && state.hashtags.length) {
        this.hashtags = state.hashtags;
        this.renderHashtagChips();
      }

      // Restore blocks: the container starts empty, every saved block is rebuilt
      if (state.blocks && state.blocks.length) {
        const container = document.getElementById('blocks-container');
        if (container) {
          container.innerHTML = '';
          for (const block of state.blocks) {
            if (RETIRED_BLOCK_TYPES.includes(block.type)) continue;
            // A stored poll is a text block wearing the Poll style.
            const blockDiv = this.addBlock(block.type === 'poll' ? 'text' : block.type);
            if (!blockDiv) continue;
            if (block.type === 'poll') {
              // A legacy autosave keeps the poll JSON in the content field.
              let poll = null;
              try { poll = JSON.parse(block.content); } catch { poll = null; }
              if (!poll) continue;
              const styleSelect = blockDiv.querySelector('.block-style-select');
              styleSelect.value = 'poll';
              styleSelect.dispatchEvent(new Event('change'));
              setPollDraft(blockDiv, poll);
              continue;
            }
            if (block.content) {
              const contentInput = blockDiv.querySelector('.block-content-input');
              if (contentInput) contentInput.value = block.content;
            }
            if (block.style) {
              const styleSelect = blockDiv.querySelector('.block-style-select');
              if (styleSelect) {
                styleSelect.value = block.style;
                if (block.type === 'text' && block.style === 'poll') {
                  styleSelect.dispatchEvent(new Event('change'));
                  let poll = null;
                  try { poll = JSON.parse(block.poll || 'null'); } catch { poll = null; }
                  blockDiv._setPoll(poll || { question: '', options: [] });
                }
              }
            }
            if (block.caption) {
              const captionInput = blockDiv.querySelector('.block-caption-input');
              if (captionInput) captionInput.value = block.caption;
            }
            if (block.type === 'document') {
              if (block.cover) {
                blockDiv.querySelector('.doc-cover-url').value = block.cover;
                blockDiv.querySelector('.doc-cover-name').textContent = 'Cover loaded';
                blockDiv.querySelector('.doc-cover-preview').innerHTML = `<img src="${escapeHtml(block.cover)}" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">`;
              }
              if (block.price) blockDiv.querySelector('.doc-price-input').value = block.price;
              if (block.isPdf) blockDiv.querySelector('.doc-is-pdf').value = '1';
            }
          }
        }
      }
      // Whatever was restored, the insert bars and the summary row follow it.
      this.renderInsertBars();
      this.updateSettingsSummary();
    } catch { /* corrupt data — ignore */ }
  },

  wireComposerAutosave() {
    const composer = document.getElementById('create-modal');
    if (!composer) return;

    // Save on any input/change. Each composer open builds a fresh element, so
    // these listeners can never pile up across opens.
    composer.addEventListener('input', () => this.saveComposerState());
    composer.addEventListener('change', () => this.saveComposerState());

    // Also save when blocks are added (these don't always fire input)
    if (!this._addBlockAutosave) {
      this._addBlockAutosave = true;
      const originalAddBlock = this.addBlock.bind(this);
      this.addBlock = (...args) => {
        const created = originalAddBlock(...args);
        this.saveComposerState();
        return created;
      };
    }
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
    // fetched per-open, so a body never rides along in the feed.
    // status drives moderation: publishing is instant, so the only states left
    // are draft (owner only), approved (everyone) and rejected (taken down by
    // staff, owner only).
    const cols = `id, title, category, description, cover_url, views, created_at, user_id, status, profiles:profiles!user_id(full_name, avatar_url, total_gp, verification_badge)`;
    const load = () => Promise.all([
      supabase.from('feed_gliims').select(cols).order('created_at', { ascending: false }),
      supabase.from('feed_interactions').select('id, post_id, user_id, interaction_type, amount, comment_text, created_at, metadata, profiles:profiles!user_id(full_name, avatar_url)'),
      supabase.from('profiles').select('wallet_balance, total_gp').eq('id', store.user.id).single(),
      supabase.from('saved_items').select('item_id').eq('user_id', store.user.id)
    ]);

    let [{ data: feed_gliims, error }, { data: interactions }, { data: profile }, { data: saved }] = await load();
    if (error) { console.error(error); return; }
    this.userBalance = profile?.wallet_balance || 0;
    this.allInteractions = interactions || [];
    
    // A row with no status predates moderation and stays visible; approved gliims
    // reach everyone; owners also see their drafts and taken-down rows.
    const visible = (feed_gliims || []).filter(p =>
      !p.status || p.status === 'approved' ||
      (p.user_id === store.user.id && (p.status === 'draft' || p.status === 'rejected'))
    );
    this.currentPosts = this.orderFeed(visible);
    this.savedPosts = new Set(saved?.map(s => s.item_id) || []);

    // Card kind detection: read only the block shapes of the listed posts,
    // never the bodies. A post with no blocks simply keeps the default card.
    this.cardKinds = {};
    this.cardCovers = {};
    try {
      const ids = (feed_gliims || []).map(p => p.id);
      if (ids.length) {
        const { data: kindRows } = await supabase.from('feed_gliim_contents').select('post_id, blocks').in('post_id', ids);
        for (const row of kindRows || []) {
          this.cardKinds[row.post_id] = gliimKindOf(row.blocks);
          this.cardCovers[row.post_id] = gliimCoverOf(row.blocks);
        }
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
    const avatarClass = tierClass(post.profiles?.total_gp, 'blog-avatar');
    const avatar = post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="${avatarClass}" style="object-fit:cover;">` : `<div class="${avatarClass}"></div>`;

    // Older gliims were published before a cover was compulsory, so the body's
    // first image is used instead. A gliim with neither simply has no cover.
    const cover = post.cover_url || (this.cardCovers && this.cardCovers[post.id]) || '';
    const comments = (this.allInteractions || []).filter(i => i.post_id === post.id && i.interaction_type === 'comment').length;
    const coverHtml = cover ? `<div class="blog-cover" style="background-image: url('${cover}');"></div>` : '';
    const statusChip = (label, bg, fg) => `<span class="blog-draft-badge" style="display:inline-block;padding:2px 8px;border-radius:999px;background:${bg};color:${fg};font-size:11px;font-weight:700;">${label}</span>`;
    const statusBadge = post.status === 'draft' ? statusChip('Draft', 'rgba(107,114,128,.15)', '#4B5563')
      : post.status === 'rejected' ? statusChip('Taken down', 'rgba(239,68,68,.15)', '#B91C1C')
      : '';
    const eyeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    const commentSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';

    // Logs are audio-or-video-only gliims: a square tile with a play badge and
    // the title, no text preview.
    if (this.cardKinds && this.cardKinds[post.id] === 'log') {
      const playSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"></polygon></svg>';
      if (cover) {
        const cardStyle = `background-image: url('${cover}');`;
        return `<article class="audiolite-card audiolite-cover-card" id="post-${post.id}" style="${cardStyle}" onclick="hubInstance.openReadView('${post.id}')">
          <div class="audiolite-center-icon" aria-hidden="true">${playSvg}</div>
          <h2 class="audiolite-title">${escapeHtml(post.title)}</h2>
        </article>`;
      }
      const color = String(post.cover_color || '').trim();
      const onColor = readableOn(color);
      const cardStyle = color && onColor ? ` style="background:${escapeHtml(color)};color:${onColor};"` : '';
      return `<article class="audiolite-card" id="post-${post.id}"${cardStyle} onclick="hubInstance.openReadView('${post.id}')">
        <div class="audiolite-center-icon" aria-hidden="true">${playSvg}</div>
        <h2 class="audiolite-title">${escapeHtml(post.title)}</h2>
      </article>`;
    }

    // Books: just the cover image as a square — no title, no author, no stats.
    if (this.cardKinds && this.cardKinds[post.id] === 'book' && cover) {
      return `<article class="book-cover-card" id="post-${post.id}" style="background-image: url('${cover}');" onclick="hubInstance.openReadView('${post.id}')">
        ${statusBadge ? `<div class="book-cover-badges">${statusBadge}</div>` : ''}
      </article>`;
    }

    // Bundles: cover on top, then the kind, title and creator on the card's own
    // surface. Anything that isn't a pure log or a pure book is a bundle,
    // including gliims that used to be classed as image-only.
    if (this.cardKinds && this.cardKinds[post.id] === 'bundle' && cover) {
      return `<article class="blog-card bundle-card" id="post-${post.id}" onclick="hubInstance.openReadView('${post.id}')">
        <div class="bundle-cover" style="background-image: url('${cover}');"></div>
        <div class="blog-content">
          <div class="blog-meta">${statusBadge}<span class="blog-date">${new Date(post.created_at).toLocaleDateString([], {month: 'short', day: 'numeric'})}</span></div>
          <h2 class="blog-title">${escapeHtml(post.title || 'Untitled Gliim')}</h2>
          ${post.description ? `<p class="blog-desc">${parseHashtags(post.description)}</p>` : ''}
          <div class="blog-footer"><div class="blog-author hub-author-hit" onclick="event.stopPropagation(); hubInstance.viewAuthor('${post.user_id}')"><div style="position:relative;">${avatar}</div><span>${escapeHtml(post.profiles?.full_name || 'Gliimait')}${tierIcon(post.profiles?.verification_badge)}</span></div><div class="blog-stats"><span class="blog-stat">${eyeSvg}${post.views || 0}</span><span class="blog-stat">${commentSvg}${comments}</span></div></div>
        </div>
      </article>`;
    }

    return `<article class="blog-card" id="post-${post.id}" onclick="hubInstance.openReadView('${post.id}')">${coverHtml}<div class="blog-content"><div class="blog-meta"><span class="blog-category">${post.category || 'General'}</span>${statusBadge}<span class="blog-date">${new Date(post.created_at).toLocaleDateString([], {month: 'short', day: 'numeric'})}</span></div><h2 class="blog-title">${post.title || 'Untitled Gliim'}</h2><p class="blog-desc">${parseHashtags(post.description)}</p><div class="blog-footer"><div class="blog-author hub-author-hit" onclick="event.stopPropagation(); hubInstance.viewAuthor('${post.user_id}')"><div style="position:relative;">${avatar}</div><span>${escapeHtml(post.profiles?.full_name || 'Gliimait')}${tierIcon(post.profiles?.verification_badge)}</span></div><div class="blog-stats"><span class="blog-stat">${eyeSvg}${post.views || 0}</span><span class="blog-stat">${commentSvg}${comments}</span></div></div></div></article>`;
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

    // The body lives in feed_gliim_contents and is fetched per-open.
    const { data: contentRow } = await supabase
      .from('feed_gliim_contents').select('blocks')
      .eq('post_id', postId).maybeSingle();
    post.blocks = contentRow?.blocks || null;

    sessionStorage.setItem('openReadViewId', postId);

    // Count one view per post per browser session
    const viewedKey = `gliimu_viewed_${postId}`;
    if (!sessionStorage.getItem(viewedKey)) {
      sessionStorage.setItem(viewedKey, '1');
      supabase.rpc('bump_post_views', { p_post: postId }).then(({ data, error }) => {
        if (typeof data === 'number') post.views = data;
        if (!error) window.dispatchEvent(new CustomEvent('gliimu-post-viewed', { detail: { postId } }));
      });
      // Interest: opening a post counts; one where I'm tagged counts extra
      const myName = store.profile?.full_name;
      const tagged = myName && (post.description || '').includes(`@${myName}`);
      this.interestSignal(tagged ? 3 : 1, post.category);
    }

    const avatarClass = tierClass(post.profiles?.total_gp, 'blog-avatar');
    const avatar = post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="${avatarClass}" style="object-fit:cover;">` : `<div class="${avatarClass}"></div>`;

    const likes = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'like').length;
    const comments = (this.allInteractions || []).filter(i => i.post_id === post.id && i.interaction_type === 'comment').length;
    const shares = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'share').length;
    const supports = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'support').length;
    const hasLiked = this.allInteractions.some(i => i.post_id === post.id && i.user_id === store.user.id && i.interaction_type === 'like');
    const isSaved = this.savedPosts.has(post.id);

    const postComments = this.allInteractions.filter(i => i.post_id === post.id && i.interaction_type === 'comment');
    const isAudioLog = gliimKindOf(post.blocks) === 'log' && hasAudioPlayer(post.blocks);
    if (isAudioLog) {
      postComments.sort((a, b) => {
        const ta = a.metadata?.audio_timestamp ?? Infinity;
        const tb = b.metadata?.audio_timestamp ?? Infinity;
        return ta - tb;
      });
    }
    let commentsHtml = '<p style="font-size: 13px; color: var(--text-muted);">No comments yet.</p>';
    if (postComments.length > 0) {
      commentsHtml = postComments.map(c => {
        const cAvatarClass = tierClass(c.profiles?.total_gp, 'comment-avatar');
        const cAvatar = c.profiles?.avatar_url ? `<img src="${c.profiles.avatar_url}" class="${cAvatarClass}" style="object-fit:cover;" onclick="hubInstance.showUserMenu(event, '${c.user_id}', '${post.id}', '${c.profiles?.full_name || 'Gliimait'}')">` : `<div class="${cAvatarClass}" onclick="hubInstance.showUserMenu(event, '${c.user_id}', '${post.id}', '${c.profiles?.full_name || 'Gliimait'}')"></div>`;
        const parsedText = this.parseTags(c.comment_text);
        const commentTime = new Date(c.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const ts = c.metadata?.audio_timestamp;
        const tsBadge = (isAudioLog && ts != null) ? `<button class="audio-ts-badge" onclick="event.stopPropagation(); seekToAudioTime('${post.id}', ${ts})" title="Jump to ${formatAudioTimestamp(ts)}">${formatAudioTimestamp(ts)}</button>` : '';
        return `<div class="comment-item" id="comment-${c.id}">${cAvatar}<div class="comment-content-wrap"><div class="comment-meta"><span class="comment-author">${c.profiles?.full_name || 'Gliimait'}</span>${tsBadge}<span class="comment-time">${commentTime}</span></div><p class="comment-text">${parsedText}</p></div></div>`;
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
        if (isMediaBlock(b)) {
          if (mediaIsVideo(b)) {
            return `<figure class="read-video-player"><video src="${escapeHtml(b.content)}" class="read-block-media" preload="metadata" playsinline controlslist="nodownload noremoteplayback" disablepictureinpicture></video><button type="button" class="rvp-big" aria-label="Play"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg></button><div class="rvp-bar"><button type="button" class="rvp-play" aria-label="Play or pause"></button><input type="range" class="rvp-seek" min="0" max="1000" value="0" aria-label="Seek"><span class="rvp-time">0:00 / 0:00</span><button type="button" class="rvp-mute" aria-label="Mute"></button><button type="button" class="rvp-min" aria-label="Minimize" title="Minimize"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"></path><path d="M21 8h-3a2 2 0 0 1-2-2V3"></path><path d="M3 16h3a2 2 0 0 1 2 2v3"></path><path d="M16 21v-3a2 2 0 0 1 2-2h3"></path></svg></button><button type="button" class="rvp-full" aria-label="Fullscreen"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg></button></div></figure>`;
          }
          const cap = b.caption ? `<p class="read-audio-title">${escapeHtml(b.caption)}</p>` : '';
          return `<div class="read-block-audio-wrapper"><div class="read-audio-head"><div class="lib-eq read-eq"><span></span><span></span><span></span><span></span><span></span></div>${cap}<button type="button" class="read-audio-min" aria-label="Minimize" title="Minimize"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"></path><path d="M21 8h-3a2 2 0 0 1-2-2V3"></path><path d="M3 16h3a2 2 0 0 1 2 2v3"></path><path d="M16 21v-3a2 2 0 0 1 2-2h3"></path></svg></button></div><div class="read-audio-card"><button type="button" class="rap-play" aria-label="Play or pause"></button><div class="rap-timeline"><input type="range" class="rap-seek" min="0" max="1000" value="0" aria-label="Seek"><span class="rap-time">0:00 / 0:00</span></div><button type="button" class="rap-mute" aria-label="Mute"></button><input type="range" class="rap-vol" min="0" max="100" value="100" aria-label="Volume"></div><audio src="${escapeHtml(b.content)}" class="read-block-audio" preload="metadata" crossorigin="anonymous"></audio></div>`;
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
    } else { blocksHtml = `<p class="read-block-text">${post.content || ''}</p>`; }

    // Menu Icons
    const closeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    const saveIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
    const reportIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>';
    const deleteIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

    // Trash Button (Only visible if user is the owner)
    const deleteBtnHtml = isOwner ? `
      <div class="hub-read-menu-item danger" onclick="event.stopPropagation(); hubInstance.promptDelete('${post.id}')">${deleteIcon} Move to Trash</div>
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
              <div style="font-size: 11px; color: var(--text-muted); margin-top: -18px; margin-bottom: 16px;">Earn 5 GP per comment</div>
              ${isAudioLog ? `<div class="audiolite-ts-hint" id="audiolite-ts-hint-${post.id}" style="font-size: 11px; color: var(--brand-primary, #6366f1); margin-top: -12px; margin-bottom: 12px; display: none;">Comment will be timestamped at <span id="audiolite-ts-current-${post.id}">0:00</span></div>` : ''}
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
          <button class="action-btn" onclick="hubInstance.sharePost('${post.id}', '${post.title}')" title="Earn 5 GP">
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
    this.setupMediaBlocks(modal, post);
    this.hydratePolls(modal);
    // Hydrate document/PDF blocks in-page (pdf.js/mammoth/epub.js) so they
    // never leave the read view for a new browser tab.
    modal.querySelectorAll('.rdr-inline-file[data-file-src]').forEach(el => {
      const src = el.getAttribute('data-file-src');
      if (src) renderFileInto(src, el);
    });
    this.setupMentionPicker(post.id);
    this.setupAudioliteTimestampHint(post.id);
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
  setupMediaBlocks(root, post) {
    root.querySelectorAll('.read-block-audio').forEach(a => {
      const wrapper = a.closest('.read-block-audio-wrapper');
      a.addEventListener('contextmenu', blockSaveMenu);
      wrapper?.querySelector('.read-audio-min')?.addEventListener('click', () => {
        if (post) minimizeNow(a, post.id, post.title, post.cover_url);
      });
      const eq = wrapper?.querySelector('.lib-eq');

      // Custom card chrome replaces the bare browser controls; the <audio>
      // element itself stays hidden underneath.
      const playBtn = wrapper?.querySelector('.rap-play');
      const seek = wrapper?.querySelector('.rap-seek');
      const time = wrapper?.querySelector('.rap-time');
      const muteBtn = wrapper?.querySelector('.rap-mute');
      const vol = wrapper?.querySelector('.rap-vol');
      const ICON_PLAY = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg>';
      const ICON_PAUSE = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>';
      const ICON_VOL = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
      const ICON_MUTED = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';
      const fmt = (s) => !isFinite(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

      if (playBtn && seek && time) {
        const syncPlay = () => {
          playBtn.innerHTML = a.paused ? ICON_PLAY : ICON_PAUSE;
          if (eq) eq.classList.toggle('playing', !a.paused);
        };
        playBtn.innerHTML = ICON_PLAY;
        playBtn.addEventListener('click', () => (a.paused ? a.play() : a.pause()));
        a.addEventListener('play', syncPlay);
        a.addEventListener('pause', syncPlay);
        a.addEventListener('ended', syncPlay);

        const syncTime = () => {
          seek.value = a.duration ? Math.round((a.currentTime / a.duration) * 1000) : 0;
          time.textContent = `${fmt(a.currentTime)} / ${fmt(a.duration)}`;
        };
        a.addEventListener('timeupdate', syncTime);
        a.addEventListener('loadedmetadata', syncTime);
        syncTime();

        seek.addEventListener('input', () => {
          if (a.duration) a.currentTime = (seek.value / 1000) * a.duration;
        });

        if (muteBtn) {
          muteBtn.innerHTML = a.muted ? ICON_MUTED : ICON_VOL;
          muteBtn.addEventListener('click', () => {
            a.muted = !a.muted;
            muteBtn.innerHTML = a.muted ? ICON_MUTED : ICON_VOL;
          });
        }
        if (vol) {
          vol.value = Math.round((a.muted ? 0 : a.volume) * 100);
          vol.addEventListener('input', () => {
            a.volume = vol.value / 100;
            if (a.volume > 0 && a.muted) {
              a.muted = false;
              if (muteBtn) muteBtn.innerHTML = ICON_VOL;
            }
          });
        }
      }

      // Hand the strip whatever starts playing; trackMedia pauses the previous
      // track itself, so chapters and videos never overlap.
      if (post) {
        trackMedia(a, post.id, post.title, post.cover_url);
      }

      // Ensure audio can play (fix for browser autoplay policies)
      a.preload = 'metadata';
      a.setAttribute('playsinline', '');

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
      video.addEventListener('contextmenu', blockSaveMenu);
      fig.querySelector('.rvp-min')?.addEventListener('click', () => {
        if (post) minimizeNow(video, post.id, post.title, post.cover_url);
      });
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
      if (post) trackMedia(video, post.id, post.title, post.cover_url);
      video.addEventListener('ended', syncPlay);
      syncPlay();
    });
  },

  toggleReadMenu(postId) {
    const menu = document.getElementById(`read-menu-${postId}`);
    if (!menu) return;
    if (menu._closeHandler) {
      document.removeEventListener('click', menu._closeHandler);
      menu._closeHandler = null;
    }
    const isNowActive = menu.classList.toggle('active');
    if (isNowActive) {
      const handler = (e) => {
        if (!menu.contains(e.target)) {
          menu.classList.remove('active');
          document.removeEventListener('click', handler);
          menu._closeHandler = null;
        }
      };
      menu._closeHandler = handler;
      setTimeout(() => {
        document.addEventListener('click', handler);
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

    const post = this.currentPosts.find(p => p.id === postId);
    const COST = 100;
    const balance = Number(store.profile?.wallet_balance ?? this.userBalance ?? 0);

    if (balance <= 0) {
      return appAlert('Your wallet is empty. Top up from the Wallet page to support a creator.');
    }

    let acceptPartial = false;
    if (balance < COST) {
      const ok = await appConfirm(
        `Supporting costs G${COST}, but your wallet holds G${balance}. Send G${balance} instead?`,
        { okText: `Send G${balance}` }
      );
      if (!ok) return;
      acceptPartial = true;
    }

    const { data, error } = await supabase.rpc('send_support', {
      p_post: postId,
      p_accept_partial: acceptPartial,
    });
    if (error) {
      const msg = error.message || '';
      if (msg.includes('INSUFFICIENT_FUNDS')) return appAlert('Your wallet no longer has anything to send. Top up from the Wallet page.');
      if (msg.includes('CANNOT_SUPPORT_SELF')) return;
      if (msg.includes('NOT_AUTHENTICATED')) return appAlert('Please sign in again.');
      if (msg.includes('POST_NOT_FOUND')) return appAlert('This gliim is no longer available.');
      return appAlert("Support failed: " + msg);
    }

    const spent = Number(data?.cost ?? COST);
    this.allInteractions.push({ id: `local-${Date.now()}`, post_id: postId, user_id: store.user.id, interaction_type: 'support', amount: spent });
    this.userBalance = balance - spent;
    if (store.profile) store.profile.wallet_balance = this.userBalance;

    this.interestSignal(4, post?.category);

    // When already on the reader route, re-assigning the same hash does not
    // re-render, so bump the visible counter by hand.
    const counter = document.querySelector('.support-btn span');
    if (counter) counter.textContent = String(Number(counter.textContent || 0) + 1);

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

    const post = (this.currentPosts || []).find(p => p.id === postId);
    const isAudioLog = !!post && gliimKindOf(post.blocks) === 'log' && hasAudioPlayer(post.blocks);
    const audioTs = isAudioLog ? getCurrentAudioTime() : null;
    const metadata = audioTs != null ? { audio_timestamp: audioTs } : null;
    const insertRow = { post_id: postId, user_id: store.user.id, interaction_type: 'comment', comment_text: text };
    if (metadata) insertRow.metadata = metadata;
    const { data } = await supabase.from('feed_interactions').insert(insertRow).select('*').single();

    if (data) {
      data.profiles = { full_name: store.profile.full_name, avatar_url: store.profile.avatar_url, total_gp: store.profile.total_gp };
      if (this.allInteractions) this.allInteractions.push(data);
      const list = document.getElementById(`comment-list-${postId}`);
      const cAvatarClass = tierClass(data.profiles.total_gp, 'comment-avatar');
      const cAvatar = data.profiles.avatar_url ? `<img src="${data.profiles.avatar_url}" class="${cAvatarClass}" style="object-fit:cover;" onclick="hubInstance.showUserMenu(event, '${data.user_id}', '${postId}', '${data.profiles.full_name}')">` : `<div class="${cAvatarClass}" onclick="hubInstance.showUserMenu(event, '${data.user_id}', '${postId}', '${data.profiles.full_name}')"></div>`;
      const parsedText = this.parseTags(text);
      const commentTime = new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const tsBadge = (isAudioLog && audioTs != null) ? `<button class="audio-ts-badge" onclick="event.stopPropagation(); seekToAudioTime('${postId}', ${audioTs})" title="Jump to ${formatAudioTimestamp(audioTs)}">${formatAudioTimestamp(audioTs)}</button>` : '';
      const newComment = `<div class="comment-item" id="comment-${data.id}">${cAvatar}<div class="comment-content-wrap"><div class="comment-meta"><span class="comment-author">${data.profiles.full_name}</span>${tsBadge}<span class="comment-time">${commentTime}</span></div><p class="comment-text">${parsedText}</p></div></div>`;
      if (list.querySelector('p')) {
        list.innerHTML = newComment;
      } else {
        list.innerHTML += newComment;
      }
      input.value = "";
    }
    if (post && post.user_id !== store.user.id) {
      await supabase.rpc('add_gp', { target_user_id: post.user_id, points_to_add: 4 });
      this.interestSignal(3, post.category);
    }
    await supabase.rpc('add_gp', { target_user_id: store.user.id, points_to_add: 5 });
    if (post) this.notifyMentions(postId, post, text, data?.id);
    if (this.pickedMentions) delete this.pickedMentions[postId];
  },

  // Notify every @FullName-mentioned user on the Alerts page.
  // When the sender picked from the @ dropdown, the picked id wins —
  // namesakes who were not picked are skipped. Manually typed names
  // still fall back to matching every profile with that name.
  // Mentions deliver immediately with a deep link to the exact post,
  // and the exact comment on a reply.
  async notifyMentions(postId, post, text, commentId) {
    const picks = (this.pickedMentions && this.pickedMentions[postId]) || [];

    if (!this.profileCache) {
      const { data } = await supabase.from('profiles').select('id, full_name').neq('id', store.user.id);
      this.profileCache = data || [];
    }

    const lower = text.toLowerCase();
    const myName = (store.profile?.full_name || '').toLowerCase();
    const seen = new Set();

    const ping = async (receiverId) => {
      const title = `${store.profile.full_name} tagged you in the hub page: "${post.title || 'a gliim'}"`;
      await supabase.from('notifications').insert({
        user_id: receiverId,
        actor_id: store.user.id,
        kind: 'mention',
        title,
        link_post: postId,
        link_comment: commentId || null
      });
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
    if (data && this.allInteractions) this.allInteractions.push(data);
    const post = this.currentPosts.find(p => p.id === postId);
    if (post && post.user_id !== store.user.id) await supabase.rpc('add_gp', { target_user_id: post.user_id, points_to_add: 5 });
    await supabase.rpc('add_gp', { target_user_id: store.user.id, points_to_add: 5 });

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
  hydratePolls: (scope) => hubView.hydratePolls(scope),
  pollVote: (postId, idx) => hubView.pollVote(postId, idx),
  openPdfTile: (el) => hubView.openPdfTile(el),
  promptDelete: (id) => hubView.promptDelete(id),
  replyToUser: (postId, fullName, userId) => hubView.replyToUser(postId, fullName, userId),
  viewAuthor: (userId) => hubView.viewAuthor(userId),
  promptReport: (targetType, targetId) => hubView.promptReport(targetType, targetId),
  removeTag: (index) => hubView.removeTag(index),
  removeHashtag: (index) => hubView.removeHashtag(index),
  isModalOpen: () => hubView.isModalOpen,
  closeReader: () => {
    window.gliimBack();
  },
  openCommentsModal: () => {
    const modal = document.getElementById('comments-modal');
    if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  },
  closeCommentsModal: () => {
    const modal = document.getElementById('comments-modal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }
};

hubView.formatAudioTimestamp = formatAudioTimestamp;
hubView.seekToAudioTime = seekToAudioTime;
window.formatAudioTimestamp = formatAudioTimestamp;
window.seekToAudioTime = seekToAudioTime;

export default hubView;
