// Theme Module - Handles dark/light mode

// Initialize theme on page load
export function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
  
  updateThemeToggleButton();
}

// Toggle theme
export function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeToggleButton();
}

// Update the toggle button icon
export function updateThemeToggleButton() {
  const toggleBtn = document.getElementById('themeToggle');
  if (!toggleBtn) return;
  
  const isDark = document.body.classList.contains('dark-mode');
  const sunIcon = toggleBtn.querySelector('.icon-sun');
  const moonIcon = toggleBtn.querySelector('.icon-moon');
  
  if (sunIcon && moonIcon) {
    if (isDark) {
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    } else {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    }
  }
}

// Setup theme toggle event listener
export function setupThemeToggle() {
  const toggleBtn = document.getElementById('themeToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleTheme);
  }
}

// Auto-run when script loads
if (typeof document !== 'undefined') {
  initTheme();
}