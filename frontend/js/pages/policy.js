// policy.js - Policy & Terms page functionality

// ============================================
// TABLE OF CONTENTS HIGHLIGHTING
// ============================================

function initPolicyPage() {
  console.log('Policy page initializing...');
  
  setupTocHighlight();
  setupPrintButton();
  setupAcceptanceButtons();
}

function setupTocHighlight() {
  const sections = document.querySelectorAll('.policy-section');
  const navLinks = document.querySelectorAll('.toc-list a');
  
  if (sections.length === 0 || navLinks.length === 0) return;
  
  function updateActiveLink() {
    let current = '';
    const scrollPosition = window.scrollY + 150;
    
    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      const sectionBottom = sectionTop + section.offsetHeight;
      
      if (scrollPosition >= sectionTop && scrollPosition < sectionBottom) {
        current = section.getAttribute('id');
      }
    });
    
    navLinks.forEach(link => {
      link.classList.remove('active');
      const href = link.getAttribute('href');
      if (href === `#${current}`) {
        link.classList.add('active');
      }
    });
  }
  
  window.addEventListener('scroll', updateActiveLink);
  updateActiveLink();
  
  // Smooth scroll for anchor links
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href');
      const targetElement = document.querySelector(targetId);
      
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
}

// ============================================
// PRINT FUNCTIONALITY
// ============================================

function setupPrintButton() {
  const printBtn = document.getElementById('printPolicyBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }
}

// ============================================
// ACCEPTANCE BUTTONS
// ============================================

function setupAcceptanceButtons() {
  const acceptBtn = document.getElementById('acceptTermsBtn');
  const declineBtn = document.getElementById('declineTermsBtn');
  
  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      localStorage.setItem('gliimu_terms_accepted', 'true');
      localStorage.setItem('gliimu_terms_accepted_date', new Date().toISOString());
      showToast('Thank you for accepting the terms!', 'success');
      
      // Optional: Redirect back to previous page
      const returnUrl = localStorage.getItem('return_to') || 'index.html';
      setTimeout(() => {
        window.location.href = returnUrl;
      }, 1500);
    });
  }
  
  if (declineBtn) {
    declineBtn.addEventListener('click', () => {
      showToast('You must accept the terms to continue.', 'error');
    });
  }
}

// ============================================
// TOAST NOTIFICATION
// ============================================

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${message}`;
  
  toast.style.cssText = `
    position: fixed;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-card);
    color: var(--text-main);
    padding: 12px 24px;
    border-radius: 30px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.9rem;
    z-index: 1000;
    animation: fadeInUp 0.3s ease;
    box-shadow: var(--shadow-soft);
    border-left: 4px solid ${type === 'success' ? '#10b981' : '#ef4444'};
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// CHECK IF USER HAS ACCEPTED TERMS
// ============================================

function hasAcceptedTerms() {
  return localStorage.getItem('gliimu_terms_accepted') === 'true';
}

function requireTermsAcceptance(returnUrl = null) {
  if (!hasAcceptedTerms()) {
    if (returnUrl) {
      localStorage.setItem('return_to', returnUrl);
    }
    window.location.href = 'policy.html';
    return false;
  }
  return true;
}

// ============================================
// UPDATE LAST UPDATED DATE
// ============================================

function updateLastUpdatedDate() {
  const dateElement = document.getElementById('lastUpdatedDate');
  if (dateElement) {
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    dateElement.textContent = formattedDate;
  }
}

// ============================================
// EXPOSE GLOBALLY
// ============================================

window.initPolicyPage = initPolicyPage;
window.hasAcceptedTerms = hasAcceptedTerms;
window.requireTermsAcceptance = requireTermsAcceptance;
window.showToast = showToast;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  updateLastUpdatedDate();
  initPolicyPage();
});