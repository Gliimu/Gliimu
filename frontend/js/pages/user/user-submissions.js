// ============================================
// USER SUBMISSIONS - Questions & Answers Logic
// Path: /frontend/js/pages/user/user-submissions.js
// Purpose: Handle questions, answers, GP earning, progress tracking
// ============================================

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';
import { getStudentProgress, getNextQuestion, submitAnswer, getCurrentBadge } from '../../modules/progression.js';
import { formatCurrency, getTimeAgo, escapeHtml } from './user-utils.js';
import { modalManager } from './user-modals.js';

// ============================================
// LOAD SUBMISSIONS - FIXED
// ============================================
export async function loadSubmissions(container, dashboard) {
    if (!container) {
        container = dashboard.container;
    }
    if (!container) return;

    // Use getStudentProgress from progression module
    var progressData = await getStudentProgress(dashboard.currentUser.id);
    var progress = progressData?.progress || 0;
    var currentGP = progressData?.currentGP || 0;
    var totalStars = progressData?.totalStars || 0;

    // Get next question - handle gracefully if table doesn't exist
    var nextQuestion = null;
    try {
        nextQuestion = await getNextQuestion(dashboard.currentUser.id);
    } catch (e) {
        console.warn('Could not get next question:', e);
    }

    // Get answered questions - handle gracefully
    var answeredQuestions = [];
    try {
        answeredQuestions = await getAnsweredQuestions(dashboard.currentUser.id);
    } catch (e) {
        console.warn('Could not get answered questions:', e);
    }

    container.innerHTML = `
        <div class="dashboard-header">
            <h1><i class="fas fa-tasks"></i> Submissions</h1>
            <p>Answer questions to earn GP and increase your progress!</p>
        </div>

        <div class="card" style="margin-bottom: 20px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px;">
                <div style="text-align: center;">
                    <div style="font-size: 2rem; font-weight: 700; color: var(--brand-gold);">${Math.round(progress)}%</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">Progress</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 2rem; font-weight: 700; color: var(--brand-gold);">${currentGP.toLocaleString()}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">GP Points</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 2rem; font-weight: 700; color: var(--brand-gold);">${totalStars} ⭐</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">Stars</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 2rem; font-weight: 700; color: var(--brand-gold);">${answeredQuestions.length}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">Answered</div>
                </div>
            </div>
        </div>

        <div class="card" style="margin-bottom: 20px;">
            <h3><i class="fas fa-question-circle" style="color: var(--brand-gold);"></i> Next Question</h3>
            ${nextQuestion ? `
                <div style="margin-top: 12px; padding: 16px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color);">
                    <p style="font-size: 1rem; font-weight: 500; margin-bottom: 8px;">${escapeHtml(nextQuestion.question)}</p>
                    <p style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(nextQuestion.description || '')}</p>
                    <div style="margin-top: 12px;">
                        <button id="answerQuestionBtn" class="btn-primary">
                            <i class="fas fa-pen"></i> Answer Question
                        </button>
                        <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 12px;">
                            <i class="fas fa-star" style="color: var(--brand-gold);"></i> +${nextQuestion.gp_reward || 10} GP
                        </span>
                    </div>
                </div>
            ` : `
                <div style="text-align: center; padding: 30px 20px; color: var(--text-secondary);">
                    <i class="fas fa-check-circle" style="font-size: 3rem; color: #10b981; margin-bottom: 12px; display: block;"></i>
                    <h3>All Questions Complete!</h3>
                    <p>You've answered all available questions. Check back later for more.</p>
                </div>
            `}
        </div>
    `;

    // Bind events
    document.getElementById('answerQuestionBtn')?.addEventListener('click', function() {
        if (nextQuestion) {
            showQuestionModal(dashboard, nextQuestion);
        }
    });

    dashboard.setupModalCloseHandlers();
}

// ============================================
// GET ANSWERED QUESTIONS - FIXED
// ============================================
export async function getAnsweredQuestions(userId) {
    try {
        var { data, error } = await supabase
            .from('student_answers')
            .select(`
                *,
                questions(question, description)
            `)
            .eq('student_id', userId)
            .order('answered_at', { ascending: false });

        if (error) throw error;
        
        return data.map(function(a) {
            return {
                ...a,
                question_title: a.questions?.question || 'Question'
            };
        }) || [];
    } catch (error) {
        console.error('Error getting answered questions:', error);
        return [];
    }
}

// ============================================
// SHOW QUESTION MODAL
// ============================================
export function showQuestionModal(dashboard, question) {
    if (!question) {
        showToast('No question available', 'error');
        return;
    }

    var modal = document.getElementById('questionModal');
    if (!modal) {
        // Modal already exists in HTML
        modal = document.getElementById('questionModal');
        if (!modal) {
            showToast('Question modal not found', 'error');
            return;
        }
    }

    var title = document.getElementById('questionModalTitle');
    var body = document.getElementById('questionModalBody');

    if (title) title.textContent = 'Answer Question';
    
    if (body) {
        body.innerHTML = `
            <div style="margin-bottom: 16px;">
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">
                    <i class="fas fa-star" style="color: var(--brand-gold);"></i> +${question.gp_reward || 10} GP
                </div>
                <p style="font-size: 1.05rem; font-weight: 500; line-height: 1.6;">${escapeHtml(question.question)}</p>
                ${question.description ? `<p style="color: var(--text-secondary); margin-top: 8px;">${escapeHtml(question.description)}</p>` : ''}
            </div>
            <form id="answerForm" novalidate>
                <div class="form-group">
                    <label>Your Answer</label>
                    <textarea id="answerContent" rows="6" required placeholder="Type your answer in detail..."></textarea>
                </div>
                <button type="submit" class="btn-primary" style="width: 100%;">
                    <i class="fas fa-paper-plane"></i> Submit Answer
                </button>
            </form>
        `;
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Close handlers
    document.getElementById('closeQuestionModal')?.addEventListener('click', function() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    });
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // Form submission
    document.getElementById('answerForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        var content = document.getElementById('answerContent').value.trim();
        if (!content) {
            showToast('Please enter an answer', 'error');
            return;
        }

        var btn = this.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

        var result = await submitAnswer(dashboard.currentUser.id, question.id, content);

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Answer';

        if (result) {
            showToast('✅ Answer submitted! You earned GP!', 'success');
            modal.classList.remove('active');
            document.body.style.overflow = '';
            await loadSubmissions(dashboard.container, dashboard);
        } else {
            showToast('Failed to submit answer', 'error');
        }
    });
}

// ============================================
// SHOW ANSWER MODAL
// ============================================
export function showAnswerModal(answer) {
    var modal = modalManager.createModal({
        title: '📝 Your Answer',
        maxWidth: '500px',
        body: `
            <div style="margin-bottom: 12px;">
                <div style="font-size: 0.85rem; font-weight: 500; color: var(--text-primary);">${escapeHtml(answer.question_title || 'Question')}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
                    Answered ${getTimeAgo(answer.answered_at)}
                </div>
            </div>
            <div style="padding: 12px 16px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 12px;">
                <p style="white-space: pre-wrap; font-size: 0.9rem; line-height: 1.6; color: var(--text-primary);">${escapeHtml(answer.answer)}</p>
            </div>
            ${answer.feedback ? `
                <div style="padding: 12px 16px; background: rgba(59, 130, 246, 0.06); border-radius: 8px; border-left: 3px solid #3b82f6;">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #3b82f6; margin-bottom: 4px;">Instructor Feedback</div>
                    <p style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(answer.feedback)}</p>
                </div>
            ` : ''}
            ${answer.grade ? `
                <div style="margin-top: 12px; text-align: center;">
                    <span style="padding: 4px 16px; background: rgba(16, 185, 129, 0.15); color: #10b981; border-radius: 20px; font-weight: 600;">
                        Grade: ${answer.grade}%
                    </span>
                    ${answer.gp_earned ? ` <span style="padding: 4px 16px; background: rgba(251, 176, 64, 0.15); color: var(--brand-gold); border-radius: 20px; font-weight: 600;">
                        +${answer.gp_earned} GP
                    </span>` : ''}
                </div>
            ` : ''}
        `
    });
}
