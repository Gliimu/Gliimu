// index.js - Homepage functionality

// ============================================
// HERO SLIDER
// ============================================
function initHeroSlider() {
  const slides = document.querySelectorAll('.hero-slide');
  const dots = document.querySelectorAll('.hero-slider-dots .dot');
  let currentSlide = 0;
  let intervalId = null;
  
  if (!slides.length) return;
  
  function showSlide(index) {
    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === index);
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
    currentSlide = index;
  }
  
  function nextSlide() {
    let next = (currentSlide + 1) % slides.length;
    showSlide(next);
  }
  
  function startAutoSlide() {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(nextSlide, 5000);
  }
  
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      showSlide(i);
      startAutoSlide();
    });
  });
  
  showSlide(0);
  startAutoSlide();
}

// ============================================
// COUNTER ANIMATION
// ============================================
function initCounters() {
  const counters = document.querySelectorAll('.counter');
  const duration = 2500;
  let hasAnimated = false;
  
  function animateCounter(counter) {
    const target = parseInt(counter.getAttribute('data-target'), 10);
    const suffix = counter.textContent.includes('%') ? '%' : '+';
    let startTime = null;
    
    function update(currentTime) {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const value = Math.floor(progress * target);
      counter.textContent = value + suffix;
      
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }
    
    requestAnimationFrame(update);
  }
  
  function checkVisibility() {
    if (hasAnimated) return;
    
    const statsSection = document.querySelector('.stats-premium');
    if (!statsSection) return;
    
    const rect = statsSection.getBoundingClientRect();
    if (rect.top < window.innerHeight - 100) {
      hasAnimated = true;
      counters.forEach(counter => animateCounter(counter));
      window.removeEventListener('scroll', checkVisibility);
    }
  }
  
  window.addEventListener('scroll', checkVisibility);
  checkVisibility();
}

// ============================================
// STUDENT WORK GALLERY
// ============================================
const studentWorks = [
  { id: 1, title: "Short Film: The Journey", author: "John Doe", category: "video", image: "https://placehold.co/400x225/2c2f78/white?text=Short+Film" },
  { id: 2, title: "Brand Identity: AfroTech", author: "Jane Smith", category: "design", image: "https://placehold.co/400x225/8b5cf6/white?text=Brand+Identity" },
  { id: 3, title: "E-Commerce Website", author: "Mike Johnson", category: "code", image: "https://placehold.co/400x225/10b981/white?text=Website" },
  { id: 4, title: "Documentary Trailer", author: "Sarah Adams", category: "video", image: "https://placehold.co/400x225/ef4444/white?text=Documentary" },
  { id: 5, title: "Mobile App UI", author: "David Lee", category: "design", image: "https://placehold.co/400x225/f59e0b/white?text=App+UI" },
  { id: 6, title: "Portfolio Website", author: "Emily Chen", category: "code", image: "https://placehold.co/400x225/06b6d4/white?text=Portfolio" },
];

function initStudentGallery() {
  const grid = document.getElementById('studentWorkGrid');
  if (!grid) return;
  
  function renderGallery(filter = 'all') {
    const filtered = filter === 'all' ? studentWorks : studentWorks.filter(w => w.category === filter);
    
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="gallery-loading">No work found in this category.</div>';
      return;
    }
    
    grid.innerHTML = filtered.map(work => `
      <div class="gallery-item" data-category="${work.category}">
        <img src="${work.image}" alt="${work.title}" class="gallery-item-image">
        <div class="gallery-item-info">
          <div class="gallery-item-title">${work.title}</div>
          <div class="gallery-item-author">by ${work.author}</div>
        </div>
      </div>
    `).join('');
  }
  
  renderGallery();
  
  const filterBtns = document.querySelectorAll('.gallery-filters .filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGallery(btn.getAttribute('data-filter'));
    });
  });
}

// ============================================
// SCROLL REVEAL ANIMATION
// ============================================
function initScrollReveal() {
  const elements = document.querySelectorAll('.calculator-card, .squad-grid, .course-card-container, .payment-card, .testimonial-card, .service-card');
  
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
// EARNINGS CALCULATOR INTERACTIVITY
// ============================================
function initEarningsCalculator() {
  const calculatorCards = document.querySelectorAll('.calculator-card');
  if (!calculatorCards.length) return;
  
  calculatorCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      const progressBar = card.querySelector('.progress');
      if (progressBar) {
        const width = progressBar.style.width;
        progressBar.style.width = '100%';
        setTimeout(() => {
          progressBar.style.width = width;
        }, 300);
      }
    });
  });
}

// ============================================
// SMOOTH SCROLL
// ============================================
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ============================================
// INITIALIZE ALL
// ============================================
function initHomepage() {
  console.log('Homepage initializing...');
  initHeroSlider();
  initCounters();
  initStudentGallery();
  initScrollReveal();
  initEarningsCalculator();
  initSmoothScroll();
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', initHomepage);
