// Small render helpers shared by every admin view.

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function money(naira) {
  const n = Number(naira || 0);
  return n > 0 ? `₦${n.toLocaleString()}` : 'Free';
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

// Turns an unknown RPC result into one readable line. Every admin RPC answers
// {ok:false, code} instead of raising, so the codes are the contract.
const RPC_ERRORS = {
  NOT_AUTHENTICATED: 'Your session expired. Please sign in again.',
  NOT_CRM: 'Only CRM admins can do that.',
  NOT_SUPER: 'Only a super admin can do that.',
  NOT_FOUND: 'That record no longer exists.',
  ALREADY_REVIEWED: 'Someone has already reviewed this submission.',
  NOTE_REQUIRED: 'A reason is required before rejecting.',
  BAD_ACTION: 'Unknown review action.',
  BAD_STATUS: 'Unknown report status.',
  BAD_ROLE: 'Unknown role.',
  NO_USER: 'That member account does not exist.',
  NO_AUTHOR_PROFILE: 'The submitter no longer has a profile, so the item cannot be attributed.',
  LAST_SUPER: 'There has to be at least one super admin.',
  SCHEMA_MISMATCH: 'The library table shape does not match what this build expects. Send the developer the detail below.'
};

export function rpcError(data, fallback = 'That did not work. Please try again.') {
  const code = data && data.code;
  const base = RPC_ERRORS[code] || (code ? `Failed (${code}).` : fallback);
  return data && data.detail ? `${base}\n\n${data.detail}` : base;
}
