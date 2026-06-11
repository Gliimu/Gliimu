// ============================================
// DIGITAL LIBRARY - GLIIMU
// Fetches and displays library items from Supabase
// ============================================

import { supabase, getCurrentUser, getUserProfile } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// Global variables
let currentUser = null;
let allItems = [];
let currentFilter = 'all';
let currentSearch = '';
let savedItems = new Set();
let isLoading = false;

// Categories for filter chips (based on actual categories in database)
const CATEGORIES = [
    { id: 'all', name: 'All', icon: '📚' },
    { id: 'Video Production', name: 'Video Production', icon: '🎬' },
    { id: 'Motion Graphics', name: 'Motion Graphics', icon: '✨' },
    { id: 'Design', name: 'Design', icon: '🎨' },
    { id: 'Development', name: 'Development', icon: '💻' },
    { id: 'Animation', name: 'Animation', icon: '🎮' },
    { id: 'Bundle', name: 'Bundles', icon: '📦' }
];

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Digital Library initializing...');
    
    const container = document.getElementById('booksContainer');
    if (container) {
        container.innerHTML = '<div class="loading">Loading library materials...</div>';
    }
    
    try {
        // Get current user
        currentUser = await getCurrentUser();
        console.log('Current user:', currentUser?.email || 'Guest');
        
        // Load library items from Supabase
        await loadLibraryItems();
        
        // Load saved items if user is logged in
        if (currentUser) {
            await loadSavedItems();
        }
        
        // Setup event listeners
        setupEventListeners();
        
        // Setup theme toggle
        setupThemeToggle();
        
    } catch (error) {
        console.error('Initialization error:', error);
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Failed to Load Library</h3>
                    <p>Please refresh the page to try again.</p>
                </div>
            `;
        }
    }
});

// ============================================
// LOAD LIBRARY ITEMS FROM SUPABASE
// ============================================

async function loadLibraryItems() {
    const container = document.getElementById('booksContainer');
    if (!container) return;
    
    if (isLoading) return;
    isLoading = true;
    
    console.log('Fetching library items from Supabase...');
    
    try {
        const { data: items, error } = await supabase
            .from('library_items')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Database error:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-database"></i>
                    <h3>Database Error</h3>
                    <p>${error.message}</p>
                </div>
            `;
            return;
        }
        
        if (!items || items.length === 0) {
            console.warn('No items found in library_items table');
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-open"></i>
                    <h3>No Materials Found</h3>
                    <p>The library is being populated with content.</p>
                </div>
            `;
            return;
        }
        
        console.log(`✅ Successfully loaded ${items.length} library items`);
        allItems = items;
        
        // Render filters and items
        renderFilters();
        renderItems();
        
    } catch (error) {
        console.error('Exception loading library items:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error Loading Content</h3>
                <p>${error.message || 'Unknown error occurred'}</p>
            </div>
        `;
    } finally {
        isLoading = false;
    }
}

// ============================================
// LOAD SAVED ITEMS FROM USER LIBRARY
// ============================================

async function loadSavedItems() {
    if (!currentUser) return;
    
    try {
        const { data, error } = await supabase
            .from('user_library_progress')
            .select('item_id')
            .eq('user_id', currentUser.id);
        
        if (!error && data) {
            savedItems = new Set(data.map(item => item.item_id));
            console.log(`Loaded ${savedItems.size} saved items`);
        }
    } catch (error) {
        console.error('Error loading saved items:', error);
    }
}

// ============================================
// RENDER FILTER CHIPS
// ============================================

function renderFilters() {
    const filterContainer = document.getElementById('filterChips');
    if (!filterContainer) return;
    
    filterContainer.innerHTML = CATEGORIES.map(cat => `
        <button class="filter-chip ${currentFilter === cat.id ? 'active' : ''}" data-filter="${cat.id}">
            ${cat.icon} ${cat.name}
        </button>
    `).join('');
    
    // Add event listeners to filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentFilter = chip.dataset.filter;
            renderItems();
        });
    });
}

// ============================================
// RENDER ITEMS IN MASONRY GRID
// ============================================

function renderItems() {
    const container = document.getElementById('booksContainer');
    if (!container) return;
    
    console.log('Rendering items. Total items:', allItems.length);
    
    let filtered = [...allItems];
    
    // Apply category filter
    if (currentFilter !== 'all') {
        filtered = filtered.filter(item => item.category === currentFilter);
        console.log(`Filtered by category "${currentFilter}": ${filtered.length} items`);
    }
    
    // Apply search
    if (currentSearch) {
        const searchLower = currentSearch.toLowerCase();
        filtered = filtered.filter(item => 
            (item.title && item.title.toLowerCase().includes(searchLower)) ||
            (item.description && item.description.toLowerCase().includes(searchLower)) ||
            (item.author && item.author.toLowerCase().includes(searchLower))
        );
        console.log(`Filtered by search "${currentSearch}": ${filtered.length} items`);
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>No matching items found</h3>
                <p>Try a different search term or category</p>
            </div>
        `;
        return;
    }
    
    // Generate HTML for each item
    container.innerHTML = filtered.map(item => createItemCard(item)).join('');
    console.log(`Rendered ${filtered.length} items`);
}

// ============================================
// CREATE ITEM CARD (Book or Bundle)
// ============================================

function createItemCard(item) {
    const isSaved = savedItems.has(item.id);
    const isBundle = item.type === 'bundle';
    
    // Default cover image if none provided
    let coverUrl = item.cover_url;
    if (!coverUrl || coverUrl === 'null' || coverUrl === '') {
        coverUrl = `https://placehold.co/300x450/2c2f78/white?text=${encodeURIComponent(item.title || 'Book')}`;
    }
    
    if (isBundle) {
        return `
            <div class="grid-item item-bundle" data-id="${item.id}" onclick="window.viewItemDetails && window.viewItemDetails('${item.id}')">
                <div class="bundle-content">
                    <div class="bundle-title">${escapeHtml(item.title)}</div>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                        ${escapeHtml(item.author || 'Gliimu Team')}
                    </div>
                    <div style="font-size: 10px; color: var(--accent); margin-top: 4px;">
                        ${item.level || 'Beginner'} • ${item.requires_subscription || 'Free'}
                    </div>
                </div>
                <button class="bundle-download-btn" onclick="event.stopPropagation(); window.downloadBundle && window.downloadBundle('${item.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 3v12m0 0-3-3m3 3 3-3M5 21h14"/>
                    </svg>
                </button>
            </div>
        `;
    }
    
    // Book/Resource card - Portrait style
    return `
        <div class="grid-item item-book" data-id="${item.id}" onclick="window.viewItemDetails && window.viewItemDetails('${item.id}')">
            <div class="card-cover" style="background-image: url('${coverUrl}')">
                ${isSaved ? '<div class="saved-badge">★ Saved</div>' : ''}
                <div class="card-info-overlay">
                    <div class="card-title">${escapeHtml(item.title)}</div>
                    <div class="card-author">${escapeHtml(item.author || 'Gliimu Team')}</div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// VIEW ITEM DETAILS MODAL
// ============================================

window.viewItemDetails = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) {
        console.error('Item not found:', itemId);
        return;
    }
    
    const isSaved = savedItems.has(item.id);
    const canAccess = await checkAccess(item.requires_subscription);
    
    const modal = document.getElementById('itemModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalImage = document.getElementById('modalImage');
    const modalDescription = document.getElementById('modalDescription');
    const modalFooter = document.getElementById('modalFooter');
    
    if (!modal) {
        console.error('Modal element not found');
        return;
    }
    
    let coverUrl = item.cover_url;
    if (!coverUrl || coverUrl === 'null' || coverUrl === '') {
        coverUrl = `https://placehold.co/300x450/2c2f78/white?text=${encodeURIComponent(item.title || 'Book')}`;
    }
    
    modalTitle.textContent = item.title;
    modalImage.src = coverUrl;
    modalDescription.innerHTML = `
        <strong>Author:</strong> ${escapeHtml(item.author || 'Gliimu Team')}<br>
        <strong>Type:</strong> ${item.type || 'Book'} | <strong>Level:</strong> ${item.level || 'Beginner'}<br>
        <strong>Access:</strong> ${item.requires_subscription || 'Free'}<br>
        <strong>Pages:</strong> ${item.pages || 'N/A'}<br><br>
        ${escapeHtml(item.description || 'No description available.')}
    `;
    
    let footerHtml = '';
    
    if (!canAccess && item.requires_subscription !== 'free') {
        footerHtml = `
            <button class="modal-btn modal-btn-secondary" onclick="closeModal(); window.location.href='/dashboard.html?tab=wallet'">
                Upgrade to ${item.requires_subscription}
            </button>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else {
        footerHtml = `
            <button class="modal-btn modal-btn-secondary" onclick="toggleSaveItem('${item.id}')">
                ${isSaved ? 'Remove from Library' : 'Save to Library'}
            </button>
            <button class="modal-btn modal-btn-primary" onclick="startReading('${item.id}')">
                ${item.type === 'bundle' ? 'Download Bundle' : 'Start Reading'}
            </button>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    }
    
    modalFooter.innerHTML = footerHtml;
    modal.classList.add('active');
    
    // Track view
    if (currentUser) {
        await trackView(item.id);
    }
};

// ============================================
// CHECK ACCESS BASED ON SUBSCRIPTION
// ============================================

async function checkAccess(requiredSubscription) {
    if (!requiredSubscription || requiredSubscription === 'free') return true;
    if (!currentUser) return false;
    
    try {
        const profile = await getUserProfile();
        const userPlan = profile?.plan || profile?.subscription_plan || 'free';
        
        if (requiredSubscription === 'basic') {
            return ['basic', 'standard', 'premium'].includes(userPlan);
        }
        if (requiredSubscription === 'standard') {
            return ['standard', 'premium'].includes(userPlan);
        }
        if (requiredSubscription === 'premium') {
            return userPlan === 'premium';
        }
    } catch (error) {
        console.error('Error checking access:', error);
    }
    return false;
}

// ============================================
// SAVE/UNSAVE ITEM TO LIBRARY
// ============================================

window.toggleSaveItem = async (itemId) => {
    if (!currentUser) {
        showToast('Please login to save items', 'info');
        return;
    }
    
    const isSaved = savedItems.has(itemId);
    
    if (isSaved) {
        const { error } = await supabase
            .from('user_library_progress')
            .delete()
            .eq('user_id', currentUser.id)
            .eq('item_id', itemId);
        
        if (!error) {
            savedItems.delete(itemId);
            showToast('Removed from your library', 'info');
            renderItems();
            closeModal();
        } else {
            showToast('Error removing item', 'error');
        }
    } else {
        const { error } = await supabase
            .from('user_library_progress')
            .insert({
                user_id: currentUser.id,
                item_id: itemId,
                progress: 0,
                completed: false,
                created_at: new Date().toISOString()
            });
        
        if (!error) {
            savedItems.add(itemId);
            showToast('Saved to your library!', 'success');
            renderItems();
            closeModal();
        } else {
            showToast('Error saving item', 'error');
        }
    }
};

// ============================================
// START READING / DOWNLOAD
// ============================================

window.startReading = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    
    showToast(`Opening ${item.title}. Enjoy!`, 'success');
    closeModal();
};

window.downloadBundle = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    
    showToast(`Preparing ${item.title} for download...`, 'info');
    closeModal();
};

// ============================================
// TRACK USER VIEWS
// ============================================

async function trackView(itemId) {
    if (!currentUser) return;
    
    try {
        const { data: existing } = await supabase
            .from('user_library_progress')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('item_id', itemId)
            .single();
        
        if (existing) {
            await supabase
                .from('user_library_progress')
                .update({ last_viewed: new Date().toISOString() })
                .eq('id', existing.id);
        }
    } catch (error) {
        // Ignore - item not in progress yet
    }
}

// ============================================
// SEARCH FUNCTIONALITY
// ============================================

function performSearch() {
    const searchInput = document.getElementById('searchInput');
    currentSearch = searchInput?.value || '';
    renderItems();
}

// ============================================
// THEME TOGGLE
// ============================================

function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }
    
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    });
}

// ============================================
// MODAL FUNCTIONS
// ============================================

window.closeModal = () => {
    const modal = document.getElementById('itemModal');
    if (modal) modal.classList.remove('active');
};

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', performSearch);
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
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
    }
    
    const downloadBtn = document.getElementById('downloadAppBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            showToast('App download will be available soon!', 'info');
        });
    }
    
    const backArrow = document.querySelector('.back-arrow');
    if (backArrow) {
        backArrow.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/dashboard.html';
        });
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make functions global
window.performSearch = performSearch;
window.closeModal = closeModal;
window.toggleSaveItem = window.toggleSaveItem;
window.startReading = window.startReading;
window.downloadBundle = window.downloadBundle;
window.viewItemDetails = window.viewItemDetails;

console.log('Library.js loaded successfully');
