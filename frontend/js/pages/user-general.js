// ============================================
// GLIIMU USER DASHBOARD - GENERAL FEATURES
// This is used as the default dashboard for all users
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// Export general features
export default {
    renderDashboard,
    renderProjects,
    getProjects
};

// ============================================
// GENERAL DASHBOARD
// ============================================
async function renderDashboard(container) {
    if (!container) return;
    
    try {
        const user = window.currentUser;
        if (!user) {
            container.innerHTML = `<div class="empty-state"><h3>Please log in</h3></div>`;
            return;
        }
        
        const projects = await getProjects(user.id);
        
        container.innerHTML = `
            <div class="section-header">
                <h2>Welcome, ${user.name || 'User'}!</h2>
                <p>Your learning journey starts here</p>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-wallet"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">Wallet Balance</span>
                        <span class="stat-value">₦${(user.walletBalance || 14500).toLocaleString()}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-star"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">GP Points</span>
                        <span class="stat-value">${user.gpPoints || 0}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-project-diagram"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">Projects</span>
                        <span class="stat-value">${projects.length}</span>
                    </div>
                </div>
            </div>
            
            <div class="quick-actions">
                <h3>Quick Actions</h3>
                <div class="action-grid">
                    <button onclick="window.switchTab('gotomenu')" class="action-btn">
                        <i class="fas fa-door-open"></i>
                        <span>Go To</span>
                    </button>
                    <button onclick="window.switchTab('wallet')" class="action-btn">
                        <i class="fas fa-wallet"></i>
                        <span>Wallet</span>
                    </button>
                    <button onclick="window.switchTab('settings')" class="action-btn">
                        <i class="fas fa-cog"></i>
                        <span>Settings</span>
                    </button>
                </div>
            </div>
            
            <div class="projects-section">
                <div class="projects-header">
                    <h3>Your Projects</h3>
                    <button id="createProjectBtn" class="btn-primary">+ New Project</button>
                </div>
                <div id="projectsList">
                    ${renderProjectList(projects)}
                </div>
            </div>
        `;
        
        document.getElementById('createProjectBtn')?.addEventListener('click', () => openProjectModal());
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Dashboard</h3>
                <button class="btn-primary" onclick="location.reload()">Refresh</button>
            </div>
        `;
    }
}

function renderProjectList(projects) {
    if (!projects || projects.length === 0) {
        return `
            <div class="empty-state">
                <i class="fas fa-project-diagram"></i>
                <h3>No Projects Yet</h3>
                <p>Create your first project to get started.</p>
            </div>
        `;
    }
    
    return projects.map(project => `
        <div class="project-card" data-id="${project.id}">
            <div class="project-header">
                <h4>${project.title}</h4>
                <span class="project-status ${project.status || 'active'}">${project.status || 'Active'}</span>
            </div>
            <div class="project-description">${project.description || 'No description'}</div>
            <div class="project-footer">
                <span class="project-date">Started: ${new Date(project.created_at).toLocaleDateString()}</span>
            </div>
        </div>
    `).join('');
}

async function getProjects(userId) {
    try {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting projects:', error);
        return [];
    }
}

async function createProject(projectData) {
    try {
        const user = window.currentUser;
        if (!user) {
            showToast('Please log in', 'error');
            return null;
        }
        
        const { data, error } = await supabase
            .from('projects')
            .insert({
                ...projectData,
                user_id: user.id,
                status: 'active',
                created_at: new Date().toISOString()
            })
            .select();
            
        if (error) throw error;
        return data?.[0] || null;
    } catch (error) {
        console.error('Error creating project:', error);
        showToast('Error creating project', 'error');
        return null;
    }
}

function openProjectModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Create New Project</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="projectForm">
                    <div class="form-group">
                        <label>Project Title *</label>
                        <input type="text" id="projectTitle" required placeholder="Enter project title">
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="projectDescription" rows="4" placeholder="Describe your project..."></textarea>
                    </div>
                    <div class="form-group">
                        <label>Category</label>
                        <select id="projectCategory">
                            <option value="design">Design</option>
                            <option value="development">Development</option>
                            <option value="marketing">Marketing</option>
                            <option value="research">Research</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <button type="submit" class="btn-primary">Create Project</button>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('projectForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const projectData = {
            title: document.getElementById('projectTitle').value.trim(),
            description: document.getElementById('projectDescription').value.trim(),
            category: document.getElementById('projectCategory').value
        };
        
        if (!projectData.title) {
            showToast('Please enter a project title', 'error');
            return;
        }
        
        const result = await createProject(projectData);
        if (result) {
            modal.remove();
            showToast('Project created successfully!', 'success');
            // Refresh the dashboard
            const container = document.getElementById('dashboard-section');
            if (container) {
                await renderDashboard(container);
            }
        }
    });
}
