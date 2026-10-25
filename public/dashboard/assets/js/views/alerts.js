import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';
import { getBalance } from '../heartbeat.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function gliits(value) {
  const n = Number(value || 0);
  return `${n < 0 ? '-' : ''}G${Math.abs(n).toLocaleString()}`;
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'usage', label: 'Usage' },
  { id: 'gp', label: 'GP' },
  { id: 'system', label: 'System' }
];

const WALLET_TYPES = new Set(['topup', 'transfer_in', 'transfer_out', 'refund', 'adjustment', 'subscription']);
const GP_TYPES = new Set(['reward']);

const TX_ICONS = {
  topup: { color: '#64748b', path: 'M12 2v20M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H6' },
  transfer_in: { color: '#64748b', path: 'M7 10l5 5 5-5M12 15V3' },
  transfer_out: { color: '#64748b', path: 'M7 14l5-5 5 5M12 9v12' },
  refund: { color: '#64748b', path: 'M3 12a9 9 0 1 0 9-9M3 3v9h9' },
  adjustment: { color: '#64748b', path: 'M12 3v18M3 12h18' },
  subscription: { color: '#64748b', path: 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01z' },
  support: { color: '#64748b', path: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' },
  reward: { color: '#64748b', path: 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01z' },
  usage: { color: '#64748b', path: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
  low_balance: { color: '#ef4444', path: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01' },
  content: { color: '#64748b', path: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  content_rejected: { color: '#ef4444', path: 'M18 6L6 18M6 6l12 12' },
  support_msg: { color: '#64748b', path: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  live_session: { color: '#64748b', path: 'M23 7l-7 5 7 5V7zM1 5h15v14H1z' }
};

const TX_LABELS = {
  topup: 'Wallet top-up',
  transfer_in: 'Received from member',
  transfer_out: 'Sent to member',
  refund: 'Refund',
  adjustment: 'Balance adjustment',
  subscription: 'Plan payment',
  support: 'Creator support',
  reward: 'GP reward',
  live_session: 'Reading charge'
};

export default {
  title: 'Alerts',
  template: `
    <div class="alerts-layout">
      <div class="alerts-toolbar">
        <div class="alerts-filter-wrap" onclick="event.stopPropagation();">
          <button class="alerts-filter-btn" title="Filter" id="alerts-filter-toggle">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
          </button>
          <div class="alerts-filter-menu" id="alerts-filter-menu">
            ${FILTERS.map(f => `<div class="alerts-filter-item" data-filter="${f.id}">${escapeHtml(f.label)}</div>`).join('')}
          </div>
        </div>
      </div>
      <div class="alerts-scroll" id="alerts-scroll">
        <p style="color: var(--text-muted); text-align: center; padding: 40px;">Loading...</p>
      </div>
    </div>
  `,

  init() {
    this.filter = 'all';
    this.allAlerts = [];
    this.balance = null;

    document.getElementById('alerts-filter-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('alerts-filter-menu')?.classList.toggle('active');
    });

    document.querySelectorAll('.alerts-filter-item').forEach(item => {
      item.addEventListener('click', () => {
        this.filter = item.dataset.filter;
        document.querySelectorAll('.alerts-filter-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        document.getElementById('alerts-filter-menu')?.classList.remove('active');
        this.render();
      });
    });

    document.addEventListener('click', () => {
      document.getElementById('alerts-filter-menu')?.classList.remove('active');
    });

    this.load();
  },

  destroy() {},

  async load() {
    if (!store.user?.id) return;

    const balanceData = await getBalance();
    this.balance = Number(balanceData?.balance || 0);

    const [txResult, usageResult, topupResult, submissionResult, supportResult] = await Promise.all([
      supabase.from('transactions').select('id, amount, points, type, status, description, reference, created_at')
        .eq('user_id', store.user.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('gliits_usage').select('id, gliits_charged, creator_credited, minute_at')
        .eq('user_id', store.user.id).order('minute_at', { ascending: false }).limit(500),
      supabase.from('gliits_topups').select('id, amount_gliits, amount_naira, payment_status, payment_reference, created_at')
        .eq('user_id', store.user.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('feed_submissions').select('id, title, status, review_note, reviewed_at, created_at')
        .eq('user_id', store.user.id).in('status', ['approved', 'rejected']).order('created_at', { ascending: false }).limit(50),
      supabase.from('support_messages').select('id, content, kind, created_at')
        .eq('thread_user', store.user.id).neq('sender_id', store.user.id).order('created_at', { ascending: false }).limit(50)
    ]);

    this.allAlerts = [];

    const transactions = txResult.data || [];
    for (const tx of transactions) {
      const cat = this.categorizeTx(tx);
      if (!cat) continue;
      this.allAlerts.push({
        id: `tx-${tx.id}`,
        category: cat,
        icon: TX_ICONS[tx.type] || TX_ICONS.adjustment,
        title: tx.description || TX_LABELS[tx.type] || tx.type,
        subtitle: '',
        amount: tx.amount,
        points: tx.points,
        time: tx.created_at,
        status: tx.status
      });
    }

    const usageByDay = this.aggregateUsage(usageResult.data || []);
    for (const day of usageByDay) {
      this.allAlerts.push({
        id: `usage-${day.date}`,
        category: 'usage',
        icon: TX_ICONS.usage,
        title: `Reading charges`,
        subtitle: `${day.minutes} min on ${day.label}`,
        amount: -day.total,
        points: 0,
        time: day.iso,
        status: 'success'
      });
    }

    const topups = topupResult.data || [];
    for (const t of topups) {
      if (t.payment_status === 'success') continue;
      this.allAlerts.push({
        id: `topup-${t.id}`,
        category: 'wallet',
        icon: TX_ICONS.topup,
        title: t.payment_status === 'pending' ? 'Top-up pending verification' : 'Top-up failed',
        subtitle: `Reference: ${t.payment_reference || '—'}`,
        amount: t.payment_status === 'pending' ? t.amount_gliits : 0,
        points: 0,
        time: t.created_at,
        status: t.payment_status
      });
    }

    const submissions = submissionResult.data || [];
    for (const s of submissions) {
      const approved = s.status === 'approved';
      this.allAlerts.push({
        id: `sub-${s.id}`,
        category: 'system',
        icon: approved ? TX_ICONS.content : TX_ICONS.content_rejected,
        title: approved ? `"${s.title}" approved` : `"${s.title}" not approved`,
        subtitle: s.review_note || (approved ? 'Published to the library' : 'CRM did not approve this submission'),
        amount: 0,
        points: 0,
        time: s.reviewed_at || s.created_at,
        status: s.status
      });
    }

    const supportMsgs = supportResult.data || [];
    for (const m of supportMsgs) {
      this.allAlerts.push({
        id: `support-${m.id}`,
        category: 'system',
        icon: TX_ICONS.support_msg,
        title: 'Support reply',
        subtitle: m.content?.length > 80 ? m.content.substring(0, 80) + '...' : (m.content || ''),
        amount: 0,
        points: 0,
        time: m.created_at,
        status: 'info'
      });
    }

    if (this.balance > 0 && this.balance <= 12) {
      this.allAlerts.push({
        id: 'low-balance',
        category: 'system',
        icon: TX_ICONS.low_balance,
        title: `Low balance: G${this.balance} left`,
        subtitle: 'Top up your wallet to keep reading without interruption.',
        amount: 0,
        points: 0,
        time: new Date().toISOString(),
        status: 'warning'
      });
    }

    this.allAlerts.sort((a, b) => new Date(b.time) - new Date(a.time));
    this.render();
  },

  categorizeTx(tx) {
    if (WALLET_TYPES.has(tx.type)) return 'wallet';
    if (GP_TYPES.has(tx.type)) return 'gp';
    if (tx.type === 'support' || tx.type === 'live_session') return 'usage';
    return null;
  },

  aggregateUsage(rows) {
    const days = {};
    for (const r of rows) {
      const d = new Date(r.minute_at);
      const key = d.toISOString().slice(0, 10);
      if (!days[key]) {
        days[key] = { date: key, iso: d.toISOString(), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), minutes: 0, total: 0 };
      }
      days[key].minutes++;
      days[key].total += Number(r.gliits_charged || 0);
    }
    return Object.values(days).sort((a, b) => new Date(b.iso) - new Date(a.iso));
  },

  render() {
    const container = document.getElementById('alerts-scroll');
    if (!container) return;

    const filtered = this.filter === 'all'
      ? this.allAlerts
      : this.allAlerts.filter(a => a.category === this.filter);

    if (!filtered.length) {
      const emptyLabels = {
        all: 'No alerts yet',
        wallet: 'No wallet activity',
        usage: 'No usage charges yet',
        gp: 'No GP activity yet',
        system: 'No system alerts'
      };
      const emptySubs = {
        all: 'Top-ups, transfers, usage charges, rewards and system notices will appear here.',
        wallet: 'Top-ups, transfers, refunds and plan payments will appear here.',
        usage: 'Your per-minute reading charges will appear here, grouped by day.',
        gp: 'GP rewards and conversions will appear here.',
        system: 'Content approvals, support replies and balance warnings will appear here.'
      };
      container.innerHTML = `
        <div class="notice-empty">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-bottom: 16px;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
          <h3>${escapeHtml(emptyLabels[this.filter])}</h3>
          <p>${escapeHtml(emptySubs[this.filter])}</p>
        </div>`;
      return;
    }

    container.innerHTML = `<div class="notice-list">${filtered.map(a => this.renderAlert(a)).join('')}</div>`;
  },

  renderAlert(a) {
    const icon = a.icon;
    const isPositive = a.amount > 0;
    const isNegative = a.amount < 0;
    const hasPoints = a.points > 0;

    let amountHtml = '';
    if (hasPoints) {
      amountHtml = `<span class="notice-amount" style="color: var(--text-muted);">+${a.points} GP</span>`;
    } else if (isPositive) {
      amountHtml = `<span class="notice-amount" style="color: var(--text-muted);">+${gliits(a.amount)}</span>`;
    } else if (isNegative) {
      amountHtml = `<span class="notice-amount" style="color: var(--text-muted);">${gliits(a.amount)}</span>`;
    }

    let statusBadge = '';
    if (a.status === 'pending') {
      statusBadge = '<span class="alert-badge alert-badge-pending">Pending</span>';
    } else if (a.status === 'warning') {
      statusBadge = '<span class="alert-badge alert-badge-warning">Warning</span>';
    } else if (a.status === 'failed') {
      statusBadge = '<span class="alert-badge alert-badge-failed">Failed</span>';
    }

    return `
      <div class="notice-item${a.status === 'warning' ? ' notice-item-warning' : ''}">
        <div class="notice-icon" style="background: ${icon.color}15;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${icon.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${icon.path}"></path></svg>
        </div>
        <div class="notice-info">
          <span class="notice-title">${escapeHtml(a.title)}${statusBadge}</span>
          ${a.subtitle ? `<span class="notice-subtitle">${escapeHtml(a.subtitle)}</span>` : ''}
          <span class="notice-date">${escapeHtml(timeAgo(a.time))}</span>
        </div>
        ${amountHtml}
      </div>`;
  }
};
