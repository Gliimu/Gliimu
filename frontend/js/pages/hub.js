// hub.js - Hub page functionality with Monetization Integration

import { supabase } from '../modules/supabase.js';
import { hubMonetization } from '../modules/hub-monetization.js';
import { showToast } from '../modules/toast.js';
import { checkPlatformAccess } from '../modules/access-guard.js';

// ============================================
// MOCK DATA
// ============================================

let hubPosts = [
  {
    id: "post_001",
    type: "event",
    title: "Gliimu Media Summit 2025",
    description: "Join industry leaders for a full day of networking, workshops, and career opportunities. Limited seats available!",
    image: "https://via.placeholder.com/600x400?text=Media+Summit",
    videoUrl: null,
    author: {
      id: "user_001",
      name: "Admin",
      avatar: "https://ui-avatars.com/api/?name=Admin&background=2c2f78&color=fff"
    },
    date: "2025-03-15T10:00:00Z",
    location: "Gliimu Campus, Abuja",
    price: "Free",
    seats: 50,
    likes: 128,
    comments: 24,
    featured: true,
    status: "approved"
  },
  {
    id: "post_002",
    type: "insight",
    title: "The Future of AI in Content Creation",
    description: "How artificial intelligence is transforming video production, design, and content strategy. A comprehensive guide for creators.",
    image: "https://via.placeholder.com/600x400?text=AI+Content",
    videoUrl: null,
    author: {
      id: "user_002",
      name: "Jane Instructor",
      avatar: "https://ui-avatars.com/api/?name=Jane+Instructor&background=8b5cf6&color=fff"
    },
    date: "2025-03-10T14:30:00Z",
    duration: "8 min read",
    likes: 89,
    comments: 12,
    featured: false,
    status: "approved"
  },
  {
    id: "post_003",
    type: "video",
    title: "Behind the Scenes: Student Project 'StreamLine'",
    description: "Watch how our students collaborated to build a streaming platform from scratch in just 3 months.",
    image: "https://via.placeholder.com/600x400?text=Student+Project",
    videoUrl: "Videos/pnp.mp4",
    author: {
      id: "user_003",
      name: "Student Spotlight",
      avatar: "https://ui-avatars.com/api/?name=Student+Spotlight&background=10b981&color=fff"
    },
    date: "2025-03-08T09:15:00Z",
    duration: "4:32 min",
    likes: 245,
    comments: 31,
    featured: false,
    status: "approved"
  },
  {
    id: "post_004",
    type: "support",
    title: "Help Us Build a Creative Hub",
    description: "Your donations help provide equipment and scholarships for talented students. Every contribution matters.",
    image: null,
    videoUrl: null,
    author: {
      id: "user_001",
      name: "Admin",
      avatar: "https://ui-avatars.com/api/?name=Admin&background=2c2f78&color=fff"
    },
    date: "2025-03-05T11:00:00Z",
    goal: "₦5,000,000",
    raised: "₦2,350,000",
    likes: 67,
    comments: 8,
    featured: false,
    status: "approved"
  },
  {
    id: "post_005",
    type: "insight",
    title: "10 Design Trends for 2025",
    description: "From minimalism to maximalism, discover the design trends that will dominate this year. Plus free resources!",
    image: "https://via.placeholder.com/600x400?text=Design+Trends",
    videoUrl: null,
    author: {
      id: "user_004",
      name: "Design Team",
      avatar: "https://ui-avatars.com/api/?name=Design+Team&background=ec4899&color=fff"
    },
    date: "2025-03-01T08:00:00Z",
    duration: "6 min read",
    likes: 156,
    comments: 19,
    featured: false,
    status: "approved"
  },
  {
    id: "post_006",
    type: "event",
    title: "Portfolio Review Workshop",
    description: "Get feedback on your portfolio from industry experts. Limited to 20 participants. Register now!",
    image: "https://via.placeholder.com/600x400?text=Portfolio+Review",
    videoUrl: null,
    author: {
      id: "user_002",
      name: "Jane Instructor",
      avatar: "https://ui-avatars.com/api/?name=Jane+Instructor&background=8b5cf6&color=fff"
    },
    date: "2025-03-20T13:00:00Z",
    location: "Virtual via Zoom",
    price: "₦2,500",
    seats: 15,
    likes: 45,
    comments: 7,
    featured: false,
    status: "approved"
  }
];

// Pending submissions (waiting for admin approval)
let pendingSubmissions = [];

// Current user
let currentUser = null;

// Current filter
let currentFilter = "all";
let currentSearch = "";

// Monetization status
let monetizationInitialized = false;
let adRefreshInterval = null;

// ============================================
// INITIALIZATION
// ============================================

async function initHub() {
  console.log("Hub initializing with monetization...");
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  currentUser = user || JSON.parse(localStorage.getItem("gliimu_user") || "null");
  
  // Hub is always free - no access check needed
  // But we still load user data if available
  
  // Load hub posts
  await loadHubPosts();
  
  // Setup event listeners
  setupEventListeners();
  
  // Update stats
  updateStats();
  
  // Initialize monetization
  await initMonetization();
  
  // Check if user is admin (for moderation)
  if (currentUser && (currentUser.role === "Admin" || currentUser.user_metadata?.role === "admin")) {
    showModerationBadge();
  }
  
  // Track page view for analytics
  trackPageView();
}

async function loadHubPosts() {
  // Try to load from Supabase first
  try {
    const { data: supabasePosts, error } = await supabase
      .from('hub_posts')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    
    if (!error && supabasePosts && supabasePosts.length > 0) {
      // Convert Supabase posts to our format
      hubPosts = supabasePosts.map(post => ({
        id: post.id,
        type: post.type,
        title: post.title,
        description: post.description,
        image: post.image_url,
        videoUrl: post.video_url,
        author: {
          id: post.user_id,
          name: post.author_name || 'Anonymous',
          avatar: post.author_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author_name || 'User')}&background=random`
        },
        date: post.created_at,
        likes: post.likes || 0,
        comments: post.comments || 0,
        featured: post.featured || false,
        status: post.status
      }));
    }
  } catch (e) {
    console.log('Using mock data for hub posts');
  }
  
  // Load pending posts from localStorage
  const storedPending = localStorage.getItem("gliimu_pending_posts");
  if (storedPending) {
    pendingSubmissions = JSON.parse(storedPending);
  }
  
  renderPosts();
}

async function initMonetization() {
  if (monetizationInitialized) return;
  
  try {
    // Initialize the monetization module
    await hubMonetization.init();
    monetizationInitialized = true;
    
    // Setup ad refresh interval (every 30 seconds for banner rotation)
    if (adRefreshInterval) clearInterval(adRefreshInterval);
    adRefreshInterval = setInterval(() => {
      if (hubMonetization.displayBannerAd) {
        hubMonetization.displayBannerAd();
      }
    }, 30000);
    
    console.log('Monetization initialized successfully');
  } catch (error) {
    console.error('Failed to initialize monetization:', error);
    // Fallback to mock ads if monetization module fails
    initMockAds();
  }
}

function initMockAds() {
  // Fallback mock ads if Supabase fails
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
  
  // Mock sidebar ads
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
  
  // Mock affiliate links
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

function trackPageView() {
  if (supabase && currentUser) {
    supabase
      .from('page_views')
      .insert({
        user_id: currentUser.id,
        page: 'hub',
        timestamp: new Date().toISOString()
      })
      .then(() => console.log('Page view tracked'))
      .catch(err => console.log('Could not track page view'));
  }
}

function renderPosts() {
  const container = document.getElementById("postsContainer");
  if (!container) return;
  
  let filteredPosts = hubPosts.filter(post => post.status === "approved");
  
  // Apply filter
  if (currentFilter !== "all") {
    filteredPosts = filteredPosts.filter(post => post.type === currentFilter);
  }
  
  // Apply search
  if (currentSearch) {
    const searchLower = currentSearch.toLowerCase();
    filteredPosts = filteredPosts.filter(post => 
      post.title.toLowerCase().includes(searchLower) ||
      post.description.toLowerCase().includes(searchLower)
    );
  }
  
  // Sort by date (newest first)
  filteredPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (filteredPosts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-newspaper"></i>
        <h3>No posts found</h3>
        <p>Be the first to share something with the community!</p>
        <button class="filter-btn" onclick="window.openCreatePostModal && window.openCreatePostModal()" style="margin-top: 16px;">
          <i class="fas fa-plus"></i> Create Post
        </button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filteredPosts.map(post => createPostCard(post)).join("");
  
  // Re-attach event listeners for dynamic elements
  attachPostEventListeners();
}

function createPostCard(post) {
  const date = new Date(post.date);
  const formattedDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  
  let categoryClass = "";
  let categoryIcon = "";
  
  switch(post.type) {
    case "event":
      categoryClass = "category-event";
      categoryIcon = "fa-calendar-alt";
      break;
    case "insight":
      categoryClass = "category-insight";
      categoryIcon = "fa-lightbulb";
      break;
    case "video":
      categoryClass = "category-video";
      categoryIcon = "fa-video";
      break;
    case "support":
      categoryClass = "category-support";
      categoryIcon = "fa-hand-holding-heart";
      break;
    default:
      categoryClass = "category-insight";
      categoryIcon = "fa-newspaper";
  }
  
  let mediaHtml = "";
  if (post.type === "video" && post.videoUrl) {
    mediaHtml = `
      <div class="card-media">
        <video src="${post.videoUrl}" poster="${post.image}" preload="metadata"></video>
        <span class="category-badge ${categoryClass}"><i class="fas ${categoryIcon}"></i> ${post.type}</span>
        ${post.featured ? '<div class="featured-badge"><i class="fas fa-star"></i> Featured</div>' : ''}
      </div>
    `;
  } else {
    mediaHtml = `
      <div class="card-media">
        <img src="${post.image || 'https://via.placeholder.com/600x400?text=No+Image'}" alt="${post.title}">
        <span class="category-badge ${categoryClass}"><i class="fas ${categoryIcon}"></i> ${post.type}</span>
        ${post.featured ? '<div class="featured-badge"><i class="fas fa-star"></i> Featured</div>' : ''}
      </div>
    `;
  }
  
  // Extra content based on type
  let extraContent = "";
  if (post.type === "event") {
    extraContent = `
      <div class="card-meta">
        <span><i class="fas fa-map-marker-alt"></i> ${post.location || 'Online'}</span>
        <span><i class="fas fa-tag"></i> ${post.price || 'Free'}</span>
        <span><i class="fas fa-users"></i> ${post.seats || 'Unlimited'} seats left</span>
      </div>
    `;
  } else if (post.type === "support") {
    extraContent = `
      <div class="card-meta">
        <span><i class="fas fa-chart-line"></i> Goal: ${post.goal || 'Not set'}</span>
        <span><i class="fas fa-hand-holding-heart"></i> Raised: ${post.raised || '₦0'}</span>
      </div>
    `;
  } else if (post.type === "video") {
    extraContent = `
      <div class="card-meta">
        <span><i class="fas fa-clock"></i> ${post.duration || "3:00 min"}</span>
      </div>
    `;
  } else {
    extraContent = `
      <div class="card-meta">
        <span><i class="fas fa-clock"></i> ${post.duration || "3 min read"}</span>
      </div>
    `;
  }
  
  return `
    <div class="content-card ${post.featured ? 'featured' : ''}" data-id="${post.id}" data-type="${post.type}">
      ${mediaHtml}
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(post.title)}</h3>
        ${extraContent}
        <p class="card-description">${escapeHtml(post.description.substring(0, 200))}${post.description.length > 200 ? '...' : ''}</p>
        
        <div class="engagement-stats">
          <div class="engagement-item like-btn" data-id="${post.id}">
            <i class="far fa-heart"></i> <span class="like-count">${post.likes}</span>
          </div>
          <div class="engagement-item comment-btn" data-id="${post.id}">
            <i class="far fa-comment"></i> <span class="comment-count">${post.comments}</span>
          </div>
          <div class="engagement-item share-btn" data-id="${post.id}">
            <i class="far fa-share-alt"></i> Share
          </div>
        </div>
        
        <div class="card-footer">
          <div class="author-info">
            <img src="${post.author.avatar}" alt="${escapeHtml(post.author.name)}" class="author-avatar">
            <div>
              <div class="author-name">${escapeHtml(post.author.name)}</div>
              <div class="post-date">${formattedDate}</div>
            </div>
          </div>
          <button class="tip-btn" data-id="${post.id}" onclick="supportCreator('${post.id}')">
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

function attachPostEventListeners() {
  // Like buttons
  document.querySelectorAll(".like-btn").forEach(btn => {
    btn.removeEventListener("click", handleLike);
    btn.addEventListener("click", handleLike);
  });
  
  // Comment buttons
  document.querySelectorAll(".comment-btn").forEach(btn => {
    btn.removeEventListener("click", handleComment);
    btn.addEventListener("click", handleComment);
  });
  
  // Share buttons
  document.querySelectorAll(".share-btn").forEach(btn => {
    btn.removeEventListener("click", handleShare);
    btn.addEventListener("click", handleShare);
  });
}

async function handleLike(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const postId = btn.dataset.id;
  const post = hubPosts.find(p => p.id === postId);
  
  if (!currentUser) {
    showToast("Please login to like posts", "info");
    if (window.openLoginModal) window.openLoginModal();
    return;
  }
  
  if (post) {
    post.likes++;
    const likeSpan = btn.querySelector(".like-count");
    if (likeSpan) likeSpan.textContent = post.likes;
    btn.classList.add("liked");
    
    // Try to save to Supabase
    try {
      await supabase
        .from('hub_posts')
        .update({ likes: post.likes })
        .eq('id', postId);
    } catch (e) {
      console.log('Could not sync like to database');
    }
    
    showToast("You liked this post!", "success");
  }
}

function handleComment(e) {
  e.stopPropagation();
  const postId = e.currentTarget.dataset.id;
  
  if (!currentUser) {
    showToast("Please login to comment", "info");
    if (window.openLoginModal) window.openLoginModal();
    return;
  }
  
  const comment = prompt("Write your comment:");
  if (comment && comment.trim()) {
    const post = hubPosts.find(p => p.id === postId);
    if (post) {
      post.comments++;
      const commentSpan = e.currentTarget.querySelector(".comment-count");
      if (commentSpan) commentSpan.textContent = post.comments;
      showToast("Comment added!", "success");
    }
  }
}

function handleShare(e) {
  e.stopPropagation();
  const postId = e.currentTarget.dataset.id;
  const url = `${window.location.origin}${window.location.pathname}?post=${postId}`;
  navigator.clipboard.writeText(url);
  showToast("Link copied to clipboard!", "success");
  
  // Track share for analytics
  if (supabase && currentUser) {
    supabase
      .from('post_shares')
      .insert({
        post_id: postId,
        user_id: currentUser.id,
        timestamp: new Date().toISOString()
      })
      .catch(err => console.log('Could not track share'));
  }
}

async function supportCreator(postId) {
  if (!currentUser) {
    showToast("Please login to support creators", "info");
    if (window.openLoginModal) window.openLoginModal();
    return;
  }
  
  const amount = prompt("Enter tip amount (₦):", "500");
  if (amount && !isNaN(amount) && amount > 0) {
    // Check wallet balance if available
    if (currentUser.wallet_balance && currentUser.wallet_balance < amount) {
      showToast("Insufficient wallet balance. Please fund your wallet.", "error");
      return;
    }
    
    showToast(`Thank you for tipping ₦${amount}! The creator has been notified.`, "success");
    
    // Track tip in database
    try {
      await supabase
        .from('tips')
        .insert({
          from_user_id: currentUser.id,
          post_id: postId,
          amount: amount,
          created_at: new Date().toISOString()
        });
    } catch (e) {
      console.log('Could not save tip record');
    }
  }
}

// ============================================
// CREATE POST MODAL
// ============================================

function openCreatePostModal() {
  if (!currentUser) {
    showToast("Please login to create a post", "info");
    if (window.openLoginModal) window.openLoginModal();
    return;
  }
  
  const modal = document.getElementById("createPostModal");
  if (modal) {
    modal.classList.add("active");
    document.getElementById("postForm").reset();
    document.getElementById("imagePreview").style.display = "none";
  }
}

function closeCreatePostModal() {
  const modal = document.getElementById("createPostModal");
  if (modal) modal.classList.remove("active");
}

function previewImage(input) {
  const preview = document.getElementById("imagePreview");
  const previewImg = document.getElementById("previewImg");
  
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      previewImg.src = e.target.result;
      preview.style.display = "block";
    };
    reader.readAsDataURL(input.files[0]);
  }
}

async function submitPost() {
  const title = document.getElementById("postTitle").value;
  const type = document.getElementById("postType").value;
  const description = document.getElementById("postDescription").value;
  const imageFile = document.getElementById("postImage").files[0];
  
  if (!title || !description) {
    showToast("Please fill in all required fields.", "error");
    return;
  }
  
  let imageUrl = null;
  
  // Upload image if provided
  if (imageFile) {
    try {
      const fileName = `${currentUser.id}_${Date.now()}_${imageFile.name}`;
      const { data, error } = await supabase.storage
        .from('hub-content')
        .upload(`posts/${fileName}`, imageFile);
      
      if (!error && data) {
        const { data: { publicUrl } } = supabase.storage
          .from('hub-content')
          .getPublicUrl(`posts/${fileName}`);
        imageUrl = publicUrl;
      }
    } catch (e) {
      console.log('Could not upload image, using placeholder');
      imageUrl = `https://via.placeholder.com/600x400?text=${encodeURIComponent(title)}`;
    }
  }
  
  // Create new post object
  const newPost = {
    id: `post_${Date.now()}`,
    type: type,
    title: title,
    description: description,
    image: imageUrl || `https://via.placeholder.com/600x400?text=Pending+Review`,
    videoUrl: null,
    author: {
      id: currentUser.id || currentUser.username,
      name: currentUser.user_metadata?.name || currentUser.name || currentUser.username,
      avatar: currentUser.user_metadata?.avatar_url || currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.user_metadata?.name || currentUser.name || currentUser.username)}&background=random`
    },
    date: new Date().toISOString(),
    likes: 0,
    comments: 0,
    featured: false,
    status: "pending" // Needs admin approval
  };
  
  // Try to save to Supabase
  try {
    const { error } = await supabase
      .from('hub_posts')
      .insert({
        id: newPost.id,
        user_id: currentUser.id,
        title: title,
        description: description,
        type: type,
        image_url: imageUrl,
        status: 'pending',
        created_at: newPost.date
      });
    
    if (error) throw error;
    showToast("Your post has been submitted for review!", "success");
  } catch (e) {
    // Fallback to localStorage
    pendingSubmissions.push(newPost);
    localStorage.setItem("gliimu_pending_posts", JSON.stringify(pendingSubmissions));
    showToast("Your post has been submitted for review. It will appear once approved.", "info");
  }
  
  closeCreatePostModal();
  
  // If user is admin, auto-approve for demo
  if (currentUser.role === "Admin" || currentUser.user_metadata?.role === "admin") {
    approvePost(newPost.id);
  }
}

function approvePost(postId) {
  const pending = [...pendingSubmissions, ...JSON.parse(localStorage.getItem("gliimu_pending_posts") || "[]")];
  const post = pending.find(p => p.id === postId);
  
  if (post) {
    post.status = "approved";
    hubPosts.unshift(post);
    renderPosts();
    showToast("Post approved and published!", "success");
    
    // Remove from pending
    const updated = pending.filter(p => p.id !== postId);
    localStorage.setItem("gliimu_pending_posts", JSON.stringify(updated));
  }
}

// ============================================
// FILTER AND SEARCH
// ============================================

function setFilter(filter) {
  currentFilter = filter;
  
  // Update active button
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.classList.remove("active");
    if (btn.dataset.filter === filter) {
      btn.classList.add("active");
    }
  });
  
  renderPosts();
}

function searchPosts() {
  const searchInput = document.getElementById("searchInput");
  currentSearch = searchInput.value;
  renderPosts();
}

// ============================================
// STATS AND MODERATION
// ============================================

function updateStats() {
  const totalPosts = hubPosts.filter(p => p.status === "approved").length;
  const totalLikes = hubPosts.reduce((sum, p) => sum + p.likes, 0);
  const pendingCount = pendingSubmissions.length + (JSON.parse(localStorage.getItem("gliimu_pending_posts") || "[]").length);
  
  const postsEl = document.getElementById("statPosts");
  const likesEl = document.getElementById("statLikes");
  const pendingEl = document.getElementById("statPending");
  
  if (postsEl) postsEl.textContent = totalPosts;
  if (likesEl) likesEl.textContent = totalLikes;
  if (pendingEl) pendingEl.textContent = pendingCount;
}

function showModerationBadge() {
  const container = document.querySelector(".stats-bar");
  if (container && !document.getElementById("moderateBtn")) {
    const btn = document.createElement("button");
    btn.id = "moderateBtn";
    btn.className = "filter-btn";
    btn.innerHTML = '<i class="fas fa-shield-alt"></i> Moderate Pending';
    btn.onclick = () => openModerationPanel();
    container.appendChild(btn);
  }
}

function openModerationPanel() {
  const pending = JSON.parse(localStorage.getItem("gliimu_pending_posts") || "[]");
  if (pending.length === 0) {
    alert("No pending posts to moderate.");
    return;
  }
  
  let message = "Pending Posts:\n\n";
  pending.forEach((post, index) => {
    message += `${index + 1}. "${post.title}" by ${post.author.name}\n`;
  });
  message += "\nEnter post number to approve (0 to cancel):";
  
  const choice = prompt(message);
  if (choice && !isNaN(choice) && choice > 0 && choice <= pending.length) {
    const selected = pending[choice - 1];
    approvePost(selected.id);
    
    // Remove from pending storage
    const updated = pending.filter(p => p.id !== selected.id);
    localStorage.setItem("gliimu_pending_posts", JSON.stringify(updated));
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  // Filter buttons
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter));
  });
  
  // Search
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", searchPosts);
  }
  
  // Create post button
  const createBtn = document.getElementById("createPostBtn");
  if (createBtn) {
    createBtn.addEventListener("click", openCreatePostModal);
  }
  
  // Modal close
  const closeModal = document.getElementById("closeModalBtn");
  if (closeModal) {
    closeModal.addEventListener("click", closeCreatePostModal);
  }
  
  // Modal backdrop click
  const modal = document.getElementById("createPostModal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeCreatePostModal();
    });
  }
}

// ============================================
// CLEANUP ON PAGE UNLOAD
// ============================================

window.addEventListener('beforeunload', () => {
  if (adRefreshInterval) {
    clearInterval(adRefreshInterval);
  }
});

// ============================================
// EXPOSE GLOBALLY
// ============================================

window.openCreatePostModal = openCreatePostModal;
window.closeCreatePostModal = closeCreatePostModal;
window.previewImage = previewImage;
window.submitPost = submitPost;
window.supportCreator = supportCreator;
window.setFilter = setFilter;
window.initHub = initHub;

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", initHub);
