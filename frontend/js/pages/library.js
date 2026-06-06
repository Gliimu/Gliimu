// ============================================
// GLIIMU LIBRARY PAGE - COMPLETE
// Unified theme key: 'theme' (matches header.js)
// ============================================

// Global state
let allMaterials = [];
let currentCategory = 'all';
let searchQuery = '';
let savedItems = JSON.parse(localStorage.getItem('savedLibraryItems') || '[]');

// DOM elements
const booksContainer = document.getElementById('booksContainer');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const filterChips = document.getElementById('filterChips');
const modal = document.getElementById('itemModal');
const modalTitle = document.getElementById('modalTitle');
const modalImage = document.getElementById('modalImage');
const modalDescription = document.getElementById('modalDescription');
const modalFooter = document.getElementById('modalFooter');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const downloadAppBtn = document.getElementById('downloadAppBtn');

// ============================================
// UNIFIED THEME HANDLING - Uses 'theme' key (matches header.js)
// ============================================

function initTheme() {
    // Use the SAME key as header.js
    let savedTheme = localStorage.getItem('theme');
    
    // Apply theme
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    } else if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
    } else {
        // Default to dark mode (matches header.js default)
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    }
    
    updateThemeToggleIcon();
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    // Use the SAME key as header.js
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeToggleIcon();
}

function updateThemeToggleIcon() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    
    const isDark = document.body.classList.contains('dark-mode');
    const sunIcon = themeToggle.querySelector('.icon-sun');
    const moonIcon = themeToggle.querySelector('.icon-moon');
    
    if (sunIcon && moonIcon) {
        sunIcon.style.display = isDark ? 'block' : 'none';
        moonIcon.style.display = isDark ? 'none' : 'block';
    }
}

function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        // Remove existing listener to avoid duplicates
        const newToggle = themeToggle.cloneNode(true);
        themeToggle.parentNode.replaceChild(newToggle, themeToggle);
        newToggle.addEventListener('click', toggleTheme);
    }
}

// ============================================
// DOWNLOAD APP BUTTON
// ============================================

if (downloadAppBtn) {
    downloadAppBtn.addEventListener('click', () => {
        alert('App download will start soon. Check your downloads folder.');
        // window.location.href = '/download/app';
    });
}

// ============================================
// SAVE / UNSAVE ITEMS (Shelf functionality)
// ============================================

function saveItem(item) {
    if (!savedItems.find(i => i.id === item.id)) {
        savedItems.push(item);
        localStorage.setItem('savedLibraryItems', JSON.stringify(savedItems));
    }
}

function unsaveItem(itemId) {
    savedItems = savedItems.filter(i => i.id !== itemId);
    localStorage.setItem('savedLibraryItems', JSON.stringify(savedItems));
}

function isSaved(itemId) {
    return savedItems.some(i => i.id === itemId);
}

// ============================================
// MODAL FUNCTIONS
// ============================================

function showModal(item) {
    modalTitle.textContent = item.title;
    modalImage.src = item.image;
    modalDescription.textContent = item.description || 'No description available.';
    
    const isItemSaved = isSaved(item.id);
    
    if (item.type === 'book') {
        modalFooter.innerHTML = `
            <button class="modal-btn modal-btn-secondary" id="modalCloseFooterBtn">Close</button>
            <button class="modal-btn modal-btn-primary" id="saveBtn">${isItemSaved ? 'Unsave Book' : 'Save Book'}</button>
        `;
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.onclick = () => {
                if (isSaved(item.id)) {
                    unsaveItem(item.id);
                    saveBtn.textContent = 'Save Book';
                } else {
                    saveItem(item);
                    saveBtn.textContent = 'Unsave Book';
                }
                renderMaterials();
            };
        }
        const closeFooterBtn = document.getElementById('modalCloseFooterBtn');
        if (closeFooterBtn) closeFooterBtn.onclick = closeModal;
    } else if (item.type === 'bundle') {
        modalFooter.innerHTML = `
            <button class="modal-btn modal-btn-secondary" id="modalCloseFooterBtn">Close</button>
            <button class="modal-btn modal-btn-secondary" id="updateBtn">Update</button>
            <button class="modal-btn modal-btn-primary" id="downloadBtn">Download</button>
        `;
        const updateBtn = document.getElementById('updateBtn');
        const downloadBtn = document.getElementById('downloadBtn');
        if (updateBtn) {
            updateBtn.onclick = () => {
                alert(`Checking for updates: ${item.title}`);
            };
        }
        if (downloadBtn) {
            downloadBtn.onclick = () => {
                alert(`Downloading: ${item.title}`);
            };
        }
        const closeFooterBtn = document.getElementById('modalCloseFooterBtn');
        if (closeFooterBtn) closeFooterBtn.onclick = closeModal;
    }
    
    modal.classList.add('active');
}

function closeModal() {
    modal.classList.remove('active');
}

// Close modal with X button
if (modalCloseBtn) {
    modalCloseBtn.onclick = closeModal;
}

// Close modal on outside click
window.onclick = function(event) {
    if (event.target === modal) closeModal();
};

// ============================================
// FETCH MATERIALS FROM JSON
// ============================================

async function fetchMaterials() {
    try {
        // Try multiple possible paths
        let response = await fetch('../../backend/data/library.json');
        if (!response.ok) response = await fetch('../backend/data/library.json');
        if (!response.ok) response = await fetch('/backend/data/library.json');
        if (!response.ok) response = await fetch('https://raw.githubusercontent.com/Gliimu/Gliimu/main/backend/data/library.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        if (data && data.materials && Array.isArray(data.materials)) {
            allMaterials = data.materials;
            console.log('Loaded materials:', allMaterials.length);
            buildFilters();
            renderMaterials();
        } else {
            throw new Error('Invalid JSON structure');
        }
    } catch (error) {
        console.error('Error loading materials:', error);
        if (booksContainer) {
            booksContainer.innerHTML = `<div class="empty-state"><i>❌</i><h3>Failed to load library data</h3><p>Please refresh or try again later</p></div>`;
        }
    }
}

// ============================================
// BUILD FILTERS (All, Shelf, Categories)
// ============================================

function buildFilters() {
    const categories = ['all', 'shelf', ...new Set(allMaterials.map(item => item.category).filter(Boolean))];
    
    const getDisplayName = (cat) => {
        if (cat === 'all') return 'All';
        if (cat === 'shelf') return 'Shelf';
        return cat.charAt(0).toUpperCase() + cat.slice(1);
    };
    
    if (filterChips) {
        filterChips.innerHTML = categories.map(cat => `
            <div class="filter-chip ${currentCategory === cat ? 'active' : ''}" data-category="${cat}">
                ${getDisplayName(cat)}
            </div>
        `).join('');
    }
    
    document.querySelectorAll('[data-category]').forEach(el => {
        el.addEventListener('click', () => {
            currentCategory = el.getAttribute('data-category');
            document.querySelectorAll('[data-category]').forEach(c => c.classList.remove('active'));
            el.classList.add('active');
            renderMaterials();
        });
    });
}

// ============================================
// FILTER MATERIALS
// ============================================

function getFilteredMaterials() {
    let filtered = [...allMaterials];
    
    // Handle Shelf filter - shows saved items
    if (currentCategory === 'shelf') {
        filtered = filtered.filter(item => isSaved(item.id));
    }
    // Handle category filters
    else if (currentCategory !== 'all') {
        filtered = filtered.filter(item => item.category === currentCategory);
    }
    
    // Apply search filter
    if (searchQuery && searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        filtered = filtered.filter(item => item.title && item.title.toLowerCase().includes(query));
    }
    
    return filtered;
}

// ============================================
// ESCAPE HTML (XSS Prevention)
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// RENDER MATERIALS (Masonry Grid)
// ============================================

function renderMaterials() {
    if (!booksContainer) return;
    
    if (!allMaterials.length) {
        booksContainer.innerHTML = '<div class="loading">Loading materials...</div>';
        return;
    }
    
    const filteredMaterials = getFilteredMaterials();
    
    if (filteredMaterials.length === 0) {
        booksContainer.innerHTML = `<div class="empty-state"><i>📭</i><h3>No materials found</h3><p>Try adjusting your search or filters</p></div>`;
        return;
    }
    
    booksContainer.innerHTML = filteredMaterials.map(item => {
        if (item.type === 'bundle') {
            // Bundle card - title + download icon
            return `
                <div class="grid-item item-bundle" data-id="${item.id}" data-type="${item.type}">
                    <div class="bundle-content">
                        <div class="bundle-title">${escapeHtml(item.title)}</div>
                    </div>
                    <button class="bundle-download-btn" data-id="${item.id}" data-type="${item.type}">
                        <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none">
                            <path d="M12 3v12m0 0-3-3m3 3 3-3M5 21h14"/>
                        </svg>
                    </button>
                </div>
            `;
        } else {
            // Book card - image only with saved badge
            const savedBadge = isSaved(item.id) ? '<div class="saved-badge">★ Saved</div>' : '';
            return `
                <div class="grid-item item-book" data-id="${item.id}" data-type="${item.type}">
                    <div class="card-cover" style="background-image: url('${item.image}'); position: relative;">
                        ${savedBadge}
                    </div>
                </div>
            `;
        }
    }).join('');
    
    // Book click handlers
    document.querySelectorAll('.item-book').forEach(el => {
        el.addEventListener('click', () => {
            const itemId = el.getAttribute('data-id');
            const item = allMaterials.find(m => m.id === itemId);
            if (item) showModal(item);
        });
    });
    
    // Bundle download handlers
    document.querySelectorAll('.bundle-download-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemId = btn.getAttribute('data-id');
            const item = allMaterials.find(m => m.id === itemId);
            if (item) showModal(item);
        });
    });
}

// ============================================
// SEARCH HANDLERS
// ============================================

function initializeSearch() {
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            searchQuery = searchInput ? searchInput.value : '';
            renderMaterials();
        });
    }
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchQuery = searchInput.value;
                renderMaterials();
            }
        });
    }
}

// ============================================
// INITIALIZE EVERYTHING
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initTheme();           // Loads from 'theme' key (matches header.js)
    setupThemeToggle();    // Sets up toggle that saves to 'theme' key
    initializeSearch();    // Setup search functionality
    fetchMaterials();      // Load content from JSON
});
