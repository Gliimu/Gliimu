import { store } from './store.js';

const routes = {
  '/hub': () => import('./views/hub.js').then(m => m.default),
  '/library': () => import('./views/library.js').then(m => m.default),
  '/profile': () => import('./views/portfolio.js').then(m => m.default),
  '/applications': () => import('./views/applications.js').then(m => m.default),
  '/ping': () => import('./views/messages.js').then(m => m.default),
  '/live': () => import('./views/live.js').then(m => m.default),
  '/wallet': () => import('./views/wallet.js').then(m => m.default),
  '/settings': () => import('./views/settings.js').then(m => m.default),
};

let previousHash = window.location.hash;

export async function router() {
  const hash = window.location.hash.slice(1) || '/hub';
  // Deep links may carry a query string (e.g. #/applications?tab=deals)
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

  // 2. Intercept Navigation if Modal is Open (from Hub)
  if (window.hubInstance && window.hubInstance.isModalOpen && window.hubInstance.isModalOpen()) {
    if (!await appConfirm("Would you like to close the modal?", { okText: 'Close' })) {
      history.replaceState(null, '', previousHash);
      return;
    }
    window.hubInstance.closeModal();
  }

  previousHash = window.location.hash;

  if (topbarDynamic) topbarDynamic.innerHTML = '';
  if (topbarRightActions) topbarRightActions.innerHTML = '';
  window.scrollTo(0, 0);

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('href') === `#${path}`) {
      item.classList.add('active');
    }
  });

  if (routeHandler) {
    const view = await routeHandler();
    app.innerHTML = view.template;
    if (view.init) {
      view.init();
    }
  } else {
    app.innerHTML = '<h1>404 - Page Not Found</h1>';
  }
}
