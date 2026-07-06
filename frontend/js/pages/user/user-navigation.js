// ============================================
// USER NAVIGATION - Navigation Menu Logic
// Path: /frontend/js/pages/user/user-navigation.js
// Purpose: Handle sidebar and mobile navigation
// ============================================

import { showToast } from '../../modules/toast.js';

// ============================================
// SETUP NAVIGATION - UPDATED mobile nav
// ============================================
export function setupNavigation(router) {
    var sidebarNav = document.getElementById('sidebarNav');
    if (sidebarNav) {
        var navItems = getNavItems(router);
        sidebarNav.innerHTML = navItems;
        
        sidebarNav.querySelectorAll('.nav-item').forEach(function(item) {
            item.addEventListener('click', function() {
                var tab = this.dataset.tab;
                router.loadTab(tab);
            });
        });
    }

    // Mobile bottom navigation - Update dynamically
    var mobileNav = document.getElementById('mobileBottomNav');
    if (mobileNav) {
        var role = router.currentProfile?.role || 'user';
        var mobileItems = [
            { tab: 'dashboard', icon: 'fa-tachometer-alt', label: 'Home' },
            { tab: 'messages', icon: 'fa-envelope', label: 'Messages' }
        ];
        
        if (role === 'student' || role === 'instructor') {
            mobileItems.push({ tab: 'submissions', icon: 'fa-tasks', label: 'Submissions' });
        }
        
        mobileItems.push(
            { tab: 'wallet', icon: 'fa-wallet', label: 'Wallet' },
            { tab: 'settings', icon: 'fa-cog', label: 'Profile' }
        );
        
        mobileNav.innerHTML = mobileItems.map(function(item) {
            var active = item.tab === 'dashboard' ? 'active' : '';
            return '<button class="mobile-nav-item ' + active + '" data-tab="' + item.tab + '"><i class="fas ' + item.icon + '"></i><span>' + item.label + '</span></button>';
        }).join('');
        
        mobileNav.querySelectorAll('.mobile-nav-item').forEach(function(item) {
            item.addEventListener('click', function() {
                var tab = this.dataset.tab;
                router.loadTab(tab);
                closeSidebar();
            });
        });
    }

    // Sidebar overlay
    var overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
        overlay.addEventListener('click', function() {
            closeSidebar();
        });
    }
}

// ============================================
// GET NAVIGATION ITEMS - UPDATED
// ============================================
export function getNavItems(router) {
    var role = router.currentProfile?.role || 'user';
    var items = [];
    
    // Base items for all users
    items.push({ tab: 'dashboard', icon: 'fa-tachometer-alt', label: 'Overview' });
    items.push({ tab: 'messages', icon: 'fa-envelope', label: 'Messages' });
    
    // Only show Submissions for students and instructors
    if (role === 'student' || role === 'instructor') {
        items.push({ tab: 'submissions', icon: 'fa-tasks', label: 'Submissions' });
    }
    
    items.push({ tab: 'wallet', icon: 'fa-wallet', label: 'Wallet' });

    // Instructor-specific items
    if (role === 'instructor' || role === 'admin') {
        items.push({ tab: 'manage', icon: 'fa-users-cog', label: 'Manage' });
    }

    // Settings always last
    items.push({ tab: 'settings', icon: 'fa-cog', label: 'Settings' });

    return items.map(function(item) {
        return '<button class="nav-item" data-tab="' + item.tab + '"><i class="fas ' + item.icon + '"></i><span>' + item.label + '</span></button>';
    }).join('');
}

// ============================================
// UPDATE NAVIGATION ACTIVE STATE
// ============================================
export function updateNavActive(tab) {
    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(function(el) {
        el.classList.remove('active');
        if (el.dataset.tab === tab) {
            el.classList.add('active');
        }
    });
}

// ============================================
// SIDEBAR CONTROLS
// ============================================
export function toggleSidebar() {
    var sidebar = document.getElementById('dashboardSidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (sidebar) {
        sidebar.classList.toggle('mobile-open');
        if (overlay) {
            overlay.classList.toggle('active');
        }
    }
}

export function closeSidebar() {
    var sidebar = document.getElementById('dashboardSidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (sidebar) {
        sidebar.classList.remove('mobile-open');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }
}

// ============================================
// STICKY NAV FUNCTIONS
// ============================================
export function setupStickyNavFunctions(router) {
    // Navigation functions - exposed to window
    window.goToDashboard = function() {
        window.location.href = '/user';
    };

    window.goToHub = function() {
        window.location.href = '/hub';
    };

    window.goToLearningPath = function() {
        var role = router.currentProfile?.role || 'user';
        if (role === 'student' || role === 'instructor') {
            window.location.href = '/course';
        } else {
            router.showAccessModal();
        }
    };

    window.goToVirtualRoom = function() {
        var role = router.currentProfile?.role || 'user';
        if (role === 'student' || role === 'instructor') {
            window.location.href = '/virtualroom';
        } else {
            router.showAccessModal();
        }
    };

    window.goToChat = function() {
        window.location.href = '/chat';
    };

    window.goToMerchandise = function() {
        window.location.href = '/merchandise';
    };

    window.goToUser = function() {
        window.location.href = '/user';
    };

    window.goBack = function() {
        if (document.referrer && document.referrer.includes('/user')) {
            window.history.back();
        } else {
            window.location.href = '/user';
        }
    };

    window.goToContact = function() {
        window.location.href = '/contact';
    };

    window.reportIssue = function() {
        showToast('📝 Report an issue? Our team will investigate.', 'info');
    };

    window.switchTab = function(tab) {
        router.loadTab(tab);
    };
}

// ============================================
// STICKY NAV TOGGLE
// ============================================
export function setupStickyNav() {
    var toggle = document.getElementById('navToggle');
    var dropdown = document.getElementById('navDropdown');
    
    if (toggle) {
        toggle.onclick = function(e) {
            e.stopPropagation();
            if (dropdown) {
                dropdown.classList.toggle('open');
            }
            toggle.classList.toggle('active');
        };
    }

    document.addEventListener('click', function(e) {
        var nav = document.getElementById('stickyNav');
        if (nav && !nav.contains(e.target)) {
            if (dropdown) {
                dropdown.classList.remove('open');
            }
            if (toggle) {
                toggle.classList.remove('active');
            }
        }
    });
}

// ============================================
// EXPORT ALL
// ============================================
export default {
    setupNavigation,
    getNavItems,
    updateNavActive,
    toggleSidebar,
    closeSidebar,
    setupStickyNavFunctions,
    setupStickyNav
};
