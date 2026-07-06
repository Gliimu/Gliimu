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
// LOAD SUBMISSIONS
// ============================================
export async function loadSubmissions(container, dashboard) {
    if (!container) {
        container = dashboard.container;
    }
    if (!container) return;

    var profile = dashboard.currentProfile;
    var progressData = await getStudentProgress(dashboard.currentUser.id);
    var nextQuestion = await getNextQuestion(dashboard.currentUser.id);
    var answeredQuestions = await getAnsweredQuestions(dashboard.currentUser.id);

    var progress = progressData?.progress || 0;
    var badge = progressData?.currentBadge || { name: 'Starter', icon: '🌱', color: '#10b981' };
    var currentGP = progressData?.currentGP || 0;
    var totalStars = progressData?.totalStars || 0;

    container.innerHTML = `
        <div class="dashboard-header">
            <h1><i class="fas fa-tasks"></i> Submissions</h1>
            <p>Answer questions to earn GP and increase your progress!</p>
        </div>

        <!-- Progress Overview -->
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
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <span style="font-size: 0.85rem; color: var(--text-secondary);">
                    <i class="fas fa-${badge.icon === '🌱' ? 'seedling' : badge.icon === '📜' ? 'scroll' : badge.icon === '🎓' ? 'graduation-cap' : badge.icon === '🏆' ? 'trophy' : 'crown'}"></i>
                    Current Badge: <strong style="color: var(--brand-gold);">${badge.name}</strong>
                </span>
                <span style="font-size: 0.8rem; color: var(--text-muted);">
                    Next: ${progressData?.nextBadge?.name || 'Ambassador'} (${Math.round(progressData?.progressToNext || 0)}%)
                </span>
            </div>
        </div>

        <!-- Next Question -->
        <div class="card" style="margin-bottom: 20px;">
            <h3><i class="fas fa-question-circle" style="color: var(--brand-gold);"></i> Next Question</h3>
            ${nextQuestion ? `
                <div style="margin-top: 12px; padding: 16px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color);">
                    <p style="font-size: 1rem; font-weight: 500; margin-bottom: 8px;">${escapeHtml(nextQuestion.question)}</p>
                    <p style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(nextQuestion.description || '')}</p>
                    <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
                        <button id="answerQuestionBtn" class="btn-primary">
                            <i class="fas fa-pen"></i> Answer Question
                        </button>
                        <span style="font-size: 0.75rem; color: var(--text-muted); align-self: center;">
                            <i class="fas fa-star" style="color: var(--brand-gold);"></i> +${nextQuestion.gp_reward || 10} GP
                        </span>
                    </div>
                </div>
            ` : `
                <div style="text-align: center; padding: 30px 20px; color: var(--text-secondary);">
                    <i class="fas fa-check-circle" style="font-size: 3rem; color: #10b981; margin-bottom: 12px; display: block;"></i>
                    <h3>All Questions Complete!</h3>
                    <p>You've answered all available questions. Check back later for more.</p>
                    <button class="btn-outline" onclick="window.location.reload()" style="margin-top: 12px;">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
            `}
        </div>

        <!-- Answered Questions -->
        <div class="card">
            <h3><i class="fas fa-history" style="color: var(--brand-gold);"></i> Answered Questions</h3>
            ${answeredQuestions.length > 0 ? `
                <div style="margin-top: 12px;">
                    ${answeredQuestions.map(function(aq) {
                        return `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border-color);">
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-weight: 500; color: var(--text-primary);">${escapeHtml(aq.question_title || 'Question')}</div>
                                    <div style="font-size: 0.75rem; color: var(--text-muted);">
                                        ${getTimeAgo(aq.answered_at)}
                                        ${aq.gp_earned ? ` • <span style="color: var(--brand-gold);">+${aq.gp_earned} GP</span>` : ''}
                                    </div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    ${aq.status === 'graded' ? `
                                        <span style="padding: 2px 10px; background: rgba(16, 185, 129, 0.15); color: #10b981; border-radius: 10px; font-size: 0.65rem; font-weight: 600;">
                                            ${aq.grade || 'Graded'}
                                        </span>
                                    ` : `
                                        <span style="padding: 2px 10px; background: rgba(245, 158, 11, 0.15); color: #f59e0b; border-radius: 10px; font-size: 0.65rem; font-weight: 600;">
                                            Pending
                                        </span>
                                    `}
                                    <button class="btn-outline view-answer-btn" style="padding: 2px 10px; font-size: 0.7rem;" data-id="${aq.id}">
                                        <i class="fas fa-eye"></i> View
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : `
                <div style="text-align: center; padding: 30px 20px; color: var(--text-secondary);">
                    <i class="fas fa-inbox" style="font-size: 2rem; display: block; margin-bottom: 8px; opacity: 0.5;"></i>
                    <p>No questions answered yet. Start learning!</p>
                </div>
            `}
        </div>
    `;

    // Bind events
    document.getElementById('answerQuestionBtn')?.addEventListener('click', function() {
        showQuestionModal(dashboard, nextQuestion);
    });

    document.querySelectorAll('.view-answer-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = this.dataset.id;
            var answer = answeredQuestions.find(function(a) { return a.id === id; });
            if (answer) {
                showAnswerModal(answer);
            }
        });
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
