import { store } from './store.js';

// Every route names the role(s) that may open it; 'super' passes all of them
// because store.can() mirrors admin_has_role() in SQL. Multiple roles are
// space-separated (e.g. 'crm operations'). Hiding a nav link is cosmetics —
// the RLS policies and the RPC role checks are the real gate.
const routes = {
  '/submissions': { role: 'crm', title: 'Library Submissions', load: () => import('./views/submissions.js').then(m => m.default) },
  '/gliims': { role: 'crm', title: 'Gliim Approvals', load: () => import('./views/gliims.js').then(m => m.default) },
  '/reports': { role: 'crm', title: 'Reports', load: () => import('./views/reports.js').then(m => m.default) },
  '/content': { role: 'crm', title: 'FAQs, Legal & Contact', load: () => import('./views/content.js').then(m => m.default) },
  '/crm-members': { role: 'crm', title: 'Members', load: () => import('./views/crm-members.js?v=6').then(m => m.default) },
  '/support': { role: 'crm operations', title: 'Support Desk', load: () => import('./views/support.js?v=6').then(m => m.default) },
  '/finance': { role: 'registrar', title: 'Finance', load: () => import('./views/finance.js').then(m => m.default) },
  '/ledger': { role: 'registrar', title: 'Ledger', load: () => import('./views/ledger.js').then(m => m.default) },
  '/bills': { role: 'registrar', title: 'Bills', load: () => import('./views/bills.js').then(m => m.default) },
  '/revenue': { role: 'registrar', title: 'Revenue & Pricing', load: () => import('./views/revenue.js').then(m => m.default) },
  '/triads': { role: 'captain', title: 'Triads & Apprentices', load: () => import('./views/triads.js').then(m => m.default) },
  '/operations': { role: 'operations', title: 'Landing Page & App Release', load: () => import('./views/operations.js?v=5').then(m => m.default) },
  '/arena': { role: 'operations', title: 'Updates', load: () => import('./views/arena.js').then(m => m.default) },
  '/members': { role: 'operations', title: 'Members', load: () => import('./views/members.js?v=5').then(m => m.default) },
  '/admins': { role: 'super', title: 'Admins', load: () => import('./views/admins.js').then(m => m.default) }
};

const order = ['/submissions', '/gliims', '/reports', '/content', '/crm-members', '/support', '/finance', '/ledger', '/bills', '/revenue', '/triads', '/operations', '/arena', '/members', '/admins'];

export function firstRoute() {
  return order.find(path => {
    const roles = routes[path].role.split(/\s+/);
    return roles.some(r => store.can(r));
  }) || '/submissions';
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

  if (!route) {
    title.textContent = 'Not available';
    app.innerHTML = '<div class="empty">That screen does not exist.</div>';
    return;
  }

  const roles = route.role.split(/\s+/);
  if (!roles.some(r => store.can(r))) {
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
