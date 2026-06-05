// library.js - Complete library functionality

let currentUser = null;
let currentTab = 'browse';
let materials = [];
let purchases = [];
let selectedMaterial = null;

// Mock materials data
const mockMaterials = [
  { id: 'mat_001', type: 'book', title: 'Complete Guide to Video Production', description: 'Master professional video production from pre-production to final delivery. Learn camera techniques, lighting, sound design, and post-production editing.', price: 3500, image: 'https://images.unsplash.com/photo-1536240474400-3f5c8c6ee9d1?w=300&h=400&fit=crop', category: 'video' },
  { id: 'mat_002', type: 'book', title: 'UI/UX Design Mastery', description: 'Learn the fundamentals of user interface and experience design. Master Figma, prototyping, user research, and accessibility.', price: 2800, image: 'https://images.unsplash.com/photo-1586717791821-3f44a563fa4c?w=300&h=400&fit=crop', category: 'design' },
  { id: 'mat_003', type: 'book', title: 'JavaScript: The Complete Guide', description: 'From beginner to advanced. Master JavaScript, ES6+, async programming, and modern frameworks.', price: 4200, image: 'https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?w=300&h=400&fit=crop', category: 'code' },
  { id: 'mat_004', type: 'book', title: 'Motion Graphics with After Effects', description: 'Create stunning animations and motion graphics. Learn keyframing, expressions, and visual effects.', price: 3200, image: 'https://images.unsplash.com/photo-1558655146-9f40138edf9f?w=300&h=400&fit=crop', category: 'video' },
  { id: 'mat_005', type: 'book', title: 'Branding & Identity Design', description: 'Build powerful brands. Learn logo design, color theory, typography, and brand strategy.', price: 2500, image: 'https://images.unsplash.com/photo-1545235617-9465d2a55698?w=300&h=400&fit=crop', category: 'design' },
  { id: 'bun_001', type: 'bundle', title: 'Full-Stack Web Development Bundle', description: 'Complete web development resources. 5 courses + 10 projects + Source code.', price: 15000, image: 'https://images.unsplash.com/photo-1461749280699-6d844bd4a1c5?w=100&h=100&fit=crop', category: 'code' },
  { id: 'bun_002', type: 'bundle', title: 'Creative Media Production Pack', description: 'Everything you need for video and audio production. 50+ templates + Sound effects + Presets.', price: 12000, image: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=100&h=100&fit=crop', category: 'video' }
];

// ============================================
// INITIALIZATION
// ============================================

function initLibrary() {
  console.log('initLibrary started');
  
  // Get user
  const storedUser = localStorage.getItem('gliimu_user');
  if (!storedUser) {
    window.location.href = 'index.html';
    return;
  }
  
  currentUser = JSON.parse(storedUser);
  
  // Load materials
  const storedMaterials = localStorage.getItem('gliimu_materials');
  if (storedMaterials) {
    materials = JSON.parse(storedMaterials);
  } else {
    materials = mockMaterials;
    localStorage.setItem('gliimu_materials', JSON.stringify(materials));
  }
  
  // Load purchases
  const storedPurchases = localStorage.getItem(`gliimu_purchases_${currentUser.id}`);
  if (storedPurchases) {
    purchases = JSON.parse(storedPurchases);
  } else {
    purchases = [];
  }
  
  // Setup event listeners
  setupEventListeners();
  
  // Render grid
  renderMaterials();
}

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', () => renderMaterials());
  
  const categoryFilter = document.getElementById('categoryFilter');
  if (categoryFilter) categoryFilter.addEventListener('change', () => renderMaterials());
  
  const typeFilter = document.getElementById('typeFilter');
  if (typeFilter) typeFilter.addEventListener('change', () => renderMaterials());
}

// ============================================
// TAB SWITCHING
// ============================================

function switchTab(tabId) {
  currentTab = tabId;
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-tab') === tabId) btn.classList.add('active');
  });
  
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  if (tabId === 'browse') {
    document.getElementById('browseContent').classList.add('active');
    renderMaterials();
  } else if (tabId === 'purchases') {
    document.getElementById('purchasesContent').classList.add('active');
    renderPurchases();
  } else if (tabId === 'admin') {
    document.getElementById('adminContent').classList.add('active');
    renderAdminPanel();
  }
}

// ============================================
// RENDER MATERIALS
// ============================================

function renderMaterials() {
  const container = document.getElementById('materialsGrid');
  if (!container) return;
  
  const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const categoryFilter = document.getElementById('categoryFilter')?.value || 'all';
  const typeFilter = document.getElementById('typeFilter')?.value || 'all';
  
  let filtered = [...materials];
  
  if (searchTerm) {
    filtered = filtered.filter(m => m.title.toLowerCase().includes(searchTerm));
  }
  if (categoryFilter !== 'all') {
    filtered = filtered.filter(m => m.category === categoryFilter);
  }
  if (typeFilter !== 'all') {
    filtered = filtered.filter(m => m.type === typeFilter);
  }
  
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><h4>No materials found</h4><p>Try adjusting your search.</p></div>`;
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
  
  container.innerHTML = html;
}

// ============================================
// DETAIL MODAL
// ============================================

function showDetailModal(materialId) {
  selectedMaterial = materials.find(m => m.id === materialId);
  if (!selectedMaterial) return;
  
  document.getElementById('detailImage').src = selectedMaterial.image;
  document.getElementById('detailTitle').textContent = selectedMaterial.title;
  document.getElementById('detailPrice').textContent = `₦${selectedMaterial.price.toLocaleString()}`;
  document.getElementById('detailDescription').textContent = selectedMaterial.description;
  document.getElementById('detailCategory').innerHTML = `<i class="fas fa-tag"></i> ${selectedMaterial.category.toUpperCase()}`;
  document.getElementById('detailType').innerHTML = selectedMaterial.type === 'book' ? '<i class="fas fa-book"></i> Book' : '<i class="fas fa-layer-group"></i> Bundle';
  
  document.getElementById('detailModal').classList.add('active');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('active');
  selectedMaterial = null;
}

function purchaseFromModal() {
  if (!selectedMaterial) return;
  closeDetailModal();
  showPurchaseModal(selectedMaterial.id);
}

// ============================================
// PURCHASE MODAL
// ============================================

let purchaseMaterial = null;

function showPurchaseModal(materialId) {
  purchaseMaterial = materials.find(m => m.id === materialId);
  if (!purchaseMaterial) return;
  
  if (purchases.some(p => p.materialId === purchaseMaterial.id)) {
    alert('You have already purchased this item.');
    return;
  }
  
  document.getElementById('purchaseModalTitle').textContent = purchaseMaterial.title;
  document.getElementById('purchaseModalDesc').textContent = purchaseMaterial.description;
  document.getElementById('purchaseModalPrice').textContent = `₦${purchaseMaterial.price.toLocaleString()}`;
  
  document.getElementById('purchaseModal').classList.add('active');
}

function closePurchaseModal() {
  document.getElementById('purchaseModal').classList.remove('active');
  purchaseMaterial = null;
}

function confirmPurchase() {
  if (!purchaseMaterial) return;
  
  const newPurchase = {
    id: 'pur_' + Date.now(),
    materialId: purchaseMaterial.id,
    title: purchaseMaterial.title,
    price: purchaseMaterial.price,
    type: purchaseMaterial.type,
    date: new Date().toISOString(),
    downloadUrl: '#'
  };
  
  purchases.push(newPurchase);
  localStorage.setItem(`gliimu_purchases_${currentUser.id}`, JSON.stringify(purchases));
  
  closePurchaseModal();
  document.getElementById('successMessage').innerHTML = `${purchaseMaterial.title} has been added to your library.`;
  document.getElementById('successModal').classList.add('active');
}

function closeSuccessModal() {
  document.getElementById('successModal').classList.remove('active');
  if (currentTab === 'purchases') renderPurchases();
}

// ============================================
// PURCHASES
// ============================================

function renderPurchases() {
  const container = document.getElementById('purchasesList');
  if (!container) return;
  
  if (purchases.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-shopping-bag"></i>
        <h4>No purchases yet</h4>
        <p>Browse the library and buy your first learning material.</p>
        <button class="btn-primary" onclick="switchTab('browse')">Browse Library →</button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <table class="purchase-table">
      <thead><tr><th>Item</th><th>Type</th><th>Price</th><th>Date</th><th>Action</th></tr></thead>
      <tbody>
        ${purchases.map(p => `
          <tr>
            <td><strong>${p.title}</strong></td>
            <td>${p.type === 'book' ? '📖 Book' : '📦 Bundle'}</td>
            <td>₦${p.price.toLocaleString()}</td>
            <td>${new Date(p.date).toLocaleDateString()}</td>
            <td><button class="download-btn" onclick="downloadMaterial('${p.id}')">Download</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function downloadMaterial(purchaseId) {
  const purchase = purchases.find(p => p.id === purchaseId);
  if (purchase) alert(`Downloading: ${purchase.title}\n\nIn production, this would download the file.`);
}

// ============================================
// ADMIN PANEL
// ============================================

function renderAdminPanel() {
  const container = document.getElementById('adminContent');
  if (!container) return;
  
  if (currentUser.role !== 'Admin') {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-lock"></i><h4>Admin Access Only</h4><p>You don't have permission.</p></div>`;
    return;
  }
  
  container.innerHTML = `
    <div class="admin-panel">
      <div class="admin-header">
        <h3><i class="fas fa-boxes"></i> Manage Materials</h3>
        <button class="add-material-btn" onclick="alert('Add material form would open here')"><i class="fas fa-plus"></i> Add Material</button>
      </div>
      <table class="purchase-table">
        <thead><tr><th>Title</th><th>Type</th><th>Price</th><th>Actions</th></tr></thead>
        <tbody>
          ${materials.map(m => `
            <tr>
              <td><strong>${m.title}</strong></td>
              <td>${m.type}</td>
              <td>₦${m.price.toLocaleString()}</td>
              <td><button class="download-btn" onclick="alert('Edit ${m.title}')">Edit</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Make functions global
window.switchTab = switchTab;
window.showDetailModal = showDetailModal;
window.closeDetailModal = closeDetailModal;
window.purchaseFromModal = purchaseFromModal;
window.closePurchaseModal = closePurchaseModal;
window.confirmPurchase = confirmPurchase;
window.closeSuccessModal = closeSuccessModal;
window.downloadMaterial = downloadMaterial;

// Initialize
document.addEventListener('DOMContentLoaded', initLibrary);
