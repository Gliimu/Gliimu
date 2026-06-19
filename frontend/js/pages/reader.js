// ============================================
// GLIIMU READER - Complete JavaScript
// ============================================

// ============================================
// SUPABASE CLIENT
// ============================================
const SUPABASE_URL = 'https://vsgvscemqtqgolrindcx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3ZzY2VtcXRxZ29scmluZGN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTk1NDksImV4cCI6MjA5NjM3NTU0OX0.IUNvIleBOKGTIjTg-vx-v0wNLZEk9IVWGouvVIDlo40';

let supabaseClient = null;

// ============================================
// DETECT DEVICE
// ============================================
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(navigator.userAgent);
const isMobile = isIOS || isAndroid || /Mobi/.test(navigator.userAgent);
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

console.log('📱 Device:', isIOS ? 'iOS' : isAndroid ? 'Android' : 'Desktop');

// ============================================
// STATE
// ============================================
let currentUser = null;
let isAuthorized = false;
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let isDarkMode = false;
let autoSaveTimer = null;
let currentItemId = null;
let isRendering = false;
let pageCache = {};
let usingGoogleDocs = false;
let fileUrl = null;
let isCompleted = false;
let hasClaimedGP = false;
let userId = null;

// ============================================
// DOM REFS
// ============================================
const pageWrapper = document.getElementById('pageWrapper');
const bookTitle = document.getElementById('bookTitle');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const loadingSub = document.getElementById('loadingSub');
const loadingSpinner = document.getElementById('loadingSpinner');
const authOverlay = document.getElementById('authOverlay');
const authTitle = document.getElementById('authTitle');
const authMessage = document.getElementById('authMessage');
const completedOverlay = document.getElementById('completedOverlay');
const completedMessage = document.getElementById('completedMessage');
const gpRewardDisplay = document.getElementById('gpRewardDisplay');
const pageInfo = document.getElementById('pageInfo');
const progressFill = document.getElementById('progressFill');
const progressContainer = document.getElementById('progressContainer');
const themeBtn = document.getElementById('themeBtn');
const themeIcon = document.getElementById('themeIcon');
const readerContainer = document.getElementById('readerContainer');
const confettiCanvas = document.getElementById('confettiCanvas');

// ============================================
// GET URL PARAMETERS
// ============================================
const urlParams = new URLSearchParams(window.location.search);
fileUrl = urlParams.get('url');
const title = urlParams.get('title') || 'Book';
const itemId = urlParams.get('itemId') || '';

bookTitle.textContent = title;
currentItemId = itemId;

console.log('📄 File URL:', fileUrl);
console.log('📚 Item ID:', currentItemId);

// ============================================
// LOAD SUPABASE
// ============================================
function loadSupabase() {
    return new Promise(function(resolve, reject) {
        if (typeof supabase !== 'undefined' && supabase) {
            supabaseClient = supabase;
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/dist/umd/supabase.min.js';
        script.onload = function() {
            if (window.supabase) {
                supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                resolve();
            } else {
                reject(new Error('Supabase failed to load'));
            }
        };
        script.onerror = function() {
            reject(new Error('Supabase library could not be loaded'));
        };
        document.head.appendChild(script);
    });
}

// ============================================
// AUTHENTICATION - WITH CROSS-TAB SUPPORT
// ============================================

// Wait for auth session to restore (cross-tab fix)
function waitForAuth() {
    return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 20;
        const interval = 300;

        const checkAuth = async () => {
            attempts++;
            try {
                const { data: { session }, error } = await supabaseClient.auth.getSession();
                if (session) {
                    resolve(true);
                    return;
                }
                if (attempts >= maxAttempts) {
                    resolve(false);
                    return;
                }
                setTimeout(checkAuth, interval);
            } catch (e) {
                if (attempts >= maxAttempts) {
                    resolve(false);
                } else {
                    setTimeout(checkAuth, interval);
                }
            }
        };
        checkAuth();
    });
}

async function getCurrentUser() {
    try {
        const hasSession = await waitForAuth();
        if (!hasSession) return null;
        const { data: { user }, error } = await supabaseClient.auth.getUser();
        if (error) {
            console.error('❌ Auth error:', error);
            return null;
        }
        return user;
    } catch (e) {
        console.error('Error getting user:', e);
        return null;
    }
}

async function checkPurchase(userId, itemId) {
    if (!userId || !itemId) return false;
    try {
        const { data, error } = await supabaseClient
            .from('user_purchases')
            .select('id, purchase_type, amount')
            .eq('user_id', userId)
            .eq('item_id', itemId)
            .maybeSingle();

        if (error) {
            console.error('Purchase check error:', error);
            return false;
        }
        if (data) {
            console.log('✅ User has purchased this item');
            return true;
        }

        // Check if free
        const { data: item, error: itemError } = await supabaseClient
            .from('hub_contents')
            .select('price, physical_price, audio_price')
            .eq('id', itemId)
            .single();

        if (itemError) {
            console.error('Item fetch error:', itemError);
            return false;
        }

        const isFree = (item.price === 0 || item.price === null) &&
                       (item.physical_price === 0 || item.physical_price === null) &&
                       (item.audio_price === 0 || item.audio_price === null);

        return isFree;
    } catch (e) {
        console.error('Error checking purchase:', e);
        return false;
    }
}

async function getItemData(itemId) {
    try {
        const { data, error } = await supabaseClient
            .from('hub_contents')
            .select('*')
            .eq('id', itemId)
            .single();
        if (error) {
            console.error('Item fetch error:', error);
            return null;
        }
        return data;
    } catch (e) {
        console.error('Error fetching item:', e);
        return null;
    }
}

// ============================================
// AUTHORIZATION CHECK - WITH SMART REDIRECT
// ============================================
async function checkAuthorization() {
    console.log('🔐 Checking authorization...');

    showLoading('Checking access...', 'Verifying your account');

    // Wait for auth to be ready
    currentUser = await getCurrentUser();

    // SCENARIO 1: NOT SIGNED IN
    if (!currentUser) {
        console.log('❌ User not signed in');
        showAuthRequired(
            'Sign In Required',
            'Please sign in to access this content.'
        );
        return false;
    }

    userId = currentUser.id;
    console.log('✅ User signed in:', currentUser.email);

    // SCENARIO 2: CHECK PURCHASE
    const hasPurchased = await checkPurchase(currentUser.id, currentItemId);

    // SCENARIO 3: SIGNED IN BUT NOT PURCHASED
    if (!hasPurchased) {
        console.log('❌ User has NOT purchased this content');
        console.log('🔄 Redirecting to hub with modal open...');
        
        showLoading('Redirecting...', 'Taking you to the hub to view content');
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const hubUrl = `/hub.html?open=${encodeURIComponent(currentItemId)}`;
        window.location.href = hubUrl;
        return false;
    }

    // SCENARIO 4: SIGNED IN AND PURCHASED
    console.log('✅ User has purchased this content');
    isAuthorized = true;
    return true;
}

// ============================================
// UI HELPERS
// ============================================
function showLoading(message, sub) {
    loadingOverlay.classList.remove('hidden');
    loadingSpinner.style.display = 'block';
    loadingText.textContent = message || 'Loading...';
    loadingSub.textContent = sub || 'This may take a moment';
    authOverlay.style.display = 'none';
    completedOverlay.style.display = 'none';
    pageWrapper.style.display = 'none';
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
    pageWrapper.style.display = 'flex';
}

function showAuthRequired(title, message) {
    authOverlay.style.display = 'flex';
    authTitle.textContent = title;
    authMessage.textContent = message;
    loadingOverlay.classList.add('hidden');
    pageWrapper.style.display = 'none';
    pageInfo.textContent = '🔒 Access Denied';
    progressFill.style.width = '0%';
}

function goToLogin() {
    window.location.href = '/signin.html?redirect=' + encodeURIComponent(window.location.href);
}

function goToHub() {
    window.location.href = '/hub.html';
}

// ============================================
// COMPLETION & GP CLAIM
// ============================================
async function claimCompletionGP() {
    if (hasClaimedGP) return;
    if (!currentUser || !currentItemId) return;

    try {
        const { data: existing } = await supabaseClient
            .from('user_activities')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('item_id', currentItemId)
            .eq('activity_type', 'completed_book')
            .maybeSingle();

        if (existing) {
            hasClaimedGP = true;
            showToast('✅ GP already claimed for this book!', 'info');
            return;
        }

        const gpAmount = 5;
        
        const { data: userData } = await supabaseClient
            .from('users')
            .select('gp_points')
            .eq('id', currentUser.id)
            .single();

        const newGP = (userData?.gp_points || 0) + gpAmount;

        await supabaseClient
            .from('users')
            .update({ gp_points: newGP })
            .eq('id', currentUser.id);

        await supabaseClient
            .from('user_activities')
            .insert({
                user_id: currentUser.id,
                item_id: currentItemId,
                activity_type: 'completed_book',
                gp_earned: gpAmount,
                created_at: new Date().toISOString()
            });

        hasClaimedGP = true;
        showToast(`🎉 +${gpAmount} GP earned for completing this book!`, 'success');
        showCompletionCelebration(gpAmount);

    } catch (e) {
        console.error('Error claiming GP:', e);
        showToast('Error claiming GP. Please try again.', 'error');
    }
}

function showCompletionCelebration(gpAmount) {
    completedOverlay.style.display = 'flex';
    completedMessage.textContent = `You've completed "${bookTitle.textContent}"!`;
    gpRewardDisplay.textContent = `+${gpAmount} GP`;
    startConfetti();
    loadingOverlay.classList.add('hidden');
    pageWrapper.style.display = 'none';
}

function markAsCompleted() {
    if (isCompleted) return;
    isCompleted = true;
    claimCompletionGP();
}

// ============================================
// CONFETTI
// ============================================
let confettiPieces = [];
let confettiAnimationId = null;

function startConfetti() {
    const ctx = confettiCanvas.getContext('2d');
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;

    const colors = ['#fbb040', '#2c2f78', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'];
    
    for (let i = 0; i < 150; i++) {
        confettiPieces.push({
            x: Math.random() * confettiCanvas.width,
            y: Math.random() * confettiCanvas.height - confettiCanvas.height,
            w: Math.random() * 10 + 5,
            h: Math.random() * 6 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            speed: Math.random() * 3 + 1,
            drift: Math.random() * 2 - 1,
            opacity: Math.random() * 0.8 + 0.2
        });
    }

    animateConfetti();
}

function animateConfetti() {
    const ctx = confettiCanvas.getContext('2d');
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

    let active = false;

    for (const piece of confettiPieces) {
        piece.y += piece.speed;
        piece.x += piece.drift;
        piece.rotation += 2;

        if (piece.y < confettiCanvas.height + 20) {
            active = true;
        }

        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate((piece.rotation * Math.PI) / 180);
        ctx.globalAlpha = piece.opacity;
        ctx.fillStyle = piece.color;
        ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        ctx.restore();
    }

    if (active) {
        confettiAnimationId = requestAnimationFrame(animateConfetti);
    } else {
        confettiPieces = [];
        ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
}

function stopConfetti() {
    if (confettiAnimationId) {
        cancelAnimationFrame(confettiAnimationId);
        confettiAnimationId = null;
    }
    const ctx = confettiCanvas.getContext('2d');
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confettiPieces = [];
}

// ============================================
// GOOGLE DOCS FALLBACK
// ============================================
function loadGoogleDocs() {
    usingGoogleDocs = true;
    
    pageWrapper.innerHTML = '';
    pageWrapper.style.display = 'none';
    
    const iframe = document.createElement('iframe');
    iframe.className = 'google-docs-viewer';
    const encodedUrl = encodeURIComponent(fileUrl);
    iframe.src = `https://docs.google.com/viewer?url=${encodedUrl}&embedded=true`;
    iframe.title = 'Google Docs PDF Viewer';
    iframe.loading = 'eager';
    
    readerContainer.appendChild(iframe);
    
    pageInfo.textContent = '📄 Google Docs Viewer';
    progressFill.style.width = '0%';
    hideLoading();
    
    showToast('📄 Using Google Docs viewer', 'info');
    saveProgress();
}

// ============================================
// LOAD PDF.JS
// ============================================
function loadPDFJS() {
    return new Promise(function(resolve, reject) {
        if (typeof pdfjsLib !== 'undefined' && pdfjsLib.version) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
        script.crossOrigin = 'anonymous';
        
        script.onload = function() {
            if (typeof pdfjsLib !== 'undefined') {
                try {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = null;
                    pdfjsLib.GlobalWorkerOptions.useWorkerFetch = false;
                } catch (e) {}
                resolve();
            } else {
                reject(new Error('PDF.js failed to initialize'));
            }
        };
        
        script.onerror = function() {
            const fallbackScript = document.createElement('script');
            fallbackScript.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.min.js';
            fallbackScript.crossOrigin = 'anonymous';
            fallbackScript.onload = function() {
                if (typeof pdfjsLib !== 'undefined') {
                    try {
                        pdfjsLib.GlobalWorkerOptions.workerSrc = null;
                        pdfjsLib.GlobalWorkerOptions.useWorkerFetch = false;
                    } catch (e) {}
                    resolve();
                } else {
                    reject(new Error('PDF.js failed to load from fallback'));
                }
            };
            fallbackScript.onerror = function() {
                reject(new Error('PDF.js library could not be loaded'));
            };
            document.head.appendChild(fallbackScript);
        };
        
        document.head.appendChild(script);
    });
}

// ============================================
// RENDER ALL PAGES - Continuous Scroll
// ============================================
let allPagesRendered = false;
let totalRenderedPages = 0;

async function renderAllPages() {
    if (!pdfDoc || usingGoogleDocs || allPagesRendered) return;
    
    console.log('📄 Rendering all pages for continuous scroll...');
    showLoading('Loading book...', 'Rendering pages for smooth reading');
    
    try {
        // Clear existing content
        pageWrapper.innerHTML = '';
        
        // Get container width
        const containerWidth = readerContainer.clientWidth - 30;
        
        // Render each page
        for (let i = 1; i <= totalPages; i++) {
            const page = await pdfDoc.getPage(i);
            
            // Calculate scale to fit width
            const viewport = page.getViewport({ scale: 1 });
            const scale = Math.min((containerWidth / viewport.width) * 1.0, 1.5);
            const scaledViewport = page.getViewport({ scale: scale });
            
            // Create page container
            const pageContainer = document.createElement('div');
            pageContainer.className = 'pdf-page-container';
            pageContainer.style.cssText = `
                width: 100%;
                margin-bottom: 16px;
                display: flex;
                justify-content: center;
                position: relative;
            `;
            
            // Create canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;
            canvas.style.width = scaledViewport.width + 'px';
            canvas.style.height = scaledViewport.height + 'px';
            canvas.style.boxShadow = '0 2px 16px var(--shadow-color)';
            canvas.style.borderRadius = '6px';
            canvas.style.background = 'var(--reader-bg)';
            canvas.dataset.page = i;
            
            // Render page
            const renderContext = {
                canvasContext: context,
                viewport: scaledViewport,
            };
            
            await page.render(renderContext).promise;
            
            // Add page number label
            const pageLabel = document.createElement('div');
            pageLabel.className = 'page-label';
            pageLabel.style.cssText = `
                position: absolute;
                bottom: -20px;
                right: 10px;
                font-size: 0.7rem;
                color: var(--text-secondary);
                opacity: 0.6;
                font-family: 'Space Grotesk', sans-serif;
            `;
            pageLabel.textContent = `Page ${i} of ${totalPages}`;
            
            pageContainer.appendChild(canvas);
            pageContainer.appendChild(pageLabel);
            pageWrapper.appendChild(pageContainer);
            
            totalRenderedPages = i;
            
            // Update progress
            const progress = (i / totalPages) * 100;
            progressFill.style.width = progress + '%';
            
            // Small delay to let the browser breathe
            if (i % 3 === 0) {
                await new Promise(r => setTimeout(r, 10));
            }
        }
        
        allPagesRendered = true;
        hideLoading();
        
        // Update page info
        pageInfo.textContent = `📖 ${totalPages} pages loaded`;
        
        // Apply dark mode to all canvases
        applyDarkModeToAllPages();
        
        // Check if completed (all pages rendered)
        currentPage = totalPages;
        checkIfCompleted();
        
        console.log('✅ All ' + totalPages + ' pages rendered successfully!');
        
    } catch (error) {
        console.error('Render all pages error:', error);
        showToast('Error rendering pages. Please try again.', 'error');
    }
}

function applyDarkModeToAllPages() {
    const isDark = document.body.classList.contains('dark-mode');
    const canvases = pageWrapper.querySelectorAll('canvas');
    canvases.forEach(canvas => {
        if (isDark) {
            canvas.style.filter = 'invert(0.85) hue-rotate(180deg) brightness(1.2) contrast(1.1)';
        } else {
            canvas.style.filter = 'none';
        }
    });
}

// ============================================
// CHECK IF COMPLETED
// ============================================
function checkIfCompleted() {
    if (isCompleted) return;
    if (usingGoogleDocs) return;
    if (currentPage >= totalPages && totalPages > 0) {
        isCompleted = true;
        
        const actions = document.querySelector('.reader-footer .actions');
        const existingBtn = actions.querySelector('.completed-btn');
        if (!existingBtn) {
            const btn = document.createElement('button');
            btn.className = 'completed-btn';
            btn.innerHTML = '<i class="fas fa-star"></i> Completed! Claim GP';
            btn.onclick = markAsCompleted;
            actions.appendChild(btn);
        }
    }
}

// ============================================
// NAVIGATION
// ============================================
window.nextPage = function() {
    if (usingGoogleDocs) {
        showToast('Page navigation not available in Google Docs view', 'info');
        return;
    }
    if (currentPage < totalPages) {
        renderPage(currentPage + 1);
    } else {
        showToast("You're on the last page", 'info');
        if (!isCompleted) {
            isCompleted = true;
            const actions = document.querySelector('.reader-footer .actions');
            const existingBtn = actions.querySelector('.completed-btn');
            if (!existingBtn) {
                const btn = document.createElement('button');
                btn.className = 'completed-btn';
                btn.innerHTML = '<i class="fas fa-star"></i> Completed! Claim GP';
                btn.onclick = markAsCompleted;
                actions.appendChild(btn);
            }
        }
    }
};

window.prevPage = function() {
    if (usingGoogleDocs) {
        showToast('Page navigation not available in Google Docs view', 'info');
        return;
    }
    if (currentPage > 1) {
        renderPage(currentPage - 1);
    } else {
        showToast("You're on the first page", 'info');
    }
};

// ============================================
// PROGRESS TRACKING
// ============================================
function updateProgress() {
    if (usingGoogleDocs) return;
    // Progress is updated during renderAllPages
    // This is now handled by the scroll listener
}

// Add scroll progress tracking
function setupScrollProgress() {
    readerContainer.addEventListener('scroll', function() {
        if (!allPagesRendered) return;
        
        const scrollTop = readerContainer.scrollTop;
        const scrollHeight = readerContainer.scrollHeight - readerContainer.clientHeight;
        
        if (scrollHeight > 0) {
            const progress = (scrollTop / scrollHeight) * 100;
            progressFill.style.width = progress + '%';
        }
    });
}

function saveProgress() {
    try {
        const progressData = {
            itemId: currentItemId,
            title: bookTitle.textContent,
            currentPage: currentPage,
            totalPages: totalPages,
            progress: (currentPage / totalPages) * 100,
            lastRead: new Date().toISOString(),
            usingGoogleDocs: usingGoogleDocs,
            isCompleted: isCompleted
        };
        localStorage.setItem('reader_progress_' + (currentItemId || bookTitle.textContent), JSON.stringify(progressData));
    } catch (e) {}
}

function loadSavedProgress() {
    try {
        const saved = localStorage.getItem('reader_progress_' + (currentItemId || bookTitle.textContent));
        if (saved) {
            const data = JSON.parse(saved);
            if (data.currentPage && data.currentPage <= totalPages) {
                currentPage = data.currentPage;
                if (data.isCompleted) {
                    isCompleted = true;
                }
                return true;
            }
        }
    } catch (e) {}
    return false;
}

// ============================================
// THEME TOGGLE
// ============================================
window.toggleTheme = function() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    
    themeIcon.className = isDarkMode ? 'fas fa-sun' : 'fas fa-moon';
    
    localStorage.setItem('reader_theme', isDarkMode ? 'dark' : 'light');
    
    // Apply dark mode to all canvases
    if (pdfDoc && !usingGoogleDocs) {
        applyDarkModeToAllPages();
    }

    showToast(isDarkMode ? '🌙 Dark mode activated' : '☀️ Light mode activated', 'success');
};

// ============================================
// CLOSE & REPORT
// ============================================
window.closeReader = function() {
    saveProgress();
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    stopConfetti();
    try { window.close(); } catch (e) { window.location.href = '/hub.html'; }
};

window.reportIssue = function() {
    if (confirm('Report an issue with this book? Our team will investigate.')) {
        showToast('Thank you for reporting!', 'success');
    }
};

// ============================================
// TOAST
// ============================================
function showToast(message, type) {
    type = type || 'info';
    const existing = document.querySelector('.reader-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'reader-toast ' + type;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
}

// ============================================
// MAIN INIT
// ============================================
async function initReader() {
    if (!fileUrl) {
        showAuthRequired('No Book Found', 'No content URL was provided. Please go back and try again.');
        return;
    }

    // 1. Check Authorization
    const authorized = await checkAuthorization();
    if (!authorized) return;

   // 2. Load PDF
showLoading('Loading PDF library...');

try {
    await loadPDFJS();

    showLoading('Opening book...', 'Loading the PDF file');

    const response = await fetch(fileUrl);
    const pdfData = await response.arrayBuffer();

    const loadingTask = pdfjsLib.getDocument({
        data: pdfData,
        useSystemFonts: true,
        disableFontFace: false,
        disableRange: true,
        disableStream: true,
        disableAutoFetch: true,
        useWorkerFetch: false,
        isEvalSupported: false
    });

      pdfDoc = await loadingTask.promise;
    totalPages = pdfDoc.numPages;
    pageInfo.textContent = 'Loading ' + totalPages + ' pages...';

    console.log('📚 PDF loaded: ' + totalPages + ' pages');

    // Load saved progress
    const hasProgress = loadSavedProgress();
    
    // RENDER ALL PAGES FOR CONTINUOUS SCROLL
    await renderAllPages();
    
    // ✅ SETUP SCROLL PROGRESS TRACKING - PASTE HERE
    setupScrollProgress();
    
    hideLoading();

    // Scroll to saved position if progress exists
    if (hasProgress && currentPage > 1) {
        const containers = pageWrapper.querySelectorAll('.pdf-page-container');
        if (containers[currentPage - 1]) {
            setTimeout(() => {
                containers[currentPage - 1].scrollIntoView({ behavior: 'smooth' });
            }, 500);
        }
    }

    if (autoSaveTimer) clearInterval(autoSaveTimer);
    autoSaveTimer = setInterval(saveProgress, 5000);

    showToast('✅ Book loaded successfully!', 'success');

    if (isCompleted) {
        const actions = document.querySelector('.reader-footer .actions');
        const existingBtn = actions.querySelector('.completed-btn');
        if (!existingBtn) {
            const btn = document.createElement('button');
            btn.className = 'completed-btn';
            btn.innerHTML = '<i class="fas fa-star"></i> Completed! Claim GP';
            btn.onclick = markAsCompleted;
            actions.appendChild(btn);
        }
    }

} catch (error) {
    console.error('PDF loading error:', error);
    
    if (isMobile || isSafari) {
        showLoading('PDF.js failed, using Google Docs...', 'Opening in Google Docs viewer');
        setTimeout(function() {
            loadGoogleDocs();
        }, 1000);
    } else {
        showToast('Could not load the book. Please try again.', 'error');
    }
}

// ============================================
// START
// ============================================
window.addEventListener('beforeunload', saveProgress);
window.addEventListener('resize', function() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
});

async function start() {
    try {
        await loadSupabase();
    } catch (e) {
        console.warn('Supabase load warning:', e);
        if (typeof supabase !== 'undefined') {
            supabaseClient = supabase;
        }
    }
    
    // Apply theme from localStorage
    const savedTheme = localStorage.getItem('reader_theme');
    if (savedTheme === 'dark') {
        isDarkMode = true;
        document.body.classList.add('dark-mode');
        themeIcon.className = 'fas fa-sun';
    }
    
    setTimeout(initReader, 200);
}

start();

// ============================================
// EXPOSE FUNCTIONS TO GLOBAL SCOPE (FIXES BUTTONS)
// ============================================
window.goToLogin = goToLogin;
window.goToHub = goToHub;
window.nextPage = nextPage;
window.prevPage = prevPage;
window.toggleTheme = toggleTheme;
window.closeReader = closeReader;
window.reportIssue = reportIssue;
window.showToast = showToast;
window.markAsCompleted = markAsCompleted;

console.log('📚 Gliimu Professional Reader with Cross-Tab Auth Support');
