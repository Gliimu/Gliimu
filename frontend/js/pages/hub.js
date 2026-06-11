// js/pages/hub.js - Creative Feed (TikTok/Pinterest/Shorts Style)

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';

let currentUser = null;
let allPosts = [];
let currentTab = 'for-you';
let currentFilter = 'all';
let currentSearch = '';

// Creative feed content with company values
const DEFAULT_FEED = [
  {
    id: 'feed_1',
    type: 'video',
    title: '🎬 Motion Graphics Magic',
    description: 'Watch how I created this amazing motion graphics project using After Effects. Full tutorial coming soon!',
    image: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=600',
    videoUrl: null,
    author: 'Creative Studio',
    avatar: null,
    likes: 1234,
    comments: 89,
    shares: 234,
    createdAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'feed_2',
    type: 'design',
    title: '✨ UI Design Trends 2025',
    description: 'Minimalism meets maximalism. Here are the top design trends shaping the creative industry this year. What\'s your favorite?',
    image: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600',
    videoUrl: null,
    author: 'Design Weekly',
    avatar: null,
    likes: 3421,
    comments: 156,
    shares: 89,
    createdAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 'feed_3',
    type: 'insight',
    title: '💡 From Beginner to Pro: My Journey',
    description: '6 months ago I knew nothing about video editing. Now I\'m working with major brands. Here\'s what I learned...',
    image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=600',
    videoUrl: null,
    author: 'Sarah Creative',
    avatar: null,
    likes: 5678,
    comments: 423,
    shares: 567,
    createdAt: new Date(Date.now() - 172800000).toISOString()
  },
  {
    id: 'feed_4',
    type: 'project',
    title: '🚀 Built a Streaming Platform in 30 Days',
    description: 'My final project at Gliimu - a fully functional streaming platform with React, Node.js, and Supabase.',
    image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600',
    videoUrl: null,
    author: 'Tech Creator',
    avatar: null,
    likes: 2345,
    comments: 178,
    shares: 345,
    createdAt: new Date(Date.now() - 259200000).toISOString()
  },
  {
    id: 'feed_5',
    type: 'video',
    title: '🎨 Speed Art: Digital Painting Process',
    description: 'Watch me create this digital artwork from sketch to final render. 3 hours compressed into 60 seconds!',
    image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=600',
    videoUrl: null,
    author: 'Art Daily',
    avatar: null,
    likes: 8901,
    comments: 234,
    shares: 123,
    createdAt: new Date(Date.now() - 345600000).toISOString()
  },
  {
    id: 'feed_6',
    type: 'design',
    title: '🎯 Color Psychology in Branding',
    description: 'How the right colors can make or break your brand identity. A breakdown of color meanings and applications.',
    image: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600',
    videoUrl: null,
    author: 'Brand Master',
    avatar: null,
    likes: 4567,
    comments: 267,
    shares: 456,
    createdAt: new Date(Date.now() - 432000000).toISOString()
  },
  {
    id: 'feed_7',
    type: 'insight',
    title: '📱 The Future of Content Creation',
    description: 'AI is changing everything. Here\'s how creators can adapt and thrive in the new era of content.',
    image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600',
    videoUrl: null,
    author: 'Future Thinker',
    avatar: null,
    likes: 6789,
    comments: 345,
    shares: 789,
    createdAt: new Date(Date.now() - 518400000).toISOString()
  },
  {
    id: 'feed_8',
    type: 'project',
    title: '🎮 Game Design Portfolio',
    description: 'Check out my 3D game environment created in Unity. Open for freelance work!',
    image: 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=600',
    videoUrl: null,
    author: 'Game Dev',
    avatar: null,
    likes: 3456,
    comments: 198,
    shares: 234,
    createdAt: new Date(Date.now() - 604800000).toISOString()
  }
];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Creative Feed initializing...');
  
  const { data: { user } } = await supabase.auth.getUser();
  currentUser = user;
  
  await loadFeed();
  setupEventListeners();
});

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
        videoUrl: p.video_url,
        author: p.author_name || 'Community Creator',
        likes: p.likes || 0,
        comments: p.comments || 0,
        shares: 0,
        createdAt: p.created_at
      }));
      allPosts = [...formattedPosts, ...DEFAULT_FEED.slice(0, 4)];
      allPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
  
  // Apply filter
  if (currentFilter !== 'all') {
    filtered = filtered.filter(post => post.type === currentFilter);
  }
  
  // Apply search
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
        <p>No content found. Be the first to create!</p>
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
  
  // Video/Shorts style card
  if (post.type === 'video') {
    return `
      <div class="content-card video-card" data-id="${post.id}">
        <div class="video-container" onclick="viewPostDetail('${post.id}')">
          <img src="${post.image}" alt="${escapeHtml(post.title)}" style="width: 100%; min-height: 400px; object-fit: cover;">
          <div class="video-overlay">
            <div class="video-title">${escapeHtml(post.title)}</div>
            <div class="video-stats">
              <span><i class="fas fa-heart"></i> ${formatNumber(post.likes)}</span>
              <span><i class="fas fa-comment"></i> ${formatNumber(post.comments)}</span>
            </div>
          </div>
        </div>
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
            <button class="action-icon like-btn" data-id="${post.id}">
              <i class="far fa-heart"></i>
              <span>${formatNumber(post.likes)}</span>
            </button>
            <button class="action-icon comment-btn" data-id="${post.id}">
              <i class="far fa-comment"></i>
              <span>${formatNumber(post.comments)}</span>
            </button>
            <button class="action-icon share-btn" data-id="${post.id}">
              <i class="far fa-share-alt"></i>
              <span>${formatNumber(post.shares)}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }
  
  // Image/Pinterest style card
  return `
    <div class="content-card image-card" data-id="${post.id}" onclick="viewPostDetail('${post.id}')">
      <img src="${post.image}" alt="${escapeHtml(post.title)}" style="width: 100%; min-height: 350px; object-fit: cover;">
      <div class="image-overlay">
        <div class="card-badge">
          <i class="fas ${icon}"></i> ${label}
        </div>
        <div class="card-title">${escapeHtml(post.title)}</div>
        <div class="card-description">${escapeHtml(post.description.substring(0, 100))}${post.description.length > 100 ? '...' : ''}</div>
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
            <button class="action-icon like-btn" data-id="${post.id}">
              <i class="far fa-heart"></i>
              <span>${formatNumber(post.likes)}</span>
            </button>
            <button class="action-icon comment-btn" data-id="${post.id}">
              <i class="far fa-comment"></i>
              <span>${formatNumber(post.comments)}</span>
            </button>
            <button class="action-icon share-btn" data-id="${post.id}">
              <i class="far fa-share-alt"></i>
              <span>${formatNumber(post.shares)}</span>
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
  
  if (diffMins < 1) return 'Now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
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
      likeBtn.querySelector('span').textContent = formatNumber(post.likes);
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

function toggleComments(postId) {
  const commentsSection = document.getElementById(`comments-${postId}`);
  if (commentsSection) {
    commentsSection.style.display = commentsSection.style.display === 'block' ? 'none' : 'block';
  }
}

async function submitComment(postId) {
  if (!currentUser) {
    showToast('Login to comment', 'info');
    return;
  }
  
  const input = document.getElementById(`comment-input-${postId}`);
  const comment = input?.value.trim();
  
  if (!comment) return;
  
  input.value = '';
  showToast('Comment added!', 'success');
  
  const post = allPosts.find(p => p.id === postId);
  if (post) {
    post.comments++;
    const commentSpan = document.querySelector(`.comment-btn[data-id="${postId}"] span`);
    if (commentSpan) commentSpan.textContent = formatNumber(post.comments);
  }
  
  if (!postId.startsWith('feed_')) {
    await supabase
      .from('post_comments')
      .insert({
        post_id: postId,
        user_id: currentUser.id,
        comment: comment,
        created_at: new Date().toISOString()
      });
  }
}

async function sharePost(postId) {
  const url = `${window.location.origin}${window.location.pathname}`;
  await navigator.clipboard.writeText(url);
  showToast('Link copied!', 'success');
  
  const post = allPosts.find(p => p.id === postId);
  if (post) {
    post.shares++;
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
          <div style="color: white; font-weight: 600;">${escapeHtml(post.author)}</div>
          <div style="color: #666; font-size: 12px;">${timeAgo}</div>
        </div>
      </div>
      <h3 style="color: white; font-size: 18px; margin-bottom: 12px;">${escapeHtml(post.title)}</h3>
      <p style="color: #aaa; line-height: 1.6; margin-bottom: 20px;">${escapeHtml(post.description)}</p>
      <div style="display: flex; gap: 24px; padding: 16px 0; border-top: 0.5px solid rgba(255,255,255,0.1); border-bottom: 0.5px solid rgba(255,255,255,0.1);">
        <div style="display: flex; align-items: center; gap: 6px; color: #888;">
          <i class="fas fa-heart" style="color: #fe2c55;"></i> ${formatNumber(post.likes)}
        </div>
        <div style="display: flex; align-items: center; gap: 6px; color: #888;">
          <i class="fas fa-comment"></i> ${formatNumber(post.comments)}
        </div>
        <div style="display: flex; align-items: center; gap: 6px; color: #888;">
          <i class="fas fa-share-alt"></i> ${formatNumber(post.shares)}
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
    } else {
      imageUrl = `https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=600`;
    }
  } else {
    imageUrl = `https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=600`;
  }
  
  const newPost = {
    id: Date.now().toString(),
    type: type,
    title: title,
    description: description || '',
    image: imageUrl,
    videoUrl: null,
    author: currentUser.user_metadata?.name || 'Creator',
    likes: 0,
    comments: 0,
    shares: 0,
    createdAt: new Date().toISOString()
  };
  
  allPosts.unshift(newPost);
  renderFeed();
  
  await supabase
    .from('hub_posts')
    .insert({
      user_id: currentUser.id,
      title: title,
      description: description || '',
      type: type,
      image_url: imageUrl,
      status: 'approved',
      author_name: newPost.author,
      created_at: newPost.createdAt
    });
  
  showToast('Content published!', 'success');
  closeCreatePostModal();
  
  document.getElementById('postForm').reset();
  document.getElementById('postType').value = 'insight';
  document.getElementById('imagePreview').style.display = 'none';
}

function attachCardListeners() {
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      handleLike(btn.dataset.id);
    };
  });
  
  document.querySelectorAll('.comment-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      toggleComments(btn.dataset.id);
    };
  });
  
  document.querySelectorAll('.share-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      sharePost(btn.dataset.id);
    };
  });
}

function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      // Implement tab filtering logic here
      renderFeed();
    });
  });
  
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
  
  window.addEventListener('submitPost', handlePostSubmission);
}

function closeCreatePostModal() {
  document.getElementById('createPostModal').classList.remove('active');
}

// Make functions global
window.closeCreatePostModal = closeCreatePostModal;
window.submitComment = submitComment;
window.viewPostDetail = viewPostDetail;
window.removeImage = window.removeImage || function() {
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('previewImg').src = '';
  document.getElementById('postImage').value = '';
};
