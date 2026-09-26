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
// FETCH HERO STATS (With Count-Up Animation)
// ============================================
async function loadHeroStats() {
  const updatesEl = document.getElementById('stat-updates');
  const usersEl = document.getElementById('stat-users');
  if (!updatesEl) return;

  const { data, error } = await supabase.from('public_stats').select('*').single();

  if (data) {
    const targetUsers = data.users || 0;
    const targetUpdates = data.updates || 0;

    // Animate the numbers counting up
    animateValue(usersEl, 0, targetUsers, 1500);
    animateValue(updatesEl, 0, targetUpdates, 1500);
  }
}

// Helper function for the count-up animation
function animateValue(element, start, end, duration) {
  const range = end - start;
  let current = start;
  const increment = end > 0 ? Math.ceil(range / (duration / 16)) : 0; // 16ms is roughly 60fps
  const stepTime = 16;

  const timer = setInterval(() => {
    current += increment;
    if (current >= end) {
      current = end;
      clearInterval(timer);
    }
    element.innerText = current.toLocaleString();
  }, stepTime);
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
// FETCH HUB HIGHLIGHTS
// ============================================
async function loadHubHighlights() {
  const grid = document.getElementById('hub-grid');
  if (!grid) return;

  const { data: posts, error } = await supabase
    .from('public_hub_posts')
    .select('content, media_url, media_type, created_at, username, full_name, avatar_url')
    .order('created_at', { ascending: false })
    .limit(3);

  if (error || !posts || posts.length === 0) {
    grid.innerHTML = '<p style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">Be the first to post in the Hub!</p>';
    return;
  }

  grid.innerHTML = posts.map(post => {
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
  }).join('');

  initScrollReveal();
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
  loadHeroStats();
  loadHubHighlights();
  loadFAQs();
  forceVideoAutoplay();
});
