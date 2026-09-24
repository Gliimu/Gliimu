// Dark/Light theme toggle logic
// Prevent FOUC (Flash of Unstyled Content) - Run this immediately in HTML head
(function() {
  const saved = localStorage.getItem('gliimu-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
})();

// Toggle function to attach to buttons
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('gliimu-theme', next);
}
