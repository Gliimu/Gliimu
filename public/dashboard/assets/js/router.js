const routes = {
  '/alerts': () => import('./views/alerts.js?v=12').then(m => m.default),
  '/search': () => { window.location.hash = '#/xplore'; return Promise.resolve({ title: 'XpLoRe', template: '', init() {}, destroy() {} }); },
  '/xplore': () => import('./views/feed.js?v=102').then(m => m.default),
  '/feed': () => import('./views/feed.js?v=102').then(m => m.default),
  '/ping': () => import('./views/ping.js?v=63').then(m => m.default),
  '/wallet': () => import('./views/wallet.js?v=46').then(m => m.default),
  '/settings': () => import('./views/settings.js?v=8').then(m => m.default),
  '/terms': () => import('./views/terms.js').then(m => m.default),
  '/live': () => import('./views/live-page.js?v=45').then(m => m.default),
  '/publish': () => import('./views/publish.js?v=10').then(m => m.default),
  '/support': () => { window.location.hash = '#/ping'; return Promise.resolve({ title: 'Ping', template: '', init() {}, destroy() {} }); },
  '/profile': () => import('./views/profile.js?v=82').then(m => m.default),
  '/post': () => import('./views/post-read.js?v=51').then(m => m.default),
  '/read': () => import('./views/post-read.js?v=51').then(m => m.default),
  '/collection': () => import('./views/collection.js?v=21').then(m => m.default),
};

// Routes with no tab of their own borrow another tab's highlight
const NAV_ALIAS = { '/search': '/xplore', '/feed': '/xplore', '/post': '/xplore', '/read': '/xplore', '/collection': '/xplore' };

// The rail only carries XpLoRe, Ping and Billing now, so every other page opens
// with its own title and one arrow back to wherever the user came from. The old
// topbar is hidden at both breakpoints, which is why this lives in the router
// instead. The reader and the collection page are excluded: they already render
// their own bar.
const PAGE_TITLES = {
  '/ping': 'Ping',
  '/wallet': 'Billing',
  '/alerts': 'Alerts',
  '/publish': 'Publish',
  '/profile': 'Profile',
  '/settings': 'Settings',
  '/terms': 'Terms and Policy'
};

const BACK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>';

// Where a back affordance lands. The router keeps its own stack of committed
// routes instead of trusting browser history: the #/search and #/support
// redirect shims put a hash in the history that the user never asked for, and
// a cold deep link leaves history empty, so history.back() can either loop or
// leave the app. The query string is part of the entry because ?chat= and
// ?name= decide what a page actually shows.
const backStack = [];
const SHIMS = ['/search', '/support'];

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

function pageHeader(title) {
  const back = backTarget();
  return `<div class="page-header"><a class="page-back" href="${back}" aria-label="Back" title="Back">${BACK_ICON}</a><span class="page-title">${title}</span></div>`;
}

let previousHash = window.location.hash || '#/xplore';
let currentView = null;
let navigationRequest = 0;

export async function router() {
  const hash = window.location.hash.slice(1) || '/xplore';
  // Deep links may carry a query string (e.g. #/ping?chat=<id>)
  const path = hash.split('?')[0];
  const routeHandler = routes[path];

  const app = document.getElementById('app');
  const topbarDynamic = document.getElementById('topbar-dynamic-content');
  const topbarRightActions = document.getElementById('topbar-right-actions');

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
        history.replaceState(null, '', previousHash);
        return;
      }
      window.liveInstance.endLive(); // Force end live session
    }
  }

  // 2. Intercept Navigation if Modal is Open (from Feed)
  if (window.hubInstance && window.hubInstance.isModalOpen && window.hubInstance.isModalOpen()) {
    if (!await appConfirm("Would you like to close the modal?", { okText: 'Close' })) {
      history.replaceState(null, '', previousHash);
      return;
    }
    window.hubInstance.closeModal();
  }

  const incoming = window.location.hash || '#/xplore';
  if (backStack[backStack.length - 1] === incoming) {
    // Arrived here by pressing back, so the page being left is dropped from
    // the stack rather than stacked under itself.
    backStack.pop();
  } else if (previousHash !== incoming) {
    remember(previousHash);
  }
  previousHash = incoming;
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
