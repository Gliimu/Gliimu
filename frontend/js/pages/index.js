// ============================================
// GLIIMU HOMEPAGE - COMPLETE INTERACTIVITY
// Carousels, Accordions, Counters, Filters, Theme Toggle
// ============================================

// ============================================
// THEME HANDLING (System preference first)
// ============================================
function initTheme() {
    // Check localStorage first, then system preference
    const savedTheme = localStorage.getItem('theme');
    
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        updateThemeIcon(true);
    } else if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
        updateThemeIcon(false);
    } else {
        // Use system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.body.classList.add('dark-mode');
            updateThemeIcon(true);
        } else {
            document.body.classList.remove('dark-mode');
            updateThemeIcon(false);
        }
    }
}

function updateThemeIcon(isDark) {
    const themeToggle = document.getElementById('themeToggleHero');
    if (themeToggle) {
        if (isDark) {
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        }
    }
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}

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
            accordionItems.forEach(otherItem => {
                if (otherItem !== item && otherItem.classList.contains('active')) {
                    otherItem.classList.remove('active');
                }
            });
            item.classList.toggle('active');
        });
    });
    
    if (accordionItems.length > 0) {
        accordionItems[0].classList.add('active');
    }
}

// ============================================
// GALLERY CAROUSEL (With auto-slide & touch swipe)
// ============================================
let currentGalleryIndex = 0;
let galleryItems = [];
let galleryFilter = 'all';
let galleryAutoSlideInterval = null;
let galleryStartX = 0;
let galleryEndX = 0;

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
        startAutoSlide();
        
        // Add click handlers
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
        const filtered = galleryFilter === 'all' ? galleryItems : galleryItems.filter(item => item.type === galleryFilter);
        const maxIndex = Math.ceil(filtered.length / itemsPerView) - 1;
        
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
                    resetAutoSlide();
                });
                dotsContainer.appendChild(dot);
            }
        }
    }
    
    function nextSlide() {
        const filtered = galleryFilter === 'all' ? galleryItems : galleryItems.filter(item => item.type === galleryFilter);
        const itemsPerView = getItemsPerView();
        const maxIndex = Math.ceil(filtered.length / itemsPerView) - 1;
        if (currentGalleryIndex < maxIndex) {
            currentGalleryIndex++;
            updateCarousel();
        } else {
            currentGalleryIndex = 0;
            updateCarousel();
        }
    }
    
    function prevSlide() {
        if (currentGalleryIndex > 0) {
            currentGalleryIndex--;
            updateCarousel();
        }
    }
    
    function startAutoSlide() {
        if (galleryAutoSlideInterval) clearInterval(galleryAutoSlideInterval);
        galleryAutoSlideInterval = setInterval(nextSlide, 7000);
    }
    
    function resetAutoSlide() {
        if (galleryAutoSlideInterval) {
            clearInterval(galleryAutoSlideInterval);
            startAutoSlide();
        }
    }
    
    // Hide arrows on touch screens
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    
    if (isTouchDevice) {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
    } else {
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                prevSlide();
                resetAutoSlide();
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                nextSlide();
                resetAutoSlide();
            });
        }
    }
    
    // Touch swipe for mobile
    const carouselContainer = document.querySelector('.gallery-carousel');
    if (carouselContainer) {
        carouselContainer.addEventListener('touchstart', (e) => {
            galleryStartX = e.touches[0].clientX;
            resetAutoSlide();
        });
        
        carouselContainer.addEventListener('touchend', (e) => {
            galleryEndX = e.changedTouches[0].clientX;
            const diff = galleryStartX - galleryEndX;
            if (Math.abs(diff) > 50) {
                if (diff > 0) {
                    nextSlide();
                } else {
                    prevSlide();
                }
                resetAutoSlide();
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
            resetAutoSlide();
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
// TESTIMONIAL CAROUSEL (With auto-slide & touch swipe)
// ============================================
let currentTestimonialIndex = 0;
let testimonialItems = [];
let testimonialAutoSlideInterval = null;
let testimonialStartX = 0;
let testimonialEndX = 0;

function initTestimonialCarousel() {
    const track = document.getElementById('testimonialTrack');
    const dotsContainer = document.getElementById('testimonialDots');
    if (!track) return;
    
    const testimonials = [
        {
            text: "I didn't just learn to edit videos — I learned to build the platform that hosts them. Gliimu made me a complete creator.",
            name: "Finiks Kshel",
            role: "Media Producer",
            image: "photos/finiks.jpg"
        },
        {
            text: "The coding modules were challenging at first, but now I design and build my own projects. Best decision I ever made.",
            name: "Edi Edidiong",
            role: "UI/UX Designer",
            image: "photos/stu1.jpg"
        },
        {
            text: "Got hired before graduation. The practical experience from real client projects made all the difference.",
            name: "Chinedu Okafor",
            role: "Full-Stack Developer",
            image: "photos/stu2.jpg"
        }
    ];
    
    track.innerHTML = testimonials.map(t => `
        <div class="testimonial-card">
            <div class="testimonial-content">
                <i class="fas fa-quote-left"></i>
                <p>${t.text}</p>
                <div class="testimonial-author">
                    <img src="${t.image}" alt="${t.name}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(t.name)}&background=fbb040&color=fff'">
                    <div>
                        <strong>${t.name}</strong>
                        <span>${t.role}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    testimonialItems = document.querySelectorAll('.testimonial-card');
    
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
                    resetTestimonialAutoSlide();
                });
                dotsContainer.appendChild(dot);
            }
        }
    }
    
    function nextTestimonial() {
        if (currentTestimonialIndex < testimonialItems.length - 1) {
            currentTestimonialIndex++;
            updateTestimonialCarousel();
        } else {
            currentTestimonialIndex = 0;
            updateTestimonialCarousel();
        }
    }
    
    function prevTestimonial() {
        if (currentTestimonialIndex > 0) {
            currentTestimonialIndex--;
            updateTestimonialCarousel();
        }
    }
    
    function startTestimonialAutoSlide() {
        if (testimonialAutoSlideInterval) clearInterval(testimonialAutoSlideInterval);
        testimonialAutoSlideInterval = setInterval(nextTestimonial, 7000);
    }
    
    function resetTestimonialAutoSlide() {
        if (testimonialAutoSlideInterval) {
            clearInterval(testimonialAutoSlideInterval);
            startTestimonialAutoSlide();
        }
    }
    
    // Hide arrows on touch screens
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const prevBtn = document.querySelector('.testimonial-prev');
    const nextBtn = document.querySelector('.testimonial-next');
    
    if (isTouchDevice) {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
    } else {
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                prevTestimonial();
                resetTestimonialAutoSlide();
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                nextTestimonial();
                resetTestimonialAutoSlide();
            });
        }
    }
    
    // Touch swipe for mobile
    const testimonialContainer = document.querySelector('.testimonial-carousel');
    if (testimonialContainer) {
        testimonialContainer.addEventListener('touchstart', (e) => {
            testimonialStartX = e.touches[0].clientX;
            resetTestimonialAutoSlide();
        });
        
        testimonialContainer.addEventListener('touchend', (e) => {
            testimonialEndX = e.changedTouches[0].clientX;
            const diff = testimonialStartX - testimonialEndX;
            if (Math.abs(diff) > 50) {
                if (diff > 0) {
                    nextTestimonial();
                } else {
                    prevTestimonial();
                }
                resetTestimonialAutoSlide();
            }
        });
    }
    
    startTestimonialAutoSlide();
    updateTestimonialCarousel();
}

// ============================================
// LOAD PARTNERS SLIDER (52 Partners)
// ============================================
function loadPartnersSlider() {
    const partnersTrack = document.getElementById('partnersTrack');
    if (!partnersTrack) return;
    
    const partnerNames = [
        'Tech Corp', 'Media Plus', 'Creative Hub', 'Digital Solutions', 'Innovation Lab',
        'Studio One', 'Design Co', 'Code Masters', 'Film Factory', 'Animation Studio',
        'Web Experts', 'Brand Builders', 'Content Creators', 'Social Impact', 'Future Tech',
        'Art Department', 'Sound Lab', 'Edit House', 'Render Farm', 'Pixel Perfect',
        'UX Studio', 'Dev House', 'Media Group', 'Creative Agency', 'Digital First',
        'Tech Alliance', 'Media Network', 'Studio 54', 'Design Studio', 'Code Lab'
    ];
    
    // Create 52 partners (using duplicates of the above)
    let partners = [];
    for (let i = 0; i < 52; i++) {
        const name = partnerNames[i % partnerNames.length];
        partners.push({
            name: `${name} ${Math.floor(i / partnerNames.length) + 1}`,
            logo: `https://placehold.co/100x40/2c2f78/white?text=${encodeURIComponent(name.split(' ')[0])}`
        });
    }
    
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
// REMOVE STATS OVERLAY FROM IMAGE
// ============================================
function removeImageOverlay() {
    const overlayStats = document.querySelector('.image-overlay-stats');
    if (overlayStats) {
        overlayStats.style.display = 'none';
    }
}

// ============================================
// INITIALIZE ALL
// ============================================
function init() {
    console.log('Initializing homepage...');
    
    initTheme();
    initCountdown();
    initVideoBackground();
    loadStudentWorkGallery();
    loadPartnersSlider();
    initCounters();
    initAccordion();
    initTestimonialCarousel();
    initSmoothScroll();
    removeImageOverlay();
    
    // Add theme toggle event listener
    const themeToggle = document.getElementById('themeToggleHero');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    console.log('Homepage initialized');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
