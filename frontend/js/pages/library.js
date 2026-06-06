// library.js - Subscription-based library

// ============================================
// CONFIGURATION
// ============================================

const LIBRARY_JSON_URL = 'https://raw.githubusercontent.com/Gliimu/Gliimu/main/backend/data/library.json';

let materialsData = [];
let currentUser = null;
let currentSubscription = null;
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
  
  // Get current user
  const storedUser = localStorage.getItem('gliimu_user');
  if (!storedUser) {
    // Demo user for testing
    currentUser = { id: 'demo_' + Date.now(), name: 'Demo User', email: 'demo@example.com', subscription: 'pro', subscriptionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() };
    localStorage.setItem('gliimu_user', JSON.stringify(currentUser));
  } else {
    currentUser = JSON.parse(storedUser);
    if (!currentUser.subscription) {
      currentUser.subscription = 'basic';
      currentUser.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      localStorage.setItem('gliimu_user', JSON.stringify(currentUser));
    }
  }
  
  // Load user shelf
  loadUserShelf();
  
  // Load materials
  await loadMaterials();
  
  // Setup event listeners
  setupEventListeners();
  
  // Update UI based on subscription
  updateSubscriptionUI();
}

function loadUserShelf() {
  const storedShelf = localStorage.getItem(`gliimu_shelf_${currentUser.id}`);
  if (storedShelf) {
    userShelf = JSON.parse(storedShelf);
  } else {
    userShelf = [];
  }
}

function saveUserShelf() {
  localStorage.setItem(`gliimu_shelf_${currentUser.id}`, JSON.stringify(userShelf));
  updateShelfStats();
  renderShelf();
}

// ============================================
// LOAD MATERIALS
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
// RENDER MATERIALS
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
    const addButtonText = isOnShelf ? 'On Shelf' : 'Add to Shelf';
    const addButtonDisabled = isOnShelf ? 'disabled' : '';
    
    if (m.type === 'book') {
      html += `
        <div class="book-card" data-id="${m.id}">
          <div class="book-cover">
            <img src="${m.image}" alt="${m.title}" loading="lazy" onclick="viewMaterial('${m.id}')">
            <div class="card-overlay">
              <button class="add-to-shelf-btn" onclick="event.stopPropagation(); addToShelf('${m.id}')" ${addButtonDisabled}>
                <i class="fas ${isOnShelf ? 'fa-check' : 'fa-plus'}"></i> ${addButtonText}
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
        <div class="bundle-card" data-id="${m.id}">
          <div class="bundle-cover" onclick="viewMaterial('${m.id}')">
            <img src="${m.image}" alt="${m.title}" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-layer-group\\'></i>'">
          </div>
          <div class="bundle-info">
            <div class="bundle-title" onclick="viewMaterial('${m.id}')">${m.title}</div>
            <div class="bundle-meta">${m.bundleItems || 3}+ items</div>
            <div class="bundle-actions">
              <button class="bundle-add-btn" onclick="event.stopPropagation(); addToShelf('${m.id}')" ${addButtonDisabled}>
                <i class="fas ${isOnShelf ? 'fa-check' : 'fa-plus'}"></i> ${addButtonText}
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
    document.getElementById('subscriptionTab').click();
    return;
  }
  
  if (material.type === 'bundle' && bundlesOnShelf >= limits.bundlesPerMonth) {
    alert(`You've reached your monthly limit of ${limits.bundlesPerMonth} bundle(s). Upgrade your subscription to add more.`);
    document.getElementById('subscriptionTab').click();
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
  
  showToast(`"${material.title}" added to your shelf!`, 'success');
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
    showToast(`"${material.title}" removed from shelf.`, 'info');
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
  
  // Open reader modal with content
  document.getElementById('readerTitle').textContent = material.title;
  document.getElementById('readerMeta').innerHTML = `${material.type === 'book' ? '📖 Book' : '📦 Bundle'} • ${material.category.toUpperCase()}`;
  document.getElementById('readerContent').innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <h3>${material.title}</h3>
      <p style="margin: 20px 0; color: var(--text-muted);">${material.description}</p>
      <p style="margin: 20px 0; color: var(--text-muted);">This is a preview. In production, the full content would be displayed here.</p>
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
    showToast(`Upgraded to ${plan.toUpperCase()} plan!`, 'success');
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
  if (searchInput) searchInput.addEventListener('input', renderMaterials);
  
  const categoryFilter = document.getElementById('categoryFilter');
  if (categoryFilter) categoryFilter.addEventListener('change', renderMaterials);
  
  const typeFilter = document.getElementById('typeFilter');
  if (typeFilter) typeFilter.addEventListener('change', renderMaterials);
}

// ============================================
// TOAST NOTIFICATION
// ============================================

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i> ${message}`;
  toast.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    background: var(--bg-card);
    color: var(--text-main);
    padding: 12px 20px;
    border-radius: 30px;
    z-index: 1000;
    animation: slideInRight 0.3s ease;
    box-shadow: var(--shadow-soft);
    border-left: 4px solid ${type === 'success' ? '#10b981' : '#3b82f6'};
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Add animation style
if (!document.querySelector('#toast-animation')) {
  const style = document.createElement('style');
  style.id = 'toast-animation';
  style.textContent = `@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
  document.head.appendChild(style);
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
