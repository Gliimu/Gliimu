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

  // The scrim gradients from 50% dark at the top to solid black at the bottom,
  // and the panel adds its own 50% layer on top.
  const bg = safeUrl(settings.app_download_bg_url);
  if (bg) {
    section.style.background = `linear-gradient(rgba(10, 15, 30, 0.55), rgba(10, 15, 30, 0.9)) center center / cover, url('${bg}')`;
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
  const versionRow = document.querySelector('#download-panel .download-version');
  const version = (settings.app_version || '').trim();
  const notes = (settings.app_version_notes || '').trim();
  if (versionEl) versionEl.textContent = version;
  if (versionBadge) versionBadge.style.display = version ? '' : 'none';

  const notesEl = document.getElementById('dl-notes');
  if (notesEl) notesEl.textContent = notes;
  if (versionRow) versionRow.style.display = (version || notes) ? '' : 'none';

  const targets = [
    ['dl-windows', settings.app_windows_url],
    ['dl-mac', settings.app_mac_url],
    ['dl-linux', settings.app_linux_url],
    ['dl-android', settings.app_android_url],
    ['dl-ios', settings.app_ios_url],
  ];

  // The buttons ship disabled in index.html; a DB URL is the only thing that
  // switches one on, so a placeholder link can never be handed to a visitor.
  let liveFiles = 0;
  targets.forEach(([id, raw]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const href = safeUrl(raw);
    if (href) {
      liveFiles++;
      el.href = href;
      el.classList.remove('is-off');
      el.removeAttribute('aria-disabled');
    } else {
      el.removeAttribute('href');
      el.classList.add('is-off');
      el.setAttribute('aria-disabled', 'true');
    }
  });

  // Nothing installable: the five grey buttons are taken out and the plain
  // statement that the app is on the way becomes the section. CSS does the
  // hiding, keyed off this one class.
  panel.classList.toggle('no-installers', liveFiles === 0);
  const subtitle = document.getElementById('dl-subtitle');
  if (subtitle) subtitle.style.display = liveFiles > 0 ? '' : 'none';

  // The QR only helps a visitor standing at a desk with a phone in their
  // pocket, so it renders on a wide non-touch screen and nowhere else.
  const qrWrap = document.getElementById('dl-qr-wrap');
  const qrTarget = safeUrl(settings.app_mobile_qr_url)
    || safeUrl(settings.app_android_url)
    || safeUrl(settings.app_ios_url);
  if (!qrWrap || !qrTarget) return;
  const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const isWideScreen = window.matchMedia('(min-width: 601px)').matches;
  if (!isWideScreen || isTouchDevice) return;

  // Until there is a real installer the QR opens Gliimu in the phone's browser,
  // so say that instead of promising a download.
  const qrLabel = liveFiles > 0
    ? 'Scan to download the Gliimu app'
    : 'Scan to open Gliimu on your phone';
  const qrHint = qrWrap.querySelector('.download-qr-hint');
  if (qrHint) qrHint.textContent = liveFiles > 0
    ? 'Scan with your phone to install on Android or iOS'
    : qrLabel;

  qrWrap.style.display = 'flex';
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&ecc=H&margin=6&qzone=1&data=${encodeURIComponent(qrTarget)}`;
  qrWrap.querySelector('.download-qr-code').innerHTML = `
    <div class="landing-qr-img">
      <img class="qr" src="${qrSrc}" alt="${qrLabel}">
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
// FETCH LATEST ON GLIIMU (log, publication, bundle, open co-hort)
// ============================================
const DASHBOARD = 'https://dashboard.gliimu.com';

// One rule for every card and for the co-hort strip: a visitor is sent to the
// auth page, a signed-in person is sent to the thing they tapped (or to XpLoRe
// when there is nothing behind the tap).
async function goToDashboard(itemId) {
  let authed = false;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    authed = !!session;
  } catch (e) {
    // Auth unreachable — treat the visitor as signed out.
  }
  if (!authed) window.location.href = '/auth.html';
  else window.location.href = itemId ? `${DASHBOARD}/post?id=${encodeURIComponent(itemId)}` : `${DASHBOARD}/xplore`;
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
  renderStepNow(data);
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

// One step open at a time, so the rail reads as progress: everything before
// the open node is already walked, everything after it is still ahead.
function initStepsAccordion() {
  const items = Array.from(document.querySelectorAll('.steps-accordion .step-item'));
  if (items.length === 0) return;

  const select = (openIndex) => {
    items.forEach((item, i) => {
      item.classList.toggle('is-open', i === openIndex);
      item.classList.toggle('is-done', i < openIndex);
      const head = item.querySelector('.step-head');
      if (head) head.setAttribute('aria-expanded', i === openIndex ? 'true' : 'false');
    });
  };

  items.forEach((item, i) => {
    const head = item.querySelector('.step-head');
    if (head) head.addEventListener('click', () => select(i));
  });

  select(0);
}

// The two "right now" lines inside How Gliimu works. They quote real rows, so
// they stay hidden when the library has nothing to quote.
function renderStepNow(data) {
  const logEl = document.getElementById('step-now-log');
  if (logEl && data.top_log && data.top_log.title) {
    logEl.innerHTML = `Right now: <strong>${escapeHtml(data.top_log.title)}</strong>`;
    logEl.hidden = false;
  }
  const cohortEl = document.getElementById('step-now-cohort');
  if (cohortEl && data.top_cohort && data.top_cohort.title) {
    cohortEl.innerHTML = `Now open: <strong>${escapeHtml(data.top_cohort.title)}</strong>`;
    cohortEl.hidden = false;
  }
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
  initScrollReveal();
  initStepsAccordion();
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
