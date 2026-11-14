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
const DASHBOARD = 'https://dashboard.gliimu.com';
const AUTH_TABS = { join: 'join', login: 'login' };

// The terms page runs inside the frame, so the drawer only knows it is up
// because auth.html says so. Escape has to close that before the drawer.
let authTermsOpen = false;

// True when the sheet was asked for the terms and nothing else. For those
// visitors the document IS the sheet, so closing it closes the drawer.
let authOpenedForTerms = false;

function openAuthSheet(tab, terms) {
  const sheet = document.getElementById('auth-sheet');
  const frame = document.getElementById('auth-sheet-frame');
  if (!sheet || !frame) return;

  const params = new URLSearchParams();
  if (AUTH_TABS[tab]) params.set('tab', AUTH_TABS[tab]);
  if (terms) params.set('terms', '1');
  const query = params.toString();

  frame.src = '/auth.html' + (query ? `?${query}` : '');
  authOpenedForTerms = !!terms;
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
  authTermsOpen = false;
  authOpenedForTerms = false;
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
      openAuthSheet(opener.getAttribute('data-auth-tab'), opener.hasAttribute('data-auth-terms'));
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
      window.location.replace(`${DASHBOARD}/xplore`);
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
      // A visitor who came for the terms has nothing else in the drawer to
      // look at, so the document closing is the drawer closing.
      if (authOpenedForTerms) closeAuthSheet();
    }
  });
}

// ============================================
// TOP BAR MENU — the three exits the footer used to print on the ground
// ============================================
// The panel is told to stop before anything it launches opens, so a visitor
// never finds the FAQ sheet sitting behind an open menu.
function setSiteMenu(open) {
  const btn = document.getElementById('menu-toggle');
  const menu = document.getElementById('site-menu');
  if (!btn || !menu) return;
  if (open) {
    menu.hidden = false;
    requestAnimationFrame(() => menu.classList.add('is-open'));
  } else {
    menu.classList.remove('is-open');
    // A reopen inside the fade leaves .is-open set, and that is the only thing
    // standing between this timer and a panel that vanished while visible.
    setTimeout(() => { if (!menu.classList.contains('is-open')) menu.hidden = true; }, 180);
  }
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function initSiteMenu() {
  const btn = document.getElementById('menu-toggle');
  const menu = document.getElementById('site-menu');
  if (!btn || !menu) return;
  const isOpen = () => btn.getAttribute('aria-expanded') === 'true';

  document.addEventListener('click', (e) => {
    const node = e.target;
    if (!(node instanceof Element)) return;
    if (node.closest('#menu-toggle')) {
      setSiteMenu(!isOpen());
      return;
    }
    if (!isOpen()) return;
    const action = node.closest('[data-site-action]');
    if (action) {
      setSiteMenu(false);
      if (action.dataset.siteAction === 'faq') openFaqModal();
      if (action.dataset.siteAction === 'contact') openContactModal();
      return;
    }
    if (node.closest('[data-auth-sheet]') || !node.closest('.site-menu')) setSiteMenu(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setSiteMenu(false);
  });
}

// ============================================
// FETCH SITE SETTINGS — the hero
// ============================================
async function loadSiteSettings() {
  const { data, error } = await supabase.from('site_settings').select('*').single();
  if (error || !data) return;

  // Hero explainer (Operations > Landing page). No bundled stand-in: when the
  // column is blank there is no film and no play button. Phones get their own
  // upload when one exists, and the all-devices film when the mobile one is
  // blank.
  initHeroVideo(pickHeroVideoUrl(data));

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
}

// Phones take their own upload when Operations set one, and the film every
// device gets when the mobile column is blank. (pointer: coarse) is the touch
// signal, so it still holds with the phone turned sideways.
function pickHeroVideoUrl(settings) {
  const mobile = safeUrl(settings.hero_mobile_video_url);
  const every = safeUrl(settings.hero_video_url);
  return window.matchMedia('(pointer: coarse)').matches ? (mobile || every) : every;
}

// ============================================
// HERO EXPLAINER — one click, sound on
// ============================================
// The film is the hero, so it is not a background any more. Nothing autoplays:
// a browser only lets sound start from a click, so the click is the design
// rather than a limitation. preload="metadata" gives frame 0 as the poster, so
// the hero is never an empty box before someone presses play.
function initHeroVideo(url) {
  const video = document.getElementById('hero-video');
  const btn = document.getElementById('hero-play');
  const hero = document.querySelector('.hero');
  if (!video || !btn || !hero) return;
  if (!url) return;

  video.src = url;
  btn.hidden = false;

  const setState = (playing) => {
    btn.classList.toggle('is-playing', playing);
    hero.classList.toggle('is-playing', playing);
    btn.setAttribute('aria-label', playing ? 'Pause the Gliimu film' : 'Play the Gliimu film');
  };

  btn.addEventListener('click', () => {
    if (video.paused) { video.play().catch(() => {}); } else { video.pause(); }
  });
  video.addEventListener('play', () => setState(true));
  // When it finishes the last frame is simply left on screen, and the button
  // becomes a play control again so the film can be watched a second time.
  video.addEventListener('pause', () => setState(false));
  video.addEventListener('ended', () => setState(false));
  // An Operations upload that 404s must not leave a dead button over the hero.
  video.addEventListener('error', () => { btn.hidden = true; });
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
  let faqs = [];
  try {
    const { data } = await supabase.from('faqs')
      .select('question, answer')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (data && data.length) faqs = data;
  } catch {}
  if (!faqs.length) {
    el.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No questions on file yet.</p>';
    return;
  }
  el.dataset.loaded = '1';
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

// ============================================
// INITIALIZE
// ============================================
// Module imports can resolve after DOMContentLoaded on a cold CDN cache,
// which would leave this listener never firing and the page stuck loading.
const boot = async () => {
  if (!await initEntrySplash()) return;

  initJoinButtons();
  initAuthSheet();
  initSiteMenu();
  loadSiteSettings();
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
