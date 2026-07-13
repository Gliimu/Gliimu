// ============================================
// SHARED NAVIGATION COMPONENT
// Loads sticky navigation on any page
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// RENDER NAVIGATION
// ============================================
export function renderNavigation() {
    // Check if nav already exists
    if (document.getElementById('stickyNav')) return;

    // Create nav container
    var navHTML = `
        <div class="sticky-nav" id="stickyNav">
            <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            <div class="nav-dropdown" id="navDropdown">
                <!-- Alerts Section -->
                <div class="nav-section alerts-section">
                    <button class="nav-btn alert-btn" id="alertIconBtn" aria-label="Alerts">
                        <i class="fas fa-bell"></i>
                        <span>Notifications</span>
                        <span class="alert-badge hidden" id="alertBadge">0</span>
                    </button>
                </div>
                <div class="nav-divider"></div>
                <button class="nav-btn" onclick="window.goToDashboard()">
                    <i class="fas fa-tachometer-alt"></i>
                    <span>Dashboard</span>
                </button>
                <button class="nav-btn" onclick="window.goToHub()">
                    <i class="fas fa-th-large"></i>
                    <span>Hub</span>
                </button>
                <button class="nav-btn" onclick="window.goToLearningPath()">
                    <i class="fas fa-road"></i>
                    <span>Learning Path</span>
                </button>
                <button class="nav-btn" onclick="window.goToVirtualRoom()">
                    <i class="fas fa-video"></i>
                    <span>Virtual Room</span>
                </button>
                <button class="nav-btn" onclick="window.goToChat()">
                    <i class="fas fa-comments"></i>
                    <span>Chat</span>
                </button>
                <button class="nav-btn" onclick="window.goToMerchandise()">
                    <i class="fas fa-shopping-bag"></i>
                    <span>Merchandise</span>
                </button>
                <button class="nav-btn home-nav" onclick="window.goToUser()">
                    <i class="fas fa-user"></i>
                    <span>Portfolio</span>
                </button>
            </div>
        </div>
    `;

    // Append to body
    document.body.insertAdjacentHTML('beforeend', navHTML);

    // Setup toggle
    var toggle = document.getElementById('navToggle');
    var dropdown = document.getElementById('navDropdown');

    if (toggle) {
        toggle.onclick = function(e) {
            e.stopPropagation();
            dropdown.classList.toggle('open');
            toggle.classList.toggle('active');
        };
    }

    // Close nav when clicking outside
    document.addEventListener('click', function(e) {
        var nav = document.getElementById('stickyNav');
        if (nav && !nav.contains(e.target)) {
            dropdown.classList.remove('open');
            toggle.classList.remove('active');
        }
    });
}

// ============================================
// GLOBAL NAVIGATION FUNCTIONS
// ============================================
export function setupNavigationFunctions() {
    window.goToDashboard = function() {
        window.location.href = '/user';
    };
    window.goToHub = function() {
        window.location.href = '/hub';
    };
    window.goToLearningPath = function() {
        window.location.href = '/course';
    };
    window.goToVirtualRoom = function() {
        window.location.href = '/virtualroom';
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
}

// ============================================
// ALERT SYSTEM FOR NAVIGATION
// ============================================
export function setupAlertSystem(userId) {
    // Get alert manager from localStorage
    var alerts = [];
    var unreadCount = 0;

    try {
        var stored = localStorage.getItem('alerts_' + userId);
        if (stored) {
            alerts = JSON.parse(stored);
            unreadCount = alerts.filter(function(a) { return !a.read; }).length;
        }
    } catch (e) {
        console.warn('Could not load alerts:', e);
    }

    // Update badge
    updateAlertBadge(unreadCount);

    // Setup alert button
    var alertBtn = document.getElementById('alertIconBtn');
    if (alertBtn) {
        alertBtn.onclick = function(e) {
            e.stopPropagation();
            showAlertModal(userId);
        };
    }
}

function updateAlertBadge(count) {
    var badge = document.getElementById('alertBadge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

function showAlertModal(userId) {
    // Check if modal already exists
    var existing = document.getElementById('alertModal');
    if (existing) {
        existing.classList.add('active');
        document.body.style.overflow = 'hidden';
        refreshAlertModal(userId);
        return;
    }

    var modal = document.createElement('div');
    modal.id = 'alertModal';
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px; max-height: 80vh;">
            <div class="modal-header">
                <h2><i class="fas fa-bell" style="color: var(--brand-gold);"></i> Notifications</h2>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <button id="alertModalMarkRead" class="alert-mark-read" style="font-size: 0.75rem; background: none; border: none; color: var(--brand-gold); cursor: pointer; font-family: inherit;">
                        Mark all read
                    </button>
                    <button class="modal-close" id="closeAlertModal">&times;</button>
                </div>
            </div>
            <div class="modal-body" id="alertModalBody">
                <div class="alert-empty">
                    <i class="fas fa-inbox"></i>
                    <p>Loading notifications...</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    document.getElementById('closeAlertModal').addEventListener('click', function() {
        modal.remove();
        document.body.style.overflow = '';
    });

    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
            document.body.style.overflow = '';
        }
    });

    document.getElementById('alertModalMarkRead').addEventListener('click', function() {
        markAllAlertsRead(userId, modal);
    });

    refreshAlertModal(userId);
}

function refreshAlertModal(userId) {
    var body = document.getElementById('alertModalBody');
    if (!body) return;

    try {
        var stored = localStorage.getItem('alerts_' + userId);
        var alerts = stored ? JSON.parse(stored) : [];
        var unreadCount = alerts.filter(function(a) { return !a.read; }).length;

        if (alerts.length === 0) {
            body.innerHTML = `
                <div class="alert-empty">
                    <i class="fas fa-inbox"></i>
                    <p>No notifications yet</p>
                </div>
            `;
            return;
        }

        body.innerHTML = alerts.slice(0, 20).map(function(alert) {
            return `
                <div class="alert-item ${alert.read ? 'read' : 'unread'}" data-id="${alert.id}">
                    <div class="alert-icon">${alert.icon || '📌'}</div>
                    <div class="alert-content">
                        <p class="alert-message">${alert.message}</p>
                        <span class="alert-time">${getTimeAgo(alert.created_at)}</span>
                        ${alert.link ? '<a href="' + alert.link + '" class="alert-link" target="_blank">Learn more →</a>' : ''}
                    </div>
                    ${!alert.read ? '<span class="alert-unread-dot"></span>' : ''}
                </div>
            `;
        }).join('');

        updateAlertBadge(unreadCount);

    } catch (e) {
        console.warn('Error refreshing alerts:', e);
    }
}

function markAllAlertsRead(userId, modal) {
    try {
        var stored = localStorage.getItem('alerts_' + userId);
        if (stored) {
            var alerts = JSON.parse(stored);
            alerts.forEach(function(a) { a.read = true; });
            localStorage.setItem('alerts_' + userId, JSON.stringify(alerts));
            updateAlertBadge(0);
            refreshAlertModal(userId);
            showToast('All notifications marked as read', 'success');
        }
    } catch (e) {
        console.warn('Error marking alerts read:', e);
    }
}

function getTimeAgo(date) {
    if (!date) return 'Just now';
    
    var past;
    if (typeof date === 'string') {
        past = new Date(date);
    } else if (date instanceof Date) {
        past = date;
    } else {
        return 'Just now';
    }
    
    if (isNaN(past.getTime())) {
        return 'Just now';
    }
    
    var now = new Date();
    var diff = Math.floor((now.getTime() - past.getTime()) / 1000);
    
    if (diff < 0) return 'Just now';
    if (diff < 5) return 'Just now';
    if (diff < 60) return diff + 's ago';
    
    var minutes = Math.floor(diff / 60);
    var hours = Math.floor(diff / 3600);
    var days = Math.floor(diff / 86400);
    var weeks = Math.floor(diff / 604800);
    var months = Math.floor(diff / 2592000);
    var years = Math.floor(diff / 31536000);

    if (minutes < 2) return '1m ago';
    if (minutes < 60) return minutes + 'm ago';
    if (hours < 2) return '1h ago';
    if (hours < 24) return hours + 'h ago';
    if (days < 2) return '1d ago';
    if (days < 7) return days + 'd ago';
    if (weeks < 2) return '1w ago';
    if (weeks < 4) return weeks + 'w ago';
    if (months < 2) return '1mo ago';
    if (months < 12) return months + 'mo ago';
    if (years < 2) return '1y ago';
    return years + 'y ago';
}

// ============================================
// INITIALIZE
// ============================================
export function initNavigation() {
    renderNavigation();
    setupNavigationFunctions();

    // Try to get user from localStorage
    try {
        var userData = localStorage.getItem('glimu_user');
        if (userData) {
            var user = JSON.parse(userData);
            if (user && user.id) {
                setupAlertSystem(user.id);
            }
        }
    } catch (e) {
        console.warn('Could not setup alerts:', e);
    }
}

// ============================================
// AUTO-INIT ON DOM LOAD
// ============================================
// This runs automatically when the script loads
if (typeof document !== 'undefined') {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNavigation);
    } else {
        initNavigation();
    }
}

// ============================================
// EXPORT
// ============================================
export default {
    renderNavigation,
    setupNavigationFunctions,
    setupAlertSystem,
    initNavigation
};
