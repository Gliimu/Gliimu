import { supabase } from '/shared/js/config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const isMissingSchema = (err) => !!err && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(err.code);

const METRIC_LABEL = {
  gp: 'GP earned',
  reading: 'Titles read',
  engagement: 'Engagement',
  referrals: 'Referrals'
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} · ${h}:${min} ${ampm}`;
};

const fmtDay = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

const initials = (name) => {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
};

const avatar = (row) => row.avatar_url
  ? `<img class="com-ava" src="${esc(row.avatar_url)}" alt="" loading="lazy">`
  : `<span class="com-ava com-ava-fallback">${esc(initials(row.full_name))}</span>`;

const trophy = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>`;
const calendarIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
const usersIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
const referIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>`;
const linkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
const filterIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>`;

const SECTIONS = [
  { key: 'leaderboard', label: 'Leaderboard', icon: trophy },
  { key: 'cohorts', label: 'Cohorts', icon: usersIcon },
  { key: 'refer', label: 'Refer & earn', icon: referIcon }
];

let outsideBound = false;

const updatesView = {
  board: null,
  referral: null,
  schemaMissing: false,
  loading: true,
  busy: null,
  filter: 'leaderboard',
  filterOpen: false,

  template: `
    <div class="com-layout" id="com-container">
      <div id="com-content"></div>
    </div>
  `,

  async init() {
    window.updatesInstance = {
      joinContest: (id) => this.joinContest(id),
      requestCohort: (id) => this.requestCohort(id),
      toggleFilter: (ev) => this.toggleFilter(ev),
      setFilter: (key) => this.setFilter(key),
      copyRefLink: () => this.copyRefLink()
    };
    this.filter = 'leaderboard';
    this.filterOpen = false;
    this.setupTopbar();

    if (!outsideBound) {
      outsideBound = true;
      document.addEventListener('click', (e) => {
        if (!this.filterOpen) return;
        const box = document.getElementById('com-filter');
        if (box && !box.contains(e.target)) { this.filterOpen = false; this.render(); }
      });
    }

    await this.load();
  },

  setupTopbar() {
    const dyn = document.getElementById('topbar-dynamic-content');
    const right = document.getElementById('topbar-right-actions');
    if (dyn) dyn.innerHTML = '';
    if (right) right.innerHTML = '';
  },

  toggleFilter(ev) {
    if (ev) ev.stopPropagation();
    this.filterOpen = !this.filterOpen;
    this.render();
  },

  setFilter(key) {
    this.filter = key;
    this.filterOpen = false;
    this.render();
  },

  async load() {
    this.loading = true;
    this.render();

    const [{ data, error }, { data: ref }] = await Promise.all([
      supabase.rpc('community_board', {}),
      supabase.rpc('referral_summary', {}).then((r) => r, () => ({ data: null }))
    ]);
    this.referral = ref && ref.code ? ref : null;

    if (error) {
      this.loading = false;
      if (isMissingSchema(error)) {
        this.schemaMissing = true;
        this.board = null;
      } else {
        console.error('Failed to load Updates', error);
      }
      this.render();
      return;
    }

    this.loading = false;
    this.schemaMissing = false;
    this.board = data && data.ok ? data : null;
    this.render();
  },

  async joinContest(id) {
    if (this.busy) return;
    this.busy = id;
    this.render();
    const { error } = await supabase.rpc('contest_join', { p_contest: id });
    this.busy = null;
    if (error) {
      await appAlert(error.message || 'Could not join the contest.');
    }
    await this.load();
  },

  async requestCohort(id) {
    if (this.busy) return;
    this.busy = id;
    this.render();
    const { data, error } = await supabase.rpc('cohort_request', { p_cohort: id });
    this.busy = null;
    if (error) {
      await appAlert(error.message || 'Could not request a seat.');
    } else if (data && !data.ok) {
      const msg = { FULL: 'Every seat in this cohort is taken.', ALREADY_IN: 'You already have a seat in this cohort.' }[data.code];
      await appAlert(msg || data.hint || 'Could not request a seat.');
    }
    await this.load();
  },

  render() {
    const el = document.getElementById('com-content');
    if (!el) return;
    this.renderTopbar();
    if (this.loading) { el.innerHTML = this.renderLoading(); return; }
    if (this.schemaMissing) { el.innerHTML = this.renderMissing(); return; }
    if (!this.board) { el.innerHTML = this.renderError(); return; }
    el.innerHTML = this.renderBoard();
  },

  renderTopbar() {
    const right = document.getElementById('topbar-right-actions');
    if (!right) return;
    const ready = !this.loading && !this.schemaMissing && !!this.board;
    right.innerHTML = ready ? this.renderFilter() : '';
  },

  renderLoading() {
    return `<div class="com-empty"><p>Loading Updates…</p></div>`;
  },

  renderMissing() {
    return `
      <div class="com-empty">
        <h3>Updates are not set up yet</h3>
        <p>Run <code>sql/community.sql</code> in the Supabase SQL Editor, then reload.</p>
      </div>
    `;
  },

  renderError() {
    return `
      <div class="com-empty">
        <h3>Could not load Updates</h3>
        <p>Check your connection and reload.</p>
      </div>
    `;
  },

  renderFilter() {
    const current = SECTIONS.find(s => s.key === this.filter) || SECTIONS[0];
    return `
      <div class="com-filter" id="com-filter">
        <button class="com-filter-btn" onclick="updatesInstance.toggleFilter(event)" title="Filter sections" aria-haspopup="true" aria-expanded="${this.filterOpen ? 'true' : 'false'}">
          ${filterIcon}
          <span class="com-filter-label">${esc(current.label)}</span>
        </button>
        ${this.filterOpen ? `
          <div class="com-filter-menu" role="menu">
            ${SECTIONS.map(s => `
              <button class="com-filter-opt${s.key === this.filter ? ' active' : ''}" role="menuitem" onclick="updatesInstance.setFilter('${s.key}')">
                ${s.icon}<span>${esc(s.label)}</span>
              </button>`).join('')}
          </div>` : ''}
      </div>
    `;
  },

  renderBoard() {
    const b = this.board;
    const f = this.filter;
    const head = `
      <header class="com-head">
        <h1 class="com-h1">Updates</h1>
      </header>
    `;

    let section = '';
    if (f === 'leaderboard') {
      const lb = this.renderLeaderboard(b.leaderboard);
      const contests = this.renderContests(b.contests || []);
      section = (lb || '') + contests;
      if (!lb && !(b.contests || []).length) {
        section = `<section class="com-section">${this.sectionTitle(trophy, 'Leaderboard')}<div class="com-mini-empty">No featured contest yet.</div></section>`;
      }
    } else if (f === 'cohorts') {
      section = this.renderCohorts(b.cohorts || []);
    } else if (f === 'refer') {
      section = this.renderRefer();
    }

    return head + section;
  },

  sectionTitle(icon, text, note) {
    return `
      <div class="com-section-head">
        <span class="com-section-icon">${icon}</span>
        <h2 class="com-section-title">${esc(text)}</h2>
        ${note ? `<span class="com-section-note">${esc(note)}</span>` : ''}
      </div>
    `;
  },

  renderLeaderboard(lb) {
    if (!lb || !lb.contest_id) return '';
    const rows = Array.isArray(lb.rows) ? lb.rows : [];
    const metric = METRIC_LABEL[lb.metric] || 'Points';

    const body = rows.length ? `
      <ol class="com-board">
        ${rows.map(r => `
          <li class="com-board-row rank-${r.rank <= 3 ? r.rank : 'n'}">
            <span class="com-rank">${r.rank}</span>
            <a class="com-board-id" href="#/profile?u=${esc(r.user_id)}">
              ${avatar(r)}
              <span class="com-board-name">${esc(r.full_name || 'Member')}</span>
            </a>
            <span class="com-board-score">${Number(r.score || 0).toLocaleString()}<em>${esc(metric)}</em></span>
          </li>
        `).join('')}
      </ol>
    ` : `<div class="com-mini-empty">No one has joined yet. Be the first.</div>`;

    return `
      <section class="com-section com-leaderboard">
        ${this.sectionTitle(trophy, 'Leaderboard', lb.contest_title)}
        ${body}
      </section>
    `;
  },

  renderContests(list) {
    const cards = list.map(c => {
      const metric = METRIC_LABEL[c.metric] || c.metric;
      const status = c.status || 'live';
      const window_ = c.ends_at ? `${fmtDay(c.starts_at)} – ${fmtDay(c.ends_at)}` : `From ${fmtDay(c.starts_at)}`;
      const busy = this.busy === c.id;

      let action;
      if (status === 'ended') {
        action = `<span class="com-pill ended">Ended</span>`;
      } else if (c.joined) {
        action = `<span class="com-pill joined">Joined · ${Number(c.score || 0).toLocaleString()}</span>`;
      } else {
        action = `<button class="com-btn" ${busy ? 'disabled' : ''} onclick="updatesInstance.joinContest('${c.id}')">${busy ? 'Joining…' : 'Join contest'}</button>`;
      }

      return `
        <article class="com-card">
          <div class="com-card-top">
            <span class="com-badge metric-${esc(c.metric)}">${esc(metric)}</span>
            <span class="com-status status-${esc(status)}">${esc(status)}</span>
          </div>
          <h3 class="com-card-title">${esc(c.title)}</h3>
          ${c.description ? `<p class="com-card-desc">${esc(c.description)}</p>` : ''}
          <div class="com-card-meta">
            <span>${calendarIcon} ${esc(window_)}</span>
            <span>${usersIcon} ${c.entries || 0} joined</span>
          </div>
          ${c.prize_text ? `<div class="com-prize">${trophy} ${esc(c.prize_text)}</div>` : ''}
          <div class="com-card-foot">${action}</div>
        </article>
      `;
    }).join('');

    return `
      <section class="com-section">
        ${this.sectionTitle(trophy, 'Contests')}
        ${list.length ? `<div class="com-grid">${cards}</div>` : `<div class="com-mini-empty">No contests right now. Check back soon.</div>`}
      </section>
    `;
  },

  renderCohorts(list) {
    const cards = list.map(co => {
      const taken = co.seats_taken || 0;
      const seats = co.seats || 0;
      const full = taken >= seats;
      const busy = this.busy === co.id;

      let action;
      if (co.my_status === 'approved') {
        action = `<span class="com-pill joined">You have a seat</span>`;
      } else if (co.my_status === 'pending') {
        action = `<span class="com-pill pending">Request pending</span>`;
      } else if (co.my_status === 'rejected') {
        action = `<button class="com-btn" ${busy ? 'disabled' : ''} onclick="updatesInstance.requestCohort('${co.id}')">${busy ? 'Sending…' : 'Request again'}</button>`;
      } else if (full) {
        action = `<span class="com-pill ended">Full</span>`;
      } else {
        action = `<button class="com-btn" ${busy ? 'disabled' : ''} onclick="updatesInstance.requestCohort('${co.id}')">${busy ? 'Request a seat' : 'Request a seat'}</button>`;
      }

      return `
        <article class="com-card">
          <h3 class="com-card-title">${esc(co.title)}</h3>
          ${co.description ? `<p class="com-card-desc">${esc(co.description)}</p>` : ''}
          <div class="com-card-meta">
            <span>${usersIcon} ${taken} / ${seats} seats</span>
            ${co.starts_at ? `<span>${calendarIcon} Starts ${esc(fmtDay(co.starts_at))}</span>` : ''}
          </div>
          <div class="com-seats"><span style="width:${seats ? Math.min(100, (taken / seats) * 100) : 0}%"></span></div>
          <div class="com-card-foot">${action}</div>
        </article>
      `;
    }).join('');

    return `
      <section class="com-section">
        ${this.sectionTitle(usersIcon, 'Cohorts', 'Seat-capped · operations approves')}
        ${list.length ? `<div class="com-grid">${cards}</div>` : `<div class="com-mini-empty">No open cohorts yet.</div>`}
      </section>
    `;
  },

  renderRefer() {
    const r = this.referral;
    if (!r || !r.code) {
      return `
        <section class="com-section">
          ${this.sectionTitle(referIcon, 'Refer & earn')}
          <div class="com-mini-empty">Run <code>sql/referrals.sql</code> in the Supabase SQL Editor to enable referrals.</div>
        </section>
      `;
    }
    const link = `${window.location.origin}${r.link}`;
    return `
      <section class="com-section com-refer">
        ${this.sectionTitle(referIcon, 'Refer & earn', '100 GP per friend')}
        <div class="com-refer-card">
          <p class="com-refer-blurb">Share your link. When your friend signs up and makes their first purchase, you earn <strong>100 GP</strong>.</p>
          <div class="com-refer-link">
            <input class="com-refer-input" id="com-refer-input" readonly value="${esc(link)}" onfocus="this.select()">
            <button class="com-btn" onclick="updatesInstance.copyRefLink()">${linkIcon}<span>Copy link</span></button>
          </div>
          <div class="com-refer-stats">
            <div class="com-refer-stat"><span>${Number(r.vested || 0).toLocaleString()}</span><em>Friends joined</em></div>
            <div class="com-refer-stat"><span>${Number(r.pending || 0).toLocaleString()}</span><em>Pending</em></div>
            <div class="com-refer-stat"><span>${Number(r.gp_earned || 0).toLocaleString()}</span><em>GP earned</em></div>
          </div>
        </div>
      </section>
    `;
  },

  async copyRefLink() {
    const input = document.getElementById('com-refer-input');
    const link = input ? input.value : `${window.location.origin}${(this.referral && this.referral.link) || ''}`;
    try {
      await navigator.clipboard.writeText(link);
      await appAlert('Referral link copied.');
    } catch (e) {
      if (input) {
        input.select();
        try { document.execCommand('copy'); await appAlert('Referral link copied.'); }
        catch (_) { await appAlert('Copy failed — select the link and copy it manually.'); }
      }
    }
  }
};

export default updatesView;
