// ============================================
// QUESTIONS MODULE - COMPLETE
// Question rendering, answer submission, and UI components
// ============================================

import { supabase } from './supabase.js';
import { showToast } from './toast.js';
import { submitAnswer, reportQuestion, requestDebateMatch, submitDebateArgument } from './progression.js';

// ============================================
// QUESTION RENDERER
// ============================================

export class QuestionRenderer {
    constructor(containerId, studentId, onAnswerComplete) {
        this.container = document.getElementById(containerId);
        this.studentId = studentId;
        this.onAnswerComplete = onAnswerComplete;
        this.currentQuestion = null;
        this.selectedFile = null;
        this.isSubmitting = false;
        this.questionCount = 0;
        this.totalQuestions = 0;
        this.answeredQuestions = 0;
    }

    // ============================================
    // MAIN RENDER METHOD
    // ============================================
    async renderQuestion(question, questionIndex = 1, totalQuestions = 1) {
        if (!this.container) return;
        
        this.currentQuestion = question;
        this.questionCount = questionIndex;
        this.totalQuestions = totalQuestions;
        
        const badgeColors = {
            starter: '#10b981',
            diploma: '#3b82f6',
            advanced: '#8b5cf6',
            mastery: '#f59e0b',
            ambassador: '#ef4444'
        };
        
        const badgeColor = badgeColors[question.badge_level] || '#fbb040';
        const badgeName = question.badge_level ? question.badge_level.charAt(0).toUpperCase() + question.badge_level.slice(1) : 'Question';
        
        // Get question type icon
        const typeIcons = {
            mcq: 'fa-list-ul',
            typed: 'fa-pencil-alt',
            file: 'fa-upload',
            debate: 'fa-gavel'
        };
        const typeIcon = typeIcons[question.type] || 'fa-question-circle';
        
        // Get question type label
        const typeLabels = {
            mcq: 'Multiple Choice',
            typed: 'Written Answer',
            file: 'Project Upload',
            debate: 'Debate'
        };
        const typeLabel = typeLabels[question.type] || 'Question';
        
        this.container.innerHTML = `
            <div class="question-card" data-question-id="${question.id}">
                <!-- Header -->
                <div class="question-header">
                    <div class="question-meta">
                        <span class="question-badge" style="background: ${badgeColor}20; color: ${badgeColor}; border-color: ${badgeColor}">
                            ${badgeName}
                        </span>
                        <span class="question-type-badge">
                            <i class="fas ${typeIcon}"></i> ${typeLabel}
                        </span>
                        ${question.category ? `<span class="question-category">📂 ${this.escapeHtml(question.category)}</span>` : ''}
                    </div>
                    <button class="question-report-btn" data-question-id="${question.id}" title="Report this question">
                        <i class="fas fa-flag"></i>
                    </button>
                </div>
                
                <!-- Progress -->
                <div class="question-progress">
                    <span class="question-counter">Question ${questionIndex} of ${totalQuestions}</span>
                    <div class="question-progress-bar">
                        <div class="question-progress-fill" style="width: ${((questionIndex - 1) / totalQuestions) * 100}%"></div>
                    </div>
                </div>
                
                <!-- Question Text -->
                <div class="question-text">
                    <p>${this.escapeHtml(question.text)}</p>
                </div>
                
                <!-- Answer Area -->
                <div class="question-answer-area">
                    ${this.renderAnswerArea(question)}
                </div>
                
                <!-- Explanation (shown after answer) -->
                <div class="question-explanation" id="questionExplanation" style="display: none;">
                    <div class="explanation-content">
                        <i class="fas fa-lightbulb"></i>
                        <span id="explanationText"></span>
                    </div>
                </div>
                
                <!-- Actions -->
                <div class="question-actions">
                    <button class="btn-submit-answer" id="submitAnswerBtn">
                        <i class="fas fa-paper-plane"></i> Submit Answer
                    </button>
                    ${question.type === 'debate' ? `
                        <button class="btn-skip-question" id="skipQuestionBtn">
                            <i class="fas fa-forward"></i> Skip
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
        
        this.attachEventListeners(question);
        
        // Scroll to top of question
        this.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ============================================
    // RENDER ANSWER AREA BY TYPE
    // ============================================
    renderAnswerArea(question) {
        switch(question.type) {
            case 'mcq':
                return this.renderMCQArea(question);
            case 'typed':
                return this.renderTypedArea(question);
            case 'file':
                return this.renderFileArea(question);
            case 'debate':
                return this.renderDebateArea(question);
            default:
                return this.renderTypedArea(question);
        }
    }

    // ============================================
    // MCQ RENDERER
    // ============================================
    renderMCQArea(question) {
        const options = question.options || {};
        const optionKeys = Object.keys(options);
        
        return `
            <div class="mcq-options">
                ${optionKeys.map((key, index) => `
                    <label class="mcq-option" data-value="${key}">
                        <input type="radio" name="mcq_answer" value="${key}">
                        <div class="mcq-option-content">
                            <span class="mcq-option-letter">${String.fromCharCode(65 + index)}</span>
                            <span class="mcq-option-text">${this.escapeHtml(options[key])}</span>
                        </div>
                    </label>
                `).join('')}
            </div>
        `;
    }

    // ============================================
    // TYPED ANSWER RENDERER
    // ============================================
    renderTypedArea(question) {
        return `
            <div class="typed-area">
                <textarea class="typed-input" id="typedAnswer" rows="6" placeholder="Type your answer here..."></textarea>
                <div class="answer-format-hint">
                    <i class="fas fa-info-circle"></i>
                    <span>Be specific and provide examples where appropriate. Minimum 20 characters.</span>
                </div>
                <div class="typed-word-count">
                    <span id="wordCount">0</span> characters
                </div>
            </div>
        `;
    }

    // ============================================
    // FILE UPLOAD RENDERER
    // ============================================
    renderFileArea(question) {
        return `
            <div class="file-area">
                <div class="file-drop-zone" id="fileDropZone">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p>Drag & drop your file here or click to browse</p>
                    <span class="file-drop-sub">Accepted formats: PDF, DOC, DOCX, JPG, PNG, MP4, ZIP</span>
                    <span class="file-drop-sub">Max size: 50MB</span>
                    <input type="file" id="fileInput" accept=".pdf,.doc,.docx,.jpg,.png,.mp4,.zip" style="display: none;">
                </div>
                <div id="selectedFileName" class="selected-file" style="display: none;"></div>
                <div class="file-requirements">
                    <i class="fas fa-info-circle"></i>
                    <span>Your submission will be reviewed by an instructor before grading.</span>
                </div>
            </div>
        `;
    }

    // ============================================
    // DEBATE RENDERER
    // ============================================
    renderDebateArea(question) {
        return `
            <div class="debate-area">
                <div class="debate-motion">
                    <strong>Motion:</strong> ${this.escapeHtml(question.text)}
                </div>
                <div class="debate-stance">
                    <label class="stance-option" data-stance="YES">
                        <input type="radio" name="stance" value="YES">
                        <div class="stance-content">
                            <span class="stance-icon">✅</span>
                            <span class="stance-label">AGREE</span>
                            <span class="stance-desc">I support this motion</span>
                        </div>
                    </label>
                    <label class="stance-option" data-stance="NO">
                        <input type="radio" name="stance" value="NO">
                        <div class="stance-content">
                            <span class="stance-icon">❌</span>
                            <span class="stance-label">DISAGREE</span>
                            <span class="stance-desc">I oppose this motion</span>
                        </div>
                    </label>
                </div>
                <div class="debate-info">
                    <p><i class="fas fa-gavel"></i> For Mastery level, you'll be paired with another student for a formal debate.</p>
                    <p>Your instructor will review your stance and pair you with an opponent.</p>
                    <p><strong>Note:</strong> Choose your stance carefully. You'll need to defend it in a debate.</p>
                </div>
            </div>
        `;
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    attachEventListeners(question) {
        // Submit button
        const submitBtn = document.getElementById('submitAnswerBtn');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.handleSubmit(question));
        }
        
        // Report button
        const reportBtn = this.container.querySelector('.question-report-btn');
        if (reportBtn) {
            reportBtn.addEventListener('click', () => this.handleReport(question));
        }
        
        // Skip button (debate only)
        const skipBtn = document.getElementById('skipQuestionBtn');
        if (skipBtn) {
            skipBtn.addEventListener('click', () => this.handleSkip(question));
        }
        
        // MCQ option click (auto-submit)
        const mcqOptions = this.container.querySelectorAll('.mcq-option');
        mcqOptions.forEach(option => {
            option.addEventListener('click', () => {
                const radio = option.querySelector('input[type="radio"]');
                if (radio) {
                    radio.checked = true;
                    // Auto-submit for MCQ
                    setTimeout(() => this.handleSubmit(question), 300);
                }
            });
        });
        
        // File upload listeners
        if (question.type === 'file') {
            this.attachFileListeners();
        }
        
        // Typed answer word count
        const typedInput = document.getElementById('typedAnswer');
        if (typedInput) {
            typedInput.addEventListener('input', () => {
                const wordCount = document.getElementById('wordCount');
                if (wordCount) {
                    wordCount.textContent = typedInput.value.length;
                }
            });
        }
    }

    // ============================================
    // FILE LISTENERS
    // ============================================
    attachFileListeners() {
        const dropZone = document.getElementById('fileDropZone');
        const fileInput = document.getElementById('fileInput');
        const submitBtn = document.getElementById('submitAnswerBtn');
        
        if (dropZone) {
            // Click to browse
            dropZone.addEventListener('click', () => fileInput?.click());
            
            // Drag and drop
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });
            
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dragover');
            });
            
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length) {
                    this.handleFileSelect(files[0]);
                }
            });
        }
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length) {
                    this.handleFileSelect(e.target.files[0]);
                }
            });
        }
    }

    // ============================================
    // FILE SELECT HANDLER
    // ============================================
    handleFileSelect(file) {
        const maxSize = 50 * 1024 * 1024; // 50MB
        
        // Validate file size
        if (file.size > maxSize) {
            showToast('File too large. Maximum size is 50MB.', 'error');
            return;
        }
        
        // Validate file type
        const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'video/mp4', 'application/zip'];
        if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|doc|docx|jpg|png|mp4|zip)$/i)) {
            showToast('File type not supported. Please upload a valid file.', 'error');
            return;
        }
        
        this.selectedFile = file;
        
        const fileNameSpan = document.getElementById('selectedFileName');
        if (fileNameSpan) {
            const fileSize = (file.size / 1024 / 1024).toFixed(2);
            fileNameSpan.innerHTML = `
                <i class="fas fa-file"></i>
                <span>${file.name}</span>
                <span class="file-size">(${fileSize} MB)</span>
                <button class="file-remove-btn" onclick="this.closest('.selected-file').style.display='none'; document.getElementById('fileInput').value = ''; document.getElementById('submitAnswerBtn').disabled = true;">
                    <i class="fas fa-times"></i>
                </button>
            `;
            fileNameSpan.style.display = 'flex';
        }
        
        const submitBtn = document.getElementById('submitAnswerBtn');
        if (submitBtn) {
            submitBtn.disabled = false;
        }
        
        showToast(`✅ "${file.name}" selected`, 'success');
    }

    // ============================================
    // SUBMIT HANDLER
    // ============================================
    async handleSubmit(question) {
        if (this.isSubmitting) return;
        this.isSubmitting = true;
        
        let answer = null;
        let fileUrl = null;
        
        try {
            // Collect answer based on question type
            switch(question.type) {
                case 'mcq': {
                    const selected = this.container.querySelector('input[name="mcq_answer"]:checked');
                    if (!selected) {
                        showToast('Please select an answer', 'error');
                        this.isSubmitting = false;
                        return;
                    }
                    answer = selected.value;
                    break;
                }
                    
                case 'typed': {
                    const typedAnswer = this.container.querySelector('#typedAnswer');
                    if (!typedAnswer || typedAnswer.value.trim().length < 20) {
                        showToast('Please enter at least 20 characters', 'error');
                        this.isSubmitting = false;
                        return;
                    }
                    answer = typedAnswer.value.trim();
                    break;
                }
                    
                case 'file': {
                    if (!this.selectedFile) {
                        showToast('Please select a file to upload', 'error');
                        this.isSubmitting = false;
                        return;
                    }
                    fileUrl = await this.uploadFile(this.selectedFile);
                    if (!fileUrl) {
                        this.isSubmitting = false;
                        return;
                    }
                    answer = this.selectedFile.name;
                    break;
                }
                    
                case 'debate': {
                    const stance = this.container.querySelector('input[name="stance"]:checked');
                    if (!stance) {
                        showToast('Please select your stance (AGREE or DISAGREE)', 'error');
                        this.isSubmitting = false;
                        return;
                    }
                    answer = stance.value;
                    // Request debate match
                    await requestDebateMatch(question.id, this.studentId);
                    break;
                }
            }
            
            // Show loading state
            const submitBtn = document.getElementById('submitAnswerBtn');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            submitBtn.disabled = true;
            
            // Submit answer
            const result = await submitAnswer(this.studentId, question.id, answer, fileUrl);
            
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            this.isSubmitting = false;
            
            if (result && result.success) {
                // Show explanation if available
                if (question.explanation) {
                    const explanationDiv = document.getElementById('questionExplanation');
                    const explanationText = document.getElementById('explanationText');
                    if (explanationDiv && explanationText) {
                        explanationText.textContent = question.explanation;
                        explanationDiv.style.display = 'block';
                    }
                }
                
                // Auto-submit for MCQ (already handled)
                if (question.type === 'mcq') {
                    // MCQ is already submitted
                }
                
                if (this.onAnswerComplete) {
                    this.onAnswerComplete(result);
                }
            }
            
        } catch (error) {
            console.error('Submit error:', error);
            showToast('Error submitting answer. Please try again.', 'error');
            this.isSubmitting = false;
        }
    }

    // ============================================
    // REPORT HANDLER
    // ============================================
    async handleReport(question) {
        // Show report modal or prompt
        const reason = prompt('Why are you reporting this question?\n\nOptions: Inappropriate content, Incorrect answer, Confusing question, Technical issue, Other');
        
        if (!reason || reason.trim() === '') return;
        
        const details = prompt('Please provide more details (optional):');
        
        const result = await reportQuestion(question.id, this.studentId, reason.trim(), details || '');
        
        if (result) {
            showToast('Thank you for your report. Our team will review it.', 'success');
        }
    }

    // ============================================
    // SKIP HANDLER (Debate)
    // ============================================
    async handleSkip(question) {
        const confirmSkip = confirm('This will skip the debate question. You can come back to it later.\n\nDo you want to skip?');
        
        if (confirmSkip) {
            showToast('Question skipped. Moving to the next question.', 'info');
            if (this.onAnswerComplete) {
                this.onAnswerComplete({ success: true, skipped: true });
            }
        }
    }

    // ============================================
    // FILE UPLOAD TO SUPABASE
    // ============================================
    async uploadFile(file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${this.studentId}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
        
        try {
            const { data, error } = await supabase.storage
                .from('submissions')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false
                });
            
            if (error) {
                console.error('Storage upload error:', error);
                showToast('Failed to upload file. Please try again.', 'error');
                return null;
            }
            
            const { data: urlData } = supabase.storage
                .from('submissions')
                .getPublicUrl(fileName);
            
            return urlData.publicUrl;
            
        } catch (error) {
            console.error('Upload error:', error);
            showToast('Failed to upload file. Please try again.', 'error');
            return null;
        }
    }

    // ============================================
    // UTILITY: ESCAPE HTML
    // ============================================
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ============================================
// PROGRESS BAR RENDERER
// ============================================

export function renderProgressBar(score, badge, nextBadge, progressToNext) {
    const badgeColors = {
        starter: '#10b981',
        diploma: '#3b82f6',
        advanced: '#8b5cf6',
        mastery: '#f59e0b',
        ambassador: '#ef4444'
    };
    
    const badgeColor = badgeColors[badge.name.toLowerCase()] || '#fbb040';
    
    // If score is 99.99% and badge is mastery, show special message
    const isMasteryCapped = score >= 99.99 && badge.name === 'Mastery';
    const displayScore = isMasteryCapped ? '99.99' : score;
    
    return `
        <div class="progress-header">
            <div class="current-badge">
                <div class="badge-icon" style="background: ${badgeColor}20; border-color: ${badgeColor}">
                    <span>${badge.icon}</span>
                </div>
                <div class="badge-info">
                    <h4>${badge.name} ${isMasteryCapped ? '🔒' : ''}</h4>
                    <p>${badge.description}</p>
                    ${isMasteryCapped ? '<p class="badge-hint">Submit an MVP proposal to reach Ambassador status!</p>' : ''}
                </div>
            </div>
            <div class="score-display">
                <span class="score-value">${displayScore}%</span>
                <span class="score-label">Overall Score</span>
            </div>
        </div>
        
        <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${Math.min(progressToNext, 100)}%; background: ${badgeColor}"></div>
        </div>
        
        ${nextBadge ? `
            <div class="next-badge-info">
                <span>Next: ${nextBadge.name} ${nextBadge.icon}</span>
                <span>${Math.round(Math.min(progressToNext, 100))}% to next level</span>
            </div>
        ` : `
            <div class="next-badge-info complete">
                <span>🏆 Ambassador Complete!</span>
                <span>You've reached the highest level!</span>
            </div>
        `}
    `;
}

// ============================================
// LEADERBOARD RENDERER
// ============================================

export function renderLeaderboard(leaderboardData) {
    if (!leaderboardData || leaderboardData.length === 0) {
        return '<div class="empty-state"><i class="fas fa-trophy"></i><p>No leaders yet. Be the first!</p></div>';
    }
    
    return `
        <div class="leaderboard-list">
            ${leaderboardData.map((entry, index) => {
                const isTop3 = index < 3;
                const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
                const avatarUrl = entry.users?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(entry.users?.name || 'User')}&background=fbb040&color=fff`;
                
                return `
                    <div class="leaderboard-item ${isTop3 ? 'top-' + (index + 1) : ''}">
                        <div class="leaderboard-rank">${rankEmoji}</div>
                        <div class="leaderboard-avatar">
                            <img src="${avatarUrl}" alt="${entry.users?.name || 'User'}">
                        </div>
                        <div class="leaderboard-info">
                            <div class="leaderboard-name">${entry.users?.name || 'Anonymous'}</div>
                            <div class="leaderboard-badge">${entry.current_badge || 'Starter'}</div>
                        </div>
                        <div class="leaderboard-score">${Math.round(entry.current_score || 0)}%</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ============================================
// PORTFOLIO RENDERER
// ============================================

export function renderPortfolioItem(item, isOwner = false) {
    const typeIcons = {
        answer: 'fa-comment',
        file_upload: 'fa-file-alt',
        debate: 'fa-gavel',
        mvp: 'fa-rocket',
        project: 'fa-project-diagram'
    };
    
    const icon = typeIcons[item.type] || 'fa-star';
    const statusColors = {
        pending: '#f59e0b',
        approved: '#10b981',
        rejected: '#ef4444'
    };
    const statusColor = statusColors[item.status] || '#64748b';
    
    return `
        <div class="portfolio-item" data-id="${item.id}">
            <div class="portfolio-item-header">
                <div class="portfolio-item-icon" style="background: ${statusColor}20; color: ${statusColor}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="portfolio-item-title">
                    <h4>${escapeHtml(item.title)}</h4>
                    <span class="portfolio-item-date">${new Date(item.created_at).toLocaleDateString()}</span>
                </div>
                <span class="portfolio-item-status" style="background: ${statusColor}20; color: ${statusColor}">
                    ${item.status || 'Complete'}
                </span>
            </div>
            <div class="portfolio-item-content">
                <p>${escapeHtml(item.description || 'No description provided')}</p>
                ${item.file_url ? `<a href="${item.file_url}" target="_blank" class="portfolio-file-link">View Submission <i class="fas fa-external-link-alt"></i></a>` : ''}
                ${item.grade ? `<div class="portfolio-item-grade">Grade: ${item.grade}%</div>` : ''}
            </div>
            ${isOwner ? `
                <div class="portfolio-item-actions">
                    <button class="btn-share-portfolio" data-id="${item.id}">
                        <i class="fas fa-share-alt"></i> Share
                    </button>
                    <button class="btn-toggle-visibility" data-id="${item.id}" data-public="${item.is_public}">
                        <i class="fas ${item.is_public ? 'fa-globe' : 'fa-lock'}"></i>
                        ${item.is_public ? 'Public' : 'Private'}
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// EXPORT
// ============================================

export default {
    QuestionRenderer,
    renderProgressBar,
    renderLeaderboard,
    renderPortfolioItem
};
