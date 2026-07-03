// ============================================
// GLIIMU USER DASHBOARD - INSTRUCTOR FEATURES
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// Export instructor features
export default {
    renderDashboard,
    renderGradeSubmissions,
    getSubmissions,
    gradeSubmission
};

// ============================================
// INSTRUCTOR DASHBOARD
// ============================================
async function renderDashboard(container) {
    if (!container) return;
    
    try {
        const user = window.currentUser;
        if (!user) {
            container.innerHTML = `<div class="empty-state"><h3>Please log in</h3></div>`;
            return;
        }
        
        const submissions = await getSubmissions();
        const pendingSubmissions = submissions.filter(s => s.status === 'pending');
        const gradedSubmissions = submissions.filter(s => s.status === 'graded');
        
        container.innerHTML = `
            <div class="section-header">
                <h2>Instructor Dashboard</h2>
                <p>Manage and grade student submissions</p>
            </div>
            
            <div class="instructor-stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                <div class="stat-card" style="background: var(--bg-secondary); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color);">
                    <div class="stat-icon"><i class="fas fa-clock" style="color: #fbb040;"></i></div>
                    <div class="stat-info">
                        <span class="stat-label" style="color: var(--text-secondary);">Pending Submissions</span>
                        <span class="stat-value" style="font-size: 24px; font-weight: 700; color: var(--text-primary);">${pendingSubmissions.length}</span>
                    </div>
                </div>
                <div class="stat-card" style="background: var(--bg-secondary); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color);">
                    <div class="stat-icon"><i class="fas fa-check-circle" style="color: #10b981;"></i></div>
                    <div class="stat-info">
                        <span class="stat-label" style="color: var(--text-secondary);">Graded</span>
                        <span class="stat-value" style="font-size: 24px; font-weight: 700; color: var(--text-primary);">${gradedSubmissions.length}</span>
                    </div>
                </div>
                <div class="stat-card" style="background: var(--bg-secondary); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color);">
                    <div class="stat-icon"><i class="fas fa-users" style="color: #6366f1;"></i></div>
                    <div class="stat-info">
                        <span class="stat-label" style="color: var(--text-secondary);">Total Submissions</span>
                        <span class="stat-value" style="font-size: 24px; font-weight: 700; color: var(--text-primary);">${submissions.length}</span>
                    </div>
                </div>
            </div>
            
            <div class="submissions-section">
                <div class="submissions-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3>Recent Submissions</h3>
                    <button id="refreshSubmissionsBtn" class="btn-icon" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; color: var(--text-secondary);">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
                <div id="submissionsList">
                    ${renderSubmissionList(submissions.slice(0, 10))}
                </div>
            </div>
        `;
        
        document.getElementById('refreshSubmissionsBtn')?.addEventListener('click', async () => {
            const newSubmissions = await getSubmissions();
            const list = document.getElementById('submissionsList');
            if (list) {
                list.innerHTML = renderSubmissionList(newSubmissions.slice(0, 10));
            }
            showToast('Submissions refreshed!', 'success');
        });
        
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

function renderSubmissionList(submissions) {
    if (!submissions || submissions.length === 0) {
        return `
            <div class="empty-state" style="text-align: center; padding: 40px;">
                <i class="fas fa-inbox" style="font-size: 48px; color: var(--text-secondary);"></i>
                <h3 style="margin-top: 1rem;">No Submissions</h3>
                <p style="color: var(--text-secondary);">No student submissions to review yet.</p>
            </div>
        `;
    }
    
    return submissions.map(submission => `
        <div class="submission-card" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
                <div>
                    <h4 style="margin: 0; color: var(--text-primary);">${submission.title || 'Untitled Submission'}</h4>
                    <p style="margin: 4px 0 0; color: var(--text-secondary); font-size: 0.85rem;">
                        Student: ${submission.student_name || 'Unknown'} • 
                        ${new Date(submission.submitted_at).toLocaleDateString()}
                    </p>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="submission-status" style="padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; 
                        ${submission.status === 'pending' ? 'background: #fff3cd; color: #856404;' : 
                          submission.status === 'graded' ? 'background: #d4edda; color: #155724;' : 
                          'background: #f8d7da; color: #721c24;'}">
                        ${submission.status || 'pending'}
                    </span>
                    ${submission.status === 'pending' ? `
                        <button onclick="window.gradeSubmissionModal('${submission.id}')" class="btn-primary" style="padding: 6px 16px; font-size: 0.8rem; background: #fbb040; color: #1a1c4a; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                            Grade
                        </button>
                    ` : `
                        <span style="font-size: 0.85rem; color: var(--text-secondary);">
                            Grade: ${submission.grade || 'N/A'}
                        </span>
                    `}
                </div>
            </div>
        </div>
    `).join('');
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
    
    try {
        const submissions = await getSubmissions();
        const list = document.getElementById('gradeSubmissionsList');
        list.innerHTML = renderSubmissionList(submissions);
    } catch (error) {
        console.error('Error loading submissions:', error);
        document.getElementById('gradeSubmissionsList').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Submissions</h3>
                <button class="btn-primary" onclick="location.reload()">Try Again</button>
            </div>
        `;
    }
}

async function getSubmissions() {
    try {
        const user = window.currentUser;
        if (!user) return [];
        
        const { data, error } = await supabase
            .from('submissions')
            .select('*')
            .order('submitted_at', { ascending: false });
            
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting submissions:', error);
        return [];
    }
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
        return { success: true };
    } catch (error) {
        console.error('Error grading submission:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// GRADE MODAL
// ============================================
window.gradeSubmissionModal = function(submissionId) {
    let modal = document.getElementById('gradeModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'gradeModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
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
                        <button type="submit" class="btn-primary">Submit Grade</button>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('closeGradeModal').onclick = () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        };
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    document.getElementById('gradeForm').onsubmit = async (e) => {
        e.preventDefault();
        
        const grade = parseInt(document.getElementById('gradeInput').value);
        const feedback = document.getElementById('feedbackInput').value.trim();
        
        if (isNaN(grade) || grade < 0 || grade > 100) {
            showToast('Please enter a valid grade between 0 and 100', 'error');
            return;
        }
        
        const btn = document.getElementById('gradeForm').querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        
        const result = await gradeSubmission(submissionId, grade, feedback);
        
        btn.disabled = false;
        btn.innerHTML = 'Submit Grade';
        
        if (result.success) {
            showToast('Grade submitted successfully!', 'success');
            modal.classList.remove('active');
            document.body.style.overflow = '';
            
            // Refresh the dashboard
            const container = document.getElementById('dashboard-section');
            if (container) {
                await renderDashboard(container);
            }
            
            // Refresh grade submissions if on that tab
            const gradeContainer = document.getElementById('grade-section');
            if (gradeContainer && gradeContainer.classList.contains('active')) {
                await renderGradeSubmissions(gradeContainer);
            }
        } else {
            showToast(result.error || 'Failed to submit grade', 'error');
        }
    };
};
