import { store } from './store.js';

// Every route names the role that may open it; 'super' passes all of them
// because store.can() mirrors admin_has_role() in SQL. Hiding a nav link is
// cosmetics — the RLS policies and the RPC role checks are the real gate.
const routes = {
  '/submissions': { role: 'crm', title: 'Library Submissions', load: () => import('./views/submissions.js').then(m => m.default) },
  '/reports': { role: 'crm', title: 'Reports', load: () => import('./views/reports.js').then(m => m.default) },
  '/content': { role: 'crm', title: 'FAQs & Legal', load: () => import('./views/content.js').then(m => m.default) },
  '/finance': { role: 'registrar', title: 'Finance', load: () => import('./views/finance.js').then(m => m.default) },
  '/ledger': { role: 'registrar', title: 'Ledger', load: () => import('./views/ledger.js').then(m => m.default) },
  '/members': { role: 'registrar', title: 'Members', load: () => import('./views/members.js').then(m => m.default) },
  '/bills': { role: 'registrar', title: 'Bills', load: () => import('./views/bills.js').then(m => m.default) },
  '/revenue': { role: 'registrar', title: 'Revenue & Pricing', load: () => import('./views/revenue.js').then(m => m.default) },
  '/triads': { role: 'captain', title: 'Triads & Apprentices', load: () => import('./views/triads.js').then(m => m.default) },
  '/admins': { role: 'super', title: 'Admins', load: () => import('./views/admins.js').then(m => m.default) }
};

const order = ['/submissions', '/reports', '/content', '/finance', '/ledger', '/members', '/bills', '/revenue', '/triads', '/admins'];

export function firstRoute() {
  return order.find(path => store.can(routes[path].role)) || '/submissions';
}

export async function router() {
  const hash = window.location.hash.slice(1) || firstRoute();
  const path = hash.split('?')[0];
  const route = routes[path];

  const app = document.getElementById('app');
  const title = document.getElementById('page-title');

  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('href') === `#${path}`);
  });
  document.body.classList.remove('sidebar-open');

  if (!route || !store.can(route.role)) {
    title.textContent = 'Not available';
    app.innerHTML = '<div class="empty">Your role cannot open that screen.</div>';
    return;
  }

  title.textContent = route.title;
  app.innerHTML = '<p class="loading">Loading...</p>';

  const view = await route.load();
  app.innerHTML = view.template;
  if (view.init) await view.init();
}
