// ============================================
// GLIIMU DASHBOARD - SUPABASE INTEGRATED
// Complete working version with real-time sync
// ============================================

import { 
    supabase, 
    getCurrentUser, 
    getUserProfile, 
    updateUserProfile,
    updateWalletBalance,
    createPaymentRequest,
    getUserPayments,
    getUserTransactions,
    saveToShelf,
    getSavedItems,
    recordRecentlyViewed,
    getRecentlyViewed,
    subscribeToUserPayments
} from '../modules/supabase.js';

import { showToast } from '../modules/toast.js';

// Global state
let currentUser = null;
let currentUserProfile = null;
let currentRole = 'student';
let currentTab = 'dashboard';
let allMaterials = [];
let paymentSubscription = null;

// Role-based tab configurations
const roleTabs = {
    student: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'library', name: 'Library', icon: 'fas fa-book' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    instructor: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'students', name: 'My Students', icon: 'fas fa-users' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    admin: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'users', name: 'Users', icon: 'fas fa-users-cog' },
        { id: 'finance', name: 'Finance', icon: 'fas fa-chart-line' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    partner: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'projects', name: 'Projects', icon: 'fas fa-project-diagram' },
        { id: 'wallet', name: 'Wallet', icon: 'fas fa-wallet' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ],
    other: [
        { id: 'dashboard', name: 'Dashboard', icon: 'fas fa-tachometer-alt' },
        { id: 'settings', name: 'Settings', icon: 'fas fa-cog' }
    ]
};

// ============================================
// THEME HANDLING
// ============================================

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// ============================================
// USER DATA LOADING
// ============================================

async function loadUserData() {
    // Try to get from Supabase first
    const supabaseUser = await getCurrentUser();
    const profile = await getUserProfile();
    
    if (supabaseUser && profile) {
        currentUser = {
            id: supabaseUser.id,
            name: profile.name,
            email: profile.email,
            role: profile.role,
            plan: profile.plan,
            walletBalance: profile.wallet_balance,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=fbb040&color=fff`
        };
        currentRole = profile.role || 'student';
        
        // Save to localStorage for quick access
        localStorage.setItem('glimu_user', JSON.stringify(currentUser));
    } else {
        // Fallback to localStorage
        const savedUser = localStorage.getItem('glimu_user');
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
            currentRole = currentUser.role?.toLowerCase() || 'student';
        } else {
            // Demo user for testing
            currentUser = {
                id: 'demo_001',
                name: 'Alex Creator',
                email: 'alex@example.com',
                role: 'student',
                plan: 'basic',
                walletBalance: 25000,
                avatar: 'https://ui-avatars.com/api/?name=Alex+Creator&background=fbb040&color=fff'
            };
            currentRole = 'student';
        }
    }
    
    // Update UI
    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');
    const avatarImg = document.querySelector('.user-avatar img');
    
    if (userNameEl) userNameEl.textContent = currentUser.name;
    if (userRoleEl) userRoleEl.textContent = currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
    if (avatarImg) {
        avatarImg.src = currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=fbb040&color=fff`;
    }
}

// ============================================
// SIDEBAR NAVIGATION
// ============================================

function buildSidebar() {
    const tabs = roleTabs[currentRole] || roleTabs.other;
    const sidebarNav = document.getElementById('sidebarNav');
    
    if (!sidebarNav) return;
    
    sidebarNav.innerHTML = tabs.map(tab => `
        <div class="nav-item ${currentTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
            <i class="${tab.icon}"></i>
            <span>${tab.name}</span>
        </div>
    `).join('');
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    currentTab = tabId;
    
    document.querySelectorAll('.nav-item').forEach(item => {
        const itemTab = item.getAttribute('data-tab');
        if (itemTab === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    document.querySelectorAll('.dashboard-section').forEach(section => {
        section.classList.remove('active');
    });
    
    const activeSection = document.getElementById(`${tabId}-section`);
    if (activeSection) {
        activeSection.classList.add('active');
    }
    
    loadTabData(tabId);
}

// ============================================
// TAB DATA LOADING
// ============================================

function loadTabData(tabId) {
    switch(tabId) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'library':
            renderLibraryTab();
            break;
        case 'wallet':
            renderWallet();
            break;
        case 'settings':
            renderSettings();
            break;
        case 'students':
            renderStudents();
            break;
        case 'users':
            renderUsers();
            break;
        case 'finance':
            renderFinance();
            break;
        case 'projects':
            renderProjects();
            break;
        default:
            renderDashboard();
    }
}

// ============================================
// DASHBOARD RENDER
// ============================================

async function renderDashboard() {
    const container = document.getElementById('dashboard-section');
    if (!container) return;
    
    const usage = JSON.parse(localStorage.getItem('glimu_usage_guest') || '{"booksRead":0,"bundlesDownloaded":0}');
    const savedItems = await getSavedItems();
    const walletBalance = currentUser?.walletBalance || 25000;
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Dashboard</h2>
                <p>Welcome back, ${currentUser?.name || 'Creator'}!</p>
            </div>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-book"></i></div>
                <div class="stat-info">
                    <h3>Books Read</h3>
                    <div class="stat-value">${usage.booksRead || 0}</div>
                    <div class="stat-sub">This month</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-box"></i></div>
                <div class="stat-info">
                    <h3>Bundles Downloaded</h3>
                    <div class="stat-value">${usage.bundlesDownloaded || 0}</div>
                    <div class="stat-sub">This month</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-bookmark"></i></div>
                <div class="stat-info">
                    <h3>Saved Items</h3>
                    <div class="stat-value">${savedItems.length}</div>
                    <div class="stat-sub">In your shelf</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-wallet"></i></div>
                <div class="stat-info">
                    <h3>Wallet Balance</h3>
                    <div class="stat-value" id="walletBalanceDisplay">₦${walletBalance.toLocaleString()}</div>
                    <button class="add-funds-small" id="quickAddFunds">Add Funds</button>
                </div>
            </div>
        </div>
        
        <div class="action-cards">
            <div class="action-card" id="goToLibraryBtn">
                <i class="fas fa-book-open"></i>
                <h4>Go to Library</h4>
                <p>Browse books and bundles</p>
            </div>
            <div class="action-card" id="viewSavedBtn">
                <i class="fas fa-bookmark"></i>
                <h4>My Shelf</h4>
                <p>${savedItems.length} saved items</p>
            </div>
            <div class="action-card" id="upgradePlanCard">
                <i class="fas fa-crown"></i>
                <h4>Upgrade Plan</h4>
                <p>Get more access</p>
            </div>
        </div>
    `;
    
    document.getElementById('goToLibraryBtn')?.addEventListener('click', () => {
        window.location.href = '/library.html';
    });
    
    document.getElementById('viewSavedBtn')?.addEventListener('click', () => {
        switchTab('library');
    });
    
    document.getElementById('upgradePlanCard')?.addEventListener('click', () => {
        openModal('upgradeModal');
    });
    
    document.getElementById('quickAddFunds')?.addEventListener('click', () => {
        switchTab('wallet');
    });
}

// ============================================
// WALLET RENDER WITH SUPABASE
// ============================================

async function renderWallet() {
    const container = document.getElementById('wallet-section');
    if (!container) return;
    
    const profile = await getUserProfile();
    const walletBalance = profile?.wallet_balance || 25000;
    const userPlan = profile?.plan || 'basic';
    const payments = await getUserPayments();
    const transactions = await getUserTransactions();
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Wallet</h2>
                <p>Manage your funds and subscription</p>
            </div>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-wallet"></i></div>
                <div class="stat-info">
                    <h3>Current Balance</h3>
                    <div class="stat-value" id="walletBalanceDisplay">₦${walletBalance.toLocaleString()}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-crown"></i></div>
                <div class="stat-info">
                    <h3>Current Plan</h3>
                    <div class="stat-value">${userPlan.toUpperCase()}</div>
                    <button class="upgrade-plan-btn" id="upgradePlanWalletBtn">Upgrade</button>
                </div>
            </div>
        </div>
        
        <!-- Step 1: Enter Amount -->
        <div class="data-table" style="margin-bottom: 1.5rem;" id="step1Container">
            <h3>Step 1: Enter Amount</h3>
            <div style="padding: 1.5rem;">
                <div class="form-group">
                    <label>Amount (₦)</label>
                    <div class="amount-buttons" style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px;">
                        <button type="button" class="amount-preset" data-amount="2500">₦2,500</button>
                        <button type="button" class="amount-preset" data-amount="5000">₦5,000</button>
                        <button type="button" class="amount-preset" data-amount="10000">₦10,000</button>
                        <button type="button" class="amount-preset" data-amount="25000">₦25,000</button>
                        <button type="button" class="amount-preset" data-amount="50000">₦50,000</button>
                    </div>
                    <input type="number" id="customAmount" placeholder="Or enter custom amount" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary);">
                </div>
                
                <div class="form-group">
                    <label>Select Bank</label>
                    <select id="bankSelect" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary);">
                        <option value="MoniePoint">MoniePoint Microfinance Bank</option>
                        <option value="Opay">Opay</option>
                    </select>
                </div>
                
                <button id="generatePaymentBtn" class="btn-primary" style="width: 100%;">Continue to Payment Details</button>
            </div>
        </div>
        
        <!-- Step 2: Bank Details & Reference Code -->
        <div id="step2Container" class="data-table" style="margin-bottom: 1.5rem; display: none;">
            <h3>Step 2: Send Money</h3>
            <div style="padding: 1.5rem;">
                <div id="bankDetailsContent" style="background: var(--bg-secondary); padding: 20px; border-radius: 12px; margin-bottom: 20px;"></div>
                
                <div class="reference-code-box" style="margin-bottom: 20px; padding: 15px; background: rgba(251, 176, 64, 0.1); border-radius: 8px; text-align: center; border: 1px solid var(--accent);">
                    <p style="font-size: 0.8rem; margin-bottom: 5px;">Your Reference Code (Use as narration)</p>
                    <p id="referenceCode" style="font-size: 1.3rem; font-weight: 700; color: var(--accent); letter-spacing: 1px; word-break: break-all;"></p>
                    <button id="copyCodeBtn" class="btn-outline" style="margin-top: 10px; padding: 6px 12px; font-size: 0.8rem;">📋 Copy Code</button>
                </div>
                
                <div class="payment-instructions" style="margin-bottom: 20px; padding: 15px; background: var(--bg-primary); border-radius: 8px; border-left: 3px solid var(--accent);">
                    <p style="font-size: 0.85rem; margin-bottom: 8px;"><strong>📝 Instructions:</strong></p>
                    <ol style="margin-left: 20px; font-size: 0.8rem;">
                        <li>Send the exact amount to the account above</li>
                        <li>Use the <strong>Reference Code</strong> as your transaction narration</li>
                        <li>After sending, click "I Have Made Payment" below</li>
                        <li>Your wallet will be credited once admin verifies</li>
                    </ol>
                </div>
                
                <button id="confirmPaymentBtn" class="btn-success" style="width: 100%; padding: 14px; font-size: 1rem;">✅ I Have Made Payment</button>
                <button id="backToStep1Btn" class="btn-outline" style="width: 100%; margin-top: 10px; padding: 10px;">← Back to Edit Amount</button>
            </div>
        </div>
        
        <!-- Step 3: Success Message -->
        <div id="step3Container" class="data-table" style="margin-bottom: 1.5rem; display: none;">
            <h3>Step 3: Payment Submitted</h3>
            <div style="padding: 1.5rem; text-align: center;">
                <i class="fas fa-clock" style="font-size: 3rem; color: var(--accent); margin-bottom: 15px;"></i>
                <h3 style="margin-bottom: 10px;">Payment Request Sent!</h3>
                <p style="margin-bottom: 10px;">Your payment of <strong id="submittedAmount"></strong> has been submitted.</p>
                <p style="font-size: 0.85rem;">Reference Code: <strong id="submittedCode"></strong></p>
                <div style="margin-top: 20px; padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px;">
                    <p style="font-size: 0.85rem;">⏱️ Your wallet will be credited within <strong>1 hour</strong> after bank confirmation.</p>
                </div>
                <button id="newPaymentBtn" class="btn-primary" style="margin-top: 20px;">Make Another Payment</button>
            </div>
        </div>
        
        <!-- Pending Requests -->
        <div class="data-table">
            <h3>My Payment Requests</h3>
            <div id="pendingRequestsList">
                ${payments.length === 0 ? '<p style="padding: 1.5rem; text-align: center;">No payment requests</p>' : `
                    <table style="width: 100%;">
                        <thead>
                            <tr><th>Date</th><th>Amount</th><th>Reference Code</th><th>Status</th><th>Bank</th></tr>
                        </thead>
                        <tbody>
                            ${payments.map(p => `
                                <tr>
                                    <td>${new Date(p.submitted_at).toLocaleDateString()}</td>
                                    <td>₦${p.amount.toLocaleString()}</td>
                                    <td><code style="font-size: 0.7rem;">${p.reference_code}</code></td>
                                    <td><span class="badge ${p.status === 'pending' ? 'pending' : p.status === 'approved' ? 'active' : 'rejected'}">${p.status}</span></td>
                                    <td>${p.bank}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `}
            </div>
        </div>
        
        <div class="data-table" style="margin-top: 1.5rem;">
            <h3>Transaction History</h3>
            <div id="transactionList">
                ${transactions.length === 0 ? '<p style="padding: 1.5rem; text-align: center;">No transactions yet</p>' : `
                    ${transactions.map(t => `
                        <div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid var(--border-color);">
                            <div>
                                <div style="font-weight:600;">${t.description}</div>
                                <div style="font-size:0.75rem;">${new Date(t.created_at).toLocaleString()}</div>
                            </div>
                            <div style="color:${t.type === 'credit' ? '#10b981' : '#ef4444'}">
                                ${t.type === 'credit' ? '+' : '-'}₦${t.amount.toLocaleString()}
                            </div>
                        </div>
                    `).join('')}
                `}
            </div>
        </div>
    `;
    
    // Store current payment data
    let currentPaymentAmount = null;
    let currentPaymentBank = null;
    let currentReferenceCode = null;
    
    // Amount preset buttons
    document.querySelectorAll('.amount-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = btn.getAttribute('data-amount');
            document.getElementById('customAmount').value = amount;
            document.querySelectorAll('.amount-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    // Generate payment button
    const generateBtn = document.getElementById('generatePaymentBtn');
    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            const customAmount = document.getElementById('customAmount').value;
            const amount = customAmount ? parseInt(customAmount) : 0;
            const bank = document.getElementById('bankSelect').value;
            
            if (!amount || amount < 100) {
                showToast('Please enter a valid amount (minimum ₦100)', 'error');
                return;
            }
            
            currentPaymentAmount = amount;
            currentPaymentBank = bank;
            currentReferenceCode = `GLM-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            
            const bankDetails = bank === 'MoniePoint' 
                ? { bankName: 'MoniePoint Microfinance Bank', accountNumber: '6315085115', accountName: 'Gliimu LTD' }
                : { bankName: 'Opay', accountNumber: '6142049426', accountName: 'Gliimu LTD' };
            
            document.getElementById('bankDetailsContent').innerHTML = `
                <div style="text-align: center;">
                    <p style="margin-bottom: 8px;"><strong>🏦 Bank:</strong> ${bankDetails.bankName}</p>
                    <p style="margin-bottom: 8px; font-size: 1.1rem;"><strong>Account Number:</strong> <span style="font-size: 1.3rem; font-weight: 700;">${bankDetails.accountNumber}</span></p>
                    <p style="margin-bottom: 8px;"><strong>Account Name:</strong> ${bankDetails.accountName}</p>
                    <p style="margin-top: 8px;"><strong>Amount to Send:</strong> ₦${amount.toLocaleString()}</p>
                </div>
            `;
            document.getElementById('referenceCode').textContent = currentReferenceCode;
            
            document.getElementById('step1Container').style.display = 'none';
            document.getElementById('step2Container').style.display = 'block';
            document.getElementById('step3Container').style.display = 'none';
            document.getElementById('step2Container').scrollIntoView({ behavior: 'smooth' });
        });
    }
    
    // Copy code button
    const copyBtn = document.getElementById('copyCodeBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const code = document.getElementById('referenceCode').textContent;
            navigator.clipboard.writeText(code);
            showToast('Reference code copied!', 'success');
        });
    }
    
    // Back to step 1
    const backBtn = document.getElementById('backToStep1Btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.getElementById('step1Container').style.display = 'block';
            document.getElementById('step2Container').style.display = 'none';
            document.getElementById('step3Container').style.display = 'none';
        });
    }
    
    // Confirm payment
    const confirmBtn = document.getElementById('confirmPaymentBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!currentPaymentAmount || !currentReferenceCode) {
                showToast('Something went wrong. Please try again.', 'error');
                return;
            }
            
            const result = await createPaymentRequest(currentPaymentAmount, currentPaymentBank, currentReferenceCode);
            
            if (result.success) {
                document.getElementById('step1Container').style.display = 'none';
                document.getElementById('step2Container').style.display = 'none';
                document.getElementById('step3Container').style.display = 'block';
                document.getElementById('submittedAmount').textContent = `₦${currentPaymentAmount.toLocaleString()}`;
                document.getElementById('submittedCode').textContent = currentReferenceCode;
                
                showToast(`Payment request submitted! We'll notify you once confirmed.`, 'success');
                setTimeout(() => renderWallet(), 2000);
            }
        });
    }
    
    // New payment button
    const newPaymentBtn = document.getElementById('newPaymentBtn');
    if (newPaymentBtn) {
        newPaymentBtn.addEventListener('click', () => {
            document.getElementById('customAmount').value = '';
            document.querySelectorAll('.amount-preset').forEach(b => b.classList.remove('active'));
            document.getElementById('bankSelect').value = 'MoniePoint';
            document.getElementById('step1Container').style.display = 'block';
            document.getElementById('step2Container').style.display = 'none';
            document.getElementById('step3Container').style.display = 'none';
            currentPaymentAmount = null;
            currentPaymentBank = null;
            currentReferenceCode = null;
        });
    }
    
    // Upgrade plan button
    const upgradeBtn = document.getElementById('upgradePlanWalletBtn');
    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', () => openModal('upgradeModal'));
    }
}

// ============================================
// LIBRARY TAB WITH SUPABASE
// ============================================

async function renderLibraryTab() {
    const container = document.getElementById('library-section');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Loading your library...</div>';
    
    try {
        let response = await fetch('../../backend/data/library.json');
        if (!response.ok) response = await fetch('../backend/data/library.json');
        if (!response.ok) response = await fetch('/backend/data/library.json');
        if (!response.ok) response = await fetch('https://raw.githubusercontent.com/Gliimu/Gliimu/main/backend/data/library.json');
        
        if (!response.ok) throw new Error('Failed to load');
        
        const data = await response.json();
        allMaterials = data.materials || [];
        
        const savedItemsData = await getSavedItems();
        const savedItems = savedItemsData.map(s => s.item_id);
        const recentlyViewedData = await getRecentlyViewed();
        const recentlyViewed = recentlyViewedData.map(r => r.item_id);
        
        const savedMaterials = allMaterials.filter(m => savedItems.includes(m.id));
        const recentMaterials = allMaterials.filter(m => recentlyViewed.includes(m.id)).slice(0, 6);
        
        container.innerHTML = `
            <div class="section-header">
                <div>
                    <h2>My Library</h2>
                    <p>Your saved books and recently viewed items</p>
                </div>
                <button class="btn-primary" id="browseLibraryBtn">Browse All Books</button>
            </div>
            
            ${savedMaterials.length > 0 ? `
                <h3 style="margin: 1rem 0 0.5rem;">📚 Saved Items (${savedMaterials.length})</h3>
                <div class="library-grid">
                    ${savedMaterials.map(item => `
                        <div class="library-item" data-id="${item.id}">
                            <div class="library-item-cover" style="background-image: url('${item.image}'); background-size: cover;"></div>
                            <div class="library-item-info">
                                <div class="library-item-title">${escapeHtml(item.title)}</div>
                                <div class="library-item-type">${item.type === 'book' ? '📖 Book' : '📦 Bundle'}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="empty-state">
                    <i class="fas fa-bookmark"></i>
                    <h3>Your shelf is empty</h3>
                    <p>Save books and bundles to see them here</p>
                    <button class="btn-primary" id="goToLibraryEmptyBtn">Explore Library</button>
                </div>
            `}
            
            ${recentMaterials.length > 0 ? `
                <h3 style="margin: 2rem 0 0.5rem;">🕐 Recently Viewed</h3>
                <div class="library-grid">
                    ${recentMaterials.map(item => `
                        <div class="library-item" data-id="${item.id}">
                            <div class="library-item-cover" style="background-image: url('${item.image}'); background-size: cover;"></div>
                            <div class="library-item-info">
                                <div class="library-item-title">${escapeHtml(item.title)}</div>
                                <div class="library-item-type">${item.type === 'book' ? '📖 Book' : '📦 Bundle'}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;
        
        document.querySelectorAll('.library-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.getAttribute('data-id');
                const material = allMaterials.find(m => m.id === id);
                if (material) openViewModal(material);
            });
        });
        
        document.getElementById('browseLibraryBtn')?.addEventListener('click', () => {
            window.location.href = '/library.html';
        });
        
        document.getElementById('goToLibraryEmptyBtn')?.addEventListener('click', () => {
            window.location.href = '/library.html';
        });
        
    } catch (error) {
        console.error('Error loading library:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Unable to load library</h3>
                <button class="btn-primary" onclick="location.reload()">Retry</button>
            </div>
        `;
    }
}

// ============================================
// SETTINGS RENDER
// ============================================

function renderSettings() {
    const container = document.getElementById('settings-section');
    if (!container) return;
    
    const isDark = document.body.classList.contains('dark-mode');
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>Settings</h2>
                <p>Manage your account preferences</p>
            </div>
        </div>
        <div class="data-table" style="padding: 1.5rem;">
            <form id="settingsForm">
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem;">Full Name</label>
                    <input type="text" id="fullNameInput" value="${currentUser?.name || ''}" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary);">
                </div>
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem;">Email</label>
                    <input type="email" id="emailInput" value="${currentUser?.email || ''}" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary);">
                </div>
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem;">Theme Preference</label>
                    <select id="themeSelect" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary);">
                        <option value="dark" ${isDark ? 'selected' : ''}>Dark</option>
                        <option value="light" ${!isDark ? 'selected' : ''}>Light</option>
                    </select>
                </div>
                <button type="submit" class="btn-primary">Save Changes</button>
            </form>
        </div>
    `;
    
    document.getElementById('themeSelect')?.addEventListener('change', () => {
        const newTheme = document.getElementById('themeSelect').value;
        if (newTheme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        localStorage.setItem('theme', newTheme);
    });
    
    document.getElementById('settingsForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = document.getElementById('fullNameInput').value;
        const newEmail = document.getElementById('emailInput').value;
        
        const updated = await updateUserProfile({ name: newName, email: newEmail });
        if (updated) {
            currentUser.name = newName;
            currentUser.email = newEmail;
            localStorage.setItem('glimu_user', JSON.stringify(currentUser));
            document.getElementById('userName').textContent = newName;
            showToast('Settings saved successfully!', 'success');
        } else {
            showToast('Failed to save settings', 'error');
        }
    });
}

// ============================================
// OTHER ROLE RENDERS
// ============================================

function renderStudents() {
    const container = document.getElementById('students-section');
    if (!container) return;
    container.innerHTML = `
        <div class="section-header"><div><h2>My Students</h2><p>Track your student progress</p></div></div>
        <div class="data-table">
            <table style="width: 100%;">
                <thead><tr><th>Name</th><th>Course</th><th>Progress</th></tr></thead>
                <tbody><tr><td>No students yet</td><td>-</td><td>-</td></tr></tbody>
            </table>
        </div>
    `;
}

function renderUsers() {
    const container = document.getElementById('users-section');
    if (!container) return;
    container.innerHTML = `<div class="section-header"><div><h2>User Management</h2><p>Manage platform users</p></div></div><div class="data-table"><p style="padding: 2rem; text-align: center;">User management coming soon</p></div>`;
}

function renderFinance() {
    const container = document.getElementById('finance-section');
    if (!container) return;
    container.innerHTML = `<div class="section-header"><div><h2>Finance</h2><p>Platform revenue and analytics</p></div></div><div class="data-table"><p style="padding: 2rem; text-align: center;">Finance dashboard coming soon</p></div>`;
}

function renderProjects() {
    const container = document.getElementById('projects-section');
    if (!container) return;
    container.innerHTML = `<div class="section-header"><div><h2>My Projects</h2><p>Manage your projects</p></div></div><div class="data-table"><p style="padding: 2rem; text-align: center;">No active projects</p></div>`;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList
