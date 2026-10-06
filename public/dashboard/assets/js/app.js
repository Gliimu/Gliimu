import { store } from './store.js';
import { router } from './router.js';
import { supabase } from '/shared/js/config.js';
import { computeUnread } from './readState.js';

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
    // Ping (Unread DMs) — DMs only; live-room and AI messages are not pings
    const { data: received } = await supabase.from('messages').select('sender_id, created_at, read_at, room, is_ai').eq('receiver_id', store.user.id);
    const dms = (received || []).filter(m => !m.room && !m.is_ai);
    const { total } = computeUnread(store.user.id, dms);
    this.counts.ping = total;
    this.updateBadge('ping', total);

    // Settings (App Version - Placeholder logic)
    // For now, we'll just set it to 0. You can change this to 1 when you deploy a new version.
    this.counts.settings = 0;
    this.updateBadge('settings', this.counts.settings);
  },

  initRealtimeListeners() {
    // Listen for new DMs
    supabase.channel('app-global-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new;
        if (m.receiver_id === store.user.id && !m.read_at && !m.room && !m.is_ai) {
          this.counts.ping++;
          this.updateBadge('ping', this.counts.ping);
        }
      }).subscribe();
  }
};

// ============================================
// PRESENCE — which Gliimaits are online right now.
// Live sessions are only visible while their owner is online.
// ============================================
const Presence = {
  onlineIds: new Set(),
  channel: null,

  init() {
    if (!store.user?.id || this.channel) return;
    const ch = supabase.channel('online-gliimaits', { config: { presence: { key: store.user.id } } });
    ch
      .on('presence', { event: 'sync' }, () => {
        this.onlineIds = new Set(Object.keys(ch.presenceState()));
        window.dispatchEvent(new CustomEvent('presence-changed'));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') ch.track({ online_at: new Date().toISOString() });
      });
    this.channel = ch;
  },

  isOnline(id) {
    return this.onlineIds.has(id);
  }
};

// ============================================
// GP TIERS — sidebar avatar border + 100 GP eligibility alert.
// 1000+ purple border, 5000+ black/white (ambassador). A light
// poll keeps the border and the one-time 100 GP alert current
// without a full page reload.
// ============================================
const TIER_100_KEY = 'gliimu_tier_100_alerted';

function applyAvatarTier() {
  const avatarEl = document.getElementById('user-avatar');
  if (!avatarEl) return;
  avatarEl.classList.remove('glow-avatar', 'tier-5000-avatar');
  const gp = store.profile.total_gp || 0;
  if (gp >= 5000) avatarEl.classList.add('tier-5000-avatar');
  else if (gp >= 1000) avatarEl.classList.add('glow-avatar');
}

async function checkGpTiers() {
  const { data: profile } = await supabase.from('profiles').select('total_gp').eq('id', store.user.id).single();
  if (!profile) return;
  const prev = store.profile.total_gp || 0;
  const next = profile.total_gp || 0;
  store.profile.total_gp = next;

  if (next >= 100 && !localStorage.getItem(TIER_100_KEY)) {
    localStorage.setItem(TIER_100_KEY, '1');
    if (prev < 100) {
      alert('You now have 100 GP! You are now eligible to post contents and request live sessions in Gliimu.');
    }
  }
  applyAvatarTier();
}

// ============================================
// MOBILE SIDEBAR AUTO-CLOSE
// ============================================
function initSidebarAutoClose() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // Navigating from the sidebar (nav link or avatar) slides it away immediately
  sidebar.addEventListener('click', (e) => {
    if (window.innerWidth > 768) return;
    if (e.target.closest('.nav-item') || e.target.closest('.user-card')) {
      document.body.classList.remove('sidebar-open');
      updateSidebarToggleIcon();
    }
  });

  // Tapping anywhere outside the drawer (and the hamburger) closes it
  document.addEventListener('click', (e) => {
    if (window.innerWidth > 768) return;
    if (!document.body.classList.contains('sidebar-open')) return;
    if (sidebar.contains(e.target) || e.target.closest('.menu-toggle')) return;
    document.body.classList.remove('sidebar-open');
    updateSidebarToggleIcon();
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

    // GP tier border on the sidebar avatar
    applyAvatarTier();
  }

  // Initialize Notifications
  await NotificationManager.fetchInitialCounts();
  NotificationManager.initRealtimeListeners();
  window.NotificationManager = NotificationManager;

  Presence.init();
  window.GliimuPresence = Presence;
  initSidebarAutoClose();

  setInterval(checkGpTiers, 45000);

  window.addEventListener('hashchange', router);
  router();
}

initApp();
