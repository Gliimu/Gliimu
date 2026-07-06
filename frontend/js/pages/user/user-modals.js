// ============================================
// USER MODALS - Modal Management
// Path: /frontend/js/pages/user/user-modals.js
// Purpose: Create and manage all modals
// ============================================

import { showToast } from '../../modules/toast.js';

// ============================================
// MODAL CLASS
// ============================================
export class ModalManager {
    constructor() {
        this.activeModals = [];
        this.modalId = 0;
    }

    // ============================================
    // CREATE MODAL
    // ============================================
    createModal(options) {
        var id = 'modal_' + (++this.modalId);
        var modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal active';
        
        var maxWidth = options.maxWidth || '500px';
        var title = options.title || 'Modal';
        var body = options.body || '';
        var buttons = options.buttons || '';
        var footer = options.footer || '';
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: ${maxWidth};">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" id="${id}_close">&times;</button>
                </div>
                <div class="modal-body">
                    ${body}
                    ${buttons ? `<div class="modal-buttons" style="margin-top: 16px; display: flex; gap: 10px; justify-content: flex-end;">${buttons}</div>` : ''}
                    ${footer ? `<div class="modal-footer" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">${footer}</div>` : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close handlers
        var closeBtn = document.getElementById(id + '_close');
        if (closeBtn) {
            closeBtn.onclick = function() {
                this.closeModal(id);
            }.bind(this);
        }
        
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                this.closeModal(id);
            }
        }.bind(this));
        
        this.activeModals.push(id);
        
        // Store close function
        modal._closeModal = function() {
            this.closeModal(id);
        }.bind(this);
        
        return {
            id: id,
            element: modal,
            close: function() {
                this.closeModal(id);
            }.bind(this),
            updateBody: function(newBody) {
                var bodyEl = modal.querySelector('.modal-body');
                if (bodyEl) {
                    bodyEl.innerHTML = newBody;
                }
            }.bind(this),
            updateTitle: function(newTitle) {
                var titleEl = modal.querySelector('.modal-header h2');
                if (titleEl) {
                    titleEl.innerHTML = newTitle;
                }
            }.bind(this)
        };
    }

    // ============================================
    // CLOSE MODAL
    // ============================================
    closeModal(id) {
        var modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            
            // Remove after animation
            setTimeout(function() {
                if (modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }, 300);
        }
        
        var index = this.activeModals.indexOf(id);
        if (index > -1) {
            this.activeModals.splice(index, 1);
        }
    }

    // ============================================
    // CLOSE ALL MODALS
    // ============================================
    closeAllModals() {
        var modals = document.querySelectorAll('.modal.active');
        modals.forEach(function(modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        });
        this.activeModals = [];
    }

    // ============================================
    // SHOW ALERT MODAL
    // ============================================
    showAlert(title, message, type) {
        var icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '📌';
        var color = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6';
        
        var modal = this.createModal({
            title: icon + ' ' + title,
            maxWidth: '400px',
            body: `
                <p style="text-align: center; color: var(--text-secondary); padding: 12px 0;">${message}</p>
            `,
            buttons: `
                <button class="btn-primary" onclick="this.closest('.modal')._closeModal()">OK</button>
            `
        });
    }

    // ============================================
    // SHOW CONFIRM MODAL
    // ============================================
    showConfirm(title, message, onConfirm, onCancel) {
        var modal = this.createModal({
            title: title,
            maxWidth: '450px',
            body: `
                <p style="color: var(--text-secondary); padding: 12px 0;">${message}</p>
            `,
            buttons: `
                <button class="btn-outline" id="confirm_cancel">Cancel</button>
                <button class="btn-primary" id="confirm_ok">Confirm</button>
            `
        });
        
        var close = modal.close.bind(this);
        
        document.getElementById('confirm_cancel').onclick = function() {
            close();
            if (onCancel) onCancel();
        };
        
        document.getElementById('confirm_ok').onclick = function() {
            close();
            if (onConfirm) onConfirm();
        };
        
        return modal;
    }

    // ============================================
    // SHOW ACCESS MODAL
    // ============================================
    showAccessModal(onApply) {
        var modal = this.createModal({
            title: '<i class="fas fa-lock" style="color: var(--brand-gold);"></i> Access Restricted',
            maxWidth: '450px',
            body: `
                <div style="text-align: center;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">
                        <i class="fas fa-graduation-cap" style="color: var(--brand-gold);"></i>
                    </div>
                    <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem;">Only Students and Instructors Can Access</h3>
                    <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 1rem;">
                        Virtual Rooms and Courses are exclusive to students and instructors. 
                        Apply to become a student to unlock these features and start learning from industry experts!
                    </p>
                </div>
            `,
            buttons: `
                <button class="btn-outline" id="access_cancel">Close</button>
                <button class="btn-primary" id="access_apply">
                    <i class="fas fa-paper-plane"></i> Apply Now
                </button>
            `
        });
        
        var close = modal.close.bind(this);
        
        document.getElementById('access_cancel').onclick = function() {
            close();
        };
        
        document.getElementById('access_apply').onclick = function() {
            close();
            if (onApply) onApply();
        };
        
        return modal;
    }

    // ============================================
    // SHOW DESTINATION MODAL (for admin approval)
    // ============================================
    showDestinationModal(onSelect) {
        var modal = this.createModal({
            title: '📌 Choose Destination',
            maxWidth: '400px',
            body: `
                <p style="margin-bottom: 16px; color: var(--text-secondary);">Where should this submission be displayed?</p>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button class="btn-primary dest-btn" data-dest="merchandise">🛍️ Merchandise</button>
                    <button class="btn-primary dest-btn" data-dest="hub">🏪 Hub</button>
                    <button class="btn-primary dest-btn" data-dest="library">📚 Library</button>
                </div>
            `
        });
        
        var close = modal.close.bind(this);
        
        modal.element.querySelectorAll('.dest-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var dest = this.dataset.dest;
                close();
                if (onSelect) onSelect(dest);
            });
        });
        
        return modal;
    }

    // ============================================
    // SHOW REPLY MODAL
    // ============================================
    showReplyModal(title, onSend) {
        var modal = this.createModal({
            title: '💬 ' + title,
            maxWidth: '500px',
            body: `
                <form id="replyForm" novalidate>
                    <div class="form-group">
                        <label>Your Response</label>
                        <textarea id="replyContent" rows="5" required placeholder="Type your response..."></textarea>
                    </div>
                </form>
            `,
            buttons: `
                <button class="btn-outline" id="reply_cancel">Cancel</button>
                <button class="btn-primary" id="reply_send">
                    <i class="fas fa-paper-plane"></i> Send Reply
                </button>
            `
        });
        
        var close = modal.close.bind(this);
        
        document.getElementById('reply_cancel').onclick = function() {
            close();
        };
        
        document.getElementById('reply_send').onclick = function() {
            var content = document.getElementById('replyContent').value.trim();
            if (!content) {
                showToast('Please enter a response', 'error');
                return;
            }
            close();
            if (onSend) onSend(content);
        };
        
        // Enter key support
        document.getElementById('replyContent').addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && e.ctrlKey) {
                document.getElementById('reply_send').click();
            }
        });
        
        return modal;
    }
}

// ============================================
// SINGLETON INSTANCE
// ============================================
var modalManager = new ModalManager();

// ============================================
// EXPORT
// ============================================
export { modalManager };
export default modalManager;
