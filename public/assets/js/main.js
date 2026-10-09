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
// The stored address is plain text with newlines, printed into a <p>. Everything
// is escaped first, so nothing a CRM admin typed can ever reach the parser, and
// then a bare <br> is put back for the older rows that already hold one. A stray
// "<" from a truncated tag stays escaped rather than being completed by the
// browser. Last, newlines become <br>.
function addressHtml(value) {
  return String(value == null ? '' : value)
    .replace(/</g, '&lt;')
    .replace(/&lt;br\s*\/?\s*>/gi, '<br>')
    .replace(/\n/g, '<br>');
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
  if (address) address.innerHTML = addressHtml(data.address);

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
// FETCH LATEST ON GLIIMU (1 Hub + 1 Library + Top Uploader)
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
      .select('content, media_url, media_type, created_at, username, full_name, avatar_url')
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('library_items')
      .select('title, type, created_at, cover_color, cover_url')
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
  if (top && top.full_name) {
    combined.push({ type: 'uploader', data: top });
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
            <span class="hub-card-author">${escapeHtml(post.full_name || 'Gliimait')}</span>
          </div>
          <p class="hub-card-text clamp-4">${escapeHtml(post.content)}</p>
          ${hubMediaHtml(post.media_url, post.media_type)}
        </div>
      `;
    } else if (item.type === 'library') {
      const lib = item.data;
      const cover = safeUrl(lib.cover_url);
      const bg = cover ? `background-image: url('${cover}'); background-size: cover;` : `background: ${escapeHtml(lib.cover_color || '#4f46e5')};`;
      return `
        <div class="hub-card reveal" style="transition-delay: ${delay}s;">
          <div class="hub-card-meta">
            <div class="hub-card-avatar" style="background: var(--gradient-primary); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">L</div>
            <span class="hub-card-author">New in Library</span>
          </div>
          <div class="lib-highlight-thumb" style="height: 120px; border-radius: 8px; margin-bottom: 12px; ${bg}"></div>
          <p class="hub-card-text" style="font-weight: 600;">${escapeHtml(lib.title)}</p>
        </div>
      `;
    }

    // Top uploader profile card
    const up = item.data;
    const avatar = safeUrl(up.avatar_url);
    return `
      <div class="hub-card reveal" style="transition-delay: ${delay}s;">
        <div class="hub-card-meta">
          ${avatar
            ? `<img src="${avatar}" class="hub-card-avatar" style="object-fit:cover;" alt="">`
            : `<div class="hub-card-avatar"></div>`
          }
          <span class="hub-card-author">Top Uploader</span>
        </div>
        <div style="display:flex; align-items:center; gap:14px; margin-top: 12px;">
          ${avatar
            ? `<img src="${avatar}" alt="" style="width:56px; height:56px; border-radius:50%; object-fit:cover;">`
            : `<div style="width:56px; height:56px; border-radius:50%; background: var(--gradient-primary); display:flex; align-items:center; justify-content:center; color:white; font-weight:700; font-size:20px;">${escapeHtml((up.full_name || 'G').charAt(0).toUpperCase())}</div>`
          }
          <div style="display:flex; flex-direction:column;">
            <span style="font-weight:700; font-size: var(--fs-md);">${escapeHtml(up.full_name)}</span>
            <span style="color: var(--text-muted); font-size: var(--fs-sm);">${Number(up.uploads) || 0} upload${Number(up.uploads) === 1 ? '' : 's'}</span>
          </div>
        </div>
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
// FETCH FAQS
// ============================================
const FALLBACK_FAQS = [
  {
    question: 'How much is the tuition?',
    answer: 'Tuition is subscription-based. The amount you pay depends on your usage and preferred plan, meaning some users may pay significantly less or more than others. For more details, please visit the "Billing" page in your dashboard.'
  },
  {
    question: 'Why is the tuition priced like this?',
    answer: "To use an analogy, a bottle of water costs less from a street vendor than it does in a first-class cabin, even though the contents are exactly the same. The price of our program is not meant to deter you, but rather to reflect a shift in mindset. Since everyone utilizes our resources differently, we designed a fair payment structure rather than forcing everyone to pay a flat rate for features they may not need or use."
  },
  {
    question: 'How can I pay for my tuition?',
    answer: 'The primary means of making payment for your tuition or subscription is via transfer. You can also pay through real projects with real clients, and we offer sponsored programs from time to time that can help you clear your balance faster than you might expect.'
  },
  {
    question: 'Can I earn money through Gliimu?',
    answer: 'Yes. You can earn through Gliimu, and withdrawal requests are processed within 24 hours. Please note, however, that you must have fully cleared your outstanding tuition before withdrawing your earnings.'
  },
  {
    question: 'What exactly is a Full Stack Media Architect?',
    answer: "A Full Stack Media Architect is a creator who can generate value from scratch. They have mastered content creation, brand design, and idea visualization, alongside technical skills like programming and AI-prompt engineering. You don't just edit videos or write code; you learn to build concepts from zero."
  },
  {
    question: 'Do I need any prior experience?',
    answer: 'No. We train elite minds from the ground up. Our Triad system ensures you learn at your own pace without holding others back.'
  },
  {
    question: 'How long does it take to graduate?',
    answer: 'The program is untimed. You get certified once you demonstrate competence through practical work. The timeline depends entirely on your zeal and effort—it can take as little as two months or up to a year.'
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
  initJoinButtons();
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
