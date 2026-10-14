import { supabase } from '/shared/js/config.js';
import { store, tierClass } from '../store.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MIN_GP_FOR_TOPIC = 1000;

const timeAgo = (iso) => {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const isMissingSchema = (err) => !!err && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(err.code);

function avatarHtml(name, url, gp) {
  const cls = tierClass(gp || 0, 'dbt-avatar');
  return url
    ? `<img src="${esc(url)}" class="${cls}" alt="" style="object-fit:cover;">`
    : `<div class="${cls}">${esc((name || 'G').charAt(0).toUpperCase())}</div>`;
}

function tallyBar(forCount, againstCount) {
  const total = (forCount || 0) + (againstCount || 0);
  const pct = total === 0 ? 50 : Math.round(((forCount || 0) / total) * 100);
  return `
    <div class="dbt-tally">
      <div class="dbt-tally-bar"><span style="width:${pct}%"></span></div>
      <div class="dbt-tally-nums">
        <em class="for">${forCount || 0} for</em>
        <em class="against">${againstCount || 0} against</em>
      </div>
    </div>
  `;
}

const debatesView = {
  topics: [],
  searchQuery: '',
  filter: 'open',
  canStartTopic: false,
  schemaMissing: false,

  openTopicId: null,
  openTopic: null,
  args: [],
  myVotes: {},
  draftSide: 'for',
  channel: null,
  reloadTimer: null,

  template: `
    <div class="dbt-layout" id="dbt-container">
      <div id="dbt-content"></div>
    </div>

    <div class="modal-overlay" id="dbt-topic-modal" style="display: none;">
      <div class="modal-content">
        <button class="modal-close" onclick="debatesInstance.closeTopicModal()">×</button>
        <h2 style="margin-bottom: 8px;">Open a debate</h2>
        <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">State a position people can argue for or against. Keep it sharp.</p>
        <div class="form-group">
          <label>Statement</label>
          <input type="text" id="dbt-topic-statement" class="input" maxlength="140" placeholder="e.g. Time is relative">
        </div>
        <div class="form-group">
          <label>Context (optional)</label>
          <textarea id="dbt-topic-desc" class="input" rows="3" maxlength="1000" placeholder="What exactly should people argue about?"></textarea>
        </div>
        <button class="btn-primary" style="width: 100%;" id="dbt-topic-submit" onclick="debatesInstance.submitTopic()">Post topic</button>
      </div>
    </div>
  `,

  async init() {
    window.debatesInstance = {
      openTopic: (id) => this.openTopic(id),
      closeTopic: () => this.closeTopic(),
      openTopicModal: () => this.openTopicModal(),
      closeTopicModal: () => this.closeTopicModal(),
      submitTopic: () => this.submitTopic(),
      setSide: (side) => this.setSide(side),
      submitArgument: () => this.submitArgument(),
      vote: (argumentId, value) => this.vote(argumentId, value),
      deleteArgument: (id) => this.deleteArgument(id),
      closeDebate: (id) => this.closeDebate(id),
      setFilter: (f) => this.setFilter(f),
      viewAuthor: (id) => this.viewAuthor(id)
    };

    this.openTopicId = null;
    this.openTopic = null;
    this.args = [];
    this.myVotes = {};
    this.draftSide = 'for';

    this.setupTopbar();
    await this.loadBoard();
    this.checkEligibility();
    this.setupRealtime();

    // #/hub?topic=<id> deep link
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const topicId = params.get('topic');
    if (topicId) this.openTopic(topicId);
  },

  /* ============================================
     TOPBAR
     ============================================ */
  setupTopbar() {
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    const topbarRight = document.getElementById('topbar-right-actions');

    if (topbarDynamic) {
      topbarDynamic.innerHTML = `
        <div class="dbt-top-search">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="dbt-search" placeholder="Search debates..." autocomplete="off">
        </div>
      `;
      const input = document.getElementById('dbt-search');
      input.value = this.searchQuery;
      input.addEventListener('input', () => {
        this.searchQuery = input.value;
        this.render();
      });
    }

    if (topbarRight) {
      topbarRight.innerHTML = `
        <button class="dbt-new-btn" id="dbt-new-btn" title="Open a debate">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span class="dbt-new-label">New debate</span>
        </button>
      `;
      document.getElementById('dbt-new-btn')?.addEventListener('click', () => this.openTopicModal());
    }
  },

  async checkEligibility() {
    // The database has the authoritative rule; this only decides whether to
    // surface the button so the copy can explain the gate.
    const { data } = await supabase.rpc('debate_can_start_topic', { p_user: store.user.id });
    this.canStartTopic = data === true;
    document.getElementById('dbt-new-btn')?.classList.toggle('disabled', !this.canStartTopic);
  },

  /* ============================================
     BOARD
     ============================================ */
  async loadBoard() {
    const { data, error } = await supabase.rpc('debate_board', { p_limit: 60 });

    if (error) {
      if (isMissingSchema(error)) {
        this.schemaMissing = true;
        this.topics = [];
        this.render();
        return;
      }
      console.error('Failed to load debates', error);
      return;
    }

    this.schemaMissing = false;
    this.topics = Array.isArray(data) ? data : [];
    this.render();
  },

  visibleTopics() {
    const q = this.searchQuery.trim().toLowerCase();
    return this.topics.filter(t => {
      if (this.filter === 'open' && t.status !== 'open') return false;
      if (this.filter === 'mine' && t.user_id !== store.user.id) return false;
      if (q && !`${t.statement} ${t.description || ''} ${t.author_name || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  },

  setFilter(f) {
    this.filter = f;
    this.render();
  },

  render() {
    const el = document.getElementById('dbt-content');
    if (!el) return;
    el.innerHTML = this.openTopicId ? this.renderThread() : this.renderList();
  },

  renderList() {
    if (this.schemaMissing) {
      return `
        <div class="dbt-empty">
          <h3>The debate floor is not set up yet</h3>
          <p>Run <code>sql/debates.sql</code> in the Supabase SQL Editor, then reload.</p>
        </div>
      `;
    }

    const topics = this.visibleTopics();

    const filters = ['open', 'all', 'mine'].map(f => `
      <button class="dbt-filter ${this.filter === f ? 'active' : ''}" onclick="debatesInstance.setFilter('${f}')">
        ${f === 'open' ? 'Open' : f === 'all' ? 'All' : 'Mine'}
      </button>
    `).join('');

    if (topics.length === 0) {
      return `
        <div class="dbt-filters">${filters}</div>
        <div class="dbt-empty">
          <h3>No debates yet</h3>
          <p>Topics like "the earth is flat" or "time is relative" go here. Open the first one.</p>
        </div>
      `;
    }

    const cards = topics.map(t => {
      const closed = t.status === 'closed';
      return `
        <article class="dbt-card ${closed ? 'closed' : ''}" onclick="debatesInstance.openTopic('${t.id}')">
          <div class="dbt-card-head">
            ${avatarHtml(t.author_name, t.author_avatar, t.author_gp)}
            <div class="dbt-card-by">
              <strong>${esc(t.author_name || 'A Gliimait')}</strong>
              <span>${timeAgo(t.created_at)}${closed ? ' · closed' : ''}</span>
            </div>
            <span class="dbt-count">${t.argument_count || 0} arguments</span>
          </div>
          <h3 class="dbt-statement">${esc(t.statement)}</h3>
          ${t.description ? `<p class="dbt-desc">${esc(t.description)}</p>` : ''}
          ${tallyBar(t.for_count, t.against_count)}
          <div class="dbt-card-foot">
            <span class="dbt-participants">${t.participant_count || 0} debating</span>
            <span class="dbt-cta">${closed ? 'Read the thread' : (t.i_have_argued ? 'Add to your argument' : 'Take a side')}</span>
          </div>
        </article>
      `;
    }).join('');

    return `<div class="dbt-filters">${filters}</div><div class="dbt-list">${cards}</div>`;
  },

  /* ============================================
     THREAD
     ============================================ */
  async openTopic(id) {
    this.openTopicId = id;
    this.openTopic = this.topics.find(t => t.id === id) || null;
    this.args = [];
    this.myVotes = {};
    this.render();
    await this.loadThread();
  },

  async loadThread() {
    const id = this.openTopicId;
    if (!id) return;

    if (!this.openTopic) {
      const { data: topic } = await supabase
        .from('debate_topics')
        .select('*, profiles:profiles!user_id(full_name, avatar_url, total_gp)')
        .eq('id', id)
        .maybeSingle();
      if (topic) {
        const p = topic.profiles || {};
        this.openTopic = {
          ...topic,
          author_name: p.full_name,
          author_avatar: p.avatar_url,
          author_gp: p.total_gp
        };
      }
    }

    const { data: args, error } = await supabase
      .from('debate_arguments')
      .select('*, profiles:profiles!user_id(full_name, avatar_url, total_gp)')
      .eq('topic_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      if (!isMissingSchema(error)) console.error('Failed to load arguments', error);
      this.render();
      return;
    }

    this.args = args || [];

    const argIds = this.args.map(a => a.id);
    if (argIds.length) {
      const { data: votes } = await supabase
        .from('debate_votes')
        .select('argument_id, user_id, value')
        .in('argument_id', argIds);

      const tally = {};
      const mine = {};
      (votes || []).forEach(v => {
        if (!tally[v.argument_id]) tally[v.argument_id] = { up: 0, down: 0 };
        if (v.value === 1) tally[v.argument_id].up++;
        else tally[v.argument_id].down++;
        if (v.user_id === store.user.id) mine[v.argument_id] = v.value;
      });
      this.voteTally = tally;
      this.myVotes = mine;
    } else {
      this.voteTally = {};
      this.myVotes = {};
    }

    this.render();
  },

  closeTopic() {
    this.openTopicId = null;
    this.openTopic = null;
    this.args = [];
    this.loadBoard();
  },

  renderThread() {
    const t = this.openTopic;
    if (!t) {
      return `<div class="dbt-empty"><h3>Loading debate...</h3></div>`;
    }

    const closed = t.status === 'closed';
    const isMine = t.user_id === store.user.id;
    const forArgs = this.args.filter(a => a.side === 'for');
    const againstArgs = this.args.filter(a => a.side === 'against');

    const composer = closed ? `
      <div class="dbt-closed-note">This debate is closed. The arguments stay up for reading.</div>
    ` : `
      <div class="dbt-composer">
        <div class="dbt-side-pick">
          <button class="dbt-side ${this.draftSide === 'for' ? 'active for' : 'for'}" onclick="debatesInstance.setSide('for')">I argue for</button>
          <button class="dbt-side ${this.draftSide === 'against' ? 'active against' : 'against'}" onclick="debatesInstance.setSide('against')">I argue against</button>
        </div>
        <textarea id="dbt-arg-body" class="input dbt-arg-input" rows="3" maxlength="2000" placeholder="Make your case..."></textarea>
        <div class="dbt-composer-foot">
          <span class="dbt-hint">One argument per post. You can add more later.</span>
          <button class="btn-primary btn-sm" onclick="debatesInstance.submitArgument()">Post argument</button>
        </div>
      </div>
    `;

    return `
      <button class="dbt-back" onclick="debatesInstance.closeTopic()">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        All debates
      </button>

      <header class="dbt-thread-head">
        <div class="dbt-card-head">
          ${avatarHtml(t.author_name, t.author_avatar, t.author_gp)}
          <div class="dbt-card-by">
            <strong>${esc(t.author_name || 'A Gliimait')}</strong>
            <span>${timeAgo(t.created_at)}${closed ? ' · closed' : ''}</span>
          </div>
          ${isMine && !closed ? `<button class="dbt-close-btn" onclick="debatesInstance.closeDebate('${t.id}')">Close debate</button>` : ''}
        </div>
        <h2 class="dbt-statement lg">${esc(t.statement)}</h2>
        ${t.description ? `<p class="dbt-desc">${esc(t.description)}</p>` : ''}
        ${tallyBar(t.for_count ?? forArgs.length, t.against_count ?? againstArgs.length)}
      </header>

      ${composer}

      <div class="dbt-columns">
        <section class="dbt-col">
          <h4 class="dbt-col-title for">For <span>${forArgs.length}</span></h4>
          ${forArgs.map(a => this.renderArgument(a)).join('') || '<p class="dbt-none">Nobody has argued for this yet.</p>'}
        </section>
        <section class="dbt-col">
          <h4 class="dbt-col-title against">Against <span>${againstArgs.length}</span></h4>
          ${againstArgs.map(a => this.renderArgument(a)).join('') || '<p class="dbt-none">Nobody has argued against this yet.</p>'}
        </section>
      </div>
    `;
  },

  renderArgument(a) {
    const p = a.profiles || {};
    const tally = (this.voteTally || {})[a.id] || { up: 0, down: 0 };
    const mine = this.myVotes[a.id] || 0;
    const owner = a.user_id === store.user.id;

    return `
      <article class="dbt-arg ${a.side}">
        <div class="dbt-arg-head" onclick="debatesInstance.viewAuthor('${a.user_id}')">
          ${avatarHtml(p.full_name, p.avatar_url, p.total_gp)}
          <div class="dbt-card-by">
            <strong>${esc(p.full_name || 'A Gliimait')}</strong>
            <span>${timeAgo(a.created_at)}${a.edited_at ? ' · edited' : ''}</span>
          </div>
        </div>
        <p class="dbt-arg-body">${esc(a.body)}</p>
        <div class="dbt-arg-foot">
          <div class="dbt-votes">
            <button class="dbt-vote up ${mine === 1 ? 'on' : ''}" title="Strong argument" onclick="debatesInstance.vote('${a.id}', 1)">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
              ${tally.up}
            </button>
            <button class="dbt-vote down ${mine === -1 ? 'on' : ''}" title="Weak argument" onclick="debatesInstance.vote('${a.id}', -1)">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              ${tally.down}
            </button>
          </div>
          ${owner ? `<button class="dbt-del" onclick="debatesInstance.deleteArgument('${a.id}')">Delete</button>` : ''}
        </div>
      </article>
    `;
  },

  /* ============================================
     WRITES
     ============================================ */
  openTopicModal() {
    if (!this.canStartTopic) {
      return alert(`Only Gliimaits with ${MIN_GP_FOR_TOPIC} GP or more can open a debate topic. You can still argue on any topic.`);
    }
    document.getElementById('dbt-topic-modal').style.display = 'flex';
    document.getElementById('dbt-topic-statement')?.focus();
  },

  closeTopicModal() {
    document.getElementById('dbt-topic-modal').style.display = 'none';
  },

  async submitTopic() {
    const statement = document.getElementById('dbt-topic-statement').value.trim();
    const description = document.getElementById('dbt-topic-desc').value.trim();

    if (statement.length < 6) return alert('Give the debate a statement of at least 6 characters.');

    const btn = document.getElementById('dbt-topic-submit');
    btn.disabled = true;

    const { data, error } = await supabase.from('debate_topics').insert({
      user_id: store.user.id,
      statement,
      description: description || null
    }).select('*').maybeSingle();

    btn.disabled = false;

    if (error) {
      return alert(error.code === '42501'
        ? `You need ${MIN_GP_FOR_TOPIC} GP to open a debate topic.`
        : 'Could not open the debate: ' + error.message);
    }

    document.getElementById('dbt-topic-statement').value = '';
    document.getElementById('dbt-topic-desc').value = '';
    this.closeTopicModal();
    await this.loadBoard();
    if (data?.id) this.openTopic(data.id);
  },

  setSide(side) {
    this.draftSide = side === 'against' ? 'against' : 'for';
    document.querySelectorAll('.dbt-side').forEach(b => b.classList.remove('active'));
    document.querySelector(`.dbt-side.${this.draftSide}`)?.classList.add('active');
  },

  async submitArgument() {
    const input = document.getElementById('dbt-arg-body');
    const body = input.value.trim();
    if (body.length < 2) return alert('Write your argument first.');

    input.value = '';
    const { error } = await supabase.from('debate_arguments').insert({
      topic_id: this.openTopicId,
      user_id: store.user.id,
      side: this.draftSide,
      body
    });

    if (error) return alert('Could not post your argument: ' + error.message);
    await this.loadThread();
    await this.loadBoard();
  },

  async vote(argumentId, value) {
    const current = this.myVotes[argumentId] || 0;

    if (current === value) {
      const { error } = await supabase.from('debate_votes')
        .delete()
        .eq('argument_id', argumentId)
        .eq('user_id', store.user.id);
      if (error) return alert('Could not remove your vote: ' + error.message);
    } else {
      const { error } = await supabase.from('debate_votes').upsert(
        { argument_id: argumentId, user_id: store.user.id, value },
        { onConflict: 'argument_id,user_id' }
      );
      if (error) return alert('Could not record your vote: ' + error.message);
    }

    await this.loadThread();
  },

  async deleteArgument(id) {
    if (!await appConfirm('Delete this argument?', { okText: 'Delete', danger: true })) return;
    const { error } = await supabase.from('debate_arguments').delete().eq('id', id);
    if (error) return alert('Could not delete: ' + error.message);
    await this.loadThread();
    await this.loadBoard();
  },

  async closeDebate(id) {
    if (!await appConfirm('Close this debate? Nobody will be able to add arguments.', { okText: 'Close debate', danger: true })) return;
    const { error } = await supabase.rpc('debate_close_topic', { p_topic: id });
    if (error) return alert('Could not close the debate: ' + error.message);
    await this.loadBoard();
    this.openTopic = this.topics.find(t => t.id === id) || this.openTopic;
    if (this.openTopic) this.openTopic.status = 'closed';
    this.render();
  },

  viewAuthor(userId) {
    if (userId === store.user.id) {
      sessionStorage.removeItem('view_profile_id');
    } else {
      sessionStorage.setItem('view_profile_id', userId);
    }
    window.location.hash = '#/profile';
  },

  /* ============================================
     REALTIME
     ============================================ */
  setupRealtime() {
    if (this.channel) supabase.removeChannel(this.channel);

    this.channel = supabase.channel(`debates-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debate_topics' }, () => this.scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debate_arguments' }, () => this.scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debate_votes' }, () => this.scheduleReload())
      .subscribe();
  },

  scheduleReload() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      if (this.openTopicId) this.loadThread();
      else this.loadBoard();
    }, 600);
  }
};

export default debatesView;
