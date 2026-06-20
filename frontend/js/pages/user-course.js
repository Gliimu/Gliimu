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
let expandedElectives = new Set();
let isEmbedded = false;
let searchQuery = '';

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📚 Learning Path initializing...');
    
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
        
        loadCurriculum();
        await loadElectives();
        await loadUserProgress();
        await loadUserStats();
        
        renderCurriculum();
        renderElectives();
        updateOverallStats();
        setupEventListeners();
        hideLoading();
        
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
}

function hideLoading() {}

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
        // Try to load from database
        const { data, error } = await supabase
            .from('elective_courses')
            .select('*')
            .eq('is_active', true)
            .order('title', { ascending: true });
        
        if (error) {
            console.warn('Could not load electives from database:', error.message);
            // Use default electives
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
        { id: 'e1', title: 'Financial Literacy', description: 'Learn budgeting, saving, investing, and financial planning.', icon: 'fa-coins', modules: 6 },
        { id: 'e2', title: 'Public Speaking', description: 'Master the art of confident public speaking and presentation.', icon: 'fa-microphone', modules: 5 },
        { id: 'e3', title: 'Waste Management', description: 'Sustainable waste management and recycling practices.', icon: 'fa-recycle', modules: 4 },
        { id: 'e4', title: 'Logic & Critical Thinking', description: 'Develop analytical thinking, reasoning, and problem-solving skills.', icon: 'fa-brain', modules: 6 },
        { id: 'e5', title: 'Problem Solving', description: 'Systematic approaches to solving complex problems.', icon: 'fa-puzzle-piece', modules: 5 }
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
        
        document.getElementById('gpPoints').textContent = userGP;
        document.getElementById('streakDays').textContent = userStreak;
        
        console.log('📊 Stats - GP:', userGP, 'Streak:', userStreak);
        
    } catch (error) {
        console.error('Error loading stats:', error);
        userGP = 0;
        userStreak = 0;
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

// ============================================
// ELECTIVES RENDER
// ============================================

function renderElectives() {
    const container = document.getElementById('electivesContainer');
    if (!container) return;
    
    // Filter by search query
    let filteredElectives = electivesData;
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        filteredElectives = electivesData.filter(e => 
            e.title.toLowerCase().includes(q) || 
            e.description.toLowerCase().includes(q)
        );
    }
    
    if (filteredElectives.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>No Electives Found</h3>
                <p>${searchQuery ? `No results for "${searchQuery}"` : 'No electives available yet.'}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredElectives.map(elective => {
        const isExpanded = expandedElectives.has(elective.id);
        return `
            <div class="elective-card ${isExpanded ? 'expanded' : ''}" data-id="${elective.id}">
                <div class="elective-header" onclick="toggleElective('${elective.id}')">
                    <div class="elective-icon">
                        <i class="fas ${elective.icon || 'fa-book'}"></i>
                    </div>
                    <div class="elective-info">
                        <div class="elective-title">${elective.title}</div>
                        <div class="elective-meta">
                            <span><i class="fas fa-layer-group"></i> ${elective.modules || 0} modules</span>
                        </div>
                    </div>
                    <i class="fas fa-chevron-${isExpanded ? 'up' : 'down'}"></i>
                </div>
                <div class="elective-body">
                    <p class="elective-description">${elective.description || 'No description available.'}</p>
                    <button class="btn-primary elective-start-btn" onclick="startElective('${elective.id}')">
                        <i class="fas fa-play"></i> Start Learning
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// SEARCH ELECTIVES
// ============================================

window.searchElectives = function(query) {
    searchQuery = query || '';
    renderElectives();
};

// ============================================
// TOGGLE ELECTIVE
// ============================================

window.toggleElective = function(electiveId) {
    if (expandedElectives.has(electiveId)) {
        expandedElectives.delete(electiveId);
    } else {
        expandedElectives.add(electiveId);
    }
    renderElectives();
};

// ============================================
// START ELECTIVE
// ============================================

window.startElective = function(electiveId) {
    const elective = electivesData.find(e => e.id === electiveId);
    if (!elective) return;
    
    showToast(`Starting "${elective.title}"...`, 'success');
    // Navigate to elective detail page or open modal
    // For now, just show a message
    showToast(`📚 "${elective.title}" course loaded!`, 'success');
};

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
        document.getElementById('gpPoints').textContent = userGP;
        
        userStreak = Math.min(userStreak + 1, 30);
        localStorage.setItem(`course_streak_${currentUser.id}`, userStreak.toString());
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
}

// ============================================
// EXPOSE GLOBALLY
// ============================================

window.togglePhase = togglePhase;
window.toggleElective = toggleElective;
window.startElective = startElective;
window.searchElectives = searchElectives;
window.openModuleModal = openModuleModal;
window.closeModuleModal = closeModuleModal;
window.completeModule = completeModule;
window.completeModuleFromModal = completeModuleFromModal;

console.log('📚 Learning Path ready');
