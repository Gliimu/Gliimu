// frontend/js/pages/hub.js - Creative Feed with Pinterest Style Layout

import { supabase, getCurrentUser } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// Global state
let currentUser = null;
let allPosts = [];
let currentFilter = 'all';
let currentSearch = '';

// Default fallback content (shows if database is empty)
const DEFAULT_FEED = [
    {
        id: 'local_1',
        type: 'insight',
        title: '🎨 Welcome to Gliimu Creative Feed!',
        description: 'This is your creative hub. Share your projects, get inspired, and connect with fellow media architects. Double-tap to like, comment to engage!',
        image: 'https://images.pexels.com/photos/4924135/pexels-photo-4924135.jpeg?w=800',
        author: 'Gliimu Team',
        likes: 245,
        comments: 18,
        createdAt: new Date().toISOString()
    },
    {
        id: 'local_2',
        type: 'video',
        title: '🎬 Motion Graphics Magic',
        description: 'Watch how I created this stunning motion graphics project using After Effects. Full breakdown in comments!',
        image: 'https://images.pexels.com/photos/1574717024453540563c7a4f?w=800',
        author: 'Michael Chen',
        likes: 1234,
        comments: 89,
        createdAt: new Date(Date.now() - 86400000).toISOString()
    },
    {
        id: 'local_3',
        type: 'design',
        title: '✨ Color Psychology in Branding',
        description: 'How the right colors can make or break your brand identity. A deep dive into color meanings.',
        image: 'https://images.pexels.com/photos/196645/pexels-photo-196645.jpeg?w=800',
        author: 'Sarah Johnson',
        likes: 3421,
        comments: 156,
        createdAt: new Date(Date.now() - 172800000).toISOString()
    },
    {
        id: 'local_4',
        type: 'insight',
        title: '💡 From Zero to Media Architect',
        description: '6 months ago I knew nothing. Now I\'m working with brands. Here\'s what I learned at Gliimu.',
        image: 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?w=800',
        author: 'David Okafor',
        likes: 5678,
        comments: 423,
        createdAt: new Date(Date.now() - 259200000).toISOString()
    },
    {
        id: 'local_5',
        type: 'video',
        title: '🎨 Speed Art: Digital Painting',
        description: 'Watch this digital artwork come to life from sketch to final render. 3 hours compressed!',
        image: 'https://images.pexels.com/photos/2075802/pexels-photo-2075802.jpeg?w=800',
        author: 'Zoe Williams',
        likes: 8901,
        comments: 234,
        createdAt: new Date(Date.now() - 345600000).toISOString()
    },
    {
        id: 'local_6',
        type: 'event',
        title: '📅 Portfolio Review Workshop',
        description: 'Get expert feedback on your portfolio. Limited spots available! Register now.',
        image: 'https://images.pexels.com/photos/3194519/pexels-photo-3194519.jpeg?w=800',
        author: 'Gliimu Events',
        likes: 2345,
        comments: 567,
        createdAt: new Date(Date.now() - 432000000).toISOString()
    }
];

// Leaderboard data - Top performing users
const LEADERBOARD_DATA = [
    { name: 'Michael Chen', score: 98.5, percentage: 98.5, rank: 1 },
    { name: 'Sarah Johnson', score: 95.2, percentage: 95.2, rank: 2 },
    { name: 'David Okafor', score: 92.8, percentage: 92.8, rank: 3 },
    { name: 'Tunde Adebayo', score: 88.4, percentage: 88.4, rank: 4 },
    { name: 'Zoe Williams', score: 85.1, percentage: 85.1, rank: 5 },
    { name: 'Grace Mbah', score: 82.6, percentage: 82.6, rank: 6 },
    { name: 'Emeka Nwosu', score: 79.3, percentage: 79.3, rank: 7 },
    { name: 'Alex Hunter', score: 76.8, percentage: 76.8, rank: 8 },
    { name: 'Oluwaseun Adeleke', score: 74.2, percentage: 74.2, rank: 9 },
    { name: 'Chioma Eze', score: 71.5, percentage: 71.5, rank: 10 }
];

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Creative Feed initializing...');
    
    // Show loading state
    const container = document.getElementById('feedContainer');
    if (container) {
        container.innerHTML = `
            <div class="loading-feed">
                <div class="loading-spinner"></div>
                <p>Loading creative feed...</p>
            </div>
        `;
    }
    
    // Load user
    try {
        currentUser = await getCurrentUser();
        console.log('Current user:', currentUser?.email || 'Not logged in');
        
        if (currentUser) {
            const userNameEl = document.getElementById('userName');
            const userRoleEl = document.getElementById('userRole');
            if (userNameEl) userNameEl.textContent = currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'Creator';
            if (userRoleEl) userRoleEl.textContent = 'Student';
        }
    } catch (err) {
        console.error('Error getting user:', err);
    }
    
    // Load posts from Supabase
    await loadPostsFromSupabase();
    
    // Load leaderboard
    loadLeaderboard();
    
    // Setup event listeners
    setupEventListeners();
});

// ============================================
// LOAD POSTS FROM SUPABASE
// ============================================

async function loadPostsFromSupabase() {
    console.log('Loading posts from Supabase...');
    
    try {
        const { data: posts, error } = await supabase
            .from('hub_posts')
            .select('*')
            .eq('status', 'approved')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Supabase error:', error);
            // Use default content if database error
            allPosts = [...DEFAULT_FEED];
            renderFeed();
            return;
        }
        
        if (posts && posts.length > 0) {
            console.log(`Found ${posts.length} posts from database`);
            
            // Format posts from database
            const formattedPosts = posts.map(post => ({
                id: post.id,
                type: post.type,
                title: post.title,
                description: post.description,
                image: post.image_url || DEFAULT_FEED[0].image,
                author: post.author_name || 'Community Creator',
                likes: post.likes || 0,
                comments: post.comments || 0,
                createdAt: post.created_at
            }));
            
            // Merge with default posts (limit to 3 defaults)
            allPosts = [...formattedPosts, ...DEFAULT_FEED.slice(0, 3)];
            
            // Remove duplicates by id
            const uniquePosts = [];
            const ids = new Set();
            for (const post of allPosts) {
                if (!ids.has(post.id)) {
                    ids.add(post.id);
                    uniquePosts.push(post);
                }
            }
            allPosts = uniquePosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
        } else {
            console.log('No posts in database, using default content');
            allPosts = [...DEFAULT_FEED];
        }
        
        renderFeed();
        
    } catch (err) {
        console.error('Exception loading posts:', err);
        allPosts = [...DEFAULT_FEED];
        renderFeed();
    }
}

// ============================================
// RENDER FEED - PINTEREST STYLE GRID
// ============================================

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
            (post.title || '').toLowerCase().includes(searchLower) ||
            (post.description || '').toLowerCase().includes(searchLower) ||
            (post.author || '').toLowerCase().includes(searchLower)
        );
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-compass"></i>
                <h3>No posts found</h3>
                <p>Be the first to share your creative journey!</p>
                <button class="create-post-btn" onclick="document.getElementById('createPostBtn').click()" style="margin-top: 16px;">
                    Create Post
                </button>
            </div>
        `;
        return;
    }
    
    // Generate Pinterest-style cards
    container.innerHTML = filtered.map(post => createPinterestCard(post)).join('');
    
    // Attach event listeners to new cards
    attachCardListeners();
}

// ============================================
// CREATE PINTEREST-STYLE CARD
// ============================================

function createPinterestCard(post) {
    const timeAgo = getTimeAgo(new Date(post.createdAt));
    
    const typeIcons = {
        video: 'fa-video',
        insight: 'fa-lightbulb',
        design: 'fa-palette',
        event: 'fa-calendar-alt',
        support: 'fa-hand-holding-heart',
        project: 'fa-code'
    };
    
    const typeLabels = {
        video: 'Video',
        insight: 'Insight',
        design: 'Design',
        event: 'Event',
        support: 'Support',
        project: 'Project'
    };
    
    const icon = typeIcons[post.type] || 'fa-star';
    const label = typeLabels[post.type] || 'Creative';
    const imageUrl = post.image || 'https://images.pexels.com/photos/4924135/pexels-photo-4924135.jpeg?w=800';
    
    return `
        <div class="pinterest-card" data-id="${post.id}">
            <div class="pinterest-card-image">
                <img src="${imageUrl}" alt="${escapeHtml(post.title)}" loading="lazy" onerror="this.src='https://images.pexels.com/photos/4924135/pexels-photo-4924135.jpeg?w=800'">
                <span class="card-badge">
                    <i class="fas ${icon}"></i> ${label}
                </span>
                <button class="save-btn" onclick="event.stopPropagation(); savePost('${post.id}')">
                    <i class="far fa-bookmark"></i>
                </button>
                <div class="image-overlay">
                    <div class="overlay-stat">
                        <i class="fas fa-heart"></i>
                        <span>${formatNumber(post.likes)}</span>
                    </div>
                    <div class="overlay-stat">
                        <i class="fas fa-comment"></i>
                        <span>${formatNumber(post.comments)}</span>
                    </div>
                </div>
            </div>
            <div class="pinterest-card-content">
                <h3 class="pinterest-card-title">${escapeHtml(post.title)}</h3>
                <p class="pinterest-card-description">${escapeHtml(post.description.substring(0, 100))}${post.description.length > 100 ? '...' : ''}</p>
                <div class="author-section">
                    <div class="author-info">
                        <div class="author-avatar">
                            <i class="fas fa-user-circle"></i>
                        </div>
                        <div>
                            <div class="author-name">${escapeHtml(post.author)}</div>
                            <div class="post-time">${timeAgo}</div>
                        </div>
                    </div>
                </div>
                <div class="engagement-section">
                    <button class="engagement-action like-btn" data-id="${post.id}" onclick="event.stopPropagation()">
                        <i class="far fa-heart"></i>
                        <span class="like-count">${formatNumber(post.likes)}</span>
                    </button>
                    <button class="engagement-action comment-btn" data-id="${post.id}" onclick="event.stopPropagation()">
                        <i class="far fa-comment"></i>
                        <span class="comment-count">${formatNumber(post.comments)}</span>
                    </button>
                    <button class="engagement-action share-btn" data-id="${post.id}" onclick="event.stopPropagation()">
                        <i class="far fa-share-alt"></i>
                        <span>Share</span>
                    </button>
                </div>
            </div>
            <div class="comments-section" id="comments-${post.id}">
                <div class="comment-input-wrapper">
                    <input type="text" placeholder="Add a comment..." id="comment-input-${post.id}">
                    <button onclick="submitComment('${post.id}')">Post</button>
                </div>
                <div class="comments-list" id="comments-list-${post.id}">
                    <div class="comment-item">
                        <div class="comment-avatar"><i class="fas fa-user-circle"></i></div>
                        <div class="comment-content">
                            <div class="comment-name">Community Member</div>
                            <div class="comment-text">This is amazing! Love the creativity 🔥</div>
                            <div class="comment-time">2 hours ago</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getTimeAgo(date) {
    if (isNaN(date.getTime())) return 'Recently';
    
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

// ============================================
// ENGAGEMENT FUNCTIONS
// ============================================

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
            likeBtn.querySelector('.like-count').textContent = formatNumber(post.likes);
            likeBtn.querySelector('i').classList.remove('far');
            likeBtn.querySelector('i').classList.add('fas');
            likeBtn.classList.add('liked');
        }
        showToast('Liked!', 'success');
        
        // Update in database if not a local post
        if (!post.id.startsWith('local_')) {
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
        commentsSection.classList.toggle('active');
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
        const commentSpan = document.querySelector(`.comment-btn[data-id="${postId}"] .comment-count`);
        if (commentSpan) commentSpan.textContent = formatNumber(post.comments);
    }
    
    // Add comment to UI
    const commentsList = document.getElementById(`comments-list-${postId}`);
    if (commentsList) {
        const newComment = `
            <div class="comment-item">
                <div class="comment-avatar"><i class="fas fa-user-circle"></i></div>
                <div class="comment-content">
                    <div class="comment-name">${escapeHtml(currentUser?.user_metadata?.name || 'You')}</div>
                    <div class="comment-text">${escapeHtml(comment)}</div>
                    <div class="comment-time">Just now</div>
                </div>
            </div>
        `;
        commentsList.innerHTML = newComment + commentsList.innerHTML;
    }
}

async function sharePost(postId) {
    const url = `${window.location.origin}${window.location.pathname}`;
    await navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard!', 'success');
}

async function savePost(postId) {
    if (!currentUser) {
        showToast('Login to save posts', 'info');
        return;
    }
    showToast('Saved to your collection!', 'success');
}

// ============================================
// LEADERBOARD
// ============================================

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
                <div class="leaderboard-name">${escapeHtml(user.name)}</div>
                <div class="leaderboard-score">${user.score}% completion</div>
            </div>
            <div class="leaderboard-percent">${user.percentage}%</div>
        </div>
    `).join('');
}

// ============================================
// EVENT LISTENERS
// ============================================

function attachCardListeners() {
    // Like buttons
    document.querySelectorAll('.like-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            handleLike(postId);
        };
    });
    
    // Comment buttons - toggle comments section
    document.querySelectorAll('.comment-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            toggleComments(postId);
        };
    });
    
    // Share buttons
    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            await sharePost(postId);
        };
    });
}

function setupEventListeners() {
    // Filter chips
    const chips = document.querySelectorAll('.chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
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
    
    // Create post button
    const createBtn = document.getElementById('createPostBtn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            document.getElementById('createPostModal').classList.add('active');
        });
    }
    
    // Modal close
    const closeModal = document.getElementById('closeModalBtn');
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            document.getElementById('createPostModal').classList.remove('active');
        });
    }
    
    // Modal backdrop click
    const modal = document.getElementById('createPostModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.getElementById('createPostModal').classList.remove('active');
            }
        });
    }
    
    // Post submission
    window.addEventListener('submitPost', handlePostSubmission);
}

// ============================================
// CREATE POST HANDLER
// ============================================

async function handlePostSubmission(event) {
    const { title, type, description, imageFile } = event.detail;
    
    if (!title) {
        showToast('Please add a title', 'error');
        return;
    }
    
    if (!currentUser) {
        showToast('Please login to post', 'error');
        return;
    }
    
    let imageUrl = 'https://images.pexels.com/photos/4924135/pexels-photo-4924135.jpeg?w=800';
    
    if (imageFile) {
        imageUrl = URL.createObjectURL(imageFile);
    }
    
    const newPost = {
        id: 'post_' + Date.now(),
        type: type,
        title: title,
        description: description || '',
        image: imageUrl,
        author: currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'Creator',
        likes: 0,
        comments: 0,
        createdAt: new Date().toISOString()
    };
    
    allPosts.unshift(newPost);
    renderFeed();
    showToast('Post published successfully!', 'success');
    
    // Close modal and clear form
    document.getElementById('createPostModal').classList.remove('active');
    document.getElementById('postForm').reset();
    document.getElementById('postType').value = 'insight';
    document.getElementById('imagePreview').style.display = 'none';
    
    // Reset type buttons
    const typeBtns = document.querySelectorAll('.type-btn');
    typeBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.type === 'insight') btn.classList.add('active');
    });
    
    // Save to database
    try {
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
                created_at: newPost.createdAt,
                likes: 0,
                comments: 0
            });
    } catch (error) {
        console.error('Error saving to database:', error);
    }
}

// ============================================
// EXPOSE GLOBAL FUNCTIONS
// ============================================

window.viewPostDetail = (postId) => {
    const post = allPosts.find(p => p.id === postId);
    if (post) {
        // You can implement a modal detail view here
        showToast(`Viewing: ${post.title}`, 'info');
    }
};

window.savePost = savePost;
window.submitComment = submitComment;
window.removeImage = () => {
    const preview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');
    const fileInput = document.getElementById('postImage');
    if (preview) preview.style.display = 'none';
    if (previewImg) previewImg.src = '';
    if (fileInput) fileInput.value = '';
};

window.closeCreatePostModal = () => {
    document.getElementById('createPostModal').classList.remove('active');
};
