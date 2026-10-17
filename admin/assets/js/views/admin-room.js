// The admins room: one shared thread for staff only. Members can never see or
// write these rows — every policy on admin_chat calls support_can_view(), which
// is only true for an admin_users row. Voice notes are recorded in the browser
// and pushed to R2 through the same chat upload kind the Support desk uses.
import { supabase } from '../config.js';
import { store } from '../store.js';
import { escapeHtml, empty, avatar, timeAgo } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';
import { uploadFile } from '../upload.js';

function attachmentHtml(url, type) {
  const kind = String(type || '');
  const safe = escapeHtml(url);
  if (kind.startsWith('image/')) return `<a href="${safe}" target="_blank" rel="noopener"><img class="sb-attach" src="${safe}" alt=""></a>`;
  if (kind.startsWith('video/')) return `<video class="sb-attach" src="${safe}" controls playsinline></video>`;
  if (kind.startsWith('audio/')) return `<audio class="sb-attach" src="${safe}" controls preload="metadata"></audio>`;
  return `<a class="sb-file" href="${safe}" target="_blank" rel="noopener">Open attachment</a>`;
}

const MIC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
const STOP_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>`;
const CLIP_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>`;
const TRASH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 7 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>`;

export default {
  template: `
    <div class="inbox-thread">
      <div class="inbox-head">
        <span style="min-width: 0;">
          <span class="card-title">Admins Room</span>
          <span class="card-sub">Staff only — every admin reads and writes here</span>
        </span>
        <span class="room-count muted small" id="room-count"></span>
      </div>
      <div class="inbox-body" id="room-body"><p class="loading">Loading the room...</p></div>
      <div class="inbox-composer">
        <button class="inbox-icon-btn" id="room-attach" title="Attach a file" aria-label="Attach a file">${CLIP_ICON}</button>
        <input type="file" id="room-file" hidden>
        <button class="inbox-icon-btn" id="room-mic" title="Record a voice note" aria-label="Record a voice note">${MIC_ICON}</button>
        <textarea id="room-text" class="input" rows="2" placeholder="Message the team..."></textarea>
        <button class="btn-primary btn-small" id="room-send">Send</button>
      </div>
    </div>
  `,

  async init() {
    this.messages = [];
    this.people = new Map();
    this.sending = false;
    this.recorder = null;
    this.chunks = [];
    this.startedAt = 0;

    document.getElementById('room-send').addEventListener('click', () => this.send(document.getElementById('room-text').value));
    document.getElementById('room-text').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.send(e.target.value);
      }
    });
    document.getElementById('room-attach').addEventListener('click', () => document.getElementById('room-file').click());
    document.getElementById('room-file').addEventListener('change', async (e) => {
      const picked = e.target.files && e.target.files[0];
      e.target.value = '';
      if (picked) await this.post({ content: '', attachment_url: null, attachment_type: null }, picked);
    });
    document.getElementById('room-mic').addEventListener('click', () => this.toggleRecording());

    this.subscribe();
    await this.load();
  },

  subscribe() {
    if (this.channel) supabase.removeChannel(this.channel);
    this.channel = supabase
      .channel('admin-room')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_chat' },
        (payload) => this.onInsert(payload.new))
      .subscribe();
  },

  onInsert(row) {
    if (!row || this.messages.some(m => m.id === row.id)) return;
    this.messages.push(row);
    this.resolvePeople([row.sender_id]).then(() => this.render());
  },

  async load() {
    const { data, error } = await supabase
      .from('admin_chat')
      .select('id, sender_id, content, attachment_url, attachment_type, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      document.getElementById('room-body').innerHTML =
        empty(`Could not load the room: ${error.message}`);
      return;
    }
    this.messages = (data || []).reverse();
    await this.resolvePeople(this.messages.map(m => m.sender_id));
    this.render();
  },

  // Names come from the same lookup the Support desk uses, so one round trip
  // covers every sender this view has not seen yet.
  async resolvePeople(ids) {
    const missing = [...new Set(ids)].filter(id => id && !this.people.has(id));
    if (!missing.length) return;
    const { data } = await supabase.rpc('admin_member_lookup', { p_ids: missing });
    (data || []).forEach(p => this.people.set(p.id, p));
    missing.forEach(id => { if (!this.people.has(id)) this.people.set(id, { id, full_name: 'Team Gliimu', avatar_url: null }); });
  },

  render() {
    const body = document.getElementById('room-body');
    if (!body) return;

    document.getElementById('room-count').textContent =
      `${this.messages.length} message${this.messages.length === 1 ? '' : 's'}`;

    if (!this.messages.length) {
      body.innerHTML = `<div class="inbox-blank">Nothing here yet. Say something — hand over a thread, flag a payment, or drop a voice note.</div>`;
      return;
    }

    body.innerHTML = this.messages.map(m => this.bubble(m)).join('');
    body.scrollTop = body.scrollHeight;

    body.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => this.remove(btn.dataset.del));
    });
  },

  bubble(m) {
    const mine = m.sender_id === store.user.id;
    const who = this.people.get(m.sender_id);
    const name = mine ? (who && who.full_name) || store.displayName : (who && who.full_name) || 'Team Gliimu';

    return `
      <div class="sb ${mine ? 'me' : 'them'}">
        ${mine ? '' : `<span class="sb-avatar">${avatar(who && who.avatar_url, name)}</span>`}
        <span class="sb-col">
          ${mine ? '' : `<span class="sb-who">${escapeHtml(name)}</span>`}
          <span class="sb-bubble">
            ${m.content ? `<span class="sb-text">${escapeHtml(m.content)}</span>` : ''}
            ${m.attachment_url ? attachmentHtml(m.attachment_url, m.attachment_type) : ''}
            <span class="sb-time">${timeAgo(m.created_at)}${mine ? ` <button class="sb-del" data-del="${escapeHtml(m.id)}" title="Delete">${TRASH_ICON}</button>` : ''}</span>
          </span>
        </span>
      </div>`;
  },

  async send(content) {
    const text = String(content || '').trim();
    if (!text || this.sending) return;
    document.getElementById('room-text').value = '';
    await this.post({ content: text, attachment_url: null, attachment_type: null });
  },

  // fields + optional File in one place: uploading first keeps the row insert
  // atomic from the operator's point of view — nothing appears until it works.
  async post(fields, file) {
    this.sending = true;
    const btn = document.getElementById('room-send');
    if (btn) { btn.disabled = true; btn.textContent = file ? 'Uploading...' : 'Sending...'; }

    let attachmentUrl = fields.attachment_url;
    let attachmentType = fields.attachment_type;
    if (file) {
      try {
        attachmentUrl = await uploadFile(file, 'chat');
        attachmentType = file.type || 'file';
      } catch (err) {
        this.doneSending(btn);
        return appAlert(err.message || 'The upload did not complete.');
      }
    }

    const { error } = await supabase.from('admin_chat').insert({
      sender_id: store.user.id,
      content: fields.content || '',
      attachment_url: attachmentUrl,
      attachment_type: attachmentType
    });

    this.doneSending(btn);
    if (error) return appAlert(`Could not send: ${error.message}`);
    await this.load();
  },

  doneSending(btn) {
    this.sending = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
  },

  toggleRecording() {
    if (this.recorder) return this.stopRecording();
    this.startRecording();
  },

  async startRecording() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      return appAlert('This browser cannot record audio. Use the paperclip to attach a recording instead.');
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return appAlert('The microphone was blocked. Allow microphone access in the browser, then try again.');
    }

    const chunks = [];
    const recorder = new MediaRecorder(stream);
    recorder.addEventListener('dataavailable', (e) => { if (e.data && e.data.size) chunks.push(e.data); });
    recorder.addEventListener('stop', () => {
      stream.getTracks().forEach(t => t.stop());
      this.recorder = null;
      this.setMicUI(false);
      const type = recorder.mimeType || 'audio/webm';
      const secs = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
      const ext = type.includes('ogg') ? 'ogg' : 'webm';
      const blob = new Blob(chunks, { type });
      if (!blob.size) return;
      const file = new File([blob], `voice-note-${secs}s.${ext}`, { type });
      this.post({ content: '' }, file);
    });

    this.recorder = recorder;
    this.startedAt = Date.now();
    this.setMicUI(true);
    recorder.start();
  },

  stopRecording() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
  },

  setMicUI(recording) {
    const btn = document.getElementById('room-mic');
    if (!btn) return;
    btn.classList.toggle('recording', recording);
    btn.innerHTML = recording ? STOP_ICON : MIC_ICON;
    btn.title = recording ? 'Stop and send' : 'Record a voice note';
  },

  async remove(id) {
    if (!await appConfirm('Delete your message from the admins room?', { okText: 'Delete', danger: true })) return;
    const { error } = await supabase.from('admin_chat').delete().eq('id', id).eq('sender_id', store.user.id);
    if (error) return appAlert(`Could not delete: ${error.message}`);
    this.messages = this.messages.filter(m => m.id !== id);
    this.render();
  }
};
