// course.js - Enhanced with enrollment, progress, and payment

import { supabase, getCurrentUser, getUserProfile } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// GLOBAL STATE
// ============================================

let currentUser = null;
let isEnrolled = false;
let enrollmentData = null;
let userProgress = [];
let currentTrack = null;
let curriculumData = [];

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Course page initializing...');
    
    // Get current user
    currentUser = await getCurrentUser();
    
    // Load curriculum from database
    await loadCurriculum();
    
    // Check enrollment status
    if (currentUser) {
        await checkEnrollmentStatus();
        await loadUserProgress();
        updateUIForUser();
    }
    
    // Render curriculum with progress
    renderCurriculum();
    
    // Setup event listeners
    setupEventListeners();
    animateOnScroll();
    
    // Update pricing based on user
    updatePricingForUser();
});

// ============================================
// DATABASE FUNCTIONS
// ============================================

async function loadCurriculum() {
    try {
        const { data, error } = await supabase
            .from('course_curriculum')
            .select('*')
            .order('phase', { ascending: true })
            .order('module_order', { ascending: true });
        
        if (!error && data && data.length > 0) {
            // Group by phase
            const phases = {};
            data.forEach(module => {
                if (!phases[module.phase]) {
                    phases[module.phase] = {
                        phase: module.phase,
                        title: module.phase_title,
                        modules: []
                    };
                }
                phases[module.phase].modules.push(module);
            });
            curriculumData = Object.values(phases);
        } else {
            // Fallback to static data
            useStaticCurriculum();
        }
    } catch (error) {
        console.error('Error loading curriculum:', error);
        useStaticCurriculum();
    }
}

function useStaticCurriculum() {
    curriculumData = [
        {
            phase: 1,
            title: "Phase 1: Foundation (Month 1-2)",
            modules: [
                { module_name: "Introduction to Media Technologies", module_description: "Overview of the media landscape and career paths" },
                { module_name: "Visual Storytelling Fundamentals", module_description: "Understanding narrative structure and visual language" },
                { module_name: "Design Principles", module_description: "Color theory, typography, layout, and composition" },
                { module_name: "Introduction to Programming", module_description: "Basic coding concepts using JavaScript" }
            ]
        },
        {
            phase: 2,
            title: "Phase 2: Core Skills (Month 3-6)",
            modules: [
                { module_name: "Video Production & Cinematography", module_description: "Camera operation, lighting, and audio recording" },
                { module_name: "Post-Production & Editing", module_description: "Adobe Premiere Pro, DaVinci Resolve, After Effects" },
                { module_name: "UI/UX Design", module_description: "Figma, prototyping, user research, accessibility" },
                { module_name: "Web Development", module_description: "HTML, CSS, JavaScript, responsive design" }
            ]
        },
        {
            phase: 3,
            title: "Phase 3: Advanced (Month 7-10)",
            modules: [
                { module_name: "Advanced Video Effects", module_description: "VFX, motion graphics, 3D animation" },
                { module_name: "Full-Stack Development", module_description: "React, Node.js, databases, APIs" },
                { module_name: "Brand Strategy & Management", module_description: "Brand identity, marketing, social media" },
                { module_name: "Portfolio Development", module_description: "Building a professional portfolio" }
            ]
        },
        {
            phase: 4,
            title: "Phase 4: Capstone (Month 11-12)",
            modules: [
                { module_name: "Industry Project", module_description: "Real-world client project with mentorship" },
                { module_name: "Career Preparation", module_description: "Resume building, interview skills, networking" },
                { module_name: "Final Portfolio Review", module_description: "Presentation to industry panel" }
            ]
        }
    ];
}

async function checkEnrollmentStatus() {
    if (!currentUser) return;
    
    try {
        const { data, error } = await supabase
            .from('course_enrollments')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('course_id', 'diploma-fullstack-media')
            .single();
        
        if (!error && data) {
            isEnrolled = true;
            enrollmentData = data;
            currentTrack = data.track;
            showToast(`Welcome back! You're enrolled in the ${currentTrack === 'creative' ? 'Creative Media' : 'Tech'} Track.`, 'success');
        }
    } catch (error) {
        console.log('Not enrolled yet');
    }
}

async function loadUserProgress() {
    if (!currentUser || !isEnrolled) return;
    
    try {
        const { data, error } = await supabase
            .from('module_progress')
            .select('module_name, completed')
            .eq('user_id', currentUser.id);
        
        if (!error && data) {
            userProgress = data;
            updateProgressStats();
        }
    } catch (error) {
        console.error('Error loading progress:', error);
    }
}

async function enrollInCourse(track, paymentPlan) {
    if (!currentUser) {
        showToast('Please login to enroll', 'error');
        setTimeout(() => {
            window.location.href = 'signin.html';
        }, 1500);
        return;
    }
    
    // Check wallet balance
    const profile = await getUserProfile();
    const walletBalance = profile?.wallet_balance || 0;
    
    let amount = 0;
    if (paymentPlan === 'one-time') amount = 250000;
    else if (paymentPlan === 'installment') amount = 90000;
    else if (paymentPlan === 'scholarship') amount = 237500;
    
    if (walletBalance < amount) {
        showToast(`Insufficient wallet balance. Need ₦${amount.toLocaleString()}`, 'error');
        if (confirm('Would you like to fund your wallet?')) {
            window.location.href = 'dashboard.html?tab=wallet';
        }
        return;
    }
    
    // Process enrollment
    try {
        // Deduct from wallet
        const newBalance = walletBalance - amount;
        await supabase
            .from('users')
            .update({ wallet_balance: newBalance })
            .eq('id', currentUser.id);
        
        // Create enrollment record
        const { error } = await supabase
            .from('course_enrollments')
            .insert({
                user_id: currentUser.id,
                course_id: 'diploma-fullstack-media',
                track: track,
                payment_plan: paymentPlan,
                enrollment_date: new Date().toISOString(),
                status: 'active'
            });
        
        if (error) throw error;
        
        // Record transaction
        await supabase
            .from('transactions')
            .insert({
                user_id: currentUser.id,
                amount: amount,
                type: 'debit',
                description: `Course Enrollment: Full-Stack Media Diploma (${track} track)`,
                status: 'completed'
            });
        
        showToast('Successfully enrolled! Welcome to the program.', 'success');
        isEnrolled = true;
        currentTrack = track;
        
        // Update UI
        updateUIForUser();
        renderCurriculum();
        
    } catch (error) {
        console.error('Enrollment error:', error);
        showToast('Enrollment failed. Please try again.', 'error');
    }
}

async function markModuleComplete(moduleName) {
    if (!currentUser || !isEnrolled) {
        showToast('Please enroll to track progress', 'info');
        return;
    }
    
    // Check if already completed
    const existing = userProgress.find(p => p.module_name === moduleName);
    if (existing?.completed) {
        showToast('Module already completed!', 'info');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('module_progress')
            .insert({
                user_id: currentUser.id,
                module_name: moduleName,
                completed: true,
                completed_at: new Date().toISOString()
            });
        
        if (error) throw error;
        
        userProgress.push({ module_name: moduleName, completed: true });
        updateProgressStats();
        renderCurriculum();
        
        showToast(`Great job! Completed "${moduleName}"`, 'success');
        
        // Check if all modules completed
        await checkCourseCompletion();
        
    } catch (error) {
        console.error('Error marking module complete:', error);
        showToast('Failed to update progress', 'error');
    }
}

async function checkCourseCompletion() {
    // Get total required modules
    const totalModules = curriculumData.reduce((sum, phase) => sum + phase.modules.length, 0);
    const completedModules = userProgress.filter(p => p.completed).length;
    
    if (completedModules === totalModules && totalModules > 0) {
        // Generate certificate
        await generateCertificate();
    }
}

async function generateCertificate() {
    // Check if certificate already exists
    const { data: existing } = await supabase
        .from('certificates')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('course_id', 'diploma-fullstack-media')
        .single();
    
    if (existing) {
        showToast('Certificate already generated! Check your profile.', 'info');
        return;
    }
    
    // Generate certificate
    const certificateId = `GLM-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const { error } = await supabase
        .from('certificates')
        .insert({
            user_id: currentUser.id,
            course_id: 'diploma-fullstack-media',
            certificate_number: certificateId,
            student_name: currentUser.user_metadata?.name || currentUser.email?.split('@')[0],
            completion_date: new Date().toISOString(),
            track: currentTrack
        });
    
    if (!error) {
        showToast('🎉 Congratulations! You\'ve earned your certificate!', 'success');
        setTimeout(() => {
            window.location.href = 'dashboard.html?tab=certificates';
        }, 3000);
    }
}

function updateProgressStats() {
    const totalModules = curriculumData.reduce((sum, phase) => sum + phase.modules.length, 0);
    const completedModules = userProgress.filter(p => p.completed).length;
    const percentage = totalModules > 0 ? (completedModules / totalModules) * 100 : 0;
    
    // Update progress bar if exists
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    if (progressBar) {
        progressBar.style.width = `${percentage}%`;
    }
    if (progressText) {
        progressText.textContent = `${Math.round(percentage)}% Complete`;
    }
}

// ============================================
// RENDER FUNCTIONS
// ============================================

function renderCurriculum() {
    const container = document.getElementById('curriculumContainer');
    if (!container) return;
    
    container.innerHTML = curriculumData.map(phase => {
        const phaseNumber = phase.phase || 1;
        const phaseModules = phase.modules || [];
        
        return `
            <div class="curriculum-phase">
                <h3 class="phase-title">${phase.title || `Phase ${phaseNumber}`}</h3>
                <div class="modules-grid">
                    ${phaseModules.map(module => {
                        const moduleName = module.module_name || module.name;
                        const isCompleted = userProgress.some(p => p.module_name === moduleName && p.completed);
                        const canComplete = isEnrolled && !isCompleted;
                        
                        return `
                            <div class="module-item ${isCompleted ? 'completed' : ''}">
                                <div class="module-icon">
                                    ${isCompleted ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-book-open"></i>'}
                                </div>
                                <div class="module-name">${moduleName}</div>
                                <div class="module-desc">${module.module_description || module.desc}</div>
                                ${isEnrolled && !isCompleted ? `
                                    <button class="module-complete-btn" onclick="markModuleComplete('${moduleName.replace(/'/g, "\\'")}')">
                                        Mark Complete
                                    </button>
                                ` : ''}
                                ${isCompleted ? '<div class="completed-badge"><i class="fas fa-check"></i> Completed</div>' : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function updateUIForUser() {
    // Show/hide enrollment CTA
    const enrollmentSection = document.getElementById('enrollmentSection');
    const progressSection = document.getElementById('progressSection');
    
    if (isEnrolled) {
        if (enrollmentSection) enrollmentSection.style.display = 'none';
        if (progressSection) progressSection.style.display = 'block';
        
        // Add progress bar to page
        addProgressBar();
    } else {
        if (enrollmentSection) enrollmentSection.style.display = 'block';
        if (progressSection) progressSection.style.display = 'none';
    }
    
    // Update CTA buttons
    const applyBtns = document.querySelectorAll('.apply-now, .pricing-btn, .track-btn, .btn-cta-primary');
    applyBtns.forEach(btn => {
        if (!isEnrolled) {
            btn.onclick = () => showEnrollmentModal();
        } else {
            btn.onclick = () => window.location.href = 'dashboard.html';
            btn.textContent = 'Go to Dashboard';
        }
    });
}

function addProgressBar() {
    const existingBar = document.getElementById('progressSection');
    if (existingBar) return;
    
    const heroSection = document.querySelector('.course-hero');
    if (heroSection) {
        const progressHtml = `
            <div id="progressSection" class="progress-section">
                <div class="progress-container">
                    <div class="progress-header">
                        <span>Your Progress</span>
                        <span id="progressText">0% Complete</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" id="progressBar" style="width: 0%"></div>
                    </div>
                    <div class="progress-track-info">
                        <i class="fas fa-map-marker-alt"></i> Track: ${currentTrack === 'creative' ? 'Creative Media' : 'Tech'}
                    </div>
                </div>
            </div>
        `;
        heroSection.insertAdjacentHTML('afterend', progressHtml);
        updateProgressStats();
    }
}

function updatePricingForUser() {
    if (!currentUser) return;
    
    // Show user-specific pricing (e.g., returning student discount)
    const pricingCards = document.querySelectorAll('.pricing-price');
    // Could apply discounts based on user history
}

function showEnrollmentModal() {
    // Create enrollment modal
    const modalHtml = `
        <div class="enrollment-modal" id="enrollmentModal">
            <div class="enrollment-modal-content">
                <div class="enrollment-modal-header">
                    <h3>Choose Your Track</h3>
                    <button class="close-modal" onclick="closeEnrollmentModal()">&times;</button>
                </div>
                <div class="enrollment-modal-body">
                    <div class="track-option" onclick="selectTrack('creative')">
                        <i class="fas fa-palette"></i>
                        <div>
                            <h4>Creative Media Track</h4>
                            <p>Focus on video production, motion graphics, and UI/UX design</p>
                        </div>
                    </div>
                    <div class="track-option" onclick="selectTrack('tech')">
                        <i class="fas fa-code"></i>
                        <div>
                            <h4>Tech Track</h4>
                            <p>Focus on web development, programming, and cloud computing</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('enrollmentModal').style.display = 'flex';
}

function closeEnrollmentModal() {
    const modal = document.getElementById('enrollmentModal');
    if (modal) modal.remove();
}

// ============================================
// TRACK & PLAN SELECTION (Enhanced)
// ============================================

function selectTrack(track) {
    closeEnrollmentModal();
    
    // Store selected track
    window.selectedTrack = track;
    
    // Show payment options modal
    showPaymentModal(track);
}

function showPaymentModal(track) {
    const trackName = track === 'creative' ? 'Creative Media' : 'Tech';
    
    const modalHtml = `
        <div class="enrollment-modal" id="paymentModal">
            <div class="enrollment-modal-content">
                <div class="enrollment-modal-header">
                    <h3>Complete Enrollment - ${trackName} Track</h3>
                    <button class="close-modal" onclick="closePaymentModal()">&times;</button>
                </div>
                <div class="enrollment-modal-body">
                    <p>Select your payment plan:</p>
                    <div class="payment-option" onclick="processEnrollment('${track}', 'one-time')">
                        <div>
                            <h4>One-Time Payment</h4>
                            <p>Pay ₦250,000 once</p>
                        </div>
                        <div class="price">₦250,000</div>
                    </div>
                    <div class="payment-option" onclick="processEnrollment('${track}', 'installment')">
                        <div>
                            <h4>Installment Plan</h4>
                            <p>3 payments of ₦90,000 + ₦80,000 + ₦80,000</p>
                        </div>
                        <div class="price">₦90,000 upfront</div>
                    </div>
                    <div class="payment-option" onclick="processEnrollment('${track}', 'scholarship')">
                        <div>
                            <h4>Early Bird Scholarship</h4>
                            <p>Limited slots - 5% discount</p>
                        </div>
                        <div class="price">₦237,500</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('paymentModal').style.display = 'flex';
}

function closePaymentModal() {
    const modal = document.getElementById('paymentModal');
    if (modal) modal.remove();
}

function processEnrollment(track, plan) {
    closePaymentModal();
    enrollInCourse(track, plan);
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    const brochureBtn = document.getElementById('downloadBrochure');
    if (brochureBtn) {
        brochureBtn.addEventListener('click', () => {
            window.open('/brochure/diploma-media-production.pdf', '_blank');
        });
    }
}

// ============================================
// ANIMATIONS
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
    }, { threshold: 0.1 });
    
    elements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        observer.observe(el);
    });
}

// ============================================
// EXPOSE GLOBALLY
// ============================================

window.selectTrack = selectTrack;
window.markModuleComplete = markModuleComplete;
window.closeEnrollmentModal = closeEnrollmentModal;
window.closePaymentModal = closePaymentModal;
window.processEnrollment = processEnrollment;
window.enrollInCourse = enrollInCourse;
