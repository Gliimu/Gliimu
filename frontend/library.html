// library.js - Library page functionality

// ============================================
// CONFIGURATION
// ============================================

// IMPORTANT: Use the RAW GitHub URL, not the edit URL
const LIBRARY_JSON_URL = 'https://raw.githubusercontent.com/Gliimu/Gliimu/main/backend/data/library.json';

let materialsData = [];
let currentUser = null;
let userShelf = [];
let currentTab = 'browse';

// Subscription limits
const SUBSCRIPTION_LIMITS = {
  basic: { booksPerMonth: 1, bundlesPerMonth: 1, canDownload: false },
  pro: { booksPerMonth: 5, bundlesPerMonth: 6, canDownload: true },
  premium: { booksPerMonth: 999, bundlesPerMonth: 999, canDownload: true }
};

// ============================================
// INITIALIZATION
// ============================================

async function initLibrary() {
  console.log('Library initializing...');
  console.log('Fetching from:', LIBRARY_JSON_URL);
  
  // Get current user (or create demo)
  const storedUser = localStorage.getItem('gliimu_user');
  if (!storedUser) {
    currentUser = { 
      id: 'demo_' + Date.now(), 
      name: 'Demo User', 
      email: 'demo@example.com', 
      subscription: 'pro',
      subscriptionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    localStorage.setItem('gliimu_user', JSON.stringify(currentUser));
  } else {
    currentUser = JSON.parse(storedUser);
    if (!currentUser.subscription) {
      currentUser.subscription = 'basic';
      localStorage.setItem('gliimu_user', JSON.stringify(currentUser));
    }
  }
  
  // Load user shelf
  loadUserShelf();
  
  // Load materials
  await loadMaterials();
  
  // Setup event listeners
  setupEventListeners();
  
  // Update subscription UI
  updateSubscriptionUI();
}

function loadUserShelf() {
  const storedShelf = localStorage.getItem(`gliimu_shelf_${currentUser.id}`);
  userShelf = storedShelf ? JSON.parse(storedShelf) : [];
}

function saveUserShelf() {
  localStorage.setItem(`gliimu_shelf_${currentUser.id}`, JSON.stringify(userShelf));
  renderShelf();
  updateSubscriptionUI();
}

// ============================================
// LOAD MATERIALS FROM GITHUB
// ============================================

async function loadMaterials() {
  const grid = document.getElementById('materialsGrid');
  if (!grid) return;
  
  grid.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Loading materials...</p></div>';
  
  try {
    const response = await fetch(LIBRARY_JSON_URL);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Loaded materials:', data);
    
    if (data && data.materials) {
      materialsData = data.materials.filter(m => m.status === 'approved');
      renderMaterials();
    } else {
      grid.innerHTML = '<div class="empty-state"><i class="fas fa-book-open"></i><h4>No materials found</h4><p>Check back later for new resources.</p></div>';
    }
  } catch (error) {
    console.error('Error loading materials:', error);
    grid.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Error loading materials</h4><p>${error.message}<br>Check that your GitHub repo is public and the file exists at the correct path.</p></div>`;
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
  
  if (searchTerm) {
    filtered = filtered.filter(m => m.title.toLowerCase().includes(searchTerm) || m.description.toLowerCase().includes(searchTerm));
  }
  if (categoryFilter !== 'all') {
    filtered = filtered.filter(m => m.category === categoryFilter);
  }
  if (typeFilter !== 'all') {
    filtered = filtered.filter(m => m.type === typeFilter);
  }
  
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><h4>No materials found</h4><p>Try adjusting your search.</p></div>';
    return;
  }
  
  let html = '';
  for (let m of filtered) {
    const isOnShelf = userShelf.some(item => item.id === m.id);
    const addBtnText = isOnShelf ? 'On Shelf' : 'Add to Shelf';
    const addBtnDisabled = isOnShelf ? 'disabled style="opacity:0.5;"' : '';
    
    if (m.type === 'book') {
      html += `
        <div class="book-card">
          <div class="book-cover" onclick="viewMaterial('${m.id}')">
            <img src="${m.image}" alt="${m.title}" loading="lazy">
            <div class="card-overlay">
              <button class="add-to-shelf-btn" onclick="event.stopPropagation(); addToShelf('${m.id}')" ${addBtnDisabled}>
                <i class="fas ${isOnShelf ? 'fa-check' : 'fa-plus'}"></i> ${addBtnText}
              </button>
              <button class="read-btn" onclick="event.stopPropagation(); viewMaterial('${m.id}')">
                <i class="fas fa-book-open"></i> Read
              </button>
            </div>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="bundle-card">
          <div class="bundle-cover" onclick="viewMaterial('${m.id}')">
            <img src="${m.image}" alt="${m.title}" loading="lazy" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-layer-group\\'></i>'">
          </div>
          <div class="bundle-info">
            <div class="bundle-title" onclick="viewMaterial('${m.id}')">${m.title}</div>
            <div class="bundle-meta">${m.bundleItems || 3}+ items</div>
            <div class="bundle-actions">
              <button class="bundle-add-btn" onclick="event.stopPropagation(); addToShelf('${m.id}')" ${addBtnDisabled}>
                <i class="fas ${isOnShelf ? 'fa-check' : 'fa-plus'}"></i> ${addBtnText}
              </button>
              <button class="bundle-read-btn" onclick="event.stopPropagation(); viewMaterial('${m.id}')">
                <i class="fas fa-eye"></i> View
              </button>
            </div>
          </div>
        </div>
      `;
    }
  }
  
  grid.innerHTML = html;
}

// ============================================
// SHELF MANAGEMENT
// ============================================

function addToShelf(materialId) {
  const material = materialsData.find(m => m.id === materialId);
  if (!material) return;
  
  // Check if already on shelf
  if (userShelf.some(item => item.id === materialId)) {
    alert('This item is already on your shelf.');
    return;
  }
  
  // Check subscription limits
  const limits = SUBSCRIPTION_LIMITS[currentUser.subscription];
  const booksOnShelf = userShelf.filter(item => item.type === 'book').length;
  const bundlesOnShelf = userShelf.filter(item => item.type === 'bundle').length;
  
  if (material.type === 'book' && booksOnShelf >= limits.booksPerMonth) {
    alert(`You've reached your monthly limit of ${limits.booksPerMonth} book(s). Upgrade your subscription to add more.`);
    document.querySelector('.tab-btn[data-tab="subscription"]').click();
    return;
  }
  
  if (material.type === 'bundle' && bundlesOnShelf >= limits.bundlesPerMonth) {
    alert(`You've reached your monthly limit of ${limits.bundlesPerMonth} bundle(s). Upgrade your subscription to add more.`);
    document.querySelector('.tab-btn[data-tab="subscription"]').click();
    return;
  }
  
  // Add to shelf
  userShelf.push({
    id: material.id,
    title: material.title,
    type: material.type,
    image: material.image,
    description: material.description,
    category: material.category,
    addedAt: new Date().toISOString()
  });
  
  saveUserShelf();
  renderMaterials();
  renderShelf();
  updateSubscriptionUI();
  
  alert(`"${material.title}" added to your shelf!`);
}

function removeFromShelf(materialId) {
  const material = userShelf.find(item => item.id === materialId);
  if (!material) return;
  
  if (confirm(`Remove "${material.title}" from your shelf?`)) {
    userShelf = userShelf.filter(item => item.id !== materialId);
    saveUserShelf();
    renderMaterials();
    renderShelf();
    updateSubscriptionUI();
  }
}

function renderShelf() {
  const container = document.getElementById('shelfGrid');
  if (!container) return;
  
  if (userShelf.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-bookshelf"></i>
        <h4>Your shelf is empty</h4>
        <p>Browse the library and add books to your shelf.</p>
        <button class="btn-primary" onclick="switchTab('browse')">Browse Library →</button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = userShelf.map(item => `
    <div class="shelf-item" onclick="viewMaterial('${item.id}')">
      <div class="shelf-item-cover">
        <img src="${item.image}" alt="${item.title}" loading="lazy">
      </div>
      <div class="shelf-item-info">
        <div class="shelf-item-title">${item.title}</div>
        <div class="shelf-item-type">${item.type === 'book' ? '📖 Book' : '📦 Bundle'}</div>
        <button class="remove-from-shelf" onclick="event.stopPropagation(); removeFromShelf('${item.id}')">
          <i class="fas fa-trash"></i> Remove
        </button>
      </div>
    </div>
  `).join('');
}

function updateShelfStats() {
  const statsEl = document.getElementById('shelfStats');
  if (!statsEl) return;
  
  const limits = SUBSCRIPTION_LIMITS[currentUser.subscription];
  const booksOnShelf = userShelf.filter(item => item.type === 'book').length;
  const bundlesOnShelf = userShelf.filter(item => item.type === 'bundle').length;
  
  statsEl.innerHTML = `${booksOnShelf}/${limits.booksPerMonth} books • ${bundlesOnShelf}/${limits.bundlesPerMonth} bundles • ${currentUser.subscription.toUpperCase()} plan`;
}

// ============================================
// VIEW MATERIAL (READ)
// ============================================

function viewMaterial(materialId) {
  const material = materialsData.find(m => m.id === materialId);
  if (!material) return;
  
  // Check if on shelf
  if (!userShelf.some(item => item.id === materialId)) {
    if (confirm(`"${material.title}" is not on your shelf. Add it now to read?`)) {
      addToShelf(materialId);
    }
    return;
  }
  
  // Open reader modal
  document.getElementById('readerTitle').textContent = material.title;
  document.getElementById('readerMeta').innerHTML = `${material.type === 'book' ? '📖 Book' : '📦 Bundle'} • ${material.category.toUpperCase()}`;
  document.getElementById('readerContent').innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <h3>${material.title}</h3>
      <p style="margin: 20px 0; color: var(--text-muted);">${material.description}</p>
      <p style="margin: 20px 0;">This is a preview. In production, the full content would be displayed here.</p>
      <button class="btn-primary" onclick="closeReaderModal()">Close</button>
    </div>
  `;
  
  document.getElementById('readerModal').classList.add('active');
}

function closeReaderModal() {
  document.getElementById('readerModal').classList.remove('active');
}

// ============================================
// SUBSCRIPTION MANAGEMENT
// ============================================

function updateSubscriptionUI() {
  // Update banner
  const banner = document.getElementById('subscriptionBanner');
  if (banner) {
    const limits = SUBSCRIPTION_LIMITS[currentUser.subscription];
    const booksUsed = userShelf.filter(item => item.type === 'book').length;
    const bundlesUsed = userShelf.filter(item => item.type === 'bundle').length;
    
    banner.innerHTML = `
      <div class="subscription-info">
        <h3><i class="fas fa-crown"></i> ${currentUser.subscription.toUpperCase()} Plan</h3>
        <p>${booksUsed}/${limits.booksPerMonth} books used • ${bundlesUsed}/${limits.bundlesPerMonth} bundles used</p>
      </div>
      <button class="subscription-upgrade" onclick="switchTab('subscription')">
        ${currentUser.subscription === 'premium' ? 'Manage Subscription' : 'Upgrade Plan'} →
      </button>
    `;
  }
  
  // Update subscription plans page
  renderSubscriptionPlans();
  updateShelfStats();
}

function renderSubscriptionPlans() {
  const container = document.getElementById('subscriptionPlans');
  if (!container) return;
  
  const plans = [
    { name: 'Basic', price: 2500, books: 1, bundles: 1, download: false, popular: false },
    { name: 'Pro', price: 5000, books: 5, bundles: 6, download: true, popular: true },
    { name: 'Premium', price: 10000, books: 'Unlimited', bundles: 'Unlimited', download: true, popular: false }
  ];
  
  container.innerHTML = plans.map(plan => `
    <div class="plan-card ${plan.popular ? 'featured' : ''} ${currentUser.subscription === plan.name.toLowerCase() ? 'current-plan' : ''}">
      <div class="plan-name">${plan.name}</div>
      <div class="plan-price">₦${typeof plan.price === 'number' ? plan.price.toLocaleString() : plan.price}<span>/month</span></div>
      <ul class="plan-features">
        <li><i class="fas fa-check"></i> ${plan.books} ${plan.books === 1 ? 'book' : 'books'} per month</li>
        <li><i class="fas fa-check"></i> ${plan.bundles} ${plan.bundles === 1 ? 'bundle' : 'bundles'} per month</li>
        <li><i class="fas ${plan.download ? 'fa-check' : 'fa-times'}"></i> Download to device</li>
        ${plan.name === 'Premium' ? '<li><i class="fas fa-check"></i> Live workshops access</li>' : ''}
      </ul>
      ${currentUser.subscription === plan.name.toLowerCase() ? 
        '<button class="plan-btn current-plan" disabled>Current Plan</button>' :
        `<button class="plan-btn" onclick="upgradeSubscription('${plan.name.toLowerCase()}')">Upgrade to ${plan.name}</button>`
      }
    </div>
  `).join('');
}

function upgradeSubscription(plan) {
  if (confirm(`Upgrade to ${plan.toUpperCase()} plan for ${plan === 'basic' ? '₦2,500' : plan === 'pro' ? '₦5,000' : '₦10,000'}/month?`)) {
    currentUser.subscription = plan;
    currentUser.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem('gliimu_user', JSON.stringify(currentUser));
    updateSubscriptionUI();
    renderMaterials();
    alert(`Upgraded to ${plan.toUpperCase()} plan!`);
  }
}

// ============================================
// TAB SWITCHING
// ============================================

function switchTab(tabId) {
  currentTab = tabId;
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    }
  });
  
  document.getElementById('browseContent').style.display = tabId === 'browse' ? 'block' : 'none';
  document.getElementById('shelfContent').style.display = tabId === 'shelf' ? 'block' : 'none';
  document.getElementById('subscriptionContent').style.display = tabId === 'subscription' ? 'block' : 'none';
  document.getElementById('searchSection').style.display = tabId === 'browse' ? 'flex' : 'none';
  
  if (tabId === 'shelf') {
    renderShelf();
    updateShelfStats();
  }
  if (tabId === 'subscription') {
    renderSubscriptionPlans();
  }
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
// MAKE FUNCTIONS GLOBAL
// ============================================

window.viewMaterial = viewMaterial;
window.addToShelf = addToShelf;
window.removeFromShelf = removeFromShelf;
window.switchTab = switchTab;
window.closeReaderModal = closeReaderModal;
window.upgradeSubscription = upgradeSubscription;

// Initialize
document.addEventListener('DOMContentLoaded', initLibrary);
