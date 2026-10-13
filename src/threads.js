// Adds a red X block button next to the author of each post, reply and
// activity item on Threads, and on profile pages next to the name. A click
// drives Threads' own menu on the page: More → Block → Block.
//
// When the page has no post by that person with a menu (a quoted post, a
// profile with nothing loaded), background.js opens their profile in a tab
// and calls window.__bomThreadsBlock() there.

(() => {
  // Injected again into the profile tab the fallback opens; set up once.
  if (window.__bomThreadsBlock) return;

  const S = BOM_THREADS_SELECTORS;
  const L = BOM_THREADS_LABELS;
  const UI = BOM_UI;
  const { BlockError, visible, labelOf, find, waitFor, sleep, click, pressEscape } = BOM_DOM;

  // Container -> its button, or false when it needs no button. Threads
  // re-renders posts in place, which can drop the button, so a container is
  // revisited until its button is still attached.
  const handled = new WeakMap();

  let selfHandle = null;
  // People blocked on this page, so their other posts hide too. Kept in
  // memory only; Block-O-Rama stores nothing.
  const blocked = new Set();
  // Handles with a block in flight, so every button for them shows it.
  const pending = new Set();
  // Blocks run one at a time: two open menus would get in each other's way.
  let queue = Promise.resolve();

  // The username in a Threads URL, lowercased:
  //   https://www.threads.com/@jane.doe          -> jane.doe ('profile')
  //   https://www.threads.com/@jane.doe/post/Abc -> jane.doe ('post')
  function handleOf(href, kind) {
    if (!href) return null;
    let url;
    try {
      url = new URL(href, location.origin);
    } catch {
      return null;
    }
    if (!/(^|\.)threads\.com$/.test(url.hostname)) return null;
    const re = kind === 'post' ? /^\/@([\w.]+)\/post\// : /^\/@([\w.]+)\/?$/;
    const m = url.pathname.match(re);
    return m ? m[1].toLowerCase() : null;
  }

  function findSelf() {
    if (selfHandle) return;
    for (const a of document.querySelectorAll(S.selfLink)) {
      const handle = handleOf(a.getAttribute('href'), 'profile');
      if (handle) {
        selfHandle = handle;
        return;
      }
    }
  }

  // Elements matching `selector` that belong to `container` itself, not to
  // a post quoted inside it.
  function own(container, selector) {
    return [...container.querySelectorAll(selector)].filter((el) => el.closest(S.post) === container);
  }

  function moreButton(container) {
    return own(container, S.menuButton).find((b) => L.moreButton.test(labelOf(b))) || null;
  }

  // { handle, link, post } for the container's author, false for a
  // container that isn't a post (a follow suggestion), or null if it hasn't
  // rendered. `post` is false for activity items, which aren't posts.
  function authorOf(container) {
    const links = own(container, S.profileLink);
    const nameLinks = links.filter(
      (a) => handleOf(a.getAttribute('href'), 'profile') && a.textContent.trim(),
    );
    // A post's author is whoever its timestamp links to. This skips the
    // "name reposted" line, which names someone else.
    const permalink = links.find((a) => a.querySelector(S.time) && handleOf(a.getAttribute('href'), 'post'));
    if (permalink) {
      const handle = handleOf(permalink.getAttribute('href'), 'post');
      const link = nameLinks.find((a) => handleOf(a.getAttribute('href'), 'profile') === handle);
      return link ? { handle, link, post: true } : null;
    }
    // Activity items have no permalink; the first name is who acted.
    // Follow suggestions have neither a permalink nor a menu.
    if (moreButton(container)) {
      const link = nameLinks[0];
      return link ? { handle: handleOf(link.getAttribute('href'), 'profile'), link, post: false } : null;
    }
    return nameLinks.length ? false : null;
  }

  function makeButton(handle) {
    return UI.makeButton(handle, handle, `Block @${handle}`, onClick, pending.has(handle));
  }

  function scanPosts(root) {
    for (const container of root.querySelectorAll(S.post)) {
      const prev = handled.get(container);
      if (prev === false || (prev && container.contains(prev))) continue;
      const author = authorOf(container);
      if (author === null) continue; // Not rendered yet; try again on the next mutation.
      if (author === false) {
        handled.set(container, false);
        continue;
      }
      const { handle, link } = author;
      container.dataset.bomSlug = handle;
      if (blocked.has(handle)) {
        container.classList.add(UI.HIDDEN_CLASS);
        handled.set(container, false);
        continue;
      }
      findSelf();
      if (handle === selfHandle) {
        handled.set(container, false);
        continue;
      }
      const btn = makeButton(handle);
      link.insertAdjacentElement('afterend', btn);
      handled.set(container, btn);
    }
  }

  // The username shown next to a profile's display name.
  function profileHandle(name) {
    for (let el = name.parentElement, i = 0; el && i < 3; el = el.parentElement, i++) {
      const span = [...el.querySelectorAll(S.profileHandle)].find((s) => !name.contains(s) && !s.closest('a'));
      if (span) {
        const handle = span.textContent.trim().replace(/^@/, '').toLowerCase();
        return /^[\w.]+$/.test(handle) ? handle : null;
      }
    }
    return null;
  }

  // The name at the top of a profile page. The header itself never hides.
  function scanProfiles(root) {
    for (const name of root.querySelectorAll(S.profileName)) {
      const prev = handled.get(name);
      if (prev === false || (prev && name.contains(prev))) continue;
      const handle = profileHandle(name);
      if (!handle) continue;
      findSelf();
      if (handle === selfHandle) {
        handled.set(name, false);
        continue;
      }
      const btn = makeButton(handle);
      name.appendChild(btn);
      handled.set(name, btn);
    }
  }

  function scan(root) {
    scanPosts(root);
    scanProfiles(root);
  }

  // A post by `handle` with a "More" button, preferring `preferred`, then
  // posts over activity items.
  function postWithMenu(handle, preferred) {
    const candidates = [preferred, ...document.querySelectorAll(S.post)];
    let activity = null;
    for (const c of candidates) {
      if (!c || c.classList.contains(UI.HIDDEN_CLASS)) continue;
      const author = authorOf(c);
      const more = author && author.handle === handle && moreButton(c);
      if (!more || !visible(more)) continue;
      if (author.post) return c;
      activity ??= c;
    }
    return activity;
  }

  function openMenu() {
    return [...document.querySelectorAll(S.menu)].find(visible) || null;
  }

  async function openPostMenu(container) {
    for (let attempt = 0; attempt < 2; attempt++) {
      click(moreButton(container));
      const menu = await waitFor(openMenu, 4000);
      if (menu) return menu;
      pressEscape();
      await sleep(300);
    }
    throw new BlockError('The post\'s "More" menu did not open.');
  }

  // Does `text` name `handle` as a whole word ("Block jane.doe?")?
  function names(text, handle) {
    const escaped = handle.replace(/\./g, '\\.');
    return new RegExp(`(^|[^\\w.])@?${escaped}([^\\w.]|$)`, 'i').test(text);
  }

  // Blocks `handle` through the menu of `container`, one of their posts.
  async function blockFrom(container, handle) {
    const menu = await openPostMenu(container);
    const [item] = find(S.menuItem, L.blockMenuItem, menu);
    if (!item) {
      pressEscape();
      const err = new BlockError('The post\'s menu has no "Block" item. Are they already blocked?');
      err.noBlockItem = true;
      throw err;
    }
    // "Block" buttons already on the page aren't the confirmation.
    const preexisting = new Set(document.querySelectorAll(S.button));
    click(item);

    const confirmIn = (dialog) =>
      find(S.button, L.blockConfirm, dialog).find(
        (b) => !preexisting.has(b) && !b.closest(S.menu) && b.getAttribute('role') !== 'menuitem',
      );
    const dialog = await waitFor(
      () => [...document.querySelectorAll(S.dialog)].find((d) => visible(d) && confirmIn(d)),
      10000,
      'the "Block" confirmation',
    );
    // Confirm only if the dialog names the person the button is for.
    const title = dialog.querySelector(S.dialogTitle);
    if (!title || !names(title.textContent, handle)) {
      const [cancel] = find(S.button, L.cancel, dialog);
      if (cancel) click(cancel);
      else pressEscape();
      const shown = title ? `"${title.textContent.trim()}"` : 'a dialog without a name';
      throw new BlockError(`Threads showed ${shown} instead of @${handle}, so nothing was blocked.`);
    }
    const confirm = confirmIn(dialog);
    click(confirm);
    // Done once the confirmation is gone.
    await waitFor(() => !visible(confirm), 10000, 'Threads to confirm the block');
  }

  function message(err) {
    return err instanceof BlockError ? err.message : `Unexpected error: ${err && err.message}`;
  }

  // Called by background.js in the profile tab it opens.
  window.__bomThreadsBlock = async (handle) => {
    try {
      if (handleOf(location.href, 'profile') !== handle) {
        throw new BlockError(`Threads sent the tab to ${location.pathname} instead of the profile. Are you signed in?`);
      }
      const post = await waitFor(() => postWithMenu(handle), 20000, `a post by @${handle} on their profile`);
      await blockFrom(post, handle);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: message(err) };
    }
  };

  async function block(handle, btn) {
    const post = postWithMenu(handle, btn.closest(S.post));
    if (post) {
      try {
        await blockFrom(post, handle);
        return { ok: true };
      } catch (err) {
        // An activity item's menu may not offer "Block"; their profile will.
        if (!(err.noBlockItem && !authorOf(post).post)) return { ok: false, error: message(err) };
      }
    }
    // Nothing on this page to block from: use their profile.
    try {
      return await chrome.runtime.sendMessage({ type: 'bom:block-threads', handle });
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  async function onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    // Only the user's own clicks; never a script's el.click() on the page.
    if (!event.isTrusted) return;
    const btn = event.currentTarget;
    const handle = btn.dataset.bomSlug;
    if (pending.has(handle)) return;

    pending.add(handle);
    UI.setButtons(handle, (b) => b.classList.add('bom-busy'));
    UI.toast(`Blocking @${handle}…`);

    const job = queue.then(() => block(handle, btn));
    queue = job.catch(() => {});
    const res = await job;
    pending.delete(handle);
    UI.setButtons(handle, (b) => b.classList.remove('bom-busy'));

    if (res && res.ok) {
      blocked.add(handle);
      UI.hideMember(handle);
      UI.toast(`Blocked @${handle}.`);
    } else {
      UI.toast(`Couldn't block @${handle}: ${(res && res.error) || 'unknown error'}`, true);
    }
  }

  scan(document);
  // Threads is a single-page app that renders posts lazily.
  UI.observe(() => scan(document));
})();
