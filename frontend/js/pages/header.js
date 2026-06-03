// header.js - Handles ALL header functionality

// ============================================
// INITIALIZE EVERYTHING
// ============================================
function initHeader() {
  console.log('Initializing header...');
  
  // Get mobile menu elements
  const menuToggle = document.getElementById('menuToggle');
  const mobileNav = document.getElementById('mobileNavMenu');
  const navOverlay = document.getElementById('navOverlay');
  
  console.log('menuToggle found:', !!menuToggle);
  console.log('mobileNav found:', !!mobileNav);
  console.log('navOverlay found:', !!navOverlay);
  
  // Setup mobile menu if elements exist
  if (menuToggle && mobileNav && navOverlay) {
    setupMobileMenu(menuToggle, mobileNav, navOverlay);
  } else {
    console.error('Mobile menu elements missing! Cannot setup hamburger.');
  }
  
  // Setup theme toggle
  setupThemeToggle();
  
  // Setup login modal
  setupLoginModal();
  
  // Update UI based on login state
  updateAuthUI();
}

// ============================================
// MOBILE MENU (Fixed)
// ============================================
function setupMobileMenu(menuToggle, mobileNav, navOverlay) {
  console.log('Setting up mobile menu...');
  
  // Remove any existing listeners by cloning
  const newToggle = menuToggle.cloneNode(true);
  menuToggle.parentNode.replaceChild(newToggle, menuToggle);
  
  const toggleMenu = () => {
    const isOpen = mobileNav.classList.contains('is-open');
    console.log('toggleMenu called, current state:', isOpen ? 'open' : 'closed');
    
    if (isOpen) {
      mobileNav.classList.remove('is-open');
      navOverlay.classList.remove('is-open');
      newToggle.classList.remove('is-open');
      console.log('Menu closed');
    } else {
      mobileNav.classList.add('is-open');
      navOverlay.classList.add('is-open');
      newToggle.classList.add('is-open');
      console.log('Menu opened');
    }
  };
  
  newToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    console.log('Hamburger clicked!');
    toggleMenu();
  });
  
  navOverlay.addEventListener('click', () => {
    console.log('Overlay clicked, closing menu');
    toggleMenu();
  });
  
  document.addEventListener('click', (e) => {
    if (mobileNav.classList.contains('is-open') && 
        !mobileNav.contains(e.target) && 
        !newToggle.contains(e.target)) {
      console.log('Clicked outside, closing menu');
      toggleMenu();
    }
  });
  
  mobileNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      console.log('Link clicked, closing menu');
      toggleMenu();
    });
  });
  
  console.log('Mobile menu setup complete!');
}

// ============================================
// THEME TOGGLE
// ============================================
function setupThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) {
    console.log('Theme toggle not found');
    return;
  }
  
  const body = document.body;
  
  // Apply saved theme
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    body.classList.add('dark-mode');
  } else {
    body.classList.add('dark-mode');
  }
  
  function updateIcons() {
    const isDark = body.classList.contains('dark-mode');
    const sunIcon = themeToggle.querySelector('.icon-sun');
    const moonIcon = themeToggle.querySelector('.icon-moon');
    if (sunIcon && moonIcon) {
      sunIcon.style.display = isDark ? 'block' : 'none';
      moonIcon.style.display = isDark ? 'none' : 'block';
    }
  }
  
  updateIcons();
  
  themeToggle.addEventListener('click', () => {
    body.classList.toggle('dark-mode');
    const isDark = body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateIcons();
  });
  
  console.log('Theme toggle setup complete');
}

// ============================================
// LOGIN MODAL
// ============================================
function setupLoginModal() {
  const modal = document.getElementById('loginModal');
  if (!modal) {
    console.log('Login modal not found');
    return;
  }
  
  window.openLoginModal = () => {
    console.log('Opening login modal');
    modal.classList.add('active');
  };
  
  const closeModal = () => {
    console.log('Closing login modal');
    modal.classList.remove('active');
  };
  
  const closeBtn = document.getElementById('closeLoginBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector('.submit-btn');
      const originalText = btn.textContent;
      btn.textContent = 'Verifying...';
      btn.disabled = true;
      
      const username = document.getElementById('loginUsername')?.value || 
                       document.getElementById('loginEmail')?.value || '';
      const password = document.getElementById('loginPassword')?.value || '';
      
      let role = 'Student';
      let name = 'Demo Student';
      let redirectUrl = 'user.html';
      
      if (username.toLowerCase().includes('instructor')) {
        role = 'Instructor';
        name = 'Demo Instructor';
        redirectUrl = 'instructor.html';
      } else if (username.toLowerCase().includes('admin')) {
        role = 'Admin';
        name = 'Super Admin';
        redirectUrl = 'dashtypex.html';
      }
      
      const user = {
        username: username,
        name: name,
        email: `${username}@gliimu.com`,
        role: role,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
      };
      
      localStorage.setItem('gliimu_user', JSON.stringify(user));
      window.location.href = redirectUrl;
    });
  }
  
  console.log('Login modal setup complete');
}

// ============================================
// UPDATE UI BASED ON LOGIN STATE
// ============================================
function updateAuthUI() {
  const user = localStorage.getItem('gliimu_user');
  const navRight = document.getElementById('navRight');
  
  if (!navRight) return;
  
  if (user) {
    const userData = JSON.parse(user);
    const avatarUrl = userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}&background=random`;
    
    let dashboardUrl = 'user.html';
    if (userData.role === 'Instructor') dashboardUrl = 'instructor.html';
    if (userData.role === 'Admin') dashboardUrl = 'dashtypex.html';
    
    navRight.innerHTML = `
      <div class="profile-wrapper">
        <img src="${avatarUrl}" alt="Profile" class="header-profile-img">
        <span class="dropdown-arrow"><i class="fas fa-chevron-down"></i></span>
        <div class="profile-dropdown">
          <a href="${dashboardUrl}" class="dropdown-item">
            <i class="fa-solid fa-gauge-high"></i> Dashboard
          </a>
          <a href="#" onclick="logout()" class="dropdown-item">
            <i class="fas fa-sign-out-alt"></i> Sign Out
          </a>
        </div>
      </div>
      <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode">
        <svg class="icon-sun" viewBox="0 0 24 24" width="20" height="20">
          <circle cx="12" cy="12" r="5" stroke="currentColor" fill="none"></circle>
          <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor"></line>
          <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor"></line>
          <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor"></line>
          <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor"></line>
        </svg>
        <svg class="icon-moon" viewBox="0 0 24 24" width="20" height="20">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" fill="none"></path>
        </svg>
      </button>
    `;
    
    // Setup dropdown
    const profileWrapper = document.querySelector('.profile-wrapper');
    const profileDropdown = document.querySelector('.profile-dropdown');
    if (profileWrapper && profileDropdown) {
      profileWrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('active');
      });
      document.addEventListener('click', () => {
        profileDropdown.classList.remove('active');
      });
    }
    
    setupThemeToggle();
    
  } else {
    navRight.innerHTML = `
      <a href="#" onclick="openLoginModal(); return false;" class="nav-btn primary">Sign in</a>
      <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode">
        <svg class="icon-sun" viewBox="0 0 24 24" width="20" height="20">
          <circle cx="12" cy="12" r="5" stroke="currentColor" fill="none"></circle>
          <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor"></line>
          <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor"></line>
          <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor"></line>
          <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor"></line>
        </svg>
        <svg class="icon-moon" viewBox="0 0 24 24" width="20" height="20">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" fill="none"></path>
        </svg>
      </button>
    `;
    setupThemeToggle();
  }
}

// Logout function
window.logout = function() {
  console.log('Logging out');
  localStorage.removeItem('gliimu_user');
  window.location.reload();
};

// ============================================
// WAIT FOR PARTIALS TO LOAD
// ============================================
function waitForHeader() {
  // If header is already in DOM
  if (document.querySelector('header')) {
    console.log('Header found immediately');
    initHeader();
    return;
  }
  
  // If using partials, wait for them
  if (document.getElementById('header-placeholder')) {
    console.log('Waiting for partials to load...');
    const observer = new MutationObserver(function(mutations, obs) {
      if (document.querySelector('header')) {
        console.log('Header detected by observer');
        obs.disconnect();
        initHeader();
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Fallback timeout
    setTimeout(function() {
      if (document.querySelector('header')) {
        console.log('Header found via timeout');
        initHeader();
      } else {
        console.error('Header not found after timeout! Check if partials are loading.');
      }
      observer.disconnect();
    }, 3000);
  } else {
    console.log('No header placeholder found, checking again in 1 second...');
    setTimeout(waitForHeader, 1000);
  }
}

// Start everything when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM ready');
  waitForHeader();
});