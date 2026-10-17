// The staff desk: one shared thread between a member and the Gliimu team.
// It is deliberately separate from Ping — members only ping each other here,
// while every admin conversation lives in support_messages.
import { supabase } from '/shared/js/config.js';
import { store } from './store.js';
import { attachmentHtml, uploadAttachment } from './media.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function timeOf(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const ICONS = {
  close: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
  clip: '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>',
  send: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>'
};

export const supportDesk = {
  isOpen: false,
  messages: [],
  staff: new Map(),
  channel: null,
  sending: false,
  request: 0,

  init() {
    this.root = document.getElementById('support-desk-root');
    this.button = document.getElementById('support-desk-btn');
    this.badge = document.getElementById('support-desk-badge');
    if (!this.root || !this.button) return;

    this.button.addEventListener('click', () => this.toggle());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });

    this.subscribe();
    this.refreshUnread();
  },

  toggle() { this.isOpen ? this.close() : this.open(); },

  async open() {
    this.isOpen = true;
    this.root.innerHTML = `
      <div class="sd-overlay" id="sd-overlay">
        <section class="sd-panel" role="dialog" aria-modal="true" aria-label="Team Gliimu support chat">
          <header class="sd-head">
            <img src="/icons/icon.png" alt="" class="sd-logo">
            <div class="sd-head-text">
              <strong>Team Gliimu</strong>
              <span>Support desk · every agent can read and answer</span>
            </div>
            <button class="sd-close" id="sd-close" aria-label="Close">${ICONS.close}</button>
          </header>
          <div class="sd-body" id="sd-body"><p class="sd-status">Loading your conversation...</p></div>
          <div class="sd-composer">
            <button class="sd-icon-btn" id="sd-attach-btn" type="button" title="Attach a file">${ICONS.clip}</button>
            <input type="file" id="sd-file-input" hidden>
            <input class="sd-input" id="sd-input" maxlength="4000" placeholder="Message Team Gliimu...">
            <button class="sd-send-btn" id="sd-send-btn" type="button" title="Send">${ICONS.send}</button>
          </div>
        </section>
      </div>
    `;

    document.getElementById('sd-close').addEventListener('click', () => this.close());
    document.getElementById('sd-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'sd-overlay') this.close();
    });
    const input = document.getElementById('sd-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.send(input.value); }
    });
    document.getElementById('sd-send-btn').addEventListener('click', () => this.send(input.value));

    const fileInput = document.getElementById('sd-file-input');
    document.getElementById('sd-attach-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.sendAttachment(e.target.files[0], fileInput));

    await this.loadThread();
    input.focus();
  },

  close() {
    this.isOpen = false;
    this.request++;
    this.root.innerHTML = '';
    this.refreshUnread();
  },

  async loadThread() {
    const request = this.request = this.request + 1;
    const { data, error } = await supabase.from('support_messages')
      .select('id, sender_id, content, attachment_url, attachment_type, created_at')
      .eq('thread_user', store.user.id)
      .order('created_at', { ascending: true })
      .limit(200);

    if (request !== this.request) return;
    if (error) {
      this.renderStatus('Could not load this conversation. Close and reopen to retry.');
      console.warn('Support thread error:', error.message);
      return;
    }
    this.messages = data || [];
    await this.loadStaff();
    if (request !== this.request || !this.isOpen) return;
    this.render();
    this.markRead();
  },

  // Staff names come from the same public profile rows Ping already reads.
  async loadStaff() {
    const ids = [...new Set(this.messages.map(m => m.sender_id).filter(id => id !== store.user.id))];
    const missing = ids.filter(id => !this.staff.has(id));
    if (!missing.length) return;

    const { data } = await supabase.from('profiles')
      .select('id, full_name, avatar_url').in('id', missing);
    (data || []).forEach(p => this.staff.set(p.id, p));
    missing.forEach(id => { if (!this.staff.has(id)) this.staff.set(id, { id, full_name: 'Team Gliimu', avatar_url: null }); });
  },

  renderStatus(text) {
    const body = document.getElementById('sd-body');
    if (body) body.innerHTML = `<p class="sd-status">${escapeHtml(text)}</p>`;
  },

  identityHtml(senderId) {
    const staff = this.staff.get(senderId) || { full_name: 'Team Gliimu', avatar_url: null };
    const avatar = staff.avatar_url
      ? `<img src="${escapeHtml(staff.avatar_url)}" alt="" class="sd-mini-avatar">`
      : `<img src="/icons/icon.png" alt="" class="sd-mini-avatar">`;
    return `<div class="sd-identity">${avatar}<span>${escapeHtml(staff.full_name || 'Team Gliimu')}</span></div>`;
  },

  render() {
    const body = document.getElementById('sd-body');
    if (!body) return;

    if (!this.messages.length) {
      body.innerHTML = `
        <div class="sd-empty">
          <img src="/icons/icon.png" alt="">
          <h3>Talk to the Gliimu team</h3>
          <p>Report an issue, ask about billing, or request something. Replies land here, not in Ping.</p>
        </div>`;
      return;
    }

    body.innerHTML = this.messages.map(m => {
      const mine = m.sender_id === store.user.id;
      return `
        <div class="sd-msg ${mine ? 'mine' : 'staff'}">
          ${mine ? '' : this.identityHtml(m.sender_id)}
          <div class="sd-bubble">
            ${attachmentHtml(m, 'GliimuSupportDesk')}
            ${m.content ? `<p>${escapeHtml(m.content).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')}</p>` : ''}
            <span class="sd-time">${timeOf(m.created_at)}</span>
          </div>
        </div>`;
    }).join('');

    body.scrollTop = body.scrollHeight;
  },

  async send(text) {
    const value = String(text || '').trim();
    if (!value || this.sending) return;
    const input = document.getElementById('sd-input');
    if (input) input.value = '';
    await this.post({ content: value });
  },

  async sendAttachment(file, input) {
    if (!file || this.sending) return;
    this.sending = true;
    this.renderStatus('Uploading attachment...');
    let uploaded;
    try { uploaded = await uploadAttachment(file); }
    catch { this.renderStatus('Upload failed. Try again.'); this.sending = false; return; }
    await this.post({ content: '', attachment_url: uploaded.url, attachment_type: uploaded.type });
    if (input) input.value = '';
  },

  async post(fields) {
    this.sending = true;
    const { data, error } = await supabase.from('support_messages')
      .insert({ thread_user: store.user.id, sender_id: store.user.id, ...fields })
      .select('id, sender_id, content, attachment_url, attachment_type, created_at')
      .single();
    this.sending = false;

    if (error) {
      console.warn('Could not send to the support desk:', error.message);
      this.renderStatus('Could not send. Please try again.');
      return;
    }
    if (!this.messages.some(m => m.id === data.id)) this.messages.push(data);
    if (this.isOpen) { this.render(); this.markRead(); }
    else this.refreshUnread();
  },

  async refreshUnread() {
    const { count, error } = await supabase.rpc('support_thread_unread', { p_thread_user: store.user.id });
    if (error) {
      console.warn('Could not read support unread count:', error.message);
      return;
    }
    this.setBadge(count || 0);
  },

  setBadge(count) {
    if (this.badge) {
      this.badge.hidden = count <= 0;
      this.badge.textContent = count > 9 ? '9+' : String(count);
    }
    window.NotificationManager?.updateBadge('support', count);
  },

  markRead() {
    supabase.rpc('support_mark_read', { p_thread_user: store.user.id })
      .then(({ error }) => { if (error) console.warn('Could not mark the desk read:', error.message); });
    this.setBadge(0);
  },

  subscribe() {
    if (this.channel) supabase.removeChannel(this.channel);
    // Thread-keyed, not viewer-keyed: staff replies are sent by the agent, so
    // a receiver filter would never see them.
    this.channel = supabase.channel(`support-thread-${store.user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'support_messages',
        filter: `thread_user=eq.${store.user.id}`
      }, ({ new: row }) => {
        if (this.isOpen) {
          if (!this.messages.some(m => m.id === row.id)) {
            this.messages.push(row);
            this.loadStaff().then(() => { if (this.isOpen) this.render(); });
          }
          this.markRead();
        } else {
          this.refreshUnread();
        }
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') this.refreshUnread(); });
  }
};

window.GliimuSupportDesk = {
  toggleAudio: (id, url) => import('./media.js').then(m => m.toggleAudio(id, url))
};

export default supportDesk;
