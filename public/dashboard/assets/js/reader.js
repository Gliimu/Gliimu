import { supabase } from '/shared/js/config.js';
import { store } from './store.js';

// ============================================================
// Gliimu MVP reader — client-side, responsive, deterrence-only.
// Renders a publication in-app (blocks HTML, PDF via pdf.js,
// DOCX via mammoth, EPUB via epub.js) with:
//   - no download / print affordances
//   - selection, right-click, drag and copy disabled
//   - a faint watermark of the viewer's name
//   - a top progress loader that writes reading_progress.percent
//   - completion detection -> complete_reading() (idempotent GP)
//   - a "Read next" shelf from related_publications() at the end
//
// This is deterrence, not DRM: the rendered text lives in the DOM for
// HTML/DOCX/EPUB, so a determined user can still extract it. The hardened
// server-rasterized page images (VPS milestone) drop in behind renderFile()
// without changing anything else here.
// ============================================================

// Libraries are lazy-loaded from CDN only when a format needs them, so the
// dashboard boot is unaffected. Vendor these into /assets/js/vendor/ for the
// VPS/offline build to drop the external fetch.
const CDN = {
  pdf:     'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  mammoth: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  epub:    'https://cdnjs.cloudflare.com/ajax/libs/epub.js/0.3.88/epub.min.js'
};

const _loaded = {};
function loadScript(src) {
  if (_loaded[src]) return _loaded[src];
  _loaded[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => { delete _loaded[src]; reject(new Error('Failed to load ' + src)); };
    document.head.appendChild(s);
  });
  return _loaded[src];
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fileKind(url) {
  if (!url) return null;
  const ext = url.split('?')[0].split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'epub') return 'epub';
  if (['doc', 'docx'].includes(ext)) return 'docx';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'm4a', 'ogg', 'aac'].includes(ext)) return 'audio';
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  return 'file';
}

function viewerName() {
  return (store.profile && store.profile.full_name)
    || (store.user && store.user.email)
    || 'Gliimu member';
}

// One reader at a time; closing it tears down listeners and revokes blobs.
let _active = null;

export function openReader({ item, blocks, fileUrl, renderBlock }) {
  if (_active) _active.destroy();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay rdr-overlay';
  overlay.innerHTML = `
    <div class="rdr-shell" role="dialog" aria-modal="true">
      <div class="rdr-topbar">
        <div class="rdr-title">
          <span class="rdr-type">${escapeHtml(typeLabel(item.type))}</span>
          <span class="rdr-name">${escapeHtml(item.title)}</span>
        </div>
        <button class="rdr-close" aria-label="Close reader">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div class="rdr-progress"><div class="rdr-progress-bar" style="width:0%"></div></div>
      <div class="rdr-scroll" tabindex="0">
        <div class="rdr-watermark" aria-hidden="true"></div>
        <div class="rdr-body"><p class="rdr-loading">Opening&hellip;</p></div>
        <div class="rdr-next" hidden></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const scrollEl = overlay.querySelector('.rdr-scroll');
  const bodyEl = overlay.querySelector('.rdr-body');
  const barEl = overlay.querySelector('.rdr-progress-bar');
  const nextEl = overlay.querySelector('.rdr-next');
  const wmEl = overlay.querySelector('.rdr-watermark');

  // Watermark: tile the viewer's name faintly across the page.
  wmEl.textContent = viewerName();

  let destroyed = false;
  let completed = false;
  const blobUrls = [];
  const setBlob = (u) => { if (u) blobUrls.push(u); };
  const cleanups = [];

  const api = {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cleanups.forEach(fn => { try { fn(); } catch (_) {} });
      document.removeEventListener('keydown', onGlobalKey, true);
      blobUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (_) {} });
      overlay.remove();
      if (_active === api) _active = null;
    }
  };
  _active = api;

  overlay.querySelector('.rdr-close').addEventListener('click', () => api.destroy());
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) api.destroy(); });

  // ---- Deterrence -------------------------------------------------------
  const block = (e) => { e.preventDefault(); return false; };
  scrollEl.addEventListener('contextmenu', block);
  scrollEl.addEventListener('selectstart', block);
  scrollEl.addEventListener('dragstart', block);
  scrollEl.addEventListener('copy', block);
  cleanups.push(() => {
    scrollEl.removeEventListener('contextmenu', block);
    scrollEl.removeEventListener('selectstart', block);
    scrollEl.removeEventListener('dragstart', block);
    scrollEl.removeEventListener('copy', block);
  });

  function onGlobalKey(e) {
    const k = (e.key || '').toLowerCase();
    // Block save / print while the reader is open.
    if ((e.ctrlKey || e.metaKey) && ['s', 'p'].includes(k)) { e.preventDefault(); e.stopPropagation(); }
    if (e.key === 'Escape') { api.destroy(); }
  }
  document.addEventListener('keydown', onGlobalKey, true);

  // ---- Progress + completion -------------------------------------------
  let saveTimer = null;
  function setProgress(pct) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    barEl.style.width = p + '%';
    if (destroyed) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(p), 700);
    if (p >= 98) markComplete();
  }
  async function persist(pct) {
    try {
      await supabase.from('reading_progress').upsert(
        { user_id: store.user.id, item_id: item.id, percent: pct, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,item_id' }
      );
    } catch (_) {}
  }
  async function markComplete() {
    if (completed || destroyed) return;
    completed = true;
    try {
      const { data } = await supabase.rpc('complete_reading', { p_item: item.id });
      if (data && data.ok && data.gp_awarded > 0) {
        toast(`Completed — +${data.gp_awarded} GP`);
      }
    } catch (_) {}
    showRelated();
  }

  function onScroll() {
    const max = scrollEl.scrollHeight - scrollEl.clientHeight;
    if (max <= 4) { setProgress(100); return; }
    setProgress((scrollEl.scrollTop / max) * 100);
  }
  scrollEl.addEventListener('scroll', onScroll, { passive: true });
  cleanups.push(() => scrollEl.removeEventListener('scroll', onScroll));

  async function showRelated() {
    if (destroyed || nextEl.dataset.filled) return;
    nextEl.dataset.filled = '1';
    let rel = [];
    try {
      const { data } = await supabase.rpc('related_publications', { p_item: item.id, p_limit: 6 });
      if (Array.isArray(data)) rel = data;
    } catch (_) {}
    if (!rel.length) { nextEl.hidden = true; return; }
    nextEl.hidden = false;
    nextEl.innerHTML = `
      <h4 class="rdr-next-title">You finished — read this next</h4>
      <div class="rdr-next-grid">
        ${rel.map(r => `
          <button class="rdr-next-card" data-id="${escapeHtml(r.id)}">
            ${r.cover_url
              ? `<img src="${escapeHtml(r.cover_url)}" alt="">`
              : `<div class="rdr-next-cover-fallback">${escapeHtml((r.title || '?').charAt(0))}</div>`}
            <span class="rdr-next-name">${escapeHtml(r.title)}</span>
            <span class="rdr-next-author">${escapeHtml(r.author || '')}</span>
          </button>`).join('')}
      </div>`;
    nextEl.querySelectorAll('.rdr-next-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        api.destroy();
        if (window.libraryInstance && window.libraryInstance.openDetails) window.libraryInstance.openDetails(id);
      });
    });
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'rdr-toast';
    t.textContent = msg;
    overlay.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  // ---- Render ------------------------------------------------------------
  (async () => {
    try {
      if (blocks && blocks.length) {
        bodyEl.innerHTML = `<div class="lib-article">${blocks.map(renderBlock).join('')}</div>`;
        await hydrateInlineFiles(bodyEl);
        requestAnimationFrame(() => setProgress(0));
        // Short block-only books may not scroll; treat as complete on open.
        if (scrollEl.scrollHeight - scrollEl.clientHeight <= 4) setProgress(100);
      } else if (fileUrl) {
        await renderFile(fileUrl, bodyEl, setProgress, setBlob);
      } else {
        bodyEl.innerHTML = '<p class="rdr-loading">The author hasn\'t attached a file to this book yet.</p>';
      }
    } catch (err) {
      bodyEl.innerHTML = `<p class="rdr-loading">This title couldn't be opened in the reader. Please try again shortly.</p>`;
      console.error('[reader]', err);
    }
  })();

  // PDF/document blocks are emitted by renderBlock as empty placeholder divs
  // (data-file-src) so they render in-page through pdf.js/mammoth/epub.js
  // instead of opening a new browser tab. Progress stays scroll-driven here —
  // per-file page observers are suppressed by passing a no-op setProgress.
  async function hydrateInlineFiles(container) {
    const holders = Array.from(container.querySelectorAll('[data-file-src]'));
    for (const el of holders) {
      const src = el.getAttribute('data-file-src');
      if (!src || el.dataset.hydrated) continue;
      el.dataset.hydrated = '1';
      try {
        await renderFile(src, el, () => {}, setBlob);
      } catch (err) {
        el.innerHTML = '<p class="rdr-loading">This file couldn\'t be previewed in the reader.</p>';
        console.error('[reader] inline file', err);
      }
    }
  }

  return api;
}

function typeLabel(type) {
  if (type === 'publication') return 'Book';
  if (type === 'audiolite') return 'Audiolite';
  return type || 'Item';
}

// Render one attached file in-page into `el` (pdf.js/mammoth/epub.js/image).
// Used by surfaces that build their own modal (e.g. the hub gliim read view)
// so a PDF opens inside the page instead of a new browser tab. `setBlob`
// receives any object URL that must be revoked when the surface closes.
export function renderFileInto(url, el, setBlob) {
  return renderFile(url, el, () => {}, setBlob || (() => {})).catch(err => {
    console.error('[reader] inline file', err);
    el.innerHTML = '<p class="rdr-loading">This file couldn\'t be previewed in the reader.</p>';
  });
}

// Render a single attached file. `setBlob` captures any object URL so the
// caller can revoke it on close.
async function renderFile(url, bodyEl, setProgress, setBlob) {
  const kind = fileKind(url);
  bodyEl.innerHTML = '<p class="rdr-loading">Opening&hellip;</p>';

  if (kind === 'image') {
    bodyEl.innerHTML = `<img class="rdr-image" src="${escapeHtml(url)}" alt="">`;
    setProgress(100);
    return;
  }

  if (kind === 'pdf') return renderPdf(url, bodyEl, setProgress, setBlob);
  if (kind === 'docx') return renderDocx(url, bodyEl, setBlob);
  if (kind === 'epub') return renderEpub(url, bodyEl, setProgress, setBlob);

  // No in-app renderer for this type — do NOT hand back a download link.
  bodyEl.innerHTML = '<p class="rdr-loading">This file type can\'t be previewed in the reader yet.</p>';
}

async function fetchBlob(url) {
  // no-store: bypass the browser HTTP cache entirely. A copy cached before the
  // bucket CORS fix carried no Access-Control-Allow-Origin and made the fetch
  // throw; skipping the cache removes that failure and keeps premium files out
  // of disk cache, matching the blob+revoke "no reusable link" intent.
  const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.blob();
}

async function renderPdf(url, bodyEl, setProgress, setBlob) {
  await loadScript(CDN.pdf);
  const pdfjs = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
  if (!pdfjs) throw new Error('pdf.js unavailable');
  pdfjs.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;

  // Fetch as a blob so the address bar never holds a reusable file link and
  // the object URL is revoked when the reader closes.
  const blob = await fetchBlob(url);
  const buf = await blob.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  bodyEl.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'rdr-pdf';
  bodyEl.appendChild(wrap);

  const total = doc.numPages;
  let seen = new Set();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  for (let n = 1; n <= total; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const cssWidth = wrap.clientWidth || bodyEl.clientWidth || 720;
    const scale = (cssWidth / base.width) * dpr;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.className = 'rdr-pdf-page';
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = (viewport.width / dpr) + 'px';
    canvas.style.height = (viewport.height / dpr) + 'px';
    wrap.appendChild(canvas);

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    // Count a page as read once it scrolls into view.
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          seen.add(n);
          setProgress((seen.size / total) * 100);
        }
      });
    }, { threshold: 0.5 });
    io.observe(canvas);
  }
}

async function renderDocx(url, bodyEl, setBlob) {
  await loadScript(CDN.mammoth);
  if (!window.mammoth) throw new Error('mammoth unavailable');
  const blob = await fetchBlob(url);
  const buf = await blob.arrayBuffer();
  const result = await window.mammoth.convertToHtml({ arrayBuffer: buf });
  const holder = document.createElement('div');
  holder.className = 'lib-article rdr-docx';
  holder.innerHTML = result.value;
  bodyEl.innerHTML = '';
  bodyEl.appendChild(holder);
}

async function renderEpub(url, bodyEl, setProgress, setBlob) {
  await loadScript(CDN.epub);
  if (!window.ePub) throw new Error('epub.js unavailable');
  const blob = await fetchBlob(url);
  const blobUrl = URL.createObjectURL(blob);
  setBlob(blobUrl);

  bodyEl.innerHTML = '';
  const holder = document.createElement('div');
  holder.className = 'rdr-epub';
  bodyEl.appendChild(holder);

  const book = window.ePub(blobUrl);
  const rendition = book.renderTo(holder, { width: '100%', height: '100%', flow: 'scrolled-doc' });
  await rendition.display();

  rendition.on('relocated', (loc) => {
    const pct = loc && loc.start && typeof loc.start.percentage === 'number'
      ? loc.start.percentage * 100 : 0;
    setProgress(pct);
  });
  // scrolled-doc flow: also track raw scroll for completion.
  const scroller = holder.querySelector('.epub-scroller') || holder.firstElementChild;
  if (scroller) {
    scroller.addEventListener('scroll', () => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (max > 4) setProgress((scroller.scrollTop / max) * 100);
    }, { passive: true });
  }
}
