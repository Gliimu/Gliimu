// ============================================
// GLIIMU USER DASHBOARD - PARTNER FEATURES
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// Export partner features
export default {
    renderProjects,
    renderPartnerDashboard,
    createProject,
    getProjects
};

// ============================================
// PARTNER DASHBOARD
// ============================================
async function renderPartnerDashboard(container) {
    if (!container) return;
    
    try {
        const projects = await getProjects();
        
        container.innerHTML = `
            <div class="section-header">
                <h2>Partner Dashboard</h2>
                <p>Manage your projects and collaborations</p>
            </div>
            
            <div class="partner-stats-grid">
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-project-diagram"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">Active Projects</span>
                        <span class="stat-value">${projects.filter(p => p.status === 'active').length}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">Completed</span>
                        <span class="stat-value">${projects.filter(p => p.status === 'completed').length}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-users"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">Collaborators</span>
                        <span class="stat-value">${projects.reduce((sum, p) => sum + (p.collaborators || 0), 0)}</span>
                    </div>
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
        
        document.getElementById('createProjectBtn')?.addEventListener('click', openProjectModal);
        
    } catch (error) {
        console.error('Error loading partner dashboard:', error);
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
                <span class="project-status ${project.status}">${project.status}</span>
            </div>
            <div class="project-description">${project.description || 'No description'}</div>
            <div class="project-footer">
                <span class="project-date">Started: ${new Date(project.created_at).toLocaleDateString()}</span>
                <span class="project-collaborators"><i class="fas fa-users"></i> ${project.collaborators || 0}</span>
            </div>
        </div>
    `).join('');
}

// ============================================
// PROJECT MANAGEMENT
// ============================================
async function renderProjects(container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <h2>Projects</h2>
            <p>Manage your partner projects</p>
        </div>
        <div id="partnerProjectsList">
            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading projects...</div>
        </div>
    `;
    
    try {
        const projects = await getProjects();
        const list = document.getElementById('partnerProjectsList');
        list.innerHTML = renderProjectList(projects);
    } catch (error) {
        console.error('Error loading projects:', error);
        document.getElementById('partnerProjectsList').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Projects</h3>
                <button class="btn-primary" onclick="location.reload()">Try Again</button>
            </div>
        `;
    }
}

async function getProjects() {
    try {
        const { data, error } = await supabase
            .from('partner_projects')
            .select('*')
            .eq('partner_id', currentUser.id)
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
        const { data, error } = await supabase
            .from('partner_projects')
            .insert({
                ...projectData,
                partner_id: currentUser.id,
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
                    <div class="form-group">
                        <label>Timeline</label>
                        <input type="date" id="projectTimeline">
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
            category: document.getElementById('projectCategory').value,
            timeline: document.getElementById('projectTimeline').value || null
        };
        
        if (!projectData.title) {
            showToast('Please enter a project title', 'error');
            return;
        }
        
        const result = await createProject(projectData);
        if (result) {
            modal.remove();
            showToast('Project created successfully!', 'success');
            renderProjects(document.getElementById('projects-section'));
        }
    });
}
