import { supabase } from '/shared/js/config.js';

// Accordion Logic
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

// Fetch Hero Stats
async function loadHeroStats() {
  const updatesEl = document.getElementById('stat-updates');
  const usersEl = document.getElementById('stat-users');
  if (!updatesEl) return;

  const { data, error } = await supabase.from('public_stats').select('*').single();

  if (data) {
    usersEl.innerText = data.users || 0;
    updatesEl.innerText = data.updates || 0;
  }
}

// Fetch Hub Highlights
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
      <div class="hub-card">
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
}

// Fetch FAQs
async function loadFAQs() {
  const container = document.getElementById('faq-accordion-container');
  if (!container) return;

  const { data: faqs, error } = await supabase
    .from('faqs')
    .select('question, answer')
    .order('created_at', { ascending: true });

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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initAccordion();
  loadHeroStats();
  loadHubHighlights();
  loadFAQs();
});
