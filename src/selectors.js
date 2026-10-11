// Every LinkedIn-specific selector and label lives here.
// LinkedIn changes its markup often; when the extension stops finding posts,
// comments, or menu items, this is the file to update.
//
// Loaded both as a content script (feed pages) and injected into the
// background profile tab used to perform the block.

var BOM_SELECTORS = {
  // --- Feed / post / comment detection (content.js) ---

  // Containers for a single post in the feed, on profile activity pages,
  // and on single-post pages.
  post: [
    'div[data-urn^="urn:li:activity:"]',
    'div[data-id^="urn:li:activity:"]',
    'div[data-urn^="urn:li:aggregate:"]',
    'div[data-id^="urn:li:aggregate:"]',
    'div.feed-shared-update-v2',
  ].join(','),

  // Within a post: the block that names the post's author. Deliberately
  // excludes the "X likes this" / "X reposted this" header, which names a
  // different member.
  postActor: [
    '.update-components-actor__container',
    '.update-components-actor',
    '.feed-shared-actor',
  ].join(','),

  // Within an actor block: the link to the author's profile.
  postActorLink: [
    'a.update-components-actor__meta-link',
    'a.update-components-actor__image',
    'a.feed-shared-actor__container-link',
    'a[href*="/in/"]',
  ].join(','),

  // Where to place the button inside the actor block.
  postActorAnchor: [
    '.update-components-actor__title',
    '.update-components-actor__meta',
    '.feed-shared-actor__title',
  ].join(','),

  // Containers for a single comment or reply.
  comment: [
    'article.comments-comment-entity',
    'article.comments-comment-item',
    'article[data-id^="urn:li:comment:"]',
  ].join(','),

  // Within a comment: the commenter's profile link.
  commentAuthorLink: [
    'a.comments-comment-meta__description-container',
    'a.comments-post-meta__actor-link',
    'a.comments-comment-meta__image-link',
    'a.comments-post-meta__image-link',
  ].join(','),

  // Where to place the button inside a comment.
  commentAnchor: [
    '.comments-comment-meta__description',
    '.comments-post-meta__name',
    '.comments-comment-meta',
    '.comments-post-meta',
  ].join(','),

  // Newer layouts (seen October 2026) use generated class names that can't
  // be relied on. There, authors are found by role, link and label instead:
  // a profile link wrapping an element whose aria-label ends in a connection
  // degree (see BOM_LABELS.authorDegree), inside a role="listitem" (a post).
  memberLink: 'main a[href*="/in/"]',
  listItem: '[role="listitem"]',
  // A comment or reply. Replies sit inside their parent comment's element.
  // The commenter is the comment's first profile link that has text (the
  // photo link has none); their visible name is in span[aria-hidden].
  commentNew: [
    '[componentkey^="replaceableComment_urn:li:comment:"]',
    '[id^="replaceableComment_urn:li:comment:"]',
  ].join(','),
  commentName: 'span[aria-hidden="true"]',

  // Links that point at the signed-in member's own profile. The first match
  // in page order wins, and the left rail comes first.
  selfLink: [
    'a.feed-identity-module__actor-meta',
    '.feed-identity-module a[href*="/in/"]',
    '.profile-card-profile-link',
    '.global-nav__me-content a[href*="/in/"]',
    'aside a[href*="/in/"]',
  ].join(','),

  // --- Profile page automation (automation.js) ---

  // Layout seen October 2026: no <h1>; the "More" (…) button opens a
  // role="menu" whose items include "Block <first name>", which opens a
  // "Block member" dialog with Back / Block buttons.
  moreButton: [
    'main button[aria-label="More"]',
    'main button[aria-label="More actions"]',
  ].join(','),
  menu: '[role="menu"]',
  menuItem: '[role="menuitem"]',

  // Open modal dialogs.
  dialog: '[role="dialog"], [role="alertdialog"], .artdeco-modal',

  button: 'button, [role="button"]',
};

// Text labels, matched case-insensitively against visible text or
// aria-label. English only for now.
var BOM_LABELS = {
  // End of an author's aria-label: "Jane Doe Premium Profile 2nd".
  authorDegree: /\s(1st|2nd|3rd\+)$/i,
  // Badges between the name and the degree in that label.
  authorBadges: /(\s+(premium|verified|profile))+$/i,
  // Menu items in the profile's "More" menu.
  removeConnectionItem: /^remove connection$/i,
  blockMenuItem: /^block\b/i,
  // The "Block member" dialog's confirm button.
  blockConfirm: /^block$/i,
};
