// User data state
let currentUser = {
    name: 'Alex',
    plan: 'basic',
    booksRead: 0,
    bundlesDownloaded: 0,
    walletBalance: 0,
    subscriptionExpiry: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000)
};

let allMaterials = [];
let recentlyViewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
let savedItems = JSON.parse(localStorage.getItem('savedLibraryItems') || '[]');

// Load user data from localStorage
function loadUserData() {
    const savedUser = localStorage.getItem('glimu_user');
    if (savedUser) {
        const user = JSON.parse(savedUser);
        currentUser.name = user.name || 'Creator';
        currentUser.plan = user.plan || 'basic';
    }
    
    // Load usage data
    const usage = localStorage.getItem('glimu_usage_guest');
    if (usage) {
        const parsed = JSON.parse(usage);
        currentUser.booksRead = parsed.booksRead || 0;
        currentUser.bundlesDownloaded = parsed.bundlesDownloaded || 0;
    }
    
    updateStats();
}

// Update stats display
function updateStats() {
    const limits = {
        basic: { books: 1, bundles: 1 },
        standard: { books: 3, bundles: 3 },
        premium: { books: '∞', bundles: '∞' }
    };
    
    document.getElementById('booksRead').textContent = currentUser.booksRead;
    document.getElementById('bundlesDownloaded').textContent = currentUser.bundlesDownloaded;
    document.getElementById('currentPlan').textContent = currentUser.plan.charAt(0).toUpperCase() + currentUser.plan.slice(1);
    document.getElementById('walletBalance').textContent = `$${currentUser.walletBalance.toFixed(2)}`;
    
    const limit = limits[currentUser.plan];
    document.getElementById('booksLimit').textContent = `Limit: ${limit.books}/month`;
    document.getElementById('bundlesLimit').textContent = `Limit: ${limit.bundles}/month`;
    
    const daysLeft = Math.ceil((currentUser.subscriptionExpiry - new Date()) / (1000 * 60 * 60 * 24));
    document.getElementById('planExpiry').textContent = `Expires in ${daysLeft} days`;
}

// Fetch materials
async function fetchMaterials() {
    try {
        let response = await fetch('../../backend/data/library.json');
        if (!response.ok) response = await fetch('../backend/data/library.json');
        if (!response.ok) throw new Error('Failed to load');
        
        const data = await response.json();
        allMaterials = data.materials || [];
        
        renderRecentItems();
        renderSavedItems();
        renderRecommendedItems();
    } catch (error) {
        console.error('Error loading materials:', error);
    }
}

// Render recently viewed items
function renderRecentItems() {
    const container = document.getElementById('recentGrid');
    const recentMaterials = recentlyViewed
        .map(id => allMaterials.find(m => m.id === id))
        .filter(m => m);
    
    if (recentMaterials.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 No recently viewed items. Start exploring the library!</div>';
        return;
    }
    
    container.innerHTML = recentMaterials.map(item => `
        <div class="grid-item" onclick="openItem('${item.id}')">
            <div class="item-cover" style="background-image: url('${item.image}'); background-size: cover;"></div>
            <div class="item-info">
                <div class="item-title">${escapeHtml(item.title)}</div>
                <div class="item-meta">${item.type === 'book' ? '📖 Book' : '📦 Bundle'}</div>
            </div>
        </div>
    `).join('');
}

// Render saved items
function renderSavedItems() {
    const container = document.getElementById('savedGrid');
    const savedMaterials = savedItems
        .map(id => allMaterials.find(m => m.id === id))
        .filter(m => m);
    
    if (savedMaterials.length === 0) {
        container.innerHTML = '<div class="empty-state">⭐ No saved items yet. Save books you want to read later!</div>';
        return;
    }
    
    container.innerHTML = savedMaterials.map(item => `
        <div class="grid-item" onclick="openItem('${item.id}')">
            <div class="item-cover" style="background-image: url('${item.image}'); background-size: cover;"></div>
            <div class="item-info">
                <div class="item-title">${escapeHtml(item.title)}</div>
                <div class="item-meta">${item.type === 'book' ? '📖 Book' : '📦 Bundle'}</div>
            </div>
        </div>
    `).join('');
}

// Render recommended items (based on category preference)
function renderRecommendedItems() {
    const container = document.getElementById('recommendedGrid');
    
    // Simple recommendation: show items from categories user has viewed
    const viewedCategories = recentlyViewed
        .map(id => allMaterials.find(m => m.id === id))
        .filter(m => m)
        .map(m => m.category);
    
    const recommended = allMaterials
        .filter(item => !recentlyViewed.includes(item.id))
        .sort((a, b) => {
            const aScore = viewedCategories.includes(a.category) ? 1 : 0;
            const bScore = viewedCategories.includes(b.category) ? 1 : 0;
            return bScore - aScore;
        })
        .slice(0, 8);
    
    if (recommended.length === 0) {
        container.innerHTML = '<div class="empty-state">🎯 Check out the library for personalized recommendations!</div>';
        return;
    }
    
    container.innerHTML = recommended.map(item => `
        <div class="grid-item" onclick="openItem('${item.id}')">
            <div class="item-cover" style="background-image: url('${item.image}'); background-size: cover;"></div>
            <div class="item-info">
                <div class="item-title">${escapeHtml(item.title)}</div>
                <div class="item-meta">${item.type === 'book' ? '📖 Book' : '📦 Bundle'}</div>
            </div>
        </div>
    `).join('');
}

// Open item (navigate to library or show modal)
window.openItem = function(id) {
    // Add to recently viewed
    recentlyViewed = [id, ...recentlyViewed.filter(i => i !== id)].slice(0, 10);
    localStorage.setItem('recentlyViewed', JSON.stringify(recentlyViewed));
    window.location.href = `/library.html?id=${id}`;
};

// Tab switching
function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const recentGrid = document.getElementById('recentGrid');
    const savedGrid = document.getElementById('savedGrid');
    const recommendedGrid = document.getElementById('recommendedGrid');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabName = tab.getAttribute('data-tab');
            
            recentGrid.style.display = tabName === 'recent' ? 'grid' : 'none';
            savedGrid.style.display = tabName === 'saved' ? 'grid' : 'none';
            recommendedGrid.style.display = tabName === 'recommended' ? 'grid' : 'none';
        });
    });
}

// Theme handling
function initTheme() {
    const savedTheme = localStorage.getItem('dashboardTheme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }
    
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            localStorage.setItem('dashboardTheme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        });
    }
}

// Modal handling
let currentModal = null;

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        currentModal = modal;
        document.body.style.overflow = 'hidden';
    }
}

function closeModal() {
    if (currentModal) {
        currentModal.classList.remove('active');
        currentModal = null;
        document.body.style.overflow = '';
    }
}

// Upgrade modal
document.getElementById('upgradeBtn')?.addEventListener('click', () => openModal('upgradeModal'));
document.getElementById('closeUpgradeModal')?.addEventListener('click', closeModal);

// Add funds modal
document.getElementById('addFundsBtn')?.addEventListener('click', () => openModal('addFundsModal'));
document.getElementById('closeAddFundsModal')?.addEventListener('click', closeModal);

// Plan selection
document.querySelectorAll('.select-plan-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const planCard = btn.closest('.plan-card');
        const plan = planCard.getAttribute('data-plan');
        alert(`Upgrading to ${plan.toUpperCase()} plan. Redirecting to payment...`);
        // In production, redirect to payment
        closeModal();
    });
});

// Add funds
document.getElementById('confirmPayment')?.addEventListener('click', () => {
    const selectedAmount = document.querySelector('.amount-btn.active');
    const customAmount = document.getElementById('customAmount').value;
    let amount = 0;
    
    if (selectedAmount) {
        amount = parseInt(selectedAmount.getAttribute('data-amount'));
    } else if (customAmount) {
        amount = parseInt(customAmount);
    }
    
    if (amount > 0) {
        currentUser.walletBalance += amount;
        localStorage.setItem('glimu_wallet', currentUser.walletBalance);
        updateStats();
        alert(`Added $${amount} to your wallet. New balance: $${currentUser.walletBalance}`);
        closeModal();
    } else {
        alert('Please select or enter an amount');
    }
});

// Amount button selection
document.querySelectorAll('.amount-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('customAmount').value = '';
    });
});

// Close modal on outside click
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        closeModal();
    }
};

// Logout
window.logout = function() {
    localStorage.removeItem('glimu_user');
    localStorage.removeItem('glimu_usage_guest');
    window.location.href = '/index.html';
};

// Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTabs();
    loadUserData();
    fetchMaterials();
    document.getElementById('userName').textContent = currentUser.name;
});
