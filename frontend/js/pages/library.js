// library.js - Library page functionality

// Mock library data (replace with API call later)
const mockMaterials = [
  {
    id: "lib_001",
    type: "book",
    title: "Complete Guide to Video Production",
    price: 3500,
    about: "Master professional video production from pre-production to final delivery. Learn camera techniques, lighting, sound design, and post-production editing.",
    imageUrl: "https://via.placeholder.com/300x400?text=Video+Production",
    fileUrl: "#",
    sampleUrl: "#",
    category: "video"
  },
  {
    id: "lib_002",
    type: "book",
    title: "UI/UX Design Mastery",
    price: 2800,
    about: "Learn the fundamentals of user interface and experience design. Master Figma, prototyping, user research, and accessibility.",
    imageUrl: "https://via.placeholder.com/300x400?text=UI+UX+Design",
    fileUrl: "#",
    sampleUrl: "#",
    category: "design"
  },
  {
    id: "lib_003",
    type: "book",
    title: "JavaScript: The Complete Guide",
    price: 4200,
    about: "From beginner to advanced. Master JavaScript, ES6+, async programming, and modern frameworks.",
    imageUrl: "https://via.placeholder.com/300x400?text=JavaScript",
    fileUrl: "#",
    sampleUrl: "#",
    category: "code"
  },
  {
    id: "lib_004",
    type: "bundle",
    title: "Full-Stack Web Development Bundle",
    price: 15000,
    about: "Complete web development resources including HTML, CSS, JavaScript, React, Node.js, and MongoDB.",
    meta: "5 courses + 10 projects + Source code",
    fileUrl: "#",
    category: "code"
  },
  {
    id: "lib_005",
    type: "book",
    title: "Motion Graphics with After Effects",
    price: 3200,
    about: "Create stunning animations and motion graphics. Learn keyframing, expressions, and visual effects.",
    imageUrl: "https://via.placeholder.com/300x400?text=Motion+Graphics",
    fileUrl: "#",
    sampleUrl: "#",
    category: "video"
  },
  {
    id: "lib_006",
    type: "book",
    title: "Branding & Identity Design",
    price: 2500,
    about: "Build powerful brands. Learn logo design, color theory, typography, and brand strategy.",
    imageUrl: "https://via.placeholder.com/300x400?text=Branding",
    fileUrl: "#",
    sampleUrl: "#",
    category: "design"
  },
  {
    id: "lib_007",
    type: "bundle",
    title: "Creative Media Production Pack",
    price: 12000,
    about: "Everything you need for video and audio production. Includes templates, presets, and project files.",
    meta: "50+ templates + Sound effects + Presets",
    fileUrl: "#",
    category: "video"
  },
  {
    id: "lib_008",
    type: "book",
    title: "Python for Data Science",
    price: 3800,
    about: "Learn Python programming for data analysis, visualization, and machine learning.",
    imageUrl: "https://via.placeholder.com/300x400?text=Python",
    fileUrl: "#",
    sampleUrl: "#",
    category: "code"
  }
];

// Current user (from localStorage)
let currentUser = null;

// Selected item for modal
let selectedItem = null;

// Exchange rate for currency
let exchangeRate = 1;
let userCurrency = '₦';

// ============================================
// INITIALIZATION
// ============================================

async function initLibrary() {
  console.log('Library initializing...');
  
  // Get current user
  currentUser = JSON.parse(localStorage.getItem('gliimu_user') || 'null');
  
  // Detect currency
  await detectCurrency();
  
  // Render materials grid
  await renderMaterialsGrid();
  
  // Setup search
  setupSearch();
  
  // Setup modal
  setupModal();
  
  console.log('Library initialized');
}

// ============================================
// CURRENCY DETECTION
// ============================================

async function detectCurrency() {
  try {
    const savedCurrency = localStorage.getItem('gliimu_currency');
    if (savedCurrency) {
      const data = JSON.parse(savedCurrency);
      userCurrency = data.symbol;
      exchangeRate = data.rate;
      return;
    }
    
    const response = await fetch('https://ipapi.co/json/');
    const data = await response.json();
    const country = data.country_code;
    
    if (country === 'NG') {
      exchangeRate = 1;
      userCurrency = '₦';
    } else if (country === 'GH') {
      exchangeRate = 0.05;
      userCurrency = '₵';
    } else if (country === 'KE') {
      exchangeRate = 0.8;
      userCurrency = 'KSh';
    } else {
      exchangeRate = 0.0006;
      userCurrency = '$';
    }
    
    localStorage.setItem('gliimu_currency', JSON.stringify({ symbol: userCurrency, rate: exchangeRate }));
  } catch (e) {
    console.log('Currency detection failed, defaulting to Naira');
    exchangeRate = 1;
    userCurrency = '₦';
  }
}

// ============================================
// RENDER MATERIALS GRID
// ============================================

async function renderMaterialsGrid() {
  const grid = document.getElementById('unifiedGrid');
  if (!grid) return;
  
  grid.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><h3>Loading materials...</h3></div>';
  
  try {
    // Use mock data for now (replace with API call)
    const materials = mockMaterials;
    
    if (materials.length === 0) {
      grid.innerHTML = '<div class="empty-state"><i class="fas fa-book-open"></i><h3>No materials found</h3><p>Check back later for new resources.</p></div>';
      return;
    }
    
    grid.innerHTML = '';
    
    materials.forEach(item => {
      const card = createMaterialCard(item);
      grid.appendChild(card);
    });
    
  } catch (error) {
    console.error('Error loading materials:', error);
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error loading materials</h3><p>Please try again later.</p></div>';
  }
}

function createMaterialCard(item) {
  const card = document.createElement('div');
  card.className = `grid-item ${item.type === 'book' ? 'item-book' : 'item-bundle'}`;
  card.setAttribute('data-id', item.id);
  card.setAttribute('data-title', item.title.toLowerCase());
  
  const displayPrice = `${userCurrency}${Math.floor(item.price * exchangeRate).toLocaleString()}`;
  
  if (item.type === 'book') {
    const imageUrl = item.imageUrl || 'https://via.placeholder.com/300x400?text=No+Cover';
    
    card.innerHTML = `
      <div class="card-cover" style="background-image: url('${imageUrl}');">
        <div class="price-tag">${displayPrice}</div>
      </div>
      <div class="card-info">
        <div class="card-title">${item.title}</div>
        <div class="card-meta">Click to view details</div>
      </div>
    `;
    
    card.addEventListener('click', () => openDetailsModal(item));
    
  } else {
    card.innerHTML = `
      <div class="bundle-content">
        <div class="bundle-title">${item.title}</div>
        <div class="bundle-meta">${item.meta || 'Resource Bundle'}</div>
      </div>
      <button class="price-btn" data-id="${item.id}" data-price="${item.price}">
        ${displayPrice} <i class="fas fa-arrow-right"></i>
      </button>
    `;
    
    const btn = card.querySelector('.price-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDetailsModal(item);
    });
  }
  
  return card;
}

// ============================================
// DETAILS MODAL
// ============================================

function setupModal() {
  const modal = document.getElementById('detailsModal');
  const closeBtn = document.getElementById('closeDetailsBtn');
  const buyBtn = document.getElementById('buyNowBtn');
  
  if (!modal) return;
  
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('is-visible');
      selectedItem = null;
    });
  }
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('is-visible');
      selectedItem = null;
    }
  });
  
  if (buyBtn) {
    buyBtn.addEventListener('click', () => {
      if (selectedItem) {
        purchaseMaterial(selectedItem);
      }
    });
  }
}

function openDetailsModal(item) {
  selectedItem = item;
  
  const modal = document.getElementById('detailsModal');
  const titleEl = document.getElementById('detailsTitle');
  const priceEl = document.getElementById('detailsPrice');
  const textEl = document.getElementById('detailsText');
  
  if (!modal) return;
  
  const displayPrice = `${userCurrency}${Math.floor(item.price * exchangeRate).toLocaleString()}`;
  
  if (titleEl) titleEl.textContent = item.title;
  if (priceEl) priceEl.textContent = displayPrice;
  if (textEl) textEl.textContent = item.about || 'No description available for this item.';
  
  modal.classList.add('is-visible');
}

// ============================================
// PURCHASE LOGIC
// ============================================

async function purchaseMaterial(item) {
  if (!currentUser) {
    if (confirm('You need to sign in to purchase. Go to login?')) {
      window.openLoginModal();
      closeModal('detailsModal');
    }
    return;
  }
  
  // Check wallet balance (mock for now)
  const userWallet = JSON.parse(localStorage.getItem('gliimu_wallet') || '{"balance": 25000}');
  
  if (userWallet.balance < item.price) {
    alert(`Insufficient funds!\n\nYour balance: ${userCurrency}${userWallet.balance.toLocaleString()}\nItem price: ${userCurrency}${item.price.toLocaleString()}\n\nPlease top up your wallet.`);
    return;
  }
  
  if (confirm(`Confirm purchase of "${item.title}" for ${userCurrency}${item.price.toLocaleString()}?`)) {
    // Deduct from wallet
    userWallet.balance -= item.price;
    localStorage.setItem('gliimu_wallet', JSON.stringify(userWallet));
    
    // Add transaction
    const transactions = JSON.parse(localStorage.getItem('gliimu_transactions') || '[]');
    transactions.unshift({
      id: Date.now(),
      amount: item.price,
      type: 'debit',
      description: `Purchase: ${item.title}`,
      date: new Date().toLocaleDateString(),
      status: 'approved'
    });
    localStorage.setItem('gliimu_transactions', JSON.stringify(transactions.slice(0, 50)));
    
    alert(`Purchase successful!\n\n${item.title} has been added to your library.`);
    closeModal('detailsModal');
    
    // Trigger download if file URL exists
    if (item.fileUrl && item.fileUrl !== '#') {
      window.open(item.fileUrl, '_blank');
    }
  }
}

// ============================================
// SEARCH FUNCTIONALITY
// ============================================

function setupSearch() {
  const searchInput = document.getElementById('heroSearchInput');
  const searchBtn = document.getElementById('heroSearchBtn');
  
  if (!searchInput) return;
  
  function filterMaterials() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const cards = document.querySelectorAll('.grid-item');
    
    cards.forEach(card => {
      const title = card.getAttribute('data-title') || '';
      if (searchTerm === '' || title.includes(searchTerm)) {
        card.classList.remove('hidden-by-search');
      } else {
        card.classList.add('hidden-by-search');
      }
    });
  }
  
  searchInput.addEventListener('input', filterMaterials);
  
  if (searchBtn) {
    searchBtn.addEventListener('click', filterMaterials);
  }
}

// ============================================
// UTILITIES
// ============================================

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('is-visible');
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initLibrary();
});