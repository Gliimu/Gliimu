// Toast Notification Module

// Show toast notification
export function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  
  // Create container if it doesn't exist
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
  
  toast.innerHTML = `
    <i class="fas ${icon}"></i>
    <span>${message}</span>
  `;
  
  // Add styles to toast
  toast.style.cssText = `
    background: var(--bg-glass, rgba(0,0,0,0.8));
    backdrop-filter: blur(12px);
    padding: 12px 20px;
    border-radius: 8px;
    border-left: 4px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#4f46e5'};
    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.9rem;
    animation: slideInRight 0.3s ease;
    color: white;
  `;
  
  container.appendChild(toast);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Shortcut methods
export const showSuccess = (msg) => showToast(msg, 'success');
export const showError = (msg) => showToast(msg, 'error');
export const showInfo = (msg) => showToast(msg, 'info');