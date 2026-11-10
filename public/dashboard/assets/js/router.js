const routes = {
  '/alerts': () => import('./views/alerts.js?v=16').then(m => m.default),
  '/search': () => import('./views/search.js?v=17').then(m => m.default),
  '/xplore': () => import('./views/xplore.js?v=121').then(m => m.default),
  '/feed': () => import('./views/xplore.js?v=121').then(m => m.default),
  '/ping': () => import('./views/ping.js?v=68').then(m => m.default),
  '/wallet': () => import('./views/billing.js?v=49').then(m => m.default),
  '/settings': () => import('./views/settings.js?v=9').then(m => m.default),
  '/terms': () => import('./views/terms.js?v=1').then(m => m.default),
  '/live': () => import('./views/live.js?v=54').then(m => m.default),
  '/publish': () => import('./views/publish.js?v=24').then(m => m.default),
  '/support': () => { window.location.hash = '#/ping'; return Promise.resolve({ title: 'Ping', template: '', init() {}, destroy() {} }); },
  '/profile': () => import('./views/profile.js?v=100').then(m => m.default),
  '/post': () => import('./views/reader.js?v=70').then(m => m.default),
  '/read': () => import('./views/reader.js?v=70').then(m => m.default),
  '/collection': () => import('./views/collection.js?v=35').then(m => m.default),
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
// actually shows.
const backStack = [];
const SHIMS = ['/support'];

function remember(hash) {
  const path = (hash || '').split('?')[0];
  if (!path || path === '#' || SHIMS.includes(path)) return;
  if (backStack[backStack.length - 1] === hash) return;
  backStack.push(hash);
  if (backStack.length > 25) backStack.shift();
}

export function backTarget() {
  return backStack[backStack.length - 1] || '#/xplore';
}

// For the back affordances that are buttons rather than links (the reader's
// Close, the collection hero arrow).
window.gliimBack = () => { window.location.hash = backTarget(); };

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

function pageHeader(title) {
  const back = backTarget();
  return `<div class="page-header"><a class="page-back" href="${back}" aria-label="Back" title="Back">${BACK_ICON}</a><span class="page-title">${title}</span></div>`;
}

let previousHash = '#' + routeTarget();
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
        history.replaceState(null, '', HISTORY_MODE ? previousHash.slice(1) : previousHash);
        return;
      }
      window.liveInstance.endLive(); // Force end live session
    }
  }

  // 2. Intercept Navigation if Modal is Open (from Feed)
  if (window.hubInstance && window.hubInstance.isModalOpen && window.hubInstance.isModalOpen()) {
    if (!await appConfirm("Would you like to close the modal?", { okText: 'Close' })) {
      history.replaceState(null, '', HISTORY_MODE ? previousHash.slice(1) : previousHash);
      return;
    }
    window.hubInstance.closeModal();
  }

  const incoming = '#' + routeTarget();
  if (backStack[backStack.length - 1] === incoming) {
    // Arrived here by pressing back, so the page being left is dropped from
    // the stack rather than stacked under itself.
    backStack.pop();
  } else if (previousHash !== incoming) {
    remember(previousHash);
  }
  previousHash = incoming;

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
