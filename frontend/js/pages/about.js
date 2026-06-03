// about.js - Only page-specific functionality

// ============================================
// SCROLL REVEAL ANIMATION
// ============================================
function initRevealAnimation() {
  const reveals = document.querySelectorAll('.reveal');
  
  function revealOnScroll() {
    const windowHeight = window.innerHeight;
    reveals.forEach(el => {
      const elementTop = el.getBoundingClientRect().top;
      if (elementTop < windowHeight - 100) {
        el.classList.add('active');
      }
    });
  }
  
  window.addEventListener('scroll', revealOnScroll);
  revealOnScroll();
}

// Run when page is ready
document.addEventListener('DOMContentLoaded', () => {
  initRevealAnimation();
});