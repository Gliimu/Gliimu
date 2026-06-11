// ============================================
// TOAST NOTIFICATION MODULE
// Displays temporary notifications to users
// ============================================

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - Type of toast: 'success', 'error', 'info', 'warning'
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
export function showToast(message, type = 'success', duration = 3000) {
  // Remove existing toast if any
  const existingToast = document.querySelector('.gliimu-toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `gliimu-toast toast-${type}`;
  
  // Set icon based on type
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'error') icon = 'fa-exclamation-circle';
  if (type === 'warning') icon = 'fa-exclamation-triangle';
  if (type === 'info') icon = 'fa-info-circle';
  
  toast.innerHTML = `
    <div class="toast-content">
      <i class="fas ${icon}"></i>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
  
  // Get color based on type
  let backgroundColor = '#3b82f6'; // info - blue
  if (type === 'success') backgroundColor = '#10b981'; // green
  if (type === 'error') backgroundColor = '#ef4444'; // red
  if (type === 'warning') backgroundColor = '#f59e0b'; // orange
  
  // Apply styles
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${backgroundColor};
    color: white;
    padding: 12px 24px;
    border-radius: 40px;
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    animation: slideUp 0.3s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.2);
  `;
  
  document.body.appendChild(toast);
  
  // Auto remove after duration
  setTimeout(() => {
    if (toast && toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        if (toast && toast.parentNode) {
          toast.remove();
        }
      }, 300);
    }
  }, duration);
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Add global styles for toast animations if not already present
if (!document.querySelector('#toast-styles')) {
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
    
    .gliimu-toast {
      pointer-events: none;
    }
    
    .toast-content {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .toast-content i {
      font-size: 16px;
    }
    
    .toast-content span {
      line-height: 1.4;
    }
  `;
  document.head.appendChild(style);
}

// Also add a convenience method for each toast type
export const showSuccess = (message, duration) => showToast(message, 'success', duration);
export const showError = (message, duration) => showToast(message, 'error', duration);
export const showInfo = (message, duration) => showToast(message, 'info', duration);
export const showWarning = (message, duration) => showToast(message, 'warning', duration);

// Default export
export default {
  showToast,
  showSuccess,
  showError,
  showInfo,
  showWarning
};
