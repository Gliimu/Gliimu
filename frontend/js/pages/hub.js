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
let currentPurchaseState = {
    itemId: null,
    selectedOption: null,
    selectedLocation: null,
    selectedPrice: 0
};
let currentVideoPlayer = null;

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
    modalBody: $('modalBody'),
    profileBtn: $('profileBtn'),
    dropdown: $('dropdownMenu'),
    savedLink: $('savedItemsLink'),
    purchasedLink: $('purchasedItemsLink'),
    merchLink: $('merchandiseLink'),
    logo: $('logoImg'),
    header: $('hubHeader'),
    loader: $('loaderOverlay'),
    loaderVideo: $('loaderVideo')
};

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Hub initializing...');

    try {
        setTimeout(() => { hideLoader(); }, 2000);

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
        hideLoader();
        showCenteredError(error.message || 'Failed to load content. Please refresh.');
    }
});

// ============================================
// LOADER
// ============================================
function hideLoader() {
    if (DOM.loader) {
        DOM.loader.classList.add('hidden');
        if (DOM.loaderVideo) {
            DOM.loaderVideo.pause();
        }
    }
}

// ============================================
// UI HELPERS
// ============================================
function showCenteredError(message) {
    DOM.grid.innerHTML = `
        <div class="centered-message error">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Something went wrong</h3>
            <p>${escape(message)}</p>
            <button onclick="location.reload()" class="btn-primary">Refresh</button>
        </div>
    `;
}

function showInsufficientFunds(shortfall, currentBalance, required) {
    const modalHtml = `
        <div id="insufficientFundsModal" class="modal" style="display:flex; z-index:2000;">
            <div class="modal-content" style="max-width:400px; text-align:center; padding:2rem;">
                <div style="font-size:3rem; margin-bottom:1rem;">⚠️</div>
                <h2 style="margin-bottom:0.5rem;">Insufficient Funds</h2>
                <p style="color:var(--text-secondary); margin-bottom:0.5rem;">
                    You need <strong style="color:var(--brand-gold);">₦${shortfall}</strong> more to complete this purchase.
                </p>
                <p style="color:var(--text-secondary); margin-bottom:1.5rem; font-size:0.85rem;">
                    Current Balance: <strong>₦${currentBalance.toLocaleString()}</strong><br>
                    Required: <strong>₦${required.toLocaleString()}</strong>
                </p>
                <div style="display:flex; gap:0.75rem; justify-content:center; flex-wrap:wrap;">
                    <button onclick="window.location.href='/dashboard.html?tab=wallet'" 
                            style="padding:0.75rem 2rem; border-radius:40px; border:none; background:var(--brand-gold); color:var(--brand-purple-dark); font-weight:600; cursor:pointer;">
                        💰 Add Funds
                    </button>
                    <button onclick="closeInsufficientFundsModal()" 
                            style="padding:0.75rem 2rem; border-radius:40px; border:1px solid var(--border-color); background:transparent; color:var(--text-primary); cursor:pointer;">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const existing = document.getElementById('insufficientFundsModal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeInsufficientFundsModal() {
    const modal = document.getElementById('insufficientFundsModal');
    if (modal) modal.remove();
}
window.closeInsufficientFundsModal = closeInsufficientFundsModal;

// ============================================
// DATA LOADING
// ============================================
async function loadUserData() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (error) {
            console.error('Error loading user data:', error);
            userWallet = 0;
            userGP = 0;
            return;
        }
        
        userWallet = data?.wallet_balance || 0;
        userGP = data?.gp_points || 0;
        if (data?.avatar_url) {
            currentUser.avatar_url = data.avatar_url;
            updateAvatar();
        }
        console.log('✅ User data loaded:', { wallet: userWallet, gp: userGP });
    } catch (e) {
        console.error('Error loading user data:', e);
        userWallet = 0;
        userGP = 0;
    }
}

async function loadItems() {
    try {
        const { data, error } = await supabase
            .from('hub_contents')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Database error:', error);
            throw error;
        }
        
        if (!data || data.length === 0) {
            DOM.grid.innerHTML = `
                <div class="centered-message">
                    <i class="fas fa-book-open"></i>
                    <h3>No Content Yet</h3>
                    <p>Check back soon for new content.</p>
                </div>
            `;
            return;
        }

        allItems = data;
        console.log(`✅ Loaded ${data.length} items from hub_contents`);
        renderItems();

    } catch (e) {
        console.error('Error loading items:', e);
        showCenteredError(e.message || 'Unable to load content. Please refresh.');
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
            <div class="centered-message">
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
        if (error) {
            console.warn('Could not get GP points:', error);
            return null;
        }

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
        const avatarUrl = currentUser?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name || 'User')}&background=2c2f78&color=fff`;
        DOM.avatar.src = avatarUrl;
        DOM.avatar.alt = currentUser?.name || 'User';
    }
}

// ============================================
// THEME & SCROLL
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
    }
}

// ============================================
// VIEW DETAILS - MAIN ENTRY POINT
// ============================================
window.viewDetails = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return showToast('Item not found', 'error');

    currentModalItemId = itemId;

    const modal = DOM.itemModal;
    const modalContent = modal.querySelector('.modal-content');
    modalContent.classList.remove('book-modal');
    
    DOM.modalFooter.innerHTML = '';
    DOM.modalFooter.style.display = 'flex';
    DOM.modalImage.style.display = 'block';

    cleanupVideoPlayer();

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
// CLEANUP VIDEO PLAYER
// ============================================
function cleanupVideoPlayer() {
    if (currentVideoPlayer) {
        const video = currentVideoPlayer.querySelector('video');
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.load();
        }
        currentVideoPlayer = null;
    }
}

// ============================================
// TALK DETAILS - Social Media Style
// ============================================
async function renderTalkDetails(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    const isPurchased = purchasedItems.has(item.id);
    const isSaved = savedItems.has(item.id);
    const isPremium = userGP >= 100;

    const modal = DOM.itemModal;
    const modalContent = modal.querySelector('.modal-content');
    modalContent.classList.remove('book-modal');

    DOM.modalTitle.textContent = item.title;
    DOM.modalImage.style.display = 'none';
    DOM.modalFooter.style.display = 'none';
    DOM.modalFooter.innerHTML = '';

    updateSaveButton(item.id, isSaved);

    const videoSrc = item.file_url || '/video/pnp.mp4';
    const speakerAvatar = item.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.author || 'Speaker')}&background=2c2f78&color=fff`;
    const timestamp = item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently';

    let detailsHtml = `
        <div class="talk-details">
            <div class="social-header">
                <img src="${speakerAvatar}" alt="${escape(item.author || 'Speaker')}" class="speaker-avatar">
                <div class="speaker-info">
                    <div class="speaker-name">${escape(item.author || 'Gliimu Team')}</div>
                    <div class="speaker-handle">@${escape((item.author || 'gliimu').toLowerCase().replace(/\s/g, ''))}</div>
                </div>
                <span class="talk-timestamp">${timestamp}</span>
            </div>
            
            <div class="badge-row">
                ${isPremium ? '<span class="badge premium">⭐ Premium Access</span>' : ''}
                ${isPurchased ? '<span class="badge owned">✅ You own this</span>' : ''}
            </div>
            
            <div class="talk-title-social">${escape(item.title)}</div>
            <div class="talk-description-social">${escape(item.description || 'No description available.')}</div>
            
            <div class="video-wrapper" id="gliimuVideoPlayer">
                <video id="talkVideo" playsinline poster="${item.cover_url || ''}" preload="metadata">
                    <source src="${videoSrc}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
                
                <div class="video-branding">
                    <span class="brand-icon">📺</span>
                    <span class="brand-text">Gliimu <span style="color:white;">Talks</span></span>
                </div>
                
                <button class="big-play-btn" id="bigPlayBtn">
                    <i class="fas fa-play"></i>
                </button>
                
                <div class="video-loading" id="videoLoading">
                    <div class="spinner"></div>
                </div>
                
                <div class="video-controls" id="videoControls">
                    <div class="controls-row">
                        <button class="ctrl-btn" id="playPauseBtn">
                            <i class="fas fa-play"></i>
                        </button>
                        
                        <div class="progress-container" id="progressContainer">
                            <div class="progress-fill" id="progressFill"></div>
                        </div>
                        
                        <span class="time-display" id="timeDisplay">0:00 / 0:00</span>
                        
                        <button class="ctrl-btn fullscreen-btn" id="fullscreenBtn">
                            <i class="fas fa-expand"></i>
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="social-engagement">
                <button class="social-btn" onclick="window.likeTalkSocial('${item.id}')" id="likeBtn">
                    <i class="far fa-heart"></i> <span class="count" id="likeCount">${item.likes || 0}</span>
                </button>
                <button class="social-btn" onclick="window.shareTalk('${item.id}')">
                    <i class="fas fa-share-alt share-icon"></i> <span class="count">${item.shares || 0}</span>
                </button>
                <button class="social-btn" onclick="window.commentTalk('${item.id}')">
                    <i class="far fa-comment"></i> <span class="count">${item.comments || 0}</span>
                </button>
            </div>
            
            <div class="comments-placeholder">
                <div class="comment-input">
                    <input type="text" placeholder="Write a comment..." id="commentInput">
                    <button onclick="window.postComment('${item.id}')">Post</button>
                </div>
            </div>
        </div>
    `;

    DOM.modalDesc.innerHTML = detailsHtml;

    modal.classList.add('active');

    setTimeout(() => {
        initCustomVideoPlayer();
    }, 150);

    checkIfLiked(item.id);
}

async function checkIfLiked(itemId) {
    if (!currentUser) return;
    try {
        const { data } = await supabase
            .from('user_likes')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('item_id', itemId)
            .single();
        
        if (data) {
            const likeBtn = document.querySelector('#likeBtn');
            if (likeBtn) {
                likeBtn.classList.add('liked');
                likeBtn.querySelector('i').className = 'fas fa-heart';
            }
        }
    } catch (e) {}
}

window.postComment = async (itemId) => {
    if (!currentUser) {
        showToast('Please login to comment', 'error');
        return;
    }
    
    const input = document.getElementById('commentInput');
    if (!input || !input.value.trim()) {
        showToast('Please write a comment', 'error');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('talk_comments')
            .insert({
                item_id: itemId,
                user_id: currentUser.id,
                user_name: currentUser.name,
                content: input.value.trim(),
                created_at: new Date().toISOString()
            });
        
        if (error) throw error;
        
        showToast('💬 Comment posted!', 'success');
        input.value = '';
    } catch (e) {
        console.error('Comment error:', e);
        showToast('Error posting comment', 'error');
    }
};

window.likeTalkSocial = async (itemId) => {
    if (!currentUser) {
        showToast('Please login to like', 'error');
        return;
    }
    
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    const likeBtn = document.querySelector('#likeBtn');
    const countEl = document.querySelector('#likeCount');
    const isLiked = likeBtn?.classList.contains('liked');
    
    try {
        if (isLiked) {
            await supabase
                .from('user_likes')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('item_id', itemId);
            
            const newLikes = Math.max(0, (item.likes || 0) - 1);
            await supabase.from('hub_contents').update({ likes: newLikes }).eq('id', itemId);
            item.likes = newLikes;
            
            if (likeBtn) {
                likeBtn.classList.remove('liked');
                likeBtn.querySelector('i').className = 'far fa-heart';
            }
            if (countEl) countEl.textContent = newLikes;
        } else {
            await supabase
                .from('user_likes')
                .insert({
                    user_id: currentUser.id,
                    item_id: itemId,
                    created_at: new Date().toISOString()
                });
            
            const newLikes = (item.likes || 0) + 1;
            await supabase.from('hub_contents').update({ likes: newLikes }).eq('id', itemId);
            item.likes = newLikes;
            
            if (likeBtn) {
                likeBtn.classList.add('liked');
                likeBtn.querySelector('i').className = 'fas fa-heart';
            }
            if (countEl) countEl.textContent = newLikes;
            
            showToast('❤️ Liked!', 'success');
        }
    } catch (e) {
        console.error('Like error:', e);
        showToast('Error updating like', 'error');
    }
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
        await supabase.from('hub_contents').update({ shares }).eq('id', itemId);
        item.shares = shares;
    }
};

window.commentTalk = (itemId) => {
    const input = document.getElementById('commentInput');
    if (input) {
        input.focus();
    } else {
        showToast('💬 Type your comment above', 'info');
    }
};

// ============================================
// CUSTOM VIDEO PLAYER
// ============================================
function initCustomVideoPlayer() {
    const player = document.getElementById('gliimuVideoPlayer');
    if (!player) return;

    currentVideoPlayer = player;

    const video = player.querySelector('video');
    const playPauseBtn = player.querySelector('#playPauseBtn');
    const bigPlayBtn = player.querySelector('#bigPlayBtn');
    const progressFill = player.querySelector('#progressFill');
    const progressContainer = player.querySelector('#progressContainer');
    const timeDisplay = player.querySelector('#timeDisplay');
    const volumeSlider = player.querySelector('#volumeSlider');
    const volumeBtn = player.querySelector('#volumeBtn');
    const fullscreenBtn = player.querySelector('#fullscreenBtn');
    const controls = player.querySelector('#videoControls');
    const loading = player.querySelector('#videoLoading');

    let controlsTimeout = null;

    function showControls() {
        controls.classList.add('show');
        clearTimeout(controlsTimeout);
        controlsTimeout = setTimeout(() => {
            if (!video.paused) {
                controls.classList.remove('show');
            }
        }, 3000);
    }

    function togglePlay() {
        if (video.paused) {
            video.play().catch(() => {
                showToast('Click play to start video', 'info');
            });
            playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            bigPlayBtn.classList.add('hidden');
            showControls();
        } else {
            video.pause();
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            bigPlayBtn.classList.remove('hidden');
            showControls();
        }
    }

    function updateProgress() {
        if (video.duration) {
            const percent = (video.currentTime / video.duration) * 100;
            progressFill.style.width = percent + '%';
            
            const currentMinutes = Math.floor(video.currentTime / 60);
            const currentSeconds = Math.floor(video.currentTime % 60);
            const totalMinutes = Math.floor(video.duration / 60);
            const totalSeconds = Math.floor(video.duration % 60);
            
            timeDisplay.textContent = 
                `${currentMinutes}:${currentSeconds.toString().padStart(2, '0')} / ${totalMinutes}:${totalSeconds.toString().padStart(2, '0')}`;
        }
    }

    playPauseBtn.addEventListener('click', togglePlay);
    bigPlayBtn.addEventListener('click', togglePlay);
    
    video.addEventListener('click', togglePlay);
    video.addEventListener('play', () => {
        playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        bigPlayBtn.classList.add('hidden');
        showControls();
    });
    video.addEventListener('pause', () => {
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        bigPlayBtn.classList.remove('hidden');
        showControls();
    });
    video.addEventListener('timeupdate', updateProgress);
    video.addEventListener('loadedmetadata', updateProgress);
    video.addEventListener('ended', () => {
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        bigPlayBtn.classList.remove('hidden');
        progressFill.style.width = '100%';
    });
    
    video.addEventListener('waiting', () => {
        loading.classList.add('show');
    });
    video.addEventListener('canplay', () => {
        loading.classList.remove('show');
    });

    progressContainer.addEventListener('click', (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (video.duration) {
            video.currentTime = pos * video.duration;
        }
    });

    volumeSlider.addEventListener('input', () => {
        video.volume = parseFloat(volumeSlider.value);
        updateVolumeIcon();
    });

    function updateVolumeIcon() {
        if (video.volume === 0) {
            volumeBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else if (video.volume < 0.5) {
            volumeBtn.innerHTML = '<i class="fas fa-volume-down"></i>';
        } else {
            volumeBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        }
    }

    volumeBtn.addEventListener('click', () => {
        if (video.volume > 0) {
            video.volume = 0;
            volumeSlider.value = 0;
            volumeBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else {
            video.volume = 1;
            volumeSlider.value = 1;
            updateVolumeIcon();
        }
    });

    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            if (player.requestFullscreen) {
                player.requestFullscreen();
                fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
            }
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        }
    });

    document.addEventListener('keydown', (e) => {
        if (DOM.itemModal.classList.contains('active') && !e.target.closest('input, textarea')) {
            if (e.key === ' ' || e.key === 'k') {
                e.preventDefault();
                togglePlay();
            }
            if (e.key === 'f') {
                fullscreenBtn.click();
            }
            if (e.key === 'm') {
                volumeBtn.click();
            }
        }
    });

    player.addEventListener('mousemove', showControls);
    player.addEventListener('mouseleave', () => {
        if (!video.paused) {
            controls.classList.remove('show');
        }
    });

    showControls();
}

// ============================================
// BOOK DETAILS - WITH FULL PURCHASE FLOW
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
    currentPurchaseState.selectedPrice = 0;

    const modal = DOM.itemModal;
    const modalContent = modal.querySelector('.modal-content');
    modalContent.classList.add('book-modal');

    DOM.modalTitle.textContent = item.title;

    updateSaveButton(item.id, isSaved);

    const firstChapter = item.first_chapter || `Chapter 1: The Beginning

It was a quiet morning when everything changed. The sun rose over the horizon, painting the sky in hues of orange and gold. Little did anyone know that this day would mark the beginning of an extraordinary journey.

Sarah had always dreamed of something more. She spent her days in the small town library, reading stories of adventure and discovery. The worn pages of books were her windows to worlds beyond her own.

"You have to see this," her grandmother had told her years ago. "The world is bigger than you think, and you have a place in it."

Those words echoed in her mind as she stood at the crossroads of her life. The choice was hers to make. The path ahead was uncertain, but one thing was clear: she was ready to take the first step...`;

    const coverUrl = item.cover_url || `https://placehold.co/280x400/2c2f78/white?text=${encodeURIComponent(item.title)}`;
    const hasDigital = (item.price || 0) > 0;
    const hasPhysical = (item.physical_price || 0) > 0;
    const hasAudio = (item.audio_price || 0) > 0;
    const digitalPrice = item.price || 0;
    const physicalPrice = item.physical_price || 0;
    const audioPrice = item.audio_price || 0;

    let detailsHtml = `
        <div class="book-layout">
            <div class="book-cover-wrapper">
                <img src="${coverUrl}" alt="${item.title}" class="book-cover-img">
                ${!isPurchased && hasDigital ? `<div class="book-price-tag">₦${digitalPrice.toLocaleString()}</div>` : ''}
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
                
                <div class="chapter-preview-wide">
                    <div class="chapter-header">
                        <span class="chapter-icon">📖</span>
                        <span class="chapter-label">First Chapter Preview</span>
                    </div>
                    <div class="chapter-content ${isPurchased ? '' : 'chapter-blur'}">
                        ${escape(firstChapter)}
                    </div>
                    ${!isPurchased ? '<div class="chapter-lock">🔒 Continue reading after purchase</div>' : ''}
                </div>
    `;

    // --- PURCHASE OPTIONS ---
    if (!isPurchased) {
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

                    <div class="purchase-summary" id="purchaseSummary" style="display:none;">
                        <span class="summary-label">Total:</span>
                        <span class="summary-total" id="summaryTotal">₦0</span>
                    </div>
                    <button class="purchase-btn gold" id="purchaseBtn" disabled>
                        Select an option to purchase
                    </button>
                </div>
        `;
    } else {
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

    // --- CRITICAL: Bind purchase button click event ---
    if (DOM.purchaseBtn && !isPurchased) {
        // Remove any existing listeners by cloning
        const newBtn = DOM.purchaseBtn.cloneNode(true);
        DOM.purchaseBtn.parentNode.replaceChild(newBtn, DOM.purchaseBtn);
        DOM.purchaseBtn = newBtn;
        
        DOM.purchaseBtn.addEventListener('click', async function() {
            console.log('Purchase button clicked!');
            await completePurchase();
        });
    }

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

    const modal = DOM.itemModal;
    const modalContent = modal.querySelector('.modal-content');
    modalContent.classList.remove('book-modal');

    DOM.modalTitle.textContent = item.title;
    DOM.modalImage.src = item.cover_url || `https://placehold.co/300x450/2c2f78/white?text=${encodeURIComponent(item.title)}`;
    DOM.modalImage.style.display = 'block';

    const headerActions = document.querySelector('.modal-header-actions');
    if (headerActions) {
        const existingDownloadIcon = headerActions.querySelector('.bundle-download-icon');
        if (existingDownloadIcon) {
            existingDownloadIcon.remove();
        }
    }

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
            <button class="modal-btn modal-btn-primary" onclick="window.downloadBundle('${item.id}')" style="width:100%; justify-content:center;">
                <i class="fas fa-download"></i> Download Bundle
            </button>
        `;
    } else if (item.price === 0 || !item.price) {
        footerHtml = `
            <button class="modal-btn modal-btn-success" onclick="window.handleFreeAccess('${item.id}')" style="width:100%; justify-content:center;">
                <i class="fas fa-gift"></i> Download Bundle
            </button>
        `;
    } else {
        footerHtml = `
            <button class="modal-btn modal-btn-primary" onclick="window.handlePurchase('${item.id}','bundle')" style="width:100%; justify-content:center;">
                <i class="fas fa-shopping-cart"></i> Purchase (₦${(item.price || 0).toLocaleString()})
            </button>
        `;
    }

    DOM.modalFooter.innerHTML = footerHtml;
    DOM.modalFooter.style.display = 'flex';
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
        `;
    } else if (item.price === 0 || !item.price) {
        footerHtml = `
            <button class="modal-btn modal-btn-success" onclick="window.handleFreeAccess('${item.id}')"><i class="fas fa-gift"></i> Get Access</button>
        `;
    } else {
        footerHtml = `
            <button class="modal-btn modal-btn-primary" onclick="window.handlePurchase('${item.id}','digital')"><i class="fas fa-shopping-cart"></i> Purchase (₦${(item.price || 0).toLocaleString()})</button>
        `;
    }

    DOM.modalFooter.innerHTML = footerHtml;
    DOM.modalFooter.style.display = 'flex';
    modal.classList.add('active');
}

// ============================================
// PURCHASE OPTION SELECTION
// ============================================
window.selectPurchaseOption = (type, price) => {
    document.querySelectorAll('.purchase-option-card').forEach(el => el.classList.remove('selected'));
    
    const optionEl = document.querySelector(`.purchase-option-card[data-type="${type}"]`);
    if (optionEl) optionEl.classList.add('selected');

    currentPurchaseState.selectedOption = type;
    currentPurchaseState.selectedPrice = price;
    
    if (type === 'physical') {
        const deliverySection = document.getElementById('deliverySection');
        if (deliverySection) deliverySection.classList.add('active');
        document.querySelectorAll('.location-option').forEach(el => el.classList.remove('selected'));
        currentPurchaseState.selectedLocation = null;
        document.getElementById('deliveryDetails').style.display = 'none';
    } else {
        const deliverySection = document.getElementById('deliverySection');
        if (deliverySection) deliverySection.classList.remove('active');
        currentPurchaseState.selectedLocation = null;
    }

    const isPremium = userGP >= 100;
    let finalPrice = price;
    if (isPremium && type === 'digital' && price > 0) {
        finalPrice = 0;
    }
    
    const summaryTotal = document.getElementById('summaryTotal');
    const purchaseSummary = document.getElementById('purchaseSummary');
    const purchaseBtn = document.getElementById('purchaseBtn');
    
    if (summaryTotal) summaryTotal.textContent = `₦${finalPrice.toLocaleString()}`;
    if (purchaseSummary) purchaseSummary.style.display = 'flex';
    if (purchaseBtn) {
        purchaseBtn.disabled = false;
        purchaseBtn.textContent = type === 'premium' ? '⭐ Get Premium Access' : `Purchase ${type.charAt(0).toUpperCase() + type.slice(1)}`;
        purchaseBtn.className = `purchase-btn ${type === 'premium' ? 'success' : 'gold'}`;
    }
    
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

    const deliveryDetails = document.getElementById('deliveryDetails');
    const purchaseBtn = document.getElementById('purchaseBtn');

    if (type === 'pickup') {
        if (deliveryDetails) deliveryDetails.style.display = 'none';
        if (purchaseBtn) {
            purchaseBtn.disabled = false;
            purchaseBtn.textContent = 'Confirm Pickup & Purchase';
        }
    } else {
        if (deliveryDetails) deliveryDetails.style.display = 'block';
        if (purchaseBtn) {
            purchaseBtn.disabled = true;
            purchaseBtn.textContent = 'Please fill in delivery details';
        }
    }
};

window.updateDeliveryCities = () => {
    const region = document.getElementById('deliveryRegion').value;
    const citySelect = document.getElementById('deliveryCity');
    if (!citySelect) return;
    
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
    const region = document.getElementById('deliveryRegion');
    const city = document.getElementById('deliveryCity');
    const address = document.getElementById('deliveryAddress');
    const phone = document.getElementById('deliveryPhone');
    const purchaseBtn = document.getElementById('purchaseBtn');
    
    if (!region || !city || !address || !phone || !purchaseBtn) return;
    
    const isValid = region.value && city.value && address.value.trim() && phone.value.trim() && phone.value.trim().length >= 10;
    
    if (isValid) {
        purchaseBtn.disabled = false;
        purchaseBtn.textContent = '🚚 Confirm Delivery & Purchase';
    } else {
        purchaseBtn.disabled = true;
        purchaseBtn.textContent = 'Please fill in all delivery details';
    }
}

document.addEventListener('change', (e) => {
    if (e.target.id === 'deliveryRegion' || e.target.id === 'deliveryCity' || 
        e.target.id === 'deliveryAddress' || e.target.id === 'deliveryPhone') {
        validateDeliveryForm();
    }
});

document.addEventListener('input', (e) => {
    if (e.target.id === 'deliveryAddress' || e.target.id === 'deliveryPhone') {
        validateDeliveryForm();
    }
});

// ============================================
// COMPLETE PURCHASE - FIXED
// ============================================
async function completePurchase() {
    console.log('🛒 completePurchase called');
    
    const item = allItems.find(i => i.id === currentPurchaseState.itemId);
    if (!item) {
        showToast('Item not found', 'error');
        return;
    }

    const { selectedOption, selectedPrice, selectedLocation } = currentPurchaseState;

    console.log('Purchase state:', { selectedOption, selectedPrice, selectedLocation, item: item.title });

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
            const region = document.getElementById('deliveryRegion');
            const city = document.getElementById('deliveryCity');
            const address = document.getElementById('deliveryAddress');
            const phone = document.getElementById('deliveryPhone');

            if (!region.value || !city.value || !address.value.trim() || !phone.value.trim()) {
                showToast('Please fill in all delivery details', 'error');
                return;
            }

            const regionData = DELIVERY_REGIONS.find(r => r.id === region.value);
            if (!regionData) {
                showToast('We are currently unable to ship to your chosen location', 'error');
                return;
            }

            const deliveryData = {
                item_id: item.id,
                item_title: item.title,
                user_id: currentUser.id,
                user_name: currentUser.name,
                user_email: currentUser.email,
                type: 'physical',
                amount: selectedPrice,
                region: regionData.name,
                city: city.value,
                address: address.value.trim(),
                phone: phone.value.trim(),
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

        await processPayment(item.id, selectedOption, selectedPrice);
        return;
    }

    // Digital or audio purchase
    await processPayment(item.id, selectedOption, selectedPrice);
}

// ============================================
// PROCESS PAYMENT - FIXED
// ============================================
async function processPayment(itemId, type, price) {
    console.log('💰 processPayment called:', { itemId, type, price });
    
    if (!currentUser) {
        showToast('Please login to purchase', 'error');
        return;
    }

    const item = allItems.find(i => i.id === itemId);
    if (!item) {
        showToast('Item not found', 'error');
        return;
    }

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
        // Get user's wallet balance
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
        console.log('Current wallet balance:', currentBalance, 'Price:', price);

        // --- WALLET CHECK ---
        if (currentBalance < price) {
            const shortfall = (price - currentBalance).toLocaleString();
            console.log('Insufficient funds. Shortfall:', shortfall);
            showInsufficientFunds(shortfall, currentBalance, price);
            return;
        }

        // Process payment - deduct from wallet
        const newBalance = currentBalance - price;
        console.log('New balance:', newBalance);
        
        const { error: updateError } = await supabase
            .from('users')
            .update({ wallet_balance: newBalance })
            .eq('id', currentUser.id);

        if (updateError) {
            console.error('Payment error:', updateError);
            showToast('Payment failed. Please try again.', 'error');
            return;
        }

        // --- FIXED: Record purchase with correct columns ---
        const purchaseData = {
            user_id: currentUser.id,
            item_id: itemId,
            purchase_type: type,
            amount: price,
            created_at: new Date().toISOString()
        };
        
        console.log('Inserting purchase:', purchaseData);

        const { data: purchaseResult, error: purchaseError } = await supabase
            .from('user_purchases')
            .insert([purchaseData])
            .select();

        if (purchaseError) {
            console.error('Purchase record error:', purchaseError);
            
            // Refund the user if purchase recording fails
            await supabase
                .from('users')
                .update({ wallet_balance: currentBalance })
                .eq('id', currentUser.id);
                
            showToast(`Purchase failed: ${purchaseError.message}`, 'error');
            return;
        }

        console.log('Purchase recorded successfully:', purchaseResult);

        purchasedItems.add(itemId);
        const gp = await addGP(item.type === 'bundle' ? 10 : 5, `Purchased: ${item.title}`);

        showToast(`✅ Purchased ${item.title}${gp ? ` +${gp} GP` : ''}`, 'success');
        
        // Update wallet display
        userWallet = newBalance;
        
        renderItems();
        closeModal();

        // Open content if digital
        if (type === 'digital' && item.file_url) {
            setTimeout(() => {
                if (confirm(`Open "${item.title}" now?`)) {
                    window.open(item.file_url, '_blank');
                }
            }, 800);
        }
    } catch (e) {
        console.error('Purchase error:', e);
        showToast('Purchase failed', 'error');
    }
}

// ============================================
// PURCHASE FUNCTIONS - COMPLETE & ROBUST
// ============================================

window.handlePurchase = async (itemId, type) => {
    console.log('🛒 handlePurchase called:', { itemId, type });
    
    if (!currentUser) {
        showToast('Please login to purchase', 'error');
        window.location.href = '/signin.html';
        return;
    }

    const item = allItems.find(i => i.id === itemId);
    if (!item) {
        showToast('Item not found', 'error');
        return;
    }

    // Determine price based on type
    let price = 0;
    if (type === 'physical') price = item.physical_price || 0;
    else if (type === 'audio') price = item.audio_price || 0;
    else if (type === 'bundle') price = item.price || 0;
    else price = item.price || 0;

    console.log('Price determined:', price);

    // Free item - handle free access
    if (price <= 0) {
        await handleFreeAccess(itemId);
        return;
    }
    
    // Check if already purchased
    if (purchasedItems.has(itemId)) {
        showToast('You already own this item!', 'info');
        return;
    }

    try {
        // Get current wallet balance
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('wallet_balance')
            .eq('id', currentUser.id)
            .single();

        if (userError) {
            console.error('Wallet fetch error:', userError);
            showToast('Error checking wallet balance', 'error');
            return;
        }

        const currentBalance = user?.wallet_balance || 0;
        console.log('Current balance:', currentBalance, 'Price:', price);

        // Check if user has sufficient funds
        if (currentBalance < price) {
            const shortfall = (price - currentBalance).toLocaleString();
            showToast(`Need ₦${shortfall} more to purchase this item.`, 'error');
            showInsufficientFunds(shortfall, currentBalance, price);
            return;
        }

        // Process payment - deduct from wallet
        const newBalance = currentBalance - price;
        const { error: updateError } = await supabase
            .from('users')
            .update({ wallet_balance: newBalance })
            .eq('id', currentUser.id);

        if (updateError) {
            console.error('Wallet update error:', updateError);
            showToast('Payment failed. Please try again.', 'error');
            return;
        }

        // Record the purchase
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
            // Refund the user
            await supabase
                .from('users')
                .update({ wallet_balance: currentBalance })
                .eq('id', currentUser.id);
            showToast(`Purchase failed: ${purchaseError.message}`, 'error');
            return;
        }

        // Add to purchased items
        purchasedItems.add(itemId);
        
        // Award GP
        const gpReward = item.type === 'bundle' ? 10 : 5;
        const gp = await addGP(gpReward, `Purchased: ${item.title}`);

        // Update local wallet
        userWallet = newBalance;

        showToast(`✅ Successfully purchased "${item.title}"${gp ? ` +${gp} GP` : ''}`, 'success');
        
        // Refresh UI
        renderItems();
        closeModal();

        // Open digital content if available
        if (type === 'digital' && item.file_url) {
            setTimeout(() => {
                if (confirm(`Would you like to open "${item.title}" now?`)) {
                    window.open(item.file_url, '_blank');
                }
            }, 800);
        }
        
    } catch (e) {
        console.error('Purchase error:', e);
        showToast('Purchase failed. Please try again.', 'error');
    }
};

// ============================================
// GRANT PREMIUM ACCESS
// ============================================
window.handleGrantAccess = async (itemId) => {
    console.log('⭐ handleGrantAccess called:', { itemId });
    
    if (!currentUser) {
        showToast('Please login to access this feature', 'error');
        window.location.href = '/signin.html';
        return;
    }

    const item = allItems.find(i => i.id === itemId);
    if (!item) {
        showToast('Item not found', 'error');
        return;
    }

    // Check if user has premium status (100+ GP)
    const isPremium = userGP >= 100;
    if (!isPremium) {
        showToast('You need 100 GP to unlock premium access.', 'error');
        return;
    }

    // Check if already purchased
    if (purchasedItems.has(itemId)) {
        showToast('You already own this item!', 'info');
        return;
    }

    try {
        // Record premium purchase
        const purchaseData = {
            user_id: currentUser.id,
            item_id: itemId,
            purchase_type: 'premium',
            amount: 0,
            created_at: new Date().toISOString()
        };

        const { error: purchaseError } = await supabase
            .from('user_purchases')
            .insert([purchaseData]);

        if (purchaseError) {
            console.error('Premium purchase error:', purchaseError);
            showToast('Error granting premium access', 'error');
            return;
        }

        purchasedItems.add(itemId);
        showToast(`✅ Premium access granted for "${item.title}"!`, 'success');
        
        renderItems();
        closeModal();
        
        if (item.file_url) {
            setTimeout(() => {
                if (confirm(`Would you like to open "${item.title}" now?`)) {
                    window.open(item.file_url, '_blank');
                }
            }, 800);
        }
        
    } catch (e) {
        console.error('Grant access error:', e);
        showToast('Error granting access', 'error');
    }
};

// ============================================
// HANDLE FREE ACCESS
// ============================================
window.handleFreeAccess = async (itemId) => {
    console.log('🎁 handleFreeAccess called:', { itemId });
    
    if (!currentUser) {
        showToast('Please login to access this feature', 'error');
        window.location.href = '/signin.html';
        return;
    }

    const item = allItems.find(i => i.id === itemId);
    if (!item) {
        showToast('Item not found', 'error');
        return;
    }

    // Check if already purchased
    if (purchasedItems.has(itemId)) {
        showToast('You already have access to this item!', 'info');
        return;
    }

    try {
        // Record free purchase
        const purchaseData = {
            user_id: currentUser.id,
            item_id: itemId,
            purchase_type: 'free',
            amount: 0,
            created_at: new Date().toISOString()
        };

        const { error: purchaseError } = await supabase
            .from('user_purchases')
            .insert([purchaseData]);

        if (purchaseError) {
            console.error('Free access error:', purchaseError);
            showToast('Error granting access', 'error');
            return;
        }

        purchasedItems.add(itemId);
        
        // Award 1 GP for taking action
        const gp = await addGP(1, `Accessed free item: ${item.title}`);

        const actionType = item.type === 'talk' ? 'Watching' : 'Access';
        showToast(`✅ ${actionType} "${item.title}" granted${gp ? ` +${gp} GP` : ''}`, 'success');
        
        renderItems();
        closeModal();
        
        if (item.file_url) {
            setTimeout(() => {
                if (confirm(`Would you like to open "${item.title}" now?`)) {
                    window.open(item.file_url, '_blank');
                }
            }, 800);
        }
        
    } catch (e) {
        console.error('Free access error:', e);
        showToast('Error granting access', 'error');
    }
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
            message: `${data.user_name} purchased "${data.item_title}"`,
            data: data,
            read: false,
            created_at: new Date().toISOString()
        }));

        await supabase
            .from('admin_notifications')
            .insert(notifications);

        console.log('📧 Admin notified');
    } catch (e) {
        console.error('Error notifying admin:', e);
    }
}

// ============================================
// MODAL CONTROLS
// ============================================
window.closeModal = () => {
    DOM.itemModal.classList.remove('active');
    document.querySelectorAll('.dropdown-options').forEach(d => d.classList.remove('show'));
    const modalContent = DOM.itemModal.querySelector('.modal-content');
    if (modalContent) modalContent.classList.remove('book-modal');
    if (DOM.modalFooter) {
        DOM.modalFooter.innerHTML = '';
        DOM.modalFooter.style.display = 'flex';
    }
    if (DOM.modalImage) {
        DOM.modalImage.style.display = 'block';
    }
    const headerActions = document.querySelector('.modal-header-actions');
    if (headerActions) {
        const downloadIcon = headerActions.querySelector('.bundle-download-icon');
        if (downloadIcon) {
            downloadIcon.remove();
        }
    }
    cleanupVideoPlayer();
    closeInsufficientFundsModal();
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
window.likeTalkSocial = likeTalkSocial;
window.shareTalk = shareTalk;
window.commentTalk = commentTalk;
window.postComment = postComment;
window.closeModal = closeModal;
window.togglePurchaseDropdown = () => {};
window.closeSearchModal = () => {};
window.selectPurchaseOption = selectPurchaseOption;
window.selectLocation = selectLocation;
window.updateDeliveryCities = updateDeliveryCities;
window.closeInsufficientFundsModal = closeInsufficientFundsModal;

console.log('✅ Hub loaded successfully');
