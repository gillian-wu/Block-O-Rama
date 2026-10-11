// End-to-end test: loads the unpacked extension into Chromium and serves
// mock LinkedIn pages (test/fixtures) in place of www.linkedin.com.
//
// The mocks encode our assumptions about LinkedIn's markup. Passing here
// shows the extension works against those assumptions, not that LinkedIn's
// live markup still matches them.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import https from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (name) => readFileSync(path.join(root, 'test/fixtures', name), 'utf8');

const PROFILES = {
  'jane-doe': { name: 'Jane Doe', degree: '· 1st' },
  'bob-stranger': { name: 'Bob Stranger', degree: '· 3rd+' },
  'no-menu': { name: 'No Menu', degree: '· 2nd', breakMenu: true },
  'alex-example': { name: 'Alex Example', degree: '· 2nd' },
  'sam-speedy': { name: 'Sam Speedy', degree: '· 3rd' },
  // Members with a memberId can be blocked through the mock API; the rest
  // are unknown to it, so the extension falls back to the profile page.
  'me-myself': { name: 'Me Myself', degree: '', memberId: '1000' },
  'dana-direct': { name: 'Dana Direct', degree: '· 1st', memberId: '555' },
  'cara-commenter': { name: 'Cara Commenter', degree: '· 1st', memberId: '557' },
  'fran-fallback': { name: 'Fran Fallback', degree: '· 2nd', memberId: '556', apiRejects: true },
};

// How long the mock profile's slow image takes, standing in for the ads and
// trackers that keep LinkedIn pages loading after they're usable.
const SLOW_RESOURCE_MS = 8000;

const CSRF = 'ajax:1234567890';
// Block requests the mock API accepted.
const directBlocks = [];

let context;
let server;
let tmp;

// Answers for www.linkedin.com. Chromium is pointed at this server with
// --host-resolver-rules, so tabs the extension opens itself are covered too
// (Playwright's request routing doesn't reach those).
function serve(req, res) {
  const url = new URL(req.url, 'https://www.linkedin.com');
  const { pathname } = url;
  const html = (body) =>
    res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': `JSESSIONID="${CSRF}"; Path=/` }).end(body);
  const json = (status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));

  // Mock of LinkedIn's profile lookup and block request (see src/direct.js).
  if (pathname === '/voyager/api/identity/dash/profiles') {
    const slug = url.searchParams.get('memberIdentity');
    const p = PROFILES[slug];
    if (req.headers['csrf-token'] !== CSRF) return json(403, {});
    if (!p || !p.memberId) return json(404, {});
    return json(200, {
      data: {},
      included: [
        { publicIdentifier: 'someone-else', objectUrn: 'urn:li:member:999' },
        { publicIdentifier: slug, objectUrn: `urn:li:member:${p.memberId}` },
      ],
    });
  }
  if (pathname === '/flagship-web/rsc-action/actions/server-request') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const ok = req.method === 'POST' && req.headers['csrf-token'] === CSRF &&
        req.headers['content-type'] === 'application/json' &&
        url.searchParams.get('sduiid') === 'com.linkedin.sdui.requests.trustReporting.block';
      const payload = ok && JSON.parse(raw).serverRequest.requestedArguments.payload;
      const blockee = payload && Object.values(PROFILES).find((p) => p.memberId === payload.blockeeMemberUrn.memberId);
      if (!blockee || blockee.apiRejects) {
        return res.writeHead(200).end('0:{"response":{"$type":"proto.sdui.responses.ServerRequestResponse","errors":[{"message":"nope"}]}}');
      }
      directBlocks.push(payload);
      res.writeHead(200).end('1:[]\n0:{"states":[],"response":{"$type":"proto.sdui.responses.ServerRequestResponse","errors":[],"isRetryable":false}}');
    });
    return;
  }
  if (pathname === '/slow.png') {
    setTimeout(() => res.writeHead(204).end(), SLOW_RESOURCE_MS);
    return;
  }
  if (pathname.startsWith('/feed-2026')) return html(fixture('feed-2026.html'));
  if (pathname.startsWith('/feed')) return html(fixture('feed.html'));
  const m = pathname.match(/^\/in\/([^/]+)\/?$/);
  const p = m && PROFILES[m[1]];
  if (p) {
    let body = fixture('profile.html')
      .replaceAll('__NAME__', p.name)
      .replaceAll('__FIRST__', p.name.split(' ')[0])
      .replaceAll('__SLUG__', m[1])
      .replaceAll('__DEGREE__', p.degree);
    if (p.breakMenu) body = body.replace('aria-label="More"', '');
    return html(body);
  }
  res.writeHead(404).end('not found');
}

before(async () => {
  tmp = mkdtempSync(path.join(tmpdir(), 'bom-test-'));
  const key = path.join(tmp, 'key.pem');
  const cert = path.join(tmp, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=www.linkedin.com', '-keyout', key, '-out', cert,
  ], { stdio: 'ignore' });
  server = https.createServer({ key: readFileSync(key), cert: readFileSync(cert) }, serve);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();

  context = await chromium.launchPersistentContext(path.join(tmp, 'profile'), {
    channel: 'chromium',
    headless: !process.env.HEADED,
    ignoreHTTPSErrors: true,
    args: [
      `--disable-extensions-except=${root}`,
      `--load-extension=${root}`,
      `--host-resolver-rules=MAP www.linkedin.com:443 127.0.0.1:${port}`,
      '--ignore-certificate-errors',
      '--no-proxy-server',
    ],
  });
});

after(async () => {
  await context?.close();
  server?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const button = (page, container) => page.locator(`${container} .bom-block-btn`).first();
// Text of the first toast reporting an outcome (not "Blocking…").
async function outcome(page) {
  const toast = page.locator('.bom-toast').filter({ hasNotText: /^Blocking / }).first();
  await toast.waitFor({ timeout: 60000 });
  return toast.textContent();
}
const profileLog = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('log') || '[]'));

test('adds block buttons to members, not companies or yourself', async () => {
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed/');
  await button(page, '#post-jane').waitFor();
  await button(page, '#post-bob').waitFor(); // Rendered after load.

  assert.equal(await page.locator('#post-jane .update-components-actor__container .bom-block-btn').count(), 1);
  assert.equal(await page.locator('#post-jane .update-components-header .bom-block-btn').count(), 0);
  assert.equal(await page.locator('#comment-bob .bom-block-btn').count(), 1);
  assert.equal(await page.locator('#post-company .update-components-actor__container .bom-block-btn').count(), 0);
  assert.equal(await page.locator('#post-self .bom-block-btn').count(), 0);
  assert.equal(await button(page, '#post-jane').getAttribute('aria-label'), 'Block Jane Doe');
  await page.close();
});

test('blocks a connection (which removes the connection)', async () => {
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed/');
  await button(page, '#post-jane').click();
  assert.equal(await outcome(page), 'Blocked Jane Doe and removed them as a connection.');
  assert.deepEqual(await profileLog(page), ['blocked']);
  assert.equal(await page.locator('#post-jane').isHidden(), true);
  assert.ok(
    !context.pages().some((p) => p.url().includes('/in/jane-doe')),
    'profile tab should close on success',
  );
  await page.close();
});

test("starts blocking before the profile's slow resources finish", async () => {
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed-2026/');
  await page.evaluate(() => {
    document.querySelector('[data-testid="mainFeed"]').insertAdjacentHTML('beforeend', `
      <div role="listitem" id="item-sam">
        <a href="https://www.linkedin.com/in/sam-speedy/">
          <div aria-label="Sam Speedy 3rd+"><p>Sam Speedy</p></div>
        </a>
      </div>`);
  });
  const started = Date.now();
  await button(page, '#item-sam').click();
  assert.equal(await outcome(page), 'Blocked Sam Speedy.');
  const ms = Date.now() - started;
  assert.ok(ms < SLOW_RESOURCE_MS - 2000, `took ${ms} ms`);
  await page.close();
});

test('blocks a non-connection from a comment and hides all their content', async () => {
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed/');
  await button(page, '#post-bob').waitFor();
  await button(page, '#comment-bob').click();
  assert.equal(await outcome(page), 'Blocked Bob Stranger.');
  assert.deepEqual(await profileLog(page), ['blocked']);
  assert.equal(await page.locator('#comment-bob').isHidden(), true);
  assert.equal(await page.locator('#post-bob').isHidden(), true);
  await page.close();
});

test('remembers nothing across page loads', async () => {
  // Bob was blocked in an earlier test. Block-O-Rama keeps no record, so
  // after a reload his post is back (on LinkedIn, LinkedIn hides it itself).
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed/');
  await button(page, '#post-bob').waitFor();
  assert.equal(await page.locator('#post-bob').isVisible(), true);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'log'));
  assert.deepEqual(keys, [], 'nothing in the page\'s localStorage besides the mock profile\'s log');
  await page.close();
});

test('reports failure and leaves the profile open', async () => {
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed/');
  await page.evaluate(() => {
    document.querySelector('main').insertAdjacentHTML('beforeend', `
      <div data-id="urn:li:activity:9" id="post-nomenu">
        <div class="update-components-actor__container">
          <a class="update-components-actor__meta-link" href="/in/no-menu/">
            <span class="update-components-actor__title">No Menu</span>
          </a>
        </div>
      </div>`);
  });
  await button(page, '#post-nomenu').click();
  assert.match(await outcome(page), /^Couldn't block No Menu: Timed out waiting for the profile to load\. The profile is open/);
  assert.ok(context.pages().some((p) => p.url().includes('/in/no-menu/')));
  assert.equal(await page.locator('#post-nomenu').isVisible(), true);
  await page.close();
});

test('2026 layout: button only for the post author, not mentions, companies or yourself', async () => {
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed-2026/');
  const btn = button(page, '#item-alex');
  await btn.waitFor();
  assert.equal(await page.locator('#item-alex .bom-block-btn').count(), 1, 'one button per post');
  assert.equal(await page.locator('#item-alex p .bom-block-btn').count(), 1, 'on the name line');
  assert.equal(await btn.getAttribute('aria-label'), 'Block Alex Example');
  assert.equal(await btn.getAttribute('data-bom-slug'), 'alex-example');
  assert.equal(await page.locator('#item-company > a .bom-block-btn').count(), 0);
  assert.equal(await page.locator('#item-self .bom-block-btn').count(), 0);

  await btn.click();
  assert.equal(page.url(), 'https://www.linkedin.com/feed-2026/', 'clicking must not follow the profile link');
  assert.equal(await outcome(page), 'Blocked Alex Example.');
  assert.equal(await page.locator('#item-alex').isHidden(), true);
  assert.equal(await page.locator('#item-company').isVisible(), true);
  await page.close();
});

async function addPost(page, slug, name, degree) {
  await page.evaluate(([slug, name, degree]) => {
    document.querySelector('[data-testid="mainFeed"]').insertAdjacentHTML('beforeend', `
      <div role="listitem" id="item-${slug}">
        <a href="https://www.linkedin.com/in/${slug}/">
          <div aria-label="${name} Verified Profile ${degree}"><p>${name}</p></div>
        </a>
      </div>`);
  }, [slug, name, degree]);
}

test('blocks directly through LinkedIn\'s API, without opening a tab', async () => {
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed-2026/');
  await addPost(page, 'dana-direct', 'Dana Direct', '1st');
  const opened = [];
  const onPage = (p) => opened.push(p);
  context.on('page', onPage);
  const started = Date.now();
  await button(page, '#item-dana-direct').click();
  assert.equal(await outcome(page), 'Blocked Dana Direct and removed them as a connection.');
  const ms = Date.now() - started;
  context.off('page', onPage);

  assert.equal(opened.length, 0, 'no tab should open');
  assert.ok(ms < 2000, `took ${ms} ms`);
  const sent = directBlocks.at(-1);
  assert.deepEqual(sent.blockeeMemberUrn, { memberId: '555' });
  assert.deepEqual(sent.blockerMemberUrn, { memberId: '1000' });
  assert.equal(sent.blockeeName, 'Dana Direct');
  assert.match(sent.workflowId, /^BLOCKING_WORKFLOW_[0-9a-f-]{36}$/);
  assert.equal(await page.locator('#item-dana-direct').isHidden(), true);
  await page.close();
});

test('falls back to the profile page when LinkedIn rejects the direct request', async () => {
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed-2026/');
  await addPost(page, 'fran-fallback', 'Fran Fallback', '2nd');
  await button(page, '#item-fran-fallback').click();
  assert.equal(await outcome(page), 'Blocked Fran Fallback.');
  assert.deepEqual(await profileLog(page), ['blocked']);
  assert.ok(!directBlocks.some((b) => b.blockeeName === 'Fran Fallback'));
  await page.close();
});

test('2026 layout: blocks commenters, each comment and reply with its own button', async () => {
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed-2026/');
  const cara = page.getByRole('button', { name: 'Block Cara Commenter' });
  const rex = page.getByRole('button', { name: 'Block Rex Replier' });
  await cara.waitFor();
  await rex.waitFor();
  assert.equal(await cara.count(), 1, 'one button for the comment, none for its photo or mention');
  assert.equal(await cara.getAttribute('aria-label'), 'Block Cara Commenter');
  assert.equal(await rex.getAttribute('aria-label'), 'Block Rex Replier');
  assert.equal(await page.locator('.comment-cara-commenter .bom-block-btn').count(), 2, "Cara's and Rex's only");
  assert.equal(await page.locator('#item-company > a .bom-block-btn').count(), 0);
  assert.equal(await page.locator('[data-bom-slug="mentioned-person"]').count(), 0);

  await cara.click();
  assert.equal(await outcome(page), 'Blocked Cara Commenter and removed them as a connection.');
  assert.deepEqual(directBlocks.at(-1).blockeeMemberUrn, { memberId: '557' });
  assert.equal(await page.locator('.comment-cara-commenter').isHidden(), true);
  assert.equal(await page.locator('#item-company').isVisible(), true, 'the post stays');
  await page.close();
});

test('has no access to browser storage', async () => {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  assert.equal(await worker.evaluate(() => typeof globalThis.chrome.storage), 'undefined');
});
