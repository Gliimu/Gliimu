// ============================================
// TIMER MODULE - Free Access Limiting System
// 15 minutes per day across all platforms
// ============================================

import { supabase } from './supabase.js';
import { showToast } from './toast.js';

// Configuration
const FREE_MINUTES_PER_DAY = 15;
const STORAGE_KEY = 'glimu_timer_data';

// Timer state
let timerState = {
    minutesUsed: 0,
    lastResetDate: null,
    isActive: false,
    currentPlatform: null,
    startTime: null
};

let timerInterval = null;
let warningShown = false;

// ============================================
// LOAD/SAVE TIMER STATE
// ============================================

// Load timer data from localStorage or Supabase
export async function loadTimerState() {
    try {
        // First try to get from Supabase
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
            const { data: profile, error } = await supabase
                .from('users')
                .select('free_minutes_used, daily_free_usage')
                .eq('id', user.id)
                .single();
            
            if (!error && profile) {
                const lastReset = profile.daily_free_usage ? new Date(profile.daily_free_usage) : null;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                // Check if last reset was today
                if (lastReset && lastReset >= today) {
                    timerState.minutesUsed = profile.free_minutes_used || 0;
                    timerState.lastResetDate = lastReset;
                } else {
                    // Reset for new day
                    timerState.minutesUsed = 0;
                    timerState.lastResetDate = today;
                    await saveTimerState();
                }
                return timerState;
            }
        }
    } catch (e) {
        console.log('Supabase not available, using localStorage');
    }
    
    // Fallback to localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const data = JSON.parse(saved);
        const lastReset = data.lastResetDate ? new Date(data.lastResetDate) : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (lastReset && lastReset >= today) {
            timerState = data;
        } else {
            // Reset for new day
            timerState = {
                minutesUsed: 0,
                lastResetDate: today.toISOString(),
                isActive: false,
                currentPlatform: null,
                startTime: null
            };
            saveTimerState();
        }
    }
    
    return timerState;
}

// Save timer state to localStorage and Supabase
async function saveTimerState() {
    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timerState));
    
    // Save to Supabase if user is logged in
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase
                .from('users')
                .update({
                    free_minutes_used: timerState.minutesUsed,
                    daily_free_usage: timerState.lastResetDate
                })
                .eq('id', user.id);
        }
    } catch (e) {
        console.log('Could not sync timer to Supabase');
    }
}

// ============================================
// REMINING TIME CALCULATION
// ============================================

// Get remaining free minutes for today
export function getRemainingMinutes() {
    const remaining = FREE_MINUTES_PER_DAY - timerState.minutesUsed;
    return Math.max(0, remaining);
}

// Get remaining time in formatted string (MM:SS)
export function getRemainingTimeFormatted() {
    const remaining = getRemainingMinutes();
    const minutes = Math.floor(remaining);
    const seconds = Math.floor((remaining - minutes) * 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Get percentage of time used (for progress bar)
export function getTimeUsedPercentage() {
    return (timerState.minutesUsed / FREE_MINUTES_PER_DAY) * 100;
}

// Check if user has time remaining
export function hasTimeRemaining() {
    return getRemainingMinutes() > 0;
}

// ============================================
// TIMER CONTROL
// ============================================

// Start tracking time on a platform
export function startTimer(platform) {
    if (timerInterval) {
        // Don't start multiple timers
        return;
    }
    
    // Check if user has premium or standard plan for this platform
    if (hasUnlimitedAccess(platform)) {
        console.log('Unlimited access for', platform);
        return;
    }
    
    // Check if time is already used up
    if (!hasTimeRemaining()) {
        showTimeUpModal(platform);
        return;
    }
    
    timerState.isActive = true;
    timerState.currentPlatform = platform;
    timerState.startTime = Date.now();
    
    // Start interval to track time
    timerInterval = setInterval(updateTimer, 60000); // Update every minute
    warningShown = false;
    
    // Show timer banner
    showTimerBanner();
}

// Stop tracking time
export function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    timerState.isActive = false;
    timerState.currentPlatform = null;
    timerState.startTime = null;
    
    hideTimerBanner();
}

// Update timer (called every minute)
async function updateTimer() {
    if (!timerState.isActive || !timerState.startTime) return;
    
    const elapsedMinutes = (Date.now() - timerState.startTime) / 60000;
    const newTotal = timerState.minutesUsed + elapsedMinutes;
    
    if (newTotal >= FREE_MINUTES_PER_DAY) {
        // Time's up!
        timerState.minutesUsed = FREE_MINUTES_PER_DAY;
        await saveTimerState();
        stopTimer();
        showTimeUpModal(timerState.currentPlatform);
    } else if (!warningShown && newTotal >= FREE_MINUTES_PER_DAY - 2) {
        // Show warning when 2 minutes remaining
        warningShown = true;
        showLowTimeWarning();
    }
}

// Add time manually (when user closes page)
export async function addTimeSpent() {
    if (timerState.isActive && timerState.startTime) {
        const elapsedMinutes = (Date.now() - timerState.startTime) / 60000;
        timerState.minutesUsed += elapsedMinutes;
        await saveTimerState();
    }
}

// ============================================
// SUBSCRIPTION CHECK
// ============================================

// Get user's subscription data
async function getUserSubscription() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        
        const { data: profile } = await supabase
            .from('users')
            .select('subscription_plan, selected_platforms')
            .eq('id', user.id)
            .single();
        
        return profile;
    } catch (e) {
        return null;
    }
}

// Check if user has unlimited access to a platform
export async function hasUnlimitedAccess(platform) {
    const subscription = await getUserSubscription();
    
    if (!subscription) return false;
    
    if (subscription.subscription_plan === 'premium') {
        return true;
    }
    
    if (subscription.subscription_plan === 'standard' && subscription.selected_platforms) {
        return subscription.selected_platforms.includes(platform);
    }
    
    return false;
}

// Check if user can access a platform (with timer enforcement)
export async function canAccessPlatform(platform) {
    // Check subscription first
    const hasUnlimited = await hasUnlimitedAccess(platform);
    if (hasUnlimited) return true;
    
    // Check free time remaining
    return hasTimeRemaining();
}

// ============================================
// UI COMPONENTS
// ============================================

let timerBanner = null;

function showTimerBanner() {
    if (timerBanner) return;
    
    timerBanner = document.createElement('div');
    timerBanner.id = 'timer-banner';
    timerBanner.innerHTML = `
        <div class="timer-banner-content">
            <div class="timer-icon">
                <i class="fas fa-hourglass-half"></i>
            </div>
            <div class="timer-info">
                <div class="timer-label">Free Access</div>
                <div class="timer-time" id="timerTimeDisplay">${getRemainingTimeFormatted()}</div>
                <div class="timer-progress">
                    <div class="timer-progress-bar" style="width: ${getTimeUsedPercentage()}%"></div>
                </div>
            </div>
            <button class="timer-upgrade-btn" id="timerUpgradeBtn">Upgrade</button>
            <button class="timer-close-btn" id="timerCloseBtn">×</button>
        </div>
    `;
    
    document.body.appendChild(timerBanner);
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        #timer-banner {
            position: fixed;
            bottom: 20px;
            left: 20px;
            right: 20px;
            background: var(--bg-card);
            border-radius: 12px;
            box-shadow: var(--shadow-lg);
            border: 1px solid var(--border-color);
            z-index: 1000;
            animation: slideUp 0.3s ease;
            max-width: 350px;
        }
        
        @keyframes slideUp {
            from {
                transform: translateY(100px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
        
        .timer-banner-content {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
        }
        
        .timer-icon {
            font-size: 1.5rem;
            color: var(--accent);
        }
        
        .timer-info {
            flex: 1;
        }
        
        .timer-label {
            font-size: 0.7rem;
            color: var(--text-secondary);
        }
        
        .timer-time {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--accent);
        }
        
        .timer-progress {
            width: 100%;
            height: 3px;
            background: var(--border-color);
            border-radius: 3px;
            margin-top: 4px;
            overflow: hidden;
        }
        
        .timer-progress-bar {
            height: 100%;
            background: var(--accent);
            border-radius: 3px;
            transition: width 0.3s;
        }
        
        .timer-upgrade-btn {
            background: var(--accent);
            color: var(--brand-purple-dark);
            border: none;
            padding: 6px 12px;
            border-radius: 20px;
            font-weight: 600;
            cursor: pointer;
            font-size: 0.7rem;
        }
        
        .timer-close-btn {
            background: none;
            border: none;
            font-size: 1.2rem;
            cursor: pointer;
            color: var(--text-secondary);
            padding: 4px;
        }
        
        body.dark-mode #timer-banner {
            background: var(--bg-card);
        }
        
        @media (max-width: 768px) {
            #timer-banner {
                left: 10px;
                right: 10px;
                bottom: 10px;
            }
            
            .timer-banner-content {
                padding: 10px 12px;
            }
        }
    `;
    document.head.appendChild(style);
    
    // Update timer display every second
    const updateDisplay = setInterval(() => {
        const timeDisplay = document.getElementById('timerTimeDisplay');
        if (timeDisplay) {
            timeDisplay.textContent = getRemainingTimeFormatted();
        }
        const progressBar = document.querySelector('.timer-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${getTimeUsedPercentage()}%`;
        }
    }, 1000);
    
    // Store interval ID on banner for cleanup
    timerBanner._updateInterval = updateDisplay;
    
    // Upgrade button
    document.getElementById('timerUpgradeBtn')?.addEventListener('click', () => {
        window.location.href = '/dashboard.html?tab=wallet';
    });
    
    // Close button
    document.getElementById('timerCloseBtn')?.addEventListener('click', () => {
        hideTimerBanner();
    });
}

function hideTimerBanner() {
    if (timerBanner) {
        if (timerBanner._updateInterval) {
            clearInterval(timerBanner._updateInterval);
        }
        timerBanner.remove();
        timerBanner = null;
    }
}

function showLowTimeWarning() {
    showToast(`⚠️ Only 2 minutes of free access remaining! Upgrade for unlimited access.`, 'warning');
}

function showTimeUpModal(platform) {
    const platformNames = {
        library: 'Library',
        hub: 'Hub',
        chat: 'Community Chat',
        virtualroom: 'Virtual Classroom'
    };
    
    const platformName = platformNames[platform] || platform;
    
    // Create modal if not exists
    let modal = document.getElementById('timeUpModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'timeUpModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content timeup-modal">
                <div class="modal-header">
                    <h2>⏰ Free Time Used Up</h2>
                    <button class="modal-close" id="closeTimeUpModal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="timeup-icon">
                        <i class="fas fa-hourglass-end"></i>
                    </div>
                    <p>You've used your <strong>15 minutes</strong> of free access for today.</p>
                    <p>Come back tomorrow for more free access, or upgrade now for unlimited browsing!</p>
                    <div class="timeup-plans">
                        <div class="plan-option">
                            <h4>🎓 Standard Plan</h4>
                            <p>Unlimited access to <strong>2 platforms</strong> of your choice</p>
                        </div>
                        <div class="plan-option premium">
                            <h4>👑 Premium Plan</h4>
                            <p>Unlimited access to <strong>ALL platforms</strong></p>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="upgradeNowBtn" class="btn-primary">Upgrade Now</button>
                    <button id="remindMeLaterBtn" class="btn-outline">Remind Me Later</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .timeup-modal {
                max-width: 450px;
                text-align: center;
            }
            .timeup-icon {
                font-size: 3rem;
                color: var(--accent);
                margin-bottom: 1rem;
            }
            .timeup-plans {
                margin-top: 1.5rem;
                text-align: left;
            }
            .plan-option {
                background: var(--bg-secondary);
                padding: 0.75rem;
                border-radius: 12px;
                margin-bottom: 0.75rem;
            }
            .plan-option.premium {
                border-left: 3px solid var(--accent);
            }
            .plan-option h4 {
                font-size: 0.9rem;
                margin-bottom: 0.25rem;
            }
            .plan-option p {
                font-size: 0.75rem;
                color: var(--text-secondary);
            }
        `;
        document.head.appendChild(style);
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    document.getElementById('closeTimeUpModal')?.addEventListener('click', () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    });
    
    document.getElementById('upgradeNowBtn')?.addEventListener('click', () => {
        window.location.href = '/dashboard.html?tab=wallet';
    });
    
    document.getElementById('remindMeLaterBtn')?.addEventListener('click', () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    });
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    };
}

// ============================================
// INITIALIZE
// ============================================

// Call this on page load to restore state
export async function initTimer() {
    await loadTimerState();
    
    // Check if time is already used up
    if (!hasTimeRemaining()) {
        // Show time up message but don't block
        const user = await supabase.auth.getUser();
        if (user.data.user) {
            const hasUnlimited = await hasUnlimitedAccess('library');
            if (!hasUnlimited) {
                showToast(`You've used your daily free access. Upgrade for unlimited access!`, 'info');
            }
        }
    }
}

// Export default
export default {
    initTimer,
    startTimer,
    stopTimer,
    addTimeSpent,
    canAccessPlatform,
    hasUnlimitedAccess,
    getRemainingMinutes,
    getRemainingTimeFormatted,
    getTimeUsedPercentage,
    hasTimeRemaining
};
