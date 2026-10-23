import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default {
  title: 'Alerts',
  template: `
    <div class="alerts-layout">
      <div id="notices-content">
        <p style="color: var(--text-muted); text-align: center; padding: 40px;">Loading...</p>
      </div>
    </div>
  `,

  init() {
    window.alertsInstance = {};
    this.loadNotices();
  },

  destroy() {},

  async loadNotices() {
    const container = document.getElementById('notices-content');
    if (!container) return;

    const { data: transactions } = await supabase
      .from('transactions')
      .select('id, amount, points, type, status, description, created_at')
      .eq('user_id', store.user.id)
      .or('type.eq.reward,points.gt.0')
      .order('created_at', { ascending: false });

    const gpTxns = transactions || [];

    if (gpTxns.length === 0) {
      container.innerHTML = `
        <div class="notice-empty">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-bottom: 16px;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
          <h3>No GP notices yet</h3>
          <p>GP rewards and point activity will appear here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="notice-list">
        ${gpTxns.map(tx => {
          const date = new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const time = new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const label = tx.description || 'GP Reward';
          const points = tx.points || 0;
          return `
            <div class="notice-item">
              <img src="/icons/icon.png" class="notice-gp-icon" alt="GP">
              <div class="notice-info">
                <span class="notice-title">${escapeHtml(label)}</span>
                <span class="notice-date">${date} · ${time}</span>
              </div>
              <span class="notice-amount">+${points} GP</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
};
