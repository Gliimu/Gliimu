import { supabase, API_BASE_URL } from '../config.js';
import { escapeHtml, empty, rpcError } from '../ui.js?v=2';
import { appAlert, appConfirm } from '../dialog.js';
import { uploadFile } from '../upload.js';

const TABS = [
  { id: 'landing', label: 'Landing page' },
  { id: 'release', label: 'App release' },
  { id: 'cohorts', label: 'Cohorts' },
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
  { key: 'hero_video_url', param: 'p_hero_video_url', label: 'Hero explainer video', asset: true, video: true,
    note: 'The film visitors play from the hero on gliimu.com — one click, sound on, open to anyone signed in or not. Blank means no film and no play button.' },
  { key: 'hero_fallback_image_url', param: 'p_hero_fallback_image_url', label: 'Hero background image', asset: true,
    note: 'The still behind the hero words. Shows when there is no film, and around it on wide screens.' }
];

// The hero headline and paragraph. index.html ships the hero with no words of
// its own, so a blank here means a blank headline there.
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
  label: 'Auth page background', asset: true,
  note: 'Background image behind the sign-in and sign-up page.' };

// The five platform files are the builds themselves: Operations uploads one
// and the column stores its R2 URL. Nothing on gliimu.com points at them yet,
// because the desktop app is not packaged — but the storage is set up for it.
// A pasted link still works, which is the only way iOS can ever behave.
const RELEASE_FILES = [
  { key: 'app_windows_url', param: 'p_app_windows_url', label: 'Windows file', file: true,
    accept: '.exe,.msi,.zip', note: 'The .exe or .msi members download.' },
  { key: 'app_mac_url', param: 'p_app_mac_url', label: 'macOS file', file: true,
    accept: '.dmg,.pkg,.zip', note: 'A .dmg or .pkg. An unsigned build needs a right-click → Open the first time.' },
  { key: 'app_linux_url', param: 'p_app_linux_url', label: 'Linux file', file: true,
    accept: '.appimage,.deb,.rpm,.zip,.tar.gz', note: 'An .AppImage, .deb or .rpm.' },
  { key: 'app_android_url', param: 'p_app_android_url', label: 'Android file', file: true,
    accept: '.apk,.aab,.zip', note: 'The signed .apk.' },
  { key: 'app_ios_url', param: 'p_app_ios_url', label: 'iOS file or link', file: true,
    accept: '.ipa,.zip',
    note: 'iPhones will not install a downloaded file, so this is normally an App Store or TestFlight link.' }
];

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
    this.deleted = null;
    this.cohortState = null;

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

    pane.innerHTML = this.tab === 'release' ? this.releaseHtml()
      : this.tab === 'cohorts' ? this.cohortsHtml()
      : this.tab === 'deleted' ? this.deletedHtml()
      : this.landingHtml();
    this.wire(pane);
  },

  // The tabs read different tables, so a failure on one side still lets
  // the other render instead of blanking the whole screen.
  async fetch() {
    if (this.tab === 'deleted') {
      const { data, error } = await supabase.rpc('admin_list_deleted_gliims', {
        p_limit: 200, p_offset: 0
      });
      if (error) return error.message;
      if (!data || data.ok === false) return rpcError(data);
      this.deleted = { count: Number(data.count || 0), items: data.items || [] };
      return null;
    }

    if (this.tab === 'cohorts') {
      if (this.cohortState) return null;
      const { data, error } = await supabase.rpc('operations_cohort_state');
      if (error) return error.message;
      if (!data || data.ok === false) return rpcError(data);
      this.cohortState = data;
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
        <div class="card-sub">Over the film. Blank means no word appears there.</div>
        <div style="${GRID}">${HERO_TEXTS.map(f => this.textField(f)).join('')}</div>
        <div class="section-title">Hero media</div>
        ${LANDING.map(f => this.assetField(f)).join('')}
        <div class="card-actions" style="margin-left:0;margin-top:6px;">
          <button class="btn-primary btn-small" data-save="landing">Save landing page</button>
        </div>
      </div>`;
  },

  // ============================================
  // TAB 2 — the app release
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
        <div class="card-actions" style="margin-left:0;margin-top:6px;">
          <button class="btn-primary btn-small" data-save="release">Save release</button>
        </div>
      </div>`;
  },

  // ============================================
  // TAB 3 — the Trash Operations must finalise
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
  // TAB 5 — the co-hort drive
  // ============================================
  cohortsHtml() {
    const state = this.cohortState || {};
    const active = state.active;
    const past = state.past || [];

    if (!active) {
      return `
        <div class="card">
          <div class="card-head"><div>
            <div class="card-title">Start a co-hort</div>
            <div class="card-sub">One co-hort runs at a time. Starting one puts a strip over the XpLoRe filter tabs reading "0/9 {title}"; members tap it to raise their hand through Support, and you accept them here.</div>
          </div></div>
          <div class="form-group">
            <label for="in-cohort-title">Cohort title</label>
            <input type="text" id="in-cohort-title" class="input" maxlength="120" autocomplete="off"
                   placeholder="e.g. Full Stack Media Architecture">
          </div>
          <div class="form-group">
            <label for="in-cohort-count">Members to accept</label>
            <input type="number" id="in-cohort-count" class="input" min="1" max="999" step="1" value="9">
            <div class="card-sub">The strip counts every hand raised against this total.</div>
          </div>
          <div class="form-group">
            <label for="in-cohort-due">Deadline (optional)</label>
            <input type="date" id="in-cohort-due" class="input">
            <div class="card-sub">Appears in the acceptance message: "finalize the process before this date".</div>
          </div>
          <div class="form-group">
            <label for="in-cohort-url">Requirements PDF (optional)</label>
            <input type="text" id="in-cohort-url" class="input" placeholder="https://cdn.gliimu.com/…" autocomplete="off">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;">
              <label class="btn-quiet btn-small" for="up-cohort-req" style="cursor:pointer;">Upload a PDF</label>
              <input type="file" id="up-cohort-req" accept=".pdf,application/pdf" hidden data-cohort-upload>
              <span class="muted small" id="cohort-upload-status"></span>
            </div>
            <div class="card-sub">Accepted members get a "View more" chip on their Alerts card that opens this file. Leave blank to skip it.</div>
          </div>
          <div class="card-actions" style="margin-left:0;margin-top:6px;">
            <button class="btn-primary btn-small" data-start-cohort>Start cohort</button>
          </div>
        </div>
        ${this.pastHtml(past)}`;
    }

    const members = active.members || [];
    const stripOn = active.strip_visible !== false;
    const rows = members.map(m => `
      <tr data-cohort-member="${escapeHtml(m.user_id)}">
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            ${m.avatar_url
              ? `<img src="${escapeHtml(m.avatar_url)}" alt="" style="width:30px;height:30px;border-radius:50%;object-fit:cover;background:var(--bg-tertiary);">`
              : '<span style="width:30px;height:30px;border-radius:50%;background:var(--bg-tertiary);display:inline-block;"></span>'}
            <span style="font-weight:600;">${escapeHtml(m.full_name || '')}</span>
          </div>
        </td>
        <td>${escapeHtml(new Date(m.joined_at).toLocaleString())}</td>
        <td>${m.status === 'approved' ? '<span class="badge badge-success">Accepted</span>'
          : m.status === 'declined' ? '<span class="badge badge-error">Declined</span>'
          : '<span class="badge badge-warning">Waiting</span>'}</td>
        <td class="num" style="white-space:nowrap;">
          ${m.status !== 'approved' ? `<button class="btn-primary btn-small" data-approve="${escapeHtml(m.user_id)}" data-name="${escapeHtml(m.full_name || 'this member')}">Accept</button>` : ''}
          ${m.status === 'interested' ? `<button class="btn-quiet btn-small" data-decline="${escapeHtml(m.user_id)}" data-name="${escapeHtml(m.full_name || 'this member')}">Decline</button>` : ''}
        </td>
      </tr>`).join('');
    const raised = Number(active.interested_count || 0);
    const due = active.due_date
      ? ` Requirements are due ${escapeHtml(new Date(`${active.due_date}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }))}.`
      : '';

    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">${escapeHtml(active.title)}</div>
            <div class="card-sub">Started ${escapeHtml(new Date(active.created_at).toLocaleDateString())}.${due} ${raised} member${raised === 1 ? ' has' : 's have'} raised a hand so far.</div>
          </div>
          <div class="card-actions">
            <span class="badge badge-success">${Number(active.approved_count || 0)}/${Number(active.required_count || 0)} accepted</span>
            <button class="btn-danger btn-small" data-end-cohort="${escapeHtml(active.id)}" data-title="${escapeHtml(active.title)}">End cohort</button>
          </div>
        </div>
        ${active.requirements_url ? `<div class="card-sub" style="margin-bottom:10px;">Requirements: <a href="${escapeHtml(active.requirements_url)}" target="_blank" rel="noopener">open the PDF</a></div>` : ''}
        <div class="card" style="margin-top:16px;">
          <div class="card-head"><div>
            <div class="card-title">XpLoRe strip</div>
            <div class="card-sub">Members tap the strip under the XpLoRe tabs to raise a hand. Hide it without ending the cohort, or give the strip its own wording.</div>
          </div></div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
            <button class="${stripOn ? 'btn-quiet btn-small' : 'btn-primary btn-small'}" data-strip-toggle="${stripOn ? 'hide' : 'show'}">${stripOn ? 'Hide strip' : 'Show strip'}</button>
            <span class="muted small">${stripOn ? 'Visible on XpLoRe' : 'Hidden from members'}</span>
          </div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <input type="text" id="in-strip-label" class="input" maxlength="120" autocomplete="off"
                   style="max-width:420px;" placeholder="Leave blank to use the cohort title"
                   value="${escapeHtml(active.strip_label || '')}">
            <button class="btn-primary btn-small" data-strip-save data-strip-visible="${stripOn}">Save strip text</button>
          </div>
        </div>
        ${members.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Member</th><th>Raised hand</th><th>Status</th><th class="num" style="width:190px;"></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>` : empty('No one has tapped the strip yet.')}
      </div>
      ${this.pastHtml(past)}`;
  },

  pastHtml(past) {
    if (!past.length) return '';
    return `
      <div class="card" style="margin-top:16px;">
        <div class="card-head"><div>
          <div class="card-title">Past cohorts</div>
          <div class="card-sub">The last ten that ended, newest first.</div>
        </div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Cohort</th><th class="num">To accept</th><th class="num">Hands raised</th><th class="num">Accepted</th><th>Ended</th></tr></thead>
          <tbody>${past.map(c => `
            <tr>
              <td style="font-weight:600;">${escapeHtml(c.title || '')}</td>
              <td class="num">${Number(c.required_count || 0)}</td>
              <td class="num">${Number(c.interested_count || 0)}</td>
              <td class="num">${Number(c.approved_count || 0)}</td>
              <td>${escapeHtml(new Date(c.ended_at).toLocaleDateString())}</td>
            </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
  },

  async startCohort(btn) {
    const title = document.getElementById('in-cohort-title')?.value.trim() || '';
    const count = Number(document.getElementById('in-cohort-count')?.value || 0);
    const url = document.getElementById('in-cohort-url')?.value.trim() || null;
    const due = document.getElementById('in-cohort-due')?.value || null;
    if (!title) return appAlert('Give the cohort a title — the strip on XpLoRe shows it.');
    if (!Number.isInteger(count) || count < 1 || count > 999) {
      return appAlert('Members to accept must be a whole number between 1 and 999.');
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Starting…'; }
    const { data, error } = await supabase.rpc('operations_start_cohort', {
      p_title: title, p_required_count: count, p_requirements_url: url, p_due_date: due
    });
    if (btn) { btn.disabled = false; btn.textContent = 'Start cohort'; }
    if (error) return appAlert(`Could not start it: ${error.message}`);
    if (!data || data.ok === false) return appAlert(rpcError(data));

    this.cohortState = null;
    await this.render();
    return appAlert('The cohort is live — members see the strip over the XpLoRe filter tabs.');
  },

  async decideCohortMember(cohortId, userId, name, decision) {
    if (decision === 'decline') {
      const ok = await appConfirm(
        `${name} keeps their hand raised but will not be accepted into the cohort.`,
        { title: 'Decline this member?', okText: 'Decline' });
      if (!ok) return;
    }
    const { data, error } = await supabase.rpc('operations_decide_cohort_member', {
      p_cohort: cohortId, p_user: userId, p_decision: decision
    });
    if (error) return appAlert(`Could not save that: ${error.message}`);
    if (!data || data.ok === false) return appAlert(rpcError(data));

    this.cohortState = null;
    await this.render();
    if (decision === 'approve') {
      return appAlert(`${name} accepted — the congratulation notice is on its way to their Alerts.`);
    }
  },

  async endCohort(id, title) {
    const ok = await appConfirm(
      `"${title}" closes: the strip comes off XpLoRe and no new hands can be raised. Members already accepted keep their place.`,
      { title: 'End this cohort?', okText: 'End cohort' });
    if (!ok) return;
    const { data, error } = await supabase.rpc('operations_end_cohort', { p_id: id });
    if (error) return appAlert(`Could not end it: ${error.message}`);
    if (!data || data.ok === false) return appAlert(rpcError(data));

    this.cohortState = null;
    await this.render();
  },

  async setCohortStrip(btn, visible) {
    const label = (document.getElementById('in-strip-label')?.value || '').trim() || null;
    if (btn) { btn.disabled = true; }
    const { data, error } = await supabase.rpc('operations_set_cohort_strip', { p_visible: visible, p_label: label });
    if (btn) { btn.disabled = false; }
    if (error) return appAlert(`Could not save the strip: ${error.message}`);
    if (!data || data.ok === false) {
      const codes = {
        NOT_OPERATIONS: 'Only operations (or super) admins manage the strip.',
        COHORT_CLOSED: 'No active cohort — start one first.',
        BAD_LABEL: 'Strip text is too long (120 characters max).',
        BAD_VISIBLE: 'Pick show or hide.'
      };
      return appAlert(codes[data?.code] || rpcError(data));
    }

    this.cohortState = null;
    await this.render();
    if (btn?.dataset.stripToggle !== undefined) {
      return appAlert(visible ? 'The XpLoRe strip is back on for members.' : 'The XpLoRe strip is now hidden from members.');
    }
    return appAlert('Strip text saved — XpLoRe shows it under the filter tabs now.');
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
      : [...RELEASE, RELEASE_BG, ...RELEASE_FILES];
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

    pane.querySelectorAll('[data-restore]').forEach((btn) => {
      btn.addEventListener('click', () => this.restoreDeleted(btn.dataset.restore, btn.dataset.title));
    });

    pane.querySelectorAll('[data-purge]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.purgeNow(btn.dataset.purge, btn.dataset.title, btn.dataset.author);
      });
    });

    pane.querySelectorAll('[data-cohort-upload]').forEach((fileInput) => {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        fileInput.value = '';
        const status = document.getElementById('cohort-upload-status');
        if (!file) return;
        if (status) status.textContent = 'Uploading…';
        try {
          const url = await uploadFile(file, 'site');
          const input = document.getElementById('in-cohort-url');
          if (input) input.value = url;
          if (status) status.textContent = 'Uploaded — press Start cohort to publish it.';
        } catch (err) {
          if (status) status.textContent = '';
          await appAlert(err.message || 'That upload failed.');
        }
      });
    });

    const startCohortBtn = pane.querySelector('[data-start-cohort]');
    if (startCohortBtn) startCohortBtn.addEventListener('click', () => this.startCohort(startCohortBtn));

    const activeCohortId = () => this.cohortState?.active?.id || null;

    pane.querySelectorAll('[data-approve]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cohortId = activeCohortId();
        if (cohortId) this.decideCohortMember(cohortId, btn.dataset.approve, btn.dataset.name, 'approve');
      });
    });

    pane.querySelectorAll('[data-decline]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cohortId = activeCohortId();
        if (cohortId) this.decideCohortMember(cohortId, btn.dataset.decline, btn.dataset.name, 'decline');
      });
    });

    const endCohortBtn = pane.querySelector('[data-end-cohort]');
    if (endCohortBtn) endCohortBtn.addEventListener('click', () => this.endCohort(endCohortBtn.dataset.endCohort, endCohortBtn.dataset.title));

    pane.querySelectorAll('[data-strip-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => this.setCohortStrip(btn, btn.dataset.stripToggle === 'show'));
    });
    const stripSaveBtn = pane.querySelector('[data-strip-save]');
    if (stripSaveBtn) stripSaveBtn.addEventListener('click', () => this.setCohortStrip(stripSaveBtn, stripSaveBtn.dataset.stripVisible !== 'false'));

    const sweep = pane.querySelector('[data-sweep]');
    if (sweep) sweep.addEventListener('click', () => this.sweepStorage(sweep));
  }
};
