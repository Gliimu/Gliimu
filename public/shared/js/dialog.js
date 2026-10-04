/*
 * Gliimu dialog primitive.
 *
 * Native alert/confirm/prompt are rendered by the host webview and titled after
 * the page origin ("http://tauri.localhost says" in the packaged Windows app).
 * These are DOM dialogs so every platform shows identical, branded UI.
 */
(function () {
  'use strict';

  var LOGO = '/icons/logo.png';
  var Z_INDEX = 2147483000;

  var styles = [
    '.gliimu-dialog-backdrop{position:fixed;inset:0;z-index:' + Z_INDEX + ';display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);opacity:0;transition:opacity 150ms cubic-bezier(.4,0,.2,1);}',
    '.gliimu-dialog-backdrop.is-open{opacity:1;}',
    '.gliimu-dialog{width:100%;max-width:400px;max-height:calc(100vh - 40px);display:flex;flex-direction:column;overflow:hidden;border-radius:1rem;background:#FFFFFF;border:1px solid #E2E8F0;box-shadow:0 20px 25px -5px rgba(15,23,42,.25),0 8px 10px -6px rgba(15,23,42,.15);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;transform:translateY(8px) scale(.97);transition:transform 150ms cubic-bezier(.4,0,.2,1);}',
    '.gliimu-dialog-backdrop.is-open .gliimu-dialog{transform:none;}',
    '.gliimu-dialog-head{display:flex;align-items:center;gap:10px;padding:16px 20px 12px;border-bottom:1px solid #E2E8F0;flex-shrink:0;}',
    '.gliimu-dialog-logo{width:26px;height:26px;object-fit:contain;flex-shrink:0;border-radius:6px;}',
    '.gliimu-dialog-brand{font-size:.9375rem;font-weight:700;letter-spacing:-.02em;color:#0F172A;}',
    '.gliimu-dialog-body{padding:20px;overflow-y:auto;-webkit-overflow-scrolling:touch;}',
    '.gliimu-dialog-msg{margin:0;font-size:.9375rem;line-height:1.6;font-weight:400;color:#0F172A;white-space:pre-wrap;word-break:break-word;}',
    '.gliimu-dialog-input{width:100%;margin-top:14px;padding:11px 13px;font-size:.9375rem;font-family:inherit;color:#0F172A;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:.5rem;outline:none;box-sizing:border-box;transition:border-color 150ms cubic-bezier(.4,0,.2,1),box-shadow 150ms cubic-bezier(.4,0,.2,1);}',
    '.gliimu-dialog-input:focus{border-color:#6366F1;box-shadow:0 0 0 3px rgba(99,102,241,.15);background:#FFFFFF;}',
    '.gliimu-dialog-foot{display:flex;gap:10px;padding:14px 20px 18px;flex-shrink:0;}',
    '.gliimu-dialog-btn{flex:1;padding:11px 16px;font-size:.875rem;font-weight:600;font-family:inherit;border-radius:.5rem;border:1px solid transparent;cursor:pointer;transition:background-color 150ms cubic-bezier(.4,0,.2,1),border-color 150ms cubic-bezier(.4,0,.2,1);}',
    '.gliimu-dialog-btn:focus-visible{outline:2px solid #6366F1;outline-offset:2px;}',
    '.gliimu-dialog-btn--ghost{background:#FFFFFF;border-color:#E2E8F0;color:#475569;}',
    '.gliimu-dialog-btn--ghost:hover{background:#F8FAFC;border-color:#CBD5E1;}',
    '.gliimu-dialog-btn--primary{background:#6366F1;color:#FFFFFF;}',
    '.gliimu-dialog-btn--primary:hover{background:#4F46E5;}',
    '.gliimu-dialog-btn--danger{background:#EF4444;color:#FFFFFF;}',
    '.gliimu-dialog-btn--danger:hover{background:#DC2626;}',
    '@media (prefers-color-scheme:dark){',
    '.gliimu-dialog{background:#111827;border-color:#1E293B;box-shadow:0 20px 25px -5px rgba(0,0,0,.5);}',
    '.gliimu-dialog-head{border-bottom-color:#1E293B;}',
    '.gliimu-dialog-brand,.gliimu-dialog-msg{color:#F8FAFC;}',
    '.gliimu-dialog-input{background:#1E293B;border-color:#1E293B;color:#F8FAFC;}',
    '.gliimu-dialog-input:focus{border-color:#818CF8;box-shadow:0 0 0 3px rgba(129,140,248,.2);background:#0A0F1E;}',
    '.gliimu-dialog-btn--ghost{background:#111827;border-color:#1E293B;color:#CBD5E1;}',
    '.gliimu-dialog-btn--ghost:hover{background:#1E293B;border-color:#334155;}',
    '.gliimu-dialog-btn--primary{background:#818CF8;color:#0F172A;}',
    '.gliimu-dialog-btn--primary:hover{background:#A5B4FC;}',
    '.gliimu-dialog-btn--danger{background:#F87171;color:#0F172A;}',
    '.gliimu-dialog-btn--danger:hover{background:#FCA5A5;}',
    '}'
  ].join('');

  // The app sets data-theme on <html> and ships explicit dark tokens; honour it
  // alongside the OS preference for pages that never set the attribute.
  var themeStyles = [
    '[data-theme="dark"] .gliimu-dialog{background:#111827;border-color:#1E293B;box-shadow:0 20px 25px -5px rgba(0,0,0,.5);}',
    '[data-theme="dark"] .gliimu-dialog-head{border-bottom-color:#1E293B;}',
    '[data-theme="dark"] .gliimu-dialog-brand,[data-theme="dark"] .gliimu-dialog-msg{color:#F8FAFC;}',
    '[data-theme="dark"] .gliimu-dialog-input{background:#1E293B;border-color:#1E293B;color:#F8FAFC;}',
    '[data-theme="dark"] .gliimu-dialog-input:focus{border-color:#818CF8;box-shadow:0 0 0 3px rgba(129,140,248,.2);background:#0A0F1E;}',
    '[data-theme="dark"] .gliimu-dialog-btn--ghost{background:#111827;border-color:#1E293B;color:#CBD5E1;}',
    '[data-theme="dark"] .gliimu-dialog-btn--ghost:hover{background:#1E293B;border-color:#334155;}',
    '[data-theme="dark"] .gliimu-dialog-btn--primary{background:#818CF8;color:#0F172A;}',
    '[data-theme="dark"] .gliimu-dialog-btn--primary:hover{background:#A5B4FC;}',
    '[data-theme="dark"] .gliimu-dialog-btn--danger{background:#F87171;color:#0F172A;}',
    '[data-theme="dark"] .gliimu-dialog-btn--danger:hover{background:#FCA5A5;}',
    '[data-theme="light"] .gliimu-dialog{background:#FFFFFF;border-color:#E2E8F0;}',
    '[data-theme="light"] .gliimu-dialog-msg{color:#0F172A;}',
    '[data-theme="light"] .gliimu-dialog-btn--primary{background:#6366F1;color:#FFFFFF;}'
  ].join('');

  var styleInjected = false;
  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    var el = document.createElement('style');
    el.setAttribute('data-gliimu-dialog', '');
    el.textContent = styles + themeStyles;
    (document.head || document.documentElement).appendChild(el);
  }

  var queue = Promise.resolve();
  var activeRestoreFocus = null;

  function open(options) {
    var run = queue.then(function () { return show(options); });
    queue = run.then(noop, noop);
    return run;
  }

  function noop() {}

  function show(options) {
    return new Promise(function (resolve) {
      injectStyles();

      var kind = options.kind;
      var opts = options.opts || {};

      var backdrop = document.createElement('div');
      backdrop.className = 'gliimu-dialog-backdrop';
      backdrop.setAttribute('role', 'presentation');

      var dialog = document.createElement('div');
      dialog.className = 'gliimu-dialog';
      dialog.setAttribute('role', kind === 'alert' ? 'alertdialog' : 'dialog');
      dialog.setAttribute('aria-modal', 'true');

      var focusables = [];

      var head = document.createElement('div');
      head.className = 'gliimu-dialog-head';

      var logo = document.createElement('img');
      logo.className = 'gliimu-dialog-logo';
      logo.src = LOGO;
      logo.alt = '';
      logo.addEventListener('error', function () { logo.remove(); });

      var brandEl = document.createElement('span');
      brandEl.className = 'gliimu-dialog-brand';
      brandEl.textContent = 'Gliimu';

      head.appendChild(logo);
      head.appendChild(brandEl);
      dialog.appendChild(head);

      var body = document.createElement('div');
      body.className = 'gliimu-dialog-body';

      var msg = document.createElement('p');
      msg.className = 'gliimu-dialog-msg';
      msg.id = 'gliimu-dialog-msg';
      // Messages interpolate user-supplied strings (post titles, display names).
      msg.textContent = options.message == null ? '' : String(options.message);
      dialog.setAttribute('aria-labelledby', 'gliimu-dialog-msg');
      body.appendChild(msg);

      var input = null;
      if (kind === 'prompt') {
        input = document.createElement('input');
        input.className = 'gliimu-dialog-input';
        input.type = opts.inputType || 'text';
        input.value = opts.defaultValue == null ? '' : String(opts.defaultValue);
        input.autocomplete = 'off';
        body.appendChild(input);
      }
      dialog.appendChild(body);

      var foot = document.createElement('div');
      foot.className = 'gliimu-dialog-foot';

      function makeButton(label, variant, value) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gliimu-dialog-btn gliimu-dialog-btn--' + variant;
        btn.textContent = label;
        btn.addEventListener('click', function () { finish(value); });
        foot.appendChild(btn);
        focusables.push(btn);
        return btn;
      }

      if (kind !== 'alert') {
        makeButton(opts.cancelText || 'Cancel', 'ghost', false);
      }
      var okBtn = makeButton(
        opts.okText || (kind === 'alert' ? 'OK' : 'Confirm'),
        opts.danger ? 'danger' : 'primary',
        true
      );

      dialog.appendChild(foot);
      backdrop.appendChild(dialog);
      (document.body || document.documentElement).appendChild(backdrop);

      activeRestoreFocus = document.activeElement;
      var previousOverflow = document.body ? document.body.style.overflow : '';
      if (document.body) document.body.style.overflow = 'hidden';

      var settled = false;
      function finish(confirmed) {
        if (settled) return;
        settled = true;
        var value = kind === 'alert' ? undefined : (kind === 'prompt' ? (confirmed ? input.value : null) : confirmed);
        document.removeEventListener('keydown', onKeydown, true);
        backdrop.classList.remove('is-open');
        if (document.body) document.body.style.overflow = previousOverflow;
        setTimeout(function () {
          backdrop.remove();
          if (activeRestoreFocus && typeof activeRestoreFocus.focus === 'function') {
            try { activeRestoreFocus.focus(); } catch (e) { /* element is gone */ }
          }
          activeRestoreFocus = null;
          resolve(value);
        }, 120);
      }

      function onKeydown(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
          return;
        }
        if (e.key === 'Enter' && kind === 'prompt' && document.activeElement === input) {
          e.preventDefault();
          finish(true);
          return;
        }
        if (e.key === 'Tab') {
          var list = (input ? [input] : []).concat(focusables);
          if (list.length === 0) return;
          var idx = list.indexOf(document.activeElement);
          e.preventDefault();
          var next = e.shiftKey
            ? list[(idx <= 0 ? list.length : idx) - 1]
            : list[(idx + 1) % list.length];
          next.focus();
        }
      }
      document.addEventListener('keydown', onKeydown, true);

      requestAnimationFrame(function () { backdrop.classList.add('is-open'); });

      setTimeout(function () {
        if (kind === 'prompt') { input.focus(); input.select(); }
        else { okBtn.focus(); }
      }, 30);
    });
  }

  function appAlert(message, opts) {
    return open({ kind: 'alert', message: message, opts: opts || {} });
  }

  function appConfirm(message, opts) {
    return open({ kind: 'confirm', message: message, opts: opts || {} });
  }

  function appPrompt(message, opts) {
    return open({ kind: 'prompt', message: message, opts: opts || {} });
  }

  window.appAlert = appAlert;
  window.appConfirm = appConfirm;
  window.appPrompt = appPrompt;

  window.alert = function (message) {
    // Fire-and-forget: alert() is blocking natively, but no caller here depends
    // on that. Queued, so bursts still show one dialog at a time.
    appAlert(message);
  };

  window.confirm = function () {
    console.warn('Gliimu: window.confirm is disabled. Use await appConfirm(message, options).');
    return false;
  };

  window.prompt = function () {
    console.warn('Gliimu: window.prompt is disabled. Use await appPrompt(message, options).');
    return null;
  };
})();
