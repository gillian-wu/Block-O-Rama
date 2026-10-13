// The block button, toasts and hiding, shared by every site's content script.

var BOM_UI = (() => {
  const BTN_CLASS = 'bom-block-btn';
  const HIDDEN_CLASS = 'bom-hidden';

  // A red X button. `onClick` gets the click event; data attributes on the
  // button (data-bom-slug, data-bom-name) say who it blocks.
  function makeButton(slug, name, label, onClick, busy) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BTN_CLASS;
    btn.dataset.bomSlug = slug;
    btn.dataset.bomName = name;
    btn.title = `${label} (Block-O-Rama)`;
    btn.setAttribute('aria-label', label);
    btn.innerHTML =
      '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
      '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
      '</svg>';
    btn.addEventListener('click', onClick, true);
    // The button can sit inside the author's link; keep presses from
    // reaching the site's handlers on it.
    for (const type of ['pointerdown', 'mousedown', 'mouseup']) {
      btn.addEventListener(type, (e) => e.stopPropagation());
    }
    if (busy) btn.classList.add('bom-busy');
    return btn;
  }

  // Hides every element marked as `slug`'s content, except the buttons.
  function hideMember(slug) {
    for (const el of document.querySelectorAll(`[data-bom-slug="${CSS.escape(slug)}"]`)) {
      if (el.classList.contains(BTN_CLASS)) continue;
      el.classList.add(HIDDEN_CLASS);
    }
  }

  function setButtons(slug, fn) {
    for (const b of document.querySelectorAll(`.${BTN_CLASS}[data-bom-slug="${CSS.escape(slug)}"]`)) {
      fn(b);
    }
  }

  function toast(message, isError) {
    const el = document.createElement('div');
    el.className = 'bom-toast' + (isError ? ' bom-toast-error' : '');
    el.setAttribute('role', 'status');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), isError ? 9000 : 4000);
  }

  // Asks background.js to block from a profile tab. After the extension is
  // reloaded or updated, this script stays on open pages but can no longer
  // reach it: chrome.runtime is gone, or sendMessage throws "Extension
  // context invalidated".
  async function sendToBackground(msg) {
    const stale = { ok: false, error: 'Block-O-Rama was updated or reloaded. Refresh this page and try again.' };
    if (!globalThis.chrome?.runtime?.id) return stale;
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (err) {
      const text = String((err && err.message) || err);
      return /context invalidated/i.test(text) ? stale : { ok: false, error: text };
    }
  }

  // Calls fn() whenever the page changes, at most once per frame.
  function observe(fn) {
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn();
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  return { BTN_CLASS, HIDDEN_CLASS, makeButton, hideMember, setButtons, toast, sendToBackground, observe };
})();
