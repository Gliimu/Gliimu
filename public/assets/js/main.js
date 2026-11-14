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
// The sheet is a frame around the real /auth.html, so the password form and the
// recovery kit exist in exactly one place in the product. The terms are not in
// it: legal text is a page of its own (/terms.html), not a corner of a drawer.
// The frame is only given a src when somebody asks for the sheet, and loses it
// again on close, so a visitor who never taps Enter never loads an auth page.
const DASHBOARD = 'https://dashboard.gliimu.com';
const AUTH_TABS = { join: 'join', login: 'login' };

function openAuthSheet(tab) {
  const sheet = document.getElementById('auth-sheet');
  const frame = document.getElementById('auth-sheet-frame');
  if (!sheet || !frame) return;

  const query = AUTH_TABS[tab] ? `?tab=${AUTH_TABS[tab]}` : '';

  frame.src = '/auth.html' + query;
  sheet.hidden = false;
  document.body.classList.add('auth-sheet-open');
  requestAnimationFrame(() => sheet.classList.add('is-open'));
}

function closeAuthSheet() {
  const sheet = document.getElementById('auth-sheet');
  const frame = document.getElementById('auth-sheet-frame');
  if (!sheet || sheet.hidden) return;

  sheet.classList.remove('is-open');
  document.body.classList.remove('auth-sheet-open');
  setTimeout(() => {
    sheet.hidden = true;
    if (frame) frame.src = 'about:blank';
  }, 320);
}

function initAuthSheet() {
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAuthSheet();
  });

  // Once the visitor clicks into the form, keys belong to the page inside the
  // frame, so Escape has to be installed there too.
  if (frame) {
    frame.addEventListener('load', () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAuthSheet();
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
  });
}

// ============================================
// HERO LINK ROW — FAQs, Contact, theme
// ============================================
// Terms is not here because it needs no script: it is a link to /terms.html.
// toggleTheme() comes from /shared/js/theme.js, which loads before this module.
function initHeroLinks() {
  if (!document.querySelector('.hero-links')) return;

  document.addEventListener('click', (e) => {
    const node = e.target;
    if (!(node instanceof Element)) return;
    const action = node.closest('[data-site-action]');
    if (!action) return;
    if (action.dataset.siteAction === 'faq') openFaqModal();
    if (action.dataset.siteAction === 'contact') openContactModal();
    if (action.dataset.siteAction === 'theme') toggleTheme();
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
  initHeroLinks();
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
