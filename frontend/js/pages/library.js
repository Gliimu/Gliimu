// library.js - Complete library functionality

let currentUser = null;
let currentTab = 'browse';
let materials = [];
let purchases = [];
let selectedMaterial = null;

// Mock materials data with realistic images
const mockMaterials = [
  // Books
  {
    id: 'mat_001',
    type: 'book',
    title: 'Complete Guide to Video Production',
    description: 'Master professional video production from pre-production to final delivery. Learn camera techniques, lighting, sound design, and post-production editing.',
    price: 3500,
    image: 'https://images.unsplash.com/photo-1536240474400-3f5c8c6ee9d1?w=400&h=500&fit=crop',
    category: 'video',
    stock: 50
  },
  {
    id: 'mat_002',
    type: 'book',
    title: 'UI/UX Design Mastery',
    description: 'Learn the fundamentals of user interface and experience design. Master Figma, prototyping, user research, and accessibility.',
    price: 2800,
    image: 'https://images.unsplash.com/photo-1586717791821-3f44a563fa4c?w=400&h=500&fit=crop',
    category: 'design',
    stock: 45
  },
  {
    id: 'mat_003',
    type: 'book',
    title: 'JavaScript: The Complete Guide',
    description: 'From beginner to advanced. Master JavaScript, ES6+, async programming, and modern frameworks.',
    price: 4200,
    image: 'https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?w=400&h=500&fit=crop',
    category: 'code',
    stock: 30
  },
  {
    id: 'mat_004',
    type: 'book',
    title: 'Motion Graphics with After Effects',
    description: 'Create stunning animations and motion graphics. Learn keyframing, expressions, and visual effects.',
    price: 3200,
    image: 'https://images.unsplash.com/photo-1558655146-9f40138edf9f?w=400&h=500&fit=crop',
    category: 'video',
    stock: 35
  },
  {
    id: 'mat_005',
    type: 'book',
    title: 'Branding & Identity Design',
    description: 'Build powerful brands. Learn logo design, color theory, typography, and brand strategy.',
    price: 2500,
    image: 'https://images.unsplash.com/photo-1545235617-9465d2a55698?w=400&h=500&fit=crop',
    category: 'design',
    stock: 40
  },
  {
    id: 'mat_006',
    type: 'book',
    title: 'Python for Data Science',
    description: 'Learn Python programming for data analysis, visualization, and machine learning.',
    price: 3800,
    image: 'https://images.unsplash.com/photo-1526379095098-d400fd0bf935?w=400&h=500&fit=crop',
    category: 'code',
    stock: 25
  },
  // Bundles (horizontal cards)
  {
    id: 'bun_001',
    type: 'bundle',
    title: 'Full-Stack Web Development Bundle',
    description: 'Complete web development resources including HTML, CSS, JavaScript, React, Node.js, and MongoDB. 5 courses + 10 projects + Source code.',
    price: 15000,
    image: 'https://images.unsplash.com/photo-1461749280699-6d844bd4a1c5?w=200&h=200&fit=crop',
    category: 'code',
    stock: 20,
    bundleItems: 5
  },
  {
    id: 'bun_002',
    type: 'bundle',
    title: 'Creative Media Production Pack',
    description: 'Everything you need for video and audio production. Includes templates, presets, and project files. 50+ templates + Sound effects + Presets.',
    price: 12000,
    image: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=200&h=200&fit=crop',
    category: 'video',
    stock: 15,
    bundleItems: 10
  },
  {
    id: 'bun_003',
    type: 'bundle',
    title: 'Design Resource Toolkit',
    description: 'Ultimate design resource pack with UI kits, mockups, fonts, and design systems. 100+ UI components + 50+ mockups + Fonts.',
    price: 8000,
    image: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=200&h=200&fit=crop',
    category: 'design',
    stock: 30,
    bundleItems: 8
  }
];

// ============================================
// INITIALIZATION
// ============================================

function initLibrary() {
  console.log('initLibrary called');
  
  const storedUser = localStorage.getItem('gliimu_user');
  console.log('storedUser:', storedUser);
  
  if (!storedUser) {
    window.location.href = 'index.html';
    return;
  }
  
  currentUser = JSON.parse(storedUser);
  console.log('currentUser:', currentUser);
  
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
  
  console.log('materials loaded:', materials.length);
  
  setupEventListeners();
  renderMaterials();
}

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderMaterials());
  }
  
  const categoryFilter = document.getElementById('categoryFilter');
  if (categoryFilter) {
    categoryFilter.addEventListener('change', () => renderMaterials());
  }
  
  const typeFilter = document.getElementById('typeFilter');
  if (typeFilter) {
    typeFilter.addEventListener('change', () => renderMaterials());
  }
}

// ============================================
// TAB SWITCHING
// ============================================

function switchTab(tabId) {
  console.log('switchTab called:', tabId);
  currentTab = tabId;
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    }
  });
  
  const browseContent = document.getElementById('browseContent');
  const purchasesContent = document.getElementById('purchasesContent');
  const adminContent = document.getElementById('adminContent');
  
  if (tabId === 'browse') {
    if (browseContent) browseContent.style.display = 'block';
    if (purchasesContent) purchasesContent.style.display = 'none';
    if (adminContent) adminContent.style.display = 'none';
    renderMaterials();
  } else if (tabId === 'purchases') {
    if (browseContent) browseContent.style.display = 'none';
    if (purchasesContent) purchasesContent.style.display = 'block';
    if (adminContent) adminContent.style.display = 'none';
    renderPurchases();
  } else if (tabId === 'admin') {
    if (browseContent) browseContent.style.display = 'none';
    if (purchasesContent) purchasesContent.style.display = 'none';
    if (adminContent) adminContent.style.display = 'block';
    renderAdminPanel();
  }
}

// ============================================
// RENDER MATERIALS
// ============================================

function renderMaterials() {
  console.log('renderMaterials called');
  
  const container = document.getElementById('materialsGrid');
  if (!container) {
    console.error('materialsGrid element not found!');
    return;
  }
  
  const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const categoryFilter = document.getElementById('categoryFilter')?.value || 'all';
  const typeFilter = document.getElementById('typeFilter')?.value || 'all';
  
  let filtered = [...materials];
  
  if (searchTerm) {
    filtered = filtered.filter(m => 
      m.title.toLowerCase().includes(searchTerm) || 
      m.description.toLowerCase().includes(searchTerm)
    );
  }
  
  if (categoryFilter !== 'all') {
    filtered = filtered.filter(m => m.category === categoryFilter);
  }
  
  if (typeFilter !== 'all') {
    filtered = filtered.filter(m => m.type === typeFilter);
  }
  
  console.log('Filtered materials:', filtered.length);
  
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
  
  let html = '';
  for (let i = 0; i < filtered.length; i++) {
    const material = filtered[i];
    if (material.type === 'book') {
      html += `
        <div class="book-card" onclick="showDetailModal('${material.id}')">
          <div class="book-cover">
            <img src="${material.image}" alt="${material.title}" loading="lazy">
            <div class="price-tag">₦${material.price.toLocaleString()}</div>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="bundle-card" onclick="showDetailModal('${material.id}')">
          <div class="bundle-cover">
            <img src="${material.image}" alt="${material.title}" loading="lazy" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-layer-group\\'></i>'">
          </div>
          <div class="bundle-info">
            <div class="bundle-title">${material.title}</div>
            <div class="bundle-price">₦${material.price.toLocaleString()}</div>
          </div>
        </div>
      `;
    }
  }
  
  container.innerHTML = html;
  console.log('Rendered', filtered.length, 'items');
}

// ============================================
// DETAIL MODAL
// ============================================

function showDetailModal(materialId) {
  console.log('showDetailModal called:', materialId);
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
  console.log('showPurchaseModal called:', materialId);
  purchaseMaterial = materials.find(m => m.id === materialId);
  if (!purchaseMaterial) return;
  
  const alreadyPurchased = purchases.some(p => p.materialId === purchaseMaterial.id);
  if (alreadyPurchased) {
    alert('You have already purchased this item.');
    return;
  }
  
  document.getElementById('modalTitle').textContent = purchaseMaterial.title;
  document.getElementById('modalDescription').textContent = purchaseMaterial.description;
  document.getElementById('modalPrice').textContent = `₦${purchaseMaterial.price.toLocaleString()}`;
  
  document.getElementById('purchaseModal').classList.add('active');
}

function closePurchaseModal() {
  document.getElementById('purchaseModal').classList.remove('active');
  purchaseMaterial = null;
}

function confirmPurchase() {
  if (!purchaseMaterial) return;
  
  // Mock wallet check
  const walletBalance = 25000;
  
  if (walletBalance < purchaseMaterial.price) {
    alert(`Insufficient funds!\n\nYour balance: ₦25,000\nItem price: ₦${purchaseMaterial.price.toLocaleString()}\n\nPlease top up your wallet.`);
    closePurchaseModal();
    return;
  }
  
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
  if (currentTab === 'purchases') {
    renderPurchases();
  }
}

// ============================================
// PURCHASES
// ============================================

function renderPurchases() {
  console.log('renderPurchases called');
  const container = document.getElementById('purchasesList');
  if (!container) return;
  
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
  console.log('renderAdminPanel called');
  
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
  
  document.getElementById('adminContent').innerHTML = html;
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
    image: document.getElementById('matImage').value || 'https://images.unsplash.com/photo-1536240474400-3f5c8c6ee9d1?w=400&h=500&fit=crop',
    category: document.getElementById('matCategory').value,
    stock: 100
  };
  
  materials.push(newMaterial);
  localStorage.setItem('gliimu_materials', JSON.stringify(materials));
  
  renderAdminPanel();
  renderMaterials();
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
          <option value="video" ${material.category === 'video' ? 'selected' : ''}>Video</option>
          <option value="design" ${material.category === 'design' ? 'selected' : ''}>Design</option>
          <option value="code" ${material.category === 'code' ? 'selected' : ''}>Code</option>
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
  
  document.getElementById('adminContent').innerHTML = html;
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

// Make functions globally available
window.switchTab = switchTab;
window.showDetailModal = showDetailModal;
window.closeDetailModal = closeDetailModal;
window.purchaseFromModal = purchaseFromModal;
window.closePurchaseModal = closePurchaseModal;
window.confirmPurchase = confirmPurchase;
window.closeSuccessModal = closeSuccessModal;
window.downloadMaterial = downloadMaterial;
window.showAddMaterialForm = showAddMaterialForm;
window.saveNewMaterial = saveNewMaterial;
window.cancelMaterialForm = cancelMaterialForm;
window.editMaterial = editMaterial;
window.updateMaterial = updateMaterial;
window.deleteMaterial = deleteMaterial;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM ready, initializing library...');
  initLibrary();
});
