// ============================================
// PUBLIC PORTFOLIO PAGE
// ============================================

import { supabase } from '../modules/supabase.js';
import { getStudentPortfolio } from '../modules/progression.js';

// Get username from URL
const urlParams = new URLSearchParams(window.location.search);
const username = urlParams.get('user');

async function loadPortfolio() {
    const container = document.getElementById('portfolioContent');
    
    try {
        // First, find the user by username
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, name, avatar_url, role, current_badge')
            .eq('name', decodeURIComponent(username))
            .single();
        
        if (userError || !user) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-slash"></i>
                    <h3>Student Not Found</h3>
                    <p>The portfolio you're looking for doesn't exist.</p>
                    <a href="/" class="btn-primary" style="display: inline-block; margin-top: 1rem;">Go Home</a>
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
        
        // Render portfolio
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
                
                const grid = document.getElementById('portfolioGrid');
                grid.innerHTML = renderPortfolioItems(portfolioItems, tabId);
            });
        });
        
    } catch (error) {
        console.error('Error loading portfolio:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Portfolio</h3>
                <p>Please try again later.</p>
            </div>
        `;
    }
}

function renderPortfolioItems(items, filter) {
    const filtered = items.filter(item => {
        if (filter === 'all') return true;
        return item.type === filter;
    });
    
    if (filtered.length === 0) {
        return `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3>No items yet</h3>
                <p>This student hasn't added any ${filter} items to their portfolio.</p>
            </div>
        `;
    }
    
    return filtered.map(item => {
        const typeIcons = {
            answer: { icon: 'fa-comment', class: 'answer' },
            file: { icon: 'fa-file-alt', class: 'file' },
            debate: { icon: 'fa-gavel', class: 'debate' },
            mvp: { icon: 'fa-rocket', class: 'mvp' }
        };
        
        const typeInfo = typeIcons[item.type] || { icon: 'fa-star', class: 'answer' };
        
        return `
            <div class="portfolio-card">
                <div class="portfolio-card-header">
                    <div class="portfolio-card-icon ${typeInfo.class}">
                        <i class="fas ${typeInfo.icon}"></i>
                    </div>
                    ${item.grade ? `<div class="portfolio-card-grade">${item.grade}%</div>` : ''}
                </div>
                <div class="portfolio-card-body">
                    <h3 class="portfolio-card-title">${escapeHtml(item.title)}</h3>
                    <p class="portfolio-card-description">${escapeHtml(item.description || 'No description provided')}</p>
                    <div class="portfolio-card-meta">
                        <span><i class="far fa-calendar"></i> ${new Date(item.created_at).toLocaleDateString()}</span>
                        ${item.view_count ? `<span><i class="far fa-eye"></i> ${item.view_count} views</span>` : ''}
                        ${item.like_count ? `<span><i class="far fa-heart"></i> ${item.like_count} likes</span>` : ''}
                    </div>
                </div>
                <div class="portfolio-card-footer">
                    <button class="btn-view" onclick="viewPortfolioItem('${item.id}')">View Details</button>
                </div>
            </div>
        `;
    }).join('');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.viewPortfolioItem = function(itemId) {
    showToast('View details feature coming soon!', 'info');
};

function showToast(message, type) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 10000;';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.cssText = `
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        margin-top: 10px;
        animation: fadeIn 0.3s ease;
    `;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

// Load portfolio
loadPortfolio();
