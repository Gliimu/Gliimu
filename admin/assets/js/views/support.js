import { supabase } from '../config.js';
import { store } from '../store.js';
import { escapeHtml, empty, avatar, timeAgo } from '../ui.js';
import { appAlert } from '../dialog.js';
import { uploadFile } from '../upload.js';

// One click beats typing: these fill the composer, the operator only presses Send.
const QUICK_REPLIES = [
  { label: 'Greeting', text: 'Hello! This is Team Gliimu. Thanks for reaching out — we are looking into it now.' },
  { label: 'On it', text: 'We are on it. Expect an update right here as soon as it is sorted.' },
  { label: 'Need detail', text: 'To move faster, could you send the exact title or a screenshot of what you are seeing?' },
  { label: 'Payment', text: 'We have checked the payment record. The next step is with our registrar and it usually clears within one business day.' },
  { label: 'Resolved', text: 'This is resolved on our side. Reply here any time and the desk picks it straight back up.' }
];

function attachmentHtml(url, type) {
  const kind = String(type || '');
  const safe = escapeHtml(url);
  if (kind.startsWith('image/')) return `<a href="${safe}" target="_blank" rel="noopener"><img class="sb-attach" src="${safe}" alt=""></a>`;
  if (kind.startsWith('video/')) return `<video class="sb-attach" src="${safe}" controls playsinline></video>`;
  if (kind.startsWith('audio/')) return `<audio class="sb-attach" src="${safe}" controls></audio>`;
  return `<a class="sb-file" href="${safe}" target="_blank" rel="noopener">Open attachment</a>`;
}

export default {
  template: `
    <div class="filters">
      <input type="search" id="support-search" class="input" placeholder="Search by member name..." autocomplete="off">
      <span class="muted small" id="support-count"></span>
    </div>
    <div class="inbox" id="support-inbox">
      <div class="inbox-list" id="support-list"><p class="loading">Loading threads...</p></div>
      <div class="inbox-thread" id="support-thread">
        <div class="inbox-blank">No thread selected. Every message a member sends from the Support desk on gliimu.com lands here for the whole team.</div>
      </div>
    </div>
  `,

  async init() {
    this.threads = [];
    this.filter = '';
    this.activeId = null;
    this.messages = [];
    this.staff = new Map();
    this.sending = false;
    this.timer = null;

    document.getElementById('support-search').addEventListener('input', (e) => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.filter = e.target.value.trim().toLowerCase();
        this.renderList();
      }, 250);
    });

    this.subscribe();
    await this.load();
  },

  subscribe() {
    // The router never tears a view down, so drop any stale channel first.
    if (this.channel) supabase.removeChannel(this.channel);
    this.channel = supabase
      .channel('admin-support-inbox')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_messages' },
        (payload) => this.onInsert(payload.new))
      .subscribe();
  },

  onInsert(row) {
    if (!row || !row.thread_user) return;
    if (row.thread_user === this.activeId) {
      if (!this.messages.some(m => m.id === row.id)) {
        this.messages.push(row);
        this.renderThread();
      }
      this.loadList();
      return;
    }
    this.loadList();
  },

  async load() {
    await this.loadList();
  },

  async loadList() {
    const list = document.getElementById('support-list');
    const { data, error } = await supabase.rpc('support_inbox');

    if (error) {
      list.innerHTML = empty(`Could not load the inbox: ${error.message}`);
      return;
    }

    this.threads = (data || []).sort((a, b) => {
      const byUnread = Number(b.unread || 0) - Number(a.unread || 0);
      if (byUnread) return byUnread;
      return new Date(b.last_created_at || 0) - new Date(a.last_created_at || 0);
    });

    this.renderList();
  },

  visibleThreads() {
    if (!this.filter) return this.threads;
    return this.threads.filter(t => String(t.member_name || '').toLowerCase().includes(this.filter));
  },

  renderList() {
    const list = document.getElementById('support-list');
    const rows = this.visibleThreads();

    document.getElementById('support-count').textContent =
      `${this.threads.length} thread${this.threads.length === 1 ? '' : 's'}`;

    if (!rows.length) {
      list.innerHTML = empty(this.threads.length
        ? 'No member matches that name.'
        : 'No support threads yet. They appear the moment a member writes to the desk.');
      return;
    }

    list.innerHTML = rows.map(t => `
      <button class="inbox-row ${t.thread_user === this.activeId ? 'active' : ''}" data-thread="${t.thread_user}">
        ${avatar(t.member_avatar, t.member_name)}
        <span class="inbox-main">
          <span class="inbox-name">${escapeHtml(t.member_name || 'Gliimait')}</span>
          <span class="inbox-preview">${t.last_is_staff ? 'Team: ' : ''}${escapeHtml((t.last_content || '').slice(0, 70) || 'Sent an attachment')}</span>
        </span>
        <span class="inbox-side">
          <span class="inbox-time">${timeAgo(t.last_created_at)}</span>
          ${Number(t.unread || 0) > 0 ? `<span class="inbox-unread">${Number(t.unread) > 99 ? '99+' : t.unread}</span>` : ''}
        </span>
      </button>`).join('');

    list.querySelectorAll('[data-thread]').forEach((el) => {
      el.addEventListener('click', () => this.open(el.dataset.thread));
    });
  },

  async open(threadUser) {
    this.activeId = threadUser;
    this.messages = [];
    document.getElementById('support-inbox').classList.add('open');
    document.getElementById('support-thread').innerHTML = `<div class="inbox-blank">Loading conversation...</div>`;
    this.renderList();

    const ok = await this.loadMessages();
    if (!ok) return;
    this.renderThread();
    await this.markRead();
  },

  async loadMessages() {
    const { data, error } = await supabase
      .from('support_messages')
      .select('id, thread_user, sender_id, content, attachment_url, attachment_type, created_at')
      .eq('thread_user', this.activeId)
      .order('created_at', { ascending: true })
      .limit(500);

    if (error) {
      document.getElementById('support-thread').innerHTML =
        `<div class="inbox-blank">Could not load this thread: ${escapeHtml(error.message)}</div>`;
      return false;
    }

    this.messages = data || [];

    // Other agents' names are not in the thread rows, so resolve the staff ids.
    const staffIds = [...new Set(this.messages.map(m => m.sender_id).filter(id => id !== this.activeId))];
    this.staff = new Map();
    if (staffIds.length) {
      const { data: people } = await supabase.rpc('admin_member_lookup', { p_ids: staffIds });
      this.staff = new Map((people || []).map(p => [p.id, p]));
    }
    return true;
  },

  back() {
    this.activeId = null;
    document.getElementById('support-inbox').classList.remove('open');
    document.getElementById('support-thread').innerHTML =
      `<div class="inbox-blank">No thread selected. Every message a member sends from the Support desk on gliimu.com lands here for the whole team.</div>`;
    this.renderList();
  },

  thread() {
    return this.threads.find(t => t.thread_user === this.activeId);
  },

  renderThread() {
    const t = this.thread();
    if (!t) return;
    const pane = document.getElementById('support-thread');

    pane.innerHTML = `
      <div class="inbox-head">
        <button class="inbox-back" id="support-back" aria-label="Back to threads">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        </button>
        ${avatar(t.member_avatar, t.member_name)}
        <span style="min-width: 0;">
          <span class="card-title">${escapeHtml(t.member_name || 'Gliimait')}</span>
          <span class="card-sub">Support thread · ${Number(t.message_count || 0)} message${Number(t.message_count || 0) === 1 ? '' : 's'}</span>
        </span>
      </div>
      <div class="inbox-body" id="support-body">
        ${this.messages.map(m => this.bubble(m, t)).join('')}
      </div>
      <div class="inbox-quick">
        ${QUICK_REPLIES.map((q, i) => `<button class="filter-btn" data-quick="${i}">${escapeHtml(q.label)}</button>`).join('')}
      </div>
      <div class="inbox-composer">
        <button class="inbox-icon-btn" id="support-attach" title="Attach a file" aria-label="Attach a file">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
        </button>
        <input type="file" id="support-file" hidden>
        <textarea id="support-text" class="input" rows="2" placeholder="Reply to ${escapeHtml(t.member_name || 'this member')}..."></textarea>
        <button class="btn-primary btn-small" id="support-send">Send</button>
      </div>`;

    const body = pane.querySelector('#support-body');
    body.scrollTop = body.scrollHeight;

    pane.querySelector('#support-back').addEventListener('click', () => this.back());
    pane.querySelectorAll('[data-quick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const box = pane.querySelector('#support-text');
        box.value = QUICK_REPLIES[Number(btn.dataset.quick)].text;
        box.focus();
      });
    });

    const text = pane.querySelector('#support-text');
    const send = pane.querySelector('#support-send');
    const file = pane.querySelector('#support-file');

    send.addEventListener('click', () => this.send(text.value));
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.send(text.value);
      }
    });
    pane.querySelector('#support-attach').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const picked = file.files && file.files[0];
      if (!picked) return;
      await this.attach(picked, send);
      file.value = '';
    });
  },

  bubble(m, t) {
    const mine = m.sender_id === store.user.id;
    const isMember = m.sender_id === t.thread_user;
    const author = this.staff.get(m.sender_id);
    const who = isMember ? t.member_name : (author && author.full_name) || 'Team Gliimu';
    const pic = isMember ? t.member_avatar : (author && author.avatar_url);

    return `
      <div class="sb ${mine ? 'me' : 'them'}">
        ${mine ? '' : `<span class="sb-avatar">${avatar(pic, who)}</span>`}
        <span class="sb-col">
          ${mine || isMember ? '' : `<span class="sb-who">${escapeHtml(who)}</span>`}
          <span class="sb-bubble">
            ${m.content ? `<span class="sb-text">${escapeHtml(m.content)}</span>` : ''}
            ${m.attachment_url ? attachmentHtml(m.attachment_url, m.attachment_type) : ''}
            <span class="sb-time">${timeAgo(m.created_at)}</span>
          </span>
        </span>
      </div>`;
  },

  async send(content) {
    const text = String(content || '').trim();
    if (!text || this.sending || !this.activeId) return;

    this.sending = true;
    const btn = document.getElementById('support-send');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

    const { error } = await supabase.from('support_messages').insert({
      thread_user: this.activeId,
      sender_id: store.user.id,
      content: text
    });

    this.sending = false;
    if (error) {
      if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
      return appAlert(`Could not send: ${error.message}`);
    }

    const box = document.getElementById('support-text');
    if (box) box.value = '';
    await this.loadList();
    await this.refreshThread();
  },

  async attach(file, btn) {
    if (this.sending || !this.activeId) return;
    this.sending = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Uploading...'; }

    let url = '';
    try {
      url = await uploadFile(file, 'chat');
    } catch (err) {
      this.sending = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
      return appAlert(err.message || 'The upload did not complete.');
    }

    const { error } = await supabase.from('support_messages').insert({
      thread_user: this.activeId,
      sender_id: store.user.id,
      content: '',
      attachment_url: url,
      attachment_type: file.type || 'file'
    });

    this.sending = false;
    if (error) {
      if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
      return appAlert(`The file uploaded but could not be sent: ${error.message}`);
    }

    await this.loadList();
    await this.refreshThread();
  },

  // Re-render without the "Loading conversation..." flash a full open() causes.
  async refreshThread() {
    if (!this.activeId) return;
    const ok = await this.loadMessages();
    if (!ok) return;
    this.renderThread();
    const box = document.getElementById('support-text');
    if (box) box.focus();
  },

  async markRead() {
    const threadUser = this.activeId;
    await supabase.rpc('support_mark_read', { p_thread_user: threadUser });
    const t = this.thread();
    if (t) t.unread = 0;
    this.renderList();
    window.adminApp?.refreshCounts();
  }
};
