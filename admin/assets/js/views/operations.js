import { supabase, API_BASE_URL } from '../config.js';
import { escapeHtml, empty, rpcError, openDrawer } from '../ui.js?v=2';
import { appAlert, appConfirm } from '../dialog.js';
import { uploadFile } from '../upload.js';

const TABS = [
  { id: 'landing', label: 'Landing page' },
  { id: 'partners', label: 'Partners' },
  { id: 'release', label: 'App release' },
  { id: 'deleted', label: 'Deleted' }
];

// Days an author gets to change their mind before the nightly sweep runs.
const TRASH_WINDOW = 30;

// gliim_restore answers with a machine code instead of a message.
function trashCode(data) {
  const code = data && data.code;
  if (code === 'NOT_FOUND') return 'That Gliim no longer exists.';
  if (code === 'NOT_IN_TRASH') return 'It is not in the Trash any more.';
  if (code === 'TOO_LATE') return 'The 30 days are over, so it can no longer be restored.';
  if (code === 'STAFF_ONLY') return 'Only the person who moved it here can put it back.';
  return 'That did not work. Please try again.';
}

// Every field below is one column of site_settings. The RPCs take null to
// mean "leave this column alone" and an empty string to mean "clear it", so
// each screen always sends the fields it actually shows.
const LANDING = [
  { key: 'hero_video_url', param: 'p_hero_video_url', label: 'Hero video', asset: true, video: true,
    note: 'Plays behind the headline on gliimu.com.' },
  { key: 'hero_fallback_image_url', param: 'p_hero_fallback_image_url', label: 'Hero fallback image', asset: true,
    note: 'Shown behind the headline while the video loads, or where autoplay is blocked.' }
];

// The hero headline and paragraph. Blank on all three keeps the copy that
// ships in public/index.html, so a fresh install reads exactly as before.
const HERO_TEXTS = [
  { key: 'hero_title', param: 'p_hero_title', label: 'Headline lead-in', maxlength: 120,
    placeholder: 'We are',
    note: 'The words before the highlighted phrase of the hero headline.' },
  { key: 'hero_highlight', param: 'p_hero_highlight', label: 'Highlighted phrase', maxlength: 120,
    placeholder: 'Full Stack Media Architects',
    note: 'The coloured part of the hero headline.' },
  { key: 'hero_desc', param: 'p_hero_desc', label: 'Hero description', textarea: true, maxlength: 400,
    placeholder: 'Become a Full Stack Media Architect.\nGet real-life experience and build a portfolio that speaks for itself.',
    note: 'Each line break becomes a line on the landing page.' }
];

const RELEASE = [
  { key: 'app_version', param: 'p_app_version', label: 'Latest version', placeholder: '1.4.0', maxlength: 40,
    note: 'Printed on the landing page download panel.' },
  { key: 'app_version_notes', param: 'p_app_version_notes', label: 'Release notes', textarea: true, maxlength: 2000,
    placeholder: 'What changed in this release?' }
];

const RELEASE_BG = { key: 'app_download_bg_url', param: 'p_app_download_bg_url',
  label: 'App download & auth page background', asset: true,
  note: 'Background image behind the download panel on gliimu.com and the auth page.' };

// The five platform files are what the landing page's download buttons point
// at: Operations uploads the build itself and the column stores its R2 URL.
// A pasted link still works, which is the only way iOS can ever behave.
const RELEASE_FILES = [
  { key: 'app_windows_url', param: 'p_app_windows_url', label: 'Windows file', file: true,
    accept: '.exe,.msi,.zip', note: 'The .exe or .msi members download.' },
  { key: 'app_mac_url', param: 'p_app_mac_url', label: 'macOS file', file: true,
    accept: '.dmg,.pkg,.zip', note: 'A .dmg or .pkg. An unsigned build needs a right-click → Open the first time.' },
  { key: 'app_linux_url', param: 'p_app_linux_url', label: 'Linux file', file: true,
    accept: '.appimage,.deb,.rpm,.zip,.tar.gz', note: 'An .AppImage, .deb or .rpm.' },
  { key: 'app_android_url', param: 'p_app_android_url', label: 'Android file', file: true,
    accept: '.apk,.aab,.zip', note: 'The signed .apk. The desktop QR encodes this file by default.' },
  { key: 'app_ios_url', param: 'p_app_ios_url', label: 'iOS file or link', file: true,
    accept: '.ipa,.zip',
    note: 'iPhones will not install a downloaded file, so this is normally an App Store or TestFlight link.' }
];

const QR_LINK = { key: 'app_mobile_qr_url', param: 'p_app_mobile_qr_url', label: 'Desktop QR link',
  note: 'Leave blank to encode the Android file, or iOS if there is no Android file.' };

const GRID = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0 16px;';

// Where root-relative site_settings values actually resolve.
const SITE_ORIGIN = 'https://www.gliimu.com';

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
    this.deleted = null;

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
      : this.tab === 'deleted' ? this.deletedHtml()
      : this.landingHtml();
    this.wire(pane);
  },

  // The tabs read different tables, so a failure on one side still lets
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

    if (this.tab === 'deleted') {
      const { data, error } = await supabase.rpc('admin_list_deleted_gliims', {
        p_limit: 200, p_offset: 0
      });
      if (error) return error.message;
      if (!data || data.ok === false) return rpcError(data);
      this.deleted = { count: Number(data.count || 0), items: data.items || [] };
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
    this.deleted = null;
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
    const accept = f.accept || (f.video ? 'video/*' : 'image/*');
    const placeholder = f.file
      ? 'Upload the file below, or paste a link — blank switches it off'
      : 'https://cdn.gliimu.com/… — leave blank to remove it';
    return `
      <div class="form-group">
        <label for="in-${f.key}">${escapeHtml(f.label)}</label>
        <input type="text" id="in-${f.key}" class="input" data-key="${f.key}" value="${escapeHtml(this.value(f.key))}"
               placeholder="${escapeHtml(placeholder)}" autocomplete="off">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;">
          <label class="btn-quiet btn-small" for="up-${f.key}" style="cursor:pointer;">${f.file ? 'Upload a build' : 'Upload a file'}</label>
          <input type="file" id="up-${f.key}" accept="${escapeHtml(accept)}" hidden data-upload="${f.key}">
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
    // Root-relative values live on the member site, not on this admin origin,
    // so a bare "/videos/x.mp4" would preview as a 404 here.
    const href = escapeHtml(url.charAt(0) === '/' ? SITE_ORIGIN + url : url);
    if (f.file) {
      return `<div class="file-chip"><span class="mono">${escapeHtml(url.split('/').pop() || safe)}</span>
        <a href="${href}" download rel="noopener">Download</a></div>`;
    }
    if (f.video) {
      return `<div class="file-chip"><span class="mono">${safe}</span><a href="${href}" target="_blank" rel="noopener">Open</a></div>`;
    }
    return `<img class="cover-preview" src="${href}" alt="">`;
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
        <div class="section-title">Hero texts</div>
        <div class="card-sub">Leave all three blank to keep the copy that ships with the site.</div>
        <div style="${GRID}">${HERO_TEXTS.map(f => this.textField(f)).join('')}</div>
        <div class="section-title">Hero and squad media</div>
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
        <div class="section-title">App files</div>
        <div class="card-sub">Upload each build once and its button on gliimu.com downloads that file. A platform with nothing uploaded shows a switched-off button.</div>
        <div style="${GRID}">${RELEASE_FILES.map(f => this.assetField(f)).join('')}</div>
        <div class="section-title">QR code</div>
        ${this.linkField(QR_LINK)}
        <div class="card-actions" style="margin-left:0;margin-top:6px;">
          <button class="btn-primary btn-small" data-save="release">Save release</button>
        </div>
      </div>`;
  },

  // ============================================
  // TAB 4 — the Trash Operations must finalise
  // ============================================
  deletedHtml() {
    const queue = this.deleted || { count: 0, items: [] };
    const rows = queue.items;
    const hidden = queue.count - rows.length;

    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Deleted Gliims</div>
            <div class="card-sub">Every Gliim here is already hidden from members. It is destroyed automatically ${TRASH_WINDOW} days after it was trashed, unless you restore it first.${hidden > 0 ? ` Showing the newest ${rows.length} of ${queue.count}.` : ''}</div>
          </div>
          <div class="card-actions">
            <button class="btn-quiet btn-small" data-sweep>Clean up storage</button>
          </div>
        </div>
        ${rows.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th style="width:64px;">Cover</th><th>Gliim</th><th>Author</th><th>Trashed</th><th class="num" style="width:120px;">Days left</th><th class="num" style="width:250px;"></th></tr></thead>
            <tbody>${rows.map(g => `
              <tr data-deleted="${escapeHtml(g.id)}">
                <td>${g.cover_url
                  ? `<img src="${escapeHtml(g.cover_url)}" alt="" style="width:52px;height:38px;object-fit:cover;border-radius:6px;background:var(--bg-tertiary);">`
                  : '<span class="muted small">none</span>'}</td>
                <td>
                  <div style="font-weight:600;">${escapeHtml(g.title || '')}</div>
                  ${g.deleted_reason ? `<div class="card-sub">Reason: ${escapeHtml(g.deleted_reason)}</div>` : ''}
                </td>
                <td>${escapeHtml(g.author_name || '')}</td>
                <td>
                  <div>${escapeHtml(new Date(g.deleted_at).toLocaleString())}</div>
                  <div class="card-sub">By ${escapeHtml(g.deleted_by_name || '')}</div>
                </td>
                <td class="num">${Number(g.days_left) > 0
                  ? `<span class="badge badge-warning">${Number(g.days_left)} day${Number(g.days_left) === 1 ? '' : 's'}</span>`
                  : '<span class="badge badge-error">Window over</span>'}</td>
                <td class="num" style="white-space:nowrap;">
                  ${Number(g.days_left) > 0 ? `<button class="btn-quiet btn-small" data-restore="${escapeHtml(g.id)}" data-title="${escapeHtml(g.title || '')}">Restore</button>` : ''}
                  <button class="btn-danger btn-small" data-purge="${escapeHtml(g.id)}" data-title="${escapeHtml(g.title || '')}" data-author="${escapeHtml(g.author_name || '')}">Delete permanently</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : empty('Nothing is waiting to be deleted.')}
      </div>`;
  },

  async restoreDeleted(id, title) {
    const ok = await appConfirm(
      `"${title}" goes back exactly where the member left it, media included.`,
      { title: 'Restore this Gliim?', okText: 'Restore' });
    if (!ok) return;

    const { data, error } = await supabase.rpc('gliim_restore', { p_post: id });
    if (error || !data || data.ok !== true) {
      return appAlert(error ? `Could not restore it: ${error.message}` : trashCode(data));
    }
    await this.render();
  },

  // Hard deletion lives on the API because Postgres cannot reach R2 — the
  // server deletes the objects and the row together.
  async purgeNow(id, title, author) {
    const ok = await appConfirm(
      `"${title}" is destroyed for good, along with its pictures, comments and reports. ${author} is told it happened. This cannot be undone.`,
      { title: 'Delete permanently', okText: 'Delete permanently', danger: true });
    if (!ok) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return appAlert('Session expired. Please sign in again.');

    const btn = document.querySelector(`[data-purge="${id}"]`);
    if (btn) btn.disabled = true;

    try {
      const res = await fetch(`${API_BASE_URL}/api/content/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.deleted) {
        if (btn) btn.disabled = false;
        return appAlert(result.error || 'That deletion did not go through. Please try again.');
      }
    } catch (err) {
      if (btn) btn.disabled = false;
      return appAlert(`That deletion did not go through: ${err.message}`);
    }

    await this.render();
  },

  // Orphans are files no row points at any more: what the 30-day sweep leaves
  // behind, plus uploads people abandoned. Counted first, then deleted.
  async sweepStorage(btn) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return appAlert('Session expired. Please sign in again.');

    const call = (dryRun) => fetch(`${API_BASE_URL}/api/r2-sweep`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ dryRun })
    }).then(async (res) => {
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error === 'R2_NOT_CONFIGURED' || json.ok === false) {
        throw new Error(json.error || 'The storage scan failed.');
      }
      return json;
    });

    if (btn) { btn.disabled = true; btn.textContent = 'Checking storage…'; }
    let scan;
    try {
      scan = await call(true);
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Clean up storage'; }
      return appAlert(err.message);
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Clean up storage'; }

    if (!scan.orphans) {
      return appAlert(`Nothing to clean. ${scan.totalR2Files} files in storage, every one of them in use.`);
    }

    const ok = await appConfirm(
      `${scan.orphans} file${scan.orphans === 1 ? '' : 's'} in storage belong to no Gliim, profile or setting. Deleting them frees the space and cannot be undone.`,
      { title: 'Clean up storage', okText: `Delete ${scan.orphans} file${scan.orphans === 1 ? '' : 's'}`, danger: true });
    if (!ok) return;

    if (btn) { btn.disabled = true; btn.textContent = 'Cleaning up…'; }
    try {
      const done = await call(false);
      await appAlert(`${done.deleted} file${done.deleted === 1 ? '' : 's'} deleted${done.failed ? `, ${done.failed} failed` : ''}.`);
    } catch (err) {
      await appAlert(err.message);
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Clean up storage'; }
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
      ? [...HERO_TEXTS, ...LANDING]
      : [...RELEASE, RELEASE_BG, ...RELEASE_FILES, QR_LINK];
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

    const spec = [...LANDING, RELEASE_BG, ...RELEASE_FILES].find(f => f.key === key);
    const isBuild = !!(spec && spec.file);
    if (status) status.textContent = isBuild
      ? `Uploading ${Math.max(1, Math.round(file.size / (1024 * 1024)))}MB… this can take a while.`
      : 'Uploading…';

    try {
      // Builds go to R2's app_builds/ prefix, which only accepts installers.
      const url = await uploadFile(file, isBuild ? 'app' : 'site');
      if (input) input.value = url;
      const preview = document.querySelector(`[data-preview="${key}"]`);
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

    pane.querySelectorAll('[data-restore]').forEach((btn) => {
      btn.addEventListener('click', () => this.restoreDeleted(btn.dataset.restore, btn.dataset.title));
    });

    pane.querySelectorAll('[data-purge]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.purgeNow(btn.dataset.purge, btn.dataset.title, btn.dataset.author);
      });
    });

    const sweep = pane.querySelector('[data-sweep]');
    if (sweep) sweep.addEventListener('click', () => this.sweepStorage(sweep));
  }
};
