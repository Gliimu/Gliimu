import { store } from './store.js';
import { router } from './router.js';
import { supabase } from '/shared/js/config.js';

// ============================================
// GLOBAL NOTIFICATION MANAGER
// ============================================
const NotificationManager = {
  counts: {
    ping: 0,
    hub: 0,
    library: 0,
    wallet: 0,
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

    // Wallet (Subscription Expiry <= 3 days)
    const { data: profile } = await supabase.from('profiles').select('subscription_expires_at').eq('id', store.user.id).single();
    if (profile?.subscription_expires_at) {
      const daysLeft = Math.ceil((new Date(profile.subscription_expires_at) - new Date()) / (1000 * 60 * 60 * 24);
      if (daysLeft <= 3 && daysLeft >= 0) {
        this.counts.wallet = 1;
        this.updateBadge('wallet', this.counts.wallet);
    }

    // Settings (App Version)
    // We can set this to 1 if a new version is deployed
    // this.counts.settings = 1;
    // this.updateBadge('settings', this.counts.settings);
  }

  initRealtimeListeners() {
    // Listen for new DMs
    supabase.channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        if (payload.new.receiver_id === store.user.id && !payload.new.read_at) {
          this.counts.ping++;
          this.updateBadge('ping', this.counts.ping);
        }
      }).subscribe();
  }
};

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
    }
  }

  if (store.profile.total_gp >= 1000) {
    document.getElementById('user-tick').style.display = 'flex';
    document.getElementById('user-tick-inline').style.display = 'inline-block';
  }

  // Initialize Notifications
  await NotificationManager.fetchInitialCounts();
  NotificationManager.initRealtimeListeners();

  window.addEventListener('hashchange', router);
  router(); // Trigger initial route
}

initApp();
