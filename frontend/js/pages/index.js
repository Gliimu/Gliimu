// ============================================
// GLIIMU HOMEPAGE - COMPLETE INTERACTIVITY
// Scroll animations, counters, video handling, gallery
// ============================================

// ============================================
// COUNTDOWN TIMER FOR URGENCY BANNER
// ============================================
function initCountdown() {
    // Set the next cohort date (14 days from now for demo)
    // In production, set a fixed date
    const nextCohortDate = new Date();
    nextCohortDate.setDate(nextCohortDate.getDate() + 14);
    
    function updateCountdown() {
        const now = new Date();
        const diff = nextCohortDate - now;
        
        if (diff <= 0) {
            document.getElementById('countdown').textContent = 'Today!';
            return;
        }
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        document.getElementById('countdown').textContent = `${days} days`;
    }
    
    updateCountdown();
    setInterval(updateCountdown, 86400000); // Update daily
}

// ============================================
// SCROLL REVEAL ANIMATIONS
// ============================================
function initScrollReveal() {
    const revealElements = document.querySelectorAll('.reveal, .fade-up');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible', 'active');
                
                // Stagger children if they exist
                const children = entry.target.querySelectorAll('.stagger-child');
                if (children.length) {
                    children.forEach((child, index) => {
                        setTimeout(() => {
                            child.classList.add('visible');
                        }, index * 100);
                    });
                }
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    
    revealElements.forEach(el => observer.observe(el));
    
    // Also observe gallery items specifically
    const galleryItems = document.querySelectorAll('.gallery-item');
    const galleryObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, { threshold: 0.1 });
    
    galleryItems.forEach(item => galleryObserver.observe(item));
}

// ============================================
// COUNTER ANIMATION FOR STATISTICS
// ============================================
function initCounters() {
    const counters = document.querySelectorAll('.counter');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target;
                const target = parseInt(counter.getAttribute('data-target'));
                let current = 0;
                const increment = target / 50;
                const updateCounter = () => {
                    current += increment;
                    if (current < target) {
                        counter.textContent = Math.floor(current) + (target >= 100 ? '+' : '');
                        requestAnimationFrame(updateCounter);
                    } else {
                        counter.textContent = target + (target >= 100 ? '+' : '');
                    }
                };
                updateCounter();
                observer.unobserve(counter);
            }
        });
    }, { threshold: 0.5 });
    
    counters.forEach(counter => observer.observe(counter));
}

// ============================================
// HERO SCROLL INDICATOR
// ============================================
function initHeroScroll() {
    const scrollIndicator = document.querySelector('.hero-scroll-indicator');
    if (scrollIndicator) {
        scrollIndicator.addEventListener('click', () => {
            const nextSection = document.querySelector('.urgency-banner') || document.querySelector('.earn-section');
            if (nextSection) {
                nextSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }
}

// ============================================
// VIDEO BACKGROUND HANDLING
// ============================================
function initVideoBackground() {
    const video = document.querySelector('.hero-background-video');
    if (video) {
        // Ensure video plays on mobile
        video.play().catch(e => console.log('Video autoplay prevented:', e));
        
        // Pause video when not in view to save resources
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    video.play().catch(e => console.log('Video play error:', e));
                } else {
                    video.pause();
                }
            });
        }, { threshold: 0.1 });
        
        observer.observe(video.parentElement);
    }
}

// ============================================
// LOAD STUDENT WORK GALLERY
// ============================================
async function loadStudentWorkGallery() {
    const galleryGrid = document.getElementById('studentWorkGrid');
    if (!galleryGrid) return;
    
    // Mock student work data - replace with actual data from your backend
    const studentWorks = [
        { id: 1, title: 'Nike Commercial', type: 'video', thumbnail: 'photos/portfolio1.jpg', student: 'Finiks Kshel' },
        { id: 2, title: 'Food App UI Design', type: 'design', thumbnail: 'photos/portfolio2.jpg', student: 'Edi Edidiong' },
        { id: 3, title: 'E-commerce Website', type: 'code', thumbnail: 'photos/portfolio3.jpg', student: 'Chinedu Okafor' },
        { id: 4, title: 'Title Sequence Animation', type: 'video', thumbnail: 'photos/portfolio4.jpg', student: 'Precious Adams' },
        { id: 5, title: 'Brand Identity Package', type: 'design', thumbnail: 'photos/ads.jpg', student: 'Sarah Johnson' },
        { id: 6, title: 'Mobile Game Development', type: 'code', thumbnail: 'photos/ads2.jpg', student: 'Michael Okonkwo' }
    ];
    
    galleryGrid.innerHTML = studentWorks.map(work => `
        <div class="gallery-item" data-type="${work.type}">
            <img src="${work.thumbnail}" alt="${work.title}" onerror="this.src='https://placehold.co/400x300/2c2f78/white?text=${encodeURIComponent(work.title)}'">
            <div class="gallery-overlay">
                <h4>${work.title}</h4>
                <p>by ${work.student}</p>
            </div>
        </div>
    `).join('');
    
    // Add click handlers
    document.querySelectorAll('.gallery-item').forEach(item => {
        item.addEventListener('click', () => {
            const title = item.querySelector('h4')?.textContent || 'Student Work';
            alert(`Opening: ${title}\n\nFull project details coming soon!`);
        });
    });
    
    // Filter functionality
    const filterBtns = document.querySelectorAll('.gallery-filters .filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-filter');
            
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const items = document.querySelectorAll('.gallery-item');
            items.forEach(item => {
                if (filter === 'all' || item.getAttribute('data-type') === filter) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    });
}

// ============================================
// LOAD PARTNERS SLIDER
// ============================================
function loadPartnersSlider() {
    const partnersTrack = document.getElementById('partnersTrack');
    if (!partnersTrack) return;
    
    // Mock partner logos - replace with actual partner data
    const partners = [
        { name: 'Partner 1', logo: 'https://placehold.co/100x50/2c2f78/white?text=Partner+1' },
        { name: 'Partner 2', logo: 'https://placehold.co/100x50/2c2f78/white?text=Partner+2' },
        { name: 'Partner 3', logo: 'https://placehold.co/100x50/2c2f78/white?text=Partner+3' },
        { name: 'Partner 4', logo: 'https://placehold.co/100x50/2c2f78/white?text=Partner+4' },
        { name: 'Partner 5', logo: 'https://placehold.co/100x50/2c2f78/white?text=Partner+5' },
        { name: 'Partner 6', logo: 'https://placehold.co/100x50/2c2f78/white?text=Partner+6' }
    ];
    
    // Duplicate partners for seamless scrolling
    const allPartners = [...partners, ...partners];
    
    partnersTrack.innerHTML = allPartners.map(partner => `
        <div class="partner-logo">
            <img src="${partner.logo}" alt="${partner.name}">
        </div>
    `).join('');
}

// ============================================
// HERO SLIDER (if needed for additional slides)
// ============================================
function initHeroSlider() {
    const slides = document.querySelectorAll('.hero-slide');
    const dots = document.querySelectorAll('.dot');
    if (!slides.length) return;
    
    let currentSlide = 0;
    const totalSlides = slides.length;
    
    function showSlide(index) {
        slides.forEach((slide, i) => {
            slide.classList.toggle('active', i === index);
        });
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
        });
    }
    
    function nextSlide() {
        currentSlide = (currentSlide + 1) % totalSlides;
        showSlide(currentSlide);
    }
    
    if (totalSlides > 1) {
        setInterval(nextSlide, 5000);
    }
    
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            currentSlide = index;
            showSlide(currentSlide);
        });
    });
}

// ============================================
// SMOOTH SCROLL FOR ANCHOR LINKS
// ============================================
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

// ============================================
// ADD STAGGER CLASSES TO CARDS
// ============================================
function addStaggerClasses() {
    const cardGroups = [
        '.course-feature-card',
        '.service-card',
        '.payment-card',
        '.testimonial-card'
    ];
    
    cardGroups.forEach(selector => {
        const cards = document.querySelectorAll(selector);
        cards.forEach((card, index) => {
            card.classList.add('stagger-child');
            if (index === 0) {
                card.classList.add('visible');
            }
        });
    });
}

// ============================================
// LAZY LOAD IMAGES
// ============================================
function initLazyLoading() {
    const images = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.getAttribute('data-src');
                img.removeAttribute('data-src');
                imageObserver.unobserve(img);
            }
        });
    });
    
    images.forEach(img => imageObserver.observe(img));
}

// ============================================
// INITIALIZE ALL
// ============================================
function init() {
    console.log('Initializing homepage...');
    
    initCountdown();
    initHeroScroll();
    initVideoBackground();
    loadStudentWorkGallery();
    loadPartnersSlider();
    initHeroSlider();
    initSmoothScroll();
    initCounters();
    initScrollReveal();
    addStaggerClasses();
    initLazyLoading();
    
    // Trigger initial scroll reveal for visible elements
    setTimeout(() => {
        window.dispatchEvent(new Event('scroll'));
    }, 500);
    
    console.log('Homepage initialized');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ============================================
// RESIZE HANDLER FOR RESPONSIVE ADJUSTMENTS
// ============================================
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        // Recalculate any dynamic layouts if needed
        console.log('Window resized');
    }, 250);
});
