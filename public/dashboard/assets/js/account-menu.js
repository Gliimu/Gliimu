const ITEMS = `
  <a class="account-menu-item" role="menuitem" href="#/profile">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
    <span>Profile</span>
  </a>
  <a class="account-menu-item" role="menuitem" href="#/wallet">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
    <span>Billing</span>
  </a>
  <a class="account-menu-item" role="menuitem" href="#/ping">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
    <span>Ping</span>
    <span class="unread-dot" data-dot="ping" hidden></span>
  </a>
  <a class="account-menu-item" role="menuitem" href="#/alerts">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
    <span>Alerts</span>
    <span class="unread-dot" data-dot="alerts" hidden></span>
  </a>
  <a class="account-menu-item" role="menuitem" href="#/settings">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
    <span>Settings</span>
  </a>
`;

let menu = null;
let opener = null;

function detach() {
  document.removeEventListener('pointerdown', onPointerDown, true);
  document.removeEventListener('keydown', onKeyDown);
}

function close() {
  if (!menu) return;
  menu.remove();
  menu = null;
  opener?.setAttribute('aria-expanded', 'false');
  opener?.classList.remove('is-open');
  opener = null;
  detach();
}

function onPointerDown(event) {
  if (opener?.contains(event.target) || menu?.contains(event.target)) return;
  close();
}

function onKeyDown(event) {
  if (event.key === 'Escape') close();
}

function place(trigger, el) {
  const rect = trigger.getBoundingClientRect();
  const edge = 12;
  const gap = 10;
  let top = rect.bottom + gap;
  if (top + el.offsetHeight > window.innerHeight - edge) {
    top = Math.max(edge, rect.top - gap - el.offsetHeight);
  }
  const left = Math.min(
    Math.max(edge, rect.right - el.offsetWidth),
    window.innerWidth - el.offsetWidth - edge
  );
  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
}

// Your face in the navigation is one door on every screen size: it opens this
// menu instead of going straight to your profile, because Billing, Ping, Alerts
// and Settings have no tab of their own any more.
function seedDots(el) {
  const counts = window.NotificationManager?.counts;
  if (!counts) return;
  el.querySelectorAll('[data-dot]').forEach(dot => {
    dot.hidden = !(counts[dot.dataset.dot] > 0);
  });
}

export function toggleAccountMenu(trigger) {
  const reopening = menu && opener === trigger;
  close();
  if (reopening) return;

  opener = trigger;
  menu = document.createElement('div');
  menu.className = 'account-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = ITEMS;
  seedDots(menu);
  document.body.appendChild(menu);
  place(trigger, menu);

  trigger.setAttribute('aria-expanded', 'true');
  trigger.classList.add('is-open');

  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) close();
  });

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown);
}

window.addEventListener('hashchange', close);
window.addEventListener('resize', close);

export function initAccountMenu() {
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-account-trigger]');
    if (!trigger) return;
    event.preventDefault();
    toggleAccountMenu(trigger);
  });
}
