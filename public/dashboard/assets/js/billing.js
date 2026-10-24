import { supabase } from '/shared/js/config.js';
import { store } from './store.js';
import { getBalance, setPlan, initTopup, start as startHeartbeat, stop as stopHeartbeat } from './heartbeat.js';

export { getBalance, setPlan, initTopup, startHeartbeat, stopHeartbeat };

// All content is now accessible — billing is per-minute via heartbeat,
// not per-content. These stubs keep existing callers from breaking while
// the content files are updated to remove gate checks.
export async function ensureAccess() {
  return { allowed: true };
}

export async function showBillingDenied() {
  // No-op: no per-content billing denial under the Gliits model.
}

export async function fetchBillingSummary() {
  const balance = await getBalance();
  if (!balance) return null;
  return {
    wallet_balance: balance.balance || 0,
    plan: balance.plan || null
  };
}

export function goToBilling() {
  window.location.hash = '#/wallet';
}

// Keep the cached wallet in step when a heartbeat deduction went through.
export function syncBalance(result) {
  if (result && typeof result.balance === 'number' && store.profile) {
    store.profile.wallet_balance = result.balance;
  }
}
