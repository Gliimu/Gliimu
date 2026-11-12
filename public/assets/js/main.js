import { supabase } from '/shared/js/config.js?v=2';

// ============================================
// ENTRY SPLASH — the authentication gate
// ============================================
// The cover shipped in index.html stays up until the session check answers:
// a signed-in visitor is handed to the dashboard before the marketing page
// paints, and everyone else gets the landing page.
const SPLASH_MIN_MS = 500;   // long enough to read as a loader, not a flash
const SPLASH_MAX_MS = 6000;  // never trap a visitor behind a hung auth call

// Resolves false when the browser has been sent away, so boot() can skip work
// nobody is going to see.
async function initEntrySplash() {
  const splash = document.getElementById('entry-splash');
  const startedAt = Date.now();
  let session = null;
  let guard;
  try {
    const { data } = await Promise.race([
      supabase.auth.getSession(),
      new Promise((_, reject) => {
        guard = setTimeout(() => reject(new Error('Auth check timed out')), SPLASH_MAX_MS);
      })
    ]);
    session = data?.session || null;
  } catch (e) {
    // Offline, blocked, or a token refresh that never answered — the landing
    // page is the safe thing to show.
  } finally {
    clearTimeout(guard);
  }

  if (session?.user) {
    // replace(), not href: Back should not bounce a member out of the app and
    // into a marketing page they never asked for. The app lives on its own
    // host now; the shared .gliimu.com cookie carries the session across.
    window.location.replace('https://dashboard.gliimu.com/xplore');
    return false;
  }

  if (!splash) return true;
  const hold = SPLASH_MIN_MS - (Date.now() - startedAt);
  if (hold > 0) await new Promise(resolve => setTimeout(resolve, hold));
  splash.classList.add('is-leaving');
  setTimeout(() => splash.remove(), 300);
  return true;
}

// The hero copy has exactly one source: site_settings, edited by operations
// at admin.gliimu.com. A blank column renders a blank hero — no copy is
// invented here.

// ============================================
// FAVICON NOTIFICATION DOT
// ============================================
let faviconCanvas = null;
let faviconCtx = null;
let originalFavicon = null;

function initFavicon() {
  const link = document.querySelector("link[rel~='icon']");
  if (link && !originalFavicon) originalFavicon = link.href;
}

function updateFaviconDot(hasNotification) {
  const link = document.querySelector("link[rel~='icon']");
  if (!link) return;
  if (!hasNotification) {
    if (originalFavicon) link.href = originalFavicon;
    return;
  }
  if (!faviconCanvas) {
    faviconCanvas = document.createElement('canvas');
    faviconCanvas.width = 32;
    faviconCanvas.height = 32;
    faviconCtx = faviconCanvas.getContext('2d');
  }
  const img = new Image();
  img.onload = () => {
    faviconCtx.clearRect(0, 0, 32, 32);
    faviconCtx.drawImage(img, 0, 0, 32, 32);
    const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#6366F1';
    faviconCtx.fillStyle = brand;
    faviconCtx.beginPath();
    faviconCtx.arc(24, 8, 6, 0, Math.PI * 2);
    faviconCtx.fill();
    link.href = faviconCanvas.toDataURL();
  };
  img.src = originalFavicon || '/icons/icon.png';
}

async function initFaviconNotifications() {
  let session;
  try {
    ({ data: { session } } = await supabase.auth.getSession());
  } catch { return; }
  if (!session?.user) return;

  initFavicon();
  const userId = session.user.id;

  const check = async () => {
    const [pingRes, supportRes] = await Promise.all([
      supabase.from('messages').select('id').eq('receiver_id', userId).is('read_at', null).eq('is_ai', false).eq('is_admin', false).limit(1),
      supabase.rpc('support_thread_unread', { p_thread_user: userId }).then(r => r).catch(() => ({ data: 0 }))
    ]);
    const hasPing = pingRes.data && pingRes.data.length > 0;
    const hasSupport = (supportRes.data || 0) > 0;
    updateFaviconDot(hasPing || hasSupport);
  };

  await check();

  supabase.channel('landing-favicon-notifs')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` }, () => check())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `thread_user=eq.${userId}` }, () => check())
    .subscribe();
}

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
// JOIN BUTTONS — link to auth page or dashboard.
// Signed-in visitors see a "Dashboard" button instead.
// ============================================
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
    if (!authed) return;
    // Only the words change — the arrow icon lives beside the label.
    const label = btn.querySelector('span') || btn;
    label.textContent = 'Dashboard';
    btn.href = 'https://dashboard.gliimu.com/xplore';
    // Someone who is already in does not need the sign-in sheet.
    btn.removeAttribute('data-auth-sheet');
  });
}

// ============================================
// AUTH SHEET — sign in and join without leaving the page
// ============================================
// The sheet is a frame around the real /auth.html, so the password form, the
// recovery kit and the terms exist in exactly one place in the product. The
// frame is only given a src when somebody asks for the sheet, and loses it
// again on close, so a visitor who never taps Join Us never loads an auth page.
const AUTH_TABS = { join: 'join', login: 'login' };

// Where a signed-in visitor is handed off to. Set when a card or the co-hort
// strip opens the sheet, so the thing they first tapped is still waiting.
let authReturnTo = null;

// The terms page runs inside the frame, so the drawer only knows it is up
// because auth.html says so. Escape has to close that before the drawer.
let authTermsOpen = false;

function openAuthSheet(tab, returnTo) {
  const sheet = document.getElementById('auth-sheet');
  const frame = document.getElementById('auth-sheet-frame');
  if (!sheet || !frame) return;

  frame.src = '/auth.html' + (AUTH_TABS[tab] ? `?tab=${AUTH_TABS[tab]}` : '');
  authReturnTo = returnTo || null;
  sheet.classList.remove('is-wide');
  sheet.hidden = false;
  document.body.classList.add('auth-sheet-open');
  requestAnimationFrame(() => sheet.classList.add('is-open'));
}

function closeAuthSheet() {
  const sheet = document.getElementById('auth-sheet');
  const frame = document.getElementById('auth-sheet-frame');
  if (!sheet || sheet.hidden) return;

  sheet.classList.remove('is-open', 'is-wide');
  document.body.classList.remove('auth-sheet-open');
  authReturnTo = null;
  authTermsOpen = false;
  setTimeout(() => {
    sheet.hidden = true;
    if (frame) frame.src = 'about:blank';
  }, 320);
}

function initAuthSheet() {
  const sheet = document.getElementById('auth-sheet');
  const frame = document.getElementById('auth-sheet-frame');
  document.addEventListener('click', (e) => {
    const node = e.target;
    if (!(node instanceof Element)) return;
    const opener = node.closest('[data-auth-sheet]');
    if (opener) {
      e.preventDefault();
      openAuthSheet(opener.getAttribute('data-auth-tab'));
      return;
    }
    if (node.closest('[data-auth-sheet-close]')) closeAuthSheet();
  });

  // Escape closes the topmost layer only: terms first, then the drawer. The
  // terms live inside the frame, so the drawer has to ask the frame to drop
  // them rather than reaching in for its DOM.
  const dismissTopLayer = () => {
    if (authTermsOpen) {
      frame?.contentWindow?.postMessage('gliimu:close-terms', window.location.origin);
      return;
    }
    closeAuthSheet();
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dismissTopLayer();
  });

  // Once the visitor clicks into the form, keys belong to the page inside the
  // frame, so Escape has to be installed there too.
  if (frame) {
    frame.addEventListener('load', () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') dismissTopLayer();
      });
    });
  }

  // The frame cannot move the page it sits in, so it reports back instead.
  // Only our own origin is believed.
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data === 'gliimu:signed-in') {
      window.location.replace(authReturnTo || `${DASHBOARD}/xplore`);
      return;
    }
    // Terms across the whole screen, so a reader gets a page instead of a
    // 440px column.
    if (e.data === 'gliimu:terms-open') {
      authTermsOpen = true;
      sheet.classList.add('is-wide');
    }
    if (e.data === 'gliimu:terms-close') {
      authTermsOpen = false;
      sheet.classList.remove('is-wide');
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
// APPS ROW IN THE FOOTER (version, device picker, steps, background, QR)
// ============================================
// One list drives the picker, the button label and the steps, so a device can
// only ever be offered the route that actually exists for it.
//
//   family  — which entries the picker shows at all. Nobody installs a Windows
//             file on a phone, so a phone is never offered one.
//   channel — how the steps are worded. A store never hands out a file and an
//             installer never opens a store, so the two cannot share a script.
const PLATFORMS = [
  { key: 'windows', label: 'Windows', icon: 'fab fa-windows', family: 'desktop', channel: 'installer', source: 'Windows setup file (.exe)', place: 'your Start menu' },
  { key: 'mac',     label: 'macOS',   icon: 'fab fa-apple',   family: 'desktop', channel: 'store',     source: 'Mac App Store',           place: 'your Applications folder' },
  { key: 'linux',   label: 'Linux',   icon: 'fab fa-linux',   family: 'desktop', channel: 'installer', source: 'Linux package (.deb)',    place: 'your apps list' },
  { key: 'android', label: 'Android', icon: 'fab fa-android', family: 'mobile',  channel: 'store',     source: 'Google Play',             place: 'your home screen' },
  { key: 'ios',     label: 'iOS',     icon: 'fab fa-apple',   family: 'mobile',  channel: 'store',     source: 'App Store',               place: 'your Home Screen' },
];

// key -> installer or store URL, filled in from site_settings. Empty means
// nothing has been published behind that platform yet.
let appUrls = {};
let selectedPlatform = null;
let deviceFamily = 'desktop';

// Pre-filling the picker from the visitor's own browser means the common case
// is one tap: the device they are standing at is already showing.
function detectPlatform() {
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints > 0;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Mac/i.test(ua) && touch) return 'ios';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua)) return 'mac';
  if (/Linux/i.test(ua)) return 'linux';
  return null;
}

// When the browser says nothing useful the screen does: a wide window driven by
// a fine pointer is a desk machine.
function detectFamily(key) {
  const known = platformOf(key);
  if (known) return known.family;
  return window.matchMedia('(min-width: 700px) and (hover: hover) and (pointer: fine)').matches
    ? 'desktop'
    : 'mobile';
}

function platformOf(key) {
  return PLATFORMS.find(p => p.key === key) || null;
}

function renderDeviceOptions() {
  const menu = document.getElementById('dl-device-menu');
  if (!menu) return;
  menu.innerHTML = PLATFORMS.filter(p => p.family === deviceFamily).map(p => `
    <button type="button" class="dl-option" role="option" data-platform="${p.key}" aria-selected="false">
      <i class="${p.icon}" aria-hidden="true"></i><span>${p.label}</span>
    </button>`).join('');
}

function selectPlatform(key) {
  selectedPlatform = key || null;
  const picked = platformOf(selectedPlatform);
  const icon = document.getElementById('dl-device-icon');
  const label = document.getElementById('dl-device-label');
  if (icon) icon.className = picked ? picked.icon : 'fas fa-laptop';
  if (label) label.textContent = picked ? picked.label : 'Device';
  document.querySelectorAll('#dl-device-menu [data-platform]').forEach(opt => {
    opt.setAttribute('aria-selected', String(opt.dataset.platform === selectedPlatform));
  });
  renderDownloadSteps();
}

// The whole list is written here rather than sitting in the markup, because the
// second step of a store install and the second step of a downloaded installer
// are different sentences, and a fixed list would be wrong for one of them.
function renderDownloadSteps() {
  const list = document.getElementById('dl-steps-list');
  const osLabel = document.getElementById('dl-steps-os');
  if (!list) return;

  const picked = platformOf(selectedPlatform);
  if (osLabel) osLabel.textContent = picked ? 'for ' + picked.label : 'on your device';
  if (!picked) { list.innerHTML = ''; return; }

  const isStore = picked.channel === 'store';
  const href = safeUrl(appUrls[picked.key]);
  // A device with nothing published behind it keeps the same shape and answers
  // with the notice, rather than a link that goes nowhere.
  const source = href
    ? `<a class="dl-step-link" href="${escapeHtml(href)}"${isStore ? ' target="_blank" rel="noopener"' : ' download'}>${escapeHtml(picked.source)}</a>`
    : `<button type="button" class="dl-step-link is-quiet" data-apps-notice>${escapeHtml(picked.source)}</button>`;

  const steps = isStore ? [
    {
      name: `Get it from the ${picked.source}`,
      text: 'Open the store, search for Gliimu, then tap Get.',
      action: source,
    },
    {
      name: 'Open the app',
      text: `When the store finishes, Gliimu sits in ${picked.place}.`,
    },
  ] : [
    {
      name: 'Download the installer',
      text: `Save the ${picked.source} to this machine.`,
      action: source,
    },
    {
      name: 'Run it',
      text: `Open the file and follow it through to the end. Gliimu then appears in ${picked.place}.`,
    },
  ];

  // One way in, the same word the hero uses, and the same drawer: an account is
  // an account whether it is opened from an app or from this page.
  steps.push({
    name: 'Enter your account',
    text: 'Use the email and password you signed up with. First time here? Create your account on that screen.',
    action: '<a class="dl-step-link" href="/auth.html?tab=login" data-auth-sheet data-auth-tab="login">Enter</a>',
  });

  list.innerHTML = steps.map((s, i) => `
    <li class="dl-step">
      <span class="dl-step-num">${i + 1}</span>
      <div class="dl-step-body">
        <h3 class="dl-step-name">${escapeHtml(s.name)}</h3>
        <p class="dl-step-text">${escapeHtml(s.text)}</p>
        ${s.action || ''}
      </div>
    </li>`).join('');
}

function initDeviceMenu() {
  const field = document.getElementById('dl-device-field');
  const btn = document.getElementById('dl-device-btn');
  const menu = document.getElementById('dl-device-menu');
  if (!field || !btn || !menu) return;

  deviceFamily = detectFamily(detectPlatform());
  renderDeviceOptions();

  const close = () => {
    menu.hidden = true;
    field.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
  };

  btn.addEventListener('click', () => {
    if (menu.hidden) {
      menu.hidden = false;
      field.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    } else {
      close();
    }
  });

  menu.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-platform]');
    if (!opt) return;
    selectPlatform(opt.dataset.platform);
    close();
  });

  document.addEventListener('click', (e) => {
    if (!menu.hidden && !field.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) close();
  });

  selectPlatform(detectPlatform());
}

function initDownloadSteps() {
  const modal = document.getElementById('dl-steps');
  const opener = document.getElementById('dl-steps-btn');
  if (!modal || !opener) return;

  const close = () => {
    modal.classList.remove('is-open');
    setTimeout(() => { modal.hidden = true; }, 200);
  };

  opener.addEventListener('click', () => {
    renderDownloadSteps();
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-open'));
  });

  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-dl-steps-close]')) close();
    // Step 3 hands over to the sign-in drawer, which sits under this modal, so
    // the steps have to get out of the way for it.
    if (e.target.closest('[data-auth-sheet]')) close();
  });

  document.addEventListener('keydown', (e) => {
    // The notice floats above this modal, so while it is up Escape belongs to
    // it alone.
    if (e.key !== 'Escape' || modal.hidden) return;
    if (!document.getElementById('apps-notice')?.hidden) return;
    close();
  });
}

function applyDownloadSection(settings) {
  const footer = document.querySelector('.site-footer');
  if (!footer) return;

  // The image is the ground of the whole footer, not of a card inside it. The
  // dark base stays in CSS underneath, so if operations never uploads a
  // picture the white controls still have something to sit on.
  const bg = safeUrl(settings.app_download_bg_url);
  footer.style.backgroundImage = bg
    ? `linear-gradient(rgba(10, 15, 30, 0.72), rgba(10, 15, 30, 0.86)), url('${bg}')`
    : '';

  const version = (settings.app_version || '').trim();
  const notes = (settings.app_version_notes || '').trim();
  const versionEl = document.getElementById('dl-version');
  if (versionEl) versionEl.textContent = version;
  const versionWrap = document.getElementById('dl-version-wrap');
  if (versionWrap) versionWrap.hidden = !version;
  const notesEl = document.getElementById('dl-notes');
  if (notesEl) {
    notesEl.textContent = notes;
    notesEl.hidden = !notes;
  }

  appUrls = {
    windows: safeUrl(settings.app_windows_url),
    mac: safeUrl(settings.app_mac_url),
    linux: safeUrl(settings.app_linux_url),
    android: safeUrl(settings.app_android_url),
    ios: safeUrl(settings.app_ios_url),
  };
  const hasInstaller = Object.values(appUrls).some(Boolean);
  renderDownloadSteps();

  // Whether this is a desk-sized screen is left to CSS alone. Two gates — one
  // in JavaScript, one in a stylesheet — meant a wide window could un-hide a
  // QR the other layer was still refusing to lay out.
  const qrWrap = document.getElementById('dl-qr-wrap');
  if (!qrWrap) return;
  const qrTarget = safeUrl(settings.app_mobile_qr_url)
    || safeUrl(settings.app_android_url)
    || safeUrl(settings.app_ios_url);
  if (!qrTarget) { qrWrap.hidden = true; return; }

  // Until there is a real build the QR opens Gliimu in the phone's browser, so
  // say that instead of promising a download.
  const qrLabel = hasInstaller
    ? 'Scan to download the Gliimu app'
    : 'Scan to open Gliimu on your phone';
  const qrHint = qrWrap.querySelector('.download-qr-hint');
  if (qrHint) qrHint.textContent = qrLabel;

  qrWrap.hidden = false;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&ecc=H&margin=6&qzone=1&data=${encodeURIComponent(qrTarget)}`;
  qrWrap.querySelector('.download-qr-code').innerHTML = `
    <div class="landing-qr-img">
      <img class="qr" src="${qrSrc}" alt="${escapeHtml(qrLabel)}">
      <img class="qr-logo" src="/icons/icon.png" alt="Gliimu">
    </div>
  `;
  // The plate is drawn by a third-party endpoint, the one part of this row that
  // can fail on its own. An empty white square reads as a broken page, so the
  // whole block goes rather than showing one.
  qrWrap.querySelector('.download-qr-code img.qr').addEventListener('error', () => {
    qrWrap.hidden = true;
  });
}

// ============================================
// APPS NOTICE
// ============================================
// Every download request with no installer behind it opens this, and it goes
// away on its own so a visitor never has to look for the close button.
const APPS_NOTICE_MS = 5000;
let appsNoticeTimer = null;

function showAppsNotice() {
  const el = document.getElementById('apps-notice');
  if (!el) return;
  clearTimeout(appsNoticeTimer);
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('is-open'));
  appsNoticeTimer = setTimeout(hideAppsNotice, APPS_NOTICE_MS);
}

function hideAppsNotice() {
  const el = document.getElementById('apps-notice');
  if (!el) return;
  clearTimeout(appsNoticeTimer);
  el.classList.remove('is-open');
  setTimeout(() => { el.hidden = true; }, 200);
}

function initAppsNotice() {
  // Delegated: step 1 is rewritten whenever the device changes, so the
  // listener is keyed off the marker rather than off an element that only
  // exists after the settings arrive.
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-apps-notice]')) {
      showAppsNotice();
      return;
    }
    if (e.target.closest('[data-apps-notice-close]')) hideAppsNotice();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideAppsNotice();
  });
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
// FETCH LATEST ON GLIIMU (log, publication, bundle, open co-hort)
// ============================================
const DASHBOARD = 'https://dashboard.gliimu.com';

// One rule for every card and for the co-hort strip: a visitor is asked to
// sign in on the spot, a signed-in person is sent to the thing they tapped
// (or to XpLoRe when there is nothing behind the tap).
async function goToDashboard(itemId) {
  const target = itemId ? `${DASHBOARD}/post?id=${encodeURIComponent(itemId)}` : `${DASHBOARD}/xplore`;
  let authed = false;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    authed = !!session;
  } catch (e) {
    // Auth unreachable — treat the visitor as signed out.
  }
  if (!authed) {
    openAuthSheet('login', target);
    return;
  }
  window.location.href = target;
}

const PLAY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"></polygon></svg>';
const EYE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
const COMMENT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';

function pillarLink(itemId, label, extraClass, inner) {
  return `<a class="pillar-link${extraClass ? ` ${extraClass}` : ''}" href="#" data-item-id="${escapeHtml(itemId || '')}" aria-label="${escapeHtml(label)}">${inner}</a>`;
}

// The three cards are the three things a gliim can be, drawn exactly as the
// dashboard draws them: a log is a square with a play badge, a publication is
// its cover alone, a bundle is a wide card with the writer under it.
function logCardHtml(log) {
  const cover = safeUrl(log.cover_url);
  const inner = `<article class="audiolite-card${cover ? ' audiolite-cover-card' : ''}"${
    cover ? ` style="background-image: url('${cover}');"` : ''
  }>
    <div class="audiolite-center-icon" aria-hidden="true">${PLAY_SVG}</div>
    <h2 class="audiolite-title">${escapeHtml(log.title)}</h2>
  </article>`;
  return pillarLink(log.id, `Log: ${log.title || 'Untitled Gliim'}`, '', inner);
}

function bookCardHtml(book) {
  const cover = safeUrl(book.cover_url);
  if (!cover) return '';
  const inner = `<article class="book-cover-card" style="background-image: url('${cover}');"></article>`;
  return pillarLink(book.id, `Publication: ${book.title || 'Untitled Gliim'}`, '', inner);
}

function bundleCardHtml(b) {
  const cover = safeUrl(b.cover_url);
  if (!cover) return '';
  const avatar = safeUrl(b.author_avatar);
  const name = String(b.author || '').trim();
  const author = (avatar || name)
    ? `<div class="blog-author">${avatar ? `<img class="blog-avatar" src="${avatar}" alt="">` : ''}${
        name ? `<span>${escapeHtml(name)}</span>` : ''}</div>`
    : '';
  const date = b.created_at
    ? new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  const desc = String(b.description || '').trim();
  const inner = `<article class="blog-card bundle-card">
    <div class="bundle-cover" style="background-image: url('${cover}');"></div>
    <div class="blog-content">
      <div class="blog-meta">${date ? `<span class="blog-date">${escapeHtml(date)}</span>` : ''}</div>
      <h2 class="blog-title">${escapeHtml(b.title || 'Untitled Gliim')}</h2>
      ${desc ? `<p class="blog-desc">${escapeHtml(desc)}</p>` : ''}
      <div class="blog-footer">
        ${author}
        <div class="blog-stats">
          <span class="blog-stat">${EYE_SVG}${Number(b.views) || 0}</span>
          <span class="blog-stat">${COMMENT_SVG}${Number(b.comments) || 0}</span>
        </div>
      </div>
    </div>
  </article>`;
  return pillarLink(b.id, `Bundle: ${b.title || 'Untitled Gliim'}`, 'pillar--bundle', inner);
}

async function loadHubHighlights() {
  const container = document.getElementById('xplore-pillars');
  if (!container) return;

  const { data, error } = await supabase.rpc('landing_highlights', {});
  if (error || !data) {
    container.innerHTML = '<p class="panel-note">Could not load highlights.</p>';
    return;
  }

  const cards = [
    data.top_log && logCardHtml(data.top_log),
    data.top_book && bookCardHtml(data.top_book),
    data.top_bundle && bundleCardHtml(data.top_bundle),
  ].filter(Boolean);

  container.innerHTML = cards.length
    ? cards.join('')
    : '<p class="panel-note">Nothing is on the shelf yet.</p>';

  container.querySelectorAll('[data-item-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      goToDashboard(el.dataset.itemId || null);
    });
  });

  renderCohortStrip(data.top_cohort);
}

// ============================================
// CO-HORT STRIP — seats, title, accepted faces, one line
// ============================================
// Sticky under the hero. It stays hidden unless a cohort is actually open,
// and a face only appears here once Operations has accepted that person.
function renderCohortStrip(cohort) {
  const bar = document.getElementById('cohort-bar');
  if (!bar) return;
  if (!cohort || !cohort.id) return;

  const accepted = Number(cohort.accepted_count) || 0;
  const required = Number(cohort.required_count) || 0;

  const countEl = document.getElementById('cohort-count');
  if (countEl) countEl.textContent = required ? `${accepted}/${required}` : String(accepted);

  const titleEl = document.getElementById('cohort-title');
  if (titleEl) titleEl.textContent = String(cohort.strip_label || cohort.title || '').trim();

  const facesEl = document.getElementById('cohort-faces');
  if (facesEl) {
    facesEl.innerHTML = (Array.isArray(cohort.members) ? cohort.members : []).map(m => {
      const url = safeUrl(m && m.avatar_url);
      return url ? `<img class="cohort-strip-face" src="${url}" alt="">` : '';
    }).join('');
  }

  bar.hidden = false;

  const strip = document.getElementById('cohort-strip');
  if (strip) strip.addEventListener('click', () => goToDashboard(null));
}

// ============================================
// FETCH PARTNERS (admin managed)
// ============================================
async function loadPartners() {
  const strip = document.getElementById('partners-strip');
  const grid = document.getElementById('partners-grid');
  if (!strip || !grid) return;

  const { data: partners, error } = await supabase
    .from('partners')
    .select('name, logo_url')
    .order('display_order', { ascending: true });

  const usable = (error || !partners ? [] : partners).filter(p => safeUrl(p.logo_url));
  if (usable.length === 0) return;

  const logos = usable.slice(0, 6);

  grid.innerHTML = logos.map(p => `
    <span class="partner-logo">
      <img src="${safeUrl(p.logo_url)}" alt="" loading="lazy">
    </span>
  `).join('');

  strip.style.display = 'block';
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
  loadContact();
}

async function loadContact() {
  const el = document.getElementById('contact-body');
  if (!el || el.dataset.loaded) return;
  el.dataset.loaded = '1';

  const SOCIAL_KEYS = ['youtube', 'tiktok', 'facebook', 'pinterest', 'twitter', 'instagram', 'linkedin'];

  let contact = null;
  try {
    const { data } = await supabase.from('contact_info').select('*').limit(1).maybeSingle();
    contact = data;
  } catch {}

  if (!contact) {
    el.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No contact details on file yet.</p>';
    return;
  }

  const infoItems = [];
  if (contact.phone) {
    infoItems.push(`<div class="contact-info-item"><i class="fas fa-phone"></i><h4>Phone</h4><p><a href="tel:${escapeHtml(contact.phone)}">${escapeHtml(contact.phone)}</a></p></div>`);
  }
  if (contact.email) {
    infoItems.push(`<div class="contact-info-item"><i class="fas fa-envelope"></i><h4>Email</h4><p><a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a></p></div>`);
  }

  const addressHtml = contact.address ? `<div class="contact-info-item contact-address"><i class="fas fa-map-marker-alt"></i><h4>Address</h4><p>${escapeHtml(contact.address).replace(/\n/g, '<br>')}</p></div>` : '';

  const socialLinks = [];
  for (const key of SOCIAL_KEYS) {
    const url = safeUrl(contact[key]);
    if (url) {
      try {
        const domain = new URL(url).hostname;
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
        socialLinks.push(`<a href="${url}" target="_blank" rel="noopener"><img src="${faviconUrl}" alt="" style="width:24px;height:24px;border-radius:4px;"></a>`);
      } catch {}
    }
  }

  el.innerHTML = `
    ${infoItems.length ? `<div class="contact-info-grid">${infoItems.join('')}</div>` : ''}
    ${addressHtml}
    ${socialLinks.length ? `
      <div class="social-section-modal">
        <p>Follow us</p>
        <div class="social-icons-modal">${socialLinks.join('')}</div>
      </div>
    ` : ''}
    ${!infoItems.length && !addressHtml && !socialLinks.length ? '<p style="color:var(--text-muted); text-align:center;">No contact details on file yet.</p>' : ''}
  `;
}

async function loadFaqs() {
  const el = document.getElementById('faq-accordion');
  if (!el || el.dataset.loaded) return;
  el.dataset.loaded = '1';
  const fallback = [
    { q: 'What is Gliimu?', a: 'Gliimu is a full stack media platform where you publish, read, listen, and build your portfolio.' },
    { q: 'How do I earn GP?', a: 'Post content, get referrals, complete reading, and participate in contests to earn GP.' },
    { q: 'How do payments work?', a: 'We accept bank transfers and Paystack. Wallet top-ups are instant.' },
    { q: 'Can I publish my own content?', a: 'Yes. Open the Publish page in your dashboard, write your gliim and it goes live the moment you publish it.' },
    { q: 'How do referrals work?', a: 'Share your referral link from the Billing page. When your friend signs up and makes a purchase, you earn GP.' },
    { q: 'Is there a mobile app?', a: 'The app is on the way. We are finishing installers for Android, iOS, Windows, macOS and Linux; until then Gliimu runs in your browser on any device.' },
    { q: 'How do I contact support?', a: 'Use the Support tab in your dashboard or email support@gliimu.com.' }
  ];
  let faqs = fallback;
  try {
    const { data } = await supabase.from('faqs').select('question, answer').order('display_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true });
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
  if (!await initEntrySplash()) return;

  initJoinButtons();
  initAuthSheet();
  initAppsNotice();
  initDeviceMenu();
  initDownloadSteps();
  initScrollReveal();
  loadSiteSettings();
  loadHubHighlights();
  loadPartners();
  forceVideoAutoplay();
  initFaviconNotifications();

  // Dynamic copyright year
  const copyrightEl = document.getElementById('copyright-text');
  if (copyrightEl) {
    const year = new Date().getFullYear();
    copyrightEl.textContent = `\u00A9 ${year} Gliimu Ltd.`;
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
