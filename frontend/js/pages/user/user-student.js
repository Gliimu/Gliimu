// ============================================
// USER STUDENT - Student Logic
// Path: /frontend/js/pages/user/user-student.js
// Purpose: Student role specific logic
// ============================================

import { GeneralDashboard } from './user-general.js';
import { renderOverview } from './user-tabs.js';
import { loadSubmissions } from './user-submissions.js';
import { loadWallet, showFundWalletModal, showConvertStarsModal } from './user-wallet.js';
import { loadMessages } from './user-messages.js';
import { modalManager } from './user-modals.js';

export class StudentDashboard extends GeneralDashboard {
    constructor(user, profile) {
        super(user, profile);
        this.role = 'student';
        this.isStudent = true;
        console.log('🎓 Student dashboard initialized');
    }

    // ============================================
    // RENDER DASHBOARD
    // ============================================
    async render(container) {
        this.container = container;
        this.setupStickyNav();
        await this.loadDashboard();
        if (this.alertManager) {
            this.updateAlertBadge(this.alertManager.unreadCount || 0);
        }
    }

    // ============================================
    // LOAD DASHBOARD (Overview Tab) - Student Specific
    // ============================================
    async loadDashboard() {
        await renderOverview(this.container, this);
        this.addStudentElements();
    }

    // ============================================
    // ADD STUDENT-SPECIFIC ELEMENTS
    // ============================================
    addStudentElements() {
        var container = this.container;
        if (!container) return;

        // Add student badge to progress section
        var progressSection = container.querySelector('.progress-section');
        if (progressSection) {
            var studentBadge = document.createElement('div');
            studentBadge.className = 'student-badge-container';
            studentBadge.style.cssText = `
                margin-top: 8px;
                padding: 8px 16px;
                background: rgba(251, 176, 64, 0.12);
                border-radius: 8px;
                border: 1px solid rgba(251, 176, 64, 0.2);
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.85rem;
                color: var(--brand-gold);
            `;
            studentBadge.innerHTML = `
                <i class="fas fa-user-graduate"></i>
                <span>You are enrolled as a <strong>Student</strong> 🎓</span>
                <span style="margin-left: auto; font-size: 0.7rem; opacity: 0.7;">
                    ${new Date().toLocaleDateString()}
                </span>
            `;
            progressSection.parentNode.insertBefore(studentBadge, progressSection.nextSibling);
        }

        // Add student stat card
        var statsGrid = container.querySelector('.stats-grid');
        if (statsGrid) {
            var existing = statsGrid.querySelector('.stat-card.student-stat');
            if (!existing) {
                var studentStat = document.createElement('div');
                studentStat.className = 'stat-card student-stat';
                studentStat.style.cssText = `
                    background: var(--bg-secondary);
                    border-radius: var(--radius-md);
                    padding: 20px 24px;
                    border: 1px solid var(--border-color);
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    transition: var(--transition);
                    box-shadow: var(--shadow-sm);
                    position: relative;
                `;
                
                var progress = this.currentProfile?.progress || 0;
                
                studentStat.innerHTML = `
                    <div class="stat-icon" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;">
                        <i class="fas fa-graduation-cap"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Learning Progress</h3>
                        <p class="stat-value" style="font-size: 1.35rem; font-weight: 700; color: var(--text-primary);">
                            ${Math.round(progress)}%
                        </p>
                    </div>
                    <button class="stat-action-btn" data-action="learning" title="View Learning Path" style="position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; border-radius: 50%; border: none; background: var(--bg-tertiary); color: var(--text-secondary); cursor: pointer; transition: var(--transition); display: flex; align-items: center; justify-content: center; font-size: 0.7rem;">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                `;
                
                studentStat.querySelector('.stat-action-btn').addEventListener('click', function() {
                    window.location.href = '/course';
                });
                
                statsGrid.appendChild(studentStat);
            }
        }

        // Add student quick actions
        this.addStudentQuickActions();
    }

    // ============================================
    // ADD STUDENT QUICK ACTIONS
    // ============================================
    addStudentQuickActions() {
        var container = this.container;
        if (!container) return;

        var existing = container.querySelector('.student-quick-actions');
        if (existing) return;

        var quickActions = document.createElement('div');
        quickActions.className = 'student-quick-actions card';
        quickActions.style.cssText = `
            margin-top: 20px;
            padding: 16px 20px;
            background: var(--bg-secondary);
            border-radius: var(--radius-md);
            border: 1px solid var(--border-color);
        `;
        quickActions.innerHTML = `
            <h3 style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">
                <i class="fas fa-bolt" style="color: var(--brand-gold);"></i> Quick Actions
            </h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                <button onclick="window.switchTab('submissions')" style="padding: 12px 16px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: var(--transition); font-family: inherit; color: var(--text-primary); display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-tasks" style="color: var(--brand-gold);"></i>
                    <span>Answer Questions</span>
                    <span style="margin-left: auto; background: rgba(251, 176, 64, 0.15); color: var(--brand-gold); padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 600;">+GP</span>
                </button>
                <button onclick="window.location.href='/hub'" style="padding: 12px 16px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: var(--transition); font-family: inherit; color: var(--text-primary); display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-th-large" style="color: #8b5cf6;"></i>
                    <span>Explore Hub</span>
                </button>
                <button onclick="window.location.href='/course'" style="padding: 12px 16px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: var(--transition); font-family: inherit; color: var(--text-primary); display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-road" style="color: #10b981;"></i>
                    <span>Learning Path</span>
                </button>
            </div>
        `;
        
        var leaderboard = container.querySelector('.leaderboard-card-full');
        if (leaderboard) {
            leaderboard.parentNode.insertBefore(quickActions, leaderboard.nextSibling);
        } else {
            container.appendChild(quickActions);
        }
    }

    // ============================================
    // LOAD SUBMISSIONS - Student Specific
    // ============================================
    async loadSubmissions(container) {
        await loadSubmissions(container || this.container, this);
    }
}

export default StudentDashboard;
