import { supabase } from '/shared/js/config.js';

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
// AUTH GUARD — signed-in visitors go to the dashboard
// ============================================
async function redirectIfAuthenticated() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      window.location.replace('/dashboard/index.html');
      return true;
    }
  } catch (e) {
    // Auth unreachable (offline, blocked) — fall through and show the page.
  }
  return false;
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
// STICKY NAV — solid background once scrolled
// ============================================
function initStickyNav() {
  const nav = document.getElementById('site-nav');
  if (!nav) return;
  const sync = () => nav.classList.toggle('scrolled', window.scrollY > 24);
  sync();
  window.addEventListener('scroll', sync, { passive: true });
}

// ============================================
// ACCORDION LOGIC
// ============================================
function initAccordion() {
  const accordionItems = document.querySelectorAll('.accordion-item');
  accordionItems.forEach(item => item.classList.remove('active'));
  accordionItems.forEach(item => {
    const header = item.querySelector('.accordion-header');
    if (!header) return;
    header.addEventListener('click', () => {
      accordionItems.forEach(other => {
        if (other !== item && other.classList.contains('active')) other.classList.remove('active');
      });
      item.classList.toggle('active');
    });
  });
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

  // Squad Background
  const squadSection = document.getElementById('squad-section');
  const squadBg = safeUrl(data.squad_bg_url);
  if (squadSection && squadBg) {
    squadSection.style.background = `linear-gradient(to right, rgba(10, 15, 30, 0.95), rgba(10, 15, 30, 0.85)), url('${squadBg}')`;
    squadSection.style.backgroundSize = 'cover';
    squadSection.style.backgroundPosition = 'center';
  }

  // Earn Graphic Image
  const earnGraphic = document.getElementById('earn-graphic-container');
  const earnImage = safeUrl(data.earnings_image_url);
  if (earnGraphic && earnImage) {
    earnGraphic.innerHTML = `<img src="${earnImage}" alt="Earnings" class="earn-icon-img"><div class="earn-pulse"></div>`;
  }

  applyDownloadSection(data);
}

// ============================================
// DOWNLOAD SECTION (version, links, background, QR)
// ============================================
let qrLibPromise = null;

function loadQrLib() {
  if (window.qrcode) return Promise.resolve();
  if (qrLibPromise) return qrLibPromise;
  qrLibPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('qr library failed to load'));
    document.head.appendChild(script);
  });
  return qrLibPromise;
}

function renderQr(container, text) {
  return loadQrLib().then(() => {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const img = document.createElement('img');
    img.src = qr.createDataURL(4, 8);
    img.alt = 'Download the Gliimu app';
    container.replaceChildren(img);
    container.parentElement.style.display = 'flex';
  });
}

function applyDownloadSection(settings) {
  const panel = document.getElementById('download-panel');
  if (!panel) return;

  const bg = safeUrl(settings.app_download_bg_url);
  if (bg) {
    panel.style.backgroundImage = `url('${bg}')`;
    panel.style.backgroundSize = 'cover';
    panel.style.backgroundPosition = 'center';
  }

  const versionEl = document.getElementById('dl-version');
  if (versionEl && settings.app_version) versionEl.textContent = settings.app_version;

  const notesEl = document.getElementById('dl-notes');
  if (notesEl && settings.app_version_notes) notesEl.textContent = settings.app_version_notes;

  const targets = [
    ['dl-windows', settings.app_windows_url],
    ['dl-mac', settings.app_mac_url],
    ['dl-linux', settings.app_linux_url],
    ['dl-android', settings.app_android_url],
    ['dl-ios', settings.app_ios_url],
  ];

  targets.forEach(([id, raw]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const href = safeUrl(raw);
    if (href) {
      el.href = href;
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

  renderQr(document.getElementById('dl-qr'), qrTarget).catch(() => {
    qrWrap.style.display = 'none';
  });
}

// ============================================
// FETCH CURRICULUM
// ============================================
async function loadCurriculum() {
  const container = document.getElementById('curriculum-container');
  if (!container) return;

  const { data: courses, error } = await supabase.from('curriculum').select('*').order('created_at', { ascending: true });

  if (error || !courses) return;

  container.innerHTML = courses.map((course, index) => `
    <div class="accordion-item reveal" style="transition-delay: ${0.1 * (index + 1)}s;">
      <div class="accordion-header">
        <div class="accordion-number">${escapeHtml(course.number)}</div>
        <div class="accordion-icon"><i class="${escapeHtml(course.icon)}"></i></div>
        <h3>${escapeHtml(course.title)}</h3>
        <i class="fas fa-chevron-down accordion-arrow"></i>
      </div>
      <div class="accordion-content">
        <p>${escapeHtml(course.description)}</p>
        <ul>
          ${(course.modules || []).map(m => `<li>${escapeHtml(m)}</li>`).join('')}
        </ul>
      </div>
    </div>
  `).join('');

  initAccordion(); // Re-init click listeners for new items
  initScrollReveal(); // Observe new items for animation
}

// ============================================
// FETCH CONTACT INFO
// ============================================
async function loadContactInfo() {
  const { data, error } = await supabase.from('contact_info').select('*').single();
  if (error || !data) return;

  const address = document.getElementById('contact-address');
  if (address) address.innerHTML = data.address;

  const phone = document.getElementById('contact-phone');
  if (phone) phone.innerText = data.phone;

  const phoneLink = document.getElementById('contact-phone-link');
  if (phoneLink && data.phone) phoneLink.href = `tel:${String(data.phone).replace(/\s/g, '')}`;

  const email = document.getElementById('contact-email');
  if (email) email.innerText = data.email;

  const emailLink = document.getElementById('contact-email-link');
  if (emailLink && data.email) emailLink.href = `mailto:${data.email}`;

  const socials = [
    ['social-yt', data.youtube],
    ['social-tt', data.tiktok],
    ['social-fb', data.facebook],
    ['social-pt', data.pinterest],
  ];
  socials.forEach(([id, raw]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const href = safeUrl(raw);
    if (href) el.href = href;
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
// FETCH LATEST ON GLIIMU (1 Hub + 1 Library + 1 Deal)
// ============================================
async function loadHubHighlights() {
  const grid = document.getElementById('hub-grid');
  if (!grid) return;

  // Fetch 1 Hub Post
  const { data: hubPosts } = await supabase
    .from('public_hub_posts')
    .select('content, media_url, media_type, created_at, username, full_name, avatar_url')
    .order('created_at', { ascending: false })
    .limit(1);

  // Fetch 1 Library Item
  const { data: libItems } = await supabase
    .from('library_items')
    .select('title, created_at, cover_color, cover_url')
    .order('created_at', { ascending: false })
    .limit(1);

  // Fetch 1 open deal from the Requests page queue
  const { data: deals } = await supabase
    .from('deals')
    .select('job_description, deal_type, company_name, company_logo_url, created_at, profiles:profiles!deals_user_id_fkey(full_name, avatar_url)')
    .in('status', ['queued', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1);

  let combined = [];

  if (hubPosts && hubPosts.length > 0) {
    hubPosts.forEach(p => combined.push({ type: 'hub', data: p }));
  }
  if (libItems && libItems.length > 0) {
    libItems.forEach(l => combined.push({ type: 'library', data: l }));
  }
  if (deals && deals.length > 0) {
    deals.forEach(d => combined.push({ type: 'deal', data: d }));
  }

  if (combined.length === 0) {
    grid.innerHTML = '<p style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">Be the first to post in the Hub!</p>';
    return;
  }

  // Sort by created_at descending
  combined.sort((a, b) => new Date(b.data.created_at) - new Date(a.data.created_at));

  // Slice to 3 just in case
  combined = combined.slice(0, 3);

  grid.innerHTML = combined.map(item => {
    if (item.type === 'hub') {
      const post = item.data;
      const media = safeUrl(post.media_url);
      const mediaHtml = media ? (
        post.media_type === 'image'
          ? `<img src="${media}" alt="" style="width:100%; border-radius: 8px; margin-top: 12px; max-height: 200px; object-fit: cover;">`
          : `<video src="${media}" style="width:100%; border-radius: 8px; margin-top: 12px; max-height: 200px; object-fit: cover;" controls></video>`
      ) : '';
      const avatar = safeUrl(post.avatar_url);

      return `
        <div class="hub-card reveal" style="transition-delay: 0.1s;">
          <div class="hub-card-meta">
            ${avatar
              ? `<img src="${avatar}" class="hub-card-avatar" style="object-fit:cover;" alt="">`
              : `<div class="hub-card-avatar"></div>`
            }
            <span class="hub-card-author">${escapeHtml(post.full_name || 'Gliimait')}</span>
          </div>
          <p class="hub-card-text clamp-4">${escapeHtml(post.content)}</p>
          ${mediaHtml}
        </div>
      `;
    } else if (item.type === 'library') {
      const lib = item.data;
      const cover = safeUrl(lib.cover_url);
      const bg = cover ? `background-image: url('${cover}'); background-size: cover;` : `background: ${escapeHtml(lib.cover_color || '#4f46e5')};`;
      return `
        <div class="hub-card reveal" style="transition-delay: 0.2s;">
          <div class="hub-card-meta">
            <div class="hub-card-avatar" style="background: var(--gradient-primary); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">L</div>
            <span class="hub-card-author">New in Library</span>
          </div>
          <div class="lib-highlight-thumb" style="height: 120px; border-radius: 8px; margin-bottom: 12px; ${bg}"></div>
          <p class="hub-card-text" style="font-weight: 600;">${escapeHtml(lib.title)}</p>
        </div>
      `;
    } else if (item.type === 'deal') {
      const deal = item.data;
      const isCorporate = deal.deal_type === 'corporate';
      const logo = isCorporate
        ? safeUrl(deal.company_logo_url)
        : safeUrl(deal.profiles && deal.profiles.avatar_url);
      const name = isCorporate
        ? (deal.company_name || 'A Partner')
        : ((deal.profiles && deal.profiles.full_name) || 'A Gliimait');

      return `
        <div class="hub-card reveal" style="transition-delay: 0.3s;">
          <div class="hub-card-meta">
            ${logo
              ? `<img src="${logo}" class="hub-card-avatar" style="object-fit:cover;" alt="">`
              : `<div class="hub-card-avatar" style="background: linear-gradient(135deg, #10b981, #0ea5e9); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">D</div>`
            }
            <span class="hub-card-author">${escapeHtml(name)}</span>
          </div>
          <p class="hub-card-text clamp-4">${escapeHtml(deal.job_description)}</p>
          <p class="hub-card-text" style="color: var(--text-muted); font-size: 13px; margin-top: 6px;">
            ${isCorporate ? 'Corporate' : 'Personal'} deal &middot; up for grabs
          </p>
        </div>
      `;
    }
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
// FETCH FAQS
// ============================================
const FALLBACK_FAQS = [
  {
    question: 'How much is the tuition?',
    answer: 'Tuition is subscription-based, ranging from 70k to 780k depending on your preferred plan. For more details, please visit the "Billing" section in your dashboard.'
  },
  {
    question: 'Why is the tuition priced at this level?',
    answer: 'To use an analogy, a bottle of water costs less from a street vendor than it does in a first-class cabin. The price of our program is not meant to deter you, but rather to reflect a shift in mindset. If you are truly committed, you have what it takes to invest in premium, transformative value.'
  },
  {
    question: 'How can I pay for my tuition?',
    answer: 'You can pay your tuition through real projects with real clients. Additionally, we offer sponsored programs from time to time that can help you clear your balance faster than you might expect.'
  },
  {
    question: 'Can I earn money through Gliimu?',
    answer: 'Yes. You can earn through Gliimu, and withdrawal requests are processed within 24 hours. Please note, however, that you must have fully cleared your outstanding tuition before withdrawing your earnings.'
  },
  {
    question: 'What exactly is a Full Stack Media Architect?',
    answer: "A Full Stack Media Architect is a creator who has mastered content creation, brand design, and programming. You don't just edit videos or write code; you build entire media empires from scratch."
  },
  {
    question: 'Do I need any prior experience?',
    answer: 'No. We train elite minds from the ground up. Our Triad system ensures you learn at your own pace without holding others back.'
  },
  {
    question: 'How long does it take to graduate?',
    answer: 'The program is untimed. You graduate once you demonstrate competence through practical work, which can take as little as two months or up to a year.'
  }
];

async function loadFAQs() {
  const container = document.getElementById('faq-accordion-container');
  if (!container) return;

  const { data: faqs, error } = await supabase.from('faqs').select('question, answer').order('created_at', { ascending: true });

  const list = (error || !faqs || faqs.length === 0) ? FALLBACK_FAQS : faqs;

  container.innerHTML = list.map(faq => `
    <div class="faq-acc-item">
      <div class="faq-acc-header" onclick="toggleFAQ(this)">
        <h4>${escapeHtml(faq.question)}</h4>
        <i class="fas fa-chevron-down"></i>
      </div>
      <div class="faq-acc-content">
        <p>${escapeHtml(faq.answer)}</p>
      </div>
    </div>
  `).join('');
}

// ============================================
// INITIALIZE
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  if (await redirectIfAuthenticated()) return;
  initStickyNav();
  initScrollReveal();
  initAccordion();
  loadSiteSettings();
  loadCurriculum();
  loadContactInfo();
  loadHubHighlights();
  loadPartners();
  loadFAQs();
  forceVideoAutoplay();
});
