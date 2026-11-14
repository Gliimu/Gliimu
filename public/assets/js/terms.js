import { supabase } from '/shared/js/config.js?v=2';

// ============================================
// The terms document (from legal_documents)
// ============================================
// The content column is either a URL to an uploaded .docx or inline HTML from
// before the file upload existed. A .docx is converted by mammoth; anything
// else that is not HTML shows a download link. This is the only renderer — the
// sign-in page links here rather than keeping a copy of its own.
const container = document.getElementById('terms-content-container');
const updatedEl = document.getElementById('terms-updated');

const safe = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

async function loadTerms() {
  const { data, error } = await supabase
    .from('legal_documents')
    .select('content, updated_at')
    .eq('type', 'terms')
    .single();

  if (error || !data || !data.content) {
    container.innerHTML = '<p class="terms-note">The terms of service are unavailable right now. Please reload this page before continuing.</p>';
    if (updatedEl) updatedEl.textContent = '';
    return;
  }

  // The stored document opens with a hand-typed "Last Updated" line, and this
  // page prints the row's own updated_at above it. Two dates, one of them
  // stale, so the copy inside the body is dropped and the real timestamp stays
  // the single source of truth.
  const hasDateLine = !!updatedEl && !!data.updated_at;
  if (hasDateLine) {
    updatedEl.textContent = 'Last Updated: ' + new Date(data.updated_at)
      .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  const dropDateLine = () => {
    if (!hasDateLine) return;
    const first = container.firstElementChild;
    if (first && /^last updated/i.test(first.textContent.trim())) first.remove();
  };

  const raw = data.content.trim();
  const isUrl = /^https?:\/\//.test(raw);

  if (isUrl && /\.docx(\?|$)/i.test(raw)) {
    try {
      const resp = await fetch(raw);
      const buf = await resp.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer: buf });
      container.innerHTML = result.value || '<p class="terms-note">The document is empty.</p>';
      dropDateLine();
    } catch (err) {
      container.innerHTML = `<p>Could not load the terms document.</p>
        <p><a href="${safe(raw)}" target="_blank" rel="noopener" class="link-muted">Download the document instead</a></p>`;
    }
    return;
  }

  if (isUrl) {
    const name = raw.split('/').pop() || 'document';
    container.innerHTML = `<p>The terms are stored as a file.</p>
      <p><a href="${safe(raw)}" download rel="noopener" class="link-muted">Download ${safe(name)}</a></p>`;
    return;
  }

  container.innerHTML = data.content;
  dropDateLine();
}
loadTerms();

// The arrow is the only way out of a page, so it has to be honest about where
// it leads: back to the visitor's own previous page when the product contains
// it, home when they arrived on this URL directly.
const back = document.getElementById('terms-back');
back.addEventListener('click', (e) => {
  let origin = '';
  try { origin = new URL(document.referrer).origin; } catch (err) {}
  if (origin === window.location.origin && window.history.length > 1) {
    e.preventDefault();
    window.history.back();
  }
});
