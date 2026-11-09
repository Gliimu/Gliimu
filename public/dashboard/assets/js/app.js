import { store } from './store.js?v=2';
import { router } from './router.js?v=212';
import { initPullToRefresh } from './pull-to-refresh.js?v=11';
import { supabase } from '/shared/js/config.js';
import { computeUnread, latestIncomingUnread } from './readState.js?v=29';
import { notify } from './notify.js?v=33';
import { previewText } from './media.js?v=4';
import { initAccountMenu } from './account-menu.js?v=4';

// ============================================
// GLOBAL NOTIFICATION MANAGER
// ============================================
const NotificationManager = {
  counts: {
    ping: 0,
    support: 0,
    alerts: 0
  },

  // Unread state is a dot, never a number: alerts ride the profile avatar, so
  // the same name can light up the avatar and the Alerts row inside its menu.
  updateBadge(tabName, count) {
    this.counts[tabName] = count;
    document.querySelectorAll(`.unread-dot[data-dot="${tabName}"]`).forEach(dot => {
      dot.hidden = !(count > 0);
    });
    this.refreshAnyDot();

    // Update favicon notification dot
    const hasNotifications = this.counts.ping > 0 || this.counts.support > 0 || this.counts.alerts > 0;
    notify.faviconDot(hasNotifications);
  },

  // The avatar is the only way to reach Ping and Alerts now, so it carries one
  // combined dot instead of three separate ones.
  refreshAnyDot() {
    const pending = this.counts.ping + this.counts.support + this.counts.alerts > 0;
    document.querySelectorAll('.unread-dot[data-dot="any"]').forEach(dot => { dot.hidden = !pending; });
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

  // Unread notifications (tags, mentions, review results, live joins) badge
  // the sidebar Alerts tab. Expected to fail until sql/notifications.sql runs.
  async refreshAlertsUnread() {
    const request = this.alertsRequest = (this.alertsRequest || 0) + 1;
    const { count, error } = await supabase.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', store.user.id)
      .filter('read_at', 'is', null);
    if (request !== this.alertsRequest) return;
    if (error) {
      console.warn('Could not read the alerts unread count:', error.message);
      return;
    }
    this.counts.alerts = count || 0;
    this.updateBadge('alerts', this.counts.alerts);
  },

  async alertNotification(row) {
    const onAlerts = /^#\/alerts/.test(window.location.hash) && !document.hidden;
    if (onAlerts) return;
    notify.message({
      title: 'New alert',
      body: row.title || 'You have a new notification',
      tag: `gliimu-alert-${row.id}`,
      desktop: document.hidden
    });
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
    await this.refreshAlertsUnread();
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
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${store.user.id}`
      }, ({ new: row }) => {
        this.alertNotification(row);
        this.refreshAlertsUnread();
      }).subscribe(status => {
        if (status === 'SUBSCRIBED') {
          this.refreshUnread();
          this.refreshSupportUnread();
          this.refreshAlertsUnread();
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
// GP ELIGIBILITY — the one-time 100 GP alert. A light
// poll keeps the cached total current without a reload.
// ============================================
const TIER_100_KEY = 'gliimu_tier_100_alerted';

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
}

// ============================================
// SIDEBAR AUTO-CLOSE
// ============================================
function initSidebarAutoClose() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const collapse = () => {
    document.body.classList.remove('sidebar-open');
    const toggle = document.getElementById('rail-toggle');
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Expand menu');
  };

  // Navigating from the rail slides it back to icon width
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item') || e.target.closest('.rail-person')) collapse();
  });

  // Tapping anywhere outside the expanded rail unpins it
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('sidebar-open')) return;
    if (sidebar.contains(e.target)) return;
    collapse();
  });
}

// ============================================
// FOLLOWED PEOPLE RAIL — wide screens only. Avatars of everyone you follow,
// names revealed when the rail expands.
// ============================================
async function loadFollowedRail() {
  const rail = document.getElementById('rail-people');
  if (!rail || !store.user?.id) return;
  try {
    const { data: rows, error } = await supabase.from('followed_users')
      .select('followed_id').eq('follower_id', store.user.id)
      .order('created_at', { ascending: false }).limit(12);
    if (error) throw error;
    const ids = (rows || []).map(row => row.followed_id);
    if (!ids.length) { rail.innerHTML = ''; return; }
    const { data: people, error: profileError } = await supabase.from('profiles')
      .select('id, full_name, avatar_url').in('id', ids);
    if (profileError) throw profileError;
    const byId = new Map((people || []).map(person => [person.id, person]));
    rail.innerHTML = `<div class="rail-people-heading">Following</div>` + ids
      .map(id => byId.get(id))
      .filter(person => person?.avatar_url)
      .map(person => `<a class="rail-person" href="#/profile?u=${person.id}" title="${escapeHtml(person.full_name || '')}">
        <img class="rail-person-avatar" src="${escapeHtml(person.avatar_url)}" alt="">
        <span class="rail-person-name">${escapeHtml(person.full_name || '')}</span>
      </a>`)
      .join('');
  } catch (error) {
    console.warn('Followed rail could not load:', error.message);
  }
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================
// APP INITIALIZATION
// ============================================
// A session in this browser's own storage means the sign-in is real and only
// the network check failed. Redirecting in that case would bounce between the
// landing page, auth.html and the dashboard forever, so the app says so and
// waits for the member to retry.
function renderOfflineNotice() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <div class="app-offline">
      <p class="app-offline-title">Couldn&rsquo;t reach Gliimu</p>
      <p class="app-offline-hint">You are signed in, but the connection failed. Check your network and try again.</p>
      <button type="button" class="btn-primary" onclick="window.location.reload()">Retry</button>
    </div>`;
}

async function initApp() {
  initPullToRefresh();
  const user = await store.fetchUser();

  if (!user) {
    let holdsSession = false;
    try {
      const { data } = await supabase.auth.getSession();
      holdsSession = !!data?.session;
    } catch (e) { /* no local session to speak of either */ }

    if (holdsSession) {
      renderOfflineNotice();
      return;
    }
    // Signed out, so the front door. replace() rather than href: Back should
    // not return to an empty shell of an app the visitor cannot use.
    window.location.replace('/');
    return;
  }

  // Signing back in inside the 3-day window cancels a pending account
  // deletion. Safe to call on every login — it only clears a real request.
  try {
    const { data: recovery } = await supabase.rpc('cancel_account_deletion');
    if (recovery && recovery.ok && recovery.recovered) {
      alert('Welcome back! Your account was scheduled for deletion. The request has been cancelled and your account is safe.');
    }
  } catch (e) { /* the RPC may not exist until sql/account_lifecycle.sql runs */ }

  // Sound preference set on another device: user_metadata is the
  // cross-device source, localStorage is what notify.js reads each ping.
  const savedSound = user.user_metadata?.notification_sound;
  if (savedSound === 'off' || savedSound === 'default' || savedSound === 'crunch') {
    localStorage.setItem('gliimu_notification_sound', savedSound);
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

  const avatarSrc = store.profile.avatar_url
    || `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23F1F5F9'/%3E%3C/svg%3E`;
  document.querySelectorAll('[data-user-avatar]').forEach(el => { el.src = avatarSrc; });

  // Initialize Notifications
  notify.init();
  await NotificationManager.fetchInitialCounts();
  NotificationManager.initRealtimeListeners();
  window.NotificationManager = NotificationManager;

  Presence.init();
  window.GliimuPresence = Presence;
  initSidebarAutoClose();
  initAccountMenu();
  loadFollowedRail();
  window.addEventListener('gliimu-follow-changed', () => loadFollowedRail());

  setInterval(checkGpTiers, 45000);

  window.addEventListener('hashchange', router);
  router();
}

initApp();
