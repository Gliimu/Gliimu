import { store } from './store.js';

const routes = {
  '/hub': () => import('./views/hub.js').then(m => m.default),
  '/library': () => import('./views/library.js').then(m => m.default),
  '/portfolio': () => import('./views/portfolio.js').then(m => m.default),
  '/applications': () => import('./views/applications.js').then(m => m.default),
  '/messages': () => import('./views/messages.js').then(m => m.default),
  '/wallet': () => import('./views/wallet.js').then(m => m.default),
  '/settings': () => import('./views/settings.js').then(m => m.default),
};

export async function router() {
  const hash = window.location.hash.slice(1) || '/hub';
  const routeHandler = routes[hash];

  const app = document.getElementById('app');
  const pageTitle = document.getElementById('page-title');

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
    pageTitle.innerText = view.title;

    if (view.init) {
      view.init();
    }
  } else {
    app.innerHTML = '<h1>404 - Page Not Found</h1>';
  }
}
