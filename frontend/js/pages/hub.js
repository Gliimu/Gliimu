// Update the createFeedCard function in hub.js to this Pinterest style

function createFeedCard(post) {
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
                            <div class="comment-name">Sarah Johnson</div>
                            <div class="comment-text">This is amazing! Love the creativity 🔥</div>
                            <div class="comment-time">2 hours ago</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Update the renderFeed function to use the new grid
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
    
    container.innerHTML = filtered.map(post => createFeedCard(post)).join('');
    attachCardListeners();
}

// Update attachCardListeners for the new engagement buttons
function attachCardListeners() {
    // Like buttons
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
                
                if (!post.id.startsWith('local_')) {
                    await supabase.from('hub_posts').update({ likes: post.likes }).eq('id', postId);
                }
            }
        };
    });
    
    // Comment buttons - toggle comments section
    document.querySelectorAll('.comment-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            const commentsSection = document.getElementById(`comments-${postId}`);
            if (commentsSection) {
                commentsSection.classList.toggle('active');
            }
        };
    });
    
    // Share buttons
    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            const url = `${window.location.origin}${window.location.pathname}?post=${postId}`;
            await navigator.clipboard.writeText(url);
            showToast('Link copied to clipboard!', 'success');
        };
    });
}

// Add save post function
window.savePost = async (postId) => {
    if (!currentUser) {
        showToast('Login to save posts', 'info');
        return;
    }
    showToast('Saved to your collection!', 'success');
};

// Add submit comment function
window.submitComment = async (postId) => {
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
};
