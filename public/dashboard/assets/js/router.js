const routes = {
  '/alerts': () => import('./views/alerts.js?v=16').then(m => m.default),
  '/search': () => import('./views/search.js?v=18').then(m => m.default),
  '/xplore': () => import('./views/xplore.js?v=122').then(m => m.default),
  '/feed': () => import('./views/xplore.js?v=122').then(m => m.default),
  '/ping': () => import('./views/ping.js?v=68').then(m => m.default),
  '/wallet': () => import('./views/billing.js?v=49').then(m => m.default),
  '/settings': () => import('./views/settings.js?v=9').then(m => m.default),
  '/terms': () => import('./views/terms.js?v=1').then(m => m.default),
  '/live': () => import('./views/live.js?v=54').then(m => m.default),
  '/publish': () => import('./views/publish.js?v=25').then(m => m.default),
  '/support': () => { window.location.hash = '#/ping'; return Promise.resolve({ title: 'Ping', template: '', init() {}, destroy() {} }); },
  '/profile': () => import('./views/profile.js?v=101').then(m => m.default),
  '/post': () => import('./views/reader.js?v=71').then(m => m.default),
  '/read': () => import('./views/reader.js?v=71').then(m => m.default),
  '/collection': () => import('./views/collection.js?v=36').then(m => m.default),
};

// Routes with no tab of their own borrow another tab's highlight
const NAV_ALIAS = { '/feed': '/xplore', '/post': '/xplore', '/read': '/xplore', '/collection': '/xplore' };

// The rail carries XpLoRe, Live, the Publish disc, Search and your face, and the
// pages outside it open with their own title plus one arrow back to wherever the
// user came from. XpLoRe is excluded because its logo line is its header; the
// reader and the collection page render their own bar. The old topbar is hidden
// at both breakpoints, which is why this lives in the router instead.
const PAGE_TITLES = {
  '/search': 'Search',
  '/ping': 'Ping',
  '/wallet': 'Billing',
  '/alerts': 'Alerts',
  '/publish': 'Publish',
  '/live': 'Live',
  '/profile': 'Profile',
  '/settings': 'Settings',
  '/terms': 'Terms and Policy'
};

const BACK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>';

// Where a back affordance lands. The router keeps its own stack of committed
// routes instead of trusting browser history: the #/support redirect shim puts a
// hash in the history that the user never asked for, and a cold deep link leaves
// history empty, so history.back() can either loop or leave the app. The query
// string is part of the entry because ?chat= and ?name= decide what a page
// actually shows. Entries are shaped '/post?id=x' — the '#' is only ever added
// by urlFor() on hosts that still route by hash.
const backStack = [];
const SHIMS = ['/support'];

function remember(target) {
  const path = (target || '').split('?')[0];
  if (!path || path === '/' || SHIMS.includes(path)) return;
  if (backStack[backStack.length - 1] === target) return;
  backStack.push(target);
  if (backStack.length > 25) backStack.shift();
}

export function backTarget() {
  return backStack[backStack.length - 1] || '/xplore';
}

// For the back affordances that are buttons rather than links (the reader's
// Close, the collection hero arrow). Same shape as the click interceptor below
// so a back press never puts a '#' in the address bar, not even for a moment.
window.gliimBack = () => {
  const target = backTarget();
  if (window.location.hostname === 'dashboard.gliimu.com') {
    history.pushState(null, '', target);
    router();
  } else {
    window.location.hash = '#' + target;
  }
};

// Clean URLs: on dashboard.gliimu.com the address bar shows /xplore instead of
// /index.html#/xplore. The rest of the app still navigates by assigning
// location.hash, so the hashchange listener below rewrites each new hash into
// a clean history entry before the router runs. Hash-mode hosts (www) keep
// working exactly as before.
const HISTORY_MODE = window.location.hostname === 'dashboard.gliimu.com';

// Where the router should be: the clean path on the dashboard host, the hash
// fragment everywhere else. Always shaped like '/post?id=x' (no '#').
function routeTarget() {
  if (HISTORY_MODE) {
    const path = (window.location.pathname === '/' || window.location.pathname === '/index.html')
      ? '/xplore'
      : window.location.pathname;
    return path + (window.location.search || '');
  }
  return window.location.hash.slice(1) || '/xplore';
}

// Pages read the path and query through these instead of location.hash, so the
// same code answers both URL shapes.
window.gliimRoute = {
  path() { return routeTarget().split('?')[0] || '/xplore'; },
  query() { return routeTarget().split('?')[1] || ''; }
};

// Full URLs that open the app at a page — share links, QR codes, payment
// callbacks. Always the clean dashboard host, no matter where the code runs:
// the hash form is gone, and the cookie session spans .gliimu.com so a link
// opened from landing or admin lands signed-in.
window.gliimAppUrl = (path) => `https://dashboard.gliimu.com${path}`;

// A link target in the shape this host understands. On dashboard.gliimu.com it
// is a real path, so hovering or copying a nav link shows /xplore and nothing
// else. Everywhere else the app still routes by hash, so the same target keeps
// its '#'. The click interceptor below is what makes both shapes navigate
// without a page load.
function urlFor(target) {
  return HISTORY_MODE ? target : '#' + target;
}

if (HISTORY_MODE) {
  const toClean = () => {
    const v = window.location.hash.slice(1);
    return v.startsWith('/') ? v : '';
  };
  // Legacy hash links (old bookmarks, shared URLs) are cleaned on arrival.
  if (window.location.hash) {
    history.replaceState(null, '', toClean() || '/xplore');
  }
  window.addEventListener('hashchange', () => {
    history.replaceState(null, '', toClean() || '/xplore');
    router();
  });
  window.addEventListener('popstate', router);
}

// Clean hrefs only work as SPA navigation if clicks are intercepted — otherwise
// every nav link is a full page load that re-runs the session round trip, and on
// a host with no /xplore to serve it is a 404. Off the dashboard host the click
// becomes the hash write the app has always made. Modifier-clicks and target=
// links are left alone so "open in new tab" still behaves normally.
// Captured at the document, not bubbled: a link nested in a clickable card
// calls stopPropagation on itself to keep the card from opening, and that would
// also hide it from a bubble-phase listener here. Stopping propagation in the
// capture phase serves both jobs — the route changes and the card ignores it.
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = e.target.closest?.('a[href]');
  if (!link || link.target) return;

  const href = link.getAttribute('href');
  if (!href || !href.startsWith('/') || href.startsWith('//')) return;
  if (!routes[href.split('?')[0].replace(/\/+$/, '') || '/']) return;

  e.preventDefault();
  e.stopPropagation();
  if (HISTORY_MODE) {
    history.pushState(null, '', href);
    router();
  } else {
    window.location.hash = '#' + href;
  }
}, true);

function pageHeader(title) {
  const back = backTarget();
  return `<div class="page-header"><a class="page-back" href="${urlFor(back)}" aria-label="Back" title="Back">${BACK_ICON}</a><span class="page-title">${title}</span></div>`;
}

let previousTarget = routeTarget();
let currentView = null;
let navigationRequest = 0;

export async function router() {
  const path = routeTarget().split('?')[0];

  // 1. Intercept Navigation if Live Session is Active
  // Navigating to /live never prompts — the session continues on that page.
  if (path !== '/live' && window.liveInstance && window.liveInstance.isLiveActive && window.liveInstance.isLiveActive()) {
    // A call mounted inside the reader is torn down by that page on exit, so
    // navigation from it is never a forced end.
    if (window.liveInstance.isEmbedded && window.liveInstance.isEmbedded()) {
      // Fall through — let navigation happen normally
    } else if (window.liveInstance.isMinimized && window.liveInstance.isMinimized()) {
      // If minimized, allow navigation without ending the session
      // Fall through — let navigation happen normally
    } else {
      if (!await appConfirm("Do you want to leave the live session?", { okText: 'Leave', danger: true })) {
        history.replaceState(null, '', urlFor(previousTarget));
        return;
      }
      window.liveInstance.endLive(); // Force end live session
    }
  }

  // 2. Intercept Navigation if Modal is Open (from Feed)
  if (window.hubInstance && window.hubInstance.isModalOpen && window.hubInstance.isModalOpen()) {
    if (!await appConfirm("Would you like to close the modal?", { okText: 'Close' })) {
      history.replaceState(null, '', urlFor(previousTarget));
      return;
    }
    window.hubInstance.closeModal();
  }

  const incoming = routeTarget();
  if (backStack[backStack.length - 1] === incoming) {
    // Arrived here by pressing back, so the page being left is dropped from
    // the stack rather than stacked under itself.
    backStack.pop();
  } else if (previousTarget !== incoming) {
    remember(previousTarget);
  }
  previousTarget = incoming;

  await mount();
}

// Pull-to-refresh remounts the page you are already on. It deliberately skips
// the guards above (a refresh is not a navigation, so it must not ask about
// leaving a live session) and the back stack (the page is not being left).
export async function refreshCurrentView() {
  await mount();
}

async function mount() {
  const path = routeTarget().split('?')[0];
  const routeHandler = routes[path];

  const app = document.getElementById('app');
  const topbarDynamic = document.getElementById('topbar-dynamic-content');
  const topbarRightActions = document.getElementById('topbar-right-actions');

  const request = ++navigationRequest;
  currentView?.destroy?.();
  currentView = null;

  if (topbarDynamic) topbarDynamic.innerHTML = '';
  if (topbarRightActions) topbarRightActions.innerHTML = '';
  window.scrollTo(0, 0);

  const navPath = (NAV_ALIAS[path] || path).slice(1);
  document.querySelectorAll('.nav-item, .bottom-item').forEach(item => {
    item.classList.toggle('active', item.dataset.route === navPath);
  });

  if (routeHandler) {
    const view = await routeHandler();
    if (request !== navigationRequest) return;
    currentView = view;
    // A per-route class lets a page that fills the viewport (Ping) cancel the
    // header gap and the container's bottom padding instead of overflowing.
    app.className = `view-container view-${path.slice(1).replace(/[^a-z0-9-]/g, '')}`;
    app.innerHTML = (PAGE_TITLES[path] ? pageHeader(PAGE_TITLES[path]) : '') + view.template;
    if (view.init) {
      view.init();
    }
  } else {
    window.location.href = '/404.html';
  }
}
