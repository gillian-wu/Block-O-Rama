# Block-O-Rama Privacy Policy

Effective date: October 13, 2026

Block-O-Rama is a Chrome extension that adds a block button to posts and comments on LinkedIn and Threads. This policy explains what information the extension accesses and what it does with it. The maker of Block-O-Rama does not want your data. At all. She wouldn't even know what to do with it.

## Summary

Block-O-Rama does not collect, store, sell or share any data. It has no servers, no analytics and no third-party code. Nothing leaves your browser except the requests it sends to LinkedIn when you click its block button. On Threads, it sends no requests of its own.

## Information the extension accesses

**Page content.** On linkedin.com and threads.com, the extension reads the names and profile links of the people who wrote the posts and comments on the page, so it can place a block button next to each one. This happens only in your browser.

**Your LinkedIn session.** When you click a block button, the extension sends requests to LinkedIn on your behalf, as LinkedIn's own pages do. To do so, it reads LinkedIn's session cookie (`JSESSIONID`) and sends its value back to LinkedIn as a security token. It is never sent anywhere else.

On Threads, the extension reads no cookies and no session information.

## How the information is used

The extension uses this information for one purpose: to block the person you choose.

On LinkedIn, when you click a block button, it:

1. asks LinkedIn for the numeric member ID of that person and of you, and
2. sends LinkedIn's block request for that person.

If that fails, it opens the person's LinkedIn profile in a new tab and uses LinkedIn's own block menu there.

All of these requests go only to linkedin.com, over HTTPS.

On Threads, when you click a block button, it opens that post's menu on Threads and clicks Threads' own Block and confirm buttons. Threads' page sends its own block request, as it does when you click those buttons yourself. If the page has no post by that person with a menu, the extension opens their Threads profile in a new tab and does the same there.

## Storage

The extension stores nothing. It does not use browser storage, cookies of its own, or any other way of saving information. To hide a blocked person's other posts on the page you're viewing, it keeps their profile link or username in memory, and that's discarded when you leave or reload the page.

## Sharing

The extension does not share, sell or transfer any information to anyone. The only party it communicates with is LinkedIn, to carry out the block you asked for. On Threads, it communicates with no one; Threads' own page carries out the block. Each site's handling of your account and of the block is governed by its own policy: [LinkedIn's Privacy Policy](https://www.linkedin.com/legal/privacy-policy) and the Threads Privacy Policy.

## Permissions

- **Access to www.linkedin.com:** to add the block buttons and send the block request.
- **Access to www.threads.com:** to add the block buttons and use Threads' block menu.
- **Scripting:** to run the block steps in a profile tab: on LinkedIn if the direct block fails, on Threads if the page has no post with a menu to block from.

## Limited Use

Block-O-Rama's use of information it accesses complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/policies), including the Limited Use requirements.

## Changes to this policy

If this policy changes, the updated version will be published at this address with a new effective date.

## Contact

Questions about this policy can be raised as an issue at [github.com/gillian-wu/Block-O-Rama/issues](https://github.com/gillian-wu/Block-O-Rama/issues).
