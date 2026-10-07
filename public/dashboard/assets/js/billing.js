import { supabase } from '/shared/js/config.js';
import { store } from './store.js';

// Client wrapper around the server-side billing_access() gate (sql/billing.sql).
// The database decides — every price, dedupe and debit happens inside the RPC;
// this module only shapes the UX around the verdict.

const ERROR_TEXT = {
  NOT_AUTHENTICATED: 'Please sign in to continue.',
  TIER_BLOCKED: "Live sessions are part of a subscription. Switch to Use n' Pay or Pro to join and host live rooms.",
  INSUFFICIENT_FUNDS: 'Your wallet balance is too low for this. Top up and try again.'
};

function requestId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

// Ask the billing gate whether this open is allowed. Returns the raw verdict:
//   { allowed: true, ... }  → proceed (kind tells you if it was free/premium)
//   { allowed: false, code, price?, balance? } → blocked
export async function ensureAccess(eventType, { itemId = null, creatorId = null } = {}) {
  try {
    if (!store.user) return { allowed: false, code: 'NOT_AUTHENTICATED' };
    const { data, error } = await supabase.rpc('billing_access', {
      p_event_type: eventType,
      p_item_id: itemId,
      p_request_id: requestId(),
      p_creator: creatorId
    });
    if (error) throw error;
    if (!data || typeof data.allowed !== 'boolean') throw new Error('empty billing response');
    syncBalance(data);
    return data;
  } catch (e) {
    // Pre-migration / offline safety: never brick content because the billing
    // RPC is unreachable. Live and deals still have server-side DB triggers.
    console.warn('billing_access unavailable — allowing access:', e.message || e);
    return { allowed: true, failOpen: true };
  }
}

export async function fetchBillingSummary() {
  try {
    const { data, error } = await supabase.rpc('billing_summary');
    if (error) throw error;
    return data || null;
  } catch (e) {
    console.warn('billing_summary unavailable:', e.message || e);
    return null;
  }
}

// Keep the cached wallet in step when a gate charge went through.
function syncBalance(result) {
  if (result && typeof result.balance === 'number' && store.profile) {
    store.profile.wallet_balance = result.balance;
  }
}

export function goToBilling() {
  window.location.hash = '#/wallet';
}

// Denial UX for the codes every caller shares. PURCHASE_REQUIRED is left to
// the caller (it owns the unlock/purchase flow). Resolves when the dialog is
// dismissed, so callers can await it before moving on.
export async function showBillingDenied(result) {
  if (!result || result.allowed || result.code === 'PURCHASE_REQUIRED') return;

  let message = ERROR_TEXT[result.code] || 'You do not have access to this yet.';
  if (result.code === 'INSUFFICIENT_FUNDS' && typeof result.price === 'number') {
    message += `\n\nThis costs ₦${result.price.toLocaleString()}.`;
    if (typeof result.balance === 'number') message += ` Your wallet: ₦${result.balance.toLocaleString()}.`;
  }
  await window.appAlert(message);

  if (result.code === 'INSUFFICIENT_FUNDS' || result.code === 'TIER_BLOCKED') goToBilling();
}
