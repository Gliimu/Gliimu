import { supabase } from '../config.js';
import { escapeHtml } from '../ui.js';

export default {
  template: `
    <div class="dashboard-grid">
      <div class="dash-card" data-link="#/reports">
        <div class="dash-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        </div>
        <div class="dash-content">
          <div class="dash-count" id="pending-reports">—</div>
          <div class="dash-label">Pending Reports</div>
        </div>
      </div>

      <div class="dash-card" data-link="#/support">
        <div class="dash-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </div>
        <div class="dash-content">
          <div class="dash-count" id="open-support">—</div>
          <div class="dash-label">Open Support Threads</div>
        </div>
      </div>

      <div class="dash-card" data-link="#/crm-members">
        <div class="dash-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        </div>
        <div class="dash-content">
          <div class="dash-count" id="total-members">—</div>
          <div class="dash-label">Total Members</div>
        </div>
      </div>
    </div>

    <div class="dash-section">
      <h3>Quick Actions</h3>
      <div class="dash-actions">
        <a href="#/submissions" class="dash-action-btn">Review Submissions</a>
        <a href="#/reports" class="dash-action-btn">Check Reports</a>
        <a href="#/support" class="dash-action-btn">Open Support Desk</a>
        <a href="#/crm-members" class="dash-action-btn">Manage Members</a>
      </div>
    </div>
  `,

  async init() {
    await this.loadMetrics();
    this.setupNavigation();
  },

  async loadMetrics() {
    // Pending reports
    const { data: reports } = await supabase
      .from('reports')
      .select('id')
      .eq('status', 'pending');
    const pendingReports = reports ? reports.length : 0;
    document.getElementById('pending-reports').textContent = pendingReports;

    // Open support threads (threads with no admin response yet)
    const { data: threads } = await supabase
      .from('support_threads')
      .select('id')
      .eq('status', 'open');
    const openThreads = threads ? threads.length : 0;
    document.getElementById('open-support').textContent = openThreads;

    // Total members
    const { data: members } = await supabase
      .from('profiles')
      .select('id');
    const totalMembers = members ? members.length : 0;
    document.getElementById('total-members').textContent = totalMembers;
  },

  setupNavigation() {
    document.querySelectorAll('.dash-card').forEach(card => {
      card.addEventListener('click', () => {
        const link = card.dataset.link;
        if (link) window.location.hash = link;
      });
    });
  }
};
