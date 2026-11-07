import hubView from './feed-gliims.js?v=114';
import feedView from './feed.js?v=108';
import { supabase } from '/shared/js/config.js';
import { store } from '../store.js?v=2';
import { renderCollectionCard } from '../collections.js?v=1';

const SEARCH_HISTORY_KEY = 'gliimu_search_history';
const MAX_HISTORY = 8;

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/[>]/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SEARCH_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>';
const CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"></path></svg>';
const CLOCK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>';

// Search is its own page: one bold box in the middle of the screen and the
// terms typed before sitting under it. Submitting lifts the box to the top and
// fills the page with gliims, people and collections that match.
// Cards, masonry and follow state are borrowed from the XpLoRe view so a
// result looks and behaves exactly like the same thing in the feed.
export default {
  title: 'Search',
  template: `
    <div class="search-page" id="search-page">
      <div class="search-stage">
        <div class="search-box">
          <span class="search-box-icon">${SEARCH_ICON}</span>
          <input id="search-input" class="search-input" type="text" autocomplete="off"
                 placeholder="Search gliims, people, collections" aria-label="Search Gliimu">
          <button type="button" class="search-box-clear" data-box-clear hidden aria-label="Clear">${CLOSE_ICON}</button>
        </div>
        <div class="search-history" id="search-history"></div>
      </div>

      <div class="libmerge hub-layout search-body" id="search-body" hidden></div>
    </div>
  `,

  init() {
    this.page = document.getElementById('search-page');
    this.input = document.getElementById('search-input');
    this.body = document.getElementById('search-body');
    this.term = '';
    this.requestId = (this.requestId || 0) + 1;
    this.disposed = false;

    this.input.addEventListener('input', () => {
      this.syncClear();
      if (!this.input.value && !this.term) this.renderHistory();
    });
    this.input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.submit(this.input.value);
    });
    this.input.addEventListener('focus', () => this.renderHistory());

    document.getElementById('search-history').addEventListener('click', event => {
      const remove = event.target.closest('[data-remove]');
      if (remove) {
        this.removeFromHistory(Number(remove.dataset.remove));
        this.renderHistory();
        return;
      }
      const pick = event.target.closest('[data-term]');
      if (pick) {
        this.submit(pick.dataset.term);
        return;
      }
      if (event.target.closest('[data-clear-all]')) {
        this.clearHistory();
        this.renderHistory();
      }
    });

    this._boxClear = () => this.setIdle();
    this.page.querySelector('[data-box-clear]').addEventListener('click', this._boxClear);
    this.body.addEventListener('click', event => {
      if (event.target.closest('[data-new-search]')) this.setIdle();
    });

    this.bindFollowButtons();
    this._resize = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        if (!this.body.hidden) feedView.layoutMasonry('#search-body');
      }, 120);
    };
    window.addEventListener('resize', this._resize);

    this.renderHistory();
    window.searchInstance = this;
  },

  destroy() {
    this.disposed = true;
    this.requestId++;
    document.removeEventListener('click', this._followClick);
    window.removeEventListener('resize', this._resize);
    clearTimeout(this._resizeTimer);
  },

  /* -------------------------------- history -------------------------------- */

  getHistory() {
    try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY)) || []; }
    catch { return []; }
  },

  addToHistory(term) {
    const history = this.getHistory().filter(item => item.toLowerCase() !== term.toLowerCase());
    history.unshift(term);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  },

  removeFromHistory(index) {
    const history = this.getHistory();
    history.splice(index, 1);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
  },

  clearHistory() {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
  },

  // Recent searches only sit on the screen while the page is still idle —
  // once there is a term, the results are the point.
  renderHistory() {
    const el = document.getElementById('search-history');
    if (!el) return;
    const history = this.getHistory();
    if (this.term || this.input.value || !history.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `<div class="search-history-head">
        <span>Recent searches</span>
        <button type="button" class="search-history-clear" data-clear-all>Clear all</button>
      </div>` + history.map((term, index) => `
      <div class="search-history-item">
        <button type="button" class="search-history-term" data-term="${escapeHtml(term)}">${CLOCK_ICON}<span>${escapeHtml(term)}</span></button>
        <button type="button" class="search-history-remove" data-remove="${index}" aria-label="Remove ${escapeHtml(term)}">${CLOSE_ICON}</button>
      </div>`).join('');
  },

  /* --------------------------------- states -------------------------------- */

  syncClear() {
    const clear = this.page.querySelector('[data-box-clear]');
    if (clear) clear.hidden = !this.input.value;
  },

  submit(value) {
    const term = (value || '').trim();
    if (term.length < 2) return;
    this.term = term;
    this.input.value = term;
    this.addToHistory(term);
    this.syncClear();
    this.renderHistory();
    this.page.classList.add('is-active');
    this.body.hidden = false;
    this.body.innerHTML = '<p class="search-status">Searching…</p>';
    this.runSearch(term, ++this.requestId);
  },

  // Back to the middle of the page. A search still in flight is retired so it
  // cannot land on the idle screen it was asked to leave.
  setIdle() {
    this.term = '';
    this.requestId++;
    this.input.value = '';
    this.page.classList.remove('is-active');
    this.body.hidden = true;
    this.body.innerHTML = '';
    this.syncClear();
    this.renderHistory();
    this.input.focus();
  },

  /* -------------------------------- results -------------------------------- */

  async runSearch(term, requestId) {
    const needle = term.toLowerCase();
    try {
      // The feed already holds every approved gliim, so gliims and collections
      // match locally. hubView is filled without init(), whose balance modal is
      // deliberately an XpLoRe-only interruption.
      const [usersResult, collectionList] = await Promise.all([
        supabase.from('profiles')
          .select('id, full_name, avatar_url, total_gp, verification_badge')
          .ilike('full_name', `%${term.replace(/[\\%_]/g, '\\$&')}%`)
          .is('deletion_scheduled_at', null)
          .limit(10),
        feedView.collections().catch(() => []),
        hubView.feedLoaded ? null : hubView.fetchPosts(),
        feedView.loadFollowedIds().catch(() => new Set())
      ]);
      if (usersResult.error) throw usersResult.error;
      if (this.disposed || requestId !== this.requestId) return;

      const posts = (hubView.currentPosts || [])
        .filter(post => post.status !== 'draft')
        .filter(post => !post.status || post.status === 'approved' || post.user_id === store.user?.id)
        .filter(post => {
          const haystack = [post.title, post.description, post.category, post.profiles?.full_name]
            .filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(needle);
        });

      const tag = needle.replace(/^#/, '');
      const collections = collectionList.filter(item => item.tag.includes(tag));
      this.renderResults({ posts, collections, users: usersResult.data || [] });
    } catch (error) {
      if (this.disposed || requestId !== this.requestId) return;
      console.error('Search failed:', error);
      this.body.innerHTML = '<p class="search-status">Could not run that search. Please try again.</p>';
    }
  },

  renderResults({ posts, collections, users }) {
    if (!this.body.isConnected) return;
    const total = posts.length + collections.length + users.length;
    if (!total) {
      this.body.innerHTML = `<p class="search-status">Nothing matches “${escapeHtml(this.term)}”.</p>`;
      return;
    }

    const people = users.length
      ? `<section class="xplore-slice">${feedView.peopleBlock('People', String(users.length), users, true)}</section>`
      : '';
    const groups = collections.length
      ? `<section class="xplore-slice"><h2 class="xplore-slice-title">Collections <span>${collections.length}</span></h2>
         <div class="xplore-row">${collections.map(renderCollectionCard).join('')}</div></section>`
      : '';
    const gliims = posts.length
      ? `<section class="xplore-slice"><h2 class="xplore-slice-title">Gliims <span>${posts.length}</span></h2>
         <div class="library-feed feed-grid">${posts.map(post => feedView.wrapItem(hubView.renderPostCard(post), 'gliim')).join('')}</div></section>`
      : '';

    this.body.innerHTML = `<div class="search-results-head">
        <span>${total} result${total === 1 ? '' : 's'} for “${escapeHtml(this.term)}”</span>
        <button type="button" class="search-results-clear" data-new-search>New search</button>
      </div>${people}${groups}${gliims}`;
    feedView.layoutMasonry('#search-body');
  },

  // XpLoRe unbinds its own follow listener when this route replaces it, so the
  // results need their own — one listener, one toggle per click.
  bindFollowButtons() {
    this._followClick = event => {
      const button = event.target.closest('[data-follow]');
      if (button) feedView.toggleFollow(button.dataset.follow, button);
    };
    document.addEventListener('click', this._followClick);
  }
};
