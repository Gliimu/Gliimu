// hub.js - Hub page functionality

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

// ============================================
// INITIALIZATION
// ============================================

function initHub() {
  console.log("Hub initializing...");
  
  currentUser = JSON.parse(localStorage.getItem("gliimu_user") || "null");
  
  loadHubPosts();
  setupEventListeners();
  updateStats();
  
  // Check if user is admin (for moderation)
  if (currentUser && currentUser.role === "Admin") {
    showModerationBadge();
  }
}

function loadHubPosts() {
  // For demo, use mock data
  // In production, fetch from API
  renderPosts();
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
        <button class="filter-btn" onclick="openCreatePostModal()" style="margin-top: 16px;">
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
        <span><i class="fas fa-map-marker-alt"></i> ${post.location}</span>
        <span><i class="fas fa-tag"></i> ${post.price}</span>
        <span><i class="fas fa-users"></i> ${post.seats} seats left</span>
      </div>
    `;
  } else if (post.type === "support") {
    extraContent = `
      <div class="card-meta">
        <span><i class="fas fa-chart-line"></i> Goal: ${post.goal}</span>
        <span><i class="fas fa-hand-holding-heart"></i> Raised: ${post.raised}</span>
      </div>
    `;
  } else if (post.type === "video") {
    extraContent = `
      <div class="card-meta">
        <span><i class="fas fa-clock"></i> ${post.duration}</span>
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
        <h3 class="card-title">${post.title}</h3>
        ${extraContent}
        <p class="card-description">${post.description}</p>
        
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
            <img src="${post.author.avatar}" alt="${post.author.name}" class="author-avatar">
            <div>
              <div class="author-name">${post.author.name}</div>
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

function handleLike(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const postId = btn.dataset.id;
  const post = hubPosts.find(p => p.id === postId);
  
  if (post) {
    post.likes++;
    const likeSpan = btn.querySelector(".like-count");
    if (likeSpan) likeSpan.textContent = post.likes;
    btn.classList.add("liked");
    
    // Show toast
    showToast("You liked this post!", "success");
  }
}

function handleComment(e) {
  e.stopPropagation();
  const postId = e.currentTarget.dataset.id;
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
  const url = `${window.location.origin}/hub.html?post=${postId}`;
  navigator.clipboard.writeText(url);
  showToast("Link copied to clipboard!", "success");
}

function supportCreator(postId) {
  if (!currentUser) {
    if (confirm("You need to sign in to support creators. Go to login?")) {
      window.openLoginModal();
    }
    return;
  }
  
  const amount = prompt("Enter tip amount (₦):", "500");
  if (amount && !isNaN(amount) && amount > 0) {
    showToast(`Thank you for tipping ₦${amount}! The creator has been notified.`, "success");
  }
}

// ============================================
// CREATE POST MODAL
// ============================================

function openCreatePostModal() {
  if (!currentUser) {
    if (confirm("You need to sign in to create a post. Go to login?")) {
      window.openLoginModal();
    }
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

function submitPost() {
  const title = document.getElementById("postTitle").value;
  const type = document.getElementById("postType").value;
  const description = document.getElementById("postDescription").value;
  const imageFile = document.getElementById("postImage").files[0];
  
  if (!title || !description) {
    alert("Please fill in all required fields.");
    return;
  }
  
  // Create new post object
  const newPost = {
    id: `post_${Date.now()}`,
    type: type,
    title: title,
    description: description,
    image: imageFile ? URL.createObjectURL(imageFile) : "https://via.placeholder.com/600x400?text=Pending+Review",
    videoUrl: null,
    author: {
      id: currentUser.id || currentUser.username,
      name: currentUser.name || currentUser.username,
      avatar: currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name || currentUser.username)}&background=random`
    },
    date: new Date().toISOString(),
    likes: 0,
    comments: 0,
    featured: false,
    status: "pending" // Needs admin approval
  };
  
  // Add to pending submissions
  pendingSubmissions.push(newPost);
  
  // Save to localStorage
  const allPending = JSON.parse(localStorage.getItem("gliimu_pending_posts") || "[]");
  allPending.push(newPost);
  localStorage.setItem("gliimu_pending_posts", JSON.stringify(allPending));
  
  showToast("Your post has been submitted for review. It will appear once approved.", "info");
  closeCreatePostModal();
  
  // If user is admin, auto-approve for demo
  if (currentUser.role === "Admin") {
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
// TOAST NOTIFICATION
// ============================================

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'info' ? 'info-circle' : 'exclamation-circle'}"></i>
    <span>${message}</span>
  `;
  
  toast.style.cssText = `
    position: fixed;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-card);
    color: var(--text-main);
    padding: 12px 24px;
    border-radius: 50px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.9rem;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    z-index: 1000;
    animation: fadeInUp 0.3s ease;
    border-left: 4px solid ${type === 'success' ? '#10b981' : type === 'info' ? '#3b82f6' : '#ef4444'};
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(20px)";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add animation style
if (!document.querySelector("#toast-animation")) {
  const style = document.createElement("style");
  style.id = "toast-animation";
  style.textContent = `
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
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