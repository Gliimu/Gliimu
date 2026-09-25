import { supabase } from '/shared/js/config.js';

// ============================================
// ACCORDION LOGIC
// ============================================
function initAccordion() {
  const accordionItems = document.querySelectorAll('.accordion-item');

  // Ensure all are closed initially
  accordionItems.forEach(item => item.classList.remove('active'));

  accordionItems.forEach(item => {
    const header = item.querySelector('.accordion-header');
    header.addEventListener('click', () => {
      // Close others
      accordionItems.forEach(other => {
        if (other !== item && other.classList.contains('active')) {
          other.classList.remove('active');
        }
      });
      // Toggle current
      item.classList.toggle('active');
    });
  });
}

// ============================================
// HUB HIGHLIGHTS FETCH
// ============================================
async function loadHubHighlights() {
  const grid = document.getElementById('hub-grid');
  if (!grid) return;

  const { data: posts, error } = await supabase
    .from('posts')
    .select('content, created_at, profiles:profiles!user_id(username, full_name, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(3);

  if (error || !posts || posts.length === 0) {
    grid.innerHTML = '<p style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">Be the first to post in the Hub!</p>';
    return;
  }

  grid.innerHTML = posts.map(post => `
    <div class="hub-card">
      <div class="hub-card-meta">
        ${post.profiles?.avatar_url
          ? `<img src="${post.profiles.avatar_url}" class="hub-card-avatar" style="object-fit:cover;">`
          : `<div class="hub-card-avatar"></div>`
        }
        <span class="hub-card-author">${post.profiles?.full_name || 'Gliimait'}</span>
      </div>
      <p class="hub-card-text">${post.content}</p>
    </div>
  `).join('');
}

// ============================================
// INITIALIZE
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initAccordion();
  loadHubHighlights();
});
