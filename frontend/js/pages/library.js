// library.js - Library page functionality

// ============================================
// CONFIGURATION
// ============================================

// Point to your GitHub raw JSON file
const LIBRARY_JSON_URL = 'https://raw.githubusercontent.com/Gliimu/Gliimu/main/backend/data/library.json';

let materialsData = [];
let currentMaterial = null;

// ============================================
// LOAD MATERIALS FROM GITHUB
// ============================================

async function loadMaterials() {
  const grid = document.getElementById('materialsGrid');
  if (!grid) return;
  
  grid.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Loading materials...</p></div>';
  
  try {
    const response = await fetch(LIBRARY_JSON_URL);
    const data = await response.json();
    
    if (data && data.materials) {
      materialsData = data.materials.filter(m => m.status === 'approved');
      renderMaterials();
    } else {
      grid.innerHTML = '<div class="empty-state"><i class="fas fa-book-open"></i><h4>No materials found</h4><p>Check back later for new resources.</p></div>';
    }
  } catch (error) {
    console.error('Error loading materials:', error);
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Error loading materials</h4><p>Please try again later.</p></div>';
  }
}

// ============================================
// RENDER MATERIALS (MASONRY GRID)
// ============================================

function renderMaterials() {
  const grid = document.getElementById('materialsGrid');
  if (!grid) return;
  
  const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const categoryFilter = document.getElementById('categoryFilter')?.value || 'all';
  const typeFilter = document.getElementById('typeFilter')?.value || 'all';
  
  let filtered = [...materialsData];
  
  // Apply search
  if (searchTerm) {
    filtered = filtered.filter(m => 
      m.title.toLowerCase().includes(searchTerm) || 
      m.description.toLowerCase().includes(searchTerm)
    );
  }
  
  // Apply category filter
  if (categoryFilter !== 'all') {
    filtered = filtered.filter(m => m.category === categoryFilter);
  }
  
  // Apply type filter
  if (typeFilter !== 'all') {
    filtered = filtered.filter(m => m.type === typeFilter);
  }
  
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><h4>No materials found</h4><p>Try adjusting your search.</p></div>';
    return;
  }
  
  let html = '';
  for (let m of filtered) {
    if (m.type === 'book') {
      html += `
        <div class="book-card" onclick="showDetailModal('${m.id}')">
          <div class="book-cover">
            <img src="${m.image}" alt="${m.title}" loading="lazy">
            <div class="price-tag">₦${m.price.toLocaleString()}</div>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="bundle-card" onclick="showDetailModal('${m.id}')">
          <div class="bundle-cover">
            <img src="${m.image}" alt="${m.title}" loading="lazy" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-layer-group\\'></i>'">
          </div>
          <div class="bundle-info">
            <div class="bundle-title">${m.title}</div>
            <div class="bundle-price">₦${m.price.toLocaleString()}</div>
          </div>
        </div>
      `;
    }
  }
  
  grid.innerHTML = html;
}

// ============================================
// DETAIL MODAL
// ============================================

function showDetailModal(materialId) {
  currentMaterial = materialsData.find(m => m.id === materialId);
  if (!currentMaterial) return;
  
  document.getElementById('detailImage').src = currentMaterial.image;
  document.getElementById('detailTitle').textContent = currentMaterial.title;
  document.getElementById('detailPrice').textContent = `₦${currentMaterial.price.toLocaleString()}`;
  document.getElementById('detailDescription').textContent = currentMaterial.description;
  document.getElementById('detailCategory').innerHTML = `<i class="fas fa-tag"></i> ${currentMaterial.category.toUpperCase()}`;
  document.getElementById('detailType').innerHTML = currentMaterial.type === 'book' ? '<i class="fas fa-book"></i> Book' : '<i class="fas fa-layer-group"></i> Bundle';
  
  document.getElementById('detailModal').classList.add('active');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('active');
  currentMaterial = null;
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', renderMaterials);
  }
  
  const categoryFilter = document.getElementById('categoryFilter');
  if (categoryFilter) {
    categoryFilter.addEventListener('change', renderMaterials);
  }
  
  const typeFilter = document.getElementById('typeFilter');
  if (typeFilter) {
    typeFilter.addEventListener('change', renderMaterials);
  }
}

// ============================================
// INITIALIZE
// ============================================

function initLibrary() {
  console.log('Library initializing...');
  setupEventListeners();
  loadMaterials();
}

// Make functions global for modal
window.showDetailModal = showDetailModal;
window.closeDetailModal = closeDetailModal;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initLibrary);
