import { supabase } from './config.js';
import { store } from './store.js';
import { router, firstRoute } from './router.js';

// ============================================
// GATE — three states: signing in, signed in but
// not an admin, and the shell itself.
// ============================================

function showGate(which) {
  const gate = document.getElementById('gate');
  const shell = document.getElementById('shell');
  gate.hidden = false;
  shell.hidden = true;
  document.getElementById('gate-signin').hidden = which !== 'signin';
  document.getElementById('gate-denied').hidden = which !== 'denied';
}

function showShell() {
  document.getElementById('gate').hidden = true;
  document.getElementById('shell').hidden = false;

  document.getElementById('admin-name').textContent = store.displayName;
  document.getElementById('admin-role').textContent = store.roleLabel;

  const avatarEl = document.getElementById('admin-avatar');
  if (store.profile && store.profile.avatar_url) {
    avatarEl.src = store.profile.avatar_url;
    avatarEl.hidden = false;
  }

  // Nav items and section labels carry data-role; a role that cannot open a
  // screen never sees the link. Multiple roles are space-separated
  // (data-role="crm operations") so the link shows for any listed role.
  document.querySelectorAll('[data-role]').forEach((el) => {
    const roles = el.dataset.role.split(/\s+/);
    el.hidden = !roles.some(r => store.can(r));
  });

  // Super sees every role, which means shared tabs (Members in ops + CRM,
  // Gigs in captain + ops) would render twice. The data-dup attribute marks
  // the secondary occurrence; hide it for super so each tab appears once.
  if (store.role === 'super') {
    document.querySelectorAll('[data-dup]').forEach(el => { el.hidden = true; });
  }

  // Section labels that end up with no visible links underneath should hide
  // themselves — otherwise super sees empty "CRM" / "Captain" headings.
  document.querySelectorAll('.nav-label[data-role]').forEach(label => {
    const roles = label.dataset.role.split(/\s+/);
    if (!roles.some(r => store.can(r))) { label.hidden = true; return; }
    let next = label.nextElementSibling;
    let anyVisible = false;
    while (next && !next.classList.contains('nav-label')) {
      if (next.classList.contains('nav-item') && !next.hidden) anyVisible = true;
      next = next.nextElementSibling;
    }
    label.hidden = !anyVisible;
  });
}

async function refreshCounts() {
  if (store.can('crm')) {
    const [{ count: pending }, { count: open }, { count: gliims }] = await Promise.all([
      supabase.from('library_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    ]);

    setCount('count-submissions', pending);
    setCount('count-reports', open);
    setCount('count-gliims', gliims);
  }

  // p_limit 1 keeps this cheap: the RPC returns the full total regardless.
  // A database without sql/captain.sql yet just answers an error, and the
  // badge stays hidden.
  if (store.can('captain')) {
    const { data } = await supabase.rpc('captain_queue', { p_limit: 1 });
    if (data && data.ok) setCount('count-triads', Number(data.total || 0));
  }

  if (store.can('captain') || store.can('operations')) {
    const { count } = await supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .in('status', ['queued', 'in_progress']);
    setCount('count-gigs', count || 0);
  }
}

function setCount(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = n > 99 ? '99+' : String(n || 0);
  el.hidden = !n;
}

// ============================================
// BOOT
// ============================================

async function boot() {
  const user = await store.fetchSession();

  if (!user) {
    showGate('signin');
    return;
  }

  if (!store.role) {
    const who = store.displayName;
    document.getElementById('denied-detail').textContent =
      `${who}, your Gliimu account holds no admin role. Ask a super admin to grant you one, then sign in again.`;
    showGate('denied');
    return;
  }

  showShell();
  if (!window.location.hash) window.location.hash = `#${firstRoute()}`;

  window.addEventListener('hashchange', router);
  await router();
  refreshCounts();
  setInterval(refreshCounts, 60000);
}

// ============================================
// WIRING
// ============================================

window.adminApp = { refreshCounts };

document.getElementById('signin-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;
  const errorEl = document.getElementById('signin-error');
  const btn = document.getElementById('signin-btn');

  errorEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    const user = await store.signIn(email, password);
    if (!user || !store.role) {
      // Signed in, but this account is not staff. Sign straight back out so
      // the session never sits live on the admin origin.
      await supabase.auth.signOut();
      store.user = null;
      store.role = null;
      errorEl.textContent = 'That account holds no admin role.';
      return;
    }
    window.location.reload();
  } catch (err) {
    errorEl.textContent = err.message === 'Invalid login credentials'
      ? 'Wrong email or password.'
      : (err.message || 'Sign-in failed.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

document.getElementById('denied-signout').addEventListener('click', () => store.signOut());
document.getElementById('signout-btn').addEventListener('click', () => store.signOut());

document.getElementById('menu-toggle').addEventListener('click', () => {
  document.body.classList.toggle('sidebar-open');
});

document.addEventListener('click', (e) => {
  if (!document.body.classList.contains('sidebar-open')) return;
  const sidebar = document.getElementById('sidebar');
  if (sidebar.contains(e.target) || e.target.closest('#menu-toggle')) return;
  document.body.classList.remove('sidebar-open');
});

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('gliimu-admin-theme', next);
});

boot();
