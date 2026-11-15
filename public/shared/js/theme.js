// The choice lives in a .gliimu.com cookie as well as localStorage: storage is
// per-origin, so gliimu.com and dashboard.gliimu.com would each keep their own.
const THEME_KEY = 'gliimu-theme';

function readCookieTheme() {
  const hit = document.cookie.match(/(?:^|;\s*)gliimu-theme=([^;]*)/);
  return hit ? decodeURIComponent(hit[1]) : '';
}

function currentTheme() {
  const saved = readCookieTheme() || localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.cookie = `${THEME_KEY}=${theme}; path=/; domain=.gliimu.com; max-age=31536000; SameSite=Lax`;
}

(function() {
  document.documentElement.setAttribute('data-theme', currentTheme());
})();

// Helper to swap icons
function updateThemeIcon() {
  const theme = document.documentElement.getAttribute('data-theme');
  const sun = document.getElementById('sun-icon');
  const moon = document.getElementById('moon-icon');
  if (sun && moon) {
    if (theme === 'dark') {
      sun.style.display = 'block';
      moon.style.display = 'none';
    } else {
      sun.style.display = 'none';
      moon.style.display = 'block';
    }
  }
}

// Run on load
document.addEventListener('DOMContentLoaded', updateThemeIcon);

// Toggle function
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  saveTheme(next);
  updateThemeIcon();
}
