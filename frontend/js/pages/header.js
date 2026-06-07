// header.js - Complete Header Functionality with Supabase Integration

// ============================================
// GLOBAL VARIABLES
// ============================================
let currentUser = null;

// Import Supabase auth functions (will be loaded as module)
import { supabase, signIn, signUp, signOut, getCurrentUser, isAuthenticated } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// HEADER SCROLL EFFECT (Shadow on scroll)
// ============================================
function initHeaderScroll() {
  const header = document.querySelector('header');
  if (!header) return;
  
  function updateHeaderShadow() {
    if (window.scrollY > 10) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }
  
  window.addEventListener('scroll', updateHeaderShadow);
  updateHeaderShadow();
}

// ============================================
// ACTIVE PAGE DETECTION
// ============================================
function initActivePageDetection() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('.nav-links a, .mobile-nav-menu a');
  
  navLinks.forEach(link => {
    const linkHref = link.getAttribute('href');
    if (linkHref === currentPage) {
      link.classList.add('active');
    } else if (currentPage === 'index.html' && linkHref === 'index.html') {
      link.classList.add('active');
    } else if (currentPage === '' && linkHref === 'index.html') {
      link.classList.add('active');
    } else if (currentPage === 'dashboard.html' && linkHref === 'dashboard.html') {
      link.classList.add('active');
    } else if (currentPage === 'application.html' && linkHref === 'application.html') {
      link.classList.add('active');
    } else if (currentPage === 'library.html' && linkHref === 'library.html') {
      link.classList.add('active');
    } else if (currentPage === 'hub.html' && linkHref === 'hub.html') {
      link.classList.add('active');
    } else if (currentPage === 'course.html' && linkHref === 'course.html') {
      link.classList.add('active');
    } else if (currentPage === 'about.html' && linkHref === 'about.html') {
      link.classList.add('active');
    } else if (currentPage === 'contact.html' && linkHref === 'contact.html') {
      link.classList.add('active');
    } else if (currentPage === 'faq.html' && linkHref === 'faq.html') {
      link.classList.add('active');
    }
  });
}

// ============================================
// SUPABASE AUTH FUNCTIONS
// ============================================

// Handle login with Supabase
async function handleLogin(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (error) throw error;
    
    // Get user profile from database
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();
    
    if (profileError) {
      console.error('Profile fetch error:', profileError);
    }
    
    // Store user data in localStorage
    const userData = {
      id: data.user.id,
      email: data.user.email,
      name: profile?.name || data.user.user_metadata?.name || 'User',
      role: profile?.role || 'student',
      plan: profile?.plan || 'basic',
      walletBalance: profile?.wallet_balance || 25000,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.name || 'User')}&background=fbb040&color=fff`
    };
    
    localStorage.setItem('glimu_user', JSON.stringify(userData));
    localStorage.setItem('supabase_token', data.session.access_token);
    
    showToast(`Welcome back, ${userData.name}!`, 'success');
    
    // Redirect based on role
    setTimeout(() => {
      if (userData.role === 'admin') {
        window.location.href = '/admin-dashboard.html';
      } else {
        window.location.href = '/dashboard.html';
      }
    }, 1000);
    
    return { success: true, user: userData };
    
  } catch (error) {
    console.error('Sign in error:', error);
    showToast(error.message || 'Invalid email or password', 'error');
    return { success: false, error: error.message };
  }
}

// Handle signup with Supabase
async function handleSignup(name, email, password, confirmPassword) {
  // Validation
  if (!name || !email || !password) {
    showToast('Please fill in all fields', 'error');
    return { success: false };
  }
  
  if (password !== confirmPassword) {
    showToast('Passwords do not match', 'error');
    return { success: false };
  }
  
  if (password.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return { success: false };
  }
  
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          name: name,
          role: 'student'
        }
      }
    });
    
    if (error) throw error;
    
    if (data.user) {
      showToast('Account created successfully! Please sign in.', 'success');
      
      // Switch to login form
      const signupContainer = document.getElementById('signupFormContainer');
      const loginContainer = document.getElementById('loginFormContainer');
      if (signupContainer && loginContainer) {
        signupContainer.style.display = 'none';
        loginContainer.style.display = 'block';
      }
    }
    
    return { success: true, user: data.user };
    
  } catch (error) {
    console.error('Sign up error:', error);
    showToast(error.message || 'Failed to create account', 'error');
    return { success: false, error: error.message };
  }
}

// Handle logout
async function handleLogout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    localStorage.removeItem('glimu_user');
    localStorage.removeItem('supabase_token');
    
    showToast('Signed out successfully', 'success');
    
    setTimeout(() => {
      window.location.href = '/index.html';
    }, 1000);
    
    return { success: true };
    
  } catch (error) {
    console.error('Sign out error:', error);
    showToast('Failed to sign out', 'error');
    return { success: false };
  }
}

// Get current user from localStorage
function getLocalUser() {
  const user = localStorage.getItem('glimu_user');
  return user ? JSON.parse(user) : null;
}

// ============================================
// THEME TOGGLE (Dark/Light Mode)
// ============================================
function initThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) return;
  
  const body = document.body;
  
  // Apply saved theme
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    body.classList.add('dark-mode');
  } else if (savedTheme === 'light') {
    body.classList.remove('dark-mode');
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
}

// ============================================
// MOBILE MENU (Hamburger)
// ============================================
function initMobileMenu() {
  const menuToggle = document.getElementById('menuToggle');
  const mobileNav = document.getElementById('mobileNavMenu');
  const navOverlay = document.getElementById('navOverlay');
  
  if (!menuToggle || !mobileNav || !navOverlay) {
    console.log('Mobile menu elements not found');
    return;
  }
  
  const toggleMenu = () => {
    const isOpen = mobileNav.classList.contains('is-open');
    if (isOpen) {
      mobileNav.classList.remove('is-open');
      navOverlay.classList.remove('is-open');
      menuToggle.classList.remove('is-open');
      document.body.style.overflow = '';
    } else {
      mobileNav.classList.add('is-open');
      navOverlay.classList.add('is-open');
      menuToggle.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }
  };
  
  // Remove any existing listeners to avoid duplicates
  const newToggle = menuToggle.cloneNode(true);
  menuToggle.parentNode.replaceChild(newToggle, menuToggle);
  
  newToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });
  
  navOverlay.addEventListener('click', toggleMenu);
  
  document.addEventListener('click', (e) => {
    if (mobileNav.classList.contains('is-open') && 
        !mobileNav.contains(e.target) && 
        !newToggle.contains(e.target)) {
      toggleMenu();
    }
  });
  
  mobileNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', toggleMenu);
  });
  
  console.log('Mobile menu initialized');
}

// ============================================
// LOGIN MODAL (Updated with Supabase)
// ============================================
function initLoginModal() {
  const modal = document.getElementById('loginModal');
  if (!modal) return;
  
  // Open modal function (global for onclick)
  window.openLoginModal = function() {
    // Reset forms
    const loginContainer = document.getElementById('loginFormContainer');
    const signupContainer = document.getElementById('signupFormContainer');
    if (loginContainer) loginContainer.style.display = 'block';
    if (signupContainer) signupContainer.style.display = 'none';
    
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    if (loginForm) loginForm.reset();
    if (signupForm) signupForm.reset();
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  };
  
  // Close modal function
  const closeModal = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  };
  
  // Close on X button
  const closeBtn = document.getElementById('closeLoginModal');
  if (closeBtn) {
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener('click', closeModal);
  }
  
  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
  
  // Switch to signup form
  const showSignupBtn = document.getElementById('showSignupBtn');
  if (showSignupBtn) {
    const newSignupBtn = showSignupBtn.cloneNode(true);
    showSignupBtn.parentNode.replaceChild(newSignupBtn, showSignupBtn);
    newSignupBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const loginContainer = document.getElementById('loginFormContainer');
      const signupContainer = document.getElementById('signupFormContainer');
      if (loginContainer) loginContainer.style.display = 'none';
      if (signupContainer) signupContainer.style.display = 'block';
    });
  }
  
  // Switch to login form
  const showLoginBtn = document.getElementById('showLoginBtn');
  if (showLoginBtn) {
    const newLoginBtn = showLoginBtn.cloneNode(true);
    showLoginBtn.parentNode.replaceChild(newLoginBtn, showLoginBtn);
    newLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const loginContainer = document.getElementById('loginFormContainer');
      const signupContainer = document.getElementById('signupFormContainer');
      if (loginContainer) loginContainer.style.display = 'block';
      if (signupContainer) signupContainer.style.display = 'none';
    });
  }
  
  // Handle login form submission
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    const newForm = loginForm.cloneNode(true);
    loginForm.parentNode.replaceChild(newForm, loginForm);
    
    newForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail')?.value || '';
      const password = document.getElementById('loginPassword')?.value || '';
      
      const submitBtn = newForm.querySelector('button[type="submit"]');
      const originalText = submitBtn?.textContent || 'Sign In';
      if (submitBtn) {
        submitBtn.textContent = 'Verifying...';
        submitBtn.disabled = true;
      }
      
      await handleLogin(email, password);
      
      if (submitBtn) {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    });
  }
  
  // Handle signup form submission
  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    const newForm = signupForm.cloneNode(true);
    signupForm.parentNode.replaceChild(newForm, signupForm);
    
    newForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('signupName')?.value || '';
      const email = document.getElementById('signupEmail')?.value || '';
      const password = document.getElementById('signupPassword')?.value || '';
      const confirmPassword = document.getElementById('signupConfirmPassword')?.value || '';
      
      const submitBtn = newForm.querySelector('button[type="submit"]');
      const originalText = submitBtn?.textContent || 'Create Account';
      if (submitBtn) {
        submitBtn.textContent = 'Creating...';
        submitBtn.disabled = true;
      }
      
      await handleSignup(name, email, password, confirmPassword);
      
      if (submitBtn) {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    });
  }
}

// ============================================
// USER DROPDOWN (Profile)
// ============================================
function initUserDropdown() {
  const profileWrapper = document.querySelector('.profile-wrapper');
  const profileDropdown = document.querySelector('.profile-dropdown');
  
  if (profileWrapper && profileDropdown) {
    const newWrapper = profileWrapper.cloneNode(true);
    profileWrapper.parentNode.replaceChild(newWrapper, profileWrapper);
    
    const newDropdown = newWrapper.querySelector('.profile-dropdown');
    
    newWrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      newDropdown.classList.toggle('active');
    });
    
    document.addEventListener('click', () => {
      newDropdown.classList.remove('active');
    });
  }
}

// ============================================
// UPDATE UI BASED ON LOGIN STATE (Supabase)
// ============================================
function updateAuthUI() {
  const user = getLocalUser();
  const navRight = document.querySelector('.nav-right');
  
  if (!navRight) return;
  
  if (user) {
    const avatarUrl = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=fbb040&color=fff`;
    
    let dashboardUrl = user.role === 'admin' ? '/admin-dashboard.html' : '/dashboard.html';
    
    navRight.innerHTML = `
      <div class="profile-wrapper">
        <img src="${avatarUrl}" alt="Profile" class="header-profile-img">
        <span class="dropdown-arrow"><i class="fas fa-chevron-down"></i></span>
        <div class="profile-dropdown">
          <a href="${dashboardUrl}" class="dropdown-item">
            <i class="fas fa-tachometer-alt"></i> Dashboard
          </a>
          <div class="dropdown-divider"></div>
          <a href="#" id="logoutBtn" class="dropdown-item">
            <i class="fas fa-sign-out-alt"></i> Sign Out
          </a>
        </div>
      </div>
      <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode">
        <svg class="icon-sun" viewBox="0 0 24 24" width="18" height="18">
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
        <svg class="icon-moon" viewBox="0 0 24 24" width="18" height="18">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" fill="none"></path>
        </svg>
      </button>
    `;
    
    // Add logout handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await handleLogout();
      });
    }
    
    initUserDropdown();
    initThemeToggle();
  } else {
    // User not logged in
    navRight.innerHTML = `
      <a href="#" onclick="openLoginModal(); return false;" class="nav-btn primary">Sign in</a>
      <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode">
        <svg class="icon-sun" viewBox="0 0 24 24" width="18" height="18">
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
        <svg class="icon-moon" viewBox="0 0 24 24" width="18" height="18">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" fill="none"></path>
        </svg>
      </button>
    `;
    initThemeToggle();
  }
}

// ============================================
// WAIT FOR PARTIALS TO LOAD
// ============================================
function waitForHeader() {
  // If header is already in DOM
  if (document.querySelector('header')) {
    console.log('Header found immediately');
    initHeaderFeatures();
    return;
  }
  
  // If using partials, wait for them
  if (document.getElementById('header-placeholder')) {
    console.log('Waiting for partials to load...');
    const observer = new MutationObserver(function(mutations, obs) {
      if (document.querySelector('header')) {
        console.log('Header detected by observer');
        obs.disconnect();
        initHeaderFeatures();
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Fallback timeout
    setTimeout(function() {
      if (document.querySelector('header')) {
        console.log('Header found via timeout');
        initHeaderFeatures();
      } else {
        console.log('Header not found after timeout');
      }
      observer.disconnect();
    }, 3000);
  } else {
    console.log('No header placeholder found');
  }
}

// ============================================
// INITIALIZE ALL HEADER FEATURES
// ============================================
function initHeaderFeatures() {
  console.log('Initializing header features...');
  updateAuthUI();
  initMobileMenu();
  initLoginModal();
  initHeaderScroll();
  initActivePageDetection();
}

// ============================================
// START EVERYTHING
// ============================================
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM ready, waiting for header...');
  waitForHeader();
});

// Make logout available globally (fallback)
window.handleLogout = handleLogout;
