// ================================================================
// GLIIMU MERCHANDISE - Complete Store Logic
// File: frontend/js/pages/merchandise.js
// ================================================================

import { supabase, getCurrentUser, getUserProfile } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ================================================================
// STATE
// ================================================================
const state = {
    currentUser: null,
    currentProfile: null,
    products: [],
    filteredProducts: [],
    currentCategory: 'all',
    currentSort: 'featured',
    viewMode: 'grid',
    page: 0,
    limit: 20,
    hasMore: true,
    isLoading: false,
    cart: JSON.parse(localStorage.getItem('gliimu_cart') || '[]'),
    cartTotal: 0,
    selectedProduct: null,
    quantity: 1,
    selectedSize: 'M',
    selectedColor: '#000'
};

// ================================================================
// DOM REFS
// ================================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    productGrid: $('#productGrid'),
    featuredScroll: $('#featuredScroll'),
    categoryBtns: $$('.category-btn'),
    sortSelect: $('#sortSelect'),
    viewToggle: $('#viewToggle'),
    loadMoreBtn: $('#loadMoreBtn'),
    cartCount: $('#cartCount'),
    cartSidebar: $('#cartSidebar'),
    cartOverlay: $('#cartOverlay'),
    cartItems: $('#cartItems'),
    cartEmpty: $('#cartEmpty'),
    cartFooter: $('#cartFooter'),
    cartTotal: $('#cartTotal'),
    cartClose: $('#cartClose'),
    continueShoppingBtn: $('#continueShoppingBtn'),
    checkoutBtn: $('#checkoutBtn'),
    viewCartBtn: $('#viewCartBtn'),
    navToggle: $('#navToggle'),
    navDropdown: $('#navDropdown'),
    
    // Product Modal
    productModal: $('#productModal'),
    productModalImg: $('#productModalImg'),
    productModalTitle: $('#productModalTitle'),
    productModalCategory: $('#productModalCategory'),
    productModalStock: $('#productModalStock'),
    productModalDescription: $('#productModalDescription'),
    productModalPrice: $('#productModalPrice'),
    productModalOriginal: $('#productModalOriginal'),
    productModalDiscount: $('#productModalDiscount'),
    closeProductModal: $('#closeProductModal'),
    addToCartDetail: $('#addToCartDetail'),
    qtyMinus: $('#qtyMinus'),
    qtyPlus: $('#qtyPlus'),
    qtyDisplay: $('#qtyDisplay'),
    sizeOptions: $('#sizeOptions'),
    colorOptions: $('#colorOptions'),
    
    // Share Modal
    shareModal: $('#shareModal'),
    shareCode: $('#shareCode'),
    shareReferralLink: $('#shareReferralLink'),
    
    // Stats
    totalProducts: $('#totalProducts'),
    totalCategories: $('#totalCategories'),
    totalSold: $('#totalSold'),
    
    // Reviews
    reviewsScroll: $('#reviewsScroll')
};

// ================================================================
// PRODUCT DATA
// ================================================================
const PRODUCTS = [
    // Apparel
    {
        id: 'prod_1',
        name: 'Gliimu Signature T-Shirt',
        category: 'apparel',
        price: 15000,
        originalPrice: 20000,
        discount: 25,
        image: 'https://placehold.co/600x600/2c2f78/white?text=Gliimu+Shirt',
        description: 'Premium quality cotton t-shirt with the iconic Gliimu logo. Perfect for creators who want to represent the brand in style.',
        sizes: ['S', 'M', 'L', 'XL', 'XXL'],
        colors: ['#000', '#fff', '#2c2f78', '#fbb040'],
        stock: 50,
        rating: 4.8,
        reviews: 127,
        isNew: false,
        isBestseller: true,
        tags: ['apparel', 't-shirt', 'branded']
    },
    {
        id: 'prod_2',
        name: 'Media Architect Hoodie',
        category: 'apparel',
        price: 25000,
        originalPrice: 32000,
        discount: 22,
        image: 'https://placehold.co/600x600/2c2f78/white?text=Hoodie',
        description: 'Premium hoodie with "Media Architect" embroidery. Stay warm while you create.',
        sizes: ['S', 'M', 'L', 'XL', 'XXL'],
        colors: ['#1a1c4a', '#000', '#fff'],
        stock: 35,
        rating: 4.9,
        reviews: 89,
        isNew: true,
        isBestseller: false,
        tags: ['apparel', 'hoodie', 'branded']
    },
    {
        id: 'prod_3',
        name: 'Creator Cap',
        category: 'apparel',
        price: 8000,
        originalPrice: 10000,
        discount: 20,
        image: 'https://placehold.co/600x600/2c2f78/white?text=Cap',
        description: 'Classic cap with the Gliimu logo embroidered. Adjustable fit for all.',
        sizes: ['One Size'],
        colors: ['#000', '#2c2f78', '#1a1c4a'],
        stock: 60,
        rating: 4.7,
        reviews: 45,
        isNew: false,
        isBestseller: false,
        tags: ['apparel', 'cap', 'accessory']
    },
    // Accessories
    {
        id: 'prod_4',
        name: 'Gliimu Water Bottle',
        category: 'accessories',
        price: 12000,
        originalPrice: 15000,
        discount: 20,
        image: 'https://placehold.co/600x600/2c2f78/white?text=Water+Bottle',
        description: 'Premium stainless steel water bottle with Gliimu branding. Keeps your drinks cold or hot for hours.',
        sizes: ['500ml', '750ml', '1L'],
        colors: ['#2c2f78', '#1a1c4a', '#fbb040'],
        stock: 40,
        rating: 4.6,
        reviews: 56,
        isNew: false,
        isBestseller: true,
        tags: ['accessories', 'bottle', 'hydration']
    },
    {
        id: 'prod_5',
        name: 'Creator Notebook',
        category: 'accessories',
        price: 5000,
        originalPrice: 7000,
        discount: 28,
        image: 'https://placehold.co/600x600/2c2f78/white?text=Notebook',
        description: 'Leather-bound notebook for creators. Perfect for sketching ideas, taking notes, and planning your next project.',
        sizes: ['A5', 'A4'],
        colors: ['#1a1c4a', '#000', '#2c2f78'],
        stock: 80,
        rating: 4.5,
        reviews: 34,
        isNew: true,
        isBestseller: false,
        tags: ['accessories', 'notebook', 'stationery']
    },
    // Electronics
    {
        id: 'prod_6',
        name: 'MacBook Pro 16" (M3 Max)',
        category: 'electronics',
        price: 3500000,
        originalPrice: 4000000,
        discount: 12,
        image: 'https://placehold.co/600x600/2c2f78/white?text=MacBook+Pro',
        description: 'The ultimate creator laptop. 16-inch MacBook Pro with M3 Max chip, 36GB RAM, 1TB SSD. Perfect for video editing, design, and development.',
        sizes: ['16"'],
        colors: ['#1a1c4a', '#000'],
        stock: 8,
        rating: 4.9,
        reviews: 23,
        isNew: true,
        isBestseller: true,
        tags: ['electronics', 'laptop', 'apple']
    },
    {
        id: 'prod_7',
        name: 'Sony A7 IV Camera',
        category: 'camera',
        price: 2800000,
        originalPrice: 3200000,
        discount: 12,
        image: 'https://placehold.co/600x600/2c2f78/white?text=Sony+A7+IV',
        description: 'Professional full-frame mirrorless camera. 33MP sensor, 4K 60p video, real-time tracking. The go-to camera for content creators.',
        sizes: ['Body Only', 'With Kit Lens'],
        colors: ['#000'],
        stock: 12,
        rating: 4.9,
        reviews: 67,
        isNew: false,
        isBestseller: true,
        tags: ['camera', 'sony', 'professional']
    },
    {
        id: 'prod_8',
        name: 'DJI RS 3 Pro Gimbal',
        category: 'camera',
        price: 1200000,
        originalPrice: 1500000,
        discount: 20,
        image: 'https://placehold.co/600x600/2c2f78/white?text=DJI+Gimbal',
        description: 'Professional 3-axis gimbal stabilizer for cameras. Perfect for smooth cinematic footage.',
        sizes: ['Standard'],
        colors: ['#000'],
        stock: 15,
        rating: 4.8,
        reviews: 42,
        isNew: true,
        isBestseller: false,
        tags: ['camera', 'gimbal', 'dji']
    },
    // Storage
    {
        id: 'prod_9',
        name: 'Samsung T7 Shield 1TB',
        category: 'storage',
        price: 150000,
        originalPrice: 180000,
        discount: 17,
        image: 'https://placehold.co/600x600/2c2f78/white?text=Samsung+T7',
        description: 'Portable SSD with USB 3.2, 1TB capacity. Rugged, waterproof, and dustproof. Perfect for creators on the go.',
        sizes: ['500GB', '1TB', '2TB'],
        colors: ['#000', '#1a1c4a', '#fbb040'],
        stock: 30,
        rating: 4.7,
        reviews: 89,
        isNew: false,
        isBestseller: true,
        tags: ['storage', 'ssd', 'samsung']
    },
    {
        id: 'prod_10',
        name: 'Gliimu Flash Drive 128GB',
        category: 'storage',
        price: 25000,
        originalPrice: 35000,
        discount: 28,
        image: 'https://placehold.co/600x600/2c2f78/white?text=Flash+Drive',
        description: 'Premium branded flash drive with 128GB capacity. USB 3.0 for fast file transfer. Branded with the Gliimu logo.',
        sizes: ['64GB', '128GB', '256GB'],
        colors: ['#2c2f78', '#1a1c4a', '#fbb040'],
        stock: 100,
        rating: 4.5,
        reviews: 56,
        isNew: true,
        isBestseller: false,
        tags: ['storage', 'flash-drive', 'usb']
    },
    // Bundles
    {
        id: 'prod_11',
        name: 'Creator Starter Bundle',
        category: 'bundles',
        price: 350000,
        originalPrice: 450000,
        discount: 22,
        image: 'https://placehold.co/600x600/2c2f78/white?text=Starter+Bundle',
        description: 'Everything you need to start creating. Includes: T-shirt, Notebook, Water Bottle, and Flash Drive. Save 22% when you buy together.',
        sizes: ['Standard'],
        colors: ['Mixed'],
        stock: 20,
        rating: 4.8,
        reviews: 34,
        isNew: false,
        isBestseller: true,
        tags: ['bundles', 'starter', 'kit']
    },
    {
        id: 'prod_12',
        name: 'Media Architect Pro Kit',
        category: 'bundles',
        price: 1200000,
        originalPrice: 1500000,
        discount: 20,
        image: 'https://placehold.co/600x600/2c2f78/white?text=Pro+Kit',
        description: 'The ultimate creator kit. Includes: Hoodie, MacBook Pro, Flash Drive, and Camera. Everything you need to work like a pro.',
        sizes: ['Standard'],
        colors: ['Mixed'],
        stock: 5,
        rating: 4.9,
        reviews: 12,
        isNew: true,
        isBestseller: false,
        tags: ['bundles', 'pro', 'complete']
    }
];

// ================================================================
// STICKY NAV FUNCTIONS
// ================================================================

function toggleNav(e) {
    e.stopPropagation();
    const dropdown = document.getElementById('navDropdown');
    const toggle = document.getElementById('navToggle');
    if (dropdown) dropdown.classList.toggle('open');
    if (toggle) toggle.classList.toggle('active');
}

// Close nav when clicking outside
document.addEventListener('click', function(e) {
    const nav = document.getElementById('stickyNav');
    const dropdown = document.getElementById('navDropdown');
    const toggle = document.getElementById('navToggle');
    
    if (nav && !nav.contains(e.target)) {
        if (dropdown) dropdown.classList.remove('open');
        if (toggle) toggle.classList.remove('active');
    }
});

// Close share modal when clicking outside
document.addEventListener('click', function(e) {
    const shareModal = document.getElementById('shareModal');
    if (shareModal && shareModal.style.display !== 'none' && e.target === shareModal) {
        window.closeShareModal();
    }
});

// Navigation functions - Expose to window
window.goBack = function() {
    if (document.referrer && document.referrer.includes('/user')) {
        window.history.back();
    } else {
        window.location.href = '/user';
    }
};

window.goToHub = function() {
    window.location.href = '/hub';
};

window.goToContact = function() {
    window.location.href = '/contact';
};

window.reportIssue = function() {
    showToast('📝 Report an issue? Our team will investigate.', 'info');
};

// ================================================================
// SHARE FUNCTIONS
// ================================================================

window.sharePage = function() {
    const link = window.location.href;
    document.getElementById('shareCode').textContent = 'GLI-MERCH-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    document.getElementById('shareReferralLink').textContent = link;
    document.getElementById('shareModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
};

window.closeShareModal = function() {
    document.getElementById('shareModal').style.display = 'none';
    document.body.style.overflow = '';
};

window.copyShareCode = function() {
    const code = document.getElementById('shareCode').textContent;
    navigator.clipboard.writeText(code).then(() => {
        showToast('📋 Share code copied!', 'success');
    }).catch(() => {
        const input = document.createElement('input');
        input.value = code;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('📋 Share code copied!', 'success');
    });
};

window.copyShareLink = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    navigator.clipboard.writeText(link).then(() => {
        showToast('🔗 Link copied!', 'success');
    }).catch(() => {
        const input = document.createElement('input');
        input.value = link;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('🔗 Link copied!', 'success');
    });
};

window.shareOnWhatsApp = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    const text = `Check out Gliimu Merchandise! 🛍️ Gear up like a Media Architect: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    window.closeShareModal();
};

window.shareOnTwitter = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    const text = `Check out Gliimu Merchandise! 🛍️ Gear up like a Media Architect: ${link}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
    window.closeShareModal();
};

window.shareOnLinkedIn = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    window.open(`https://linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`, '_blank');
    window.closeShareModal();
};

window.shareOnFacebook = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    window.open(`https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, '_blank');
    window.closeShareModal();
};

window.shareOnEmail = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    const subject = 'Check out Gliimu Merchandise!';
    const body = `I found some amazing gear on Gliimu Merchandise. Check it out: ${link}`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    window.closeShareModal();
};

// ================================================================
// INIT
// ================================================================
async function init() {
    console.log('🛍️ Merchandise initializing...');
    
    try {
        // Check auth
        const user = await getCurrentUser();
        if (user) {
            state.currentUser = user;
            const profile = await getUserProfile(user.id);
            state.currentProfile = profile;
        }
        
        // Load products
        state.products = PRODUCTS;
        state.filteredProducts = [...state.products];
        
        // Render
        renderProducts(state.filteredProducts);
        renderFeaturedProducts();
        renderReviews();
        updateCart();
        updateStats();
        
        // Setup event listeners
        setupEventListeners();
        
        // Cart from localStorage
        loadCart();
        
        // Make sure share modal is hidden
        if (dom.shareModal) {
            dom.shareModal.style.display = 'none';
        }
        
        console.log('✅ Merchandise initialized');
    } catch (error) {
        console.error('❌ Merchandise init error:', error);
        showToast('Failed to load merchandise', 'error');
    }
}

// ================================================================
// RENDER PRODUCTS
// ================================================================
function renderProducts(products) {
    if (!dom.productGrid) return;
    
    if (!products || products.length === 0) {
        dom.productGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem;">
                <i class="fas fa-search" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3; margin-bottom: 1rem;"></i>
                <h3 style="font-size: 1.2rem; margin-bottom: 0.5rem; color: var(--text-primary);">No Products Found</h3>
                <p style="color: var(--text-secondary);">Try adjusting your filters or search</p>
            </div>
        `;
        dom.loadMoreBtn.style.display = 'none';
        return;
    }
    
    dom.productGrid.innerHTML = products.map(product => `
        <div class="product-card" data-id="${product.id}">
            ${product.isNew ? '<span class="product-badge new">New</span>' : ''}
            ${product.isBestseller ? '<span class="product-badge bestseller">⭐ Bestseller</span>' : ''}
            ${product.discount > 0 ? `<span class="product-badge sale">-${product.discount}%</span>` : ''}
            <button class="product-wishlist" data-id="${product.id}">
                <i class="far fa-heart"></i>
            </button>
            <div class="product-card-image">
                <img src="${product.image}" alt="${product.name}" loading="lazy" />
            </div>
            <div class="product-card-body">
                <span class="product-card-category">${getCategoryIcon(product.category)} ${product.category.charAt(0).toUpperCase() + product.category.slice(1)}</span>
                <h4>${product.name}</h4>
                <div class="product-card-price">
                    <span class="current">₦${formatPrice(product.price)}</span>
                    ${product.originalPrice > product.price ? `<span class="original">₦${formatPrice(product.originalPrice)}</span>` : ''}
                    ${product.discount > 0 ? `<span class="discount">-${product.discount}%</span>` : ''}
                </div>
                <div class="product-card-footer">
                    <div class="product-rating">
                        <span class="stars">${'★'.repeat(Math.floor(product.rating))}${product.rating % 1 >= 0.5 ? '★' : ''}</span>
                        <span class="count">(${product.reviews})</span>
                    </div>
                    <button class="add-to-cart-btn" data-id="${product.id}">
                        <i class="fas fa-cart-plus"></i> Add
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    
    // Add event listeners for product cards (OPEN MODAL)
    dom.productGrid.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', function(e) {
            // Don't open modal if clicking on add-to-cart or wishlist
            if (e.target.closest('.add-to-cart-btn') || e.target.closest('.product-wishlist')) {
                return;
            }
            const id = this.dataset.id;
            openProductDetail(id);
        });
    });
    
    // Add event listeners for add-to-cart buttons
    dom.productGrid.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const id = this.dataset.id;
            const product = state.products.find(p => p.id === id);
            if (product) {
                addToCart(product);
                this.innerHTML = '<i class="fas fa-check"></i> Added';
                setTimeout(() => {
                    this.innerHTML = '<i class="fas fa-cart-plus"></i> Add';
                }, 1500);
            }
        });
    });
    
    // Add event listeners for wishlist buttons
    dom.productGrid.querySelectorAll('.product-wishlist').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            this.classList.toggle('liked');
            const icon = this.querySelector('i');
            if (this.classList.contains('liked')) {
                icon.className = 'fas fa-heart';
                showToast('❤️ Added to wishlist', 'success');
            } else {
                icon.className = 'far fa-heart';
                showToast('Removed from wishlist', 'info');
            }
        });
    });
}

// ================================================================
// RENDER FEATURED
// ================================================================
function renderFeaturedProducts() {
    if (!dom.featuredScroll) return;
    
    const featured = state.products.filter(p => p.isBestseller || p.isNew).slice(0, 6);
    
    dom.featuredScroll.innerHTML = featured.map(product => `
        <div class="product-card" data-id="${product.id}" style="flex: 0 0 auto; width: 220px; cursor: pointer;">
            ${product.isNew ? '<span class="product-badge new">New</span>' : ''}
            ${product.isBestseller ? '<span class="product-badge bestseller">⭐ Bestseller</span>' : ''}
            <div class="product-card-image" style="height: 160px;">
                <img src="${product.image}" alt="${product.name}" loading="lazy" />
            </div>
            <div class="product-card-body">
                <h4 style="font-size: 0.8rem;">${product.name}</h4>
                <div class="product-card-price">
                    <span class="current" style="font-size: 0.9rem;">₦${formatPrice(product.price)}</span>
                </div>
            </div>
        </div>
    `).join('');
    
    dom.featuredScroll.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', function() {
            const id = this.dataset.id;
            openProductDetail(id);
        });
    });
}

// ================================================================
// RENDER REVIEWS
// ================================================================
function renderReviews() {
    if (!dom.reviewsScroll) return;
    
    const reviews = [
        {
            name: 'Sarah Johnson',
            role: 'Media Architect',
            avatar: 'https://ui-avatars.com/api/?name=Sarah+Johnson&background=fbb040&color=fff',
            rating: 5,
            text: 'The quality of the merchandise is incredible. The t-shirt is my go-to for every shoot. Highly recommend!'
        },
        {
            name: 'Michael Okonkwo',
            role: 'Content Creator',
            avatar: 'https://ui-avatars.com/api/?name=Michael+Okonkwo&background=fbb040&color=fff',
            rating: 5,
            text: 'The MacBook Pro from Gliimu came perfectly configured. Best investment for my business.'
        },
        {
            name: 'Precious Adams',
            role: 'Designer',
            avatar: 'https://ui-avatars.com/api/?name=Precious+Adams&background=fbb040&color=fff',
            rating: 4,
            text: 'Love the water bottle! It keeps my water cold all day during shoots. The branding is top-notch.'
        },
        {
            name: 'David Wilson',
            role: 'Filmmaker',
            avatar: 'https://ui-avatars.com/api/?name=David+Wilson&background=fbb040&color=fff',
            rating: 5,
            text: 'The Sony A7 IV is a game changer. Gliimu had the best price and delivered quickly.'
        },
        {
            name: 'Chioma Okafor',
            role: 'Motion Designer',
            avatar: 'https://ui-avatars.com/api/?name=Chioma+Okafor&background=fbb040&color=fff',
            rating: 5,
            text: 'The hoodie is so comfortable and the embroidery is perfect. I wear it to every project meeting.'
        },
        {
            name: 'Tunde Adebayo',
            role: 'Entrepreneur',
            avatar: 'https://ui-avatars.com/api/?name=Tunde+Adebayo&background=fbb040&color=fff',
            rating: 4,
            text: 'Great value for money. The starter bundle is perfect for new creators getting into the space.'
        }
    ];
    
    dom.reviewsScroll.innerHTML = reviews.map(review => `
        <div class="review-card">
            <div class="review-header">
                <img src="${review.avatar}" alt="${review.name}" />
                <div>
                    <div class="review-name">${review.name}</div>
                    <div class="review-role">${review.role}</div>
                </div>
            </div>
            <div class="review-stars">${'★'.repeat(review.rating)}</div>
            <div class="review-text">"${review.text}"</div>
        </div>
    `).join('');
}

// ================================================================
// CART FUNCTIONS
// ================================================================
function loadCart() {
    const saved = localStorage.getItem('gliimu_cart');
    if (saved) {
        try {
            state.cart = JSON.parse(saved);
            updateCart();
        } catch (e) {
            state.cart = [];
        }
    }
}

function saveCart() {
    localStorage.setItem('gliimu_cart', JSON.stringify(state.cart));
    updateCart();
}

function addToCart(product, size = 'M', color = '#000', quantity = 1) {
    const existing = state.cart.find(item => 
        item.id === product.id && 
        item.size === size && 
        item.color === color
    );
    
    if (existing) {
        existing.quantity += quantity;
    } else {
        state.cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            size: size,
            color: color,
            quantity: quantity,
            maxStock: product.stock
        });
    }
    
    saveCart();
    showToast(`🛒 Added ${product.name} to cart!`, 'success');
}

function removeFromCart(index) {
    state.cart.splice(index, 1);
    saveCart();
}

function updateQuantity(index, delta) {
    const item = state.cart[index];
    if (!item) return;
    
    const newQty = item.quantity + delta;
    if (newQty < 1) {
        removeFromCart(index);
        return;
    }
    if (newQty > item.maxStock) {
        showToast('Not enough stock', 'error');
        return;
    }
    
    item.quantity = newQty;
    saveCart();
}

function updateCart() {
    const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    const total = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    if (dom.cartCount) dom.cartCount.textContent = count;
    if (dom.cartTotal) dom.cartTotal.textContent = `₦${formatPrice(total)}`;
    state.cartTotal = total;
    
    renderCartItems();
}

function renderCartItems() {
    if (!dom.cartItems) return;
    
    if (state.cart.length === 0) {
        dom.cartEmpty.style.display = 'block';
        dom.cartItems.style.display = 'none';
        dom.cartFooter.style.display = 'none';
        return;
    }
    
    dom.cartEmpty.style.display = 'none';
    dom.cartItems.style.display = 'block';
    dom.cartFooter.style.display = 'block';
    
    dom.cartItems.innerHTML = state.cart.map((item, index) => `
        <div class="cart-item">
            <div class="cart-item-image">
                <img src="${item.image}" alt="${item.name}" />
            </div>
            <div class="cart-item-details">
                <h4>${item.name}</h4>
                <div class="cart-item-meta">Size: ${item.size} | Color: <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${item.color}; vertical-align: middle;"></span></div>
                <div class="cart-item-price">₦${formatPrice(item.price)}</div>
                <div class="cart-item-actions">
                    <button class="qty-btn" data-index="${index}" data-delta="-1">-</button>
                    <span class="qty-display">${item.quantity}</span>
                    <button class="qty-btn" data-index="${index}" data-delta="1">+</button>
                    <button class="remove-btn" data-index="${index}"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        </div>
    `).join('');
    
    dom.cartItems.querySelectorAll('.qty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            const delta = parseInt(btn.dataset.delta);
            updateQuantity(index, delta);
        });
    });
    
    dom.cartItems.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            removeFromCart(index);
            showToast('🗑️ Item removed from cart', 'info');
        });
    });
}

// ================================================================
// PRODUCT DETAIL - FIXED
// ================================================================
function openProductDetail(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) {
        showToast('Product not found', 'error');
        return;
    }
    
    state.selectedProduct = product;
    state.quantity = 1;
    state.selectedSize = product.sizes?.[0] || 'M';
    state.selectedColor = product.colors?.[0] || '#000';
    
    // Set modal content
    dom.productModalImg.src = product.image;
    dom.productModalImg.alt = product.name;
    dom.productModalTitle.textContent = product.name;
    dom.productModalCategory.textContent = product.category.charAt(0).toUpperCase() + product.category.slice(1);
    dom.productModalStock.textContent = product.stock > 0 ? `In Stock (${product.stock})` : 'Out of Stock';
    dom.productModalStock.className = `product-stock${product.stock === 0 ? ' out-of-stock' : ''}`;
    dom.productModalDescription.textContent = product.description;
    dom.productModalPrice.textContent = `₦${formatPrice(product.price)}`;
    
    if (product.originalPrice > product.price) {
        dom.productModalOriginal.textContent = `₦${formatPrice(product.originalPrice)}`;
        dom.productModalOriginal.style.display = 'inline';
        dom.productModalDiscount.textContent = `-${product.discount}%`;
        dom.productModalDiscount.style.display = 'inline';
    } else {
        dom.productModalOriginal.style.display = 'none';
        dom.productModalDiscount.style.display = 'none';
    }
    
    // Render sizes
    const sizeGroup = document.getElementById('sizeGroup');
    if (product.sizes && product.sizes.length > 0) {
        dom.sizeOptions.innerHTML = product.sizes.map(size => `
            <button class="size-btn${size === state.selectedSize ? ' active' : ''}" data-size="${size}">${size}</button>
        `).join('');
        dom.sizeOptions.querySelectorAll('.size-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                dom.sizeOptions.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                state.selectedSize = this.dataset.size;
            });
        });
        sizeGroup.style.display = 'block';
    } else {
        sizeGroup.style.display = 'none';
    }
    
    // Render colors
    const colorGroup = document.getElementById('colorGroup');
    if (product.colors && product.colors.length > 0) {
        dom.colorOptions.innerHTML = product.colors.map(color => `
            <button class="color-btn${color === state.selectedColor ? ' active' : ''}" style="background: ${color};" data-color="${color}"></button>
        `).join('');
        dom.colorOptions.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                dom.colorOptions.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                state.selectedColor = this.dataset.color;
            });
        });
        colorGroup.style.display = 'block';
    } else {
        colorGroup.style.display = 'none';
    }
    
    dom.qtyDisplay.textContent = state.quantity;
    
    // Show modal
    dom.productModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeProductModal() {
    dom.productModal.style.display = 'none';
    document.body.style.overflow = '';
}

// ================================================================
// EVENT LISTENERS
// ================================================================
function setupEventListeners() {
    // --- Nav toggle ---
    if (dom.navToggle) {
        dom.navToggle.addEventListener('click', toggleNav);
    }
    
    // --- Category filters ---
    dom.categoryBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            dom.categoryBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            state.currentCategory = this.dataset.category;
            applyFilters();
        });
    });
    
    // --- Sort ---
    if (dom.sortSelect) {
        dom.sortSelect.addEventListener('change', function() {
            state.currentSort = this.value;
            applyFilters();
        });
    }
    
    // --- View toggle ---
    if (dom.viewToggle) {
        dom.viewToggle.addEventListener('click', function() {
            state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
            this.innerHTML = state.viewMode === 'grid' ? 
                '<i class="fas fa-th-large"></i>' : 
                '<i class="fas fa-list"></i>';
            renderProducts(state.filteredProducts);
        });
    }
    
    // --- Load more ---
    if (dom.loadMoreBtn) {
        dom.loadMoreBtn.addEventListener('click', function() {
            state.page++;
            showToast('Loading more products...', 'info');
        });
    }
    
    // --- Cart sidebar ---
    if (dom.viewCartBtn) dom.viewCartBtn.addEventListener('click', openCart);
    if (dom.cartClose) dom.cartClose.addEventListener('click', closeCart);
    if (dom.cartOverlay) dom.cartOverlay.addEventListener('click', closeCart);
    if (dom.continueShoppingBtn) dom.continueShoppingBtn.addEventListener('click', closeCart);
    
    // --- Checkout ---
    if (dom.checkoutBtn) {
        dom.checkoutBtn.addEventListener('click', function() {
            if (state.cart.length === 0) {
                showToast('Your cart is empty', 'warning');
                return;
            }
            if (!state.currentUser) {
                showToast('Please sign in to checkout', 'warning');
                window.location.href = '/signin.html';
                return;
            }
            showToast('🛍️ Proceeding to checkout...', 'success');
        });
    }
    
    // --- Product modal close ---
    if (dom.closeProductModal) {
        dom.closeProductModal.addEventListener('click', closeProductModal);
    }
    if (dom.productModal) {
        dom.productModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeProductModal();
            }
        });
    }
    
    // --- Quantity controls ---
    if (dom.qtyMinus) {
        dom.qtyMinus.addEventListener('click', function() {
            if (state.quantity > 1) {
                state.quantity--;
                dom.qtyDisplay.textContent = state.quantity;
            }
        });
    }
    if (dom.qtyPlus) {
        dom.qtyPlus.addEventListener('click', function() {
            if (state.selectedProduct && state.quantity < state.selectedProduct.stock) {
                state.quantity++;
                dom.qtyDisplay.textContent = state.quantity;
            } else {
                showToast('Not enough stock', 'error');
            }
        });
    }
    
    // --- Add to cart from detail ---
    if (dom.addToCartDetail) {
        dom.addToCartDetail.addEventListener('click', function() {
            if (!state.selectedProduct) return;
            addToCart(state.selectedProduct, state.selectedSize, state.selectedColor, state.quantity);
            closeProductModal();
        });
    }
    
    // --- Keyboard shortcuts ---
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (dom.productModal && dom.productModal.style.display === 'flex') {
                closeProductModal();
            }
            if (dom.cartSidebar && dom.cartSidebar.classList.contains('open')) {
                closeCart();
            }
            if (dom.shareModal && dom.shareModal.style.display !== 'none') {
                window.closeShareModal();
            }
        }
    });
}

// ================================================================
// UTILITY FUNCTIONS
// ================================================================
function applyFilters() {
    let filtered = [...state.products];
    
    if (state.currentCategory !== 'all') {
        filtered = filtered.filter(p => p.category === state.currentCategory);
    }
    
    switch (state.currentSort) {
        case 'newest':
            filtered.sort((a, b) => (a.isNew ? 1 : 0) - (b.isNew ? 1 : 0));
            break;
        case 'price-low':
            filtered.sort((a, b) => a.price - b.price);
            break;
        case 'price-high':
            filtered.sort((a, b) => b.price - a.price);
            break;
        case 'popular':
            filtered.sort((a, b) => b.reviews - a.reviews);
            break;
        case 'featured':
        default:
            filtered.sort((a, b) => (b.isBestseller ? 1 : 0) - (a.isBestseller ? 1 : 0));
            break;
    }
    
    state.filteredProducts = filtered;
    renderProducts(filtered);
}

function formatPrice(price) {
    return price.toLocaleString('en-US');
}

function getCategoryIcon(category) {
    const icons = {
        apparel: '👕',
        accessories: '🎒',
        electronics: '💻',
        camera: '📷',
        storage: '💾',
        bundles: '📦'
    };
    return icons[category] || '📦';
}

function openCart() {
    if (dom.cartSidebar) dom.cartSidebar.classList.add('open');
    if (dom.cartOverlay) dom.cartOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeCart() {
    if (dom.cartSidebar) dom.cartSidebar.classList.remove('open');
    if (dom.cartOverlay) dom.cartOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

function updateStats() {
    const categories = new Set(state.products.map(p => p.category));
    if (dom.totalProducts) dom.totalProducts.textContent = state.products.length;
    if (dom.totalCategories) dom.totalCategories.textContent = categories.size;
    if (dom.totalSold) dom.totalSold.textContent = '2,847';
}

// ================================================================
// PARTICLES
// ================================================================
function initParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    
    const colors = ['#fbb040', '#2c2f78', '#ffffff', '#8b5cf6'];
    
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        const size = Math.random() * 6 + 2;
        const duration = Math.random() * 25 + 15;
        const delay = Math.random() * 5;
        
        particle.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            border-radius: 50%;
            opacity: ${Math.random() * 0.4 + 0.1};
            top: ${Math.random() * 100}%;
            left: ${Math.random() * 100}%;
            animation: floatParticle ${duration}s ease-in-out infinite;
            animation-delay: ${delay}s;
        `;
        container.appendChild(particle);
    }
}

// ================================================================
// BOOT
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    initParticles();
    init();
});

export default {
    init,
    addToCart,
    removeFromCart,
    updateQuantity,
    openCart,
    closeCart,
    openProductDetail,
    closeProductModal
};
