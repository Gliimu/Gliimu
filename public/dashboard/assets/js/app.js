import { store } from './store.js';
import { router } from './router.js';
import { supabase } from '/shared/js/config.js';

async function initApp() {
  const user = await store.fetchUser();

  if (!user) {
    window.location.href = '/auth.html';
    return;
  }

  document.getElementById('user-name').innerText = store.profile.username;

  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url, total_gp')
    .eq('id', store.user.id)
    .single();

  if (profile && profile.avatar_url) {
    document.getElementById('user-avatar').src = profile.avatar_url;
  }

  // Show Elite Star if >= 1000 GP
  if (profile && profile.total_gp >= 1000) {
    document.getElementById('user-star').style.display = 'flex';
  }

  window.addEventListener('hashchange', router);
  router();
}

initApp();
