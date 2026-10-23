// Support is one thread: Gliim P.A. answers instantly, and whenever a human
// joins, their messages land in the same column. While an admin is active the
// assistant holds and the composer writes to the team instead — the gate is
// derived in the database (gliimpa_paused), so nobody has to press a button to
// hand the conversation back.
import { supabase, API_BASE_URL } from '/shared/js/config.js';
import { store } from '../store.js';
import { kbAnswer } from '../gliim-pa-kb.js?v=29';
import { toggleAudio, attachmentHtml, uploadAttachment, createRecorder } from '../media.js';

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
  'How do I publish a gliim?',
  'How do I top up my wallet?'
];

// The user's words, kept verbatim so the handover always reads the same way.
const HANDOVER_SORRY = "Sorry about that, I've handed over to an admin, you'd be notified when they respond to you.";

function timeOf(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toSupportItem(row) {
  return {
    kind: row.kind === 'escalation' ? 'escalation' : 'support',
    id: row.id,
    senderId: row.sender_id,
    content: row.content,
    attachment_url: row.attachment_url,
    attachment_type: row.attachment_type,
    at: row.created_at
  };
}

const supportView = {
  title: 'Support',
  items: [],
  note: '',
  staff: new Map(),
  paused: false,
  forced: false,
  busy: false,
  disposed: true,
  request: 0,
  realtime: null,

  template: `
    <div class="support-page-layout">
      <div id="sup-terms-banner" style="display:none;"></div>
      <div class="ping-chat-header">
        <button class="ping-back-btn" onclick="pingInstance.closeChat()"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg></button>
        <img src="/icons/gliimpa.png" alt="" class="ping-avatar">
        <div>
          <h3>Support</h3>
          <span id="sup-status">Gliim P.A. answers instantly. A human can step in at any time.</span>
        </div>
      </div>

      <div class="ping-messages" id="sup-messages">
        <p style="color: var(--text-muted); text-align: center; margin-top: 40px;">Loading your conversation...</p>
      </div>

      <div class="sup-bottom">
        <div class="sup-modes">
          <button class="sup-mode" id="sup-mode-pa" type="button" onclick="supInstance.setMode('pa')">Gliim P.A.</button>
          <button class="sup-mode" id="sup-mode-team" type="button" onclick="supInstance.setMode('team')">Gliimu team</button>
          <span class="sup-hold" id="sup-hold" hidden>An admin is with you</span>
        </div>

        <div class="ping-input-area" id="sup-input-area">
          <button class="ping-input-icon" id="sup-clip-btn" type="button" title="Attach a file" onclick="supInstance.pickFile()">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
          </button>
          <input type="file" id="sup-file-input" style="display:none" onchange="supInstance.handleFile(event)">

          <button class="ping-input-icon ping-mic-btn" id="sup-mic-btn" type="button" onclick="supInstance.startRecording()" title="Record Voice Note">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg>
          </button>

          <input type="text" id="sup-input" class="input" placeholder="Ask Gliim P.A. anything..."
            onkeypress="if(event.key==='Enter') supInstance.send()">
          <button class="btn-primary" type="button" onclick="supInstance.send()" title="Send">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
      </div>
    </div>
  `,

  init() {
    this.destroy();
    this.disposed = false;
    this.items = [];
    this.note = '';
    this.paused = false;
    this.forced = false;
    this.busy = false;
    this.sendingAudio = false;

    this.recorder = createRecorder({
      instanceName: 'supInstance',
      inputAreaId: 'sup-input-area',
      restore: () => this.renderInputArea(),
      send: async (url) => {
        this.sendingAudio = true;
        if (this.channel() !== 'team') { this.setMode('team'); }
        try { await this.postSupport({ content: '', attachment_url: url, attachment_type: 'audio_note' }); }
        finally { this.sendingAudio = false; }
      }
    });

    window.supInstance = {
      send: () => this.send(),
      useStarter: (text) => this.useStarter(text),
      retry: () => this.retry(),
      feedback: (id, value) => this.feedback(id, value),
      setMode: (mode) => this.setMode(mode),
      pickFile: () => document.getElementById('sup-file-input')?.click(),
      handleFile: (event) => this.handleFile(event),
      toggleAudio: (id, url) => toggleAudio(id, url),
      dismissTermsBanner: () => this.dismissTermsBanner(),
      startRecording: () => {
        if (this.sendingAudio) return;
        return this.recorder.start();
      },
      stopRecording: () => this.recorder.stop(),
      cancelRecording: () => this.recorder.cancel(),
      sendAudioNote: async () => {
        if (this.sendingAudio) return;
        try { await this.recorder.sendNote(); }
        finally { this.sendingAudio = false; }
      },
      togglePreviewAudio: () => this.recorder.togglePreview()
    };

    this.load();
    this.subscribe();
    this.checkTermsUpdate();
  },

  destroy() {
    this.disposed = true;
    this.request++;
    this.recorder?.cancel();
    if (this.realtime) supabase.removeChannel(this.realtime);
    this.realtime = null;
  },

  // The composer writes to the team while an admin is active, or the moment
  // the member asks for a human. Otherwise Gliim P.A. takes the question.
  channel() { return this.paused || this.forced ? 'team' : 'pa'; },

  async load() {
    const request = ++this.request;
    const [answers, thread] = await Promise.all([
      supabase.from('messages')
        .select('id, content, is_ai, created_at, feedback')
        .eq('sender_id', store.user.id).is('receiver_id', null).is('room', null)
        .order('created_at', { ascending: true }).limit(200),
      supabase.from('support_messages')
        .select('id, sender_id, content, attachment_url, attachment_type, created_at, kind')
        .eq('thread_user', store.user.id)
        .order('created_at', { ascending: true }).limit(200)
    ]);
    if (this.disposed || request !== this.request) return;

    if (thread.error) {
      console.warn('Could not load the support thread:', thread.error.message);
      this.renderStatus('Support is not switched on yet — sql/support.sql has to be run first.');
      return;
    }

    const items = (answers.data || [])
      .filter(m => m.content)
      .map(m => ({
        kind: m.is_ai ? 'answer' : 'question',
        id: m.id,
        content: m.content,
        feedback: m.feedback,
        at: m.created_at
      }))
      .concat((thread.data || []).map(toSupportItem))
      .sort((a, b) => new Date(a.at) - new Date(b.at));

    this.items = items;
    await Promise.all([
      this.loadStaffFor(items.map(i => i.senderId)),
      this.refreshPaused()
    ]);
    if (this.disposed || request !== this.request) return;
    this.render();
    this.markRead();
  },

  async refreshPaused() {
    const { data, error } = await supabase.rpc('gliimpa_paused', { p_thread_user: store.user.id });
    this.paused = !error && data === true;
    if (error) console.warn('Could not check the handover gate:', error.message);
  },

  async checkTermsUpdate() {
    const { data, error } = await supabase.from('legal_documents')
      .select('updated_at')
      .eq('type', 'terms')
      .single();
    if (error || !data?.updated_at) return;

    const lastSeen = localStorage.getItem('last_seen_terms_update');
    const currentUpdate = new Date(data.updated_at).getTime();

    if (!lastSeen || currentUpdate > new Date(lastSeen).getTime()) {
      const banner = document.getElementById('sup-terms-banner');
      if (banner) {
        banner.style.display = 'block';
        banner.innerHTML = `
          <div style="background:var(--primary);color:white;padding:12px 16px;border-radius:8px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div style="flex:1;">
              <strong>We've updated our Terms and Policy</strong>
              <div style="font-size:13px;opacity:0.9;margin-top:4px;">Please review the changes to continue using Gliimu.</div>
            </div>
            <button onclick="supInstance.dismissTermsBanner()" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:13px;">Review now</button>
          </div>
        `;
      }
    }
  },

  async dismissTermsBanner() {
    const { data } = await supabase.from('legal_documents').select('updated_at').eq('type', 'terms').single();
    
    if (data?.updated_at) {
      localStorage.setItem('last_seen_terms_update', data.updated_at);
    }
    
    const banner = document.getElementById('sup-terms-banner');
    if (banner) banner.style.display = 'none';
    
    window.location.hash = '#/terms';
  },

  async loadStaffFor(ids) {
    const missing = [...new Set(ids)]
      .filter(id => id && id !== store.user.id)
      .filter(id => !this.staff.has(id));
    if (!missing.length) return;

    const { data } = await supabase.from('profiles')
      .select('id, full_name, avatar_url').in('id', missing);
    (data || []).forEach(p => this.staff.set(p.id, p));
    missing.forEach(id => { if (!this.staff.has(id)) this.staff.set(id, { id, full_name: 'Gliimu team', avatar_url: null }); });
  },

  pushItem(item) {
    if (!item.id || this.items.some(i => i.id === item.id)) return false;
    this.items.push(item);
    this.items.sort((a, b) => new Date(a.at) - new Date(b.at));
    return true;
  },

  renderStatus(text) {
    this.note = text;
    this.render();
  },

  render() {
    const box = document.getElementById('sup-messages');
    if (!box || this.disposed) return;

    if (!this.items.length && !this.note) {
      box.innerHTML = `
        <div class="ping-empty-state">
          <img src="/icons/gliimpa.png" alt="" class="pa-hero-logo">
          <h3>Ask Gliim P.A.</h3>
          <p>Research, drafts, billing and how-to questions — answered in seconds. The Gliimu team can see this thread and step in whenever you need a human.</p>
          <div class="pa-starters">
            ${STARTERS.map(s => `<button class="pa-chip" onclick="supInstance.useStarter('${s.replace(/'/g, "\\'")}')">${escapeHtml(s)}</button>`).join('')}
          </div>
        </div>`;
      this.syncChrome();
      return;
    }

    box.innerHTML = `${this.items.map(item => this.renderItem(item)).join('')}${
      this.note ? `<p class="sup-note">${escapeHtml(this.note)}</p>` : ''}`;
    this.syncChrome();
    box.scrollTop = box.scrollHeight;
  },

  renderItem(item) {
    if (item.kind === 'question') {
      return `
        <div class="ping-message sent">
          <p>${escapeHtml(item.content).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">$1</a>')}</p>
          <div class="ping-msg-footer"><span class="ping-msg-time">${timeOf(item.at)}</span></div>
        </div>`;
    }

    if (item.kind === 'escalation') {
      return `
        <div class="ping-message sent">
          <p><strong>Your question was passed to Team Gliimu:</strong></p>
          <p style="margin-top: 6px; font-style: italic;">${escapeHtml(item.content || '')}</p>
          <div class="ping-msg-footer"><span class="ping-msg-time">${timeOf(item.at)}</span></div>
        </div>`;
    }

    if (item.kind === 'support') {
      const mine = item.senderId === store.user.id;
      const who = mine ? '' : `<span class="ping-msg-sender">${escapeHtml(this.staff.get(item.senderId)?.full_name || 'Gliimu team')}</span>`;
      return `
        <div class="ping-message ${mine ? 'sent' : 'received'}">
          ${who}
          ${attachmentHtml(item, 'supInstance')}
          ${item.content ? `<p>${escapeHtml(item.content).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">$1</a>')}</p>` : ''}
          <div class="ping-msg-footer"><span class="ping-msg-time">${timeOf(item.at)}</span></div>
        </div>`;
    }

    // Gliim P.A. answer
    const body = item.pending
      ? '<div class="pa-typing"><span></span><span></span><span></span></div>'
      : (item.failed
        ? `<p class="pa-error">${escapeHtml(item.content)}</p><button class="pa-chip" onclick="supInstance.retry()">Try again</button>`
        : renderMarkdown(item.content));

    return `
      <div class="pa-answer">
        <div class="pa-answer-head"><img src="/icons/gliimpa.png" alt="" class="pa-answer-avatar"><span>Gliim P.A.</span></div>
        <div class="pa-answer-body">${body}</div>
        ${item.id && !item.pending && !item.failed && item.rateable !== false ? this.renderFeedback(item) : ''}
      </div>`;
  },

  renderFeedback(item) {
    const button = (value, label) => `
      <button class="pa-fb-btn ${item.feedback === value ? 'active' : ''}" data-state="${value}"
        title="${label}" aria-label="${label}" aria-pressed="${item.feedback === value}"
        onclick="supInstance.feedback('${item.id}', '${value}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${
          value === 'like'
            ? '<path d="M7 10v12"></path><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"></path>'
            : '<path d="M17 14V2"></path><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"></path>'
        }</svg>
      </button>`;
    return `
      <div class="pa-feedback">
        <span class="sup-fb-label">Was this helpful?</span>
        ${button('like', 'Helpful')}
        ${button('dislike', 'Not helpful')}
      </div>`;
  },

  // Chips, placeholder and the clip button all follow the active channel.
  syncChrome() {
    const team = this.channel() === 'team';
    const pa = document.getElementById('sup-mode-pa');
    const teamBtn = document.getElementById('sup-mode-team');
    const hold = document.getElementById('sup-hold');
    const input = document.getElementById('sup-input');
    const clip = document.getElementById('sup-clip-btn');
    const mic = document.getElementById('sup-mic-btn');
    const status = document.getElementById('sup-status');

    if (pa) {
      pa.classList.toggle('active', !team);
      pa.disabled = this.paused;
      pa.title = this.paused ? 'Gliim P.A. resumes 5 minutes after the admin stops replying' : 'Ask Gliim P.A.';
    }
    if (teamBtn) teamBtn.classList.toggle('active', team);
    if (hold) hold.hidden = !this.paused;
    if (input) input.placeholder = team ? 'Message the Gliimu team...' : 'Ask Gliim P.A. anything...';
    if (clip) clip.style.display = '';
    if (mic) mic.style.display = '';
    if (status) status.textContent = this.paused
      ? 'An admin is handling this. Gliim P.A. resumes after 5 quiet minutes.'
      : 'Gliim P.A. answers instantly. A human can step in at any time.';
  },

  setMode(mode) {
    if (mode === 'team') this.forced = true;
    else if (!this.paused) this.forced = false;
    this.syncChrome();
    document.getElementById('sup-input')?.focus();
  },

  wireInput() {
    const input = document.getElementById('sup-input');
    if (input && !this.busy) input.focus();
  },

  renderInputArea() {
    const el = document.getElementById('sup-input-area');
    if (!el) return;
    el.innerHTML = `
      <button class="ping-input-icon" id="sup-clip-btn" type="button" title="Attach a file" onclick="supInstance.pickFile()">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
      </button>
      <input type="file" id="sup-file-input" style="display:none" onchange="supInstance.handleFile(event)">
      <button class="ping-input-icon ping-mic-btn" id="sup-mic-btn" type="button" onclick="supInstance.startRecording()" title="Record Voice Note">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg>
      </button>
      <input type="text" id="sup-input" class="input" placeholder="${this.channel() === 'team' ? 'Message the Gliimu team...' : 'Ask Gliim P.A. anything...'}"
        onkeypress="if(event.key==='Enter') supInstance.send()">
      <button class="btn-primary" type="button" onclick="supInstance.send()" title="Send">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>
    `;
    this.syncChrome();
  },

  useStarter(text) {
    const input = document.getElementById('sup-input');
    if (!input) return;
    input.value = text;
    this.send();
  },

  markRead() {
    supabase.rpc('support_mark_read', { p_thread_user: store.user.id })
      .then(({ error }) => { if (error) console.warn('Could not mark support read:', error.message); });
    window.NotificationManager?.refreshSupportUnread();
  },

  async send() {
    const input = document.getElementById('sup-input');
    const text = input ? input.value.trim() : '';
    if (!text || this.busy) return;
    input.value = '';
    this.note = '';

    if (this.channel() === 'team') {
      await this.postSupport({ content: text });
      return;
    }

    this.busy = true;
    // The question is stored on its own row first, exactly like the ping page:
    // sender is me, no receiver, no room, and is_ai marks whose turn it is.
    supabase.from('messages').insert({
      sender_id: store.user.id, receiver_id: null, room: null, content: text, is_ai: false
    }).then(({ error }) => { if (error) console.warn('Could not store the question:', error.message); });

    this.pushItem({ kind: 'question', id: `local-${Date.now()}`, content: text, at: new Date().toISOString() });
    this.render();
    await this.answer(text);
  },

  async retry() {
    const last = this.items[this.items.length - 1];
    if (!last || last.kind !== 'answer') return;
    this.items.pop();
    this.busy = false;
    const question = [...this.items].reverse().find(i => i.kind === 'question' && i.content);
    this.busy = true;
    await this.answer(question ? question.content : '');
  },

  async answer(userText) {
    this.busy = true;
    const pending = { kind: 'answer', id: null, content: '', pending: true, at: new Date().toISOString() };
    this.pushItem({ ...pending, id: `pending-${Date.now()}` });
    this.render();

    const history = this.items
      .filter(i => (i.kind === 'answer' || i.kind === 'question') && i.content && !i.pending)
      .slice(-20)
      .map(i => ({ role: i.kind === 'answer' ? 'assistant' : 'user', content: i.content }));

    // The hosted model is tried first so a funded provider behind /api/chat
    // still powers the assistant. When it is unreachable, unconfigured or out
    // of balance, the built-in knowledge base answers instead.
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
    } catch {
      reply = null;
    }

    if (!reply) reply = kbAnswer(userText);

    const slot = this.items.find(i => i.pending);
    if (!slot) { this.busy = false; return; }
    slot.content = reply;
    slot.pending = false;
    slot.at = new Date().toISOString();

    const { data, error } = await supabase.from('messages').insert({
      sender_id: store.user.id, receiver_id: null, room: null, content: reply, is_ai: true
    }).select('id').single();
    if (error) console.warn('Could not store the answer:', error.message);
    // A failed insert must not leave the local placeholder id behind: it is not
    // a uuid, so rating or escalating that row would be rejected by the database.
    slot.id = error ? null : data.id;

    this.busy = false;
    this.render();
    this.wireInput();
  },

  async postSupport(fields) {
    const { data, error } = await supabase.from('support_messages')
      .insert({ thread_user: store.user.id, sender_id: store.user.id, ...fields })
      .select('id, sender_id, content, attachment_url, attachment_type, created_at, kind')
      .single();

    if (error) {
      console.warn('Could not send to the support desk:', error.message);
      const input = document.getElementById('sup-input');
      if (input && fields.content && !input.value) input.value = fields.content;
      this.renderStatus('Could not send that. Please try again.');
      return;
    }
    this.note = '';
    this.pushItem(toSupportItem(data));
    this.render();
    this.markRead();
  },

  async handleFile(event) {
    const file = event.target?.files?.[0];
    if (event.target) event.target.value = '';
    if (!file || this.busy) return;
    if (this.channel() !== 'team') { this.setMode('team'); }

    this.busy = true;
    this.renderStatus('Uploading attachment...');
    let uploaded;
    try { uploaded = await uploadAttachment(file); }
    catch { this.busy = false; this.render(); this.renderStatus('Upload failed. Try again.'); return; }
    this.busy = false;
    await this.postSupport({ content: '', attachment_url: uploaded.url, attachment_type: uploaded.type });
  },

  async feedback(id, value) {
    const item = this.items.find(i => i.kind === 'answer' && i.id === id);
    if (!item) return;
    const next = item.feedback === value ? null : value;
    item.feedback = next;
    this.render();

    const { error } = await supabase.from('messages').update({ feedback: next }).eq('id', id);
    if (error) console.warn('Could not save the rating:', error.message);
    if (next === 'dislike') await this.escalate(item);
  },

  // A dislike is the member asking for a human: the question and the answer
  // that missed are copied into their own support thread as an escalation, and
  // that row is what puts Gliim P.A. on hold.
  async escalate(answer) {
    const index = this.items.indexOf(answer);
    const question = [...this.items.slice(0, index)].reverse().find(i => i.kind === 'question' && i.content);
    const { data, error } = await supabase.rpc('gliimpa_escalate', {
      p_question: question ? question.content : answer.content,
      p_answer: answer.content,
      p_message_id: answer.id
    });
    if (error) {
      console.warn('Could not pass that to an admin:', error.message);
      return;
    }

    this.paused = true;
    this.pushItem({ kind: 'escalation', id: data, content: question?.content || '', at: new Date().toISOString() });
    const { data: row } = await supabase.from('messages').insert({
      sender_id: store.user.id, receiver_id: null, room: null, content: HANDOVER_SORRY, is_ai: true
    }).select('id').single();
    this.pushItem({ kind: 'answer', id: row?.id || `sorry-${Date.now()}`, content: HANDOVER_SORRY, at: new Date().toISOString(), rateable: false });
    this.render();
    this.markRead();
  },

  subscribe() {
    this.realtime = supabase.channel(`support-page-${store.user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'support_messages',
        filter: `thread_user=eq.${store.user.id}`
      }, async ({ new: row }) => {
        if (this.disposed) return;
        const arrived = this.pushItem(toSupportItem(row));
        if (row.sender_id !== store.user.id) await this.refreshPaused();
        await this.loadStaffFor([row.sender_id]);
        if (this.disposed) return;
        // Even a row already in the timeline can change who owns the conversation.
        if (arrived) this.render();
        else this.syncChrome();
        this.markRead();
      })
      .subscribe();
  }
};

export default supportView;
