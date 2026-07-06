// ============================================
// USER INSTRUCTOR - Instructor Logic
// Path: /frontend/js/pages/user/user-instructor.js
// Purpose: Instructor role specific logic
// ============================================

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';
import { GeneralDashboard } from './user-general.js';
import { renderOverview } from './user-tabs.js';
import { loadMessages } from './user-messages.js';
import { loadWallet, showFundWalletModal, showConvertStarsModal } from './user-wallet.js';
import { modalManager } from './user-modals.js';
import { formatDateTime, escapeHtml } from './user-utils.js';

export class InstructorDashboard extends GeneralDashboard {
    constructor(user, profile) {
        super(user, profile);
        this.role = 'instructor';
        this.isInstructor = true;
        console.log('👨‍🏫 Instructor dashboard initialized');
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
    // LOAD DASHBOARD (Overview Tab) - Instructor Specific
    // ============================================
    async loadDashboard() {
        await renderOverview(this.container, this);
        await this.addInstructorElements();
    }

    // ============================================
    // ADD INSTRUCTOR-SPECIFIC ELEMENTS
    // ============================================
    async addInstructorElements() {
        var container = this.container;
        if (!container) return;

        var pendingCount = await this.getPendingSubmissionsCount();

        // Add instructor badge
        var progressSection = container.querySelector('.progress-section');
        if (progressSection) {
            var instructorBadge = document.createElement('div');
            instructorBadge.className = 'instructor-badge-container';
            instructorBadge.style.cssText = `
                margin-top: 8px;
                padding: 8px 16px;
                background: rgba(59, 130, 246, 0.12);
                border-radius: 8px;
                border: 1px solid rgba(59, 130, 246, 0.2);
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.85rem;
                color: #3b82f6;
            `;
            instructorBadge.innerHTML = `
                <i class="fas fa-chalkboard-teacher"></i>
                <span>You are an <strong>Instructor</strong> 👨‍🏫</span>
                <span style="margin-left: auto; font-size: 0.7rem; opacity: 0.7;">
                    ${pendingCount} pending submissions
                </span>
            `;
            progressSection.parentNode.insertBefore(instructorBadge, progressSection.nextSibling);
        }

        // Add instructor stat card
        var statsGrid = container.querySelector('.stats-grid');
        if (statsGrid) {
            var existing = statsGrid.querySelector('.stat-card.instructor-stat');
            if (!existing) {
                var instructorStat = document.createElement('div');
                instructorStat.className = 'stat-card instructor-stat';
                instructorStat.style.cssText = `
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
                instructorStat.innerHTML = `
                    <div class="stat-icon" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">
                        <i class="fas fa-clipboard-list"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Pending Grading</h3>
                        <p class="stat-value" style="font-size: 1.35rem; font-weight: 700; color: var(--text-primary);">
                            ${pendingCount}
                        </p>
                    </div>
                    <button class="stat-action-btn" data-action="grade" title="Grade Submissions" style="position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; border-radius: 50%; border: none; background: var(--bg-tertiary); color: var(--text-secondary); cursor: pointer; transition: var(--transition); display: flex; align-items: center; justify-content: center; font-size: 0.7rem;">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                `;
                
                instructorStat.querySelector('.stat-action-btn').addEventListener('click', function() {
                    if (window.switchTab) {
                        window.switchTab('manage');
                    }
                });
                
                statsGrid.appendChild(instructorStat);
            }
        }

        // Add instructor quick actions
        this.addInstructorQuickActions();
    }

    // ============================================
    // ADD INSTRUCTOR QUICK ACTIONS
    // ============================================
    addInstructorQuickActions() {
        var container = this.container;
        if (!container) return;

        var existing = container.querySelector('.instructor-quick-actions');
        if (existing) return;

        var quickActions = document.createElement('div');
        quickActions.className = 'instructor-quick-actions card';
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
                <button onclick="window.switchTab('manage')" style="padding: 12px 16px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: var(--transition); font-family: inherit; color: var(--text-primary); display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-graduation-cap" style="color: var(--brand-gold);"></i>
                    <span>Grade Submissions</span>
                    <span style="margin-left: auto; background: rgba(251, 176, 64, 0.15); color: var(--brand-gold); padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 600;">${this._pendingCount || 0}</span>
                </button>
                <button onclick="window.location.href='/course'" style="padding: 12px 16px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: var(--transition); font-family: inherit; color: var(--text-primary); display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-book-open" style="color: #8b5cf6;"></i>
                    <span>Manage Courses</span>
                </button>
                <button onclick="window.location.href='/chat'" style="padding: 12px 16px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: var(--transition); font-family: inherit; color: var(--text-primary); display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-comments" style="color: #10b981;"></i>
                    <span>Student Messages</span>
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
    // GET PENDING SUBMISSIONS COUNT
    // ============================================
    async getPendingSubmissionsCount() {
        try {
            var { count, error } = await supabase
                .from('submissions')
                .select('id', { count: 'exact' })
                .eq('status', 'pending');
            
            if (error) throw error;
            this._pendingCount = count || 0;
            return count || 0;
        } catch (error) {
            console.error('Error getting pending submissions:', error);
            return 0;
        }
    }

    // ============================================
    // LOAD MANAGE (Instructor Grading)
    // ============================================
    async loadManage(container) {
        if (!container) {
            container = this.container;
        }
        if (!container) return;

        var pendingSubmissions = await this.getPendingSubmissions();
        var gradedSubmissions = await this.getGradedSubmissions();

        container.innerHTML = `
            <div class="dashboard-header">
                <h1><i class="fas fa-clipboard-list"></i> Manage Submissions</h1>
                <p>Review and grade student work</p>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                <div class="card" style="text-align: center; padding: 20px;">
                    <h3 style="font-size: 2rem; color: var(--brand-gold);">${pendingSubmissions.length}</h3>
                    <p style="color: var(--text-secondary);">Pending Submissions</p>
                </div>
                <div class="card" style="text-align: center; padding: 20px;">
                    <h3 style="font-size: 2rem; color: #10b981;">${gradedSubmissions.length}</h3>
                    <p style="color: var(--text-secondary);">Graded Submissions</p>
                </div>
            </div>

            <div class="card">
                <h3>Pending Submissions</h3>
                ${pendingSubmissions.length > 0 ? `
                    <div style="margin-top: 12px;">
                        ${pendingSubmissions.map(function(sub) {
                            return `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-color);">
                                    <div>
                                        <strong>${escapeHtml(sub.subject || 'Untitled')}</strong>
                                        <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0;">${escapeHtml(sub.user_name || 'Student')}</p>
                                        <p style="font-size: 0.7rem; color: var(--text-muted); margin: 0;">${formatDateTime(sub.created_at)}</p>
                                    </div>
                                    <button class="btn-primary grade-submission-btn" style="padding: 6px 16px; font-size: 0.8rem;" data-id="${sub.id}">
                                        <i class="fas fa-pen"></i> Grade
                                    </button>
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : `
                    <div style="text-align: center; padding: 30px; color: var(--text-muted);">
                        <i class="fas fa-check-circle" style="font-size: 2rem; display: block; margin-bottom: 8px; color: #10b981;"></i>
                        <p>All caught up! No pending submissions.</p>
                    </div>
                `}
            </div>

            ${gradedSubmissions.length > 0 ? `
                <div class="card" style="margin-top: 20px;">
                    <h3>Recent Graded Submissions</h3>
                    <div style="margin-top: 12px;">
                        ${gradedSubmissions.map(function(sub) {
                            return `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border-color);">
                                    <div>
                                        <strong>${escapeHtml(sub.subject || 'Untitled')}</strong>
                                        <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0;">${escapeHtml(sub.user_name || 'Student')}</p>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span style="padding: 2px 10px; background: rgba(16, 185, 129, 0.15); color: #10b981; border-radius: 10px; font-size: 0.7rem; font-weight: 600;">
                                            ${sub.grade || 'Graded'}
                                        </span>
                                        <button class="btn-outline view-grade-btn" style="padding: 2px 10px; font-size: 0.7rem;" data-id="${sub.id}">
                                            <i class="fas fa-eye"></i> View
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}
        `;

        // Bind grade button events
        container.querySelectorAll('.grade-submission-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.dataset.id;
                this.showGradeModal(id);
            }.bind(this));
        }.bind(this));

        // Bind view grade button events
        container.querySelectorAll('.view-grade-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.dataset.id;
                var sub = gradedSubmissions.find(function(s) { return s.id === id; });
                if (sub) {
                    this.showGradeViewModal(sub);
                }
            }.bind(this));
        }.bind(this));

        this.setupModalCloseHandlers();
    }

    // ============================================
    // GET PENDING SUBMISSIONS
    // ============================================
    async getPendingSubmissions() {
        try {
            var { data, error } = await supabase
                .from('submissions')
                .select('*')
                .eq('status', 'pending')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting pending submissions:', error);
            return [];
        }
    }

    // ============================================
    // GET GRADED SUBMISSIONS
    // ============================================
    async getGradedSubmissions() {
        try {
            var { data, error } = await supabase
                .from('submissions')
                .select('*')
                .eq('status', 'graded')
                .order('graded_at', { ascending: false })
                .limit(20);
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting graded submissions:', error);
            return [];
        }
    }

    // ============================================
    // SHOW GRADE MODAL
    // ============================================
    showGradeModal(submissionId) {
        var self = this;
        
        modalManager.createModal({
            title: '📝 Grade Submission',
            maxWidth: '500px',
            body: `
                <form id="gradeForm" novalidate>
                    <div class="form-group">
                        <label>Grade (0-100)</label>
                        <input type="number" id="gradeInput" min="0" max="100" required placeholder="Enter grade">
                        <small>Enter a number between 0 and 100</small>
                    </div>
                    <div class="form-group">
                        <label>Feedback</label>
                        <textarea id="feedbackInput" rows="4" placeholder="Provide feedback to the student..."></textarea>
                    </div>
                    <button type="submit" class="btn-primary" style="width: 100%;">
                        <i class="fas fa-save"></i> Submit Grade
                    </button>
                </form>
            `
        });

        document.getElementById('gradeForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            var grade = parseInt(document.getElementById('gradeInput').value);
            var feedback = document.getElementById('feedbackInput').value.trim();
            
            if (isNaN(grade) || grade < 0 || grade > 100) {
                showToast('Please enter a valid grade between 0 and 100', 'error');
                return;
            }
            
            var btn = this.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            
            try {
                var { error } = await supabase
                    .from('submissions')
                    .update({
                        grade: grade,
                        feedback: feedback,
                        status: 'graded',
                        graded_at: new Date().toISOString()
                    })
                    .eq('id', submissionId);
                
                if (error) throw error;
                
                showToast('✅ Grade submitted successfully!', 'success');
                
                // Close modal
                var modal = document.querySelector('.modal.active');
                if (modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                    setTimeout(function() {
                        if (modal.parentNode) {
                            modal.parentNode.removeChild(modal);
                        }
                    }, 300);
                }
                
                // Refresh manage tab
                await self.loadManage(self.container);
                
            } catch (error) {
                console.error('Error grading submission:', error);
                showToast('Failed to submit grade: ' + error.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Submit Grade';
            }
        });
    }

    // ============================================
    // SHOW GRADE VIEW MODAL
    // ============================================
    showGradeViewModal(submission) {
        modalManager.createModal({
            title: '📊 Submission Details',
            maxWidth: '500px',
            body: `
                <div style="margin-bottom: 12px;">
                    <div style="font-size: 0.85rem; font-weight: 500; color: var(--text-primary);">${escapeHtml(submission.subject || 'Untitled')}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
                        Student: ${escapeHtml(submission.user_name || 'Unknown')}
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">
                        Submitted: ${formatDateTime(submission.created_at)}
                    </div>
                </div>
                <div style="padding: 12px 16px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 12px;">
                    <p style="white-space: pre-wrap; font-size: 0.9rem; line-height: 1.6; color: var(--text-primary);">${escapeHtml(submission.message || 'No message')}</p>
                    ${submission.file_url ? `
                        <a href="${submission.file_url}" target="_blank" style="display: inline-block; margin-top: 8px; color: var(--brand-gold); text-decoration: none;">
                            <i class="fas fa-paperclip"></i> Attachment
                        </a>
                    ` : ''}
                    ${submission.gliimu_link ? `
                        <a href="${submission.gliimu_link}" target="_blank" style="display: inline-block; margin-top: 8px; color: var(--brand-gold); text-decoration: none;">
                            <i class="fas fa-external-link-alt"></i> View Submission Link
                        </a>
                    ` : ''}
                </div>
                <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                    <span style="padding: 4px 16px; background: rgba(16, 185, 129, 0.15); color: #10b981; border-radius: 20px; font-weight: 600;">
                        Grade: ${submission.grade}%
                    </span>
                    ${submission.destination ? `
                        <span style="padding: 4px 16px; background: rgba(139, 92, 246, 0.15); color: #8b5cf6; border-radius: 20px; font-weight: 600;">
                            → ${submission.destination}
                        </span>
                    ` : ''}
                </div>
                ${submission.feedback ? `
                    <div style="margin-top: 12px; padding: 12px 16px; background: rgba(59, 130, 246, 0.06); border-radius: 8px; border-left: 3px solid #3b82f6;">
                        <div style="font-size: 0.75rem; font-weight: 600; color: #3b82f6; margin-bottom: 4px;">Your Feedback</div>
                        <p style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(submission.feedback)}</p>
                    </div>
                ` : ''}
            `
        });
    }

    // ============================================
    // SHOW ACCESS MODAL
    // ============================================
    showAccessModal() {
        // Instructors have full access, so just show a message
        showToast('You have full access as an Instructor', 'info');
    }
}

export default InstructorDashboard;
