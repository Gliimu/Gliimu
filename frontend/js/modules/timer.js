// ============================================
// TIMER MODULE - Free Access Limiting System
// 15 minutes per day across all platforms
// WITH SUPABASE BACKEND SYNC
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
    startTime: null,
    sessionId: null
};

let timerInterval = null;
let warningShown = false;

// ============================================
// SUPABASE SYNC FUNCTIONS
// ============================================

// Save daily usage to Supabase
async function saveDailyUsageToSupabase() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;
        
        const today = new Date().toISOString().split('T')[0];
        
        const { error } = await supabase
            .from('daily_usage')
            .upsert({
                user_id: user.id,
                platform: 'all', // Track total usage across platforms
                date: today,
                minutes_used: timerState.minutesUsed,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,platform,date'
            });
        
        if (error) {
            console.error('Error saving to Supabase:', error);
            return false;
        }
        
        return true;
    } catch (e) {
        console.log('Could not sync to Supabase:', e);
        return false;
    }
}

// Load daily usage from Supabase
async function loadDailyUsageFromSupabase() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        
        const today = new Date().toISOString().split('T')[0];
        
        const { data, error } = await supabase
            .from('daily_usage')
            .select('minutes_used')
            .eq('user_id', user.id)
            .eq('platform', 'all')
            .eq('date', today)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Error loading from Supabase:', error);
            return null;
        }
        
        return data?.minutes_used || null;
    } catch (e) {
        console.log('Could not load from Supabase:', e);
        return null;
    }
}

// ============================================
// LOAD/SAVE TIMER STATE
// ============================================

// Load timer data from Supabase first, then localStorage
export async function loadTimerState() {
    // First try Supabase for cross-device sync
    const supabaseMinutes = await loadDailyUsageFromSupabase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (supabaseMinutes !== null) {
        // Use Supabase data as source of truth
        timerState.minutesUsed = supabaseMinutes;
        timerState.lastResetDate = today;
        await saveTimerState(); // Sync to localStorage
        return timerState;
    }
    
    // Fallback to localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const data = JSON.parse(saved);
        const lastReset = data.lastResetDate ? new Date(data.lastResetDate) : null;
        
        if (lastReset && lastReset >= today) {
            timerState = data;
            // Sync localStorage to Supabase
            await saveDailyUsageToSupabase();
        } else {
            // Reset for new day
            resetTimerForNewDay();
        }
    } else {
        resetTimerForNewDay();
    }
    
    return timerState;
}

// Reset timer for new day
async function resetTimerForNewDay() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    timerState = {
        minutesUsed: 0,
        lastResetDate: today.toISOString(),
        isActive: false,
        currentPlatform: null,
        startTime: null,
        sessionId: null
    };
    
    await saveTimerState();
}

// Save timer state to localStorage and Supabase
async function saveTimerState() {
    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...timerState,
        sessionId: undefined // Don't store session ID
    }));
    
    // Save to Supabase
    await saveDailyUsageToSupabase();
}

// ============================================
// AUTO-SAVE DURING SESSION
// ============================================

let autoSaveInterval = null;

function startAutoSave() {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    
    autoSaveInterval = setInterval(async () => {
        if (timerState.isActive && timerState.startTime) {
            await saveCurrentSessionTime();
        }
    }, 30000); // Save every 30 seconds
}

function stopAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
}

async function saveCurrentSessionTime() {
    if (!timerState.isActive || !timerState.startTime) return;
    
    const elapsedMinutes = (Date.now() - timerState.startTime) / 60000;
    const newTotal = timerState.minutesUsed + elapsedMinutes;
    
    if (newTotal <= timerState.minutesUsed + 0.1) return; // No significant change
    
    timerState.minutesUsed = newTotal;
    timerState.startTime = Date.now(); // Reset start time after saving
    await saveTimerState();
    
    // Update UI
    updateTimerDisplay();
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
    return Math.min(100, (timerState.minutesUsed / FREE_MINUTES_PER_DAY) * 100);
}

// Check if user has time remaining
export function hasTimeRemaining() {
    return getRemainingMinutes() > 0;
}

// ============================================
// TIMER CONTROL
// ============================================

// Start tracking time on a platform
export async function startTimer(platform) {
    if (timerInterval) {
        return;
    }
    
    // Check if user has premium or standard plan for this platform
    const unlimited = await hasUnlimitedAccess(platform);
    if (unlimited) {
        console.log('Unlimited access for', platform);
        // Hide timer banner if showing
        hideTimerBanner();
        return;
    }
    
    // Reload latest state before starting
    await loadTimerState();
    
    // Check if time is already used up
    if (!hasTimeRemaining()) {
        showTimeUpModal(platform);
        return;
    }
    
    timerState.isActive = true;
    timerState.currentPlatform = platform;
    timerState.startTime = Date.now();
    timerState.sessionId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
    
    // Start interval to track time
    timerInterval = setInterval(async () => {
        await updateTimer();
    }, 60000); // Update every minute
    
    startAutoSave();
    warningShown = false;
    
    // Show timer banner
    showTimerBanner();
}

// Stop tracking time
export async function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    stopAutoSave();
    
    // Save final session time
    if (timerState.isActive && timerState.startTime) {
        await saveCurrentSessionTime();
    }
    
    timerState.isActive = false;
    timerState.currentPlatform = null;
    timerState.startTime = null;
    timerState.sessionId = null;
    
    hideTimerBanner();
}

// Update timer (called every minute)
async function updateTimer() {
    if (!timerState.isActive || !timerState.startTime) return;
    
    await saveCurrentSessionTime();
    
    if (timerState.minutesUsed >= FREE_MINUTES_PER_DAY) {
        // Time's up!
        timerState.minutesUsed = FREE_MINUTES_PER_DAY;
        await saveTimerState();
        await stopTimer();
        showTimeUpModal(timerState.currentPlatform);
    } else if (!warningShown && timerState.minutesUsed >= FREE_MINUTES_PER_DAY - 2) {
        // Show warning when 2 minutes remaining
        warningShown = true;
        showLowTimeWarning();
    }
    
    updateTimerDisplay();
}

// Add time manually (when user closes page)
export async function addTimeSpent() {
    if (timerState.isActive && timerState.startTime) {
        await saveCurrentSessionTime();
        await saveTimerState();
    }
    await stopTimer();
}

// ============================================
// SUBSCRIPTION CHECK
// ============================================

// Get user's subscription data with caching
let cachedSubscription = null;
let subscriptionCacheTime = null;

async function getUserSubscription() {
    // Cache for 30 seconds
    if (cachedSubscription && subscriptionCacheTime && (Date.now() - subscriptionCacheTime) < 30000) {
        return cachedSubscription;
    }
    
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        
        const { data: profile, error } = await supabase
            .from('users')
            .select('subscription_plan, selected_platforms')
            .eq('id', user.id)
            .single();
        
        if (!error && profile) {
            cachedSubscription = profile;
            subscriptionCacheTime = Date.now();
            return profile;
        }
    } catch (e) {
        console.log('Error fetching subscription:', e);
    }
    
    return null;
}

// Clear subscription cache (call after plan purchase)
export function clearSubscriptionCache() {
    cachedSubscription = null;
    subscriptionCacheTime = null;
}

// Check if user has unlimited access to a platform
export async function hasUnlimitedAccess(platform) {
    const subscription = await getUserSubscription();
    
    if (!subscription) return false;
    
    if (subscription.subscription_plan === 'premium') {
        return true;
    }
    
    if (subscription.subscription_plan === 'standard' && subscription.selected_platforms) {
        let selectedPlatforms = subscription.selected_platforms;
        if (typeof selectedPlatforms === 'string') {
            selectedPlatforms = JSON.parse(selectedPlatforms);
        }
        return selectedPlatforms.includes(platform);
    }
    
    return false;
}

// Check if user can access a platform (with timer enforcement)
export async function canAccessPlatform(platform) {
    // Check subscription first
    const hasUnlimited = await hasUnlimitedAccess(platform);
    if (hasUnlimited) return true;
    
    // Reload latest state
    await loadTimerState();
    
    // Check free time remaining
    return hasTimeRemaining();
}

// ============================================
// UI UPDATE FUNCTIONS
// ============================================

function updateTimerDisplay() {
    const timeDisplay = document.getElementById('timerTimeDisplay');
    if (timeDisplay) {
        timeDisplay.textContent = getRemainingTimeFormatted();
    }
    
    const progressBar = document.querySelector('.timer-progress-bar');
    if (progressBar) {
        progressBar.style.width = `${getTimeUsedPercentage()}%`;
    }
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
                ⏱️
            </div>
            <div class="timer-info">
                <div class="timer-label">Free Access Today</div>
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
    
    // Add styles if not already present
    if (!document.getElementById('timer-banner-styles')) {
        const style = document.createElement('style');
        style.id = 'timer-banner-styles';
        style.textContent = `
            #timer-banner {
                position: fixed;
                bottom: 20px;
                left: 20px;
                right: 20px;
                background: var(--bg-card, #ffffff);
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                border: 1px solid var(--border-color, #e5e7eb);
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
            }
            
            .timer-info {
                flex: 1;
            }
            
            .timer-label {
                font-size: 0.7rem;
                color: var(--text-secondary, #6b7280);
            }
            
            .timer-time {
                font-size: 1.1rem;
                font-weight: 700;
                color: var(--accent, #7c3aed);
            }
            
            .timer-progress {
                width: 100%;
                height: 3px;
                background: var(--border-color, #e5e7eb);
                border-radius: 3px;
                margin-top: 4px;
                overflow: hidden;
            }
            
            .timer-progress-bar {
                height: 100%;
                background: var(--accent, #7c3aed);
                border-radius: 3px;
                transition: width 0.3s;
            }
            
            .timer-upgrade-btn {
                background: var(--accent, #7c3aed);
                color: white;
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
                color: var(--text-secondary, #6b7280);
                padding: 4px;
            }
            
            body.dark-mode #timer-banner {
                background: var(--bg-card, #1f2937);
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
    }
    
    // Update timer display every second
    const updateDisplay = setInterval(() => {
        updateTimerDisplay();
    }, 1000);
    
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
    showToast(`⚠️ Only 2 minutes of free access remaining! Upgrade for unlimited access.`, 'warning', 5000);
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
                        ⏳
                    </div>
                    <p>You've used your <strong>15 minutes</strong> of free access for today.</p>
                    <p>Come back tomorrow for more free access, or upgrade now for unlimited browsing!</p>
                    <div class="timeup-plans">
                        <div class="plan-option">
                            <h4>📚 Standard Plan - ₦13,000</h4>
                            <p>Unlimited access to <strong>2 platforms</strong> of your choice</p>
                        </div>
                        <div class="plan-option premium">
                            <h4>👑 Premium Plan - ₦15,000</h4>
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
        
        // Add modal styles
        if (!document.getElementById('timeup-modal-styles')) {
            const style = document.createElement('style');
            style.id = 'timeup-modal-styles';
            style.textContent = `
                .modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 2000;
                    align-items: center;
                    justify-content: center;
                }
                .modal.active {
                    display: flex;
                }
                .modal-content {
                    background: white;
                    border-radius: 16px;
                    max-width: 450px;
                    width: 90%;
                    max-height: 90vh;
                    overflow-y: auto;
                }
                body.dark-mode .modal-content {
                    background: #1f2937;
                }
                .timeup-modal {
                    text-align: center;
                }
                .timeup-icon {
                    font-size: 3rem;
                    margin-bottom: 1rem;
                }
                .modal-header {
                    padding: 1rem;
                    border-bottom: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .modal-header h2 {
                    margin: 0;
                    font-size: 1.25rem;
                }
                .modal-close {
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                }
                .modal-body {
                    padding: 1.5rem;
                }
                .modal-footer {
                    padding: 1rem;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    gap: 1rem;
                }
                .timeup-plans {
                    margin-top: 1.5rem;
                    text-align: left;
                }
                .plan-option {
                    background: #f3f4f6;
                    padding: 0.75rem;
                    border-radius: 12px;
                    margin-bottom: 0.75rem;
                }
                body.dark-mode .plan-option {
                    background: #374151;
                }
                .plan-option.premium {
                    border-left: 3px solid #7c3aed;
                }
                .plan-option h4 {
                    font-size: 0.9rem;
                    margin-bottom: 0.25rem;
                }
                .plan-option p {
                    font-size: 0.75rem;
                    color: #6b7280;
                }
                .btn-primary {
                    flex: 1;
                    padding: 0.75rem;
                    background: #7c3aed;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                }
                .btn-outline {
                    flex: 1;
                    padding: 0.75rem;
                    background: none;
                    border: 1px solid #7c3aed;
                    color: #7c3aed;
                    border-radius: 8px;
                    cursor: pointer;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    };
    
    document.getElementById('closeTimeUpModal')?.addEventListener('click', closeModal);
    document.getElementById('remindMeLaterBtn')?.addEventListener('click', closeModal);
    
    document.getElementById('upgradeNowBtn')?.addEventListener('click', () => {
        window.location.href = '/dashboard.html?tab=wallet';
    });
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            closeModal();
        }
    };
}

// ============================================
// EXPORT FUNCTIONS
// ============================================

// Call this on page load to restore state
export async function initTimer() {
    await loadTimerState();
    
    // Check if time is already used up
    if (!hasTimeRemaining()) {
        const subscription = await getUserSubscription();
        if (!subscription || subscription.subscription_plan === 'free') {
            showToast(`You've used your daily free access. Upgrade for unlimited access!`, 'info', 5000);
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
    hasTimeRemaining,
    clearSubscriptionCache
};
