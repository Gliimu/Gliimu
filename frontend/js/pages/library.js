// ============================================
// COMMUNITY CHAT PAGE - WITH ACCESS GUARD
// ============================================

import { checkPlatformAccess, showTimeUpModal } from '../modules/access-guard.js';
import { initTimer, startTimer, stopTimer, addTimeSpent, getRemainingTimeFormatted, hasTimeRemaining } from '../modules/timer.js';
import { showToast } from '../modules/toast.js';

let accessGranted = false;
let socket = null;

// ============================================
// ACCESS CONTROL
// ============================================

async function verifyAccess() {
    const hasAccess = await checkPlatformAccess('chat');
    if (!hasAccess) {
        if (!hasTimeRemaining()) {
            showTimeUpModal('chat');
        }
        return false;
    }
    return true;
}

// ============================================
// TIMER MANAGEMENT
// ============================================

function startPageTimer() {
    startTimer('chat');
    
    window.addEventListener('beforeunload', () => {
        addTimeSpent();
        stopTimer();
    });
}

// ============================================
// CHAT FUNCTIONS
// ============================================

async function initChat() {
    console.log('Initializing community chat...');
    
    // Check access
    accessGranted = await verifyAccess();
    if (!accessGranted) {
        document.getElementById('chatMessages').innerHTML = `
            <div class="access-denied">
                <i class="fas fa-lock"></i>
                <h3>Access Restricted</h3>
                <p>You've used your 15 minutes of free access for today.</p>
                <p>Upgrade to Premium for unlimited access to Community Chat!</p>
                <a href="/dashboard.html?tab=wallet" class="btn-primary">View Plans</a>
            </div>
        `;
        return;
    }
    
    // Start timer
    startPageTimer();
    
    // Initialize socket connection
    await initSocket();
    
    // Display timer
    const remaining = getRemainingTimeFormatted();
    console.log(`Free time remaining: ${remaining}`);
}

async function initSocket() {
    // Your existing socket.io code here
    console.log('Connecting to chat server...');
    showToast('Connected to Community Chat!', 'success');
}

// Start the page
initChat();

window.addEventListener('beforeunload', () => {
    addTimeSpent();
    stopTimer();
});
