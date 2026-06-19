// ============================================
// GLIIMU USER DASHBOARD - INSTRUCTOR FEATURES
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// Export instructor features
export default {
    renderGradeSubmissions,
    renderInstructorDashboard,
    getSubmissions,
    gradeSubmission
};

// ============================================
// INSTRUCTOR DASHBOARD
// ============================================
async function renderInstructorDashboard(container) {
    if (!container) return;
    
    try {
        const stats = await getInstructorStats();
        
        container.innerHTML = `
            <div class="section-header">
                <h2>Instructor Dashboard</h2>
                <p>Manage your courses and students</p>
            </div>
            
            <div class="instructor-stats-grid">
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-users"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">Total Students</span>
                        <span class="stat-value">${stats.totalStudents || 0}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-clipboard-list"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">Pending Submissions</span>
                        <span class="stat-value">${stats.pendingSubmissions || 0}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">Graded</span>
                        <span class="stat-value">${stats.gradedSubmissions || 0}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-star"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">Average Rating</span>
                        <span class="stat-value">${stats.averageRating || 'N/A'}</span>
                    </div>
                </div>
            </div>
            
            <div class="submissions-section">
                <h3>Recent Submissions</h3>
                <div id="submissionsList">
                    <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>
                </div>
            </div>
        `;
        
        await renderSubmissionsList();
        
    } catch (error) {
        console.error('Error loading instructor dashboard:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Dashboard</h3>
                <button class="btn-primary" onclick="location.reload()">Refresh</button>
            </div>
        `;
    }
}

// ============================================
// GRADE SUBMISSIONS
// ============================================
async function renderGradeSubmissions(container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <h2>Grade Submissions</h2>
            <p>Review and grade student submissions</p>
        </div>
        <div id="gradeSubmissionsList">
            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading submissions...</div>
        </div>
    `;
    
    await renderSubmissionsList();
}

async function renderSubmissionsList() {
    const container = document.getElementById('gradeSubmissionsList') || document.getElementById('submissionsList');
    if (!container) return;
    
    try {
        const submissions = await getSubmissions();
        
        if (!submissions || submissions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>No Submissions</h3>
                    <p>All submissions have been graded. Great job!</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = submissions.map(sub => `
            <div class="submission-item" data-id="${sub.id}">
                <div class="submission-info">
                    <div class="submission-student">
                        <strong>${sub.student_name || 'Student'}</strong>
                        <span class="submission-course">${sub.course_title || 'Course'}</span>
                    </div>
                    <div class="submission-date">${new Date(sub.submitted_at).toLocaleDateString()}</div>
                </div>
                <div class="submission-actions">
                    <button class="btn-outline view-submission" data-id="${sub.id}">View</button>
                    <button class="btn-primary grade-submission" data-id="${sub.id}">Grade</button>
                </div>
            </div>
        `).join('');
        
        // Add event listeners
        container.querySelectorAll('.view-submission').forEach(btn => {
            btn.addEventListener('click', () => viewSubmission(btn.dataset.id));
        });
        
        container.querySelectorAll('.grade-submission').forEach(btn => {
            btn.addEventListener('click', () => openGradeModal(btn.dataset.id));
        });
        
    } catch (error) {
        console.error('Error loading submissions:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Submissions</h3>
                <button class="btn-primary" onclick="location.reload()">Try Again</button>
            </div>
        `;
    }
}

// ============================================
// API FUNCTIONS
// ============================================
async function getInstructorStats() {
    try {
        const { data, error } = await supabase
            .from('instructor_stats')
            .select('*')
            .eq('instructor_id', currentUser.id)
            .single();
            
        if (error) throw error;
        return data || {};
    } catch (error) {
        console.error('Error getting instructor stats:', error);
        return {};
    }
}

async function getSubmissions() {
    try {
        const { data, error } = await supabase
            .from('submissions')
            .select('*')
            .eq('instructor_id', currentUser.id)
            .eq('status', 'pending')
            .order('submitted_at', { ascending: false });
            
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting submissions:', error);
        return [];
    }
}

async function viewSubmission(submissionId) {
    showToast('Viewing submission...', 'info');
    // Implementation details
}

async function gradeSubmission(submissionId, grade, feedback) {
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
        
        showToast('Submission graded successfully!', 'success');
        renderSubmissionsList();
        return true;
    } catch (error) {
        console.error('Error grading submission:', error);
        showToast('Error grading submission', 'error');
        return false;
    }
}

function openGradeModal(submissionId) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Grade Submission</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="gradeForm">
                    <div class="form-group">
                        <label>Grade (0-100)</label>
                        <input type="number" id="gradeInput" min="0" max="100" required>
                    </div>
                    <div class="form-group">
                        <label>Feedback</label>
                        <textarea id="feedbackInput" rows="4" placeholder="Provide feedback..."></textarea>
                    </div>
                    <button type="submit" class="btn-primary">Submit Grade</button>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('gradeForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const grade = parseInt(document.getElementById('gradeInput').value);
        const feedback = document.getElementById('feedbackInput').value;
        
        if (isNaN(grade) || grade < 0 || grade > 100) {
            showToast('Please enter a valid grade (0-100)', 'error');
            return;
        }
        
        await gradeSubmission(submissionId, grade, feedback);
        modal.remove();
    });
}
