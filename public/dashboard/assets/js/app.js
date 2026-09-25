import { store } from './store.js';
import { router } from './router.js';
import { supabase } from '/shared/js/config.js';

async function initApp() {
  // 1. Auth Guard: Check if user is logged in
  const user = await store.fetchUser();

  if (!user) {
    window.location.href = '/auth.html';
    return;
  }

  // 2. Update UI with user data
  document.getElementById('user-name').innerText = store.profile.username;

  // Fetch profile to get avatar
  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', store.user.id)
    .single();

  if (profile && profile.avatar_url) {
    document.getElementById('user-avatar').src = profile.avatar_url;
  }

  // 3. Initialize Router
  window.addEventListener('hashchange', router);
  router(); // Trigger initial route
}

initApp();
