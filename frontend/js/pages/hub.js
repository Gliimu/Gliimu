// js/hub.js - Social Media Feed with Company Values Content

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

let currentFilter = 'all';
let allPosts = [];
let currentUser = null;

// Company values content - Default posts that showcase Gliimu's mission
const DEFAULT_POSTS = [
  {
    id: 'default_1',
    title: 'Welcome to the Gliimu Creative Community! 🎨',
    description: 'We are building Africa\'s largest community of media architects - video producers, designers, and developers. Share your journey, learn from peers, and grow together. What creative project are you working on today?',
    type: 'insight',
    image_url: null,
    likes: 156,
    comments: 34,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    status: 'approved'
  },
  {
    id: 'default_2',
    title: 'Student Spotlight: Amazing Animation Project',
    description: 'Check out this incredible 3D animation created by one of our video production students. The attention to detail, lighting, and storytelling is outstanding! Drop a comment to celebrate this achievement. 🎬✨',
    type: 'video',
    image_url: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=800',
    likes: 342,
    comments: 67,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    status: 'approved'
  },
  {
    id: 'default_3',
    title: 'Free Masterclass: Advanced Video Editing Techniques',
    description: 'Join us this Saturday for a free masterclass with industry professionals. Learn color grading, motion graphics, and professional workflow tips. Limited spots available! Register now through the link in bio. 🎥',
    type: 'event',
    image_url: 'https://images.unsplash.com/photo-1574717024453-3540563c7a4f?w=800',
    likes: 234,
    comments: 89,
    created_at: new Date(Date.now() - 172800000).toISOString(),
    status: 'approved'
  },
  {
    id: 'default_4',
    title: 'Design Trends 2025: What You Need to Know',
    description: 'From AI-powered design tools to immersive 3D experiences, discover the trends shaping the creative industry. Our design team shares insights on staying ahead in the fast-evolving world of digital design. 💡',
    type: 'insight',
    image_url: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800',
    likes: 189,
    comments: 45,
    created_at: new Date(Date.now() - 259200000).toISOString(),
    status: 'approved'
  },
  {
    id: 'default_5',
    title: 'Call for Mentors: Shape the Next Generation',
    description: 'We\'re looking for experienced creatives to mentor our students. Share your expertise in video production, UI/UX design, or web development. Make a lasting impact on aspiring media architects. 🤝',
    type: 'support',
    image_url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800',
    likes: 78,
    comments: 23,
    created_at: new Date(Date.now() - 345600000).toISOString(),
    status: 'approved'
  },
  {
    id: 'default_6',
    title: 'Portfolio Review Workshop - Get Expert Feedback',
    description: 'Present your portfolio to industry experts and receive constructive feedback. Perfect for students preparing for job applications. Happening virtually next Thursday. Save your spot! 📁✨',
    type: 'event',
    image_url: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?w=800',
    likes: 145,
    comments: 52,
    created_at: new Date(Date.now() - 432000000).toISOString(),
    status: 'approved'
  },
  {
    id: 'default_7',
    title: 'From Student to Professional: My Journey',
    description: 'Read how Sarah transitioned from a beginner to a professional video editor within 6 months at Gliimu. Her tips on consistency, networking, and building a portfolio that lands jobs. 🚀',
    type: 'insight',
    image_url: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800',
    likes: 267,
    comments: 73,
    created_at: new Date(Date.now() - 518400000).toISOString(),
    status: 'approved'
  },
  {
    id: 'default_8',
    title: 'Scholarship Opportunity: Full Tuition Coverage',
    description: 'Applications now open for the Gliimu Creative Excellence Scholarship. Open to talented students from underrepresented backgrounds. Covers full tuition and provides mentorship. Deadline: March 30th. 🎓',
    type: 'support',
    image_url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800',
    likes: 423,
    comments: 112,
    created_at: new Date(Date.now() - 604800000).toISOString(),
    status: 'approved'
  }
];

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
});

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
      // Use default posts if no data
      allPosts = [...DEFAULT_POSTS];
    } else {
      allPosts = [...posts, ...DEFAULT_POSTS.slice(0, 3)];
      // Sort by date
      allPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    
    filterAndDisplayPosts();
    updateStats();
    
  } catch (error) {
    console.error('Error loading posts:', error);
    // Fallback to default posts
    allPosts = [...DEFAULT_POSTS];
    filterAndDisplayPosts();
    updateStats();
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
        <i class="fas fa-comments"></i>
        <h3>No posts yet</h3>
        <p>Be the first to share something with the community!</p>
        <button class="btn-primary" onclick="document.getElementById('createPostTriggerBtn').click()">
          <i class="fas fa-plus"></i> Create First Post
        </button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = posts.map(post => createPostHTML(post)).join('');
  attachPostEventListeners();
}

function createPostHTML(post) {
  const date = new Date(post.created_at);
  const timeAgo = getTimeAgo(date);
  
  const typeInfo = {
    insight: { icon: 'fa-lightbulb', label: 'Insight' },
    video: { icon: 'fa-video', label: 'Project' },
    event: { icon: 'fa-calendar-alt', label: 'Event' },
    support: { icon: 'fa-hand-holding-heart', label: 'Opportunity' }
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
            <span class="author-name">Gliimu Community</span>
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
          <img src="${post.image_url}" alt="${escapeHtml(post.title)}" loading="lazy" onclick="window.open('${post.image_url}', '_blank')">
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
          <button onclick="window.submitComment && window.submitComment('${post.id}')">Post</button>
        </div>
        <div class="comments-list" id="comments-list-${post.id}">
          <p style="text-align: center; padding: 20px; color: #999;">No comments yet. Start the conversation!</p>
        </div>
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
  if (!text) return '';
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
    post.likes = newLikes;
    
    const likeSpan = document.querySelector(`.like-btn[data-id="${postId}"] .like-count`);
    if (likeSpan) likeSpan.textContent = newLikes;
    
    // Update in database if not default post
    if (!post.id.startsWith('default_')) {
      await supabase
        .from('hub_posts')
        .update({ likes: newLikes })
        .eq('id', postId);
    }
    
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
  
  // For default posts, show sample comments
  if (postId.startsWith('default_')) {
    container.innerHTML = `
      <div class="comment-item">
        <div class="comment-avatar"><i class="fas fa-user-circle"></i></div>
        <div class="comment-content">
          <div class="comment-name">Creative Student</div>
          <div class="comment-text">This is so inspiring! Thanks for sharing 🙌</div>
          <div class="comment-time">2 hours ago</div>
        </div>
      </div>
      <div class="comment-item">
        <div class="comment-avatar"><i class="fas fa-user-circle"></i></div>
        <div class="comment-content">
          <div class="comment-name">Design Mentor</div>
          <div class="comment-text">Amazing work! Keep pushing the boundaries 🎨</div>
          <div class="comment-time">1 day ago</div>
        </div>
      </div>
    `;
    return;
  }
  
  try {
    const { data: comments, error } = await supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!comments || comments.length === 0) {
      container.innerHTML = '<p style="text-align: center; padding: 20px; color: #999;">No comments yet. Be the first!</p>';
      return;
    }
    
    container.innerHTML = comments.map(comment => `
      <div class="comment-item">
        <div class="comment-avatar"><i class="fas fa-user-circle"></i></div>
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
  
  input.value = '';
  
  // For default posts, just show locally
  if (postId.startsWith('default_')) {
    const container = document.getElementById(`comments-list-${postId}`);
    if (container) {
      const newComment = `
        <div class="comment-item">
          <div class="comment-avatar"><i class="fas fa-user-circle"></i></div>
          <div class="comment-content">
            <div class="comment-name">You</div>
            <div class="comment-text">${escapeHtml(comment)}</div>
            <div class="comment-time">Just now</div>
          </div>
        </div>
      `;
      container.innerHTML = newComment + container.innerHTML;
    }
    showToast('Comment added!', 'success');
    return;
  }
  
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
  const url = `${window.location.origin}${window.location.pathname}`;
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
    id: Date.now().toString(),
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
  
  // Add to local state
  allPosts.unshift(newPost);
  filterAndDisplayPosts();
  updateStats();
  
  // Try to save to database
  const { error } = await supabase
    .from('hub_posts')
    .insert({
      user_id: currentUser.id,
      title: title,
      description: description,
      type: type,
      image_url: imageUrl,
      status: 'approved',
      created_at: new Date().toISOString()
    });
  
  if (error) {
    console.error('Error saving to database:', error);
  }
  
  showToast('Post published successfully!', 'success');
  closeCreatePostModal();
  
  // Clear form
  document.getElementById('postForm').reset();
  document.getElementById('postType').value = 'insight';
  document.getElementById('imagePreview').style.display = 'none';
}

function updateStats() {
  const totalLikes = allPosts.reduce((sum, p) => sum + (p.likes || 0), 0);
  const totalComments = allPosts.reduce((sum, p) => sum + (p.comments || 0), 0);
  
  document.getElementById('statPosts').textContent = allPosts.length;
  document.getElementById('statLikes').textContent = totalLikes;
  document.getElementById('statComments').textContent = totalComments;
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

// Make functions global
window.closeCreatePostModal = closeCreatePostModal;
window.submitComment = submitComment;
window.removeImage = window.removeImage || function() {
  const preview = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');
  const fileInput = document.getElementById('postImage');
  if (preview) preview.style.display = 'none';
  if (previewImg) previewImg.src = '';
  if (fileInput) fileInput.value = '';
};
