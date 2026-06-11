// js/pages/hub.js - Creative Feed with Gliimu Brand Identity

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';

let currentUser = null;
let allPosts = [];
let currentFilter = 'all';
let currentSearch = '';

// Default feed content with beautiful images
const DEFAULT_FEED = [
  {
    id: 'feed_1',
    type: 'video',
    title: '🎬 Motion Graphics: From Beginner to Pro',
    description: 'Watch how I created this stunning motion graphics project using After Effects. Full breakdown in comments! This is what you can achieve with dedication and the right guidance.',
    image: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=800',
    author: 'Michael Chen',
    likes: 1234,
    comments: 89,
    createdAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'feed_2',
    type: 'design',
    title: '✨ UI Design Trends That Will Dominate 2025',
    description: 'Minimalism meets maximalism. Here are the top design trends shaping the creative industry. From glassmorphism to brutalist design, here\'s what you need to know.',
    image: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800',
    author: 'Sarah Johnson',
    likes: 3421,
    comments: 156,
    createdAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 'feed_3',
    type: 'insight',
    title: '💡 From Zero to Media Architect: My Journey',
    description: '6 months ago I knew nothing about video production. Now I\'m working with major brands. Here\'s what I learned at Gliimu and how you can do it too.',
    image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800',
    author: 'David Okafor',
    likes: 5678,
    comments: 423,
    createdAt: new Date(Date.now() - 172800000).toISOString()
  },
  {
    id: 'feed_4',
    type: 'project',
    title: '🚀 Built a Streaming Platform in 30 Days',
    description: 'My final project at Gliimu - a fully functional streaming platform with React, Node.js, and Supabase. Live demo in comments!',
    image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800',
    author: 'Tunde Adebayo',
    likes: 2345,
    comments: 178,
    createdAt: new Date(Date.now() - 259200000).toISOString()
  },
  {
    id: 'feed_5',
    type: 'video',
    title: '🎨 Speed Art: Digital Painting Process',
    description: 'Watch this digital artwork come to life from sketch to final render. 3 hours compressed into 60 seconds! Tools used: Procreate + Photoshop.',
    image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800',
    author: 'Zoe Williams',
    likes: 8901,
    comments: 234,
    createdAt: new Date(Date.now() - 345600000).toISOString()
  },
  {
    id: 'feed_6',
    type: 'design',
    title: '🎯 Color Psychology in Branding',
    description: 'How the right colors can make or break your brand identity. A deep dive into color meanings, cultural associations, and practical applications.',
    image: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800',
    author: 'Grace Mbah',
    likes: 4567,
    comments: 267,
    createdAt: new Date(Date.now() - 432000000).toISOString()
  },
  {
    id: 'feed_7',
    type: 'insight',
    title: '📱 The Future of Content Creation',
    description: 'AI is changing everything. Here\'s how creators can adapt and thrive in the new era of content. Practical tips and tools you can use today.',
    image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800',
    author: 'Emeka Nwosu',
    likes: 6789,
    comments: 345,
    createdAt: new Date(Date.now() - 518400000).toISOString()
  },
  {
    id: 'feed_8',
    type: 'project',
    title: '🎮 3D Game Environment Design',
    description: 'Check out my 3D game environment created in Unity. Open for freelance work! Portfolio link in bio.',
    image: 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=800',
    author: 'Alex Hunter',
    likes: 3456,
    comments: 198,
    createdAt: new Date(Date.now() - 604800000).toISOString()
  }
];

// Leaderboard data - Top performing users by percentage
const LEADERBOARD_DATA = [
  { name: 'Michael Chen', score: 98.5, percentage: 98.5, rank: 1 },
  { name: 'Sarah Johnson', score: 95.2, percentage: 95.2, rank: 2 },
  { name: 'David Okafor', score: 92.8, percentage: 92.8, rank: 3 },
  { name: 'Tunde Adebayo', score: 88.4, percentage: 88.4, rank: 4 },
  { name: 'Zoe Williams', score: 85.1, percentage: 85.1, rank: 5 },
  { name: 'Grace Mbah', score: 82.6, percentage: 82.6, rank: 6 },
  { name: 'Emeka Nwosu', score: 79.3, percentage: 79.3, rank: 7 },
  { name: 'Alex Hunter', score: 76.8, percentage: 76.8, rank: 8 }
];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Creative Feed initializing...');
  
  const { data: { user } } = await supabase.auth.getUser();
  currentUser = user;
  
  if (currentUser) {
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    if (userName) userName.textContent = currentUser.user_metadata?.name || 'Creator';
    if (userRole) userRole.textContent = 'Student';
  }
  
  await loadFeed();
  loadLeaderboard();
  setupEventListeners();
});

function loadLeaderboard() {
  const container = document.getElementById('leaderboardList');
  if (!container) return;
  
  container.innerHTML = LEADERBOARD_DATA.map(user => `
    <div class="leaderboard-item">
      <div class="rank-badge rank-${user.rank === 1 ? '1' : user.rank === 2 ? '2' : user.rank === 3 ? '3' : 'other'}">
        ${user.rank}
      </div>
      <div class="leaderboard-avatar">
        <i class="fas fa-user-circle"></i>
      </div>
      <div class="leaderboard-info">
        <div class="leaderboard-name">${user.name}</div>
        <div class="leaderboard-score">${user.score}% completion</div>
      </div>
      <div class="leaderboard-percent">${user.percentage}%</div>
    </div>
  `).join('');
}

async function loadFeed() {
  const container = document.getElementById('feedContainer');
  if (!container) return;
  
  try {
    const { data: posts, error } = await supabase
      .from('hub_posts')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!posts || posts.length === 0) {
      allPosts = [...DEFAULT_FEED];
    } else {
      const formattedPosts = posts.map(p => ({
        id: p.id,
        type: p.type,
        title: p.title,
        description: p.description,
        image: p.image_url,
        author: p.author_name || 'Community Creator',
        likes: p.likes || 0,
        comments: p.comments || 0,
        createdAt: p.created_at
      }));
      allPosts = [...formattedPosts, ...DEFAULT_FEED];
      // Remove duplicates by id and sort
      const uniquePosts = [];
      const ids = new Set();
      for (const post of [...allPosts]) {
        if (!ids.has(post.id)) {
          ids.add(post.id);
          uniquePosts.push(post);
        }
      }
      allPosts = uniquePosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    renderFeed();
    
  } catch (error) {
    console.error('Error loading feed:', error);
    allPosts = [...DEFAULT_FEED];
    renderFeed();
  }
}

function renderFeed() {
  const container = document.getElementById('feedContainer');
  if (!container) return;
  
  let filtered = [...allPosts];
  
  if (currentFilter !== 'all') {
    filtered = filtered.filter(post => post.type === currentFilter);
  }
  
  if (currentSearch) {
    const searchLower = currentSearch.toLowerCase();
    filtered = filtered.filter(post => 
      post.title.toLowerCase().includes(searchLower) ||
      post.description.toLowerCase().includes(searchLower) ||
      post.author.toLowerCase().includes(searchLower)
    );
  }
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-compass"></i>
        <h3>No content found</h3>
        <p>Be the first to share your creative journey!</p>
        <button class="create-post-btn" onclick="document.getElementById('createPostBtn').click()" style="margin-top: 16px;">
          Create Post
        </button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filtered.map(post => createFeedCard(post)).join('');
  attachCardListeners();
}

function createFeedCard(post) {
  const timeAgo = getTimeAgo(new Date(post.createdAt));
  
  const typeIcons = {
    video: 'fa-video',
    design: 'fa-palette',
    insight: 'fa-lightbulb',
    project: 'fa-code'
  };
  
  const typeLabels = {
    video: 'Short',
    design: 'Design',
    insight: 'Insight',
    project: 'Project'
  };
  
  const icon = typeIcons[post.type] || 'fa-star';
  const label = typeLabels[post.type] || 'Creative';
  
  return `
    <div class="content-card" data-id="${post.id}" onclick="viewPostDetail('${post.id}')">
      <div class="card-media">
        <img src="${post.image}" alt="${escapeHtml(post.title)}" loading="lazy">
        <span class="card-badge">
          <i class="fas ${icon}"></i> ${label}
        </span>
      </div>
      <div class="card-content">
        <h3 class="card-title">${escapeHtml(post.title)}</h3>
        <p class="card-description">${escapeHtml(post.description.substring(0, 120))}${post.description.length > 120 ? '...' : ''}</p>
        <div class="card-footer">
          <div class="author-info">
            <div class="author-avatar">
              <i class="fas fa-user-circle"></i>
            </div>
            <div>
              <div class="author-name">${escapeHtml(post.author)}</div>
              <div class="post-time">${timeAgo}</div>
            </div>
          </div>
          <div class="engagement-actions">
            <button class="action-btn like-btn" data-id="${post.id}" onclick="event.stopPropagation()">
              <i class="far fa-heart"></i>
              <span class="like-count">${formatNumber(post.likes)}</span>
            </button>
            <button class="action-btn comment-btn" data-id="${post.id}" onclick="event.stopPropagation()">
              <i class="far fa-comment"></i>
              <span class="comment-count">${formatNumber(post.comments)}</span>
            </button>
          </div>
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

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function handleLike(postId) {
  if (!currentUser) {
    showToast('Login to like content', 'info');
    return;
  }
  
  const post = allPosts.find(p => p.id === postId);
  if (post) {
    post.likes++;
    const likeBtn = document.querySelector(`.like-btn[data-id="${postId}"]`);
    if (likeBtn) {
      likeBtn.classList.add('liked');
      likeBtn.querySelector('.like-count').textContent = formatNumber(post.likes);
      likeBtn.querySelector('i').classList.remove('far');
      likeBtn.querySelector('i').classList.add('fas');
    }
    
    if (!post.id.startsWith('feed_')) {
      await supabase
        .from('hub_posts')
        .update({ likes: post.likes })
        .eq('id', postId);
    }
  }
}

function viewPostDetail(postId) {
  const post = allPosts.find(p => p.id === postId);
  if (!post) return;
  
  const modal = document.getElementById('postDetailModal');
  const content = document.getElementById('postDetailContent');
  
  if (modal && content) {
    content.innerHTML = createDetailView(post);
    modal.classList.add('active');
  }
}

function createDetailView(post) {
  const timeAgo = getTimeAgo(new Date(post.createdAt));
  
  return `
    <div style="padding: 60px 20px 20px;">
      ${post.image ? `<img src="${post.image}" style="width: 100%; border-radius: 16px; margin-bottom: 20px;">` : ''}
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
        <div class="author-avatar" style="width: 48px; height: 48px;">
          <i class="fas fa-user-circle" style="font-size: 28px;"></i>
        </div>
        <div>
          <div style="color: var(--text-primary); font-weight: 600;">${escapeHtml(post.author)}</div>
          <div style="color: var(--text-secondary); font-size: 12px;">${timeAgo}</div>
        </div>
      </div>
      <h3 style="color: var(--text-primary); font-size: 18px; margin-bottom: 12px;">${escapeHtml(post.title)}</h3>
      <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 20px;">${escapeHtml(post.description)}</p>
      <div style="display: flex; gap: 24px; padding: 16px 0; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">
        <div style="display: flex; align-items: center; gap: 6px; color: var(--text-secondary);">
          <i class="fas fa-heart" style="color: var(--danger);"></i> ${formatNumber(post.likes)}
        </div>
        <div style="display: flex; align-items: center; gap: 6px; color: var(--text-secondary);">
          <i class="fas fa-comment"></i> ${formatNumber(post.comments)}
        </div>
      </div>
    </div>
  `;
}

async function handlePostSubmission(event) {
  const { title, type, description, imageFile } = event.detail;
  
  if (!title) {
    showToast('Please add a caption', 'error');
    return;
  }
  
  if (!currentUser) {
    showToast('Please login to post', 'error');
    return;
  }
  
  let imageUrl = imageFile ? URL.createObjectURL(imageFile) : DEFAULT_FEED[0].image;
  
  const newPost = {
    id: Date.now().toString(),
    type: type,
    title: title,
    description: description || '',
    image: imageUrl,
    author: currentUser.user_metadata?.name || 'Creator',
    likes: 0,
    comments: 0,
    createdAt: new Date().toISOString()
  };
  
  allPosts.unshift(newPost);
  renderFeed();
  showToast('Post published successfully!', 'success');
  closeCreatePostModal();
  
  document.getElementById('postForm').reset();
  document.getElementById('postType').value = 'insight';
  document.getElementById('imagePreview').style.display = 'none';
  
  // Reset type buttons
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.type === 'insight') btn.classList.add('active');
  });
}

function attachCardListeners() {
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      handleLike(btn.dataset.id);
    };
  });
}

function setupEventListeners() {
  // Category chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderFeed();
    });
  });
  
  // Search
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      renderFeed();
    });
  }
  
  // Modal close
  const closeModal = document.getElementById('closeModalBtn');
  if (closeModal) {
    closeModal.addEventListener('click', closeCreatePostModal);
  }
  
  const detailClose = document.getElementById('closeDetailModal');
  if (detailClose) {
    detailClose.addEventListener('click', () => {
      document.getElementById('postDetailModal').classList.remove('active');
    });
  }
  
  const modal = document.getElementById('createPostModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeCreatePostModal();
    });
  }
  
  const detailModal = document.getElementById('postDetailModal');
  if (detailModal) {
    detailModal.addEventListener('click', (e) => {
      if (e.target === detailModal) {
        detailModal.classList.remove('active');
      }
    });
  }
  
  const createBtn = document.getElementById('createPostBtn');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      document.getElementById('createPostModal').classList.add('active');
    });
  }
  
  window.addEventListener('submitPost', handlePostSubmission);
}

function closeCreatePostModal() {
  document.getElementById('createPostModal').classList.remove('active');
}

// Make functions global
window.closeCreatePostModal = closeCreatePostModal;
window.viewPostDetail = viewPostDetail;
window.removeImage = window.removeImage || function() {
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('previewImg').src = '';
  document.getElementById('postImage').value = '';
};
