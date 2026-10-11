// Injected into a background tab showing the member's profile. Drives
// LinkedIn's own UI: More → Block <name> → Block. LinkedIn's block also
// removes the connection, if there is one.
// Exposes window.__bomRunBlock(), which background.js calls and awaits.

(() => {
  const S = BOM_SELECTORS;
  const L = BOM_LABELS;

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
  // Block-O-Rama's own buttons, which can appear on the profile's posts.
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

  function moreButton() {
    return [...document.querySelectorAll(S.moreButton)].find(visible) || null;
  }

  function openMenu() {
    return [...document.querySelectorAll(S.menu)].find(visible) || null;
  }

  // Opens the profile's "More" menu and returns it.
  async function openMoreMenu() {
    for (let attempt = 0; attempt < 2; attempt++) {
      const more = moreButton();
      if (!more) throw new BlockError('Could not find the profile\'s "More" button.');
      click(more);
      const menu = await waitFor(openMenu, 4000);
      if (menu) return menu;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(300);
    }
    throw new BlockError('The profile\'s "More" menu did not open.');
  }

  // "Block" buttons already on the page before the menu item was clicked.
  // They aren't the confirmation, which LinkedIn adds afterwards.
  let preexisting = new Set();

  // The confirm button: labelled exactly "Block", in a dialog if LinkedIn
  // marks one, added after the menu item was clicked, and never a menu item.
  function confirmButton() {
    const dialogs = [...document.querySelectorAll(S.dialog)].filter(visible);
    const scopes = dialogs.length ? dialogs : [document];
    for (const scope of scopes) {
      const [el] = find(S.button, L.blockConfirm, scope).filter(
        (b) => !preexisting.has(b) && !b.closest(S.menu) && b.getAttribute('role') !== 'menuitem',
      );
      if (el) return el;
    }
    return null;
  }

  function memberName() {
    // "(3) Jane Doe | LinkedIn" -> "Jane Doe"
    return document.title
      .replace(/^\(\d+\+?\)\s*/, '')
      .replace(/\s*\|\s*LinkedIn\s*$/i, '')
      .trim();
  }

  window.__bomRunBlock = async () => {
    try {
      if (!/^\/in\//.test(location.pathname)) {
        throw new BlockError(
          `LinkedIn sent the tab to ${location.pathname} instead of the profile. Are you signed in?`,
        );
      }
      await waitFor(moreButton, 20000, 'the profile to load');

      const menu = await openMoreMenu();
      // Only connections get "Remove connection"; LinkedIn's block removes
      // it too, so this is only for reporting.
      const wasConnected = find(S.menuItem, L.removeConnectionItem, menu).length > 0;
      const [blockItem] = find(S.menuItem, L.blockMenuItem, menu);
      if (!blockItem) {
        throw new BlockError('The profile\'s "More" menu has no "Block" item. Is this your own profile?');
      }
      preexisting = new Set(document.querySelectorAll(S.button));
      click(blockItem);

      const confirm = await waitFor(confirmButton, 10000, 'the "Block" confirmation button');
      click(confirm);
      // Done once the confirmation is gone.
      await waitFor(() => !confirmButton(), 10000, 'LinkedIn to confirm the block');

      const slug = decodeURIComponent(location.pathname.split('/')[2] || '').toLowerCase();
      return { ok: true, name: memberName(), slug, removedConnection: wasConnected };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof BlockError ? err.message : `Unexpected error: ${err && err.message}`,
      };
    }
  };
})();
