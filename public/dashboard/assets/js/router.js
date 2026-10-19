const routes = {
  '/support': () => import('./views/support.js?v=30').then(m => m.default),
  '/feed': () => import('./views/feed.js?v=38').then(m => m.default),
  '/xplore': () => import('./views/updates.js?v=35').then(m => m.default),
  '/ping': () => import('./views/ping.js?v=36').then(m => m.default),
  '/wallet': () => import('./views/wallet.js?v=30').then(m => m.default),
  '/settings': () => import('./views/settings.js').then(m => m.default),
  // Deep links only: Live is folded into Ping, Profile opens from the avatar
  '/live': () => import('./views/live.js').then(m => m.default),
  '/profile': () => import('./views/profile.js?v=35').then(m => m.default),
};

// Routes with no sidebar entry borrow another tab's highlight
const NAV_ALIAS = { '/live': '/ping' };

let previousHash = window.location.hash;
let currentView = null;
let navigationRequest = 0;

export async function router() {
  const hash = window.location.hash.slice(1) || '/feed';
  // Deep links may carry a query string (e.g. #/ping?chat=<id>)
  const path = hash.split('?')[0];
  const routeHandler = routes[path];

  const app = document.getElementById('app');
  const topbarDynamic = document.getElementById('topbar-dynamic-content');
  const topbarRightActions = document.getElementById('topbar-right-actions');

  // 1. Intercept Navigation if Live Session is Active
  if (window.liveInstance && window.liveInstance.isLiveActive && window.liveInstance.isLiveActive()) {
    if (!await appConfirm("Do you want to leave the live session?", { okText: 'Leave', danger: true })) {
      history.replaceState(null, '', previousHash);
      return;
    }
    window.liveInstance.endLive(); // Force end live session
  }

  // 2. Intercept Navigation if Modal is Open (from Feed)
  if (window.hubInstance && window.hubInstance.isModalOpen && window.hubInstance.isModalOpen()) {
    if (!await appConfirm("Would you like to close the modal?", { okText: 'Close' })) {
      history.replaceState(null, '', previousHash);
      return;
    }
    window.hubInstance.closeModal();
  }

  previousHash = window.location.hash;
  const request = ++navigationRequest;
  currentView?.destroy?.();
  currentView = null;

  if (topbarDynamic) topbarDynamic.innerHTML = '';
  if (topbarRightActions) topbarRightActions.innerHTML = '';
  window.scrollTo(0, 0);

  const navPath = NAV_ALIAS[path] || path;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('href') === `#${navPath}`) {
      item.classList.add('active');
    }
  });

  if (routeHandler) {
    const view = await routeHandler();
    if (request !== navigationRequest) return;
    currentView = view;
    app.innerHTML = view.template;
    if (view.init) {
      view.init();
    }
  } else {
    window.location.href = '/404.html';
  }
}
