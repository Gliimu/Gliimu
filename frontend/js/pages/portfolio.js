// ============================================
// PUBLIC PORTFOLIO PAGE - WITH BETTER SEARCH
// ============================================

import { supabase } from '../modules/supabase.js';
import { getStudentPortfolio } from '../modules/progression.js';

// Get username from URL (supports both /u/username and ?user=name)
function getUsernameFromUrl() {
    // Check path for /u/username format
    const path = window.location.pathname;
    const pathMatch = path.match(/\/u\/([^\/]+)/);
    if (pathMatch) {
        return decodeURIComponent(pathMatch[1]);
    }
    
    // Check query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const queryUser = urlParams.get('user');
    if (queryUser) {
        return decodeURIComponent(queryUser);
    }
    
    return null;
}

async function loadPortfolio() {
    const container = document.getElementById('portfolioContent');
    const usernameParam = getUsernameFromUrl();
    
    if (!usernameParam) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-user-slash"></i><h3>No User Specified</h3><a href="/" class="btn-primary">Go Home</a></div>`;
        return;
    }
    
    // Convert hyphenated username to searchable name
    const searchName = usernameParam.replace(/-/g, ' ');
    
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading portfolio...</div>';
    
    try {
        // Try multiple search methods
        let user = null;
        
        // Method 1: Exact match
        let { data: exactMatch } = await supabase
            .from('users')
            .select('id, name, avatar_url, role')
            .ilike('name', searchName)
            .maybeSingle();
        
        if (exactMatch) {
            user = exactMatch;
        }
        
        // Method 2: Partial match (if exact fails)
        if (!user) {
            const nameParts = searchName.split(' ');
            const firstName = nameParts[0];
            
            let { data: partialMatch } = await supabase
                .from('users')
                .select('id, name, avatar_url, role')
                .ilike('name', `${firstName}%`)
                .limit(1)
                .maybeSingle();
            
            if (partialMatch) {
                user = partialMatch;
            }
        }
        
        // Method 3: Check by username field if it exists
        if (!user) {
            let { data: usernameMatch } = await supabase
                .from('users')
                .select('id, name, avatar_url, role')
                .eq('username', usernameParam)
                .maybeSingle();
            
            if (usernameMatch) {
                user = usernameMatch;
            }
        }
        
        if (!user) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-slash"></i>
                    <h3>Student Not Found</h3>
                    <p>No portfolio found for "${usernameParam}".</p>
                    <p><small>Try checking the spelling or contact the student for their correct profile name.</small></p>
                    <a href="/" class="btn-primary" style="margin-top: 1rem;">Go Home</a>
                </div>
            `;
            return;
        }
        
        // Get portfolio items
        const portfolioItems = await getStudentPortfolio(user.id, true);
        
        // Get student stats
        const { data: scoreData } = await supabase
            .from('student_scores')
            .select('current_score, current_badge')
            .eq('student_id', user.id)
            .single();
        
        const badgeName = scoreData?.current_badge || 'starter';
        const badgeConfig = {
            starter: { name: 'Starter', icon: '🌱', color: '#10b981' },
            diploma: { name: 'Diploma', icon: '📜', color: '#3b82f6' },
            advanced: { name: 'Advanced Diploma', icon: '🎓', color: '#8b5cf6' },
            mastery: { name: 'Mastery', icon: '🏆', color: '#f59e0b' },
            ambassador: { name: 'Ambassador', icon: '👑', color: '#ef4444' }
        };
        
        const badge = badgeConfig[badgeName] || badgeConfig.starter;
        
        container.innerHTML = `
            <div class="student-profile-header">
                <div class="student-avatar-large">
                    <img src="${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=fbb040&color=fff`}" alt="${user.name}">
                </div>
                <div class="student-info-large">
                    <h1>${escapeHtml(user.name)}</h1>
                    <p>Media Architect in Training</p>
                    <div class="student-badge" style="background: ${badge.color}20; color: ${badge.color}">
                        ${badge.icon} ${badge.name} Level
                    </div>
                </div>
                <div class="student-stats">
                    <div class="stat-box">
                        <div class="stat-number">${scoreData?.current_score || 0}%</div>
                        <div class="stat-label">Mastery Score</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-number">${portfolioItems.length}</div>
                        <div class="stat-label">Projects</div>
                    </div>
                </div>
            </div>
            
            <div class="portfolio-tabs">
                <button class="portfolio-tab active" data-tab="all">All Work</button>
                <button class="portfolio-tab" data-tab="answer">Written Answers</button>
                <button class="portfolio-tab" data-tab="file">Projects</button>
                <button class="portfolio-tab" data-tab="debate">Debates</button>
                <button class="portfolio-tab" data-tab="mvp">MVP</button>
            </div>
            
            <div id="portfolioGrid" class="portfolio-grid">
                ${renderPortfolioItems(portfolioItems, 'all')}
            </div>
        `;
        
        // Tab switching
        document.querySelectorAll('.portfolio-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.getAttribute('data-tab');
                document.querySelectorAll('.portfolio-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('portfolioGrid').innerHTML = renderPortfolioItems(portfolioItems, tabId);
            });
        });
        
    } catch (error) {
        console.error('Error loading portfolio:', error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error Loading Portfolio</h3><button class="btn-primary" onclick="location.reload()">Try Again</button></div>`;
    }
}

function renderPortfolioItems(items, filter) {
    const filtered = items.filter(item => filter === 'all' ? true : item.type === filter);
    
    if (filtered.length === 0) {
        return `<div class="empty-state"><i class="fas fa-folder-open"></i><h3>No items yet</h3><p>This student hasn't added any ${filter} items.</p></div>`;
    }
    
    return filtered.map(item => `
        <div class="portfolio-card">
            <div class="portfolio-card-header">
                <div class="portfolio-card-icon">
                    <i class="fas ${item.type === 'answer' ? 'fa-comment' : item.type === 'file' ? 'fa-file-alt' : item.type === 'debate' ? 'fa-gavel' : 'fa-rocket'}"></i>
                </div>
                ${item.grade ? `<div class="portfolio-card-grade">${item.grade}%</div>` : ''}
            </div>
            <div class="portfolio-card-body">
                <h3 class="portfolio-card-title">${escapeHtml(item.title)}</h3>
                <p class="portfolio-card-description">${escapeHtml(item.description || 'No description provided')}</p>
                <div class="portfolio-card-meta">
                    <span><i class="far fa-calendar"></i> ${new Date(item.created_at).toLocaleDateString()}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

loadPortfolio();
