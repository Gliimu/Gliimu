// ============================================
// GLIIMU HOMEPAGE - COMPLETE INTERACTIVITY
// Carousels, Accordions, Counters, Filters
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
// COUNTER ANIMATION (Hero Stats)
// ============================================
function initCounters() {
    const counters = document.querySelectorAll('.counter');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target;
                const target = parseFloat(counter.getAttribute('data-target'));
                let current = 0;
                const increment = target / 50;
                
                const updateCounter = () => {
                    current += increment;
                    if (current < target) {
                        if (target === 99.99) {
                            counter.textContent = current.toFixed(1) + '%';
                        } else if (target === 200) {
                            counter.textContent = '₦' + Math.floor(current) + 'k';
                        } else {
                            counter.textContent = Math.floor(current) + '+';
                        }
                        requestAnimationFrame(updateCounter);
                    } else {
                        if (target === 99.99) {
                            counter.textContent = '99.99%';
                        } else if (target === 200) {
                            counter.textContent = '₦200k';
                        } else {
                            counter.textContent = target + '+';
                        }
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
// ACCORDION FUNCTIONALITY
// ============================================
function initAccordion() {
    const accordionItems = document.querySelectorAll('.accordion-item');
    
    accordionItems.forEach(item => {
        const header = item.querySelector('.accordion-header');
        
        header.addEventListener('click', () => {
            // Close all other items
            accordionItems.forEach(otherItem => {
                if (otherItem !== item && otherItem.classList.contains('active')) {
                    otherItem.classList.remove('active');
                }
            });
            
            // Toggle current item
            item.classList.toggle('active');
        });
    });
    
    // Open first item by default
    if (accordionItems.length > 0) {
        accordionItems[0].classList.add('active');
    }
}

// ============================================
// GALLERY CAROUSEL
// ============================================
let currentGalleryIndex = 0;
let galleryItems = [];
let galleryFilter = 'all';

function loadStudentWorkGallery() {
    const carouselTrack = document.getElementById('carouselTrack');
    const dotsContainer = document.getElementById('galleryDots');
    if (!carouselTrack) return;
    
    const studentWorks = [
        { id: 1, title: 'Nike Commercial', type: 'video', thumbnail: 'photos/portfolio1.jpg', student: 'Finiks Kshel' },
        { id: 2, title: 'Food App UI Design', type: 'design', thumbnail: 'photos/portfolio2.jpg', student: 'Edi Edidiong' },
        { id: 3, title: 'E-commerce Website', type: 'code', thumbnail: 'photos/portfolio3.jpg', student: 'Chinedu Okafor' },
        { id: 4, title: 'Title Sequence Animation', type: 'video', thumbnail: 'photos/portfolio4.jpg', student: 'Precious Adams' },
        { id: 5, title: 'Brand Identity Package', type: 'design', thumbnail: 'photos/ads.jpg', student: 'Sarah Johnson' },
        { id: 6, title: 'Mobile Game Development', type: 'code', thumbnail: 'photos/ads2.jpg', student: 'Michael Okonkwo' }
    ];
    
    galleryItems = studentWorks;
    
    function renderCarousel() {
        const filtered = galleryFilter === 'all' ? galleryItems : galleryItems.filter(item => item.type === galleryFilter);
        
        carouselTrack.innerHTML = filtered.map(work => `
            <div class="gallery-item" data-type="${work.type}">
                <img src="${work.thumbnail}" alt="${work.title}" onerror="this.src='https://placehold.co/400x300/2c2f78/white?text=${encodeURIComponent(work.title)}'">
                <div class="gallery-overlay">
                    <h4>${work.title}</h4>
                    <p>by ${work.student}</p>
                </div>
            </div>
        `).join('');
        
        // Reset carousel position
        currentGalleryIndex = 0;
        updateCarousel();
        updateDots();
        
        // Add click handlers to gallery items
        document.querySelectorAll('.gallery-item').forEach(item => {
            item.addEventListener('click', () => {
                const title = item.querySelector('h4')?.textContent || 'Student Work';
                alert(`Opening: ${title}\n\nFull project details coming soon!`);
            });
        });
    }
    
    function updateCarousel() {
        const track = document.querySelector('.carousel-track');
        const itemsPerView = getItemsPerView();
        const maxIndex = Math.ceil(galleryItems.filter(i => galleryFilter === 'all' ? true : i.type === galleryFilter).length / itemsPerView) - 1;
        
        if (currentGalleryIndex < 0) currentGalleryIndex = 0;
        if (currentGalleryIndex > maxIndex) currentGalleryIndex = maxIndex;
        
        const scrollAmount = currentGalleryIndex * 100;
        if (track) {
            track.style.transform = `translateX(-${scrollAmount}%)`;
        }
        updateDots();
    }
    
    function getItemsPerView() {
        if (window.innerWidth <= 768) return 1;
        if (window.innerWidth <= 1024) return 2;
        return 3;
    }
    
    function updateDots() {
        const filtered = galleryFilter === 'all' ? galleryItems : galleryItems.filter(item => item.type === galleryFilter);
        const itemsPerView = getItemsPerView();
        const totalDots = Math.ceil(filtered.length / itemsPerView);
        
        if (dotsContainer) {
            dotsContainer.innerHTML = '';
            for (let i = 0; i < totalDots; i++) {
                const dot = document.createElement('div');
                dot.classList.add('gallery-dot');
                if (i === currentGalleryIndex) dot.classList.add('active');
                dot.addEventListener('click', () => {
                    currentGalleryIndex = i;
                    updateCarousel();
                });
                dotsContainer.appendChild(dot);
            }
        }
    }
    
    // Next/Prev buttons
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            const filtered = galleryFilter === 'all' ? galleryItems : galleryItems.filter(item => item.type === galleryFilter);
            const itemsPerView = getItemsPerView();
            const maxIndex = Math.ceil(filtered.length / itemsPerView) - 1;
            if (currentGalleryIndex > 0) {
                currentGalleryIndex--;
                updateCarousel();
            }
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const filtered = galleryFilter === 'all' ? galleryItems : galleryItems.filter(item => item.type === galleryFilter);
            const itemsPerView = getItemsPerView();
            const maxIndex = Math.ceil(filtered.length / itemsPerView) - 1;
            if (currentGalleryIndex < maxIndex) {
                currentGalleryIndex++;
                updateCarousel();
            }
        });
    }
    
    // Filter functionality
    const filterBtns = document.querySelectorAll('.gallery-filters .filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            galleryFilter = btn.getAttribute('data-filter');
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderCarousel();
        });
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
        updateCarousel();
        updateDots();
    });
    
    renderCarousel();
}

// ============================================
// TESTIMONIAL CAROUSEL
// ============================================
let currentTestimonialIndex = 0;
let testimonialItems = [];

function initTestimonialCarousel() {
    const track = document.getElementById('testimonialTrack');
    const dotsContainer = document.getElementById('testimonialDots');
    if (!track) return;
    
    const testimonials = track.querySelectorAll('.testimonial-card');
    testimonialItems = Array.from(testimonials);
    
    function updateTestimonialCarousel() {
        const scrollAmount = currentTestimonialIndex * 100;
        track.style.transform = `translateX(-${scrollAmount}%)`;
        updateTestimonialDots();
    }
    
    function updateTestimonialDots() {
        if (dotsContainer) {
            dotsContainer.innerHTML = '';
            for (let i = 0; i < testimonialItems.length; i++) {
                const dot = document.createElement('div');
                dot.classList.add('testimonial-dot');
                if (i === currentTestimonialIndex) dot.classList.add('active');
                dot.addEventListener('click', () => {
                    currentTestimonialIndex = i;
                    updateTestimonialCarousel();
                });
                dotsContainer.appendChild(dot);
            }
        }
    }
    
    const prevBtn = document.querySelector('.testimonial-prev');
    const nextBtn = document.querySelector('.testimonial-next');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentTestimonialIndex > 0) {
                currentTestimonialIndex--;
                updateTestimonialCarousel();
            }
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentTestimonialIndex < testimonialItems.length - 1) {
                currentTestimonialIndex++;
                updateTestimonialCarousel();
            }
        });
    }
    
    updateTestimonialCarousel();
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
    initAccordion();
    initTestimonialCarousel();
    initSmoothScroll();
    
    console.log('Homepage initialized');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
