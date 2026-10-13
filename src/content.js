// Adds a red X block button next to the author of each post and comment on
// LinkedIn, and hides content from members already blocked.

(() => {
  const S = BOM_SELECTORS;
  const L = BOM_LABELS;
  const UI = BOM_UI;
  // Container -> its button, or false when it needs no button (company
  // author, own post). LinkedIn re-renders posts in place, which can drop the
  // button, so a container is revisited until its button is still attached.
  const handled = new WeakMap();
  // The same for author links in layouts without stable class names.
  const handledLinks = new WeakMap();
  const HIDDEN_CLASS = UI.HIDDEN_CLASS;

  let selfSlug = null;
  // Members blocked on this page, so their other posts and comments hide
  // too. Kept in memory only; Block-O-Rama stores nothing.
  const blocked = new Set();
  // Slugs with a block in flight, so every button for that member shows it.
  const pending = new Set();

  // Pulls the profile identifier out of a LinkedIn profile URL:
  //   https://www.linkedin.com/in/jane-doe-123/?miniProfileUrn=… -> jane-doe-123
  // Returns null for anything that isn't a member profile (companies,
  // schools, showcase pages, hashtags).
  function profileSlug(href) {
    if (!href) return null;
    let url;
    try {
      url = new URL(href, location.origin);
    } catch {
      return null;
    }
    if (!/(^|\.)linkedin\.com$/.test(url.hostname)) return null;
    const m = url.pathname.match(/^\/in\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]).toLowerCase() : null;
  }

  function findSelf() {
    if (selfSlug) return;
    for (const a of document.querySelectorAll(S.selfLink)) {
      const slug = profileSlug(a.getAttribute('href'));
      if (slug) {
        selfSlug = slug;
        return;
      }
    }
  }

  function memberName(link) {
    const hidden = link.querySelector('.visually-hidden');
    const raw =
      (hidden && hidden.textContent) ||
      link.getAttribute('aria-label') ||
      link.textContent ||
      '';
    // Actor links often read "Jane Doe • 2nd" or "View Jane Doe's profile".
    return raw
      .replace(/^View\s+/i, '')
      .replace(/[’']s\s+(graphic\s+link|profile).*$/i, '')
      .split(/\s*[•·]\s*/)[0]
      .replace(/\s+/g, ' ')
      .trim();
  }

  function makeButton(slug, name, profileUrl, connected) {
    const label = name ? `Block ${name}` : 'Block this member';
    const btn = UI.makeButton(slug, name, label, onClick, pending.has(slug));
    btn.dataset.bomUrl = profileUrl;
    if (connected) btn.dataset.bomConnected = 'true';
    return btn;
  }

  function attach(container, linkSelector, anchorSelector, scope) {
    const prev = handled.get(container);
    if (prev === false || (prev && container.contains(prev))) return;
    const root = scope || container;
    const link = root.querySelector(linkSelector);
    if (!link) return; // Not rendered yet; try again on the next mutation.

    const href = link.getAttribute('href');
    const slug = profileSlug(href);
    if (!slug) {
      handled.set(container, false); // Company or other non-member author.
      return;
    }
    container.dataset.bomSlug = slug;

    if (blocked.has(slug)) {
      container.classList.add(HIDDEN_CLASS);
      handled.set(container, false);
      return;
    }
    findSelf();
    if (slug === selfSlug) {
      handled.set(container, false);
      return;
    }

    const url = new URL(href, location.origin);
    const profileUrl = `${url.origin}/in/${url.pathname.split('/')[2]}/`;
    const btn = makeButton(slug, memberName(link), profileUrl, /(^|\W)1st(\W|$)/.test(link.textContent));

    const anchor = root.querySelector(anchorSelector);
    if (anchor) anchor.appendChild(btn);
    else link.insertAdjacentElement('afterend', btn);
    handled.set(container, btn);
  }

  // The element under `link` whose aria-label ends in a connection degree,
  // which marks the link as a post's or comment's author.
  function degreeLabel(link) {
    for (const el of [link, ...link.querySelectorAll('[aria-label]')]) {
      const label = el.getAttribute('aria-label');
      if (label && L.authorDegree.test(label.trim())) return el;
    }
    return null;
  }

  function labelName(label) {
    return label.trim().replace(L.authorDegree, '').replace(L.authorBadges, '').replace(/\s+/g, ' ').trim();
  }

  function scanAuthorLinks(root) {
    for (const link of root.querySelectorAll(S.memberLink)) {
      const prev = handledLinks.get(link);
      if (prev === false || (prev && link.contains(prev))) continue;
      if (link.closest(`${S.post},${S.comment}`)) continue; // Older layout; handled by attach().
      if (link.closest(S.commentNew)) continue; // Handled by scanComments().
      const labelEl = degreeLabel(link);
      const href = link.getAttribute('href');
      const slug = profileSlug(href);
      if (!labelEl || !slug) {
        // Not an author link (a name in a "Followed by" line, a mention), or
        // its label hasn't rendered yet.
        if (link.children.length) handledLinks.set(link, false);
        continue;
      }

      // The photo and the name each link to the author with the same label.
      // Give the list item one button, on the link whose label holds the
      // name line (<p>), and hide the item only for its first author, not
      // for someone merely mentioned inside it.
      const item = link.closest(S.listItem);
      let container = null;
      if (item) {
        const authorLinks = [...item.querySelectorAll(S.memberLink)].filter(degreeLabel);
        const sameAuthor = authorLinks.filter((a) => profileSlug(a.getAttribute('href')) === slug);
        const chosen = sameAuthor.find((a) => degreeLabel(a).querySelector('p')) || sameAuthor[0];
        if (link !== chosen) {
          handledLinks.set(link, false);
          continue;
        }
        if (profileSlug(authorLinks[0].getAttribute('href')) === slug) container = item;
      }
      if (container) container.dataset.bomSlug = slug;

      if (blocked.has(slug)) {
        if (container) container.classList.add(HIDDEN_CLASS);
        handledLinks.set(link, false);
        continue;
      }
      findSelf();
      if (slug === selfSlug) {
        handledLinks.set(link, false);
        continue;
      }

      const url = new URL(href, location.origin);
      const profileUrl = `${url.origin}/in/${url.pathname.split('/')[2]}/`;
      const label = labelEl.getAttribute('aria-label');
      const btn = makeButton(slug, labelName(label), profileUrl, /\s1st$/i.test(label.trim()));
      // The first <p> is the name line.
      (labelEl.querySelector('p') || labelEl).appendChild(btn);
      handledLinks.set(link, btn);
    }
  }

  // Comments in the newer layout. Their author links have no degree label;
  // the degree ("• 2nd") is only in the visible text.
  function scanComments(root) {
    for (const comment of root.querySelectorAll(S.commentNew)) {
      const prev = handled.get(comment);
      if (prev === false || (prev && comment.contains(prev))) continue;
      // The comment's own first profile link with text: not the photo, and
      // not one inside a reply.
      const link = [...comment.querySelectorAll(S.memberLink)].find(
        (a) => a.closest(S.commentNew) === comment && a.innerText.trim(),
      );
      if (!link) continue; // Not rendered yet.
      const href = link.getAttribute('href');
      const slug = profileSlug(href);
      if (!slug) {
        handled.set(comment, false);
        continue;
      }
      comment.dataset.bomSlug = slug;
      if (blocked.has(slug)) {
        comment.classList.add(HIDDEN_CLASS);
        handled.set(comment, false);
        continue;
      }
      findSelf();
      if (slug === selfSlug) {
        handled.set(comment, false);
        continue;
      }

      const nameEl = link.querySelector(S.commentName);
      const text = link.innerText.replace(/\s+/g, ' ').trim();
      const name = (nameEl && nameEl.textContent.trim()) || text.split(/\s*[•·]\s*/)[0];
      const url = new URL(href, location.origin);
      const profileUrl = `${url.origin}/in/${url.pathname.split('/')[2]}/`;
      const btn = makeButton(slug, name, profileUrl, /[•·]\s*1st\b/.test(text));
      (link.querySelector('p') || link).appendChild(btn);
      handled.set(comment, btn);
    }
  }

  function scan(root) {
    scanAuthorLinks(root);
    scanComments(root);
    for (const post of root.querySelectorAll(S.post)) {
      // Nested matches (an aggregate wrapping an activity) would double up.
      if (post.parentElement && post.parentElement.closest(S.post)) continue;
      const actor = post.querySelector(S.postActor);
      if (actor) attach(post, S.postActorLink, S.postActorAnchor, actor);
    }
    for (const comment of root.querySelectorAll(S.comment)) {
      attach(comment, S.commentAuthorLink, S.commentAnchor);
    }
  }

  // The signed-in member's numeric ID, looked up once per page.
  let selfIdPromise = null;
  function selfMemberId() {
    findSelf();
    if (!selfSlug) return Promise.reject(new Error('Could not find your own profile link on this page.'));
    selfIdPromise ??= BOM_DIRECT.memberId(selfSlug).catch((err) => {
      selfIdPromise = null;
      throw err;
    });
    return selfIdPromise;
  }

  // Sends LinkedIn's block request from this page; no profile tab.
  async function blockDirect(slug, name) {
    const [blockerId, blockeeId] = await Promise.all([selfMemberId(), BOM_DIRECT.memberId(slug)]);
    if (blockerId === blockeeId) throw new Error('That is your own profile.');
    await BOM_DIRECT.block({ blockeeId, blockerId, name });
  }

  async function onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    // Only the user's own clicks; never a script's el.click() on the page.
    if (!event.isTrusted) return;
    const btn = event.currentTarget;
    const { bomSlug: slug, bomUrl: url, bomName: name } = btn.dataset;
    if (pending.has(slug)) return;
    const who = name || slug;

    pending.add(slug);
    UI.setButtons(slug, (b) => b.classList.add('bom-busy'));
    UI.toast(`Blocking ${who}…`);

    let res;
    try {
      await blockDirect(slug, who);
      res = { ok: true, removedConnection: btn.dataset.bomConnected === 'true' };
    } catch (directErr) {
      // Fall back to opening the profile and using LinkedIn's menus.
      try {
        res = await chrome.runtime.sendMessage({ type: 'bom:block', url });
      } catch (err) {
        res = { ok: false, error: String((err && err.message) || err) };
      }
      if (res && !res.ok) res.error = `${res.error} (Direct block failed first: ${directErr.message})`;
    }
    pending.delete(slug);
    UI.setButtons(slug, (b) => b.classList.remove('bom-busy'));

    if (res && res.ok) {
      blocked.add(slug);
      if (res.slug) blocked.add(res.slug);
      UI.hideMember(slug);
      UI.toast(
        res.removedConnection
          ? `Blocked ${who} and removed them as a connection.`
          : `Blocked ${who}.`,
      );
    } else {
      UI.toast(`Couldn't block ${who}: ${(res && res.error) || 'unknown error'}`, true);
    }
  }

  scan(document);

  // LinkedIn is a single-page app that renders posts and comments lazily.
  UI.observe(() => scan(document));
})();
