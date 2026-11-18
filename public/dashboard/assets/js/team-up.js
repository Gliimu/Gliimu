import { supabase } from '/shared/js/config.js?v=2';
import { store } from './store.js?v=3';
import { isIncomingDm } from './readState.js?v=29';

const state = {
  members: [],
  loaded: false,
  loading: false,
  error: null,
  request: 0,
  initialized: false,
  channel: null
};

const optimisticAdds = new Map();
const optimisticRemoves = new Set();
const operationQueues = new Map();
let dropUp = null;
let dropUpTrigger = null;
let memberMenu = null;
let memberMenuTrigger = null;
let toast = null;
let toastTimer = null;
let pendingRemoval = null;

const PING_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
const GLIIM_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
const REMOVE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>';

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function activityTime(member) {
  return Math.max(...[member.activity_at, member.last_received_at, member.latest_gliim_at, member.added_at]
    .filter(Boolean).map(value => new Date(value).getTime()).filter(Number.isFinite), 0);
}

function sortMembers() {
  state.members.sort((a, b) => activityTime(b) - activityTime(a)
    || String(a.full_name || '').localeCompare(String(b.full_name || ''))
    || String(a.member_id).localeCompare(String(b.member_id)));
}

function upsertMember(member) {
  const index = state.members.findIndex(item => item.member_id === member.member_id);
  if (index === -1) state.members.push(member);
  else state.members[index] = { ...state.members[index], ...member };
  sortMembers();
}

function avatarHtml(member, className) {
  const name = member.full_name || '';
  return member.avatar_url
    ? `<img class="${className}" src="${escapeHtml(member.avatar_url)}" alt="" loading="lazy">`
    : `<span class="${className}" aria-hidden="true"></span>`;
}

function desktopHtml() {
  if (!state.members.length) {
    let note = 'Add team members from ping';
    if (state.error) note = 'Could not load Team. Close and reopen to retry.';
    else if (!state.loaded) note = 'Loading Team…';
    return '<div class="rail-people-stack"><div class="rail-people-heading">Team</div><p class="rail-empty">' + note + '</p></div>';
  }
  return '<div class="rail-people-stack"><div class="rail-people-heading">Team</div>' + state.members.map(member => {
    const name = member.full_name || '';
    return `<button type="button" class="rail-person team-up-person" data-team-member="${member.member_id}" title="${escapeHtml(name)}" aria-label="Open Team actions for ${escapeHtml(name)}">
      ${avatarHtml(member, 'rail-person-avatar')}
      <span class="rail-person-name">${escapeHtml(name)}</span>
    </button>`;
  }).join('') + '</div>';
}

function mobileHtml() {
  if (state.loading && !state.members.length) return '<p class="team-dropup-empty">Loading Team…</p>';
  if (state.error && !state.members.length) return '<p class="team-dropup-empty">Could not load Team. Close and reopen to retry.</p>';
  if (!state.members.length) return '<p class="team-dropup-empty">Add members from an ordinary chat avatar in Ping.</p>';
  return state.members.map(member => {
    const name = member.full_name || '';
    return `<button type="button" class="team-dropup-person" data-team-member="${member.member_id}" title="${escapeHtml(name)}" aria-label="Open Team actions for ${escapeHtml(name)}">
      ${avatarHtml(member, 'team-dropup-avatar')}
      <span class="team-dropup-name">${escapeHtml(name)}</span>
    </button>`;
  }).join('');
}

function renderTeamUp() {
  const rail = document.getElementById('rail-people');
  if (rail) rail.innerHTML = desktopHtml();
  const list = dropUp?.querySelector('.team-dropup-list');
  if (list) {
    const scrollLeft = list.scrollLeft;
    list.innerHTML = mobileHtml();
    list.scrollLeft = scrollLeft;
  }
}

function showToast(message, undo = false) {
  clearTimeout(toastTimer);
  toast?.remove();
  toast = document.createElement('div');
  toast.className = 'team-toast';
  toast.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);
  if (undo) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.teamUndo = '';
    button.textContent = 'Undo';
    toast.appendChild(button);
  }
  document.body.appendChild(toast);
  toastTimer = setTimeout(() => {
    toast?.remove();
    toast = null;
    if (!undo) pendingRemoval = null;
  }, undo ? 7000 : 3500);
}

function closeMemberMenu() {
  memberMenu?.remove();
  memberMenu = null;
  memberMenuTrigger?.setAttribute('aria-expanded', 'false');
  memberMenuTrigger = null;
}

function closeDropUp() {
  dropUp?.remove();
  dropUp = null;
  dropUpTrigger?.setAttribute('aria-expanded', 'false');
  dropUpTrigger?.classList.remove('is-open');
  dropUpTrigger = null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

function openMemberMenu(trigger, memberId) {
  const member = state.members.find(item => item.member_id === memberId);
  if (!member) return;
  closeMemberMenu();
  memberMenuTrigger = trigger;
  memberMenu = document.createElement('div');
  memberMenu.className = 'team-member-menu';
  memberMenu.setAttribute('role', 'menu');
  memberMenu.innerHTML = `
    <button type="button" class="team-member-action" role="menuitem" data-team-action="ping" data-member-id="${memberId}">${PING_ICON}<span>Ping</span></button>
    <button type="button" class="team-member-action" role="menuitem" data-team-action="gliim" data-member-id="${memberId}">${GLIIM_ICON}<span>Gliim</span></button>
    <button type="button" class="team-member-action team-member-action--danger" role="menuitem" data-team-action="remove" data-member-id="${memberId}">${REMOVE_ICON}<span>Remove from Team</span></button>`;
  document.body.appendChild(memberMenu);
  trigger.setAttribute('aria-expanded', 'true');

  const rect = trigger.getBoundingClientRect();
  const edge = 10;
  const gap = 8;
  const width = memberMenu.offsetWidth;
  const height = memberMenu.offsetHeight;
  let left;
  let top;
  if (window.innerWidth <= 768) {
    left = rect.left + rect.width / 2 - width / 2;
    top = rect.top - height - gap;
    if (top < edge) top = rect.bottom + gap;
  } else {
    left = rect.right + gap;
    top = rect.top;
    if (left + width > window.innerWidth - edge) left = rect.left - width - gap;
  }
  memberMenu.style.left = `${Math.round(clamp(left, edge, window.innerWidth - width - edge))}px`;
  memberMenu.style.top = `${Math.round(clamp(top, edge, window.innerHeight - height - edge))}px`;
}

function openDropUp(trigger) {
  closeMemberMenu();
  closeDropUp();
  dropUpTrigger = trigger;
  dropUp = document.createElement('section');
  dropUp.className = 'team-dropup';
  dropUp.setAttribute('aria-label', 'Team');
  dropUp.innerHTML = '<div class="team-dropup-list"></div>';
  document.body.appendChild(dropUp);
  trigger.setAttribute('aria-expanded', 'true');
  trigger.classList.add('is-open');
  renderTeamUp();
  refreshTeamUp();
}

function enqueue(memberId, operation) {
  const previous = operationQueues.get(memberId) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  operationQueues.set(memberId, next);
  next.finally(() => {
    if (operationQueues.get(memberId) === next) operationQueues.delete(memberId);
  });
  return next;
}

export function isTeamUpMember(memberId) {
  return state.members.some(member => member.member_id === memberId) && !optimisticRemoves.has(memberId);
}

export function refreshTeamUp() {
  const request = ++state.request;
  state.loading = true;
  state.error = null;
  renderTeamUp();
  return supabase.rpc('team_up_list').then(({ data, error }) => {
    if (request !== state.request) return;
    if (error) throw error;
    const rows = (data || []).filter(member => !optimisticRemoves.has(member.member_id));
    optimisticAdds.forEach((member, memberId) => {
      if (!optimisticRemoves.has(memberId) && !rows.some(item => item.member_id === memberId)) rows.push(member);
    });
    state.members = rows;
    state.loaded = true;
    sortMembers();
  }).catch(error => {
    if (request !== state.request) return;
    state.error = error;
    console.warn('Team could not load:', error.message);
  }).finally(() => {
    if (request !== state.request) return;
    state.loading = false;
    renderTeamUp();
  });
}

export function addToTeamUp(memberId, profile = null, undo = false) {
  if (!memberId || memberId === store.user?.id) return Promise.resolve(false);
  if (isTeamUpMember(memberId) && !undo) {
    showToast('Already in Team');
    return Promise.resolve(true);
  }

  const now = new Date().toISOString();
  const optimistic = {
    member_id: memberId,
    full_name: profile?.full_name || '',
    avatar_url: profile?.avatar_url || null,
    added_at: profile?.added_at || now,
    last_received_at: profile?.last_received_at || null,
    latest_gliim_at: profile?.latest_gliim_at || null,
    activity_at: profile?.activity_at || now
  };
  optimisticRemoves.delete(memberId);
  optimisticAdds.set(memberId, optimistic);
  upsertMember(optimistic);
  renderTeamUp();
  if (!undo) showToast('Added to Team');

  return enqueue(memberId, async () => {
    const { data, error } = await supabase.rpc('team_up_add', { p_member_id: memberId });
    if (error || !data?.ok) {
      optimisticAdds.delete(memberId);
      if (!optimisticRemoves.has(memberId)) {
        state.members = state.members.filter(member => member.member_id !== memberId);
        renderTeamUp();
      }
      showToast(error?.message || 'Could not add to Team');
      return false;
    }
    await refreshTeamUp();
    optimisticAdds.delete(memberId);
    if (!undo) showToast('Added to Team');
    return true;
  });
}

export function removeFromTeamUp(memberId) {
  const member = state.members.find(item => item.member_id === memberId);
  if (!member) return Promise.resolve(false);
  closeMemberMenu();
  closeDropUp();
  optimisticAdds.delete(memberId);
  optimisticRemoves.add(memberId);
  state.members = state.members.filter(item => item.member_id !== memberId);
  renderTeamUp();
  showToast('Removed from Team', true);

  const promise = enqueue(memberId, async () => {
    const { data, error } = await supabase.rpc('team_up_remove', { p_member_id: memberId });
    optimisticRemoves.delete(memberId);
    if (error || !data?.ok) {
      upsertMember(member);
      renderTeamUp();
      showToast(error?.message || 'Could not remove from Team');
      return false;
    }
    await refreshTeamUp();
    return true;
  });
  pendingRemoval = { member, promise };
  return promise;
}

function undoRemoval() {
  const pending = pendingRemoval;
  if (!pending) return;
  pendingRemoval = null;
  clearTimeout(toastTimer);
  toast?.remove();
  toast = null;
  addToTeamUp(pending.member.member_id, pending.member, true).then(added => {
    if (added) showToast('Restored to Team');
  });
}

function openPing(memberId) {
  closeMemberMenu();
  closeDropUp();
  if (window.gliimRoute?.path() === '/ping' && window.pingInstance?.addContact) {
    window.pingInstance.addContact(memberId);
    return;
  }
  sessionStorage.setItem('ping_target_user', memberId);
  window.location.hash = '#/ping';
}

function openGliim(memberId) {
  closeMemberMenu();
  closeDropUp();
  window.location.hash = `#/profile?u=${encodeURIComponent(memberId)}`;
}

function onDocumentClick(event) {
  const undo = event.target.closest('[data-team-undo]');
  if (undo) {
    undoRemoval();
    return;
  }
  const trigger = event.target.closest('[data-team-trigger]');
  if (trigger) {
    event.preventDefault();
    if (dropUpTrigger === trigger) closeDropUp();
    else openDropUp(trigger);
    return;
  }
  const action = event.target.closest('[data-team-action]');
  if (action) {
    const memberId = action.dataset.memberId;
    if (action.dataset.teamAction === 'ping') openPing(memberId);
    else if (action.dataset.teamAction === 'gliim') openGliim(memberId);
    else if (action.dataset.teamAction === 'remove') removeFromTeamUp(memberId);
    return;
  }
  const member = event.target.closest('[data-team-member]');
  if (member) {
    event.preventDefault();
    openMemberMenu(member, member.dataset.teamMember);
  }
}

function onPointerDown(event) {
  if (memberMenu && !memberMenu.contains(event.target) && !event.target.closest('[data-team-member]')) closeMemberMenu();
  if (dropUp && !dropUp.contains(event.target) && !event.target.closest('[data-team-trigger]')) closeDropUp();
}

function onKeyDown(event) {
  if (event.key !== 'Escape') return;
  closeMemberMenu();
  closeDropUp();
}

export function handleTeamUpMessage(message) {
  if (!message || !isIncomingDm(store.user?.id, message)) return;
  const member = state.members.find(item => item.member_id === message.sender_id);
  if (!member || optimisticRemoves.has(member.member_id)) return;
  if (new Date(message.created_at).getTime() <= new Date(member.last_received_at || 0).getTime()) return;
  member.last_received_at = message.created_at;
  member.activity_at = message.created_at;
  sortMembers();
  renderTeamUp();
}

function initRealtime() {
  if (state.channel || !store.user?.id) return;
  state.channel = supabase.channel(`team-up-gliims-${store.user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_gliims' }, payload => {
      const memberId = payload.new?.user_id || payload.old?.user_id;
      if (memberId && state.members.some(member => member.member_id === memberId)) refreshTeamUp();
    })
    .subscribe();
}

export function initTeamUp() {
  if (state.initialized) return;
  state.initialized = true;
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('hashchange', () => {
    closeMemberMenu();
    closeDropUp();
  });
  window.addEventListener('resize', () => {
    closeMemberMenu();
    closeDropUp();
  });
  renderTeamUp();
  refreshTeamUp();
  initRealtime();
}
