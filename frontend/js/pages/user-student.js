// ============================================
// GLIIMU USER DASHBOARD - STUDENT FEATURES
// Path: /frontend/js/pages/user-student.js
// Purpose: Student-specific features (extends GeneralDashboard)
// ============================================

import { GeneralDashboard } from './user-general.js';
import { showToast } from '../modules/toast.js';

export class StudentDashboard extends GeneralDashboard {
    constructor(user, profile) {
        super(user, profile);
        this.isStudent = true;
        console.log('🎓 Student dashboard initialized');
    }

    // ============================================
    // OVERRIDE: Load Dashboard with Student-specific content
    // ============================================
    async loadDashboard() {
        // Call parent method first
        await super.loadDashboard();
        
        // Add student-specific elements after parent renders
        this.addStudentElements();
    }

    // ============================================
    // ADD STUDENT-SPECIFIC ELEMENTS
    // ============================================
    addStudentElements() {
        // Find the progress section and add student-specific info
        const progressSection = document.querySelector('.progress-section');
        if (progressSection) {
            // Add student badge
            const studentBadge = document.createElement('div');
            studentBadge.className = 'student-badge-container';
            studentBadge.style.cssText = `
                margin-top: 8px;
                padding: 8px 16px;
                background: rgba(251, 176, 64, 0.12);
                border-radius: 8px;
                border: 1px solid rgba(251, 176, 64, 0.2);
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.85rem;
                color: var(--brand-gold);
            `;
            studentBadge.innerHTML = `
                <i class="fas fa-user-graduate"></i>
                <span>You are enrolled as a <strong>Student</strong> 🎓</span>
                <span style="margin-left: auto; font-size: 0.7rem; opacity: 0.7;">
                    ${new Date().toLocaleDateString()}
                </span>
            `;
            
            // Insert after progress section
            progressSection.parentNode.insertBefore(studentBadge, progressSection.nextSibling);
        }

        // Add student-only quick action
        const statsGrid = document.querySelector('.stats-grid');
        if (statsGrid) {
            // Check if we already have a student stat card
            const existing = statsGrid.querySelector('.stat-card.student-stat');
            if (!existing) {
                const studentStat = document.createElement('div');
                studentStat.className = 'stat-card student-stat';
                studentStat.style.cssText = `
                    background: var(--bg-secondary);
                    border-radius: var(--radius-md);
                    padding: 20px 24px;
                    border: 1px solid var(--border-color);
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    transition: var(--transition);
                    box-shadow: var(--shadow-sm);
                `;
                studentStat.innerHTML = `
                    <div class="stat-icon" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;">
                        <i class="fas fa-graduation-cap"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Learning Progress</h3>
                        <p class="stat-value" style="font-size: 1.35rem; font-weight: 700; color: var(--text-primary);">
                            ${this.currentProfile?.progress || 0}%
                        </p>
                    </div>
                    <button class="stat-action-btn" data-action="learning" title="View Learning Path" style="position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; border-radius: 50%; border: none; background: var(--bg-tertiary); color: var(--text-secondary); cursor: pointer; transition: var(--transition); display: flex; align-items: center; justify-content: center; font-size: 0.7rem;">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                `;
                
                // Add click handler for learning path
                studentStat.querySelector('.stat-action-btn')?.addEventListener('click', () => {
                    window.location.href = '/course';
                });
                
                statsGrid.appendChild(studentStat);
            }
        }
    }

    // ============================================
    // OVERRIDE: Portfolio with Student-specific view
    // ============================================
    async loadPortfolio(container) {
        // Use parent method but pass student flag
        await super.loadPortfolio(container);
        
        // Additional student-specific portfolio features can be added here
        // For example, adding a "My Projects" section
        const portfolioContainer = container || this.container;
        if (portfolioContainer) {
            this.addStudentPortfolioElements(portfolioContainer);
        }
    }

    // ============================================
    // ADD STUDENT PORTFOLIO ELEMENTS
    // ============================================
    addStudentPortfolioElements(container) {
        // Check if we already have the student projects section
        const existing = container.querySelector('.student-projects-section');
        if (existing) return;

        // Get portfolio items from the student
        const projects = this.getStudentProjects();
        
        const projectsSection = document.createElement('div');
        projectsSection.className = 'student-projects-section card';
        projectsSection.style.cssText = `
            margin-top: 20px;
            padding: 20px 24px;
            background: var(--bg-secondary);
            border-radius: var(--radius-md);
            border: 1px solid var(--border-color);
        `;
        projectsSection.innerHTML = `
            <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-folder-open" style="color: var(--brand-gold);"></i>
                My Projects
                <span style="margin-left: auto; font-size: 0.75rem; color: var(--text-muted);">${projects.length} projects</span>
            </h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;">
                ${projects.length > 0 ? projects.map(project => `
                    <div style="background: var(--bg-primary); padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-color);">
                        <h4 style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">${project.title}</h4>
                        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">${project.description || 'No description'}</p>
                        ${project.grade ? `<span style="display: inline-block; margin-top: 6px; padding: 2px 10px; background: rgba(16, 185, 129, 0.15); color: #10b981; border-radius: 10px; font-size: 0.65rem; font-weight: 600;">Grade: ${project.grade}%</span>` : ''}
                    </div>
                `).join('') : `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: var(--text-muted);">
                        <i class="fas fa-inbox" style="font-size: 2rem; display: block; margin-bottom: 8px; opacity: 0.5;"></i>
                        <p style="font-size: 0.85rem;">No projects yet. Start learning to build your portfolio!</p>
                    </div>
                `}
            </div>
        `;
        
        // Insert after the portfolio link card
        const linkCard = container.querySelector('.portfolio-link-card');
        if (linkCard) {
            linkCard.parentNode.insertBefore(projectsSection, linkCard.nextSibling);
        } else {
            container.appendChild(projectsSection);
        }
    }

    // ============================================
    // GET STUDENT PROJECTS
    // ============================================
    getStudentProjects() {
        // This would fetch from Supabase in a real implementation
        // For now, return sample data or empty array
        return [];
    }
}

// Export default for dynamic import
export default StudentDashboard;

// Also export as named export for compatibility
export { StudentDashboard };
