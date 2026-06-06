// Global state
let allMaterials = [];
let currentCategory = 'all';
let searchQuery = '';
let currentTab = 'all';
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

// Theme handling
function initTheme() {
    const savedTheme = localStorage.getItem('libraryTheme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }
    
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            localStorage.setItem('libraryTheme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        });
    }
}

// Tab handling
function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.getAttribute('data-tab');
            renderMaterials();
        });
    });
}

// Save/unsave item
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

// Show modal
function showModal(item) {
    modalTitle.textContent = item.title;
    modalImage.src = item.image;
    modalDescription.textContent = item.description || 'No description available.';
    
    const isItemSaved = isSaved(item.id);
    
    if (item.type === 'book') {
        modalFooter.innerHTML = `
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
            <button class="modal-btn modal-btn-primary" id="saveBtn">${isItemSaved ? 'Unsave Book' : 'Save Book'}</button>
        `;
        const saveBtn = document.getElementById('saveBtn');
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
    } else if (item.type === 'bundle') {
        modalFooter.innerHTML = `
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
            <button class="modal-btn modal-btn-secondary" id="updateBtn">Update</button>
            <button class="modal-btn modal-btn-primary" id="downloadBtn">Download</button>
        `;
        document.getElementById('updateBtn').onclick = () => {
            alert(`Checking for updates: ${item.title}`);
        };
        document.getElementById('downloadBtn').onclick = () => {
            alert(`Downloading: ${item.title}`);
        };
    }
    
    modal.classList.add('active');
}

function closeModal() {
    modal.classList.remove('active');
}

window.closeModal = closeModal;

// Fetch materials
async function fetchMaterials() {
    try {
        let response = await fetch('../../backend/data/library.json');
        if (!response.ok) response = await fetch('../backend/data/library.json');
        if (!response.ok) response = await fetch('/backend/data/library.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        if (data && data.materials && Array.isArray(data.materials)) {
            allMaterials = data.materials;
            buildFilters();
            renderMaterials();
        } else {
            throw new Error('Invalid JSON structure');
        }
    } catch (error) {
        console.error('Error loading materials:', error);
        booksContainer.innerHTML = `<div class="empty-state"><i>❌</i><h3>Failed to load library data</h3></div>`;
    }
}

// Build filters
function buildFilters() {
    const categories = ['all', ...new Set(allMaterials.map(item => item.category).filter(Boolean))];
    filterChips.innerHTML = categories.map(cat => `
        <div class="filter-chip ${currentCategory === cat ? 'active' : ''}" data-category="${cat}">
            ${cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
        </div>
    `).join('');
    
    document.querySelectorAll('[data-category]').forEach(el => {
        el.addEventListener('click', () => {
            currentCategory = el.getAttribute('data-category');
            document.querySelectorAll('[data-category]').forEach(c => c.classList.remove('active'));
            el.classList.add('active');
            renderMaterials();
        });
    });
}

// Get filtered materials
function getFilteredMaterials() {
    let filtered = [...allMaterials];
    
    if (currentTab === 'saved') {
        filtered = filtered.filter(item => isSaved(item.id));
    }
    
    if (currentCategory !== 'all') {
        filtered = filtered.filter(item => item.category === currentCategory);
    }
    
    if (searchQuery && searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        filtered = filtered.filter(item => item.title.toLowerCase().includes(query));
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

// Render materials
function renderMaterials() {
    if (!booksContainer) return;
    if (!allMaterials.length) {
        booksContainer.innerHTML = '<div class="loading">Loading materials...</div>';
        return;
    }
    
    const filteredMaterials = getFilteredMaterials();
    
    if (filteredMaterials.length === 0) {
        booksContainer.innerHTML = `<div class="empty-state"><i>📭</i><h3>No materials found</h3></div>`;
        return;
    }
    
    booksContainer.innerHTML = filteredMaterials.map(item => {
        if (item.type === 'bundle') {
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
            const savedBadge = isSaved(item.id) ? '<div style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px;">★ Saved</div>' : '';
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

// Search handlers
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

// Close modal on outside click
window.onclick = function(event) {
    if (event.target === modal) closeModal();
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTabs();
    initializeSearch();
    fetchMaterials();
});
