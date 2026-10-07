// Promise-based alert/confirm against the single #dialog-overlay in index.html.
// Native dialogs are avoided so the admin app matches the member app's look.

let resolver = null;

function close(result) {
  const overlay = document.getElementById('dialog-overlay');
  if (overlay) overlay.hidden = true;
  document.removeEventListener('keydown', onKey);
  const done = resolver;
  resolver = null;
  if (done) done(result);
}

function onKey(e) {
  if (e.key === 'Escape') close(false);
  if (e.key === 'Enter' && resolver) close(true);
}

function open(title, body, { okText = 'OK', cancelText = 'Cancel', danger = false, confirm = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('dialog-overlay');
    if (!overlay) return resolve(true);

    resolver = resolve;
    document.getElementById('dialog-title').textContent = title || '';
    document.getElementById('dialog-body').textContent = body || '';

    const cancelBtn = document.getElementById('dialog-cancel');
    const okBtn = document.getElementById('dialog-ok');
    cancelBtn.hidden = !confirm;
    cancelBtn.textContent = cancelText;
    okBtn.textContent = okText;
    okBtn.classList.toggle('danger', danger);

    okBtn.onclick = () => close(true);
    cancelBtn.onclick = () => close(false);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };

    overlay.hidden = false;
    document.addEventListener('keydown', onKey);
    okBtn.focus();
  });
}

export const appAlert = (body, opts = {}) => open(opts.title || 'Notice', body, { ...opts, confirm: false });
export const appConfirm = (body, opts = {}) => open(opts.title || 'Are you sure?', body, { ...opts, confirm: true });
