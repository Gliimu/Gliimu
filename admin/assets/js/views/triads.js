import { supabase } from '../config.js';
import { escapeHtml, gp, badge, empty, timeAgo, avatar, rpcError, openDrawer } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';

const TABS = [
  { id: 'queue', label: 'Apprentice queue' },
  { id: 'triads', label: 'My Triads' }
];

// The stage ladder a captain walks an apprentice through. 'released' keeps
// the history but frees the seat.
const STAGES = [
  { id: 'placed', label: 'Placed', tone: 'info' },
  { id: 'training', label: 'Training', tone: 'brand' },
  { id: 'graduated', label: 'Graduated', tone: 'success' },
  { id: 'released', label: 'Released', tone: 'neutral' }
];
const STAGE_TONE = { placed: 'info', training: 'brand', graduated: 'success', released: 'neutral' };
const SEATS = 3;

export default {
  template: `
    <div class="filters">
      ${TABS.map((t, i) => `<button class="filter-btn${i === 0 ? ' active' : ''}" data-tab="${t.id}">${escapeHtml(t.label)}</button>`).join('')}
    </div>
    <div id="triads-pane"><p class="loading">Loading...</p></div>
  `,

  async init() {
    this.tab = 'queue';
    this.cache = {};

    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.tab = btn.dataset.tab;
        this.render();
      });
    });

    await this.render();
  },

  async render() {
    const pane = document.getElementById('triads-pane');
    if (!pane) return;

    // Both tabs need the triad list (the queue tab uses it to decide whether
    // a Place click can go straight through), so load the two together once.
    if (!this.cache.loaded) {
      pane.innerHTML = '<p class="loading">Loading...</p>';
      const failed = await this.fetch();
      if (failed) {
        pane.innerHTML = empty(failed);
        return;
      }
    }

    pane.innerHTML = this.tab === 'queue' ? this.queueHtml() : this.triadsHtml();
    this.wire(pane);
  },

  async fetch() {
    const unwrap = ({ data, error }) =>
      (error || !data || data.ok === false)
        ? { failed: error ? error.message : rpcError(data) }
        : data;

    const [queue, triads] = await Promise.all([
      supabase.rpc('captain_queue', { p_limit: 200 }),
      supabase.rpc('captain_my_triads')
    ]);

    const q = unwrap(queue);
    const t = unwrap(triads);
    if (q.failed && t.failed) return q.failed;

    this.cache = {
      loaded: true,
      rows: q.failed ? [] : (q.rows || []),
      queueFailed: q.failed || null,
      triads: t.failed ? [] : (t.triads || []),
      seesAll: !t.failed && !!t.sees_all,
      triadsFailed: t.failed || null
    };
    return null;
  },

  invalidate() {
    this.cache = {};
  },

  // ============================================
  // TAB 1 — the apprentice queue
  // ============================================
  queueHtml() {
    const rows = this.cache.rows;
    const open = this.openTriads();

    return `
      <div class="stat-grid">
        <div class="stat"><div class="stat-label">Waiting for a triad</div>
          <div class="stat-value">${rows.length}</div>
          <div class="stat-note">Highest GP first, same order members see.</div></div>
        <div class="stat"><div class="stat-label">Free seats</div>
          <div class="stat-value">${open.reduce((n, t) => n + (SEATS - Number(t.seats || 0)), 0)}</div>
          <div class="stat-note">${open.length} of ${this.cache.triads.length} triad${this.cache.triads.length === 1 ? '' : 's'} have room.</div></div>
      </div>

      ${this.cache.queueFailed ? `<div class="card">${empty(this.cache.queueFailed)}</div>` : ''}

      <div class="card">
        <div class="card-head"><div>
          <div class="card-title">Apprenticeship requests</div>
          <div class="card-sub">Place picks from this list. A triad holds three, and an apprentice can only be in one.</div>
        </div></div>
        ${rows.length ? `
          <div class="row-list">
            ${rows.map(r => `
              <div class="who">
                ${avatar(r.avatar, r.name)}
                <div style="min-width: 0; flex: 1;">
                  <div class="admin-name">${escapeHtml(r.name)} <span class="muted small">${gp(r.gp)}</span></div>
                  <div class="muted small">Applied ${escapeHtml(timeAgo(r.created_at))}</div>
                  ${r.motivation ? `<div class="card-sub" style="margin-top: 6px;">${escapeHtml(String(r.motivation).slice(0, 400))}${String(r.motivation).length > 400 ? '…' : ''}</div>` : ''}
                </div>
                <div class="card-actions">
                  <button class="btn-primary btn-small" data-place="${escapeHtml(r.user_id)}"
                    data-name="${escapeHtml(r.name)}">Place</button>
                </div>
              </div>`).join('')}
          </div>` : empty('Nobody is waiting for a triad right now.')}
      </div>
    `;
  },

  openTriads() {
    return this.cache.triads.filter(t => Number(t.seats || 0) < SEATS);
  },

  // One click places straight through when there is an unambiguous home for
  // the apprentice; only a genuine choice gets a picker.
  async place(userId, name) {
    const open = this.openTriads();

    if (!open.length) {
      if (!this.cache.triads.length) return this.nameTriad(userId, name);
      return appAlert('Every triad you run is full — a triad holds three apprentices. Start a new one from the My Triads tab.',
        { title: 'No free seats' });
    }
    if (open.length === 1) return this.doPlace(open[0].id, open[0].name, userId, name);
    return this.pickTriad(open, userId, name);
  },

  pickTriad(open, userId, name) {
    const { overlay, close } = openDrawer({
      title: `Place ${escapeHtml(name)}`,
      sub: 'Which triad should they join?',
      body: `
        <div class="row-list">
          ${open.map(t => `
            <div class="who">
              <div style="min-width: 0; flex: 1;">
                <div class="admin-name">${escapeHtml(t.name)}</div>
                <div class="muted small">${Number(t.seats || 0)} of ${SEATS} seats taken</div>
              </div>
              <div class="card-actions">
                <button class="btn-primary btn-small" data-choose="${escapeHtml(t.id)}">Place here</button>
              </div>
            </div>`).join('')}
        </div>`,
      foot: `<button class="btn-quiet" data-new-triad>Name a new triad</button>`
    });

    overlay.querySelector('[data-new-triad]').addEventListener('click', () => {
      close();
      this.nameTriad(userId, name);
    });
    overlay.querySelectorAll('[data-choose]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = open.find(x => x.id === btn.dataset.choose);
        close();
        this.doPlace(btn.dataset.choose, t ? t.name : 'that triad', userId, name);
      });
    });
  },

  async doPlace(triadId, triadName, userId, name) {
    const ok = await appConfirm(
      `${name} joins ${triadName}. They will see the triad on their Queue page straight away.`,
      { title: 'Place apprentice', okText: 'Place' });
    if (!ok) return;
    return this.placeNow(triadId, userId);
  },

  async placeNow(triadId, userId) {
    const { data, error } = await supabase.rpc('captain_add_member', { p_triad: triadId, p_user: userId });
    if (error || !data || data.ok === false) {
      return appAlert(error ? `Could not place that apprentice: ${error.message}` : rpcError(data));
    }

    this.invalidate();
    await this.render();
  },

  // Used both for "start a triad" on its own and for placing someone when the
  // captain has no triad yet — pendingUser carries the second case.
  nameTriad(pendingUser = null, pendingName = null) {
    const { overlay, close } = openDrawer({
      title: pendingUser ? `Name the triad for ${escapeHtml(pendingName)}` : 'Name a new triad',
      sub: '3 to 40 characters. Members see this name on their Queue page.',
      body: `
        <div class="form-group">
          <label for="triad-name">Triad name</label>
          <input type="text" id="triad-name" class="input" maxlength="40" placeholder="e.g. Team Dynamo" autocomplete="off">
        </div>`,
      foot: `<button class="btn-primary" id="triad-create">Create triad</button>`
    });

    const input = overlay.querySelector('#triad-name');
    input.focus();

    const submit = async () => {
      const name = input.value.trim();
      if (name.length < 3) return appAlert('Give the triad a name of at least 3 characters.');

      const { data, error } = await supabase.rpc('captain_create_triad', { p_name: name });
      if (error || !data || data.ok === false) {
        return appAlert(error ? `Could not create that triad: ${error.message}` : rpcError(data));
      }

      close();
      this.invalidate();

      if (pendingUser) {
        await this.placeNow(data.id, pendingUser);
        return;
      }
      this.tab = 'triads';
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'triads'));
      await this.render();
    };

    overlay.querySelector('#triad-create').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  },

  // ============================================
  // TAB 2 — my triads and their rosters
  // ============================================
  triadsHtml() {
    const triads = this.cache.triads;

    return `
      ${this.cache.triadsFailed ? `<div class="card">${empty(this.cache.triadsFailed)}</div>` : ''}

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">${this.cache.seesAll ? 'All triads' : 'Your triads'}</div>
            <div class="card-sub">Open a roster to mark progress. Removing an apprentice frees their seat.</div>
          </div>
          <div class="card-actions"><button class="btn-primary btn-small" data-new>New triad</button></div>
        </div>
        ${triads.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Triad</th>${this.cache.seesAll ? '<th>Captain</th>' : ''}<th class="num">Seats</th><th>Created</th><th></th></tr></thead>
            <tbody>${triads.map(t => `
              <tr>
                <td>${escapeHtml(t.name)}</td>
                ${this.cache.seesAll ? `<td class="muted small">${escapeHtml(t.captain)}</td>` : ''}
                <td class="num">${Number(t.seats || 0)} / ${SEATS}</td>
                <td class="muted small">${escapeHtml(timeAgo(t.created_at))}</td>
                <td class="num"><button class="btn-quiet btn-small" data-roster="${escapeHtml(t.id)}">Roster</button></td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : empty('No triads yet. Name your first one.')}
      </div>
    `;
  },

  async openRoster(triadId) {
    const { data, error } = await supabase.rpc('captain_roster', { p_triad: triadId });
    if (error || !data || data.ok === false) {
      return appAlert(error ? `Could not load that roster: ${error.message}` : rpcError(data));
    }

    const members = data.members || [];
    const { overlay } = openDrawer({
      title: escapeHtml(data.name),
      sub: `${members.filter(m => m.progress !== 'released').length} of ${SEATS} seats taken`,
      body: members.length ? members.map(m => this.memberBlock(m)).join('')
        : '<p class="muted small">No apprentices yet. Place someone from the queue tab.</p>'
    });

    overlay.querySelectorAll('[data-stage]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const row = sel.closest('[data-member]');
        this.setProgress(triadId, row.dataset.member, row.dataset.name, sel.value,
          row.querySelector('[data-note]').value.trim());
      });
    });

    overlay.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => this.removeMember(triadId, btn.dataset.remove, btn.dataset.name));
    });
  },

  memberBlock(m) {
    const history = m.history || [];
    return `
      <div class="who" data-member="${escapeHtml(m.user_id)}" data-name="${escapeHtml(m.name)}"
           style="display: block; margin-bottom: 18px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          ${avatar(m.avatar, m.name)}
          <div style="min-width: 0; flex: 1;">
            <div class="admin-name">${escapeHtml(m.name)}</div>
            <div class="muted small">${gp(m.gp)} · joined ${escapeHtml(timeAgo(m.joined_at))}</div>
          </div>
          ${badge(STAGES.find(s => s.id === m.progress)?.label || m.progress, STAGE_TONE[m.progress] || 'neutral')}
        </div>

        <div class="form-group" style="margin-top: 12px;">
          <label for="note-${escapeHtml(m.user_id)}">Note for this change (optional — it goes on the history)</label>
          <input type="text" id="note-${escapeHtml(m.user_id)}" data-note class="input" maxlength="1000"
            placeholder="e.g. Finished the second curriculum project">
        </div>
        <div class="form-group">
          <label for="stage-${escapeHtml(m.user_id)}">Stage — picking one saves it</label>
          <select id="stage-${escapeHtml(m.user_id)}" data-stage class="input">
            ${STAGES.map(s => `<option value="${s.id}"${s.id === m.progress ? ' selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </div>

        <div class="card-actions" style="justify-content: flex-end;">
          <button class="btn-danger btn-small" data-remove="${escapeHtml(m.user_id)}"
            data-name="${escapeHtml(m.name)}">Remove from triad</button>
        </div>

        ${history.length ? `
          <div class="section-title" style="margin-top: 12px;">History</div>
          <div class="table-wrap"><table class="table">
            <tbody>${history.map(h => `
              <tr>
                <td class="muted small" style="white-space: nowrap;">${escapeHtml(timeAgo(h.recorded_at))}</td>
                <td>${badge(STAGES.find(s => s.id === h.progress)?.label || h.progress, STAGE_TONE[h.progress] || 'neutral')}</td>
                <td class="small">${h.note ? escapeHtml(h.note) : '<span class="muted">no note</span>'}<div class="muted small">by ${escapeHtml(h.recorder || '—')}</div></td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : ''}
      </div>
    `;
  },

  async setProgress(triadId, userId, name, stage, note) {
    const { data, error } = await supabase.rpc('captain_set_progress', {
      p_triad: triadId, p_user: userId, p_progress: stage, p_note: note || null
    });
    if (error || !data || data.ok === false) {
      await appAlert(error ? `Could not save that: ${error.message}` : rpcError(data));
      return this.openRoster(triadId);
    }
    this.invalidate();
    await this.render();
    return this.openRoster(triadId);
  },

  async removeMember(triadId, userId, name) {
    const ok = await appConfirm(
      `${name} leaves this triad and the seat opens up again. Their progress history is kept. They go back to the apprentice queue only if their request is still pending.`,
      { title: 'Remove apprentice', okText: 'Remove', danger: true });
    if (!ok) return;

    const { data, error } = await supabase.rpc('captain_remove_member', { p_triad: triadId, p_user: userId });
    if (error || !data || data.ok === false) {
      return appAlert(error ? `Could not remove that apprentice: ${error.message}` : rpcError(data));
    }

    document.querySelector('.drawer-overlay')?.remove();
    this.invalidate();
    await this.render();
  },

  wire(pane) {
    pane.querySelectorAll('[data-place]').forEach((btn) => {
      btn.addEventListener('click', () => this.place(btn.dataset.place, btn.dataset.name));
    });
    const create = pane.querySelector('[data-new]');
    if (create) create.addEventListener('click', () => this.nameTriad());
    pane.querySelectorAll('[data-roster]').forEach((btn) => {
      btn.addEventListener('click', () => this.openRoster(btn.dataset.roster));
    });
  }
};
