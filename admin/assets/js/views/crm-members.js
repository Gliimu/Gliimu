import { supabase } from '../config.js';
import { store } from '../store.js';
import { escapeHtml, empty, badge, TIER_LABEL, openDrawer } from '../ui.js';
import { appAlert } from '../dialog.js';

export default {
  template: `
    <div class="filters">
      <input type="search" id="crm-member-search" class="input" placeholder="Search by name..." autocomplete="off">
      <span class="muted small" id="crm-member-count"></span>
    </div>
    <div class="card"><div id="crm-members-body"><p class="loading">Loading members...</p></div></div>
  `,

  async init() {
    this.members = [];
    this.timer = null;

    const search = document.getElementById('crm-member-search');
    search.addEventListener('input', () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.load(search.value), 350);
    });

    await this.load('');
  },

  async load(q) {
    const body = document.getElementById('crm-members-body');
    let query = supabase
      .from('profiles')
      .select('id, full_name, avatar_url, total_gp, tier, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (q && q.trim()) {
      query = query.ilike('full_name', `%${q.trim()}%`);
    }

    const { data, error } = await query;

    if (error) {
      body.innerHTML = empty(`Could not load members: ${error.message}`);
      return;
    }

    this.members = data || [];
    document.getElementById('crm-member-count').textContent =
      this.members.length >= 100 ? 'First 100 shown — narrow the search.' : `${this.members.length} member${this.members.length === 1 ? '' : 's'}`;
    this.render();
  },

  render() {
    const body = document.getElementById('crm-members-body');

    if (!this.members.length) {
      body.innerHTML = empty('No members match that search.');
      return;
    }

    body.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Member</th><th class="num">GP</th>
          <th>Plan</th><th>Joined</th>
        </tr></thead>
        <tbody>${this.members.map(p => `
          <tr data-open="${p.id}">
            <td>${escapeHtml(p.full_name || 'Member')}</td>
            <td class="num muted">${Number(p.total_gp || 0).toLocaleString()}</td>
            <td>${badge(TIER_LABEL[p.tier] || p.tier || '—', p.tier === 'pro' ? 'brand' : 'neutral')}</td>
            <td class="muted small">${p.created_at ? escapeHtml(new Date(p.created_at).toLocaleDateString()) : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;

    body.querySelectorAll('[data-open]').forEach((el) => {
      el.addEventListener('click', () => this.openMember(el.dataset.open));
    });
  },

  openMember(id) {
    const member = this.members.find(m => m.id === id);
    if (!member) return;

    const { overlay, close } = openDrawer({
      title: escapeHtml(member.full_name || 'Member'),
      sub: badge(TIER_LABEL[member.tier] || member.tier || '—', member.tier === 'pro' ? 'brand' : 'neutral'),
      body: `
        <dl class="kv">
          <dt>GP</dt><dd>${Number(member.total_gp || 0).toLocaleString()}</dd>
          <dt>Joined</dt><dd>${member.created_at ? new Date(member.created_at).toLocaleDateString() : '—'}</dd>
        </dl>
        <div class="section-title">Send a message</div>
        <div class="form-group">
          <textarea id="crm-msg-text" class="input" rows="4" placeholder="Type your message..."></textarea>
        </div>
      `,
      foot: `<button class="btn-primary" id="crm-msg-send">Send</button>`
    });

    overlay.querySelector('#crm-msg-send').addEventListener('click', async () => {
      const textarea = overlay.querySelector('#crm-msg-text');
      const content = textarea.value.trim();
      if (!content) return appAlert('Type a message first.');

      const btn = overlay.querySelector('#crm-msg-send');
      btn.disabled = true;
      btn.textContent = 'Sending...';

      const { error } = await supabase.from('messages').insert({
        sender_id: store.user.id,
        receiver_id: member.id,
        content,
        is_ai: false,
        is_admin: true
      });

      if (error) {
        btn.disabled = false;
        btn.textContent = 'Send';
        return appAlert(`Could not send: ${error.message}`);
      }

      textarea.value = '';
      btn.disabled = false;
      btn.textContent = 'Send';
      await appAlert('Message sent.');
    });
  }
};
