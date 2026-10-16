import { supabase, API_BASE_URL } from '/shared/js/config.js';
import { store } from '../store.js';
import { kbAnswer } from '../gliim-pa-kb.js?v=17';

// Answers are rendered from a small markdown subset. Everything is escaped
// first, so model output can never inject markup.
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code class="pa-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function renderMarkdown(source) {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let list = null;
  let code = null;
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.tag} class="pa-list">${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim().startsWith('```')) {
      if (code) { out.push(`<pre class="pa-pre"><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null; }
      else { flushParagraph(); flushList(); code = []; }
      continue;
    }
    if (code) { code.push(line); continue; }

    if (!line.trim()) { flushParagraph(); flushList(); continue; }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph(); flushList();
      const level = Math.min(heading[1].length + 2, 6);
      out.push(`<h${level} class="pa-heading">${inline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || ordered) {
      flushParagraph();
      const tag = ordered ? 'ol' : 'ul';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((bullet || ordered)[1]);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  if (code && code.length) out.push(`<pre class="pa-pre"><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  flushParagraph();
  flushList();
  return out.join('');
}

const STARTERS = [
  'What can you help me with?',
  'How do GP tiers work?',
  'Where do I find my courses?',
  'How do I top up my wallet?'
];

const FOLLOWUPS = [
  'How do I publish a gliim?',
  'How do I go live?',
  'What are the plans and pricing?',
  'How do I reach support?'
];

const assistantView = {
  title: 'Assistant',
  thread: [],
  busy: false,

  template: `
    <div class="pa-page" id="pa-page">
      <div class="pa-scroll" id="pa-scroll"></div>
    </div>
  `,

  init() {
    this.thread = [];
    this.busy = false;

    window.paInstance = {
      send: () => this.send(),
      useStarter: (text) => this.useStarter(text),
      newChat: () => this.newChat(),
      retry: () => this.retry()
    };

    this.setupTopbar();
    this.loadHistory().then(() => this.render());
  },

  setupTopbar() {
    const right = document.getElementById('topbar-right-actions');
    if (right) {
      right.innerHTML = `
        <button class="pa-new-chat" onclick="paInstance.newChat()" title="Start a new chat">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span class="pa-new-chat-label">New chat</span>
        </button>
      `;
    }
    const dynamic = document.getElementById('topbar-dynamic-content');
    if (dynamic) dynamic.innerHTML = '';
  },

  async loadHistory() {
    const { data } = await supabase.from('messages')
      .select('content, is_ai, created_at')
      .eq('sender_id', store.user.id)
      .is('receiver_id', null)
      .is('room', null)
      .order('created_at', { ascending: true })
      .limit(60);

    this.thread = (data || [])
      .filter(m => m.content)
      .map(m => ({ role: m.is_ai ? 'assistant' : 'user', content: m.content }));
  },

  render() {
    const scroll = document.getElementById('pa-scroll');
    if (!scroll) return;

    if (this.thread.length === 0) {
      scroll.innerHTML = this.renderAsk();
      this.wireComposer();
      return;
    }

    const turns = this.thread.map((m, i) => {
      if (m.role === 'user') {
        return `<div class="pa-question"><div class="pa-question-text">${escapeHtml(m.content)}</div></div>`;
      }
      const isLast = i === this.thread.length - 1;
      const body = m.pending
        ? this.renderPending()
        : (m.failed
          ? `<p class="pa-error">${escapeHtml(m.content)}</p><button class="pa-chip" onclick="paInstance.retry()">Try again</button>`
          : renderMarkdown(m.content));
      return `
        <div class="pa-answer">
          <div class="pa-answer-head"><img src="/icons/gliimpa.png" alt="" class="pa-answer-avatar"><span>Assistant</span></div>
          <div class="pa-answer-body">${body}</div>
          ${isLast && !this.busy && !m.failed ? this.renderFollowups() : ''}
        </div>
      `;
    }).join('');

    scroll.innerHTML = `${turns}${this.renderComposer()}`;
    this.wireComposer();
    this.scrollToBottom();
  },

  renderPending() {
    return '<div class="pa-typing"><span></span><span></span><span></span></div>';
  },

  renderFollowups() {
    return `
      <div class="pa-followups">
        ${FOLLOWUPS.map(f => `<button class="pa-chip" onclick="paInstance.useStarter('${f.replace(/'/g, "\\'")}')">${escapeHtml(f)}</button>`).join('')}
      </div>
    `;
  },

  renderAsk() {
    return `
      <div class="pa-hero">
        <img src="/icons/gliimpa.png" alt="" class="pa-hero-logo">
        <h1 class="pa-hero-title">Assistant</h1>
        <p class="pa-hero-sub">Ask anything. Research, drafts, explanations — answered in seconds.</p>
        ${this.renderComposer(true)}
        <div class="pa-starters">
          ${STARTERS.map(s => `<button class="pa-chip" onclick="paInstance.useStarter('${s.replace(/'/g, "\\'")}')">${escapeHtml(s)}</button>`).join('')}
        </div>
      </div>
    `;
  },

  renderComposer(hero = false) {
    return `
      <div class="pa-composer ${hero ? 'pa-composer-hero' : ''}">
        <textarea id="pa-input" class="pa-input" rows="1" placeholder="Ask Assistant anything..." ${this.busy ? 'disabled' : ''}></textarea>
        <button class="pa-send" id="pa-send" onclick="paInstance.send()" ${this.busy ? 'disabled' : ''} title="Ask">
          ${this.busy ? this.icon('stop') : this.icon('arrow')}
        </button>
      </div>
    `;
  },

  icon(name) {
    const icons = {
      search: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
      arrow: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>',
      stop: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>'
    };
    return icons[name] || '';
  },

  wireComposer() {
    const input = document.getElementById('pa-input');
    if (!input) return;

    const grow = () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    };
    input.addEventListener('input', grow);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
    });
    grow();
    if (!this.busy) input.focus();
  },

  useStarter(text) {
    const input = document.getElementById('pa-input');
    if (input) {
      input.value = text;
      input.focus();
      this.send();
    }
  },

  scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  },

  newChat() {
    this.thread = [];
    this.busy = false;
    this.render();
  },

  async retry() {
    const last = this.thread[this.thread.length - 1];
    if (!last || last.role !== 'assistant') return;
    this.thread.pop();
    this.busy = false;
    await this.answer();
  },

  async send() {
    const input = document.getElementById('pa-input');
    const text = input ? input.value.trim() : '';
    if (!text || this.busy) return;

    input.value = '';
    this.busy = true;
    this.thread.push({ role: 'user', content: text });

    // The assistant thread lives in the same messages rows the ping page used:
    // sender is me, no receiver, no room, and is_ai marks whose turn it is.
    supabase.from('messages').insert({
      sender_id: store.user.id, receiver_id: null, room: null, content: text, is_ai: false
    }).then(({ error }) => { if (error) console.warn('Could not store the question:', error.message); });

    this.render();
    await this.answer();
  },

  async answer() {
    this.busy = true;
    this.thread.push({ role: 'assistant', content: '', pending: true });
    this.render();

    const history = this.thread
      .filter(m => !m.pending && m.content)
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }));

    const lastUser = [...this.thread].reverse().find(m => m.role === 'user' && m.content);
    const userText = lastUser ? lastUser.content : '';

    // The hosted model is tried first so a funded DeepSeek (or any provider
    // behind /api/chat) still powers the assistant. When it is unreachable,
    // unconfigured or out of balance, the built-in knowledge base answers
    // instead — so Assistant never shows a dead end.
    let reply = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.reply) reply = data.reply;
    } catch (err) {
      reply = null;
    }

    if (!reply) reply = kbAnswer(userText);

    const pending = this.thread[this.thread.length - 1];
    if (!pending || !pending.pending) { this.busy = false; return; }

    pending.content = reply;
    pending.pending = false;
    supabase.from('messages').insert({
      sender_id: store.user.id, receiver_id: null, room: null, content: reply, is_ai: true
    }).then(({ error }) => { if (error) console.warn('Could not store the answer:', error.message); });

    this.busy = false;
    this.render();
  }
};

export default assistantView;
