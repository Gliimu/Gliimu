// js/pages/hub.js - Hub page functionality with Monetization

import { supabase } from '../modules/supabase.js';
import { hubMonetization } from '../modules/hub-monetization.js';
import { showToast } from '../modules/toast.js';

// State variables
let currentFilter = 'all';
let currentSearch = '';

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Hub initializing with monetization...');
  
  // Initialize monetization
  await initMonetization();
  
  // Load posts
  await loadPosts();
  
  // Setup event listeners
  setupEventListeners();
  
  // Load header and footer partials
  await loadPartials();
  
  // Update stats
  await updateStats();
  
  // Listen for post submission
  window.addEventListener('submitPost', handlePostSubmission);
});

async function initMonetization() {
  try {
    await hubMonetization.init();
    console.log('Monetization initialized');
  } catch (error) {
    console.error('Monetization error:', error);
    initMockAds();
  }
}

function initMockAds() {
  // Fallback mock ads
  const bannerAd = document.getElementById('bannerAd');
  if (bannerAd) {
    bannerAd.innerHTML = `
      <div class="banner-ad">
        <div class="sponsored-badge">Sponsored</div>
        <div class="banner-content">
          <div class="banner-text">
            <h4>🎓 Master Video Editing</h4>
            <p>Get 30% off on our professional course. Limited offer!</p>
          </div>
          <a href="#" class="banner-cta">Learn More →</a>
        </div>
      </div>
    `;
    bannerAd.classList.remove('hidden');
  }
  
  const sidebarAds = document.getElementById('sidebarAds');
  if (sidebarAds) {
    sidebarAds.innerHTML = `
      <div class="sidebar-ad">
        <img src="https://via.placeholder.com/300x200?text=Adobe+Sponsor" alt="Adobe">
        <h4>Adobe Creative Cloud</h4>
        <p>Student discount available for Gliimu members!</p>
        <a href="#" class="sidebar-ad-link">Get Offer →</a>
      </div>
      <div class="sidebar-ad">
        <img src="https://via.placeholder.com/300x200?text=Canon" alt="Canon">
        <h4>Canon Cameras</h4>
        <p>Special pricing for students</p>
        <a href="#" class="sidebar-ad-link">Shop Now →</a>
      </div>
    `;
    sidebarAds.classList.remove('hidden');
  }
  
  const affiliateLinks = document.getElementById('affiliateLinks');
  if (affiliateLinks) {
    affiliateLinks.innerHTML = `
      <div class="affiliate-header">
        <i class="fas fa-shopping-bag"></i>
        <span>Recommended for You</span>
      </div>
      <div class="affiliate-links">
        <a href="#" class="affiliate-link">
          <div class="affiliate-info">
            <div class="affiliate-title">Best Microphones for Creators</div>
            <div class="affiliate-desc">Top 5 picks under ₦50,000</div>
          </div>
          <i class="fas fa-arrow-right affiliate-arrow"></i>
        </a>
        <a href="#" class="affiliate-link">
          <div class="affiliate-info">
            <div class="affiliate-title">Laptop Buying Guide 2025</div>
            <div class="affiliate-desc">Best laptops for video editing</div>
          </div>
          <i class="fas fa-arrow-right affiliate-arrow"></i>
        </a>
      </div>
    `;
    affiliateLinks.classList.remove('hidden');
  }
}

async function loadPartials() {
  const headerPlaceholder = document.getElementById('header-placeholder');
  const footerPlaceholder = document.getElementById('footer-placeholder');
  const loginModalPlaceholder = document.getElementById('login-modal-placeholder');
  
  try {
    if (headerPlaceholder) {
      const response = await fetch('partials/header.html');
      headerPlaceholder.innerHTML = await response.text();
    }
    
    if (footerPlaceholder) {
      const response = await fetch('partials/footer.html');
      footerPlaceholder.innerHTML = await response.text();
    }
    
    if (loginModalPlaceholder) {
      const response = await fetch('partials/login-modal.html');
      loginModalPlaceholder.innerHTML = await response.text();
    }
  } catch (error) {
    console.error('Error loading partials:', error);
  }
}

async function loadPosts() {
  const container = document.getElementById('postsContainer');
  if (!container) return;
  
  try {
    const { data: posts, error } = await supabase
      .from('hub_posts')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!posts || posts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-newspaper"></i>
          <h3>No posts yet</h3>
          <p>Be the first to share something with the community!</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = posts.map(post => createPostCard(post)).join('');
    
    // Update stats
    document.getElementById('statPosts').textContent = posts.length;
    const totalLikes = posts.reduce((sum, p) => sum + (p.likes || 0), 0);
    document.getElementById('statLikes').textContent = totalLikes;
    
  } catch (error) {
    console.error('Error loading posts:', error);
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-circle"></i>
        <h3>Error loading posts</h3>
        <p>Please refresh the page to try again.</p>
      </div>
    `;
  }
}

function createPostCard(post) {
  const date = new Date(post.created_at);
  const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  const typeIcons = {
    event: 'fa-calendar-alt',
    insight: 'fa-lightbulb',
    video: 'fa-video',
    support: 'fa-hand-holding-heart'
  };
  
  const typeClasses = {
    event: 'category-event',
    insight: 'category-insight',
    video: 'category-video',
    support: 'category-support'
  };
  
  const icon = typeIcons[post.type] || 'fa-newspaper';
  const typeClass = typeClasses[post.type] || 'category-insight';
  
  return `
    <div class="content-card" data-id="${post.id}">
      <div class="card-media">
        ${post.image_url ? `<img src="${post.image_url}" alt="${escapeHtml(post.title)}">` : ''}
        <span class="category-badge ${typeClass}"><i class="fas ${icon}"></i> ${post.type}</span>
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(post.title)}</h3>
        <p class="card-description">${escapeHtml(post.description.substring(0, 150))}${post.description.length > 150 ? '...' : ''}</p>
        <div class="engagement-stats">
          <div class="engagement-item like-btn" data-id="${post.id}">
            <i class="far fa-heart"></i> <span class="like-count">${post.likes || 0}</span>
          </div>
          <div class="engagement-item comment-btn" data-id="${post.id}">
            <i class="far fa-comment"></i> <span class="comment-count">${post.comments || 0}</span>
          </div>
          <div class="engagement-item share-btn" data-id="${post.id}">
            <i class="far fa-share-alt"></i> Share
          </div>
        </div>
        <div class="card-footer">
          <div class="author-info">
            <div class="author-avatar">
              <i class="fas fa-user-circle" style="font-size: 32px;"></i>
            </div>
            <div>
              <div class="author-name">Community Member</div>
              <div class="post-date">${formattedDate}</div>
            </div>
          </div>
          <button class="tip-btn" onclick="window.supportCreator && window.supportCreator('${post.id}')">
            <i class="fas fa-coffee"></i> Tip
          </button>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function updateStats() {
  try {
    const { data: posts, error } = await supabase
      .from('hub_posts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved');
    
    if (!error && posts) {
      document.getElementById('statPosts').textContent = posts.length || 0;
    }
    
    // Get pending count for admin
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
      
      if (profile?.role === 'admin') {
        const { count } = await supabase
          .from('hub_posts')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');
        
        document.getElementById('statPending').textContent = count || 0;
      }
    }
  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

async function filterPosts(filter) {
  currentFilter = filter;
  const container = document.getElementById('postsContainer');
  if (!container) return;
  
  try {
    let query = supabase
      .from('hub_posts')
      .select('*')
      .eq('status', 'approved');
    
    if (filter !== 'all') {
      query = query.eq('type', filter);
    }
    
    const { data: posts, error } = await query.order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!posts || posts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-filter"></i>
          <h3>No posts found</h3>
          <p>Try a different filter.</p>
        </div>
      `;
    } else {
      container.innerHTML = posts.map(post => createPostCard(post)).join('');
    }
  } catch (error) {
    console.error('Error filtering posts:', error);
  }
}

async function searchPosts() {
  const searchInput = document.getElementById('searchInput');
  currentSearch = searchInput?.value || '';
  
  if (!currentSearch.trim()) {
    await loadPosts();
    return;
  }
  
  const container = document.getElementById('postsContainer');
  if (!container) return;
  
  try {
    const { data: posts, error } = await supabase
      .from('hub_posts')
      .select('*')
      .eq('status', 'approved')
      .ilike('title', `%${currentSearch}%`)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!posts || posts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-search"></i>
          <h3>No results found</h3>
          <p>Try searching with different keywords.</p>
        </div>
      `;
    } else {
      container.innerHTML = posts.map(post => createPostCard(post)).join('');
    }
  } catch (error) {
    console.error('Error searching posts:', error);
  }
}

async function handlePostSubmission(event) {
  const { title, type, description, imageFile } = event.detail;
  
  if (!title || !description) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    showToast('Please login to create a post', 'error');
    return;
  }
  
  let imageUrl = null;
  
  if (imageFile) {
    const fileName = `${user.id}_${Date.now()}_${imageFile.name}`;
    const { error } = await supabase.storage
      .from('hub-content')
      .upload(`posts/${fileName}`, imageFile);
    
    if (!error) {
      const { data: { publicUrl } } = supabase.storage
        .from('hub-content')
        .getPublicUrl(`posts/${fileName}`);
      imageUrl = publicUrl;
    }
  }
  
  const { error } = await supabase
    .from('hub_posts')
    .insert({
      user_id: user.id,
      title: title,
      description: description,
      type: type,
      image_url: imageUrl,
      status: 'pending',
      created_at: new Date().toISOString()
    });
  
  if (error) {
    showToast('Failed to submit post. Please try again.', 'error');
    return;
  }
  
  showToast('Post submitted for review!', 'success');
  window.closeCreatePostModal();
  
  // Clear form
  document.getElementById('postForm').reset();
  document.getElementById('imagePreview').style.display = 'none';
}

async function handleLike(postId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    showToast('Please login to like posts', 'info');
    return;
  }
  
  // Get current likes
  const { data: post } = await supabase
    .from('hub_posts')
    .select('likes')
    .eq('id', postId)
    .single();
  
  const newLikes = (post?.likes || 0) + 1;
  
  const { error } = await supabase
    .from('hub_posts')
    .update({ likes: newLikes })
    .eq('id', postId);
  
  if (!error) {
    // Update UI
    const likeSpan = document.querySelector(`.like-btn[data-id="${postId}"] .like-count`);
    if (likeSpan) likeSpan.textContent = newLikes;
    showToast('Post liked!', 'success');
  }
}

function setupEventListeners() {
  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      filterPosts(filter);
    });
  });
  
  // Search
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', searchPosts);
  }
  
  // Create post button
  const createBtn = document.getElementById('createPostBtn');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      document.getElementById('createPostModal').classList.add('active');
    });
  }
  
  // Close modal
  const closeModal = document.getElementById('closeModalBtn');
  if (closeModal) {
    closeModal.addEventListener('click', window.closeCreatePostModal);
  }
  
  // Modal backdrop
  const modal = document.getElementById('createPostModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) window.closeCreatePostModal();
    });
  }
  
  // Like buttons (delegation)
  document.addEventListener('click', async (e) => {
    const likeBtn = e.target.closest('.like-btn');
    if (likeBtn) {
      const postId = likeBtn.dataset.id;
      await handleLike(postId);
    }
  });
}

// Global function for tipping
window.supportCreator = async function(postId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    showToast('Please login to support creators', 'info');
    return;
  }
  
  const amount = prompt('Enter tip amount (₦):', '500');
  if (amount && !isNaN(amount) && amount > 0) {
    showToast(`Thank you for tipping ₦${amount}!`, 'success');
  }
};
