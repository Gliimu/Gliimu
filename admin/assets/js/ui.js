// Small render helpers shared by every admin view.

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function money(value) {
  const n = Number(value || 0);
  return n > 0 ? `₦${n.toLocaleString()}` : 'Free';
}

// Ledger amounts are signed and zero is meaningful, so they get their own
// formatter rather than money()'s "Free".
export function naira(value) {
  const n = Number(value || 0);
  return `${n < 0 ? '-' : ''}₦${Math.abs(n).toLocaleString()}`;
}

export function gp(value) {
  return `${Number(value || 0).toLocaleString()} GP`;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function badge(text, tone = 'neutral') {
  return `<span class="badge badge-${tone}">${escapeHtml(text)}</span>`;
}

export function empty(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

export function avatar(url, name) {
  const initial = escapeHtml((name || '?').trim().charAt(0).toUpperCase());
  return url
    ? `<img class="avatar" src="${escapeHtml(url)}" alt="">`
    : `<div class="avatar avatar-fallback">${initial}</div>`;
}

// One drawer builder so every screen closes the same way. Callers pass
// already-escaped HTML fragments.
export function openDrawer({ title, sub = '', body = '', foot = '' }) {
  document.querySelector('.drawer-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.innerHTML = `
    <div class="drawer">
      <div class="drawer-head">
        <div style="min-width: 0;">
          <h2>${title}</h2>
          ${sub ? `<div class="card-sub">${sub}</div>` : ''}
        </div>
        <button class="drawer-close" aria-label="Close">×</button>
      </div>
      <div class="drawer-body">${body}</div>
      ${foot ? `<div class="drawer-foot">${foot}</div>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.drawer-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  return { overlay, close };
}

// Shared money/plan vocabulary, kept next to the SQL that writes it.
export const TIER_LABEL = { trial: 'Trial', wallet: "Pay n' Go", payngo: "Use n' Pay", pro: 'Pro' };

export const TXN_LABEL = {
  topup: 'Wallet top-up',
  purchase: 'Library unlock',
  support: 'Support a creator',
  subscription: 'Subscription bill',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  adjustment: 'Admin adjustment',
  live_session: 'Live session',
  live_entry: 'Live entry',
  live_support: 'Live support',
  reward: 'Reward'
};

// Turns an unknown RPC result into one readable line. Every admin RPC answers
// {ok:false, code} instead of raising, so the codes are the contract.
const RPC_ERRORS = {
  NOT_AUTHENTICATED: 'Your session expired. Please sign in again.',
  NOT_CRM: 'Only CRM admins can do that.',
  NOT_SUPER: 'Only a super admin can do that.',
  NOT_REGISTRAR: 'Only registrar admins can do that.',
  NOT_FOUND: 'That record no longer exists.',
  ALREADY_REVIEWED: 'Someone has already reviewed this submission.',
  ALREADY_PAID: 'That bill is already settled.',
  NOTE_REQUIRED: 'A reason is required before rejecting.',
  REASON_REQUIRED: 'A reason is required — it goes on the audit log.',
  BAD_ACTION: 'Unknown review action.',
  BAD_STATUS: 'Unknown status.',
  BAD_ROLE: 'Unknown role.',
  BAD_AMOUNT: 'Enter an amount other than zero.',
  BAD_DAYS: 'Enter a number of days other than zero.',
  BAD_EVENT_TYPE: 'Pick a charge from the list.',
  AMOUNT_TOO_LARGE: 'That amount is too large to enter here.',
  DAYS_TOO_LARGE: 'That many days is too large to enter here.',
  WOULD_GO_NEGATIVE: 'That debit would take the wallet below zero.',
  NO_USER: 'That member account does not exist.',
  NO_AUTHOR_PROFILE: 'The submitter no longer has a profile, so the item cannot be attributed.',
  LAST_SUPER: 'There has to be at least one super admin.',
  SCHEMA_MISMATCH: 'The database shape does not match what this build expects. Send the developer the detail below.'
};

export function rpcError(data, fallback = 'That did not work. Please try again.') {
  const code = data && data.code;
  const base = RPC_ERRORS[code] || (code ? `Failed (${code}).` : fallback);
  const where = data && data.where ? `\nWhere: ${data.where}` : '';
  return data && data.detail ? `${base}${where}\n\n${data.detail}` : `${base}${where}`;
}
