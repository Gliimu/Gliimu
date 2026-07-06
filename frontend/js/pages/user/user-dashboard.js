// ============================================
// USER DASHBOARD - Shared Dashboard Logic
// Path: /frontend/js/pages/user/user-dashboard.js
// Purpose: Shared dashboard logic for all user roles
// ============================================

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';
import { getIndividualLeaderboard } from '../../modules/progression.js';

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
// DASHBOARD CLASS - Shared
// ============================================
export class Dashboard {
    constructor(user, profile) {
        this.currentUser = user;
        this.currentProfile = profile;
        this.alertManager = null;
        this.container = null;
        this.currentTab = 'dashboard';
        this.leaderboardData = [];
        this._messageSubscription = null;
        this.selectedAmount = 0;
        this.referenceCode = '';
    }

    // ============================================
    // SET ALERT MANAGER
    // ============================================
    setAlertManager(alertManager) {
        this.alertManager = alertManager;
        if (this.alertManager) {
            this.updateAlertBadge(this.alertManager.unreadCount || 0);
        }
    }

    // ============================================
    // UPDATE ALERT BADGE
    // ============================================
    updateAlertBadge(count) {
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

    // ============================================
    // LOAD LEADERBOARD
    // ============================================
    async loadLeaderboard() {
        try {
            this.leaderboardData = await getIndividualLeaderboard(5);
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            this.leaderboardData = [];
        }
    }

    // ============================================
    // RENDER LEADERBOARD ITEMS
    // ============================================
    renderLeaderboardItems() {
        if (!this.leaderboardData || this.leaderboardData.length === 0) {
            return '<div class="empty-state"><p>No leaders yet. Be the first!</p></div>';
        }
        
        return this.leaderboardData.map(function(user, index) {
            var rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
            var medals = ['🥇', '🥈', '🥉'];
            var rankDisplay = index < 3 ? medals[index] : '#' + (index + 1);
            
            return `
                <div class="leaderboard-item ${rankClass}">
                    <div class="leaderboard-rank">${rankDisplay}</div>
                    <div class="leaderboard-avatar">
                        <img src="${user.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name || 'User') + '&background=fbb040&color=fff'}" alt="">
                    </div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${user.name || 'Anonymous'}</div>
                        <div class="leaderboard-badge">${user.badge?.icon || '🌱'} ${user.badge?.name || 'Starter'}</div>
                    </div>
                    <div class="leaderboard-score">${Math.round(user.progress || 0)}%</div>
                    <div class="leaderboard-gp">${(user.gp_points || 0).toLocaleString()} GP</div>
                </div>
            `;
        }.bind(this)).join('');
    }

    // ============================================
    // GET TIME AGO
    // ============================================
    getTimeAgo(date) {
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
    // ESCAPE HTML
    // ============================================
    escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================
    // SETUP MODAL CLOSE HANDLERS
    // ============================================
    setupModalCloseHandlers() {
        document.querySelectorAll('.modal-close').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                var modal = btn.closest('.modal');
                if (modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        });

        document.querySelectorAll('.modal').forEach(function(modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(function(modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                });
            }
        });
    }
}

// ============================================
// EXPORT DASHBOARD AS DEFAULT
// ============================================
export default Dashboard;
