// js/pages/hub.js - Social Media Style Feed

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

let currentFilter = 'all';
let allPosts = [];
let currentUser = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Hub feed initializing...');
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  currentUser = user;
  
  // Load posts
  await loadPosts();
  
  // Setup event listeners
  setupEventListeners();
  
  // Load partials
  await loadPartials();
});

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
  const container = document.getElementById('feedContainer');
  if (!container) return;
  
  try {
    // Try to fetch from database
    const { data: posts, error } = await supabase
      .from('hub_posts')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!posts || posts.length === 0) {
      showEmptyState();
      return;
    }
    
    allPosts = posts;
    filterAndDisplayPosts();
    updateStats();
    
  } catch (error) {
    console.error('Error loading posts:', error);
    showEmptyState();
  }
}

function filterAndDisplayPosts() {
  let filtered = [...allPosts];
  
  if (currentFilter !== 'all') {
    filtered = filtered.filter(post => post.type === currentFilter);
  }
  
  displayPosts(filtered);
}

function displayPosts(posts) {
  const container = document.getElementById('feedContainer');
  if (!container) return;
  
  if (posts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-newspaper"></i>
        <h3>No posts yet</h3>
        <p>Be the first to share something with the community!</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = posts.map(post => createPostHTML(post)).join('');
  
  // Attach event listeners to new posts
  attachPostEventListeners();
}

function createPostHTML(post) {
  const date = new Date(post.created_at);
  const timeAgo = getTimeAgo(date);
  
  const typeInfo = {
    insight: { icon: 'fa-lightbulb', label: 'Insight' },
    video: { icon: 'fa-video', label: 'Video' },
    event: { icon: 'fa-calendar-alt', label: 'Event' },
    support: { icon: 'fa-hand-holding-heart', label: 'Support' }
  };
  
  const info = typeInfo[post.type] || typeInfo.insight;
  
  return `
    <div class="post-card" data-post-id="${post.id}">
      <div class="post-header">
        <div class="post-author">
          <div class="author-avatar">
            <i class="fas fa-user-circle"></i>
          </div>
          <div class="author-info">
            <span class="author-name">Community Member</span>
            <div class="post-time">
              <span>${timeAgo}</span>
              <span class="post-type-badge ${post.type}">
                <i class="fas ${info.icon}"></i> ${info.label}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="post-content">
        <h3 class="post-title">${escapeHtml(post.title)}</h3>
        <p class="post-description">${escapeHtml(post.description)}</p>
      </div>
      
      ${post.image_url ? `
        <div class="post-media">
          <img src="${post.image_url}" alt="${escapeHtml(post.title)}" loading="lazy" onclick="openImageModal('${post.image_url}')">
        </div>
      ` : ''}
      
      <div class="post-stats">
        <div class="stat-like">
          <i class="far fa-heart"></i>
          <span class="like-count">${post.likes || 0}</span>
        </div>
        <div class="stat-comment">
          <i class="far fa-comment"></i>
          <span class="comment-count">${post.comments || 0}</span>
        </div>
      </div>
      
      <div class="post-actions">
        <button class="action-btn like-btn" data-id="${post.id}">
          <i class="far fa-heart"></i>
          <span>Like</span>
        </button>
        <button class="action-btn comment-btn" data-id="${post.id}">
          <i class="far fa-comment"></i>
          <span>Comment</span>
        </button>
        <button class="action-btn share-btn" data-id="${post.id}">
          <i class="far fa-share-alt"></i>
          <span>Share</span>
        </button>
      </div>
      
      <div class="comments-section" id="comments-${post.id}" style="display: none;">
        <div class="comment-input">
          <input type="text" placeholder="Write a comment..." id="comment-input-${post.id}">
          <button onclick="submitComment('${post.id}')">Post</button>
        </div>
        <div class="comments-list" id="comments-list-${post.id}"></div>
      </div>
    </div>
  `;
}

function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function handleLike(postId) {
  if (!currentUser) {
    showToast('Please login to like posts', 'info');
    return;
  }
  
  const post = allPosts.find(p => p.id === postId);
  if (post) {
    const newLikes = (post.likes || 0) + 1;
    
    // Optimistic update
    post.likes = newLikes;
    const likeSpan = document.querySelector(`.like-btn[data-id="${postId}"] .like-count`);
    if (likeSpan) likeSpan.textContent = newLikes;
    
    // Update in database
    await supabase
      .from('hub_posts')
      .update({ likes: newLikes })
      .eq('id', postId);
    
    showToast('Post liked!', 'success');
  }
}

function toggleComments(postId) {
  const commentsSection = document.getElementById(`comments-${postId}`);
  if (commentsSection) {
    const isVisible = commentsSection.style.display === 'block';
    commentsSection.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      loadComments(postId);
    }
  }
}

async function loadComments(postId) {
  const container = document.getElementById(`comments-list-${postId}`);
  if (!container) return;
  
  try {
    const { data: comments, error } = await supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!comments || comments.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">No comments yet. Be the first!</p>';
      return;
    }
    
    container.innerHTML = comments.map(comment => `
      <div class="comment-item">
        <div class="comment-avatar">
          <i class="fas fa-user-circle"></i>
        </div>
        <div class="comment-content">
          <div class="comment-name">Community Member</div>
          <div class="comment-text">${escapeHtml(comment.comment)}</div>
          <div class="comment-time">${getTimeAgo(new Date(comment.created_at))}</div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading comments:', error);
  }
}

async function submitComment(postId) {
  if (!currentUser) {
    showToast('Please login to comment', 'info');
    return;
  }
  
  const input = document.getElementById(`comment-input-${postId}`);
  const comment = input?.value.trim();
  
  if (!comment) return;
  
  // Optimistic add
  input.value = '';
  await loadComments(postId);
  
  // Save to database
  const { error } = await supabase
    .from('post_comments')
    .insert({
      post_id: postId,
      user_id: currentUser.id,
      comment: comment,
      created_at: new Date().toISOString()
    });
  
  if (!error) {
    // Update comment count
    const post = allPosts.find(p => p.id === postId);
    if (post) {
      post.comments = (post.comments || 0) + 1;
      const commentSpan = document.querySelector(`.comment-btn[data-id="${postId}"] + .comment-count`);
      if (commentSpan) commentSpan.textContent = post.comments;
    }
    await loadComments(postId);
    showToast('Comment added!', 'success');
  }
}

async function sharePost(postId) {
  const url = `${window.location.origin}${window.location.pathname}?post=${postId}`;
  await navigator.clipboard.writeText(url);
  showToast('Link copied to clipboard!', 'success');
}

async function handlePostSubmission(event) {
  const { title, type, description, imageFile } = event.detail;
  
  if (!title || !description) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }
  
  if (!currentUser) {
    showToast('Please login to create a post', 'error');
    return;
  }
  
  let imageUrl = null;
  
  if (imageFile) {
    const fileName = `${currentUser.id}_${Date.now()}_${imageFile.name}`;
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
  
  const newPost = {
    user_id: currentUser.id,
    title: title,
    description: description,
    type: type,
    image_url: imageUrl,
    status: 'approved',
    likes: 0,
    comments: 0,
    created_at: new Date().toISOString()
  };
  
  const { data, error } = await supabase
    .from('hub_posts')
    .insert(newPost)
    .select();
  
  if (error) {
    showToast('Failed to create post. Please try again.', 'error');
    return;
  }
  
  if (data && data[0]) {
    allPosts.unshift(data[0]);
    filterAndDisplayPosts();
    updateStats();
  }
  
  showToast('Post published successfully!', 'success');
  closeCreatePostModal();
  
  // Clear form
  document.getElementById('postForm').reset();
  document.getElementById('postType').value = 'insight';
  document.getElementById('imagePreview').style.display = 'none';
}

async function updateStats() {
  const totalLikes = allPosts.reduce((sum, p) => sum + (p.likes || 0), 0);
  const totalComments = allPosts.reduce((sum, p) => sum + (p.comments || 0), 0);
  
  document.getElementById('statPosts').textContent = allPosts.length;
  document.getElementById('statLikes').textContent = totalLikes;
  document.getElementById('statComments').textContent = totalComments;
}

function showEmptyState() {
  const container = document.getElementById('feedContainer');
  if (container) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-users"></i>
        <h3>Welcome to the Community Feed!</h3>
        <p>Be the first to share something with fellow creatives.</p>
        <button class="btn-primary" onclick="document.getElementById('createPostTriggerBtn').click()" style="margin-top: 16px;">
          <i class="fas fa-plus"></i> Create First Post
        </button>
      </div>
    `;
  }
}

function attachPostEventListeners() {
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.removeEventListener('click', handleLikeClick);
    btn.addEventListener('click', handleLikeClick);
  });
  
  document.querySelectorAll('.comment-btn').forEach(btn => {
    btn.removeEventListener('click', handleCommentClick);
    btn.addEventListener('click', handleCommentClick);
  });
  
  document.querySelectorAll('.share-btn').forEach(btn => {
    btn.removeEventListener('click', handleShareClick);
    btn.addEventListener('click', handleShareClick);
  });
}

function handleLikeClick(e) {
  const btn = e.currentTarget;
  const postId = btn.dataset.id;
  handleLike(postId);
}

function handleCommentClick(e) {
  const btn = e.currentTarget;
  const postId = btn.dataset.id;
  toggleComments(postId);
}

function handleShareClick(e) {
  const btn = e.currentTarget;
  const postId = btn.dataset.id;
  sharePost(postId);
}

function setupEventListeners() {
  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      filterAndDisplayPosts();
    });
  });
  
  // Modal close
  const closeModal = document.getElementById('closeModalBtn');
  if (closeModal) {
    closeModal.addEventListener('click', closeCreatePostModal);
  }
  
  const modal = document.getElementById('createPostModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeCreatePostModal();
    });
  }
  
  // Post submission listener
  window.addEventListener('submitPost', handlePostSubmission);
}

function closeCreatePostModal() {
  document.getElementById('createPostModal').classList.remove('active');
}

// Global functions
window.submitComment = submitComment;
window.openImageModal = (imageUrl) => {
  window.open(imageUrl, '_blank');
};

// Make functions available globally
window.closeCreatePostModal = closeCreatePostModal;
