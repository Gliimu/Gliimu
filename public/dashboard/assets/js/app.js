import { store } from './store.js';
import { router } from './router.js';

async function initApp() {
  // 1. Auth Guard: Check if user is logged in
  const user = await store.fetchUser();

  if (!user) {
    window.location.href = '/auth.html';
    return;
  }

  // 2. Update UI with user data
  document.getElementById('user-name').innerText = store.profile.username;

  // Fix 1: Set the avatar image source (and fallback to a placeholder if none)
  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) {
    if (store.profile.avatar_url) {
      avatarEl.src = store.profile.avatar_url;
      avatarEl.style.display = 'block'; // Ensure it's visible
    } else {
      // Fallback if user hasn't uploaded a picture yet
      avatarEl.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23F1F5F9'/%3E%3C/svg%3E`;
    }
  }

  // Fix 2: Show Elite Star if user has 1000 or more GP
  const starEl = document.getElementById('user-star');
  if (starEl && store.profile.total_gp >= 1000) {
    starEl.style.display = 'flex';
  }

  // 3. Initialize Router
  window.addEventListener('hashchange', router);
  router(); // Trigger initial route
}

initApp();
