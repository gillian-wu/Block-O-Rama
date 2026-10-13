// Receives block requests from content.js (LinkedIn) and threads.js, opens
// the person's profile in a tab, and blocks them there with the site's own
// menus. Requests run one at a time.
//
// The tab opens in front: LinkedIn doesn't render a profile's buttons in a
// background tab, so there would be nothing to click.

const PROFILE_LOAD_TIMEOUT_MS = 30000;

let queue = Promise.resolve();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const run = msg && { 'bom:block': blockMember, 'bom:block-threads': blockThreadsUser }[msg.type];
  if (!run) return false;
  const job = queue.then(() => run(msg, sender.tab));
  queue = job.catch(() => {});
  job.then(sendResponse, (err) => sendResponse({ ok: false, error: String(err && err.message) }));
  return true; // Responds asynchronously.
});

function isProfileUrl(url) {
  try {
    const u = new URL(url);
    return u.origin === 'https://www.linkedin.com' && /^\/in\/[^/]+\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

// Resolves once the tab has parsed a page on `origin` (DOMContentLoaded).
// Waiting for Chrome's "complete" status instead costs seconds: LinkedIn
// keeps loading ads and trackers long after the page is usable, and the
// injected scripts wait for the buttons they need on their own.
async function waitForPage(tabId, origin) {
  const deadline = Date.now() + PROFILE_LOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const [probe] = await chrome.scripting.executeScript({
        target: { tabId },
        injectImmediately: true,
        func: () => ({ href: location.href, state: document.readyState }),
      });
      const page = probe && probe.result;
      if (page && page.state !== 'loading' && page.href.startsWith(`${origin}/`)) return;
    } catch (err) {
      const message = String((err && err.message) || err);
      if (/no tab with id/i.test(message)) throw new Error('The profile tab was closed.', { cause: err });
      if (/error page/i.test(message)) throw new Error("The profile didn't load. Check your connection.", { cause: err });
      // Otherwise the tab is still on about:blank; keep waiting.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('The profile took too long to load.');
}

async function blockMember({ url }, senderTab) {
  if (!isProfileUrl(url)) return { ok: false, error: 'Not a LinkedIn member profile.' };
  return blockInTab(url, senderTab, 'https://www.linkedin.com', ['src/selectors.js', 'src/dom.js', 'src/automation.js'], () =>
    window.__bomRunBlock(),
  );
}

async function blockThreadsUser({ handle }, senderTab) {
  if (typeof handle !== 'string' || !/^[\w.]{1,30}$/.test(handle)) {
    return { ok: false, error: 'Not a Threads username.' };
  }
  return blockInTab(
    `https://www.threads.com/@${handle}`,
    senderTab,
    'https://www.threads.com',
    ['src/dom.js', 'src/ui.js', 'src/threads-selectors.js', 'src/threads.js'],
    (h) => window.__bomThreadsBlock(h),
    [handle.toLowerCase()],
  );
}

// Opens `url` next to the sender's tab, injects `files`, and returns what
// `func(...args)` resolves to there.
async function blockInTab(url, senderTab, origin, files, func, args = []) {
  const tab = await chrome.tabs.create({
    url,
    active: true,
    ...(senderTab ? { windowId: senderTab.windowId, index: senderTab.index + 1 } : {}),
  });

  let result;
  try {
    await waitForPage(tab.id, origin);
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, injectImmediately: true, files });
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      injectImmediately: true,
      func,
      args,
    });
    result = (injection && injection.result) || { ok: false, error: 'No result from the profile tab.' };
  } catch (err) {
    result = { ok: false, error: String((err && err.message) || err) };
  }

  if (result.ok) {
    if (senderTab) await chrome.tabs.update(senderTab.id, { active: true }).catch(() => {});
    await chrome.tabs.remove(tab.id).catch(() => {});
  } else {
    // Leave the tab open and in front so the person can be blocked
    // by hand, and the failure is visible.
    await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    const sentence = /[.?!]$/.test(result.error) ? result.error : `${result.error}.`;
    result.error = `${sentence} The profile is open in a new tab so you can finish by hand.`;
  }
  return result;
}
