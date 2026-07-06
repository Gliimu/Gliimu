// ============================================
// USER GENERAL - General User Logic
// Path: /frontend/js/pages/user/user-general.js
// Purpose: User role specific logic - combines all tabs
// ============================================

import { Dashboard } from './user-dashboard.js';
import { renderOverview } from './user-tabs.js';
import { loadMessages } from './user-messages.js';
import { loadSubmissions } from './user-submissions.js';
import { loadWallet, showFundWalletModal, showConvertStarsModal } from './user-wallet.js';
import { modalManager } from './user-modals.js';

export class GeneralDashboard extends Dashboard {
    constructor(user, profile) {
        super(user, profile);
        this.role = 'user';
        console.log('👤 General user dashboard initialized');
    }

    // ============================================
    // RENDER DASHBOARD
    // ============================================
    async render(container) {
        this.container = container;
        
        // Setup sticky nav and alerts
        this.setupStickyNav();
        
        // Load default tab (Overview)
        await this.loadDashboard();
        
        // Update alert badge
        if (this.alertManager) {
            this.updateAlertBadge(this.alertManager.unreadCount || 0);
        }
    }

    // ============================================
    // SETUP STICKY NAV
    // ============================================
    setupStickyNav() {
        var toggle = document.getElementById('navToggle');
        var dropdown = document.getElementById('navDropdown');
        
        if (toggle) {
            toggle.onclick = function(e) {
                e.stopPropagation();
                if (dropdown) {
                    dropdown.classList.toggle('open');
                }
                toggle.classList.toggle('active');
            };
        }

        document.addEventListener('click', function(e) {
            var nav = document.getElementById('stickyNav');
            if (nav && !nav.contains(e.target)) {
                if (dropdown) {
                    dropdown.classList.remove('open');
                }
                if (toggle) {
                    toggle.classList.remove('active');
                }
            }
        });
    }

    // ============================================
    // LOAD DASHBOARD (Overview Tab)
    // ============================================
    async loadDashboard() {
        await renderOverview(this.container, this);
    }

    // ============================================
    // LOAD MESSAGES
    // ============================================
    async loadMessages(container) {
        await loadMessages(container || this.container, this);
    }

    // ============================================
    // LOAD SUBMISSIONS
    // ============================================
    async loadSubmissions(container) {
        await loadSubmissions(container || this.container, this);
    }

    // ============================================
    // LOAD WALLET
    // ============================================
    async loadWallet(container) {
        await loadWallet(container || this.container, this);
    }

    // ============================================
    // SHOW FUND WALLET MODAL
    // ============================================
    showFundWalletModal() {
        showFundWalletModal(this);
    }

    // ============================================
    // SHOW CONVERT STARS MODAL
    // ============================================
    showConvertStarsModal() {
        showConvertStarsModal(this);
    }

    // ============================================
    // SHOW ACCESS MODAL (for restricted features)
    // ============================================
    showAccessModal() {
        modalManager.showAccessModal(function() {
            if (window.switchTab) {
                window.switchTab('messages');
                showToast('Go to Messages to apply for a role', 'info');
            }
        });
    }
}

export default GeneralDashboard;
