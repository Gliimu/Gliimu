import { supabase, API_BASE_URL } from '/shared/js/config.js';
import { store } from './store.js?v=2';

let heartbeatInterval = null;
let lastActivity = Date.now();
let currentPostId = null;
let isPaused = false;
const IDLE_TIMEOUT = 3 * 60 * 1000;
const HEARTBEAT_INTERVAL = 60 * 1000;
const LOW_BALANCE_THRESHOLD = 12;

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

function onActivity() {
  lastActivity = Date.now();
  if (isPaused) {
    isPaused = false;
  }
}

async function sendHeartbeat() {
  if (!store.user || !store.user.id) return;
  if (Date.now() - lastActivity > IDLE_TIMEOUT) {
    isPaused = true;
    return;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`${API_BASE_URL}/api/gliits/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ postId: currentPostId })
    });

    const data = await res.json();
    if (!res.ok) return;

    if (data.balance !== undefined && store.profile) {
      store.profile.wallet_balance = data.balance;
    }

    if (data.ok === false) {
      if (data.code === 'INSUFFICIENT_BALANCE' || data.code === 'NO_ACTIVE_PLAN') {
        // Stop heartbeat and redirect to XpLoRe where the G0 modal will show
        stop();
        if (window.location.hash !== '#/xplore') {
          window.location.hash = '#/xplore';
        }
      }
      return;
    }

    if (typeof data.balance === 'number' && data.balance <= LOW_BALANCE_THRESHOLD && data.balance > 0) {
      showLowBalanceWarning(data.balance);
    }
  } catch (e) {
    console.warn('Heartbeat error:', e.message);
  }
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

function showLowBalanceWarning(balance) {
  showBillingNotice(balance !== undefined
    ? `Your balance is low: G${balance}. Top up to keep using the platform.`
    : 'Your balance has reached G0. Top up to continue using the platform.');
}

function showPlanNotice() {
  showBillingNotice('Your plan is not active. Pick a plan on the Wallet page to keep using the platform.');
}

export function start() {
  if (heartbeatInterval) return;

  ACTIVITY_EVENTS.forEach(evt => document.addEventListener(evt, onActivity, { passive: true }));
  lastActivity = Date.now();
  isPaused = false;

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
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in');

    const res = await fetch(`${API_BASE_URL}/api/gliits/topup-init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        gliitsAmount,
        callbackUrl: `${location.origin}/dashboard/#/wallet`
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Top-up failed');
    return data;
  } catch (e) {
    throw e;
  }
}
