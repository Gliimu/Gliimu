// ============================================
// DIGITAL LIBRARY - GLIIMU (COMPLETE)
// Purchase books (digital/physical), read online, download bundles
// Earn GP (Gliimu Points) on purchases
// ============================================

import { supabase, getCurrentUser, getUserProfile } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// Global variables
let currentUser = null;
let allItems = [];
let currentFilter = 'for-you';
let currentSearch = '';
let savedItems = new Set();
let purchasedItems = new Set();
let isLoading = false;
let userGP = 0;
let userWallet = 0;
let userInterests = [];

// Categories - Updated
const CATEGORIES = [
    { id: 'for-you', name: 'For You' },
    { id: 'books', name: 'Books' },
    { id: 'courses', name: 'Courses' },
    { id: 'resources', name: 'Resources' },
    { id: 'saved', name: 'Saved' },
    { id: 'purchased', name: 'Purchased' },
    { id: 'bundles', name: 'Bundles' }
];

// GP Rewards for different actions
const GP_REWARDS = {
    purchase_book: 5,
    purchase_bundle: 10,
    purchase_physical: 3,
    read_book: 2,
    complete_course: 15,
    share_content: 3,
    daily_login: 1,
    save_item: 1
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Digital Library initializing...');
    
    const container = document.getElementById('booksContainer');
    if (container) container.innerHTML = '<div class="loading">Loading library materials...</div>';
    
    try {
        currentUser = await getCurrentUser();
        console.log('Current user:', currentUser?.email || 'Guest');
        
        if (currentUser) {
            await loadUserData();
            await loadSavedItems();
            await loadPurchasedItems();
            await loadUserInterests();
            console.log(`✅ Loaded ${purchasedItems.size} purchased items`);
            console.log(`✅ GP: ${userGP} | Wallet: ₦${userWallet}`);
        }
        
        await loadLibraryItems();
        setupEventListeners();
        applyTheme();
        setupScrollHeader();
        
    } catch (error) {
        console.error('Initialization error:', error);
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Failed to Load Library</h3>
                    <p>${error.message || 'Please refresh the page to try again.'}</p>
                    <button onclick="location.reload()" class="btn-primary" style="margin-top: 1rem;">Refresh</button>
                </div>
            `;
        }
    }
});

// ============================================
// LOAD USER DATA
// ============================================
async function loadUserData() {
    if (!currentUser) return;
    
    try {
        const { data: profile, error } = await supabase
            .from('users')
            .select('wallet_balance, gp_points')
            .eq('id', currentUser.id)
            .single();
        
        if (error) {
            if (error.message.includes('gp_points')) {
                const { data: walletData, error: walletError } = await supabase
                    .from('users')
                    .select('wallet_balance')
                    .eq('id', currentUser.id)
                    .single();
                
                if (!walletError) {
                    userWallet = walletData?.wallet_balance || 0;
                    userGP = 0;
                }
            }
            throw error;
        }
        
        userWallet = profile?.wallet_balance || 0;
        userGP = profile?.gp_points || 0;
        
        if (profile?.gp_points === undefined || profile?.gp_points === null) {
            await supabase
                .from('users')
                .update({ gp_points: 0 })
                .eq('id', currentUser.id);
            userGP = 0;
        }
        
    } catch (error) {
        console.error('Error loading user data:', error);
        if (userWallet === undefined) {
            userWallet = 0;
            userGP = 0;
        }
    }
}

async function loadUserInterests() {
    if (!currentUser) return;
    try {
        // Get user's purchased items to determine interests
        const { data: purchases } = await supabase
            .from('user_purchases')
            .select('item_id')
            .eq('user_id', currentUser.id);
        
        if (purchases && purchases.length > 0) {
            const itemIds = purchases.map(p => p.item_id);
            const { data: items } = await supabase
                .from('library_items')
                .select('category')
                .in('id', itemIds);
            
            if (items) {
                // Count category frequencies
                const categoryCount = {};
                items.forEach(item => {
                    if (item.category) {
                        categoryCount[item.category] = (categoryCount[item.category] || 0) + 1;
                    }
                });
                // Sort by frequency
                userInterests = Object.keys(categoryCount).sort((a, b) => categoryCount[b] - categoryCount[a]);
                console.log('User interests:', userInterests);
            }
        }
    } catch (error) {
        console.error('Error loading interests:', error);
    }
}

// ============================================
// LOAD DATA FROM SUPABASE
// ============================================
async function loadLibraryItems() {
    const container = document.getElementById('booksContainer');
    if (!container || isLoading) return;
    isLoading = true;
    
    try {
        const { data: items, error } = await supabase
            .from('library_items')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Database error:', error);
            throw error;
        }
        
        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-open"></i>
                    <h3>No Materials Found</h3>
                    <p>The library is being populated with content. Check back soon!</p>
                </div>
            `;
            return;
        }
        
        console.log(`✅ Loaded ${items.length} library items`);
        allItems = items;
        renderFilters();
        renderItems();
        
    } catch (error) {
        console.error('Error loading library:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-database"></i>
                <h3>Database Error</h3>
                <p>${error.message || 'Unable to load library content.'}</p>
                <button onclick="loadLibraryItems()" class="btn-primary" style="margin-top: 1rem;">Retry</button>
            </div>
        `;
    } finally {
        isLoading = false;
    }
}

async function loadSavedItems() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabase
            .from('user_library_progress')
            .select('item_id')
            .eq('user_id', currentUser.id);
        
        if (error) throw error;
        if (data) savedItems = new Set(data.map(item => item.item_id));
        console.log(`✅ Loaded ${savedItems.size} saved items`);
    } catch (error) {
        console.error('Error loading saved items:', error);
    }
}

async function loadPurchasedItems() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabase
            .from('user_purchases')
            .select('item_id')
            .eq('user_id', currentUser.id);
        
        if (error) throw error;
        if (data) purchasedItems = new Set(data.map(item => item.item_id));
        console.log(`✅ Loaded ${purchasedItems.size} purchased items`);
    } catch (error) {
        console.error('Error loading purchased items:', error);
    }
}

// ============================================
// THEME MANAGEMENT
// ============================================
function applyTheme() {
    const savedTheme = localStorage.getItem('theme');
    const logoImg = document.getElementById('logoImg');
    
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        if (logoImg) logoImg.style.filter = 'brightness(0) invert(1)';
    } else if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
        if (logoImg) logoImg.style.filter = 'none';
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.body.classList.add('dark-mode');
            if (logoImg) logoImg.style.filter = 'brightness(0) invert(1)';
        }
    }
}

function setupScrollHeader() {
    const header = document.querySelector('.library-header');
    let lastScroll = 0;
    
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        if (currentScroll > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
        lastScroll = currentScroll;
    });
}

// ============================================
// RENDER FUNCTIONS
// ============================================
function renderFilters() {
    const filterContainer = document.getElementById('filterChips');
    if (!filterContainer) return;
    
    // Count items for each category
    const counts = {};
    CATEGORIES.forEach(cat => {
        const filtered = getFilteredItems(cat.id);
        counts[cat.id] = filtered.length;
    });
    
    filterContainer.innerHTML = CATEGORIES.map(cat => `
        <button class="filter-chip ${currentFilter === cat.id ? 'active' : ''}" data-filter="${cat.id}">
            ${cat.name}
            ${cat.id !== 'for-you' ? `<span class="count">${counts[cat.id]}</span>` : ''}
        </button>
    `).join('');
    
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentFilter = chip.dataset.filter;
            renderItems();
        });
    });
}

function getFilteredItems(filterId) {
    let filtered = [...allItems];
    
    switch(filterId) {
        case 'for-you':
            // Show items based on user interests
            if (userInterests.length > 0) {
                filtered = filtered.filter(item => 
                    userInterests.some(interest => 
                        item.category?.toLowerCase().includes(interest.toLowerCase()) ||
                        item.type?.toLowerCase().includes(interest.toLowerCase())
                    )
                );
                // If no items match interests, show all
                if (filtered.length === 0) {
                    filtered = [...allItems];
                }
            }
            break;
        case 'books':
            filtered = filtered.filter(item => item.type === 'book' || item.type === 'resource');
            break;
        case 'courses':
            filtered = filtered.filter(item => item.type === 'course');
            break;
        case 'resources':
            filtered = filtered.filter(item => item.type === 'resource' || item.type === 'guide');
            break;
        case 'saved':
            if (currentUser) {
                filtered = filtered.filter(item => savedItems.has(item.id));
            } else {
                filtered = [];
            }
            break;
        case 'purchased':
            if (currentUser) {
                filtered = filtered.filter(item => purchasedItems.has(item.id));
            } else {
                filtered = [];
            }
            break;
        case 'bundles':
            filtered = filtered.filter(item => item.type === 'bundle');
            break;
        default:
            break;
    }
    
    return filtered;
}

function renderItems() {
    const container = document.getElementById('booksContainer');
    if (!container) return;
    
    let filtered = getFilteredItems(currentFilter);
    
    // Apply search
    if (currentSearch) {
        const searchLower = currentSearch.toLowerCase();
        filtered = filtered.filter(item => 
            (item.title?.toLowerCase().includes(searchLower)) ||
            (item.description?.toLowerCase().includes(searchLower)) ||
            (item.author?.toLowerCase().includes(searchLower))
        );
    }
    
    if (filtered.length === 0) {
        const message = currentFilter === 'saved' ? 'No saved items yet. Start saving books you want to purchase later!' :
                        currentFilter === 'purchased' ? 'You haven\'t purchased any items yet. Browse the library to find your next read!' :
                        'No matching items found. Try a different search term or category.';
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>${currentFilter === 'saved' ? '📚 Your Saved Items' : currentFilter === 'purchased' ? '📖 Your Purchased Items' : 'No matching items'}</h3>
                <p>${message}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filtered.map(item => createItemCard(item)).join('');
}

function createItemCard(item) {
    const isPurchased = purchasedItems.has(item.id);
    const isSaved = savedItems.has(item.id);
    const isBundle = item.type === 'bundle';
    const hasPrice = (item.price || 0) > 0;
    const coverUrl = item.cover_url || `https://placehold.co/300x450/2c2f78/white?text=${encodeURIComponent(item.title || 'Book')}`;
    const gpReward = isBundle ? GP_REWARDS.purchase_bundle : GP_REWARDS.purchase_book;
    
    if (isBundle) {
        return `
            <div class="grid-item item-bundle" data-id="${item.id}">
                <div class="bundle-content" onclick="window.viewItemDetails('${item.id}')">
                    <div class="bundle-title">${escapeHtml(item.title)}</div>
                    <div class="bundle-meta">${escapeHtml(item.author || 'Gliimu Team')} • ${item.level || 'Beginner'}</div>
                    ${hasPrice ? `<div class="bundle-price">₦${(item.price || 0).toLocaleString()}</div>` : '<div class="bundle-price free">Free</div>'}
                    ${isPurchased ? '<div class="purchased-tag">✓ Owned</div>' : `<div class="gp-tag">+${gpReward} GP</div>`}
                </div>
                <button class="bundle-download-btn" onclick="event.stopPropagation(); window.downloadBundle('${item.id}')" 
                    ${!isPurchased && hasPrice ? 'disabled title="Purchase to download"' : ''}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 3v12m0 0-3-3m3 3 3-3M5 21h14"/>
                    </svg>
                </button>
            </div>
        `;
    }
    
    return `
        <div class="grid-item item-book" data-id="${item.id}" onclick="window.viewItemDetails('${item.id}')">
            <div class="card-cover" style="background-image: url('${coverUrl}')">
                ${isPurchased ? '<div class="purchased-badge">✓ Purchased</div>' : ''}
                ${isSaved && !isPurchased ? '<div class="saved-badge">★ Saved</div>' : ''}
                ${hasPrice && !isPurchased ? `<div class="price-badge">₦${(item.price || 0).toLocaleString()}</div>` : ''}
                ${!isPurchased ? `<div class="gp-badge">+${gpReward} GP</div>` : ''}
                <div class="card-info-overlay">
                    <div class="card-title">${escapeHtml(item.title)}</div>
                    <div class="card-author">${escapeHtml(item.author || 'Gliimu Team')}</div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// GP (Gliimu Points) MANAGEMENT
// ============================================
async function addGP(userId, amount, reason) {
    try {
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('gp_points')
            .eq('id', userId)
            .single();
        
        if (fetchError) {
            if (fetchError.message.includes('gp_points')) {
                console.warn('gp_points column not found, skipping GP addition');
                return null;
            }
            throw fetchError;
        }
        
        const currentGP = user?.gp_points || 0;
        const newGP = currentGP + amount;
        
        const { error: updateError } = await supabase
            .from('users')
            .update({ gp_points: newGP })
            .eq('id', userId);
        
        if (updateError) throw updateError;
        
        try {
            await supabase
                .from('gp_transactions')
                .insert([{
                    user_id: userId,
                    amount: amount,
                    reason: reason,
                    created_at: new Date().toISOString()
                }]);
        } catch (logError) {
            console.warn('Could not log GP transaction:', logError);
        }
        
        userGP = newGP;
        
        if (newGP >= 100 && currentGP < 100) {
            showToast('🎉 Congratulations! You\'ve reached Premium status with 100 GP!', 'success');
            await grantPremiumAccess(userId);
        }
        
        return newGP;
        
    } catch (error) {
        console.error('Error adding GP:', error);
        return null;
    }
}

async function grantPremiumAccess(userId) {
    try {
        const { error: updateError } = await supabase
            .from('users')
            .update({ 
                is_premium: true,
                premium_earned_at: new Date().toISOString()
            })
            .eq('id', userId);
        
        if (updateError) {
            if (updateError.message.includes('is_premium')) {
                console.warn('is_premium column not found');
                showToast('✨ You\'ve reached 100 GP! Contact support for premium benefits.', 'success');
                return;
            }
            throw updateError;
        }
        
        showToast('✨ Premium access granted! Download PDFs and access exclusive content!', 'success');
        
    } catch (error) {
        console.error('Error granting premium:', error);
    }
}

// ============================================
// PURCHASE FLOW - COMPLETE
// ============================================

window.purchaseItem = async (itemId, type = 'digital') => {
    if (!currentUser) {
        showToast('Please login to purchase', 'error');
        setTimeout(() => window.location.href = '/signin.html', 1500);
        return;
    }
    
    const item = allItems.find(i => i.id === itemId);
    if (!item) {
        showToast('Item not found', 'error');
        return;
    }
    
    const price = type === 'physical' ? (item.physical_price || 0) : (item.price || 0);
    const isPremium = userGP >= 100;
    
    if (price <= 0) {
        await grantFreeAccess(itemId);
        return;
    }
    
    if (purchasedItems.has(itemId)) {
        showToast('You already own this item!', 'info');
        closeModal();
        return;
    }
    
    if (isPremium && type === 'digital') {
        showToast('✨ Premium access granted! You can download the PDF for free.', 'success');
        await grantAccess(itemId, 'premium');
        return;
    }
    
    try {
        showToast('Processing purchase...', 'info');
        
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('wallet_balance')
            .eq('id', currentUser.id)
            .single();
        
        if (userError) {
            console.error('Error fetching wallet:', userError);
            showToast('Error checking wallet balance', 'error');
            return;
        }
        
        const currentBalance = user?.wallet_balance || 0;
        
        if (currentBalance < price) {
            showToast(`Insufficient funds. Need ₦${(price - currentBalance).toLocaleString()} more.`, 'error');
            if (confirm(`You need ₦${(price - currentBalance).toLocaleString()} more. Would you like to add funds to your wallet?`)) {
                window.location.href = '/dashboard.html?tab=wallet';
            }
            return;
        }
        
        const newBalance = currentBalance - price;
        const { error: updateError } = await supabase
            .from('users')
            .update({ wallet_balance: newBalance })
            .eq('id', currentUser.id);
        
        if (updateError) {
            console.error('Payment error:', updateError);
            showToast('Payment failed. Please try again.', 'error');
            return;
        }
        
        const purchaseData = {
            user_id: currentUser.id,
            item_id: itemId,
            purchase_type: type,
            amount: price,
            created_at: new Date().toISOString()
        };
        
        const { error: purchaseError } = await supabase
            .from('user_purchases')
            .insert([purchaseData]);
        
        if (purchaseError) {
            console.error('Purchase record error:', purchaseError);
            await supabase
                .from('users')
                .update({ wallet_balance: currentBalance })
                .eq('id', currentUser.id);
            showToast('Purchase failed. Please contact support.', 'error');
            return;
        }
        
        const gpReward = item.type === 'bundle' ? GP_REWARDS.purchase_bundle : GP_REWARDS.purchase_book;
        const gpEarned = await addGP(currentUser.id, gpReward, `Purchased: ${item.title} (${type})`);
        
        purchasedItems.add(itemId);
        
        if (gpEarned !== null) {
            showToast(`🎉 Successfully purchased ${item.title}! Earned +${gpReward} GP!`, 'success');
        } else {
            showToast(`🎉 Successfully purchased ${item.title}!`, 'success');
        }
        
        renderItems();
        closeModal();
        
        if (type === 'digital' && item.file_url) {
            setTimeout(() => {
                if (confirm(`Would you like to open "${item.title}" now?`)) {
                    window.open(item.file_url, '_blank');
                }
            }, 1000);
        }
        
        await logTransaction(currentUser.id, -price, `Purchase: ${item.title} (${type})`);
        
    } catch (error) {
        console.error('Purchase error:', error);
        showToast('Purchase failed. Please try again.', 'error');
    }
};

async function grantAccess(itemId, accessType = 'standard') {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    
    try {
        const purchaseData = {
            user_id: currentUser.id,
            item_id: itemId,
            purchase_type: accessType === 'premium' ? 'premium' : 'digital',
            amount: 0,
            created_at: new Date().toISOString()
        };
        
        const { error } = await supabase
            .from('user_purchases')
            .insert([purchaseData]);
        
        if (error) {
            console.error('Access grant error:', error);
            showToast('Error granting access. Please try again.', 'error');
            return;
        }
        
        purchasedItems.add(itemId);
        showToast(`✅ Access granted to ${item.title}!`, 'success');
        renderItems();
        closeModal();
        
        if (item.file_url) {
            setTimeout(() => {
                if (confirm(`Would you like to open "${item.title}" now?`)) {
                    window.open(item.file_url, '_blank');
                }
            }, 500);
        }
        
    } catch (error) {
        console.error('Access grant error:', error);
        showToast('Error granting access', 'error');
    }
}

async function grantFreeAccess(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    
    try {
        if (purchasedItems.has(itemId)) {
            showToast('You already have access to this item!', 'info');
            closeModal();
            return;
        }
        
        const purchaseData = {
            user_id: currentUser.id,
            item_id: itemId,
            purchase_type: 'digital',
            amount: 0,
            created_at: new Date().toISOString()
        };
        
        const { error } = await supabase
            .from('user_purchases')
            .insert([purchaseData]);
        
        if (error) {
            console.error('Free access error:', error);
            showToast('Error granting access. Please try again.', 'error');
            return;
        }
        
        const gpEarned = await addGP(currentUser.id, 1, `Accessed free item: ${item.title}`);
        
        purchasedItems.add(itemId);
        if (gpEarned !== null) {
            showToast(`✅ Free access granted to ${item.title}! +1 GP`, 'success');
        } else {
            showToast(`✅ Free access granted to ${item.title}!`, 'success');
        }
        renderItems();
        closeModal();
        
        if (item.file_url) {
            setTimeout(() => {
                if (confirm(`Would you like to open "${item.title}" now?`)) {
                    window.open(item.file_url, '_blank');
                }
            }, 500);
        }
        
    } catch (error) {
        console.error('Free access error:', error);
        showToast('Error granting access', 'error');
    }
}

async function logTransaction(userId, amount, description) {
    try {
        await supabase
            .from('transactions')
            .insert([{
                user_id: userId,
                amount: amount,
                type: amount < 0 ? 'debit' : 'credit',
                description: description,
                status: 'completed',
                created_at: new Date().toISOString()
            }]);
    } catch (error) {
        console.error('Error logging transaction:', error);
    }
}

// ============================================
// READING & DOWNLOAD FUNCTIONS
// ============================================

window.startReading = (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) {
        showToast('Item not found', 'error');
        return;
    }
    
    const isOwned = purchasedItems.has(itemId) || item.price === 0;
    const isPremium = userGP >= 100;
    
    if (!isOwned && !isPremium) {
        showToast('Please purchase this item first', 'warning');
        viewItemDetails(itemId);
        return;
    }
    
    if (item.file_url) {
        addGP(currentUser.id, GP_REWARDS.read_book, `Read: ${item.title}`).then(gp => {
            if (gp !== null) showToast(`📖 Reading ${item.title}... +${GP_REWARDS.read_book} GP`, 'info');
        });
        
        window.open(item.file_url, '_blank');
        showToast(`Opening ${item.title}...`, 'success');
    } else {
        showToast(`${item.title} - Content will be available soon.`, 'info');
    }
    closeModal();
};

window.downloadBundle = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) {
        showToast('Item not found', 'error');
        return;
    }
    
    const isOwned = purchasedItems.has(itemId) || item.price === 0;
    
    if (!isOwned) {
        showToast('Please purchase this bundle first', 'warning');
        viewItemDetails(itemId);
        return;
    }
    
    if (item.download_url) {
        const link = document.createElement('a');
        link.href = item.download_url;
        link.target = '_blank';
        link.download = `${item.title.replace(/\s+/g, '_')}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        const gpEarned = await addGP(currentUser.id, 2, `Downloaded bundle: ${item.title}`);
        
        if (gpEarned !== null) {
            showToast(`Downloading ${item.title}... +2 GP`, 'success');
        } else {
            showToast(`Downloading ${item.title}...`, 'success');
        }
    } else {
        showToast('Download link not available yet.', 'info');
    }
    closeModal();
};

// ============================================
// MODAL WITH PURCHASE OPTIONS
// ============================================

window.viewItemDetails = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) {
        showToast('Item not found', 'error');
        return;
    }
    
    const isPurchased = purchasedItems.has(item.id);
    const isFree = (item.price === 0 || !item.price) && (item.physical_price === 0 || !item.physical_price);
    const hasDigital = (item.price || 0) > 0;
    const hasPhysical = (item.physical_price || 0) > 0;
    const isPremium = userGP >= 100;
    const canReadOnline = item.file_url && (isPurchased || isFree || isPremium);
    const canDownloadBundle = item.type === 'bundle' && item.download_url && (isPurchased || isFree);
    const gpReward = item.type === 'bundle' ? GP_REWARDS.purchase_bundle : GP_REWARDS.purchase_book;
    
    const modal = document.getElementById('itemModal');
    if (!modal) {
        console.error('Modal element not found');
        return;
    }
    
    const modalTitle = document.getElementById('modalTitle');
    const modalImage = document.getElementById('modalImage');
    const modalDescription = document.getElementById('modalDescription');
    const modalFooter = document.getElementById('modalFooter');
    
    modalTitle.textContent = item.title;
    
    const coverUrl = item.cover_url || `https://placehold.co/300x450/2c2f78/white?text=${encodeURIComponent(item.title)}`;
    modalImage.src = coverUrl;
    modalImage.alt = item.title;
    
    let descriptionHtml = `
        <div class="item-details">
            <p><strong>Author:</strong> ${escapeHtml(item.author || 'Gliimu Team')}</p>
            <p><strong>Type:</strong> ${item.type || 'Book'} | <strong>Level:</strong> ${item.level || 'Beginner'}</p>
            ${isPremium ? `<p><span class="premium-badge">⭐ Premium Access</span></p>` : ''}
            ${isPurchased ? `<p><span class="owned-badge">✅ You own this item</span></p>` : ''}
            
            <div class="price-details">
                ${hasDigital ? `
                    <div class="price-row">
                        <span class="label">📱 PDF/EPUB</span>
                        <span class="value ${item.price === 0 ? 'free' : ''}">${item.price === 0 ? 'Free' : `₦${(item.price || 0).toLocaleString()}`}</span>
                    </div>
                ` : ''}
                ${hasPhysical ? `
                    <div class="price-row">
                        <span class="label">📖 Hard Copy (Shipping extra)</span>
                        <span class="value">₦${(item.physical_price || 0).toLocaleString()}</span>
                    </div>
                ` : ''}
                ${!isPurchased ? `
                    <div class="price-row">
                        <span class="label">⭐ GP Earned</span>
                        <span class="value" style="color: #8b5cf6;">+${gpReward} GP</span>
                    </div>
                ` : ''}
            </div>
            
            ${isPremium && hasDigital && !isPurchased ? `
                <div class="premium-notice">
                    <span>✨ Premium users get PDF/EPUB access for FREE!</span>
                </div>
            ` : ''}
            
            <div class="description-text">${escapeHtml(item.description || 'No description available.')}</div>
        </div>
    `;
    
    modalDescription.innerHTML = descriptionHtml;
    
    let footerHtml = '';
    
    if (isPurchased) {
        footerHtml = `
            ${canReadOnline ? `<button class="modal-btn modal-btn-primary" onclick="window.startReading('${item.id}')"><i class="fas fa-book-open"></i> Read Online</button>` : ''}
            ${canDownloadBundle ? `<button class="modal-btn modal-btn-primary" onclick="window.downloadBundle('${item.id}')"><i class="fas fa-download"></i> Download Bundle</button>` : ''}
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else if (isFree) {
        footerHtml = `
            <button class="modal-btn modal-btn-success" onclick="window.grantFreeAccess('${item.id}')"><i class="fas fa-gift"></i> Get Free Access</button>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else if (isPremium && hasDigital) {
        footerHtml = `
            <button class="modal-btn modal-btn-success" onclick="window.grantAccess('${item.id}', 'premium')"><i class="fas fa-star"></i> Premium Access (Free PDF)</button>
            ${hasPhysical ? `<button class="modal-btn modal-btn-primary" onclick="window.purchaseItem('${item.id}', 'physical')"><i class="fas fa-truck"></i> Buy Hard Copy (₦${(item.physical_price || 0).toLocaleString()})</button>` : ''}
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else {
        footerHtml = `
            ${hasDigital ? `<button class="modal-btn modal-btn-primary" onclick="window.purchaseItem('${item.id}', 'digital')"><i class="fas fa-shopping-cart"></i> Buy PDF/EPUB (₦${(item.price || 0).toLocaleString()})</button>` : ''}
            ${hasPhysical ? `<button class="modal-btn modal-btn-primary" onclick="window.purchaseItem('${item.id}', 'physical')"><i class="fas fa-truck"></i> Buy Hard Copy (₦${(item.physical_price || 0).toLocaleString()})</button>` : ''}
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    }
    
    modalFooter.innerHTML = footerHtml;
    modal.classList.add('active');
};

// ============================================
// SAVE/UNSAVE ITEM
// ============================================

window.toggleSaveItem = async (itemId) => {
    if (!currentUser) {
        showToast('Please login to save items', 'error');
        window.location.href = '/signin.html';
        return;
    }
    
    const isSaved = savedItems.has(itemId);
    
    try {
        if (isSaved) {
            const { error } = await supabase
                .from('user_library_progress')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('item_id', itemId);
            
            if (error) throw error;
            savedItems.delete(itemId);
            showToast('Removed from your saved items', 'info');
        } else {
            const { error } = await supabase
                .from('user_library_progress')
                .insert([{
                    user_id: currentUser.id,
                    item_id: itemId,
                    progress: 0,
                    completed: false,
                    created_at: new Date().toISOString()
                }]);
            
            if (error) throw error;
            savedItems.add(itemId);
            showToast('Saved to your library!', 'success');
            
            await addGP(currentUser.id, GP_REWARDS.save_item, `Saved item: ${itemId}`);
        }
        
        renderItems();
        // Refresh filter counts
        renderFilters();
        
    } catch (error) {
        console.error('Error saving item:', error);
        showToast('Error updating library', 'error');
    }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function setupEventListeners() {
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            currentSearch = document.getElementById('searchInput')?.value || '';
            renderItems();
        });
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                currentSearch = e.target.value;
                renderItems();
            }
        });
        searchInput.addEventListener('input', () => {
            if (!searchInput.value) {
                currentSearch = '';
                renderItems();
            }
        });
    }
    
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeModal);
    }
    
    const modal = document.getElementById('itemModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                closeModal();
            }
        });
    }
}

window.closeModal = () => {
    const modal = document.getElementById('itemModal');
    if (modal) modal.classList.remove('active');
};

window.grantFreeAccess = grantFreeAccess;
window.grantAccess = grantAccess;

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// EXPOSE FUNCTIONS GLOBALLY
// ============================================
window.viewItemDetails = viewItemDetails;
window.purchaseItem = purchaseItem;
window.startReading = startReading;
window.downloadBundle = downloadBundle;
window.toggleSaveItem = toggleSaveItem;
window.closeModal = closeModal;
window.grantFreeAccess = grantFreeAccess;
window.grantAccess = grantAccess;

console.log('✅ Library.js loaded successfully');
