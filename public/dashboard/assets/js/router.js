import { store } from './store.js';

const routes = {
  '/hub': () => import('./views/hub.js').then(m => m.default),
  '/library': () => import('./views/library.js').then(m => m.default),
  '/profile': () => import('./views/portfolio.js').then(m => m.default),
  '/applications': () => import('./views/applications.js').then(m => m.default),
  '/ping': () => import('./views/messages.js').then(m => m.default),
  '/wallet': () => import('./views/wallet.js').then(m => m.default),
  '/settings': () => import('./views/settings.js').then(m => m.default),
};

let previousHash = window.location.hash;

export async function router() {
  const hash = window.location.hash.slice(1) || '/hub';
  const routeHandler = routes[hash];

  const app = document.getElementById('app');
  const topbarDynamic = document.getElementById('topbar-dynamic-content');
  const topbarRightActions = document.getElementById('topbar-right-actions');

  // 1. Intercept Navigation if Modal is Open
  if (window.hubInstance && window.hubInstance.isModalOpen && window.hubInstance.isModalOpen()) {
    if (!confirm("Would you like to close the modal?")) {
      // User said "No". Revert URL to keep them on the current page.
      history.replaceState(null, '', previousHash);
      return; // Stop routing
    }
    // User said "Yes". Close the modal and proceed.
    window.hubInstance.closeModal();
  }

  // Update previous hash for next time
  previousHash = window.location.hash;

  // Clear topbar dynamic content when changing routes
  if (topbarDynamic) topbarDynamic.innerHTML = '';
  if (topbarRightActions) topbarRightActions.innerHTML = '';

  // Scroll to top on route change
  window.scrollTo(0, 0);

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('href') === `#${hash}`) {
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
