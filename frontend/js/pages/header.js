// ============================================
// HEADER.JS - CLEAN REWRITE
// Fixed logout for both avatar dropdown and mobile menu
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// GLOBAL VARIABLES
// ============================================
let headerLoaded = false;

// ============================================
// HANDLE LOGOUT - SINGLE SOURCE OF TRUTH
// ============================================
window.handleLogout = async function() {
    console.log('Logout triggered');
    
    try {
        // Show toast
        showToast('Signing out...', 'info');
        
        // Sign out from Supabase
        await supabase.auth.signOut();
        
        // Clear all storage
        localStorage.clear();
        sessionStorage.clear();
        
        showToast('Signed out successfully', 'success');
        
        // Redirect
        window.location.href = '/signin.html';
        
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = '/signin.html';
    }
};

// ============================================
// HEADER SCROLL EFFECT
// ============================================
function initHeaderScroll() {
    const header = document.querySelector('header');
    if (!header) return;
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 10) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
}

// ============================================
// ACTIVE PAGE DETECTION
// ============================================
function initActivePageDetection() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a, .mobile-nav-menu a').forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage) {
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
    const savedTheme = localStorage.getItem('theme');
    
    if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
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
    
    themeToggle.onclick = () => {
        body.classList.toggle('dark-mode');
        localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light');
        updateIcons();
    };
}

// ============================================
// MOBILE MENU
// ============================================
function initMobileMenu() {
    const menuToggle = document.getElementById('menuToggle');
    const mobileNav = document.getElementById('mobileNavMenu');
    const navOverlay = document.getElementById('navOverlay');
    
    if (!menuToggle || !mobileNav || !navOverlay) return;
    
    const closeMenu = () => {
        mobileNav.classList.remove('is-open');
        navOverlay.classList.remove('is-open');
        menuToggle.classList.remove('is-open');
        document.body.style.overflow = '';
    };
    
    const openMenu = () => {
        mobileNav.classList.add('is-open');
        navOverlay.classList.add('is-open');
        menuToggle.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    };
    
    menuToggle.onclick = (e) => {
        e.stopPropagation();
        if (mobileNav.classList.contains('is-open')) {
            closeMenu();
        } else {
            openMenu();
        }
    };
    
    navOverlay.onclick = closeMenu;
    
    // Close menu when clicking a link
    mobileNav.querySelectorAll('a').forEach(link => {
        link.onclick = closeMenu;
    });
}

// ============================================
// GET USER DATA
// ============================================
async function getUserData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
    
    return {
        id: user.id,
        name: profile?.name || user.user_metadata?.name || 'User',
        role: profile?.role || 'student',
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.name || 'User')}&background=fbb040&color=fff`
    };
}

// ============================================
// UPDATE UI BASED ON LOGIN STATE
// ============================================
async function updateAuthUI() {
    const navRight = document.querySelector('.nav-right');
    const mobileSignInBtn = document.getElementById('mobileSignInBtn');
    const mobileSignOutBtn = document.getElementById('mobileSignOutBtn');
    
    if (!navRight) return;
    
    const userData = await getUserData();
    
    if (userData) {
        // Logged in - show profile dropdown
        navRight.innerHTML = `
            <div class="profile-wrapper" id="profileWrapper">
                <img src="${userData.avatar}" alt="Profile" class="header-profile-img">
                <span class="dropdown-arrow"><i class="fas fa-chevron-down"></i></span>
                <div class="profile-dropdown" id="profileDropdown">
                    <a href="/dashboard.html" class="dropdown-item">
                        <i class="fas fa-tachometer-alt"></i> Dashboard
                    </a>
                    <div class="dropdown-divider"></div>
                    <a href="#" id="desktopLogoutBtn" class="dropdown-item">
                        <i class="fas fa-sign-out-alt"></i> Sign Out
                    </a>
                </div>
            </div>
            <button class="theme-toggle" id="themeToggle">
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
        
        // Setup profile dropdown
        const profileWrapper = document.getElementById('profileWrapper');
        const profileDropdown = document.getElementById('profileDropdown');
        
        if (profileWrapper && profileDropdown) {
            profileWrapper.onclick = (e) => {
                e.stopPropagation();
                profileDropdown.classList.toggle('active');
            };
            
            // Close dropdown when clicking outside
            document.onclick = () => {
                profileDropdown.classList.remove('active');
            };
            
            // Prevent dropdown from closing when clicking inside
            profileDropdown.onclick = (e) => {
                e.stopPropagation();
            };
        }
        
        // Setup desktop logout button
        const desktopLogoutBtn = document.getElementById('desktopLogoutBtn');
        if (desktopLogoutBtn) {
            desktopLogoutBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await window.handleLogout();
            };
        }
        
        // Update mobile menu
        if (mobileSignInBtn) mobileSignInBtn.style.display = 'none';
        if (mobileSignOutBtn) {
            mobileSignOutBtn.style.display = 'block';
            mobileSignOutBtn.onclick = async (e) => {
                e.preventDefault();
                await window.handleLogout();
            };
        }
        
    } else {
        // Logged out - show sign in button
        navRight.innerHTML = `
            <a href="/signin.html" class="nav-btn primary">Sign in</a>
            <button class="theme-toggle" id="themeToggle">
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
        
        if (mobileSignInBtn) {
            mobileSignInBtn.style.display = 'block';
            mobileSignInBtn.onclick = () => {
                window.location.href = '/signin.html';
            };
        }
        if (mobileSignOutBtn) mobileSignOutBtn.style.display = 'none';
    }
    
    initThemeToggle();
}

// ============================================
// INITIALIZE HEADER
// ============================================
async function initHeader() {
    if (headerLoaded) return;
    headerLoaded = true;
    
    console.log('Initializing header...');
    await updateAuthUI();
    initMobileMenu();
    initHeaderScroll();
    initActivePageDetection();
}

// ============================================
// WAIT FOR HEADER TO LOAD
// ============================================
function waitForHeader() {
    if (document.querySelector('header')) {
        initHeader();
        return;
    }
    
    const observer = new MutationObserver(() => {
        if (document.querySelector('header')) {
            observer.disconnect();
            initHeader();
        }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    setTimeout(() => {
        if (!headerLoaded && document.querySelector('header')) {
            initHeader();
        }
        observer.disconnect();
    }, 5000);
}

// ============================================
// START
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForHeader);
} else {
    waitForHeader();
}
