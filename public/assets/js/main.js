import { supabase } from '/shared/js/config.js';

// The hero copy has exactly one source: site_settings, edited by operations
// at admin.gliimu.com. A blank column renders a blank hero — no copy is
// invented here.

// ============================================
// SAFETY HELPERS
// ============================================
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only http(s) and same-origin absolute paths survive. Everything else
// (javascript:, data:, etc.) collapses to an empty string.
function safeUrl(value) {
  const url = String(value == null ? '' : value).trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (/^\/[^/]/.test(url)) return url;
  return '';
}

// ============================================
// JOIN BUTTONS — open the auth page in a modal.
// Signed-in visitors see a "Dashboard" button instead.
// ============================================
function openAuthModal() {
  const modal = document.getElementById('auth-modal');
  const frame = document.getElementById('auth-frame');
  if (!modal || !frame) return window.location.href = '/auth.html';
  modal.style.display = 'flex';
  if (!frame.src || frame.src === 'about:blank') {
    frame.src = '/auth.html?embed=1';
    frame.style.display = 'block';
  }
}

async function initJoinButtons() {
  const buttons = document.querySelectorAll('.js-join-link');
  if (!buttons.length) return;

  let authed = false;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    authed = !!session;
  } catch (e) {
    // Auth unreachable (offline, blocked) — treat as a visitor.
  }

  buttons.forEach(btn => {
    if (authed) {
      btn.textContent = 'Dashboard';
      btn.href = '/dashboard/index.html';
    } else {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openAuthModal();
      });
    }
  });
}

// ============================================
// SCROLL REVEAL ANIMATIONS
// ============================================
function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
  reveals.forEach(el => observer.observe(el));
}

// ============================================
// FETCH SITE SETTINGS (Video, Images, App Releases)
// ============================================
async function loadSiteSettings() {
  const { data, error } = await supabase.from('site_settings').select('*').single();
  if (error || !data) return;

  // Hero Video
  const videoSrc = document.getElementById('hero-video-src');
  if (videoSrc && safeUrl(data.hero_video_url)) videoSrc.src = data.hero_video_url;

  // Hero Fallback Image (set as background of the section just in case)
  const heroSection = document.getElementById('hero-section');
  const heroFallback = safeUrl(data.hero_fallback_image_url);
  if (heroSection && heroFallback) {
    heroSection.style.backgroundImage = `url('${heroFallback}')`;
    heroSection.style.backgroundSize = 'cover';
    heroSection.style.backgroundPosition = 'center';
  }

  // Hero texts (Operations > Landing page). index.html ships the hero empty
  // so nothing stale flashes before settings arrive.
  const titleEl = document.getElementById('hero-title-text');
  if (titleEl) titleEl.textContent = (data.hero_title || '').trim() + ' ';
  const highlightEl = document.getElementById('hero-highlight-text');
  if (highlightEl) highlightEl.textContent = (data.hero_highlight || '').trim();
  const descEl = document.getElementById('hero-desc-text');
  if (descEl) descEl.innerHTML = escapeHtml((data.hero_desc || '').trim()).replace(/\n/g, '<br>');

  applyDownloadSection(data);
}

// ============================================
// DOWNLOAD SECTION (version, links, background, QR)
// ============================================
function applyDownloadSection(settings) {
  const section = document.getElementById('download-section');
  const panel = document.getElementById('download-panel');
  if (!section || !panel) return;

  // The image is the point of this section, so the scrim over it stays light
  // and the panel adds the only other layer, at 50%.
  const bg = safeUrl(settings.app_download_bg_url);
  if (bg) {
    section.style.background = `linear-gradient(rgba(10, 15, 30, 0.25), rgba(10, 15, 30, 0.25)), url('${bg}')`;
    section.style.backgroundSize = 'cover';
    section.style.backgroundPosition = 'center';
    section.classList.add('has-bg');
  } else {
    section.style.background = '';
    section.style.backgroundSize = '';
    section.style.backgroundPosition = '';
    section.classList.remove('has-bg');
  }

  const versionEl = document.getElementById('dl-version');
  const versionBadge = versionEl ? versionEl.closest('.download-version-badge') : null;
  const version = (settings.app_version || '').trim();
  if (versionEl) versionEl.textContent = version;
  if (versionBadge) versionBadge.style.display = version ? '' : 'none';

  const notesEl = document.getElementById('dl-notes');
  if (notesEl) notesEl.textContent = (settings.app_version_notes || '').trim();

  const targets = [
    ['dl-windows', settings.app_windows_url],
    ['dl-mac', settings.app_mac_url],
    ['dl-linux', settings.app_linux_url],
    ['dl-android', settings.app_android_url],
    ['dl-ios', settings.app_ios_url],
  ];

  // The buttons ship disabled in index.html; a DB URL is the only thing that
  // switches one on, so a placeholder link can never be handed to a visitor.
  targets.forEach(([id, raw]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const href = safeUrl(raw);
    if (href) {
      el.href = href;
      el.classList.remove('is-off');
      el.removeAttribute('aria-disabled');
    } else {
      el.removeAttribute('href');
      el.classList.add('is-off');
      el.setAttribute('aria-disabled', 'true');
    }
  });

  // The QR block only renders on the desktop layout; skip the download there.
  const qrWrap = document.getElementById('dl-qr-wrap');
  const qrTarget = safeUrl(settings.app_mobile_qr_url)
    || safeUrl(settings.app_android_url)
    || safeUrl(settings.app_ios_url);
  if (!qrWrap || !qrTarget) return;
  if (!window.matchMedia('(min-width: 769px)').matches) return;

  qrWrap.style.display = 'flex';
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&ecc=H&margin=6&qzone=1&data=${encodeURIComponent(qrTarget)}`;
  qrWrap.querySelector('.download-qr-code').innerHTML = `
    <div class="landing-qr-img">
      <img class="qr" src="${qrSrc}" alt="Scan to download the Gliimu app">
      <img class="qr-logo" src="/icons/icon.png" alt="Gliimu">
    </div>
  `;
}

// ============================================
// FORCE VIDEO AUTOPLAY ON iOS (With Fallback)
// ============================================
function forceVideoAutoplay() {
  const video = document.getElementById('hero-video');
  if (!video) return;

  // Attempt to play
  const playPromise = video.play();

  if (playPromise !== undefined) {
    playPromise.then(_ => {
      // Autoplay started successfully! Ensure video is visible.
      video.style.display = 'block';
    }).catch(error => {
      // Autoplay was blocked (Low Power Mode, iOS restrictions, etc.)
      // Hide the video element completely so the background image shows.
      console.log("Autoplay blocked. Showing static fallback image.");
      video.style.display = 'none';
    });
  }
}

// ============================================
// FETCH LATEST ON GLIIMU (1 Hub + 1 Library + Top Gliimait)
// ============================================
function hubMediaHtml(mediaUrl, mediaType) {
  const media = safeUrl(mediaUrl);
  if (!media) return '';
  if (mediaType === 'image') {
    return `<img src="${media}" alt="" style="width:100%; border-radius: 8px; margin-top: 12px; max-height: 200px; object-fit: cover;">`;
  }
  if (mediaType === 'audio') {
    return `<audio src="${media}" controls preload="none" style="width:100%; margin-top: 12px;"></audio>`;
  }
  return `<video src="${media}" style="width:100%; border-radius: 8px; margin-top: 12px; max-height: 200px; object-fit: cover;" controls preload="metadata"></video>`;
}

async function loadHubHighlights() {
  const grid = document.getElementById('hub-grid');
  if (!grid) return;

  // Newest Hub Post, newest Library item, and the profile with the
  // most uploads (posts + library submissions) — fetched in parallel.
  const [{ data: hubPosts }, { data: libItems }, { data: top }] = await Promise.all([
    supabase
      .from('public_hub_posts')
      .select('content, media_url, media_type, created_at, full_name, avatar_url')
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('feed_items')
      .select('title, type, created_at, cover_color, cover_url, author, author_avatar')
      .order('created_at', { ascending: false })
      .limit(1),
    supabase.rpc('top_uploader')
  ]);

  let combined = [];

  if (hubPosts && hubPosts.length > 0) {
    combined.push({ type: 'hub', data: hubPosts[0] });
  }
  if (libItems && libItems.length > 0) {
    combined.push({ type: 'library', data: libItems[0] });
  }
  const tops = Array.isArray(top) ? top.filter(t => t && t.full_name).slice(0, 3) : [];
  if (tops.length > 0) {
    combined.push({ type: 'uploader', data: tops });
  }

  if (combined.length === 0) {
    grid.innerHTML = '<p style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">Be the first to post in the Hub!</p>';
    return;
  }

  grid.innerHTML = combined.map((item, i) => {
    const delay = 0.1 + i * 0.1;
    if (item.type === 'hub') {
      const post = item.data;
      const avatar = safeUrl(post.avatar_url);

      return `
        <div class="hub-card reveal" style="transition-delay: ${delay}s;">
          <div class="hub-card-meta">
            ${avatar
              ? `<img src="${avatar}" class="hub-card-avatar" style="object-fit:cover;" alt="">`
              : `<div class="hub-card-avatar"></div>`
            }
            <span class="hub-card-author">${escapeHtml(post.full_name || '')}</span>
          </div>
          <p class="hub-card-text clamp-4">${escapeHtml(post.content)}</p>
          ${hubMediaHtml(post.media_url, post.media_type)}
        </div>
      `;
    } else if (item.type === 'library') {
      const lib = item.data;
      const cover = safeUrl(lib.cover_url);
      const avatar = safeUrl(lib.author_avatar);
      const author = (lib.author || '').trim();
      const bg = cover ? `background-image: url('${cover}'); background-size: cover;` : '';
      return `
        <div class="hub-card reveal" style="transition-delay: ${delay}s;">
          <div class="hub-card-meta">
            ${avatar
              ? `<img src="${avatar}" class="hub-card-avatar" style="object-fit:cover;" alt="">`
              : `<div class="hub-card-avatar"></div>`
            }
            <span class="hub-card-author">${escapeHtml(author || 'Gliimu Library')}</span>
          </div>
          <div class="lib-highlight-thumb" style="height: 120px; border-radius: 8px; margin-bottom: 12px; ${bg}"></div>
          <p class="hub-card-text" style="font-weight: 600;">${escapeHtml(lib.title)}</p>
        </div>
      `;
    }

    // Top Gliimaits card — the three busiest profiles, one row each
    const rows = item.data.map((up) => {
      const avatar = safeUrl(up.avatar_url);
      const count = Number(up.uploads) || 0;
      return `
        <div style="display:flex; align-items:center; gap:14px;">
          ${avatar
            ? `<img src="${avatar}" alt="" style="width:44px; height:44px; border-radius:50%; object-fit:cover;">`
            : `<div class="uploader-avatar-empty"></div>`
          }
          <div style="display:flex; flex-direction:column; min-width:0;">
            <span style="font-weight:700; font-size: var(--fs-md);">${escapeHtml(up.full_name)}</span>
            <span style="color: var(--text-muted); font-size: var(--fs-sm);">${count} upload${count === 1 ? '' : 's'}</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="hub-card reveal" style="transition-delay: ${delay}s;">
        <div class="hub-card-meta">
          <span class="hub-card-author">Top Gliimait</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:14px; margin-top: 12px;">${rows}</div>
      </div>
    `;
  }).join('');

  initScrollReveal();
}

// ============================================
// FETCH PARTNERS (admin managed)
// ============================================
async function loadPartners() {
  const marquee = document.getElementById('partners-marquee');
  const marqueeContent = document.getElementById('partners-marquee-content');
  const emptyState = document.getElementById('partners-empty');
  if (!marquee || !marqueeContent) return;

  const { data: partners, error } = await supabase
    .from('partners')
    .select('name, logo_url')
    .order('display_order', { ascending: true });

  const usable = (error || !partners ? [] : partners).filter(p => safeUrl(p.logo_url));

  if (usable.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  // Repeat the set until the strip is long enough to fill the viewport,
  // then double it so the -50% keyframe loops seamlessly.
  let loopSet = [];
  while (loopSet.length < 8) loopSet = loopSet.concat(usable);
  const fullSet = [...loopSet, ...loopSet];

  marqueeContent.innerHTML = fullSet.map(p => `
    <span class="partner-logo">
      <img src="${safeUrl(p.logo_url)}" alt="${escapeHtml(p.name)}" loading="lazy">
    </span>
  `).join('');

  marquee.style.display = 'block';
}

// ============================================
// INITIALIZE
// ============================================
// Module imports can resolve after DOMContentLoaded on a cold CDN cache,
// which would leave this listener never firing and the page stuck loading.
const boot = async () => {
  initJoinButtons();
  initScrollReveal();
  loadSiteSettings();
  loadHubHighlights();
  loadPartners();
  forceVideoAutoplay();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
