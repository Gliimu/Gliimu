import { store } from './store.js';
import { router } from './router.js';

async function initApp() {
  const user = await store.fetchUser();
  if (!user) {
    window.location.href = '/auth.html';
    return;
  }

  document.getElementById('user-name').innerText = store.profile.username;

  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) {
    if (store.profile.avatar_url) {
      avatarEl.src = store.profile.avatar_url;
    } else {
      avatarEl.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23F1F5F9'/%3E%3C/svg%3E`;
    }

    // Add Glowing Gold Border if >= 1000 GP
    if (store.profile.total_gp >= 1000) {
      avatarEl.classList.add('glow-avatar');
    }
  }

  window.addEventListener('hashchange', router);
  router();
}

initApp();
