// ============================================
// USER TABS - Universal Tab Logic
// Path: /frontend/js/pages/user/user-tabs.js
// Purpose: Universal tabs that appear in all roles (Overview, Messages)
// ============================================

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';
import { 
    getTimeAgo, 
    escapeHtml, 
    getStatusColor, 
    getStatusLabel, 
    getCategoryLabel,
    getCategoryIcon,
    formatCurrency
} from './user-utils.js';
import { modalManager } from './user-modals.js';

// ============================================
// OVERVIEW TAB
// ============================================
export async function renderOverview(container, dashboard) {
    if (!container) return;

    var profile = dashboard.currentProfile;
    var user = dashboard.currentUser;
    
    var submissionsCount = await getSubmissionsCount(user.id);
    var referralsCount = await getReferralsCount(user.id);
    
    var progressData = await getStudentProgress(user.id);
    var progress = progressData?.progress || 0;
    var badge = progressData?.currentBadge || { name: 'Starter', icon: '🌱', color: '#10b981' };
    var currentGP = progressData?.currentGP || 0;
    var totalStars = progressData?.totalStars || 0;

    await dashboard.loadLeaderboard();

    container.innerHTML = `
        <div class="dashboard-header">
            <div>
                <h1>Overview</h1>
                <p>Welcome back, ${profile?.name || 'User'}!</p>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon wallet-icon">
                    <i class="fas fa-wallet"></i>
                </div>
                <div class="stat-info">
                    <h3>Wallet Balance</h3>
                    <p class="stat-value" id="walletBalance">${formatCurrency(profile?.wallet_balance || 0)}</p>
                </div>
                <button class="stat-action-btn" data-action="wallet" title="Add Funds">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
            <div class="stat-card">
                <div class="stat-icon gp-icon">
                    <i class="fas fa-star"></i>
                </div>
                <div class="stat-info">
                    <h3>GP Points</h3>
                    <p class="stat-value" id="gpPoints">${currentGP.toLocaleString()}</p>
                </div>
                <button class="stat-action-btn" data-action="stars" title="Convert to Stars">
                    <i class="fas fa-exchange-alt"></i>
                </button>
            </div>
            <div class="stat-card">
                <div class="stat-icon submissions-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <div class="stat-info">
                    <h3>Submissions</h3>
                    <p class="stat-value">${submissionsCount}</p>
                </div>
                <button class="stat-action-btn" data-action="submissions" title="View Submissions">
                    <i class="fas fa-arrow-right"></i>
                </button>
            </div>
            <div class="stat-card">
                <div class="stat-icon referrals-icon">
                    <i class="fas fa-users"></i>
                </div>
                <div class="stat-info">
                    <h3>Referrals</h3>
                    <p class="stat-value">${referralsCount}</p>
                </div>
                <button class="stat-action-btn" data-action="referrals" title="Share Referral">
                    <i class="fas fa-share-alt"></i>
                </button>
            </div>
        </div>

        <div class="progress-section">
            <div class="progress-header">
                <span>Progress to ${progressData?.nextBadge?.name || 'Ambassador'}</span>
                <span>${Math.round(progress)}%</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${progress}%; background: ${badge.color};"></div>
            </div>
            <div class="progress-stats">
                <span>⭐ ${totalStars} Stars</span>
                <span>🎯 ${Math.round(progress)}% Complete</span>
            </div>
        </div>

        <div class="card leaderboard-card-full">
            <div class="leaderboard-header">
                <h3><i class="fas fa-trophy" style="color: #fbb040;"></i> Top Performers</h3>
                <button id="refreshLeaderboardBtn" class="btn-icon" style="background: none; border: none; cursor: pointer; color: var(--text-secondary);">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </div>
            <div class="leaderboard-list" id="dashboardLeaderboard">
                ${dashboard.renderLeaderboardItems()}
            </div>
        </div>

        ${profile?.application_status === 'pending' ? `
            <div class="alert alert-warning">
                <i class="fas fa-clock"></i>
                Your application for <strong>${profile.applied_role}</strong> is pending review.
            </div>
        ` : ''}
    `;

    // Bind events
    bindOverviewEvents(container, dashboard);
    dashboard.setupModalCloseHandlers();
}

// ============================================
// BIND OVERVIEW EVENTS
// ============================================
function bindOverviewEvents(container, dashboard) {
    document.querySelectorAll('.stat-action-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var action = this.dataset.action;
            if (action === 'wallet') {
                if (dashboard.loadWallet) dashboard.loadWallet(dashboard.container);
            } else if (action === 'stars') {
                if (dashboard.showConvertStarsModal) dashboard.showConvertStarsModal();
            } else if (action === 'submissions') {
                if (window.switchTab) window.switchTab('submissions');
            } else if (action === 'referrals') {
                var url = window.location.origin + '/ref/' + (dashboard.currentProfile?.referral_code || dashboard.currentUser.id);
                navigator.clipboard.writeText(url).then(function() {
                    showToast('Referral link copied! Share it with friends.', 'success');
                }).catch(function() {
                    showToast('Share this link: ' + url, 'info');
                });
            }
        });
    });

    document.getElementById('refreshLeaderboardBtn')?.addEventListener('click', async function() {
        await dashboard.loadLeaderboard();
        var container = document.getElementById('dashboardLeaderboard');
        if (container) {
            container.innerHTML = dashboard.renderLeaderboardItems();
        }
        showToast('Leaderboard refreshed!', 'success');
    });
}

// ============================================
// GET STUDENT PROGRESS
// ============================================
async function getStudentProgress(userId) {
    try {
        var { data, error } = await supabase
            .from('student_progress')
            .select('*')
            .eq('student_id', userId)
            .single();
        
        if (error) throw error;
        return data || null;
    } catch (error) {
        console.error('Error getting student progress:', error);
        return null;
    }
}

// ============================================
// GET SUBMISSIONS COUNT
// ============================================
async function getSubmissionsCount(userId) {
    try {
        var { count, error } = await supabase
            .from('student_answers')
            .select('id', { count: 'exact' })
            .eq('student_id', userId)
            .eq('status', 'graded');
        
        if (error) throw error;
        return count || 0;
    } catch (error) {
        console.error('Error getting submissions:', error);
        return 0;
    }
}

// ============================================
// GET REFERRALS COUNT
// ============================================
async function getReferralsCount(userId) {
    try {
        var { count, error } = await supabase
            .from('referrals')
            .select('id', { count: 'exact' })
            .eq('referrer_id', userId);
        
        if (error) {
            if (error.code === '42P01') return 0;
            throw error;
        }
        return count || 0;
    } catch (error) {
        console.error('Error getting referrals:', error);
        return 0;
    }
}
