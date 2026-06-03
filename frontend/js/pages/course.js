// course.js - Course page functionality

// ============================================
// CURRICULUM DATA
// ============================================

const curriculumData = [
  {
    phase: "Phase 1: Foundation (Month 1-2)",
    modules: [
      { name: "Introduction to Media Technologies", desc: "Overview of the media landscape and career paths" },
      { name: "Visual Storytelling Fundamentals", desc: "Understanding narrative structure and visual language" },
      { name: "Design Principles", desc: "Color theory, typography, layout, and composition" },
      { name: "Introduction to Programming", desc: "Basic coding concepts using JavaScript" }
    ]
  },
  {
    phase: "Phase 2: Core Skills (Month 3-6)",
    modules: [
      { name: "Video Production & Cinematography", desc: "Camera operation, lighting, and audio recording" },
      { name: "Post-Production & Editing", desc: "Adobe Premiere Pro, DaVinci Resolve, After Effects" },
      { name: "UI/UX Design", desc: "Figma, prototyping, user research, accessibility" },
      { name: "Web Development", desc: "HTML, CSS, JavaScript, responsive design" }
    ]
  },
  {
    phase: "Phase 3: Advanced (Month 7-10)",
    modules: [
      { name: "Advanced Video Effects", desc: "VFX, motion graphics, 3D animation" },
      { name: "Full-Stack Development", desc: "React, Node.js, databases, APIs" },
      { name: "Brand Strategy & Management", desc: "Brand identity, marketing, social media" },
      { name: "Portfolio Development", desc: "Building a professional portfolio" }
    ]
  },
  {
    phase: "Phase 4: Capstone (Month 11-12)",
    modules: [
      { name: "Industry Project", desc: "Real-world client project with mentorship" },
      { name: "Career Preparation", desc: "Resume building, interview skills, networking" },
      { name: "Final Portfolio Review", desc: "Presentation to industry panel" }
    ]
  }
];

// ============================================
// INITIALIZATION
// ============================================

function initCoursePage() {
  console.log('Course page initializing...');
  
  renderCurriculum();
  setupEventListeners();
  animateOnScroll();
}

function renderCurriculum() {
  const container = document.getElementById('curriculumContainer');
  if (!container) return;
  
  container.innerHTML = curriculumData.map(phase => `
    <div class="curriculum-phase">
      <h3 class="phase-title">${phase.phase}</h3>
      <div class="modules-grid">
        ${phase.modules.map(module => `
          <div class="module-item">
            <div class="module-icon"><i class="fas fa-book-open"></i></div>
            <div class="module-name">${module.name}</div>
            <div class="module-desc">${module.desc}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// ============================================
// TRACK SELECTION
// ============================================

function selectTrack(track) {
  let message = '';
  let redirectUrl = '';
  
  if (track === 'creative') {
    message = 'You selected the Creative Media Track!\n\nFocus areas: Video Production, Motion Graphics, UI/UX Design, Branding\n\nProceed to application?';
    redirectUrl = 'application.html?track=creative';
  } else if (track === 'tech') {
    message = 'You selected the Tech Track!\n\nFocus areas: Web Development, Programming, Databases, Cloud Computing\n\nProceed to application?';
    redirectUrl = 'application.html?track=tech';
  }
  
  if (confirm(message)) {
    window.location.href = redirectUrl;
  }
}

// ============================================
// PRICING SELECTION
// ============================================

function selectPlan(plan) {
  let message = '';
  
  if (plan === 'one-time') {
    message = 'One-Time Payment Plan\n\nTuition: ₦250,000 (10% discount applied)\nIncludes: Full diploma access, library pass, certificate\n\nProceed to payment?';
  } else if (plan === 'installment') {
    message = 'Installment Payment Plan\n\nFirst payment: ₦90,000\nSecond: ₦80,000\nThird: ₦80,000\n\nProceed to enrollment?';
  } else if (plan === 'scholarship') {
    message = 'Early Bird Scholarship\n\nTuition: ₦237,500 (5% discount)\nLimited slots available\n\nProceed to application?';
  }
  
  if (confirm(message)) {
    window.location.href = 'application.html';
  }
}

// ============================================
// ANIMATION ON SCROLL
// ============================================

function animateOnScroll() {
  const elements = document.querySelectorAll('.curriculum-phase, .track-card, .instructor-card, .pricing-card');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  
  elements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
  });
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  // Download brochure button
  const brochureBtn = document.getElementById('downloadBrochure');
  if (brochureBtn) {
    brochureBtn.addEventListener('click', () => {
      alert('Brochure download started. Check your downloads folder.');
      // In production, trigger actual PDF download
    });
  }
  
  // Apply now buttons
  const applyBtns = document.querySelectorAll('.apply-now');
  applyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.href = 'application.html';
    });
  });
}

// ============================================
// EXPOSE GLOBALLY
// ============================================

window.selectTrack = selectTrack;
window.selectPlan = selectPlan;
window.initCoursePage = initCoursePage;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initCoursePage);