import { supabase, API_BASE_URL } from '/shared/js/config.js?v=2';
import { store } from './store.js?v=3';

let heartbeatInterval = null;
let lastActivity = Date.now();
let currentPostId = null;
let currentSessionId = null;
let isPaused = false;
let meterFailures = 0;
const HEARTBEAT_INTERVAL = 60 * 1000;
// The price and the idle window belong to the admin's Config tab, so they are
// read from gliits_get_config instead of being baked in here. This is only the
// shape the meter takes before that read lands.
const FALLBACK_IDLE_MINUTES = 3;
const LOW_BALANCE_MINUTES = 4;
let idleMinutes = FALLBACK_IDLE_MINUTES;
let pricePerMinute = null;

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

function onActivity() {
  lastActivity = Date.now();
  if (isPaused) {
    isPaused = false;
  }
}

async function loadPricing() {
  const cfg = await getConfig();
  if (!cfg) return;
  const rate = Number(cfg.per_minute_rate_gliits);
  if (Number.isFinite(rate) && rate > 0) pricePerMinute = rate;
  const idle = Number(cfg.idle_timeout_minutes);
  if (Number.isFinite(idle) && idle > 0) idleMinutes = idle;
}

async function sendHeartbeat() {
  if (!store.user || !store.user.id) return;
  if (Date.now() - lastActivity > idleMinutes * 60 * 1000) {
    isPaused = true;
    return;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // One beat bills one thing, and the room outranks the page — the same
    // priority the meter uses. Sending both ids would be ambiguous.
    const target = currentSessionId
      ? { sessionId: currentSessionId }
      : { postId: currentPostId };

    const res = await fetch(`${API_BASE_URL}/api/gliits/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify(target)
    });

    const data = await res.json().catch(() => null);

    // A beat that never reached the meter is not a free minute — the next one
    // tries again, so the unpaid minutes cannot pile up invisibly. Silence
    // here used to mean "reading costs nothing" forever.
    if (!res.ok || !data) {
      meterFailures += 1;
      console.error(`Heartbeat not billed (${res.status}) after ${meterFailures}: ${(data && data.error) || 'no response'}`);
      return;
    }
    meterFailures = 0;

    if (data.ok === false) {
      if (data.code === 'INSUFFICIENT_BALANCE') {
        // Stop heartbeat and redirect to XpLoRe where the empty-wallet modal will show
        stop();
        const here = window.gliimRoute
          ? window.gliimRoute.path()
          : (window.location.hash.slice(1).split('?')[0] || '/xplore');
        if (here !== '/xplore') {
          window.location.hash = '#/xplore';
        }
      }
      return;
    }

    if (typeof data.balance === 'number') {
      if (store.profile) store.profile.wallet_balance = data.balance;
      warnIfBalanceLow(data);
    }
  } catch (e) {
    console.warn('Heartbeat error:', e.message);
  }
}

// Only a per-minute payer is warned: a plan holder does not run their balance
// down by reading, and a host is earning rather than spending. The cost shown
// is the one the meter just took, so the admin's Config tab is the only source
// of the figure; the config read is the fallback for a minute that charged
// nothing yet (their own gliim, or a beat between two charged ones).
function warnIfBalanceLow(beat) {
  if (beat.metered !== true) return;
  const charged = Number(beat.charged);
  const cost = charged > 0 ? charged : pricePerMinute;
  const balance = Number(beat.balance);
  if (!cost || !(balance > 0) || balance > cost * LOW_BALANCE_MINUTES) return;
  showLowBalanceWarning(balance, cost);
}

function showBillingNotice(msg) {
  if (window._lowBalanceShown) return;
  window._lowBalanceShown = true;

  setTimeout(() => {
    if (typeof appAlert === 'function') {
      appAlert(msg).then(() => {
        window._lowBalanceShown = false;
        window.location.hash = '#/wallet';
      });
    }
  }, 500);
}

function showLowBalanceWarning(balance, cost) {
  const price = cost == null
    ? ''
    : ` Gliims and live sessions cost ${cost} tokens a minute.`;
  showBillingNotice(`Your balance is low: ${Number(balance).toLocaleString()} tokens.${price} Top up to keep using the platform.`);
}

export function start() {
  if (heartbeatInterval) return;

  ACTIVITY_EVENTS.forEach(evt => document.addEventListener(evt, onActivity, { passive: true }));
  lastActivity = Date.now();
  isPaused = false;

  loadPricing();
  sendHeartbeat();
  heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
}

export function stop() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  ACTIVITY_EVENTS.forEach(evt => document.removeEventListener(evt, onActivity));
}

export function setCurrentPost(postId) {
  currentPostId = postId || null;
}

export function setSession(sessionId) {
  currentSessionId = sessionId || null;
}

export async function getBalance() {
  try {
    const { data, error } = await supabase.rpc('gliits_get_balance');
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('gliits_get_balance error:', e.message);
    return null;
  }
}

export async function getConfig() {
  try {
    const { data, error } = await supabase.rpc('gliits_get_config');
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('gliits_get_config error:', e.message);
    return null;
  }
}

// Whether this member pays by the minute, and what a minute costs right now.
// Pay n' Go, no plan at all, and a lapsed plan are all metered — a plan row by
// itself is not permission to read for free. Null means the price or the
// balance could not be read, so the caller must not block on a guess.
export async function readingGate() {
  const [balanceData, cfg] = await Promise.all([getBalance(), getConfig()]);
  const rate = Number(cfg && cfg.per_minute_rate_gliits);
  if (!balanceData || !Number.isFinite(rate) || rate <= 0) return null;

  const plan = balanceData.plan;
  const paidPlan = Boolean(plan && plan.plan_type && plan.plan_type !== 'payngo'
    && (!plan.expires_at || new Date(plan.expires_at) > new Date()));
  const balance = Number(balanceData.balance || 0);

  return { rate, balance, metered: !paidPlan, blocked: !paidPlan && balance < rate };
}

export async function setPlan(planType) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: { message: 'Not signed in' } };

    const { data, error } = await supabase.rpc('gliits_set_plan', { p_plan_type: planType });
    if (error) throw error;
    if (data && store.profile) {
      store.profile.wallet_balance = data.balance;
    }
    return { data };
  } catch (e) {
    return { error: e };
  }
}

export async function initTopup(gliitsAmount) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const body = JSON.stringify({
    gliitsAmount,
    callbackUrl: window.gliimAppUrl('/wallet')
  });

  // Render answers an empty-bodied 502/503 while the service is still booting —
  // just after a deploy, or after it has gone to sleep. The failed request is
  // what wakes it, so one short retry stands between the member and a dead
  // "Add funds" button.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 4000));

    let res, data;
    try {
      res = await fetch(`${API_BASE_URL}/api/gliits/topup-init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body
      });
      data = await res.json().catch(() => null);
    } catch (e) {
      if (attempt === 0) continue;
      throw new Error('Could not reach the payment service. Please try again.');
    }

    if (res.ok && data) return data;
    if (data && data.error) throw new Error(data.error);
    if (res.status !== 502 && res.status !== 503) {
      throw new Error('Could not start the payment. Please try again.');
    }
  }

  throw new Error('The payment service is waking up. Please try again in a moment.');
}
