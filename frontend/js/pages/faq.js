// ============================================
// FAQ PAGE - GLIIMU INSTITUTE
// Dynamic FAQ with search, categories, and accordion
// ============================================

// FAQ Data Structure - Complete with all questions and answers
const faqData = [
  // Admissions Category
  {
    id: "admissions",
    title: "🎓 Admissions & Requirements",
    questions: [
      {
        q: "What are the major requirements for admission?",
        a: "Our primary requirement is a genuine <strong>passion and interest for media technology and creativity</strong>. Unlike traditional institutions, we value your drive over standardized test scores alone.<br><br>While not mandatory, fluency in English, a clear understanding of your specific area of interest, and the ability to articulate your unique 'selling point' are considered <strong>added advantages</strong> during the selection process."
      },
      {
        q: "Do I need prior experience to apply?",
        a: "<strong>No, you do not need any prior experience.</strong> We are committed to inclusivity and starting everyone from the very basics. Whether you are a complete beginner or have some background, our curriculum is designed to meet you at your level and build you up to industry standard."
      },
      {
        q: "When do semesters begin and how is the schedule structured?",
        a: "We operate differently from regular schools. We do not follow a rigid cohort system because we understand people learn at different paces. <strong>Your semester begins the moment you get admitted.</strong><br><br>Upon admission, you will download your personalized road map from the Gliimu Library. This marks the start of your learning journey, allowing for a flexible, self-paced yet structured approach to your education."
      },
      {
        q: "What is the application process like?",
        a: "The application process is simple and straightforward:<br><br><ul><li>Fill out the online application form</li><li>Submit your creative portfolio (optional but recommended)</li><li>Complete a short motivation statement</li><li>Attend a virtual interview with our admissions team</li><li>Receive your admission decision within 5-7 business days</li></ul>"
      }
    ]
  },
  // Learning Structure Category
  {
    id: "learning",
    title: "📚 Learning Structure & Methodology",
    questions: [
      {
        q: "How is your learning method different from traditional schools?",
        a: "We believe that people are different, so we don't put everyone in a single file. Our model is <strong>competency-based and highly practical</strong>.<br><br>Instead of passive learning, you will be included in a squad led by a Squad Leader (typically a group of three persons). Together, you will work on real-life problems. <strong>You learn as you solve these problems</strong>, ensuring you gain hands-on experience that is immediately applicable in the real world."
      },
      {
        q: "Are classes held online or on-site?",
        a: "Our programs are primarily <strong>on-site at our Gwarinpa campus</strong>. We prioritize physical presence to ensure you have direct, hands-on experience with high-end studio equipment and collaborate effectively with your squad.<br><br>However, to support your journey, all theory modules, resources, and road maps are accessible <strong>24/7 via the Gliimu Hub and Virtual Library</strong>."
      },
      {
        q: "What is the squad system?",
        a: "The <strong>squad system</strong> is our unique approach to collaborative learning. Each squad consists of 3 students who work together on projects, review each other's work, and provide mutual support. This system:<br><br><ul><li>Develops teamwork and collaboration skills</li><li>Provides peer accountability and motivation</li><li>Creates a support network for problem-solving</li><li>Simulates real-world creative team dynamics</li></ul>"
      },
      {
        q: "How long does it take to complete a program?",
        a: "Program duration varies based on your chosen track:<br><br><ul><li><strong>Ambassador Diploma:</strong> 4-8 months (self-paced)</li><li><strong>Short Courses:</strong> 2-3 months</li><li><strong>Workshops:</strong> 1-4 weeks</li></ul><br>Since we're self-paced, you can complete faster by dedicating more time or take longer if needed."
      }
    ]
  },
  // Tuition & Fees Category
  {
    id: "tuition",
    title: "💰 Tuition & Scholarships",
    questions: [
      {
        q: "How much is the tuition for the Diploma?",
        a: "The <strong>Ambassador Diploma</strong> costs <span class='price-tag'>N255,000</span> for the first session (4 months).<br><br>We also offer Short Courses (2 months), which range from <span class='price-tag'>N5,000 and above</span>, depending on the specific module."
      },
      {
        q: "Are there scholarships or financial aid available?",
        a: "Yes, we have several financial support structures designed to make education accessible:<br><br><ul><li><strong>Work n' Pay Programmes:</strong> Opportunities to work while you learn.</li><li><strong>Early Bird Scholarships:</strong> Discounts for early registration.</li><li><strong>One-time Massive Discounts:</strong> Special periodic offers.</li><li><strong>Pay as you Learn:</strong> Installmental options tied to your progress.</li></ul>"
      },
      {
        q: "Can I pay in installments?",
        a: "Yes, we offer <strong>flexible payment plans</strong>. You can split your payment into three manageable chunks and pay conveniently. To set up a plan that suits your financial situation, please communicate directly with an admission officer via <a href='contact.html' class='highlight-text'>gliimu.com/contact</a>."
      },
      {
        q: "What payment methods are accepted?",
        a: "We accept various payment methods:<br><br><ul><li><strong>Bank Transfer</strong> directly to our corporate account</li><li><strong>Credit/Debit Cards</strong> (Visa, Mastercard, Verve)</li><li><strong>USDT/Cryptocurrency</strong> (for international students)</li><li><strong>Payment via Wallet</strong> (funded through our payment system)</li></ul>"
      }
    ]
  },
  // Accreditation Category
  {
    id: "accreditation",
    title: "🏆 Accreditation & Validation",
    questions: [
      {
        q: "Are you accredited by the government?",
        a: "We operate as a <strong>specialized competency-based institute</strong>. Rather than solely relying on government accreditation, we gain our relevance and prestige through rigorous <strong>industry expert assessments</strong> and strategic partnerships with peer institutions.<br><br>This approach ensures our curriculum remains faster, more practical, and strictly aligned with current market realities compared to traditional academic structures."
      },
      {
        q: "Who validates your student certificates?",
        a: "Our diplomas are validated by our <strong>Board of Industry Partners</strong>. Furthermore, we actively facilitate <strong>peer-to-peer portfolio reviews</strong> where your work is critiqued by experts from other top media firms.<br><br>This rigorous validation ensures that your skills are not just recognized locally but are competitive and acknowledged <strong>globally</strong>."
      },
      {
        q: "What certification will I receive upon completion?",
        a: "Upon successful completion, you will receive a <strong>Gliimu Diploma in Full-Stack Media Production</strong>. This prestigious certification identifies you as a 'Media Architect,' validating your comprehensive ability to handle Code, Design, and Live Media projects end-to-end."
      },
      {
        q: "Is the certificate recognized internationally?",
        a: "Yes! Our certificates are recognized by our international partner institutions and industry leaders across Africa, Europe, and North America. Many of our graduates have successfully used their Gliimu certifications to secure positions at international companies and gain admission to advanced programs abroad."
      }
    ]
  },
  // Technical Support Category
  {
    id: "technical",
    title: "💻 Technical Support",
    questions: [
      {
        q: "What equipment do I need to start?",
        a: "To get started, you'll need:<br><br><ul><li>A laptop or desktop computer (Windows, Mac, or Linux)</li><li>Reliable internet connection (minimum 10 Mbps)</li><li>Webcam and microphone for virtual sessions</li><li>Basic software like a web browser and Zoom/Google Meet</li></ul><br>Don't worry if you don't have professional equipment - we provide access to our studio gear during on-site sessions!"
      },
      {
        q: "What if I have technical issues during class?",
        a: "We have a dedicated <strong>technical support team</strong> available during class hours. You can:<br><br><ul><li>Use the in-chat support feature</li><li>Email support@gliimu.com</li><li>Call our tech hotline during business hours</li><li>Visit the IT desk at our campus</li></ul>"
      },
      {
        q: "Is there a mobile app?",
        a: "Yes! We have a mobile app available for both iOS and Android. You can access your dashboard, library, chat, and receive notifications on the go. The app is available for download from the App Store and Google Play Store."
      }
    ]
  }
];

// Global variables
let activeCategory = "admissions";
let searchTerm = "";
let debounceTimeout = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log("FAQ page initializing...");
    
    renderCategories();
    renderFAQs();
    setupEventListeners();
    setupBackToTop();
    
    // Mark initialization complete
    console.log("FAQ page ready");
});

// ============================================
// RENDER FUNCTIONS
// ============================================

function renderCategories() {
    const container = document.getElementById("faqCategoriesNav");
    if (!container) return;
    
    container.innerHTML = faqData.map(cat => `
        <button class="category-tab ${cat.id === activeCategory ? 'active' : ''}" data-category="${cat.id}">
            ${cat.title}
        </button>
    `).join("");
}

function renderFAQs() {
    const container = document.getElementById("faqAccordionContainer");
    if (!container) return;
    
    // Filter categories based on search
    let filteredData = [...faqData];
    let totalVisible = 0;
    
    if (searchTerm) {
        filteredData = faqData.map(cat => ({
            ...cat,
            questions: cat.questions.filter(q => 
                q.q.toLowerCase().includes(searchTerm) || 
                q.a.toLowerCase().includes(searchTerm)
            )
        })).filter(cat => cat.questions.length > 0);
        
        totalVisible = filteredData.reduce((sum, cat) => sum + cat.questions.length, 0);
    } else if (activeCategory !== "all") {
        filteredData = faqData.filter(cat => cat.id === activeCategory);
    }
    
    // Update results count
    const resultsCount = document.getElementById("faqResultsCount");
    if (resultsCount) {
        if (searchTerm) {
            resultsCount.textContent = `Found ${totalVisible} result${totalVisible !== 1 ? 's' : ''}`;
            resultsCount.style.display = 'block';
        } else {
            resultsCount.textContent = "";
            resultsCount.style.display = 'none';
        }
    }
    
    // Show/hide clear search button
    const clearBtn = document.getElementById("clearSearchBtn");
    if (clearBtn) {
        clearBtn.style.display = searchTerm ? 'block' : 'none';
    }
    
    if (filteredData.length === 0 || (filteredData[0] && filteredData[0].questions.length === 0)) {
        container.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No matching questions found</h3>
                <p>Try different keywords or browse our categories below.</p>
                <button class="clear-search-btn-link" onclick="clearSearch()">
                    Clear Search
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredData.map(category => `
        <div class="faq-category" data-category="${category.id}">
            <h2 class="category-title">${category.title}</h2>
            ${category.questions.map(question => `
                <div class="accordion-item" data-question="${escapeHtml(question.q)}">
                    <button class="accordion-header">
                        <span>${highlightText(question.q, searchTerm)}</span>
                        <i class="fas fa-plus accordion-icon"></i>
                    </button>
                    <div class="accordion-content">
                        <div class="accordion-content-inner">
                            ${highlightText(question.a, searchTerm)}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `).join('');
    
    // Re-attach accordion listeners
    setupAccordion();
}

// ============================================
// ACCORDION FUNCTIONALITY
// ============================================

function setupAccordion() {
    const accordionItems = document.querySelectorAll('.accordion-item');
    
    accordionItems.forEach(item => {
        const header = item.querySelector('.accordion-header');
        const content = item.querySelector('.accordion-content');
        
        if (!header) return;
        
        // Remove existing listener to avoid duplicates
        const newHeader = header.cloneNode(true);
        header.parentNode.replaceChild(newHeader, header);
        
        newHeader.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            
            // Close all other accordions
            accordionItems.forEach(otherItem => {
                if (otherItem !== item && otherItem.classList.contains('active')) {
                    otherItem.classList.remove('active');
                    const otherContent = otherItem.querySelector('.accordion-content');
                    if (otherContent) otherContent.style.maxHeight = null;
                }
            });
            
            // Toggle current
            if (!isActive) {
                item.classList.add('active');
                if (content) {
                    content.style.maxHeight = content.scrollHeight + 'px';
                }
            } else {
                item.classList.remove('active');
                if (content) content.style.maxHeight = null;
            }
        });
    });
}

// ============================================
// SEARCH FUNCTIONALITY
// ============================================

function searchFAQs() {
    const searchInput = document.getElementById("faqSearchInput");
    if (!searchInput) return;
    
    searchTerm = searchInput.value.toLowerCase().trim();
    
    // Debounce search for better performance
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        renderFAQs();
    }, 300);
}

function clearSearch() {
    const searchInput = document.getElementById("faqSearchInput");
    if (searchInput) {
        searchInput.value = "";
        searchTerm = "";
        activeCategory = "admissions";
        renderCategories();
        renderFAQs();
        
        // Reset URL hash if any
        if (window.location.hash) {
            window.location.hash = '';
        }
    }
}

// ============================================
// CATEGORY FILTER
// ============================================

function filterByCategory(categoryId) {
    activeCategory = categoryId;
    searchTerm = "";
    
    // Clear search input
    const searchInput = document.getElementById("faqSearchInput");
    if (searchInput) searchInput.value = "";
    
    // Clear clear button
    const clearBtn = document.getElementById("clearSearchBtn");
    if (clearBtn) clearBtn.style.display = 'none';
    
    renderCategories();
    renderFAQs();
    
    // Smooth scroll to top of FAQs
    const container = document.getElementById("faqAccordionContainer");
    if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ============================================
// BACK TO TOP FUNCTIONALITY
// ============================================

function setupBackToTop() {
    const backToTopBtn = document.getElementById("backToTopBtn");
    if (!backToTopBtn) return;
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            backToTopBtn.classList.add('visible');
        } else {
            backToTopBtn.classList.remove('visible');
        }
    });
    
    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function highlightText(text, term) {
    if (!term || !text) return text;
    
    // Escape regex special characters
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    
    return text.replace(regex, '<span class="highlight">$1</span>');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById("faqSearchInput");
    if (searchInput) {
        searchInput.addEventListener("input", searchFAQs);
    }
    
    // Clear search button
    const clearBtn = document.getElementById("clearSearchBtn");
    if (clearBtn) {
        clearBtn.addEventListener("click", clearSearch);
    }
    
    // Category clicks (delegation)
    const categoriesNav = document.getElementById("faqCategoriesNav");
    if (categoriesNav) {
        categoriesNav.addEventListener("click", (e) => {
            const btn = e.target.closest(".category-tab");
            if (btn) {
                const categoryId = btn.dataset.category;
                filterByCategory(categoryId);
            }
        });
    }
}

// ============================================
// EXPOSE GLOBALLY FOR INLINE HANDLERS
// ============================================

window.filterByCategory = filterByCategory;
window.clearSearch = clearSearch;
window.initFAQ = function() {
    console.log("FAQ initialized");
};
