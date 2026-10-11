# Block-O-Rama

An extension for Chrome that lets you block LinkedIn profiles with one click.

When you're signed in to LinkedIn, a red ✕ button appears next to the author of every post and comment. Click it and Block-O-Rama blocks that member. If they're a connection, LinkedIn's block removes the connection too.

Their posts and comments disappear from the page right away, along with replies under their comments. After that, LinkedIn itself stops showing you their content.

## Install (developer mode)

1. Clone or download this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the repository folder.
4. Open or reload [linkedin.com](https://www.linkedin.com/feed/).

## How it works

LinkedIn has no public API for blocking. Block-O-Rama sends the same requests LinkedIn's own pages send, and falls back to clicking through LinkedIn's interface if that fails:

1. `src/content.js` finds post and comment authors and adds the button. Company pages and your own posts don't get one.
2. On click, `src/direct.js` looks up the member's numeric ID (and yours, once per page), then sends the request LinkedIn's "Block member" dialog sends. No tab opens. These endpoints are undocumented and were captured from the site in October 2026.
3. If that fails, `src/background.js` opens the member's profile in a new tab, in front because LinkedIn doesn't draw a profile's buttons in a background tab. `src/automation.js` then clicks **More → Block *name*** and confirms **Block**. Stay on the tab until it closes.
4. On success, the member's posts and comments on the page disappear.
5. If both fail, the profile stays open so you can finish by hand, and a message says what went wrong.

Blocks run one at a time. Clicking several buttons quickly queues them.

## Privacy

Block-O-Rama collects nothing and stores nothing. The full policy is in [PRIVACY.md](PRIVACY.md). It has no server, no analytics and no third-party code, and it doesn't use browser storage.

- It reads the names and profile links of post and comment authors on linkedin.com to place its buttons. This stays in your browser.
- When you click a button, it sends requests only to linkedin.com, over HTTPS, with your existing LinkedIn session: one to look up member IDs, one to block. It reads LinkedIn's `JSESSIONID` cookie to send as the CSRF token LinkedIn's own pages send.
- Members blocked on the current page are kept in memory until you leave or reload it.

## Permissions

- **`https://www.linkedin.com/*`**: to add the buttons on LinkedIn and send the block request.
- **`scripting`**: for the fallback, to run the block steps in the profile tab it opens.

To unblock someone, use LinkedIn's [blocking settings](https://www.linkedin.com/mypreferences/d/blocking).

## Limitations

- **LinkedIn changes things.** Every selector and button label the extension relies on is in [`src/selectors.js`](src/selectors.js); the block request is in [`src/direct.js`](src/direct.js). If buttons stop appearing or blocks start failing, start there.
- **English only.** Menu items are matched by their English labels ("Block", "Remove connection").
- **LinkedIn's terms.** LinkedIn's User Agreement restricts browser extensions that automate activity on its site. Each block here starts from your own click and performs one action you could do by hand, but it does so by calling LinkedIn's internal endpoints directly. Use it at your own risk.

## Development

```sh
npm install
npm test              # end-to-end tests in headless Chromium
npm run test:headed   # same, with a virtual display (needs xvfb-run); background tabs behave as on a desktop
npm run lint
```

The tests load the unpacked extension into Chromium and point `www.linkedin.com` at a local server. That server serves mock pages from `test/fixtures/`. The mocks reflect our understanding of LinkedIn's markup, so passing tests don't prove the extension works against the live site.

## License

[MIT](LICENSE)
