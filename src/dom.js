// DOM helpers shared by the scripts that drive a site's own block menus
// (automation.js on LinkedIn, threads.js on Threads).

var BOM_DOM = (() => {
  class BlockError extends Error {}

  function visible(el) {
    if (!el || !el.isConnected || el.closest('[aria-hidden="true"]')) return false;
    if (el.getClientRects().length === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }

  function labelOf(el) {
    return (el.getAttribute('aria-label') || el.innerText || el.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Visible elements matching `selector` whose label matches `re`. Never
  // Block-O-Rama's own buttons.
  function find(selector, re, root = document) {
    return [...root.querySelectorAll(selector)].filter(
      (el) => !el.closest('.bom-block-btn') && visible(el) && re.test(labelOf(el)),
    );
  }

  // Resolves with fn()'s first truthy result, re-checking on DOM changes and
  // on a timer (background tabs throttle timers, so DOM changes do most of
  // the work). On timeout, rejects if `what` is given, else resolves null.
  function waitFor(fn, timeoutMs, what) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (err, value) => {
        if (done) return;
        done = true;
        observer.disconnect();
        clearInterval(interval);
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(value);
      };
      const check = () => {
        try {
          const v = fn();
          if (v) finish(null, v);
        } catch (err) {
          finish(err);
        }
      };
      const observer = new MutationObserver(check);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
      });
      const interval = setInterval(check, 250);
      const timer = setTimeout(
        () => finish(what ? new BlockError(`Timed out waiting for ${what}.`) : null, null),
        timeoutMs,
      );
      check();
    });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function click(el) {
    el.scrollIntoView({ block: 'center' });
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.click();
  }

  function pressEscape() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  return { BlockError, visible, labelOf, find, waitFor, sleep, click, pressEscape };
})();
