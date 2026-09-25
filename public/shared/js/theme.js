// Prevent FOUC (Flash of Unstyled Content) - Run this immediately in HTML head
(function() {
  const saved = localStorage.getItem('gliimu-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
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
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('gliimu-theme', next);
  updateThemeIcon();
}
