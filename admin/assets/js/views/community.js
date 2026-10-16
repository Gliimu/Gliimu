import { supabase } from '../config.js';
import { escapeHtml, empty, rpcError, openDrawer, avatar, badge } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';

const TABS = [
  { id: 'contests', label: 'Contests' },
  { id: 'cohorts', label: 'Cohorts' },
  { id: 'events', label: 'Events' },
  { id: 'news', label: 'News' }
];

const METRICS = [
  { v: 'gp', label: 'GP earned' },
  { v: 'reading', label: 'Titles read' },
  { v: 'engagement', label: 'Engagement' },
  { v: 'referrals', label: 'Referrals (Phase 3)' }
];
const METRIC_LABEL = Object.fromEntries(METRICS.map(m => [m.v, m.label]));

const VENUES = [
  { v: 'Online', label: 'Online' },
  { v: 'Hall', label: 'Gliimu Hall, Gwarinpa' },
  { v: 'Custom', label: 'Custom location' }
];
const VENUE_LABEL = Object.fromEntries(VENUES.map(v => [v.v, v.label]));

const pad = (n) => String(n).padStart(2, '0');

// ISO -> value for an <input type="datetime-local"> (local time, no zone).
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// datetime-local value -> ISO string for the RPC, or null when blank.
const toISO = (v) => (v ? new Date(v).toISOString() : null);

const fmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${d.getDate()} ${d.toLocaleString(undefined, { month: 'short' })} ${d.getFullYear()}, ${h}:${pad(d.getMinutes())} ${ampm}`;
};

const venueOf = (ev) => (ev.venue_type === 'Custom' ? (ev.venue_text || 'Custom') : (VENUE_LABEL[ev.venue_type] || ev.venue_type));

const statusOf = (c) => {
  const now = Date.now();
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return 'upcoming';
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return 'ended';
  return 'live';
};

export default {
  template: `
    <div class="filters">
      ${TABS.map((t, i) => `<button class="filter-btn${i === 0 ? ' active' : ''}" data-tab="${t.id}">${escapeHtml(t.label)}</button>`).join('')}
    </div>
    <div id="community-pane"><p class="loading">Loading...</p></div>
  `,

  async init() {
    this.tab = 'contests';
    this.data = { contests: null, cohorts: null, events: null, news: null };

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
    const pane = document.getElementById('community-pane');
    if (!pane) return;

    const failed = await this.fetch();
    if (failed) { pane.innerHTML = empty(failed); return; }

    pane.innerHTML =
      this.tab === 'cohorts' ? this.cohortsHtml() :
      this.tab === 'events' ? this.eventsHtml() :
      this.tab === 'news' ? this.newsHtml() :
      this.contestsHtml();

    this.wire(pane);
  },

  async fetch() {
    const key = this.tab;
    if (this.data[key]) return null;
    const rpcName = `operations_${key}`;
    const { data, error } = await supabase.rpc(rpcName);
    if (error) {
      // A missing function means sql/community.sql has not been run yet.
      if (['42883', 'PGRST202'].includes(error.code)) {
        return 'The Community tables are not set up yet. Run sql/community.sql in the Supabase SQL Editor, then reload.';
      }
      return error.message;
    }
    if (!data || data.ok === false) return rpcError(data);
    this.data[key] = data[key] || [];
    return null;
  },

  invalidate(key) { this.data[key] = null; },

  row(list, id) { return (list || []).find(r => r.id === id); },

  // ============================================
  // Contests
  // ============================================
  contestsHtml() {
    const rows = this.data.contests || [];
    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Contests</div>
            <div class="card-sub">Scores track themselves from each member's activity inside the contest window. One contest can be featured — it drives the member leaderboard.</div>
          </div>
          <div class="card-actions"><button class="btn-primary btn-small" data-add="contests">New contest</button></div>
        </div>
        ${rows.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Contest</th><th>Metric</th><th>Window</th><th class="num">Entries</th><th>Status</th><th class="num"></th></tr></thead>
            <tbody>${rows.map(c => {
              const st = statusOf(c);
              const win = c.ends_at ? `${fmt(c.starts_at)} → ${fmt(c.ends_at)}` : `${fmt(c.starts_at)} → open`;
              return `
              <tr>
                <td>
                  ${c.is_featured ? badge('Featured', 'positive') + ' ' : ''}
                  ${escapeHtml(c.title || '—')}
                  ${c.is_archived ? ' ' + badge('Archived', 'neutral') : ''}
                  ${c.prize_text ? `<div class="muted small">${escapeHtml(c.prize_text)}</div>` : ''}
                </td>
                <td>${escapeHtml(METRIC_LABEL[c.metric] || c.metric || '—')}</td>
                <td class="muted small">${escapeHtml(win)}</td>
                <td class="num">${Number(c.entries || 0)}</td>
                <td>${badge(st, st === 'live' ? 'positive' : st === 'upcoming' ? 'info' : 'neutral')}</td>
                <td class="num" style="white-space:nowrap;">
                  <button class="btn-quiet btn-small" data-edit="contests" data-id="${escapeHtml(c.id)}">Edit</button>
                  <button class="btn-danger btn-small" data-remove="contests" data-id="${escapeHtml(c.id)}" data-name="${escapeHtml(c.title || 'that contest')}">Delete</button>
                </td>
              </tr>`;
            }).join('')}
            </tbody>
          </table></div>` : empty('No contests yet. Create the first one.')}
      </div>`;
  },

  contestDrawer(existing) {
    const e = existing || {};
    const { overlay, close } = openDrawer({
      title: existing ? `Edit ${escapeHtml(existing.title || 'contest')}` : 'New contest',
      sub: 'The window decides what counts toward the score.',
      body: `
        <div class="form-group">
          <label for="c-title">Title</label>
          <input type="text" id="c-title" class="input" maxlength="120" autocomplete="off" value="${escapeHtml(e.title || '')}" placeholder="e.g. October Reading Sprint">
        </div>
        <div class="form-group">
          <label for="c-desc">Description</label>
          <textarea id="c-desc" class="input" rows="3" placeholder="What members do, and what they win.">${escapeHtml(e.description || '')}</textarea>
        </div>
        <div class="form-group">
          <label for="c-metric">Scoring metric</label>
          <select id="c-metric" class="input">
            ${METRICS.map(m => `<option value="${m.v}"${(e.metric || 'gp') === m.v ? ' selected' : ''}>${escapeHtml(m.label)}</option>`).join('')}
          </select>
          <div class="card-sub">Referrals stay at zero until Phase 3 wires up referral tracking.</div>
        </div>
        <div class="form-group">
          <label for="c-starts">Starts</label>
          <input type="datetime-local" id="c-starts" class="input" value="${escapeHtml(toLocalInput(e.starts_at))}">
        </div>
        <div class="form-group">
          <label for="c-ends">Ends</label>
          <input type="datetime-local" id="c-ends" class="input" value="${escapeHtml(toLocalInput(e.ends_at))}">
          <div class="card-sub">Leave blank for an open-ended contest.</div>
        </div>
        <div class="form-group">
          <label for="c-prize">Prize</label>
          <input type="text" id="c-prize" class="input" maxlength="160" autocomplete="off" value="${escapeHtml(e.prize_text || '')}" placeholder="e.g. ₦50,000 + a featured spot">
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;font-weight:500;">
            <input type="checkbox" id="c-featured"${e.is_featured ? ' checked' : ''}> Feature on the leaderboard
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-weight:500;margin-top:8px;">
            <input type="checkbox" id="c-archived"${e.is_archived ? ' checked' : ''}> Archive (hide from members)
          </label>
        </div>`,
      foot: `
        <button class="btn-quiet" data-cancel>Cancel</button>
        <button class="btn-primary" id="c-save">${existing ? 'Save changes' : 'Create contest'}</button>`
    });

    overlay.querySelector('[data-cancel]').addEventListener('click', close);
    const save = overlay.querySelector('#c-save');
    save.addEventListener('click', async () => {
      const title = overlay.querySelector('#c-title').value.trim();
      if (!title) return appAlert('Give the contest a title.');
      const params = {
        p_title: title,
        p_description: overlay.querySelector('#c-desc').value.trim(),
        p_metric: overlay.querySelector('#c-metric').value,
        p_starts_at: toISO(overlay.querySelector('#c-starts').value),
        p_ends_at: toISO(overlay.querySelector('#c-ends').value),
        p_prize_text: overlay.querySelector('#c-prize').value.trim(),
        p_is_featured: overlay.querySelector('#c-featured').checked,
        p_is_archived: overlay.querySelector('#c-archived').checked
      };
      if (existing) params.p_id = existing.id;

      save.disabled = true;
      const { data, error } = await supabase.rpc('operations_save_contest', params);
      save.disabled = false;
      if (error || !data || data.ok === false) {
        return appAlert(error ? `Could not save that contest: ${error.message}` : rpcError(data));
      }
      close();
      this.invalidate('contests');
      await this.render();
    });
  },

  // ============================================
  // Cohorts
  // ============================================
  cohortsHtml() {
    const rows = this.data.cohorts || [];
    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Cohorts</div>
            <div class="card-sub">Seat-capped groups. Members request a seat; you approve or reject it here.</div>
          </div>
          <div class="card-actions"><button class="btn-primary btn-small" data-add="cohorts">New cohort</button></div>
        </div>
        ${rows.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Cohort</th><th class="num">Seats</th><th class="num">Pending</th><th>Starts</th><th class="num"></th></tr></thead>
            <tbody>${rows.map(co => `
              <tr>
                <td>${escapeHtml(co.title || '—')}${co.is_archived ? ' ' + badge('Archived', 'neutral') : ''}
                  ${co.description ? `<div class="muted small">${escapeHtml(co.description)}</div>` : ''}</td>
                <td class="num">${Number(co.seats_taken || 0)} / ${Number(co.seats || 0)}</td>
                <td class="num">${Number(co.pending || 0) > 0 ? badge(String(co.pending), 'warning') : '<span class="muted small">0</span>'}</td>
                <td class="muted small">${escapeHtml(fmt(co.starts_at))}</td>
                <td class="num" style="white-space:nowrap;">
                  <button class="btn-quiet btn-small" data-requests="${escapeHtml(co.id)}" data-name="${escapeHtml(co.title || 'cohort')}">Requests</button>
                  <button class="btn-quiet btn-small" data-edit="cohorts" data-id="${escapeHtml(co.id)}">Edit</button>
                  <button class="btn-danger btn-small" data-remove="cohorts" data-id="${escapeHtml(co.id)}" data-name="${escapeHtml(co.title || 'that cohort')}">Delete</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : empty('No cohorts yet. Create the first one.')}
      </div>`;
  },

  cohortDrawer(existing) {
    const e = existing || {};
    const { overlay, close } = openDrawer({
      title: existing ? `Edit ${escapeHtml(existing.title || 'cohort')}` : 'New cohort',
      body: `
        <div class="form-group">
          <label for="co-title">Title</label>
          <input type="text" id="co-title" class="input" maxlength="120" autocomplete="off" value="${escapeHtml(e.title || '')}" placeholder="e.g. Cohort 1 — first 9">
        </div>
        <div class="form-group">
          <label for="co-desc">Description</label>
          <textarea id="co-desc" class="input" rows="3">${escapeHtml(e.description || '')}</textarea>
        </div>
        <div class="form-group">
          <label for="co-seats">Seats</label>
          <input type="number" id="co-seats" class="input" min="1" max="100000" step="1" value="${Number(e.seats || 9)}">
        </div>
        <div class="form-group">
          <label for="co-starts">Starts</label>
          <input type="datetime-local" id="co-starts" class="input" value="${escapeHtml(toLocalInput(e.starts_at))}">
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;font-weight:500;">
            <input type="checkbox" id="co-archived"${e.is_archived ? ' checked' : ''}> Archive (hide from members)
          </label>
        </div>`,
      foot: `
        <button class="btn-quiet" data-cancel>Cancel</button>
        <button class="btn-primary" id="co-save">${existing ? 'Save changes' : 'Create cohort'}</button>`
    });

    overlay.querySelector('[data-cancel]').addEventListener('click', close);
    const save = overlay.querySelector('#co-save');
    save.addEventListener('click', async () => {
      const title = overlay.querySelector('#co-title').value.trim();
      if (!title) return appAlert('Give the cohort a title.');
      const seats = parseInt(overlay.querySelector('#co-seats').value, 10);
      const params = {
        p_title: title,
        p_description: overlay.querySelector('#co-desc').value.trim(),
        p_seats: Number.isFinite(seats) ? seats : null,
        p_starts_at: toISO(overlay.querySelector('#co-starts').value),
        p_is_archived: overlay.querySelector('#co-archived').checked
      };
      if (existing) params.p_id = existing.id;

      save.disabled = true;
      const { data, error } = await supabase.rpc('operations_save_cohort', params);
      save.disabled = false;
      if (error || !data || data.ok === false) {
        return appAlert(error ? `Could not save that cohort: ${error.message}` : rpcError(data));
      }
      close();
      this.invalidate('cohorts');
      await this.render();
    });
  },

  async requestsDrawer(cohortId, cohortName) {
    const { data, error } = await supabase.rpc('operations_cohort_requests', { p_cohort: cohortId });
    if (error || !data || data.ok === false) {
      return appAlert(error ? `Could not load requests: ${error.message}` : rpcError(data));
    }
    const reqs = data.requests || [];

    const { overlay, close } = openDrawer({
      title: `Seat requests — ${escapeHtml(cohortName || 'cohort')}`,
      sub: 'Approving fills a seat. Once the cohort is full, further approvals are refused.',
      body: reqs.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Member</th><th>Requested</th><th>Status</th><th class="num"></th></tr></thead>
          <tbody>${reqs.map(r => `
            <tr>
              <td><div style="display:flex;align-items:center;gap:10px;">${avatar(r.avatar_url, r.full_name)}
                <span>${escapeHtml(r.full_name || 'Member')}</span></div></td>
              <td class="muted small">${escapeHtml(fmt(r.requested_at))}</td>
              <td>${badge(r.status, r.status === 'approved' ? 'positive' : r.status === 'pending' ? 'warning' : 'neutral')}</td>
              <td class="num" style="white-space:nowrap;">
                ${r.status === 'pending' ? `
                  <button class="btn-primary btn-small" data-decide="approved" data-req="${escapeHtml(r.id)}">Approve</button>
                  <button class="btn-danger btn-small" data-decide="rejected" data-req="${escapeHtml(r.id)}">Reject</button>`
                : '<span class="muted small">decided</span>'}
              </td>
            </tr>`).join('')}
          </tbody>
        </table></div>` : empty('No seat requests yet.'),
      foot: `<button class="btn-quiet" data-cancel>Close</button>`
    });

    overlay.querySelector('[data-cancel]').addEventListener('click', close);
    overlay.querySelectorAll('[data-decide]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const decision = btn.dataset.decide;
        btn.disabled = true;
        const { data: res, error: err } = await supabase.rpc('operations_review_cohort_request', {
          p_request: btn.dataset.req, p_decision: decision
        });
        btn.disabled = false;
        if (err || !res || res.ok === false) {
          await appAlert(err ? `Could not ${decision === 'approved' ? 'approve' : 'reject'}: ${err.message}` : rpcError(res));
        }
        this.invalidate('cohorts');
        await this.requestsDrawer(cohortId, cohortName); // re-open with fresh data
      });
    });
  },

  // ============================================
  // Events
  // ============================================
  eventsHtml() {
    const rows = this.data.events || [];
    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Events</div>
            <div class="card-sub">Display-only on the member Community page. Only upcoming events (start at or after now) are shown to members.</div>
          </div>
          <div class="card-actions"><button class="btn-primary btn-small" data-add="events">New event</button></div>
        </div>
        ${rows.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Event</th><th>When</th><th>Venue</th><th class="num"></th></tr></thead>
            <tbody>${rows.map(ev => `
              <tr>
                <td>${escapeHtml(ev.title || '—')}${ev.is_archived ? ' ' + badge('Archived', 'neutral') : ''}
                  ${ev.description ? `<div class="muted small">${escapeHtml(ev.description)}</div>` : ''}</td>
                <td class="muted small">${escapeHtml(fmt(ev.starts_at))}</td>
                <td>${escapeHtml(venueOf(ev))}</td>
                <td class="num" style="white-space:nowrap;">
                  <button class="btn-quiet btn-small" data-edit="events" data-id="${escapeHtml(ev.id)}">Edit</button>
                  <button class="btn-danger btn-small" data-remove="events" data-id="${escapeHtml(ev.id)}" data-name="${escapeHtml(ev.title || 'that event')}">Delete</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : empty('No events yet. Create the first one.')}
      </div>`;
  },

  eventDrawer(existing) {
    const e = existing || {};
    const venue = e.venue_type || 'Online';
    const { overlay, close } = openDrawer({
      title: existing ? `Edit ${escapeHtml(existing.title || 'event')}` : 'New event',
      body: `
        <div class="form-group">
          <label for="ev-title">Title</label>
          <input type="text" id="ev-title" class="input" maxlength="120" autocomplete="off" value="${escapeHtml(e.title || '')}" placeholder="e.g. Founder Q&A">
        </div>
        <div class="form-group">
          <label for="ev-desc">Description</label>
          <textarea id="ev-desc" class="input" rows="3">${escapeHtml(e.description || '')}</textarea>
        </div>
        <div class="form-group">
          <label for="ev-starts">Date and time</label>
          <input type="datetime-local" id="ev-starts" class="input" value="${escapeHtml(toLocalInput(e.starts_at))}">
        </div>
        <div class="form-group">
          <label for="ev-venue">Venue</label>
          <select id="ev-venue" class="input">
            ${VENUES.map(v => `<option value="${v.v}"${venue === v.v ? ' selected' : ''}>${escapeHtml(v.label)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="ev-custom-wrap"${venue === 'Custom' ? '' : ' hidden'}>
          <label for="ev-custom">Custom location</label>
          <input type="text" id="ev-custom" class="input" maxlength="160" autocomplete="off" value="${escapeHtml(e.venue_text || '')}" placeholder="e.g. Wuse Hub, Abuja">
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;font-weight:500;">
            <input type="checkbox" id="ev-archived"${e.is_archived ? ' checked' : ''}> Archive (hide from members)
          </label>
        </div>`,
      foot: `
        <button class="btn-quiet" data-cancel>Cancel</button>
        <button class="btn-primary" id="ev-save">${existing ? 'Save changes' : 'Create event'}</button>`
    });

    overlay.querySelector('[data-cancel]').addEventListener('click', close);
    const venueSel = overlay.querySelector('#ev-venue');
    const customWrap = overlay.querySelector('#ev-custom-wrap');
    venueSel.addEventListener('change', () => {
      customWrap.hidden = venueSel.value !== 'Custom';
    });

    const save = overlay.querySelector('#ev-save');
    save.addEventListener('click', async () => {
      const title = overlay.querySelector('#ev-title').value.trim();
      if (!title) return appAlert('Give the event a title.');
      const starts = overlay.querySelector('#ev-starts').value;
      if (!starts) return appAlert('Pick a date and time for the event.');
      const params = {
        p_title: title,
        p_description: overlay.querySelector('#ev-desc').value.trim(),
        p_starts_at: toISO(starts),
        p_venue_type: venueSel.value,
        p_venue_text: overlay.querySelector('#ev-custom').value.trim(),
        p_is_archived: overlay.querySelector('#ev-archived').checked
      };
      if (existing) params.p_id = existing.id;

      save.disabled = true;
      const { data, error } = await supabase.rpc('operations_save_event', params);
      save.disabled = false;
      if (error || !data || data.ok === false) {
        return appAlert(error ? `Could not save that event: ${error.message}` : rpcError(data));
      }
      close();
      this.invalidate('events');
      await this.render();
    });
  },

  // ============================================
  // News
  // ============================================
  newsHtml() {
    const rows = this.data.news || [];
    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">News</div>
            <div class="card-sub">Announcements on the member Community page. Only published items are shown.</div>
          </div>
          <div class="card-actions"><button class="btn-primary btn-small" data-add="news">New post</button></div>
        </div>
        ${rows.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Title</th><th>Status</th><th>Posted</th><th class="num"></th></tr></thead>
            <tbody>${rows.map(n => `
              <tr>
                <td>${escapeHtml(n.title || '—')}${n.body ? `<div class="muted small">${escapeHtml(n.body.slice(0, 90))}${n.body.length > 90 ? '…' : ''}</div>` : ''}</td>
                <td>${n.is_published ? badge('Published', 'positive') : badge('Draft', 'neutral')}</td>
                <td class="muted small">${escapeHtml(fmt(n.created_at))}</td>
                <td class="num" style="white-space:nowrap;">
                  <button class="btn-quiet btn-small" data-edit="news" data-id="${escapeHtml(n.id)}">Edit</button>
                  <button class="btn-danger btn-small" data-remove="news" data-id="${escapeHtml(n.id)}" data-name="${escapeHtml(n.title || 'that post')}">Delete</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : empty('No news yet. Post the first announcement.')}
      </div>`;
  },

  newsDrawer(existing) {
    const e = existing || {};
    const published = existing ? !!e.is_published : true;
    const { overlay, close } = openDrawer({
      title: existing ? `Edit ${escapeHtml(existing.title || 'post')}` : 'New post',
      body: `
        <div class="form-group">
          <label for="n-title">Title</label>
          <input type="text" id="n-title" class="input" maxlength="140" autocomplete="off" value="${escapeHtml(e.title || '')}">
        </div>
        <div class="form-group">
          <label for="n-body">Body</label>
          <textarea id="n-body" class="input" rows="6">${escapeHtml(e.body || '')}</textarea>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;font-weight:500;">
            <input type="checkbox" id="n-published"${published ? ' checked' : ''}> Published
          </label>
        </div>`,
      foot: `
        <button class="btn-quiet" data-cancel>Cancel</button>
        <button class="btn-primary" id="n-save">${existing ? 'Save changes' : 'Publish post'}</button>`
    });

    overlay.querySelector('[data-cancel]').addEventListener('click', close);
    const save = overlay.querySelector('#n-save');
    save.addEventListener('click', async () => {
      const title = overlay.querySelector('#n-title').value.trim();
      if (!title) return appAlert('Give the post a title.');
      const params = {
        p_title: title,
        p_body: overlay.querySelector('#n-body').value.trim(),
        p_is_published: overlay.querySelector('#n-published').checked
      };
      if (existing) params.p_id = existing.id;

      save.disabled = true;
      const { data, error } = await supabase.rpc('operations_save_news', params);
      save.disabled = false;
      if (error || !data || data.ok === false) {
        return appAlert(error ? `Could not save that post: ${error.message}` : rpcError(data));
      }
      close();
      this.invalidate('news');
      await this.render();
    });
  },

  // ============================================
  // Shared remove
  // ============================================
  async remove(kind, id, name) {
    const noun = kind === 'news' ? 'post' : kind.replace(/s$/, '');
    const ok = await appConfirm(`${name} will be deleted for good.`,
      { title: `Delete ${noun}`, okText: 'Delete', danger: true });
    if (!ok) return;

    const rpcName = `operations_delete_${kind === 'news' ? 'news' : noun}`;
    const { data, error } = await supabase.rpc(rpcName, { p_id: id });
    if (error || !data || data.ok === false) {
      await appAlert(error ? `Could not delete that ${noun}: ${error.message}` : rpcError(data));
    }
    this.invalidate(kind);
    await this.render();
  },

  openAdd(kind) {
    if (kind === 'contests') return this.contestDrawer(null);
    if (kind === 'cohorts') return this.cohortDrawer(null);
    if (kind === 'events') return this.eventDrawer(null);
    if (kind === 'news') return this.newsDrawer(null);
  },

  openEdit(kind, id) {
    const rec = this.row(this.data[kind], id);
    if (!rec) return;
    if (kind === 'contests') return this.contestDrawer(rec);
    if (kind === 'cohorts') return this.cohortDrawer(rec);
    if (kind === 'events') return this.eventDrawer(rec);
    if (kind === 'news') return this.newsDrawer(rec);
  },

  // ============================================
  // Wiring
  // ============================================
  wire(pane) {
    pane.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => this.openAdd(b.dataset.add)));
    pane.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => this.openEdit(b.dataset.edit, b.dataset.id)));
    pane.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => this.remove(b.dataset.remove, b.dataset.id, b.dataset.name)));
    pane.querySelectorAll('[data-requests]').forEach(b => b.addEventListener('click', () => this.requestsDrawer(b.dataset.requests, b.dataset.name)));
  }
};
