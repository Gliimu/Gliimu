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
