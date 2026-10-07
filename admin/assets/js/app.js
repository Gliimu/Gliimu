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

  // Nav items and section labels both carry data-role; a role that cannot
  // open a screen never sees the link.
  document.querySelectorAll('[data-role]').forEach((el) => {
    el.hidden = !store.can(el.dataset.role);
  });
}

async function refreshCounts() {
  if (!store.can('crm')) return;

  const [{ count: pending }, { count: open }] = await Promise.all([
    supabase.from('library_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open')
  ]);

  setCount('count-submissions', pending);
  setCount('count-reports', open);
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
