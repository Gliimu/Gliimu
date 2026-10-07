import { supabase } from '../config.js';
import { escapeHtml, empty } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';

export default {
  template: `
    <div class="filters">
      <button class="filter-btn active" data-tab="faqs">FAQs</button>
      <button class="filter-btn" data-tab="legal">Legal documents</button>
    </div>
    <div id="content-pane"></div>
  `,

  async init() {
    this.tab = 'faqs';
    this.faqs = [];
    this.docs = [];
    this.activeDoc = null;
    this.creating = false;

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

  render() {
    const pane = document.getElementById('content-pane');
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
  }
};
