import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';
import supportView from './support.js?v=32';

export default {
  title: 'Alerts',
  template: `
    <div class="alerts-layout">
      <div class="alerts-tabs">
        <button class="alerts-tab active" data-tab="notices" onclick="alertsInstance.switchTab('notices')">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
          <span>Notices</span>
        </button>
        <button class="alerts-tab" data-tab="support" onclick="alertsInstance.switchTab('support')">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          <span>Support</span>
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

        <div class="alerts-pane" id="alerts-support-pane" style="display: none;">
          <div id="support-mount"></div>
        </div>
      </div>
    </div>
  `,

  init() {
    this.currentTab = 'notices';
    this.supportMounted = false;
    window.alertsInstance = {
      switchTab: (tab) => this.switchTab(tab)
    };
  },

  destroy() {
    if (this.supportMounted) {
      supportView.destroy();
      this.supportMounted = false;
    }
  },

  switchTab(tab) {
    this.currentTab = tab;

    document.querySelectorAll('.alerts-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    document.getElementById('alerts-notices-pane').style.display = tab === 'notices' ? '' : 'none';
    document.getElementById('alerts-support-pane').style.display = tab === 'support' ? '' : 'none';

    if (tab === 'support') {
      this.mountSupport();
    } else if (this.supportMounted) {
      supportView.destroy();
      this.supportMounted = false;
    }
  },

  mountSupport() {
    if (this.supportMounted) return;
    this.supportMounted = true;

    const mount = document.getElementById('support-mount');
    if (!mount) return;

    mount.innerHTML = supportView.template;
    supportView.init();
  }
};
