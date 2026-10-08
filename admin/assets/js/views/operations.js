import { supabase } from '../config.js';
import { escapeHtml, empty, rpcError, openDrawer } from '../ui.js';
import { appAlert, appConfirm } from '../dialog.js';
import { uploadFile } from '../upload.js';

const TABS = [
  { id: 'landing', label: 'Landing page' },
  { id: 'partners', label: 'Partners' },
  { id: 'release', label: 'App release' }
];

// Every field below is one column of site_settings. The RPCs take null to
// mean "leave this column alone" and an empty string to mean "clear it", so
// each screen always sends the fields it actually shows.
const LANDING = [
  { key: 'hero_video_url', param: 'p_hero_video_url', label: 'Hero video', asset: true, video: true,
    note: 'Plays behind the headline on gliimu.com.' },
  { key: 'hero_fallback_image_url', param: 'p_hero_fallback_image_url', label: 'Hero fallback image', asset: true,
    note: 'Shown behind the headline while the video loads, or where autoplay is blocked.' },
  { key: 'squad_bg_url', param: 'p_squad_bg_url', label: 'Squad section background', asset: true,
    note: 'Background image of the squad section.' }
];

const RELEASE = [
  { key: 'app_version', param: 'p_app_version', label: 'Latest version', placeholder: '1.4.0', maxlength: 40,
    note: 'Printed on the landing page download panel.' },
  { key: 'app_version_notes', param: 'p_app_version_notes', label: 'Release notes', textarea: true, maxlength: 2000,
    placeholder: 'What changed in this release?' }
];

const RELEASE_BG = { key: 'app_download_bg_url', param: 'p_app_download_bg_url',
  label: 'Download section background', asset: true,
  note: 'Background image behind the "Take Gliimu Everywhere" panel.' };

const RELEASE_LINKS = [
  { key: 'app_windows_url', param: 'p_app_windows_url', label: 'Windows download link' },
  { key: 'app_mac_url', param: 'p_app_mac_url', label: 'macOS download link' },
  { key: 'app_linux_url', param: 'p_app_linux_url', label: 'Linux download link' },
  { key: 'app_android_url', param: 'p_app_android_url', label: 'Android download link' },
  { key: 'app_ios_url', param: 'p_app_ios_url', label: 'iOS download link' },
  { key: 'app_mobile_qr_url', param: 'p_app_mobile_qr_url', label: 'Desktop QR link',
    note: 'Leave blank to encode the Android link, or iOS if there is no Android link.' }
];

const GRID = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0 16px;';

export default {
  template: `
    <div class="filters">
      ${TABS.map((t, i) => `<button class="filter-btn${i === 0 ? ' active' : ''}" data-tab="${t.id}">${escapeHtml(t.label)}</button>`).join('')}
    </div>
    <div id="operations-pane"><p class="loading">Loading...</p></div>
  `,

  async init() {
    this.tab = 'landing';
    this.settings = null;
    this.partners = null;

    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.tab = btn.dataset.tab;
        this.render();
      });
    });

    await this.render();
  },

  async render() {
    const pane = document.getElementById('operations-pane');
    if (!pane) return;

    const failed = await this.fetch();
    if (failed) {
      pane.innerHTML = empty(failed);
      return;
    }

    pane.innerHTML = this.tab === 'partners' ? this.partnersHtml()
      : this.tab === 'release' ? this.releaseHtml()
      : this.landingHtml();
    this.wire(pane);
  },

  // The two tabs read different tables, so a failure on one side still lets
  // the other render instead of blanking the whole screen.
  async fetch() {
    if (this.tab === 'partners') {
      if (this.partners) return null;
      const { data, error } = await supabase.rpc('operations_partners');
      if (error) return error.message;
      if (!data || data.ok === false) return rpcError(data);
      this.partners = data.partners || [];
      return null;
    }

    if (this.settings) return null;
    const { data, error } = await supabase.rpc('operations_settings');
    if (error) return error.message;
    if (!data || data.ok === false) return rpcError(data);
    this.settings = data;
    return null;
  },

  invalidate() {
    this.settings = null;
    this.partners = null;
  },

  value(key) {
    const s = this.settings || {};
    const found = (s.landing && key in s.landing) ? s.landing[key] : (s.release || {})[key];
    return found == null ? '' : String(found);
  },

  input(key) {
    return document.querySelector(`[data-key="${key}"]`);
  },

  // ============================================
  // Field builders
  // ============================================
  textField(f) {
    const value = this.value(f.key);
    const max = f.maxlength ? ` maxlength="${f.maxlength}"` : '';
    return `
      <div class="form-group">
        <label for="in-${f.key}">${escapeHtml(f.label)}</label>
        ${f.textarea
          ? `<textarea id="in-${f.key}" class="input" data-key="${f.key}"${max} placeholder="${escapeHtml(f.placeholder || '')}">${escapeHtml(value)}</textarea>`
          : `<input type="text" id="in-${f.key}" class="input" data-key="${f.key}" value="${escapeHtml(value)}"${max} placeholder="${escapeHtml(f.placeholder || '')}" autocomplete="off">`}
        ${f.note ? `<div class="card-sub">${escapeHtml(f.note)}</div>` : ''}
      </div>`;
  },

  linkField(f) {
    return `
      <div class="form-group">
        <label for="in-${f.key}">${escapeHtml(f.label)}</label>
        <input type="text" id="in-${f.key}" class="input" data-key="${f.key}" value="${escapeHtml(this.value(f.key))}"
               placeholder="https:// — leave blank to switch it off" autocomplete="off">
        ${f.note ? `<div class="card-sub">${escapeHtml(f.note)}</div>` : ''}
      </div>`;
  },

  assetField(f) {
    return `
      <div class="form-group">
        <label for="in-${f.key}">${escapeHtml(f.label)}</label>
        <input type="text" id="in-${f.key}" class="input" data-key="${f.key}" value="${escapeHtml(this.value(f.key))}"
               placeholder="https://cdn.gliimu.com/… — leave blank to remove it" autocomplete="off">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;">
          <label class="btn-quiet btn-small" for="up-${f.key}" style="cursor:pointer;">Upload a file</label>
          <input type="file" id="up-${f.key}" accept="${f.video ? 'video/*' : 'image/*'}" hidden data-upload="${f.key}">
          <button type="button" class="btn-quiet btn-small" data-clear="${f.key}">Clear</button>
          <span class="muted small" data-status="${f.key}"></span>
        </div>
        ${f.note ? `<div class="card-sub">${escapeHtml(f.note)}</div>` : ''}
        <div style="margin-top:10px;" data-preview="${f.key}">${this.previewHtml(f, this.value(f.key))}</div>
      </div>`;
  },

  previewHtml(f, url) {
    if (!url) return '<span class="muted small">Nothing set.</span>';
    const safe = escapeHtml(url);
    if (f.video) {
      return `<div class="file-chip"><span class="mono">${safe}</span><a href="${safe}" target="_blank" rel="noopener">Open</a></div>`;
    }
    return `<img class="cover-preview" src="${safe}" alt="">`;
  },

  // ============================================
  // TAB 1 — landing page media
  // ============================================
  landingHtml() {
    const note = this.settings.has_row ? '' : ' There is no settings row yet — the first save creates one.';
    return `
      <div class="card">
        <div class="card-head"><div>
          <div class="card-title">Landing page media</div>
          <div class="card-sub">Everything here goes live on gliimu.com the moment you save.${escapeHtml(note)}</div>
        </div></div>
        ${LANDING.map(f => this.assetField(f)).join('')}
        <div class="card-actions" style="margin-left:0;margin-top:6px;">
          <button class="btn-primary btn-small" data-save="landing">Save landing page</button>
        </div>
      </div>`;
  },

  // ============================================
  // TAB 2 — the partner wall
  // ============================================
  partnersHtml() {
    const rows = this.partners || [];
    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Trusted By wall</div>
            <div class="card-sub">Logos on the landing page, lowest position first. Editing a position saves it straight away.</div>
          </div>
          <div class="card-actions"><button class="btn-primary btn-small" data-add-partner>Add partner</button></div>
        </div>
        ${rows.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th style="width:64px;">Logo</th><th>Partner</th><th class="num" style="width:110px;">Position</th><th class="num" style="width:180px;"></th></tr></thead>
            <tbody>${rows.map(p => `
              <tr data-partner="${escapeHtml(p.id)}">
                <td>${p.logo_url
                  ? `<img src="${escapeHtml(p.logo_url)}" alt="" style="width:44px;height:30px;object-fit:contain;border-radius:6px;background:var(--bg-tertiary);">`
                  : '<span class="muted small">none</span>'}</td>
                <td>${escapeHtml(p.name || '—')}</td>
                <td class="num"><input type="number" class="input" min="0" max="999" step="1" data-order
                       value="${Number(p.display_order || 0)}" style="width:84px;padding:5px 8px;text-align:right;"></td>
                <td class="num" style="white-space:nowrap;">
                  <button class="btn-quiet btn-small" data-edit="${escapeHtml(p.id)}">Edit</button>
                  <button class="btn-danger btn-small" data-remove="${escapeHtml(p.id)}"
                          data-name="${escapeHtml(p.name || 'that partner')}">Remove</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : empty('No partners yet. Add the first logo.')}
      </div>`;
  },

  // ============================================
  // TAB 3 — the app release
  // ============================================
  releaseHtml() {
    return `
      <div class="card">
        <div class="card-head"><div>
          <div class="card-title">App release</div>
          <div class="card-sub">Powers the "Take Gliimu Everywhere" panel on gliimu.com.</div>
        </div></div>
        <div style="${GRID}">${RELEASE.map(f => this.textField(f)).join('')}</div>
        ${this.assetField(RELEASE_BG)}
        <div class="section-title">Download links</div>
        <div style="${GRID}">${RELEASE_LINKS.map(f => this.linkField(f)).join('')}</div>
        <div class="card-actions" style="margin-left:0;margin-top:6px;">
          <button class="btn-primary btn-small" data-save="release">Save release</button>
        </div>
      </div>`;
  },

  // ============================================
  // Saving
  // ============================================
  collect(fields) {
    const payload = {};
    fields.forEach((f) => {
      const el = this.input(f.key);
      payload[f.param] = el ? el.value.trim() : null;
    });
    return payload;
  },

  async save(which, btn) {
    const fields = which === 'landing'
      ? LANDING
      : [...RELEASE, RELEASE_BG, ...RELEASE_LINKS];
    const rpc = which === 'landing' ? 'operations_set_landing' : 'operations_set_release';

    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const { data, error } = await supabase.rpc(rpc, this.collect(fields));
    if (btn) { btn.disabled = false; btn.textContent = which === 'landing' ? 'Save landing page' : 'Save release'; }

    if (error || !data || data.ok === false) {
      return appAlert(error ? `Could not save that: ${error.message}` : rpcError(data));
    }

    this.settings = data;
    await this.render();
    return appAlert(which === 'landing'
      ? 'Landing page media saved. gliimu.com shows it on the next load.'
      : 'Release saved. The landing page download panel shows it on the next load.');
  },

  // ============================================
  // Uploads
  // ============================================
  async onUpload(key, file) {
    const status = document.querySelector(`[data-status="${key}"]`);
    const input = this.input(key);
    if (!file) return;

    if (status) status.textContent = 'Uploading…';
    try {
      const url = await uploadFile(file, 'site');
      if (input) input.value = url;
      const preview = document.querySelector(`[data-preview="${key}"]`);
      const spec = [...LANDING, RELEASE_BG].find(f => f.key === key);
      if (preview && spec) preview.innerHTML = this.previewHtml(spec, url);
      if (status) status.textContent = 'Uploaded — press Save to publish it.';
    } catch (err) {
      if (status) status.textContent = '';
      await appAlert(err.message || 'That upload failed.');
    }
  },

  // ============================================
  // Partner drawer — one builder for add and edit
  // ============================================
  partnerDrawer(existing) {
    const editing = !!existing;
    const logo = editing ? (existing.logo_url || '') : '';

    const { overlay, close } = openDrawer({
      title: editing ? `Edit ${escapeHtml(existing.name || 'partner')}` : 'Add a partner',
      sub: 'The logo appears in the "Trusted By" section of the landing page.',
      body: `
        <div class="form-group">
          <label for="pt-name">Partner name</label>
          <input type="text" id="pt-name" class="input" maxlength="80" autocomplete="off"
                 value="${escapeHtml(editing ? (existing.name || '') : '')}" placeholder="e.g. Northwind Studios">
        </div>
        <div class="form-group">
          <label for="pt-logo">Logo</label>
          <input type="text" id="pt-logo" class="input" value="${escapeHtml(logo)}"
                 placeholder="https://cdn.gliimu.com/… — optional" autocomplete="off">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;">
            <label class="btn-quiet btn-small" for="pt-file" style="cursor:pointer;">Upload a file</label>
            <input type="file" id="pt-file" accept="image/*" hidden>
            <span class="muted small" id="pt-status"></span>
          </div>
          <div id="pt-preview" style="margin-top:10px;">${logo
            ? `<img class="cover-preview" src="${escapeHtml(logo)}" alt="">`
            : '<span class="muted small">No logo yet.</span>'}</div>
        </div>`,
      foot: `
        <button class="btn-quiet" data-cancel>Cancel</button>
        <button class="btn-primary" id="pt-save">${editing ? 'Save changes' : 'Add partner'}</button>`
    });

    const nameEl = overlay.querySelector('#pt-name');
    const logoEl = overlay.querySelector('#pt-logo');
    const statusEl = overlay.querySelector('#pt-status');
    const previewEl = overlay.querySelector('#pt-preview');
    const saveBtn = overlay.querySelector('#pt-save');
    nameEl.focus();

    overlay.querySelector('[data-cancel]').addEventListener('click', close);

    overlay.querySelector('#pt-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      statusEl.textContent = 'Uploading…';
      try {
        const url = await uploadFile(file, 'site');
        logoEl.value = url;
        previewEl.innerHTML = `<img class="cover-preview" src="${escapeHtml(url)}" alt="">`;
        statusEl.textContent = '';
      } catch (err) {
        statusEl.textContent = '';
        await appAlert(err.message || 'That upload failed.');
      }
    });

    saveBtn.addEventListener('click', async () => {
      const name = nameEl.value.trim();
      if (name.length < 2) return appAlert('Give the partner a name of at least 2 characters.');

      const params = { p_name: name, p_logo_url: logoEl.value.trim() };
      saveBtn.disabled = true;

      const call = editing
        ? supabase.rpc('operations_update_partner', { p_id: existing.id, ...params })
        : supabase.rpc('operations_add_partner', params);
      const { data, error } = await call;

      saveBtn.disabled = false;
      if (error || !data || data.ok === false) {
        return appAlert(error ? `Could not save that partner: ${error.message}` : rpcError(data));
      }

      close();
      this.partners = null;
      await this.render();
    });

    nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });
  },

  async setOrder(id, value) {
    const order = parseInt(value, 10);
    if (!Number.isFinite(order) || order < 0 || order > 999) {
      await appAlert('The position must be a whole number from 0 to 999.');
      return this.render();
    }

    const { data, error } = await supabase.rpc('operations_set_partner_order', { p_id: id, p_order: order });
    if (error || !data || data.ok === false) {
      await appAlert(error ? `Could not move that partner: ${error.message}` : rpcError(data));
    }
    this.partners = null;
    await this.render();
  },

  async removePartner(id, name) {
    const ok = await appConfirm(
      `${name} comes off the "Trusted By" wall immediately.`,
      { title: 'Remove partner', okText: 'Remove', danger: true });
    if (!ok) return;

    const { data, error } = await supabase.rpc('operations_remove_partner', { p_id: id });
    if (error || !data || data.ok === false) {
      await appAlert(error ? `Could not remove that partner: ${error.message}` : rpcError(data));
    }
    this.partners = null;
    await this.render();
  },

  // ============================================
  // Wiring
  // ============================================
  wire(pane) {
    pane.querySelectorAll('[data-save]').forEach((btn) => {
      btn.addEventListener('click', () => this.save(btn.dataset.save, btn));
    });

    pane.querySelectorAll('[data-upload]').forEach((fileInput) => {
      fileInput.addEventListener('change', (e) => {
        this.onUpload(fileInput.dataset.upload, e.target.files[0]);
        fileInput.value = '';
      });
    });

    pane.querySelectorAll('[data-clear]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.clear;
        const input = this.input(key);
        if (input) input.value = '';
        const preview = document.querySelector(`[data-preview="${key}"]`);
        if (preview) preview.innerHTML = '<span class="muted small">Nothing set.</span>';
        const status = document.querySelector(`[data-status="${key}"]`);
        if (status) status.textContent = 'Cleared — press Save to publish it.';
      });
    });

    const add = pane.querySelector('[data-add-partner]');
    if (add) add.addEventListener('click', () => this.partnerDrawer(null));

    pane.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = (this.partners || []).find(p => p.id === btn.dataset.edit);
        if (row) this.partnerDrawer(row);
      });
    });

    pane.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => this.removePartner(btn.dataset.remove, btn.dataset.name));
    });

    pane.querySelectorAll('[data-order]').forEach((input) => {
      input.addEventListener('change', () => {
        const row = input.closest('[data-partner]');
        if (row) this.setOrder(row.dataset.partner, input.value);
      });
    });
  }
};
