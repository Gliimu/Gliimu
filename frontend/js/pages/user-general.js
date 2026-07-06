// ============================================
// GLIIMU USER DASHBOARD - GENERAL/PARTNER
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';
import { getUserTransactions, getReferralCount } from '../modules/supabase.js';
import { 
    getStudentProgress,
    getIndividualLeaderboard,
    convertGPToStars
} from '../modules/progression.js';
import { getBankDetails } from '../modules/settings.js';

export class GeneralDashboard {
    constructor(user, profile) {
        this.currentUser = user;
        this.currentProfile = profile;
        this.alertManager = null;
        this.selectedAmount = 0;
        this.referenceCode = '';
        this.leaderboardData = [];
        this.bankDetails = null;
        this._messageSubscription = null;
        
        window._generalDashboard = this;
        
        this.container = null;
        this.currentTab = 'dashboard';
    }

    setAlertManager(alertManager) {
        this.alertManager = alertManager;
        if (this.alertManager) {
            this.updateAlertIcon({
                alerts: this.alertManager.alerts || [],
                unreadCount: this.alertManager.unreadCount || 0
            });
        }
    }

    async render(container) {
        this.container = container;
        this.setupStickyNav();
        this.setupAlertDropdown();
        await this.loadDashboard();
        await this.loadBankDetails();
        if (this.alertManager) {
            this.updateAlertBadge(this.alertManager.unreadCount || 0);
        }
    }

    async loadBankDetails() {
        try {
            this.bankDetails = await getBankDetails();
        } catch (error) {
            console.error('Error loading bank details:', error);
            this.bankDetails = {
                bankName: 'MoniePoint Micro Finance Bank',
                accountName: 'Gliimu LTD',
                accountNumber: '6315085115'
            };
        }
    }

    // ================================================================
    // SETUP STICKY NAV
    // ================================================================
    setupStickyNav() {
        const toggle = document.getElementById('navToggle');
        const dropdown = document.getElementById('navDropdown');
        
        if (toggle) {
            toggle.onclick = function(e) {
                e.stopPropagation();
                dropdown.classList.toggle('open');
                toggle.classList.toggle('active');
            };
        }

        // Close nav when clicking outside
        document.addEventListener('click', function(e) {
            const nav = document.getElementById('stickyNav');
            if (nav && !nav.contains(e.target)) {
                dropdown?.classList.remove('open');
                toggle?.classList.remove('active');
                // Also close alert dropdown
                const alertDropdown = document.getElementById('alertDropdown');
                if (alertDropdown) alertDropdown.classList.remove('open');
            }
        });
    }

    // ================================================================
    // SETUP ALERT DROPDOWN
    // ================================================================
    setupAlertDropdown() {
        const alertBtn = document.getElementById('alertIconBtn');
        const alertDropdown = document.getElementById('alertDropdown');
        
        if (alertBtn) {
            alertBtn.onclick = function(e) {
                e.stopPropagation();
                alertDropdown.classList.toggle('open');
            };
        }

        const markReadBtn = document.getElementById('alertMarkRead');
        if (markReadBtn) {
            markReadBtn.onclick = async function(e) {
                e.stopPropagation();
                await this.markAllAlertsRead();
            }.bind(this);
        }
    }

    // ================================================================
    // UPDATE ALERT ICON
    // ================================================================
    updateAlertIcon(data) {
        const unreadCount = data?.unreadCount || 0;
        const alerts = data?.alerts || [];
        this.updateAlertBadge(unreadCount);
        
        const dropdownBody = document.getElementById('alertDropdownBody');
        if (dropdownBody) {
            dropdownBody.innerHTML = this.renderAlertItems(alerts);
        }
    }

    updateAlertBadge(count) {
        const badge = document.getElementById('alertBadge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 9 ? '9+' : count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    }

    renderAlertItems(alerts) {
        if (!alerts || alerts.length === 0) {
            return `
                <div class="alert-empty">
                    <i class="fas fa-inbox"></i>
                    <p>No notifications yet</p>
                </div>
            `;
        }

        return alerts.slice(0, 10).map(alert => `
            <div class="alert-item ${alert.read ? 'read' : 'unread'}" data-id="${alert.id}">
                <div class="alert-icon">${alert.icon || '📌'}</div>
                <div class="alert-content">
                    <p class="alert-message">${alert.message}</p>
                    <span class="alert-time">${this.getTimeAgo(alert.created_at)}</span>
                    ${alert.link ? `<a href="${alert.link}" class="alert-link" target="_blank">Learn more →</a>` : ''}
                </div>
                ${!alert.read ? `<span class="alert-unread-dot"></span>` : ''}
            </div>
        `).join('');
    }

    async markAllAlertsRead() {
        if (this.alertManager) {
            await this.alertManager.markAllAsRead();
            const unreadCount = await this.alertManager.getUnreadCount();
            const alerts = this.alertManager.alerts || [];
            this.updateAlertIcon({ unreadCount, alerts });
            showToast('All notifications marked as read', 'success');
        }
    }

    // ================================================================
    // LOAD DASHBOARD
    // ================================================================
    async loadDashboard() {
        if (!this.container) return;

        const profile = this.currentProfile;
        const user = this.currentUser;
        
        const submissionsCount = await this.getSubmissionsCount(user.id);
        const referralsCount = await this.getReferralsCount(user.id);
        
        const progressData = await getStudentProgress(user.id);
        const progress = progressData?.progress || 0;
        const badge = progressData?.currentBadge || { name: 'Starter', icon: '🌱', color: '#10b981' };
        const currentGP = progressData?.currentGP || 0;
        const totalStars = progressData?.totalStars || 0;

        await this.loadLeaderboard();

        const unreadCount = this.alertManager?.unreadCount || 0;

        this.container.innerHTML = `
            <div class="dashboard-header">
                <div>
                    <h1>Overview</h1>
                    <p>Welcome back, ${profile?.name || 'User'}!</p>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon wallet-icon">
                        <i class="fas fa-wallet"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Wallet Balance</h3>
                        <p class="stat-value" id="walletBalance">₦${(profile?.wallet_balance || 0).toLocaleString()}</p>
                    </div>
                    <button class="stat-action-btn" data-action="wallet" title="Add Funds">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                <div class="stat-card">
                    <div class="stat-icon gp-icon">
                        <i class="fas fa-star"></i>
                    </div>
                    <div class="stat-info">
                        <h3>GP Points</h3>
                        <p class="stat-value" id="gpPoints">${currentGP.toLocaleString()}</p>
                    </div>
                    <button class="stat-action-btn" data-action="stars" title="Convert to Stars">
                        <i class="fas fa-exchange-alt"></i>
                    </button>
                </div>
                <div class="stat-card">
                    <div class="stat-icon submissions-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Submissions</h3>
                        <p class="stat-value">${submissionsCount}</p>
                    </div>
                    <button class="stat-action-btn" data-action="submissions" title="View Submissions">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
                <div class="stat-card">
                    <div class="stat-icon referrals-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Referrals</h3>
                        <p class="stat-value">${referralsCount}</p>
                    </div>
                    <button class="stat-action-btn" data-action="referrals" title="Share Referral">
                        <i class="fas fa-share-alt"></i>
                    </button>
                </div>
            </div>

            <div class="progress-section">
                <div class="progress-header">
                    <span>Progress to ${progressData?.nextBadge?.name || 'Ambassador'}</span>
                    <span>${Math.round(progress)}%</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${progress}%; background: ${badge.color};"></div>
                </div>
                <div class="progress-stats">
                    <span>⭐ ${totalStars} Stars</span>
                    <span>🎯 ${Math.round(progress)}% Complete</span>
                </div>
            </div>

            <div class="card leaderboard-card-full">
                <div class="leaderboard-header">
                    <h3><i class="fas fa-trophy" style="color: #fbb040;"></i> Top Performers</h3>
                    <button id="refreshLeaderboardBtn" class="btn-icon" style="background: none; border: none; cursor: pointer; color: var(--text-secondary);">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
                <div class="leaderboard-list" id="dashboardLeaderboard">
                    ${this.renderLeaderboardItems()}
                </div>
            </div>

            ${profile?.application_status === 'pending' ? `
                <div class="alert alert-warning">
                    <i class="fas fa-clock"></i>
                    Your application for <strong>${profile.applied_role}</strong> is pending review.
                </div>
            ` : ''}
        `;

        this.updateAlertBadge(unreadCount);
        this.bindEvents();
        this.setupModalCloseHandlers();
    }

    // ================================================================
    // BIND EVENTS
    // ================================================================
    bindEvents() {
        document.querySelectorAll('.stat-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'wallet') this.showFundWalletModal();
                else if (action === 'stars') this.showConvertStarsModal();
                else if (action === 'submissions') showToast('Submissions view coming soon!', 'info');
                else if (action === 'referrals') {
                    const url = `${window.location.origin}/ref/${this.currentProfile?.referral_code || this.currentUser.id}`;
                    navigator.clipboard.writeText(url).then(() => {
                        showToast('Referral link copied! Share it with friends.', 'success');
                    }).catch(() => {
                        showToast(`Share this link: ${url}`, 'info');
                    });
                }
            });
        });

        document.getElementById('refreshLeaderboardBtn')?.addEventListener('click', async () => {
            await this.loadLeaderboard();
            const container = document.getElementById('dashboardLeaderboard');
            if (container) {
                container.innerHTML = this.renderLeaderboardItems();
            }
            showToast('Leaderboard refreshed!', 'success');
        });
    }

    // ================================================================
    // LOAD LEADERBOARD
    // ================================================================
    async loadLeaderboard() {
        try {
            this.leaderboardData = await getIndividualLeaderboard(5);
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            this.leaderboardData = [];
        }
    }

    renderLeaderboardItems() {
        if (!this.leaderboardData || this.leaderboardData.length === 0) {
            return '<div class="empty-state"><p>No leaders yet. Be the first!</p></div>';
        }
        
        return this.leaderboardData.map((user, index) => {
            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
            const medals = ['🥇', '🥈', '🥉'];
            const rankDisplay = index < 3 ? medals[index] : `#${index + 1}`;
            
            return `
                <div class="leaderboard-item ${rankClass}">
                    <div class="leaderboard-rank">${rankDisplay}</div>
                    <div class="leaderboard-avatar">
                        <img src="${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=fbb040&color=fff`}" alt="">
                    </div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${user.name || 'Anonymous'}</div>
                        <div class="leaderboard-badge">${user.badge?.icon || '🌱'} ${user.badge?.name || 'Starter'}</div>
                    </div>
                    <div class="leaderboard-score">${Math.round(user.progress || 0)}%</div>
                    <div class="leaderboard-gp">${(user.gp_points || 0).toLocaleString()} GP</div>
                </div>
            `;
        }).join('');
    }

    // ================================================================
    // GET SUBMISSIONS COUNT
    // ================================================================
    async getSubmissionsCount(userId) {
        try {
            const { count, error } = await supabase
                .from('student_answers')
                .select('id', { count: 'exact' })
                .eq('student_id', userId)
                .eq('status', 'graded');
            
            if (error) throw error;
            return count || 0;
        } catch (error) {
            console.error('Error getting submissions:', error);
            return 0;
        }
    }

    async getReferralsCount(userId) {
        try {
            const count = await getReferralCount(userId);
            return count;
        } catch (error) {
            console.error('Error getting referrals:', error);
            return 0;
        }
    }

    // ================================================================
    // GET PAYMENT REQUESTS
    // ================================================================
    async getPaymentRequests(userId) {
        try {
            const { data, error } = await supabase
                .from('payment_requests')
                .select('*')
                .eq('user_id', userId)
                .order('submitted_at', { ascending: false });
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting payment requests:', error);
            return [];
        }
    }

    // ================================================================
    // GET TIME AGO
    // ================================================================
    getTimeAgo(date) {
        if (!date) return 'Just now';
        
        let past;
        if (typeof date === 'string') {
            past = new Date(date);
        } else if (date instanceof Date) {
            past = date;
        } else {
            return 'Just now';
        }
        
        if (isNaN(past.getTime())) {
            return 'Just now';
        }
        
        const now = new Date();
        const diff = Math.floor((now.getTime() - past.getTime()) / 1000);
        
        if (diff < 0) return 'Just now';
        if (diff < 5) return 'Just now';
        if (diff < 60) return `${diff}s ago`;
        
        const minutes = Math.floor(diff / 60);
        const hours = Math.floor(diff / 3600);
        const days = Math.floor(diff / 86400);
        const weeks = Math.floor(diff / 604800);
        const months = Math.floor(diff / 2592000);
        const years = Math.floor(diff / 31536000);

        if (minutes < 2) return '1m ago';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 2) return '1h ago';
        if (hours < 24) return `${hours}h ago`;
        if (days < 2) return '1d ago';
        if (days < 7) return `${days}d ago`;
        if (weeks < 2) return '1w ago';
        if (weeks < 4) return `${weeks}w ago`;
        if (months < 2) return '1mo ago';
        if (months < 12) return `${months}mo ago';
        if (years < 2) return '1y ago';
        return `${years}y ago`;
    }

    // ================================================================
    // SHOW APPLY ROLE MODAL
    // ================================================================
    showApplyRoleModal() {
        const roles = ['student', 'instructor', 'ambassador'];
        const roleLabels = {
            'student': 'Student (Learn & Build)',
            'instructor': 'Instructor (Teach & Mentor)',
            'ambassador': 'Ambassador (Represent & Lead)'
        };

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Apply for a Role</h2>
                    <button class="modal-close" id="closeRoleModal">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 1rem; color: var(--text-secondary);">
                        Select the role you want to apply for. Your application will be reviewed by an admin.
                    </p>
                    <div class="role-options">
                        ${roles.map(r => `
                            <button class="apply-role-btn" data-role="${r}">
                                Apply as ${roleLabels[r] || r}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#closeRoleModal')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        modal.querySelectorAll('.apply-role-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const role = btn.dataset.role;
                modal.remove();
                await this.applyForRole(role);
            });
        });
    }

    async applyForRole(role) {
        try {
            const result = await this.submitApplication({
                role: role,
                fullName: this.currentProfile?.name,
                username: this.currentProfile?.username,
                email: this.currentUser?.email,
                birthDay: this.currentProfile?.birth_day,
                birthMonth: this.currentProfile?.birth_month
            });
            
            if (result.success) {
                showToast(`Application for ${role} submitted successfully!`, 'success');
                await this.loadDashboard();
            } else {
                showToast(result.error || 'Failed to submit application', 'error');
            }
        } catch (error) {
            console.error('Error applying for role:', error);
            showToast('Failed to submit application', 'error');
        }
    }

    async submitApplication(data) {
        try {
            const { error } = await supabase
                .from('applications')
                .insert([{
                    user_id: this.currentUser.id,
                    full_name: data.fullName,
                    username: data.username,
                    email: data.email,
                    role: data.role,
                    birth_day: data.birthDay,
                    birth_month: data.birthMonth,
                    status: 'pending',
                    submitted_at: new Date().toISOString()
                }]);

            if (error) throw error;

            await supabase
                .from('user_profiles')
                .update({
                    application_status: 'pending',
                    applied_role: data.role
                })
                .eq('id', this.currentUser.id);

            return { success: true };
        } catch (error) {
            console.error('Error submitting application:', error);
            return { success: false, error: error.message };
        }
    }

    // ================================================================
    // SHOW CONVERT STARS MODAL
    // ================================================================
    showConvertStarsModal() {
        const profile = this.currentProfile;
        const currentGP = profile?.gp_points || 0;
        const starsEarned = Math.floor(currentGP / 1000);
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>⭐ Convert GP to Stars</h2>
                    <button class="modal-close" id="closeConvertModal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="convert-info">
                        <div class="convert-stat">
                            <span class="convert-label">Current GP</span>
                            <span class="convert-value">${currentGP.toLocaleString()}</span>
                        </div>
                        <div class="convert-stat">
                            <span class="convert-label">Stars You Can Earn</span>
                            <span class="convert-value">${starsEarned} ⭐</span>
                        </div>
                        <p class="convert-hint">
                            ${starsEarned > 0 ? 'Ready to convert? Each star gives you a surprise gift!' : 'Earn 1,000 GP to get your first star!'}
                        </p>
                    </div>
                    
                    ${starsEarned > 0 ? `
                        <button id="confirmConvertStars" class="btn-primary" style="width: 100%;">
                            <i class="fas fa-star"></i> Convert ${starsEarned} Star${starsEarned > 1 ? 's' : ''}
                        </button>
                    ` : `
                        <button class="btn-outline" disabled style="width: 100%; opacity: 0.5;">
                            Need 1,000 GP to convert
                        </button>
                    `}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#closeConvertModal')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        modal.querySelector('#confirmConvertStars')?.addEventListener('click', async () => {
            const result = await convertGPToStars(this.currentUser.id);
            if (result) {
                modal.remove();
                await this.loadDashboard();
            }
        });
    }

    // ================================================================
    // SHOW FUND WALLET MODAL
    // ================================================================
    showFundWalletModal() {
        const modal = document.getElementById('fundWalletModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            this.resetWalletModal();
            this.bindWalletModalEvents();
            this.setupModalCloseHandlers();
        }
    }

    bindWalletModalEvents() {
        document.querySelectorAll('.amount-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedAmount = parseInt(btn.dataset.amount);
                this.updateAmountDisplay();
            });
        });

        document.getElementById('customAmount')?.addEventListener('input', (e) => {
            document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
            this.selectedAmount = parseInt(e.target.value) || 0;
            this.updateAmountDisplay();
        });

        document.getElementById('continueToBankBtn')?.addEventListener('click', () => {
            if (this.selectedAmount < 100) {
                showToast('Please select or enter an amount (minimum ₦100)', 'error');
                return;
            }
            this.showBankDetails();
        });

        document.getElementById('backToAmountBtn')?.addEventListener('click', () => {
            this.resetWalletModal();
        });

        document.getElementById('confirmPaymentBtn')?.addEventListener('click', async () => {
            await this.confirmPayment();
        });

        document.getElementById('copyRefCodeBtn')?.addEventListener('click', () => {
            const code = document.getElementById('referenceCode')?.textContent;
            if (code) {
                navigator.clipboard.writeText(code).then(() => {
                    showToast('Reference code copied!', 'success');
                }).catch(() => {
                    const input = document.createElement('input');
                    input.value = code;
                    document.body.appendChild(input);
                    input.select();
                    document.execCommand('copy');
                    document.body.removeChild(input);
                    showToast('Reference code copied!', 'success');
                });
            }
        });
    }

    async showBankDetails() {
        const fundingOptions = document.querySelector('.funding-options');
        const bankDetails = document.querySelector('.bank-details');
        
        if (fundingOptions && bankDetails) {
            fundingOptions.style.display = 'none';
            bankDetails.style.display = 'block';
            
            const username = this.currentProfile?.username || 'user';
            const randomNum = Math.floor(Math.random() * 9000) + 1000;
            this.referenceCode = `GLM-${username}-${randomNum}`;
            document.getElementById('referenceCode').textContent = this.referenceCode;
            
            const bankAccounts = [
                {
                    bankName: 'MoniePoint Micro Finance Bank',
                    accountName: 'Gliimu LTD',
                    accountNumber: '6315085115'
                },
                {
                    bankName: 'Opay',
                    accountName: 'Gliimu LTD',
                    accountNumber: '6142049426'
                }
            ];
            
            const selectedBank = bankAccounts[Math.floor(Math.random() * bankAccounts.length)];
            
            document.getElementById('bankInfoCard').innerHTML = `
                <p><strong>Bank:</strong> <span style="color: var(--brand-gold);">${selectedBank.bankName}</span></p>
                <p><strong>Account Name:</strong> <span style="color: var(--brand-gold);">${selectedBank.accountName}</span></p>
                <p><strong>Account Number:</strong> <span style="color: var(--brand-gold); font-size: 1.2rem; font-weight: 700;">${selectedBank.accountNumber}</span></p>
                <p><strong>Amount:</strong> <span style="color: var(--brand-gold); font-weight: 700;">₦${this.selectedAmount.toLocaleString()}</span></p>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
                    <i class="fas fa-info-circle"></i> Use <strong style="color: var(--brand-gold);">${this.referenceCode}</strong> as transaction narration
                </p>
            `;
        }
    }

    resetWalletModal() {
        const fundingOptions = document.querySelector('.funding-options');
        const bankDetails = document.querySelector('.bank-details');
        if (fundingOptions && bankDetails) {
            fundingOptions.style.display = 'block';
            bankDetails.style.display = 'none';
        }
        document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
        const customAmount = document.getElementById('customAmount');
        if (customAmount) customAmount.value = '';
        const display = document.getElementById('selectedAmountDisplay');
        if (display) display.style.display = 'none';
        this.selectedAmount = 0;
    }

    updateAmountDisplay() {
        const display = document.getElementById('selectedAmountDisplay');
        const large = document.getElementById('selectedAmountLarge');
        if (display && large) {
            if (this.selectedAmount > 0) {
                display.style.display = 'block';
                large.textContent = `₦${this.selectedAmount.toLocaleString()}`;
            } else {
                display.style.display = 'none';
            }
        }
    }

    async confirmPayment() {
        try {
            const btn = document.getElementById('confirmPaymentBtn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                showToast('Please login first', 'error');
                return;
            }

            const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .select('name, email, username')
                .eq('id', user.id)
                .single();

            if (profileError) {
                console.error('Error fetching profile:', profileError);
            }

            const bankInfo = document.getElementById('bankInfoCard');
            let bankName = 'Opay';
            if (bankInfo) {
                const bankMatch = bankInfo.innerHTML.match(/Bank:<\/strong> <span[^>]*>([^<]*)<\/span>/);
                if (bankMatch && bankMatch[1]) {
                    bankName = bankMatch[1].trim();
                }
            }

            const username = profile?.username || 'user';
            const randomNum = Math.floor(Math.random() * 9000) + 1000;
            const referenceCode = `GLM-${username}-${randomNum}`;
            const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

            const { data, error } = await supabase
                .from('payment_requests')
                .insert([{
                    id: paymentId,
                    user_id: user.id,
                    user_name: profile?.name || 'User',
                    user_email: profile?.email || user.email,
                    amount: this.selectedAmount,
                    bank: bankName,
                    reference_code: referenceCode,
                    status: 'pending',
                    submitted_at: new Date().toISOString()
                }])
                .select();

            if (error) {
                console.error('❌ Error creating payment request:', error);
                showToast('Failed to submit payment: ' + error.message, 'error');
                return;
            }

            showToast(`💰 Payment request submitted! Use code: ${referenceCode} as narration`, 'success');
            
            this.resetWalletModal();
            const modal = document.getElementById('fundWalletModal');
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
            
            await this.loadWallet(this.container);
            
        } catch (error) {
            console.error('❌ Payment error:', error);
            showToast('Failed to submit payment: ' + error.message, 'error');
        } finally {
            const btn = document.getElementById('confirmPaymentBtn');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '✅ I Have Made Payment';
            }
        }
    }

    // ================================================================
    // WALLET TAB
    // ================================================================
    async loadWallet(container) {
        if (!container) {
            container = this.container;
        }
        if (!container) return;

        const profile = this.currentProfile;
        const progressData = await getStudentProgress(this.currentUser.id);

        container.innerHTML = `
            <div class="dashboard-header">
                <h1>Wallet</h1>
                <p>Manage your funds and transactions</p>
            </div>

            <div class="wallet-summary">
                <div class="wallet-balance-card">
                    <h3>Available Balance</h3>
                    <p class="wallet-amount-large">₦${(profile?.wallet_balance || 0).toLocaleString()}</p>
                    <button class="btn-primary" id="fundWalletBtn">
                        <i class="fas fa-plus"></i> Add Funds
                    </button>
                </div>
                <div class="wallet-gp-card">
                    <h3>GP Points</h3>
                    <p class="gp-amount-large">${progressData?.currentGP?.toLocaleString() || 0}</p>
                    <span class="gp-label">Earn more by completing tasks!</span>
                    <button class="btn-outline convert-stars-btn" id="convertStarsFromWallet">
                        <i class="fas fa-star"></i> Convert to Stars
                    </button>
                </div>
            </div>

            <div class="card">
                <h3>Transaction History</h3>
                <div id="transactionHistory">
                    <p class="text-muted">Loading transactions...</p>
                </div>
            </div>
        `;

        document.getElementById('fundWalletBtn')?.addEventListener('click', () => {
            this.showFundWalletModal();
        });

        document.getElementById('convertStarsFromWallet')?.addEventListener('click', () => {
            this.showConvertStarsModal();
        });

        await this.loadTransactionHistory();
    }

    async loadTransactionHistory() {
        const container = document.getElementById('transactionHistory');
        if (!container) return;

        try {
            const [transactions, paymentRequests] = await Promise.all([
                getUserTransactions(),
                this.getPaymentRequests(this.currentUser.id)
            ]);

            let allTransactions = [];

            if (transactions && transactions.length > 0) {
                allTransactions = allTransactions.concat(transactions.map(tx => ({
                    ...tx,
                    type: 'transaction',
                    display_type: tx.type || 'unknown',
                    date: tx.created_at,
                    description: tx.description || `${tx.type === 'credit' ? 'Credited' : 'Debited'}`
                })));
            }

            if (paymentRequests && paymentRequests.length > 0) {
                allTransactions = allTransactions.concat(paymentRequests.map(p => ({
                    ...p,
                    type: 'payment_request',
                    display_type: p.status,
                    date: p.submitted_at,
                    amount: p.amount,
                    description: 'Wallet funding request'
                })));
            }

            allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

            if (allTransactions.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-receipt" style="font-size: 32px; color: var(--text-muted);"></i>
                        <p>No transactions yet</p>
                        <small>Your financial activity will appear here</small>
                    </div>
                `;
                return;
            }

            container.innerHTML = allTransactions.map(item => {
                let amountDisplay = '';
                let statusDisplay = '';
                let description = item.description || 'Transaction';
                let dateDisplay = '';

                const d = new Date(item.date);
                dateDisplay = d.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                });

                if (item.type === 'transaction') {
                    const prefix = item.display_type === 'credit' ? '+' : '';
                    amountDisplay = `${prefix}₦${(item.amount || 0).toLocaleString()}`;
                    const cls = item.display_type === 'credit' ? 'credit' : 'debit';
                    return `
                        <div class="transaction-item">
                            <div class="tx-info">
                                <span class="tx-description">${description}</span>
                                <span class="tx-date">${dateDisplay}</span>
                            </div>
                            <div class="tx-amount ${cls}">${amountDisplay}</div>
                        </div>
                    `;
                } else if (item.type === 'payment_request') {
                    amountDisplay = `₦${(item.amount || 0).toLocaleString()}`;
                    const statusMap = {
                        'pending': '⏳ Pending',
                        'approved': '✅ Approved',
                        'rejected': '❌ Rejected'
                    };
                    statusDisplay = `<span class="tx-status ${item.display_type}">${statusMap[item.display_type] || item.display_type}</span>`;
                    const icon = item.display_type === 'approved' ? 'fa-check-circle' : 
                                 item.display_type === 'rejected' ? 'fa-times-circle' : 'fa-clock';
                    
                    return `
                        <div class="transaction-item">
                            <div class="tx-info">
                                <span class="tx-description">
                                    <i class="fas ${icon}" style="margin-right: 6px;"></i>
                                    ${description}
                                </span>
                                <span class="tx-date">${dateDisplay}</span>
                                ${statusDisplay}
                            </div>
                            <div class="tx-amount ${item.display_type}">${amountDisplay}</div>
                        </div>
                    `;
                }
                return '';
            }).join('');

        } catch (error) {
            console.error('Error loading transactions:', error);
            container.innerHTML = '<p class="text-muted">Failed to load transactions</p>';
        }
    }

    // ================================================================
    // SETUP MODAL CLOSE HANDLERS
    // ================================================================
    setupModalCloseHandlers() {
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = btn.closest('.modal');
                if (modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        });

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(modal => {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                });
            }
        });
    }

    // ================================================================
    // MESSAGES TAB
    // ================================================================
    async loadMessages(container) {
        if (!container) {
            container = this.container;
        }
        if (!container) return;

        const messages = await this.getAllUserMessages();

        container.innerHTML = `
            <div class="dashboard-header">
                <h1><i class="fas fa-envelope"></i> Messages</h1>
                <p>Communicate with administrators based on your needs</p>
            </div>
            
            <div class="card messages-container">
                <div class="messages-header">
                    <h3>Your Messages</h3>
                    <button id="newMessageBtn" class="btn-primary"><i class="fas fa-plus"></i> New Message</button>
                </div>
                
                <div class="message-filters">
                    <button class="filter-chip active" data-filter="all">All (${messages.length})</button>
                    <button class="filter-chip" data-filter="pending">Pending (${messages.filter(m => m._display_status === 'pending').length})</button>
                    <button class="filter-chip" data-filter="replied">Replied (${messages.filter(m => ['replied', 'reviewed', 'approved'].includes(m._display_status)).length})</button>
                    <button class="filter-chip" data-filter="closed">Closed (${messages.filter(m => ['closed', 'rejected'].includes(m._display_status)).length})</button>
                </div>
                
                <div id="messageThreads">
                    ${this.renderMessageThreads(messages)}
                </div>
            </div>
        `;

        document.getElementById('newMessageBtn')?.addEventListener('click', () => {
            this.showNewMessageModal();
        });

        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                const filter = chip.dataset.filter;
                let filtered = messages;
                if (filter === 'pending') {
                    filtered = messages.filter(m => m._display_status === 'pending');
                } else if (filter === 'replied') {
                    filtered = messages.filter(m => ['replied', 'reviewed', 'approved'].includes(m._display_status));
                } else if (filter === 'closed') {
                    filtered = messages.filter(m => ['closed', 'rejected'].includes(m._display_status));
                }
                document.getElementById('messageThreads').innerHTML = this.renderMessageThreads(filtered);
            });
        });

        this.subscribeToMessages();
    }

    async getAllUserMessages() {
        const userId = this.currentUser.id;
        let allMessages = [];

        try {
            const { data: applications } = await supabase
                .from('applications')
                .select('*')
                .eq('user_id', userId)
                .order('submitted_at', { ascending: false });

            if (applications) {
                allMessages = allMessages.concat(applications.map(a => ({
                    ...a,
                    _table: 'applications',
                    _category: 'apply',
                    _display_status: a.status || 'pending',
                    _date: a.submitted_at,
                    _subject: `Application: ${a.role}`,
                    _message: `Applied to become a ${a.role}`,
                    _icon: '🎓'
                })));
            }

            const { data: inquiries } = await supabase
                .from('inquiries')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (inquiries) {
                allMessages = allMessages.concat(inquiries.map(i => ({
                    ...i,
                    _table: 'inquiries',
                    _category: 'inquire',
                    _display_status: i.status || 'pending',
                    _date: i.created_at,
                    _subject: i.subject || 'Inquiry',
                    _message: i.message || '',
                    _icon: '❓'
                })));
            }

            const { data: contracts } = await supabase
                .from('contracts')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (contracts) {
                allMessages = allMessages.concat(contracts.map(c => ({
                    ...c,
                    _table: 'contracts',
                    _category: 'contract',
                    _display_status: c.status || 'pending',
                    _date: c.created_at,
                    _subject: c.subject || 'Contract Offer',
                    _message: c.message || '',
                    _icon: '📄'
                })));
            }

            const { data: submissions } = await supabase
                .from('submissions')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (submissions) {
                allMessages = allMessages.concat(submissions.map(s => ({
                    ...s,
                    _table: 'submissions',
                    _category: 'submit_work',
                    _display_status: s.status || 'pending',
                    _date: s.created_at,
                    _subject: s.subject || 'Work Submission',
                    _message: s.message || '',
                    _icon: '💼'
                })));
            }

            const { data: jobs } = await supabase
                .from('jobs')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (jobs) {
                allMessages = allMessages.concat(jobs.map(j => ({
                    ...j,
                    _table: 'jobs',
                    _category: 'hire',
                    _display_status: j.status || 'pending',
                    _date: j.created_at,
                    _subject: j.subject || 'Job Request',
                    _message: j.message || '',
                    _icon: '👔'
                })));
            }

            allMessages.sort((a, b) => new Date(b._date) - new Date(a._date));

            return allMessages;

        } catch (error) {
            console.error('Error loading messages:', error);
            return [];
        }
    }

    renderMessageThreads(messages) {
        if (!messages || messages.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-inbox" style="font-size: 48px; color: var(--text-secondary);"></i>
                    <h3>No Messages</h3>
                    <p>Start a conversation by clicking "New Message"</p>
                </div>
            `;
        }

        return messages.map((msg, index) => {
            const statusColor = this.getStatusColor(msg._display_status);
            const statusLabel = this.getStatusLabel(msg._display_status);
            const fileHtml = msg.file_url ? `
                <a href="${msg.file_url}" target="_blank" class="message-attachment">
                    <i class="fas fa-paperclip"></i> ${msg.file_name || 'Attachment'}
                </a>
            ` : '';

            const responseHtml = msg.admin_response ? `
                <div class="admin-response">
                    <div class="response-header">
                        <i class="fas fa-reply"></i>
                        <strong>Admin Response</strong>
                        <span class="response-date">${this.getTimeAgo(msg.replied_at || msg.updated_at)}</span>
                    </div>
                    <div class="response-body">${this.escapeHtml(msg.admin_response)}</div>
                </div>
            ` : '';

            const destinationHtml = msg.destination ? `
                <span class="destination-badge">→ ${msg.destination}</span>
            ` : '';

            const gliimuLinkHtml = msg.gliimu_link ? `
                <a href="${msg.gliimu_link}" target="_blank" class="gliimu-link">
                    <i class="fas fa-external-link-alt"></i> View Submission
                </a>
            ` : '';

            return `
                <div class="message-accordion ${msg._display_status}" id="msg-${index}">
                    <div class="accordion-header" onclick="document.getElementById('msg-body-${index}').classList.toggle('open')">
                        <div class="accordion-left">
                            <span class="msg-icon">${msg._icon}</span>
                            <div class="msg-info">
                                <div class="msg-subject">${this.escapeHtml(msg._subject)}</div>
                                <div class="msg-meta">
                                    <span class="msg-category">${this.getCategoryLabel(msg._category)}</span>
                                    <span class="msg-date">${this.getTimeAgo(msg._date)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="accordion-right">
                            <span class="status-badge" style="background: ${statusColor}; color: white; padding: 3px 12px; border-radius: 12px; font-size: 0.7rem; font-weight: 600;">
                                ${statusLabel}
                            </span>
                            <i class="fas fa-chevron-down accordion-arrow"></i>
                        </div>
                    </div>
                    <div class="accordion-body" id="msg-body-${index}">
                        <div class="message-content">
                            <p>${this.escapeHtml(msg._message)}</p>
                            ${fileHtml}
                            ${gliimuLinkHtml}
                            ${destinationHtml}
                        </div>
                        ${responseHtml}
                        <div class="message-actions">
                            ${msg._display_status === 'pending' ? `
                                <span class="pending-label"><i class="fas fa-clock"></i> Waiting for admin response...</span>
                            ` : ''}
                            ${msg._category === 'submit_work' && msg._display_status === 'approved' ? `
                                <span class="approved-label"><i class="fas fa-check-circle"></i> Work Approved!</span>
                            ` : ''}
                            ${msg._category === 'apply' && msg._display_status === 'approved' ? `
                                <span class="approved-label"><i class="fas fa-check-circle"></i> Application Approved! Your role has been updated.</span>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    getCategoryLabel(category) {
        const labels = {
            'apply': '📝 Application',
            'inquire': '❓ Inquiry',
            'contract': '📄 Contract',
            'submit_work': '💼 Work Submission',
            'hire': '👔 Job Request'
        };
        return labels[category] || category;
    }

    getStatusLabel(status) {
        const labels = {
            'pending': 'Pending',
            'approved': '✅ Approved',
            'rejected': '❌ Rejected',
            'replied': '💬 Replied',
            'reviewed': '📋 Reviewed',
            'closed': '🔒 Closed',
            'accepted': '✅ Accepted',
            'graded': '📊 Graded'
        };
        return labels[status] || status;
    }

    getStatusColor(status) {
        const colors = {
            'pending': '#f59e0b',
            'approved': '#10b981',
            'rejected': '#ef4444',
            'replied': '#3b82f6',
            'reviewed': '#8b5cf6',
            'closed': '#64748b',
            'accepted': '#10b981',
            'graded': '#8b5cf6'
        };
        return colors[status] || '#64748b';
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ================================================================
    // SHOW NEW MESSAGE MODAL
    // ================================================================
    showNewMessageModal() {
        let modal = document.getElementById('newMessageModal');
        if (modal) {
            modal.classList.add('active');
            const form = document.getElementById('newMessageForm');
            if (form) form.reset();
            const preview = document.getElementById('messageFilePreview');
            if (preview) preview.style.display = 'none';
            const roleGroup = document.getElementById('roleSelectGroup');
            if (roleGroup) roleGroup.style.display = 'none';
            const workGroup = document.getElementById('workLinkGroup');
            if (workGroup) workGroup.style.display = 'none';
            window._messageFileData = null;
            return;
        }

        modal = document.createElement('div');
        modal.id = 'newMessageModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2><i class="fas fa-paper-plane"></i> New Message</h2>
                    <button class="modal-close" id="closeNewMessageModal">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="newMessageForm" novalidate>
                        <div class="form-group">
                            <label>Category *</label>
                            <select id="messageCategory" name="category">
                                <option value="">Select a category...</option>
                                <option value="apply">📝 Apply (Become a Student/Instructor/Ambassador)</option>
                                <option value="inquire">❓ Inquire (Ask a question)</option>
                                <option value="contract">📄 Offer Contract (Propose a contract)</option>
                                <option value="submit_work">💼 Submit Work (Share your project)</option>
                                <option value="hire">👔 Employ/Hire (Request employment)</option>
                            </select>
                            <small id="categoryHint">Select a category to route your message to the right admin</small>
                        </div>

                        <div class="form-group" id="roleSelectGroup" style="display:none;">
                            <label>Apply for Role</label>
                            <select id="applyRole" name="applyRole">
                                <option value="student">Student</option>
                                <option value="instructor">Instructor</option>
                                <option value="ambassador">Ambassador</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Subject *</label>
                            <input type="text" id="messageSubject" name="subject" placeholder="Enter message subject">
                        </div>

                        <div class="form-group">
                            <label>Message *</label>
                            <textarea id="messageBody" name="message" rows="5" placeholder="Type your message in detail..."></textarea>
                        </div>

                        <div class="form-group">
                            <label>Attachments (PDF or Images)</label>
                            <div class="upload-field" id="uploadField">
                                <span class="upload-icon">📎</span>
                                <span class="upload-text">Click to upload file</span>
                                <small>Supports PDF, JPG, PNG (Max 10MB)</small>
                                <input type="file" id="messageFileInput" accept=".pdf,image/*" style="display:none;">
                            </div>
                            <div class="file-preview" id="messageFilePreview" style="display:none;">
                                <i class="fas fa-file"></i>
                                <span class="file-name" id="messageFileName">No file selected</span>
                                <button type="button" class="btn-remove-file" id="removeMessageFileBtn">✕ Remove</button>
                            </div>
                        </div>

                        <div class="form-group" id="workLinkGroup" style="display:none;">
                            <label>Gliimu Link (for work submissions)</label>
                            <input type="url" id="workLink" name="workLink" placeholder="https://gliimu.com/submit/your-work">
                            <small>If you have a published work on Gliimu, paste the link here</small>
                        </div>

                        <button type="button" id="sendMessageBtn" class="btn-primary" style="width:100%;">
                            <i class="fas fa-paper-plane"></i> Send Message
                        </button>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('closeNewMessageModal')?.addEventListener('click', () => {
            modal.classList.remove('active');
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });

        document.getElementById('messageCategory')?.addEventListener('change', function(e) {
            const category = this.value;
            const hint = document.getElementById('categoryHint');
            const roleGroup = document.getElementById('roleSelectGroup');
            const workLinkGroup = document.getElementById('workLinkGroup');

            roleGroup.style.display = 'none';
            workLinkGroup.style.display = 'none';

            if (category === 'apply') {
                roleGroup.style.display = 'block';
                hint.textContent = 'Your application will be sent to the Manager for review.';
            } else if (category === 'submit_work') {
                workLinkGroup.style.display = 'block';
                hint.textContent = 'Your work submission will be sent to CRM for review.';
            } else {
                const hints = {
                    'inquire': 'Your inquiry will be sent to CRM for response.',
                    'contract': 'Your contract offer will be sent to the Manager.',
                    'hire': 'Your job request will be sent to the Manager.'
                };
                hint.textContent = hints[category] || 'Select a category to route your message to the right admin';
            }
        });

        document.getElementById('uploadField')?.addEventListener('click', function() {
            document.getElementById('messageFileInput').click();
        });

        document.getElementById('messageFileInput')?.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            if (file.size > 10 * 1024 * 1024) {
                showToast('File too large. Maximum 10MB.', 'error');
                this.value = '';
                return;
            }

            const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!validTypes.includes(file.type)) {
                showToast('Only PDF and Image files are allowed.', 'error');
                this.value = '';
                return;
            }

            window._messageFileData = file;
            const preview = document.getElementById('messageFilePreview');
            const fileName = document.getElementById('messageFileName');
            
            if (fileName) {
                fileName.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
            }
            if (preview) {
                preview.style.display = 'flex';
            }
            showToast(`📎 ${file.name} selected`, 'success');
        });

        document.getElementById('removeMessageFileBtn')?.addEventListener('click', function() {
            window._messageFileData = null;
            document.getElementById('messageFileInput').value = '';
            const preview = document.getElementById('messageFilePreview');
            if (preview) {
                preview.style.display = 'none';
            }
            document.getElementById('messageFileName').textContent = 'No file selected';
        });

        document.getElementById('sendMessageBtn')?.addEventListener('click', async function() {
            const form = document.getElementById('newMessageForm');
            if (!form) {
                showToast('Form not found', 'error');
                return;
            }

            const formData = new FormData(form);
            
            const category = formData.get('category') || '';
            const subject = formData.get('subject') || '';
            const message = formData.get('message') || '';
            const applyRole = formData.get('applyRole') || 'student';
            const workLink = formData.get('workLink') || '';

            if (!category) {
                showToast('Please select a category', 'error');
                return;
            }

            if (!subject || subject.length === 0) {
                showToast('Please enter a subject', 'error');
                document.getElementById('messageSubject').focus();
                return;
            }

            if (!message || message.length === 0) {
                showToast('Please enter a message', 'error');
                document.getElementById('messageBody').focus();
                return;
            }

            const btn = document.getElementById('sendMessageBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

            window._tempMessageData = {
                category: category,
                subject: subject,
                message: message,
                applyRole: applyRole,
                workLink: workLink
            };

            const dashboard = window._generalDashboard || this._dashboard || this;
            const success = await dashboard.submitNewMessageV2();
            
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';

            if (success) {
                modal.classList.remove('active');
                form.reset();
                document.getElementById('messageFilePreview').style.display = 'none';
                document.getElementById('roleSelectGroup').style.display = 'none';
                document.getElementById('workLinkGroup').style.display = 'none';
                window._messageFileData = null;
                document.getElementById('messageFileInput').value = '';
                window._tempMessageData = null;
            }
        });

        window._generalDashboard = this;
    }

    async submitNewMessageV2() {
        const data = window._tempMessageData;
        if (!data) {
            showToast('No message data found', 'error');
            return false;
        }

        const { category, subject, message, applyRole, workLink } = data;
        const file = window._messageFileData;

        try {
            const userId = this.currentUser.id;
            const profile = this.currentProfile;

            let fileUrl = null;
            let fileName = null;

            if (file) {
                const uploaded = await this.uploadMessageFile(file);
                if (uploaded) {
                    fileUrl = uploaded.url;
                    fileName = uploaded.name;
                }
            }

            let tableName = '';
            let insertData = {};

            const generateId = () => {
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    const r = Math.random() * 16 | 0;
                    const v = c === 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            };

            switch(category) {
                case 'apply':
                    tableName = 'applications';
                    insertData = {
                        id: generateId(),
                        user_id: userId,
                        full_name: profile?.name || 'User',
                        email: this.currentUser.email,
                        username: profile?.username || 'user',
                        role: applyRole || 'student',
                        status: 'pending',
                        submitted_at: new Date().toISOString()
                    };
                    await supabase
                        .from('user_profiles')
                        .update({
                            application_status: 'pending',
                            applied_role: applyRole || 'student'
                        })
                        .eq('id', userId);
                    break;

                case 'inquire':
                    tableName = 'inquiries';
                    insertData = {
                        id: generateId(),
                        user_id: userId,
                        subject: subject,
                        message: message,
                        file_url: fileUrl,
                        file_name: fileName,
                        status: 'pending',
                        created_at: new Date().toISOString()
                    };
                    break;

                case 'contract':
                    tableName = 'contracts';
                    insertData = {
                        id: generateId(),
                        user_id: userId,
                        subject: subject,
                        message: message,
                        file_url: fileUrl,
                        file_name: fileName,
                        status: 'pending',
                        created_at: new Date().toISOString()
                    };
                    break;

                case 'submit_work':
                    tableName = 'submissions';
                    insertData = {
                        id: generateId(),
                        user_id: userId,
                        subject: subject,
                        message: message,
                        file_url: fileUrl,
                        file_name: fileName,
                        gliimu_link: workLink || null,
                        status: 'pending',
                        created_at: new Date().toISOString()
                    };
                    break;

                case 'hire':
                    tableName = 'jobs';
                    insertData = {
                        id: generateId(),
                        user_id: userId,
                        subject: subject,
                        message: message,
                        file_url: fileUrl,
                        file_name: fileName,
                        status: 'pending',
                        created_at: new Date().toISOString()
                    };
                    break;

                default:
                    showToast('Invalid category selected', 'error');
                    return false;
            }

            const { error } = await supabase
                .from(tableName)
                .insert([insertData]);

            if (error) {
                console.error('Error sending message:', error);
                showToast('Failed to send message: ' + error.message, 'error');
                return false;
            }

            showToast('✅ Message sent successfully!', 'success');
            await this.loadMessages(this.container);

            window._messageFileData = null;
            window._tempMessageData = null;

            return true;

        } catch (error) {
            console.error('Error submitting message:', error);
            showToast('Failed to send message: ' + error.message, 'error');
            return false;
        }
    }

    async uploadMessageFile(file) {
        if (!file) return null;

        const fileExt = file.name.split('.').pop();
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 8);
        const fileName = `${timestamp}_${randomStr}.${fileExt}`;
        const path = `message_attachments/${fileName}`;

        try {
            const { data, error } = await supabase.storage
                .from('hub_content')
                .upload(path, file, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: file.type || 'application/octet-stream'
                });

            if (error) {
                console.error('Upload error:', error);
                showToast('File upload failed: ' + error.message, 'error');
                return null;
            }

            const { data: urlData } = supabase.storage
                .from('hub_content')
                .getPublicUrl(path);

            return {
                url: urlData.publicUrl,
                name: file.name
            };

        } catch (error) {
            console.error('Upload error:', error);
            showToast('File upload failed', 'error');
            return null;
        }
    }

    subscribeToMessages() {
        if (this._messageSubscription) {
            this._messageSubscription.unsubscribe();
        }

        const userId = this.currentUser.id;
        const tables = ['applications', 'inquiries', 'contracts', 'submissions', 'jobs'];
        
        tables.forEach(table => {
            const channel = supabase
                .channel(`${table}_changes_${userId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: table,
                        filter: `user_id=eq.${userId}`
                    },
                    () => {
                        this.loadMessages(this.container);
                    }
                )
                .subscribe();
        });
    }

    // ================================================================
    // PORTFOLIO TAB
    // ================================================================
    async loadPortfolio(container) {
        if (!container) {
            container = this.container;
        }
        if (!container) return;

        const user = this.currentUser;
        const profile = this.currentProfile;
        const role = profile?.role || 'user';
        const username = profile?.username || user?.email?.split('@')[0] || 'user';
        const portfolioUrl = `${window.location.origin}/u/${username}`;

        const isStudent = role === 'student';
        const isInstructor = role === 'instructor';
        const canAccessFull = isStudent || isInstructor;

        let portfolioContent = '';

        if (isStudent) {
            portfolioContent = `
                <div class="card portfolio-link-card">
                    <div class="portfolio-header">
                        <h3><i class="fas fa-link"></i> Your Portfolio</h3>
                        <div class="portfolio-url-container">
                            <input type="text" id="portfolioUrl" value="${portfolioUrl}" readonly>
                            <button id="copyPortfolioUrl" class="btn-icon" title="Copy URL">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                    <div class="portfolio-iframe-container" style="margin-top: 16px; border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; height: 400px;">
                        <iframe src="${portfolioUrl}" style="width: 100%; height: 100%; border: none;" loading="lazy"></iframe>
                    </div>
                    <div class="portfolio-qr-container" style="margin-top: 16px; display: flex; flex-direction: column; align-items: center;">
                        <div id="portfolioQrCode" style="display: flex; justify-content: center; padding: 10px; background: white; border-radius: 12px;">
                            <canvas id="qrCanvas"></canvas>
                        </div>
                        <p class="qr-hint" style="margin-top: 8px; font-size: 0.8rem; color: var(--text-muted);">Scan to view my portfolio</p>
                    </div>
                </div>
            `;
        } else {
            portfolioContent = `
                <div class="card portfolio-view-card" style="text-align: center; padding: 40px 20px;">
                    <div style="font-size: 4rem; margin-bottom: 1rem;">
                        <i class="fas fa-users" style="color: var(--brand-gold);"></i>
                    </div>
                    <h3 style="font-size: 1.3rem; margin-bottom: 0.5rem; color: var(--text-primary);">View Student & Ambassador Portfolios</h3>
                    <p style="color: var(--text-secondary); max-width: 500px; margin: 0 auto 1.5rem;">
                        Explore the amazing work created by our students and ambassadors. See what they've built and get inspired!
                    </p>
                    <a href="/portfolio" class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px; padding: 12px 32px;">
                        <i class="fas fa-external-link-alt"></i> Browse Portfolios
                    </a>
                </div>
            `;
        }

        const navLinks = `
            <div class="card portfolio-nav-card" style="margin-top: 20px;">
                <h3 style="font-size: 1rem; margin-bottom: 12px; color: var(--text-secondary);">
                    <i class="fas fa-compass" style="color: var(--brand-gold);"></i> Quick Access
                </h3>
                <div class="portfolio-nav-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px;">
                    <a href="/library" class="portfolio-nav-item ${canAccessFull ? '' : 'locked'}" 
                       ${!canAccessFull ? 'data-locked="true"' : ''}>
                        <div class="nav-icon"><i class="fas fa-book"></i></div>
                        <div class="nav-label">Library</div>
                    </a>
                    <a href="/hub" class="portfolio-nav-item ${canAccessFull ? '' : 'locked'}"
                       ${!canAccessFull ? 'data-locked="true"' : ''}>
                        <div class="nav-icon"><i class="fas fa-th-large"></i></div>
                        <div class="nav-label">Hub</div>
                    </a>
                    <a href="/chat" class="portfolio-nav-item ${canAccessFull ? '' : 'locked'}"
                       ${!canAccessFull ? 'data-locked="true"' : ''}>
                        <div class="nav-icon"><i class="fas fa-comments"></i></div>
                        <div class="nav-label">Chat Room</div>
                    </a>
                    <a href="/merchandise" class="portfolio-nav-item ${canAccessFull ? '' : 'locked'}"
                       ${!canAccessFull ? 'data-locked="true"' : ''}>
                        <div class="nav-icon"><i class="fas fa-shopping-bag"></i></div>
                        <div class="nav-label">Merchandise</div>
                    </a>
                    <a href="/virtualroom" class="portfolio-nav-item ${canAccessFull ? '' : 'locked'}"
                       data-locked="${!canAccessFull}">
                        <div class="nav-icon"><i class="fas fa-video"></i></div>
                        <div class="nav-label">Virtual Room</div>
                        ${!canAccessFull ? '<span class="lock-icon"><i class="fas fa-lock"></i></span>' : ''}
                    </a>
                    <a href="/course" class="portfolio-nav-item ${canAccessFull ? '' : 'locked'}"
                       data-locked="${!canAccessFull}">
                        <div class="nav-icon"><i class="fas fa-graduation-cap"></i></div>
                        <div class="nav-label">Courses</div>
                        ${!canAccessFull ? '<span class="lock-icon"><i class="fas fa-lock"></i></span>' : ''}
                    </a>
                </div>
                ${!canAccessFull ? `
                    <div style="margin-top: 12px; padding: 12px 16px; background: rgba(251, 176, 64, 0.1); border-radius: 8px; border: 1px solid rgba(251, 176, 64, 0.2);">
                        <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0;">
                            <i class="fas fa-info-circle" style="color: var(--brand-gold);"></i> 
                            <strong>Apply to become a student</strong> to unlock Virtual Room and Courses.
                        </p>
                    </div>
                ` : ''}
            </div>
        `;

        container.innerHTML = `
            <div class="dashboard-header">
                <h1><i class="fas fa-user-circle"></i> Portfolio</h1>
                <p>${isStudent ? 'Your creative showcase' : 'Discover the work of our community'}</p>
            </div>

            ${portfolioContent}
            ${navLinks}
        `;

        document.getElementById('copyPortfolioUrl')?.addEventListener('click', () => {
            const urlInput = document.getElementById('portfolioUrl');
            if (urlInput) {
                urlInput.select();
                document.execCommand('copy');
                showToast('Portfolio URL copied!', 'success');
            }
        });

        if (isStudent) {
            this.generateQRCode(portfolioUrl);
        }

        document.querySelectorAll('.portfolio-nav-item[data-locked="true"]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                if (item.dataset.locked === 'true') {
                    this.showAccessModal();
                }
            });
        });
    }

    showAccessModal() {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px; text-align: center;">
                <div class="modal-header">
                    <h2><i class="fas fa-lock" style="color: var(--brand-gold);"></i> Access Restricted</h2>
                    <button class="modal-close" id="closeAccessModal">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">
                        <i class="fas fa-graduation-cap" style="color: var(--brand-gold);"></i>
                    </div>
                    <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem;">Only Students and Instructors Can Access</h3>
                    <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 1.5rem;">
                        Virtual Rooms and Courses are exclusive to students and instructors. 
                        Apply to become a student to unlock these features and start learning from industry experts!
                    </p>
                    <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                        <button id="applyNowBtn" class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px;">
                            <i class="fas fa-paper-plane"></i> Apply Now
                        </button>
                        <button id="closeAccessBtn" class="btn-outline">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('closeAccessModal')?.addEventListener('click', () => modal.remove());
        document.getElementById('closeAccessBtn')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        document.getElementById('applyNowBtn')?.addEventListener('click', () => {
            modal.remove();
            if (window.switchTab) {
                window.switchTab('messages');
                showToast('Go to Messages to apply for a role', 'info');
            } else {
                window.location.href = '/user?tab=messages';
            }
        });
    }

    generateQRCode(url) {
        if (typeof QRCode === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
            script.onload = () => {
                this.generateQRCode(url);
            };
            document.head.appendChild(script);
            return;
        }

        const canvas = document.getElementById('qrCanvas');
        if (canvas) {
            try {
                new QRCode(canvas, {
                    text: url,
                    width: 150,
                    height: 150,
                    colorDark: '#1a1c4a',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
            } catch (error) {
                console.error('Error generating QR code:', error);
            }
        }
    }
}

export default GeneralDashboard;
