// ============================================
// GLIIMU HUB - Complete JavaScript
// ============================================

import { supabase, getCurrentUser, getUserProfile } from '../modules/supabase.js';
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
let isDropdownOpen = false;
let isSearchOpen = false;
let currentModalItemId = null;

const GP_REWARDS = {
    purchase_book: 5,
    purchase_bundle: 10,
    purchase_physical: 3,
    read_book: 2,
    watch_talk: 2,
    save_item: 1
};

// Delivery regions
const DELIVERY_REGIONS = [
    { id: 'abuja', name: 'Abuja', cities: ['Gwarinpa', 'Wuse', 'Maitama', 'Asokoro', 'Jabi', 'Utako', 'Garki', 'Kubwa', 'Bwari'] },
    { id: 'lagos', name: 'Lagos', cities: ['Ikeja', 'Victoria Island', 'Lekki', 'Surulere', 'Yaba', 'Apapa', 'Maryland', 'Magodo'] },
    { id: 'port-harcourt', name: 'Port Harcourt', cities: ['GRA', 'Rumuokwurushi', 'Ogbunabali', 'Borikiri', 'Elelenwo', 'Woji'] }
];

let currentPurchaseState = {
    itemId: null,
    selectedOption: null,
    selectedLocation: null,
    deliveryAddress: '',
    deliveryPhone: ''
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
    header: $('hubHeader')
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
        renderItems();

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
        console.log(`✅ Loaded ${savedItems.size} saved items`);
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
        console.log(`✅ Loaded ${purchasedItems.size} purchased items`);
    } catch (e) { console.error('Error loading purchased:', e); }
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
                <p>Try a different search.</p>
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
        DOM.header.classList.toggle('scrolled', window.scrollY > 50);
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
// SEARCH MODAL
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

    const performSearch = () => {
        const query = DOM.searchInput.value.trim();
        if (!query) {
            DOM.searchResults.innerHTML = '<p class="search-hint">Type to start searching...</p>';
            return;
        }

        const q = query.toLowerCase();
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
                    <p>No results for "${query}"</p>
                </div>
            `;
        } else {
            DOM.searchResults.innerHTML = results.map(i => `
                <div class="search-result-item" onclick="window.viewDetails('${i.id}'); window.closeSearchModal();">
                    <img src="${i.cover_url || 'https://placehold.co/50x70/2c2f78/white?text=Book'}" alt="${i.title}">
                    <div class="result-info">
                        <div class="result-title">${escape(i.title)}</div>
                        <div class="result-meta">${escape(i.author || 'Gliimu Team')}</div>
                    </div>
                    <div class="result-price">${i.price > 0 ? '₦' + i.price.toLocaleString() : 'Free'}</div>
                </div>
            `).join('');
        }
    };

    DOM.searchBtn?.addEventListener('click', performSearch);
    DOM.searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { performSearch(); }
    });

    window.closeSearchModal = close;
}

// ============================================
// VIEW DETAILS - MAIN ENTRY POINT
// ============================================
window.viewDetails = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return showToast('Item not found', 'error');

    currentModalItemId = itemId;

    // Route to appropriate detail view based on type
    if (item.type === 'book' || item.type === 'resource') {
        await renderBookDetails(itemId);
    } else if (item.type === 'talk' || item.type === 'course') {
        await renderTalkDetails(itemId);
    } else if (item.type === 'bundle') {
        await renderBundleDetails(itemId);
    } else {
        await renderGenericDetails(itemId);
    }
};

// ============================================
// BOOK DETAILS - WIDE MODAL WITH CHAPTER PREVIEW
// ============================================
async function renderBookDetails(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    const isPurchased = purchasedItems.has(item.id);
    const isSaved = savedItems.has(item.id);
    const isPremium = userGP >= 100;

    // Reset purchase state
    currentPurchaseState.itemId = itemId;
    currentPurchaseState.selectedOption = null;
    currentPurchaseState.selectedLocation = null;

    // Update modal to book layout - WIDE
    const modal = DOM.itemModal;
    const modalContent = modal.querySelector('.modal-content');
    modalContent.classList.add('book-modal');

    DOM.modalTitle.textContent = item.title;

    // Update save button
    updateSaveButton(item.id, isSaved);

    // First chapter preview (mock - would come from database)
    const firstChapter = item.first_chapter || `Chapter 1: The Beginning

It was a quiet morning when everything changed. The sun rose over the horizon, painting the sky in hues of orange and gold. Little did anyone know that this day would mark the beginning of an extraordinary journey.

Sarah had always dreamed of something more. She spent her days in the small town library, reading stories of adventure and discovery. The worn pages of books were her windows to worlds beyond her own.

"You have to see this," her grandmother had told her years ago. "The world is bigger than you think, and you have a place in it."

Those words echoed in her mind as she stood at the crossroads of her life. The choice was hers to make. The path ahead was uncertain, but one thing was clear: she was ready to take the first step...`;

    const coverUrl = item.cover_url || `https://placehold.co/280x400/2c2f78/white?text=${encodeURIComponent(item.title)}`;
    
    let detailsHtml = `
        <div class="book-layout">
            <div class="book-cover-wrapper">
                <img src="${coverUrl}" alt="${item.title}" class="book-cover-img">
                ${!isPurchased ? `<div class="book-price-tag">₦${(item.price || 0).toLocaleString()}</div>` : ''}
            </div>
            <div class="book-info-wrapper">
                <h2 class="book-title">${escape(item.title)}</h2>
                <div class="book-author">by ${escape(item.author || 'Gliimu Team')}</div>
                <div class="book-meta-tags">
                    <span class="tag">📖 ${item.type || 'Book'}</span>
                    <span class="tag">📚 ${item.category || 'General'}</span>
                    <span class="tag">⭐ ${item.level || 'Beginner'}</span>
                    ${isPremium ? '<span class="tag premium-tag">⭐ Premium</span>' : ''}
                    ${isPurchased ? '<span class="tag owned-tag">✅ Owned</span>' : ''}
                </div>
                <div class="book-description">${escape(item.description || 'No description available.')}</div>
                
                <!-- First Chapter Preview - WIDE -->
                <div class="chapter-preview-wide">
                    <div class="chapter-header">
                        <span class="chapter-icon">📖</span>
                        <span class="chapter-label">First Chapter Preview</span>
                    </div>
                    <div class="chapter-content ${isPurchased ? '' : 'chapter-blur'}">
                        ${escape(firstChapter)}
                        ${!isPurchased ? '<div class="chapter-lock">🔒 Continue reading after purchase</div>' : ''}
                    </div>
                </div>
    `;

    // If not purchased, show purchase options
    if (!isPurchased) {
        const hasDigital = (item.price || 0) > 0;
        const hasPhysical = (item.physical_price || 0) > 0;
        const hasAudio = (item.audio_price || 0) > 0;
        const digitalPrice = item.price || 0;
        const physicalPrice = item.physical_price || 0;
        const audioPrice = item.audio_price || 0;

        detailsHtml += `
                <div class="purchase-section">
                    <div class="purchase-options-grid">
                        ${hasDigital ? `
                            <div class="purchase-option-card" data-type="digital" onclick="selectPurchaseOption('digital', ${digitalPrice})">
                                <span class="option-icon">📱</span>
                                <span class="option-name">Digital</span>
                                <span class="option-price ${digitalPrice === 0 ? 'free' : ''}">${digitalPrice === 0 ? 'Free' : '₦' + digitalPrice.toLocaleString()}</span>
                                <span class="option-desc">Read online</span>
                                ${isPremium && digitalPrice > 0 ? '<span class="option-badge">⭐ Free with Premium</span>' : ''}
                            </div>
                        ` : ''}
                        ${hasPhysical ? `
                            <div class="purchase-option-card" data-type="physical" onclick="selectPurchaseOption('physical', ${physicalPrice})">
                                <span class="option-icon">📖</span>
                                <span class="option-name">Hard Copy</span>
                                <span class="option-price">₦${physicalPrice.toLocaleString()}</span>
                                <span class="option-desc">+ shipping</span>
                            </div>
                        ` : ''}
                        ${hasAudio ? `
                            <div class="purchase-option-card" data-type="audio" onclick="selectPurchaseOption('audio', ${audioPrice})">
                                <span class="option-icon">🎧</span>
                                <span class="option-name">Audio Book</span>
                                <span class="option-price">₦${audioPrice.toLocaleString()}</span>
                                <span class="option-desc">Listen anywhere</span>
                            </div>
                        ` : ''}
                        ${isPremium && hasDigital ? `
                            <div class="purchase-option-card premium-option" data-type="premium" onclick="selectPurchaseOption('premium', 0)">
                                <span class="option-icon">⭐</span>
                                <span class="option-name">Premium Access</span>
                                <span class="option-price free">FREE</span>
                                <span class="option-desc">Unlocked with GP</span>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Delivery Section -->
                    <div class="delivery-section" id="deliverySection">
                        <h4>📦 Delivery Options</h4>
                        <div class="location-selector">
                            <div class="location-option" data-location="pickup" onclick="selectLocation('pickup')">
                                <span class="location-icon">🏢</span>
                                <span class="location-name">Pickup at Office</span>
                                <span class="location-desc">Gwarinpa, Abuja</span>
                            </div>
                            <div class="location-option" data-location="delivery" onclick="selectLocation('delivery')">
                                <span class="location-icon">🚚</span>
                                <span class="location-name">Home Delivery</span>
                                <span class="location-desc">We deliver to your address</span>
                            </div>
                        </div>
                        <div id="deliveryDetails">
                            <div class="form-group">
                                <label>Region</label>
                                <select id="deliveryRegion" onchange="updateDeliveryCities()">
                                    <option value="">Select your region</option>
                                    ${DELIVERY_REGIONS.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>City</label>
                                <select id="deliveryCity">
                                    <option value="">Select your city</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Full Address</label>
                                <input type="text" id="deliveryAddress" placeholder="House number, street, landmark">
                            </div>
                            <div class="form-group">
                                <label>Phone Number</label>
                                <input type="tel" id="deliveryPhone" placeholder="080XXXXXXXX">
                            </div>
                            <div class="delivery-note">
                                📦 Delivery takes 3-5 business days. Shipping fees apply based on location.
                            </div>
                        </div>
                    </div>

                    <!-- Purchase Summary -->
                    <div class="purchase-summary" id="purchaseSummary">
                        <span class="summary-label">Total:</span>
                        <span class="summary-total" id="summaryTotal">₦0</span>
                    </div>
                    <button class="purchase-btn" id="purchaseBtn" disabled>
                        Select an option to purchase
                    </button>
                </div>
        `;
    } else {
        // Already purchased
        detailsHtml += `
                <div class="purchase-section">
                    <button class="purchase-btn primary" onclick="window.open('${item.file_url || '#'}','_blank')">
                        <i class="fas fa-book-open"></i> Read Now
                    </button>
                </div>
        `;
    }

    detailsHtml += `
            </div>
        </div>
    `;

    DOM.modalDesc.innerHTML = detailsHtml;
    DOM.modalImage.style.display = 'none';

    // Store purchase button references
    DOM.purchaseBtn = document.getElementById('purchaseBtn');
    DOM.purchaseSummary = document.getElementById('purchaseSummary');
    DOM.summaryTotal = document.getElementById('summaryTotal');
    DOM.deliverySection = document.getElementById('deliverySection');

    modal.classList.add('active');
}

// ============================================
// TALK DETAILS
// ============================================
async function renderTalkDetails(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    const isPurchased = purchasedItems.has(item.id);
    const isSaved = savedItems.has(item.id);
    const isPremium = userGP >= 100;

    // Reset modal style
    const modal = DOM.itemModal;
    const modalContent = modal.querySelector('.modal-content');
    modalContent.classList.remove('book-modal');

    DOM.modalTitle.textContent = item.title;
    DOM.modalImage.src = item.cover_url || `https://placehold.co/300x450/2c2f78/white?text=${encodeURIComponent(item.title)}`;
    DOM.modalImage.style.display = 'block';

    updateSaveButton(item.id, isSaved);

    let detailsHtml = `
        <div class="item-details">
            <p><strong>Speaker:</strong> ${escape(item.author || 'Gliimu Team')}</p>
            <p><strong>Type:</strong> 🎙️ Talk</p>
            ${item.duration ? `<p><strong>Duration:</strong> ${item.duration}</p>` : ''}
            ${isPremium ? `<p><span class="premium-badge">⭐ Premium Access</span></p>` : ''}
            ${isPurchased ? `<p><span class="owned-badge">✅ You own this</span></p>` : ''}
            
            <div class="talk-engagement">
                <button class="engagement-btn" onclick="window.likeTalk('${item.id}')">
                    <i class="far fa-heart"></i> <span class="count">${item.likes || 0}</span>
                </button>
                <button class="engagement-btn" onclick="window.shareTalk('${item.id}')">
                    <i class="far fa-share-alt"></i> <span class="count">${item.shares || 0}</span>
                </button>
                <button class="engagement-btn" onclick="window.commentTalk('${item.id}')">
                    <i class="far fa-comment"></i> <span class="count">${item.comments || 0}</span>
                </button>
            </div>
            
            <div class="description-text">${escape(item.description || 'No description available.')}</div>
        </div>
    `;

    DOM.modalDesc.innerHTML = detailsHtml;

    let footerHtml = '';
    if (isPurchased) {
        footerHtml = `
            ${item.file_url ? `<button class="modal-btn modal-btn-primary" onclick="window.open('${item.file_url}','_blank')"><i class="fas fa-play"></i> Watch Now</button>` : ''}
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else if (item.price === 0 || !item.price) {
        footerHtml = `
            <button class="modal-btn modal-btn-success" onclick="window.handleFreeAccess('${item.id}')"><i class="fas fa-play"></i> Watch Now</button>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else {
        footerHtml = `
            <button class="modal-btn modal-btn-primary" onclick="window.handlePurchase('${item.id}','digital')"><i class="fas fa-shopping-cart"></i> Purchase (₦${(item.price || 0).toLocaleString()})</button>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    }

    DOM.modalFooter.innerHTML = footerHtml;
    modal.classList.add('active');
}

// ============================================
// BUNDLE DETAILS
// ============================================
async function renderBundleDetails(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    const isPurchased = purchasedItems.has(item.id);
    const isSaved = savedItems.has(item.id);

    // Reset modal style
    const modal = DOM.itemModal;
    const modalContent = modal.querySelector('.modal-content');
    modalContent.classList.remove('book-modal');

    DOM.modalTitle.textContent = item.title;
    DOM.modalImage.src = item.cover_url || `https://placehold.co/300x450/2c2f78/white?text=${encodeURIComponent(item.title)}`;
    DOM.modalImage.style.display = 'block';

    updateSaveButton(item.id, isSaved);

    let detailsHtml = `
        <div class="item-details">
            <p><strong>Author:</strong> ${escape(item.author || 'Gliimu Team')}</p>
            <p><strong>Type:</strong> 📦 Bundle</p>
            <p><strong>Includes:</strong> ${item.includes || 'Multiple resources'}</p>
            ${isPurchased ? `<p><span class="owned-badge">✅ You own this</span></p>` : ''}
            ${item.price > 0 ? `<p><strong>Price:</strong> ₦${(item.price || 0).toLocaleString()}</p>` : '<p><strong>Price:</strong> Free</p>'}
            
            <div class="description-text">${escape(item.description || 'No description available.')}</div>
        </div>
    `;

    DOM.modalDesc.innerHTML = detailsHtml;

    let footerHtml = '';
    if (isPurchased) {
        footerHtml = `
            ${item.download_url ? `<button class="modal-btn modal-btn-primary" onclick="window.downloadBundle('${item.id}')"><i class="fas fa-download"></i> Download Bundle</button>` : ''}
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else if (item.price === 0 || !item.price) {
        footerHtml = `
            <button class="modal-btn modal-btn-success" onclick="window.handleFreeAccess('${item.id}')"><i class="fas fa-gift"></i> Get Bundle</button>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else {
        footerHtml = `
            <button class="modal-btn modal-btn-primary" onclick="window.handlePurchase('${item.id}','bundle')"><i class="fas fa-shopping-cart"></i> Purchase (₦${(item.price || 0).toLocaleString()})</button>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    }

    DOM.modalFooter.innerHTML = footerHtml;
    modal.classList.add('active');
}

// ============================================
// GENERIC DETAILS (Fallback)
// ============================================
async function renderGenericDetails(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    const isPurchased = purchasedItems.has(item.id);
    const isSaved = savedItems.has(item.id);

    // Reset modal style
    const modal = DOM.itemModal;
    const modalContent = modal.querySelector('.modal-content');
    modalContent.classList.remove('book-modal');

    DOM.modalTitle.textContent = item.title;
    DOM.modalImage.src = item.cover_url || `https://placehold.co/300x450/2c2f78/white?text=${encodeURIComponent(item.title)}`;
    DOM.modalImage.style.display = 'block';

    updateSaveButton(item.id, isSaved);

    let detailsHtml = `
        <div class="item-details">
            <p><strong>Type:</strong> ${item.type || 'Resource'}</p>
            ${isPurchased ? `<p><span class="owned-badge">✅ You own this</span></p>` : ''}
            <div class="description-text">${escape(item.description || 'No description available.')}</div>
        </div>
    `;

    DOM.modalDesc.innerHTML = detailsHtml;

    let footerHtml = '';
    if (isPurchased) {
        footerHtml = `
            ${item.file_url ? `<button class="modal-btn modal-btn-primary" onclick="window.open('${item.file_url}','_blank')"><i class="fas fa-eye"></i> View</button>` : ''}
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else if (item.price === 0 || !item.price) {
        footerHtml = `
            <button class="modal-btn modal-btn-success" onclick="window.handleFreeAccess('${item.id}')"><i class="fas fa-gift"></i> Get Access</button>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else {
        footerHtml = `
            <button class="modal-btn modal-btn-primary" onclick="window.handlePurchase('${item.id}','digital')"><i class="fas fa-shopping-cart"></i> Purchase (₦${(item.price || 0).toLocaleString()})</button>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    }

    DOM.modalFooter.innerHTML = footerHtml;
    modal.classList.add('active');
}

// ============================================
// SAVE BUTTON HELPER
// ============================================
function updateSaveButton(itemId, isSaved) {
    const saveBtn = document.getElementById('modalSaveBtn');
    if (saveBtn) {
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.className = `modal-save-btn ${isSaved ? 'saved' : ''}`;
        newSaveBtn.innerHTML = `<i class="fas fa-bookmark"></i>`;
        newSaveBtn.title = isSaved ? 'Remove from saved' : 'Save for later';
        newSaveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSave(itemId);
        });
        document.getElementById('modalSaveBtn');
    }
}

// ============================================
// PURCHASE OPTION SELECTION
// ============================================
window.selectPurchaseOption = (type, price) => {
    // Deselect all
    document.querySelectorAll('.purchase-option-card').forEach(el => el.classList.remove('selected'));
    
    // Select clicked option
    const optionEl = document.querySelector(`.purchase-option-card[data-type="${type}"]`);
    if (optionEl) optionEl.classList.add('selected');

    currentPurchaseState.selectedOption = type;
    
    // Show/hide delivery section for physical
    if (type === 'physical') {
        DOM.deliverySection.classList.add('active');
        document.querySelectorAll('.location-option').forEach(el => el.classList.remove('selected'));
        currentPurchaseState.selectedLocation = null;
        document.getElementById('deliveryDetails').style.display = 'none';
    } else {
        DOM.deliverySection.classList.remove('active');
        currentPurchaseState.selectedLocation = null;
    }

    // Update summary
    const isPremium = userGP >= 100;
    let finalPrice = price;
    if (isPremium && type === 'digital' && price > 0) {
        finalPrice = 0;
    }
    
    DOM.summaryTotal.textContent = `₦${finalPrice.toLocaleString()}`;
    DOM.purchaseSummary.style.display = 'flex';
    DOM.purchaseBtn.disabled = false;
    DOM.purchaseBtn.textContent = type === 'premium' ? '⭐ Get Premium Access' : `Purchase ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    DOM.purchaseBtn.className = `purchase-btn ${type === 'premium' ? 'success' : 'gold'}`;
    
    currentPurchaseState.selectedPrice = finalPrice;
};

// ============================================
// LOCATION SELECTION
// ============================================
window.selectLocation = (type) => {
    document.querySelectorAll('.location-option').forEach(el => el.classList.remove('selected'));
    const locationEl = document.querySelector(`.location-option[data-location="${type}"]`);
    if (locationEl) locationEl.classList.add('selected');

    currentPurchaseState.selectedLocation = type;

    if (type === 'pickup') {
        document.getElementById('deliveryDetails').style.display = 'none';
        DOM.purchaseBtn.disabled = false;
        DOM.purchaseBtn.textContent = 'Confirm Pickup & Purchase';
    } else {
        document.getElementById('deliveryDetails').style.display = 'block';
        DOM.purchaseBtn.disabled = true;
        DOM.purchaseBtn.textContent = 'Please fill in delivery details';
    }
};

window.updateDeliveryCities = () => {
    const region = document.getElementById('deliveryRegion').value;
    const citySelect = document.getElementById('deliveryCity');
    citySelect.innerHTML = '<option value="">Select your city</option>';
    
    if (region) {
        const regionData = DELIVERY_REGIONS.find(r => r.id === region);
        if (regionData) {
            regionData.cities.forEach(city => {
                citySelect.innerHTML += `<option value="${city}">${city}</option>`;
            });
        }
    }
    validateDeliveryForm();
};

function validateDeliveryForm() {
    const region = document.getElementById('deliveryRegion').value;
    const city = document.getElementById('deliveryCity').value;
    const address = document.getElementById('deliveryAddress').value.trim();
    const phone = document.getElementById('deliveryPhone').value.trim();
    
    const isValid = region && city && address && phone && phone.length >= 10;
    
    if (DOM.purchaseBtn) {
        if (isValid) {
            DOM.purchaseBtn.disabled = false;
            DOM.purchaseBtn.textContent = '🚚 Confirm Delivery & Purchase';
        } else {
            DOM.purchaseBtn.disabled = true;
            DOM.purchaseBtn.textContent = 'Please fill in all delivery details';
        }
    }
}

// ============================================
// COMPLETE PURCHASE
// ============================================
document.addEventListener('click', async (e) => {
    if (e.target.id === 'purchaseBtn' || e.target.closest('#purchaseBtn')) {
        await completePurchase();
    }
});

async function completePurchase() {
    const item = allItems.find(i => i.id === currentPurchaseState.itemId);
    if (!item) return showToast('Item not found', 'error');

    const { selectedOption, selectedPrice, selectedLocation } = currentPurchaseState;

    if (!selectedOption) {
        showToast('Please select a purchase option', 'error');
        return;
    }

    // Handle premium access
    if (selectedOption === 'premium') {
        await handleGrantAccess(item.id);
        return;
    }

    // Handle physical with delivery
    if (selectedOption === 'physical') {
        if (!selectedLocation) {
            showToast('Please select pickup or delivery', 'error');
            return;
        }

        if (selectedLocation === 'delivery') {
            const region = document.getElementById('deliveryRegion').value;
            const city = document.getElementById('deliveryCity').value;
            const address = document.getElementById('deliveryAddress').value.trim();
            const phone = document.getElementById('deliveryPhone').value.trim();

            if (!region || !city || !address || !phone) {
                showToast('Please fill in all delivery details', 'error');
                return;
            }

            // Check if we can deliver to this region
            const regionData = DELIVERY_REGIONS.find(r => r.id === region);
            if (!regionData) {
                showToast('We are currently unable to ship to your chosen location', 'error');
                return;
            }

            // Create delivery order
            const deliveryData = {
                item_id: item.id,
                item_title: item.title,
                user_id: currentUser.id,
                user_name: currentUser.name,
                user_email: currentUser.email,
                type: 'physical',
                amount: selectedPrice,
                region: regionData.name,
                city: city,
                address: address,
                phone: phone,
                pickup: false,
                status: 'pending',
                created_at: new Date().toISOString()
            };

            const { error: deliveryError } = await supabase
                .from('delivery_orders')
                .insert([deliveryData]);

            if (deliveryError) {
                console.error('Delivery order error:', deliveryError);
                showToast('Error processing delivery', 'error');
                return;
            }

            await notifyAdmin('delivery_order', deliveryData);
        } else {
            // Pickup at office
            const pickupData = {
                item_id: item.id,
                item_title: item.title,
                user_id: currentUser.id,
                user_name: currentUser.name,
                user_email: currentUser.email,
                type: 'physical',
                amount: selectedPrice,
                pickup: true,
                pickup_location: 'Gliimu Office, Gwarinpa, Abuja',
                status: 'pending',
                created_at: new Date().toISOString()
            };

            const { error: pickupError } = await supabase
                .from('delivery_orders')
                .insert([pickupData]);

            if (pickupError) {
                console.error('Pickup order error:', pickupError);
                showToast('Error processing pickup', 'error');
                return;
            }

            await notifyAdmin('pickup_order', pickupData);
        }

        // Process payment
        await processPayment(item.id, selectedOption, selectedPrice);
        return;
    }

    // Digital or audio purchase
    await processPayment(item.id, selectedOption, selectedPrice);
}

// ============================================
// PROCESS PAYMENT
// ============================================
async function processPayment(itemId, type, price) {
    if (!currentUser) return showToast('Please login', 'error');

    const item = allItems.find(i => i.id === itemId);
    if (!item) return showToast('Item not found', 'error');

    // Check if premium and digital
    const isPremium = userGP >= 100;
    if (isPremium && type === 'digital' && price > 0) {
        price = 0;
    }

    if (price <= 0) {
        await handleFreeAccess(itemId);
        return;
    }

    if (purchasedItems.has(itemId)) {
        showToast('Already owned', 'info');
        closeModal();
        return;
    }

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
        renderItems();
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
}

// ============================================
// PURCHASE FUNCTIONS
// ============================================
window.handlePurchase = async (itemId, type) => {
    if (!currentUser) return showToast('Please login', 'error');

    const item = allItems.find(i => i.id === itemId);
    if (!item) return showToast('Item not found', 'error');

    let price = 0;
    if (type === 'physical') price = item.physical_price || 0;
    else if (type === 'audio') price = item.audio_price || 0;
    else if (type === 'bundle') price = item.price || 0;
    else price = item.price || 0;

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
        renderItems();
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
        renderItems();
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
        showToast(`✅ ${item.type === 'talk' ? 'Watching' : 'Access'} ${item.title}${gp ? ` +${gp} GP` : ''}`, 'success');
        renderItems();
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

// ============================================
// TALK ENGAGEMENT
// ============================================
window.likeTalk = async (itemId) => {
    if (!currentUser) return showToast('Please login', 'error');
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    const likes = (item.likes || 0) + 1;
    await supabase.from('library_items').update({ likes }).eq('id', itemId);
    item.likes = likes;
    showToast('❤️ Liked!', 'success');
    const countEl = document.querySelector('.engagement-btn .count');
    if (countEl) countEl.textContent = likes;
};

window.shareTalk = async (itemId) => {
    const url = `${window.location.origin}/talk/${itemId}`;
    if (navigator.share) {
        try { await navigator.share({ title: 'Check this out!', url }); } catch (e) {}
    } else {
        navigator.clipboard.writeText(url);
        showToast('📋 Link copied to clipboard!', 'success');
    }
    const item = allItems.find(i => i.id === itemId);
    if (item) {
        const shares = (item.shares || 0) + 1;
        await supabase.from('library_items').update({ shares }).eq('id', itemId);
        item.shares = shares;
    }
};

window.commentTalk = (itemId) => {
    showToast('💬 Comments feature coming soon!', 'info');
};

// ============================================
// DOWNLOAD BUNDLE
// ============================================
window.downloadBundle = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    if (!purchasedItems.has(item.id) && item.price > 0) {
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
        renderItems();
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
// NOTIFY ADMIN
// ============================================
async function notifyAdmin(type, data) {
    try {
        const { data: admins, error } = await supabase
            .from('users')
            .select('id, email, name')
            .in('role', ['secretary', 'crm', 'founder']);

        if (error) throw error;

        const notifications = admins.map(admin => ({
            user_id: admin.id,
            type: type,
            title: type === 'delivery_order' ? 'New Delivery Order' : 
                   type === 'pickup_order' ? 'New Pickup Order' : 'New Purchase',
            message: `${data.user_name} purchased "${data.item_title}" (${type === 'physical' ? 'Physical' : 'Digital'})`,
            data: data,
            read: false,
            created_at: new Date().toISOString()
        }));

        await supabase
            .from('admin_notifications')
            .insert(notifications);

        console.log('📧 Admin notified:', notifications.length);
    } catch (e) {
        console.error('Error notifying admin:', e);
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
    const modalContent = DOM.itemModal.querySelector('.modal-content');
    modalContent.classList.remove('book-modal');
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
window.likeTalk = likeTalk;
window.shareTalk = shareTalk;
window.commentTalk = commentTalk;
window.closeModal = closeModal;
window.togglePurchaseDropdown = togglePurchaseDropdown;
window.closeSearchModal = () => {};
window.selectPurchaseOption = selectPurchaseOption;
window.selectLocation = selectLocation;
window.updateDeliveryCities = updateDeliveryCities;

console.log('✅ Hub loaded successfully');
