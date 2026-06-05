// library.js - Complete library functionality

let currentUser = null;
let currentTab = 'browse';
let materials = [];
let purchases = [];

// Mock materials data
const mockMaterials = [
  {
    id: 'mat_001',
    type: 'book',
    title: 'Complete Guide to Video Production',
    description: 'Master professional video production from pre-production to final delivery. Learn camera techniques, lighting, sound design, and post-production editing.',
    price: 3500,
    image: 'https://placehold.co/400x500/2c2f78/white?text=Video+Production',
    category: 'video',
    stock: 50
  },
  {
    id: 'mat_002',
    type: 'book',
    title: 'UI/UX Design Mastery',
    description: 'Learn the fundamentals of user interface and experience design. Master Figma, prototyping, user research, and accessibility.',
    price: 2800,
    image: 'https://placehold.co/400x500/8b5cf6/white?text=UI+UX+Design',
    category: 'design',
    stock: 45
  },
  {
    id: 'mat_003',
    type: 'book',
    title: 'JavaScript: The Complete Guide',
    description: 'From beginner to advanced. Master JavaScript, ES6+, async programming, and modern frameworks.',
    price: 4200,
    image: 'https://placehold.co/400x500/10b981/white?text=JavaScript',
    category: 'code',
    stock: 30
  },
  {
    id: 'mat_004',
    type: 'bundle',
    title: 'Full-Stack Web Development Bundle',
    description: 'Complete web development resources including HTML, CSS, JavaScript, React, Node.js, and MongoDB.',
    price: 15000,
    image: 'https://placehold.co/400x500/f59e0b/white?text=Web+Bundle',
    category: 'code',
    stock: 20,
    bundleItems: 5
  },
  {
    id: 'mat_005',
    type: 'book',
    title: 'Motion Graphics with After Effects',
    description: 'Create stunning animations and motion graphics. Learn keyframing, expressions, and visual effects.',
    price: 3200,
    image: 'https://placehold.co/400x500/ef4444/white?text=Motion+Graphics',
    category: 'video',
    stock: 35
  },
  {
    id: 'mat_006',
    type: 'bundle',
    title: 'Creative Media Production Pack',
    description: 'Everything you need for video and audio production. Includes templates, presets, and project files.',
    price: 12000,
    image: 'https://placehold.co/400x500/06b6d4/white?text=Media+Pack',
    category: 'video',
    stock: 15,
    bundleItems: 10
  }
];

// ============================================
// INITIALIZATION
// ============================================

function initLibrary() {
  // Get logged-in user
  const storedUser = localStorage.getItem('gliimu_user');
  
  if (!storedUser) {
    window.location.href = 'index.html';
    return;
  }
  
  currentUser = JSON.parse(storedUser);
  
  // Load materials (from localStorage or mock)
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
  
  // Update UI with user info
  document.getElementById('userName').textContent = currentUser.name || currentUser.username;
  document.getElementById('userAvatar').src = currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name || currentUser.username)}&background=random&color=fff`;
  
  // Set up event listeners
  setupEventListeners();
  
  // Load initial view
  renderMaterials();
  updateCartCount();
}

function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderMaterials());
  }
  
  // Category filter
  const categoryFilter = document.getElementById('categoryFilter');
  if (categoryFilter) {
    categoryFilter.addEventListener('change', () => renderMaterials());
  }
  
  // Type filter
  const typeFilter = document.getElementById('typeFilter');
  if (typeFilter) {
    typeFilter.addEventListener('change', () => renderMaterials());
  }
}

// ============================================
// TAB SWITCHING
// ============================================

function switchTab(tabId) {
  currentTab = tabId;
  
  // Update active tab
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    }
  });
  
  // Show appropriate content
  const browseContent = document.getElementById('browseContent');
  const purchasesContent = document.getElementById('purchasesContent');
  const adminContent = document.getElementById('adminContent');
  
  if (tabId === 'browse') {
    browseContent.style.display = 'block';
    purchasesContent.style.display = 'none';
    adminContent.style.display = 'none';
    renderMaterials();
  } else if (tabId === 'purchases') {
    browseContent.style.display = 'none';
    purchasesContent.style.display = 'block';
    adminContent.style.display = 'none';
    renderPurchases();
  } else if (tabId === 'admin') {
    browseContent.style.display = 'none';
    purchasesContent.style.display = 'none';
    adminContent.style.display = 'block';
    renderAdminPanel();
  }
}

// ============================================
// RENDER MATERIALS (BROWSE TAB)
// ============================================

function renderMaterials() {
  const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const categoryFilter = document.getElementById('categoryFilter')?.value || 'all';
  const typeFilter = document.getElementById('typeFilter')?.value || 'all';
  
  let filtered = [...materials];
  
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
  
  const container = document.getElementById('materialsGrid');
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-search"></i>
        <h4>No materials found</h4>
        <p>Try adjusting your search or filters.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filtered.map(material => `
    <div class="material-card ${material.type === 'bundle' ? 'bundle' : ''}" onclick="showPurchaseModal('${material.id}')">
      <div class="card-image">
        <img src="${material.image}" alt="${material.title}">
        <div class="price-badge">₦${material.price.toLocaleString()}</div>
        <div class="type-badge">${material.type === 'book' ? '📖 Book' : '📦 Bundle'}</div>
        ${material.type === 'bundle' ? '<div class="bundle-icon"><i class="fas fa-layer-group"></i></div>' : ''}
      </div>
      <div class="card-info">
        <h3 class="card-title">${material.title}</h3>
        <p class="card-description">${material.description.substring(0, 80)}${material.description.length > 80 ? '...' : ''}</p>
        <div class="card-meta">
          <span class="card-category">${material.category.toUpperCase()}</span>
          <button class="purchase-btn" onclick="event.stopPropagation(); showPurchaseModal('${material.id}')">Purchase</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ============================================
// PURCHASE MODAL
// ============================================

let selectedMaterial = null;

function showPurchaseModal(materialId) {
  selectedMaterial = materials.find(m => m.id === materialId);
  if (!selectedMaterial) return;
  
  const modal = document.getElementById('purchaseModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalPrice = document.getElementById('modalPrice');
  const modalDescription = document.getElementById('modalDescription');
  
  modalTitle.textContent = selectedMaterial.title;
  modalPrice.textContent = `₦${selectedMaterial.price.toLocaleString()}`;
  modalDescription.textContent = selectedMaterial.description;
  
  modal.classList.add('active');
}

function closePurchaseModal() {
  document.getElementById('purchaseModal').classList.remove('active');
  selectedMaterial = null;
}

function confirmPurchase() {
  if (!selectedMaterial) return;
  
  // Check if already purchased
  const alreadyPurchased = purchases.some(p => p.materialId === selectedMaterial.id);
  if (alreadyPurchased) {
    alert('You have already purchased this item.');
    closePurchaseModal();
    return;
  }
  
  // Get user wallet (mock)
  const walletBalance = 25000; // Mock balance
  
  if (walletBalance < selectedMaterial.price) {
    alert(`Insufficient funds!\n\nYour balance: ₦25,000\nItem price: ₦${selectedMaterial.price.toLocaleString()}\n\nPlease top up your wallet.`);
    closePurchaseModal();
    return;
  }
  
  // Process purchase
  const newPurchase = {
    id: 'pur_' + Date.now(),
    materialId: selectedMaterial.id,
    title: selectedMaterial.title,
    price: selectedMaterial.price,
    type: selectedMaterial.type,
    date: new Date().toISOString(),
    downloadUrl: '#'
  };
  
  purchases.push(newPurchase);
  localStorage.setItem(`gliimu_purchases_${currentUser.id}`, JSON.stringify(purchases));
  
  // Show success
  alert(`Purchase successful!\n\n${selectedMaterial.title} has been added to your library.`);
  closePurchaseModal();
  
  // If on purchases tab, refresh
  if (currentTab === 'purchases') {
    renderPurchases();
  }
}

// ============================================
// RENDER PURCHASES
// ============================================

function renderPurchases() {
  const container = document.getElementById('purchasesList');
  
  if (purchases.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-shopping-bag"></i>
        <h4>No purchases yet</h4>
        <p>Browse the library and buy your first learning material.</p>
        <button class="btn-primary" style="margin-top: 16px;" onclick="switchTab('browse')">Browse Library →</button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="purchase-table">
      <table>
        <thead>
          <tr><th>Item</th><th>Type</th><th>Price</th><th>Purchase Date</th><th>Action</th></tr>
        </thead>
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
    </div>
  `;
}

function downloadMaterial(purchaseId) {
  const purchase = purchases.find(p => p.id === purchaseId);
  if (purchase) {
    alert(`Downloading: ${purchase.title}\n\nIn production, this would download the file.`);
  }
}

// ============================================
// ADMIN PANEL
// ============================================

function renderAdminPanel() {
  if (currentUser.role !== 'Admin') {
    document.getElementById('adminContent').innerHTML = `
      <div class="empty-state">
        <i class="fas fa-lock"></i>
        <h4>Admin Access Only</h4>
        <p>You don't have permission to access this section.</p>
      </div>
    `;
    return;
  }
  
  const container = document.getElementById('adminContent');
  
  container.innerHTML = `
    <div class="admin-panel">
      <div class="admin-header">
        <h3><i class="fas fa-boxes"></i> Manage Materials</h3>
        <button class="add-material-btn" onclick="showAddMaterialForm()"><i class="fas fa-plus"></i> Add Material</button>
      </div>
      <div class="purchase-table">
        <table>
          <thead>
            <tr><th>Title</th><th>Type</th><th>Price</th><th>Stock</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${materials.map(m => `
              <tr>
                <td><strong>${m.title}</strong></td>
                <td>${m.type}</td>
                <td>₦${m.price.toLocaleString()}</td>
                <td>${m.stock || '∞'}</td>
                <td>
                  <button class="download-btn" onclick="editMaterial('${m.id}')">Edit</button>
                  <button class="download-btn" onclick="deleteMaterial('${m.id}')" style="border-color: var(--danger); color: var(--danger);">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function showAddMaterialForm() {
  const html = `
    <div class="form-container" id="materialForm">
      <h3 style="margin-bottom: 20px;">Add New Material</h3>
      <div class="form-group">
        <label>Title</label>
        <input type="text" id="matTitle" placeholder="Material title">
      </div>
      <div class="form-group">
        <label>Type</label>
        <select id="matType">
          <option value="book">Book</option>
          <option value="bundle">Bundle</option>
        </select>
      </div>
      <div class="form-group">
        <label>Category</label>
        <select id="matCategory">
          <option value="video">Video Production</option>
          <option value="design">Design</option>
          <option value="code">Code/Programming</option>
        </select>
      </div>
      <div class="form-group">
        <label>Price (₦)</label>
        <input type="number" id="matPrice" placeholder="Price">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="matDesc" rows="3" placeholder="Describe the material..."></textarea>
      </div>
      <div class="form-group">
        <label>Image URL</label>
        <input type="text" id="matImage" placeholder="https://...">
      </div>
      <div class="form-actions">
        <button class="btn-primary" onclick="saveNewMaterial()">Save</button>
        <button class="btn-secondary" onclick="cancelMaterialForm()">Cancel</button>
      </div>
    </div>
  `;
  
  const adminContent = document.getElementById('adminContent');
  adminContent.innerHTML = html;
}

function cancelMaterialForm() {
  renderAdminPanel();
}

function saveNewMaterial() {
  const newMaterial = {
    id: 'mat_' + Date.now(),
    type: document.getElementById('matType').value,
    title: document.getElementById('matTitle').value,
    description: document.getElementById('matDesc').value,
    price: parseInt(document.getElementById('matPrice').value),
    image: document.getElementById('matImage').value || 'https://placehold.co/400x500/2c2f78/white?text=New+Material',
    category: document.getElementById('matCategory').value,
    stock: 100
  };
  
  materials.push(newMaterial);
  localStorage.setItem('gliimu_materials', JSON.stringify(materials));
  
  renderAdminPanel();
  renderMaterials(); // Refresh browse view
  alert('Material added successfully!');
}

function editMaterial(materialId) {
  const material = materials.find(m => m.id === materialId);
  if (!material) return;
  
  const html = `
    <div class="form-container" id="materialForm">
      <h3 style="margin-bottom: 20px;">Edit Material</h3>
      <div class="form-group">
        <label>Title</label>
        <input type="text" id="matTitle" value="${material.title}">
      </div>
      <div class="form-group">
        <label>Type</label>
        <select id="matType">
          <option value="book" ${material.type === 'book' ? 'selected' : ''}>Book</option>
          <option value="bundle" ${material.type === 'bundle' ? 'selected' : ''}>Bundle</option>
        </select>
      </div>
      <div class="form-group">
        <label>Category</label>
        <select id="matCategory">
          <option value="video" ${material.category === 'video' ? 'selected' : ''}>Video Production</option>
          <option value="design" ${material.category === 'design' ? 'selected' : ''}>Design</option>
          <option value="code" ${material.category === 'code' ? 'selected' : ''}>Code/Programming</option>
        </select>
      </div>
      <div class="form-group">
        <label>Price (₦)</label>
        <input type="number" id="matPrice" value="${material.price}">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="matDesc" rows="3">${material.description}</textarea>
      </div>
      <div class="form-group">
        <label>Image URL</label>
        <input type="text" id="matImage" value="${material.image}">
      </div>
      <div class="form-actions">
        <button class="btn-primary" onclick="updateMaterial('${material.id}')">Update</button>
        <button class="btn-secondary" onclick="cancelMaterialForm()">Cancel</button>
      </div>
    </div>
  `;
  
  const adminContent = document.getElementById('adminContent');
  adminContent.innerHTML = html;
}

function updateMaterial(materialId) {
  const index = materials.findIndex(m => m.id === materialId);
  if (index === -1) return;
  
  materials[index] = {
    ...materials[index],
    type: document.getElementById('matType').value,
    title: document.getElementById('matTitle').value,
    description: document.getElementById('matDesc').value,
    price: parseInt(document.getElementById('matPrice').value),
    image: document.getElementById('matImage').value,
    category: document.getElementById('matCategory').value
  };
  
  localStorage.setItem('gliimu_materials', JSON.stringify(materials));
  
  renderAdminPanel();
  renderMaterials();
  alert('Material updated successfully!');
}

function deleteMaterial(materialId) {
  if (confirm('Are you sure you want to delete this material?')) {
    materials = materials.filter(m => m.id !== materialId);
    localStorage.setItem('gliimu_materials', JSON.stringify(materials));
    renderAdminPanel();
    renderMaterials();
    alert('Material deleted successfully!');
  }
}

function updateCartCount() {
  // For future cart functionality
}

// ============================================
// THEME TOGGLE
// ============================================

function initThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  const body = document.body;
  
  function updateIcons() {
    const isDark = body.classList.contains('dark-mode');
    const sunIcon = themeToggle?.querySelector('.icon-sun');
    const moonIcon = themeToggle?.querySelector('.icon-moon');
    if (sunIcon && moonIcon) {
      sunIcon.style.display = isDark ? 'block' : 'none';
      moonIcon.style.display = isDark ? 'none' : 'block';
    }
  }
  
  updateIcons();
  
  themeToggle?.addEventListener('click', () => {
    body.classList.toggle('dark-mode');
    localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light');
    updateIcons();
  });
}

// Make functions globally available
window.switchTab = switchTab;
window.showPurchaseModal = showPurchaseModal;
window.closePurchaseModal = closePurchaseModal;
window.confirmPurchase = confirmPurchase;
window.downloadMaterial = downloadMaterial;
window.showAddMaterialForm = showAddMaterialForm;
window.saveNewMaterial = saveNewMaterial;
window.cancelMaterialForm = cancelMaterialForm;
window.editMaterial = editMaterial;
window.updateMaterial = updateMaterial;
window.deleteMaterial = deleteMaterial;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initLibrary();
  initThemeToggle();
});
