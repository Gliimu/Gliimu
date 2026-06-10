// ============================================
// ACCESS GUARD - Protects platform pages
// ============================================

import { supabase } from './supabase.js';
import { showToast } from './toast.js';
import { canAccess, isPremium } from './wallet.js';

// Check access before loading page
export async function requireAccess(platform) {
    const hasAccess = await canAccess(platform);
    
    if (!hasAccess) {
        const isPremiumUser = await isPremium();
        
        if (isPremiumUser) {
            showToast(`You need to add funds to access ${platform}.`, 'info');
        } else {
            showToast(`You don't have access to ${platform}. Upgrade to Premium or purchase access.`, 'warning');
        }
        
        setTimeout(() => {
            window.location.href = '/dashboard.html?tab=wallet';
        }, 2000);
        
        return false;
    }
    
    return true;
}

// Show upgrade prompt
export function showUpgradePrompt(platform) {
    const modal = document.createElement('div');
    modal.className = 'access-modal';
    modal.innerHTML = `
        <div class="access-modal-content">
            <h3>🔒 Access Required</h3>
            <p>You don't have access to <strong>${platform.charAt(0).toUpperCase() + platform.slice(1)}</strong>.</p>
            <div class="access-options">
                <button onclick="window.location.href='/dashboard.html?tab=wallet'" class="btn-primary">
                    Go to Wallet
                </button>
                <button onclick="this.closest('.access-modal').remove()" class="btn-secondary">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// frontend/js/modules/access-guard.js
import { supabase } from './supabase.js';
import { getRemainingMinutes } from './timer.js';
import { showToast } from './toast.js';

export async function checkPlatformAccess(platform) {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        window.location.href = '/signin.html';
        return false;
    }
    
    // Hub is always free
    if (platform === 'hub') {
        return true;
    }
    
    const userPlan = user.user_metadata?.subscription_plan || 'free';
    const selectedPlatforms = user.user_metadata?.selected_platforms || [];
    
    // Premium has all access
    if (userPlan === 'premium') {
        return true;
    }
    
    // Check platform-specific access
    if (platform === 'library') {
        if (userPlan === 'basic' && selectedPlatforms.includes('library')) {
            return true;
        }
        if (userPlan === 'standard' && selectedPlatforms.includes('library')) {
            return true;
        }
    }
    
    if (platform === 'virtualroom') {
        if (userPlan === 'standard' && selectedPlatforms.includes('virtualroom')) {
            return true;
        }
        if (userPlan === 'premium') {
            return true;
        }
    }
    
    if (platform === 'chat') {
        if (userPlan === 'standard' && selectedPlatforms.includes('chat')) {
            return true;
        }
        if (userPlan === 'premium') {
            return true;
        }
    }
    
    // Free tier or no subscription - check timer
    const remainingMinutes = await getRemainingMinutes(platform);
    
    if (remainingMinutes > 0) {
        return true;
    }
    
    // No access - show upgrade prompt
    showUpgradePrompt(platform);
    return false;
}

function showUpgradePrompt(platform) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-4">
            <h3 class="text-xl font-bold mb-4">Upgrade Required</h3>
            <p class="mb-4">You've used your free time for ${platform}. Upgrade to continue learning!</p>
            <div class="space-y-2 mb-4">
                <div class="p-3 bg-gray-100 dark:bg-gray-700 rounded">
                    <strong>Basic (₦7,500/mo)</strong> - Library access
                </div>
                <div class="p-3 bg-gray-100 dark:bg-gray-700 rounded">
                    <strong>Standard (₦13,000/mo)</strong> - 2 platforms of your choice
                </div>
                <div class="p-3 bg-primary-100 dark:bg-primary-900 rounded">
                    <strong>Premium (₦15,000/mo)</strong> - All platforms unlimited
                </div>
            </div>
            <div class="flex gap-3">
                <button onclick="window.location.href='/dashboard.html'" class="flex-1 px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700">
                    View Plans
                </button>
                <button onclick="this.closest('.fixed').remove()" class="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 rounded">
                    Close
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}
