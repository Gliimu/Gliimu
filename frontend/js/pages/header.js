// ============================================
// HEADER.JS - COMPLETE FUNCTIONAL VERSION
// With Supabase Auth Integration - FIXED
// ============================================

// Import required modules
import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// GLOBAL VARIABLES
// ============================================
let currentUser = null;
let headerLoaded = false;

// ============================================
// HEADER SCROLL EFFECT
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
        } else if (currentPage === 'library.html' && linkHref === 'library.html') {
            link.classList.add('active');
        } else if (currentPage === 'admin-dashboard.html' && linkHref === 'admin-dashboard.html') {
            link.classList.add('active');
        }
    });
}

// ============================================
// THEME TOGGLE
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
        localStorage.setItem('theme', 'dark');
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
    
    // Remove any existing listeners to avoid duplicates
    const newToggle = themeToggle.cloneNode(true);
    themeToggle.parentNode.replaceChild(newToggle, themeToggle);
    
    newToggle.addEventListener('click', () => {
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
    
    // Remove existing listeners
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
// USER DROPDOWN
// ============================================
function initUserDropdown() {
    const profileWrapper = document.querySelector('.profile-wrapper');
    const profileDropdown = document.querySelector('.profile-dropdown');
    
    if (profileWrapper && profileDropdown) {
        // Remove existing listeners
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
// HANDLE LOGOUT - FIXED
// ============================================
async function handleLogout() {
    console.log('Logging out...');
    
    try {
        // Sign out from Supabase
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Supabase sign out error:', error);
            showToast(error.message || 'Failed to sign out', 'error');
            return;
        }
        
        // Clear localStorage
        localStorage.removeItem('glimu_user');
        localStorage.removeItem('supabase_token');
        
        showToast('Signed out successfully', 'success');
        
        // Update UI immediately
        updateAuthUI();
        
        // Redirect to home page after short delay
        setTimeout(() => {
            window.location.href = '/index.html';
        }, 1500);
        
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Failed to sign out', 'error');
    }
}

// ============================================
// GET USER FROM SUPABASE - FIXED
// ============================================
async function getSupabaseUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
            console.log('No user found in Supabase');
            return null;
        }
        return user;
    } catch (error) {
        console.error('Error getting user:', error);
        return null;
    }
}

// ============================================
// GET USER PROFILE FROM DATABASE
// ============================================
async function getUserProfile(userId) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) {
            console.error('Error fetching profile:', error);
            return null;
        }
        return data;
    } catch (error) {
        console.error('Profile fetch error:', error);
        return null;
    }
}

// ============================================
// UPDATE UI BASED ON LOGIN STATE - FIXED
// ============================================
async function updateAuthUI() {
    const navRight = document.querySelector('.nav-right');
    if (!navRight) return;
    
    // Try to get user from Supabase
    const supabaseUser = await getSupabaseUser();
    let userData = null;
    
    if (supabaseUser) {
        const profile = await getUserProfile(supabaseUser.id);
        userData = {
            id: supabaseUser.id,
            email: supabaseUser.email,
            name: profile?.name || supabaseUser.user_metadata?.name || 'User',
            role: profile?.role || 'student',
            plan: profile?.plan || 'basic',
            walletBalance: profile?.wallet_balance || 25000,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.name || 'User')}&background=fbb040&color=fff`
        };
        // Store in localStorage for quick access
        localStorage.setItem('glimu_user', JSON.stringify(userData));
    } else {
        // Check localStorage fallback
        const storedUser = localStorage.getItem('glimu_user');
        if (storedUser) {
            userData = JSON.parse(storedUser);
            // Verify with Supabase silently
            const { data } = await supabase.auth.getUser();
            if (!data.user) {
                // Session expired, clear localStorage
                localStorage.removeItem('glimu_user');
                localStorage.removeItem('supabase_token');
                userData = null;
            }
        }
    }
    
    if (userData) {
        // User is logged in - show profile dropdown
        const avatarUrl = userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}&background=fbb040&color=fff`;
        let dashboardUrl = userData.role === 'admin' ? '/admin-dashboard.html' : '/dashboard.html';
        
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
            const newLogoutBtn = logoutBtn.cloneNode(true);
            logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
            newLogoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await handleLogout();
            });
        }
        
        initUserDropdown();
        initThemeToggle();
    } else {
        // User not logged in - show sign in button
        navRight.innerHTML = `
            <a href="#" id="signInBtn" class="nav-btn primary">Sign in</a>
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
        
        // Add sign in button handler
        const signInBtn = document.getElementById('signInBtn');
        if (signInBtn) {
            const newSignInBtn = signInBtn.cloneNode(true);
            signInBtn.parentNode.replaceChild(newSignInBtn, signInBtn);
            newSignInBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Sign in clicked');
                if (typeof window.openLoginModal === 'function') {
                    window.openLoginModal();
                } else {
                    console.error('openLoginModal not defined');
                    const modal = document.getElementById('loginModal');
                    if (modal) {
                        modal.classList.add('active');
                        document.body.style.overflow = 'hidden';
                    }
                }
            });
        }
        
        initThemeToggle();
    }
}

// ============================================
// EXPOSE GLOBAL FUNCTIONS
// ============================================

// Make openLoginModal available globally
window.openLoginModal = function() {
    console.log('Opening login modal...');
    const modal = document.getElementById('loginModal');
    if (modal) {
        // Reset forms to login view
        const loginContainer = document.getElementById('loginFormContainer');
        const signupContainer = document.getElementById('signupFormContainer');
        if (loginContainer) loginContainer.style.display = 'block';
        if (signupContainer) signupContainer.style.display = 'none';
        
        // Clear form inputs
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        if (loginForm) loginForm.reset();
        if (signupForm) signupForm.reset();
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    } else {
        console.error('Login modal not found! Make sure partials are loaded.');
    }
};

window.closeLoginModal = function() {
    console.log('Closing login modal...');
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
};

// Expose logout for debugging
window.logout = handleLogout;

// ============================================
// INITIALIZE ALL HEADER FEATURES
// ============================================
async function initHeaderFeatures() {
    if (headerLoaded) return;
    headerLoaded = true;
    
    console.log('Initializing header features...');
    await updateAuthUI();
    initMobileMenu();
    initHeaderScroll();
    initActivePageDetection();
}

// ============================================
// WAIT FOR HEADER TO LOAD
// ============================================
function waitForHeader() {
    // Check if header is already in DOM
    if (document.querySelector('header')) {
        console.log('Header found, initializing...');
        initHeaderFeatures();
        return;
    }
    
    // Wait for header to be injected
    const observer = new MutationObserver(function(mutations, obs) {
        if (document.querySelector('header')) {
            console.log('Header detected, initializing...');
            obs.disconnect();
            initHeaderFeatures();
        }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Fallback timeout
    setTimeout(function() {
        if (!headerLoaded && document.querySelector('header')) {
            console.log('Header found via timeout');
            initHeaderFeatures();
        }
        observer.disconnect();
    }, 5000);
}

// ============================================
// START EVERYTHING
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForHeader);
} else {
    waitForHeader();
}

// Also listen for partials load event
window.addEventListener('partialsLoaded', function() {
    console.log('Partials loaded event received');
    if (!headerLoaded) {
        initHeaderFeatures();
    }
});
