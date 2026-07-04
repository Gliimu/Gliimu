// ================================================================
// GLIIMU HUB - Complete Hub Logic
// File: frontend/js/pages/hub.js
// ================================================================

import { 
    supabase, 
    getCurrentUser, 
    getUserProfile,
    getHubContent,
    getTrendingContent,
    getPromotedContent,
    saveContent,
    unsaveContent,
    heartContent,
    getContentDetails,
    addComment,
    getComments,
    getStarBalance,
    useStarsForPromotion,
    getAmbassadorStatus,
    claimFreePromotion,
    createContent,
    getUserSavedContent,
    getUserHeartedContent
} from '../modules/supabase.js';

import { showToast } from '../modules/toast.js';

// ================================================================
// NAVIGATION FUNCTIONS - Expose to window
// ================================================================

// Close nav when clicking outside
document.addEventListener('click', function(e) {
    const nav = document.getElementById('stickyNav');
    const dropdown = document.getElementById('navDropdown');
    const toggle = document.getElementById('navToggle');
    
    if (nav && !nav.contains(e.target)) {
        if (dropdown) dropdown.classList.remove('open');
        if (toggle) toggle.classList.remove('active');
    }
});

// Toggle nav function
function toggleNav(e) {
    e.stopPropagation();
    const dropdown = document.getElementById('navDropdown');
    const toggle = document.getElementById('navToggle');
    if (dropdown) dropdown.classList.toggle('open');
    if (toggle) toggle.classList.toggle('active');
}

// Navigation functions - Expose to window
window.goToDashboard = function() {
    window.location.href = '/user';
};

window.goToHub = function() {
    window.location.href = '/hub';
};

window.goToLearningPath = function() {
    window.location.href = '/user-course';
};

window.goToVirtualRoom = function() {
    window.location.href = '/virtualroom';
};

window.goToChat = function() {
    window.location.href = '/chat';
};

window.goToMerchandise = function() {
    window.location.href = '/merchandise';
};

window.goToUser = function() {
    window.location.href = '/user';
};

window.goBack = function() {
    if (document.referrer && document.referrer.includes('/user')) {
        window.history.back();
    } else {
        window.location.href = '/user';
    }
};

window.goToContact = function() {
    window.location.href = '/contact';
};

window.reportIssue = function() {
    showToast('📝 Report an issue? Our team will investigate.', 'info');
};

// Share functions
window.sharePage = function() {
    const link = window.location.href;
    document.getElementById('shareCode').textContent = 'GLI-HUB-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    document.getElementById('shareReferralLink').textContent = link;
    document.getElementById('shareModal').classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.closeShareModal = function() {
    document.getElementById('shareModal').classList.remove('active');
    document.body.style.overflow = '';
};

window.copyShareCode = function() {
    const code = document.getElementById('shareCode').textContent;
    navigator.clipboard.writeText(code).then(() => {
        showToast('📋 Share code copied!', 'success');
    }).catch(() => {
        const input = document.createElement('input');
        input.value = code;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('📋 Share code copied!', 'success');
    });
};

window.copyShareLink = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    navigator.clipboard.writeText(link).then(() => {
        showToast('🔗 Link copied!', 'success');
    }).catch(() => {
        const input = document.createElement('input');
        input.value = link;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('🔗 Link copied!', 'success');
    });
};

window.shareOnWhatsApp = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    const text = `Check out Gliimu Hub! 🚀 Discover, create, and get discovered: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    window.closeShareModal();
};

window.shareOnTwitter = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    const text = `Check out Gliimu Hub! 🚀 Discover, create, and get discovered: ${link}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
    window.closeShareModal();
};

window.shareOnLinkedIn = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    window.open(`https://linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`, '_blank');
    window.closeShareModal();
};

window.shareOnFacebook = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    window.open(`https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, '_blank');
    window.closeShareModal();
};

window.shareOnEmail = function() {
    const link = document.getElementById('shareReferralLink').textContent;
    const subject = 'Check out Gliimu Hub!';
    const body = `I found this amazing platform called Gliimu Hub. Check it out: ${link}`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    window.closeShareModal();
};

// ================================================================
// STATE
// ================================================================
const state = {
    currentUser: null,
    currentProfile: null,
    content: [],
    filteredContent: [],
    trendingContent: [],
    promotedContent: [],
    currentFilter: 'all',
    searchQuery: '',
    page: 0,
    limit: 20,
    hasMore: true,
    isLoading: false,
    selectedContent: null,
    starBalance: 0,
    starEarned: 0,
    isAmbassador: false,
    savedItems: new Set(),
    heartedItems: new Set(),
    promotionOptions: [
        { id: 'sponsored-post', label: 'Sponsored Post', description: 'Premium placement for 3 days', cost: 1, icon: 'fa-ad' },
        { id: 'partner-collab', label: 'Partner Collaboration', description: 'Co-branded content', cost: 1, icon: 'fa-handshake' },
        { id: 'flier-design', label: 'Flier Design & Post', description: 'Professional flier + distribution', cost: 1, icon: 'fa-paint-brush' },
        { id: 'billboard', label: 'Digital Billboard', description: 'Featured for 7 days', cost: 2, icon: 'fa-tv' },
        { id: 'event-ticket', label: 'VIP Event Ticket', description: 'Exclusive Gliimu events', cost: 2, icon: 'fa-ticket-alt' },
        { id: 'partnership-listing', label: 'Permanent Partnership', description: 'Listed for 1 month', cost: 3, icon: 'fa-building' }
    ]
};

// ================================================================
// DOM REFS
// ================================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    contentGrid: $('#hubContentGrid'),
    featuredScroll: $('#featuredScroll'),
    filterBtns: $$('.filter-btn'),
    searchInput: $('#hubSearchInput'),
    searchBtn: $('#hubSearchBtn'),
    loadMoreBtn: $('#loadMoreBtn'),
    emptyState: $('#hubEmptyState'),
    contentCount: $('#contentCount'),
    liveCount: $('#liveCount'),
    navToggle: $('#navToggle'),
    navDropdown: $('#navDropdown'),
    
    // Modals
    promotionModal: $('#promotionModal'),
    detailModal: $('#contentDetailModal'),
    createModal: $('#createContentModal'),
    shareModal: $('#shareModal'),
    
    // Promotion
    ambassadorBanner: $('#ambassadorPromoBanner'),
    claimPromoBtn: $('#claimPromoBtn'),
    availableStarsDisplay: $('#availableStarsDisplay'),
    promotionOptions: $('#promotionOptions'),
    promotionConfirmation: $('#promotionConfirmation'),
    promotionConfirmText: $('#promotionConfirmText'),
    promotionDoneBtn: $('#promotionDoneBtn'),
    closePromotionModal: $('#closePromotionModal'),
    
    // Detail
    detailTitle: $('#detailTitle'),
    detailImage: $('#detailImage'),
    detailAuthor: $('#detailAuthor'),
    detailCategory: $('#detailCategory'),
    detailStars: $('#detailStars'),
    detailDescription: $('#detailDescription'),
    detailHeartBtn: $('#detailHeartBtn'),
    heartCount: $('#heartCount'),
    detailShareBtn: $('#detailShareBtn'),
    detailSaveBtn: $('#detailSaveBtn'),
    detailPromoteBtn: $('#detailPromoteBtn'),
    closeDetailModal: $('#closeDetailModal'),
    commentList: $('#commentList'),
    commentInput: $('#commentInput'),
    commentSubmitBtn: $('#commentSubmitBtn'),
    commentCount: $('#commentCount'),
    
    // Create
    createForm: $('#createContentForm'),
    emptyCreateBtn: $('#emptyCreateBtn'),
    createContentBtn: $('#createContentBtn'),
    closeCreateModal: $('#closeCreateModal'),
    
    // Share
    shareCode: $('#shareCode'),
    shareReferralLink: $('#shareReferralLink'),
    
    // Stats
    totalCreators: $('#totalCreators'),
    totalContent: $('#totalContent'),
    totalStars: $('#totalStars')
};

// ================================================================
// INIT
// ================================================================
async function init() {
    console.log('🚀 Hub initializing...');
    
    try {
        // Setup nav toggle
        if (dom.navToggle) {
            dom.navToggle.addEventListener('click', toggleNav);
        }
        
        // Check auth
        const user = await getCurrentUser();
        if (user) {
            state.currentUser = user;
            const profile = await getUserProfile(user.id);
            state.currentProfile = profile;
            
            // Check ambassador status
            await checkAmbassadorStatus(profile);
            
            // Load star balance
            await loadStarBalance();
            
            // Load saved and hearted
            await loadUserInteractions();
        }
        
        // Load content
        await loadContent();
        await loadTrending();
        await loadPromoted();
        
        // Setup event listeners
        setupEventListeners();
        
        // Update stats
        updateStats();
        
        // Make sure share modal is hidden
        if (dom.shareModal) {
            dom.shareModal.classList.remove('active');
        }
        
        console.log('✅ Hub initialized');
    } catch (error) {
        console.error('❌ Hub init error:', error);
        showToast('Failed to load Hub content', 'error');
    }
}

// ================================================================
// CONTENT LOADING
// ================================================================
async function loadContent(reset = true) {
    if (state.isLoading) return;
    state.isLoading = true;

    try {
        if (reset) {
            state.page = 0;
            state.content = [];
            state.hasMore = true;
        }

        const from = state.page * state.limit;
        const to = (state.page + 1) * state.limit - 1;

        const { data, error } = await supabase
            .from('hub_content')
            .select('*')
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        if (data.length < state.limit) {
            state.hasMore = false;
        }

        if (reset) {
            state.content = data || [];
        } else {
            state.content = [...state.content, ...(data || [])];
        }

        state.page++;
        applyFilters();
        updateContentCount();

    } catch (error) {
        console.error('Error loading content:', error);
        showToast('Failed to load content', 'error');
    } finally {
        state.isLoading = false;
    }
}

async function loadTrending() {
    try {
        const { data, error } = await supabase
            .from('hub_content')
            .select('*')
            .order('hearts', { ascending: false })
            .limit(12);

        if (error) throw error;
        state.trendingContent = data || [];
        renderFeatured(data || []);
    } catch (error) {
        console.error('Error loading trending:', error);
    }
}

async function loadPromoted() {
    try {
        const { data, error } = await supabase
            .from('hub_content')
            .select('*')
            .eq('is_promoted', true)
            .limit(6);

        if (error) throw error;
        state.promotedContent = data || [];
    } catch (error) {
        console.error('Error loading promoted:', error);
    }
}

// ================================================================
// USER INTERACTIONS
// ================================================================
async function loadUserInteractions() {
    if (!state.currentUser) return;
    
    try {
        const saved = await getUserSavedContent(state.currentUser.id);
        saved.forEach(item => state.savedItems.add(item.content_id));
        
        const hearted = await getUserHeartedContent(state.currentUser.id);
        hearted.forEach(item => state.heartedItems.add(item.content_id));
    } catch (error) {
        console.error('Error loading user interactions:', error);
    }
}

// ================================================================
// FILTERING & SEARCH
// ================================================================
function applyFilters() {
    let filtered = [...state.content];

    if (state.currentFilter !== 'all') {
        if (state.currentFilter === 'promoted') {
            filtered = filtered.filter(item => item.is_promoted);
        } else {
            filtered = filtered.filter(item => item.type === state.currentFilter);
        }
    }

    if (state.searchQuery.trim()) {
        const query = state.searchQuery.toLowerCase().trim();
        filtered = filtered.filter(item =>
            (item.title?.toLowerCase() || '').includes(query) ||
            (item.description?.toLowerCase() || '').includes(query) ||
            (item.author?.toLowerCase() || '').includes(query) ||
            (item.tags || []).some(tag => tag.toLowerCase().includes(query))
        );
    }

    state.filteredContent = filtered;
    renderContent(filtered);
    updateEmptyState(filtered.length === 0);
}

function updateEmptyState(isEmpty) {
    dom.emptyState.style.display = isEmpty ? 'block' : 'none';
    dom.loadMoreBtn.style.display = state.hasMore && !isEmpty ? 'inline-flex' : 'none';
}

function updateContentCount() {
    dom.contentCount.textContent = `${state.filteredContent.length} items found`;
}

// ================================================================
// RENDERING
// ================================================================
function renderContent(items) {
    if (!dom.contentGrid) return;

    if (!items || items.length === 0) {
        dom.contentGrid.innerHTML = '';
        return;
    }

    dom.contentGrid.innerHTML = items.map(item => {
        const isSaved = state.savedItems.has(item.id);
        const isHearted = state.heartedItems.has(item.id);
        const hearts = item.hearts || 0;
        
        return `
            <div class="content-card" data-id="${item.id}" data-type="${item.type}">
                ${item.is_promoted ? `<div class="promoted-badge"><i class="fas fa-star"></i> Promoted</div>` : ''}
                ${hearts >= 12 ? `<div class="trending-badge"><i class="fas fa-fire"></i> Trending</div>` : ''}
                <div class="content-card-image">
                    <img src="${item.image_url || 'https://placehold.co/400x250/2c2f78/white?text=Content'}" 
                         alt="${item.title || 'Content'}" 
                         onerror="this.src='https://placehold.co/400x250/2c2f78/white?text=Content'" />
                    <div class="content-card-type">
                        <i class="fas ${getTypeIcon(item.type)}"></i>
                        ${item.type || 'Content'}
                    </div>
                </div>
                <div class="content-card-body">
                    <h4>${item.title || 'Untitled'}</h4>
                    <p>${item.description ? item.description.substring(0, 80) + '...' : 'No description'}</p>
                    <div class="content-card-footer">
                        <div class="content-card-author">
                            <img src="${item.author_avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(item.author || 'User')}" 
                                 alt="${item.author || 'User'}" 
                                 onerror="this.style.display='none'" />
                            <span>${item.author || 'Anonymous'}</span>
                        </div>
                        <div class="content-card-stats">
                            <span class="stat-hearts"><i class="fas fa-heart"></i> ${hearts}</span>
                            <span class="stat-stars"><i class="fas fa-star"></i> ${item.stars_earned || 0}</span>
                            ${isSaved ? '<span class="stat-saved"><i class="fas fa-bookmark"></i></span>' : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    dom.contentGrid.querySelectorAll('.content-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            openContentDetail(id);
        });
    });
}

function renderFeatured(items) {
    if (!dom.featuredScroll) return;

    if (!items || items.length === 0) {
        dom.featuredScroll.innerHTML = `
            <div class="featured-empty">
                <p>No trending content yet. Be the first!</p>
            </div>
        `;
        return;
    }

    dom.featuredScroll.innerHTML = items.map((item, index) => `
        <div class="featured-card" data-id="${item.id}">
            <div class="featured-card-image">
                <img src="${item.image_url || 'https://placehold.co/300x200/2c2f78/white?text=Trending'}" 
                     alt="${item.title || 'Content'}" 
                     onerror="this.src='https://placehold.co/300x200/2c2f78/white?text=Trending'" />
                <div class="featured-overlay">
                    <span class="featured-rank">#${index + 1}</span>
                </div>
            </div>
            <div class="featured-card-body">
                <h4>${item.title || 'Untitled'}</h4>
                <div class="featured-card-stats">
                    <span><i class="fas fa-heart" style="color: #ef4444;"></i> ${item.hearts || 0}</span>
                    <span><i class="fas fa-eye"></i> ${item.views || 0}</span>
                </div>
            </div>
        </div>
    `).join('');

    dom.featuredScroll.querySelectorAll('.featured-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            openContentDetail(id);
        });
    });
}

function renderPromotionOptions() {
    if (!dom.promotionOptions) return;

    dom.promotionOptions.innerHTML = state.promotionOptions.map(opt => `
        <div class="promotion-card" data-promotion="${opt.id}">
            <div class="promotion-icon"><i class="fas ${opt.icon}"></i></div>
            <div class="promotion-details">
                <h4>${opt.label}</h4>
                <p>${opt.description}</p>
                <span class="promotion-cost">⭐ ${opt.cost} Star${opt.cost > 1 ? 's' : ''}</span>
            </div>
            <button class="btn ${state.starBalance >= opt.cost ? 'btn-gold' : 'btn-outline'} promo-select-btn" 
                    ${state.starBalance < opt.cost ? 'disabled' : ''}>
                ${state.starBalance >= opt.cost ? 'Use ' + opt.cost + ' Star' + (opt.cost > 1 ? 's' : '') : '⭐ Need ' + opt.cost}
            </button>
        </div>
    `).join('');

    dom.promotionOptions.querySelectorAll('.promo-select-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (btn.disabled) {
                showToast('You need more Stars for this promotion. Earn GP to get more!', 'warning');
                return;
            }
            const card = btn.closest('.promotion-card');
            const type = card.dataset.promotion;
            const contentId = state.selectedContent?.id;
            if (!contentId) {
                showToast('Select content first', 'error');
                return;
            }
            handlePromotion(contentId, type);
        });
    });
}

function getTypeIcon(type) {
    const icons = {
        book: 'fa-book',
        talk: 'fa-video',
        bundle: 'fa-layer-group',
        portfolio: 'fa-user-graduate',
        course: 'fa-graduation-cap',
        merchandise: 'fa-shopping-bag'
    };
    return icons[type] || 'fa-file';
}

// ================================================================
// STAR & AMBASSADOR SYSTEM
// ================================================================
async function loadStarBalance() {
    try {
        const balance = await getStarBalance(state.currentUser?.id);
        state.starBalance = balance || 0;
        updateStarDisplay();
    } catch (error) {
        console.error('Error loading star balance:', error);
    }
}

function updateStarDisplay() {
    if (dom.availableStarsDisplay) {
        dom.availableStarsDisplay.textContent = `⭐ ${state.starBalance}`;
    }
}

async function checkAmbassadorStatus(profile) {
    if (!profile) return;
    
    const isAmbassador = profile.progress >= 100 && profile.stars_earned >= 5;
    state.isAmbassador = isAmbassador;
    state.starEarned = profile.stars_earned || 0;
    
    if (isAmbassador && dom.ambassadorBanner) {
        dom.ambassadorBanner.style.display = 'block';
    }
}

// ================================================================
// PROMOTION SYSTEM
// ================================================================
async function handlePromotion(contentId, type) {
    const option = state.promotionOptions.find(o => o.id === type);
    if (!option) return;
    
    if (state.starBalance < option.cost) {
        showToast(`You need ${option.cost} Star(s) for this promotion. Earn more GP!`, 'error');
        return;
    }

    try {
        const result = await useStarsForPromotion(
            state.currentUser.id,
            contentId,
            type,
            option.cost
        );

        if (result.success) {
            showToast(`🎉 ${option.label} activated! Your content is now featured.`, 'success');
            await loadStarBalance();
            await loadContent(true);
            closePromotionModal();
            renderPromotionOptions();
        } else {
            showToast(result.error || 'Failed to activate promotion', 'error');
        }
    } catch (error) {
        console.error('Promotion error:', error);
        showToast('Failed to activate promotion', 'error');
    }
}

// ================================================================
// CONTENT DETAIL
// ================================================================
async function openContentDetail(contentId) {
    try {
        const { data, error } = await supabase
            .from('hub_content')
            .select('*')
            .eq('id', contentId)
            .single();

        if (error || !data) {
            showToast('Content not found', 'error');
            return;
        }

        state.selectedContent = data;

        dom.detailTitle.textContent = data.title || 'Untitled';
        dom.detailImage.src = data.image_url || 'https://placehold.co/600x400/2c2f78/white?text=Content';
        dom.detailImage.alt = data.title || 'Content';
        dom.detailAuthor.textContent = `👤 ${data.author || 'Anonymous'}`;
        dom.detailCategory.textContent = `📂 ${data.type || 'Content'}`;
        dom.detailStars.textContent = `⭐ ${data.stars_earned || 0}`;
        dom.detailDescription.textContent = data.description || 'No description available.';
        dom.heartCount.textContent = data.hearts || 0;

        const isHearted = state.heartedItems.has(data.id);
        dom.detailHeartBtn.innerHTML = isHearted ?
            '<i class="fas fa-heart" style="color: #ef4444;"></i> <span id="heartCount">' + (data.hearts || 0) + '</span>' :
            '<i class="far fa-heart"></i> <span id="heartCount">' + (data.hearts || 0) + '</span>';

        const isSaved = state.savedItems.has(data.id);
        dom.detailSaveBtn.innerHTML = isSaved ? 
            '<i class="fas fa-bookmark"></i> Saved' : 
            '<i class="far fa-bookmark"></i> Save';

        await loadComments(contentId);

        dom.detailModal.classList.add('active');
        document.body.style.overflow = 'hidden';

    } catch (error) {
        console.error('Error loading content detail:', error);
        showToast('Failed to load content details', 'error');
    }
}

async function loadComments(contentId) {
    try {
        const { data, error } = await supabase
            .from('hub_comments')
            .select('*')
            .eq('content_id', contentId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const comments = data || [];
        dom.commentCount.textContent = `(${comments.length})`;

        if (comments.length === 0) {
            dom.commentList.innerHTML = '<p class="text-muted">No comments yet. Be the first!</p>';
            return;
        }

        dom.commentList.innerHTML = comments.map(c => `
            <div class="comment-item">
                <img src="${c.author_avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(c.author || 'User')}" 
                     alt="${c.author || 'User'}" 
                     onerror="this.style.display='none'" />
                <div class="comment-content">
                    <strong>${c.author || 'Anonymous'}</strong>
                    <p>${c.content}</p>
                    <span class="comment-time">${new Date(c.created_at).toLocaleDateString()}</span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading comments:', error);
    }
}

// ================================================================
// INTERACTIONS
// ================================================================
async function handleHeart() {
    if (!state.currentUser) {
        showToast('Sign in to heart content', 'warning');
        return;
    }

    const contentId = state.selectedContent?.id;
    if (!contentId) return;

    try {
        const result = await heartContent(contentId, state.currentUser.id);
        if (result.success) {
            const newCount = result.hearts;
            dom.heartCount.textContent = newCount;
            state.heartedItems.add(contentId);
            dom.detailHeartBtn.innerHTML = 
                '<i class="fas fa-heart" style="color: #ef4444;"></i> <span id="heartCount">' + newCount + '</span>';
            showToast('❤️ You hearted this content!', 'success');
            await loadContent(true);
        }
    } catch (error) {
        console.error('Heart error:', error);
        showToast('Failed to heart content', 'error');
    }
}

async function handleSave() {
    if (!state.currentUser) {
        showToast('Sign in to save content', 'warning');
        return;
    }

    const contentId = state.selectedContent?.id;
    if (!contentId) return;

    try {
        const isSaved = state.savedItems.has(contentId);
        let result;

        if (isSaved) {
            result = await unsaveContent(contentId, state.currentUser.id);
            if (result.success) {
                state.savedItems.delete(contentId);
                dom.detailSaveBtn.innerHTML = '<i class="far fa-bookmark"></i> Save';
                showToast('Removed from saved items', 'info');
            }
        } else {
            result = await saveContent(contentId, state.currentUser.id);
            if (result.success) {
                state.savedItems.add(contentId);
                dom.detailSaveBtn.innerHTML = '<i class="fas fa-bookmark"></i> Saved';
                showToast('📌 Saved to your library!', 'success');
            }
        }
        await loadContent(true);
    } catch (error) {
        console.error('Save error:', error);
        showToast('Failed to save content', 'error');
    }
}

function handleShare() {
    const content = state.selectedContent;
    if (!content) return;

    const shareData = {
        title: content.title || 'Check out this content',
        text: `Check out "${content.title || 'this content'}" on Gliimu Hub!`,
        url: window.location.origin + '/hub?content=' + content.id
    };

    if (navigator.share) {
        navigator.share(shareData).catch(() => {});
    } else {
        navigator.clipboard.writeText(shareData.url).then(() => {
            showToast('📋 Link copied to clipboard!', 'success');
        }).catch(() => {
            const input = document.createElement('input');
            input.value = shareData.url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            showToast('📋 Link copied!', 'success');
        });
    }
}

// ================================================================
// COMMENT
// ================================================================
async function handleComment() {
    if (!state.currentUser) {
        showToast('Sign in to comment', 'warning');
        return;
    }

    const content = dom.commentInput.value.trim();
    if (!content) {
        showToast('Please enter a comment', 'error');
        return;
    }

    const contentId = state.selectedContent?.id;
    if (!contentId) return;

    try {
        const result = await addComment({
            content_id: contentId,
            user_id: state.currentUser.id,
            author: state.currentProfile?.name || 'User',
            author_avatar: state.currentProfile?.avatar_url,
            content: content
        });

        if (result.success) {
            showToast('💬 Comment added! (+2 GP)', 'success');
            dom.commentInput.value = '';
            await loadComments(contentId);
        } else {
            showToast(result.error || 'Failed to add comment', 'error');
        }
    } catch (error) {
        console.error('Comment error:', error);
        showToast('Failed to add comment', 'error');
    }
}

// ================================================================
// CREATE CONTENT
// ================================================================
async function handleCreateContent(e) {
    e.preventDefault();

    if (!state.currentUser) {
        showToast('Sign in to create content', 'warning');
        return;
    }

    const formData = {
        type: document.getElementById('contentType').value,
        title: document.getElementById('contentTitle').value.trim(),
        description: document.getElementById('contentDescription').value.trim(),
        tags: document.getElementById('contentTags').value.split(',').map(t => t.trim()).filter(Boolean),
        image_url: document.getElementById('contentImage').value.trim(),
        content_url: document.getElementById('contentUrl').value.trim(),
        author: state.currentProfile?.name || state.currentUser.email,
        author_id: state.currentUser.id,
        author_avatar: state.currentProfile?.avatar_url
    };

    if (!formData.type || !formData.title || !formData.description) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    try {
        const result = await createContent(formData);
        if (result.success) {
            showToast('🎉 Content published! You earned 25 GP!', 'success');
            dom.createModal.classList.remove('active');
            document.body.style.overflow = '';
            dom.createForm.reset();
            await loadContent(true);
            await loadTrending();
        } else {
            showToast(result.error || 'Failed to create content', 'error');
        }
    } catch (error) {
        console.error('Create content error:', error);
        showToast('Failed to create content', 'error');
    }
}

// ================================================================
// MODAL CONTROLS
// ================================================================
function openPromotionModal() {
    dom.promotionModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    dom.promotionConfirmation.style.display = 'none';
    updateStarDisplay();
    renderPromotionOptions();
}

function closePromotionModal() {
    dom.promotionModal.classList.remove('active');
    document.body.style.overflow = '';
}

function openCreateModal() {
    if (!state.currentUser) {
        showToast('Sign in to create content', 'warning');
        return;
    }
    dom.createModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeCreateModal() {
    dom.createModal.classList.remove('active');
    document.body.style.overflow = '';
}

// ================================================================
// STATS
// ================================================================
function updateStats() {
    const stats = {
        creators: '12,847',
        content: '4,231',
        stars: '87,429',
        live: '1,247'
    };
    
    if (dom.totalCreators) dom.totalCreators.textContent = stats.creators;
    if (dom.totalContent) dom.totalContent.textContent = stats.content;
    if (dom.totalStars) dom.totalStars.textContent = stats.stars;
    if (dom.liveCount) dom.liveCount.textContent = stats.live;
}

// ================================================================
// PARTICLES EFFECT
// ================================================================
function initParticles() {
    const container = document.getElementById('particles');
    if (!container) return;

    const particleCount = 40;
    const colors = ['#fbb040', '#2c2f78', '#ffffff', '#8b5cf6', '#fcd48c'];

    container.innerHTML = '';

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        const size = Math.random() * 6 + 2;
        const duration = Math.random() * 25 + 15;
        const delay = Math.random() * 5;
        const xOffset = (Math.random() - 0.5) * 100;
        const yOffset = (Math.random() - 0.5) * 100;
        
        particle.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            border-radius: 50%;
            opacity: ${Math.random() * 0.4 + 0.1};
            top: ${Math.random() * 100}%;
            left: ${Math.random() * 100}%;
            transform: translate(${xOffset}px, ${yOffset}px);
            animation: floatParticle ${duration}s ease-in-out infinite;
            animation-delay: ${delay}s;
        `;
        container.appendChild(particle);
    }
}

// ================================================================
// EVENT LISTENERS
// ================================================================
function setupEventListeners() {
    // --- Filter buttons ---
    dom.filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            dom.filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentFilter = btn.dataset.filter;
            applyFilters();
        });
    });

    // --- Search ---
    dom.searchBtn.addEventListener('click', () => {
        state.searchQuery = dom.searchInput.value;
        applyFilters();
    });

    dom.searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            state.searchQuery = dom.searchInput.value;
            applyFilters();
        }
    });

    // --- Load more ---
    dom.loadMoreBtn.addEventListener('click', () => loadContent(false));

    // --- Create content ---
    dom.createContentBtn.addEventListener('click', openCreateModal);
    dom.emptyCreateBtn.addEventListener('click', openCreateModal);
    dom.closeCreateModal.addEventListener('click', closeCreateModal);

    // --- Close modals ---
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    // Close on overlay click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    // --- Detail interactions ---
    dom.detailHeartBtn.addEventListener('click', handleHeart);
    dom.detailSaveBtn.addEventListener('click', handleSave);
    dom.detailShareBtn.addEventListener('click', handleShare);
    dom.detailPromoteBtn.addEventListener('click', () => {
        dom.detailModal.classList.remove('active');
        document.body.style.overflow = '';
        setTimeout(openPromotionModal, 300);
    });
    dom.closeDetailModal.addEventListener('click', () => {
        dom.detailModal.classList.remove('active');
        document.body.style.overflow = '';
    });

    // --- Comment ---
    dom.commentSubmitBtn.addEventListener('click', handleComment);
    dom.commentInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handleComment();
    });

    // --- Promotion ---
    dom.closePromotionModal.addEventListener('click', closePromotionModal);
    dom.promotionDoneBtn.addEventListener('click', () => {
        closePromotionModal();
        dom.detailModal.classList.remove('active');
        document.body.style.overflow = '';
    });

    // --- Ambassador claim ---
    dom.claimPromoBtn.addEventListener('click', async () => {
        if (!state.currentUser) {
            showToast('Sign in to claim', 'warning');
            return;
        }

        try {
            const result = await claimFreePromotion(state.currentUser.id);
            if (result.success) {
                showToast('🎉 Free 24-hour promotion claimed!', 'success');
                dom.ambassadorBanner.style.display = 'none';
                await loadContent(true);
                await loadTrending();
            } else {
                showToast(result.error || 'Failed to claim promotion', 'error');
            }
        } catch (error) {
            console.error('Claim promo error:', error);
            showToast('Failed to claim promotion', 'error');
        }
    });

    // --- Create form ---
    dom.createForm.addEventListener('submit', handleCreateContent);

    // --- Keyboard shortcuts ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            });
            if (dom.shareModal && dom.shareModal.classList.contains('active')) {
                window.closeShareModal();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            dom.searchInput.focus();
        }
    });
}

// ================================================================
// BOOT
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    init();
});

// Export for use in other modules
export default {
    init,
    loadContent,
    loadTrending,
    applyFilters,
    renderContent,
    renderFeatured,
    openContentDetail,
    openPromotionModal,
    closePromotionModal,
    handleHeart,
    handleSave,
    handleShare,
    handleComment,
    handleCreateContent
};
