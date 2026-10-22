import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Alerts',
  template: `
    <div class="alerts-layout">
      <div class="alerts-tabs">
        <button class="alerts-tab active" data-tab="notices" onclick="alertsInstance.switchTab('notices')">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          <span>Notices</span>
        </button>
        <button class="alerts-tab" data-tab="help" onclick="alertsInstance.switchTab('help')">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          <span>Help</span>
        </button>
      </div>

      <div class="alerts-content" id="alerts-content">
        <div class="alerts-pane" id="alerts-notices-pane">
          <div class="alerts-empty">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-bottom: 16px;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
            <h3>No notices yet</h3>
            <p>System notifications and updates will appear here.</p>
          </div>
        </div>

        <div class="alerts-pane" id="alerts-help-pane" style="display: none;">
          <div class="alerts-empty">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-bottom: 16px;"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <h3>Need help?</h3>
            <p>FAQs and support resources will be available here.</p>
          </div>
        </div>
      </div>
    </div>
  `,

  init() {
    this.currentTab = 'notices';
    window.alertsInstance = {
      switchTab: (tab) => this.switchTab(tab)
    };
  },

  switchTab(tab) {
    this.currentTab = tab;

    // Update tab buttons
    document.querySelectorAll('.alerts-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Update panes
    document.getElementById('alerts-notices-pane').style.display = tab === 'notices' ? '' : 'none';
    document.getElementById('alerts-help-pane').style.display = tab === 'help' ? '' : 'none';
  }
};
