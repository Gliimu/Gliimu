import { supabase } from '/shared/js/config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const isMissingSchema = (err) => !!err && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(err.code);

const LEVELS = ['All', 'Beginner', 'Intermediate', 'Advanced'];

const MODULE_NAMES = {
  1: 'Foundations',
  2: 'Production',
  3: 'Post-Production',
  4: 'Distribution & Growth',
  5: 'Monetisation & Capstone'
};

const chevron = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

const curriculumView = {
  courses: [],
  searchQuery: '',
  level: 'All',
  expanded: new Set(),
  schemaMissing: false,

  template: `
    <div class="cur-layout" id="cur-container">
      <div id="cur-content"></div>
    </div>
  `,

  async init() {
    window.curriculumInstance = {
      setLevel: (l) => this.setLevel(l),
      toggleCourse: (id) => this.toggleCourse(id)
    };

    this.expanded = new Set();
    this.setupTopbar();
    await this.load();
  },

  setupTopbar() {
    const dyn = document.getElementById('topbar-dynamic-content');
    const right = document.getElementById('topbar-right-actions');

    if (dyn) {
      dyn.innerHTML = `
        <div class="cur-top-search">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="cur-search" placeholder="Search courses..." autocomplete="off">
        </div>
      `;
      const input = document.getElementById('cur-search');
      input.value = this.searchQuery;
      input.addEventListener('input', () => {
        this.searchQuery = input.value;
        this.render();
      });
    }

    if (right) right.innerHTML = '';
  },

  async load() {
    const { data, error } = await supabase.rpc('curriculum_board', {});

    if (error) {
      if (isMissingSchema(error)) {
        this.schemaMissing = true;
        this.courses = [];
        this.render();
        return;
      }
      console.error('Failed to load curriculum', error);
      this.render();
      return;
    }

    this.schemaMissing = false;
    this.courses = Array.isArray(data) ? data : [];
    this.render();
  },

  setLevel(l) {
    this.level = l;
    this.render();
  },

  toggleCourse(id) {
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    this.render();
  },

  visibleCourses() {
    const q = this.searchQuery.trim().toLowerCase();
    return this.courses.filter(c => {
      if (this.level !== 'All' && c.level !== this.level) return false;
      if (q && !`${c.title} ${c.summary || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  },

  render() {
    const el = document.getElementById('cur-content');
    if (!el) return;
    el.innerHTML = this.schemaMissing ? this.renderMissing() : this.renderList();
  },

  renderMissing() {
    return `
      <div class="cur-empty">
        <h3>The curriculum is not set up yet</h3>
        <p>Run <code>sql/curriculum.sql</code> in the Supabase SQL Editor, then reload.</p>
      </div>
    `;
  },

  renderList() {
    const filters = LEVELS.map(l => `
      <button class="cur-filter ${this.level === l ? 'active' : ''}" onclick="curriculumInstance.setLevel('${l}')">${l}</button>
    `).join('');

    const courses = this.visibleCourses();

    const head = `
      <header class="cur-head">
        <h1 class="cur-h1">Curriculum</h1>
        <p class="cur-sub">The Full Stack Media Architect track — every course you can view, module by module. Work through them in order and publish what you build in the Hub.</p>
      </header>
      <div class="cur-filters">${filters}</div>
    `;

    if (courses.length === 0) {
      return `${head}<div class="cur-empty"><h3>No courses match</h3><p>Try a different search or level filter.</p></div>`;
    }

    // Group by module, keeping the RPC's module ordering.
    const byModule = new Map();
    for (const c of courses) {
      const m = c.module_no ?? 1;
      if (!byModule.has(m)) byModule.set(m, []);
      byModule.get(m).push(c);
    }

    const sections = [...byModule.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([mod, list]) => `
        <section class="cur-module">
          <h2 class="cur-module-title">
            <span class="cur-module-no">Module ${mod}</span>
            ${MODULE_NAMES[mod] ? `<span class="cur-module-name">${esc(MODULE_NAMES[mod])}</span>` : ''}
          </h2>
          <div class="cur-grid">${list.map(c => this.renderCard(c)).join('')}</div>
        </section>
      `).join('');

    return `${head}${sections}`;
  },

  renderCard(c) {
    const open = this.expanded.has(c.id);
    const lessons = Array.isArray(c.lessons) ? c.lessons : [];
    const lessonCount = c.lesson_count ?? lessons.length;
    const lvlClass = `lvl-${String(c.level || 'beginner').toLowerCase()}`;
    const cost = (c.gp_cost || 0) > 0 ? `${c.gp_cost} GP` : 'Free';

    const lessonList = open && lessons.length ? `
      <ul class="cur-lessons">
        ${lessons.map((l, i) => `
          <li class="cur-lesson">
            <span class="cur-lesson-no">${i + 1}</span>
            <span class="cur-lesson-title">${esc(l.title || '')}</span>
            ${l.minutes ? `<span class="cur-lesson-min">${esc(l.minutes)} min</span>` : ''}
          </li>
        `).join('')}
      </ul>
    ` : '';

    return `
      <article class="cur-card ${open ? 'open' : ''}">
        <div class="cur-card-main" onclick="curriculumInstance.toggleCourse('${c.id}')">
          <div class="cur-card-top">
            <span class="cur-level ${lvlClass}">${esc(c.level || 'Beginner')}</span>
            <span class="cur-cost ${cost === 'Free' ? 'free' : ''}">${cost}</span>
          </div>
          <h3 class="cur-title">${esc(c.title)}</h3>
          ${c.summary ? `<p class="cur-summary">${esc(c.summary)}</p>` : ''}
          <div class="cur-card-foot">
            <span class="cur-meta">${lessonCount} lesson${lessonCount === 1 ? '' : 's'}${c.duration_mins ? ` · ${c.duration_mins} min` : ''}</span>
            <span class="cur-chevron">${chevron}</span>
          </div>
        </div>
        ${lessonList}
      </article>
    `;
  }
};

export default curriculumView;
