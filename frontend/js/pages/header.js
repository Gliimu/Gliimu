// ============================================
// HEADER.JS - COMPLETE HEADER FUNCTIONALITY
// With Fixed Logout
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
        } else if (currentPage === 'signin.html' && linkHref === 'signin.html') {
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
window.handleLogout = async function() {
    console.log('Logout function called');
    showToast('Signing out...', 'info');
    
    try {
        // Sign out from Supabase
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Supabase sign out error:', error);
            showToast(error.message || 'Failed to sign out', 'error');
            return;
        }
        
        // Clear all localStorage items
        localStorage.clear();
        
        showToast('Signed out successfully', 'success');
        
        // Redirect to home page
        setTimeout(() => {
            window.location.href = '/index.html';
        }, 1000);
        
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Failed to sign out', 'error');
    }
};

// ============================================
// GET USER FROM SUPABASE
// ============================================
async function getSupabaseUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
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
// UPDATE UI BASED ON LOGIN STATE
// ============================================
async function updateAuthUI() {
    const navRight = document.querySelector('.nav-right');
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
        if (storedUser) {
            userData = JSON.parse(storedUser);
        }
    }
    
    if (userData) {
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
                    <a href="#" class="dropdown-item logout-item">
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
        
        // Add logout handler using event delegation
        const logoutItem = document.querySelector('.logout-item');
        if (logoutItem) {
            logoutItem.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Logout clicked');
                await window.handleLogout();
            });
        }
        
        initUserDropdown();
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
        
        initThemeToggle();
    }
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
}

// ============================================
// WAIT FOR HEADER TO LOAD
// ============================================
function waitForHeader() {
    if (document.querySelector('header')) {
        console.log('Header found, initializing...');
        initHeaderFeatures();
        return;
    }
    
    const observer = new MutationObserver(function(mutations, obs) {
        if (document.querySelector('header')) {
            console.log('Header detected, initializing...');
            obs.disconnect();
            initHeaderFeatures();
        }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
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

// Make logout available globally
window.supabase = supabase;
