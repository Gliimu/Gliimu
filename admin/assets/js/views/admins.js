import { supabase } from '../config.js';
import { ROLE_LABELS } from '../store.js';
import { escapeHtml, timeAgo, badge, empty, avatar, rpcError } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';

const ROLES = Object.keys(ROLE_LABELS);
const ROLE_TONE = { super: 'error', crm: 'brand', registrar: 'info', captain: 'warning', operations: 'neutral' };

function roleOptions(selected) {
  return ROLES.map(r => `<option value="${r}"${r === selected ? ' selected' : ''}>${escapeHtml(ROLE_LABELS[r])}</option>`).join('');
}

export default {
  template: `
    <div class="card" style="margin-bottom: 20px;">
      <div class="card-head">
        <div style="min-width: 0;">
          <div class="card-title">Add an admin</div>
          <div class="card-sub">Search members by name or username, then pick their role.</div>
        </div>
      </div>
      <div class="card-body">
        <div class="form-group">
          <label for="admin-search">Find a member</label>
          <input type="search" id="admin-search" class="input" placeholder="Type at least two characters..." autocomplete="off">
        </div>
        <div id="search-results"></div>
      </div>
    </div>

    <div class="section-title">Current admins</div>
    <div id="admins-list"><p class="loading">Loading admins...</p></div>
  `,

  async init() {
    this.admins = [];
    this.results = [];
    this.timer = null;

    const search = document.getElementById('admin-search');
    search.addEventListener('input', () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.search(search.value), 350);
    });

    await this.load();
  },

  async load() {
    const list = document.getElementById('admins-list');
    const { data, error } = await supabase.rpc('admin_list_admins');

    if (error) {
      list.innerHTML = empty(`Could not load admins: ${error.message}`);
      return;
    }
    if (!data || data.ok === false) {
      list.innerHTML = empty(rpcError(data, 'Could not load admins.'));
      return;
    }

    this.admins = data.admins || [];
    this.render();
  },

  async search(term) {
    const host = document.getElementById('search-results');
    const clean = term.trim().replace(/[,()%]/g, '');

    if (clean.length < 2) {
      this.results = [];
      host.innerHTML = '';
      return;
    }

    host.innerHTML = '<p class="loading">Searching...</p>';

    const { data, error } = await supabase.from('profiles')
      .select('id, username, full_name, avatar_url')
      .or(`username.ilike.%${clean}%,full_name.ilike.%${clean}%`)
      .limit(8);

    if (error) {
      host.innerHTML = empty(`Search failed: ${error.message}`);
      return;
    }

    const known = new Set(this.admins.map(a => a.user_id));
    this.results = (data || []).filter(p => !known.has(p.id));

    if (!this.results.length) {
      host.innerHTML = empty('No members match that, or they are already an admin.');
      return;
    }

    host.innerHTML = `<div class="row-list">${this.results.map(p => `
      <div class="card">
        <div class="card-head">
          ${avatar(p.avatar_url, p.full_name || p.username)}
          <div style="min-width: 0;">
            <div class="card-title">${escapeHtml(p.full_name || p.username || 'Member')}</div>
            <div class="card-sub">@${escapeHtml(p.username || '—')}</div>
          </div>
        </div>
        <div class="card-body" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <select class="input" style="width: auto; min-width: 170px;" data-role-for="${p.id}">${roleOptions('crm')}</select>
          <button class="btn-primary btn-small" data-add="${p.id}">Add as admin</button>
        </div>
      </div>`).join('')}</div>`;

    host.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.add;
        const select = host.querySelector(`[data-role-for="${id}"]`);
        this.grant(id, select ? select.value : 'crm', null);
      });
    });
  },

  render() {
    const list = document.getElementById('admins-list');

    if (!this.admins.length) {
      list.innerHTML = empty('No admins yet. Add the first one above.');
      return;
    }

    list.innerHTML = `<div class="row-list">${this.admins.map(a => `
      <div class="card">
        <div class="card-head">
          ${avatar(a.avatar_url, a.full_name || a.username)}
          <div style="min-width: 0;">
            <div class="card-title">${escapeHtml(a.full_name || a.username || 'Removed member')}</div>
            <div class="card-sub">@${escapeHtml(a.username || '—')} · added ${timeAgo(a.created_at)}</div>
          </div>
          <div class="card-actions">${badge(ROLE_LABELS[a.role] || a.role, ROLE_TONE[a.role] || 'neutral')}</div>
        </div>
        ${a.note ? `<div class="card-body">${escapeHtml(a.note)}</div>` : ''}
        <div class="card-body" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <select class="input" style="width: auto; min-width: 170px;" data-change-for="${a.user_id}">${roleOptions(a.role)}</select>
          <button class="btn-quiet btn-small" data-save="${a.user_id}">Save role</button>
          <button class="btn-danger btn-small" data-remove="${a.user_id}">Remove</button>
        </div>
      </div>`).join('')}</div>`;

    list.querySelectorAll('[data-save]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.save;
        const select = list.querySelector(`[data-change-for="${id}"]`);
        const role = select ? select.value : '';
        const admin = this.admins.find(a => a.user_id === id);
        if (!role || (admin && admin.role === role)) return;

        const ok = await appConfirm(
          `${admin ? (admin.full_name || admin.username) : 'This admin'} will move from ${ROLE_LABELS[admin ? admin.role : ''] || 'their current role'} to ${ROLE_LABELS[role] || role}.`,
          { title: 'Change admin role?', okText: 'Change role' }
        );
        if (ok) await this.grant(id, role, admin ? admin.note : null);
      });
    });

    list.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.remove;
        const admin = this.admins.find(a => a.user_id === id);
        const name = admin ? (admin.full_name || admin.username || 'This admin') : 'This admin';

        const ok = await appConfirm(
          `${name} loses all admin screens immediately. Nothing they already published is removed.`,
          { title: 'Remove admin access?', okText: 'Remove', danger: true }
        );
        if (!ok) return;

        const { data, error } = await supabase.rpc('admin_revoke_role', { p_user: id });
        if (error) return appAlert(rpcError({ code: error.code }, 'Could not remove that admin: ' + error.message));
        if (!data || data.ok === false) return appAlert(rpcError(data));

        await this.load();
      });
    });
  },

  async grant(userId, role, note) {
    const { data, error } = await supabase.rpc('admin_grant_role', { p_user: userId, p_role: role, p_note: note });

    if (error) return appAlert(rpcError({ code: error.code }, 'Could not save that role: ' + error.message));
    if (!data || data.ok === false) return appAlert(rpcError(data));

    const search = document.getElementById('admin-search');
    if (search) search.value = '';
    document.getElementById('search-results').innerHTML = '';

    await this.load();
  }
};
