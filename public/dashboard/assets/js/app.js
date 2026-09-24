import { store } from './store.js';
import { router } from './router.js';

async function initApp() {
  // 1. Auth Guard: Check if user is logged in
  const user = await store.fetchUser();

  if (!user) {
    // Redirect to login if not authenticated
    window.location.href = '/auth.html';
    return;
  }

  // 2. Update UI with user data
  document.getElementById('user-name').innerText = store.profile.username;
  document.getElementById('user-avatar').innerText = store.profile.username.charAt(0).toUpperCase();

  // 3. Initialize Router
  window.addEventListener('hashchange', router);
  router(); // Trigger initial route
}

initApp();
