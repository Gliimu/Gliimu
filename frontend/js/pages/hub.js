// ============================================
// GLIIMU HUB - Complete JavaScript
// ============================================

import { supabase, getCurrentUser } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// STATE
// ============================================
let currentUser = null;
let allItems = [];
let savedItems = new Set();
let purchasedItems = new Set();
let userGP = 0;
let userWallet = 0;
let currentSection = 'for-you';
let isDropdownOpen = false;
let isSearchOpen = false;

const GP_REWARDS = {
    purchase_book: 5,
    purchase_bundle: 10,
    purchase_physical: 3,
    read_book: 2,
    watch_talk: 2,
    save_item: 1
};

// ============================================
// DOM REFS
// ============================================
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const DOM = {
    grid: $('contentGrid'),
    gpValue: $('headerGP'),
    avatar: $('profileAvatar'),
    searchTrigger: $('searchTrigger'),
    searchModal: $('searchModal'),
    searchInput: $('searchModalInput'),
    searchBtn: $('searchModalBtn'),
    searchResults: $('searchResults'),
    searchClose: $('searchModalClose'),
    itemModal: $('itemModal'),
    modalTitle: $('modalTitle'),
    modalImage: $('modalImage'),
    modalDesc: $('modalDescription'),
    modalFooter: $('modalFooter'),
    modalSaveBtn: $('modalSaveBtn'),
    modalCloseBtn: $('modalCloseBtn'),
    profileBtn: $('profileBtn'),
    dropdown: $('dropdownMenu'),
    savedLink: $('savedItemsLink'),
    purchasedLink: $('purchasedItemsLink'),
    merchLink: $('merchandiseLink'),
    logo: $('logoImg'),
    header: $('hubHeader'),
    sectionTabs: document.querySelectorAll('.section-tab')
};

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Hub initializing...');
    DOM.grid.innerHTML = '<div class="loading">Loading content...</div>';

    try {
        currentUser = await getCurrentUser();
        console.log('👤 User:', currentUser?.email || 'Guest');

        if (currentUser) {
            await loadUserData();
            await loadSavedItems();
            await loadPurchasedItems();
            updateGPDisplay();
            updateAvatar();
        }

        await loadItems();
        setupEventListeners();
        applyTheme();
        setupScrollHeader();
        setupProfileDropdown();
        setupSearchModal();
        setupSectionTabs();

    } catch (error) {
        console.error('❌ Init error:', error);
        DOM.grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to Load</h3>
                <p>${error.message || 'Please refresh.'}</p>
                <button onclick="location.reload()" class="modal-btn modal-btn-primary" style="margin-top:1rem;">Refresh</button>
            </div>
        `;
    }
});

// ============================================
// DATA LOADING
// ============================================
async function loadUserData() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabase
            .from('users')
            .select('wallet_balance, gp_points, avatar_url')
            .eq('id', currentUser.id)
            .single();

        if (error) throw error;
        userWallet = data?.wallet_balance || 0;
        userGP = data?.gp_points || 0;
        if (data?.avatar_url) currentUser.avatar_url = data.avatar_url;
    } catch (e) {
        console.error('Error loading user data:', e);
    }
}

async function loadItems() {
    try {
        const { data, error } = await supabase
            .from('library_items')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (!data || data.length === 0) {
            DOM.grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-open"></i>
                    <h3>No Content Yet</h3>
                    <p>Check back soon for new content.</p>
                </div>
            `;
            return;
        }

        allItems = data;
        console.log(`✅ Loaded ${data.length} items`);
        renderSection('for-you');

    } catch (e) {
        console.error('Error loading items:', e);
        DOM.grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-database"></i>
                <h3>Database Error</h3>
                <p>${e.message}</p>
                <button onclick="loadItems()" class="modal-btn modal-btn-primary" style="margin-top:1rem;">Retry</button>
            </div>
        `;
    }
}

async function loadSavedItems() {
    if (!currentUser) return;
    try {
        const { data } = await supabase
            .from('user_library_progress')
            .select('item_id')
            .eq('user_id', currentUser.id);
        if (data) savedItems = new Set(data.map(i => i.item_id));
    } catch (e) { console.error('Error loading saved:', e); }
}

async function loadPurchasedItems() {
    if (!currentUser) return;
    try {
        const { data } = await supabase
            .from('user_purchases')
            .select('item_id')
            .eq('user_id', currentUser.id);
        if (data) purchasedItems = new Set(data.map(i => i.item_id));
    } catch (e) { console.error('Error loading purchased:', e); }
}

// ============================================
// SECTION TABS
// ============================================
function setupSectionTabs() {
    DOM.sectionTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            DOM.sectionTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentSection = tab.dataset.section;
            renderSection(currentSection);
        });
    });
}

function renderSection(section) {
    let filtered = [...allItems];

    switch(section) {
        case 'for-you':
            // Show items based on user interests or random
            if (userInterests.length > 0) {
                filtered = filtered.filter(item => 
                    userInterests.some(interest => 
                        item.category?.toLowerCase().includes(interest.toLowerCase())
                    )
                );
            }
            if (filtered.length === 0) filtered = allItems.slice(0, 12);
            break;
        case 'trending':
            // Sort by view count or purchase count
            filtered = filtered.sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 12);
            break;
        case 'new':
            // Already sorted by created_at descending
            filtered = filtered.slice(0, 12);
            break;
        default:
            filtered = allItems;
    }

    renderItems(filtered);
}

// ============================================
// RENDER
// ============================================
function renderItems(items = null) {
    const list = items || allItems;
    if (!list.length) {
        DOM.grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>No Items Found</h3>
                <p>Try a different section or search.</p>
            </div>
        `;
        return;
    }
    DOM.grid.innerHTML = list.map(item => createCard(item)).join('');
}

function createCard(item) {
    const isPurchased = purchasedItems.has(item.id);
    const isSaved = savedItems.has(item.id);
    const isTalk = item.type === 'talk' || item.type === 'course';
    const isBundle = item.type === 'bundle';
    const hasPrice = (item.price || 0) > 0;
    const cover = item.cover_url || `https://placehold.co/300x450/2c2f78/white?text=${encodeURIComponent(item.title || 'Item')}`;

    // --- Talk Card ---
    if (isTalk) {
        return `
            <div class="grid-item item-talk" data-id="${item.id}" onclick="window.viewDetails('${item.id}')">
                <div class="card-cover" style="background-image: url('${cover}')">
                    <div class="play-btn"><i class="fas fa-play"></i></div>
                    ${isPurchased ? '<div class="purchased-badge">✓ Purchased</div>' : ''}
                    ${isSaved && !isPurchased ? '<div class="saved-badge">★ Saved</div>' : ''}
                    ${hasPrice && !isPurchased ? `<div class="price-badge">₦${(item.price || 0).toLocaleString()}</div>` : ''}
                </div>
                <div class="card-footer">
                    <div class="title">${escape(item.title)}</div>
                    <div class="author">${escape(item.author || 'Gliimu Team')}</div>
                    ${item.duration ? `<div class="duration"><i class="fas fa-clock"></i> ${item.duration}</div>` : ''}
                </div>
            </div>
        `;
    }

    // --- Bundle Card ---
    if (isBundle) {
        return `
            <div class="grid-item item-bundle" data-id="${item.id}">
                <div class="bundle-content" onclick="window.viewDetails('${item.id}')">
                    <div class="bundle-title">${escape(item.title)}</div>
                    <div class="bundle-meta">${escape(item.author || 'Gliimu Team')}</div>
                    ${hasPrice ? `<div class="bundle-price">₦${(item.price || 0).toLocaleString()}</div>` : '<div class="bundle-price free">Free</div>'}
                    ${isPurchased ? '<div class="purchased-tag">✓ Owned</div>' : ''}
                </div>
                <button class="bundle-download-btn" onclick="event.stopPropagation(); window.downloadBundle('${item.id}')" 
                    ${!isPurchased && hasPrice ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 3v12m0 0-3-3m3 3 3-3M5 21h14"/>
                    </svg>
                </button>
            </div>
        `;
    }

    // --- Book Card ---
    return `
        <div class="grid-item item-book" data-id="${item.id}" onclick="window.viewDetails('${item.id}')">
            <div class="card-cover" style="background-image: url('${cover}')">
                ${isPurchased ? '<div class="purchased-badge">✓ Purchased</div>' : ''}
                ${isSaved && !isPurchased ? '<div class="saved-badge">★ Saved</div>' : ''}
                ${hasPrice && !isPurchased ? `<div class="price-badge">₦${(item.price || 0).toLocaleString()}</div>` : ''}
            </div>
        </div>
    `;
}

// ============================================
// GP MANAGEMENT
// ============================================
async function addGP(amount, reason) {
    if (!currentUser) return null;
    try {
        const { data, error } = await supabase
            .from('users')
            .select('gp_points')
            .eq('id', currentUser.id)
            .single();
        if (error) throw error;

        const current = data?.gp_points || 0;
        const newGP = current + amount;

        await supabase
            .from('users')
            .update({ gp_points: newGP })
            .eq('id', currentUser.id);

        userGP = newGP;
        updateGPDisplay();

        if (newGP >= 100 && current < 100) {
            showToast('🎉 Premium status unlocked at 100 GP!', 'success');
        }

        return newGP;
    } catch (e) {
        console.error('GP error:', e);
        return null;
    }
}

// ============================================
// UI UPDATES
// ============================================
function updateGPDisplay() {
    if (DOM.gpValue) DOM.gpValue.textContent = userGP;
}

function updateAvatar() {
    if (DOM.avatar) {
        const url = currentUser?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name || 'User')}&background=2c2f78&color=fff`;
        DOM.avatar.src = url;
    }
}

// ============================================
// THEME
// ============================================
function applyTheme() {
    const theme = localStorage.getItem('theme');
    const isDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
        document.body.classList.add('dark-mode');
        if (DOM.logo) DOM.logo.style.filter = 'brightness(0) invert(1)';
    }
}

function setupScrollHeader() {
    window.addEventListener('scroll', () => {
        DOM.header.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
}

// ============================================
// PROFILE DROPDOWN
// ============================================
function setupProfileDropdown() {
    DOM.profileBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        isDropdownOpen = !isDropdownOpen;
        DOM.dropdown.classList.toggle('show', isDropdownOpen);
    });

    document.addEventListener('click', () => {
        DOM.dropdown.classList.remove('show');
        isDropdownOpen = false;
    });

    DOM.savedLink?.addEventListener('click', (e) => {
        e.preventDefault();
        const saved = allItems.filter(i => savedItems.has(i.id));
        renderItems(saved.length ? saved : null);
        if (!saved.length) showToast('No saved items yet', 'info');
        DOM.dropdown.classList.remove('show');
        isDropdownOpen = false;
    });

    DOM.purchasedLink?.addEventListener('click', (e) => {
        e.preventDefault();
        const purchased = allItems.filter(i => purchasedItems.has(i.id));
        renderItems(purchased.length ? purchased : null);
        if (!purchased.length) showToast('No purchased items yet', 'info');
        DOM.dropdown.classList.remove('show');
        isDropdownOpen = false;
    });

    DOM.merchLink?.addEventListener('click', (e) => {
        e.preventDefault();
        showToast('Merchandise coming soon!', 'info');
        DOM.dropdown.classList.remove('show');
        isDropdownOpen = false;
    });
}

// ============================================
// SEARCH MODAL - FILTERS ITEMS
// ============================================
function setupSearchModal() {
    const open = () => {
        DOM.searchModal.classList.add('active');
        isSearchOpen = true;
        setTimeout(() => DOM.searchInput.focus(), 100);
    };

    const close = () => {
        DOM.searchModal.classList.remove('active');
        isSearchOpen = false;
        DOM.searchResults.innerHTML = '<p class="search-hint">Type to start searching...</p>';
        DOM.searchInput.value = '';
    };

    DOM.searchTrigger?.addEventListener('click', open);
    DOM.searchClose?.addEventListener('click', close);
    DOM.searchModal?.addEventListener('click', (e) => {
        if (e.target === DOM.searchModal || e.target.classList.contains('search-modal-overlay')) close();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isSearchOpen) close();
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); open(); }
    });

    const search = () => {
        const query = DOM.searchInput.value.trim();
        if (!query) {
            DOM.searchResults.innerHTML = '<p class="search-hint">Type to start searching...</p>';
            return;
        }

        const q = query.toLowerCase();
        // Filter all items by search query
        const results = allItems.filter(i =>
            (i.title?.toLowerCase().includes(q)) ||
            (i.description?.toLowerCase().includes(q)) ||
            (i.author?.toLowerCase().includes(q)) ||
            (i.category?.toLowerCase().includes(q))
        );

        if (!results.length) {
            DOM.searchResults.innerHTML = `
                <div class="search-no-results">
                    <i class="fas fa-search"></i>
                    <p>No results for "<strong>${query}</strong>"</p>
                </div>
            `;
        } else {
            DOM.searchResults.innerHTML = results.map(i => `
                <div class="search-result-item" onclick="window.viewDetails('${i.id}'); closeSearchModal();">
                    <img src="${i.cover_url || 'https://placehold.co/50x70/2c2f78/white?text=Book'}" alt="${i.title}">
                    <div class="result-info">
                        <div class="result-title">${escape(i.title)}</div>
                        <div class="result-meta">${escape(i.author || 'Gliimu Team')}</div>
                    </div>
                    <div class="result-price">${i.price > 0 ? '₦' + i.price.toLocaleString() : 'Free'}</div>
                </div>
            `).join('');

            // Also update main grid with search results
            renderItems(results);
        }
    };

    DOM.searchBtn?.addEventListener('click', search);
    DOM.searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { search(); setTimeout(close, 400); }
    });

    window.closeSearchModal = close;
}

// ============================================
// ITEM DETAILS
// ============================================
window.viewDetails = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return showToast('Item not found', 'error');

    const isPurchased = purchasedItems.has(item.id);
    const isSaved = savedItems.has(item.id);
    const isFree = (item.price || 0) <= 0 && (item.physical_price || 0) <= 0;
    const hasDigital = (item.price || 0) > 0;
    const hasPhysical = (item.physical_price || 0) > 0;
    const isPremium = userGP >= 100;
    const gpReward = item.type === 'bundle' ? GP_REWARDS.purchase_bundle : GP_REWARDS.purchase_book;

    DOM.modalTitle.textContent = item.title;
    DOM.modalImage.src = item.cover_url || `https://placehold.co/300x450/2c2f78/white?text=${encodeURIComponent(item.title)}`;

    // Update save button
    const newSaveBtn = DOM.modalSaveBtn.cloneNode(true);
    DOM.modalSaveBtn.parentNode.replaceChild(newSaveBtn, DOM.modalSaveBtn);
    newSaveBtn.className = `modal-save-btn ${isSaved ? 'saved' : ''}`;
    newSaveBtn.innerHTML = `<i class="fas fa-bookmark"></i>`;
    newSaveBtn.title = isSaved ? 'Remove from saved' : 'Save for later';
    newSaveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSave(item.id);
    });

    DOM.modalDesc.innerHTML = `
        <div class="item-details">
            <p><strong>Author:</strong> ${escape(item.author || 'Gliimu Team')}</p>
            <p><strong>Type:</strong> ${item.type || 'Book'}</p>
            ${isPremium ? `<p><span class="premium-badge">⭐ Premium Access</span></p>` : ''}
            ${isPurchased ? `<p><span class="owned-badge">✅ You own this</span></p>` : ''}
            <div class="price-details">
                ${hasDigital ? `<div class="price-row"><span class="label">📱 Digital</span><span class="value ${item.price === 0 ? 'free' : ''}">${item.price === 0 ? 'Free' : '₦' + (item.price || 0).toLocaleString()}</span></div>` : ''}
                ${hasPhysical ? `<div class="price-row"><span class="label">📖 Physical</span><span class="value">₦${(item.physical_price || 0).toLocaleString()}</span></div>` : ''}
                ${!isPurchased ? `<div class="price-row"><span class="label">⭐ GP Earned</span><span class="value" style="color:#8b5cf6;">+${gpReward} GP</span></div>` : ''}
            </div>
            ${isPremium && hasDigital && !isPurchased ? `<div class="premium-notice">✨ Premium users get digital access FREE!</div>` : ''}
            <div class="description-text">${escape(item.description || 'No description.')}</div>
        </div>
    `;

    let footerHtml = '';
    if (isPurchased) {
        footerHtml = `
            ${item.file_url ? `<button class="modal-btn modal-btn-primary" onclick="window.open('${item.file_url}','_blank')"><i class="fas fa-book-open"></i> Read/View</button>` : ''}
            ${item.type === 'bundle' && item.download_url ? `<button class="modal-btn modal-btn-primary" onclick="window.downloadBundle('${item.id}')"><i class="fas fa-download"></i> Download</button>` : ''}
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else if (isFree) {
        footerHtml = `
            <button class="modal-btn modal-btn-success" onclick="window.handleFreeAccess('${item.id}')"><i class="fas fa-gift"></i> Get Access</button>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else if (isPremium && hasDigital) {
        footerHtml = `
            <button class="modal-btn modal-btn-success" onclick="window.handleGrantAccess('${item.id}')"><i class="fas fa-star"></i> Premium Free</button>
            <div class="modal-btn-dropdown">
                <button class="modal-btn modal-btn-primary" onclick="togglePurchaseDropdown()"><i class="fas fa-shopping-cart"></i> Buy <i class="fas fa-chevron-down"></i></button>
                <div class="dropdown-options" id="purchaseDropdown">
                    ${hasDigital ? `<button onclick="window.handlePurchase('${item.id}','digital')">📱 Digital <span class="price">₦${(item.price || 0).toLocaleString()}</span></button>` : ''}
                    ${hasPhysical ? `<button onclick="window.handlePurchase('${item.id}','physical')">📖 Physical <span class="price">₦${(item.physical_price || 0).toLocaleString()}</span></button>` : ''}
                </div>
            </div>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else {
        footerHtml = `
            <div class="modal-btn-dropdown">
                <button class="modal-btn modal-btn-primary" onclick="togglePurchaseDropdown()"><i class="fas fa-shopping-cart"></i> Buy <i class="fas fa-chevron-down"></i></button>
                <div class="dropdown-options" id="purchaseDropdown">
                    ${hasDigital ? `<button onclick="window.handlePurchase('${item.id}','digital')">📱 Digital <span class="price">₦${(item.price || 0).toLocaleString()}</span></button>` : ''}
                    ${hasPhysical ? `<button onclick="window.handlePurchase('${item.id}','physical')">📖 Physical <span class="price">₦${(item.physical_price || 0).toLocaleString()}</span></button>` : ''}
                </div>
            </div>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    }
    DOM.modalFooter.innerHTML = footerHtml;
    DOM.itemModal.classList.add('active');
};

// ============================================
// PURCHASE FUNCTIONS
// ============================================
window.handlePurchase = async (itemId, type) => {
    if (!currentUser) return showToast('Please login', 'error');

    const item = allItems.find(i => i.id === itemId);
    if (!item) return showToast('Item not found', 'error');

    const price = type === 'physical' ? (item.physical_price || 0) : (item.price || 0);
    if (price <= 0) return handleFreeAccess(itemId);
    if (purchasedItems.has(itemId)) return showToast('Already owned', 'info');

    try {
        const { data: user } = await supabase
            .from('users')
            .select('wallet_balance')
            .eq('id', currentUser.id)
            .single();

        if ((user?.wallet_balance || 0) < price) {
            showToast(`Need ₦${(price - (user?.wallet_balance || 0)).toLocaleString()} more`, 'error');
            return;
        }

        await supabase
            .from('users')
            .update({ wallet_balance: (user?.wallet_balance || 0) - price })
            .eq('id', currentUser.id);

        await supabase
            .from('user_purchases')
            .insert({ user_id: currentUser.id, item_id: itemId, purchase_type: type, amount: price });

        purchasedItems.add(itemId);
        const gp = await addGP(item.type === 'bundle' ? 10 : 5, `Purchased: ${item.title}`);

        showToast(`✅ Purchased ${item.title}${gp ? ` +${gp} GP` : ''}`, 'success');
        renderSection(currentSection);
        closeModal();

        if (type === 'digital' && item.file_url) {
            setTimeout(() => {
                if (confirm(`Open "${item.title}" now?`)) window.open(item.file_url, '_blank');
            }, 800);
        }
    } catch (e) {
        console.error('Purchase error:', e);
        showToast('Purchase failed', 'error');
    }
};

window.handleGrantAccess = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    try {
        await supabase
            .from('user_purchases')
            .insert({ user_id: currentUser.id, item_id: itemId, purchase_type: 'premium', amount: 0 });
        purchasedItems.add(itemId);
        showToast(`✅ Premium access: ${item.title}`, 'success');
        renderSection(currentSection);
        closeModal();
        if (item.file_url) {
            setTimeout(() => {
                if (confirm(`Open "${item.title}" now?`)) window.open(item.file_url, '_blank');
            }, 800);
        }
    } catch (e) {
        showToast('Error granting access', 'error');
    }
};

window.handleFreeAccess = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    if (purchasedItems.has(itemId)) return showToast('Already owned', 'info');

    try {
        await supabase
            .from('user_purchases')
            .insert({ user_id: currentUser.id, item_id: itemId, purchase_type: 'digital', amount: 0 });
        purchasedItems.add(itemId);
        const gp = await addGP(1, `Free: ${item.title}`);
        showToast(`✅ Free access: ${item.title}${gp ? ` +${gp} GP` : ''}`, 'success');
        renderSection(currentSection);
        closeModal();
        if (item.file_url) {
            setTimeout(() => {
                if (confirm(`Open "${item.title}" now?`)) window.open(item.file_url, '_blank');
            }, 800);
        }
    } catch (e) {
        showToast('Error granting access', 'error');
    }
};

window.downloadBundle = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    if (!purchasedItems.has(itemId) && item.price > 0) {
        return showToast('Please purchase first', 'warning');
    }
    if (item.download_url) {
        const link = document.createElement('a');
        link.href = item.download_url;
        link.download = `${item.title.replace(/\s+/g, '_')}.zip`;
        link.click();
        showToast(`Downloading ${item.title}...`, 'success');
    } else {
        showToast('Download not available', 'info');
    }
    closeModal();
};

// ============================================
// SAVE / UNSAVE
// ============================================
async function toggleSave(itemId) {
    if (!currentUser) return showToast('Please login', 'error');

    const isSaved = savedItems.has(itemId);
    try {
        if (isSaved) {
            await supabase
                .from('user_library_progress')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('item_id', itemId);
            savedItems.delete(itemId);
            showToast('Removed from saved', 'info');
        } else {
            await supabase
                .from('user_library_progress')
                .insert({ user_id: currentUser.id, item_id: itemId, progress: 0 });
            savedItems.add(itemId);
            await addGP(1, `Saved: ${itemId}`);
            showToast('Saved to library!', 'success');
        }
        renderSection(currentSection);
        if (DOM.itemModal.classList.contains('active')) {
            const saveBtn = document.getElementById('modalSaveBtn');
            if (saveBtn) {
                const nowSaved = savedItems.has(itemId);
                saveBtn.className = `modal-save-btn ${nowSaved ? 'saved' : ''}`;
                saveBtn.title = nowSaved ? 'Remove from saved' : 'Save for later';
            }
        }
    } catch (e) {
        showToast('Error saving item', 'error');
    }
}

// ============================================
// DROPDOWN TOGGLE
// ============================================
window.togglePurchaseDropdown = () => {
    const dd = document.getElementById('purchaseDropdown');
    if (dd) {
        const isOpen = dd.classList.contains('show');
        document.querySelectorAll('.dropdown-options').forEach(d => d.classList.remove('show'));
        if (!isOpen) dd.classList.add('show');
    }
};

document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-options').forEach(d => d.classList.remove('show'));
});

// ============================================
// MODAL CONTROLS
// ============================================
window.closeModal = () => {
    DOM.itemModal.classList.remove('active');
    document.querySelectorAll('.dropdown-options').forEach(d => d.classList.remove('show'));
};

DOM.modalCloseBtn?.addEventListener('click', closeModal);
DOM.itemModal?.addEventListener('click', (e) => {
    if (e.target === DOM.itemModal) closeModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (DOM.itemModal.classList.contains('active')) closeModal();
    }
});

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Keyboard shortcut: Ctrl+K for search
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            if (DOM.searchTrigger) DOM.searchTrigger.click();
        }
    });
}

// ============================================
// UTILITY
// ============================================
function escape(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// EXPOSE GLOBALS
// ============================================
window.viewDetails = viewDetails;
window.handlePurchase = handlePurchase;
window.handleGrantAccess = handleGrantAccess;
window.handleFreeAccess = handleFreeAccess;
window.downloadBundle = downloadBundle;
window.closeModal = closeModal;
window.togglePurchaseDropdown = togglePurchaseDropdown;

console.log('✅ Hub loaded successfully');
