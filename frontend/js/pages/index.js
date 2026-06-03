// index.js - Homepage specific functionality

// Hero Slider
function initHeroSlider() {
  const slides = Array.from(document.querySelectorAll('.hero-slide'));
  const dots = Array.from(document.querySelectorAll('.hero-dot'));
  const bgSlides = Array.from(document.querySelectorAll('.hero-bg'));
  const heroSection = document.getElementById('heroSection');
  const AUTO_DELAY = 7000;
  let current = 0;
  let timerId = null;
  
  if (slides.length === 0) return;
  
  function setActive(index) {
    slides[current].classList.remove('is-active');
    dots[current].classList.remove('is-active');
    if (dots[current]) dots[current].setAttribute('aria-selected', 'false');
    if (bgSlides[current]) bgSlides[current].classList.remove('is-active');
    
    current = index;
    
    slides[current].classList.add('is-active');
    dots[current].classList.add('is-active');
    if (dots[current]) dots[current].setAttribute('aria-selected', 'true');
    if (bgSlides[current]) bgSlides[current].classList.add('is-active');
  }
  
  function nextSlide() {
    setActive((current + 1) % slides.length);
  }
  
  function prevSlide() {
    setActive((current - 1 + slides.length) % slides.length);
  }
  
  function startAuto() {
    if (timerId) return;
    timerId = setInterval(nextSlide, AUTO_DELAY);
  }
  
  function stopAuto() {
    if (!timerId) return;
    clearInterval(timerId);
    timerId = null;
  }
  
  setActive(0);
  
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      setActive(i);
      stopAuto();
      startAuto();
    });
  });
  
  if (heroSection) {
    heroSection.addEventListener('mouseover', stopAuto);
    heroSection.addEventListener('mouseout', startAuto);
    startAuto();
    
    // Touch support for mobile
    let touchStartX = 0;
    let touchEndX = 0;
    
    heroSection.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].screenX;
      stopAuto();
    }, { passive: true });
    
    heroSection.addEventListener('touchend', e => {
      touchEndX = e.changedTouches[0].screenX;
      if (touchEndX < touchStartX - 50) nextSlide();
      if (touchEndX > touchStartX + 50) prevSlide();
      startAuto();
    }, { passive: true });
  }
}

// Stats Counter
function initStatsCounter() {
  const counters = document.querySelectorAll('.counter');
  const statsSection = document.querySelector('.stats-section');
  const duration = 4000;
  let hasRun = false;
  
  function runCounters() {
    counters.forEach((counter, index) => {
      const target = parseInt(counter.getAttribute('data-target'), 10);
      const startTime = performance.now();
      
      function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const value = Math.floor(progress * target);
        let suffix = '';
        if (index === 0 || index === 2) {
          suffix = '+';
        } else if (index === 1) {
          suffix = '%';
        }
        counter.textContent = value.toLocaleString() + suffix;
        if (progress < 1) {
          requestAnimationFrame(update);
        } else {
          counter.textContent = target.toLocaleString() + suffix;
        }
      }
      requestAnimationFrame(update);
    });
  }
  
  if ('IntersectionObserver' in window && statsSection) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !hasRun) {
          entry.target.classList.add('visible-on-scroll');
          setTimeout(() => {
            hasRun = true;
            runCounters();
          }, 300);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    
    document.querySelectorAll('.stat-card').forEach(card => {
      observer.observe(card);
    });
  } else {
    runCounters();
  }
}

// Testimonials Carousel
function initTestimonialsCarousel() {
  const track = document.getElementById('testimonialsTrack');
  const slides = document.querySelectorAll('.testimonial-slide');
  const dots = document.querySelectorAll('.testimonials-dot');
  const carousel = document.getElementById('testimonialsCarousel');
  
  if (!track || slides.length === 0) return;
  
  let current = 0;
  const total = slides.length;
  let timerId = null;
  const AUTO_DELAY = 6000;
  
  function setActive(index) {
    track.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === index);
    });
  }
  
  function nextSlide() {
    current = (current + 1) % total;
    setActive(current);
  }
  
  function startAuto() {
    if (timerId) return;
    timerId = setInterval(nextSlide, AUTO_DELAY);
  }
  
  function stopAuto() {
    if (!timerId) return;
    clearInterval(timerId);
    timerId = null;
  }
  
  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      current = index;
      setActive(current);
      stopAuto();
      startAuto();
    });
  });
  
  if (carousel) {
    carousel.addEventListener('mouseenter', stopAuto);
    carousel.addEventListener('mouseleave', startAuto);
    startAuto();
    
    // Touch support
    let touchStartX = 0;
    let touchEndX = 0;
    
    carousel.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].screenX;
      stopAuto();
    }, { passive: true });
    
    carousel.addEventListener('touchend', e => {
      touchEndX = e.changedTouches[0].screenX;
      if (touchEndX < touchStartX - 50) {
        current = (current + 1) % total;
        setActive(current);
      }
      if (touchEndX > touchStartX + 50) {
        current = (current - 1 + total) % total;
        setActive(current);
      }
      startAuto();
    }, { passive: true });
  }
}

// Partners Slider
function initPartnersSlider() {
  const track = document.getElementById('partnersTrack');
  if (!track) return;
  
  const partnerLogos = [
    'icons/logo.png', 'icons/trace.png', 'icons/logo2.png', 
    'icons/srch.png', 'icons/tracecw.png', 'icons/psalmsraise.jpeg',
    'https://upload.wikimedia.org/wikipedia/commons/6/6a/JavaScript-logo.png',
    'icons/ntf.jpg', 'icons/can.png', 'icons/ntf.png'
  ];
  
  let partnersHTML = '';
  const allPartnerSrcs = [...partnerLogos, ...partnerLogos];
  
  allPartnerSrcs.forEach(src => {
    partnersHTML += `<div class="partners-slide"><img src="${src}" alt="Partner Logo" class="partner-logo" loading="lazy" onerror="this.style.display='none'"></div>`;
  });
  
  track.innerHTML = partnersHTML;
}

// Leaderboard Drawer
function initLeaderboardDrawer() {
  const toggleBtn = document.getElementById('leaderboardToggle');
  const drawer = document.getElementById('leaderboardDrawer');
  const overlay = document.getElementById('drawerOverlay');
  const closeBtn = document.getElementById('drawerClose');
  const list = document.getElementById('leaderboardList');
  
  if (!toggleBtn || !drawer || !overlay) return;
  
  const students = [
    { id: 1, name: "Chidinma Okafor", course: "Diploma in Full-Stack Media", score: 98.5, img: "photos/stu.jpg", initials: "CO" },
    { id: 2, name: "Emeka Nwosu", course: "Diploma in Full-Stack Media", score: 95.2, img: "photos/stu1.jpg", initials: "EN" },
    { id: 3, name: "Aisha Mohammed", course: "Diploma in Full-Stack Media", score: 92.8, img: "photos/stu2.jpg", initials: "AM" },
    { id: 4, name: "Joseph Adeleke", course: "Diploma in Full-Stack Media", score: 89.4, img: "photos/stu3.jpg", initials: "JA" },
    { id: 5, name: "Grace Olufemi", course: "Diploma in Full-Stack Media", score: 87.1, img: "photos/stu4.jpg", initials: "GO" }
  ];
  
  if (list) {
    students.forEach((student, index) => {
      const item = document.createElement('a');
      item.className = 'leaderboard-item';
      if (index < 3) item.classList.add(`rank-${index + 1}`);
      item.href = `portfolio.html?id=${student.id}`;
      
      const thumbDiv = document.createElement('div');
      thumbDiv.className = 'leaderboard-thumb';
      thumbDiv.style.backgroundImage = `url('${student.img}')`;
      thumbDiv.textContent = student.initials;
      
      const tempImg = new Image();
      tempImg.src = student.img;
      tempImg.onerror = () => {
        thumbDiv.style.backgroundImage = 'none';
        thumbDiv.style.backgroundColor = 'var(--bg-input)';
        thumbDiv.style.color = 'var(--text-muted)';
      };
      
      item.innerHTML = `
        <span class="leaderboard-rank">${index + 1}</span>
        <div class="leaderboard-info">
          <div class="leaderboard-name">${student.name} <i class="fa-solid fa-arrow-up-right-from-square"></i></div>
          <span class="leaderboard-course">${student.course}</span>
        </div>
        <div class="leaderboard-score">${student.score}%</div>
      `;
      item.insertBefore(thumbDiv, item.querySelector('.leaderboard-info'));
      list.appendChild(item);
    });
  }
  
  function openDrawer() {
    drawer.classList.add('open');
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }
  
  function closeDrawer() {
    drawer.classList.remove('open');
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
  }
  
  toggleBtn.addEventListener('click', openDrawer);
  if (overlay) overlay.addEventListener('click', closeDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
}

// Referral Code Logic
function initReferralCode() {
  const STORAGE_KEY = 'gliimu_referral_code';
  const CODE_LENGTH = 6;
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const BASE_URL = 'https://gliimu.com/apply';
  
  const codeDisplay = document.getElementById('referralCodeDisplay');
  const linkInput = document.getElementById('referralLink');
  const copyBtn = document.getElementById('copyBtn');
  const regenBtn = document.getElementById('regenerateBtn');
  const shareWhatsapp = document.getElementById('shareWhatsapp');
  const shareFacebook = document.getElementById('shareFacebook');
  const shareEmail = document.getElementById('shareEmail');
  
  if (!codeDisplay) return;
  
  function generateCode() {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    }
    return code;
  }
  
  function getOrInitCode() {
    let saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.length === CODE_LENGTH) {
      return saved;
    }
    const newCode = generateCode();
    localStorage.setItem(STORAGE_KEY, newCode);
    return newCode;
  }
  
  function updateSocialLinks(code) {
    const fullUrl = `${BASE_URL}?ref=${code}`;
    const shareText = `Hey! I found this amazing media school in Abuja. If you join using my link, we both get a reward! Check it out: ${fullUrl}`;
    
    if (shareWhatsapp) shareWhatsapp.href = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    if (shareFacebook) shareFacebook.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullUrl)}&quote=${encodeURIComponent("Join me at Gliimu!")}`;
    if (shareEmail) shareEmail.href = `mailto:?subject=Join Gliimu&body=${encodeURIComponent(shareText)}`;
  }
  
  function renderReferral(code) {
    if (codeDisplay) codeDisplay.textContent = code;
    if (linkInput) linkInput.value = `${BASE_URL}?ref=${code}`;
    updateSocialLinks(code);
  }
  
  let currentCode = getOrInitCode();
  renderReferral(currentCode);
  
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      if (!linkInput) return;
      linkInput.select();
      linkInput.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(linkInput.value).then(() => {
        const orig = copyBtn.innerText;
        copyBtn.innerText = 'Copied!';
        setTimeout(() => { copyBtn.innerText = orig; }, 2000);
      }).catch(() => {
        document.execCommand('copy');
        const orig = copyBtn.innerText;
        copyBtn.innerText = 'Copied!';
        setTimeout(() => { copyBtn.innerText = orig; }, 2000);
      });
    });
  }
  
  if (regenBtn) {
    regenBtn.addEventListener('click', () => {
      if (regenBtn.classList.contains('spinning')) return;
      regenBtn.classList.add('spinning');
      setTimeout(() => {
        const newCode = generateCode();
        localStorage.setItem(STORAGE_KEY, newCode);
        renderReferral(newCode);
        regenBtn.classList.remove('spinning');
      }, 500);
    });
  }
  
  if (codeDisplay) {
    codeDisplay.addEventListener('click', () => {
      const range = document.createRange();
      range.selectNodeContents(codeDisplay);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }
}

// Scholarship Buttons Logic
function initScholarshipButtons() {
  const settings = JSON.parse(localStorage.getItem('gliimu_settings')) || {
    admissions: true,
    earlybird: true
  };
  
  // Remove workpay button code (keep only earlybird)
  const earlyBirdBtn = document.getElementById('btn-earlybird');
  const ebStatusBox = document.getElementById('earlybird-status-box');
  
  if (earlyBirdBtn) {
    if (settings.earlybird) {
      earlyBirdBtn.href = "application.html";
      earlyBirdBtn.textContent = "Currently Open";
      earlyBirdBtn.style.background = "var(--accent)";
      earlyBirdBtn.style.color = "#111";
      earlyBirdBtn.style.cursor = "pointer";
      earlyBirdBtn.onclick = null;
      if (ebStatusBox) ebStatusBox.style.display = 'none';
    } else {
      earlyBirdBtn.href = "#";
      earlyBirdBtn.textContent = "Not Eligible";
      earlyBirdBtn.style.background = "#ccc";
      earlyBirdBtn.style.color = "#666";
      earlyBirdBtn.style.cursor = "not-allowed";
      earlyBirdBtn.onclick = (e) => {
        e.preventDefault();
        alert("Early Bird Scholarships are currently closed. Please check back later.");
      };
      if (ebStatusBox) {
        ebStatusBox.style.display = 'block';
        ebStatusBox.style.background = 'rgba(239, 68, 68, 0.1)';
        ebStatusBox.style.color = '#ef4444';
      }
    }
  }
}


// Scroll to Top Button
function initScrollToTop() {
  const btn = document.getElementById('scrollToTopBtn');
  if (!btn) return;
  
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 300);
  });
  
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// Scroll Reveal Animation
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

// Hide Loader on Window Load
function initLoader() {
  window.addEventListener('load', () => {
    const loader = document.getElementById('loader-wrapper');
    if (loader) {
      loader.classList.add('hidden');
    }
  });
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('Homepage initializing...');
  
  initHeroSlider();
  initStatsCounter();
  initTestimonialsCarousel();
  initPartnersSlider();
  initLeaderboardDrawer();
  initReferralCode();
  initScholarshipButtons();
  initScrollToTop();
  initRevealAnimation();
  initLoader();
});