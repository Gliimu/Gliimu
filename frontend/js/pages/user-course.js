// ============================================
// USER COURSE - Gamified Learning Path
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

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
let isEmbedded = false;
let isLoading = true;

// GP values for different module types
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
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📚 User Course initializing...');
    
    // Check if embedded in iframe
    isEmbedded = window.parent !== window;
    console.log('📱 Embedded mode:', isEmbedded);
    
    // Show loading state
    showLoading();
    
    try {
        // Get current user
        currentUser = await getCurrentUser();
        console.log('👤 Current user:', currentUser?.email || 'Not signed in');
        
        if (!currentUser) {
            showLoginPrompt();
            return;
        }
        
        // Load curriculum (static data - always works)
        loadCurriculum();
        
        // Try to load user progress (handles missing tables gracefully)
        await loadUserProgress();
        
        // Try to load user stats (handles missing tables gracefully)
        await loadUserStats();
        
        // Try to load leaderboard (handles missing tables gracefully)
        await loadLeaderboard();
        
        // Check achievements
        await checkAchievements();
        
        // Render everything
        renderCurriculum();
        renderAchievements();
        updateOverallStats();
        
        // Setup event listeners
        setupEventListeners();
        
        // Hide loading
        hideLoading();
        
        console.log('✅ User Course loaded successfully');
        
    } catch (error) {
        console.error('❌ Error initializing course:', error);
        showError('Could not load your learning path. Please try again.');
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
    isLoading = false;
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

// ============================================
// GET CURRENT USER
// ============================================

async function getCurrentUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
            console.error('Error getting user:', error);
            return null;
        }
        return user;
    } catch (e) {
        console.error('Error in getCurrentUser:', e);
        return null;
    }
}

// ============================================
// NOTIFY PARENT DASHBOARD (if embedded)
// ============================================

function notifyParent(event, data) {
    if (isEmbedded) {
        try {
            window.parent.postMessage({ type: event, ...data }, '*');
            console.log('📤 Sent message to parent:', event, data);
        } catch (e) {
            console.warn('Could not send message to parent:', e);
        }
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

async function loadUserProgress() {
    try {
        // Check if table exists by trying to query it
        const { data, error } = await supabase
            .from('module_progress')
            .select('*')
            .eq('user_id', currentUser.id);
        
        if (error) {
            // Table might not exist - use localStorage fallback
            console.warn('⚠️ module_progress table error:', error.message);
            loadProgressFromLocalStorage();
            return;
        }
        
        if (data && data.length > 0) {
            userProgress = data;
            console.log('✅ Loaded', userProgress.length, 'progress items from database');
        } else {
            // No progress yet - check localStorage
            loadProgressFromLocalStorage();
        }
    } catch (error) {
        console.error('❌ Error loading progress:', error);
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
        // Calculate GP from completed modules
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
        
        // Calculate streak (simplified - from localStorage)
        userStreak = parseInt(localStorage.getItem(`course_streak_${currentUser.id}`)) || 0;
        
        // Update UI
        document.getElementById('gpPoints').textContent = userGP;
        document.getElementById('streakDays').textContent = userStreak;
        
        console.log('📊 Stats loaded - GP:', userGP, 'Streak:', userStreak);
        
    } catch (error) {
        console.error('Error loading stats:', error);
        userGP = 0;
        userStreak = 0;
    }
}

async function loadLeaderboard() {
    try {
        // Try to get from database
        const { data, error } = await supabase
            .from('user_stats')
            .select('user_id, total_gp, users(name)')
            .order('total_gp', { ascending: false })
            .limit(5);
        
        if (!error && data && data.length > 0) {
            renderLeaderboard(data);
            return;
        }
        
        // Fallback to mock data
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
        // Render empty leaderboard
        const container = document.getElementById('leaderboardList');
        if (container) {
            container.innerHTML = `
                <div class="leaderboard-item">
                    <span style="color: var(--text-secondary); font-size: 0.8rem;">Leaderboard coming soon...</span>
                </div>
            `;
        }
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
            <div class="leaderboard-gp">${user.gp || user.total_gp || 0} GP</div>
        </div>
    `).join('');
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
        // Save to Supabase if table exists
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
                console.warn('Could not save to database, saving locally:', error.message);
                // Fallback to localStorage
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
        } catch (dbError) {
            console.warn('Database error, saving locally:', dbError);
            userProgress.push({
                module_id: moduleId.toString(),
                module_name: module.name,
                completed: true
            });
            saveProgressToLocalStorage();
        }
        
        // Update GP
        userGP += module.gp;
        document.getElementById('gpPoints').textContent = userGP;
        
        // Update streak
        userStreak = Math.min(userStreak + 1, 30);
        localStorage.setItem(`course_streak_${currentUser.id}`, userStreak.toString());
        document.getElementById('streakDays').textContent = userStreak;
        
        // Notify parent dashboard
        notifyParent('moduleCompleted', {
            moduleId: module.id,
            moduleName: module.name,
            gpEarned: module.gp,
            newTotalGP: userGP
        });
        
        // Celebrate
        celebrateCompletion(module);
        
        // Re-render
        renderCurriculum();
        updateOverallStats();
        await checkAchievements();
        renderAchievements();
        await loadLeaderboard();
        
    } catch (error) {
        console.error('Error completing module:', error);
        showToast('Failed to mark module complete', 'error');
    }
}

function celebrateCompletion(module) {
    showToast(`🎉 +${module.gp} GP earned for completing "${module.name}"!`, 'success');
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
        
        if (earned && !window._unlockedAchievements?.includes(achievement.id)) {
            await unlockAchievement(achievement);
        }
    }
}

async function unlockAchievement(achievement) {
    if (!window._unlockedAchievements) window._unlockedAchievements = [];
    if (window._unlockedAchievements.includes(achievement.id)) return;
    
    window._unlockedAchievements.push(achievement.id);
    
    showToast(`🏆 Achievement Unlocked: ${achievement.name}! +${achievement.gp} GP`, 'success');
    
    userGP += achievement.gp;
    document.getElementById('gpPoints').textContent = userGP;
    
    notifyParent('achievementUnlocked', {
        achievementId: achievement.id,
        achievementName: achievement.name,
        gpEarned: achievement.gp,
        newTotalGP: userGP
    });
    
    renderAchievements();
}

function checkAchievementUnlocked(achievement) {
    if (achievement.id === 'first_step' && userProgress.length > 0) return true;
    if (achievement.id === 'gp_hunter' && userGP >= 1000) return true;
    if (achievement.id === 'phase_master') {
        for (const phase of curriculumData) {
            const phaseCompleted = phase.modules.every(m => 
                userProgress.some(p => (p.module_id === m.id.toString() || p.module_name === m.name) && p.completed)
            );
            if (phaseCompleted) return true;
        }
    }
    if (achievement.id === 'streak_7' && userStreak >= 7) return true;
    if (achievement.id === 'completionist') {
        const totalModules = curriculumData.reduce((sum, p) => sum + p.modules.length, 0);
        return userProgress.filter(p => p.completed).length === totalModules;
    }
    return false;
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

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    const modal = document.getElementById('moduleModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModuleModal();
        });
    }
}

// ============================================
// TOAST (Fallback)
// ============================================

function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
        return;
    }
    
    const existing = document.querySelector('.reader-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `reader-toast ${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: #fff;
        color: #333;
        padding: 0.75rem 1.5rem;
        border-radius: 12px;
        border: 1px solid #ddd;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        z-index: 999;
        font-size: 0.85rem;
        font-family: 'Space Grotesk', sans-serif;
        max-width: 90%;
        border-left: 4px solid #fbb040;
        animation: slideUp 0.3s ease;
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// EXPOSE GLOBALLY
// ============================================

window.togglePhase = togglePhase;
window.openModuleModal = openModuleModal;
window.closeModuleModal = closeModuleModal;
window.completeModule = completeModule;
window.completeModuleFromModal = completeModuleFromModal;

console.log('📚 User Course ready');
