// ============================================
// USER WALLET - Wallet Logic
// Path: /frontend/js/pages/user/user-wallet.js
// Purpose: Handle wallet, funding, transactions, GP conversion
// ============================================

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';
import { getUserTransactions, getReferralCount } from '../../modules/supabase.js';
import { getStudentProgress, convertGPToStars } from '../../modules/progression.js';
import { getBankDetails } from '../../modules/settings.js';
import { formatCurrency, generateId } from './user-utils.js';
import { modalManager } from './user-modals.js';

// ============================================
// LOAD WALLET
// ============================================
export async function loadWallet(container, dashboard) {
    if (!container) {
        container = dashboard.container;
    }
    if (!container) return;

    var profile = dashboard.currentProfile;
    var progressData = await getStudentProgress(dashboard.currentUser.id);

    container.innerHTML = `
        <div class="dashboard-header">
            <h1>Wallet</h1>
            <p>Manage your funds and transactions</p>
        </div>

        <div class="wallet-summary">
            <div class="wallet-balance-card">
                <h3>Available Balance</h3>
                <p class="wallet-amount-large">${formatCurrency(profile?.wallet_balance || 0)}</p>
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

    document.getElementById('fundWalletBtn')?.addEventListener('click', function() {
        showFundWalletModal(dashboard);
    });

    document.getElementById('convertStarsFromWallet')?.addEventListener('click', function() {
        showConvertStarsModal(dashboard);
    });

    await loadTransactionHistory(dashboard);
    dashboard.setupModalCloseHandlers();
}

// ============================================
// LOAD TRANSACTION HISTORY
// ============================================
export async function loadTransactionHistory(dashboard) {
    var container = document.getElementById('transactionHistory');
    if (!container) return;

    try {
        var [transactions, paymentRequests] = await Promise.all([
            getUserTransactions(),
            getPaymentRequests(dashboard.currentUser.id)
        ]);

        var allTransactions = [];

        if (transactions && transactions.length > 0) {
            allTransactions = allTransactions.concat(transactions.map(function(tx) {
                return {
                    ...tx,
                    type: 'transaction',
                    display_type: tx.type || 'unknown',
                    date: tx.created_at,
                    description: tx.description || (tx.type === 'credit' ? 'Credited' : 'Debited')
                };
            }));
        }

        if (paymentRequests && paymentRequests.length > 0) {
            allTransactions = allTransactions.concat(paymentRequests.map(function(p) {
                return {
                    ...p,
                    type: 'payment_request',
                    display_type: p.status,
                    date: p.submitted_at,
                    amount: p.amount,
                    description: 'Wallet funding request'
                };
            }));
        }

        allTransactions.sort(function(a, b) {
            return new Date(b.date) - new Date(a.date);
        });

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

        container.innerHTML = allTransactions.map(function(item) {
            var amountDisplay = '';
            var statusDisplay = '';
            var description = item.description || 'Transaction';
            var dateDisplay = '';

            var d = new Date(item.date);
            dateDisplay = d.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });

            if (item.type === 'transaction') {
                var prefix = item.display_type === 'credit' ? '+' : '';
                amountDisplay = prefix + formatCurrency(item.amount || 0);
                var cls = item.display_type === 'credit' ? 'credit' : 'debit';
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
                amountDisplay = formatCurrency(item.amount || 0);
                var statusMap = {
                    'pending': '⏳ Pending',
                    'approved': '✅ Approved',
                    'rejected': '❌ Rejected'
                };
                statusDisplay = '<span class="tx-status ' + item.display_type + '">' + (statusMap[item.display_type] || item.display_type) + '</span>';
                var icon = item.display_type === 'approved' ? 'fa-check-circle' : 
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

// ============================================
// GET PAYMENT REQUESTS
// ============================================
export async function getPaymentRequests(userId) {
    try {
        var { data, error } = await supabase
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

// ============================================
// SHOW FUND WALLET MODAL
// ============================================
export function showFundWalletModal(dashboard) {
    var modal = document.getElementById('fundWalletModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        resetWalletModal();
        bindWalletModalEvents(dashboard);
        dashboard.setupModalCloseHandlers();
    }
}

// ============================================
// BIND WALLET MODAL EVENTS
// ============================================
function bindWalletModalEvents(dashboard) {
    dashboard.selectedAmount = dashboard.selectedAmount || 0;

    document.querySelectorAll('.amount-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.amount-btn').forEach(function(b) {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            dashboard.selectedAmount = parseInt(btn.dataset.amount);
            updateAmountDisplay(dashboard);
        });
    });

    document.getElementById('customAmount')?.addEventListener('input', function(e) {
        document.querySelectorAll('.amount-btn').forEach(function(b) {
            b.classList.remove('active');
        });
        dashboard.selectedAmount = parseInt(e.target.value) || 0;
        updateAmountDisplay(dashboard);
    });

    document.getElementById('continueToBankBtn')?.addEventListener('click', function() {
        if (dashboard.selectedAmount < 100) {
            showToast('Please select or enter an amount (minimum ₦100)', 'error');
            return;
        }
        showBankDetails(dashboard);
    });

    document.getElementById('backToAmountBtn')?.addEventListener('click', function() {
        resetWalletModal();
    });

    document.getElementById('confirmPaymentBtn')?.addEventListener('click', async function() {
        await confirmPayment(dashboard);
    });

    document.getElementById('copyRefCodeBtn')?.addEventListener('click', function() {
        var code = document.getElementById('referenceCode')?.textContent;
        if (code) {
            navigator.clipboard.writeText(code).then(function() {
                showToast('Reference code copied!', 'success');
            }).catch(function() {
                var input = document.createElement('input');
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

// ============================================
// SHOW BANK DETAILS
// ============================================
async function showBankDetails(dashboard) {
    var fundingOptions = document.querySelector('.funding-options');
    var bankDetails = document.querySelector('.bank-details');
    
    if (fundingOptions && bankDetails) {
        fundingOptions.style.display = 'none';
        bankDetails.style.display = 'block';
        
        var username = dashboard.currentProfile?.username || 'user';
        var randomNum = Math.floor(Math.random() * 9000) + 1000;
        dashboard.referenceCode = 'GLM-' + username + '-' + randomNum;
        document.getElementById('referenceCode').textContent = dashboard.referenceCode;
        
        var bankAccounts = [
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
        
        var selectedBank = bankAccounts[Math.floor(Math.random() * bankAccounts.length)];
        
        document.getElementById('bankInfoCard').innerHTML = `
            <p><strong>Bank:</strong> <span style="color: var(--brand-gold);">${selectedBank.bankName}</span></p>
            <p><strong>Account Name:</strong> <span style="color: var(--brand-gold);">${selectedBank.accountName}</span></p>
            <p><strong>Account Number:</strong> <span style="color: var(--brand-gold); font-size: 1.2rem; font-weight: 700;">${selectedBank.accountNumber}</span></p>
            <p><strong>Amount:</strong> <span style="color: var(--brand-gold); font-weight: 700;">${formatCurrency(dashboard.selectedAmount)}</span></p>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
                <i class="fas fa-info-circle"></i> Use <strong style="color: var(--brand-gold);">${dashboard.referenceCode}</strong> as transaction narration
            </p>
        `;
    }
}

// ============================================
// RESET WALLET MODAL
// ============================================
function resetWalletModal() {
    var fundingOptions = document.querySelector('.funding-options');
    var bankDetails = document.querySelector('.bank-details');
    if (fundingOptions && bankDetails) {
        fundingOptions.style.display = 'block';
        bankDetails.style.display = 'none';
    }
    document.querySelectorAll('.amount-btn').forEach(function(b) {
        b.classList.remove('active');
    });
    var customAmount = document.getElementById('customAmount');
    if (customAmount) customAmount.value = '';
    var display = document.getElementById('selectedAmountDisplay');
    if (display) display.style.display = 'none';
}

// ============================================
// UPDATE AMOUNT DISPLAY
// ============================================
function updateAmountDisplay(dashboard) {
    var display = document.getElementById('selectedAmountDisplay');
    var large = document.getElementById('selectedAmountLarge');
    if (display && large) {
        if (dashboard.selectedAmount > 0) {
            display.style.display = 'block';
            large.textContent = formatCurrency(dashboard.selectedAmount);
        } else {
            display.style.display = 'none';
        }
    }
}

// ============================================
// CONFIRM PAYMENT
// ============================================
export async function confirmPayment(dashboard) {
    try {
        var btn = document.getElementById('confirmPaymentBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        }

        var { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showToast('Please login first', 'error');
            return;
        }

        var { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('name, email, username')
            .eq('id', user.id)
            .single();

        if (profileError) {
            console.error('Error fetching profile:', profileError);
        }

        var bankInfo = document.getElementById('bankInfoCard');
        var bankName = 'Opay';
        if (bankInfo) {
            var bankMatch = bankInfo.innerHTML.match(/Bank:<\/strong> <span[^>]*>([^<]*)<\/span>/);
            if (bankMatch && bankMatch[1]) {
                bankName = bankMatch[1].trim();
            }
        }

        var username = profile?.username || 'user';
        var randomNum = Math.floor(Math.random() * 9000) + 1000;
        var referenceCode = 'GLM-' + username + '-' + randomNum;
        var paymentId = 'pay_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

        var { data, error } = await supabase
            .from('payment_requests')
            .insert([{
                id: paymentId,
                user_id: user.id,
                user_name: profile?.name || 'User',
                user_email: profile?.email || user.email,
                amount: dashboard.selectedAmount,
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

        showToast('💰 Payment request submitted! Use code: ' + referenceCode + ' as narration', 'success');
        
        resetWalletModal();
        var modal = document.getElementById('fundWalletModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
        
        await loadWallet(dashboard.container, dashboard);
        
    } catch (error) {
        console.error('❌ Payment error:', error);
        showToast('Failed to submit payment: ' + error.message, 'error');
    } finally {
        var btn = document.getElementById('confirmPaymentBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '✅ I Have Made Payment';
        }
    }
}

// ============================================
// SHOW CONVERT STARS MODAL
// ============================================
export function showConvertStarsModal(dashboard) {
    var profile = dashboard.currentProfile;
    var currentGP = profile?.gp_points || 0;
    var starsEarned = Math.floor(currentGP / 1000);
    
    var modal = document.createElement('div');
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
    document.body.style.overflow = 'hidden';

    modal.querySelector('#closeConvertModal')?.addEventListener('click', function() {
        modal.remove();
        document.body.style.overflow = '';
    });
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
            document.body.style.overflow = '';
        }
    });

    modal.querySelector('#confirmConvertStars')?.addEventListener('click', async function() {
        var result = await convertGPToStars(dashboard.currentUser.id);
        if (result) {
            modal.remove();
            document.body.style.overflow = '';
            await loadWallet(dashboard.container, dashboard);
        }
    });
}
