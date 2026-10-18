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

  // The scrim gradients from 50% dark at the top to solid black at the bottom,
  // and the panel adds its own 50% layer on top.
  const bg = safeUrl(settings.app_download_bg_url);
  if (bg) {
    section.style.background = `linear-gradient(rgba(10, 15, 30, 0.5), rgb(0, 0, 0)) center center / cover, url('${bg}')`;
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
// FETCH LATEST ON GLIIMU (contest, cohort, top 3 GP)
// ============================================
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeLeft(iso) {
  if (!iso) return 'No deadline';
  const diff = new Date(iso) - new Date();
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / 86400000);
  if (days > 30) return Math.floor(days / 30) + 'mo left';
  if (days > 0) return days + 'd left';
  const hrs = Math.floor(diff / 3600000);
  return hrs + 'h left';
}

async function loadHubHighlights() {
  const grid = document.getElementById('hub-grid');
  if (!grid) return;

  const { data, error } = await supabase.rpc('landing_highlights', {});
  if (error || !data) {
    grid.innerHTML = '<p style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">Could not load highlights.</p>';
    return;
  }

  const contest = data.contest;
  const cohort = data.cohort;
  const top3 = Array.isArray(data.top3) ? data.top3 : [];
  let cards = '';

  // Card 1: Active contest
  if (contest) {
    const metric = (contest.metric || '').replace(/_/g, ' ');
    cards += `
      <div class="hub-card reveal" style="transition-delay: 0.1s;">
        <div class="hub-card-meta">
          <span class="hub-card-author">Live Contest</span>
        </div>
        <h3 style="font-size:16px; font-weight:700; margin:0 0 8px;">${escapeHtml(contest.title)}</h3>
        <p class="hub-card-text" style="margin-bottom:12px;">${escapeHtml(contest.description || '')}</p>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <span class="lh-tag">${escapeHtml(metric || 'General')}</span>
          <span class="lh-tag">${escapeHtml(timeLeft(contest.ends_at))}</span>
          <span class="lh-tag">${contest.entries_count} entries</span>
        </div>
        ${contest.prize_text ? `<p style="font-size:12px; font-weight:700; color:var(--brand-primary); margin:0;">Prize: ${escapeHtml(contest.prize_text)}</p>` : ''}
      </div>
    `;
  } else {
    cards += `
      <div class="hub-card reveal" style="transition-delay: 0.1s;">
        <div class="hub-card-meta"><span class="hub-card-author">Live Contest</span></div>
        <p style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px 0;">No active contest right now.</p>
      </div>
    `;
  }

  // Card 2: Latest cohort
  if (cohort) {
    const pct = cohort.seats ? Math.round((cohort.seats_taken / cohort.seats) * 100) : 0;
    cards += `
      <div class="hub-card reveal" style="transition-delay: 0.2s;">
        <div class="hub-card-meta">
          <span class="hub-card-author">Cohort</span>
        </div>
        <h3 style="font-size:16px; font-weight:700; margin:0 0 8px;">${escapeHtml(cohort.title)}</h3>
        <p class="hub-card-text" style="margin-bottom:12px;">${escapeHtml((cohort.description || '').slice(0, 120))}${(cohort.description || '').length > 120 ? '...' : ''}</p>
        <div style="margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
            <span style="color:var(--text-muted);">Seats</span>
            <span style="font-weight:700;">${cohort.seats_taken} / ${cohort.seats}</span>
          </div>
          <div style="height:6px; background:var(--bg-tertiary); border-radius:3px; overflow:hidden;">
            <div style="height:100%; width:${pct}%; background:var(--brand-primary); border-radius:3px; transition:width 0.3s;"></div>
          </div>
        </div>
        ${cohort.starts_at ? `<p style="font-size:12px; color:var(--text-muted); margin:0;">Starts ${formatDate(cohort.starts_at)}</p>` : ''}
      </div>
    `;
  } else {
    cards += `
      <div class="hub-card reveal" style="transition-delay: 0.2s;">
        <div class="hub-card-meta"><span class="hub-card-author">Cohort</span></div>
        <p style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px 0;">No cohort available.</p>
      </div>
    `;
  }

  // Card 3: Top 3 all-time by GP
  if (top3.length) {
    const rows = top3.map((u, i) => {
      const avatar = safeUrl(u.avatar_url);
      return `
        <div class="lh-daily-row">
          <span class="lh-daily-rank">${i + 1}</span>
          ${avatar
            ? `<img src="${avatar}" class="lh-daily-ava" style="object-fit:cover;" alt="">`
            : `<div class="lh-daily-ava lh-daily-ava-empty"></div>`
          }
          <span class="lh-daily-name">${escapeHtml(u.full_name || 'Member')}</span>
          <span class="lh-daily-gp">${Number(u.total_gp || 0).toLocaleString()} GP</span>
        </div>
      `;
    }).join('');

    cards += `
      <div class="hub-card reveal" style="transition-delay: 0.3s;">
        <div class="hub-card-meta">
          <span class="hub-card-author">Top Gliimait</span>
        </div>
        <div class="lh-daily-list">${rows}</div>
      </div>
    `;
  } else {
    cards += `
      <div class="hub-card reveal" style="transition-delay: 0.3s;">
        <div class="hub-card-meta"><span class="hub-card-author">Top Gliimait</span></div>
        <p style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px 0;">No GP earned yet.</p>
      </div>
    `;
  }

  grid.innerHTML = cards;
  initScrollReveal();
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
