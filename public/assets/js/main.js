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
  const earningsEl = document.getElementById('stat-earnings');
  const updatesEl = document.getElementById('stat-updates');
  const usersEl = document.getElementById('stat-users');
  if (!earningsEl) return;

  const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  const { count: postCount } = await supabase.from('posts').select('*', { count: 'exact', head: true });
  const { data: txns } = await supabase.from('transactions').select('amount').eq('type', 'purchase');

  let totalEarnings = 0;
  if (txns) txns.forEach(t => totalEarnings += Math.abs(t.amount));

  usersEl.innerText = userCount || 0;
  updatesEl.innerText = postCount || 0;
  earningsEl.innerText = `₦${totalEarnings.toLocaleString()}`;
}

// Fetch Hub Highlights
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initAccordion();
  loadHeroStats();
  loadHubHighlights();
});
