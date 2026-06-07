// ============================================
// HEADER.JS - COMPLETE HEADER FUNCTIONALITY
// Using Event Delegation for Reliable Logout
// ============================================

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
// MOBILE MENU
// ============================================
function initMobileMenu() {
    const menuToggle = document.getElementById('menuToggle');
    const mobileNav = document.getElementById('mobileNavMenu');
    const navOverlay = document.getElementById('navOverlay');
    
    if (!menuToggle || !mobileNav || !navOverlay) return;
    
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
    
    const newToggle = menuToggle.cloneNode(true);
    menuToggle.parentNode.replaceChild(newToggle, menuToggle);
    
    newToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
    });
    
    navOverlay.addEventListener('click', toggleMenu);
    
    mobileNav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', toggleMenu);
    });
}

// ============================================
// HANDLE LOGOUT - RELIABLE VERSION
// ============================================
async function handleLogout() {
    console.log('Logout function called - starting logout process');
    
    try {
        // Show toast
        showToast('Signing out...', 'info');
        
        // Sign out from Supabase
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.warn('Supabase sign out warning:', error);
        }
        
        // Clear all storage
        localStorage.clear();
        sessionStorage.clear();
        
        showToast('Signed out successfully', 'success');
        
        // Force redirect to signin page
        window.location.href = '/signin.html';
        
    } catch (error) {
        console.error('Logout error:', error);
        // Force redirect anyway
        window.location.href = '/signin.html';
    }
}

// ============================================
// GET USER FROM SUPABASE
// ============================================
async function getSupabaseUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) return null;
        return user;
    } catch (error) {
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
        
        if (error) return null;
        return data;
    } catch (error) {
        return null;
    }
}

// ============================================
// UPDATE UI BASED ON LOGIN STATE
// ============================================
async function updateAuthUI() {
    const navRight = document.querySelector('.nav-right');
    const mobileSignInBtn = document.getElementById('mobileSignInBtn');
    const mobileSignOutBtn = document.getElementById('mobileSignOutBtn');
    
    if (!navRight) return;
    
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
        localStorage.setItem('glimu_user', JSON.stringify(userData));
    } else {
        const storedUser = localStorage.getItem('glimu_user');
        if (storedUser) userData = JSON.parse(storedUser);
    }
    
    if (userData) {
        const avatarUrl = userData.avatar;
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
                    <a href="#" id="desktopLogoutBtn" class="dropdown-item">
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
        
        if (mobileSignInBtn) mobileSignInBtn.style.display = 'none';
        if (mobileSignOutBtn) {
            mobileSignOutBtn.style.display = 'block';
            mobileSignOutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Sign Out';
        }
        
        initThemeToggle();
    } else {
        navRight.innerHTML = `
            <a href="/signin.html" class="nav-btn primary">Sign in</a>
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
        
        if (mobileSignInBtn) {
            mobileSignInBtn.style.display = 'block';
            mobileSignInBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign in';
        }
        if (mobileSignOutBtn) mobileSignOutBtn.style.display = 'none';
        
        initThemeToggle();
    }
}

// ============================================
// SETUP EVENT DELEGATION FOR LOGOUT - THIS IS THE KEY FIX
// ============================================
function setupLogoutEventDelegation() {
    // Use event delegation on the entire document
    document.body.addEventListener('click', async (e) => {
        // Check if the clicked element is the logout button or inside it
        const logoutBtn = e.target.closest('#desktopLogoutBtn');
        if (logoutBtn) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Logout clicked via event delegation');
            await handleLogout();
        }
    });
}

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
    setupLogoutEventDelegation();  // This ensures logout always works
}

// ============================================
// WAIT FOR HEADER TO LOAD
// ============================================
function waitForHeader() {
    if (document.querySelector('header')) {
        initHeaderFeatures();
        return;
    }
    
    const observer = new MutationObserver(function(mutations, obs) {
        if (document.querySelector('header')) {
            obs.disconnect();
            initHeaderFeatures();
        }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    setTimeout(function() {
        if (!headerLoaded && document.querySelector('header')) {
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

// Make logout available globally for testing
window.handleLogout = handleLogout;
window.supabase = supabase;
