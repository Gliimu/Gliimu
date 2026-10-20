import { store } from './store.js';
import { router } from './router.js?v=36';
import { supabase } from '/shared/js/config.js';
import { computeUnread, latestIncomingUnread } from './readState.js?v=29';
import { notify } from './notify.js?v=31';
import { previewText } from './media.js';

// ============================================
// GLOBAL NOTIFICATION MANAGER
// ============================================
const NotificationManager = {
  counts: {
    ping: 0,
    support: 0,
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

    // Update favicon notification dot
    const hasNotifications = this.counts.ping > 0 || this.counts.support > 0;
    notify.faviconDot(hasNotifications);
  },

  async refreshUnread() {
    const request = this.unreadRequest = (this.unreadRequest || 0) + 1;
    const { data, error } = await supabase.from('messages')
      .select('sender_id, receiver_id, created_at, read_at, room, is_ai, is_admin, content, attachment_url, attachment_type')
      .eq('receiver_id', store.user.id);
    if (request !== this.unreadRequest) return;
    if (error) {
      console.warn('Could not refresh unread messages:', error.message);
      return;
    }
    const { total } = computeUnread(store.user.id, data);
    const previous = this.counts.ping;
    this.counts.ping = total;
    this.updateBadge('ping', total);
    // The first pass only seeds the baseline — old unread messages must not
    // ring the bell on every page load.
    if (this.pingCounted && total > previous) {
      const newest = latestIncomingUnread(store.user.id, data);
      if (newest) this.alertPing(newest);
    }
    this.pingCounted = true;
  },

  async alertPing(message) {
    const { data } = await supabase.from('profiles')
      .select('full_name').eq('id', message.sender_id).maybeSingle();
    const openChatId = window.pingInstance?.getActiveChat?.() || null;
    notify.message({
      title: data?.full_name || 'New ping',
      body: previewText(message) || 'Sent you a message',
      tag: `gliimu-ping-${message.sender_id}`,
      // No beep while they are reading that exact chat.
      sound: openChatId !== message.sender_id,
      desktop: document.hidden || !/^#\/(ping|live)/.test(window.location.hash)
    });
  },

  async refreshSupportUnread() {
    const request = this.supportRequest = (this.supportRequest || 0) + 1;
    const { data, error } = await supabase.rpc('support_thread_unread', { p_thread_user: store.user.id });
    if (request !== this.supportRequest) return;
    if (error) {
      // Expected until sql/support.sql has been run on this project.
      console.warn('Could not read the support unread count:', error.message);
      return;
    }
    this.counts.support = data || 0;
    this.updateBadge('support', this.counts.support);
  },

  // Staff replies arrive under the agent's own id, so the sender has to be
  // looked up before the alert can name them.
  async alertSupport(row) {
    // Escalations and the member's own messages never ring their own bell.
    const onSupport = /^#\/support/.test(window.location.hash) && !document.hidden;
    if (row.sender_id === store.user.id || onSupport) return;
    const { data } = await supabase.from('profiles')
      .select('full_name').eq('id', row.sender_id).maybeSingle();
    notify.message({
      title: data?.full_name || 'Team Gliimu',
      body: previewText(row) || 'Replied on the support desk',
      tag: 'gliimu-support',
      desktop: true
    });
  },

  async fetchInitialCounts() {
    await this.refreshUnread();
    await this.refreshSupportUnread();

    // Settings (App Version - Placeholder logic)
    // For now, we'll just set it to 0. You can change this to 1 when you deploy a new version.
    this.counts.settings = 0;
    this.updateBadge('settings', this.counts.settings);
  },

  initRealtimeListeners() {
    supabase.channel('app-global-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${store.user.id}` }, () => {
        this.refreshUnread();
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'support_messages',
        filter: `thread_user=eq.${store.user.id}`
      }, ({ new: row }) => {
        // Thread-keyed, not sender-keyed: every admin answers with their own id.
        this.alertSupport(row);
        this.refreshSupportUnread();
      }).subscribe(status => {
        if (status === 'SUBSCRIBED') {
          this.refreshUnread();
          this.refreshSupportUnread();
        }
      });
    window.addEventListener('gliimu-chat-read', () => this.refreshUnread());
    window.addEventListener('storage', (event) => {
      if (event.key === `gliimu_read_map_${store.user.id}`) this.refreshUnread();
    });
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

  // Referral attribution: if this browser arrived via someone's referral link,
  // attach this member to their referrer. apply_referral is idempotent, so it
  // is safe to attempt on every load until it returns a definitive answer.
  try {
    const ref = localStorage.getItem('gliimu_ref');
    if (ref) {
      const { data } = await supabase.rpc('apply_referral', { p_code: ref });
      if (data && (data.ok || data.code === 'INVALID_CODE' || data.code === 'SELF_REFERRAL')) {
        localStorage.removeItem('gliimu_ref');
      }
    }
  } catch (e) {}

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
  notify.init();
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
