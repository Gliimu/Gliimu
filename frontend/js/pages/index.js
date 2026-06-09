// ============================================
// GLIIMU HOMEPAGE - SIMPLIFIED VERSION
// No disappearing cards, reliable display
// ============================================

// ============================================
// COUNTDOWN TIMER
// ============================================
function initCountdown() {
    const countdownEl = document.getElementById('countdown');
    if (!countdownEl) return;
    
    const nextCohortDate = new Date();
    nextCohortDate.setDate(nextCohortDate.getDate() + 14);
    
    function updateCountdown() {
        const now = new Date();
        const diff = nextCohortDate - now;
        
        if (diff <= 0) {
            countdownEl.textContent = 'Today!';
            return;
        }
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        countdownEl.textContent = `${days} days`;
    }
    
    updateCountdown();
    setInterval(updateCountdown, 86400000);
}

// ============================================
// COUNTER ANIMATION
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
// VIDEO BACKGROUND
// ============================================
function initVideoBackground() {
    const video = document.querySelector('.hero-background-video');
    if (video) {
        video.play().catch(e => console.log('Video autoplay prevented:', e));
    }
}

// ============================================
// LOAD STUDENT WORK GALLERY
// ============================================
async function loadStudentWorkGallery() {
    const galleryGrid = document.getElementById('studentWorkGrid');
    if (!galleryGrid) return;
    
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
    
    const partners = [
        { name: 'Partner 1', logo: 'https://placehold.co/100x50/2c2f78/white?text=Partner+1' },
        { name: 'Partner 2', logo: 'https://placehold.co/100x50/2c2f78/white?text=Partner+2' },
        { name: 'Partner 3', logo: 'https://placehold.co/100x50/2c2f78/white?text=Partner+3' },
        { name: 'Partner 4', logo: 'https://placehold.co/100x50/2c2f78/white?text=Partner+4' },
        { name: 'Partner 5', logo: 'https://placehold.co/100x50/2c2f78/white?text=Partner+5' },
        { name: 'Partner 6', logo: 'https://placehold.co/100x50/2c2f78/white?text=Partner+6' }
    ];
    
    // Duplicate for seamless scrolling
    const allPartners = [...partners, ...partners];
    
    partnersTrack.innerHTML = allPartners.map(partner => `
        <div class="partner-logo">
            <img src="${partner.logo}" alt="${partner.name}">
        </div>
    `).join('');
}

// ============================================
// SMOOTH SCROLL
// ============================================
function initSmoothScroll() {
    const scrollIndicator = document.querySelector('.hero-scroll-indicator');
    if (scrollIndicator) {
        scrollIndicator.addEventListener('click', () => {
            const nextSection = document.querySelector('.earn-section');
            if (nextSection) {
                nextSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }
    
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
// INITIALIZE ALL
// ============================================
function init() {
    console.log('Initializing homepage...');
    
    initCountdown();
    initVideoBackground();
    loadStudentWorkGallery();
    loadPartnersSlider();
    initCounters();
    initSmoothScroll();
    
    console.log('Homepage initialized');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
