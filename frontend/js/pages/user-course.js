// ============================================
// USER COURSE - Learning Path + Electives
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// GLOBAL STATE
// ============================================

let currentUser = null;
let curriculumData = [];
let electivesData = [];
let userProgress = [];
let userGP = 0;
let userStreak = 0;
let expandedPhases = new Set();
let isEmbedded = false;
let searchQuery = '';
let isDarkMode = false;
let currentElectiveId = null;
let userReferralCode = null;

// ============================================
// THEME MANAGEMENT
// ============================================

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dashboardTheme = localStorage.getItem('dashboard_theme');
    
    if (dashboardTheme === 'dark' || savedTheme === 'dark') {
        isDarkMode = true;
        document.body.classList.add('dark-mode');
    } else if (dashboardTheme === 'light' || savedTheme === 'light') {
        isDarkMode = false;
        document.body.classList.remove('dark-mode');
    } else if (systemPrefersDark) {
        isDarkMode = true;
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    } else {
        isDarkMode = true;
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    }
    
    updateHeroTheme();
    console.log('🎨 Theme initialized:', isDarkMode ? 'Dark' : 'Light');
}

function toggleTheme() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('dashboard_theme', isDarkMode ? 'dark' : 'light');
    updateHeroTheme();
    showToast(`Switched to ${isDarkMode ? '🌙 Dark' : '☀️ Light'} mode`, 'info');
}

function updateHeroTheme() {
    // CSS handles the rest via body.dark-mode class
}

// ============================================
// STICKY NAV
// ============================================

function toggleNav() {
    const dropdown = document.getElementById('navDropdown');
    const toggle = document.getElementById('navToggle');
    if (dropdown) dropdown.classList.toggle('open');
    if (toggle) toggle.classList.toggle('active');
}

// Close nav when clicking outside
document.addEventListener('click', function(e) {
    const nav = document.getElementById('stickyNav');
    if (nav && !nav.contains(e.target)) {
        const dropdown = document.getElementById('navDropdown');
        const toggle = document.getElementById('navToggle');
        if (dropdown) dropdown.classList.remove('open');
        if (toggle) toggle.classList.remove('active');
    }
});

// ============================================
// NAVIGATION FUNCTIONS
// ============================================

window.goBack = function() {
    if (document.referrer && document.referrer.includes('/user')) {
        window.history.back();
    } else {
        window.location.href = '/user';
    }
};

window.goToHub = function() {
    window.location.href = '/hub';
};

window.reportIssue = function() {
    showToast('📝 Report an issue? Our team will investigate.', 'info');
};

window.goToContact = function() {
    window.location.href = '/contact';
};

// ============================================
// REFERRAL SYSTEM
// ============================================

// Generate unique referral code for user (persistent)
async function getUserReferralCode() {
    if (userReferralCode) return userReferralCode;
    
    try {
        // Check if user already has a referral code
        const { data, error } = await supabase
            .from('users')
            .select('referral_code')
            .eq('id', currentUser.id)
            .single();
        
        if (error) {
            console.warn('Could not fetch referral code:', error.message);
            return generateReferralCode();
        }
        
        if (data && data.referral_code) {
            userReferralCode = data.referral_code;
            return userReferralCode;
        }
        
        // Generate new code and save to database
        const newCode = generateReferralCode();
        const { error: updateError } = await supabase
            .from('users')
            .update({ referral_code: newCode })
            .eq('id', currentUser.id);
        
        if (updateError) {
            console.warn('Could not save referral code:', updateError.message);
            return newCode;
        }
        
        userReferralCode = newCode;
        return newCode;
        
    } catch (e) {
        console.warn('Error in getUserReferralCode:', e);
        return generateReferralCode();
    }
}

function generateReferralCode() {
    const userId = currentUser?.id || 'user';
    const shortId = userId.slice(-6);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `GLM-${shortId}-${random}`;
}

// Get referral link
function getReferralLink(code) {
    return `${window.location.origin}/signin?ref=${code}`;
}

// ============================================
// SHARE FUNCTIONALITY
// ============================================

window.shareCourse = async function() {
    const code = await getUserReferralCode();
    const referralLink = getReferralLink(code);
    
    // Show share modal
    document.getElementById('shareCode').textContent = code;
    document.getElementById('shareReferralLink').textContent = referralLink;
    document.getElementById('shareModal').classList.add('active');
    
    // Track share event
    trackShareEvent(code);
};

window.closeShareModal = function() {
    document.getElementById('shareModal').classList.remove('active');
};

window.copyShareCode = function() {
    const code = document.getElementById('shareCode').textContent;
    navigator.clipboard.writeText(code).then(() => {
        showToast('📋 Referral code copied!', 'success');
    }).catch(() => {
        const input = document.createElement('input');
        input.value = code;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('📋 Referral code copied!', 'success');
    });
};

window.copyReferralLink = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    navigator.clipboard.writeText(link).then(() => {
        showToast('🔗 Referral link copied!', 'success');
    }).catch(() => {
        const input = document.createElement('input');
        input.value = link;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('🔗 Referral link copied!', 'success');
    });
};

// Social Share Functions with Referral Link
window.shareOnWhatsApp = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    const text = `Join me on Gliimu and master video, design & code! 🚀 Use my referral link: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    trackSocialShare('whatsapp');
};

window.shareOnTwitter = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    const text = `Join me on Gliimu and master video, design & code! 🚀 Use my referral link: ${link}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
    trackSocialShare('twitter');
};

window.shareOnLinkedIn = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    window.open(`https://linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`, '_blank');
    trackSocialShare('linkedin');
};

window.shareOnFacebook = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    window.open(`https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, '_blank');
    trackSocialShare('facebook');
};

window.shareOnEmail = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    const subject = 'Join me on Gliimu!';
    const body = `I'm learning to become a Media Architect on Gliimu. Join me using my referral link: ${link}`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    trackSocialShare('email');
};

// Track share events for admin
async function trackShareEvent(code) {
    try {
        await supabase
            .from('referral_events')
            .insert({
                user_id: currentUser?.id,
                referral_code: code,
                shared_at: new Date().toISOString()
            });
        console.log('📊 Share tracked:', code);
    } catch (e) {
        console.warn('Could not track share:', e);
    }
}

async function trackSocialShare(platform) {
    try {
        const code = await getUserReferralCode();
        await supabase
            .from('referral_clicks')
            .insert({
                user_id: currentUser?.id,
                referral_code: code,
                platform: platform,
                clicked_at: new Date().toISOString()
            });
        console.log('📊 Social share tracked:', platform);
    } catch (e) {
        console.warn('Could not track social share:', e);
    }
}

// Track referral signups (called when someone signs up with a referral code)
async function trackReferralSignup(refCode, newUserId) {
    try {
        await supabase
            .from('referral_signups')
            .insert({
                referral_code: refCode,
                new_user_id: newUserId,
                signed_up_at: new Date().toISOString()
            });
        
        // Award GP to referrer
        const { data: referrer } = await supabase
            .from('users')
            .select('id')
            .eq('referral_code', refCode)
            .single();
        
        if (referrer) {
            // Add 50 GP to referrer
            await supabase.rpc('add_gp', {
                user_id: referrer.id,
                amount: 50,
                reason: `Referral: ${refCode}`
            });
        }
        
        console.log('📊 Referral signup tracked:', refCode);
    } catch (e) {
        console.warn('Could not track referral signup:', e);
    }
}

// ============================================
// ELECTIVE FUNCTIONS
// ============================================

window.openElectiveModal = function(electiveId) {
    const elective = electivesData.find(e => e.id === electiveId);
    if (!elective) return;
    
    currentElectiveId = electiveId;
    document.getElementById('electiveModalTitle').textContent = elective.title;
    document.getElementById('electiveModalDescription').textContent = elective.description || 'No description available.';
    document.getElementById('electiveModalModules').textContent = elective.modules || 0;
    document.getElementById('electiveModalIcon').textContent = '📚';
    
    document.getElementById('electiveModal').classList.add('active');
};

window.closeElectiveModal = function() {
    document.getElementById('electiveModal').classList.remove('active');
    currentElectiveId = null;
};

window.startElectiveFromModal = function() {
    const elective = electivesData.find(e => e.id === currentElectiveId);
    if (!elective) return;
    
    closeElectiveModal();
    showToast(`📚 Starting "${elective.title}"...`, 'success');
};

// ============================================
// ELECTIVES SCROLL
// ============================================

window.scrollElectives = function(direction) {
    const container = document.getElementById('electivesScroll');
    if (!container) return;
    
    const scrollAmount = container.clientWidth * 0.8;
    const targetScroll = container.scrollLeft + (direction * scrollAmount);
    
    container.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
    });
};

window.searchElectives = function(query) {
    searchQuery = query || '';
    renderElectives();
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📚 Learning Path initializing...');
    
    initTheme();
    document.getElementById('navToggle')?.addEventListener('click', toggleNav);
    
    isEmbedded = window.parent !== window;
    console.log('📱 Embedded mode:', isEmbedded);
    
    showLoading();
    
    try {
        currentUser = await getCurrentUser();
        console.log('👤 Current user:', currentUser?.email || 'Not signed in');
        
        if (!currentUser) {
            showLoginPrompt();
            return;
        }
        
        // Load referral code
        await getUserReferralCode();
        
        loadCurriculum();
        await loadElectives();
        await loadUserProgress();
        await loadUserStats();
        
        renderCurriculum();
        renderElectives();
        updateOverallStats();
        setupEventListeners();
        hideLoading();
        
        // Update scroll buttons after render
        setTimeout(updateScrollButtons, 300);
        
        console.log('✅ Learning Path loaded successfully');
        
    } catch (error) {
        console.error('❌ Error:', error);
        showError('Could not load your learning path.');
    }
});

function showLoading() {
    const container = document.getElementById('curriculumTimeline');
    if (container) {
        container.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading your learning path...</p>
            </div>
        `;
    }
    
    const electivesContainer = document.getElementById('electivesContainer');
    if (electivesContainer) {
        electivesContainer.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading electives...</p>
            </div>
        `;
    }
}

function hideLoading() {
    // Loading will be replaced by render
}

function showError(message) {
    const container = document.getElementById('curriculumTimeline');
    if (container) {
        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle" style="color: var(--danger); font-size: 2rem;"></i>
                <h3 style="margin-top: 1rem;">${message}</h3>
                <button onclick="location.reload()" class="btn-primary" style="margin-top: 1rem;">Retry</button>
            </div>
        `;
    }
}

function showLoginPrompt() {
    const container = document.getElementById('curriculumTimeline');
    if (container) {
        container.innerHTML = `
            <div class="login-prompt">
                <i class="fas fa-lock"></i>
                <h3>Sign In Required</h3>
                <p>Please sign in to track your learning progress and earn GP.</p>
                <button onclick="window.location.href='/signin.html'" class="btn-primary">Sign In</button>
            </div>
        `;
    }
}

async function getCurrentUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) return null;
        return user;
    } catch (e) {
        return null;
    }
}

function notifyParent(event, data) {
    if (isEmbedded) {
        try {
            window.parent.postMessage({ type: event, ...data }, '*');
        } catch (e) {}
    }
}

// ============================================
// LOAD DATA
// ============================================

function loadCurriculum() {
    curriculumData = [
        {
            id: 1,
            name: "Phase 1: Foundation",
            modules: [
                { id: 1, name: "Introduction to Media Technologies", desc: "Overview of the media landscape and career paths", duration: "2 hours", gp: 50, type: "foundation" },
                { id: 2, name: "Visual Storytelling Fundamentals", desc: "Understanding narrative structure and visual language", duration: "3 hours", gp: 50, type: "foundation" },
                { id: 3, name: "Design Principles", desc: "Color theory, typography, layout, and composition", duration: "4 hours", gp: 50, type: "foundation" },
                { id: 4, name: "Introduction to Programming", desc: "Basic coding concepts using JavaScript", duration: "5 hours", gp: 50, type: "foundation" }
            ]
        },
        {
            id: 2,
            name: "Phase 2: Core Skills",
            modules: [
                { id: 5, name: "Video Production & Cinematography", desc: "Camera operation, lighting, and audio recording", duration: "6 hours", gp: 75, type: "core" },
                { id: 6, name: "Post-Production & Editing", desc: "Adobe Premiere Pro, DaVinci Resolve, After Effects", duration: "8 hours", gp: 75, type: "core" },
                { id: 7, name: "UI/UX Design", desc: "Figma, prototyping, user research, accessibility", duration: "6 hours", gp: 75, type: "core" },
                { id: 8, name: "Web Development", desc: "HTML, CSS, JavaScript, responsive design", duration: "8 hours", gp: 75, type: "core" }
            ]
        },
        {
            id: 3,
            name: "Phase 3: Advanced",
            modules: [
                { id: 9, name: "Advanced Video Effects", desc: "VFX, motion graphics, 3D animation", duration: "8 hours", gp: 100, type: "advanced" },
                { id: 10, name: "Full-Stack Development", desc: "React, Node.js, databases, APIs", duration: "10 hours", gp: 100, type: "advanced" },
                { id: 11, name: "Brand Strategy & Management", desc: "Brand identity, marketing, social media", duration: "4 hours", gp: 100, type: "advanced" },
                { id: 12, name: "Portfolio Development", desc: "Building a professional portfolio", duration: "6 hours", gp: 100, type: "advanced" }
            ]
        },
        {
            id: 4,
            name: "Phase 4: Capstone",
            modules: [
                { id: 13, name: "Industry Project", desc: "Real-world client project with mentorship", duration: "20 hours", gp: 150, type: "capstone" },
                { id: 14, name: "Career Preparation", desc: "Resume building, interview skills, networking", duration: "4 hours", gp: 150, type: "capstone" },
                { id: 15, name: "Final Portfolio Review", desc: "Presentation to industry panel", duration: "3 hours", gp: 150, type: "capstone" }
            ]
        }
    ];
    console.log('📚 Curriculum loaded:', curriculumData.length, 'phases');
}

async function loadElectives() {
    try {
        const { data, error } = await supabase
            .from('elective_courses')
            .select('*')
            .eq('is_active', true)
            .order('title', { ascending: true });
        
        if (error) {
            console.warn('Could not load electives from database:', error.message);
            electivesData = getDefaultElectives();
            return;
        }
        
        if (data && data.length > 0) {
            electivesData = data;
        } else {
            electivesData = getDefaultElectives();
        }
        
        console.log('📚 Electives loaded:', electivesData.length);
        
    } catch (error) {
        console.error('Error loading electives:', error);
        electivesData = getDefaultElectives();
    }
}

function getDefaultElectives() {
    return [
        { id: 'e1', title: 'Financial Literacy', description: 'Learn budgeting, saving, investing, and financial planning.', modules: 6 },
        { id: 'e2', title: 'Public Speaking', description: 'Master the art of confident public speaking and presentation.', modules: 5 },
        { id: 'e3', title: 'Waste Management', description: 'Sustainable waste management and recycling practices.', modules: 4 },
        { id: 'e4', title: 'Logic & Critical Thinking', description: 'Develop analytical thinking, reasoning, and problem-solving skills.', modules: 6 },
        { id: 'e5', title: 'Problem Solving', description: 'Systematic approaches to solving complex problems.', modules: 5 }
    ];
}

async function loadUserProgress() {
    try {
        const { data, error } = await supabase
            .from('module_progress')
            .select('*')
            .eq('user_id', currentUser.id);
        
        if (error) {
            console.warn('Module progress error:', error.message);
            loadProgressFromLocalStorage();
            return;
        }
        
        if (data && data.length > 0) {
            userProgress = data;
            console.log('✅ Loaded', userProgress.length, 'progress items from database');
        } else {
            loadProgressFromLocalStorage();
        }
    } catch (error) {
        loadProgressFromLocalStorage();
    }
}

function loadProgressFromLocalStorage() {
    try {
        const saved = localStorage.getItem(`course_progress_${currentUser.id}`);
        if (saved) {
            userProgress = JSON.parse(saved);
            console.log('📂 Loaded progress from localStorage:', userProgress.length);
        } else {
            userProgress = [];
            console.log('📂 No saved progress found');
        }
    } catch (e) {
        userProgress = [];
    }
}

function saveProgressToLocalStorage() {
    try {
        localStorage.setItem(`course_progress_${currentUser.id}`, JSON.stringify(userProgress));
    } catch (e) {}
}

async function loadUserStats() {
    try {
        userGP = userProgress.reduce((total, p) => {
            if (p.completed) {
                for (const phase of curriculumData) {
                    const module = phase.modules.find(m => m.id === parseInt(p.module_id) || m.name === p.module_name);
                    if (module) {
                        return total + module.gp;
                    }
                }
            }
            return total;
        }, 0);
        
        userStreak = parseInt(localStorage.getItem(`course_streak_${currentUser.id}`)) || 0;
        
        document.getElementById('headerGP').textContent = userGP;
        document.getElementById('headerStreak').textContent = userStreak;
        document.getElementById('gpPoints').textContent = userGP;
        document.getElementById('streakDays').textContent = userStreak;
        updateHeroLevel(userGP);
        
        console.log('📊 Stats - GP:', userGP, 'Streak:', userStreak);
        
    } catch (error) {
        console.error('Error loading stats:', error);
        userGP = 0;
        userStreak = 0;
    }
}

function updateHeroLevel(gp) {
    const heroLevel = document.getElementById('heroLevel');
    const heroXP = document.getElementById('heroXP');
    
    if (!heroLevel) return;
    
    let level = '🌱 Starter';
    let xpText = `${gp || 0} GP`;
    
    if (gp >= 1500) level = '⭐ Ambassador';
    else if (gp >= 1000) level = '👑 Master';
    else if (gp >= 500) level = '🏆 Builder';
    else if (gp >= 250) level = '📚 Scholar';
    else if (gp >= 100) level = '🎓 Learner';
    
    heroLevel.textContent = level;
    if (heroXP) heroXP.textContent = xpText;
}

// ============================================
// RENDER FUNCTIONS
// ============================================

function renderCurriculum() {
    const container = document.getElementById('curriculumTimeline');
    if (!container) return;
    
    let totalModules = 0;
    let completedModules = 0;
    
    curriculumData.forEach(phase => {
        totalModules += phase.modules.length;
        phase.modules.forEach(module => {
            const isCompleted = userProgress.some(p => 
                (p.module_id === module.id.toString() || p.module_name === module.name) && p.completed
            );
            if (isCompleted) completedModules++;
        });
    });
    
    document.getElementById('totalModules').textContent = totalModules;
    document.getElementById('completedModules').textContent = completedModules;
    
    const percentComplete = totalModules > 0 ? (completedModules / totalModules) * 100 : 0;
    document.getElementById('progressPercent').textContent = `${Math.round(percentComplete)}%`;
    document.getElementById('overallProgressBar').style.width = `${percentComplete}%`;
    
    container.innerHTML = curriculumData.map((phase) => {
        const phaseCompleted = phase.modules.every(module => 
            userProgress.some(p => (p.module_id === module.id.toString() || p.module_name === module.name) && p.completed)
        );
        const phaseProgress = calculatePhaseProgress(phase);
        const isExpanded = expandedPhases.has(phase.id);
        
        return `
            <div class="phase-card ${isExpanded ? 'expanded' : ''}" data-phase="${phase.id}">
                <div class="phase-marker ${phaseCompleted ? 'completed' : ''}">
                    ${phaseCompleted ? '<i class="fas fa-check"></i>' : phase.id}
                </div>
                <div class="phase-content">
                    <div class="phase-header" onclick="togglePhase(${phase.id})">
                        <div class="phase-title">${phase.name}</div>
                        <div class="phase-stats">
                            <span><i class="fas fa-${phaseCompleted ? 'check-circle' : 'circle'}"></i> ${phaseProgress.completed}/${phase.modules.length} modules</span>
                            <div class="phase-progress">
                                <div class="phase-progress-fill" style="width: ${phaseProgress.percentage}%"></div>
                            </div>
                            <i class="fas fa-chevron-${isExpanded ? 'up' : 'down'}"></i>
                        </div>
                    </div>
                    <div class="phase-modules">
                        ${phase.modules.map(module => renderModuleItem(module)).join('')}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderModuleItem(module) {
    const isCompleted = userProgress.some(p => 
        (p.module_id === module.id.toString() || p.module_name === module.name) && p.completed
    );
    
    let statusClass = 'in-progress';
    let statusIcon = '<i class="fas fa-play"></i>';
    
    if (isCompleted) {
        statusClass = 'completed';
        statusIcon = '<i class="fas fa-check"></i>';
    }
    
    return `
        <div class="module-item" onclick="openModuleModal(${module.id})">
            <div class="module-status ${statusClass}">
                ${statusIcon}
            </div>
            <div class="module-info">
                <div class="module-name">${module.name}</div>
                <div class="module-meta">
                    <span><i class="fas fa-clock"></i> ${module.duration}</span>
                    <span class="module-gp"><i class="fas fa-star"></i> ${module.gp} GP</span>
                </div>
            </div>
            <button class="module-action" onclick="event.stopPropagation(); completeModule(${module.id})" ${isCompleted ? 'disabled' : ''}>
                <i class="fas fa-${isCompleted ? 'check' : 'arrow-right'}"></i>
            </button>
        </div>
    `;
}

function calculatePhaseProgress(phase) {
    let completed = 0;
    phase.modules.forEach(module => {
        const isCompleted = userProgress.some(p => 
            (p.module_id === module.id.toString() || p.module_name === module.name) && p.completed
        );
        if (isCompleted) completed++;
    });
    const percentage = phase.modules.length > 0 ? (completed / phase.modules.length) * 100 : 0;
    return { completed, percentage };
}

// ============================================
// ELECTIVES RENDER
// ============================================

function renderElectives() {
    const container = document.getElementById('electivesContainer');
    if (!container) return;
    
    let filteredElectives = electivesData;
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        filteredElectives = electivesData.filter(e => 
            e.title.toLowerCase().includes(q) || 
            (e.description && e.description.toLowerCase().includes(q))
        );
    }
    
    if (filteredElectives.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="min-width:200px; text-align:center; padding:20px;">
                <i class="fas fa-search" style="font-size:1.5rem; color:var(--text-secondary);"></i>
                <h3 style="font-size:0.9rem; margin-top:8px;">No Electives Found</h3>
                <p style="font-size:0.75rem; color:var(--text-secondary);">${searchQuery ? `No results for "${searchQuery}"` : 'No electives available.'}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredElectives.map((elective, index) => {
        const cardType = index % 2 === 0 ? 'pattern-card' : 'plane-card';
        
        return `
            <div class="elective-card ${cardType}" onclick="window.openElectiveModal('${elective.id}')">
                <div class="elective-title">${elective.title}</div>
                <div class="elective-meta"><i class="fas fa-layer-group"></i> ${elective.modules || 0} modules</div>
                <div class="elective-desc">${elective.description || 'No description'}</div>
                <button class="elective-start-btn" onclick="event.stopPropagation(); window.openElectiveModal('${elective.id}')">
                    <i class="fas fa-play"></i> Start
                </button>
            </div>
        `;
    }).join('');
    
    updateScrollButtons();
}

function updateScrollButtons() {
    const container = document.getElementById('electivesScroll');
    const leftBtn = document.getElementById('scrollLeft');
    const rightBtn = document.getElementById('scrollRight');
    
    if (!container || !leftBtn || !rightBtn) return;
    
    const needsScroll = container.scrollWidth > container.clientWidth;
    if (!needsScroll) {
        leftBtn.style.display = 'none';
        rightBtn.style.display = 'none';
        return;
    }
    
    leftBtn.style.display = 'flex';
    rightBtn.style.display = 'flex';
    leftBtn.disabled = container.scrollLeft <= 0;
    rightBtn.disabled = container.scrollLeft >= container.scrollWidth - container.clientWidth - 5;
}

// ============================================
// MODULE COMPLETION
// ============================================

async function completeModule(moduleId) {
    let module = null;
    for (const phase of curriculumData) {
        const found = phase.modules.find(m => m.id === moduleId);
        if (found) {
            module = found;
            break;
        }
    }
    
    if (!module) return;
    
    const alreadyCompleted = userProgress.some(p => 
        (p.module_id === moduleId.toString() || p.module_name === module.name) && p.completed
    );
    
    if (alreadyCompleted) {
        showToast('Module already completed!', 'info');
        return;
    }
    
    showToast(`Completing "${module.name}"...`, 'info');
    
    try {
        const { error } = await supabase
            .from('module_progress')
            .insert({
                user_id: currentUser.id,
                module_id: moduleId.toString(),
                module_name: module.name,
                completed: true,
                completed_at: new Date().toISOString(),
                xp_earned: module.gp
            });
        
        if (error) {
            console.warn('DB error:', error.message);
            userProgress.push({
                module_id: moduleId.toString(),
                module_name: module.name,
                completed: true
            });
            saveProgressToLocalStorage();
        } else {
            userProgress.push({
                module_id: moduleId.toString(),
                module_name: module.name,
                completed: true
            });
            saveProgressToLocalStorage();
        }
        
        userGP += module.gp;
        document.getElementById('headerGP').textContent = userGP;
        document.getElementById('gpPoints').textContent = userGP;
        updateHeroLevel(userGP);
        
        userStreak = Math.min(userStreak + 1, 30);
        localStorage.setItem(`course_streak_${currentUser.id}`, userStreak.toString());
        document.getElementById('headerStreak').textContent = userStreak;
        document.getElementById('streakDays').textContent = userStreak;
        
        notifyParent('moduleCompleted', {
            moduleId: module.id,
            moduleName: module.name,
            gpEarned: module.gp,
            newTotalGP: userGP
        });
        
        celebrateCompletion(module);
        renderCurriculum();
        updateOverallStats();
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Failed to mark module complete', 'error');
    }
}

function celebrateCompletion(module) {
    showToast(`🎉 +${module.gp} GP earned for "${module.name}"!`, 'success');
    triggerConfetti();
}

function triggerConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const particles = [];
    const colors = ['#fbb040', '#2c2f78', '#10b981', '#ef4444', '#3b82f6'];
    
    for (let i = 0; i < 150; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 8 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            speedY: Math.random() * 5 + 3,
            speedX: (Math.random() - 0.5) * 3,
            rotation: Math.random() * 360
        });
    }
    
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let anyVisible = false;
        
        for (const p of particles) {
            p.y += p.speedY;
            p.x += p.speedX;
            p.rotation += 5;
            
            if (p.y < canvas.height + 50) {
                anyVisible = true;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            }
        }
        
        if (anyVisible) {
            requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.style.display = 'none';
        }
    }
    
    animate();
    setTimeout(() => { canvas.style.display = 'none'; }, 3000);
}

// ============================================
// UI HELPERS
// ============================================

window.togglePhase = function(phaseId) {
    if (expandedPhases.has(phaseId)) {
        expandedPhases.delete(phaseId);
    } else {
        expandedPhases.add(phaseId);
    }
    renderCurriculum();
};

window.openModuleModal = function(moduleId) {
    let module = null;
    for (const phase of curriculumData) {
        const found = phase.modules.find(m => m.id === moduleId);
        if (found) {
            module = found;
            break;
        }
    }
    
    if (!module) return;
    
    const isCompleted = userProgress.some(p => 
        (p.module_id === module.id.toString() || p.module_name === module.name) && p.completed
    );
    
    document.getElementById('modalTitle').textContent = module.name;
    document.getElementById('modalDescription').textContent = module.desc;
    document.getElementById('modalDuration').textContent = module.duration;
    document.getElementById('modalGP').textContent = `${module.gp} GP`;
    document.getElementById('modalIcon').innerHTML = `<i class="fas fa-${getModuleIcon(module)}"></i>`;
    
    const completeBtn = document.getElementById('modalCompleteBtn');
    if (completeBtn) {
        if (isCompleted) {
            completeBtn.disabled = true;
            completeBtn.textContent = 'Completed ✓';
            completeBtn.style.opacity = '0.5';
        } else {
            completeBtn.disabled = false;
            completeBtn.textContent = 'Mark Complete';
            completeBtn.style.opacity = '1';
            completeBtn.onclick = () => {
                completeModule(module.id);
                closeModuleModal();
            };
        }
    }
    
    document.getElementById('moduleModal').classList.add('active');
};

window.closeModuleModal = function() {
    document.getElementById('moduleModal').classList.remove('active');
};

window.completeModuleFromModal = function() {
    const completeBtn = document.getElementById('modalCompleteBtn');
    if (completeBtn && !completeBtn.disabled) {
        completeBtn.click();
    }
};

function getModuleIcon(module) {
    if (module.name.includes('Video') || module.name.includes('Cinematography')) return 'video';
    if (module.name.includes('Design')) return 'palette';
    if (module.name.includes('Development') || module.name.includes('Programming')) return 'code';
    if (module.name.includes('Project')) return 'rocket';
    return 'book-open';
}

function updateOverallStats() {
    const totalModules = curriculumData.reduce((sum, p) => sum + p.modules.length, 0);
    const completedModules = userProgress.filter(p => p.completed).length;
    const percentComplete = totalModules > 0 ? (completedModules / totalModules) * 100 : 0;
    
    document.getElementById('totalModules').textContent = totalModules;
    document.getElementById('completedModules').textContent = completedModules;
    document.getElementById('progressPercent').textContent = `${Math.round(percentComplete)}%`;
    document.getElementById('overallProgressBar').style.width = `${percentComplete}%`;
}

function setupEventListeners() {
    const modal = document.getElementById('moduleModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModuleModal();
        });
    }
    
    const electiveModal = document.getElementById('electiveModal');
    if (electiveModal) {
        electiveModal.addEventListener('click', (e) => {
            if (e.target === electiveModal) closeElectiveModal();
        });
    }
    
    const shareModal = document.getElementById('shareModal');
    if (shareModal) {
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) closeShareModal();
        });
    }
    
    // Scroll container listener
    const scrollContainer = document.getElementById('electivesScroll');
    if (scrollContainer) {
        scrollContainer.addEventListener('scroll', updateScrollButtons);
        window.addEventListener('resize', updateScrollButtons);
    }
}

// ============================================
// EXPOSE GLOBALLY
// ============================================

window.togglePhase = togglePhase;
window.openModuleModal = openModuleModal;
window.closeModuleModal = closeModuleModal;
window.completeModule = completeModule;
window.completeModuleFromModal = completeModuleFromModal;
window.openElectiveModal = openElectiveModal;
window.closeElectiveModal = closeElectiveModal;
window.startElectiveFromModal = startElectiveFromModal;
window.scrollElectives = scrollElectives;
window.searchElectives = searchElectives;
window.goBack = goBack;
window.goToHub = goToHub;
window.goToContact = goToContact;
window.reportIssue = reportIssue;
window.shareCourse = shareCourse;
window.closeShareModal = closeShareModal;
window.copyShareCode = copyShareCode;
window.copyReferralLink = copyReferralLink;
window.shareOnWhatsApp = shareOnWhatsApp;
window.shareOnTwitter = shareOnTwitter;
window.shareOnLinkedIn = shareOnLinkedIn;
window.shareOnFacebook = shareOnFacebook;
window.shareOnEmail = shareOnEmail;

console.log('📚 Learning Path ready');
