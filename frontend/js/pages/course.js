// ============================================
// GAMIFIED LEARNING PATH - course.js
// Supports both standalone and embedded mode
// ============================================

import { supabase, getCurrentUser } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// DETECT EMBEDDED MODE
// ============================================

const isEmbedded = window.parent !== window;
const isInIframe = window !== window.top;

console.log('📚 Course page loaded');
console.log('📱 Embedded mode:', isEmbedded || isInIframe);

// ============================================
// GLOBAL STATE
// ============================================

let currentUser = null;
let curriculumData = [];
let userProgress = [];
let userGP = 0;
let userStreak = 0;
let achievements = [];
let expandedPhases = new Set();
let isInitialized = false;

// XP values for different module types (now called GP - Gliimu Points)
const GP_VALUES = {
    'foundation': 50,
    'core': 75,
    'advanced': 100,
    'capstone': 150
};

// Achievement definitions
const ACHIEVEMENTS = [
    { id: 'first_step', name: 'First Step', icon: 'fa-shoe-prints', desc: 'Complete your first module', gp: 50 },
    { id: 'phase_master', name: 'Phase Master', icon: 'fa-trophy', desc: 'Complete an entire phase', gp: 200 },
    { id: 'streak_7', name: 'Consistency King', icon: 'fa-calendar-check', desc: '7 day learning streak', gp: 100 },
    { id: 'gp_hunter', name: 'GP Hunter', icon: 'fa-bolt', desc: 'Earn 1000 GP', gp: 150 },
    { id: 'completionist', name: 'Completionist', icon: 'fa-crown', desc: 'Complete all modules', gp: 500 }
];

// ============================================
// NOTIFY PARENT DASHBOARD
// ============================================

function notifyParent(event, data) {
    if (isEmbedded || isInIframe) {
        try {
            window.parent.postMessage({ type: event, ...data }, '*');
            console.log('📤 Sent message to parent:', event, data);
        } catch (e) {
            console.warn('Could not send message to parent:', e);
        }
    }
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎮 Gamified Learning Path initializing...');
    
    // Show loading state
    showLoading();
    
    // Get current user
    currentUser = await getCurrentUser();
    
    if (!currentUser) {
        showLoginPrompt();
        return;
    }
    
    console.log('👤 User loaded:', currentUser.email);
    
    // Load data
    await loadCurriculum();
    await loadUserProgress();
    await loadUserStats();
    await loadLeaderboard();
    await checkAchievements();
    
    // Render everything
    renderCurriculum();
    renderAchievements();
    setupEventListeners();
    updateOverallStats();
    
    // Hide loading
    hideLoading();
    isInitialized = true;
    
    // If embedded, notify parent that course is ready
    if (isEmbedded || isInIframe) {
        notifyParent('courseReady', { 
            userId: currentUser.id,
            totalGP: userGP,
            modulesCompleted: userProgress.filter(p => p.completed).length
        });
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
}

function hideLoading() {
    // Loading will be replaced by render
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

// ============================================
// LOAD DATA
// ============================================

async function loadCurriculum() {
    // Static curriculum data (can be moved to database later)
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
}

async function loadUserProgress() {
    try {
        // Try to load from Supabase
        const { data, error } = await supabase
            .from('module_progress')
            .select('*')
            .eq('user_id', currentUser.id);
        
        if (!error && data && data.length > 0) {
            userProgress = data;
            console.log('📊 Loaded progress from Supabase:', userProgress.length, 'records');
            return;
        }
        
        // Fallback to localStorage
        const localKey = `module_progress_${currentUser.id}`;
        const localData = localStorage.getItem(localKey);
        if (localData) {
            userProgress = JSON.parse(localData);
            console.log('📊 Loaded progress from localStorage:', userProgress.length, 'records');
            return;
        }
        
        userProgress = [];
        console.log('📊 No progress found, starting fresh');
        
    } catch (error) {
        console.error('Error loading progress:', error);
        userProgress = [];
    }
}

async function loadUserStats() {
    try {
        // Calculate GP from completed modules
        userGP = 0;
        userProgress.forEach(p => {
            if (p.completed) {
                // Find module GP
                for (const phase of curriculumData) {
                    const module = phase.modules.find(m => m.id === parseInt(p.module_id) || m.name === p.module_name);
                    if (module) {
                        userGP += module.gp;
                    }
                }
            }
        });
        
        // Calculate streak (simplified)
        userStreak = await calculateStreak();
        
        // Update UI
        const gpDisplay = document.getElementById('gpPoints');
        if (gpDisplay) gpDisplay.textContent = userGP;
        
        const streakDisplay = document.getElementById('streakDays');
        if (streakDisplay) streakDisplay.textContent = userStreak;
        
        console.log('📊 GP:', userGP, 'Streak:', userStreak);
        
    } catch (error) {
        console.error('Error loading user stats:', error);
    }
}

async function calculateStreak() {
    // For now, return mock streak
    // In production, track daily logins and completions
    try {
        const localKey = `streak_${currentUser.id}`;
        const streakData = localStorage.getItem(localKey);
        if (streakData) {
            return parseInt(streakData) || 3;
        }
        return 3;
    } catch (e) {
        return 3;
    }
}

async function loadLeaderboard() {
    try {
        const { data, error } = await supabase
            .from('user_stats')
            .select('user_id, total_gp, users(name)')
            .order('total_gp', { ascending: false })
            .limit(5);
        
        if (!error && data && data.length > 0) {
            renderLeaderboard(data);
            return;
        }
        
        // Mock leaderboard
        const mockLeaderboard = [
            { name: 'Michael Chen', gp: 2450 },
            { name: 'Sarah Johnson', gp: 2100 },
            { name: 'David Okafor', gp: 1890 },
            { name: 'Zoe Williams', gp: 1670 },
            { name: 'Alex Hunter', gp: 1450 }
        ];
        renderLeaderboard(mockLeaderboard);
        
    } catch (error) {
        console.error('Error loading leaderboard:', error);
    }
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
    
    const totalEl = document.getElementById('totalModules');
    if (totalEl) totalEl.textContent = totalModules;
    
    const completedEl = document.getElementById('completedModules');
    if (completedEl) completedEl.textContent = completedModules;
    
    const percentComplete = totalModules > 0 ? (completedModules / totalModules) * 100 : 0;
    const percentEl = document.getElementById('progressPercent');
    if (percentEl) percentEl.textContent = `${Math.round(percentComplete)}%`;
    
    const progressBar = document.getElementById('overallProgressBar');
    if (progressBar) progressBar.style.width = `${percentComplete}%`;
    
    container.innerHTML = curriculumData.map((phase, phaseIndex) => {
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
                    <div class="phase-header" onclick="window.togglePhase(${phase.id})">
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
    const isLocked = checkModuleLock(module);
    
    let statusClass = 'locked';
    let statusIcon = '<i class="fas fa-lock"></i>';
    
    if (isCompleted) {
        statusClass = 'completed';
        statusIcon = '<i class="fas fa-check"></i>';
    } else if (!isLocked) {
        statusClass = 'in-progress';
        statusIcon = '<i class="fas fa-play"></i>';
    }
    
    return `
        <div class="module-item" onclick="window.openModuleModal(${module.id})">
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
            <button class="module-action" onclick="event.stopPropagation(); window.completeModule(${module.id})" ${isCompleted ? 'disabled' : ''}>
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

function checkModuleLock(module) {
    // Check if previous modules are completed
    // For now, all modules are unlocked
    return false;
}

function renderAchievements() {
    const container = document.getElementById('achievementsGrid');
    if (!container) return;
    
    container.innerHTML = ACHIEVEMENTS.map(achievement => {
        const isUnlocked = checkAchievementUnlocked(achievement);
        return `
            <div class="achievement-card ${isUnlocked ? 'unlocked' : ''}">
                <div class="achievement-icon ${!isUnlocked ? 'achievement-locked' : ''}">
                    <i class="fas ${achievement.icon}"></i>
                </div>
                <div class="achievement-name">${achievement.name}</div>
                <div class="achievement-desc">${achievement.desc}</div>
                ${!isUnlocked ? '<div class="achievement-locked-badge"><i class="fas fa-lock"></i></div>' : ''}
            </div>
        `;
    }).join('');
}

function renderLeaderboard(users) {
    const container = document.getElementById('leaderboardList');
    if (!container) return;
    
    container.innerHTML = users.map((user, index) => `
        <div class="leaderboard-item">
            <div class="leaderboard-rank">#${index + 1}</div>
            <div class="leaderboard-avatar">
                <i class="fas fa-user-circle"></i>
            </div>
            <div class="leaderboard-name">${user.name || 'User'}</div>
            <div class="leaderboard-gp">${user.gp || user.total_gp} GP</div>
        </div>
    `).join('');
}

// ============================================
// PROGRESS & GP FUNCTIONS
// ============================================

window.completeModule = async function(moduleId) {
    // Find module
    let module = null;
    let phaseName = '';
    for (const phase of curriculumData) {
        const found = phase.modules.find(m => m.id === moduleId);
        if (found) {
            module = found;
            phaseName = phase.name;
            break;
        }
    }
    
    if (!module) {
        showToast('Module not found', 'error');
        return;
    }
    
    // Check if already completed
    const alreadyCompleted = userProgress.some(p => 
        (p.module_id === moduleId.toString() || p.module_name === module.name) && p.completed
    );
    
    if (alreadyCompleted) {
        showToast('Module already completed!', 'info');
        return;
    }
    
    // Show loading
    showToast(`Completing "${module.name}"...`, 'info');
    
    // Save progress
    try {
        // Save to Supabase
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
            console.warn('Supabase save error, using localStorage:', error);
            // Fallback to localStorage
            const localKey = `module_progress_${currentUser.id}`;
            const localData = localStorage.getItem(localKey);
            const progress = localData ? JSON.parse(localData) : [];
            progress.push({
                module_id: moduleId.toString(),
                module_name: module.name,
                completed: true,
                completed_at: new Date().toISOString(),
                xp_earned: module.gp
            });
            localStorage.setItem(localKey, JSON.stringify(progress));
        }
        
        // Update local state
        userProgress.push({
            module_id: moduleId.toString(),
            module_name: module.name,
            completed: true
        });
        
        // Add GP
        userGP += module.gp;
        
        // Update GP display
        const gpDisplay = document.getElementById('gpPoints');
        if (gpDisplay) gpDisplay.textContent = userGP;
        
        // Save streak
        localStorage.setItem(`streak_${currentUser.id}`, (userStreak + 1).toString());
        
        // Show celebration
        celebrateCompletion(module);
        
        // Update UI
        renderCurriculum();
        updateOverallStats();
        
        // Check for achievements
        await checkAchievements();
        
        // Update leaderboard
        await loadLeaderboard();
        
        // NOTIFY PARENT DASHBOARD (CRITICAL FOR IFRAME)
        notifyParent('moduleCompleted', {
            moduleId: module.id,
            moduleName: module.name,
            gpEarned: module.gp,
            newTotalGP: userGP
        });
        
    } catch (error) {
        console.error('Error completing module:', error);
        showToast('Failed to mark module complete', 'error');
    }
};

function celebrateCompletion(module) {
    // Show toast with GP gain
    showToast(`🎉 +${module.gp} GP earned for completing "${module.name}"!`, 'success');
    
    // Trigger confetti effect
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
    
    setTimeout(() => {
        canvas.style.display = 'none';
    }, 3000);
}

async function checkAchievements() {
    const completedCount = userProgress.filter(p => p.completed).length;
    const totalModules = curriculumData.reduce((sum, p) => sum + p.modules.length, 0);
    
    for (const achievement of ACHIEVEMENTS) {
        let earned = false;
        
        switch (achievement.id) {
            case 'first_step':
                earned = completedCount >= 1;
                break;
            case 'phase_master':
                for (const phase of curriculumData) {
                    const phaseCompleted = phase.modules.every(m => 
                        userProgress.some(p => (p.module_id === m.id.toString() || p.module_name === m.name) && p.completed)
                    );
                    if (phaseCompleted) earned = true;
                }
                break;
            case 'streak_7':
                earned = userStreak >= 7;
                break;
            case 'gp_hunter':
                earned = userGP >= 1000;
                break;
            case 'completionist':
                earned = completedCount === totalModules;
                break;
        }
        
        if (earned) {
            // Check if already unlocked
            const key = `achievement_${achievement.id}_${currentUser.id}`;
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, 'true');
                await unlockAchievement(achievement);
            }
        }
    }
}

async function unlockAchievement(achievement) {
    showToast(`🏆 Achievement Unlocked: ${achievement.name}! +${achievement.gp} GP`, 'success');
    
    // Add GP for achievement
    userGP += achievement.gp;
    const gpDisplay = document.getElementById('gpPoints');
    if (gpDisplay) gpDisplay.textContent = userGP;
    
    // Notify parent
    notifyParent('achievementUnlocked', {
        achievementId: achievement.id,
        achievementName: achievement.name,
        gpEarned: achievement.gp,
        newTotalGP: userGP
    });
    
    // Save to database
    try {
        await supabase
            .from('user_achievements')
            .insert({
                user_id: currentUser.id,
                achievement_id: achievement.id,
                unlocked_at: new Date().toISOString()
            });
    } catch (error) {
        console.error('Error saving achievement:', error);
    }
    
    // Re-render achievements
    renderAchievements();
}

function checkAchievementUnlocked(achievement) {
    const key = `achievement_${achievement.id}_${currentUser.id}`;
    return localStorage.getItem(key) === 'true';
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
                window.completeModule(module.id);
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
    const modal = document.getElementById('moduleModal');
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
    
    const totalEl = document.getElementById('totalModules');
    if (totalEl) totalEl.textContent = totalModules;
    
    const completedEl = document.getElementById('completedModules');
    if (completedEl) completedEl.textContent = completedModules;
    
    const percentEl = document.getElementById('progressPercent');
    if (percentEl) percentEl.textContent = `${Math.round(percentComplete)}%`;
    
    const progressBar = document.getElementById('overallProgressBar');
    if (progressBar) progressBar.style.width = `${percentComplete}%`;
}

// ============================================
// TOAST SYSTEM
// ============================================

function showToast(message, type = 'info') {
    // Use the global toast if available
    if (typeof showToast === 'function' && window.parent !== window) {
        // Use parent's toast if embedded
        try {
            window.parent.postMessage({ 
                type: 'toast', 
                message: message,
                toastType: type 
            }, '*');
        } catch (e) {}
    }
    
    // Also show in-page toast
    const existing = document.querySelector('.course-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `course-toast ${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-card);
        color: var(--text-primary);
        padding: 0.75rem 1.5rem;
        border-radius: 12px;
        border: 1px solid var(--border-color);
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        z-index: 1000;
        font-size: 0.85rem;
        animation: slideUp 0.3s ease;
        max-width: 90%;
        border-left: 4px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#fbb040'};
        font-family: 'Space Grotesk', sans-serif;
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add toast styles if not present
if (!document.getElementById('courseToastStyles')) {
    const style = document.createElement('style');
    style.id = 'courseToastStyles';
    style.textContent = `
        @keyframes slideUp {
            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `;
    document.head.appendChild(style);
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Close modal on outside click
    const modal = document.getElementById('moduleModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) window.closeModuleModal();
        });
    }
    
    // Handle resize for embedded mode
    if (isEmbedded || isInIframe) {
        window.addEventListener('resize', () => {
            // Adjust layout if needed
        });
    }
}

// ============================================
// EXPOSE GLOBALLY
// ============================================

window.togglePhase = window.togglePhase;
window.openModuleModal = window.openModuleModal;
window.closeModuleModal = window.closeModuleModal;
window.completeModule = window.completeModule;
window.completeModuleFromModal = window.completeModuleFromModal;

console.log('🎮 Gamified Learning Path ready');
console.log('📱 Embedded mode:', isEmbedded || isInIframe);
