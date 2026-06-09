// ============================================
// GLIIMU HOMEPAGE - SIMPLIFIED VERSION
// Horizontal scroll galleries (no carousel logic)
// ============================================

// ============================================
// THEME HANDLING
// ============================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        updateThemeIcon(true);
    } else if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
        updateThemeIcon(false);
    } else {
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
        themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}

// ============================================
// SCROLL REVEAL ANIMATIONS
// ============================================
function initScrollReveal() {
    const revealElements = document.querySelectorAll('.pillar-card, .service-card, .payment-card, .accordion-item');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    
    revealElements.forEach(el => observer.observe(el));
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
// ACCORDION (All closed initially)
// ============================================
function initAccordion() {
    const accordionItems = document.querySelectorAll('.accordion-item');
    
    accordionItems.forEach(item => {
        item.classList.remove('active');
    });
    
    accordionItems.forEach(item => {
        const header = item.querySelector('.accordion-header');
        header.addEventListener('click', () => {
            accordionItems.forEach(other => {
                if (other !== item && other.classList.contains('active')) {
                    other.classList.remove('active');
                }
            });
            item.classList.toggle('active');
        });
    });
}

// ============================================
// GALLERY - Horizontal Scroll (No Carousel)
// ============================================
let galleryItems = [];
let currentGalleryFilter = 'all';

function loadStudentWorkGallery() {
    const galleryTrack = document.getElementById('galleryTrack');
    if (!galleryTrack) return;
    
    const studentWorks = [
        { id: 1, title: 'Nike Commercial', type: 'video', thumbnail: 'photos/portfolio1.jpg', student: 'Finiks Kshel' },
        { id: 2, title: 'Food App UI Design', type: 'design', thumbnail: 'photos/portfolio2.jpg', student: 'Edi Edidiong' },
        { id: 3, title: 'E-commerce Website', type: 'code', thumbnail: 'photos/portfolio3.jpg', student: 'Chinedu Okafor' },
        { id: 4, title: 'Title Sequence Animation', type: 'video', thumbnail: 'photos/portfolio4.jpg', student: 'Precious Adams' },
        { id: 5, title: 'Brand Identity Package', type: 'design', thumbnail: 'photos/ads.jpg', student: 'Sarah Johnson' },
        { id: 6, title: 'Mobile Game Development', type: 'code', thumbnail: 'photos/ads2.jpg', student: 'Michael Okonkwo' },
        { id: 7, title: 'Documentary Trailer', type: 'video', thumbnail: 'photos/ads3.jpg', student: 'David Wilson' },
        { id: 8, title: 'Restaurant Branding', type: 'design', thumbnail: 'photos/ads4.jpg', student: 'Emma Thompson' }
    ];
    
    galleryItems = studentWorks;
    
    function renderGallery() {
        const filtered = currentGalleryFilter === 'all' ? galleryItems : galleryItems.filter(item => item.type === currentGalleryFilter);
        
        galleryTrack.innerHTML = filtered.map(work => `
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
    }
    
    // Filter functionality
    const filterBtns = document.querySelectorAll('.gallery-filters .filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentGalleryFilter = btn.getAttribute('data-filter');
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderGallery();
        });
    });
    
    renderGallery();
}

// ============================================
// TESTIMONIALS - Horizontal Scroll (No Carousel)
// ============================================
function loadTestimonials() {
    const testimonialsTrack = document.getElementById('testimonialsTrack');
    if (!testimonialsTrack) return;
    
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
        },
        {
            text: "The squad system changed everything. Learning in a small group with real projects accelerated my growth like nothing else.",
            name: "Precious Adams",
            role: "Motion Designer",
            image: "photos/stu3.jpg"
        },
        {
            text: "From zero coding experience to building full-stack applications in 8 months. Gliimu's curriculum is unmatched.",
            name: "Michael Okonkwo",
            role: "Software Engineer",
            image: "photos/stu4.jpg"
        },
        {
            text: "The instructors actually care about your success. They go above and beyond to make sure you understand.",
            name: "Sarah Johnson",
            role: "Product Designer",
            image: "photos/stu.jpg"
        }
    ];
    
    testimonialsTrack.innerHTML = testimonials.map(t => `
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
}

// ============================================
// PARTNERS SLIDER
// ============================================
function loadPartnersSlider() {
    const partnersTrack = document.getElementById('partnersTrack');
    if (!partnersTrack) return;
    
    const partnerNames = [
        'Tech Corp', 'Media Plus', 'Creative Hub', 'Digital Solutions', 'Innovation Lab',
        'Studio One', 'Design Co', 'Code Masters', 'Film Factory', 'Animation Studio',
        'Web Experts', 'Brand Builders', 'Content Creators', 'Social Impact', 'Future Tech',
        'Art Department', 'Sound Lab', 'Edit House', 'Render Farm', 'Pixel Perfect'
    ];
    
    let partners = [];
    for (let i = 0; i < 52; i++) {
        const name = partnerNames[i % partnerNames.length];
        partners.push({
            name: `${name}`,
            logo: `https://placehold.co/80x40/2c2f78/white?text=${encodeURIComponent(name.split(' ')[0])}`
        });
    }
    
    const allPartners = [...partners, ...partners];
    
    partnersTrack.innerHTML = allPartners.map(partner => `
        <div class="partner-logo">
            <img src="${partner.logo}" alt="${partner.name}">
        </div>
    `).join('');
    
    partnersTrack.style.animation = 'scrollPartners 136s linear infinite';
}

// ============================================
// SCROLL TO TOP BUTTON
// ============================================
function initScrollToTop() {
    const scrollBtn = document.getElementById('scrollToTopBtn');
    if (!scrollBtn) return;
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 500) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }
    });
    
    scrollBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
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
// REMOVE STATS OVERLAY
// ============================================
function removeImageOverlay() {
    const overlayStats = document.querySelector('.image-overlay-stats');
    if (overlayStats) {
        overlayStats.style.display = 'none';
    }
}

// ============================================
// INITIALIZE
// ============================================
function init() {
    console.log('Initializing homepage...');
    
    initTheme();
    initVideoBackground();
    loadStudentWorkGallery();
    loadTestimonials();
    loadPartnersSlider();
    initCounters();
    initAccordion();
    initSmoothScroll();
    initScrollReveal();
    initScrollToTop();
    removeImageOverlay();
    
    const themeToggle = document.getElementById('themeToggleHero');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    console.log('Homepage initialized');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
