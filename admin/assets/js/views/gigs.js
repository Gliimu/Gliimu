import { supabase } from '../config.js';
import { store } from '../store.js';
import { escapeHtml, empty, badge, timeAgo, openDrawer } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';

const STATUS_TONE = { queued: 'neutral', in_progress: 'warning', completed: 'success', cancelled: 'error' };
const STATUSES = ['queued', 'in_progress', 'completed', 'cancelled'];

export default {
  template: `
    <div class="filters">
      <select id="gigs-status" class="input" style="max-width:200px;">
        <option value="">All statuses</option>
        ${STATUSES.map(s => `<option value="${s}">${s.replace('_', ' ')}</option>`).join('')}
      </select>
      <input type="search" id="gigs-search" class="input" placeholder="Search description or company..." autocomplete="off">
      <span class="muted small" id="gigs-count"></span>
    </div>
    <div class="card"><div id="gigs-body"><p class="loading">Loading gigs...</p></div></div>
  `,

  async init() {
    this.deals = [];
    this.timer = null;

    document.getElementById('gigs-status').addEventListener('change', () => this.reload());
    document.getElementById('gigs-search').addEventListener('input', (e) => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.reload(), 350);
    });

    await this.load();
  },

  reload() {
    this.load();
  },

  async load() {
    const body = document.getElementById('gigs-body');
    const status = document.getElementById('gigs-status').value;
    const q = document.getElementById('gigs-search').value.trim();

    let query = supabase
      .from('deals')
      .select('id, user_id, deal_type, category, company_name, job_description, budget, timeline, status, created_at, profiles:profiles!deals_user_id_fkey(full_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(200);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;

    if (error) {
      body.innerHTML = empty(`Could not load gigs: ${error.message}`);
      return;
    }

    let deals = data || [];
    if (q) {
      const lower = q.toLowerCase();
      deals = deals.filter(d =>
        (d.job_description || '').toLowerCase().includes(lower) ||
        (d.company_name || '').toLowerCase().includes(lower) ||
        (d.category || '').toLowerCase().includes(lower)
      );
    }

    this.deals = deals;
    document.getElementById('gigs-count').textContent = `${deals.length} gig${deals.length === 1 ? '' : 's'}`;
    this.render();
  },

  render() {
    const body = document.getElementById('gigs-body');

    if (!this.deals.length) {
      body.innerHTML = empty('No gigs match those filters.');
      return;
    }

    body.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Gig</th><th>Category</th><th>By</th>
          <th>Status</th><th>Budget</th><th>Posted</th><th></th>
        </tr></thead>
        <tbody>${this.deals.map(d => {
          const name = d.profiles?.full_name || 'Member';
          const isCorporate = d.deal_type === 'corporate';
          const label = isCorporate ? (d.company_name || 'Corporate') : name;
          return `
          <tr>
            <td>
              <div style="font-weight:600;">${escapeHtml(label)}</div>
              <div class="muted small" style="max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(d.job_description || '')}</div>
            </td>
            <td class="muted small">${escapeHtml(d.category || '—')}</td>
            <td class="muted small">${escapeHtml(name)}${isCorporate ? `<div class="muted small">${escapeHtml(d.deal_type)}</div>` : ''}</td>
            <td>${badge(d.status, STATUS_TONE[d.status] || 'neutral')}</td>
            <td class="muted small">${escapeHtml(d.budget || '—')}</td>
            <td class="muted small">${d.created_at ? escapeHtml(timeAgo(d.created_at)) : '—'}</td>
            <td style="white-space:nowrap;">
              ${d.status !== 'completed' && d.status !== 'cancelled' ? `
                <button class="btn-quiet" data-done="${d.id}" title="Mark done">Done</button>
                <button class="btn-quiet" data-cancel="${d.id}" title="Cancel">Cancel</button>
              ` : ''}
              <button class="btn-quiet" data-chat="${d.user_id}" data-name="${escapeHtml(name)}" title="Message client">Chat</button>
            </td>
          </tr>`;
        }).join('')}
        </tbody>
      </table></div>`;

    body.querySelectorAll('[data-done]').forEach(btn => {
      btn.addEventListener('click', () => this.markDone(btn.dataset.done));
    });
    body.querySelectorAll('[data-cancel]').forEach(btn => {
      btn.addEventListener('click', () => this.cancelDeal(btn.dataset.cancel));
    });
    body.querySelectorAll('[data-chat]').forEach(btn => {
      btn.addEventListener('click', () => this.chatClient(btn.dataset.chat, btn.dataset.name));
    });
  },

  async markDone(id) {
    const deal = this.deals.find(d => d.id === id);
    if (!deal) return;

    const ok = await appConfirm(`Mark this gig as done? The poster will be notified.`, { okText: 'Mark done' });
    if (!ok) return;

    const { error } = await supabase.from('deals').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: store.user.id
    }).eq('id', id);

    if (error) return appAlert(`Could not update: ${error.message}`);

    await supabase.from('messages').insert({
      sender_id: store.user.id,
      receiver_id: deal.user_id,
      content: 'Your gig has been completed and taken off the queue. Thank you for building with Gliimu.',
      is_ai: false,
      is_admin: true
    });

    await appAlert('Gig marked as done.');
    await this.load();
  },

  async cancelDeal(id) {
    const ok = await appConfirm('Cancel this gig? It will be removed from the queue.', { okText: 'Cancel gig', danger: true });
    if (!ok) return;

    const { error } = await supabase.from('deals').update({ status: 'cancelled' }).eq('id', id);
    if (error) return appAlert(`Could not update: ${error.message}`);

    await appAlert('Gig cancelled.');
    await this.load();
  },

  chatClient(userId, name) {
    if (userId === store.user.id) return;
    const { overlay, close } = openDrawer({
      title: `Chat with ${name}`,
      body: `
        <div id="gigs-chat-messages" style="max-height:300px; overflow-y:auto; margin-bottom:12px;">
          <p class="muted small">Loading messages...</p>
        </div>
        <div class="form-group">
          <textarea id="gigs-chat-input" class="input" rows="3" placeholder="Type a message..."></textarea>
        </div>
      `,
      foot: `<button class="btn-primary" id="gigs-chat-send">Send</button>`
    });

    this.loadChat(overlay, userId);

    overlay.querySelector('#gigs-chat-send').addEventListener('click', async () => {
      const textarea = overlay.querySelector('#gigs-chat-input');
      const content = textarea.value.trim();
      if (!content) return;

      const btn = overlay.querySelector('#gigs-chat-send');
      btn.disabled = true;

      const { error } = await supabase.from('messages').insert({
        sender_id: store.user.id,
        receiver_id: userId,
        content,
        is_ai: false,
        is_admin: true
      });

      btn.disabled = false;
      if (error) return appAlert(`Could not send: ${error.message}`);

      textarea.value = '';
      this.loadChat(overlay, userId);
    });
  },

  async loadChat(overlay, userId) {
    const container = overlay.querySelector('#gigs-chat-messages');
    const { data, error } = await supabase
      .from('messages')
      .select('sender_id, content, created_at')
      .or(`and(sender_id.eq.${store.user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${store.user.id})`)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      container.innerHTML = '<p class="muted small">Could not load messages.</p>';
      return;
    }

    if (!data || !data.length) {
      container.innerHTML = '<p class="muted small">No messages yet. Send the first one.</p>';
      return;
    }

    container.innerHTML = data.map(m => {
      const mine = m.sender_id === store.user.id;
      return `<div style="margin-bottom:8px; text-align:${mine ? 'right' : 'left'};">
        <div style="display:inline-block; padding:8px 12px; border-radius:12px; background:${mine ? 'var(--brand-primary)' : 'var(--bg-tertiary)'}; color:${mine ? '#fff' : 'var(--text-primary)'}; max-width:80%; text-align:left;">
          ${escapeHtml(m.content)}
          <div style="font-size:11px; opacity:0.7; margin-top:2px;">${escapeHtml(timeAgo(m.created_at))}</div>
        </div>
      </div>`;
    }).join('');

    container.scrollTop = container.scrollHeight;
  }
};
