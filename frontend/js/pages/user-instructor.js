// ============================================
// GLIIMU USER DASHBOARD - INSTRUCTOR FEATURES
// Path: /frontend/js/pages/user-instructor.js
// Purpose: Instructor-specific features (extends GeneralDashboard)
// ============================================

import { GeneralDashboard } from './user-general.js';
import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

export class InstructorDashboard extends GeneralDashboard {
    constructor(user, profile) {
        super(user, profile);
        this.isInstructor = true;
        console.log('👨‍🏫 Instructor dashboard initialized');
    }

    // ============================================
    // OVERRIDE: Load Dashboard with Instructor-specific content
    // ============================================
    async loadDashboard() {
        // Call parent method first
        await super.loadDashboard();
        
        // Add instructor-specific elements
        await this.addInstructorElements();
    }

    // ============================================
    // ADD INSTRUCTOR-SPECIFIC ELEMENTS
    // ============================================
    async addInstructorElements() {
        // Get pending submissions count
        const pendingCount = await this.getPendingSubmissionsCount();
        
        // Find the progress section and add instructor badge
        const progressSection = document.querySelector('.progress-section');
        if (progressSection) {
            const instructorBadge = document.createElement('div');
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
        const statsGrid = document.querySelector('.stats-grid');
        if (statsGrid) {
            const existing = statsGrid.querySelector('.stat-card.instructor-stat');
            if (!existing) {
                const instructorStat = document.createElement('div');
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
                
                instructorStat.querySelector('.stat-action-btn')?.addEventListener('click', () => {
                    // Navigate to manage tab or open grading interface
                    if (window.switchTab) {
                        window.switchTab('manage');
                    } else {
                        window.location.href = '/user?tab=manage';
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
        const container = this.container;
        if (!container) return;

        // Check if quick actions already exist
        const existing = container.querySelector('.instructor-quick-actions');
        if (existing) return;

        const quickActions = document.createElement('div');
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
                    <span>View Submissions</span>
                    <span style="margin-left: auto; background: rgba(251, 176, 64, 0.15); color: var(--brand-gold); padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 600;">${await this.getPendingSubmissionsCount()}</span>
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
        
        // Insert after the leaderboard or stats
        const leaderboard = container.querySelector('.leaderboard-card-full');
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
            const { count, error } = await supabase
                .from('submissions')
                .select('id', { count: 'exact' })
                .eq('status', 'pending');
            
            if (error) throw error;
            return count || 0;
        } catch (error) {
            console.error('Error getting pending submissions:', error);
            return 0;
        }
    }

    // ============================================
    // OVERRIDE: Messages with Instructor-specific view
    // ============================================
    async loadMessages(container) {
        await super.loadMessages(container);
        // Add instructor-specific message filtering or actions
        // Could add a filter for student messages vs general messages
    }

    // ============================================
    // OVERRIDE: Manage Tab for Instructors
    // ============================================
    async loadManage(container) {
        if (!container) {
            container = this.container;
        }
        if (!container) return;

        const pendingSubmissions = await this.getPendingSubmissions();
        const gradedSubmissions = await this.getGradedSubmissions();

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
                        ${pendingSubmissions.map(sub => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-color);">
                                <div>
                                    <strong>${sub.subject || 'Untitled'}</strong>
                                    <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0;">${sub.user_name || 'Student'}</p>
                                </div>
                                <button onclick="window.gradeSubmissionModal('${sub.id}')" class="btn-primary" style="padding: 6px 16px; font-size: 0.8rem;">
                                    <i class="fas fa-pen"></i> Grade
                                </button>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div style="text-align: center; padding: 30px; color: var(--text-muted);">
                        <i class="fas fa-check-circle" style="font-size: 2rem; display: block; margin-bottom: 8px; color: #10b981;"></i>
                        <p>All caught up! No pending submissions.</p>
                    </div>
                `}
            </div>
        `;
    }

    // ============================================
    // GET PENDING SUBMISSIONS
    // ============================================
    async getPendingSubmissions() {
        try {
            const { data, error } = await supabase
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
            const { data, error } = await supabase
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
}

// Export default for dynamic import
export default InstructorDashboard;

// Export as named export
export { InstructorDashboard };

// Grade submission modal function (kept for compatibility)
window.gradeSubmissionModal = function(submissionId) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2>Grade Submission</h2>
                <button class="modal-close" id="closeGradeModal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="gradeForm">
                    <div class="form-group">
                        <label>Grade (0-100)</label>
                        <input type="number" id="gradeInput" min="0" max="100" required placeholder="Enter grade">
                    </div>
                    <div class="form-group">
                        <label>Feedback</label>
                        <textarea id="feedbackInput" rows="4" placeholder="Provide feedback to the student..."></textarea>
                    </div>
                    <button type="submit" class="btn-primary" style="width: 100%;">
                        <i class="fas fa-save"></i> Submit Grade
                    </button>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('closeGradeModal')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    document.getElementById('gradeForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const grade = parseInt(document.getElementById('gradeInput').value);
        const feedback = document.getElementById('feedbackInput').value.trim();
        
        if (isNaN(grade) || grade < 0 || grade > 100) {
            showToast('Please enter a valid grade between 0 and 100', 'error');
            return;
        }
        
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        
        try {
            const { error } = await supabase
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
            modal.remove();
            
            // Refresh the page or tab
            if (window.switchTab) {
                window.switchTab('manage');
            } else {
                window.location.reload();
            }
        } catch (error) {
            console.error('Error grading submission:', error);
            showToast('Failed to submit grade: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Submit Grade';
        }
    });
};
