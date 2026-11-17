import { store } from './store.js?v=3';
import { router } from './router.js?v=236';
import { initPullToRefresh } from './pull-to-refresh.js?v=24';
import { supabase } from '/shared/js/config.js?v=2';
import { computeUnread, latestIncomingUnread } from './readState.js?v=29';
import { notify } from './notify.js?v=33';
import { previewText } from './media.js?v=7';
import { initAccountMenu } from './account-menu.js?v=7';
import { initTeamUp, handleTeamUpMessage } from './team-up.js?v=2';

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
      desktop: document.hidden || !['/ping', '/live'].includes(window.gliimRoute.path())
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
    const onAlerts = window.gliimRoute.path() === '/alerts' && !document.hidden;
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
    const onSupport = window.gliimRoute.path() === '/support' && !document.hidden;
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${store.user.id}` }, payload => {
        if (payload.eventType === 'INSERT') handleTeamUpMessage(payload.new);
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

const COHORT_CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"></path></svg>';

function closeCohortModal() {
  document.getElementById('cohort-modal')?.remove();
}

async function showCohortModal() {
  if (document.getElementById('cohort-modal')) return;
  try {
    const { data, error } = await supabase.rpc('get_active_cohort');
    if (error || !data?.ok || !data.cohort || !['/xplore', '/feed'].includes(window.gliimRoute?.path())) return;
    const cohort = data.cohort;
    const members = Array.isArray(cohort.accepted_members) ? cohort.accepted_members : [];
    const description = String(cohort.description || '').trim();
    const backdrop = document.createElement('div');
    backdrop.className = 'cohort-modal-backdrop';
    backdrop.id = 'cohort-modal';
    backdrop.innerHTML = `
      <section class="cohort-modal" role="dialog" aria-modal="true" aria-labelledby="cohort-modal-title">
        <button type="button" class="cohort-modal-close" data-cohort-close aria-label="Close cohort">${COHORT_CLOSE_ICON}</button>
        <div class="cohort-modal-head">
          <p class="cohort-modal-kicker">Current cohort</p>
          <h2 class="cohort-modal-title" id="cohort-modal-title">${escapeHtml(cohort.title || '')}</h2>
        </div>
        ${description ? `<p class="cohort-modal-description">${escapeHtml(description)}</p>` : ''}
        ${members.length ? `<div class="cohort-modal-members" aria-label="Accepted members">${members.map(member => `
          ${member.avatar_url
            ? `<img class="cohort-modal-avatar" src="${escapeHtml(member.avatar_url)}" alt="${escapeHtml(member.full_name || '')}" title="${escapeHtml(member.full_name || '')}">`
            : `<span class="cohort-modal-avatar" role="img" aria-label="${escapeHtml(member.full_name || '')}"></span>`}
        `).join('')}</div>` : ''}
        <button type="button" class="btn-primary cohort-modal-apply" data-cohort-apply>Apply</button>
      </section>`;
    document.body.appendChild(backdrop);

    const onKeydown = event => {
      if (event.key === 'Escape') {
        document.removeEventListener('keydown', onKeydown);
        closeCohortModal();
      }
    };
    document.addEventListener('keydown', onKeydown);
    backdrop.addEventListener('click', async event => {
      if (event.target === backdrop || event.target.closest('[data-cohort-close]')) {
        document.removeEventListener('keydown', onKeydown);
        closeCohortModal();
        return;
      }
      const apply = event.target.closest('[data-cohort-apply]');
      if (!apply || apply.disabled) return;
      apply.disabled = true;
      apply.textContent = 'Applying…';
      const { data: result, error: applyError } = await supabase.rpc('cohort_show_interest', { p_cohort: cohort.id });
      if (applyError || !result?.ok) {
        apply.disabled = false;
        apply.textContent = 'Apply';
        await appAlert(applyError?.message || 'Could not send your application. Please try again.');
        return;
      }
      sessionStorage.setItem('cohortSupportPrefill', 'I would like to join the co-hort, how do I register?');
      document.removeEventListener('keydown', onKeydown);
      closeCohortModal();
      window.location.hash = '#/ping';
    });
    backdrop.querySelector('[data-cohort-close]')?.focus();
  } catch (error) {
    console.warn('Cohort modal could not load:', error.message);
  }
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
    // not return to an empty shell of an app the visitor cannot use. The clean
    // host serves no landing of its own, so visitors go to www.
    window.location.replace(window.location.hostname === 'dashboard.gliimu.com'
      ? 'https://www.gliimu.com/'
      : '/');
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
  initAccountMenu();
  initTeamUp();

  setInterval(checkGpTiers, 45000);

  window.addEventListener('hashchange', router);
  const initialPath = window.gliimRoute?.path();
  await router();
  if (initialPath === '/xplore' || initialPath === '/feed') showCohortModal();
}

initApp();
