import { supabase } from '../config.js';
import { escapeHtml, empty, rpcError } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';

// The seven columns of contact_info, in the order the footer prints them.
// crm_set_contact() takes null to mean "leave this column alone" and an
// empty string to mean "clear it", so every save sends all seven.
const CONTACT = [
  { key: 'address', param: 'p_address', label: 'Address', textarea: true, maxlength: 500,
    note: 'Printed in the gliimu.com footer. Line breaks are kept.' },
  { key: 'phone', param: 'p_phone', label: 'Phone', maxlength: 30, placeholder: '+234 800 000 0000',
    note: 'Digits, spaces and + ( ) . - only, 6 to 30 characters. Also becomes the tap-to-call link.' },
  { key: 'email', param: 'p_email', label: 'Email', maxlength: 200, placeholder: 'hello@gliimu.com',
    note: 'Also becomes the mailto: link.' }
];

const SOCIALS = [
  { key: 'youtube', param: 'p_youtube', label: 'YouTube', placeholder: 'https://youtube.com/@gliimu' },
  { key: 'tiktok', param: 'p_tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@gliimu' },
  { key: 'facebook', param: 'p_facebook', label: 'Facebook', placeholder: 'https://facebook.com/gliimu' },
  { key: 'pinterest', param: 'p_pinterest', label: 'Pinterest', placeholder: 'https://pinterest.com/gliimu' }
];

const GRID = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0 16px;';

export default {
  template: `
    <div class="filters">
      <button class="filter-btn active" data-tab="faqs">FAQs</button>
      <button class="filter-btn" data-tab="legal">Legal documents</button>
      <button class="filter-btn" data-tab="contact">Contact details</button>
    </div>
    <div id="content-pane"></div>
  `,

  async init() {
    this.tab = 'faqs';
    this.faqs = [];
    this.docs = [];
    this.activeDoc = null;
    this.creating = false;
    this.contact = null;

    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.tab = btn.dataset.tab;
        this.render();
      });
    });

    await this.load();
  },

  async load() {
    const pane = document.getElementById('content-pane');
    pane.innerHTML = '<p class="loading">Loading...</p>';

    const [{ data: faqs, error: faqError }, { data: docs, error: docError }] = await Promise.all([
      supabase.from('faqs').select('id, question, answer, created_at').order('created_at', { ascending: true }),
      supabase.from('legal_documents').select('id, type, content, created_at').order('type', { ascending: true })
    ]);

    if (faqError || docError) {
      pane.innerHTML = empty(`Could not load content: ${(faqError || docError).message}`);
      return;
    }

    this.faqs = faqs || [];
    this.docs = docs || [];
    if (!this.activeDoc && this.docs.length) this.activeDoc = this.docs[0].id;
    this.render();
  },

  async render() {
    const pane = document.getElementById('content-pane');
    if (!pane) return;

    if (this.tab === 'contact') {
      await this.renderContact(pane);
      return;
    }

    pane.innerHTML = this.tab === 'faqs' ? this.faqHtml() : this.legalHtml();
    if (this.tab === 'faqs') this.wireFaqs(pane);
    else this.wireLegal(pane);
  },

  // ---------------- FAQs ----------------

  faqHtml() {
    const list = this.faqs.length
      ? this.faqs.map(f => `
          <div class="card" data-faq="${f.id}">
            <div class="card-head">
              <div style="min-width: 0;"><div class="card-title">${escapeHtml(f.question)}</div></div>
              <div class="card-actions">
                <button class="btn-quiet btn-small" data-edit="${f.id}">Edit</button>
                <button class="btn-danger btn-small" data-delete="${f.id}">Delete</button>
              </div>
            </div>
            <div class="card-body" data-answer style="white-space: pre-wrap;">${escapeHtml(f.answer)}</div>
          </div>`).join('')
      : empty('No FAQs yet. Add the first one below.');

    return `
      <div class="card">
        <div class="section-title">Add a FAQ</div>
        <div class="form-group">
          <label for="new-faq-q">Question</label>
          <input type="text" id="new-faq-q" class="input" placeholder="How do I fund my wallet?">
        </div>
        <div class="form-group">
          <label for="new-faq-a">Answer</label>
          <textarea id="new-faq-a" class="input" rows="3" placeholder="Members fund their wallet from Billing..."></textarea>
        </div>
        <button class="btn-primary btn-small" id="add-faq-btn">Add FAQ</button>
      </div>
      <div class="section-title">Live on the landing page (${this.faqs.length})</div>
      <div class="row-list">${list}</div>
    `;
  },

  wireFaqs(pane) {
    pane.querySelector('#add-faq-btn').addEventListener('click', async () => {
      const question = pane.querySelector('#new-faq-q').value.trim();
      const answer = pane.querySelector('#new-faq-a').value.trim();
      if (!question || !answer) return appAlert('Both the question and the answer are required.');

      const { error } = await supabase.from('faqs').insert({ question, answer });
      if (error) return appAlert('Could not add that FAQ: ' + error.message);
      await this.load();
    });

    pane.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => this.editFaq(pane, btn.dataset.edit));
    });

    pane.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const faq = this.faqs.find(f => f.id === btn.dataset.delete);
        const ok = await appConfirm(`"${faq.question}" disappears from the landing page immediately.`, {
          okText: 'Delete', title: 'Delete this FAQ?', danger: true
        });
        if (!ok) return;
        const { error } = await supabase.from('faqs').delete().eq('id', faq.id);
        if (error) return appAlert('Could not delete that FAQ: ' + error.message);
        await this.load();
      });
    });
  },

  // Editing happens in place so a reviewer can see the live answer next to
  // the replacement before saving.
  editFaq(pane, id) {
    const faq = this.faqs.find(f => f.id === id);
    const card = pane.querySelector(`[data-faq="${id}"]`);
    if (!faq || !card) return;

    card.innerHTML = `
      <div class="form-group">
        <label>Question</label>
        <input type="text" class="input" id="edit-q" value="${escapeHtml(faq.question)}">
      </div>
      <div class="form-group">
        <label>Answer</label>
        <textarea class="input" id="edit-a" rows="5">${escapeHtml(faq.answer)}</textarea>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn-quiet btn-small" id="edit-cancel">Cancel</button>
        <button class="btn-primary btn-small" id="edit-save">Save</button>
      </div>
    `;

    card.querySelector('#edit-cancel').addEventListener('click', () => this.render());
    card.querySelector('#edit-save').addEventListener('click', async () => {
      const question = card.querySelector('#edit-q').value.trim();
      const answer = card.querySelector('#edit-a').value.trim();
      if (!question || !answer) return appAlert('Both fields are required.');

      const { error } = await supabase.from('faqs').update({ question, answer }).eq('id', id);
      if (error) return appAlert('Could not save that FAQ: ' + error.message);
      await this.load();
    });
  },

  // ---------------- Legal documents ----------------

  legalHtml() {
    const tabs = this.docs.map(d => `
      <button class="filter-btn ${d.id === this.activeDoc ? 'active' : ''}" data-doc="${d.id}">${escapeHtml(d.type)}</button>
    `).join('');

    const doc = this.docs.find(d => d.id === this.activeDoc);

    const editor = this.creating ? `
      <div class="card">
        <div class="card-head">
          <div><div class="card-title">New document</div>
          <div class="card-sub">The type is the key the app looks up — the signup page reads "terms".</div></div>
        </div>
        <div class="form-group">
          <label for="new-doc-type">Type</label>
          <input type="text" id="new-doc-type" class="input" placeholder="privacy_policy">
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-quiet btn-small" id="cancel-doc-btn">Cancel</button>
          <button class="btn-primary btn-small" id="create-doc-btn">Create</button>
        </div>
      </div>
    ` : doc ? `
      <div class="card">
        <div class="card-head">
          <div><div class="card-title">${escapeHtml(doc.type)}</div>
          <div class="card-sub">Shown wherever the app links this document.</div></div>
        </div>
        <div class="form-group">
          <label for="doc-content">Content</label>
          <textarea id="doc-content" class="input" rows="18">${escapeHtml(doc.content || '')}</textarea>
        </div>
        <button class="btn-primary btn-small" id="save-doc-btn">Save changes</button>
      </div>
    ` : empty('No legal documents yet. Create the first one with + New.');

    return `
      <div class="filters">${tabs}<button class="filter-btn" data-new-doc="1">+ New</button></div>
      ${editor}
    `;
  },

  wireLegal(pane) {
    pane.querySelectorAll('[data-doc]').forEach((btn) => {
      btn.addEventListener('click', () => { this.activeDoc = btn.dataset.doc; this.creating = false; this.render(); });
    });

    pane.querySelector('[data-new-doc]')?.addEventListener('click', () => {
      this.creating = true;
      this.render();
      document.getElementById('new-doc-type')?.focus();
    });

    pane.querySelector('#cancel-doc-btn')?.addEventListener('click', () => { this.creating = false; this.render(); });

    pane.querySelector('#create-doc-btn')?.addEventListener('click', async () => {
      const type = pane.querySelector('#new-doc-type').value.trim();
      const name = type.toLowerCase().replace(/\s+/g, '_');
      if (!name) return appAlert('Give the document a type.');
      if (this.docs.some(d => d.type === name)) return appAlert('A document with that type already exists.');

      const { data, error } = await supabase.from('legal_documents')
        .insert({ type: name, content: '' }).select('id').single();
      if (error) return appAlert('Could not create that document: ' + error.message);
      this.activeDoc = data.id;
      this.creating = false;
      await this.load();
    });

    pane.querySelector('#save-doc-btn')?.addEventListener('click', async () => {
      const content = pane.querySelector('#doc-content').value;
      const { error } = await supabase.from('legal_documents')
        .update({ content }).eq('id', this.activeDoc);
      if (error) return appAlert('Could not save that document: ' + error.message);
      await appAlert('Saved.');
      await this.load();
    });
  },

  // ---------------- Contact details ----------------

  // Fetched only when the tab is opened, so a missing crm_contact() cannot
  // blank the FAQs or legal tabs that were already working.
  async renderContact(pane) {
    if (!this.contact) {
      pane.innerHTML = '<p class="loading">Loading...</p>';
      const { data, error } = await supabase.rpc('crm_contact');
      if (this.tab !== 'contact') return;
      if (error) { pane.innerHTML = empty('Could not load the contact details: ' + error.message); return; }
      if (!data || data.ok === false) { pane.innerHTML = empty(rpcError(data)); return; }
      this.contact = data;
    }

    pane.innerHTML = this.contactHtml();
    this.wireContact(pane);
  },

  contactField(f) {
    const value = this.contactValue(f.key);
    const max = f.maxlength ? ` maxlength="${f.maxlength}"` : '';
    return `
      <div class="form-group">
        <label for="c-${f.key}">${escapeHtml(f.label)}</label>
        ${f.textarea
          ? `<textarea id="c-${f.key}" class="input" data-c="${f.key}" rows="3"${max} placeholder="${escapeHtml(f.placeholder || '')}">${escapeHtml(value)}</textarea>`
          : `<input type="text" id="c-${f.key}" class="input" data-c="${f.key}" value="${escapeHtml(value)}"${max} placeholder="${escapeHtml(f.placeholder || '')}" autocomplete="off">`}
        ${f.note ? `<div class="card-sub">${escapeHtml(f.note)}</div>` : ''}
      </div>`;
  },

  contactValue(key) {
    const c = (this.contact && this.contact.contact) || {};
    return c[key] == null ? '' : String(c[key]);
  },

  contactHtml() {
    const hasRow = !!(this.contact && this.contact.has_row);
    return `
      <div class="card">
        <div class="card-head">
          <div style="min-width: 0;">
            <div class="card-title">Contact details</div>
            <div class="card-sub">The footer of gliimu.com reads these — the address, the tap-to-call number, the mailto link and the four social icons.</div>
          </div>
        </div>
        ${hasRow ? '' : '<div class="card-sub">There is no contact row yet. The first save creates one.</div>'}
        <div class="section-title">Where members reach you</div>
        ${CONTACT.map((f) => this.contactField(f)).join('')}
        <div class="section-title">Social links</div>
        <div style="${GRID}">${SOCIALS.map((f) => this.contactField(f)).join('')}</div>
        <div class="card-sub">Each must start with https:// or http://. Leave one blank and its footer icon stays unlinked.</div>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 12px;">
        <button class="btn-primary btn-small" id="save-contact-btn">Save contact details</button>
      </div>
    `;
  },

  wireContact(pane) {
    const btn = pane.querySelector('#save-contact-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const payload = {};
      [...CONTACT, ...SOCIALS].forEach((f) => {
        const el = pane.querySelector(`[data-c="${f.key}"]`);
        payload[f.param] = el ? el.value.trim() : null;
      });

      btn.disabled = true;
      const { data, error } = await supabase.rpc('crm_set_contact', payload);
      btn.disabled = false;

      if (error) return appAlert('Could not save the contact details: ' + error.message);
      if (!data || data.ok === false) return appAlert(rpcError(data));

      this.contact = data;
      await this.renderContact(pane);
      await appAlert('Saved. gliimu.com shows it on the next load.');
    });
  }
};
