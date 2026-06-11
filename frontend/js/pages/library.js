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

// Categories for filter chips
const CATEGORIES = [
    { id: 'all', name: 'All', icon: '📚' },
    { id: 'Video Production', name: 'Video', icon: '🎬' },
    { id: 'Motion Graphics', name: 'Motion', icon: '✨' },
    { id: 'Design', name: 'Design', icon: '🎨' },
    { id: 'Development', name: 'Dev', icon: '💻' },
    { id: 'Animation', name: 'Animation', icon: '🎮' },
    { id: 'Bundle', name: 'Bundles', icon: '📦' }
];

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Digital Library initializing...');
    
    // Get current user
    currentUser = await getCurrentUser();
    console.log('Current user:', currentUser?.email || 'Guest');
    
    // Load saved items if user is logged in
    if (currentUser) {
        await loadSavedItems();
    }
    
    // Load library items from Supabase
    await loadLibraryItems();
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup theme toggle
    setupThemeToggle();
});

// ============================================
// LOAD LIBRARY ITEMS FROM SUPABASE
// ============================================

async function loadLibraryItems() {
    const container = document.getElementById('booksContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading library materials...</div>';
    
    try {
        const { data: items, error } = await supabase
            .from('library_items')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-open"></i>
                    <h3>No materials found</h3>
                    <p>Check back soon for new content!</p>
                </div>
            `;
            return;
        }
        
        allItems = items;
        renderFilters();
        renderItems();
        
    } catch (error) {
        console.error('Error loading library items:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error loading content</h3>
                <p>Please refresh the page to try again.</p>
            </div>
        `;
    }
}

// ============================================
// LOAD SAVED ITEMS FROM USER LIBRARY
// ============================================

async function loadSavedItems() {
    try {
        const { data, error } = await supabase
            .from('user_library_progress')
            .select('item_id')
            .eq('user_id', currentUser.id);
        
        if (!error && data) {
            savedItems = new Set(data.map(item => item.item_id));
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
    
    let filtered = [...allItems];
    
    // Apply category filter
    if (currentFilter !== 'all') {
        filtered = filtered.filter(item => item.category === currentFilter);
    }
    
    // Apply search
    if (currentSearch) {
        const searchLower = currentSearch.toLowerCase();
        filtered = filtered.filter(item => 
            item.title.toLowerCase().includes(searchLower) ||
            (item.description && item.description.toLowerCase().includes(searchLower)) ||
            (item.author && item.author.toLowerCase().includes(searchLower))
        );
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
}

// ============================================
// CREATE ITEM CARD (Book or Bundle)
// ============================================

function createItemCard(item) {
    const isSaved = savedItems.has(item.id);
    const isBundle = item.type === 'bundle';
    
    if (isBundle) {
        return `
            <div class="grid-item item-bundle" data-id="${item.id}" onclick="viewItemDetails('${item.id}')">
                <div class="bundle-content">
                    <div class="bundle-title">${escapeHtml(item.title)}</div>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                        ${item.author || 'Gliimu Team'}
                    </div>
                    <div style="font-size: 10px; color: var(--accent); margin-top: 4px;">
                        ${item.level || 'Beginner'} • ${item.requires_subscription || 'Free'}
                    </div>
                </div>
                <button class="bundle-download-btn" onclick="event.stopPropagation(); downloadBundle('${item.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 3v12m0 0-3-3m3 3 3-3M5 21h14"/>
                    </svg>
                </button>
            </div>
        `;
    }
    
    // Book/Resource card
    return `
        <div class="grid-item item-book" data-id="${item.id}" onclick="viewItemDetails('${item.id}')">
            <div class="card-cover" style="background-image: url('${item.cover_url || 'https://placehold.co/300x450/2c2f78/white?text=No+Cover'}')">
                ${isSaved ? '<div class="saved-badge">★ Saved</div>' : ''}
            </div>
        </div>
    `;
}

// ============================================
// VIEW ITEM DETAILS MODAL
// ============================================

window.viewItemDetails = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    
    const isSaved = savedItems.has(item.id);
    const canAccess = await checkAccess(item.requires_subscription);
    
    const modal = document.getElementById('itemModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalImage = document.getElementById('modalImage');
    const modalDescription = document.getElementById('modalDescription');
    const modalFooter = document.getElementById('modalFooter');
    
    modalTitle.textContent = item.title;
    modalImage.src = item.cover_url || 'https://placehold.co/300x450/2c2f78/white?text=No+Cover';
    modalDescription.innerHTML = `
        <strong>Author:</strong> ${escapeHtml(item.author || 'Gliimu Team')}<br>
        <strong>Pages:</strong> ${item.pages || 'N/A'} | <strong>Level:</strong> ${item.level || 'Beginner'}<br>
        <strong>Access:</strong> ${item.requires_subscription || 'Free'}<br><br>
        ${escapeHtml(item.description || 'No description available.')}
    `;
    
    modalFooter.innerHTML = `
        ${!canAccess ? `
            <button class="modal-btn modal-btn-secondary" onclick="closeModal(); window.location.href='/dashboard.html?tab=wallet'">
                Upgrade to ${item.requires_subscription}
            </button>
        ` : `
            <button class="modal-btn modal-btn-secondary" onclick="toggleSaveItem('${item.id}')">
                ${isSaved ? 'Remove from Library' : 'Save to Library'}
            </button>
            <button class="modal-btn modal-btn-primary" onclick="startReading('${item.id}')">
                ${item.type === 'bundle' ? 'Download Bundle' : 'Start Reading'}
            </button>
        `}
        <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
    `;
    
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
    if (requiredSubscription === 'free') return true;
    if (!currentUser) return false;
    
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
        // Remove from saved
        const { error } = await supabase
            .from('user_library_progress')
            .delete()
            .eq('user_id', currentUser.id)
            .eq('item_id', itemId);
        
        if (!error) {
            savedItems.delete(itemId);
            showToast('Removed from your library', 'info');
            renderItems();
        }
    } else {
        // Add to saved
        const { error } = await supabase
            .from('user_library_progress')
            .insert({
                user_id: currentUser.id,
                item_id: itemId,
                progress: 0,
                completed: false
            });
        
        if (!error) {
            savedItems.add(itemId);
            showToast('Saved to your library!', 'success');
            renderItems();
        }
    }
};

// ============================================
// START READING / DOWNLOAD
// ============================================

window.startReading = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    
    if (item.type === 'bundle' || item.file_url) {
        window.open(item.file_url || '#', '_blank');
        showToast(`Opening ${item.title}...`, 'success');
    } else {
        showToast(`Opening ${item.title}. Enjoy reading!`, 'success');
    }
    
    closeModal();
};

window.downloadBundle = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    
    showToast(`Preparing ${item.title} for download...`, 'info');
    window.open(item.file_url || '#', '_blank');
};

// ============================================
// TRACK USER VIEWS
// ============================================

async function trackView(itemId) {
    try {
        // Update view count
        await supabase.rpc('increment_views', { item_id: itemId });
        
        // Update user progress
        const { data } = await supabase
            .from('user_library_progress')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('item_id', itemId)
            .single();
        
        if (data) {
            await supabase
                .from('user_library_progress')
                .update({ last_viewed: new Date().toISOString() })
                .eq('id', data.id);
        }
    } catch (error) {
        console.error('Error tracking view:', error);
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
    
    // Check for saved theme preference
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
    // Search button
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', performSearch);
    }
    
    // Enter key on search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
    }
    
    // Modal close button
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeModal);
    }
    
    // Close modal on outside click
    const modal = document.getElementById('itemModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
    
    // Download app button
    const downloadBtn = document.getElementById('downloadAppBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            showToast('App download will be available soon!', 'info');
        });
    }
    
    // Back arrow
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

// ============================================
// INCREMENT VIEWS FUNCTION (Run in Supabase)
// ============================================

/* 
Run this in Supabase SQL editor to create the increment function:

CREATE OR REPLACE FUNCTION increment_views(item_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE library_items 
    SET views = COALESCE(views, 0) + 1 
    WHERE id = item_id;
END;
$$ LANGUAGE plpgsql;
*/
