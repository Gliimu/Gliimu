// ============================================
// QUESTIONS MODULE
// Question rendering, answer submission, and UI components
// ============================================

import { supabase } from './supabase.js';
import { showToast } from './toast.js';
import { submitAnswer, reportQuestion, requestDebateMatch } from './progression.js';

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
    }

    // Render question based on type
    async renderQuestion(question) {
        if (!this.container) return;
        
        this.currentQuestion = question;
        
        const badgeColors = {
            starter: '#10b981',
            diploma: '#3b82f6',
            advanced: '#8b5cf6',
            mastery: '#f59e0b',
            ambassador: '#ef4444'
        };
        
        const badgeColor = badgeColors[question.badge_level] || '#fbb040';
        
        this.container.innerHTML = `
            <div class="question-card" data-question-id="${question.id}">
                <div class="question-header">
                    <div class="question-badge" style="background: ${badgeColor}20; color: ${badgeColor}; border-color: ${badgeColor}">
                        ${question.badge_level.toUpperCase()} LEVEL
                    </div>
                    <button class="question-report-btn" data-question-id="${question.id}" title="Report this question">
                        <i class="fas fa-flag"></i>
                    </button>
                </div>
                
                <div class="question-text">
                    <p>${this.escapeHtml(question.text)}</p>
                </div>
                
                <div class="question-answer-area">
                    ${this.renderAnswerArea(question)}
                </div>
                
                <div class="question-actions">
                    <button class="btn-submit-answer" id="submitAnswerBtn" ${question.type === 'file' ? 'disabled' : ''}>
                        <i class="fas fa-paper-plane"></i> Submit Answer
                    </button>
                </div>
            </div>
        `;
        
        this.attachEventListeners(question);
    }
    
    // Render answer area based on question type
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
    
    // Multiple Choice Question
    renderMCQArea(question) {
        const options = question.options || {};
        
        return `
            <div class="mcq-options">
                ${Object.entries(options).map(([key, value]) => `
                    <label class="mcq-option">
                        <input type="radio" name="mcq_answer" value="${key}">
                        <span class="mcq-option-letter">${key}</span>
                        <span class="mcq-option-text">${this.escapeHtml(value)}</span>
                    </label>
                `).join('')}
            </div>
        `;
    }
    
    // Typed Answer Question
    renderTypedArea(question) {
        return `
            <div class="typed-area">
                <textarea class="typed-input" id="typedAnswer" rows="6" placeholder="Type your answer here..."></textarea>
                <div class="answer-format-hint">
                    <i class="fas fa-info-circle"></i>
                    <span>Be specific and provide examples where appropriate.</span>
                </div>
            </div>
        `;
    }
    
    // File Upload Question
    renderFileArea(question) {
        return `
            <div class="file-area">
                <div class="file-drop-zone" id="fileDropZone">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p>Drag & drop your file here or click to browse</p>
                    <input type="file" id="fileInput" accept=".pdf,.doc,.docx,.jpg,.png,.mp4,.zip" style="display: none;">
                    <div id="selectedFileName" class="selected-file"></div>
                </div>
                <div class="file-requirements">
                    <i class="fas fa-info-circle"></i>
                    <span>Accepted formats: PDF, DOC, JPG, PNG, MP4, ZIP (Max 50MB)</span>
                </div>
            </div>
        `;
    }
    
    // Debate Question
    renderDebateArea(question) {
        return `
            <div class="debate-area">
                <div class="debate-motion">
                    <strong>Motion:</strong> ${this.escapeHtml(question.text)}
                </div>
                <div class="debate-stance">
                    <label class="stance-option">
                        <input type="radio" name="stance" value="YES">
                        <span>✅ YES - I agree with this motion</span>
                    </label>
                    <label class="stance-option">
                        <input type="radio" name="stance" value="NO">
                        <span>❌ NO - I disagree with this motion</span>
                    </label>
                </div>
                <div class="debate-info">
                    <p><i class="fas fa-gavel"></i> For Mastery level, you'll be paired with another student for a formal debate.</p>
                    <p>Your instructor will review your stance and pair you with an opponent.</p>
                </div>
            </div>
        `;
    }
    
    // Attach event listeners
    attachEventListeners(question) {
        const submitBtn = document.getElementById('submitAnswerBtn');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.handleSubmit(question));
        }
        
        const reportBtn = this.container.querySelector('.question-report-btn');
        if (reportBtn) {
            reportBtn.addEventListener('click', () => this.handleReport(question));
        }
        
        if (question.type === 'file') {
            this.attachFileListeners();
        }
    }
    
    // File upload listeners
    attachFileListeners() {
        const dropZone = document.getElementById('fileDropZone');
        const fileInput = document.getElementById('fileInput');
        const submitBtn = document.getElementById('submitAnswerBtn');
        
        if (dropZone) {
            dropZone.addEventListener('click', () => fileInput?.click());
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
                const file = e.dataTransfer.files[0];
                this.handleFileSelect(file);
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
    
    // Handle file selection
    handleFileSelect(file) {
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxSize) {
            showToast('File too large. Maximum size is 50MB.', 'error');
            return;
        }
        
        this.selectedFile = file;
        const fileNameSpan = document.getElementById('selectedFileName');
        if (fileNameSpan) {
            fileNameSpan.textContent = `📎 Selected: ${file.name}`;
            fileNameSpan.style.display = 'block';
        }
        
        const submitBtn = document.getElementById('submitAnswerBtn');
        if (submitBtn) {
            submitBtn.disabled = false;
        }
        
        showToast(`File "${file.name}" selected`, 'success');
    }
    
    // Handle answer submission
    async handleSubmit(question) {
        let answer = null;
        let fileUrl = null;
        
        switch(question.type) {
            case 'mcq':
                const selected = this.container.querySelector('input[name="mcq_answer"]:checked');
                if (!selected) {
                    showToast('Please select an answer', 'error');
                    return;
                }
                answer = selected.value;
                break;
                
            case 'typed':
                const typedAnswer = this.container.querySelector('#typedAnswer');
                if (!typedAnswer.value.trim()) {
                    showToast('Please enter your answer', 'error');
                    return;
                }
                answer = typedAnswer.value.trim();
                break;
                
            case 'file':
                if (!this.selectedFile) {
                    showToast('Please select a file to upload', 'error');
                    return;
                }
                // Upload file to Supabase storage
                fileUrl = await this.uploadFile(this.selectedFile);
                if (!fileUrl) return;
                answer = this.selectedFile.name;
                break;
                
            case 'debate':
                const stance = this.container.querySelector('input[name="stance"]:checked');
                if (!stance) {
                    showToast('Please select your stance (YES/NO)', 'error');
                    return;
                }
                answer = stance.value;
                // Request debate match
                await requestDebateMatch(question.id, this.studentId);
                break;
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
        
        if (result.success) {
            if (this.onAnswerComplete) {
                this.onAnswerComplete(result);
            }
        }
    }
    
    // Handle question report
    async handleReport(question) {
        const reason = prompt('Why are you reporting this question? (e.g., confusing, incorrect answer, inappropriate content)');
        if (!reason) return;
        
        const details = prompt('Please provide more details (optional):');
        
        const result = await reportQuestion(question.id, this.studentId, reason, details || '');
        
        if (result) {
            showToast('Thank you for your report. Our team will review it.', 'success');
        }
    }
    
    // Upload file to Supabase
    async uploadFile(file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${this.studentId}/${Date.now()}.${fileExt}`;
        
        try {
            const { data, error } = await supabase.storage
                .from('submissions')
                .upload(fileName, file);
            
            if (error) throw error;
            
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
    
    // Escape HTML
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
    
    return `
        <div class="progress-header">
            <div class="current-badge">
                <div class="badge-icon" style="background: ${badgeColor}20; border-color: ${badgeColor}">
                    <span>${badge.icon}</span>
                </div>
                <div class="badge-info">
                    <h4>${badge.name}</h4>
                    <p>${badge.description}</p>
                </div>
            </div>
            <div class="score-display">
                <span class="score-value">${score}%</span>
                <span class="score-label">Overall Score</span>
            </div>
        </div>
        
        <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${progressToNext}%; background: ${badgeColor}"></div>
        </div>
        
        ${nextBadge ? `
            <div class="next-badge-info">
                <span>Next: ${nextBadge.name} ${nextBadge.icon}</span>
                <span>${Math.round(progressToNext)}% to next level</span>
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
            ${leaderboardData.map((entry, index) => `
                <div class="leaderboard-item ${index < 3 ? 'top-' + (index + 1) : ''}">
                    <div class="leaderboard-rank">#${index + 1}</div>
                    <div class="leaderboard-avatar">
                        <img src="${entry.users?.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(entry.users?.name || 'User')}" alt="">
                    </div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${entry.users?.name || 'Anonymous'}</div>
                        <div class="leaderboard-badge">${entry.current_badge}</div>
                    </div>
                    <div class="leaderboard-score">${Math.round(entry.current_score)}%</div>
                </div>
            `).join('')}
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
        mvp: 'fa-rocket'
    };
    
    const icon = typeIcons[item.type] || 'fa-star';
    
    return `
        <div class="portfolio-item" data-id="${item.id}">
            <div class="portfolio-item-header">
                <div class="portfolio-item-icon">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="portfolio-item-title">
                    <h4>${escapeHtml(item.title)}</h4>
                    <span class="portfolio-item-date">${new Date(item.created_at).toLocaleDateString()}</span>
                </div>
                ${item.grade ? `<div class="portfolio-item-grade">Grade: ${item.grade}%</div>` : ''}
            </div>
            <div class="portfolio-item-content">
                <p>${escapeHtml(item.description || 'No description provided')}</p>
                ${item.file_url ? `<a href="${item.file_url}" target="_blank" class="portfolio-file-link">View Submission <i class="fas fa-external-link-alt"></i></a>` : ''}
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

// Helper function for escapeHtml in this context
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
