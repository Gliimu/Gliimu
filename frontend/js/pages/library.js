// Global state
let allMaterials = [];
let currentCategory = 'all';
let searchQuery = '';

// DOM elements
const booksContainer = document.getElementById('booksContainer');
const heroSearchInput = document.getElementById('heroSearchInput');
const heroSearchBtn = document.getElementById('heroSearchBtn');
const filterChips = document.getElementById('filterChips');

// Wait for header to load before initializing library
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initializeEventListeners();
        fetchMaterials();
    }, 100);
});

// Initialize event listeners
function initializeEventListeners() {
    if (heroSearchBtn) {
        heroSearchBtn.addEventListener('click', () => {
            searchQuery = heroSearchInput ? heroSearchInput.value : '';
            renderMaterials();
        });
    }
    
    if (heroSearchInput) {
        heroSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchQuery = heroSearchInput.value;
                renderMaterials();
            }
        });
    }
}

// Fetch materials from JSON file
async function fetchMaterials() {
    try {
        const response = await fetch('../../../backend/data/library.json');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.materials && Array.isArray(data.materials)) {
            allMaterials = data.materials;
            console.log('Loaded materials:', allMaterials.length);
        } else {
            throw new Error('Invalid JSON structure');
        }
        
        buildFilters();
        renderMaterials();
    } catch (error) {
        console.error('Error loading materials:', error);
        if (booksContainer) {
            booksContainer.innerHTML = `
                <div class="empty-state">
                    <i>❌</i>
                    <h3>Failed to load library data</h3>
                    <p>Please refresh the page or try again later</p>
                </div>
            `;
        }
    }
}

// Build category filters
function buildFilters() {
    const categories = ['all', ...new Set(allMaterials.map(item => item.category).filter(Boolean))];
    
    if (filterChips) {
        filterChips.innerHTML = categories.map(cat => `
            <div class="filter-chip ${currentCategory === cat ? 'active' : ''}" data-category="${cat}">
                ${cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </div>
        `).join('');
    }
    
    document.querySelectorAll('[data-category]').forEach(el => {
        el.addEventListener('click', (e) => {
            currentCategory = el.getAttribute('data-category');
            document.querySelectorAll('[data-category]').forEach(c => c.classList.remove('active'));
            el.classList.add('active');
            renderMaterials();
        });
    });
}

// Filter materials
function getFilteredMaterials() {
    let filtered = [...allMaterials];
    
    if (currentCategory !== 'all') {
        filtered = filtered.filter(item => item.category === currentCategory);
    }
    
    if (searchQuery && searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        filtered = filtered.filter(item => 
            item.title && item.title.toLowerCase().includes(query)
        );
    }
    
    return filtered;
}

// Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Render materials - CLEAN VERSION (no badges, no meta text)
function renderMaterials() {
    if (!booksContainer) return;
    
    if (!allMaterials.length) {
        booksContainer.innerHTML = '<div class="loading">Loading materials...</div>';
        return;
    }
    
    const filteredMaterials = getFilteredMaterials();
    
    if (filteredMaterials.length === 0) {
        booksContainer.innerHTML = `
            <div class="empty-state">
                <i>📭</i>
                <h3>No materials found</h3>
                <p>Try adjusting your search</p>
            </div>
        `;
        return;
    }
    
    booksContainer.innerHTML = filteredMaterials.map(item => {
        if (item.type === 'bundle') {
            // Bundle card - compact, no extra text
            return `
                <div class="grid-item item-bundle" data-id="${item.id}" data-type="${item.type}">
                    <div class="bundle-content">
                        <div class="bundle-title">${escapeHtml(item.title)}</div>
                    </div>
                    <button class="bundle-download-btn" data-id="${item.id}" data-type="${item.type}">
                        ⬇️
                    </button>
                </div>
            `;
        } else {
            // Book card - just image and title, no meta text
            return `
                <div class="grid-item item-book" data-id="${item.id}" data-type="${item.type}">
                    <div class="card-cover" style="background-image: url('${item.image}'); background-size: cover; background-position: center;"></div>
                    <div class="card-info">
                        <div class="card-title">${escapeHtml(item.title)}</div>
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
            if (item) {
                alert(`📚 Opening: ${item.title}`);
            }
        });
    });
    
    // Bundle download handlers
    document.querySelectorAll('.bundle-download-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemId = btn.getAttribute('data-id');
            const item = allMaterials.find(m => m.id === itemId);
            if (item) {
                alert(`📦 Downloading: ${item.title}`);
            }
        });
    });
}
