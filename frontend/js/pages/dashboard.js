// Wallet Tab Render with Payment Request System
async function renderWallet() {
    const container = document.getElementById('wallet-section');
    if (!container) return;
    
    const wallet = await fetchWallet();
    const walletBalance = wallet ? wallet.balance : 25000;
    const userPlan = currentUser.plan || 'basic';
    const pendingRequests = await fetchPendingRequests();
    
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
        
        <!-- Payment Request Form -->
        <div class="data-table" style="margin-bottom: 1.5rem;">
            <h3>Add Funds to Wallet</h3>
            <div style="padding: 1.5rem;">
                <form id="paymentRequestForm">
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
                    
                    <button type="submit" class="btn-primary" style="width: 100%;">Generate Payment Code</button>
                </form>
            </div>
        </div>
        
        <!-- Bank Details (shown after code generation) -->
        <div id="bankDetailsSection" style="display: none;" class="data-table" style="margin-bottom: 1.5rem;">
            <h3>Bank Transfer Details</h3>
            <div style="padding: 1.5rem;">
                <div id="bankDetailsContent"></div>
                <div class="reference-code-box" style="margin-top: 15px; padding: 15px; background: var(--bg-secondary); border-radius: 8px; text-align: center;">
                    <p style="font-size: 0.8rem; margin-bottom: 5px;">Your Reference Code</p>
                    <p id="referenceCode" style="font-size: 1.2rem; font-weight: 700; color: var(--accent); letter-spacing: 1px;"></p>
                    <p style="font-size: 0.7rem; margin-top: 8px;">Use this code as narration when sending money</p>
                </div>
                <button id="copyCodeBtn" class="btn-outline" style="margin-top: 10px; width: 100%;">Copy Code</button>
            </div>
        </div>
        
        <!-- Pending Requests -->
        <div class="data-table">
            <h3>My Payment Requests</h3>
            <div id="pendingRequestsList">
                ${pendingRequests.length === 0 ? '<p style="padding: 1.5rem; text-align: center;">No pending requests</p>' : `
                    <table style="width: 100%;">
                        <thead>
                            <tr><th>Date</th><th>Amount</th><th>Reference Code</th><th>Status</th><th>Bank</th></tr>
                        </thead>
                        <tbody>
                            ${pendingRequests.map(req => `
                                <tr>
                                    <td>${new Date(req.submittedAt).toLocaleDateString()}</td>
                                    <td>₦${req.amount.toLocaleString()}</td>
                                    <td><code>${req.referenceCode}</code></td>
                                    <td><span class="badge ${req.status === 'pending' ? 'pending' : req.status === 'approved' ? 'active' : 'closed'}">${req.status}</span></td>
                                    <td>${req.bank}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `}
            </div>
        </div>
        
        <div class="data-table" style="margin-top: 1.5rem;">
            <h3>Transaction History</h3>
            <div id="transactionList"></div>
        </div>
    `;
    
    // Display transactions
    await displayTransactions('transactionList');
    
    // Setup amount preset buttons
    document.querySelectorAll('.amount-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = btn.getAttribute('data-amount');
            document.getElementById('customAmount').value = amount;
            document.querySelectorAll('.amount-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    // Handle form submission
    const form = document.getElementById('paymentRequestForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const customAmount = document.getElementById('customAmount').value;
            const amount = customAmount ? parseInt(customAmount) : 0;
            const bank = document.getElementById('bankSelect').value;
            
            if (!amount || amount < 100) {
                showToast('Please enter a valid amount (minimum ₦100)', 'error');
                return;
            }
            
            // Submit payment request
            const success = await submitPaymentRequest(amount, bank);
            
            if (success) {
                // Show bank details with reference code
                const bankDetails = getBankDetails(bank);
                const referenceCode = generateReferenceCode();
                
                document.getElementById('bankDetailsContent').innerHTML = `
                    <div style="background: var(--bg-secondary); padding: 15px; border-radius: 8px;">
                        <p><strong>Bank:</strong> ${bank === 'MoniePoint' ? 'MoniePoint Microfinance Bank' : 'Opay'}</p>
                        <p><strong>Account Number:</strong> ${bank === 'MoniePoint' ? '6315085115' : '6142049426'}</p>
                        <p><strong>Account Name:</strong> Gliimu LTD</p>
                        <p style="margin-top: 10px; font-size: 0.8rem; color: var(--accent);">⚠️ IMPORTANT: Use the reference code below as narration</p>
                    </div>
                `;
                document.getElementById('referenceCode').textContent = referenceCode;
                document.getElementById('bankDetailsSection').style.display = 'block';
                
                // Scroll to bank details
                document.getElementById('bankDetailsSection').scrollIntoView({ behavior: 'smooth' });
            }
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
    
    // Upgrade plan button
    const upgradeBtn = document.getElementById('upgradePlanWalletBtn');
    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', () => openModal('upgradeModal'));
    }
}

// Helper function to get bank details
function getBankDetails(bank) {
    if (bank === 'MoniePoint') {
        return {
            bankName: 'MoniePoint Microfinance Bank',
            accountNumber: '6315085115',
            accountName: 'Gliimu LTD'
        };
    } else {
        return {
            bankName: 'Opay',
            accountNumber: '6142049426',
            accountName: 'Gliimu LTD'
        };
    }
}
