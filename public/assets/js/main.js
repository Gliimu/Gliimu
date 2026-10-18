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

  // The image is the point of this section, so the scrim over it stays at 40%
  // and the panel adds the only other layer, at 50%.
  const bg = safeUrl(settings.app_download_bg_url);
  if (bg) {
    section.style.background = `linear-gradient(rgba(10, 15, 30, 0.4), rgba(10, 15, 30, 0.4)), url('${bg}')`;
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
// FETCH LATEST ON GLIIMU (daily top 7, latest post, top author)
// ============================================
async function loadHubHighlights() {
  const grid = document.getElementById('hub-grid');
  if (!grid) return;

  const { data, error } = await supabase.rpc('landing_highlights', {});
  if (error || !data) {
    grid.innerHTML = '<p style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">Could not load highlights.</p>';
    return;
  }

  const dailyTop = Array.isArray(data.daily_top) ? data.daily_top : [];
  const latestPost = data.latest_post;
  const topAuthor = data.top_author;

  let cards = '';

  // Card 1: Top of the Day — 7 users by GP earned today
  const dailyRows = dailyTop.length
    ? dailyTop.map((u, i) => {
        const avatar = safeUrl(u.avatar_url);
        return `
          <div class="lh-daily-row">
            <span class="lh-daily-rank">${i + 1}</span>
            ${avatar
              ? `<img src="${avatar}" class="lh-daily-ava" style="object-fit:cover;" alt="">`
              : `<div class="lh-daily-ava lh-daily-ava-empty"></div>`
            }
            <span class="lh-daily-name">${escapeHtml(u.full_name || 'Member')}</span>
            <span class="lh-daily-gp">${Number(u.gp_earned || 0).toLocaleString()} GP</span>
          </div>
        `;
      }).join('')
    : '<p style="color: var(--text-muted); font-size: 13px; text-align: center;">No GP earned today yet.</p>';

  cards += `
    <div class="hub-card reveal" style="transition-delay: 0.1s;">
      <div class="hub-card-meta">
        <span class="hub-card-author">Top of the Day</span>
      </div>
      <div class="lh-daily-list">${dailyRows}</div>
    </div>
  `;

  // Card 2: Latest post from the feed
  if (latestPost) {
    const cover = safeUrl(latestPost.cover_url);
    const avatar = safeUrl(latestPost.author_avatar);
    const bg = cover ? `background-image: url('${cover}'); background-size: cover;` : '';
    const typeLabel = (latestPost.type || '').replace(/_/g, ' ');

    cards += `
      <div class="hub-card reveal" style="transition-delay: 0.2s;">
        <div class="hub-card-meta">
          ${avatar
            ? `<img src="${avatar}" class="hub-card-avatar" style="object-fit:cover;" alt="">`
            : `<div class="hub-card-avatar"></div>`
          }
          <span class="hub-card-author">${escapeHtml(latestPost.author || 'Gliimu')}</span>
          ${typeLabel ? `<span style="margin-left:auto; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">${escapeHtml(typeLabel)}</span>` : ''}
        </div>
        <div class="lib-highlight-thumb" style="height: 120px; border-radius: 8px; margin-bottom: 12px; ${bg}"></div>
        <p class="hub-card-text" style="font-weight: 600;">${escapeHtml(latestPost.title || 'Untitled')}</p>
      </div>
    `;
  }

  // Card 3: Top Gliimait — all-time most engaged author
  if (topAuthor) {
    const avatar = safeUrl(topAuthor.avatar_url);
    cards += `
      <div class="hub-card reveal" style="transition-delay: 0.3s;">
        <div class="hub-card-meta">
          <span class="hub-card-author">Top Gliimait</span>
        </div>
        <div style="display:flex; flex-direction:column; align-items:center; gap:12px; text-align:center; margin-top:8px;">
          ${avatar
            ? `<img src="${avatar}" alt="" style="width:64px; height:64px; border-radius:50%; object-fit:cover; border:2px solid var(--brand-primary);">`
            : `<div style="width:64px; height:64px; border-radius:50%; background:var(--gradient-primary);"></div>`
          }
          <div>
            <p style="font-weight:700; font-size:16px; margin:0;">${escapeHtml(topAuthor.full_name || 'Member')}</p>
            <p style="color:var(--text-muted); font-size:12px; margin:4px 0 0;">${Number(topAuthor.total_gp || 0).toLocaleString()} GP</p>
          </div>
          <p style="color:var(--text-secondary); font-size:12px; margin:0;">Most engaged post: <strong>${escapeHtml(topAuthor.item_title || 'N/A')}</strong></p>
        </div>
      </div>
    `;
  }

  if (!cards) {
    grid.innerHTML = '<p style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">Be the first to post on Gliimu!</p>';
    return;
  }

  grid.innerHTML = cards;
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
// FAQ MODAL (loads from faqs table with fallback)
// ============================================
function openFaqModal() {
  document.getElementById('faq-modal').style.display = 'flex';
  loadFaqs();
}

function openContactModal() {
  document.getElementById('contact-modal').style.display = 'flex';
}

async function loadFaqs() {
  const el = document.getElementById('faq-accordion');
  if (!el || el.dataset.loaded) return;
  el.dataset.loaded = '1';
  const fallback = [
    { q: 'What is Gliimu?', a: 'Gliimu is a full stack media platform where you publish, read, listen, and build your portfolio.' },
    { q: 'How do I earn GP?', a: 'Post content, get referrals, complete reading, and participate in contests to earn GP.' },
    { q: 'How do payments work?', a: 'We accept bank transfers and Paystack. Wallet top-ups are instant.' },
    { q: 'Can I publish my own content?', a: 'Yes. Use the upload button on the Hub page to submit a Book, Audiolite, or Bundle for review.' },
    { q: 'How do referrals work?', a: 'Share your referral code from the Updates page. When your friend signs up and makes a purchase, you earn GP.' },
    { q: 'Is there a mobile app?', a: 'Yes. Check the download section for Android, iOS, Windows, macOS, and Linux.' },
    { q: 'How do I contact support?', a: 'Use the Support tab in your dashboard or email support@gliimu.com.' }
  ];
  let faqs = fallback;
  try {
    const { data } = await supabase.from('faqs').select('question, answer').order('created_at');
    if (data && data.length) faqs = data;
  } catch {}
  el.innerHTML = faqs.map((f, i) => `
    <div class="faq-acc-item" onclick="this.classList.toggle('active')">
      <div class="faq-acc-header">
        <h4>${String(i + 1).padStart(2, '0')}. ${escapeHtml(f.question)}</h4>
        <i class="fas fa-chevron-down"></i>
      </div>
      <div class="faq-acc-content"><p>${escapeHtml(f.answer)}</p></div>
    </div>
  `).join('');
}

window.openFaqModal = openFaqModal;
window.openContactModal = openContactModal;

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
