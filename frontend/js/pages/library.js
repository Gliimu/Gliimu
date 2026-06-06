// Global state
let allMaterials = [];
let currentView = 'browse';
let currentCategory = 'all';
let currentType = 'all';
let searchQuery = '';

// DOM elements
const booksContainer = document.getElementById('booksContainer');
const searchInput = document.getElementById('searchInput');
const categoryList = document.getElementById('categoryList');
const typeList = document.getElementById('typeList');
const filterChips = document.getElementById('filterChips');
const modal = document.getElementById('subscriptionModal');

// Modal functions
function openModal() {
    modal.classList.add('active');
}

function closeModal() {
    modal.classList.remove('active');
}

window.closeModal = closeModal;

// Event listeners
document.getElementById('upgradeBtn').addEventListener('click', (e) => {
    e.preventDefault();
    openModal();
});

modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

// Fetch materials from JSON file
async function fetchMaterials() {
    try {
        const response = await fetch('backend/data/library.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - File not found`);
        }
        const data = await response.json();
        
        if (data && data.materials && Array.isArray(data.materials)) {
            allMaterials = data.materials;
            console.log('Loaded materials:', allMaterials.length);
        } else {
            throw new Error('Invalid JSON structure: missing materials array');
        }
        
        buildFilters();
        renderMaterials();
    } catch (error) {
        console.error('Error loading materials:', error);
        booksContainer.innerHTML = `<div class="empty-state">❌ Failed to load library data. Please make sure the file exists at backend/data/library.json<br><br>Error: ${error.message}</div>`;
    }
}

// Build category and type filters from data
function buildFilters() {
    const categories = ['all', ...new Set(allMaterials.map(item => item.category).filter(Boolean))];
    const types = ['all', ...new Set(allMaterials.map(item => item.type).filter(Boolean))];
    
    // Build category list
    categoryList.innerHTML = categories.map(cat => `
        <li><a data-category="${cat}" class="${currentCategory === cat ? 'active' : ''}">${cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}</a></li>
    `).join('');
    
    // Build type list
    typeList.innerHTML = types.map(type => `
        <li><a data-type="${type}" class="${currentType === type ? 'active' : ''}">${type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}</a></li>
    `).join('');
    
    // Build filter chips
    filterChips.innerHTML = categories.slice(0, 6).map(cat => `
        <div class="filter-chip ${currentCategory === cat ? 'active' : ''}" data-category="${cat}">${cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}</div>
    `).join('');
    
    // Add event listeners
    document.querySelectorAll('[data-category]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            currentCategory = el.getAttribute('data-category');
            currentView = 'browse';
            updateActiveStates();
            renderMaterials();
        });
    });
    
    document.querySelectorAll('[data-type]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            currentType = el.getAttribute('data-type');
            currentView = 'browse';
            updateActiveStates();
            renderMaterials();
        });
    });
}

// Update active states in UI
function updateActiveStates() {
    // Update sidebar navigation
    document.querySelectorAll('[data-view]').forEach(el => {
        if (el.getAttribute('data-view') === currentView) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
    
    // Update category filters
    document.querySelectorAll('[data-category]').forEach(el => {
        if (el.getAttribute('data-category') === currentCategory) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
    
    // Update type filters
    document.querySelectorAll('[data-type]').forEach(el => {
        if (el.getAttribute('data-type') === currentType) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
}

// Filter materials based on current filters
function getFilteredMaterials() {
    let filtered = [...allMaterials];
    
    // Apply view filter (Subscription view shows bundles as premium content)
    if (currentView === 'subscription') {
        filtered = filtered.filter(item => item.type === 'bundle');
    }
    
    // Apply category filter
    if (currentCategory !== 'all') {
        filtered = filtered.filter(item => item.category === currentCategory);
    }
    
    // Apply type filter
    if (currentType !== 'all') {
        filtered = filtered.filter(item => item.type === currentType);
    }
    
    // Apply search filter
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(item => 
            item.title.toLowerCase().includes(query) || 
            (item.description && item.description.toLowerCase().includes(query))
        );
    }
    
    return filtered;
}

// Get emoji/icon for different types
function getTypeIcon(type) {
    const icons = {
        'book': '📖',
        'bundle': '📦'
    };
    return icons[type] || '📚';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Render materials to the grid
function renderMaterials() {
    if (!allMaterials.length) {
        booksContainer.innerHTML = '<div class="loading">Loading materials...</div>';
        return;
    }
    
    const filteredMaterials = getFilteredMaterials();
    
    if (filteredMaterials.length === 0) {
        booksContainer.innerHTML = '<div class="empty-state">📭 No materials found. Try adjusting your filters.</div>';
        return;
    }
    
    booksContainer.innerHTML = `
        <div class="books-grid">
            ${filteredMaterials.map(item => `
                <div class="book-card" data-id="${item.id}" data-type="${item.type}">
                    <div class="book-cover">
                        ${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.title)}" loading="lazy">` : `<div style="display: flex; align-items: center; justify-content: center; height: 100%; font-size: 3rem;">${getTypeIcon(item.type)}</div>`}
                        <div class="type-badge">${item.type}</div>
                        ${item.type === 'bundle' && item.bundleItems ? `<div class="bundle-badge">${item.bundleItems} items</div>` : ''}
                    </div>
                    <div class="book-info">
                        <div class="book-title">${escapeHtml(item.title)}</div>
                        <div class="book-description">${escapeHtml(item.description.substring(0, 100))}${item.description.length > 100 ? '...' : ''}</div>
                        <div class="book-meta">
                            <span>📁 ${escapeHtml(item.category.charAt(0).toUpperCase() + item.category.slice(1))}</span>
                            <span>•</span>
                            <span>📅 ${new Date(item.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    // Add click handlers to cards
    document.querySelectorAll('.book-card').forEach(card => {
        card.addEventListener('click', () => {
            const itemType = card.getAttribute('data-type');
            const itemId = card.getAttribute('data-id');
            const item = allMaterials.find(m => m.id === itemId);
            
            // Show subscription modal for bundles (premium content)
            if (itemType === 'bundle' && currentView !== 'subscription') {
                openModal();
            } else {
                alert(`📚 Opening: ${item.title}\n\n${item.description.substring(0, 200)}...\n\nThis is a ${item.type === 'bundle' ? 'premium bundle' : 'free book'} resource.`);
            }
        });
    });
}

// Event listeners for sidebar navigation
document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', (e) => {
        e.preventDefault();
        currentView = el.getAttribute('data-view');
        currentCategory = 'all';
        currentType = 'all';
        searchQuery = '';
        searchInput.value = '';
        updateActiveStates();
        renderMaterials();
    });
});

// Search functionality
document.getElementById('searchBtn').addEventListener('click', () => {
    searchQuery = searchInput.value;
    currentView = 'browse';
    updateActiveStates();
    renderMaterials();
});

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchQuery = searchInput.value;
        currentView = 'browse';
        updateActiveStates();
        renderMaterials();
    }
});

// Initialize - fetch from JSON
fetchMaterials();
