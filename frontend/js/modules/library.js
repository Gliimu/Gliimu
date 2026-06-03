// Library Module - Handles digital marketplace

import { showToast } from './toast.js';

// Mock library data
const mockMaterials = [
  {
    id: 'lib_001',
    type: 'book',
    title: 'Complete Guide to Video Production',
    price: 3500,
    about: 'Master professional video production from pre-production to final delivery.',
    imageUrl: 'https://via.placeholder.com/300x450?text=Video+Production',
    category: 'video'
  },
  {
    id: 'lib_002',
    type: 'book',
    title: 'UI/UX Design Mastery',
    price: 2800,
    about: 'Learn the fundamentals of user interface and experience design.',
    imageUrl: 'https://via.placeholder.com/300x450?text=UI+UX+Design',
    category: 'design'
  },
  {
    id: 'lib_003',
    type: 'bundle',
    title: 'Full-Stack Web Development Bundle',
    price: 15000,
    about: 'Complete web development resources including HTML, CSS, JavaScript, React, and Node.js',
    meta: '5 courses + 10 projects',
    category: 'code'
  }
];

// Fetch all materials
export async function getMaterials() {
  try {
    // Mock API call
    return mockMaterials;
  } catch (error) {
    console.error('Get materials error:', error);
    return [];
  }
}

// Purchase a material
export async function purchaseMaterial(materialId, price) {
  const user = localStorage.getItem('gliimu_user');
  if (!user) {
    showToast('Please login to purchase', 'error');
    return false;
  }
  
  try {
    showToast(`Purchased! ₦${price} deducted from wallet`, 'success');
    return true;
  } catch (error) {
    console.error('Purchase error:', error);
    showToast('Purchase failed', 'error');
    return false;
  }
}

// Render library grid
export async function renderLibraryGrid(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const materials = await getMaterials();
  
  if (materials.length === 0) {
    container.innerHTML = '<p style="text-align:center;">No materials available</p>';
    return;
  }
  
  container.innerHTML = materials.map(item => {
    if (item.type === 'book') {
      return `
        <div class="grid-item item-book" data-id="${item.id}" data-price="${item.price}" data-title="${item.title}">
          <div class="card-cover" style="background-image: url('${item.imageUrl}');">
            <div class="price-tag">₦${item.price.toLocaleString()}</div>
          </div>
          <div class="card-info">
            <div class="card-title">${item.title}</div>
            <div class="card-meta">Click to view details</div>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="grid-item item-bundle" data-id="${item.id}" data-price="${item.price}" data-title="${item.title}">
          <div class="bundle-content">
            <div class="bundle-title">${item.title}</div>
            <div class="bundle-meta">${item.meta || 'Resource Bundle'}</div>
          </div>
          <button class="price-btn" data-id="${item.id}" data-price="${item.price}">₦${item.price.toLocaleString()}</button>
        </div>
      `;
    }
  }).join('');
  
  // Add event listeners
  document.querySelectorAll('.grid-item, .price-btn').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      const price = parseInt(el.dataset.price);
      const title = el.dataset.title;
      
      if (confirm(`Purchase "${title}" for ₦${price.toLocaleString()}?`)) {
        await purchaseMaterial(id, price);
      }
    });
  });
}