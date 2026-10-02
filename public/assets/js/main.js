import { supabase } from '/shared/js/config.js';

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
    header.addEventListener('click', () => {
      accordionItems.forEach(other => {
        if (other !== item && other.classList.contains('active')) other.classList.remove('active');
      });
      item.classList.toggle('active');
    });
  });
}

// ============================================
// FETCH SITE SETTINGS (Video, Image, Earn Graphic)
// ============================================
async function loadSiteSettings() {
  const { data, error } = await supabase.from('site_settings').select('*').single();
  if (data) {
    // Hero Video
    document.getElementById('hero-video-src').src = data.hero_video_url;

    // Hero Fallback Image (Set as background of the section just in case)
    const heroSection = document.getElementById('hero-section');
    if (heroSection && data.hero_fallback_image_url) {
      heroSection.style.backgroundImage = `url('${data.hero_fallback_image_url}')`;
      heroSection.style.backgroundSize = 'cover';
      heroSection.style.backgroundPosition = 'center';
    }

    // Squad Background
    const squadSection = document.getElementById('squad-section');
    squadSection.style.background = `linear-gradient(to right, rgba(10, 15, 30, 0.95), rgba(10, 15, 30, 0.85)), url('${data.squad_bg_url}')`;
    squadSection.style.backgroundSize = 'cover';
    squadSection.style.backgroundPosition = 'center';

    // Earn Graphic Image
    const earnGraphic = document.getElementById('earn-graphic-container');
    if (earnGraphic && data.earnings_image_url) {
      earnGraphic.innerHTML = `<img src="${data.earnings_image_url}" alt="Earnings" class="earn-icon-img"><div class="earn-pulse"></div>`;
    }
  }
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
        <div class="accordion-number">${course.number}</div>
        <div class="accordion-icon"><i class="${course.icon}"></i></div>
        <h3>${course.title}</h3>
        <i class="fas fa-chevron-down accordion-arrow"></i>
      </div>
      <div class="accordion-content">
        <p>${course.description}</p>
        <ul>
          ${course.modules.map(m => `<li>${m}</li>`).join('')}
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

  document.getElementById('contact-address').innerHTML = data.address;
  document.getElementById('contact-phone').innerText = data.phone;
  document.getElementById('contact-phone-link').href = `tel:${data.phone.replace(/\s/g, '')}`;
  document.getElementById('contact-email').innerText = data.email;
  document.getElementById('contact-email-link').href = `mailto:${data.email}`;

  document.getElementById('social-yt').href = data.youtube || '#';
  document.getElementById('social-tt').href = data.tiktok || '#';
  document.getElementById('social-fb').href = data.facebook || '#';
  document.getElementById('social-pt').href = data.pinterest || '#';
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
// FETCH LATEST ON GLIIMU (2 Hub + 1 Library)
// ============================================
async function loadHubHighlights() {
  const grid = document.getElementById('hub-grid');
  if (!grid) return;

  // Fetch 2 Hub Posts
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
    .limit(2);

  let combined = [];

  if (hubPosts && hubPosts.length > 0) {
    hubPosts.forEach(p => combined.push({ type: 'hub', data: p }));
  }
  if (libItems && libItems.length > 0) {
    libItems.forEach(l => combined.push({ type: 'library', data: l }));
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
      const mediaHtml = post.media_url ? (
        post.media_type === 'image'
          ? `<img src="${post.media_url}" style="width:100%; border-radius: 8px; margin-top: 12px; max-height: 200px; object-fit: cover;">`
          : `<video src="${post.media_url}" style="width:100%; border-radius: 8px; margin-top: 12px; max-height: 200px; object-fit: cover;" controls></video>`
      ) : '';

      return `
        <div class="hub-card reveal" style="transition-delay: 0.1s;">
          <div class="hub-card-meta">
            ${post.avatar_url
              ? `<img src="${post.avatar_url}" class="hub-card-avatar" style="object-fit:cover;">`
              : `<div class="hub-card-avatar"></div>`
            }
            <span class="hub-card-author">${post.full_name || 'Gliimait'}</span>
          </div>
          <p class="hub-card-text">${post.content}</p>
          ${mediaHtml}
        </div>
      `;
    } else if (item.type === 'library') {
      const lib = item.data;
      const bg = lib.cover_url ? `background-image: url('${lib.cover_url}'); background-size: cover;` : `background: ${lib.cover_color || '#4f46e5'};`;
      return `
        <div class="hub-card reveal" style="transition-delay: 0.2s;">
          <div class="hub-card-meta">
            <div class="hub-card-avatar" style="background: var(--gradient-primary); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">L</div>
            <span class="hub-card-author">New in Library</span>
          </div>
          <div class="lib-highlight-thumb" style="height: 120px; border-radius: 8px; margin-bottom: 12px; ${bg}"></div>
          <p class="hub-card-text" style="font-weight: 600;">${lib.title}</p>
        </div>
      `;
    }
  }).join('');

  initScrollReveal();
}

// ============================================
// FETCH PARTNERS
// ============================================
async function loadPartners() {
  const marqueeContent = document.querySelector('.marquee-content');
  if (!marqueeContent) return;

  const { data: partners, error } = await supabase.from('partners').select('name, logo_url');

  if (error || !partners || partners.length === 0) return;

  // Duplicate the array to create a seamless loop
  const loopPartners = [...partners, ...partners];

  marqueeContent.innerHTML = loopPartners.map(p => `
    <span class="partner-logo">
      <img src="${p.logo_url}" alt="${p.name}" style="height: 40px; width: auto; max-width: 120px; object-fit: contain; opacity: 0.6; transition: opacity 0.3s ease;">
    </span>
  `).join('');
}

// ============================================
// FETCH FAQS
// ============================================
async function loadFAQs() {
  const container = document.getElementById('faq-accordion-container');
  if (!container) return;

  const { data: faqs, error } = await supabase.from('faqs').select('question, answer').order('created_at', { ascending: true });

  if (error || !faqs || faqs.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No FAQs available at the moment.</p>';
    return;
  }

  container.innerHTML = faqs.map(faq => `
    <div class="faq-acc-item">
      <div class="faq-acc-header" onclick="toggleFAQ(this)">
        <h4>${faq.question}</h4>
        <i class="fas fa-chevron-down"></i>
      </div>
      <div class="faq-acc-content">
        <p>${faq.answer}</p>
      </div>
    </div>
  `).join('');
}

// ============================================
// INITIALIZE
// ============================================
document.addEventListener('DOMContentLoaded', () => {
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
