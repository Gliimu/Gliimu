// frontend/js/pages/hub.js - DEBUG VERSION

// Try different import paths to find the correct one
console.log('=== HUB.JS LOADED ===');

// Try importing from the correct path based on your file structure
// From: frontend/js/pages/hub.js
// To:   frontend/js/modules/supabase.js
// Path: ../modules/supabase.js

import { supabase, getCurrentUser } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

console.log('Supabase import successful?', !!supabase);
console.log('showToast import successful?', typeof showToast);

// Global state
let currentUser = null;
let allPosts = [];
let currentFilter = 'all';
let currentSearch = '';

// Default fallback content
const DEFAULT_FEED = [
    {
        id: 'local_1',
        type: 'insight',
        title: '🎬 Welcome to Gliimu Creative Feed!',
        description: 'This is a local fallback post. When connected to Supabase, real posts will appear here. Share your creative journey with the community!',
        image: 'https://images.pexels.com/photos/4924135/pexels-photo-4924135.jpeg?w=800',
        author: 'Gliimu Team',
        likes: 0,
        comments: 0,
        createdAt: new Date().toISOString()
    }
];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded - Initializing Creative Feed');
    
    const container = document.getElementById('feedContainer');
    if (!container) {
        console.error('ERROR: feedContainer element not found!');
        return;
    }
    
    // Show loading state
    container.innerHTML = `
        <div class="loading-feed">
            <div class="loading-spinner"></div>
            <p>Loading feed from Supabase...</p>
            <p style="font-size: 12px; margin-top: 10px;">Checking database connection...</p>
        </div>
    `;
    
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
    
    // Setup event listeners
    setupEventListeners();
    loadLeaderboard();
});

async function loadPostsFromSupabase() {
    const container = document.getElementById('feedContainer');
    console.log('Loading posts from Supabase...');
    
    try {
        // First, test if we can access the table
        console.log('Attempting to query hub_posts table...');
        
        const { data: posts, error, status } = await supabase
            .from('hub_posts')
            .select('*')
            .eq('status', 'approved')
            .order('created_at', { ascending: false });
        
        console.log('Supabase response status:', status);
        console.log('Supabase error:', error);
        console.log('Supabase data:', posts);
        
        if (error) {
            console.error('Supabase query error:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-database"></i>
                    <h3>Database Connection Error</h3>
                    <p>${error.message}</p>
                    <p style="font-size: 12px; margin-top: 10px;">Check console for details</p>
                </div>
            `;
            return;
        }
        
        if (posts && posts.length > 0) {
            console.log(`✅ Found ${posts.length} posts in Supabase!`);
            
            // Format posts from database
            allPosts = posts.map(post => ({
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
            
            renderFeed();
        } else {
            console.log('⚠️ No posts found in Supabase. Using default content.');
            console.log('HINT: Run the SQL INSERT query to add sample posts to hub_posts table');
            
            // Use default content
            allPosts = [...DEFAULT_FEED];
            renderFeed();
            
            // Show hint
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-info-circle"></i>
                    <h3>No Posts Yet</h3>
                    <p>Add sample posts to your Supabase database to see them here.</p>
                    <p style="font-size: 12px; margin-top: 10px;">Run the SQL INSERT query in Supabase SQL Editor</p>
                    <button class="create-post-btn" onclick="document.getElementById('createPostBtn').click()" style="margin-top: 16px;">
                        Create First Post
                    </button>
                </div>
            `;
        }
        
    } catch (err) {
        console.error('❌ Exception loading posts:', err);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Feed</h3>
                <p>${err.message}</p>
                <p style="font-size: 12px; margin-top: 10px;">Check that supabase.js is properly configured</p>
            </div>
        `;
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
            (post.title || '').toLowerCase().includes(searchLower) ||
            (post.description || '').toLowerCase().includes(searchLower) ||
            (post.author || '').toLowerCase().includes(searchLower)
        );
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-filter"></i>
                <h3>No matching posts</h3>
                <p>Try changing your filter or search criteria</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filtered.map(post => createPostCard(post)).join('');
    attachCardListeners();
}

function createPostCard(post) {
    const timeAgo = getTimeAgo(new Date(post.createdAt));
    
    const typeIcons = {
        video: 'fa-video',
        insight: 'fa-lightbulb',
        event: 'fa-calendar-alt',
        support: 'fa-hand-holding-heart'
    };
    
    const typeLabels = {
        video: 'Video',
        insight: 'Insight',
        event: 'Event',
        support: 'Support'
    };
    
    const icon = typeIcons[post.type] || 'fa-star';
    const label = typeLabels[post.type] || 'Post';
    const imageUrl = post.image || 'https://images.pexels.com/photos/4924135/pexels-photo-4924135.jpeg?w=800';
    
    return `
        <div class="content-card" data-id="${post.id}">
            <div class="card-media">
                <img src="${imageUrl}" alt="${escapeHtml(post.title)}" loading="lazy" onerror="this.src='https://images.pexels.com/photos/4924135/pexels-photo-4924135.jpeg?w=800'">
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
                        <button class="action-btn like-btn" data-id="${post.id}">
                            <i class="far fa-heart"></i>
                            <span class="like-count">${formatNumber(post.likes)}</span>
                        </button>
                        <button class="action-btn comment-btn" data-id="${post.id}">
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

function attachCardListeners() {
    document.querySelectorAll('.like-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            const post = allPosts.find(p => p.id === postId);
            if (post) {
                post.likes++;
                btn.querySelector('.like-count').textContent = formatNumber(post.likes);
                btn.querySelector('i').classList.remove('far');
                btn.querySelector('i').classList.add('fas');
                btn.classList.add('liked');
                showToast('Liked!', 'success');
                
                // Update in Supabase if it's a real post
                if (!post.id.startsWith('local_')) {
                    await supabase.from('hub_posts').update({ likes: post.likes }).eq('id', postId);
                }
            }
        };
    });
}

function loadLeaderboard() {
    const container = document.getElementById('leaderboardList');
    if (!container) return;
    
    const leaderboardData = [
        { name: 'Michael Chen', score: 98.5, percentage: 98.5, rank: 1 },
        { name: 'Sarah Johnson', score: 95.2, percentage: 95.2, rank: 2 },
        { name: 'David Okafor', score: 92.8, percentage: 92.8, rank: 3 },
        { name: 'Tunde Adebayo', score: 88.4, percentage: 88.4, rank: 4 },
        { name: 'Zoe Williams', score: 85.1, percentage: 85.1, rank: 5 }
    ];
    
    container.innerHTML = leaderboardData.map(user => `
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

function setupEventListeners() {
    // Filter chips
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
}

// Make functions global for onclick handlers
window.viewPostDetail = (postId) => {
    const post = allPosts.find(p => p.id === postId);
    if (post) {
        alert(`Post: ${post.title}\n\n${post.description}`);
    }
};
