import { store } from './store.js';
import { router } from './router.js';
import { supabase } from '/shared/js/config.js';

// ============================================
// GLOBAL NOTIFICATION MANAGER
// ============================================
const NotificationManager = {
  counts: {
    ping: 0,
    settings: 0
  },

  updateBadge(tabName, count) {
    const navItem = document.querySelector(`.nav-item[data-route="${tabName}"]`);
    if (!navItem) return;

    let badge = navItem.querySelector('.nav-badge');

    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        navItem.appendChild(badge);
      }
      badge.innerText = count > 9 ? '9+' : count;
    } else {
      if (badge) badge.remove();
    }
  },

  async fetchInitialCounts() {
    // Ping (Unread DMs)
    const { count: pingCount } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', store.user.id).is('read_at', null);
    this.counts.ping = pingCount || 0;
    this.updateBadge('ping', this.counts.ping);

    // Settings (App Version - Placeholder logic)
    // For now, we'll just set it to 0. You can change this to 1 when you deploy a new version.
    this.counts.settings = 0;
    this.updateBadge('settings', this.counts.settings);
  },

  initRealtimeListeners() {
    // Listen for new DMs
    supabase.channel('app-global-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        if (payload.new.receiver_id === store.user.id && !payload.new.read_at) {
          this.counts.ping++;
          this.updateBadge('ping', this.counts.ping);
        }
      }).subscribe();
  }
};

// ============================================
// MOBILE SIDEBAR AUTO-CLOSE
// ============================================
function initSidebarAutoClose() {
  document.addEventListener('click', (e) => {
    const body = document.body;
    // Only on mobile
    if (window.innerWidth > 768) return;

    // If sidebar is open
    if (!body.classList.contains('sidebar-open')) return;

    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.querySelector('.menu-toggle');

    // If the click is outside the sidebar and not on the toggle button
    if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
      body.classList.remove('sidebar-open');
    }
  });
}

// ============================================
// APP INITIALIZATION
// ============================================
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

  // Initialize Notifications
  await NotificationManager.fetchInitialCounts();
  NotificationManager.initRealtimeListeners();
  initSidebarAutoClose();

  window.addEventListener('hashchange', router);
  router();
}

initApp();
